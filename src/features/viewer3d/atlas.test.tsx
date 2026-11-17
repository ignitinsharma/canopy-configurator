import { afterEach, expect, it, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { ConfiguratorProvider } from '../ConfiguratorContext';
import { useAtlasTexture } from './useAtlasTexture';
const { invalidate, gl } = vi.hoisted(() => ({
  invalidate: vi.fn(),
  gl: { capabilities: { getMaxAnisotropy: () => 16 } },
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (s: unknown) => unknown) => select({ invalidate, gl }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('exposes a disposable atlas slot and preserves artwork when marking a section dirty', () => {
  const contexts = new WeakMap<HTMLCanvasElement, object>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      let context = contexts.get(this);
      if (!context) {
        context = {
          canvas: this,
          clip: vi.fn(),
          rect: vi.fn(),
          scale: vi.fn(),
          measureText: vi.fn(() => ({ width: 20 })),
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          closePath: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          fillText: vi.fn(),
        };
        contexts.set(this, context);
      }
      return context as CanvasRenderingContext2D;
    },
  );
  const { result, rerender, unmount } = renderHook(
    ({ id }) => useAtlasTexture(id),
    { initialProps: { id: '5x5' }, wrapper: ConfiguratorProvider },
  );
  const atlas = result.current!;
  expect(atlas.getCanvas().width).toBe(2048);
  expect(atlas.texture.flipY).toBe(false);
  expect(atlas.texture.anisotropy).toBe(8);
  act(() => atlas.flush());
  const base = atlas.getCanvas().getContext('2d')!;
  vi.mocked(base.fillRect).mockClear();
  const version = atlas.texture.version;
  act(() => {
    atlas.markDirty('roof-front');
    atlas.setOverlay('roof-left', true);
    atlas.flush();
  });
  expect(atlas.texture.version).toBeGreaterThan(version);
  expect(base.fillRect).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalled();
  const dispose = vi.spyOn(atlas.texture, 'dispose');
  rerender({ id: '8x8' });
  expect(dispose).toHaveBeenCalledOnce();
  expect(result.current).not.toBe(atlas);
  const nextDispose = vi.spyOn(result.current!.texture, 'dispose');
  unmount();
  expect(nextDispose).toHaveBeenCalledOnce();
});
