// Quali codec video questa macchina sa davvero codificare, e se lo fa con la scheda video o col processore.
// Si chiede a WebCodecs (`VideoEncoder.isConfigSupported`); Mediabunny poi usa lo stesso controllo per scegliere.
import { canEncodeVideo } from 'mediabunny';
import { CODEC_DI, type CodecVideo, type Contenitore } from '../core/esportazione';

/** le stringhe dei codec per WebCodecs: livelli alti, perché devono bastare anche per il 4K a 60 fps */
const STRINGA: Record<CodecVideo, string> = {
  avc: 'avc1.640034',
  hevc: 'hvc1.1.6.L153.B0',
  vp9: 'vp09.00.51.08',
  av1: 'av01.0.13M.08',
  vp8: 'vp8',
};

export interface StatoCodec {
  codec: CodecVideo;
  /** la macchina lo sa codificare a questa misura */
  disponibile: boolean;
  /** lo fa la scheda video (o il chip del computer) */
  scheda: boolean;
}

async function provaConfig(codec: CodecVideo, w: number, h: number, fps: number, hw: 'prefer-hardware' | 'prefer-software'): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const r = await VideoEncoder.isConfigSupported({ codec: STRINGA[codec], width: w, height: h, bitrate: 8_000_000, framerate: fps, hardwareAcceleration: hw });
    return !!r.supported;
  } catch { return false; }
}

const memoria = new Map<string, StatoCodec>();

/** lo stato di un codec a una certa misura (ricordato: la prova costa qualche decina di millisecondi) */
export async function statoCodec(codec: CodecVideo, w: number, h: number, fps: number): Promise<StatoCodec> {
  const chiave = `${codec}|${w}x${h}|${Math.round(fps)}`;
  const gia = memoria.get(chiave);
  if (gia) return gia;
  const scheda = await provaConfig(codec, w, h, fps, 'prefer-hardware');
  // disponibile = lo sa fare Mediabunny (è lui che codificherà davvero), con la scheda o col processore
  let disponibile = scheda || await provaConfig(codec, w, h, fps, 'prefer-software');
  if (!disponibile) disponibile = await canEncodeVideo(codec, { width: w, height: h }).catch(() => false);
  const st = { codec, disponibile, scheda: scheda && disponibile };
  memoria.set(chiave, st);
  return st;
}

/** i codec del contenitore con il loro stato, nell'ordine di CODEC_DI */
export async function statiCodec(formato: Contenitore, w: number, h: number, fps: number): Promise<StatoCodec[]> {
  return Promise.all(CODEC_DI[formato].map((c) => statoCodec(c, w, h, fps)));
}
