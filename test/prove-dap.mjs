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
    const pannello = await page.evaluate(() => ({ righe: document.querySelectorAll('.att-pannello .att-lista .att-riga').length, vuoto: !!document.querySelector('.att-pannello .att-lista .att-vuoto'), finite: [...document.querySelectorAll('.att-pannello .att-f-nome')].map((x) => x.textContent) }));
    prova('riaperto il pannello: nessuna riga "in corso" rimasta ferma, c\'è "non sta facendo niente" e il lavoro è fra le finite', lav === 1 && pannello.righe === 0 && pannello.vuoto && pannello.finite.some((t) => /Copie leggere/.test(t)), JSON.stringify({ lav, pannello }));
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
    prova('nessun errore nella console (attività, timeline, .dap)', errori.length === 0, errori.slice(0, 4).join(' | '));
  } catch (e) {
    prova('le prove della 1.5.3 non si sono fermate', false, String(e && e.stack || e));
  } finally {
    await contesto.close();
  }
}
