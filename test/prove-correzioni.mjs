// Le prove della 1.3.3: il taglio solo su quello che scegli, i punti sulla linea del volume con un clic, la rotella su
// tutti i campi, il doppio clic che porta alle impostazioni, il movimento fluido (flusso ottico) e le animazioni che
// si adattano al testo.
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs correzioni`.

/** una pagina pulita (contesto nuovo): le prove di prima hanno riempito il progetto */
async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

export async function proveCorrezioni({ page: paginaDi, prova }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Correzioni: il taglio tocca solo quello che hai scelto');
    await page.evaluate(() => {
      const { P } = window.__dpvTest;
      const s = window.__dpv;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v = p.tracks.filter((t) => t.kind === 'video');
      const a = p.tracks.filter((t) => t.kind === 'audio');
      p.clips.push(P.newClip('color', v[0].id, 0, 200, { name: 'ALTO', gen: { color: '#aa3333' } }));
      p.clips.push(P.newClip('color', v[1].id, 0, 200, { name: 'BASSO', gen: { color: '#33aa33' } }));
      p.clips.push(P.newClip('tone', a[0].id, 0, 200, { name: 'MUSICA', gen: { tone: 440 } }));
      s.load(p);
      s.select([]);
      window.__motore.vaiA(50);
    });
    await page.locator('.tl-tela').focus();
    const nomi = () => page.evaluate(() => window.__dpv.doc.clips.filter((c) => c.kind !== 'fx').map((c) => c.name + '@' + c.start + '+' + c.len).sort().join(' '));
    await page.keyboard.press('1'); await page.waitForTimeout(150);
    prova('1 senza niente scelto taglia solo la clip più in alto sotto il cursore (le altre restano intere)', /ALTO@0\+50 ALTO@50\+150/.test(await nomi()) && /BASSO@0\+200/.test(await nomi()) && /MUSICA@0\+200/.test(await nomi()), await nomi());
    await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
    await page.evaluate(() => { const d = window.__dpv.doc; window.__dpv.select([d.clips.find((c) => c.name === 'MUSICA').id]); });
    await page.keyboard.press('1'); await page.waitForTimeout(150);
    prova('con una clip scelta il taglio tocca solo lei', /MUSICA@0\+50 MUSICA@50\+150/.test(await nomi()) && /ALTO@0\+200/.test(await nomi()) && /BASSO@0\+200/.test(await nomi()), await nomi());
    await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
    await page.evaluate(() => window.__dpv.select([]));
    await page.keyboard.press('Shift+C'); await page.waitForTimeout(150);
    const tutte = await nomi();
    prova('Shift+C taglia tutte le tracce sotto il cursore', /ALTO@0\+50/.test(tutte) && /BASSO@0\+50/.test(tutte) && /MUSICA@0\+50/.test(tutte), tutte);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(150);

    // ———————————————————————————————————————————————————————————
    console.log('▶ Correzioni: un clic sulla linea del volume mette un punto');
    await page.evaluate(() => { window.__dpv.select([]); window.__motore.vaiA(0); });
    const linea = await page.evaluate(() => {
      const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc;
      const c = d.clips.find((x) => x.name === 'MUSICA');
      tl.righe(d);
      const r = tl.riga(c.track);
      const g = tl.geo(r.y, r.h);
      const db = c.gain;
      const y = g.corpoY + g.corpoH - ((db + 40) / 52) * g.corpoH;
      return { x: (100 - tl.scrollF) * tl.ppf, y, id: c.id, hh: g.corpoH };
    });
    const box = await page.locator('.tl-tela').boundingBox();
    await page.mouse.click(box.x + linea.x, box.y + linea.y);
    await page.waitForTimeout(200);
    const keys = await page.evaluate((id) => window.__dpv.doc.clips.find((c) => c.id === id).gainKeys, linea.id);
    prova('un clic sulla linea del volume mette un punto lì (e i due capi della clip)', keys.length === 3 && keys.some((k) => k.f === 100) && keys[0].f === 0 && keys[2].f === 200, JSON.stringify(keys) + JSON.stringify(linea));
    // si trascina il punto più in basso e di lato: il volume scende solo lì
    await page.mouse.move(box.x + linea.x, box.y + linea.y);
    await page.mouse.down();
    await page.mouse.move(box.x + linea.x + 40, box.y + linea.y + Math.min(30, linea.hh * 0.4), { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const dopo = await page.evaluate((id) => window.__dpv.doc.clips.find((c) => c.id === id).gainKeys, linea.id);
    const mezzo = dopo.find((k) => k.f !== 0 && k.f !== 200);
    prova('il punto si porta giù e di lato; i capi della clip restano a volume normale', !!mezzo && mezzo.v < -1 && mezzo.f > 100 && dopo[0].v === 0 && dopo[dopo.length - 1].v === 0, JSON.stringify(dopo));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Correzioni: la rotella cambia i campi');
    await page.evaluate(() => { const d = window.__dpv.doc; window.__dpv.select([d.clips.find((c) => c.name === 'ALTO').id]); document.dispatchEvent(new CustomEvent('dpv:ispettore')); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelectorAll('.isp-gruppo:not([open]) > summary').forEach((x) => x.click()); });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__dpv.edit('metà', (p) => { p.clips.find((c) => c.name === 'ALTO').opacity = 0.5; }));
    // il pannello si aggiorna al fotogramma dopo: su un computer lento (la CI) ci mette un po'
    await page.waitForFunction(() => {
      const r = [...document.querySelectorAll('.isp-riga')].find((x) => x.querySelector('label')?.textContent === 'Opacità')?.querySelector('input[type=range]');
      return !!r && Number(r.value) === 50;
    }, null, { timeout: 15000 }).catch(() => {});
    // l'evento della rotella si dà direttamente al campo (il puntatore vero dipende da dove il pannello si è assestato)
    const gira = (dy, extra = {}) => page.evaluate(([dy, extra]) => {
      const r = [...document.querySelectorAll('.isp-riga')].find((x) => x.querySelector('label')?.textContent === 'Opacità')?.querySelector('input[type=range]');
      if (!r) return null;
      const e = new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true, ...extra });
      r.dispatchEvent(e);
      return { v: Number(r.value), fermata: e.defaultPrevented };
    }, [dy, extra]);
    const g0 = await gira(0);
    prova('nelle proprietà c\'è il cursore dell\'Opacità (a metà)', !!g0 && g0.v === 50, JSON.stringify(g0));
    const g1 = await gira(100);
    await page.waitForTimeout(600);
    const o1 = await page.evaluate(() => window.__dpv.doc.clips.find((c) => c.name === 'ALTO').opacity);
    prova('la rotella giù abbassa l\'opacità di un passo (50 → 49), la pagina non scorre e la clip cambia davvero', !!g1 && g1.fermata && Math.abs(o1 - 0.49) < 0.001, JSON.stringify({ g1, o1 }));
    const g2 = await gira(-120, { shiftKey: true });
    await page.waitForTimeout(600);
    const o2 = await page.evaluate(() => window.__dpv.doc.clips.find((c) => c.name === 'ALTO').opacity);
    prova('Maiusc + rotella su = passi da dieci (49 → 59)', !!g2 && Math.abs(o2 - 0.59) < 0.001, JSON.stringify({ g2, o2 }));
    const n = await page.evaluate(() => { const s = window.__dpv; let k = 0; while (s.canUndo() && s.undoLabel().includes('Opacità')) { s.doUndo(); k++; if (k > 5) break; } return k; });
    prova('ogni girata è un solo colpo per l\'annulla (due girate = due annulla)', n === 2, String(n));
    const v = await page.evaluate(() => window.__dpvTest.ui().tl.scrollF);
    // sul righello la rotella scorre la vista senza muovere il cursore
    await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; tl.ppf = 8; tl.scrollF = 100; tl.sporca(); window.__dpv.setHead?.(120); });
    const h0 = await page.evaluate(() => window.__dpv.head);
    await page.mouse.move(box.x + 400, box.y + 14);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
    const s1 = await page.evaluate(() => ({ sc: window.__dpvTest.ui().tl.scrollF, head: window.__dpv.head }));
    prova('sul righello la rotella riporta la vista indietro e il cursore resta dov\'è', s1.sc < 100 && s1.head === h0, JSON.stringify({ v, s1, h0 }));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Correzioni: il doppio clic su un titolo o su un blocco porta alle impostazioni');
    await page.evaluate(() => {
      const { P } = window.__dpvTest;
      const s = window.__dpv;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v = p.tracks.filter((t) => t.kind === 'video');
      p.clips.push(P.newClip('color', v[0].id, 0, 400, { name: 'FONDO', gen: { color: '#223344' } }));
      p.clips.push(P.newClip('color', v[1].id, 200, 100, { name: 'DOPPIO', gen: { color: '#aa8833' } }));
      s.load(p);
      s.select([]);
      window.__motore.vaiA(0);
      window.__dpvTest.ui().tl.adattaTutto();
      // il pannello di destra chiuso
      document.getElementById('app').classList.add('senza-lato');
    });
    await page.waitForTimeout(300);
    const dc = await page.evaluate(() => {
      const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc;
      const c = d.clips.find((x) => x.name === 'DOPPIO');
      tl.righe(d);
      const r = tl.riga(c.track);
      return { x: (c.start + c.len / 2 - tl.scrollF) * tl.ppf, y: r.y + r.h / 2, id: c.id };
    });
    await page.mouse.dblclick(box.x + dc.x, box.y + dc.y);
    await page.waitForTimeout(400);
    const dopoDc = await page.evaluate((id) => ({ sel: [...window.__dpv.sel].includes(id), head: window.__dpv.head, lato: !document.getElementById('app').classList.contains('senza-lato'), monitor: window.__motore.attivo }), dc.id);
    prova('il doppio clic sceglie la clip, riapre il pannello, porta il cursore dentro la clip e mette il monitor sul programma', dopoDc.sel && dopoDc.lato && dopoDc.head >= 200 && dopoDc.head < 300 && dopoDc.monitor === 'recorder', JSON.stringify(dopoDc));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Correzioni: movimento fluido (flusso ottico) su una scena con movimento noto');
    const fl = await page.evaluate(() => {
      const { FL } = window.__dpvTest;
      const W = 480, H = 270;
      const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
      const noise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; const u = fx * fx * (3 - 2 * fx), vv = fy * fy * (3 - 2 * fy); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * vv + (a - b - c + d) * u * vv; };
      const tex = (x, y, s) => 0.55 * noise(x / 24, y / 24, s) + 0.3 * noise(x / 9, y / 9, s + 1) + 0.15 * noise(x / 3.5, y / 3.5, s + 2);
      const scena = (t) => {
        const d = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const bg = tex(x - 6 * t, y - 2 * t, 1);
          let r = 40 + 190 * bg, g = 60 + 150 * bg, b = 90 + 120 * (1 - bg);
          const cx = 170 + 22 * t, cy = 130 - 8 * t;
          if ((x - cx) ** 2 + (y - cy) ** 2 < 60 * 60) { const q = tex(x - cx + 500, y - cy + 500, 4); r = 255 * q; g = 220 * (1 - q) + 20; b = 60 + 150 * q; }
          const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
        }
        return d;
      };
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const carica = (d) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, d); return { tex: t }; };
      const psnr = (a, b) => { let s = 0; for (let i = 0; i < W * H * 4; i += 4) for (let c = 0; c < 3; c++) { const e = a[i + c] - b[i + c]; s += e * e; } return 10 * Math.log10(255 * 255 / Math.max(s / (W * H * 3), 1e-9)); };
      const interp = new FL.Interpolatore(gl);
      const ta = carica(scena(0)), tb = carica(scena(1)), gt = scena(0.5);
      const leggi = (mosso) => { interp.mezzo('k' + mosso, ta, tb, 'c', 0.5, W, H, mosso); const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
      return { capace: interp.capace, sfumato: psnr(leggi(false), gt), mosso: psnr(leggi(true), gt) };
    });
    prova('il flusso ottico ricostruisce il fotogramma di mezzo molto meglio dello sfumato (almeno 4 dB in più)', !fl.capace || fl.mosso > fl.sfumato + 4, JSON.stringify(fl));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Correzioni: le animazioni si adattano al testo');
    const fuori = await page.evaluate(async () => {
      await document.fonts.ready;
      const { RA } = window.__dpvTest;
      const lungo = 'Un nome davvero lunghissimo che non finisce mai e va avanti ancora';
      const casi = [
        ['sc-segui', { nome: '@' + lungo.replace(/ /g, '_'), etichetta: 'Segui subito adesso' }, 3.5],
        ['sc-iscriviti', { etichetta: lungo.toUpperCase() }, 3],
        ['lt-barra', { nome: lungo, ruolo: lungo }, 2],
        ['lt-pillola', { nome: lungo, ruolo: lungo }, 2],
        ['lt-blocco', { nome: lungo, etichetta: lungo }, 2],
        ['sc-post', { nome: lungo, utente: lungo, testo: lungo }, 3],
        ['sc-notifica', { app: lungo, titolo: lungo, testo: lungo }, 2],
        ['dt-progresso', { etichetta: lungo }, 3],
        ['cr-data', { mese: 'SETTEMBRE DEL TUTTO', anno: '2026 e dopo', nomi: lungo }, 3],
      ];
      const out = [];
      for (const formato of [[1920, 1080], [1080, 1920]]) {
        for (const [id, v, t] of casi) {
          const [W, H] = formato;
          const tl = RA.disegnaAnimazione({ id, v }, W, H, t, 6);
          const o = document.createElement('canvas'); o.width = W; o.height = H;
          const x = o.getContext('2d'); x.drawImage(tl, 0, 0);
          const px = x.getImageData(0, 0, W, H).data;
          // c'è qualcosa di disegnato nelle ultime/prime colonne del quadro? (la scheda esce dallo schermo; l'ombra morbida di sfondo non conta)
          const m = 6; let tocca = 0, tutto = 0;
          for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 1) {
            const a = px[(yy * W + xx) * 4 + 3];
            if (a > 200) { tutto++; if (xx < m || xx >= W - m) tocca++; }
          }
          out.push({ id, formato: W + 'x' + H, tocca, tutto });
        }
      }
      return out;
    });
    const male = fuori.filter((x) => x.tocca > 3 || x.tutto === 0);
    prova('con testi lunghissimi, in orizzontale e in verticale, niente esce dai bordi dello schermo (e qualcosa si vede)', male.length === 0, JSON.stringify(male));

    prova('nessun errore nella pagina', errori.length === 0, errori.join(' | '));
  } finally {
    await contesto.close();
  }
}
