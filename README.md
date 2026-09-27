# TrackDraw obstacle assets

Source artwork, maintenance scripts and versioned runtime textures for recognizable race obstacles. Each represented organization has its own directory; the first is [MultiGP](multigp/README.md).

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

Run `npm run assets:multigp:refresh` only when updating the artwork, then inspect the resulting changes and run `npm test`. The separately maintained double-sided banner PNG and WebP must be preserved; they are not generated from the GLB. The first release preserves all existing TrackDraw textures byte-for-byte. See the [full asset workflow](multigp/README.md).

TrackDraw's current copies stay in place until its separate pinned-vendoring migration (dutchdronesquad/trackdraw#867); this repo becomes the source for subsequent asset updates.

## Hosted URL contract

The intended production URL is:

```text
https://obstacles.trackdraw.app/v0.1.0/multigp/large-top-multigp.webp
```

Use `/<git-tag>/<organization>/<filename>.webp`. Pin a version: there is no mutable `latest` alias. Runtime filenames retain their original case. Consumers need no API key. Only WebP runtime textures are uploaded; source GLBs and maintenance PNGs remain in Git. Hosted URLs become available after the one-time setup and release upload below.

## One-time Cloudflare setup

In the Cloudflare account that owns `trackdraw.app`:

1. Under **R2 Object Storage**, create a Standard bucket named **`trackdraw-obstacles`**, using the default jurisdiction (a Western Europe location hint is fine).
2. Open the bucket's **Settings → Custom Domains → Add**. Connect **`obstacles.trackdraw.app`** and wait until its status is **Active**. Leave the `r2.dev` development URL disabled.
3. Under **Settings → CORS Policy**, paste the complete contents of [`cors.json`](cors.json) in the JSON tab (dashboard format; Wrangler uses a different schema). This permits public GET/HEAD from browser viewers on any domain, without credentials.
4. Copy this account's **Account ID**. In this repository, run `npx wrangler login` and sign into that same account.

Cloudflare references: [custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Publish a release

A manual command is sufficient for this small asset library; no CI deployment token is needed. Only publish from the official repository clone. Run from its root:

```sh
npm ci
npm test
git fetch origin --tags
export CLOUDFLARE_ACCOUNT_ID='YOUR_TRACKDRAW_ACCOUNT_ID'
npm run release:upload -- v0.1.0 --dry-run
npm run release:upload -- v0.1.0
```

The command reads the **tagged Git objects**, not working-tree textures, prints SHA-256 checksums and uploads the WebP files to `trackdraw-obstacles`. It sets `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`. It skips existing identical files and refuses different content at an existing public URL. Run one publisher at a time; this check is not a concurrent write lock. An interrupted upload can be rerun. Do not edit published objects or move published tags; create a new release for changes.

For a new version: review the texture changes, run the tests, commit and push them, then create and push a new `vX.Y.Z` Git tag and GitHub release. Run the same upload command with that tag. The package is private and is not published to npm.

After uploading, check an actual texture with a browser Origin header:

```sh
curl -I -H 'Origin: https://trackdraw.app' \
  https://obstacles.trackdraw.app/v0.1.0/multigp/large-top-multigp.webp
```

Expect HTTP 200, `Content-Type: image/webp`, `Access-Control-Allow-Origin: *` and the immutable cache header. Also check it from the DDS viewer once its hosted-texture integration is available. Until the bucket, domain, upload and live checks are complete, TrackDraw issue #866 remains open.
