import { useEffect, useRef, useState } from 'react';
import type { TextElement } from '@core/config';
import type { ProductDefinition } from '@core/definition';
import type { Geometry } from '@core/geometry';
import { elementBox, localSize, localToStage, type View } from './coords';
import { useConfigurator } from '../ConfiguratorContext';
export function InlineText({
  element,
  sectionId,
  geometry,
  view,
  fonts,
  onClose,
}: {
  element: TextElement;
  sectionId: string;
  geometry: Geometry;
  view: View;
  fonts: ProductDefinition['fonts'];
  onClose: () => void;
}) {
  const { actions } = useConfigurator(),
    [value, setValue] = useState(element.text),
    ref = useRef<HTMLTextAreaElement>(null),
    finished = useRef(false),
    started = useRef(false);
  useEffect(() => {
    started.current = actions.beginTransaction().ok;
    ref.current?.focus();
    ref.current?.select();
    return () => {
      if (started.current && !finished.current) actions.cancelTransaction();
    };
  }, [actions]);
  function finish(cancel = false) {
    if (finished.current) return;
    finished.current = true;
    if (started.current) {
      if (cancel) actions.cancelTransaction();
      else {
        actions.updateElement(sectionId, element.id, {
          type: 'text',
          changes: { text: value },
        });
        actions.commitTransaction();
      }
    }
    onClose();
  }
  const box = elementBox(element, geometry),
    center = localToStage(box, view),
    font = fonts.find((f) => f.id === element.fontId),
    scale = box.scale * view.scale;
  return (
    <textarea
      ref={ref}
      aria-label="Edit text inline"
      className="inline-text-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(true);
        } else if (
          e.key === 'Enter' &&
          !e.shiftKey &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          finish();
        }
      }}
      style={{
        left: center.x,
        top: center.y,
        width: box.width,
        height: box.height,
        fontFamily: font?.family ?? 'sans-serif',
        fontWeight: font?.weight ?? 400,
        fontStyle: font?.style ?? 'normal',
        fontSize: element.fontSize * localSize(geometry).height,
        lineHeight: element.lineHeight,
        color: element.color,
        textAlign: element.align,
        transform: `translate(-50%, -50%) rotate(${box.rotation}deg) scale(${scale})`,
        transformOrigin: 'center',
      }}
    />
  );
}
