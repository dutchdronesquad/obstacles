# Designer visual QA

final result: passed

## Evidence and comparison setup

Source visual truth: [combined Canvas Studio and Panel Workbench target](docs/designer/target.jpg). Implementation: [desktop](docs/designer/desktop.jpg), [mobile](docs/designer/mobile.jpg) and [mobile properties](docs/designer/mobile-properties.jpg).

The source image was 1487 × 1058 pixels. The desktop browser viewport was 1440 × 1024 CSS pixels; the in-app browser screenshot was 1412 × 1004 pixels. Both were normalized to 1440 × 1024 for the [full side-by-side comparison](docs/designer/comparison.jpg), with the source on the left and implementation on the right. The [focused property comparison](docs/designer/properties-comparison.jpg) uses the same normalization and a 380 × 800 crop of each inspector. Mobile was tested at 390 × 844 CSS pixels; the capture is 382 × 827 pixels.

Desktop state: standard gate, DDS logo imported on three panels, left copy selected, guides and snap enabled. Mobile state: corner flag with imported DDS logo, both canvas and properties drawer captured. These are browser-rendered captures of the production build.

Initial comparison evidence: [before visual fixes](docs/designer/before-visual-fixes.jpg). The same source target was compared side by side before the corrections below; final comparison evidence is linked above.

## Findings and corrections

- P1, artwork colours: the first implementation comparison used a pale background and blue accent while the selected reference uses a dark gate and orange opening frame. Restored the canonical template colours. The final full comparison shows the intended contrast and artwork hierarchy.
- P2, inspector density: initial heading and section spacing pushed layer controls below the visible inspector. Reduced the heading height and section padding, and aligned the inspector width to the source proportions. The final desktop capture shows all three artwork layers. The later Layers refinement keeps only user artwork in this list.
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

The source is a design direction rather than an exact data model. Canonical template backgrounds and safe areas remain protected; free artwork layers are individually editable. The layer list shows editable artwork objects. Background, accents and guides remain in their existing sheet and canvas controls. Whole-sheet and panel tabs share one document. Geometry dimensions follow the object's local axes, and numeric opacity is retained beside stroke width. The inspector provides ungrouping, alignment and path-point editing beyond the mock. Raster and unsupported SVG features remain embedded images.

## Interaction and runtime evidence

Ten browser regressions cover SVG groups, transforms, hiding, grouping/ungrouping, pointer and keyboard drawing, Bézier handles, stationary untouched anchors, undo/redo, PNG/JPEG, SVG-text rasterization, older sheets, mobile download, unsafe imports and reopening. Downloaded gate and flag sheets pass the real collection checks. Browser tests capture page errors and assert that none occurred.

Manual in-app browser checks covered desktop import and selection, panel switching, mobile layout and opening properties. The keyboard help uses a native modal dialog. Fonts are served locally.

## Follow-up polish

The later layer refinement adds live previews for individual artwork layers. No remaining layer-specific P3 findings were identified in the compared states.

Live 3D preview and hosted submission remain separate work in issues #34 and #35.

## Template picker refinement

The type picker now sits at the start of the canvas toolbar beside Whole sheet and the panel tabs. It uses miniature canonical SVG sheets for both the trigger and menu options, replacing the unrelated garage and pennant symbols. This supersedes the original target's placement in the document header for this control.

Evidence: [desktop](docs/designer/picker-desktop.jpg), [focused picker](docs/designer/picker-detail.jpg) and [mobile](docs/designer/picker-mobile.jpg). Desktop was captured at 1440 × 1024 CSS pixels, mobile at 390 × 844. The menu keeps the same blue selection, neutral borders and compact type hierarchy as the editor. Mobile shows the full selected type, and panel navigation scrolls horizontally. The native popover appears above the canvas without clipping. Arrow keys, Home/End, Enter, Escape, click-outside dismissal, focus restoration and unchanged-template selection are supported; the browser regression covers selection, dismissal, unchanged artwork and undo after switching templates. No actionable P0/P1/P2 findings remain.

## Consistent property dropdowns

Accent style and Selected point now share the same dropdown control as the obstacle picker. Property menus match the width of their field, use a compact option row with a selection check, and retain the editor's blue focus and neutral border treatment. Menus flip above a field when needed and scroll for longer point lists.

Evidence: [desktop](docs/designer/accent-desktop.jpg), [focused accent menu](docs/designer/accent-detail.jpg) and [mobile drawer](docs/designer/accent-mobile.jpg). Desktop and mobile were checked at the same viewport sizes used above. Keyboard opening, selection, Escape, Tab navigation and focus restoration were verified. The browser regression checks exported accents, undo, gate/flag-specific choices and viewport bounds on desktop and mobile; the path editing regression exercises the new point picker. All ten browser regressions pass. No actionable P0/P1/P2 findings remain in these states.

## Layer list fidelity refinement

Initial comparison: [full view](docs/designer/layers-before-comparison.jpg) and [focused layers](docs/designer/layers-before-detail-comparison.jpg). The state matches the target: standard gate with DDS artwork and the left copy selected. The live implementation has three imported copies rather than the mock's two visible logo rows. Source and browser captures are normalized to 1440 × 1024 CSS pixels as above; the focused crops align the Layers sections, not their original vertical positions. The final focused implementation crop begins at y=735 in the normalized image.

- P1, thumbnails: generic object symbols replace the artwork previews in the target. Show real artwork previews.
- P2, row composition: the eye appears after the name and the row has no action menu. Match eye → thumbnail/name → lock → options, and make the menu operate on its own layer.
- P2, list placement and selection: long properties push layers out of view, and multiple selection has no row indication. Keep the list below independently scrolling properties and mark each selected object.

Post-fix evidence: [full view](docs/designer/layers-after-comparison.jpg), [focused comparison](docs/designer/layers-after-detail-comparison.jpg), [layer actions](docs/designer/layers-menu.jpg), [mobile drawer](docs/designer/layers-mobile.jpg) and [mobile actions](docs/designer/layers-mobile-menu.jpg). The final desktop and mobile captures use 1440 × 1024 and 390 × 844 CSS viewports, respectively, with the left DDS artwork selected. This refinement supersedes the earlier thumbnail follow-up.

The user's clarification deliberately removes the mock's fixed post, frame and guide rows: Layers now contains only imported and drawn artwork. Their controls remain under Sheet appearance and in the canvas footer. The three actual artwork copies retain their real names and stacking order; the mock's illustrative row ordering is not treated as an editable template model.

- Typography and copy: existing local Inter, compact 11 px layer names, an explicit empty state and the same functional action labels used in the editor.
- Layout rhythm: eye, actual preview/name, lock and options align across each row. The list stays below independently scrolling properties; larger lists scroll internally. Mobile uses 42 px row controls.
- Colours: neutral controls and separators with blue selection and hover states match the editor's selected design direction. Hidden layers dim their content while keeping visibility controls usable.
- Asset fidelity: thumbnails render the actual imported vectors/images or drawn geometry through the shared SVG serializer. They preserve source proportions and display artwork upright for recognition; they are not generic object symbols or approximated logos.
- Interaction: all selected rows are marked, including multi-selection. Per-layer menus select their own object before duplicating, reordering or deleting. Native popovers are remeasured after opening, so menus near the bottom flip upward. Keyboard opening, navigation, Escape and focus restoration were manually checked.

All ten browser regressions pass. The layer regression checks desktop and mobile menu bounds, previews, multi-selection, targeted actions, lock/visibility, undo, unchanged sheet settings and the real collection check on the final SVG. Browser tests assert no page errors. No actionable P0/P1/P2 differences remain after the explicit artwork-only scope adjustment.
