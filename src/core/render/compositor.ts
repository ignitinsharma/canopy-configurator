import type { ProductConfig } from '../config';
import type { ProductDefinition } from '../definition';
import { renderSection, type ResolvedAssets } from './section';
import { compositeSectionIntoAtlas, sectionPixelsPerMeter } from './composite';
import { changedSectionIds } from './dirty';
import type { Geometry } from '../geometry';
export interface CompositorOptions {
  canvas: HTMLCanvasElement;
  geometry: Record<string, Geometry>;
  fonts: () => ProductDefinition['fonts'];
  assets: () => ResolvedAssets;
  ready: (id: string) => boolean;
  makeCanvas?: () => HTMLCanvasElement;
}
/** Owns only local canvas caches. Scheduling/resource readiness belongs to its caller. */
export function createSectionCompositor({
  canvas,
  geometry,
  fonts,
  assets,
  ready,
  makeCanvas = () => document.createElement('canvas'),
}: CompositorOptions) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Atlas context unavailable');
  let previous: ProductConfig['sections'] | null = null,
    sections: ProductConfig['sections'] = {},
    base = '#FFFFFF';
  const locals = new Map<string, HTMLCanvasElement>();
  let fill = true;
  return {
    update(next: ProductConfig['sections'], color: string) {
      const changed = changedSectionIds(previous, next).filter(
        (id) => geometry[id],
      );
      if (color !== base) {
        base = color;
        fill = true;
        changed.push(...Object.keys(geometry));
      }
      sections = next;
      previous = next;
      return [...new Set(changed)];
    },
    render(ids: Iterable<string>) {
      if (fill) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        fill = false;
      }
      const rendered: string[] = [];
      for (const id of ids) {
        const g = geometry[id],
          content = sections[id];
        if (!g || !content || !ready(id)) continue;
        let local = locals.get(id);
        const ppm = sectionPixelsPerMeter(g, canvas.width, canvas.height);
        if (!local) {
          local = makeCanvas();
          local.width = Math.ceil(g.sizeMeters.width * ppm);
          local.height = Math.ceil(g.sizeMeters.height * ppm);
          locals.set(id, local);
        }
        const localCtx = local.getContext('2d', { willReadFrequently: true });
        if (!localCtx) continue;
        renderSection(localCtx, {
          sectionGeometry: g,
          sectionConfig: content,
          resolvedAssets: assets(),
          fonts: fonts(),
          pxPerMeter: ppm,
          baseColor: base,
        });
        compositeSectionIntoAtlas(ctx, g, local);
        rendered.push(id);
      }
      return rendered;
    },
    dispose() {
      locals.forEach((c) => {
        c.width = c.height = 0;
      });
      locals.clear();
    },
  };
}
