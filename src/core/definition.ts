import { atlasPolygon, polygonsOverlap } from './geometry';
import { z } from 'zod';
import { Id, Color, Positive, Unit } from './config';
const Resource = z.string().regex(/^\/(?!\/)[^\s?#]+$/);
export const GeometrySchema = z.strictObject({
  // Image coordinates: v increases from TOP. CanvasTexture must use flipY=false.
  uvRect: z
    .strictObject({ u0: Unit, v0: Unit, u1: Unit, v1: Unit })
    .refine((r) => r.u1 > r.u0 && r.v1 > r.v0, 'Invalid UV bounds'),
  // Clockwise atlas-space content rotation about the rectangle center. Rotate
  // normalized section coordinates before fitting to the atlas rectangle.
  atlasRotationDeg: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
  sizeMeters: z.strictObject({ width: Positive, height: Positive }),
  // Upright triangle: apex at (.5,0), eave/base at y=1; clip before rotation.
  shape: z.enum(['triangle', 'rect']),
  target: z.strictObject({
    nodeName: z.string().min(1),
    materialName: z.string().min(1),
    uvSet: z.literal(0),
  }),
});
const Choice = z.strictObject({
  id: Id,
  label: z.string().min(1),
  color: Color.optional(),
  pricingRef: Id.optional(),
});
const Single = z.strictObject({
  id: Id,
  label: z.string().min(1),
  kind: z.literal('single'),
  role: z.enum(['material-color', 'commercial']),
  bindingId: Id.optional(),
  choices: z.array(Choice).min(1),
  defaultValue: Id,
});
const Multi = z.strictObject({
  id: Id,
  label: z.string().min(1),
  kind: z.literal('multi'),
  role: z.literal('commercial'),
  choices: z.array(Choice).min(1),
  defaultValue: z.array(Id),
  maxSelections: z.number().int().nonnegative(),
});
export const ProductDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: Id,
  revision: Id,
  name: z.string().min(1),
  pricing: z.strictObject({ configurationRef: Id }),
  commerce: z.strictObject({ catalogRef: Id }),
  fonts: z
    .array(
      z.strictObject({
        id: Id,
        family: z.string().min(1),
        fileUrl: Resource,
        weight: z.number().int().min(100).max(900),
        style: z.enum(['normal', 'italic']),
      }),
    )
    .min(1),
  materialResolution: z
    .strictObject({
      strategy: z.literal('material-name'),
      printable: z.string().min(1),
      inner: z.string().min(1),
      frame: z.string().min(1),
    })
    .optional(),
  materialBindings: z.array(
    z.strictObject({
      id: Id,
      nodeNames: z.array(z.string().min(1)).min(1),
      materialName: z.string().min(1),
      property: z.literal('color'),
    }),
  ),
  sections: z
    .array(
      z.strictObject({
        id: Id,
        label: z.string().min(1),
        type: Id,
        variantIds: z.array(Id).min(1),
        allowedElementTypes: z.array(z.enum(['text', 'image'])).min(1),
        constraints: z.strictObject({
          maxElements: z.number().int().min(0).max(100),
          minFontSizePt: Positive,
          safeMarginMeters: z.number().finite().nonnegative().default(0.025),
          bleedMeters: z.number().finite().nonnegative().default(0.003),
          allowedFontIds: z.array(Id).min(1),
          maxTextLength: z.number().int().positive().max(5000),
          image: z.strictObject({
            allowedMimeTypes: z
              .array(
                z.enum([
                  'image/png',
                  'image/jpeg',
                  'image/webp',
                  'image/svg+xml',
                ]),
              )
              .min(1),
            maxBytes: z.number().int().positive(),
            maxWidthPx: z.number().int().positive(),
            maxHeightPx: z.number().int().positive(),
            maxPixels: z.number().int().positive(),
            recommendedDpi: Positive,
            warningDpi: Positive.default(100),
            blockingDpi: Positive.default(50),
          }),
        }),
      }),
    )
    .min(1),
  variants: z
    .array(
      z.strictObject({
        id: Id,
        label: z.string().min(1),
        modelUrl: Resource,
        basePriceRef: Id,
        realWidthMeters: Positive,
        modelNormalization: z.strictObject({
          method: z.literal('bounding-box-width'),
          axis: z.enum(['x', 'z']),
          note: z.string().min(1),
        }),
        atlas: z.strictObject({
          widthPx: z.number().int().positive(),
          heightPx: z.number().int().positive(),
          flipY: z.literal(false),
          uvOrigin: z.literal('top-left'),
        }),
        sectionGeometry: z.record(Id, GeometrySchema),
      }),
    )
    .min(1),
  optionGroups: z.array(z.discriminatedUnion('kind', [Single, Multi])),
});
export type ProductDefinition = z.infer<typeof ProductDefinitionSchema>;

/** Validate references only after structural parsing. Never imports product data. */
export function parseDefinition(input: unknown): ProductDefinition {
  const d = ProductDefinitionSchema.parse(input);
  const unique = (ids: string[]) => {
    if (new Set(ids).size !== ids.length)
      throw new Error('DUPLICATE_DEFINITION_ID');
  };
  for (const list of [
    d.sections,
    d.variants,
    d.fonts,
    d.materialBindings,
    d.optionGroups,
  ])
    unique(list.map((x) => x.id));
  for (const group of d.optionGroups) {
    unique(group.choices.map((x) => x.id));
    const defaults = Array.isArray(group.defaultValue)
      ? group.defaultValue
      : [group.defaultValue];
    unique(defaults);
    if (defaults.some((id) => !group.choices.some((x) => x.id === id)))
      throw new Error('INVALID_OPTION_DEFAULT');
    if (group.kind === 'multi' && defaults.length > group.maxSelections)
      throw new Error('INVALID_OPTION_DEFAULT');
    if (
      group.kind === 'single' &&
      group.role === 'material-color' &&
      (!d.materialBindings.some((b) => b.id === group.bindingId) ||
        group.choices.some((c) => !c.color))
    )
      throw new Error('INVALID_MATERIAL_BINDING');
  }
  for (const section of d.sections) {
    unique(section.variantIds);
    if (
      section.variantIds.some((id) => !d.variants.some((v) => v.id === id)) ||
      section.constraints.allowedFontIds.some(
        (id) => !d.fonts.some((f) => f.id === id),
      )
    )
      throw new Error('INVALID_SECTION_REFERENCE');
  }
  for (const variant of d.variants) {
    const required = d.sections
      .filter((s) => s.variantIds.includes(variant.id))
      .map((s) => s.id);
    if (
      required.length !== Object.keys(variant.sectionGeometry).length ||
      required.some((id) => !variant.sectionGeometry[id])
    )
      throw new Error('INCOMPLETE_GEOMETRY');
    const entries = Object.values(variant.sectionGeometry);
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!,
          b = entries[j]!;
        if (
          a.target.nodeName === b.target.nodeName &&
          a.target.materialName === b.target.materialName &&
          polygonsOverlap(atlasPolygon(a), atlasPolygon(b))
        )
          throw new Error('OVERLAPPING_PRINTABLE_REGIONS');
      }
  }

  return d;
}
