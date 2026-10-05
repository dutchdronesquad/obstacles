// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import type {
  TrackDrawViewerHandle,
  TrackDrawViewerOptions,
} from "@trackdraw/viewer";
import {
  renderDesign,
  renderCamera,
  renderTargets,
} from "../../../templates/render-targets.ts";

interface Props {
  template: string;
  backColor?: string;
  panels?: Record<string, Blob>;
  updating: boolean;
  error?: string;
  onUnavailable(reason: string): void;
}
export function LivePreview({
  template,
  backColor,
  panels,
  updating,
  error,
  onUnavailable,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<TrackDrawViewerHandle | undefined>(undefined);
  const create = useRef<
    typeof import("@trackdraw/viewer").createTrackDrawViewer | undefined
  >(undefined);
  const latest = useRef<TrackDrawViewerOptions | undefined>(undefined);
  const [aspect, setAspect] = useState(3);
  const camera = useMemo(
    () => renderCamera(template, aspect),
    [template, aspect],
  );
  const supported = useRef(false);
  const fallback = useRef(onUnavailable);
  fallback.current = onUnavailable;
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState("");
  const [reset, setReset] = useState(0);
  // Retire old object URLs after allowing in-flight image loads to finish.
  const urls = useRef(new Set<string>());
  const retirements = useRef(new Set<ReturnType<typeof setTimeout>>());
  const currentTextures = useRef(new Map<string, string>());
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0)
        setAspect(entry.contentRect.width / entry.contentRect.height);
    });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!panels) {
      latest.current = undefined;
      return;
    }
    const textures = new Map<string, string>();
    for (const [panel, file] of Object.entries(renderTargets[template].files)) {
      const url = URL.createObjectURL(panels[panel]);
      urls.current.add(url);
      textures.set(file, url);
    }
    const old = [...currentTextures.current.values()];
    if (old.length) {
      const timer = setTimeout(() => {
        old.forEach((url) => {
          URL.revokeObjectURL(url);
          urls.current.delete(url);
        });
        retirements.current.delete(timer);
      }, 5000);
      retirements.current.add(timer);
    }
    currentTextures.current = textures;
  }, [panels, template]);
  useEffect(() => {
    if (!panels) {
      latest.current = undefined;
      return;
    }
    const textures = currentTextures.current;
    latest.current = {
      design: renderDesign(template),
      camera3D: camera,
      gateBackColors: backColor
        ? Object.fromEntries(
            renderDesign(template).shapes.map((shape) => [shape.id, backColor]),
          )
        : undefined,
      initialView: "3d",
      showViewControls: false,
      show3DAxes: false,
      theme: "light",
      showObstacleNumbers: false,
      assetResolver: (asset) => {
        const texture = textures.get(asset.split("/").pop()!);
        if (!texture)
          throw new Error("The preview requested an unknown panel.");
        return texture;
      },
      onViewStateChange: (state) => {
        if (state.available3D) supported.current = true;
        else if (supported.current)
          setUnavailable(
            "3D needs WebGL. You can keep designing and downloading in 2D.",
          );
      },
    };
    if (ready) {
      if (viewer.current) viewer.current.update(latest.current);
      else if (create.current)
        viewer.current = create.current(host.current!, latest.current);
    }
  }, [panels, template, backColor, camera, ready]);
  useEffect(() => {
    supported.current = false;
    setUnavailable("");
    let cancelled = false;
    void Promise.all([
      import("@trackdraw/viewer"),
      import("@trackdraw/viewer/static/trackdraw-viewer.css"),
    ])
      .then(([module]) => {
        if (cancelled) return;
        if (module.detectWebglSupport() !== "supported") {
          setUnavailable(
            "3D needs WebGL. You can keep designing and downloading in 2D.",
          );
          return;
        }
        create.current = module.createTrackDrawViewer;
        if (latest.current)
          viewer.current = module.createTrackDrawViewer(
            host.current!,
            latest.current,
          );
        setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setUnavailable(
            "3D could not load. You can keep designing and downloading in 2D.",
          );
      });
    return () => {
      cancelled = true;
      viewer.current?.destroy();
      viewer.current = undefined;
      setReady(false);
    };
  }, [reset, template]);
  useEffect(
    () => () => {
      retirements.current.forEach(clearTimeout);
      // Retired URLs also remain owned until their timer fires or the preview closes.
      urls.current.forEach(URL.revokeObjectURL);
      urls.current.clear();
    },
    [],
  );
  useEffect(() => {
    if (unavailable) fallback.current(unavailable);
  }, [unavailable]);
  return (
    <section className="live-preview" aria-label="Live 3D preview">
      <header className="preview-heading">
        <h2>Live 3D preview</h2>
        <span role="status">
          {unavailable
            ? "Unavailable"
            : updating
              ? "Updating…"
              : ready
                ? "Live"
                : "Loading…"}
        </span>
        <button
          aria-label="Reset 3D camera"
          title="Reset 3D camera"
          onClick={() => setReset((value) => value + 1)}
          disabled={!ready || !!unavailable}
        >
          <ArrowClockwise size={16} />
        </button>
      </header>
      <div className="preview-stage">
        <div className="preview-viewer" ref={host} hidden={!!unavailable} />
        {(unavailable || error || !panels) && (
          <p className="preview-message">
            {unavailable || error || "Preparing your panels…"}
          </p>
        )}
        {!unavailable && (
          <span className="preview-controls">
            Drag to orbit · Scroll or pinch to zoom
          </span>
        )}
      </div>
      <div className="preview-angles" aria-label="Preview angles">
        {renderTargets[template].views.map(([, label]) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <p className="preview-note">
        Browser rendering may differ slightly. The PR’s CI preview is
        authoritative.
      </p>
    </section>
  );
}
