// Banco di SAM 3 vero (non è una prova della suite: scarica ~300 MB): una ripresa, un clic al centro, l'anteprima di 2 s.
//   npm run build && node test/_banco-sam3.mjs <ripresa.mp4> [x y]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { servi } from './servi.mjs';
const [file, x = '0.5', y = '0.45'] = process.argv.slice(2);
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: process.env.CANALE || 'chrome', args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu'] });
const page = await b.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 300)); });
await page.goto(srv.url + '/app/');
await page.waitForSelector('.pulsantiera');
const b64 = fs.readFileSync(file).toString('base64');
const r = await page.evaluate(async ({ b64, nome, x, y }) => {
  const { importaFile, P, RT, MK, USF } = window.__dpvTest;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const [m] = await importaFile([{ name: nome, file: new File([bytes], nome, { type: 'video/mp4' }) }], { chiediFormato: false });
  for (let i = 0; i < 80 && !window.__dpvTest.mediaRT(m.id)?.v; i++) await new Promise((r) => setTimeout(r, 100));
  const tv = window.__dpv.doc.tracks.find((t) => t.kind === 'video');
  let id = '';
  window.__dpv.edit('Ripresa', (p) => { const c = P.newClip('media', tv.id, 0, 250, { media: m.id, name: 'R', srcIn: 2 }); c.ritaglio = { modo: 'oggetti', modello: 'sam3', bordo: 0, morbido: 0.2, qualita: 1, punti: [{ x, y, dentro: true }], da: 2, segui: true }; p.clips.push(c); id = c.id; });
  const fasi = [];
  const t0 = performance.now();
  const c = window.__dpv.doc.clips.find((z) => z.id === id);
  let tSeguo = 0;
  const esito = await RT.elaboraRitaglio(window.__dpv.doc, c, { anteprima: 2, stato: (f) => { if (!tSeguo && /Seguo/.test(f)) tSeguo = performance.now(); if (!fasi.includes(f.replace(/\d+/g, '#'))) fasi.push(f.replace(/\d+/g, '#')); } });
  const ms = performance.now() - t0;
  const lavoro = (performance.now() - tSeguo) / 1000;
  const mk = esito.maschere;
  const copertura = mk ? mk.dati.map((d) => d.reduce((a, v) => a + (v > 127 ? 1 : 0), 0) / d.length) : [];
  return { ok: esito.ok, motivo: esito.motivo, dispositivo: esito.dispositivo, n: mk?.n, w: mk?.w, h: mk?.h, secondi: ms / 1000, secondiLavoro: lavoro, perFotogramma: lavoro / (mk?.n || 1), copertura: copertura.map((v) => Math.round(v * 100)), fasi: fasi.slice(0, 12) };
}, { b64, nome: path.basename(file), x: Number(x), y: Number(y) });
console.log(JSON.stringify(r, null, 1));
await b.close(); srv.chiudi();
