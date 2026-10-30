// Il pannello Proprietà «Banco»: la parte che ragiona (senza DOM), così si prova da Node.
// Quattro schede — QUADRO, COLORE, AUDIO, AI — e le piccole regole che servono a riempirle: a quale scheda
// appartiene ogni sezione del vecchio ispettore, quali schede hanno senso per la clip scelta, il volume in dB
// con una stima dei LUFS, i keyframe in compatto, lo zoom sui clic del LIVE, Ripristina e Copia su tutte.
import type { Clip, Project } from './tipi';
import type { FunzioneAI, StatoAI } from './funzioniAI';
import { funzioniPer } from './funzioniAI';
import { togliAnimazione } from './automazioni';
import { regioniZoom } from './zoomCursore';

export type Scheda = 'quadro' | 'colore' | 'audio' | 'ai';
export const SCHEDE: { id: Scheda; nome: string; titolo: string }[] = [
  { id: 'quadro', nome: 'QUADRO', titolo: 'Dove sta l\'immagine: posizione, grandezza, opacità, maschere, keyframe' },
  { id: 'colore', nome: 'COLORE', titolo: 'Look, luce, contrasto, saturazione, LUT' },
  { id: 'audio', nome: 'AUDIO', titolo: 'Volume, voce e musica, pulizia della voce, mixer' },
  { id: 'ai', nome: 'AI', titolo: 'Le funzioni intelligenti per questa clip' },
];

/** a quale scheda sta ogni sezione (`data-g`) del vecchio ispettore: nessun comando sparisce, cambia solo posto */
const SEZIONE_SCHEDA: Record<string, Scheda> = {
  immagine: 'quadro', maschere: 'quadro', segui: 'quadro', ritaglio: 'quadro', durata: 'quadro', trclip: 'quadro', anim: 'quadro',
  titolo: 'quadro', animazione: 'quadro', generatore: 'quadro',
  fxv: 'colore', colore: 'colore',
  audio: 'audio', ducking: 'audio', fxa: 'audio', audioai: 'audio', csuono: 'audio',
  sfondo: 'ai',
};
export const schedaDiSezione = (id: string): Scheda => SEZIONE_SCHEDA[id] ?? 'quadro';
/** tutte le sezioni che il pannello sa mettere in una scheda (la prova controlla che l'inventario sia completo) */
export const SEZIONI_CONOSCIUTE = Object.keys(SEZIONE_SCHEDA);

export interface Selezione { video: number; audio: number; /** una ripresa con audio dentro */ conAudio: boolean }

/** quali schede hanno senso: un'immagine non ha volume, un audio non ha quadro. L'AI c'è sempre. */
export function schedeUsabili(s: Selezione): Record<Scheda, boolean> {
  return { quadro: s.video > 0, colore: s.video > 0, audio: s.audio > 0 || s.conAudio, ai: true };
}

/** la scheda da mostrare: quella che l'utente aveva scelto, se si può; se no la prima che si può */
export function schedaDaMostrare(voluta: Scheda | null | undefined, u: Record<Scheda, boolean>): Scheda {
  if (voluta && u[voluta]) return voluta;
  return (['quadro', 'audio', 'colore', 'ai'] as Scheda[]).find((x) => u[x]) ?? 'ai';
}

// ——— numeri ———
const virgola = (n: number, cifre: number) => n.toFixed(cifre).replace('.', ',');

/** «−3,0 dB», «+2,5 dB», «0,0 dB» (il meno è quello vero, − e non -) */
export function dbTesto(v: number, cifre = 1): string {
  const r = Math.round(v * 10 ** cifre) / 10 ** cifre;
  return `${r < 0 ? '−' : r > 0 ? '+' : ''}${virgola(Math.abs(r), cifre)} dB`;
}

/**
 * Una stima della sonorità in LUFS dai picchi della forma d'onda (un valore ogni centesimo di secondo), più il volume
 * della clip. Non è la misura vera della norma EBU R128 (quella vuole il segnale intero): serve a capire se una clip è
 * piano o forte rispetto alle altre, ed è per questo che il pannello scrive «≈». Nessun picco = null.
 */
export function lufsStimati(picchi: ArrayLike<number> | undefined, perSecondo: number, daSec: number, aSec: number, gainDb = 0): number | null {
  if (!picchi || !picchi.length || !(perSecondo > 0)) return null;
  const a = Math.max(0, Math.floor(daSec * perSecondo)), b = Math.min(picchi.length, Math.ceil(aSec * perSecondo));
  if (b - a < 5) return null;
  // un picco di 10 ms è circa 1,4–1,5 volte l'effettivo (RMS) del parlato e della musica
  const quadrati: number[] = [];
  const soglia = 10 ** ((-70 + 0.691) / 10);
  for (let i = a; i < b; i++) { const q = (picchi[i] / 1.5) ** 2; if (q > soglia) quadrati.push(q); }
  if (!quadrati.length) return null;
  const media = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
  // il «gate» relativo di R128: via i tratti 10 dB sotto la media (le pause)
  const m1 = media(quadrati);
  const forti = quadrati.filter((q) => q >= m1 * 0.1);
  const l = -0.691 + 10 * Math.log10(media(forti.length ? forti : quadrati)) + gainDb;
  return Math.round(l * 10) / 10;
}

export const lufsTesto = (l: number | null): string => (l === null ? '— LUFS' : `≈ ${l < 0 ? '−' : ''}${virgola(Math.abs(l), 0)} LUFS`);

// ——— etichette delle funzioni AI ———
export interface EtichettaAI { testo: string; /** la variabile CSS della spia */ colore: string }
export function etichettaStato(s: StatoAI): EtichettaAI {
  if (s === 'pronta') return { testo: 'PRONTA', colore: 'var(--verde)' };
  if (s === 'opzionale') return { testo: 'OPZIONALE', colore: 'var(--oro)' };
  return { testo: 'SPERIMENTALE', colore: 'var(--testo2)' };
}
/** «2,6 GB · 4 GB VRAM» (quello che c'è) o stringa vuota */
export function pesoEVram(f: Pick<FunzioneAI, 'peso' | 'vram'>): string {
  return [f.peso, f.vram ? (/vram/i.test(f.vram) ? f.vram : f.vram + ' VRAM') : ''].filter(Boolean).join(' · ');
}
/** l'elenco della scheda AI: le funzioni 'clip' e, se la selezione ha un suono, quelle 'audio' */
export function funzioniAIPerSelezione(s: Selezione, elenco: (dove: FunzioneAI['dove']) => FunzioneAI[] = funzioniPer): { clip: FunzioneAI[]; audio: FunzioneAI[] } {
  return { clip: elenco('clip'), audio: s.audio > 0 || s.conAudio ? elenco('audio') : [] };
}

// ——— keyframe in compatto ———
/** dove stanno le chiavi di tutti i parametri animati lungo la clip: frazione 0..1 e quanti parametri hanno una chiave lì */
export function posizioniChiavi(c: Clip): { f: number; frac: number; quanti: number }[] {
  const per = new Map<number, number>();
  for (const linea of Object.values(c.anim ?? {})) for (const k of linea) per.set(k.f, (per.get(k.f) ?? 0) + 1);
  const len = Math.max(1, c.len - 1);
  return [...per].sort((a, b) => a[0] - b[0]).map(([f, quanti]) => ({ f, frac: Math.max(0, Math.min(1, f / len)), quanti }));
}

// ——— zoom sui clic (le registrazioni del LIVE con il cursore) ———
export interface RiepilogoZoom { n: number; /** il fotogramma sulla timeline dove parte il primo */ primo: number | null; /** c'è già il movimento messo (tappe, arrivo) */ applicato: boolean }
/** quanti zoom automatici ci sono nei clic della ripresa (stesso conto di `applicaZoomCursore`), o null se la ripresa non ha clic */
export function zoomSuiClic(p: Project, c: Clip): RiepilogoZoom | null {
  const m = c.media ? p.media.find((x) => x.id === c.media) : undefined;
  const dati = m?.cursoreLive;
  if (!dati || dati.v !== 1 || !dati.clic?.length || c.speed <= 0) return null;
  const r = p.rate.num / p.rate.den, durata = Math.max(0, (c.len - 1) * 1000 / r);
  const ingresso = (c.srcIn - (m!.t0 || 0)) * 1000;
  const regioni = regioniZoom(dati.clic.map((s) => ({ ...s, tMs: (s.tMs - ingresso) / c.speed })), durata);
  return { n: regioni.length, primo: regioni.length ? c.start + Math.round(regioni[0].da / 1000 * r) : null, applicato: !!(c.tfFine || c.via?.length) };
}
export const zoomTesto = (z: RiepilogoZoom | null): string => (!z ? 'Questa ripresa non ha clic registrati' : z.n === 0 ? 'Nessun clic dentro questa parte' : z.n === 1 ? '1 zoom automatico' : `${z.n} zoom automatici`);

// ——— Ripristina e Copia su tutte ———
/** la clip si vede? (tolti i blocchi FX, che hanno le loro proprietà) */
export const clipVisiva = (c: Clip, p: Project) => c.kind !== 'fx' && c.kind !== 'tone' && c.kind !== 'beep' && p.tracks.find((t) => t.id === c.track)?.kind === 'video';
export const clipSonora = (c: Clip, p: Project) => c.kind !== 'fx' && p.tracks.find((t) => t.id === c.track)?.kind === 'audio';

/** la scheda ha qualcosa da ripristinare / copiare per questa clip? */
export function haProprieta(s: Scheda, c: Clip, p: Project): boolean {
  if (s === 'quadro' || s === 'colore') return clipVisiva(c, p);
  if (s === 'audio') return clipSonora(c, p);
  return false;
}

const AUDIO_FILTRI = ['voce', 'bassi', 'radio', 'eco', 'ovattato', 'robot'] as const;

/** rimette i valori di partenza di una scheda: i keyframe di quei parametri si tolgono */
export function ripristinaScheda(s: Scheda, c: Clip): boolean {
  if (s === 'quadro') {
    c.tf = { x: 0, y: 0, scale: 1, rot: 0, cropL: 0, cropR: 0, cropT: 0, cropB: 0 };
    delete c.tfFine; delete c.via;
    c.opacity = 1; c.opKeys = [];
    togliAnimazione(c, 'tf', 'opacity');
    return true;
  }
  if (s === 'colore') {
    c.fx.bright = 0; c.fx.contrast = 1; c.fx.sat = 1; c.fx.hue = 0; c.fx.temp = 0; c.fx.look = 'none'; c.fx.effetti = undefined;
    delete c.fx.colore; delete c.fx.vignette;
    togliAnimazione(c, 'fx.bright', 'fx.contrast', 'fx.sat', 'fx.hue', 'fx.temp', 'fx.colore', 'fx.vignette');
    return true;
  }
  if (s === 'audio') {
    // la clip originale di una separazione resta muta (se no voce e base suonerebbero doppie); la voce pulita tiene i dB che le servono
    if (c.afx?.separata?.ruolo !== 'originale') c.gain = c.afx?.pulito?.piu ?? 0;
    c.gainKeys = []; c.pan = 0;
    togliAnimazione(c, 'gain', 'pan');
    if (c.afx) { for (const k of AUDIO_FILTRI) delete c.afx[k]; delete c.afx.norm; }
    return true;
  }
  return false;
}

/** copia i valori di una scheda da una clip a un'altra (mai quello che lega la clip al suo file: sfondo, audio lavorato, movimento) */
export function copiaScheda(s: Scheda, da: Clip, a: Clip): boolean {
  if (da === a) return false;
  if (s === 'quadro') {
    a.tf = { ...da.tf }; a.opacity = da.opacity; a.opKeys = [];
    togliAnimazione(a, 'tf', 'opacity');
    return true;
  }
  if (s === 'colore') {
    const f = da.fx;
    a.fx.bright = f.bright; a.fx.contrast = f.contrast; a.fx.sat = f.sat; a.fx.hue = f.hue; a.fx.temp = f.temp; a.fx.look = f.look;
    a.fx.effetti = f.effetti ? [...f.effetti] : undefined;
    if (f.colore) a.fx.colore = structuredClone(f.colore); else delete a.fx.colore;
    if (f.vignette !== undefined) a.fx.vignette = f.vignette; else delete a.fx.vignette;
    togliAnimazione(a, 'fx.bright', 'fx.contrast', 'fx.sat', 'fx.hue', 'fx.temp', 'fx.colore', 'fx.vignette');
    return true;
  }
  if (s === 'audio') {
    // il volume della clip originale di una separazione (muta) non si copia, e quella non lo riceve
    if (a.afx?.separata?.ruolo !== 'originale') a.gain = da.afx?.separata?.ruolo === 'originale' ? (da.afx.separata.gain ?? 0) : da.gain;
    a.gainKeys = []; a.pan = da.pan;
    togliAnimazione(a, 'gain', 'pan');
    for (const k of AUDIO_FILTRI) { if (da.afx?.[k]) (a.afx ??= {})[k] = true; else if (a.afx) delete a.afx[k]; }
    if (a.afx) delete a.afx.norm;
    return true;
  }
  return false;
}

/** le clip su cui «Copia su tutte» agisce: quelle dello stesso genere (tutte le immagini o tutti i suoni), esclusa la clip stessa */
export function destinatarieDellaCopia(s: Scheda, da: Clip, p: Project): Clip[] {
  if (!haProprieta(s, da, p)) return [];
  return p.clips.filter((c) => c.id !== da.id && haProprieta(s, c, p));
}
