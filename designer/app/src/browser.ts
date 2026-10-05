// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import type { RasterizeSvg, TemplateDefinition } from '@track-assets/designer-core';

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened. Export it again as SVG, PNG or JPEG.')); };
    image.src = url;
  });
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Your browser could not create the artwork preview.');
  return { element, context };
}

const encodePng = (element: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  element.toBlob(blob => blob ? resolve(blob) : reject(new Error('Your browser could not encode this image.')), 'image/png');
});

export const rasterizeSvg: RasterizeSvg = async (svg, size) => {
  const image = await loadImage(new Blob([svg], { type: 'image/svg+xml' }));
  const { element, context } = canvas(size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  const png = await encodePng(element);
  return { bytes: new Uint8Array(await png.arrayBuffer()), ...size };
};

/** Use only canonical sheets rendered by the core, never uploaded markup. Keep clip paths in defs. */
export function withoutGuides(sheet: string): string {
  const document = new DOMParser().parseFromString(sheet, 'image/svg+xml');
  document.getElementById('guides')?.remove();
  return new XMLSerializer().serializeToString(document);
}

/** Rasterize canonical panel regions at CI export resolution, preserving flag alpha. */
export async function rasterizePanels(sheet: string, definition: TemplateDefinition, signal?: AbortSignal): Promise<Record<string, Blob>> {
  const image = await loadImage(new Blob([withoutGuides(sheet)], { type: 'image/svg+xml' }));
  const scale = definition.sheet?.scale ?? 1;
  const panels: Record<string, Blob> = {};
  for (const [id, panel] of Object.entries(definition.panels)) {
    signal?.throwIfAborted();
    const { element, context } = canvas(panel.width * scale, panel.height * scale);
    if (panel.color) { context.fillStyle = panel.color; context.fillRect(0, 0, element.width, element.height); }
    context.drawImage(image, panel.x, panel.y, panel.width, panel.height, 0, 0, element.width, element.height);
    panels[id] = await encodePng(element);
  }
  signal?.throwIfAborted();
  return panels;
}

/** PNG estimates; CI's lossless WebP sizes may differ. */
export async function estimatePanelSizes(sheet: string, definition: TemplateDefinition): Promise<Record<string, number>> {
  return Object.fromEntries(Object.entries(await rasterizePanels(sheet, definition)).map(([id, blob]) => [id, blob.size]));
}

export function downloadSheet(sheet: string, textureId: string) {
  const url = URL.createObjectURL(new Blob([sheet], { type: 'image/svg+xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${textureId}.svg`;
  anchor.click();
  // Give the browser time to start reading the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
