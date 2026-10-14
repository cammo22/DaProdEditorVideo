// Gli attrezzi comuni delle animazioni: i tempi (come in GSAP: power3.out, back.out…), il caso che dà sempre lo
// stesso risultato, i caratteri, le forme. Ogni animazione è una funzione del tempo: dato t disegna quel fotogramma,
// niente stato da ricordare, così monitor, anteprime ed export vedono la stessa cosa.
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Valori = Record<string, string | number | boolean>;

/** il fotogramma da disegnare: coordinate "virtuali" alte 1080 (la larghezza segue il formato), t e d in secondi */
export interface Q {
  c: Ctx2D; w: number; h: number; t: number; d: number; v: Valori;
  /** solo nella prova di misura (vedi `conAdatta`): chi disegna dice quanto è larga la sua scheda */
  misura?: (larghezza: number) => void;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ——— i tempi ———
export type Ease = (x: number) => number;
export const E = {
  lineare: ((x) => x) as Ease,
  p2in: ((x) => x * x) as Ease,
  p2out: ((x) => 1 - (1 - x) * (1 - x)) as Ease,
  p2io: ((x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)) as Ease,
  p3in: ((x) => x * x * x) as Ease,
  p3out: ((x) => 1 - Math.pow(1 - x, 3)) as Ease,
  p3io: ((x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)) as Ease,
  p4out: ((x) => 1 - Math.pow(1 - x, 4)) as Ease,
  p4io: ((x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2)) as Ease,
  /** si passa un po' oltre e si torna (come back.out di GSAP) */
  back: (s = 1.7): Ease => (x) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  elastica: ((x) => (x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)) as Ease,
  rimbalzo: ((x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; }
    if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; }
    x -= 2.625 / d; return n * x * x + 0.984375;
  }) as Ease,
  expo: ((x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x))) as Ease,
  seno: ((x) => -(Math.cos(Math.PI * x) - 1) / 2) as Ease,
};

/** quanto è andato avanti un tratto: parte a t0, dura "dur" secondi (0..1, già con la curva) */
export const prog = (t: number, t0: number, dur: number, e: Ease = E.p3out) => e(clamp01((t - t0) / Math.max(1e-6, dur)));

/** 1 dopo l'entrata e fino a "usc" secondi dalla fine, poi scende a 0 (l'uscita sta sempre in fondo alla clip) */
export const resta = (q: Q, usc = 0.4, e: Ease = E.p2in) => 1 - e(clamp01((q.t - (q.d - usc)) / Math.max(1e-6, usc)));

/** un numero fra 0 e 1 che dipende solo da (i, k): sempre lo stesso */
export const caso = (i: number, k = 0) => {
  const s = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
};

// ——— colori ———
export const rgb = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})/i.exec(h || '');
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const hexA = (h: string, a: number) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${clamp01(a)})`; };
/** mescola due colori (k = quanto del secondo) */
export const mixa = (a: string, b: string, k: number) => {
  const x = rgb(a), y = rgb(b);
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], k))).join(',')})`;
};
export const scuro = (h: string, k = 0.35) => mixa(h, '#000000', k);
export const chiaro = (h: string, k = 0.35) => mixa(h, '#ffffff', k);
/** il colore più adatto per scrivere sopra: nero o bianco */
export const sopra = (h: string) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#141518' : '#ffffff'; };

// ——— caratteri ———
export const FONT = {
  montserrat: '"Montserrat", "Segoe UI", system-ui, sans-serif',
  oswald: '"Oswald", "Arial Narrow", sans-serif',
  archivo: '"Archivo Black", "Arial Black", sans-serif',
  mono: '"Space Mono", "Courier New", monospace',
  bebas: '"Bebas Neue", "Oswald", Impact, sans-serif',
  playfair: '"Playfair Display", Georgia, serif',
  vibes: '"Great Vibes", "Brush Script MT", cursive',
  cormorant: '"Cormorant Garamond", Georgia, serif',
  caveat: '"Caveat", "Segoe Print", cursive',
  rajdhani: '"Rajdhani", "Segoe UI", sans-serif',
  orbitron: '"Orbitron", "Rajdhani", sans-serif',
} as const;
export type Famiglia = keyof typeof FONT;

/** i caratteri a scelta dell'utente (campo "font" delle animazioni) */
export const FAMIGLIE: [Famiglia, string][] = [
  ['montserrat', 'Montserrat (pulito)'], ['oswald', 'Oswald (stretto)'], ['archivo', 'Archivo Black (pesante)'], ['bebas', 'Bebas Neue (titoli)'],
  ['playfair', 'Playfair (elegante)'], ['cormorant', 'Cormorant (raffinato)'], ['vibes', 'Great Vibes (corsivo)'], ['caveat', 'Caveat (a mano)'],
  ['mono', 'Space Mono (macchina)'], ['rajdhani', 'Rajdhani'], ['orbitron', 'Orbitron (digitale)'],
];
export const famiglia = (v: Valori, k = 'font', def: Famiglia = 'montserrat'): string => FONT[(v[k] as Famiglia) in FONT ? (v[k] as Famiglia) : def];

export interface OpzTesto {
  font: string;
  colore?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  /** spazio in più fra le lettere, in pixel virtuali */
  spazio?: number;
  ombra?: { blur: number; colore?: string; y?: number };
  alfa?: number;
  contorno?: { colore: string; px: number };
  maiuscolo?: boolean;
}

/** la larghezza di un testo (con lo spazio fra le lettere) */
export function larg(c: Ctx2D, s: string, font: string, spazio = 0): number {
  c.font = font;
  // con lo spazio fra le lettere `scrivi` le disegna una per una (senza kerning): la misura dev'essere la stessa
  if (spazio) { let w = 0; for (const ch of s) w += c.measureText(ch).width; return w + spazio * Math.max(0, [...s].length - 1); }
  return c.measureText(s).width;
}

/** scrive un testo; ritorna la larghezza. (x, y) è il punto d'ancora secondo align e base */
export function scrivi(c: Ctx2D, s: string, x: number, y: number, o: OpzTesto): number {
  const testo = o.maiuscolo ? s.toUpperCase() : s;
  c.save();
  c.font = o.font;
  c.textBaseline = o.base ?? 'alphabetic';
  c.globalAlpha *= o.alfa ?? 1;
  if (o.ombra) { c.shadowBlur = o.ombra.blur; c.shadowColor = o.ombra.colore ?? 'rgba(0,0,0,.45)'; c.shadowOffsetY = o.ombra.y ?? 2; }
  const w = larg(c, testo, o.font, o.spazio ?? 0);
  let x0 = x;
  const al = o.align ?? 'left';
  if (al === 'center') x0 = x - w / 2; else if (al === 'right') x0 = x - w;
  c.textAlign = 'left';
  c.fillStyle = o.colore ?? '#fff';
  if (o.contorno) { c.lineWidth = o.contorno.px; c.strokeStyle = o.contorno.colore; c.lineJoin = 'round'; }
  if (!o.spazio) {
    if (o.contorno) c.strokeText(testo, x0, y);
    c.fillText(testo, x0, y);
  } else {
    let px = x0;
    for (const ch of testo) {
      if (o.contorno) c.strokeText(ch, px, y);
      c.fillText(ch, px, y);
      px += c.measureText(ch).width + o.spazio;
    }
  }
  c.restore();
  return w;
}

/** la grandezza (al massimo "size") a cui il testo sta largo al massimo maxW */
export function adatta(c: Ctx2D, s: string, fontDi: (px: number) => string, size: number, maxW: number, spazio = 0): number {
  const w = larg(c, s, fontDi(size), spazio);
  return w > maxW ? Math.max(14, size * (maxW / w)) : size;
}

/** va a capo il testo in righe larghe al massimo "max" pixel */
export function righe(c: Ctx2D, s: string, font: string, max: number, spazio = 0): string[] {
  const out: string[] = [];
  for (const par of s.split('\n')) {
    let riga = '';
    for (const parola of par.split(/\s+/).filter(Boolean)) {
      const prova = riga ? riga + ' ' + parola : parola;
      if (riga && larg(c, prova, font, spazio) > max) { out.push(riga); riga = parola; } else riga = prova;
    }
    out.push(riga);
  }
  return out;
}

// ——— forme ———
export function rettTondo(c: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** un riquadro che si scopre da sinistra (k = 0..1) o si copre da destra (da: 'sx' | 'dx') */
export function scopri(c: Ctx2D, x: number, y: number, w: number, h: number, da: 'sx' | 'dx' | 'su' | 'giu', k: number) {
  c.beginPath();
  if (da === 'sx') c.rect(x, y, w * k, h);
  else if (da === 'dx') c.rect(x + w * (1 - k), y, w * k, h);
  else if (da === 'su') c.rect(x, y, w, h * k);
  else c.rect(x, y + h * (1 - k), w, h * k);
  c.clip();
}

/** il punto d'inizio di un blocco largo "bw" secondo la posizione scelta (sinistra, centro, destra) */
export function ancora(q: Q, bw: number, margine = 120): number {
  q.misura?.(bw);
  const pos = String(q.v.pos ?? 'sinistra');
  return pos === 'centro' ? (q.w - bw) / 2 : pos === 'destra' ? q.w - margine - bw : margine;
}

/** il testo di un campo, o quello di riserva se è vuoto */
export const tx = (q: Q, k: string, def = '') => { const s = String(q.v[k] ?? def); return s.trim() ? s : def; };
export const num = (q: Q, k: string, def = 0) => { const n = Number(q.v[k]); return Number.isFinite(n) ? n : def; };
export const col = (q: Q, k: string, def = '#ffffff') => { const s = String(q.v[k] ?? def); return /^#[0-9a-f]{6}/i.test(s) ? s : def; };

/** una stella a n punte */
export function stella(c: Ctx2D, cx: number, cy: number, r: number, punte = 5, rapporto = 0.45, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < punte * 2; i++) {
    const a = rot + (i * Math.PI) / punte, rr = i % 2 ? r * rapporto : r;
    if (i) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath();
}

/** un cuore centrato in (cx, cy) alto circa "s" */
export function cuore(c: Ctx2D, cx: number, cy: number, s: number) {
  c.beginPath();
  c.moveTo(cx, cy + s * 0.35);
  c.bezierCurveTo(cx - s * 0.75, cy - s * 0.05, cx - s * 0.5, cy - s * 0.62, cx, cy - s * 0.25);
  c.bezierCurveTo(cx + s * 0.5, cy - s * 0.62, cx + s * 0.75, cy - s * 0.05, cx, cy + s * 0.35);
  c.closePath();
}

/** il fotogramma è dentro lo schermo (virtuale) con un margine? serve a non disegnare quello che non si vede */
export const visibile = (q: Q, x: number, y: number, m = 80) => x > -m && x < q.w + m && y > -m && y < q.h + m;

/** un testo sfocato (senza ctx.filter, che non c'è dappertutto): si disegna lontano e se ne tiene solo l'ombra morbida */
export function scriviSfocato(c: Ctx2D, s: string, x: number, y: number, o: OpzTesto, sfoca: number) {
  if (sfoca < 0.4) { scrivi(c, s, x, y, o); return; }
  const sc = c.getTransform().a || 1, LONTANO = 20000;
  c.save();
  c.shadowColor = o.colore ?? '#fff';
  c.shadowBlur = sfoca * sc;
  c.shadowOffsetX = LONTANO;
  c.shadowOffsetY = 0;
  // il testo vero finisce fuori dallo schermo: resta solo la sua ombra, sfocata
  scrivi(c, s, x - LONTANO / sc, y, { ...o, ombra: undefined, colore: o.colore ?? '#fff' });
  c.restore();
}

/** i numeri all'italiana: 12.840 */
export const migliaia = (n: number) => Math.round(n).toLocaleString('it-IT');

/**
 * Un contesto "muto": misura i testi come quello vero (font, measureText) ma non disegna niente. Serve a sapere quanto
 * viene larga una scheda prima di disegnarla.
 */
export function muto(c: Ctx2D): Ctx2D {
  const noop = () => undefined;
  const gradiente = () => ({ addColorStop: noop });
  const passa = new Set(['font', 'letterSpacing', 'textAlign', 'textBaseline', 'fontKerning', 'wordSpacing']);
  const finto = new Proxy({} as Ctx2D, {
    get(_t, k: string) {
      const v = (c as unknown as Record<string, unknown>)[k];
      if (typeof v !== 'function') return v;
      if (k === 'measureText' || k === 'getTransform') return (v as (...a: unknown[]) => unknown).bind(c);
      if (k.startsWith('create')) return gradiente;
      return noop;
    },
    set(_t, k: string, val) { if (passa.has(k)) (c as unknown as Record<string, unknown>)[k] = val; return true; },
  });
  return finto;
}

/**
 * Fa stare un'animazione nello schermo qualunque sia il testo: la prima volta la "disegna" a vuoto per sapere quanto
 * viene larga la sua scheda (chi disegna lo dice con `ancora`, o con `q.misura`), e se è più larga dello schermo meno i
 * margini, la rifà più piccola (la grandezza `dim` si accorcia in proporzione: nomi lunghi non coprono più il resto).
 */
export function conAdatta(fn: (q: Q) => void, margine = 130): (q: Q) => void {
  return (q) => {
    let w = 0;
    q.c.save();
    try { fn({ ...q, c: muto(q.c), misura: (x) => { w = Math.max(w, x); } }); } catch { /* si disegna lo stesso */ }
    q.c.restore();
    const max = q.w - margine * 2;
    const dim = Number(q.v.dim);
    const v = w > max && max > 100 ? { ...q.v, dim: (Number.isFinite(dim) && dim > 0 ? dim : 100) * (max / w) } : q.v;
    fn({ ...q, v, misura: undefined });
  };
}

/** il testo accorciato con "…" in fondo perché stia in `max` pixel (col font già scelto) */
export function accorcia(c: Ctx2D, s: string, font: string, max: number, spazio = 0): string {
  if (larg(c, s, font, spazio) <= max) return s;
  let a = [...s];
  while (a.length > 1 && larg(c, a.join('') + '…', font, spazio) > max) a.pop();
  return a.join('').trimEnd() + '…';
}
