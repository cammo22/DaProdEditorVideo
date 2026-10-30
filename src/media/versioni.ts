// Il deposito della rete di sicurezza: la copia di emergenza (scritta mentre si lavora, separata dal file progetto) e le
// ultime versioni del progetto (una per ogni salvataggio, più qualche copia automatica). Stanno nel browser/app
// (IndexedDB, deposito «kv» di «daprod-video», lo stesso dell'autosalvataggio), non accanto al file: così anche un
// .dap che non si scrive più o una chiavetta tolta non portano via il lavoro.
// La logica (quante versioni, quando farne una) è in src/core/solido.ts; qui c'è solo dove si scrive.
import type { Project } from '../core/tipi';
import {
  aggiungiVersione, firmaProgetto, ordina, serveVersione, VERSIONI_BYTE_MAX, VERSIONI_MAX,
  type Emergenza, type MotivoVersione, type VersioneMeta,
} from '../core/solido';

/** il minimo che serve a un deposito di chiavi e valori */
export interface Deposito {
  leggi(chiave: string): Promise<string | undefined>;
  scrivi(chiave: string, valore: string): Promise<void>;
  elimina(chiave: string): Promise<void>;
  chiavi(prefisso: string): Promise<string[]>;
}

// ——— il deposito vero: IndexedDB ———
function aprilo(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('daprod-video', 2);
    r.onupgradeneeded = () => { for (const n of ['kv', 'maniglie', 'file']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function transazione<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await aprilo();
  try {
    return await new Promise<T>((ok, ko) => {
      const tx = d.transaction('kv', modo);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => ok(r.result);
      tx.onabort = tx.onerror = () => ko(tx.error ?? r.error);
    });
  } finally { d.close(); }
}
const depositoIdb: Deposito = {
  async leggi(k) { try { return (await transazione('readonly', (s) => s.get(k))) as string | undefined; } catch { return undefined; } },
  async scrivi(k, v) { await transazione('readwrite', (s) => s.put(v, k)); },
  async elimina(k) { try { await transazione('readwrite', (s) => s.delete(k)); } catch { /* non c'era */ } },
  async chiavi(prefisso) {
    try { return ((await transazione('readonly', (s) => s.getAllKeys())) as IDBValidKey[]).map(String).filter((k) => k.startsWith(prefisso)); } catch { return []; }
  },
};

let deposito: Deposito = depositoIdb;
/** per le prove: un deposito in memoria al posto di IndexedDB */
export function impostaDeposito(d: Deposito | null) { deposito = d ?? depositoIdb; }
export const depositoAttuale = () => deposito;

/** un deposito in memoria (le prove, e il ripiego se il browser non ha IndexedDB) */
export function depositoInMemoria(): Deposito & { mappa: Map<string, string> } {
  const mappa = new Map<string, string>();
  return {
    mappa,
    async leggi(k) { return mappa.get(k); },
    async scrivi(k, v) { mappa.set(k, v); },
    async elimina(k) { mappa.delete(k); },
    async chiavi(p) { return [...mappa.keys()].filter((k) => k.startsWith(p)); },
  };
}

// ——— la copia di emergenza ———
const K_EMERGENZA = 'emergenza';

/** quanto dura il progetto, in secondi, e quante clip (senza i blocchetti FX) ha */
export function misureProgetto(p: Pick<Project, 'clips' | 'rate'>): { clip: number; durata: number } {
  const r = p.rate.num / p.rate.den || 25;
  let fine = 0, clip = 0;
  for (const c of p.clips) { if (c.kind !== 'fx') clip++; fine = Math.max(fine, c.start + c.len); }
  return { clip, durata: fine / r };
}

/** scrive la copia di emergenza. `sporco` = il file progetto non ha ancora queste modifiche */
export async function scriviEmergenza(p: Project, testo: string, revisione: number, percorso: string | undefined, sporco: boolean): Promise<void> {
  const m = misureProgetto(p);
  const e: Emergenza = { v: 1, testo, quando: Date.now(), nome: p.name || '', percorso, revisione, clip: m.clip, media: p.media.length, sporco };
  await deposito.scrivi(K_EMERGENZA, JSON.stringify(e));
}

export async function leggiEmergenza(): Promise<Emergenza | null> {
  const t = await deposito.leggi(K_EMERGENZA);
  if (!t) return null;
  try {
    const e = JSON.parse(t) as Emergenza;
    return e && e.v === 1 && typeof e.testo === 'string' && typeof e.quando === 'number' ? e : null;
  } catch { return null; }
}

export const togliEmergenza = () => deposito.elimina(K_EMERGENZA);

/** dopo un salvataggio vero la copia di emergenza non ha più modifiche da salvare */
export async function emergenzaPulita(): Promise<void> {
  const e = await leggiEmergenza();
  if (e?.sporco) await deposito.scrivi(K_EMERGENZA, JSON.stringify({ ...e, sporco: false }));
}

// ——— le versioni ———
const P_INDICE = 'ver-indice:';
const P_TESTO = 'ver-testo:';

/** il progetto a cui appartengono le versioni: il file se c'è, se no il nome */
export const chiaveVersioni = (p: Pick<Project, 'name'>, percorso?: string | null) => percorso ?? 'b:' + (p.name || 'montaggio');

/**
 * Le chiavi sotto cui possono stare le versioni di questo progetto: il file (se salvato) e il nome. Prima del primo
 * salvataggio le copie automatiche stanno sotto il nome; dopo, tutto va sotto il file. L'elenco le mette insieme.
 */
export const chiaviVersioni = (p: Pick<Project, 'name'>, percorso?: string | null): string[] => [...new Set([chiaveVersioni(p, percorso), chiaveVersioni(p, null)])];

export async function elencoVersioni(chiave: string): Promise<VersioneMeta[]> {
  const t = await deposito.leggi(P_INDICE + chiave);
  if (!t) return [];
  try { const l = JSON.parse(t) as VersioneMeta[]; return Array.isArray(l) ? ordina(l) : []; } catch { return []; }
}

/** le versioni di tutte queste chiavi insieme, dalla più nuova (al massimo `max`) */
export async function elencoVersioniDi(chiavi: readonly string[], max = VERSIONI_MAX + 1): Promise<VersioneMeta[]> {
  const tutte = new Map<string, VersioneMeta>();
  for (const k of chiavi) for (const v of await elencoVersioni(k)) tutte.set(v.id, v);
  return ordina([...tutte.values()]).slice(0, max);
}

let seq = 0;
/**
 * Registra una versione se serve (progetto cambiato rispetto all'ultima e, per le automatiche, passato abbastanza
 * tempo). Tiene le ultime `max`: le altre vanno via. Ritorna la versione fatta o null.
 */
export async function registraVersione(p: Project, testo: string, chiave: string, motivo: MotivoVersione, opz: { ora?: number; max?: number; maxByte?: number; intervallo?: number } = {}): Promise<VersioneMeta | null> {
  const ora = opz.ora ?? Date.now();
  const indice = await elencoVersioni(chiave);
  const firma = firmaProgetto(testo);
  if (!serveVersione(indice, firma, ora, motivo, opz.intervallo)) return null;
  const m = misureProgetto(p);
  const id = ora.toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  const meta: VersioneMeta = { id, quando: ora, motivo, nome: p.name || '', clip: m.clip, durata: m.durata, firma, byte: testo.length };
  await deposito.scrivi(P_TESTO + id, testo);
  const { indice: nuovo, daEliminare } = aggiungiVersione(indice, meta, opz.max ?? VERSIONI_MAX, opz.maxByte ?? VERSIONI_BYTE_MAX);
  await deposito.scrivi(P_INDICE + chiave, JSON.stringify(nuovo));
  for (const e of daEliminare) await deposito.elimina(P_TESTO + e);
  return nuovo.some((v) => v.id === id) ? meta : null;
}

export const testoVersione = (id: string) => deposito.leggi(P_TESTO + id);

export async function eliminaVersione(chiave: string | readonly string[], id: string): Promise<void> {
  for (const k of typeof chiave === 'string' ? [chiave] : chiave) {
    const indice = await elencoVersioni(k);
    if (indice.some((v) => v.id === id)) await deposito.scrivi(P_INDICE + k, JSON.stringify(indice.filter((v) => v.id !== id)));
  }
  await deposito.elimina(P_TESTO + id);
}

/**
 * Le versioni di tutti i progetti che «Spazio» può togliere: quante e quanto pesano. L'ultima di ogni progetto resta
 * sempre (`tieni`), quindi non si conta: la cifra che si promette è quella che si libera davvero.
 */
export async function pesoVersioni(tieni = 1): Promise<{ quante: number; byte: number }> {
  let quante = 0, byte = 0;
  for (const k of await deposito.chiavi(P_INDICE)) {
    for (const v of (await elencoVersioni(k.slice(P_INDICE.length))).slice(tieni)) { quante++; byte += v.byte; }
  }
  return { quante, byte };
}

/** toglie le versioni di tutti i progetti, tranne le ultime `tieni` di ognuno */
export async function potaTutteLeVersioni(tieni = 0): Promise<number> {
  let tolte = 0;
  for (const k of await deposito.chiavi(P_INDICE)) {
    const chiave = k.slice(P_INDICE.length);
    const indice = await elencoVersioni(chiave);
    const via = indice.slice(tieni);
    for (const v of via) { await deposito.elimina(P_TESTO + v.id); tolte++; }
    if (via.length) await deposito.scrivi(k, JSON.stringify(indice.slice(0, tieni)));
  }
  return tolte;
}
