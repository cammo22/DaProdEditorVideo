// Prove sull'APP VERA (Tauri/WebView2) di questo computer: non fa parte della suite. L'app va lanciata con
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"; .\src-tauri\target\release\daprod-video.exe
// poi: node test/_app-vera.mjs <cartella coi file veri> <cartella di lavoro>
// Prova il .dap vero (Rust: scrittura, aggiunta in fondo, rilettura dal file mentre si salva), la regola delle conversioni sui
// file veri, il rilevatore dell'hardware. Salva prima localStorage e lo rimette alla fine.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const [cartella, lavoro] = process.argv.slice(2);
fs.mkdirSync(lavoro, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts()[0].pages()[0];
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 300)); });
const r = await page.evaluate(async ({ cartella, lavoro }) => {
  const out = {};
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
  out.ls = ls;
  const inv = window.__TAURI_INTERNALS__.invoke;
  const { PR, PK, PX, NZ, HW, mediaRT, P } = window.__dpvTest;
  const s = window.__dpv;
  document.dispatchEvent(new CustomEvent('dpv:home-nascondi'));
  out.versione = document.querySelector('.versione, [data-versione]')?.textContent ?? null;
  // 1 · il rilevatore dell'hardware
  try { out.hw = HW.rilevaHardware ? await HW.rilevaHardware(true) : null; } catch (e) { out.hw = String(e); }
  try { out.hwSalvato = JSON.parse(localStorage.getItem('dpv-hardware') ?? 'null'); } catch { out.hwSalvato = null; }
  // 2 · la regola delle conversioni sui file veri
  const nomi = ['Registrazione 2026-10-15 18.18.13.mp4', 'Registrazione 2026-10-15 18.18.13 webcam.webm', 'Registrazione 2026-10-15 18.18.13 microfono.webm', 'DaProdProduzioni Technologies _ 3D VR AI Solutions S.r.l..m4a', 'BRO_ CONCENTRATI (2).m4a'];
  const file = nomi.map((n) => ({ name: n, path: cartella + '\\' + n }));
  out.esame = {};
  for (const f of file) { try { out.esame[f.name] = await NZ.esamina(f); } catch (e) { out.esame[f.name] = String(e); } }
  // 3 · il .dap vero
  s.dirty = false;
  await PR.nuovo();
  localStorage.setItem('dpv-normalizza', 'no');
  const media = await PR.importaFile(file.slice(0, 3), { chiediFormato: false });
  for (let i = 0; i < 100 && media.some((m) => mediaRT(m.id)?.stato !== 'ok'); i++) await new Promise((r) => setTimeout(r, 100));
  const tv = s.doc.tracks.find((t) => t.kind === 'video'), ta = s.doc.tracks.find((t) => t.kind === 'audio');
  s.edit('Prova', (p) => { p.name = 'Prova dap vera'; p.clips.push(P.newClip('media', tv.id, 0, 100, { media: media[0].id, name: 'schermo' })); p.clips.push(P.newClip('media', ta.id, 0, 100, { media: media[2].id, name: 'mic' })); });
  const dap = lavoro + '\\Prova dap vera.dap';
  const peso = async (p) => inv('media_dimensione', { path: p });
  const pesi = [];
  for (const m of media) pesi.push(await peso(m.path));
  const proxy = await PX.proxyDelProgetto(s.doc.media);
  const t0 = performance.now();
  const piano1 = await PK.pianoDap(null, proxy);
  await PK.scriviDapApp(dap, null, piano1, () => {}, () => false);
  out.primo = { ms: Math.round(performance.now() - t0), byte: await peso(dap), media: pesi.reduce((a, b) => a + b, 0), proxy: proxy.size, cose: piano1.cose.length };
  // si aggiunge un file e una clip, si salva di nuovo: deve AGGIUNGERE solo il file nuovo e il progetto
  const [quarto] = await PR.importaFile([file[3]], { chiediFormato: false });
  s.edit('Prova 2', (p) => { p.clips.push(P.newClip('media', ta.id, 100, 50, { media: quarto.id, name: 'musica' })); });
  const vecchie = await PK.indicePacchetto({ path: dap });
  const piano2 = await PK.pianoDap(vecchie, await PX.proxyDelProgetto(s.doc.media));
  const t1 = performance.now();
  await PK.scriviDapApp(dap, vecchie, piano2, () => {}, () => false);
  out.secondo = { ms: Math.round(performance.now() - t1), byte: await peso(dap), nuovi: piano2.cose.map((c) => c.nome), tenute: piano2.tenute.length, quarto: await peso(quarto.path) };
  // "un altro computer": si riapre il .dap; i media ora si leggono DA DENTRO il .dap
  s.dirty = false;
  await PR.nuovo();
  await PR.apriFile({ path: dap });
  for (let i = 0; i < 100 && s.doc.media.some((m) => mediaRT(m.id)?.stato !== 'ok'); i++) await new Promise((r) => setTimeout(r, 100));
  out.riaperto = { nome: s.doc.name, clip: s.doc.clips.length, media: s.doc.media.map((m) => ({ n: m.name, ok: mediaRT(m.id)?.stato, dentro: !!m.dentro, dap: m.path === dap, dur: Math.round(m.duration * 10) / 10 })) };
  { const m0 = s.doc.media.find((m) => m.type === 'video'); const rt = mediaRT(m0.id); out.video = { traccia: !!rt?.v, decodifica: rt?.vDecodable, w: m0.width, h: m0.height }; }
  // 4 · Salva vero (Ctrl+S) mentre i media si leggono da dentro lo stesso .dap: deve aggiungere in fondo, non riscrivere
  s.edit('Prova 3', (p) => { p.clips.push(P.newClip('color', tv.id, 200, 25, { name: 'colore' })); });
  const prima = await peso(dap);
  await PR.salva();
  out.terzo = { prima, dopo: await peso(dap), sporco: s.dirty };
  s.dirty = false;
  await PR.nuovo();
  await PR.apriFile({ path: dap });
  for (let i = 0; i < 100 && s.doc.media.some((m) => mediaRT(m.id)?.stato !== 'ok'); i++) await new Promise((r) => setTimeout(r, 100));
  out.finale = { clip: s.doc.clips.length, colore: s.doc.clips.some((c) => c.name === 'colore'), ok: s.doc.media.every((m) => mediaRT(m.id)?.stato === 'ok') };
  // pulizia: progetto vuoto e localStorage com'era
  s.dirty = false;
  await PR.nuovo();
  localStorage.clear();
  for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  delete out.ls;
  return out;
}, { cartella, lavoro });
console.log(JSON.stringify(r, null, 1));
await browser.close();
