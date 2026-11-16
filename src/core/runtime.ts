import { parseDefinition } from './definition';
import type { ProductConfig } from './config';
import type { ConfiguratorDependencies } from './contracts';
import { createConfigStore } from './store';
export function createConfiguratorRuntime(
  input: unknown,
  dependencies: ConfiguratorDependencies,
  config: ProductConfig,
) {
  const definition = parseDefinition(input);
  return { definition, dependencies, ...createConfigStore(definition, config) };
}
