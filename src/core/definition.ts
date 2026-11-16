import { z } from 'zod';
import { Id, Color, Positive, Unit } from './config';
const Point = z.tuple([Unit, Unit]);
const Resource = z.string().regex(/^\/(?!\/)[^\s?#]+$/);
export const GeometrySchema = z.strictObject({
  uvRect: z.tuple([Unit, Unit, Positive, Positive]),
  uvCorners: z.tuple([Point, Point, Point, Point]),
  aspectRatio: Positive,
  printableArea: z.strictObject({
    unit: z.literal('cm'),
    width: Positive,
    height: Positive,
    polygon: z.array(Point).min(3),
  }),
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
          allowedFontIds: z.array(Id).min(1),
          maxTextLength: z.number().int().positive().max(5000),
          image: z.strictObject({
            allowedMimeTypes: z
              .array(z.enum(['image/png', 'image/jpeg', 'image/webp']))
              .min(1),
            maxBytes: z.number().int().positive(),
            maxWidthPx: z.number().int().positive(),
            maxHeightPx: z.number().int().positive(),
            maxPixels: z.number().int().positive(),
            recommendedDpi: Positive,
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
        atlas: z.strictObject({
          widthPx: z.number().int().positive(),
          heightPx: z.number().int().positive(),
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
          a.target.materialName === b.target.materialName
        ) {
          const [x, y, w, h] = a.uvRect,
            [bx, by, bw, bh] = b.uvRect;
          if (
            Math.min(x + w, bx + bw) - Math.max(x, bx) > 1e-9 &&
            Math.min(y + h, by + bh) - Math.max(y, by) > 1e-9
          )
            throw new Error('OVERLAPPING_UV_REGIONS');
        }
      }
    for (const g of entries) {
      const [u, v, w, h] = g.uvRect;
      if (
        u + w > 1 + 1e-9 ||
        v + h > 1 + 1e-9 ||
        g.uvCorners.some(
          ([x, y]) =>
            x < u - 1e-9 ||
            x > u + w + 1e-9 ||
            y < v - 1e-9 ||
            y > v + h + 1e-9,
        )
      )
        throw new Error('INVALID_UV_RECT');
      const [a, b, c, e] = g.uvCorners;
      const determinant =
        (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]);
      if (
        Math.abs(determinant) < 1e-12 ||
        Math.abs(c[0] - (b[0] + e[0] - a[0])) > 1e-6 ||
        Math.abs(c[1] - (b[1] + e[1] - a[1])) > 1e-6
      )
        throw new Error('NON_AFFINE_UV');
      if (
        Math.abs(
          g.aspectRatio - g.printableArea.width / g.printableArea.height,
        ) > 1e-6
      )
        throw new Error('INVALID_ASPECT_RATIO');
      const polygon = g.printableArea.polygon;
      const area = polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length]!;
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0);
      if (Math.abs(area) < 1e-9) throw new Error('DEGENERATE_POLYGON');
    }
  }
  return d;
}
