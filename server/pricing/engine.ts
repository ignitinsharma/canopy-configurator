import {
  PriceQuoteSchema,
  type PriceQuote,
  type PriceLine,
} from '../../src/core/contracts';
import type { ProductConfig } from '../../src/core/config';
import type { ProductDefinition } from '../../src/core/definition';
import { fingerprint } from '../../src/core/serialization';
import { validateConfig } from '../../src/core/validation';
import { selectResolutionWarnings } from '../../src/core/resolution';
import { signQuote } from './signature';
import type { PricingRules } from './rules';
export interface QuoteContext {
  definition: ProductDefinition;
  currency: string;
  now: number;
  quoteId: string;
  secret: string;
}
/** Pure deterministic async calculation: no environment, random, clock, IO or UI imports. */
export async function computeQuote(
  config: ProductConfig,
  rules: PricingRules,
  context: QuoteContext,
): Promise<PriceQuote> {
  const { definition } = context;
  const problems = validateConfig(config, definition).filter(
    (i) => i.code !== 'FONT_TOO_SMALL',
  );
  if (problems.length) throw new Error('INVALID_CONFIG');
  if (context.currency !== rules.currency)
    throw new Error('UNSUPPORTED_CURRENCY');
  if (
    config.productId !== rules.productId ||
    definition.pricing.configurationRef !== rules.configurationRef
  )
    throw new Error('INVALID_CONFIG');
  const variant = definition.variants.find((v) => v.id === config.variantId)!,
    tier = rules.variants[variant.basePriceRef];
  if (!tier) throw new Error('INVALID_CONFIG');
  const baseColorId = config.optionSelections['fabric-base-color'];
  const baseColor =
    definition.optionGroups
      .find((g) => g.id === 'fabric-base-color')
      ?.choices.find((c) => c.id === baseColorId)
      ?.color?.toUpperCase() ?? '#FFFFFF';
  const active = definition.sections
    .filter((s) => s.variantIds.includes(variant.id))
    .map((s) => config.sections[s.id]!);
  const printed = active.filter(
    (s) =>
      s.elements.length > 0 ||
      (s.backgroundColor !== null &&
        s.backgroundColor.toUpperCase() !== baseColor),
  ).length;
  const imageIds = new Set(
    active.flatMap((s) =>
      s.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : [])),
    ),
  );
  const lines: PriceLine[] = [];
  const add = (
    id: string,
    label: string,
    kind: PriceLine['kind'],
    unitAmount: number,
    quantity: number,
    meta?: PriceLine['meta'],
  ) =>
    lines.push({
      id,
      label,
      kind,
      unitAmount,
      quantity,
      amount: unitAmount * quantity,
      ...(meta ? { meta } : {}),
    });
  add(
    'base',
    `${variant.label} canopy`,
    'base',
    tier.baseAmount,
    config.quantity,
    {
      pricingRef: variant.basePriceRef,
      printedSections: printed,
      shopifyVariantId: tier.shopifyVariantId,
    },
  );
  const extraSections = Math.max(0, printed - tier.includedPrintedSections),
    extraImages = Math.max(0, imageIds.size - tier.includedImages);
  if (extraSections)
    add(
      'printed-sections',
      'Extra printed sections',
      'customization',
      tier.extraSectionAmount,
      extraSections * config.quantity,
      {
        printedSections: printed,
        includedPerTent: tier.includedPrintedSections,
      },
    );
  if (extraImages)
    add(
      'extra-images',
      'Additional uploaded images',
      'customization',
      tier.extraImageAmount,
      extraImages * config.quantity,
      { uniqueImages: imageIds.size, includedPerTent: tier.includedImages },
    );
  if (printed >= rules.fullCoverageAt)
    add(
      'full-coverage',
      'Full coverage (6+ sections)',
      'customization',
      tier.fullCoverageAmount,
      config.quantity,
    );
  for (const group of definition.optionGroups) {
    const selection = config.optionSelections[group.id],
      values = Array.isArray(selection) ? selection : [selection];
    for (const id of values) {
      const choice = group.choices.find((c) => c.id === id)!;
      const ref = choice.pricingRef ?? `${group.id}:${id}`,
        price = rules.optionPrices[ref];
      if (!price) throw new Error('INVALID_CONFIG');
      if (price.amount || price.showWhenZero)
        add(
          `option:${group.id}:${id}`,
          choice.label,
          price.kind,
          price.amount,
          config.quantity,
          { pricingRef: ref },
        );
    }
  }
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0),
    discountTier = [...rules.quantityTiers]
      .sort((a, b) => b.min - a.min)
      .find((t) => config.quantity >= t.min),
    discountTotal = Math.round(
      (subtotal * (discountTier?.discountBps ?? 0)) / 10000,
    );
  if (discountTotal)
    add(
      'quantity-discount',
      `Quantity discount (${(discountTier?.discountBps ?? 0) / 100}%)`,
      'discount',
      -discountTotal,
      1,
      { discountBps: discountTier!.discountBps },
    );
  const unsigned = {
    quoteId: context.quoteId,
    currency: rules.currency,
    minorUnitDigits: rules.minorUnitDigits,
    lineItems: lines,
    subtotal,
    discountTotal,
    total: subtotal - discountTotal,
    warnings: selectResolutionWarnings({ config, definition }).map((w) => ({
      code: w.level === 'blocking' ? 'VERY_LOW_RESOLUTION' : 'LOW_RESOLUTION',
      message: w.message,
      sectionId: w.sectionId,
      elementId: w.elementId,
    })),
    configHash: await fingerprint(config),
    issuedAt: new Date(context.now).toISOString(),
    expiresAt: new Date(
      context.now + rules.quoteLifetimeSeconds * 1000,
    ).toISOString(),
    rulesVersion: rules.version,
    definitionRevision: definition.revision,
    taxPolicy: 'excluded-shopify-checkout' as const,
  };
  return PriceQuoteSchema.parse({
    ...unsigned,
    signature: signQuote(unsigned, context.secret),
  });
}
