# Contributing a club texture collection

Clubs and brands can add artwork for obstacles TrackDraw already supports. You design from a template, the repository checks your files, a maintainer reviews the artwork, and it is then published to `https://obstacles.trackdraw.app`. New obstacle shapes are a TrackDraw feature and cannot be added here.

## Before you start

- **Rights.** You need permission to publish the artwork, including any logos. The repository's MIT license covers only the scripts and tests, not artwork. Record the author, attribution and usage terms in your manifest.
- **Portable use.** Decide whether TrackDraw may include your artwork in offline or portable exports. Set `usage.portable` to `allowed` only when you grant that in `usage.terms`; otherwise use `not-granted`.
- **Templates.** Check which templates have an editable sheet in [templates/](templates/README.md). Today that is `gate-standard-v1` (standard 5x5 gate) and `corner-flag-v1` (corner flag).
- Optionally, [open a collection proposal](../../issues/new?template=collection-proposal.yml) first so maintainers can confirm the template and the rights before you design.

## Steps

1. **Create the collection.** Add `collections/<organization-slug>/` with:
   - `manifest.json`: see the [collection contract](docs/collection-contract.md) and the [DDS manifest](collections/dds/manifest.json) as an example. Use `"status": "example"`.
   - `README.md`: who the club is, where the artwork comes from, and how it was made.
2. **Design.** Copy a template to `collections/<organization-slug>/source/<texture-id>.svg` and edit only its Artwork layer. Keep original logos or other editable artwork in `source/` too; only template sheets are exported. The [template guide](templates/README.md) explains panel orientation, safe areas, transparency and what the export rejects.
3. **Export.** Run:

   ```bash
   npm ci
   npm run textures:export -- collections/<organization-slug>/source/<texture-id>.svg
   ```

4. **Reference the panels.** Add the texture set to `manifest.json`, pointing each panel at its exported `textures/<texture-id>-<panel>.webp`.
5. **Check.** Run:

   ```bash
   npm run assets:check
   npm test
   ```

   `assets:check` validates the manifest, decodes every image, and checks proportions, transparency, size limits, and that the textures still match their SVG source. Every failure names the file and what to change.
6. **Review your contact sheet.** Run `npm run textures:preview -- <organization-slug>` and open `previews/<organization-slug>.png`. It shows every panel where it appears on the obstacle, with its top edge marked and the unprinted back.
7. **Open a pull request.** Fill in the checklist. CI runs the same checks and attaches the contact sheets as the `texture-previews` artifact.

## Review and publication

A maintainer checks the rights information, reviews the contact sheet, and checks the texture set in TrackDraw's 3D view: front placement, left/right, reading direction, the back, and a rotated view. Once approved, the maintainer sets `"status": "published"`. Merging to `main` then uploads the textures, the manifest and the updated `collections.json` with the existing publish workflow.

Published files keep their URLs. To fix artwork compatibly, export over the same file names. A change that alters the panel mapping or the meaning of the artwork needs a new texture ID and new file names, with the old ones kept. See the [collection contract](docs/collection-contract.md#discovery-and-publication).
