import { it, expect } from 'vitest';
import { assertCurrentQuote, PriceQuoteSchema } from './quote';
it('rejects fractional money and incomplete quote envelopes', () => {
  expect(() => PriceQuoteSchema.parse({ total: 1.5 })).toThrow();
});
it('rejects untrusted quote payloads before accepting checkout', async () => {
  await expect(
    assertCurrentQuote(
      {
        schemaVersion: 1,
        productId: 'p',
        definitionRevision: 'v1',
        variantId: 'v',
        quantity: 1,
        optionSelections: {},
        sections: {},
        assets: {},
      },
      {},
    ),
  ).rejects.toThrow();
});
