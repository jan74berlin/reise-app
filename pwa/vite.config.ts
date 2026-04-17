/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
  server: {
    proxy: {
      '/api': 'https://api.jan-toenhardt.de',
      '/uploads': 'https://api.jan-toenhardt.de',
    },
  },
});
