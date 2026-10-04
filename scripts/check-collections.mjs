// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkImages, publicationFiles, workingTreeFiles } from './collections.mjs';
import { withGeneratedTextures } from './templates.mjs';

// Generates template textures, then validates manifests and images: everything a contribution must pass.
export async function checkCollections(files, read) {
  const view = await withGeneratedTextures(files, read);
  const published = publicationFiles(view.files, view.read);
  const images = await checkImages(view.files, view.read);
  return { view, published, ...images, sources: view.sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkCollections(workingTreeFiles(), file => readFileSync(file));
    console.log(`Validated collections: ${result.checked} panels from ${result.sources} template sheets and ${result.decoded} runtime images; ${result.published.length} public files (examples excluded).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
