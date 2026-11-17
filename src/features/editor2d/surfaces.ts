import type { Configurator } from '../ConfiguratorContext';
import { createBitmapCache } from '../assets/bitmapCache';
import { createFontManager } from '../assets/fonts';
import { createDirtyQueue, changedSectionIds } from '@core/render/dirty';
import { renderSection } from '@core/render/section';
import type { ProductConfig } from '@core/config';
export type SurfaceKind = 'art' | 'thumb';
export interface Surface {
  canvas: HTMLCanvasElement | undefined;
  version: number;
  width: number;
  height: number;
}
const empty: Surface = { canvas: undefined, version: 0, width: 0, height: 0 };
export function createEditorSurfaces(
  instance: Configurator,
  variantId: string,
) {
  const definition = instance.store.getState().definition,
    variant = definition.variants.find((v) => v.id === variantId)!;
  const entries = new Map<string, Surface>(),
    listeners = new Set<(key: string) => void>(),
    counts: Record<string, number> = {};
  let previous: ProductConfig['sections'] | null = null,
    lastSelection = '',
    base = '',
    disposed = false;
  const queue = createDirtyQueue((keys) => {
    const state = instance.store.getState();
    for (const key of keys) {
      const [kind, id] = key.split(':') as [SurfaceKind, string],
        g = variant.sectionGeometry[id],
        config = state.config.sections[id];
      if (
        !g ||
        !config ||
        !config.elements.every(
          (e) => e.type !== 'text' || fonts.settled(e.fontId),
        )
      )
        continue;
      let entry = entries.get(key);
      if (!entry) {
        const long = kind === 'art' ? 1024 : 128,
          ppm = long / Math.max(g.sizeMeters.width, g.sizeMeters.height),
          canvas = document.createElement('canvas');
        canvas.width = Math.ceil(g.sizeMeters.width * ppm);
        canvas.height = Math.ceil(g.sizeMeters.height * ppm);
        entry = {
          canvas,
          version: 0,
          width: g.sizeMeters.width * ppm,
          height: g.sizeMeters.height * ppm,
        };
        entries.set(key, entry);
      }
      const ctx = entry.canvas!.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      renderSection(ctx, {
        sectionGeometry: g,
        sectionConfig: config,
        resolvedAssets: bitmaps.resolved(),
        fonts: fonts.loadedFonts(),
        pxPerMeter: entry.width / g.sizeMeters.width,
        baseColor: base,
      });
      entries.set(key, { ...entry, version: entry.version + 1 });
      if (import.meta.env.DEV) counts[key] = (counts[key] ?? 0) + 1;
      listeners.forEach((fn) => fn(key));
    }
  });
  function mark(id: string) {
    if (disposed) return;
    queue.mark([
      `thumb:${id}`,
      ...(id === instance.store.getState().ui.selectedSectionId
        ? [`art:${id}`]
        : []),
    ]);
  }
  const bitmaps = createBitmapCache(instance.assets, (assetId) => {
    for (const [id, content] of Object.entries(
      instance.store.getState().config.sections,
    ))
      if (
        content.elements.some(
          (e) => e.type === 'image' && e.assetId === assetId,
        )
      )
        mark(id);
  });
  const fonts = createFontManager(definition.fonts, (fontId) => {
    for (const [id, content] of Object.entries(
      instance.store.getState().config.sections,
    ))
      if (
        content.elements.some((e) => e.type === 'text' && e.fontId === fontId)
      )
        mark(id);
  });
  function sync() {
    const state = instance.store.getState();
    const value = state.config.optionSelections['fabric-base-color'],
      color =
        definition.optionGroups
          .find((g) => g.id === 'fabric-base-color')
          ?.choices.find((c) => c.id === value)?.color ?? '#FFFFFF';
    const changed =
      color !== base
        ? Object.keys(variant.sectionGeometry)
        : changedSectionIds(previous, state.config.sections);
    base = color;
    previous = state.config.sections;
    for (const id of changed) mark(id);
    if (state.ui.selectedSectionId !== lastSelection) {
      lastSelection = state.ui.selectedSectionId;
      queue.mark([`art:${lastSelection}`]);
    }
    const sections = Object.values(state.config.sections);
    bitmaps.sync(
      sections.flatMap((s) =>
        s.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : [])),
      ),
    );
    fonts.ensure(
      sections.flatMap((s) =>
        s.elements.flatMap((e) => (e.type === 'text' ? [e.fontId] : [])),
      ),
    );
  }
  sync();
  const unsubscribe = instance.store.subscribe(sync);
  return {
    get: (kind: SurfaceKind, id: string) =>
      entries.get(`${kind}:${id}`) ?? empty,
    subscribe(kind: SurfaceKind, id: string, fn: () => void) {
      const listener = (key: string) => {
        if (key === `${kind}:${id}`) fn();
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getRenderCounts: () => ({ ...counts }),
    flush: () => queue.flushNow(),
    dispose() {
      disposed = true;
      unsubscribe();
      queue.dispose();
      fonts.dispose();
      bitmaps.dispose();
      // Published canvases may still be read by Konva until the next React
      // commit. Release our references; do not zero live snapshot dimensions.
      entries.clear();
      listeners.clear();
    },
  };
}
export type EditorSurfaces = ReturnType<typeof createEditorSurfaces>;
