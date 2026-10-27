// Le prove della 1.4.0: la pagina iniziale con risoluzioni e fotogrammi al secondo, il pannello Proprietà rifatto
// (la sezione giusta si apre da sola, il quadro in miniatura che si trascina, le tessere con anteprima, durata ed
// entrata/uscita in parole semplici, ritaglio), i segnalini che seguono un oggetto e lo sfondo "cosa metto dietro".
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs proprieta`.

async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text()) && !/Failed to load resource/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

export async function proveProprieta({ page: paginaDi, prova }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ 1.4.0: la pagina iniziale, il progetto nuovo con risoluzioni e fotogrammi');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
    await page.waitForTimeout(400);
    const h0 = await page.evaluate(() => ({
      obiettivi: document.querySelectorAll('.home-obiettivo').length,
      ris: [...document.querySelectorAll('.home [data-ris]')].map((b) => b.dataset.ris),
      cad: [...document.querySelectorAll('.home [data-cad]')].map((b) => b.dataset.cad),
      riassunto: document.querySelector('.home-formato-riga')?.textContent,
    }));
    prova('ci sono otto formati pronti, le risoluzioni utili e i fotogrammi 24, 25, 30, 50, 60 e 29,97', h0.obiettivi === 8 && h0.ris.includes('fhd') && h0.ris.includes('uhd') && h0.ris.includes('vert') && h0.ris.includes('post') && h0.ris.includes('cine') && ['24', '25', '30', '50', '60', '2997'].every((c) => h0.cad.includes(c)), JSON.stringify(h0));
    prova('di partenza Full HD a 25 fotogrammi', /1920×1080/.test(h0.riassunto) && /25 fps/.test(h0.riassunto), h0.riassunto);
    await page.click('.home-obiettivo[data-ob=reel]');
    await page.click('.home .home-grande.primario');
    await page.waitForTimeout(400);
    let f = await page.evaluate(() => { const d = window.__dpv.doc; return { w: d.w, h: d.h, r: d.rate.num / d.rate.den }; });
    prova('"Reel · TikTok · Shorts" fa un progetto verticale 1080×1920 a 30', f.w === 1080 && f.h === 1920 && f.r === 30, JSON.stringify(f));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
    await page.waitForTimeout(300);
    await page.click('.home [data-ris=uhd]');
    await page.click('.home [data-cad="50"]');
    const acceso = await page.evaluate(() => ({ ris: document.querySelector('.home [data-ris].acceso')?.dataset.ris, cad: document.querySelector('.home [data-cad].acceso')?.dataset.cad, ob: document.querySelectorAll('.home-obiettivo.acceso').length }));
    await page.click('.home .home-grande.primario');
    await page.waitForTimeout(400);
    f = await page.evaluate(() => { const d = window.__dpv.doc; return { w: d.w, h: d.h, r: d.rate.num / d.rate.den }; });
    prova('risoluzione e fotogrammi si scelgono a parte: 4K a 50 (e nessun formato pronto resta acceso)', f.w === 3840 && f.h === 2160 && f.r === 50 && acceso.ris === 'uhd' && acceso.cad === '50' && acceso.ob === 0, JSON.stringify({ f, acceso }));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home')));
    await page.waitForTimeout(300);
    await page.click('.home-obiettivo[data-ob=azione]');
    await page.click('.home .home-grande.primario');
    await page.waitForTimeout(400);
    f = await page.evaluate(() => { const d = window.__dpv.doc; return { w: d.w, h: d.h, r: d.rate.num / d.rate.den }; });
    prova('"Sport e azione" = Full HD a 50', f.w === 1920 && f.h === 1080 && f.r === 50, JSON.stringify(f));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:home-nascondi')));

    // ———————————————————————————————————————————————————————————
    console.log('▶ 1.4.0: le Proprietà si aprono sulla sezione giusta');
    await page.evaluate(() => {
      const { P, B } = window.__dpvTest;
      const s = window.__dpv;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v = p.tracks.filter((t) => t.kind === 'video'), a = p.tracks.filter((t) => t.kind === 'audio');
      const foto = P.newClip('color', v[1].id, 0, 250, { name: 'FONDO', gen: { color: '#334466' } });
      const anim = P.newClip('title', v[0].id, 25, 100, { name: 'Animazione', gen: { anim: window.__dpvTest.AN.nuovaAnim('lt-barra') } });
      const tit = P.newClip('title', v[0].id, 150, 80, { name: 'Titolo', gen: { title: { ...P.TITLE0 } } });
      const mus = P.newClip('tone', a[0].id, 0, 250, { name: 'MUSICA', gen: { tone: 440 } });
      p.clips.push(foto, anim, tit, mus);
      B.posaBlocco(p, B.nuovoBlocco('effetto', 'sogno'), 100, 25, v[1].id);
      s.load(p);
      document.getElementById('app').classList.remove('senza-lato', 'stretto');
    });
    const aperte = async (nome) => {
      await page.evaluate((n) => { const d = window.__dpv.doc; const c = d.clips.find((x) => x.name === n); window.__dpv.select([c.id]); document.dispatchEvent(new CustomEvent('dpv:proprieta')); }, nome);
      await page.waitForSelector('.isp-corpo > .isp-gruppo', { timeout: 10000 });
      await page.waitForTimeout(600);
      return page.evaluate(() => [...document.querySelectorAll('.isp-corpo > .isp-gruppo')].map((g) => ({ g: g.dataset.g, o: g.open })));
    };
    const ap = await aperte('Animazione');
    prova('un\'animazione: si apre da sola "Animazione" e sta in cima alle sezioni', ap[0].g === 'animazione' && ap[0].o && ap.filter((x) => x.o).length === 1, JSON.stringify(ap));
    const ti = await aperte('Titolo');
    prova('un titolo: si apre da solo "Titolatrice" in cima', ti[0].g === 'titolo' && ti[0].o && ti.filter((x) => x.o).length === 1, JSON.stringify(ti));
    const mu = await aperte('MUSICA');
    prova('la musica: si apre il volume (un tono è anche un generatore: si apre pure quello)', mu.find((x) => x.g === 'audio')?.o && mu.find((x) => x.g === 'fxa')?.o === false && mu.find((x) => x.g === 'durata')?.o !== true, JSON.stringify(mu));
    const fo = await aperte('FONDO');
    prova('un colore pieno: si apre "Generatore" in cima', fo[0].g === 'generatore' && fo[0].o, JSON.stringify(fo));
    await page.evaluate(() => { const d = window.__dpv.doc; window.__dpv.select([d.clips.find((c) => c.kind === 'fx').id]); });
    await page.waitForTimeout(500);
    const bl = await page.evaluate(() => [...document.querySelectorAll('.isp-corpo > .isp-gruppo')].map((g) => ({ g: g.dataset.g, o: g.open })));
    prova('un effetto a tempo: si aprono "Quanto dura" e "Effetto"', bl.find((x) => x.g === 'bdurata')?.o && bl.find((x) => x.g === 'btipo')?.o, JSON.stringify(bl));
    // il doppio clic su una clip che non è un video porta alle sue impostazioni anche col pannello chiuso (già dalla 1.3.3)

    // ———————————————————————————————————————————————————————————
    console.log('▶ 1.4.0: il quadro in miniatura delle Proprietà');
    await page.evaluate(() => { const d = window.__dpv.doc; const c = d.clips.find((x) => x.name === 'FONDO'); window.__dpv.select([c.id]); window.__motore.vaiA(40); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.isp-gruppo:not([open]) > summary').forEach((x) => { if (x.parentElement.dataset.g === 'immagine') x.click(); }));
    // un colore pieno non è "media": per il quadro in miniatura serve una clip video con l'immagine → si usa un titolo (visibile e movibile)
    await page.evaluate(() => { const d = window.__dpv.doc; const c = d.clips.find((x) => x.name === 'Titolo'); window.__dpv.select([c.id]); window.__motore.vaiA(170); });
    await page.waitForTimeout(700);
    // il quadro in miniatura sta nell'editor della clip (doppio clic): si apre da lì
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'durata' })));
    await page.waitForSelector('.editor-clip');
    await page.evaluate(() => document.querySelectorAll('.editor-clip .isp-gruppo:not([open]) > summary').forEach((x) => { if (x.parentElement.dataset.g === 'immagine') x.click(); }));
    await page.waitForTimeout(400);
    const mq = await page.evaluate(() => {
      const t = document.querySelector('.mq-tela');
      if (!t) return null;
      t.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = t.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    prova('nelle Proprietà c\'è il quadro in miniatura', !!mq && mq.w > 150, JSON.stringify(mq));
    if (mq) {
      const tf = () => page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Titolo'); return { x: c.tf.x, y: c.tf.y, s: c.tf.scale, r: c.tf.rot }; });
      // il pannello si assesta (su un computer carico anche dopo mezzo secondo): si rimisura il quadro subito prima di ogni gesto
      const rimisura = async () => {
        await page.waitForTimeout(400);
        return page.evaluate(() => { const t = document.querySelector('.mq-tela'); t.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = t.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      };
      Object.assign(mq, await rimisura());
      const prima = await tf();
      // il riquadro del titolo sta al centro (poco sopra): si trascina da lì verso destra e in basso
      // su un computer carico il riquadro del titolo a volte non è ancora al suo posto (i caratteri si caricano): si riprova fino a tre volte
      await page.evaluate(() => document.fonts.ready);
      let dopo = prima;
      for (let giro = 0; giro < 3 && !(dopo.x > prima.x + 20); giro++) {
        if (giro) { await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Titolo'); window.__dpv.select([c.id]); window.__motore.vaiA(170); }); Object.assign(mq, await rimisura()); }
        await page.mouse.move(mq.x + mq.w / 2, mq.y + mq.h * 0.53);
        await page.mouse.down();
        await page.mouse.move(mq.x + mq.w / 2 + 40, mq.y + mq.h * 0.53 + 20, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        dopo = await tf();
      }
      prova('trascinando dentro il quadro in miniatura il titolo si sposta (a destra e in basso)', dopo.x > prima.x + 20 && dopo.y > prima.y + 10, JSON.stringify({ prima, dopo }));
      Object.assign(mq, await rimisura());
      await page.mouse.move(mq.x + mq.w / 2 + 40, mq.y + mq.h * 0.53 + 20);
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(700);
      const z = await tf();
      prova('la rotella sul quadro in miniatura ingrandisce', z.s > dopo.s * 1.1, JSON.stringify({ dopo, z }));
      await page.mouse.dblclick(mq.x + mq.w / 2 + 40, mq.y + mq.h * 0.53 + 20);
      await page.waitForTimeout(300);
      const r = await tf();
      prova('il doppio clic la rimette a tutto quadro', r.x === 0 && r.y === 0 && r.s === 1, JSON.stringify(r));
    }
    // le posizioni pronte
    await page.evaluate(() => [...document.querySelectorAll('.pp-tessera')].find((b) => b.textContent.includes('In basso a destra')).click());
    await page.waitForTimeout(300);
    const bd = await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Titolo'); return { x: c.tf.x, y: c.tf.y, s: c.tf.scale }; });
    prova('"In basso a destra" mette un riquadro piccolo nell\'angolo', bd.x > 300 && bd.y > 200 && bd.s < 0.5, JSON.stringify(bd));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.editor-clip', { state: 'detached' });

    // ———————————————————————————————————————————————————————————
    console.log('▶ 1.4.0: effetti e look con l\'anteprima, durata, entrata e uscita, ritaglio');
    await page.evaluate(() => {
      const { P } = window.__dpvTest;
      window.__dpv.edit('clip video', (p) => {
        const v = p.tracks.filter((t) => t.kind === 'video');
        p.clips.push(P.newClip('bars', v[1].id, 300, 100, { name: 'BARRE', gen: { bars: 'smpte' } }));
      });
      const c = window.__dpv.doc.clips.find((x) => x.name === 'BARRE');
      window.__dpv.select([c.id]); window.__motore.vaiA(320);
    });
    await page.waitForTimeout(700);
    const cl = await page.evaluate(() => { document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'fxv' })); return null; });
    void cl;
    // le miniature si disegnano una alla volta: si aspetta che ce ne siano abbastanza (su un computer carico ci vuole di più)
    await page.waitForFunction(() => {
      const t = [...document.querySelectorAll('.tessera canvas')];
      let n = 0;
      for (const c of t) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let min = 255, max = 0; for (let i = 0; i < d.length; i += 4 * 37) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < min) min = v; if (v > max) max = v; } if (max - min > 60) n++; }
      return n >= 8;
    }, null, { timeout: 60000, polling: 500 }).catch(() => {});
    const tess = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.tessera')];
      const piena = (c) => { const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let min = 255, max = 0; for (let i = 0; i < d.length; i += 4 * 37) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < min) min = v; if (v > max) max = v; } return max - min > 60; };
      return { n: t.length, nomi: t.slice(0, 4).map((x) => x.querySelector('.tessera-nome').textContent), disegnate: t.filter((x) => piena(x.querySelector('canvas'))).length, accesa: t.filter((x) => x.classList.contains('acceso')).map((x) => x.dataset.id) };
    });
    prova('"Effetti e look" è una griglia di miniature vere (disegnate, con "Com\'è" per spegnere tutto)', tess.n >= 15 && tess.disegnate >= Math.min(8, tess.n - 2) && tess.nomi[0] === 'Com\'è', JSON.stringify(tess));
    await page.evaluate(() => document.querySelector('.tessera[data-id=caldo]').click());
    await page.waitForTimeout(400);
    const caldo = await page.evaluate(() => ({ fx: window.__dpv.doc.clips.find((c) => c.name === 'BARRE').fx.effetti, acceso: document.querySelector('.tessera[data-id=caldo]').classList.contains('acceso') }));
    prova('un clic su una miniatura accende l\'effetto (con la spunta)', caldo.fx?.includes('caldo') && caldo.acceso, JSON.stringify(caldo));
    await page.evaluate(() => document.querySelector('.tessera[data-id=nessuno]').click());
    await page.waitForTimeout(300);
    prova('"Com\'è" spegne tutti gli effetti rapidi', !(await page.evaluate(() => window.__dpv.doc.clips.find((c) => c.name === 'BARRE').fx.effetti?.length)));

    // durata
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'durata' })));
    await page.waitForTimeout(400);
    const du = await page.evaluate(() => ({ grande: document.querySelector('.dur-numero')?.textContent, dove: document.querySelector('.dur-dove')?.textContent, vel: document.querySelector('.dur-velocita')?.textContent, len: window.__dpv.doc.clips.find((c) => c.name === 'BARRE').len }));
    prova('la durata si legge grande ("4,00 s"), con da-a e la velocità', du.grande === '4,00 s' && /^da .* a /.test(du.dove) && /Velocità normale/.test(du.vel), JSON.stringify(du));
    await page.evaluate(() => [...document.querySelectorAll('.isp-durata .btn-mini')].find((b) => b.textContent === '+1 s').click());
    await page.waitForTimeout(400);
    const piu = await page.evaluate(() => window.__dpv.doc.clips.find((c) => c.name === 'BARRE').len);
    prova('+1 s allunga la clip di un secondo (25 fotogrammi)', piu === du.len + 25, String(piu));

    // entrata e uscita: la dissolvenza si imposta in secondi
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'trclip' })));
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('.isp-gruppo[data-g=trclip] .isp-riga')].find((x) => x.querySelector('label')?.textContent === 'All\'inizio').querySelector('input[type=range]');
      r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const fi = await page.evaluate(() => window.__dpv.doc.clips.find((c) => c.name === 'BARRE').fadeIn);
    prova('"Entrata e uscita": la dissolvenza all\'inizio a 1 secondo = 25 fotogrammi', fi === 25, String(fi));

    // ritaglio
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'ritaglio' })));
    await page.waitForTimeout(400);
    await page.evaluate(() => [...document.querySelectorAll('.isp-gruppo[data-g=ritaglio] .btn-mini')].find((b) => b.textContent === 'Verticale 9:16 al centro').click());
    await page.waitForTimeout(300);
    const cr = await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'BARRE'); return { l: c.tf.cropL, r: c.tf.cropR }; });
    prova('"Verticale 9:16 al centro" taglia i lati in modo uguale (resta la parte di mezzo)', cr.l > 0.2 && Math.abs(cr.l - cr.r) < 1e-9, JSON.stringify(cr));

    // ———————————————————————————————————————————————————————————
    await page.evaluate(() => { const f = document.querySelector('.editor-clip .dlg-piede .primario'); if (f) f.click(); });
    await page.waitForTimeout(300);
    console.log('▶ 1.4.0: i segnalini che seguono un oggetto, lo sfondo con qualcosa dietro');
    const sg = await page.evaluate(async () => {
      const { RA, AN } = window.__dpvTest;
      await document.fonts.ready;
      const ids = AN.ANIMAZIONI.filter((a) => a.gruppo === 'segui').map((a) => a.id);
      const disegnati = ids.map((id) => {
        const tl = RA.disegnaAnimazione({ id, v: AN.nuovaAnim(id).v }, 960, 540, 2.5, 6);
        const o = document.createElement('canvas'); o.width = 960; o.height = 540; const x = o.getContext('2d'); x.drawImage(tl, 0, 0);
        const d = x.getImageData(0, 0, 960, 540).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 9) if (d[i] > 100) n++;
        return [id, n];
      });
      return { ids, disegnati };
    });
    prova('sei segnalini nel catalogo, ognuno disegna qualcosa attorno al centro', sg.ids.length === 6 && sg.disegnati.every(([, n]) => n > 50), JSON.stringify(sg));
    // un progetto vuoto, se no il montaggio dimostrativo chiede conferma prima di sostituire quello che c'è
    await page.evaluate(() => { const { P } = window.__dpvTest; window.__dpv.load(P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false })); });
    await page.waitForTimeout(300);
    // una ripresa video vera, ma corta (il montaggio dimostrativo ne fa quattro e su un computer carico ci mette minuti): si importa e si mette in timeline
    await page.evaluate(async () => {
      const { ripresaDiProva, importaFile, P } = window.__dpvTest;
      const f = await ripresaDiProva(4, 25);
      const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
      const v1 = window.__dpv.doc.tracks.filter((t) => t.kind === 'video')[0];
      window.__dpv.edit('Ripresa', (pp) => { pp.clips.push(P.newClip('media', v1.id, 0, 100, { media: m.id, name: 'Ripresa', srcIn: 0 })); });
    });
    await page.waitForTimeout(800);
    const tracciato = await page.evaluate(() => {
      const d = window.__dpv.doc;
      return d.clips.find((x) => x.kind === 'media' && d.tracks.find((t) => t.id === x.track)?.kind === 'video' && d.media.find((m) => m.id === x.media)?.type === 'video').id;
    });
    await page.evaluate((id) => {
      window.__dpv.edit('tracking finto', (pp) => { const c = pp.clips.find((x) => x.id === id); const dur = pp.media.find((m) => m.id === c.media).duration; c.traccia = { da: 0, fiducia: 0.9, punti: Array.from({ length: 20 }, (_, i) => ({ t: (i / 19) * dur, x: 0.2 + (i / 19) * 0.6, y: 0.5 })) }; });
      window.__dpv.select([id]); window.__motore.vaiA(10);
      document.getElementById('app').classList.remove('senza-lato', 'stretto');
    }, tracciato);
    await page.waitForTimeout(500);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'segui' })));
    await page.waitForTimeout(500);
    const nSeg = await page.evaluate(() => document.querySelectorAll('.seg-tessera').length);
    prova('dopo il tracking compaiono tutte le cose da mettere sull\'oggetto (testo, segnali, immagine, emoji, effetti)', nSeg === 13, String(nSeg));
    const aperta = await page.evaluate(() => document.querySelector('.isp-gruppo[data-g=segui]')?.open === true);
    prova('la sezione "Segui un oggetto" è aperta da sola per una ripresa tracciata', aperta);
    const inLibreria = await page.evaluate(() => ({ albero: [...document.querySelectorAll('.bin-cat')].some((b) => /^an:segui/.test(b.dataset.c ?? '')), segnalini: window.__dpvTest.AN ? window.__dpvTest.AN.ANIM_LIBRERIA.some((a) => a.id.startsWith('sg-')) : null }));
    prova('i segnalini non stanno nella libreria delle animazioni (si mettono dal pannello del tracking)', inLibreria.albero === false && inLibreria.segnalini !== true, JSON.stringify(inLibreria));
    await page.evaluate(() => [...document.querySelectorAll('.seg-tessera')].find((b) => b.textContent.includes('Etichetta')).click());
    await page.waitForTimeout(500);
    const nuovo = await page.evaluate((id) => {
      const d = window.__dpv.doc; const s = d.clips.find((c) => c.gen?.anim?.id === 'sg-etichetta'); const { TR } = window.__dpvTest;
      if (!s) return null;
      const src = d.clips.find((c) => c.id === id); const a = TR.spostaTraccia(d, s, src.start + 3), b = TR.spostaTraccia(d, s, src.start + src.len - 3);
      return { segue: s.segue === id, altraTraccia: s.track !== src.track, stessoTempo: s.start === src.start && s.len === src.len, len: s.len, a: [a.dx, a.dy], b: [b.dx, b.dy], scelta: window.__dpv.sel.has(s.id) };
    }, tracciato);
    prova('un clic su "Etichetta" mette sopra la ripresa un segnalino che la segue per tutta la durata (su un\'altra traccia)', !!nuovo && nuovo.segue && nuovo.altraTraccia && nuovo.stessoTempo && nuovo.scelta, JSON.stringify(nuovo));
    prova('il segnalino si sposta davvero con l\'oggetto (da sinistra a destra)', !!nuovo && nuovo.b[0] - nuovo.a[0] > 200, JSON.stringify(nuovo));

    // testo, emoji, effetto: ognuno è una cosa nuova che segue la ripresa
    await page.evaluate((id) => { window.__dpv.select([id]); document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'segui' })); }, tracciato);
    await page.waitForTimeout(500);
    await page.evaluate(() => [...document.querySelectorAll('.seg-tessera')].find((b) => b.dataset.seg === 'Testo').click());
    await page.waitForTimeout(400);
    const testo = await page.evaluate((id) => { const d = window.__dpv.doc; const t = d.clips.find((c) => c.kind === 'title' && c.name === 'Testo'); return t ? { segue: t.segue === id, testo: t.gen?.title?.text, sopra: t.tf.y < 0, scelto: window.__dpv.sel.has(t.id), altra: t.track !== d.clips.find((c) => c.id === id).track } : null; }, tracciato);
    prova('"Testo" mette un titolo sopra l\'oggetto, scelto e pronto da scrivere, che segue la ripresa', !!testo && testo.segue && testo.sopra && testo.scelto && testo.altra, JSON.stringify(testo));
    await page.evaluate((id) => { window.__dpv.select([id]); document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'segui' })); }, tracciato);
    await page.waitForTimeout(500);
    await page.evaluate(() => [...document.querySelectorAll('.seg-tessera')].find((b) => b.dataset.seg === 'Lente').click());
    await page.waitForTimeout(400);
    const lente = await page.evaluate((id) => { const d = window.__dpv.doc; const b = d.clips.find((c) => c.kind === 'fx' && c.fxb?.id === 'bolla'); const s = d.clips.find((c) => c.id === id); return b ? { segue: b.fxb.segue === id, tempo: b.start === s.start && b.len === s.len } : null; }, tracciato);
    prova('"Lente" mette un effetto il cui centro segue l\'oggetto per tutta la ripresa', !!lente && lente.segue && lente.tempo, JSON.stringify(lente));
    await page.evaluate((id) => { window.__dpv.select([id]); document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'segui' })); }, tracciato);
    await page.waitForTimeout(500);
    await page.evaluate(() => [...document.querySelectorAll('.seg-tessera')].find((b) => b.dataset.seg === 'Emoji').click());
    await page.waitForTimeout(300);
    const nEmoji = await page.evaluate(() => document.querySelectorAll('.menu-contesto .voce, .menu .voce, [role=menu] [role=menuitem]').length);
    prova('"Emoji" apre l\'elenco delle emoji da scegliere', nEmoji >= 8, String(nEmoji));
    await page.keyboard.press('Escape');

    // sfondo: cosa metto dietro
    await page.evaluate((id) => { window.__dpv.select([id]); }, tracciato);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'sfondo' })));
    await page.waitForTimeout(400);
    prova('senza sfondo tolto non c\'è ancora "cosa metto dietro"', (await page.locator('.isp-gruppo[data-g=sfondo] .pp-tessera:has-text("Notte")').count()) === 0);
    await page.evaluate((id) => window.__dpv.edit('chiave', (pp) => { pp.clips.find((c) => c.id === id).fx.key = 'chroma'; }), tracciato);
    await page.waitForTimeout(500);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'sfondo' })));
    await page.waitForTimeout(400);
    await page.evaluate(() => [...document.querySelectorAll('.isp-gruppo[data-g=sfondo] .pp-tessera')].find((b) => b.textContent === 'Notte').click());
    await page.waitForTimeout(400);
    const dietro = await page.evaluate((id) => {
      const d = window.__dpv.doc; const src = d.clips.find((c) => c.id === id); const col = d.clips.find((c) => c.kind === 'color' && c.name === 'Sfondo Notte');
      if (!col) return null;
      const iS = d.tracks.findIndex((t) => t.id === src.track), iC = d.tracks.findIndex((t) => t.id === col.track);
      return { sotto: iC > iS, stesso: col.start === src.start && col.len === src.len, colore: col.gen.color };
    }, tracciato);
    prova('"Notte" mette uno sfumato dietro al soggetto, su una traccia sotto e per tutta la sua durata', !!dietro && dietro.sotto && dietro.stesso && dietro.colore === '#2e4478', JSON.stringify(dietro));

    prova('nessun errore nella pagina', errori.length === 0, errori.join(' | '));
  } finally {
    await contesto.close();
  }
}
