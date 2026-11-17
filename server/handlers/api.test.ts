// @vitest-environment node
import { it, expect } from 'vitest';
import { createApiHandlers } from './api';
import {
  PriceQuoteSchema,
  PriceRequestSchema,
  CartReceiptSchema,
  ApiErrorSchema,
} from '../../src/core/contracts';
import { blankConfig, exampleConfig } from '../pricing/fixtures';
const post = (body: unknown) =>
  new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const options = {
  secret: 'test',
  latencyMinMs: 0,
  latencyMaxMs: 0,
  failureRate: 0,
};
it('shares schemas and verifies portable quote/cart integrity across handler instances', async () => {
  const config = exampleConfig(),
    request = PriceRequestSchema.parse({ config, currency: 'USD' });
  const price = createApiHandlers(options),
    cart = createApiHandlers(options);
  const response = await price.price(post(request));
  expect(response.status).toBe(200);
  const quote = PriceQuoteSchema.parse(await response.json()),
    payload = {
      config,
      quoteId: quote.quoteId,
      signature: quote.signature,
      idempotencyKey: 'test-key-123',
    };
  const added = await cart.cart(post(payload));
  expect(added.status).toBe(200);
  const receipt = CartReceiptSchema.parse(await added.json());
  expect(receipt.lineItems[0]?.variantId).toBe(
    'gid://shopify/ProductVariant/1002',
  );
  expect(receipt.lineItems[0]?.quantity).toBe(5);
  expect(await (await cart.cart(post(payload))).json()).toEqual(receipt);
  const changed = structuredClone(config);
  changed.quantity = 6;
  expect((await cart.cart(post({ ...payload, config: changed }))).status).toBe(
    409,
  );
  expect(
    (await cart.cart(post({ ...payload, signature: '0'.repeat(64) }))).status,
  ).toBe(409);
  const newer = PriceQuoteSchema.parse(
    await (await price.price(post(request))).json(),
  );
  const conflict = await cart.cart(
    post({ ...payload, quoteId: newer.quoteId, signature: newer.signature }),
  );
  expect(conflict.status).toBe(409);
  expect(ApiErrorSchema.parse(await conflict.json()).error.code).toBe(
    'IDEMPOTENCY_CONFLICT',
  );
});
it('rejects expired quotes, unsupported currency, invalid bodies and simulated failures', async () => {
  let now = Date.now();
  const handlers = createApiHandlers({ ...options, now: () => now }),
    config = blankConfig();
  const quote = PriceQuoteSchema.parse(
    await (await handlers.price(post({ config, currency: 'USD' }))).json(),
  );
  now += 1000 * 901;
  const expired = await handlers.cart(
    post({
      config,
      quoteId: quote.quoteId,
      signature: quote.signature,
      idempotencyKey: 'expiry-test',
    }),
  );
  expect(expired.status).toBe(409);
  expect(ApiErrorSchema.parse(await expired.json()).error.code).toBe(
    'QUOTE_EXPIRED',
  );
  expect((await handlers.price(post({ config, currency: 'EUR' }))).status).toBe(
    422,
  );
  expect(
    (await handlers.price(post({ config: {}, currency: 'USD' }))).status,
  ).toBe(400);
  expect(
    (
      await handlers.price(
        new Request('http://localhost', { method: 'POST', body: '{' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await createApiHandlers({ ...options, failureRate: 1 }).price(
        post({ config, currency: 'USD' }),
      )
    ).status,
  ).toBe(500);
});
it('rejects semantic config changes and mismatched PDF without trusting client totals', async () => {
  const handlers = createApiHandlers(options),
    config = blankConfig();
  const quote = PriceQuoteSchema.parse(
    await (await handlers.price(post({ config, currency: 'USD' }))).json(),
  );
  expect(
    (await handlers.price(post({ config, currency: 'USD', total: 1 }))).status,
  ).toBe(400);
  config.variantId = 'unknown';
  expect((await handlers.price(post({ config, currency: 'USD' }))).status).toBe(
    422,
  );
  const cart = await handlers.cart(
    post({
      config: blankConfig(),
      quoteId: quote.quoteId,
      signature: quote.signature,
      idempotencyKey: 'pdf-mismatch',
      pdfRef: {
        documentId: 'pdf',
        id: 'pdf',
        url: 'https://example.com/pdf',
        sha256: 'b'.repeat(64),
        configFingerprint: 'a'.repeat(64),
        mediaType: 'application/pdf',
      },
    }),
  );
  expect(cart.status).toBe(409);
});
