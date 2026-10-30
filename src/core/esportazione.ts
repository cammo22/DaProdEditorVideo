// L'esportazione, la parte che si può provare senza browser: i preset pronti, da preset a impostazioni vere
// (misura, fps, codec, bitrate), come il progetto si adatta a un'altra forma (bande o ritaglio), la stima del peso.
// Qui non c'è niente di WebCodecs né di pagina: lo usano `src/export/esporta.ts` (il motore) e `src/ui/esportazione.ts`.

export type Contenitore = 'mp4' | 'mov' | 'webm' | 'wav';
export type CodecVideo = 'avc' | 'hevc' | 'vp9' | 'av1' | 'vp8';
/** bande = l'immagine resta intera e si aggiungono bande nere; ritaglio = riempie il quadro e si taglia ai lati */
export type Adatta = 'bande' | 'ritaglio';

/** i codec che ogni contenitore sa tenere, dal più comune */
export const CODEC_DI: Record<Contenitore, CodecVideo[]> = {
  mp4: ['avc', 'hevc', 'vp9', 'av1'],
  mov: ['avc', 'hevc'],
  webm: ['vp9', 'av1', 'vp8'],
  wav: [],
};

export const NOME_CODEC: Record<CodecVideo, string> = { avc: 'H.264', hevc: 'H.265 (HEVC)', vp9: 'VP9', av1: 'AV1', vp8: 'VP8' };
export const INFO_CODEC: Record<CodecVideo, string> = {
  avc: 'va su tutto: telefoni, TV, social',
  hevc: 'file più piccolo a parità di qualità, ma non lo apre ogni programma',
  vp9: 'ottimo per il web, file piccolo',
  av1: 'il più leggero di tutti, ma ci mette di più a prepararlo',
  vp8: 'vecchio formato web',
};
export const NOME_CONTENITORE: Record<Contenitore, string> = { mp4: 'MP4', mov: 'MOV', webm: 'WebM', wav: 'WAV' };

/** quanto pesa a parità di qualità un codec rispetto a H.264 (numeri di mestiere, per la stima, non misure) */
export const EFFICIENZA: Record<CodecVideo, number> = { avc: 1, hevc: 0.65, vp9: 0.7, av1: 0.55, vp8: 1.15 };

/** Il quadro di uscita di un preset: misura fissa, oppure derivata dal progetto. */
export type Quadro =
  | { tipo: 'fisso'; w: number; h: number }
  /** k = quante volte il progetto; lungoMax = il lato lungo non supera questo valore */
  | { tipo: 'progetto'; k?: number; lungoMax?: number };

export interface Preset {
  id: string;
  nome: string;
  /** una riga che dice a cosa serve */
  info: string;
  formato: Contenitore;
  /** i codec che preferisce, nell'ordine (si prende il primo che la macchina sa fare) */
  codec: CodecVideo[];
  quadro: Quadro;
  /** i fotogrammi al secondo non salgono oltre questo valore (si saltano fotogrammi interi, mai inventati) */
  fpsMax?: number;
  /** 0..100: la posizione del cursore qualità */
  qualita: number;
  audioKbps: number;
  /** come si adatta se il progetto ha un'altra forma: di partenza */
  adatta: Adatta;
  /** si può cambiare tutto a mano */
  libero?: boolean;
  /** il volume che chiede la piattaforma (LUFS integrati); senza, la normalizzazione non ha un traguardo suo */
  lufs?: number;
  /** il nome corto che si vede sulle carte del Finale */
  corto?: string;
  /** una delle quattro destinazioni sempre in vista nel Finale (le altre stanno sotto «Altre destinazioni») */
  principale?: boolean;
}

export const PRESET: Preset[] = [
  { id: 'yt1080', nome: 'YouTube 1080p', corto: 'YouTube', principale: true, lufs: -14, info: 'Full HD, il formato di tutti i giorni', formato: 'mp4', codec: ['avc', 'hevc'], quadro: { tipo: 'fisso', w: 1920, h: 1080 }, fpsMax: 60, qualita: 62, audioKbps: 192, adatta: 'bande' },
  { id: 'yt4k', nome: 'YouTube 4K', lufs: -14, info: 'Ultra HD, per schermi grandi', formato: 'mp4', codec: ['avc', 'hevc', 'vp9'], quadro: { tipo: 'fisso', w: 3840, h: 2160 }, fpsMax: 60, qualita: 68, audioKbps: 256, adatta: 'bande' },
  { id: 'verticale', nome: 'Reel · TikTok · Shorts', principale: true, lufs: -14, info: 'Verticale 9:16, per il telefono', formato: 'mp4', codec: ['avc', 'hevc'], quadro: { tipo: 'fisso', w: 1080, h: 1920 }, fpsMax: 30, qualita: 58, audioKbps: 192, adatta: 'bande' },
  { id: 'quadrato', nome: 'Instagram quadrato', lufs: -14, info: 'Quadrato 1:1, per i post', formato: 'mp4', codec: ['avc', 'hevc'], quadro: { tipo: 'fisso', w: 1080, h: 1080 }, fpsMax: 30, qualita: 58, audioKbps: 192, adatta: 'bande' },
  { id: 'master', nome: 'Archivio alta qualità', corto: 'Archivio alta qualità', principale: true, info: 'Come il progetto, per conservare o rifare altri formati', formato: 'mp4', codec: ['hevc', 'avc'], quadro: { tipo: 'progetto' }, qualita: 92, audioKbps: 320, adatta: 'bande' },
  { id: 'whatsapp', nome: 'Leggero per WhatsApp', lufs: -16, info: 'Piccolo da mandare in chat', formato: 'mp4', codec: ['avc'], quadro: { tipo: 'progetto', lungoMax: 1280 }, fpsMax: 30, qualita: 22, audioKbps: 96, adatta: 'bande' },
  { id: 'audio', nome: 'Solo audio (WAV)', corto: 'Solo audio', principale: true, lufs: -16, info: 'Solo il suono, senza compressione', formato: 'wav', codec: [], quadro: { tipo: 'progetto' }, qualita: 100, audioKbps: 0, adatta: 'bande' },
  { id: 'libero', nome: 'Personalizzato', info: 'Scegli tu formato, codec e misura', formato: 'mp4', codec: ['avc', 'hevc', 'vp9', 'av1'], quadro: { tipo: 'progetto' }, qualita: 62, audioKbps: 192, adatta: 'bande', libero: true },
];

export const presetDi = (id: string): Preset => PRESET.find((p) => p.id === id) ?? PRESET[0];

/** le quattro destinazioni del Finale (YouTube, verticale, archivio, solo audio) e le altre */
export const PRESET_PRINCIPALI = PRESET.filter((p) => p.principale);
export const PRESET_ALTRI = PRESET.filter((p) => !p.principale);

/** i volumi fra cui scegliere quando si normalizza a mano */
export const TRAGUARDI_LUFS = [-14, -16, -23] as const;

/**
 * Il volume a cui portare il file: quello scelto dall'utente, se no quello del preset, se no -14 (il più comune).
 * Ritorna null se la normalizzazione è spenta.
 */
export function traguardoLufs(pr: Preset, normalizza: boolean, scelto: number | null): number | null {
  if (!normalizza) return null;
  return scelto ?? pr.lufs ?? -14;
}

/** la riga sotto il nome di una destinazione: "16:9 · 1080p60 · −14 LUFS" (la misura vera dipende dal progetto) */
export function sottoDestinazione(pr: Preset, imp: { formato: Contenitore; w: number; h: number; fps: number }): string {
  const lufs = pr.lufs !== undefined ? ` · −${Math.abs(pr.lufs)} LUFS` : '';
  if (imp.formato === 'wav') return `Voce e musica${lufs}`;
  if (pr.libero) return 'Scegli tu formato, codec e misura';
  const fps = Math.round(imp.fps);
  const lato = Math.min(imp.w, imp.h);
  const nome = lato >= 2160 ? '4K' : `${lato}p`;
  return `${proporzioneTesto(imp.w, imp.h)} · ${nome}${fps}${lufs}`;
}

/** le misure del «Personalizzato»: l'altezza, con la forma del progetto */
export const MISURE: { id: string; nome: string; altezza: number | null; k?: number }[] = [
  { id: 'progetto', nome: 'Come il progetto', altezza: null },
  { id: 'meta', nome: 'Metà', altezza: null, k: 0.5 },
  { id: '720', nome: '720p', altezza: 720 },
  { id: '1080', nome: '1080p', altezza: 1080 },
  { id: '2160', nome: '4K', altezza: 2160 },
];

export interface Progetto { w: number; h: number; fps: number }

const pari = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** il quadro di uscita (misure pari, come chiedono i codec) */
export function quadroDa(pr: Preset, prog: Progetto, misura = 'progetto'): { w: number; h: number } {
  if (pr.libero) {
    const m = MISURE.find((x) => x.id === misura) ?? MISURE[0];
    if (m.altezza) return { w: pari(prog.w * m.altezza / prog.h), h: pari(m.altezza) };
    const k = m.k ?? 1;
    return { w: pari(prog.w * k), h: pari(prog.h * k) };
  }
  const q = pr.quadro;
  if (q.tipo === 'fisso') return { w: q.w, h: q.h };
  let k = q.k ?? 1;
  if (q.lungoMax) k = Math.min(k, q.lungoMax / Math.max(prog.w, prog.h));
  return { w: pari(prog.w * k), h: pari(prog.h * k) };
}

/** ogni quanti fotogrammi del progetto se ne tiene uno, per non superare fpsMax (solo rapporti interi: 50→25, 60→30) */
export function passoFps(fps: number, fpsMax?: number): number {
  if (!fpsMax || fps <= fpsMax * 1.05) return 1;
  const k = fps / fpsMax;
  const n = Math.round(k);
  return Math.abs(k - n) < 0.08 && n >= 2 ? n : 1;
}

/** dove va l'immagine nel quadro di uscita: la tela del compositore è cw×ch e si posa a (dx, dy) sul quadro w×h */
export interface Geometria { cw: number; ch: number; dx: number; dy: number }

/** Come si posa un progetto pw×ph su un quadro w×h. Stessa forma → niente da fare (null). */
export function adattamento(pw: number, ph: number, w: number, h: number, modo: Adatta): Geometria | null {
  if (!pw || !ph || simili(pw / ph, w / h)) return null;
  const k = modo === 'ritaglio' ? Math.max(w / pw, h / ph) : Math.min(w / pw, h / ph);
  const cw = pari(pw * k), ch = pari(ph * k);
  return { cw, ch, dx: Math.round((w - cw) / 2), dy: Math.round((h - ch) / 2) };
}

/** due forme uguali (a meno di un pixel di arrotondamento) */
export function simili(a: number, b: number): boolean { return Math.abs(a - b) / b < 0.006; }

/** "16:9", "9:16", "1:1", "4:3", "21:9"… oppure il numero decimale */
export function proporzioneTesto(w: number, h: number): string {
  const noti: [number, number][] = [[16, 9], [9, 16], [1, 1], [4, 3], [3, 4], [21, 9], [3, 2], [2, 3], [4, 5], [5, 4], [2, 1], [1, 2]];
  for (const [a, b] of noti) if (simili(w / h, a / b)) return `${a}:${b}`;
  return (w / h).toFixed(2).replace('.', ',') + ':1';
}

/** a parole, cosa succede all'immagine */
export function testoAdattamento(pw: number, ph: number, w: number, h: number, modo: Adatta): string {
  const g = adattamento(pw, ph, w, h, modo);
  if (!g) return 'Il progetto ha già questa forma: l\'immagine esce a tutto quadro.';
  const da = proporzioneTesto(pw, ph), a = proporzioneTesto(w, h);
  if (modo === 'bande') {
    const orizzontale = g.dx > 0 ? 'ai lati' : 'sopra e sotto';
    return `Il progetto è ${da}, l'uscita è ${a}: l'immagine resta intera e si aggiungono bande nere ${orizzontale}.`;
  }
  const visibile = Math.round((Math.min(w, g.cw) * Math.min(h, g.ch)) / (g.cw * g.ch) * 100);
  const tagli = g.dx < 0 ? 'ai lati' : 'sopra e sotto';
  return `Il progetto è ${da}, l'uscita è ${a}: l'immagine riempie il quadro e si taglia ${tagli} (resta il centro, circa il ${visibile}% dell'immagine).`;
}

/** Tutto quello che il motore deve sapere per esportare un preset. */
export interface Impostazioni {
  formato: Contenitore;
  w: number;
  h: number;
  /** ogni quanti fotogrammi del progetto se ne prende uno */
  passo: number;
  fps: number;
  codec: CodecVideo | null;
  /** bit al secondo del video (0 senza video) */
  bitrate: number;
  /** bit al secondo dell'audio (0 per il WAV, che non è compresso) */
  audioBps: number;
  adatta: Adatta | null;
  geometria: Geometria | null;
}

export interface Scelte {
  preset: string;
  /** il codec che vuole l'utente; se la macchina non lo sa fare si prende il primo che c'è */
  codec?: CodecVideo | null;
  /** formato (solo «Personalizzato») */
  formato?: Contenitore;
  /** 0..100 (di partenza quella del preset) */
  qualita?: number;
  adatta?: Adatta;
  /** id di MISURE (solo «Personalizzato») */
  misura?: string;
}

/** I codec fra cui scegliere per questa scelta, nell'ordine di preferenza, fra quelli disponibili. */
export function codecPossibili(pr: Preset, formato: Contenitore, disponibili: readonly CodecVideo[]): CodecVideo[] {
  const del = CODEC_DI[formato];
  const ordine = pr.libero ? del : pr.codec.filter((c) => del.includes(c));
  return ordine.filter((c) => disponibili.includes(c));
}

/** il bitrate del video dalla posizione del cursore: bit per pixel da 0,03 a 0,30, meno se il codec è più bravo */
export function bitrateVideo(w: number, h: number, fps: number, qualita: number, codec: CodecVideo): number {
  const q = Math.max(0, Math.min(100, qualita));
  const bpp = 0.03 * Math.pow(10, q / 100);
  return Math.round(w * h * fps * bpp * EFFICIENZA[codec] / 1000) * 1000;
}

/** da preset e scelte a impostazioni vere */
export function impostazioni(sc: Scelte, prog: Progetto, disponibili: readonly CodecVideo[]): Impostazioni {
  const pr = presetDi(sc.preset);
  const formato = pr.libero ? sc.formato ?? pr.formato : pr.formato;
  if (formato === 'wav') {
    return { formato, w: pari(prog.w), h: pari(prog.h), passo: 1, fps: prog.fps, codec: null, bitrate: 0, audioBps: 0, adatta: null, geometria: null };
  }
  const { w, h } = quadroDa(pr, prog, sc.misura);
  const passo = passoFps(prog.fps, pr.fpsMax);
  const fps = prog.fps / passo;
  const possibili = codecPossibili(pr, formato, disponibili);
  const codec = sc.codec && possibili.includes(sc.codec) ? sc.codec : possibili[0] ?? null;
  const adatta = sc.adatta ?? pr.adatta;
  const geometria = adattamento(prog.w, prog.h, w, h, adatta);
  const q = sc.qualita ?? pr.qualita;
  return {
    formato, w, h, passo, fps, codec,
    bitrate: codec ? bitrateVideo(w, h, fps, q, codec) : 0,
    audioBps: pr.audioKbps * 1000,
    adatta: geometria ? adatta : null,
    geometria,
  };
}

/** i byte stimati del file (video + audio, più un po' di contenitore) */
export function pesoStimato(imp: Impostazioni, durataSec: number): number {
  if (durataSec <= 0) return 0;
  if (imp.formato === 'wav') return Math.round(durataSec * 48000 * 2 * 2 + 44);
  return Math.round(((imp.bitrate + imp.audioBps) * durataSec) / 8 * 1.02);
}

/** "48 MB", "1,2 GB", "820 KB" */
export function pesoTesto(byte: number): string {
  if (byte < 1000) return byte + ' B';
  const num = (x: number, d: number) => x.toFixed(d).replace('.', ',').replace(/,0+$/, '');
  if (byte < 1e6) return Math.round(byte / 1e3) + ' KB';
  if (byte < 1e9) return num(byte / 1e6, byte < 1e7 ? 1 : 0) + ' MB';
  return num(byte / 1e9, 1) + ' GB';
}

/** cosa vuol dire quella posizione del cursore qualità, a parole */
export function descriviQualita(q: number): string {
  if (q < 20) return 'Molto leggero: si vede la compressione sui movimenti veloci';
  if (q < 40) return 'Leggero: va bene per mandarlo in chat';
  if (q < 60) return 'Buono: bello sul telefono, file contenuto';
  if (q < 80) return 'Alto: pulito anche sullo schermo grande';
  if (q < 95) return 'Altissimo: da conservare, il file pesa';
  return 'Massimo: quasi senza perdita, file grosso';
}

/** il nome del file: nome del progetto pulito + il preset */
export function nomeFile(progetto: string, pr: Preset, formato: Contenitore): string {
  const base = progetto.replace(/[\\/:*?"<>|]/g, '_').trim() || 'montaggio';
  return `${pr.libero ? base : `${base} - ${pr.nome.replace(/[\\/:*?"<>|·]/g, '').replace(/\s+/g, ' ').trim()}`}.${formato}`;
}
