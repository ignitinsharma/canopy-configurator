import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import App from './App';

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
