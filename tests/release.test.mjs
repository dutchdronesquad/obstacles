import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { assetFiles } from '../scripts/upload-assets.mjs';

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
  const files = await readdir('multigp/textures');
  assert.deepEqual(files.filter(file => file.endsWith('.webp')).sort(), expected.map(name => `${name}.webp`).sort());
  for (const name of expected) {
    const png = sharp(await readFile(`multigp/textures/${name}.png`));
    const webp = sharp(await readFile(`multigp/textures/${name}.webp`));
    const a = await png.metadata();
    const b = await webp.metadata();
    assert.equal(b.format, 'webp');
    assert.equal(b.width, a.width);
    assert.equal(b.height, a.height);
    assert.ok(b.width <= 2048);
    await webp.raw().toBuffer();
  }
});

test('stable URLs use committed HEAD bytes and exclude maintenance files', () => {
  const original = process.cwd();
  const directory = mkdtempSync(path.join(tmpdir(), 'obstacles-upload-test-'));
  try {
    process.chdir(directory);
    execFileSync('git', ['init', '--quiet']);
    mkdirSync('multigp/textures', { recursive: true });
    writeFileSync('multigp/textures/gate.webp', 'committed bytes');
    writeFileSync('multigp/textures/gate.png', 'maintenance');
    execFileSync('git', ['add', '.']);
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture']);
    writeFileSync('multigp/textures/gate.webp', 'uncommitted changes');
    const files = assetFiles();
    assert.equal(files.length, 1);
    assert.equal(files[0].key, 'multigp/gate.webp');
    assert.equal(files[0].bytes.toString(), 'committed bytes');
    execFileSync('git', ['add', '.']);
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'updated texture']);
    const updated = assetFiles();
    assert.equal(updated[0].key, files[0].key);
    assert.equal(updated[0].bytes.toString(), 'uncommitted changes');
    mkdirSync('node_modules/wrangler/bin', { recursive: true });
    writeFileSync('node_modules/wrangler/bin/wrangler.js', `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.writeFileSync('uploaded.json', JSON.stringify({
        args, bytes: fs.readFileSync(args[args.indexOf('--file') + 1], 'utf8')
      }));
    `);
    const script = new URL('../scripts/upload-assets.mjs', import.meta.url).pathname;
    execFileSync(process.execPath, [script], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'test-account' },
    });
    const uploaded = JSON.parse(readFileSync('uploaded.json', 'utf8'));
    assert.ok(uploaded.args.includes('trackdraw-obstacles/multigp/gate.webp'));
    assert.equal(uploaded.args[uploaded.args.indexOf('--cache-control') + 1], 'public, max-age=300, must-revalidate');
    assert.equal(uploaded.bytes, 'uncommitted changes');
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
