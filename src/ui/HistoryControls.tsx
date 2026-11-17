import {
  useConfigurator,
  useConfigSelector,
} from '@features/ConfiguratorContext';
export function HistoryControls() {
  const { actions } = useConfigurator(),
    history = useConfigSelector((s) => s.history);
  return (
    <div className="history-controls" role="group" aria-label="Design history">
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
  );
}
