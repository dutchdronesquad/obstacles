// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

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
}

export const designLimits = { minScale: 0.1, maxScale: 1, logoBytes: 5 * 1024 * 1024, nameLength: 80 };
const hex = /^#[0-9a-f]{6}$/;

export class DesignError extends Error {}
function fail(message: string): never { throw new DesignError(message); }

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
  if (design.version !== 1) fail('Unsupported design version.');
  const definition = editableTemplate(definitions, design.template);
  if (design.name !== undefined && (!design.name.trim() || design.name.length > designLimits.nameLength)) {
    fail(`The name must be 1 to ${designLimits.nameLength} characters.`);
  }
  for (const [key, value] of Object.entries(design.colors)) {
    if (value !== undefined && !hex.test(value)) fail(`The ${key} colour must be a #rrggbb colour.`);
  }
  if (design.colors.back !== undefined && !definition.unprintedBack) fail(`${definition.name} has no unprinted back to colour.`);
  if (!accentStyles(definition).includes(design.accent)) fail(`${definition.name} does not support the ${design.accent} accent.`);
  const expected = Object.keys(definition.panels).sort().join();
  if (Object.keys(design.panels).sort().join() !== expected) fail(`Panels must be exactly ${expected}.`);
  for (const [panel, placement] of Object.entries(design.panels)) {
    if (!(placement.scale >= designLimits.minScale && placement.scale <= designLimits.maxScale)) fail(`The ${panel} scale must be between 0.1 and 1.`);
    if (!Number.isFinite(placement.offsetX) || !Number.isFinite(placement.offsetY)) fail(`The ${panel} offset must be a number.`);
  }
  if (design.logo) validateLogo(design.logo);
}

export function validateLogo(logo: Logo): void {
  if (!['svg', 'png', 'jpeg'].includes(logo.kind)) fail('Logos must be SVG, PNG or JPEG.');
  if (!(logo.width > 0 && logo.height > 0)) fail('The logo has no size.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(logo.data)) fail('The logo data is not valid base64.');
  if (logo.data.length * 0.75 > designLimits.logoBytes) fail('The logo is larger than 5 MB.');
}
