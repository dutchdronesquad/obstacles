// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

// Trusted helper for the preview workflows: everything read from the check run's artifact is untrusted data.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const branch = 'pr-previews';
export const marker = '<!-- texture-preview -->';
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const previewName = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:--([a-z0-9]+(?:-[a-z0-9]+)*)--3d)?\.png$/;
const limits = { files: 40, bytes: 8 * 1024 * 1024, output: 4000 };

// Keeps only well-formed PNG previews; returns them grouped per collection.
export function acceptedPreviews(directory) {
  if (!existsSync(directory)) return [];
  const accepted = [];
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const match = previewName.exec(name);
    if (!match || !statSync(file).isFile() || statSync(file).size > limits.bytes) continue;
    if (!readFileSync(file).subarray(0, 8).equals(pngSignature)) continue;
    accepted.push({ name, file, collection: match[1], texture: match[2] });
    if (accepted.length === limits.files) break;
  }
  return accepted;
}

export function checkOutput(directory) {
  const file = path.join(directory, 'check-output.txt');
  if (!existsSync(file) || statSync(file).size > 1024 * 1024) return '';
  // Plain text in a fenced block: strip control characters and anything that could close the fence.
  const text = readFileSync(file, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').replace(/[^\n\t\x20-\x7e -￿]/g, '').replace(/`{3,}/g, "'''");
  return text.length > limits.output ? `…${text.slice(-limits.output)}` : text;
}

export function commentBody({ previews, output, conclusion, runUrl, rawBase, sha }) {
  const status = conclusion === 'success' ? '✅ All checks passed.' : `❌ Checks failed. See [the run](${runUrl}) for details.`;
  const lines = [marker, '## Texture preview', '', status, ''];
  if (conclusion !== 'success' && output.trim()) lines.push('<details open><summary>Check output</summary>', '', '```text', output.trim(), '```', '', '</details>', '');
  const collections = [...new Set(previews.map(preview => preview.collection))];
  if (!collections.length) lines.push('No collection changes to preview.');
  for (const collection of collections) {
    lines.push(`### ${collection}`, '');
    for (const preview of previews.filter(item => item.collection === collection && item.texture)) {
      lines.push(`![${preview.texture} in 3D](${rawBase}/${preview.name})`, '');
    }
    const sheet = previews.find(item => item.collection === collection && !item.texture);
    if (sheet) lines.push(`<details><summary>Contact sheet: every panel, its top edge and the back</summary>`, '', `![${collection} contact sheet](${rawBase}/${sheet.name})`, '', '</details>', '');
  }
  lines.push(`<sub>Updated for ${sha.slice(0, 7)}. Renders use TrackDraw's 3D viewer; a maintainer still checks the final result.</sub>`);
  return lines.join('\n');
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024 });
}
function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

// Rewrites the previews branch as a single commit so old images do not accumulate in history.
function updateBranch(repository, change) {
  const remote = `https://x-access-token:${process.env.GH_TOKEN}@github.com/${repository}.git`;
  const directory = mkdtempSync(path.join(tmpdir(), 'pr-previews-'));
  try {
    git(directory, ['init', '--quiet']);
    git(directory, ['remote', 'add', 'origin', remote]);
    try { git(directory, ['fetch', '--quiet', '--depth', '1', 'origin', branch]); git(directory, ['checkout', '--quiet', 'FETCH_HEAD']); }
    catch { /* first preview: start empty */ }
    change(directory);
    git(directory, ['checkout', '--quiet', '--orphan', 'next']);
    git(directory, ['add', '--all']);
    git(directory, ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '--quiet', '--allow-empty', '-m', 'Texture previews for open pull requests']);
    git(directory, ['push', '--quiet', '--force', 'origin', `next:${branch}`]);
    return git(directory, ['rev-parse', 'HEAD']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function findPullRequest(repository, sha) {
  const open = JSON.parse(gh(['pr', 'list', '--repo', repository, '--state', 'open', '--limit', '200', '--json', 'number,headRefOid']));
  return open.find(pr => pr.headRefOid === sha)?.number;
}

function upsertComment(repository, number, body) {
  const comments = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${number}/comments`])).flat();
  const existing = comments.find(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker));
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
    updateBranch(repository, directory => rmSync(path.join(directory, `pr-${argument}`), { recursive: true, force: true }));
    return;
  }
  if (command !== 'update') throw new Error('usage: preview-comment.mjs update <artifact directory> | remove <number>');
  const sha = process.env.HEAD_SHA ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Set HEAD_SHA to the checked commit.');
  const number = findPullRequest(repository, sha);
  if (!number) { console.log(`No open pull request has head ${sha}; nothing to comment on.`); return; }
  const previews = acceptedPreviews(argument);
  let commit = '';
  if (previews.length) {
    commit = updateBranch(repository, directory => {
      const target = path.join(directory, `pr-${number}`);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      for (const preview of previews) cpSync(preview.file, path.join(target, preview.name));
    });
  }
  const body = commentBody({
    previews, output: checkOutput(argument), conclusion: process.env.CONCLUSION, runUrl: process.env.RUN_URL,
    rawBase: `https://raw.githubusercontent.com/${repository}/${commit}/pr-${number}`, sha,
  });
  upsertComment(repository, number, body);
  console.log(`Updated the preview comment on #${number} with ${previews.length} images.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
