import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const bucket = 'trackdraw-obstacles';
export const origin = 'https://obstacles.trackdraw.app';

export function releaseFiles(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
    throw new Error('Supply a release tag, e.g. v0.1.0.');
  }
  const ref = `refs/tags/${tag}`;
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { encoding: 'utf8' })
    .trim().split('\n').filter(file => /^[a-z0-9-]+\/textures\/[^/]+\.webp$/.test(file));
  if (!files.length) throw new Error(`${tag} contains no runtime textures.`);
  return files.map(file => ({
    file,
    key: `${tag}/${file.replace('/textures/', '/')}`,
    bytes: execFileSync('git', ['show', `${ref}:${file}`]),
  }));
}

export async function checkExisting(files, fetchAsset = fetch) {
  const pending = [];
  for (const asset of files) {
    const response = await fetchAsset(`${origin}/${asset.key}`, { signal: AbortSignal.timeout(30_000) });
    if (response.status === 404) {
      pending.push(asset);
      continue;
    }
    if (!response.ok) throw new Error(`Cannot check ${asset.key}: HTTP ${response.status}`);
    const remote = Buffer.from(await response.arrayBuffer());
    if (!remote.equals(asset.bytes)) throw new Error(`Refusing to overwrite published asset ${asset.key}. Create a new release tag.`);
  }
  return pending;
}

async function main() {
  const [tag, flag] = process.argv.slice(2);
  if (flag && flag !== '--dry-run') throw new Error('Only --dry-run is supported.');
  const files = releaseFiles(tag);
  for (const asset of files) {
    console.log(`${createHash('sha256').update(asset.bytes).digest('hex')}  ${origin}/${asset.key}`);
  }
  if (flag === '--dry-run') return;
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Set CLOUDFLARE_ACCOUNT_ID to the account owning trackdraw.app.');
  // Check every existing object before uploading anything. Identical reruns resume safely.
  const pending = await checkExisting(files);
  const directory = await mkdtemp(path.join(tmpdir(), 'obstacles-release-'));
  try {
    for (const [index, asset] of pending.entries()) {
      const file = path.join(directory, `${index}.webp`);
      await writeFile(file, asset.bytes);
      execFileSync(process.execPath, [
        'node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'put', `${bucket}/${asset.key}`,
        '--remote', '--file', file, '--content-type', 'image/webp',
        '--cache-control', 'public, max-age=31536000, immutable',
      ], { stdio: 'inherit' });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(`Uploaded ${pending.length} textures; ${files.length - pending.length} already matched ${tag}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
