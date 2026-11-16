# 3D preview

`Viewer` is lazy-loaded by the shell and reads the instance Zustand store through `ConfiguratorProvider`. No environment images or CDN decoders are requested. `useGLTF` uses `/draco/` and disables Meshopt; preload starts two animation frames after model mounting.

The canvas renders on demand with capped DPR, ACES tone mapping, local lights, directional shadows and contact shadows. Orbit, model/texture loading, selection, colors, resize and camera animation invalidate frames. Size changes replace the instance model and normalize world-space bounding-box width, ground level and x/z center. The source GLBs use both leg/mechanism and leg5/mechanism3 node names; bindings list all aliases.

`prepareModel` owns cloned geometry/material/texture GPU resources and disposes them on unmount. The immutable, bounded three-model useGLTF cache retains original CPU resources for reuse/preloading; it is never disposed by one mounted instance. Texture image sources are shared read-only; cloned texture wrappers are owned by each instance.

`useAtlasTexture(variantId)` returns an `AtlasApi` after effect allocation. `getCanvas()` returns the 2048-square artwork canvas; `markDirty(sectionId?)` copies current artwork to the texture presentation canvas and invalidates rendering. The placeholder repaints all content only when the fabric base palette changes. Selection and `?debug=atlas` are drawn on a separate presentation canvas, so they never enter real artwork. Quarter-turn arrows/labels use the same mapping as UV hit-testing. Actual user artwork compositing is deferred.

`flipY=false`, sRGB and anisotropy capped at 8 are explicit. The hook is disposed on variant change. A full atlas GPU upload currently accompanies each dirty update; partial CPU composition comes later.

Use a `ref<ViewerHandle>` on `Viewer` inside the provider. `await ref.current.captureViews({width:1024,height:1024})` returns front/back/left/right/top PNG data URLs for the currently loaded variant. Dimensions must be integers 1–4096. Captures temporarily suppress selection/debug presentation, use a separate camera and multisampled render target, explicitly render/read pixels, flip readback rows and restore renderer target/viewport/scissor in finally. The visible camera and controls never move. Calls before model readiness reject.

Run `pnpm dev` and open `http://localhost:5173/?debug=atlas`. Choose each Size and all eight Selected section values. Confirm labels and arrows appear upright on the corresponding tent side. Click fabric to verify section selection; drag/scroll to orbit/zoom. On mobile select the 3D tab; switch back to Options to change size. `?embed=1&debug=atlas` also exercises iframe presentation.

Runtime hosting must serve public models/Draco files from the same origin. Draco uses a local WASM decoder and a blob worker; restrictive CSPs need the corresponding WASM execution and blob worker permissions. Model binaries are committed only to the private repository. No 2D editing or production PDF generation is implemented in this feature.
