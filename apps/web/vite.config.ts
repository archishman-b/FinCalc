import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves this project from https://archishman-b.github.io/FinCalc/
// out of the repository's /docs folder, so the build writes straight there —
// no dist → docs rename step. `base` must match the repository name exactly.
export default defineConfig({
  base: '/FinCalc/',
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    outDir: '../../docs',
    emptyOutDir: true,
    sourcemap: false,
  },
});
