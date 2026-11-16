import type { z } from 'zod';
import type { GeometrySchema } from './definition';
import type { DesignElement } from './config';
export type Geometry = z.infer<typeof GeometrySchema>;
export type Point = readonly [number, number];
export function sectionToUv(g: Geometry, [x, y]: Point): Point {
  const [a, b, , d] = g.uvCorners;
  return [
    a[0] + x * (b[0] - a[0]) + y * (d[0] - a[0]),
    a[1] + x * (b[1] - a[1]) + y * (d[1] - a[1]),
  ];
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
    e.transform.size.width * e.transform.scale * g.printableArea.width;
  const height =
    e.transform.size.height * e.transform.scale * g.printableArea.height;
  return Math.max(widthPx / (width / 2.54), heightPx / (height / 2.54));
}
