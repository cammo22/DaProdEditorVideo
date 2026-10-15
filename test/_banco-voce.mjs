// Banco di misura del "togli i rumori" con una voce vera (non è una prova della suite: scarica il modello vero, ci mette minuti).
//   npm run build && node test/_banco-voce.mjs <voce.wav pulita, 48 kHz mono 16 bit> [cartella dove scrivere i WAV da ascoltare]
// Sporca la voce con una ventola (rumore rosa + ronzio a 100 Hz + fischio), un'eco di stanza (riverbero ~0,5 s) e un poco di
// musica di sottofondo, poi la passa da Leggera / Voce pulita / Voce isolata e misura quanto torna vicina alla voce pulita
// (SI-SDR, dB: più alto = meglio) e quanto rumore resta nelle pause. Scrive i WAV per ascoltarli.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { servi } from './servi.mjs';

const [voce, fuori = path.resolve('test/.out/voce')] = process.argv.slice(2);
if (!voce) { console.error('uso: node test/_banco-voce.mjs voce.wav [cartella]'); process.exit(1); }
fs.mkdirSync(fuori, { recursive: true });
const srv = await servi(path.resolve('dist'));
// Chrome vero (con la scheda video) se c'è, se no il Chromium delle prove
const browser = await chromium.launch({ channel: process.env.CANALE || 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] }).catch(() => chromium.launch());
const page = await browser.newPage();
page.on('console', (m) => { if (/error|avviso/i.test(m.type())) console.log('  console:', m.text().slice(0, 300)); });
await page.goto(srv.url + '/app/');
await page.waitForSelector('.pulsantiera');
await page.waitForTimeout(1000);
const b64 = fs.readFileSync(voce).toString('base64');
const ris = await page.evaluate(async ({ b64, musica }) => {
  const { AA, importaFile, mediaRT, P } = window.__dpvTest;
  const s = window.__dpv;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dv = new DataView(bytes.buffer);
  // WAV PCM 16 bit mono: cerca "data"
  let o = 12, sr = 48000, dati = 0, n = 0;
  while (o < bytes.length - 8) { const id = String.fromCharCode(...bytes.slice(o, o + 4)); const len = dv.getUint32(o + 4, true); if (id === 'fmt ') sr = dv.getUint32(o + 12, true); if (id === 'data') { dati = o + 8; n = len / 2; break; } o += 8 + len; }
  const pulita = new Float32Array(n);
  for (let i = 0; i < n; i++) pulita[i] = dv.getInt16(dati + i * 2, true) / 32768;
  // 1 s di silenzio prima e dopo (pause vere da misurare)
  const N = n + 2 * sr;
  const secca = new Float32Array(N); secca.set(pulita, sr);
  // eco di stanza: un riverbero di Schroeder (4 pettini + 2 passa-tutto, RT60 ~0,5 s) sommato al suono diretto
  let seme = 12345; const caso = () => ((seme = (seme * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const conEco = new Float32Array(N);
  {
    const pettini = [1557, 1617, 1491, 1422].map((d) => ({ b: new Float32Array(Math.round((d * sr) / 44100)), i: 0, g: Math.pow(10, (-3 * Math.round((d * sr) / 44100)) / (0.5 * sr)) }));
    const passa = [225, 556].map((d) => ({ b: new Float32Array(Math.round((d * sr) / 44100)), i: 0 }));
    for (let n0 = 0; n0 < N; n0++) {
      const x = secca[n0];
      let y = 0;
      for (const c of pettini) { const v = c.b[c.i]; y += v; c.b[c.i] = x + v * c.g; c.i = (c.i + 1) % c.b.length; }
      y *= 0.25;
      for (const a of passa) { const v = a.b[a.i]; const u = y + v * 0.5; a.b[a.i] = u; y = v - u * 0.5; a.i = (a.i + 1) % a.b.length; }
      conEco[n0] = x + 0.45 * y;
    }
  }
  // ventola: rumore rosa + ronzio a 100 Hz con armoniche + fischio a 2,7 kHz; e una musica bassa (accordi)
  const sporca = new Float32Array(N);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < N; i++) {
    const w = caso();
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    const rosa = (b0 + b1 + b2 + w * 0.1848) * 0.05;
    const t = i / sr;
    const ronzio = 0.02 * Math.sin(2 * Math.PI * 100 * t) + 0.01 * Math.sin(2 * Math.PI * 200 * t) + 0.006 * Math.sin(2 * Math.PI * 300 * t);
    const fischio = 0.004 * Math.sin(2 * Math.PI * 2700 * t);
    const accordo = [220, 277.18, 329.63].reduce((a, f) => a + Math.sin(2 * Math.PI * f * t) * 0.008, 0) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t)) * musica;
    sporca[i] = conEco[i] * 0.8 + rosa + ronzio + fischio + accordo;
  }
  const wav = (x) => { const b = new ArrayBuffer(44 + x.length * 2), d = new DataView(b); const w = (o, t) => [...t].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0))); w(0, 'RIFF'); d.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, x.length * 2, true); for (let i = 0; i < x.length; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true); return new Uint8Array(b); };
  const leggiWav = async (f) => { const a = new Uint8Array(await f.arrayBuffer()); const v = new DataView(a.buffer); let q = 12, ch = 1, bit = 16, da = 0, len = 0, r = 48000; while (q < a.length - 8) { const id = String.fromCharCode(...a.slice(q, q + 4)); const l = v.getUint32(q + 4, true); if (id === 'fmt ') { ch = v.getUint16(q + 10, true); r = v.getUint32(q + 12, true); bit = v.getUint16(q + 22, true); } if (id === 'data') { da = q + 8; len = l; break; } q += 8 + l; } const m = len / (bit / 8) / ch; const out = new Float32Array(m); for (let i = 0; i < m; i++) out[i] = bit === 16 ? v.getInt16(da + i * ch * 2, true) / 32768 : v.getFloat32(da + i * ch * 4, true); return { x: out, sr: r }; };
  const sisdr = (est, ref) => {
    // allineamento: il ritardo (±40 ms) che rende massima la correlazione
    let best = 0, lag = 0; const M = Math.min(est.length, ref.length);
    for (let d = -Math.round(0.04 * sr); d <= Math.round(0.04 * sr); d += 1) { let c = 0; for (let i = sr; i < M - sr; i += 7) { const j = i + d; if (j >= 0 && j < est.length) c += est[j] * ref[i]; } if (c > best) { best = c; lag = d; } }
    let sr2 = 0, st = 0;
    for (let i = 0; i < M; i++) { const j = i + lag; if (j < 0 || j >= est.length) continue; sr2 += ref[i] * ref[i]; st += est[j] * ref[i]; }
    const a = st / sr2; let e = 0, t2 = 0;
    for (let i = 0; i < M; i++) { const j = i + lag; if (j < 0 || j >= est.length) continue; const tt = a * ref[i]; t2 += tt * tt; e += (est[j] - tt) ** 2; }
    return { db: 10 * Math.log10(t2 / e), lag };
  };
  const pausa = (x) => { let q = 0; const a = Math.round(0.2 * sr), b = Math.round(0.8 * sr); for (let i = a; i < b; i++) q += x[i] * x[i]; return 10 * Math.log10(Math.max(1e-24, q / (b - a))); };
  const out = { sr, secondi: N / sr, ingresso: { sisdr: sisdr(sporca, secca).db, pausa: pausa(sporca) }, file: {} };
  out.file.pulita = wav(secca); out.file.sporca = wav(sporca);
  const tv = s.doc.tracks.find((t) => t.kind === 'audio');
  for (const forza of ['leggera', 'media', 'forte']) {
    const f = new File([wav(sporca)], `Banco ${forza}.wav`, { type: 'audio/wav' });
    const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
    for (let i = 0; i < 50 && !mediaRT(m.id)?.a; i++) await new Promise((r) => setTimeout(r, 100));
    let clipId = '';
    s.edit('Banco', (p) => { const c = P.newClip('media', tv.id, 0, Math.round((N / sr) * 25), { media: m.id, name: 'Banco ' + forza }); p.clips = p.clips.filter((x) => x.track !== tv.id); p.clips.push(c); clipId = c.id; });
    const t0 = performance.now();
    try { await AA.togliRumore(clipId, forza); } catch (e) { out[forza] = { errore: String(e) }; continue; }
    const ms = performance.now() - t0;
    const c = s.doc.clips.find((x) => x.id === clipId);
    const w = await leggiWav(mediaRT(c.media).file);
    const ini = Math.round(c.srcIn * w.sr);
    let y = w.x.subarray(ini, ini + N);
    const g = Math.pow(10, (c.afx?.pulito?.piu ?? 0) / 20);
    y = Float32Array.from(y, (v) => v * g);
    const sd = sisdr(y, secca);
    // la voce pulita passata dalla STESSA catena (EQ, compressore): così si misura solo quanto rumore ed eco restano, non la catena
    let conCatena = null;
    if (forza !== 'leggera') {
      const { CV } = window.__dpvTest;
      const li = new CV.Livello(sr); li.aggiungi([sporca]);
      const ref = Float32Array.from(secca);
      new CV.CatenaVoce(sr, 1, CV.guadagnoIngresso(li.parlato)).processa([ref]);
      conCatena = sisdr(y, ref).db;
    }
    out[forza] = { sisdr: sd.db, sisdrCatena: conCatena, lag: sd.lag, pausa: pausa(y), volume: c.afx?.pulito?.piu ?? 0, secondi: ms / 1000 };
    out.file[forza] = wav(y);
  }
  // i file vanno al Node come array normali
  for (const k of Object.keys(out.file)) out.file[k] = Array.from(out.file[k]);
  return out;
}, { b64, musica: Number(process.env.MUSICA || 1) });
for (const [k, v] of Object.entries(ris.file)) fs.writeFileSync(path.join(fuori, `${k}.wav`), Buffer.from(v));
delete ris.file;
console.log(JSON.stringify(ris, null, 1));
console.log('WAV in', fuori);
await browser.close();
srv.chiudi();
