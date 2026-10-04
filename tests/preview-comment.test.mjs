// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { acceptedPreviews, checkOutput, commentBody, marker } from '../scripts/preview-comment.mjs';

test('only well-formed PNG previews from the untrusted artifact are accepted', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'previews-'));
  try {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer();
    writeFileSync(path.join(directory, 'dds.png'), png);
    writeFileSync(path.join(directory, 'dds--standard-gate--3d.png'), png);
    writeFileSync(path.join(directory, 'fake.png'), 'not a png');
    writeFileSync(path.join(directory, 'Upper Case.png'), png);
    writeFileSync(path.join(directory, 'script.svg'), '<svg/>');
    assert.deepEqual(acceptedPreviews(directory).map(({ name, collection, texture }) => ({ name, collection, texture })), [
      { name: 'dds--standard-gate--3d.png', collection: 'dds', texture: 'standard-gate' },
      { name: 'dds.png', collection: 'dds', texture: undefined },
    ]);
    assert.deepEqual(acceptedPreviews(path.join(directory, 'missing')), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('check output cannot break out of its code block', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'output-'));
  try {
    writeFileSync(path.join(directory, 'check-output.txt'), '\x1b[31mcollections/club: bad\x1b[0m\n```\n@maintainer <img src=x>\x07');
    const output = checkOutput(directory);
    assert.ok(!output.includes('```') && !output.includes('\x1b') && !output.includes('\x07'));
    assert.match(output, /collections\/club: bad/);
    writeFileSync(path.join(directory, 'check-output.txt'), 'x'.repeat(10_000));
    assert.equal(checkOutput(directory).length, 4001);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the comment shows status, failures and previews per collection', () => {
  const previews = [
    { name: 'dds--standard-gate--3d.png', collection: 'dds', texture: 'standard-gate' },
    { name: 'dds.png', collection: 'dds' },
  ];
  const base = { previews, output: 'collections/dds: problem', runUrl: 'https://example.test/run', rawBase: 'https://raw.example/abc/pr-7', sha: 'a'.repeat(40) };
  const failed = commentBody({ ...base, conclusion: 'failure' });
  assert.ok(failed.startsWith(marker));
  assert.match(failed, /❌ Checks failed\. See \[the run\]\(https:\/\/example\.test\/run\)/);
  assert.match(failed, /```text\ncollections\/dds: problem\n```/);
  assert.match(failed, /### dds\n\n!\[standard-gate in 3D\]\(https:\/\/raw\.example\/abc\/pr-7\/dds--standard-gate--3d\.png\)/);
  assert.match(failed, /!\[dds contact sheet\]\(https:\/\/raw\.example\/abc\/pr-7\/dds\.png\)/);
  const passed = commentBody({ ...base, conclusion: 'success' });
  assert.match(passed, /✅ All checks passed\./);
  assert.ok(!passed.includes('Check output'));
  assert.match(commentBody({ ...base, previews: [], conclusion: 'success' }), /No collection changes to preview\./);
});

test('3D render designs cover every template with valid panel mappings', async () => {
  const { renderDesign, renderTargets } = await import('../scripts/render3d.mjs');
  const { templates } = await import('../scripts/collections.mjs');
  assert.deepEqual(Object.keys(renderTargets).sort(), Object.keys(templates).sort());
  for (const [template, target] of Object.entries(renderTargets)) {
    for (const panel of Object.keys(target.files)) assert.ok(templates[template].includes(panel), `${template}.${panel}`);
    const design = renderDesign(template);
    assert.equal(design.shapes.length, target.views.length);
    assert.deepEqual(design.shapes.map(shape => shape.rotation), target.views.map(([rotation]) => rotation));
    assert.ok(design.shapes.every(shape => shape.x > 0 && shape.x < design.field.width));
  }
});
