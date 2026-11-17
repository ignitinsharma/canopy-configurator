import { it, expect } from 'vitest';
import { allowedOrigins, validateIncoming } from './protocol';
const message = {
  source: 'canopy-configurator',
  version: 1,
  type: 'set-quantity',
  payload: { quantity: 5 },
};
it('requires an allowed exact parent origin and versioned valid messages', () => {
  const allowed = allowedOrigins('https://shop.example.com', false);
  expect(
    validateIncoming(message, 'https://shop.example.com', allowed, true),
  ).not.toBeNull();
  expect(
    validateIncoming(message, 'https://evil.example.com', allowed, true),
  ).toBeNull();
  expect(
    validateIncoming(message, 'https://shop.example.com', allowed, false),
  ).toBeNull();
  expect(
    validateIncoming(
      { ...message, version: 2 },
      'https://shop.example.com',
      allowed,
      true,
    ),
  ).toBeNull();
  expect(
    validateIncoming(
      { ...message, payload: { quantity: -1 } },
      'https://shop.example.com',
      allowed,
      true,
    ),
  ).toBeNull();
  expect(allowedOrigins(undefined, false)).toEqual([]);
  expect(allowedOrigins('*', false)).toEqual(['*']);
  expect(
    validateIncoming(message, 'https://reviewer.example', ['*'], true),
  ).not.toBeNull();
  expect(validateIncoming(message, 'null', ['*'], true)).toBeNull();
  expect(allowedOrigins(undefined, true)).toEqual(['*']);
});
it('allows only bounded theme variables, no CSS URLs', () => {
  const origin = 'https://shop.example.com';
  expect(
    validateIncoming(
      {
        source: 'canopy-configurator',
        version: 1,
        type: 'set-theme',
        payload: { variables: { '--color-accent': '#123456' } },
      },
      origin,
      [origin],
      true,
    ),
  ).not.toBeNull();
  expect(
    validateIncoming(
      {
        source: 'canopy-configurator',
        version: 1,
        type: 'set-theme',
        payload: {
          variables: { '--color-accent': 'url(https://evil.example)' },
        },
      },
      origin,
      [origin],
      true,
    ),
  ).toBeNull();
});
