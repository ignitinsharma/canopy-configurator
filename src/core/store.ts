import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  ProductConfigSchema,
  type ProductConfig,
  type DesignElement,
  type TextElement,
  type ImageElement,
  type AssetMetadata,
} from './config';
import { parseDefinition, type ProductDefinition } from './definition';
import { validateConfig, type ValidationIssue } from './validation';
import { loadConfig as parseConfig } from './migrations';
import { exportConfig } from './serialization';
export type CommandResult =
  { ok: true } | { ok: false; issues: ValidationIssue[] };
export function createConfigStore(
  definition: ProductDefinition,
  initial: ProductConfig,
) {
  definition = parseDefinition(definition);
  const parsed = ProductConfigSchema.parse(initial);
  const initialIssues = validateConfig(parsed, definition);
  if (initialIssues.some((i) => i.code !== 'FONT_TOO_SMALL'))
    throw new Error('INVALID_INITIAL_CONFIG');
  type State = {
    config: ProductConfig;
    configRevision: number;
    definition: ProductDefinition;
    validationIssues: ValidationIssue[];
    ui: { selectedSectionId: string; selectedElementId: string | null };
    history: {
      past: ProductConfig[];
      future: ProductConfig[];
      transactionStart: ProductConfig | null;
    };
  };
  const store = createStore(
    subscribeWithSelector<State>(() => ({
      definition,
      config: parsed,
      configRevision: 0,
      validationIssues: initialIssues,
      ui: {
        selectedSectionId:
          definition.sections.find((s) =>
            s.variantIds.includes(parsed.variantId),
          )?.id ?? '',
        selectedElementId: null,
      },
      history: { past: [], future: [], transactionStart: null },
    })),
  );
  const failure = (message: string): CommandResult => ({
    ok: false,
    issues: [{ code: 'INVALID_COMMAND', message, path: [], severity: 'error' }],
  });
  function commit(edit: (c: ProductConfig) => void): CommandResult {
    const s = store.getState();
    const next = structuredClone(s.config);
    try {
      edit(next);
      const validated = ProductConfigSchema.parse(next);
      Object.assign(next, validated);
      const issues = validateConfig(next, definition);
      if (issues.some((i) => i.code !== 'FONT_TOO_SMALL'))
        return { ok: false, issues };
      if (JSON.stringify(next) === JSON.stringify(s.config))
        return { ok: true };
      for (const key of Object.keys(next.sections))
        if (
          JSON.stringify(next.sections[key]) ===
          JSON.stringify(s.config.sections[key])
        )
          next.sections[key] = s.config.sections[key]!;
      store.setState({
        config: next,
        configRevision: s.configRevision + 1,
        validationIssues: issues,
        history: s.history.transactionStart
          ? s.history
          : {
              past: [...s.history.past, s.config].slice(-50),
              future: [],
              transactionStart: null,
            },
      });
      return { ok: true };
    } catch (error) {
      return failure(String(error));
    }
  }
  const actions = {
    setVariant: (id: string) =>
      commit((c) => {
        c.variantId = id;
        for (const section of definition.sections)
          if (section.variantIds.includes(id) && !c.sections[section.id])
            c.sections[section.id] = { backgroundColor: null, elements: [] };
      }),
    setOption: (id: string, value: string | string[]) =>
      commit((c) => {
        c.optionSelections[id] = value;
      }),
    setQuantity: (value: number) =>
      commit((c) => {
        c.quantity = value;
      }),
    selectSection: (id: string): CommandResult => {
      if (
        !definition.sections.some(
          (s) =>
            s.id === id &&
            s.variantIds.includes(store.getState().config.variantId),
        )
      )
        return failure('Unknown section');
      store.setState({
        ui: { selectedSectionId: id, selectedElementId: null },
      });
      return { ok: true };
    },
    selectElement: (id: string | null): CommandResult => {
      const s = store.getState();
      if (
        id &&
        !s.config.sections[s.ui.selectedSectionId]?.elements.some(
          (e) => e.id === id,
        )
      )
        return failure('Unknown element');
      store.setState({ ui: { ...s.ui, selectedElementId: id } });
      return { ok: true };
    },
    setSectionBackground: (id: string, color: string | null) =>
      commit((c) => {
        c.sections[id]!.backgroundColor = color;
      }),
    addElement: (id: string, element: DesignElement) =>
      commit((c) => {
        c.sections[id]!.elements.push(element);
      }),
    updateElement: (
      id: string,
      elementId: string,
      patch: {
        type: DesignElement['type'];
        changes:
          | Partial<Omit<TextElement, 'id' | 'type'>>
          | Partial<Omit<ImageElement, 'id' | 'type'>>;
      },
    ) =>
      commit((c) => {
        const e = c.sections[id]!.elements.find((e) => e.id === elementId);
        if (!e || e.type !== patch.type)
          throw new Error('Unknown element/type');
        if ('id' in patch.changes || 'type' in patch.changes)
          throw new Error('Immutable element identity');
        Object.assign(e, patch.changes);
      }),
    addImage: (
      sectionId: string,
      asset: AssetMetadata,
      element: ImageElement,
    ) =>
      commit((c) => {
        if (element.assetId !== asset.id)
          throw new Error('Asset reference mismatch');
        c.assets[asset.id] = asset;
        c.sections[sectionId]!.elements.push(element);
      }),
    duplicateElement: (sectionId: string, elementId: string) =>
      commit((c) => {
        const section = c.sections[sectionId]!,
          index = section.elements.findIndex((e) => e.id === elementId);
        if (index < 0) throw new Error('Unknown element');
        const copy = structuredClone(section.elements[index]!);
        copy.id = crypto.randomUUID();
        copy.transform.position.x = Math.min(
          1,
          copy.transform.position.x + 0.03,
        );
        copy.transform.position.y = Math.min(
          1,
          copy.transform.position.y + 0.03,
        );
        section.elements.splice(index + 1, 0, copy);
      }),
    // One atomic commit/history entry for all targets; failed validation changes nothing.
    copySection: (
      sourceId: string,
      targetIds: string[],
      parts: 'background' | 'elements' | 'all' = 'all',
    ) =>
      commit((c) => {
        const source = c.sections[sourceId];
        if (!source) throw new Error('Unknown source');
        for (const id of new Set(targetIds)) {
          if (id === sourceId) continue;
          const target = c.sections[id];
          if (!target) throw new Error('Unknown target');
          if (parts !== 'elements')
            target.backgroundColor = source.backgroundColor;
          if (parts !== 'background')
            target.elements = source.elements.map((e) => ({
              ...structuredClone(e),
              id: crypto.randomUUID(),
            }));
        }
      }),
    applySectionToAll: (
      sourceId: string,
      parts: 'background' | 'elements' | 'all' = 'all',
    ): CommandResult =>
      actions.copySection(
        sourceId,
        definition.sections
          .filter((s) =>
            s.variantIds.includes(store.getState().config.variantId),
          )
          .map((s) => s.id),
        parts,
      ),
    removeElement: (id: string, elementId: string) =>
      commit((c) => {
        const s = c.sections[id]!;
        if (!s.elements.some((e) => e.id === elementId))
          throw new Error('Unknown element');
        s.elements = s.elements.filter((e) => e.id !== elementId);
      }),
    reorder: (id: string, ids: string[]) =>
      commit((c) => {
        const s = c.sections[id]!;
        if (
          ids.length !== s.elements.length ||
          new Set(ids).size !== ids.length
        )
          throw new Error('Invalid permutation');
        s.elements = ids.map((id) => {
          const e = s.elements.find((e) => e.id === id);
          if (!e) throw new Error('Unknown element');
          return e;
        });
      }),
    beginTransaction: (): CommandResult => {
      const s = store.getState();
      if (s.history.transactionStart) return failure('Transaction active');
      store.setState({ history: { ...s.history, transactionStart: s.config } });
      return { ok: true };
    },
    commitTransaction: (): CommandResult => {
      const s = store.getState();
      const start = s.history.transactionStart;
      if (!start) return failure('No transaction');
      store.setState({
        history: {
          past:
            JSON.stringify(start) === JSON.stringify(s.config)
              ? s.history.past
              : [...s.history.past, start].slice(-50),
          future:
            JSON.stringify(start) === JSON.stringify(s.config)
              ? s.history.future
              : [],
          transactionStart: null,
        },
      });
      return { ok: true };
    },
    cancelTransaction: (): CommandResult => {
      const s = store.getState();
      if (!s.history.transactionStart) return failure('No transaction');
      const config = s.history.transactionStart;
      store.setState({
        config,
        configRevision: s.configRevision + 1,
        validationIssues: validateConfig(config, definition),
        history: { ...s.history, transactionStart: null },
      });
      return { ok: true };
    },
    undo: (): CommandResult => travel(false),
    redo: (): CommandResult => travel(true),
    loadConfig: (input: unknown): CommandResult => {
      try {
        const config = parseConfig(input);
        const issues = validateConfig(config, definition);
        if (issues.some((i) => i.code !== 'FONT_TOO_SMALL'))
          return { ok: false, issues };
        store.setState({
          config,
          configRevision: store.getState().configRevision + 1,
          validationIssues: issues,
          history: { past: [], future: [], transactionStart: null },
          ui: {
            selectedSectionId:
              definition.sections.find((s) =>
                s.variantIds.includes(config.variantId),
              )?.id ?? '',
            selectedElementId: null,
          },
        });
        return { ok: true };
      } catch (e) {
        return failure(String(e));
      }
    },
    exportConfig: () => exportConfig(store.getState().config),
  };
  function travel(redo: boolean): CommandResult {
    const s = store.getState();
    if (s.history.transactionStart) return failure('Transaction active');
    const source = redo ? s.history.future : s.history.past;
    const config = source.at(-1);
    if (!config) return failure('History empty');
    store.setState({
      config,
      configRevision: s.configRevision + 1,
      validationIssues: validateConfig(config, definition),
      history: {
        past: redo
          ? [...s.history.past, s.config].slice(-50)
          : source.slice(0, -1),
        future: redo ? source.slice(0, -1) : [...s.history.future, s.config],
        transactionStart: null,
      },
    });
    return { ok: true };
  }
  return { store, actions };
}
