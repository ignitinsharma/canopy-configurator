import { it, expect } from 'vitest';
import { effectiveDpi, selectResolutionWarnings } from './resolution';
import { parseDefinition } from './definition';
import raw from '@products/canopy-tent/definition.json';
import type { ImageElement, ProductConfig } from './config';
it('calculates contain DPI from actual drawn width, including scale', () => {
  const d = parseDefinition(raw),
    g = d.variants[0]!.sectionGeometry['roof-front']!;
  const e: ImageElement = {
    id: 'i',
    type: 'image',
    assetId: 'a',
    fit: 'contain',
    opacity: 1,
    transform: {
      position: { x: 0.5, y: 0.5 },
      size: { width: 1, height: 0.1 },
      scale: 2,
      rotationDeg: 90,
    },
  };
  expect(effectiveDpi({ widthPx: 1000, heightPx: 500 }, e, g)).toBeCloseTo(
    1000 / ((g.sizeMeters.height * 0.1 * 2 * 2) / 0.0254),
  );
});
it('classifies very low resolution while keeping editing nonblocking', () => {
  const d = parseDefinition(raw);
  const config: ProductConfig = {
    schemaVersion: 1,
    productId: d.id,
    definitionRevision: d.revision,
    variantId: '5x5',
    quantity: 1,
    optionSelections: {},
    sections: {
      'roof-front': {
        backgroundColor: null,
        elements: [
          {
            id: 'i',
            type: 'image',
            assetId: 'a',
            fit: 'contain',
            opacity: 1,
            transform: {
              position: { x: 0.5, y: 0.7 },
              size: { width: 1, height: 1 },
              scale: 1,
              rotationDeg: 0,
            },
          },
        ],
      },
    },
    assets: {
      a: {
        id: 'a',
        widthPx: 100,
        heightPx: 100,
        byteSize: 100,
        mimeType: 'image/png',
        sha256: 'a'.repeat(64),
      },
    },
  };
  const warnings = selectResolutionWarnings({ config, definition: d });
  expect(warnings).toHaveLength(1);
  expect(warnings[0]?.level).toBe('blocking');
});
