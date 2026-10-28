// Prova a mano (scarica i modelli veri da Hugging Face): dal Centro AI si scarica un modello; poi, in una pagina NUOVA (come dopo
// aver riaperto il programma), lo si ricarica e si guarda se riscarica qualcosa.
//   npm run build && node test/_modelli_reali.mjs [id modello …]      (default: modnet ben2)
import { chromium } from 'playwright';
import path from 'node:path';
import { servi } from './servi.mjs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['modnet', 'ben2'];
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
const richieste = [];
ctx.on('request', (r) => { if (/huggingface\.co|hf\.co/.test(r.url())) richieste.push(r.url().split('/resolve/')[1] ?? r.url()); });
const apri = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); await p.goto(srv.url + '/app/'); await p.waitForSelector('.pulsantiera'); await p.waitForTimeout(1000); return p; };
const scarica = (p, id) => p.evaluate(async (id) => {
  const lista = window.__dpvTest.MH.modelliHub();
  const m = lista.find((x) => x.id === id);
  if (!m) return 'non esiste';
  try { await m.scarica(() => {}); } catch (e) { return 'ERRORE ' + (e?.message ?? e); }
  const st = await window.__dpvTest.MH.statoModelli(lista);
  return JSON.stringify(st.get(id));
}, id);
for (const id of ids) {
  let p = await apri();
  richieste.length = 0;
  let t = Date.now();
  const r = await scarica(p, id);
  const pesi = (l) => l.filter((u) => /\.(onnx|bin|safetensors|ort)/.test(u)).length;
  console.log(id, '→ scarica:', r, ((Date.now() - t) / 1000).toFixed(1) + ' s,', pesi(richieste), 'richieste di pesi');
  await p.close();
  p = await apri();
  richieste.length = 0; t = Date.now();
  const r2 = await scarica(p, id);
  console.log(id, '→ pagina nuova:', r2, ((Date.now() - t) / 1000).toFixed(1) + ' s,', pesi(richieste), 'richieste di pesi (attese 0)', richieste.length ? '· altre: ' + richieste.slice(0, 4).join(' ') : '');
  await p.close();
}
await b.close(); srv.chiudi();
