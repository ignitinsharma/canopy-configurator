// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import { HttpPricingService } from './HttpPricingService';
import { computeQuote } from '../../../server/pricing/engine';
import {
  blankConfig,
  fixtureDefinition,
} from '../../../server/pricing/fixtures';
import { canopyRules } from '../../../server/pricing/rules';
afterEach(() => vi.useRealTimers());
it('validates quotes and retries 5xx, but never retries 4xx or malformed success', async () => {
  const config = blankConfig(),
    quote = await computeQuote(config, canopyRules, {
      definition: fixtureDefinition,
      currency: 'USD',
      now: Date.now(),
      quoteId: 'test',
      secret: 'test',
    });
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: 'SIMULATED_FAILURE', message: 'retry' } },
        { status: 500 },
      ),
    )
    .mockResolvedValueOnce(Response.json(quote));
  const promise = new HttpPricingService('/api', fetcher).quote(config, {
    currency: 'USD',
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect((await promise).total).toBe(34900);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const invalid = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { error: { code: 'INVALID_CONFIG', message: 'invalid' } },
        { status: 422 },
      ),
    );
  await expect(
    new HttpPricingService('/api', invalid).quote(config, { currency: 'USD' }),
  ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  expect(invalid).toHaveBeenCalledOnce();
  const malformed = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ total: 1 }));
  await expect(
    new HttpPricingService('/api', malformed).quote(config, {
      currency: 'USD',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(malformed).toHaveBeenCalledOnce();
});
it('supports abort and network-error backoff', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    new HttpPricingService('/api', fetcher).quote(blankConfig(), {
      currency: 'USD',
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});
