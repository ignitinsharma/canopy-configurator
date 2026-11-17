import type { ProductConfig } from '@core/config';
import type { PriceQuote, PdfRef } from '@core/contracts';
/** Pure transport mapping. Custom prices must be applied by a Shopify Function,
 * cart transform or draft order; storefront line properties cannot set prices. */
export function mapToCartLine({
  config,
  quote,
  pdfRef,
}: {
  config: ProductConfig;
  quote: PriceQuote;
  pdfRef: PdfRef;
}) {
  const variantId = quote.lineItems.find((l) => l.kind === 'base')?.meta
    ?.shopifyVariantId;
  if (
    typeof variantId !== 'string' ||
    !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId)
  )
    throw new Error('Quote is missing a Shopify variant ID');
  if (pdfRef.configFingerprint !== quote.configHash)
    throw new Error('PDF/config hash mismatch');
  const printed = Number(
    quote.lineItems.find((l) => l.kind === 'base')?.meta?.printedSections ?? 0,
  );
  const properties = {
    _configuration: `config:${quote.configHash}`,
    _config_hash: quote.configHash,
    _quote_id: quote.quoteId,
    _price_signature: quote.signature,
    _production_pdf: pdfRef.url,
    Size: config.variantId,
    'Frame color': String(config.optionSelections['frame-color'] ?? ''),
    'Printed sections': String(printed),
    'Production speed': String(
      config.optionSelections['production-speed'] ?? 'standard',
    ),
  };
  return {
    variantId,
    properties,
    ajax: {
      items: [
        {
          id: variantId.split('/').at(-1)!,
          quantity: config.quantity,
          properties,
        },
      ],
    },
    storefront: {
      lines: [
        {
          merchandiseId: variantId,
          quantity: config.quantity,
          attributes: Object.entries(properties).map(([key, value]) => ({
            key,
            value,
          })),
        },
      ],
    },
  };
}
export type MappedCartLine = ReturnType<typeof mapToCartLine>;
