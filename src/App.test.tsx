import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
vi.mock('./features/editor2d/Editor', () => ({
  default: () => <div>2D test editor</div>,
}));
vi.mock('./features/viewer3d/Viewer', () => ({
  default: () => <div>3D test preview</div>,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

it('shows the shell, switches workspace selection and keeps checkout disabled', () => {
  render(<App />);
  expect(screen.getByRole('banner')).toBeTruthy();
  const view = screen.getByRole('button', { name: '3D' });
  fireEvent.click(view);
  expect(view.getAttribute('aria-pressed')).toBe('true');
  expect(
    screen
      .getByRole('button', { name: 'Options' })
      .getAttribute('aria-pressed'),
  ).toBe('false');
  expect(
    screen
      .getByRole('button', { name: 'Add to cart' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

it('hides page chrome in embed mode while preserving the configurator', () => {
  window.history.replaceState({}, '', '/?embed=1');
  render(<App />);
  expect(screen.queryByRole('banner')).toBeNull();
  expect(screen.queryByRole('contentinfo')).toBeNull();
  expect(
    screen.getByRole('main', { name: 'Product configurator' }),
  ).toBeTruthy();
});

it('switches product size and section through the instance store controls', () => {
  render(<App />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Size' }), {
    target: { value: '6.5x6.5' },
  });
  expect(
    (screen.getByRole('combobox', { name: 'Size' }) as HTMLSelectElement).value,
  ).toBe('6.5x6.5');
  fireEvent.change(screen.getByRole('combobox', { name: 'Selected section' }), {
    target: { value: 'valance-right' },
  });
  expect(
    (
      screen.getByRole('combobox', {
        name: 'Selected section',
      }) as HTMLSelectElement
    ).value,
  ).toBe('valance-right');
});

it('adds text, duplicates, deletes and undoes through artwork controls', () => {
  render(<App />);
  fireEvent.change(screen.getByLabelText('New text', { exact: true }), {
    target: { value: 'ACME' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add text' }));
  expect(screen.getByRole('button', { name: 'ACME' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
  expect(screen.getAllByRole('button', { name: 'ACME' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Delete element 2' }));
  expect(screen.getAllByRole('button', { name: 'ACME' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getAllByRole('button', { name: 'ACME' })).toHaveLength(2);
});
