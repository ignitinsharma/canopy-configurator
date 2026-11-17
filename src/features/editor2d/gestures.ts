import type { Configurator } from '../ConfiguratorContext';
import type { DesignElement } from '@core/config';
/** Renderer-independent gesture adapter: throttled live config, one history entry.
 * Flush final pointer value before commit; cancel removes queued work as well. */
export function createGestureSession(
  instance: Pick<Configurator, 'store' | 'actions'>,
  request: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
) {
  let active: { sectionId: string; elementId: string } | null = null,
    frame: number | null = null,
    pending: DesignElement['transform'] | null = null;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    if (active && pending) {
      const e = instance.store
        .getState()
        .config.sections[active.sectionId]?.elements.find(
          (e) => e.id === active!.elementId,
        );
      if (e)
        instance.actions.updateElement(active.sectionId, e.id, {
          type: e.type,
          changes: { transform: pending },
        });
    }
    pending = null;
  };
  return {
    begin(sectionId: string, elementId: string) {
      if (active) return false;
      if (!instance.actions.beginTransaction().ok) return false;
      active = { sectionId, elementId };
      instance.actions.selectElement(elementId);
      return true;
    },
    update(transform: DesignElement['transform']) {
      if (!active) return;
      pending = transform;
      if (frame === null) frame = request(flush);
    },
    commit() {
      if (!active) return;
      flush();
      active = null;
      instance.actions.commitTransaction();
    },
    cancel() {
      if (!active) return;
      if (frame !== null) cancel(frame);
      frame = null;
      pending = null;
      active = null;
      instance.actions.cancelTransaction();
    },
    get active() {
      return !!active;
    },
    dispose() {
      if (active) {
        flush();
        active = null;
        instance.actions.commitTransaction();
      }
      if (frame !== null) cancel(frame);
    },
  };
}
