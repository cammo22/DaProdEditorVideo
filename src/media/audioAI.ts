// L'audio con l'AI, dopo il montaggio: due lavori da fare sulle clip audio (e sull'audio delle riprese video).
//  · togliRumore: DeepFilterNet3 toglie il rumore di fondo da un parlato (src/core/rumore.ts, worker audioAI.worker.ts);
//  · separaVoceBase: Demucs divide una canzone in voce (il cantato) e base (la musica), a 44,1 kHz stereo (src/core/separa.ts),
//    con un ripiego senza AI, più rapido e meno preciso, se il modello non si scarica o non gira.
// Si lavora solo sulla parte usata della clip (più un secondo di margine per lato): un'ora di video non costa un'ora di lavoro.
// Il risultato è un file WAV nuovo (sul disco nell'app, in memoria nel browser), messo nel contenitore, cartella "Audio lavorato";
// la clip passa a lui con una sola modifica annullabile. Il lavoro sta nella corsia pesante del Centro attività (barra col tempo,
// si ferma con ✕, aspetta se il montaggio sta suonando) e gira in un Worker. Tutto sul computer di chi monta.
import { AudioBufferSink } from 'mediabunny';
import type { Clip, ForzaRumore, MediaItem, Project } from '../core/tipi';
import { newClip, newTrack, trackOf, uid } from '../core/progetto';
import { f2s } from '../core/timecode';
import { store } from '../core/store';
import { StatisticheMono } from '../core/separa';
import { NOMI_FORZA, PODCAST, mescolaDi, usaMossFormer } from '../core/rumore';
import { Ricampionatore } from '../core/ricampiona';
import { voceDaPodcast } from './clear';
import { invoke, isTauri, type FileScelto } from '../platform';
import { conservaFileNelBrowser } from '../progetti';
import { avviso } from '../ui/dom';
import { inCoda, type Lavoro } from './attivita';
import { spiegaErroreAI, testoErrore } from './erroriAI';
import { baseLocaleAI } from './libreriaAI';
import { messaggioScheda, schedaGuasta } from './hardware';
import { chiudi as chiudiMedia, importa, mediaRT, type MediaRT } from './libreria';
import { MODELLO_RUMORE, MODELLO_SEPARAZIONE, modelloInCache, ottieniModello, togliModello, type ModelloAudio } from './modelliAudio';
import type { DaPagina, DaWorker, InizioRumore, InizioSepara } from './audioAI.worker';

export type Forza = ForzaRumore;
export { MODELLO_SEPARAZIONE, MODELLO_RUMORE };

export interface Possibilita { rumore: boolean; separa: boolean; perche?: string }

/** il margine (secondi) che si lavora in più prima e dopo la parte usata: il filtro parte già "caldo" e la clip si può ancora allungare un poco */
const MARGINE = 1;
export const NOME_CARTELLA = 'Audio lavorato';

// ——— cosa si può fare su una clip ———

/** la clip audio su cui si lavora: la clip stessa se sta su una traccia audio, o l'audio legato a una ripresa video */
export function clipAudioDi(p: Project, c: Clip): Clip | null {
  if (c.kind !== 'media' || !c.media) return null;
  const t = trackOf(p, c.track);
  if (!t) return null;
  if (t.kind === 'audio') return c;
  if (t.kind === 'video' && c.link) return p.clips.find((x) => x.id !== c.id && x.link === c.link && x.kind === 'media' && !!x.media && trackOf(p, x.track)?.kind === 'audio') ?? null;
  return null;
}

/** le altre clip audio che sono la stessa ripresa (stesso legame, file, punto e durata): cambiano insieme */
function gemelle(p: Project, c: Clip): Clip[] {
  if (!c.link) return [];
  return p.clips.filter((x) => x.id !== c.id && x.link === c.link && x.kind === 'media' && x.media === c.media && x.srcIn === c.srcIn && x.len === c.len && x.speed === c.speed && trackOf(p, x.track)?.kind === 'audio');
}

/** la clip è cambiata (o sparita) mentre l'AI lavorava: non è un guasto del motore, il risultato semplicemente non si applica */
class ClipCambiata extends Error {}

const inCorso = new Map<string, 'rumore' | 'separa'>();
/** la maniglia del lavoro che sta girando (dice a che punto è): serve ai bottoni delle Proprietà per scrivere "in corso 42%" */
const maniglie = new Map<string, Lavoro>();
const ultimiErrori: { rumore: string; separa: string } = { rumore: '', separa: '' };

export function possibilita(c: Clip, p: Project = store.doc): Possibilita {
  const no = (perche: string): Possibilita => ({ rumore: false, separa: false, perche });
  if (c.kind !== 'media') return no('Questa non è una clip con audio (è un titolo, un colore, un tono…): scegli una clip audio o una ripresa con l\'audio');
  const a = clipAudioDi(p, c);
  if (!a) {
    const m = c.media ? p.media.find((x) => x.id === c.media) : undefined;
    if (m && m.type === 'image') return no('Un\'immagine non ha audio');
    return no(m && !m.hasAudio ? 'Questa ripresa non ha audio' : 'Questa ripresa non ha la sua clip audio in timeline (è stata tolta?): scegli la clip audio');
  }
  const m = p.media.find((x) => x.id === a.media);
  if (!m) return no('Il file di questa clip non c\'è più nel contenitore');
  if (!m.hasAudio) return no('Questo file non ha audio');
  const rt = mediaRT(m.id);
  if (!rt || rt.stato === 'caricamento') return no('Il file si sta ancora aprendo: riprova fra un attimo');
  if (rt.stato !== 'ok' || !rt.a || !rt.aDecodable) return no(rt.stato === 'offline' ? 'Il file è scollegato: ricollegalo per lavorare sul suo audio' : 'L\'audio di questo file non si riesce a leggere su questo sistema');
  if (trackOf(p, a.track)?.lock) return no('La traccia è bloccata: sbloccala per cambiare l\'audio');
  if (inCorso.has(a.id)) return no('Sto già lavorando su questa clip');
  return { rumore: true, separa: true };
}

/** la clip ha un originale a cui tornare? (dopo togliRumore) */
export function haOriginale(c: Clip): boolean {
  // vale anche per la ripresa video: conta la sua clip audio legata
  const pul = (clipAudioDi(store.doc, c) ?? c).afx?.pulito;
  return !!pul && store.doc.media.some((m) => m.id === pul.media);
}

/** rimette l'audio com'era prima di togliRumore (una modifica annullabile) */
export function tornaOriginale(clipId: string): void {
  const c0 = store.doc.clips.find((c) => c.id === clipId);
  if (!c0) return;
  const a = clipAudioDi(store.doc, c0) ?? c0;
  const pul = a.afx?.pulito;
  if (!pul) return;
  if (!store.doc.media.some((m) => m.id === pul.media)) {
    avviso('Il file originale non c\'è più nel contenitore: non posso tornare indietro', 'errore', 3600);
    return;
  }
  store.edit('Torna all\'audio originale', (p) => {
    for (const c of [a, ...gemelle(store.doc, a)]) {
      const x = p.clips.find((k) => k.id === c.id);
      const pu = x?.afx?.pulito;
      if (!x || !pu) continue;
      x.media = pu.media;
      x.srcIn = x.srcIn + pu.da;
      // il volume dato alla voce pulita se ne va con lei
      if (pu.piu) x.gain = Math.round((x.gain - pu.piu) * 10) / 10;
      delete x.afx!.pulito;
    }
  });
  avviso('🎙 Audio originale rimesso', 'ok', 2200);
}

// ——— leggere l'audio della clip ———

interface Tratto {
  m: MediaItem;
  rt: MediaRT;
  /** il tratto del file da lavorare, in secondi del file */
  da: number;
  a: number;
  sr: number;
  /** quanti canali si lavorano (1 o 2) */
  canali: 1 | 2;
  /** quanti campioni (alla frequenza del file) */
  n: number;
}

/** il tratto di file usato dalla clip (srcIn…) più il margine, dentro il file */
function tratto(p: Project, m: MediaItem, srcIn: number, c: Clip): Tratto | string {
  const rt = mediaRT(m.id);
  if (!rt?.a || !rt.aDecodable) return 'L\'audio di questo file non si riesce a leggere';
  const usato = f2s(c.len, p.rate) * (c.speed || 1);
  const da = Math.max(m.t0 || 0, srcIn - MARGINE);
  const a = Math.min(m.duration, srcIn + usato + MARGINE);
  const sr = m.sampleRate || 48000;
  const n = Math.round((a - da) * sr);
  if (n < sr * 0.05) return 'La parte di audio usata da questa clip è troppo corta';
  return { m, rt, da, a, sr, canali: m.channels >= 2 ? 2 : 1, n };
}

/** nel browser il file nuovo sta tutto in memoria (nell'app va sul disco): oltre questa grandezza si chiede di accorciare la clip */
function troppoGrosso(byte: number): string | null {
  return !isTauri && byte > 1.2e9 ? `Questo tratto è troppo lungo per il browser (${(byte / 1e9).toFixed(1).replace('.', ',')} GB di audio da tenere in memoria): accorcia la clip o usa l'app` : null;
}

/**
 * Legge l'audio del tratto e lo consegna a blocchi di `blocco` campioni (un array per canale), senza buchi e senza ripetizioni:
 * i pacchetti di un file non cadono sempre dove ti aspetti (il primo comincia un po' prima, a volte c'è un buco), quindi ogni
 * pezzo si mette al campione giusto secondo il suo tempo. Alla fine si completa con il silenzio fino a n campioni.
 */
async function leggiAudio(t: Tratto, blocco: number, fn: (ch: Float32Array[]) => Promise<void>, segnale?: AbortSignal): Promise<void> {
  const sink = new AudioBufferSink(t.rt.a!);
  const nc = t.canali;
  let scritti = 0;
  let acc = Array.from({ length: nc }, () => new Float32Array(blocco));
  let pieno = 0;
  const metti = async (da: (Float32Array | null)[], da0: number, n: number) => {
    let i = 0;
    while (i < n) {
      const k = Math.min(n - i, blocco - pieno);
      for (let c = 0; c < nc; c++) { const s = da[c]; if (s) acc[c].set(s.subarray(da0 + i, da0 + i + k), pieno); }
      pieno += k; i += k; scritti += k;
      if (pieno === blocco) { const pronto = acc; acc = Array.from({ length: nc }, () => new Float32Array(blocco)); pieno = 0; await fn(pronto); }
    }
  };
  for await (const { buffer, timestamp } of sink.buffers(t.da, t.a)) {
    if (segnale?.aborted) throw new Error('fermato');
    const s0 = Math.round((timestamp - t.da) * t.sr);
    let salta = 0;
    if (s0 < scritti) salta = scritti - s0;
    else if (s0 > scritti) await metti(new Array(nc).fill(null), 0, Math.min(s0, t.n) - scritti);
    const resto = Math.min(buffer.length - salta, t.n - scritti);
    if (resto <= 0) { if (scritti >= t.n) break; continue; }
    const ch: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) ch.push(buffer.getChannelData(c));
    // più di due canali (5.1…): sinistra e destra con il centro dentro
    const dati = nc === 1 ? [ch[0]] : buffer.numberOfChannels > 2 ? [mixa(ch[0], ch[2]), mixa(ch[1], ch[2])] : [ch[0], ch[1] ?? ch[0]];
    await metti(dati, salta, resto);
    if (scritti >= t.n) break;
  }
  if (scritti < t.n) await metti(new Array(nc).fill(null), 0, t.n - scritti);
  if (pieno > 0) await fn(acc.map((a) => a.slice(0, pieno)));
}
const mixa = (a: Float32Array, centro: Float32Array) => { const o = new Float32Array(a.length); for (let i = 0; i < o.length; i++) o[i] = a[i] + 0.7071 * (centro?.[i] ?? 0); return o; };

// ——— scrivere il WAV ———

const SOGLIA_SCRITTURA = 4 << 20;

/** un file WAV scritto a pezzi: sul disco nell'app (export_*), in memoria nel browser. Il titolo con le misure si scrive alla fine. */
class ScrittoreWav {
  private id = 0;
  private path = '';
  private pezzi: Uint8Array[] = [];
  private inAttesa = 0;
  private pos = 44;
  private chiuso = false;
  constructor(readonly nome: string, private sr: number, private canali: number, private formato: 'pcm16' | 'float32') {}

  async apri() {
    if (isTauri) {
      this.path = await invoke<string>('registrazione_percorso', { name: this.nome });
      this.id = await invoke<number>('export_apri', { path: this.path });
    }
  }

  private intestazione(): Uint8Array {
    const byte = this.formato === 'pcm16' ? 2 : 4;
    const dati = this.pos - 44;
    const b = new ArrayBuffer(44), v = new DataView(b);
    const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + dati, true); s(8, 'WAVE'); s(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, this.formato === 'pcm16' ? 1 : 3, true); v.setUint16(22, this.canali, true);
    v.setUint32(24, this.sr, true); v.setUint32(28, this.sr * this.canali * byte, true); v.setUint16(32, this.canali * byte, true); v.setUint16(34, byte * 8, true);
    s(36, 'data'); v.setUint32(40, dati, true);
    return new Uint8Array(b);
  }

  async scrivi(ch: Float32Array[]) {
    const n = ch[0].length, nc = this.canali;
    if (this.pos + n * nc * 4 > 0xfff00000) throw new Error('il file audio supera i 4 GB: accorcia la clip');
    let out: Uint8Array;
    if (this.formato === 'pcm16') {
      const a = new Int16Array(n * nc);
      for (let c = 0; c < nc; c++) { const x = ch[c] ?? ch[0]; for (let i = 0; i < n; i++) { const y = Math.max(-1, Math.min(1, x[i])); a[i * nc + c] = y < 0 ? y * 0x8000 : y * 0x7fff; } }
      out = new Uint8Array(a.buffer);
    } else {
      const a = new Float32Array(n * nc);
      for (let c = 0; c < nc; c++) { const x = ch[c] ?? ch[0]; for (let i = 0; i < n; i++) a[i * nc + c] = x[i]; }
      out = new Uint8Array(a.buffer);
    }
    this.pezzi.push(out);
    this.inAttesa += out.length;
    this.pos += out.length;
    if (isTauri && this.inAttesa >= SOGLIA_SCRITTURA) await this.svuota();
  }

  private async svuota() {
    if (!this.pezzi.length) return;
    const tot = new Uint8Array(this.inAttesa);
    let p = 0;
    for (const x of this.pezzi) { tot.set(x, p); p += x.length; }
    const posizione = this.pos - this.inAttesa;
    this.pezzi = []; this.inAttesa = 0;
    await invoke('export_scrivi', tot, { headers: { 'x-id': String(this.id), 'x-pos': String(posizione) } });
  }

  async chiudi(): Promise<FileScelto> {
    this.chiuso = true;
    const testa = this.intestazione();
    if (isTauri) {
      await this.svuota();
      await invoke('export_scrivi', testa, { headers: { 'x-id': String(this.id), 'x-pos': '0' } });
      await invoke('export_chiudi', { id: this.id });
      return { name: this.nome, path: this.path };
    }
    const file = new File([testa as BlobPart, ...(this.pezzi as BlobPart[])], this.nome, { type: 'audio/wav', lastModified: Date.now() });
    this.pezzi = [];
    return { name: this.nome, file };
  }

  /** lavoro fermato o fallito: il file a metà si svuota (nell'app il programma non ha un comando per cancellarlo) */
  async annulla() {
    if (this.chiuso) return;
    this.chiuso = true;
    this.pezzi = [];
    if (isTauri && this.id) {
      await invoke('export_chiudi', { id: this.id }).catch(() => {});
      const id = await invoke<number>('export_apri', { path: this.path }).catch(() => 0);
      if (id) await invoke('export_chiudi', { id }).catch(() => {});
    }
  }
}

// ——— il worker ———

/** il worker, con una risposta alla volta: manda() aspetta la risposta "finale" (pronto, ricevuto, finito) */
class Ponte {
  private w: Worker;
  private attesa: { ok: (m: DaWorker) => void; no: (e: Error) => void } | null = null;
  private morto: Error | null = null;
  constructor(private suMessaggio: (m: DaWorker) => void) {
    this.w = new Worker(new URL('./audioAI.worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (e: MessageEvent<DaWorker>) => {
      const m = e.data;
      if (m.tipo === 'errore') { this.chiudiConErrore(new Error(m.msg)); return; }
      if (m.tipo === 'pronto' || m.tipo === 'ricevuto' || m.tipo === 'finito') { const a = this.attesa; this.attesa = null; this.suMessaggio(m); a?.ok(m); return; }
      this.suMessaggio(m);
    };
    this.w.onerror = (e) => { this.chiudiConErrore(new Error(e.message || 'il motore dell\'audio AI si è fermato')); this.w.terminate(); };
    this.w.onmessageerror = () => this.chiudiConErrore(new Error('il motore dell\'audio AI ha mandato un messaggio che non si legge'));
  }
  private chiudiConErrore(e: Error) {
    this.morto ??= e;
    const a = this.attesa;
    this.attesa = null;
    a?.no(e);
  }
  manda(m: DaPagina, trasferisci: Transferable[] = []): Promise<DaWorker> {
    if (this.morto) return Promise.reject(this.morto);
    return new Promise((ok, no) => { this.attesa = { ok, no }; this.w.postMessage(m, trasferisci); });
  }
  ferma() { this.chiudiConErrore(new Error('fermato')); this.w.terminate(); }
}

/** per le prove: dove sta la libreria, il modello (indirizzo, dimensione minima), il modello finto, il ripiego */
const impostazioniProva: { base?: string; modello?: ModelloAudio; finta?: { attesaMs?: number } | null; ripiego?: 'auto' | 'solo' | 'mai'; modelloRumore?: ModelloAudio; fintaRumore?: { maschera?: number } | null } = {};
export const impostaProveAudioAI = (o: typeof impostazioniProva | null) => { for (const k of Object.keys(impostazioniProva)) delete (impostazioniProva as Record<string, unknown>)[k]; if (o) Object.assign(impostazioniProva, o); };

const nomeBase = (nome: string) => nome.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'audio';

// ——— il lavoro vero ———

/** mette il lavoro nella corsia pesante; ritorna il valore, o lancia l'errore (in italiano) o 'fermato' */
async function inLavoro<T>(titolo: string, fn: (l: Lavoro) => Promise<T>, chiave?: string): Promise<T> {
  let errore: unknown = null, fatto = false;
  const r = await inCoda({ corsia: 'pesante', titolo, categoria: 'ai', priorita: 1000 }, async (l) => {
    if (chiave) maniglie.set(chiave, l);
    try { const x = await fn(l); fatto = true; return x; } catch (e) { errore = e; throw e; } finally { if (chiave) maniglie.delete(chiave); }
  });
  if (errore) throw errore instanceof ClipCambiata || (errore instanceof Error && errore.message === 'fermato') ? errore : new Error(spiegaErroreAI(errore));
  if (!fatto) throw new Error('fermato');
  return r as T;
}

interface Sorgente { m: MediaItem; srcIn: number }

/**
 * Da dove si parte. Per togliere il rumore: l'originale, se la clip era già stata pulita (così si può cambiare la forza senza
 * pulire il pulito). Per separare voce e base: il file che la clip suona adesso (`corrente`).
 */
function sorgenteDi(p: Project, a: Clip, corrente = false): Sorgente | string {
  const pul = corrente ? undefined : a.afx?.pulito;
  const orig = pul ? p.media.find((m) => m.id === pul.media) : undefined;
  const m = orig ?? p.media.find((x) => x.id === a.media);
  if (!m) return 'Il file di questa clip non c\'è più nel contenitore';
  return { m, srcIn: orig && pul ? a.srcIn + pul.da : a.srcIn };
}

/** la cartella del contenitore per i file fatti dall'AI (si crea la prima volta) */
function cartellaAudioLavorato(p: Project): string {
  const c = (p.cartelle ??= []).find((x) => x.nome === NOME_CARTELLA && !x.genitore);
  if (c) return c.id;
  const id = uid('d');
  p.cartelle.push({ id, nome: NOME_CARTELLA });
  return id;
}

/** la clip è ancora quella di prima? Ritorna le clip da cambiare, o il motivo per cui non si può più */
function ancoraValida(a: Clip, t: Tratto, s: Sorgente, corrente = false): string | null {
  const p = store.doc;
  const x = p.clips.find((c) => c.id === a.id);
  if (!x) return 'La clip è stata tolta mentre lavoravo';
  const attuale = sorgenteDi(p, x, corrente);
  if (typeof attuale === 'string' || attuale.m.id !== s.m.id) return 'La clip è stata cambiata mentre lavoravo';
  const usato = f2s(x.len, p.rate) * (x.speed || 1);
  if (attuale.srcIn < t.da - 0.002 || attuale.srcIn + usato > t.a + 0.002) return 'La clip è stata allungata mentre lavoravo: l\'audio nuovo non la copre più';
  if (trackOf(p, x.track)?.lock) return 'La traccia è stata bloccata mentre lavoravo';
  return null;
}

/** toglie il rumore dall'audio della clip (la parte usata più un po' di margine): la clip passa a un file nuovo "pulito"; Ctrl+Z torna indietro */
export async function togliRumore(clipId: string, forza: Forza = 'pulita'): Promise<void> {
  const p0 = store.doc;
  const c0 = p0.clips.find((c) => c.id === clipId);
  if (!c0) throw new Error('Non trovo la clip');
  const poss = possibilita(c0, p0);
  if (!poss.rumore) throw new Error(poss.perche ?? 'Su questa clip non si può togliere il rumore');
  const a = clipAudioDi(p0, c0)!;
  const s0 = sorgenteDi(p0, a);
  if (typeof s0 === 'string') throw new Error(s0);
  const t = tratto(p0, s0.m, s0.srcIn, a);
  if (typeof t === 'string') throw new Error(t);
  const nome = `${nomeBase(s0.m.name)} - pulito.wav`;
  const grosso = troppoGrosso(Math.round((t.n * 48000) / t.sr) * t.canali * 2);
  if (grosso) throw new Error(grosso);
  inCorso.set(a.id, 'rumore');
  try {
    await inLavoro(`Tolgo il rumore · ${s0.m.name}`, async (l) => {
      l.imposta(0, 'Leggo l\'audio…');
      const scrittore = new ScrittoreWav(nome, 48000, t.canali, 'pcm16');
      let ponte: Ponte | null = null;
      let scrittura: Promise<void> = Promise.resolve();
      let errScrittura: unknown = null;
      const ferma = () => ponte?.ferma();
      l.segnale.addEventListener('abort', ferma);
      // l.imposta(null, …) azzererebbe la barra: il testo si cambia tenendo il punto a cui si è
      let k = 0;
      const dici = (x: number | null, testo?: string) => { if (x !== null) k = x; l.imposta(k, testo); };
      try {
        await scrittore.apri();
        const base = impostazioniProva.base ?? baseLocaleAI();
        if (PODCAST[forza]) {
          // Podcast: Clear rifà la voce di tutto il tratto in una volta (il volume si misura su tutto)
          const ric = Array.from({ length: t.canali }, () => new Ricampionatore(t.sr, 48000));
          const pezzi: Float32Array[][] = Array.from({ length: t.canali }, () => []);
          let letti = 0;
          await leggiAudio(t, Math.round(t.sr), async (ch) => {
            if (l.fermato) throw new Error('fermato');
            ch.forEach((x, i) => pezzi[i].push(ric[i].processa(x)));
            letti += ch[0].length;
            dici((letti / t.n) * 0.2, `Leggo l'audio: ${Math.round(letti / t.sr)} di ${Math.round(t.n / t.sr)} secondi`);
          }, l.segnale);
          ric.forEach((r, i) => pezzi[i].push(r.fine()));
          const ingresso = pezzi.map((lista) => { const n = lista.reduce((x, y) => x + y.length, 0); const o = new Float32Array(n); let q = 0; for (const y of lista) { o.set(y, q); q += y.length; } return o; });
          dici(0.25, 'Preparo Clear (la prima volta scarica il modello, ~49 MB)…');
          const uscita = await voceDaPodcast(ingresso, PODCAST[forza]!);
          if (l.fermato) throw new Error('fermato');
          dici(0.9, 'Scrivo la voce…');
          await scrittore.scrivi(t.canali === 1 ? [uscita[0]] : [uscita[0], uscita[1] ?? uscita[0]]);
        } else {
          // "voce isolata": servono la media e la deviazione del brano che vuole Demucs
          const isolata = forza === 'isolata';
          const stat = new StatisticheMono();
          if (isolata) {
            let letti = 0;
            await leggiAudio(t, Math.round(t.sr), async (ch) => { stat.aggiungi(ch[0], ch[1]); letti += ch[0].length; dici((letti / t.n) * 0.05, 'Ascolto la voce…'); }, l.segnale);
          }
          ponte = new Ponte((m) => {
            if (m.tipo === 'stato') dici(null, m.testo);
            else if (m.tipo === 'avviso') avviso(m.msg, 'info', 6000);
            else if (m.tipo === 'scheda-guasta') schedaGuasta();
            else if (m.tipo === 'uscita') scrittura = scrittura.then(() => scrittore.scrivi(m.ch)).catch((e) => { errScrittura ??= e; });
          });
          const hw = messaggioScheda();
          const inizio: InizioRumore = {
            tipo: 'inizia', lavoro: 'rumore', sr: t.sr, canali: t.canali, mescola: mescolaDi(forza), base,
            motore: usaMossFormer(forza) ? 'mossformer' : 'deepfilter', modello: impostazioniProva.modelloRumore ?? MODELLO_RUMORE, finta: impostazioniProva.fintaRumore ?? null,
            isola: isolata ? {
              sr: t.sr, canali: t.canali, totale: t.n, media: stat.media, dev: stat.dev, base, scheda: hw.scheda, hw,
              modello: impostazioniProva.modello ?? MODELLO_SEPARAZIONE, finta: impostazioniProva.finta ?? null,
            } : null,
          };
          await ponte.manda(inizio);
          let inviati = 0;
          const k0 = isolata ? 0.05 : 0;
          const cosa = isolata ? 'Isolo e pulisco la voce' : 'Tolgo il rumore';
          await leggiAudio(t, Math.round(t.sr), async (ch) => {
            if (l.fermato) throw new Error('fermato');
            inviati += ch[0].length;
            await ponte!.manda({ tipo: 'dati', ch }, ch.map((x) => x.buffer));
            dici(k0 + (inviati / t.n) * (0.95 - k0), `${cosa}: ${Math.round(inviati / t.sr)} di ${Math.round(t.n / t.sr)} secondi`);
          }, l.segnale);
          await ponte.manda({ tipo: 'fine' });
          await scrittura;
          if (errScrittura) throw errScrittura;
        }
        l.imposta(0.96, 'Metto l\'audio pulito nel progetto…');
        const file = await scrittore.chiudi();
        const r = await importa(file);
        if ('errore' in r) throw new Error(r.errore);
        if (file.file) conservaFileNelBrowser(r.item.id, file.file);
        const perche = ancoraValida(a, t, s0);
        if (perche) { chiudiMedia(r.item.id); throw new ClipCambiata(perche + ': non l\'ho applicato'); }
        const nuovo = r.item;
        store.edit('Togli rumore (AI)', (p) => {
          nuovo.cartella = cartellaAudioLavorato(p);
          p.media.push(nuovo);
          const x = p.clips.find((c) => c.id === a.id)!;
          for (const c of [x, ...gemelle(p, x)]) {
            const prima = sorgenteDi(p, c);
            if (typeof prima === 'string') continue;
            // (la 1.5.3 metteva un volume in più nella clip: si toglie ripulendo)
            const vecchio = c.afx?.pulito?.piu ?? 0;
            c.afx = { ...c.afx, pulito: { media: prima.m.id, srcIn: prima.srcIn, forza, da: t.da } };
            if (vecchio) c.gain = Math.round((c.gain - vecchio) * 10) / 10;
            c.srcIn = prima.srcIn - t.da;
            c.media = nuovo.id;
          }
        });
        store.select([a.id]);
        l.imposta(1, 'Fatto');
        avviso(`🎙 ${NOMI_FORZA[forza] ?? 'Rumore tolto'}: ${s0.m.name}. Ctrl+Z per tornare com'era`, 'ok', 3600);
      } catch (e) {
        await scrittore.annulla();
        throw e;
      } finally {
        l.segnale.removeEventListener('abort', ferma);
        ponte?.ferma();
      }
    }, a.id);
    ultimiErrori.rumore = '';
  } catch (e) {
    if (!(e instanceof ClipCambiata) && testoErrore(e) !== 'fermato') ultimiErrori.rumore = testoErrore(e);
    throw e;
  } finally {
    inCorso.delete(a.id);
  }
}

export interface OpzioniSepara {
  /** quali tracce tenere: entrambe (default), solo la voce o solo la base (l'originale si silenzia lo stesso) */
  tieni?: 'entrambe' | 'voce' | 'base';
  /** usa subito la separazione rapida (senza AI, meno precisa) senza scaricare il modello */
  rapido?: boolean;
}

/**
 * Separa voce e base di una canzone: crea due clip audio sulle tracce nuove "Voce · nome" e "Base · nome", nello stesso punto e
 * della stessa durata. L'originale resta ma va in silenzio. Con il modello Demucs (si scarica la prima volta, ~172 MB); se non si
 * scarica o non gira, la separazione rapida dal centro dello stereo (lo dice, ed è meno precisa).
 */
export async function separaVoceBase(clipId: string, opz: OpzioniSepara = {}): Promise<void> {
  const tieni = opz.tieni ?? 'entrambe';
  const p0 = store.doc;
  const c0 = p0.clips.find((c) => c.id === clipId);
  if (!c0) throw new Error('Non trovo la clip');
  const poss = possibilita(c0, p0);
  if (!poss.separa) throw new Error(poss.perche ?? 'Su questa clip non si può separare voce e base');
  const a = clipAudioDi(p0, c0)!;
  const s0 = sorgenteDi(p0, a, true);
  if (typeof s0 === 'string') throw new Error(s0);
  const t = tratto(p0, s0.m, s0.srcIn, a);
  if (typeof t === 'string') throw new Error(t);
  const base = nomeBase(s0.m.name);
  const emetti: ('voce' | 'base')[] = tieni === 'entrambe' ? ['voce', 'base'] : [tieni];
  const grosso = troppoGrosso(t.n * t.canali * 4 * emetti.length);
  if (grosso) throw new Error(grosso);
  inCorso.set(a.id, 'separa');
  try {
    await inLavoro(`Separo voce e base · ${s0.m.name}`, async (l) => {
      const scrittori = new Map<'voce' | 'base', ScrittoreWav>();
      for (const n of emetti) scrittori.set(n, new ScrittoreWav(`${base} - ${n}.wav`, t.sr, t.canali, 'float32'));
      let ponte: Ponte | null = null;
      let scrittura: Promise<void> = Promise.resolve();
      let errScrittura: unknown = null;
      // (il tipo si dice a parte: lo cambia il messaggio "pronto" del worker, e senza questo TypeScript lo crede sempre 'demucs')
      let motore = 'demucs' as 'demucs' | 'rapido';
      const ferma = () => ponte?.ferma();
      l.segnale.addEventListener('abort', ferma);
      let k = 0;
      const dici = (x: number | null, testo?: string) => { if (x !== null) k = x; l.imposta(k, testo); };
      try {
        // la prima passata: media e deviazione standard del brano (Demucs vuole l'ingresso normalizzato)
        l.imposta(0, 'Misuro il volume del brano…');
        const stat = new StatisticheMono();
        let letti = 0;
        await leggiAudio(t, Math.round(t.sr), async (ch) => {
          stat.aggiungi(ch[0], ch[1]);
          letti += ch[0].length;
          l.imposta((letti / t.n) * 0.05);
        }, l.segnale);
        for (const w of scrittori.values()) await w.apri();
        ponte = new Ponte((m) => {
          if (m.tipo === 'stato') dici(m.k !== undefined && /Scarico/.test(m.testo) ? 0.05 + 0.05 * m.k : null, m.testo);
          else if (m.tipo === 'avviso') avviso(m.msg, 'info', 6000);
          else if (m.tipo === 'scheda-guasta') schedaGuasta();
          else if (m.tipo === 'pronto') motore = m.motore === 'rapido' ? 'rapido' : 'demucs';
          else if (m.tipo === 'uscita' && m.nome !== 'pulito') {
            const w = scrittori.get(m.nome);
            if (w) scrittura = scrittura.then(() => w.scrivi(m.ch)).catch((e) => { errScrittura ??= e; });
          }
        });
        const hw = messaggioScheda();
        const inizio: InizioSepara = {
          tipo: 'inizia', lavoro: 'separa', sr: t.sr, canali: t.canali, totale: t.n, media: stat.media, dev: stat.dev,
          base: impostazioniProva.base ?? baseLocaleAI(), scheda: hw.scheda, hw, modello: impostazioniProva.modello ?? MODELLO_SEPARAZIONE,
          ripiego: opz.rapido ? 'solo' : impostazioniProva.ripiego ?? 'auto', emetti, finta: impostazioniProva.finta ?? null,
        };
        await ponte.manda(inizio);
        l.imposta(0.1, motore === 'rapido' ? 'Separo (rapido, senza AI)…' : 'Separo voce e base…');
        let inviati = 0;
        await leggiAudio(t, Math.round(t.sr), async (ch) => {
          if (l.fermato) throw new Error('fermato');
          inviati += ch[0].length;
          await ponte!.manda({ tipo: 'dati', ch }, ch.map((x) => x.buffer));
          dici(0.1 + (inviati / t.n) * 0.85, `${motore === 'rapido' ? 'Separo (rapido)' : 'Separo voce e base'}: ${Math.round(inviati / t.sr)} di ${Math.round(t.n / t.sr)} secondi`);
        }, l.segnale);
        await ponte.manda({ tipo: 'fine' });
        await scrittura;
        if (errScrittura) throw errScrittura;
        l.imposta(0.96, 'Metto le due tracce nel progetto…');
        const file = new Map<'voce' | 'base', FileScelto>();
        for (const [n, w] of scrittori) file.set(n, await w.chiudi());
        const item = new Map<'voce' | 'base', MediaItem>();
        for (const [n, f] of file) {
          const r = await importa(f);
          if ('errore' in r) throw new Error(r.errore);
          if (f.file) conservaFileNelBrowser(r.item.id, f.file);
          item.set(n, r.item);
        }
        const scarta = () => { for (const m of item.values()) chiudiMedia(m.id); };
        const perche = ancoraValida(a, t, s0, true);
        if (perche) { scarta(); throw new ClipCambiata(perche + ': non l\'ho applicato'); }
        const nuove = store.edit('Separa voce e base (AI)', (p) => {
          const x = p.clips.find((c) => c.id === a.id)!;
          const cartella = cartellaAudioLavorato(p);
          const ids: string[] = [];
          const nuoveClip: Clip[] = [];
          for (const [n, m] of item) {
            m.cartella = cartella;
            p.media.push(m);
            const tr = newTrack('audio', `${n === 'voce' ? 'Voce' : 'Base'} · ${s0.m.name.replace(/\.[^.]+$/, '').slice(0, 28)}`);
            p.tracks.push(tr);
            const c = newClip('media', tr.id, x.start, x.len, {
              media: m.id, name: `${n === 'voce' ? 'Voce' : 'Base'}: ${x.name}`, srcIn: s0.srcIn - t.da, speed: x.speed, nastro: x.nastro, label: x.label,
              gain: x.gain, gainKeys: structuredClone(x.gainKeys), pan: x.pan, fadeIn: x.fadeIn, fadeOut: x.fadeOut, curvaIn: x.curvaIn, curvaOut: x.curvaOut,
              afx: { separata: { ruolo: n, con: [x.id] } },
            });
            p.clips.push(c);
            nuoveClip.push(c);
            ids.push(c.id);
          }
          // l'originale resta ma va in silenzio (si può riaccendere dal volume)
          for (const c of [x, ...gemelle(p, x)]) {
            c.afx = { ...c.afx, separata: { ruolo: 'originale', con: ids, gain: c.gain } };
            c.gain = -60;
            c.gainKeys = [];
          }
          for (const c of nuoveClip) c.afx!.separata!.con = [x.id, ...ids.filter((i) => i !== c.id)];
          return ids;
        });
        store.select(nuove);
        l.imposta(1, 'Fatto');
        avviso(motore === 'rapido'
          ? `🎤 Voce e base separate (rapido, senza AI: meno precisa del modello): ${s0.m.name}. L'originale è in silenzio`
          : `🎤 Voce e base separate: ${s0.m.name}. L'originale è in silenzio (Ctrl+Z annulla tutto)`, 'ok', 4800);
      } catch (e) {
        for (const w of scrittori.values()) await w.annulla();
        throw e;
      } finally {
        l.segnale.removeEventListener('abort', ferma);
        ponte?.ferma();
      }
    }, a.id);
    ultimiErrori.separa = '';
  } catch (e) {
    if (!(e instanceof ClipCambiata) && testoErrore(e) !== 'fermato') ultimiErrori.separa = testoErrore(e);
    throw e;
  } finally {
    inCorso.delete(a.id);
  }
}

// ——— lo stato dei motori (Centro AI e Proprietà) ———

export interface StatoMotoreAudio { stato: 'pronto' | 'da-scaricare' | 'in-uso' | 'errore'; peso: string }

const mb = (b: number) => `${Math.max(1, Math.round(b / 1048576))} MB`;

export async function statoAudioAI(): Promise<{ rumore: StatoMotoreAudio; separa: StatoMotoreAudio & { ripiego: boolean } }> {
  const usati = [...inCorso.values()];
  const nelRumore = await modelloInCache(impostazioniProva.modelloRumore ?? MODELLO_RUMORE);
  const rumore: StatoMotoreAudio = {
    stato: usati.includes('rumore') ? 'in-uso' : ultimiErrori.rumore ? 'errore' : nelRumore ? 'pronto' : 'da-scaricare',
    peso: nelRumore ? mb(nelRumore) : `${mb(MODELLO_RUMORE.peso)}, una volta sola`,
  };
  const nel = await modelloInCache(impostazioniProva.modello ?? MODELLO_SEPARAZIONE);
  const stato = usati.includes('separa') ? 'in-uso' : nel ? (ultimiErrori.separa ? 'errore' : 'pronto') : ultimiErrori.separa ? 'errore' : 'da-scaricare';
  const separa = {
    stato: stato as StatoMotoreAudio['stato'],
    peso: nel ? mb(nel) : `${mb(MODELLO_SEPARAZIONE.peso)}, una volta sola`,
    // senza il modello (e senza rete, o dopo un errore) si userebbe la separazione rapida
    ripiego: !nel && (stato === 'errore' || (typeof navigator !== 'undefined' && navigator.onLine === false)),
  };
  return { rumore, separa };
}

/** scarica il modello della separazione (Centro AI → Scarica): barra nel Centro attività, dalla cache se c'è già */
export async function installaSeparazione(avanza?: (caricati: number, totali: number) => void): Promise<void> {
  const m = impostazioniProva.modello ?? MODELLO_SEPARAZIONE;
  await inLavoro('Scarico il modello per separare voce e base', async (l) => {
    l.imposta(0, `${m.nome}: ${mb(m.peso)}, una volta sola`);
    await ottieniModello(m, {
      segnale: l.segnale,
      avanza: (a, t) => { l.imposta(t ? a / t : null, `${m.nome}: ${(a / 1048576).toFixed(0)} di ${((t || m.peso) / 1048576).toFixed(0)} MB`); avanza?.(a, t); },
    });
  });
  ultimiErrori.separa = '';
}

/** scarica il modello del filtro del rumore (MossFormer2, ~94 MB, una volta sola) */
export async function installaRumore(avanza?: (caricati: number, totali: number) => void): Promise<void> {
  const m = impostazioniProva.modelloRumore ?? MODELLO_RUMORE;
  await inLavoro('Scarico il modello per togliere i rumori', async (l) => {
    l.imposta(0, `${m.nome}: ${mb(m.peso)}, una volta sola`);
    await ottieniModello(m, {
      segnale: l.segnale,
      avanza: (a, t) => { l.imposta(t ? a / t : null, `${m.nome}: ${(a / 1048576).toFixed(0)} di ${((t || m.peso) / 1048576).toFixed(0)} MB`); avanza?.(a, t); },
    });
  });
  ultimiErrori.rumore = '';
}
export const togliModelloRumore = () => togliModello(impostazioniProva.modelloRumore ?? MODELLO_RUMORE);

/** toglie il modello dal computer (si riscarica quando serve) */
export const togliSeparazione = () => togliModello(impostazioniProva.modello ?? MODELLO_SEPARAZIONE);

/** quante lavorazioni sono in corso (clip → quale) */
export const lavoriAudioAI = () => new Map(inCorso);

export interface AvanzamentoAudioAI { tipo: 'rumore' | 'separa'; k: number | null; testo: string; inCoda: boolean }
/** a che punto sono le lavorazioni (clip → avanzamento): per i bottoni delle Proprietà */
export function avanzamentoAudioAI(): Map<string, AvanzamentoAudioAI> {
  const out = new Map<string, AvanzamentoAudioAI>();
  for (const [id, tipo] of inCorso) {
    const l = maniglie.get(id);
    out.set(id, { tipo, k: l?.k ?? null, testo: l?.riga.dettaglio ?? '', inCoda: !l });
  }
  return out;
}
