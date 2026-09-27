# TrackDraw obstacle assets

Source artwork, maintenance scripts and shared runtime textures for recognizable race obstacles. Each represented organization has its own directory; the first is [MultiGP](multigp/README.md).

## Attribution and rights

Dutch Drone Squad and TrackDraw do not claim ownership or authorship of the MultiGP artwork, logos, branding or obstacle designs. These belong to MultiGP and their respective rights holders. They are included solely to make the represented obstacles recognizable in race layout planning; inclusion does not imply endorsement or affiliation. See the [original MultiGP obstacle guide](https://www.multigp.com/multigp-drone-race-course-obstacles/).

The imported maintenance scripts originate from [TrackDraw](https://github.com/dutchdronesquad/trackdraw/tree/9a04180f3c0a0cdf85de8a8599031cf7fd994d4a) and retain its [AGPL-3.0 license](LICENSE-AGPL-3.0.txt). That software license does **not** grant rights to third-party artwork, trademarks or designs. The assets are not part of the Apache-licensed `@trackdraw/viewer` package.

## Maintenance

Use Node.js 22 or later:

```sh
npm ci
npm test
```

- `multigp/source/multigp-obstacles.glb`: source model, not served from R2.
- `multigp/textures/`: maintenance PNGs and browser-ready WebP output.
- `scripts/extract_glb_textures.mjs`: extract the embedded GLB artwork.
- `scripts/optimize_multigp_textures.mjs`: optimize textures and generate red variants.

Run `npm run assets:multigp:refresh` only when updating the artwork, then inspect the resulting changes and run `npm test`. The separately maintained double-sided banner PNG and WebP must be preserved; they are not generated from the GLB. The initial migration preserved all existing TrackDraw textures byte-for-byte. See the [full asset workflow](multigp/README.md).

TrackDraw's current copies stay in place until its separate consumer migration (dutchdronesquad/trackdraw#867); this repo becomes the source for subsequent asset updates.

## Hosted URL contract

The intended production URL is:

```text
https://obstacles.trackdraw.app/multigp/large-top-multigp.webp
```

Use `/<organization>/<filename>.webp`. These are stable, shared URLs: compatible artwork improvements update all consumers automatically. Changes requiring different rendering must use a new filename and keep the old file available. No asset version or consumer version bump is needed for compatible updates.

Runtime filenames retain their original case. Consumers need no API key. Only WebP runtime textures are uploaded; source GLBs and maintenance PNGs remain in Git. Browser and CDN caching is five minutes (`public, max-age=300, must-revalidate`), so updates need no cache purge. Custom Cloudflare cache rules must not override this TTL. Uploads overwrite matching keys but do not delete other bucket objects.

## One-time Cloudflare setup

In the Cloudflare account that owns `trackdraw.app`:

1. Under **R2 Object Storage**, create a Standard bucket named **`trackdraw-obstacles`**, using the default jurisdiction (a Western Europe location hint is fine).
2. Open the bucket's **Settings → Custom Domains → Add**. Connect **`obstacles.trackdraw.app`** and wait until its status is **Active**. Leave the `r2.dev` development URL disabled.
3. Under **Settings → CORS Policy**, paste the complete contents of [`cors.json`](cors.json) in the JSON tab (dashboard format; Wrangler uses a different schema). This permits public GET/HEAD from browser viewers on any domain, without credentials.
4. Copy this account's **Account ID**. In this repository, run `npx wrangler login` and sign into that same account.

Cloudflare references: [custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Automatic publishing

Every push to `main` runs **Publish assets**: test the committed textures, upload their WebP files to stable URLs, then verify public bytes, content type, CORS and cache headers. No release or tag is required. GitHub serializes publishing runs; each run checks out the current default branch so an older queued run cannot restore older assets.

### One-time GitHub configuration

Open this repository's **Settings → Environments → production → Environment secrets**:

- Add `CLOUDFLARE_ACCOUNT_ID` with the account ID that owns `trackdraw-obstacles`.
- Add `CLOUDFLARE_API_TOKEN`. Create a Cloudflare API token with **Account → Workers R2 Storage → Edit**, restricted to the TrackDraw account. This is a Cloudflare API bearer token for Wrangler, not an S3 access-key pair. Never commit the token.

### Publish or retry from GitHub

Commit and push reviewed texture changes to `main`; **Actions → Publish assets** uploads them automatically. To repopulate an emptied bucket or retry, open **Actions → Publish assets → Run workflow** on `main`. No terminal is required. Both automatic and manual runs publish immediately; GitHub dry-run inputs are no longer needed.

The workflow uploads committed HEAD bytes and always refreshes the object's content and cache metadata. It does not rebuild textures during publication; generate and review texture changes before committing them. Public verification uses a cache-busting query; existing browser URLs may still serve the previous texture for up to five minutes. Files are uploaded individually, not as an atomic set.

The terminal remains available as a fallback (do not run it concurrently with a workflow):

```sh
npm ci
export CLOUDFLARE_ACCOUNT_ID='YOUR_TRACKDRAW_ACCOUNT_ID'
npm run assets:upload -- --dry-run
npm run assets:upload
```

The package is private and is not published to npm. Legacy version-prefixed objects and GitHub releases are not used or deleted by the workflow.
