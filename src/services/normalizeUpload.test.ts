import { expect, it } from 'vitest';
import {
  validateUploadHeader,
  downscaledDimensions,
  sanitizeSvg,
  defaultImageLimits,
} from './normalizeUpload';
it('checks section-specific upload type and byte limits before decoding', () => {
  expect(() =>
    validateUploadHeader({ type: 'image/png', size: 100 }, defaultImageLimits),
  ).not.toThrow();
  expect(() =>
    validateUploadHeader({ type: 'text/html', size: 100 }, defaultImageLimits),
  ).toThrow();
  expect(() =>
    validateUploadHeader(
      { type: 'image/png', size: 100 },
      { ...defaultImageLimits, maxBytes: 10 },
    ),
  ).toThrow();
  expect(() =>
    validateUploadHeader({ type: 'image/png', size: 0 }, defaultImageLimits),
  ).toThrow();
});
it('keeps aspect ratio and never upscales uploads', () => {
  expect(downscaledDimensions(4000, 1000)).toEqual({
    width: 2048,
    height: 512,
  });
  expect(downscaledDimensions(100, 200)).toEqual({ width: 100, height: 200 });
});
it('sanitizes SVG scripts, external images/styles/URLs and rasterizes a bounded viewport', () => {
  const safe = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4000 1000"><script>alert(1)</script><image href="https://bad.example/a.png"/><style>path{fill:url(https://bad.example/a)}</style><path d="M0 0h50v50z" fill="url(https://bad.example/a)" onload="alert(1)"/></svg>',
  );
  expect(safe).not.toMatch(/<script|<image|<style|onload=|https:\/\/bad/);
  expect(safe).toContain('width="2048"');
  expect(() => sanitizeSvg('<!DOCTYPE svg><svg/>')).toThrow();
});
