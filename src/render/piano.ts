// Il "piano" di un fotogramma: quali clip si vedono, in che ordine, con che trasparenza e con quale
// transizione. Lo usano sia i monitor sia l'export, così quello che vedi è quello che esce.
// Le transizioni arrivano dai blocchetti FX sulle tracce video (src/core/blocchi.ts): il blocco sta sopra un taglio e
// per la sua durata si vedono tutte e due le clip, la prima che continua oltre la sua fine e la seconda che parte
// prima del suo inizio (con le maniglie della sorgente, o fermandosi sul primo/ultimo fotogramma).
import type { Clip, Project, Transition } from '../core/tipi';
import { clipOpacity, end, mediaOf, srcTimeAt } from '../core/progetto';
import { valutaClip } from '../core/automazioni';
import { prevAdjacent } from '../core/montaggio';
import { transizioniAttive } from '../core/blocchi';
import { f2s } from '../core/timecode';

export interface Sorgente {
  clip: Clip;
  /** tempo nella sorgente (secondi) */
  t: number;
  /** tempo locale dall'inizio della clip (secondi): per titoli e countdown */
  local: number;
  /** fotogramma locale */
  lf: number;
}

export interface Strato {
  trackId: string;
  a: Sorgente | null;
  /** null quando la clip esce con una transizione in coda e sotto non c'è niente della stessa traccia */
  b: Sorgente | null;
  tr: Transition | null;
  /** avanzamento della transizione 0..1 */
  prog: number;
  opacity: number;
  /** le altre transizioni dello stesso taglio: lavorano in catena sopra la prima (si sommano). "sopra" = è un
   *  effetto (lampo, onda, glitch…): si applica al risultato di prima, che fa da vecchia e da nuova */
  altre?: { tr: Transition; prog: number; sopra: boolean }[];
}

/** le transizioni che sono soprattutto un effetto sull'immagine (luce, distorsione, sfocatura, pixel): sommate a
 *  un'altra, si applicano sopra quello che fa lei */
const EFFETTO = new Set([321, 331, 341, 351, 361, 371, 381, 391, 421, 431, 451, 461, 471, 491, 651]);
export const eEffetto = (tr: Transition) => tr.type === 'dip' || (tr.type === 'dve' && EFFETTO.has(tr.pattern));

/** l'ordine della catena: prima quelle che portano dalla vecchia alla nuova (cubo, spinte, tendine, dissolvenza),
 *  poi gli effetti sopra; i passaggi a colore per ultimi */
function pesoCatena(tr: Transition): number {
  if (tr.type === 'dip') return 3;
  if (eEffetto(tr)) return 2;
  if (tr.type === 'mix') return 1;
  return 0;
}

const VISIBILI = new Set(['media', 'color', 'bars', 'countdown', 'title']);

function sorgente(p: Project, c: Clip, f: number): Sorgente {
  let t = srcTimeAt(p, c, f);
  const m = mediaOf(p, c);
  if (m && m.duration > 0) t = Math.max(m.t0 || 0, Math.min(t, m.duration - 1e-3));
  // la clip com'è in questo fotogramma (con i keyframe già calcolati: senza animazioni è la clip stessa)
  return { clip: valutaClip(c, f - c.start), t, local: f2s(f - c.start, p.rate), lf: f - c.start };
}

/** strati video al fotogramma f, dal basso (V1) verso l'alto */
export function pianoVideo(p: Project, f: number): Strato[] {
  const out: Strato[] = [];
  const vt = p.tracks.filter((t) => t.kind === 'video');
  const trs = transizioniAttive(p).filter((x) => x.s <= f && f < x.e);
  for (let i = vt.length - 1; i >= 0; i--) {
    const t = vt[i];
    if (t.mute || t.opacity <= 0) continue;
    // le transizioni di questa traccia adesso: se sono sullo stesso taglio si sommano, in catena
    const qua = trs.filter((z) => z.track === t.id);
    const x0 = qua[0];
    if (x0) {
      const catena = qua.filter((z) => z.cut === x0.cut).sort((u, v) => pesoCatena(u.tr) - pesoCatena(v.tr));
      const x = catena[0];
      const prog = (z: typeof x) => (f - z.s + 0.5) / Math.max(1, z.e - z.s);
      // la clip che c'è davvero in quel momento dà la trasparenza
      const qui = f < x.cut ? x.a : x.b;
      const opacity = (qui ? clipOpacity(qui, Math.max(qui.start, Math.min(end(qui) - 1, f))) : 1) * t.opacity;
      out.push({
        trackId: t.id,
        a: x.a ? sorgente(p, x.a, f) : null,
        b: x.b ? sorgente(p, x.b, f) : null,
        tr: x.tr, prog: prog(x), opacity,
        altre: catena.length > 1 ? catena.slice(1).map((z) => ({ tr: z.tr, prog: prog(z), sopra: eEffetto(z.tr) })) : undefined,
      });
      continue;
    }
    const c = p.clips.find((z) => z.track === t.id && z.start <= f && end(z) > f && VISIBILI.has(z.kind));
    if (!c) continue;
    const opacity = clipOpacity(c, f) * t.opacity;
    let a: Sorgente | null = null, tr: Transition | null = null, prog = 1;
    let b: Sorgente | null = sorgente(p, c, f);
    // le transizioni vecchie attaccate alle clip (i progetti di prima le trasformano in blocchetti quando si aprono)
    if (c.trIn && f < c.start + c.trIn.len) {
      tr = c.trIn;
      prog = (f - c.start + 0.5) / c.trIn.len;
      const prev = prevAdjacent(p, c);
      if (prev && VISIBILI.has(prev.kind)) a = sorgente(p, prev, f);
    } else if (c.trOut && f >= end(c) - c.trOut.len) {
      tr = c.trOut;
      prog = (f - (end(c) - c.trOut.len) + 0.5) / c.trOut.len;
      a = b;
      b = null;
    }
    if (opacity <= 0 && !tr) continue;
    out.push({ trackId: t.id, a, b, tr, prog, opacity });
  }
  return out;
}

/**
 * Le sorgenti video che partono entro "anticipo" fotogrammi (per scaldare i decoder prima del taglio). Una clip
 * che entra con una transizione si scalda dal punto in cui la transizione comincia (prima del suo inizio).
 */
export function inArrivo(p: Project, f: number, anticipo: number): Sorgente[] {
  const quando = new Map<string, number>();
  for (const x of transizioniAttive(p)) {
    if (x.b && x.b.kind === 'media' && x.s > f && x.s <= f + anticipo && x.s < x.b.start) quando.set(x.b.id, x.s);
  }
  const out: Sorgente[] = [];
  const video = new Set(p.tracks.filter((t) => t.kind === 'video' && !t.mute).map((t) => t.id));
  for (const c of p.clips) {
    // solo le clip che si vedono: l'audio di una ripresa non deve accendere un decoder video
    if (c.kind !== 'media' || !c.media || !video.has(c.track)) continue;
    const da = quando.get(c.id) ?? c.start;
    if (da > f && da <= f + anticipo) out.push(sorgente(p, c, da));
  }
  return out;
}
