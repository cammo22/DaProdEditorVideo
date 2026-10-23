// Baseline numerica dal sorgente Git eed765d, MAI dal file in lavorazione. Nessun browser.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { campioni } from './scena-effetti.mjs';
const radice = process.cwd();
const sorgente = execFileSync('git', ['show', 'eed765d:src/core/blocchi.ts'], { encoding: 'utf8' });
const out = path.resolve('test/.tmp/baseline-fx');
await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'baseline-git', enforce: 'pre',
  transform(_code, id) { if (id.replaceAll('\\', '/').endsWith('/src/core/blocchi.ts')) return { code: sorgente, map: null }; },
}], build: { ssr: true, outDir: out, emptyOutDir: true, minify: false, rollupOptions: {
  input: { blocchi: path.join(radice, 'src/core/blocchi.ts'), progetto: path.join(radice, 'src/core/progetto.ts') },
  output: { format: 'es', entryFileNames: '[name].mjs' },
} } });
const B = await import(pathToFileURL(path.join(out, 'blocchi.mjs'))), P = await import(pathToFileURL(path.join(out, 'progetto.mjs')));
const stati = campioni(P, B);
for (const v of Object.values(stati).flat()) for (const [k, x] of Object.entries(v)) {
  if (typeof x === 'number' && !Number.isFinite(x) && !['soleX', 'soleY'].includes(k)) throw Error(`Baseline non finita: ${k}`);
}
mkdirSync('test/unit/riferimenti', { recursive: true });
const hash = Object.fromEntries(Object.entries(stati).map(([id, v]) => [id, createHash('sha256').update(JSON.stringify(v)).digest('hex')]));
writeFileSync('test/unit/riferimenti/stati-fx-1.5.7.json', JSON.stringify(hash, null, 2) + '\n');
console.log('Snapshot numerico Git eed765d:', B.EFFETTI_TEMPO.length, 'effetti × 4 istanti. Non è una prova pixel.');
