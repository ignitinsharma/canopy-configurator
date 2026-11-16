import { expect, it } from 'vitest';
import { parseDefinition } from './definition';
import raw from '@products/canopy-tent/definition.json';
import { sectionFromUv, sectionToUv, normalizationForBounds } from './geometry';
it.each(parseDefinition(raw).variants)(
  'raycasts the clipped sections of $id',
  (variant) => {
    for (const [id, g] of Object.entries(variant.sectionGeometry)) {
      const [u, v] = sectionToUv(g, [
        0.5,
        g.shape === 'triangle' ? 2 / 3 : 0.5,
      ]);
      expect(sectionFromUv(variant.sectionGeometry, u, v)).toBe(id);
      if (g.shape === 'triangle') {
        const corner = sectionToUv(g, [0.03, 0.03]);
        expect(sectionFromUv({ [id]: g }, ...corner)).toBeNull();
      }
    }
    for (const point of [
      [0, 0],
      [1, 1],
      [0.5, 0.5],
      [-1, 0.5],
      [NaN, 0],
    ] as const)
      expect(
        sectionFromUv(variant.sectionGeometry, point[0], point[1]),
      ).toBeNull();
  },
);
it('normalizes an offset, mis-scaled model to ground and target width', () => {
  const result = normalizationForBounds([2, -3, 4], [3, 2, 6], 1.98);
  expect(result).toEqual({
    scale: 1.98,
    position: [-4.95, 5.9399999999999995, -9.9],
  });
  expect(-3 * result.scale + result.position[1]).toBeCloseTo(0);
  expect(((2 + 3) * result.scale) / 2 + result.position[0]).toBeCloseTo(0);
  expect(() => normalizationForBounds([0, 0, 0], [0, 1, 1], 2)).toThrow();
});
