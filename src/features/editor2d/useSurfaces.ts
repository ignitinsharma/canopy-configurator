import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useConfigurator } from '../ConfiguratorContext';
import {
  createEditorSurfaces,
  type EditorSurfaces,
  type SurfaceKind,
  type Surface,
} from './surfaces';
const EMPTY: Surface = { canvas: undefined, width: 0, height: 0, version: 0 };
export function useEditorSurfaces(variantId: string) {
  const instance = useConfigurator();
  const [surfaces, setSurfaces] = useState<EditorSurfaces | null>(null);
  useEffect(() => {
    const resource = createEditorSurfaces(instance, variantId);
    // Publish effect-owned canvases/resources; render-time allocation leaks abandoned renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSurfaces(resource);
    return () => resource.dispose();
  }, [instance, variantId]);
  return surfaces;
}
export function useSurface(
  surfaces: EditorSurfaces | null,
  kind: SurfaceKind,
  id: string,
) {
  const subscribe = useCallback(
    (fn: () => void) => surfaces?.subscribe(kind, id, fn) ?? (() => {}),
    [surfaces, kind, id],
  );
  const snapshot = useCallback(
    () => surfaces?.get(kind, id) ?? EMPTY,
    [surfaces, kind, id],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
