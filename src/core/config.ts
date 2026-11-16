import { z } from 'zod';
export const Id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const Positive = z.number().finite().positive();
export const Unit = z.number().finite().min(0).max(1);
export const TransformSchema = z.strictObject({
  position: z.strictObject({ x: Unit, y: Unit }),
  size: z.strictObject({ width: Positive.max(1), height: Positive.max(1) }),
  scale: Positive.max(10),
  rotationDeg: z.number().finite().min(-180).max(180),
});
const base = { id: Id, transform: TransformSchema };
export const TextElementSchema = z.strictObject({
  ...base,
  type: z.literal('text'),
  text: z.string().max(5000),
  color: Color,
  fontId: Id,
  fontSize: Positive.max(1),
  align: z.enum(['left', 'center', 'right']),
  lineHeight: Positive.max(3),
});
export const ImageElementSchema = z.strictObject({
  ...base,
  type: z.literal('image'),
  assetId: Id,
  fit: z.literal('contain'),
  opacity: Unit,
});
export const ElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  ImageElementSchema,
]);
export const AssetMetadataSchema = z.strictObject({
  id: Id,
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  byteSize: z.number().int().positive(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const SectionConfigSchema = z.strictObject({
  backgroundColor: Color.nullable(),
  elements: z.array(ElementSchema).max(100),
});
export const ProductConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  productId: Id,
  definitionRevision: Id,
  variantId: Id,
  quantity: z.number().int().min(1).max(100),
  optionSelections: z.record(Id, z.union([Id, z.array(Id)])),
  sections: z.record(Id, SectionConfigSchema),
  assets: z.record(Id, AssetMetadataSchema),
});
export type ProductConfig = z.infer<typeof ProductConfigSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type DesignElement = z.infer<typeof ElementSchema>;
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
