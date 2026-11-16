import { ProductConfigSchema } from './config';
/** V1 has no historical migrations. Unknown versions fail explicitly. */
export function loadConfig(input: unknown) {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > 1048576)
      throw new Error('CONFIG_TOO_LARGE');
    input = JSON.parse(input) as unknown;
  }
  return ProductConfigSchema.parse(input);
}
