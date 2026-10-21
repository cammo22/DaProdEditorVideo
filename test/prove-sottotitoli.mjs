// Le prove della 1.5.6: i sottotitoli dalla timeline (scrivere sopra la riga SOTT, dividere, unire, spostare, i tasti),
// il file .vtt, le righe dell'AI messe in ordine e i sottotitoli scritti nel video.
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs sottotitoli`.
import { leggi } from './aiuti.mjs';

/** una pagina pulita (contesto nuovo) */
async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

const SOTTO = (righe) => ({ righe, nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' });

export async function proveSottotitoli({ page: paginaDi, prova }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  const doc = () => page.evaluate(() => window.__dpv.doc);
  const righe = async () => (await doc()).sottotitoli?.righe ?? [];
  const tasto = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(150); };
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Sottotitoli: le cose pure (file, ordine, spostamenti)');
    const pure = await page.evaluate(() => {
      const { SOT, P, V } = window.__dpvTest;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      p.sottotitoli = { righe: [
        { id: 'b', da: 100, a: 150, testo: 'Seconda <b>riga</b> & fine' },
        { id: 'a', da: 25, a: 75, testo: 'Prima\nriga' },
        { id: 'v', da: 200, a: 250, testo: '   ' },
      ], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' };
      const srt = SOT.creaSrt(p), vtt = SOT.creaVtt(p);
      // l'AI e i file: righe fuori ordine, una sopra l'altra, di sola punteggiatura, oltre la fine
      const sporche = [
        { id: '1', da: 50, a: 120, testo: 'Due' }, { id: '2', da: 0, a: 60, testo: 'Uno' }, { id: '3', da: 130, a: 131, testo: '...' },
        { id: '4', da: 140, a: 141, testo: 'Corta' }, { id: '5', da: 300, a: 400, testo: 'Oltre la fine' },
      ];
      const ok = SOT.sistemaRighe(sporche, 200);
      const rip = V.togliRipetizioni([1, 2, 3, 4, 5].map((i) => ({ da: i, a: i + 1, testo: i % 2 ? 'Grazie.' : ' grazie ' })).concat([{ da: 9, a: 10, testo: 'Ciao' }, { da: 11, a: 12, testo: 'Grazie.' }]));
      const dalleParole = V.righeDaPezzi([{ da: 0, a: 2, testo: ' Ciao a tutti ' }, { da: 2, a: 2.5, testo: '[Musica]' }, { da: 1.5, a: 1.8, testo: 'sovrapposta' }], p);
      // spostare insieme
      const s = { righe: [{ id: 'x', da: 10, a: 20, testo: 'x' }, { id: 'y', da: 30, a: 40, testo: 'y' }, { id: 'z', da: 50, a: 60, testo: 'z' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' };
      const dx = SOT.spostaRighe(s, new Set(['x', 'y']), 15);   // si ferma contro z: y arriva a 50 → max 10
      const x1 = s.righe.map((r) => [r.id, r.da, r.a].join(':')).join(',');
      const dy = SOT.spostaRighe(s, new Set(['x', 'y']), -100);  // si ferma allo zero
      const x2 = s.righe.map((r) => [r.id, r.da, r.a].join(':')).join(',');
      // dividere al cursore di scrittura
      const t = { righe: [{ id: 'q', da: 0, a: 100, testo: 'Buongiorno a tutti voi' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' };
      const nuova = SOT.dividiRiga(t, 'q', 40, 'Buongiorno a'.length);
      return { srt, vtt, ok: ok.map((r) => [r.da, r.a, r.testo].join(':')), rip: rip.map((r) => r.testo.trim()), dalleParole: dalleParole.map((r) => [r.da, r.a, r.testo].join(':')), dx, x1, dy, x2, div: t.righe.map((r) => [r.da, r.a, r.testo].join(':')), nuova };
    });
    prova('il .srt: in ordine, virgola nei millisecondi, solo le righe scritte', pure.srt === '1\n00:00:01,000 --> 00:00:03,000\nPrima\nriga\n\n2\n00:00:04,000 --> 00:00:06,000\nSeconda <b>riga</b> & fine\n', JSON.stringify(pure.srt));
    prova('il .vtt: intestazione WEBVTT, punto nei millisecondi, < > & protetti', pure.vtt === 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nPrima\nriga\n\n2\n00:00:04.000 --> 00:00:06.000\nSeconda &lt;b&gt;riga&lt;/b&gt; &amp; fine\n', JSON.stringify(pure.vtt));
    prova('righe sporche: in ordine, mai una sopra l\'altra, la punteggiatura e le righe oltre la fine via', pure.ok.join('|') === '0:50:Uno|50:120:Due|140:142:Corta', pure.ok.join('|'));
    prova('Whisper che si incanta: tre "Grazie" di fila diventano due, uno sparso resta', pure.rip.join('|') === 'Grazie.|grazie|Ciao|Grazie.', pure.rip.join('|'));
    prova('dalle parole: niente [Musica], mai sopra la vicina', pure.dalleParole.length >= 2 && !pure.dalleParole.some((r) => /musica/i.test(r)), pure.dalleParole.join('|'));
    prova('spostare più righe insieme: si fermano contro le altre e lo zero', pure.dx === 10 && pure.x1 === 'x:20:30,y:40:50,z:50:60' && pure.dy === -20 && pure.x2 === 'x:0:10,y:20:30,z:50:60', JSON.stringify([pure.dx, pure.x1, pure.dy, pure.x2]));
    prova('dividere dove sta il cursore di scrittura (non alla parola più vicina al tempo)', pure.div.join('|') === '0:40:Buongiorno a|40:100:tutti voi' && !!pure.nuova, pure.div.join('|'));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Sottotitoli: la riga SOTT, anche vuota, e scrivere sopra la timeline');
    await page.evaluate(() => {
      const { P } = window.__dpvTest;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v = p.tracks.find((t) => t.kind === 'video').id;
      p.clips.push(P.newClip('color', v, 0, 400, { gen: { color: '#e8e8e8' } }));
      window.__dpv.load(p);
      window.__dpv.setHead(0);
    });
    await page.waitForTimeout(400);
    prova('senza righe la riga SOTT non c\'è', (await page.locator('.tl-testata.sott').count()) === 0);
    await page.keyboard.press('Control+k');
    await page.fill('.cerca-input', 'sottotitoli');
    await page.waitForTimeout(250);
    const voci = await page.locator('.cerca-voce').allTextContents();
    prova('Ctrl+K trova i comandi dei sottotitoli (genera, nuovo, .vtt…)', voci.join('|').toLowerCase().includes('vtt') && voci.join('|').toLowerCase().includes('con l\'ai'), voci.slice(0, 6).join(' | '));
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('.tl-tela').focus());
    await page.evaluate(() => window.__dpvTest.ui().tl.sporca());
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('dpv:sott', { detail: 'mostra' })); });
    await page.waitForTimeout(300);
    prova('"Mostra la riga dei sottotitoli" la fa comparire anche vuota', (await page.locator('.tl-testata.sott').count()) === 1);

    // Alt+N: riga nuova al cursore e l'editor si apre subito sulla timeline
    await page.evaluate(() => { document.querySelector('.tl-tela').focus(); window.__dpv.setHead(50); });
    await tasto('Alt+n');
    prova('Alt+N mette una riga di 2,5 s al cursore e apre il testo sulla timeline', (await righe()).length === 1 && (await righe())[0].da === 50 && (await righe())[0].a === 113 && (await page.locator('.tl-sott-editor').count()) === 1, JSON.stringify(await righe()));
    await page.keyboard.type('Buongiorno Napoli');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    prova('Invio conferma il testo e chiude l\'editor', (await righe())[0].testo === 'Buongiorno Napoli' && (await page.locator('.tl-sott-editor').count()) === 0);
    prova('il testo è una modifica sola che si annulla con Ctrl+Z', await (async () => { await page.evaluate(() => document.querySelector('.tl-tela').focus()); await tasto('Control+z'); const t = (await righe())[0]?.testo; await tasto('Control+y'); return t === '' && (await righe())[0].testo === 'Buongiorno Napoli'; })());

    // Maiusc+Invio va a capo; Esc butta le modifiche
    await page.evaluate(() => document.querySelector('.tl-tela').focus());
    await tasto('F2');
    prova('F2 riapre il testo della riga sotto il cursore', (await page.locator('.tl-sott-editor').count()) === 1 && (await page.inputValue('.tl-sott-editor')) === 'Buongiorno Napoli');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('e provincia');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    prova('Esc butta quello che hai scritto', (await righe())[0].testo === 'Buongiorno Napoli' && (await page.locator('.tl-sott-editor').count()) === 0);
    await tasto('F2');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('e provincia');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    prova('Maiusc+Invio va a capo: due righe insieme nello stesso sottotitolo', (await righe())[0].testo === 'Buongiorno Napoli\ne provincia', JSON.stringify((await righe())[0]));

    // Ctrl+Invio: divide dove sta il cursore di scrittura e continua con la seconda parte
    await page.evaluate(() => { document.querySelector('.tl-tela').focus(); window.__dpv.setHead(1000); });
    await tasto('F2');
    await page.evaluate(() => { const t = document.querySelector('.tl-sott-editor'); t.value = 'Prima parte seconda parte'; t.setSelectionRange(11, 11); });
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(250);
    let r = await righe();
    prova('Ctrl+Invio divide la riga al punto di scrittura e apre la seconda parte', r.length === 2 && r[0].testo === 'Prima parte' && r[1].testo === 'seconda parte' && r[0].a === r[1].da && (await page.locator('.tl-sott-editor').count()) === 1 && (await page.inputValue('.tl-sott-editor')) === 'seconda parte', JSON.stringify(r));
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(200);
    prova('Maiusc+Tab passa alla riga prima', (await page.locator('.tl-sott-editor').count()) === 1 && (await page.inputValue('.tl-sott-editor')) === 'Prima parte');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    prova('Tab passa alla riga dopo, col cursore del montaggio sul suo inizio', (await page.inputValue('.tl-sott-editor')) === 'seconda parte' && (await page.evaluate(() => Math.round(window.__dpv.head))) === r[1].da);
    await page.keyboard.press('Escape');

    // unire e dividere con la tastiera, andare avanti e indietro
    r = await righe();
    await page.evaluate((f) => window.__dpv.setHead(f), r[0].da + 3);
    await tasto('Alt+PageDown');
    prova('Alt+PageDown va al sottotitolo dopo', (await page.evaluate(() => Math.round(window.__dpv.head))) === r[1].da);
    await tasto('Alt+PageUp');
    prova('Alt+PageUp torna a quello prima', (await page.evaluate(() => Math.round(window.__dpv.head))) === r[0].da);
    await page.evaluate((f) => window.__dpv.setHead(f), r[0].da + 5);
    await tasto('Alt+s');
    r = await righe();
    prova('Alt+S divide il sottotitolo sotto il cursore', r.length === 3 && r[1].da === r[0].a, JSON.stringify(r.map((x) => [x.da, x.a, x.testo])));
    await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; tl.selSott = new Set(window.__dpv.doc.sottotitoli.righe.map((x) => x.id)); tl.sporca(); });
    await tasto('Alt+j');
    r = await righe();
    prova('Alt+J unisce le righe scelte in una sola (appaiono insieme)', r.length === 1 && r[0].testo.includes('Prima') && r[0].testo.includes('seconda parte'), JSON.stringify(r));

    // doppio clic sulla riga: l'editor compare sopra la timeline; un clic fuori conferma
    const pos = await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; tl.righe(window.__dpv.doc); const r = window.__dpv.doc.sottotitoli.righe[0]; return { x: tl.fX((r.da + r.a) / 2), y: tl.rigaSott.y + tl.rigaSott.h / 2 }; });
    const box = await page.locator('.tl-tela').boundingBox();
    await page.mouse.dblclick(box.x + pos.x, box.y + pos.y);
    await page.waitForTimeout(250);
    prova('doppio clic sulla riga SOTT apre il testo sulla timeline (non un dialogo)', (await page.locator('.tl-sott-editor').count()) === 1 && (await page.locator('.velo').count()) === 0);
    const eb = await page.locator('.tl-sott-editor').boundingBox();
    prova('l\'editor sta dentro la timeline', eb.x >= box.x - 1 && eb.x + eb.width <= box.x + box.width + 1 && eb.y >= box.y - 1 && eb.y + eb.height <= box.y + box.height + 1, JSON.stringify([eb, box]));
    await page.fill('.tl-sott-editor', 'Testo cambiato');
    await page.mouse.click(box.x + 20, box.y + 6);
    await page.waitForTimeout(250);
    prova('un clic fuori conferma il testo', (await righe())[0].testo === 'Testo cambiato' && (await page.locator('.tl-sott-editor').count()) === 0, JSON.stringify(await righe()));

    // trascinare un bordo cambia il tempo, Canc toglie
    r = await righe();
    const bordo = await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; const r = window.__dpv.doc.sottotitoli.righe[0]; return { x: tl.fX(r.a) - 2, y: tl.rigaSott.y + tl.rigaSott.h / 2, ppf: tl.ppf }; });
    await page.mouse.move(box.x + bordo.x, box.y + bordo.y);
    await page.mouse.down();
    await page.mouse.move(box.x + bordo.x + 10 * bordo.ppf, box.y + bordo.y, { steps: 5 });
    await page.mouse.up();
    prova('tirando il bordo destro la riga si allunga', (await righe())[0].a > r[0].a, JSON.stringify([r[0], (await righe())[0]]));
    await page.evaluate(() => document.querySelector('.tl-tela').focus());
    await tasto('Delete');
    prova('Canc toglie la riga scelta', (await righe()).length === 0);

    // ———————————————————————————————————————————————————————————
    console.log('▶ Sottotitoli: il file .vtt, l\'importazione e il testo scritto nel video');
    await page.evaluate(() => window.__dpv.edit('sott', (p) => { p.name = 'Prova'; p.sottotitoli = { righe: [{ id: 'a', da: 25, a: 75, testo: 'Ciao Napoli' }, { id: 'b', da: 100, a: 150, testo: 'Seconda riga' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' }; }));
    await page.waitForTimeout(200);
    const scarico = page.waitForEvent('download');
    // il comando passa dalla ricerca Ctrl+K (stesso percorso dei menu)
    await page.keyboard.press('Control+k');
    await page.fill('.cerca-input', 'vtt');
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
    const dl = await scarico;
    const testoVtt = (await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8'));
    prova('il comando "Esporta .vtt" scarica un WebVTT con le due righe', dl.suggestedFilename().endsWith('_it.vtt') && testoVtt.startsWith('WEBVTT') && testoVtt.includes('00:00:01.000 --> 00:00:03.000') && testoVtt.includes('Seconda riga'), dl.suggestedFilename() + ' ' + JSON.stringify(testoVtt));
    const dentro = await page.evaluate((t) => window.__dpvTest.SOT.leggiSrt(t, window.__dpv.doc).map((x) => [x.da, x.a, x.testo].join(':')).join('|'), testoVtt);
    prova('il .vtt si rilegge identico (andata e ritorno)', dentro === '25:75:Ciao Napoli|100:150:Seconda riga', dentro);

    // scritti nel video: la fascia scura in basso (e niente se si spegne l'occhio)
    await page.evaluate(() => { document.querySelector('.tl-tela').focus(); window.__dpv.setHead(40); window.__dpvTest.motore.setMonitor?.('recorder'); });
    await page.waitForTimeout(300);
    const [conTesto] = await leggi(page, [[32, 33]]);
    await page.evaluate(() => window.__dpv.edit('fuori', (p) => { p.sottotitoli.nelVideo = false; }));
    const [senza] = await leggi(page, [[32, 33]]);
    await page.evaluate(() => window.__dpv.edit('dentro', (p) => { p.sottotitoli.nelVideo = true; }));
    prova('i sottotitoli "nel video" scuriscono il fondo in basso, spenti no', conTesto[0] < senza[0] - 25, JSON.stringify({ conTesto, senza }));

    prova('nessun errore nella console durante le prove dei sottotitoli', errori.length === 0, errori.slice(0, 4).join(' | '));
  } finally {
    await contesto.close();
  }
}
