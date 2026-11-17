import { PriceQuoteSchema, type PriceQuote } from './contracts';
import type { ProductConfig } from './config';
import { fingerprint } from './serialization';
export { PriceQuoteSchema } from './contracts';
export async function assertCurrentQuote(
  config: ProductConfig,
  input: unknown,
  now = Date.now(),
): Promise<PriceQuote> {
  const quote = PriceQuoteSchema.parse(input);
  if (
    quote.configHash !== (await fingerprint(config)) ||
    quote.definitionRevision !== config.definitionRevision
  )
    throw new Error('QUOTE_MISMATCH');
  if (Date.parse(quote.expiresAt) <= now || Date.parse(quote.issuedAt) > now)
    throw new Error('QUOTE_EXPIRED');
  return quote;
}
