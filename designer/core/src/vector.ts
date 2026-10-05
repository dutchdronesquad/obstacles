// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { fail } from "./errors.ts";
import { validateLogo } from "./logo.ts";
import type { Logo } from "./model.ts";

export type Matrix = [number, number, number, number, number, number];
export type PathCommand =
  | ["M" | "L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Q", number, number, number, number]
  | ["Z"];
export interface VectorStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillRule?: "nonzero" | "evenodd";
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
}
interface VectorBase {
  id: string;
  name: string;
  transform: Matrix;
  visible: boolean;
  locked: boolean;
  style: VectorStyle;
}
export type VectorItem = VectorBase &
  (
    | { kind: "rect"; width: number; height: number; rx: number; ry: number }
    | { kind: "ellipse"; rx: number; ry: number }
    | { kind: "path"; commands: PathCommand[]; offset: [number, number] }
    | { kind: "image"; logo: Logo }
    | { kind: "group"; children: VectorItem[] }
  );
export const vectorLimits = { items: 1000, commands: 20000, depth: 12 };
const paint = /^(?:none|#[0-9a-f]{6})$/i;
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e7;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate all metadata before it can create canvas objects or emit XML. No raw SVG or engine JSON is trusted. */
export function validateArtwork(
  artwork: unknown,
): asserts artwork is VectorItem[] {
  let count = 0,
    commandCount = 0;
  const ids = new Set<string>();
  const visit = (items: unknown, depth: number) => {
    if (!Array.isArray(items) || depth > vectorLimits.depth)
      fail("The artwork has invalid or overly nested layers.");
    for (const item of items) {
      if (++count > vectorLimits.items)
        fail(`Artwork supports up to ${vectorLimits.items} objects.`);
      if (
        !record(item) ||
        typeof item.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
        ids.has(item.id)
      )
        fail("Artwork objects need unique valid IDs.");
      ids.add(item.id);
      if (
        typeof item.name !== "string" ||
        item.name.length > 80 ||
        /[\u0000-\u001f\ufffe\uffff]/.test(item.name)
      )
        fail("An artwork layer has an invalid name.");
      if (
        !Array.isArray(item.transform) ||
        item.transform.length !== 6 ||
        !item.transform.every(number)
      )
        fail("An artwork transform is invalid.");
      if (typeof item.visible !== "boolean" || typeof item.locked !== "boolean")
        fail("An artwork layer has invalid visibility or locking.");
      const style = item.style;
      if (
        !record(style) ||
        typeof style.fill !== "string" ||
        typeof style.stroke !== "string" ||
        !paint.test(style.fill) ||
        !paint.test(style.stroke) ||
        !number(style.strokeWidth) ||
        style.strokeWidth < 0 ||
        !number(style.opacity) ||
        style.opacity < 0 ||
        style.opacity > 1
      )
        fail("Artwork colours, stroke width or opacity are invalid.");
      if (
        style.fillRule !== undefined &&
        !["nonzero", "evenodd"].includes(String(style.fillRule))
      )
        fail("The artwork fill rule is invalid.");
      if (
        style.lineCap !== undefined &&
        !["butt", "round", "square"].includes(String(style.lineCap))
      )
        fail("The artwork line cap is invalid.");
      if (
        style.lineJoin !== undefined &&
        !["miter", "round", "bevel"].includes(String(style.lineJoin))
      )
        fail("The artwork line join is invalid.");
      switch (item.kind) {
        case "rect":
          if (
            ![item.width, item.height, item.rx, item.ry].every(
              (value) => number(value) && value >= 0,
            )
          )
            fail("An artwork rectangle has invalid dimensions.");
          break;
        case "ellipse":
          if (![item.rx, item.ry].every((value) => number(value) && value >= 0))
            fail("An artwork ellipse has invalid dimensions.");
          break;
        case "path": {
          if (
            !Array.isArray(item.offset) ||
            item.offset.length !== 2 ||
            !item.offset.every(number) ||
            !Array.isArray(item.commands) ||
            item.commands.length === 0
          )
            fail("An artwork path is invalid.");
          const lengths: Record<string, number> = {
            M: 3,
            L: 3,
            C: 7,
            Q: 5,
            Z: 1,
          };
          for (const command of item.commands) {
            if (++commandCount > vectorLimits.commands)
              fail(
                `Artwork supports up to ${vectorLimits.commands} path commands.`,
              );
            if (
              !Array.isArray(command) ||
              typeof command[0] !== "string" ||
              command.length !== lengths[command[0]] ||
              !command.slice(1).every(number)
            )
              fail("An artwork path command is invalid.");
          }
          if (item.commands[0][0] !== "M")
            fail("An artwork path must start with a move command.");
          break;
        }
        case "image":
          if (!record(item.logo)) fail("An artwork image is incomplete.");
          validateLogo(item.logo as unknown as Logo);
          break;
        case "group":
          visit(item.children, depth + 1);
          break;
        default:
          fail("This artwork object is not supported.");
      }
    }
  };
  visit(artwork, 0);
}

const n = (value: number) => String(Number(value.toFixed(5)));
const mime = { svg: "image/svg+xml", png: "image/png", jpeg: "image/jpeg" };

export function renderArtwork(items: VectorItem[]): string {
  return items
    .filter((item) => item.visible)
    .map((item) => {
      const { fill, stroke, strokeWidth, opacity } = item.style;
      let geometry: string;
      switch (item.kind) {
        case "rect":
          geometry = `<rect x="${n(-item.width / 2)}" y="${n(-item.height / 2)}" width="${n(item.width)}" height="${n(item.height)}" rx="${n(item.rx)}" ry="${n(item.ry)}"/>`;
          break;
        case "ellipse":
          geometry = `<ellipse rx="${n(item.rx)}" ry="${n(item.ry)}"/>`;
          break;
        case "path":
          geometry = `<path d="${item.commands.map((command) => command.map((value) => (typeof value === "number" ? n(value) : value)).join(" ")).join(" ")}" transform="translate(${n(-item.offset[0])} ${n(-item.offset[1])})"/>`;
          break;
        case "image":
          geometry = `<image x="${n(-item.logo.width / 2)}" y="${n(-item.logo.height / 2)}" width="${n(item.logo.width)}" height="${n(item.logo.height)}" preserveAspectRatio="none" href="data:${mime[item.logo.kind]};base64,${item.logo.data}"/>`;
          break;
        case "group":
          geometry = renderArtwork(item.children);
          break;
      }
      return `<g transform="matrix(${item.transform.map(n).join(" ")})" fill="${fill}" stroke="${stroke}" stroke-width="${n(strokeWidth)}" fill-rule="${item.style.fillRule ?? "nonzero"}" stroke-linecap="${item.style.lineCap ?? "butt"}" stroke-linejoin="${item.style.lineJoin ?? "miter"}" opacity="${n(opacity)}">${geometry}</g>`;
    })
    .join("\n");
}
