import { z } from 'zod';
import type { PriceQuote } from './contracts';
import type { ProductConfig } from './config';
import { fingerprint } from './serialization';
const Money = z.number().int().safe();
export const PriceQuoteSchema = z.strictObject({
  quoteId: z.string().min(1),
  configFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  definitionRevision: z.string().min(1),
  pricingRevision: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  minorUnitDigits: z.number().int().min(0).max(4),
  lineItems: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      quantity: z.number().int().positive(),
      unitAmountMinor: Money,
      amountMinor: Money,
    }),
  ),
  subtotal: Money,
  total: Money,
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export async function assertCurrentQuote(
  config: ProductConfig,
  input: unknown,
  now = Date.now(),
): Promise<PriceQuote> {
  const quote = PriceQuoteSchema.parse(input);
  if (
    quote.configFingerprint !== (await fingerprint(config)) ||
    quote.definitionRevision !== config.definitionRevision
  )
    throw new Error('QUOTE_MISMATCH');
  if (
    Date.parse(quote.expiresAt) <= now ||
    Date.parse(quote.issuedAt) > now ||
    Date.parse(quote.expiresAt) <= Date.parse(quote.issuedAt)
  )
    throw new Error('QUOTE_EXPIRED');
  return quote;
}
