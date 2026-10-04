// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { checkCollections } from '../scripts/check-collections.mjs';
import { checkImages, limits } from '../scripts/collections.mjs';
import { exportSheet } from '../scripts/templates.mjs';

const image = (width, height, { alpha = 1, format = 'webp' } = {}) =>
  sharp({ create: { width, height, channels: 4, background: { r: 20, g: 28, b: 40, alpha } } })[format]({ lossless: true }).toBuffer();
const manifest = (template, panels) => Buffer.from(JSON.stringify({
  schemaVersion: 1, id: 'club', name: 'Club', status: 'example', author: 'Club', attribution: 'Original test artwork',
  usage: { terms: 'Test only', portable: 'not-granted' },
  textures: [{ id: 'set', name: 'Set', template, panels: Object.fromEntries(Object.keys(panels).map(panel => [panel, `textures/${panel}.webp`])) }],
}));
async function collection(template, panels) {
  const files = new Map([['collections/club/manifest.json', manifest(template, panels)]]);
  for (const [panel, bytes] of Object.entries(panels)) files.set(`collections/club/textures/${panel}.webp`, await bytes);
  return files;
}
const check = files => checkImages([...files.keys()], file => files.get(file));

test('championship gates use their own proportions', async () => {
  const valid = await collection('gate-championship-v1', { left: image(256, 1024), right: image(256, 1024), top: image(2000, 400) });
  assert.equal((await check(valid)).checked, 3);
  const standard = await collection('gate-championship-v1', { left: image(200, 1000), right: image(256, 1024), top: image(2000, 400) });
  await assert.rejects(check(standard), /gate-championship-v1 left proportions; use for example 250x1000 px/);
});

test('texture folders must be flat', async () => {
  const files = await collection('hurdle-v1', { front: image(256, 128) });
  files.set('collections/club/textures/old/front.webp', await image(256, 128));
  await assert.rejects(check(files), /texture folders must be flat/);
});

test('valid gate and flag panels pass with their template proportions', async () => {
  const gate = await collection('gate-standard-v1', { left: image(200, 1000), right: image(200, 1000), top: image(1400, 200) });
  assert.deepEqual(await check(gate), { decoded: 3, checked: 3 });
  const flag = await collection('corner-flag-v1', { front: image(400, 2044, { alpha: 0 }), back: image(400, 2044, { alpha: 0 }) });
  assert.deepEqual(await check(flag), { decoded: 2, checked: 2 });
});

test('unsupported dimensions fail with a suggested size', async () => {
  const files = await collection('gate-standard-v1', { left: image(300, 1000), right: image(200, 1000), top: image(1400, 200) });
  await assert.rejects(check(files), /left\.webp \(set\.left\): 300x1000 px does not match the gate-standard-v1 left proportions; use for example 200x1000 px/);
  const tiny = await collection('hurdle-v1', { front: image(80, 40) });
  await assert.rejects(check(tiny), /outside 64-4096 px per edge/);
  const huge = await collection('hurdle-v1', { front: image(8192, 4096) });
  await assert.rejects(check(huge), /outside 64-4096 px per edge/);
});

test('images are judged by content, not by extension', async () => {
  const png = await collection('hurdle-v1', { front: image(256, 128, { format: 'png' }) });
  await assert.rejects(check(png), /expected WebP content, found png/);
  const text = await collection('hurdle-v1', { front: Buffer.from('not an image') });
  await assert.rejects(check(text), /cannot decode image/);
});

test('transparency must match how the template renders', async () => {
  const gate = await collection('hurdle-v1', { front: image(256, 128, { alpha: 0.5 }) });
  await assert.rejects(check(gate), /renders without transparency/);
  // Slightly translucent edges, as in the live MultiGP top panel, stay accepted.
  assert.equal((await check(await collection('hurdle-v1', { front: image(256, 128, { alpha: 200 / 255 }) }))).checked, 1);
  const flag = await collection('corner-flag-v1', { front: image(400, 2044), back: image(400, 2044, { alpha: 0 }) });
  await assert.rejects(check(flag), /front\.webp \(set\.front\): has no transparent pixels/);
});

test('oversized files and missing panel files fail', async () => {
  const noisy = sharp(randomBytes(2048 * 1024 * 3), { raw: { width: 2048, height: 1024, channels: 3 } });
  const files = await collection('hurdle-v1', { front: noisy.webp({ lossless: true }).toBuffer() });
  assert.ok(files.get('collections/club/textures/front.webp').length > limits.maxBytes);
  await assert.rejects(check(files), /KiB exceeds 512 KiB/);
  const missing = await collection('gate-standard-v1', { left: image(200, 1000), right: image(200, 1000), top: image(1400, 200) });
  missing.delete('collections/club/textures/top.webp');
  await assert.rejects(checkCollections([...missing.keys()], file => missing.get(file)), /missing panel file textures\/top\.webp/);
});

test('textures that drift from their editable source are reported', async () => {
  const sheet = await readFile('templates/gate-standard-v1.svg');
  const { panels } = await exportSheet(sheet.toString(), 'sheet');
  const files = new Map([
    ['collections/club/manifest.json', manifest('gate-standard-v1', panels)],
    ['collections/club/source/set.svg', sheet],
    ['collections/club/textures/left.webp', panels.left], ['collections/club/textures/right.webp', panels.right], ['collections/club/textures/top.webp', panels.top],
  ]);
  const read = file => files.get(file);
  await assert.rejects(checkCollections([...files.keys()], read), /missing collections\/club\/textures\/set-left\.webp; run npm run textures:export/);
  for (const panel of ['left', 'right', 'top']) files.set(`collections/club/textures/set-${panel}.webp`, panels[panel]);
  assert.equal((await checkCollections([...files.keys()], read)).sources, 1);
  files.set('collections/club/textures/set-top.webp', await image(2100, 300, { alpha: 1 }).then(bytes => sharp(bytes).tint('#ff0000').webp({ lossless: true }).toBuffer()));
  await assert.rejects(checkCollections([...files.keys()], read), /set-top\.webp: out of date with collections\/club\/source\/set\.svg/);
  files.set('collections/club/textures/set-top.webp', await sharp(panels.top).resize(1400, 200).webp({ lossless: true }).toBuffer());
  await assert.rejects(checkCollections([...files.keys()], read), /set-top\.webp: is 1400x200 px but .* exports 2100x300 px/);
  files.set('collections/club/textures/set-top.webp', panels.top);
  // Original artwork without data-template is kept, not exported or compared.
  files.set('collections/club/source/logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'));
  assert.equal((await checkCollections([...files.keys()], read)).sources, 1);
});

test('contact sheets render every texture set of a collection', async () => {
  const { collectionPreview } = await import('../scripts/preview.mjs');
  const { readFileSync } = await import('node:fs');
  for (const id of ['dds', 'multigp']) {
    const sheet = await sharp(await collectionPreview(id, file => readFileSync(file))).metadata();
    assert.equal(sheet.format, 'png');
    assert.equal(sheet.width, 1200);
    assert.ok(sheet.height > 500, id);
  }
});
