// TranslateGemma 4B (Google, gennaio 2026) sulla scheda video contro NLLB (non è una prova della suite: scarica ~2,7 GB da Hugging Face).
//   node test/_banco-traduzione.mjs [lingua di arrivo: en]
import { chromium } from 'playwright';
import path from 'node:path';
import { servi } from './servi.mjs';
const lingua = process.argv[2] || 'en';
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: process.env.CANALE || 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 240)); });
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message.slice(0, 240)));
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pulsantiera');
const frasi = ['Buongiorno a tutti, oggi vi mostro come montare un video in pochi minuti.', 'Questa funzione toglie lo sfondo senza bisogno di uno schermo verde.', 'Ricordatevi di iscrivervi al canale e di lasciare un commento.', 'Il montaggio automatico sceglie le scene migliori e le mette a tempo di musica.', 'Grazie per aver guardato, ci vediamo alla prossima puntata.', 'Adesso aggiungiamo un titolo animato e una transizione morbida.'];
const r = await page.evaluate(async ({ frasi, lingua, dt }) => {
  try {
    const T = await import(location.origin + '/ai/transformers.min.js');
    const repo = 'onnx-community/translategemma-text-4b-it-ONNX';
    let scaricato = 0;
    const t0 = performance.now();
    const tok = await T.AutoTokenizer.from_pretrained(repo);
    const model = await T.AutoModelForCausalLM.from_pretrained(repo, { device: 'webgpu', dtype: dt, progress_callback: (p) => { if (p.status === 'progress') scaricato = Math.max(scaricato, p.loaded || 0); } });
    const carica = (performance.now() - t0) / 1000;
    const esiti = [];
    for (let round = 0; round < 2; round++) {
      const t1 = performance.now();
      const tradotte = []; let token = 0;
      for (const f of frasi) {
        // il modello di conversazione di transformers.js lascia vuoto il testo: il prompt si scrive a mano, come da scheda del modello
        const NOMI = { it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' };
        const S = NOMI.it, D = NOMI[lingua] || lingua;
        const prompt = `<bos><start_of_turn>user
You are a professional ${S} (it) to ${D} (${lingua}) translator. Your goal is to accurately convey the meaning and nuances of the original ${S} text while adhering to ${D} grammar, vocabulary, and cultural sensitivities.
Produce only the ${D} translation, without any additional explanations or commentary. Please translate the following ${S} text into ${D}:


${f}<end_of_turn>
<start_of_turn>model
`;
        const inputs = tok(prompt, { add_special_tokens: false });
        const n0 = inputs.input_ids.dims[1];
        const out = await model.generate({ ...inputs, max_new_tokens: 96, do_sample: false });
        const nuovi = out.dims[1] > n0 ? out.slice(null, [n0, null]) : out;
        if (round === 0 && tradotte.length === 0) globalThis.__dbg = { n0, dims: out.dims, grezzo: tok.batch_decode(nuovi, { skip_special_tokens: false })[0].slice(0, 200), prompt: tok.batch_decode(inputs.input_ids, { skip_special_tokens: false })[0].slice(0, 400) };
        token += nuovi.dims[1];
        tradotte.push(tok.batch_decode(nuovi, { skip_special_tokens: true })[0].trim());
      }
      esiti.push({ secondi: (performance.now() - t1) / 1000, token, tradotte });
    }
    return { carica, esiti, dbg: globalThis.__dbg };
  } catch (e) { return { errore: String(e?.stack || e?.message || e).slice(0, 600) }; }
}, { frasi, lingua, dt: process.env.DT || 'q4f16' });
if (r.esiti) {
  const u = r.esiti[r.esiti.length - 1];
  console.log('DBG', JSON.stringify(r.dbg));
  console.log(JSON.stringify({ carica: r.carica, giri: r.esiti.map((e) => e.secondi), perFrase: u.secondi / frasi.length, tokenAlSecondo: u.token / u.secondi }));
  frasi.forEach((f, i) => console.log(`  IT: ${f}\n  ${lingua.toUpperCase()}: ${u.tradotte[i]}`));
} else console.log(JSON.stringify(r));
await b.close(); srv.chiudi();
