# TrackDraw obstacle assets

Source models, artwork and browser-ready textures for drone racing obstacles, together with the scripts used to maintain them. Assets are grouped by the organization or brand they represent. Each collection documents its sources and maintenance workflow in its own directory.

Available collections: [MultiGP](multigp/README.md).

## License and attribution

### Artwork and branding

Third-party artwork, logos, names and obstacle designs remain the property of their respective rights holders. Dutch Drone Squad and TrackDraw do not claim ownership or original authorship of these materials. They are included to represent recognizable obstacles in race layout planning. Their inclusion does not imply affiliation with or endorsement by the represented organizations.

Asset sources, credits and any known usage terms belong in each collection's README. Inclusion in this repository does not grant a separate license to third-party materials; their applicable rights and terms continue to apply. Keep source references and attribution with assets when adding or updating a collection.

### Software

The maintenance scripts imported from [TrackDraw](https://github.com/dutchdronesquad/trackdraw/tree/9a04180f3c0a0cdf85de8a8599031cf7fd994d4a) retain their [AGPL-3.0 license](LICENSE-AGPL-3.0.txt). This software license does not cover third-party artwork, branding or designs. Hosting assets here or using them with `@trackdraw/viewer` does not place them under the viewer's software license.

## Maintenance

Use Node.js 24:

```sh
npm ci
npm test
```

Each collection keeps its source files in `<organization>/source/` and its maintenance images and runtime textures in `<organization>/textures/`. Shared maintenance scripts live in `scripts/`.

Follow the collection's README when updating artwork, review the generated textures and run `npm test`. Collection-specific steps and manually maintained assets are documented there; see the [MultiGP workflow](multigp/README.md) for the first collection.

TrackDraw's current copies stay in place until its separate consumer migration (dutchdronesquad/trackdraw#867); this repo becomes the source for subsequent asset updates.

## Hosted URL contract

The intended production URL is:

```text
https://obstacles.trackdraw.app/multigp/large-top-multigp.webp
```

Use `/<organization>/<filename>.webp`. These are stable, shared URLs: compatible artwork improvements update all consumers automatically. Changes requiring different rendering must use a new filename and keep the old file available. No asset version or consumer version bump is needed for compatible updates.

Runtime filenames retain their original case. Consumers need no API key. Only WebP runtime textures are uploaded; source GLBs and maintenance PNGs remain in Git. Browser and CDN caching is five minutes (`public, max-age=300, must-revalidate`), so updates need no cache purge. Custom Cloudflare cache rules must not override this TTL. Uploads overwrite matching keys but do not delete other bucket objects.
