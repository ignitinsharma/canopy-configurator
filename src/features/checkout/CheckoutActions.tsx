import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ViewerHandle } from '../viewer3d/Viewer';
import { useConfigurator, useConfigSelector } from '../ConfiguratorContext';
import type { QuoteStatus } from '../pricing/usePriceQuote';
import type { PriceQuote, PdfRef, CartReceipt } from '@core/contracts';
import type { ProductConfig } from '@core/config';
import { fingerprint, exportConfig } from '@core/serialization';
import {
  mapToCartLine,
  type MappedCartLine,
} from '@services/shopify/mapToCartLine';
import { createIndexedDbPdfStore } from '@services/pdf/IndexedDbPdfStore';
import type { OutgoingType } from '../embed/protocol';
interface Attempt {
  config: ProductConfig;
  quote: PriceQuote;
  pdfRef: PdfRef;
  blob: Blob;
  filename: string;
  key: string;
  mapping: MappedCartLine;
}
export function CheckoutActions({
  viewerRef,
  status,
  send,
}: {
  viewerRef: RefObject<ViewerHandle>;
  status: QuoteStatus;
  send: (type: OutgoingType, payload: unknown) => void;
}) {
  const instance = useConfigurator(),
    issues = useConfigSelector((s) => s.validationIssues),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<CartReceipt | null>(null),
    [payload, setPayload] = useState<MappedCartLine | null>(null);
  const attempt = useRef<Attempt | null>(null),
    fallbackStore = useRef(createIndexedDbPdfStore()),
    working = useRef(false);
  const pdfStore = instance.dependencies?.pdf ?? fallbackStore.current;
  useEffect(() => {
    const owned = fallbackStore.current;
    return () => owned.dispose?.();
  }, []);
  const invalid = issues.some(
    (i) => i.severity === 'error' && i.code !== 'FONT_TOO_SMALL',
  );
  async function prepare(): Promise<Attempt> {
    if (!instance.dependencies)
      throw new Error('Checkout services unavailable');
    const config = exportConfig(instance.store.getState().config),
      hash = await fingerprint(config);
    if (
      attempt.current?.quote.configHash === hash &&
      Date.parse(attempt.current.quote.expiresAt) > Date.now() + 5000
    )
      return attempt.current;
    setProgress('Refreshing signed quote…');
    const quote = await instance.dependencies.pricing.quote(config, {
      currency: 'USD',
    });
    const { generateSummary } = await import('../pdf/generateSummary');
    const result = await generateSummary({
      config,
      definition: instance.store.getState().definition,
      quote,
      assets: instance.assets,
      onProgress: setProgress,
      captureViews: async () => {
        for (let i = 0; i < 100; i++) {
          if (viewerRef.current) {
            try {
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              );
              return await viewerRef.current.captureViews({
                width: 640,
                height: 480,
              });
            } catch (error) {
              if (i === 99) throw error;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('3D preview is still loading. Please retry.');
      },
    });
    const pdfRef = await pdfStore.upload(result.blob, {
      configHash: hash,
      filename: result.filename,
    });
    if ((await fingerprint(instance.store.getState().config)) !== hash)
      throw new Error(
        'Configuration changed while preparing the order. Please retry.',
      );
    const value: Attempt = {
      config,
      quote,
      pdfRef,
      ...result,
      key: crypto.randomUUID(),
      mapping: mapToCartLine({ config, quote, pdfRef }),
    };
    attempt.current = value;
    return value;
  }
  async function run(cart: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await prepare();
      if (cart) {
        setProgress('Adding to mock cart…');
        const result = await instance.dependencies!.commerce.addToCart(
          value.config,
          value.quote,
          value.pdfRef,
          { idempotencyKey: value.key },
        );
        setReceipt(result);
        setPayload(value.mapping);
        send('add-to-cart', {
          cartLine: value.mapping.ajax,
          storefront: value.mapping.storefront,
          quote: value.quote,
          pdfRef: value.pdfRef,
          receipt: result,
        });
      } else {
        const link = document.createElement('a');
        link.href = value.pdfRef.url;
        link.download = value.filename;
        link.click();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      send('error', { code: 'CHECKOUT_ERROR', message });
    } finally {
      working.current = false;
      setBusy(false);
      setProgress('');
    }
  }
  return (
    <div className="checkout-actions">
      <div className="checkout-buttons">
        <button
          type="button"
          disabled={busy || invalid || status !== 'idle'}
          onClick={() => void run(true)}
        >
          {busy ? 'Preparing…' : error ? 'Retry add to cart' : 'Add to cart'}
        </button>
        <button
          type="button"
          disabled={busy || invalid || status !== 'idle'}
          onClick={() => void run(false)}
        >
          Download PDF
        </button>
      </div>
      {busy && <p role="status">{progress}</p>}
      {error && <p role="alert">{error}</p>}
      {receipt && (
        <section className="cart-confirmation" aria-label="Cart confirmation">
          <strong>Added to mock cart</strong>
          <p>
            {receipt.lineItems[0]?.quantity} tent(s) ·{' '}
            {receipt.lineItems[0]?.variantId}
          </p>
          <p className="status">Receipt: {receipt.cartId}</p>
          <details>
            <summary>View payload</summary>
            <pre>{JSON.stringify({ payload, receipt }, null, 2)}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
