import { afterEach, it, expect, vi } from 'vitest';
import { createConfigStore } from '@core/store';
import { parseDefinition } from '@core/definition';
import raw from '@products/canopy-tent/definition.json';
import { createEditorSurfaces } from './surfaces';
import type { Configurator } from '../ConfiguratorContext';
vi.mock('@core/render/section', () => ({ renderSection: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it('logs dev-only render counts and leaves seven unchanged thumbnails untouched', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  const definition = parseDefinition(raw),
    instance: Configurator = {
      ...createConfigStore(definition, {
        schemaVersion: 1,
        productId: definition.id,
        definitionRevision: definition.revision,
        variantId: '5x5',
        quantity: 1,
        optionSelections: Object.fromEntries(
          definition.optionGroups.map((g) => [g.id, g.defaultValue]),
        ),
        sections: Object.fromEntries(
          definition.sections.map((s) => [
            s.id,
            { backgroundColor: null, elements: [] },
          ]),
        ),
        assets: {},
      }),
      assets: { upload: vi.fn(), resolve: vi.fn() },
    };
  const surfaces = createEditorSurfaces(instance, '5x5');
  surfaces.flush();
  const before = surfaces.getRenderCounts();
  expect(Object.keys(before)).toHaveLength(9);
  instance.actions.setSectionBackground('roof-front', '#112233');
  surfaces.flush();
  const after = surfaces.getRenderCounts();
  expect(after['art:roof-front']).toBe(before['art:roof-front']! + 1);
  expect(after['thumb:roof-front']).toBe(before['thumb:roof-front']! + 1);
  for (const key of Object.keys(before))
    if (!key.endsWith(':roof-front')) expect(after[key]).toBe(before[key]);
  console.info(
    'Editor dev render-count delta',
    Object.fromEntries(
      Object.keys(after).map((key) => [key, after[key]! - before[key]!]),
    ),
  );
  instance.actions.selectElement(null);
  surfaces.flush();
  expect(surfaces.getRenderCounts()).toEqual(after);
  const published = surfaces.get('art', 'roof-front');
  surfaces.dispose();
  expect(published.canvas!.width).toBeGreaterThan(0);
});
