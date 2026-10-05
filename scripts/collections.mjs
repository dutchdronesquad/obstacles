// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import sharp from 'sharp';
import { templateDefinitions } from './template-definitions.mjs';

export { templateDefinitions };
const byTemplate = derive => Object.fromEntries(Object.entries(templateDefinitions).map(([id, definition]) => [id, derive(definition)]));
// Versioned artwork slots, not geometry or executable renderer definitions.
export const templates = byTemplate(definition => Object.keys(definition.panels));
// Templates whose back faces are unprinted and may take a solid backColor.
export const backColorTemplates = new Set(Object.keys(templateDefinitions).filter(id => templateDefinitions[id].unprintedBack));
// Panel width/height of the rendered surface, and whether its alpha is ignored (opaque) or required (cut-out).
export const panelImages = byTemplate(definition => ({
  ...Object.fromEntries(Object.entries(definition.panels).map(([panel, region]) => [panel, region.width / region.height])),
  alpha: definition.transparency,
}));
export const limits = { aspectTolerance: 0.01, minEdge: 64, maxEdge: 4096, maxBytes: 512 * 1024, minOpaqueAlpha: 192, sourceDriftPixels: 20 };
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const texturePath = /^textures\/[A-Za-z0-9][A-Za-z0-9._-]*\.webp$/;
function fail(where, message) { throw new Error(`${where}: ${message}`); }
function object(value, where, keys, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'expected object');
  for (const key of Object.keys(value)) if (!keys.includes(key) && !optional.includes(key)) fail(where, `unknown field ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(where, `missing ${key}`);
}
function text(value, where) {
  if (typeof value !== 'string' || !value.trim()) fail(where, 'expected non-empty string');
}
export function validateManifest(manifest, id, files) {
  const where = `collections/${id}/manifest.json`;
  object(manifest, where, ['schemaVersion', 'id', 'name', 'status', 'author', 'attribution', 'usage'], ['textures']);
  if (manifest.schemaVersion !== 1) fail(where, 'unsupported schemaVersion; expected 1');
  if (!slug.test(id) || manifest.id !== id) fail(where, 'id must match the collection directory slug');
  for (const key of ['name', 'author', 'attribution']) text(manifest[key], `${where}.${key}`);
  if (!['published', 'example'].includes(manifest.status)) fail(where, 'status must be published or example');
  object(manifest.usage, `${where}.usage`, ['terms', 'portable']);
  text(manifest.usage.terms, `${where}.usage.terms`);
  if (!['allowed', 'not-granted'].includes(manifest.usage.portable)) fail(where, 'usage.portable must be allowed or not-granted');
  if (!Array.isArray(manifest.textures) || !manifest.textures.length) fail(where, 'no texture sets; add a template sheet to source/ or list textures in the manifest');
  const ids = new Set();
  for (const entry of manifest.textures) {
    object(entry, where, ['id', 'name', 'template', 'panels'], ['backColor']);
    if (typeof entry.id !== 'string' || !slug.test(entry.id) || ids.has(entry.id)) fail(where, `invalid or duplicate texture id ${entry.id}`);
    ids.add(entry.id);
    text(entry.name, `${where}.${entry.id}.name`);
    if (typeof entry.template !== 'string' || !Object.hasOwn(templates, entry.template)) fail(where, `unsupported template ${entry.template}`);
    object(entry.panels, `${where}.${entry.id}.panels`, templates[entry.template]);
    if (Object.hasOwn(entry, 'backColor')) {
      if (!backColorTemplates.has(entry.template)) fail(where, `backColor is not supported for ${entry.template}`);
      if (typeof entry.backColor !== 'string' || !/^#[0-9a-f]{6}$/.test(entry.backColor)) fail(where, `${entry.id}.backColor must be a lowercase #rrggbb colour`);
    }
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

// Decodes every runtime WebP and checks referenced panels against their template's image rules.
export async function checkImages(files, read) {
  for (const file of files) if (/^collections\/[^/]+\/textures\/.+\//.test(file)) fail(file, 'texture folders must be flat; move the file into textures/');
  const runtime = files.filter(file => /^collections\/[^/]+\/textures\/[^/]+\.webp$/.test(file));
  const decoded = new Map();
  for (const file of runtime) {
    const bytes = read(file);
    let image;
    try {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const metadata = await sharp(bytes).metadata();
      let minAlpha = 255;
      for (let i = 3; i < data.length; i += 4) if (data[i] < minAlpha) minAlpha = data[i];
      image = { format: metadata.format, width: info.width, height: info.height, bytes: bytes.length, minAlpha };
    } catch (error) { fail(file, `cannot decode image: ${error.message}`); }
    if (image.format !== 'webp') fail(file, `expected WebP content, found ${image.format}`);
    decoded.set(file, image);
  }
  let checked = 0;
  for (const file of files.filter(file => /^collections\/[^/]+\/manifest\.json$/.test(file))) {
    const id = file.split('/')[1];
    const manifest = JSON.parse(read(file).toString());
    for (const entry of manifest.textures) {
      const rules = panelImages[entry.template];
      for (const [panel, texture] of Object.entries(entry.panels)) {
        const where = `collections/${id}/${texture} (${entry.id}.${panel})`;
        const image = decoded.get(`collections/${id}/${texture}`);
        if (!image) fail(where, 'missing runtime texture');
        const { width, height } = image;
        if (Math.min(width, height) < limits.minEdge || Math.max(width, height) > limits.maxEdge) {
          fail(where, `${width}x${height} px is outside ${limits.minEdge}-${limits.maxEdge} px per edge`);
        }
        const expected = rules[panel];
        if (Math.abs(width / height / expected - 1) > limits.aspectTolerance) {
          const suggestion = expected >= 1 ? `${width}x${Math.round(width / expected)}` : `${Math.round(height * expected)}x${height}`;
          fail(where, `${width}x${height} px does not match the ${entry.template} ${panel} proportions; use for example ${suggestion} px`);
        }
        if (image.bytes > limits.maxBytes) fail(where, `${Math.ceil(image.bytes / 1024)} KiB exceeds ${limits.maxBytes / 1024} KiB`);
        const { minAlpha } = image;
        if (rules.alpha === 'opaque' && minAlpha < limits.minOpaqueAlpha) fail(where, 'contains transparent pixels; this panel renders without transparency, so fill the background');
        if (rules.alpha === 'cut-out' && minAlpha > 0) fail(where, 'has no transparent pixels; keep everything outside the outline transparent');
        checked++;
      }
    }
  }
  return { decoded: decoded.size, checked };
}

export function committedTree() {
  const entries = execFileSync('git', ['ls-tree', '-r', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
  const files = entries.map(entry => {
    const [info, file] = entry.split('\t');
    if (file?.startsWith('collections/') && !info.startsWith('100644 ') && !info.startsWith('100755 ')) fail(file, 'expected regular committed file');
    return file;
  }).filter(Boolean);
  return { files, read: file => execFileSync('git', ['show', `HEAD:${file}`], { maxBuffer: 16 * 1024 * 1024 }) };
}

