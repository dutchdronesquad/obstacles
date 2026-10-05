// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

// Turns an accepted "Submit obstacle artwork" issue into collection files (prepare, unprivileged)
// and a pull request (open, privileged; never renders or executes submitted content).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { templateDefinitions } from './template-definitions.mjs';

export const fields = { organization: 'Organization', slug: 'Short name', artwork: 'Template sheets', usage: 'Usage', notes: 'Notes' };
// Each usage choice maps to manifest terms; the artwork always stays the organization's property.
export const usageChoices = {
  'In TrackDraw only': { portable: 'not-granted', scope: 'in TrackDraw and compatible viewers' },
  'In TrackDraw, including offline track exports': { portable: 'allowed', scope: 'in TrackDraw and compatible viewers, including portable and offline track exports' },
};
export const limits = { sheets: 10, bytes: 5 * 1024 * 1024, text: 2000 };
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const attachmentPattern = /https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[A-Za-z0-9/_.-]+/g;
function fail(message) { throw new Error(message); }

// Issue forms render as "### <label>\n\n<value>" sections; empty optional fields read "_No response_".
export function parseIssueForm(body) {
  const sections = {};
  for (const part of `\n${body ?? ''}`.split(/\n### /).slice(1)) {
    const [heading, ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    // The first section wins, so text inside a later field cannot override an earlier one.
    sections[heading.trim()] ??= value === '_No response_' ? '' : value;
  }
  const values = {};
  for (const [key, label] of Object.entries(fields)) values[key] = sections[label] ?? '';
  return values;
}

export function attachmentUrls(text) {
  return [...new Set(text.match(attachmentPattern) ?? [])];
}

const slugify = value => value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
// Names reach pull request bodies and comments: no mentions, issue references or code breaks.
export const plain = value => `\`${String(value).replace(/[`@#\n\r]/g, '').slice(0, 200)}\``;
const singleLine = (value, label) => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) fail(`${label} is required.`);
  if (text.length > limits.text) fail(`${label} is longer than ${limits.text} characters.`);
  return text;
};

// Pure: validated form values and downloaded sheets in, repository files out.
// existing: [{ id, name }] of the collections already in the repository.
export function buildSubmission({ values, sheets, issue, existing = [] }) {
  const name = singleLine(values.organization, 'Organization');
  // The short name only appears in URLs; without one it is derived from the organization name.
  const requested = values.slug.trim().replace(/^`|`$/g, '');
  const slug = requested ? requested.toLowerCase() : slugify(name);
  if (requested && (!slugPattern.test(slug) || slug.length > 40)) fail('The short name must be at most 40 lowercase letters, digits and hyphens, for example `dds`.');
  if (!slugPattern.test(slug)) fail('Could not make a short name from the organization; fill in "Short name", for example `dds`.');
  const sameName = existing.find(collection => collection.name.trim().toLowerCase() === name.toLowerCase());
  if (sameName) fail(`${name} already has a collection, \`${sameName.id}\`. To update it, mention that under Notes and a maintainer will help.`);
  if (existing.some(collection => collection.id === slug)) fail(`The short name \`${slug}\` is already taken; choose another one under "Short name".`);
  const usage = usageChoices[values.usage];
  if (!usage) fail('Choose where the artwork may be used.');
  if (!sheets.length) fail('Attach at least one template sheet (.svg) under "Template sheets".');
  if (sheets.length > limits.sheets) fail(`Attach at most ${limits.sheets} template sheets.`);

  const files = new Map();
  const ids = new Set();
  sheets.forEach((svg, index) => {
    const where = `Sheet ${index + 1}`;
    if (svg.length > limits.bytes) fail(`${where} is larger than ${limits.bytes / 1024 / 1024} MB.`);
    if (!/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg\b/i.test(svg)) fail(`${where} is not an SVG file.`);
    const template = /<svg\b[^>]*\sdata-template="([^"]+)"/.exec(svg)?.[1];
    if (!template || !Object.hasOwn(templateDefinitions, template)) fail(`${where} is not one of our template sheets; start from a file in templates/.`);
    const named = /<svg\b[^>]*\sdata-name="([^"]*)"/.exec(svg)?.[1];
    const base = (named && slugify(named)) || templateDefinitions[template].defaultTextureId;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    files.set(`collections/${slug}/source/${id}.svg`, svg);
  });
  const manifest = {
    schemaVersion: 1, id: slug, name, status: 'example', author: name, attribution: `Artwork by ${name}.`,
    usage: { terms: `Artwork and logos remain the property of ${name}. Provided to represent ${name} obstacles ${usage.scope}; no other use or redistribution license is granted.`, portable: usage.portable },
  };
  files.set(`collections/${slug}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  const notes = values.notes.trim();
  files.set(`collections/${slug}/README.md`, [
    `# ${name}`, '',
    `Submitted by @${issue.author} in #${issue.number}. Texture sets: ${[...ids].map(id => `\`${id}\``).join(', ')}, each generated from \`source/<id>.svg\`. See \`manifest.json\` for the usage terms.`,
    ...(notes ? ['', '## Notes from the submitter', '', notes.slice(0, limits.text)] : []), '',
  ].join('\n'));
  return { slug, name, ids: [...ids], files };
}

// The privileged job only accepts these paths and plain-text sizes from the prepare job.
export function checkPrepared(slug, files) {
  if (!slugPattern.test(slug)) fail('invalid slug');
  const allowed = new RegExp(`^collections/${slug}/(?:manifest\\.json|README\\.md|source/[a-z0-9]+(?:-[a-z0-9]+)*\\.svg)$`);
  if (!files.length || files.length > limits.sheets + 2) fail('unexpected number of files');
  for (const { file, bytes } of files) {
    if (!allowed.test(file)) fail(`unexpected path ${file}`);
    if (bytes > limits.bytes) fail(`${file} is too large`);
  }
}

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'obstacles-submission' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) fail(`Could not download ${url} (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limits.bytes) fail(`${url} is larger than ${limits.bytes / 1024 / 1024} MB.`);
  return bytes.toString('utf8');
}

async function prepare(output) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const issue = { number: event.issue.number, author: event.issue.user.login };
  mkdirSync(output, { recursive: true });
  const result = { issue: issue.number };
  try {
    const values = parseIssueForm(event.issue.body);
    const urls = attachmentUrls(values.artwork);
    const sheets = [];
    for (const url of urls.slice(0, limits.sheets + 1)) sheets.push(await download(url));
    const existing = readdirSync('collections').filter(id => existsSync(`collections/${id}/manifest.json`))
      .map(id => ({ id, name: String(JSON.parse(readFileSync(`collections/${id}/manifest.json`, 'utf8')).name ?? '') }));
    const submission = buildSubmission({ values, sheets, issue, existing });
    for (const [file, content] of submission.files) {
      mkdirSync(path.join(output, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(output, file), content);
    }
    // Render and validate exactly like CI, with the new collection added to the repository's files.
    const { checkCollections } = await import('./check-collections.mjs');
    const { workingTreeFiles } = await import('./collections.mjs');
    const added = new Map([...submission.files].map(([file, content]) => [file, Buffer.from(content)]));
    const view = await checkCollections([...workingTreeFiles(), ...added.keys()], file => added.get(file) ?? readFileSync(file));
    Object.assign(result, { ok: true, slug: submission.slug, name: submission.name, ids: submission.ids, author: issue.author, checked: view.checked });
  } catch (error) {
    Object.assign(result, { ok: false, error: error.message.replace(/collections\/[a-z0-9-]+\/source\//g, '') });
  }
  writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(result.ok ? `Prepared ${result.slug} with ${result.ids.length} texture sets.` : `Submission rejected: ${result.error}`);
}

function sh(command, args, input) {
  return execFileSync(command, args, { encoding: 'utf8', input }).trim();
}

function open(input) {
  const repository = process.env.REPOSITORY;
  const issue = Number(process.env.ISSUE_NUMBER);
  const comment = body => sh('gh', ['issue', 'comment', String(issue), '--repo', repository, '--body-file', '-'], body);
  const reject = text => {
    // Fenced and stripped of fences: submitted text in errors cannot mention anyone or close issues.
    comment(`The submission could not be turned into a pull request yet:\n\n\`\`\`text\n${String(text).replace(/`{3,}/g, "'''").slice(0, 1500)}\n\`\`\`\n\nPlease edit the issue (or attach corrected sheets), then a maintainer can add the \`accepted-submission\` label again.`);
    sh('gh', ['issue', 'edit', String(issue), '--repo', repository, '--remove-label', 'accepted-submission']);
  };
  let result;
  try {
    result = JSON.parse(readFileSync(path.join(input, 'result.json'), 'utf8'));
    if (result.issue !== issue) fail('artifact belongs to another issue');
  } catch (error) {
    reject(`The automation could not read its prepared files (${error.message}). See ${process.env.RUN_URL}.`);
    throw error;
  }
  if (!result.ok) { reject(result.error); return; }
  try { openPullRequest({ input, result, issue, repository, comment }); }
  catch (error) {
    reject(`The automation failed while opening the pull request. A maintainer can check ${process.env.RUN_URL}.`);
    throw error;
  }
}

function openPullRequest({ input, result, issue, repository, comment }) {
  const slug = String(result.slug);
  const files = [];
  const walk = directory => readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail('symlinks are not allowed');
    if (entry.isDirectory()) walk(file);
    else if (entry.name !== 'result.json') files.push({ file: path.relative(input, file).split(path.sep).join('/'), bytes: readFileSync(file).length, source: file });
  });
  walk(input);
  checkPrepared(slug, files);
  if (existsSync(`collections/${slug}`)) fail(`collections/${slug} already exists on the default branch`);
  const branch = `submission/${issue}-${slug}`;
  for (const { file, source } of files) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, readFileSync(source));
  }
  const author = String(result.author).replace(/[^A-Za-z0-9-]/g, '');
  const userId = JSON.parse(sh('gh', ['api', `users/${author}`])).id;
  sh('git', ['switch', '--create', branch]);
  sh('git', ['add', `collections/${slug}`]);
  sh('git', ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '--quiet', '-F', '-'],
    `feat: add ${String(result.name).replace(/[\n\r]/g, ' ').slice(0, 80)} texture collection\n\nSubmitted in #${issue}.\n\nCo-authored-by: ${author} <${userId}+${author}@users.noreply.github.com>\n`);
  // The branch belongs to the bot; re-running after a partial failure replaces it.
  sh('git', ['push', '--quiet', '--force', 'origin', branch]);
  const body = [
    `Closes #${issue}`, '',
    `Adds the ${plain(result.name)} collection (\`${slug}\`) submitted by @${author}, with texture sets ${result.ids.map(id => `\`${id}\``).join(', ')}. It stays \`status: example\` until a maintainer publishes it.`, '',
    'Generated from the submission issue. The preview comment below shows the checks and 3D renders.',
  ].join('\n');
  const title = `feat: add ${String(result.name).replace(/[`@#\n\r]/g, '').slice(0, 80)} texture collection`;
  const existing = JSON.parse(sh('gh', ['pr', 'list', '--repo', repository, '--head', branch, '--state', 'open', '--json', 'url']))[0]?.url;
  const url = existing ?? sh('gh', ['pr', 'create', '--repo', repository, '--head', branch, '--title', title, '--label', 'new-feature', '--body-file', '-'], body);
  // Runs started through GITHUB_TOKEN do not trigger the preview-comment workflow,
  // so dispatch the checks here and let the preview step of this workflow post the comment.
  // Two minutes of margin for clock differences between the runner and GitHub.
  const since = new Date(Date.now() - 120_000).toISOString();
  sh('gh', ['workflow', 'run', 'check.yml', '--repo', repository, '--ref', branch]);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `branch=${branch}\nsha=${sh('git', ['rev-parse', 'HEAD'])}\nsince=${since}\n`);
  comment(`Thanks @${author}! The pull request is open: ${url}\n\nIt will show 3D previews of your artwork in a few minutes.`);
}

// Waits for the dispatched check run on the submission branch, then posts its previews like the preview-comment workflow.
async function preview() {
  const { REPOSITORY: repository, BRANCH: branch, HEAD_SHA: sha, SINCE: since } = process.env;
  if (!/^submission\/\d+-[a-z0-9-]+$/.test(branch ?? '') || !/^[0-9a-f]{40}$/.test(sha ?? '')) fail('Set BRANCH and HEAD_SHA from the open step.');
  const deadline = Date.now() + 20 * 60_000;
  let run;
  while (Date.now() < deadline) {
    const runs = JSON.parse(sh('gh', ['run', 'list', '--repo', repository, '--workflow', 'check.yml', '--branch', branch, '--event', 'workflow_dispatch', '--limit', '10', '--json', 'databaseId,status,conclusion,headSha,url,createdAt']));
    run = runs.find(candidate => candidate.headSha === sha && candidate.createdAt >= (since ?? ''));
    if (run?.status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve, 15_000));
  }
  if (run?.status !== 'completed') fail('The checks did not finish within 20 minutes; the preview comment was not posted.');
  const directory = mkdtempSync(path.join(tmpdir(), 'submission-previews-'));
  try { sh('gh', ['run', 'download', String(run.databaseId), '--repo', repository, '--name', 'texture-previews', '--dir', directory]); }
  catch { console.log('The check run has no previews.'); }
  execFileSync(process.execPath, [new URL('./preview-comment.mjs', import.meta.url).pathname, 'update', directory], {
    stdio: 'inherit', env: { ...process.env, HEAD_SHA: sha, CONCLUSION: run.conclusion, RUN_URL: run.url },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, directory] = process.argv.slice(2);
  try {
    if (command === 'prepare') await prepare(directory);
    else if (command === 'open') open(directory);
    else if (command === 'preview') await preview();
    else fail('usage: submission.mjs prepare|open <directory> | preview');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
