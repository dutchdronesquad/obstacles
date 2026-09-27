# TrackDraw obstacle assets

Source artwork, maintenance scripts and shared runtime textures for recognizable race obstacles. Each represented organization has its own directory; the first is [MultiGP](multigp/README.md).

## Attribution and rights

Dutch Drone Squad and TrackDraw do not claim ownership or authorship of the MultiGP artwork, logos, branding or obstacle designs. These belong to MultiGP and their respective rights holders. They are included solely to make the represented obstacles recognizable in race layout planning; inclusion does not imply endorsement or affiliation. See the [original MultiGP obstacle guide](https://www.multigp.com/multigp-drone-race-course-obstacles/).

The imported maintenance scripts originate from [TrackDraw](https://github.com/dutchdronesquad/trackdraw/tree/9a04180f3c0a0cdf85de8a8599031cf7fd994d4a) and retain its [AGPL-3.0 license](LICENSE-AGPL-3.0.txt). That software license does **not** grant rights to third-party artwork, trademarks or designs. The assets are not part of the Apache-licensed `@trackdraw/viewer` package.

## Maintenance

Use Node.js 24:

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

## Publishing

Push reviewed changes to `main` to publish automatically. To retry, use **Actions → Publish assets → Run workflow**. No release or tag is required.

See [Cloudflare setup and publishing](docs/cloudflare-setup.md) for bucket configuration, the `production` environment secrets, troubleshooting and manual commands.
