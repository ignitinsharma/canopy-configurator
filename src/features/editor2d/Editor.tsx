import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Stage,
  Layer,
  Group,
  Image as KonvaImage,
  Rect,
  Line,
  Transformer,
} from 'react-konva/lib/ReactKonvaCore';
import Konva from 'konva/lib/Core';
import 'konva/lib/shapes/Image';
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Transformer';
import type KonvaTypes from 'konva';
import { clipPolygon, type Geometry } from '@core/geometry';
import type { DesignElement } from '@core/config';
import { useConfigurator, useConfigSelector } from '../ConfiguratorContext';
import { useEditorSurfaces, useSurface } from './useSurfaces';
import type { Surface } from './surfaces';
import { createGestureSession } from './gestures';
import {
  elementBox,
  fitView,
  localSize,
  localToNormalized,
  normalizedToLocal,
  normalizedRotation,
  offsetPolygon,
  zoomAt,
  type View,
  type XY,
} from './coords';
import { snapCenter, type SnapGuide } from './snapping';
import { SectionNavigation } from './SectionNavigation';
import { InlineText } from './InlineText';
Konva.hitOnDragEnabled = true;
const ArtworkLayer = memo(function ArtworkLayer({
  surface,
  g,
  x,
  y,
  scale,
}: {
  surface: Surface;
  g: Geometry;
  x: number;
  y: number;
  scale: number;
}) {
  const image = useRef<KonvaTypes.Image>(null);
  useEffect(() => {
    image.current?.getLayer()?.batchDraw();
  }, [surface.version]);
  const size = localSize(g);
  return (
    <Layer listening={false}>
      <Group x={x} y={y} scaleX={scale} scaleY={scale}>
        {surface.canvas && (
          <KonvaImage
            ref={image}
            image={surface.canvas}
            width={size.width}
            height={size.height}
          />
        )}
      </Group>
    </Layer>
  );
});
export default function Editor() {
  const variant = useConfigSelector((s) => s.config.variantId),
    section = useConfigSelector((s) => s.ui.selectedSectionId);
  const surfaces = useEditorSurfaces(variant);
  return (
    <div className="editor" data-editor>
      <EditorCanvas key={`${variant}:${section}`} surfaces={surfaces} />
      <SectionNavigation surfaces={surfaces} />
    </div>
  );
}
function EditorCanvas({
  surfaces,
}: {
  surfaces: ReturnType<typeof useEditorSurfaces>;
}) {
  const instance = useConfigurator(),
    { actions, store } = instance;
  const definition = useConfigSelector((s) => s.definition),
    variantId = useConfigSelector((s) => s.config.variantId),
    sectionId = useConfigSelector((s) => s.ui.selectedSectionId),
    selectedId = useConfigSelector((s) => s.ui.selectedElementId),
    section = useConfigSelector((s) => s.config.sections[sectionId]!);
  const g = definition.variants.find((v) => v.id === variantId)!
      .sectionGeometry[sectionId]!,
    constraints = definition.sections.find(
      (s) => s.id === sectionId,
    )!.constraints,
    size = localSize(g),
    surface = useSurface(surfaces, 'art', sectionId);
  const container = useRef<HTMLDivElement>(null),
    stage = useRef<KonvaTypes.Stage>(null),
    transformer = useRef<KonvaTypes.Transformer>(null),
    nodes = useRef(new Map<string, KonvaTypes.Rect>());
  const [dimensions, setDimensions] = useState({ width: 360, height: 400 }),
    [fit, setFit] = useState(true),
    [manual, setManual] = useState<View>({ x: 0, y: 0, scale: 1 }),
    [snapping, setSnapping] = useState(true),
    [showGuides, setShowGuides] = useState(true),
    [guides, setGuides] = useState<SnapGuide[]>([]),
    [space, setSpace] = useState(false),
    [alt, setAlt] = useState(false),
    [pinching, setPinching] = useState(false),
    [editing, setEditing] = useState<string | null>(null);
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches;
  const view = fit ? fitView(dimensions.width, dimensions.height, g) : manual;
  const currentView = useRef(view);
  useLayoutEffect(() => {
    currentView.current = view;
  }, [view]);
  const gesture = useMemo(() => createGestureSession(instance), [instance]);
  useEffect(() => () => gesture.dispose(), [gesture]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0)
        setDimensions({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(true);
      if (
        e.code === 'Space' &&
        container.current?.contains(document.activeElement) &&
        !(e.target as HTMLElement)?.closest('textarea,input')
      ) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(false);
      if (e.code === 'Space') setSpace(false);
    };
    const reset = () => {
      setSpace(false);
      setAlt(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, []);
  useLayoutEffect(() => {
    const node = selectedId ? nodes.current.get(selectedId) : undefined;
    transformer.current?.nodes(node && !editing ? [node] : []);
    transformer.current?.getLayer()?.batchDraw();
  }, [selectedId, section, editing]);
  function restoreNodes() {
    const content = store.getState().config.sections[sectionId];
    for (const e of content?.elements ?? []) {
      const node = nodes.current.get(e.id),
        box = elementBox(e, g);
      node?.position({ x: box.x, y: box.y });
      node?.scale({ x: box.scale, y: box.scale });
      node?.rotation(box.rotation);
    }
    transformer.current?.forceUpdate();
  }
  function update(node: KonvaTypes.Node, e: DesignElement, event: Event) {
    if (!gesture.active) return;
    const point = localToNormalized({ x: node.x(), y: node.y() }, g);
    const snapped = snapCenter(point, g, {
      enabled: snapping,
      alt: alt || ('altKey' in event && !!event.altKey),
      scale: view.scale,
      marginMeters: constraints.safeMarginMeters,
    });
    const center = normalizedToLocal(snapped.position, g),
      scale = Math.max(0.05, Math.min(10, Math.abs(node.scaleX())));
    node.position(center);
    node.scale({ x: scale, y: scale });
    const rotation = normalizedRotation(node.rotation());
    gesture.update({
      ...e.transform,
      position: snapped.position,
      scale,
      rotationDeg: rotation,
    });
    setGuides(snapped.guides);
  }
  function end(node: KonvaTypes.Node, e: DesignElement, event: Event) {
    if (!gesture.active) return;
    update(node, e, event);
    gesture.commit();
    setGuides([]);
    restoreNodes();
  }
  function zoom(
    scale: number,
    anchor: XY = { x: dimensions.width / 2, y: dimensions.height / 2 },
  ) {
    setFit(false);
    setManual(zoomAt(currentView.current, anchor, scale));
  }
  const pointers = useRef(new Map<number, XY>()),
    pan = useRef<{ center: XY; distance: number; view: View } | null>(null);
  function pointerCenter() {
    const values = [...pointers.current.values()];
    return {
      center:
        values.length > 1
          ? {
              x: (values[0]!.x + values[1]!.x) / 2,
              y: (values[0]!.y + values[1]!.y) / 2,
            }
          : values[0]!,
      distance:
        values.length > 1
          ? Math.hypot(values[0]!.x - values[1]!.x, values[0]!.y - values[1]!.y)
          : 0,
    };
  }
  const selected = section.elements.find((e) => e.id === selectedId),
    textElement = section.elements.find(
      (e) => e.id === editing && e.type === 'text',
    );
  const polygon = (points: readonly (readonly [number, number])[]) =>
    points.flatMap(([x, y]) => [x * size.width, y * size.height]);
  return (
    <>
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="2D view controls"
      >
        <button type="button" onClick={() => setFit(true)}>
          Fit
        </button>
        <button
          type="button"
          onClick={() => {
            setFit(false);
            setManual({
              scale: 1,
              x: (dimensions.width - size.width) / 2,
              y: (dimensions.height - size.height) / 2,
            });
          }}
        >
          100%
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoom(view.scale / 1.25)}
        >
          −
        </button>
        <span aria-label="Zoom level">{Math.round(view.scale * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoom(view.scale * 1.25)}
        >
          +
        </button>
        <label>
          <input
            type="checkbox"
            checked={snapping}
            onChange={(e) => setSnapping(e.target.checked)}
          />
          Snap
        </label>
        <label>
          <input
            type="checkbox"
            checked={showGuides}
            onChange={(e) => setShowGuides(e.target.checked)}
          />
          Show guides
        </label>
      </div>
      <div className="editor-orientation">
        {definition.sections.find((s) => s.id === sectionId)?.label} — viewed
        from outside <span aria-hidden="true">↑ up</span>
      </div>
      <div
        ref={container}
        className="editor-viewport"
        role="application"
        aria-label="2D artwork canvas"
        tabIndex={0}
        style={{ cursor: space || pinching ? 'grab' : 'default' }}
        onPointerDownCapture={(event) => {
          if ((event.target as HTMLElement).closest('textarea')) return;
          container.current?.focus({ preventScroll: true });
          const rect = event.currentTarget.getBoundingClientRect();
          pointers.current.set(event.pointerId, {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
          if (space || pointers.current.size >= 2) {
            gesture.cancel();
            stage.current?.find('.element-hit').forEach((n) => n.stopDrag());
            restoreNodes();
            setPinching(pointers.current.size >= 2);
            const info = pointerCenter();
            pan.current = { ...info, view: currentView.current };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }
        }}
        onPointerMoveCapture={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          pointers.current.set(event.pointerId, {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
          if (!pan.current) return;
          event.preventDefault();
          const info = pointerCenter(),
            start = pan.current;
          const scale =
            start.distance && info.distance
              ? (start.view.scale * info.distance) / start.distance
              : start.view.scale;
          const next = zoomAt(start.view, start.center, scale);
          next.x += info.center.x - start.center.x;
          next.y += info.center.y - start.center.y;
          currentView.current = next;
          setFit(false);
          setManual(next);
        }}
        onPointerUpCapture={(event) => {
          pointers.current.delete(event.pointerId);
          if (pan.current) {
            pan.current = null;
            pointers.current.clear();
            setPinching(false);
          }
        }}
        onPointerCancelCapture={(event) => {
          pointers.current.delete(event.pointerId);
          pan.current = null;
          setPinching(false);
          gesture.cancel();
          restoreNodes();
          setGuides([]);
        }}
      >
        <Stage
          ref={stage}
          width={dimensions.width}
          height={dimensions.height}
          onWheel={(event) => {
            event.evt.preventDefault();
            const pointer = stage.current?.getPointerPosition();
            if (pointer)
              zoom(view.scale * Math.exp(-event.evt.deltaY * 0.002), pointer);
          }}
          onMouseDown={(event) => {
            if (event.target === event.target.getStage() && !space && !pinching)
              actions.selectElement(null);
          }}
          onTouchStart={(event) => {
            if (
              event.target === event.target.getStage() &&
              event.evt.touches.length === 1
            )
              actions.selectElement(null);
          }}
        >
          <ArtworkLayer
            surface={surface}
            g={g}
            x={view.x}
            y={view.y}
            scale={view.scale}
          />
          <Layer>
            <Group
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale}
            >
              {showGuides && (
                <Group listening={false}>
                  <Line
                    points={polygon(offsetPolygon(g, -constraints.bleedMeters))}
                    closed
                    stroke="#bd6363"
                    dash={[5 / view.scale, 4 / view.scale]}
                    strokeWidth={1 / view.scale}
                  />
                  <Line
                    points={polygon(clipPolygon(g))}
                    closed
                    stroke="#4c6055"
                    strokeWidth={1.5 / view.scale}
                  />
                  <Line
                    points={polygon(
                      offsetPolygon(g, constraints.safeMarginMeters),
                    )}
                    closed
                    stroke="#638b78"
                    dash={[6 / view.scale, 4 / view.scale]}
                    strokeWidth={1 / view.scale}
                  />
                </Group>
              )}
              <Group
                clipFunc={(context) => {
                  context.beginPath();
                  clipPolygon(g).forEach(([x, y], i) =>
                    i
                      ? context.lineTo(x * size.width, y * size.height)
                      : context.moveTo(x * size.width, y * size.height),
                  );
                  context.closePath();
                }}
              >
                {section.elements.map((e) => {
                  const box = elementBox(e, g);
                  return (
                    <Rect
                      key={e.id}
                      ref={(node) => {
                        if (node) nodes.current.set(e.id, node);
                        else nodes.current.delete(e.id);
                      }}
                      id={e.id}
                      name="element-hit"
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      offsetX={box.width / 2}
                      offsetY={box.height / 2}
                      scaleX={box.scale}
                      scaleY={box.scale}
                      rotation={box.rotation}
                      fill="rgba(0,0,0,0)"
                      draggable={!space && !pinching && !editing}
                      onClick={() => actions.selectElement(e.id)}
                      onTap={() => actions.selectElement(e.id)}
                      onDblClick={() => {
                        if (e.type === 'text') setEditing(e.id);
                      }}
                      onDblTap={() => {
                        if (e.type === 'text') setEditing(e.id);
                      }}
                      onDragStart={() => {
                        if (!pan.current) gesture.begin(sectionId, e.id);
                      }}
                      onDragMove={(event) => update(event.target, e, event.evt)}
                      onDragEnd={(event) => end(event.target, e, event.evt)}
                      onTransformStart={() => gesture.begin(sectionId, e.id)}
                      onTransform={(event) =>
                        update(event.target, e, event.evt)
                      }
                      onTransformEnd={(event) =>
                        end(event.target, e, event.evt)
                      }
                    />
                  );
                })}
              </Group>
              {guides.map((guide, i) => (
                <Line
                  key={i}
                  points={[
                    guide.a.x * size.width,
                    guide.a.y * size.height,
                    guide.b.x * size.width,
                    guide.b.y * size.height,
                  ]}
                  stroke="#d35a8c"
                  strokeWidth={1 / view.scale}
                  dash={[4 / view.scale, 3 / view.scale]}
                  listening={false}
                />
              ))}
              <Transformer
                ref={transformer}
                enabledAnchors={[
                  'top-left',
                  'top-right',
                  'bottom-left',
                  'bottom-right',
                ]}
                keepRatio
                flipEnabled={false}
                rotateEnabled={!!selected}
                anchorSize={coarse ? 22 : 10}
                rotateAnchorOffset={coarse ? 40 : 28}
                borderStrokeWidth={1}
                anchorStrokeWidth={1}
                anchorStyleFunc={(anchor) =>
                  anchor.hitStrokeWidth(coarse ? 22 : 8)
                }
                rotationSnaps={
                  snapping && !alt ? [0, 45, 90, 135, 180, 225, 270, 315] : []
                }
                rotationSnapTolerance={4}
                boundBoxFunc={(old, next) =>
                  Math.abs(next.width) < 12 || Math.abs(next.height) < 12
                    ? old
                    : next
                }
              />
            </Group>
          </Layer>
        </Stage>
        {textElement?.type === 'text' && (
          <InlineText
            key={textElement.id}
            element={textElement}
            sectionId={sectionId}
            geometry={g}
            view={view}
            fonts={definition.fonts}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
      <p className="editor-help">
        Drag artwork · Corners resize · Handle rotates · Space+drag pans ·
        Wheel/pinch zooms · Alt disables snap
      </p>
    </>
  );
}
