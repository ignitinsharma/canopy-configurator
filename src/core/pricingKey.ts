import type { ProductConfig } from './config';
/** A dependency projection, never a price calculation. Geometry, text styling,
 * position, scale and stacking order cannot affect this backend's price rules.
 * Cart integrity still uses the full canonical fingerprint, not this key. */
export function priceRelevantKey(config: ProductConfig): string {
  return JSON.stringify({
    productId: config.productId,
    definitionRevision: config.definitionRevision,
    variantId: config.variantId,
    quantity: config.quantity,
    options: Object.fromEntries(
      Object.entries(config.optionSelections)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, value]) => [
          id,
          Array.isArray(value) ? [...value].sort() : value,
        ]),
    ),
    sections: Object.entries(config.sections)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, s]) => ({
        id,
        background: s.backgroundColor,
        elements: s.elements
          .map((e) => ({
            id: e.id,
            type: e.type,
            ...(e.type === 'image' ? { assetId: e.assetId } : {}),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      })),
  });
}
