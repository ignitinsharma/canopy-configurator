import { z } from 'zod';
import { ProductConfigSchema } from '@core/config';
const base = {
  source: z.literal('canopy-configurator'),
  version: z.literal(1),
};
const themeVariables = [
  '--color-background',
  '--color-surface',
  '--color-text',
  '--color-muted',
  '--color-border',
  '--color-accent',
] as const;
export const IncomingMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('load-config'),
    payload: z.strictObject({ config: ProductConfigSchema }),
  }),
  z.strictObject({
    ...base,
    type: z.literal('set-variant'),
    payload: z.strictObject({ variantId: z.string().min(1) }),
  }),
  z.strictObject({
    ...base,
    type: z.literal('set-quantity'),
    payload: z.strictObject({ quantity: z.number().int().min(1).max(100) }),
  }),
  z.strictObject({
    ...base,
    type: z.literal('request-config'),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...base,
    type: z.literal('set-theme'),
    payload: z.strictObject({
      variables: z.partialRecord(
        z.enum(themeVariables),
        z.string().regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/),
      ),
    }),
  }),
]);
export type OutgoingType =
  'ready' | 'resize' | 'config-changed' | 'add-to-cart' | 'error';
export function allowedOrigins(
  value: string | undefined,
  dev: boolean,
): string[] {
  if (!value) return dev ? ['*'] : [];
  return [
    ...new Set(
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].filter((value) => {
    if (value === '*') return dev;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    } catch {
      return false;
    }
  });
}
export function acceptsOrigin(origin: string, allowed: string[]) {
  return (
    origin !== 'null' && (allowed.includes(origin) || allowed.includes('*'))
  );
}
export function validateIncoming(
  data: unknown,
  origin: string,
  allowed: string[],
  isParent: boolean,
) {
  if (!isParent || !acceptsOrigin(origin, allowed)) return null;
  const parsed = IncomingMessageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
