// Le prove dell'audio con l'AI (1.4.2): togliere i rumori da un parlato (DeepFilterNet3, il VERO: il suo wasm sta in dist/ai) e
// separare voce e base di una canzone (Demucs).
// Cosa è vero e cosa è finto, detto chiaro:
//  · il filtro del rumore è quello vero: il segnale è un "parlato" sintetico (treno di impulsi glottici nei formanti di una "a",
//    sillabe, frasi e pause) con rumore a livello noto; si misurano i dB nelle pause, l'allineamento al campione, la lunghezza;
//  · il modello Demucs vero (172 MB) dal container non si scarica: la STFT, i segmenti, la cucitura, la normalizzazione, il
//    ricampionamento e il resto si provano con un "modello" finto che ha le stesse forme in ingresso e in uscita (modelloFinto in
//    src/core/separa.ts) e con un file ONNX finto, fatto qui dentro, servito al posto di quello di Hugging Face e girato da ONNX
//    Runtime VERO (stessi tensori, stessa sessione, scarico con ripresa, cache);
//  · la qualità a orecchio, la scheda video (WebGPU) e la finestra di Tauri non si provano qui.
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs audioai`.

/** una pagina pulita (contesto nuovo) */
async function pagina(paginaDi) {
  const contesto = await paginaDi.context().browser().newContext({ viewport: { width: 1600, height: 950 } });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text()) && !/Failed to load resource|WebGPU/i.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

/** gli strumenti per le prove, dentro la pagina: segnali, WAV, misure */
const STRUMENTI = () => {
  const T = {};
  T.rnd = (seme) => { let s = seme >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296 - 0.5; };
  T.rms = (a, s = 0, e = a.length) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / Math.max(1, e - s)); };
  T.db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
  T.reson = (x, f, bw, sr) => {
    const r = Math.exp(-Math.PI * bw / sr), c = 2 * r * Math.cos(2 * Math.PI * f / sr), a = 1 - c + r * r;
    const y = new Float32Array(x.length); let y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = a * x[i] + c * y1 - r * r * y2; y[i] = v; y2 = y1; y1 = v; }
    return y;
  };
  /** parlato finto: impulsi glottici (f0 che si muove) nei formanti di una "a", sillabe a 4 Hz, 2 s di frase e 1 s di pausa */
  T.parlato = (sec, sr = 48000) => {
    const n = Math.round(sec * sr);
    const exc = new Float32Array(n);
    let fase = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; const f0 = 110 + 25 * Math.sin(2 * Math.PI * 0.6 * t); fase += f0 / sr; if (fase >= 1) { fase -= 1; exc[i] = 1; } }
    const v = new Float32Array(n);
    for (const [f, bw, g] of [[700, 90, 1], [1220, 110, 0.7], [2600, 160, 0.4], [3500, 200, 0.2]]) { const r = T.reson(exc, f, bw, sr); for (let i = 0; i < n; i++) v[i] += g * r[i]; }
    const out = new Float32Array(n);
    let pk = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; const dentro = (t % 3) < 2; const sill = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t - 1.2); out[i] = dentro ? v[i] * Math.pow(sill, 0.6) : 0; pk = Math.max(pk, Math.abs(out[i])); }
    return out.map((x) => (x / pk) * 0.5);
  };
  T.rumore = (n, ampiezza, seme) => { const r = T.rnd(seme); return Float32Array.from({ length: n }, () => r() * ampiezza); };
  T.somma = (a, b) => a.map((x, i) => x + b[i]);
  /** WAV a 16 bit con quanti canali vuoi */
  T.wav = (canali, sr) => {
    const nc = canali.length, n = canali[0].length;
    const buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
    const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * nc * 2, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const x = Math.max(-1, Math.min(1, canali[c][i])); v.setInt16(44 + (i * nc + c) * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Uint8Array(buf);
  };
  /** un WAV (16 bit o float32) con tutti i canali */
  T.leggiWav = async (file) => {
    const v = new DataView(await file.arrayBuffer());
    const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    let formato = 1, nc = 1, sr = 48000, bit = 16, o = 12, inizio = -1, lung = 0;
    while (o + 8 <= v.byteLength) {
      const nome = tag(o), n = v.getUint32(o + 4, true);
      if (nome === 'fmt ') { formato = v.getUint16(o + 8, true); nc = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bit = v.getUint16(o + 22, true); }
      else if (nome === 'data') { inizio = o + 8; lung = n; break; }
      o += 8 + n + (n & 1);
    }
    const nf = Math.floor(lung / (nc * bit / 8));
    const canali = Array.from({ length: nc }, () => new Float32Array(nf));
    for (let i = 0; i < nf; i++) for (let c = 0; c < nc; c++) {
      const p = inizio + (i * nc + c) * (bit / 8);
      canali[c][i] = formato === 3 ? v.getFloat32(p, true) : v.getInt16(p, true) / 32768;
    }
    return { sr, formato, bit, canali };
  };
  /** il ritardo (in campioni) per cui a e b si somigliano di più, cercando entro ±max; l'indice 0 di b cade a lag in a */
  T.ritardo = (a, b, max, passo = 2) => {
    let best = -Infinity, bl = 0;
    for (let l = -max; l <= max; l++) { let s = 0; for (let i = Math.max(0, l); i < Math.min(a.length, b.length + l); i += passo) s += a[i] * b[i - l]; if (s > best) { best = s; bl = l; } }
    return bl;
  };
  T.correlazione = (a, b) => { let n = 0, x = 0, y = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { n += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return n / Math.sqrt(x * y + 1e-30); };
  /** l'ampiezza di una sinusoide a frequenza f dentro x (proiezione), fra due campioni */
  T.ampiezza = (x, f, sr, da = 0, a = x.length) => { let c = 0, s = 0; for (let i = da; i < a; i++) { c += x[i] * Math.cos(2 * Math.PI * f * i / sr); s += x[i] * Math.sin(2 * Math.PI * f * i / sr); } return 2 * Math.hypot(c, s) / (a - da); };
  T.finito = (a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
  T.picco = (a) => { let p = 0; for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i])); return p; };
  /** un progetto con un file audio e una clip su A1: ritorna gli id */
  T.progetto = async (nome, canali, sr, { srcIn = 2, secondi = 5, start = 0 } = {}) => {
    const { P, importaFile } = window.__dpvTest;
    const s = window.__dpv;
    const p = P.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
    s.load(p);
    const file = new File([T.wav(canali, sr)], nome, { type: 'audio/wav' });
    const [m] = await importaFile([{ name: nome, file }], { chiediFormato: false });
    let id = '';
    s.edit('Prova', (pp) => {
      const a1 = pp.tracks.find((t) => t.kind === 'audio').id;
      const c = P.newClip('media', a1, start, Math.round(secondi * 25), { media: m.id, name: nome.replace(/\.wav$/, ''), srcIn });
      pp.clips.push(c);
      id = c.id;
    });
    return { clipId: id, mediaId: m.id };
  };
  window.__t = T;
};

// ——— il modello ONNX finto (formato protobuf scritto a mano) ———
// Ha gli stessi ingressi e le stesse uscite di htdemucs_embedded.onnx: waveform [1,2,343980] e spettro [1,4,2048,336] →
// tempo [1,4,2,343980] e frequenze [1,4,4,2048,336]. Dentro: due Mul. Nel tempo: batteria 10%, basso 10%, other 20%, voce 0; nelle
// frequenze: solo la voce, 60% → voce = 0,6·x (ramo STFT) e base = 0,4·x (ramo del tempo); in più un blocco di zeri per fare
// un file grosso abbastanza da scaricarlo a pezzi.
function onnxFinto(zerosMB = 3) {
  const vi = (n) => { const b = []; let x = BigInt(n); while (x > 127n) { b.push(Number(x & 127n) | 128); x >>= 7n; } b.push(Number(x)); return Buffer.from(b); };
  const tag = (f, w) => vi((f << 3) | w);
  const lun = (f, buf) => Buffer.concat([tag(f, 2), vi(buf.length), buf]);
  const str = (f, s) => lun(f, Buffer.from(s));
  const vint = (f, n) => Buffer.concat([tag(f, 0), vi(n)]);
  const tensore = (nome, dims, tipo, raw) => Buffer.concat([...dims.map((d) => vint(1, d)), vint(2, tipo), str(8, nome), lun(9, raw)]);
  const nodo = (op, ins, outs, nome) => Buffer.concat([...ins.map((i) => str(1, i)), ...outs.map((o) => str(2, o)), str(3, nome), str(4, op)]);
  const info = (nome, dims) => Buffer.concat([str(1, nome), lun(2, lun(1, Buffer.concat([vint(1, 1), lun(2, Buffer.concat(dims.map((d) => lun(1, vint(1, d)))))])))]);
  const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);
  const L = 343980;
  const inits = [
    tensore('ax1', [1], 7, Buffer.from(new BigInt64Array([1n]).buffer)),
    tensore('c_tempo', [1, 4, 1, 1], 1, f32([0.1, 0.1, 0.2, 0])),
    tensore('c_freq', [1, 4, 1, 1, 1], 1, f32([0, 0, 0, 0.6])),
  ];
  const nodi = [
    nodo('Unsqueeze', ['waveform', 'ax1'], ['w4'], 'u1'),
    nodo('Mul', ['w4', 'c_tempo'], ['tempo'], 'm1'),
    nodo('Unsqueeze', ['spettro', 'ax1'], ['s5'], 'u2'),
    nodo('Mul', ['s5', 'c_freq'], ['freq'], 'm2'),
  ];
  const grafo = Buffer.concat([...nodi.map((n) => lun(1, n)), str(2, 'demucs_finto'), ...inits.map((t) => lun(5, t)),
    lun(11, info('waveform', [1, 2, L])), lun(11, info('spettro', [1, 4, 2048, 336])),
    lun(12, info('tempo', [1, 4, 2, L])), lun(12, info('freq', [1, 4, 4, 2048, 336]))]);
  // zavorra: un campo sconosciuto in fondo al modello (i lettori di protobuf lo saltano) per fare un file grosso abbastanza da scaricarlo a pezzi
  return Buffer.concat([vint(1, 8), lun(8, vint(2, 17)), lun(7, grafo), lun(99, Buffer.alloc(zerosMB * 1048576))]);
}

export async function proveAudioAI({ page: paginaDi, prova }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    await page.evaluate(STRUMENTI);

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: i conti (ricampionamento, STFT, segmenti, cucitura, normalizzazione, ritardo del filtro)');
    const pure = await page.evaluate(() => {
      const { AAC, AAS, AAR } = window.__dpvTest;
      const T = window.__t;
      const out = {};
      // ricampionamento 48 → 44,1 → 48 e a pezzi
      const sine = (f, sr, n, a = 0.5, ph = 0.3) => Float32Array.from({ length: n }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr + ph));
      const errMax = (y, ref, margine) => { let m = 0; for (let i = margine; i < y.length - margine; i++) m = Math.max(m, Math.abs(y[i] - ref[i])); return m; };
      const x = sine(1000, 48000, 48000 * 3);
      const y = AAC.ricampionaSinc(x, 48000, 44100);
      out.ric = { len: y.length, attesa: AAC.lunghezzaUscita(x.length, 48000, 44100), err: errMax(y, sine(1000, 44100, y.length), 44100) };
      const y7 = AAC.ricampionaSinc(sine(7000, 44100, 44100 * 2), 44100, 48000);
      out.ric7 = errMax(y7, sine(7000, 48000, y7.length), 4800);
      const r = new AAC.Ricampionatore(48000, 44100);
      const parti = [];
      for (let o = 0; o < x.length; o += 7777) parti.push(r.processa(x.subarray(o, Math.min(x.length, o + 7777))));
      parti.push(r.fine());
      const cat = new Float32Array(parti.reduce((a, b) => a + b.length, 0)); let q = 0; for (const b of parti) { cat.set(b, q); q += b.length; }
      let dm = 0; for (let i = 0; i < cat.length; i++) dm = Math.max(dm, Math.abs(cat[i] - y[i]));
      out.pezzi = { len: cat.length, uguale: cat.length === y.length, diff: dm };
      const alto = AAC.ricampionaSinc(sine(23000, 48000, 48000), 48000, 44100);
      out.alias = T.db(T.rms(alto, 4410, alto.length - 4410) / T.rms(sine(23000, 48000, 48000)));
      out.dc = AAC.ricampionaSinc(new Float32Array(48000).fill(0.5), 48000, 44100)[20000];
      const andata = AAC.ricampionaSinc(AAC.ricampionaSinc(x, 48000, 44100), 44100, 48000);
      out.andataRitorno = { len: andata.length === x.length, err: errMax(andata, x, 4800) };

      // STFT → ISTFT: ricostruzione perfetta nel mezzo
      const rr = T.rnd(5);
      const seg = Float32Array.from({ length: 4096 * 12 }, () => rr());
      const sp = AAS.stft(seg, 4096, 1024);
      const ist = AAS.istft(sp.real, sp.imag, sp.frames, sp.bins, 4096, 1024, seg.length);
      out.stft = { frames: sp.frames, bins: sp.bins, err: errMax(ist, seg, 4096) };
      // la finestra e la scala: un seno puro di ampiezza 1 a bin 100 → modulo = A·N/2·(somma di hann/N)… basta che sia finito e simmetrico
      const rifl = AAS.riflessione(Float32Array.from([1, 2, 3, 4, 5]), 2, 2);
      out.rifl = Array.from(rifl);
      // ingresso del modello: le forme
      const pi = AAS.preparaIngresso(sine(440, 44100, 343980), sine(660, 44100, 343980));
      out.ingresso = { wave: pi.waveform.length, spettro: pi.spettro.length, finito: T.finito(pi.spettro) };
      // il piano dei segmenti
      const piano = (n) => AAS.pianoSegmenti(n);
      const L = AAS.DEMUCS.L;
      out.piani = { corto: piano(1000), esatto: piano(L), poco: piano(L + 10), lungo: piano(882000) };

      // l'accumulatore delle statistiche
      const st = new AAS.StatisticheMono(); st.aggiungi(Float32Array.from([1, 3]), Float32Array.from([1, 3])); st.aggiungi(Float32Array.from([2]));
      out.stat = { media: st.media, dev: st.dev };

      // il filtro del rumore con un filtro finto che ritarda di 1440 campioni e dimezza: l'uscita deve essere esattamente 0,5·ingresso
      const finto = () => {
        let storia = new Float32Array(AAR.RITARDO_DF);
        return { frameLength: 480, process(f) { const t = new Float32Array(storia.length + f.length); t.set(storia); t.set(f, storia.length); storia = t.slice(f.length); return t.slice(0, f.length).map((v) => v * 0.5); } };
      };
      const sig = T.parlato(2.5);
      const corri = (mescola, blocco) => {
        const p = new AAR.PulitoreMono(finto(), mescola);
        const ps = []; for (let o = 0; o < sig.length; o += blocco) ps.push(p.push(sig.slice(o, Math.min(sig.length, o + blocco)))); ps.push(p.fine());
        const o = new Float32Array(ps.reduce((a, b) => a + b.length, 0)); let k = 0; for (const b of ps) { o.set(b, k); k += b.length; } return o;
      };
      const confronta = (o, fattore) => { let m = 0; for (let i = 0; i < sig.length; i++) m = Math.max(m, Math.abs(o[i] - fattore * sig[i])); return m; };
      out.ritardo = {};
      for (const b of [480, 777, 1, 100000, 333]) { const o = corri(1, b); out.ritardo[b] = { len: o.length === sig.length, err: confronta(o, 0.5) }; }
      out.mescolato = { forte: confronta(corri(1, 1000), 0.5), media: confronta(corri(0.85, 1000), 0.85 * 0.5 + 0.15), leggera: confronta(corri(0.6, 1000), 0.6 * 0.5 + 0.4) };
      out.mescole = [AAR.mescolaDi('leggera'), AAR.mescolaDi('media'), AAR.mescolaDi('forte'), AAR.mescolaDi(undefined)];
      // stereo con il filtro finto: L e R tornano dimezzati e allineati
      const st2 = new AAR.PulitoreStereo(finto, 1);
      const L2 = sig, R2 = sig.map((v, i) => v * 0.5 + 0.1 * Math.sin(i / 50));
      const ls = [], rs = [];
      for (let o = 0; o < L2.length; o += 999) { const [a, b] = st2.push(L2.slice(o, o + 999), R2.slice(o, o + 999)); ls.push(a); rs.push(b); }
      { const [a, b] = st2.fine(); ls.push(a); rs.push(b); }
      const catt = (ar) => { const o = new Float32Array(ar.reduce((a, b) => a + b.length, 0)); let k = 0; for (const b of ar) { o.set(b, k); k += b.length; } return o; };
      const SL = catt(ls), SR = catt(rs);
      let e2 = 0; for (let i = 0; i < L2.length; i++) e2 = Math.max(e2, Math.abs(SL[i] - 0.5 * L2[i]), Math.abs(SR[i] - 0.5 * R2[i]));
      out.stereoFinto = { len: SL.length === L2.length && SR.length === R2.length, err: e2 };
      return out;
    });
    prova('ricampionamento 48→44,1 kHz: lunghezza esatta e un seno a 1 kHz resta un seno (errore sotto −90 dB), a 7 kHz da 44,1 a 48 pure', pure.ric.len === pure.ric.attesa && pure.ric.err < 3e-5 && pure.ric7 < 3e-5, JSON.stringify([pure.ric, pure.ric7]));
    prova('ricampionamento a pezzi = tutto insieme (differenza 0), andata e ritorno 48→44,1→48 riporta lo stesso segnale', pure.pezzi.uguale && pure.pezzi.diff === 0 && pure.andataRitorno.len && pure.andataRitorno.err < 5e-5, JSON.stringify([pure.pezzi, pure.andataRitorno]));
    prova('ricampionamento: oltre il taglio quello che non ci sta sparisce (23 kHz, −25 dB o meno), la continua passa intera', pure.alias < -25 && Math.abs(pure.dc - 0.5) < 1e-4, JSON.stringify([pure.alias, pure.dc]));
    prova('STFT → ISTFT dà indietro il segnale (errore sotto 1e-5) e la STFT ha la forma di Demucs (frame × 2049 bin)', pure.stft.err < 1e-5 && pure.stft.bins === 2049 && pure.stft.frames === 45, JSON.stringify(pure.stft));
    prova('riflessione ai bordi come "reflect" (il bordo non si ripete) e l\'ingresso del modello ha le forme giuste (2×343980 e 4×2048×336)', JSON.stringify(pure.rifl) === '[3,2,1,2,3,4,5,4,3]' && pure.ingresso.wave === 2 * 343980 && pure.ingresso.spettro === 4 * 2048 * 336 && pure.ingresso.finito, JSON.stringify([pure.rifl, pure.ingresso]));
    prova('piano dei segmenti: uno solo se ci sta, l\'ultimo si sposta indietro per finire sulla fine, sempre crescente e con almeno il 25% di sovrapposizione', pure.piani.corto.length === 1 && pure.piani.esatto.length === 1 && pure.piani.poco.length === 2 && pure.piani.poco[1] === 10 && pure.piani.lungo.join() === '0,257985,515970,538020' && pure.piani.lungo.every((s, i, a) => i === 0 || (s > a[i - 1] && a[i - 1] + 343980 - s >= 85995)), JSON.stringify(pure.piani));
    prova('media e deviazione standard del brano (a pezzi)', Math.abs(pure.stat.media - 2) < 1e-9 && Math.abs(pure.stat.dev - Math.sqrt(2 / 3)) < 1e-9, JSON.stringify(pure.stat));
    prova('rumore: con un filtro che ritarda di 1440 campioni l\'uscita è allineata al campione con l\'ingresso, della stessa lunghezza, con ogni dimensione di pezzo (anche un campione alla volta)', Object.values(pure.ritardo).every((r) => r.len && r.err < 1e-6), JSON.stringify(pure.ritardo));
    prova('rumore: la forza mescola pulito e originale (leggera 0,6 · media 0,85 · forte 1, di partenza media)', pure.mescolato.forte < 1e-6 && pure.mescolato.media < 1e-6 && pure.mescolato.leggera < 1e-6 && pure.mescole.join() === '0.6,0.85,1,0.85', JSON.stringify([pure.mescolato, pure.mescole]));
    prova('rumore stereo (centro e lati): L e R tornano allineati e della stessa lunghezza', pure.stereoFinto.len && pure.stereoFinto.err < 1e-6, JSON.stringify(pure.stereoFinto));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: Demucs a segmenti con il modello finto (STFT, segmenti, cucitura, normalizzazione, progresso, stop)');
    const dem = await page.evaluate(async () => {
      const { AAS } = window.__dpvTest;
      const T = window.__t;
      const SR = 44100, N = 14 * SR;
      const tono = (f, a, ph = 0) => Float32Array.from({ length: N }, (_, i) => a * Math.sin(2 * Math.PI * f * i / SR + ph));
      const mk = (amp) => {
        const b = tono(100, amp * 0.5), v = tono(1000, amp * 0.5, 0.7), h = tono(5000, amp * 0.3, 1.1), v2 = tono(1500, amp * 0.2, 0.2);
        const L = new Float32Array(N), R = new Float32Array(N);
        for (let i = 0; i < N; i++) { L[i] = b[i] + v[i] + h[i]; R[i] = b[i] + v[i] * 0.8 + v2[i]; }
        return { L, R };
      };
      const lancia = async (L, R, { chunk = 30011, dev, esegui, fermato, avanza } = {}) => {
        const st = new AAS.StatisticheMono(); st.aggiungi(L, R);
        const V = [], B = [];
        const sep = new AAS.SeparatoreDemucs({ totale: L.length, media: st.media, dev: dev === undefined ? st.dev : dev, esegui: esegui ?? AAS.modelloFinto(), uscita: (v, b) => { V.push(v); B.push(b); }, fermato, avanza });
        for (let o = 0; o < L.length; o += chunk) await sep.push(L.subarray(o, Math.min(L.length, o + chunk)), R.subarray(o, Math.min(R.length, o + chunk)));
        await sep.fine();
        const cat = (ar) => { const o = new Float32Array(ar.reduce((a, b) => a + b.length, 0)); let k = 0; for (const b of ar) { o.set(b, k); k += b.length; } return o; };
        return { vL: cat(V.map((x) => x[0])), vR: cat(V.map((x) => x[1])), bL: cat(B.map((x) => x[0])), bR: cat(B.map((x) => x[1])), pezzi: V.length };
      };
      const { L, R } = mk(0.4);
      const t0 = performance.now();
      const prog = [];
      const a = await lancia(L, R, { avanza: (k) => prog.push(k) });
      const ms = performance.now() - t0;
      const b = await lancia(L, R, { chunk: 100000 });
      const margine = SR; // i bordi del file (il primo e l'ultimo secondo) dipendono dal modello: il finto lascia lì un po' d'errore, come ogni modello
      let somma = 0, bordo = 0;
      for (let i = 0; i < N; i++) { const e = Math.max(Math.abs(a.vL[i] + a.bL[i] - L[i]), Math.abs(a.vR[i] + a.bR[i] - R[i])); if (i >= margine && i < N - margine) somma = Math.max(somma, e); else bordo = Math.max(bordo, e); }
      let diffChunk = 0; for (let i = 0; i < N; i++) diffChunk = Math.max(diffChunk, Math.abs(a.vL[i] - b.vL[i]), Math.abs(a.bL[i] - b.bL[i]));
      const A = (x, f) => T.ampiezza(x, f, SR, SR, N - SR);
      const bande = { f100: [A(L, 100), A(a.vL, 100), A(a.bL, 100)], f1000: [A(L, 1000), A(a.vL, 1000), A(a.bL, 1000)], f5000: [A(L, 5000), A(a.vL, 5000), A(a.bL, 5000)], f1500R: [A(R, 1500), A(a.vR, 1500), A(a.bR, 1500)] };
      // le giunture dei segmenti: nessun salto più grande della pendenza del segnale stesso
      let salto = 0; const giunte = AAS.pianoSegmenti(N);
      for (const s of giunte.slice(1)) for (let i = s - 5; i < s + 5; i++) salto = Math.max(salto, Math.abs(a.vL[i + 1] - a.vL[i]));
      let pendenza = 0; for (let i = 1; i < 2000; i++) pendenza = Math.max(pendenza, Math.abs(a.vL[SR + i] - a.vL[SR + i - 1]));
      // la normalizzazione: lo stesso brano a 1/200 del volume. Il modello finto "non sente" sotto 0,05 di rms: senza normalizzare tace
      const q = mk(0.4 / 200);
      const quieto = await lancia(q.L, q.R);
      const senza = await lancia(q.L, q.R, { dev: 0 });
      const rapp = (x) => T.rms(x, SR, N - SR) / T.rms(q.L, SR, N - SR);
      // lo stop
      let chiamate = 0, fermo = false;
      const modello = AAS.modelloFinto();
      let errStop = '';
      try { await lancia(L, R, { esegui: (w, s) => { chiamate++; return modello(w, s); }, fermato: () => chiamate >= 1 }); } catch (e) { errStop = e.message; fermo = true; }
      return { ms, N, pezzi: a.pezzi, lun: [a.vL.length, a.bL.length], somma, bordo, diffChunk, bande, salto, pendenza, prog, quieto: [rapp(quieto.vL), rapp(quieto.bL)], senza: [rapp(senza.vL), rapp(senza.bL)], errStop, fermo, chiamate };
    });
    prova('Demucs finto su 14 s (3 segmenti): voce e base della lunghezza giusta, escono nell\'ordine e senza buchi', dem.lun[0] === dem.N && dem.lun[1] === dem.N && dem.pezzi >= 3, JSON.stringify([dem.lun, dem.pezzi]));
    prova('voce + base = originale (errore sotto 2e-4 fuori dai bordi del file: la STFT, i segmenti e la cucitura non perdono niente)', dem.somma < 2e-4, `somma ${dem.somma} · bordi ${dem.bordo}`);
    prova('la voce è la banda del cantato (1 kHz al 75%), la base tiene basso, piatti e il resto del 1 kHz (25%); a destra lo stesso con 1,5 kHz', Math.abs(dem.bande.f1000[1] / dem.bande.f1000[0] - 0.75) < 0.02 && Math.abs(dem.bande.f1000[2] / dem.bande.f1000[0] - 0.25) < 0.02 && dem.bande.f100[1] < 0.01 && Math.abs(dem.bande.f100[2] / dem.bande.f100[0] - 1) < 0.02 && Math.abs(dem.bande.f5000[2] / dem.bande.f5000[0] - 1) < 0.02 && dem.bande.f5000[1] < 0.01 && Math.abs(dem.bande.f1500R[1] / dem.bande.f1500R[0] - 0.75) < 0.03, JSON.stringify(dem.bande));
    prova('cucitura dei segmenti: nelle giunture nessun salto (la differenza fra due campioni resta quella del segnale)', dem.salto <= dem.pendenza * 1.05 + 1e-4, `salto ${dem.salto} · pendenza ${dem.pendenza}`);
    prova('lo stesso risultato con pezzi d\'ingresso di dimensione diversa (differenza sotto 1e-6)', dem.diffChunk < 1e-6, String(dem.diffChunk));
    prova('l\'avanzamento sale fino a 1 senza tornare indietro', dem.prog.length >= 3 && dem.prog.every((k, i, a) => i === 0 || k >= a[i - 1]) && dem.prog.at(-1) === 1, JSON.stringify(dem.prog));
    prova('normalizzazione: un brano a 1/200 del volume viene separato lo stesso (voce + base ≈ 100%); senza, il modello non sente niente', dem.quieto[0] > 0.3 && Math.abs(dem.quieto[0] + dem.quieto[1] - 1.1) < 0.4 && dem.senza[0] < 0.01 && dem.senza[1] < 0.01, JSON.stringify([dem.quieto, dem.senza]));
    prova('lo stop ferma il giro prima del segmento dopo', dem.fermo && dem.errStop === 'fermato' && dem.chiamate === 1, JSON.stringify([dem.errStop, dem.chiamate]));
    console.log(`  ℹ Demucs finto: ${(dem.ms / 1000).toFixed(1)} s per ${dem.N / 44100} s di audio (solo i conti nostri: STFT e ISTFT in JavaScript, il modello è finto)`);

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: la separazione rapida (senza AI) dal centro dello stereo');
    const rap = await page.evaluate(async () => {
      const { AAS } = window.__dpvTest;
      const T = window.__t;
      const SR = 44100, N = 8 * SR;
      const L = new Float32Array(N), R = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / SR;
        const voce = 0.25 * Math.sin(2 * Math.PI * 300 * t) + 0.2 * Math.sin(2 * Math.PI * 900 * t + 0.4);
        const chit = 0.25 * Math.sin(2 * Math.PI * 440 * t + 1) + 0.15 * Math.sin(2 * Math.PI * 1320 * t);
        const basso = 0.3 * Math.sin(2 * Math.PI * 60 * t);
        L[i] = voce + basso + chit; R[i] = voce + basso;
      }
      const V = [], B = [];
      const sep = new AAS.SeparatoreRapido(SR, N, (v, b) => { V.push(v); B.push(b); });
      for (let o = 0; o < N; o += 9001) await sep.push(L.subarray(o, Math.min(N, o + 9001)), R.subarray(o, Math.min(N, o + 9001)));
      await sep.fine();
      const cat = (ar) => { const o = new Float32Array(ar.reduce((a, b) => a + b.length, 0)); let k = 0; for (const b of ar) { o.set(b, k); k += b.length; } return o; };
      const vL = cat(V.map((x) => x[0])), bL = cat(B.map((x) => x[0])), bR = cat(B.map((x) => x[1]));
      let somma = 0; for (let i = 0; i < N; i++) somma = Math.max(somma, Math.abs(vL[i] + bL[i] - L[i]), Math.abs(cat(V.map((x) => x[1]))[i] + bR[i] - R[i]));
      const A = (x, f) => T.ampiezza(x, f, SR, SR, N - SR);
      return { len: [vL.length, bL.length], somma, voce300: A(vL, 300) / 0.25, voce900: A(vL, 900) / 0.2, chitInVoce: A(vL, 440) / 0.25, chitInBase: A(bL, 440) / 0.25, bassoInVoce: A(vL, 60) / 0.3, bassoInBase: A(bL, 60) / 0.3, voceInBase: A(bL, 300) / 0.25 };
    });
    prova('rapido: voce + base = originale esatto (errore sotto 1e-6) e lunghezze giuste', rap.len[0] === 8 * 44100 && rap.len[1] === 8 * 44100 && rap.somma < 1e-6, JSON.stringify([rap.len, rap.somma]));
    prova('rapido: il cantato al centro finisce nella voce (≥ 85%), la chitarra spostata e il basso restano nella base (nella voce meno del 15%)', rap.voce300 > 0.85 && rap.voce900 > 0.85 && rap.chitInVoce < 0.15 && rap.chitInBase > 0.85 && rap.bassoInVoce < 0.15 && rap.bassoInBase > 0.85 && rap.voceInBase < 0.2, JSON.stringify(rap));
  } catch (e) {
    prova('le prove dell\'audio AI non si sono fermate', false, String(e && e.stack || e));
  }
  const dopo = await seconda(paginaDi, page, prova, errori);
  await contesto.close();
  return dopo;
}

async function seconda(paginaDi, page, prova, errori) {
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: togliere il rumore sul progetto, con DeepFilterNet3 vero');
    const T0 = Date.now();
    const rum = await page.evaluate(async () => {
      const T = window.__t;
      const { AA, AT } = window.__dpvTest;
      const s = window.__dpv;
      const SR = 48000;
      const puro = T.parlato(10, SR);
      const sporco = T.somma(puro, T.rumore(puro.length, 0.08, 7));
      const { clipId, mediaId } = await T.progetto('Intervista.wav', [sporco], SR, { srcIn: 2, secondi: 5 });
      const c0 = s.doc.clips.find((c) => c.id === clipId);
      const prima = { media: c0.media, srcIn: c0.srcIn, len: c0.len, mediaN: s.doc.media.length };
      const poss = AA.possibilita(c0);
      const out = { poss, prima };
      // durante il lavoro compare la riga nel Centro attività
      const t0 = performance.now();
      const lavoro = AA.togliRumore(clipId, 'forte');
      await new Promise((r) => setTimeout(r, 300));
      out.riga = AT.attivitaInCorso().map((r) => ({ titolo: r.titolo, categoria: r.categoria, annullabile: r.annullabile }));
      out.inUso = AA.lavoriAudioAI().get(clipId) ?? null;
      out.possDurante = AA.possibilita(c0);
      await lavoro;
      out.ms = performance.now() - t0;
      const c = s.doc.clips.find((x) => x.id === clipId);
      const m = s.doc.media.find((x) => x.id === c.media);
      out.dopo = { mediaCambiato: c.media !== prima.media, srcIn: c.srcIn, len: c.len, mediaN: s.doc.media.length, nome: m.name, dur: m.duration, sr: m.sampleRate, ch: m.channels, cartella: s.doc.cartelle?.find((k) => k.id === m.cartella)?.nome, pulito: c.afx?.pulito };
      out.originale = AA.haOriginale(c);
      const file = window.__dpvTest.mediaRT(m.id).file;
      const w = await T.leggiWav(file);
      const o = w.canali[0];
      out.wav = { sr: w.sr, bit: w.bit, n: o.length, finito: T.finito(o), picco: T.picco(o) };
      // il file nuovo parte da (srcIn − 1 s) del vecchio (margine di 1 s): la clip ora è a srcIn = 1 s
      const ini = Math.round(c.srcIn * SR), fine = ini + 5 * SR;
      const ref = puro.subarray(2 * SR, 7 * SR), usc = o.subarray(ini, fine), sp = sporco.subarray(2 * SR, 7 * SR);
      const pausa = (x, a, b) => T.db(T.rms(x, Math.round(a * SR), Math.round(b * SR)));
      out.misure = {
        lagPuro: T.ritardo(usc, ref, 400), lagSporco: T.ritardo(usc, sp, 400),
        // le pause nell'intervallo usato: 2–3 s e 5–6 s del file → 0–1 s e 3–4 s del tratto; si prende dopo 0,3 s dall'inizio della pausa
        pausa1: [pausa(sp, 0.3, 0.9), pausa(usc, 0.3, 0.9)], pausa2: [pausa(sp, 3.3, 3.9), pausa(usc, 3.3, 3.9)],
        voce: [pausa(sp, 1.2, 2.8), pausa(usc, 1.2, 2.8), pausa(ref, 1.2, 2.8)],
        corr: T.correlazione(usc.subarray(Math.round(1.1 * SR), Math.round(2.9 * SR)), ref.subarray(Math.round(1.1 * SR), Math.round(2.9 * SR))),
        primiDecimi: [pausa(usc, 3.05, 3.15), pausa(ref, 3.05, 3.15)],
      };
      out.ritmo = (5 + 0) / (out.ms / 1000);
      // annulla e ripeti
      s.doUndo();
      const u = s.doc.clips.find((x) => x.id === clipId);
      out.annulla = { media: u.media === prima.media, srcIn: u.srcIn === prima.srcIn, mediaN: s.doc.media.length, pulito: !!u.afx?.pulito };
      s.doRedo();
      const r = s.doc.clips.find((x) => x.id === clipId);
      out.ripeti = { mediaCambiato: r.media !== prima.media, pulito: !!r.afx?.pulito, srcIn: r.srcIn };
      // torna all'originale (e annulla il ritorno)
      AA.tornaOriginale(clipId);
      const t = s.doc.clips.find((x) => x.id === clipId);
      out.torna = { media: t.media === prima.media, srcIn: Math.abs(t.srcIn - prima.srcIn) < 1e-9, ancora: AA.haOriginale(t), pulito: !!t.afx?.pulito };
      s.doUndo();
      out.stato = await AA.statoAudioAI();
      return out;
    });
    console.log(`  ℹ DeepFilterNet3 vero, mono 48 kHz: ${rum.ms.toFixed(0)} ms per 5 s usati (+2 s di margine) = ${rum.ritmo.toFixed(1)}× il tempo reale, compresi lettura del file, WAV e import · prova durata ${((Date.now() - T0) / 1000).toFixed(0)} s`);
    console.log(`  ℹ rumore nelle pause, in → out (dB): ${rum.misure.pausa1.map((x) => x.toFixed(1)).join(' → ')} · ${rum.misure.pausa2.map((x) => x.toFixed(1)).join(' → ')} · voce ${rum.misure.voce.map((x) => x.toFixed(1)).join(' / ')} · correlazione con la voce pulita ${rum.misure.corr.toFixed(3)}`);
    prova('possibilita: una clip audio con audio si può pulire e separare', rum.poss.rumore && rum.poss.separa && !rum.poss.perche, JSON.stringify(rum.poss));
    prova('durante il lavoro: la riga è nel Centro attività (categoria AI, si può fermare), la clip risulta "in uso" e non se ne può far partire un\'altra', rum.riga.length === 1 && /Tolgo il rumore/.test(rum.riga[0].titolo) && rum.riga[0].categoria === 'ai' && rum.riga[0].annullabile && rum.inUso === 'rumore' && !rum.possDurante.rumore && /già/.test(rum.possDurante.perche), JSON.stringify([rum.riga, rum.inUso, rum.possDurante]));
    prova('togliRumore: la clip punta a un file nuovo "Intervista - pulito.wav" (WAV 48 kHz mono) nella cartella "Audio lavorato", il media è uno in più, la durata è la parte usata + 1 s per lato', rum.dopo.mediaCambiato && rum.dopo.nome === 'Intervista - pulito.wav' && rum.dopo.cartella === 'Audio lavorato' && rum.dopo.mediaN === rum.prima.mediaN + 1 && rum.dopo.sr === 48000 && rum.dopo.ch === 1 && Math.abs(rum.dopo.dur - 7) < 0.01 && rum.wav.n === 7 * 48000, JSON.stringify([rum.dopo, rum.wav]));
    prova('srcIn ricalcolato (1 s nel file nuovo = 2 s nell\'originale), durata della clip invariata, l\'originale si ricorda in afx.pulito', Math.abs(rum.dopo.srcIn - 1) < 1e-9 && rum.dopo.len === rum.prima.len && rum.dopo.pulito && rum.dopo.pulito.media === rum.prima.media && Math.abs(rum.dopo.pulito.da - 1) < 1e-9 && rum.dopo.pulito.srcIn === 2 && rum.dopo.pulito.forza === 'forte' && rum.originale, JSON.stringify(rum.dopo));
    prova('ALLINEAMENTO: l\'audio pulito è sul campione dell\'originale (correlazione incrociata: ritardo 0 sia con la voce pulita sia con l\'originale rumoroso, entro ±400 campioni)', rum.misure.lagPuro === 0 && rum.misure.lagSporco === 0, JSON.stringify(rum.misure));
    prova('rumore nelle pause: scende di almeno 25 dB (forte)', rum.misure.pausa1[0] - rum.misure.pausa1[1] > 25 && rum.misure.pausa2[0] - rum.misure.pausa2[1] > 25, JSON.stringify([rum.misure.pausa1, rum.misure.pausa2]));
    prova('la voce resta: livello entro 3 dB dalla voce pulita, forma d\'onda simile (correlazione ≥ 0,9)', Math.abs(rum.misure.voce[1] - rum.misure.voce[2]) < 3 && rum.misure.corr > 0.9, JSON.stringify(rum.misure));
    prova('niente NaN, niente valori fuori scala, WAV a 16 bit', rum.wav.finito && rum.wav.picco <= 1 && rum.wav.bit === 16 && rum.wav.sr === 48000, JSON.stringify(rum.wav));
    prova('annulla riporta file e punto di prima (e il media nuovo sparisce), ripeti rimette il pulito', rum.annulla.media && rum.annulla.srcIn && rum.annulla.mediaN === rum.prima.mediaN && !rum.annulla.pulito && rum.ripeti.mediaCambiato && rum.ripeti.pulito && Math.abs(rum.ripeti.srcIn - 1) < 1e-9, JSON.stringify([rum.annulla, rum.ripeti]));
    prova('tornaOriginale: file e punto di prima, niente più "originale a cui tornare"; si annulla anche lui', rum.torna.media && rum.torna.srcIn && !rum.torna.ancora && !rum.torna.pulito, JSON.stringify(rum.torna));
    prova('statoAudioAI: il filtro del rumore è pronto (dentro il programma), il modello della separazione da scaricare', rum.stato.rumore.stato === 'pronto' && /dentro il programma/.test(rum.stato.rumore.peso) && rum.stato.separa.stato === 'da-scaricare' && /172 MB/.test(rum.stato.separa.peso), JSON.stringify(rum.stato));
  } catch (e) {
    prova('le prove del rumore non si sono fermate', false, String(e && e.stack || e));
  }
  return terza(paginaDi, page, prova, errori);
}

async function terza(paginaDi, page, prova, errori) {
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: forze, stereo, sorgente a 44,1 kHz, clip che cambia, stop');
    const r2 = await page.evaluate(async () => {
      const T = window.__t;
      const { AA, AAC } = window.__dpvTest;
      const s = window.__dpv;
      const out = {};
      const misura = (usc, sp, ref, SR, ini) => {
        const p = (x, a, b) => T.db(T.rms(x, Math.round(a * SR), Math.round(b * SR)));
        return { pausa: p(sp, 0.3, 0.9) - p(usc, 0.3, 0.9), lag: T.ritardo(usc, ref, 300) };
      };
      // 1 · tre forze, stessa clip
      const SR = 48000;
      const puro = T.parlato(8, SR);
      const sporco = T.somma(puro, T.rumore(puro.length, 0.08, 11));
      out.forze = {};
      for (const f of ['leggera', 'media', 'forte']) {
        const { clipId } = await T.progetto('Forza.wav', [sporco], SR, { srcIn: 2, secondi: 4 });
        await AA.togliRumore(clipId, f);
        const c = s.doc.clips.find((x) => x.id === clipId);
        const w = await T.leggiWav(window.__dpvTest.mediaRT(c.media).file);
        const ini = Math.round(c.srcIn * SR);
        out.forze[f] = misura(w.canali[0].subarray(ini, ini + 4 * SR), sporco.subarray(2 * SR, 6 * SR), puro.subarray(2 * SR, 6 * SR), SR);
      }
      // 2 · cambiare la forza di una clip già pulita riparte dall'originale (non si pulisce il pulito)
      {
        const { clipId, mediaId } = await T.progetto('Forza2.wav', [sporco], SR, { srcIn: 2, secondi: 4 });
        await AA.togliRumore(clipId, 'leggera');
        const dopoPrima = s.doc.clips.find((x) => x.id === clipId).media;
        await AA.togliRumore(clipId, 'forte');
        const c = s.doc.clips.find((x) => x.id === clipId);
        out.ripulita = { origine: c.afx.pulito.media === mediaId, forza: c.afx.pulito.forza, cambiato: c.media !== dopoPrima, srcIn: c.srcIn, da: c.afx.pulito.da, mediaN: s.doc.media.length };
        AA.tornaOriginale(clipId);
        const t = s.doc.clips.find((x) => x.id === clipId);
        out.ripulita.torna = t.media === mediaId && Math.abs(t.srcIn - 2) < 1e-9;
      }
      // 3 · stereo con rumore diverso a destra e a sinistra: due canali, allineati, rumore giù, nessun NaN
      {
        const L = T.somma(puro, T.rumore(puro.length, 0.08, 21)), R = T.somma(puro, T.rumore(puro.length, 0.08, 22));
        const { clipId } = await T.progetto('Stereo.wav', [L, R], SR, { srcIn: 2, secondi: 4 });
        await AA.togliRumore(clipId, 'forte');
        const c = s.doc.clips.find((x) => x.id === clipId);
        const m = s.doc.media.find((x) => x.id === c.media);
        const w = await T.leggiWav(window.__dpvTest.mediaRT(c.media).file);
        const ini = Math.round(c.srcIn * SR);
        out.stereo = { ch: w.canali.length, mch: m.channels, finito: w.canali.every((x) => T.finito(x)), L: misura(w.canali[0].subarray(ini, ini + 4 * SR), L.subarray(2 * SR, 6 * SR), puro.subarray(2 * SR, 6 * SR), SR), R: misura(w.canali[1].subarray(ini, ini + 4 * SR), R.subarray(2 * SR, 6 * SR), puro.subarray(2 * SR, 6 * SR), SR), n: w.canali[0].length };
      }
      // 4 · due canali uguali → uscita con i due canali uguali
      {
        const L = T.somma(puro, T.rumore(puro.length, 0.08, 31));
        const { clipId } = await T.progetto('DueUguali.wav', [L, L], SR, { srcIn: 2, secondi: 3 });
        await AA.togliRumore(clipId, 'media');
        const c = s.doc.clips.find((x) => x.id === clipId);
        const w = await T.leggiWav(window.__dpvTest.mediaRT(c.media).file);
        let d = 0; for (let i = 0; i < w.canali[0].length; i++) d = Math.max(d, Math.abs(w.canali[0][i] - w.canali[1][i]));
        out.uguali = { d };
      }
      // 5 · sorgente a 44,1 kHz: il file pulito è a 48 kHz, ma sta sullo stesso istante
      {
        const S2 = 44100;
        const puro2 = AAC.ricampionaSinc(puro, SR, S2);
        const sp2 = T.somma(puro2, T.rumore(puro2.length, 0.08, 41));
        const { clipId } = await T.progetto('Cd.wav', [sp2], S2, { srcIn: 2, secondi: 4 });
        await AA.togliRumore(clipId, 'forte');
        const c = s.doc.clips.find((x) => x.id === clipId);
        const m = s.doc.media.find((x) => x.id === c.media);
        const w = await T.leggiWav(window.__dpvTest.mediaRT(c.media).file);
        const ini = Math.round(c.srcIn * SR);
        out.cd = { sr: m.sampleRate, dur: m.duration, ...misura(w.canali[0].subarray(ini, ini + 4 * SR), AAC.ricampionaSinc(sp2, S2, SR).subarray(2 * SR, 6 * SR), puro.subarray(2 * SR, 6 * SR), SR) };
      }
      // 6 · una clip con la velocità cambiata: il tratto lavorato è quello letto (srcIn … srcIn + durata × velocità)
      {
        const { clipId } = await T.progetto('Veloce.wav', [sporco], SR, { srcIn: 1, secondi: 2 });
        s.edit('Velocità', (p) => { p.clips.find((x) => x.id === clipId).speed = 2; });
        await AA.togliRumore(clipId, 'media');
        const c = s.doc.clips.find((x) => x.id === clipId);
        const m = s.doc.media.find((x) => x.id === c.media);
        // letti 2 s × 2 = 4 s di file + 1 s per lato (parte da 0: il margine davanti è solo 1 s)
        out.veloce = { speed: c.speed, dur: m.duration, srcIn: c.srcIn, da: c.afx.pulito.da };
      }
      return out;
    });
    console.log(`  ℹ pause: forza leggera ${r2.forze.leggera.pausa.toFixed(1)} dB · media ${r2.forze.media.pausa.toFixed(1)} dB · forte ${r2.forze.forte.pausa.toFixed(1)} dB in meno · stereo ${r2.stereo.L.pausa.toFixed(1)}/${r2.stereo.R.pausa.toFixed(1)} dB`);
    prova('le tre forze: leggera toglie circa 8 dB nelle pause, media circa 16, forte oltre 25 (mescola 0,6 · 0,85 · 1), tutte allineate', r2.forze.leggera.pausa > 6 && r2.forze.leggera.pausa < 10.5 && r2.forze.media.pausa > 13.5 && r2.forze.media.pausa < 19 && r2.forze.forte.pausa > 25 && ['leggera', 'media', 'forte'].every((f) => r2.forze[f].lag === 0), JSON.stringify(r2.forze));
    prova('una clip già pulita si ripulisce partendo dall\'ORIGINALE (nuova forza, stesso originale, un media in più per ogni lavorazione), e "torna all\'originale" torna al file vero', r2.ripulita.origine && r2.ripulita.forza === 'forte' && r2.ripulita.cambiato && Math.abs(r2.ripulita.srcIn - 1) < 1e-9 && Math.abs(r2.ripulita.da - 1) < 1e-9 && r2.ripulita.torna, JSON.stringify(r2.ripulita));
    prova('stereo (rumore diverso a destra e a sinistra): file a 2 canali, rumore giù di oltre 20 dB su tutti e due, allineati, nessun NaN', r2.stereo.ch === 2 && r2.stereo.mch === 2 && r2.stereo.finito && r2.stereo.L.pausa > 20 && r2.stereo.R.pausa > 20 && r2.stereo.L.lag === 0 && r2.stereo.R.lag === 0 && r2.stereo.n === 6 * 48000, JSON.stringify(r2.stereo));
    prova('due canali uguali → uscita con i due canali uguali (centro e lati: l\'immagine non ondeggia)', r2.uguali.d < 1e-6, JSON.stringify(r2.uguali));
    prova('sorgente a 44,1 kHz: il file pulito è a 48 kHz, stessa durata, e sta sullo stesso istante (ritardo 0)', r2.cd.sr === 48000 && Math.abs(r2.cd.dur - 6) < 0.01 && r2.cd.lag === 0 && r2.cd.pausa > 20, JSON.stringify(r2.cd));
    prova('clip a velocità doppia: si lavora il tratto che la clip legge (4 s di file + il margine: 5 s qui, perché davanti c\'è solo 1 s), la velocità resta', r2.veloce.speed === 2 && Math.abs(r2.veloce.dur - 6) < 0.02 && Math.abs(r2.veloce.srcIn - 1) < 1e-9 && Math.abs(r2.veloce.da) < 1e-9, JSON.stringify(r2.veloce));

    // ——— stop e clip cambiata
    const st = await page.evaluate(async () => {
      const T = window.__t;
      const { AA, AT } = window.__dpvTest;
      const s = window.__dpv;
      const SR = 48000;
      const puro = T.parlato(60, SR);
      const sporco = T.somma(puro, T.rumore(puro.length, 0.08, 51));
      const out = {};
      // stop dal Centro attività
      {
        const { clipId } = await T.progetto('Lungo.wav', [sporco], SR, { srcIn: 1, secondi: 55 });
        const prima = { media: s.doc.clips[0].media, mediaN: s.doc.media.length, dirty: s.doc.clips.length };
        let esito = '';
        const lavoro = AA.togliRumore(clipId, 'media').then(() => { esito = 'finito'; }, (e) => { esito = e.message; });
        // si ferma quando il filtro è partito davvero (la prima volta il wasm da 34 MB ci mette un po' a prepararsi)
        for (let i = 0; i < 200 && !((AT.attivitaInCorso()[0]?.k ?? 0) > 0.02); i++) await new Promise((r) => setTimeout(r, 100));
        const riga = AT.attivitaInCorso()[0];
        out.durante = riga ? { k: riga.k, dettaglio: riga.dettaglio, titolo: riga.titolo } : null;
        if (riga) AT.fermaRiga(riga.id);
        await lavoro;
        const c = s.doc.clips.find((x) => x.id === clipId);
        out.stop = { esito, media: c.media === prima.media, mediaN: s.doc.media.length === prima.mediaN, pulito: !!c.afx?.pulito, inUso: AA.lavoriAudioAI().size, righe: AT.attivitaInCorso().length, finita: AT.attivitaFinite()[0]?.stato };
      }
      // la clip cambia mentre si lavora: allungata oltre il tratto → non si applica
      {
        const { clipId } = await T.progetto('Cambia.wav', [sporco], SR, { srcIn: 1, secondi: 20 });
        const prima = { media: s.doc.clips[0].media, mediaN: s.doc.media.length };
        let esito = '';
        const lavoro = AA.togliRumore(clipId, 'media').then(() => { esito = 'finito'; }, (e) => { esito = e.message; });
        await new Promise((r) => setTimeout(r, 600));
        s.edit('Allungo', (p) => { const c = p.clips.find((x) => x.id === clipId); c.len += 25 * 10; });
        await lavoro;
        const c = s.doc.clips.find((x) => x.id === clipId);
        out.cambiata = { esito, media: c.media === prima.media, mediaN: s.doc.media.length === prima.mediaN, len: c.len };
      }
      // la clip sparisce mentre si lavora
      {
        const { clipId } = await T.progetto('Sparisce.wav', [sporco], SR, { srcIn: 1, secondi: 20 });
        const mediaN = s.doc.media.length;
        let esito = '';
        const lavoro = AA.togliRumore(clipId, 'media').then(() => { esito = 'finito'; }, (e) => { esito = e.message; });
        await new Promise((r) => setTimeout(r, 600));
        s.edit('Tolgo', (p) => { p.clips = p.clips.filter((x) => x.id !== clipId); });
        await lavoro;
        out.sparita = { esito, mediaN: s.doc.media.length === mediaN, clip: s.doc.clips.length };
      }
      return out;
    });
    // quanto costa: i secondi di lavoro per secondo di audio, a regime (si misura su 25 s, con un giro corto prima per il wasm)
    const perf = await page.evaluate(async () => {
      const T = window.__t;
      const { AA } = window.__dpvTest;
      const SR = 48000;
      const base = T.parlato(30, SR);
      const sp = (seme) => T.somma(base, T.rumore(base.length, 0.08, seme));
      const giro = async (nome, canali, secondi) => {
        const { clipId } = await T.progetto(nome, canali, SR, { srcIn: 2, secondi });
        const t0 = performance.now();
        await AA.togliRumore(clipId, 'media');
        return performance.now() - t0;
      };
      const out = {};
      out.corto = await giro('Corto.wav', [sp(61)], 1);
      out.mono = await giro('PerfMono.wav', [sp(62)], 25);
      out.stereo = await giro('PerfStereo.wav', [sp(63), sp(64)], 25);
      return out;
    });
    console.log(`  ℹ costo (DeepFilterNet3 vero, 48 kHz): giro da 1 s (3 s lavorati) ${perf.corto.toFixed(0)} ms · mono 25 s (27 s lavorati) ${perf.mono.toFixed(0)} ms = ${(27 / (perf.mono / 1000)).toFixed(1)}× il tempo reale · stereo 25 s ${perf.stereo.toFixed(0)} ms = ${(27 / (perf.stereo / 1000)).toFixed(1)}× (comprese lettura, WAV, import; Chromium senza scheda video)`);
    prova('il costo del rumore è ragionevole: più veloce del tempo reale anche in stereo (misura sopra)', perf.mono < 27000 && perf.stereo < 27000, JSON.stringify(perf));
    prova('stop dal Centro attività mentre lavora: la funzione risponde "fermato", il progetto non cambia (file, media, niente "pulito"), la riga si chiude', st.stop.esito === 'fermato' && st.stop.media && st.stop.mediaN && !st.stop.pulito && st.stop.inUso === 0 && st.stop.righe === 0 && st.stop.finita === 'annullata' && st.durante && st.durante.k > 0 && /Tolgo il rumore/.test(st.durante.titolo), JSON.stringify(st));
    prova('clip allungata durante il lavoro oltre il tratto lavorato: non si applica niente e lo dice (in italiano)', /allungata/.test(st.cambiata.esito) && st.cambiata.media && st.cambiata.mediaN, JSON.stringify(st.cambiata));
    prova('clip tolta durante il lavoro: non si applica niente e lo dice', /tolta/.test(st.sparita.esito) && st.sparita.mediaN && st.sparita.clip === 0, JSON.stringify(st.sparita));
  } catch (e) {
    prova('le prove del rumore (secondo giro) non si sono fermate', false, String(e && e.stack || e));
  }
  return quarta(paginaDi, page, prova, errori);
}

async function quarta(paginaDi, page, prova, errori) {
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: voce e base sul progetto (worker, modello finto a forme vere)');
    const sep = await page.evaluate(async () => {
      const T = window.__t;
      const { AA, AT } = window.__dpvTest;
      const s = window.__dpv;
      const SR = 48000, N = 16 * SR;
      const tono = (f, a, ph = 0, sr = SR) => Float32Array.from({ length: N }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr + ph));
      const b = tono(100, 0.2), v = tono(1000, 0.2, 0.7), h = tono(5000, 0.12, 1.1), h2 = tono(5000, 0.12, 2.1);
      const L = b.map((x, i) => x + v[i] + h[i]), R = b.map((x, i) => x + v[i] + h2[i]);
      AA.impostaProveAudioAI({ finta: {} });
      const out = {};
      const { clipId, mediaId } = await T.progetto('Canzone.wav', [L, R], SR, { srcIn: 2, secondi: 10 });
      s.edit('Gain', (p) => { const c = p.clips.find((x) => x.id === clipId); c.gain = -3; c.fadeIn = 5; c.pan = 0.2; });
      const prima = { tracce: s.doc.tracks.length, media: s.doc.media.length, clip: s.doc.clips.length };
      const t0 = performance.now();
      const lavoro = AA.separaVoceBase(clipId);
      await new Promise((r) => setTimeout(r, 400));
      out.riga = AT.attivitaInCorso().map((r) => r.titolo);
      await lavoro;
      out.ms = performance.now() - t0;
      const orig = s.doc.clips.find((x) => x.id === clipId);
      const nuove = s.doc.clips.filter((x) => x.id !== clipId);
      const traccia = (c) => s.doc.tracks.find((t) => t.id === c.track);
      const voce = nuove.find((c) => /^Voce:/.test(c.name)), base = nuove.find((c) => /^Base:/.test(c.name));
      out.dopo = {
        tracce: s.doc.tracks.length - prima.tracce, media: s.doc.media.length - prima.media, clip: nuove.length,
        nomiTracce: [traccia(voce)?.name, traccia(base)?.name], tipoTracce: [traccia(voce)?.kind, traccia(base)?.kind],
        stessoPunto: nuove.every((c) => c.start === orig.start && c.len === orig.len && c.speed === orig.speed),
        srcIn: [voce.srcIn, base.srcIn], gain: [voce.gain, base.gain, orig.gain], fade: [voce.fadeIn, base.fadeIn], pan: [voce.pan, base.pan],
        origSilenzio: orig.gain === -60 && orig.gainKeys.length === 0, origAfx: orig.afx?.separata?.ruolo, origGainPrima: orig.afx?.separata?.gain, origCon: orig.afx?.separata?.con?.length,
        ruoli: [voce.afx?.separata?.ruolo, base.afx?.separata?.ruolo], cartella: s.doc.media.slice(prima.media).map((m) => s.doc.cartelle?.find((k) => k.id === m.cartella)?.nome),
        nomiMedia: s.doc.media.slice(prima.media).map((m) => m.name), sr: s.doc.media.slice(prima.media).map((m) => m.sampleRate), selezione: [...s.sel].length,
      };
      // l'audio: voce, base e somma contro l'originale (nella parte usata, con il ritardo 0)
      const wv = await T.leggiWav(window.__dpvTest.mediaRT(voce.media).file), wb = await T.leggiWav(window.__dpvTest.mediaRT(base.media).file);
      const ini = Math.round(voce.srcIn * SR), n = 10 * SR;
      const O = [L.subarray(2 * SR, 2 * SR + n), R.subarray(2 * SR, 2 * SR + n)];
      let err = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(wv.canali[c][ini + i] + wb.canali[c][ini + i] - O[c][i]));
      const A = (x, f) => T.ampiezza(x, f, SR, 0, n);
      const vL = wv.canali[0].subarray(ini, ini + n), bL = wb.canali[0].subarray(ini, ini + n);
      out.audio = {
        formato: [wv.formato, wv.bit, wv.sr, wv.canali.length, wb.canali.length], lunghezze: [wv.canali[0].length, wb.canali[0].length],
        errore: err, lag: T.ritardo(Float32Array.from(vL, (x, i) => x + bL[i]), O[0], 200, 3), finito: T.finito(vL) && T.finito(bL),
        voce1k: A(vL, 1000) / 0.2, base1k: A(bL, 1000) / 0.2, base100: A(bL, 100) / 0.2, voce100: A(vL, 100) / 0.2, base5k: A(bL, 5000) / 0.12, voce5k: A(vL, 5000) / 0.12,
      };
      // annulla toglie tutto
      s.doUndo();
      out.annulla = { tracce: s.doc.tracks.length === prima.tracce, media: s.doc.media.length === prima.media, clip: s.doc.clips.length === prima.clip, gain: s.doc.clips[0].gain, afx: !!s.doc.clips[0].afx?.separata, cartelle: s.doc.cartelle?.some((k) => k.nome === 'Audio lavorato') ?? false };
      s.doRedo();
      out.ripeti = { tracce: s.doc.tracks.length - prima.tracce, clip: s.doc.clips.length - prima.clip };
      s.doUndo();
      // una sola traccia (solo la voce)
      await AA.separaVoceBase(clipId, { tieni: 'voce' });
      out.soloVoce = { tracce: s.doc.tracks.length - prima.tracce, media: s.doc.media.length - prima.media, nome: s.doc.tracks.at(-1).name, silenzio: s.doc.clips.find((x) => x.id === clipId).gain };
      s.doUndo();
      // un brano mono resta mono
      {
        const m = L.map((x, i) => x * 0.5 + R[i] * 0.5);
        const { clipId: c2 } = await T.progetto('Mono.wav', [m], SR, { srcIn: 2, secondi: 6 });
        await AA.separaVoceBase(c2);
        const cv = s.doc.clips.find((x) => /^Voce:/.test(x.name));
        const w = await T.leggiWav(window.__dpvTest.mediaRT(cv.media).file);
        out.mono = { canali: w.canali.length, n: w.canali[0].length, atteso: 8 * SR, voce1k: T.ampiezza(w.canali[0].subarray(Math.round(cv.srcIn * SR), Math.round(cv.srcIn * SR) + 6 * SR), 1000, SR, 0, 6 * SR) / 0.2 };
      }
      // a 44,1 kHz non serve ricampionare: la stessa prova passa dall'altra strada
      {
        const S2 = 44100, N2 = 12 * S2;
        const x1 = Float32Array.from({ length: N2 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 100 * i / S2) + 0.2 * Math.sin(2 * Math.PI * 1000 * i / S2 + 0.5));
        const { clipId: c3 } = await T.progetto('Cd.wav', [x1, x1], S2, { srcIn: 1, secondi: 8 });
        await AA.separaVoceBase(c3);
        const cv = s.doc.clips.find((x) => /^Voce:/.test(x.name)), cb = s.doc.clips.find((x) => /^Base:/.test(x.name));
        const wv2 = await T.leggiWav(window.__dpvTest.mediaRT(cv.media).file), wb2 = await T.leggiWav(window.__dpvTest.mediaRT(cb.media).file);
        const i0 = Math.round(cv.srcIn * S2);
        let e = 0; for (let i = 0; i < 8 * S2; i++) e = Math.max(e, Math.abs(wv2.canali[0][i0 + i] + wb2.canali[0][i0 + i] - x1[S2 + i]));
        out.cd = { sr: wv2.sr, err: e, srcIn: cv.srcIn };
      }
      AA.impostaProveAudioAI(null);
      return out;
    });
    console.log(`  ℹ voce e base (modello finto, 10 s usati su file a 48 kHz): ${(sep.ms / 1000).toFixed(1)} s in tutto, compresi lettura, ricampionamento 48→44,1→48, STFT/ISTFT in JavaScript e scrittura dei due WAV`);
    prova('durante il lavoro la riga "Separo voce e base" è nel Centro attività', sep.riga.length === 1 && /Separo voce e base/.test(sep.riga[0]), JSON.stringify(sep.riga));
    prova('separaVoceBase: due tracce audio nuove "Voce · …" e "Base · …", due media in più (WAV float, 48 kHz, nella cartella "Audio lavorato"), due clip nuove nello stesso punto, durata e velocità dell\'originale; le nuove sono scelte', sep.dopo.tracce === 2 && sep.dopo.media === 2 && sep.dopo.clip === 2 && /^Voce · Canzone/.test(sep.dopo.nomiTracce[0]) && /^Base · Canzone/.test(sep.dopo.nomiTracce[1]) && sep.dopo.tipoTracce.join() === 'audio,audio' && sep.dopo.stessoPunto && sep.dopo.cartella.every((n) => n === 'Audio lavorato') && sep.dopo.nomiMedia.join() === 'Canzone - voce.wav,Canzone - base.wav' && sep.dopo.sr.every((x) => x === 48000) && sep.dopo.selezione === 2, JSON.stringify(sep.dopo));
    prova('le clip nuove prendono volume, dissolvenza e panorama dell\'originale; srcIn ricalcolato (1 s nel file nuovo = 2 s nell\'originale)', sep.dopo.gain[0] === -3 && sep.dopo.gain[1] === -3 && sep.dopo.fade.join() === '5,5' && sep.dopo.pan.join() === '0.2,0.2' && Math.abs(sep.dopo.srcIn[0] - 1) < 1e-9 && Math.abs(sep.dopo.srcIn[1] - 1) < 1e-9, JSON.stringify([sep.dopo.gain, sep.dopo.fade, sep.dopo.pan, sep.dopo.srcIn]));
    prova('l\'originale resta ma va in silenzio (−60 dB), si ricorda il volume di prima e chi sono voce e base', sep.dopo.origSilenzio && sep.dopo.origAfx === 'originale' && sep.dopo.origGainPrima === -3 && sep.dopo.origCon === 2 && sep.dopo.ruoli.join() === 'voce,base', JSON.stringify(sep.dopo));
    prova('l\'audio: WAV float32 stereo a 48 kHz, lunghezza = parte usata + 1 s per lato (12 s), niente NaN', sep.audio.formato.join() === '3,32,48000,2,2' && sep.audio.lunghezze.join() === '576000,576000' && sep.audio.finito, JSON.stringify(sep.audio));
    prova('VOCE + BASE = ORIGINALE (errore massimo sotto 3e-4 nella parte usata, con il ritardo a zero), anche dopo 48 → 44,1 → 48 kHz', sep.audio.errore < 3e-4 && sep.audio.lag === 0, JSON.stringify([sep.audio.errore, sep.audio.lag]));
    prova('il modello finto ha messo il 75% dell\'1 kHz nella voce e il resto (basso, piatti, 25% dell\'1 kHz) nella base', Math.abs(sep.audio.voce1k - 0.75) < 0.02 && Math.abs(sep.audio.base1k - 0.25) < 0.02 && sep.audio.voce100 < 0.01 && Math.abs(sep.audio.base100 - 1) < 0.02 && sep.audio.voce5k < 0.01 && Math.abs(sep.audio.base5k - 1) < 0.02, JSON.stringify(sep.audio));
    prova('annulla toglie tutto (tracce, media, clip nuove, silenzio dell\'originale, la cartella); ripeti rimette le due tracce', sep.annulla.tracce && sep.annulla.media && sep.annulla.clip && sep.annulla.gain === -3 && !sep.annulla.afx && !sep.annulla.cartelle && sep.ripeti.tracce === 2 && sep.ripeti.clip === 2, JSON.stringify([sep.annulla, sep.ripeti]));
    prova('tieni: "voce" fa una traccia sola (l\'originale va in silenzio lo stesso)', sep.soloVoce.tracce === 1 && sep.soloVoce.media === 1 && /^Voce · /.test(sep.soloVoce.nome) && sep.soloVoce.silenzio === -60, JSON.stringify(sep.soloVoce));
    prova('un brano mono dà voce e base mono, della lunghezza giusta, con la voce dentro', sep.mono.canali === 1 && sep.mono.n === 8 * 48000 && Math.abs(sep.mono.voce1k - 0.75) < 0.05, JSON.stringify(sep.mono));
    prova('un brano a 44,1 kHz non passa dal ricampionamento: il file nuovo è a 44,1 kHz e voce + base = originale', sep.cd.sr === 44100 && sep.cd.err < 3e-4 && Math.abs(sep.cd.srcIn - 1) < 1e-9, JSON.stringify(sep.cd));
  } catch (e) {
    prova('le prove di voce e base non si sono fermate', false, String(e && e.stack || e));
  }
  return quinta(paginaDi, page, prova, errori);
}

async function quinta(paginaDi, page, prova, errori) {
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: il ripiego rapido nel progetto, e il modello che non c\'è');
    const rip = await page.evaluate(async () => {
      const T = window.__t;
      const { AA } = window.__dpvTest;
      const s = window.__dpv;
      const SR = 44100, N = 10 * SR;
      const L = new Float32Array(N), R = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / SR;
        const voce = 0.25 * Math.sin(2 * Math.PI * 300 * t) + 0.2 * Math.sin(2 * Math.PI * 900 * t + 0.4);
        const chit = 0.25 * Math.sin(2 * Math.PI * 440 * t + 1);
        L[i] = voce + chit; R[i] = voce;
      }
      const out = {};
      const testi = () => [...document.querySelectorAll('.avviso')].map((e) => e.textContent);
      AA.impostaProveAudioAI({ ripiego: 'solo' });
      const { clipId } = await T.progetto('Stereo.wav', [L, R], SR, { srcIn: 1, secondi: 8 });
      await AA.separaVoceBase(clipId, { rapido: true });
      out.avvisoRapido = testi().find((t) => /rapid/i.test(t)) ?? null;
      {
        const cv = s.doc.clips.find((x) => /^Voce:/.test(x.name)), cb = s.doc.clips.find((x) => /^Base:/.test(x.name));
        const wv = await T.leggiWav(window.__dpvTest.mediaRT(cv.media).file), wb = await T.leggiWav(window.__dpvTest.mediaRT(cb.media).file);
        const i0 = Math.round(cv.srcIn * SR);
        const A = (x, f) => T.ampiezza(x.subarray(i0, i0 + 8 * SR), f, SR, 0, 8 * SR);
        let e = 0; for (let i = 0; i < 8 * SR; i++) e = Math.max(e, Math.abs(wv.canali[0][i0 + i] + wb.canali[0][i0 + i] - L[SR + i]), Math.abs(wv.canali[1][i0 + i] + wb.canali[1][i0 + i] - R[SR + i]));
        out.rapido = { voce300: A(wv.canali[0], 300) / 0.25, chitVoce: A(wv.canali[0], 440) / 0.25, chitBase: A(wb.canali[0], 440) / 0.25, err: e, lungo: wv.canali[0].length === 10 * SR };
      }
      s.doUndo();
      // mono + rapido: errore chiaro e il progetto non cambia
      {
        const { clipId: c2 } = await T.progetto('Mono.wav', [L], SR, { srcIn: 1, secondi: 5 });
        const n = s.doc.tracks.length;
        let msg = '';
        try { await AA.separaVoceBase(c2, { rapido: true }); } catch (e) { msg = e.message; }
        out.mono = { msg, tracce: s.doc.tracks.length === n };
      }
      // il modello non si scarica (404): ripiego automatico con l'avviso; con "mai" l'errore
      AA.impostaProveAudioAI({ modello: { url: 'https://huggingface.co/prova/non-esiste/resolve/main/m.onnx', repo: 'prova/non-esiste', nome: 'Finto', peso: 1048576, minimo: 1024 }, ripiego: 'auto' });
      {
        const { clipId: c3 } = await T.progetto('Stereo2.wav', [L, R], SR, { srcIn: 1, secondi: 5 });
        await AA.separaVoceBase(c3);
        out.automatico = { avviso: testi().find((t) => /Non riesco a usare il modello/.test(t)) ?? null, clip: s.doc.clips.filter((x) => /^(Voce|Base):/.test(x.name)).length };
        s.doUndo();
        AA.impostaProveAudioAI({ modello: { url: 'https://huggingface.co/prova/non-esiste/resolve/main/m.onnx', repo: 'prova/non-esiste', nome: 'Finto', peso: 1048576, minimo: 1024 }, ripiego: 'mai' });
        let msg = '';
        try { await AA.separaVoceBase(c3); } catch (e) { msg = e.message; }
        out.mai = { msg, clip: s.doc.clips.filter((x) => /^(Voce|Base):/.test(x.name)).length };
        out.stato = await AA.statoAudioAI();
      }
      AA.impostaProveAudioAI(null);
      return out;
    });
    prova('rapido: voce + base = originale (entro la quantizzazione a 16 bit del file di partenza), il cantato al centro nella voce, la chitarra spostata nella base; l\'avviso dice che è senza AI e meno preciso', rip.rapido.err < 1e-4 && rip.rapido.lungo && rip.rapido.voce300 > 0.85 && rip.rapido.chitVoce < 0.15 && rip.rapido.chitBase > 0.85 && /senza AI/.test(rip.avvisoRapido ?? '') && /meno precisa/.test(rip.avvisoRapido ?? ''), JSON.stringify(rip));
    prova('rapido su un brano mono: errore chiaro in italiano, niente tracce nuove', /ha bisogno di un brano stereo/.test(rip.mono.msg) && rip.mono.tracce, JSON.stringify(rip.mono));
    prova('modello che non si scarica (404): si passa da soli alla separazione rapida e si dice perché; con "mai" è un errore in italiano e non cambia niente', /Non riesco a usare il modello AI/.test(rip.automatico.avviso ?? '') && /senza AI/.test(rip.automatico.avviso ?? '') && rip.automatico.clip === 2 && rip.mai.msg.length > 10 && /^[A-Za-zÀ-ú]/.test(rip.mai.msg) && rip.mai.clip === 0, JSON.stringify([rip.automatico, rip.mai]));
    prova('statoAudioAI dopo un fallimento: il modello è "da scaricare" (o in errore) e, senza modello, dice che si userebbe il ripiego', ['da-scaricare', 'errore'].includes(rip.stato.separa.stato), JSON.stringify(rip.stato.separa));
  } catch (e) {
    prova('le prove del ripiego non si sono fermate', false, String(e && e.stack || e));
  }
  return sesta(paginaDi, page, prova, errori);
}

async function sesta(paginaDi, page, prova, errori) {
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: ONNX Runtime vero con un modello ONNX finto (scarico a pezzi, ripresa, cache, sessione, tensori)');
    const URL_FINTO = 'https://huggingface.co/prova/finto-demucs/resolve/main/htdemucs_finto.onnx';
    const modello = onnxFinto(3);
    const conta = { richieste: 0, range: 0, troncate: 0 };
    let modo = 'tronco-poi-riprendi';
    await page.context().route('https://huggingface.co/prova/**', async (route) => {
      const req = route.request();
      const intest = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, content-length, accept-ranges', 'content-type': 'application/octet-stream', 'accept-ranges': 'bytes' };
      conta.richieste++;
      if (modo === 'pagina-di-errore') { await route.fulfill({ status: 200, headers: { ...intest, 'content-type': 'text/html' }, body: Buffer.concat([Buffer.from('<html>no</html>'), Buffer.alloc(1.5 * 1048576)]) }); return; }
      if (modo === 'piccolo') { await route.fulfill({ status: 200, headers: intest, body: modello.subarray(0, 600) }); return; }
      const rg = /bytes=(\d+)-/.exec(req.headers()['range'] ?? '');
      if (rg) {
        conta.range++;
        const da = Number(rg[1]);
        await route.fulfill({ status: 206, headers: { ...intest, 'content-range': `bytes ${da}-${modello.length - 1}/${modello.length}` }, body: modello.subarray(da) });
        return;
      }
      if (modo === 'tronco-poi-riprendi' && conta.troncate === 0) {
        // la rete cade a metà: la risposta dichiara tutta la lunghezza ma il corpo finisce prima
        conta.troncate++;
        await route.fulfill({ status: 200, headers: { ...intest, 'content-length': String(modello.length) }, body: modello.subarray(0, Math.floor(modello.length * 0.4)) });
        return;
      }
      await route.fulfill({ status: 200, headers: { ...intest, 'content-length': String(modello.length) }, body: modello });
    });
    const defModello = { url: URL_FINTO, repo: 'prova/finto-demucs', nome: 'Demucs finto', peso: modello.length, minimo: 1048576 };

    // lo scarico da solo (la pagina), con la rete che cade a metà
    const scarico = await page.evaluate(async ({ def, tot }) => {
      const { AAM } = window.__dpvTest;
      const prog = [];
      await AAM.togliModello(def);
      const prima = await AAM.modelloInCache(def);
      const t0 = performance.now();
      const b = await AAM.ottieniModello(def, { avanza: (a, t) => prog.push([a, t]), attesa: 50 });
      return { prima, len: b.length, tot, primo: b[0], ms: performance.now() - t0, prog: prog.length, ultimo: prog.at(-1), cache: await AAM.modelloInCache(def) };
    }, { def: defModello, tot: modello.length });
    prova('scarico del modello: se la rete cade a metà riprende da dove era (intestazione Range), arriva intero (stessa dimensione del file, comincia come un ONNX), l\'avanzamento arriva al totale', scarico.prima === null && scarico.len === modello.length && scarico.primo === 0x08 && conta.range >= 1 && conta.troncate === 1 && scarico.ultimo[0] === modello.length && scarico.ultimo[1] === modello.length, JSON.stringify([scarico, conta]));
    prova('dopo lo scarico il modello è nella cache (nella cache dei modelli di transformers.js: lo vede anche il conto del Centro AI) e la seconda volta non va in rete', scarico.cache === modello.length && await page.evaluate(async (def) => {
      const { AAM, DG } = window.__dpvTest;
      const n = (await DG.modelliScaricati()).get('prova/finto-demucs');
      return n === def.peso;
    }, defModello), JSON.stringify(scarico));
    const richiesteDopoScarico = conta.richieste;
    const seconda = await page.evaluate(async (def) => { const b = await window.__dpvTest.AAM.ottieniModello(def); return b.length; }, defModello);
    prova('seconda richiesta: dalla cache, nessuna richiesta di rete', seconda === modello.length && conta.richieste === richiesteDopoScarico, JSON.stringify([conta, seconda]));

    // file sbagliati
    await page.evaluate(async (def) => window.__dpvTest.AAM.togliModello(def), defModello);
    modo = 'pagina-di-errore';
    const brutto = await page.evaluate(async (def) => { try { await window.__dpvTest.AAM.ottieniModello(def, { tentativi: 2, attesa: 10 }); return 'ok'; } catch (e) { return e.message; } }, defModello);
    modo = 'piccolo';
    const piccolo = await page.evaluate(async (def) => { try { await window.__dpvTest.AAM.ottieniModello(def, { tentativi: 2, attesa: 10 }); return 'ok'; } catch (e) { return e.message; } }, defModello);
    prova('un file che non è ONNX (la pagina d\'errore del server) o troppo piccolo non si accetta e non resta in cache', /non è un modello ONNX/.test(brutto) && /troppo piccolo/.test(piccolo) && await page.evaluate(async (def) => (await window.__dpvTest.AAM.modelloInCache(def)) === null, defModello), JSON.stringify([brutto, piccolo]));
    modo = 'normale';

    // l'intero giro: la sessione vera di ONNX Runtime
    const ort = await page.evaluate(async (def) => {
      const T = window.__t;
      const { AA } = window.__dpvTest;
      const s = window.__dpv;
      const SR = 44100, N = 14 * SR;
      const x = Float32Array.from({ length: N }, (_, i) => 0.25 * Math.sin(2 * Math.PI * 440 * i / SR) + 0.15 * Math.sin(2 * Math.PI * 1500 * i / SR + 0.3));
      const y = x.map((v, i) => v * 0.8 + 0.1 * Math.sin(2 * Math.PI * 220 * i / SR));
      AA.impostaProveAudioAI({ modello: def, ripiego: 'mai' });
      const { clipId } = await T.progetto('Ort.wav', [x, y], SR, { srcIn: 2, secondi: 9 });
      const t0 = performance.now();
      try { await AA.separaVoceBase(clipId); } catch (e) { AA.impostaProveAudioAI(null); throw e; }
      const ms = performance.now() - t0;
      const cv = s.doc.clips.find((c) => /^Voce:/.test(c.name)), cb = s.doc.clips.find((c) => /^Base:/.test(c.name));
      const wv = await T.leggiWav(window.__dpvTest.mediaRT(cv.media).file), wb = await T.leggiWav(window.__dpvTest.mediaRT(cb.media).file);
      const i0 = Math.round(cv.srcIn * SR), n = 9 * SR;
      let somma = 0, rv = 0, rb = 0;
      for (let i = 0; i < n; i++) {
        somma = Math.max(somma, Math.abs(wv.canali[0][i0 + i] + wb.canali[0][i0 + i] - x[2 * SR + i]), Math.abs(wv.canali[1][i0 + i] + wb.canali[1][i0 + i] - y[2 * SR + i]));
        rv = Math.max(rv, Math.abs(wv.canali[0][i0 + i] - 0.6 * x[2 * SR + i]), Math.abs(wv.canali[1][i0 + i] - 0.6 * y[2 * SR + i]));
        rb = Math.max(rb, Math.abs(wb.canali[0][i0 + i] - 0.4 * x[2 * SR + i]), Math.abs(wb.canali[1][i0 + i] - 0.4 * y[2 * SR + i]));
      }
      const stato = await AA.statoAudioAI();
      AA.impostaProveAudioAI(null);
      return { ms, somma, rv, rb, lung: [wv.canali[0].length, wb.canali[0].length], stato: stato.separa, finito: T.finito(wv.canali[0]) && T.finito(wb.canali[1]) };
    }, defModello);
    console.log(`  ℹ ONNX Runtime vero (processore, modello finto con le forme vere): ${(ort.ms / 1000).toFixed(1)} s per 9 s usati (compresa la lettura dalla cache, la sessione, i conti nostri e i due WAV)`);
    prova('con ONNX Runtime vero: la sessione parte (API dal file locale ort.webgpu.min.mjs), i tensori hanno le forme di Demucs e escono voce = 60% del ramo STFT e base = 40% del ramo del tempo (errore sotto 5e-4)', ort.rv < 5e-4 && ort.rb < 5e-4 && ort.finito && ort.lung.join() === `${11 * 44100},${11 * 44100}`, JSON.stringify(ort));
    prova('con ONNX Runtime vero: voce + base = originale (errore sotto 5e-4) e il modello è "pronto" nel conto dello stato', ort.somma < 5e-4 && ort.stato.stato === 'pronto', JSON.stringify([ort.somma, ort.stato]));

    // togli dalla cache, dal Centro AI
    const tolto = await page.evaluate(async (def) => { const { AA } = window.__dpvTest; AA.impostaProveAudioAI({ modello: def }); const ok = await AA.togliSeparazione(); const dopo = await AA.statoAudioAI(); AA.impostaProveAudioAI(null); return { ok, stato: dopo.separa.stato }; }, defModello);
    prova('togliSeparazione toglie il modello dal computer (stato: da scaricare)', tolto.ok && tolto.stato === 'da-scaricare', JSON.stringify(tolto));
    await page.context().unroute('https://huggingface.co/prova/**');
  } catch (e) {
    prova('le prove di ONNX Runtime non si sono fermate', false, String(e && e.stack || e));
  }
  return settima(paginaDi, page, prova, errori);
}

async function settima(paginaDi, page, prova, errori) {
  try {
    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio AI: possibilita() sui vari tipi di clip, e il Centro AI');
    const poss = await page.evaluate(async () => {
      const T = window.__t;
      const { AA, P } = window.__dpvTest;
      const s = window.__dpv;
      const SR = 48000;
      const sig = T.parlato(6, SR);
      const { clipId, mediaId } = await T.progetto('Poss.wav', [sig], SR, { srcIn: 0, secondi: 5 });
      const out = {};
      const clip = (id) => s.doc.clips.find((c) => c.id === id);
      out.audio = AA.possibilita(clip(clipId));
      s.edit('Titolo e video', (p) => {
        const v1 = p.tracks.filter((t) => t.kind === 'video')[1].id;
        p.clips.push(P.newClip('title', v1, 0, 50, { name: 'Titolo' }));
        p.clips.push(P.newClip('color', v1, 50, 50, { name: 'Colore', gen: { color: '#223344' } }));
        // una "ripresa" con il suo audio legato (stesso file e stesso legame)
        const A2 = p.tracks.filter((t) => t.kind === 'audio')[1].id;
        p.clips.push(P.newClip('media', v1, 100, 50, { name: 'Ripresa', media: mediaId, link: 'L1' }));
        p.clips.push(P.newClip('media', A2, 100, 50, { name: 'Audio ripresa', media: mediaId, link: 'L1' }));
      });
      const titolo = s.doc.clips.find((c) => c.name === 'Titolo'), colore = s.doc.clips.find((c) => c.name === 'Colore');
      out.titolo = AA.possibilita(titolo);
      out.colore = AA.possibilita(colore);
      const ripresa = s.doc.clips.find((c) => c.name === 'Ripresa'), audioRip = s.doc.clips.find((c) => c.name === 'Audio ripresa');
      out.ripresa = AA.possibilita(ripresa);
      out.ripresaAudio = AA.clipAudioDi(s.doc, ripresa)?.id === audioRip.id;
      // si lavora dalla ripresa: cambia la sua clip audio legata, non la ripresa
      {
        const prima = { v: ripresa.media, a: audioRip.media, vs: ripresa.srcIn };
        await AA.togliRumore(ripresa.id, 'leggera');
        const v2 = s.doc.clips.find((c) => c.id === ripresa.id), a2 = s.doc.clips.find((c) => c.id === audioRip.id);
        out.viaRipresa = { videoUguale: v2.media === prima.v && v2.srcIn === prima.vs && !v2.afx, audioCambiato: a2.media !== prima.a, pulito: a2.afx?.pulito?.forza, ancora: AA.haOriginale(v2) && AA.haOriginale(a2) };
        AA.tornaOriginale(ripresa.id);
        const a3 = s.doc.clips.find((c) => c.id === audioRip.id);
        out.viaRipresa.torna = a3.media === prima.a && !a3.afx?.pulito && !AA.haOriginale(v2);
      }
      // blocco della traccia
      s.edit('Blocco', (p) => { p.tracks.find((t) => t.id === audioRip.track).lock = true; });
      out.bloccata = AA.possibilita(audioRip);
      s.edit('Sblocco', (p) => { p.tracks.find((t) => t.id === audioRip.track).lock = false; });
      // una ripresa senza clip audio legata
      s.edit('Senza audio legato', (p) => { p.clips = p.clips.filter((c) => c.id !== audioRip.id); });
      out.senzaAudio = AA.possibilita(ripresa);
      // un'immagine
      const cv = new OffscreenCanvas(32, 32); cv.getContext('2d').fillRect(0, 0, 32, 32);
      const img = new File([await cv.convertToBlob({ type: 'image/png' })], 'Foto.png', { type: 'image/png' });
      const [mi] = await window.__dpvTest.importaFile([{ name: 'Foto.png', file: img }], { chiediFormato: false });
      s.edit('Foto', (p) => { p.clips.push(P.newClip('media', p.tracks.filter((t) => t.kind === 'video')[0].id, 200, 50, { name: 'Foto', media: mi.id })); });
      out.immagine = AA.possibilita(s.doc.clips.find((c) => c.name === 'Foto'));
      // l'errore di chi chiama male
      for (const [k, f] of [['togli', () => AA.togliRumore('non-esiste')], ['separa', () => AA.separaVoceBase(titolo.id)], ['sepImm', () => AA.separaVoceBase(s.doc.clips.find((c) => c.name === 'Foto').id)]]) {
        try { await f(); out[k] = 'ok'; } catch (e) { out[k] = e.message; }
      }
      return out;
    });
    prova('possibilita: audio sì; titolo e colore no (con la frase che spiega); la ripresa usa il suo audio legato; traccia bloccata no; ripresa senza audio legato no; immagine no', poss.audio.rumore && poss.audio.separa && !poss.titolo.rumore && /non è una clip con audio/.test(poss.titolo.perche) && !poss.colore.separa && poss.ripresa.rumore && poss.ripresaAudio && !poss.bloccata.rumore && /bloccata/.test(poss.bloccata.perche) && !poss.senzaAudio.rumore && /clip audio/.test(poss.senzaAudio.perche) && !poss.immagine.rumore && /immagine/i.test(poss.immagine.perche), JSON.stringify(poss));
    prova('togliRumore chiamato sull\'id della ripresa video lavora sulla sua clip audio legata (la ripresa non cambia), haOriginale/tornaOriginale vanno anche con l\'id della ripresa', poss.viaRipresa.videoUguale && poss.viaRipresa.audioCambiato && poss.viaRipresa.pulito === 'leggera' && poss.viaRipresa.ancora && poss.viaRipresa.torna, JSON.stringify(poss.viaRipresa));
    prova('togliRumore e separaVoceBase su clip impossibili: errori in italiano (non trovo la clip · non è una clip con audio · un\'immagine non ha audio)', /Non trovo la clip/.test(poss.togli) && /non è una clip con audio/.test(poss.separa) && /immagine/i.test(poss.sepImm), JSON.stringify([poss.togli, poss.separa, poss.sepImm]));

    // il Centro AI
    await page.evaluate(() => {
      const s = window.__dpv;
      const c = s.doc.clips.find((x) => x.name === 'Poss');
      s.select([]); s.setHead(10);
      void c;
    });
    await page.click('.btn-ai');
    await page.waitForSelector('.dialogo.centro-ai');
    await page.waitForFunction(() => /DeepFilterNet3/.test(document.querySelector('.ai-carta[data-ai="rumore"] .ai-stato')?.textContent ?? '') && /separazione rapida/.test(document.querySelector('.ai-carta[data-ai="separa"] .ai-stato')?.textContent ?? ''), null, { timeout: 15000 });
    const ca = await page.evaluate(() => ({
      carte: [...document.querySelectorAll('.ai-carta')].map((x) => x.dataset.ai),
      rumore: document.querySelector('.ai-carta[data-ai="rumore"] .ai-stato')?.textContent,
      separa: document.querySelector('.ai-carta[data-ai="separa"] .ai-stato')?.textContent,
      bottoni: [...document.querySelectorAll('.ai-carta[data-ai="separa"] .ai-modello button')].map((b) => b.textContent),
      nome: [document.querySelector('.ai-carta[data-ai="rumore"] b')?.textContent, document.querySelector('.ai-carta[data-ai="separa"] b')?.textContent],
      comeRumore: document.querySelectorAll('.ai-carta[data-ai="rumore"] .ai-come li').length,
    }));
    prova('il Centro AI ha le due carte nuove ("Togli i rumori", "Voce e base") con cosa fa, come si usa e lo stato: il filtro è pronto, il modello della separazione da scaricare (172 MB)', ca.carte.includes('rumore') && ca.carte.includes('separa') && ca.nome.join() === 'Togli i rumori,Voce e base' && /pronto/.test(ca.rumore) && /DeepFilterNet3/.test(ca.rumore) && /172 MB/.test(ca.separa) && /separazione rapida/.test(ca.separa) && ca.comeRumore === 3 && ca.bottoni.join() === 'Scarica ora,Togli il modello', JSON.stringify(ca));
    // "Usa" sceglie la clip sotto il cursore e chiede la sezione delle Proprietà
    await page.evaluate(() => { window.__eventi = []; document.addEventListener('dpv:sezione', (e) => window.__eventi.push(e.detail)); });
    await page.click('.ai-carta[data-ai="rumore"] .ai-usa');
    await page.waitForTimeout(400);
    const usa = await page.evaluate(() => ({ eventi: window.__eventi, scelta: [...window.__dpv.sel].map((id) => window.__dpv.doc.clips.find((c) => c.id === id)?.name) }));
    prova('"Usa" su "Togli i rumori": sceglie la clip audio sotto il cursore e chiede la sezione "audioai" delle Proprietà', usa.scelta.includes('Poss') && usa.eventi.includes('audioai'), JSON.stringify(usa));
  } catch (e) {
    prova('le prove di possibilita e del Centro AI non si sono fermate', false, String(e && e.stack || e));
  }
  return fine(page, prova, errori);
}

async function fine(page, prova, errori) {
  // niente errori in console (la prova di Hugging Face fallisce dove la rete lo blocca: non è un errore del programma)
  prova('nessun errore nella console dell\'audio AI', errori.length === 0, errori.slice(0, 5).join(' | '));
}
