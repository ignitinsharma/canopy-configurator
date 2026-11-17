import type { ProductConfig } from '../config';
/** Reference comparison matches the store's structurally shared section snapshots. */
export function changedSectionIds(
  previous: ProductConfig['sections'] | null,
  next: ProductConfig['sections'],
): string[] {
  return Object.keys(next).filter(
    (id) => !previous || previous[id] !== next[id],
  );
}
/** One queued animation frame regardless of how many edits/resources complete. */
export function createDirtyQueue(
  flush: (ids: string[]) => void,
  request: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
) {
  const dirty = new Set<string>();
  let frame: number | null = null,
    disposed = false;
  return {
    mark(ids: Iterable<string>) {
      if (disposed) return;
      for (const id of ids) dirty.add(id);
      if (dirty.size && frame === null)
        frame = request(() => {
          frame = null;
          const ids = [...dirty];
          dirty.clear();
          flush(ids);
        });
    },
    flushNow() {
      if (frame !== null) cancel(frame);
      frame = null;
      const ids = [...dirty];
      dirty.clear();
      if (!disposed && ids.length) flush(ids);
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancel(frame);
      dirty.clear();
    },
  };
}
