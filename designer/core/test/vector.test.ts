// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  createDesign,
  parseSheet,
  renderSheet,
  validateArtwork,
  type VectorItem,
  type TemplateDefinitions,
} from "../src/index.ts";
const templateDefinitions = JSON.parse(
  readFileSync(
    new URL("../../../templates/templates.json", import.meta.url),
    "utf8",
  ),
) as TemplateDefinitions;
import { History } from "../../app/src/editor/history.ts";
const rectangle = (): Extract<VectorItem, { kind: "rect" }> => ({
  kind: "rect",
  id: "rectangle",
  name: "Rectangle",
  transform: [1, 0, 0, 1, 350, 50],
  visible: true,
  locked: false,
  style: { fill: "#ff0000", stroke: "none", strokeWidth: 0, opacity: 1 },
  width: 80,
  height: 40,
  rx: 0,
  ry: 0,
});
const source = (template: string) =>
  readFileSync(
    new URL(`../../../templates/${template}.svg`, import.meta.url),
    "utf8",
  );

test("vector sheets roundtrip nested paths, transforms, visibility, locking and style", () => {
  const design = createDesign(templateDefinitions, "gate-standard-v1");
  const child = {
    ...rectangle(),
    transform: [0, 1, -1, 0, 10, 20] as [
      number,
      number,
      number,
      number,
      number,
      number,
    ],
    locked: true,
  };
  design.artwork = [
    { ...rectangle(), kind: "group", children: [child], id: "group" },
    { ...rectangle(), id: "hidden", visible: false },
    {
      ...rectangle(),
      kind: "path",
      id: "path",
      commands: [
        ["M", 0, 0],
        ["C", 5, 0, 10, 10, 20, 20],
        ["Q", 5, 5, 0, 0],
        ["Z"],
      ],
      offset: [10, 10],
      style: {
        fill: "#ff0000",
        stroke: "#00ff00",
        strokeWidth: 2,
        opacity: 0.7,
        fillRule: "evenodd",
        lineCap: "square",
        lineJoin: "bevel",
      },
    },
  ];
  const rendered = renderSheet(
    templateDefinitions,
    source(design.template),
    design,
  );
  assert.deepEqual(parseSheet(templateDefinitions, rendered), design);
  assert.match(rendered, /fill-rule="evenodd"/);
  assert.match(rendered, /stroke-linecap="square"/);
  assert.match(rendered, /clip-path="url\(#designer-clip-top\)"/);
});

test("untrusted vector metadata rejects raw markup, invalid commands, duplicate IDs and numeric overflow", () => {
  for (const change of [
    { transform: [1, 0, 0, 1, Infinity, 0] },
    { style: { ...rectangle().style, fill: "url(https://example.com)" } },
    { name: "bad\u0000name" },
    { kind: "foreignObject" },
    {
      kind: "path",
      commands: [
        ["M", 0, 0],
        ["L", 1, '" onload="x'],
      ],
      offset: [0, 0],
    },
    { kind: "path", commands: [["L", 0, 0]], offset: [0, 0] },
    { style: { ...rectangle().style, fillRule: '"/><script/>' } },
  ])
    assert.throws(() => validateArtwork([{ ...rectangle(), ...change }]));
  assert.throws(() => validateArtwork([rectangle(), rectangle()]));
  let nested: VectorItem = rectangle();
  for (let index = 0; index < 14; index++)
    nested = {
      ...rectangle(),
      kind: "group",
      id: `group-${index}`,
      children: [nested],
    };
  assert.throws(() => validateArtwork([nested]), /nested/);
});

test("free artwork is clipped to printable panels, hidden objects do not paint", async () => {
  const design = createDesign(templateDefinitions, "gate-standard-v1");
  design.accent = "none";
  design.colors.background = "#ffffff";
  design.artwork = [
    {
      ...rectangle(),
      width: 1000,
      height: 1000,
      transform: [1, 0, 0, 1, 350, 300],
    },
    {
      ...rectangle(),
      id: "hidden",
      visible: false,
      style: { ...rectangle().style, fill: "#00ff00" },
    },
  ];
  let svg = renderSheet(templateDefinitions, source(design.template), design);
  // Production extraction removes the canonical Guides layer; check the resulting alpha.
  svg = svg.replace(/<g id="guides"[\s\S]*?\n {2}<\/g>/, "");
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(700, 600)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
  assert.deepEqual(pixel(350, 50), [255, 0, 0, 255]);
  assert.equal(pixel(350, 300)[3], 0);
  assert.deepEqual(pixel(50, 300), [255, 0, 0, 255]);
});

test("undo is bounded, immutable, deduplicated and drops redo after a new change", () => {
  const value = { artwork: ["first"] },
    history = new History(value);
  value.artwork.push("external mutation");
  history.push({ artwork: ["second"] });
  history.push({ artwork: ["second"] });
  assert.deepEqual(history.step(-1), { artwork: ["first"] });
  assert.equal(history.canUndo, false);
  history.push({ artwork: ["third"] });
  assert.equal(history.canRedo, false);
  for (let index = 0; index < 100; index++)
    history.push({ artwork: [String(index)] });
  let steps = 0;
  while (history.step(-1)) steps++;
  assert.equal(steps, 59);
});

 test('large undo snapshots stay within the memory budget while retaining the last change', () => {
  const history = new History('a'.repeat(40), 200);
  history.push('b'.repeat(40)); history.push('c'.repeat(40)); history.push('d'.repeat(40));
  assert.equal(history.step(-1), 'c'.repeat(40)); assert.equal(history.canUndo, false);
  assert.equal(history.step(1), 'd'.repeat(40));
});
