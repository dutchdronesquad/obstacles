// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { workingTreeFiles } from './collections.mjs';

// How each panel appears to a viewer, in template units; rotate is the in-plane turn the renderer applies.
export const previewLayouts = {
  'gate-standard-v1': {
    width: 700, height: 600, views: ['Front view'],
    panels: { top: [0, 0, 700, 100], left: [0, 100, 100, 500], right: [600, 100, 100, 500] },
    back: { top: '#202e5d', sides: '#f8fafc' },
  },
  'gate-championship-v1': {
    width: 1000, height: 800, views: ['Front view'],
    panels: { top: [0, 0, 1000, 200], left: [0, 200, 150, 600], right: [850, 200, 150, 600, 180] },
    back: { top: '#202e5d', sides: '#f8fafc' },
  },
  'corner-flag-v1': {
    width: 260, height: 511, views: ['Front, seen from the front', 'Back, seen from behind'],
    panels: { front: [0, 0, 100, 511], back: [160, 0, 100, 511] },
    poles: [[0, 511, 0, 0], [260, 511, 260, 0]],
  },
  'hurdle-v1': { width: 200, height: 100, views: ['Front view'], panels: { front: [0, 0, 200, 100] } },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const card = { width: 1200, art: 620, pad: 24, header: 56 };

async function textureCard(id, entry, read) {
  const layout = previewLayouts[entry.template];
  const scale = Math.min(card.art / layout.width, 520 / layout.height);
  const artW = Math.round(layout.width * scale), artH = Math.round(layout.height * scale);
  const backH = layout.back ? Math.round(artH * 0.35) : 0;
  const height = card.header + artH + (backH ? backH + 40 : 0) + card.pad * 2 + 24;
  const left = card.pad, top = card.header + card.pad;
  const composite = [];
  const notes = [];
  for (const [panel, [x, y, w, h, rotate = 0]] of Object.entries(layout.panels)) {
    const file = `collections/${id}/${entry.panels[panel]}`;
    let bytes;
    try { bytes = read(file); } catch { throw new Error(`${id}/${entry.id}: missing ${panel} panel ${file}`); }
    const meta = await sharp(bytes).metadata();
    const input = await sharp(bytes).rotate(rotate).resize(Math.round(w * scale), Math.round(h * scale), { fit: 'fill' }).png().toBuffer();
    composite.push({ input, left: left + Math.round(x * scale), top: top + Math.round(y * scale) });
    notes.push(`${panel}: ${meta.width}×${meta.height}${rotate ? `, turned ${rotate}°` : ''}`, `   ${entry.panels[panel]}`);
  }
  const outlines = Object.entries(layout.panels).map(([panel, [x, y, w, h, rotate = 0]]) => {
    const [sx, sy, sw, sh] = [x, y, w, h].map(value => value * scale);
    // Mark the texture's own top edge, which faces down on panels turned 180°.
    const label = `${panel} ${rotate === 180 ? '↓' : '↑'}`;
    const ly = rotate === 180 ? top + sy + sh - 24 : top + sy + 4;
    return `<rect x="${left + sx}" y="${top + sy}" width="${sw}" height="${sh}" fill="none" stroke="#db2777" stroke-width="1.5" stroke-dasharray="5 3"/>`
      + `<rect x="${left + sx + 4}" y="${ly}" width="${label.length * 8 + 8}" height="20" rx="3" fill="#0f172a" opacity="0.8"/>`
      + `<text x="${left + sx + 8}" y="${ly + 14}" font-size="13" fill="#fff">${esc(label)}</text>`;
  }).join('');
  const poles = (layout.poles ?? []).map(([x1, y1, x2, y2]) =>
    `<line x1="${left + x1 * scale}" y1="${top + y1 * scale}" x2="${left + x2 * scale}" y2="${top + y2 * scale}" stroke="#475569" stroke-width="5"/>`).join('');
  let back = '';
  if (layout.back) {
    const sy = top + artH + 40, s = scale * 0.35;
    const colour = part => entry.backColor ?? layout.back[part];
    back = `<text x="${left}" y="${sy - 10}" font-size="14" fill="#334155">Back view (unprinted${entry.backColor ? `, backColor ${esc(entry.backColor)}` : ', default colours'})</text>`
      + Object.entries(layout.panels).map(([panel, [x, y, w, h, rotate = 0]]) => {
        // Seen from behind, the viewer's left and right swap.
        const mx = layout.width - x - w;
        return `<rect x="${left + mx * s}" y="${sy + y * s}" width="${w * s}" height="${h * s}" fill="${colour(panel === 'top' ? 'top' : 'sides')}" stroke="#94a3b8"/>`;
      }).join('');
  }
  const views = layout.views.join(' · ');
  const info = [
    `Template ${entry.template}`, views, '', ...notes, '',
    'Arrows mark each texture top edge.',
    ...(entry.template.startsWith('gate') ? ['Left/right are as seen facing the printed front.'] : []),
    ...(entry.template.startsWith('corner-flag') ? ['Each flag side is drawn as seen from that side.', 'Grey areas are transparent.'] : []),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${height}" font-family="sans-serif">
    <rect width="100%" height="100%" fill="#ffffff"/><rect y="${height - 1}" width="100%" height="1" fill="#cbd5e1"/>
    <rect x="${left}" y="${top}" width="${artW}" height="${artH}" fill="#e2e8f0"/>
    <text x="${card.pad}" y="36" font-size="22" font-weight="bold" fill="#0f172a">${esc(`${id} / ${entry.id}`)}</text>
    <text x="${card.pad + 12 + (id.length + entry.id.length + 3) * 13}" y="36" font-size="16" fill="#475569">${esc(entry.name)}</text>
    ${info.map((line, i) => `<text x="${card.pad * 2 + card.art}" y="${top + 16 + i * 22}" font-size="14" fill="#0f172a">${esc(line)}</text>`).join('')}
    ${back}
  </svg>`;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${height}" font-family="sans-serif">${poles}${outlines}</svg>`);
  return sharp(Buffer.from(svg)).composite([...composite, { input: overlay }]).png().toBuffer();
}

// One contact sheet per collection, for reviewing artwork and orientation before merge.
export async function collectionPreview(id, read) {
  const manifest = JSON.parse(read(`collections/${id}/manifest.json`).toString());
  const cards = [];
  for (const entry of manifest.textures) cards.push(await textureCard(id, entry, read));
  const sizes = await Promise.all(cards.map(bytes => sharp(bytes).metadata()));
  const height = sizes.reduce((sum, size) => sum + size.height, 0);
  let offset = 0;
  return sharp({ create: { width: card.width, height, channels: 3, background: '#ffffff' } })
    .composite(cards.map((input, i) => { const placed = { input, left: 0, top: offset }; offset += sizes[i].height; return placed; }))
    .png().toBuffer();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const all = [...new Set(workingTreeFiles(path.join(root, 'collections'))
      .map(file => path.relative(root, file).split(path.sep).join('/'))
      .filter(file => /^collections\/[^/]+\/manifest\.json$/.test(file)).map(file => file.split('/')[1]))].sort();
    const ids = process.argv.length > 2 ? process.argv.slice(2) : all;
    for (const id of ids) if (!all.includes(id)) throw new Error(`unknown collection ${id}`);
    mkdirSync(path.join(root, 'previews'), { recursive: true });
    for (const id of ids) {
      const output = path.join(root, 'previews', `${id}.png`);
      writeFileSync(output, await collectionPreview(id, file => readFileSync(path.join(root, file))));
      console.log(path.relative(root, output));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
