import { z } from 'zod';
import data from './rules/canopy-tent.json';
const Amount = z.number().int().min(0).max(100000000);
export const PricingRulesSchema = z.strictObject({
  productId: z.string(),
  configurationRef: z.string(),
  version: z.string(),
  currency: z.literal('USD'),
  minorUnitDigits: z.literal(2),
  quoteLifetimeSeconds: z.number().int().positive().max(86400),
  variants: z.record(
    z.string(),
    z.strictObject({
      baseAmount: Amount,
      shopifyVariantId: z
        .string()
        .regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
      includedPrintedSections: z.number().int().nonnegative(),
      extraSectionAmount: Amount,
      includedImages: z.number().int().nonnegative(),
      extraImageAmount: Amount,
      fullCoverageAmount: Amount,
    }),
  ),
  fullCoverageAt: z.number().int().positive(),
  optionPrices: z.record(
    z.string(),
    z.strictObject({
      amount: Amount,
      kind: z.enum(['option', 'fee']),
      showWhenZero: z.boolean().optional(),
    }),
  ),
  quantityTiers: z
    .array(
      z.strictObject({
        min: z.number().int().positive(),
        discountBps: z.number().int().min(0).max(10000),
      }),
    )
    .min(1),
});
export type PricingRules = z.infer<typeof PricingRulesSchema>;
export const canopyRules = PricingRulesSchema.parse(data);
