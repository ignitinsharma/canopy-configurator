import { expect, it } from 'vitest';
import { parseDefinition } from '@core/definition';
import raw from '@products/canopy-tent/definition.json';
import { containsPoint, clipPolygon } from '@core/geometry';
import {
  normalizedToLocal,
  localToNormalized,
  normalizedToMeters,
  metersToNormalized,
  localToStage,
  stageToLocal,
  rotate,
  clampCenter,
  offsetPolygon,
  fitView,
  zoomAt,
  localSize,
} from './coords';
import { snapCenter } from './snapping';
import { commandForKey } from '../keyboard';
const definition = parseDefinition(raw);
it.each(definition.variants)(
  'round-trips section/local/stage/meters for $id',
  (variant) => {
    for (const g of Object.values(variant.sectionGeometry)) {
      const p = { x: 0.3, y: 0.7 },
        view = { x: 50, y: -32, scale: 2.3 };
      const local = normalizedToLocal(p, g),
        meters = normalizedToMeters(p, g);
      expect(localToNormalized(local, g).x).toBeCloseTo(p.x);
      expect(metersToNormalized(meters, g).y).toBeCloseTo(p.y);
      expect(stageToLocal(localToStage(local, view), view).x).toBeCloseTo(
        local.x,
      );
      const fitted = fitView(360, 400, g),
        size = localSize(g);
      expect(size.width * fitted.scale).toBeLessThanOrEqual(360);
      expect(size.height * fitted.scale).toBeLessThanOrEqual(400);
    }
  },
);
it('rotates clockwise in screen coordinates and preserves a zoom anchor', () => {
  const p = rotate({ x: 1, y: 0 }, 90);
  expect(p.x).toBeCloseTo(0);
  expect(p.y).toBeCloseTo(1);
  const original = { x: 20, y: 50, scale: 0.8 },
    anchor = { x: 210, y: 110 },
    next = zoomAt(original, anchor, 2);
  expect(stageToLocal(anchor, next)).toEqual(stageToLocal(anchor, original));
});
it('clamps centers to the actual printable triangle and offsets margins in meters', () => {
  const g = definition.variants[0]!.sectionGeometry['roof-front']!;
  for (const point of [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -5, y: 2 },
    { x: 0.8, y: 0.1 },
  ]) {
    const p = clampCenter(point, g);
    expect(containsPoint(clipPolygon(g), [p.x, p.y])).toBe(true);
  }
  for (const p of offsetPolygon(g, 0.025))
    expect(containsPoint(clipPolygon(g), p)).toBe(true);
  const rect = definition.variants[0]!.sectionGeometry['valance-front']!;
  const safe = offsetPolygon(rect, 0.025);
  expect(safe[0]?.[0]).toBeCloseTo(0.025 / rect.sizeMeters.width);
  expect(safe[0]?.[1]).toBeCloseTo(0.025 / rect.sizeMeters.height);
});
it('snaps to center, printable edge and safe edge with a screen-pixel threshold; Alt bypasses snapping', () => {
  const g = definition.variants[0]!.sectionGeometry['valance-front']!;
  expect(snapCenter({ x: 0.499, y: 0.4 }, g).position.x).toBe(0.5);
  expect(snapCenter({ x: 0.499, y: 0.4 }, g, { alt: true }).position.x).toBe(
    0.499,
  );
  const margin = 0.025 / g.sizeMeters.width;
  expect(snapCenter({ x: margin + 0.001, y: 0.7 }, g).position.x).toBeCloseTo(
    margin,
  );
  expect(
    snapCenter({ x: 0.001, y: 0.7 }, g, { marginMeters: 0.1 }).position.x,
  ).toBeCloseTo(0);
  expect(
    snapCenter({ x: 0.499, y: 0.4 }, g, { scale: 20 }).guides,
  ).toHaveLength(0);
});
it('maps keyboard commands once with platform modifiers', () => {
  expect(commandForKey('z', true)).toBe('undo');
  expect(commandForKey('Z', true, true)).toBe('redo');
  expect(commandForKey('d', true)).toBe('duplicate');
  expect(commandForKey('ArrowLeft')).toBe('left');
  expect(commandForKey('a')).toBeNull();
});
