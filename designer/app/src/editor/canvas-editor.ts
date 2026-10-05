// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import {
  ActiveSelection,
  Canvas,
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  Path,
  PencilBrush,
  Point,
  Rect,
  controlsUtils,
  loadSVGFromString,
  util,
} from "fabric";
import {
  fromBase64,
  placeLogo,
  renderSheet,
  safeRect,
  validateArtwork,
  type Design,
  type Logo,
  type PathCommand,
  type TemplateDefinition,
  type VectorItem,
} from "@track-assets/designer-core";
import { loadImage, withoutGuides } from "../browser.ts";
import { panelLabel } from "../artwork.ts";
import { sheets, templates } from "../templates.ts";
import {
  fromVector,
  imageObject,
  renewIds,
  styleOf,
  toVector,
} from "./vector-adapter.ts";

export type Tool =
  | "select"
  | "nodes"
  | "pen"
  | "pencil"
  | "rect"
  | "ellipse"
  | "hand";
export interface Selection {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  count: number;
  nodes?: PathCommand[];
}
export interface EditorView {
  tool: Tool;
  panel: string;
  zoom: number;
  guides: boolean;
  snap: boolean;
  drawing: boolean;
  selection?: Selection;
  layers: {
    id: string;
    name: string;
    kind: string;
    locked: boolean;
    visible: boolean;
  }[];
}
interface Callbacks {
  change: (artwork: VectorItem[]) => void;
  view: (view: EditorView) => void;
  error: (error: unknown) => void;
}
interface Anchor {
  point: Point;
  handle: Point;
}
const round = (value: number) => Math.round(value * 100) / 100;

export class CanvasEditor {
  readonly canvas: Canvas;
  private callbacks: Callbacks;
  private design: Design;
  private observer: ResizeObserver;
  private disposed = false;
  private backgroundGeneration = 0;
  private loadGeneration = 0;
  private saved: VectorItem[] = [];
  private tool: Tool = "select";
  private panel = "all";
  private guides = true;
  private snap = true;
  private fill = "#f0761d";
  private anchors: Anchor[] = [];
  private draft?: FabricObject;
  private dragStart?: Point;
  private panStart?: Point;
  private cursor = new Point(350, 50);
  private keyboardDrawing = false;
  private isLoading = false;

  constructor(host: HTMLDivElement, design: Design, callbacks: Callbacks) {
    this.design = design;
    this.callbacks = callbacks;
    const element = document.createElement("canvas");
    host.append(element);
    this.canvas = new Canvas(element, {
      preserveObjectStacking: true,
      selection: true,
      enablePointerEvents: true,
      stopContextMenu: true,
    });
    this.canvas.upperCanvasEl.tabIndex = 0;
    this.canvas.upperCanvasEl.setAttribute("role", "application");
    this.canvas.upperCanvasEl.setAttribute("aria-label", "Artwork canvas");
    this.canvas.upperCanvasEl.setAttribute("aria-describedby", "canvas-help");
    this.canvas.upperCanvasEl.addEventListener("keydown", this.onKey);
    this.canvas.on("selection:created", () => this.selected());
    this.canvas.on("selection:updated", () => this.selected());
    this.canvas.on("selection:cleared", () => this.emit());
    this.canvas.on("object:modified", () => this.publish());
    this.canvas.on("object:moving", ({ target }) => {
      if (this.snap) {
        target.set({
          left: Math.round(target.left / 5) * 5,
          top: Math.round(target.top / 5) * 5,
        });
      }
      this.emit();
    });
    this.canvas.on("object:scaling", () => this.emit());
    this.canvas.on("object:rotating", () => this.emit());
    this.canvas.on("path:created", ({ path }) => {
      path.artworkName = "Pencil path";
      this.publish();
    });
    this.canvas.on("mouse:down", (event) =>
      this.down(event.scenePoint, event.viewportPoint),
    );
    this.canvas.on("mouse:move", (event) =>
      this.move(event.scenePoint, event.viewportPoint),
    );
    this.canvas.on("mouse:up", () => this.up());
    this.canvas.on("mouse:wheel", ({ e }) => {
      e.preventDefault();
      e.stopPropagation();
      this.zoom(0.999 ** e.deltaY);
    });
    this.canvas.on("after:render", () => this.drawGuides());
    this.observer = new ResizeObserver(() => {
      if (this.disposed) return;
      this.canvas.setDimensions({
        width: host.clientWidth,
        height: host.clientHeight,
      });
      this.fit();
    });
    this.observer.observe(host);
    this.emit();
  }

  async load(design: Design) {
    const generation = ++this.loadGeneration;
    this.isLoading = true;
    try {
      const [items, background] = await Promise.all([
        Promise.all((design.artwork ?? []).map(fromVector)),
        this.prepareBackground(design),
      ]);
      if (this.disposed || generation !== this.loadGeneration) return;
      ++this.backgroundGeneration;
      this.cancelDrawing();
      this.design = design;
      this.panel = "all";
      this.canvas.discardActiveObject();
      this.canvas.remove(...this.canvas.getObjects());
      this.canvas.add(...items);
      this.canvas.backgroundImage = background.image;
      this.canvas.clipPath = background.clip;
      this.saved = structuredClone(design.artwork ?? []);
      this.fit();
      this.emit();
    } finally {
      if (generation === this.loadGeneration) this.isLoading = false;
    }
  }

  async setBackground(design: Design) {
    const generation = ++this.backgroundGeneration;
    const background = await this.prepareBackground(design);
    if (this.disposed || generation !== this.backgroundGeneration) return;
    this.design = design;
    this.canvas.backgroundImage = background.image;
    this.canvas.clipPath = background.clip;
    this.canvas.requestRenderAll();
  }

  private async prepareBackground(design: Design) {
    const base = renderSheet(templates, sheets[design.template], {
      ...design,
      logo: undefined,
      artwork: undefined,
    });
    const image = new FabricImage(
      await loadImage(
        new Blob([withoutGuides(base)], { type: "image/svg+xml" }),
      ),
      { left: 0, top: 0, originX: "left", originY: "top" },
    );
    const definition = templates[design.template];
    const clips: FabricObject[] = [];
    if (definition.transparency === "cut-out") {
      const document = new DOMParser().parseFromString(
        sheets[design.template],
        "image/svg+xml",
      );
      const outline = document
        .getElementById("guide-front-outline")
        ?.getAttribute("d");
      if (!outline)
        throw new Error("The flag template is missing its outline.");
      clips.push(
        new Path(outline, {
          left: 0,
          top: 5,
          originX: "left",
          originY: "top",
          strokeWidth: 0,
        }),
        new Path(outline, {
          left: definition.layout.width,
          top: 5,
          originX: "right",
          originY: "top",
          flipX: true,
          strokeWidth: 0,
        }),
      );
    } else
      for (const panel of Object.values(definition.panels))
        clips.push(
          new Rect({
            left: panel.x,
            top: panel.y,
            width: panel.width,
            height: panel.height,
            originX: "left",
            originY: "top",
            strokeWidth: 0,
          }),
        );
    return { image, clip: new Group(clips, { absolutePositioned: true }) };
  }

  setTool(tool: Tool) {
    this.cancelDrawing();
    this.tool = tool;
    this.canvas.isDrawingMode = tool === "pencil";
    if (tool === "pencil") {
      const brush = new PencilBrush(this.canvas);
      brush.color = this.fill;
      brush.width = 4;
      this.canvas.freeDrawingBrush = brush;
    }
    this.canvas.selection = tool === "select" || tool === "nodes";
    this.canvas.skipTargetFind = !this.canvas.selection;
    this.canvas.defaultCursor =
      tool === "hand"
        ? "grab"
        : this.canvas.selection
          ? "default"
          : "crosshair";
    this.selected();
  }
  setPanel(panel: string) {
    this.cancelDrawing();
    this.panel = panel;
    this.fit();
  }
  setGuides(value: boolean) {
    this.guides = value;
    this.canvas.requestRenderAll();
    this.emit();
  }
  setSnap(value: boolean) {
    this.snap = value;
    this.emit();
  }
  focus() {
    this.canvas.upperCanvasEl.focus();
  }

  fit() {
    const region = this.region();
    const width = this.canvas.width,
      height = this.canvas.height;
    if (!width || !height) return;
    const zoom = Math.max(
      0.1,
      Math.min((width - 70) / region.width, (height - 70) / region.height),
    );
    this.canvas.setViewportTransform([
      zoom,
      0,
      0,
      zoom,
      (width - region.width * zoom) / 2 - region.x * zoom,
      (height - region.height * zoom) / 2 - region.y * zoom,
    ]);
    this.cursor = new Point(
      region.x + region.width / 2,
      region.y + region.height / 2,
    );
    this.emit();
  }
  zoom(factor: number) {
    this.canvas.zoomToPoint(
      new Point(this.canvas.width / 2, this.canvas.height / 2),
      Math.max(0.1, Math.min(12, this.canvas.getZoom() * factor)),
    );
    this.emit();
  }

  select(id: string, multiple = false) {
    const object = this.canvas
      .getObjects()
      .find((object) => object.artworkId === id);
    if (!object?.selectable || !object.visible) return;
    this.setTool("select");
    if (multiple) {
      const active = this.canvas.getActiveObjects();
      this.canvas.discardActiveObject();
      const chosen = active.includes(object)
        ? active.filter((item) => item !== object)
        : [...active, object];
      if (chosen.length > 1)
        this.canvas.setActiveObject(
          new ActiveSelection(chosen, { canvas: this.canvas }),
        );
      else if (chosen[0]) this.canvas.setActiveObject(chosen[0]);
    } else this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
    this.emit();
  }

  setLayer(id: string, property: "visible" | "locked", value: boolean) {
    const object = this.canvas
      .getObjects()
      .find((object) => object.artworkId === id);
    if (!object) return;
    this.canvas.discardActiveObject();
    object.set(
      property === "visible"
        ? { visible: value }
        : { selectable: !value, evented: !value },
    );
    this.publish();
  }

  update(property: string, value: string | number, keepAspect = false) {
    const object = this.canvas.getActiveObject();
    if (!object || this.isLoading) return;
    if (property === "name") object.artworkName = String(value).slice(0, 80);
    else if (property === "x" || property === "y") {
      const centre = object.getCenterPoint();
      object.setPositionByOrigin(
        new Point(
          property === "x" ? Number(value) : centre.x,
          property === "y" ? Number(value) : centre.y,
        ),
        "center",
        "center",
      );
    } else if (property === "width" || property === "height") {
      const factor =
        Number(value) /
        (property === "width"
          ? object.width * object.scaleX
          : object.height * object.scaleY);
      object.set(
        property === "width"
          ? {
              scaleX: Math.max(0.001, object.scaleX * factor),
              ...(keepAspect && {
                scaleY: Math.max(0.001, object.scaleY * factor),
              }),
            }
          : {
              scaleY: Math.max(0.001, object.scaleY * factor),
              ...(keepAspect && {
                scaleX: Math.max(0.001, object.scaleX * factor),
              }),
            },
      );
    } else if (property === "fill" || property === "stroke") {
      this.fill = String(value) === "none" ? this.fill : String(value);
      const apply = (item: FabricObject) => {
        item.set(property, value === "none" ? null : value);
        if (item instanceof Group) item.getObjects().forEach(apply);
      };
      apply(object);
    } else if (property === "strokeWidth") {
      const apply = (item: FabricObject) => {
        item.set("strokeWidth", Number(value));
        if (item instanceof Group) item.getObjects().forEach(apply);
      };
      apply(object);
    } else if (property === "angle" || property === "opacity")
      object.set(property, Number(value));
    object.setCoords();
    this.publish();
  }

  async importLogo(logo: Logo, name: string, allPanels = true) {
    let source: FabricObject;
    if (logo.kind === "svg") {
      try {
        const svg = new TextDecoder().decode(fromBase64(logo.data));
        if (/<(?:filter|mask|marker|pattern|linearGradient|radialGradient)\b/i.test(svg)) throw new Error('This SVG uses advanced appearance features.');
        const result = await loadSVGFromString(
          new TextDecoder().decode(fromBase64(logo.data)),
        );
        const objects = result.objects.filter(
          (object): object is FabricObject => Boolean(object),
        );
        source = util.groupSVGElements(objects, result.options);
        // Only persist our typed, checked geometry; gradients and unsupported SVGs stay embedded images.
        validateArtwork([toVector(source)]);
      } catch {
        source = await imageObject(logo);
      }
    } else source = await imageObject(logo);
    const definition = templates[this.design.template];
    const panels = allPanels
      ? Object.entries(definition.panels)
      : ([
          [
            this.panel === "all"
              ? Object.keys(definition.panels)[0]
              : this.panel,
            definition.panels[
              this.panel === "all"
                ? Object.keys(definition.panels)[0]
                : this.panel
            ],
          ],
        ] as const);
    const objects: FabricObject[] = [];
    for (const [id, panel] of panels) {
      const placed = placeLogo(
        panel,
        { width: source.width, height: source.height },
        { visible: true, scale: 0.8, offsetX: 0, offsetY: 0 },
      )!;
      const object = await source.clone();
      renewIds(object);
      object.set({
        angle: placed.rotation,
        scaleX: placed.width / source.width,
        scaleY: placed.height / source.height,
        artworkName: `${name.replace(/\.[^.]+$/, "").slice(0, 50)} · ${panelLabel(id)}`,
      });
      object.setPositionByOrigin(
        new Point(placed.cx, placed.cy),
        "center",
        "center",
      );
      object.setCoords();
      objects.push(object);
    }
    validateArtwork([
      ...this.saved,
      ...objects.map((object) => toVector(object)),
    ]);
    this.canvas.add(...objects);
    if (objects[0]) this.canvas.setActiveObject(objects[0]);
    this.setTool("select");
    this.publish();
  }

  async duplicate() {
    const source = this.canvas.getActiveObject();
    if (!source) return;
    const clone = await source.clone();
    renewIds(clone);
    clone.set({ left: clone.left + 10, top: clone.top + 10 });
    if (clone instanceof ActiveSelection) {
      clone.canvas = this.canvas;
      this.canvas.add(...clone.getObjects());
    } else this.canvas.add(clone);
    this.canvas.setActiveObject(clone);
    this.publish();
  }
  deleteSelection() {
    const objects = this.canvas.getActiveObjects();
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    this.publish();
  }
  group() {
    const active = this.canvas.getActiveObjects();
    if (active.length < 2) return;
    this.canvas.discardActiveObject();
    this.canvas.remove(...active);
    const group = new Group(active, { strokeWidth: 0 });
    group.artworkName = "Group";
    this.canvas.add(group);
    this.canvas.setActiveObject(group);
    this.publish();
  }
  ungroup() {
    const group = this.canvas.getActiveObject();
    if (!(group instanceof Group) || group instanceof ActiveSelection) return;
    this.canvas.discardActiveObject();
    const objects = group.removeAll();
    this.canvas.remove(group);
    this.canvas.add(...objects);
    this.canvas.setActiveObject(
      new ActiveSelection(objects, { canvas: this.canvas }),
    );
    this.publish();
  }
  order(direction: -1 | 1) {
    const objects = this.canvas.getActiveObjects();
    for (const object of direction === 1 ? [...objects].reverse() : objects)
      direction === 1
        ? this.canvas.bringObjectForward(object)
        : this.canvas.sendObjectBackwards(object);
    this.publish();
  }
  align(alignment: "left" | "center" | "right") {
    const objects = this.canvas.getActiveObjects();
    if (!objects.length) return;
    this.canvas.discardActiveObject();
    const region = this.region();
    for (const object of objects) {
      const bounds = object.getBoundingRect();
      const x =
        alignment === "left"
          ? region.x
          : alignment === "right"
            ? region.x + region.width - bounds.width
            : region.x + (region.width - bounds.width) / 2;
      object.set({ left: object.left + x - bounds.left });
      object.setCoords();
    }
    this.canvas.setActiveObject(
      objects.length > 1
        ? new ActiveSelection(objects, { canvas: this.canvas })
        : objects[0],
    );
    this.publish();
  }

  convertToPath() {
    const object = this.canvas.getActiveObject();
    if (!object || object instanceof Path) return;
    let path: Path;
    if (object instanceof Ellipse) {
      const { rx, ry } = object,
        k = 0.5522847498;
      path = new Path(
        `M ${-rx} 0 C ${-rx} ${-ry * k} ${-rx * k} ${-ry} 0 ${-ry} C ${rx * k} ${-ry} ${rx} ${-ry * k} ${rx} 0 C ${rx} ${ry * k} ${rx * k} ${ry} 0 ${ry} C ${-rx * k} ${ry} ${-rx} ${ry * k} ${-rx} 0 Z`,
      );
    } else if (object instanceof Rect)
      path = new Path(
        `M ${-object.width / 2} ${-object.height / 2} h ${object.width} v ${object.height} h ${-object.width} Z`,
      );
    else return;
    path.set({
      ...styleOf(object),
      artworkId: object.artworkId,
      artworkName: object.artworkName,
      originX: "center",
      originY: "center",
    });
    util.applyTransformToObject(path, object.calcTransformMatrix());
    const index = this.canvas.getObjects().indexOf(object);
    this.canvas.discardActiveObject();
    this.canvas.remove(object);
    this.canvas.insertAt(index, path);
    this.canvas.setActiveObject(path);
    this.setTool("nodes");
    this.publish();
  }

  editNode(index: number, coordinate: number, value: number) {
    const path = this.canvas.getActiveObject();
    if (
      !(path instanceof Path) ||
      !Number.isFinite(value) ||
      Math.abs(value) > 1e6
    )
      return;
    const oldOffset = path.pathOffset.clone(),
      matrix = path.calcOwnMatrix();
    if (coordinate >= path.path[index].length - 1) return;
    path.path[index][coordinate + 1] = value;
    path.setDimensions();
    const delta = path.pathOffset.subtract(oldOffset);
    path.set({
      left: path.left + matrix[0] * delta.x + matrix[2] * delta.y,
      top: path.top + matrix[1] * delta.x + matrix[3] * delta.y,
      dirty: true,
    });
    path.setCoords();
    this.selected();
    this.publish();
  }
  curveNode(index: number, smooth: boolean) {
    const path = this.canvas.getActiveObject();
    if (!(path instanceof Path) || index < 1 || path.path[index][0] === "Z")
      return;
    const previous = path.path[index - 1],
      current = path.path[index];
    if (previous[0] === "Z") return;
    const x0 = Number(previous[previous.length - 2]),
      y0 = Number(previous[previous.length - 1]);
    const x = Number(current[current.length - 2]),
      y = Number(current[current.length - 1]);
    const oldOffset = path.pathOffset.clone(),
      matrix = path.calcOwnMatrix();
    path.path[index] = smooth
      ? ["C", x0 + (x - x0) / 3, y0, x - (x - x0) / 3, y, x, y]
      : ["L", x, y];
    this.refreshPath(path, oldOffset, matrix);
  }
  insertNode(index: number) {
    const path = this.canvas.getActiveObject();
    if (!(path instanceof Path) || index < 1) return;
    const command = path.path[index], previous = path.path[index - 1];
    if (!command || previous[0] === 'Z' || command[0] === 'M') return;
    const start = new Point(Number(previous[previous.length - 2]), Number(previous[previous.length - 1]));
    const oldOffset = path.pathOffset.clone(), matrix = path.calcOwnMatrix();
    if (command[0] === 'Z') {
      const first = path.path.slice(0, index).findLast(item => item[0] === 'M')!;
      const midpoint = start.midPointFrom(new Point(Number(first[1]), Number(first[2])));
      path.path.splice(index, 0, ['L', midpoint.x, midpoint.y]);
    } else {
      const end = new Point(Number(command[command.length - 2]), Number(command[command.length - 1]));
      if (command[0] === 'C') {
        const p1 = new Point(command[1], command[2]), p2 = new Point(command[3], command[4]);
        const a = start.midPointFrom(p1), b = p1.midPointFrom(p2), c = p2.midPointFrom(end);
        const d = a.midPointFrom(b), e = b.midPointFrom(c), midpoint = d.midPointFrom(e);
        path.path.splice(index, 1, ['C', a.x, a.y, d.x, d.y, midpoint.x, midpoint.y], ['C', e.x, e.y, c.x, c.y, end.x, end.y]);
      } else if (command[0] === 'Q') {
        const handle = new Point(command[1], command[2]), a = start.midPointFrom(handle), b = handle.midPointFrom(end), midpoint = a.midPointFrom(b);
        path.path.splice(index, 1, ['Q', a.x, a.y, midpoint.x, midpoint.y], ['Q', b.x, b.y, end.x, end.y]);
      } else {
        const midpoint = start.midPointFrom(end);
        path.path.splice(index, 1, ['L', midpoint.x, midpoint.y], ['L', end.x, end.y]);
      }
    }
    this.refreshPath(path, oldOffset, matrix);
  }

  removeNode(index: number) {
    const path = this.canvas.getActiveObject();
    if (!(path instanceof Path) || index === 0 || path.path.length < 3) return;
    const oldOffset = path.pathOffset.clone(),
      matrix = path.calcOwnMatrix();
    path.path.splice(index, 1);
    this.refreshPath(path, oldOffset, matrix);
  }

  private refreshPath(path: Path, oldOffset: Point, matrix: number[]) {
    path.setDimensions();
    const delta = path.pathOffset.subtract(oldOffset);
    path.set({
      left: path.left + matrix[0] * delta.x + matrix[2] * delta.y,
      top: path.top + matrix[1] * delta.x + matrix[3] * delta.y,
      dirty: true,
    });
    path.setCoords();
    this.selected();
    this.publish();
  }

  finishPath(close = false) {
    if (this.anchors.length < 2) {
      this.cancelDrawing();
      return;
    }
    const commands = this.penCommands();
    if (close) commands.push(["Z"]);
    if (this.draft) this.canvas.remove(this.draft);
    const path = new Path(commands, {
      fill: close ? this.fill : null,
      stroke: this.fill,
      strokeWidth: 3,
      artworkName: "Pen path",
    });
    this.anchors = [];
    this.draft = undefined;
    this.dragStart = undefined;
    this.canvas.add(path);
    this.canvas.setActiveObject(path);
    this.setTool("nodes");
    this.publish();
  }
  cancelDrawing() {
    if (this.draft) this.canvas.remove(this.draft);
    this.draft = undefined;
    this.anchors = [];
    this.dragStart = undefined;
    this.keyboardDrawing = false;
    this.canvas.requestRenderAll();
    this.emit();
  }

  private region() {
    const definition = templates[this.design.template];
    return this.panel === "all"
      ? {
          x: 0,
          y: 0,
          width: definition.layout.width,
          height: definition.layout.height,
        }
      : definition.panels[this.panel];
  }
  private point(point: Point) {
    return this.snap
      ? new Point(Math.round(point.x / 5) * 5, Math.round(point.y / 5) * 5)
      : point.clone();
  }
  private down(scene: Point, viewport: Point) {
    if (this.isLoading) return;
    this.cursor = this.point(scene);
    if (this.tool === "hand") {
      this.panStart = viewport.clone();
      return;
    }
    if (this.tool === "pen") {
      if (
        this.anchors.length > 2 &&
        this.cursor.distanceFrom(this.anchors[0].point) *
          this.canvas.getZoom() <
          12
      ) {
        this.finishPath(true);
        return;
      }
      this.anchors.push({ point: this.cursor.clone(), handle: new Point() });
      this.dragStart = this.cursor.clone();
      this.previewPen();
    } else if (this.tool === "rect" || this.tool === "ellipse") {
      this.dragStart = this.cursor.clone();
      this.draft =
        this.tool === "rect"
          ? new Rect({ width: 1, height: 1 })
          : new Ellipse({ rx: 0.5, ry: 0.5 });
      this.draft.set({
        left: this.cursor.x,
        top: this.cursor.y,
        originX: "left",
        originY: "top",
        fill: this.fill,
        strokeWidth: 0,
        selectable: false,
        evented: false,
        artworkName: this.tool === "rect" ? "Rectangle" : "Ellipse",
      });
      this.canvas.add(this.draft);
      this.emit();
    }
  }
  private move(scene: Point, viewport: Point) {
    this.cursor = this.point(scene);
    if (this.panStart) {
      const matrix = [...this.canvas.viewportTransform] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      matrix[4] += viewport.x - this.panStart.x;
      matrix[5] += viewport.y - this.panStart.y;
      this.panStart = viewport.clone();
      this.canvas.setViewportTransform(matrix);
      return;
    }
    if (this.dragStart && this.tool === "pen") {
      this.anchors[this.anchors.length - 1].handle = this.cursor.subtract(
        this.dragStart,
      );
      this.previewPen();
    } else if (this.dragStart && this.draft) {
      const width = Math.max(1, Math.abs(this.cursor.x - this.dragStart.x)),
        height = Math.max(1, Math.abs(this.cursor.y - this.dragStart.y));
      this.draft.set({
        left: Math.min(this.cursor.x, this.dragStart.x),
        top: Math.min(this.cursor.y, this.dragStart.y),
      });
      if (this.draft instanceof Rect) this.draft.set({ width, height });
      if (this.draft instanceof Ellipse)
        this.draft.set({ rx: width / 2, ry: height / 2 });
      this.canvas.requestRenderAll();
    }
  }
  private up() {
    this.panStart = undefined;
    if (this.dragStart && this.draft && this.tool !== "pen") {
      const object = this.draft;
      this.draft = undefined;
      this.dragStart = undefined;
      if (object.width < 2 || object.height < 2) this.canvas.remove(object);
      else {
        object.set({ selectable: true, evented: true });
        object.setCoords();
        this.canvas.setActiveObject(object);
        this.setTool("select");
        this.publish();
      }
    }
    this.dragStart = undefined;
    this.canvas.requestRenderAll();
    this.emit();
  }
  private penCommands(): PathCommand[] {
    return this.anchors.map((anchor, index): PathCommand => {
      const { point, handle } = anchor;
      if (!index) return ["M", point.x, point.y];
      const previous = this.anchors[index - 1];
      return handle.x || handle.y || previous.handle.x || previous.handle.y
        ? [
            "C",
            previous.point.x + previous.handle.x,
            previous.point.y + previous.handle.y,
            point.x - handle.x,
            point.y - handle.y,
            point.x,
            point.y,
          ]
        : ["L", point.x, point.y];
    });
  }
  private previewPen() {
    if (this.draft) this.canvas.remove(this.draft);
    this.draft = new Path(this.penCommands(), {
      fill: null,
      stroke: this.fill,
      strokeWidth: 3,
      selectable: false,
      evented: false,
    });
    this.canvas.add(this.draft);
    this.canvas.requestRenderAll();
    this.emit();
  }
  private pathControls(path: Path) {
    const controls = controlsUtils.createPathControls(path, {
      pointStyle: { controlFill: "#ffffff", controlStroke: "#1e93db" },
      controlPointStyle: { controlFill: "#1e93db", controlStroke: "#ffffff" },
    });
    // Keep every untouched anchor stationary even when adjacent commands have different lengths.
    for (const [key, control] of Object.entries(controls)) {
      const match = /^c_(\d+)_[MLCQ](?:_CP_([12]))?$/.exec(key);
      if (!match) continue;
      const index = Number(match[1]),
        point = match[2]
          ? Number(match[2]) === 1
            ? 1
            : 3
          : path.path[index].length - 2;
      control.actionHandler = (_event, _transform, x, y) => {
        const matrix = path.calcOwnMatrix(),
          oldOffset = path.pathOffset.clone();
        const local = new Point(x, y).transform(
          util.invertTransform(path.calcTransformMatrix()),
        );
        path.path[index][point] = local.x + oldOffset.x;
        path.path[index][point + 1] = local.y + oldOffset.y;
        path.setDimensions();
        const delta = path.pathOffset.subtract(oldOffset);
        path.set({
          left: path.left + matrix[0] * delta.x + matrix[2] * delta.y,
          top: path.top + matrix[1] * delta.x + matrix[3] * delta.y,
          dirty: true,
        });
        path.setCoords();
        this.emit();
        return true;
      };
    }
    return controls;
  }
  private selected() {
    for (const object of this.canvas.getObjects()) {
      const nodes =
        this.tool === "nodes" &&
        object === this.canvas.getActiveObject() &&
        object instanceof Path;
      object.controls = nodes
        ? this.pathControls(object)
        : FabricObject.createControls().controls;
      object.set({
        borderColor: "#168cce",
        cornerColor: "#ffffff",
        cornerStrokeColor: "#168cce",
        transparentCorners: false,
        cornerSize: 10,
        touchCornerSize: 28,
        borderScaleFactor: 1.5,
      });
      object.hasBorders = !nodes;
      object.setCoords();
    }
    this.canvas.requestRenderAll();
    this.emit();
  }
  private publish() {
    if (this.isLoading || this.disposed) return;
    try {
      const artwork = this.canvas
        .getObjects()
        .filter((object) => object !== this.draft)
        .map((object) => toVector(object));
      validateArtwork(artwork);
      this.saved = structuredClone(artwork);
      this.callbacks.change(artwork);
      this.canvas.requestRenderAll();
      this.emit();
    } catch (error) {
      this.callbacks.error(error);
      void this.load({ ...this.design, artwork: this.saved });
    }
  }
  private emit() {
    if (this.disposed) return;
    const object = this.canvas.getActiveObject();
    let selection: Selection | undefined;
    if (object) {
      const centre = object.getCenterPoint();
      selection = {
        id: object.artworkId ?? "",
        name:
          object.artworkName ??
          (object instanceof ActiveSelection
            ? "Multiple objects"
            : object.type),
        kind: object.type.toLowerCase(),
        x: round(centre.x),
        y: round(centre.y),
        width: round(object.width * object.scaleX),
        height: round(object.height * object.scaleY),
        angle: round(object.angle),
        ...styleOf(object),
        count: this.canvas.getActiveObjects().length,
        nodes:
          object instanceof Path
            ? (structuredClone(object.path) as PathCommand[])
            : undefined,
      };
    }
    if (selection && object instanceof Group) {
      const paints = (item: FabricObject, key: "fill" | "stroke"): string[] =>
        item instanceof Group
          ? item.getObjects().flatMap((child) => paints(child, key))
          : [styleOf(item)[key]];
      for (const key of ["fill", "stroke"] as const) {
        const values = [...new Set(paints(object, key))];
        selection[key] = values.length === 1 ? values[0] : "mixed";
      }
    }
    this.callbacks.view({
      tool: this.tool,
      panel: this.panel,
      zoom: round(this.canvas.getZoom() * 100),
      guides: this.guides,
      snap: this.snap,
      drawing: Boolean(this.draft),
      selection,
      layers: this.canvas
        .getObjects()
        .filter((object) => object !== this.draft)
        .map((object) => ({
          id: (object.artworkId ??= crypto.randomUUID()),
          name: object.artworkName ?? object.type,
          kind: object.type.toLowerCase(),
          locked: !object.selectable,
          visible: object.visible,
        }))
        .reverse(),
    });
  }
  private drawGuides() {
    if (!this.guides || this.disposed) return;
    const context = this.canvas.getContext(),
      zoom = this.canvas.getZoom();
    context.save();
    context.transform(...this.canvas.viewportTransform);
    context.strokeStyle = "#6e93ad";
    context.lineWidth = 1 / zoom;
    context.setLineDash([4 / zoom, 4 / zoom]);
    for (const panel of Object.values(templates[this.design.template].panels)) {
      const safe = safeRect(panel);
      context.strokeRect(safe.x, safe.y, safe.width, safe.height);
    }
    context.restore();
  }
  private onKey = (event: KeyboardEvent) => {
    if (this.isLoading) return;
    if (event.key === "Escape") {
      this.cancelDrawing();
      this.canvas.discardActiveObject();
      this.setTool("select");
      event.preventDefault();
      return;
    }
    const object = this.canvas.getActiveObject();
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const delta = new Point(
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0,
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      );
      if (object && (this.tool === "select" || this.tool === "nodes")) {
        object.set({ left: object.left + delta.x, top: object.top + delta.y });
        object.setCoords();
        this.publish();
      } else {
        this.move(this.cursor.add(delta), new Point());
        this.canvas.requestRenderAll();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (this.tool === "pen") {
        if (event.ctrlKey || event.metaKey) this.finishPath();
        else {
          this.down(this.cursor, new Point());
          this.up();
        }
      } else if (this.tool === "rect" || this.tool === "ellipse") {
        if (this.keyboardDrawing) {
          this.up();
          this.keyboardDrawing = false;
        } else {
          this.down(this.cursor, new Point());
          this.keyboardDrawing = true;
        }
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.deleteSelection();
    }
  };
  async dispose() {
    this.disposed = true;
    ++this.loadGeneration;
    ++this.backgroundGeneration;
    this.observer.disconnect();
    this.canvas.upperCanvasEl.removeEventListener("keydown", this.onKey);
    await this.canvas.dispose();
  }
}
