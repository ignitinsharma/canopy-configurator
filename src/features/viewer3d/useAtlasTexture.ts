import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useConfigurator } from '../ConfiguratorContext';
import { createAtlas, type AtlasApi } from './atlas';
import { createBitmapCache } from '../assets/bitmapCache';
import { createFontManager } from '../assets/fonts';
import { createSectionCompositor } from '@core/render/compositor';

export function useAtlasTexture(variantId: string): AtlasApi | null {
  const { store, assets } = useConfigurator();
  const invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl);
  const [atlas, setAtlas] = useState<AtlasApi | null>(null);
  useEffect(() => {
    const definition = store.getState().definition,
      geometry = definition.variants.find(
        (v) => v.id === variantId,
      )!.sectionGeometry;
    const dirty = new Set<string>();
    let compositor: ReturnType<typeof createSectionCompositor> | null = null;
    const resource = createAtlas(
      geometry,
      invalidate,
      gl.capabilities.getMaxAnisotropy(),
      () => {
        if (compositor) {
          compositor.render(dirty);
          dirty.clear();
        }
      },
    );
    const mark = (id: string) => {
      dirty.add(id);
      resource.markDirty(id);
    };
    const markAsset = (id: string) => {
      for (const [section, content] of Object.entries(
        store.getState().config.sections,
      ))
        if (
          content.elements.some((e) => e.type === 'image' && e.assetId === id)
        )
          mark(section);
    };
    const bitmaps = createBitmapCache(assets, markAsset);
    const fontManager = createFontManager(definition.fonts, (id) => {
      for (const [section, content] of Object.entries(
        store.getState().config.sections,
      ))
        if (content.elements.some((e) => e.type === 'text' && e.fontId === id))
          mark(section);
    });
    compositor = createSectionCompositor({
      canvas: resource.getCanvas(),
      geometry,
      assets: () => bitmaps.resolved(),
      fonts: () => fontManager.loadedFonts(),
      ready: (id) =>
        store
          .getState()
          .config.sections[id]!.elements.every(
            (e) => e.type !== 'text' || fontManager.settled(e.fontId),
          ),
    });
    const debug =
      new URLSearchParams(window.location.search).get('debug') === 'atlas';
    function sync() {
      const state = store.getState(),
        value = state.config.optionSelections['fabric-base-color'];
      const base =
        definition.optionGroups
          .find((g) => g.id === 'fabric-base-color')
          ?.choices.find((c) => c.id === value)?.color ?? '#FFFFFF';
      const contents = Object.values(state.config.sections);
      bitmaps.sync(
        contents.flatMap((s) =>
          s.elements.flatMap((e) => (e.type === 'image' ? [e.assetId] : [])),
        ),
      );
      fontManager.ensure(
        contents.flatMap((s) =>
          s.elements.flatMap((e) => (e.type === 'text' ? [e.fontId] : [])),
        ),
      );
      for (const id of compositor!.update(state.config.sections, base))
        mark(id);
      resource.setOverlay(state.ui.selectedSectionId, debug);
    }
    sync();
    const unsubscribe = store.subscribe(sync);
    // DOM/GPU resources must be effect-owned to survive abandoned StrictMode renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAtlas(resource);
    return () => {
      unsubscribe();
      bitmaps.dispose();
      fontManager.dispose();
      compositor?.dispose();
      resource.dispose();
    };
  }, [variantId, store, assets, invalidate, gl]);
  return atlas;
}
