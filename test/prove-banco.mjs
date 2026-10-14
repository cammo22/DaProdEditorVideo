// Le prove della 1.3.2: la barra del titolo bianca con le cose rapide, la testata alleggerita e il telecomando di LIVE
// (quasi quadrato, con l'anteprima di quello che si registra, pausa, segno, ferma).
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs banco`.

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

export async function proveBanco({ page: paginaDi, prova, OUT }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Banco: la barra del titolo bianca con le cose rapide');
    const b = await page.evaluate(() => {
      const barra = document.querySelector('.barra-titolo');
      const r = barra.getBoundingClientRect();
      const testa = document.querySelector('.testata');
      return {
        sopra: barra.nextElementSibling?.id === 'app' && r.top === 0,
        bianca: getComputedStyle(barra).backgroundColor,
        rapidi: ['.marchio', '.btn-progetti', '.nome-progetto', '.btn-cerca'].every((s) => barra.querySelector(s)),
        trascina: barra.getAttribute('data-tauri-drag-region'),
        tastiFinestra: !!barra.querySelector('.bt-finestra'),
        finestra: document.documentElement.dataset.finestra,
        // nella testata restano menu, AI, pagine ed Esporta
        testata: { menu: !!testa.querySelector('.menu'), pagine: testa.querySelectorAll('.pagina-btn').length, esporta: !!testa.querySelector('.btn.primario'), vecchi: !!testa.querySelector('.marchio, .btn-progetti, .nome-progetto, .btn-cerca') },
      };
    });
    prova('la barra del titolo sta sopra al banco, è bianca e ha marchio, progetti, nome e ricerca', b.sopra && b.bianca === 'rgb(255, 255, 255)' && b.rapidi && b.trascina === 'deep', JSON.stringify(b));
    prova('nel browser niente tasti della finestra (li ha il browser)', b.finestra === 'web' && !b.tastiFinestra, JSON.stringify(b));
    prova('la testata tiene solo menu, AI, le quattro pagine ed Esporta', b.testata.menu && b.testata.pagine === 4 && b.testata.esporta && !b.testata.vecchi, JSON.stringify(b.testata));

    // annulla e ripeti dalla barra, il nome col puntino delle modifiche e il titolo della finestra
    const u0 = await page.evaluate(() => ({ annulla: document.querySelector('.bt-annulla').disabled }));
    await page.evaluate(() => { const { P } = window.__dpvTest; window.__dpv.edit('Colore di prova', (p) => { const v = p.tracks.find((t) => t.kind === 'video'); p.clips.push(P.newClip('color', v.id, 0, 50, { gen: { color: '#335577' } })); }); });
    await page.waitForTimeout(150);
    const u1 = await page.evaluate(() => { const a = document.querySelector('.bt-annulla'), r = document.querySelector('.bt-ripeti'); return { annulla: a.disabled, titolo: a.title, ripeti: r.disabled, punto: !!document.querySelector('.barra-titolo .punto-modifica'), doc: document.title }; });
    await page.click('.bt-annulla');
    await page.waitForFunction(() => !document.querySelector('.bt-ripeti').disabled, null, { timeout: 2000 }).catch(() => {});
    const u2 = await page.evaluate(() => ({ clip: window.__dpv.doc.clips.length, ripeti: document.querySelector('.bt-ripeti').disabled, puo: window.__dpv.canRedo(), att: document.activeElement?.className }));
    prova('annulla e ripeti nella barra: si accendono con le modifiche, dicono cosa annullano e funzionano', u0.annulla && !u1.annulla && /Colore di prova/.test(u1.titolo) && u1.punto && /^● /.test(u1.doc) && u2.clip === 0 && !u2.ripeti, JSON.stringify({ u0, u1, u2 }));

    // a ogni larghezza niente trabocca ed Esporta si vede
    const misure = [];
    for (const w of [1920, 1440, 1280, 1024]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(120);
      misure.push(await page.evaluate((w) => {
        const tr = (s) => { const e = document.querySelector(s); return e.scrollWidth > e.clientWidth + 1; };
        const e = document.querySelector('.testata .btn.primario').getBoundingClientRect();
        const c = document.querySelector('.barra-titolo .btn-cerca').getBoundingClientRect();
        return { w, barra: tr('.barra-titolo'), testata: tr('.testata'), esporta: e.right <= w && e.width > 0, cerca: c.right <= w && c.width > 0 };
      }, w));
    }
    await page.setViewportSize({ width: 1600, height: 950 });
    prova('da 1920 a 1024 pixel barra e testata non traboccano, Esporta e Cerca si vedono', misure.every((m) => !m.barra && !m.testata && m.esporta && m.cerca), JSON.stringify(misure));
    await page.screenshot({ path: `${OUT}/barra-titolo.png`, clip: { x: 0, y: 0, width: 1600, height: 90 } });

    // ———————————————————————————————————————————————————————————
    console.log('▶ Banco: il telecomando di LIVE');
    await page.evaluate(() => {
      window.__dpvTest.LV.impostaSorgenteLive(async () => {
        const c = document.createElement('canvas'); c.width = 640; c.height = 360; c.className = 'tela-live-prova';
        c.style.cssText = 'position:fixed;left:0;bottom:0;width:64px;height:36px;z-index:9999;pointer-events:none';
        document.body.append(c);
        const x = c.getContext('2d'); let n = 0;
        window.__giroLive = setInterval(() => { n++; x.fillStyle = `hsl(${n * 4 % 360} 70% 45%)`; x.fillRect(0, 0, 640, 360); }, 33);
        return c.captureStream(30);
      }, async () => { const ctx = new AudioContext(); const o = ctx.createOscillator(); const d = ctx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; });
      const live = window.__dpvTest.ui().live;
      live.opz.conto = false; live.opz.cam = false; live.opz.finestre = false; live.opz.timeline = false;
    });
    await page.click('.pagina-btn[data-p=live]');
    await page.click('.live-btn.reg');
    await page.waitForFunction(() => document.querySelector('.live').classList.contains('in-onda'), null, { timeout: 8000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__dpvTest.ui().live.telecomandoNellaPagina(true));
    await page.waitForTimeout(500);
    const t1 = await page.evaluate(() => {
      const m = document.querySelector('.live-mini');
      const r = m.getBoundingClientRect();
      const v = m.querySelector('.tele-video');
      const app = document.getElementById('app');
      return { su: m.classList.contains('su'), solo: getComputedStyle(app).display === 'none' && getComputedStyle(document.querySelector('.barra-titolo')).display === 'none', inOnda: m.classList.contains('in-onda'), spia: m.querySelector('.tele-spia').textContent, anteprima: !!v.srcObject, va: v.videoWidth > 0, w: r.width, h: r.height };
    });
    prova('il telecomando occupa la finestra (il resto si nasconde) e fa vedere quello che registri', t1.su && t1.solo && t1.inOnda && t1.spia === 'REC' && t1.anteprima && t1.va, JSON.stringify(t1));
    // la finestra piccola dell'app è quasi quadrata: qui la si fa grande uguale e si guarda che tutto ci stia
    await page.setViewportSize({ width: 360, height: 420 });
    await page.waitForTimeout(200);
    const dentro = await page.evaluate(() => [...document.querySelectorAll('.live-mini button, .tele-quadro')].every((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }));
    const quadro = await page.evaluate(() => document.querySelector('.tele-quadro').getBoundingClientRect().height);
    await page.screenshot({ path: `${OUT}/telecomando.png` });
    prova('a 360×420 (la misura del telecomando) tasti e anteprima ci stanno tutti, e l\'anteprima è grande', dentro && quadro >= 150, JSON.stringify({ dentro, quadro }));

    // pausa e ripresa, segno, anteprima spenta e riaccesa, tutto dal telecomando
    await page.click('.live-mini .tele-grande');
    await page.waitForTimeout(400);
    const p1 = await page.evaluate(() => ({ live: document.querySelector('.live').classList.contains('in-pausa'), tele: document.querySelector('.live-mini').classList.contains('in-pausa'), spia: document.querySelector('.tele-spia').textContent, scritta: getComputedStyle(document.querySelector('.tele-pausa-scritta')).display, tasto: document.querySelector('.tele-grande').textContent }));
    await page.click('.live-mini .tele-grande');
    await page.waitForTimeout(400);
    await page.click('.live-mini .live-btn.segna');
    await page.waitForTimeout(150);
    const p2 = await page.evaluate(() => ({ pausa: document.querySelector('.live').classList.contains('in-pausa'), segni: document.querySelector('.tele-segni').textContent }));
    prova('dal telecomando: PAUSA mette in pausa (scritta sull\'anteprima), RIPRENDI riparte, SEGNA conta i segni', p1.live && p1.tele && p1.spia === 'PAUSA' && p1.scritta !== 'none' && /RIPRENDI/.test(p1.tasto) && !p2.pausa && p2.segni === '⚑ 1', JSON.stringify({ p1, p2 }));
    await page.click('.tele-quadro');
    await page.waitForTimeout(150);
    const s1 = await page.evaluate(() => ({ spenta: document.querySelector('.tele-quadro').classList.contains('spenta'), video: !!document.querySelector('.tele-video').srcObject, salvata: localStorage.getItem('dpv-tele-anteprima') }));
    await page.click('.tele-quadro');
    await page.waitForTimeout(150);
    const s2 = await page.evaluate(() => ({ spenta: document.querySelector('.tele-quadro').classList.contains('spenta'), video: !!document.querySelector('.tele-video').srcObject }));
    prova('un clic sull\'anteprima la spegne (si ricorda) e un altro la riaccende', s1.spenta && !s1.video && s1.salvata === 'no' && !s2.spenta && s2.video, JSON.stringify({ s1, s2 }));
    // i tasti di LIVE valgono anche col telecomando aperto
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const tastoSpazio = await page.evaluate(() => document.querySelector('.live-mini').classList.contains('in-pausa'));
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    prova('Spazio mette in pausa anche dal telecomando', tastoSpazio);

    // FERMA dal telecomando: la registrazione finisce nel contenitore e la pagina torna com'era
    await page.setViewportSize({ width: 1600, height: 950 });
    const nm = await page.evaluate(() => window.__dpv.doc.media.length);
    await page.click('.live-mini .live-btn.ferma');
    await page.evaluate(() => window.__dpvTest.ui().live.ultima);
    await page.waitForTimeout(300);
    const f1 = await page.evaluate((nm) => ({ media: window.__dpv.doc.media.length - nm, mini: document.documentElement.classList.contains('mini-live'), su: document.querySelector('.live-mini').classList.contains('su'), app: getComputedStyle(document.getElementById('app')).display !== 'none', video: !!document.querySelector('.tele-video').srcObject }), nm);
    prova('FERMA dal telecomando: la registrazione va nel contenitore e il banco torna intero', f1.media >= 1 && !f1.mini && !f1.su && f1.app && !f1.video, JSON.stringify(f1));
    await page.evaluate(() => { clearInterval(window.__giroLive); document.querySelector('.tela-live-prova')?.remove(); });
    prova('nessun errore nella pagina (barra e telecomando)', errori.length === 0, errori.slice(0, 4).join(' | '));
  } finally {
    await contesto.close();
  }
}
