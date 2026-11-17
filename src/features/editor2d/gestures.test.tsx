import { useEffect, useMemo } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  ConfiguratorProvider,
  useConfigurator,
  useConfigSelector,
  type Configurator,
} from '../ConfiguratorContext';
import { ArtworkControls } from '../panels/ArtworkControls';
import { HistoryControls } from '@ui/HistoryControls';
import { createGestureSession } from './gestures';
import type { TextElement } from '@core/config';
const element: TextElement = {
  id: 'test-text',
  type: 'text',
  text: 'Editor artwork',
  fontId: 'inter-regular',
  fontSize: 0.1,
  color: '#112233',
  align: 'center',
  lineHeight: 1.2,
  transform: {
    position: { x: 0.5, y: 0.7 },
    size: { width: 0.5, height: 0.2 },
    scale: 1,
    rotationDeg: 0,
  },
};
let instance: Configurator;
function Harness() {
  const context = useConfigurator();
  const selected = useConfigSelector((s) => s.ui.selectedElementId),
    content = useConfigSelector((s) => s.config.sections['roof-front']!);
  const gesture = useMemo(() => createGestureSession(context), [context]);
  useEffect(() => {
    instance = context;
    context.actions.addElement('roof-front', element);
    return () => gesture.dispose();
  }, [context, gesture]);
  return (
    <>
      <ArtworkControls />
      <HistoryControls />
      <button onClick={() => context.actions.selectElement(element.id)}>
        Canvas hit target
      </button>
      <button
        onClick={() => {
          gesture.begin('roof-front', element.id);
          gesture.update({
            ...element.transform,
            position: { x: 0.55, y: 0.75 },
            scale: 1.2,
            rotationDeg: 30,
          });
          gesture.update({
            ...element.transform,
            position: { x: 0.6, y: 0.8 },
            scale: 1.4,
            rotationDeg: 45,
          });
          gesture.commit();
        }}
      >
        Simulate drag and transform
      </button>
      <output data-testid="selection">{selected}</output>
      <output data-testid="x">
        {content.elements[0]?.transform.position.x}
      </output>
    </>
  );
}
afterEach(cleanup);
it('shares panel/canvas selection and records a whole live gesture as one undo step', () => {
  render(
    <ConfiguratorProvider>
      <Harness />
    </ConfiguratorProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Editor artwork' }));
  expect(screen.getByTestId('selection').textContent).toBe(element.id);
  act(() => instance.actions.selectElement(null));
  fireEvent.click(screen.getByRole('button', { name: 'Canvas hit target' }));
  expect(
    screen
      .getByRole('button', { name: 'Editor artwork' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  const before = instance.store.getState().history.past.length;
  fireEvent.click(
    screen.getByRole('button', { name: 'Simulate drag and transform' }),
  );
  expect(screen.getByTestId('x').textContent).toBe('0.6');
  expect(instance.store.getState().history.past.length).toBe(before + 1);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByTestId('x').textContent).toBe('0.5');
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(screen.getByTestId('x').textContent).toBe('0.6');
});
