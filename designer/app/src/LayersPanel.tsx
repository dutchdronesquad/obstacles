// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useMemo } from "react";
import {
  Eye,
  EyeSlash,
  Lock,
  LockOpen,
  Copy,
  ArrowUp,
  ArrowDown,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import { type Design } from "@track-assets/designer-core";
import type { CanvasEditor, EditorView } from "./editor/canvas-editor.ts";
import { LayerMenu } from "./LayerMenu.tsx";
import { LayerPreview } from "./LayerPreview.tsx";

export function LayersPanel({
  view,
  design,
  editor,
  busy,
  onArtworkSelection,
  onError,
}: {
  view: EditorView;
  design: Design;
  editor: CanvasEditor | undefined;
  busy: boolean;
  onArtworkSelection: () => void;
  onError: (error: unknown) => void;
}) {
  const artworkById = useMemo(
    () => new Map(design.artwork?.map((item) => [item.id, item])),
    [design.artwork],
  );
  const act = (action: () => void | Promise<void>) => {
    void Promise.resolve().then(action).catch(onError);
  };
  return (
    <section className="property-section layers-section">
      <h2>Layers</h2>
      <ul className="layers" aria-label="Artwork layers">
        {view.layers.map((layer) => {
          const item = artworkById.get(layer.id);
          return (
            <li
              key={layer.id}
              className={`layer ${layer.selected ? "selected" : ""} ${!layer.visible ? "hidden-layer" : ""}`}
            >
              <LayerControl
                icon={layer.visible ? Eye : EyeSlash}
                label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                disabled={busy}
                onClick={() =>
                  editor?.setLayer(layer.id, "visible", !layer.visible)
                }
              />
              <button
                className="layer-name"
                aria-pressed={layer.selected}
                onClick={(event) => {
                  editor?.select(layer.id, event.shiftKey);
                  onArtworkSelection();
                }}
                disabled={busy || layer.locked || !layer.visible}
              >
                {item && (
                  <LayerPreview
                    item={item}
                    width={layer.width}
                    height={layer.height}
                  />
                )}
                <span>{layer.name}</span>
              </button>
              <LayerControl
                icon={layer.locked ? Lock : LockOpen}
                label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
                disabled={busy}
                onClick={() =>
                  editor?.setLayer(layer.id, "locked", !layer.locked)
                }
              />
              <LayerMenu
                name={layer.name}
                disabled={busy || layer.locked || !layer.visible}
                actions={[
                  {
                    label: "Duplicate",
                    icon: Copy,
                    onSelect: () =>
                      act(() => {
                        editor?.select(layer.id);
                        onArtworkSelection();
                        return editor?.duplicate();
                      }),
                  },
                  {
                    label: "Bring forward",
                    icon: ArrowUp,
                    onSelect: () => {
                      editor?.select(layer.id);
                      onArtworkSelection();
                      editor?.order(1);
                    },
                  },
                  {
                    label: "Send backward",
                    icon: ArrowDown,
                    onSelect: () => {
                      editor?.select(layer.id);
                      onArtworkSelection();
                      editor?.order(-1);
                    },
                  },
                  {
                    label: "Delete",
                    icon: Trash,
                    destructive: true,
                    onSelect: () => {
                      editor?.select(layer.id);
                      editor?.deleteSelection();
                    },
                  },
                ]}
              />
            </li>
          );
        })}
        {view.layers.length === 0 && (
          <li className="layers-empty">
            Import a logo or draw a shape to add your first layer.
          </li>
        )}
      </ul>
      {view.layers.length > 1 && (
        <p className="hint layer-hint">
          Shift-click to select multiple layers.
        </p>
      )}
    </section>
  );
}
function LayerControl({
  icon: IconComponent,
  label,
  onClick,
  disabled,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <IconComponent size={15} aria-hidden />
    </button>
  );
}
