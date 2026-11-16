import type { ProductConfig } from './config';
import type { ProductDefinition } from './definition';
export interface ValidationIssue {
  code: string;
  path: Array<string | number>;
  severity: 'error' | 'warning';
  message: string;
}
export function validateConfig(
  c: ProductConfig,
  d: ProductDefinition,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (code: string, path: Array<string | number>, message = code) =>
    issues.push({ code, path, severity: 'error', message });
  if (c.productId !== d.id || c.definitionRevision !== d.revision)
    fail('DEFINITION_MISMATCH', []);
  if (!d.variants.some((v) => v.id === c.variantId))
    fail('UNKNOWN_VARIANT', ['variantId']);
  for (const key of Object.keys(c.optionSelections))
    if (!d.optionGroups.some((g) => g.id === key))
      fail('UNKNOWN_OPTION', ['optionSelections', key]);
  for (const g of d.optionGroups) {
    const v = c.optionSelections[g.id];
    const values = Array.isArray(v) ? v : [v];
    if (
      (g.kind === 'single' && typeof v !== 'string') ||
      (g.kind === 'multi' &&
        (!Array.isArray(v) || v.length > g.maxSelections)) ||
      new Set(values).size !== values.length ||
      values.some((x) => !g.choices.some((y) => y.id === x))
    )
      fail('INVALID_OPTION', ['optionSelections', g.id]);
  }
  const ids = new Set<string>();
  for (const [id, s] of Object.entries(c.sections)) {
    const def = d.sections.find((x) => x.id === id);
    if (!def) {
      fail('UNKNOWN_SECTION', ['sections', id]);
      continue;
    }
    if (s.elements.length > def.constraints.maxElements)
      fail('MAX_ELEMENTS', ['sections', id]);
    for (const e of s.elements) {
      const path = ['sections', id, 'elements', e.id];
      if (ids.has(e.id)) fail('DUPLICATE_ELEMENT', path);
      ids.add(e.id);
      if (!def.allowedElementTypes.includes(e.type)) fail('ELEMENT_TYPE', path);
      if (e.type === 'text') {
        if (
          !def.constraints.allowedFontIds.includes(e.fontId) ||
          !d.fonts.some((f) => f.id === e.fontId)
        )
          fail('UNKNOWN_FONT', path);
        if (e.text.length > def.constraints.maxTextLength)
          fail('TEXT_LENGTH', path);
        const geometry = d.variants.find((v) => v.id === c.variantId)
          ?.sectionGeometry[id];
        if (
          geometry &&
          (e.fontSize *
            geometry.printableArea.height *
            e.transform.scale *
            72) /
            2.54 <
            def.constraints.minFontSizePt
        )
          fail('FONT_TOO_SMALL', path);
      } else {
        const asset = c.assets[e.assetId];
        if (!asset) fail('ASSET_NOT_FOUND', path);
        else {
          const limit = def.constraints.image;
          if (
            asset.id !== e.assetId ||
            !limit.allowedMimeTypes.includes(asset.mimeType) ||
            asset.byteSize > limit.maxBytes ||
            asset.widthPx > limit.maxWidthPx ||
            asset.heightPx > limit.maxHeightPx ||
            asset.widthPx * asset.heightPx > limit.maxPixels
          )
            fail('INVALID_ASSET', path);
        }
      }
    }
  }
  for (const s of d.sections)
    if (s.variantIds.includes(c.variantId) && !c.sections[s.id])
      fail('MISSING_SECTION', ['sections', s.id]);
  return issues;
}
