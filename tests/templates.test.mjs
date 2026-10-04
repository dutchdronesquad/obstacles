// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { limits, panelImages, templates } from '../scripts/collections.mjs';
import { exportSheet, templateSheets, withGeneratedTextures } from '../scripts/templates.mjs';

const raw = bytes => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixel = ({ data, info }, x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];

test('template sheets cover exactly the manifest slots of their template', () => {
  for (const [id, sheet] of Object.entries(templateSheets)) {
    assert.deepEqual(Object.keys(sheet.panels).sort(), [...templates[id]].sort(), id);
    for (const region of Object.values(sheet.panels)) {
      assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.width <= sheet.width && region.y + region.height <= sheet.height, id);
      assert.ok(Math.max(region.width, region.height) * sheet.scale <= limits.maxEdge, id);
    }
    for (const [panel, region] of Object.entries(sheet.panels)) {
      assert.ok(Math.abs(region.width / region.height / panelImages[id][panel] - 1) <= limits.aspectTolerance, `${id}.${panel} proportions`);
    }
  }
});

test('blank gate template exports opaque panels without guides', async () => {
  const { template, panels } = await exportSheet(await readFile('templates/gate-standard-v1.svg', 'utf8'), 'gate');
  assert.equal(template, 'gate-standard-v1');
  const expected = { left: [300, 1500, [248, 250, 252]], right: [300, 1500, [248, 250, 252]], top: [2100, 300, [32, 46, 93]] };
  for (const [panel, [width, height, colour]] of Object.entries(expected)) {
    const image = await raw(panels[panel]);
    assert.deepEqual([image.info.width, image.info.height], [width, height], panel);
    assert.equal((await sharp(panels[panel]).metadata()).hasAlpha, false, panel);
    // Guide outlines, labels and arrows would break a uniform base colour.
    const colours = new Set();
    for (let i = 0; i < image.data.length; i += 4) colours.add(image.data.subarray(i, i + 3).join());
    assert.deepEqual([...colours], [colour.join()], panel);
  }
});

test('blank flag template exports transparent silhouettes with the pole on opposite sides', async () => {
  const { panels } = await exportSheet(await readFile('templates/corner-flag-v1.svg', 'utf8'), 'flag');
  const front = await raw(panels.front), back = await raw(panels.back);
  assert.deepEqual([front.info.width, front.info.height], [400, 2044]);
  assert.equal(pixel(front, 200, 1000)[3], 255);
  assert.equal(pixel(front, 20, 40)[3], 0, 'front top corner away from the pole curve is transparent');
  assert.equal(pixel(back, 379, 40)[3], 0, 'back mirrors the silhouette');
  assert.equal(pixel(back, 20, 40)[3], 255);
});

test('export rejects live text, linked files and sheets without template metadata', async () => {
  const sheet = await readFile('templates/gate-standard-v1.svg', 'utf8');
  const withArtwork = extra => sheet.replace('<g id="artwork" inkscape:groupmode="layer" inkscape:label="Artwork">', match => `${match}${extra}`);
  await assert.rejects(exportSheet(withArtwork('<text x="40" y="300" font-size="40">DDS</text>'), 'text'), /convert text to paths/);
  for (const link of ['<image href="logo.png"/>', "<image href='logo.png'/>", '<image xlink:href = "file:///logo.png"/>']) {
    await assert.rejects(exportSheet(withArtwork(link), 'link'), /linked files/);
  }
  await assert.rejects(exportSheet(withArtwork('<flowRoot><flowPara>DDS</flowPara></flowRoot>'), 'flow'), /flowed text/);
  await assert.rejects(exportSheet(sheet.replace('id="guides"', 'id="layer2"'), 'guides'), /id="guides"/);
  await assert.rejects(exportSheet(sheet.replace(' data-template="gate-standard-v1"', ''), 'meta'), /data-template/);
  await assert.rejects(exportSheet(sheet.replace('data-template="gate-standard-v1"', 'data-template="hurdle-v1"'), 'meta'), /no editable sheet/);
  await assert.rejects(exportSheet(sheet.replace('id="artwork"', 'id="art"'), 'layer'), /id="artwork"/);
  await assert.rejects(exportSheet(sheet.replace('width="700" height="600" viewBox="0 0 700 600"', 'width="700" height="500" viewBox="0 0 700 500"'), 'size'), /must be 700x600/);
});

test('guides stay hidden when an editor marks the layer visible inline', async () => {
  const sheet = (await readFile('templates/gate-standard-v1.svg', 'utf8')).replace('<g id="guides"', '<g style="display:inline" id="guides"');
  const { panels } = await exportSheet(sheet, 'inline');
  const image = await raw(panels.top);
  const colours = new Set();
  for (let i = 0; i < image.data.length; i += 4) colours.add(image.data.subarray(i, i + 3).join());
  assert.deepEqual([...colours], ['32,46,93']);
});

test('each template sheet becomes a generated texture set in the manifest view', async () => {
  const sheet = (await readFile('templates/gate-standard-v1.svg', 'utf8'))
    .replace('data-template="gate-standard-v1"', 'data-template="gate-standard-v1" data-name="Club &amp; friends gate" data-back-color="#112233"');
  const manifest = { schemaVersion: 1, id: 'club', name: 'Club', status: 'example', author: 'Club', attribution: 'Original', usage: { terms: 'Test', portable: 'not-granted' } };
  const files = new Map([
    ['collections/club/manifest.json', Buffer.from(JSON.stringify(manifest))],
    ['collections/club/source/main-gate.svg', Buffer.from(sheet)],
    ['collections/club/source/logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
  ]);
  const view = await withGeneratedTextures([...files.keys()], file => files.get(file));
  assert.equal(view.sources, 1, 'SVGs without data-template are kept as originals');
  const [entry] = JSON.parse(view.read('collections/club/manifest.json')).textures;
  assert.deepEqual(entry, {
    id: 'main-gate', name: 'Club & friends gate', template: 'gate-standard-v1', backColor: '#112233',
    panels: { left: 'textures/main-gate-left.webp', right: 'textures/main-gate-right.webp', top: 'textures/main-gate-top.webp' },
  });
  assert.deepEqual(view.files.filter(file => file.includes('/textures/')).sort(), Object.values(entry.panels).map(file => `collections/club/${file}`).sort());
  assert.equal((await sharp(view.read('collections/club/textures/main-gate-top.webp')).metadata()).width, 2100);

  files.set('collections/club/textures/main-gate-top.webp', Buffer.from('stale'));
  await assert.rejects(withGeneratedTextures([...files.keys()], file => files.get(file)), /is generated from collections\/club\/source\/main-gate\.svg; delete the committed file/);
  files.delete('collections/club/textures/main-gate-top.webp');
  files.set('collections/club/source/Main Gate.svg', Buffer.from(sheet));
  await assert.rejects(withGeneratedTextures([...files.keys()], file => files.get(file)), /file name must use lowercase letters, digits and hyphens/);
});
