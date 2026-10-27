// Gli effetti rapidi: quelli che servono davvero mentre si monta, accesi e spenti con un clic.
// Li usano il tasto "fx" in fondo alle clip, la sezione Effetti del contenitore (anche trascinandoli su una
// clip) e le proprietà. Ogni effetto sa dire se è acceso e sa accendersi o spegnersi.
import type { Clip, Look, Project } from './core/tipi';
import { autoColore, dbToGain, gainToDb, isVideoClip, masterDi, newTransition } from './core/progetto';
import { fps } from './core/timecode';
import { mediaRT, PEAKS_PER_SEC } from './media/libreria';
import { store } from './core/store';
import { avviso } from './ui/dom';
import { modi } from './azioni';

/** i fotogrammi di una dissolvenza trascinata: la durata scelta nel contenitore (Auto = 1 secondo) */
export const durataDissolvenza = (p: Project, c: Clip) => Math.max(1, Math.min(c.len, Math.round((modi.durataFx || 1) * fps(p.rate))));

export interface Effetto {
  id: string;
  nome: string;
  info: string;
  per: 'video' | 'audio';
  /** classe dell'anteprima (un quadratino disegnato in CSS) */
  anteprima: string;
  acceso(c: Clip, p: Project): boolean;
  metti(c: Clip, on: boolean, p: Project): void;
}

/**
 * Un effetto al volo che si somma agli altri: si segna in fx.effetti e il ritocco lo fa il compositore
 * (src/core/effettiClip.ts). vecchio/spegniVecchio: i progetti di prima, dove l'effetto cambiava i valori a mano.
 */
const somma = (id: string, nome: string, info: string, vecchio?: (c: Clip) => boolean, spegniVecchio?: (c: Clip) => void): Effetto => ({
  id, nome, info, per: 'video', anteprima: 'fx-' + id,
  acceso: (c) => !!c.fx.effetti?.includes(id) || !!vecchio?.(c),
  metti: (c, on) => {
    const lista = (c.fx.effetti ?? []).filter((x) => x !== id);
    if (on) lista.push(id);
    else if (vecchio?.(c)) spegniVecchio?.(c);
    c.fx.effetti = lista.length ? lista : undefined;
  },
});
const look = (id: string, nome: string, info: string, l: Look) => somma(id, nome, info, (c) => c.fx.look === l, (c) => { c.fx.look = 'none'; });

const secondo = (p: Project) => Math.round(fps(p.rate));

/** il volume per portare la clip a un livello comodo: il 95° percentile dei picchi a −9 dBFS, senza superare −1 */
export function volumeLivellato(p: Project, c: Clip): number | null {
  const r = c.media ? mediaRT(c.media) : undefined;
  if (!r?.peaks || r.peaksDone < r.peaks.length * 0.98) return null;
  const a = Math.max(0, Math.floor(c.srcIn * PEAKS_PER_SEC));
  const b = Math.min(r.peaks.length, Math.ceil((c.srcIn + (c.len / fps(p.rate)) * c.speed) * PEAKS_PER_SEC));
  if (b - a < 5) return null;
  const v = Array.from(r.peaks.subarray(a, b)).sort((x, y) => x - y);
  const p95 = v[Math.floor(v.length * 0.95)], max = v[v.length - 1];
  if (max < 1e-4) return null;
  const g = Math.min(-9 - gainToDb(p95), -1 - gainToDb(max));
  return Math.round(Math.max(-20, Math.min(18, g)) * 2) / 2;
}

export const EFFETTI_VIDEO: Effetto[] = [
  {
    id: 'auto', nome: 'Colore automatico', info: 'livelli, bianco e luce sistemati da soli', per: 'video', anteprima: 'fx-auto',
    acceso: (c, p) => autoColore(p, c),
    metti: (c, on, p) => { c.fx.auto = on === masterDi(p).auto ? undefined : on; },
  },
  somma('vivace', 'Vivace', 'colori più pieni', (c) => c.fx.sat >= 1.25, (c) => { c.fx.sat = 1; c.fx.contrast = 1; }),
  somma('luminoso', 'Più luce', 'schiarisce le riprese buie', (c) => c.fx.bright >= 0.06, (c) => { c.fx.bright = 0; c.fx.contrast = 1; }),
  somma('caldo', 'Caldo', 'luce calda da tramonto', (c) => (c.fx.temp ?? 0) > 0.1, (c) => { c.fx.temp = 0; }),
  somma('freddo', 'Freddo', 'luce fredda e pulita', (c) => (c.fx.temp ?? 0) < -0.1, (c) => { c.fx.temp = 0; }),
  somma('pop', 'Pop', 'colori a palla, contrasto deciso'),
  somma('contrasto', 'Contrasto forte', 'neri profondi, bianchi brillanti'),
  somma('cinema', 'Cinema', 'il colore dei film, bordi scuri'),
  somma('tramonto', 'Tramonto', 'tutto arancio e oro'),
  somma('notte', 'Notte', 'blu scuro, come girato di notte'),
  somma('gelo', 'Gelo', 'freddo e pallido'),
  somma('sbiadito', 'Sbiadito', 'la foto vecchia, colori stanchi'),
  somma('sogno', 'Sogno', 'morbido e luminoso'),
  look('bn', 'Bianco e nero', 'toglie il colore', 'bn'),
  look('seppia', 'Seppia', 'la foto della nonna', 'seppia'),
  look('pellicola', 'Pellicola', 'grana e vignetta', 'film'),
  look('vhs', 'VHS', 'la cassetta del matrimonio', 'vhs'),
  look('crt', 'Tubo catodico', 'il vecchio televisore', 'crt'),
  somma('vignetta', 'Vignetta', 'bordi più scuri, sguardo al centro', (c) => (c.fx.vignette ?? 0) > 0.05, (c) => { c.fx.vignette = 0; }),
  somma('zoom', 'Zoom lento', 'si avvicina piano (Ken Burns)', (c) => (c.fx.zoom ?? 0) > 0.01, (c) => { c.fx.zoom = 0; }),
  somma('specchia', 'Specchia', 'gira l\'immagine da destra a sinistra', (c) => !!c.fx.mirror, (c) => { c.fx.mirror = undefined; }),
  {
    id: 'dissolvi', nome: 'Entra ed esce', info: 'dal nero e nel nero, mezzo secondo', per: 'video', anteprima: 'fx-dissolvi',
    acceso: (c) => c.fadeIn > 0 && c.fadeOut > 0,
    metti: (c, on, p) => { const n = on ? Math.min(Math.round(secondo(p) / 2), Math.floor(c.len / 2)) : 0; c.fadeIn = n; c.fadeOut = n; },
  },
];

export const EFFETTI_AUDIO: Effetto[] = [
  {
    id: 'livella', nome: 'Livella il volume', info: 'porta la clip a un livello giusto', per: 'audio', anteprima: 'fx-livella',
    acceso: (c) => c.afx?.norm !== undefined,
    metti: (c, on, p) => {
      if (!on) { if (c.afx?.norm !== undefined) { c.gain = c.afx.norm; delete c.afx.norm; } return; }
      const g = volumeLivellato(p, c);
      if (g === null) { avviso('La forma d\'onda non è ancora pronta: riprova fra un attimo', 'info'); return; }
      c.afx = { ...c.afx, norm: c.gain };
      c.gain = g;
      c.gainKeys = [];
    },
  },
  {
    id: 'voce', nome: 'Voce chiara', info: 'toglie il rimbombo, alza la presenza', per: 'audio', anteprima: 'fx-voce',
    acceso: (c) => !!c.afx?.voce,
    metti: (c, on) => { c.afx = { ...c.afx, voce: on || undefined }; },
  },
  {
    id: 'bassi', nome: 'Taglia bassi', info: 'via vento e ronzii', per: 'audio', anteprima: 'fx-bassi',
    acceso: (c) => !!c.afx?.bassi,
    metti: (c, on) => { c.afx = { ...c.afx, bassi: on || undefined }; },
  },
  {
    id: 'radio', nome: 'Radio / telefono', info: 'la voce che esce da un altoparlante', per: 'audio', anteprima: 'fx-radio',
    acceso: (c) => !!c.afx?.radio,
    metti: (c, on) => { c.afx = { ...c.afx, radio: on || undefined }; },
  },
  {
    id: 'fadeIn', nome: 'Fade in', info: 'entra piano dal silenzio', per: 'audio', anteprima: 'fx-fade-in',
    acceso: (c) => c.fadeIn > 0,
    metti: (c, on, p) => { c.fadeIn = on ? Math.min(durataDissolvenza(p, c), c.len - c.fadeOut) : 0; },
  },
  {
    id: 'fadeOut', nome: 'Fade out', info: 'esce piano nel silenzio', per: 'audio', anteprima: 'fx-fade-out',
    acceso: (c) => c.fadeOut > 0,
    metti: (c, on, p) => { c.fadeOut = on ? Math.min(durataDissolvenza(p, c), c.len - c.fadeIn) : 0; },
  },
  {
    id: 'incrocio', nome: 'Incrocio', info: 'sul taglio fra due audio: una sfuma nell\'altra', per: 'audio', anteprima: 'fx-incrocio',
    acceso: (c) => !!c.trIn,
    metti: (c, on, p) => { c.trIn = on ? newTransition('mix', durataDissolvenza(p, c)) : undefined; },
  },
  {
    id: 'robot', nome: 'Robot', info: 'la voce metallica di un robot', per: 'audio', anteprima: 'fx-robot',
    acceso: (c) => !!c.afx?.robot,
    metti: (c, on) => { c.afx = { ...c.afx, robot: on || undefined }; },
  },
  {
    id: 'ovattato', nome: 'Ovattato', info: 'dalla stanza accanto, sott\'acqua', per: 'audio', anteprima: 'fx-ovattato',
    acceso: (c) => !!c.afx?.ovattato,
    metti: (c, on) => { c.afx = { ...c.afx, ovattato: on || undefined }; },
  },
  {
    id: 'dissolviAudio', nome: 'Entra ed esce piano', info: 'dissolvenza di mezzo secondo', per: 'audio', anteprima: 'fx-dissolvi',
    acceso: (c) => c.fadeIn > 0 && c.fadeOut > 0,
    metti: (c, on, p) => { const n = on ? Math.min(Math.round(secondo(p) / 2), Math.floor(c.len / 2)) : 0; c.fadeIn = n; c.fadeOut = n; },
  },
];

export const EFFETTI = [...EFFETTI_VIDEO, ...EFFETTI_AUDIO];
export const effetto = (id: string) => EFFETTI.find((e) => e.id === id);

/** le clip a cui un effetto si può mettere */
export const adatte = (e: Effetto, cs: Clip[]) => cs.filter((c) => c.kind !== 'fx' && (e.per === 'video' ? isVideoClip(c) : !isVideoClip(c)) && (e.id !== 'auto' || c.kind === 'media') && (e.id !== 'livella' || c.kind === 'media'));

/**
 * Accende o spegne un effetto sulle clip (se è acceso su tutte si spegne, altrimenti si accende).
 * Ritorna quante clip ha toccato.
 */
export function alternaEffetto(id: string, ids: Iterable<string>): number {
  const e = effetto(id);
  if (!e) return 0;
  const set = new Set(ids);
  const cs = adatte(e, store.doc.clips.filter((c) => set.has(c.id)));
  if (!cs.length) {
    avviso(e.per === 'video' ? 'Questo effetto va su una clip video' : 'Questo effetto va su una clip audio', 'info');
    return 0;
  }
  const on = !cs.every((c) => e.acceso(c, store.doc));
  store.edit(`${e.nome} ${on ? 'acceso' : 'spento'}`, (p) => { for (const c of p.clips) if (cs.some((x) => x.id === c.id)) e.metti(c, on, p); });
  avviso(`${on ? '✨' : '○'} ${e.nome} ${on ? 'acceso' : 'spento'}${cs.length > 1 ? ` su ${cs.length} clip` : ''}`, 'tasto', 1200);
  return cs.length;
}

/** gli effetti accesi su una clip (per i puntini sulla clip) */
export function effettiAccesi(c: Clip, p: Project): Effetto[] {
  const lista = isVideoClip(c) ? EFFETTI_VIDEO : EFFETTI_AUDIO;
  // le dissolvenze si vedono già disegnate sulla clip: niente puntino
  return lista.filter((e) => e.id !== 'auto' && e.id !== 'fadeIn' && e.id !== 'fadeOut' && e.id !== 'incrocio' && e.acceso(c, p));
}

export { dbToGain };
