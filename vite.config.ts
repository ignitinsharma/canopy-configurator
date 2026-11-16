import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@products': fileURLToPath(new URL('./src/products', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@mocks': fileURLToPath(new URL('./src/mocks', import.meta.url)),
    },
  },
  test: { environment: 'jsdom', clearMocks: true },
});
