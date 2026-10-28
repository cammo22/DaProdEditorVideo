// Prova a mano (non nella suite: scarica il modello vero da Hugging Face): un parlato vero con rumore, tolto con «Voce pulita» dal worker vero.
//   npm run build && node test/_mf_reale.mjs [forza]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { servi } from './servi.mjs';
const forza = process.argv[2] || 'pulita';
const srv = await servi(path.resolve('dist'));
// CANALE=chrome: col Chrome vero e la scheda video (WebGPU); senza, il Chromium delle prove (solo processore)
const b = await chromium.launch(process.env.CANALE ? { channel: process.env.CANALE, headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] } : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' }); await page.waitForSelector('.pulsantiera'); await page.waitForTimeout(1200);
const buf = fs.readFileSync('C:/Users/cammo/AppData/Roaming/com.pais.handy/recordings/handy-1793125734.wav');
const pcm = buf.subarray(44 + 16000 * 2 * 120, 44 + 16000 * 2 * 132);   // 12 s dal minuto 2 (16 kHz mono, int16)
const dati = pcm.toString('base64');
const cid = await page.evaluate(async (b64) => {
  const { P, importaFile } = window.__dpvTest;
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const n = raw.length / 2, sr = 16000, x = new Int16Array(raw.buffer);
  const wav = new ArrayBuffer(44 + n * 2), v = new DataView(wav);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
  // rumore bianco a circa 8 dB sotto il parlato
  let p = 0; for (let i = 0; i < n; i++) p += x[i] * x[i]; const rms = Math.sqrt(p / n);
  // rumore sempre uguale (così due giri si possono confrontare)
  let seme = 12345; const caso = () => { seme = (seme * 1664525 + 1013904223) >>> 0; return seme / 4294967296; };
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, x[i] + (caso() * 2 - 1) * rms * 0.7)), true);
  const prj = P.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
  window.__dpv.load(prj);
  const [m] = await importaFile([{ name: 'Voce.wav', file: new File([wav], 'Voce.wav', { type: 'audio/wav' }) }], { chiediFormato: false });
  let id = '';
  window.__dpv.edit('Voce', (pp) => { const a1 = pp.tracks.find((t) => t.kind === 'audio').id; const c = P.newClip('media', a1, 0, 300, { media: m.id, name: 'Voce', srcIn: 0 }); pp.clips.push(c); id = c.id; });
  return id;
}, dati);
let finito = false;
const guida = (async () => { while (!finito) { const t = page.locator('.velo:not(.via) .ai-passi .primario'); if (await t.isVisible().catch(() => false)) await t.click().catch(() => {}); await new Promise((r) => setTimeout(r, 100)); } })();
let t0 = Date.now();
let esito = '';
for (let g = 0; g < 2; g++) {
  if (g) { t0 = Date.now(); await page.evaluate(() => window.__dpvTest.AA.tornaOriginale(window.__dpv.doc.clips[0].id)); }
  esito = await page.evaluate(async ([id, f]) => {
    try { await window.__dpvTest.AA.togliRumore(id, f); return 'ok'; } catch (e) { return 'ERRORE ' + (e?.message ?? e); }
  }, [cid, forza]);
  console.log('giro', g + 1, esito, ((Date.now() - t0) / 1000).toFixed(1), 's');
}
finito = true; await guida;
console.log('isolata', await page.evaluate(() => self.crossOriginIsolated), 'core', await page.evaluate(() => navigator.hardwareConcurrency)); console.log('esito', esito, 'in', ((Date.now() - t0) / 1000).toFixed(1), 's per 12 s di audio');
const r = await page.evaluate(async () => {
  const d = window.__dpv.doc; const c = d.clips[0]; const m = d.media.find((x) => x.id === c.media);
  const rt = window.__dpvTest.mediaRT(m.id);
  if (!rt?.file) return { nome: m.name };
  const ctx = new AudioContext({ sampleRate: 48000 });
  const ab = await ctx.decodeAudioData(await rt.file.arrayBuffer());
  const y = ab.getChannelData(0); let pk = 0, e = 0; for (let i = 0; i < y.length; i++) { pk = Math.max(pk, Math.abs(y[i])); e += y[i] * y[i]; }
  return { nome: m.name, secondi: y.length / ab.sampleRate, picco: pk, rms: Math.sqrt(e / y.length), forza: c.afx?.pulito?.forza };
});
console.log(JSON.stringify(r));
// OUT=file.wav: salva il risultato (per confrontare il filtro sulla scheda video con quello sul processore)
if (process.env.OUT) {
  const b64 = await page.evaluate(async () => { const d = window.__dpv.doc; const rt = window.__dpvTest.mediaRT(d.media.find((x) => x.id === d.clips[0].media).id); const u = new Uint8Array(await rt.file.arrayBuffer()); let o = ''; for (let i = 0; i < u.length; i += 32768) o += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(o); });
  fs.writeFileSync(process.env.OUT, Buffer.from(b64, 'base64'));
}
await b.close(); srv.chiudi();
