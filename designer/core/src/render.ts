// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { type Design, DesignError, editableTemplate, type TemplateDefinitions, validateDesign } from './model.ts';
import { bandOutline, frameOutline, placeLogo } from './placement.ts';

const logoId = 'designer-logo';
const metadataId = 'designer-design';
const mime = { svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg' };

function fail(message: string): never { throw new DesignError(message); }
const n = (value: number) => String(Number(value.toFixed(3)));
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const polygon = (points: number[][]) => `M ${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ')} Z`;

/**
 * Renders a complete template sheet: the template's guides unchanged, a generated Artwork layer, the sheet
 * attributes the checks read, and the design itself as metadata so the sheet can be opened again.
 */
export function renderSheet(definitions: TemplateDefinitions, templateSvg: string, design: Design): string {
  validateDesign(definitions, design);
  const definition = editableTemplate(definitions, design.template);
  const clips: string[] = [];
  const panels: string[] = [];
  for (const [id, panel] of Object.entries(definition.panels)) {
    let clip = panel.clipPath;
    if (!clip) {
      clip = `designer-clip-${id}`;
      clips.push(`<clipPath id="${clip}"><rect x="${n(panel.x)}" y="${n(panel.y)}" width="${n(panel.width)}" height="${n(panel.height)}"/></clipPath>`);
    }
    const parts = [`<rect x="${n(panel.x)}" y="${n(panel.y)}" width="${n(panel.width)}" height="${n(panel.height)}" fill="${design.colors.background}"/>`];
    if (design.accent === 'band') parts.push(`<path d="${polygon(bandOutline(panel))}" fill="${design.colors.accent}"/>`);
    const place = design.logo && placeLogo(panel, design.logo, design.panels[id]);
    if (place && design.logo) {
      const scale = place.width / design.logo.width;
      parts.push(`<use href="#${logoId}" transform="translate(${n(place.cx)} ${n(place.cy)}) rotate(${place.rotation}) scale(${n(scale)}) translate(${n(-design.logo.width / 2)} ${n(-design.logo.height / 2)})"/>`);
    }
    panels.push(`    <g clip-path="url(#${clip})">\n      ${parts.join('\n      ')}\n    </g>`);
  }
  if (design.accent === 'frame') panels.push(`    <path d="${polygon(frameOutline(definition))}" fill="${design.colors.accent}"/>`);
  const artwork = `<g id="artwork" inkscape:groupmode="layer" inkscape:label="Artwork">\n${panels.join('\n')}\n  </g>`;

  const defs = [...clips];
  if (design.logo) {
    defs.push(`<image id="${logoId}" width="${n(design.logo.width)}" height="${n(design.logo.height)}" preserveAspectRatio="none" href="data:${mime[design.logo.kind]};base64,${design.logo.data}"/>`);
  }
  const stored = { ...design, logo: design.logo && { ...design.logo, data: undefined } };
  const name = design.name?.trim();

  let svg = templateSvg;
  // Replacements are functions so that "$" in names or data is never read as a pattern.
  const replace = (pattern: RegExp, replacement: (match: string) => string, what: string) => {
    if (!pattern.test(svg)) fail(`The ${design.template} template has no ${what}.`);
    svg = svg.replace(pattern, replacement);
  };
  replace(/<g id="artwork"[\s\S]*?\n {2}<\/g>/, () => artwork, 'Artwork layer');
  replace(/\n {2}<\/defs>/, () => `\n${defs.map(item => `    ${item}\n`).join('')}  </defs>`, 'defs');
  replace(/<title>[^<]*<\/title>/, () => `<title>${escape(`${name ?? definition.name} on ${design.template}`)}</title>\n  <metadata id="${metadataId}">${escape(JSON.stringify(stored))}</metadata>`, 'title');
  const attributes = [name && `data-name="${escape(name)}"`, design.colors.back && `data-back-color="${design.colors.back}"`].filter(Boolean).join(' ');
  replace(new RegExp(`<svg\\b[^>]*\\sdata-template="${design.template}"`), match => (attributes ? `${match} ${attributes}` : match), 'data-template attribute');
  return svg;
}

/** Reads a design back from a sheet made with renderSheet. */
export function parseSheet(svg: string): Design {
  const stored = new RegExp(`<metadata id="${metadataId}">([^<]*)</metadata>`).exec(svg)?.[1];
  if (!stored) fail('This sheet was not made with the designer.');
  const unescape = (value: string) => value.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  const design = JSON.parse(unescape(stored)) as Design;
  if (design.logo) {
    const data = new RegExp(`<image id="${logoId}"[^>]*\\shref="data:[^;]+;base64,([A-Za-z0-9+/=]+)"`).exec(svg)?.[1];
    if (!data) fail('The sheet is missing its logo.');
    design.logo = { ...design.logo, data };
  }
  return design;
}
