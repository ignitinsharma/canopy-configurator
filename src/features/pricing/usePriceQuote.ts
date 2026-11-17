import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductConfig } from '@core/config';
import type { PriceQuote, PricingService } from '@core/contracts';
import { fingerprint } from '@core/serialization';
import { priceRelevantKey } from '@core/pricingKey';
import { useConfigurator } from '../ConfiguratorContext';
export type QuoteStatus = 'idle' | 'loading' | 'stale' | 'error';
export interface QuoteState {
  quote: PriceQuote | null;
  status: QuoteStatus;
  error: Error | null;
}
export class QuoteCache {
  private entries = new Map<string, PriceQuote>();
  get(hash: string) {
    const quote = this.entries.get(hash);
    if (!quote) return null;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      this.entries.delete(hash);
      return null;
    }
    this.entries.delete(hash);
    this.entries.set(hash, quote);
    return quote;
  }
  set(quote: PriceQuote) {
    this.entries.delete(quote.configHash);
    this.entries.set(quote.configHash, quote);
    if (this.entries.size > 20)
      this.entries.delete(this.entries.keys().next().value!);
  }
  get size() {
    return this.entries.size;
  }
}
/** Exported seam makes debounce/abort/races testable without the app provider. */
export function usePriceQuoteWithService(
  config: ProductConfig,
  service: PricingService,
  currency = 'USD',
) {
  const [state, setState] = useState<QuoteState>({
      quote: null,
      status: 'idle',
      error: null,
    }),
    [refreshVersion, setRefreshVersion] = useState(0);
  const cache = useRef(new QuoteCache()),
    sequence = useRef(0),
    refreshSeen = useRef(0),
    latest = useRef(config);
  useEffect(() => {
    latest.current = config;
  }, [config]);
  const key = priceRelevantKey(config);
  useEffect(() => {
    const bypassCache = refreshSeen.current !== refreshVersion;
    refreshSeen.current = refreshVersion;
    const id = ++sequence.current,
      controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    // Effect publishes an external request lifecycle, retaining the previous total.
    setState((previous) => ({
      ...previous,
      status: previous.quote ? 'stale' : 'loading',
      error: null,
    }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const snapshot = latest.current,
            hash = await fingerprint(snapshot);
          if (controller.signal.aborted || id !== sequence.current) return;
          const cached = !bypassCache ? cache.current.get(hash) : null;
          const quote =
            (cached?.currency === currency ? cached : null) ??
            (await service.quote(snapshot, {
              currency,
              marketRef: 'default',
              signal: controller.signal,
            }));
          if (controller.signal.aborted || id !== sequence.current) return;
          cache.current.set(quote);
          setState({ quote, status: 'idle', error: null });
          expiry = setTimeout(
            () => setRefreshVersion((v) => v + 1),
            Math.max(1, Date.parse(quote.expiresAt) - Date.now()),
          );
        } catch (error) {
          if (controller.signal.aborted || id !== sequence.current) return;
          setState((previous) => ({
            ...previous,
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
      if (expiry) clearTimeout(expiry);
      controller.abort();
    };
  }, [key, service, currency, refreshVersion]);
  const refresh = useCallback(() => setRefreshVersion((v) => v + 1), []);
  return { ...state, refresh };
}
export function usePriceQuote(config: ProductConfig) {
  const { dependencies } = useConfigurator();
  if (!dependencies) throw new Error('Pricing dependencies are missing');
  return usePriceQuoteWithService(config, dependencies.pricing);
}
