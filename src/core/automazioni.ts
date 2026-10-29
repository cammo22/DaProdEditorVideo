// Keyframe su qualunque parametro numerico di una clip o di un effetto.
// Una clip può avere `c.anim`: per ogni parametro (un "percorso" come "opacity", "tf.x", "fx.sat", "fxb.forza",
// "mask.<id>.sfuma") una lista di chiavi {f, v, modo}. Chi non ha una linea usa il valore fermo di sempre, quindi i
// progetti vecchi (senza `anim`) restano identici. Le linee elastiche di prima (opKeys, gainKeys) e il movimento
// (tf → via → tfFine) continuano a funzionare: l'animazione, se c'è, ha la precedenza solo su quel parametro.
// Questo modulo è puro e non importa altri moduli (lo usano progetto.ts, blocchi.ts, il compositore e l'audio).
// La struttura (linee per parametro con chiavi a tempo, ricerca della coppia di chiavi, descrittori dei parametri
// per percorso) si ispira ai motori di keyframe di OpenReel Video (MIT): vedi TERZE-PARTI.md.
import type { ChiaveAnim, Clip, MascheraForma, ModoAnim } from './tipi';

export const MODI_ANIM: { id: ModoAnim; nome: string; info: string }[] = [
  { id: 'lineare', nome: 'Dritta', info: 'va dritta fino alla chiave dopo' },
  { id: 'morbida', nome: 'Morbida', info: 'parte e arriva piano' },
  { id: 'gradino', nome: 'A gradino', info: 'resta com\'è e salta alla chiave dopo' },
];

/** il valore di una linea al fotogramma locale lf. Prima della prima chiave e dopo l'ultima vale quella; nessuna chiave = base. */
export function valoreAnim(keys: readonly ChiaveAnim[] | undefined, lf: number, base: number): number {
  const n = keys?.length ?? 0;
  if (!keys || !n) return base;
  if (lf <= keys[0].f) return keys[0].v;
  if (lf >= keys[n - 1].f) return keys[n - 1].v;
  // ricerca binaria della coppia che racchiude lf
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m].f <= lf) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi];
  const modo = a.modo ?? 'lineare';
  if (modo === 'gradino') return a.v;
  let t = (lf - a.f) / Math.max(1e-9, b.f - a.f);
  if (modo === 'morbida') t = t * t * (3 - 2 * t);
  return a.v + (b.v - a.v) * t;
}

// ——— i parametri: ogni percorso sa leggersi e scriversi sulla clip ———

export interface Descrittore { get(c: Clip): number; set(c: Clip, v: number): void }

const TF: Record<string, number> = { x: 0, y: 0, scale: 1, rot: 0, cropL: 0, cropR: 0, cropT: 0, cropB: 0, angoli: 0, ombra: 0, sx: 1 };
const FX: Record<string, number> = { bright: 0, contrast: 1, sat: 1, hue: 0, temp: 0, vignette: 0, zoom: 0, keyLevel: 0.35, keySoft: 0.1, keyBordo: 0, keySfuma: 0, keyPulisci: 0 };
const RUOTE: Record<string, number> = { lift: 0, gamma: 1, gain: 1 };
const CANALE: Record<string, number> = { r: 0, g: 1, b: 2 };
/** i campi numerici di una maschera che si possono animare */
export const CAMPI_MASCHERA = ['x', 'y', 'w', 'h', 'rot', 'sfuma', 'espandi', 'opacita'] as const;

const maschera = (c: Clip, id: string): MascheraForma | undefined => c.maschere?.find((m) => m.id === id);

/** il parametro di un percorso, o null se il percorso non esiste */
export function descrittore(path: string): Descrittore | null {
  if (path === 'opacity') return { get: (c) => c.opacity, set: (c, v) => { c.opacity = v; } };
  if (path === 'gain') return { get: (c) => c.gain, set: (c, v) => { c.gain = v; } };
  if (path === 'pan') return { get: (c) => c.pan, set: (c, v) => { c.pan = v; } };
  const [grp, k, k2, k3] = path.split('.');
  if (grp === 'tf' && Object.hasOwn(TF, k) && !k2) return { get: (c) => (c.tf as unknown as Record<string, number | undefined>)[k] ?? TF[k], set: (c, v) => { (c.tf as unknown as Record<string, number>)[k] = v; } };
  if (grp === 'fx' && Object.hasOwn(FX, k) && !k2) return { get: (c) => (c.fx as unknown as Record<string, number | undefined>)[k] ?? FX[k], set: (c, v) => { (c.fx as unknown as Record<string, number>)[k] = v; } };
  if (grp === 'fx' && k === 'colore' && Object.hasOwn(RUOTE, k2) && Object.hasOwn(CANALE, k3)) {
    const i = CANALE[k3];
    return {
      get: (c) => c.fx.colore?.[k2 as 'lift']?.[i] ?? RUOTE[k2],
      set: (c, v) => {
        const col = (c.fx.colore ??= {});
        const t = [...(col[k2 as 'lift'] ?? [RUOTE[k2], RUOTE[k2], RUOTE[k2]])] as [number, number, number];
        t[i] = v;
        col[k2 as 'lift'] = t;
      },
    };
  }
  if (path === 'fx.colore.lut') return { get: (c) => c.fx.colore?.lut?.intensita ?? 1, set: (c, v) => { if (c.fx.colore?.lut) c.fx.colore.lut.intensita = v; } };
  if (grp === 'fxb' && k === 'forza' && !k2) return { get: (c) => c.fxb?.forza ?? 1, set: (c, v) => { if (c.fxb) c.fxb.forza = v; } };
  if (grp === 'fxb' && k === 'volume' && !k2) return { get: (c) => c.fxb?.volume ?? 0, set: (c, v) => { if (c.fxb) c.fxb.volume = v; } };
  if (grp === 'fxb' && k === 'parametri' && k2 && !k3) return { get: (c) => c.fxb?.parametri?.[k2] ?? 0, set: (c, v) => { if (c.fxb) (c.fxb.parametri ??= {})[k2] = v; } };
  if (grp === 'mask' && k) {
    const id = k;
    if ((CAMPI_MASCHERA as readonly string[]).includes(k2) && !k3) {
      return { get: (c) => (maschera(c, id) as unknown as Record<string, number> | undefined)?.[k2] ?? 0, set: (c, v) => { const m = maschera(c, id); if (m) (m as unknown as Record<string, number>)[k2] = v; } };
    }
    // i punti della Bézier: mask.<id>.p<n>.x / .y
    const mp = /^p(\d+)$/.exec(k2 ?? '');
    if (mp && (k3 === 'x' || k3 === 'y')) {
      const i = Number(mp[1]);
      return { get: (c) => maschera(c, id)?.punti?.[i]?.[k3] ?? 0, set: (c, v) => { const p = maschera(c, id)?.punti?.[i]; if (p) p[k3] = v; } };
    }
  }
  return null;
}

/** il valore fermo (quello che c'è nella clip, senza animazione) di un parametro */
export function valoreFermo(c: Clip, path: string): number {
  return descrittore(path)?.get(c) ?? 0;
}

const aMano = (c: Clip) => c.anim && Object.keys(c.anim).some((k) => c.anim![k]?.length);

/** il percorso ha una linea con chiavi? */
export const haLinea = (c: Clip, path: string) => !!c.anim?.[path]?.length;

/** il valore di un parametro al fotogramma locale lf: quello animato se c'è la linea, se no quello fermo */
export function valoreAl(c: Clip, path: string, lf: number): number {
  const k = c.anim?.[path];
  const d = descrittore(path);
  const base = d ? d.get(c) : 0;
  return k?.length ? valoreAnim(k, lf, base) : base;
}

/** una copia della clip con le parti che i keyframe possono toccare staccate dall'originale (tf, fx, blocco, maschere) */
export function copiaLeggera(c: Clip): Clip {
  const o: Clip = {
    ...c,
    tf: { ...c.tf },
    fx: { ...c.fx, colore: c.fx.colore ? structuredClone(c.fx.colore) : undefined },
    fxb: c.fxb ? { ...c.fxb, parametri: c.fxb.parametri ? { ...c.fxb.parametri } : undefined } : undefined,
    maschere: c.maschere?.map((m) => ({ ...m, punti: m.punti?.map((p) => ({ ...p })) })),
  };
  if (!o.fx.colore) delete (o.fx as { colore?: unknown }).colore;
  if (!o.fxb) delete (o as { fxb?: unknown }).fxb;
  if (!o.maschere) delete (o as { maschere?: unknown }).maschere;
  return o;
}

/**
 * La clip com'è al fotogramma locale lf, con tutti i parametri animati sostituiti dal loro valore di adesso.
 * Senza animazioni ritorna la clip stessa (nessun costo, nessuna differenza); altrimenti una copia: il progetto
 * non si tocca mai durante il disegno. `anim` resta sulla copia (tfAl lo rilegge: dà lo stesso valore).
 */
export function valutaClip(c: Clip, lf: number): Clip {
  if (!aMano(c)) return c;
  const o = copiaLeggera(c);
  for (const path of Object.keys(c.anim!)) {
    const keys = c.anim![path];
    if (!keys?.length) continue;
    const d = descrittore(path);
    if (!d) continue;
    const v = valoreAnim(keys, lf, d.get(o));
    if (Number.isFinite(v)) d.set(o, v);
    // la linea nuova prende il posto delle vecchie linee elastiche (non si sommano)
    if (path === 'opacity') o.opKeys = [];
    if (path === 'gain') o.gainKeys = [];
  }
  return o;
}

/** i percorsi che hanno almeno una chiave */
export const percorsiAnimati = (c: Clip) => Object.keys(c.anim ?? {}).filter((k) => c.anim![k]?.length);

// ——— modificare le linee ———

export const indiceChiave = (c: Clip, path: string, lf: number) => c.anim?.[path]?.findIndex((k) => k.f === lf) ?? -1;
export const haChiaveA = (c: Clip, path: string, lf: number) => indiceChiave(c, path, lf) >= 0;

/**
 * Mette (o cambia) una chiave. Se per quel parametro c'era una linea elastica di prima (opacità, volume) la trasforma in
 * chiavi dritte equivalenti: da quel momento comanda la nuova linea, e il disegno non cambia.
 */
export function mettiChiave(c: Clip, path: string, lf: number, v: number, modo?: ModoAnim) {
  const anim = (c.anim ??= {});
  let linea = anim[path];
  if (!linea) {
    linea = [];
    if (path === 'opacity' && c.opKeys.length) { linea = c.opKeys.map((k) => ({ f: k.f, v: k.v })); c.opKeys = []; }
    if (path === 'gain' && c.gainKeys.length) { linea = c.gainKeys.map((k) => ({ f: k.f, v: k.v })); c.gainKeys = []; }
    anim[path] = linea;
  }
  const i = linea.findIndex((k) => k.f === lf);
  if (i >= 0) { linea[i].v = v; if (modo) setModo(linea[i], modo); }
  else {
    const k: ChiaveAnim = { f: lf, v };
    if (modo && modo !== 'lineare') k.modo = modo;
    linea.push(k);
    linea.sort((a, b) => a.f - b.f);
  }
}

function setModo(k: ChiaveAnim, modo: ModoAnim) {
  if (modo === 'lineare') delete k.modo; else k.modo = modo;
}

/** cambia il modo con cui si va da quella chiave alla successiva */
export function impostaModoChiave(c: Clip, path: string, lf: number, modo: ModoAnim) {
  const k = c.anim?.[path]?.find((x) => x.f === lf);
  if (k) setModo(k, modo);
}

/** toglie una chiave; se era l'ultima la linea sparisce e il parametro resta dov'era in quel punto (niente salti) */
export function togliChiave(c: Clip, path: string, lf: number) {
  const linea = c.anim?.[path];
  if (!linea) return;
  const i = linea.findIndex((k) => k.f === lf);
  if (i < 0) return;
  const v = linea[i].v;
  linea.splice(i, 1);
  if (!linea.length) {
    delete c.anim![path];
    descrittore(path)?.set(c, v);
    if (!Object.keys(c.anim!).length) delete c.anim;
  }
}

/** toglie tutta la linea; il valore fermo diventa quello che c'è al fotogramma lf */
export function togliLinea(c: Clip, path: string, lf: number) {
  if (!c.anim?.[path]) return;
  const v = valoreAl(c, path, lf);
  delete c.anim[path];
  descrittore(path)?.set(c, v);
  if (!Object.keys(c.anim).length) delete c.anim;
}

/**
 * Toglie le linee animate di un parametro (o di tutto un gruppo: "tf" toglie "tf.x", "tf.scale"…). Serve a chi mette un
 * valore fisso (Muto, Azzera colore, posizioni pronte…): senza, la linea comanderebbe ancora e il comando non si vedrebbe.
 */
export function togliAnimazione(c: Clip, ...percorsi: string[]) {
  if (!c.anim) return;
  for (const k of Object.keys(c.anim)) if (percorsi.some((p) => k === p || k.startsWith(p + '.'))) delete c.anim[k];
  if (!Object.keys(c.anim).length) delete c.anim;
}

/** il fotogramma della chiave prima (dir −1) o dopo (dir +1) di lf, o null */
export function chiaveVicina(c: Clip, path: string, lf: number, dir: -1 | 1): number | null {
  const linea = c.anim?.[path];
  if (!linea) return null;
  if (dir > 0) { const k = linea.find((x) => x.f > lf); return k ? k.f : null; }
  for (let i = linea.length - 1; i >= 0; i--) if (linea[i].f < lf) return linea[i].f;
  return null;
}

/** tutte le chiavi di tutte le linee (per disegnarle sulla clip): fotogramma locale → quante linee ci sono */
export function fotogrammiChiave(c: Clip): number[] {
  const s = new Set<number>();
  for (const k of Object.keys(c.anim ?? {})) for (const x of c.anim![k]) s.add(x.f);
  return [...s].sort((a, b) => a - b);
}

// ——— quando la clip cambia (taglio, bordi, velocità, frequenza) le chiavi la seguono ———

/** dopo il taglio al fotogramma locale lf: a sinistra restano le chiavi prima, a destra quelle dopo (spostate); il valore del taglio sta da tutte e due le parti */
export function dividiAnim(c: Clip, destra: Clip, lf: number) {
  if (!c.anim) return;
  const sx: Record<string, ChiaveAnim[]> = {}, dx: Record<string, ChiaveAnim[]> = {};
  for (const path of Object.keys(c.anim)) {
    const keys = c.anim[path];
    if (!keys.length) continue;
    const v = valoreAnim(keys, lf, 0);
    // il modo del tratto che contiene il taglio passa alla chiave nuova di destra
    let prima: ChiaveAnim | undefined;
    for (const k of keys) if (k.f <= lf) prima = k;
    const modo = prima?.modo;
    sx[path] = keys.filter((k) => k.f < lf).map((k) => ({ ...k })).concat({ f: lf, v });
    const nuova: ChiaveAnim = { f: 0, v };
    if (modo) nuova.modo = modo;
    dx[path] = [nuova].concat(keys.filter((k) => k.f > lf).map((k) => ({ ...k, f: k.f - lf })));
  }
  c.anim = sx;
  destra.anim = dx;
}

/** una clip che perde d fotogrammi all'inizio (o li guadagna se d < 0): le chiavi restano sullo stesso istante del contenuto */
export function spostaAnim(c: Clip, d: number) {
  if (!c.anim || !d) return;
  for (const path of Object.keys(c.anim)) c.anim[path] = c.anim[path].map((k) => ({ ...k, f: k.f - d }));
}

/** la clip cambia durata di un fattore k (velocità, frequenza di quadro): le chiavi si rimettono in proporzione */
export function scalaAnim(c: Clip, k: number) {
  if (!c.anim || k === 1) return;
  for (const path of Object.keys(c.anim)) {
    const r: ChiaveAnim[] = [];
    for (const x of c.anim[path]) {
      const f = Math.round(x.f * k);
      const i = r.findIndex((y) => y.f === f);
      if (i >= 0) r[i] = { ...x, f }; else r.push({ ...x, f });
    }
    c.anim[path] = r.sort((a, b) => a.f - b.f);
  }
}

/**
 * Quando si apre un progetto: le animazioni scritte male (chiavi non finite, fuori ordine, doppie) si rimettono a posto,
 * le linee vuote o di parametri che non esistono più si tolgono. Senza `anim` non si fa niente (i progetti vecchi restano come sono).
 */
export function pulisciAnim(c: Clip) {
  if (c.anim === undefined) { if (c.maschere !== undefined && !Array.isArray(c.maschere)) delete c.maschere; return; }
  if (!c.anim || typeof c.anim !== 'object') { delete c.anim; return; }
  for (const path of Object.keys(c.anim)) {
    const grezza = c.anim[path];
    if (!Array.isArray(grezza) || !descrittore(path)) { delete c.anim[path]; continue; }
    const ok = grezza.filter((k) => k && Number.isFinite(k.f) && Number.isFinite(k.v));
    const per = new Map<number, ChiaveAnim>();
    for (const k of ok) {
      const n: ChiaveAnim = { f: k.f, v: k.v };
      if (k.modo === 'morbida' || k.modo === 'gradino') n.modo = k.modo;
      per.set(k.f, n); // l'ultima scritta vince
    }
    if (!per.size) delete c.anim[path]; else c.anim[path] = [...per.values()].sort((a, b) => a.f - b.f);
  }
  if (!Object.keys(c.anim).length) delete c.anim;
}

/** i fotogrammi dove programmare una linea sull'audio (rampe dritte fra un punto e l'altro): le chiavi, e in mezzo più punti se la curva è morbida; il gradino salta subito prima della chiave dopo */
export function puntiLinea(keys: readonly ChiaveAnim[] | undefined): number[] {
  const out: number[] = [];
  if (!keys) return out;
  for (let i = 0; i < keys.length; i++) {
    out.push(keys[i].f);
    if (!i) continue;
    const a = keys[i - 1], b = keys[i];
    const modo = a.modo ?? 'lineare';
    if (modo === 'gradino') out.push(b.f - 0.02);
    else {
      const n = modo === 'morbida' ? 24 : 1;
      for (let s = 1; s < n; s++) out.push(a.f + ((b.f - a.f) * s) / n);
    }
  }
  return out;
}

/** il volume della clip in dB al fotogramma locale lf (linea nuova, se no linea elastica di prima, se no il valore fermo) */
export function gainDbAl(c: Clip, lf: number, vecchia: (keys: { f: number; v: number }[], lf: number, base: number) => number): number {
  const k = c.anim?.gain;
  if (k?.length) return valoreAnim(k, lf, c.gain);
  return c.gainKeys.length ? vecchia(c.gainKeys, lf, c.gain) : c.gain;
}
