# Cloudflare hosting and publishing

## Bucket and domain

In the Cloudflare account that owns `trackdraw.app`:

1. Under **R2 Object Storage**, create a Standard bucket named **`trackdraw-obstacles`**, using the default jurisdiction (a Western Europe location hint is fine).
2. Open the bucket's **Settings → Custom Domains → Add**. Connect **`obstacles.trackdraw.app`** and wait until its status is **Active**. Leave the `r2.dev` development URL disabled.
3. Under **Settings → CORS Policy**, paste the complete contents of [`cors.json`](../cors.json) in the JSON tab (dashboard format; Wrangler uses a different schema). This permits public GET/HEAD from browser viewers on any domain, without credentials.
4. Copy this account's **Account ID** for the GitHub environment below. No local Wrangler login is needed for GitHub Actions.

Cloudflare references: [custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Automatic publishing

Every push to `main` runs **Publish assets**: validate collections and test the committed textures, upload their WebP files followed by JSON manifests and the discovery index to stable URLs, then verify public bytes, content type, CORS and cache headers. No release or tag is required. GitHub serializes publishing runs; each run checks out the current default branch so an older queued run cannot restore older assets.

### One-time GitHub configuration

In Cloudflare, open **Manage Account → Account API Tokens → Create Token** and create a custom account token named `GitHub obstacles`. Grant **Account → Workers R2 Storage → Edit** for the TrackDraw account. This workflow uses Wrangler's Cloudflare REST API; R2 **Object Read & Write** tokens are for the S3 API and cannot be used here.

Then open this repository's **Settings → Environments → production → Environment secrets**:

- Add `CLOUDFLARE_ACCOUNT_ID` with the account ID that owns `trackdraw-obstacles`.
- Add `CLOUDFLARE_API_TOKEN` with the account token value.

Both values are environment secrets, not repository variables. Never commit the token. Once saved, run **Actions → Publish assets → Run workflow** on `main` to test the setup.

### Publish or retry from GitHub

Commit and push reviewed texture changes to `main`; **Actions → Publish assets** uploads them automatically. To repopulate an emptied bucket or retry, open **Actions → Publish assets → Run workflow** on `main`. No terminal is required. Both automatic and manual runs publish immediately; GitHub dry-run inputs are no longer needed.

The workflow uploads committed HEAD bytes and always refreshes the object's content and cache metadata. It does not rebuild textures during publication; generate and review texture changes before committing them. Public verification uses a cache-busting query; existing browser URLs may still serve the previous texture for up to five minutes. Files are uploaded individually, not as an atomic set.

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

If uploads succeed but verification reports `max-age=14400` instead of `max-age=300`, Cloudflare is overriding the object cache header. In the `trackdraw.app` zone, add a Cache Rule matching `http.host eq "obstacles.trackdraw.app"` and set **Browser TTL → Respect origin**. Ensure no later matching rule overrides this setting, and leave Edge TTL respecting the origin headers too. Alternatively, the zone-wide **Caching → Configuration → Browser Cache TTL → Respect Existing Headers** setting applies to the entire zone. Prefer the hostname-specific rule to avoid changing other applications.

Then rerun **Publish assets**. The verifier requests a fresh URL; existing browser caches can retain the old four-hour lifetime until it expires. See [Cloudflare Browser Cache TTL](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/set-browser-ttl/).

Collection metadata uses the same CORS and cache rules as textures, with `application/json` content type. The directory migration does not change existing image URLs. See [the collection contract](collection-contract.md) for publication order, discovery and failure handling.
