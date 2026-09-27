import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assetFiles, origin } from './upload-assets.mjs';

export async function verifyAssets(files = assetFiles(), fetchAsset = fetch) {
  for (const asset of files) {
    const response = await fetchAsset(`${origin}/${asset.key}?verify=${createHash('sha256').update(asset.bytes).digest('hex')}`, {
      headers: { Origin: 'https://trackdraw.app' },
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, asset.key);
    assert.equal(response.headers.get('content-type'), 'image/webp', asset.key);
    assert.equal(response.headers.get('access-control-allow-origin'), '*', asset.key);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300, must-revalidate', asset.key);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(asset.bytes), asset.key);
    console.log(`Verified ${asset.key}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyAssets();
}
