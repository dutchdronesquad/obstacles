// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { DesignError, fail } from './errors.ts';
import { validateLogo } from './logo.ts';
import { validateArtwork, type VectorItem } from './vector.ts';

export { DesignError };

export type PanelEdge = [[number, number], [number, number]];

export interface SafeArea { top: number; right: number; bottom: number; left: number }

export interface PanelDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  turn?: number;
  readingRotation?: number;
  safeArea?: SafeArea;
  clipPath?: string;
  bottomEdge?: PanelEdge;
}

export interface TemplateDefinition {
  name: string;
  defaultTextureId: string;
  transparency: 'opaque' | 'cut-out';
  unprintedBack: boolean;
  views: string[];
  layout: { width: number; height: number; poles?: number[][] };
  sheet?: { scale: number };
  panels: Record<string, PanelDefinition>;
}

export type TemplateDefinitions = Record<string, TemplateDefinition>;

export type AccentStyle = 'none' | 'frame' | 'band';

export interface Logo {
  kind: 'svg' | 'png' | 'jpeg';
  /** Base64 file content, embedded as a data URI. */
  data: string;
  /** Intrinsic size, used only for the aspect ratio. */
  width: number;
  height: number;
}

export interface PanelPlacement {
  visible: boolean;
  /** Fraction of the largest size that fits the safe area, from 0.1 to 1. */
  scale: number;
  /** Offset from the safe area's centre, in sheet units. */
  offsetX: number;
  offsetY: number;
}

export interface Design {
  version: 1;
  template: string;
  /** Display name; becomes data-name. */
  name?: string;
  colors: { background: string; accent: string; back?: string };
  accent: AccentStyle;
  logo?: Logo;
  panels: Record<string, PanelPlacement>;
  /** Free vector objects in sheet coordinates; absent in older designer sheets. */
  artwork?: VectorItem[];
}

export const designLimits = { minScale: 0.1, maxScale: 1, nameLength: 80 };
const hex = /^#[0-9a-f]{6}$/;
// Characters XML cannot hold, plus line breaks that attribute normalization would turn into spaces.
const unsafeText = /[\u0000-\u001f\u007f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function editableTemplate(definitions: TemplateDefinitions, template: string): TemplateDefinition {
  const definition = definitions[template];
  if (!definition) fail(`Unknown template ${template}.`);
  if (!definition.sheet) fail(`${definition.name} has no editable sheet yet.`);
  return definition;
}

/** Accent styles a template can draw: a frame needs a gate's left, right and top panels, a band needs bottom edges. */
export function accentStyles(definition: TemplateDefinition): AccentStyle[] {
  const panels = Object.values(definition.panels);
  const styles: AccentStyle[] = ['none'];
  if (['left', 'right', 'top'].every(panel => panel in definition.panels)) styles.push('frame');
  if (panels.length > 0 && panels.every(panel => panel.bottomEdge)) styles.push('band');
  return styles;
}

export function createDesign(definitions: TemplateDefinitions, template: string): Design {
  const definition = editableTemplate(definitions, template);
  const styles = accentStyles(definition);
  return {
    version: 1,
    template,
    colors: { background: '#1e293b', accent: '#f59e0b', ...(definition.unprintedBack && { back: '#1e293b' }) },
    accent: styles.includes('frame') ? 'frame' : styles.includes('band') ? 'band' : 'none',
    panels: Object.fromEntries(Object.keys(definition.panels).map(panel => [panel, { visible: true, scale: 0.8, offsetX: 0, offsetY: 0 }])),
  };
}

/** Same rules the repository checks enforce, reported before a sheet is downloaded. */
export function validateDesign(definitions: TemplateDefinitions, design: Design): void {
  // Designs also arrive from reopened sheets, so check the shape before reading it.
  if (!isObject(design) || design.version !== 1) fail('Unsupported design version.');
  if (typeof design.template !== 'string') fail('The design has no template.');
  const definition = editableTemplate(definitions, design.template);
  if (!isObject(design.colors) || !isObject(design.panels)) fail('The design is incomplete.');
  if (design.name !== undefined) {
    if (typeof design.name !== 'string' || !design.name.trim() || design.name.length > designLimits.nameLength) fail(`The name must be 1 to ${designLimits.nameLength} characters.`);
    if (unsafeText.test(design.name)) fail('The name contains characters that cannot be saved; use letters, digits and punctuation.');
  }
  for (const [key, value] of Object.entries(design.colors)) {
    if (value !== undefined && !hex.test(value)) fail(`The ${key} colour must be a #rrggbb colour.`);
  }
  if (design.colors.back !== undefined && !definition.unprintedBack) fail(`${definition.name} has no unprinted back to colour.`);
  if (!accentStyles(definition).includes(design.accent)) fail(`${definition.name} does not support the ${design.accent} accent.`);
  const expected = Object.keys(definition.panels).sort().join();
  if (Object.keys(design.panels).sort().join() !== expected) fail(`Panels must be exactly ${expected}.`);
  for (const [panel, placement] of Object.entries(design.panels)) {
    if (!isObject(placement) || typeof placement.visible !== 'boolean') fail(`The ${panel} placement is incomplete.`);
    if (!(placement.scale >= designLimits.minScale && placement.scale <= designLimits.maxScale)) fail(`The ${panel} scale must be between 0.1 and 1.`);
    if (!Number.isFinite(placement.offsetX) || !Number.isFinite(placement.offsetY)) fail(`The ${panel} offset must be a number.`);
  }
  if (design.logo !== undefined) {
    if (!isObject(design.logo)) fail('The logo is incomplete.');
    validateLogo(design.logo);
  }
  if (design.artwork !== undefined) validateArtwork(design.artwork);
}
