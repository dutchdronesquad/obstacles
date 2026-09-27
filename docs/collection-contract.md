# Texture collection contract, version 1

Collections live under `collections/<organization-slug>/`, each containing `manifest.json`, `README.md`, editable `source/` files and runtime `textures/` files. Shared editable design templates will live under `templates/` (#2). Directory structure is independent of public URLs. Run `npm run assets:check` to validate working files; publication always validates and reads committed HEAD bytes.

## Manifest schema

The executable schema is `validateManifest` and the versioned template slot registry in `scripts/collections.mjs`. Both the MultiGP collection and the DDS example use it. Unknown fields, unsupported versions/templates, missing fields, duplicate texture IDs, invalid paths and missing panel files fail validation with the collection filename. IDs are lowercase alphanumeric segments separated by hyphens. Runtime files use case-sensitive ASCII basenames and `.webp` extensions; paths, URLs and symlinks cannot escape the collection.

Every manifest requires:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exactly `1`. |
| `id` | Stable organization slug, matching its directory. |
| `name` | Human-readable collection name. |
| `status` | `published` or `example`. Examples validate but are excluded from all publication. |
| `author`, `attribution` | Non-empty credits and source/rights-holder information. |
| `usage.terms` | Non-empty human-readable artwork usage terms. This is not the software license. |
| `usage.portable` | `allowed` only with explicit permission recorded in terms; otherwise `not-granted`. This field does not grant rights by itself. |
| `textures` | Non-empty array of texture sets. Each requires unique `id`, `name`, `template` and `panels`. |

A texture identity is the pair `(collection id, texture id)`. Each panel maps to a `textures/<filename>.webp` path in source manifests. Publication converts it to an origin-relative public path such as `/multigp/large-top-multigp.webp`. Consumer manifests have the same fields but public panel paths; do not feed them back into the source validator. Metadata contains no executable code, geometry or arbitrary remote texture URLs.

## Template compatibility and orientation

These template IDs identify existing artwork slots, not universal compatibility with every shape of the same kind. A consumer must explicitly implement the matching template before offering it. Physical dimensions and procedural geometry remain in TrackDraw/viewer. The current gate mappings correspond to the existing standard 5x5 and championship 7x6 panel-frame visuals; this first contract does not advertise ladder, dive-gate or launch-gate compatibility just because they reuse images.

| Template | Required panels | Consumer mapping |
| --- | --- | --- |
| `gate-standard-v1` | `left`, `right`, `top` | Existing standard gate panel-frame mapping; each source texture top edge faces the panel top. |
| `gate-championship-v1` | `left`, `right`, `top` | Existing championship mapping: left top edge faces top; right top edge faces bottom; top faces top. Existing artwork shares the side image. |
| `corner-flag-v1` | `front`, `back` | Existing corner-marker front/back planes; back artwork is already prepared for that plane. No additional consumer image mirroring. |
| `hurdle-v1` | `front` | Existing hurdle banner texture slot, same orientation as the current catalog. |

Source panel names refer to renderer texture slots. Consumers must not infer extra flips from filenames or legacy artwork notes. The DDS diagnostic example marks the image top edge; visual template work and consumer integration must verify actual physical reading directions before enabling DDS in discovery. A different geometry, panel mapping or orientation requires a new template ID/version, not a silent reinterpretation.

## Discovery and publication

`/collections.json` contains `{ "schemaVersion": 1, "collections": [{ "id": "multigp", "name": "MultiGP", "manifest": "/multigp/manifest.json" }] }`. Only published collections appear. Each manifest resolves texture paths against the same asset origin. Consumers must validate received metadata, reject unsupported schema versions, skip unsupported templates, and retain a usable untextured/current rendering fallback if discovery or artwork fails. Existing hardcoded URL consumers need not fetch metadata.

The publisher uploads all runtime WebP files in published collections (including legacy files not referenced by a manifest), then manifests, then the index. Sources and maintenance PNGs remain in Git. JSON uses `application/json`; images use `image/webp`. Both retain public CORS and the existing five-minute cache policy. Verification checks metadata bytes and headers as well as textures. Uploads are individually applied, not atomic: consumers must tolerate transient mismatch or failure and retry. A failed texture upload stops before publishing new metadata.

Moving `multigp/` to `collections/multigp/` leaves every `/multigp/<filename>.webp` URL unchanged. The uploader never deletes bucket objects. Keep historical files and stable IDs in Git; compatible artwork improvements may replace bytes at the same URL. Incompatible mapping or artwork changes require a new identity/filename and retaining the old file. Metadata has a schema version; compatible asset updates do not require an asset release version.

## Rights and acceptance boundary

Public accessibility and this repository's MIT software license do not establish artwork redistribution rights. `portable: not-granted` means a new consumer must not assume permission to bundle artwork for offline redistribution; it must obtain permission or clearly report that the export is unsupported. `allowed` still requires respecting the recorded terms and attribution. These fields document rights, not legal verification by automation.

DDS is intentionally an unpublished diagnostic example for #1. Approved club artwork, reusable editable templates and visual acceptance belong to #2; generalized contribution tooling to #3; selecting and saving collections in TrackDraw to trackdraw#886. No current consumer or production bucket is changed simply by creating these manifests.
