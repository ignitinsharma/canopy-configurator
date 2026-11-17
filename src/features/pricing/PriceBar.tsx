import type { RefObject } from 'react';
import type { ViewerHandle } from '../viewer3d/Viewer';
import { CheckoutActions } from '../checkout/CheckoutActions';
import { useEmbedBridge } from '../embed/useEmbedBridge';
import { useConfigSelector, useConfigurator } from '../ConfiguratorContext';
import { usePriceQuote } from './usePriceQuote';
import { HistoryControls } from '@ui/HistoryControls';
const kinds = ['base', 'customization', 'option', 'fee', 'discount'] as const;
export function PriceBar({
  viewerRef,
}: {
  viewerRef: RefObject<ViewerHandle>;
}) {
  const config = useConfigSelector((s) => s.config),
    definition = useConfigSelector((s) => s.definition),
    { actions } = useConfigurator(),
    { quote, status, error, refresh } = usePriceQuote(config);
  const send = useEmbedBridge(quote, status);
  const format = (value: number) =>
    quote
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: quote.currency,
          minimumFractionDigits: quote.minorUnitDigits,
          maximumFractionDigits: quote.minorUnitDigits,
        }).format(value / 10 ** quote.minorUnitDigits)
      : '—';
  return (
    <aside className="price-bar live-price-bar" aria-label="Price and checkout">
      <div className="price-summary">
        <span className="status">Estimated total · tax excluded</span>
        <p className="price" aria-live="polite">
          {quote ? format(quote.total) : '—'}
        </p>
        {(status === 'loading' || status === 'stale') && (
          <span role="status" className="price-updating">
            {quote ? 'Updating…' : 'Loading price…'}
          </span>
        )}
        {status === 'error' && (
          <div role="alert">
            <span>{error?.message}</span>
            <button type="button" onClick={refresh}>
              Retry pricing
            </button>
          </div>
        )}
      </div>
      <HistoryControls />
      <div className="price-controls">
        <label>
          Quantity
          <div className="quantity-stepper">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={config.quantity <= 1}
              onClick={() => actions.setQuantity(config.quantity - 1)}
            >
              −
            </button>
            <input
              aria-label="Quantity"
              type="number"
              min={1}
              max={100}
              value={config.quantity}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 100)
                  actions.setQuantity(value);
              }}
            />
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={config.quantity >= 100}
              onClick={() => actions.setQuantity(config.quantity + 1)}
            >
              +
            </button>
          </div>
        </label>
        <label>
          Production
          <select
            aria-label="Production"
            value={config.optionSelections['production-speed'] as string}
            onChange={(e) =>
              actions.setOption('production-speed', e.target.value)
            }
          >
            {definition.optionGroups
              .find((g) => g.id === 'production-speed')
              ?.choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <CheckoutActions viewerRef={viewerRef} status={status} send={send} />
      {quote && (
        <details className="price-breakdown">
          <summary>
            Price breakdown
            {quote.discountTotal > 0
              ? ` · savings ${format(quote.discountTotal)}`
              : ''}
          </summary>
          {kinds.map((kind) => {
            const lines = quote.lineItems.filter((l) => l.kind === kind);
            return lines.length ? (
              <div key={kind}>
                <h2>{kind}</h2>
                <ul>
                  {lines.map((line) => (
                    <li key={line.id}>
                      <span>
                        {line.label}{' '}
                        {line.quantity > 1 ? `× ${line.quantity}` : ''}
                      </span>
                      <span>{format(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
          <p>Tax is calculated by Shopify at checkout.</p>
          {quote.warnings.length > 0 && (
            <ul className="resolution-warnings" aria-label="Quote warnings">
              {quote.warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </aside>
  );
}
