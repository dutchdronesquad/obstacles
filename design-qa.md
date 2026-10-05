# Designer visual QA

final result: passed

## Evidence and comparison setup

Source visual truth: [combined Canvas Studio and Panel Workbench target](docs/designer/target.jpg). Implementation: [desktop](docs/designer/desktop.jpg), [mobile](docs/designer/mobile.jpg) and [mobile properties](docs/designer/mobile-properties.jpg).

The source image was 1487 × 1058 pixels. The desktop browser viewport was 1440 × 1024 CSS pixels; the in-app browser screenshot was 1412 × 1004 pixels. Both were normalized to 1440 × 1024 for the [full side-by-side comparison](docs/designer/comparison.jpg), with the source on the left and implementation on the right. The [focused property comparison](docs/designer/properties-comparison.jpg) uses the same normalization and a 380 × 800 crop of each inspector. Mobile was tested at 390 × 844 CSS pixels; the capture is 382 × 827 pixels.

Desktop state: standard gate, DDS logo imported on three panels, left copy selected, guides and snap enabled. Mobile state: corner flag with imported DDS logo, both canvas and properties drawer captured. These are browser-rendered captures of the production build.

Initial comparison evidence: [before visual fixes](docs/designer/before-visual-fixes.jpg). The same source target was compared side by side before the corrections below; final comparison evidence is linked above.

## Findings and corrections

- P1, artwork colours: the first implementation comparison used a pale background and blue accent while the selected reference uses a dark gate and orange opening frame. Restored the canonical template colours. The final full comparison shows the intended contrast and artwork hierarchy.
- P2, inspector density: initial heading and section spacing pushed layer controls below the visible inspector. Reduced the heading height and section padding, and aligned the inspector width to the source proportions. The final desktop capture shows all three artwork layers and the locked background.
- P2, selection and small control contrast: inherited canvas controls were too faint. Set explicit blue borders, white handles and larger touch handles; darkened secondary text. The final capture shows an unambiguous selection boundary.
- P2, mobile download accessibility: hiding the button text also removed its accessible name. Added a persistent label. The mobile browser regression now downloads the flag sheet successfully.

No actionable P0/P1/P2 findings remain in the compared states.

## Required fidelity surfaces

- Typography: locally bundled Inter with restrained heading weights, compact field labels and consistent numeric inputs. The real brand asset replaces the generated mock's approximate mark. Field text is slightly denser than the source to accommodate editable path properties; this is an accepted product adaptation.
- Layout: white header, vertical tool rail, horizontal panel focus, dominant canvas, right inspector and bottom status controls preserve the selected direction. The inspector scrolls independently. Mobile keeps the canvas visible and opens properties in a drawer without document overflow.
- Colours: dark template artwork, orange frame, blue selection and active tools, neutral chrome and a functional transparency grid. The grid communicates export transparency; it is not a replacement for a decorative source asset.
- Assets and icons: real TrackDraw brand SVG, real DDS paths imported from the existing collection and a consistent Phosphor icon set. Logos are editable vectors, not screenshots of artwork. Panel outlines come from canonical templates.
- Copy: functional English labels, tool hints, understandable file errors and a clear download-before-leaving instruction. “Mixed” correctly describes a multicolour vector group instead of presenting an inaccurate single fill.

## Accepted product differences

The source is a design direction rather than an exact data model. Canonical template backgrounds and safe areas remain protected; free artwork layers are individually editable. The layer list therefore shows real objects rather than pretending each template guide is editable. Whole-sheet and panel tabs share one document. Geometry dimensions follow the object's local axes, and numeric opacity is retained beside stroke width. The inspector provides ungrouping, alignment and path-point editing beyond the mock. Raster and unsupported SVG features remain embedded images.

## Interaction and runtime evidence

Eight browser regressions cover SVG groups, transforms, hiding, grouping/ungrouping, pointer and keyboard drawing, Bézier handles, stationary untouched anchors, undo/redo, PNG/JPEG, SVG-text rasterization, older sheets, mobile download, unsafe imports and reopening. Downloaded gate and flag sheets pass the real collection checks. Browser tests capture page errors and assert that none occurred.

Manual in-app browser checks covered desktop import and selection, panel switching, mobile layout and opening properties. The keyboard help uses a native modal dialog. Fonts are served locally.

## Follow-up polish

P3: live thumbnails for individual layers could improve scanning when a design contains many visually similar objects. Current names, geometry icons, visibility and lock controls remain usable.

Live 3D preview and hosted submission remain separate work in issues #34 and #35.

## Template picker refinement

The type picker now sits at the start of the canvas toolbar beside Whole sheet and the panel tabs. It uses miniature canonical SVG sheets for both the trigger and menu options, replacing the unrelated garage and pennant symbols. This supersedes the original target's placement in the document header for this control.

Evidence: [desktop](docs/designer/picker-desktop.jpg), [focused picker](docs/designer/picker-detail.jpg) and [mobile](docs/designer/picker-mobile.jpg). Desktop was captured at 1440 × 1024 CSS pixels, mobile at 390 × 844. The menu keeps the same blue selection, neutral borders and compact type hierarchy as the editor. Mobile shows the full selected type, and panel navigation scrolls horizontally. The native popover appears above the canvas without clipping. Arrow keys, Home/End, Enter, Escape, click-outside dismissal, focus restoration and unchanged-template selection are supported; the browser regression covers selection, dismissal, unchanged artwork and undo after switching templates. No actionable P0/P1/P2 findings remain.
