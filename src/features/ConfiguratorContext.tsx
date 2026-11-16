import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createConfigStore } from '@core/store';
import { parseDefinition } from '@core/definition';
import raw from '@products/canopy-tent/definition.json';
export type Configurator = ReturnType<typeof createConfigStore>;
type State = ReturnType<Configurator['store']['getState']>;
const Context = createContext<Configurator | null>(null);
export function ConfiguratorProvider({ children }: { children: ReactNode }) {
  const [instance] = useState(() => {
    const definition = parseDefinition(raw);
    return createConfigStore(definition, {
      schemaVersion: 1,
      productId: definition.id,
      definitionRevision: definition.revision,
      variantId: definition.variants[0]!.id,
      quantity: 1,
      optionSelections: Object.fromEntries(
        definition.optionGroups.map((g) => [g.id, g.defaultValue]),
      ),
      sections: Object.fromEntries(
        definition.sections.map((s) => [
          s.id,
          { backgroundColor: null, elements: [] },
        ]),
      ),
      assets: {},
    });
  });
  return <Context.Provider value={instance}>{children}</Context.Provider>;
}
export function useConfigurator() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing ConfiguratorProvider');
  return context;
}
export function useConfigSelector<T>(selector: (state: State) => T) {
  return useStore(useConfigurator().store, selector);
}
