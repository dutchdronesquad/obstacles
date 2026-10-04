// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { templates } from '../scripts/collections.mjs';
import { exportFile, exportSheet, limits, templateSheets } from '../scripts/templates.mjs';

const raw = bytes => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixel = ({ data, info }, x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];

test('template sheets cover exactly the manifest slots of their template', () => {
  for (const [id, sheet] of Object.entries(templateSheets)) {
    assert.deepEqual(Object.keys(sheet.panels).sort(), [...templates[id]].sort(), id);
    for (const region of Object.values(sheet.panels)) {
      assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.width <= sheet.width && region.y + region.height <= sheet.height, id);
      assert.ok(Math.max(region.width, region.height) * sheet.scale <= limits.maxEdge, id);
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
  await assert.rejects(exportFile('templates/gate-standard-v1.svg'), /collections\/<id>\/source/);
});

test('guides stay hidden when an editor marks the layer visible inline', async () => {
  const sheet = (await readFile('templates/gate-standard-v1.svg', 'utf8')).replace('<g id="guides"', '<g style="display:inline" id="guides"');
  const { panels } = await exportSheet(sheet, 'inline');
  const image = await raw(panels.top);
  const colours = new Set();
  for (let i = 0; i < image.data.length; i += 4) colours.add(image.data.subarray(i, i + 3).join());
  assert.deepEqual([...colours], ['32,46,93']);
});

test('committed DDS gate textures match an export of their editable source', async () => {
  const manifest = JSON.parse(await readFile('collections/dds/manifest.json', 'utf8'));
  const gate = manifest.textures.find(texture => texture.id === 'standard-gate');
  const { template, panels } = await exportSheet(await readFile('collections/dds/source/standard-gate.svg', 'utf8'), 'dds');
  assert.equal(gate.template, template);
  for (const [panel, file] of Object.entries(gate.panels)) {
    const committed = await raw(await readFile(`collections/dds/${file}`));
    const exported = await raw(panels[panel]);
    assert.deepEqual(committed.info, exported.info, panel);
    // Tolerate small anti-aliasing differences between platforms, not changed artwork.
    let changed = 0;
    for (let i = 0; i < committed.data.length; i += 4) {
      if ([0, 1, 2, 3].some(c => Math.abs(committed.data[i + c] - exported.data[i + c]) > 32)) changed++;
    }
    assert.ok(changed <= committed.data.length / 4 / 1000, `${panel} differs from its source; run npm run textures:export`);
  }
});
