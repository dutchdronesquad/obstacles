// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

// Every sheet the designer can produce must pass the same checks as a hand-made contribution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { checkCollections } from '../scripts/check-collections.mjs';
import { templateDefinitions } from '../scripts/template-definitions.mjs';
import { exportSheet } from '../scripts/templates.mjs';
import { createDesign, prepareLogo, renderSheet } from '../designer/core/src/index.ts';

const red = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#ff0000"/></svg>';
const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, id: 'club', name: 'Club', status: 'example', author: 'Club', attribution: 'Original', usage: { terms: 'Test', portable: 'not-granted' } }));
const editable = Object.keys(templateDefinitions).filter(id => templateDefinitions[id].sheet);

async function samples(template) {
  const base = createDesign(templateDefinitions, template);
  const svgLogo = (await prepareLogo({ type: 'image/svg+xml', bytes: new TextEncoder().encode(red) })).logo;
  const pngBytes = await sharp({ create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.6 } } }).png().toBuffer();
  const pngLogo = (await prepareLogo({ type: 'image/png', bytes: new Uint8Array(pngBytes) })).logo;
  // Live text goes through the same rasterizer route the app uses, here with sharp instead of a canvas.
  const textSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#00aa00"/><text x="10" y="70" font-size="60">DDS</text></svg>';
  const rasterizeSvg = async (svg, size) => {
    const bytes = await sharp(Buffer.from(svg)).resize(size.width, size.height).png().toBuffer();
    return { bytes: new Uint8Array(bytes), ...size };
  };
  const textLogo = await prepareLogo({ type: 'image/svg+xml', bytes: new TextEncoder().encode(textSvg) }, { rasterizeSvg });
  assert.equal(textLogo.rasterized, true);
  const panels = (placement) => Object.fromEntries(Object.keys(base.panels).map(panel => [panel, { ...base.panels[panel], ...placement }]));
  return {
    blank: base,
    'svg-logo': { ...base, name: 'Club "main" & co', logo: svgLogo, colors: { ...base.colors, background: '#141c28', accent: '#f39200' } },
    'png-logo-at-edge': { ...base, logo: pngLogo, panels: panels({ scale: 1, offsetX: 40, offsetY: -40 }) },
    'no-accent-hidden': { ...base, accent: 'none', logo: svgLogo, panels: panels({ visible: false }) },
    'rasterized-text-logo': { ...base, logo: textLogo.logo },
  };
}

for (const template of editable) {
  test(`designer sheets for ${template} pass the repository checks`, async () => {
    const templateSvg = await readFile(`templates/${template}.svg`, 'utf8');
    const designs = await samples(template);
    const files = new Map([['collections/club/manifest.json', manifest]]);
    for (const [id, design] of Object.entries(designs)) files.set(`collections/club/source/${id}.svg`, Buffer.from(renderSheet(templateDefinitions, templateSvg, design)));
    const result = await checkCollections([...files.keys()], file => files.get(file));
    const panelCount = Object.keys(templateDefinitions[template].panels).length;
    assert.equal(result.sources, Object.keys(designs).length);
    assert.equal(result.checked, Object.keys(designs).length * panelCount);
    const entries = JSON.parse(result.view.read('collections/club/manifest.json')).textures;
    assert.equal(entries.find(entry => entry.id === 'svg-logo').name, 'Club "main" & co');
    if (templateDefinitions[template].unprintedBack) assert.equal(entries.find(entry => entry.id === 'blank').backColor, designs.blank.colors.back);
  });
}

test('logos and accents land where the template says', async () => {
  const pixel = async (bytes, x, y) => {
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return [...data.subarray((Math.round(y) * info.width + Math.round(x)) * 4, (Math.round(y) * info.width + Math.round(x)) * 4 + 4)];
  };
  const gate = (await samples('gate-standard-v1'))['svg-logo'];
  const gateSheet = renderSheet(templateDefinitions, await readFile('templates/gate-standard-v1.svg', 'utf8'), gate);
  const { panels } = await exportSheet(gateSheet, 'gate');
  const scale = templateDefinitions['gate-standard-v1'].sheet.scale;
  // Left post: logo at the safe-area centre, frame along the inner edge, background near the outer edge.
  assert.deepEqual(await pixel(panels.left, 52 * scale, 250 * scale), [255, 0, 0, 255]);
  assert.deepEqual(await pixel(panels.left, 96 * scale, 250 * scale), [243, 146, 0, 255]);
  assert.deepEqual(await pixel(panels.left, 4 * scale, 30 * scale), [20, 28, 40, 255]);

  const flag = (await samples('corner-flag-v1'))['svg-logo'];
  const flagSheet = renderSheet(templateDefinitions, await readFile('templates/corner-flag-v1.svg', 'utf8'), flag);
  const flagPanels = (await exportSheet(flagSheet, 'flag')).panels;
  const flagScale = templateDefinitions['corner-flag-v1'].sheet.scale;
  // Band along the bottom edge, logo in the middle, transparent outside the outline.
  assert.deepEqual(await pixel(flagPanels.front, 50 * flagScale, 492 * flagScale), [243, 146, 0, 255]);
  assert.deepEqual(await pixel(flagPanels.front, 50 * flagScale, 315 * flagScale), [255, 0, 0, 255]);
  assert.equal((await pixel(flagPanels.front, 20 * flagScale, 40 * flagScale))[3], 0);
});

test('a logo hiding live text never becomes a sheet, however the design arrives', async () => {
  const inner = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>A</text></svg>';
  const outer = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><image width="200" height="100" href="data:image/svg+xml;base64,${Buffer.from(inner).toString('base64')}"/></svg>`;
  const design = { ...createDesign(templateDefinitions, 'gate-standard-v1'), logo: { kind: 'svg', data: Buffer.from(outer).toString('base64'), width: 200, height: 100 } };
  const templateSvg = await readFile('templates/gate-standard-v1.svg', 'utf8');
  assert.throws(() => renderSheet(templateDefinitions, templateSvg, design), /embeds another SVG/);
});
