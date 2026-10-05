// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { DesignError, type Logo, validateLogo } from './model.ts';

export interface LogoFile {
  /** MIME type as reported by the browser, such as image/svg+xml. */
  type: string;
  bytes: Uint8Array;
}

export interface PreparedLogo {
  logo: Logo;
  /** Set when an SVG with live text was turned into a PNG. */
  rasterized: boolean;
}

/** Turns SVG markup into a PNG; supplied by the app, for example with a canvas. */
export type RasterizeSvg = (svg: string, size: { width: number; height: number }) => Promise<{ bytes: Uint8Array; width: number; height: number }>;

function fail(message: string): never { throw new DesignError(message); }

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), char => char.charCodeAt(0));
}

const number = (value: string | undefined) => {
  const parsed = value === undefined ? NaN : Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** Intrinsic size of an SVG from its viewBox, or its width and height. */
export function svgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!root) fail('This file is not an SVG.');
  const viewBox = /\sviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1].trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return { width: viewBox[2], height: viewBox[3] };
  const width = number(/\swidth\s*=\s*["']([^"']+)["']/i.exec(root)?.[1]);
  const height = number(/\sheight\s*=\s*["']([^"']+)["']/i.exec(root)?.[1]);
  if (width && height) return { width, height };
  fail('The SVG has no viewBox or size; export it again with a viewBox.');
}

/** Live text renders with whatever fonts a computer has, so the checks reject it. */
export const hasLiveText = (svg: string) => /<(?:text|tspan|textPath|flowRoot)\b/i.test(svg);

/** Logos are embedded as images, so nothing in them runs; links to other files would silently disappear. */
export function checkSvgLogo(svg: string): void {
  if (/<script\b|<foreignObject\b|\son\w+\s*=/i.test(svg)) fail('The SVG contains scripts; export it again as a plain SVG.');
  if (/\s(?:xlink:)?href\s*=\s*["'](?!#|data:)|url\(\s*["']?(?!#|data:)/i.test(svg)) fail('The SVG links to other files; embed images or export it again as a plain SVG.');
}

export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, i) => bytes[i] !== value)) fail('This file is not a PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail('This file is not a JPEG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    // Start-of-frame markers carry the size; C4, C8 and CC are other segments.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  fail('Could not read the JPEG size.');
}

export async function prepareLogo(file: LogoFile, options: { rasterizeSvg?: RasterizeSvg } = {}): Promise<PreparedLogo> {
  let prepared: PreparedLogo;
  if (file.type === 'image/svg+xml' || /^\s*(?:<\?xml|<svg)/i.test(new TextDecoder().decode(file.bytes.subarray(0, 512)))) {
    const svg = new TextDecoder().decode(file.bytes);
    checkSvgLogo(svg);
    const size = svgSize(svg);
    if (hasLiveText(svg)) {
      if (!options.rasterizeSvg) fail('The SVG contains live text; convert the text to paths.');
      // Rasterize at a size that stays sharp on the largest panel.
      const scale = 2048 / Math.max(size.width, size.height);
      const png = await options.rasterizeSvg(svg, { width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
      prepared = { logo: { kind: 'png', data: toBase64(png.bytes), width: png.width, height: png.height }, rasterized: true };
    } else {
      prepared = { logo: { kind: 'svg', data: toBase64(file.bytes), ...size }, rasterized: false };
    }
  } else if (file.type === 'image/png') {
    prepared = { logo: { kind: 'png', data: toBase64(file.bytes), ...pngSize(file.bytes) }, rasterized: false };
  } else if (file.type === 'image/jpeg') {
    prepared = { logo: { kind: 'jpeg', data: toBase64(file.bytes), ...jpegSize(file.bytes) }, rasterized: false };
  } else {
    fail('Logos must be SVG, PNG or JPEG.');
  }
  validateLogo(prepared.logo);
  return prepared;
}
