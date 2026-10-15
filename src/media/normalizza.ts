// File "a velocità variabile" → a velocità costante, da soli, quando entrano nel progetto.
//  · video con frame rate variabile (VFR: i telefoni e le registrazioni dello schermo): in montaggio fanno slittare
//    audio e video e saltare i tagli; si rifanno a frame rate costante (CFR);
//  · audio con bitrate variabile (VBR: MP3, Opus, Vorbis): la durata e i punti dove si salta non sono precisi, e la
//    forma d'onda si sposta; si rifanno a bitrate costante (CBR).
// Si converte solo se serve davvero; l'originale non si tocca (la copia convertita va nella cartella Video/DaProd Video
// nell'app, in memoria nel browser). Con "dpv-normalizza" = "no" nella memoria del programma non si converte niente.
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

/** guarda il file (pochi pacchetti) e dice se va rifatto a velocità costante; null se va bene com'è */
export async function esamina(sel: FileScelto): Promise<Verdetto | null> {
  if (!sel.file && !(sel.path && isTauri)) return null;
  const input = new Input({ source: sorgenteDi(sel), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    if (v) {
      const m = await v.computeFrameRateMetrics({ targetPacketCount: 400 }).catch(() => null);
      if (m && !m.frameRateIsConstant && m.probedPacketCount >= 30 && m.maxFrameRate / Math.max(1e-6, m.minFrameRate) > 1.25) {
        return { vfr: true, fps: fpsPulito(m.medianFrameRate || m.averageFrameRate), vbr: false, motivo: 'frame rate variabile → costante' };
      }
      return null;
    }
    if (a) {
      const codec = String((await a.getCodec()) ?? '');
      if (!/^(mp3|opus|vorbis)$/.test(codec)) return null;
      const sink = new EncodedPacketSink(a);
      const grandezze: number[] = [];
      for await (const p of sink.packets(undefined, undefined, { metadataOnly: true })) {
        grandezze.push(p.byteLength);
        if (grandezze.length >= 400) break;
      }
      const { cv, rapporto } = variazione(grandezze);
      // l'MP3 a bitrate costante cambia di un byte (il "padding"): cv sotto 0,01. Opus e Vorbis sono variabili di natura.
      if (cv > 0.08 && rapporto > 1.25) return { vfr: false, fps: 0, vbr: true, motivo: 'bitrate variabile → costante' };
    }
    return null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** una scrittura che accetta pezzi in qualunque posizione: su disco nell'app, in memoria nel browser */
async function destinazione(nome: string): Promise<{ target: BufferTarget | StreamTarget; fine: () => Promise<{ path?: string; blob?: Blob }>; annulla: () => Promise<void> }> {
  if (isTauri) {
    const path = await invoke<string>('registrazione_percorso', { name: nome });
    const id = await invoke<number>('export_apri', { path });
    const ws = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => { await invoke('export_scrivi', chunk.data, { headers: { 'x-id': String(id), 'x-pos': String(chunk.position) } }); },
    });
    return {
      target: new StreamTarget(ws, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      fine: async () => { await invoke('export_chiudi', { id }); return { path }; },
      annulla: async () => { await invoke('export_chiudi', { id }).catch(() => {}); },
    };
  }
  const t = new BufferTarget();
  return { target: t, fine: async () => ({ blob: new Blob([t.buffer!]) }), annulla: async () => {} };
}

let aacPronto: Promise<void> | null = null;
/** il codificatore AAC (nel browser di tutti i sistemi non c'è sempre): arriva solo quando serve */
const assicuraAac = () => aacPronto ??= import('@mediabunny/aac-encoder').then((m) => { m.registerAacEncoder(); }).catch(() => {});

/** rifà il file a velocità costante; ritorna il file nuovo (stesso nome, estensione del nuovo contenitore) */
export async function converti(sel: FileScelto, v: Verdetto, avanza: (k: number) => void, segnale?: AbortSignal): Promise<FileScelto> {
  // il video si rifà prima con la scheda video (molto più veloce, il processore resta libero); se non si può o sbaglia, col processore
  if (v.vfr) {
    try { return await convertiCon(sel, v, avanza, segnale, 'prefer-hardware'); } catch (e) { if (segnale?.aborted || (e instanceof Error && e.message === 'fermato')) throw e; avanza(0); }
  }
  return convertiCon(sel, v, avanza, segnale, 'no-preference');
}

async function convertiCon(sel: FileScelto, v: Verdetto, avanza: (k: number) => void, segnale: AbortSignal | undefined, hw: 'prefer-hardware' | 'no-preference'): Promise<FileScelto> {
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
        // l'audio a bitrate costante (192 kbit/s); se è già adatto resta com'è
        audio: { ...(ac ? { codec: ac } : {}), bitrate: new Quality({ quality: 'high', preferBitrate: true, bitrateMode: 'constant' }), ...(v.vbr ? { forceTranscode: true } : {}) },
      });
      if (!conv.isValid) throw new Error('questo file non si riesce a convertire');
      conv.onProgress = (k: number) => { avanza(k); if (segnale?.aborted) void conv.cancel(); };
      await conv.execute();
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
