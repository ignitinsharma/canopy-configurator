import { expect, it } from 'vitest';
import raw from './definition.json';
import measured from './sections.measured.json';
import { parseDefinition } from '@core/definition';
import {
  atlasPolygon,
  clipPolygon,
  polygonsOverlap,
  sectionToUv,
  sectionAspectRatio,
  modelScaleForWidth,
} from '@core/geometry';
it('includes all 24 measured sections without changing measurements', () => {
  const d = parseDefinition(raw);
  expect(d.variants.map((v) => v.id)).toEqual(['5x5', '6.5x6.5', '8x8']);
  for (const variant of d.variants) {
    const rows = measured[variant.id as keyof typeof measured];
    expect(Object.keys(variant.sectionGeometry).sort()).toEqual(
      [
        'roof-front',
        'roof-back',
        'roof-left',
        'roof-right',
        'valance-front',
        'valance-back',
        'valance-left',
        'valance-right',
      ].sort(),
    );
    expect(variant.atlas).toMatchObject({ flipY: false, uvOrigin: 'top-left' });
    for (const row of rows) {
      const g = variant.sectionGeometry[row.id]!;
      expect(g).toMatchObject({
        uvRect: row.uvRect,
        atlasRotationDeg: row.atlasRotationDeg,
        sizeMeters: row.sizeMeters,
        shape: row.shape,
      });
      expect(g.uvRect.u0).toBeGreaterThanOrEqual(0);
      expect(g.uvRect.v0).toBeGreaterThanOrEqual(0);
      expect(g.uvRect.u1).toBeLessThanOrEqual(1);
      expect(g.uvRect.v1).toBeLessThanOrEqual(1);
      expect(sectionAspectRatio(g)).toBeCloseTo(
        row.sizeMeters.width / row.sizeMeters.height,
      );
      expect(clipPolygon(g)).toHaveLength(row.shape === 'triangle' ? 3 : 4);
    }
    const geometries = Object.values(variant.sectionGeometry);
    for (let i = 0; i < geometries.length; i++)
      for (let j = i + 1; j < geometries.length; j++)
        expect(
          polygonsOverlap(
            atlasPolygon(geometries[i]!),
            atlasPolygon(geometries[j]!),
          ),
        ).toBe(false);
  }
  expect(d.variants.map((v) => v.realWidthMeters)).toEqual([1.524, 1.98, 2.44]);
  expect(d.materialResolution?.strategy).toBe('material-name');
});
it('uses top-origin clockwise atlas rotations', () => {
  const g = parseDefinition(raw).variants[0]!.sectionGeometry['roof-left']!;
  expect(sectionToUv(g, [0.5, 0])).toEqual([
    g.uvRect.u1,
    (g.uvRect.v0 + g.uvRect.v1) / 2,
  ]);
  expect(modelScaleForWidth(1.98, 1.52)).toBeCloseTo(1.98 / 1.52);
  expect(() => modelScaleForWidth(1.98, 0)).toThrow();
});
it('rejects missing sections, inverted bounds and overlapping printable shapes', () => {
  const missing = structuredClone(raw);
  delete (missing.variants[0]!.sectionGeometry as Record<string, unknown>)[
    'roof-front'
  ];
  expect(() => parseDefinition(missing)).toThrow('INCOMPLETE_GEOMETRY');
  const bounds = structuredClone(raw);
  bounds.variants[0]!.sectionGeometry['roof-front'].uvRect.u1 = 2;
  expect(() => parseDefinition(bounds)).toThrow();
  const overlap = structuredClone(raw);
  overlap.variants[0]!.sectionGeometry['roof-back'] = {
    ...overlap.variants[0]!.sectionGeometry['roof-front'],
  };
  expect(() => parseDefinition(overlap)).toThrow(
    'OVERLAPPING_PRINTABLE_REGIONS',
  );
});
