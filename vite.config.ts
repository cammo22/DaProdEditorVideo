import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Due pagine: la home (index.html, quella di GitHub Pages) e l'editor (app/index.html).
// Percorsi relativi ('./'): lo stesso build gira su Pages (/DaProdVideo/), dentro Tauri e in locale.
export default defineConfig({
  base: './',
  define: {
    __VERSIONE__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
  // i worker come moduli: quello della voce carica l'AI solo quando serve
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        // fileURLToPath e non .pathname: con uno spazio nel percorso ("Progetti Github") .pathname dà %20 e il build non trova le pagine
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
});
