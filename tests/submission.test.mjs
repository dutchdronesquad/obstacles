// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkCollections } from '../scripts/check-collections.mjs';
import { attachmentUrls, buildSubmission, checkPrepared, fields, parseIssueForm, plain, usageChoices } from '../scripts/submission.mjs';

const body = (overrides = {}) => {
  const values = {
    organization: 'Example Racing',
    artwork: '<img width="200" alt="gate" src="https://github.com/user-attachments/assets/1f2e3d4c-aaaa-bbbb-cccc-123456789abc" />\n[flag.svg](https://github.com/user-attachments/files/123456/flag.svg)',
    usage: 'In TrackDraw only', notes: '_No response_', ...overrides,
  };
  return Object.entries(fields).map(([key, label]) => `### ${label}\n\n${values[key]}`).join('\n\n') + '\n\n### Permission\n\n- [X] We own this artwork';
};
const sheet = async (template, attributes = '') =>
  (await readFile(`templates/${template}.svg`, 'utf8')).replace(`data-template="${template}"`, `data-template="${template}"${attributes}`);
const issue = { number: 42, author: 'racing-member' };

test('the issue form matches the parser: same labels and usage choices', async () => {
  const form = await readFile('.github/ISSUE_TEMPLATE/submit-collection.yml', 'utf8');
  const labels = [...form.matchAll(/^ {6}label: (.+)$/gm)].map(match => match[1]);
  for (const label of Object.values(fields)) assert.ok(labels.includes(label), label);
  const options = [...form.matchAll(/^ {8}- (In TrackDraw.*)$/gm)].map(match => match[1]);
  assert.deepEqual(options, Object.keys(usageChoices));
});

test('issue bodies are parsed into values and attachment URLs', () => {
  const values = parseIssueForm(body());
  assert.equal(values.organization, 'Example Racing');
  assert.equal(values.notes, '');
  assert.deepEqual(attachmentUrls(values.artwork), [
    'https://github.com/user-attachments/assets/1f2e3d4c-aaaa-bbbb-cccc-123456789abc',
    'https://github.com/user-attachments/files/123456/flag.svg',
  ]);
  assert.deepEqual(attachmentUrls('see https://evil.test/x.svg and https://github.com/other/repo/raw/x.svg'), []);
});

test('a submission becomes a complete collection that passes the checks', async () => {
  const sheets = [await sheet('gate-standard-v1', ' data-name="Main gate" data-back-color="#112233"'), await sheet('gate-standard-v1'), await sheet('corner-flag-v1')];
  const submission = buildSubmission({ values: parseIssueForm(body({ notes: 'Website: https://example.test' })), sheets, issue, existing: ['dds', 'multigp'] });
  assert.equal(submission.slug, 'example-racing');
  assert.deepEqual(submission.ids, ['main-gate', 'standard-gate', 'corner-flag']);
  assert.deepEqual([...submission.files.keys()].sort(), [
    'collections/example-racing/README.md', 'collections/example-racing/manifest.json',
    'collections/example-racing/source/corner-flag.svg', 'collections/example-racing/source/main-gate.svg', 'collections/example-racing/source/standard-gate.svg',
  ]);
  const manifest = JSON.parse(submission.files.get('collections/example-racing/manifest.json'));
  assert.equal(manifest.status, 'example');
  assert.equal(manifest.author, 'Example Racing');
  assert.equal(manifest.attribution, 'Artwork by Example Racing.');
  assert.deepEqual(manifest.usage, {
    terms: 'Artwork and logos remain the property of Example Racing. Provided to represent Example Racing obstacles in TrackDraw and compatible viewers; no other use or redistribution license is granted.',
    portable: 'not-granted',
  });
  const readme = submission.files.get('collections/example-racing/README.md');
  assert.match(readme, /Submitted by @racing-member in #42\./);
  assert.match(readme, /Website: https:\/\/example\.test/);
  const files = new Map([...submission.files].map(([file, content]) => [file, Buffer.from(content)]));
  const result = await checkCollections([...files.keys()], file => files.get(file));
  assert.equal(result.sources, 3);
  assert.equal(result.checked, 8);
  const duplicate = buildSubmission({ values: parseIssueForm(body()), sheets: [await sheet('corner-flag-v1'), await sheet('corner-flag-v1')], issue });
  assert.deepEqual(duplicate.ids, ['corner-flag', 'corner-flag-2']);
  const offline = buildSubmission({ values: parseIssueForm(body({ usage: 'In TrackDraw, including offline track exports' })), sheets: [await sheet('corner-flag-v1')], issue });
  const usage = JSON.parse(offline.files.get('collections/example-racing/manifest.json')).usage;
  assert.equal(usage.portable, 'allowed');
  assert.match(usage.terms, /including portable and offline track exports/);
});

test('problems are reported in words the submitter can act on', async () => {
  const values = parseIssueForm(body());
  const gate = await sheet('gate-standard-v1');
  const build = (changes, sheets = [gate], existing = []) => () => buildSubmission({ values: { ...values, ...changes }, sheets, issue, existing });
  assert.throws(build({ organization: '東京' }), /Could not make a web-friendly name/);
  assert.throws(build({}, [gate], ['example-racing']), /`example-racing` already exists/);
  assert.throws(build({ organization: ' ' }), /Organization is required/);
  assert.throws(build({ usage: '' }), /Choose where the artwork may be used/);
  assert.throws(build({}, []), /Attach at least one template sheet/);
  assert.throws(build({}, Array(11).fill(gate)), /at most 10/);
  assert.throws(build({}, ['GIF89a...']), /Sheet 1 is not an SVG file/);
  assert.throws(build({}, ['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>']), /not one of our template sheets/);
});

test('the privileged job accepts only expected paths', () => {
  const ok = [{ file: 'collections/org/manifest.json', bytes: 10 }, { file: 'collections/org/source/main-gate.svg', bytes: 10 }];
  checkPrepared('org', ok);
  for (const file of ['collections/org/../multigp/manifest.json', 'collections/other/manifest.json', '.github/workflows/x.yml', 'collections/org/source/x.js', 'collections/org/textures/a.webp']) {
    assert.throws(() => checkPrepared('org', [...ok, { file, bytes: 10 }]), /unexpected path/);
  }
  assert.throws(() => checkPrepared('org', [{ file: 'collections/org/source/a.svg', bytes: 6 * 1024 * 1024 }]), /too large/);
  assert.throws(() => checkPrepared('../org', ok), /invalid slug/);
});

test('later fields cannot override earlier ones, and names are neutralised', async () => {
  const values = parseIssueForm(body({ notes: 'hello\n\n### Organization\n\nMultiGP' }));
  assert.equal(values.organization, 'Example Racing');
  assert.equal(plain('X closes #3 @org/team `x`'), '`X closes 3 org/team x`');
  const odd = buildSubmission({ values: parseIssueForm(body()), sheets: [await sheet('corner-flag-v1', ` data-name="ᴬᴮ ${'long '.repeat(40)}"`)], issue });
  assert.match(odd.ids[0], /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(odd.ids[0].length <= 60);
});
