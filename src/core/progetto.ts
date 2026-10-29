// Fabbrica del progetto, delle tracce e delle clip, più le piccole utilità sul modello.
import type { Clip, ClipKind, Curva, Master, MediaItem, Project, Rate, Track, TrackKind, Transition, VideoFx, Transform, TitleSpec } from './tipi';
import { f2s } from './timecode';
import { valoreAnim } from './automazioni';

let seq = 0;
export const uid = (p = '') => p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

export const FX0: VideoFx = {
  bright: 0, contrast: 1, sat: 1, hue: 0, look: 'none',
  key: 'none', keyColor: '#00b140', keyLevel: 0.35, keySoft: 0.1, keyInvert: false,
};
export const TF0: Transform = { x: 0, y: 0, scale: 1, rot: 0, cropL: 0, cropR: 0, cropT: 0, cropB: 0 };

/** altezze di partenza: l'audio più alto (si vede la forma d'onda e il volume), il video più basso
 *  (fx = la vecchia corsia a parte, solo per i progetti di prima) */
export const ALTEZZA = { video: 62, audio: 76, fx: 27 } as const;

export function newTrack(kind: TrackKind, name: string): Track {
  return {
    id: uid('t'), kind, name, height: ALTEZZA[kind],
    mute: false, solo: false, lock: false, opacity: 1, volume: 0, pan: 0,
  };
}

export function newProject(fmt: { w: number; h: number; rate: Rate; drop: boolean }, name = 'Montaggio senza nome'): Project {
  const now = Date.now();
  return {
    format: 'daprod-video', v: 1, name,
    w: fmt.w, h: fmt.h, rate: { ...fmt.rate }, drop: fmt.drop, sampleRate: 48000,
    // due tracce video (V2 sopra) e due audio: gli FX stanno sopra le clip, le altre tracce si aggiungono da sole
    tracks: [newTrack('video', 'V2'), newTrack('video', 'V1'), newTrack('audio', 'A1'), newTrack('audio', 'A2')],
    clips: [], media: [], markers: [], inF: null, outF: null, preroll: 3, master: { ...MASTER0 },
    created: now, saved: 0,
  };
}

export function newClip(kind: ClipKind, track: string, start: number, len: number, extra: Partial<Clip> = {}): Clip {
  return {
    id: uid('c'), track, kind, name: extra.name ?? kind, start, len, srcIn: 0, speed: 1, label: 0,
    opacity: 1, opKeys: [], tf: { ...TF0 }, fx: { ...FX0 }, fadeIn: 0, fadeOut: 0,
    gain: 0, gainKeys: [], pan: 0, ...extra,
  };
}

export function newTransition(type: Transition['type'], len: number, pattern = 1): Transition {
  return { type, len, pattern, soft: 0.03, border: 0, borderColor: '#ffd54a', reverse: false, color: '#000000' };
}

/** i ritocchi finali di partenza: colore automatico acceso, niente look, limitatore acceso */
export const MASTER0: Master = {
  auto: true, autoK: 0.6, look: 'nessuno', intensita: 1, bright: 0, contrast: 1, sat: 1, temp: 0, tint: 0,
  vignette: 0, grain: 0, volume: 0, limiter: true,
};

/** i ritocchi finali del progetto (i progetti vecchi non li hanno: si usano quelli di partenza) */
export const masterDi = (p: Project): Master => p.master ?? MASTER0;

/** il colore automatico vale per questa clip? (la clip può dire sì o no da sola, altrimenti decide il Finale) */
export const autoColore = (p: Project, c: Clip) => c.kind === 'media' && (c.fx.auto ?? masterDi(p).auto);

export const TITLE0: TitleSpec = {
  text: 'DaProd Editor Video', style: 'fisso', font: 'Rajdhani', size: 90, color: '#ffffff', outline: '#000000',
  shadow: true, box: false, boxColor: '#000000aa', align: 'center', y: 0.5,
};

export const end = (c: Clip) => c.start + c.len;
export const trackOf = (p: Project, id: string) => p.tracks.find((t) => t.id === id)!;
export const mediaOf = (p: Project, c: Clip): MediaItem | undefined => (c.media ? p.media.find((m) => m.id === c.media) : undefined);
export const clipById = (p: Project, id: string) => p.clips.find((c) => c.id === id);
export const clipsOn = (p: Project, trackId: string) => p.clips.filter((c) => c.track === trackId).sort((a, b) => a.start - b.start);
export const videoTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'video');
export const audioTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'audio');
/** il progetto aperto, per sapere su che traccia sta una clip (lo tiene aggiornato lo Store) */
let aperto: Project | null = null;
export const progettoAperto = (p: Project) => { aperto = p; };

/**
 * La clip è video? Conta la traccia: una ripresa sulla traccia audio è audio, anche se il file ha il video.
 * (Si può passare il progetto; se no si usa quello aperto. Va bene anche dentro filter/some.)
 */
export const isVideoClip = (c: Clip, p?: unknown) => {
  if (!(c.kind === 'media' || c.kind === 'color' || c.kind === 'bars' || c.kind === 'countdown' || c.kind === 'title')) return false;
  const pp = p && typeof p === 'object' && 'tracks' in p ? (p as Project) : aperto;
  const t = pp?.tracks.find((x) => x.id === c.track);
  return t ? t.kind === 'video' : c.kind !== 'media';
};

/** fine del montaggio: l'ultimo fotogramma occupato */
export const projectEnd = (p: Project) => p.clips.reduce((m, c) => Math.max(m, end(c)), 0);

/** secondi nella sorgente per il fotogramma f della timeline */
export function srcTimeAt(p: Project, c: Clip, f: number): number {
  return c.srcIn + f2s(f - c.start, p.rate) * c.speed;
}

/** quanti fotogrammi di sorgente restano prima e dopo la clip (le "maniglie") */
export function handles(p: Project, c: Clip): { head: number; tail: number } {
  const m = mediaOf(p, c);
  if (!m || m.type === 'image' || !m.duration) return { head: Infinity, tail: Infinity };
  const r = p.rate.num / p.rate.den;
  const head = Math.floor(((c.srcIn - (m.t0 || 0)) / c.speed) * r + 1e-6);
  const usedEnd = c.srcIn + (c.len / r) * c.speed;
  const tail = Math.floor(((m.duration - usedEnd) / c.speed) * r + 1e-6);
  return { head: Math.max(0, head), tail: Math.max(0, tail) };
}

/** valore di una linea elastica al fotogramma locale lf (interpolazione lineare) */
export function keyValue(keys: { f: number; v: number }[], lf: number, base: number): number {
  if (!keys.length) return base;
  if (lf <= keys[0].f) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (lf <= b.f) return a.v + ((b.v - a.v) * (lf - a.f)) / Math.max(1e-9, b.f - a.f);
  }
  return keys[keys.length - 1].v;
}

/**
 * La forma della dissolvenza: x da 0 (silenzio, nero) a 1 (pieno) → quanto passa (0..1).
 * k < 0 parte piano piano e poi sale (il fader analogico), k > 0 sale subito e poi si posa, s = a S.
 */
export function curvaFade(x: number, cv?: Curva): number {
  const t = Math.max(0, Math.min(1, x));
  if (!cv || (!cv.k && !cv.s)) return t;
  const e = Math.pow(4, -Math.max(-1, Math.min(1, cv.k)));
  if (cv.s) {
    // a S: dolce ai due capi; k la fa più ripida (+) o più morbida (−)
    const a = 2 * Math.pow(2, cv.k);
    const u = Math.pow(t, a), v = Math.pow(1 - t, a);
    return u + v > 0 ? u / (u + v) : t;
  }
  return Math.pow(t, e);
}

/** le forme pronte (tasto destro sulla maniglia della dissolvenza) */
export const CURVE: { id: string; nome: string; cv: Curva }[] = [
  { id: 'lineare', nome: 'Dritta', cv: { k: 0 } },
  { id: 'morbida', nome: 'Morbida (potenza costante)', cv: { k: 0.5 } },
  { id: 'analogica', nome: 'Analogica (piano piano, poi sale)', cv: { k: -0.6 } },
  { id: 'veloce', nome: 'Veloce (subito, poi si posa)', cv: { k: 1 } },
  { id: 's', nome: 'A S (dolce ai due capi)', cv: { k: 0, s: true } },
];

export function nomeCurva(cv?: Curva): string {
  if (!cv || (!cv.k && !cv.s)) return 'dritta';
  const p = CURVE.find((x) => !!x.cv.s === !!cv.s && Math.abs(x.cv.k - cv.k) < 0.04);
  if (p) return p.nome.split(' (')[0].toLowerCase();
  return (cv.s ? 'a S ' : '') + (cv.k > 0 ? 'veloce ' : 'lenta ') + Math.round(Math.abs(cv.k) * 100) + '%';
}

/** quanto passa della clip al fotogramma locale lf per le sue dissolvenze (0..1) */
/** la S dei movimenti: parte e arriva piano */
export const dolceMoto = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Un valore lungo il tempo che passa per tutte le tappe, senza scatti e senza sforare: curva di Hermite con la
 *  pendenza limitata (ai capi ferma: con due sole tappe fa la stessa S dolce di sempre). ts crescenti, x da 0 a 1. */
export function passaPer(ts: number[], vs: number[], x: number): number {
  const n = ts.length;
  if (n === 1 || x <= ts[0]) return vs[0];
  if (x >= ts[n - 1]) return vs[n - 1];
  let k = 1;
  while (k < n - 1 && x > ts[k]) k++;
  const dt = Math.max(1e-9, ts[k] - ts[k - 1]);
  const pend = (i: number) => {
    if (i === 0 || i === n - 1) return 0;
    const a = (vs[i] - vs[i - 1]) / Math.max(1e-9, ts[i] - ts[i - 1]), b = (vs[i + 1] - vs[i]) / Math.max(1e-9, ts[i + 1] - ts[i]);
    // un massimo o un minimo: lì si ferma (niente rimbalzi oltre la tappa)
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const m0 = pend(k - 1) * dt, m1 = pend(k) * dt, u = (x - ts[k - 1]) / dt, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[k - 1] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * vs[k] + (u3 - u2) * m1;
}

const CAMPI_TF = ['x', 'y', 'scale', 'rot', 'cropL', 'cropR', 'cropT', 'cropB', 'angoli', 'ombra', 'sx'] as const;
const PARTENZA_TF: Record<string, number> = { angoli: 0, ombra: 0, sx: 1 };

/** le tappe del movimento di una clip in ordine: la partenza, quelle di mezzo, l'arrivo (vuoto se la clip sta ferma) */
export function tappeTf(c: Clip): { t: number; tf: Transform }[] {
  if (!c.tfFine) return [];
  const mezzo = (c.via ?? []).filter((v) => v.t > 0.001 && v.t < 0.999).sort((a, b) => a.t - b.t);
  return [{ t: 0, tf: c.tf }, ...mezzo, { t: 1, tf: c.tfFine }];
}

/** la posizione della clip al fotogramma locale lf: ferma (tf) o in movimento verso tfFine, passando per le tappe di mezzo */
export function tfAl(c: Clip, lf: number): Transform {
  const base = tfMovimento(c, lf);
  if (!c.anim) return base;
  // i campi con i keyframe prendono il posto di quelli fermi o in movimento (gli altri restano com'erano)
  let o: Transform | null = null;
  for (const k of CAMPI_TF) {
    const linea = c.anim['tf.' + k];
    if (!linea?.length) continue;
    o ??= { ...base };
    (o as unknown as Record<string, number>)[k] = valoreAnim(linea, lf, (base as unknown as Record<string, number | undefined>)[k] ?? PARTENZA_TF[k] ?? 0);
  }
  return o ?? base;
}

function tfMovimento(c: Clip, lf: number): Transform {
  if (!c.tfFine) return c.tf;
  const x = Math.max(0, Math.min(1, lf / Math.max(1, c.len - 1)));
  const tappe = tappeTf(c);
  const ts = tappe.map((t) => t.t);
  const o: Record<string, number> = {};
  for (const k of CAMPI_TF) o[k] = passaPer(ts, tappe.map((t) => (t.tf as unknown as Record<string, number | undefined>)[k] ?? PARTENZA_TF[k] ?? 0), x);
  return o as unknown as Transform;
}

/** quanto della clip è passato (0..1) al fotogramma f: serve a mettere una tappa sotto il cursore */
export const quantoDellaClip = (c: Clip, f: number) => Math.max(0, Math.min(1, (f - c.start) / Math.max(1, c.len - 1)));

export function fadeAl(c: Clip, lf: number): number {
  let g = 1;
  if (c.fadeIn > 0 && lf < c.fadeIn) g *= curvaFade(lf / c.fadeIn, c.curvaIn);
  if (c.fadeOut > 0 && lf > c.len - c.fadeOut) g *= curvaFade((c.len - lf) / c.fadeOut, c.curvaOut);
  return g;
}

/** opacità di una clip al fotogramma f (clip × linea elastica × dissolvenze) */
export function clipOpacity(c: Clip, f: number): number {
  const lf = f - c.start;
  const anim = c.anim?.opacity;
  let o = anim?.length ? valoreAnim(anim, lf, c.opacity) : c.opKeys.length ? keyValue(c.opKeys, lf, c.opacity) : c.opacity;
  o *= fadeAl(c, lf);
  return Math.max(0, Math.min(1, o));
}

export const dbToGain = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20));
export const gainToDb = (g: number) => (g <= 0.001 ? -60 : 20 * Math.log10(g));

/** nome della prossima traccia libera: V4, A5… */
export function nextTrackName(p: Project, kind: TrackKind): string {
  const pre = kind === 'video' ? 'V' : kind === 'fx' ? 'FX' : 'A';
  let n = 1;
  while (p.tracks.some((t) => t.name === pre + n)) n++;
  return pre + n;
}
