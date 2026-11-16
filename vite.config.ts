import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Fonts are inlined so the build is self-contained wherever it is hosted.
  build: { target: 'es2022', chunkSizeWarningLimit: 1200, assetsInlineLimit: 20000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
