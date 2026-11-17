import { z } from 'zod';
import {
  ProductConfigSchema,
  type ProductConfig,
  type AssetMetadata,
} from './config';
import type { ProductDefinition } from './definition';
const Money = z.number().int().safe();
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const PriceLineSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['base', 'customization', 'option', 'discount', 'fee']),
  quantity: z.number().int().positive(),
  unitAmount: Money,
  amount: Money,
  meta: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});
export const QuoteWarningSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  sectionId: z.string().optional(),
  elementId: z.string().optional(),
});
export const PriceQuoteSchema = z
  .strictObject({
    quoteId: z.string().min(1).max(4096),
    currency: z.string().regex(/^[A-Z]{3}$/),
    minorUnitDigits: z.number().int().min(0).max(4),
    lineItems: z.array(PriceLineSchema).min(1),
    subtotal: Money.nonnegative(),
    discountTotal: Money.nonnegative(),
    total: Money.nonnegative(),
    warnings: z.array(QuoteWarningSchema),
    configHash: Hash,
    expiresAt: z.iso.datetime(),
    issuedAt: z.iso.datetime(),
    signature: Hash,
    rulesVersion: z.string().min(1),
    definitionRevision: z.string().min(1),
    taxPolicy: z.literal('excluded-shopify-checkout'),
  })
  .superRefine((q, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (q.total !== q.subtotal - q.discountTotal)
      add('Inconsistent quote total');
    if (q.lineItems.some((l) => l.amount !== l.quantity * l.unitAmount))
      add('Inconsistent line amount');
    const positive = q.lineItems
        .filter((l) => l.kind !== 'discount')
        .reduce((sum, l) => sum + l.amount, 0),
      discount = -q.lineItems
        .filter((l) => l.kind === 'discount')
        .reduce((sum, l) => sum + l.amount, 0);
    if (positive !== q.subtotal || discount !== q.discountTotal)
      add('Inconsistent quote breakdown');
    if (
      q.lineItems.some((l) =>
        l.kind === 'discount' ? l.amount > 0 : l.amount < 0,
      )
    )
      add('Invalid line sign');
    if (Date.parse(q.expiresAt) <= Date.parse(q.issuedAt))
      add('Invalid quote lifetime');
  });
export const PdfRefSchema = z.strictObject({
  documentId: z.string().min(1),
  configFingerprint: Hash,
  mediaType: z.literal('application/pdf'),
});
export const PriceRequestSchema = z.strictObject({
  config: ProductConfigSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const CartRequestSchema = z.strictObject({
  config: ProductConfigSchema,
  quoteId: z.string().min(1).max(4096),
  signature: Hash,
  pdfRef: PdfRefSchema.optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export const CartReceiptSchema = z.strictObject({
  cartId: z.string().min(1),
  lineIds: z.array(z.string()).min(1),
  lineItems: z
    .array(
      z.strictObject({
        id: z.string(),
        variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
        quantity: z.number().int().positive(),
        properties: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
  checkoutUrl: z.httpUrl(),
});
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      'INVALID_JSON',
      'INVALID_REQUEST',
      'INVALID_CONFIG',
      'UNSUPPORTED_CURRENCY',
      'QUOTE_EXPIRED',
      'QUOTE_MISMATCH',
      'INVALID_SIGNATURE',
      'IDEMPOTENCY_CONFLICT',
      'SIMULATED_FAILURE',
      'INTERNAL_ERROR',
      'METHOD_NOT_ALLOWED',
      'NOT_FOUND',
      'PAYLOAD_TOO_LARGE',
    ]),
    message: z.string(),
    details: z.array(z.string()).optional(),
  }),
});
export type PriceQuote = z.infer<typeof PriceQuoteSchema>;
export type PriceLine = z.infer<typeof PriceLineSchema>;
export type CartReceipt = z.infer<typeof CartReceiptSchema>;
export type PdfRef = z.infer<typeof PdfRefSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export interface RequestContext {
  signal?: AbortSignal;
}
export interface PricingService {
  quote(
    config: ProductConfig,
    context: RequestContext & { currency: string; marketRef?: string },
  ): Promise<PriceQuote>;
}
export interface CommerceAdapter {
  addToCart(
    config: ProductConfig,
    quote: PriceQuote,
    pdfRef: PdfRef | undefined,
    context: RequestContext & { idempotencyKey: string },
  ): Promise<CartReceipt>;
}
export interface AssetStore {
  upload(
    file: Blob,
    context?: RequestContext & {
      limits?: ProductDefinition['sections'][number]['constraints']['image'];
    },
  ): Promise<AssetMetadata>;
  resolve(
    assetId: string,
    context?: RequestContext,
  ): Promise<{ blob: Blob; metadata: AssetMetadata }>;
}
export interface ConfiguratorDependencies {
  pricing: PricingService;
  commerce: CommerceAdapter;
  assets: AssetStore;
}
