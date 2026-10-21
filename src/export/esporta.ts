// L'export: il "riversamento" sul master. Ogni fotogramma si compone come nel Recorder, ma con i
// fotogrammi esatti (si aspetta il decoder), e l'audio si mixa a pezzi. Codifica con WebCodecs,
// impacchetta con Mediabunny. Nell'app il file si scrive dal lato Rust mentre esce, senza tenerlo in memoria.
import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, MovOutputFormat, Output, Quality, StreamTarget,
  VideoSampleSink, WavOutputFormat, WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
  type AudioCodec, type StreamTargetChunk, type VideoCodec, type VideoSample,
} from 'mediabunny';
import type { Clip, Project } from '../core/tipi';
import { projectEnd } from '../core/progetto';
import { f2s, fps } from '../core/timecode';
import { mixaggio } from '../media/audio';
import { mediaRT } from '../media/libreria';
import { caricaFontAnimazioni } from '../render/font';
import { Compositore } from '../render/compositore';
import { pianoVideo, type Sorgente } from '../render/piano';
import { dialogoSalva, invoke, isTauri, nomeDaPercorso, scarica, type FileScelto } from '../platform';
import type { Fotogramma } from '../media/fotogrammi';

export type Formato = 'mp4' | 'mov' | 'webm' | 'wav';
export type Qualita = 'bassa' | 'media' | 'alta' | 'altissima';

export interface Opzioni {
  formato: Formato;
  w: number;
  h: number;
  qualita: Qualita;
  soloInOut: boolean;
  nome: string;
  /** un file per il programma stesso (Rendi clip unica): nell'app va nella cartella Video/DaProd Video senza chiedere,
   *  nel browser resta in memoria; arriva a `file` quando è finito */
  interna?: { file: (f: FileScelto) => void };
}

export interface Avanzamento { fatti: number; totale: number; fase: string; fpsResa: number }

const QUALITA: Record<Qualita, Quality> = {
  bassa: new Quality('low'),
  media: new Quality('medium'),
  alta: new Quality('high'),
  altissima: new Quality('very-high'),
};

let aacPronto: Promise<void> | null = null;

/** sceglie i codec che questo sistema sa davvero codificare */
export async function scegliCodec(formato: Formato, w: number, h: number): Promise<{ v: VideoCodec | null; a: AudioCodec | null }> {
  if (formato === 'wav') return { v: null, a: 'pcm-s16' };
  const vc: VideoCodec[] = formato === 'webm' ? ['vp9', 'av1', 'vp8'] : formato === 'mov' ? ['avc', 'hevc'] : ['avc', 'hevc', 'vp9', 'av1'];
  const ac: AudioCodec[] = formato === 'webm' ? ['opus', 'vorbis'] : ['aac', 'opus', 'mp3'];
  const v = await getFirstEncodableVideoCodec(vc, { width: w, height: h });
  let a = await getFirstEncodableAudioCodec(ac, { numberOfChannels: 2, sampleRate: 48000 });
  if (formato !== 'webm' && a !== 'aac') {
    // niente AAC nel sistema (Firefox, Chromium open): si carica il codificatore AAC in WASM
    try {
      if (!aacPronto) aacPronto = import('@mediabunny/aac-encoder').then((m) => { m.registerAacEncoder(); });
      await aacPronto;
      a = (await getFirstEncodableAudioCodec(['aac'], { numberOfChannels: 2, sampleRate: 48000 })) ?? a;
    } catch { /* resta quello che c'è */ }
  }
  return { v, a };
}

/** una scrittura su disco che accetta pezzi in qualunque posizione (per l'MP4 che torna indietro a sistemare le intestazioni) */
interface Destinazione { target: BufferTarget | StreamTarget; chiudi: () => Promise<string>; annulla: () => Promise<void> }

async function destinazione(nome: string, mime: string, estensione: string): Promise<Destinazione | null> {
  if (isTauri) {
    const path = await dialogoSalva(nome, estensione, mime);
    if (!path) return null;
    const id = await invoke<number>('export_apri', { path });
    const ws = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => {
        await invoke('export_scrivi', chunk.data, { headers: { 'x-id': String(id), 'x-pos': String(chunk.position) } });
      },
    });
    return {
      target: new StreamTarget(ws, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      chiudi: async () => { await invoke('export_chiudi', { id }); return nomeDaPercorso(path); },
      annulla: async () => { await invoke('export_chiudi', { id }).catch(() => {}); },
    };
  }
  const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> };
  if (w.showSaveFilePicker) {
    try {
      const hh = await w.showSaveFilePicker({ suggestedName: nome, types: [{ description: estensione.toUpperCase(), accept: { [mime]: ['.' + estensione] } }] });
      const fws = await hh.createWritable();
      const ws = new WritableStream<StreamTargetChunk>({
        write: (chunk) => fws.write({ type: 'write', position: chunk.position, data: chunk.data }),
      });
      return {
        target: new StreamTarget(ws, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
        chiudi: async () => { await fws.close(); return hh.name; },
        annulla: async () => { await fws.abort().catch(() => {}); },
      };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  // ultima spiaggia: in memoria e poi scaricamento
  const target = new BufferTarget();
  return {
    target,
    chiudi: async () => { scarica(new Blob([target.buffer!], { type: mime }), nome); return nome; },
    annulla: async () => {},
  };
}

/** la destinazione di un file per il programma: nessuna domanda, e alla fine il file si consegna */
async function destinazioneInterna(nome: string, mime: string, consegna: (f: FileScelto) => void): Promise<Destinazione> {
  if (isTauri) {
    const path = await invoke<string>('registrazione_percorso', { name: nome });
    const id = await invoke<number>('export_apri', { path });
    const ws = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => { await invoke('export_scrivi', chunk.data, { headers: { 'x-id': String(id), 'x-pos': String(chunk.position) } }); },
    });
    return {
      target: new StreamTarget(ws, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      chiudi: async () => { await invoke('export_chiudi', { id }); consegna({ name: nomeDaPercorso(path), path }); return nomeDaPercorso(path); },
      annulla: async () => { await invoke('export_chiudi', { id }).catch(() => {}); },
    };
  }
  const target = new BufferTarget();
  return {
    target,
    chiudi: async () => { consegna({ name: nome, file: new File([target.buffer!], nome, { type: mime, lastModified: Date.now() }) }); return nome; },
    annulla: async () => {},
  };
}

/** legge i fotogrammi esatti per l'export: un lettore in avanti per ogni clip */
export class Lettori {
  private l = new Map<string, { it: AsyncGenerator<VideoSample>; cur: VideoSample | null; next: VideoSample | null; fine: boolean; usato: number }>();
  private sinks = new Map<string, VideoSampleSink>();
  /** i fotogrammi superati in questo giro: si chiudono a fotogramma disegnato (pulisci), non mentre si raccolgono gli strati */
  private vecchi: VideoSample[] = [];

  async prendi(c: Clip, t: number, giro: number): Promise<Fotogramma | null> {
    const r = c.media ? mediaRT(c.media) : undefined;
    if (!r) return null;
    if (r.image) return r.image;
    if (!r.v || !r.vDecodable) return null;
    let s = this.l.get(c.id);
    if (!s || (s.cur && t < s.cur.timestamp - 1e-4)) {
      if (s) this.chiudi(c.id);
      let sink = this.sinks.get(c.media!);
      if (!sink) { sink = new VideoSampleSink(r.v); this.sinks.set(c.media!, sink); }
      s = { it: sink.samples(t), cur: null, next: null, fine: false, usato: giro };
      this.l.set(c.id, s);
    }
    s.usato = giro;
    while (!s.fine) {
      if (!s.next) {
        const n = await s.it.next();
        if (n.done) { s.fine = true; break; }
        s.next = n.value;
      }
      if (s.next.timestamp <= t + 1e-4) { if (s.cur) this.vecchi.push(s.cur); s.cur = s.next; s.next = null; }
      else break;
    }
    return s.cur ?? s.next;
  }

  /** il fotogramma che viene subito dopo quello appena preso per la clip (serve al movimento fluido dei rallentatori) */
  dopo(c: Clip): Fotogramma | null {
    return this.l.get(c.id)?.next ?? null;
  }

  pulisci(giro: number) {
    for (const v of this.vecchi) v.close();
    this.vecchi.length = 0;
    for (const [id, s] of this.l) if (giro - s.usato > 2) this.chiudi(id);
  }

  private chiudi(id: string) {
    const s = this.l.get(id);
    if (!s) return;
    // (anche qui a fine fotogramma: chiudi() si chiama pure mentre si raccolgono gli strati, tornando indietro)
    if (s.cur) this.vecchi.push(s.cur);
    if (s.next) this.vecchi.push(s.next);
    void s.it.return(undefined as never).catch(() => {});
    this.l.delete(id);
  }

  tutto() { for (const id of [...this.l.keys()]) this.chiudi(id); for (const v of this.vecchi) v.close(); this.vecchi.length = 0; }
}

export async function esporta(p0: Project, o: Opzioni, avanza: (a: Avanzamento) => void, annullato: () => boolean): Promise<string | null> {
  const p: Project = structuredClone(p0);
  // i caratteri delle animazioni devono esserci prima di disegnare i fotogrammi
  await caricaFontAnimazioni();
  const r = fps(p.rate);
  const a = o.soloInOut && p.inF !== null ? p.inF : 0;
  const b = o.soloInOut && p.outF !== null ? p.outF : projectEnd(p);
  if (b <= a) throw new Error('Il montaggio è vuoto');
  const w = Math.round(o.w / 2) * 2, h = Math.round(o.h / 2) * 2;
  const { v, a: ac } = await scegliCodec(o.formato, w, h);
  if (o.formato !== 'wav' && !v) throw new Error(`Questo sistema non sa codificare video in ${o.formato.toUpperCase()}. Prova WebM o MP4.`);
  const mime = o.formato === 'webm' ? 'video/webm' : o.formato === 'mov' ? 'video/quicktime' : o.formato === 'wav' ? 'audio/wav' : 'video/mp4';
  const dest = o.interna ? await destinazioneInterna(o.nome, mime, o.interna.file) : await destinazione(o.nome, mime, o.formato);
  if (!dest) return null;
  const format = o.formato === 'webm' ? new WebMOutputFormat() : o.formato === 'mov' ? new MovOutputFormat() : o.formato === 'wav' ? new WavOutputFormat() : new Mp4OutputFormat({ fastStart: dest.target instanceof BufferTarget ? 'in-memory' : false });
  const out = new Output({ format, target: dest.target });
  let canvas: OffscreenCanvas | null = null, comp: Compositore | null = null, vsrc: CanvasSource | null = null;
  if (o.formato !== 'wav' && v) {
    canvas = new OffscreenCanvas(w, h);
    comp = new Compositore(canvas, true);
    vsrc = new CanvasSource(canvas, { codec: v, bitrate: QUALITA[o.qualita], keyFrameInterval: 2, latencyMode: 'quality' } as ConstructorParameters<typeof CanvasSource>[1]);
    out.addVideoTrack(vsrc, { frameRate: r });
  }
  let asrc: AudioBufferSource | null = null;
  if (ac) {
    asrc = new AudioBufferSource({ codec: ac, bitrate: o.formato === 'wav' ? undefined : QUALITA[o.qualita] } as ConstructorParameters<typeof AudioBufferSource>[0]);
    out.addAudioTrack(asrc);
  }
  out.setMetadataTags({ title: p.name, comment: 'Montato con DaProd Video' });
  const lettori = new Lettori();
  const t0 = performance.now();
  try {
    await out.start();
    const aSec = f2s(a, p.rate), bSec = f2s(b, p.rate);
    const pezzi = asrc ? mixaggio(p, aSec, bSec) : null;
    let audioFino = aSec;
    const altroAudio = async () => {
      if (!pezzi || !asrc) return false;
      const n = await pezzi.next();
      if (n.done) { audioFino = Infinity; return false; }
      await asrc.add(n.value);
      audioFino += n.value.duration;
      return true;
    };
    const totale = b - a;
    if (comp && vsrc) {
      // il compositore dell'export è a piena risoluzione; il progetto può essere di un'altra misura
      const pp: Project = { ...p, w: p.w, h: p.h };
      for (let f = a; f < b; f++) {
        if (annullato()) throw new Error('annullato');
        const tSec = f2s(f, p.rate);
        while (pezzi && audioFino < tSec + 2 && audioFino !== Infinity) await altroAudio();
        const strati = pianoVideo(pp, f);
        const presi = new Map<Sorgente, Fotogramma | null>();
        for (const s of strati) {
          for (const src of [s.b, s.a]) {
            if (src && src.clip.kind === 'media') presi.set(src, await lettori.prendi(src.clip, src.t, f));
          }
        }
        comp.render(pp, strati, false, f, (s) => presi.get(s) ?? null, (s) => lettori.dopo(s.clip));
        await vsrc.add((f - a) / r, 1 / r);
        lettori.pulisci(f);
        if ((f - a) % 5 === 0) avanza({ fatti: f - a, totale, fase: 'video', fpsResa: (f - a) / ((performance.now() - t0) / 1000) });
      }
    }
    while (pezzi && (await altroAudio())) {
      if (annullato()) throw new Error('annullato');
      avanza({ fatti: Math.min(totale, (audioFino - aSec) * r), totale, fase: 'audio', fpsResa: 0 });
    }
    avanza({ fatti: totale, totale, fase: 'chiusura', fpsResa: 0 });
    await out.finalize();
    lettori.tutto();
    comp?.distruggi();
    return await dest.chiudi();
  } catch (e) {
    lettori.tutto();
    comp?.distruggi();
    await out.cancel().catch(() => {});
    await dest.annulla();
    if ((e as Error).message === 'annullato') return null;
    throw e;
  }
}

/** il compositore delle istantanee resta acceso: compilare gli shader costa (un paio di secondi sui computer lenti) */
let istantanee: { canvas: OffscreenCanvas; comp: Compositore } | null = null;

/** il fotogramma sotto il cursore in PNG, a piena risoluzione */
export async function fotogrammaPng(p: Project, f: number): Promise<Blob> {
  if (istantanee?.comp.perso) istantanee = null;
  if (!istantanee) { const canvas = new OffscreenCanvas(p.w, p.h); istantanee = { canvas, comp: new Compositore(canvas, true) }; }
  const { canvas, comp } = istantanee;
  if (canvas.width !== p.w || canvas.height !== p.h) { canvas.width = p.w; canvas.height = p.h; }
  const lettori = new Lettori();
  try {
    const strati = pianoVideo(p, f);
    const presi = new Map<Sorgente, Fotogramma | null>();
    for (const s of strati) for (const src of [s.b, s.a]) if (src && src.clip.kind === 'media') presi.set(src, await lettori.prendi(src.clip, src.t, 0));
    comp.render(p, strati, false, f, (s) => presi.get(s) ?? null, (s) => lettori.dopo(s.clip));
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    lettori.tutto();
  }
}
