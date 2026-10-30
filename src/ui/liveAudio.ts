// L'audio di LIVE nella pagina: le barre dei livelli (computer e voce, sinistro e destro, con il picco che resta un
// attimo e la spia di saturazione), il mixer (volume, muto, bilanciamento, "abbassa il computer quando parlo") e i
// filtri della voce con i loro preset. Il grafo che li fa suonare sta in src/media/liveAudio.ts, i conti in
// src/core/liveAudio.ts. Qui c'è solo l'interfaccia: legge e scrive le scelte tramite `Colloquio`.
import '../stile/liveAudio.css';
import {
  bilancioADb, copiaImpostazioni, DB_MAX, DB_MIN, IMPOSTAZIONI0, MisuraPicco, PRESET_MIX, PRESET_VOCE, presetCorrente,
  presetMixCorrente, testoDb, type FiltriVoce, type ImpostazioniAudio,
} from '../core/liveAudio';
import type { MixerLive, Picchi } from '../media/liveAudio';
import { h, icona } from './dom';

/** cosa serve dalla pagina LIVE */
export interface Colloquio {
  leggi: () => ImpostazioniAudio;
  /** salva e applica; `vincoli` = sono cambiati i filtri del browser (disturbi, eco, volume automatico) */
  scrivi: (a: ImpostazioniAudio, vincoli: boolean) => void;
  mixer: () => MixerLive | null;
  /** il tasto "Prova l'audio": apre o chiude il microfono di prova */
  prova: () => void;
  inProva: () => boolean;
  /** a ogni giro delle barre: i livelli di computer e voce (li usa il telecomando) */
  suLivelli?: (computer: Picchi, voce: Picchi) => void;
}

const ZERO: Picchi = [0, 0];

/** una barra stereo a LED: verde, gialla da −18 dB, rossa da −6; il picco resta; in fondo la spia di saturazione */
export class LivelloStereo {
  el: HTMLCanvasElement;
  misura = new MisuraPicco();
  private dpr = 1;
  private visto = '';
  private osservatore: ResizeObserver;

  constructor(classe: string, titolo: string, private segmenti = 36) {
    this.el = h('canvas', { class: 'la-misura ' + classe, title: titolo, 'data-livello': '-60', 'data-clip': '0' });
    this.el.addEventListener('click', () => { this.misura.azzera(); this.visto = ''; });
    this.osservatore = new ResizeObserver(() => this.adatta());
    this.osservatore.observe(this.el);
  }

  /** smette di guardare la misura (la tela non si ridisegna più) */
  distruggi() { this.osservatore.disconnect(); this.el.width = 0; this.el.height = 0; }

  private adatta() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    const r = this.el.getBoundingClientRect();
    const w = Math.round(r.width * this.dpr), hh = Math.round(r.height * this.dpr);
    // la tela si rifà solo se la misura è cambiata davvero (cambiare width/height svuota il disegno e butta il buffer sulla scheda video)
    if (w === this.el.width && hh === this.el.height) return;
    this.el.width = w;
    this.el.height = hh;
    this.visto = '';
    // ridimensionare svuota il disegno: a riposo nessuno lo rifà, quindi i LED spenti si ridisegnano subito
    this.disegna(this.misura.clip(performance.now()));
  }

  aggiorna(picchi: Picchi, ora: number) {
    const m = this.misura;
    m.aggiorna(picchi, ora);
    const clip = m.clip(ora);
    this.el.dataset.livello = (20 * Math.log10(Math.max(1e-6, picchi[0], picchi[1]))).toFixed(1);
    this.el.dataset.clip = clip ? '1' : '0';
    const chiave = m.barra.map((x) => x.toFixed(3)).join() + m.tenuto.map((x) => x.toFixed(3)).join() + clip;
    if (chiave === this.visto) return;
    this.visto = chiave;
    this.disegna(clip);
  }

  private disegna(clip: boolean) {
    const c = this.el, ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height, d = this.dpr;
    if (!W || !H) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const gap = 2 * d, bh = (H - gap) / 2, spia = Math.min(bh * 2.4, 14 * d), N = this.segmenti;
    const x0 = 0, w = W - spia - 3 * d;
    for (let i = 0; i < 2; i++) {
      const y = i * (bh + gap);
      ctx.fillStyle = '#0c0b10';
      ctx.fillRect(x0, y, w, bh);
      const sw = w / N;
      for (let s = 0; s < N; s++) {
        const k = (s + 0.5) / N, db = -60 + k * 60;
        const acceso = k < this.misura.barra[i];
        const picco = Math.abs(k - this.misura.tenuto[i]) < 1 / N + 0.001 && this.misura.tenuto[i] > 0.02;
        const on = acceso || picco;
        ctx.fillStyle = db > -6 ? (on ? '#ff3a4a' : '#4a1a20') : db > -18 ? (on ? '#ffd54a' : '#4a4018') : (on ? '#5dffb4' : '#1b4a35');
        ctx.fillRect(x0 + s * sw + d * 0.5, y + d * 0.5, sw - d, bh - d);
      }
    }
    // la spia di saturazione (clip): rossa e accesa per un paio di secondi
    ctx.fillStyle = clip ? '#ff3a4a' : '#2a1318';
    if (clip) { ctx.shadowColor = '#ff3a4a'; ctx.shadowBlur = 8 * d; }
    ctx.fillRect(W - spia, 0, spia, H);
    ctx.shadowBlur = 0;
  }
}

type Lettura = () => number;

export class PannelloAudio {
  /** il pannello grande (nella colonna di LIVE) */
  el: HTMLElement;
  /** il tasto piccolo accanto al microfono: apre il microfono per vedere il livello senza registrare */
  provaPiccola: HTMLButtonElement;
  private sinc: (() => void)[] = [];
  private grandi: { computer: LivelloStereo; voce: LivelloStereo };
  private piccoli: { computer: LivelloStereo; voce: LivelloStereo };
  private statoPc: HTMLElement;
  private statoVoce: HTMLElement;
  /** le scritte di stato nelle righe compatte delle sorgenti (le stesse parole delle strisce grandi) */
  private statiPiccoli: { computer: HTMLElement; voce: HTMLElement };
  private bProva: HTMLButtonElement;
  private giro = 0;
  private ascoltaEl: HTMLElement;
  /** avviso: sul browser senza AudioWorklet la dinamica non c'è */
  private senzaWorklet: HTMLElement;

  constructor(private col: Colloquio) {
    this.grandi = {
      computer: new LivelloStereo('grande', 'Audio del computer, sinistro e destro. Clic: azzera la spia di saturazione'),
      voce: new LivelloStereo('grande', 'Voce (microfono), sinistro e destro. Clic: azzera la spia di saturazione'),
    };
    this.piccoli = {
      computer: new LivelloStereo('piccolo', 'Audio del computer', 28),
      voce: new LivelloStereo('piccolo', 'Voce (microfono)', 28),
    };
    this.statoPc = h('span', { class: 'la-stato' });
    this.statoVoce = h('span', { class: 'la-stato' });
    this.statiPiccoli = { computer: h('span', { class: 'la-stato' }), voce: h('span', { class: 'la-stato' }) };
    this.provaPiccola = h('button', { class: 'la-prova-mini', title: 'Prova il microfono: vedi il livello senza registrare', on: { click: () => this.col.prova() } }) as HTMLButtonElement;

    this.bProva = h('button', { class: 'la-prova', title: 'Apre il microfono per vedere i livelli e sentire i filtri, senza registrare', on: { click: () => this.col.prova() } }) as HTMLButtonElement;
    this.ascoltaEl = this.interruttore('Ascolto quello che esce (meglio con le cuffie)', 'Fa uscire dalle casse la voce trattata, per sentire i filtri. Con le casse accese il microfono la riprende e fischia: usa le cuffie',
      () => !!this.col.mixer()?.ascoltando, () => { const m = this.col.mixer(); if (m) m.ascolta(!m.ascoltando); this.aggiorna(); });
    this.ascoltaEl.classList.add('la-ascolta');
    this.senzaWorklet = h('p', { class: 'nota la-senza via' }, 'Questo browser non sa fare porta, de-esser, compressore e abbassa-computer: restano volumi, bilanciamento, tono e limitatore.');

    // ——— le due strisce ———
    const striscia = (chi: 'computer' | 'voce', nome: string, ic: string, stato: HTMLElement) => {
      const lett = () => this.col.leggi()[chi];
      const val = h('span', { class: 'la-val' });
      const fader = h('input', { type: 'range', class: 'la-fader', min: DB_MIN, max: DB_MAX, step: 0.5, title: 'Volume (doppio clic: 0 dB, la rotella lo muove)', 'data-canale': chi }) as HTMLInputElement;
      fader.addEventListener('input', () => this.modifica((a) => { a[chi].volume = Number(fader.value); }));
      fader.addEventListener('dblclick', () => this.modifica((a) => { a[chi].volume = 0; }));
      const muto = h('button', { class: 'la-muto', title: 'Muto: questa sorgente non finisce nella registrazione', 'data-canale': chi, on: { click: () => this.modifica((a) => { a[chi].muto = !a[chi].muto; }) } }, icona(ic, 14), h('span', null, 'MUTO')) as HTMLButtonElement;
      this.sinc.push(() => {
        const c = lett();
        fader.value = String(c.volume);
        val.textContent = c.muto ? 'muto' : testoDb(c.volume);
        muto.classList.toggle('acceso', c.muto);
        fader.classList.toggle('spento', c.muto);
      });
      return h('div', { class: 'la-striscia', 'data-chi': chi },
        h('div', { class: 'la-riga1' }, h('b', { class: 'la-nome' }, icona(ic, 13), nome), stato),
        this.grandi[chi].el,
        h('div', { class: 'la-riga2' }, muto, fader, val));
    };

    // ——— il bilanciamento ———
    const bil = h('input', { type: 'range', class: 'la-bilancio', min: -100, max: 100, step: 1, title: 'Più a sinistra il computer, più a destra la voce (doppio clic: pari)' }) as HTMLInputElement;
    const bilVal = h('span', { class: 'la-val larga' });
    bil.addEventListener('input', () => this.modifica((a) => { a.bilancio = Number(bil.value); }));
    bil.addEventListener('dblclick', () => this.modifica((a) => { a.bilancio = 0; }));
    this.sinc.push(() => {
      const a = this.col.leggi();
      bil.value = String(a.bilancio);
      const o = bilancioADb(a.bilancio);
      bilVal.textContent = a.bilancio === 0 ? 'pari' : a.bilancio > 0 ? `computer ${testoDb(o.computer)}` : `voce ${testoDb(o.voce)}`;
    });
    const presetMix = h('div', { class: 'live-chips' }, PRESET_MIX.map((p) => {
      const b = h('button', { class: 'chip', title: p.info, 'data-mix': p.id, on: { click: () => this.modifica((a) => { a.bilancio = p.bilancio; a.abbassa = p.abbassa; }) } }, p.nome);
      this.sinc.push(() => b.classList.toggle('acceso', presetMixCorrente(this.col.leggi()) === p.id));
      return b;
    }));

    // ——— i filtri della voce ———
    const presetVoce = h('div', { class: 'live-chips la-presetvoce' }, PRESET_VOCE.map((p) => {
      const b = h('button', { class: 'chip', title: p.info, 'data-preset': p.id, on: { click: () => this.modifica((a) => { a.filtri = { ...p.filtri }; }, true) } }, p.nome);
      this.sinc.push(() => b.classList.toggle('acceso', presetCorrente(this.col.leggi().filtri) === p.id));
      return b;
    }));
    const interrF = (testo: string, info: string, k: keyof FiltriVoce, vincoli = false) =>
      this.interruttore(testo, info, () => !!this.col.leggi().filtri[k], () => this.modifica((a) => { (a.filtri[k] as boolean) = !a.filtri[k]; }, vincoli), 'data-filtro', k);
    const cursF = (etic: string, k: keyof FiltriVoce, min: number, max: number, passo: number, fmt: (v: number) => string, info = '') =>
      this.cursore(etic, min, max, passo, () => this.col.leggi().filtri[k] as number, (v) => this.modifica((a) => { (a.filtri[k] as number) = v; }), fmt, info, () => IMPOSTAZIONI0.filtri[k] as number, k);
    const db1 = (v: number) => `${v > 0 ? '+' : ''}${String(Math.round(v * 10) / 10).replace('.', ',')} dB`;
    const avanzate = h('details', { class: 'la-av' },
      h('summary', null, 'Opzioni avanzate della voce'),
      h('div', { class: 'la-av-dentro' },
        interrF('Passa-alto (toglie il rimbombo)', 'Toglie i suoni bassissimi: rimbombo, vento, colpi sul tavolo', 'passaAlto'),
        cursF('Taglia sotto', 'passaAltoHz', 40, 300, 5, (v) => `${Math.round(v)} Hz`),
        interrF('Porta (noise gate)', 'Quando non parli il microfono si abbassa del tutto: via ventola e tastiera', 'porta'),
        cursF('Soglia della porta', 'portaSoglia', -80, -15, 1, (v) => `${Math.round(v)} dB`, 'Sotto questo livello la porta si chiude. Più alto = chiude di più'),
        interrF('Tono (calore, presenza, aria)', 'Tre manopole per dare corpo e chiarezza alla voce', 'eq'),
        cursF('Calore (bassi)', 'calore', -12, 12, 0.5, db1), cursF('Presenza (medi)', 'presenza', -12, 12, 0.5, db1), cursF('Aria (acuti)', 'aria', -12, 12, 0.5, db1),
        interrF('De-esser (smorza le S)', 'Abbassa le S e le Z troppo taglienti, solo quando servono', 'deesser'),
        cursF('Forza del de-esser', 'deesserForza', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
        interrF('Compressore', 'Avvicina le parole forti a quelle piano: la voce resta regolare', 'compressore'),
        cursF('Soglia', 'compSoglia', -50, -6, 1, (v) => `${Math.round(v)} dB`), cursF('Rapporto', 'compRapporto', 1, 10, 0.5, (v) => `${String(v).replace('.', ',')} : 1`), cursF('Recupero', 'compRecupero', 0, 12, 0.5, db1, 'Quanto rialzare la voce dopo averla compressa'),
        interrF('Limitatore', 'Il paracadute: i picchi non superano −1 dB. Non tocca i suoni normali', 'limitatore'),
        interrF('Toglie l\'eco (browser)', 'Il filtro anti-eco del browser: serve se registri con le casse accese', 'eco', true),
        interrF('Volume automatico (browser)', 'Il browser alza e abbassa il microfono da solo. Con un preset di compressione meglio spento', 'livellaAuto', true)));

    // ——— abbassa il computer quando parlo ———
    const abbassaAv = h('details', { class: 'la-av' },
      h('summary', null, 'Come si abbassa il computer'),
      h('div', { class: 'la-av-dentro' },
        this.cursore('Parte quando la voce supera', -70, -15, 1, () => this.col.leggi().abbassaSoglia, (v) => this.modifica((a) => { a.abbassaSoglia = v; }), (v) => `${Math.round(v)} dB`, 'Il livello della voce da cui il computer comincia a scendere', () => IMPOSTAZIONI0.abbassaSoglia, 'abbassaSoglia'),
        this.cursore('Scende di', 3, 30, 1, () => this.col.leggi().abbassaQuanto, (v) => this.modifica((a) => { a.abbassaQuanto = v; }), (v) => `${Math.round(v)} dB`, '', () => IMPOSTAZIONI0.abbassaQuanto, 'abbassaQuanto'),
        this.cursore('Risale in', 100, 3000, 50, () => this.col.leggi().abbassaRilascio, (v) => this.modifica((a) => { a.abbassaRilascio = v; }), (v) => `${(v / 1000).toFixed(2).replace('.', ',')} s`, 'Quanto ci mette a tornare su quando smetti di parlare', () => IMPOSTAZIONI0.abbassaRilascio, 'abbassaRilascio')));

    const sez = (t: string) => h('h4', { class: 'live-sez' }, t);
    this.el = h('div', { class: 'la' },
      h('div', { class: 'la-testa' }, sez('Audio: computer e voce'), this.bProva),
      striscia('computer', 'Computer', 'altoparlante', this.statoPc),
      striscia('voce', 'Voce', 'mic', this.statoVoce),
      this.ascoltaEl,
      this.senzaWorklet,
      h('div', { class: 'la-bil-riga' }, h('span', { class: 'la-lato' }, 'Computer'), bil, h('span', { class: 'la-lato' }, 'Voce'), bilVal),
      presetMix,
      this.interruttore('Abbassa il computer quando parlo', 'Mentre parli il computer scende da solo e risale quando smetti: la voce si capisce sempre',
        () => this.col.leggi().abbassa, () => this.modifica((a) => { a.abbassa = !a.abbassa; }), 'data-filtro', 'abbassa'),
      abbassaAv,
      this.interruttore('Limitatore sul computer', 'Il paracadute dell\'audio del computer: i picchi non superano −1 dB',
        () => this.col.leggi().limitaComputer, () => this.modifica((a) => { a.limitaComputer = !a.limitaComputer; }), 'data-filtro', 'limitaComputer'),
      sez('Filtri della voce'),
      interrF('Toglie i disturbi (AI)', 'Il filtro anti-rumore del browser o del sistema, che toglie ventola, tastiera e rumori di fondo e lascia la voce (dove c\'è, usa un modello di intelligenza artificiale)', 'disturbi', true),
      presetVoce,
      avanzate,
      h('p', { class: 'nota' }, 'Le regolazioni valgono dal vivo e finiscono nella registrazione. La voce si prova subito con "Prova l\'audio"; l\'audio del computer si vede quando parte la registrazione, dopo aver scelto lo schermo.'));
    this.aggiorna();
    this.sincronizza();
    this.scriviStati(null, performance.now());
  }

  /** i pezzi di una sorgente per le righe compatte di LIVE: la barra stereo a LED e la scritta di stato */
  sorgente(chi: 'computer' | 'voce') { return { barra: this.piccoli[chi].el, stato: this.statiPiccoli[chi] }; }

  /** un tasto con la spia, come gli altri interruttori di LIVE */
  private interruttore(testo: string, info: string, leggi: () => boolean, clic: () => void, attr?: string, valore?: string): HTMLElement {
    const led = h('span', { class: 'led' });
    const b = h('button', { class: 'fin-interruttore', title: info, on: { click: clic } }, led, h('span', { class: 'fin-int-testo' }, testo));
    if (attr && valore) b.setAttribute(attr, valore);
    this.sinc.push(() => { const s = leggi(); b.classList.toggle('acceso', s); led.classList.toggle('acceso', s); });
    return b;
  }

  /** un cursore con il nome e il valore; doppio clic = valore di partenza */
  private cursore(etic: string, min: number, max: number, passo: number, leggi: Lettura, scrivi: (v: number) => void, fmt: (v: number) => string, info: string, partenza: Lettura, nome: string): HTMLElement {
    const inp = h('input', { type: 'range', min, max, step: passo, title: (info ? info + ' ' : '') + '(doppio clic: valore di partenza)', 'data-cursore': nome }) as HTMLInputElement;
    const val = h('span', { class: 'la-val' });
    inp.addEventListener('input', () => scrivi(Number(inp.value)));
    inp.addEventListener('dblclick', () => scrivi(partenza()));
    this.sinc.push(() => { const v = leggi(); inp.value = String(v); val.textContent = fmt(v); });
    return h('label', { class: 'la-cursore' }, h('span', { class: 'la-etic' }, etic), inp, val);
  }

  private modifica(fn: (a: ImpostazioniAudio) => void, vincoli = false) {
    const a = copiaImpostazioni(this.col.leggi());
    const prima = a.filtri;
    fn(a);
    const cambiati = vincoli || a.filtri.disturbi !== prima.disturbi || a.filtri.eco !== prima.eco || a.filtri.livellaAuto !== prima.livellaAuto;
    this.col.scrivi(a, cambiati);
    this.sincronizza();
  }

  /** rimette cursori e tasti come dicono le scelte */
  sincronizza() { for (const f of this.sinc) f(); }

  /** il tasto di prova e l'ascolto secondo lo stato */
  aggiorna() {
    const prova = this.col.inProva();
    this.bProva.textContent = prova ? '■ Ferma la prova' : '▶ Prova l\'audio';
    this.bProva.classList.toggle('acceso', prova);
    this.provaPiccola.textContent = prova ? '■' : '▶';
    this.provaPiccola.classList.toggle('acceso', prova);
    this.provaPiccola.title = prova ? 'Ferma la prova del microfono' : 'Prova il microfono: vedi il livello senza registrare';
    this.ascoltaEl.classList.toggle('via', !prova);
    this.sincronizza();
  }

  /** da chiamare quando nasce un mixer: le barre si muovono finché c'è qualcosa da vedere */
  sveglia() {
    // un mixer nuovo: i picchi e le spie ricominciano da zero
    for (const x of [this.grandi.computer, this.grandi.voce, this.piccoli.computer, this.piccoli.voce]) x.misura.azzera();
    if (this.giro) return;
    this.giro = window.setInterval(() => this.passo(), 40);
  }

  private passo() {
    const ora = performance.now();
    const m = this.col.mixer();
    const l = m?.ok ? m.livelli() : null;
    const pc = l?.computer ?? ZERO, vo = l?.voce ?? ZERO;
    this.grandi.computer.aggiorna(pc, ora); this.piccoli.computer.aggiorna(pc, ora);
    this.grandi.voce.aggiorna(vo, ora); this.piccoli.voce.aggiorna(vo, ora);
    this.col.suLivelli?.(pc, vo);
    this.scriviStati(m?.ok ? m : null, ora);
    this.senzaWorklet.classList.toggle('via', !(m?.ok && !m.worklet));
    if (!m && this.tutteFerme()) { clearInterval(this.giro); this.giro = 0; }
  }

  private tutteFerme() {
    return [this.grandi.computer, this.grandi.voce, this.piccoli.computer, this.piccoli.voce].every((x) => x.misura.fermo());
  }

  /** le scritte accanto ai nomi: saturazione, quanto sta abbassando la porta, il compressore, l'abbassa-computer */
  private scriviStati(m: MixerLive | null, ora: number) {
    const a = this.col.leggi();
    const r = m?.riduzioni();
    const scrivi = (el: HTMLElement, testo: string, avviso: boolean, barra?: HTMLElement, nome?: string) => {
      if (el.textContent !== testo) el.textContent = testo;
      el.classList.toggle('avviso', avviso);
      if (barra && nome) { const t = `${nome}: ${testo} · clic: azzera la spia`; if (barra.title !== t) barra.title = t; }
    };
    const satPc = this.grandi.computer.misura.clip(ora), satVoce = this.grandi.voce.misura.clip(ora);
    const picco = (l: LivelloStereo) => { const d = l.misura.picchiDb(); return d < -59 ? 'silenzio' : `picco ${Math.round(d)} dB`; };
    let pc = m ? picco(this.grandi.computer) : 'quando registri';
    if (satPc) pc = 'satura: abbassa il volume';
    else if (m && r && a.abbassa && r.duck < -1) pc = `abbassato di ${Math.round(-r.duck)} dB`;
    scrivi(this.statoPc, pc, satPc);
    scrivi(this.statiPiccoli.computer, pc, satPc, this.piccoli.computer.el, 'Audio del computer');
    let vo = m ? picco(this.grandi.voce) : 'a riposo';
    if (satVoce) vo = 'satura: abbassa il volume';
    else if (m && r && a.filtri.porta && r.porta < -10) vo = 'porta chiusa';
    else if (m && r && a.filtri.compressore && r.comp < -1) vo = `compressore ${Math.round(r.comp)} dB`;
    scrivi(this.statoVoce, vo, satVoce);
    scrivi(this.statiPiccoli.voce, vo, satVoce, this.piccoli.voce.el, 'Microfono');
  }

  /** le misure per le prove */
  misure() {
    return { computer: this.grandi.computer.el, voce: this.grandi.voce.el, piccoloComputer: this.piccoli.computer.el, piccoloVoce: this.piccoli.voce.el };
  }
}
