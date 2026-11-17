import type { ProductConfig, ImageElement, AssetMetadata } from './config.js';
import type { ProductDefinition } from './definition.js';
import type { Geometry } from './geometry.js';
/** Contain fit: use the actual drawn width, not the potentially letterboxed box. */
export function effectiveDpi(
  asset: Pick<AssetMetadata, 'widthPx' | 'heightPx'>,
  element: ImageElement,
  geometry: Geometry,
) {
  const w = element.transform.size.width * geometry.sizeMeters.width,
    h = element.transform.size.height * geometry.sizeMeters.height;
  const drawnWidth =
    Math.min(w, (h * asset.widthPx) / asset.heightPx) * element.transform.scale;
  return asset.widthPx / (drawnWidth / 0.0254);
}
export interface ResolutionWarning {
  sectionId: string;
  elementId: string;
  dpi: number;
  level: 'warning' | 'blocking';
  message: string;
}
export function selectResolutionWarnings(state: {
  config: ProductConfig;
  definition: ProductDefinition;
}): ResolutionWarning[] {
  const { config, definition } = state;
  const variant = definition.variants.find((v) => v.id === config.variantId);
  if (!variant) return [];
  const warnings: ResolutionWarning[] = [];
  for (const section of definition.sections) {
    const geometry = variant.sectionGeometry[section.id],
      content = config.sections[section.id];
    if (!geometry || !content) continue;
    for (const e of content.elements)
      if (e.type === 'image') {
        const asset = config.assets[e.assetId];
        if (!asset) continue;
        const dpi = effectiveDpi(asset, e, geometry),
          limit = section.constraints.image;
        if (dpi < limit.warningDpi)
          warnings.push({
            sectionId: section.id,
            elementId: e.id,
            dpi,
            level: dpi < limit.blockingDpi ? 'blocking' : 'warning',
            message: `${Math.round(dpi)} DPI — ${dpi < limit.blockingDpi ? 'very low' : 'low'} resolution (recommended ${limit.recommendedDpi} DPI)`,
          });
      }
  }
  return warnings;
}
