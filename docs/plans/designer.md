# Plan: obstacle artwork designer

Status: core implemented; local app implemented in issue #33, including the requested free vector editor. Live 3D preview is implemented in issue #34. Hosting configuration, deployment/preview workflow and the submission shortcut are implemented for #35; production setup and a real GitHub upload-to-bot-PR smoke test remain release acceptance checks.

## Goal

Let any racing organization design artwork for a supported obstacle in the browser, without installing Inkscape or using command-line tools, and submit it through the existing issue flow. The result must pass `npm run assets:check` unchanged.

**Non-goals for the first version:** new obstacle geometry, accounts or server-side storage, editing existing published collections, and private appearances in TrackDraw. A reusable core keeps the last one possible later.

## User flow

1. **Pick an obstacle:** standard gate (`gate-standard-v1`) or corner flag (`corner-flag-v1`).
2. **Add a logo** (SVG or PNG) and **pick colours**: background, accent, and the gate's back colour.
3. **Check placement.** The logo is placed on every panel automatically, rotated by convention and kept inside the safe area. The user can hide it per panel, scale it and move it.
4. **Preview** the 2D sheet or switch to a full-size live 3D view in TrackDraw's viewer: front, turned and back.
5. **Download** the sheet (`standard-gate.svg`, `corner-flag.svg`).
6. **Submit.** A button opens the "Submit obstacle artwork" form with the organization, short name and usage already filled in. The user drags the downloaded files into it, because GitHub cannot prefill attachments.

## Hosting

The designer is a static site on **Cloudflare Workers with static assets**, in the same account and zone as `assets.trackdraw.app` and TrackDraw.

- **Configuration:** `designer/app/wrangler.jsonc` defines a Worker (for example `trackdraw-designer`) with `assets.directory` pointing at the Vite build and `not_found_handling: "single-page-application"`. A route `designer.trackdraw.app` with `custom_domain: true` makes Cloudflare create the proxied DNS record and the certificate automatically. No CNAME or DNS-only exception is needed, unlike GitHub Pages: there, publishing through Actions ignores a `CNAME` file, the record has to bypass Cloudflare's proxy so GitHub can issue a certificate, and `.app` is HSTS-preloaded, so the site stays unreachable until that certificate exists.
- **Deployment:** the `Check assets` workflow builds and tests assets and the designer once without deployment secrets. When designer inputs change, a separate `deploy-designer` job selects the preview or production environment and downloads the checked build. Pushes to `main` run `wrangler deploy`; manual runs on `main` can retry production.
- **Previews:** for pull requests from branches in this repository, `wrangler versions upload` gives a preview URL that the PR can link. Pull requests from forks get no secrets and therefore no preview deployment; their sheets are still checked by CI.
- **Token:** the existing `CLOUDFLARE_API_TOKEN` only has *Workers R2 Storage: Edit*. Deploying needs *Workers Scripts: Edit*, plus *Workers Routes* or *DNS: Edit* on the `trackdraw.app` zone for the custom domain. Prefer a separate token for the designer in its own environment.
- **Headers:** a `_headers` file sets a strict Content Security Policy (no remote scripts; images from `blob:` and `data:` for uploaded logos) and long-lived caching for hashed build files.
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

- **Design model:** plain JSON with the template, colours, embedded images, accent style, per-panel placement for older designs and optional typed free artwork (shapes, paths and nested groups). It is stored inside the exported SVG as `<metadata>`, so a downloaded sheet can be reopened and edited.
- **Placement rules:**
  - Gate: the left post reads bottom → top and the right post top → bottom (rotated −90° and +90°); the top reads left to right.
  - Flag: the front reads bottom → top and the back top → bottom, as in the DDS pilot.
  - The logo is fitted inside each panel's safe area.
- **`renderSheet(design) → string`:** produces a complete sheet. It takes the template's `guides` layer unchanged, generates the `artwork` layer, and sets the `data-template`, `data-name` and `data-back-color` attributes. The output is deterministic.
- **Validation** mirrors `readSheet` and `exportSheet`: no live text, no linked files, embedded images only, and an estimated panel size within the limits.

Being framework-free and DOM-free (apart from the optional rasterizer) keeps the core reusable by TrackDraw for private appearances later.

### App (`designer/app`)

- **Vite + TypeScript + React.** React matches TrackDraw and the viewer, which bundles React anyway.
- **Free artwork:** Fabric handles canvas selection, transforms, grouping, freehand drawing and Bézier controls. Only checked geometry and embedded images enter the framework-free core; engine JSON is not persisted.
- **2D preview:** the rendered sheet with guides visible, plus a toggle to show only what will be exported.
- **3D preview:** `@trackdraw/viewer` with an `assetResolver` that serves panels rasterized in the browser: the sheet is drawn to a canvas per region, just as `exportSheet` does. The render design and camera are shared with `scripts/render3d.mjs` through `templates/render-targets.ts` (three angles). Preview textures and the unprinted gate back colour are supplied locally, and the 2D editor remains usable without WebGL. Browser rasterization can differ slightly from librsvg in CI; CI's preview comment remains the source of truth.
- **Submit:** opens `issues/new?template=submit-collection.yml&organization=…&slug=…&usage=…` (issue forms prefill fields by `id`).

## Logos

- **SVG:** imported geometry becomes editable typed vector objects when supported. SVGs with unsupported paints or clipping remain embedded images. Unsafe SVGs with scripts, event handlers or linked files are refused. Live text is rasterized to PNG; outlining text in the source preserves editable vectors. Raw uploaded markup is never mounted into the page or trusted as saved engine state.
- **PNG/JPEG:** embedded as a data URI. The designer warns when the resolution is too low for the panel size, and when the estimated panel size gets close to 512 KiB.
- Transparent logos are fine on gates: the panel background is part of the artwork, so nothing exports transparent there.

## Scope

**First version (MVP)**

- Both templates that have an editable sheet.
- Multiple logos and free vector artwork, background, accent and back colour.
- Accent styles: none, line around the gate opening, band along the flag's bottom edge.
- Automatic placement, adjustable per panel.
- Interactive 2D canvas, live 3D preview, editable SVG download and a prefilled submit link.
- Reopening a downloaded sheet via its embedded design data.

**Later**

- Text with bundled open fonts, converted to paths with opentype.js.
- Colour presets and saved reusable sponsor arrangements.
- More templates once their renderer mapping allows it. For example, the championship gate currently draws its right post from the left image.
- Starting from an existing collection.
- Using the core in TrackDraw for private appearances.

## Quality and tests

- **Core unit tests (Node.js):** placement, rotations, safe areas and metadata round trips.
- **Contract test in this repository:** for every template and a set of sample designs, `renderSheet` output must pass `withGeneratedTextures` and `checkImages` from `scripts/`. A designer sheet that CI would reject fails the build.
- **Accessibility:** keyboard-operable controls, labels on colour inputs, and text alternatives for the previews.

## Milestones

1. Move template definitions to `templates/templates.json`; scripts and tests use it.
2. Core: design model, placement, `renderSheet`, validation, contract test.
3. App: upload, colours, placement controls, 2D preview, download.
4. 3D preview with the viewer and in-browser rasterization.
5. Cloudflare deployment, custom domain, PR previews, submit link, docs (CONTRIBUTING and the template guide point to the designer).

## Decisions

- **Subdomain and hosting:** `designer.trackdraw.app` on Cloudflare Workers with static assets, not GitHub Pages; see Hosting.
- **UI framework:** React.
- **SVG logos with live text:** rasterized automatically, with a note that paths are sharper.
- **Issue form upload field:** "Template sheets" uses GitHub's dedicated `upload` field with `accept: ".svg"` and `required: true` under `validations`, so the form itself refuses other files. The submission parser accepts both `user-attachments/assets` and `user-attachments/files` links. Milestone 5 requires one real test submission to confirm the complete bot flow.
- **Usage prefill:** a live check of GitHub's form confirmed that dropdown query parameters are ignored. The designer keeps its two-choice dropdown; GitHub's Usage field is a text input so its value can be prefilled. The bot validates the same exact choices and rejects unknown values. Direct form users start with the narrower `In TrackDraw only` value.
- **Repository layout:** npm workspaces at the root (`designer/core`, `designer/app`). The core is TypeScript limited to erasable syntax (`erasableSyntaxOnly`), so Node 24, already required by this repository, imports it directly: the contract test in `tests/` runs `renderSheet` against the existing scripts with `node --test`, with no build step. The app has its own Vite build and deploys separately.
