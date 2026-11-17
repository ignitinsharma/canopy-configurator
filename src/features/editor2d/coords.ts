import type { DesignElement } from '@core/config';
import {
  clipPolygon,
  containsPoint,
  type Geometry,
  type Point,
} from '@core/geometry';
export const EDITOR_PX_PER_METER = 400;
export interface XY {
  x: number;
  y: number;
}
export interface View extends XY {
  scale: number;
}
export const localSize = (g: Geometry) => ({
  width: g.sizeMeters.width * EDITOR_PX_PER_METER,
  height: g.sizeMeters.height * EDITOR_PX_PER_METER,
});
export function normalizedToMeters(p: XY, g: Geometry): XY {
  return { x: p.x * g.sizeMeters.width, y: p.y * g.sizeMeters.height };
}
export function metersToNormalized(p: XY, g: Geometry): XY {
  return { x: p.x / g.sizeMeters.width, y: p.y / g.sizeMeters.height };
}
export function normalizedToLocal(p: XY, g: Geometry): XY {
  const s = localSize(g);
  return { x: p.x * s.width, y: p.y * s.height };
}
export function localToNormalized(p: XY, g: Geometry): XY {
  const s = localSize(g);
  return { x: p.x / s.width, y: p.y / s.height };
}
export function localToStage(p: XY, view: View): XY {
  return { x: view.x + p.x * view.scale, y: view.y + p.y * view.scale };
}
export function stageToLocal(p: XY, view: View): XY {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}
export function rotate(p: XY, degrees: number): XY {
  const a = (degrees * Math.PI) / 180;
  return {
    x: p.x * Math.cos(a) - p.y * Math.sin(a),
    y: p.x * Math.sin(a) + p.y * Math.cos(a),
  };
}
export function elementBox(e: DesignElement, g: Geometry) {
  const s = localSize(g),
    center = normalizedToLocal(e.transform.position, g);
  return {
    ...center,
    width: e.transform.size.width * s.width,
    height: e.transform.size.height * s.height,
    scale: e.transform.scale,
    rotation: e.transform.rotationDeg,
  };
}
export function elementCorners(e: DesignElement, g: Geometry): XY[] {
  const b = elementBox(e, g);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => {
    const r = rotate(
      { x: (x! * b.width * b.scale) / 2, y: (y! * b.height * b.scale) / 2 },
      b.rotation,
    );
    return { x: b.x + r.x, y: b.y + r.y };
  });
}
export function closestOnSegment(p: XY, a: XY, b: XY): XY {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
export function clampCenter(p: XY, g: Geometry): XY {
  const polygon = clipPolygon(g);
  if (containsPoint(polygon, [p.x, p.y])) return p;
  const local = normalizedToLocal(p, g);
  const points = polygon.map(([x, y]) => normalizedToLocal({ x, y }, g));
  let nearest = points[0]!,
    distance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = closestOnSegment(
      local,
      points[i]!,
      points[(i + 1) % points.length]!,
    );
    const d = Math.hypot(point.x - local.x, point.y - local.y);
    if (d < distance) {
      distance = d;
      nearest = point;
    }
  }
  const normalized = localToNormalized(nearest, g);
  return {
    x: Math.max(0, Math.min(1, normalized.x)),
    y: Math.max(0, Math.min(1, normalized.y)),
  };
}
/** Physical inward/outward offsets of convex edges, preserving true meter margins. */
export function offsetPolygon(g: Geometry, meters: number): Point[] {
  const poly = clipPolygon(g).map(([x, y]) => normalizedToMeters({ x, y }, g));
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!,
      dx = q.x - p.x,
      dy = q.y - p.y,
      len = Math.hypot(dx, dy);
    return {
      x: -dy / len,
      y: dx / len,
      c: (-dy * p.x + dx * p.y) / len + meters,
    };
  });
  const result: Point[] = [];
  for (let i = 0; i < lines.length; i++) {
    const a = lines[(i + lines.length - 1) % lines.length]!,
      b = lines[i]!,
      det = a.x * b.y - b.x * a.y;
    if (Math.abs(det) < 1e-10) return [];
    const point = metersToNormalized(
      { x: (a.c * b.y - b.c * a.y) / det, y: (a.x * b.c - b.x * a.c) / det },
      g,
    );
    result.push([point.x, point.y]);
  }
  if (meters > 0 && result.some((p) => !containsPoint(clipPolygon(g), p)))
    return [];
  return result;
}
export function fitView(
  width: number,
  height: number,
  g: Geometry,
  padding = 32,
): View {
  const size = localSize(g),
    scale = Math.max(
      0.05,
      Math.min(
        (width - padding * 2) / size.width,
        (height - padding * 2) / size.height,
      ),
    );
  return {
    x: (width - size.width * scale) / 2,
    y: (height - size.height * scale) / 2,
    scale,
  };
}
export function zoomAt(view: View, anchor: XY, scale: number): View {
  const value = Math.max(0.1, Math.min(8, scale)),
    local = stageToLocal(anchor, view);
  return {
    scale: value,
    x: anchor.x - local.x * value,
    y: anchor.y - local.y * value,
  };
}
export function normalizedRotation(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
