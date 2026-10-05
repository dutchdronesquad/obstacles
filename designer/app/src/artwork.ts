// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { placeLogo, type Design, type TemplateDefinition } from '@track-assets/designer-core';

export const panelSizeLimit = 512 * 1024;
export const validTextureId = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const panelLabel = (id: string) => ({ left: 'Left post', right: 'Right post', top: 'Top panel', front: 'Front', back: 'Back' })[id] ?? id;

export function resolutionWarnings(definition: TemplateDefinition, design: Design): string[] {
  const logo = design.logo;
  const vectors: string[] = [];
  const multiply = (a: number[], b: number[]) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  const visit = (items: NonNullable<Design['artwork']>, parent: number[]) => {
    for (const item of items) {
      if (!item.visible) continue;
      const matrix = multiply(parent, item.transform);
      if (item.kind === 'group') visit(item.children, matrix);
      else if (item.kind === 'image' && item.logo.kind !== 'svg' && Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3])) * (definition.sheet?.scale ?? 1) > 1) vectors.push(`${item.name}: the image may look soft at this size. Upload a larger image or reduce its size.`);
    }
  };
  visit(design.artwork ?? [], [1,0,0,1,0,0]);
  if (!logo || logo.kind === 'svg') return vectors;
  return [...vectors, ...Object.entries(definition.panels).flatMap(([id, panel]) => {
    const placed = placeLogo(panel, logo, design.panels[id]);
    if (!placed) return [];
    const scale = definition.sheet?.scale ?? 1;
    if (logo.width >= placed.width * scale && logo.height >= placed.height * scale) return [];
    return [`${panelLabel(id)}: the logo may look soft at this size. Upload a larger image or reduce its scale.`];
  })];
}

export function sizeWarnings(sizes: Record<string, number>): string[] {
  return Object.entries(sizes).filter(([, bytes]) => bytes >= panelSizeLimit * 0.8).map(([id, bytes]) =>
    `${panelLabel(id)}: estimated panel size is ${Math.ceil(bytes / 1024)} KiB, ${bytes > panelSizeLimit ? 'above' : 'close to'} the 512 KiB limit. Try a simpler logo or a smaller scale.`);
}
