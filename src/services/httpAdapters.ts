import type { PricingService, CommerceAdapter } from '@core/contracts';
import {
  CartReceiptSchema,
  CartRequestSchema,
  ApiErrorSchema,
} from '@core/contracts';
import { assertCurrentQuote } from '@core/quote';
import {
  HttpPricingService,
  PricingApiError,
} from './pricing/HttpPricingService';
/** Same DI seam works with local handlers, tests, or a separately hosted backend. */
export function createHttpAdapters(
  baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api',
): { pricing: PricingService; commerce: CommerceAdapter } {
  return {
    pricing: new HttpPricingService(baseUrl),
    commerce: {
      async addToCart(config, quote, pdfRef, context) {
        await assertCurrentQuote(config, quote);
        if (pdfRef && pdfRef.configFingerprint !== quote.configHash)
          throw new PricingApiError(
            'PDF_MISMATCH',
            'PDF does not match the configuration',
          );
        const input = CartRequestSchema.parse({
          config,
          quoteId: quote.quoteId,
          signature: quote.signature,
          pdfRef,
          idempotencyKey: context.idempotencyKey,
        });
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: context.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const parsed = ApiErrorSchema.safeParse(payload);
          throw new PricingApiError(
            parsed.success ? parsed.data.error.code : 'HTTP_ERROR',
            parsed.success ? parsed.data.error.message : 'Cart request failed',
            response.status,
          );
        }
        return CartReceiptSchema.parse(payload);
      },
    },
  };
}
