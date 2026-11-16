import type { z } from 'zod';
import type { GeometrySchema } from './definition';
import type { DesignElement } from './config';
export type Geometry = z.infer<typeof GeometrySchema>;
export type Point = readonly [number, number];
export function clipPolygon(g: Pick<Geometry, 'shape'>): Point[] {
  return g.shape === 'triangle'
    ? [
        [0.5, 0],
        [1, 1],
        [0, 1],
      ]
    : [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
}
export function sectionToUv(g: Geometry, [x, y]: Point): Point {
  const r = g.atlasRotationDeg;
  const [rx, ry] =
    r === 90
      ? [1 - y, x]
      : r === 180
        ? [1 - x, 1 - y]
        : r === 270
          ? [y, 1 - x]
          : [x, y];
  const { u0, v0, u1, v1 } = g.uvRect;
  return [u0 + rx! * (u1 - u0), v0 + ry! * (v1 - v0)];
}
export function atlasPolygon(g: Geometry): Point[] {
  return clipPolygon(g).map((p) => sectionToUv(g, p));
}
/** Separating-axis test for convex printable shapes. Touching edges are allowed. */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!,
        q = polygon[(i + 1) % polygon.length]!;
      const axis: Point = [-(q[1] - p[1]), q[0] - p[0]];
      const project = (points: Point[]) =>
        points.map((v) => v[0] * axis[0] + v[1] * axis[1]);
      const pa = project(a),
        pb = project(b);
      if (
        Math.min(Math.max(...pa), Math.max(...pb)) -
          Math.max(Math.min(...pa), Math.min(...pb)) <=
        1e-10
      )
        return false;
    }
  return true;
}
export function sectionAspectRatio(g: Geometry) {
  return g.sizeMeters.width / g.sizeMeters.height;
}
export function modelScaleForWidth(
  realWidthMeters: number,
  boundingBoxWidth: number,
) {
  if (
    !Number.isFinite(boundingBoxWidth) ||
    boundingBoxWidth <= 0 ||
    !Number.isFinite(realWidthMeters) ||
    realWidthMeters <= 0
  )
    throw new Error('INVALID_MODEL_WIDTH');
  return realWidthMeters / boundingBoxWidth;
}
export function elementCorners(e: DesignElement): Point[] {
  const { position: p, size, scale, rotationDeg } = e.transform;
  const angle = (rotationDeg * Math.PI) / 180;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => {
    const dx = (x! * size.width * scale) / 2,
      dy = (y! * size.height * scale) / 2;
    return [
      p.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      p.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    ] as Point;
  });
}
export function containsPoint(
  polygon: readonly Point[],
  [x, y]: Point,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
    if (
      Math.abs(cross) < 1e-9 &&
      x >= Math.min(a[0], b[0]) &&
      x <= Math.max(a[0], b[0]) &&
      y >= Math.min(a[1], b[1]) &&
      y <= Math.max(a[1], b[1])
    )
      return true;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function physicalFontSize(
  fontSize: number,
  scale: number,
  heightCm: number,
) {
  return (fontSize * scale * heightCm * 72) / 2.54;
}
export function imageDpi(
  widthPx: number,
  heightPx: number,
  e: DesignElement,
  g: Geometry,
) {
  const width =
    e.transform.size.width * e.transform.scale * (g.sizeMeters.width * 100);
  const height =
    e.transform.size.height * e.transform.scale * (g.sizeMeters.height * 100);
  return Math.max(widthPx / (width / 2.54), heightPx / (height / 2.54));
}

/** UV coordinates are the raw glTF/top-origin coordinates (CanvasTexture.flipY=false).
 * Test clipped polygons, not overlapping roof bounding rectangles. */
export function sectionFromUv(
  geometry: Record<string, Geometry>,
  u: number,
  v: number,
): string | null {
  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    u < 0 ||
    u > 1 ||
    v < 0 ||
    v > 1
  )
    return null;
  for (const [id, section] of Object.entries(geometry))
    if (containsPoint(atlasPolygon(section), [u, v])) return id;
  return null;
}
export function normalizationForBounds(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  realWidth: number,
  axis: 'x' | 'z' = 'x',
) {
  const scale = modelScaleForWidth(
    realWidth,
    max[axis === 'x' ? 0 : 2] - min[axis === 'x' ? 0 : 2],
  );
  return {
    scale,
    position: [
      (-(min[0] + max[0]) * scale) / 2,
      -min[1] * scale,
      (-(min[2] + max[2]) * scale) / 2,
    ] as [number, number, number],
  };
}
