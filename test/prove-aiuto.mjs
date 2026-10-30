// Le prove della 1.3.0: trovare le cose (la ricerca dei comandi, la guida "Come si fa", il Centro AI) e le AI che non
// si fermano più per niente (libreria dentro l'app, tipi del modello provati in ordine, ripiego da NVIDIA a Whisper,
// errori spiegati in parole).
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs aiuto`.

/** una pagina pulita (contesto nuovo) */
async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  // la prova di Hugging Face fallisce dove la rete lo blocca (qui nel container): non è un errore del programma
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text()) && !/WebGPU|Failed to load resource/i.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

/** un progetto con un'immagine e una clip colorata attaccate su V1 e un tono su A1 */
const progetto = (page) => page.evaluate(async () => {
  const { P, importaFile } = window.__dpvTest;
  const s = window.__dpv;
  const c = new OffscreenCanvas(320, 180); const x = c.getContext('2d'); x.fillStyle = '#aa2222'; x.fillRect(0, 0, 320, 180);
  const f = new File([await c.convertToBlob({ type: 'image/png' })], 'Rosso.png', { type: 'image/png' });
  const p = P.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
  s.load(p);
  const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
  s.edit('Prova', (pp) => {
    const v1 = pp.tracks.filter((t) => t.kind === 'video')[1].id, a1 = pp.tracks.find((t) => t.kind === 'audio').id;
    pp.clips.push(P.newClip('media', v1, 0, 50, { name: 'Rosso', media: m.id }));
    pp.clips.push(P.newClip('color', v1, 50, 50, { name: 'Blu', gen: { color: '#2233aa' } }));
    pp.clips.push(P.newClip('tone', a1, 0, 100, { name: 'Tono', gen: { freq: 440, level: -12 } }));
  });
  s.select([]);
});

/** una transformers.js finta per i worker di voce e traduzione: il tipo "q8" non c'è (come per alcuni modelli veri) */
const LIB = `
export const env = { allowLocalModels: true };
self.__provati = [];
export async function pipeline(task, repo, opz) {
  const dtype = typeof opz.dtype === 'string' ? opz.dtype : JSON.stringify(opz.dtype);
  self.__provati.push(task + ':' + dtype);
  if (dtype === 'q8') throw new Error('Could not locate file: "https://huggingface.co/' + repo + '/resolve/main/onnx/model_quantized.onnx".');
  opz.progress_callback?.({ status: 'progress', file: 'model.onnx', loaded: 10, total: 10 });
  if (task === 'automatic-speech-recognition') return async (audio) => ({ text: 'ciao', chunks: [{ timestamp: [0.2, 1.4], text: 'Ciao a tutti (' + self.__provati.join(' ') + ')' }] });
  if (task === 'translation') return async (testi, o) => testi.map((t) => ({ translation_text: '[' + o.tgt_lang + '] ' + t }));
  throw new Error('compito inatteso ' + task);
}
`;

export async function proveAiuto({ page: paginaDi, prova }) {
  // ——— 1 · trovare le cose ———
  {
    const { page, contesto, errori } = await pagina(paginaDi);
    try {
      console.log('▶ Aiuto: la ricerca dei comandi (Ctrl+K)');
      await progetto(page);
      await page.mouse.click(5, 5);
      await page.keyboard.press('Control+k');
      await page.waitForSelector('.cerca-velo');
      prova('Ctrl+K apre la ricerca, col cursore già nel campo', await page.evaluate(() => document.activeElement?.classList.contains('cerca-input')));
      const primi = () => page.$$eval('.cerca-voce b', (b) => b.slice(0, 5).map((x) => x.textContent));
      prova('a ricerca vuota propone i consigliati', (await page.$$eval('.cerca-voce', (x) => x.length)) >= 5);
      await page.keyboard.type('velocita');
      await page.waitForTimeout(120);
      prova('"velocita" (senza accento) trova "Velocità della clip"', (await primi()).some((t) => /Velocità della clip/.test(t)), JSON.stringify(await primi()));
      await page.fill('.cerca-input', 'sfondo');
      await page.waitForTimeout(120);
      prova('"sfondo" trova "Togli lo sfondo" fra le funzioni AI e la sua guida', (await primi()).includes('Togli lo sfondo') && (await page.$$eval('.cerca-voce b', (b) => b.map((x) => x.textContent))).some((t) => /Come si fa: Togliere lo sfondo/.test(t)), JSON.stringify(await primi()));
      await page.fill('.cerca-input', 'slow motion');
      await page.waitForTimeout(120);
      prova('anche coi sinonimi: "slow motion" → velocità', (await primi()).some((t) => /Velocità/.test(t)), JSON.stringify(await primi()));
      // una transizione dalla ricerca: va sul taglio più vicino al cursore
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      prova('Esc chiude la ricerca', !(await page.$('.cerca-velo')));
      await page.evaluate(() => window.__dpv.setHead(48));
      await page.keyboard.press('Control+k');
      await page.waitForSelector('.cerca-velo');
      await page.keyboard.type('tendina cuore');
      await page.waitForTimeout(120);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
      const tr = await page.evaluate(() => window.__dpv.doc.clips.filter((c) => c.kind === 'fx').map((c) => ({ id: c.fxb.id, start: c.start, len: c.len })));
      prova('Invio su "Tendina Cuore" mette la transizione sul taglio (centrata sul fotogramma 50)', tr.length === 1 && tr[0].id === 'wipe:121' && tr[0].start < 50 && tr[0].start + tr[0].len > 50, JSON.stringify(tr));
      // un effetto sulla clip senza clip scelta: dice cosa fare
      await page.evaluate(() => window.__dpv.select([]));
      await page.keyboard.press('Control+k');
      await page.keyboard.type('vivace');
      await page.waitForTimeout(150);
      const avviso = await page.$$eval('.cerca-voce small', (s) => s.map((x) => x.textContent).find((t) => /Scegli prima una clip/.test(t)) ?? '');
      prova('un effetto sulla clip, senza clip scelta, dice "scegli prima una clip"', /Scegli prima una clip video/.test(avviso), avviso);
      await page.keyboard.press('Escape');

      console.log('▶ Aiuto: la guida "Come si fa" (F1)');
      await page.keyboard.press('F1');
      await page.waitForSelector('.dialogo.guida');
      const guida = await page.evaluate(() => ({ voci: document.querySelectorAll('.guida-voce').length, passi: document.querySelectorAll('.guida-passi li').length, titolo: document.querySelector('.guida-corpo h3')?.textContent }));
      prova('F1 apre la guida: almeno 20 argomenti, il primo con i suoi passi', guida.voci >= 20 && guida.passi >= 4 && /primo montaggio/.test(guida.titolo ?? ''), JSON.stringify(guida));
      await page.click('.guida-voce[data-id="sottotitoli"]');
      await page.click('.guida-vai');
      await page.waitForTimeout(600);
      const dove = await page.evaluate(() => ({ pagina: document.getElementById('app').dataset.pagina, sezione: document.querySelector('.fin-voce.attiva')?.dataset.s, bottone: !!document.querySelector('[data-ai="sottotitoli"]')?.offsetParent }));
      prova('"Fallo adesso" sui sottotitoli porta al Finale → Sottotitoli, col pulsante dell\'AI in vista', dove.pagina === 'finale' && dove.sezione === 'sottotitoli' && dove.bottone, JSON.stringify(dove));
      await page.keyboard.press('F9');
      await page.waitForTimeout(300);

      console.log('▶ Aiuto: il Centro AI');
      prova('c\'è il menu AI in alto e il pulsante ✨ AI', (await page.$$eval('.voce-menu', (b) => b.map((x) => x.textContent))).includes('AI') && !!(await page.$('.btn-ai')));
      await page.click('.btn-ai');
      await page.waitForSelector('.dialogo.centro-ai');
      const righe = await page.$$eval('.hub-riga', (c) => c.map((x) => x.dataset.m));
      prova('il Centro AI è l\'elenco dei modelli (sfondo, sottotitoli, rumori, voce e base), non più le schede delle funzioni', ['sam3', 'whisper-base', 'rumore', 'separa'].every((k) => righe.includes(k)) && !righe.some((k) => ['ben2', 'modnet', 'birefnet', 'sam2', 'slimsam'].includes(k)) && (await page.$$('.ai-carta')).length === 0, JSON.stringify(righe));
      prova('niente "Cosa vuoi fare" né "Clip esplicita"', (await page.$$('select[aria-label="Cosa vuoi fare"], select[aria-label="Clip su cui usare AI"]')).length === 0);
      await page.waitForFunction(() => [...document.querySelectorAll('.hub-riga')].every((x) => x.dataset.stato), null, { timeout: 15000 });
      const stati = await page.$$eval('.hub-riga', (c) => c.map((x) => x.dataset.stato));
      prova('ogni modello dice com\'è messo (pronto, da completare o da scaricare) e ha i suoi pulsanti', stati.length === righe.length && stati.every((x) => ['pronto', 'parziale', 'da-scaricare'].includes(x)) && (await page.$$('.hub-riga button')).length === righe.length * 2, JSON.stringify(stati));
      await page.evaluate(() => { document.querySelector('.centro-ai details').open = true; });
      await page.click('.ai-controlla');
      await page.waitForFunction(() => document.querySelectorAll('.ai-diag').length >= 4, null, { timeout: 90000 });
      const diag = await page.$$eval('.ai-diag', (d) => d.map((x) => ({ ok: x.className, t: x.textContent })));
      const motore = diag.find((x) => /Motore AI/.test(x.t));
      prova('"Controlla l\'AI": il motore AI parte davvero, dai file dell\'app (niente CDN)', !!motore && /\bok\b/.test(motore.ok) && /dai file dell'app/.test(motore.t), JSON.stringify(diag));
      prova('la diagnosi dice di Hugging Face, della scheda video e dei modelli sul computer', diag.some((x) => /Hugging Face/.test(x.t)) && diag.some((x) => /Scheda video/.test(x.t)) && diag.some((x) => /Modelli sul computer/.test(x.t)));
      await page.click('.centro-ai .dlg-piede .chiudi');
      await page.waitForSelector('.dialogo.centro-ai', { state: 'detached' });

      console.log('▶ Aiuto: tasti e menu riordinati');
      const reg = await page.evaluate(() => { const a = window.__dpvTest.Z.azioni; return ['importa', 'salva', 'esporta', 'guida', 'cerca', 'centroAI', 'paginaFinale'].filter((id) => a.has(id)); });
      prova('salva, importa, esporta, guida, cerca, Centro AI stanno nel registro dei comandi (coi loro tasti)', reg.length === 7, JSON.stringify(reg));
      const doppi = await page.evaluate(() => {
        const visti = new Map();
        for (const a of window.__dpvTest.Z.azioni.values()) for (const t of a.tasti ?? []) { const k = t.toLowerCase(); visti.set(k, [...(visti.get(k) ?? []), a.id]); }
        return [...visti].filter(([, ids]) => ids.length > 1).map(([k, ids]) => k + ': ' + ids.join(', '));
      });
      prova('nemmeno con i comandi nuovi un tasto è preso da due comandi', doppi.length === 0, doppi.join(' · '));
      const vista = await page.evaluate(async () => {
        document.querySelectorAll('.voce-menu').forEach((b) => { if (b.textContent === 'Vista') b.click(); });
        await new Promise((r) => setTimeout(r, 100));
        const t = document.querySelector('.tendina')?.textContent ?? '';
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        return t;
      });
      prova('Vista ha le copie leggere (quando farle, svuotale) e la memoria delle misure', /Copie leggere/.test(vista) && /memoria delle misure/.test(vista), vista.slice(0, 200));

      console.log('▶ Aiuto: la testata sta dentro lo schermo');
      const larghezze = [];
      for (const w of [1920, 1600, 1440, 1366, 1280, 1024]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(80);
        larghezze.push(await page.evaluate((w) => { const t = document.querySelector('.testata'); const e = document.querySelector('.testata-destra .btn.primario')?.getBoundingClientRect(); return { w, trabocca: t.scrollWidth > t.clientWidth + 1, esporta: !!e && e.right <= w && e.width > 0 }; }, w));
      }
      await page.setViewportSize({ width: 1600, height: 950 });
      prova('a 1920, 1600, 1440, 1366, 1280 e 1024 pixel la testata non trabocca e Esporta si vede (prima a 1366 usciva)', larghezze.every((x) => !x.trabocca && x.esporta), JSON.stringify(larghezze));

      console.log('▶ Aiuto: gli errori dell\'AI detti in parole');
      const frasi = await page.evaluate(() => {
        const { EA } = window.__dpvTest;
        return {
          rete: EA.spiegaErroreAI('TypeError: Failed to fetch'),
          manca: EA.spiegaErroreAI('Could not locate file: "https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_quantized.onnx".'),
          memoria: EA.spiegaErroreAI('RangeError: Array buffer allocation failed'),
          scheda: EA.spiegaErroreAI('GPUDevice was lost: device lost'),
          // l'errore vero di chi ha due schede video (NVIDIA + quella del processore AMD): prima non si riconosceva come "della scheda"
          setPipeline: EA.erroreDellaScheda("Failed to execute 'setPipeline' on 'GPUComputePassEncoder': parameter 1 is not of type 'GPUComputePipeline'."),
          setPipelineFrase: EA.spiegaErroreAI("Failed to execute 'setPipeline' on 'GPUComputePassEncoder': parameter 1 is not of type 'GPUComputePipeline'."),
          altri: ['Validation error: wgsl compile failed', 'GPUBuffer is destroyed', '[WebGPU] createBuffer failed', 'mapAsync failed'].map((t) => EA.erroreDellaScheda(t)),
          noScheda: EA.erroreDellaScheda('Could not locate file: model.onnx'),
          nostra: EA.spiegaErroreAI('Non ho sentito parole'),
        };
      });
      prova('"Failed to fetch" → serve internet la prima volta', /serve internet la prima volta/.test(frasi.rete), frasi.rete);
      prova('"Could not locate file" → il modello non si trova', /non si trova su Hugging Face/.test(frasi.manca), frasi.manca);
      prova('memoria finita → scegli il modello più leggero', /memoria non basta/.test(frasi.memoria), frasi.memoria);
      prova('scheda video persa → si userà il processore', /processore/.test(frasi.scheda), frasi.scheda);
      prova('"setPipeline … GPUComputePipeline" (due schede video) è un errore della scheda: si riprova sul processore, con la frase giusta', frasi.setPipeline && /processore/.test(frasi.setPipelineFrase) && frasi.altri.every(Boolean) && !frasi.noScheda, JSON.stringify(frasi));
      prova('le frasi già in italiano restano come sono', frasi.nostra === 'Non ho sentito parole', frasi.nostra);

      console.log('▶ Aiuto: il rilevatore dell\'hardware (due schede video, scheda che sbaglia)');
      const hw = await page.evaluate(async () => {
        const { HW } = window.__dpvTest;
        const sc = (v, potenze, prova = 'si', extra = {}) => ({ potenze, vendor: v, arch: '', descr: v, prova, f16: true, software: false, ms: 5, ...extra });
        const nvidiaAmd = [sc('AMD', ['low-power']), sc('NVIDIA', ['high-performance'])];
        const out = {
          migliore: HW.scegli(nvidiaAmd),
          guasta: HW.scegli([sc('AMD', ['low-power']), sc('NVIDIA', ['high-performance'], 'si', { guasta: true })]),
          provaNo: HW.scegli([sc('AMD', ['low-power']), sc('NVIDIA', ['high-performance'], 'no')]),
          nessuna: HW.scegli([sc('AMD', ['low-power'], 'no'), sc('NVIDIA', ['high-performance'], 'no')]),
          software: HW.scegli([sc('SwiftShader', [''], 'si', { software: true })]),
          vuoto: HW.scegli([]),
        };
        // il rilevatore vero (qui senza scheda vera: deve dare una risposta e non bloccarsi)
        const t0 = performance.now();
        const h = await HW.rilevaHardware(true);
        out.rileva = { ms: Math.round(performance.now() - t0), cpu: h.cpu > 0, schede: h.schede.length, scelta: h.scelta, gpuApi: h.gpuApi, righe: HW.raccontaHardware(h).length };
        // le prove riempiono la memoria come farebbe una scheda vera
        localStorage.setItem('dpv-hardware', JSON.stringify({ firma: 'x', quando: 0, cpu: 8, ram: 8, gpuApi: true, schede: nvidiaAmd, scelta: 1 }));
        out.msg1 = HW.messaggioScheda();
        HW.schedaGuasta();
        out.msg2 = HW.messaggioScheda();
        HW.schedaGuasta();
        out.msg3 = HW.messaggioScheda();
        localStorage.setItem('dpv-ai-scheda', 'no');
        out.spenta = HW.messaggioScheda();
        localStorage.removeItem('dpv-ai-scheda');
        localStorage.removeItem('dpv-hardware');
        return out;
      });
      prova('con NVIDIA e AMD (cavo sul processore) sceglie la scheda NVIDIA "alte prestazioni"; se sbaglia a metà lavoro tocca all\'altra; se sbaglia anche quella, al processore', hw.migliore === 1 && hw.guasta === 0 && hw.provaNo === 0 && hw.nessuna === -1 && hw.software === -1 && hw.vuoto === -1 && hw.msg1.scheda && hw.msg1.potenza === 'high-performance' && hw.msg2.scheda && hw.msg2.potenza === 'low-power' && !hw.msg3.scheda, JSON.stringify(hw));
      prova('la scheda spenta nelle impostazioni resta spenta; il rilevatore risponde subito anche senza scheda video', !hw.spenta.scheda && hw.rileva.ms < 12000 && hw.rileva.cpu && hw.rileva.righe >= 1, JSON.stringify(hw.rileva));
      prova('nessun errore nelle prove della ricerca, della guida e del Centro AI', errori.length === 0, errori.slice(0, 5).join(' | '));
    } finally {
      await contesto.close();
    }
  }

  // ——— 2 · le AI che non si fermano ———
  {
    const { page, contesto, errori } = await pagina(paginaDi);
    try {
      console.log('▶ AI: se il motore NVIDIA non parte, i sottotitoli passano a Whisper');
      await progetto(page);
      const ripiego = await page.evaluate(async () => {
        const { V, NM } = window.__dpvTest;
        const fasi = [];
        NM.impostaMotoreNemo({
          stato: async () => ({ os: 'windows', arch: 'x86_64', cartella: '', installato: false, backend: '', consigliato: 'cpu', nvidia: false, modelli: 0 }),
          installa: async () => { throw new Error('lo scarico non è riuscito (exit status: 22): serve internet'); },
          modello: async () => {}, trascrivi: async () => [], sintetizza: async () => new Map(),
        });
        V.impostaTrascrittore({ carica: async () => 'wasm', trascrivi: async () => [{ da: 0.1, a: 1.5, testo: 'Buongiorno a tutti' }] });
        try {
          const righe = await V.sottotitoliAI(window.__dpv.doc, { lingua: 'it', traduci: false, modello: 'onnx-community/whisper-base', motore: 'nemotron' }, (f) => fasi.push(f));
          return { righe: righe.map((r) => r.testo), passato: fasi.some((f) => /passo a Whisper/.test(f)), fasi: fasi.slice(0, 6) };
        } catch (e) { return { errore: e.message, fasi }; } finally { NM.impostaMotoreNemo(null); V.impostaTrascrittore(null); }
      });
      prova('motore NVIDIA rotto: le righe arrivano lo stesso (da Whisper) e la barra lo dice', ripiego.righe?.[0] === 'Buongiorno a tutti' && ripiego.passato, JSON.stringify(ripiego));
      // nel browser il motore NVIDIA non c'è proprio: stessa strada, e la barra dice che è solo nell'app
      const browser = await page.evaluate(async () => {
        const { V } = window.__dpvTest;
        const fasi = [];
        V.impostaTrascrittore({ carica: async () => 'wasm', trascrivi: async () => [{ da: 0.1, a: 1.5, testo: 'Buongiorno a tutti' }] });
        try {
          const righe = await V.sottotitoliAI(window.__dpv.doc, { lingua: 'it', traduci: false, modello: 'onnx-community/whisper-base', motore: 'nemotron' }, (f) => fasi.push(f));
          return { righe: righe.map((r) => r.testo), avvisa: fasi.some((f) => /solo nell'app: carico Whisper/.test(f)) };
        } catch (e) { return { errore: e.message, fasi }; } finally { V.impostaTrascrittore(null); }
      });
      prova('nel browser, chiedendo Nemotron: le righe arrivano da Whisper e la barra dice che il motore NVIDIA è solo nell\'app', browser.righe?.[0] === 'Buongiorno a tutti' && browser.avvisa, JSON.stringify(browser));

      console.log('▶ AI: i worker veri, con una libreria finta che non ha il tipo "q8"');
      const finta = (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: LIB });
      await page.context().route('**/ai/transformers.min.js', finta);
      await page.context().route('https://cdn.jsdelivr.net/npm/@huggingface/transformers@*/dist/transformers.min.js', finta);
      const whisper = await page.evaluate(async () => {
        const { V } = window.__dpvTest;
        V.impostaTrascrittore(null);
        try {
          const righe = await V.sottotitoliAI(window.__dpv.doc, { lingua: 'it', traduci: false, modello: 'onnx-community/whisper-tiny', motore: 'whisper' }, () => {});
          return { righe: righe.map((r) => r.testo).join(' ') };
        } catch (e) { return { errore: e.message }; }
      });
      prova('Whisper: il tipo q8 manca, il worker prova fp32 e scrive le righe', /Ciao a tutti/.test(whisper.righe ?? '') && /automatic-speech-recognition:q8/.test(whisper.righe ?? '') && /automatic-speech-recognition:fp32/.test(whisper.righe ?? ''), JSON.stringify(whisper));
      const trad = await page.evaluate(async () => {
        const { TD } = window.__dpvTest;
        TD.impostaTraduttore(null);
        try { return { testi: await TD.traduciTesti(['Buongiorno', '', 'Grazie'], 'it', 'en', () => {}) }; } catch (e) { return { errore: e.message }; }
      });
      prova('Traduzione: stessa cosa (q8 manca → fp32), le righe vuote restano vuote', trad.testi?.[0] === '[eng_Latn] Buongiorno' && trad.testi?.[1] === '' && trad.testi?.[2] === '[eng_Latn] Grazie', JSON.stringify(trad));
      await page.context().unroute('**/ai/transformers.min.js');
      await page.context().unroute('https://cdn.jsdelivr.net/npm/@huggingface/transformers@*/dist/transformers.min.js');

      // ——— lo sfondo AI su una scheda video che sbaglia (la "LayerNorm" non compilata): il worker vero deve ripiegare sul processore ———
      console.log('▶ AI: lo sfondo con una scheda video che sbaglia a metà lavoro (worker vero, libreria finta)');
      const LIB_SFONDO = `
export const env = { allowLocalModels: true, backends: { onnx: { wasm: {} } } };
self.__dev = [];
export class RawImage { constructor(d, w, h, c) { this.data = d; this.width = w; this.height = h; this.channels = c; } }
// come transformers.js vero: le inferenze passano da una catena di promesse; dopo un errore la catena resta rifiutata e rifiuta anche
// le richieste nuove con lo stesso errore (per questo il worker dopo un errore della scheda si butta)
let catena = Promise.resolve();
export async function pipeline(task, repo, opz) {
  self.__dev.push(opz.device);
  return (img) => { const run = async () => lavora(img, opz); return (catena = catena.then(run)); };
}
async function lavora(img, opz) {
  {
    if (opz.device === 'webgpu') throw new Error('failed to call OrtRun(). ERROR_CODE: 1, ERROR_MESSAGE: webgpu buffer_manager.cc:562 Create FAIL : Failed to create a WebGPU compute pipeline: [Invalid ShaderModule "LayerNorm"] is invalid due to a previous error. - While validating compute stage ([Invalid ShaderModule "LayerNorm"], entryPoint: "main").');
    const n = img.width * img.height, d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { const x = i % img.width, y = Math.floor(i / img.width); d[i * 4 + 3] = x > img.width / 4 && x < img.width * 3 / 4 && y > img.height / 4 && y < img.height * 3 / 4 ? 255 : 0; }
    return { data: d, width: img.width, height: img.height, channels: 4 };
  }
}
`;
      const fintaSfondo = (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: LIB_SFONDO });
      await page.context().route('**/ai/transformers.min.js', fintaSfondo);
      await page.context().route('https://cdn.jsdelivr.net/npm/@huggingface/transformers@*/dist/transformers.min.js', fintaSfondo);
      const sfondo = await page.evaluate(async () => {
        const { P, importaFile, ripresaDiProva, RT, HW } = window.__dpvTest;
        const p = P.newProject({ w: 640, h: 360, rate: { num: 25, den: 1 }, drop: false });
        window.__dpv.load(p);
        const b = await ripresaDiProva(2, 25);
        const [m] = await importaFile([{ name: 'Prova.webm', file: new File([await b.arrayBuffer()], 'Prova.webm', { type: 'video/webm' }) }], { chiediFormato: false });
        let c;
        window.__dpv.edit('clip', (pp) => { const v = pp.tracks.find((t) => t.kind === 'video').id; c = P.newClip('media', v, 0, 50, { media: m.id, name: 'Prova' }); c.ritaglio = { modo: 'soggetto', modello: 'ben2', bordo: 0, morbido: 0.3, qualita: 0 }; pp.clips.push(c); });
        HW.impostaSchedaFinta(true);
        const fasi = [];
        try {
          const r = await RT.provaRitaglio(window.__dpv.doc, window.__dpv.doc.clips[0], 0.5, (f) => fasi.push(f));
          const px = r?.mask ? Array.from(r.mask).filter((v) => v > 127).length : 0;
          return { ok: !!r, pieni: px, tot: r?.mask?.length ?? 0, fasi: fasi.slice(-4) };
        } catch (e) { return { errore: e.message, fasi }; } finally { HW.impostaSchedaFinta(false); }
      });
      prova('sfondo AI: la scheda video sbaglia ("Invalid ShaderModule LayerNorm"), il worker si butta, riparte sul processore (anche se la libreria resta avvelenata) e la maschera arriva lo stesso', sfondo.ok && sfondo.pieni > 0 && sfondo.pieni < sfondo.tot, JSON.stringify(sfondo));
      await page.context().unroute('**/ai/transformers.min.js');
      await page.context().unroute('https://cdn.jsdelivr.net/npm/@huggingface/transformers@*/dist/transformers.min.js');
      prova('nessun errore nelle prove delle AI', errori.length === 0, errori.slice(0, 5).join(' | '));
    } finally {
      await contesto.close();
    }
  }
}
