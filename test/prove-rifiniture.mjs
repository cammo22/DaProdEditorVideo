// Le prove della 1.2.1 (le rifiniture): il taglio di una clip che si muove, l'annulla che non lascia il progetto
// a metà, le cuciture dell'audio nell'export, i tasti sopra la pagina iniziale, copia e incolla con gli effetti,
// le scorciatoie senza doppioni.
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs rifiniture`.

/** una pagina pulita (contesto nuovo): le prove di prima hanno riempito il progetto */
async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

export async function proveRifiniture({ page: paginaDi, prova }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Rifiniture: il taglio di una clip che si muove');
    const moto = await page.evaluate(() => {
      const { M, P } = window.__dpvTest;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v = p.tracks.find((t) => t.kind === 'video').id;
      const c = P.newClip('color', v, 0, 100, { gen: { color: '#334455' } });
      c.tf = { ...P.TF0, x: 0, scale: 1 };
      c.tfFine = { ...P.TF0, x: 400, scale: 1.5 };
      c.via = [{ t: 0.3, tf: { ...P.TF0, x: 300, scale: 1.2 } }, { t: 0.8, tf: { ...P.TF0, x: 350, scale: 1.4 } }];
      p.clips.push(c);
      const orig = structuredClone(c);
      const dx = M.splitClip(p, c, 40);
      const scarto = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.scale - b.scale) * 100);
      let peggio = 0;
      for (let f = 0; f < 100; f++) {
        const atteso = P.tfAl(orig, f);
        const vero = f < 40 ? P.tfAl(c, f) : P.tfAl(dx, f - 40);
        peggio = Math.max(peggio, scarto(atteso, vero));
      }
      return { peggio, sx: c.via?.length ?? 0, dx: dx.via?.length ?? 0, fineDx: dx.tfFine.x, inizioSx: c.tf.x };
    });
    prova('tagliata, la clip continua il movimento dov\'era (niente ripartenza da capo)', moto.peggio < 40, JSON.stringify(moto));
    prova('le tappe vanno al pezzo giusto (una a sinistra, una a destra), partenza e arrivo restano', moto.sx === 1 && moto.dx === 1 && moto.fineDx === 400 && moto.inizioSx === 0, JSON.stringify(moto));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Rifiniture: una modifica che si rompe non lascia il progetto a metà');
    const rotta = await page.evaluate(() => {
      const s = window.__dpv;
      const prima = s.doc.tracks.length, annulli = s.canUndo();
      let presa = false;
      try { s.edit('Prova rotta', (p) => { p.tracks.push({ ...p.tracks[0], id: 'tx' }); throw new Error('rotta'); }); } catch { presa = true; }
      return { presa, uguale: s.doc.tracks.length === prima, annulli: s.canUndo() === annulli };
    });
    prova('l\'errore arriva a chi chiama e il progetto torna com\'era (senza un passo di annulla in più)', rotta.presa && rotta.uguale && rotta.annulli, JSON.stringify(rotta));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Rifiniture: le cuciture dell\'audio nell\'export (ogni 10 s)');
    const cucitura = await page.evaluate(async () => {
      const { P, mixaggio } = window.__dpvTest;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const a = p.tracks.find((t) => t.kind === 'audio').id;
      // un tono con l'eco: l'eco somma (il ritardo è un numero intero di periodi) e dura oltre la cucitura dei 10 s
      p.clips.push(P.newClip('tone', a, 0, 25 * 14, { gen: { freq: 1000, level: -24 }, afx: { eco: true } }));
      p.master.limiter = false;
      const pezzi = [];
      for await (const b of mixaggio(p, 0, 14)) pezzi.push(b.getChannelData(0).slice());
      const tutto = new Float32Array(pezzi.reduce((s, x) => s + x.length, 0));
      let o = 0;
      for (const x of pezzi) { tutto.set(x, o); o += x.length; }
      const rms = (da, a) => { let s = 0; for (let i = Math.round(da * 48000); i < Math.round(a * 48000); i++) s += tutto[i] * tutto[i]; return Math.sqrt(s / ((a - da) * 48000)); };
      return { campioni: tutto.length, prima: rms(9.7, 10), dopo: rms(10, 10.25) };
    });
    prova('il mixaggio è lungo giusto', cucitura.campioni === 14 * 48000, String(cucitura.campioni));
    prova('dopo la cucitura dei 10 s l\'eco c\'è ancora (prima ripartiva da zero e il volume calava)', cucitura.dopo / cucitura.prima > 0.93, JSON.stringify(cucitura));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Rifiniture: i tasti, la pagina iniziale, copia e incolla');
    await page.evaluate(() => {
      const { P } = window.__dpvTest;
      const s = window.__dpv;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v = p.tracks.filter((t) => t.kind === 'video')[1].id;
      p.clips.push(P.newClip('color', v, 0, 50, { name: 'A', gen: { color: '#aa3333' } }));
      s.load(p);
      s.select([p.clips[0].id]);
    });
    const clipVere = () => page.evaluate(() => window.__dpv.doc.clips.filter((c) => c.kind !== 'fx').length);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
    await page.waitForTimeout(200);
    await page.mouse.move(5, 5);
    await page.keyboard.press('2');
    await page.waitForTimeout(150);
    prova('con la pagina iniziale aperta il tasto 2 non tocca il montaggio nascosto', (await clipVere()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    prova('Esc chiude la pagina iniziale', !(await page.evaluate(() => document.documentElement.classList.contains('home-aperta'))));

    const tracce = () => page.evaluate(() => window.__dpv.doc.tracks.filter((t) => t.kind === 'audio').length);
    const t0 = await tracce();
    await page.keyboard.press('Control+Alt+a');
    await page.waitForTimeout(150);
    prova('Ctrl+Alt+A aggiunge davvero una traccia audio (prima lo prendeva l\'animazione)', (await tracce()) === t0 + 1);
    const doppi = await page.evaluate(() => {
      const visti = new Map();
      for (const a of window.__dpvTest.Z.azioni.values()) for (const t of a.tasti ?? []) { const k = t.toLowerCase(); visti.set(k, [...(visti.get(k) ?? []), a.id]); }
      return [...visti].filter(([, ids]) => ids.length > 1).map(([k, ids]) => k + ': ' + ids.join(', '));
    });
    prova('nessun tasto è preso da due comandi', doppi.length === 0, doppi.join(' · '));

    // un effetto sulla clip: copiando la clip si porta dietro l'effetto
    await page.evaluate(() => {
      const { B } = window.__dpvTest;
      const s = window.__dpv;
      const c = s.doc.clips.find((x) => x.kind !== 'fx');
      s.edit('Effetto', (p) => B.posaBlocco(p, B.nuovoBlocco('effetto', 'flash'), 10, 12, c.track));
      s.select([c.id]);
      s.setHead(100);
    });
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(150);
    const incollato = await page.evaluate(() => {
      const d = window.__dpv.doc;
      const fx = d.clips.filter((c) => c.kind === 'fx');
      const nuova = d.clips.find((c) => c.kind !== 'fx' && c.start === 100);
      return { fx: fx.length, nuova: !!nuova, sopra: !!nuova && fx.some((b) => b.track === nuova.track && b.start === 110) };
    });
    prova('copia e incolla portano anche l\'effetto che sta sulla clip, sulla stessa traccia della copia', incollato.fx === 2 && incollato.nuova && incollato.sopra, JSON.stringify(incollato));

    prova('nessun errore nelle prove delle rifiniture', errori.length === 0, errori.slice(0, 5).join(' | '));
  } finally {
    await contesto.close();
  }
}
