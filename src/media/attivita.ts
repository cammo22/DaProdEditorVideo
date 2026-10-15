// Il centro attività: tutto quello che il programma fa dietro le quinte (riaprire i file, forme d'onda, colore,
// copie leggere, conversioni, sottotitoli e voce con l'AI…) passa da qui. Serve a due cose:
//  · si vede sempre cosa sta succedendo e quanto manca (la barra in basso a destra, e il pannello col clic);
//  · i lavori pesanti non partono tutti insieme: stanno in code a corsie con una priorità (prima quello che è già
//    in timeline), così l'interfaccia resta fluida anche riaprendo un progetto con centinaia di file.
// Le attività dello stesso tipo si raccolgono in una riga sola ("Forme d'onda: 23 di 60"), con una barra sola.
import { Stima } from '../core/stima';

export type Categoria = 'file' | 'analisi' | 'proxy' | 'conversione' | 'ai' | 'esporta' | 'altro';
export type StatoAttivita = 'coda' | 'lavoro' | 'finita' | 'errore' | 'annullata';
export type Corsia = 'leggero' | 'pesante';

/** una riga del centro attività (una cosa sola, o un gruppo di cose dello stesso tipo) */
export interface Attivita {
  readonly id: number;
  titolo: string;
  dettaglio: string;
  categoria: Categoria;
  stato: StatoAttivita;
  /** 0..1, o null se non si può dire (indeterminata) */
  k: number | null;
  creata: number;
  /** quando ha cominciato a lavorare (ms) */
  inizio: number;
  /** quando ha finito (ms) */
  fine: number;
  /** come è finita: "60 file in 4 min 45 s", l'errore… */
  messaggio: string;
  /** come è finita, senza il tempo ("60 file", "") */
  esito: string;
  /** quanto ci ha messo, in secondi (da quando ha cominciato a lavorare), fisso una volta finita */
  durata: number;
  /** a che ora è finita (Date.now): l'ora si scrive una volta, non è un "x fa" che cammina */
  finitaAlle: number;
  /** per i gruppi: quante cose ci sono e quante sono fatte */
  totale: number;
  fatte: number;
  /** quanti pezzi stanno lavorando adesso (gli altri aspettano il loro turno) */
  attivi: number;
  errori: number;
  stima: Stima;
  /** si può fermare (il pulsante ✕) */
  annullabile: boolean;
  gruppo?: string;
}

/** la maniglia che chi lavora tiene in mano: dice a che punto è */
export class Lavoro {
  readonly segnale: AbortSignal;
  /** quanto è avanti questo pezzo (dentro il suo gruppo) */
  k: number | null = null;
  private chiuso = false;
  private ultimo = 0;
  /** ha cominciato a lavorare (non è più in coda) */
  avviato = false;
  constructor(readonly riga: Attivita, private ctrl: AbortController, private suFine: (l: Lavoro, stato: StatoAttivita, msg: string) => void, private suCambio: (l: Lavoro) => void) {
    this.segnale = ctrl.signal;
  }

  /** a che punto è (0..1, o null se non si sa) e, se serve, cosa sta facendo adesso */
  imposta(k: number | null, dettaglio?: string) {
    if (this.chiuso) return;
    this.k = k === null ? null : Math.max(0, Math.min(1, k));
    if (dettaglio !== undefined) this.riga.dettaglio = dettaglio;
    // chi lavora può chiamare a ogni fotogramma: i conti e l'avviso si fanno al massimo ogni 100 ms
    const t = adesso();
    if (t - this.ultimo < 100 && dettaglio === undefined) return;
    this.ultimo = t;
    this.suCambio(this);
    avvisa();
  }
  get attivo() { return !this.chiuso; }
  get fermato() { return this.segnale.aborted; }
  fine(msg = '') { this.chiudi('finita', msg); }
  errore(msg: string) { this.chiudi('errore', msg); }
  annullata(msg = 'annullata') { this.chiudi('annullata', msg); }
  private chiudi(stato: StatoAttivita, msg: string) {
    if (this.chiuso) return;
    this.chiuso = true;
    if (stato === 'finita') this.k = 1;
    this.suFine(this, stato, msg);
  }
  /** per chi la ferma da fuori (il pulsante ✕) */
  ferma() { this.ctrl.abort(); }
}

const adesso = () => performance.now();
let prossimo = 1;
/** le righe in coda o al lavoro */
const righe: Attivita[] = [];
/** le ultime finite, per vederle ancora un poco */
const storico: Attivita[] = [];
const STORICO_MAX = 12;
const lavoriDi = new Map<number, Set<Lavoro>>();
const annullaDi = new Map<number, () => void>();

// ——— chi ascolta (la barra e il pannello): avvisi al massimo ogni 150 ms ———
const ascoltatori = new Set<() => void>();
let programmato = 0;
function avvisa() {
  if (programmato) return;
  programmato = window.setTimeout(() => { programmato = 0; for (const f of ascoltatori) f(); }, 150);
}
export const quandoAttivita = (fn: () => void) => { ascoltatori.add(fn); return () => ascoltatori.delete(fn); };
/** subito, senza aspettare (per le prove) */
export const avvisaOra = () => { clearTimeout(programmato); programmato = 0; for (const f of ascoltatori) f(); };

export const attivitaInCorso = (): readonly Attivita[] => righe;
export const attivitaFinite = (): readonly Attivita[] => storico;

function creaRiga(o: { titolo: string; categoria: Categoria; dettaglio?: string; gruppo?: string; annullabile?: boolean }): Attivita {
  const t = adesso();
  return {
    id: prossimo++, titolo: o.titolo, dettaglio: o.dettaglio ?? '', categoria: o.categoria, stato: 'coda', k: null,
    creata: t, inizio: 0, fine: 0, messaggio: '', esito: '', durata: 0, finitaAlle: 0, totale: 0, fatte: 0, attivi: 0, errori: 0, stima: new Stima(), annullabile: o.annullabile ?? true, gruppo: o.gruppo,
  };
}

/** la riga di un gruppo (se c'è già una in corso la usa, se no ne apre una) */
function rigaDi(o: { titolo: string; categoria: Categoria; dettaglio?: string; gruppo?: string; annullabile?: boolean }): Attivita {
  if (o.gruppo) {
    const r = righe.find((x) => x.gruppo === o.gruppo);
    if (r) return r;
  }
  const r = creaRiga(o);
  righe.push(r);
  lavoriDi.set(r.id, new Set());
  return r;
}

function ricalcola(r: Attivita) {
  const lavori = lavoriDi.get(r.id);
  let somma = r.fatte;
  let indet = 0;
  let attivi = 0;
  if (lavori) for (const l of lavori) { if (l.avviato) attivi++; if (l.k === null) indet++; else somma += l.k; }
  r.attivi = attivi;
  r.k = r.totale ? Math.min(1, somma / r.totale) : null;
  // tutti indeterminati e niente di finito: la barra resta "in attesa"
  if (indet && indet === (lavori?.size ?? 0) && !r.fatte && r.totale === 1) r.k = null;
  if (r.k !== null) r.stima.registra(r.k);
}

function chiudiRiga(r: Attivita, stato: StatoAttivita, msg: string, esito = msg) {
  r.stato = stato;
  r.fine = adesso();
  r.messaggio = msg;
  r.esito = esito;
  r.durata = Math.max(0, (r.fine - (r.inizio || r.creata)) / 1000);
  r.finitaAlle = Date.now();
  r.k = stato === 'finita' ? 1 : r.k;
  const i = righe.indexOf(r);
  if (i >= 0) righe.splice(i, 1);
  lavoriDi.delete(r.id);
  annullaDi.delete(r.id);
  storico.unshift(r);
  while (storico.length > STORICO_MAX) storico.pop();
  avvisa();
}

function fineLavoro(l: Lavoro, stato: StatoAttivita, msg: string) {
  const r = l.riga;
  lavoriDi.get(r.id)?.delete(l);
  r.fatte++;
  if (stato === 'errore') { r.errori++; r.messaggio = msg; }
  ricalcola(r);
  if (r.fatte >= r.totale) {
    const durata = (adesso() - (r.inizio || r.creata)) / 1000;
    const tempo = durata < 60 ? `${Math.round(durata)} s` : `${Math.floor(durata / 60)} min ${String(Math.round(durata % 60)).padStart(2, '0')} s`;
    if (stato === 'annullata' && r.fatte === r.errori + 1 && r.totale === 1) chiudiRiga(r, 'annullata', 'annullata');
    else if (r.errori && r.errori === r.totale) chiudiRiga(r, 'errore', msg || 'non riuscito');
    else {
      const sbagliati = r.errori ? ` · ${r.errori} non riusciti` : '';
      const esito = (r.totale > 1 ? `${r.totale} elementi` : msg && stato === 'finita' ? msg : '') + sbagliati;
      chiudiRiga(r, 'finita', (r.totale > 1 ? `${r.totale} in ${tempo}` : msg && stato === 'finita' ? `${msg} in ${tempo}` : `finito in ${tempo}`) + sbagliati, esito.replace(/^ · /, ''));
    }
  }
  avvisa();
}

// ——— attività "a mano": chi lavora dice a che punto è ———
export interface OpzioniAttivita {
  titolo: string;
  categoria: Categoria;
  dettaglio?: string;
  /** il pezzo di lavoro dice a che punto è; con un gruppo, tutti i pezzi dello stesso gruppo stanno in una riga sola */
  gruppo?: string;
  /** chiamata quando si preme ✕ (oltre a fermare il segnale) */
  alAnnulla?: () => void;
  annullabile?: boolean;
}

function nuovoLavoro(o: OpzioniAttivita, comincia: boolean): Lavoro {
  const r = rigaDi(o);
  r.totale++;
  const ctrl = new AbortController();
  const l: Lavoro = new Lavoro(r, ctrl, fineLavoro, (x) => ricalcola(x.riga));
  lavoriDi.get(r.id)!.add(l);
  if (!r.annullabile) r.annullabile = false;
  if (o.annullabile === false) r.annullabile = false;
  if (o.alAnnulla) { const prima = annullaDi.get(r.id); annullaDi.set(r.id, () => { prima?.(); o.alAnnulla!(); }); }
  if (comincia) avviaLavoro(l);
  ricalcola(r);
  avvisa();
  return l;
}

function avviaLavoro(l: Lavoro) {
  const r = l.riga;
  l.avviato = true;
  if (r.stato === 'coda') { r.stato = 'lavoro'; r.inizio = adesso(); r.stima = new Stima(); }
  ricalcola(r);
}

/** una cosa che lavora già (le barre di sottotitoli, voce, traduzione…) */
export function nuova(o: OpzioniAttivita): Lavoro { return nuovoLavoro(o, true); }

/** ferma una riga (il pulsante ✕ del pannello): i pezzi in coda spariscono, quelli al lavoro ricevono il segnale */
export function fermaRiga(id: number) {
  const r = righe.find((x) => x.id === id);
  if (!r) return;
  r.dettaglio = 'annullo…';
  for (const corsia of Object.values(corsie)) {
    for (const v of [...corsia.coda]) if (v.lavoro.riga === r) { corsia.coda.splice(corsia.coda.indexOf(v), 1); v.lavoro.annullata(); v.risolvi(null); }
  }
  for (const l of [...(lavoriDi.get(id) ?? [])]) l.ferma();
  annullaDi.get(id)?.();
  avvisa();
}

// ——— la coda a corsie ———
interface Voce { lavoro: Lavoro; priorita: () => number; fn: (l: Lavoro) => Promise<unknown>; risolvi: (x: unknown) => void; ordine: number }
const corsie: Record<Corsia, { max: number; attivi: number; coda: Voce[] }> = {
  // quasi tutto: forme d'onda, colore, locandine
  leggero: { max: 2, attivi: 0, coda: [] },
  // copie leggere, conversioni, AI sull'audio: usano il codificatore (che sulle schede video fa più sessioni insieme)
  pesante: { max: 1, attivi: 0, coda: [] },
};
let ordine = 0;
let pausaUtente = false;
let pausaRiproduzione = false;

// ——— quanti lavori insieme: dipende dal computer, e dal pulsante "Sovraccarica" ———
const processori = () => (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
/** di norma: sui computer con 8 processori o più si lavora a due a due (il processore non resta mai a metà) */
export const limitiNormali = (n = processori()): Record<Corsia, number> => ({ leggero: n >= 8 ? 3 : 2, pesante: n >= 8 ? 2 : 1 });
/** con "Sovraccarica": quasi tutto il computer lavora per le conversioni */
export const limitiForti = (n = processori()): Record<Corsia, number> => ({ leggero: Math.min(8, Math.max(3, n - 1)), pesante: Math.min(4, Math.max(2, Math.floor(n / 3))) });
let sovraccarico = false;
let limiteProva: Record<Corsia, number> | null = null;
const limite = (c: Corsia) => (limiteProva ?? (sovraccarico ? limitiForti() : limitiNormali()))[c];
export const inSovraccarico = () => sovraccarico;
/** il pulsante Sovraccarica del Centro attività: più lavori insieme, e i lavori pesanti non aspettano nemmeno il montaggio che suona.
 *  Si spegne da solo quando non c'è più niente da fare. */
export function sovraccarica(on: boolean, daSolo = false) {
  if (sovraccarico === on) return;
  sovraccarico = on;
  pompa();
  avvisa();
  try { document.dispatchEvent(new CustomEvent('dpv:sovraccarico', { detail: { on, daSolo } })); } catch { /* niente pagina */ }
}
/** per le prove: limiti fissi (null = quelli veri) */
export function impostaLimiti(l: Record<Corsia, number> | null) { limiteProva = l; pompa(); }

export const inPausa = () => pausaUtente;
/** i lavori pesanti aspettano perché il montaggio sta suonando */
export const inAttesaPerRiproduzione = () => pausaRiproduzione;
/** il pulsante "metti in pausa" del pannello: non partono lavori nuovi (quelli al lavoro finiscono) */
export function pausaLavori(on: boolean) { pausaUtente = on; if (!on) pompa(); avvisa(); }
/** il montaggio suona: la corsia pesante aspetta (quella leggera può andare, ma i lavori brevi cedono il passo) */
export function pausaPerRiproduzione(on: boolean) { pausaRiproduzione = on; if (!on) pompa(); }

function fermaCorsia(c: Corsia) { return pausaUtente || (c === 'pesante' && pausaRiproduzione && !sovraccarico); }

function pompa() {
  for (const nome of Object.keys(corsie) as Corsia[]) {
    const c = corsie[nome];
    while (c.attivi < limite(nome) && c.coda.length && !fermaCorsia(nome)) {
      // il più importante, e a parità il più vecchio
      let mi = 0, mp = -Infinity;
      for (let i = 0; i < c.coda.length; i++) {
        const p = c.coda[i].priorita();
        if (p > mp || (p === mp && c.coda[i].ordine < c.coda[mi].ordine)) { mp = p; mi = i; }
      }
      const v = c.coda.splice(mi, 1)[0];
      c.attivi++;
      avviaLavoro(v.lavoro);
      void esegui(nome, v);
    }
  }
}

async function esegui(nome: Corsia, v: Voce) {
  const l = v.lavoro;
  try {
    if (l.fermato) { l.annullata(); v.risolvi(null); return; }
    const x = await v.fn(l);
    if (l.attivo) l.fine();
    v.risolvi(x ?? null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (l.fermato || msg === 'fermato') l.annullata(); else l.errore(msg);
    v.risolvi(null);
  } finally {
    corsie[nome].attivi--;
    // una pausa per respirare: l'interfaccia ridisegna prima del lavoro dopo
    setTimeout(pompa, 0);
    // finito tutto: il Sovraccarica si spegne da solo
    if (sovraccarico) setTimeout(() => { if (sovraccarico && !righe.length && !Object.values(corsie).some((x) => x.attivi || x.coda.length)) sovraccarica(false, true); }, 800);
  }
}

export interface OpzioniCoda extends OpzioniAttivita {
  corsia: Corsia;
  /** più alta = prima; può essere una funzione (si rilegge a ogni turno: un file che entra in timeline passa avanti) */
  priorita?: number | (() => number);
}

/**
 * Mette un lavoro in coda. Ritorna quello che il lavoro ritorna, o null se è stato fermato o è andato male.
 * Se è già al lavoro troppa roba, aspetta il suo turno (prima chi ha la priorità più alta).
 */
export function inCoda<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>): Promise<T | null> {
  return new Promise((risolvi) => {
    const lavoro = nuovoLavoro(o, false);
    const p = o.priorita ?? 0;
    corsie[o.corsia].coda.push({ lavoro, priorita: typeof p === 'function' ? p : () => p, fn: fn as (l: Lavoro) => Promise<unknown>, risolvi: risolvi as (x: unknown) => void, ordine: ordine++ });
    pompa();
  });
}

// ——— il riassunto per la barra ———
export interface Riassunto {
  /** righe in coda o al lavoro */
  righe: number;
  inCorso: number;
  inCoda: number;
  /** 0..1 su tutto (null se non c'è niente) */
  k: number | null;
  /** secondi che mancano (il più lontano fra quelli che si sa), o null */
  restante: number | null;
  /** cosa sta facendo di più importante */
  principale: Attivita | null;
  inPausa: boolean;
}

export function riassunto(): Riassunto {
  const lista = righe;
  if (!lista.length) return { righe: 0, inCorso: 0, inCoda: 0, k: null, restante: null, principale: null, inPausa: pausaUtente };
  let somma = 0, n = 0, rest: number | null = null, principale: Attivita | null = null;
  for (const r of lista) {
    if (r.k !== null) { somma += r.k; n++; } else n++;
    const t = r.stima.restante();
    if (t !== null && (rest === null || t > rest)) rest = t;
    if (r.stato === 'lavoro' && (!principale || r.creata < principale.creata)) principale = r;
  }
  const inCorso = lista.filter((r) => r.stato === 'lavoro').length;
  return { righe: lista.length, inCorso, inCoda: lista.length - inCorso, k: n ? somma / n : null, restante: rest, principale: principale ?? lista[0], inPausa: pausaUtente };
}

/** togli le finite dall'elenco (il pulsante "pulisci") */
export function puliscoFinite() { storico.length = 0; avvisa(); }

/** solo per le prove: azzera tutto */
export function azzeraAttivita() {
  for (const r of [...righe]) fermaRiga(r.id);
  righe.length = 0; storico.length = 0; lavoriDi.clear(); annullaDi.clear();
  for (const c of Object.values(corsie)) { c.coda.length = 0; c.attivi = 0; }
  pausaUtente = false; pausaRiproduzione = false; sovraccarico = false; limiteProva = null;
  avvisa();
}
