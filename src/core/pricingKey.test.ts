import { it, expect } from 'vitest';
import { priceRelevantKey } from './pricingKey';
import {
  blankConfig,
  printSections,
  putImage,
} from '../../server/pricing/fixtures';
it('ignores movement/text styling and layer reordering but sees counts/options/variant/quantity/backgrounds', () => {
  const config = printSections(blankConfig(), 1),
    key = priceRelevantKey(config);
  const e = config.sections['roof-front']!.elements[0]!;
  e.transform.position.x = 0.6;
  e.transform.rotationDeg = 90;
  if (e.type === 'text') {
    e.text = 'Changed';
    e.color = '#ffffff';
  }
  expect(priceRelevantKey(config)).toBe(key);
  config.quantity = 2;
  expect(priceRelevantKey(config)).not.toBe(key);
  config.quantity = 1;
  putImage(config, 'roof-front', 'a');
  expect(priceRelevantKey(config)).not.toBe(key);
});

it('detects backgrounds, options, variant and element removal while ignoring stacking order', () => {
  const config = printSections(blankConfig(), 2),
    key = priceRelevantKey(config);
  for (const mutate of [
    (c: typeof config) => {
      c.variantId = '8x8';
    },
    (c: typeof config) => {
      c.optionSelections['frame-color'] = 'black';
    },
    (c: typeof config) => {
      c.sections['roof-front']!.backgroundColor = '#123456';
    },
    (c: typeof config) => {
      c.sections['roof-front']!.elements = [];
    },
  ]) {
    const changed = structuredClone(config);
    mutate(changed);
    expect(priceRelevantKey(changed)).not.toBe(key);
  }
  const section = config.sections['roof-front']!;
  section.elements.push({
    ...structuredClone(section.elements[0]!),
    id: 'second',
  });
  const before = priceRelevantKey(config);
  section.elements.reverse();
  expect(priceRelevantKey(config)).toBe(before);
});
