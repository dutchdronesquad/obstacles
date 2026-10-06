// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function verifyDesigner(url, expected, request = fetch) {
  const response = await request(new URL('/version.json', url), {
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, 'Designer version endpoint must respond successfully');
  assert.deepEqual(await response.json(), expected, 'Deployed designer must match the checked release version and commit');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (let attempt = 0; ; attempt++) {
    try {
      await verifyDesigner(process.env.SITE_URL, {
        version: process.env.DESIGNER_VERSION,
        commit: process.env.DESIGNER_COMMIT,
      });
      console.log(`Verified ${process.env.DESIGNER_VERSION} (${process.env.DESIGNER_COMMIT})`);
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      console.warn(error.message);
      await setTimeout(10_000);
    }
  }
}
