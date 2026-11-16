import type { ProductConfig } from './config';
export const selectVariantId = (s: { config: ProductConfig }) =>
  s.config.variantId;
export const selectSection = (id: string) => (s: { config: ProductConfig }) =>
  s.config.sections[id];
export const selectElement =
  (sectionId: string, elementId: string) => (s: { config: ProductConfig }) =>
    s.config.sections[sectionId]?.elements.find((e) => e.id === elementId);
