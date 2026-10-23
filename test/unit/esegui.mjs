// Le prove del motore che girano in Node, senza browser (niente Chromium, niente Playwright): il centro attività,
// le preparazioni manuali dei media, il catalogo e il piano degli effetti.
//   node test/unit/esegui.mjs            (oppure: npm run prova:motore)
// Prima si costruisce un pacchetto SSR con Vite (i moduli veri di src/, gli stessi dell'app) in test/.tmp/unit, poi si
// lanciano i file *.test.mjs con il test runner di Node.
import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const radice = path.resolve(qui, '../..');
const out = path.join(radice, 'test/.tmp/unit');

await build({
  root: radice,
  configFile: false,
  logLevel: 'warn',
  // Esponiamo solo nel bundle di prova un confine asincrono privato; nessun hook nell'app.
  plugins: [{ name: 'confini-progetti-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/progetti.ts')) return { code: code + '\nexport { mettiCopia as _testMettiCopia };', map: null };
    if (id.replaceAll('\\', '/').endsWith('/src/media/proxy.ts')) return { code: code + '\nexport { scriviProxy as _testScriviProxy };', map: null };
  } }],
  define: { __VERSIONE__: JSON.stringify('prova') },
  build: {
    ssr: true,
    outDir: out,
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: {
        flussiUI: path.join(radice, 'src/core/flussiUI.ts'),
        attivita: path.join(radice, 'src/media/attivita.ts'),
        libreria: path.join(radice, 'src/media/libreria.ts'),
        proxy: path.join(radice, 'src/media/proxy.ts'),
        normalizza: path.join(radice, 'src/media/normalizza.ts'),
        blocchi: path.join(radice, 'src/core/blocchi.ts'),
        effetti: path.join(radice, 'src/effetti.ts'),
        piano: path.join(radice, 'src/render/piano.ts'),
        compositore: path.join(radice, 'src/render/compositore.ts'),
        progetto: path.join(radice, 'src/core/progetto.ts'),
        progetti: path.join(radice, 'src/progetti.ts'),
        store: path.join(radice, 'src/core/store.ts'),
      },
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'pezzi/[name]-[hash].mjs' },
    },
  },
});

const filtro = process.argv[2];
const prove = readdirSync(qui).filter((f) => f.endsWith('.test.mjs') && (!filtro || f.includes(filtro))).map((f) => path.join(qui, f));
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...prove], { stdio: 'inherit', cwd: radice, env: { ...process.env, DPV_UNIT: out } });
process.exit(r.status ?? 1);
