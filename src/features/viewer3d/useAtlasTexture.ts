import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useConfigSelector } from '../ConfiguratorContext';
import { createAtlas, type AtlasApi } from './atlas';
export function useAtlasTexture(variantId: string): AtlasApi | null {
  const definition = useConfigSelector((s) => s.definition);
  const value = useConfigSelector(
    (s) => s.config.optionSelections['fabric-base-color'],
  );
  const selected = useConfigSelector((s) => s.ui.selectedSectionId);
  const invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl);
  const [atlas, setAtlas] = useState<AtlasApi | null>(null);
  const color =
    definition.optionGroups
      .find((g) => g.id === 'fabric-base-color')
      ?.choices.find((c) => c.id === value)?.color ?? '#FFFFFF';
  useEffect(() => {
    const geometry = definition.variants.find(
      (v) => v.id === variantId,
    )!.sectionGeometry;
    const resource = createAtlas(
      geometry,
      invalidate,
      gl.capabilities.getMaxAnisotropy(),
    );
    // Publish the effect-owned DOM/GPU resource after allocation. Allocating it
    // during render would leak abandoned StrictMode/concurrent render resources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAtlas(resource);
    return () => resource.dispose();
  }, [definition, variantId, invalidate, gl]);
  useEffect(() => {
    atlas?.setBaseColor(color);
  }, [atlas, color]);
  useEffect(() => {
    atlas?.setOverlay(
      selected,
      new URLSearchParams(window.location.search).get('debug') === 'atlas',
    );
  }, [atlas, selected]);
  return atlas;
}
