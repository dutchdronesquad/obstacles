// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { templateDefinitions } from '../scripts/template-definitions.mjs';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const colour = /^#[0-9a-f]{6}$/;
const entries = Object.entries(templateDefinitions);

test('every template definition is complete', () => {
  assert.ok(entries.length > 0);
  for (const [id, definition] of entries) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/, id);
    assert.ok(definition.name?.trim(), `${id}.name`);
    assert.match(definition.defaultTextureId, slug, `${id}.defaultTextureId`);
    assert.ok(['opaque', 'cut-out'].includes(definition.transparency), `${id}.transparency`);
    assert.equal(typeof definition.unprintedBack, 'boolean', `${id}.unprintedBack`);
    assert.ok(Array.isArray(definition.views) && definition.views.length > 0, `${id}.views`);
    assert.ok(definition.layout.width > 0 && definition.layout.height > 0, `${id}.layout`);
    assert.ok(Object.keys(definition.panels).length > 0, `${id}.panels`);
    for (const [panel, region] of Object.entries(definition.panels)) {
      const where = `${id}.${panel}`;
      assert.match(panel, slug, where);
      assert.ok(region.width > 0 && region.height > 0 && region.x >= 0 && region.y >= 0, where);
      assert.ok(region.x + region.width <= definition.layout.width && region.y + region.height <= definition.layout.height, `${where} fits the layout`);
      if (region.color !== undefined) assert.match(region.color, colour, `${where}.color`);
      if (region.turn !== undefined) assert.ok([0, 90, 180, 270].includes(region.turn), `${where}.turn`);
      // Unprinted backs fall back to the panel colour, so every panel needs one.
      if (definition.unprintedBack) assert.match(region.color ?? '', colour, `${where}.color is needed for the unprinted back`);
    }
    for (const pole of definition.layout.poles ?? []) {
      assert.ok(pole.length === 4 && pole.every((value, i) => value >= 0 && value <= (i % 2 ? definition.layout.height : definition.layout.width)), `${id} pole`);
    }
  }
});

test('templates with an editable sheet define placement and match their SVG', async () => {
  const editable = entries.filter(([, definition]) => definition.sheet);
  assert.ok(editable.length > 0);
  for (const [id, definition] of editable) {
    assert.ok(Number.isInteger(definition.sheet.scale) && definition.sheet.scale > 0, `${id}.sheet.scale`);
    const svg = await readFile(`templates/${id}.svg`, 'utf8');
    const root = /<svg\b[^>]*>/.exec(svg)[0];
    assert.match(root, new RegExp(`data-template="${id}"`), `${id}.svg data-template`);
    assert.match(root, new RegExp(`\\swidth="${definition.layout.width}"\\s+height="${definition.layout.height}"`), `${id}.svg size matches the layout`);
    for (const [panel, region] of Object.entries(definition.panels)) {
      const where = `${id}.${panel}`;
      assert.ok([-90, 0, 90, 180].includes(region.readingRotation), `${where}.readingRotation`);
      const { top, right, bottom, left } = region.safeArea ?? {};
      assert.ok([top, right, bottom, left].every(inset => Number.isFinite(inset) && inset >= 0), `${where}.safeArea`);
      assert.ok(region.width - left - right > 0 && region.height - top - bottom > 0, `${where}.safeArea leaves room for artwork`);
    }
  }
});

test('default texture ids are unique', () => {
  const ids = entries.map(([, definition]) => definition.defaultTextureId);
  assert.equal(new Set(ids).size, ids.length);
});
