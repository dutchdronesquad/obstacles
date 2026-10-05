# Plan: obstacle artwork designer

Status: draft for discussion.

## Goal

Let any racing organization design artwork for a supported obstacle in the browser, without Inkscape, layers, fonts or command-line tools, and submit it through the existing issue flow. The result must pass `npm run assets:check` unchanged.

**Non-goals for the first version:** new obstacle geometry, accounts or server-side storage, editing existing published collections, free-form vector drawing, and private appearances in TrackDraw. A reusable core keeps the last one possible later.

## User flow

1. **Pick an obstacle:** standard gate (`gate-standard-v1`) or corner flag (`corner-flag-v1`).
2. **Add a logo** (SVG or PNG) and **pick colours**: background, accent, and the gate's back colour.
3. **Check placement.** The logo is placed on every panel automatically, rotated by convention and kept inside the safe area. The user can hide it per panel, scale it and move it.
4. **Preview** the 2D sheet next to a live 3D view in TrackDraw's viewer: front, turned and back.
5. **Download** the sheet (`standard-gate.svg`, `corner-flag.svg`).
6. **Submit.** A button opens the "Submit obstacle artwork" form with the organization, short name and usage already filled in. The user drags the downloaded files into it, because GitHub cannot prefill attachments.

## Hosting

- **Static site on GitHub Pages** from this repository, deployed by a workflow with `actions/deploy-pages` on pushes to `main` that touch the designer.
- **Custom subdomain:** proposal `designer.trackdraw.app`. A CNAME to `dutchdronesquad.github.io` in Cloudflare, DNS only (not proxied), so GitHub can issue the TLS certificate. Verify the domain for the organization under GitHub's *Pages → Verified domains* to prevent takeover.
- Everything runs in the browser: no uploads, no backend, no tracking.

## Architecture

```text
templates/templates.json     single source for sheet sizes, panel regions, scales, safe areas and back colours
designer/core/               framework-free TypeScript: design model, placement rules, sheet rendering, validation
designer/app/                the page: UI, 2D and 3D preview, download and submit
scripts/                     existing tooling, which reads templates/templates.json instead of its own constants
```

### Shared template definition

`templateSheets` in `scripts/templates.mjs` and `panelImages` in `scripts/collections.mjs` move into `templates/templates.json`, extended with safe areas and default colours. The scripts, the tests and the designer then share one definition, so the designer can never drift from what CI accepts.

### Core (`designer/core`)

- **Design model:** plain JSON with the template, colours, logo (embedded data), accent style and per-panel placement (visible, scale, offset). It is stored inside the exported SVG as `<metadata>`, so a downloaded sheet can be reopened and edited.
- **Placement rules:**
  - Gate: the left post reads bottom → top and the right post top → bottom (rotated −90° and +90°); the top reads left to right.
  - Flag: the front reads bottom → top and the back top → bottom, as in the DDS pilot.
  - The logo is fitted inside each panel's safe area.
- **`renderSheet(design) → string`:** produces a complete sheet. It takes the template's `guides` layer unchanged, generates the `artwork` layer, and sets the `data-template`, `data-name` and `data-back-color` attributes. The output is deterministic.
- **Validation** mirrors `readSheet` and `exportSheet`: no live text, no linked files, embedded images only, and an estimated panel size within the limits.

Being framework-free and DOM-free (apart from the optional rasterizer) keeps the core reusable by TrackDraw for private appearances later.

### App (`designer/app`)

- **Vite + TypeScript.** For the UI, React matches TrackDraw and the viewer; the open question below covers this.
- **2D preview:** the rendered sheet with guides visible, plus a toggle to show only what will be exported.
- **3D preview:** `@trackdraw/viewer` with an `assetResolver` that serves panels rasterized in the browser: the sheet is drawn to a canvas per region, just as `exportSheet` does. The render design is the same as `scripts/render3d.mjs` (three angles). Browser rasterization can differ slightly from librsvg in CI; CI's preview comment remains the source of truth.
- **Submit:** opens `issues/new?template=submit-collection.yml&organization=…&slug=…&usage=…` (issue forms prefill fields by `id`).

## Logos

- **SVG:** sanitized before use (DOMPurify, SVG profile). Scripts, event handlers, external references and `<foreignObject>` are removed. A logo with live `<text>` is refused with an explanation, or offered as a rasterized PNG as a fallback, because CI rejects live text.
- **PNG/JPEG:** embedded as a data URI. The designer warns when the resolution is too low for the panel size, and when the estimated panel size gets close to 512 KiB.
- Transparent logos are fine on gates: the panel background is part of the artwork, so nothing exports transparent there.

## Scope

**First version (MVP)**

- Both templates that have an editable sheet.
- One logo, background, accent and back colour.
- Accent styles: none, line around the gate opening, band along the flag's bottom edge.
- Automatic placement, adjustable per panel.
- 2D and 3D preview, download, prefilled submit link.
- Reopening a downloaded sheet via its embedded design data.

**Later**

- Text with bundled open fonts, converted to paths with opentype.js.
- Several logos or sponsor areas, and colour presets.
- More templates once their renderer mapping allows it. For example, the championship gate currently draws its right post from the left image.
- Starting from an existing collection.
- Using the core in TrackDraw for private appearances.

## Quality and tests

- **Core unit tests (Vitest):** placement, rotations, safe areas and metadata round trips.
- **Contract test in this repository:** for every template and a set of sample designs, `renderSheet` output must pass `withGeneratedTextures` and `checkImages` from `scripts/`. A designer sheet that CI would reject fails the build.
- **Accessibility:** keyboard-operable controls, labels on colour inputs, and text alternatives for the previews.

## Milestones

1. Move template definitions to `templates/templates.json`; scripts and tests use it.
2. Core: design model, placement, `renderSheet`, validation, contract test.
3. App: upload, colours, placement controls, 2D preview, download.
4. 3D preview with the viewer and in-browser rasterization.
5. Pages deployment, subdomain, submit link, docs (CONTRIBUTING and the template guide point to the designer).

## Open questions

1. **Subdomain:** `designer.trackdraw.app`, or something without the product name, such as `design.dutchdronesquad…`?
2. **UI framework:** React (consistent with TrackDraw and the viewer, which bundles React anyway) or something lighter, such as Preact or plain TypeScript?
3. **SVG logos with text:** refuse them, or rasterize them automatically?
4. **Issue form upload field:** switch "Template sheets" from a textarea to GitHub's dedicated `upload` field type. Check first which URLs it produces for the submission parser.
5. **Repository layout:** `designer/` with its own `package.json`, or npm workspaces at the root?
