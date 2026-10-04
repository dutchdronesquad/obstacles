// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const bucket = 'trackdraw-assets';
export const origin = 'https://assets.trackdraw.app';

// Public files from committed HEAD bytes, including textures generated from template sheets.
// Loaded lazily: publishing from a build directory needs no image libraries.
export async function assetFiles() {
  const { checkCollections } = await import('./check-collections.mjs');
  const { committedTree } = await import('./collections.mjs');
  const { files, read } = committedTree();
  return (await checkCollections(files, read)).published;
}

// Reads a textures:build output without rendering anything: textures first, then manifests, then the index.
export function builtFiles(directory) {
  const files = [];
  const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const file = path.join(dir, entry.name), key = `${prefix}${entry.name}`;
    if (!lstatSync(file).isDirectory() && !lstatSync(file).isFile()) throw new Error(`${key}: only regular files are allowed`);
    if (entry.isDirectory()) return walk(file, `${key}/`);
    if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\.webp|manifest\.json)|collections\.json)$/.test(key)) throw new Error(`${key}: unexpected file in build output`);
    files.push({ key, bytes: readFileSync(file), contentType: key.endsWith('.webp') ? 'image/webp' : 'application/json' });
  });
  walk(directory);
  const rank = ({ key }) => (key === 'collections.json' ? 2 : key.endsWith('.json') ? 1 : 0);
  files.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
  if (files.at(-1)?.key !== 'collections.json') throw new Error('build output is missing collections.json');
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const from = args.includes('--from') ? args[args.indexOf('--from') + 1] : undefined;
  if (args.some((arg, i) => arg !== '--dry-run' && arg !== '--from' && args[i - 1] !== '--from') || (args.includes('--from') && !from)) {
    throw new Error('usage: upload-assets.mjs [--dry-run] [--from <build directory>]');
  }
  // Upload exactly the bytes that were checked: a checked build output, or committed and generated files.
  const files = from ? builtFiles(from) : await assetFiles();
  for (const asset of files) {
    console.log(`${createHash('sha256').update(asset.bytes).digest('hex')}  ${origin}/${asset.key}`);
  }
  if (dryRun) return;
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Set CLOUDFLARE_ACCOUNT_ID to the account owning trackdraw.app.');
  const directory = await mkdtemp(path.join(tmpdir(), 'obstacles-upload-'));
  try {
    for (const [index, asset] of files.entries()) {
      const file = path.join(directory, `${index}.asset`);
      await writeFile(file, asset.bytes);
      execFileSync(process.execPath, [
        'node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'put', `${bucket}/${asset.key}`,
        '--remote', '--file', file, '--content-type', asset.contentType,
        '--cache-control', 'public, max-age=300, must-revalidate',
      ], { stdio: 'inherit' });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(`Uploaded ${files.length} files to stable URLs.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
