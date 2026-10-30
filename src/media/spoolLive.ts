// Dove vanno i pezzetti di una registrazione mentre registri. MediaRecorder consegna una fetta ogni quarto di secondo:
// tenerle tutte in memoria (come si faceva) vuol dire che una registrazione lunga riempie la RAM del programma, e
// con lo schermo a 4K e la webcam sono centinaia di megabyte al minuto. Qui le fette vanno subito su un file
// temporaneo del disco (OPFS, la cartella privata del programma: c'è in WebView2, Chrome ed Edge); a fine registrazione
// il file si legge come un Blob che sta sul disco, non in memoria. Se il disco privato non c'è o si rompe a metà, le
// fette restano in memoria come prima: la registrazione non si perde mai.
import { StreamTarget, type StreamTargetChunk, type Target } from 'mediabunny';
import { risorseLive } from '../core/risorseLive';

/** il minimo che serve di una cartella OPFS (così si prova da Node con una finta) */
export interface CartellaFile {
  getFileHandle(nome: string, o?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(nome: string): Promise<void>;
  entries?(): AsyncIterable<[string, { kind: string }]>;
}
export interface FileHandle {
  createWritable(o?: { keepExistingData?: boolean }): Promise<ScrivibileFile>;
  getFile(): Promise<Blob>;
}
export interface ScrivibileFile { write(d: unknown): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }

const CARTELLA = 'dpv-live';
let cartellaCache: Promise<CartellaFile | null> | null = null;

/** la cartella temporanea di LIVE nel disco privato del programma (null se non c'è) */
export function cartellaSpool(): Promise<CartellaFile | null> {
  return cartellaCache ??= (async () => {
    try {
      const st = (globalThis as { navigator?: { storage?: { getDirectory?: () => Promise<unknown> } } }).navigator?.storage;
      if (!st?.getDirectory) return null;
      const radice = await st.getDirectory() as { getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<CartellaFile> };
      return await radice.getDirectoryHandle(CARTELLA, { create: true });
    } catch { return null; }
  })();
}

let contatore = 0;
export const nomeTemporaneo = (chi: string) => `${chi}-${Date.now()}-${++contatore}.tmp`;

/** toglie i file temporanei lasciati da una registrazione interrotta (programma chiuso a metà); mai quelli di oggi */
export async function puliziaSpoolVecchi(cartella?: CartellaFile | null, ora = Date.now(), maxEta = 24 * 3600e3): Promise<number> {
  const dir = cartella === undefined ? await cartellaSpool() : cartella;
  if (!dir?.entries) return 0;
  let tolti = 0;
  try {
    const vecchi: string[] = [];
    for await (const [nome, info] of dir.entries()) {
      const m = /-(\d{10,})-\d+\.tmp$/.exec(nome);
      if (info.kind === 'file' && m && ora - Number(m[1]) > maxEta) vecchi.push(nome);
    }
    for (const n of vecchi) { try { await dir.removeEntry(n); tolti++; } catch { /* in uso */ } }
  } catch { /* niente da pulire */ }
  return tolti;
}

/** un contenitore di fette: scrive sul disco appena può, e a fine corsa le consegna come un Blob solo */
export class Spool {
  private coda: Promise<void> = Promise.resolve();
  private scrivibile: ScrivibileFile | null = null;
  private handle: FileHandle | null = null;
  /** le fette che il disco non ha preso (se tutto va bene, nessuna) */
  private memoria: Blob[] = [];
  private guasto = false;
  /** vero se il file sul disco si è rotto dopo aver preso delle fette: quelle non si recuperano più */
  perse = false;
  private chiuso = false;
  private chiudiRisorsa: () => void = () => {};
  dimensione = 0;
  fette = 0;

  private constructor(private dir: CartellaFile | null, readonly nome: string, readonly tipo: string) {}

  /** apre il file temporaneo (se il disco privato non c'è, lavora in memoria) */
  static async apri(chi: string, tipo: string, cartella?: CartellaFile | null): Promise<Spool> {
    const dir = cartella === undefined ? await cartellaSpool() : cartella;
    const s = new Spool(dir, nomeTemporaneo(chi), tipo);
    if (dir) {
      try {
        s.handle = await dir.getFileHandle(s.nome, { create: true });
        s.scrivibile = await s.handle.createWritable();
        s.chiudiRisorsa = risorseLive.apri('file');
      } catch {
        s.scrivibile = null; s.handle = null; s.guasto = true;
        try { await dir.removeEntry(s.nome); } catch { /* non era nato */ }
      }
    } else s.guasto = true;
    return s;
  }

  /** dove stanno le fette adesso */
  get su(): 'disco' | 'memoria' { return this.guasto ? 'memoria' : 'disco'; }

  /** una fetta in più (si può chiamare senza aspettare: le scritture vanno in fila) */
  aggiungi(b: Blob) {
    if (this.chiuso || !b.size) return;
    this.dimensione += b.size;
    this.fette++;
    if (this.guasto || !this.scrivibile) { this.memoria.push(b); return; }
    const w = this.scrivibile;
    this.coda = this.coda.then(async () => {
      if (this.guasto) { this.memoria.push(b); return; }
      try { await w.write(b); }
      catch {
        // il disco non risponde: da qui in poi in memoria, e questa fetta non va persa
        this.guasto = true;
        this.memoria.push(b);
      }
    });
  }

  /** finisce le scritture e consegna tutto come un Blob (sul disco finché si può). Dopo, `scarta` toglie il file. */
  async chiudi(): Promise<Blob> {
    this.chiuso = true;
    await this.coda;
    let sulDisco: Blob | null = null;
    if (this.scrivibile) {
      try { await this.scrivibile.close(); sulDisco = this.handle ? await this.handle.getFile() : null; }
      catch { this.guasto = true; sulDisco = null; if (this.fette > this.memoria.length) this.perse = true; }
      this.scrivibile = null;
      this.chiudiRisorsa();
    }
    // un blocco solo che sta sul disco; se il disco ha mancato qualcosa, le fette in memoria vengono dopo
    const parti: Blob[] = [...(sulDisco && sulDisco.size ? [sulDisco] : []), ...this.memoria];
    return new Blob(parti, { type: this.tipo });
  }

  /** toglie il file temporaneo dal disco (da chiamare quando la registrazione è stata consegnata) */
  async scarta() {
    this.chiuso = true;
    try { await this.coda; } catch { /* niente */ }
    if (this.scrivibile) {
      try { await (this.scrivibile.abort?.() ?? this.scrivibile.close()); } catch { /* niente */ }
      this.scrivibile = null;
      this.chiudiRisorsa();
    }
    this.memoria = [];
    if (this.dir && this.handle) { try { await this.dir.removeEntry(this.nome); } catch { /* già tolto */ } }
    this.handle = null;
  }
}

/** dove Mediabunny scrive il file cucito: sul disco, un pezzetto alla volta (così un'ora di registrazione non passa
 *  tutta dalla memoria); null se il disco privato non c'è e allora si cuce in memoria come prima */
export interface UscitaDisco { target: Target; finito: () => Promise<Blob>; scarta: () => Promise<void> }

export async function uscitaSuDisco(chi: string, tipo: string, cartella?: CartellaFile | null): Promise<UscitaDisco | null> {
  const dir = cartella === undefined ? await cartellaSpool() : cartella;
  if (!dir || typeof WritableStream === 'undefined') return null;
  const nome = nomeTemporaneo(chi);
  let w: (WritableStream<StreamTargetChunk> & { abort?: () => Promise<void> }) | null = null;
  try {
    const handle = await dir.getFileHandle(nome, { create: true });
    const scr = await handle.createWritable() as unknown;
    if (!(scr instanceof WritableStream)) {
      try { await (scr as ScrivibileFile).abort?.(); } catch { /* niente */ }
      await dir.removeEntry(nome).catch(() => {});
      return null;
    }
    w = scr as WritableStream<StreamTargetChunk>;
    const chiudi = risorseLive.apri('file');
    const flusso = w;
    return {
      target: new StreamTarget(flusso, { chunked: true, chunkSize: 4 << 20 }),
      finito: async () => { chiudi(); return new Blob([await handle.getFile()], { type: tipo }); },
      scarta: async () => { chiudi(); try { if (!flusso.locked) await flusso.abort(); } catch { /* già chiuso */ } await dir.removeEntry(nome).catch(() => {}); },
    };
  } catch {
    await dir.removeEntry(nome).catch(() => {});
    return null;
  }
}

/** toglie un file temporaneo per nome (dopo che la registrazione è stata consegnata) */
export async function togliTemporaneo(nome: string, cartella?: CartellaFile | null) {
  const dir = cartella === undefined ? await cartellaSpool() : cartella;
  await dir?.removeEntry(nome).catch(() => {});
}
