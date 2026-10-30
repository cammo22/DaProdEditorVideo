// Cursore LIVE, nello spirito di OpenScreen (MIT, vedi TERZE-PARTI.md).
// La geometria del focus è adattata da videoPlayback/zoomTransform.ts all'origine centrale di DaProd.
// Il movimento viene scritto una volta nelle tappe normali: seek, monitor ed export fanno lo stesso conto.
import type { ChiaveAnim, Clip, MediaItem, Project, Transform } from './tipi';
import { newClip } from './progetto';
import { valoreAnim } from './automazioni';

export interface SchermoCursore { id: string; left: number; top: number; width: number; height: number }
/** `win` = la finestra sotto il cursore (sinistra, alto, destra, basso) in frazioni dello schermo, quando il campionatore l'ha letta */
export interface CampioneCursore { tMs: number; cx: number; cy: number; visible: boolean; clicks: number; win?: [number, number, number, number] }
export interface ClicCursore { tMs: number; cx: number; cy: number; button: number }
export interface SegmentoCursore { daMs: number; durataMs: number }
export interface DatiCursore {
  v: 1;
  schermo: SchermoCursore;
  durataMs: number;
  video?: { nome: string; size: number };
  segmenti: SegmentoCursore[];
  campioni: CampioneCursore[];
  clic: ClicCursore[];
}
/** Segmenti nell'orologio del campionatore, e dove sono finiti nel video cucito. */
export interface TaglioCursore { da: number; fine: number; videoMs: number; durataMs: number }

export function rimappaCursore(raw: CampioneCursore[], schermo: SchermoCursore, tagli: TaglioCursore[], durataMs: number): DatiCursore {
  const campioni: CampioneCursore[] = [], clic: ClicCursore[] = [];
  let i = 0;
  for (const g of tagli) {
    while (i < raw.length && raw[i].tMs < g.da) i++;
    while (i < raw.length && raw[i].tMs < g.fine) {
      const s = raw[i++], tMs = g.videoMs + s.tMs - g.da;
      if (!Number.isFinite(tMs) || tMs < 0 || tMs >= Math.min(durataMs, g.videoMs + g.durataMs)) continue;
      const visible = s.visible && Number.isFinite(s.cx) && Number.isFinite(s.cy) && s.cx >= 0 && s.cx < 1 && s.cy >= 0 && s.cy < 1;
      const punto = { ...s, tMs, cx: Number.isFinite(s.cx) ? s.cx : 0, cy: Number.isFinite(s.cy) ? s.cy : 0, visible, clicks: visible ? s.clicks & 7 : 0 };
      campioni.push(punto);
      for (let b = 0; b < 3; b++) if (punto.clicks & (1 << b)) clic.push({ tMs, cx: s.cx, cy: s.cy, button: b });
    }
  }
  return { v: 1, schermo, durataMs, segmenti: tagli.map((g) => ({ daMs: g.videoMs, durataMs: g.durataMs })), campioni, clic };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Focus in coordinate sorgente, dopo il fit nel progetto. Limita la camera ai bordi dell'immagine. */
export function trasformazioneFocus(base: Transform, cx: number, cy: number, z: number, w: number, h: number): Transform {
  const dx = clamp(-z * (cx - 0.5) * w, -(z - 1) * w / 2, (z - 1) * w / 2);
  const dy = clamp(-z * (cy - 0.5) * h, -(z - 1) * h / 2, (z - 1) * h / 2);
  const a = base.rot * Math.PI / 180, x = dx * base.scale * (base.sx ?? 1), y = dy * base.scale;
  return { ...base, scale: base.scale * z, x: base.x + Math.cos(a) * x - Math.sin(a) * y, y: base.y + Math.sin(a) * x + Math.cos(a) * y };
}

/** Clic vicini nel tempo fanno una sola visita; la camera torna al quadro intero fra due visite distanti. */
export function regioniZoom(clic: ClicCursore[], durataMs: number) {
  const regioni: { da: number; fine: number; clic: ClicCursore[] }[] = [];
  for (const c of clic) {
    if (!Number.isFinite(c.tMs) || c.tMs < 0 || c.tMs >= durataMs) continue;
    const da = Math.max(0, c.tMs - 500), fine = Math.min(durataMs, c.tMs + 1700);
    const prima = regioni.at(-1);
    if (prima && da <= prima.fine) { prima.fine = fine; prima.clic.push(c); }
    else regioni.push({ da, fine, clic: [c] });
  }
  return regioni;
}

/** Interpolazione nella sorgente, senza inventare posizioni attraverso un tratto non visibile. */
export function puntoCursoreAl(campioni: CampioneCursore[], tMs: number): [number, number] | null {
  let lo = 0, hi = campioni.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (campioni[m].tMs <= tMs) lo = m + 1; else hi = m; }
  const a = campioni[lo - 1], b = campioni[lo];
  if (!a?.visible || tMs - a.tMs > 150) return null;
  if (!b?.visible || b.tMs - a.tMs > 150) return [a.cx, a.cy];
  const k = clamp((tMs - a.tMs) / Math.max(0.001, b.tMs - a.tMs), 0, 1);
  return [a.cx + (b.cx - a.cx) * k, a.cy + (b.cy - a.cy) * k];
}

/** Un punto della camera: dove guarda (frazioni dello schermo registrato) e quanto è vicina (1 = quadro intero). */
export interface PuntoCamera { tMs: number; cx: number; cy: number; z: number }

const PASSO_MS = 100;
/** fermo = il cursore resta in un cerchio di questo raggio (frazione dello schermo) */
const RAGGIO_FERMO = 0.025;
const FERMO_MS = 700;
const ZOOM_CLIC = 1.9, ZOOM_FERMO = 1.6, ZOOM_LENTO = 1.35, ZOOM_MAX = 2.6;
/** dopo un movimento forte, quanto deve restare calmo il cursore prima che lo zoom torni */
const CALMA_MS = 700;

/** la finestra più recente letta vicino a tMs (il campionatore la legge ogni ~100 ms) */
function finestraAl(campioni: CampioneCursore[], tMs: number): [number, number, number, number] | null {
  let lo = 0, hi = campioni.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (campioni[m].tMs <= tMs) lo = m + 1; else hi = m; }
  for (let i = lo - 1; i >= 0 && tMs - campioni[i].tMs < 400; i--) if (campioni[i].win) return campioni[i].win!;
  return null;
}

/**
 * Il percorso della camera, un punto ogni 100 ms, calcolato a registrazione finita (si può guardare anche avanti):
 * - un clic: si avvicina al punto un attimo prima e resta lì un paio di secondi;
 * - cursore fermo su una finestra: la inquadra tutta, centrata e il più grande possibile;
 * - cursore fermo senza finestra (desktop, finestra a tutto schermo): zoom medio sul cursore;
 * - cursore che si muove: torna indietro piano e lo segue dolcemente.
 * Il moto è filtrato (molla del primo ordine, costanti di tempo diverse per avvicinarsi e allontanarsi), così la
 * camera non scatta mai.
 */
export function camminoCamera(dati: DatiCursore, durataMs: number): PuntoCamera[] {
  const out: PuntoCamera[] = [];
  // due stadi per grandezza (molla «criticamente smorzata» alla buona): il secondo toglie gli strappi del primo
  let cx1 = 0.5, cy1 = 0.5, z1 = 1, cx = 0.5, cy = 0.5, z = 1;
  let tx = 0.5, ty = 0.5;
  let ancora: [number, number] | null = null, fermoDa = 0;
  // l'ultimo istante di movimento forte: lo zoom torna solo dopo un po' di calma
  let agitatoA = -Infinity;
  let ic = 0;
  const storia: [number, number, number][] = [];
  for (let t = 0; t <= durataMs; t += PASSO_MS) {
    const q = puntoCursoreAl(dati.campioni, t);
    let tz = 1;
    while (ic < dati.clic.length && dati.clic[ic].tMs < t - 1900) ic++;
    const clic = dati.clic.slice(ic).find((c) => c.tMs <= t + 350);
    if (q) {
      // quanta strada ha fatto il cursore nell'ultimo secondo e mezzo, e quanto va veloce adesso
      storia.push([t, q[0], q[1]]);
      while (storia.length && t - storia[0][0] > 1500) storia.shift();
      let strada = 0;
      for (let i = 1; i < storia.length; i++) strada += Math.hypot(storia[i][1] - storia[i - 1][1], storia[i][2] - storia[i - 1][2]);
      const recenti = storia.filter((x) => t - x[0] <= 300);
      const v = recenti.length > 1 ? Math.hypot(q[0] - recenti[0][1], q[1] - recenti[0][2]) / Math.max(0.1, (t - recenti[0][0]) / 1000) : 0;
      if (v > 0.45 || strada > 0.6) agitatoA = t;
      const calmo = t - agitatoA >= CALMA_MS;
      if (!ancora || Math.hypot(q[0] - ancora[0], q[1] - ancora[1]) > RAGGIO_FERMO) { ancora = q; fermoDa = t; }
      const fermo = t - fermoDa >= FERMO_MS;
      const w = fermo ? finestraAl(dati.campioni, t) : null;
      const ww = w ? w[2] - w[0] : 1, wh = w ? w[3] - w[1] : 1;
      if (!calmo) { tx = 0.5; ty = 0.5; tz = 1; } // si muove tanto: tutto lo schermo
      else if (clic) { tx = clic.cx; ty = clic.cy; tz = ZOOM_CLIC; }
      else if (w && ww * wh < 0.8 && ww * wh > 0.01) {
        tx = (w[0] + w[2]) / 2; ty = (w[1] + w[3]) / 2;
        tz = clamp(0.94 / Math.max(ww, wh), 1, ZOOM_MAX);
      } else if (fermo) { tx = q[0]; ty = q[1]; tz = ZOOM_FERMO; }
      else {
        // movimenti lenti: si resta vicini e si segue con una zona morta piccola
        tz = ZOOM_LENTO;
        const meta = 0.2 / Math.max(1, z);
        if (q[0] < cx - meta) tx = q[0] + meta; else if (q[0] > cx + meta) tx = q[0] - meta; else tx = cx;
        if (q[1] < cy - meta) ty = q[1] + meta; else if (q[1] > cy + meta) ty = q[1] - meta; else ty = cy;
      }
    } else { ancora = null; storia.length = 0; tx = 0.5; ty = 0.5; }
    // allontanarsi è svelto (si vede subito tutto), avvicinarsi è morbido
    const kz = 1 - Math.exp(-PASSO_MS / (tz > z1 ? 550 : 260));
    const kc = 1 - Math.exp(-PASSO_MS / 160);
    z1 += (tz - z1) * kz; z += (z1 - z) * kz;
    cx1 += (tx - cx1) * kc; cy1 += (ty - cy1) * kc;
    // la camera non scatta: al massimo un quadro inquadrato e mezzo al secondo...
    const passo = 0.15 / Math.max(1, z), dx = cx1 - cx, dy = cy1 - cy, d = Math.hypot(dx, dy);
    const k = d > passo ? passo / d : 1;
    cx += dx * k; cy += dy * k;
    // ...ma il cursore non esce mai dall'inquadratura: se è vicino al bordo la camera lo raggiunge subito
    if (q && z > 1.01) {
      const bordo = 0.5 / z - 0.06 / z;
      if (q[0] < cx - bordo) cx = q[0] + bordo; else if (q[0] > cx + bordo) cx = q[0] - bordo;
      if (q[1] < cy - bordo) cy = q[1] + bordo; else if (q[1] > cy + bordo) cy = q[1] - bordo;
      cx1 = cx; cy1 = cy;
    }
    out.push({ tMs: t, cx, cy, z });
  }
  return out;
}

/**
 * Lo zoom che segue il cursore, scritto come keyframe di tf.scale/tf.x/tf.y (modificabili dopo come gli altri).
 * Si somma alla posizione che la clip ha già in quel fotogramma (anche quella delle scene LIVE): la camera
 * lavora solo quando lo schermo è a tutto quadro (`pieno`), altrove lascia la scena com'è.
 */
export function applicaZoomCursore(p: Project, c: Clip, m: MediaItem, pieno: (lf: number) => boolean = () => true): boolean {
  const dati = m.cursoreLive;
  if (!dati || dati.v !== 1 || c.via?.length || c.len < 3 || m.width <= 0 || m.height <= 0 || c.speed <= 0) return false;
  const r = p.rate.num / p.rate.den;
  const ingresso = (c.srcIn - (m.t0 || 0)) * 1000;
  const fineMs = ingresso + (c.len * 1000 / r) * c.speed;
  const cammino = camminoCamera(dati, Math.max(0, Math.min(dati.durataMs, fineMs)));
  if (!cammino.length) return false;
  const fit = Math.min(p.w / m.width, p.h / m.height), w = m.width * fit, h = m.height * fit;
  c.anim ??= {};
  // rifarlo parte dalle chiavi di prima dello zoom: mai due zoom uno sopra l'altro
  const prima = c.zoomLive ?? { scale: c.anim['tf.scale'], x: c.anim['tf.x'], y: c.anim['tf.y'] };
  const nuove: Record<'scale' | 'x' | 'y', ChiaveAnim[]> = { scale: [], x: [], y: [] };
  const passo = Math.max(1, Math.round(r * PASSO_MS / 1000));
  let mosso = false;
  for (let lf = 0; lf <= c.len; lf += passo) {
    const tMs = ingresso + (lf * 1000 / r) * c.speed;
    const k = cammino[clamp(Math.round(tMs / PASSO_MS), 0, cammino.length - 1)];
    const base: Transform = { ...c.tf, scale: valoreAnim(prima.scale, lf, c.tf.scale), x: valoreAnim(prima.x, lf, c.tf.x), y: valoreAnim(prima.y, lf, c.tf.y) };
    const tf = pieno(lf) && k.z > 1.001 ? trasformazioneFocus(base, k.cx, k.cy, k.z, w, h) : base;
    if (tf !== base) mosso = true;
    for (const chiave of ['scale', 'x', 'y'] as const) {
      const lista = nuove[chiave], v = tf[chiave];
      const ultima = lista.at(-1);
      // niente chiavi inutili: si salta se il valore è uguale all'ultima (le prime e le ultime restano)
      if (ultima && Math.abs(ultima.v - v) < (chiave === 'scale' ? 0.0005 : 0.25) && lf + passo <= c.len) continue;
      lista.push({ f: lf, v });
    }
  }
  if (!mosso) return false;
  // solo le chiavi che esistono: il progetto salvato (JSON) non ha campi vuoti
  c.zoomLive = JSON.parse(JSON.stringify(prima));
  for (const chiave of ['scale', 'x', 'y'] as const) {
    const lista = nuove[chiave];
    if (lista.at(-1)!.f < c.len) lista.push({ f: c.len, v: lista.at(-1)!.v });
    c.anim['tf.' + chiave] = lista;
  }
  return true;
}

/** Toglie lo zoom che segue il cursore: tornano le chiavi di prima (anche quelle delle scene). */
export function togliZoomCursore(c: Clip): boolean {
  const z = c.zoomLive;
  if (!z) return false;
  c.anim ??= {};
  for (const chiave of ['scale', 'x', 'y'] as const) {
    const k = z[chiave];
    if (k?.length) c.anim['tf.' + chiave] = k; else delete c.anim['tf.' + chiave];
  }
  delete c.zoomLive;
  return true;
}

/** Un blocco normale: eliminabile e accorciabile, sulla traccia dello schermo; non muove webcam e sfondo. */
export function bloccoClicLive(c: Clip): Clip {
  // Il legame è quello dei blocchi (blocchiDi), non il gruppo audio/video: cancellare il blocco lascia la ripresa.
  return newClip('fx', c.track, c.start, c.len, { name: 'Clic animati',
    fxb: { tipo: 'effetto', id: 'clicLive', forza: 1, colore: '#ffd54a', audio: false, cursoreMedia: c.media } });
}

/** Il tempo è quello della sorgente: trim, slip e velocità usano i clic del fotogramma che si sta mostrando. */
export function clicAlTempo(dati: DatiCursore, tMs: number): ClicCursore[] {
  let lo = 0, hi = dati.clic.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (dati.clic[m].tMs <= tMs - 550) lo = m + 1; else hi = m; }
  const clic: ClicCursore[] = [];
  for (let i = lo; i < dati.clic.length && dati.clic[i].tMs <= tMs; i++) clic.push(dati.clic[i]);
  return clic.slice(-8);
}
