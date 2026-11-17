import { useEffect } from 'react';
import type { Configurator } from './ConfiguratorContext';
import { clampCenter, localSize } from './editor2d/coords';
export type KeyCommand =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | null;
export function commandForKey(
  key: string,
  modifier = false,
  shift = false,
): KeyCommand {
  if (modifier && key.toLowerCase() === 'z') return shift ? 'redo' : 'undo';
  if (modifier && key.toLowerCase() === 'd') return 'duplicate';
  if (key === 'Delete' || key === 'Backspace') return 'delete';
  return (
    (
      {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      } as const
    )[key as 'ArrowLeft'] ?? null
  );
}
export function useConfiguratorKeyboard(instance: Configurator) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target as HTMLElement | null)?.closest(
          'input,textarea,select,[contenteditable="true"]',
        )
      )
        return;
      const command = commandForKey(
        event.key,
        event.ctrlKey || event.metaKey,
        event.shiftKey,
      );
      if (!command) return;
      const state = instance.store.getState(),
        id = state.ui.selectedElementId,
        section = state.ui.selectedSectionId,
        element = state.config.sections[section]?.elements.find(
          (e) => e.id === id,
        );
      if (command === 'undo' || command === 'redo') {
        event.preventDefault();
        instance.actions[command]();
        return;
      }
      if (!element) return;
      event.preventDefault();
      if (command === 'delete') {
        instance.actions.removeElement(section, element.id);
        return;
      }
      if (command === 'duplicate') {
        instance.actions.duplicateElement(section, element.id);
        return;
      }
      const geometry = state.definition.variants.find(
        (v) => v.id === state.config.variantId,
      )?.sectionGeometry[section];
      if (!geometry) return;
      const size = localSize(geometry),
        step = event.shiftKey ? 10 : 1;
      const position = clampCenter(
        {
          x:
            element.transform.position.x +
            (command === 'left' ? -step : command === 'right' ? step : 0) /
              size.width,
          y:
            element.transform.position.y +
            (command === 'up' ? -step : command === 'down' ? step : 0) /
              size.height,
        },
        geometry,
      );
      instance.actions.updateElement(section, element.id, {
        type: element.type,
        changes: { transform: { ...element.transform, position } },
      });
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [instance]);
}
