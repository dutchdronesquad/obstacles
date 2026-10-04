// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assetFiles, builtFiles, origin } from './upload-assets.mjs';

export async function verifyAssets(files, fetchAsset = fetch) {
  files ??= await assetFiles();
  for (const asset of files) {
    const response = await fetchAsset(`${origin}/${asset.key}?verify=${createHash('sha256').update(asset.bytes).digest('hex')}`, {
      headers: { Origin: 'https://trackdraw.app' },
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, asset.key);
    assert.equal(response.headers.get('content-type'), asset.contentType ?? 'image/webp', asset.key);
    assert.equal(response.headers.get('access-control-allow-origin'), '*', asset.key);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300, must-revalidate',
      `${asset.key}: unexpected Cache-Control; set Cloudflare Browser TTL to Respect origin. See docs/cloudflare-setup.md.`);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(asset.bytes), asset.key);
    console.log(`Verified ${asset.key}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const from = process.argv.indexOf('--from');
  await verifyAssets(from > -1 ? builtFiles(process.argv[from + 1]) : undefined);
}
