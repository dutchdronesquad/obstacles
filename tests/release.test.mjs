import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { checkExisting, releaseFiles } from '../scripts/upload-release.mjs';

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

test('release tag must be an explicit version', () => {
  for (const tag of ['main', '../v1', '--all', undefined]) assert.throws(() => releaseFiles(tag), /release tag/);
});

const assets = [{ key: 'v0.1.0/multigp/example.webp', bytes: Buffer.from('example') }];
test('missing objects are uploaded and identical objects are skipped', async () => {
  assert.deepEqual(await checkExisting(assets, async () => new Response(null, { status: 404 })), assets);
  assert.deepEqual(await checkExisting(assets, async () => new Response('example')), []);
});
test('changed published bytes cannot be overwritten', async () => {
  await assert.rejects(checkExisting(assets, async () => new Response('different')), /Refusing to overwrite/);
});
test('network and server failures stop publication', async () => {
  await assert.rejects(checkExisting(assets, async () => new Response(null, { status: 503 })), /HTTP 503/);
  await assert.rejects(checkExisting(assets, async () => { throw new Error('offline'); }), /offline/);
});


test('release bytes come from the tag and exclude source and maintenance files', () => {
  const original = process.cwd();
  const directory = mkdtempSync(path.join(tmpdir(), 'obstacles-tag-test-'));
  try {
    process.chdir(directory);
    execFileSync('git', ['init', '--quiet']);
    mkdirSync('multigp/textures', { recursive: true });
    writeFileSync('multigp/textures/gate.webp', 'tagged bytes');
    writeFileSync('multigp/textures/gate.png', 'maintenance');
    execFileSync('git', ['add', '.']);
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture']);
    execFileSync('git', ['-c', 'tag.gpgsign=false', 'tag', 'v0.1.0']);
    writeFileSync('multigp/textures/gate.webp', 'uncommitted changes');
    const files = releaseFiles('v0.1.0');
    assert.equal(files.length, 1);
    assert.equal(files[0].key, 'v0.1.0/multigp/gate.webp');
    assert.equal(files[0].bytes.toString(), 'tagged bytes');
  } finally {
    process.chdir(original);
    rmSync(directory, { recursive: true, force: true });
  }
});
