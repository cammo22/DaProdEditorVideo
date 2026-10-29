// Il provino: le anteprime del contenitore girate col fotogramma vero che c'è sotto il cursore della timeline,
// con lo stesso compositore dell'uscita (quello che vedi nella scheda è quello che esce). Transizioni: dal
// fotogramma al cursore a quello dopo il prossimo taglio (se non c'è, lo stesso: l'effetto si capisce lo
// stesso); effetti e ritocchi sul fotogramma al cursore; titoli sopra; countdown e macchine da soli.
// Si costruisce un montaggio piccolissimo e finto (una o due immagini, il blocco, il titolo) e si fa girare.
import type { Clip, MediaItem, Project } from '../core/tipi';
import { store } from '../core/store';
import { MASTER0, TITLE0, isVideoClip, newClip, newTrack } from '../core/progetto';
import { durataBlocco, nuovoBlocco, posaBlocco } from '../core/blocchi';
import { applicaPresetTitolo, presetTitolo } from '../core/generatori';
import { animazione, nuovaAnim } from '../core/animazioni';
import { modelloHtml, nuovoHtml } from '../core/titoliHtml';
import { fps } from '../core/timecode';
import type { Fotogramma } from '../media/fotogrammi';
import { Lettori } from '../export/esporta';
import { Compositore } from './compositore';
import { pianoVideo, type Sorgente } from './piano';

/** larghezza del provino in pixel (l'altezza segue il formato del progetto) */
const LW = 320;

export interface Scena { p: Project; da: number; a: number }
export type Costruttore = (a: ImageBitmap, b: ImageBitmap) => Scena;

// ——— un compositore solo, piccolo, per le foto al cursore e per far girare i provini ———
let fotografo: { tela: OffscreenCanvas; comp: Compositore } | null = null;
let rotto = false;
function fotografoPer(p: Project): typeof fotografo {
  if (rotto) return null;
  const w = LW, h = Math.max(2, Math.round(LW * p.h / p.w));
  try {
    if (!fotografo) {
      const tela = new OffscreenCanvas(w, h);
      fotografo = { tela, comp: new Compositore(tela, true) };
    }
    if (fotografo.tela.width !== w || fotografo.tela.height !== h) { fotografo.tela.width = w; fotografo.tela.height = h; }
  } catch { rotto = true; return null; }
  return fotografo;
}

// ——— le due immagini: al cursore e dopo il prossimo taglio ———
let versione = 0;
store.on('doc', () => { versione++; });
let tenute: { chiave: string; a: ImageBitmap; b: ImageBitmap } | null = null;
let inCorso: { chiave: string; lavoro: Promise<{ a: ImageBitmap; b: ImageBitmap } | null> } | null = null;
let prova: Promise<[ImageBitmap, ImageBitmap]> | null = null;

/** le immagini "pulite" del montaggio: le riprese e i colori, senza titoli, FX, transizioni, sottotitoli e logo
 *  (se no l'anteprima di un titolo finisce sopra il titolo che c'è già, e un effetto sopra un lampo) */
const PULITE = new Set(['media', 'color', 'bars', 'countdown']);
function pulito(p: Project): Project {
  return {
    ...p, clips: p.clips.filter((c) => PULITE.has(c.kind)).map((c) => (c.trIn || c.trOut ? { ...c, trIn: undefined, trOut: undefined } : c)),
    sottotitoli: undefined, master: { ...MASTER0, ...(p.master ?? {}), logo: null },
  };
}

/** il primo taglio dopo f su una traccia video (dove comincia la ripresa dopo: non un titolo, non un FX) */
function prossimoTaglio(p: Project, f: number): number | null {
  let t: number | null = null;
  for (const c of p.clips) if (PULITE.has(c.kind) && isVideoClip(c, p) && c.start > f + 1 && (t === null || c.start < t)) t = c.start;
  return t;
}

/** fotografa il montaggio al fotogramma f, piccolo (null se lì non c'è immagine) */
async function scatta(p0: Project, f: number): Promise<ImageBitmap | null> {
  const p = pulito(p0);
  const strati = pianoVideo(p, f);
  if (!strati.length) return null;
  const lettori = new Lettori();
  try {
    const presi = new Map<Sorgente, Fotogramma | null>();
    for (const s of strati) for (const src of [s.b, s.a]) if (src && src.clip.kind === 'media') presi.set(src, await lettori.prendi(src.clip, src.t, 0));
    const fg = fotografoPer(p);
    if (!fg) return null;
    fg.comp.render(p, strati, false, f, (s) => presi.get(s) ?? null);
    return fg.tela.transferToImageBitmap();
  } catch {
    return null;
  } finally {
    lettori.tutto();
  }
}

/** le due immagini di prova (A blu, B oro) quando sotto il cursore non c'è niente */
function immaginiProva(): Promise<[ImageBitmap, ImageBitmap]> {
  prova ??= (async () => {
    const fai = (testo: string, c1: string, c2: string, righe: boolean) => {
      const t = new OffscreenCanvas(LW, 180);
      const x = t.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, LW, 180);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g;
      x.fillRect(0, 0, LW, 180);
      x.fillStyle = 'rgba(255,255,255,.18)';
      if (righe) for (let i = 0; i < LW; i += 24) x.fillRect(i, 0, 10, 180);
      else for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(30 + i * 44, 30 + (i % 2) * 110, 16, 0, 7); x.fill(); }
      x.fillStyle = '#fff';
      x.font = '900 80px Orbitron, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(testo, LW / 2, 94);
      return t.transferToImageBitmap();
    };
    return [fai('A', '#1b3a8f', '#35e8ff', true), fai('B', '#ffab00', '#ff3df2', false)];
  })();
  return prova;
}

/** le immagini del provino: il fotogramma al cursore e quello dopo il taglio che viene (tenute finché non cambia niente) */
export async function fotogrammiAlCursore(): Promise<{ a: ImageBitmap; b: ImageBitmap; veri: boolean }> {
  const p = store.doc;
  const f = Math.floor(store.head + 1e-6);
  const chiave = versione + ':' + f;
  if (tenute?.chiave === chiave) return { a: tenute.a, b: tenute.b, veri: true };
  if (inCorso?.chiave !== chiave) {
    inCorso = {
      chiave,
      lavoro: (async () => {
        // al cursore può non esserci immagine (dal nero, un buco, dopo la fine): si prende la prima buona poco più in là
        const r = fps(p.rate);
        const prima = p.clips.filter((c) => PULITE.has(c.kind) && isVideoClip(c, p)).sort((x, y) => x.start - y.start)[0];
        let fa = f, a: ImageBitmap | null = null;
        for (const g of [f, f + Math.round(r * 0.5), f + r, prima ? prima.start + Math.round(prima.len / 2) : -1]) {
          if (g < 0) continue;
          a = await scatta(p, g);
          if (a) { fa = g; break; }
        }
        if (!a) return null;
        const t = prossimoTaglio(p, fa);
        const b = (t !== null ? await scatta(p, t) : null) ?? a;
        return { a, b };
      })(),
    };
  }
  const r = await inCorso.lavoro;
  if (r) {
    tenute = { chiave, a: r.a, b: r.b };
    return { ...r, veri: true };
  }
  const [a, b] = await immaginiProva();
  return { a, b, veri: false };
}

// ——— le scene: montaggi finti di pochi secondi ———
function immagine(id: string, bmp: ImageBitmap): MediaItem {
  return {
    id, name: id, type: 'image', duration: 0, t0: 0, width: bmp.width, height: bmp.height, fps: 0, rotation: 0,
    hasVideo: true, hasAudio: false, channels: 0, sampleRate: 0, vcodec: '', acodec: '', container: '', size: 0, lastModified: 0,
    markIn: null, markOut: null,
  };
}

/** il montaggio finto: il formato del progetto, due tracce video, le due immagini, niente colore finale (le foto ce l'hanno già) */
function base(a: ImageBitmap, b: ImageBitmap) {
  const d = store.doc;
  const v2 = newTrack('video', 'V2'), v1 = newTrack('video', 'V1');
  const p: Project = {
    ...d, tracks: [v2, v1], clips: [], markers: [], media: [immagine('provA', a), immagine('provB', b)],
    inF: null, outF: null, master: { ...MASTER0, auto: false, logo: null }, sottotitoli: undefined, sequenze: undefined, seqAttiva: undefined,
  };
  return { p, v1: v1.id, v2: v2.id, r: fps(d.rate) };
}

const foto = (track: string, start: number, len: number, quale: 'provA' | 'provB' = 'provA'): Clip => newClip('media', track, start, len, { media: quale, name: quale });

/** transizione: A fino al taglio, poi B, e il blocco centrato sul taglio */
export function scenaTransizione(id: string, forza = 1): Costruttore {
  return (a, b) => {
    const { p, v1, r } = base(a, b);
    const T = durataBlocco(p, 'transizione', id);
    const L = T + Math.round(r * 0.5);
    p.clips.push(foto(v1, 0, L), foto(v1, L, L, 'provB'));
    const blk = nuovoBlocco('transizione', id);
    blk.forza = forza;
    posaBlocco(p, blk, L - Math.round(T / 2), T, v1);
    const giro = Math.round(r * 0.3);
    return { p, da: L - Math.round(T / 2) - giro, a: L + Math.round(T / 2) + giro };
  };
}

/** effetto a tempo sul fotogramma al cursore */
export function scenaEffetto(id: string, forza = 1): Costruttore {
  return (a) => {
    const { p, v1, r } = base(a, a);
    const T = durataBlocco(p, 'effetto', id);
    const giro = Math.round(r * 0.35);
    p.clips.push(foto(v1, 0, T + giro * 2));
    const blk = nuovoBlocco('effetto', id);
    blk.forza = forza;
    posaBlocco(p, blk, giro, T, v1);
    return { p, da: 0, a: T + giro * 2 };
  };
}

/** ritocco della clip (look, colore, zoom…): prima senza, poi sfuma in quello con l'effetto */
export function scenaRitocco(metti: (c: Clip, p: Project) => void): Costruttore {
  return (a) => {
    const { p, v1, r } = base(a, a);
    const L = Math.round(r * 1.2), M = Math.round(r * 2.4);
    const prima = foto(v1, 0, L), dopo = foto(v1, L, M);
    metti(dopo, p);
    p.clips.push(prima, dopo);
    posaBlocco(p, nuovoBlocco('transizione', 'mix'), L - Math.round(r * 0.3), Math.round(r * 0.6), v1);
    return { p, da: 0, a: L + M };
  };
}

/** titolo col suo preset sopra il fotogramma al cursore */
export function scenaTitolo(id: string): Costruttore {
  return (a) => {
    const { p, v1, v2, r } = base(a, a);
    const L = Math.round(r * 5 * (presetTitolo(id)?.volte ?? 1));
    p.clips.push(foto(v1, 0, L));
    const t = newClip('title', v2, 0, L, { name: 'Titolo', gen: { title: { ...TITLE0 } } });
    applicaPresetTitolo(t, id);
    p.clips.push(t);
    return { p, da: 0, a: L };
  };
}

/** un'animazione del catalogo sopra il fotogramma al cursore (al massimo 5 secondi: il provino è breve) */
export function scenaAnimazione(id: string): Costruttore {
  return (a, b) => {
    const { p, v1, v2, r } = base(a, b);
    const L = Math.round(r * Math.min(5, animazione(id)?.durata ?? 5));
    p.clips.push(foto(v1, 0, L));
    p.clips.push(newClip('title', v2, 0, L, { name: 'Animazione', gen: { anim: nuovaAnim(id) } }));
    return { p, da: 0, a: L };
  };
}

/** un titolo animato HTML sopra il fotogramma al cursore (al massimo 5 secondi: il provino è breve) */
export function scenaHtml(id: string): Costruttore {
  return (a, b) => {
    const { p, v1, v2, r } = base(a, b);
    const L = Math.round(r * Math.min(5, modelloHtml(id)?.durata ?? 5));
    p.clips.push(foto(v1, 0, L));
    p.clips.push(newClip('title', v2, 0, L, { name: 'Titolo HTML', gen: { html: nuovoHtml(id) } }));
    return { p, da: 0, a: L };
  };
}

/** countdown da solo */
export function scenaConto(stile: 'pellicola' | 'moderno' | 'neon' | 'minimal', secondi: number): Costruttore {
  return (a) => {
    const { p, v1, r } = base(a, a);
    const L = Math.round(r * secondi);
    p.clips.push(newClip('countdown', v1, 0, L, { name: 'Countdown', gen: { conto: stile } }));
    return { p, da: 0, a: L };
  };
}

/** barre, nero, colore */
export function scenaSala(kind: 'bars' | 'color' | 'nero'): Costruttore {
  return (a) => {
    const { p, v1, r } = base(a, a);
    const L = Math.round(r);
    p.clips.push(kind === 'bars' ? newClip('bars', v1, 0, L, { gen: { bars: 'smpte' } }) : newClip('color', v1, 0, L, { gen: { color: kind === 'nero' ? '#000000' : '#1b3a8f' } }));
    return { p, da: 0, a: L };
  };
}

// ——— il provino che gira: uno alla volta, quello sotto il mouse ———
let attivo: (() => void) | null = null;

/** disegna la scena nella tela di destinazione al fotogramma f (senza deformarla: bande nere se serve) */
function disegna(dest: HTMLCanvasElement, s: Scena, f: number, a: ImageBitmap, b: ImageBitmap): boolean {
  const fg = fotografoPer(s.p);
  if (!fg) return false;
  fg.comp.render(s.p, pianoVideo(s.p, f), false, f, (x) => (x.clip.media === 'provB' ? b : a));
  const ctx = dest.getContext('2d')!;
  const k = Math.min(dest.width / fg.tela.width, dest.height / fg.tela.height);
  const w = fg.tela.width * k, h = fg.tela.height * k;
  if (w < dest.width - 1 || h < dest.height - 1) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, dest.width, dest.height); }
  ctx.drawImage(fg.tela, (dest.width - w) / 2, (dest.height - h) / 2, w, h);
  return true;
}

/**
 * Fa girare il provino nella tela (al passaggio del mouse). Ritorna la funzione per fermarlo.
 * Una pausa di mezzo secondo alla fine di ogni giro, così si vede com'è finita.
 */
export function suonaProvino(dest: HTMLCanvasElement, fai: Costruttore): () => void {
  attivo?.();
  let raf = 0, vivo = true, t0 = 0;
  let scena: Scena | null = null, a: ImageBitmap | null = null, b: ImageBitmap | null = null;
  void fotogrammiAlCursore().then((x) => {
    if (!vivo) return;
    a = x.a; b = x.b;
    scena = fai(x.a, x.b);
    dest.classList.toggle('vero', x.veri);
  });
  const giro = (now: number) => {
    if (!vivo) return;
    // la scheda non c'è più (la pagina si è ridisegnata): il giro si ferma, non resta a girare di nascosto
    if (!dest.isConnected) { ferma(); return; }
    if (scena && a && b) {
      if (!t0) t0 = now;
      const r = fps(scena.p.rate);
      const n = scena.a - scena.da;
      const k = ((now - t0) / 1000) * r % (n + r * 0.5);
      const f = scena.da + Math.min(n - 1, Math.floor(k));
      if (!disegna(dest, scena, f, a, b)) return;
    }
    raf = requestAnimationFrame(giro);
  };
  raf = requestAnimationFrame(giro);
  const ferma = () => { vivo = false; cancelAnimationFrame(raf); if (attivo === ferma) attivo = null; };
  attivo = ferma;
  return ferma;
}

/** un fotogramma della scena (frazione 0..1 della sua durata) disegnato in una tela: serve alle prove e alle foto */
export async function fotoScena(fai: Costruttore, frazione: number, dest: HTMLCanvasElement): Promise<boolean> {
  const x = await fotogrammiAlCursore();
  const s = fai(x.a, x.b);
  const n = s.a - s.da;
  const f = s.da + Math.min(n - 1, Math.floor(n * frazione));
  return disegna(dest, s, f, x.a, x.b);
}
