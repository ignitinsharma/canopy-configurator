import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useConfigurator, useConfigSelector } from '../ConfiguratorContext';
import { selectResolutionWarnings } from '@core/resolution';
import type { DesignElement, TextElement, ImageElement } from '@core/config';
import type { CommandResult } from '@core/store';

export function ArtworkControls() {
  const { store, actions, assets } = useConfigurator();
  const definition = useConfigSelector((s) => s.definition),
    config = useConfigSelector((s) => s.config),
    ui = useConfigSelector((s) => s.ui),
    history = useConfigSelector((s) => s.history);
  const sectionId = ui.selectedSectionId,
    section = config.sections[sectionId]!,
    sectionDef = definition.sections.find((s) => s.id === sectionId)!,
    element = section.elements.find((e) => e.id === ui.selectedElementId);
  const [text, setText] = useState('Your brand'),
    [font, setFont] = useState(definition.fonts[0]!.id),
    [color, setColor] = useState('#17324D'),
    [size, setSize] = useState(0.15),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [copyTo, setCopyTo] = useState(''),
    [copyPart, setCopyPart] = useState<'background' | 'elements' | 'all'>(
      'all',
    );
  const uploadController = useRef<AbortController | null>(null),
    gesture = useRef(false);
  const report = (result: CommandResult) => {
    if (!result.ok) setMessage(result.issues.map((i) => i.message).join(', '));
    else setMessage('');
    return result.ok;
  };
  function begin() {
    if (!gesture.current && actions.beginTransaction().ok)
      gesture.current = true;
  }
  function end(cancel = false) {
    if (gesture.current) {
      gesture.current = false;
      if (cancel) actions.cancelTransaction();
      else actions.commitTransaction();
    }
  }
  useEffect(
    () => () => {
      uploadController.current?.abort();
      if (gesture.current) actions.commitTransaction();
    },
    [actions],
  );
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
      } else if (event.key === 'Delete') {
        const state = store.getState();
        if (state.ui.selectedElementId) {
          event.preventDefault();
          actions.removeElement(
            state.ui.selectedSectionId,
            state.ui.selectedElementId,
          );
        }
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [actions, store]);
  const variant = definition.variants.find((v) => v.id === config.variantId)!;
  function addText() {
    const id = crypto.randomUUID();
    const value: TextElement = {
      id,
      type: 'text',
      text,
      color,
      fontId: font,
      fontSize: size,
      align: 'center',
      lineHeight: 1.2,
      transform: {
        position: {
          x: 0.5,
          y:
            variant.sectionGeometry[sectionId]?.shape === 'triangle'
              ? 0.65
              : 0.5,
        },
        size: { width: 0.65, height: 0.4 },
        scale: 1,
        rotationDeg: 0,
      },
    };
    if (report(actions.addElement(sectionId, value))) actions.selectElement(id);
  }
  async function upload(file: File) {
    if (busy) return;
    const targetSection = sectionId,
      limits = sectionDef.constraints.image;
    const abort = new AbortController();
    uploadController.current = abort;
    setBusy(true);
    setMessage('');
    try {
      const metadata = await assets.upload(file, {
        limits,
        signal: abort.signal,
      });
      abort.signal.throwIfAborted();
      const id = crypto.randomUUID();
      const image: ImageElement = {
        id,
        type: 'image',
        assetId: metadata.id,
        fit: 'contain',
        opacity: 1,
        transform: {
          position: {
            x: 0.5,
            y:
              variant.sectionGeometry[targetSection]?.shape === 'triangle'
                ? 0.65
                : 0.5,
          },
          size: { width: 0.5, height: 0.4 },
          scale: 1,
          rotationDeg: 0,
        },
      };
      if (
        report(actions.addImage(targetSection, metadata, image)) &&
        store.getState().ui.selectedSectionId === targetSection
      )
        actions.selectElement(id);
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  function patch(changes: Partial<TextElement> | Partial<ImageElement>) {
    if (element)
      report(
        actions.updateElement(sectionId, element.id, {
          type: element.type,
          changes,
        }),
      );
  }
  function transform(key: 'x' | 'y' | 'scale' | 'rotationDeg', value: number) {
    if (!element || !Number.isFinite(value)) return;
    patch({
      transform: {
        ...element.transform,
        ...(key === 'x' || key === 'y'
          ? { position: { ...element.transform.position, [key]: value } }
          : { [key]: value }),
      },
    });
  }
  function move(e: DesignElement, direction: number) {
    const ids = section.elements.map((e) => e.id),
      index = ids.indexOf(e.id),
      next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    report(actions.reorder(sectionId, ids));
  }
  const warnings = selectResolutionWarnings({ config, definition }).filter(
    (w) => w.sectionId === sectionId,
  );
  const palette =
    definition.optionGroups.find((g) => g.id === 'fabric-base-color')
      ?.choices ?? [];
  return (
    <div className="artwork-controls">
      <div className="history-buttons">
        <button
          type="button"
          disabled={!history.past.length || !!history.transactionStart}
          onClick={() => actions.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!history.future.length || !!history.transactionStart}
          onClick={() => actions.redo()}
        >
          Redo
        </button>
      </div>
      <nav aria-label="Printable sections" className="section-picker">
        {definition.sections
          .filter((s) => s.variantIds.includes(config.variantId))
          .map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === sectionId}
              onClick={() => actions.selectSection(s.id)}
            >
              {s.label}
            </button>
          ))}
      </nav>
      <fieldset>
        <legend>Section background</legend>
        <div className="palette">
          <button
            type="button"
            onClick={() =>
              report(actions.setSectionBackground(sectionId, null))
            }
          >
            Inherit fabric
          </button>
          {palette.map((c) => (
            <button
              key={c.id}
              type="button"
              style={{ borderColor: c.color }}
              onClick={() =>
                report(actions.setSectionBackground(sectionId, c.color!))
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <label>
          Custom background
          <input
            aria-label="Custom background"
            type="color"
            value={
              section.backgroundColor ??
              palette.find(
                (c) => c.id === config.optionSelections['fabric-base-color'],
              )?.color ??
              '#ffffff'
            }
            onChange={(e) =>
              report(actions.setSectionBackground(sectionId, e.target.value))
            }
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Add text</legend>
        <label>
          New text
          <textarea
            aria-label="New text"
            value={text}
            maxLength={sectionDef.constraints.maxTextLength}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          New text font
          <select
            aria-label="New text font"
            value={font}
            onChange={(e) => setFont(e.target.value)}
          >
            {definition.fonts
              .filter((f) =>
                sectionDef.constraints.allowedFontIds.includes(f.id),
              )
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family}
                </option>
              ))}
          </select>
        </label>
        <label>
          New text color
          <input
            aria-label="New text color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          New text size (% of section height)
          <input
            aria-label="New text size"
            type="number"
            min={1}
            max={100}
            value={size * 100}
            onChange={(e) =>
              setSize(Math.max(0.01, Math.min(1, Number(e.target.value) / 100)))
            }
          />
        </label>
        <button type="button" disabled={!text.trim()} onClick={addText}>
          Add text
        </button>
      </fieldset>
      <fieldset
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        <legend>Add image</legend>
        <label>
          {busy ? 'Processing image…' : 'Upload or drop a logo'}
          <input
            aria-label="Upload image"
            type="file"
            accept={sectionDef.constraints.image.allowedMimeTypes.join(',')}
            disabled={busy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </label>
        <small>
          PNG, JPEG, WebP or SVG · up to{' '}
          {Math.round(sectionDef.constraints.image.maxBytes / 1048576)} MB
        </small>
      </fieldset>
      {message && <p role="alert">{message}</p>}
      {warnings.length > 0 && (
        <ul
          className="resolution-warnings"
          aria-label="Image resolution warnings"
        >
          {warnings.map((w) => (
            <li key={w.elementId}>
              {w.message}. Advisory only during editing.
            </li>
          ))}
        </ul>
      )}
      <fieldset>
        <legend>Elements (back → front)</legend>
        {!section.elements.length && (
          <p className="status">No artwork in this section yet.</p>
        )}
        <ol className="element-list">
          {section.elements.map((e, index) => (
            <li key={e.id}>
              <button
                className="element-select"
                type="button"
                aria-pressed={e.id === ui.selectedElementId}
                onClick={() => actions.selectElement(e.id)}
              >
                {e.type === 'text'
                  ? e.text.slice(0, 30) || 'Empty text'
                  : 'Image'}
              </button>
              <div className="element-buttons">
                <button
                  type="button"
                  aria-label={`Move element ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(e, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move element ${index + 1} down`}
                  disabled={index === section.elements.length - 1}
                  onClick={() => move(e, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    report(actions.duplicateElement(sectionId, e.id))
                  }
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  aria-label={`Delete element ${index + 1}`}
                  onClick={() => report(actions.removeElement(sectionId, e.id))}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ol>
      </fieldset>
      {element && (
        <fieldset>
          <legend>Selected element</legend>
          {element.type === 'text' ? (
            <>
              <label>
                Text content
                <textarea
                  aria-label="Text content"
                  value={element.text}
                  onChange={(e) => patch({ text: e.target.value })}
                />
              </label>
              <label>
                Font
                <select
                  aria-label="Element font"
                  value={element.fontId}
                  onChange={(e) => patch({ fontId: e.target.value })}
                >
                  {definition.fonts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.family}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Text color
                <input
                  aria-label="Text color"
                  type="color"
                  value={element.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </label>
              <label>
                Font size (% height)
                <input
                  aria-label="Font size"
                  type="number"
                  min={1}
                  max={100}
                  value={element.fontSize * 100}
                  onChange={(e) =>
                    patch({ fontSize: Number(e.target.value) / 100 })
                  }
                />
              </label>
              <label>
                Alignment
                <select
                  aria-label="Text alignment"
                  value={element.align}
                  onChange={(e) =>
                    patch({ align: e.target.value as TextElement['align'] })
                  }
                >
                  <option>left</option>
                  <option>center</option>
                  <option>right</option>
                </select>
              </label>
            </>
          ) : (
            <label>
              Image opacity
              <input
                aria-label="Image opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={element.opacity}
                onChange={(e) => patch({ opacity: Number(e.target.value) })}
              />
            </label>
          )}
          {(['x', 'y', 'scale', 'rotationDeg'] as const).map((key) => {
            const value =
              key === 'x' || key === 'y'
                ? element.transform.position[key]
                : element.transform[key];
            const min =
                key === 'rotationDeg' ? -180 : key === 'scale' ? 0.05 : 0,
              max = key === 'rotationDeg' ? 180 : key === 'scale' ? 5 : 1,
              step = key === 'rotationDeg' ? 1 : 0.01;
            return (
              <label key={key}>
                {key === 'rotationDeg' ? 'Rotation (degrees)' : key}
                <div className="transform-controls">
                  <input
                    aria-label={`${key} slider`}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      begin();
                    }}
                    onPointerUp={() => end()}
                    onPointerCancel={() => end(true)}
                    onKeyDown={(e) => {
                      if (
                        [
                          'ArrowLeft',
                          'ArrowRight',
                          'ArrowUp',
                          'ArrowDown',
                          'Home',
                          'End',
                          'PageUp',
                          'PageDown',
                        ].includes(e.key)
                      )
                        begin();
                    }}
                    onKeyUp={() => end()}
                    onBlur={() => end()}
                    onChange={(e) => transform(key, Number(e.target.value))}
                  />
                  <input
                    aria-label={`${key} value`}
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => transform(key, Number(e.target.value))}
                  />
                </div>
              </label>
            );
          })}
          <div className="transform-controls">
            {(['width', 'height'] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  aria-label={`Element ${key}`}
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={element.transform.size[key]}
                  onChange={(e) =>
                    patch({
                      transform: {
                        ...element.transform,
                        size: {
                          ...element.transform.size,
                          [key]: Number(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>Copy section</legend>
        <label>
          Copy content
          <select
            aria-label="Copy content"
            value={copyPart}
            onChange={(e) => setCopyPart(e.target.value as typeof copyPart)}
          >
            <option value="all">Background and elements</option>
            <option value="background">Background only</option>
            <option value="elements">Elements only</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => report(actions.applySectionToAll(sectionId, copyPart))}
        >
          Apply to all sections
        </button>
        <label>
          Copy section to
          <select
            aria-label="Copy section to"
            value={copyTo}
            onChange={(e) => setCopyTo(e.target.value)}
          >
            <option value="">Choose section</option>
            {definition.sections
              .filter(
                (s) =>
                  s.id !== sectionId && s.variantIds.includes(config.variantId),
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!copyTo}
          onClick={() =>
            report(actions.copySection(sectionId, [copyTo], copyPart))
          }
        >
          Copy section
        </button>
      </fieldset>
      <small>
        Ctrl/Cmd+Z: undo · Shift+Ctrl/Cmd+Z: redo · Delete: remove selected
        element. Text fields keep their native shortcuts.
      </small>
    </div>
  );
}
