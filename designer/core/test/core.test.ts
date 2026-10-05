// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accentStyles, bandOutline, createDesign, type Design, frameOutline, jpegSize, parseSheet, placeLogo, pngSize,
  prepareLogo, renderSheet, safeRect, type TemplateDefinitions, validateDesign,
} from '../src/index.ts';

const definitions = JSON.parse(readFileSync(new URL('../../../templates/templates.json', import.meta.url), 'utf8')) as TemplateDefinitions;
const template = (id: string) => readFileSync(new URL(`../../../templates/${id}.svg`, import.meta.url), 'utf8');
const encode = (text: string) => new TextEncoder().encode(text);
const wideLogo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#ff0000"/></svg>';
const withLogo = async (design: Design) => ({ ...design, logo: (await prepareLogo({ type: 'image/svg+xml', bytes: encode(wideLogo) })).logo });

test('new designs start from the template: panels, accent and back colour', () => {
  const gate = createDesign(definitions, 'gate-standard-v1');
  assert.deepEqual(Object.keys(gate.panels), ['left', 'right', 'top']);
  assert.equal(gate.accent, 'frame');
  assert.ok(gate.colors.back);
  const flag = createDesign(definitions, 'corner-flag-v1');
  assert.equal(flag.accent, 'band');
  assert.equal(flag.colors.back, undefined);
  assert.deepEqual(accentStyles(definitions['gate-standard-v1']), ['none', 'frame']);
  assert.deepEqual(accentStyles(definitions['corner-flag-v1']), ['none', 'band']);
  assert.throws(() => createDesign(definitions, 'hurdle-v1'), /no editable sheet/);
  assert.throws(() => createDesign(definitions, 'unknown-v1'), /Unknown template/);
});

test('validation explains what to fix', () => {
  const gate = createDesign(definitions, 'gate-standard-v1');
  const flag = createDesign(definitions, 'corner-flag-v1');
  assert.throws(() => validateDesign(definitions, { ...gate, colors: { ...gate.colors, accent: 'orange' } }), /accent colour must be a #rrggbb/);
  assert.throws(() => validateDesign(definitions, { ...flag, colors: { ...flag.colors, back: '#000000' } }), /no unprinted back/);
  assert.throws(() => validateDesign(definitions, { ...flag, accent: 'frame' }), /does not support the frame accent/);
  assert.throws(() => validateDesign(definitions, { ...gate, panels: { left: gate.panels.left } }), /Panels must be exactly left,right,top/);
  assert.throws(() => validateDesign(definitions, { ...gate, panels: { ...gate.panels, top: { ...gate.panels.top, scale: 2 } } }), /top scale must be between/);
  assert.throws(() => validateDesign(definitions, { ...gate, name: ' ' }), /name must be/);
  validateDesign(definitions, gate);
});

test('logos follow each panel reading direction and fit inside the safe area', () => {
  const logo = { width: 200, height: 100 };
  const { left, right, top } = definitions['gate-standard-v1'].panels;
  const full = { visible: true, scale: 1, offsetX: 0, offsetY: 0 };
  const onLeft = placeLogo(left, logo, full)!;
  assert.equal(onLeft.rotation, -90);
  assert.equal(placeLogo(right, logo, full)!.rotation, 90);
  assert.equal(placeLogo(top, logo, full)!.rotation, 0);
  // Turned sideways, the logo's height spans the post's safe width exactly at scale 1.
  assert.equal(onLeft.height, safeRect(left).width);
  const safe = safeRect(left);
  assert.deepEqual([onLeft.cx, onLeft.cy], [safe.x + safe.width / 2, safe.y + safe.height / 2]);
  const smaller = placeLogo(left, logo, { visible: true, scale: 0.5, offsetX: 3, offsetY: -10 })!;
  assert.equal(smaller.width, onLeft.width / 2);
  assert.deepEqual([smaller.cx, smaller.cy], [onLeft.cx + 3, onLeft.cy - 10]);
  assert.equal(placeLogo(top, logo, { ...full, visible: false }), undefined);
});

test('accents follow the template geometry', () => {
  // Same outline as the DDS gate: an 8-unit line along the inner edges of the posts and top.
  assert.deepEqual(frameOutline(definitions['gate-standard-v1']), [[92, 600], [92, 92], [608, 92], [608, 600], [600, 600], [600, 100], [100, 100], [100, 600]]);
  assert.deepEqual(bandOutline(definitions['corner-flag-v1'].panels.front), [[0, 491], [100, 468], [100, 488], [0, 511]]);
});

test('logo files are read without a DOM, and live text is rasterized or refused', async () => {
  const svg = await prepareLogo({ type: 'image/svg+xml', bytes: encode(wideLogo) });
  assert.deepEqual([svg.logo.kind, svg.logo.width, svg.logo.height, svg.rasterized], ['svg', 200, 100, false]);
  const sized = await prepareLogo({ type: '', bytes: encode('<svg xmlns="http://www.w3.org/2000/svg" width="40px" height="20"/>') });
  assert.deepEqual([sized.logo.width, sized.logo.height], [40, 20]);

  const text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text>DDS</text></svg>';
  await assert.rejects(prepareLogo({ type: 'image/svg+xml', bytes: encode(text) }), /live text/);
  let requested: { width: number; height: number } | undefined;
  const rasterized = await prepareLogo({ type: 'image/svg+xml', bytes: encode(text) }, {
    rasterizeSvg: async (_svg, size) => { requested = size; return { bytes: new Uint8Array([1, 2, 3]), width: size.width, height: size.height }; },
  });
  assert.deepEqual([rasterized.logo.kind, rasterized.rasterized, requested], ['png', true, { width: 2048, height: 1024 }]);

  for (const unsafe of ['<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>', '<svg viewBox="0 0 1 1" onload="x()"/>', '<svg viewBox="0 0 1 1"><image href="https://example.com/a.png"/></svg>', '<svg viewBox="0 0 1 1"><rect fill="url(https://x/y)"/></svg>']) {
    await assert.rejects(prepareLogo({ type: 'image/svg+xml', bytes: encode(unsafe) }), /scripts|links to other files/);
  }
  await assert.rejects(prepareLogo({ type: 'image/gif', bytes: new Uint8Array([71, 73, 70]) }), /SVG, PNG or JPEG/);

  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 320);
  assert.deepEqual(pngSize(png), { width: 640, height: 320 });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x40, 0x02, 0x80, 0x03]);
  assert.deepEqual(jpegSize(jpeg), { width: 640, height: 320 });
});

test('sheets are deterministic, carry the checked attributes and open again', async () => {
  const design = { ...(await withLogo(createDesign(definitions, 'gate-standard-v1'))), name: 'Main "gate" & co', colors: { background: '#141c28', accent: '#f39200', back: '#141c28' } };
  const sheet = renderSheet(definitions, template('gate-standard-v1'), design);
  assert.equal(renderSheet(definitions, template('gate-standard-v1'), design), sheet);
  assert.match(sheet, /<svg\b[^>]*data-template="gate-standard-v1" data-name="Main &quot;gate&quot; &amp; co" data-back-color="#141c28"/);
  assert.match(sheet, /<g id="guides"/, 'the guides layer stays');
  const artwork = /<g id="artwork"[\s\S]*?\n {2}<\/g>/.exec(sheet)![0];
  assert.doesNotMatch(artwork, /<text\b/);
  assert.equal(artwork.match(/<use href="#designer-logo"/g)?.length, 3);
  assert.deepEqual(parseSheet(sheet), design);
  const flag = renderSheet(definitions, template('corner-flag-v1'), createDesign(definitions, 'corner-flag-v1'));
  assert.match(flag, /clip-path="url\(#front-shape\)"/);
  assert.doesNotMatch(flag, /data-back-color/);
  assert.throws(() => parseSheet(template('gate-standard-v1')), /not made with the designer/);
});
