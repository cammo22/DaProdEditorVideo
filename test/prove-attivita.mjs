// Centro attività: code, priorità, progressi e controlli nel pannello della libreria.
// Import e riapertura non avviano preparazioni; proxy e conversioni partono solo su richiesta.
// Le sezioni encoder usano WebCodecs reale; i lavori di registro iniziali sono sintetici.
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
    // (i limiti veri dipendono dal numero di processori: per questa prova si fissano com'erano sui computer piccoli)
    AT.impostaLimiti({ leggero: 2, pesante: 1 });
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
    // Sovraccarica: più lavori pesanti insieme, e si spegne da solo quando non c'è più niente
    AT.impostaLimiti(null);
    const normali = AT.limitiNormali(4), forti = AT.limitiForti(4), forti16 = AT.limitiForti(16);
    let insieme2 = 0, max2 = 0;
    const lungo = async () => { insieme2++; max2 = Math.max(max2, insieme2); await new Promise((r) => setTimeout(r, 80)); insieme2--; };
    AT.sovraccarica(true);
    const acceso = AT.inSovraccarico();
    await Promise.all([1, 2, 3, 4].map((i) => AT.inCoda({ corsia: 'pesante', titolo: 'Forza ' + i, categoria: 'conversione', gruppo: 'forza' }, lungo)));
    await new Promise((r) => setTimeout(r, 1300));
    fuori.forza = { normali, forti, forti16, acceso, max2, spento: !AT.inSovraccarico() };
    AT.impostaLimiti({ leggero: 2, pesante: 1 });
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
  prova('Sovraccarica: più conversioni insieme (e più analisi), e si spegne da solo a lavoro finito', pure.forza.acceso && pure.forza.max2 >= 2 && pure.forza.spento && pure.forza.forti.pesante > pure.forza.normali.pesante && pure.forza.forti.leggero > pure.forza.normali.leggero && pure.forza.forti16.pesante <= 4 && pure.forza.forti16.leggero <= 8, JSON.stringify(pure.forza));
  prova('finito il gruppo, la riga si chiude con "3 in …"', pure.chiusa.righe === 0 && /^3 in /.test(pure.chiusa.msg) && pure.chiusa.stato === 'finita', JSON.stringify(pure.chiusa));
  prova('un lavoro che va male finisce in errore e il resto continua', pure.errore.ko === null && pure.errore.stato === 'errore' && /boom/.test(pure.errore.msg), JSON.stringify(pure.errore));
  prova('una riga ancora in coda si annulla e il lavoro non parte', pure.annulla.r === null && pure.annulla.partito === false && pure.annulla.stato === 'annullata', JSON.stringify(pure.annulla));
  prova('la forma d\'onda compressa si ritrova uguale (entro il 2%)', pure.picchi.every(Boolean), JSON.stringify(pure.picchi));
  prova('la memoria delle misure scrive e rilegge (e dice "non c\'è")', pure.cache === 0.9 && pure.cacheNo);

  // ——— riepilogo e pannello integrato nella libreria (1.5.8) ———
  console.log('▶ Centro attività: riepilogo, progressi, comandi e storico');
  const ferma0 = await page.evaluate(() => (window.__dpvTest.AT.avvisaOra(), document.querySelector('.att')?.textContent));
  prova('a riposo il riepilogo dice "Nessuna attività"', ferma0 === 'Nessuna attività', ferma0);
  await page.evaluate(() => {
    const { AT } = window.__dpvTest;
    window.__prova = { a: AT.nuova({ titolo: 'Riapro i file del progetto', categoria: 'file' }), b: AT.nuova({ titolo: "Forme d'onda", categoria: 'analisi', gruppo: 'pk' }) };
    window.__prova.a.imposta(0.35, '14 di 40 · Ripresa 14.mp4');
    window.__prova.b.imposta(0.1, 'musica.mp3');
    AT.avvisaOra();
  });
  await page.waitForTimeout(250);
  const barra = await page.evaluate(() => {
    const el = document.querySelector('.att'), r = el.getBoundingClientRect();
    return { testo: el.querySelector('.att-testo').textContent, altre: el.querySelector('.att-altre').textContent, dentro: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
  prova('il riepilogo conta tutte le attività al lavoro', /^Riapro i file del progetto/.test(barra.testo) && barra.altre === '+1', JSON.stringify(barra));
  prova('il riepilogo resta dentro lo schermo', barra.dentro, JSON.stringify(barra));
  await page.screenshot({ path: path.join(OUT, 'attivita-barra.png') });
  await page.click('.att');
  await page.waitForSelector('.att-pannello');
  const pan = await page.evaluate(() => {
    const p = document.querySelector('.att-pannello'), r = p.getBoundingClientRect();
    const righe = [...p.querySelectorAll('.att-riga')].map((x) => ({ t: x.querySelector('b').textContent, pct: Number(x.querySelector('.att-pista').getAttribute('aria-valuenow')) / 100, accessibile: x.querySelector('.att-pista').getAttribute('aria-label'), info: x.querySelector('.att-r-info').textContent, stop: [...x.querySelectorAll('button')].some((b) => b.textContent === 'Annulla') }));
    return { righe, dentro: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, ancorato: r.right > innerWidth * 0.5 && r.bottom <= document.querySelector('.att').getBoundingClientRect().top };
  });
  prova('il pannello mostra titolo, percentuale accessibile, tempi e Annulla per ogni attività', pan.righe.length === 2 && pan.righe[0].t === 'Riapro i file del progetto' && pan.righe[0].pct === 0.35 && /35%/.test(pan.righe[0].accessibile) && /passati/i.test(pan.righe[0].info) && pan.righe.every((r) => r.stop), JSON.stringify(pan));
  prova('il pannello è un popup in basso a destra, dentro lo schermo, sopra il riepilogo', pan.dentro && pan.ancorato, JSON.stringify(pan));
  const turbo = page.getByRole('button', { name: '⚡ Sovraccarica', exact: true });
  prova('Sovraccarica dichiara lo stato spento', await turbo.getAttribute('aria-pressed') === 'false');
  await turbo.click();
  await page.waitForTimeout(300);
  const acceso = page.getByRole('button', { name: '⚡ Sovraccarico acceso', exact: true });
  prova('Sovraccarica accende il motore e lo stato accessibile', await page.evaluate(() => window.__dpvTest.AT.inSovraccarico()) && await acceso.getAttribute('aria-pressed') === 'true');
  await acceso.click();
  prova('il secondo clic spegne Sovraccarica', !await page.evaluate(() => window.__dpvTest.AT.inSovraccarico()));
  await page.screenshot({ path: path.join(OUT, 'attivita-pannello.png') });
  await page.locator('.att-riga').first().getByRole('button', { name: 'Annulla', exact: true }).click();
  await page.waitForTimeout(300);
  prova('Annulla manda il segnale al lavoro reale', await page.evaluate(() => window.__prova.a.fermato === true));
  await page.evaluate(() => { window.__prova.a.annullata(); window.__prova.b.fine('ok'); window.__dpvTest.AT.avvisaOra(); });
  await page.waitForTimeout(300);
  const fin = await page.evaluate(() => [...document.querySelectorAll('.att-riga')].map((x) => ({ stato: x.dataset.stato, testo: x.textContent, progressoNascosto: x.querySelector('.att-pista').hidden })));
  prova('le attività terminali restano nello storico senza barra in movimento', fin.length === 2 && fin.every((x) => ['finita', 'annullata'].includes(x.stato) && x.progressoNascosto), JSON.stringify(fin));
  prova('lo storico conserva durata e ora assoluta senza "x fa"', fin.every((x) => /ci ha messo/.test(x.testo) && /\d\d[:.]\d\d/.test(x.testo) && !/ fa\b/.test(x.testo)), JSON.stringify(fin));
  await page.evaluate(() => { window.__nodiFinite = [...document.querySelectorAll('.att-riga')]; window.__testiFinite = window.__nodiFinite.map((x) => x.textContent); });
  await page.waitForTimeout(2300);
  prova('lo storico conserva nodi e testo, senza ridisegni periodici', await page.evaluate(() => [...document.querySelectorAll('.att-riga')].every((x, i) => x === window.__nodiFinite[i] && x.textContent === window.__testiFinite[i])));
  await page.getByRole('button', { name: 'Pulisci', exact: true }).click();
  // Il registro notifica la UI con debounce: attendere l'effetto, non un ritardo arbitrario.
  await page.waitForFunction(() => document.querySelectorAll('.att-pannello .att-riga').length === 0);
  prova('Pulisci rimuove le attività terminali', await page.locator('.att-riga').count() === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  prova('Esc chiude il pannello e ripristina il fuoco sul riepilogo', await page.locator('.att-pannello').count() === 0 && await page.evaluate(() => document.activeElement?.matches('.att')));
  await page.evaluate(() => window.__dpvTest.AT.azzeraAttivita());

  // ——— dalla 1.5.8: import e riapertura «solo il minimo», preparazioni a mano ———
  console.log('▶ Import e riapertura senza lavori da soli; copia leggera e conversione a mano (con pausa vera)');
  const dati = await page.evaluate(async () => {
    const { importaFile, ripresaDiProva, P, mediaRT, AT } = window.__dpvTest;
    AT.azzeraAttivita();
    // le preferenze vecchie con tutto acceso: non devono far partire niente
    localStorage.setItem('dpv-proxy', 'sempre');
    localStorage.setItem('dpv-normalizza', 'si');
    const base = await ripresaDiProva(3, 25);
    const nomi = [];
    const files = [];
    for (let i = 0; i < 6; i++) { nomi.push(`Ripresa ${i}.webm`); files.push({ name: nomi[i], file: new File([await base.arrayBuffer(), new Uint8Array([i])], nomi[i], { type: 'video/webm' }) }); }
    const m = await importaFile(files, { chiediFormato: false });
    await new Promise((r) => setTimeout(r, 600));
    const prima = m.map((x) => mediaRT(x.id).proxyStato ?? '-');
    const righe0 = AT.attivitaInCorso().map((r) => r.titolo);
    const prep0 = AT.attivitaFinite().filter((r) => r.categoria !== 'file').map((r) => r.titolo);
    // se ne mette uno in timeline: non parte niente lo stesso
    const alta = window.__dpv.doc.tracks.filter((t) => t.kind === 'video')[0].id;
    window.__dpv.edit('clip', (pp) => { pp.clips.push(P.newClip('media', alta, 0, 60, { media: m[0].id, name: m[0].name })); });
    await new Promise((r) => setTimeout(r, 2600));
    const dopo = m.map((x) => mediaRT(x.id).proxyStato ?? '-');
    return {
      prima, dopo, righe0, prep0, righe1: AT.attivitaInCorso().map((r) => r.titolo), daAvviare: AT.attivitaDaAvviare().length,
      colore: m.some((x) => mediaRT(x.id).colore), picchi: m.some((x) => mediaRT(x.id).peaks), doc: JSON.stringify(window.__dpv.doc), ids: m.map((x) => x.id),
    };
  });
  prova('import con le preferenze vecchie: nessuna copia leggera né conversione; forma d\'onda e colore ripartono da soli', dati.prima.every((s) => s === '-') && dati.righe0.every((t) => /Forme d|Colore|Locandine/.test(t)) && dati.prep0.every((t) => /Forme d|Colore|Locandine/.test(t)), JSON.stringify(dati));
  prova('la clip messa in timeline non fa partire nessuna copia leggera (dopo 2,6 s)', dati.dopo.every((s) => s === '-') && dati.daAvviare === 0, JSON.stringify(dati.dopo));

  // da qui si prova il motore minimo (copia leggera e conversione a mano): la preparazione automatica leggera (colore, forma d'onda, locandina) si spegne,
  // se no su un computer carico sta ancora lavorando e falsa i conti sulle righe in corso
  await page.evaluate(() => window.__dpvTest.LB.impostaPreparazioneAutomatica(false));
  await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 1500)); window.__dpvTest.AT.azzeraAttivita(); });
  // la copia leggera a mano: nasce da avviare, parte con Avvia, Pausa vera (riparte dallo stesso punto), poi pronta sul disco
  const px = await page.evaluate(async (ids) => {
    const { LB, AT, mediaRT } = window.__dpvTest;
    const p = LB.proponiPreparazione(ids[0], 'proxy', { forza: true });
    const nato = { stato: p?.riga.stato, proxy: mediaRT(ids[0]).proxyStato, daAvviare: AT.attivitaDaAvviare().length, inCorso: AT.attivitaInCorso().length, pausa: p?.riga.capacita.pausa };
    await new Promise((r) => setTimeout(r, 300));
    const fermo = mediaRT(ids[0]).proxyStato;
    const idRiga = AT.avviaRiga(p.riga.id);
    for (let i = 0; i < 300 && !((mediaRT(ids[0]).proxyProg ?? 0) > 0.05); i++) await new Promise((r) => setTimeout(r, 20));
    const esitoPausa = AT.pausaRiga(idRiga);
    const riga = AT.attivitaInCorso().find((r) => r.id === idRiga);
    for (let i = 0; i < 200 && riga?.stato !== 'pausa'; i++) await new Promise((r) => setTimeout(r, 20));
    const k1 = mediaRT(ids[0]).proxyProg;
    await new Promise((r) => setTimeout(r, 600));
    const k2 = mediaRT(ids[0]).proxyProg;
    const statoPausa = riga?.stato;
    AT.riprendiRiga(idRiga);
    const ok = await p.esito;
    return { nato, fermo, esitoPausa, statoPausa, k1, k2, ok, finale: mediaRT(ids[0]).proxyStato, lato: mediaRT(ids[0]).proxy ? Math.max(mediaRT(ids[0]).proxy.w, mediaRT(ids[0]).proxy.h) : 0, stato: LB.statoPreparazione(ids[0], 'proxy') };
  }, dati.ids);
  prova('«Prepara copia leggera» nasce da avviare (pausa vera) e non parte da sola', px.nato.stato === 'manuale' && px.nato.proxy === 'manuale' && px.nato.daAvviare === 1 && px.nato.inCorso === 0 && px.nato.pausa === 'vera' && px.fermo === 'manuale', JSON.stringify(px));
  prova('Avvia → Pausa: la conversione si ferma davvero (l\'avanzamento non cammina) e Riprendi la finisce', (px.esitoPausa === 'dopo-il-pezzo' || px.esitoPausa === 'in-pausa') && px.statoPausa === 'pausa' && px.k1 === px.k2 && px.k1 < 1 && px.ok === true && px.finale === 'pronto' && px.lato > 0 && px.lato <= 960 && px.stato === 'fatta', JSON.stringify(px));

  const ria = await page.evaluate(async (doc) => {
    const { PR, mediaRT, AT } = window.__dpvTest;
    const proj = JSON.parse(doc);
    const visto = { righe: [] };
    const t = setInterval(() => { for (const r of AT.attivitaInCorso()) visto.righe.push(r.categoria + ':' + r.titolo); }, 20);
    const t0 = performance.now();
    await PR.carica(proj);
    const ms = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 800));
    clearInterval(t);
    return { ms, ok: proj.media.every((m) => mediaRT(m.id)?.stato === 'ok'), visto: [...new Set(visto.righe)], proxy0: mediaRT(proj.media[0].id).proxyStato, altri: proj.media.slice(1).map((m) => mediaRT(m.id).proxyStato ?? '-'), finite: AT.attivitaFinite().map((a) => a.titolo + ': ' + a.messaggio), daAvviare: AT.attivitaDaAvviare().length };
  }, dati.doc);
  prova('riaprendo il progetto i file tornano tutti', ria.ok, JSON.stringify(ria));
  prova('la riapertura passa dal centro attività («Riapro i file») e non fa altro', ria.finite.some((t) => /^Riapro i file del progetto: 6 file in /.test(t)) && ria.visto.every((x) => /^file:/.test(x)) && ria.daAvviare === 0, JSON.stringify(ria));
  prova('la copia leggera già fatta si ritrova subito (si legge, non si rifà); gli altri restano senza', ria.proxy0 === 'pronto' && ria.altri.every((s) => s === '-'), JSON.stringify([ria.proxy0, ria.altri]));

  // il controllo della velocità a mano: il file entra com'è, il controllo trova il frame rate variabile, la conversione
  // nasce da avviare; avviata, la copia a velocità costante prende il suo posto
  const vfr = await page.evaluate(async () => {
    const { importaFile, ripresaVfrDiProva, mediaRT, AT, LB } = window.__dpvTest;
    const f = await ripresaVfrDiProva();
    const [m] = await importaFile([{ name: 'telefono.webm', file: new File([f], 'telefono.webm', { type: 'video/webm' }) }], { chiediFormato: false });
    const sizePrima = m.size;
    await new Promise((r) => setTimeout(r, 500));
    const nienteDaSolo = !AT.attivitaInCorso().length && !AT.attivitaDaAvviare().length;
    const esame = LB.proponiPreparazione(m.id, 'velocita', { avvia: true });
    const verdetto = await esame?.esito;
    const conv = AT.attivitaDaAvviare().find((r) => r.categoria === 'conversione');
    const prontaDaAvviare = !!conv && LB.statoPreparazione(m.id, 'velocita') === 'da-avviare';
    let righe = [];
    if (conv) AT.avviaRiga(conv.id);
    for (let i = 0; i < 600; i++) {
      for (const r of AT.attivitaInCorso()) righe.push(r.categoria + ':' + r.titolo);
      const x = window.__dpv.doc.media.find((z) => z.id === m.id);
      if (x.size !== sizePrima) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const x = window.__dpv.doc.media.find((z) => z.id === m.id);
    for (let i = 0; i < 100 && mediaRT(m.id)?.stato !== 'ok'; i++) await new Promise((r) => setTimeout(r, 100));
    return { nienteDaSolo, verdetto, prontaDaAvviare, sostituito: x.size !== sizePrima, ok: mediaRT(m.id)?.stato === 'ok', nome: x.name, righe: [...new Set(righe)], stato: LB.statoPreparazione(m.id, 'velocita') };
  });
  prova('il file a frame rate variabile entra senza controlli; «Controlla velocità file» lo trova e la conversione nasce da avviare', vfr.nienteDaSolo && vfr.verdetto === 'da-convertire' && vfr.prontaDaAvviare, JSON.stringify(vfr));
  prova('avviata, la conversione ha la sua riga e la copia a velocità costante prende il posto del file', vfr.sostituito && vfr.ok && vfr.nome === 'telefono.webm' && vfr.righe.some((x) => /^conversione:/.test(x)) && vfr.stato === 'fatta', JSON.stringify(vfr));
  await page.evaluate(() => { localStorage.removeItem('dpv-proxy'); localStorage.removeItem('dpv-normalizza'); });
  prova('nessun errore nella pagina', errori.length === 0, errori.slice(0, 3).join(' | '));
  await contesto.close();
}
