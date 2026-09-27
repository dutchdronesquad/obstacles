// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const bucket = 'trackdraw-obstacles';
export const origin = 'https://obstacles.trackdraw.app';

export function assetFiles() {
  const ref = 'HEAD';
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { encoding: 'utf8' })
    .trim().split('\n').filter(file => /^[a-z0-9-]+\/textures\/[^/]+\.webp$/.test(file));
  if (!files.length) throw new Error('HEAD contains no runtime textures.');
  return files.map(file => ({
    file,
    key: file.replace('/textures/', '/'),
    bytes: execFileSync('git', ['show', `${ref}:${file}`]),
  }));
}

async function main() {
  const [flag, ...extra] = process.argv.slice(2);
  if (extra.length || (flag && flag !== '--dry-run')) throw new Error('Only --dry-run is supported.');
  const files = assetFiles();
  for (const asset of files) {
    console.log(`${createHash('sha256').update(asset.bytes).digest('hex')}  ${origin}/${asset.key}`);
  }
  if (flag === '--dry-run') return;
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Set CLOUDFLARE_ACCOUNT_ID to the account owning trackdraw.app.');
  const directory = await mkdtemp(path.join(tmpdir(), 'obstacles-upload-'));
  try {
    for (const [index, asset] of files.entries()) {
      const file = path.join(directory, `${index}.webp`);
      await writeFile(file, asset.bytes);
      execFileSync(process.execPath, [
        'node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'put', `${bucket}/${asset.key}`,
        '--remote', '--file', file, '--content-type', 'image/webp',
        '--cache-control', 'public, max-age=300, must-revalidate',
      ], { stdio: 'inherit' });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(`Uploaded ${files.length} textures to stable URLs.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
