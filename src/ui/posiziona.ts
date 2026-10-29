// Spostare e ingrandire sull'immagine, come si fa col mouse sul monitor di un banco moderno: clic su quello che
// vedi e lo scegli (Ctrl+clic: quello che sta sotto); trascini per spostarlo, tiri un angolo per ingrandirlo (o un
// lato per stirarlo, come vuoi), il pallino in alto lo gira. Col "movimento" acceso la clip ha una partenza, un
// arrivo e tutte le tappe di mezzo che vuoi: ci va piano piano, passando da ognuna (tfFine, via, src/core/progetto.ts
// tfAl). Fermo fra due tappe, se muovi qualcosa ne nasce una nuova lì. Gli effetti che hanno un centro (bolla,
// vortice, zoom, riflesso…) hanno il loro mirino, con le stesse tappe. E "Segui" trova un oggetto e lo insegue.
import { store } from '../core/store';
import type { Clip, Project, Transform } from '../core/tipi';
import { end, mediaOf, passaPer, srcTimeAt, tappeTf, tfAl, TF0, TITLE0 } from '../core/progetto';
import { centroBlocco, haCentro, tappePos } from '../core/blocchi';
import { immagineDa, puntoAl, spostaTraccia, sulQuadro } from '../core/traccia';
import { seguiOggetto } from '../media/traccia';
import { mediaRT } from '../media/libreria';
import { pianoVideo } from '../render/piano';
import { motoTitolo, specAlTempo, telaTitolo } from '../render/grafica';
import { f2s, fps } from '../core/timecode';
import { motore } from '../motore';
import { avviso, h } from './dom';
import { haLinea, mettiChiave, valoreAl } from '../core/automazioni';
import { EditorMaschere } from './maschereMonitor';

const CAMPI_ANIM_TF = ['x', 'y', 'scale', 'rot', 'cropL', 'cropR', 'cropT', 'cropB', 'angoli', 'ombra', 'sx'] as const;

/** un rettangolo sul quadro, in pixel del progetto: centro, misure, rotazione in radianti */
export interface Riquadro { cx: number; cy: number; w: number; h: number; rot: number }

const VISIBILI = new Set(['media', 'title', 'color', 'bars', 'countdown']);

/** dove sta la clip sul quadro con quella posizione (lo stesso conto del compositore) */
export function riquadroClip(p: Project, c: Clip, tf: Transform, f: number): Riquadro | null {
  const W = p.w, H = p.h;
  let dw = W, dh = H, ox = 0, oy = 0, sc = 1;
  if (c.kind === 'media') {
    const m = mediaOf(p, c);
    if (!m) return null;
    if (m.width && m.height) {
      const w = m.rotation % 180 ? m.height : m.width, hh = m.rotation % 180 ? m.width : m.height;
      const k = Math.min(W / w, H / hh);
      dw = w * k; dh = hh * k;
    }
  }
  // i titoli stanno su una tela grande: il riquadro si stringe attorno alle lettere
  let bx0 = tf.cropL, by0 = tf.cropT, bx1 = 1 - tf.cropR, by1 = 1 - tf.cropB;
  // le animazioni del catalogo riempiono il quadro: il riquadro è tutto il quadro (si sposta e si ingrandisce intera)
  if (c.kind === 'title' && !c.gen?.anim && !c.gen?.html) {
    const t = f2s(Math.max(0, f - c.start), p.rate);
    const spec = specAlTempo(c.gen?.title ?? TITLE0, t);
    const tt = telaTitolo(spec, W, H);
    const off = motoTitolo(spec, tt.w, tt.h, W, H, t, f2s(c.len, p.rate));
    dw = tt.w; dh = tt.h; ox = off.dx; oy = off.dy; sc = off.scala ?? 1;
    const bb = bordiTela(tt.tela as CanvasImageSource & { width: number; height: number });
    if (bb) { bx0 = Math.max(bx0, bb[0]); by0 = Math.max(by0, bb[1]); bx1 = Math.min(bx1, bb[2]); by1 = Math.min(by1, bb[3]); }
  }
  const s = tf.scale * sc, sxx = tf.sx ?? 1;
  const w = dw * s * sxx * Math.max(0.01, bx1 - bx0), hh = dh * s * Math.max(0.01, by1 - by0);
  const ux = ((bx0 + bx1) / 2 - 0.5) * dw * s * sxx, uy = ((by0 + by1) / 2 - 0.5) * dh * s;
  const r = (tf.rot * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  // se segue un oggetto tracciato, sta dov'è lui (più lo scarto che hai dato)
  const seg = spostaTraccia(p, c, f);
  return { cx: W / 2 + tf.x + seg.dx + ox + co * ux - si * uy, cy: H / 2 + tf.y + seg.dy + oy + si * ux + co * uy, w, h: hh, rot: r };
}

/** dove c'è davvero qualcosa su una tela trasparente (frazioni: x0, y0, x1, y1), guardata in piccolo */
const bordiCache = new WeakMap<object, [number, number, number, number] | null>();
let piccola: HTMLCanvasElement | null = null;
function bordiTela(tela: CanvasImageSource & { width: number; height: number }): [number, number, number, number] | null {
  if (bordiCache.has(tela)) return bordiCache.get(tela)!;
  const W = 192, H = 108;
  piccola ??= document.createElement('canvas');
  piccola.width = W; piccola.height = H;
  const x = piccola.getContext('2d', { willReadFrequently: true })!;
  x.clearRect(0, 0, W, H);
  x.drawImage(tela, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    if (d[(yy * W + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  }
  const r: [number, number, number, number] | null = x1 < 0 ? null : [Math.max(0, (x0 - 1) / W), Math.max(0, (y0 - 1) / H), Math.min(1, (x1 + 2) / W), Math.min(1, (y1 + 2) / H)];
  bordiCache.set(tela, r);
  return r;
}

/** il punto in coordinate del rettangolo (senza la sua rotazione) */
const locale = (q: Riquadro, x: number, y: number) => {
  const dx = x - q.cx, dy = y - q.cy, co = Math.cos(q.rot), si = Math.sin(q.rot);
  return { x: co * dx + si * dy, y: -si * dx + co * dy };
};
const mondo = (q: Riquadro, x: number, y: number) => {
  const co = Math.cos(q.rot), si = Math.sin(q.rot);
  return { x: q.cx + co * x - si * y, y: q.cy + si * x + co * y };
};

type Presa = 'sposta' | 'angolo' | 'lato' | 'gira' | 'centro' | 'punto' | 'mira';
interface Dove { tipo: Presa; sx?: number; sy?: number; i?: number }

/** chi si sta muovendo: una clip o il centro di un effetto, e quale tappa (0 = partenza, l'ultima = arrivo,
 *  -1 = fra due tappe: se muovi, ne nasce una lì); x = quanto del blocco è passato (0..1) */
interface Bersaglio { c: Clip; fx: boolean; chiave: number; x: number }

/** quanto del blocco è passato al fotogramma f: lo stesso conto con cui il compositore muove clip ed effetti */
const quanto = (c: Clip, f: number, fx: boolean) => Math.max(0, Math.min(1, fx ? (f - c.start + 0.5) / Math.max(1, c.len) : (f - c.start) / Math.max(1, c.len - 1)));
/** il fotogramma di una tappa */
const fotogrammaDi = (c: Clip, t: number, fx: boolean) => c.start + (fx ? Math.floor(t * c.len) : Math.round(t * (c.len - 1)));

/**
 * Una scelta sull'immagine: il contagocce della chiave (un clic = un colore) o i clic dell'oggetto da ritagliare
 * (clic = è l'oggetto, Alt+clic = non lo è). Chi la chiede manda l'evento "dpv:scegli" con questi dati.
 */
export interface SceltaImmagine {
  /** la clip su cui si clicca */
  id: string;
  testo: string;
  /** a ogni clic: dove nell'immagine (frazioni 0..1 dall'angolo in alto a sinistra) e se c'era Alt */
  clic: (x: number, y: number, alt: boolean) => void;
  /** i punti da disegnare sopra l'immagine (dentro = verde, fuori = rosso) */
  punti?: () => { x: number; y: number; dentro: boolean }[];
  /** tasto destro: toglie il punto più vicino a dove hai cliccato (frazioni 0..1) */
  destro?: (x: number, y: number) => void;
  /** la selezione di prova (w×h byte, >127 = scelto): si disegna sopra l'immagine in verde col bordo bianco */
  maschera?: () => { w: number; h: number; dati: Uint8Array } | null;
  /** una frase che dice a che punto si è ("Cerco…", "Selezionato: se è giusto premi OK") */
  stato?: () => string;
  /** i tasti per scegliere come si cerca (per esempio Persona / Oggetto) e quale è acceso */
  modi?: { id: string; nome: string; info: string }[];
  modoAttuale?: () => string;
  scegliModo?: (id: string) => void;
  /** il tasto OK: la selezione è giusta, si procede (la scelta si chiude) */
  conferma?: () => void;
  /** resta aperta dopo il primo clic */
  continua: boolean;
}

/** la selezione di prova come immagine: dentro verde trasparente, sul bordo bianco pieno */
function tintaDa(m: { w: number; h: number; dati: Uint8Array }): HTMLCanvasElement {
  const tela = document.createElement('canvas');
  tela.width = m.w; tela.height = m.h;
  const x = tela.getContext('2d')!;
  const im = x.createImageData(m.w, m.h);
  const d = m.dati, w = m.w, hh = m.h;
  for (let y = 0; y < hh; y++) {
    for (let xx = 0; xx < w; xx++) {
      const i = y * w + xx;
      if (d[i] <= 127) continue;
      const bordo = xx === 0 || y === 0 || xx === w - 1 || y === hh - 1 || d[i - 1] <= 127 || d[i + 1] <= 127 || d[i - w] <= 127 || d[i + w] <= 127;
      const o = i * 4;
      if (bordo) { im.data[o] = 255; im.data[o + 1] = 255; im.data[o + 2] = 255; im.data[o + 3] = 255; }
      else { im.data[o] = 93; im.data[o + 1] = 211; im.data[o + 2] = 158; im.data[o + 3] = 105; }
    }
  }
  x.putImageData(im, 0, 0);
  return tela;
}

/** la mira del tracking: dove hai segnato l'oggetto da seguire */
interface Mira { id: string; x: number; y: number; lato: number; lavoro: boolean; prog: number }

export class Posiziona {
  /** la barretta sopra l'immagine: movimento, tappe, inizio e fine, rimetti a posto */
  barra: HTMLElement;
  private nome: HTMLElement;
  private bMoto: HTMLButtonElement;
  private bInizio: HTMLButtonElement;
  private bFine: HTMLButtonElement;
  private tappeEl: HTMLElement;
  private bPiu: HTMLButtonElement;
  private bMeno: HTMLButtonElement;
  private bRitaglia: HTMLButtonElement;
  private bAdatta: HTMLButtonElement;
  private bSegui: HTMLButtonElement;
  private bMira: HTMLElement;
  private trascina: { presa: Dove; x0: number; y0: number; tf0: Transform; pos0: [number, number]; q0: Riquadro | null; mosso: boolean; chiave: number; f: number } | null = null;
  /** ritaglio invece di stirare: i lati e gli angoli tagliano l'immagine */
  private ritaglia = false;
  private mira: Mira | null = null;
  private scelta: SceltaImmagine | null = null;
  private bScelta: HTMLElement;
  private sceltaStato!: HTMLElement;
  private sceltaModi!: HTMLElement;
  private bOk!: HTMLButtonElement;
  /** la selezione di prova disegnata (si rifà solo se cambia la maschera) */
  private tintaScelta: { dati: Uint8Array; tela: HTMLCanvasElement } | null = null;
  private ferma = false;
  private firmaTappe = '';
  /** la modalità «maschera a forma»: contorno, maniglie e punti della Bézier (src/ui/maschereMonitor.ts) */
  private maschere: EditorMaschere;

  constructor(private schermo: HTMLElement, private sopra: HTMLCanvasElement, private ridisegna: () => void) {
    const btn = (testo: string, title: string, fn: () => void, extra = '') => h('button', { class: 'pos-btn ' + extra, title, on: { click: fn } }, testo) as HTMLButtonElement;
    this.nome = h('b', { class: 'pos-nome' });
    this.bMoto = btn('↝ Movimento', 'Movimento: dalla posizione d\'inizio a quella di fine, lungo tutta la clip, passando dalle tappe di mezzo', () => this.alternaMoto());
    this.bInizio = btn('◀', 'Inizio: vai alla posizione di partenza: qui sistemi dove parte', () => this.vai(0));
    this.bFine = btn('▶', 'Fine: vai alla posizione di arrivo, qui sistemi dove arriva', () => this.vai(1));
    this.tappeEl = h('span', { class: 'pos-tappe' });
    this.bPiu = btn('＋', 'Una tappa qui: la clip ci passa dentro. Basta anche fermarsi fra due tappe e muovere', () => this.nuovaTappaQui());
    this.bMeno = btn('－', 'Toglie la tappa dove sei (la partenza e l\'arrivo restano)', () => this.togliTappa());
    this.bRitaglia = btn('✂', 'Ritaglia. Acceso: i lati e gli angoli ritagliano l\'immagine invece di stirarla', () => { this.ritaglia = !this.ritaglia; this.ridisegna(); });
    this.bAdatta = btn('⟲', 'Rimetti com\'era (a tutto quadro, o l\'effetto al centro)', () => this.rimetti());
    this.bSegui = btn('🎯', 'Segui: segna un oggetto e il programma lo segue per tutta la ripresa: poi titoli ed effetti lo inseguono', () => this.avviaMira());
    const lati = [0.06, 0.12, 0.2].map((l) => btn(l < 0.1 ? '▫' : l < 0.15 ? '◻' : '⬜', 'Quanto è grande il quadratino di ricerca', () => { if (this.mira) { this.mira.lato = l; this.ridisegna(); } }, 'dim'));
    this.bMira = h('span', { class: 'pos-mira', hidden: true },
      h('span', { class: 'pos-mira-testo' }, 'Trascina il mirino sull\'oggetto'), ...lati,
      btn('▶ Avvia', 'Segue l\'oggetto dal fotogramma dove sei fino alla fine e all\'inizio della clip', () => void this.segui(), 'acceso'),
      btn('✕', 'Lascia stare', () => this.esciMira()));
    // la barra della scelta coi clic: la frase, la selezione, i due modi (Persona / Oggetto), OK per procedere, ✕ per lasciare stare
    this.sceltaStato = h('span', { class: 'pos-mira-stato' });
    this.sceltaModi = h('span', { class: 'pos-modi' });
    this.bOk = btn('✔ OK, ritaglia tutta la clip', 'La selezione è giusta: toglie lo sfondo a tutta la clip (Invio)', () => this.confermaScelta(), 'acceso ok');
    this.bScelta = h('span', { class: 'pos-mira', hidden: true },
      h('span', { class: 'pos-mira-testo' }),
      this.sceltaStato, this.sceltaModi, this.bOk,
      btn('✕', 'Lascia stare (Esc)', () => this.esciScelta()));
    this.barra = h('div', { class: 'pos-barra' }, this.nome, this.bMoto, this.bInizio, this.tappeEl, this.bFine, this.bPiu, this.bMeno, this.bRitaglia, this.bSegui, this.bAdatta, this.bMira, this.bScelta);
    schermo.append(this.barra);
    this.maschere = new EditorMaschere(schermo, sopra, ridisegna, riquadroClip);
    schermo.addEventListener('pointerdown', (e) => this.giu(e));
    // la ricerca finisce (o cambia un modo): la barra e la selezione si aggiornano
    document.addEventListener('dpv:scegli-aggiorna', () => { if (this.scelta) { this.aggiornaScelta(); this.ridisegna(); } });
    // Invio = OK, Esc = lascia stare (solo mentre si sceglie)
    addEventListener('keydown', (e) => {
      if (!this.scelta) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Enter' && this.scelta.conferma) { e.preventDefault(); e.stopPropagation(); this.confermaScelta(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.esciScelta(); }
    }, true);
    // durante la scelta dei punti il tasto destro toglie un punto: niente menu del sistema
    schermo.addEventListener('contextmenu', (e) => { if (this.scelta) e.preventDefault(); });
    schermo.addEventListener('pointermove', (e) => { if (!this.trascina) this.cursore(e); });
    store.on('sel', () => {
      if (this.mira && !store.sel.has(this.mira.id)) this.mira = null;
      if (this.scelta && !store.sel.has(this.scelta.id)) this.scelta = null;
      this.ridisegna();
    });
    document.addEventListener('dpv:mira', () => this.avviaMira());
    document.addEventListener('dpv:scegli', (e) => this.avviaScelta((e as CustomEvent<SceltaImmagine>).detail));
    document.addEventListener('dpv:scegli-fine', () => this.esciScelta());
  }

  private k() { return this.sopra.getBoundingClientRect().width / store.doc.w; }

  /** il punto del mouse in pixel del progetto */
  private punto(e: PointerEvent) {
    const r = this.sopra.getBoundingClientRect(), p = store.doc;
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * p.w, y: ((e.clientY - r.top) / Math.max(1, r.height)) * p.h };
  }

  /** la clip (o l'effetto) scelta che si vede adesso nel programma, e la tappa che si sta sistemando */
  bersaglio(): Bersaglio | null {
    if (motore.attivo !== 'recorder') return null;
    const p = store.doc, f = Math.floor(store.head + 1e-6);
    const id = [...store.sel][0];
    const c = id ? p.clips.find((x) => x.id === id) : undefined;
    if (!c || f < c.start || f >= end(c)) return null;
    const traccia = p.tracks.find((t) => t.id === c.track);
    if (!traccia || traccia.kind !== 'video') return null;
    const fx = c.kind === 'fx';
    if (fx) { if (c.fxb?.tipo !== 'effetto' || !haCentro(c.fxb.id)) return null; }
    else if (!VISIBILI.has(c.kind)) return null;
    const x = quanto(c, f, fx);
    const ts = (fx ? tappePos(c.fxb!) : tappeTf(c)).map((t) => t.t);
    let chiave = 0;
    if (ts.length) {
      // sopra una tappa (entro un fotogramma, o poco più) si sistema lei; fra due tappe se ne crea una nuova
      chiave = -1;
      let vicino = Math.max(0.02, 1.5 / Math.max(1, c.len - 1));
      ts.forEach((t, i) => { const d = Math.abs(t - x); if (d <= vicino) { vicino = d; chiave = i; } });
    }
    return { c, fx, chiave, x };
  }

  /** la posizione da sistemare: quella della tappa, o (fra due tappe) quella di adesso */
  private tfDi(b: Bersaglio, f: number): Transform {
    const t = tappeTf(b.c);
    return b.chiave >= 0 && t[b.chiave] ? t[b.chiave].tf : tfAl(b.c, f - b.c.start);
  }
  private centroDi(b: Bersaglio, f: number): [number, number] {
    const t = tappePos(b.c.fxb!);
    return b.chiave >= 0 && t[b.chiave] ? t[b.chiave].pos : centroBlocco(b.c, f, store.doc);
  }

  /** accende la barretta e rimette a posto i suoi pezzi */
  private aggiornaBarra(b: Bersaglio | null) {
    const mira = !!this.mira;
    const sceglie = !!this.scelta;
    this.barra.classList.toggle('su', (!!b || mira || sceglie) && !motore.playing);
    this.barra.classList.toggle('in-mira', mira || sceglie);
    this.bScelta.hidden = !sceglie;
    if (sceglie) {
      this.bMira.hidden = true;
      this.nome.textContent = store.doc.clips.find((x) => x.id === this.scelta!.id)?.name ?? '';
      (this.bScelta.firstChild as HTMLElement).textContent = this.scelta!.testo;
      this.aggiornaScelta();
      return;
    }
    if (mira) {
      this.bMira.hidden = false;
      const c = store.doc.clips.find((x) => x.id === this.mira!.id);
      this.nome.textContent = c?.name ?? '';
      (this.bMira.firstChild as HTMLElement).textContent = this.mira!.lavoro ? `Seguo… ${Math.round(this.mira!.prog * 100)}%` : 'Trascina il mirino sull\'oggetto';
      this.bMira.querySelectorAll('.pos-btn').forEach((x) => { (x as HTMLButtonElement).disabled = this.mira!.lavoro && (x as HTMLElement).textContent !== '✕'; });
      return;
    }
    this.bMira.hidden = true;
    if (!b) return;
    this.nome.textContent = b.c.name;
    const tappe = b.fx ? tappePos(b.c.fxb!) : tappeTf(b.c);
    const moto = tappe.length > 0;
    const n = tappe.length;
    this.bMoto.classList.toggle('acceso', moto);
    this.bInizio.hidden = this.bFine.hidden = this.bPiu.hidden = !moto;
    this.bMeno.hidden = !moto || b.chiave < 1 || b.chiave > n - 2;
    this.bInizio.classList.toggle('acceso', moto && b.chiave === 0);
    this.bFine.classList.toggle('acceso', moto && b.chiave === n - 1);
    this.bRitaglia.hidden = b.fx;
    this.bRitaglia.classList.toggle('acceso', this.ritaglia);
    const clip = b.c;
    this.bSegui.hidden = b.fx || clip.kind !== 'media' || mediaOf(store.doc, clip)?.type !== 'video';
    this.bSegui.classList.toggle('acceso', !!clip.traccia);
    this.bSegui.textContent = '🎯';
    this.bSegui.title = clip.traccia ? 'Rifai il tracking di questo oggetto' : 'Segui: segna un oggetto e il programma lo segue per tutta la ripresa';
    // una pallina per ogni tappa di mezzo (clic = ci va)
    const firma = n + ':' + b.chiave + ':' + b.fx;
    if (firma !== this.firmaTappe) {
      this.firmaTappe = firma;
      this.tappeEl.replaceChildren(...tappe.slice(1, -1).map((_, j) => h('button', {
        class: 'pos-btn tappa' + (b.chiave === j + 1 ? ' acceso' : ''), title: `Tappa ${j + 2}: clic per andarci`, on: { click: () => this.vai(j + 1) },
      }, String(j + 2))));
    }
  }

  /** disegna riquadro, maniglie, il percorso del movimento; e accende la barretta */
  disegna(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const b = this.bersaglio();
    this.aggiornaBarra(b);
    if (this.scelta) { this.disegnaScelta(ctx, W, H); return; }
    if (this.mira) { this.disegnaMira(ctx, W, H); return; }
    if (this.maschere.disegna(ctx, W)) return;
    if (!b) return;
    if (motore.playing) return;
    const p = store.doc, k = W / p.w, f = Math.floor(store.head + 1e-6);
    const dpr = W / Math.max(1, this.sopra.getBoundingClientRect().width);
    ctx.save();
    ctx.lineWidth = 1.5 * dpr;
    if (b.fx) {
      const bl = b.c.fxb!;
      const tappe = tappePos(bl);
      const mirino = (x: number, y: number, col: string, pieno: boolean, r = 16) => {
        const cx = x * W, cy = y * H, rr = r * dpr;
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - rr * 1.6, cy); ctx.lineTo(cx + rr * 1.6, cy); ctx.moveTo(cx, cy - rr * 1.6); ctx.lineTo(cx, cy + rr * 1.6); ctx.stroke();
        if (pieno) { ctx.beginPath(); ctx.arc(cx, cy, 4 * dpr, 0, Math.PI * 2); ctx.fill(); }
      };
      if (tappe.length) {
        this.percorso(ctx, W, H, dpr, (x) => { const c2 = centroBlocco({ ...b.c, fxb: { ...bl, segue: undefined } }, b.c.start + Math.floor(x * b.c.len), p); return [c2[0] * W, c2[1] * H]; });
        tappe.forEach((tp, i) => { if (i !== b.chiave) { this.pallina(ctx, tp.pos[0] * W, tp.pos[1] * H, i, tappe.length, dpr); } });
      }
      const [x, y] = this.centroDi(b, f);
      const seg = bl.segue ? centroBlocco(b.c, f, p) : null;
      if (seg) { ctx.setLineDash([4 * dpr, 4 * dpr]); mirino(seg[0], seg[1], '#35e8ff', true, 22); ctx.setLineDash([]); }
      else mirino(x, y, '#ffd54a', true);
    } else {
      const tappe = tappeTf(b.c);
      const moto = tappe.length > 0;
      const tf = this.tfDi(b, f);
      const q = riquadroClip(p, b.c, tf, f);
      if (moto) {
        // i riquadri delle tappe (tratteggiati) e il percorso che le lega
        ctx.setLineDash([6 * dpr, 5 * dpr]);
        tappe.forEach((tp, i) => {
          if (i === b.chiave || (i !== 0 && i !== tappe.length - 1)) return;
          const r = riquadroClip(p, b.c, tp.tf, fotogrammaDi(b.c, tp.t, false));
          if (r) rettangolo(ctx, r, k, 'rgba(255,61,242,.75)');
        });
        ctx.setLineDash([]);
        this.percorso(ctx, W, H, dpr, (x) => { const lf = x * (b.c.len - 1); const r = riquadroClip(p, b.c, tfAl(b.c, lf), b.c.start + Math.round(lf)); return r ? [r.cx * k, r.cy * k] : null; });
        tappe.forEach((tp, i) => {
          if (i === b.chiave) return;
          const r = riquadroClip(p, b.c, tp.tf, fotogrammaDi(b.c, tp.t, false));
          if (r) this.pallina(ctx, r.cx * k, r.cy * k, i, tappe.length, dpr);
        });
      }
      if (b.c.traccia) this.disegnaTraccia(ctx, b.c, k, f, dpr);
      if (q) {
        rettangolo(ctx, q, k, b.chiave < 0 ? '#ffb02e' : '#ffd54a');
        // le maniglie: angoli e lati (stirano o ritagliano), e il pallino sopra (rotazione)
        ctx.fillStyle = this.ritaglia ? '#ff8ff8' : '#ffd54a';
        ctx.strokeStyle = '#1a1206';
        for (const [sx, sy] of MANIGLIE) {
          const m = mondo(q, (sx * q.w) / 2, (sy * q.h) / 2);
          const lato = sx !== 0 && sy !== 0 ? 10 : 8;
          ctx.fillRect(m.x * k - (lato / 2) * dpr, m.y * k - (lato / 2) * dpr, lato * dpr, lato * dpr);
          ctx.strokeRect(m.x * k - (lato / 2) * dpr, m.y * k - (lato / 2) * dpr, lato * dpr, lato * dpr);
        }
        const top = mondo(q, 0, -q.h / 2), giro = mondo(q, 0, -q.h / 2 - 26 / (k / dpr));
        ctx.strokeStyle = '#ffd54a';
        ctx.beginPath(); ctx.moveTo(top.x * k, top.y * k); ctx.lineTo(giro.x * k, giro.y * k); ctx.stroke();
        ctx.beginPath(); ctx.arc(giro.x * k, giro.y * k, 6 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#ffd54a'; ctx.fill();
        if (b.chiave < 0) {
          ctx.font = `700 ${11 * dpr}px Rajdhani, sans-serif`;
          ctx.fillStyle = '#ffb02e';
          ctx.textAlign = 'center';
          ctx.fillText('fra due tappe: muovi e ne nasce una', q.cx * k, q.cy * k + (q.h / 2) * k + 16 * dpr);
        }
      }
    }
    ctx.restore();
  }

  /** la linea del percorso (curva) fra le tappe, con la punta di freccia all'arrivo */
  private percorso(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, punto: (x: number) => [number, number] | null) {
    void W; void H;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 48; i++) { const q = punto(i / 48); if (q) pts.push(q); }
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,61,242,.85)';
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    const [xa, ya] = pts[pts.length - 2], [xb, yb] = pts[pts.length - 1];
    const a = Math.atan2(yb - ya, xb - xa), s = 10 * dpr;
    ctx.fillStyle = 'rgba(255,61,242,.9)';
    ctx.beginPath();
    ctx.moveTo(xb, yb);
    ctx.lineTo(xb - s * Math.cos(a - 0.45), yb - s * Math.sin(a - 0.45));
    ctx.lineTo(xb - s * Math.cos(a + 0.45), yb - s * Math.sin(a + 0.45));
    ctx.fill();
    ctx.restore();
  }

  /** la pallina di una tappa (numerata: 1 = partenza) */
  private pallina(ctx: CanvasRenderingContext2D, x: number, y: number, i: number, n: number, dpr: number) {
    ctx.save();
    ctx.fillStyle = i === 0 ? '#5dd39e' : i === n - 1 ? '#ff3df2' : '#ff8ff8';
    ctx.strokeStyle = '#1a1206';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(x, y, 8 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1206';
    ctx.font = `800 ${10 * dpr}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y + 0.5 * dpr);
    ctx.restore();
  }

  /** il percorso dell'oggetto seguito, e dov'è adesso */
  private disegnaTraccia(ctx: CanvasRenderingContext2D, c: Clip, k: number, f: number, dpr: number) {
    const p = store.doc, tr = c.traccia!;
    ctx.save();
    ctx.strokeStyle = 'rgba(53,232,255,.8)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    let prima = true;
    for (const q of tr.punti) {
      const o = sulQuadro(p, c, q.x, q.y, f);
      if (!o) continue;
      const X = (p.w / 2 + o[0]) * k, Y = (p.h / 2 + o[1]) * k;
      if (prima) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      prima = false;
    }
    ctx.stroke();
    const ora = puntoAl(tr, srcTimeAt(p, c, f));
    const o = ora && sulQuadro(p, c, ora.x, ora.y, f);
    if (o) {
      const X = (p.w / 2 + o[0]) * k, Y = (p.h / 2 + o[1]) * k;
      ctx.strokeStyle = '#35e8ff';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(X, Y, 10 * dpr, 0, Math.PI * 2); ctx.moveTo(X - 16 * dpr, Y); ctx.lineTo(X + 16 * dpr, Y); ctx.moveTo(X, Y - 16 * dpr); ctx.lineTo(X, Y + 16 * dpr); ctx.stroke();
    }
    ctx.restore();
  }

  /** la mira: il quadratino da mettere sull'oggetto */
  private disegnaMira(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const m = this.mira!, p = store.doc, f = Math.floor(store.head + 1e-6);
    const c = p.clips.find((x) => x.id === m.id);
    if (!c) return;
    const k = W / p.w, dpr = W / Math.max(1, this.sopra.getBoundingClientRect().width);
    const o = sulQuadro(p, c, m.x, m.y, f);
    if (!o) return;
    const seg = spostaTraccia(p, c, f);
    const X = (p.w / 2 + o[0] + seg.dx) * k, Y = (p.h / 2 + o[1] + seg.dy) * k;
    const a = mediaOf(p, c);
    const larg = a ? (Math.min(p.w, p.h * (a.width / Math.max(1, a.height))) * tfAl(c, f - c.start).scale) : p.w;
    const lato = Math.max(14 * dpr, m.lato * larg * k);
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4 * dpr;
    ctx.strokeRect(X - lato / 2, Y - lato / 2, lato, lato);
    ctx.strokeStyle = m.lavoro ? '#35e8ff' : '#ff3df2';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(X - lato / 2, Y - lato / 2, lato, lato);
    ctx.beginPath(); ctx.moveTo(X - lato, Y); ctx.lineTo(X - lato / 2, Y); ctx.moveTo(X + lato / 2, Y); ctx.lineTo(X + lato, Y); ctx.moveTo(X, Y - lato); ctx.lineTo(X, Y - lato / 2); ctx.moveTo(X, Y + lato / 2); ctx.lineTo(X, Y + lato); ctx.stroke();
    ctx.restore();
  }

  /** quale maniglia sta sotto il punto (in pixel del progetto) */
  private presaSotto(b: Bersaglio, x: number, y: number): Dove | null {
    const p = store.doc, kk = this.k(), f = Math.floor(store.head + 1e-6);
    const tol = 12 / kk;
    if (b.fx) {
      const tappe = tappePos(b.c.fxb!);
      for (let i = 0; i < tappe.length; i++) {
        if (i !== b.chiave && Math.hypot(x - tappe[i].pos[0] * p.w, y - tappe[i].pos[1] * p.h) < tol) return { tipo: 'punto', i };
      }
      const [cx, cy] = b.c.fxb!.segue ? centroBlocco(b.c, f, p) : this.centroDi(b, f);
      return Math.hypot(x - cx * p.w, y - cy * p.h) < 26 / kk ? { tipo: 'centro' } : null;
    }
    const tappe = tappeTf(b.c);
    for (let i = 0; i < tappe.length; i++) {
      if (i === b.chiave) continue;
      const r = riquadroClip(p, b.c, tappe[i].tf, fotogrammaDi(b.c, tappe[i].t, false));
      if (r && Math.hypot(x - r.cx, y - r.cy) < tol) return { tipo: 'punto', i };
    }
    const q = riquadroClip(p, b.c, this.tfDi(b, f), f);
    if (!q) return null;
    const l = locale(q, x, y);
    if (Math.hypot(l.x, l.y + q.h / 2 + 26 / kk) < tol) return { tipo: 'gira' };
    for (const [sx, sy] of MANIGLIE) {
      if (Math.hypot(l.x - (sx * q.w) / 2, l.y - (sy * q.h) / 2) < tol) return sx !== 0 && sy !== 0 ? { tipo: 'angolo', sx, sy } : { tipo: 'lato', sx, sy };
    }
    if (Math.abs(l.x) <= q.w / 2 && Math.abs(l.y) <= q.h / 2) return { tipo: 'sposta' };
    return null;
  }

  /** la clip più in alto che si vede sotto il punto (per sceglierla col clic sull'immagine); con "sotto" salta le prime */
  private clipSotto(x: number, y: number, sotto?: string): Clip | null {
    const p = store.doc, f = Math.floor(store.head + 1e-6);
    const strati = pianoVideo(p, f);
    const trovate: Clip[] = [];
    for (let i = strati.length - 1; i >= 0; i--) {
      const s = strati[i].b ?? strati[i].a;
      if (!s) continue;
      const q = riquadroClip(p, s.clip, tfAl(s.clip, s.lf), f);
      if (!q) continue;
      const l = locale(q, x, y);
      // la clip vera del progetto, non la copia con i keyframe già calcolati
      if (Math.abs(l.x) <= q.w / 2 && Math.abs(l.y) <= q.h / 2) trovate.push(store.doc.clips.find((z) => z.id === s.clip.id) ?? s.clip);
    }
    if (!trovate.length) return null;
    if (sotto) {
      // Ctrl+clic: la clip dopo quella scelta, fra tutte quelle che stanno lì sotto (e in fondo si ricomincia)
      const i = trovate.findIndex((c) => c.id === sotto);
      return trovate[(i + 1) % trovate.length];
    }
    return trovate[0];
  }

  private cursore(e: PointerEvent) {
    if (motore.attivo !== 'recorder') { this.schermo.style.cursor = ''; return; }
    if (this.mira || this.scelta) { this.schermo.style.cursor = 'crosshair'; return; }
    if (this.maschere.attiva()) { this.schermo.style.cursor = this.maschere.cursoreSu(e); return; }
    const b = this.bersaglio();
    const { x, y } = this.punto(e);
    const presa = b ? this.presaSotto(b, x, y) : null;
    const t = presa?.tipo;
    this.schermo.style.cursor = t === 'sposta' || t === 'centro' || t === 'punto' ? 'move'
      : t === 'angolo' ? (presa!.sx! * presa!.sy! > 0 ? 'nwse-resize' : 'nesw-resize')
        : t === 'lato' ? (presa!.sx ? 'ew-resize' : 'ns-resize') : t === 'gira' ? 'grab' : '';
  }

  private giu(e: PointerEvent) {
    if (e.button === 2 && this.scelta && motore.attivo === 'recorder') { const { x, y } = this.punto(e); this.destroScelta(e, x, y); return; }
    if (e.button !== 0 || motore.attivo !== 'recorder') return;
    if ((e.target as HTMLElement).closest('.pos-barra, .mini-tl')) return;
    const { x, y } = this.punto(e);
    if (this.scelta) { this.giuScelta(e, x, y); return; }
    if (this.mira) { this.giuMira(e, x, y); return; }
    if (this.maschere.giu(e)) return;
    let b = this.bersaglio();
    let presa = b ? this.presaSotto(b, x, y) : null;
    if (!presa || (presa.tipo === 'sposta' && (e.ctrlKey || e.metaKey))) {
      // clic su quello che si vede: si sceglie e si può già trascinare (Ctrl+clic: quello che sta sotto)
      const c = this.clipSotto(x, y, e.ctrlKey || e.metaKey ? [...store.sel][0] : undefined);
      if (!c) return;
      // Ctrl+clic senza trascinare: si sceglie e basta
      if (motore.playing) motore.stop();
      store.select([c.id]);
      b = this.bersaglio();
      if (!b) return;
      presa = { tipo: 'sposta' };
    }
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (motore.playing) motore.stop();
    // una tappa sul percorso: ci va (il cursore si sposta lì) e la si muove
    if (presa.tipo === 'punto') {
      motore.vaiA(fotogrammaDi(b.c, (b.fx ? tappePos(b.c.fxb!) : tappeTf(b.c))[presa.i!].t, b.fx));
      b = this.bersaglio() ?? b;
      presa = { tipo: b.fx ? 'centro' : 'sposta' };
    }
    const f = Math.floor(store.head + 1e-6);
    const p0 = store.doc;
    store.begin(b.fx ? 'Sposta il centro dell\'effetto' : presa.tipo === 'sposta' ? 'Sposta sull\'immagine' : presa.tipo === 'gira' ? 'Gira' : this.ritaglia ? 'Ritaglia' : 'Ridimensiona');
    // fra due tappe: se muovi nasce una tappa nuova, con la posizione di adesso
    let chiave = b.chiave;
    if (chiave < 0) chiave = this.creaTappa(b.c.id, b.fx, b.x, f);
    const doc = store.doc;
    const c = doc.clips.find((z) => z.id === b.c.id) ?? b.c;
    const bl = c.fxb;
    // con i keyframe sulla posizione si parte dal valore di adesso (se no la prima mossa salterebbe)
    if (!b.fx && c.anim) { const dest = tappeTf(c)[chiave]?.tf ?? c.tf; for (const k of CAMPI_ANIM_TF) if (haLinea(c, 'tf.' + k)) (dest as unknown as Record<string, number>)[k] = valoreAl(c, 'tf.' + k, f - c.start); }
    if (b.fx && bl) bl.pos ??= [0.5, 0.5];
    const tf0 = structuredClone(b.fx ? c.tf : tappeTf(c)[chiave]?.tf ?? c.tf);
    const pos0 = (bl ? [...(tappePos(bl)[chiave]?.pos ?? bl.pos ?? [0.5, 0.5])] : [0.5, 0.5]) as [number, number];
    void p0;
    this.trascina = {
      presa, x0: x, y0: y, tf0, pos0, mosso: false, chiave, f,
      q0: b.fx ? null : riquadroClip(doc, c, tf0, f),
    };
    const id = c.id;
    this.schermo.setPointerCapture(e.pointerId);
    const muovi = (ev: PointerEvent) => this.muovi(ev, id);
    const su = () => {
      this.schermo.removeEventListener('pointermove', muovi);
      this.schermo.removeEventListener('pointerup', su);
      this.schermo.removeEventListener('pointercancel', su);
      store.commit(!!this.trascina?.mosso);
      this.trascina = null;
    };
    this.schermo.addEventListener('pointermove', muovi);
    this.schermo.addEventListener('pointerup', su);
    this.schermo.addEventListener('pointercancel', su);
  }

  /** una tappa nuova al punto x (0..1) di un blocco, con la posizione che ha lì adesso: ritorna il suo posto nella lista */
  private creaTappa(id: string, fx: boolean, x: number, f: number): number {
    const c = store.doc.clips.find((z) => z.id === id);
    if (!c) return 0;
    if (fx && c.fxb) {
      const ora = centroBlocco({ ...c, fxb: { ...c.fxb, segue: undefined } }, f);
      c.fxb.via = [...(c.fxb.via ?? []), { t: x, pos: [ora[0], ora[1]] as [number, number] }].sort((a, z) => a.t - z.t);
      return tappePos(c.fxb).findIndex((t) => t.t === x);
    }
    c.via = [...(c.via ?? []), { t: x, tf: structuredClone(tfAl(c, f - c.start)) }].sort((a, z) => a.t - z.t);
    return tappeTf(c).findIndex((t) => t.t === x);
  }

  private muovi(e: PointerEvent, id: string) {
    const t = this.trascina;
    if (!t) return;
    const p = store.doc;
    const c = p.clips.find((x) => x.id === id);
    if (!c) return;
    const { x, y } = this.punto(e);
    const aggancio = e.altKey ? 0 : 10 / this.k();
    if (t.presa.tipo === 'centro' && c.fxb) {
      let px = Math.max(0, Math.min(1, t.pos0[0] + (x - t.x0) / p.w)), py = Math.max(0, Math.min(1, t.pos0[1] + (y - t.y0) / p.h));
      if (!c.fxb.segue) {
        if (Math.abs(px - 0.5) * p.w < aggancio) px = 0.5;
        if (Math.abs(py - 0.5) * p.h < aggancio) py = 0.5;
      }
      const tappa = tappePos(c.fxb)[t.chiave];
      if (tappa && c.fxb.posFine) { tappa.pos[0] = px; tappa.pos[1] = py; } else c.fxb.pos = [px, py];
    } else {
      const tappa = tappeTf(c)[t.chiave];
      const tf = tappa ? tappa.tf : c.tf;
      const q0 = t.q0;
      if (!q0) return;
      const pr = t.presa;
      if (pr.tipo === 'sposta') {
        let nx = t.tf0.x + x - t.x0, ny = t.tf0.y + y - t.y0;
        // il centro della clip si aggancia al centro del quadro e i bordi ai bordi (Alt = libero)
        const cx = q0.cx + (nx - t.tf0.x), cy = q0.cy + (ny - t.tf0.y);
        if (Math.abs(cx - p.w / 2) < aggancio) nx += p.w / 2 - cx;
        else if (Math.abs(cx - q0.w / 2) < aggancio) nx += q0.w / 2 - cx;
        else if (Math.abs(cx + q0.w / 2 - p.w) < aggancio) nx += p.w - q0.w / 2 - cx;
        if (Math.abs(cy - p.h / 2) < aggancio) ny += p.h / 2 - cy;
        else if (Math.abs(cy - q0.h / 2) < aggancio) ny += q0.h / 2 - cy;
        else if (Math.abs(cy + q0.h / 2 - p.h) < aggancio) ny += p.h - q0.h / 2 - cy;
        tf.x = Math.round(nx); tf.y = Math.round(ny);
      } else if (pr.tipo === 'angolo' || pr.tipo === 'lato') {
        this.ridimensiona(c, tf, e, x, y, aggancio);
      } else if (pr.tipo === 'gira') {
        const a0 = Math.atan2(t.y0 - q0.cy, t.x0 - q0.cx), a = Math.atan2(y - q0.cy, x - q0.cx);
        let g = t.tf0.rot + ((a - a0) * 180) / Math.PI;
        g = ((g + 540) % 360) - 180;
        if (!e.altKey) for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(g - s) < 4) g = s;
        tf.rot = Math.round(g * 10) / 10;
      }
    }
    // i campi della posizione che hanno i keyframe scrivono la chiave sotto il cursore
    if (!(t.presa.tipo === 'centro' && c.fxb) && c.anim) {
      const tf2 = (tappeTf(c)[t.chiave]?.tf ?? c.tf) as unknown as Record<string, number | undefined>;
      for (const k of CAMPI_ANIM_TF) if (haLinea(c, 'tf.' + k)) mettiChiave(c, 'tf.' + k, t.f - c.start, tf2[k] ?? (k === 'sx' || k === 'scale' ? 1 : 0));
    }
    t.mosso = true;
    store.liveChange();
  }

  /**
   * Tirare un angolo o un lato. Di solito il lato opposto resta fermo (con Ctrl si allarga dal centro); l'angolo
   * mantiene le proporzioni (con Maiusc le stira), il lato stira da una parte sola; con "Ritaglia" i lati e gli
   * angoli ritagliano l'immagine. Si aggancia ai bordi e al centro del quadro (Alt = libero).
   */
  private ridimensiona(c: Clip, tf: Transform, e: PointerEvent, X: number, Y: number, aggancio: number) {
    const t = this.trascina!, p = store.doc, q0 = t.q0!, pr = t.presa;
    const sx = pr.sx ?? 0, sy = pr.sy ?? 0;
    const hw = q0.w / 2, hh = q0.h / 2;
    const l = locale(q0, X, Y);
    const dalCentro = e.ctrlKey || e.metaKey;
    // senza rotazione il lato che si tira si aggancia ai bordi e al centro del quadro
    if (!e.altKey && Math.abs(Math.sin(q0.rot)) < 1e-3 && !dalCentro && !this.ritaglia) {
      const snap = (v: number, cand: number[]) => { for (const c2 of cand) if (Math.abs(v - c2) < aggancio) return c2; return v; };
      if (sx && !(sx !== 0 && sy !== 0 && !e.shiftKey)) l.x = snap(q0.cx + l.x, [0, p.w / 2, p.w]) - q0.cx;
      if (sy && !(sx !== 0 && sy !== 0 && !e.shiftKey)) l.y = snap(q0.cy + l.y, [0, p.h / 2, p.h]) - q0.cy;
    }
    if (this.ritaglia) {
      // ritagliare: i lati si spostano verso l'interno (o fuori, fino al bordo dell'immagine); l'immagine sta ferma
      const Ws = q0.w / Math.max(0.02, 1 - t.tf0.cropL - t.tf0.cropR), Hs = q0.h / Math.max(0.02, 1 - t.tf0.cropT - t.tf0.cropB);
      const rit = (v0: number, delta: number, altro: number) => Math.max(0, Math.min(0.96 - altro, v0 + delta));
      if (sx < 0) tf.cropL = rit(t.tf0.cropL, (l.x + hw) / Ws, tf.cropR);
      if (sx > 0) tf.cropR = rit(t.tf0.cropR, (hw - l.x) / Ws, tf.cropL);
      if (sy < 0) tf.cropT = rit(t.tf0.cropT, (l.y + hh) / Hs, tf.cropB);
      if (sy > 0) tf.cropB = rit(t.tf0.cropB, (hh - l.y) / Hs, tf.cropT);
      return;
    }
    const minK = 0.03;
    // il punto fermo (il lato o l'angolo opposto, o il centro) e le nuove misure
    const anc = { x: dalCentro ? 0 : -sx * hw, y: dalCentro ? 0 : -sy * hh };
    let kx = 1, ky = 1;
    if (sx && sy && !e.shiftKey) {
      const vx = sx * hw - anc.x, vy = sy * hh - anc.y;
      let kk = Math.max(minK, ((l.x - anc.x) * vx + (l.y - anc.y) * vy) / Math.max(1e-6, vx * vx + vy * vy));
      // si aggancia al 100% (a tutto quadro): Alt = libero
      if (!e.altKey && Math.abs(t.tf0.scale * kk - 1) < 0.025) kk = 1 / t.tf0.scale;
      kx = ky = kk;
    } else {
      if (sx) kx = Math.max(minK, (sx * (l.x - anc.x)) / Math.max(1e-6, dalCentro ? hw : 2 * hw));
      if (sy) ky = Math.max(minK, (sy * (l.y - anc.y)) / Math.max(1e-6, dalCentro ? hh : 2 * hh));
    }
    const w1 = q0.w * kx, h1 = q0.h * ky;
    // dove finisce il centro del riquadro (nelle sue coordinate) e da lì com'è fatto il Transform
    const c1 = { x: dalCentro ? 0 : anc.x + sx * w1 / 2, y: dalCentro ? 0 : anc.y + sy * h1 / 2 };
    const nuovo: Transform = { ...t.tf0, scale: Math.round(t.tf0.scale * ky * 1000) / 1000, sx: Math.round(((t.tf0.sx ?? 1) * kx / ky) * 1000) / 1000 };
    if (Math.abs((nuovo.sx ?? 1) - 1) < 0.004) nuovo.sx = 1;
    const dove = mondo(q0, c1.x, c1.y);
    const q1 = riquadroClip(p, c, nuovo, t.f);
    tf.scale = nuovo.scale;
    tf.sx = nuovo.sx;
    tf.x = Math.round(t.tf0.x + (q1 ? dove.x - q1.cx : 0));
    tf.y = Math.round(t.tf0.y + (q1 ? dove.y - q1.cy : 0));
  }

  /** accende o spegne il movimento: acceso, la fine parte uguale all'inizio e si va a sistemarla */
  private alternaMoto() {
    const b = this.bersaglio();
    if (!b) return;
    const acceso = b.fx ? !!b.c.fxb!.posFine : !!b.c.tfFine;
    store.edit(acceso ? 'Movimento spento' : 'Movimento', (p) => {
      const c = p.clips.find((x) => x.id === b.c.id);
      if (!c) return;
      if (b.fx) {
        if (acceso) { delete c.fxb!.posFine; delete c.fxb!.via; } else c.fxb!.posFine = [...(c.fxb!.pos ?? [0.5, 0.5])] as [number, number];
        if (!c.fxb!.pos) c.fxb!.pos = [0.5, 0.5];
      } else if (acceso) { delete c.tfFine; delete c.via; } else c.tfFine = structuredClone(c.tf);
    });
    if (!acceso) this.vai(1);
  }

  /** va a una tappa (0 = partenza, l'ultima = arrivo) e la sceglie */
  private vai(i: number) {
    const b = this.bersaglio() ?? (() => { const c = store.doc.clips.find((x) => store.sel.has(x.id)); return c ? { c, fx: c.kind === 'fx' } : null; })();
    if (!b) return;
    const tappe = b.fx ? tappePos(b.c.fxb!) : tappeTf(b.c);
    const t = tappe[Math.min(tappe.length - 1, i)];
    motore.vaiA(t ? fotogrammaDi(b.c, t.t, b.fx) : b.c.start);
    store.select([b.c.id]);
  }

  /** una tappa nuova dove sta il cursore (se non ce n'è già una) */
  private nuovaTappaQui() {
    const b = this.bersaglio();
    if (!b) return;
    if (b.chiave >= 0) { avviso('Qui c\'è già una tappa: muovi il cursore altrove', 'info', 1600); return; }
    const f = Math.floor(store.head + 1e-6);
    store.edit('Nuova tappa', () => { this.creaTappa(b.c.id, b.fx, b.x, f); });
  }

  private togliTappa() {
    const b = this.bersaglio();
    if (!b || b.chiave < 1) return;
    const i = b.chiave;
    store.edit('Toglie una tappa', (p) => {
      const c = p.clips.find((x) => x.id === b.c.id);
      if (!c) return;
      const t = (b.fx ? tappePos(c.fxb!) : tappeTf(c))[i];
      if (!t) return;
      if (b.fx) c.fxb!.via = (c.fxb!.via ?? []).filter((v) => v.t !== t.t);
      else c.via = (c.via ?? []).filter((v) => v.t !== t.t);
    });
  }

  private rimetti() {
    const b = this.bersaglio();
    if (!b) return;
    store.edit('Rimetti a posto', (p) => {
      const c = p.clips.find((x) => x.id === b.c.id);
      if (!c) return;
      if (b.fx) { delete c.fxb!.pos; delete c.fxb!.posFine; delete c.fxb!.via; delete c.fxb!.segue; return; }
      // tiene angoli e ombra (la cornice), rimette posizione e grandezza
      const tieni = { angoli: c.tf.angoli, ombra: c.tf.ombra };
      c.tf = { ...TF0, ...tieni };
      delete c.tfFine;
      delete c.via;
    });
  }

  // ——— le scelte sull'immagine (contagocce, clic dell'oggetto) ———
  private avviaScelta(sc: SceltaImmagine) {
    const p = store.doc, c = p.clips.find((x) => x.id === sc.id);
    if (!c) return;
    const f = Math.floor(store.head + 1e-6);
    if (f < c.start || f >= end(c)) { avviso('Metti il cursore dentro la clip', 'info', 2600); return; }
    if (motore.playing) motore.stop();
    motore.setMonitor('recorder');
    this.mira = null;
    this.scelta = sc;
    this.ridisegna();
  }

  private esciScelta() {
    if (!this.scelta) return;
    this.scelta = null;
    this.tintaScelta = null;
    this.ridisegna();
  }

  /** OK: la selezione è giusta, si procede e la scelta si chiude */
  private confermaScelta() {
    const sc = this.scelta;
    if (!sc?.conferma) return;
    if (!sc.maschera?.()) { avviso('Prima clicca su quello che vuoi tenere: appena è selezionato (verde) premi OK', 'info', 2600); return; }
    this.esciScelta();
    sc.conferma();
  }

  /** i tasti della barra della scelta: il modo acceso, la frase di stato, OK acceso solo se c'è una selezione */
  private aggiornaScelta() {
    const sc = this.scelta;
    if (!sc) return;
    this.sceltaStato.textContent = sc.stato?.() ?? '';
    this.sceltaModi.hidden = !sc.modi?.length;
    if (sc.modi?.length) {
      const chiave = sc.modi.map((m) => m.id).join();
      if (this.sceltaModi.dataset.chiave !== chiave) {
        this.sceltaModi.dataset.chiave = chiave;
        this.sceltaModi.replaceChildren(...sc.modi.map((m) => h('button', { class: 'pos-btn', 'data-modo': m.id, title: m.info, on: { click: () => sc.scegliModo?.(m.id) } }, m.nome)));
      }
      const acceso = sc.modoAttuale?.();
      this.sceltaModi.querySelectorAll('button').forEach((b) => b.classList.toggle('acceso', (b as HTMLElement).dataset.modo === acceso));
    }
    this.bOk.hidden = !sc.conferma;
    this.bOk.disabled = !sc.maschera?.();
  }

  private giuScelta(e: PointerEvent, x: number, y: number) {
    const sc = this.scelta!;
    const p = store.doc, c = p.clips.find((z) => z.id === sc.id);
    if (!c) { this.esciScelta(); return; }
    e.preventDefault();
    e.stopPropagation();
    const f = Math.floor(store.head + 1e-6);
    const q = immagineDa(p, c, f, x, y);
    if (!q || q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) { avviso('Clicca sull\'immagine della clip', 'info', 1800); return; }
    sc.clic(q.x, q.y, e.altKey);
    if (!sc.continua) this.scelta = null;
    this.ridisegna();
  }

  /** tasto destro durante la scelta: toglie il punto lì sotto (se la scelta lo sa fare) */
  private destroScelta(e: PointerEvent, x: number, y: number) {
    const sc = this.scelta!;
    const p = store.doc, c = p.clips.find((z) => z.id === sc.id);
    if (!c || !sc.destro) return;
    e.preventDefault();
    e.stopPropagation();
    const q = immagineDa(p, c, Math.floor(store.head + 1e-6), x, y);
    if (!q) return;
    sc.destro(q.x, q.y);
    this.ridisegna();
  }

  private disegnaScelta(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const sc = this.scelta!, p = store.doc, f = Math.floor(store.head + 1e-6);
    const c = p.clips.find((x) => x.id === sc.id);
    if (!c) return;
    const k = W / p.w, dpr = W / Math.max(1, this.sopra.getBoundingClientRect().width);
    const seg = spostaTraccia(p, c, f);
    ctx.save();
    // la selezione di prova: verde trasparente con il bordo bianco, ben allineata all'immagine (anche se la clip è mossa o girata)
    const mk = sc.maschera?.();
    if (mk) {
      const sul = (x: number, y: number) => { const o = sulQuadro(p, c, x, y, f); return o ? [(p.w / 2 + o[0] + seg.dx) * k, (p.h / 2 + o[1] + seg.dy) * k] : null; };
      const A = sul(0, 0), B = sul(1, 0), C = sul(0, 1);
      if (A && B && C) {
        if (!this.tintaScelta || this.tintaScelta.dati !== mk.dati) this.tintaScelta = { dati: mk.dati, tela: tintaDa(mk) };
        ctx.setTransform((B[0] - A[0]) / mk.w, (B[1] - A[1]) / mk.w, (C[0] - A[0]) / mk.h, (C[1] - A[1]) / mk.h, A[0], A[1]);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.tintaScelta.tela, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
    for (const pt of sc.punti?.() ?? []) {
      const o = sulQuadro(p, c, pt.x, pt.y, f);
      if (!o) continue;
      const X = (p.w / 2 + o[0] + seg.dx) * k, Y = (p.h / 2 + o[1] + seg.dy) * k;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(X, Y, 9 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = pt.dentro ? '#5dd39e' : '#ff4d6d';
      ctx.fillStyle = pt.dentro ? '#5dd39e' : '#ff4d6d';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(X, Y, 9 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X - 5 * dpr, Y); ctx.lineTo(X + 5 * dpr, Y);
      if (pt.dentro) { ctx.moveTo(X, Y - 5 * dpr); ctx.lineTo(X, Y + 5 * dpr); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ——— il tracking ———
  private avviaMira() {
    const b = this.bersaglio();
    const c = b && !b.fx ? b.c : store.doc.clips.find((x) => store.sel.has(x.id));
    const p = store.doc;
    if (!c || c.kind !== 'media' || mediaOf(p, c)?.type !== 'video') { avviso('Scegli una ripresa video nel monitor, poi premi Segui', 'info', 2600); return; }
    const f = Math.floor(store.head + 1e-6);
    if (f < c.start || f >= end(c)) { avviso('Metti il cursore dentro la clip, dove l\'oggetto si vede bene', 'info', 2600); return; }
    if (motore.playing) motore.stop();
    motore.setMonitor('recorder');
    this.scelta = null;
    this.mira = { id: c.id, x: 0.5, y: 0.5, lato: 0.12, lavoro: false, prog: 0 };
    this.ferma = false;
    this.ridisegna();
    avviso('🎯 Trascina il mirino sull\'oggetto, poi ▶ Avvia', 'info', 3000);
  }

  private esciMira() {
    if (this.mira?.lavoro) { this.ferma = true; return; }
    this.mira = null;
    this.ridisegna();
  }

  private giuMira(e: PointerEvent, x: number, y: number) {
    const m = this.mira!;
    if (m.lavoro) return;
    const p = store.doc, c = p.clips.find((z) => z.id === m.id);
    if (!c) return;
    e.preventDefault();
    e.stopPropagation();
    const f = Math.floor(store.head + 1e-6);
    const metti = (X: number, Y: number) => {
      const q = immagineDa(p, c, f, X, Y);
      if (!q) return;
      m.x = Math.max(0.01, Math.min(0.99, q.x)); m.y = Math.max(0.01, Math.min(0.99, q.y));
      this.ridisegna();
    };
    metti(x, y);
    this.schermo.setPointerCapture(e.pointerId);
    const muovi = (ev: PointerEvent) => { const pt = this.punto(ev); metti(pt.x, pt.y); };
    const su = () => { this.schermo.removeEventListener('pointermove', muovi); this.schermo.removeEventListener('pointerup', su); this.schermo.removeEventListener('pointercancel', su); };
    this.schermo.addEventListener('pointermove', muovi);
    this.schermo.addEventListener('pointerup', su);
    this.schermo.addEventListener('pointercancel', su);
  }

  /** segue l'oggetto e mette i punti nella clip */
  private async segui() {
    const m = this.mira;
    if (!m || m.lavoro) return;
    const p = store.doc, c = p.clips.find((z) => z.id === m.id);
    if (!c?.media) return;
    const f = Math.floor(store.head + 1e-6);
    const t0 = srcTimeAt(p, c, f);
    const r = fps(p.rate);
    const inizio = c.srcIn, fine = c.srcIn + (c.len / r) * c.speed;
    m.lavoro = true; m.prog = 0;
    this.ferma = false;
    const rt = mediaRT(c.media);
    if (!rt?.v) { avviso('Questa ripresa non si può leggere qui', 'errore'); m.lavoro = false; return; }
    const tr = await seguiOggetto(c.media, {
      da: t0, x: m.x, y: m.y, lato: m.lato, inizio, fine,
      avanza: (k) => { m.prog = k; this.ridisegna(); },
      ferma: () => this.ferma,
    });
    this.mira = null;
    if (!tr || tr.punti.length < 2) { avviso('Non riesco a seguire questo punto: scegli un dettaglio con più contrasto', 'info', 3500); this.ridisegna(); return; }
    store.edit('Segui un oggetto', (pp) => { const z = pp.clips.find((x) => x.id === c.id); if (z) z.traccia = tr; });
    // finito il tracking: si apre il pannello sulla sezione "Segui un oggetto", con tutto quello che si può mettere sopra
    if (tr.fiducia > 0.2) setTimeout(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'segui' })), 80);
    avviso(tr.fiducia > 0.5 ? '🎯 Oggetto seguito: ora un titolo, un effetto o un\'immagine lo può seguire (nelle proprietà, "Segui")' : '🎯 Seguito, ma in qualche punto era incerto: guarda il percorso azzurro e, se serve, rifai', 'ok', 4200);
    this.ridisegna();
  }
}

/** le maniglie: gli angoli e i punti di mezzo dei lati (sx, sy: da -1 a 1) */
const MANIGLIE: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]];

function rettangolo(ctx: CanvasRenderingContext2D, q: Riquadro, k: number, col: string) {
  ctx.save();
  ctx.translate(q.cx * k, q.cy * k);
  ctx.rotate(q.rot);
  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.strokeRect((-q.w / 2) * k - 1, (-q.h / 2) * k - 1, q.w * k + 2, q.h * k + 2);
  ctx.strokeStyle = col;
  ctx.strokeRect((-q.w / 2) * k, (-q.h / 2) * k, q.w * k, q.h * k);
  ctx.restore();
}

void passaPer;
