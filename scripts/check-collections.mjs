// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkImages, publicationFiles, workingTreeFiles } from './collections.mjs';
import { checkSources } from './templates.mjs';

// Manifests, runtime images and editable sources: everything a contribution must pass before review.
export async function checkCollections(files, read) {
  const published = publicationFiles(files, read);
  const images = await checkImages(files, read);
  const sources = await checkSources(files, read);
  return { published: published.length, ...images, sources };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkCollections(workingTreeFiles(), file => readFileSync(file));
    console.log(`Validated collections: ${result.checked} panels, ${result.decoded} runtime images, ${result.sources} editable sources; ${result.published} public files (examples excluded).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
