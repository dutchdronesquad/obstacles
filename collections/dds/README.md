# Dutch Drone Squad

Pilot collection for the [editable texture templates](../../templates/README.md). It contains one texture set, `standard-gate`, made from [`gate-standard-v1`](../../templates/gate-standard-v1.svg) without Blender or renderer changes.

- `source/standard-gate.svg`: the editable sheet (Artwork and Guides layers) and the whole texture set. The DDS logo is embedded as vector paths, and `data-back-color` sets the unprinted back.
- The `standard-gate` texture set and its `standard-gate-{left,right,top}.webp` panels are generated from that sheet; `manifest.json` only holds the collection details.

The design is deliberately calm: dark navy panels, one orange line framing the opening, and the logo once per panel. The logo reads bottom → top on the left post and top → bottom on the right. The sheet's `data-back-color` gives the unprinted back the same navy as the front. The result in TrackDraw is shown in the [gate reference image](../../templates/reference/gate-standard-v1.webp).

The DDS logo and artwork belong to Dutch Drone Squad; see `manifest.json` for the usage terms. `status: example` keeps the collection out of public discovery and uploads until the artwork is approved for publication. See the [collection contract](../../docs/collection-contract.md) for slot orientation, rights and publication rules.
