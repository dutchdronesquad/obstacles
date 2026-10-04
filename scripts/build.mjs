// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCollections } from './check-collections.mjs';
import { workingTreeFiles } from './collections.mjs';

// Writes build/ with the same layout as the asset host; --examples includes unpublished collections.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.chdir(root);
  const examples = process.argv.includes('--examples');
  let read = file => readFileSync(file);
  if (examples) {
    // Treat examples as published for local testing only; publication itself never does this.
    const original = read;
    read = file => /^collections\/[^/]+\/manifest\.json$/.test(file)
      ? Buffer.from(original(file).toString().replace(/"status":\s*"example"/, '"status": "published"')) : original(file);
  }
  const { published } = await checkCollections(workingTreeFiles(), read);
  rmSync('build', { recursive: true, force: true });
  for (const asset of published) {
    mkdirSync(path.dirname(path.join('build', asset.key)), { recursive: true });
    writeFileSync(path.join('build', asset.key), asset.bytes);
  }
  console.log(`Wrote ${published.length} files to build/${examples ? ' (examples included)' : ''}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
