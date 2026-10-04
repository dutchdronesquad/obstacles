// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import path from 'node:path';
import sharp from 'sharp';
import { limits, templates } from './collections.mjs';

// Editable sheet regions per template; sheet units are 1/100 ft for gates.
export const templateSheets = {
  'gate-standard-v1': {
    width: 700, height: 600, scale: 3,
    panels: {
      left: { x: 0, y: 100, width: 100, height: 500, background: '#f8fafc' },
      right: { x: 600, y: 100, width: 100, height: 500, background: '#f8fafc' },
      top: { x: 0, y: 0, width: 700, height: 100, background: '#202e5d' },
    },
  },
  'corner-flag-v1': {
    width: 260, height: 511, scale: 4,
    panels: {
      front: { x: 0, y: 0, width: 100, height: 511 },
      back: { x: 160, y: 0, width: 100, height: 511 },
    },
  },
};

const hideGuides = '#guides{display:none !important}';
const hideText = 'text{display:none !important}';
function fail(where, message) { throw new Error(`${where}: ${message}`); }
function withStyle(svg, css) {
  return Buffer.from(svg.replace(/<svg\b[^>]*>/, tag => `${tag}<style>${css}</style>`));
}

export function readSheet(svg, where) {
  const template = /<svg\b[^>]*\sdata-template="([^"]+)"/.exec(svg.replace(/<!--[\s\S]*?-->/g, ''))?.[1];
  if (!template) fail(where, 'root <svg> needs data-template="<template id>"');
  const sheet = templateSheets[template];
  if (!sheet) fail(where, `no editable sheet for template ${template}`);
  if (!/\sid="artwork"/.test(svg)) fail(where, 'missing the layer with id="artwork"');
  if (!/\sid="guides"/.test(svg)) fail(where, 'missing the layer with id="guides"; guides would be exported');
  if (/<(?:image|use|feImage)\b[^>]*\s(?:xlink:)?href\s*=\s*["'](?!#|data:)/.test(svg)) fail(where, 'linked files are not supported; embed images or use paths');
  if (/<flowRoot\b/.test(svg)) fail(where, 'flowed text is not supported; convert text to paths before exporting');
  const attribute = name => new RegExp(`<svg\\b[^>]*\\s${name}="([^"]*)"`).exec(svg.replace(/<!--[\s\S]*?-->/g, ''))?.[1];
  const name = attribute('data-name'), backColor = attribute('data-back-color');
  if (name !== undefined && !name.trim()) fail(where, 'data-name must not be empty');
  const decode = value => value?.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return { template, sheet, meta: { name: decode(name)?.trim(), backColor } };
}

export async function exportSheet(svg, where) {
  const { template, sheet, meta } = readSheet(svg, where);
  const density = 72 * sheet.scale;
  const render = css => sharp(withStyle(svg, css), { density }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [rendered, withoutText] = await Promise.all([render(hideGuides), render(hideGuides + hideText)]);
  if (!rendered.data.equals(withoutText.data)) fail(where, 'artwork contains live text; convert text to paths before exporting');
  const { width, height } = rendered.info;
  if (width !== sheet.width * sheet.scale || height !== sheet.height * sheet.scale) {
    fail(where, `sheet must be ${sheet.width}x${sheet.height} px; keep the template page size and document units`);
  }
  const panels = {};
  for (const panel of templates[template]) {
    const region = sheet.panels[panel];
    let image = sharp(rendered.data, { raw: rendered.info }).extract({
      left: region.x * sheet.scale, top: region.y * sheet.scale, width: region.width * sheet.scale, height: region.height * sheet.scale,
    });
    // Gate panels render without alpha blending, so flatten onto the physical panel colour.
    if (region.background) image = sharp(await image.png().toBuffer()).flatten({ background: region.background });
    const bytes = await image.webp({ lossless: true, effort: 6 }).toBuffer();
    if (bytes.length > limits.maxBytes) fail(where, `${panel} is ${Math.ceil(bytes.length / 1024)} KiB; simplify artwork to stay under ${limits.maxBytes / 1024} KiB`);
    panels[panel] = bytes;
  }
  return { template, panels, meta };
}

const sheetSource = /^collections\/[a-z0-9-]+\/source\/[^/]+\.svg$/;
const textureId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Other SVGs in source/ (such as original logos) are kept as editable originals, not exported.
export const isTemplateSheet = svg => /<svg\b[^>]*\sdata-template="/.test(svg.replace(/<!--[\s\S]*?-->/g, ''));
const humanize = id => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

// Each template sheet in collections/<id>/source/ is one texture set: its panels are generated
// (never committed) and its entry is appended to the collection manifest in the returned view.
export async function withGeneratedTextures(files, read) {
  const available = new Set(files);
  const generated = new Map(), manifests = new Map();
  let sources = 0;
  for (const source of files.filter(file => sheetSource.test(file)).sort()) {
    const svg = read(source).toString();
    if (!isTemplateSheet(svg)) continue;
    const [, collection] = source.split('/');
    const id = path.posix.basename(source, '.svg');
    if (!textureId.test(id)) fail(source, 'file name must use lowercase letters, digits and hyphens; it becomes the texture id');
    const { template, panels, meta } = await exportSheet(svg, source);
    const entry = { id, name: meta.name ?? humanize(id), template, ...(meta.backColor !== undefined && { backColor: meta.backColor }), panels: {} };
    for (const [panel, bytes] of Object.entries(panels)) {
      const texture = `collections/${collection}/textures/${id}-${panel}.webp`;
      if (available.has(texture)) fail(texture, `is generated from ${source}; delete the committed file`);
      generated.set(texture, bytes);
      entry.panels[panel] = `textures/${id}-${panel}.webp`;
    }
    const file = `collections/${collection}/manifest.json`;
    if (!available.has(file)) fail(`collections/${collection}`, 'missing manifest.json');
    if (!manifests.has(file)) {
      try { manifests.set(file, JSON.parse(read(file).toString())); }
      catch (error) { fail(file, `invalid JSON: ${error.message}`); }
    }
    const manifest = manifests.get(file);
    manifest.textures = [...(Array.isArray(manifest.textures) ? manifest.textures : []), entry];
    sources++;
  }
  const overrides = new Map([...manifests].map(([file, manifest]) => [file, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)]));
  return {
    files: [...files, ...generated.keys()],
    read: file => generated.get(file) ?? overrides.get(file) ?? read(file),
    sources,
  };
}
