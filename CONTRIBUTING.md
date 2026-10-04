# Contributing a club texture collection

Clubs and brands can add artwork for obstacles TrackDraw already supports. You design from a template, the repository checks your files, a maintainer reviews the artwork, and it is then published to `https://obstacles.trackdraw.app`. New obstacle shapes are a TrackDraw feature and cannot be added here.

## Before you start

- **Rights.** You need permission to publish the artwork, including any logos. The repository's MIT license covers only the scripts and tests, not artwork. You record the author, attribution and usage terms in the submission form or your manifest.
- **Portable use.** Decide whether TrackDraw may include your artwork in offline or portable exports. Set `usage.portable` to `allowed` only when you grant that in `usage.terms`; otherwise use `not-granted`.
- **Templates.** Check which templates have an editable sheet in [templates/](templates/README.md). Today that is `gate-standard-v1` (standard 5x5 gate) and `corner-flag-v1` (corner flag).

## The easy way: submit through an issue

No git, Node.js or command line needed.

1. **Download a template.** [`gate-standard-v1.svg`](templates/gate-standard-v1.svg) for the standard 5x5 gate or [`corner-flag-v1.svg`](templates/corner-flag-v1.svg) for the corner flag.
2. **Design.** Open it in [Inkscape](https://inkscape.org/) (free) and draw on the Artwork layer; the [template guide](templates/README.md) explains orientation, safe areas and what to avoid. Save one file per texture set.
3. **Submit.** [Open a "Submit club artwork" issue](../../issues/new?template=submit-collection.yml), fill in your club details and usage terms, and drag your `.svg` files into the form.

A maintainer checks the submission and adds the `accepted-submission` label. A bot then creates the collection, opens a pull request and links it in your issue; the pull request shows 3D renders of your artwork in TrackDraw's viewer. If something needs fixing, the bot explains it in the issue.

## Working in the repository

Prefer git? Contribute directly with these steps.

1. **Create the collection.** Add `collections/<organization-slug>/` with:
   - `manifest.json`: only the collection details (`schemaVersion`, `id`, `name`, `status`, `author`, `attribution`, `usage`). Copy the [DDS manifest](collections/dds/manifest.json) and keep `"status": "example"`. Texture sets are added automatically from your sheets.
   - `README.md`: who the club is, where the artwork comes from, and how it was made.
2. **Design.** Copy a template to `collections/<organization-slug>/source/<texture-id>.svg` and edit its Artwork layer; the [template guide](templates/README.md) explains orientation, safe areas, transparency, the optional `data-name` and `data-back-color`, and what is rejected. Each sheet becomes one texture set. Keep original logos or other editable artwork in `source/` too; SVGs without `data-template` are not used for panels.
3. **Check.** Run:

   ```bash
   npm ci
   npm run assets:check
   npm run textures:preview -- <organization-slug>
   ```

   `assets:check` generates the panels from your sheets and validates the manifest, proportions, transparency and size limits; every failure names the file and what to change. Open `previews/<organization-slug>.png` to see every panel where it appears on the obstacle, with its top edge marked and the unprinted back.
4. **Open a pull request** with your manifest, README and SVG sheets, and fill in the checklist. CI runs the same checks and posts one comment on the pull request with the result, any errors, 3D renders of each texture set in TrackDraw's viewer (front, turned and back) and the contact sheet. Every push updates that comment.

## Review and publication

A maintainer checks the rights information and reviews the preview comment: front placement, left/right, reading direction, the back, and a rotated view. Once approved, the maintainer sets `"status": "published"`. Merging to `main` then generates and uploads the textures, the manifest and the updated `collections.json` with the existing publish workflow.

Published files keep their URLs. To fix artwork compatibly, edit the same sheet; its panels are regenerated under the same file names. A change that alters the panel mapping or the meaning of the artwork needs a new sheet (a new texture ID), with the old sheet kept. See the [collection contract](docs/collection-contract.md#discovery-and-publication).

## For maintainers

- **Accepting a submission:** review the issue (rights, artwork, slug), then add the `accepted-submission` label. The [submission workflow](.github/workflows/submission.yml) renders and validates the sheets without write access, then a separate job opens the pull request, starts the checks and comments on the issue. Problems are posted on the issue and the label is removed so it can be added again after a fix.
- **Repository setup:** the labels `submission` and `accepted-submission` must exist, and *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests* must be enabled.
- **Previews:** images live on the single-commit `pr-previews` branch and are removed when the pull request closes.
