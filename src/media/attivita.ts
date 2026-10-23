// Il centro attività: tutto quello che il programma fa dietro le quinte (riaprire i file, forme d'onda, colore,
// copie leggere, conversioni, sottotitoli e voce con l'AI…) passa da qui. Serve a tre cose:
//  · si vede sempre cosa sta succedendo e quanto manca (la barra in basso a destra, e il pannello col clic);
//  · i lavori pesanti non partono tutti insieme: stanno in code a corsie con una priorità (prima quello che è già
//    in timeline), così l'interfaccia resta fluida anche con centinaia di file;
//  · dalla 1.5.8 i lavori di preparazione (copie leggere, forme d'onda, colore, controllo della velocità) NON partono
//    da soli: nascono «da avviare» (stato `manuale`, con `proponi`) e partono solo quando l'utente preme Avvia.
// Le attività dello stesso tipo si raccolgono in una riga sola ("Forme d'onda: 23 di 60"), con una barra sola.
//
// Pausa, detta com'è davvero (`Capacita.pausa`):
//  · 'vera'       il lavoro si ferma subito e riparte dallo stesso punto (le conversioni di Mediabunny col pauseSignal);
//  · 'ai-confini' il lavoro si ferma fra un pezzo e il successivo (chiama `Lavoro.checkpoint()`); i pezzi fatti restano;
//  · 'no'         un flusso unico (export, clip unica): c'è solo Annulla, la Pausa non si offre.
// Un lavoro in pausa NON tiene occupata la sua corsia: intanto possono lavorare gli altri.
import { Stima } from '../core/stima';

export type Categoria = 'file' | 'analisi' | 'proxy' | 'conversione' | 'ai' | 'esporta' | 'altro';
/** manuale = pronta, aspetta Avvia · coda = avviata, aspetta il suo turno · lavoro · pausa = ferma su richiesta (non occupa la corsia) */
export type StatoAttivita = 'manuale' | 'coda' | 'lavoro' | 'pausa' | 'finita' | 'errore' | 'annullata';
export type Corsia = 'leggero' | 'pesante';
/** cosa sa fare davvero il lavoro quando si preme Pausa */
export type Pausa = 'vera' | 'ai-confini' | 'no';
export interface Capacita { pausa: Pausa; annulla: boolean; riprova: boolean }
export const CAPACITA0: Capacita = { pausa: 'no', annulla: true, riprova: true };

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
  /** cosa sa fare (Pausa vera, ai confini, o niente) */
  capacita: Capacita;
  /** l'utente ha chiesto la pausa: con 'ai-confini' lo stato resta 'lavoro' («in pausa dopo il pezzo») finché il pezzo non finisce */
  pausaRichiesta: boolean;
  /** la corsia pesante aspetta perché il montaggio suona («in attesa del monitor») */
  attesaMonitor: boolean;
  /** la chiave contro i doppioni (es. 'proxy:m12') per le righe singole */
  chiave?: string;
  /** per le righe da avviare: il media a cui si riferisce (se c'è) */
  media?: string;
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
  /** è fermo in un checkpoint (pausa vera, non solo richiesta) */
  inPausa = false;
  /** la corsia dove lavora (null per le attività «a mano» di nuova()) */
  corsia: Corsia | null = null;
  /** tiene un posto della corsia */
  haPosto = false;
  /** il progetto per cui lavora (cambiaProgetto() lo rende vecchio) */
  readonly progetto: number;
  /** @internal: chi lo sveglia dalla pausa */
  sveglia: (() => void) | null = null;
  private suPausa = new Set<() => void>();
  constructor(readonly riga: Attivita, private ctrl: AbortController, private suFine: (l: Lavoro, stato: StatoAttivita, msg: string) => void, private suCambio: (l: Lavoro) => void) {
    this.segnale = ctrl.signal;
    this.progetto = generazione;
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
  /** il risultato vale ancora: non è stato annullato e il progetto è lo stesso di quando è partito */
  get valido() { return !this.segnale.aborted && (this.resta || this.progetto === generazione); }
  /** @internal: non si annulla cambiando progetto (un export già partito) */
  resta = false;
  /** l'utente ha chiesto la pausa (chi lavora a pezzi la rispetta al prossimo checkpoint) */
  get pausaRichiesta() { return this.riga.pausaRichiesta; }
  fine(msg = '') { this.chiudi('finita', msg); }
  errore(msg: string) { this.chiudi('errore', msg); }
  annullata(msg = 'annullata') { this.chiudi('annullata', msg); }
  private chiudi(stato: StatoAttivita, msg: string) {
    if (this.chiuso) return;
    this.chiuso = true;
    if (stato === 'finita') this.k = 1;
    this.suPausa.clear();
    this.suFine(this, stato, msg);
  }
  /** per chi la ferma da fuori (il pulsante ✕) */
  ferma() { this.ctrl.abort(); this.sveglia?.(); }

  /**
   * Il punto fra un pezzo e l'altro. Se non c'è pausa ritorna subito; se l'utente ha chiesto la pausa il lavoro si ferma
   * qui (lascia libero il suo posto nella corsia) e riprende quando si preme Riprendi e c'è di nuovo posto.
   * Lancia Error('fermato') se intanto è stato annullato.
   */
  async checkpoint(): Promise<void> {
    if (this.fermato) throw new Error('fermato');
    if (!this.riga.pausaRichiesta) return;
    do {
      this.inPausa = true;
      liberaPosto(this);
      aggiornaStato(this.riga);
      avvisa();
      await new Promise<void>((ok) => {
        this.sveglia = ok;
        if (!this.riga.pausaRichiesta || this.fermato) ok();
      });
      this.sveglia = null;
      this.inPausa = false;
      if (this.fermato) { aggiornaStato(this.riga); throw new Error('fermato'); }
      await riprendiPosto(this);
      // Una seconda Pausa può arrivare mentre Riprendi aspetta una corsia occupata.
      // Prima del pezzo successivo si lascia di nuovo il posto e si aspetta, senza perdere il progresso.
    } while (this.riga.pausaRichiesta && !this.fermato);
    aggiornaStato(this.riga);
    avvisa();
    if (this.fermato) throw new Error('fermato');
  }

  /** per la pausa 'vera': chi lavora si iscrive qui per fermarsi subito (es. pauseSignal di Mediabunny). Ritorna chi lo stacca */
  allaPausa(fn: () => void): () => void {
    this.suPausa.add(fn);
    if (this.riga.pausaRichiesta) fn();
    return () => this.suPausa.delete(fn);
  }
  /** @internal */
  avvisaPausa() { for (const f of [...this.suPausa]) { try { f(); } catch { /* chi lavora se la sbriga */ } } }
}

const adesso = () => performance.now();
let prossimo = 1;
/** il progetto aperto: cambiaProgetto() la fa salire e le righe del progetto di prima si annullano */
let generazione = 1;
/** le righe in coda, al lavoro o in pausa */
const righe: Attivita[] = [];
/** le righe pronte che aspettano Avvia (non sono «in corso»: la barra non si accende per loro) */
const manuali: Attivita[] = [];
/** le ultime finite, per vederle ancora un poco */
const storico: Attivita[] = [];
const STORICO_MAX = 12;
const lavoriDi = new Map<number, Set<Lavoro>>();
const annullaDi = new Map<number, () => void>();
/** le righe che non si annullano cambiando progetto (es. un export già partito) */
const restaDopoCambio = new Set<number>();

// ——— chi ascolta (la barra e il pannello): avvisi al massimo ogni 150 ms ———
const ascoltatori = new Set<() => void>();
let programmato: ReturnType<typeof setTimeout> | 0 = 0;
function avvisa() {
  if (programmato) return;
  programmato = setTimeout(() => { programmato = 0; for (const f of ascoltatori) f(); }, 150);
}
export const quandoAttivita = (fn: () => void) => { ascoltatori.add(fn); return () => ascoltatori.delete(fn); };
/** subito, senza aspettare (per le prove) */
export const avvisaOra = () => { if (programmato) clearTimeout(programmato); programmato = 0; for (const f of ascoltatori) f(); };

/** le righe avviate: in coda, al lavoro o in pausa */
export const attivitaInCorso = (): readonly Attivita[] => righe;
export const attivitaFinite = (): readonly Attivita[] => storico;
/** le righe pronte, che partono solo con Avvia */
export const attivitaDaAvviare = (): readonly Attivita[] => manuali;
/** una riga qualunque (da avviare, in corso o finita da poco) */
export const rigaAttivita = (id: number): Attivita | undefined => righe.find((x) => x.id === id) ?? manuali.find((x) => x.id === id) ?? storico.find((x) => x.id === id);

interface OpzioniRiga { titolo: string; categoria: Categoria; dettaglio?: string; gruppo?: string; annullabile?: boolean; pausa?: Pausa; chiave?: string; media?: string }

function creaRiga(o: OpzioniRiga, stato: StatoAttivita = 'coda'): Attivita {
  const t = adesso();
  const annullabile = o.annullabile ?? true;
  return {
    id: prossimo++, titolo: o.titolo, dettaglio: o.dettaglio ?? '', categoria: o.categoria, stato, k: null,
    creata: t, inizio: 0, fine: 0, messaggio: '', esito: '', durata: 0, finitaAlle: 0, totale: 0, fatte: 0, attivi: 0, errori: 0, stima: new Stima(), annullabile, gruppo: o.gruppo,
    // una riga di gruppo raccoglie più pezzi: chiave e media valgono solo per le righe singole
    capacita: { pausa: o.pausa ?? 'no', annulla: annullabile, riprova: true }, pausaRichiesta: false, attesaMonitor: false,
    chiave: o.gruppo && stato !== 'manuale' ? undefined : o.chiave, media: o.gruppo && stato !== 'manuale' ? undefined : o.media,
  };
}

/** la riga di un gruppo (se c'è già una avviata la usa, se no ne apre una) */
function rigaDi(o: OpzioniRiga): Attivita {
  if (o.gruppo) {
    const r = righe.find((x) => x.gruppo === o.gruppo);
    if (r) {
      // un gruppo con pezzi che si fermano ai confini e altri no: la pausa vale solo quanto il più debole
      if (r.capacita.pausa !== (o.pausa ?? 'no')) r.capacita.pausa = debole(r.capacita.pausa, o.pausa ?? 'no');
      return r;
    }
  }
  const r = creaRiga(o);
  righe.push(r);
  lavoriDi.set(r.id, new Set());
  return r;
}
const ORDINE_PAUSA: Pausa[] = ['no', 'ai-confini', 'vera'];
const debole = (a: Pausa, b: Pausa): Pausa => ORDINE_PAUSA[Math.min(ORDINE_PAUSA.indexOf(a), ORDINE_PAUSA.indexOf(b))];

function ricalcola(r: Attivita) {
  const lavori = lavoriDi.get(r.id);
  let somma = r.fatte;
  let indet = 0;
  let attivi = 0;
  if (lavori) for (const l of lavori) { if (l.avviato && !l.inPausa) attivi++; if (l.k === null) indet++; else somma += l.k; }
  r.attivi = attivi;
  r.k = r.totale ? Math.min(1, somma / r.totale) : null;
  // tutti indeterminati e niente di finito: la barra resta "in attesa"
  if (indet && indet === (lavori?.size ?? 0) && !r.fatte && r.totale === 1) r.k = null;
  if (r.k !== null && r.stato === 'lavoro') r.stima.registra(r.k);
  aggiornaStato(r);
}

/** lo stato di una riga avviata, dai suoi pezzi */
function aggiornaStato(r: Attivita) {
  if (r.stato === 'manuale' || r.stato === 'finita' || r.stato === 'errore' || r.stato === 'annullata') return;
  const lavori = lavoriDi.get(r.id);
  let lavorano = 0, pesanti = 0;
  if (lavori) for (const l of lavori) { if (l.avviato && !l.inPausa) lavorano++; if (!l.avviato && l.corsia === 'pesante') pesanti++; }
  const prima = r.stato;
  if (lavorano) r.stato = 'lavoro';
  else if (r.pausaRichiesta) r.stato = 'pausa';
  else r.stato = r.inizio ? 'lavoro' : 'coda';
  r.attesaMonitor = !lavorano && !r.pausaRichiesta && pesanti > 0 && pausaRiproduzione && !sovraccarico;
  if (prima === 'pausa' && r.stato === 'lavoro') r.stima = new Stima();
}

function chiudiRiga(r: Attivita, stato: StatoAttivita, msg: string, esito = msg) {
  r.stato = stato;
  r.fine = adesso();
  r.messaggio = msg;
  r.esito = esito;
  r.durata = Math.max(0, (r.fine - (r.inizio || r.creata)) / 1000);
  r.finitaAlle = Date.now();
  r.k = stato === 'finita' ? 1 : r.k;
  r.pausaRichiesta = false;
  r.attesaMonitor = false;
  const i = righe.indexOf(r);
  if (i >= 0) righe.splice(i, 1);
  lavoriDi.delete(r.id);
  annullaDi.delete(r.id);
  restaDopoCambio.delete(r.id);
  storico.unshift(r);
  while (storico.length > STORICO_MAX) { const via = storico.pop()!; falliti.delete(via.id); }
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
  /** chiamata quando si preme ✕ (oltre a fermare il segnale): qui si butta il lavoro a metà */
  alAnnulla?: () => void;
  /** chiamata quando una riga da avviare parte (manuale → coda) */
  alAvvio?: () => void;
  annullabile?: boolean;
  /** cosa sa fare con la Pausa (di partenza 'no': niente pulsante Pausa) */
  pausa?: Pausa;
  /** contro i doppioni: un lavoro con la stessa chiave già pronto, in coda o al lavoro non se ne crea un altro */
  chiave?: string;
  /** il media a cui si riferisce (per chi disegna le righe da avviare) */
  media?: string;
  /** non si annulla cambiando progetto (di partenza: solo gli export) */
  restaDopoCambio?: boolean;
}

function nuovoLavoro(o: OpzioniAttivita, comincia: boolean, corsia: Corsia | null): Lavoro {
  const r = rigaDi(o);
  r.totale++;
  const ctrl = new AbortController();
  const l: Lavoro = new Lavoro(r, ctrl, fineLavoro, (x) => ricalcola(x.riga));
  l.corsia = corsia;
  l.resta = o.restaDopoCambio ?? o.categoria === 'esporta';
  lavoriDi.get(r.id)!.add(l);
  if (o.annullabile === false) { r.annullabile = false; r.capacita.annulla = false; }
  if (o.restaDopoCambio ?? o.categoria === 'esporta') restaDopoCambio.add(r.id);
  if (o.alAnnulla) { const prima = annullaDi.get(r.id); annullaDi.set(r.id, () => { prima?.(); o.alAnnulla!(); }); }
  if (comincia) avviaLavoro(l);
  ricalcola(r);
  avvisa();
  return l;
}

function avviaLavoro(l: Lavoro) {
  const r = l.riga;
  l.avviato = true;
  if (!r.inizio) { r.inizio = adesso(); r.stima = new Stima(); }
  ricalcola(r);
}

/** una cosa che lavora già (le barre di sottotitoli, voce, traduzione…). Non occupa una corsia */
export function nuova(o: OpzioniAttivita): Lavoro { return nuovoLavoro(o, true, null); }

/** ferma una riga (il pulsante ✕ del pannello): i pezzi in coda spariscono, quelli al lavoro (o in pausa) ricevono il segnale */
export function fermaRiga(id: number) {
  const m = manuali.find((x) => x.id === id);
  if (m) { scartaProposta(m); return; }
  const r = righe.find((x) => x.id === id);
  if (!r) return;
  r.dettaglio = 'annullo…';
  r.pausaRichiesta = false;
  for (const corsia of Object.values(corsie)) {
    for (const v of [...corsia.coda]) if (v.lavoro.riga === r) { corsia.coda.splice(corsia.coda.indexOf(v), 1); togliChiave(v.chiave); v.lavoro.annullata(); v.risolvi(null); }
  }
  for (const l of [...(lavoriDi.get(id) ?? [])]) l.ferma();
  annullaDi.get(id)?.();
  avvisa();
}
/** Annulla = ferma e butta il lavoro a metà (lo fa chi lavora, in alAnnulla o quando vede il segnale) */
export const annullaRiga = fermaRiga;

// ——— la coda a corsie ———
interface Voce { lavoro: Lavoro; priorita: () => number; fn: (l: Lavoro) => Promise<unknown>; risolvi: (x: unknown) => void; ordine: number; chiave?: string; o: OpzioniCoda }
const corsie: Record<Corsia, { max: number; attivi: number; coda: Voce[]; rientri: { lavoro: Lavoro; ok: () => void }[] }> = {
  // quasi tutto: forme d'onda, colore, locandine
  leggero: { max: 2, attivi: 0, coda: [], rientri: [] },
  // copie leggere, conversioni, AI sull'audio: usano il codificatore (che sulle schede video fa più sessioni insieme)
  pesante: { max: 1, attivi: 0, coda: [], rientri: [] },
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
  for (const r of righe) aggiornaStato(r);
  avvisa();
  try { document.dispatchEvent(new CustomEvent('dpv:sovraccarico', { detail: { on, daSolo } })); } catch { /* niente pagina */ }
}
/** per le prove: limiti fissi (null = quelli veri) */
export function impostaLimiti(l: Record<Corsia, number> | null) { limiteProva = l; pompa(); }

/** «Non avviare altro» è acceso */
export const inPausa = () => pausaUtente;
/** i lavori pesanti aspettano perché il montaggio sta suonando */
export const inAttesaPerRiproduzione = () => pausaRiproduzione;
/** «Non avviare altro» (era «metti in pausa»): non partono lavori nuovi, quelli al lavoro finiscono. La pausa vera è per riga */
export function pausaGlobale(on: boolean) { pausaUtente = on; if (!on) pompa(); avvisa(); }
/** il nome di prima di pausaGlobale (lo usa ancora il pannello) */
export const pausaLavori = pausaGlobale;
/** il montaggio suona: la corsia pesante aspetta (quella leggera può andare, ma i lavori brevi cedono il passo) */
export function pausaPerRiproduzione(on: boolean) {
  pausaRiproduzione = on;
  if (!on) pompa();
  for (const r of righe) aggiornaStato(r);
  avvisa();
}

function fermaCorsia(c: Corsia) { return pausaUtente || (c === 'pesante' && pausaRiproduzione && !sovraccarico); }

function liberaPosto(l: Lavoro) {
  if (!l.corsia || !l.haPosto) return;
  l.haPosto = false;
  corsie[l.corsia].attivi--;
  setTimeout(pompa, 0);
}
/** chi torna dalla pausa riprende il suo posto prima di chi non è ancora partito (ha già del lavoro fatto in mano) */
function riprendiPosto(l: Lavoro): Promise<void> {
  if (!l.corsia || l.haPosto) return Promise.resolve();
  return new Promise((ok) => {
    const c = corsie[l.corsia!];
    c.rientri.push({ lavoro: l, ok });
    const via = () => { const i = c.rientri.findIndex((x) => x.lavoro === l); if (i >= 0) { c.rientri.splice(i, 1); ok(); } };
    l.segnale.addEventListener('abort', via, { once: true });
    pompa();
  });
}

function pompa() {
  for (const nome of Object.keys(corsie) as Corsia[]) {
    const c = corsie[nome];
    // prima chi torna dalla pausa: l'ha chiesto l'utente (Riprendi), vale anche con «Non avviare altro»
    while (c.attivi < limite(nome) && c.rientri.length) {
      const x = c.rientri.shift()!;
      if (x.lavoro.fermato) { x.ok(); continue; }
      c.attivi++;
      x.lavoro.haPosto = true;
      x.ok();
    }
    while (c.attivi < limite(nome) && !fermaCorsia(nome)) {
      // il più importante, e a parità il più vecchio; le righe in pausa aspettano
      let mi = -1, mp = -Infinity;
      for (let i = 0; i < c.coda.length; i++) {
        if (c.coda[i].lavoro.riga.pausaRichiesta) continue;
        const p = c.coda[i].priorita();
        if (mi < 0 || p > mp || (p === mp && c.coda[i].ordine < c.coda[mi].ordine)) { mp = p; mi = i; }
      }
      if (mi < 0) break;
      const v = c.coda.splice(mi, 1)[0];
      c.attivi++;
      v.lavoro.haPosto = true;
      avviaLavoro(v.lavoro);
      void esegui(nome, v);
    }
  }
}

/** chi ha fallito, per Riprova (per riga finita in errore) */
const falliti = new Map<number, { o: OpzioniCoda; fn: (l: Lavoro) => Promise<unknown> }[]>();

async function esegui(nome: Corsia, v: Voce) {
  const l = v.lavoro;
  if (v.chiave) alLavoro.set(v.chiave, l);
  try {
    if (l.fermato) { l.annullata(); v.risolvi(null); return; }
    const x = await v.fn(l);
    // annullato o cambiato progetto mentre lavorava: il risultato arriva tardi e non si consegna
    if (!l.valido) { l.annullata(); v.risolvi(null); return; }
    if (l.attivo) l.fine();
    v.risolvi(x ?? null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (l.fermato || msg === 'fermato' || !l.valido) l.annullata();
    else {
      l.errore(msg);
      const lista = falliti.get(l.riga.id) ?? [];
      lista.push({ o: v.o, fn: v.fn });
      falliti.set(l.riga.id, lista);
    }
    v.risolvi(null);
  } finally {
    togliChiave(v.chiave);
    if (v.chiave && alLavoro.get(v.chiave) === l) alLavoro.delete(v.chiave);
    if (l.haPosto) { l.haPosto = false; corsie[nome].attivi--; }
    else { const i = corsie[nome].rientri.findIndex((x) => x.lavoro === l); if (i >= 0) corsie[nome].rientri.splice(i, 1); }
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

// ——— i doppioni: una chiave sola per lavoro pronto/in coda/al lavoro ———
interface Impegno { esito: Promise<unknown>; proposta?: Attivita }
const impegni = new Map<string, Impegno>();
function togliChiave(k?: string) { if (k) impegni.delete(k); }
/** c'è già un lavoro con questa chiave (pronto, in coda, al lavoro o in pausa)? */
export const giaInCorso = (chiave: string) => impegni.has(chiave);
/** il lavoro con questa chiave è pronto da avviare (non ancora partito) */
export const daAvviare = (chiave: string) => !!impegni.get(chiave)?.proposta;
/** i lavori al lavoro, per chiave (per fermarne uno solo dentro una riga di gruppo) */
const alLavoro = new Map<string, Lavoro>();
/**
 * Annulla SOLO il lavoro con questa chiave (anche dentro una riga di gruppo): da avviare → scartato, in coda → tolto,
 * al lavoro o in pausa → riceve il segnale. Serve quando si toglie un file dal contenitore.
 */
export function annullaChiave(chiave: string): boolean {
  const g = impegni.get(chiave);
  if (!g) return false;
  if (g.proposta) { scartaProposta(g.proposta); return true; }
  for (const corsia of Object.values(corsie)) {
    const v = corsia.coda.find((x) => x.chiave === chiave);
    if (v) { corsia.coda.splice(corsia.coda.indexOf(v), 1); togliChiave(chiave); v.lavoro.annullata(); v.o.alAnnulla?.(); v.risolvi(null); avvisa(); return true; }
  }
  const l = alLavoro.get(chiave);
  if (l) { l.ferma(); avvisa(); return true; }
  return false;
}

function accoda<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>, risolvi: (x: T | null) => void): Lavoro {
  const lavoro = nuovoLavoro(o, false, o.corsia);
  const p = o.priorita ?? 0;
  corsie[o.corsia].coda.push({ lavoro, priorita: typeof p === 'function' ? p : () => p, fn: fn as (l: Lavoro) => Promise<unknown>, risolvi: risolvi as (x: unknown) => void, ordine: ordine++, chiave: o.chiave, o });
  pompa();
  return lavoro;
}

/**
 * Mette un lavoro in coda e lo AVVIA (va usato solo per quello che l'utente ha chiesto adesso: per i lavori di preparazione
 * c'è `proponi`). Ritorna quello che il lavoro ritorna, o null se è stato fermato o è andato male.
 * Con la stessa `chiave` di un lavoro già in giro non se ne crea un altro: si aspetta quello (e se era da avviare, parte).
 */
export function inCoda<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>): Promise<T | null> {
  if (o.chiave) {
    const g = impegni.get(o.chiave);
    if (g) { if (g.proposta) avviaRiga(g.proposta.id); return g.esito as Promise<T | null>; }
  }
  const esito = new Promise<T | null>((risolvi) => accoda(o, fn, risolvi));
  if (o.chiave) impegni.set(o.chiave, { esito });
  return esito;
}

// ——— le righe da avviare ———
interface Proposta { o: OpzioniCoda; fn: (l: Lavoro) => Promise<unknown>; risolvi: (x: unknown) => void }
const proposte = new Map<number, Proposta>();

export interface Proposto<T> {
  /** la riga (stato 'manuale' finché non parte) */
  riga: Attivita;
  /** la fa partire (come avviaRiga) */
  avvia: () => void;
  /** il risultato, o null se è stata annullata/scartata o è andata male */
  esito: Promise<T | null>;
}

/**
 * Prepara un lavoro SENZA farlo partire: nasce `manuale` (in attivitaDaAvviare) e va in coda solo con avvia(),
 * avviaRiga(id) o avviaTutte(). Con una chiave già in giro ritorna quello che c'è (niente doppioni).
 */
export function proponi<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>): Proposto<T> {
  if (o.chiave) {
    const g = impegni.get(o.chiave);
    if (g) {
      const riga = g.proposta ?? righe.find((r) => r.chiave === o.chiave) ?? righe.find((r) => r.gruppo === o.gruppo) ?? creaRiga(o);
      return { riga, avvia: () => { if (g.proposta) avviaRiga(g.proposta.id); }, esito: g.esito as Promise<T | null> };
    }
  }
  const riga = creaRiga(o, 'manuale');
  riga.totale = 1;
  let risolvi!: (x: unknown) => void;
  const esito = new Promise<T | null>((ok) => { risolvi = ok as (x: unknown) => void; });
  proposte.set(riga.id, { o, fn: fn as (l: Lavoro) => Promise<unknown>, risolvi });
  manuali.push(riga);
  if (o.chiave) impegni.set(o.chiave, { esito, proposta: riga });
  avvisa();
  return { riga, avvia: () => avviaRiga(riga.id), esito };
}

function scartaProposta(r: Attivita) {
  const i = manuali.indexOf(r);
  if (i >= 0) manuali.splice(i, 1);
  const p = proposte.get(r.id);
  proposte.delete(r.id);
  togliChiave(r.chiave);
  r.stato = 'annullata';
  p?.o.alAnnulla?.();
  p?.risolvi(null);
  avvisa();
}

/** fa partire una riga da avviare (manuale → coda, nel suo gruppo). Ritorna l'id della riga dove lavora, o null */
export function avviaRiga(id: number): number | null {
  const r = manuali.find((x) => x.id === id);
  if (!r) return righe.some((x) => x.id === id) ? id : null;
  const p = proposte.get(id)!;
  manuali.splice(manuali.indexOf(r), 1);
  proposte.delete(id);
  // la chiave resta impegnata: ora vale l'esito del lavoro in coda
  if (p.o.chiave) impegni.set(p.o.chiave, { esito: impegni.get(p.o.chiave)?.esito ?? Promise.resolve(null) });
  const l = accoda(p.o, p.fn, p.risolvi);
  p.o.alAvvio?.();
  avvisa();
  return righe.includes(l.riga) ? l.riga.id : null;
}

export interface Filtro { categoria?: Categoria; gruppo?: string; media?: string[] }
const passa = (r: Attivita, f?: Filtro) => !f || ((!f.categoria || r.categoria === f.categoria) && (!f.gruppo || r.gruppo === f.gruppo) && (!f.media || (r.media !== undefined && f.media.includes(r.media))));

/** «Avvia tutti»: fa partire le righe da avviare (tutte, o di una categoria/gruppo/elenco di media). Rispetta corsie, limiti e priorità. Ritorna quante */
export function avviaTutte(filtro?: Filtro): number {
  const via = manuali.filter((r) => passa(r, filtro));
  for (const r of via) avviaRiga(r.id);
  return via.length;
}
/** scarta le righe da avviare (tutte o filtrate). Ritorna quante */
export function scartaDaAvviare(filtro?: Filtro): number {
  const via = manuali.filter((r) => passa(r, filtro));
  for (const r of via) scartaProposta(r);
  return via.length;
}

export type EsitoPausa = 'in-pausa' | 'dopo-il-pezzo' | 'non-pausabile';
/**
 * Pausa di una riga avviata. 'non-pausabile' se il lavoro non sa fermarsi (pausa 'no') o la riga non è avviata;
 * 'in-pausa' se è già ferma; 'dopo-il-pezzo' se si fermerà al prossimo checkpoint (o appena la conversione si sospende).
 * Intanto i pezzi del gruppo ancora in coda non partono e la corsia resta libera per gli altri.
 */
export function pausaRiga(id: number): EsitoPausa {
  const r = righe.find((x) => x.id === id);
  if (!r || r.capacita.pausa === 'no') return 'non-pausabile';
  r.pausaRichiesta = true;
  let lavorano = 0;
  for (const l of lavoriDi.get(id) ?? []) if (l.avviato && !l.inPausa) { lavorano++; l.avvisaPausa(); }
  aggiornaStato(r);
  avvisa();
  return lavorano ? 'dopo-il-pezzo' : 'in-pausa';
}
/** riprende una riga in pausa: i pezzi fermi ripartono dal punto dove erano, appena c'è posto nella corsia */
export function riprendiRiga(id: number) {
  const r = righe.find((x) => x.id === id);
  if (!r || !r.pausaRichiesta) return;
  r.pausaRichiesta = false;
  for (const l of lavoriDi.get(id) ?? []) l.sveglia?.();
  aggiornaStato(r);
  pompa();
  avvisa();
}
export function pausaGruppo(g: string) { for (const r of righe.filter((x) => x.gruppo === g)) pausaRiga(r.id); }
export function riprendiGruppo(g: string) { for (const r of righe.filter((x) => x.gruppo === g)) riprendiRiga(r.id); }

/** Riprova su una riga finita con errori: rimette in coda SOLO i pezzi andati male. Ritorna quanti */
export function puoRiprovare(id: number): boolean { return !!falliti.get(id)?.length; }
export function riprovaRiga(id: number): number {
  const lista = falliti.get(id);
  if (!lista?.length) return 0;
  falliti.delete(id);
  for (const x of lista) void inCoda(x.o, x.fn);
  return lista.length;
}

/**
 * Si cambia progetto (Nuovo, Apri, ripresa): tutto quello che lavorava per il progetto di prima si annulla (righe avviate e
 * da avviare), così nessun risultato arriva tardi sul progetto nuovo. Gli export già partiti restano (restaDopoCambio).
 */
export function cambiaProgetto() {
  generazione++;
  // I retry conservano closure e riferimenti ai media: non possono rinascere nel progetto nuovo.
  falliti.clear();
  for (const r of storico) if (r.categoria !== 'esporta') r.capacita.riprova = false;
  for (const r of [...manuali]) scartaProposta(r);
  for (const r of [...righe]) if (!restaDopoCambio.has(r.id)) fermaRiga(r.id);
  avvisa();
}
/** il numero del progetto aperto (per chi deve controllare da solo se un risultato è ancora buono) */
export const progettoAttuale = () => generazione;

// ——— il riassunto per la barra ———
export interface Riassunto {
  /** righe avviate (in coda, al lavoro o in pausa) */
  righe: number;
  inCorso: number;
  /** righe avviate che aspettano il loro turno */
  inCoda: number;
  /** righe ferme in pausa (su richiesta) */
  pausate: number;
  /** righe pronte da avviare */
  manuali: number;
  /** 0..1 su tutto (null se non c'è niente) */
  k: number | null;
  /** secondi che mancano (il più lontano fra quelli che si sa), o null */
  restante: number | null;
  /** cosa sta facendo di più importante */
  principale: Attivita | null;
  /** «Non avviare altro» acceso */
  inPausa: boolean;
}

export function riassunto(): Riassunto {
  const lista = righe;
  const base = { manuali: manuali.length, inPausa: pausaUtente };
  if (!lista.length) return { righe: 0, inCorso: 0, inCoda: 0, pausate: 0, k: null, restante: null, principale: null, ...base };
  let somma = 0, n = 0, rest: number | null = null, principale: Attivita | null = null;
  for (const r of lista) {
    if (r.k !== null) { somma += r.k; n++; } else n++;
    const t = r.stato === 'lavoro' ? r.stima.restante() : null;
    if (t !== null && (rest === null || t > rest)) rest = t;
    if (r.stato === 'lavoro' && (!principale || r.creata < principale.creata)) principale = r;
  }
  const inCorso = lista.filter((r) => r.stato === 'lavoro').length;
  const pausate = lista.filter((r) => r.stato === 'pausa').length;
  return { righe: lista.length, inCorso, inCoda: lista.length - inCorso - pausate, pausate, k: n ? somma / n : null, restante: rest, principale: principale ?? lista[0], ...base };
}

/** «3 in coda · 1 in pausa · 2 pronti da avviare» (vuota se non c'è niente) */
export function riassuntoTesto(r: Riassunto = riassunto()): string {
  const p: string[] = [];
  if (r.inCorso) p.push(`${r.inCorso} al lavoro`);
  if (r.inCoda) p.push(`${r.inCoda} in coda`);
  if (r.pausate) p.push(`${r.pausate} in pausa`);
  if (r.manuali) p.push(`${r.manuali} ${r.manuali === 1 ? 'pronto' : 'pronti'} da avviare`);
  return p.join(' · ');
}

/** togli le finite dall'elenco (il pulsante "pulisci") */
export function puliscoFinite() { storico.length = 0; falliti.clear(); avvisa(); }

/** solo per le prove: azzera tutto */
export function azzeraAttivita() {
  for (const r of [...manuali]) scartaProposta(r);
  for (const r of [...righe]) fermaRiga(r.id);
  righe.length = 0; storico.length = 0; manuali.length = 0; lavoriDi.clear(); annullaDi.clear(); proposte.clear(); impegni.clear(); falliti.clear(); restaDopoCambio.clear(); alLavoro.clear();
  for (const c of Object.values(corsie)) { c.coda.length = 0; c.attivi = 0; for (const x of c.rientri) x.ok(); c.rientri.length = 0; }
  pausaUtente = false; pausaRiproduzione = false; sovraccarico = false; limiteProva = null;
  avvisa();
}
