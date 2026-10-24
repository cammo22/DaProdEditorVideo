// Le prove della 1.5.3 ("versione quasi finale"): i difetti visti sul PC di Cammo.
//  · Centro attività: chiuso e riaperto il pannello, le righe finite non restano lì ferme sotto "non sta facendo niente";
//  · timeline: dopo un taglio la clip scelta si vede tutta (il bordo giallo non è più coperto dalla vicina attaccata);
//  · il progetto .dap: Salva mette dentro TUTTO (montaggio, file, copie leggere) e lo si riapre identico, anche "su un altro
//    computer" (qui: dopo aver buttato i file e le copie leggere del browser).
// Da sola: `node test/prove-nuove.mjs dap`.

/** una pagina pulita (contesto nuovo): le prove di prima hanno riempito il progetto */
async function pagina(paginaDi, viewport = { width: 1600, height: 950 }) {
  const contesto = await paginaDi.context().browser().newContext({ viewport });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

export async function proveDap({ page: paginaDi, prova, OUT }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Centro attività: niente righe ferme dopo aver chiuso e riaperto il pannello');
    await page.click('.stato .att');
    await page.waitForSelector('.att-pannello');
    // un lavoro parte col pannello aperto, il pannello si chiude, il lavoro finisce, il pannello si riapre
    const lav = await page.evaluate(() => { const { AT } = window.__dpvTest; const l = AT.nuova({ titolo: 'Copie leggere per il monitor', categoria: 'proxy' }); l.imposta(0.5, 'prova.webm'); window.__lavProva = l; AT.avvisaOra(); return document.querySelectorAll('.att-pannello .att-riga').length; });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__lavProva.fine(); window.__dpvTest.AT.avvisaOra(); });
    await page.waitForTimeout(300);
    await page.click('.stato .att');
    await page.waitForSelector('.att-pannello');
    await page.waitForTimeout(300);
    const pannello = await page.evaluate(() => ({
      righe: document.querySelectorAll('.att-pannello .att-riga[data-stato="lavoro"], .att-pannello .att-riga[data-stato="coda"]').length,
      riepilogo: document.querySelector('.stato .att')?.textContent ?? '',
      finite: [...document.querySelectorAll('.att-pannello .att-riga[data-stato="finita"]')].map((x) => ({ titolo: x.querySelector('b')?.textContent, barraNascosta: x.querySelector('progress')?.hidden })),
    }));
    prova('riaperto il pannello: nessuna riga in corso rimasta ferma, riepilogo a riposo e lavoro nello storico senza barra', lav === 1 && pannello.righe === 0 && /Nessuna attività/.test(pannello.riepilogo) && pannello.finite.some((t) => /Copie leggere/.test(t.titolo) && t.barraNascosta), JSON.stringify({ lav, pannello }));
    await page.keyboard.press('Escape');

    // ———————————————————————————————————————————————————————————
    console.log('▶ Timeline: dopo il taglio la clip scelta si vede tutta');
    const taglio = await page.evaluate(async () => {
      const { importaFile, ripresaDiProva } = window.__dpvTest;
      const f = await ripresaDiProva(4, 25);
      const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
      const d0 = window.__dpv.doc;
      const tv = d0.tracks.find((t) => t.kind === 'video');
      window.__dpv.edit('Metti', (p) => { const { newClip } = window.__dpvTest.P; p.clips.push(newClip('media', tv.id, 0, 100, { media: m.id, name: 'Ripresa' })); });
      window.__dpvTest.ui().tl.adattaTutto();
      window.__motore.vaiA(50);
      return { media: m.id };
    });
    await page.waitForTimeout(400);
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const pezzi = await page.evaluate(() => window.__dpv.doc.clips.filter((c) => c.name === 'Ripresa' || c.name.startsWith('Ripresa')).map((c) => ({ id: c.id, start: c.start, len: c.len, track: c.track })).sort((a, b) => a.start - b.start));
    // si sceglie il pezzo di SINISTRA: la vicina (destra) è disegnata dopo e prima copriva il suo bordo destro
    // il cursore (linea rossa) sta proprio sul taglio: lo si porta via, se no copre i pixel da guardare
    await page.evaluate((id) => { window.__dpv.select([id]); window.__motore.vaiA(85); }, pezzi[0].id);
    await page.waitForFunction(() => { const tl = window.__dpvTest.ui().tl; return !tl.sporco; }, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const bordo = await page.evaluate((pz) => {
      const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc;
      tl.righe(d);
      const r = tl.riga(pz.track);
      const g = tl.geo(r.y, r.h);
      const x = tl.fX(pz.start + pz.len);
      const ctx = tl.cv.getContext('2d');
      const k = tl.dpr;
      // le colonne appena a sinistra del taglio, a metà altezza della clip: il bordo giallo della scelta
      const giallo = (px) => { const [rr, gg, bb] = ctx.getImageData(Math.round(px * k), Math.round((g.top + g.alt / 2) * k), 1, 1).data; return rr > 200 && gg > 170 && bb < 140; };
      return { colonne: [-4, -3, -2, -1, 0].map((dx) => giallo(x + dx)), velatura: (() => { const [rr, gg, bb] = ctx.getImageData(Math.round((x - 30) * k), Math.round((g.top + g.testa + 3) * k), 1, 1).data; return [rr, gg, bb]; })(), n: pz };
    }, pezzi[0]);
    prova('dopo il taglio il pezzo scelto ha il bordo giallo anche sul lato attaccato all\'altro pezzo', pezzi.length === 2 && bordo.colonne.some(Boolean), JSON.stringify({ pezzi, bordo }));
    await page.screenshot({ path: `${OUT}/taglio-scelta.png`, clip: await page.locator('.tl-tela').boundingBox() });

    // ———————————————————————————————————————————————————————————
    console.log('▶ Progetto .dap: dentro c\'è TUTTO e si riapre identico');
    const dap = await page.evaluate(async () => {
      const { PK, PX, PR, mediaRT, importaFile, branoVbrDiProva } = window.__dpvTest;
      // un audio in più, e una copia leggera finta per la ripresa (nel disco privato, col nome giusto)
      const b = await branoVbrDiProva(3);
      await importaFile([{ name: b.name, file: b }], { chiediFormato: false });
      const d = window.__dpv.doc;
      d.name = 'Prova dap';
      const video = d.media.find((m) => m.type === 'video');
      const radice = await navigator.storage.getDirectory();
      const dir = await radice.getDirectoryHandle('proxy-1', { create: true });
      const nomeP = PX.nomeProxy(video);
      const finto = new Uint8Array(150000).map((_, i) => (i * 7) & 255);
      { const ws = await (await dir.getFileHandle(nomeP, { create: true })).createWritable(); await ws.write(finto); await ws.close(); }
      const proxy = await PX.proxyDelProgetto(d.media);
      const piano = await PK.pianoDap(null, proxy);
      const blob = await PK.costruisciDap(piano);
      // i byte veri (il Blob punta ai file: la copia leggera sta per essere cancellata)
      const file = new File([await blob.arrayBuffer()], 'Prova dap.dap');
      const voci = await PK.indicePacchetto({ file });
      const nomi = [...voci.keys()];
      const pesoMedia = d.media.reduce((s, m) => s + (mediaRT(m.id)?.file?.size ?? 0), 0);
      const prima = { clip: d.clips.length, media: d.media.map((m) => m.name).sort(), tracce: d.tracks.length, nome: d.name };
      // "un altro computer": via i file tenuti dal browser e la copia leggera
      await radice.removeEntry('proxy-1', { recursive: true });
      window.__dpv.dirty = false;
      await PR.nuovo();
      await PR.apriFile({ file });
      for (let i = 0; i < 100 && window.__dpv.doc.media.some((m) => mediaRT(m.id)?.stato !== 'ok'); i++) await new Promise((r) => setTimeout(r, 100));
      const d2 = window.__dpv.doc;
      const dopo = { clip: d2.clips.length, media: d2.media.map((m) => m.name).sort(), tracce: d2.tracks.length, nome: d2.name, aperti: d2.media.every((m) => mediaRT(m.id)?.stato === 'ok') };
      let proxyTornato = null;
      try { const f = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('proxy-1')).getFileHandle(nomeP)).getFile(); const a = new Uint8Array(await f.arrayBuffer()); proxyTornato = { size: f.size, uguale: a.every((x, i) => x === finto[i]) }; } catch (e) { proxyTornato = String(e); }
      return { nomi, size: file.size, pesoMedia, prima, dopo, proxyTornato, mancano: piano.mancano.length };
    });
    prova('il .dap contiene il progetto, il LEGGIMI, TUTTI i file (media/…) e le copie leggere (proxy/…)', dap.nomi.includes('progetto.json') && dap.nomi.includes('LEGGIMI.txt') && dap.nomi.filter((n) => n.startsWith('media/')).length === dap.prima.media.length && dap.nomi.some((n) => n.startsWith('proxy/')) && dap.mancano === 0, JSON.stringify(dap.nomi));
    prova('il .dap pesa almeno quanto i file che ha dentro (non sono più "pochi KB")', dap.size >= dap.pesoMedia + 150000 && dap.pesoMedia > 10000, JSON.stringify({ size: dap.size, media: dap.pesoMedia }));
    prova('riaperto (senza più i file del browser): stesso montaggio, stessi file, tutti aperti dal .dap', JSON.stringify(dap.prima) === JSON.stringify({ clip: dap.dopo.clip, media: dap.dopo.media, tracce: dap.dopo.tracce, nome: dap.dopo.nome }) && dap.dopo.aperti, JSON.stringify({ prima: dap.prima, dopo: dap.dopo }));
    prova('la copia leggera torna al suo posto (uguale byte per byte): il monitor non deve rifarla', dap.proxyTornato && dap.proxyTornato.size === 150000 && dap.proxyTornato.uguale, JSON.stringify(dap.proxyTornato));

    // un .dap rovinato in fondo (salvataggio interrotto): si ritrova la fine buona di prima
    const rotto = await page.evaluate(async () => {
      const { PK, PX } = window.__dpvTest;
      const piano = await PK.pianoDap(null, await PX.proxyDelProgetto(window.__dpv.doc.media));
      const blob = await PK.costruisciDap(piano);
      const sporco = new File([blob, new Uint8Array(300000).fill(0x41)], 'Rotto.dap');
      try { const v = await PK.indicePacchetto({ file: sporco }); return { ok: v.has('progetto.json'), n: v.size }; } catch (e) { return { ok: false, e: String(e) }; }
    });
    prova('un .dap con dei byte in più in fondo (salvataggio interrotto) si apre lo stesso: si ritrova l\'indice buono', rotto.ok, JSON.stringify(rotto));
    // ——— 1.5.4 ———
    console.log('▶ 1.5.4: il pezzo che il 2 toglie si vede, clip unica, sottotitoli di una clip, Sottotitoli nei Titoli');
    const scarto = await page.evaluate(async () => {
      const { importaFile, ripresaDiProva, P } = window.__dpvTest;
      window.__dpv.dirty = false;
      await window.__dpvTest.PR.nuovo();
      const f = await ripresaDiProva(4, 25);
      const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
      const d = window.__dpv.doc;
      const tv = d.tracks.find((t) => t.kind === 'video'), ta = d.tracks.find((t) => t.kind === 'audio');
      window.__dpv.edit('Metti', (p) => { p.clips.push(P.newClip('media', tv.id, 0, 100, { media: m.id, name: 'Ripresa', link: 'L1' }), P.newClip('media', ta.id, 0, 100, { media: m.id, name: 'Ripresa', link: 'L1' })); });
      window.__dpvTest.ui().tl.adattaTutto();
      window.__dpv.select([]);
      window.__motore.vaiA(30);
      return m.id;
    });
    await page.waitForTimeout(300);
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    const vista = await page.evaluate(() => ({ sel: window.__dpv.sel.size, scarto: [...window.__dpvTest.ui().tl.scarto ?? []].length, contorni: window.__dpvTest.ui().tl.contorniScelte.length }));
    prova('subito dopo il taglio il pezzo che il 2 toglie è evidenziato (video e audio legato), anche se niente è selezionato', vista.sel === 0 && vista.scarto === 2 && vista.contorni === 2, JSON.stringify(vista));
    await page.keyboard.press('2');
    await page.waitForTimeout(300);
    const dopo2 = await page.evaluate(() => window.__dpv.doc.clips.filter((c) => c.name === 'Ripresa').map((c) => [c.start, c.len]));
    prova('e il 2 toglie proprio quello (il più corto, a sinistra)', dopo2.length === 2 && dopo2.every(([s, l]) => s === 30 && l === 70), JSON.stringify(dopo2));

    // Rendi clip unica: due pezzi (con il buco in mezzo) e il loro audio → una clip video + una audio, legate, su un file nuovo
    const unica = await page.evaluate(async () => {
      const { P, CU } = window.__dpvTest;
      const d = window.__dpv.doc;
      const m = d.media[0];
      const tv = d.tracks.find((t) => t.kind === 'video'), ta = d.tracks.find((t) => t.kind === 'audio');
      window.__dpv.edit('Due pezzi', (p) => { p.clips = [P.newClip('media', tv.id, 0, 25, { media: m.id, name: 'A', link: 'LA' }), P.newClip('media', ta.id, 0, 25, { media: m.id, name: 'A', link: 'LA' }), P.newClip('media', tv.id, 40, 25, { media: m.id, name: 'B', srcIn: 2, link: 'LB' }), P.newClip('media', ta.id, 40, 25, { media: m.id, name: 'B', srcIn: 2, link: 'LB' })]; });
      const prima = window.__dpv.doc.clips.length;
      await CU.rendiClipUnica(window.__dpv.doc.clips.map((c) => c.id));
      const d2 = window.__dpv.doc;
      const cs = d2.clips.map((c) => ({ kind: c.kind, track: d2.tracks.find((t) => t.id === c.track).kind, start: c.start, len: c.len, media: c.media, link: c.link }));
      const nuovo = d2.media.find((x) => x.id === cs[0]?.media);
      const r = { prima, cs, nome: nuovo?.name, cartella: d2.cartelle?.find((k) => k.id === nuovo?.cartella)?.nome, dur: nuovo?.duration, audio: nuovo?.hasAudio };
      window.__dpv.doUndo();
      r.annulla = window.__dpv.doc.clips.length;
      return r;
    });
    prova('"Rendi clip unica": al posto di 4 clip (2 pezzi e il loro audio) una clip video e una audio, legate, da 0 a 65, su un file nuovo nella cartella "Clip uniche"', unica.prima === 4 && unica.cs.length === 2 && unica.cs.every((c) => c.start === 0 && c.len === 65 && c.media === unica.cs[0].media && c.link && c.link === unica.cs[0].link) && unica.cs.some((c) => c.track === 'video') && unica.cs.some((c) => c.track === 'audio') && unica.cartella === 'Clip uniche' && Math.abs(unica.dur - 65 / 25) < 0.15, JSON.stringify(unica));
    prova('Ctrl+Z dopo "Rendi clip unica" rimette le 4 clip', unica.annulla === 4, JSON.stringify(unica.annulla));

    // sottotitoli di una clip sola: le righe nuove vanno nel suo pezzo, quelle fuori restano
    await page.evaluate(() => {
      const { V, SR } = window.__dpvTest;
      const d = window.__dpv.doc;
      window.__dpv.edit('Una riga fuori', (p) => { p.sottotitoli = { righe: [{ id: 'fuori', da: 200, a: 240, testo: 'resta' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' }; });
      window.__sottChiamate = 0;
      V.impostaTrascrittore({ carica: async () => { window.__sottChiamate++; return 'finto'; }, trascrivi: async () => { window.__sottChiamate++; return [{ da: 0.2, a: 0.9, testo: 'Ciao a tutti' }, { da: 1.8, a: 2.4, testo: 'seconda' }]; } });
      const b = window.__dpv.doc.clips.find((c) => c.name === 'B' && d.tracks.find((t) => t.id === c.track).kind === 'audio');
      // Non attendere qui: il consenso richiede un click esterno a questa evaluate.
      window.__sottEsito = SR.generaSottotitoli([b.id]).then(() => window.__dpv.doc.sottotitoli.righe.map((r) => [r.testo, r.da, r.a])).finally(() => V.impostaTrascrittore(null));
    });
    await page.waitForSelector('.ai-passi', { state: 'visible' });
    prova('sottotitoli della clip: nessuna chiamata al motore prima del consenso', await page.evaluate(() => window.__sottChiamate === 0));
    await page.locator('.ai-passi .primario').click();
    const sott = await page.evaluate(() => window.__sottEsito);
    prova('tasto destro → "Genera i sottotitoli di questa clip": righe solo dentro la clip (da 40 a 65), quella fuori resta', sott.some((r) => r[0] === 'resta') && sott.filter((r) => r[0] !== 'resta').length >= 1 && sott.filter((r) => r[0] !== 'resta').every((r) => r[1] >= 40 && r[2] <= 65), JSON.stringify(sott));
    // Il consenso termina prima della transizione di chiusura del velo (180 ms):
    // attendere il distacco reale, altrimenti il click destro colpisce l'overlay.
    await page.waitForSelector('.velo', { state: 'detached' });
    const menuClip = await page.evaluate(() => {
      const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc;
      tl.righe(d);
      const c = d.clips.find((x) => x.name === 'A' && d.tracks.find((t) => t.id === x.track).kind === 'video');
      const r = tl.riga(c.track);
      const box = tl.cv.getBoundingClientRect();
      return { x: box.left + tl.fX(c.start + c.len / 2), y: box.top + r.y + r.h / 2 };
    });
    await page.mouse.click(menuClip.x, menuClip.y, { button: 'right' });
    await page.waitForTimeout(300);
    const voci = await page.evaluate(() => [...document.querySelectorAll('.menu-contesto *')].map((x) => x.textContent).join('|'));
    await page.keyboard.press('Escape');
    prova('nel tasto destro della clip ci sono "Rendi clip unica" e "Genera i sottotitoli di questa clip"', /Rendi clip unica/.test(voci) && /Genera i sottotitoli di questa clip/.test(voci), voci.slice(0, 300));
    // la sezione Sottotitoli nei Titoli del contenitore
    await page.evaluate(() => document.querySelector('.bin-cat[data-c="tit:sott"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(400);
    const carte = await page.evaluate(() => [...document.querySelectorAll('.gen-sott .carta-nome')].map((x) => x.textContent));
    prova('Titoli → Sottotitoli: genera con l\'AI, riga al cursore, fai parlare, posizione e grandezza', carte.length === 4 && carte.some((t) => /AI/.test(t)) && carte.some((t) => /parlare/.test(t)), JSON.stringify(carte));
    // "Podcast" del togli rumori: passa da Clear (qui finto: dimezza il volume) e la clip va sul file nuovo
    const pod = await page.evaluate(async () => {
      const { CL, AA, importaFile, P } = window.__dpvTest;
      CL.impostaClearFinto({ enhance: async (s) => ({ channels: (Array.isArray(s) ? s : [s]).map((x) => x.map((v) => v * 0.5)), sampleRate: 48000, measuredLUFS: -20, measuredTruePeakDBFS: -2 }), dispose: () => {} });
      const sr = 48000, n = sr * 3;
      const b = new ArrayBuffer(44 + n * 2), d = new DataView(b);
      const w = (o, t) => [...t].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.round(Math.sin(i / 20) * 16000), true);
      const [m] = await importaFile([{ name: 'Voce.wav', file: new File([b], 'Voce.wav', { type: 'audio/wav' }) }], { chiediFormato: false });
      for (let i = 0; i < 50 && !window.__dpvTest.mediaRT(m.id)?.a; i++) await new Promise((r) => setTimeout(r, 100));
      const ta = window.__dpv.doc.tracks.find((t) => t.kind === 'audio');
      let id = '';
      window.__dpv.edit('Voce', (p) => { const c = P.newClip('media', ta.id, 300, 50, { media: m.id, name: 'Voce' }); p.clips.push(c); id = c.id; });
      try { await AA.togliRumore(id, 'podcast'); } catch (e) { CL.impostaClearFinto(null); return { errore: String(e) }; }
      CL.impostaClearFinto(null);
      const c = window.__dpv.doc.clips.find((x) => x.id === id);
      return { forza: c.afx?.pulito?.forza, cambiato: c.media !== m.id, nome: window.__dpv.doc.media.find((x) => x.id === c.media)?.name };
    });
    prova('togli rumori "Podcast": passa da Clear e la clip va sul file nuovo, "torna all\'originale" lo ricorda', pod.forza === 'podcast' && pod.cambiato && /pulito/.test(pod.nome ?? ''), JSON.stringify(pod));
    prova('nessun errore nella console (attività, timeline, .dap)', errori.length === 0, errori.slice(0, 4).join(' | '));
  } catch (e) {
    prova('le prove della 1.5.3 non si sono fermate', false, String(e && e.stack || e));
  } finally {
    await contesto.close();
  }
}
