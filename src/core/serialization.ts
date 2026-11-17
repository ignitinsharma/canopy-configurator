import { ProductConfigSchema, type ProductConfig } from './config.js';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function exportConfig(input: ProductConfig): ProductConfig {
  const config = ProductConfigSchema.parse(input);
  for (const [key, value] of Object.entries(config.optionSelections))
    if (Array.isArray(value)) config.optionSelections[key] = [...value].sort();
  const used = new Set(
    Object.values(config.sections).flatMap((s) =>
      s.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : [])),
    ),
  );
  config.assets = Object.fromEntries(
    Object.entries(config.assets).filter(([id]) => used.has(id)),
  );
  return config;
}
export function serializeConfig(config: ProductConfig): string {
  return JSON.stringify(canonical(exportConfig(config)));
}
export async function fingerprint(config: ProductConfig): Promise<string> {
  const bytes = new TextEncoder().encode(serializeConfig(config));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
