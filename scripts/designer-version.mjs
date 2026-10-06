// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function designerVersion({ event, tag, pr, commit }) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full checked-out commit SHA');
  const short = commit.slice(0, 7);
  if (event === 'release') {
    if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '')) {
      throw new Error('Production requires a stable SemVer release tag, for example v1.2.0');
    }
    return { version: tag, commit };
  }
  if (event === 'pull_request') {
    if (!/^[1-9]\d*$/.test(pr ?? '')) throw new Error('Expected a pull request number');
    return { version: `pr-${pr}-${short}`, commit };
  }
  return { version: `dev-${short}`, commit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const metadata = designerVersion({
    event: process.env.GITHUB_EVENT_NAME,
    tag: process.env.RELEASE_TAG,
    pr: process.env.PR_NUMBER,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  });
  for (const [key, value] of Object.entries(metadata)) console.log(`${key}=${value}`);
}
