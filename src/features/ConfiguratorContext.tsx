import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createConfigStore } from '@core/store';
import type { ConfiguratorDependencies } from '@core/contracts';
import { createConfiguratorRuntime } from '@core/runtime';
import { createHttpAdapters } from '@services/httpAdapters';
import { parseDefinition } from '@core/definition';
import { createIndexedDbAssetStore } from '@services/indexedDbAssetStore';
import { useConfiguratorKeyboard } from './keyboard';
import raw from '@products/canopy-tent/definition.json';
export type Configurator = ReturnType<typeof createConfigStore> & {
  assets: ReturnType<typeof createIndexedDbAssetStore>;
  dependencies?: ConfiguratorDependencies;
};
type State = ReturnType<Configurator['store']['getState']>;
const Context = createContext<Configurator | null>(null);
export function ConfiguratorProvider({
  children,
  dependencies: injected,
}: {
  children: ReactNode;
  dependencies?: ConfiguratorDependencies;
}) {
  const [instance] = useState(() => {
    const definition = parseDefinition(raw);
    const dependencies = injected ?? {
      ...createHttpAdapters(),
      assets: createIndexedDbAssetStore(),
    };
    const runtime = createConfiguratorRuntime(definition, dependencies, {
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
    return { ...runtime, assets: dependencies.assets };
  });
  useConfiguratorKeyboard(instance);
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
