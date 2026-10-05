# Artwork designer app

Local React + TypeScript app built with Vite, Fabric and [`designer/core`](../core/README.md). It uses the repository's shared template definitions and SVG sheets for the standard gate and corner flag.

From the repository root, with Node.js 24:

```sh
npm ci
npm run designer:dev
```

Open the local URL printed by Vite. The canvas supports selection, moving, resizing, rotation, rectangles, ellipses, a pen with Bézier handles and freehand pencil paths. Convert a rectangle or ellipse to a path, then use Edit points to reshape its anchors and handles, or change their coordinates in Properties. Add point splits an existing line or curve without changing its outline; Curve, Corner and Remove point reshape the selected segment. Layer controls hide, lock and reorder objects; Shift-click layers to select several, then group, align or duplicate them. Undo and redo include artwork, colours, template changes and the texture ID.

Import SVG, PNG or JPEG logos up to 5 MB. Logos are placed on every panel by default, following each panel's reading direction and safe area. Disable that option in Sheet settings to import on the focused panel only. Each copy can then be edited independently. Supported SVG geometry becomes editable vector shapes; ungroup imported logos to edit individual paths. SVGs using unsupported features remain embedded images, and SVGs with live text are converted to PNG in the browser. Outline text in the source SVG for sharper, editable vectors. Unsafe logos and invalid sheets report an error without replacing the existing artwork.

The obstacle picker beside the panel tabs shows previews of the actual gate and flag sheets. Panel tabs focus the whole sheet or one panel. Guides show the safe areas; Snap uses a five-unit grid for drawing and moving objects. Free artwork can span panels and is clipped to the printable gate panels or flag contours in both the canvas and export. Sheet settings control background, accent and the unprinted gate back colour. Starting another obstacle creates a fresh sheet; Undo returns to the previous design.

Download `<texture-id>.svg` before leaving. The app has no persistence, uploads or backend. Open that downloaded sheet to restore editable objects, paths, groups and embedded images. Older single-logo designer sheets also reopen, with their placed logos converted into image objects. Saved sheets are limited to 32 MB. Fonts and icons are bundled locally.

Mobile keeps the canvas and tools visible, with Properties opening as a drawer. All controls have accessible names; Keyboard shortcuts lists the tools and common operations. On the canvas, arrows move a selection (Shift moves faster). For keyboard drawing, arrows move the drawing cursor; Enter starts and finishes a rectangle or ellipse, or adds a pen point. Control/Command + Enter finishes a pen path. Escape cancels; Delete removes the selection.

Raster images warn when upscaled at export resolution. Panel-size warnings use PNG estimates rendered in the browser. They are advisory: the repository checks use lossless WebP and may produce different sizes. Complex artwork may need simplifying to pass the 512 KiB limit. Always run `npm run assets:check` after adding a downloaded sheet to a collection.

Validation:

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run designer:test
npm run assets:check
```

The browser suite builds the production app and checks vector transforms, grouping, pointer and keyboard drawing, Bézier edits, undo, mobile controls, safe imports, SVG reopening, live 3D updates, gate back colours and the WebGL fallback. Browser panel pixels are compared with the real CI export, including flag transparency. Downloaded gate and flag sheets go through the real collection checks. `npm run designer:build` writes the static site to `designer/app/dist/`; `npm run preview --workspace designer/app` serves that build locally.

Use the **2D / 3D** switch above the canvas to move between the editable sheet and a full-size preview of front, turned and back angles. Returning to 2D preserves your panel, zoom and artwork selection. Colours and layers remain editable in 3D; drawing tools become available again in 2D. Finish or cancel an in-progress drawing before switching. Drag to orbit and scroll or pinch to zoom; Reset 3D camera returns to the shared preview framing. Returning to 2D releases the viewer. Gate backs use the chosen solid colour, and flag panels retain their transparent outline. Changes are debounced and rasterized asynchronously, with stale generations cancelled. The viewer and its styles load only when 3D opens; all artwork stays in local blob URLs, with no texture requests to the network.

The browser and CI share panel mappings, angles and camera framing. Browser canvas rasterization can differ slightly from CI's librsvg and lossless WebP output. The PR's CI preview comment is authoritative. If WebGL is unavailable or the renderer fails, the workspace returns to 2D with an explanation; the editor, undo and SVG download remain available.

Hosting and the prefilled submission flow are tracked in [#35](https://github.com/dutchdronesquad/track-assets/issues/35).
