import { atlasPolygon, type Geometry } from '../geometry';
/** PPM fits the upright local canvas to this section's atlas footprint. A quarter
 * turn swaps atlas dimensions. Ceil rounding adds at most one local pixel. */
export function sectionPixelsPerMeter(
  g: Geometry,
  atlasWidth = 2048,
  atlasHeight = 2048,
) {
  const w = (g.uvRect.u1 - g.uvRect.u0) * atlasWidth,
    h = (g.uvRect.v1 - g.uvRect.v0) * atlasHeight;
  const quarter = g.atlasRotationDeg === 90 || g.atlasRotationDeg === 270;
  return Math.max(
    (quarter ? h : w) / g.sizeMeters.width,
    (quarter ? w : h) / g.sizeMeters.height,
  );
}
/** Source always upright; rotate first then stretch into top-origin UV rect.
 * Clip BOTH clear and draw to the rotated polygon: roof rectangles overlap. */
export function compositeSectionIntoAtlas(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  localCanvas: CanvasImageSource,
) {
  const width = ctx.canvas.width,
    height = ctx.canvas.height;
  const { u0, v0, u1, v1 } = g.uvRect;
  const w = (u1 - u0) * width,
    h = (v1 - v0) * height;
  ctx.save();
  try {
    ctx.beginPath();
    atlasPolygon(g).forEach(([x, y], i) =>
      i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height),
    );
    ctx.closePath();
    ctx.clip();
    ctx.clearRect(u0 * width, v0 * height, w, h);
    ctx.translate(((u0 + u1) * width) / 2, ((v0 + v1) * height) / 2);
    ctx.rotate((g.atlasRotationDeg * Math.PI) / 180);
    const quarter = g.atlasRotationDeg === 90 || g.atlasRotationDeg === 270;
    ctx.drawImage(
      localCanvas,
      -(quarter ? h : w) / 2,
      -(quarter ? w : h) / 2,
      quarter ? h : w,
      quarter ? w : h,
    );
  } finally {
    ctx.restore();
  }
}
