/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at a domain root or in a subfolder.
  base: './',
  // Three.js alone is ~480 kB minified; that's expected, not a problem to split.
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
