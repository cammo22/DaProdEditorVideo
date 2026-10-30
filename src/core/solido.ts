// Le cose solide: quello che un utente si aspetta da un programma di montaggio e non vuole mai scoprire che manca.
// Qui sta solo la logica pura (si prova da Node, senza browser):
//  · recupero dopo una chiusura anomala (quando proporlo, cosa dire);
//  · le versioni del progetto (quante tenerne, quando farne una nuova);
//  · l'abbinamento dei file mancanti a quelli trovati in una cartella;
//  · il piano della pulizia dello spazio (copie leggere e memoria delle misure vecchie).
// I depositi veri (IndexedDB, disco privato) stanno in src/media/versioni.ts e src/media/spazio.ts.

// ——— piccole utilità ———

/** una firma corta del testo (FNV-1a a 32 bit + lunghezza): serve a capire se il progetto è cambiato davvero */
export function firmaTesto(testo: string): string {
  let a = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) a = Math.imul(a ^ testo.charCodeAt(i), 16777619);
  return (a >>> 0).toString(16).padStart(8, '0') + testo.length.toString(16);
}

/** la firma del progetto: la data di salvataggio cambia a ogni scrittura e non conta */
export const firmaProgetto = (testo: string) => firmaTesto(testo.replace(/"saved":\d+/, '"saved":0'));

/** "adesso", "5 minuti fa", "ieri alle 18:30", "3 giorni fa": come si direbbe a voce */
export function descriviEta(quando: number, ora = Date.now()): string {
  const s = Math.max(0, Math.round((ora - quando) / 1000));
  if (s < 45) return 'adesso';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minuto fa' : `${m} minuti fa`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? '1 ora fa' : `${h} ore fa`;
  const g = Math.round(h / 24);
  return g === 1 ? 'ieri' : `${g} giorni fa`;
}

/** 1536 → "1,5 KB", 5 MB → "5,0 MB" */
export function pesoTesto(b: number): string {
  if (b < 1024) return `${Math.max(0, Math.round(b))} B`;
  const v = (n: number, u: string) => n.toFixed(1).replace('.', ',') + ' ' + u;
  if (b < 1 << 20) return v(b / 1024, 'KB');
  if (b < 1 << 30) return v(b / (1 << 20), 'MB');
  return v(b / (1 << 30), 'GB');
}

// ——— il recupero dopo una chiusura anomala ———

/** la copia di emergenza: scritta ogni tanto mentre si lavora, buttata (sporco = false) a ogni salvataggio vero */
export interface Emergenza {
  v: 1;
  testo: string;
  quando: number;
  nome: string;
  /** il file .dap da cui veniva il montaggio, se c'era */
  percorso?: string;
  revisione: number;
  clip: number;
  media: number;
  /** ci sono modifiche non salvate nel file progetto */
  sporco: boolean;
}

/**
 * Si propone «Recupera il lavoro» solo se: l'ultima volta il programma NON si è chiuso come si deve, la copia di
 * emergenza dice che c'erano modifiche non salvate e dentro c'è davvero qualcosa. Una chiusura normale, anche con
 * modifiche buttate di proposito, non ripropone niente.
 */
export function serveRecupero(anomala: boolean, e: Pick<Emergenza, 'sporco' | 'clip' | 'media'> | null | undefined): boolean {
  return !!e && anomala && e.sporco && (e.clip > 0 || e.media > 0);
}

/** le frasi della finestra «Recupera il lavoro» */
export function frasiRecupero(e: Pick<Emergenza, 'nome' | 'quando' | 'clip' | 'percorso'>, ora = Date.now()): { titolo: string; testo: string; dettaglio: string } {
  const nome = e.nome || 'Montaggio senza nome';
  return {
    titolo: 'Recupera il lavoro',
    testo: `L'ultima volta il programma non si è chiuso come si deve. Ho una copia di «${nome}» fatta ${descriviEta(e.quando, ora)}: la riprendo?`,
    dettaglio: `${e.clip === 1 ? '1 clip' : `${e.clip} clip`}${e.percorso ? ' · ' + e.percorso : ' · non ancora salvato in un file'}`,
  };
}

/** fra la copia di emergenza e l'autosalvataggio vince la più recente (a parità, l'emergenza: ha anche i dati di contorno) */
export function sceltaCopia(emergenzaQuando: number | undefined, autosalvataggioQuando: number | undefined): 'emergenza' | 'autosalvataggio' | null {
  if (emergenzaQuando === undefined && autosalvataggioQuando === undefined) return null;
  if (emergenzaQuando === undefined) return 'autosalvataggio';
  if (autosalvataggioQuando === undefined) return 'emergenza';
  return autosalvataggioQuando > emergenzaQuando ? 'autosalvataggio' : 'emergenza';
}

// ——— le versioni del progetto ———

export type MotivoVersione = 'salvataggio' | 'automatica' | 'prima-ripristino';

/** una riga dell'elenco: il testo del progetto sta a parte (si carica solo quando serve) */
export interface VersioneMeta {
  id: string;
  quando: number;
  motivo: MotivoVersione;
  nome: string;
  clip: number;
  /** secondi di montaggio */
  durata: number;
  firma: string;
  byte: number;
}

export const NOMI_MOTIVO: Record<MotivoVersione, string> = {
  salvataggio: 'Salvataggio',
  automatica: 'Copia automatica',
  'prima-ripristino': 'Prima di tornare indietro',
};

export const VERSIONI_MAX = 12;
/** oltre questo peso totale le più vecchie vanno via, anche se sono meno di VERSIONI_MAX (ne resta sempre una) */
export const VERSIONI_BYTE_MAX = 60 << 20;
/** le copie automatiche non si fanno più spesso di così */
export const VERSIONE_OGNI_MS = 10 * 60_000;

/**
 * Serve una versione nuova? Mai se il progetto è uguale all'ultima versione; i salvataggi (e la copia prima di
 * tornare indietro) si fanno sempre; la copia automatica solo se è passato abbastanza dall'ultima.
 */
export function serveVersione(indice: readonly VersioneMeta[], firma: string, ora: number, motivo: MotivoVersione, intervallo = VERSIONE_OGNI_MS): boolean {
  const ultima = ordina(indice)[0];
  if (ultima && ultima.firma === firma) return false;
  if (motivo === 'automatica' && ultima && ora - ultima.quando < intervallo) return false;
  return true;
}

/** dalla più nuova alla più vecchia */
export const ordina = (indice: readonly VersioneMeta[]): VersioneMeta[] => [...indice].sort((a, b) => b.quando - a.quando || (a.id < b.id ? 1 : -1));

/**
 * Mette una versione nuova nell'elenco e dice quali buttare: le più vecchie oltre `max`, e quelle che fanno
 * sforare il peso totale (la più nuova resta sempre).
 */
export function aggiungiVersione(indice: readonly VersioneMeta[], nuova: VersioneMeta, max = VERSIONI_MAX, maxByte = VERSIONI_BYTE_MAX): { indice: VersioneMeta[]; daEliminare: string[] } {
  const tutte = ordina([nuova, ...indice.filter((v) => v.id !== nuova.id)]);
  const tieni: VersioneMeta[] = [];
  let peso = 0;
  for (const v of tutte) {
    if (tieni.length >= max || (tieni.length > 0 && peso + v.byte > maxByte)) continue;
    tieni.push(v); peso += v.byte;
  }
  const vive = new Set(tieni.map((v) => v.id));
  return { indice: tieni, daEliminare: tutte.filter((v) => !vive.has(v.id)).map((v) => v.id) };
}

/** una riga dell'elenco, a voce: «5 minuti fa · Salvataggio · 12 clip · 1:30» */
export function rigaVersione(v: VersioneMeta, ora = Date.now()): string {
  const m = Math.floor(v.durata / 60), s = Math.round(v.durata % 60);
  const tempo = `${m}:${String(s).padStart(2, '0')}`;
  return `${descriviEta(v.quando, ora)} · ${NOMI_MOTIVO[v.motivo]} · ${v.clip === 1 ? '1 clip' : v.clip + ' clip'} · ${tempo}`;
}

// ——— ricollegare i media mancanti ———

export interface Cercato { id: string; name: string; size?: number; path?: string }
export interface Trovato { name: string; size?: number; path?: string }
export interface Abbinamento {
  id: string;
  /** l'indice nell'elenco dei trovati */
  trovato: number;
  /** esatto = stesso nome e stessa grandezza · nome = stesso nome, grandezza diversa o non nota (da controllare) */
  quanto: 'esatto' | 'nome';
}

const chiaveNome = (n: string) => n.normalize('NFC').toLowerCase();
const cartelle = (p?: string) => (p ?? '').replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1).reverse();
/** quante cartelle in comune (dalla più vicina al file): serve a scegliere fra due file con lo stesso nome */
function vicinanza(a?: string, b?: string): number {
  const x = cartelle(a), y = cartelle(b);
  let n = 0;
  while (n < x.length && n < y.length && chiaveNome(x[n]) === chiaveNome(y[n])) n++;
  return n;
}

/**
 * Abbina i file mancanti a quelli trovati nella cartella scelta. Prima i certi (nome e grandezza uguali), poi quelli
 * con lo stesso nome ma grandezza diversa o ignota, solo se non c'è dubbio su quale prendere (un file solo, o uno che
 * sta in una cartella dal nome uguale). Ogni file trovato serve una volta sola.
 */
export function abbinaMancanti(cercati: readonly Cercato[], trovati: readonly Trovato[]): Abbinamento[] {
  const usati = new Set<number>();
  const fatti = new Set<string>();
  const out: Abbinamento[] = [];
  const perNome = new Map<string, number[]>();
  trovati.forEach((t, i) => { const k = chiaveNome(t.name); (perNome.get(k) ?? perNome.set(k, []).get(k)!).push(i); });
  const migliore = (c: Cercato, candidati: number[]): number | null => {
    if (!candidati.length) return null;
    if (candidati.length === 1) return candidati[0];
    const punti = candidati.map((i) => ({ i, v: vicinanza(c.path, trovati[i].path) }));
    punti.sort((a, b) => b.v - a.v);
    return punti[0].v > punti[1].v ? punti[0].i : null;
  };
  // 1. i certi
  for (const c of cercati) {
    const tutti = (perNome.get(chiaveNome(c.name)) ?? []).filter((i) => !usati.has(i));
    const uguali = tutti.filter((i) => c.size && trovati[i].size === c.size);
    // fra più file identici si prende quello con la cartella più vicina; se non si distinguono va bene il primo (sono identici)
    const scelto = uguali.length ? (migliore(c, uguali) ?? uguali[0]) : null;
    if (scelto === null) continue;
    usati.add(scelto); fatti.add(c.id);
    out.push({ id: c.id, trovato: scelto, quanto: 'esatto' });
  }
  // 2. stesso nome, grandezza diversa o ignota: solo senza dubbi
  for (const c of cercati) {
    if (fatti.has(c.id)) continue;
    const candidati = (perNome.get(chiaveNome(c.name)) ?? []).filter((i) => !usati.has(i));
    const scelto = migliore(c, candidati);
    if (scelto === null) continue;
    usati.add(scelto); fatti.add(c.id);
    out.push({ id: c.id, trovato: scelto, quanto: 'nome' });
  }
  return out;
}

/** il testo che riassume il risultato della ricerca */
export function riassuntoRicollega(cercati: number, abbinati: readonly Abbinamento[]): string {
  const certi = abbinati.filter((a) => a.quanto === 'esatto').length, dubbi = abbinati.length - certi;
  if (!cercati) return 'Tutti i file sono già collegati.';
  if (!abbinati.length) return `Non ho trovato nessuno dei ${cercati} file mancanti in questa cartella.`;
  const resto = cercati - abbinati.length;
  return `Trovati ${abbinati.length} file su ${cercati}${dubbi ? ` (${certi} identici, ${dubbi} con lo stesso nome ma grandezza diversa)` : ''}${resto ? ` · ${resto} non ci sono` : ''}.`;
}

// ——— la pulizia dello spazio ———

export interface CopiaLeggera { nome: string; byte: number; quando: number }
export const GIORNI_VECCHIO = 30;

/**
 * Le copie leggere (proxy) sono rifacibili quando servono, ma pesano. Si dividono in: «vecchie» (di file che non sono
 * in questo progetto e non si toccano da tempo: si propongono di togliere), «altre» (di file che non sono in questo
 * progetto ma sono recenti: si possono togliere a scelta) e «in uso» (mai toccate).
 */
export function pianoCopieLeggere(copie: readonly CopiaLeggera[], inUso: ReadonlySet<string>, ora: number, giorni = GIORNI_VECCHIO) {
  const limite = ora - giorni * 86_400_000;
  const vecchie: CopiaLeggera[] = [], altre: CopiaLeggera[] = [], usate: CopiaLeggera[] = [];
  for (const c of copie) {
    if (inUso.has(c.nome)) usate.push(c);
    else if (c.quando < limite) vecchie.push(c);
    else altre.push(c);
  }
  const somma = (l: readonly CopiaLeggera[]) => l.reduce((t, c) => t + c.byte, 0);
  return { vecchie, altre, usate, byteVecchie: somma(vecchie), byteAltre: somma(altre), byteUsate: somma(usate) };
}

/**
 * Il .dap cresce perché Salva aggiunge in fondo (i byte dei file già dentro non si spostano). Se il file è molto più
 * grande di quello che servirebbe riscrivendolo da capo, conviene «Salva come…». Ritorna lo spreco, o 0 se non vale la pena.
 */
export function spreco(dap: number, necessario: number): number {
  if (!(dap > 0) || !(necessario > 0)) return 0;
  const extra = dap - necessario;
  return extra > 100 * (1 << 20) && extra > necessario * 0.2 ? extra : 0;
}
