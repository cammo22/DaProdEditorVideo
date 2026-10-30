// Le prove della 1.1.6: contenitore (scelta multipla, bordo, aggancio), Montage (anteprima dei video, come adattare),
// voce e lingue (traduzione, cinese, una clip per frase), file a velocità variabile e pagina iniziale.
import path from 'node:path';
import { conConfermeAI } from './aiuti.mjs';

/** una pagina pulita (contesto nuovo): le prove di prima hanno riempito il progetto e aperto sezioni */
async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1200);
  return { page, contesto, errori };
}

const immagini = (page, n) => page.evaluate(async (n) => {
  const { importaFile } = window.__dpvTest;
  const ids = [];
  for (let i = 0; i < n; i++) {
    const w = i === 3 ? 600 : 800, h = i === 3 ? 800 : 600;
    const c = new OffscreenCanvas(w, h); const x = c.getContext('2d');
    x.fillStyle = `hsl(${i * 70},50%,22%)`; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e33'; x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) * 0.28, 0, 7); x.fill();
    const nome = `Foto ${String.fromCharCode(65 + i)}.png`;
    const [m] = await importaFile([{ name: nome, file: new File([await c.convertToBlob({ type: 'image/png' })], nome, { type: 'image/png' }) }], { chiediFormato: false });
    ids.push(m.id);
  }
  return ids;
}, n);

export async function proveSeguito({ page: paginaDi, prova, OUT }) {
  const { page, contesto, errori } = await pagina(paginaDi);

  // ———————————————————————————————————————————————————————————
  console.log('▶ Contenitore: scelta multipla, bordo e aggancio');
  const ids = await immagini(page, 4);
  await page.waitForTimeout(500);
  const carta = (id) => `.carta[data-id="${id}"]`;
  const quante = () => page.locator('.carta.scelta').count();
  await page.click(carta(ids[0]), { modifiers: ['Control'] });
  await page.click(carta(ids[1]), { modifiers: ['Control'] });
  prova('Ctrl+clic sceglie più file nel contenitore', (await quante()) === 2);
  await page.click(carta(ids[0]));
  await page.click(carta(ids[2]), { modifiers: ['Shift'] });
  prova('Maiusc+clic sceglie un tratto (tre file), e un clic semplice ne tiene uno solo', (await quante()) === 3);
  await page.click(carta(ids[1]), { modifiers: ['Control'] });
  prova('Ctrl+clic su uno scelto lo toglie', (await quante()) === 2);
  await page.click(carta(ids[1]), { modifiers: ['Control'] });

  // si trascinano tutti e tre sulla timeline, sulla traccia V2, a partire dal fotogramma 100
  const punto = (f, riga, frazione = 0.5) => page.evaluate(([f, riga, frazione]) => {
    const tl = window.__dpvTest.ui().tl;
    const r = tl.cv.getBoundingClientRect();
    const righe = tl.righe(window.__dpv.doc);
    const v = righe.filter((x) => x.t.kind === 'video');
    const rr = v[riga];
    return { x: r.left + tl.fX(f), y: r.top + rr.y + rr.h * frazione, id: rr.t.id };
  }, [f, riga, frazione]);
  const trascina = async (daId, a) => {
    const b = await page.locator(carta(daId)).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 20, { steps: 4 });
    await page.mouse.move(a.x, a.y, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  const dest = await punto(100, 0);
  await trascina(ids[0], dest);
  const clips = () => page.evaluate(() => window.__dpv.doc.clips.filter((c) => c.kind === 'media').sort((a, b) => a.start - b.start).map((c) => ({ id: c.id, media: c.media, track: c.track, start: c.start, len: c.len })));
  let cl = await clips();
  prova('trascinando un file scelto si portano dietro tutti i file scelti: tre clip, una dopo l\'altra', cl.length === 3 && cl[1].start === cl[0].start + cl[0].len && cl[2].start === cl[1].start + cl[1].len && cl.map((c) => c.media).join() === ids.slice(0, 3).join(), JSON.stringify(cl));
  prova('la prima parte dove le hai lasciate (agganciata a 14 px al massimo)', Math.abs(cl[0].start - 100) <= 3 || cl[0].start === 0, String(cl[0].start));
  await page.waitForTimeout(300);
  const stato = await page.evaluate((ids) => ids.map((id) => document.querySelector(`.carta[data-id="${id}"]`)?.classList.contains('in-timeline')), ids);
  prova('i file che sono in timeline hanno il bordo colorato, gli altri no', stato.join() === 'true,true,true,false', stato.join());

  // un file solo, lasciato sulla seconda metà dell'ultima clip: parte subito dopo di lei (non in un altro posto)
  await page.evaluate(() => window.__dpvTest.ui().tl.adattaTutto());
  await page.waitForTimeout(300);
  await page.click(carta(ids[3]));
  const fineUltima = cl[2].start + cl[2].len;
  const sulla = await punto(cl[2].start + Math.round(cl[2].len * 0.7), 0);
  await trascina(ids[3], sulla);
  cl = await clips();
  const nuova = cl.find((c) => c.media === ids[3]);
  prova('un file lasciato sulla seconda metà di una clip si aggancia subito dopo di lei, sulla stessa traccia', !!nuova && nuova.start === fineUltima && nuova.track === cl[2].track, JSON.stringify([nuova, fineUltima]));
  // lasciato vicino (a pochi pixel) alla fine di una clip, in uno spazio libero: si aggancia
  await page.screenshot({ path: path.join(OUT, 'contenitore-scelta.png') });

  // ———————————————————————————————————————————————————————————
  console.log('▶ Montage: anteprima dei video e come adattare');
  const video = await page.evaluate(async () => {
    const { importaFile, ripresaDiProva } = window.__dpvTest;
    const f = await ripresaDiProva(5, 25);
    const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
    return m.id;
  });
  await page.keyboard.press('F8');
  await page.waitForTimeout(900);
  const th = page.locator(`.mt-thumb[data-id="${video}"]`);
  const caselle = await th.boundingBox();
  await page.mouse.move(caselle.x + caselle.width * 0.2, caselle.y + caselle.height / 2);
  await page.mouse.move(caselle.x + caselle.width * 0.6, caselle.y + caselle.height / 2, { steps: 5 });
  await page.waitForTimeout(500);
  const scorre = await page.evaluate((id) => { const e = document.querySelector(`.mt-thumb[data-id="${id}"]`); return { classe: e.classList.contains('scorre'), tempo: e.querySelector('.mt-tempo')?.textContent, lente: !!e.querySelector('.mt-guarda') }; }, video);
  prova('un video nella pagina Montage scorre al passaggio del mouse (con il tempo) e ha la lente', scorre.classe && /\//.test(scorre.tempo ?? '') && scorre.lente, JSON.stringify(scorre));
  // (il play parte e il disegno è lento: il clic si dà dal programma, senza aspettare)
  await page.evaluate((id) => document.querySelector(`.mt-thumb[data-id="${id}"] .mt-guarda`).click(), video);
  await page.waitForTimeout(1500);
  const mon = await page.evaluate(() => ({ player: window.__motore.attivo, play: window.__motore.playing }));
  prova('la lente apre il video nel monitor in alto e lo fa partire', mon.player === 'player' && mon.play, JSON.stringify(mon));
  await page.evaluate(() => window.__motore.stop());
  const alt = await page.evaluate(() => { const r = document.querySelector('.monitor').getBoundingClientRect(); return { h: Math.round(r.height), vh: window.innerHeight }; });
  prova('il monitor della pagina Montage è piccolo (meno di un terzo dello schermo)', alt.h < alt.vh * 0.33, JSON.stringify(alt));
  const adatta = await page.evaluate((ids) => {
    const { MT } = window.__dpvTest;
    const p = { w: 1920, h: 1080 }, ver = { width: 600, height: 800, rotation: 0 };
    const a = MT.inquadra(p, ver, false), b = MT.inquadra(p, ver, true);
    // una foto 600×800 in 1920×1080: intera = scheda piccola; riempi = a tutto quadro (cover), mai stirata
    const kc = Math.max(1920 / 600, 1080 / 800), kf = Math.min(1920 / 600, 1080 / 800);
    return { a, b, atteso: kc / kf };
  }, ids);
  prova('"Intere con lo sfondo" lascia la foto verticale come scheda; "Riempi il quadro" la mette a tutto quadro (taglia, non stira)', adatta.a.scheda && !adatta.b.scheda && Math.abs(adatta.b.scala - adatta.atteso) < 1e-6, JSON.stringify(adatta));
  await page.locator('.mt-colcome .chip', { hasText: 'Riempi il quadro' }).click();
  prova('la scelta si ricorda', (await page.evaluate(() => JSON.parse(localStorage.getItem('dpv-montage')).adatta)) === 'riempi');
  await page.keyboard.press('F8');
  await page.waitForTimeout(300);

  // ———————————————————————————————————————————————————————————
  console.log('▶ Voce e lingue: traduzione, cinese, una clip per frase');
  const tr = await page.evaluate(async () => {
    const { TD } = window.__dpvTest;
    const chiamate = [];
    TD.impostaTraduttore({
      carica: async (stato) => { stato('scarico', 0.5); stato('fatto', 1); chiamate.push('carica'); },
      traduci: async (testi, da, a) => { chiamate.push(`${da}>${a}:${testi.length}`); return testi.map((t) => `[${a}] ${t}`); },
    });
    const prog = [];
    const out = await TD.traduciTesti(['Buongiorno', '', 'Come stai?'], 'it', 'en', (f, k) => prog.push(k));
    const stessa = await TD.traduciTesti(['ciao'], 'it', 'it', () => {});
    const nap = TD.codiceLingua('nap');
    let errore = '';
    try { await TD.traduciTesti(['x'], 'it', 'xx', () => {}); } catch (e) { errore = e.message; }
    TD.impostaTraduttore(null);
    return { out, stessa, chiamate, nap, errore, cresce: prog.every((x, i) => !i || x >= prog[i - 1] - 1e-9), ultimo: prog[prog.length - 1], zh: TD.codiceLingua('zh') };
  });
  prova('la traduzione lascia vuote le righe vuote, non traduce se la lingua è la stessa e il napoletano si traduce come l\'italiano', tr.out.join('|') === '[en] Buongiorno||[en] Come stai?' && tr.stessa[0] === 'ciao' && tr.nap === 'it' && /xx|coppia/.test(tr.errore) && tr.chiamate.includes('it>en:2'), JSON.stringify(tr));
  prova('la barra della traduzione non torna indietro e arriva a 100%; il cinese è fra le lingue', tr.cresce && tr.ultimo === 1 && tr.zh === 'zh', JSON.stringify([tr.cresce, tr.ultimo, tr.zh]));

  // la voce in un'altra lingua: i sottotitoli italiani si traducono (solo per la voce) prima di essere letti
  const vo = await page.evaluate(async () => {
    const { NM, TD, DP, PR } = window.__dpvTest;
    const visti = [];
    TD.impostaTraduttore({ carica: async () => {}, traduci: async (testi, da, a) => testi.map((t) => `${a}:${t}`) });
    NM.impostaMotoreNemo({
      stato: async () => ({ os: 'linux', arch: 'x86_64', cartella: '/x', installato: true, backend: 'cpu', consigliato: 'cpu', nvidia: false, modelli: 900 * 1048576 }),
      installa: async () => {}, modello: async () => {}, trascrivi: async () => [],
      sintetizza: async (voci, o) => {
        visti.push({ lingua: o.lingua, testi: voci.map((v) => v.testo) });
        const m = new Map();
        for (const v of voci) { const a = new Float32Array(24000); for (let k = 0; k < a.length; k++) a[k] = Math.sin(k / 20) * 0.3; m.set(v.id, { audio: a, sr: 24000 }); }
        return m;
      },
    });
    window.__dpv.edit('sottotitoli', (p) => { p.sottotitoli = { righe: [{ id: 'r1', da: 0, a: 50, testo: 'Buonasera Napoli.' }, { id: 'r2', da: 75, a: 140, testo: 'Questa è la voce.' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' }; });
    const p = structuredClone(window.__dpv.doc);
    const stessa = await DP.doppia(p, { voce: 0, lingua: 'it', silenzia: false }, () => {});
    const inglese = await DP.doppia(p, { voce: 0, lingua: 'en', silenzia: false }, () => {});
    const cinese = await DP.doppia(p, { voce: 1, lingua: 'zh', silenzia: false }, () => {});
    const senza = await DP.doppia(p, { voce: 0, lingua: 'en', silenzia: false, traduci: false }, () => {});
    return { visti, tradotti: [stessa.tradotto, inglese.tradotto, cinese.tradotto, senza.tradotto], posti: inglese.posti.map((x) => [x.id.slice(0, 1), +x.da.toFixed(2), +x.len.toFixed(2), x.righe.join()]), codiceZh: NM.codiceLingua('zh'), zhVoce: NM.LINGUE_VOCE.includes('zh') };
  });
  prova('stessa lingua: i sottotitoli si leggono così come sono (niente traduzione)', vo.visti[0].lingua === 'it' && vo.visti[0].testi.join('|') === 'Buonasera Napoli.|Questa è la voce.' && vo.tradotti[0] === false, JSON.stringify(vo.visti[0]));
  prova('voce inglese su sottotitoli italiani: prima si traducono, poi si leggono in inglese', vo.visti[1].lingua === 'en' && vo.visti[1].testi.every((t) => t.startsWith('en:')) && vo.tradotti[1] === true, JSON.stringify(vo.visti[1]));
  prova('la voce parla anche cinese (il motore la riceve come zh-CN) con i testi tradotti', vo.visti[2].lingua === 'zh' && vo.visti[2].testi.every((t) => t.startsWith('zh:')) && vo.tradotti[2] && vo.codiceZh === 'zh-CN' && vo.zhVoce, JSON.stringify(vo.visti[2]));
  prova('se si spegne la traduzione la voce legge il testo com\'è', vo.visti[3].testi.every((t) => !/^en:/.test(t)) && vo.tradotti[3] === false, JSON.stringify(vo.visti[3]));
  prova('ogni frase ha il suo posto (dove comincia, quanto dura) e le righe che contiene', vo.posti.length >= 1 && vo.posti[0][1] === 0 && vo.posti.every((x) => x[2] > 0.3 && x[3]), JSON.stringify(vo.posti));

  // la pagina Finale: due passi, la voce in cinese fra le lingue, e la riga dei sottotitoli sceglie la sua voce
  await page.click('.pagina-btn[data-p=finale]');
  await page.waitForTimeout(500);
  await page.click('.fin-voce[data-s=lingue]');
  await page.waitForTimeout(400);
  const fin = await page.evaluate(() => ({
    passi: [...document.querySelectorAll('.fin-pagina[data-s=lingue] .fin-sezione h4')].map((e) => e.textContent.trim()),
    cinese: [...document.querySelectorAll('.fin-pagina[data-s=lingue] .chip')].some((c) => c.textContent === 'Cinese'),
    traduci: [...document.querySelectorAll('.fin-pagina[data-s=lingue] .ai-vai')].map((e) => e.textContent),
  }));
  prova('Voce e lingue: i due passi, "Cinese" fra le lingue della voce e i due tasti', fin.passi.some((t) => t.includes('1 · Sottotitoli')) && fin.passi.some((t) => t.includes('2 · Voce')) && fin.cinese && fin.traduci.length === 2, JSON.stringify(fin));
  await page.screenshot({ path: path.join(OUT, 'finale-voce-lingue.png') });
  // traduzione dei sottotitoli dal pannello (traduttore finto), si annulla con Ctrl+Z
  await page.evaluate(() => window.__dpvTest.TD.impostaTraduttore({ carica: async () => {}, traduci: async (testi, da, a) => testi.map((t) => `(${a}) ${t}`) }));
  await page.locator('.fin-pagina[data-s=lingue] select').nth(1).selectOption('en');
  await page.waitForTimeout(250);
  await conConfermeAI(page, async () => {
    await page.locator('.fin-pagina[data-s=lingue] .ai-vai', { hasText: 'Traduci i sottotitoli' }).click();
    await page.waitForFunction(() => window.__dpv.doc.sottotitoli.lingua === 'en', null, { timeout: 15000 });
  });
  const sott = await page.evaluate(() => ({ testi: window.__dpv.doc.sottotitoli.righe.map((r) => r.testo), tempi: window.__dpv.doc.sottotitoli.righe.map((r) => [r.da, r.a]) }));
  prova('"Traduci i sottotitoli": cambia il testo e la lingua, i tempi restano', sott.testi.every((t) => t.startsWith('(en) ')) && sott.tempi.join(';') === '0,50;75,140', JSON.stringify(sott));
  await page.waitForFunction(() => !document.querySelector('.velo:not(.via)'), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  prova('Ctrl+Z rimette i sottotitoli com\'erano', await page.evaluate(() => window.__dpv.doc.sottotitoli.lingua === 'it' && window.__dpv.doc.sottotitoli.righe[0].testo === 'Buonasera Napoli.'));

  // una riga con la sua voce: un clic sulla riga sceglie la clip audio
  await page.evaluate(async () => {
    const { PR, DP } = window.__dpvTest;
    const p = structuredClone(window.__dpv.doc);
    const r = await DP.doppia(p, { voce: 0, lingua: 'it', silenzia: false }, () => {});
    // l'audio composto diventa un file, e ogni frase una clip
    const wav = (() => { const n = r.audio.length; const b = new ArrayBuffer(44 + n * 2); const d = new DataView(b); const s = (o, t) => [...t].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0))); s(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); s(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, r.sr, true); d.setUint32(28, r.sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); s(36, 'data'); d.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, r.audio[i])) * 32767, true); return b; })();
    const [m] = await window.__dpvTest.importaFile([{ name: 'voce-prova.wav', file: new File([wav], 'voce-prova.wav', { type: 'audio/wav' }) }], { chiediFormato: false });
    window.__dpv.edit('Voce AI', (pp) => window.__dpvTest.DP.posaVoce(pp, m.id, r.audio.length / r.sr, false, r.posti));
    window.__dpv.select([]);
  });
  await page.click('.pagina-btn[data-p=montaggio]');
  await page.waitForTimeout(800);
  const rigaClic = await page.evaluate(() => {
    const tl = window.__dpvTest.ui().tl;
    tl.righe(window.__dpv.doc);
    const r = tl.cv.getBoundingClientRect();
    const rs = tl.rigaSott;
    const riga = window.__dpv.doc.sottotitoli.righe[0];
    return { x: r.left + tl.fX((riga.da + riga.a) / 2), y: r.top + rs.y + rs.h / 2, voce: riga.voce };
  });
  await page.mouse.click(rigaClic.x, rigaClic.y);
  await page.waitForTimeout(500);
  const scelta = await page.evaluate(() => [...window.__dpv.sel]);
  prova('un clic su una riga dei sottotitoli sceglie la sua clip di voce (si gestisce come ogni altra clip)', scelta.length === 1 && scelta[0] === rigaClic.voce, JSON.stringify([scelta, rigaClic.voce]));
  await page.evaluate(() => window.__dpvTest.NM.impostaMotoreNemo(null));
  await page.evaluate(() => window.__dpvTest.TD.impostaTraduttore(null));

  // ———————————————————————————————————————————————————————————
  console.log('▶ File a velocità variabile: si convertono con «Controlla velocità file» (dalla 1.5.8 mai da soli)');
  const nz = await page.evaluate(async () => {
    const { NZ, ripresaVfrDiProva, ripresaDiProva, branoVbrDiProva, importaFile, LB } = window.__dpvTest;
    const vfr = await ripresaVfrDiProva(4);
    const cfr = await ripresaDiProva(3, 25);
    const vbr = await branoVbrDiProva(8);
    const dVfr = await NZ.esamina({ name: vfr.name, file: vfr });
    const dCfr = await NZ.esamina({ name: cfr.name, file: cfr });
    const dVbr = await NZ.esamina({ name: vbr.name, file: vbr });
    // com'è, senza convertire (per confrontare la durata): dalla 1.5.8 l'import non converte mai
    const [orig] = await importaFile([{ name: vfr.name, file: vfr }], { chiediFormato: false });
    const a = await importaFile([{ name: vfr.name, file: vfr }], { chiediFormato: false });
    const b = await importaFile([{ name: vbr.name, file: vbr }], { chiediFormato: false });
    const c = await importaFile([{ name: cfr.name, file: cfr }], { chiediFormato: false });
    // il controllo a mano, con la conversione che parte subito se serve
    for (const x of [a[0], b[0], c[0]]) LB.proponiPreparazione(x.id, 'velocita', { avvia: true, converti: true });
    const AT = window.__dpvTest.AT;
    for (let i = 0; i < 600; i++) {
      if (!AT.attivitaInCorso().some((r) => /velocità/.test(r.titolo))) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const doc = (x) => window.__dpv.doc.media.find((m) => m.id === x.id);
    a[0] = doc(a[0]); b[0] = doc(b[0]); c[0] = doc(c[0]);
    // il video importato è davvero a frame rate costante?
    const rt = window.__dpvTest.mediaRT(a[0].id);
    const fr = await rt.v.computeFrameRateMetrics({ targetPacketCount: 300 });
    return {
      dVfr, dCfr, dVbr, vfrNome: [vfr.name, a[0]?.name, a[0]?.container], costante: fr.frameRateIsConstant, spread: fr.maxFrameRate / fr.minFrameRate, fps: a[0]?.fps,
      durata: [a[0]?.duration, orig?.duration], brano: [b[0]?.name, b[0]?.acodec, b[0]?.container, b[0]?.duration], normale: [c[0]?.name, c[0]?.fps],
    };
  });
  prova('si riconosce un video a frame rate variabile; un video normale e un brano Opus (già con i tempi giusti) vanno bene come sono', nz.dVfr?.vfr === true && nz.dVbr === null && nz.dCfr === null, JSON.stringify([nz.dVfr, nz.dVbr, nz.dCfr]));
  prova('il video variabile entra già rifatto a frame rate costante (stessa durata) e con un frame rate pulito', nz.costante === true && Math.abs(nz.durata[0] - nz.durata[1]) < 0.5 && nz.fps > 20 && nz.fps < 31, JSON.stringify(nz));
  prova('il brano Opus NON si rifà (stesso nome, stesso contenitore, stessa durata): si converte solo quello che serve', nz.brano[0] === 'Brano VBR 8s.webm' && /webm/i.test(nz.brano[2] ?? '') && Math.abs(nz.brano[3] - 8) < 0.5, JSON.stringify(nz.brano));
  const regole = await page.evaluate(() => {
    const { NZ } = window.__dpvTest;
    const griglia = { underlyingFrameRate: 30, frameRateIsConstant: false, probedPacketCount: 300, maxFrameRate: 30, minFrameRate: 10 };
    const vfr = { underlyingFrameRate: null, frameRateIsConstant: false, probedPacketCount: 300, maxFrameRate: 41, minFrameRate: 9 };
    const cbr = Array.from({ length: 200 }, (_, i) => 417 + (i % 3 === 0 ? 1 : 0));
    const vbr = Array.from({ length: 200 }, (_, i) => [210, 420, 640, 300, 900][i % 5]);
    // misurata sul PC di Cammo: webcam del LIVE in WebM (tempi al millisecondo, qualche fotogramma perso) = 30 fps veri
    const webcam = { underlyingFrameRate: null, frameRateIsConstant: false, probedPacketCount: 400, maxFrameRate: 33.333, minFrameRate: 15.873, averageFrameRate: 29.906 };
    return [NZ.vfrVero(griglia), NZ.vfrVero(vfr), NZ.mp3Variabile(cbr), NZ.mp3Variabile(vbr), NZ.vfrVero(webcam)];
  });
  prova('regole: fotogrammi persi su una griglia = non si rifà; VFR vero sì; MP3 a bitrate costante no; MP3 variabile sì; webcam WebM a 30 fps coi tempi al millisecondo no', JSON.stringify(regole) === '[false,true,false,true,false]', JSON.stringify(regole));
  prova('un video normale non si tocca (nome e frame rate com\'erano)', nz.normale[0] === 'Lunga 3s.mp4' || /^Lunga 3s\./.test(nz.normale[0]), JSON.stringify(nz.normale));

  // ———————————————————————————————————————————————————————————
  console.log('▶ Pagina iniziale');
  const h0 = await page.evaluate(() => document.querySelector('.home')?.style.display);
  prova('nelle prove automatiche la pagina iniziale non si apre da sola', h0 === 'none');
  await page.evaluate(() => { const { PR } = window.__dpvTest; window.__dpv.doc.name = 'Il mio viaggio'; PR.registraRecente(window.__dpv.doc, undefined, JSON.stringify(window.__dpv.doc)); document.dispatchEvent(new CustomEvent('dpv:home')); });
  await page.waitForTimeout(500);
  const home = await page.evaluate(() => ({
    visibile: getComputedStyle(document.querySelector('.home')).display !== 'none',
    carte: [...document.querySelectorAll('.home-carta')].map((c) => c.querySelector('b').textContent),
    nuovo: !!document.querySelector('.home .btn.primario.home-grande'), apri: document.querySelectorAll('.home .home-grande').length, montage: !!document.querySelector('.home-montage'),
    continua: !!document.querySelector('.home-continua'),
  }));
  prova('la pagina iniziale ha Nuovo, Apri, DaProdMontage, "Continua" e il progetto salvato fra i recenti', home.visibile && home.carte.includes('Il mio viaggio') && home.nuovo && home.apri === 3 && home.montage && home.continua, JSON.stringify(home));
  await page.screenshot({ path: path.join(OUT, 'pagina-iniziale.png') });
  // si riapre un recente: torna quel progetto
  await page.evaluate(() => { window.__dpv.dirty = false; return window.__dpvTest.PR.nuovo(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
  await page.waitForTimeout(300);
  await page.click('.home-carta:has(b:has-text("Il mio viaggio"))');
  await page.waitForTimeout(1200);
  const riaperto = await page.evaluate(() => ({ nome: window.__dpv.doc.name, clip: window.__dpv.doc.clips.length, home: getComputedStyle(document.querySelector('.home')).display }));
  prova('un clic su un progetto recente lo riapre (con le sue clip) e chiude la pagina iniziale', riaperto.nome === 'Il mio viaggio' && riaperto.clip > 3 && riaperto.home === 'none', JSON.stringify(riaperto));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  prova('Esc chiude la pagina iniziale', (await page.evaluate(() => getComputedStyle(document.querySelector('.home')).display)) === 'none');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
  await page.click('.home-carta .home-togli');
  await page.waitForTimeout(300);
  prova('la X toglie un progetto dall\'elenco', (await page.evaluate(() => document.querySelectorAll('.home-carta').length)) === 0);
  await page.keyboard.press('Escape');

  prova('nessun errore nella pagina delle novità', errori.length === 0, errori.slice(0, 4).join(' | '));
  await contesto.close();
}
