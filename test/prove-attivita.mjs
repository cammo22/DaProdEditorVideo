// Le prove della 1.2.0: il centro attività (barra in basso a destra e pannello), le code dei lavori di fondo con la
// priorità, la memoria delle misure già fatte, la copia leggera che si fa solo per chi sta in timeline, la conversione
// a velocità costante dietro le quinte e la riapertura veloce dei progetti.
//   npm run build && node test/prove-nuove.mjs attivita
import path from 'node:path';

export async function proveAttivita({ page: paginaDi, prova, OUT }) {
  console.log('▶ Centro attività: registro, code e priorità');
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message + ' @ ' + String(e.stack ?? '').split('\n').slice(1, 5).join(' | ')));
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1200);

  // ——— le cose pure ———
  const pure = await page.evaluate(async () => {
    const { AT, SM, CH } = window.__dpvTest;
    AT.azzeraAttivita();
    const fuori = {};
    fuori.testo = [SM.durataTesto(45), SM.durataTesto(130), SM.durataTesto(3900)];
    // una riga a mano con la sua barra
    const l = AT.nuova({ titolo: 'Prova a mano', categoria: 'altro' });
    l.imposta(0.4, 'a metà');
    fuori.mano = { righe: AT.attivitaInCorso().length, k: AT.attivitaInCorso()[0].k, dett: AT.attivitaInCorso()[0].dettaglio };
    l.fine('fatto');
    fuori.finita = { righe: AT.attivitaInCorso().length, storico: AT.attivitaFinite()[0]?.stato, k: AT.attivitaFinite()[0]?.k };
    // la coda: la corsia pesante fa un lavoro alla volta, e passa avanti chi ha la priorità più alta
    const ordine = []; let insieme = 0, maxInsieme = 0;
    const lavoro = (nome, ms) => async () => { ordine.push(nome); insieme++; maxInsieme = Math.max(maxInsieme, insieme); await new Promise((r) => setTimeout(r, ms)); insieme--; return nome; };
    AT.pausaLavori(true);
    const p = [
      AT.inCoda({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'prova', priorita: 0 }, lavoro('basso', 30)),
      AT.inCoda({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'prova', priorita: 0 }, lavoro('basso2', 30)),
      AT.inCoda({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'prova', priorita: 150 }, lavoro('alto', 30)),
    ];
    fuori.gruppo = { righe: AT.attivitaInCorso().length, totale: AT.attivitaInCorso()[0]?.totale, inCoda: AT.attivitaInCorso()[0]?.stato };
    AT.pausaLavori(false);
    const res = await Promise.all(p);
    fuori.coda = { ordine, maxInsieme, res };
    fuori.chiusa = { righe: AT.attivitaInCorso().length, msg: AT.attivitaFinite()[0]?.messaggio, stato: AT.attivitaFinite()[0]?.stato };
    // un lavoro che va male non ferma gli altri
    const ko = await AT.inCoda({ corsia: 'leggero', titolo: 'Rotto', categoria: 'altro' }, async () => { throw new Error('boom'); });
    fuori.errore = { ko, stato: AT.attivitaFinite()[0]?.stato, msg: AT.attivitaFinite()[0]?.messaggio };
    // annullare una riga in coda: il lavoro non parte
    AT.pausaLavori(true);
    let partito = false;
    const q = AT.inCoda({ corsia: 'leggero', titolo: 'Da annullare', categoria: 'altro' }, async () => { partito = true; });
    AT.fermaRiga(AT.attivitaInCorso()[0].id);
    AT.pausaLavori(false);
    const r = await q;
    fuori.annulla = { r, partito, stato: AT.attivitaFinite()[0]?.stato };
    // la memoria delle misure: la forma d'onda si comprime in un byte per valore e si ritrova
    const pk = new Float32Array([0, 0.01, 0.25, 0.5, 1]);
    const ritorno = CH.espandiPicchi(CH.comprimiPicchi(pk));
    fuori.picchi = [...ritorno].map((x, i) => Math.abs(x - pk[i]) < 0.02);
    await CH.scriviCache('colore', 'prova|chiave', { gamma: 0.9 });
    fuori.cache = (await CH.leggiCache('colore', 'prova|chiave'))?.gamma;
    fuori.cacheNo = (await CH.leggiCache('colore', 'non|esiste')) === undefined;
    AT.azzeraAttivita();
    return fuori;
  });
  prova('i tempi si dicono in parole', pure.testo[0] === '45 s' && pure.testo[1] === '2 min 10 s' && pure.testo[2] === '1 h 05 min', JSON.stringify(pure.testo));
  prova('un lavoro a mano ha la sua riga con la barra e, finito, passa fra le finite', pure.mano.righe === 1 && Math.abs(pure.mano.k - 0.4) < 0.01 && pure.mano.dett === 'a metà' && pure.finita.righe === 0 && pure.finita.storico === 'finita' && pure.finita.k === 1, JSON.stringify([pure.mano, pure.finita]));
  prova('i lavori dello stesso tipo stanno in una riga sola', pure.gruppo.righe === 1 && pure.gruppo.totale === 3 && pure.gruppo.inCoda === 'coda', JSON.stringify(pure.gruppo));
  prova('la corsia pesante fa un lavoro alla volta e passa avanti chi ha la priorità', pure.coda.maxInsieme === 1 && pure.coda.ordine[0] === 'alto' && pure.coda.ordine.length === 3, JSON.stringify(pure.coda));
  prova('finito il gruppo, la riga si chiude con "3 in …"', pure.chiusa.righe === 0 && /^3 in /.test(pure.chiusa.msg) && pure.chiusa.stato === 'finita', JSON.stringify(pure.chiusa));
  prova('un lavoro che va male finisce in errore e il resto continua', pure.errore.ko === null && pure.errore.stato === 'errore' && /boom/.test(pure.errore.msg), JSON.stringify(pure.errore));
  prova('una riga ancora in coda si annulla e il lavoro non parte', pure.annulla.r === null && pure.annulla.partito === false && pure.annulla.stato === 'annullata', JSON.stringify(pure.annulla));
  prova('la forma d\'onda compressa si ritrova uguale (entro il 2%)', pure.picchi.every(Boolean), JSON.stringify(pure.picchi));
  prova('la memoria delle misure scrive e rilegge (e dice "non c\'è")', pure.cache === 0.9 && pure.cacheNo);

  // ——— la barra e il pannello ———
  console.log('▶ Centro attività: la barra in basso a destra e il pannello');
  // la barra si aggiorna con un attimo di ritardo (150 ms): la si fa aggiornare subito, se no si legge quella di prima dell'azzeramento
  const ferma0 = await page.evaluate(() => (window.__dpvTest.AT.avvisaOra(), { testo: document.querySelector('.stato .att-testo')?.textContent, ferma: document.querySelector('.stato .att')?.classList.contains('att-ferma') }));
  prova('a riposo la barra dice "Nessuna attività"', ferma0.ferma && ferma0.testo === 'Nessuna attività', JSON.stringify(ferma0));
  await page.evaluate(() => {
    const { AT } = window.__dpvTest;
    window.__prova = { a: AT.nuova({ titolo: 'Riapro i file del progetto', categoria: 'file' }), b: AT.nuova({ titolo: "Forme d'onda", categoria: 'analisi', gruppo: 'pk' }), fermata: false };
    window.__prova.a.imposta(0.35, '14 di 40 · Ripresa 14.mp4');
    window.__prova.b.imposta(0.1, 'musica.mp3');
    AT.avvisaOra();
  });
  await page.waitForTimeout(250);
  const barra = await page.evaluate(() => {
    const el = document.querySelector('.stato .att');
    const r = el.getBoundingClientRect(), s = document.querySelector('.stato').getBoundingClientRect();
    return { testo: el.querySelector('.att-testo').textContent, larg: el.querySelector('.att-pista i').style.width, tempo: el.querySelector('.att-tempo').textContent, altre: el.querySelector('.att-altre').textContent, destra: r.right > innerWidth * 0.5, dentro: r.bottom <= innerHeight + 1 && r.top >= s.top - 1, ferma: el.classList.contains('att-ferma') };
  });
  prova('la barra mostra l\'attività, la percentuale e quante altre ce ne sono', !barra.ferma && /Riapro i file/.test(barra.testo) && barra.larg === '35%' && /35%/.test(barra.tempo) && barra.altre === '+1', JSON.stringify(barra));
  prova('la barra sta in basso a destra, dentro lo schermo', barra.destra && barra.dentro, JSON.stringify(barra));
  await page.screenshot({ path: path.join(OUT, 'attivita-barra.png') });
  await page.click('.stato .att');
  await page.waitForSelector('.att-pannello');
  const pan = await page.evaluate(() => {
    const p = document.querySelector('.att-pannello');
    const r = p.getBoundingClientRect();
    const righe = [...p.querySelectorAll('.att-riga')].map((x) => ({ t: x.querySelector('.att-r-titolo').textContent, pct: x.querySelector('.att-r-pct').textContent, info: x.querySelector('.att-r-info').textContent, stop: !!x.querySelector('.att-r-stop') }));
    return { righe, dentro: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
  prova('il clic apre il pannello con una riga per attività: titolo, percentuale, tempi', pan.righe.length === 2 && pan.righe[0].t === 'Riapro i file del progetto' && pan.righe[0].pct === '35%' && /passati/.test(pan.righe[0].info) && pan.righe.every((r) => r.stop), JSON.stringify(pan));
  prova('il pannello sta dentro lo schermo', pan.dentro);
  await page.screenshot({ path: path.join(OUT, 'attivita-pannello.png') });
  // ✕ ferma la riga: chi lavora riceve il segnale
  await page.click('.att-riga:first-child .att-r-stop');
  await page.waitForTimeout(300);
  const dopo = await page.evaluate(() => ({ fermato: window.__prova.a.fermato, righe: document.querySelectorAll('.att-riga').length }));
  prova('✕ manda il segnale di stop a chi lavora', dopo.fermato === true, JSON.stringify(dopo));
  await page.evaluate(() => { window.__prova.a.annullata(); window.__prova.b.fine('ok'); window.__dpvTest.AT.avvisaOra(); });
  await page.waitForTimeout(300);
  const fin = await page.evaluate(() => ({ righe: document.querySelectorAll('.att-riga').length, finite: document.querySelectorAll('.att-f').length }));
  prova('finite le attività, il pannello le sposta fra "Finite da poco"', fin.righe === 0 && fin.finite >= 2, JSON.stringify(fin));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  prova('Esc chiude il pannello', (await page.locator('.att-pannello').count()) === 0);
  await page.evaluate(() => window.__dpvTest.AT.azzeraAttivita());

  // ——— riaprire un progetto, la copia leggera, la conversione dietro le quinte ———
  console.log('▶ Riapertura veloce, copia leggera solo se serve, conversione dietro le quinte');
  const dati = await page.evaluate(async () => {
    const { importaFile, ripresaDiProva, P, mediaRT, AT } = window.__dpvTest;
    const base = await ripresaDiProva(3, 25);
    const nomi = [];
    const files = [];
    for (let i = 0; i < 6; i++) { nomi.push(`Ripresa ${i}.webm`); files.push({ name: nomi[i], file: new File([await base.arrayBuffer(), new Uint8Array([i])], nomi[i], { type: 'video/webm' }) }); }
    const m = await importaFile(files, { chiediFormato: false });
    for (let i = 0; i < 100; i++) { if (m.every((x) => mediaRT(x.id)?.stato === 'ok' && mediaRT(x.id).colore)) break; await new Promise((r) => setTimeout(r, 100)); }
    const prima = m.map((x) => mediaRT(x.id).proxyStato);
    // se ne mette uno in timeline: solo lui si prende la copia leggera
    const alta = window.__dpv.doc.tracks.filter((t) => t.kind === 'video')[0].id;
    window.__dpv.edit('clip', (pp) => { pp.clips.push(P.newClip('media', alta, 0, 60, { media: m[0].id, name: m[0].name })); });
    let pronto = false;
    for (let i = 0; i < 400; i++) { if (mediaRT(m[0].id).proxyStato === 'pronto') { pronto = true; break; } await new Promise((r) => setTimeout(r, 200)); }
    const dopo = m.map((x) => mediaRT(x.id).proxyStato);
    return { prima, dopo, pronto, doc: JSON.stringify(window.__dpv.doc), ids: m.map((x) => x.id) };
  });
  prova('i file fuori dalla timeline non fanno la copia leggera (aspettano)', dati.prima.every((s) => s !== 'coda' && s !== 'lavoro'), JSON.stringify(dati.prima));
  prova('il file messo in timeline se la prende, gli altri restano in attesa', dati.pronto && dati.dopo.slice(1).every((s) => s !== 'pronto'), JSON.stringify(dati.dopo));

  const ria = await page.evaluate(async (doc) => {
    const { PR, mediaRT, AT, CH } = window.__dpvTest;
    const proj = JSON.parse(doc);
    const visto = { righe: [], max: 0 };
    const t = setInterval(() => { for (const r of AT.attivitaInCorso()) visto.righe.push(r.titolo); }, 20);
    const t0 = performance.now();
    await PR.carica(proj);
    const ms = performance.now() - t0;
    clearInterval(t);
    // la forma d'onda e il colore vengono dalla memoria: niente da rifare
    for (let i = 0; i < 30; i++) { if (proj.media.every((m) => mediaRT(m.id)?.colore)) break; await new Promise((r) => setTimeout(r, 100)); }
    return { ms, ok: proj.media.every((m) => mediaRT(m.id)?.stato === 'ok'), colore: proj.media.every((m) => mediaRT(m.id)?.colore), visto: [...new Set(visto.righe)], proxy0: mediaRT(proj.media[0].id).proxyStato, finite: AT.attivitaFinite().map((a) => a.titolo + ': ' + a.messaggio) };
  }, dati.doc);
  prova('riaprendo il progetto i file tornano tutti, col colore dalla memoria', ria.ok && ria.colore, JSON.stringify(ria));
  prova('la riapertura passa dal centro attività ("Riapro i file")', ria.finite.some((t) => /^Riapro i file del progetto: 6 file in /.test(t)), JSON.stringify(ria.finite));
  prova('la copia leggera già fatta si ritrova subito', ria.proxy0 === 'pronto', ria.proxy0);

  // la conversione dietro le quinte: si importa subito il file com'è, poi la copia a velocità costante lo sostituisce
  const vfr = await page.evaluate(async () => {
    const { importaFile, ripresaVfrDiProva, mediaRT, AT } = window.__dpvTest;
    const f = await ripresaVfrDiProva();
    const t0 = performance.now();
    const [m] = await importaFile([{ name: 'telefono.webm', file: new File([f], 'telefono.webm', { type: 'video/webm' }) }], { chiediFormato: false });
    const subito = performance.now() - t0;
    const fpsPrima = m.fps, sizePrima = m.size;
    let righe = [];
    for (let i = 0; i < 600; i++) {
      for (const r of AT.attivitaInCorso()) righe.push(r.categoria + ':' + r.titolo);
      const x = window.__dpv.doc.media.find((z) => z.id === m.id);
      if (x.size !== sizePrima) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const x = window.__dpv.doc.media.find((z) => z.id === m.id);
    // la copia prende il posto del file e poi si riapre: si aspetta che sia aperta (prima si guardava subito e, su una
    // macchina lenta, la si trovava ancora a metà apertura)
    for (let i = 0; i < 100 && mediaRT(m.id)?.stato !== 'ok'; i++) await new Promise((r) => setTimeout(r, 100));
    return { subito, sostituito: x.size !== sizePrima, ok: mediaRT(m.id)?.stato === 'ok', stato: mediaRT(m.id)?.stato, fps: x.fps, nome: x.name, righe: [...new Set(righe)] };
  });
  prova('il file a frame rate variabile entra subito, e la copia a velocità costante prende il suo posto', vfr.sostituito && vfr.ok && vfr.nome === 'telefono.webm', JSON.stringify(vfr));
  prova('la conversione ha la sua riga nel centro attività', vfr.righe.some((x) => /^conversione:/.test(x)), JSON.stringify(vfr.righe));
  prova('nessun errore nella pagina', errori.length === 0, errori.slice(0, 3).join(' | '));
  await contesto.close();
}
