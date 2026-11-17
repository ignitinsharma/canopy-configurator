import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ApiErrorSchema,
  PriceRequestSchema,
  CartRequestSchema,
  CartReceiptSchema,
  type ApiError,
  type CartReceipt,
} from '../../src/core/contracts';
import { parseDefinition } from '../../src/core/definition';
import definitionData from '../../src/products/canopy-tent/definition.json';
import { fingerprint } from '../../src/core/serialization';
import { computeQuote } from '../pricing/engine';
import { canopyRules } from '../pricing/rules';
import {
  encodeQuoteId,
  decodeQuoteId,
  signQuote,
  verifySignature,
} from '../pricing/signature';
const definition = parseDefinition(definitionData);
type Code = ApiError['error']['code'];
class HttpError extends Error {
  constructor(
    public status: number,
    public code: Code,
    message: string,
  ) {
    super(message);
  }
}
export interface HandlerOptions {
  secret?: string;
  latencyMinMs?: number;
  latencyMaxMs?: number;
  failureRate?: number;
  now?: () => number;
  random?: () => number;
  env?: Record<string, string | undefined>;
}
export function errorResponse(
  status: number,
  code: Code,
  message: string,
  details?: string[],
) {
  return Response.json(
    ApiErrorSchema.parse({
      error: { code, message, ...(details ? { details } : {}) },
    }),
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_JSON', 'Expected a JSON body');
  let length = 0,
    text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 1048576) {
        await reader.cancel();
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 1 MiB');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpError(400, 'INVALID_JSON', 'Malformed JSON');
    }
  } finally {
    reader.releaseLock();
  }
}
/** Same Web-standard handlers run in Vite dev/preview and Vercel. Only the
 * mock idempotency ledger is process-local; portable signed quotes are stateless. */
export function createApiHandlers(options: HandlerOptions = {}) {
  const now = options.now ?? Date.now,
    random = options.random ?? Math.random;
  const ledger = new Map<
    string,
    { hash: string; receipt: CartReceipt; expires: number }
  >();
  const env = () => options.env ?? process.env;
  const number = (value: string | undefined, fallback: number) =>
    value !== undefined && Number.isFinite(Number(value))
      ? Number(value)
      : fallback;
  const secret = () => {
    const value = options.secret ?? env().PRICING_SIGNING_SECRET;
    if (value) return value;
    if (process.env.NODE_ENV === 'production')
      throw new Error('Signing secret is not configured');
    return 'canopy-local-development-secret';
  };
  async function wrap(request: Request, run: () => Promise<Response>) {
    try {
      if (request.method !== 'POST')
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST');
      const min = Math.max(
          0,
          options.latencyMinMs ?? number(env().MOCK_API_LATENCY_MIN_MS, 150),
        ),
        max = Math.max(
          min,
          options.latencyMaxMs ?? number(env().MOCK_API_LATENCY_MAX_MS, 300),
        );
      await new Promise((resolve) =>
        setTimeout(resolve, min + random() * (max - min)),
      );
      request.signal.throwIfAborted();
      if (
        random() <
        (options.failureRate ?? number(env().MOCK_API_FAILURE_RATE, 0))
      )
        throw new HttpError(
          500,
          'SIMULATED_FAILURE',
          'Simulated mock API failure',
        );
      return await run();
    } catch (error) {
      if (error instanceof HttpError)
        return errorResponse(error.status, error.code, error.message);
      if (error instanceof z.ZodError)
        return errorResponse(
          400,
          'INVALID_REQUEST',
          'Invalid request',
          error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        );
      if (error instanceof Error && error.message === 'UNSUPPORTED_CURRENCY')
        return errorResponse(
          422,
          'UNSUPPORTED_CURRENCY',
          'Only USD is supported by the mock catalog',
        );
      if (error instanceof Error && error.message === 'INVALID_CONFIG')
        return errorResponse(
          422,
          'INVALID_CONFIG',
          'Configuration does not match the product definition',
        );
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'The request could not be completed',
      );
    }
  }
  return {
    price: (request: Request) =>
      wrap(request, async () => {
        const input = PriceRequestSchema.parse(await body(request)),
          issuedAt = now(),
          nonce = randomUUID();
        const quote = await computeQuote(input.config, canopyRules, {
          definition,
          currency: input.currency,
          now: issuedAt,
          quoteId: nonce,
          secret: secret(),
        });
        quote.quoteId = encodeQuoteId({
          nonce,
          configHash: quote.configHash,
          total: quote.total,
          currency: 'USD',
          issuedAt: quote.issuedAt,
          expiresAt: quote.expiresAt,
          rulesVersion: quote.rulesVersion,
        });
        quote.signature = signQuote(quote, secret());
        return Response.json(quote, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }),
    cart: (request: Request) =>
      wrap(request, async () => {
        const input = CartRequestSchema.parse(await body(request));
        let claims: ReturnType<typeof decodeQuoteId>;
        try {
          claims = decodeQuoteId(input.quoteId);
        } catch {
          throw new HttpError(409, 'INVALID_SIGNATURE', 'Invalid quote token');
        }
        const signed = { ...claims, quoteId: input.quoteId };
        if (!verifySignature(signed, input.signature, secret()))
          throw new HttpError(
            409,
            'INVALID_SIGNATURE',
            'Quote signature is invalid',
          );
        if (
          Date.parse(claims.expiresAt) <= now() ||
          Date.parse(claims.issuedAt) > now()
        )
          throw new HttpError(
            409,
            'QUOTE_EXPIRED',
            'Refresh the expired quote',
          );
        if (
          claims.rulesVersion !== canopyRules.version ||
          claims.configHash !== (await fingerprint(input.config))
        )
          throw new HttpError(
            409,
            'QUOTE_MISMATCH',
            'Configuration or pricing rules changed; refresh the quote',
          );
        const recalculated = await computeQuote(input.config, canopyRules, {
          definition,
          currency: claims.currency,
          now: Date.parse(claims.issuedAt),
          quoteId: input.quoteId,
          secret: secret(),
        });
        if (
          recalculated.total !== claims.total ||
          !verifySignature(recalculated, input.signature, secret())
        )
          throw new HttpError(
            409,
            'QUOTE_MISMATCH',
            'Authoritative price changed',
          );
        if (
          input.pdfRef &&
          input.pdfRef.configFingerprint !== claims.configHash
        )
          throw new HttpError(
            409,
            'QUOTE_MISMATCH',
            'PDF does not match this configuration',
          );
        // No await between ledger lookup and insert: concurrent requests cannot both
        // create receipts within one process. Production must use durable idempotency.
        const payloadHash = JSON.stringify({
          hash: claims.configHash,
          quoteId: input.quoteId,
          pdf: input.pdfRef ?? null,
        });
        for (const [key, value] of ledger)
          if (value.expires <= now()) ledger.delete(key);
        const prior = ledger.get(input.idempotencyKey);
        if (prior) {
          if (prior.hash !== payloadHash)
            throw new HttpError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key was used for a different request',
            );
          return Response.json(prior.receipt, {
            headers: { 'Cache-Control': 'no-store' },
          });
        }
        const variant = definition.variants.find(
            (v) => v.id === input.config.variantId,
          )!,
          rule = canopyRules.variants[variant.basePriceRef]!,
          cartId = `gid://shopify/Cart/mock-${randomUUID()}`,
          lineId = `gid://shopify/CartLine/mock-${randomUUID()}`;
        const receipt = CartReceiptSchema.parse({
          cartId,
          lineIds: [lineId],
          lineItems: [
            {
              id: lineId,
              variantId: rule.shopifyVariantId,
              quantity: input.config.quantity,
              properties: {
                _config_hash: claims.configHash,
                _quote_id: input.quoteId,
                _rules_version: canopyRules.version,
                _config_ref: claims.configHash,
                ...(input.pdfRef
                  ? { _production_pdf_id: input.pdfRef.documentId }
                  : {}),
              },
            },
          ],
          checkoutUrl: 'https://example.com/mock-checkout',
        });
        if (ledger.size >= 1000) ledger.delete(ledger.keys().next().value!);
        ledger.set(input.idempotencyKey, {
          hash: payloadHash,
          receipt,
          expires: Date.parse(claims.expiresAt),
        });
        return Response.json(receipt, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }),
  };
}
const handlers = createApiHandlers();
export const handlePrice = (request: Request) => handlers.price(request);
export const handleCart = (request: Request) => handlers.cart(request);
