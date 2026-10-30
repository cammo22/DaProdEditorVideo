// Ricollegare i media mancanti: si sceglie UNA cartella (dove hai spostato i file) e il programma cerca lì, anche nelle
// sottocartelle, i file con lo stesso nome (e la stessa grandezza) di quelli che mancano. L'abbinamento è in
// src/core/solido.ts (puro); qui si guarda dentro la cartella: nell'app con un comando Rust (`cartella_elenca`),
// nel browser col selettore di cartelle (File System Access). Non si apre nessun file: si leggono solo nomi e grandezze.
import type { MediaItem } from '../core/tipi';
import { abbinaMancanti, type Abbinamento, type Cercato, type Trovato } from '../core/solido';
import { invoke, isAndroid, isTauri } from '../platform';

/** un file trovato nella cartella: nell'app ha il percorso, nel browser la maniglia da cui prendere il file */
export interface FileTrovato extends Trovato {
  size: number;
  maniglia?: FileSystemFileHandle;
}

export interface RisultatoRicerca {
  cartella: string;
  trovati: FileTrovato[];
  abbinati: Abbinamento[];
  /** i mancanti cercati, nello stesso ordine usato per gli abbinamenti */
  cercati: Cercato[];
}

const PROFONDITA = 8;
const MASSIMO_FILE = 20000;
const SALTA = /^(\.|\$RECYCLE\.BIN$|System Volume Information$|node_modules$)/;

/** si può scegliere una cartella in questo ambiente? (non su Android, dove i file sono content://) */
export const puoCercareInCartella = () => (isTauri ? !isAndroid : typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function');

export const comeCercato = (m: MediaItem): Cercato => ({ id: m.id, name: m.name, size: m.size || undefined, path: m.path });

/** il selettore di cartelle: ritorna il percorso (app) o la maniglia (browser), o null se si annulla */
export async function scegliCartella(): Promise<{ nome: string; percorso?: string; maniglia?: FileSystemDirectoryHandle } | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    try {
      const r = await open({ directory: true, multiple: false, title: 'Dove hai messo i file?' });
      const percorso = Array.isArray(r) ? r[0] : r;
      return percorso ? { nome: percorso, percorso } : null;
    } catch { return null; }
  }
  const w = window as unknown as { showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle> };
  if (!w.showDirectoryPicker) return null;
  try {
    const maniglia = await w.showDirectoryPicker({ mode: 'read' });
    return { nome: maniglia.name, maniglia };
  } catch { return null; }
}

/** nel browser: scende nella cartella e tiene i file che hanno uno dei nomi cercati */
export async function elencaManiglia(radice: FileSystemDirectoryHandle, nomi: ReadonlySet<string>, profondita = PROFONDITA, massimo = MASSIMO_FILE): Promise<FileTrovato[]> {
  const out: FileTrovato[] = [];
  const scendi = async (dir: FileSystemDirectoryHandle, livello: number): Promise<void> => {
    for await (const [nome, voce] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (out.length >= massimo) return;
      if (voce.kind === 'directory') {
        if (livello < profondita && !SALTA.test(nome)) await scendi(voce as FileSystemDirectoryHandle, livello + 1);
      } else if (nomi.has(nome.normalize('NFC').toLowerCase())) {
        try { const f = await (voce as FileSystemFileHandle).getFile(); out.push({ name: nome, size: f.size, maniglia: voce as FileSystemFileHandle }); } catch { /* sparito */ }
      }
    }
  };
  try { await scendi(radice, 0); } catch { /* cartella che non si legge più: si tiene quello che c'è */ }
  return out;
}

/** nell'app: chiede a Rust i file con quei nomi */
export async function elencaPercorso(percorso: string, nomi: ReadonlySet<string>): Promise<FileTrovato[]> {
  const l = await invoke<{ path: string; name: string; size: number }[]>('cartella_elenca', { path: percorso, nomi: [...nomi], profondita: PROFONDITA, massimo: MASSIMO_FILE });
  return l.filter((f) => nomi.has(f.name.normalize('NFC').toLowerCase())).map((f) => ({ name: f.name, size: f.size, path: f.path }));
}

/** cerca i mancanti dentro la cartella scelta e li abbina */
export async function cercaMancanti(mancanti: readonly MediaItem[], cartella: { nome: string; percorso?: string; maniglia?: FileSystemDirectoryHandle }): Promise<RisultatoRicerca> {
  const cercati = mancanti.map(comeCercato);
  const nomi = new Set(cercati.map((c) => c.name.normalize('NFC').toLowerCase()));
  const trovati = cartella.percorso ? await elencaPercorso(cartella.percorso, nomi) : cartella.maniglia ? await elencaManiglia(cartella.maniglia, nomi) : [];
  return { cartella: cartella.nome, trovati, cercati, abbinati: abbinaMancanti(cercati, trovati) };
}
