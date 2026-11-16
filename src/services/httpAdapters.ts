import type { PricingService, CommerceAdapter } from '@core/contracts';
import { assertCurrentQuote } from '@core/quote';
import { z } from 'zod';
const Receipt = z.strictObject({
  cartId: z.string().min(1),
  lineIds: z.array(z.string()),
  checkoutUrl: z.httpUrl(),
});
async function post(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`);
  return response.json() as Promise<unknown>;
}
export function createHttpAdapters(baseUrl = ''): {
  pricing: PricingService;
  commerce: CommerceAdapter;
} {
  return {
    pricing: {
      async quote(config, context) {
        const result = await assertCurrentQuote(
          config,
          await post(
            `${baseUrl}/api/price`,
            {
              config,
              currency: context.currency,
              marketRef: context.marketRef,
            },
            context.signal,
          ),
        );
        if (result.currency !== context.currency)
          throw new Error('CURRENCY_MISMATCH');
        return result;
      },
    },
    commerce: {
      async addToCart(config, quote, pdfRef, context) {
        await assertCurrentQuote(config, quote);
        if (pdfRef.configFingerprint !== quote.configFingerprint)
          throw new Error('PDF_MISMATCH');
        return Receipt.parse(
          await post(
            `${baseUrl}/api/cart`,
            {
              config,
              quoteId: quote.quoteId,
              pdfRef,
              idempotencyKey: context.idempotencyKey,
            },
            context.signal,
          ),
        );
      },
    },
  };
}
