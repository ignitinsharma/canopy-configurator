import { it, expect, vi } from 'vitest';
import { createBitmapCache } from './bitmapCache';
import type { AssetStore } from '@core/contracts';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
it('decodes once per live ID, releases unused bitmaps and closes late results', async () => {
  let finish: ((b: ImageBitmap) => void) | undefined;
  const first = { close: vi.fn() } as unknown as ImageBitmap,
    late = { close: vi.fn() } as unknown as ImageBitmap;
  const store = {
    resolve: vi.fn(async () => ({ blob: new Blob() })),
  } as unknown as AssetStore;
  const change = vi.fn(),
    decode = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(
        () => new Promise<ImageBitmap>((resolve) => (finish = resolve)),
      );
  const cache = createBitmapCache(store, change, decode);
  cache.sync(['a']);
  cache.sync(['a']);
  await tick();
  expect(decode).toHaveBeenCalledOnce();
  expect(cache.resolved().get('a')).toBe(first);
  cache.sync(['b']);
  await tick();
  expect(first.close).toHaveBeenCalledOnce();
  cache.sync([]);
  finish!(late);
  await tick();
  expect(late.close).toHaveBeenCalledOnce();
  expect(cache.resolved().size).toBe(0);
  cache.dispose();
});
it('retains failure status for visible placeholders instead of rejecting into rendering', async () => {
  const cache = createBitmapCache(
    {
      resolve: async () => {
        throw new Error('missing');
      },
    } as unknown as AssetStore,
    () => {},
    async () => ({}) as ImageBitmap,
  );
  cache.sync(['a']);
  await tick();
  expect(cache.errors()[0]?.id).toBe('a');
  expect(cache.resolved().size).toBe(0);
  cache.dispose();
});
