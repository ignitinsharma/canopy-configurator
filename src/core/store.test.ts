import { it, expect } from 'vitest';
import { parseDefinition } from './definition';
import { createConfigStore } from './store';
import type { ProductConfig, TextElement } from './config';
const geometry = {
  uvRect: { u0: 0, v0: 0, u1: 1, v1: 1 },
  atlasRotationDeg: 0,
  sizeMeters: { width: 1, height: 1 },
  shape: 'rect',
  target: { nodeName: 'surface', materialName: 'print', uvSet: 0 },
};
const definition = {
  schemaVersion: 1,
  id: 'generic',
  revision: 'v1',
  name: 'Generic fixture',
  pricing: { configurationRef: 'price' },
  commerce: { catalogRef: 'catalog' },
  fonts: [
    {
      id: 'font',
      family: 'Test',
      fileUrl: '/font.woff2',
      weight: 400,
      style: 'normal',
    },
  ],
  materialBindings: [],
  sections: [
    {
      id: 'front',
      label: 'Front',
      type: 'rectangle',
      variantIds: ['small', 'large'],
      allowedElementTypes: ['text', 'image'],
      constraints: {
        maxElements: 2,
        minFontSizePt: 12,
        allowedFontIds: ['font'],
        maxTextLength: 100,
        image: {
          allowedMimeTypes: ['image/png'],
          maxBytes: 100000,
          maxWidthPx: 1000,
          maxHeightPx: 1000,
          maxPixels: 1000000,
          recommendedDpi: 150,
        },
      },
    },
  ],
  variants: ['small', 'large'].map((id) => ({
    id,
    label: id,
    modelUrl: '/model.glb',
    basePriceRef: 'base',
    realWidthMeters: 1,
    modelNormalization: {
      method: 'bounding-box-width',
      axis: 'x',
      note: 'Test model',
    },
    atlas: {
      widthPx: 2048,
      heightPx: 2048,
      flipY: false,
      uvOrigin: 'top-left',
    },
    sectionGeometry: { front: geometry },
  })),
  optionGroups: [],
};
const config: ProductConfig = {
  schemaVersion: 1,
  productId: 'generic',
  definitionRevision: 'v1',
  variantId: 'small',
  quantity: 1,
  optionSelections: {},
  sections: { front: { backgroundColor: null, elements: [] } },
  assets: {},
};
const element: TextElement = {
  id: 'title',
  type: 'text',
  text: 'Hello',
  fontId: 'font',
  fontSize: 0.1,
  color: '#000000',
  align: 'center',
  lineHeight: 1.2,
  transform: {
    position: { x: 0.5, y: 0.5 },
    size: { width: 0.4, height: 0.2 },
    scale: 1,
    rotationDeg: 0,
  },
};
function setup() {
  return createConfigStore(parseDefinition(definition), config);
}
it('preserves artwork across variants and undo/redo', () => {
  const { store, actions } = setup();
  expect(actions.addElement('front', element).ok).toBe(true);
  expect(actions.setVariant('large').ok).toBe(true);
  expect(store.getState().config.sections.front?.elements).toEqual([element]);
  actions.undo();
  expect(store.getState().config.variantId).toBe('small');
  actions.redo();
  expect(store.getState().config.variantId).toBe('large');
});
it('groups a transaction into one undo and cancels safely', () => {
  const { store, actions } = setup();
  actions.beginTransaction();
  actions.setQuantity(2);
  actions.setQuantity(3);
  actions.commitTransaction();
  expect(store.getState().history.past).toHaveLength(1);
  actions.undo();
  expect(store.getState().config.quantity).toBe(1);
  actions.beginTransaction();
  actions.setQuantity(4);
  actions.cancelTransaction();
  expect(store.getState().config.quantity).toBe(1);
});
it('rejects failed loads and invalid actions atomically', () => {
  const { store, actions } = setup();
  const before = store.getState();
  expect(actions.loadConfig({ ...config, variantId: 'missing' }).ok).toBe(
    false,
  );
  expect(actions.setQuantity(0).ok).toBe(false);
  expect(store.getState()).toBe(before);
});
it('retains section identity on unrelated changes and detaches caller input', () => {
  const { store, actions } = setup();
  const section = store.getState().config.sections.front;
  actions.setQuantity(2);
  expect(store.getState().config.sections.front).toBe(section);
  const copy = structuredClone(element);
  actions.addElement('front', copy);
  copy.text = 'Mutated';
  expect(store.getState().config.sections.front?.elements[0]).toEqual(element);
});
it('validates generic definition references and UV transforms', () => {
  expect(() =>
    parseDefinition({
      ...definition,
      revision: 'v2',
      variants: [{ ...definition.variants[0], sectionGeometry: {} }],
    }),
  ).toThrow();
});

it('copies artwork with unique IDs in one atomic undo step', () => {
  const { store, actions } = setup();
  actions.addElement('front', element);
  const before = store.getState().config;
  expect(actions.duplicateElement('front', element.id).ok).toBe(true);
  expect(store.getState().config.sections.front?.elements).toHaveLength(2);
  expect(store.getState().config.sections.front?.elements[1]?.id).not.toBe(
    element.id,
  );
  actions.undo();
  expect(store.getState().config).toBe(before);
});
it('rolls back a copy to an unknown target without changing valid targets', () => {
  const { store, actions } = setup();
  actions.addElement('front', element);
  const before = store.getState();
  expect(actions.copySection('front', ['unknown']).ok).toBe(false);
  expect(store.getState()).toBe(before);
});

it('copies a whole canopy section to all eight sections as one undoable transaction', async () => {
  const { default: raw } =
    await import('@products/canopy-tent/definition.json');
  const definition = parseDefinition(raw);
  const runtime = createConfigStore(definition, {
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
  });
  runtime.actions.addElement('roof-front', {
    ...element,
    fontId: 'inter-regular',
  });
  runtime.actions.setSectionBackground('roof-front', '#112233');
  const before = runtime.store.getState();
  expect(runtime.actions.applySectionToAll('roof-front').ok).toBe(true);
  const after = runtime.store.getState();
  expect(after.history.past).toHaveLength(before.history.past.length + 1);
  const ids = Object.values(after.config.sections).map(
    (s) => s.elements[0]?.id,
  );
  expect(new Set(ids).size).toBe(8);
  expect(
    Object.values(after.config.sections).every(
      (s) => s.backgroundColor === '#112233',
    ),
  ).toBe(true);
  runtime.actions.undo();
  expect(runtime.store.getState().config).toBe(before.config);
  runtime.actions.redo();
  expect(runtime.store.getState().config).toBe(after.config);
});
