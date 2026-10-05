// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import {
  placeLogo,
  type Design,
  type VectorItem,
} from "@track-assets/designer-core";
import { templates } from "../templates.ts";
import { panelLabel } from "../artwork.ts";

export function migrateLegacy(design: Design): Design {
  if (!design.logo) return design;
  const artwork: VectorItem[] = [...(design.artwork ?? [])];
  for (const [id, panel] of Object.entries(templates[design.template].panels)) {
    const placed = placeLogo(panel, design.logo, design.panels[id]);
    if (!placed) continue;
    const angle = (placed.rotation * Math.PI) / 180,
      scale = placed.width / design.logo.width;
    artwork.push({
      kind: "image",
      id: crypto.randomUUID(),
      name: `Logo · ${panelLabel(id)}`,
      logo: design.logo,
      visible: true,
      locked: false,
      transform: [
        Math.cos(angle) * scale,
        Math.sin(angle) * scale,
        -Math.sin(angle) * scale,
        Math.cos(angle) * scale,
        placed.cx,
        placed.cy,
      ],
      style: { fill: "none", stroke: "none", strokeWidth: 0, opacity: 1 },
    });
  }
  return { ...design, logo: undefined, artwork };
}
