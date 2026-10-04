// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assetFiles, builtFiles, legacyOrigins, origin } from './upload-assets.mjs';

// Every hostname must serve the same bytes, so a legacy domain still on another bucket fails here.
export async function verifyAssets(files, fetchAsset = fetch, origins = [origin, ...legacyOrigins]) {
  files ??= await assetFiles();
  for (const host of origins) for (const asset of files) {
    const response = await fetchAsset(`${host}/${asset.key}?verify=${createHash('sha256').update(asset.bytes).digest('hex')}`, {
      headers: { Origin: 'https://trackdraw.app' },
      signal: AbortSignal.timeout(30_000),
    });
    const where = `${host}/${asset.key}`;
    assert.equal(response.status, 200, where);
    assert.equal(response.headers.get('content-type'), asset.contentType ?? 'image/webp', where);
    assert.equal(response.headers.get('access-control-allow-origin'), '*', where);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300, must-revalidate',
      `${where}: unexpected Cache-Control; set Cloudflare Browser TTL to Respect origin. See docs/cloudflare-setup.md.`);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(asset.bytes), `${where}: bytes differ; is this hostname attached to the ${'trackdraw-assets'} bucket?`);
    console.log(`Verified ${where}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const from = process.argv.indexOf('--from');
  await verifyAssets(from > -1 ? builtFiles(process.argv[from + 1]) : undefined);
}
