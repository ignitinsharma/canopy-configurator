import { ArtworkControls } from './ArtworkControls';
import { useConfigurator, useConfigSelector } from '../ConfiguratorContext';
export function OptionsPanel() {
  const { actions } = useConfigurator();
  const definition = useConfigSelector((s) => s.definition),
    variantId = useConfigSelector((s) => s.config.variantId),
    options = useConfigSelector((s) => s.config.optionSelections),
    selected = useConfigSelector((s) => s.ui.selectedSectionId);
  return (
    <div className="options-controls">
      <label>
        Size
        <select
          aria-label="Size"
          value={variantId}
          onChange={(e) => actions.setVariant(e.target.value)}
        >
          {definition.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      {definition.optionGroups
        .filter((g) => g.kind === 'single')
        .map((g) => (
          <label key={g.id}>
            {g.label}
            <select
              aria-label={g.label}
              value={options[g.id] as string}
              onChange={(e) => actions.setOption(g.id, e.target.value)}
            >
              {g.choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      <label>
        Selected section
        <select
          aria-label="Selected section"
          value={selected}
          onChange={(e) => actions.selectSection(e.target.value)}
        >
          {definition.sections
            .filter((s) => s.variantIds.includes(variantId))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
        </select>
      </label>
      <ArtworkControls />
      <p className="status">
        Drag to orbit · Scroll to zoom · Click fabric to select a section
      </p>
    </div>
  );
}
