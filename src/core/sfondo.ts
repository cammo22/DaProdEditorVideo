// Togliere lo sfondo: le cose pure (niente browser, niente modelli) che servono sia alla chiave a colori sia al
// ritaglio con l'AI: i valori di partenza, la firma dei parametri, dove cadono i campioni nel tempo, il colore
// dello sfondo trovato da solo, il riquadro di una maschera, la levigatura da un fotogramma all'altro.
import type { Clip, MediaItem, Ritaglio, VideoFx } from './tipi';

export const RITAGLIO0: Ritaglio = { modo: 'soggetto', modello: 'ben2', bordo: 0, morbido: 0.3, qualita: 1 };

/** precisione: fotogrammi al secondo, lato lungo dell'immagine che si dà al modello, e il nome */
export const QUALITA_RITAGLIO = [
  { nome: 'Veloce', hz: 4, lato: 384 },
  { nome: 'Buona', hz: 8, lato: 512 },
  { nome: 'Alta', hz: 12, lato: 768 },
] as const;

/** il tetto di memoria per tutte le maschere di una clip (se sono troppe si guarda un po' meno spesso) */
export const BUDGET_MASCHERE = 120 * 1024 * 1024;

/** le chiavi a colori al loro valore di partenza */
export const CHIAVI = [
  { id: 'verde', nome: 'Green screen', colore: '#00b140' },
  { id: 'verdeVivo', nome: 'Verde vivo', colore: '#00ff2a' },
  { id: 'blu', nome: 'Blue screen', colore: '#0047bb' },
  { id: 'magenta', nome: 'Magenta', colore: '#ff00cc' },
] as const;

export const SPILL0 = 0.5;

/** i colori della chiave accesi (il principale più gli altri, al massimo tre) */
export const coloriChiave = (fx: Pick<VideoFx, 'keyColor' | 'keyColori'>) => [fx.keyColor, ...(fx.keyColori ?? [])].slice(0, 3);

export function hexRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})/i.exec(h ?? '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** la firma dei parametri di un ritaglio: se cambia, le maschere fatte non valgono più */
export function firmaRitaglio(media: string, r: Ritaglio): string {
  // (l'oggetto si scrive solo dal secondo in poi: le firme delle maschere già fatte con un oggetto solo restano uguali)
  const punti = r.modo === 'oggetti' ? (r.punti ?? []).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.dentro ? 1 : 0}${p.g ? ':' + p.g : ''}`).join(';') : '';
  return [media, r.modo, r.modello, r.qualita, punti, r.modo === 'oggetti' ? (r.da ?? 0).toFixed(2) : '', r.segui ? 's' : '', r.modo === 'oggetti' && r.persona ? 'p' : ''].join('|');
}

/** i fotogrammi da elaborare: da "da" a "a" (secondi della sorgente), ogni 1/hz, abbassando hz se le maschere
 *  non starebbero nel budget (w×h byte l'una). Mai meno di 2 al secondo. */
export function istantiCampioni(da: number, a: number, hz: number, w: number, h: number, budget = BUDGET_MASCHERE): { t0: number; dt: number; n: number; hz: number } {
  const durata = Math.max(1e-3, a - da);
  let f = Math.max(1, hz);
  const per = Math.max(1, w * h);
  while (f > 2 && Math.ceil(durata * f) + 1 > budget / per) f = Math.max(2, f - 1);
  const n = Math.max(1, Math.ceil(durata * f) + 1);
  return { t0: da, dt: n > 1 ? durata / (n - 1) : durata, n, hz: f };
}

/** fra quali due campioni cade il tempo t, e quanto verso il secondo (0..1) */
export function campioneAl(t: number, t0: number, dt: number, n: number): { i: number; j: number; k: number } {
  if (n <= 1 || dt <= 0) return { i: 0, j: 0, k: 0 };
  const x = Math.max(0, Math.min(n - 1, (t - t0) / dt));
  const i = Math.min(n - 2, Math.floor(x));
  return { i, j: i + 1, k: x - i };
}

/** il colore di sfondo che si vede lungo i bordi del fotogramma (per la chiave "trovalo da solo"): il colore
 *  più saturo che occupa almeno un quarto della cornice; se non c'è, la media della cornice */
export function coloreDominante(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): { colore: string; saturazione: number; quota: number } {
  const B = 24;
  const n = new Array<number>(B).fill(0), sr = new Array<number>(B).fill(0), sg = new Array<number>(B).fill(0), sb = new Array<number>(B).fill(0);
  const spessore = Math.max(2, Math.round(Math.min(w, h) * 0.08));
  let tot = 0, mr = 0, mg = 0, mb = 0;
  const passo = Math.max(1, Math.floor(Math.max(w, h) / 160));
  for (let y = 0; y < h; y += passo) {
    for (let x = 0; x < w; x += passo) {
      if (x >= spessore && x < w - spessore && y >= spessore && y < h - spessore) { x = Math.max(x, w - spessore - 1); continue; }
      const i = (y * w + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      tot++; mr += r; mg += g; mb += b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = mx ? (mx - mn) / mx : 0;
      if (s < 0.25 || mx < 40) continue;
      let hh: number;
      const d = mx - mn;
      if (mx === r) hh = ((g - b) / d + 6) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
      const k = Math.min(B - 1, Math.floor((hh / 6) * B));
      n[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
    }
  }
  if (!tot) return { colore: '#00b140', saturazione: 0, quota: 0 };
  // un bucket e i due vicini (il verde di un fondale cade a cavallo di due)
  let best = 0, bk = -1;
  for (let k = 0; k < B; k++) {
    const c = n[k] + n[(k + 1) % B] + n[(k + B - 1) % B];
    if (c > best) { best = c; bk = k; }
  }
  if (bk >= 0 && best >= tot * 0.25) {
    let a = 0, r = 0, g = 0, b = 0;
    for (const k of [bk, (bk + 1) % B, (bk + B - 1) % B]) { a += n[k]; r += sr[k]; g += sg[k]; b += sb[k]; }
    const R = r / a, G = g / a, Bb = b / a, mx = Math.max(R, G, Bb), mn = Math.min(R, G, Bb);
    return { colore: rgbHex(R, G, Bb), saturazione: mx ? (mx - mn) / mx : 0, quota: best / tot };
  }
  return { colore: rgbHex(mr / tot, mg / tot, mb / tot), saturazione: 0, quota: 0 };
}

/** il riquadro di quello che la maschera tiene (frazioni 0..1), il centro e quanta parte dell'immagine occupa */
export function riquadroMaschera(m: Uint8Array, w: number, h: number, soglia = 128): { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; area: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x] < soglia) continue;
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!n) return null;
  return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h, cx: sx / n / w, cy: sy / n / h, area: n / (w * h) };
}

/** levigatura da un fotogramma all'altro: dove il vicino è quasi uguale si mescola un po' (meno tremolio sui bordi),
 *  dove è molto diverso è movimento vero e si lascia com'è */
export function levigaMaschere(ms: Uint8Array[]): void {
  if (ms.length < 3) return;
  let prima = Uint8Array.from(ms[0]);
  for (let i = 1; i < ms.length - 1; i++) {
    const m = ms[i], dopo = ms[i + 1];
    const mia = Uint8Array.from(m);
    for (let k = 0; k < m.length; k++) {
      const a = prima[k], b = dopo[k], v = mia[k];
      let s = v * 2, pesi = 2;
      if (Math.abs(a - v) < 48) { s += a; pesi++; }
      if (Math.abs(b - v) < 48) { s += b; pesi++; }
      m[k] = Math.round(s / pesi);
    }
    prima = mia;
  }
}

/** ridimensiona una maschera (bilineare) */
export function ridimensionaMaschera(m: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
  if (w === W && h === H) return m;
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(h - 1, ((y + 0.5) * h) / H - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(w - 1, ((x + 0.5) * w) / W - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = m[y0 * w + x0] * (1 - tx) + m[y0 * w + x1] * tx, b = m[y1 * w + x0] * (1 - tx) + m[y1 * w + x1] * tx;
      o[y * W + x] = Math.round(a * (1 - ty) + b * ty);
    }
  }
  return o;
}

/** l'istante della sorgente (secondi) dove la clip comincia e dove finisce */
export function trattoSorgente(c: Clip, r: number): { da: number; a: number } {
  return { da: c.srcIn, a: c.srcIn + (c.len / r) * c.speed };
}

/** il ritaglio vale per questa clip? (serve un video o un'immagine vera) */
export const puoRitagliare = (m: MediaItem | undefined) => !!m && (m.type === 'image' || m.type === 'video') && m.width > 0;

// ——— maschere più pulite: buchi, isole e fotogrammi che sbagliano da soli ———

export interface OpzioniPulizia {
  /** la maschera del fotogramma di prima: le parti che non la toccano sono quasi sempre un altro soggetto o un errore */
  vicino?: Uint8Array | null;
  /** punti (frazioni del quadro) che devono restare: i clic sull'oggetto */
  tieni?: [number, number][];
  /** i buchi dentro il soggetto più piccoli di questa parte del quadro si riempiono (di partenza il 2%) */
  buchiMax?: number;
  /** le isole più piccole di questa parte della più grande si tolgono, se non toccano il fotogramma di prima (di partenza il 12%) */
  isoleMin?: number;
  /** si tiene solo quello che tocca il fotogramma di prima o i clic (un oggetto scelto), non tutte le persone */
  soloConnessi?: boolean;
}

/**
 * Pulisce la maschera di un fotogramma: riempie i buchi dentro il soggetto (la camicia a pezzi, le macchie) e toglie le isole
 * sparse che non c'entrano. Non tocca i bordi morbidi: cambia solo i pezzi interi.
 */
export function pulisciMaschera(m: Uint8Array, w: number, h: number, o: OpzioniPulizia = {}): Uint8Array {
  const n = w * h;
  const out = Uint8Array.from(m);
  const fuori = new Int32Array(n).fill(-1);
  const coda = new Int32Array(n);
  /** riempie la componente che parte da `i` (4 vicini) con valori dove `dentro(valore)`; ritorna l'elenco dei pixel */
  const componente = (i0: number, id: number, dentro: (k: number) => boolean): number => {
    let testa = 0, fine = 0;
    coda[fine++] = i0; fuori[i0] = id;
    while (testa < fine) {
      const k = coda[testa++];
      const x = k % w, y = (k / w) | 0;
      if (x > 0 && fuori[k - 1] < 0 && dentro(k - 1)) { fuori[k - 1] = id; coda[fine++] = k - 1; }
      if (x < w - 1 && fuori[k + 1] < 0 && dentro(k + 1)) { fuori[k + 1] = id; coda[fine++] = k + 1; }
      if (y > 0 && fuori[k - w] < 0 && dentro(k - w)) { fuori[k - w] = id; coda[fine++] = k - w; }
      if (y < h - 1 && fuori[k + w] < 0 && dentro(k + w)) { fuori[k + w] = id; coda[fine++] = k + w; }
    }
    return fine;
  };
  // 1) il primo piano: le isole
  const primo = (k: number) => m[k] >= 128;
  const isole: { id: number; area: number; tocca: number; conClic: boolean; pixel: Int32Array }[] = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (fuori[i] >= 0 || !primo(i)) continue;
    const area = componente(i, id, primo);
    const pixel = coda.slice(0, area);
    let tocca = 0;
    if (o.vicino) for (let j = 0; j < area; j++) if (o.vicino[pixel[j]] >= 128) tocca++;
    let conClic = false;
    for (const [fx, fy] of o.tieni ?? []) {
      const px = Math.min(w - 1, Math.max(0, Math.round(fx * w))), py = Math.min(h - 1, Math.max(0, Math.round(fy * h)));
      // il clic può cadere a un pixel dal bordo: si guarda anche il vicinato
      for (let dy = -2; dy <= 2 && !conClic; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = px + dx, Y = py + dy;
        if (X >= 0 && X < w && Y >= 0 && Y < h && fuori[Y * w + X] === id) { conClic = true; break; }
      }
    }
    isole.push({ id, area, tocca, conClic, pixel });
    id++;
  }
  if (isole.length) {
    const grande = isole.reduce((a, b) => (b.area > a.area ? b : a));
    const min = (o.isoleMin ?? 0.12) * grande.area;
    const legata = (z: (typeof isole)[number]) => z.conClic || (!!o.vicino && z.tocca >= 0.3 * z.area);
    const qualcunaLegata = isole.some(legata);
    for (const z of isole) {
      let tieni: boolean;
      if (o.soloConnessi) tieni = qualcunaLegata ? legata(z) : z === grande;
      else tieni = z === grande || legata(z) || z.area >= min;
      if (!tieni) for (let j = 0; j < z.area; j++) out[z.pixel[j]] = 0;
    }
  }
  // 2) lo sfondo: i buchi sono i pezzi che non toccano il bordo del quadro e sono piccoli
  fuori.fill(-1);
  const sfondo = (k: number) => out[k] < 128;
  const limite = (o.buchiMax ?? 0.02) * n;
  for (let i = 0; i < n; i++) {
    if (fuori[i] >= 0 || !sfondo(i)) continue;
    const area = componente(i, id++, sfondo);
    let bordo = false;
    for (let j = 0; j < area && !bordo; j++) { const k = coda[j], x = k % w, y = (k / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bordo = true; }
    if (!bordo && area <= limite) for (let j = 0; j < area; j++) out[coda[j]] = 255;
  }
  return out;
}

/**
 * Un buco che c'è in un fotogramma solo (davanti e dietro il pixel è pieno) si riempie. Solo questo verso: un pezzo che compare
 * in un fotogramma solo potrebbe essere un oggetto veloce (una mano, una palla) e non va tolto, ci pensa la pulizia per fotogramma.
 */
export function votoTemporale(ms: Uint8Array[]): void {
  if (ms.length < 3) return;
  let prima = Uint8Array.from(ms[0]);
  for (let i = 1; i < ms.length - 1; i++) {
    const m = ms[i], dopo = ms[i + 1];
    const mia = Uint8Array.from(m);
    for (let k = 0; k < m.length; k++) {
      if (mia[k] < 128 && prima[k] >= 128 && dopo[k] >= 128) m[k] = Math.min(prima[k], dopo[k]);
    }
    prima = mia;
  }
}

/**
 * Qualche punto "dentro" scelto nel cuore della maschera (lontano dai bordi): uno in generale e uno nella metà alta e uno nella
 * metà bassa del riquadro. Sono i clic che il fotogramma dopo riceve insieme al riquadro, così il modello sa quale oggetto è
 * anche quando nel riquadro c'è un'altra persona.
 */
export function puntiNucleo(m: Uint8Array, w: number, h: number): { x: number; y: number; dentro: true }[] {
  const q = riquadroMaschera(m, w, h, 128);
  if (!q) return [];
  const n = w * h;
  // distanza dal bordo (chamfer 3-4, due passaggi)
  const d = new Uint16Array(n);
  for (let k = 0; k < n; k++) d[k] = m[k] >= 128 ? 60000 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x;
    if (!d[k]) continue;
    let v = d[k];
    if (x === 0 || y === 0) v = Math.min(v, 3);
    else v = Math.min(v, d[k - 1] + 3, d[k - w] + 3, d[k - w - 1] + 4, x < w - 1 ? d[k - w + 1] + 4 : 4);
    d[k] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const k = y * w + x;
    if (!d[k]) continue;
    let v = d[k];
    if (x === w - 1 || y === h - 1) v = Math.min(v, 3);
    else v = Math.min(v, d[k + 1] + 3, d[k + w] + 3, d[k + w + 1] + 4, x > 0 ? d[k + w - 1] + 4 : 4);
    d[k] = v;
  }
  const migliore = (y0: number, y1: number): { x: number; y: number; v: number } | null => {
    let best = -1, bk = -1;
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (m[k] >= 128 && d[k] > best) { best = d[k]; bk = k; } }
    return bk < 0 ? null : { x: ((bk % w) + 0.5) / w, y: (((bk / w) | 0) + 0.5) / h, v: best };
  };
  const ymin = Math.floor(q.y0 * h), ymax = Math.ceil(q.y1 * h), meta = (ymin + ymax) >> 1;
  const out: { x: number; y: number; dentro: true }[] = [];
  const tutti = migliore(ymin, ymax);
  if (tutti) out.push({ x: tutti.x, y: tutti.y, dentro: true });
  for (const p of [migliore(ymin, meta), migliore(meta, ymax)]) {
    if (!p || p.v < 6) continue; // troppo vicino al bordo (meno di due pixel): non è "dentro" per davvero
    if (out.every((o) => Math.hypot(o.x - p.x, (o.y - p.y) * (h / w)) > 0.06)) out.push({ x: p.x, y: p.y, dentro: true });
  }
  return out;
}
