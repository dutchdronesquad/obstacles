// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { limits, templates, workingTreeFiles } from './collections.mjs';

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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  return { template, sheet };
}

export async function exportSheet(svg, where) {
  const { template, sheet } = readSheet(svg, where);
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
  return { template, panels };
}

const sheetSource = /^collections\/[a-z0-9-]+\/source\/[A-Za-z0-9][A-Za-z0-9._-]*\.svg$/;
// Other SVGs in source/ (such as original logos) are kept as editable originals, not exported.
export const isTemplateSheet = svg => /<svg\b[^>]*\sdata-template="/.test(svg.replace(/<!--[\s\S]*?-->/g, ''));
export function textureFile(source, panel) {
  return source.replace(/\/source\/([^/]+)\.svg$/, (_, name) => `/textures/${name}-${panel}.webp`);
}

// Fails when committed textures no longer match an export of their editable SVG source.
export async function checkSources(files, read) {
  const available = new Set(files);
  const sources = files.filter(file => sheetSource.test(file) && isTemplateSheet(read(file).toString()));
  for (const source of sources) {
    const { panels } = await exportSheet(read(source).toString(), source);
    for (const [panel, bytes] of Object.entries(panels)) {
      const texture = textureFile(source, panel);
      if (!available.has(texture)) fail(source, `missing ${texture}; run npm run textures:export`);
      const committed = await sharp(read(texture)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const exported = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (committed.info.width !== exported.info.width || committed.info.height !== exported.info.height) {
        fail(texture, `is ${committed.info.width}x${committed.info.height} px but ${source} exports ${exported.info.width}x${exported.info.height} px; run npm run textures:export`);
      }
      // Export is lossless with pinned renderers; allow only stray anti-aliasing pixels, not edited artwork.
      let changed = 0;
      for (let i = 0; i < committed.data.length; i += 4) {
        if ([0, 1, 2, 3].some(c => Math.abs(committed.data[i + c] - exported.data[i + c]) > 16)) changed++;
      }
      if (changed > limits.sourceDriftPixels) fail(texture, `out of date with ${source} (${changed} pixels differ); run npm run textures:export`);
    }
  }
  return sources.length;
}

// Writes collections/<id>/textures/<source name>-<panel>.webp next to collections/<id>/source/.
export async function exportFile(file) {
  const absolute = path.resolve(process.env.INIT_CWD ?? '.', file);
  if (!sheetSource.test(path.relative(root, absolute).split(path.sep).join('/'))) {
    fail(file, 'file must be at collections/<id>/source/<name>.svg; copy the shared template there first');
  }
  file = absolute;
  const { template, panels } = await exportSheet(readFileSync(file, 'utf8'), file);
  const directory = path.join(path.dirname(file), '..', 'textures');
  mkdirSync(directory, { recursive: true });
  const written = Object.entries(panels).map(([panel, bytes]) => {
    const output = path.join(directory, `${path.basename(file, '.svg')}-${panel}.webp`);
    if (path.resolve(output) === file) fail(file, 'refusing to overwrite the source');
    writeFileSync(output, bytes);
    return output;
  });
  return { template, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let files = process.argv.slice(2);
    // Without arguments, regenerate every editable source in every collection.
    if (!files.length) {
      files = workingTreeFiles(path.join(root, 'collections'))
        .filter(file => sheetSource.test(path.relative(root, file).split(path.sep).join('/')) && isTemplateSheet(readFileSync(file, 'utf8')));
    }
    for (const file of files) {
      const { template, written } = await exportFile(file);
      console.log(`${path.relative(root, path.resolve(process.env.INIT_CWD ?? '.', file))} (${template}):\n${written.map(output => `  ${path.relative(root, output)}`).join('\n')}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
