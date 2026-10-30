// La memoria delle misure già fatte: forma d'onda, colore automatico e locandina di ogni file, tenute nel browser
// (IndexedDB, un deposito a parte che si può svuotare senza toccare i progetti). Riaprire un progetto con tanti file
// non rifà tutto da capo: se il file è lo stesso (nome, grandezza, data, durata) le misure ci sono già.
import type { MediaItem } from '../core/tipi';

export type Deposito = 'picchi' | 'colore' | 'poster';
const NOME = 'dpv-cache';
const DEPOSITI: Deposito[] = ['picchi', 'colore', 'poster'];
/** quante voci per deposito: oltre, si buttano le più vecchie */
const MASSIMO = 600;

let aperto: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  aperto ??= new Promise((ok) => {
    try {
      const r = indexedDB.open(NOME, 1);
      r.onupgradeneeded = () => { for (const d of DEPOSITI) if (!r.result.objectStoreNames.contains(d)) r.result.createObjectStore(d); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch { ok(null); }
  });
  return aperto;
}

/** la chiave di un file: cambia se cambia il file (o dove sta dentro un pacchetto) */
export function chiaveMedia(m: MediaItem): string {
  return [m.path ?? '', m.dentro?.off ?? '', m.name, m.size, m.lastModified, m.duration.toFixed(3), m.width + 'x' + m.height].join('|');
}

export async function leggiCache<T>(deposito: Deposito, chiave: string): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  try {
    return await new Promise<T | undefined>((ok) => {
      const r = d.transaction(deposito, 'readonly').objectStore(deposito).get(chiave);
      r.onsuccess = () => ok((r.result as { v: T } | undefined)?.v);
      r.onerror = () => ok(undefined);
    });
  } catch { return undefined; }
}

let scritture = 0;
export async function scriviCache(deposito: Deposito, chiave: string, valore: unknown): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    await new Promise<void>((ok) => {
      const tx = d.transaction(deposito, 'readwrite');
      tx.objectStore(deposito).put({ t: Date.now(), v: valore }, chiave);
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
      tx.onabort = () => ok();
    });
    if (++scritture % 40 === 0) void pulisci(deposito);
  } catch { /* spazio pieno: pazienza, si rifà */ }
}

/** butta le voci più vecchie quando sono troppe */
async function pulisci(deposito: Deposito) {
  const d = await db();
  if (!d) return;
  try {
    const voci: { k: IDBValidKey; t: number }[] = [];
    await new Promise<void>((ok) => {
      const r = d.transaction(deposito, 'readonly').objectStore(deposito).openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { voci.push({ k: c.key, t: (c.value as { t: number }).t ?? 0 }); c.continue(); } else ok(); };
      r.onerror = () => ok();
    });
    if (voci.length <= MASSIMO) return;
    voci.sort((a, b) => a.t - b.t);
    const tx = d.transaction(deposito, 'readwrite');
    for (const v of voci.slice(0, voci.length - MASSIMO)) tx.objectStore(deposito).delete(v.k);
  } catch { /* niente */ }
}

export async function svuotaCache(): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    await new Promise<void>((ok) => {
      const tx = d.transaction(DEPOSITI, 'readwrite');
      for (const n of DEPOSITI) tx.objectStore(n).clear();
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
    });
  } catch { /* niente */ }
}

// ——— la forma d'onda in piccolo: un byte per valore, con la radice per tenere i dettagli dei suoni bassi ———
export function comprimiPicchi(p: Float32Array): Uint8Array {
  const o = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) o[i] = Math.round(Math.sqrt(Math.min(1, Math.max(0, p[i]))) * 255);
  return o;
}
export function espandiPicchi(b: Uint8Array): Float32Array {
  const o = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) { const x = b[i] / 255; o[i] = x * x; }
  return o;
}

// ——— quanto pesa la memoria delle misure, e come si alleggerisce (Centro attività → Spazio) ———
const pesoVoce = (v: unknown): number => {
  if (!v || typeof v !== 'object') return 16;
  const o = v as { byteLength?: number; size?: number; length?: number };
  if (typeof o.byteLength === 'number') return o.byteLength;
  if (typeof o.size === 'number') return o.size;
  if (typeof o.length === 'number') return o.length * 4;
  return 256;
};

/** quante voci ci sono, quanto pesano all'incirca e quante non si toccano da `giorni` giorni */
export async function statisticheCache(giorni = 30, ora = Date.now()): Promise<{ voci: number; byte: number; vecchie: number; byteVecchie: number }> {
  const out = { voci: 0, byte: 0, vecchie: 0, byteVecchie: 0 };
  const d = await db();
  if (!d) return out;
  const limite = ora - giorni * 86_400_000;
  for (const dep of DEPOSITI) {
    try {
      await new Promise<void>((ok) => {
        const r = d.transaction(dep, 'readonly').objectStore(dep).openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (!c) { ok(); return; }
          const v = c.value as { t?: number; v?: unknown };
          const b = pesoVoce(v.v);
          out.voci++; out.byte += b;
          if ((v.t ?? 0) < limite) { out.vecchie++; out.byteVecchie += b; }
          c.continue();
        };
        r.onerror = () => ok();
      });
    } catch { /* deposito illeggibile: si salta */ }
  }
  return out;
}

/** toglie le voci che non si usano da `giorni` giorni (giorni = 0: tutte). Ritorna quante. */
export async function potaCacheVecchia(giorni = 30, ora = Date.now()): Promise<number> {
  const d = await db();
  if (!d) return 0;
  const limite = giorni <= 0 ? Infinity : ora - giorni * 86_400_000;
  let tolte = 0;
  for (const dep of DEPOSITI) {
    try {
      await new Promise<void>((ok) => {
        const tx = d.transaction(dep, 'readwrite');
        const r = tx.objectStore(dep).openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return;
          if (((c.value as { t?: number }).t ?? 0) < limite) { c.delete(); tolte++; }
          c.continue();
        };
        tx.oncomplete = () => ok();
        tx.onerror = tx.onabort = () => ok();
      });
    } catch { /* niente */ }
  }
  return tolte;
}
