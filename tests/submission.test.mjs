// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkCollections } from '../scripts/check-collections.mjs';
import { attachmentUrls, buildSubmission, checkPrepared, fields, parseIssueForm, plain, usageChoices } from '../scripts/submission.mjs';
import { submissionUrl, submissionUsage } from '../designer/app/src/submission.ts';

const body = (overrides = {}) => {
  const values = {
    organization: 'Example Racing', slug: '_No response_',
    artwork: '<img width="200" alt="gate" src="https://github.com/user-attachments/assets/1f2e3d4c-aaaa-bbbb-cccc-123456789abc" />\n[flag.svg](https://github.com/user-attachments/files/123456/flag.svg)',
    usage: 'In TrackDraw only', notes: '_No response_', ...overrides,
  };
  return Object.entries(fields).map(([key, label]) => `### ${label}\n\n${values[key]}`).join('\n\n') + '\n\n### Permission\n\n- [X] We own this artwork';
};
const sheet = async (template, attributes = '') =>
  (await readFile(`templates/${template}.svg`, 'utf8')).replace(`data-template="${template}"`, `data-template="${template}"${attributes}`);
const issue = { number: 42, author: 'racing-member' };
const existing = [{ id: 'dds', name: 'Dutch Drone Squad' }, { id: 'multigp', name: 'MultiGP' }];

test('the issue form matches the parser: same labels and usage choices', async () => {
  const form = await readFile('.github/ISSUE_TEMPLATE/submit-collection.yml', 'utf8');
  const labels = [...form.matchAll(/^ {6}label: (.+)$/gm)].map(match => match[1]);
  for (const label of Object.values(fields)) assert.ok(labels.includes(label), label);
  for (const choice of Object.keys(usageChoices)) assert.ok(form.includes(`\`${choice}\``));
  assert.deepEqual(submissionUsage, Object.keys(usageChoices));
  assert.match(form, /type: upload\n    id: artwork[\s\S]*?validations:\n      required: true\n      accept: "\.svg"/);
  assert.match(form, /type: input\n    id: usage/);
});

test('designer links safely prefill the form without confirming permission or attaching files', () => {
  for (const usage of submissionUsage) {
    const url = new URL(submissionUrl('  Racing & 東京 #1  ', '', usage));
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.pathname, '/dutchdronesquad/track-assets/issues/new');
    assert.equal(url.searchParams.get('template'), 'submit-collection.yml');
    assert.equal(url.searchParams.get('title'), 'collection: Racing & 東京 #1');
    assert.equal(url.searchParams.get('organization'), 'Racing & 東京 #1');
    assert.equal(url.searchParams.get('slug'), '');
    assert.equal(url.searchParams.get('usage'), usage);
    assert.equal(url.searchParams.has('permission'), false);
    assert.equal(url.searchParams.has('artwork'), false);
  }
  assert.equal(new URL(submissionUrl('Club', ' club-2 ', submissionUsage[0])).searchParams.get('slug'), 'club-2');
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
  const submission = buildSubmission({ values: parseIssueForm(body({ notes: 'Website: https://example.test' })), sheets, issue, existing });
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
  assert.throws(build({ organization: '東京' }), /fill in "Short name"/);
  assert.equal(build({ organization: '東京', slug: 'tokyo' })().slug, 'tokyo');
  assert.equal(build({ organization: 'Dutch Drone Squad Juniors', slug: '`ddsj`' }, [gate], existing)().slug, 'ddsj');
  assert.throws(build({}, [gate], [{ id: 'example-racing', name: 'Someone else' }]), /short name `example-racing` is already taken/);
  assert.throws(build({ organization: 'dutch drone squad' }, [gate], existing), /dutch drone squad already has a collection, `dds`/);
  assert.throws(build({ organization: 'New Racing', slug: 'dds' }, [gate], existing), /short name `dds` is already taken/);
  assert.throws(build({ slug: 'Not Valid!' }), /at most 40 lowercase letters/);
  assert.throws(build({ slug: 'a'.repeat(41) }), /at most 40 lowercase letters/);
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


test('Championship submission keeps the existing template ID and independent panel mapping', async () => {
  const submission = buildSubmission({ values: parseIssueForm(body()), sheets: [await sheet('gate-championship-v1')], issue, existing });
  assert.deepEqual(submission.ids, ['championship-gate']);
  const files = new Map([...submission.files].map(([file, content]) => [file, Buffer.from(content)]));
  const result = await checkCollections([...files.keys()], file => files.get(file));
  const [entry] = JSON.parse(result.view.read('collections/example-racing/manifest.json')).textures;
  assert.equal(entry.template, 'gate-championship-v1');
  assert.notEqual(entry.panels.left, entry.panels.right);
  assert.equal(result.checked, 3);
});
