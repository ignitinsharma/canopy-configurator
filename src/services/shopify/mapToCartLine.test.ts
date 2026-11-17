// @vitest-environment node
import { it, expect } from 'vitest';
import { mapToCartLine } from './mapToCartLine';
import {
  exampleConfig,
  fixtureDefinition,
} from '../../../server/pricing/fixtures';
import { computeQuote } from '../../../server/pricing/engine';
import { canopyRules } from '../../../server/pricing/rules';
it('maps authoritative variant/quantity and hidden properties to both Shopify payloads', async () => {
  const config = exampleConfig(),
    quote = await computeQuote(config, canopyRules, {
      definition: fixtureDefinition,
      currency: 'USD',
      now: Date.now(),
      quoteId: 'q',
      secret: 'test',
    });
  const pdfRef = {
    id: 'pdf',
    documentId: 'pdf',
    url: 'https://example.com/order.pdf',
    sha256: 'a'.repeat(64),
    configFingerprint: quote.configHash,
    mediaType: 'application/pdf' as const,
  };
  const mapped = mapToCartLine({ config, quote, pdfRef });
  expect(mapped.ajax.items[0]?.id).toBe('1002');
  expect(mapped.ajax.items[0]?.quantity).toBe(5);
  expect(mapped.properties['Printed sections']).toBe('3');
  expect(mapped.properties._production_pdf).toBe(pdfRef.url);
  expect(mapped.storefront.lines[0]?.merchandiseId).toBe(
    'gid://shopify/ProductVariant/1002',
  );
  expect(mapped.properties._price_signature).toBe(quote.signature);
  expect(() =>
    mapToCartLine({
      config,
      quote,
      pdfRef: { ...pdfRef, configFingerprint: 'b'.repeat(64) },
    }),
  ).toThrow();
});
