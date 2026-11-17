import { memo, useEffect, useRef } from 'react';
import { useConfigurator, useConfigSelector } from '../ConfiguratorContext';
import { useSurface } from './useSurfaces';
import type { EditorSurfaces } from './surfaces';
const Thumbnail = memo(function Thumbnail({
  id,
  label,
  selected,
  surfaces,
}: {
  id: string;
  label: string;
  selected: boolean;
  surfaces: EditorSurfaces | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    surface = useSurface(surfaces, 'thumb', id),
    { actions } = useConfigurator();
  useEffect(() => {
    if (!ref.current || !surface.canvas) return;
    ref.current.width = surface.canvas.width;
    ref.current.height = surface.canvas.height;
    ref.current.getContext('2d')?.drawImage(surface.canvas, 0, 0);
  }, [surface]);
  return (
    <button
      type="button"
      className="section-thumbnail"
      aria-label={`Edit ${label}`}
      aria-pressed={selected}
      onClick={() => actions.selectSection(id)}
    >
      <canvas ref={ref} width={128} height={80} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
});
export function SectionNavigation({
  surfaces,
}: {
  surfaces: EditorSurfaces | null;
}) {
  const definition = useConfigSelector((s) => s.definition),
    variant = useConfigSelector((s) => s.config.variantId),
    selected = useConfigSelector((s) => s.ui.selectedSectionId),
    { actions } = useConfigurator();
  const shapes = [
    { id: 'roof-front', points: '50,50 85,85 15,85' },
    { id: 'roof-back', points: '50,50 15,15 85,15' },
    { id: 'roof-left', points: '50,50 15,85 15,15' },
    { id: 'roof-right', points: '50,50 85,15 85,85' },
    { id: 'valance-front', points: '15,89 85,89 85,99 15,99' },
    { id: 'valance-back', points: '15,1 85,1 85,11 15,11' },
    { id: 'valance-left', points: '1,15 11,15 11,85 1,85' },
    { id: 'valance-right', points: '89,15 99,15 99,85 89,85' },
  ];
  return (
    <div className="editor-navigation">
      <div className="section-thumbnails" aria-label="Section thumbnails">
        {definition.sections
          .filter((s) => s.variantIds.includes(variant))
          .map((s) => (
            <Thumbnail
              key={s.id}
              id={s.id}
              label={s.label}
              selected={selected === s.id}
              surfaces={surfaces}
            />
          ))}
      </div>
      <svg
        className="mini-tent-map"
        viewBox="0 0 100 100"
        role="group"
        aria-label="Mini tent section map"
      >
        {shapes.map((s) => (
          <polygon
            key={s.id}
            points={s.points}
            role="button"
            tabIndex={0}
            aria-label={`Map ${s.id}`}
            aria-pressed={s.id === selected}
            fill={s.id === selected ? '#477d69' : '#dce5df'}
            stroke="white"
            strokeWidth={1}
            onClick={() => actions.selectSection(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                actions.selectSection(s.id);
              }
            }}
          />
        ))}
      </svg>
    </div>
  );
}
