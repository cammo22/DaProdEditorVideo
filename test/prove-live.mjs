// Le prove della 1.5.1 su LIVE e sul banco: la webcam si accende e si spegne anche mentre si registra (ogni stretto è un file
// suo, al suo posto in timeline), la colonna dei comandi più larga, la barra sul monitor sottile, lo zoom della timeline che
// non ingrandisce tutta l'interfaccia.
//   npm run build && node test/prove-nuove.mjs live

async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text()) && !/Failed to load resource|VideoFrame was garbage collected/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

export async function proveLive({ page: paginaDi, prova, OUT }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    console.log('▶ LIVE: la webcam si accende e si spegne anche mentre registri');
    await page.evaluate(() => {
      const tela = (w, hh, fn) => {
        const c = document.createElement('canvas'); c.width = w; c.height = hh;
        c.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:18px;z-index:9999;pointer-events:none';
        document.body.append(c);
        const x = c.getContext('2d'); let n = 0;
        window.__giri = [...(window.__giri || []), setInterval(() => { n++; fn(x, n); }, 33)];
        return c.captureStream(30);
      };
      window.__dpvTest.LV.impostaSorgenteLive(
        async () => tela(1280, 720, (x, n) => { x.fillStyle = '#e9eef6'; x.fillRect(0, 0, 1280, 720); x.fillStyle = `hsl(${n * 4 % 360} 70% 50%)`; x.fillRect(80 + (n * 6) % 900, 300, 200, 200); }),
        async () => { const ctx = new AudioContext(); const o = ctx.createOscillator(); const d = ctx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; },
        async () => tela(640, 360, (x, n) => { x.fillStyle = '#6b4f3a'; x.fillRect(0, 0, 640, 360); x.fillStyle = '#f2c9a0'; x.beginPath(); x.arc(320, 170 + Math.sin(n / 5) * 8, 90, 0, 7); x.fill(); }),
      );
      const live = window.__dpvTest.ui().live;
      live.opz.conto = false; live.opz.cam = false; live.opz.finestre = false; live.opz.timeline = true; live.opz.separato = true;
    });
    await page.click('.pagina-btn[data-p=live]');
    await page.waitForTimeout(400);

    // la colonna dei comandi è stretta e compatta (300-340 px) e non scorre di lato
    const col = await page.evaluate(() => { const c = document.querySelector('.live-comandi'); return { w: Math.round(c.getBoundingClientRect().width), scrollX: c.scrollWidth > c.clientWidth + 1 }; });
    prova('la colonna dei comandi di LIVE è compatta (300-340 px a 1600 di larghezza) e non scorre di lato', col.w >= 300 && col.w <= 341 && !col.scrollX, JSON.stringify(col));

    // prima di registrare: il tasto WEBCAM e il tasto C accendono e spengono
    const stato = () => page.evaluate(() => ({ opz: window.__dpvTest.ui().live.opz.cam, anteprima: document.querySelector('.live').classList.contains('con-cam'), tasto: document.querySelector('.live-btn.cam').classList.contains('acceso'), interruttore: [...document.querySelectorAll('.live .fin-interruttore')].find((e) => /Webcam/.test(e.textContent))?.classList.contains('acceso') }));
    await page.click('.live-btn.cam');
    await page.waitForTimeout(500);
    const a1 = await stato();
    await page.keyboard.press('c');
    await page.waitForTimeout(400);
    const a2 = await stato();
    await page.keyboard.press('c');
    await page.waitForTimeout(500);
    const a3 = await stato();
    prova('il tasto WEBCAM accende la webcam (anteprima nell\'angolo), il tasto C la spegne e la riaccende', a1.opz && a1.anteprima && a1.tasto && a1.interruttore && !a2.opz && !a2.anteprima && !a2.tasto && a3.opz && a3.anteprima && a3.tasto, JSON.stringify({ a1, a2, a3 }));

    // mentre registri: accesa 1,5 s → spenta 1,5 s → riaccesa 1,5 s
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('.live').classList.contains('in-onda'), null, { timeout: 12000 });
    await page.waitForTimeout(1600);
    await page.keyboard.press('c');
    await page.waitForTimeout(400);
    const spenta = await stato();
    const testoSpenta = await page.evaluate(() => document.querySelector('.live-stato').textContent);
    await page.waitForTimeout(1500);
    await page.keyboard.press('c');
    await page.waitForTimeout(1700);
    const riaccesa = await stato();
    await page.screenshot({ path: `${OUT}/live-webcam-acceso-spento.png` });
    await page.keyboard.press('f');
    await page.evaluate(() => window.__dpvTest.ui().live.ultima);
    await page.waitForTimeout(500);
    // finita la registrazione si va dritti al Montaggio (e a fine registrazione le risorse tornano a zero)
    const dopo = await page.evaluate(() => ({ pagina: document.getElementById('app').dataset.pagina, reg: document.querySelector('.live-btn.reg')?.textContent }));
    prova('a fine registrazione si va dritti al Montaggio', dopo.pagina === 'montaggio', JSON.stringify(dopo));
    await page.click('.pagina-btn[data-p=live]');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const d = window.__dpv.doc;
      const cams = d.media.filter((m) => /webcam/.test(m.name));
      const tr = (c) => d.tracks.find((t) => t.id === c.track);
      const cc = d.clips.filter((c) => cams.some((m) => m.id === c.media)).sort((a, b) => a.start - b.start);
      const sch = d.clips.find((c) => tr(c)?.kind === 'video' && !cams.some((m) => m.id === c.media) && c.kind === 'media');
      return { cams: cams.map((m) => m.name), n: cc.length, stessaTraccia: new Set(cc.map((c) => c.track)).size === 1, start: cc.map((c) => c.start), len: cc.map((c) => c.len), schermo: sch && { start: sch.start, len: sch.len }, fps: d.rate.num / d.rate.den };
    });
    prova('spenta mentre registri: l\'anteprima sparisce e lo dice ("Webcam spenta"); riaccesa torna', !spenta.opz && !spenta.anteprima && /spenta/i.test(testoSpenta) && riaccesa.opz && riaccesa.anteprima, JSON.stringify({ spenta, testoSpenta, riaccesa }));
    prova('la registrazione ha due file della webcam (uno per ogni volta che è stata accesa), sulla stessa traccia', r.cams.length === 2 && r.n === 2 && r.stessaTraccia, JSON.stringify(r));
    const buco = r.n === 2 ? (r.start[1] - (r.start[0] + r.len[0])) / r.fps : 0;
    prova('fra i due pezzi c\'è il buco di quando era spenta (circa 1,5 secondi) e il secondo parte dopo il primo, dentro lo schermo', buco > 0.8 && buco < 3 && r.n === 2 && r.start[1] + r.len[1] <= r.schermo.start + r.schermo.len + 2, JSON.stringify({ buco, r }));

    // una webcam sempre accesa resta un file solo (come prima)
    await page.evaluate(() => { const live = window.__dpvTest.ui().live; live.opz.cam = true; });
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('.live').classList.contains('in-onda'), null, { timeout: 12000 });
    await page.waitForTimeout(1800);
    await page.keyboard.press('f');
    await page.evaluate(() => window.__dpvTest.ui().live.ultima);
    await page.waitForFunction(() => window.__dpv.doc.media.filter((m) => /webcam/.test(m.name)).length >= 3, null, { timeout: 15000 }).catch(() => {});
    await page.click('.pagina-btn[data-p=live]');
    await page.waitForTimeout(300);
    const una = await page.evaluate(() => {
      const d = window.__dpv.doc;
      const ultimi = d.media.filter((m) => /webcam/.test(m.name));
      return { tot: ultimi.length, nomi: ultimi.map((m) => m.name) };
    });
    prova('con la webcam sempre accesa la registrazione dopo ha un solo file della webcam (tre in tutto: i due di prima e uno)', una.tot === 3, JSON.stringify(una));

    // la webcam che non si apre: l'errore è in parole (con il nome tecnico), si riprova senza la scelta vecchia e con richieste semplici
    const errW = await page.evaluate(async () => {
      const live = window.__dpvTest.ui().live;
      window.__dpvTest.LV.impostaSorgenteLive(null, null, null);
      const veri = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const out = {};
      const chiama = [];
      // 1) un indirizzo vecchio (scheda o webcam cambiate, OBS…): la prima richiesta sbaglia, la seconda senza indirizzo va
      navigator.mediaDevices.getUserMedia = async (c) => {
        chiama.push(JSON.stringify(c.video?.deviceId ?? (c.video === true ? 'true' : 'senza')));
        if (c.video?.deviceId) throw new DOMException('Requested device not found', 'OverconstrainedError');
        const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; cv.getContext('2d').fillRect(0, 0, 10, 10);
        return cv.captureStream(15);
      };
      live.chiudiCam();
      live.opz.camId = 'vecchio-indirizzo'; live.opz.cam = true;
      const s = await live.apriCam();
      out.vecchio = { ok: !!s, chiama, camId: live.opz.camId };
      live.chiudiCam();
      // 2) webcam usata da un altro programma: il messaggio lo dice e dà il nome dell'errore
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Could not start video source', 'NotReadableError'); };
      live.opz.cam = true;
      const r = await live.apriCam();
      out.occupata = { r, cam: live.opz.cam, avviso: [...document.querySelectorAll('.avviso, .toast')].map((x) => x.textContent).join(' | ') };
      // 3) permesso negato: non riprova a vuoto
      let n = 0;
      navigator.mediaDevices.getUserMedia = async () => { n++; throw new DOMException('Permission denied', 'NotAllowedError'); };
      live.opz.cam = true;
      await live.apriCam();
      out.negato = { chiamate: n, avviso: [...document.querySelectorAll('.avviso, .toast')].map((x) => x.textContent).join(' | ') };
      navigator.mediaDevices.getUserMedia = veri;
      live.opz.cam = false; live.chiudiCam();
      return out;
    });
    prova('webcam: un indirizzo vecchio non blocca (si riprova senza e si dimentica)', errW.vecchio.ok && errW.vecchio.chiama.length === 2 && errW.vecchio.camId === '', JSON.stringify(errW.vecchio));
    prova('webcam usata da un altro programma: l\'avviso lo dice in italiano, con il nome tecnico dell\'errore, e la webcam resta spenta', errW.occupata.r === null && errW.occupata.cam === false && /usata da un altro programma/.test(errW.occupata.avviso) && /NotReadableError/.test(errW.occupata.avviso), JSON.stringify(errW.occupata));
    prova('webcam con permesso negato: una richiesta sola e l\'avviso spiega dove dare il permesso', errW.negato.chiamate === 1 && /permesso/.test(errW.negato.avviso) && /NotAllowedError/.test(errW.negato.avviso), JSON.stringify(errW.negato));

    // niente più filtri audio nella pagina
    const senzaFiltri = await page.evaluate(() => ({ filtri: document.querySelectorAll('.la, [data-filtro], .la-presetvoce').length, barre: document.querySelectorAll('.live-regia .live-sorgenti .la-misura').length }));
    prova('nella pagina LIVE non ci sono più i filtri audio (restano le barre dei livelli)', senzaFiltri.filtri === 0 && senzaFiltri.barre === 2, JSON.stringify(senzaFiltri));
    await page.evaluate(() => { for (const i of window.__giri ?? []) clearInterval(i); });

    // la pagina LIVE: barra in alto, anteprima grande a sinistra, colonna stretta a destra, niente timeline
    await page.click('.pagina-btn[data-p=live]');
    await page.waitForTimeout(300);
    const lay = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const c = r('.live-comandi'), sc = r('.live-schermo'), st = r('.stato'), ba = r('.live-barra'), tl = document.querySelector('.timeline');
      const rec = document.querySelector('.live-btn.reg');
      return { comandi: c && { top: Math.round(c.top), bottom: Math.round(c.bottom), left: Math.round(c.left) }, schermo: sc && { right: Math.round(sc.right), w: Math.round(sc.width), h: Math.round(sc.height) }, barra: ba && { top: Math.round(ba.top), h: Math.round(ba.height) }, stato: st && Math.round(st.top), tl: tl ? getComputedStyle(tl).display : 'assente', rec: rec && { h: Math.round(rec.getBoundingClientRect().height), sfondo: getComputedStyle(rec).backgroundColor }, ombra: getComputedStyle(document.querySelector('.live-schermo')).boxShadow };
    });
    prova('LIVE: barra in alto, anteprima grande, colonna a destra fino in fondo, niente timeline, REC da 44 px, nessun riquadro rosso', lay.comandi.bottom >= lay.stato - 2 && lay.comandi.left >= lay.schermo.right && lay.schermo.w > 900 && lay.barra.h >= 60 && lay.tl === 'none' && lay.rec.h >= 44 && lay.ombra === 'none', JSON.stringify(lay));
    const fonti = await page.evaluate(() => [...document.querySelectorAll('.live-barra .live-sorg')].map((e) => ({ chi: e.dataset.chi, stato: e.querySelector('.spia')?.dataset.stato })));
    prova('la barra ha tre fonti (schermo, webcam, microfono) con la spia', fonti.length === 3 && fonti.every((f) => ['spenta', 'pronta', 'rec'].includes(f.stato)), JSON.stringify(fonti));
    const risorse = await page.evaluate(() => { const r = globalThis.__dpvRisorse; return r ? r.perdite({ video: 99 }) : null; });
    prova('a registrazione finita LIVE non lascia aperti registratori, contesti audio o intervalli (solo in sviluppo: con il build di produzione il contatore non è attivo)', risorse === null || risorse.filter((x) => /registratore|audio|intervallo|worker|tela/.test(x)).length === 0, JSON.stringify(risorse));

    // ——— il banco ———
    console.log('▶ Banco: barra sul monitor sottile, zoom della timeline');
    await page.click('.pagina-btn[data-p=montaggio]');
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
      const { P, importaFile, ripresaDiProva } = window.__dpvTest;
      const p = P.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
      window.__dpv.load(p);
      const b = await ripresaDiProva(3, 25);
      const [m] = await importaFile([{ name: 'Prova.webm', file: new File([await b.arrayBuffer()], 'Prova.webm', { type: 'video/webm' }) }], { chiediFormato: false });
      let cid = '';
      window.__dpv.edit('clip', (pp) => { const v = pp.tracks.filter((t) => t.kind === 'video')[0].id; const c = P.newClip('media', v, 0, 75, { media: m.id, name: m.name }); pp.clips.push(c); cid = c.id; });
      window.__dpv.select([cid]);
      window.__motore.vaiA(10);
    });
    await page.waitForTimeout(1500);
    const bolla = await page.evaluate(() => {
      const b = document.querySelector('.pos-barra');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const figli = [...b.children].filter((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).display !== 'none');
      const tops = figli.map((x) => Math.round(x.getBoundingClientRect().top));
      return { su: b.classList.contains('su'), h: Math.round(r.height), w: Math.round(r.width), unaRiga: Math.max(...tops) - Math.min(...tops) < 4, figli: figli.length };
    });
    await page.screenshot({ path: `${OUT}/barra-monitor-slim.png` });
    prova('la barra sopra il monitor (nome, Movimento, forbici…) è sottile: una riga sola, alta meno di 32 px', !!bolla && bolla.su && bolla.h < 32 && bolla.unaRiga, JSON.stringify(bolla));

    // lo zoom: Ctrl + / Ctrl − con il puntatore sulla timeline ingrandiscono la TIMELINE e basta
    const ppf0 = await page.evaluate(() => window.__dpvTest.ui().tl.ppf);
    const r0 = await page.evaluate(() => { const r = window.__dpvTest.ui().tl.cv.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(r0.x, r0.y);
    await page.keyboard.press('Control+=');
    await page.waitForTimeout(200);
    const ppf1 = await page.evaluate(() => window.__dpvTest.ui().tl.ppf);
    await page.keyboard.press('Control+-');
    await page.waitForTimeout(200);
    const ppf2 = await page.evaluate(() => window.__dpvTest.ui().tl.ppf);
    prova('Ctrl + con il puntatore sulla timeline fa lo zoom della timeline (Ctrl − lo toglie)', ppf1 > ppf0 * 1.3 && Math.abs(ppf2 - ppf0) / ppf0 < 0.05, JSON.stringify({ ppf0, ppf1, ppf2 }));
    // Ctrl + rotella sulle barre della timeline (intestazioni, mappa in basso) fa lo zoom della timeline, e fuori non fa niente
    const intest = await page.evaluate(() => { const r = window.__dpvTest.ui().tl.testate.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(intest.x, intest.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    const ppf3 = await page.evaluate(() => window.__dpvTest.ui().tl.ppf);
    const fuori = await page.evaluate(() => {
      // il pizzico/Ctrl+rotella in un punto qualsiasi della pagina non deve lasciare fare lo zoom della pagina
      const e = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
      document.querySelector('.pulsantiera').dispatchEvent(e);
      return e.defaultPrevented;
    });
    prova('Ctrl + rotella sulle intestazioni della timeline la ingrandisce; Ctrl + rotella fuori dalla timeline non zooma la pagina (viene fermata)', ppf3 > ppf0 * 1.1 && fuori, JSON.stringify({ ppf0, ppf3, fuori }));
    // lo spessore delle tracce è sempre quello di base: non cresce con lo spazio della timeline (a qualunque altezza di finestra)
    await page.click('.pagina-btn[data-p=montaggio]');
    const kk = [];
    for (const hh of [700, 950, 1300]) {
      await page.setViewportSize({ width: 1600, height: hh });
      await page.waitForTimeout(400);
      kk.push(await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; return { k: tl.kV(), h: Math.round(document.querySelector('.tl-testata')?.getBoundingClientRect().height ?? 0) }; }));
    }
    await page.setViewportSize({ width: 1600, height: 950 });
    prova('le tracce hanno sempre lo stesso spessore (kV = 1, stessa altezza della testata) a 700, 950 e 1300 px di altezza della finestra', kk.every((x) => x.k === 1) && new Set(kk.map((x) => x.h)).size === 1, JSON.stringify(kk));
    // la pagina Finale: la timeline è piccola, la schermata dei ritocchi grande
    await page.click('.pagina-btn[data-p=finale]');
    await page.waitForTimeout(500);
    const fin = await page.evaluate(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); return { tl: Math.round(r('.timeline').height), finale: Math.round(r('.finale').height), vh: innerHeight }; });
    prova('Finale: la timeline è piccola (meno di un quinto dell\'altezza) e la schermata dei ritocchi è grande (più della metà)', fin.tl < fin.vh * 0.2 && fin.finale > fin.vh * 0.55, JSON.stringify(fin));
    await page.click('.pagina-btn[data-p=montaggio]');
    prova('nessun errore nella pagina (LIVE e banco)', errori.length === 0, errori.slice(0, 4).join(' | '));
  } finally {
    await contesto.close();
  }
}
