// Le prove del motore che girano in Node, senza browser (niente Chromium, niente Playwright): il centro attività,
// le preparazioni manuali dei media, il catalogo e il piano degli effetti.
//   node test/unit/esegui.mjs            (oppure: npm run prova:motore)
// Prima si costruisce un pacchetto SSR con Vite (i moduli veri di src/, gli stessi dell'app) in test/.tmp/unit, poi si
// lanciano i file *.test.mjs con il test runner di Node.
import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBaseline } from './cattura-baseline-effetti.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const radice = path.resolve(qui, '../..');
const out = path.join(radice, 'test/.tmp/unit');

await build({
  root: radice,
  configFile: false,
  logLevel: 'warn',
  // Esponiamo solo nel bundle di prova un confine asincrono privato; nessun hook nell'app.
  plugins: [{ name: 'confini-progetti-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/progetti.ts')) return { code: code + '\nexport { mettiCopia as _testMettiCopia, valida as _testValida };', map: null };
    if (id.replaceAll('\\', '/').endsWith('/src/media/proxy.ts')) return { code: code + '\nexport { scriviProxy as _testScriviProxy };', map: null };
    if (id.replaceAll('\\', '/').endsWith('/src/ui/live.ts')) return { code: code + '\nexport { avvisaErroreSchermo as _testAvvisaErroreSchermo };', map: null };
    if (id.replaceAll('\\', '/').endsWith('/src/pacchetto.ts')) return { code: code + '\nexport { progettoDentro as _testProgettoDentro };', map: null };
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
        idoneitaAI: path.join(radice, 'src/media/idoneitaAI.ts'),
        modelliAI: path.join(radice, 'src/media/modelliAI.ts'),
        centroAI: path.join(radice, 'src/ui/centroAI.ts'),
        normalizza: path.join(radice, 'src/media/normalizza.ts'),
        blocchi: path.join(radice, 'src/core/blocchi.ts'),
        effetti: path.join(radice, 'src/effetti.ts'),
        piano: path.join(radice, 'src/render/piano.ts'),
        compositore: path.join(radice, 'src/render/compositore.ts'),
        progetto: path.join(radice, 'src/core/progetto.ts'),
        progetti: path.join(radice, 'src/progetti.ts'),
        traduci: path.join(radice, 'src/media/traduci.ts'),
        voce: path.join(radice, 'src/media/voce.ts'),
        ritaglio: path.join(radice, 'src/media/ritaglio.ts'),
        vram: path.join(radice, 'src/media/vram.ts'),
        live: path.join(radice, 'src/ui/live.ts'),
        store: path.join(radice, 'src/core/store.ts'),
        mossformer: path.join(radice, 'src/core/mossformer.ts'),
        esportazione: path.join(radice, 'src/core/esportazione.ts'),
        codaExport: path.join(radice, 'src/core/codaExport.ts'),
        lut: path.join(radice, 'src/render/lut.ts'),
        curve: path.join(radice, 'src/render/curve.ts'),
        colore: path.join(radice, 'src/render/colore.ts'),
        coloreGpu: path.join(radice, 'src/render/coloreGpu.ts'),
        ducking: path.join(radice, 'src/core/ducking.ts'),
        audio: path.join(radice, 'src/media/audio.ts'),
        montaggio: path.join(radice, 'src/core/montaggio.ts'),
        coloreAudioProgetto: path.join(radice, 'src/core/coloreAudioProgetto.ts'),
        zoomCursore: path.join(radice, 'src/core/zoomCursore.ts'),
        cursoreLive: path.join(radice, 'src/media/cursoreLive.ts'),
        anelliClic: path.join(radice, 'src/render/cursore.ts'),
        pacchetto: path.join(radice, 'src/pacchetto.ts'),
        automazioni: path.join(radice, 'src/core/automazioni.ts'),
        maschereForma: path.join(radice, 'src/core/maschereForma.ts'),
        titoliHtml: path.join(radice, 'src/core/titoliHtml.ts'),
      },
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'pezzi/[name]-[hash].mjs' },
    },
  },
});

writeFileSync(path.join(out, 'baseline-fx.json'), JSON.stringify(await hashBaseline()));

const filtro = process.argv[2];
const prove = readdirSync(qui).filter((f) => f.endsWith('.test.mjs') && (!filtro || f.includes(filtro))).map((f) => path.join(qui, f));
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...prove], { stdio: 'inherit', cwd: radice, env: { ...process.env, DPV_UNIT: out } });
process.exit(r.status ?? 1);
