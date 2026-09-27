// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Versioned artwork slots, not geometry or executable renderer definitions.
export const templates = {
  'gate-standard-v1': ['left', 'right', 'top'],
  'gate-championship-v1': ['left', 'right', 'top'],
  'corner-flag-v1': ['front', 'back'],
  'hurdle-v1': ['front'],
};
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const texturePath = /^textures\/[A-Za-z0-9][A-Za-z0-9._-]*\.webp$/;
function fail(where, message) { throw new Error(`${where}: ${message}`); }
function object(value, where, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'expected object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(where, `unknown field ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(where, `missing ${key}`);
}
function text(value, where) {
  if (typeof value !== 'string' || !value.trim()) fail(where, 'expected non-empty string');
}
export function validateManifest(manifest, id, files) {
  const where = `collections/${id}/manifest.json`;
  object(manifest, where, ['schemaVersion', 'id', 'name', 'status', 'author', 'attribution', 'usage', 'textures']);
  if (manifest.schemaVersion !== 1) fail(where, 'unsupported schemaVersion; expected 1');
  if (!slug.test(id) || manifest.id !== id) fail(where, 'id must match the collection directory slug');
  for (const key of ['name', 'author', 'attribution']) text(manifest[key], `${where}.${key}`);
  if (!['published', 'example'].includes(manifest.status)) fail(where, 'status must be published or example');
  object(manifest.usage, `${where}.usage`, ['terms', 'portable']);
  text(manifest.usage.terms, `${where}.usage.terms`);
  if (!['allowed', 'not-granted'].includes(manifest.usage.portable)) fail(where, 'usage.portable must be allowed or not-granted');
  if (!Array.isArray(manifest.textures) || !manifest.textures.length) fail(where, 'textures must be a non-empty array');
  const ids = new Set();
  for (const entry of manifest.textures) {
    object(entry, where, ['id', 'name', 'template', 'panels']);
    if (typeof entry.id !== 'string' || !slug.test(entry.id) || ids.has(entry.id)) fail(where, `invalid or duplicate texture id ${entry.id}`);
    ids.add(entry.id);
    text(entry.name, `${where}.${entry.id}.name`);
    if (typeof entry.template !== 'string' || !Object.hasOwn(templates, entry.template)) fail(where, `unsupported template ${entry.template}`);
    object(entry.panels, `${where}.${entry.id}.panels`, templates[entry.template]);
    for (const file of Object.values(entry.panels)) {
      if (typeof file !== 'string' || !texturePath.test(file)) fail(where, `unsafe or invalid texture path ${file}`);
      if (!files.has(`collections/${id}/${file}`)) fail(where, `missing panel file ${file}`);
    }
  }
  return manifest;
}

export function workingTreeFiles(directory = 'collections') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) fail(file, 'symlinks are not supported');
    return entry.isDirectory() ? workingTreeFiles(file) : [file];
  });
}

export function publicationFiles(files, read) {
  const available = new Set(files);
  const manifests = files.filter(file => /^collections\/[^/]+\/manifest\.json$/.test(file)).sort();
  if (!manifests.length) fail('collections', 'no manifests found');
  const textures = [], metadata = [], index = [];
  const known = new Set();
  for (const file of manifests) {
    const id = file.split('/')[1];
    known.add(id);
    let manifest;
    try { manifest = JSON.parse(read(file).toString()); }
    catch (error) { fail(file, `invalid JSON: ${error.message}`); }
    validateManifest(manifest, id, available);
    if (manifest.status === 'example') continue;
    // Include unreferenced historical textures too: old clients may still use them.
    for (const texture of files.filter(candidate => candidate.startsWith(`collections/${id}/textures/`)).sort()) {
      const relative = texture.slice(`collections/${id}/`.length);
      if (!relative.endsWith('.webp')) continue;
      if (!texturePath.test(relative)) fail(texture, 'invalid runtime filename');
      textures.push({ file: texture, key: `${id}/${relative.slice('textures/'.length)}`, bytes: read(texture), contentType: 'image/webp' });
    }
    const published = structuredClone(manifest);
    for (const entry of published.textures) {
      for (const [panel, texture] of Object.entries(entry.panels)) entry.panels[panel] = `/${id}/${texture.slice('textures/'.length)}`;
    }
    const key = `${id}/manifest.json`;
    metadata.push({ key, bytes: Buffer.from(`${JSON.stringify(published, null, 2)}\n`), contentType: 'application/json' });
    index.push({ id, name: manifest.name, manifest: `/${key}` });
  }
  for (const file of files.filter(file => /^collections\/[^/]+\/textures\/.*\.webp$/.test(file))) {
    if (!known.has(file.split('/')[1])) fail(file, 'collection is missing manifest.json');
  }
  return [...textures, ...metadata, {
    key: 'collections.json', bytes: Buffer.from(`${JSON.stringify({ schemaVersion: 1, collections: index }, null, 2)}\n`), contentType: 'application/json',
  }];
}

export function committedPublicationFiles() {
  const entries = execFileSync('git', ['ls-tree', '-r', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
  const files = entries.map(entry => {
    const [info, file] = entry.split('\t');
    if (file?.startsWith('collections/') && !info.startsWith('100644 ') && !info.startsWith('100755 ')) fail(file, 'expected regular committed file');
    return file;
  }).filter(Boolean);
  return publicationFiles(files, file => execFileSync('git', ['show', `HEAD:${file}`], { maxBuffer: 16 * 1024 * 1024 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = publicationFiles(workingTreeFiles(), file => readFileSync(file));
  console.log(`Validated collections; ${files.length} public files (examples excluded).`);
}
