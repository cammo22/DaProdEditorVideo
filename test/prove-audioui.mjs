// Le prove della parte che si vede dell'audio con l'AI (1.5.0, aggiornata alla 1.5.1): la sezione "Audio: pulisci e separa" nelle Proprietà, il tasto destro
// sulla clip, i comandi nella ricerca. Il lavoro vero è provato in prove-audioai.mjs; qui un giro vero con DeepFilterNet su un secondo di audio.
//   npm run build && node test/prove-nuove.mjs audioui

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

export async function proveAudioUI({ page: paginaDi, prova }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    console.log('▶ Audio AI: dove si trova (Proprietà, tasto destro, ricerca)');
    // una clip audio vera: 3 secondi di voce finta (armoniche) con rumore
    const id = await page.evaluate(async () => {
      const { P, importaFile } = window.__dpvTest;
      const sr = 48000, n = sr * 3, a = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / sr; a[i] = 0.3 * Math.sin(2 * Math.PI * 180 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t)) + 0.02 * (Math.random() * 2 - 1); }
      const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
      const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, a[i])) * 0x7fff, true);
      const p = P.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
      window.__dpv.load(p);
      const [m] = await importaFile([{ name: 'Voce.wav', file: new File([b], 'Voce.wav', { type: 'audio/wav' }) }], { chiediFormato: false });
      let cid = '';
      window.__dpv.edit('Voce', (pp) => { const a1 = pp.tracks.find((t) => t.kind === 'audio').id; const c = P.newClip('media', a1, 0, 75, { media: m.id, name: 'Voce', srcIn: 0 }); pp.clips.push(c); cid = c.id; });
      window.__dpv.select([cid]);
      window.__motore.vaiA(10);
      document.getElementById('app').classList.remove('senza-lato');
      return cid;
    });
    await page.waitForTimeout(1500);
    const sez = await page.evaluate(() => {
      const g = document.querySelector('.isp-gruppo[data-g=audioai]');
      return g ? { aperta: g.open, titolo: g.querySelector('summary').textContent, bottoni: [...g.querySelectorAll('.aai-bottone')].map((b) => b.textContent), disattivi: [...g.querySelectorAll('.aai-bottone')].filter((b) => b.disabled).length } : null;
    });
    prova('una clip audio ha la sezione "Audio: pulisci e separa (AI)", già aperta', !!sez && sez.aperta && /pulisci e separa/i.test(sez.titolo), JSON.stringify(sez));
    prova('ci sono i pulsanti: Leggera / Media / Forte / Voce isolata / Podcast / Podcast naturale per i rumori e Voce e base / Solo voce / Solo base', !!sez && ['Leggera', 'Media', 'Forte', 'Voce isolata', 'Podcast', 'Podcast naturale', 'Voce e base', 'Solo voce', 'Solo base'].every((t) => sez.bottoni.includes(t)), JSON.stringify(sez));
    prova('i pulsanti si possono premere (la clip ha audio)', !!sez && sez.disattivi === 0, JSON.stringify(sez));
    // la ricerca (Ctrl+K) trova i due comandi
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.cerca-campo, .cerca input', { timeout: 5000 }).catch(() => {});
    await page.keyboard.type('rumori');
    await page.waitForTimeout(500);
    const r1 = await page.evaluate(() => [...document.querySelectorAll('.cerca-voce b')].map((b) => b.textContent));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('separa voce');
    await page.waitForTimeout(500);
    const r2 = await page.evaluate(() => [...document.querySelectorAll('.cerca-voce b')].map((b) => b.textContent));
    await page.keyboard.press('Escape');
    prova('"rumori" e "separa voce" nella ricerca trovano i comandi dell\'audio AI', r1.some((t) => /rumori/i.test(t)) && r2.some((t) => /separa voce/i.test(t)), JSON.stringify({ r1, r2 }));
    // un giro vero: "Media" toglie i rumori col DeepFilterNet vero e la clip punta al file nuovo
    const prima = await page.evaluate((cid) => window.__dpv.doc.clips.find((x) => x.id === cid).media, id);
    await page.click('.aai-bottone:has-text("Media")');
    // mentre lavora: il bottone premuto dice "In corso" (con la percentuale), gli altri sono spenti, sotto compare la barra col testo
    await page.waitForFunction(() => !!document.querySelector('.aai-bottone.lavora'), null, { timeout: 8000 }).catch(() => {});
    const inCorso = await page.evaluate(() => {
      const b = document.querySelector('.aai-bottone.lavora');
      const st = document.querySelector('.aai-scheda[data-aai=rumore] .aai-stato');
      return { testo: b?.textContent, altriSpenti: [...document.querySelectorAll('.aai-bottone')].filter((x) => x !== b).every((x) => x.disabled), barra: !!st && !st.hidden && !!st.querySelector('.aai-barra'), stato: st?.querySelector('.aai-testo')?.textContent, altra: document.querySelector('.aai-scheda[data-aai=separa] .aai-stato')?.hidden };
    });
    prova('mentre toglie i rumori il bottone "Media" dice "In corso" (con la percentuale), gli altri sono spenti e sotto compare la barra', /In corso|In coda/.test(inCorso.testo ?? '') && inCorso.altriSpenti && inCorso.barra && inCorso.altra === true, JSON.stringify(inCorso));
    await page.waitForFunction((a) => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Voce'); return !!c && c.media !== a; }, prima, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(800);
    const dopo = await page.evaluate((cid) => { const d = window.__dpv.doc; const c = d.clips.find((x) => x.id === cid); const m = d.media.find((x) => x.id === c.media); return { cambiata: c.media !== d.clips.find((x) => x.id === cid)?.afx?.pulito?.media && !!c.afx?.pulito, nome: m?.name, forza: c.afx?.pulito?.forza }; }, id);
    prova('"Media" toglie i rumori davvero: la clip passa a un file nuovo (e ricorda l\'originale)', dopo.cambiata && dopo.forza === 'media', JSON.stringify(dopo));
    await page.waitForTimeout(600);
    const orig = await page.evaluate(() => [...document.querySelectorAll('.isp-gruppo[data-g=audioai] button')].some((b) => /Audio originale/.test(b.textContent)) || JSON.stringify({ sel: [...window.__dpv.sel], gruppi: [...document.querySelectorAll('.isp-gruppo')].map((g) => g.dataset.g) }));
    prova('dopo, compare "Audio originale" per tornare indietro', orig === true, String(orig));
    const riposo = await page.evaluate(() => ({ lavora: document.querySelectorAll('.aai-bottone.lavora').length, spenti: [...document.querySelectorAll('.aai-bottone')].filter((b) => b.disabled).length, testo: [...document.querySelectorAll('.aai-bottone')].map((b) => b.textContent).join('|') }));
    prova('finito il lavoro i bottoni tornano normali (niente "In corso" rimasto appeso)', riposo.lavora === 0 && riposo.spenti === 0 && !/In corso/.test(riposo.testo), JSON.stringify(riposo));
    await page.evaluate(() => { document.querySelectorAll('.isp-gruppo[data-g=audioai] button').forEach((b) => { if (/Audio originale/.test(b.textContent)) b.click(); }); });
    await page.waitForTimeout(500);
    const tornata = await page.evaluate(([a, cid]) => window.__dpv.doc.clips.find((x) => x.id === cid).media === a, [prima, id]);
    prova('"Audio originale" rimette il file di prima', tornata);
    prova('nessun errore nella pagina', errori.length === 0, errori.join(' | '));
  } finally {
    await contesto.close();
  }
}
