// Il contenitore (bin): i file importati, aperti con Mediabunny (WebCodecs) e tenuti vivi finché servono.
// Dalla 1.5.8 l'import e la riapertura leggono i metadati (contenitore, tracce, durata, dimensioni, codec) e il file è
// subito usabile dall'originale. Dalla 1.6.0 locandina, colore automatico e forma d'onda ripartono da soli (sono
// leggeri e si leggono dalla memoria delle misure, cache.ts, se già fatti); la copia leggera e il controllo della
// velocità li prepara l'utente con proponiPreparazione() (pulsanti nel Centro attività).
// Le miniature della timeline restano «a richiesta»: si leggono solo i fotogrammi delle clip che si vedono.
import {
  ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input, StreamSource,
  type InputAudioTrack, type InputVideoTrack,
} from 'mediabunny';
import type { MediaItem, Project } from '../core/tipi';
import { autoColore, uid } from '../core/progetto';
import { invoke, isTauri, type FileScelto } from '../platform';
import { proponiProxy, proxyEsistente, modoProxy, type Proxy } from './proxy';
import { attivitaDaAvviare, avviaRiga, annullaChiave, daAvviare, giaInCorso, proponi, rigaAttivita, type Attivita, type Lavoro, type Proposto } from './attivita';
import { chiaveMedia, comprimiPicchi, espandiPicchi, leggiCache, scriviCache } from './cache';

export type StatoMedia = 'caricamento' | 'ok' | 'offline' | 'errore';

export interface MediaRT {
  id: string;
  file?: File;
  path?: string;
  /** dentro un pacchetto .daprod: il pezzo del file dove sta il media */
  off?: number;
  len?: number;
  input?: Input;
  v?: InputVideoTrack;
  a?: InputAudioTrack;
  image?: ImageBitmap;
  poster?: CanvasImageSource;
  /** picchi dell'audio: massimo assoluto per ogni centesimo di secondo */
  peaks?: Float32Array;
  peaksDone: number;
  stato: StatoMedia;
  errore?: string;
  vDecodable: boolean;
  aDecodable: boolean;
  /** misura del colore per il colore automatico (livelli, bianco, luce) */
  colore?: Analisi;
  /** la copia leggera per i monitor (src/media/proxy.ts) */
  proxy?: Proxy;
  /** manuale = proposta, aspetta Avvia · 'attesa' non si usa più (era: si farà quando entra in timeline) */
  proxyStato?: 'attesa' | 'manuale' | 'coda' | 'lavoro' | 'pronto' | 'no' | 'errore';
  proxyProg?: number;
  /** il controllo della velocità (frame rate/bitrate variabile): mai fatto = undefined */
  velocita?: 'ok' | 'da-convertire' | 'convertito' | 'errore';
  /** l'ultimo errore di ogni preparazione (per Riprova e per dirlo) */
  erroriPrep?: Partial<Record<Preparazione, string>>;
}

export interface Analisi {
  lo: [number, number, number];
  hi: [number, number, number];
  wb: [number, number, number];
  /** esponente per le mezzetinte: < 1 schiarisce le riprese buie */
  gamma: number;
}

const rt = new Map<string, MediaRT>();
export const mediaRT = (id: string) => rt.get(id);
export const PEAKS_PER_SEC = 100;

/** quante clip della timeline usano un file: chi sta in timeline passa avanti nelle code dei lavori di fondo */
let usoMedia: (id: string) => number = () => 0;
export const impostaUsoMedia = (fn: (id: string) => number) => { usoMedia = fn; };
/** quante clip della timeline usano questo file */
export const usoDiMedia = (id: string) => usoMedia(id);
const prioritaDi = (id: string) => () => { const n = usoMedia(id); return n > 0 ? 100 + Math.min(50, n) : 0; };
/** per chi mette in coda lavori su un file: chi sta in timeline passa avanti */
export const prioritaMedia = prioritaDi;

const IMMAGINI = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
let ac3Pronto: Promise<void> | null = null;

/** AC-3 (le videocamere AVCHD) non lo decodifica nessun browser: si carica il decoder WASM solo se serve */
async function assicuraAc3() {
  if (!ac3Pronto) ac3Pronto = import('@mediabunny/ac3').then((m) => { m.registerAc3Decoder(); });
  return ac3Pronto;
}

function sorgente(r: MediaRT) {
  if (r.file) return new BlobSource(r.file, { maxCacheSize: 32 * 1024 * 1024 });
  const path = r.path!;
  // dentro un pacchetto .daprod il media è un pezzo del file: si legge da lì, senza scompattare
  const off = r.off ?? 0;
  return new StreamSource({
    getSize: () => (r.len !== undefined ? Promise.resolve(r.len) : invoke<number>('media_dimensione', { path })),
    read: async (start: number, end: number) => {
      const buf = await invoke<ArrayBuffer>('media_leggi', { path, start: off + start, end: off + end });
      return new Uint8Array(buf);
    },
    maxCacheSize: 32 * 1024 * 1024,
    prefetchProfile: 'fileSystem',
  });
}

async function leggiTutto(r: MediaRT): Promise<Blob> {
  if (r.file) return r.file;
  const off = r.off ?? 0;
  const size = r.len ?? await invoke<number>('media_dimensione', { path: r.path! });
  const buf = await invoke<ArrayBuffer>('media_leggi', { path: r.path!, start: off, end: off + size });
  return new Blob([buf]);
}

/** apre (o riapre) il runtime di un media già descritto nel progetto */
export async function apri(item: MediaItem, sel: { file?: File; path?: string }): Promise<MediaRT> {
  const old = rt.get(item.id);
  if (old?.input) old.input.dispose();
  const r: MediaRT = { id: item.id, file: sel.file, path: sel.path, stato: 'caricamento', peaksDone: 0, vDecodable: false, aDecodable: false };
  if (sel.path && !sel.file && item.dentro) { r.off = item.dentro.off; r.len = item.dentro.len; }
  rt.set(item.id, r);
  try {
    if (item.type === 'image') {
      r.image = await createImageBitmap(await leggiTutto(r));
      r.poster = r.image;
      r.vDecodable = true;
      r.stato = 'ok';
      r.colore = analizza([r.image]);
      return r;
    }
    r.input = new Input({ source: sorgente(r), formats: ALL_FORMATS });
    r.v = (await r.input.getPrimaryVideoTrack()) ?? undefined;
    r.a = (await r.input.getPrimaryAudioTrack()) ?? undefined;
    if (r.a && /ac3|eac3/.test(String(r.a.codec ?? await r.a.getCodec()))) await assicuraAc3();
    r.vDecodable = r.v ? await r.v.canDecode() : false;
    r.aDecodable = r.a ? await r.a.canDecode() : false;
    r.stato = 'ok';
    // solo letture: quello che è già nella memoria delle misure o sul disco si usa, niente si produce
    await leggiPreparato(item, r);
  } catch (e) {
    r.stato = 'errore';
    r.errore = e instanceof Error ? e.message : String(e);
    r.input?.dispose();
    r.input = undefined;
  }
  return r;
}

/** la locandina dalla memoria delle misure, se c'è (una lettura: non si decodifica niente) */
async function locandinaSalvata(r: MediaRT, chiave: string): Promise<boolean> {
  const salvata = await leggiCache<Blob>('poster', chiave);
  if (!salvata) return false;
  try { r.poster = await createImageBitmap(salvata); return true; } catch { return false; /* rovinata: si rifà a mano */ }
}

/** la locandina vera: un fotogramma (solo quando l'utente la chiede) */
async function faiLocandina(item: MediaItem, r: MediaRT, v: InputVideoTrack, chiave: string, l: Lavoro) {
  const dur = item.duration || 1;
  const cs = new CanvasSink(v, { width: 320, fit: 'contain' });
  const w = await cs.getCanvas(Math.min(dur * 0.1, 2)).catch(() => null) ?? await cs.getCanvas(0).catch(() => null);
  if (!w || !l.valido || rt.get(r.id) !== r) return;
  r.poster = w.canvas;
  void aBlob(w.canvas).then((b) => { if (b) void scriviCache('poster', chiave, b); });
}

/** la locandina in JPEG, senza fermare l'interfaccia: la lettura dei pixel si fa fuori dal thread principale */
async function aBlob(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(c);
    const o = new OffscreenCanvas(bmp.width, bmp.height);
    o.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    return await o.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  } catch { return null; }
}

/** locandina, colore e forma d'onda ripartono da soli all'import (leggeri); le prove del motore minimo li spengono */
let preparazioneAutomatica = true;
export const impostaPreparazioneAutomatica = (on: boolean) => { preparazioneAutomatica = on; };

/**
 * All'import e alla riapertura: si usa SOLO quello che c'è già (memoria delle misure, copia leggera sul disco o tornata
 * da un .dap). Niente decodifica, niente code, niente righe nel Centro attività. Vale anche con le preferenze vecchie
 * («Copie leggere: sempre», dpv-normalizza): da sole non fanno più partire niente.
 */
async function leggiPreparato(item: MediaItem, r: MediaRT) {
  const chiave = chiaveMedia(item);
  if (r.v && r.vDecodable) await locandinaSalvata(r, chiave);
  void (async () => {
    if (r.v && r.vDecodable) {
      const salvato = await leggiCache<Analisi>('colore', chiave);
      if (salvato && rt.get(r.id) === r) { r.colore = salvato; for (const fn of onAnalisi) fn(); }
      if (modoProxy() !== 'mai' && rt.get(r.id) === r) await proxyEsistente(item, r).catch(() => false);
    }
    if (r.a && r.aDecodable) {
      const n = Math.max(1, Math.ceil(item.duration * PEAKS_PER_SEC));
      const salvati = await leggiCache<Uint8Array>('picchi', chiave);
      if (salvati && salvati.length === n && rt.get(r.id) === r) {
        r.peaks = espandiPicchi(salvati);
        r.peaksDone = n;
        for (const fn of onPicchi) fn(r.id);
      }
    }
    avvisaPrep(r.id);
    // le cose leggere (locandina, colore, forma d'onda) partono da sole, a turno nella corsia leggera: si vedono nel Centro attività.
    // La copia leggera e il controllo della velocità restano a richiesta (pulsanti nel Centro attività).
    if (preparazioneAutomatica && rt.get(r.id) === r) for (const cosa of ['locandina', 'colore', 'picchi'] as const) proponiPreparazione(item, cosa, { avvia: true });
  })();
}

// ——— le preparazioni manuali ———
/** quello che si può preparare per un file, a mano (tasto destro, Proprietà, «tutti i file del contenitore») */
export type Preparazione = 'locandina' | 'colore' | 'picchi' | 'proxy' | 'velocita';
export const PREPARAZIONI: readonly Preparazione[] = ['locandina', 'colore', 'picchi', 'proxy', 'velocita'];
/** fatta · non-fatta · da-avviare (riga pronta) · in-corso (in coda, al lavoro o in pausa) · non-serve · errore */
export type StatoPreparazione = 'fatta' | 'non-fatta' | 'da-avviare' | 'in-corso' | 'non-serve' | 'errore';
export const NOMI_PREPARAZIONE: Record<Preparazione, string> = {
  locandina: 'Locandina', colore: 'Colore automatico', picchi: 'Calcola forma d\'onda', proxy: 'Prepara copia leggera', velocita: 'Controlla velocità file',
};
export interface OpzioniPreparazione {
  /** parte subito (l'utente l'ha chiesta adesso, es. tasto destro su UN file); di partenza nasce «da avviare» */
  avvia?: boolean;
  /** solo per proxy: anche se il file non sembra pesante */
  forza?: boolean;
  /** solo per velocita: se il file va rifatto, la conversione parte subito invece di nascere «da avviare» */
  converti?: boolean;
}

/** chi trova la scheda di un media dal suo id (lo imposta progetti.ts, che conosce il progetto aperto) */
let cercaMedia: (id: string) => MediaItem | undefined = () => undefined;
export const impostaCercaMedia = (fn: (id: string) => MediaItem | undefined) => { cercaMedia = fn; };
/** il controllo della velocità sta in progetti.ts (sostituisce il file nel progetto): si registra qui */
type ControlloVelocita = (m: MediaItem, r: MediaRT, o: OpzioniPreparazione & { priorita: () => number }) => Proposto<unknown> | null;
let controlloVelocita: ControlloVelocita | null = null;
export const impostaControlloVelocita = (fn: ControlloVelocita | null) => { controlloVelocita = fn; };

const onPrep = new Set<(id: string) => void>();
/** chi mostra gli indicatori (copia leggera ✓, forma d'onda ✓…) si iscrive qui: lo stato delle preparazioni di un file è cambiato */
export const quandoPreparazioni = (fn: (id: string) => void) => { onPrep.add(fn); return () => onPrep.delete(fn); };
const avvisaPrep = (id: string) => { for (const f of onPrep) f(id); };
const chiavePrep = (cosa: Preparazione, id: string) => (cosa === 'proxy' ? 'proxy:' : cosa + ':') + id;

/**
 * Prepara un lavoro per un file: nasce «da avviare» (riga nel Centro attività, parte con Avvia) o, con avvia:true, parte
 * subito. null = non serve o non si può (già fatta, già in giro, file senza video/audio, Copie leggere = Mai…).
 * Mai chiamata dal programma da solo: solo da un gesto dell'utente.
 */
export function proponiPreparazione(m: MediaItem | string, cosa: Preparazione, o: OpzioniPreparazione = {}): Proposto<unknown> | null {
  const item = typeof m === 'string' ? cercaMedia(m) : m;
  if (!item) return null;
  const r = rt.get(item.id);
  if (!r || r.stato !== 'ok') return null;
  const stato = statoPreparazione(item.id, cosa);
  if (stato === 'fatta' || stato === 'non-serve' || stato === 'in-corso') return null;
  const chiave = chiavePrep(cosa, item.id);
  if (stato === 'da-avviare') {
    // già pronta: con avvia:true parte
    if (o.avvia) { const g = rigaPronta(chiave) ?? (cosa === 'velocita' ? rigaPronta('converti:' + item.id) : undefined); if (g) avviaRiga(g.id); }
    return null;
  }
  const priorita = prioritaDi(item.id);
  const fatto = () => avvisaPrep(item.id);
  const comune = { chiave, media: item.id, priorita, alAvvio: fatto, alAnnulla: fatto };
  let p: Proposto<unknown> | null = null;
  if (cosa === 'proxy') {
    p = proponiProxy(item, r, () => sorgente(r), { priorita, avvia: false, forza: o.forza });
  } else if (cosa === 'velocita') {
    p = controlloVelocita?.(item, r, { ...o, avvia: false, priorita }) ?? null;
  } else if (cosa === 'locandina') {
    p = proponi({ ...comune, corsia: 'leggero', titolo: 'Locandine', categoria: 'analisi', gruppo: 'locandine', dettaglio: item.name }, async (l) => {
      l.imposta(0, item.name);
      if (r.v) await faiLocandina(item, r, r.v, chiaveMedia(item), l);
      fatto();
      return !!r.poster;
    });
  } else if (cosa === 'colore') {
    p = proponi({ ...comune, corsia: 'leggero', titolo: 'Colore automatico', categoria: 'analisi', gruppo: 'colore', dettaglio: item.name, pausa: 'ai-confini' }, async (l) => {
      l.imposta(0, item.name);
      await misuraColore(r, item.duration || 1, chiaveMedia(item), l);
      fatto();
      return !!r.colore;
    });
  } else if (cosa === 'picchi') {
    p = proponi({ ...comune, corsia: 'leggero', titolo: 'Forme d\'onda', categoria: 'analisi', gruppo: 'picchi', dettaglio: item.name, pausa: 'ai-confini' }, async (l) => {
      l.imposta(0, item.name);
      await calcolaPicchi(r, item.duration, chiaveMedia(item), l);
      fatto();
      return r.peaksDone > 0 && !!r.peaks;
    });
  }
  if (!p) return null;
  if (r.erroriPrep?.[cosa]) delete r.erroriPrep[cosa];
  void p.esito.then(fatto);
  if (o.avvia) {
    const id = avviaRiga(p.riga.id);
    p = { ...p, riga: (id !== null && rigaAttivita(id)) || p.riga };
  }
  fatto();
  return p;
}

/** la stessa cosa per più file (i file scelti, o tutti quelli del contenitore): ritorna solo le righe create */
export function proponiPreparazioni(ids: readonly string[], cosa: Preparazione, o: OpzioniPreparazione = {}): Proposto<unknown>[] {
  const out: Proposto<unknown>[] = [];
  for (const id of ids) { const p = proponiPreparazione(id, cosa, o); if (p) out.push(p); }
  return out;
}

/**
 * Per una funzione che l'utente ha appena chiesto e che ha bisogno di una preparazione (es. «Livella il volume» o
 * «Sottotitoli dai dialoghi» vogliono la forma d'onda): la fa partire SUBITO per i file che non l'hanno (righe visibili
 * nel Centro attività, pausabili e annullabili) e aspetta. Ritorna i file che alla fine ce l'hanno.
 */
export async function preparaOra(ids: readonly string[], cosa: Preparazione): Promise<string[]> {
  const attese: Promise<unknown>[] = [];
  for (const id of ids) {
    const s = statoPreparazione(id, cosa);
    if (s === 'non-fatta' || s === 'errore') { const p = proponiPreparazione(id, cosa, { avvia: true }); if (p) attese.push(p.esito); }
    else if (s === 'da-avviare') proponiPreparazione(id, cosa, { avvia: true });
  }
  await Promise.all(attese);
  // quelle già in corso (o appena avviate da righe pronte): si aspetta che finiscano
  for (let i = 0; i < 6000 && ids.some((id) => ['in-corso', 'da-avviare'].includes(statoPreparazione(id, cosa))); i++) await new Promise((ok) => setTimeout(ok, 50));
  return ids.filter((id) => statoPreparazione(id, cosa) === 'fatta');
}

function rigaPronta(chiave: string): Attivita | undefined {
  return attivitaDaAvviare().find((r) => r.chiave === chiave);
}

/** lo stato di UNA preparazione di un file (solo letture, nessun lavoro) */
export function statoPreparazione(id: string, cosa: Preparazione): StatoPreparazione {
  const r = rt.get(id);
  const item = cercaMedia(id);
  if (!r || r.stato !== 'ok') return 'non-serve';
  const chiave = chiavePrep(cosa, id);
  if (daAvviare(chiave)) return 'da-avviare';
  if (giaInCorso(chiave)) return 'in-corso';
  const video = !!(r.v && r.vDecodable && !r.image);
  switch (cosa) {
    case 'locandina': return r.poster ? 'fatta' : !video ? 'non-serve' : r.erroriPrep?.locandina ? 'errore' : 'non-fatta';
    case 'colore': return r.colore ? 'fatta' : !video ? 'non-serve' : r.erroriPrep?.colore ? 'errore' : 'non-fatta';
    case 'picchi': return !(r.a && r.aDecodable) ? 'non-serve' : r.peaks && r.peaksDone >= r.peaks.length ? 'fatta' : r.erroriPrep?.picchi ? 'errore' : 'non-fatta';
    case 'proxy':
      if (r.proxy || r.proxyStato === 'pronto') return 'fatta';
      if (!video || modoProxy() === 'mai' || (item && (item.type !== 'video' || item.duration < 2))) return 'non-serve';
      if (r.proxyStato === 'no') return 'non-serve';
      if (r.proxyStato === 'errore') return 'errore';
      return 'non-fatta';
    case 'velocita':
      if (!item || item.type === 'image' || item.dentro || !controlloVelocita) return 'non-serve';
      if (r.velocita === 'ok' || r.velocita === 'convertito') return 'fatta';
      // controllato: va rifatto, e la conversione è pronta o in corso
      if (daAvviare('converti:' + id)) return 'da-avviare';
      if (giaInCorso('converti:' + id)) return 'in-corso';
      if (r.velocita === 'errore') return 'errore';
      return 'non-fatta';
  }
}

/** tutte le preparazioni di un file */
export function statoPreparazioni(id: string): Record<Preparazione, StatoPreparazione> {
  return Object.fromEntries(PREPARAZIONI.map((c) => [c, statoPreparazione(id, c)])) as Record<Preparazione, StatoPreparazione>;
}

/** i file per cui una preparazione si può ancora fare (per «… per tutti i file del contenitore») */
export function daPreparare(ids: readonly string[], cosa: Preparazione): string[] {
  return ids.filter((id) => statoPreparazione(id, cosa) === 'non-fatta');
}

/**
 * Le riprese che hanno il colore automatico acceso (clip o Finale) ma non ancora misurato: monitor ed export le mostrano
 * neutre (nessuna correzione), uguali fra loro. La UI può dirlo prima di esportare e offrire «Colore automatico».
 */
export function senzaColoreMisurato(p: Project): string[] {
  const ids = new Set<string>();
  for (const c of p.clips) {
    if (!c.media || !autoColore(p, c)) continue;
    const r = rt.get(c.media);
    if (r && r.stato === 'ok' && r.v && r.vDecodable && !r.image && !r.colore) ids.add(c.media);
  }
  return [...ids];
}

/** legge un file nuovo e crea la sua scheda per il contenitore */
/** soloDescrizione: legge com'è fatto il file e basta (niente locandina né lavori di fondo): serve a chi sostituisce un file con la sua copia convertita */
export async function importa(sel: FileScelto, opz: { soloDescrizione?: boolean } = {}): Promise<{ item: MediaItem; rt: MediaRT } | { errore: string; nome: string }> {
  const id = uid('m');
  const nome = sel.name;
  const base: MediaItem = {
    id, name: nome, type: 'video', duration: 0, t0: 0, width: 0, height: 0, fps: 0, rotation: 0,
    hasVideo: false, hasAudio: false, channels: 0, sampleRate: 0, vcodec: '', acodec: '', container: '',
    size: sel.file?.size ?? 0, lastModified: sel.file?.lastModified ?? 0, path: sel.path, markIn: null, markOut: null,
  };
  try {
    if (sel.path && isTauri) {
      base.size = await invoke<number>('media_dimensione', { path: sel.path });
    }
    if (IMMAGINI.test(nome) || sel.file?.type.startsWith('image/')) {
      base.type = 'image';
      base.container = nome.split('.').pop()?.toUpperCase() ?? 'IMG';
      const r = await apri(base, sel);
      if (r.stato !== 'ok' || !r.image) return { errore: r.errore ?? 'immagine non leggibile', nome };
      base.width = r.image.width;
      base.height = r.image.height;
      base.hasVideo = true;
      return { item: base, rt: r };
    }
    const r: MediaRT = { id, file: sel.file, path: sel.path, stato: 'caricamento', peaksDone: 0, vDecodable: false, aDecodable: false };
    rt.set(id, r);
    const input = new Input({ source: sorgente(r), formats: ALL_FORMATS });
    r.input = input;
    const fmt = await input.getFormat().catch(() => null);
    if (!fmt) {
      input.dispose();
      // niente video né audio: forse è una foto senza estensione (su Android i file arrivano come content://)
      try {
        const img = await createImageBitmap(await leggiTutto(r));
        img.close();
        rt.delete(id);
        return importa({ ...sel, name: /\.[a-z0-9]{2,4}$/i.test(nome) ? nome : nome + '.jpg' }, opz);
      } catch { /* non è nemmeno un'immagine */ }
      rt.delete(id);
      return { errore: 'formato non riconosciuto', nome };
    }
    base.container = fmt.name;
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    if (!v && !a) { rt.delete(id); input.dispose(); return { errore: 'nessuna traccia video o audio', nome }; }
    base.duration = await input.computeDuration();
    base.t0 = Math.max(0, await input.getFirstTimestamp().catch(() => 0));
    if (v) {
      base.hasVideo = true;
      base.width = await v.getDisplayWidth();
      base.height = await v.getDisplayHeight();
      base.rotation = await v.getRotation();
      base.vcodec = String((await v.getCodec()) ?? '?');
      const fr = await v.computeFrameRateMetrics({ targetPacketCount: 120 }).catch(() => null);
      base.fps = fr ? Math.round(fr.bestGuessFrameRate * 1000) / 1000 : 25;
      r.v = v;
      r.vDecodable = await v.canDecode();
    }
    if (a) {
      base.hasAudio = true;
      base.acodec = String((await a.getCodec()) ?? '?');
      base.channels = await a.getNumberOfChannels();
      base.sampleRate = await a.getSampleRate();
      r.a = a;
      if (/ac3|eac3/.test(base.acodec)) await assicuraAc3();
      r.aDecodable = await a.canDecode();
    }
    base.type = v ? 'video' : 'audio';
    if (v && !r.vDecodable && !(a && r.aDecodable)) {
      rt.delete(id);
      input.dispose();
      return { errore: `il video ${base.vcodec.toUpperCase()} non si decodifica su questo sistema`, nome };
    }
    r.stato = 'ok';
    if (opz.soloDescrizione) { input.dispose(); rt.delete(id); return { item: base, rt: r }; }
    // solo letture (memoria delle misure, copia leggera già sul disco): nessun lavoro parte da solo
    await leggiPreparato(base, r);
    return { item: base, rt: r };
  } catch (e) {
    rt.get(id)?.input?.dispose();
    rt.delete(id);
    return { errore: e instanceof Error ? e.message : String(e), nome };
  }
}

export function chiudi(id: string) {
  // i lavori di preparazione di questo file (da avviare, in coda o al lavoro) non servono più
  for (const c of PREPARAZIONI) annullaChiave(chiavePrep(c, id));
  annullaChiave('converti:' + id);
  const r = rt.get(id);
  r?.input?.dispose();
  r?.proxy?.input.dispose();
  if (r?.path && isTauri) void invoke('media_chiudi', { path: r.path }).catch(() => {});
  r?.image?.close();
  rt.delete(id);
}

// ——— colore automatico ———
const onAnalisi = new Set<() => void>();
/** chi disegna si iscrive qui: il colore automatico di una ripresa è pronto */
export const quandoAnalisi = (fn: () => void) => { onAnalisi.add(fn); return () => onAnalisi.delete(fn); };

/** livelli, bianco e luce misurati su qualche fotogramma in piccolo: bastano pochi millisecondi */
export function analizza(immagini: CanvasImageSource[]): Analisi {
  const W = 64, H = 36;
  const tela = new OffscreenCanvas(W, H);
  const ctx = tela.getContext('2d', { willReadFrequently: true })!;
  const ist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (const im of immagini) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(im, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < d.length; i += 4) { ist[0][d[i]]++; ist[1][d[i + 1]]++; ist[2][d[i + 2]]++; n++; }
  }
  const perc = (h: Uint32Array, q: number) => { let s = 0; const lim = q * n; for (let i = 0; i < 256; i++) { s += h[i]; if (s >= lim) return i / 255; } return 1; };
  const lo = [0, 1, 2].map((c) => Math.min(perc(ist[c], 0.004), 0.12)) as [number, number, number];
  const hi = [0, 1, 2].map((c) => Math.max(perc(ist[c], 0.996), 0.7)) as [number, number, number];
  // medie dopo i livelli: il grigio medio dice quanto è sbilanciato il bianco e quanto è buia la ripresa
  const media = [0, 1, 2].map((c) => {
    let s = 0;
    for (let i = 0; i < 256; i++) s += Math.max(0, Math.min(1, (i / 255 - lo[c]) / Math.max(0.05, hi[c] - lo[c]))) * ist[c][i];
    return s / Math.max(1, n);
  });
  const grigio = (media[0] + media[1] + media[2]) / 3;
  const wb = media.map((m) => 1 + (Math.max(0.86, Math.min(1.16, grigio / Math.max(0.02, m))) - 1) * 0.7) as [number, number, number];
  const luce = Math.max(0.02, Math.min(0.98, grigio));
  const gamma = Math.max(0.72, Math.min(1.25, Math.log(0.45) / Math.log(luce)));
  return { lo, hi, wb, gamma };
}

async function misuraColore(r: MediaRT, durata: number, chiave: string, l?: Lavoro) {
  if (!r.v) return;
  delete r.erroriPrep?.colore;
  const tele: CanvasImageSource[] = [];
  try {
    // prima il monitor: la misura aspetta che il decoder sia libero
    for (let attese = 0; decoderOccupato() && attese < 100; attese++) await new Promise((ok) => setTimeout(ok, 50));
    const cs = new CanvasSink(r.v, { width: 96, fit: 'contain' });
    const d = Math.max(0.1, durata);
    const ts = [0.08, 0.3, 0.5, 0.7, 0.92].map((k) => (r.v ? k * d : 0));
    // ogni fotogramma si rimpicciolisce con createImageBitmap (lavora fuori dal thread principale): leggere i pixel
    // direttamente dalla tela della scheda video farebbe aspettare l'interfaccia
    let i = 0;
    for await (const w of cs.canvasesAtTimestamps(ts)) {
      l?.imposta(++i / ts.length);
      // fra un fotogramma e l'altro si può fermare (pausa ai confini): quelli già letti restano
      await l?.checkpoint();
      if (!w) continue;
      try { tele.push(await createImageBitmap(w.canvas, { resizeWidth: 64, resizeHeight: 36, resizeQuality: 'low' })); } catch { tele.push(w.canvas); }
    }
    if (!tele.length) throw new Error('Non riesco a leggere i fotogrammi per misurare il colore');
    if (rt.get(r.id) === r && (!l || l.valido)) { r.colore = analizza(tele); void scriviCache('colore', chiave, r.colore); }
    for (const fn of onAnalisi) fn();
  } catch (e) {
    if ((!l || l.valido) && rt.get(r.id) === r) (r.erroriPrep ??= {}).colore = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    for (const t of tele) if (t instanceof ImageBitmap) t.close();
  }
}

// ——— forma d'onda ———
type Ascoltatore = (id: string) => void;
const onPicchi = new Set<Ascoltatore>();
export const quandoPicchi = (fn: Ascoltatore) => { onPicchi.add(fn); return () => onPicchi.delete(fn); };

/**
 * La forma d'onda, a fette brevi. Pausa ai confini: si ferma fra una fetta e l'altra e riprende dallo stesso punto
 * (i pezzi letti restano). Annullata o file chiuso: la forma d'onda a metà si butta (il file torna «non calcolata»).
 */
async function calcolaPicchi(r: MediaRT, durata: number, chiave: string, lavoro?: Lavoro) {
  if (!r.a) return;
  delete r.erroriPrep?.picchi;
  const n = Math.max(1, Math.ceil(durata * PEAKS_PER_SEC));
  const peaks = new Float32Array(n);
  r.peaks = peaks;
  r.peaksDone = 0;
  const sink = new AudioBufferSink(r.a);

  let ultimo = performance.now();
  let fetta = performance.now();
  const butta = () => {
    if (rt.get(r.id) === r && r.peaks === peaks) { r.peaks = undefined; r.peaksDone = 0; for (const fn of onPicchi) fn(r.id); }
  };
  try {
    for await (const { buffer, timestamp } of sink.buffers()) {
      const sr = buffer.sampleRate;
      const ch = buffer.numberOfChannels;
      const data: Float32Array[] = [];
      for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
      const per = sr / PEAKS_PER_SEC;
      const first = Math.floor(timestamp * PEAKS_PER_SEC);
      const len = buffer.length;
      for (let i = 0; i < len; i += 4) {
        let m = 0;
        for (let c = 0; c < ch; c++) { const x = Math.abs(data[c][i]); if (x > m) m = x; }
        const b = first + Math.floor(i / per);
        if (b >= 0 && b < n && m > peaks[b]) peaks[b] = m;
      }
      r.peaksDone = Math.min(n, first + Math.ceil(len / per));
      if (performance.now() - ultimo > 250) {
        ultimo = performance.now();
        lavoro?.imposta(r.peaksDone / n);
        for (const fn of onPicchi) fn(r.id);
      }
      // a fette brevi: la forma d'onda si calcola senza bloccare l'interfaccia (e lì si può mettere in pausa)
      if (performance.now() - fetta > 12) {
        await new Promise((ok) => setTimeout(ok, 0));
        await lavoro?.checkpoint();
        fetta = performance.now();
      }
      if (rt.get(r.id) !== r || (lavoro && !lavoro.valido)) { butta(); return; }
    }
  } catch (e) {
    butta();
    if ((!lavoro || lavoro.valido) && rt.get(r.id) === r) {
      (r.erroriPrep ??= {}).picchi = e instanceof Error ? e.message : String(e);
    }
    throw e;
  }
  if (lavoro && !lavoro.valido) { butta(); return; }
  r.peaksDone = n;
  void scriviCache('picchi', chiave, comprimiPicchi(peaks));
  for (const fn of onPicchi) fn(r.id);
}

// ——— miniature della timeline ———
const THUMB_W = 128;
const LIMITE_MINIATURE = 1800;
const cache = new Map<string, CanvasImageSource>();
const inCoda = new Map<string, Set<number>>();
const lavorando = new Set<string>();
const onMiniatura = new Set<() => void>();
export const quandoMiniature = (fn: () => void) => { onMiniatura.add(fn); return () => onMiniatura.delete(fn); };

/** miniatura al tempo t (già quantizzato da chi chiede): se non c'è la mette in coda e ritorna null */
export function miniatura(id: string, t: number): CanvasImageSource | null {
  const r = rt.get(id);
  if (!r) return null;
  if (r.image) return r.image;
  const k = id + '@' + t.toFixed(3);
  const c = cache.get(k);
  if (c) {
    cache.delete(k);
    cache.set(k, c); // LRU: torna in fondo
    return c;
  }
  if (!r.v || !r.vDecodable) return null;
  if (!inCoda.has(id)) inCoda.set(id, new Set());
  inCoda.get(id)!.add(t);
  if (!lavorando.has(id)) void lavoraMiniature(id);
  return null;
}

/** chi usa il decoder per i monitor dice qui se è occupato: le miniature aspettano il loro turno */
let decoderOccupato: () => boolean = () => false;
export function quandoDecoderOccupato(fn: () => boolean) { decoderOccupato = fn; }

async function lavoraMiniature(id: string) {
  const r = rt.get(id);
  if (!r?.v) return;
  lavorando.add(id);
  const sink = new CanvasSink(r.proxy?.v ?? r.v, { width: THUMB_W, fit: 'contain' });
  try {
    while (inCoda.get(id)?.size) {
      // prima il fotogramma del monitor e la riproduzione, poi le miniature
      for (let attese = 0; decoderOccupato() && attese < 100; attese++) await new Promise((ok) => setTimeout(ok, 40));
      const ts = [...inCoda.get(id)!].sort((a, b) => a - b).slice(0, 8);
      for (const t of ts) inCoda.get(id)!.delete(t);
      let i = 0;
      for await (const w of sink.canvasesAtTimestamps(ts)) {
        const t = ts[i++];
        if (w) cache.set(id + '@' + t.toFixed(3), w.canvas);
      }
      while (cache.size > LIMITE_MINIATURE) cache.delete(cache.keys().next().value!);
      for (const fn of onMiniatura) fn();
    }
  } catch { /* file sparito o decoder in errore */ }
  lavorando.delete(id);
}

export function svuotaMiniature(id?: string) {
  for (const k of [...cache.keys()]) if (!id || k.startsWith(id + '@')) cache.delete(k);
}
