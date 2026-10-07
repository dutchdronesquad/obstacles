// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import type {
  ViewerDesign,
  ViewerShape,
  ViewerCamera3D,
} from "@trackdraw/viewer";
type TargetShape = ViewerShape extends infer T
  ? T extends ViewerShape
    ? Omit<T, "id">
    : never
  : never;
export interface RenderTarget {
  shape: TargetShape;
  files: Record<string, string>;
  views: [number, string][];
  spacing: number;
}
// Catalog obstacles that render each template in @trackdraw/viewer, and the catalog files its panels replace.
const catalog = <T extends TargetShape>(elementId: string, shape: T) => ({
  ...shape,
  meta: {
    catalog: {
      version: 1,
      elementId,
      assignedKind: shape.kind,
      official: true,
      snapshot: {
        name: elementId,
        organization: "MultiGP",
        dimensionsLabel: "",
      },
    },
  },
});
export const renderTargets: Record<string, RenderTarget> = {
  "gate-standard-v1": {
    shape: catalog("multigp-standard-gate-5x5", {
      kind: "gate",
      x: 0,
      y: 0,
      rotation: 0,
      width: 1.524,
      height: 1.524,
      thick: 0.2,
      color: "#3b82f6",
    }),
    files: {
      left: "MultiGP-2017-Airgate-left-panel-regular-50-percent.webp",
      right: "MultiGP-2017-Airgate-right-panel-regular-50-percent.webp",
      top: "MultiGP-2017-Airgate-top-regular-50-percent.webp",
    },
    views: [
      [0, "front"],
      [40, "turned 40°"],
      [180, "back"],
    ],
    spacing: 3.2,
  },
  "gate-championship-v1": {
    shape: catalog("multigp-championship-gate-7x6", {
      kind: "gate",
      x: 0,
      y: 0,
      rotation: 0,
      width: 2.1336,
      height: 1.8288,
      thick: 0.2,
      color: "#3b82f6",
    }),
    files: {
      left: "championship-left.webp",
      right: "championship-right.webp",
      top: "championship-top.webp",
    },
    views: [
      [0, "front"],
      [40, "turned 40°"],
      [180, "back"],
    ],
    spacing: 4,
  },
  "corner-flag-v1": {
    shape: catalog("multigp-corner-flag", {
      kind: "flag",
      x: 0,
      y: 0,
      rotation: 0,
      radius: 0.2,
      poleHeight: 3.048,
      color: "#b91c1c",
    }),
    files: {
      front: "feather-banners-cobranded-multigp.webp",
      back: "feather-banners-cobranded-multigp-back-double-sided.webp",
    },
    views: [
      [0, "front"],
      [60, "turned 60°"],
      [180, "back"],
    ],
    spacing: 1.6,
  },
  "hurdle-v1": {
    shape: catalog("multigp-hurdle", {
      kind: "barrier",
      x: 0,
      y: 0,
      rotation: 0,
      width: 3.048,
      height: 1.524,
      color: "#1e3a8a",
      variant: "banner",
    }),
    files: { front: "5x10-hurdle-multigp.webp" },
    views: [
      [0, "front"],
      [180, "back"],
    ],
    spacing: 4,
  },
};

export function renderDesign(template: string): ViewerDesign {
  const target = renderTargets[template];
  if (!target) throw new Error(`No 3D preview for ${template}`);
  const width = target.views.length * target.spacing + 1;
  return {
    version: 2,
    title: template,
    updatedAt: "2026-01-01T00:00:00.000Z",
    field: { width, height: 5, origin: "tl", gridStep: 1, ppm: 20 },
    ...(template === "gate-championship-v1"
      ? {
          // Transient preview resolution: panels are supplied by the local asset resolver.
          // No portable snapshot or downloaded SVG contains these preview references.
          appearances: [
            {
              reference: {
                source: "registry",
                collectionId: "preview",
                textureId: "championship",
                templateId: template,
              },
              name: "Championship preview",
              collectionName: "Local artwork",
              attribution: "Local artwork",
              usage: {
                terms: "Local preview only",
                portable: "not-granted" as const,
              },
              panels: {
                left: "/assets/registry/preview/championship-left.webp",
                right: "/assets/registry/preview/championship-right.webp",
                top: "/assets/registry/preview/championship-top.webp",
              },
              assets: [],
            },
          ],
        }
      : {}),
    shapes: target.views.map(([rotation], i) => ({
      ...structuredClone(target.shape),
      ...(template === "gate-championship-v1"
        ? {
            appearance: {
              source: "registry",
              collectionId: "preview",
              textureId: "championship",
              templateId: template,
            },
          }
        : {}),
      id: `view-${i}`,
      x: 0.5 + target.spacing * (i + 0.5),
      y: 2.5,
      rotation,
    })),
  };
}

/** Shared camera for browser and CI: frame all angles without synthetic orbit gestures. */
export function renderCamera(
  template: string,
  aspect = 1200 / 520,
): ViewerCamera3D {
  const design = renderDesign(template);
  const flag = template === "corner-flag-v1";
  const centre = design.field.width / 2;
  const distance = Math.max(
    flag ? 4.4 : 3.3,
    (design.field.width * 1.08) / (2 * Math.tan((23 * Math.PI) / 180) * aspect),
  );
  return {
    position: [centre, flag ? 3.6 : 2.7, 2.5 + distance],
    target: [centre, flag ? 1.5 : 0.8, 2.5],
    minDistance: 4,
  };
}
