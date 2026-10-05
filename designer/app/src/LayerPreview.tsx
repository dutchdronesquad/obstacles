// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { memo, useMemo } from "react";
import { renderArtwork, type VectorItem } from "@track-assets/designer-core";

const svgSource = (svg: string) =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

export const LayerPreview = memo(function LayerPreview({
  item,
  width,
  height,
}: {
  item: VectorItem;
  width: number;
  height: number;
}) {
  const source = useMemo(() => {
    const padding = Math.max(
      1,
      item.style.strokeWidth,
      Math.max(width, height) * 0.04,
    );
    const artwork: VectorItem = {
      ...item,
      visible: true,
      transform: [1, 0, 0, 1, 0, 0],
    };
    return svgSource(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-width / 2 - padding} ${-height / 2 - padding} ${width + padding * 2} ${height + padding * 2}">${renderArtwork([artwork])}</svg>`,
    );
  }, [item, width, height]);
  return (
    <span className="layer-preview">
      <img src={source} alt="" />
    </span>
  );
});
