// Il volume del montaggio, misurato davvero: si rende il mixaggio del progetto (lo stesso dell'export, con il volume
// finale e il limitatore) a pezzi da 10 secondi e lo si dà a un Worker che fa la misura BS.1770 (src/core/loudness.ts).
// Non parte mai da solo su montaggi lunghi: `misuraAutomatica` dice se vale la pena farla senza che si chieda.
import type { Project } from '../core/tipi';
import { firmaAudio, type RisultatoLoudness } from '../core/loudness';
import { projectEnd } from '../core/progetto';
import { f2s } from '../core/timecode';
import { nuova } from './attivita';
import { mixaggio } from './audio';

/** sotto questa durata (secondi) la misura parte da sola quando si guarda il Finale; sopra si chiede con il tasto */
export const AUTOMATICA_FINO_A = 6 * 60;

export interface Tratto { da: number; a: number }

/** il tratto in secondi che l'export renderebbe: tutto, o da attacco a stacco */
export function trattoDa(p: Project, soloInOut: boolean): Tratto {
  const usa = soloInOut && p.inF !== null && p.outF !== null && p.outF > p.inF;
  return usa ? { da: f2s(p.inF!, p.rate), a: f2s(p.outF!, p.rate) } : { da: 0, a: f2s(projectEnd(p), p.rate) };
}

/** c'è qualcosa che suona? (clip audio o video con audio, toni, blocchi con il suono) */
export function haAudio(p: Project): boolean {
  return p.clips.some((c) => c.kind === 'media' || c.kind === 'tone' || c.kind === 'beep' || !!c.sfx?.audio || !!c.fxb?.audio);
}

export type StatoMisura =
  | { tipo: 'nessuna' }
  | { tipo: 'misuro'; k: number; firma: string }
  | { tipo: 'pronta'; r: RisultatoLoudness; firma: string; tratto: Tratto }
  | { tipo: 'errore'; msg: string };

let stato: StatoMisura = { tipo: 'nessuna' };
let ultimaPronta: Extract<StatoMisura, { tipo: 'pronta' }> | null = null;
let ferma: (() => void) | null = null;
const ascoltatori = new Set<() => void>();
const avvisa = () => { for (const f of ascoltatori) f(); };

export const statoMisura = () => stato;
/** l'ultima misura finita (anche se il montaggio è cambiato dopo: la firma dice se è ancora valida) */
export const ultimaMisura = () => ultimaPronta;
export const quandoMisura = (fn: () => void) => { ascoltatori.add(fn); return () => { ascoltatori.delete(fn); }; };
export const firmaDi = (p: Project, t: Tratto) => firmaAudio({ ...p, saved: 0, created: 0, markers: [], sottotitoli: undefined }, t.da, t.a);
/** la misura finita vale per questo montaggio e questo tratto? */
export const misuraValida = (p: Project, t: Tratto) => !!ultimaPronta && ultimaPronta.firma === firmaDi(p, t);

export function fermaMisura() { ferma?.(); }

/** misura il tratto; ritorna null se è stata fermata. Una sola alla volta: una nuova ferma la vecchia. */
export async function misura(p0: Project, tratto: Tratto): Promise<RisultatoLoudness | null> {
  fermaMisura();
  const p = structuredClone(p0);
  const firma = firmaDi(p0, tratto);
  if (tratto.a - tratto.da < 0.05 || !haAudio(p)) {
    ultimaPronta = null;
    stato = { tipo: 'pronta', r: { lufs: null, picco: null, piccoCampione: null, momentaneoMax: null, durata: 0, blocchi: 0 }, firma, tratto };
    ultimaPronta = stato;
    avvisa();
    return stato.r;
  }
  const ctrl = new AbortController();
  const lav = nuova({ titolo: 'Misuro il volume del montaggio', categoria: 'analisi', alAnnulla: () => ctrl.abort() });
  ferma = () => { ctrl.abort(); };
  stato = { tipo: 'misuro', k: 0, firma };
  avvisa();
  const w = new Worker(new URL('./loudness.worker.ts', import.meta.url), { type: 'module' });
  const aspetta = <T>(tipo: string) => new Promise<T>((ok, no) => {
    w.onmessage = (e) => { if (e.data.tipo === 'errore') no(new Error(e.data.msg)); else if (e.data.tipo === tipo) ok(e.data as T); };
    w.onerror = () => no(new Error('Il lavoro in secondo piano per il volume non è partito'));
  });
  try {
    const sr = p.sampleRate || 48000;
    const attesaInizio = aspetta('pronto');
    w.postMessage({ tipo: 'inizio', sr, canali: 2 });
    await attesaInizio;
    const durata = tratto.a - tratto.da;
    let fatto = 0;
    const it = mixaggio(p, tratto.da, tratto.a);
    try {
      for await (const buf of it) {
        if (ctrl.signal.aborted) throw new Error('fermato');
        const canali = [0, 1].map((c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)).slice());
        const preso = aspetta('preso');
        w.postMessage({ tipo: 'dati', canali }, canali.map((c) => c.buffer as ArrayBuffer));
        await preso;
        fatto += buf.duration;
        const k = Math.min(0.99, fatto / durata);
        stato = { tipo: 'misuro', k, firma };
        lav.imposta(k, `${Math.round(k * 100)}%`);
        avvisa();
      }
    } finally { void it.return(undefined).catch(() => {}); }
    const fine = aspetta<{ r: RisultatoLoudness | null }>('risultato');
    w.postMessage({ tipo: 'fine' });
    const r = (await fine).r;
    if (!r) throw new Error('nessun risultato');
    stato = { tipo: 'pronta', r, firma, tratto };
    ultimaPronta = stato;
    lav.fine('fatto');
    avvisa();
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ctrl.signal.aborted || msg === 'fermato') { stato = { tipo: 'nessuna' }; lav.annullata(); }
    else { stato = { tipo: 'errore', msg }; lav.errore(msg); }
    avvisa();
    return null;
  } finally {
    w.terminate();
    ferma = null;
  }
}
