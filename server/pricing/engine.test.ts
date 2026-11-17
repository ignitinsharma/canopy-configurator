// @vitest-environment node
import { it, expect } from 'vitest';
import { computeQuote } from './engine';
import { canopyRules } from './rules';
import {
  blankConfig,
  printSections,
  putImage,
  fixtureDefinition,
  exampleConfig,
} from './fixtures';
import { signQuote, verifySignature } from './signature';
const context = {
  definition: fixtureDefinition,
  currency: 'USD',
  now: Date.parse('2026-11-17T00:00:00Z'),
  quoteId: 'test-quote',
  secret: 'test-secret',
};
it.each([
  ['5x5', 24900],
  ['6.5x6.5', 34900],
  ['8x8', 44900],
])('prices base tier %s', async (id, amount) => {
  const quote = await computeQuote(
    blankConfig(String(id)),
    canopyRules,
    context,
  );
  expect(quote.total).toBe(amount);
  expect(quote.taxPolicy).toBe('excluded-shopify-checkout');
});
it('charges only above included print boundaries and adds full coverage at six', async () => {
  for (const variant of fixtureDefinition.variants) {
    const tier = canopyRules.variants[variant.basePriceRef]!;
    const included = await computeQuote(
      printSections(blankConfig(variant.id), tier.includedPrintedSections),
      canopyRules,
      context,
    );
    expect(included.total).toBe(tier.baseAmount);
    const extra = await computeQuote(
      printSections(blankConfig(variant.id), tier.includedPrintedSections + 1),
      canopyRules,
      context,
    );
    expect(extra.total).toBe(tier.baseAmount + tier.extraSectionAmount);
  }
  for (const count of [5, 6, 7]) {
    const quote = await computeQuote(
      printSections(blankConfig(), count),
      canopyRules,
      context,
    );
    expect(quote.lineItems.some((l) => l.id === 'full-coverage')).toBe(
      count >= 6,
    );
  }
});
it('counts custom backgrounds, but not the selected fabric default', async () => {
  const config = blankConfig();
  config.sections['roof-front']!.backgroundColor = '#ffffff';
  config.sections['roof-back']!.backgroundColor = '#FFFFFF';
  config.sections['roof-left']!.backgroundColor = '#123456';
  expect(
    (await computeQuote(config, canopyRules, context)).lineItems.find(
      (l) => l.id === 'printed-sections',
    ),
  ).toBeUndefined();
  config.sections['roof-right']!.backgroundColor = '#123456';
  config.sections['valance-front']!.backgroundColor = '#123456';
  expect(
    (await computeQuote(config, canopyRules, context)).lineItems.find(
      (l) => l.id === 'printed-sections',
    )?.quantity,
  ).toBe(1);
});
it('counts unique uploaded assets, copied logos are free, and low DPI has no price impact', async () => {
  const config = blankConfig();
  putImage(config, 'roof-front', 'a');
  config.sections['roof-back']!.elements = [
    {
      ...structuredClone(config.sections['roof-front']!.elements[0]!),
      id: 'copy',
    },
  ];
  expect(
    (await computeQuote(config, canopyRules, context)).lineItems.find(
      (l) => l.id === 'extra-images',
    ),
  ).toBeUndefined();
  putImage(config, 'valance-front', 'b');
  const high = await computeQuote(config, canopyRules, context);
  expect(high.lineItems.find((l) => l.id === 'extra-images')?.amount).toBe(
    1200,
  );
  config.assets.a!.widthPx = 10;
  const low = await computeQuote(config, canopyRules, context);
  expect(low.total).toBe(high.total);
  expect(low.warnings.length).toBeGreaterThan(0);
});
it('prices frame, accessories and optional rush from data', async () => {
  const config = blankConfig();
  config.optionSelections['frame-color'] = 'black';
  config.optionSelections.accessories = ['carry-bag', 'sidewalls'];
  config.optionSelections['production-speed'] = 'rush';
  const quote = await computeQuote(config, canopyRules, context);
  expect(quote.total).toBe(34900 + 2500 + 2900 + 9900 + 5000);
});
it.each([
  [1, 0],
  [2, 500],
  [4, 500],
  [5, 1000],
  [9, 1000],
  [10, 1500],
  [100, 1500],
])(
  'applies integer discount rounding at quantity %i',
  async (quantity, bps) => {
    const quote = await computeQuote(
      blankConfig('6.5x6.5', quantity),
      canopyRules,
      context,
    );
    expect(quote.discountTotal).toBe(
      Math.round((34900 * quantity * bps) / 10000),
    );
    expect(quote.total).toBe(quote.subtotal - quote.discountTotal);
  },
);
it('is deterministic for fixed context and signs only authoritative claims', async () => {
  const a = await computeQuote(exampleConfig(), canopyRules, context),
    b = await computeQuote(exampleConfig(), canopyRules, context);
  expect(a).toEqual(b);
  expect(a.subtotal).toBe(190500);
  expect(a.discountTotal).toBe(19050);
  expect(a.total).toBe(171450);
  expect(verifySignature(a, a.signature, context.secret)).toBe(true);
  expect(
    verifySignature({ ...a, total: a.total - 1 }, a.signature, context.secret),
  ).toBe(false);
  expect(signQuote(a, 'other')).not.toBe(a.signature);
});
