// File "a velocità variabile" → a velocità costante.
//  · video con frame rate variabile (VFR: i telefoni e le registrazioni dello schermo): in montaggio fanno slittare
//    audio e video e saltare i tagli; si rifanno a frame rate costante (CFR);
//  · audio con bitrate variabile (VBR: MP3, Opus, Vorbis): la durata e i punti dove si salta non sono precisi, e la
//    forma d'onda si sposta; si rifanno a bitrate costante (CBR).
// Dalla 1.5.8 il controllo e la conversione si fanno SOLO a mano («Controlla velocità file»), mai all'import.
// Si converte solo se serve davvero; l'originale non si tocca (la copia convertita va nella cartella Video/DaProd Video
// nell'app, in memoria nel browser).
import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion, EncodedPacketSink, Input, Mp4OutputFormat, Output, Quality, StreamSource,
  StreamTarget, WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, type StreamTargetChunk,
} from 'mediabunny';
import { invoke, isTauri, type FileScelto } from '../platform';

export interface Verdetto {
  /** video a frame rate variabile */
  vfr: boolean;
  /** il frame rate costante da usare (quello più frequente) */
  fps: number;
  /** audio (senza video) a bitrate variabile */
  vbr: boolean;
  /** in parole, per dirlo a chi importa */
  motivo: string;
}

/**
 * La preferenza di prima («dpv-normalizza» = 'no' per non convertire). Dalla 1.5.8 il controllo e la conversione non
 * partono MAI da soli (nemmeno con 'si'): si fanno con «Controlla velocità file». Il valore si legge e non si cancella;
 * con 'no' il controllo manuale dice solo cosa farebbe, la conversione nasce «da avviare» anche quando la si chiede subito.
 */
export const normalizzaAttivo = () => { try { return localStorage.getItem('dpv-normalizza') !== 'no'; } catch { return true; } };

const FPS_COMUNI = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
/** il frame rate comune più vicino (entro il 2%), se no due decimali */
export function fpsPulito(x: number): number {
  const v = FPS_COMUNI.find((c) => Math.abs(c - x) / c < 0.02);
  return v ?? Math.round(x * 100) / 100;
}

/** quanto varia la grandezza dei pacchetti: 0 = tutti uguali (bitrate costante) */
export function variazione(grandezze: number[]): { cv: number; rapporto: number } {
  if (grandezze.length < 8) return { cv: 0, rapporto: 1 };
  const m = grandezze.reduce((a, b) => a + b, 0) / grandezze.length;
  const sd = Math.sqrt(grandezze.reduce((a, b) => a + (b - m) ** 2, 0) / grandezze.length);
  const min = Math.min(...grandezze), max = Math.max(...grandezze);
  return { cv: m ? sd / m : 0, rapporto: min > 0 ? max / min : 99 };
}

function sorgenteDi(sel: FileScelto) {
  if (sel.file) return new BlobSource(sel.file, { maxCacheSize: 32 * 1024 * 1024 });
  const path = sel.path!;
  return new StreamSource({
    getSize: () => invoke<number>('media_dimensione', { path }),
    read: async (start: number, end: number) => new Uint8Array(await invoke<ArrayBuffer>('media_leggi', { path, start, end })),
    maxCacheSize: 32 * 1024 * 1024,
    prefetchProfile: 'fileSystem',
  });
}

/**
 * guarda il file (pochi pacchetti) e dice se va rifatto a velocità costante; null se va bene com'è.
 * Si converte SOLO quando serve davvero (dalla 1.5.3):
 *  · video: solo se i fotogrammi non stanno su una griglia regolare (`underlyingFrameRate` = null). Un video a 30 fps
 *    con qualche fotogramma perso sta ancora sulla sua griglia: il montaggio lo legge giusto, non si rifà;
 *  · audio: solo l'MP3 a bitrate variabile (lì i tempi e i salti sono imprecisi). L'MP3 a bitrate costante, l'AAC, il WAV,
 *    il FLAC e anche Opus/Vorbis (variabili di natura ma con i tempi scritti in ogni pacchetto) restano com'erano.
 */
export async function esamina(sel: FileScelto): Promise<Verdetto | null> {
  if (!sel.file && !(sel.path && isTauri)) return null;
  const input = new Input({ source: sorgenteDi(sel), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    if (v) {
      const m = await v.computeFrameRateMetrics({ targetPacketCount: 400 }).catch(() => null);
      if (m && vfrVero(m)) return { vfr: true, fps: fpsDestinazione(m.medianFrameRate || m.averageFrameRate), vbr: false, motivo: 'frame rate variabile → costante' };
      return null;
    }
    if (a) {
      const codec = String((await a.getCodec()) ?? '');
      if (codec !== 'mp3') return null;
      const sink = new EncodedPacketSink(a);
      const grandezze: number[] = [];
      for await (const p of sink.packets(undefined, undefined, { metadataOnly: true })) {
        grandezze.push(p.byteLength);
        if (grandezze.length >= 400) break;
      }
      // l'MP3 a bitrate costante cambia di un byte (il "padding"): cv sotto 0,01
      if (mp3Variabile(grandezze)) return { vfr: false, fps: 0, vbr: true, motivo: 'bitrate variabile → costante' };
    }
    return null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** il frame rate costante per un video variabile: quello comune subito sopra il più frequente (non si perde movimento) */
export function fpsDestinazione(mediano: number): number {
  return FPS_COMUNI.find((c) => c >= mediano * 0.98) ?? fpsPulito(mediano);
}

/** un video è "a velocità variabile" sul serio: abbastanza pacchetti, nessuna griglia sotto, distanze molto diverse */
export function vfrVero(m: { underlyingFrameRate: number | null; frameRateIsConstant: boolean; probedPacketCount: number; maxFrameRate: number; minFrameRate: number; averageFrameRate?: number }): boolean {
  if (m.frameRateIsConstant || m.underlyingFrameRate !== null || m.probedPacketCount < 30) return false;
  // quasi costante: la media sta su un frame rate comune, i tempi ballano solo per l'arrotondamento al millisecondo del WebM
  // (32/33/34 ms a 30 fps) e al massimo si perde un fotogramma di fila. È il caso delle webcam e delle registrazioni: va bene così
  const comune = m.averageFrameRate ? FPS_COMUNI.find((c) => Math.abs(c - m.averageFrameRate!) / c < 0.03) : undefined;
  if (comune && m.maxFrameRate <= comune * 1.15 && m.minFrameRate >= comune / 2.05) return false;
  return m.maxFrameRate / Math.max(1e-6, m.minFrameRate) > 1.25;
}

/** un MP3 è a bitrate variabile: i pacchetti cambiano di grandezza ben oltre il byte del padding */
export function mp3Variabile(grandezze: number[]): boolean {
  const { cv, rapporto } = variazione(grandezze);
  return cv > 0.08 && rapporto > 1.25;
}

/** una scrittura che accetta pezzi in qualunque posizione: su disco nell'app, in memoria nel browser */
async function destinazione(nome: string): Promise<{ target: BufferTarget | StreamTarget; fine: () => Promise<{ path?: string; blob?: Blob }>; annulla: () => Promise<void> }> {
  if (isTauri) {
    const [id, path] = await invoke<[number, string]>('conversione_apri', { name: nome });
    const ws = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => { await invoke('export_scrivi', chunk.data, { headers: { 'x-id': String(id), 'x-pos': String(chunk.position) } }); },
    });
    return {
      target: new StreamTarget(ws, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      fine: async () => { await invoke('export_chiudi', { id }); return { path }; },
      annulla: async () => { await invoke('conversione_annulla', { id }); },
    };
  }
  const t = new BufferTarget();
  return { target: t, fine: async () => ({ blob: new Blob([t.buffer!]) }), annulla: async () => {} };
}

let aacPronto: Promise<void> | null = null;
/** il codificatore AAC (nel browser di tutti i sistemi non c'è sempre): arriva solo quando serve */
const assicuraAac = () => aacPronto ??= import('@mediabunny/aac-encoder').then((m) => { m.registerAacEncoder(); }).catch(() => {});

/** chi lavora nel centro attività, per la pausa vera della conversione (Lavoro di attivita.ts) */
export interface PausaConversione { checkpoint(): Promise<void>; allaPausa(fn: () => void): () => void }

/** rifà il file a velocità costante; ritorna il file nuovo (stesso nome, estensione del nuovo contenitore).
 *  Con `pausa` la conversione si sospende davvero (pauseSignal di Mediabunny) e riparte dallo stesso punto. */
export async function converti(sel: FileScelto, v: Verdetto, avanza: (k: number) => void, segnale?: AbortSignal, pausa?: PausaConversione): Promise<FileScelto> {
  // il video si rifà prima con la scheda video (molto più veloce, il processore resta libero); se non si può o sbaglia, col processore
  if (v.vfr) {
    try { return await convertiCon(sel, v, avanza, segnale, 'prefer-hardware', pausa); } catch (e) { if (segnale?.aborted || (e instanceof Error && e.message === 'fermato')) throw e; avanza(0); }
  }
  return convertiCon(sel, v, avanza, segnale, 'no-preference', pausa);
}

async function convertiCon(sel: FileScelto, v: Verdetto, avanza: (k: number) => void, segnale: AbortSignal | undefined, hw: 'prefer-hardware' | 'no-preference', pausa?: PausaConversione): Promise<FileScelto> {
  const input = new Input({ source: sorgenteDi(sel), formats: ALL_FORMATS });
  const base = sel.name.replace(/\.[^.]+$/, '');
  await assicuraAac();
  try {
    // quali codec si possono scrivere qui: H.264 + AAC in MP4 se si può, se no VP9 + Opus in WebM
    let mp4: boolean, vc: Awaited<ReturnType<typeof getFirstEncodableVideoCodec>> = null;
    if (v.vfr) {
      vc = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8', 'av1']);
      if (!vc) throw new Error('nessun codificatore video');
      mp4 = vc === 'avc';
    } else {
      const ac = await getFirstEncodableAudioCodec(['aac', 'opus']);
      mp4 = ac === 'aac';
    }
    const ac = await getFirstEncodableAudioCodec(mp4 ? ['aac', 'opus'] : ['opus', 'vorbis']);
    const estensione = v.vfr ? (mp4 ? 'mp4' : 'webm') : (mp4 ? 'm4a' : 'webm');
    const nome = `${base}.${estensione}`;
    const dest = await destinazione(nome);
    const out = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: isTauri ? false : 'in-memory' }) : new WebMOutputFormat(), target: dest.target });
    try {
      const conv = await Conversion.init({
        input, output: out,
        ...(v.vfr ? { video: { frameRate: v.fps, ...(vc ? { codec: vc } : {}), bitrate: new Quality('high'), hardwareAcceleration: hw } } : { video: { discard: true } }),
        // video da rifare: l'audio si copia così com'è (se il contenitore nuovo lo accetta; se no Mediabunny sceglie da solo un codec che va).
        // MP3 variabile: si rifà a bitrate costante (192 kbit/s)
        audio: v.vbr ? { ...(ac ? { codec: ac } : {}), bitrate: new Quality({ quality: 'high', preferBitrate: true, bitrateMode: 'constant' }), forceTranscode: true } : {},
      });
      if (!conv.isValid) throw new Error('questo file non si riesce a convertire');
      conv.onProgress = (k: number) => { avanza(k); if (segnale?.aborted) void conv.cancel(); };
      segnale?.addEventListener('abort', () => { void conv.cancel(); }, { once: true });
      if (!pausa) await conv.execute();
      else {
        for (;;) {
          await pausa.checkpoint();
          const sosp = new AbortController();
          const stacca = pausa.allaPausa(() => sosp.abort());
          try { await conv.execute({ pauseSignal: sosp.signal }); } finally { stacca(); }
          if (conv.state === 'done' || conv.state === 'canceled') break;
        }
      }
      if (segnale?.aborted) throw new Error('fermato');
    } catch (e) { await dest.annulla(); throw e; }
    const r = await dest.fine();
    if (r.path) return { name: nome, path: r.path };
    const file = new File([r.blob!], nome, { type: estensione === 'mp4' ? 'video/mp4' : estensione === 'm4a' ? 'audio/mp4' : 'video/webm', lastModified: Date.now() });
    return { name: nome, file };
  } finally {
    input.dispose();
  }
}
