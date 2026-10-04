// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { validateManifest, publicationFiles, workingTreeFiles } from '../scripts/collections.mjs';
import { assetFiles } from '../scripts/upload-assets.mjs';
import { checkCollections } from '../scripts/check-collections.mjs';

const expected = [
  '5x10-hurdle-multigp',
  'MultiGP-2017-Airgate-left-panel-regular-50-percent',
  'MultiGP-2017-Airgate-right-panel-regular-50-percent',
  'MultiGP-2017-Airgate-top-regular-50-percent',
  'MultiGP-2017-Airgate-top-red-50-percent',
  'feather-banners-cobranded-multigp',
  'feather-banners-cobranded-multigp-back',
  'feather-banners-cobranded-multigp-back-double-sided',
  'large-side-panel-multigp', 'large-top-multigp', 'large-top-red-multigp',
];

test('all migrated runtime textures decode and have matching maintenance PNGs', async () => {
  const files = await readdir('collections/multigp/textures');
  assert.deepEqual(files.filter(file => file.endsWith('.webp')).sort(), expected.map(name => `${name}.webp`).sort());
  for (const name of expected) {
    const png = sharp(await readFile(`collections/multigp/textures/${name}.png`));
    const webp = sharp(await readFile(`collections/multigp/textures/${name}.webp`));
    const a = await png.metadata();
    const b = await webp.metadata();
    assert.equal(b.format, 'webp');
    assert.equal(b.width, a.width);
    assert.equal(b.height, a.height);
    assert.ok(b.width <= 2048);
    await webp.raw().toBuffer();
  }
});

test('stable URLs use committed HEAD bytes and exclude maintenance files', async () => {
  const original = process.cwd();
  const directory = mkdtempSync(path.join(tmpdir(), 'obstacles-upload-test-'));
  const webp = background => sharp({ create: { width: 128, height: 64, channels: 3, background } }).webp({ lossless: true }).toBuffer();
  const [committedBytes, updatedBytes] = await Promise.all([webp('#ff0000'), webp('#0000ff')]);
  const manifest = fixtureManifest();
  manifest.textures[0] = { id: 'hurdle', name: 'Hurdle', template: 'hurdle-v1', panels: { front: 'textures/gate.webp' } };
  const commit = message => {
    execFileSync('git', ['add', '.']);
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message]);
  };
  try {
    process.chdir(directory);
    execFileSync('git', ['init', '--quiet']);
    mkdirSync('collections/multigp/textures', { recursive: true });
    writeFileSync('collections/multigp/textures/gate.webp', committedBytes);
    writeFileSync('collections/multigp/textures/gate.png', 'maintenance');
    writeFileSync('collections/multigp/manifest.json', JSON.stringify(manifest));
    commit('fixture');
    writeFileSync('collections/multigp/textures/gate.webp', updatedBytes);
    const files = await assetFiles();
    assert.equal(files.length, 3);
    assert.equal(files[0].key, 'multigp/gate.webp');
    assert.ok(files[0].bytes.equals(committedBytes));
    commit('updated texture');
    const updated = await assetFiles();
    assert.equal(updated[0].key, files[0].key);
    assert.ok(updated[0].bytes.equals(updatedBytes));
    mkdirSync('node_modules/wrangler/bin', { recursive: true });
    writeFileSync('node_modules/wrangler/bin/wrangler.js', `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.appendFileSync('uploaded.jsonl', JSON.stringify({
        args, bytes: fs.readFileSync(args[args.indexOf('--file') + 1]).toString('base64')
      }) + '\\n');
    `);
    const script = new URL('../scripts/upload-assets.mjs', import.meta.url).pathname;
    execFileSync(process.execPath, [script], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'test-account' },
    });
    const uploads = readFileSync('uploaded.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const uploaded = uploads[0];
    assert.equal(uploads.length, 3);
    assert.ok(uploads[1].args.includes('trackdraw-obstacles/multigp/manifest.json'));
    assert.ok(uploads[2].args.includes('trackdraw-obstacles/collections.json'));
    assert.ok(uploads[2].args.includes('application/json'));
    assert.ok(uploads.every(upload => upload.args[2] === 'put'));
    assert.ok(uploaded.args.includes('trackdraw-obstacles/multigp/gate.webp'));
    assert.equal(uploaded.args[uploaded.args.indexOf('--cache-control') + 1], 'public, max-age=300, must-revalidate');
    assert.ok(Buffer.from(uploaded.bytes, 'base64').equals(updatedBytes));
    execFileSync(process.execPath, [script, '--dry-run'], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: '' },
    });
    assert.throws(() => execFileSync(process.execPath, [script], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: '' }, stdio: 'pipe',
    }), /Set CLOUDFLARE_ACCOUNT_ID/);
    writeFileSync('node_modules/wrangler/bin/wrangler.js', 'process.exit(1)');
    assert.throws(() => execFileSync(process.execPath, [script], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'test-account' }, stdio: 'pipe',
    }));
    // A file that only claims to be WebP never reaches the bucket.
    writeFileSync('collections/multigp/textures/gate.webp', 'not an image');
    commit('broken texture');
    assert.throws(() => execFileSync(process.execPath, [script, '--dry-run'], { stdio: 'pipe' }), /cannot decode image/);
  } finally {
    process.chdir(original);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('public verification checks bytes and response headers', async () => {
  const { verifyAssets } = await import('../scripts/verify-assets.mjs');
  const files = [{ key: 'multigp/gate.webp', bytes: Buffer.from('texture') }];
  const headers = {
    'content-type': 'image/webp',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=300, must-revalidate',
  };
  await verifyAssets(files, async (url, options) => {
    assert.match(url, /gate.webp\?verify=[a-f0-9]{64}$/);
    assert.equal(options.headers.Origin, 'https://trackdraw.app');
    return new Response('texture', { headers });
  });
  await assert.rejects(verifyAssets(files, async () => new Response('wrong bytes', { headers })));
  await assert.rejects(verifyAssets(files, async () => new Response('texture')));
  await assert.rejects(verifyAssets(files, async () => new Response(null, { status: 404 })));
});


test('public verification rejects CDN cache overrides with an actionable error', async () => {
  const { verifyAssets } = await import('../scripts/verify-assets.mjs');
  const files = [{ key: 'multigp/gate.webp', bytes: Buffer.from('texture') }];
  await assert.rejects(verifyAssets(files, async () => new Response('texture', {
    headers: {
      'content-type': 'image/webp',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=14400, must-revalidate',
    },
  })), /Cloudflare Browser TTL to Respect origin/);
});

test('public verification rejects missing CORS and failed requests', async () => {
  const { verifyAssets } = await import('../scripts/verify-assets.mjs');
  const files = [{ key: 'multigp/gate.webp', bytes: Buffer.from('texture') }];
  await assert.rejects(verifyAssets(files, async () => new Response('texture', {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=300, must-revalidate',
    },
  })), /multigp\/gate.webp/);
  await assert.rejects(verifyAssets(files, async () => { throw new Error('network unavailable'); }), /network unavailable/);
});

function fixtureManifest() {
  return { schemaVersion: 1, id: 'multigp', name: 'Test', status: 'published', author: 'Test', attribution: 'Original fixture', usage: { terms: 'Test only', portable: 'not-granted' }, textures: [{ id: 'gate', name: 'Gate', template: 'gate-standard-v1', panels: { left: 'textures/gate.webp', right: 'textures/gate.webp', top: 'textures/gate.webp' } }] };
}

test('both collections validate and publication preserves every historical texture URL', async () => {
  const { published: result } = await checkCollections(workingTreeFiles(), file => readFileSync(file));
  const runtime = result.filter(file => file.contentType === 'image/webp');
  assert.deepEqual(runtime.map(file => file.key).sort(), expected.map(name => `multigp/${name}.webp`).sort());
  assert.ok(!result.some(file => file.key.startsWith('dds/')));
  assert.deepEqual(JSON.parse(result.at(-1).bytes).collections, [{ id: 'multigp', name: 'MultiGP', manifest: '/multigp/manifest.json' }]);
  const manifest = JSON.parse(result.find(file => file.key === 'multigp/manifest.json').bytes);
  assert.equal(manifest.textures[0].panels.left, '/multigp/MultiGP-2017-Airgate-left-panel-regular-50-percent.webp');
  const { verifyAssets } = await import('../scripts/verify-assets.mjs');
  await verifyAssets(result.filter(file => file.contentType === 'application/json'), async url => {
    const file = result.find(file => new URL(url).pathname === `/${file.key}`);
    return new Response(file.bytes, { headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300, must-revalidate' } });
  });
});

test('invalid collection contracts fail with actionable errors before publication', () => {
  const files = new Set(['collections/multigp/textures/gate.webp']);
  const cases = [
    [m => m.schemaVersion = 2, /unsupported schemaVersion/],
    [m => m.id = 'other', /directory slug/],
    [m => m.textures.push(structuredClone(m.textures[0])), /duplicate texture id/],
    [m => m.textures[0].template = 'unknown-v1', /unsupported template/],
    [m => delete m.textures[0].panels.top, /missing top/],
    [m => m.textures[0].panels.extra = 'textures/gate.webp', /unknown field extra/],
    [m => m.textures[0].panels.top = '../other/gate.webp', /unsafe or invalid/],
    [m => m.textures[0].panels.top = 'textures/missing.webp', /missing panel file/],
    [m => m.usage.portable = true, /usage.portable/],
    [m => m.author = '', /non-empty string/],
    [m => m.textures[0].backColor = 'navy', /#rrggbb/],
    [m => { m.textures[0].template = 'hurdle-v1'; m.textures[0].panels = { front: 'textures/gate.webp' }; m.textures[0].backColor = '#000000'; }, /not supported for hurdle-v1/],
  ];
  for (const [change, error] of cases) {
    const manifest = fixtureManifest(); change(manifest);
    assert.throws(() => validateManifest(manifest, 'multigp', files), error);
  }
  assert.throws(() => publicationFiles(['collections/multigp/manifest.json'], () => Buffer.from('{')), /invalid JSON/);
  const withBack = fixtureManifest(); withBack.textures[0].backColor = '#141c28';
  assert.equal(validateManifest(withBack, 'multigp', files).textures[0].backColor, '#141c28');
});

test('DDS pilot texture set is generated from its sheet and stays unpublished', async () => {
  const { view } = await checkCollections(workingTreeFiles(), file => readFileSync(file));
  const manifest = JSON.parse(view.read('collections/dds/manifest.json'));
  assert.equal(manifest.status, 'example');
  assert.deepEqual(manifest.textures.map(({ id, name, template, backColor }) => ({ id, name, template, backColor })),
    [{ id: 'standard-gate', name: 'Standard gate', template: 'gate-standard-v1', backColor: '#141c28' }]);
  for (const file of Object.values(manifest.textures[0].panels)) {
    assert.equal((await sharp(view.read(`collections/dds/${file}`)).metadata()).format, 'webp');
  }
  assert.ok(!(await readdir('collections/dds')).includes('textures'), 'generated textures are never committed');
});

test('publication rejects orphan textures and validates examples before excluding them', () => {
  const manifest = fixtureManifest();
  const files = ['collections/multigp/manifest.json', 'collections/multigp/textures/gate.webp', 'collections/orphan/textures/gate.webp'];
  const read = () => Buffer.from(JSON.stringify(manifest));
  assert.throws(() => publicationFiles(files, read), /missing manifest.json/);
  manifest.status = 'example';
  manifest.textures[0].panels.top = 'textures/missing.webp';
  assert.throws(() => publicationFiles(files.slice(0, 2), read), /missing panel file/);
});

test('publishing from a build directory uploads only checked files in a safe order', async () => {
  const { builtFiles } = await import('../scripts/upload-assets.mjs');
  const directory = mkdtempSync(path.join(tmpdir(), 'obstacles-build-'));
  try {
    mkdirSync(path.join(directory, 'club'));
    writeFileSync(path.join(directory, 'collections.json'), '{}');
    writeFileSync(path.join(directory, 'club/manifest.json'), '{}');
    writeFileSync(path.join(directory, 'club/gate-left.webp'), 'webp');
    assert.deepEqual(builtFiles(directory).map(({ key, contentType }) => [key, contentType]), [
      ['club/gate-left.webp', 'image/webp'], ['club/manifest.json', 'application/json'], ['collections.json', 'application/json'],
    ]);
    writeFileSync(path.join(directory, 'club/run.sh'), 'echo');
    assert.throws(() => builtFiles(directory), /club\/run\.sh: unexpected file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
