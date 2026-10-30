// Le scelte dell'uscita (destinazione, formato, qualità, volume…): valgono per tutti i pannelli aperti (la pagina Finale
// e la finestra Esporta) e per le misure sotto il monitor del Finale, che devono dire «USCITA 1920×1080» senza sapere
// niente dei pannelli. Chi cambia una scelta chiama `avvisaScelte()`; chi la mostra si iscrive con `quandoScelte`.
import { store } from '../core/store';
import { projectEnd } from '../core/progetto';
import { fps } from '../core/timecode';
import {
  CODEC_DI, impostazioni, presetDi, traguardoLufs,
  type Adatta, type CodecVideo, type Contenitore, type Impostazioni, type Preset, type Scelte,
} from '../core/esportazione';

export const S = {
  preset: 'yt1080',
  formato: 'mp4' as Contenitore,
  codec: null as CodecVideo | null,
  /** null = quella del preset */
  qualita: null as number | null,
  adatta: null as Adatta | null,
  misura: 'progetto',
  inOut: false,
  nome: '',
  /** porta il volume al traguardo (src/core/loudness.ts `guadagnoPer`) prima di scrivere il file */
  normalizza: false,
  /** il volume scelto a mano (LUFS); null = quello della destinazione */
  lufs: null as number | null,
};

const ascoltatori = new Set<() => void>();
export const quandoScelte = (fn: () => void) => { ascoltatori.add(fn); return () => { ascoltatori.delete(fn); }; };
export const avvisaScelte = () => { for (const f of ascoltatori) f(); };

export const scelteDi = (): Scelte => ({ preset: S.preset, codec: S.codec, formato: S.formato, qualita: S.qualita ?? undefined, adatta: S.adatta ?? undefined, misura: S.misura });
export const progettoOra = () => { const p = store.doc; return { w: p.w, h: p.h, fps: fps(p.rate) }; };

/** i fotogrammi da esportare: tutto, oppure da attacco a stacco */
export function trattoUscita() {
  const p = store.doc;
  const haInOut = p.inF !== null && p.outF !== null && p.outF > p.inF;
  const usa = S.inOut && haInOut;
  return { haInOut, usa, len: usa ? p.outF! - p.inF! : projectEnd(p) };
}

/** cosa uscirebbe, subito (senza chiedere ai codec della macchina): misura, fotogrammi e destinazione bastano a dirlo */
export function uscitaSubito(): { imp: Impostazioni; pr: Preset; traguardo: number | null } {
  const pr = presetDi(S.preset);
  const formato = pr.libero ? S.formato : pr.formato;
  const imp = impostazioni(scelteDi(), progettoOra(), CODEC_DI[formato]);
  return { imp, pr, traguardo: traguardoLufs(pr, S.normalizza, S.lufs) };
}
