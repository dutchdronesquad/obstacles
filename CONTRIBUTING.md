# Contributing a texture collection

Any racing organization (a club, chapter, league, team or brand) can add artwork for obstacles TrackDraw already supports. You design from a template, the repository checks your files, a maintainer reviews the artwork, and it is then published to `https://assets.trackdraw.app`. New obstacle shapes are a TrackDraw feature and cannot be added here.

## Before you start

- **Rights.** You need permission to publish the artwork, including any logos. The repository's MIT license covers only the scripts and tests, not artwork. The submission form records your organization as author and rights holder; in the repository you write them in your manifest.
- **Offline exports.** Decide whether TrackDraw may include your artwork in offline or portable track exports. In the form that is one choice; in a manifest, set `usage.portable` to `allowed` only when you grant that in `usage.terms`, otherwise `not-granted`.
- **Templates.** Check which templates have an editable sheet in [templates/](templates/README.md). Today that is `gate-standard-v1` (standard 5x5 gate) and `corner-flag-v1` (corner flag).

## The easy way: submit through an issue

No git, Node.js or command line needed.

1. **Design in your browser.** Open the [artwork designer](https://designer.trackdraw.app), choose a standard gate or corner flag, add your artwork and check the 3D preview. Download one SVG per texture set to keep an editable copy.
2. **Submit artwork.** The designer's **Submit artwork** button asks for your organization's name, an optional short name for web addresses (such as `dds`) and where the artwork may be used. **Download SVG and open GitHub** downloads the current sheet and opens the submission form with those details filled in. A GitHub account is required.
3. **Attach and confirm.** Add the downloaded `.svg` files under **Template sheets**, check the details and confirm you have permission to publish the artwork. The upload field accepts SVG only; the bot checks template structure and a 5 MB limit per sheet, with at most 10 sheets. Credits and usage terms are filled in for you; a maintainer can adjust them in the pull request.

Prefer a desktop SVG editor? Download [`gate-standard-v1.svg`](templates/gate-standard-v1.svg) or [`corner-flag-v1.svg`](templates/corner-flag-v1.svg), draw on the Artwork layer in [Inkscape](https://inkscape.org/), then [open the submission form](https://github.com/dutchdronesquad/track-assets/issues/new?template=submit-collection.yml). The [template guide](templates/README.md) explains orientation, safe areas and what to avoid.

A maintainer checks the submission and adds the `accepted-submission` label. A bot then creates the collection, opens a pull request and links it in your issue; the pull request shows 3D renders of your artwork in TrackDraw's viewer. If something needs fixing, the bot explains it in the issue.

## Working in the repository

The [artwork designer](https://designer.trackdraw.app) also supports direct repository contributions: download the sheet into your collection's `source/` directory and check it with the commands below. Downloaded sheets can be reopened in the app. To work on the designer locally, see [designer/app/README.md](designer/app/README.md).

Prefer git? Contribute directly with these steps.

1. **Create the collection.** Add `collections/<organization-slug>/` with:
   - `manifest.json`: only the collection details (`schemaVersion`, `id`, `name`, `status`, `author`, `attribution`, `usage`). Copy the [DDS manifest](collections/dds/manifest.json) and keep `"status": "example"`. Texture sets are added automatically from your sheets.
   - `README.md`: who the organization is, where the artwork comes from, and how it was made.
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
- **Publishing:** on `main`, a job without secrets renders and checks everything and builds the public files; a separate `production` job only uploads those bytes, and a third job verifies them. Restrict the `production` environment to `main` and protect `main` so only reviewed changes reach it.
- **Designer hosting:** the [Designer checks and preview workflow](.github/workflows/designer.yml) validates main pushes and pull requests and publishes checked PR previews. The separate [Publish designer workflow](.github/workflows/designer-publish.yml) deploys production only when a stable GitHub Release is published. Both call [Build designer](.github/workflows/designer-build.yml) to build and test without deployment secrets. Release Drafter prepares the draft using the shared DDS configuration; main pushes and manual runs remain checks. The release tag appears in the designer header and Cloudflare version metadata. Use separate `designer-production` and `designer-preview` environments; the asset publishing token remains R2-only. See [Cloudflare setup](docs/cloudflare-setup.md#artwork-designer).
