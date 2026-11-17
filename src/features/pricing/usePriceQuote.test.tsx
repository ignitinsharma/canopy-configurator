import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PriceQuote, PricingService } from '@core/contracts';
import type { ProductConfig } from '@core/config';
import { blankConfig, printSections } from '../../../server/pricing/fixtures';
import { usePriceQuoteWithService, QuoteCache } from './usePriceQuote';
vi.mock('@core/serialization', () => ({
  fingerprint: async (c: ProductConfig) =>
    String(
      JSON.stringify(c)
        .split('')
        .reduce((s, x) => (s * 31 + x.charCodeAt(0)) >>> 0, 0),
    ).padStart(64, '0'),
}));
function quote(total: number, hash = 'a'.repeat(64)): PriceQuote {
  return {
    quoteId: `q-${total}`,
    currency: 'USD',
    minorUnitDigits: 2,
    lineItems: [
      {
        id: 'base',
        label: 'Base',
        kind: 'base',
        quantity: 1,
        unitAmount: total,
        amount: total,
      },
    ],
    subtotal: total,
    discountTotal: 0,
    total,
    warnings: [],
    configHash: hash,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    signature: 'a'.repeat(64),
    rulesVersion: 'v1',
    definitionRevision: 'measured-1',
    taxPolicy: 'excluded-shopify-checkout',
  };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('debounces relevant edits and never requotes element movement', async () => {
  vi.useFakeTimers();
  const call = vi.fn<PricingService['quote']>().mockResolvedValue(quote(100));
  const initial = printSections(blankConfig(), 1);
  const service = { quote: call };
  const rendered = renderHook(
    ({ config }) => usePriceQuoteWithService(config, service),
    { initialProps: { config: initial } },
  );
  const changed = { ...initial, quantity: 2 };
  rendered.rerender({ config: changed });
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(call).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(call).toHaveBeenCalledOnce();
  const moved = structuredClone(changed);
  moved.sections['roof-front']!.elements[0]!.transform.position.x = 0.8;
  rendered.rerender({ config: moved });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(call).toHaveBeenCalledOnce();
});
it('aborts prior requests, ignores late responses and retains previous total while updating', async () => {
  vi.useFakeTimers();
  const pending: Array<(q: PriceQuote) => void> = [],
    signals: Array<AbortSignal | undefined> = [];
  const service: PricingService = {
    quote: vi.fn<PricingService['quote']>((_c, context) => {
      signals.push(context.signal);
      return new Promise<PriceQuote>((resolve) => pending.push(resolve));
    }),
  };
  const { result, rerender } = renderHook(
    ({ config }) => usePriceQuoteWithService(config, service),
    { initialProps: { config: blankConfig() } },
  );
  await act(() => vi.advanceTimersByTimeAsync(300));
  rerender({ config: blankConfig('6.5x6.5', 2) });
  expect(signals[0]?.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(300));
  await act(async () => pending[1]!(quote(200)));
  await act(async () => pending[0]!(quote(100)));
  expect(result.current.quote?.total).toBe(200);
  rerender({ config: blankConfig('6.5x6.5', 3) });
  expect(result.current.status).toBe('stale');
  expect(result.current.quote?.total).toBe(200);
});
it('exposes a recoverable error and explicit refresh retries', async () => {
  vi.useFakeTimers();
  const service = {
    quote: vi
      .fn<PricingService['quote']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(quote(100)),
  };
  const { result } = renderHook(() =>
    usePriceQuoteWithService(blankConfig(), service),
  );
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(result.current.status).toBe('error');
  act(() => result.current.refresh());
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(result.current.status).toBe('idle');
  expect(service.quote).toHaveBeenCalledTimes(2);
});
it('limits the hash cache to 20 LRU entries and expires cached quotes', () => {
  const cache = new QuoteCache();
  for (let i = 0; i < 20; i++) cache.set(quote(i, String(i).padStart(64, '0')));
  expect(cache.get('0'.repeat(64))?.total).toBe(0);
  cache.set(quote(21, 'f'.repeat(64)));
  expect(cache.size).toBe(20);
  expect(cache.get(String(1).padStart(64, '0'))).toBeNull();
  cache.set({
    ...quote(9, 'e'.repeat(64)),
    expiresAt: new Date(0).toISOString(),
  });
  expect(cache.get('e'.repeat(64))).toBeNull();
});
