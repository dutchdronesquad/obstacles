# Texture templates

Editable SVG sheets for designing your organization's artwork on obstacles TrackDraw already renders. You draw on a sheet; the panels a [collection](../docs/collection-contract.md) needs are generated from it. No Blender, 3D model or renderer change is needed.

The easiest route is the [browser artwork designer](https://designer.trackdraw.app): choose an obstacle, add logos and colours, draw vector artwork and check its live 3D preview. **Submit artwork** downloads your editable SVG and opens a GitHub form with your organization and usage filled in. Attach the sheet there to submit it for review. The manual template workflow below remains available for other SVG editors.

These are rendering templates: they match the surfaces TrackDraw draws, not a certified manufacturing pattern. Physical banners, seams, eyelets and print bleed may differ; check with your printer before ordering real panels.

| Template | Sheet | Panels | Exported size per panel | Transparency | Reference |
| --- | --- | --- | --- | --- | --- |
| `gate-standard-v1` | [gate-standard-v1.svg](gate-standard-v1.svg) | `left`, `right`, `top` | sides 300 × 1500 px (1 × 5 ft), top 2100 × 300 px (7 × 1 ft) | none; transparent areas become the default white sides and navy top | [image](reference/gate-standard-v1.webp) |
| `gate-championship-v1` | [gate-championship-v1.svg](gate-championship-v1.svg) | `left`, `right`, `top` | sides 450 × 1800 px (1.5 × 6 ft), top 3000 × 600 px (10 × 2 ft) | none; default white sides and navy top | [MultiGP specification](https://www.multigp.com/multigp-drone-race-course-obstacles/) |
| `corner-flag-v1` | [corner-flag-v1.svg](corner-flag-v1.svg) | `front`, `back` | 400 × 2044 px each | required outside the flag outline | [image](reference/corner-flag-v1.webp) |

The template ID in each sheet's `data-template` attribute is the `template` value in the manifest. [`templates.json`](templates.json) defines every template once: its panels and their regions, default colours, transparency, safe areas and reading direction. The scripts and tests read it, so a template is changed in one place. The `hurdle-v1` contract does not have an editable sheet yet.

## Sheet layout

Every sheet has two layers:

- **Artwork** (`id="artwork"`): everything that should end up on the obstacle. It starts with the default panel colours.
- **Guides** (`id="guides"`): panel outlines, safe areas, labels and arrows. It is locked and is never exported, even when visible.

### `gate-standard-v1`

The sheet is the front view of the 5 × 5 ft standard gate at 100 units per foot (700 × 600). Draw it exactly as someone facing the printed side sees it:

- The `left` slot is the post on your left and `right` is the post on your right. Each exported panel is exactly its region on the sheet, with no extra rotation or mirroring.
- Rotate the artwork, not the sheet. Following the existing MultiGP convention, side text should read bottom → top on the left post and top → bottom on the right post (the pink arrows).
- Keep important content inside the dashed safe area: the frame tube covers the outer edges.
- Only the front is printed. Add `data-back-color` to the sheet (step 3 below) to give the back one solid colour that matches the artwork; without it the back keeps the default white sides and navy top.
- The opening in the middle is not exported.

### `gate-championship-v1`

The Championship sheet uses the existing catalog's 1.5 × 6 ft side panels and 10 × 2 ft top panel at 100 units per foot (1000 × 800), surrounding a 7 × 6 ft opening. These proportions match the TrackDraw and Viewer Championship geometry; this is not a stretched standard-gate sheet. MultiGP confirms the [7 × 6 ft opening](https://shop.multigp.com/product/champ-size-multigp-gate-7x6/); printable regions here are rendering surfaces, with physical manufacturing details to be agreed with the printer.

The same front-view convention applies: left reads bottom → top, right top → bottom, with independent panel artwork and no export rotation or mirroring. The dashed safe areas keep important artwork away from the frame tube: 0.12 ft on the outer side edges and top edge, 0.08 ft on the inner/bottom side edges, and 0.12 ft on the top panel's ends. They are conservative rendering guides, not manufacturer bleed or seam specifications. The unprinted back uses one solid colour.

Club Championship artwork requires schema/viewer 1.0.4 or newer. Existing MultiGP artwork and its Race Timing normal/red variants remain the fallback.

### `corner-flag-v1`

The sheet holds two flag sides next to each other. Each side is drawn as a viewer standing on that side sees it, so text reads normally on both sides:

- `front`: the pole runs along the left edge and curves over the top.
- `back`: the outline is mirrored, so the pole runs along the right edge. Do not mirror the artwork itself.
- Everything outside the outline must stay transparent. The default artwork is clipped to the outline; keep new artwork inside those clip groups.

## From blank template to texture set

The DDS standard gate in [`collections/dds`](../collections/dds/README.md) was made this way.

1. **Copy the template.** Copy for example `templates/gate-standard-v1.svg` to `collections/<organization-slug>/source/<texture-id>.svg`. The file name is the texture ID, so use lowercase letters, digits and hyphens (`standard-gate.svg`). Never edit the shared template for one organization.
2. **Edit the artwork.** Use [Inkscape](https://inkscape.org/) (free) or another SVG editor that keeps the `artwork` and `guides` group IDs and the page size. Draw only on the Artwork layer.
   - Convert text to paths (Inkscape: *Path → Object to Path*). Live text is rejected because fonts differ between computers.
   - Embed images instead of linking them (Inkscape: *File → Import → Embed*). Prefer vector logos for sharp edges.
   - Save as SVG. Inkscape SVG is fine.
3. **Optionally name it and colour the back.** On the root `<svg>` element (Inkscape: *Edit → XML Editor*), add `data-name="Main gate"` for a display name other than the one derived from the file name, and, for gates, `data-back-color="#141c28"` for the unprinted back.

That is all: the panels are generated from the sheet. `npm run assets:check` and CI hide the guides, crop each panel region, check it, and add the texture set to the collection manifest; publication uploads the generated WebP files. You never commit WebP files or edit panel paths. A sheet with live text, linked files, flowed text, a missing `artwork` or `guides` layer or template ID, a resized page, or a panel over 512 KiB fails with a message naming the problem.

In a pull request, CI comments with 3D renders and the contact sheet. To look at the result locally, run `npm run textures:preview -- <organization-slug>` for the contact sheet (add `--3d` for the renders after `npx playwright install chromium`), or `npm run textures:build -- --examples` to write the exact files that would be published to `build/` (useful as a local asset folder for TrackDraw).

See [CONTRIBUTING.md](../CONTRIBUTING.md) for submitting the result; without git, attach your sheets to a ["Submit obstacle artwork" issue](https://github.com/dutchdronesquad/track-assets/issues/new?template=submit-collection.yml).

## Rights

Only use artwork you own or have permission to use, and record the author, attribution and usage terms in the manifest. Do not copy MultiGP or other third-party branding into your collection. A template is a layout, not a license for any artwork drawn on it.
