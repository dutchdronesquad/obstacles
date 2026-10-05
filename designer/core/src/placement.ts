// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import type { PanelDefinition, PanelPlacement, TemplateDefinition } from './model.ts';

export interface Rect { x: number; y: number; width: number; height: number }

/** Where the logo goes: centre, unrotated size, and the reading rotation of its panel. */
export interface LogoPlacement { cx: number; cy: number; width: number; height: number; rotation: number }

export const accentThickness = { frame: 8, band: 20 };

export function safeRect(panel: PanelDefinition): Rect {
  const inset = panel.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    x: panel.x + inset.left,
    y: panel.y + inset.top,
    width: panel.width - inset.left - inset.right,
    height: panel.height - inset.top - inset.bottom,
  };
}

/** Fits the logo, turned to the panel's reading direction, inside the safe area; scale 1 touches its edges. */
export function placeLogo(panel: PanelDefinition, logo: { width: number; height: number }, placement: PanelPlacement): LogoPlacement | undefined {
  if (!placement.visible) return undefined;
  const rotation = panel.readingRotation ?? 0;
  const sideways = Math.abs(rotation) % 180 === 90;
  const box = sideways ? { width: logo.height, height: logo.width } : logo;
  const safe = safeRect(panel);
  const factor = Math.min(safe.width / box.width, safe.height / box.height) * placement.scale;
  return {
    cx: safe.x + safe.width / 2 + placement.offsetX,
    cy: safe.y + safe.height / 2 + placement.offsetY,
    width: logo.width * factor,
    height: logo.height * factor,
    rotation,
  };
}

/** Line along the inner edges of a gate's posts and top: the opening's frame. */
export function frameOutline(definition: TemplateDefinition): number[][] {
  const { left, right, top } = definition.panels;
  const t = accentThickness.frame;
  const inner = { left: left.x + left.width, right: right.x, top: top.y + top.height, bottom: Math.max(left.y + left.height, right.y + right.height) };
  return [
    [inner.left - t, inner.bottom], [inner.left - t, inner.top - t], [inner.right + t, inner.top - t], [inner.right + t, inner.bottom],
    [inner.right, inner.bottom], [inner.right, inner.top], [inner.left, inner.top], [inner.left, inner.bottom],
  ];
}

/** Band along a panel's bottom edge, following its slope. */
export function bandOutline(panel: PanelDefinition): number[][] {
  if (!panel.bottomEdge) return [];
  const [[x1, y1], [x2, y2]] = panel.bottomEdge;
  const t = accentThickness.band;
  return [[x1, y1 - t], [x2, y2 - t], [x2, y2], [x1, y1]];
}
