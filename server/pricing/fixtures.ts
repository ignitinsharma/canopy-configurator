import { parseDefinition } from '../../src/core/definition';
import type {
  ProductConfig,
  TextElement,
  ImageElement,
} from '../../src/core/config';
import raw from '../../src/products/canopy-tent/definition.json';
export const fixtureDefinition = parseDefinition(raw);
export function blankConfig(
  variantId = '6.5x6.5',
  quantity = 1,
): ProductConfig {
  return {
    schemaVersion: 1,
    productId: fixtureDefinition.id,
    definitionRevision: fixtureDefinition.revision,
    variantId,
    quantity,
    optionSelections: Object.fromEntries(
      fixtureDefinition.optionGroups.map((g) => [g.id, g.defaultValue]),
    ),
    sections: Object.fromEntries(
      fixtureDefinition.sections.map((s) => [
        s.id,
        { backgroundColor: null, elements: [] },
      ]),
    ),
    assets: {},
  };
}
export const sampleText: TextElement = {
  id: 'brand',
  type: 'text',
  text: 'ACME',
  color: '#17324D',
  fontId: 'inter-regular',
  fontSize: 0.1,
  align: 'center',
  lineHeight: 1.2,
  transform: {
    position: { x: 0.5, y: 0.65 },
    size: { width: 0.6, height: 0.3 },
    scale: 1,
    rotationDeg: 0,
  },
};
export function printSections(config: ProductConfig, count: number) {
  Object.keys(config.sections)
    .slice(0, count)
    .forEach((id, index) => {
      config.sections[id]!.elements = [
        { ...structuredClone(sampleText), id: `text-${index}` },
      ];
    });
  return config;
}
export function putImage(
  config: ProductConfig,
  sectionId: string,
  id: string,
  widthPx = 2048,
) {
  const image: ImageElement = {
    id: `element-${id}`,
    type: 'image',
    assetId: id,
    fit: 'contain',
    opacity: 1,
    transform: {
      position: { x: 0.5, y: 0.5 },
      size: { width: 0.4, height: 0.5 },
      scale: 1,
      rotationDeg: 0,
    },
  };
  config.sections[sectionId]!.elements.push(image);
  config.assets[id] = {
    id,
    mimeType: 'image/png',
    byteSize: 100000,
    widthPx,
    heightPx: 1024,
    sha256: 'a'.repeat(64),
  };
  return config;
}
export function exampleConfig() {
  const config = blankConfig('6.5x6.5', 5);
  config.sections['roof-front']!.elements = [structuredClone(sampleText)];
  putImage(config, 'valance-front', 'logo-a');
  putImage(config, 'valance-back', 'logo-b');
  return config;
}
