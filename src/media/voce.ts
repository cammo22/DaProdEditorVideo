// I sottotitoli scritti dall'AI: si prende l'audio dei dialoghi del montaggio (la presa diretta, non la musica),
// lo si porta a 16 kHz, lo si passa a chi ascolta a pezzi di un minuto tagliati nei silenzi, e il testo torna in righe
// di sottotitolo coi loro tempi. Chi ascolta può essere:
//  · Nemotron 3.5 di NVIDIA (src/media/nemo.ts, nell'app): multilingua, va su scheda NVIDIA, Mac e anche su CPU;
//  · Whisper (src/media/voce.worker.ts, anche nel browser), e dall'italiano anche la traduzione in inglese.
// Tutto sul computer di chi monta: l'audio non va da nessuna parte.
import type { Project, Sottotitolo } from '../core/tipi';
import { end, projectEnd, uid } from '../core/progetto';
import { f2s, fps } from '../core/timecode';
import { mixaggio } from './audio';
import { assicuraMotore, motoreNemo } from './nemo';
import { spiegaErroreAI } from './erroriAI';
import { baseLocaleAI } from './libreriaAI';
import { messaggioScheda, schedaGuasta } from './hardware';

export interface Modello { id: string; nome: string; info: string; mb: number }

export const MODELLI: Modello[] = [
  { id: 'onnx-community/whisper-tiny', nome: 'Veloce', info: 'il più leggero, per provare', mb: 40 },
  { id: 'onnx-community/whisper-base', nome: 'Buono', info: 'il giusto fra velocità e precisione', mb: 80 },
  { id: 'onnx-community/whisper-small', nome: 'Preciso', info: 'sbaglia meno, ci mette di più', mb: 250 },
];

export interface OpzioniVoce {
  /** la lingua in cui si parla ("auto" = la riconosce da solo) */
  lingua: string;
  /** dall'italiano: scrivi direttamente in inglese (solo Whisper) */
  traduci: boolean;
  modello: string;
  /** chi ascolta: Nemotron di NVIDIA (nell'app) o Whisper */
  motore?: 'nemotron' | 'whisper';
}

export interface Pezzo { da: number; a: number | null; testo: string }

/** chi trascrive un pezzo d'audio (16 kHz mono): di solito il worker con Whisper; le prove ne mettono uno finto */
export type Trascrittore = {
  carica: (modello: string, stato: (fase: string, prog: number) => void) => Promise<string>;
  trascrivi: (audio: Float32Array, lingua: string, traduci: boolean) => Promise<Pezzo[]>;
};

const SR = 16000;

// ——— il worker ———
let worker: Worker | null = null;
let seq = 0;
const attese = new Map<number, { ok: (p: Pezzo[]) => void; no: (e: Error) => void }>();
let caricamento: { ok: (d: string) => void; no: (e: Error) => void; stato: (fase: string, prog: number) => void } | null = null;
const scaricati = new Map<string, [number, number]>();

function lavoratore(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./voce.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { tipo: string; id?: number; pezzi?: Pezzo[]; msg?: string; device?: string; file?: string; loaded?: number; total?: number; schedaGuasta?: boolean };
    if (m.tipo === 'scarico' && caricamento) {
      scaricati.set(m.file!, [m.loaded!, m.total!]);
      let a = 0, b = 0;
      for (const [x, y] of scaricati.values()) { a += x; b += y; }
      caricamento.stato(`Scarico il modello: ${(a / 1048576).toFixed(0)} di ${(b / 1048576).toFixed(0)} MB (solo la prima volta)`, b ? a / b : 0);
    } else if (m.tipo === 'avviso') { caricamento?.stato(m.msg ?? '', 0); avvisoVoce?.(m.msg ?? ''); }
    else if (m.tipo === 'scheda-guasta') schedaGuasta();
    else if (m.tipo === 'pronto') { caricamento?.ok(m.device ?? ''); caricamento = null; }
    else if (m.tipo === 'testo') { attese.get(m.id!)?.ok(m.pezzi ?? []); attese.delete(m.id!); }
    else if (m.tipo === 'errore') {
      const err: Error & { schedaGuasta?: boolean } = new Error(m.msg || 'errore della voce');
      err.schedaGuasta = m.schedaGuasta;
      if (m.id !== undefined && attese.has(m.id)) { attese.get(m.id)!.no(err); attese.delete(m.id); }
      else { caricamento?.no(err); caricamento = null; }
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'il worker della voce si è fermato');
    caricamento?.no(err); caricamento = null;
    for (const x of attese.values()) x.no(err);
    attese.clear();
    // un worker che si è fermato (memoria finita…) non risponde più: si butta, la prossima volta se ne fa uno nuovo
    // (prima si riusava quello morto e la funzione restava appesa per sempre)
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** chi vuole sapere i cambi in corsa (la scheda video si è fermata, si continua col processore) */
let avvisoVoce: ((msg: string) => void) | null = null;

/** l'ultimo modello caricato (per ricaricarlo se bisogna ripartire) */
let ultimoModello: { modello: string; stato: (fase: string, prog: number) => void } | null = null;

function caricaNelWorker(modello: string, stato: (fase: string, prog: number) => void, senzaScheda = false): Promise<string> {
  return new Promise((ok, no) => {
    scaricati.clear();
    caricamento = { ok, no, stato };
    const hw = messaggioScheda();
    const usa = senzaScheda ? { ...hw, scheda: false, finta: false } : hw;
    lavoratore().postMessage({ tipo: 'carica', modello, base: baseLocaleAI(), scheda: usa.scheda, hw: usa });
  });
}

function trascriviNelWorker(audio: Float32Array, lingua?: string, traduci?: boolean): Promise<Pezzo[]> {
  return new Promise((ok, no) => {
    const id = ++seq;
    attese.set(id, { ok, no });
    lavoratore().postMessage({ tipo: 'trascrivi', id, audio, lingua, traduci }, [audio.buffer]);
  });
}

const whisper: Trascrittore = {
  carica: (modello, stato) => { ultimoModello = { modello, stato }; return caricaNelWorker(modello, stato); },
  trascrivi: async (audio, lingua, traduci) => {
    // l'audio passa al worker (e da lì sparisce): se serve rifare il pezzo se ne tiene una copia
    const copia = audio.slice();
    try {
      return await trascriviNelWorker(audio, lingua, traduci);
    } catch (e) {
      if (!(e as { schedaGuasta?: boolean }).schedaGuasta || !ultimoModello) throw e;
      // la scheda video ha sbagliato: il worker si butta e si riparte da uno nuovo sul processore, con lo stesso pezzo
      ultimoModello.stato('La scheda video si è fermata: continuo col processore (più lento)', 0);
      worker?.terminate();
      worker = null;
      caricamento = null;
      attese.clear();
      await caricaNelWorker(ultimoModello.modello, ultimoModello.stato, true);
      return trascriviNelWorker(copia, lingua, traduci);
    }
  },
};

let trascrittore: Trascrittore = whisper;
/** per le prove: un trascrittore finto (null = torna Whisper) */
export const impostaTrascrittore = (t: Trascrittore | null) => { trascrittore = t ?? whisper; };

/** ferma tutto (il pulsante "Ferma"): il worker si chiude e il modello si ricarica la prossima volta */
export function fermaVoce() {
  worker?.terminate();
  worker = null;
  const err = new Error('fermato');
  caricamento?.no(err); caricamento = null;
  for (const x of attese.values()) x.no(err);
  attese.clear();
}

// ——— l'audio dei dialoghi ———

/** l'audio da ascoltare: le clip audio legate a un video (la presa diretta); se non ce ne sono, tutto l'audio.
 *  Niente suoni degli FX. A 16 kHz, mono. */
export async function audioPerVoce(p0: Project, stato?: (prog: number) => void): Promise<Float32Array> {
  const p: Project = structuredClone(p0);
  const video = new Set(p.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
  const audio = new Set(p.tracks.filter((t) => t.kind === 'audio' && !t.mute).map((t) => t.id));
  const presa = p.clips.filter((c) => audio.has(c.track) && c.link && p.clips.some((v) => v.link === c.link && video.has(v.track)));
  if (presa.length) { const tieni = new Set(presa.map((c) => c.id)); p.clips = p.clips.filter((c) => !audio.has(c.track) || tieni.has(c.id)); }
  for (const c of p.clips) if (c.fxb) c.fxb.audio = false;
  for (const t of p.tracks) if (t.kind === 'audio') t.solo = false;
  p.sampleRate = SR;
  if (p.master) p.master = { ...p.master, limiter: false, volume: 0 };
  const fine = f2s(Math.max(projectEnd(p), ...p.clips.map(end)), p.rate);
  const out = new Float32Array(Math.max(1, Math.ceil(fine * SR)));
  let i = 0;
  for await (const b of mixaggio(p, 0, fine)) {
    const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
    for (let k = 0; k < b.length && i < out.length; k++) out[i++] = (l[k] + r[k]) * 0.5;
    stato?.(i / out.length);
  }
  return out;
}

/** dove tagliare l'audio in pezzi di circa un minuto: nel punto più silenzioso vicino al minuto */
export function puntiDiTaglio(a: Float32Array, lungo = 60, margine = 8): number[] {
  const tot = a.length / SR;
  const out = [0];
  const fin = 0.05 * SR;
  while (tot - out[out.length - 1] > lungo + margine) {
    const obiettivo = out[out.length - 1] + lungo;
    let best = obiettivo, bv = Infinity;
    for (let t = obiettivo - margine; t <= obiettivo + margine; t += 0.05) {
      const s = Math.floor(t * SR);
      let e = 0;
      for (let k = s; k < s + fin && k < a.length; k++) e += a[k] * a[k];
      if (e < bv) { bv = e; best = t; }
    }
    out.push(best);
  }
  out.push(tot);
  return out;
}

// ——— dal testo alle righe ———

const RUMORI = /^[\s[(♪*-]*(musica|music|applausi|applause|risate|laughter|silenzio|silence|rumore|noise|blank_audio|sottotitoli[^\]]*|subtitles[^\]]*)[\s\])♪*.-]*$/i;

/** i pezzi di Whisper diventano righe: niente "[Musica]", le frasi lunghe spezzate (una riga si legge in fretta) */
export function righeDaPezzi(pezzi: Pezzo[], p: Project): Sottotitolo[] {
  const r = fps(p.rate);
  const buoni = pezzi.map((x) => ({ ...x, testo: x.testo.replace(/\s+/g, ' ').trim() })).filter((x) => x.testo && !RUMORI.test(x.testo) && Number.isFinite(x.da));
  const out: Sottotitolo[] = [];
  buoni.forEach((x, i) => {
    const parole = x.testo.split(' ');
    let a = x.a ?? x.da + Math.max(1.5, parole.length * 0.38);
    const dopo = buoni[i + 1];
    if (dopo && a > dopo.da) a = dopo.da;
    a = Math.max(a, x.da + 0.8);
    const dur = a - x.da;
    const n = Math.max(1, Math.ceil(Math.max(x.testo.length / 80, dur / 6.5)));
    // a pezzi uguali per numero di lettere, e il tempo diviso allo stesso modo
    const gruppi: string[][] = [];
    const quota = x.testo.length / n;
    let cur: string[] = [], lun = 0;
    for (const w of parole) {
      if (cur.length && lun + w.length / 2 > quota * (gruppi.length + 1) && gruppi.length < n - 1) { gruppi.push(cur); cur = []; }
      cur.push(w);
      lun += w.length + 1;
    }
    if (cur.length) gruppi.push(cur);
    const totale = gruppi.reduce((s, g) => s + g.join(' ').length, 0);
    let t = x.da;
    for (const g of gruppi) {
      const testo = g.join(' ');
      const t1 = t + (dur * testo.length) / Math.max(1, totale);
      out.push({ id: uid('s'), da: Math.round(t * r), a: Math.max(Math.round(t * r) + 1, Math.round(t1 * r)), testo });
      t = t1;
    }
  });
  return out;
}

/**
 * Scrive i sottotitoli con l'AI. stato(fase, 0..1) racconta cosa sta facendo; il segnale ferma tutto.
 * Ritorna le righe (in fotogrammi del progetto).
 */
export async function sottotitoliAI(p: Project, o: OpzioniVoce, stato: (fase: string, prog: number) => void, segnale?: AbortSignal): Promise<Sottotitolo[]> {
  const fermo = () => { if (segnale?.aborted) throw new Error('fermato'); };
  stato('Preparo l\'audio dei dialoghi…', 0);
  const audio = await audioPerVoce(p, (x) => stato('Preparo l\'audio dei dialoghi…', x * 0.1));
  fermo();
  let picco = 0;
  for (let i = 0; i < audio.length; i += 64) picco = Math.max(picco, Math.abs(audio[i]));
  if (picco < 0.003) throw new Error('muto');
  const tagli = puntiDiTaglio(audio);
  // nel browser il motore NVIDIA non c'è: si va con Whisper, e lo si dice
  let ripiego = o.motore === 'nemotron' && !motoreNemo() ? 'c\'è solo nell\'app per Windows e Mac' : '';
  if (o.motore === 'nemotron' && motoreNemo()) {
    // Nemotron 3.5 di NVIDIA, col motore dell'app: prima si prepara (motore e modello, solo la prima volta), poi si ascolta
    const nem = motoreNemo()!;
    try {
      await assicuraMotore(nem, ['asr'], (k, t) => stato(t, 0.1 + k * 0.4), segnale);
      fermo();
      const daAscoltare = tagli.slice(0, -1).map((a, k) => ({ da: a, audio: audio.slice(Math.floor(a * SR), Math.floor(tagli[k + 1] * SR)) }));
      const pezzi = await nem.trascrivi(daAscoltare, { lingua: o.lingua }, (k, t) => stato(t, 0.5 + k * 0.5), segnale);
      fermo();
      stato('Fatto', 1);
      return righeDaPezzi(pezzi, p);
    } catch (e) {
      // il motore NVIDIA non è partito (niente internet per scaricarlo, scheda o sistema che non lo regge…): invece di
      // fermarsi si passa a Whisper, che gira dentro l'app. Chi ha premuto "Ferma" invece si ferma davvero.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'fermato' || segnale?.aborted) throw e;
      ripiego = msg;
      stato(`Il motore NVIDIA non è partito (${msg}): passo a Whisper…`, 0.1);
    }
  }
  stato(ripiego ? `Il motore NVIDIA ${motoreNemo() ? 'non è partito' : 'c\'è solo nell\'app'}: carico Whisper…` : 'Carico il modello…', 0.1);
  let dove: string;
  try {
    dove = await trascrittore.carica(o.modello || MODELLI[1].id, (fase, x) => stato(fase, 0.1 + x * 0.3));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'fermato' || segnale?.aborted) throw e;
    throw new Error(spiegaErroreAI(msg) + (ripiego ? ` (e il motore NVIDIA: ${ripiego})` : ''));
  }
  fermo();
  const pezzi: Pezzo[] = [];
  for (let k = 0; k < tagli.length - 1; k++) {
    fermo();
    const a = tagli[k], b = tagli[k + 1];
    stato(`Ascolto e scrivo${dove === 'webgpu' ? ' (con la scheda video)' : ''}: ${Math.round(a)} di ${Math.round(tagli[tagli.length - 1])} secondi`, 0.4 + (0.6 * k) / (tagli.length - 1));
    const pezzo = audio.slice(Math.floor(a * SR), Math.floor(b * SR));
    let testo: Pezzo[];
    try { testo = await trascrittore.trascrivi(pezzo, o.lingua, o.traduci && o.lingua === 'it'); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'fermato' || segnale?.aborted) throw e;
      throw new Error(spiegaErroreAI(msg));
    }
    for (const x of testo) pezzi.push({ da: x.da + a, a: x.a === null ? null : x.a + a, testo: x.testo });
  }
  fermo();
  stato('Fatto', 1);
  return righeDaPezzi(pezzi, p);
}
