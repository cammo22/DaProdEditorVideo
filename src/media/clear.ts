// "Podcast": la voce rifatta da Clear di Desert Ant Labs (https://desertant.com, modello clear-studio, ottobre 2026): toglie
// rumore ed eco, porta avanti la voce e la porta al volume da podcast. Gira tutto sul computer (WebAssembly + LiteRT.js);
// il modello (~49 MB) si scarica da Hugging Face la prima volta e poi resta nella cache del browser.
// Licenza Desert Ant Labs Source-Available 1.0: gratis sotto i 100.000 dispositivi al mese per piattaforma, con la scritta
// "Powered by Desert Ant Labs" (Info del programma). L'SDK manda un conteggio d'uso anonimo (niente audio, niente dati).
// Si carica solo quando serve (import dinamico): il resto del programma non lo scarica mai.
import { baseLocaleAI } from './libreriaAI';

type ClearSdk = {
  enhance: (samples: Float32Array | Float32Array[], sr: number, o?: Record<string, unknown>) => Promise<{ channels: Float32Array[]; sampleRate: number; measuredLUFS: number | null; measuredTruePeakDBFS: number | null }>;
  dispose: () => void;
};

let caricato: Promise<ClearSdk> | null = null;

// ——— Clear si può spegnere ———
// La licenza di Clear NON è permissiva (source-available): gratis sotto i 100.000 dispositivi al mese, con la scritta
// "Powered by Desert Ant Labs", senza usarlo per addestrare un modello concorrente, con un conteggio d'uso anonimo.
// Tutto il resto dell'AI del programma è Apache-2.0 / MIT / BSD. Chi non vuole quei vincoli lo spegne dal Centro AI:
// "Voce migliorata" sparisce e le altre tre voci (pulita, isolata, motore locale) restano.
const LS_CLEAR = 'dpv-clear';
export const FRASE_CLEAR_SPENTO = 'Clear è spento nelle impostazioni del Centro AI (ha una licenza non permissiva). Riaccendilo da lì, oppure usa «Voce pulita».';
/** di partenza acceso (com'è sempre stato); `dpv-clear = no` lo spegne */
export function clearAttivo(): boolean { try { return localStorage.getItem(LS_CLEAR) !== 'no'; } catch { return true; } }
export function impostaClearAttivo(si: boolean): void {
  try { if (si) localStorage.removeItem(LS_CLEAR); else localStorage.setItem(LS_CLEAR, 'no'); } catch { /* niente: resta com'era */ }
  if (!si) { caricato = null; }
}

/** per le prove: un Clear finto (le prove non scaricano il modello vero) */
let finto: ClearSdk | null = null;
export const impostaClearFinto = (c: ClearSdk | null) => { finto = c; caricato = null; };

/** il motore, caricato una volta sola */
export function caricaClear(): Promise<ClearSdk> {
  if (!clearAttivo()) return Promise.reject(new Error(FRASE_CLEAR_SPENTO));
  if (finto) return Promise.resolve(finto);
  return caricato ??= (async () => {
    const { Clear } = await import('@desert-ant-labs/clear');
    // LiteRT dai file dell'app se ci sono, se no dalla CDN
    const base = baseLocaleAI();
    let wasmDir: string | undefined;
    if (base) { try { const r = await fetch(base + 'litert/litert_wasm_internal.wasm', { method: 'HEAD' }); if (r.ok) wasmDir = base + 'litert/'; } catch { /* CDN */ } }
    // sul processore (XNNPACK): sulla scheda video (WebGPU) LiteRT non sa fare alcune operazioni del modello e fallisce a metà
    return (await Clear.load({ ...(wasmDir ? { litertWasmDir: wasmDir } : {}), accelerator: 'wasm' } as never)) as unknown as ClearSdk;
  })().catch((e) => { caricato = null; throw e; });
}

export interface OpzioniPodcast {
  /** quanto della voce rifatta: 1 = tutta (studio), meno = più naturale (si sente un po' della stanza) */
  forza: number;
  /** il volume finale (LUFS integrati): −19 podcast, −16 video/social */
  lufs: number;
}

/** rifà la voce: ingresso a 48 kHz (uno o due canali), esce a 48 kHz con gli stessi canali */
export async function voceDaPodcast(ch: Float32Array[], o: OpzioniPodcast): Promise<Float32Array[]> {
  const c = await caricaClear();
  const r = await c.enhance(ch.length === 1 ? ch[0] : ch, 48000, { strength: o.forza, targetLUFS: o.lufs, channelMode: ch.length > 1 ? 'preserve' : 'mono', peakCeilingDBFS: -1.5 });
  return r.channels;
}
