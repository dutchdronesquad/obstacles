# Dutch Drone Squad

Obstacle artwork of [Dutch Drone Squad](https://github.com/dutchdronesquad), made from the [editable texture templates](../../templates/README.md). Each sheet in `source/` is one texture set; its panels are generated on publication.

| Texture set | Template | Sheet |
| --- | --- | --- |
| `standard-gate` | [`gate-standard-v1`](../../templates/gate-standard-v1.svg) | `source/standard-gate.svg` |
| `corner-flag` | [`corner-flag-v1`](../../templates/corner-flag-v1.svg) | `source/corner-flag.svg` |

The design is deliberately calm: dark navy, the DDS logo once per panel, and one orange accent, which frames the gate opening and runs along the flag's bottom edge.

- **Gate:** the logo reads bottom → top on the left post and top → bottom on the right; `data-back-color` gives the unprinted back the same navy.
- **Flag:** the logo reads bottom → top on the front and top → bottom on the back, like the two gate posts; the back outline is mirrored so it follows the pole.

The DDS logo is embedded as vector paths. The logo and artwork belong to Dutch Drone Squad and may be used in TrackDraw and compatible viewers, including portable and offline track exports; see `manifest.json` for the exact terms and the [collection contract](../../docs/collection-contract.md) for orientation, rights and publication rules.
