// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designerVersion } from '../scripts/designer-version.mjs';
import { verifyDesigner } from '../scripts/verify-designer.mjs';

const commit = 'abcdef0123456789abcdef0123456789abcdef01';

test('stable release tags are the source of the designer version', () => {
  for (const tag of ['v1.2.0', '1.2.0', 'v0.0.1']) {
    assert.deepEqual(designerVersion({ event: 'release', tag, commit }), { version: tag, commit });
  }
  for (const tag of ['', 'main', 'v01.2.0', 'v1.2', 'v1.2.0-beta.1', 'v1.2.0\n', 'v1.2.0+build']) {
    assert.throws(() => designerVersion({ event: 'release', tag, commit }), /stable SemVer/);
  }
});

test('preview and check versions identify the checked commit without claiming a release', () => {
  assert.deepEqual(designerVersion({ event: 'pull_request', pr: '47', commit }), { version: 'pr-47-abcdef0', commit });
  for (const event of ['push', 'workflow_dispatch']) {
    assert.deepEqual(designerVersion({ event, commit }), { version: 'dev-abcdef0', commit });
  }
  assert.throws(() => designerVersion({ event: 'pull_request', pr: '47\nversion=bad', commit }));
  assert.throws(() => designerVersion({ event: 'release', tag: 'v1.2.0', commit: 'main' }));
});

test('HTTPS verification rejects stale builds and SPA fallbacks', async () => {
  const expected = { version: 'v1.2.0', commit };
  await verifyDesigner('https://designer.trackdraw.app', expected, async (url, options) => {
    assert.equal(url.href, 'https://designer.trackdraw.app/version.json');
    assert.equal(options.cache, 'no-store');
    return Response.json(expected);
  });
  for (const response of [
    Response.json({ version: 'v1.1.0', commit }),
    Response.json({ version: expected.version, commit: '0'.repeat(40) }),
    new Response('<html>SPA fallback</html>'),
    new Response(null, { status: 404 }),
  ]) {
    await assert.rejects(verifyDesigner('https://designer.trackdraw.app', expected, async () => response));
  }
});
