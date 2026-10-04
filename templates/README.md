# Texture templates

Editable SVG sheets for designing club artwork on obstacles TrackDraw already renders. You draw on a sheet, export it, and get the runtime WebP panels a [collection](../docs/collection-contract.md) references. No Blender, 3D model or renderer change is needed.

These are rendering templates: they match the surfaces TrackDraw draws, not a certified manufacturing pattern. Physical banners, seams, eyelets and print bleed may differ; check with your printer before ordering real panels.

| Template | Sheet | Panels | Exported size per panel | Transparency | Reference |
| --- | --- | --- | --- | --- | --- |
| `gate-standard-v1` | [gate-standard-v1.svg](gate-standard-v1.svg) | `left`, `right`, `top` | sides 300 × 1500 px (1 × 5 ft), top 2100 × 300 px (7 × 1 ft) | none; transparent areas become the default white sides and navy top | [image](reference/gate-standard-v1.webp) |
| `corner-flag-v1` | [corner-flag-v1.svg](corner-flag-v1.svg) | `front`, `back` | 400 × 2044 px each | required outside the flag outline | [image](reference/corner-flag-v1.webp) |

The template ID in each sheet's `data-template` attribute is the `template` value in the manifest. Other templates in the contract (`gate-championship-v1`, `hurdle-v1`) do not have an editable sheet yet.

## Sheet layout

Every sheet has two layers:

- **Artwork** (`id="artwork"`): everything that should end up on the obstacle. It starts with the default panel colours.
- **Guides** (`id="guides"`): panel outlines, safe areas, labels and arrows. It is locked and is never exported, even when visible.

### `gate-standard-v1`

The sheet is the front view of the 5 × 5 ft standard gate at 100 units per foot (700 × 600). Draw it exactly as someone facing the printed side sees it:

- The `left` slot is the post on your left and `right` is the post on your right. Each exported panel is exactly its region on the sheet, with no extra rotation or mirroring.
- Rotate the artwork, not the sheet. Following the existing MultiGP convention, side text should read bottom → top on the left post and top → bottom on the right post (the pink arrows).
- Keep important content inside the dashed safe area: the frame tube covers the outer edges.
- Only the front is printed. Set `backColor` on the texture set in the manifest to give the back one solid colour that matches the artwork; without it the back keeps the default white sides and navy top.
- The opening in the middle is not exported.

### `corner-flag-v1`

The sheet holds two flag sides next to each other. Each side is drawn as a viewer standing on that side sees it, so text reads normally on both sides:

- `front`: the pole runs along the left edge and curves over the top.
- `back`: the outline is mirrored, so the pole runs along the right edge. Do not mirror the artwork itself.
- Everything outside the outline must stay transparent. The default artwork is clipped to the outline; keep new artwork inside those clip groups.

## From blank template to texture set

The DDS standard gate in [`collections/dds`](../collections/dds/README.md) was made this way.

1. **Set up the collection.** Create `collections/<organization-slug>/` with a `manifest.json` and `README.md` as described in the [collection contract](../docs/collection-contract.md). Use `"status": "example"` until the artwork is reviewed.
2. **Copy the template.** Copy for example `templates/gate-standard-v1.svg` to `collections/<organization-slug>/source/<texture-id>.svg`. The file name becomes the texture file prefix. Never edit the shared template for one club.
3. **Edit the artwork.** Use [Inkscape](https://inkscape.org/) (free) or another SVG editor that keeps the `artwork` and `guides` group IDs and the page size. Draw only on the Artwork layer.
   - Convert text to paths (Inkscape: *Path → Object to Path*). Live text is rejected because fonts differ between computers.
   - Embed images instead of linking them (Inkscape: *File → Import → Embed*). Prefer vector logos for sharp edges.
   - Save as SVG. Inkscape SVG is fine.
4. **Export the panels.** In this repository, run:

   ```bash
   npm ci
   npm run textures:export -- collections/<organization-slug>/source/<texture-id>.svg
   ```

   This hides the guides, crops each panel region, and writes lossless WebP files to `collections/<organization-slug>/textures/<texture-id>-<panel>.webp`. The export fails with a clear message for live text, linked files, flowed text, a missing `artwork` or `guides` layer or template ID, a resized sheet, or a panel over 512 KiB.
5. **Add the texture set to the manifest.** For example:

   ```json
   {
     "id": "standard-gate",
     "name": "Standard gate",
     "template": "gate-standard-v1",
     "backColor": "#141c28",
     "panels": {
       "left": "textures/standard-gate-left.webp",
       "right": "textures/standard-gate-right.webp",
       "top": "textures/standard-gate-top.webp"
     }
   }
   ```

6. **Validate.** Run `npm run assets:check && npm test`. Commit the SVG source and the exported WebP files together. `npm run textures:export` without arguments regenerates every collection source.
7. **Review the contact sheet.** Run `npm run textures:preview -- <organization-slug>` and compare `previews/<organization-slug>.png` with the template's reference image: front placement, which post each side panel is on, reading direction and the back.
8. **Check it in TrackDraw.** Maintainers do the final 3D check, including a rotated view. Until TrackDraw can select collections (trackdraw#886), they serve the exported files in place of the MultiGP texture URLs for the same template in a local TrackDraw session, for example with browser request overrides.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for submitting the result.

## Rights

Only use artwork you own or have permission to use, and record the author, attribution and usage terms in the manifest. Do not copy MultiGP or other third-party branding into a club collection. A template is a layout, not a license for any artwork drawn on it.
