# Canopy tent

`sections.measured.json` is the supplied measurement source; `definition.json` contains an exact copy of each size's eight geometries plus product choices and integration references. Tests prevent drift. Printable dimensions are meters and remain independent of model scaling.

UV rectangle bounds are normalized image coordinates with v measured from the TOP. The future CanvasTexture must use `flipY = false`. `atlasRotationDeg` rotates upright section content clockwise in normalized atlas space before fitting into its rectangle. Roofs clip to an isosceles triangle with apex (.5,0) and eave/base from (0,1) to (1,1); valances clip to the unit rectangle. Quarter-turn rotations swap atlas axes, not physical printable width/height.

Roof bounding rectangles overlap in the supplied source. Their rotated triangle interiors do not overlap. Validation therefore tests actual printable polygons, not rectangle bounding boxes. Compositors must clip clearing as well as drawing to the printable polygon, or repaint the whole atlas; clearing a roof bounding rectangle can erase a neighboring roof.

Resolve primitives by MATERIAL NAME, never array index: `fabric_Mat` is printable outer fabric, `Inner_fabric` is plain inner fabric, `Metal_mat` is frame metal. Primitive order differs between files. Target printable node is `fabric`; frame nodes are `leg` and `mechanism`. Preserve outer normal/roughness maps.

Normalize all models uniformly from their world-space bounding-box width along x to `realWidthMeters`: 1.524, 1.98 and 2.44 respectively. The 6.5 GLB mesh is mis-scaled. Never apply this normalization factor to the independently measured `sizeMeters`. No viewer is implemented here.

Model URLs reserve future optimized files in `public/models`; original GLBs remain local. Five local regular font faces and optimized models are supplied. Palettes, accessories and print thresholds remain proposed catalog defaults. Prices and Shopify mappings are resolved by services, not this definition. A 2048-square preview atlas is not a print master.
