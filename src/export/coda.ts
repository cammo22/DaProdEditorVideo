// La coda delle esportazioni che lavora davvero: una dopo l'altra, con avanzamento, tempo rimasto e annulla.
// Ogni esportazione che parte ha anche la sua riga nel Centro attività (categoria «esporta»): lì si vede e si ferma
// come ogni altro lavoro, senza toccare il suo popup. L'ordine e le regole stanno in `src/core/codaExport.ts`.
import { Coda, type Voce } from '../core/codaExport';
import { Stima } from '../core/stima';
import type { Project } from '../core/tipi';
import { nuova, progettoAttuale } from '../media/attivita';
import { invoke, isTauri } from '../platform';
import { esporta, type Opzioni } from './esporta';

export interface LavoroExport {
  /** come si chiama nel Centro attività e nella lista */
  titolo: string;
  presetNome: string;
  /** "1920×1080 · 30 fps · MP4 H.264 · circa 48 MB" */
  riassunto: string;
  /** "Tutto il montaggio" o "Da 00:00:10:00 a 00:00:30:00" */
  tratto: string;
  /** il progetto com'era quando si è messo in coda: l'uscita è quella che si è vista */
  progetto: Project;
  opzioni: Omit<Opzioni, 'automatica' | 'alPercorso' | 'interna'>;
  /** chiedere dove salvare (solo se la coda era libera: se no va in Video/DaProd Video) */
  chiedi: boolean;
  /** il numero del progetto aperto quando si è messo in coda */
  generazione: number;
  // ——— come sta andando ———
  k: number;
  dettaglio: string;
  restante: number | null;
  percorso?: string;
  file?: string;
  annulla: boolean;
}

export const coda = new Coda<LavoroExport>();
const ascoltatori = new Set<() => void>();
export const quandoCoda = (fn: () => void) => { ascoltatori.add(fn); return () => { ascoltatori.delete(fn); }; };
const avvisa = () => { for (const f of ascoltatori) f(); };
const finitori = new Set<(v: Voce<LavoroExport>) => void>();
/** chiamata quando una esportazione finisce (bene, male o annullata) */
export const quandoFinita = (fn: (v: Voce<LavoroExport>) => void) => { finitori.add(fn); return () => { finitori.delete(fn); }; };

export type NuovoLavoro = Omit<LavoroExport, 'k' | 'dettaglio' | 'restante' | 'annulla' | 'generazione' | 'chiedi' | 'percorso' | 'file'>;

/** Mette un'esportazione in coda. Se la coda è libera parte subito (e chiede dove salvare, se `chiedi`). */
export function accoda(l: NuovoLavoro, chiedi: boolean): Voce<LavoroExport> {
  const libera = !coda.voci.some((v) => v.stato === 'attesa' || v.stato === 'lavoro');
  const v = coda.aggiungi({ ...l, k: 0, dettaglio: 'in coda', restante: null, annulla: false, generazione: progettoAttuale(), chiedi: chiedi && libera });
  avvisa();
  void pompa();
  return v;
}

/** ferma quella che lavora, o toglie dalla coda quella che aspetta */
export function annullaVoce(id: number) {
  const v = coda.voce(id);
  if (!v) return;
  if (v.stato === 'attesa') { coda.segna(id, 'annullata', 'tolta dalla coda'); avvisa(); }
  else if (v.stato === 'lavoro') { v.dato.annulla = true; v.dato.dettaglio = 'annullo…'; avvisa(); }
}

export function spostaVoce(id: number, verso: -1 | 1) { if (coda.sposta(id, verso)) avvisa(); }
export function togliVoce(id: number) { if (coda.togli(id)) avvisa(); }
export function pulisciFinite() { if (coda.pulisciFinite()) avvisa(); }

/** apre la cartella dove sta il file (solo nell'app) */
export async function mostraNellaCartella(percorso: string) {
  if (isTauri) await invoke('mostra_nella_cartella', { path: percorso }).catch(() => {});
}

let corre = false;

async function pompa() {
  if (corre) return;
  corre = true;
  try {
    for (let v = coda.prossimo(); v; v = coda.prossimo()) await esegui(v);
  } finally { corre = false; }
}

async function esegui(v: Voce<LavoroExport>) {
  const d = v.dato;
  coda.segna(v.id, 'lavoro');
  d.dettaglio = 'comincio…';
  avvisa();
  if (d.generazione !== progettoAttuale()) {
    coda.segna(v.id, 'errore', 'Hai cambiato progetto: rimettila in coda dal progetto giusto');
    d.dettaglio = 'progetto cambiato';
    avvisa();
    return;
  }
  const stima = new Stima();
  const lav = nuova({ titolo: d.titolo, categoria: 'esporta', alAnnulla: () => { d.annulla = true; } });
  try {
    const file = await esporta(d.progetto, {
      ...d.opzioni,
      automatica: !d.chiedi,
      alPercorso: (p) => { d.percorso = p; },
    }, (a) => {
      // il video e l'audio avanzano insieme; la chiusura del file è l'ultimo pezzetto
      const k = a.fase === 'chiusura' ? 0.99 : Math.min(0.98, a.totale ? (a.fatti / a.totale) * 0.98 : 0);
      stima.registra(k);
      d.k = k;
      d.restante = stima.restante();
      d.dettaglio = a.fase === 'video' ? `${Math.round(k * 100)}%${a.fpsResa > 0 ? ` · ${a.fpsResa.toFixed(0)} fps` : ''}` : a.fase === 'audio' ? 'audio…' : 'chiudo il file…';
      lav.imposta(k, d.dettaglio);
      avvisa();
    }, () => d.annulla);
    if (file) {
      d.k = 1; d.file = file; d.restante = 0; d.dettaglio = 'fatta';
      coda.segna(v.id, 'fatta', file);
      lav.fine(file);
    } else {
      coda.segna(v.id, 'annullata', d.annulla ? 'annullata' : 'non hai scelto dove salvare');
      d.dettaglio = 'annullata';
      lav.annullata();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    coda.segna(v.id, 'errore', msg);
    d.dettaglio = 'non riuscita';
    lav.errore(msg);
  }
  avvisa();
  for (const f of finitori) f(v);
}
