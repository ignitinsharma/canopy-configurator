import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export interface SignedQuote {
  quoteId: string;
  configHash: string;
  total: number;
  expiresAt: string;
  currency: string;
}
export function signQuote(quote: SignedQuote, secret: string) {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify({
        quoteId: quote.quoteId,
        configHash: quote.configHash,
        total: quote.total,
        expiresAt: quote.expiresAt,
        currency: quote.currency,
      }),
    )
    .digest('hex');
}
export function verifySignature(
  quote: SignedQuote,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signQuote(quote, secret), 'hex'),
    Buffer.from(signature, 'hex'),
  );
}
const Claims = z.strictObject({
  nonce: z.string().uuid(),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
  total: z.number().int().safe().nonnegative(),
  currency: z.literal('USD'),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  rulesVersion: z.string().min(1),
});
/** Portable mock quote IDs allow separate serverless functions to verify a quote
 * without a shared process cache. The token remains opaque to the client. */
export function encodeQuoteId(claims: z.infer<typeof Claims>) {
  return `q1.${Buffer.from(JSON.stringify(Claims.parse(claims))).toString('base64url')}`;
}
export function decodeQuoteId(id: string) {
  if (!id.startsWith('q1.') || id.length > 4096)
    throw new Error('Invalid quote ID');
  return Claims.parse(
    JSON.parse(Buffer.from(id.slice(3), 'base64url').toString('utf8')),
  );
}
