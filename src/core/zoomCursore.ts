// Cursore LIVE, nello spirito di OpenScreen (MIT, vedi TERZE-PARTI.md).
// La geometria del focus è adattata da videoPlayback/zoomTransform.ts all'origine centrale di DaProd.
// Il movimento viene scritto una volta nelle tappe normali: seek, monitor ed export fanno lo stesso conto.
import type { Clip, MediaItem, Project, Transform } from './tipi';
import { newClip } from './progetto';

export interface SchermoCursore { id: string; left: number; top: number; width: number; height: number }
export interface CampioneCursore { tMs: number; cx: number; cy: number; visible: boolean; clicks: number }
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

/** Solo sulla clip appena creata da LIVE: non riscrive movimenti già lavorati a mano. */
export function applicaZoomCursore(p: Project, c: Clip, m: MediaItem): boolean {
  const dati = m.cursoreLive;
  if (!dati || dati.v !== 1 || c.tfFine || c.via?.length || c.len < 3 || m.width <= 0 || m.height <= 0 || c.speed <= 0) return false;
  const r = p.rate.num / p.rate.den, durata = (c.len - 1) * 1000 / r;
  const ingresso = (c.srcIn - (m.t0 || 0)) * 1000;
  const clic = dati.clic.map((s) => ({ ...s, tMs: (s.tMs - ingresso) / c.speed }));
  const regioni = regioniZoom(clic, durata);
  if (!regioni.length) return false;
  const fit = Math.min(p.w / m.width, p.h / m.height), base = { ...c.tf };
  const tappe: { t: number; tf: Transform }[] = [{ t: 0, tf: base }];
  for (const g of regioni) {
    // Entrata e uscita hanno due tappe uguali ai lati: passaPer dà la S senza stato di playback.
    const entrata = Math.min(g.fine, g.da + 500), uscita = Math.max(entrata, g.fine - 550);
    tappe.push({ t: g.da / durata, tf: { ...base } });
    let x = g.clic[0].cx, y = g.clic[0].cy;
    // Bake deterministico a 5 Hz nel tempo del contenuto, poi passaPer raccorda le tappe con la S.
    // Il filtro usa sempre lo stesso passo, indipendente dai seek e dai fotogrammi del monitor.
    for (let ms = entrata; ms < uscita; ms += 200) {
      const q = puntoCursoreAl(dati.campioni, ingresso + ms * c.speed);
      if (q) { const k = 1 - Math.exp(-200 / 280); x += (q[0] - x) * k; y += (q[1] - y) * k; }
      const tf = trasformazioneFocus(base, x, y, 1.65, m.width * fit, m.height * fit);
      const prima = tappe.at(-1)!;
      if (ms === entrata || Math.hypot(tf.x - prima.tf.x, tf.y - prima.tf.y) >= 3) tappe.push({ t: ms / durata, tf });
    }
    tappe.push({ t: uscita / durata, tf: trasformazioneFocus(base, x, y, 1.65, m.width * fit, m.height * fit) });
    tappe.push({ t: g.fine / durata, tf: { ...base } });
  }
  tappe.push({ t: 1, tf: { ...base } });
  // Se un clic è sul primo/ultimo fotogramma, gli estremi restano comunque a quadro intero.
  const uniche = new Map<number, Transform>();
  for (const t of tappe) uniche.set(clamp(t.t, 0, 1), t.tf);
  uniche.set(0, base); uniche.set(1, { ...base });
  const ordine = [...uniche].sort((a, b) => a[0] - b[0]);
  c.tf = ordine[0][1]; c.tfFine = ordine.at(-1)![1];
  c.via = ordine.slice(1, -1).map(([t, tf]) => ({ t, tf }));
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
