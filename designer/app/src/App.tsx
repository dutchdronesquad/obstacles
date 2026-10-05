// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  ArrowsOut,
  Circle,
  Cursor,
  DownloadSimple,
  Eye,
  EyeSlash,
  FileArrowUp,
  Hand,
  Image,
  Link,
  Lock,
  LockOpen,
  Minus,
  PenNib,
  PencilSimple,
  Plus,
  Question,
  Selection,
  SlidersHorizontal,
  Square,
  Stack,
  Trash,
  LinkBreak,
  X,
  Copy,
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  type Icon,
} from "@phosphor-icons/react";
import {
  accentStyles,
  createDesign,
  logoLimits,
  parseSheet,
  prepareLogo,
  renderSheet,
  type AccentStyle,
  type Design,
} from "@track-assets/designer-core";
import {
  panelLabel,
  resolutionWarnings,
  sizeWarnings,
  validTextureId,
} from "./artwork.ts";
import { downloadSheet, estimatePanelSizes, rasterizeSvg } from "./browser.ts";
import { TemplatePicker } from "./TemplatePicker.tsx";
import { sheets, templates } from "./templates.ts";
import {
  CanvasEditor,
  type EditorView,
  type Tool,
} from "./editor/canvas-editor.ts";
import { History } from "./editor/history.ts";
import { migrateLegacy } from "./editor/legacy.ts";

interface Document {
  design: Design;
  textureId: string;
}
const first = "gate-standard-v1";
const initial = (): Document => ({
  design: createDesign(templates, first),
  textureId: templates[first].defaultTextureId,
});
const emptyView: EditorView = {
  tool: "select",
  panel: "all",
  zoom: 100,
  guides: true,
  snap: true,
  drawing: false,
  layers: [],
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "The file could not be opened.";
const tools: { id: Tool; name: string; key: string; icon: Icon }[] = [
  { id: "select", name: "Select", key: "V", icon: Cursor },
  { id: "nodes", name: "Edit points", key: "N", icon: Selection },
  { id: "pen", name: "Pen", key: "P", icon: PenNib },
  { id: "pencil", name: "Pencil", key: "B", icon: PencilSimple },
  { id: "rect", name: "Rectangle", key: "R", icon: Square },
  { id: "ellipse", name: "Ellipse", key: "E", icon: Circle },
  { id: "hand", name: "Pan", key: "H", icon: Hand },
];
const hints: Record<Tool, string> = {
  select: "Drag to move · Shift-click to select more",
  nodes: "Drag anchors and handles to reshape a path",
  pen: "Click for corners · Drag for curves · Click the first point to close",
  pencil: "Draw a freehand path on the sheet",
  rect: "Drag to draw a rectangle",
  ellipse: "Drag to draw an ellipse",
  hand: "Drag to move around the sheet",
};

export function App() {
  const [doc, setDoc] = useState(initial);
  const docRef = useRef(doc),
    history = useRef(new History(doc)),
    engine = useRef<CanvasEditor>(undefined);
  const shortcutDialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null),
    logoInput = useRef<HTMLInputElement>(null),
    sheetInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(emptyView),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [mobileProperties, setMobileProperties] = useState(false),
    [sheetSettings, setSheetSettings] = useState(false),
    [help, setHelp] = useState(false);
  const [aspect, setAspect] = useState(true),
    [allPanels, setAllPanels] = useState(true),
    [nodeIndex, setNodeIndex] = useState(0);
  const [sizes, setSizes] = useState<{ sheet: string; warnings: string[] }>();
  const operation = useRef(0);
  const definition = templates[doc.design.template],
    selected = view.selection;
  const commit = (next: Document) => {
    docRef.current = next;
    history.current.push(next);
    setDoc(next);
  };
  const rendered = useMemo(() => {
    try {
      const sheet = renderSheet(
        templates,
        sheets[doc.design.template],
        doc.design,
      );
      if (new Blob([sheet]).size > 32 * 1024 * 1024)
        throw new Error(
          "This sheet is too large to reopen. Remove an image or use a smaller file.",
        );
      return { sheet, error: "" };
    } catch (error) {
      return { sheet: "", error: message(error) };
    }
  }, [doc.design]);
  const warnings = [
    ...new Set([
      ...resolutionWarnings(definition, doc.design),
      ...(sizes?.sheet === rendered.sheet ? sizes.warnings : []),
    ]),
  ];

  useEffect(() => {
    const editor = new CanvasEditor(host.current!, docRef.current.design, {
      change: (artwork) => {
        const next = {
          ...docRef.current,
          design: { ...docRef.current.design, artwork },
        };
        docRef.current = next;
        history.current.push(next);
        setDoc(next);
        setError("");
      },
      view: setView,
      error: (error) => setError(message(error)),
    });
    engine.current = editor;
    void editor
      .load(docRef.current.design)
      .catch((error) => setError(message(error)));
    return () => {
      engine.current = undefined;
      void editor.dispose();
    };
  }, []);
  useEffect(() => {
    if (help) shortcutDialog.current?.showModal();
  }, [help]);
  const closeHelp = () => {
    shortcutDialog.current?.close();
    setHelp(false);
  };
  useEffect(() => {
    setNodeIndex(0);
  }, [selected?.id]);
  useEffect(() => {
    if (!rendered.sheet) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void estimatePanelSizes(rendered.sheet, definition)
        .then((result) => {
          if (!cancelled)
            setSizes({ sheet: rendered.sheet, warnings: sizeWarnings(result) });
        })
        .catch((error) => {
          if (!cancelled) setError(message(error));
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rendered.sheet, definition]);

  async function restore(direction: -1 | 1) {
    if (busy) return;
    const next = history.current.step(direction);
    if (!next) return;
    setBusy(true);
    try {
      await engine.current?.load(next.design);
      docRef.current = next;
      setDoc(next);
      setNotice(direction === -1 ? "Change undone" : "Change restored");
    } catch (error) {
      history.current.step(direction === -1 ? 1 : -1);
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if (busy || help) return;
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey) {
        if (key === "z") {
          event.preventDefault();
          void restore(event.shiftKey ? 1 : -1);
        } else if (key === "d") {
          event.preventDefault();
          void engine.current?.duplicate();
        } else if (key === "g") {
          event.preventDefault();
          event.shiftKey ? engine.current?.ungroup() : engine.current?.group();
        }
      } else {
        const tool = tools.find((tool) => tool.key.toLowerCase() === key);
        if (tool) {
          event.preventDefault();
          engine.current?.setTool(tool.id);
          engine.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function changeBase(patch: Partial<Design>) {
    const next = {
      ...docRef.current,
      design: { ...docRef.current.design, ...patch },
    };
    commit(next);
    void engine.current
      ?.setBackground(next.design)
      .catch((error) => setError(message(error)));
  }
  async function changeTemplate(template: string) {
    if (busy) return;
    const design = createDesign(templates, template);
    const next = {
      design: {
        ...design,
        name: doc.design.name,
        colors: {
          ...design.colors,
          background: doc.design.colors.background,
          accent: doc.design.colors.accent,
        },
      },
      textureId: templates[template].defaultTextureId,
    };
    setBusy(true);
    try {
      await engine.current?.load(next.design);
      commit(next);
      setNotice("New sheet started. Undo returns to your previous artwork.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function openFile(
    event: ChangeEvent<HTMLInputElement>,
    kind: "logo" | "sheet",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const current = ++operation.current;
    setBusy(true);
    setError("");
    try {
      const limit = kind === "logo" ? logoLimits.bytes : 32 * 1024 * 1024;
      if (file.size > limit)
        throw new Error(
          `Choose a ${kind} smaller than ${limit / 1024 / 1024} MB.`,
        );
      if (kind === "sheet") {
        const design = migrateLegacy(parseSheet(templates, await file.text()));
        renderSheet(templates, sheets[design.template], design);
        await engine.current?.load(design);
        if (current !== operation.current) return;
        const id = file.name.replace(/\.svg$/i, "");
        commit({
          design,
          textureId: validTextureId(id)
            ? id
            : templates[design.template].defaultTextureId,
        });
        setNotice("Sheet reopened. Your objects and paths are editable.");
      } else {
        const prepared = await prepareLogo(
          { type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
          { rasterizeSvg },
        );
        if (current !== operation.current) return;
        await engine.current?.importLogo(prepared.logo, file.name, allPanels);
        setSheetSettings(false);
        setNotice(
          prepared.rasterized
            ? "Logo added as an image. Outline text in your SVG for editable vector shapes."
            : "Logo added. Move, resize or ungroup it to edit its shapes.",
        );
      }
    } catch (error) {
      setError(message(error));
    } finally {
      if (current === operation.current) setBusy(false);
    }
  }
  const act = (action: () => void | Promise<void>) => {
    void Promise.resolve()
      .then(action)
      .catch((error) => setError(message(error)));
  };
  const update = (property: string, value: string | number) =>
    engine.current?.update(property, value, aspect);
  const pathNode =
    selected?.nodes?.[Math.min(nodeIndex, selected.nodes.length - 1)];
  const hasSelection = selected && !sheetSettings;

  return (
    <div className="app">
      <a className="skip-link" href="#properties">
        Skip to properties
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="https://trackdraw.app"
          target="_blank"
          rel="noreferrer"
        >
          <img src="/assets/trackdraw-logo.svg" alt="TrackDraw" />
        </a>
        <div className="document-title">
          <input
            aria-label="Artwork name"
            placeholder="Untitled artwork"
            maxLength={80}
            value={doc.design.name ?? ""}
            onChange={(event) =>
              changeBase({ name: event.target.value || undefined })
            }
          />
          <span>Artwork designer</span>
        </div>
        <div className="header-actions">
          <Action
            icon={ArrowCounterClockwise}
            label="Undo"
            disabled={busy || !history.current.canUndo}
            onClick={() => void restore(-1)}
          />
          <Action
            icon={ArrowClockwise}
            label="Redo"
            disabled={busy || !history.current.canRedo}
            onClick={() => void restore(1)}
          />
          <span className="divider" />
          <Action
            icon={FileArrowUp}
            label="Open sheet"
            onClick={() => sheetInput.current?.click()}
            disabled={busy}
            text
          />
          <button
            className="primary download"
            aria-label="Download SVG"
            disabled={busy || !validTextureId(doc.textureId) || !rendered.sheet}
            onClick={() => {
              downloadSheet(rendered.sheet, doc.textureId);
              setNotice(
                `Downloaded ${doc.textureId}.svg. Save this file to continue editing later.`,
              );
            }}
          >
            <DownloadSimple size={18} />
            <span>Download SVG</span>
          </button>
        </div>
      </header>
      <input
        ref={logoInput}
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload a logo"
        type="file"
        accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
        onChange={(event) => void openFile(event, "logo")}
      />
      <input
        ref={sheetInput}
        className="sr-only"
        tabIndex={-1}
        aria-label="Open a saved sheet"
        type="file"
        accept=".svg,image/svg+xml"
        onChange={(event) => void openFile(event, "sheet")}
      />
      <div className="editor-body">
        <nav className="tool-rail" aria-label="Drawing tools">
          {tools.map((tool) => (
            <button
              key={tool.id}
              disabled={busy}
              className={view.tool === tool.id ? "tool active" : "tool"}
              aria-pressed={view.tool === tool.id}
              aria-label={`${tool.name} (${tool.key})`}
              title={`${tool.name} (${tool.key})`}
              onClick={() => {
                engine.current?.setTool(tool.id);
                engine.current?.focus();
              }}
            >
              <tool.icon
                size={23}
                weight={view.tool === tool.id ? "fill" : "regular"}
              />
              <span>{tool.name}</span>
            </button>
          ))}
          <div className="rail-divider" />
          <button
            className="tool"
            disabled={busy}
            onClick={() => logoInput.current?.click()}
          >
            <Image size={24} />
            <span>Import logo</span>
          </button>
          <button
            className="tool mobile-properties"
            onClick={() => setMobileProperties(true)}
          >
            <SlidersHorizontal size={23} />
            <span>Properties</span>
          </button>
        </nav>
        <section className="canvas-area" aria-label="Artwork workspace">
          <nav className="panel-tabs" aria-label="Panel focus">
            <TemplatePicker
              value={doc.design.template}
              disabled={busy}
              onChange={(template) => void changeTemplate(template)}
            />
            <span className="panel-type-divider" aria-hidden />
            {[
              ["all", "Whole sheet"],
              ...Object.keys(definition.panels).map((id) => [
                id,
                panelLabel(id),
              ]),
            ].map(([id, label]) => (
              <button
                key={id}
                className={view.panel === id ? "panel-tab active" : "panel-tab"}
                aria-pressed={view.panel === id}
                onClick={() => engine.current?.setPanel(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="canvas-wrap">
            <div className="canvas-host" ref={host} />
            {view.layers.length === 0 && !view.drawing && (
              <div className="empty-canvas">
                <p>Make it yours.</p>
                <span>Import your logo or draw on the sheet.</span>
                <button
                  onClick={() => logoInput.current?.click()}
                  disabled={busy}
                >
                  <Plus size={16} /> Add your logo
                </button>
              </div>
            )}
            {view.drawing && view.tool === "pen" && (
              <div className="drawing-actions">
                <button onClick={() => engine.current?.finishPath()}>
                  Finish path
                </button>
                <button onClick={() => engine.current?.finishPath(true)}>
                  Close path
                </button>
                <Action
                  icon={X}
                  label="Cancel path"
                  onClick={() => engine.current?.cancelDrawing()}
                />
              </div>
            )}
            {busy && (
              <div className="busy-overlay" role="status">
                Opening your file…
              </div>
            )}
          </div>
        </section>
        {mobileProperties && (
          <button
            className="drawer-backdrop"
            aria-label="Dismiss properties"
            onClick={() => setMobileProperties(false)}
          />
        )}
        <aside
          className={`inspector ${mobileProperties ? "open" : ""}`}
          id="properties"
          tabIndex={-1}
          aria-label="Properties"
        >
          <div className="inspector-heading">
            <h1>{hasSelection ? "Object properties" : "Sheet settings"}</h1>
            <Action
              icon={SlidersHorizontal}
              label="Sheet settings"
              onClick={() => setSheetSettings(!sheetSettings)}
            />
            <Action
              icon={X}
              label="Close properties"
              onClick={() => setMobileProperties(false)}
              className="mobile-close"
            />
          </div>
          {hasSelection ? (
            <>
              <div className="selected-object">
                <ObjectIcon kind={selected.kind} />
                <div>
                  <input
                    aria-label="Object name"
                    readOnly={selected.count > 1}
                    maxLength={80}
                    value={selected.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                  <span>
                    {selected.count > 1
                      ? `${selected.count} objects selected`
                      : `${selected.kind === "group" ? "Vector group" : selected.kind === "image" ? "Embedded image" : "Vector shape"} · editable artwork`}
                  </span>
                </div>
              </div>
              <PropertySection title="Transform">
                <div className="property-grid">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={
                        { x: "X", y: "Y", width: "Width", height: "Height" }[
                          key
                        ]
                      }
                      value={selected[key]}
                      min={
                        key === "width" || key === "height" ? 0.01 : undefined
                      }
                      onChange={(value) => update(key, value)}
                    />
                  ))}
                  <NumberField
                    label="Rotation"
                    value={selected.angle}
                    onChange={(value) => update("angle", value)}
                  />
                  <button
                    className={`link-dimensions ${aspect ? "active" : ""}`}
                    aria-label="Lock aspect ratio"
                    aria-pressed={aspect}
                    onClick={() => setAspect(!aspect)}
                  >
                    {aspect ? <Link size={18} /> : <LinkBreak size={18} />}
                    <span>{aspect ? "Linked" : "Free"}</span>
                  </button>
                </div>
              </PropertySection>
              <PropertySection title="Appearance">
                <div className="paint-grid">
                  {selected.kind !== "image" && (
                    <>
                      <PaintField
                        label="Fill"
                        value={selected.fill}
                        optional
                        onChange={(value) => update("fill", value)}
                      />
                      <PaintField
                        label="Stroke"
                        value={selected.stroke}
                        optional
                        onChange={(value) => update("stroke", value)}
                      />
                      <NumberField
                        label="Stroke width"
                        value={selected.strokeWidth}
                        min={0}
                        onChange={(value) => update("strokeWidth", value)}
                      />
                    </>
                  )}
                  <NumberField
                    label="Opacity %"
                    value={Math.round(selected.opacity * 100)}
                    min={0}
                    max={100}
                    onChange={(value) => update("opacity", value / 100)}
                  />
                </div>
              </PropertySection>
              <div className="object-actions">
                <Action
                  icon={Copy}
                  label="Duplicate"
                  onClick={() => act(() => engine.current?.duplicate())}
                />
                <Action
                  icon={ArrowUp}
                  label="Bring forward"
                  onClick={() => engine.current?.order(1)}
                />
                <Action
                  icon={ArrowDown}
                  label="Send backward"
                  onClick={() => engine.current?.order(-1)}
                />
                <Action
                  icon={Stack}
                  label="Group selection"
                  disabled={selected.count < 2}
                  onClick={() => engine.current?.group()}
                />
                <Action
                  icon={Trash}
                  label="Delete selection"
                  onClick={() => engine.current?.deleteSelection()}
                />
                <span className="divider" />
                <Action
                  icon={AlignLeft}
                  label="Align left"
                  onClick={() => engine.current?.align("left")}
                />
                <Action
                  icon={AlignCenterHorizontal}
                  label="Align centre"
                  onClick={() => engine.current?.align("center")}
                />
                <Action
                  icon={AlignRight}
                  label="Align right"
                  onClick={() => engine.current?.align("right")}
                />
              </div>
              {selected.kind === "group" && (
                <button
                  className="subtle-button"
                  onClick={() => engine.current?.ungroup()}
                >
                  Ungroup to edit individual shapes
                </button>
              )}
              {["rect", "ellipse"].includes(selected.kind) && (
                <button
                  className="subtle-button"
                  onClick={() => engine.current?.convertToPath()}
                >
                  Convert to editable path
                </button>
              )}
              {selected.nodes && (
                <PropertySection title="Path points">
                  <label className="field">
                    Selected point
                    <select
                      aria-label="Selected point"
                      value={Math.min(nodeIndex, selected.nodes.length - 1)}
                      onChange={(event) =>
                        setNodeIndex(Number(event.target.value))
                      }
                    >
                      {selected.nodes.map((command, index) => (
                        <option key={index} value={index}>
                          {command[0] === "Z"
                            ? "Close path"
                            : `Point ${index + 1} · ${command[0] === "C" || command[0] === "Q" ? "curve" : "corner"}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="property-grid">
                    {pathNode?.slice(1).map((value, index) => (
                      <NumberField
                        key={`${nodeIndex}-${index}`}
                        label={`${index >= pathNode.length - 3 ? "Anchor" : `Handle ${Math.floor(index / 2) + 1}`} ${index % 2 ? "Y" : "X"}`}
                        value={Number(value)}
                        onChange={(value) =>
                          engine.current?.editNode(nodeIndex, index, value)
                        }
                      />
                    ))}
                  </div>
                  <div className="point-actions">
                    <button
                      disabled={nodeIndex === 0 || pathNode?.[0] === "M"}
                      onClick={() => engine.current?.insertNode(nodeIndex)}
                    >
                      Add point
                    </button>
                    <button
                      disabled={nodeIndex === 0 || pathNode?.[0] === "Z"}
                      onClick={() => engine.current?.curveNode(nodeIndex, true)}
                    >
                      Curve
                    </button>
                    <button
                      disabled={nodeIndex === 0 || pathNode?.[0] === "Z"}
                      onClick={() =>
                        engine.current?.curveNode(nodeIndex, false)
                      }
                    >
                      Corner
                    </button>
                    <button
                      disabled={nodeIndex === 0 || selected.nodes.length < 3}
                      onClick={() => {
                        engine.current?.removeNode(nodeIndex);
                        setNodeIndex(Math.max(0, nodeIndex - 1));
                      }}
                    >
                      Remove point
                    </button>
                  </div>
                  <p className="hint">
                    Use Edit points (N) to drag anchors and curve handles on the
                    canvas.
                  </p>
                </PropertySection>
              )}
            </>
          ) : (
            <>
              <div className="sheet-summary">
                <Square size={24} />
                <div>
                  <strong>{definition.name}</strong>
                  <span>Editable artwork sheet</span>
                </div>
              </div>
              <PropertySection title="Sheet appearance">
                <div className="paint-grid">
                  <PaintField
                    label="Background"
                    value={doc.design.colors.background}
                    onChange={(value) =>
                      changeBase({
                        colors: { ...doc.design.colors, background: value },
                      })
                    }
                  />
                  <PaintField
                    label="Accent"
                    value={doc.design.colors.accent}
                    onChange={(value) =>
                      changeBase({
                        colors: { ...doc.design.colors, accent: value },
                      })
                    }
                  />
                  {definition.unprintedBack && (
                    <PaintField
                      label="Gate back"
                      value={doc.design.colors.back ?? "#ffffff"}
                      onChange={(value) =>
                        changeBase({
                          colors: { ...doc.design.colors, back: value },
                        })
                      }
                    />
                  )}
                </div>
                <label className="field">
                  Accent style
                  <select
                    value={doc.design.accent}
                    onChange={(event) =>
                      changeBase({ accent: event.target.value as AccentStyle })
                    }
                  >
                    {accentStyles(definition).map((style) => (
                      <option key={style} value={style}>
                        {
                          {
                            none: "None",
                            frame: "Opening frame",
                            band: "Bottom band",
                          }[style]
                        }
                      </option>
                    ))}
                  </select>
                </label>
              </PropertySection>
              <PropertySection title="Logo placement">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={allPanels}
                    onChange={(event) => setAllPanels(event.target.checked)}
                  />
                  Add imported logos to every panel
                </label>
                <p className="hint">
                  Logos follow each panel’s reading direction. Every copy can be
                  moved and edited independently.
                </p>
                <button
                  className="subtle-button"
                  disabled={busy}
                  onClick={() => logoInput.current?.click()}
                >
                  <Image size={17} /> Import SVG, PNG or JPEG
                </button>
              </PropertySection>
              <PropertySection title="Save your artwork">
                <label className="field mobile-sheet-name">
                  Sheet name
                  <input
                    maxLength={80}
                    value={doc.design.name ?? ""}
                    onChange={(event) =>
                      changeBase({ name: event.target.value || undefined })
                    }
                  />
                </label>
                <label className="field">
                  Texture ID
                  <input
                    value={doc.textureId}
                    aria-invalid={!validTextureId(doc.textureId)}
                    spellCheck={false}
                    onChange={(event) =>
                      commit({ ...doc, textureId: event.target.value })
                    }
                  />
                </label>
                <p
                  className={
                    validTextureId(doc.textureId) ? "hint" : "field-error"
                  }
                >
                  Use lowercase letters, digits and single hyphens.
                </p>
                <p className="hint">
                  Download your SVG before leaving. Open it here later to keep
                  editing.
                </p>
              </PropertySection>
            </>
          )}
          <PropertySection title="Layers">
            <div className="layers">
              {view.layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`layer ${selected?.id === layer.id ? "selected" : ""} ${!layer.visible ? "hidden-layer" : ""}`}
                >
                  <ObjectIcon kind={layer.kind} />
                  <button
                    className="layer-name"
                    onClick={(event) => {
                      engine.current?.select(layer.id, event.shiftKey);
                      setSheetSettings(false);
                    }}
                    disabled={layer.locked || !layer.visible}
                  >
                    {layer.name}
                  </button>
                  <Action
                    icon={layer.visible ? Eye : EyeSlash}
                    label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                    onClick={() =>
                      engine.current?.setLayer(
                        layer.id,
                        "visible",
                        !layer.visible,
                      )
                    }
                  />
                  <Action
                    icon={layer.locked ? Lock : LockOpen}
                    label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
                    onClick={() =>
                      engine.current?.setLayer(
                        layer.id,
                        "locked",
                        !layer.locked,
                      )
                    }
                  />
                </div>
              ))}
              <button
                className="template-layer"
                onClick={() => setSheetSettings(true)}
              >
                <Square size={18} />
                <span>Sheet background</span>
                <Lock size={14} />
              </button>
            </div>
            <p className="hint layer-hint">
              Shift-click layers to select more than one.
            </p>
          </PropertySection>
          {(error || rendered.error) && (
            <p className="error" role="alert">
              {error || rendered.error}
            </p>
          )}
          {warnings.length > 0 && (
            <div className="warnings">
              <strong>Check before downloading</strong>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="local-note">Your files stay in your browser.</p>
        </aside>
      </div>
      <footer className="status-bar">
        <div className="zoom-controls">
          <Action
            icon={Minus}
            label="Zoom out"
            onClick={() => engine.current?.zoom(0.8)}
          />
          <output aria-label="Zoom">{view.zoom}%</output>
          <Action
            icon={Plus}
            label="Zoom in"
            onClick={() => engine.current?.zoom(1.25)}
          />
          <Action
            icon={ArrowsOut}
            label="Fit sheet"
            onClick={() => engine.current?.fit()}
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={view.guides}
            onChange={(event) =>
              engine.current?.setGuides(event.target.checked)
            }
          />
          Guides
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={view.snap}
            onChange={(event) => engine.current?.setSnap(event.target.checked)}
          />
          Snap
        </label>
        <p className="status" role="status">
          {view.tool !== "select"
            ? hints[view.tool]
            : notice || hints[view.tool]}
        </p>
        <Action
          icon={Question}
          label="Keyboard shortcuts"
          onClick={() => setHelp(true)}
        />
      </footer>
      <p id="canvas-help" className="sr-only">
        Choose a drawing tool with V, N, P, B, R, E or H. Arrow keys move the
        selection or drawing cursor. For rectangles and ellipses, Enter starts
        drawing and Enter finishes. For the pen, Enter adds a point and Control
        or Command Enter finishes. Escape cancels. Delete removes selected
        objects.
      </p>
      {help && (
        <dialog
          ref={shortcutDialog}
          className="shortcut-dialog"
          onCancel={() => setHelp(false)}
          aria-labelledby="shortcuts-title"
        >
          <div>
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <Action icon={X} label="Close shortcuts" onClick={closeHelp} />
          </div>
          <dl>
            {tools.map((tool) => (
              <div key={tool.id}>
                <dt>{tool.name}</dt>
                <dd>
                  <kbd>{tool.key}</kbd>
                </dd>
              </div>
            ))}
            <div>
              <dt>Undo / redo</dt>
              <dd>⌘ / Ctrl + Z / Shift + Z</dd>
            </div>
            <div>
              <dt>Duplicate</dt>
              <dd>⌘ / Ctrl + D</dd>
            </div>
            <div>
              <dt>Group / ungroup</dt>
              <dd>⌘ / Ctrl + Shift + G</dd>
            </div>
            <div>
              <dt>Move / move faster</dt>
              <dd>Arrows / Shift + arrows</dd>
            </div>
            <div>
              <dt>Draw with the keyboard</dt>
              <dd>Arrows, Enter, ⌘ / Ctrl + Enter</dd>
            </div>
          </dl>
          <button className="primary" autoFocus onClick={closeHelp}>
            Back to designing
          </button>
        </dialog>
      )}
    </div>
  );
}
function Action({
  icon: IconComponent,
  label,
  onClick,
  disabled,
  text,
  className = "",
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  text?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${text ? "with-text" : ""} ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <IconComponent size={18} />
      {text && <span>{label}</span>}
    </button>
  );
}
function ObjectIcon({ kind }: { kind: string }) {
  const Component =
    kind === "group"
      ? Stack
      : kind === "image"
        ? Image
        : kind === "ellipse"
          ? Circle
          : kind === "path"
            ? PenNib
            : Square;
  return <Component size={20} className="object-icon" aria-hidden />;
}
function PropertySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="property-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        step="any"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (
            event.target.value &&
            Number.isFinite(next) &&
            (min === undefined || next >= min) &&
            (max === undefined || next <= max)
          )
            onChange(next);
        }}
      />
    </label>
  );
}
function PaintField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <span className="paint-field">
        <input
          type="color"
          aria-label={label}
          value={value === "none" || value === "mixed" ? "#ffffff" : value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span>
          {value === "none"
            ? "None"
            : value === "mixed"
              ? "Mixed"
              : value.toUpperCase()}
        </span>
        {optional && (
          <button
            type="button"
            aria-label={`No ${label.toLowerCase()}`}
            onClick={(event) => {
              event.preventDefault();
              onChange("none");
            }}
          >
            <X size={12} />
          </button>
        )}
      </span>
    </label>
  );
}
