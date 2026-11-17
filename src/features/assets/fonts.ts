import type { ProductDefinition } from '@core/definition';
/** Caller owns this manager; no remote CSS or Google Fonts is used. */
export function createFontManager(
  fonts: ProductDefinition['fonts'],
  changed: (id: string) => void,
) {
  const ready = new Set<string>(),
    pending = new Set<string>(),
    failures = new Set<string>(),
    faces = new Map<string, FontFace>();
  let disposed = false;
  return {
    ensure(ids: Iterable<string>) {
      for (const id of ids) {
        if (disposed || ready.has(id) || pending.has(id) || failures.has(id))
          continue;
        const font = fonts.find((f) => f.id === id);
        if (!font) {
          failures.add(id);
          continue;
        }
        pending.add(id);
        void (async () => {
          try {
            if (!document.fonts || typeof FontFace === 'undefined')
              throw new Error('Font loading unavailable');
            const face = new FontFace(font.family, `url("${font.fileUrl}")`, {
              weight: String(font.weight),
              style: font.style,
            });
            faces.set(id, face);
            await face.load();
            if (disposed) return;
            document.fonts.add(face);
            await document.fonts.load(
              `${font.style} ${font.weight} 16px "${font.family}"`,
            );
            if (!disposed) {
              ready.add(id);
              changed(id);
            }
          } catch {
            if (!disposed) {
              failures.add(id);
              changed(id);
            }
          } finally {
            pending.delete(id);
          }
        })();
      }
    },
    settled(id: string) {
      return ready.has(id) || failures.has(id);
    },
    loadedFonts() {
      return fonts.filter((f) => ready.has(f.id));
    },
    errors() {
      return [...failures];
    },
    dispose() {
      disposed = true;
      faces.forEach((face) => document.fonts?.delete(face));
      faces.clear();
    },
  };
}
