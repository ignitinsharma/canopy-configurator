import {
  ApiErrorSchema,
  PriceRequestSchema,
  type PricingService,
  type PriceQuote,
} from '@core/contracts';
import type { ProductConfig } from '@core/config';
import { assertCurrentQuote } from '@core/quote';
export class PricingApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 0,
  ) {
    super(message);
    this.name = 'PricingApiError';
  }
}
function abortError() {
  return new DOMException('Request aborted', 'AbortError');
}
function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(done, ms),
      abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(abortError());
      };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
/** Swap VITE_API_BASE_URL or inject another PricingService; no UI pricing changes. */
export class HttpPricingService implements PricingService {
  constructor(
    private baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api',
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private retries = 2,
  ) {}
  async quote(
    config: ProductConfig,
    context: Parameters<PricingService['quote']>[1],
  ): Promise<PriceQuote> {
    const request = PriceRequestSchema.parse({
      config,
      currency: context.currency,
    });
    for (let attempt = 0; ; attempt++) {
      context.signal?.throwIfAborted();
      let response: Response;
      try {
        response = await this.fetcher(
          `${this.baseUrl.replace(/\/$/, '')}/price`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: context.signal,
          },
        );
      } catch (error) {
        if (
          context.signal?.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          throw error;
        if (attempt < this.retries) {
          await delay(200 * 2 ** attempt, context.signal);
          continue;
        }
        throw new PricingApiError(
          'NETWORK_ERROR',
          'Unable to reach pricing. Check your connection.',
        );
      }
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        const parsed = ApiErrorSchema.safeParse(payload),
          error = new PricingApiError(
            parsed.success ? parsed.data.error.code : 'HTTP_ERROR',
            parsed.success
              ? parsed.data.error.message
              : `Pricing returned HTTP ${response.status}`,
            response.status,
          );
        if (response.status >= 500 && attempt < this.retries) {
          await delay(200 * 2 ** attempt, context.signal);
          continue;
        }
        throw error;
      }
      try {
        const quote = await assertCurrentQuote(config, await response.json());
        if (quote.currency !== context.currency)
          throw new Error('Currency mismatch');
        return quote;
      } catch (error) {
        if (context.signal?.aborted) throw abortError();
        throw new PricingApiError(
          'INVALID_RESPONSE',
          error instanceof Error
            ? `Invalid quote: ${error.message}`
            : 'Invalid pricing response',
          response.status,
        );
      }
    }
  }
}
