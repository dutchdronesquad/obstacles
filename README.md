# TrackDraw obstacle assets

Source models, artwork and browser-ready textures for drone racing obstacles, together with the scripts used to maintain them. Assets are grouped by the organization or brand they represent. Each collection documents its sources and maintenance workflow in its own directory.

Available collections: [MultiGP](collections/multigp/README.md).

Want to add your organization's obstacle artwork? See [CONTRIBUTING.md](CONTRIBUTING.md) and the [texture templates](templates/README.md).

## Related repositories

- [TrackDraw](https://github.com/dutchdronesquad/trackdraw) — the browser-based FPV track designer that uses these assets to represent obstacles in track layouts.
- [TrackDraw Viewer](https://github.com/dutchdronesquad/track-viewer) — the standalone 2D and 3D viewer that uses these catalog textures to display TrackDraw tracks in other websites and applications.

## License and attribution

### Artwork and branding

Third-party artwork, logos, names and obstacle designs remain the property of their respective rights holders. Dutch Drone Squad and TrackDraw do not claim ownership or original authorship of these materials. They are included to represent recognizable obstacles in race layout planning. Their inclusion does not imply affiliation with or endorsement by the represented organizations.

Asset sources, credits and any known usage terms belong in each collection's README. Inclusion in this repository does not grant a separate license to third-party materials; their applicable rights and terms continue to apply. Keep source references and attribution with assets when adding or updating a collection.

### Software

The scripts in `scripts/` and their tests in `tests/` are available under the [MIT license](LICENSE-MIT.txt). The extraction and optimization scripts originated in [TrackDraw](https://github.com/dutchdronesquad/trackdraw/tree/9a04180f3c0a0cdf85de8a8599031cf7fd994d4a) and are offered here under MIT with the copyright holder's permission. TrackDraw itself retains its own license.

The MIT license applies to this software, not to the source models, textures, third-party artwork, branding or designs in the asset collections. Hosting these materials here or using them with `@trackdraw/viewer` does not change their rights or licensing terms.

## Maintenance

Use Node.js 24:

```sh
npm ci
npm test
```

Each collection keeps its editable sources in `collections/<organization>/source/`. Template sheets there are rendered into runtime textures during checks and publication; collections that predate templates, such as MultiGP, keep committed maintenance images and runtime textures in `collections/<organization>/textures/`. Shared maintenance scripts live in `scripts/`.

Follow the collection's README when updating artwork, review the generated textures and run `npm test`. Collection-specific steps and manually maintained assets are documented there; see the [MultiGP workflow](collections/multigp/README.md) for the first collection.

TrackDraw consumes the stable hosted texture URLs. Collection discovery is additive; existing consumers do not need to load the new metadata.

## Hosted URL contract

The production URL is:

```text
https://assets.trackdraw.app/multigp/large-top-multigp.webp
```

`https://obstacles.trackdraw.app` serves the same files from the same bucket and stays available for consumers that already use it, such as `@trackdraw/viewer` 1.0.0. New consumers should use `assets.trackdraw.app`. Use `/<organization>/<filename>.webp`. These are stable, shared URLs: compatible artwork improvements update all consumers automatically. Changes requiring different rendering must use a new filename and keep the old file available. No asset version or consumer version bump is needed for compatible updates.

Runtime filenames retain their original case. Consumers need no API key. Runtime WebP textures, collection manifests and the discovery index are uploaded; source GLBs and maintenance PNGs remain in Git. Browser and CDN caching is five minutes (`public, max-age=300, must-revalidate`), so updates need no cache purge. Custom Cloudflare cache rules must not override this TTL. Uploads overwrite matching keys but do not delete other bucket objects.

## Collection metadata

See the [version 1 collection contract](docs/collection-contract.md) and the [DDS template pilot](collections/dds/README.md). Run `npm run assets:check` to validate manifests, images and template sheets, and `npm run textures:build` to write the exact publishable files to `build/`. Published collections are discoverable at `/collections.json`; examples remain in Git only.
