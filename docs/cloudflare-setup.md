# Cloudflare hosting and publishing

## Bucket and domain

In the Cloudflare account that owns `trackdraw.app`:

1. Under **R2 Object Storage**, create a Standard bucket named **`trackdraw-assets`**, using the default jurisdiction (a Western Europe location hint is fine).
2. Open the bucket's **Settings → Custom Domains → Add**. Connect **`assets.trackdraw.app`** and wait until its status is **Active**. Leave the `r2.dev` development URL disabled.
3. Under **Settings → CORS Policy**, paste the complete contents of [`cors.json`](../cors.json) in the JSON tab (dashboard format; Wrangler uses a different schema). This permits public GET/HEAD from browser viewers on any domain, without credentials.
4. Copy this account's **Account ID** for the GitHub environment below. No local Wrangler login is needed for GitHub Actions.

Cloudflare references: [custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Automatic publishing

Every push to `main` runs **Publish assets**: a job without secrets validates the collections, renders template sheets and builds the public files; a `production` job uploads those bytes (WebP files, then JSON manifests, then the discovery index); a third job verifies bytes, content type, CORS and cache headers. No release or tag is required. GitHub serializes publishing runs; each run checks out the current default branch so an older queued run cannot restore older assets.

### One-time GitHub configuration

In Cloudflare, open **Manage Account → Account API Tokens → Create Token** and create a custom account token named `GitHub obstacles`. Grant **Account → Workers R2 Storage → Edit** for the TrackDraw account. This workflow uses Wrangler's Cloudflare REST API; R2 **Object Read & Write** tokens are for the S3 API and cannot be used here.

Then open this repository's **Settings → Environments → production → Environment secrets**:

- Add `CLOUDFLARE_ACCOUNT_ID` with the account ID that owns `trackdraw-assets`.
- Add `CLOUDFLARE_API_TOKEN` with the account token value.

Both values are environment secrets, not repository variables. Never commit the token. Once saved, run **Actions → Publish assets → Run workflow** on `main` to test the setup.

### Publish or retry from GitHub

Commit and push reviewed texture changes to `main`; **Actions → Publish assets** uploads them automatically. To repopulate an emptied bucket or retry, open **Actions → Publish assets → Run workflow** on `main`. No terminal is required. Both automatic and manual runs publish immediately; GitHub dry-run inputs are no longer needed.

The workflow uploads the files built from the committed HEAD, including textures generated from template sheets, and always refreshes the object's content and cache metadata. Public verification uses a cache-busting query; existing browser URLs may still serve the previous texture for up to five minutes. Files are uploaded individually, not as an atomic set.

The terminal remains available as a fallback (do not run it concurrently with a workflow):

```sh
npm ci
npx wrangler login
export CLOUDFLARE_ACCOUNT_ID='YOUR_TRACKDRAW_ACCOUNT_ID'
npm run assets:upload -- --dry-run
npm run assets:upload
```

The package is private and is not published to npm. Legacy version-prefixed objects and GitHub releases are not used or deleted by the workflow.

## Troubleshooting cache verification

If uploads succeed but verification reports `max-age=14400` instead of `max-age=300`, Cloudflare is overriding the object cache header. In the `trackdraw.app` zone, add a Cache Rule matching `http.host eq "assets.trackdraw.app"` and set **Browser TTL → Respect origin**. Ensure no later matching rule overrides this setting, and leave Edge TTL respecting the origin headers too. Alternatively, the zone-wide **Caching → Configuration → Browser Cache TTL → Respect Existing Headers** setting applies to the entire zone. Prefer the hostname-specific rule to avoid changing other applications.

Then rerun **Publish assets**. The verifier requests a fresh URL; existing browser caches can retain the old four-hour lifetime until it expires. See [Cloudflare Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/set-browser-ttl/).

Collection metadata uses the same CORS and cache rules as textures, with `application/json` content type. The directory migration does not change existing image URLs. See [the collection contract](collection-contract.md) for publication order, discovery and failure handling.

## Artwork designer

The static artwork designer is a separate Worker named `trackdraw-designer`, configured in [`designer/app/wrangler.jsonc`](../designer/app/wrangler.jsonc). Cloudflare creates the DNS record and HTTPS certificate for `designer.trackdraw.app` through its custom-domain route. Assets use SPA fallback. The site has no backend or artwork storage; GitHub receives the SVG only when the contributor attaches it to the submission form.

### Designer environments and token

Create **designer-production** and **designer-preview** under the repository's **Settings → Environments**. Allow release tags in `designer-production` by adding a **Tag** deployment rule `*.*.*` under **Selected branches and tags**. Restrict `designer-preview` to trusted same-repository branches and use environment reviewers if branches may be created by contributors whose code has not been reviewed. Fork pull requests never enter the preview job. Keep the existing R2 `production` environment and token unchanged.

Create a separate Cloudflare token for designer deployment in the account that owns `trackdraw.app`: **Account → Workers Scripts → Edit**, **Account → Account Settings → Read** (for the workers.dev preview subdomain), **Zone → Zone → Read** and **Zone → Workers Routes → Edit** restricted to `trackdraw.app`. If custom-domain creation requires DNS permissions in the account, add **Zone → DNS → Edit** on that zone. Save `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as environment secrets in each designer environment. Never commit token values or reuse the R2-only token.

Workflows stay focused: `Check assets` validates collections and renders collection previews; `Designer checks and preview` owns branch validation and PR previews; `Publish designer` owns release-triggered production deployment; their shared `Build designer` workflow owns the browser suite, site build and deploy dry run; `Publish assets` owns R2 publishing. Branch changes are checked on pull requests rather than also on branch pushes. Bot-created submission branches still use the existing manual check dispatch.

The [Designer checks and preview workflow](../.github/workflows/designer.yml) validates main pushes, pull requests and manual runs and uploads checked previews for trusted pull requests. The separate [Publish designer workflow](../.github/workflows/designer-publish.yml) handles stable release publication only. Both call [Build designer](../.github/workflows/designer-build.yml), which builds and tests without environment secrets, including a browser suite against the local Cloudflare assets runtime and a deploy dry run. After checking out the exact commit, production and preview jobs call the local [Prepare designer deployment composite action](../.github/actions/prepare-designer-deployment/action.yml). It sets up Node.js, installs locked deployment tooling with lifecycle scripts disabled and downloads the checked `designer-site` artifact from the same workflow run. Cloudflare credentials are exposed only to the Wrangler deployment step; workflow triggers, environments, version metadata and HTTPS verification stay in the separate workflow files. Only a published, stable GitHub Release deploys the designer to production. Release Drafter maintains the next draft on `main` using the shared DDS release configuration. Publish its `vX.Y.Z` tag when ready; the workflow checks out that tag, validates its SemVer, and builds and tests the release before deploying. Prereleases do not deploy. Pushes to `main` and manual runs only build and test; retry a failed release deployment by rerunning its existing Actions run. Same-repository pull requests upload a version with `wrangler versions upload --preview-alias pr-<number>` and link it in the job summary and GitHub deployment. The header shows the release tag on desktop and mobile, with the checked commit in its tooltip. Local builds show `dev`; check builds show `dev-<sha>` and pull requests show `pr-<number>-<sha>`. Wrangler records the same version with `--tag` and the full checked commit with `--message`. Both deployed URLs are checked over HTTPS using the uncached `/version.json` to confirm the exact version and commit, rather than accepting any successful HTML response. Previews do not change production traffic. Versions need an initial Worker deployment before their preview URLs can be used.

Validate the deployment package locally before publishing a release:

```sh
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run designer:test
npx wrangler deploy --config designer/app/wrangler.jsonc --dry-run
```

Publish a stable GitHub Release for the first production deployment too; the release workflow owns production builds and their version metadata.

### Release acceptance

1. Publish a stable release and verify that the header version and `/version.json` match its tag and commit. Open `https://designer.trackdraw.app` and confirm HTTPS, the 2D editor, downloaded sheet reopening and the live 3D preview on desktop and mobile. HTML and the unversioned logo must revalidate; hashed assets use `max-age=31536000, immutable`. Confirm the CSP is present on the HTML and SPA fallback. Cloudflare browser cache rules must respect these response headers.
2. Create a sheet using artwork you have permission to publish. Use **Submit artwork**, verify the prefilled organization, short name and usage, attach the downloaded SVG using the form's upload field, confirm permission and submit the issue. GitHub only prefills text fields: Usage is an input with the same two exact values the bot validates, while the designer provides a dropdown. Do not prefill the permission checkbox.
3. A maintainer adds `accepted-submission`. Verify the bot downloads the real GitHub attachment, opens a collection PR and posts a passing preview comment with correctly mapped 3D renders. Keep the test collection at `status: example`; it is not publication permission. Record the issue, bot PR and check-run URLs with #35 before marking acceptance complete.

References: [Workers static assets headers](https://developers.cloudflare.com/workers/static-assets/headers/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) and [GitHub upload field schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema#upload).
