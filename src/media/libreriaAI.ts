// La libreria AI comune ai worker (sottotitoli con Whisper, traduzione, togliere lo sfondo). Qui stanno le regole che
// prima ogni worker si faceva da solo, e che erano la causa di quasi tutti gli errori:
//  · la libreria (transformers.js) e il suo motore (ONNX Runtime) si caricano dai file dell'app (dist/ai/, preparati da
//    scripts/ai-locale.mjs); solo se lì non ci sono si va sulla CDN, come prima;
//  · il "tipo" del modello (q8, fp16, fp32…) si dice sempre, e se un tipo non c'è nel repository (il file manca: 404) si
//    prova il successivo. Prima non si diceva: col processore la libreria cercava la versione q8, che per alcuni modelli
//    (MODNet, BiRefNet) non esiste, e il ritaglio finiva in "Could not locate file";
//  · scheda video (WebGPU) prima e processore (WASM) dopo, sia quando si carica sia quando la scheda si ferma a metà
//    lavoro (prima un errore della scheda durante la trascrizione fermava tutto).
// Il file è usato dai worker (che lo includono nel loro pacchetto) e, per baseLocaleAI e statoLibreria, dalla pagina.
import { erroreDellaScheda, erroreFileMancante, testoErrore } from './erroriAI';

/** la stessa versione di scripts/ai-locale.mjs (la CDN serve solo se i file locali mancano) */
export const VERSIONE_LIBRERIA = '4.3.1';
export const CDN_LIBRERIA = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${VERSIONE_LIBRERIA}/dist/transformers.min.js`;

/** ONNX Runtime con le sue API (per i modelli che non passano da transformers.js: Demucs) e DeepFilterNet (togliere i rumori):
 *  i file stanno in dist/ai/ (scripts/ai-locale.mjs) e la CDN serve solo se mancano. VERSIONE_ORT è quella che transformers.js
 *  4.3.1 dichiara nelle sue dipendenze, così il motore (asyncify .wasm) è uno solo. */
export const VERSIONE_ORT = '1.31.0-dev.20260914-8d85527a0';
export const VERSIONE_DEEPFILTERNET = '0.1.0';
export const CDN_ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSIONE_ORT}/dist/`;
export const CDN_DEEPFILTERNET = `https://cdn.jsdelivr.net/npm/@lofcz/deepfilternet-web@${VERSIONE_DEEPFILTERNET}/dist/`;

/** dove stanno i file locali della libreria, visto dalla pagina (app/index.html → ../ai/): si passa ai worker */
export function baseLocaleAI(): string {
  try { return new URL('../ai/', document.baseURI).href; } catch { return ''; }
}

/** la scheda video per l'AI si può spegnere (Centro AI): su alcuni computer WebGPU c'è ma sbaglia. Solo nella pagina. */
export function usaSchedaAI(): boolean {
  try { return localStorage.getItem('dpv-ai-scheda') !== 'no'; } catch { return true; }
}
export function impostaSchedaAI(on: boolean) {
  try { if (on) localStorage.removeItem('dpv-ai-scheda'); else localStorage.setItem('dpv-ai-scheda', 'no'); } catch { /* niente */ }
}

export type Dispositivo = 'webgpu' | 'wasm';

/** cosa ha deciso il rilevatore dell'hardware (src/media/hardware.ts, solo nella pagina) per i worker, che non hanno localStorage:
 *  arriva nei messaggi `carica` e si ricorda qui. `potenza` = quale scheda chiedere al sistema (alte prestazioni / basso consumo). */
export interface ImpostazioneScheda { scheda?: boolean; potenza?: '' | 'high-performance' | 'low-power'; f16?: boolean; thread?: number; finta?: boolean }
let potenzaScelta: '' | 'high-performance' | 'low-power' = '';
let f16Scheda = true;
let threadScelti = 0;
/** per le prove: finge che ci sia una scheda video (le prove girano senza) per vedere cosa fa il worker quando sbaglia */
let schedaFinta = false;
export function usaImpostazioneScheda(m: ImpostazioneScheda) {
  if (m.potenza !== undefined) potenzaScelta = m.potenza;
  if (m.f16 !== undefined) f16Scheda = m.f16;
  if (m.thread) threadScelti = m.thread;
  if (m.finta !== undefined) schedaFinta = m.finta;
}
export const schedaF16 = () => f16Scheda;
/** i tipi di modello da provare sulla scheda: mezza precisione solo se la scheda la sa fare */
export const tipiScheda = (): string[] => (f16Scheda ? ['fp16', 'fp32'] : ['fp32']);
/** dice al motore ONNX quale scheda chiedere */
export function applicaPotenza(env: { webgpu?: { powerPreference?: string } } | undefined) {
  try { if (potenzaScelta && env?.webgpu) env.webgpu.powerPreference = potenzaScelta; } catch { /* niente */ }
}
/** i thread del processore per il motore wasm: tutti meno uno (se il programma ne consente più d'uno) */
export function applicaThread(wasm: { numThreads?: number } | undefined) {
  try {
    const n = threadScelti || Math.max(1, Math.min(8, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1));
    if (wasm && n > 1) wasm.numThreads = n;
  } catch { /* niente */ }
}
export type Tipo = string | Record<string, string>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LibreriaAI {
  env: any;
  pipeline: (compito: string, modello: string, opz: Record<string, unknown>) => Promise<any>;
  RawImage: any;
  AutoProcessor: any;
  SamModel: any;
  Sam2Model?: any;
  [k: string]: any;
}

let promessa: Promise<{ T: LibreriaAI; dove: 'locale' | 'cdn' }> | null = null;

const safariVecchio = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const safari = (navigator.vendor || '').includes('Apple') && !/CriOS|FxiOS|EdgiOS|Chrome|Android/.test(ua);
  const v = /Version\/(\d+)/.exec(ua);
  return safari && !!v && Number(v[1]) < 26;
};

/** carica la libreria una volta sola: prima dai file dell'app, se no dalla CDN */
export function libreria(base?: string): Promise<{ T: LibreriaAI; dove: 'locale' | 'cdn' }> {
  promessa ??= (async () => {
    let T: LibreriaAI | null = null;
    let dove: 'locale' | 'cdn' = 'cdn';
    if (base) {
      try { T = (await import(/* @vite-ignore */ base + 'transformers.min.js')) as LibreriaAI; dove = 'locale'; } catch { T = null; }
    }
    if (!T) T = (await import(/* @vite-ignore */ CDN_LIBRERIA)) as LibreriaAI;
    T.env.allowLocalModels = false;
    applicaPotenza(T.env.backends?.onnx);
    applicaThread(T.env.backends?.onnx?.wasm);
    // il motore (wasm) dai file dell'app: niente CDN nemmeno per lui. Safari prima della 26 senza scheda vuole un'altra
    // versione del motore: lì si lascia scegliere alla libreria (dalla CDN).
    const wasm = T.env.backends?.onnx?.wasm;
    const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (dove === 'locale' && wasm && !(safariVecchio() && !gpu)) {
      wasm.wasmPaths = { mjs: base + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'ort-wasm-simd-threaded.asyncify.wasm' };
    }
    return { T, dove };
  })();
  // se non si carica, la prossima volta si riprova (magari la rete è tornata)
  promessa.catch(() => { promessa = null; });
  return promessa;
}

/** scheda video prima (se c'è e non è stata spenta), poi il processore */
export async function dispositivi(conScheda = true): Promise<Dispositivo[]> {
  if (!conScheda) return ['wasm'];
  if (schedaFinta) return ['webgpu', 'wasm'];
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: (o?: unknown) => Promise<unknown> } }).gpu;
  const adattatore = gpu ? await (gpu.requestAdapter as (o?: unknown) => Promise<unknown>)(potenzaScelta ? { powerPreference: potenzaScelta } : undefined).catch(() => null) : null;
  return adattatore ? ['webgpu', 'wasm'] : ['wasm'];
}

/** quanto si è scaricato: un messaggio ogni 2%, non a ogni pezzetto */
export function progressoScarico(manda: (m: unknown) => void) {
  const visti = new Map<string, number>();
  return (x: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (x.status !== 'progress' || !x.file || !x.total) return;
    const k = Math.floor(((x.loaded ?? 0) / x.total) * 50);
    if (visti.get(x.file) === k) return;
    visti.set(x.file, k);
    manda({ tipo: 'scarico', file: x.file, loaded: x.loaded ?? 0, total: x.total });
  };
}

export interface Caricato<V> { v: V; repo: string; device: Dispositivo; dtype: Tipo }

/**
 * Prova a caricare un modello finché una combinazione va: per ogni indirizzo, per ogni dispositivo, per ogni tipo.
 * Un file che manca (404) fa passare al tipo dopo; un errore della scheda fa passare al processore. Se non va
 * niente, si rilancia l'errore più utile (quello che non è un semplice "file mancante", se c'è).
 */
export async function caricaConRipieghi<V>(
  repo: string[], devices: Dispositivo[], tipi: (d: Dispositivo) => Tipo[],
  fn: (repo: string, device: Dispositivo, dtype: Tipo) => Promise<V>,
): Promise<Caricato<V>> {
  let utile: unknown = null, ultimo: unknown = new Error('nessun modello da provare');
  for (const r of repo) {
    for (const device of devices) {
      for (const dtype of tipi(device)) {
        try {
          return { v: await fn(r, device, dtype), repo: r, device, dtype };
        } catch (e) {
          ultimo = e;
          if (!erroreFileMancante(e)) utile ??= e;
          // la scheda video non ce la fa: inutile provare gli altri tipi su di lei
          if (device === 'webgpu' && erroreDellaScheda(e)) break;
        }
      }
    }
  }
  // l'ultimo tentativo (di solito sul processore) dice di più del primo, che era della scheda video; ma un semplice "file mancante" no
  throw (ultimo && !erroreFileMancante(ultimo) ? ultimo : utile) ?? ultimo;
}

/** un nome leggibile del tipo (per dire cosa si è caricato) */
export const nomeTipo = (t: Tipo) => (typeof t === 'string' ? t : Object.values(t).join('+'));

export { erroreDellaScheda, testoErrore };
