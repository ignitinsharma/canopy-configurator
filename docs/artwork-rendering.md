# Shared artwork rendering

`src/core/render/section.ts` is the single drawing implementation. The atlas uses it today; the future Konva visual layer and PDF section previews must call it on local canvases rather than duplicate text/image drawing. It accepts an identity 2D context, measured geometry, section config, decoded image sources, loaded font definitions and pixels per meter. It has no React, store, asset-loading or font-loading dependencies.

Coordinates are local top-left pixels derived from measured meters. Elements are centered on normalized positions, rotated clockwise and uniformly scaled; their normalized size bounds text wrapping and contain-fit images. Text uses physical section height times normalized fontSize, explicit newlines, word/long-word wrapping, alignment and line-height. All drawing is clipped to the printable shape. Images use opacity and contain fit. Missing assets draw a red placeholder. Array order is paint order.

## Atlas updates

The atlas is 2048 square and initially filled everywhere with the fabric palette color, including gaps/hem strips. Each local section canvas is cached for the mounted variant. For rectangle pixel dimensions W,H, upright dimensions are W,H at rotations 0/180 and H,W at 90/270. Pixels per meter is the maximum of uprightPixelWidth/physicalWidth and uprightPixelHeight/physicalHeight. Local canvas dimensions are ceil(meters * pixelsPerMeter), avoiding undersampling either atlas axis.

Composition clips both clearing and painting to the rotated printable polygon. Roof bounding rectangles overlap, so clearing their whole rectangles is forbidden. The local canvas is translated to the UV-rectangle center, rotated and fitted to its bounds. CanvasTexture uses flipY=false and top-origin UV bounds.

The compositor compares sections[id] references preserved by the Zustand store. Only changed sections, sections using newly ready fonts/assets, or all sections after a base-color change become dirty. Selection/history-only changes do not rerender local artwork. All presentation changes and dirty artwork share one requestAnimationFrame callback, one texture update and one R3F invalidate. Local canvases and the artwork atlas are CPU-backed to avoid GPU-to-CPU synchronization; the separate presentation canvas remains GPU-friendly.

Selection/debug graphics are painted onto the presentation canvas, never the artwork atlas. captureViews suppresses overlays and explicitly flushes pending artwork before offscreen rendering; the normal requestAnimationFrame path coalesces edits. Font-loading sections wait for their fonts, and rerender when load settles; failed fonts fall back to the renderer's sans-serif font. Missing images are visible placeholders until resolution succeeds.

## Fonts and images

Five Fontsource Latin regular faces are bundled under public/fonts with licenses: Inter, Montserrat, Oswald, Playfair Display and Roboto Slab. Run pnpm fonts:sync after updating their packages. A per-viewer font manager loads only used faces via FontFace and awaits document.fonts.load. No Google Fonts or external CSS is requested.

Uploads honor definition type, byte and source-dimension limits. PNG/JPEG/WebP content signatures are checked. SVG uses a DOMPurify allowlist for vector shapes, gradients, clipping and text; scripts, external resources/styles, embedded images, animation and foreignObject are not supported. SVG is rasterized before storage and never inserted as live page markup.

Uploads normalize orientation and downscale to a maximum 2048-pixel longest side, then store a PNG in IndexedDB. Original blobs are deliberately discarded: this bounds local storage and avoids keeping unsanitized SVG. This stage provides artwork previews, not original-resolution print masters. Stored dimensions and hashes describe normalized bytes. Existing config metadata names remain id, mimeType, widthPx, heightPx, byteSize and sha256. JSON contains references/metadata only.

The ImageBitmap cache is keyed by asset ID and decodes once per live ID. Removing the last current reference closes the bitmap, including late asynchronous completions. History retains references and IndexedDB bytes, so undo can resolve an image again. Failed asset resolutions cannot crash drawing.

Effective DPI uses pixel width divided by physical inches of actual contain-fitted drawn width, including uniform scale. Rotation does not change physical resolution. Definition defaults are warning below 100 DPI and critical below 50 DPI, with 150 DPI recommended. Both are advisory in the current controls; no checkout blocking is implemented here.

## Editing and history

Controls support all eight sections, inherited/custom backgrounds, text, uploads/drop, layer selection/reordering/deletion/duplication, transforms, text properties, image opacity and copy/apply-to-all. Bulk actions are atomic commits with one history entry and fresh element IDs per target. Pointer and keyboard slider gestures group edits through beginTransaction/commitTransaction; pointer cancel rolls back. Undo/redo shortcuts ignore focused form fields so native text editing remains intact.

## Measurements

Measured in headless local Chrome using a 2048 atlas, a loaded Inter font, two-line text and a cached 2048-square PNG ImageBitmap. Each of all 24 sections ran five warmups plus 30 samples, using performance.now around renderSection and compositeSectionIntoAtlas, followed by a one-pixel getImageData to force completed raster work.

- Section medians: 0.7–5.2 ms.
- Worst section p95: 6.7 ms.
- Maximum observed sample: 7.4 ms.

These measurements include raster completion/readback overhead but exclude upload/decode/font loading, texture presentation copy and the WebGL GPU upload. They are device-dependent, not a 16 ms guarantee for every device or maximum 20-element design. Initial GPU-backed scratch-canvas benchmarks were rejected as unlike the actual decoded-upload pipeline.

## Manual verification

Run pnpm dev and open /?debug=atlas. For each size, add distinct text on all eight sections. Use a left/right-asymmetric PNG or SVG logo and inspect every side: readable, upright, unmirrored, and no neighboring roof bleed. Change backgrounds and font faces. Check copy/apply-to-all, layer order, duplicate/delete, one-step undo for a slider drag or bulk copy, redo and keyboard shortcuts. Confirm 3D clicks select the same panel section. On mobile use Options and 3D tabs. The Konva editor and PDF generator remain future consumers of the shared renderer.
