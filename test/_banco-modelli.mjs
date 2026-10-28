// Banco di velocità dei modelli veri (non è una prova della suite: scarica i modelli da Hugging Face e usa la scheda video di Chrome).
//   npm run build && node test/_banco-modelli.mjs <sam3|whisper|nllb|tutto> [id modello …]
// Misura per ogni modello: quanto ci mette a caricarsi, quanto per una passata (a regime) e dove gira (scheda video o processore).
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { servi } from './servi.mjs';

const cosa = process.argv[2] || 'tutto';
const solo = process.argv.slice(3);
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: process.env.CANALE || 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 240)); });
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message.slice(0, 240)));
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pulsantiera');
await page.waitForTimeout(1000);
const out = (o) => console.log(JSON.stringify(o));
out(await page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return { webgpu: !!a, scheda: a?.info?.description || a?.info?.device || '', f16: a?.features?.has('shader-f16'), isolata: self.crossOriginIsolated }; }));

if (cosa === 'whisper' || cosa === 'tutto') {
  const wav = fs.readFileSync('C:/Users/cammo/AppData/Roaming/com.pais.handy/recordings/handy-1793125734.wav');
  const pcm = wav.subarray(44 + 16000 * 2 * 120, 44 + 16000 * 2 * 150); // 30 s di parlato vero (16 kHz mono int16)
  const b64 = pcm.toString('base64');
  const prove = [
    ['onnx-community/whisper-tiny', { encoder_model: 'fp16', decoder_model_merged: 'fp16' }, 'fp16/fp16 (com\'è ora)'],
    ['onnx-community/whisper-tiny', { encoder_model: 'fp16', decoder_model_merged: 'q4' }, 'fp16/q4'],
    ['onnx-community/whisper-base', { encoder_model: 'fp16', decoder_model_merged: 'fp16' }, 'fp16/fp16 (com\'è ora)'],
    ['onnx-community/whisper-base', { encoder_model: 'fp16', decoder_model_merged: 'q4' }, 'fp16/q4'],
    ['onnx-community/whisper-small', { encoder_model: 'fp16', decoder_model_merged: 'fp16' }, 'fp16/fp16 (com\'è ora)'],
    ['onnx-community/whisper-small', { encoder_model: 'fp16', decoder_model_merged: 'q4' }, 'fp16/q4'],
    ['onnx-community/whisper-large-v3-turbo', { encoder_model: 'fp16', decoder_model_merged: 'q4' }, 'fp16/q4'],
    ['onnx-community/whisper-large-v3-turbo', { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }, 'q4f16/q4f16 (564 MB)'],
  ].filter((p) => !solo.length || solo.some((s) => p[0].includes(s)));
  for (const [repo, dtype, nome] of prove) {
    const r = await page.evaluate(async ({ repo, dtype, b64 }) => {
      try {
        const T = await import(location.origin + '/ai/transformers.min.js');
        const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const i16 = new Int16Array(raw.buffer);
        const audio = Float32Array.from(i16, (v) => v / 32768);
        let scaricato = 0;
        const t0 = performance.now();
        const asr = await T.pipeline('automatic-speech-recognition', repo, { device: 'webgpu', dtype, progress_callback: (p) => { if (p.status === 'progress') scaricato = Math.max(scaricato, p.loaded || 0); } });
        const carica = (performance.now() - t0) / 1000;
        const giri = [];
        let testo = '';
        for (let i = 0; i < 3; i++) {
          const t = performance.now();
          const o = await asr(audio, { chunk_length_s: 30, return_timestamps: true, language: 'italian', task: 'transcribe' });
          giri.push((performance.now() - t) / 1000);
          testo = o.text;
        }
        return { carica, giri, testo: testo.slice(0, 90), parole: testo.split(/\s+/).length };
      } catch (e) { return { errore: String(e?.message || e).slice(0, 300) }; }
    }, { repo, dtype, b64 });
    out({ modello: repo.split('/')[1], config: nome, ...r, rtf: r.giri ? +(r.giri[r.giri.length - 1] / 30).toFixed(3) : undefined });
  }
}

if (cosa === 'nllb' || cosa === 'tutto') {
  const frasi = ['Buongiorno a tutti, oggi vi mostro come montare un video in pochi minuti.', 'Questa funzione toglie lo sfondo senza bisogno di uno schermo verde.', 'Ricordatevi di iscrivervi al canale e di lasciare un commento.', 'Il montaggio automatico sceglie le scene migliori e le mette a tempo di musica.', 'Grazie per aver guardato, ci vediamo alla prossima puntata.', 'Adesso aggiungiamo un titolo animato e una transizione morbida.'];
  for (const [repo, dtype] of [['Xenova/nllb-200-distilled-600M', 'q8'], ['Xenova/nllb-200-distilled-600M', 'fp32'], ['Xenova/nllb-200-distilled-600M', 'q4'], ['Xenova/opus-mt-it-en', 'q8']].filter((x) => !solo.length || solo.some((k) => (x[0] + ' ' + x[1]).includes(k)))) {
    const r = await page.evaluate(async ({ repo, dtype, frasi }) => {
      try {
        const T = await import(location.origin + '/ai/transformers.min.js');
        const t0 = performance.now();
        const dev = dtype === 'q8' && /nllb/.test(repo) ? 'wasm' : 'webgpu';
        const tr = await T.pipeline('translation', repo, { device: dev, dtype });
        const carica = (performance.now() - t0) / 1000;
        const giri = [];
        let ex = '';
        for (let i = 0; i < 2; i++) {
          const t = performance.now();
          const opz = /nllb/.test(repo) ? { src_lang: 'ita_Latn', tgt_lang: 'eng_Latn', max_new_tokens: 96 } : { max_new_tokens: 96 };
          const ris = [];
          for (const f of frasi) ris.push((await tr(f, opz))[0].translation_text);
          giri.push((performance.now() - t) / 1000);
          ex = ris[0] + ' | ' + ris[1];
        }
        return { carica, giri, esempio: ex };
      } catch (e) { return { errore: String(e?.message || e).slice(0, 300) }; }
    }, { repo, dtype, frasi });
    out({ modello: repo.split('/')[1], dtype, frasi: frasi.length, ...r });
  }
}

if (cosa === 'sam3' || cosa === 'tutto') {
  const r = await page.evaluate(async () => {
    try {
      const { P, RT, ripresaDiProva, importaFile } = window.__dpvTest;
      const blob = await ripresaDiProva(4, 25);
      const [m] = await importaFile([{ name: 'Prova.webm', file: new File([await blob.arrayBuffer()], 'Prova.webm', { type: 'video/webm' }) }], { chiediFormato: false });
      for (let i = 0; i < 80 && !window.__dpvTest.mediaRT(m.id)?.v; i++) await new Promise((r) => setTimeout(r, 100));
      const tv = window.__dpv.doc.tracks.find((t) => t.kind === 'video');
      let id = '';
      window.__dpv.edit('Ripresa', (p) => { const c = P.newClip('media', tv.id, 0, 100, { media: m.id, name: 'R', srcIn: 0 }); c.ritaglio = { modo: 'oggetti', modello: 'sam3', bordo: 0, morbido: 0.2, qualita: 1, punti: [{ x: 0.5, y: 0.5, dentro: true }], da: 0.5, segui: true }; p.clips.push(c); id = c.id; });
      const c = window.__dpv.doc.clips.find((z) => z.id === id);
      const t0 = performance.now();
      let tSeguo = 0, ultima = '';
      const esito = await RT.elaboraRitaglio(window.__dpv.doc, c, { anteprima: 2, stato: (f) => { if (!tSeguo && /Seguo/.test(f)) tSeguo = performance.now(); ultima = f; } });
      const lavoro = (performance.now() - tSeguo) / 1000;
      const n = esito.maschere?.n ?? 0;
      return { ok: esito.ok, motivo: esito.motivo, dispositivo: esito.dispositivo, totale: (performance.now() - t0) / 1000, maschere: n, secPerFotogramma: n ? +(lavoro / n).toFixed(3) : null, w: esito.maschere?.w, h: esito.maschere?.h, hz: esito.maschere?.hz };
    } catch (e) { return { errore: String(e?.message || e).slice(0, 300) }; }
  });
  out({ modello: 'sam3 (app, qualità media)', ...r });
}
await b.close(); srv.chiudi();
