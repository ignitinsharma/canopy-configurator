import type { AssetStore } from '@core/contracts';
/** CPU image resources are reference-owned by the currently used asset IDs.
 * A late resolve after removal/disposal closes its bitmap instead of resurrecting it. */
export function createBitmapCache(
  store: AssetStore,
  onChange: (assetId: string) => void,
  decode: (blob: Blob) => Promise<ImageBitmap> = (blob) =>
    createImageBitmap(blob),
) {
  const entries = new Map<string, { bitmap?: ImageBitmap; error?: string }>();
  let disposed = false;
  return {
    sync(ids: Iterable<string>) {
      const used = new Set(ids);
      for (const [id, entry] of entries)
        if (!used.has(id)) {
          entry.bitmap?.close();
          entries.delete(id);
        }
      for (const id of used) {
        if (disposed || entries.has(id)) continue;
        const entry: { bitmap?: ImageBitmap; error?: string } = {};
        entries.set(id, entry);
        void store
          .resolve(id)
          .then(({ blob }) => decode(blob))
          .then((bitmap) => {
            if (disposed || entries.get(id) !== entry) {
              bitmap.close();
              return;
            }
            entry.bitmap = bitmap;
            onChange(id);
          })
          .catch((error) => {
            if (!disposed && entries.get(id) === entry) {
              entry.error = String(error);
              onChange(id);
            }
          });
      }
    },
    resolved() {
      return new Map(
        [...entries].flatMap(([id, e]) =>
          e.bitmap ? [[id, e.bitmap] as const] : [],
        ),
      );
    },
    errors() {
      return [...entries].flatMap(([id, e]) =>
        e.error ? [{ id, message: e.error }] : [],
      );
    },
    dispose() {
      disposed = true;
      entries.forEach((e) => e.bitmap?.close());
      entries.clear();
    },
  };
}
