import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Builds the UI into ONE self-contained file, dist/ui/index.html, so the CLI can serve it as-is
 * or embed a map into it (`view -o`). `npm run dev:ui` serves ui/public/cartograph.json instead.
 */
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), viteSingleFile()],
  publicDir: command === 'serve' ? 'public' : false,
  build: {
    outDir: fileURLToPath(new URL('../dist/ui', import.meta.url)),
    emptyOutDir: true,
    // Everything, elkjs included, ends up inline in one file by design.
    chunkSizeWarningLimit: 4096,
  },
}));
