// La timeline: tutto disegnato su una tela (migliaia di clip restano fluide), le testate delle tracce in HTML.
// Clic sul righello = cursore · clic su una clip = selezione · trascina = sposta (senza coprire niente)
// bordi = trim · Shift sul taglio = roll · Alt+trascina = slip · rotella = fotogramma per fotogramma col suono
// linea gialla sulle clip audio = volume (trascina, doppio clic per un punto) · "fx" in fondo = effetti al volo.
// Gli FX a blocchetti (effetti e transizioni) stanno in basso sulle clip video: si allungano dai bordi, l'altoparlante
// accende e spegne il loro suono. Alt+Shift+trascina = sposta la clip e tutto quello che viene dopo, su tutte le tracce.
import { leggiGeneratore } from '../core/generatori';
import { store } from '../core/store';
import { motore } from '../motore';
import * as M from '../core/montaggio';
import { CURVE, curvaFade, nomeCurva, clipById, dbToGain, end, isVideoClip, keyValue, mediaOf, newTrack, newTransition, nextTrackName, projectEnd, srcTimeAt, trackOf, ALTEZZA } from '../core/progetto';
import type { Clip, Key, MediaItem, Project, Sottotitolo, Track, TrackKind } from '../core/tipi';
import { SOTTO0, bordoRiga, dividiRiga, limitiRiga, rigaAl, rigaVicina, sottotitoliDi, unisciRighe } from '../core/sottotitoli';
import { ETICHETTE } from '../core/tipi';
import { fps, frameToTc, f2s, tcBase } from '../core/timecode';
import { miniatura, mediaRT, PEAKS_PER_SEC, quandoMiniature, quandoPicchi } from '../media/libreria';
import { modi, esegui, scartoInVista, montaDalPlayer, inserisciGeneratore, eliminaLato, mettiBlocco, bloccoNuovo } from '../azioni';
import { cambiaModello, centro, durataBlocco, durataDelBlocco, nomeBlocco, nuovoBlocco, piccoDi, posaBlocco, postoBlocco, tagliFra, taglioDelBlocco, taglioVicino, tracciaPerBlocco, transizioneSul, transizioniSul, EFFETTI_TEMPO, type Dove, type Taglio } from '../core/blocchi';
import { SUONI, suono } from '../core/suoni';
import { attivaDi, eliminaSequenza, nuovaSequenza, passaA, rinominaSequenza, sequenzeDi } from '../core/sequenze';

import { EFFETTI_AUDIO, EFFETTI_VIDEO, adatte, alternaEffetto, effettiAccesi, effetto } from '../effetti';
import { ascoltaSuono, banco } from '../media/audio';
import { avviso, chiedi, clamp, h, icona, menuContesto, type VoceMenu } from './dom';
import { vociMenuAudioAI } from './audioAI';
import { etichettaVelocita, finestraVelocita, impostaVelocita } from './velocita';
import { registraBersaglio } from './trascina';
import { apriEditorClip } from './editorClip';
import { EFFETTI as DVE, TENDINE, nomeModello } from '../render/transizioni';

const RIGHELLO = 34;
const SEP = 10;
/** la barra per scorrere su e giù, a destra (sempre lì, anche con poche tracce) */
const VBAR = 14;
/** la riga dei sottotitoli, sotto le tracce video (c'è quando ci sono righe) */
const SOTT_H = 28;
/** l'altezza del navigatore in fondo (la barra per andare a destra e sinistra) */
const NAV = 24;
const BORDO = 8;
/** larghezza del tasto "fx" in fondo alle clip */
const FX_W = 22;
/** le clip che si portano il suono dentro (niente clip audio a parte): titoli, countdown, colori */
const SONORE = new Set(['title', 'countdown', 'color']);
/** chi tiene il suono: il blocchetto FX o la clip stessa */
const sonoro = (c: Clip) => c.fxb ?? c.sfx;
const sonoroScrivi = (c: Clip) => c.fxb ?? (c.sfx ??= {});
/** il volume sulle clip audio: da −40 a +12 dB sull'altezza del corpo */
const DB_MIN = -40, DB_MAX = 12;

const COLORI: Record<string, [string, string]> = {
  video: ['#3565c7', '#23458c'],
  audio: ['#2a8a5e', '#1b5e3f'],
  title: ['#8448d6', '#5b2c9e'],
  effetto: ['#d44bd9', '#8d2196'],
  transizione: ['#22c4d4', '#0e7684'],
  gen: ['#b67a2c', '#7c521b'],
  tone: ['#9a7d22', '#6b5614'],
};

type Presa =
  | { tipo: 'cursore' }
  | { tipo: 'sposta'; ids: Set<string>; base: Clip[]; x0: number; y0: number; kind: TrackKind; df: number; dt: number; ancora: Clip; tutto?: boolean }
  | { tipo: 'trim'; id: string; edge: 'in' | 'out'; base: Clip[]; x0: number; d: number; linked: boolean; ripple: boolean }
  | { tipo: 'roll'; l: string; r: string; base: Clip[]; x0: number; d: number }
  | { tipo: 'slip'; ids: Set<string>; base: Clip[]; x0: number; d: number }
  | { tipo: 'riquadro'; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { tipo: 'elastico'; id: string; key: number; base: Clip[]; creato: boolean; mosso: boolean }
  | { tipo: 'volume'; id: string; y0: number; gain0: number; keys0: Key[]; seg: [number, number] | null; mosso: boolean }
  | { tipo: 'fade'; id: string; lato: 'in' | 'out'; mosso: boolean; curva?: { y0: number; k0: number; s: boolean } }
  | { tipo: 'sott'; id: string; lato: 'in' | 'out' | 'corpo'; x0: number; righe0: Sottotitolo[]; mosso: boolean };

interface Colpo {
  track?: Track;
  clip?: Clip;
  zona: 'righello' | 'corpo' | 'in' | 'out' | 'vuoto' | 'fuori' | 'fx' | 'volume' | 'punto' | 'fadeIn' | 'fadeOut' | 'curvaIn' | 'curvaOut' | 'suono' | 'sott';
  /** sulla riga dei sottotitoli: quale riga e quale parte (vuoto = nessuna) */
  sott?: { id: string; lato: 'in' | 'out' | 'corpo' };
  f: number;
  taglio?: { l: Clip; r: Clip };
  /** indice del punto del volume sotto il puntatore */
  punto?: number;
}

export class Timeline {
  el: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private testate: HTMLElement;
  /** il navigatore in fondo: tutto il montaggio in piccolo, la finestra che si vede si trascina e si allarga */
  private nav: HTMLCanvasElement;
  /** la barra verticale a destra: la finestra che si vede, fra tutte le tracce */
  private vbar: HTMLElement;
  private vpollice: HTMLElement;
  private area: HTMLElement;
  /** le schede delle timeline del progetto, sopra a tutto */
  private schede: HTMLElement;
  private firmaSchede = '';
  ppf = 4; // pixel per fotogramma
  scrollF = 0;
  scrollY = 0;
  private dpr = 1;
  private W = 0;
  private H = 0;
  private sporco = true;
  private presa: Presa | null = null;
  private snapLinea: number | null = null;
  private fantasma: { track: string; f: number; len: number; kind: TrackKind; nuova?: boolean }[] | null = null;
  /** dove andrebbe il blocchetto FX che si sta trascinando dal contenitore (e il taglio su cui cade) */
  private fantasmaBlocco: { track: string; start: number; len: number; tipo: 'effetto' | 'transizione'; taglio: Taglio | null; dove: Dove; nome: string } | null = null;
  /** la clip su cui cadrebbe l'effetto che si sta trascinando */
  private bersaglioFx: string | null = null;
  private seguiCursore = true;
  private misureAccese = false;
  private ultimoScrub = 0;
  private rotella = 0;
  private misure: { el: HTMLElement; track: string }[] = [];

  constructor() {
    this.cv = h('canvas', { class: 'tl-tela', tabindex: 0 });
    this.ctx = this.cv.getContext('2d', { alpha: false })!;
    this.testate = h('div', { class: 'tl-testate' });
    this.nav = h('canvas', { class: 'tl-nav', title: 'Tutto il montaggio: trascina la finestra per scorrere, i suoi bordi per lo zoom, clic per andare lì' });
    this.vpollice = h('div', { class: 'tl-vpollice' });
    this.vbar = h('div', { class: 'tl-vbar', title: 'Su e giù fra le tracce: trascina, o clic per saltare · rotella sulle testate' }, this.vpollice);
    this.vbar.style.bottom = NAV + 'px';
    this.area = h('div', { class: 'tl-area' }, this.cv, this.vbar, this.nav);
    this.schede = h('div', { class: 'tl-schede' });
    this.el = h('div', { class: 'timeline' },
      this.schede,
      h('div', { class: 'tl-angolo' },
        h('button', {
          class: 'btn-mini tl-piu', title: 'Aggiungi una traccia',
          on: {
            click: (e: MouseEvent) => menuContesto(e.clientX, e.clientY, [
              { nome: 'Traccia video', tasto: 'Ctrl+Alt+V', fn: () => esegui('tracciaV') },
              { nome: 'Traccia audio', tasto: 'Ctrl+Alt+A', fn: () => esegui('tracciaA') },
            ]),
          },
        }, icona('piu', 13)),
        h('button', {
          class: 'btn-mini tl-piu', title: 'Timeline stretta: proprietà, mixer e VU scendono fino in fondo (V) · di nuovo per tornare larga',
          on: { click: () => document.dispatchEvent(new CustomEvent('dpv:vista')) },
        }, icona('vista', 13))),
      this.testate, this.area);
    // le lucine dei livelli nelle testate audio
    motore.ogniGiro((suona) => {
      if (!suona && !this.misureAccese) return;
      this.misureAccese = suona;
      for (const m of this.misure) {
        const v = suona ? banco.livelloTraccia(m.track) : 0;
        m.el.style.setProperty('--liv', String(Math.min(1, Math.max(0, (20 * Math.log10(Math.max(1e-5, v)) + 48) / 48))));
      }
    });
    new ResizeObserver(() => this.adatta()).observe(this.area);
    store.on('doc', () => { this.testateSeCambiate(); this.costruisciSchede(); this.sporca(); });
    store.on('sel', () => this.sporca());
    store.on('view', () => { this.costruisciTestate(); this.sporca(); });
    store.on('status', () => this.sporca());
    store.on('head', () => { this.segui(); this.sporca(); });
    quandoMiniature(() => this.sporca());
    quandoPicchi(() => this.sporca());
    this.eventi();
    document.addEventListener('dpv:sott', (e) => this.sottOp((e as CustomEvent<string>).detail));
    this.costruisciTestate();
    this.costruisciSchede();
    const loop = () => { if (this.sporco) { this.sporco = false; this.disegna(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  sporca() { this.sporco = true; }

  private adatta() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    const r = this.area.getBoundingClientRect();
    this.W = Math.max(50, r.width - VBAR);
    this.H = Math.max(50, r.height - NAV);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.cv.style.width = this.W + 'px';
    this.cv.style.height = this.H + 'px';
    this.nav.width = Math.round((this.W + VBAR) * this.dpr);
    this.nav.height = Math.round(NAV * this.dpr);
    this.nav.style.width = this.W + VBAR + 'px';
    this.nav.style.height = NAV + 'px';
    this.sporca();
  }

  // ——— coordinate ———
  fX = (f: number) => (f - this.scrollF) * this.ppf;
  xF = (x: number) => x / this.ppf + this.scrollF;

  /** dove sta la riga dei sottotitoli (null = non c'è): la calcola righe() */
  rigaSott: { y: number; h: number } | null = null;
  /** le righe dei sottotitoli scelte nella timeline */
  selSott = new Set<string>();
  /** la riga SOTT si vede anche vuota (comando "Mostra la riga dei sottotitoli"), così si può cominciare da lì */
  mostraSott = false;
  private conSott(p: Project) { return (p.sottotitoli?.righe.length ?? 0) > 0 || this.mostraSott; }

  /** zoom verticale (Ctrl+Shift+rotella): le tracce più alte o più basse, per tutte insieme */
  zoomV = (() => { try { return clamp(Number(localStorage.getItem('dpv-zoomv')) || 1, 0.6, 3); } catch { return 1; } })();
  /** mentre si tira l'altezza di una traccia la scala resta ferma */
  private kFermo: number | null = null;
  /**
   * Quanto sono alte le tracce sulla tela: sempre la misura di base di ogni traccia (la stessa fin dalle prime versioni),
   * qualunque sia lo spazio che la timeline ha a disposizione: se la timeline si allarga resta solo più posto vuoto, le clip non
   * si ingrossano. Cambia solo lo zoom verticale scelto da te (Ctrl+Shift+rotella).
   */
  kV(_p: Project = store.doc): number {
    if (this.kFermo !== null) return this.kFermo;
    return Math.round(this.zoomV * 100) / 100;
  }
  private altezza(t: Track, k: number) { return Math.round(t.height * k); }

  /** zoom verticale: più su, più alte */
  zoomVerticale(fattore: number) {
    this.zoomV = clamp(this.zoomV * fattore, 0.6, 3);
    try { localStorage.setItem('dpv-zoomv', String(this.zoomV)); } catch { /* niente */ }
    this.scorriY(this.scrollY);
    this.costruisciTestate();
    this.sporca();
    avviso(`Tracce ${Math.round(this.kV() * 100)}%`, 'info', 700);
  }

  private righe(p: Project) {
    const out: { t: Track; y: number; h: number }[] = [];
    let y = RIGHELLO - this.scrollY;
    let prima: Track | null = null;
    this.rigaSott = null;
    const sott = this.conSott(p);
    const k = this.kV(p);
    for (const t of p.tracks) {
      if (prima && prima.kind !== 'audio' && t.kind === 'audio') {
        if (sott) { this.rigaSott = { y, h: SOTT_H }; y += SOTT_H; }
        y += SEP;
      }
      const hh = this.altezza(t, k);
      out.push({ t, y, h: hh });
      y += hh;
      prima = t;
    }
    if (sott && !this.rigaSott) this.rigaSott = { y, h: SOTT_H };
    return out;
  }

  /** dove sta un blocchetto FX sulla tela, e il suo altoparlante (per le prove automatiche) */
  rettBlocco(id: string) {
    const p = store.doc, c = clipById(p, id);
    const riga = c && this.righe(p).find((r) => r.t.id === c.track);
    if (!c || !riga) return null;
    const { corsia, n } = this.corsie(p, c.track);
    const { top, alt } = this.geoBlocco(riga.y, riga.h, corsia.get(c.id) ?? 0, n);
    const x = this.fX(c.start), w = Math.max(3, c.len * this.ppf);
    return { x, y: top, w, h: alt, sp: this.altoparlante(c, x, w, top, alt) };
  }

  /** dove sta una traccia sulla tela: y e altezza (per le prove automatiche) */
  riga(trackId: string) { const r = this.righe(store.doc).find((x) => x.t.id === trackId); return r ? { y: r.y, h: r.h } : null; }

  private altezzaTotale() {
    const p = store.doc;
    const k = this.kV(p);
    return p.tracks.reduce((s, t) => s + this.altezza(t, k), 0) + SEP + RIGHELLO + 40 + (this.conSott(p) ? SOTT_H : 0);
  }

  /** scorre su e giù fra le tracce (la rotella sulle testate, la barra a destra, il dito) */
  scorriY(y: number) {
    const v = clamp(y, 0, Math.max(0, this.altezzaTotale() - this.H));
    if (v === this.scrollY) return;
    this.scrollY = v;
    this.costruisciTestate();
    this.sporca();
  }

  /** la barra verticale: il pollice è la parte che si vede */
  private disegnaVbar() {
    const tot = this.altezzaTotale(), vis = this.H;
    const pieno = tot <= vis + 1;
    const alto = this.H;
    const hPoll = pieno ? alto - 4 : Math.max(28, (vis / tot) * (alto - 4));
    const y = pieno ? 2 : 2 + (this.scrollY / Math.max(1, tot - vis)) * (alto - 4 - hPoll);
    this.vpollice.style.height = hPoll + 'px';
    this.vpollice.style.transform = `translateY(${y}px)`;
    this.vbar.classList.toggle('pieno', pieno);
  }

  private eventiVbar() {
    const bar = this.vbar;
    bar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = bar.getBoundingClientRect();
      const tot = this.altezzaTotale(), vis = this.H;
      if (tot <= vis + 1) return;
      const pr = this.vpollice.getBoundingClientRect();
      const corsa = r.height - 4 - pr.height;
      if (e.clientY < pr.top || e.clientY > pr.bottom) {
        // clic fuori dal pollice: salta lì (il pollice si centra sul punto)
        this.scorriY(((e.clientY - r.top - pr.height / 2) / Math.max(1, corsa)) * (tot - vis));
      }
      const y0 = e.clientY, s0 = this.scrollY;
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('preso');
      const mv = (ev: PointerEvent) => this.scorriY(s0 + ((ev.clientY - y0) / Math.max(1, corsa)) * (tot - vis));
      const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.classList.remove('preso'); };
      bar.addEventListener('pointermove', mv);
      bar.addEventListener('pointerup', up);
    });
    bar.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) { this.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18); return; } this.scorriY(this.scrollY + e.deltaY * 0.6); }, { passive: false });
  }

  /** i blocchetti FX di una traccia video, ognuno sulla sua corsia (se si sovrappongono si mettono uno sopra l'altro) */
  private corsie(p: Project, trackId: string): { blocchi: Clip[]; corsia: Map<string, number>; n: number } {
    const blocchi = p.clips.filter((c) => c.track === trackId && c.kind === 'fx').sort((a, b) => a.start - b.start || b.len - a.len);
    const fini: number[] = [];
    const corsia = new Map<string, number>();
    for (const b of blocchi) {
      let i = fini.findIndex((e) => e <= b.start);
      if (i < 0) { i = fini.length; fini.push(0); }
      fini[i] = end(b);
      corsia.set(b.id, i);
    }
    return { blocchi, corsia, n: Math.max(1, fini.length) };
  }

  /** dove sta un blocchetto dentro la riga: una striscia sottile in basso (le corsie in più salgono) */
  private geoBlocco(y: number, hh: number, i: number, n: number) {
    const g = this.geo(y, hh);
    // grandi e squadrati, così si prendono bene
    const bh = clamp(Math.round(g.alt * 0.5), 16, 30);
    const lh = n * bh <= g.corpoH + 4 ? bh : Math.max(10, (g.corpoH + 4) / n);
    return { top: g.top + g.alt - (i + 1) * lh, alt: lh - 1 };
  }

  /** il rettangolo dell'altoparlante di un blocchetto (se c'è posto) */
  private altoparlante(c: Clip, x: number, w: number, top: number, alt: number) {
    // c'è su tutti i blocchi: acceso, spento, o da scegliere (tasto destro = il menu dei suoni)
    if (!c.fxb || w < 34 || alt < 10) return null;
    const s = Math.min(18, alt - 4);
    return { x: x + w - s - 5, y: top + (alt - s) / 2, s };
  }

  /** l'altoparlante sulle clip che hanno il suono dentro (titoli, countdown, colori): in alto a destra nel corpo */
  private altoparlanteClip(c: Clip, x: number, w: number, g: { corpoY: number; corpoH: number }) {
    if (!SONORE.has(c.kind) || w < 60 || g.corpoH < 14) return null;
    const s = Math.min(18, g.corpoH - 6);
    return { x: x + w - s - 6, y: g.corpoY + 3, s };
  }

  /** geometria di una clip dentro la sua riga: testa (nome) e corpo (miniature, onda, volume) */
  private geo(y: number, hh: number) {
    const top = y + 2, alt = hh - 4;
    const testa = Math.min(17, Math.round(alt * 0.34));
    return { top, alt, testa, corpoY: top + testa, corpoH: alt - testa };
  }

  /** dove stanno le due maniglie delle dissolvenze (in pixel): alla fine della rampa, o quasi sull'angolo */
  private maniglieFade(c: Clip): [number, number] {
    return [this.fX(c.start + c.fadeIn) + (c.fadeIn ? 0 : 5), this.fX(end(c) - c.fadeOut) - (c.fadeOut ? 0 : 5)];
  }

  /** il volume in dB diventa un'altezza nel corpo della clip (e viceversa) */
  private yDb(db: number, corpoY: number, corpoH: number) { return corpoY + corpoH - ((clamp(db, DB_MIN, DB_MAX) - DB_MIN) / (DB_MAX - DB_MIN)) * corpoH; }
  private dbY(y: number, corpoY: number, corpoH: number) { return Math.round((DB_MIN + clamp(1 - (y - corpoY) / corpoH, 0, 1) * (DB_MAX - DB_MIN)) * 2) / 2; }

  /** le clip che suonano hanno la linea del volume sempre in vista */
  private haVolume(c: Clip, t: Track) { return t.kind === 'audio' && (c.kind === 'media' || c.kind === 'tone' || c.kind === 'beep'); }

  private colpo(x: number, y: number): Colpo {
    const p = store.doc;
    const f = this.xF(x);
    if (y < RIGHELLO) return { zona: 'righello', f };
    const riga = this.righe(p).find((r) => y >= r.y && y < r.y + r.h);
    const rs = this.rigaSott;
    if (rs && y >= rs.y && y < rs.y + rs.h) {
      for (const r of p.sottotitoli?.righe ?? []) {
        const x0 = this.fX(r.da), x1 = this.fX(r.a);
        if (x < x0 - 4 || x > x1 + 4) continue;
        const b = Math.min(BORDO, Math.max(3, (x1 - x0) / 4));
        return { zona: 'sott', f, sott: { id: r.id, lato: x - x0 <= b ? 'in' : x1 - x <= b ? 'out' : 'corpo' } };
      }
      return { zona: 'sott', f };
    }
    if (!riga) return { zona: 'fuori', f };
    const t = riga.t;
    const on = p.clips.filter((c) => c.track === t.id && c.kind !== 'fx');
    const bordo = BORDO / this.ppf;
    if (t.kind === 'video') {
      // i blocchetti FX stanno sopra le clip: si prendono per primi (bordi = allunga, altoparlante = suono)
      const { blocchi, corsia, n } = this.corsie(p, t.id);
      for (let k = blocchi.length - 1; k >= 0; k--) {
        const b = blocchi[k];
        const { top, alt } = this.geoBlocco(riga.y, riga.h, corsia.get(b.id)!, n);
        if (y < top || y > top + alt) continue;
        const x0 = this.fX(b.start), w = Math.max(3, b.len * this.ppf);
        if (x < x0 - 4 || x > x0 + w + 4) continue;
        const sp = this.altoparlante(b, x0, w, top, alt);
        if (sp && x >= sp.x - 2 && x <= sp.x + sp.s + 2) return { track: t, clip: b, zona: 'suono', f };
        const bb = Math.min(BORDO, Math.max(3, w / 4));
        if (x - x0 <= bb) return { track: t, clip: b, zona: 'in', f };
        if (x0 + w - x <= bb) return { track: t, clip: b, zona: 'out', f };
        return { track: t, clip: b, zona: 'corpo', f };
      }
    }
    const g = this.geo(riga.y, riga.h);
    // l'altoparlante delle clip che suonano da sole
    for (const c of on) {
      const sp = this.altoparlanteClip(c, this.fX(c.start), c.len * this.ppf, g);
      if (sp && x >= sp.x - 2 && x <= sp.x + sp.s + 2 && y >= sp.y - 2 && y <= sp.y + sp.s + 2) return { track: t, clip: c, zona: 'suono', f };
    }
    // il tasto fx in fondo alla testa della clip
    for (const c of on) {
      const xr = this.fX(end(c));
      if (c.len * this.ppf > 74 && y >= g.top && y < g.top + g.testa && x >= xr - 9 - FX_W && x < xr - 9) return { track: t, clip: c, zona: 'fx', f };
    }
    // le maniglie delle dissolvenze: i quadratini in alto agli angoli (trascina verso l'interno per sfumare)
    for (const c of on) {
      if (c.len * this.ppf < 40 || y < g.top - 2 || y > g.top + Math.max(11, g.testa)) continue;
      const [xi, xo] = this.maniglieFade(c);
      if (Math.abs(x - xi) <= 6) return { track: t, clip: c, zona: 'fadeIn', f };
      if (Math.abs(x - xo) <= 6) return { track: t, clip: c, zona: 'fadeOut', f };
    }
    // la linea della dissolvenza: presa lì si piega (su = sale subito, giù = piano piano)
    for (const c of on) {
      for (const lato of ['in', 'out'] as const) {
        const n = lato === 'in' ? c.fadeIn : c.fadeOut;
        if (n <= 0 || n * this.ppf < 14) continue;
        const a = lato === 'in' ? c.start : end(c) - n;
        if (f < a || f > a + n) continue;
        const u = lato === 'in' ? (f - c.start) / n : (end(c) - f) / n;
        const yc = g.top + g.alt * (1 - curvaFade(u, lato === 'in' ? c.curvaIn : c.curvaOut));
        if (Math.abs(y - yc) <= 7) return { track: t, clip: c, zona: lato === 'in' ? 'curvaIn' : 'curvaOut', f };
      }
    }
    // prima i bordi (anche un po' fuori dalla clip, così le clip corte si prendono lo stesso)
    for (const c of on) {
      const w = c.len * this.ppf;
      const b = Math.min(bordo, (c.len / 3));
      if (Math.abs(f - c.start) <= b && w > 10) {
        const l = on.find((x) => end(x) === c.start);
        return { track: t, clip: c, zona: 'in', f, taglio: l ? { l, r: c } : undefined };
      }
      if (Math.abs(f - end(c)) <= b && w > 10) {
        const rr = on.find((x) => x.start === end(c));
        if (rr && f > end(c)) continue; // lato destro del taglio: è il bordo d'ingresso della clip dopo
        return { track: t, clip: c, zona: 'out', f, taglio: rr ? { l: c, r: rr } : undefined };
      }
    }
    const c = on.find((x) => f >= x.start && f < end(x));
    if (c) {
      // la linea del volume (e i suoi punti) sulle clip audio
      if (this.haVolume(c, t) && g.corpoH > 12 && y >= g.corpoY - 3) {
        const vy = (db: number) => this.yDb(db, g.corpoY, g.corpoH);
        const punto = c.gainKeys.findIndex((k) => Math.abs(this.fX(c.start + k.f) - x) < 8 && Math.abs(vy(k.v) - y) < 8);
        if (punto >= 0) return { track: t, clip: c, zona: 'punto', f, punto };
        const db = c.gainKeys.length ? keyValue(c.gainKeys, f - c.start, c.gain) : c.gain;
        if (Math.abs(vy(db) - y) <= 8) return { track: t, clip: c, zona: 'volume', f };
      }
      return { track: t, clip: c, zona: 'corpo', f };
    }
    return { track: t, zona: 'vuoto', f };
  }

  // ——— zoom e scorrimento ———
  zoom(k: number, attornoX?: number) {
    const x = attornoX ?? this.fX(store.head);
    const f = this.xF(x);
    this.ppf = clamp(this.ppf * k, 0.004, 48);
    this.scrollF = Math.max(0, f - x / this.ppf);
    this.sporca();
  }

  adattaTutto() {
    const e = Math.max(projectEnd(store.doc), tcBase(store.doc.rate) * 10);
    this.ppf = clamp((this.W - 40) / e, 0.004, 48);
    this.scrollF = 0;
    // e in verticale le tracce tornano a riempire il pannello
    if (this.zoomV !== 1) { this.zoomV = 1; try { localStorage.setItem('dpv-zoomv', '1'); } catch { /* niente */ } this.scrollY = 0; this.costruisciTestate(); }
    this.sporca();
  }

  /** in riproduzione la timeline gira pagina quando il cursore esce a destra, come in EDIUS */
  private segui() {
    if (!this.seguiCursore || this.presa) return;
    const x = this.fX(store.head);
    if (x > this.W - 30 || x < 0) {
      this.scrollF = motore.playing ? store.head - 30 / this.ppf : Math.max(0, store.head - (this.W * 0.3) / this.ppf);
      this.scrollF = Math.max(0, this.scrollF);
    }
  }

  // ——— le schede delle timeline ———
  /** le schede si rifanno solo quando cambiano le timeline o quella aperta */
  costruisciSchede() {
    const p = store.doc;
    const lista = sequenzeDi(p), att = attivaDi(p);
    const firma = lista.map((s) => s.id + ':' + s.nome).join('|') + '#' + att;
    if (firma === this.firmaSchede) return;
    this.firmaSchede = firma;
    const apri = (id: string) => {
      if (id === attivaDi(store.doc)) return;
      motore.stop();
      store.select([]);
      this.selSott.clear();
      store.edit('Apri timeline', (pp) => { passaA(pp, id); });
      store.setHead(0);
      this.adattaTutto();
    };
    const rinomina = async (id: string) => {
      const s = sequenzeDi(store.doc).find((x) => x.id === id);
      const n = await chiedi('Rinomina la timeline', 'Nome', s?.nome ?? '');
      if (n) store.edit('Rinomina timeline', (pp) => rinominaSequenza(pp, id, n));
    };
    const nuova = (copia: boolean) => {
      motore.stop();
      store.select([]);
      store.edit(copia ? 'Duplica timeline' : 'Nuova timeline', (pp) => { nuovaSequenza(pp, copia); });
      store.setHead(0);
      this.adattaTutto();
      avviso(copia ? '⧉ Copia della timeline: qui puoi provare senza toccare l\'altra' : '＋ Timeline nuova: i media del contenitore sono gli stessi', 'ok', 1800);
    };
    this.schede.replaceChildren(
      ...lista.map((s) => {
        const b = h('button', {
          class: 'tl-scheda' + (s.id === att ? ' attiva' : ''), title: 'Clic: apri · doppio clic: rinomina · tasto destro: duplica, elimina',
          on: {
            click: () => apri(s.id),
            dblclick: () => void rinomina(s.id),
            contextmenu: (e: MouseEvent) => {
              e.preventDefault();
              menuContesto(e.clientX, e.clientY, [
                { nome: 'Apri', disattiva: s.id === att, fn: () => apri(s.id) },
                { nome: 'Rinomina…', fn: () => void rinomina(s.id) },
                { nome: 'Duplica', fn: () => { apri(s.id); nuova(true); } },
                { sep: true },
                { nome: 'Elimina questa timeline', disattiva: lista.length < 2, fn: () => store.edit('Elimina timeline', (pp) => { eliminaSequenza(pp, s.id); }) },
              ]);
            },
          },
        }, icona('montaggio', 12), h('span', null, s.nome));
        return b;
      }),
      h('button', {
        class: 'tl-scheda piu', title: 'Una timeline nuova (o una copia di questa)',
        on: { click: (e: MouseEvent) => menuContesto(e.clientX, e.clientY, [{ nome: 'Timeline nuova, vuota', fn: () => nuova(false) }, { nome: 'Copia di questa timeline', fn: () => nuova(true) }]) },
      }, icona('piu', 11)),
    );
  }

  // ——— testate ———
  private firmaTestate = '';
  private firma() {
    const s = store.doc.sottotitoli;
    return this.kV() + '|' + store.doc.tracks.map((t) => [t.id, t.name, t.height, t.mute, t.solo, t.lock, t.opacity, t.volume, modi.attive.has(t.id)].join(',')).join(';') + '|' + this.scrollY + '|' + (s?.righe.length || this.mostraSott ? (s?.nelVideo ?? true ? 2 : 1) : 0);
  }
  /** le testate si rifanno solo se cambiano le tracce, non a ogni spostamento di clip */
  private testateSeCambiate() {
    if (this.firma() !== this.firmaTestate) this.costruisciTestate();
  }

  /** accende o spegne una traccia (Alt = solo questa) */
  private accendi(t: Track, sola: boolean) {
    if (sola) { const era = modi.attive.size === 1 && modi.attive.has(t.id); modi.attive.clear(); if (!era) modi.attive.add(t.id); }
    else if (modi.attive.has(t.id)) modi.attive.delete(t.id);
    else modi.attive.add(t.id);
    this.costruisciTestate();
    this.sporca();
    store.emit('status');
    const n = modi.attive.size;
    avviso(n ? `Tracce accese: ${store.doc.tracks.filter((x) => modi.attive.has(x.id)).map((x) => x.name).join(' ')} · il taglio tocca solo queste` : 'Nessuna traccia accesa: il taglio tocca tutte le tracce', 'info', 1800);
  }

  costruisciTestate() {
    this.firmaTestate = this.firma();
    const p = store.doc;
    this.testate.replaceChildren();
    this.misure = [];
    this.testate.style.setProperty('--righello', RIGHELLO + 'px');
    const cont = h('div', { class: 'tl-testate-in', style: `transform: translateY(${-this.scrollY}px)` });
    let prima: Track | null = null;
    // la testata della riga dei sottotitoli: l'occhio li mostra o li nasconde nel video
    const testataSott = () => {
      const s = sottotitoliDi(p);
      return h('div', { class: 'tl-testata sott' + (s.nelVideo ? '' : ' spenta'), style: `height:${SOTT_H}px` },
        h('div', { class: 'tt-riga' },
          h('span', { class: 'tt-nome sott', title: 'I sottotitoli: trascina per spostarli, tira i bordi per i tempi, doppio clic per scrivere, tasto destro per unire e dividere' }, icona('sottotitoli', 12), 'SOTT'),
          h('button', { class: 'tt-btn' + (s.nelVideo ? '' : ' on-rosso'), title: 'Sottotitoli nel video sì / no', on: { click: () => store.edit('Sottotitoli nel video', (pp) => { pp.sottotitoli = { ...structuredClone(SOTTO0), ...(pp.sottotitoli ?? {}) }; pp.sottotitoli.nelVideo = !pp.sottotitoli.nelVideo; }) } }, icona('occhio', 13)),
          h('button', { class: 'tt-btn', title: 'Una riga al cursore (Alt+N)', on: { click: () => this.sottOp('nuova') } }, '+'),
          h('button', { class: 'tt-btn', title: 'Scrivi i sottotitoli con l\'AI (Alt+G): dal montaggio, o solo dalle clip scelte', on: { click: () => esegui('sottGenera') } }, '✨')));
    };
    for (const t of p.tracks) {
      if (prima && prima.kind !== 'audio' && t.kind === 'audio') {
        if (this.conSott(p)) cont.appendChild(testataSott());
        cont.appendChild(h('div', { class: 'tl-sep', style: `height:${SEP}px` }));
      }
      prima = t;
      const accesa = modi.attive.has(t.id);
      const cambia = (label: string, fn: (tr: Track) => void) => store.edit(label, (pp) => fn(pp.tracks.find((x) => x.id === t.id)!));
      const video = t.kind !== 'audio', audio = t.kind === 'audio';
      // solo il misuratore che si muove (niente manopole e niente numeri: il volume della traccia sta nel mixer)
      const misura = audio ? h('span', { class: 'tt-misura', title: 'Livello della traccia' }) : null;
      if (misura) this.misure.push({ el: misura, track: t.id });
      const riga = h('div', { class: `tl-testata ${t.kind}${t.lock ? ' bloccata' : ''}${t.mute ? ' spenta' : ''}${accesa ? ' accesa' : ''}`, style: `height:${this.altezza(t, this.kV())}px` },
        h('div', { class: 'tt-riga' },
          h('button', {
            class: 'tt-nome' + (accesa ? ' accesa' : ''),
            title: 'Accendi/spegni la traccia: il taglio (1) tocca solo le tracce accese · Alt+clic = solo questa',
            on: { click: (e: MouseEvent) => this.accendi(t, e.altKey) },
          }, h('span', { class: 'led' + (accesa ? ' acceso' : '') }), t.name),
          h('button', { class: 'tt-btn' + (t.mute ? ' on-rosso' : ''), title: video ? 'Mostra / nascondi la traccia (e i suoi FX)' : 'Muto', on: { click: () => cambia(t.mute ? 'Accendi traccia' : 'Spegni traccia', (tr) => { tr.mute = !tr.mute; }) } }, icona(audio ? 'altoparlante' : 'occhio', 13)),
          audio ? h('button', { class: 'tt-btn' + (t.solo ? ' on-oro' : ''), title: 'Solo', on: { click: () => cambia('Solo', (tr) => { tr.solo = !tr.solo; }) } }, 'S') : null,
          h('button', { class: 'tt-btn' + (t.lock ? ' on-oro' : ''), title: 'Blocca la traccia', on: { click: () => cambia(t.lock ? 'Sblocca' : 'Blocca', (tr) => { tr.lock = !tr.lock; }) } }, icona('lucchetto', 12))),
        misura,
        h('div', {
          class: 'tt-altezza', title: 'Trascina per cambiare l\'altezza',
          on: {
            pointerdown: (e: PointerEvent) => {
              const y0 = e.clientY, h0 = t.height;
              const el = e.currentTarget as HTMLElement;
              el.setPointerCapture(e.pointerId);
              const k = this.kFermo = this.kV();
              const mv = (ev: PointerEvent) => { const tr = store.doc.tracks.find((x) => x.id === t.id)!; tr.height = clamp(Math.round(h0 + (ev.clientY - y0) / k), 28, 200); riga.style.height = this.altezza(tr, k) + 'px'; this.sporca(); };
              const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); this.kFermo = null; this.costruisciTestate(); this.sporca(); };
              el.addEventListener('pointermove', mv);
              el.addEventListener('pointerup', up);
            },
          },
        }));
      riga.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        menuContesto(e.clientX, e.clientY, [
          { nome: accesa ? 'Spegni la traccia' : 'Accendi la traccia', fn: () => this.accendi(t, false) },
          { nome: 'Accendi solo questa', fn: () => this.accendi(t, true) },
          { nome: 'Spegni tutte (il taglio tocca tutto)', disattiva: !modi.attive.size, fn: () => { modi.attive.clear(); this.costruisciTestate(); this.sporca(); store.emit('status'); } },
          { sep: true },
          { nome: 'Rinomina traccia', fn: async () => { const n = await chiedi('Rinomina traccia', 'Nome', t.name); if (n) cambia('Rinomina', (tr) => { tr.name = n.slice(0, 12); }); } },
          { nome: 'Aggiungi ' + (video ? 'traccia video sopra' : 'traccia audio sotto'), fn: () => store.edit('Aggiungi traccia', (pp) => { const i = pp.tracks.findIndex((x) => x.id === t.id); pp.tracks.splice(audio ? i + 1 : i, 0, newTrack(t.kind, nextTrackName(pp, t.kind))); }) },
          { nome: 'Elimina traccia (e le sue clip)', disattiva: p.tracks.filter((x) => x.kind === t.kind).length <= 1, fn: () => store.edit('Elimina traccia', (pp) => { pp.tracks = pp.tracks.filter((x) => x.id !== t.id); pp.clips = pp.clips.filter((c) => c.track !== t.id); }) },
          { sep: true },
          { nome: 'Altezza piccola', fn: () => cambia('Altezza', (tr) => { tr.height = 34; }) },
          { nome: 'Altezza normale', fn: () => cambia('Altezza', (tr) => { tr.height = ALTEZZA[t.kind]; }) },
          { nome: 'Altezza grande', fn: () => cambia('Altezza', (tr) => { tr.height = 120; }) },
        ]);
      });
      cont.appendChild(riga);
    }
    if (this.conSott(p) && !p.tracks.some((t) => t.kind === 'audio')) cont.appendChild(testataSott());
    this.testate.appendChild(h('div', { class: 'tl-testate-righello', style: `height:${RIGHELLO}px` },
      h('span', { class: 'tc-mini' }, frameToTc(Math.round(store.head), p.rate, p.drop))));
    this.testate.appendChild(cont);
  }

  // ——— disegno ———
  private disegna() {
    const ctx = this.ctx, p = store.doc, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0f0e14';
    ctx.fillRect(0, 0, W, H);
    const righe = this.righe(p);
    const r = fps(p.rate);
    const f0 = Math.floor(this.scrollF), f1 = Math.ceil(this.xF(W));
    // sfondo delle tracce
    for (const { t, y, h: hh } of righe) {
      if (y > H || y + hh < RIGHELLO) continue;
      ctx.fillStyle = t.kind === 'audio' ? '#13161a' : '#16151e';
      ctx.fillRect(0, y, W, hh);
      if (modi.attive.has(t.id)) { ctx.fillStyle = 'rgba(255,213,74,.07)'; ctx.fillRect(0, y, W, hh); ctx.fillStyle = 'rgba(255,213,74,.5)'; ctx.fillRect(0, y, 3, hh); }
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      ctx.fillRect(0, y + hh - 1, W, 1);
      if (t.lock) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, y, W, hh); ctx.clip();
        ctx.strokeStyle = 'rgba(255,213,74,.06)';
        for (let x = -hh; x < W; x += 12) { ctx.beginPath(); ctx.moveTo(x, y + hh); ctx.lineTo(x + hh, y); ctx.stroke(); }
        ctx.restore();
      }
    }
    // separatore video/audio
    const primaAudio = righe.find((x) => x.t.kind === 'audio');
    if (primaAudio) {
      const g = ctx.createLinearGradient(0, primaAudio.y - SEP, 0, primaAudio.y);
      g.addColorStop(0, '#2a2833'); g.addColorStop(1, '#0a090d');
      ctx.fillStyle = g;
      ctx.fillRect(0, primaAudio.y - SEP, W, SEP);
    }
    // zona attacco-stacco
    if (p.inF !== null || p.outF !== null) {
      const a = p.inF ?? 0, b = p.outF ?? projectEnd(p);
      ctx.fillStyle = 'rgba(53,232,255,.07)';
      ctx.fillRect(this.fX(a), RIGHELLO, (b - a) * this.ppf, H);
    }
    // clip, e sopra i blocchetti FX (in basso sulla riga, una corsia per ogni sovrapposizione)
    this.contorniScelte = [];
    // il pezzo che il 2 toglierebbe subito dopo un taglio: si vede come una clip scelta
    this.scarto = scartoInVista();
    for (const { t, y, h: hh } of righe) {
      if (y > H || y + hh < RIGHELLO) continue;
      for (const c of p.clips) {
        if (c.track !== t.id || c.kind === 'fx') continue;
        if (end(c) < f0 - 1 || c.start > f1 + 1) continue;
        this.disegnaClip(ctx, p, c, t, y, hh, r);
      }
      const { blocchi, corsia, n } = this.corsie(p, t.id);
      for (const c of blocchi) {
        if (end(c) < f0 - 1 || c.start > f1 + 1) continue;
        this.disegnaBlocco(ctx, p, c, t, y, hh, r, corsia.get(c.id)!, n);
      }
    }
    // il contorno delle clip scelte si disegna DOPO tutte le clip: dopo un taglio i due pezzi sono attaccati e la
    // vicina, disegnata dopo, copriva metà del bordo giallo (non si capiva più cosa era scelto)
    for (const k of this.contorniScelte) {
      ctx.strokeStyle = 'rgba(255,213,74,.35)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(k.x, k.y, k.w, k.h, k.r); ctx.stroke();
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(k.x + 1, k.y + 1, Math.max(1, k.w - 2), Math.max(1, k.h - 2), k.r); ctx.stroke();
    }
    ctx.lineWidth = 1;
    // la riga dei sottotitoli
    if (this.rigaSott) this.disegnaSott(ctx, p, W);
    // fantasma del trascinamento dal contenitore
    if (this.fantasma) {
      for (const g of this.fantasma) {
        const row = righe.find((x) => x.t.id === g.track);
        if (!row) continue;
        ctx.fillStyle = 'rgba(255,213,74,.25)';
        ctx.strokeStyle = '#ffd54a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.fillRect(this.fX(g.f), row.y + 2, g.len * this.ppf, row.h - 4);
        ctx.strokeRect(this.fX(g.f) + 0.5, row.y + 2.5, g.len * this.ppf - 1, row.h - 5);
        ctx.setLineDash([]);
        if (g.nuova) {
          ctx.fillStyle = '#ffd54a';
          ctx.font = '700 11px Rajdhani, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText('＋ su una traccia nuova (qui è occupato)', this.fX(g.f) + 6, row.y + row.h / 2);
        }
      }
    }
    // il blocchetto FX che si sta trascinando dal contenitore, e il taglio su cui cade
    if (this.fantasmaBlocco) {
      const g = this.fantasmaBlocco;
      const row = righe.find((x) => x.t.id === g.track);
      if (g.taglio) {
        const tx = Math.round(this.fX(g.taglio.f)) + 0.5;
        ctx.strokeStyle = g.tipo === 'transizione' ? '#35e8ff' : '#ff6bff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(tx, RIGHELLO); ctx.lineTo(tx, H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
      }
      if (row) {
        const [c1] = COLORI[g.tipo];
        const x0 = this.fX(g.start), w = Math.max(6, g.len * this.ppf);
        const { top, alt } = this.geoBlocco(row.y, row.h, 0, 1);
        // la riga su cui cade si accende appena
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.fillRect(0, row.y, W, row.h);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.roundRect(x0, top, w, alt, 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.roundRect(x0 + 0.5, top + 0.5, w - 1, alt - 1, 2); ctx.stroke();
        ctx.setLineDash([]);
        const sec = (g.len / r).toFixed(1).replace('.', ',').replace(',0', '');
        const dove = g.dove === 'taglio' ? ' · sul taglio' : g.dove === 'inizio' ? ' · all\'inizio della clip' : g.dove === 'fine' ? ' · alla fine della clip' : g.tipo === 'transizione' ? ' · qui non c\'è un taglio' : '';
        const testo = `${g.nome} · ${sec} s${dove}`;
        ctx.font = '700 11px Rajdhani, sans-serif';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(testo).width + 12;
        const ty = top - 11 < row.y ? top + alt + 10 : top - 10;
        ctx.fillStyle = 'rgba(8,7,12,.85)';
        ctx.beginPath(); ctx.roundRect(x0, ty - 8, tw, 16, 5); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(testo, x0 + 6, ty + 0.5);
      }
    }
    if (this.bersaglioFx) {
      const c = clipById(p, this.bersaglioFx);
      const row = c && righe.find((x) => x.t.id === c.track);
      if (c && row) {
        ctx.strokeStyle = '#ff3df2';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.fX(c.start) + 1.5, row.y + 3.5, c.len * this.ppf - 3, row.h - 7);
        ctx.lineWidth = 1;
      }
    }
    // riquadro di selezione
    if (this.presa?.tipo === 'riquadro') {
      const q = this.presa;
      ctx.fillStyle = 'rgba(255,213,74,.08)';
      ctx.strokeStyle = 'rgba(255,213,74,.8)';
      ctx.fillRect(Math.min(q.x0, q.x1), Math.min(q.y0, q.y1), Math.abs(q.x1 - q.x0), Math.abs(q.y1 - q.y0));
      ctx.strokeRect(Math.min(q.x0, q.x1) + 0.5, Math.min(q.y0, q.y1) + 0.5, Math.abs(q.x1 - q.x0), Math.abs(q.y1 - q.y0));
    }
    this.disegnaRighello(ctx, p, W, r);
    // linea della calamita
    if (this.snapLinea !== null) {
      const x = Math.round(this.fX(this.snapLinea)) + 0.5;
      ctx.strokeStyle = '#ffd54a';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, RIGHELLO); ctx.lineTo(x, H); ctx.stroke();
      ctx.setLineDash([]);
    }
    // cursore
    const hx = Math.round(this.fX(store.head)) + 0.5;
    if (hx >= -2 && hx <= W + 2) {
      ctx.strokeStyle = motore.playing ? '#ff4d6d' : '#ff6b81';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, RIGHELLO - 6); ctx.lineTo(hx, H); ctx.stroke();
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.moveTo(hx - 6, RIGHELLO - 12); ctx.lineTo(hx + 6, RIGHELLO - 12); ctx.lineTo(hx + 6, RIGHELLO - 6); ctx.lineTo(hx, RIGHELLO); ctx.lineTo(hx - 6, RIGHELLO - 6); ctx.closePath(); ctx.fill();
    }
    this.disegnaNav();
    this.disegnaVbar();
    const tcm = this.testate.querySelector('.tc-mini');
    if (tcm) tcm.textContent = frameToTc(Math.round(store.head), p.rate, p.drop);
  }

  private disegnaRighello(ctx: CanvasRenderingContext2D, p: Project, W: number, r: number) {
    const g = ctx.createLinearGradient(0, 0, 0, RIGHELLO);
    g.addColorStop(0, '#24222c'); g.addColorStop(1, '#17161d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, RIGHELLO);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, RIGHELLO - 1, W, 1);
    // passo delle tacche: secondi "tondi" che stanno bene alla scala attuale
    const base = tcBase(p.rate);
    const passi = [1, 2, 5, 10, base, base * 2, base * 5, base * 10, base * 30, base * 60, base * 120, base * 300, base * 600, base * 1800, base * 3600];
    const passo = passi.find((s) => s * this.ppf >= 90) ?? passi[passi.length - 1];
    const minore = passi.find((s) => s * this.ppf >= 12) ?? passo;
    const a = Math.floor(this.scrollF / minore) * minore;
    ctx.font = '600 10.5px Rajdhani, sans-serif';
    ctx.textBaseline = 'top';
    for (let f = a; this.fX(f) < W; f += minore) {
      const x = Math.round(this.fX(f)) + 0.5;
      const major = f % passo === 0;
      ctx.strokeStyle = major ? '#8f8a9e' : '#4a4756';
      ctx.beginPath(); ctx.moveTo(x, major ? RIGHELLO - 13 : RIGHELLO - 6); ctx.lineTo(x, RIGHELLO - 1); ctx.stroke();
      if (major) {
        ctx.fillStyle = '#bdb8cc';
        ctx.fillText(frameToTc(f, p.rate, p.drop), x + 3, 3);
      }
    }
    // attacco / stacco
    if (p.inF !== null || p.outF !== null) {
      const a2 = p.inF ?? 0, b2 = p.outF ?? projectEnd(p);
      ctx.fillStyle = 'rgba(53,232,255,.35)';
      ctx.fillRect(this.fX(a2), RIGHELLO - 5, (b2 - a2) * this.ppf, 4);
      ctx.fillStyle = '#35e8ff';
      if (p.inF !== null) { const x = this.fX(p.inF); ctx.fillRect(x, 13, 2, RIGHELLO - 13); ctx.fillText('IN', x + 3, 14); }
      if (p.outF !== null) { const x = this.fX(p.outF); ctx.fillRect(x - 2, 13, 2, RIGHELLO - 13); ctx.fillText('OUT', x - 22, 14); }
    }
    // marcatori
    for (const m of p.markers) {
      const x = this.fX(m.f);
      if (x < -10 || x > W + 10) continue;
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.moveTo(x - 5, 14); ctx.lineTo(x + 5, 14); ctx.lineTo(x + 5, 21); ctx.lineTo(x, 26); ctx.lineTo(x - 5, 21); ctx.closePath(); ctx.fill();
    }
    void r;
  }

  /** un blocchetto FX sopra le clip: magenta gli effetti, turchese le transizioni, col taglio su cui lavora e
   *  l'altoparlante del suono (acceso o spento) */
  private disegnaBlocco(ctx: CanvasRenderingContext2D, p: Project, c: Clip, t: Track, y: number, hh: number, r: number, corsia: number, n: number) {
    const b = c.fxb;
    if (!b) return;
    const x = this.fX(c.start), w = Math.max(3, c.len * this.ppf);
    const { top, alt } = this.geoBlocco(y, hh, corsia, n);
    const sel = store.sel.has(c.id);
    const tr = b.tipo === 'transizione';
    const tg = tr ? taglioDelBlocco(p, c) : null;
    const spento = tr && !tg;
    const [c1, c2] = COLORI[b.tipo];
    const raggio = Math.min(2, alt / 2, w / 2);
    ctx.save();
    // l'ombra sotto stacca il blocchetto dalle miniature
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.roundRect(x + 0.5, top + 1.5, w - 1, alt, raggio); ctx.fill();
    ctx.globalAlpha = t.mute || spento ? 0.5 : 0.94;
    const g = ctx.createLinearGradient(0, top, 0, top + alt);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x + 0.5, top + 0.5, w - 1, alt - 1, raggio); ctx.fill();
    ctx.clip();
    if (!tr && w > 14) {
      // la forza dell'effetto nel tempo: il punto più alto è dove scoppia (sul taglio, se c'è)
      const px = x + piccoDi(p, c) * w;
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.moveTo(x, top + alt); ctx.lineTo(px, top + 2); ctx.lineTo(x + w, top + alt); ctx.closePath(); ctx.fill();
    }
    if (tr && w > 10) {
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.moveTo(x, top + alt); ctx.lineTo(x + w, top); ctx.moveTo(x, top); ctx.lineTo(x + w, top + alt); ctx.stroke();
    }
    if (tg) {
      // il taglio su cui lavora: due tacche bianche, sopra e sotto
      const tx = Math.round(this.fX(tg.f));
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(tx - 4, top); ctx.lineTo(tx + 4, top); ctx.lineTo(tx, top + 5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 4, top + alt); ctx.lineTo(tx + 4, top + alt); ctx.lineTo(tx, top + alt - 5); ctx.closePath(); ctx.fill();
    }
    const sp = this.altoparlante(c, x, w, top, alt);
    if (w > 22 && alt >= 10) {
      const sec = (c.len / r).toFixed(1).replace('.', ',').replace(',0', '');
      const testo = (tr ? '✦ ' : '⚡ ') + nomeBlocco(b) + (w > 90 ? ` · ${sec} s` : '') + (spento && w > 170 ? ' · mettilo su un taglio' : '');
      ctx.font = `700 ${alt >= 22 ? 12 : alt >= 16 ? 11 : 10}px Rajdhani, sans-serif`;
      ctx.textBaseline = 'middle';
      const tx = Math.max(x + 6, 4), ty = top + alt / 2 + 0.5;
      const max = (sp ? sp.x - 3 : x + w - 4) - tx;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(testo, tx + 1, ty + 1, max);
      ctx.fillStyle = '#fff';
      ctx.fillText(testo, tx, ty, max);
    }
    ctx.restore();
    if (sp) this.disegnaAltoparlante(ctx, sp.x, sp.y, sp.s, !!b.audio && !t.mute);
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeStyle = sel ? '#ffd54a' : spento ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.6)';
    if (spento) ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.roundRect(x + (sel ? 1 : 0.5), top + (sel ? 1 : 0.5), w - (sel ? 2 : 1), alt - (sel ? 2 : 1), raggio); ctx.stroke();
    ctx.setLineDash([]);
    // scelto: le due maniglie ai bordi dicono che si allunga e si accorcia
    if (sel && w > 18) {
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(x + 2, top + alt / 2 - 4, 3, 8);
      ctx.fillRect(x + w - 5, top + alt / 2 - 4, 3, 8);
    }
    ctx.lineWidth = 1;
  }

  /** la riga dei sottotitoli: un blocchetto per ogni riga col suo testo (tratteggiato se è ancora da scrivere) */
  private disegnaSott(ctx: CanvasRenderingContext2D, p: Project, W: number) {
    const { y, h: hh } = this.rigaSott!;
    const s = sottotitoliDi(p);
    ctx.fillStyle = '#121a1f';
    ctx.fillRect(0, y, W, hh);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    ctx.fillRect(0, y + hh - 1, W, 1);
    const top = y + 3, alt = hh - 6;
    ctx.font = '600 11.5px Rajdhani, sans-serif';
    ctx.textBaseline = 'middle';
    if (!s.righe.length) {
      ctx.fillStyle = 'rgba(200,230,245,.5)';
      ctx.fillText('Nessun sottotitolo · doppio clic per scriverne uno · tasto destro: li scrive l\'AI (Alt+G)', 10, top + alt / 2 + 0.5);
    }
    for (const r of s.righe) {
      const x0 = this.fX(r.da), x1 = this.fX(r.a);
      if (x1 < -2 || x0 > W + 2) continue;
      const w = Math.max(2, x1 - x0);
      const sel = this.selSott.has(r.id);
      const qui = store.head >= r.da && store.head < r.a;
      ctx.globalAlpha = s.nelVideo ? 1 : 0.55;
      ctx.fillStyle = r.testo.trim() ? (qui ? '#3f7fa0' : '#2e5f78') : 'rgba(46,95,120,.35)';
      ctx.beginPath(); ctx.roundRect(x0 + 0.5, top, w - 1, alt, 2); ctx.fill();
      ctx.strokeStyle = sel ? '#ffd54a' : r.testo.trim() ? 'rgba(0,0,0,.55)' : 'rgba(140,200,230,.7)';
      ctx.lineWidth = sel ? 2 : 1;
      if (!r.testo.trim()) ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.roundRect(x0 + (sel ? 1 : 0.5), top + (sel ? 0.5 : 0), w - (sel ? 2 : 1), alt, 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      if (w > 16) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + 2, top, w - 4, alt); ctx.clip();
        ctx.fillStyle = r.testo.trim() ? '#eaf6ff' : 'rgba(200,230,245,.6)';
        ctx.fillText(r.testo.trim() ? r.testo.replace(/\n/g, ' ⏎ ') : 'scrivi…', Math.max(x0 + 5, 3), top + alt / 2 + 0.5);
        ctx.restore();
      }
      if (sel && w > 14) {
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(x0 + 2, top + alt / 2 - 4, 2, 8);
        ctx.fillRect(x1 - 4, top + alt / 2 - 4, 2, 8);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** una riga di sottotitolo di 2,5 secondi al cursore (fino alla dopo, se è più vicina); se ce n'è già una, la apre per scriverla */
  rigaSottAlCursore() {
    const p = store.doc;
    const da = Math.round(store.head);
    const righe = p.sottotitoli?.righe ?? [];
    const qui = righe.find((x) => x.da <= da && da < x.a);
    if (qui) { void this.scriviSott(qui.id); return; }
    const dopo = righe.filter((x) => x.da > da).sort((a, b) => a.da - b.da)[0];
    const a = Math.max(da + 2, Math.min(da + Math.round(fps(p.rate) * 2.5), dopo ? dopo.da : Infinity));
    if (dopo && a > dopo.da) { avviso('Non c\'è posto prima della riga dopo: spostala o accorciala', 'info', 2200); return; }
    let id = '';
    store.edit('Riga di sottotitolo', (pp) => {
      pp.sottotitoli = { ...structuredClone(SOTTO0), ...(pp.sottotitoli ?? {}) };
      const r = { id: 's' + Math.random().toString(36).slice(2, 9), da, a, testo: '' };
      id = r.id;
      pp.sottotitoli.righe.push(r);
      pp.sottotitoli.righe.sort((x, y) => x.da - y.da);
    });
    this.selSott = new Set([id]);
    void this.scriviSott(id);
  }

  /** l'editor aperto sulla riga (null = nessuno): chiudi(true) conferma il testo, chiudi(false) lo butta */
  private editor: { id: string; chiudi: (conferma: boolean) => void } | null = null;

  /**
   * Scrivi o correggi il testo di una riga, direttamente sopra la timeline. Invio conferma, Maiusc+Invio va a capo
   * (due righe insieme), Ctrl+Invio divide la riga dove sta il cursore di scrittura (e si continua con la seconda parte),
   * Tab / Maiusc+Tab passano alla riga dopo / prima, Esc butta le modifiche.
   */
  scriviSott(id: string): Promise<void> {
    this.editor?.chiudi(true);
    const r0 = store.doc.sottotitoli?.righe.find((x) => x.id === id);
    this.righe(store.doc); // (la posizione della riga SOTT si ricalcola qui: la riga può essere appena nata)
    const rs = this.rigaSott;
    if (!r0 || !rs) return Promise.resolve();
    this.selSott = new Set([id]);
    // la riga in vista (se sta fuori o troppo al bordo si porta il righello lì)
    const xv = this.fX(r0.da);
    if (xv < 20 || xv > this.W - 150) this.scrollF = Math.max(0, r0.da - (this.W * 0.25) / this.ppf);
    this.sporca();
    const larg = Math.round(clamp(this.fX(r0.a) - this.fX(r0.da), 300, 480));
    const alto = 64;
    const sotto = rs.y + rs.h + 3;
    const ta = h('textarea', {
      class: 'tl-sott-editor', rows: '2', spellcheck: 'true', 'data-id': id,
      placeholder: 'Scrivi il sottotitolo…  Invio conferma · Maiusc+Invio a capo · Ctrl+Invio divide qui · Tab riga dopo · Esc annulla',
      style: `left:${Math.round(clamp(this.fX(r0.da), 4, Math.max(4, this.W - larg - 4)))}px;top:${sotto + alto > this.H ? Math.max(0, rs.y - alto - 3) : sotto}px;width:${larg}px;height:${alto}px`,
    }) as HTMLTextAreaElement;
    ta.value = r0.testo;
    this.area.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return new Promise<void>((ok) => {
      let chiuso = false;
      const chiudi = (conferma: boolean) => {
        if (chiuso) return;
        chiuso = true;
        this.editor = null;
        const testo = ta.value.replace(/\s+$/, '');
        ta.remove();
        if (conferma && testo !== r0.testo) store.edit('Testo del sottotitolo', (pp) => { const z = pp.sottotitoli?.righe.find((x) => x.id === id); if (z) z.testo = testo; });
        this.cv.focus({ preventScroll: true });
        this.sporca();
        ok();
      };
      this.editor = { id, chiudi };
      ta.addEventListener('keydown', (e) => {
        e.stopPropagation(); // i tasti del montaggio qui non c'entrano
        if (e.key === 'Escape') { e.preventDefault(); chiudi(false); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const car = ta.selectionStart, testo = ta.value;
          let nuova = null as string | null;
          store.edit('Dividi sottotitolo', (pp) => {
            const s = pp.sottotitoli, z = s?.righe.find((x) => x.id === id);
            if (!s || !z) return;
            z.testo = testo;
            // al cursore del montaggio se cade dentro la riga; se no dove sta la lettera, in proporzione
            let fr = Math.round(store.head);
            if (!(fr > z.da + 1 && fr < z.a - 1)) fr = Math.round(z.da + ((z.a - z.da) * car) / Math.max(1, testo.length));
            fr = Math.max(z.da + 2, Math.min(z.a - 2, fr));
            nuova = dividiRiga(s, id, fr, car);
          });
          if (!nuova) { avviso('La riga è troppo corta per dividerla', 'info', 1800); return; }
          chiuso = true; this.editor = null; ta.remove();
          this.selSott = new Set([nuova]);
          ok();
          void this.scriviSott(nuova);
          const z = store.doc.sottotitoli?.righe.find((x) => x.id === nuova);
          if (z) store.setHead(z.da);
        } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chiudi(true); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          chiudi(true);
          const v = rigaVicina(sottotitoliDi(store.doc), id, e.shiftKey ? -1 : 1);
          if (v) { store.setHead(v.da); void this.scriviSott(v.id); }
        }
      });
      ta.addEventListener('blur', () => {
        // se è la finestra a perdere il fuoco (un altro programma, il tasto Alt) l'editor resta e riprende al ritorno
        if (!document.hasFocus()) { window.addEventListener('focus', () => { if (!chiuso) ta.focus(); }, { once: true }); return; }
        chiudi(true);
      });
      ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
  }

  /** unisce le righe scelte (o la riga sotto il cursore con la dopo) in una riga sola */
  private unisciSott() {
    const righe = sottotitoliDi(store.doc).righe.slice().sort((a, b) => a.da - b.da);
    let scelte = [...this.selSott].filter((z) => righe.some((x) => x.id === z));
    if (!scelte.length) { const q = rigaAl(sottotitoliDi(store.doc), Math.round(store.head)); if (q) scelte = [q.id]; }
    if (!scelte.length) { avviso('Scegli due o più righe SOTT (Maiusc+clic)', 'info', 2000); return; }
    if (scelte.length === 1 && righe[righe.length - 1]?.id === scelte[0]) { avviso('È l\'ultima riga: non c\'è una dopo con cui unirla', 'info', 2000); return; }
    let rimasta = null as string | null;
    store.edit('Unisci sottotitoli', (pp) => { if (pp.sottotitoli) rimasta = unisciRighe(pp.sottotitoli, scelte); });
    if (rimasta) this.selSott = new Set([rimasta]);
  }

  /** divide la riga scelta (o quella sotto il cursore) dove sta il cursore del montaggio */
  private dividiSott() {
    const s = sottotitoliDi(store.doc);
    const f = Math.round(store.head);
    const r = [...this.selSott].map((id) => s.righe.find((x) => x.id === id)).find((x) => x && x.da < f && f < x.a) ?? rigaAl(s, f);
    if (!r || !(f > r.da + 1 && f < r.a - 1)) { avviso('Metti il cursore dentro una riga SOTT per dividerla lì', 'info', 2200); return; }
    let nuova = null as string | null;
    store.edit('Dividi sottotitolo', (pp) => { if (pp.sottotitoli) nuova = dividiRiga(pp.sottotitoli, r.id, f); });
    if (nuova) this.selSott = new Set([nuova]);
  }

  /** i comandi dei sottotitoli (azioni.ts li manda con l'evento dpv:sott) */
  private sottOp(op: string) {
    const p = store.doc;
    const s = sottotitoliDi(p);
    const f = Math.round(store.head);
    const ord = s.righe.slice().sort((a, b) => a.da - b.da);
    const bersagli = () => {
      const sc = ord.filter((z) => this.selSott.has(z.id));
      if (sc.length) return sc;
      const q = rigaAl(s, f);
      return q ? [q] : [];
    };
    if (op === 'mostra') { this.mostraSott = true; this.costruisciTestate(); this.sporca(); return; }
    if (op === 'nuova') { this.mostraSott = true; this.rigaSottAlCursore(); return; }
    if (op === 'modifica') { const b = bersagli(); if (b[0]) void this.scriviSott(b[0].id); else this.rigaSottAlCursore(); return; }
    if (op === 'dividi') { this.dividiSott(); return; }
    if (op === 'unisci') { this.unisciSott(); return; }
    if (op === 'elimina') {
      const via = new Set(bersagli().map((z) => z.id));
      if (!via.size) { avviso('Nessuna riga SOTT scelta', 'info', 1600); return; }
      store.edit('Togli sottotitoli', (pp) => { if (pp.sottotitoli) pp.sottotitoli.righe = pp.sottotitoli.righe.filter((z) => !via.has(z.id)); });
      this.selSott.clear();
      return;
    }
    if (op === 'prec' || op === 'succ') {
      const v = op === 'succ' ? ord.find((z) => z.da > f) : ord.slice().reverse().find((z) => z.da < f);
      if (!v) { avviso(op === 'succ' ? 'Non ci sono righe dopo' : 'Non ci sono righe prima', 'info', 1400); return; }
      this.selSott = new Set([v.id]);
      motore.setMonitor('recorder');
      store.setHead(v.da);
      this.sporca();
      return;
    }
    if (op === 'inizia' || op === 'finisci') {
      const b = bersagli()[0];
      if (!b) { avviso('Metti il cursore su una riga SOTT', 'info', 1600); return; }
      store.edit(op === 'inizia' ? 'Inizio del sottotitolo' : 'Fine del sottotitolo', (pp) => { if (pp.sottotitoli) bordoRiga(pp.sottotitoli, b.id, op === 'inizia' ? 'da' : 'a', f); });
    }
  }

  /** tasto destro su una riga dei sottotitoli */
  private menuSott(x: number, y: number, id: string | undefined, f: number) {
    const p = store.doc;
    const righe = (p.sottotitoli?.righe ?? []).slice().sort((a, b) => a.da - b.da);
    const r = righe.find((z) => z.id === id);
    const cambia = (label: string, fn: (s: NonNullable<Project['sottotitoli']>) => void) => store.edit(label, (pp) => { if (pp.sottotitoli) fn(pp.sottotitoli); });
    const scelte = [...this.selSott].filter((z) => righe.some((x) => x.id === z));
    const voci: VoceMenu[] = r ? [
      { nome: 'Scrivi / correggi il testo…', tasto: 'doppio clic · F2', fn: () => void this.scriviSott(r.id) },
      { nome: scelte.length > 1 ? `Unisci le ${scelte.length} righe scelte (appaiono insieme)` : 'Unisci con la riga dopo (appaiono insieme)', tasto: 'Alt+J', disattiva: scelte.length < 2 && righe[righe.length - 1]?.id === r.id,
        fn: () => this.unisciSott() },
      { nome: 'Dividi qui', tasto: 'Alt+S', disattiva: !(f > r.da + 1 && f < r.a - 1), fn: () => this.dividiSott() },
      { sep: true },
      { nome: '⇤ Inizia al cursore', fn: () => cambia('Inizio del sottotitolo', (s) => bordoRiga(s, r.id, 'da', store.head)) },
      { nome: '⇥ Finisci al cursore', fn: () => cambia('Fine del sottotitolo', (s) => bordoRiga(s, r.id, 'a', store.head)) },
      { nome: 'Allunga fino alla dopo', fn: () => cambia('Fine del sottotitolo', (s) => bordoRiga(s, r.id, 'a', limitiRiga(s, r.id)[1] === Infinity ? r.a + fps(p.rate) : limitiRiga(s, r.id)[1])) },
      { sep: true },
      { nome: 'Togli la riga', tasto: 'Canc', fn: () => cambia('Togli sottotitolo', (s) => { const via = new Set(scelte.length > 1 ? scelte : [r.id]); s.righe = s.righe.filter((z) => !via.has(z.id)); }) },
    ] : [
      { nome: 'Riga di sottotitolo al cursore', fn: () => this.rigaSottAlCursore() },
    ];
    voci.push(
      { sep: true },
      { nome: '✨ Genera i sottotitoli con l\'AI (tutto il montaggio)', fn: () => void import('./sottotitoliRapidi').then((m) => m.generaSottotitoli()) },
      { nome: '🗣 Fai parlare i sottotitoli (voce AI)', fn: () => void import('./sottotitoliRapidi').then((m) => m.faiParlareSottotitoli()) },
      { nome: '⚙ Posizione e grandezza…', fn: () => void import('./sottotitoliRapidi').then((m) => m.stileSottotitoli()) },
      { sep: true },
      { nome: 'Esporta i sottotitoli .srt', fn: () => void import('./sottotitoliRapidi').then((m) => m.esportaSottotitoli('srt')) },
      { nome: 'Esporta i sottotitoli .vtt (web)', fn: () => void import('./sottotitoliRapidi').then((m) => m.esportaSottotitoli('vtt')) },
      { nome: 'Importa un file .srt / .vtt…', fn: () => void import('./sottotitoliRapidi').then((m) => m.importaSottotitoli()) },
      { nome: 'Tutti i sottotitoli (pagina Finale)…', fn: () => document.dispatchEvent(new CustomEvent('dpv:sottotitoli')) });
    menuContesto(x, y, voci);
  }

  /** l'altoparlante del suono dell'FX: pieno con le onde se acceso, spento con la croce */
  private disegnaAltoparlante(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, acceso: boolean) {
    ctx.save();
    ctx.fillStyle = acceso ? 'rgba(10,8,16,.55)' : 'rgba(10,8,16,.35)';
    ctx.beginPath(); ctx.roundRect(x - 1, y - 1, s + 2, s + 2, 4); ctx.fill();
    ctx.fillStyle = acceso ? '#fff' : 'rgba(255,255,255,.45)';
    ctx.strokeStyle = acceso ? '#fff' : 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1.3;
    const k = s / 14;
    ctx.beginPath();
    ctx.moveTo(x + 2 * k, y + 5 * k); ctx.lineTo(x + 4.5 * k, y + 5 * k); ctx.lineTo(x + 7.5 * k, y + 2 * k);
    ctx.lineTo(x + 7.5 * k, y + 12 * k); ctx.lineTo(x + 4.5 * k, y + 9 * k); ctx.lineTo(x + 2 * k, y + 9 * k); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    if (acceso) {
      ctx.arc(x + 8 * k, y + 7 * k, 2.6 * k, -0.9, 0.9);
      ctx.moveTo(x + 8 * k + 4.8 * k * Math.cos(-0.9), y + 7 * k + 4.8 * k * Math.sin(-0.9));
      ctx.arc(x + 8 * k, y + 7 * k, 4.8 * k, -0.9, 0.9);
    } else {
      ctx.moveTo(x + 9.5 * k, y + 5 * k); ctx.lineTo(x + 13 * k, y + 9 * k);
      ctx.moveTo(x + 13 * k, y + 5 * k); ctx.lineTo(x + 9.5 * k, y + 9 * k);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** i contorni delle clip scelte, disegnati sopra a tutto alla fine del giro */
  private contorniScelte: { x: number; y: number; w: number; h: number; r: number }[] = [];
  private scarto = new Set<string>();

  private disegnaClip(ctx: CanvasRenderingContext2D, p: Project, c: Clip, t: Track, y: number, hh: number, r: number) {
    const x = this.fX(c.start), w = Math.max(1, c.len * this.ppf);
    const { top, alt, testa, corpoY, corpoH } = this.geo(y, hh);
    const sel = store.sel.has(c.id) || this.scarto.has(c.id);
    const m = mediaOf(p, c);
    const rt = c.media ? mediaRT(c.media) : undefined;
    const offline = c.kind === 'media' && (!rt || rt.stato !== 'ok');
    const tipo = c.kind === 'media' ? (t.kind === 'video' ? 'video' : 'audio') : c.kind === 'title' ? 'title' : c.kind === 'tone' || c.kind === 'beep' ? 'tone' : 'gen';
    const [c1, c2] = COLORI[tipo];
    const xl = Math.max(x, -4), xr = Math.min(x + w, this.W + 4);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 0.5, top + 0.5, w - 1, alt - 1, Math.min(4, w / 3));
    ctx.clip();
    const g = ctx.createLinearGradient(0, top, 0, top + alt);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(xl, top, xr - xl, alt);
    if (t.mute) { ctx.globalAlpha = 0.45; }
    // contenuto: miniature o forma d'onda
    if (c.kind === 'media' && !offline && corpoH > 8) {
      if (t.kind === 'video' && m && m.type !== 'audio') this.filmstrip(ctx, p, c, x, w, corpoY, corpoH, r, xl, xr);
      else if (t.kind === 'audio' && rt?.peaks) this.onda(ctx, c, x, w, corpoY, corpoH, rt.peaks, rt.peaksDone, xl, xr, r);
    } else if (c.kind === 'bars' && corpoH > 6) {
      const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
      const bw = Math.min(w, 70) / 7;
      cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x + 2 + i * bw, corpoY + 2, bw, corpoH - 4); });
    } else if ((c.kind === 'tone' || c.kind === 'beep') && corpoH > 6) {
      ctx.strokeStyle = 'rgba(255,240,180,.6)';
      ctx.beginPath();
      for (let xx = xl; xx < xr; xx += 2) { const yy = corpoY + corpoH / 2 + Math.sin(xx * 0.5) * corpoH * 0.3; if (xx === xl) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
    } else if (c.kind === 'color' && corpoH > 6) {
      ctx.fillStyle = c.gen?.color ?? '#000';
      ctx.fillRect(xl + 2, corpoY + 2, Math.min(xr - xl - 4, 60), corpoH - 4);
    }
    if (offline) {
      ctx.fillStyle = 'rgba(255,77,109,.28)';
      ctx.fillRect(xl, top, xr - xl, alt);
      ctx.strokeStyle = 'rgba(255,77,109,.5)';
      for (let xx = xl - alt; xx < xr; xx += 10) { ctx.beginPath(); ctx.moveTo(xx, top + alt); ctx.lineTo(xx + alt, top); ctx.stroke(); }
    }
    // dissolvenze in/out: la parte che manca è scura, sopra la curva vera (dritta, morbida, analogica, a S…)
    const fadeCurva = (f0: number, f1: number, dir: 1 | -1, cv: Clip['curvaIn']) => {
      const a = this.fX(f0), b = this.fX(f1);
      const n = Math.max(2, Math.min(40, Math.round((b - a) / 3)));
      const pt = (i: number) => { const u = i / n; const g = curvaFade(dir > 0 ? u : 1 - u, cv); return [a + (b - a) * u, top + alt * (1 - g)] as const; };
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath();
      ctx.moveTo(a, top); ctx.lineTo(b, top);
      for (let i = n; i >= 0; i--) { const [px, py] = pt(i); ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = cv && (cv.k || cv.s) ? 'rgba(255,213,74,.85)' : 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const [px, py] = pt(i); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.lineWidth = 1;
    };
    if (c.fadeIn > 0) fadeCurva(c.start, c.start + c.fadeIn, 1, c.curvaIn);
    if (c.fadeOut > 0) fadeCurva(end(c) - c.fadeOut, end(c), -1, c.curvaOut);
    // transizioni in testa e in coda: il blocco sul bordo, con il segno del tipo
    const blocco = (tr: NonNullable<Clip['trIn']>, a: number, b: number) => {
      ctx.fillStyle = tr.type === 'dip' ? 'rgba(0,0,0,.55)' : tr.type === 'dve' ? 'rgba(255,61,242,.26)' : 'rgba(255,213,74,.28)';
      ctx.fillRect(a, top, b - a, alt);
      ctx.strokeStyle = 'rgba(255,213,74,.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (tr.type === 'mix') { ctx.moveTo(a, top + alt); ctx.lineTo(b, top); ctx.moveTo(a, top); ctx.lineTo(b, top + alt); }
      else if (tr.type === 'wipe') { ctx.moveTo(a, top + alt); ctx.lineTo(b, top); ctx.lineTo(b, top + alt); ctx.closePath(); }
      else if (tr.type === 'dve') { ctx.strokeStyle = 'rgba(255,61,242,.95)'; ctx.rect(a + 2, top + 2, b - a - 4, alt - 4); ctx.moveTo(a, (top * 2 + alt) / 2); ctx.lineTo(b, (top * 2 + alt) / 2); }
      else { ctx.moveTo(a, top); ctx.lineTo((a + b) / 2, top + alt); ctx.lineTo(b, top); }
      ctx.stroke();
      ctx.lineWidth = 1;
      // il nome del modello, se c'è posto
      if (b - a > 46 && alt > 24 && tr.type !== 'mix') {
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.font = '700 9.5px Rajdhani, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(nomeModello(tr.type, tr.pattern), a + 3, top + alt - 2, b - a - 6);
      }
    };
    if (c.trIn) blocco(c.trIn, this.fX(c.start), this.fX(c.start + c.trIn.len));
    if (c.trOut) blocco(c.trOut, this.fX(end(c) - c.trOut.len), this.fX(end(c)));
    // testa della clip
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(xl, top, xr - xl, testa);
    if (c.label) { ctx.fillStyle = ETICHETTE[c.label % ETICHETTE.length]; ctx.fillRect(xl, top, xr - xl, 2); }
    const conFx = w > 74 && testa >= 12;
    const accesi = conFx ? effettiAccesi(c, p) : [];
    if (w > 24 && testa >= 10) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${testa >= 15 ? 12 : 11}px Rajdhani, sans-serif`;
      ctx.textBaseline = 'middle';
      let nome = c.name;
      if (c.link) nome = '⛓ ' + nome;
      if (isVideoClip(c) && c.opacity < 1 && !c.opKeys.length) nome += `  ${Math.round(c.opacity * 100)}%`;
      if (c.speed && Math.abs(c.speed - 1) > 0.005) nome += `  ⏩${etichettaVelocita(c.speed)}${c.fluido ? '≈' : ''}`;
      if (c.fx.key !== 'none') nome += '  ⬚chiave';
      if (c.ritaglio) nome += '  ✂ sfondo AI';
      if (this.haVolume(c, t) && !c.gainKeys.length && c.gain !== 0) nome += `  ${c.gain > 0 ? '+' : ''}${c.gain} dB`;
      // il nome parte dopo la maniglia della dissolvenza (il quadratino in alto a sinistra)
      const tx = Math.max(x + (w >= 40 ? 14 : 4), 4);
      const fine = conFx ? x + w - 9 - FX_W - 4 - accesi.length * 7 : x + w - 4;
      ctx.fillText(nome, tx, top + testa / 2 + 0.5, Math.max(10, fine - tx));
    }
    // il tasto "fx" in fondo alla testa, con un puntino per ogni effetto acceso
    if (conFx) {
      const bx = x + w - 9 - FX_W;
      ctx.fillStyle = accesi.length ? 'rgba(255,61,242,.85)' : 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.roundRect(bx, top + 2, FX_W, testa - 4, 3); ctx.fill();
      ctx.fillStyle = accesi.length ? '#fff' : 'rgba(255,255,255,.75)';
      ctx.font = '800 9.5px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('fx', bx + FX_W / 2, top + testa / 2 + 0.5);
      ctx.textAlign = 'left';
      accesi.forEach((_, i) => { ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(bx - 5 - i * 7, top + testa / 2, 2.4, 0, Math.PI * 2); ctx.fill(); });
    }
    // l'altoparlante del suono dentro la clip (titoli, countdown)
    const spc = this.altoparlanteClip(c, x, w, { corpoY, corpoH });
    if (spc) this.disegnaAltoparlante(ctx, spc.x, spc.y, spc.s, !!c.sfx?.audio && !!c.sfx?.suono);
    // il volume sulle clip audio è sempre in vista; la trasparenza del video con B (linee elastiche)
    if (this.haVolume(c, t) && corpoH > 12) this.volume(ctx, c, x, w, corpoY, corpoH);
    else if ((modi.elastico || c.opKeys.length) && isVideoClip(c) && corpoH > 10) this.elastico(ctx, c, t, x, w, corpoY, corpoH);
    ctx.globalAlpha = 1;
    // scelta: una velatura gialla su tutta la clip, così si vede anche quando è attaccata ad altre
    if (sel) { ctx.fillStyle = 'rgba(255,213,74,.16)'; ctx.fillRect(xl, top, xr - xl, alt); }
    ctx.restore();
    // bordo (quello giallo delle scelte arriva alla fine, sopra a tutte le clip)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath();
    ctx.roundRect(x + 0.5, top + 0.5, w - 1, alt - 1, Math.min(4, w / 3));
    ctx.stroke();
    if (sel) this.contorniScelte.push({ x, y: top, w, h: alt, r: Math.min(4, w / 3) });
    // le maniglie delle dissolvenze (quadratini in alto): si trascinano verso l'interno
    if (w >= 40) {
      const [xi, xo] = this.maniglieFade(c);
      for (const [mx, on] of [[xi, c.fadeIn > 0], [xo, c.fadeOut > 0]] as [number, boolean][]) {
        ctx.fillStyle = on || sel ? '#fff' : 'rgba(255,255,255,.55)';
        ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.beginPath(); ctx.rect(Math.round(mx) - 3.5, top + 1.5, 7, 7); ctx.fill(); ctx.stroke();
      }
    }
  }

  private filmstrip(ctx: CanvasRenderingContext2D, p: Project, c: Clip, x: number, w: number, y: number, hh: number, r: number, xl: number, xr: number) {
    const m = mediaOf(p, c)!;
    const asp = m.width && m.height ? (m.rotation % 180 ? m.height / m.width : m.width / m.height) : 16 / 9;
    const tw = Math.max(16, hh * asp);
    // passo di sorgente in secondi: potenza di due, così zoomando si riusano le miniature già fatte
    const secPerTile = tw / this.ppf / r;
    const passo = Math.pow(2, Math.ceil(Math.log2(Math.max(1 / 8, secPerTile))));
    const primo = Math.max(0, Math.floor((xl - x) / tw));
    for (let i = primo; x + i * tw < xr; i++) {
      const tx = x + i * tw;
      if (tx > x + w) break;
      const f = c.start + (i * tw) / this.ppf;
      const st = srcTimeAt(p, c, f);
      const q = Math.max(m.t0 || 0, Math.floor(st / passo) * passo);
      const img = miniatura(c.media!, m.type === 'image' ? 0 : Math.min(q, Math.max(0, m.duration - 0.05)));
      if (img) {
        const iw = (img as HTMLCanvasElement).width || 1, ih = (img as HTMLCanvasElement).height || 1;
        const k = Math.min(tw / iw, hh / ih);
        ctx.drawImage(img, tx + (tw - iw * k) / 2, y + (hh - ih * k) / 2, iw * k, ih * k);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(tx + 1, y + 1, tw - 2, hh - 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(tx, y, 1, hh);
    }
  }

  private onda(ctx: CanvasRenderingContext2D, c: Clip, x: number, w: number, y: number, hh: number, peaks: Float32Array, pronti: number, xl: number, xr: number, r: number) {
    const mid = y + hh / 2;
    // l'originale di una canzone separata va a −60 dB: la sua forma d'onda si vede com'era (più smorta), se no sparirebbe
    const orig = c.afx?.separata?.ruolo === 'originale';
    let gain = dbToGain(orig ? c.afx?.separata?.gain ?? 0 : c.gain);
    ctx.fillStyle = orig ? 'rgba(200,255,225,.38)' : 'rgba(200,255,225,.75)';
    const a = Math.max(Math.floor(xl), Math.floor(x)), b = Math.min(Math.ceil(xr), Math.ceil(x + w));
    for (let px = a; px < b; px++) {
      const f0 = this.xF(px), f1 = this.xF(px + 1);
      const s0 = c.srcIn + (f0 - c.start) / r, s1 = c.srcIn + (f1 - c.start) / r;
      const i0 = Math.floor(s0 * PEAKS_PER_SEC), i1 = Math.max(i0 + 1, Math.floor(s1 * PEAKS_PER_SEC));
      if (i0 >= pronti) break;
      let mx = 0;
      for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > mx) mx = peaks[i];
      if (!orig && c.gainKeys.length) gain = dbToGain(keyValue(c.gainKeys, f0 - c.start, c.gain));
      const v = Math.min(1, mx * gain) * hh * 0.48;
      if (v > 0.3) ctx.fillRect(px, mid - v, 1, v * 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(xl, mid, xr - xl, 1);
  }

  /** la linea gialla del volume, con i suoi punti: si trascina su e giù, doppio clic mette un punto */
  private volume(ctx: CanvasRenderingContext2D, c: Clip, x: number, w: number, y: number, hh: number) {
    const vy = (db: number) => this.yDb(db, y, hh);
    const keys = c.gainKeys;
    // lo zero (volume normale) come riferimento leggero
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x, Math.round(vy(0)), w, 1);
    ctx.strokeStyle = c.gain <= -60 ? 'rgba(255,77,109,.9)' : '#ffd54a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (!keys.length) { ctx.moveTo(x, vy(c.gain)); ctx.lineTo(x + w, vy(c.gain)); }
    else {
      ctx.moveTo(x, vy(keys[0].v));
      for (const k of keys) ctx.lineTo(this.fX(c.start + k.f), vy(k.v));
      ctx.lineTo(x + w, vy(keys[keys.length - 1].v));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const k of keys) {
      const px = this.fX(c.start + k.f), py = vy(k.v);
      ctx.fillStyle = '#1a1406';
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  private elastico(ctx: CanvasRenderingContext2D, c: Clip, t: Track, x: number, w: number, y: number, hh: number) {
    const video = t.kind === 'video';
    const keys = video ? c.opKeys : c.gainKeys;
    const base = video ? c.opacity : c.gain;
    const vy = (v: number) => video ? y + hh - v * hh : y + hh - ((clamp(v, -40, 12) + 40) / 52) * hh;
    ctx.strokeStyle = video ? '#35e8ff' : '#ffb23d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (!keys.length) { ctx.moveTo(x, vy(base)); ctx.lineTo(x + w, vy(base)); }
    else {
      ctx.moveTo(x, vy(keys[0].v));
      for (const k of keys) ctx.lineTo(this.fX(c.start + k.f), vy(k.v));
      ctx.lineTo(x + w, vy(keys[keys.length - 1].v));
    }
    ctx.stroke();
    ctx.fillStyle = video ? '#35e8ff' : '#ffb23d';
    for (const k of keys) { const px = this.fX(c.start + k.f); ctx.fillRect(px - 3, vy(k.v) - 3, 6, 6); }
    ctx.lineWidth = 1;
  }

  /** quanti fotogrammi racconta il navigatore (il montaggio, o di più se si guarda oltre la fine) */
  private totaleNav() { return Math.max(projectEnd(store.doc), this.xF(this.W), tcBase(store.doc.rate) * 10) * 1.04 + 1; }

  /** il navigatore: tutto il montaggio in piccolo (FX, video, audio) e la finestra gialla di quello che si vede */
  private disegnaNav() {
    const ctx = this.nav.getContext('2d');
    if (!ctx) return;
    const p = store.doc, W = this.W;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0a0f';
    ctx.fillRect(0, 0, W, NAV);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 1);
    const k = (W - 4) / this.totaleNav();
    const righe: Record<TrackKind, [number, number, string]> = { fx: [4, 3, '#c048c8'], video: [8, 6, '#3f71d6'], audio: [15, 5, '#2f9a69'] };
    const tipo = new Map(p.tracks.map((t) => [t.id, t.kind]));
    for (const c of p.clips) {
      const [yy, hh, col] = c.kind === 'fx' ? (c.fxb?.tipo === 'transizione' ? [4, 3, '#22b4c4'] : righe.fx) : righe[tipo.get(c.track) ?? 'video'];
      ctx.fillStyle = col;
      ctx.fillRect(2 + c.start * k, yy, Math.max(1, c.len * k), hh);
    }
    for (const m of p.markers) { ctx.fillStyle = m.color; ctx.fillRect(2 + m.f * k, 1, 1, 3); }
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(2 + store.head * k - 0.5, 1, 1.5, NAV - 2);
    const a = 2 + this.scrollF * k, w = Math.max(16, (this.W / this.ppf) * k);
    ctx.fillStyle = 'rgba(255,213,74,.13)';
    ctx.beginPath(); ctx.roundRect(a, 2, w, NAV - 4, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,213,74,.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(a + 2, NAV / 2 - 5, 3, 10);
    ctx.fillRect(a + w - 5, NAV / 2 - 5, 3, 10);
  }

  /** trascinare la finestra = scorrere · i suoi bordi = zoom · clic fuori = la finestra va lì · rotella = scorre */
  private eventiNav() {
    const nav = this.nav;
    const misura = (clientX: number) => {
      const x = clientX - nav.getBoundingClientRect().left;
      const k = (this.W - 4) / this.totaleNav();
      const a = 2 + this.scrollF * k, w = Math.max(16, (this.W / this.ppf) * k);
      return { x, k, a, w };
    };
    nav.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const { x, a, w } = misura(e.clientX);
      nav.style.cursor = Math.abs(x - a) < 8 || Math.abs(x - a - w) < 8 ? 'ew-resize' : x > a && x < a + w ? 'grab' : 'pointer';
    });
    nav.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const { x, k, a, w } = misura(e.clientX);
      let modo: 'sposta' | 'sx' | 'dx' = 'sposta';
      if (Math.abs(x - a) < 8) modo = 'sx';
      else if (Math.abs(x - a - w) < 8) modo = 'dx';
      else if (x < a || x > a + w) { this.scrollF = Math.max(0, (x - 2) / k - this.W / this.ppf / 2); this.sporca(); }
      const s0 = this.scrollF, f1 = this.scrollF + this.W / this.ppf;
      // lo zoom più stretto: 48 pixel per fotogramma
      const minimo = this.W / 48;
      nav.setPointerCapture(e.pointerId);
      nav.style.cursor = modo === 'sposta' ? 'grabbing' : 'ew-resize';
      const mv = (ev: PointerEvent) => {
        const d = (ev.clientX - e.clientX) / k;
        if (modo === 'sposta') this.scrollF = Math.max(0, s0 + d);
        else if (modo === 'sx') {
          const inizio = clamp(s0 + d, 0, f1 - minimo);
          this.ppf = clamp(this.W / (f1 - inizio), 0.004, 48);
          this.scrollF = Math.max(0, f1 - this.W / this.ppf);
        } else {
          const fine = Math.max(s0 + minimo, f1 + d);
          this.ppf = clamp(this.W / (fine - s0), 0.004, 48);
          this.scrollF = s0;
        }
        this.seguiCursore = false;
        this.sporca();
      };
      const up = () => { nav.removeEventListener('pointermove', mv); nav.removeEventListener('pointerup', up); nav.style.cursor = ''; this.seguiCursore = true; };
      nav.addEventListener('pointermove', mv);
      nav.addEventListener('pointerup', up);
    });
    nav.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { this.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, this.W / 2); return; }
      const k = (this.W - 4) / this.totaleNav();
      this.scrollF = Math.max(0, this.scrollF + (e.deltaY || e.deltaX) / k * 0.35);
      this.sporca();
    }, { passive: false });
  }

  // ——— eventi ———
  private eventi() {
    const cv = this.cv;
    const pos = (e: { clientX: number; clientY: number }) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointermove', (e) => {
      if (this.presa) return;
      const { x, y } = pos(e);
      const c = this.colpo(x, y);
      let cur = 'default';
      if (c.zona === 'righello') cur = 'col-resize';
      else if (c.zona === 'in' || c.zona === 'out') cur = e.shiftKey && c.taglio ? 'ew-resize' : c.zona === 'in' ? 'w-resize' : 'e-resize';
      else if (c.zona === 'fx' || c.zona === 'suono') cur = 'pointer';
      else if (c.zona === 'sott') cur = !c.sott ? 'default' : c.sott.lato === 'corpo' ? 'move' : 'ew-resize';
      else if (c.zona === 'fadeIn' || c.zona === 'fadeOut') cur = 'ew-resize';
      else if (c.zona === 'curvaIn' || c.zona === 'curvaOut') cur = 'ns-resize';
      else if (c.zona === 'volume') cur = 'copy';
      else if (c.zona === 'punto') cur = 'grab';
      else if (c.zona === 'corpo') cur = e.altKey ? 'grab' : modi.elastico && c.clip && isVideoClip(c.clip) ? 'crosshair' : 'move';
      cv.style.cursor = cur;
      if (c.zona === 'volume' || c.zona === 'punto') {
        const cl = c.clip!;
        const db = c.zona === 'punto' ? cl.gainKeys[c.punto!].v : cl.gainKeys.length ? keyValue(cl.gainKeys, c.f - cl.start, cl.gain) : cl.gain;
        cv.title = `Volume ${db > 0 ? '+' : ''}${db} dB · ${c.zona === 'volume' ? 'clic = metti un punto qui e trascinalo su/giù (anche di lato)' : 'trascina il punto su/giù e di lato'} · Maiusc+trascina = alza o abbassa tutto il tratto · Alt+clic sul punto = toglilo`;
      } else if (c.zona === 'fx') cv.title = 'Effetti al volo per questa clip';
      else if (c.zona === 'sott') cv.title = c.sott ? 'Sottotitolo: trascina per spostarlo, tira i bordi per i tempi, doppio clic per scrivere, Shift+clic per sceglierne altri, tasto destro per unire e dividere' : 'La riga dei sottotitoli: tasto destro per aggiungerne uno qui';
      else if (c.zona === 'suono') { const so = c.clip && sonoro(c.clip); cv.title = so?.suono ? `Suono ${c.clip!.kind === 'fx' ? 'dell\'FX' : 'della clip'}: ${suono(so.suono)?.nome ?? ''} · clic = ${so.audio ? 'spegnilo' : 'accendilo'} · tasto destro = scegli un altro suono` : 'Nessun suono · clic o tasto destro = scegline uno'; }
      else if (c.clip?.kind === 'fx' && c.zona === 'corpo') cv.title = `${nomeBlocco(c.clip.fxb!)}: trascinalo dove vuoi (si attacca al taglio, all'inizio o alla fine della clip) · allungalo dai bordi · tasto destro = durata, suono, modello`;
      else if (c.zona === 'fadeIn' || c.zona === 'fadeOut') cv.title = (c.zona === 'fadeIn' ? 'Dissolvenza in entrata: trascina verso destra' : 'Dissolvenza in uscita: trascina verso sinistra') + ' · tasto destro: la forma';
      else if (c.zona === 'curvaIn' || c.zona === 'curvaOut') cv.title = 'Trascina su o giù per piegare la dissolvenza (su = subito, giù = piano piano) · tasto destro: le forme · doppio clic: dritta';
      else cv.title = '';
    });
    let tocchi = new Map<number, { x: number; y: number }>();
    let pizzico: { d: number; ppf: number; cx: number } | null = null;
    let lungo = 0;
    cv.addEventListener('pointerdown', (e) => {
      cv.focus({ preventScroll: true });
      const { x, y } = pos(e);
      if (e.pointerType === 'touch') {
        tocchi.set(e.pointerId, { x, y });
        if (tocchi.size === 2) {
          const [a, b] = [...tocchi.values()];
          pizzico = { d: Math.hypot(a.x - b.x, a.y - b.y), ppf: this.ppf, cx: (a.x + b.x) / 2 };
          this.annullaPresa();
          return;
        }
      }
      if (e.button === 2) return;
      const c = this.colpo(x, y);
      if (c.zona !== 'sott' && !e.shiftKey && this.selSott.size) { this.selSott.clear(); this.sporca(); }
      if (c.zona === 'sott') {
        if (!c.sott) { motore.setMonitor('recorder'); store.setHead(Math.max(0, Math.round(c.f))); this.selSott.clear(); this.sporca(); return; }
        if (e.shiftKey) { if (this.selSott.has(c.sott.id)) this.selSott.delete(c.sott.id); else this.selSott.add(c.sott.id); }
        else if (!this.selSott.has(c.sott.id)) this.selSott = new Set([c.sott.id]);
        // la riga ha la sua voce AI (una clip audio): si sceglie insieme, così le proprietà sono quelle della voce
        // (volume, tracce, dissolvenze…) e si gestisce come ogni altra clip
        const riga = store.doc.sottotitoli?.righe.find((z) => z.id === c.sott!.id);
        const voce = riga?.voce && store.doc.clips.some((k) => k.id === riga.voce) ? riga.voce : null;
        if (voce && !e.shiftKey) { store.select([voce]); document.dispatchEvent(new CustomEvent('dpv:proprieta')); }
        else if (store.sel.size) store.select([]);
        store.begin('Sottotitolo');
        this.presa = { tipo: 'sott', id: c.sott.id, lato: c.sott.lato, x0: x, righe0: structuredClone(store.doc.sottotitoli!.righe), mosso: false };
        try { cv.setPointerCapture(e.pointerId); } catch { /* ok */ }
        this.sporca();
        return;
      }
      if (c.zona === 'righello' || (c.zona === 'vuoto' && e.pointerType === 'touch')) {
        motore.setMonitor('recorder');
        this.presa = { tipo: 'cursore' };
        this.cursoreAgganciato = null;
        motore.stop();
        store.setHead(this.agganciaCursore(Math.max(0, Math.round(c.f)), e.altKey));
      } else if (c.clip && c.zona === 'fx') {
        if (!store.sel.has(c.clip.id)) store.select(M.withLinked(store.doc, [c.clip.id]));
        // il tasto "fx" porta alle miniature degli effetti nelle Proprietà (prima era un elenco a tendina, senza vedere niente)
        apriEditorClip(c.clip.id, isVideoClip(c.clip) ? 'fxv' : 'fxa');
        return;
      } else if (c.clip && c.zona === 'suono') {
        if (sonoro(c.clip)?.suono) this.alternaSuono(c.clip.id);
        else this.menuSuoni(e.clientX, e.clientY, c.clip);
        return;
      } else if (c.clip && (c.zona === 'fadeIn' || c.zona === 'fadeOut')) {
        if (trackOf(store.doc, c.clip.track).lock) return;
        if (!store.sel.has(c.clip.id)) store.select([c.clip.id]);
        store.begin('Dissolvenza');
        this.presa = { tipo: 'fade', id: c.clip.id, lato: c.zona === 'fadeIn' ? 'in' : 'out', mosso: false };
      } else if (c.clip && (c.zona === 'curvaIn' || c.zona === 'curvaOut')) {
        if (trackOf(store.doc, c.clip.track).lock) return;
        if (!store.sel.has(c.clip.id)) store.select([c.clip.id]);
        store.begin('Forma della dissolvenza');
        const cv = c.zona === 'curvaIn' ? c.clip.curvaIn : c.clip.curvaOut;
        this.presa = { tipo: 'fade', id: c.clip.id, lato: c.zona === 'curvaIn' ? 'in' : 'out', mosso: false, curva: { y0: y, k0: cv?.k ?? 0, s: !!cv?.s } };
      } else if (c.clip && (c.zona === 'volume' || c.zona === 'punto')) {
        if (trackOf(store.doc, c.clip.track).lock) return;
        this.presaVolume(e, c);
      } else if (c.clip && modi.elastico && c.zona === 'corpo' && isVideoClip(c.clip)) {
        this.presaElastico(e, c, x, y);
      } else if (c.clip && (c.zona === 'in' || c.zona === 'out')) {
        if (trackOf(store.doc, c.clip.track).lock) return;
        store.begin('Trim');
        const base = structuredClone(store.doc.clips);
        if (e.shiftKey && c.taglio) this.presa = { tipo: 'roll', l: c.taglio.l.id, r: c.taglio.r.id, base, x0: x, d: 0 };
        else this.presa = { tipo: 'trim', id: c.clip.id, edge: c.zona, base, x0: x, d: 0, linked: !e.altKey, ripple: modi.ripple || e.ctrlKey || e.metaKey };
      } else if (c.clip) {
        const clip = c.clip;
        const add = e.shiftKey || e.ctrlKey || e.metaKey;
        if (add) {
          const ids = M.withLinked(store.doc, [clip.id]);
          if (store.sel.has(clip.id)) { for (const id of ids) store.sel.delete(id); store.emit('sel'); }
          else store.select(ids, true);
        } else if (!store.sel.has(clip.id)) store.select(e.altKey ? [clip.id] : M.withLinked(store.doc, [clip.id]));
        // clic su una clip o su un FX: le sue impostazioni compaiono nel pannello a destra
        document.dispatchEvent(new CustomEvent('dpv:proprieta'));
        store.focusTrack = clip.track;
        if (trackOf(store.doc, clip.track).lock) return;
        const base = structuredClone(store.doc.clips);
        if (e.altKey && e.shiftKey && clip.kind !== 'fx') {
          // Alt+Shift (come in EDIUS): la clip e tutto quello che viene dopo, su tutte le tracce non bloccate, insieme
          const p0 = store.doc;
          const ids = new Set(p0.clips.filter((z) => (z.kind === 'fx' ? centro(z) : z.start) >= clip.start && !trackOf(p0, z.track).lock).map((z) => z.id));
          store.select(ids);
          store.begin('Sposta tutto da qui');
          this.presa = { tipo: 'sposta', ids, base, x0: x, y0: y, kind: trackOf(p0, clip.track).kind, df: 0, dt: 0, ancora: clip, tutto: true };
          avviso(`⇆ Sposto ${ids.size} clip insieme: da qui in poi, su tutte le tracce`, 'info', 1600);
        } else if (e.altKey) { store.begin('Slip'); this.presa = { tipo: 'slip', ids: M.withLinked(store.doc, [clip.id]), base, x0: x, d: 0 }; }
        else {
          const avvia = () => {
            store.begin('Sposta');
            this.presa = { tipo: 'sposta', ids: M.withLinked(store.doc, store.sel), base, x0: x, y0: y, kind: trackOf(store.doc, clip.track).kind, df: 0, dt: 0, ancora: clip };
          };
          if (e.pointerType === 'touch') {
            // sul telefono si sposta con la pressione lunga, così il dito può anche solo scorrere
            clearTimeout(lungo);
            lungo = window.setTimeout(() => { avvia(); navigator.vibrate?.(15); }, 280);
          } else avvia();
        }
      } else {
        if (!e.shiftKey && !e.ctrlKey) store.select([]);
        store.focusTrack = c.track?.id ?? null;
        this.presa = { tipo: 'riquadro', x0: x, y0: y, x1: x, y1: y, add: e.shiftKey || e.ctrlKey };
      }
      try { cv.setPointerCapture(e.pointerId); } catch { /* ok */ }
      this.sporca();
    });
    cv.addEventListener('pointermove', (e) => {
      const { x, y } = pos(e);
      if (e.pointerType === 'touch' && tocchi.has(e.pointerId)) {
        const prec = tocchi.get(e.pointerId)!;
        tocchi.set(e.pointerId, { x, y });
        if (pizzico && tocchi.size === 2) {
          const [a, b] = [...tocchi.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const f = this.xF(pizzico.cx);
          this.ppf = clamp(pizzico.ppf * (d / Math.max(10, pizzico.d)), 0.004, 48);
          this.scrollF = Math.max(0, f - pizzico.cx / this.ppf);
          this.sporca();
          return;
        }
        if (!this.presa) {
          clearTimeout(lungo);
          this.scrollF = Math.max(0, this.scrollF - (x - prec.x) / this.ppf);
          this.scorriY(this.scrollY - (y - prec.y));
          this.sporca();
          return;
        }
      }
      if (!this.presa) return;
      this.muovi(x, y, e);
    });
    const fine = (e: PointerEvent) => {
      clearTimeout(lungo);
      tocchi.delete(e.pointerId);
      if (tocchi.size < 2) pizzico = null;
      const q = this.presa;
      this.presa = null;
      this.snapLinea = null;
      if (!q) return;
      if (q.tipo === 'sposta') store.commit(q.df !== 0 || q.dt !== 0);
      else if (q.tipo === 'trim' || q.tipo === 'roll' || q.tipo === 'slip') store.commit(q.d !== 0);
      else if (q.tipo === 'elastico') store.commit(q.creato || q.mosso);
      else if (q.tipo === 'volume' || q.tipo === 'fade' || q.tipo === 'sott') store.commit(q.mosso);
      else if (q.tipo === 'riquadro') this.selezionaRiquadro(q);
      this.sporca();
    };
    cv.addEventListener('pointerup', fine);
    cv.addEventListener('pointercancel', (e) => { if (this.presa && this.presa.tipo !== 'cursore' && this.presa.tipo !== 'riquadro') store.cancelLive(); this.presa = null; fine(e); });
    cv.addEventListener('dblclick', (e) => {
      const { x, y } = pos(e);
      const c = this.colpo(x, y);
      if (c.zona === 'sott') { if (c.sott) void this.scriviSott(c.sott.id); else this.rigaSottAlCursore(); return; }
      if (c.clip && (c.zona === 'curvaIn' || c.zona === 'curvaOut')) {
        // doppio clic sulla curva: torna dritta
        const id = c.clip.id, lato = c.zona;
        store.edit('Dissolvenza dritta', (p) => { const cc = clipById(p, id)!; if (lato === 'curvaIn') cc.curvaIn = undefined; else cc.curvaOut = undefined; });
        return;
      }
      if (c.clip && (c.zona === 'volume' || c.zona === 'punto')) {
        // doppio clic sul punto lo toglie (il clic sulla linea ne mette già uno)
        if (performance.now() - this.puntoNuovoA < 600) return;
        const id = c.clip.id, lf = Math.round(c.f - c.clip.start), idx = c.punto;
        store.edit(idx !== undefined ? 'Togli punto del volume' : 'Punto del volume', (p) => {
          const cc = clipById(p, id)!;
          if (idx !== undefined) { cc.gainKeys.splice(idx, 1); return; }
          const v = cc.gainKeys.length ? keyValue(cc.gainKeys, lf, cc.gain) : cc.gain;
          if (!cc.gainKeys.length) cc.gainKeys.push({ f: 0, v: cc.gain }, { f: cc.len, v: cc.gain });
          cc.gainKeys = cc.gainKeys.filter((k) => k.f !== lf).concat({ f: lf, v }).sort((a, b) => a.f - b.f);
        });
        return;
      }
      if (c.clip) {
        // il doppio clic su una clip (video, audio, titolo, effetto…) apre l'editor in una finestra: tutte le sezioni, anche
        // effetti, durata, ritaglio e movimento. Il cursore entra nella clip e il monitor va sul programma, così si vede il risultato
        const k = c.clip;
        const f = Math.round(store.head);
        if (f < k.start || f >= end(k)) store.setHead(clamp(Math.round(c.f), k.start, end(k) - 1));
        motore.setMonitor('recorder');
        apriEditorClip(k.id);
        this.sporca();
      }
    });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const { x, y } = pos(e);
      const c = this.colpo(x, y);
      if (c.zona === 'sott') {
        if (c.sott && !this.selSott.has(c.sott.id)) this.selSott = new Set([c.sott.id]);
        if (!c.sott) { motore.vaiA(Math.max(0, Math.round(c.f))); }
        this.sporca();
        this.menuSott(e.clientX, e.clientY, c.sott?.id, c.f);
        return;
      }
      if (c.clip && !store.sel.has(c.clip.id)) store.select(M.withLinked(store.doc, [c.clip.id]));
      // sull'altoparlante: dritto il menu dei suoni
      if (c.clip && c.zona === 'suono') { this.menuSuoni(e.clientX, e.clientY, c.clip); return; }
      // sulla maniglia o sulla curva di una dissolvenza: le forme
      if (c.clip && (c.zona === 'fadeIn' || c.zona === 'fadeOut' || c.zona === 'curvaIn' || c.zona === 'curvaOut')) { this.menuDissolvenza(e.clientX, e.clientY, c.clip, c.zona === 'fadeIn' || c.zona === 'curvaIn' ? 'in' : 'out'); return; }
      this.menu(e.clientX, e.clientY, c);
    });
    cv.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selSott.size) {
        // via le righe scelte; se ci sono anche clip scelte, ci pensa il tasto Elimina di sempre
        if (!store.sel.size) { e.preventDefault(); e.stopPropagation(); }
        const via = new Set(this.selSott);
        store.edit('Togli sottotitoli', (pp) => { if (pp.sottotitoli) pp.sottotitoli.righe = pp.sottotitoli.righe.filter((z) => !via.has(z.id)); });
        this.selSott.clear();
      }
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { x } = pos(e);
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) this.zoomVerticale(e.deltaY < 0 ? 1.12 : 1 / 1.12);
      else if (e.ctrlKey || e.metaKey) this.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, x);
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || pos(e).y < RIGHELLO) {
        // sul righello (e con Maiusc o di lato) la rotella fa scorrere la vista, avanti e indietro: ci si riporta all'inizio
        // senza spostare il cursore
        const dx = e.deltaX || e.deltaY;
        this.scrollF = Math.max(0, this.scrollF + (e.deltaMode === 1 ? dx * 40 : dx) / this.ppf);
      }
      else if (e.altKey) this.scorriY(this.scrollY + e.deltaY * 0.6);
      else {
        // la rotella muove il cursore di un fotogramma per scatto, col suono: per tagliare sulla sillaba
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        let n = 0;
        if (Math.abs(dy) >= 50) { n = Math.sign(dy); this.rotella = 0; }
        else { this.rotella += dy; n = Math.trunc(this.rotella / 24); this.rotella -= n * 24; }
        if (n) { motore.setMonitor('recorder'); motore.passo(n); }
      }
      this.sporca();
    }, { passive: false });
    this.testate.addEventListener('wheel', (e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) { this.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18); return; } this.scorriY(this.scrollY + e.deltaY * 0.6); }, { passive: false });
    this.eventiNav();
    this.eventiVbar();
    // trascinamento dal contenitore (col puntatore: vedi trascina.ts)
    registraBersaglio({
      el: this.area,
      sopra: (x, y, dato) => {
        const q = pos({ clientX: x, clientY: y });
        this.fantasma = null; this.fantasmaBlocco = null; this.bersaglioFx = null;
        if (dato.startsWith('x:') || dato.startsWith('t:')) this.fantasmaBlocco = this.anteprimaBlocco(q.x, q.y, dato);
        else if (dato.startsWith('e:')) this.bersaglioFx = this.clipDrop(q.x, q.y, dato.slice(2))?.id ?? null;
        else if (dato === 's:ai') this.bersaglioFx = this.colpo(q.x, q.y).clip?.media ? this.colpo(q.x, q.y).clip!.id : null;
        else this.fantasma = this.anteprimaDrop(q.x, q.y, dato);
        this.sporca();
      },
      lascia: (x, y, dato) => { const q = pos({ clientX: x, clientY: y }); this.fantasma = null; this.fantasmaBlocco = null; this.bersaglioFx = null; this.rilascia(dato, q.x, q.y); this.sporca(); },
      esci: () => { this.fantasma = null; this.fantasmaBlocco = null; this.bersaglioFx = null; this.snapLinea = null; this.sporca(); },
    });
  }

  private annullaPresa() {
    if (this.presa && this.presa.tipo !== 'cursore' && this.presa.tipo !== 'riquadro') store.cancelLive();
    this.presa = null;
  }

  private aggancia(f: number, esclusi: Set<string>): number {
    if (!modi.snap) { this.snapLinea = null; return f; }
    const pts = M.snapPoints(store.doc, esclusi, [Math.round(store.head)]);
    const soglia = 8 / this.ppf;
    let best = f, bd = soglia;
    for (const s of pts) { const d = Math.abs(s - f); if (d < bd) { bd = d; best = s; } }
    this.snapLinea = best !== f ? best : null;
    return best;
  }

  /** il cursore si aggancia da solo ai tagli, ai marcatori e ad attacco/stacco (Alt = libero): un po' più di calamita
   *  delle clip, e una volta agganciato ci resta finché non ti allontani davvero */
  private agganciaCursore(f: number, libero: boolean): number {
    if (!modi.snap || libero) { this.snapLinea = null; this.cursoreAgganciato = null; return f; }
    const punti = M.snapPoints(store.doc, new Set(), []);
    const soglia = 12 / this.ppf;
    const ag = this.cursoreAgganciato;
    if (ag !== null && Math.abs(ag - f) <= soglia * 1.6) { this.snapLinea = ag; return ag; }
    let best = f, bd = soglia;
    for (const s of punti) { const d = Math.abs(s - f); if (d < bd) { bd = d; best = s; } }
    this.cursoreAgganciato = best !== f ? best : null;
    this.snapLinea = this.cursoreAgganciato;
    return best;
  }
  private cursoreAgganciato: number | null = null;

  private muovi(x: number, y: number, e: PointerEvent) {
    const q = this.presa!;
    const p = store.doc;
    if (q.tipo === 'cursore') {
      const f = this.agganciaCursore(Math.max(0, Math.round(this.xF(x))), e.altKey);
      // trascinando il cursore si sente l'audio a colpetti (come far scorrere il nastro sulle testine)
      const now = performance.now();
      if (f !== Math.round(store.head) && now - this.ultimoScrub > 70) { this.ultimoScrub = now; banco.scrub(p, f2s(f, p.rate)); }
      store.setHead(f);
      if (x > this.W - 20) this.scrollF += 4 / this.ppf;
      if (x < 20 && this.scrollF > 0) this.scrollF = Math.max(0, this.scrollF - 4 / this.ppf);
      return;
    }
    if (q.tipo === 'riquadro') { q.x1 = x; q.y1 = y; this.sporca(); return; }
    if (q.tipo === 'sott') {
      const s = p.sottotitoli;
      if (!s) return;
      let d = Math.round((x - q.x0) / this.ppf);
      s.righe = structuredClone(q.righe0);
      const r = s.righe.find((z) => z.id === q.id);
      if (!r) return;
      const [min, max] = limitiRiga(s, r.id);
      if (q.lato === 'corpo' && this.selSott.size > 1 && this.selSott.has(r.id)) {
        // più righe scelte: si spostano tutte insieme, senza entrare in quelle non scelte
        const scelte = s.righe.filter((z) => this.selSott.has(z.id));
        const altre = s.righe.filter((z) => !this.selSott.has(z.id));
        if (modi.snap) { const sa = this.aggancia(r.da + d, new Set()); if (this.snapLinea !== null) d = sa - r.da; }
        let dMin = -Math.min(...scelte.map((z) => z.da)), dMax = Infinity;
        for (const z of scelte) {
          for (const o of altre) {
            if (o.a <= z.da) dMin = Math.max(dMin, o.a - z.da);
            if (o.da >= z.a) dMax = Math.min(dMax, o.da - z.a);
          }
        }
        d = Math.max(dMin, Math.min(dMax, d));
        for (const z of scelte) { z.da += d; z.a += d; }
      } else if (q.lato === 'corpo') {
        // col bordo che si aggancia ai tagli e al cursore
        if (modi.snap) { const sa = this.aggancia(r.da + d, new Set()); if (this.snapLinea !== null) d = sa - r.da; else { const sb = this.aggancia(r.a + d, new Set()); if (this.snapLinea !== null) d = sb - r.a; } }
        const len = r.a - r.da;
        const da = Math.max(min, Math.min(max === Infinity ? Infinity : max - len, r.da + d));
        r.da = Math.max(0, da); r.a = r.da + len;
      } else {
        let f = (q.lato === 'in' ? r.da : r.a) + d;
        if (modi.snap) f = this.aggancia(f, new Set());
        bordoRiga(s, r.id, q.lato === 'in' ? 'da' : 'a', f);
        store.setHead(q.lato === 'in' ? r.da : Math.max(r.da, r.a - 1));
      }
      if (d) q.mosso = true;
      store.liveChange();
      return;
    }
    if (q.tipo === 'sposta') {
      let df = Math.round((x - q.x0) / this.ppf);
      const moving = q.base.filter((c) => q.ids.has(c.id));
      const a = Math.min(...moving.map((c) => c.start)), b = Math.max(...moving.map((c) => end(c)));
      // calamita sui due bordi del gruppo
      if (modi.snap) {
        const sa = this.aggancia(a + df, q.ids);
        if (this.snapLinea !== null) df = sa - a;
        else { const sb = this.aggancia(b + df, q.ids); if (this.snapLinea !== null) df = sb - b; }
      }
      // un blocchetto FX da solo si attacca ai bordi della traccia su cui sta andando: centrato sul taglio,
      // all'inizio o alla fine della clip (le transizioni solo centrate sul taglio)
      if (modi.snap && moving.length === 1 && moving[0].kind === 'fx') {
        const b0 = moving[0];
        const sotto = this.righe(p).find((r) => y >= r.y && y < r.y + r.h);
        const tk = sotto?.t.kind === 'video' ? sotto.t.id : b0.track;
        const aggancio = this.agganciaBlocco(p, b0, b0.start + df, tk);
        if (aggancio) { df = aggancio.start - b0.start; this.snapLinea = aggancio.f; }
      }
      // tracce: quante righe si è scesi o saliti
      const righe = this.righe(p).filter((r) => r.t.kind === q.kind);
      const riga0 = righe.findIndex((r) => r.t.id === q.ancora.track);
      const sotto = righe.findIndex((r) => y >= r.y && y < r.y + r.h);
      let dt = sotto >= 0 && riga0 >= 0 ? sotto - riga0 : q.dt;
      if (sotto < 0) {
        const tutte = this.righe(p);
        const r2 = tutte.find((r) => y >= r.y && y < r.y + r.h);
        if (!r2) dt = y < RIGHELLO + 20 ? -riga0 : righe.length - 1 - riga0; else dt = q.dt;
      }
      // "tutto da qui" si muove solo nel tempo
      if (q.tutto) dt = 0;
      if (df === q.df && dt === q.dt) return;
      p.clips = structuredClone(q.base);
      // niente viene coperto: se lì c'è una clip, questa si ferma attaccata (o salta nel primo buco che la contiene)
      const fatto = M.moveClips(p, q.ids, df, dt, q.kind, modi.inserisci ? 'insert' : 'libero');
      q.df = df; q.dt = dt;
      if (fatto.df !== df && !modi.inserisci) this.snapLinea = null;
      store.liveChange();
      return;
    }
    if (q.tipo === 'trim') {
      let d = Math.round((x - q.x0) / this.ppf);
      const c0 = q.base.find((c) => c.id === q.id)!;
      const bordo = q.edge === 'in' ? c0.start : end(c0);
      if (modi.snap) { const s = this.aggancia(bordo + d, M.withLinked(p, [q.id])); if (this.snapLinea !== null) d = s - bordo; }
      if (d === q.d) return;
      p.clips = structuredClone(q.base);
      q.d = M.trimClip(p, q.id, q.edge, d, { ripple: q.ripple, linked: q.linked });
      store.liveChange();
      this.mostraTrim(q.id, q.edge);
      return;
    }
    if (q.tipo === 'roll') {
      let d = Math.round((x - q.x0) / this.ppf);
      const l0 = q.base.find((c) => c.id === q.l)!;
      if (modi.snap) { const s = this.aggancia(end(l0) + d, new Set([q.l, q.r])); if (this.snapLinea !== null) d = s - end(l0); }
      p.clips = structuredClone(q.base);
      q.d = M.rollEdit(p, q.l, q.r, d);
      store.liveChange();
      return;
    }
    if (q.tipo === 'slip') {
      const d = -Math.round((x - q.x0) / this.ppf);
      if (d === q.d) return;
      p.clips = structuredClone(q.base);
      M.slipClip(p, q.ids, d);
      q.d = d;
      store.liveChange();
      // durante lo slip il Player mostra il nuovo primo fotogramma
      const c = p.clips.find((x2) => q.ids.has(x2.id) && x2.media);
      if (c?.media) { motore.caricaPlayer(c.media, c.srcIn); }
      return;
    }
    if (q.tipo === 'volume') {
      const c = p.clips.find((x2) => x2.id === q.id)!;
      const riga = this.righe(p).find((r) => r.t.id === c.track)!;
      const g = this.geo(riga.y, riga.h);
      const d = this.dbY(y, g.corpoY, g.corpoH) - this.dbY(q.y0, g.corpoY, g.corpoH);
      if (!d && !q.mosso) return;
      q.mosso = true;
      if (!q.seg) { c.gain = clamp(q.gain0 + d, -60, DB_MAX); if (c.gain < DB_MIN) c.gain = -60; }
      else for (const i of new Set(q.seg)) c.gainKeys[i].v = clamp(q.keys0[i].v + d, DB_MIN, DB_MAX);
      store.liveChange();
      const v = q.seg ? c.gainKeys[q.seg[0]].v : c.gain;
      avvisoValore(v <= -60 ? 'Volume: muto' : `Volume ${v > 0 ? '+' : ''}${v} dB`);
      return;
    }
    if (q.tipo === 'fade' && q.curva) {
      // su = sale subito (k verso +1), giù = parte piano piano (k verso −1): come piegare un filo
      const c = p.clips.find((x2) => x2.id === q.id)!;
      const k = Math.round(clamp(q.curva.k0 - (y - q.curva.y0) / 55, -1, 1) * 20) / 20;
      const cv = { k, ...(q.curva.s ? { s: true } : {}) };
      const prima = q.lato === 'in' ? c.curvaIn : c.curvaOut;
      if (prima?.k === cv.k && !!prima?.s === !!cv.s) return;
      if (q.lato === 'in') c.curvaIn = cv; else c.curvaOut = cv;
      q.mosso = true;
      store.liveChange();
      avvisoValore(`${q.lato === 'in' ? 'Entra' : 'Esce'}: ${nomeCurva(cv)}`);
      return;
    }
    if (q.tipo === 'fade') {
      const c = p.clips.find((x2) => x2.id === q.id)!;
      const f = Math.round(this.xF(x));
      const v = q.lato === 'in' ? clamp(f - c.start, 0, c.len - c.fadeOut) : clamp(end(c) - f, 0, c.len - c.fadeIn);
      if (q.lato === 'in') { if (v === c.fadeIn) return; c.fadeIn = v; } else { if (v === c.fadeOut) return; c.fadeOut = v; }
      q.mosso = true;
      store.liveChange();
      avvisoValore(`${q.lato === 'in' ? 'Entra' : 'Esce'} in ${(v / fps(p.rate)).toFixed(2).replace('.', ',')} s`);
      return;
    }
    if (q.tipo === 'elastico') {
      const c = p.clips.find((x2) => x2.id === q.id)!;
      const t = trackOf(p, c.track);
      const riga = this.righe(p).find((r) => r.t.id === t.id)!;
      const { corpoY: cy, corpoH: ch } = this.geo(riga.y, riga.h);
      const video = t.kind === 'video';
      const val = video ? clamp(1 - (y - cy) / ch, 0, 1) : Math.round((clamp(1 - (y - cy) / ch, 0, 1) * 52 - 40) * 2) / 2;
      const keys = video ? c.opKeys : c.gainKeys;
      const k = keys[q.key];
      if (!k) return;
      const lf = clamp(Math.round(this.xF(x) - c.start), q.key > 0 ? keys[q.key - 1].f + 1 : 0, q.key < keys.length - 1 ? keys[q.key + 1].f - 1 : c.len);
      if (k.f !== lf || k.v !== val) q.mosso = true;
      k.f = lf;
      k.v = val;
      store.liveChange();
      avvisoValore(video ? `Opacità ${Math.round(val * 100)}%` : `Volume ${val > 0 ? '+' : ''}${val} dB`);
    }
  }

  private mostraTrim(id: string, edge: 'in' | 'out') {
    const c = clipById(store.doc, id);
    if (!c) return;
    // durante il trim il monitor segue il bordo che si muove
    const f = edge === 'in' ? c.start : end(c) - 1;
    store.setHead(f);
  }

  private presaElastico(e: PointerEvent, c: Colpo, x: number, y: number, etichetta = 'Linea elastica') {
    const clip = c.clip!;
    const p = store.doc;
    const t = trackOf(p, clip.track);
    const video = t.kind === 'video';
    const riga = this.righe(p).find((r) => r.t.id === t.id)!;
    const { corpoY: cy, corpoH: ch } = this.geo(riga.y, riga.h);
    if (y < cy) { store.select(M.withLinked(p, [clip.id])); return; }
    store.begin(etichetta);
    const cc = p.clips.find((x2) => x2.id === clip.id)!;
    const keys = video ? cc.opKeys : cc.gainKeys;
    const base = video ? cc.opacity : cc.gain;
    const lf = Math.round(this.xF(x) - cc.start);
    const vy = (v: number) => video ? cy + ch - v * ch : cy + ch - ((clamp(v, -40, 12) + 40) / 52) * ch;
    // punto esistente vicino?
    let idx = keys.findIndex((k) => Math.abs(this.fX(cc.start + k.f) - x) < 7 && Math.abs(vy(k.v) - y) < 8);
    if (e.altKey) {
      if (idx >= 0) { keys.splice(idx, 1); store.commit(true); }
      else store.commit(false);
      return;
    }
    const creato = idx < 0;
    if (idx < 0) {
      if (!keys.length) {
        keys.push({ f: 0, v: base }, { f: cc.len, v: base });
      }
      const v = keyValue(keys, lf, base);
      keys.push({ f: lf, v });
      keys.sort((a, b) => a.f - b.f);
      idx = keys.findIndex((k) => k.f === lf);
    }
    store.select(M.withLinked(p, [clip.id]));
    this.presa = { tipo: 'elastico', id: clip.id, key: idx, base: [], creato, mosso: false };
    store.liveChange();
  }

  /** si prende la linea del volume: un clic sulla linea mette un punto e lo si porta dove serve (su/giù e di lato),
   *  un clic su un punto lo sposta; con Maiusc si alza o si abbassa tutto il tratto sotto il puntatore (senza punti, tutta la clip) */
  private presaVolume(e: PointerEvent, c: Colpo) {
    const p = store.doc;
    const clip = c.clip!;
    if (e.altKey && c.punto !== undefined) {
      store.edit('Togli punto del volume', (pp) => { clipById(pp, clip.id)!.gainKeys.splice(c.punto!, 1); });
      return;
    }
    const r = this.cv.getBoundingClientRect();
    if (!e.shiftKey) { this.presaElastico(e, c, e.clientX - r.left, e.clientY - r.top, 'Punto del volume'); this.puntoNuovoA = performance.now(); return; }
    if (!store.sel.has(clip.id)) store.select(M.withLinked(p, [clip.id]));
    const keys = clip.gainKeys;
    let seg: [number, number] | null = null;
    if (c.punto !== undefined) seg = [c.punto, c.punto];
    else if (keys.length) {
      const lf = c.f - clip.start;
      const i = keys.findIndex((k) => k.f > lf);
      seg = i <= 0 ? [0, 0] : i === -1 ? [keys.length - 1, keys.length - 1] : [i - 1, i];
    }
    const y = e.clientY - r.top;
    store.begin('Volume');
    this.presa = { tipo: 'volume', id: clip.id, y0: y, gain0: clip.gain, keys0: structuredClone(keys), seg, mosso: false };
  }
  /** quando è nato l'ultimo punto del volume (il doppio clic non deve toglierlo subito) */
  private puntoNuovoA = 0;

  /** che blocco porta il trascinamento: 'x:e:flash', 'x:t:dve:301' (e il vecchio 't:mix:0') */
  private specBlocco(dato: string): { tipo: 'effetto' | 'transizione'; id: string } {
    if (dato.startsWith('t:')) { const [tipo, pat] = dato.slice(2).split(':'); return { tipo: 'transizione', id: tipo === 'mix' || tipo === 'dip' ? tipo : `${tipo}:${pat}` }; }
    const [, t, ...resto] = dato.split(':');
    return { tipo: t === 't' ? 'transizione' : 'effetto', id: resto.join(':') };
  }

  /** dove cadrebbe il blocchetto lasciato qui: sulla traccia video sotto il puntatore (o la più in alto con una
   *  clip lì), attaccato al bordo più vicino: centrato sul taglio, all'inizio o alla fine della clip */
  private anteprimaBlocco(x: number, y: number, dato: string) {
    const p = store.doc;
    const { tipo, id } = this.specBlocco(dato);
    const len = durataBlocco(p, tipo, id, modi.durataFx);
    const f = this.xF(x);
    const riga = this.righe(p).find((r) => y >= r.y && y < r.y + r.h);
    const track = riga?.t.kind === 'video' ? riga.t.id : tracciaPerBlocco(p, f, tipo === 'transizione' && tagliFra(p, f - 16 / this.ppf, f + 16 / this.ppf).length > 0);
    const { start, taglio, dove } = postoBlocco(p, tipo, f, len, 16 / this.ppf, track);
    // sullo stesso taglio le transizioni si sommano (la nuova si mette sopra, stessa durata); la stessa c'è già
    const tutte = tipo === 'transizione' && taglio ? transizioniSul(p, taglio) : [];
    const uguale = tutte.find((c) => c.fxb!.id === id);
    if (uguale) return { track: uguale.track, start: uguale.start, len: uguale.len, tipo, taglio, dove, nome: nomeBlocco(uguale.fxb!) + ' (c\'è già)', gia: uguale.id };
    if (tutte.length) return { track: tutte[0].track, start: tutte[0].start, len: tutte[0].len, tipo, taglio, dove, nome: nomeBlocco(nuovoBlocco(tipo, id)) + ' + ' + tutte.map((c) => nomeBlocco(c.fxb!)).join(' + '), gia: undefined as string | undefined };
    return { track, start, len, tipo, taglio, dove, nome: nomeBlocco(nuovoBlocco(tipo, id)), gia: undefined as string | undefined };
  }

  /** un blocchetto che si sposta si attacca ai bordi vicini della traccia: inizio o fine sul bordo, o centro sul taglio */
  private agganciaBlocco(p: Project, b: Clip, start: number, track: string): { start: number; f: number } | null {
    const soglia = 12 / this.ppf;
    const tr = b.fxb?.tipo === 'transizione';
    let best: { start: number; f: number } | null = null, bd = soglia;
    for (const tg of tagliFra(p, start - soglia, start + b.len + soglia, track)) {
      const prove: [number, number][] = [[tg.f - b.len / 2, Math.abs(start + b.len / 2 - tg.f) * (tg.a && tg.b ? 0.8 : 1.2)]];
      if (!tr || !(tg.a && tg.b)) prove.push([tg.f, Math.abs(start - tg.f)], [tg.f - b.len, Math.abs(start + b.len - tg.f)]);
      for (const [st, d] of prove) if (d < bd) { bd = d; best = { start: Math.max(0, Math.round(st)), f: tg.f }; }
    }
    return best;
  }

  /** l'altoparlante del blocchetto: acceso/spento (acceso = lo fa sentire subito) */
  alternaSuono(id: string) {
    const c = clipById(store.doc, id);
    const so = c && sonoro(c);
    if (!c || !so?.suono) return;
    const on = !so.audio;
    store.edit(on ? 'Suono acceso' : 'Suono spento', (pp) => { sonoroScrivi(clipById(pp, id)!).audio = on; });
    if (on) ascoltaSuono(so.suono, so.volume ?? 0);
    avviso(`${on ? '🔊' : '🔇'} ${suono(so.suono)?.nome ?? 'Suono'} ${on ? 'acceso' : 'spento'} su ${c.fxb ? nomeBlocco(c.fxb) : c.name}`, 'tasto', 1200);
  }

  /** la clip su cui cade un effetto (se l'effetto è audio e la clip è video, la sua audio legata) */
  private clipDrop(x: number, y: number, id: string): Clip | null {
    const p = store.doc;
    const c = this.colpo(x, y).clip;
    const e = effetto(id);
    if (!c || !e) return null;
    // sopra un blocchetto FX: vale la clip che ci sta sotto
    if (c.kind === 'fx') {
      const f = this.xF(x);
      const sotto = p.clips.find((z) => z.track === c.track && z.kind !== 'fx' && z.start <= f && end(z) > f);
      return sotto && adatte(e, [sotto]).length ? sotto : null;
    }
    if (adatte(e, [c]).length) return c;
    const altra = [...M.withLinked(p, [c.id])].map((i) => clipById(p, i)!).find((z) => adatte(e, [z]).length);
    return altra ?? null;
  }

  /** fade in, fade out e incrocio lasciati su una clip audio: si mettono (con la durata scelta nel contenitore) */
  private dissolvenzaAudio(id: 'fadeIn' | 'fadeOut' | 'incrocio', c: Clip, f: number) {
    const p = store.doc;
    const r = fps(p.rate);
    const n = Math.max(1, Math.round((modi.durataFx || 1) * r));
    if (id === 'incrocio') {
      // il taglio più vicino sulla stessa traccia: la clip di destra si incrocia con quella di sinistra
      const prima = p.clips.find((z) => z.track === c.track && z.id !== c.id && end(z) === c.start);
      const dopo = p.clips.find((z) => z.track === c.track && z.id !== c.id && z.start === end(c));
      const destra = prima && (!dopo || Math.abs(f - c.start) <= Math.abs(f - end(c))) ? c : dopo;
      if (!destra) { avviso('L\'incrocio va sul taglio fra due clip audio attaccate', 'info', 2200); return; }
      store.edit('Incrocio audio', (pp) => { const z = clipById(pp, destra.id)!; z.trIn = newTransition('mix', Math.min(n, z.len)); });
      store.select([destra.id]);
      avviso(`🔀 Incrocio di ${(Math.min(n, destra.len) / r).toFixed(1).replace('.', ',')} s sul taglio`, 'tasto', 1400);
      return;
    }
    store.edit(id === 'fadeIn' ? 'Fade in' : 'Fade out', (pp) => {
      const z = clipById(pp, c.id)!;
      if (id === 'fadeIn') z.fadeIn = Math.min(n, z.len - z.fadeOut); else z.fadeOut = Math.min(n, z.len - z.fadeIn);
    });
    store.select([c.id]);
    avviso(`${id === 'fadeIn' ? '◢ Fade in' : '◣ Fade out'} di ${(Math.min(n, c.len) / r).toFixed(1).replace('.', ',')} s`, 'tasto', 1400);
  }

  private selezionaRiquadro(q: Extract<Presa, { tipo: 'riquadro' }>) {
    const p = store.doc;
    const x0 = Math.min(q.x0, q.x1), x1 = Math.max(q.x0, q.x1), y0 = Math.min(q.y0, q.y1), y1 = Math.max(q.y0, q.y1);
    if (x1 - x0 < 3 && y1 - y0 < 3) {
      // è stato un clic nel vuoto: cursore lì
      motore.setMonitor('recorder');
      store.setHead(Math.max(0, Math.round(this.xF(q.x0))));
      return;
    }
    const f0 = this.xF(x0), f1 = this.xF(x1);
    const righe = this.righe(p).filter((r) => r.y + r.h > y0 && r.y < y1).map((r) => r.t.id);
    const ids = p.clips.filter((c) => righe.includes(c.track) && end(c) > f0 && c.start < f1).map((c) => c.id);
    // anche le righe dei sottotitoli, se il riquadro passa sulla riga SOTT
    const rs = this.rigaSott;
    if (!q.add) this.selSott.clear();
    if (rs && rs.y + rs.h > y0 && rs.y < y1) for (const r of p.sottotitoli?.righe ?? []) if (r.a > f0 && r.da < f1) this.selSott.add(r.id);
    store.select(ids, q.add);
    this.sporca();
  }

  private anteprimaDrop(x: number, y: number, dato: string) {
    const p = store.doc;
    const f = Math.max(0, Math.round(this.xF(x)));
    const riga = this.righe(p).find((r) => y >= r.y && y < r.y + r.h);
    if (dato.startsWith('m:')) {
      const lista = this.mediaDaDato(dato);
      if (!lista.length) return null;
      const out: { track: string; f: number; len: number; kind: 'video' | 'audio'; nuova?: boolean }[] = [];
      // prova a secco: dove finirebbe davvero (una traccia libera, o una nuova) senza toccare il progetto
      const prova = { ...p, tracks: p.tracks.slice() } as Project;
      let a0 = this.fDrop(x, y, this.lenDiMedia(lista[0]), riga?.t);
      for (const m of lista) {
        const len = this.lenDiMedia(m);
        const tg = this.bersagliDrop(riga?.t, m.hasVideo, m.hasAudio);
        const dove = (kind: 'video' | 'audio', pref: string, evita?: Set<string>) => {
          const id = modi.inserisci ? pref : M.tracciaLibera(prova, kind, pref, a0, a0 + len, undefined, evita);
          return p.tracks.some((t) => t.id === id) ? { track: id, nuova: false } : { track: pref, nuova: true };
        };
        if (tg.video) out.push({ ...dove('video', tg.video), f: a0, len, kind: 'video' });
        const usate = new Set<string>();
        for (const a of tg.audio) { const d = dove('audio', a, usate); usate.add(d.track); out.push({ ...d, f: a0, len, kind: 'audio' }); }
        a0 += len;
      }
      return out;
    }
    return riga ? [{ track: riga.t.id, f, len: Math.round(fps(p.rate) * 5), kind: riga.t.kind }] : null;
  }

  private bersagliDrop(t: Track | undefined, v: boolean, a: boolean): M.Targets {
    const p = store.doc;
    const vts = p.tracks.filter((x) => x.kind === 'video' && !x.lock);
    const ats = p.tracks.filter((x) => x.kind === 'audio' && !x.lock);
    let video: string | null = null, audio: string[] = [];
    if (v) video = t?.kind === 'video' && !t.lock ? t.id : vts[vts.length - 1]?.id ?? null;
    if (a) {
      const i = t?.kind === 'audio' ? ats.findIndex((x) => x.id === t.id) : 0;
      audio = ats.slice(Math.max(0, i), Math.max(0, i) + 1).map((x) => x.id);
      if (!audio.length && ats.length) audio = [ats[0].id];
    }
    return { video, audio };
  }

  /** i file di un trascinamento 'm:id1|id2|…' (quelli che esistono ancora) */
  private mediaDaDato(dato: string): MediaItem[] {
    const p = store.doc;
    return dato.slice(2).split('|').map((id) => p.media.find((z) => z.id === id)).filter((m): m is MediaItem => !!m);
  }

  private lenDiMedia(m: MediaItem): number {
    const r = fps(store.doc.rate);
    return Math.max(1, m.type === 'image' ? Math.round(r * 5) : Math.round(((m.markOut ?? m.duration) - (m.markIn ?? m.t0 ?? 0)) * r));
  }

  /**
   * Dove parte un file lasciato in x: l'aggancio è più largo di quello delle clip (14 px) e preferisce la fine di una clip
   * della traccia sotto il puntatore: se lo lasci sulla seconda metà di una clip, si mette subito dopo di lei.
   * Vale uguale per l'anteprima (il fantasma) e per quando lasci, così quello che vedi è quello che succede.
   */
  private fDrop(x: number, y: number, len: number, t?: Track): number {
    const p = store.doc;
    const f = Math.max(0, Math.round(this.xF(x)));
    if (!modi.snap) { this.snapLinea = null; return f; }
    const soglia = 14 / this.ppf;
    let best = f, bd = soglia;
    const prova = (punto: number, d: number, preferito: boolean) => {
      const dd = preferito ? d * 0.5 : d;
      if (dd < bd) { bd = dd; best = punto; }
    };
    // le clip della traccia sotto il puntatore: dopo di lei se sei nella seconda metà
    const stessa = t ? p.clips.filter((c) => c.track === t.id && c.kind !== 'fx') : [];
    const dentro = stessa.find((c) => f > c.start && f < end(c));
    if (dentro && f >= dentro.start + dentro.len / 2) { this.snapLinea = end(dentro); return end(dentro); }
    for (const c of stessa) prova(end(c), Math.abs(end(c) - f), true);
    for (const s of M.snapPoints(p, new Set(), [Math.round(store.head)])) {
      prova(s, Math.abs(s - f), false);
      // anche la fine del file che arriva può appoggiarsi all'inizio di una clip
      prova(s - len, Math.abs(s - len - f), false);
    }
    best = Math.max(0, best);
    this.snapLinea = best !== f ? best : null;
    return best;
  }

  private rilascia(dato: string, x: number, y: number) {
    const p = store.doc;
    const f = Math.max(0, Math.round(this.xF(x)));
    const riga = this.righe(p).find((r) => y >= r.y && y < r.y + r.h);
    if (dato.startsWith('m:')) {
      const lista = this.mediaDaDato(dato);
      if (!lista.length) return;
      const fx = this.fDrop(x, y, this.lenDiMedia(lista[0]), riga?.t);
      this.snapLinea = null;
      const n0 = store.doc.tracks.length;
      // più file: uno dopo l'altro, a partire da dove li lasci
      const ids = store.edit(lista.length > 1 ? `Metti ${lista.length} file nella timeline` : 'Metti nella timeline', (pp) => {
        const tutti: string[] = [];
        let a0 = fx;
        for (const m of lista) {
          const srcIn = m.markIn ?? m.t0 ?? 0;
          const srcOut = m.markOut ?? (m.type === 'image' ? srcIn + 5 : m.duration);
          const tg = this.bersagliDrop(riga?.t, m.hasVideo, m.hasAudio);
          const nuovi = M.placeSource(pp, { mediaId: m.id, srcIn, srcOut }, a0, null, tg, modi.inserisci ? 'insert' : 'libero');
          tutti.push(...nuovi);
          // il prossimo parte dove finisce questo (il più lungo fra video e audio che ha creato)
          const fine = Math.max(a0 + 1, ...nuovi.map((id) => { const c = clipById(pp, id); return c ? end(c) : 0; }));
          a0 = fine;
        }
        return tutti;
      });
      store.select(ids);
      const nome = lista.length > 1 ? `${lista.length} file` : lista[0].name;
      avviso(store.doc.tracks.length > n0 ? `${nome}: lì era occupato, ho usato una traccia nuova` : `${nome} nella timeline`, 'ok', 1600);
    } else if (dato.startsWith('g:')) {
      const g = leggiGeneratore(dato);
      inserisciGeneratore(g.kind, f, riga?.t.kind === 'video' ? riga.t.id : undefined, { titolo: g.titolo, conto: g.conto, anim: g.anim, html: g.html });
    } else if (dato.startsWith('x:') || dato.startsWith('t:')) {
      const { tipo, id } = this.specBlocco(dato);
      const g = this.anteprimaBlocco(x, y, dato);
      if (g.gia) {
        store.edit('Cambia transizione', (pp) => { const c = clipById(pp, g.gia!)!; c.fxb = cambiaModello(c.fxb!, id); c.name = nomeBlocco(c.fxb); });
        store.select([g.gia]);
        avviso(`✦ ${nomeBlocco(clipById(store.doc, g.gia)!.fxb!)} sul taglio`, 'tasto', 1400);
        return;
      }
      const b = store.edit(tipo === 'effetto' ? 'Effetto a tempo' : 'Transizione', (pp) => posaBlocco(pp, bloccoNuovo(tipo, id), g.start, g.len, g.track));
      store.select([b.id]);
      const sec = (g.len / fps(p.rate)).toFixed(1).replace('.', ',').replace(',0', '');
      const dove = g.dove === 'taglio' ? ' sul taglio' : g.dove === 'inizio' ? ' all\'inizio della clip' : g.dove === 'fine' ? ' alla fine della clip' : tipo === 'transizione' ? ' · mettila sopra un taglio per farla lavorare' : '';
      avviso(`${tipo === 'effetto' ? '⚡' : '✦'} ${nomeBlocco(b.fxb!)} · ${sec} s${dove}`, g.taglio || tipo === 'effetto' ? 'tasto' : 'info', 1800);
    } else if (dato === 's:riga') {
      // una riga di sottotitolo nel punto lasciato: poi si scrive il testo
      this.mostraSott = true;
      void import('./sottotitoliRapidi').then((m) => m.nuovaRigaQui(f));
    } else if (dato === 's:ai') {
      // i sottotitoli con l'AI: su una clip scrivono quelli della clip, altrove quelli di tutto il montaggio
      const c = this.colpo(x, y).clip;
      const ids = c?.media ? [c.id] : undefined;
      void import('./sottotitoliRapidi').then((m) => m.generaSottotitoli(ids));
    } else if (dato.startsWith('e:')) {
      const c = this.clipDrop(x, y, dato.slice(2));
      if (!c) { avviso('Lascia l\'effetto sopra una clip adatta', 'info'); return; }
      const id = dato.slice(2);
      if (id === 'fadeIn' || id === 'fadeOut' || id === 'incrocio') { this.dissolvenzaAudio(id, c, this.xF(x)); return; }
      store.select(M.withLinked(store.doc, [c.id]));
      alternaEffetto(dato.slice(2), [c.id]);
    }
  }

  /** tasto destro su una dissolvenza: la forma (e la durata) */
  private menuDissolvenza(x: number, y: number, clip: Clip, lato: 'in' | 'out') {
    const r = fps(store.doc.rate);
    const cv = lato === 'in' ? clip.curvaIn : clip.curvaOut;
    const n = lato === 'in' ? clip.fadeIn : clip.fadeOut;
    const cambia = (label: string, fn: (c: Clip) => void) => store.edit(label, (p) => fn(clipById(p, clip.id)!));
    const uguale = (a?: { k: number; s?: boolean }, b?: { k: number; s?: boolean }) => Math.abs((a?.k ?? 0) - (b?.k ?? 0)) < 0.04 && !!a?.s === !!b?.s;
    const lunga = (sec: number) => cambia('Durata della dissolvenza', (c) => {
      const f = Math.min(Math.round(sec * r), c.len - (lato === 'in' ? c.fadeOut : c.fadeIn));
      if (lato === 'in') c.fadeIn = f; else c.fadeOut = f;
    });
    menuContesto(x, y, [
      ...CURVE.map((k) => ({
        nome: k.nome, spunta: uguale(cv, k.cv),
        fn: () => cambia('Forma della dissolvenza', (c) => {
          const nuova = k.cv.k || k.cv.s ? { ...k.cv } : undefined;
          if (lato === 'in') c.curvaIn = nuova; else c.curvaOut = nuova;
          // una forma senza dissolvenza non si sente: se non c'è, ne mette una di un secondo
          if (!(lato === 'in' ? c.fadeIn : c.fadeOut)) { if (lato === 'in') c.fadeIn = Math.min(Math.round(r), c.len - c.fadeOut); else c.fadeOut = Math.min(Math.round(r), c.len - c.fadeIn); }
        }),
      })),
      { sep: true },
      ...[0.5, 1, 2, 4].map((sec) => ({ nome: `Lunga ${String(sec).replace('.', ',')} s`, spunta: n === Math.round(sec * r), fn: () => lunga(sec) })),
      { nome: 'Togli la dissolvenza', disattiva: !n, fn: () => lunga(0) },
    ]);
  }

  private menu(x: number, y: number, c: Colpo) {
    const voci: VoceMenu[] = [];
    const f = Math.round(c.f);
    if (c.clip) {
      const clip = c.clip;
      const t = trackOf(store.doc, clip.track);
      const dentro = f > clip.start && f < end(clip);
      if (clip.kind === 'fx') { this.menuBlocco(x, y, clip); return; }
      // le transizioni sono blocchetti sopra il bordo scelto (sulla traccia video della clip)
      const vt = isVideoClip(clip) ? clip.track : [...M.withLinked(store.doc, [clip.id])].map((id) => clipById(store.doc, id)!).find((z) => isVideoClip(z))?.track;
      const trVoci = (lato: 'in' | 'out'): VoceMenu[] => {
        const bordo = lato === 'in' ? clip.start : end(clip);
        const metti = (id: string) => { store.select([]); mettiBlocco('transizione', id, bordo, vt); };
        const tg0 = taglioVicino(store.doc, bordo, 1, vt);
        const gia = tg0 ? transizioneSul(store.doc, tg0) : undefined;
        return [
          { nome: 'Dissolvenza incrociata', fn: () => metti('mix') },
          { nome: 'Passaggio al nero', fn: () => metti('dip') },
          { nome: 'Tendina orizzontale', fn: () => metti('wipe:1') },
          { nome: 'Spinta', fn: () => metti('dve:301') },
          { nome: 'Zoom incrociato', fn: () => metti('dve:321') },
          { nome: 'Lampo', fn: () => metti('dve:351') },
          { nome: 'Cubo 3D', fn: () => metti('dve:401') },
          { sep: true },
          { nome: 'Togli', disattiva: !gia, fn: () => store.edit('Togli transizione', (p) => { p.clips = p.clips.filter((z) => z.id !== gia!.id); }) },
        ];
      };
      const fxVoci: VoceMenu[] = EFFETTI_TEMPO.filter((e) => ['flash', 'scossa', 'zoomColpo', 'glitch', 'dalNero', 'alNero', 'zoomLento', 'camera'].includes(e.id))
        .map((e) => ({ nome: e.nome, fn: () => { store.select([]); const lb = durataBlocco(store.doc, 'effetto', e.id, modi.durataFx); mettiBlocco('effetto', e.id, f, vt, e.id === 'alNero' ? Math.max(clip.start, end(clip) - lb) : e.id === 'dalNero' ? clip.start : undefined); } }));
      voci.push(
        { nome: 'Taglia qui', tasto: '1', fn: () => { motore.vaiA(f); esegui('taglia'); } },
        { nome: 'Elimina', tasto: '2', fn: () => esegui('elimina') },
        { nome: 'Elimina e chiudi il buco', tasto: '3', fn: () => esegui('eliminaChiudi') },
        { nome: '⇤ Elimina lo scarto a sinistra di qui', tasto: 'Q', disattiva: !dentro, fn: () => eliminaLato('sinistra', f, clip) },
        { nome: '⇥ Elimina lo scarto a destra di qui', tasto: 'W', disattiva: !dentro, fn: () => eliminaLato('destra', f, clip) },
        { nome: clip.link && [...store.sel].every((id) => clipById(store.doc, id)?.link === clip.link) ? 'Separa (audio e video per conto loro)' : 'Unisci le selezionate in un gruppo', tasto: 'S', fn: () => esegui('separa') },
        { nome: '🧩 Rendi clip unica (tutte le scelte in una clip sola)', tasto: 'Ctrl+Alt+U', fn: () => esegui('clipUnica') },
        { nome: '📝 Genera i sottotitoli di questa clip (AI)', fn: () => { const ids = store.sel.has(clip.id) ? [...store.sel] : [clip.id]; void import('./sottotitoliRapidi').then((m) => m.generaSottotitoli(ids)); } },
        { sep: true },
        { nome: 'Transizione all\'inizio', sotto: trVoci('in') },
        { nome: 'Transizione alla fine', sotto: trVoci('out') },
        { nome: 'Effetto a tempo qui', sotto: fxVoci },
        { nome: 'Effetti al volo', sotto: (isVideoClip(clip) ? EFFETTI_VIDEO : EFFETTI_AUDIO).map((e) => ({ nome: e.nome, spunta: e.acceso(clip, store.doc), disattiva: !adatte(e, [clip]).length, fn: () => alternaEffetto(e.id, M.withLinked(store.doc, [clip.id])) })) },
        { nome: 'Dissolvenza in apertura/chiusura', tasto: '8', fn: () => esegui('dissolviInOut') },
        {
          nome: `Velocità${clip.speed && clip.speed !== 1 ? ' · ' + etichettaVelocita(clip.speed) : ''}`, tasto: 'Alt+E', disattiva: !M.conVelocita(store.doc, clip),
          sotto: [
            ...[0.25, 0.5, 2, 4].map((x) => ({ nome: x < 1 ? `Rallenta a ${x * 100}%` : `Velocizza a ${x * 100}%`, spunta: clip.speed === x, fn: () => impostaVelocita(M.withLinked(store.doc, store.sel.has(clip.id) ? store.sel : [clip.id]), x) })),
            { nome: 'Velocità normale (100%)', disattiva: !clip.speed || clip.speed === 1, fn: () => impostaVelocita(M.withLinked(store.doc, store.sel.has(clip.id) ? store.sel : [clip.id]), 1) },
            { sep: true },
            { nome: 'Velocità personalizzata…', fn: () => finestraVelocita(M.withLinked(store.doc, store.sel.has(clip.id) ? store.sel : [clip.id])) },
          ],
        },
      );
      if (this.haVolume(clip, t)) {
        const lf = f - clip.start;
        const buco = (delta: number) => store.edit(delta < 0 ? 'Abbassa qui' : 'Alza qui', (p) => {
          const cc = clipById(p, clip.id)!;
          const r2 = fps(p.rate);
          const tieni = Math.round(r2 * 2), rampa = Math.round(r2 * 0.3);
          const a = clamp(lf - tieni / 2, 0, cc.len), b = clamp(lf + tieni / 2, 0, cc.len);
          const base = (x: number) => (cc.gainKeys.length ? keyValue(cc.gainKeys, x, cc.gain) : cc.gain);
          const nuovi: Key[] = [
            { f: clamp(a - rampa, 0, cc.len), v: base(a - rampa) }, { f: a, v: clamp(base(a) + delta, DB_MIN, DB_MAX) },
            { f: b, v: clamp(base(b) + delta, DB_MIN, DB_MAX) }, { f: clamp(b + rampa, 0, cc.len), v: base(b + rampa) },
          ];
          const vecchi = cc.gainKeys.length ? cc.gainKeys : [{ f: 0, v: cc.gain }, { f: cc.len, v: cc.gain }];
          cc.gainKeys = vecchi.filter((k) => k.f < nuovi[0].f || k.f > nuovi[3].f).concat(nuovi).sort((x, y) => x.f - y.f)
            .filter((k, i, arr) => i === 0 || k.f !== arr[i - 1].f);
        });
        voci.push({ sep: true },
          { nome: '🔉 Abbassa qui (−12 dB per 2 s)', fn: () => buco(-12) },
          { nome: '🔊 Alza qui (+6 dB per 2 s)', fn: () => buco(6) },
          { nome: 'Volume normale (togli i punti)', disattiva: !clip.gainKeys.length && clip.gain === 0, fn: () => store.edit('Volume normale', (p) => { const cc = clipById(p, clip.id)!; cc.gainKeys = []; cc.gain = 0; }) });
      }
      voci.push(
        ...(vociMenuAudioAI(c.clip).length ? [{ sep: true } as VoceMenu, ...vociMenuAudioAI(c.clip)] : []),
        {
          nome: 'Colore etichetta', sotto: ETICHETTE.map((col, i) => ({ nome: ['Nessuno', 'Verde', 'Giallo', 'Arancio', 'Rosso', 'Viola', 'Ciano', 'Grigio'][i], spunta: c.clip!.label === i, fn: () => store.edit('Etichetta', (p) => { for (const z of p.clips) if (store.sel.has(z.id)) z.label = i; }) })),
        },
        { sep: true },
        { nome: 'Apri la sorgente nel monitor (abbina)', tasto: 'F', disattiva: !c.clip.media, fn: () => { motore.vaiA(f); esegui('abbina'); } },
        { nome: 'Istantanea di questo fotogramma', tasto: 'P', fn: () => { motore.setMonitor('recorder'); motore.vaiA(f); esegui('istantanea'); } },
        { nome: 'Fermo immagine qui', tasto: 'Shift+P', fn: () => { motore.setMonitor('recorder'); motore.vaiA(f); esegui('fermoImmagine'); } },
        { nome: 'Proprietà della clip…', fn: () => document.dispatchEvent(new CustomEvent('dpv:ispettore')) },
      );
    } else {
      voci.push(
        { nome: 'Cursore qui', fn: () => motore.vaiA(f) },
        { nome: 'Incolla qui', tasto: 'Ctrl+V', fn: () => { motore.vaiA(f); esegui('incolla'); } },
        { sep: true },
        { nome: 'Titolo qui', fn: () => { motore.vaiA(f); esegui('genTitolo'); } },
        { nome: 'Barre colore e tono qui', fn: () => { motore.vaiA(f); esegui('genBarre'); } },
        { nome: 'Countdown qui', fn: () => { motore.vaiA(f); esegui('genCountdown'); } },
        { nome: 'Nero qui', fn: () => { motore.vaiA(f); esegui('genNero'); } },
      );
    }
    voci.push({ sep: true }, { nome: 'Marcatore', tasto: 'M', fn: () => { motore.vaiA(f); esegui('marcatore'); } }, { nome: 'Adatta alla finestra', tasto: '\\', fn: () => this.adattaTutto() });
    menuContesto(x, y, voci);
  }

  /** le voci dei suoni di un blocco: passandoci sopra si sentono, clic = quello */
  private vociSuoni(b: Clip): VoceMenu[] {
    const fb = sonoro(b) ?? {};
    const cambia = (label: string, fn: (c: Clip) => void) => store.edit(label, (pp) => fn(clipById(pp, b.id)!));
    return [
      { nome: fb.audio ? '🔇 Spegni il suono' : '🔊 Accendi il suono', disattiva: !fb.suono, fn: () => this.alternaSuono(b.id) },
      { sep: true },
      { nome: 'Nessun suono', spunta: !fb.suono, fn: () => cambia('Suono', (c) => { const s = sonoroScrivi(c); s.suono = undefined; s.audio = false; }) },
      ...SUONI.map((x) => ({
        nome: x.nome, spunta: fb.suono === x.id,
        sopra: () => ascoltaSuono(x.id, fb.volume ?? 0),
        fn: () => { cambia('Suono', (c) => { const s = sonoroScrivi(c); s.suono = x.id; s.audio = true; }); avviso(`🔊 ${x.nome} su ${b.fxb ? nomeBlocco(b.fxb) : b.name}`, 'tasto', 1000); },
      })),
      { sep: true },
      ...([[-12, 'Piano (−12 dB)'], [-6, 'Medio (−6 dB)'], [0, 'Normale'], [4, 'Forte (+4 dB)']] as [number, string][]).map(([v, n]) => ({
        nome: n, spunta: (fb.volume ?? 0) === v, disattiva: !fb.suono,
        sopra: () => { if (fb.suono) ascoltaSuono(fb.suono, v); },
        fn: () => cambia('Volume del suono', (c) => { const s = sonoroScrivi(c); s.volume = v; s.audio = true; }),
      })),
    ];
  }

  /** il menu piccolo dei suoni (tasto destro sull'altoparlante del blocco) */
  menuSuoni(x: number, y: number, b: Clip) {
    if (!store.sel.has(b.id)) store.select([b.id]);
    menuContesto(x, y, this.vociSuoni(b));
  }

  /** tasto destro su un blocchetto FX: durata, sul taglio, cambia, suono, colore, forza */
  private menuBlocco(x: number, y: number, b: Clip) {
    const p = store.doc;
    const r = fps(p.rate);
    const fb = b.fxb!;
    const tr = fb.tipo === 'transizione';
    const cambiaBlocco = (label: string, fn: (c: Clip, pp: Project) => void) => store.edit(label, (pp) => fn(clipById(pp, b.id)!, pp));
    const durata = (sec: number) => store.edit('Durata', (pp) => durataDelBlocco(pp, clipById(pp, b.id)!, sec * r));
    const nome = (sec: number) => (sec < 1 ? sec.toString().replace('.', ',') : String(sec)) + ' s';
    const colori: [string, string][] = [['Bianco', '#ffffff'], ['Nero', '#000000'], ['Oro', '#ffd54a'], ['Rosso', '#ff3040'], ['Azzurro', '#35e8ff']];
    const usaColore = !tr && ['flash', 'lampoNero', 'strobo', 'dalNero', 'alNero', 'dalBianco', 'alBianco'].includes(fb.id);
    const voci: VoceMenu[] = [
      { nome: 'Durata', sotto: [0.25, 0.5, 1, 2, 3, 5, 10].map((sec) => ({ nome: nome(sec), spunta: b.len === Math.round(sec * r), fn: () => durata(sec) })) },
      {
        nome: 'Centra sul taglio più vicino', fn: () => {
          const tg = taglioVicino(store.doc, b.start + b.len / 2, Math.round(r * 5), b.track);
          if (!tg) { avviso('Non c\'è un taglio qui vicino', 'info'); return; }
          cambiaBlocco('Sul taglio', (c) => { c.start = Math.max(0, Math.round(tg.f - c.len / 2)); });
        },
      },
      {
        nome: 'Cambia in', sotto: tr
          ? [{ nome: 'Dissolvenza', id: 'mix' }, { nome: 'Passaggio al nero', id: 'dip' }, ...DVE.map((m) => ({ nome: m.nome, id: 'dve:' + m.p })), ...TENDINE.map((m) => ({ nome: 'Tendina ' + m.nome, id: 'wipe:' + m.p }))]
            .map((v) => ({ nome: v.nome, spunta: fb.id === v.id, fn: () => cambiaBlocco('Cambia transizione', (c) => { c.fxb = cambiaModello(c.fxb!, v.id); c.name = nomeBlocco(c.fxb); }) }))
          : EFFETTI_TEMPO.map((e) => ({ nome: e.nome, spunta: fb.id === e.id, fn: () => cambiaBlocco('Cambia effetto', (c) => { c.fxb = cambiaModello(c.fxb!, e.id); c.name = e.nome; }) })),
      },
      { nome: 'Suono' + (fb.suono ? `: ${suono(fb.suono)?.nome ?? ''}${fb.audio ? '' : ' (spento)'}` : ''), sotto: this.vociSuoni(b) },
    ];
    if (usaColore) voci.push({ nome: 'Colore', sotto: colori.map(([n, col]) => ({ nome: n, spunta: fb.colore === col, fn: () => cambiaBlocco('Colore', (c) => { c.fxb!.colore = col; }) })) });
    if (!tr) voci.push({ nome: 'Forza', sotto: [0.35, 0.6, 1, 1.4].map((k) => ({ nome: Math.round(k * 100) + '%', spunta: Math.abs(fb.forza - k) < 0.01, fn: () => cambiaBlocco('Forza', (c) => { c.fxb!.forza = k; }) })) });
    voci.push(
      { sep: true },
      { nome: 'Ripeti subito dopo', fn: () => { const n = store.edit('Ripeti blocco', (pp) => posaBlocco(pp, fb, end(b), b.len, b.track)); store.select([n.id]); } },
      { nome: 'Elimina', tasto: '2', fn: () => esegui('elimina') },
      { nome: 'Proprietà…', fn: () => document.dispatchEvent(new CustomEvent('dpv:ispettore')) },
    );
    menuContesto(x, y, voci);
  }

  // per il Player: rilascio "a mano" da touch
  inserisciDaPlayer() { montaDalPlayer(modi.inserisci ? 'insert' : 'overwrite'); }
}


let tAvviso = 0;
function avvisoValore(t: string) {
  const now = performance.now();
  if (now - tAvviso < 120) return;
  tAvviso = now;
  avviso(t, 'tasto', 700);
}

