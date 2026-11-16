import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEmbedMode } from './useEmbedMode';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('useEmbedMode', () => {
  it.each([
    ['/', false],
    ['/?embed=1', true],
    ['/?embed=0', false],
    ['/?embed=true', false],
  ])('detects presentation mode for %s', (url, expected) => {
    window.history.replaceState({}, '', url);
    const { result } = renderHook(() => useEmbedMode());
    expect(result.current).toBe(expected);
  });
});
