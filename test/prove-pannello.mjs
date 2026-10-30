// Le prove del pannello Proprietà: tutto chiuso di partenza, le sezioni si riordinano trascinando e l'ordine si ricorda
// per ogni tipo di elemento e per ogni scheda (QUADRO per le immagini, i titoli, le animazioni… e i blocchi FX), anche dopo
// aver riaperto il programma. Dalla grafica «Banco» le sezioni stanno nelle quattro schede: qui si guarda QUADRO.
import path from 'node:path';

export async function provePannello({ page: paginaDi, prova, OUT }) {
  console.log('▶ Proprietà: sezioni chiuse e riordinabili');
  // una pagina pulita: le prove di prima hanno aperto delle sezioni e riempito il progetto
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { localStorage.removeItem('dpv-isp-ordine'); localStorage.setItem('dpv-isp-scheda', 'quadro'); } catch { /* niente */ } });
  const ids = await page.evaluate(async () => {
    const { importaFile, P, B } = window.__dpvTest;
    const c = new OffscreenCanvas(640, 360); const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 640, 360);
    const [m] = await importaFile([{ name: 'pannello.png', file: new File([await c.convertToBlob({ type: 'image/png' })], 'pannello.png', { type: 'image/png' }) }], { chiediFormato: false });
    const p = window.__dpv.doc;
    const v = p.tracks.filter((t) => t.kind === 'video');
    const alta = v[0].id;
    let foto1, foto2, titolo, blocco;
    window.__dpv.edit('Prova pannello', (pp) => {
      const a = P.newClip('media', alta, 0, 100, { media: m.id, name: 'Foto A' });
      const b = P.newClip('media', alta, 120, 100, { media: m.id, name: 'Foto B' });
      const t = P.newClip('title', v[1]?.id ?? alta, 300, 100, { name: 'Un titolo', gen: { title: { ...P.TITLE0 } } });
      pp.clips.push(a, b, t);
      foto1 = a.id; foto2 = b.id; titolo = t.id;
      const bl = B.posaBlocco(pp, B.nuovoBlocco('effetto', 'sogno'), 130, 25, alta);
      blocco = bl.id;
    });
    return { foto1, foto2, titolo, blocco };
  });
  await page.evaluate(() => { const a = document.querySelector('#app'); a.classList.remove('senza-lato', 'stretto'); });
  const scegli = async (id) => { await page.evaluate((i) => window.__dpv.select([i]), id); await page.click('.lato .scheda[data-s=clip]').catch(() => {}); await page.waitForTimeout(450); };
  const gruppi = () => page.evaluate(() => [...document.querySelectorAll('.pp-pannello:not([hidden]) > .isp-gruppo')].map((d) => ({ g: d.dataset.g, aperto: d.open, titolo: d.querySelector('summary').textContent.replace('⠿', '').trim() })));

  await scegli(ids.foto1);
  const g0 = await gruppi();
  // nel Banco i numeri principali stanno sul vetrino: le sezioni della scheda QUADRO partono tutte chiuse
  prova('scegliendo una clip la scheda QUADRO mostra le sue sezioni, tutte chiuse', g0.length >= 3 && g0.every((x) => !x.aperto) && g0.some((x) => x.g === 'durata'), JSON.stringify(g0));
  prova('il vetrino ha X, Y, scala e ruota', (await page.locator('.pp-pannello:not([hidden]) .pp-vetrino .pp-num').count()) === 4);
  await page.screenshot({ path: path.join(OUT, 'pannello-chiuso.png') });

  // si apre una sezione e resta aperta anche scegliendo un'altra clip dello stesso tipo
  await page.click('.pp-pannello:not([hidden]) > .isp-gruppo[data-g="durata"] > summary');
  await page.waitForTimeout(200);
  await scegli(ids.foto2);
  const g1 = await gruppi();
  prova('una sezione aperta resta aperta passando a un\'altra clip; le altre restano chiuse', g1.find((x) => x.g === 'durata')?.aperto && g1.filter((x) => x.aperto).map((x) => x.g).join() === 'durata', JSON.stringify(g1));

  // il clic sulla maniglia non apre né chiude
  const prima = (await gruppi()).find((x) => x.g === 'immagine').aperto;
  await page.click('.isp-gruppo[data-g="immagine"] .isp-grip');
  prova('un clic sulla maniglia non apre né chiude la sezione', (await gruppi()).find((x) => x.g === 'immagine').aperto === prima);
  // la sezione aperta si richiude (e così le sezioni stanno tutte in vista per il trascinamento)
  await page.click('.pp-pannello:not([hidden]) > .isp-gruppo[data-g="durata"] > summary');
  await page.waitForTimeout(200);
  prova('una sezione aperta si richiude con un clic', !(await gruppi()).find((x) => x.g === 'durata').aperto);

  // si trascina "Durata e velocità" in cima
  const ordineDi = async () => (await gruppi()).map((x) => x.g);
  const prima2 = await ordineDi();
  const trascina = async (g, sopraA) => {
    const grip = await page.locator(`.isp-gruppo[data-g="${g}"] .isp-grip`).boundingBox();
    const meta = await page.locator(`.isp-gruppo[data-g="${sopraA}"]`).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y - 20, { steps: 4 });
    await page.mouse.move(grip.x + grip.width / 2, meta.y + 3, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  };
  await trascina('durata', prima2[0]);
  const dopo = await ordineDi();
  prova('trascinando la maniglia di "Durata e velocità" in cima, la sezione va per prima', dopo[0] === 'durata' && dopo.length === prima2.length && prima2.every((g) => dopo.includes(g)), JSON.stringify([prima2, dopo]));
  const salvato = await page.evaluate(() => JSON.parse(localStorage.getItem('dpv-isp-ordine') ?? '{}'));
  prova('l\'ordine è salvato per questo tipo di elemento e per questa scheda (clip:immagine:quadro)', salvato['clip:immagine:quadro']?.[0] === 'durata' && Object.keys(salvato).length === 1, JSON.stringify(salvato));
  prova('durante il trascinamento le sezioni chiuse sono rimaste chiuse', (await gruppi()).every((x) => !x.aperto));
  await page.screenshot({ path: path.join(OUT, 'pannello-riordinato.png') });

  // lo stesso ordine per ogni clip dello stesso tipo
  await scegli(ids.foto1);
  prova('scegliendo un\'altra clip dello stesso tipo l\'ordine è quello salvato', (await ordineDi())[0] === 'durata', JSON.stringify(await ordineDi()));
  // un altro tipo (titolo) ha il suo ordine, che non si è mosso
  await scegli(ids.titolo);
  const gt = await ordineDi();
  prova('un titolo ha il suo ordine, non toccato da quello delle immagini', gt.length >= 2 && gt[0] !== 'durata', JSON.stringify(gt));
  // un blocco FX ha il suo ordine, e si può riordinare anche lì
  await scegli(ids.blocco);
  const gb = await ordineDi();
  // le sezioni principali dei blocchi partono aperte e sono alte: si chiudono per averle tutte in vista
  await page.evaluate(() => document.querySelectorAll('.pp-pannello:not([hidden]) > .isp-gruppo[open] > summary').forEach((x) => x.click()));
  await page.waitForTimeout(250);
  if (gb.length >= 2) {
    await trascina(gb[gb.length - 1], gb[0]);
    const gb2 = await ordineDi();
    const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('dpv-isp-ordine') ?? '{}'));
    prova('anche i blocchi FX si riordinano, con il loro ordine salvato a parte', gb2[0] === gb[gb.length - 1] && !!s2['blocco:effetto'] && s2['clip:immagine:quadro'][0] === 'durata', JSON.stringify([gb, gb2, s2]));
  } else prova('i blocchi FX hanno almeno due sezioni', false, JSON.stringify(gb));

  // dopo aver riaperto il programma l'ordine c'è ancora
  await page.reload();
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1200);
  const rimasto = await page.evaluate(() => JSON.parse(localStorage.getItem('dpv-isp-ordine') ?? '{}'));
  prova('riaprendo il programma l\'ordine è ancora salvato', rimasto['clip:immagine:quadro']?.[0] === 'durata', JSON.stringify(rimasto));
  // (il progetto non c'è più dopo il ricaricamento: si rifà una clip per vedere l'ordine applicato)
  await page.evaluate(async () => {
    const { importaFile, P } = window.__dpvTest;
    const c = new OffscreenCanvas(640, 360); c.getContext('2d').fillRect(0, 0, 640, 360);
    const [m] = await importaFile([{ name: 'pannello2.png', file: new File([await c.convertToBlob({ type: 'image/png' })], 'pannello2.png', { type: 'image/png' }) }], { chiediFormato: false });
    const alta = window.__dpv.doc.tracks.filter((t) => t.kind === 'video')[0].id;
    window.__dpv.edit('Prova', (pp) => { const a = P.newClip('media', alta, 0, 100, { media: m.id, name: 'Foto C' }); pp.clips.push(a); window.__dpv.select([a.id]); });
  });
  await page.click('.lato .scheda[data-s=clip]').catch(() => {});
  await page.waitForTimeout(600);
  const dopoRiavvio = await ordineDi();
  prova('con una clip nuova, dopo il riavvio, le sezioni sono già nell\'ordine scelto', dopoRiavvio[0] === 'durata' && (await gruppi()).every((x) => !x.aperto), JSON.stringify(dopoRiavvio));

  // "Ordine di partenza" rimette tutto com'era
  const haBottone = await page.locator('.isp-ripristina').count();
  await page.click('.isp-ripristina');
  await page.waitForTimeout(500);
  const ripristinato = await ordineDi();
  const rim2 = await page.evaluate(() => JSON.parse(localStorage.getItem('dpv-isp-ordine') ?? '{}'));
  prova('"↺ Ordine di partenza" rimette le sezioni come all\'inizio per quel tipo (e si toglie dal salvataggio)', haBottone === 1 && ripristinato[0] !== 'durata' && !rim2['clip:immagine:quadro'], JSON.stringify([haBottone, ripristinato, rim2]));
  prova('nessun errore nella pagina del pannello', errori.length === 0, errori.slice(0, 3).join(' | '));
  await contesto.close();
}
