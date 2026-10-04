# Dutch Drone Squad

Pilot collection for the [editable texture templates](../../templates/README.md). It contains one texture set, `standard-gate`, made from [`gate-standard-v1`](../../templates/gate-standard-v1.svg) without Blender or renderer changes.

- `source/standard-gate.svg`: the editable sheet (Artwork and Guides layers). The DDS logo is embedded as vector paths.
- `textures/standard-gate-{left,right,top}.webp`: generated with `npm run textures:export -- collections/dds/source/standard-gate.svg`. A test checks that they still match the source.

The design is deliberately calm: dark navy panels, one orange line framing the opening, and the logo once per panel. The logo reads bottom → top on the left post and top → bottom on the right. `backColor` gives the unprinted back the same navy as the front. The result in TrackDraw is shown in the [gate reference image](../../templates/reference/gate-standard-v1.webp).

The DDS logo and artwork belong to Dutch Drone Squad; see `manifest.json` for the usage terms. `status: example` keeps the collection out of public discovery and uploads until the artwork is approved for publication. See the [collection contract](../../docs/collection-contract.md) for slot orientation, rights and publication rules.
