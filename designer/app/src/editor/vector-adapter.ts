// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import {
  Circle,
  Line,
  Color,
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  Path,
  Point,
  Polygon,
  Polyline,
  Rect,
  util,
  type TMat2D,
} from "fabric";
import {
  type Logo,
  type Matrix,
  type PathCommand,
  type VectorItem,
  type VectorStyle,
} from "@track-assets/designer-core";

declare module "fabric" {
  interface FabricObject {
    artworkId?: string;
    artworkName?: string;
    artworkAsset?: Logo;
  }
}
FabricObject.customProperties = ["artworkId", "artworkName", "artworkAsset"];
FabricObject.ownDefaults = {
  ...FabricObject.ownDefaults,
  borderColor: "#1e93db",
  cornerColor: "#ffffff",
  cornerStrokeColor: "#1e93db",
  transparentCorners: false,
  cornerSize: 10,
  touchCornerSize: 28,
  padding: 2,
};

const paint = (value: FabricObject["fill"]) => {
  if (!value || value === "none") return "none";
  if (typeof value !== "string")
    throw new Error("This artwork uses a gradient or pattern.");
  const colour = new Color(value);
  if (colour.getAlpha() !== 1)
    throw new Error("This SVG uses translucent paints.");
  return `#${colour.toHex().toLowerCase()}`;
};

export function toVector(
  object: FabricObject,
  fullTransform = true,
): VectorItem {
  if (object.clipPath || object.strokeDashArray?.length || object.strokeUniform)
    throw new Error("This SVG uses clipping or special strokes.");
  const base = {
    id: (object.artworkId ??= crypto.randomUUID()),
    name: object.artworkName ?? object.type,
    transform: [
      ...(fullTransform
        ? object.calcTransformMatrix()
        : object.calcOwnMatrix()),
    ] as Matrix,
    visible: object.visible,
    locked: !object.selectable,
    style: styleOf(object),
  };
  if (object instanceof Group)
    return {
      ...base,
      kind: "group",
      children: object.getObjects().map((child) => toVector(child, false)),
    };
  if (object instanceof Rect)
    return {
      ...base,
      kind: "rect",
      width: object.width,
      height: object.height,
      rx: object.rx,
      ry: object.ry,
    };
  if (object instanceof Circle)
    return { ...base, kind: "ellipse", rx: object.radius, ry: object.radius };
  if (object instanceof Line) {
    const points = object.calcLinePoints();
    return {
      ...base,
      kind: "path",
      commands: [
        ["M", points.x1, points.y1],
        ["L", points.x2, points.y2],
      ],
      offset: [0, 0],
    };
  }
  if (object instanceof Ellipse)
    return { ...base, kind: "ellipse", rx: object.rx, ry: object.ry };
  if (object instanceof Path)
    return {
      ...base,
      kind: "path",
      commands: structuredClone(object.path) as PathCommand[],
      offset: [object.pathOffset.x, object.pathOffset.y],
    };
  if (object instanceof Polyline || object instanceof Polygon) {
    const commands: PathCommand[] = object.points.map((point, index) => [
      index ? "L" : "M",
      point.x,
      point.y,
    ]);
    if (object instanceof Polygon) commands.push(["Z"]);
    return {
      ...base,
      kind: "path",
      commands,
      offset: [object.pathOffset.x, object.pathOffset.y],
    };
  }
  if (object instanceof FabricImage && object.artworkAsset)
    return { ...base, kind: "image", logo: object.artworkAsset };
  throw new Error("This SVG contains unsupported objects.");
}

export async function fromVector(item: VectorItem): Promise<FabricObject> {
  const options = {
    fill: item.style.fill === "none" ? null : item.style.fill,
    stroke: item.style.stroke === "none" ? null : item.style.stroke,
    strokeWidth: item.style.strokeWidth,
    opacity: item.style.opacity,
    fillRule: item.style.fillRule ?? "nonzero",
    strokeLineCap: item.style.lineCap ?? "butt",
    strokeLineJoin: item.style.lineJoin ?? "miter",
    originX: "center",
    originY: "center",
  } as const;
  let object: FabricObject;
  switch (item.kind) {
    case "rect":
      object = new Rect({
        ...options,
        width: item.width,
        height: item.height,
        rx: item.rx,
        ry: item.ry,
      });
      break;
    case "ellipse":
      object = new Ellipse({ ...options, rx: item.rx, ry: item.ry });
      break;
    case "path": {
      const path = new Path(structuredClone(item.commands), options);
      path.pathOffset = new Point(...item.offset);
      object = path;
      break;
    }
    case "image":
      object = await imageObject(item.logo);
      object.set(options);
      break;
    case "group":
      object = new Group(
        await Promise.all(item.children.map(fromVector)),
        options,
      );
      break;
  }
  util.applyTransformToObject(object, item.transform as TMat2D);
  object.set({
    artworkId: item.id,
    artworkName: item.name,
    visible: item.visible,
    selectable: !item.locked,
    evented: !item.locked,
  });
  object.setCoords();
  return object;
}

export async function imageObject(logo: Logo) {
  const type = { svg: "image/svg+xml", png: "image/png", jpeg: "image/jpeg" }[
    logo.kind
  ];
  return FabricImage.fromURL(
    `data:${type};base64,${logo.data}`,
    {},
    {
      width: logo.width,
      height: logo.height,
      originX: "center",
      originY: "center",
      artworkAsset: logo,
      strokeWidth: 0,
    },
  );
}

export function styleOf(object: FabricObject): VectorStyle {
  return {
    fill: paint(object.fill),
    stroke: paint(object.stroke),
    strokeWidth: object.strokeWidth,
    opacity: object.opacity,
    fillRule: object.fillRule,
    lineCap: object.strokeLineCap,
    lineJoin: object.strokeLineJoin,
  };
}

export function renewIds(object: FabricObject) {
  object.artworkId = crypto.randomUUID();
  if (object instanceof Group) object.getObjects().forEach(renewIds);
}
