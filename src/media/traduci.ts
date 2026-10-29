// La traduzione dei testi (i sottotitoli, e quello che la voce deve dire in un'altra lingua): NLLB-200 di Meta,
// dentro un worker (src/media/traduci.worker.ts). Il modello si scarica una volta sola. Serve a due cose:
//  · "Traduci i sottotitoli": le righe restano ai loro tempi, cambia solo il testo;
//  · la voce AI: se la voce parla una lingua diversa da quella dei sottotitoli, i testi si traducono prima di leggerli
//    (altrimenti una voce inglese leggerebbe parole italiane con l'accento sbagliato).
import { spiegaErroreAI, testoErrore } from './erroriAI';
import { baseLocaleAI } from './libreriaAI';
import { segnaModelloPronto } from './modelliPronti';
import { registraVram, segnaUsoAI } from './vram';

/** il modello della traduzione (e quello di riserva), come li prova il worker */
export const MODELLI_TRADUZIONE = ['Xenova/nllb-200-distilled-600M', 'onnx-community/nllb-200-distilled-600M-ONNX'];

/** le lingue che si traducono: codice nostro, codice di NLLB, nome */
export const LINGUE_TRADUZIONE: [string, string, string][] = [
  ['it', 'ita_Latn', 'Italiano'],
  ['en', 'eng_Latn', 'Inglese'],
  ['es', 'spa_Latn', 'Spagnolo'],
  ['fr', 'fra_Latn', 'Francese'],
  ['de', 'deu_Latn', 'Tedesco'],
  ['pt', 'por_Latn', 'Portoghese'],
  ['zh', 'zho_Hans', 'Cinese'],
  ['ja', 'jpn_Jpan', 'Giapponese'],
  ['ar', 'arb_Arab', 'Arabo'],
];

/** il codice di NLLB (il napoletano si traduce come l'italiano) */
export const codiceNllb = (l: string) => LINGUE_TRADUZIONE.find((x) => x[0] === (l === 'nap' ? 'it' : l))?.[1] ?? null;
export const sappiamoTradurre = (da: string, a: string) => !!codiceNllb(da) && !!codiceNllb(a);

/** chi traduce un gruppo di testi: di solito il worker; le prove ne mettono uno finto */
export interface Traduttore {
  carica(stato: (fase: string, prog: number) => void): Promise<void>;
  traduci(testi: string[], da: string, a: string): Promise<string[]>;
}

let worker: Worker | null = null;
let seq = 0;
const attese = new Map<number, { ok: (t: string[]) => void; no: (e: Error) => void }>();
let caricamento: { ok: () => void; no: (e: Error) => void; stato: (fase: string, prog: number) => void } | null = null;
let promessaCaricamento: Promise<void> | null = null;
const scaricati = new Map<string, [number, number]>();

function lavoratore(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./traduci.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { tipo: string; id?: number; testi?: string[]; msg?: string; file?: string; loaded?: number; total?: number; modello?: string };
    if (m.tipo === 'scarico' && caricamento) {
      scaricati.set(m.file!, [m.loaded!, m.total!]);
      let a = 0, b = 0;
      for (const [x, y] of scaricati.values()) { a += x; b += y; }
      caricamento.stato(`Scarico il modello di traduzione: ${(a / 1048576).toFixed(0)} di ${(b / 1048576).toFixed(0)} MB (solo la prima volta)`, b ? a / b : 0);
    } else if (m.tipo === 'pronto') { segnaModelloPronto('nllb', m.modello ?? MODELLI_TRADUZIONE[0]); caricamento?.ok(); caricamento = null; }
    else if (m.tipo === 'tradotto') { attese.get(m.id!)?.ok(m.testi ?? []); attese.delete(m.id!); }
    else if (m.tipo === 'errore') {
      const err = new Error(m.msg || 'errore della traduzione');
      if (m.id !== undefined && attese.has(m.id)) { attese.get(m.id)!.no(err); attese.delete(m.id); }
      else { caricamento?.no(err); caricamento = null; }
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'il worker della traduzione si è fermato');
    caricamento?.no(err); caricamento = null;
    for (const x of attese.values()) x.no(err);
    attese.clear();
    // un worker fermato non risponde più: la prossima volta se ne fa uno nuovo (prima la traduzione restava appesa)
    worker?.terminate();
    worker = null;
  };
  return worker;
}

// la memoria si libera quando la traduzione non serve (src/media/vram.ts)
registraVram('traduzione', {
  libera: () => {
    if (!worker) return false;
    worker.terminate();
    worker = null;
    return true;
  },
  occupato: () => attese.size > 0 || caricamento !== null,
});

const nllb: Traduttore = {
  carica: (stato) => {
    segnaUsoAI();
    if (promessaCaricamento) return promessaCaricamento;
    promessaCaricamento = new Promise<void>((ok, no) => {
      scaricati.clear();
      caricamento = { ok, no, stato };
      lavoratore().postMessage({ tipo: 'carica', base: baseLocaleAI() });
    }).finally(() => { promessaCaricamento = null; caricamento = null; });
    return promessaCaricamento;
  },
  traduci: (testi, da, a) => new Promise((ok, no) => {
    segnaUsoAI();
    const id = ++seq;
    attese.set(id, { ok, no });
    lavoratore().postMessage({ tipo: 'traduci', id, testi, da: codiceNllb(da), a: codiceNllb(a) });
  }),
};

let traduttore: Traduttore = nllb;
/** scarica e avvia il traduttore in anticipo (Centro AI) */
export const caricaTraduttore = (stato: (fase: string, prog: number) => void) => traduttore.carica(stato);
/** per le prove: un traduttore finto (null = torna NLLB) */
export const impostaTraduttore = (t: Traduttore | null) => { traduttore = t ?? nllb; };

/** ferma la traduzione in corso (il worker si chiude, il modello si ricarica la prossima volta) */
export function fermaTraduzione() {
  worker?.terminate();
  worker = null;
  const err = new Error('fermato');
  caricamento?.no(err); caricamento = null;
  for (const x of attese.values()) x.no(err);
  attese.clear();
}

/**
 * Traduce i testi dalla lingua `da` alla lingua `a`, a gruppi (così si vede avanzare la barra). Le righe vuote restano
 * vuote; se le lingue sono la stessa cosa il testo torna com'è.
 */
export async function traduciTesti(testi: string[], da: string, a: string, stato: (fase: string, prog: number) => void, segnale?: AbortSignal): Promise<string[]> {
  const fermo = () => { if (segnale?.aborted) throw new Error('fermato'); };
  if (codiceNllb(da) === codiceNllb(a)) return testi.slice();
  if (!sappiamoTradurre(da, a)) throw new Error('Questa coppia di lingue non la so tradurre');
  stato('Preparo la traduzione…', 0);
  try { await traduttore.carica((fase, x) => stato(fase, x * 0.3)); } catch (e) {
    if (segnale?.aborted || testoErrore(e) === 'fermato') throw e;
    throw new Error(spiegaErroreAI(e));
  }
  fermo();
  const out = testi.slice();
  const dafare = testi.map((t, i) => [t, i] as const).filter(([t]) => t.trim());
  const GRUPPO = 6;
  for (let k = 0; k < dafare.length; k += GRUPPO) {
    fermo();
    const gruppo = dafare.slice(k, k + GRUPPO);
    stato(`Traduco: ${Math.min(dafare.length, k + gruppo.length)} di ${dafare.length}`, 0.3 + (0.7 * k) / Math.max(1, dafare.length));
    const r = await traduttore.traduci(gruppo.map(([t]) => t), da, a);
    gruppo.forEach(([, i], j) => { out[i] = (r[j] ?? '').trim() || testi[i]; });
  }
  stato('Fatto', 1);
  return out;
}
