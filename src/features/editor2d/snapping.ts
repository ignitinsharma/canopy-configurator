import type { Geometry } from '@core/geometry';
import { clipPolygon } from '@core/geometry';
import {
  clampCenter,
  closestOnSegment,
  normalizedToLocal,
  localToNormalized,
  offsetPolygon,
  type XY,
} from './coords';
export interface SnapGuide {
  a: XY;
  b: XY;
  kind: 'center' | 'edge' | 'safe';
}
export function snapCenter(
  point: XY,
  g: Geometry,
  {
    enabled = true,
    alt = false,
    scale = 1,
    threshold = 6,
    marginMeters = 0.025,
  }: {
    enabled?: boolean;
    alt?: boolean;
    scale?: number;
    threshold?: number;
    marginMeters?: number;
  } = {},
): { position: XY; guides: SnapGuide[] } {
  if (!enabled || alt) return { position: clampCenter(point, g), guides: [] };
  let p = normalizedToLocal(point, g);
  const guides: SnapGuide[] = [],
    center = normalizedToLocal({ x: 0.5, y: 0.5 }, g);
  const tolerance = threshold / scale;
  if (Math.abs(p.x - center.x) <= tolerance) {
    p = { ...p, x: center.x };
    guides.push({ a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 }, kind: 'center' });
  }
  if (Math.abs(p.y - center.y) <= tolerance) {
    p = { ...p, y: center.y };
    guides.push({ a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 }, kind: 'center' });
  }
  let best: { point: XY; guide: SnapGuide } | null = null,
    distance = tolerance;
  for (const [polygon, kind] of [
    [clipPolygon(g), 'edge'],
    [offsetPolygon(g, marginMeters), 'safe'],
  ] as const) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!,
        pa = normalizedToLocal({ x: a[0], y: a[1] }, g),
        pb = normalizedToLocal({ x: b[0], y: b[1] }, g);
      const projected = closestOnSegment(p, pa, pb),
        d = Math.hypot(projected.x - p.x, projected.y - p.y);
      if (d < distance) {
        distance = d;
        best = {
          point: projected,
          guide: { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, kind },
        };
      }
    }
  }
  if (best) {
    p = best.point;
    guides.push(best.guide);
  }
  return { position: clampCenter(localToNormalized(p, g), g), guides };
}
