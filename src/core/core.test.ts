import { describe, it, expect } from 'vitest';
import { ProductConfigSchema, type ProductConfig } from './config';
import { serializeConfig } from './serialization';
import { loadConfig } from './migrations';
import { containsPoint, physicalFontSize } from './geometry';
const config: ProductConfig = {
  schemaVersion: 1,
  productId: 'test',
  definitionRevision: 'v1',
  variantId: 'small',
  quantity: 1,
  optionSelections: { extras: ['b', 'a'] },
  sections: { front: { backgroundColor: null, elements: [] } },
  assets: {},
};
describe('config interchange', () => {
  it('round trips without mutation', () => {
    expect(loadConfig(serializeConfig(config))).toEqual({
      ...config,
      optionSelections: { extras: ['a', 'b'] },
    });
    expect(config.optionSelections.extras).toEqual(['b', 'a']);
  });
  it('rejects future or missing versions and extra properties', () => {
    expect(() => loadConfig({ ...config, schemaVersion: 2 })).toThrow();
    expect(() => loadConfig({ ...config, schemaVersion: undefined })).toThrow();
    expect(() =>
      ProductConfigSchema.parse({ ...config, price: 100 }),
    ).toThrow();
  });
  it('canonicalizes option sets independently of input order', () => {
    expect(serializeConfig(config)).toBe(
      serializeConfig({ ...config, optionSelections: { extras: ['a', 'b'] } }),
    );
  });
  it('rejects oversized JSON before parsing', () => {
    expect(() => loadConfig(' '.repeat(1048577))).toThrow('CONFIG_TOO_LARGE');
  });
});
describe('physical geometry', () => {
  it('clips to triangular roof geometry including edges', () => {
    const triangle = [
      [0.5, 0],
      [1, 1],
      [0, 1],
    ] as const;
    expect(containsPoint(triangle, [0.5, 0.5])).toBe(true);
    expect(containsPoint(triangle, [0, 0])).toBe(false);
    expect(containsPoint(triangle, [0.5, 0])).toBe(true);
  });
  it('scales physical font size with the selected section', () => {
    expect(physicalFontSize(0.1, 2, 25.4)).toBeCloseTo(144);
  });
});
