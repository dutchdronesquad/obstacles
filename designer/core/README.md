# Designer core

Framework-free TypeScript behind the obstacle artwork designer. It turns a design into a template sheet that passes `npm run assets:check`, using the template definitions in [`templates/templates.json`](../../templates/templates.json). It has no DOM or file-system dependency, so the designer app and, later, TrackDraw can both use it.

| Module | Purpose |
| --- | --- |
| `model.ts` | Design model, `createDesign`, `validateDesign`, available accent styles |
| `logo.ts` | `prepareLogo` for SVG, PNG and JPEG: size detection, refusing unsafe SVGs, rasterizing SVGs with live text through a supplied `rasterizeSvg` |
| `placement.ts` | Logo placement by each panel's reading direction and safe area; frame and band accents |
| `vector.ts` | Typed free artwork, bounded validation and SVG serialization for paths, shapes, groups and embedded images |
| `render.ts` | `renderSheet` (deterministic SVG with the template's guides) and `parseSheet` to reopen a sheet |

Node.js 24 imports the TypeScript directly, so it is restricted to erasable syntax (`erasableSyntaxOnly`). `npm run typecheck` checks it; `npm test` runs its unit tests and the contract test in `tests/designer-contract.test.mjs`, which passes every sample design through the repository checks.

`Design.artwork` is optional and additive to version 1. Objects use six-number affine transforms in sheet coordinates; group children use their parent's coordinates. Paths store M/L/C/Q/Z commands and their local centre offset. Rendering clips the shared artwork to canonical printable panel contours. Older single-logo sheets remain compatible with the core.
