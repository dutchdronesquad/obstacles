// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDesign } from '../designer/core/src/index.ts';
import { templateDefinitions } from '../scripts/template-definitions.mjs';
import { resolutionWarnings, sizeWarnings, validTextureId } from '../designer/app/src/artwork.ts';

test('resolution warnings follow logo scale, visibility and export resolution', () => {
  const definition = templateDefinitions['gate-standard-v1'];
  const design = createDesign(templateDefinitions, 'gate-standard-v1');
  design.logo = { kind: 'png', width: 100, height: 50, data: 'unused' };
  assert.equal(resolutionWarnings(definition, design).length, 3);
  design.panels.left.visible = false;
  design.panels.top.scale = 0.1;
  assert.equal(resolutionWarnings(definition, design).length, 1);
  design.logo.kind = 'svg';
  assert.deepEqual(resolutionWarnings(definition, design), []);
});

test('size warnings and filename validation match collection limits', () => {
  assert.deepEqual(sizeWarnings({ left: 1024 }), []);
  assert.match(sizeWarnings({ top: 450 * 1024 })[0], /close to/);
  assert.match(sizeWarnings({ top: 600 * 1024 })[0], /above/);
  assert.equal(validTextureId('club-gate-2'), true);
  for (const id of ['', 'Club', '../gate', '-gate', 'gate-', 'club--gate', 'club_gate']) assert.equal(validTextureId(id), false);
});
