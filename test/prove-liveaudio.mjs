// Le prove dell'audio di LIVE: livelli a barre (computer e voce), mixer (volume, muto, bilanciamento, abbassa-il-computer)
// e filtri della voce (porta, tono, de-esser, compressore, limitatore), che finiscono nella registrazione.
// Girano dentro prove.mjs (con le prove nuove), oppure da sole: `node test/prove-nuove.mjs liveaudio`.
// Nelle prove la sorgente di LIVE è finta: due oscillatori (computer e microfono) di cui si regola l'ampiezza.
// Il modello AI del browser (noiseSuppression) non c'è nel Chromium delle prove: si controlla solo che la scelta
// arrivi ai vincoli di getUserMedia.

/** una pagina pulita (contesto nuovo): le prove di prima hanno riempito il progetto */
async function pagina(paginaDi, viewport = { width: 1600, height: 950 }) {
  const contesto = await paginaDi.context().browser().newContext({ viewport });
  const page = await contesto.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text()) && !/Failed to load resource/.test(m.text())) errori.push(m.text()); });
  await page.goto(paginaDi.url());
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1000);
  return { page, contesto, errori };
}

/** gli strumenti per le prove, dentro la pagina: toni regolabili e un misuratore di flussi */
const STRUMENTI = () => {
  window.__tono = (freq, amp) => {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = amp;
    const d = ctx.createMediaStreamDestination();
    o.connect(g).connect(d); o.start();
    return { stream: d.stream, gain: g.gain, ctx };
  };
  window.__pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  /** il picco di un flusso audio nell'ultimo mezzo secondo (lineare) */
  window.__picco = async (stream, ms = 500) => {
    const ctx = new AudioContext();
    await ctx.resume();
    const an = ctx.createAnalyser(); an.fftSize = 8192;
    ctx.createMediaStreamSource(stream).connect(an);
    await window.__pausa(ms);
    const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b);
    let p = 0; for (const x of b) p = Math.max(p, Math.abs(x));
    void ctx.close();
    return p;
  };
};

export async function proveLiveAudio({ page: paginaDi, prova, OUT }) {
  const { page, contesto, errori } = await pagina(paginaDi);
  try {
    await page.evaluate(STRUMENTI);

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio di LIVE: i conti (dB, bilanciamento, scelte)');
    const pure = await page.evaluate(() => {
      const P = window.__dpvTest.LV.liveAudioPuro;
      const grezzo = P.unisciImpostazioni({ voce: { volume: 99, muto: 'si' }, bilancio: -500, filtri: { porta: true, portaSoglia: -10, calore: 'tanto', passaAltoHz: 1 }, abbassaQuanto: 'x' });
      const podcast = P.PRESET_VOCE.find((p) => p.id === 'podcast').filtri;
      const m = new P.MisuraPicco();
      m.aggiorna([0.5, 0.001], 1000);
      const sale = [...m.barra];
      m.aggiorna([0.001, 0.001], 1100);
      const subito = m.barra[0];
      m.aggiorna([0.95, 0.01], 1200);
      const clip1 = m.clip(1300), clip2 = m.clip(4000);
      return {
        uno: P.dbAGuadagno(0), meno6: P.dbAGuadagno(-6), silenzio: P.dbAGuadagno(-60), ritorno: P.guadagnoADb(0.5),
        t1: P.testoDb(-6.5), t2: P.testoDb(-60), t3: P.testoDb(3), t4: P.testoDb(0),
        b0: P.bilancioADb(0), b100: P.bilancioADb(100), bm50: P.bilancioADb(-50), b30: P.bilancioADb(30), bfuori: P.bilancioADb(900),
        grezzo, predef: P.unisciImpostazioni(undefined), vuoto: P.unisciImpostazioni('boh'),
        pcorr: P.presetCorrente(podcast), pnessuno: P.presetCorrente(P.IMPOSTAZIONI0.filtri), ppers: P.presetCorrente({ ...podcast, aria: 5 }),
        mix: P.presetMixCorrente({ ...P.IMPOSTAZIONI0, bilancio: 30, abbassa: true }), mixPers: P.presetMixCorrente({ ...P.IMPOSTAZIONI0, bilancio: 7 }),
        barra0: P.posizioneBarra(1), barra60: P.posizioneBarra(0.001), barraMeta: P.posizioneBarra(Math.pow(10, -30 / 20)),
        sale, subito, clip1, clip2, pk: m.picchiDb(),
        guad: [P.guadagnoCanale({ volume: -6, muto: false }, 0), P.guadagnoCanale({ volume: 0, muto: true }, 0), P.guadagnoCanale({ volume: 0, muto: false }, -20)],
        nessuno: P.FILTRI_NESSUNO,
      };
    });
    prova('dB: 0 dB = 1, −6 dB = 0,5, −60 dB = silenzio, e al contrario', pure.uno === 1 && Math.abs(pure.meno6 - 0.501) < 0.002 && pure.silenzio === 0 && Math.abs(pure.ritorno + 6.02) < 0.01, JSON.stringify(pure));
    prova('i valori del fader si scrivono in italiano ("-6,5 dB", "silenzio")', pure.t1 === '-6,5 dB' && pure.t2 === 'silenzio' && pure.t3 === '+3 dB' && pure.t4 === '0 dB', JSON.stringify([pure.t1, pure.t2, pure.t3, pure.t4]));
    prova('bilanciamento: pari = niente; verso la voce il computer scende (fino a −36 dB), verso il computer scende la voce', pure.b0.voce === 0 && pure.b0.computer === 0 && pure.b100.computer === -36 && pure.b100.voce === 0 && pure.bm50.voce === -18 && pure.bm50.computer === 0 && Math.abs(pure.b30.computer + 10.8) < 1e-9 && pure.bfuori.computer === -36, JSON.stringify([pure.b0, pure.b100, pure.bm50, pure.b30]));
    prova('le scelte lette da localStorage: il sbagliato torna com\'era e i valori fuori misura si riportano dentro', pure.grezzo.voce.volume === 12 && pure.grezzo.voce.muto === false && pure.grezzo.bilancio === -100 && pure.grezzo.filtri.porta === true && pure.grezzo.filtri.portaSoglia === -15 && pure.grezzo.filtri.calore === 0 && pure.grezzo.filtri.passaAltoHz === 40 && pure.grezzo.abbassaQuanto === 12, JSON.stringify(pure.grezzo));
    prova('di partenza i filtri sono "Nessuno" (browser come prima, nostra catena spenta, solo il limitatore) e tutto a 0 dB', pure.predef.voce.volume === 0 && pure.predef.computer.volume === 0 && pure.predef.bilancio === 0 && pure.predef.abbassa === false && pure.pnessuno === 'nessuno' && pure.nessuno.disturbi === true && pure.nessuno.eco === true && !pure.nessuno.porta && !pure.nessuno.eq && !pure.nessuno.compressore && !pure.nessuno.deesser && !pure.nessuno.passaAlto && pure.nessuno.limitatore === true && pure.vuoto.filtri.disturbi === true, JSON.stringify(pure.predef));
    prova('i preset si riconoscono (e se tocchi un\'opzione diventano "personale")', pure.pcorr === 'podcast' && pure.ppers === 'personale' && pure.mix === 'voce' && pure.mixPers === 'personale', JSON.stringify([pure.pcorr, pure.ppers, pure.mix, pure.mixPers]));
    prova('le barre: 0 dB in cima, −60 dB in fondo; sale subito, scende piano; la spia di saturazione resta 2,5 s', pure.barra0 === 1 && pure.barra60 === 0 && Math.abs(pure.barraMeta - 0.5) < 0.01 && pure.sale[0] > 0.8 && pure.sale[1] < 0.1 && pure.subito > 0.7 && pure.clip1 && !pure.clip2 && Math.abs(pure.pk + 0.45) < 0.2, JSON.stringify(pure));
    prova('il guadagno di un canale: muto = zero, il bilanciamento si somma al volume', Math.abs(pure.guad[0] - 0.501) < 0.002 && pure.guad[1] === 0 && Math.abs(pure.guad[2] - 0.1) < 0.001, JSON.stringify(pure.guad));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio di LIVE: la dinamica (porta, compressore, de-esser, abbassa-computer, limitatore) sui campioni');
    const din = await page.evaluate(() => {
      const P = window.__dpvTest.LV.liveAudioPuro;
      const SR = 48000, N = 128;
      const D = P.dspProva(SR);
      const rms = (a) => { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); };
      const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));
      /** fa girare il processore: `segmenti` = [{ s: secondi, f: Hz, a: ampiezza, lat?: ampiezza del laterale (440 Hz) }] */
      const corri = (p, segmenti, opz = {}) => {
        const pr = new D.Dinamica({ processorOptions: { p } });
        let t = 0;
        const risultati = [];
        for (const seg of segmenti) {
          const nb = Math.round((seg.s * SR) / N);
          const ent = [], usc = [];
          let maxDiff = 0, picco = 0;
          for (let b = 0; b < nb; b++) {
            const x = new Float32Array(N), l = new Float32Array(N);
            for (let i = 0; i < N; i++) { x[i] = seg.a * Math.sin((2 * Math.PI * seg.f * (t + i)) / SR); l[i] = (seg.lat || 0) * Math.sin((2 * Math.PI * 440 * (t + i)) / SR); }
            t += N;
            const out = [new Float32Array(N), new Float32Array(N)];
            pr.process([[x, x], opz.senzaLaterale ? [] : [l, l]], [out]);
            for (let i = 0; i < N; i++) { maxDiff = Math.max(maxDiff, Math.abs(out[0][i] - x[i])); picco = Math.max(picco, Math.abs(out[0][i])); }
            ent.push(x); usc.push(out[0]);
          }
          // si guarda l'ultimo quarto del segmento (a regime)
          const da = Math.floor(nb * 0.75);
          const cat = (v) => { const r = new Float32Array((nb - da) * N); v.slice(da).forEach((b, k) => r.set(b, k * N)); return r; };
          risultati.push({ maxDiff, picco, rid: db(rms(cat(usc)) / Math.max(rms(cat(ent)), 1e-12)), ruscita: rms(cat(usc)) });
        }
        return risultati;
      };
      const out = {};
      out.base = corri(P.paramBase(), [{ s: 0.3, f: 1000, a: 0.5 }])[0];
      let p = P.paramBase(); p.lim.on = true;
      const lim = corri(p, [{ s: 0.5, f: 1000, a: 2.5 }, { s: 1.5, f: 1000, a: 0.5 }]);
      out.lim = { forte: lim[0].picco, normale: Math.abs(lim[1].rid) };
      p = P.paramBase(); p.porta.on = true; p.porta.soglia = -30;
      const por = corri(p, [{ s: 1, f: 700, a: 0.1 }, { s: 1.5, f: 700, a: 0.002 }, { s: 0.6, f: 700, a: 0.1 }]);
      out.porta = { aperta: por[0].rid, chiusa: por[1].rid, riapre: por[2].rid };
      p = P.paramBase(); p.comp.on = true; p.comp.soglia = -22; p.comp.rapporto = 4;
      const c1 = corri(p, [{ s: 1.5, f: 1000, a: 0.5 }, { s: 1.5, f: 1000, a: 0.02 }]);
      p.comp.recupero = 6;
      const c2 = corri(p, [{ s: 1.5, f: 1000, a: 0.5 }]);
      out.comp = { forte: c1[0].rid, piano: c1[1].rid, recupero: c2[0].rid, attesa: P.dspProva().curvaComp(-6, -22, 4, 8) };
      p = P.paramBase(); p.deess.on = true; p.deess.soglia = -30; p.deess.rapporto = 4;
      const de = corri(p, [{ s: 1, f: 8000, a: 0.5 }, { s: 1, f: 500, a: 0.5 }]);
      out.deess = { acuta: de[0].rid, grave: de[1].rid };
      p = P.paramBase(); p.duck.on = true; p.duck.soglia = -42; p.duck.apre = -12; p.duck.rilascio = 0.5;
      const du = corri(p, [{ s: 1.5, f: 1000, a: 0.2, lat: 0.1 }, { s: 2.5, f: 1000, a: 0.2, lat: 0 }]);
      out.duck = { parla: du[0].rid, silenzio: du[1].rid };
      out.duckSenza = corri(p, [{ s: 1, f: 1000, a: 0.2 }], { senzaLaterale: true })[0].rid;
      // curve e passi puri
      const C = D.curvaComp;
      out.curva = { sotto: C(-40, -22, 3, 0), sopra: C(-10, -22, 3, 0), ginocchio: C(-22, -22, 3, 6), crescente: C(-30, -22, 3, 8) < C(-20, -22, 3, 8) && C(-20, -22, 3, 8) < C(-10, -22, 3, 8) };
      // la porta tiene aperto per la tenuta, poi chiude
      const s = D.nuovaPorta();
      const pp = P.paramBase().porta;
      const dt = N / SR;
      for (let i = 0; i < 400; i++) D.passoPorta(s, pp, 0.1, dt);
      const aperta = s.g;
      for (let i = 0; i < 20; i++) D.passoPorta(s, pp, 0.0001, dt);
      const dopoTenuta = s.g;
      for (let i = 0; i < 600; i++) D.passoPorta(s, pp, 0.0001, dt);
      out.tenuta = { aperta, dopoTenuta, chiusa: s.g };
      // un nuovo messaggio dal thread principale cambia i parametri a metà lavoro
      const pr = new D.Dinamica({ processorOptions: { p: P.paramBase() } });
      const xx = new Float32Array(N).fill(0.9), oo = [new Float32Array(N), new Float32Array(N)];
      pr.process([[xx, xx], []], [oo]);
      const prima = oo[0][N - 1];
      const nuovo = P.paramBase(); nuovo.lim.on = true;
      pr.port.onmessage({ data: { p: nuovo } });
      for (let i = 0; i < 3; i++) pr.process([[xx, xx], []], [oo]);
      out.messaggio = { prima, dopo: oo[0][N - 1] };
      return out;
    });
    prova('con tutto spento il suono passa identico, campione per campione', din.base.maxDiff === 0, JSON.stringify(din.base));
    prova('limitatore: il picco non supera mai −1 dB (0,891) nemmeno con un segnale a 2,5, e un suono normale non lo sente', din.lim.forte <= 0.8914 && din.lim.forte > 0.85 && din.lim.normale < 0.01, JSON.stringify(din.lim));
    prova('porta: lascia passare la voce, quando c\'è solo rumore piano scende di oltre 30 dB, e quando la voce torna riapre', Math.abs(din.porta.aperta) < 0.5 && din.porta.chiusa < -30 && Math.abs(din.porta.riapre) < 1, JSON.stringify(din.porta));
    prova('porta: tiene aperto per la tenuta (non taglia le code delle parole) e poi chiude', Math.abs(din.tenuta.aperta) < 0.01 && din.tenuta.dopoTenuta > -3 && din.tenuta.chiusa < -34, JSON.stringify(din.tenuta));
    prova('compressore: un suono forte scende come dice la curva (−6 → −18 dB, quindi −12 dB), uno piano non si tocca, il recupero lo rialza', Math.abs(din.comp.forte + 12) < 1 && Math.abs(din.comp.piano) < 0.3 && Math.abs(din.comp.recupero - (din.comp.forte + 6)) < 0.5 && Math.abs(din.comp.attesa + 18) < 0.001, JSON.stringify(din.comp));
    prova('curva del compressore: sotto la soglia uguale, sopra 1/rapporto, ginocchio morbido, sempre crescente', din.curva.sotto === -40 && Math.abs(din.curva.sopra + 18) < 1e-9 && din.curva.ginocchio < -22 && din.curva.crescente, JSON.stringify(din.curva));
    prova('de-esser: abbassa una "S" acuta (8 kHz) di oltre 6 dB e lascia stare la voce grave (500 Hz) entro mezzo dB', din.deess.acuta < -6 && Math.abs(din.deess.grave) < 0.5, JSON.stringify(din.deess));
    prova('abbassa-computer: mentre la voce suona il computer scende di 12 dB, quando smette risale; senza voce collegata non cambia nulla', Math.abs(din.duck.parla + 12) < 1.5 && Math.abs(din.duck.silenzio) < 1 && Math.abs(din.duckSenza) < 0.3, JSON.stringify([din.duck, din.duckSenza]));
    prova('un messaggio con parametri nuovi cambia il lavoro a metà (il limitatore si accende)', din.messaggio.prima === Math.fround(0.9) && din.messaggio.dopo < 0.8914, JSON.stringify(din.messaggio));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio di LIVE: il grafo del mixer (livelli, volume, muto, bilanciamento, abbassa, filtri)');
    const grafo = await page.evaluate(async () => {
      const LV = window.__dpvTest.LV, P = LV.liveAudioPuro;
      const voce = window.__tono(440, 0.1), pc = window.__tono(300, 0.1);
      const m = new LV.MixerLive();
      const ok = await m.accendi(P.copiaImpostazioni(P.IMPOSTAZIONI0), true);
      m.collegaVoce(voce.stream); m.collegaComputer(pc.stream);
      const imp = (mod) => { const a = P.copiaImpostazioni(P.IMPOSTAZIONI0); mod(a); m.imposta(a); };
      const mis = async (ms = 450) => { await window.__pausa(ms); const l = m.livelli(); return { v: Math.max(...l.voce), c: Math.max(...l.computer), mix: Math.max(...l.mix) }; };
      const r = { ok, worklet: m.worklet };
      r.partenza = await mis(700);
      imp((a) => { a.voce.volume = 12; });
      r.piu12 = await mis();
      imp((a) => { a.voce.volume = 12; a.voce.muto = true; });
      r.muto = await mis();
      r.mutoFlusso = await window.__picco(m.flussoVoce(), 300);
      r.pcFlusso = await window.__picco(m.flussoComputer(), 300);
      r.mixFlusso = await window.__picco(m.flussoMix(), 300);
      imp((a) => { a.bilancio = 100; });
      r.bilVoce = await mis();
      imp((a) => { a.bilancio = -100; });
      r.bilPc = await mis();
      // abbassa il computer quando parlo: la voce a 0,1 (−20 dB) è sopra la soglia
      imp((a) => { a.abbassa = true; a.abbassaQuanto = 12; a.abbassaSoglia = -42; a.abbassaRilascio = 300; });
      r.duckParla = await mis(900);
      voce.gain.value = 0;
      r.duckSilenzio = await mis(1800);
      r.riduzione = m.riduzioni().duck;
      voce.gain.value = 0.1;
      imp((a) => { a.abbassa = false; });
      r.duckSpento = await mis(900);
      // la porta: voce a −50 dB con soglia −45 → tagliata; a −30 dB → passa
      voce.gain.value = 0.003;
      imp((a) => { a.filtri.porta = true; a.filtri.portaSoglia = -45; });
      r.portaChiusa = await mis(1500);
      voce.gain.value = 0.03;
      r.portaAperta = await mis(700);
      imp((a) => { a.filtri.porta = false; });
      voce.gain.value = 0.1;
      // il limitatore: un computer a piena scala non supera −1 dB
      pc.gain.value = 1;
      r.limitato = await mis(600);
      imp((a) => { a.limitaComputer = false; });
      r.nonLimitato = await mis(600);
      m.chiudi();
      r.dopo = m.livelli();
      return r;
    });
    prova('il grafo parte (con il worklet) e i livelli seguono i due oscillatori: voce e computer a 0,1 (−20 dB)', grafo.ok && grafo.worklet && Math.abs(grafo.partenza.v - 0.1) < 0.02 && Math.abs(grafo.partenza.c - 0.1) < 0.02, JSON.stringify(grafo.partenza));
    prova('volume della voce +12 dB: il livello sale di quasi quattro volte (e la voce resta sotto il limitatore)', grafo.piu12.v > 0.33 && grafo.piu12.v < 0.45 && Math.abs(grafo.piu12.c - 0.1) < 0.02, JSON.stringify(grafo.piu12));
    prova('muto: la voce è silenzio nell\'uscita registrata, il computer resta, e la somma ha solo il computer', grafo.muto.v < 0.002 && grafo.mutoFlusso < 0.002 && Math.abs(grafo.pcFlusso - 0.1) < 0.02 && Math.abs(grafo.mixFlusso - 0.1) < 0.03, JSON.stringify([grafo.muto, grafo.mutoFlusso, grafo.pcFlusso, grafo.mixFlusso]));
    prova('bilanciamento: tutto verso la voce abbassa il computer di 36 dB; tutto verso il computer abbassa la voce', grafo.bilVoce.c < 0.004 && Math.abs(grafo.bilVoce.v - 0.1) < 0.02 && grafo.bilPc.v < 0.004 && Math.abs(grafo.bilPc.c - 0.1) < 0.02, JSON.stringify([grafo.bilVoce, grafo.bilPc]));
    prova('abbassa il computer quando parlo: con la voce il computer scende di 12 dB, quando smette risale; spento non fa niente', grafo.duckParla.c < 0.1 * 0.3 && grafo.duckParla.c > 0.1 * 0.2 && grafo.duckSilenzio.c > 0.085 && Math.abs(grafo.duckSpento.c - 0.1) < 0.02 && grafo.riduzione > -1, JSON.stringify([grafo.duckParla, grafo.duckSilenzio, grafo.duckSpento, grafo.riduzione]));
    prova('porta nel grafo: la voce sotto soglia (−50 dB) viene tagliata, quella sopra (−30 dB) passa', grafo.portaChiusa.v < 0.0005 && grafo.portaAperta.v > 0.025, JSON.stringify([grafo.portaChiusa, grafo.portaAperta]));
    prova('limitatore del computer: a piena scala il picco resta a −1 dB; spento passa intero', grafo.limitato.c < 0.8915 && grafo.limitato.c > 0.85 && grafo.nonLimitato.c > 0.97, JSON.stringify([grafo.limitato, grafo.nonLimitato]));
    prova('chiuso il mixer le barre tornano a zero', grafo.dopo.voce[0] === 0 && grafo.dopo.computer[1] === 0, JSON.stringify(grafo.dopo));

    // il tono (passa-alto e le tre manopole) e i preset, con suoni veri: niente instabilità, niente silenzio
    const tono = await page.evaluate(async () => {
      const LV = window.__dpvTest.LV, P = LV.liveAudioPuro;
      const m = new LV.MixerLive();
      await m.accendi(P.copiaImpostazioni(P.IMPOSTAZIONI0), true);
      const imp = (mod) => { const a = P.copiaImpostazioni(P.IMPOSTAZIONI0); mod(a); m.imposta(a); };
      const mis = async (ms = 500) => { await window.__pausa(ms); return Math.max(...m.livelli().voce); };
      const r = {};
      const grave = window.__tono(100, 0.02), medio = window.__tono(3200, 0.02), alto = window.__tono(1000, 0.02);
      m.collegaVoce(grave.stream);
      r.grave = await mis(600);
      imp((a) => { a.filtri.passaAlto = true; a.filtri.passaAltoHz = 200; });
      r.graveHp = await mis();
      imp((a) => { a.filtri.passaAlto = false; });
      r.graveLibero = await mis();
      imp((a) => { a.filtri.eq = true; a.filtri.calore = 12; });
      r.graveCalore = await mis();
      m.collegaVoce(medio.stream);
      imp(() => {});
      r.medio = await mis(600);
      imp((a) => { a.filtri.eq = true; a.filtri.presenza = 12; });
      r.medioPresenza = await mis();
      imp((a) => { a.filtri.eq = false; a.filtri.presenza = 12; });
      r.medioEqSpento = await mis();
      // ogni preset con un suono composto (grave + medio + acuto, picco circa −16 dB)
      const ctx = new AudioContext();
      const d = ctx.createMediaStreamDestination();
      for (const f of [180, 1200, 4500]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g).connect(d); o.start(); }
      m.collegaVoce(d.stream);
      r.preset = {};
      for (const pr of P.PRESET_VOCE) {
        imp((a) => { a.filtri = { ...pr.filtri }; });
        const v = await mis(1100);
        r.preset[pr.id] = Number(v.toFixed(3));
      }
      m.chiudi();
      return r;
    });
    prova('passa-alto a 200 Hz: un suono a 100 Hz scende di oltre 8 dB; spento torna com\'era', tono.graveHp < tono.grave * 0.4 && Math.abs(tono.graveLibero - tono.grave) < 0.004, JSON.stringify(tono));
    prova('tono: calore +12 dB alza un suono a 100 Hz di oltre 6 dB; presenza +12 dB alza uno a 3200 Hz di oltre 8 dB; con il tono spento le manopole non contano', tono.graveCalore > tono.grave * 2 && tono.medioPresenza > tono.medio * 2.5 && Math.abs(tono.medioEqSpento - tono.medio) < 0.004, JSON.stringify(tono));
    prova('ogni preset della voce suona (né silenzio né distorsione): nessuno supera il tetto di −1 dB e nessuno è muto', Object.values(tono.preset).every((v) => v > 0.03 && v <= 0.8915) && Object.keys(tono.preset).length === 5, JSON.stringify(tono.preset));

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio di LIVE: la pagina (barre, mixer, filtri, prova, ricordo delle scelte)');
    await page.evaluate(() => {
      const mic = window.__tono(440, 0.1), pc = window.__tono(300, 0.1);
      window.__mic = mic; window.__pc = pc;
      window.__dpvTest.LV.impostaSorgenteLive(async (conAudio) => {
        const c = document.createElement('canvas'); c.width = 640; c.height = 360; c.className = 'tela-live-prova';
        c.style.cssText = 'position:fixed;left:0;bottom:0;width:64px;height:36px;z-index:9999;pointer-events:none';
        document.body.append(c);
        const x = c.getContext('2d'); let n = 0;
        window.__giroLive = setInterval(() => { n++; x.fillStyle = `hsl(${n * 4 % 360} 70% 45%)`; x.fillRect(0, 0, 640, 360); }, 33);
        const st = c.captureStream(30);
        if (conAudio) st.addTrack(pc.stream.getAudioTracks()[0].clone());
        return st;
      }, async () => new MediaStream([mic.stream.getAudioTracks()[0].clone()]));
      const live = window.__dpvTest.ui().live;
      live.opz.conto = false; live.opz.cam = false; live.opz.finestre = false; live.opz.timeline = false;
    });
    await page.click('.pagina-btn[data-p=live]');
    await page.waitForTimeout(300);
    // dal 1.5.1 LIVE non ha più il pannello dei filtri e del mixer (l'audio si lavora dopo, nel montaggio): restano le due barre dei livelli
    const s0 = await page.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length;
      return {
        pannello: q('.la'), strisce: q('.la-striscia'), compatte: q('.la-compatto canvas'), prova: q('.la-prova'), preset: q('.la-presetvoce'), disturbi: q('[data-filtro]'),
        sticky: !!document.querySelector('.live-regia .la-compatto'),
      };
    });
    prova('la pagina LIVE ha solo le due barre dei livelli in cima: niente filtri, preset, mixer né "Prova l\'audio"', s0.pannello === 0 && s0.strisce === 0 && s0.compatte === 2 && s0.prova === 0 && s0.preset === 0 && s0.disturbi === 0 && s0.sticky, JSON.stringify(s0));
    // le scelte vecchie (un preset con filtri) non valgono più: l'audio esce com'è
    await page.evaluate(() => {
      const L = window.__dpvTest.LV.liveAudioPuro;
      const vecchie = JSON.parse(localStorage.getItem('dpv-live') || '{}');
      const a = L.copiaImpostazioni(L.IMPOSTAZIONI0);
      a.filtri = { ...L.PRESET_VOCE.find((x) => x.id === 'podcast').filtri };
      a.computer.volume = -9.5;
      localStorage.setItem('dpv-live', JSON.stringify({ ...vecchie, audio: a }));
    });
    await page.reload();
    await page.waitForSelector('.pulsantiera');
    await page.waitForTimeout(800);
    const vec = await page.evaluate(() => { const L = window.__dpvTest.LV.liveAudioPuro; const o = window.__dpvTest.ui().live.opz.audio; return { porta: o.filtri.porta, compressore: o.filtri.compressore, vol: o.computer.volume, uguale: JSON.stringify(o) === JSON.stringify(L.copiaImpostazioni(L.IMPOSTAZIONI0)) }; });
    prova('dopo un ricarico le vecchie scelte di filtri e volumi non si applicano: l\'audio esce com\'è', vec.uguale && !vec.porta && !vec.compressore && vec.vol === 0, JSON.stringify(vec));
    await page.click('.pagina-btn[data-p=live]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/live-audio.png` });
    // si rimette tutto a posto per le registrazioni
    await page.evaluate(() => {
      const L = window.__dpvTest.LV.liveAudioPuro, live = window.__dpvTest.ui().live;
      live.opz.audio = L.copiaImpostazioni(L.IMPOSTAZIONI0);
      live.opz.conto = false; live.opz.cam = false; live.opz.finestre = false; live.opz.timeline = false; live.opz.separato = true;
      localStorage.setItem('dpv-live', JSON.stringify(live.opz));
    });
    await page.reload();
    await page.waitForSelector('.pulsantiera');
    await page.waitForTimeout(800);
    await page.evaluate(STRUMENTI);
    await page.evaluate(() => {
      const mic = window.__tono(440, 0.1), pc = window.__tono(300, 0.1);
      window.__mic = mic; window.__pc = pc;
      window.__dpvTest.LV.impostaSorgenteLive(async (conAudio) => {
        const c = document.createElement('canvas'); c.width = 640; c.height = 360; c.className = 'tela-live-prova';
        c.style.cssText = 'position:fixed;left:0;bottom:0;width:64px;height:36px;z-index:9999;pointer-events:none';
        document.body.append(c);
        const x = c.getContext('2d'); let n = 0;
        window.__giroLive = setInterval(() => { n++; x.fillStyle = `hsl(${n * 4 % 360} 70% 45%)`; x.fillRect(0, 0, 640, 360); }, 33);
        const st = c.captureStream(30);
        if (conAudio) st.addTrack(pc.stream.getAudioTracks()[0].clone());
        return st;
      }, async () => new MediaStream([mic.stream.getAudioTracks()[0].clone()]));
      const live = window.__dpvTest.ui().live;
      live.opz.conto = false; live.opz.cam = false; live.opz.finestre = false; live.opz.timeline = false;
    });
    await page.click('.pagina-btn[data-p=live]');

    // ———————————————————————————————————————————————————————————
    console.log('▶ Audio di LIVE: quello che si sente finisce nella registrazione (due file, voce e computer)');
    const registra = async (mod, secondi = 2.8) => {
      await page.evaluate((m) => {
        const live = window.__dpvTest.ui().live, L = window.__dpvTest.LV.liveAudioPuro;
        const a = L.copiaImpostazioni(L.IMPOSTAZIONI0);
        new Function('a', m)(a);
        live.opz.audio = a;
      }, mod);
      await page.keyboard.press('r');
      await page.waitForFunction(() => document.querySelector('.live').classList.contains('in-onda'), null, { timeout: 12000 });
      await page.waitForTimeout(secondi * 1000);
      const dentro = await page.evaluate(() => {
        const live = window.__dpvTest.ui().live;
        return {
          barre: [...document.querySelectorAll('.la-misura.piccolo')].map((c) => Number(c.dataset.livello)),
          mixer: !!live.mixer && live.mixer.ok,
        };
      });
      await page.keyboard.press('f');
      await page.evaluate(() => window.__dpvTest.ui().live.ultima);
      await page.waitForTimeout(300);
      const r = await page.evaluate(async () => {
        const d = window.__dpv.doc;
        const regs = d.media.filter((m) => m.name.startsWith('Registrazione'));
        const mic = regs.filter((m) => m.name.includes('microfono')).at(-1);
        const sch = regs.filter((m) => !m.name.includes('microfono')).at(-1);
        /** il livello (rms) di un file, saltando il primo mezzo secondo */
        const livello = async (m) => {
          if (!m) return -1;
          const f = window.__dpvTest.mediaRT(m.id).file;
          const ctx = new AudioContext();
          try {
            const b = await ctx.decodeAudioData(await f.arrayBuffer());
            const x = b.getChannelData(0).slice(Math.floor(b.sampleRate * 0.5));
            let s = 0, p = 0; for (const v of x) { s += v * v; p = Math.max(p, Math.abs(v)); }
            return { rms: Math.sqrt(s / x.length), picco: p, dur: b.duration };
          } catch (e) { return { errore: String(e) }; } finally { void ctx.close(); }
        };
        return { n: regs.length, mic: await livello(mic), sch: await livello(sch), micNome: mic?.name };
      });
      return { dentro, r };
    };
    const R1 = await registra('');
    prova('durante la registrazione le barre piccole si muovono e il mixer è in funzione', R1.dentro.mixer && R1.dentro.barre.every((x) => x > -30 && x < -10), JSON.stringify(R1.dentro));
    prova('la registrazione ha il file della voce e quello dello schermo, tutti e due con audio', R1.r.n === 2 && R1.r.mic.rms > 0.03 && R1.r.sch.rms > 0.03, JSON.stringify(R1.r));
    const R2 = await registra('a.voce.volume = 12;');
    const rapporto = R2.r.mic.rms / R1.r.mic.rms;
    prova('voce a +12 dB: nel file registrato la voce è circa quattro volte più forte, il computer uguale', rapporto > 3.2 && rapporto < 4.8 && Math.abs(R2.r.sch.rms / R1.r.sch.rms - 1) < 0.2, JSON.stringify({ rapporto, voce1: R1.r.mic.rms, voce2: R2.r.mic.rms, sch1: R1.r.sch.rms, sch2: R2.r.sch.rms }));
    const R3 = await registra('a.voce.muto = true;');
    prova('voce muta: il file della voce è silenzio, quello del computer no', R3.r.mic.rms < 0.002 && R3.r.sch.rms > 0.03, JSON.stringify(R3.r));
    const R4 = await registra('a.computer.volume = -20; a.bilancio = 0;');
    prova('computer a −20 dB: il suo file scende a un decimo, la voce resta', Math.abs(R4.r.sch.rms / R1.r.sch.rms - 0.1) < 0.03 && Math.abs(R4.r.mic.rms / R1.r.mic.rms - 1) < 0.2, JSON.stringify({ sch: R4.r.sch.rms / R1.r.sch.rms, mic: R4.r.mic.rms / R1.r.mic.rms }));
    // con voce e computer nello stesso file la somma ha tutti e due
    await page.evaluate(() => { window.__dpvTest.ui().live.opz.separato = false; });
    const nPrima = await page.evaluate(() => window.__dpv.doc.media.filter((m) => m.name.startsWith('Registrazione')).length);
    const R5 = await registra('a.voce.muto = true;');
    const R6 = await registra('');
    prova('in un file solo (voce e computer mescolati) la somma c\'è, e con la voce muta resta solo il computer', R6.r.n === nPrima + 2 && R6.r.sch.rms > R5.r.sch.rms * 1.25 && R5.r.sch.rms > 0.03, JSON.stringify({ senza: R5.r.sch, con: R6.r.sch, n: R6.r.n, nPrima }));

    // il telecomando mostra le stesse barre in piccolo
    await page.evaluate(() => { window.__dpvTest.ui().live.opz.separato = true; });
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('.live').classList.contains('in-onda'), null, { timeout: 12000 });
    await page.evaluate(() => window.__dpvTest.ui().live.telecomandoNellaPagina(true));
    await page.waitForTimeout(900);
    const tele = await page.evaluate(() => {
      const t = (s) => document.querySelector(`.live-mini .tele-liv.${s} i`);
      const w = (e) => Number((e.style.transform.match(/scaleX\(([\d.]+)\)/) || [])[1] || 0);
      return { voce: w(t('voce')), computer: w(t('computer')), visibili: !!document.querySelector('.live-mini .tele-livelli') && document.querySelector('.live-mini .tele-livelli').getBoundingClientRect().width > 20 };
    });
    await page.screenshot({ path: `${OUT}/live-audio-telecomando.png` });
    prova('il telecomando ha due barrette (computer e voce) che si muovono mentre registri', tele.voce > 0.5 && tele.computer > 0.5 && tele.visibili, JSON.stringify(tele));
    await page.keyboard.press('f');
    await page.evaluate(() => window.__dpvTest.ui().live.ultima);
    await page.waitForTimeout(300);
    const chiuso = await page.evaluate(() => ({ mini: document.documentElement.classList.contains('mini-live'), mixer: window.__dpvTest.ui().live.mixer }));
    prova('fermata la registrazione il telecomando si chiude e il mixer non resta aperto', !chiuso.mini && chiuso.mixer === null, JSON.stringify(chiuso));

    // la spia di saturazione: un computer a piena scala (e la voce a +12 dB) la accendono
    await page.evaluate(() => {
      window.__pc.gain.value = 1;
      const live = window.__dpvTest.ui().live, L = window.__dpvTest.LV.liveAudioPuro;
      const a = L.copiaImpostazioni(L.IMPOSTAZIONI0); live.opz.audio = a;
    });
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('.live').classList.contains('in-onda'), null, { timeout: 12000 });
    await page.waitForTimeout(1200);
    const sat = await page.evaluate(() => ({
      pc: document.querySelectorAll('.la-compatto .la-misura')[0].dataset.clip, voce: document.querySelectorAll('.la-compatto .la-misura')[1].dataset.clip,
      picco: Number(document.querySelectorAll('.la-compatto .la-misura')[0].dataset.livello),
    }));
    await page.screenshot({ path: `${OUT}/live-audio-registra.png` });
    await page.keyboard.press('f');
    await page.evaluate(() => window.__dpvTest.ui().live.ultima);
    await page.evaluate(() => { window.__pc.gain.value = 0.1; });
    prova('un computer a piena scala accende la spia di saturazione, la voce a livello normale no; il limitatore tiene il picco a −1 dB', sat.pc === '1' && sat.voce === '0' && sat.picco < -0.5, JSON.stringify(sat));

    // a finestra piccola tutto ci sta, senza scorrere di lato
    await page.setViewportSize({ width: 1000, height: 640 });
    await page.waitForTimeout(300);
    const piccola = await page.evaluate(() => {
      const col = document.querySelector('.live-comandi');
      const fuori = [...document.querySelectorAll('.live-comandi *')].filter((e) => { const r = e.getBoundingClientRect(); const c = col.getBoundingClientRect(); return r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1); }).map((e) => e.className || e.tagName);
      return { scrollX: col.scrollWidth > col.clientWidth + 1, fuori: fuori.slice(0, 5), compatto: document.querySelector('.live-regia .la-compatto').getBoundingClientRect().height };
    });
    await page.screenshot({ path: `${OUT}/live-audio-piccola.png` });
    prova('a 1000×640 niente esce dalla colonna dei comandi e le barre piccole restano in cima', !piccola.scrollX && piccola.fuori.length === 0 && piccola.compatto > 10 && piccola.compatto < 40, JSON.stringify(piccola));
    await page.setViewportSize({ width: 1600, height: 950 });

    await page.evaluate(() => { clearInterval(window.__giroLive); document.querySelectorAll('.tela-live-prova').forEach((e) => e.remove()); });
    prova('nessun errore nella pagina (audio di LIVE)', errori.length === 0, errori.slice(0, 4).join(' | '));
  } finally {
    await contesto.close();
  }
}
