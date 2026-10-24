// Banco CPU vero, senza browser. NON misura GPU, fps del monitor o export.
// Prima: npm run prova:motore. Poi: node test/unit/bench-effetti.mjs
import { carica } from './_aiuti.mjs';
import { scena } from './scena-effetti.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.argv.includes('--baseline');
const caricaBanco = (nome) => base ? import(pathToFileURL(path.resolve('test/.tmp/baseline-fx', nome + '.mjs'))) : carica(nome);
const B = await caricaBanco('blocchi'), P = await caricaBanco('progetto');
const esiti = [];
for (const id of ['bn', 'sfoca', 'bagliore', 'flash']) {
  const p = scena(P, B, Array(3).fill(id));
  const t = p.clips[0].track;
  p.clips.push(...Array.from({ length: 199 }, (_, i) => P.newClip('bars', t, (i + 1) * 250, 250)));
  for (let i = 0; i < 10; i++) B.statoEffetti(p, 125);
  const tempi = [];
  for (let j = 0; j < 5; j++) {
    const a = performance.now();
    for (let i = 0; i < 100; i++) B.statoEffetti(p, 125);
    tempi.push((performance.now() - a) / 100);
  }
  tempi.sort((a, b) => a - b);
  esiti.push({ id, clip: 200, blocchi: 3, msPerStatoMediana: tempi[2] });
}
console.log(JSON.stringify({ ambito: 'CPU statoEffetti, non rendering', node: process.version, esiti }, null, 2));
