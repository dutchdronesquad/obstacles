// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

// Trusted helper for the preview workflows: everything read from the check run's artifact is untrusted data.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const branch = 'pr-previews';
export const marker = '<!-- texture-preview -->';
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const previewName = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:--([a-z0-9]+(?:-[a-z0-9]+)*)--3d)?\.png$/;
const limits = { files: 20, bytes: 2 * 1024 * 1024, total: 20 * 1024 * 1024, output: 4000 };

// Keeps only well-formed PNG previews; returns them grouped per collection.
export function acceptedPreviews(directory) {
  if (!existsSync(directory)) return [];
  const accepted = [];
  let total = 0;
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const match = previewName.exec(name);
    // lstat: never follow links out of the artifact.
    const stat = lstatSync(file);
    if (!match || !stat.isFile() || stat.size > limits.bytes || total + stat.size > limits.total) continue;
    if (!readFileSync(file).subarray(0, 8).equals(pngSignature)) continue;
    accepted.push({ name, file, collection: match[1], texture: match[2] });
    total += stat.size;
    if (accepted.length === limits.files) break;
  }
  return accepted;
}

export function checkOutput(directory) {
  const file = path.join(directory, 'check-output.txt');
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).size > 1024 * 1024) return '';
  // Plain text in a fenced block: strip control characters and anything that could close the fence.
  const text = readFileSync(file, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').replace(/[^\n\t\x20-\x7e -￿]/g, '').replace(/`{3,}/g, "'''");
  return text.length > limits.output ? `…${text.slice(-limits.output)}` : text;
}

export function commentBody({ previews, output, conclusion, runUrl, rawBase, sha, toolingChanged = false }) {
  const image = name => `${rawBase}/${name}?v=${sha.slice(0, 7)}`;
  const status = conclusion === 'success' ? '✅ All checks passed.' : `❌ Checks failed. See [the run](${runUrl}) for details.`;
  const lines = [marker, '## Texture preview', '', status, ''];
  if (toolingChanged) lines.push('> [!WARNING]', '> This pull request changes workflows, scripts or dependencies, so the result and images below come from its own code. Verify them independently before merging.', '');
  if (conclusion !== 'success' && output.trim()) lines.push('<details open><summary>Check output</summary>', '', '```text', output.trim(), '```', '', '</details>', '');
  const collections = [...new Set(previews.map(preview => preview.collection))];
  if (!collections.length) lines.push('No collection changes to preview.');
  for (const collection of collections) {
    lines.push(`### ${collection}`, '');
    for (const preview of previews.filter(item => item.collection === collection && item.texture)) {
      lines.push(`![${preview.texture} in 3D](${image(preview.name)})`, '');
    }
    const sheet = previews.find(item => item.collection === collection && !item.texture);
    if (sheet) lines.push(`<details><summary>Contact sheet: every panel, its top edge and the back</summary>`, '', `![${collection} contact sheet](${image(sheet.name)})`, '', '</details>', '');
  }
  lines.push(`<sub>Updated for ${sha.slice(0, 7)}. Renders use TrackDraw's 3D viewer; a maintainer still checks the final result.</sub>`);
  return lines.join('\n');
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });
}
// The token goes in an auth header via environment config, never in a URL or argument.
function gitEnv() {
  const auth = Buffer.from(`x-access-token:${process.env.GH_TOKEN}`).toString('base64');
  return { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}` };
}
function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Rewrites the previews branch as a single commit so old images do not accumulate; a lease
// against the fetched commit keeps concurrent runs from overwriting each other's previews.
function updateBranch(repository, change) {
  for (let attempt = 1; ; attempt++) {
    const directory = mkdtempSync(path.join(tmpdir(), 'pr-previews-'));
    try {
      git(directory, ['init', '--quiet']);
      git(directory, ['remote', 'add', 'origin', `https://github.com/${repository}.git`]);
      let base = '';
      try { base = git(directory, ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`]).split('\t')[0]; }
      catch (error) { if (error.status !== 2) throw error; } // 2: the branch does not exist yet
      if (base) { git(directory, ['fetch', '--quiet', '--depth', '1', 'origin', base]); git(directory, ['checkout', '--quiet', 'FETCH_HEAD']); }
      if (change(directory) === false) return;
      git(directory, ['checkout', '--quiet', '--orphan', 'next']);
      git(directory, ['add', '--all']);
      git(directory, ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '--quiet', '--allow-empty', '-m', 'Texture previews for open pull requests']);
      try {
        git(directory, ['push', '--quiet', `--force-with-lease=refs/heads/${branch}:${base}`, 'origin', `next:refs/heads/${branch}`]);
        return;
      } catch (error) {
        if (attempt === 5) throw error;
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function findPullRequest(repository, sha) {
  const open = JSON.parse(gh(['pr', 'list', '--repo', repository, '--state', 'open', '--limit', '200', '--json', 'number,headRefOid']));
  return open.find(pr => pr.headRefOid === sha)?.number;
}

function findComment(repository, number) {
  const comments = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments`])).flat();
  return comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker));
}

function upsertComment(repository, number, body) {
  const existing = findComment(repository, number);
  const payload = JSON.stringify({ body });
  if (existing) gh(['api', '--method', 'PATCH', `repos/${repository}/issues/comments/${existing.id}`, '--input', '-'], payload);
  else gh(['api', '--method', 'POST', `repos/${repository}/issues/${number}/comments`, '--input', '-'], payload);
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  const repository = process.env.REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Set REPOSITORY to owner/name.');
  if (command === 'remove') {
    if (!/^\d+$/.test(argument ?? '')) throw new Error('usage: preview-comment.mjs remove <pull request number>');
    updateBranch(repository, directory => {
      const target = path.join(directory, `pr-${argument}`);
      if (!existsSync(target)) return false;
      rmSync(target, { recursive: true, force: true });
    });
    return;
  }
  if (command !== 'update') throw new Error('usage: preview-comment.mjs update <artifact directory> | remove <number>');
  const sha = process.env.HEAD_SHA ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Set HEAD_SHA to the checked commit.');
  const number = findPullRequest(repository, sha);
  if (!number) { console.log(`No open pull request has head ${sha}; nothing to comment on.`); return; }
  const previews = acceptedPreviews(argument);
  if (!previews.length && !findComment(repository, number)) { console.log('No collection previews and no earlier comment; skipping.'); return; }
  if (previews.length) {
    updateBranch(repository, directory => {
      const target = path.join(directory, `pr-${number}`);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      for (const preview of previews) cpSync(preview.file, path.join(target, preview.name));
    });
  }
  const changed = JSON.parse(gh(['pr', 'view', String(number), '--repo', repository, '--json', 'files'])).files.map(file => file.path);
  const toolingChanged = changed.some(file => /^(?:\.github\/|scripts\/|package(?:-lock)?\.json$)/.test(file));
  const body = commentBody({
    toolingChanged, previews, output: checkOutput(argument), conclusion: process.env.CONCLUSION, runUrl: process.env.RUN_URL,
    rawBase: `https://raw.githubusercontent.com/${repository}/${branch}/pr-${number}`, sha,
  });
  upsertComment(repository, number, body);
  console.log(`Updated the preview comment on #${number} with ${previews.length} images.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
