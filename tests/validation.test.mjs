// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { checkCollections } from '../scripts/check-collections.mjs';
import { checkImages, limits, workingTreeFiles } from '../scripts/collections.mjs';

const image = (width, height, { alpha = 1, format = 'webp' } = {}) =>
  sharp({ create: { width, height, channels: 4, background: { r: 20, g: 28, b: 40, alpha } } })[format]({ lossless: true }).toBuffer();
const manifest = (template, panels) => Buffer.from(JSON.stringify({
  schemaVersion: 1, id: 'org', name: 'Org', status: 'example', author: 'Org', attribution: 'Original test artwork',
  usage: { terms: 'Test only', portable: 'not-granted' },
  textures: [{ id: 'set', name: 'Set', template, panels: Object.fromEntries(Object.keys(panels).map(panel => [panel, `textures/${panel}.webp`])) }],
}));
async function collection(template, panels) {
  const files = new Map([['collections/org/manifest.json', manifest(template, panels)]]);
  for (const [panel, bytes] of Object.entries(panels)) files.set(`collections/org/textures/${panel}.webp`, await bytes);
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
  files.set('collections/org/textures/old/front.webp', await image(256, 128));
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
  assert.ok(files.get('collections/org/textures/front.webp').length > limits.maxBytes);
  await assert.rejects(check(files), /KiB exceeds 512 KiB/);
  const missing = await collection('gate-standard-v1', { left: image(200, 1000), right: image(200, 1000), top: image(1400, 200) });
  missing.delete('collections/org/textures/top.webp');
  await assert.rejects(checkCollections([...missing.keys()], file => missing.get(file)), /missing panel file textures\/top\.webp/);
});

test('generated texture sets go through the same image and manifest checks', async () => {
  const sheet = (await readFile('templates/corner-flag-v1.svg', 'utf8')).replace('data-template="corner-flag-v1"', 'data-template="corner-flag-v1" data-back-color="#000000"');
  const files = new Map([
    ['collections/org/manifest.json', Buffer.from(JSON.stringify({ schemaVersion: 1, id: 'org', name: 'Org', status: 'example', author: 'Org', attribution: 'Original', usage: { terms: 'Test', portable: 'not-granted' } }))],
    ['collections/org/source/flag.svg', Buffer.from(sheet)],
  ]);
  await assert.rejects(checkCollections([...files.keys()], file => files.get(file)), /backColor is not supported for corner-flag-v1/);
  files.delete('collections/org/source/flag.svg');
  await assert.rejects(checkCollections([...files.keys()], file => files.get(file)), /no texture sets; add a template sheet to source\//);
});

test('contact sheets render every texture set of a collection', async () => {
  const { collectionPreview } = await import('../scripts/preview.mjs');
  const { readFileSync } = await import('node:fs');
  for (const id of ['dds', 'multigp']) {
    const { view } = await checkCollections(workingTreeFiles(), file => readFileSync(file));
    const sheet = await sharp(await collectionPreview(id, view.read)).metadata();
    assert.equal(sheet.format, 'png');
    assert.equal(sheet.width, 1200);
    assert.ok(sheet.height > 500, id);
  }
});
