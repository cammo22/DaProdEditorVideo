// La traduzione dei testi (i sottotitoli, e quello che la voce deve dire in un'altra lingua): Hy-MT2 1.8B di Tencent
// (Apache-2.0, 33 lingue) nel MOTORE AI LOCALE opzionale (/traduci, src-tauri/motore). Prima c'era NLLB-200 di Meta nel
// browser, ma i suoi pesi sono CC-BY-NC (non commerciali): tolto. Serve a due cose:
//  · "Traduci i sottotitoli": le righe restano ai loro tempi, cambia solo il testo;
//  · la voce AI: se la voce parla una lingua diversa da quella dei sottotitoli, i testi si traducono prima di leggerli
//    (altrimenti una voce inglese leggerebbe parole italiane con l'accento sbagliato).
// Se il motore non è installato (o siamo nel browser) la traduzione lo dice chiaramente: non c'è un ripiego sul browser.
import { spiegaErroreAI, testoErrore } from './erroriAI';
import { motoreAI, motoreLocaleDisponibile, type MotoreAI } from './motoreAI';
import { segnaModelloPronto } from './modelliPronti';

/** il modello della traduzione, come lo conosce il motore */
export const MODELLO_TRADUZIONE = { id: 'hy-mt2-18b', nome: 'Hy-MT2 1.8B', licenza: 'Apache-2.0', repo: 'tencent/Hy-MT2-1.8B', mb: 3600 } as const;
/** (compatibilità con chi leggeva l'elenco degli indirizzi dei modelli) */
export const MODELLI_TRADUZIONE: string[] = [MODELLO_TRADUZIONE.repo];

/** la frase quando il motore non c'è: dice cosa fare, senza giri */
export const SERVE_IL_MOTORE = 'La traduzione usa Hy-MT2 nel motore AI locale opzionale, che non è installato. Aprilo dal Centro AI: «Motore AI locale» → Installa, poi «Scarica Hy-MT2». Il montaggio funziona anche senza.';
const SERVE_IL_MOTORE_NEL_BROWSER = 'La traduzione usa Hy-MT2 nel motore AI locale opzionale, che c\'è solo nell\'app per Windows (non nel browser). I sottotitoli restano nella loro lingua.';
const SERVE_IL_MODELLO = 'Il motore AI locale c\'è, ma Hy-MT2 non è ancora sul computer (circa 3,6 GB). Scaricalo dal Centro AI: «Motore AI locale» → Scarica Hy-MT2.';

/** le lingue che si traducono: codice nostro, codice per il motore (stesso), nome */
export const LINGUE_TRADUZIONE: [string, string, string][] = [
  ['it', 'it', 'Italiano'],
  ['en', 'en', 'Inglese'],
  ['es', 'es', 'Spagnolo'],
  ['fr', 'fr', 'Francese'],
  ['de', 'de', 'Tedesco'],
  ['pt', 'pt', 'Portoghese'],
  ['zh', 'zh', 'Cinese'],
  ['ja', 'ja', 'Giapponese'],
  ['ar', 'ar', 'Arabo'],
];

/** il codice della lingua per il motore (il napoletano si traduce come l'italiano) */
export const codiceLingua = (l: string) => LINGUE_TRADUZIONE.find((x) => x[0] === (l === 'nap' ? 'it' : l))?.[1] ?? null;
export const sappiamoTradurre = (da: string, a: string) => !!codiceLingua(da) && !!codiceLingua(a);

/** chi traduce un gruppo di testi: di solito il motore locale; le prove ne mettono uno finto */
export interface Traduttore {
  carica(stato: (fase: string, prog: number) => void): Promise<void>;
  traduci(testi: string[], da: string, a: string): Promise<string[]>;
  /** se c'è, traduce tutto in un lavoro solo (il modello si carica una volta sola) e racconta l'avanzamento da 0 a 1 */
  traduciTutto?(testi: string[], da: string, a: string, avanza: (k: number, testo: string) => void, segnale?: AbortSignal): Promise<string[]>;
}

/** Il traduttore del motore locale. `motore` si passa nelle prove. */
export function traduttoreDelMotore(motore: MotoreAI = motoreAI, disponibile: () => boolean = motoreLocaleDisponibile): Traduttore {
  const prepara = async (avanza: (k: number | null, t: string) => void, segnale?: AbortSignal) => {
    if (!disponibile()) throw new Error(SERVE_IL_MOTORE_NEL_BROWSER);
    const s = await motore.stato();
    if (s.stato === 'non-installato' || s.stato === 'installazione') throw new Error(SERVE_IL_MOTORE);
    await motore.azione('accendi', avanza, segnale);
    const m = (await motore.modelli()).find((x) => x.id === MODELLO_TRADUZIONE.id);
    if (!m?.scaricato) throw new Error(SERVE_IL_MODELLO);
    segnaModelloPronto('hymt2', MODELLO_TRADUZIONE.repo);
  };
  return {
    carica: (stato) => prepara((k, t) => stato(t, k ?? 0)),
    traduci: async (testi, da, a) => (await motore.lavoro<{ testi: string[] }>('/traduci', { testi, da, a }, () => {})).testi,
    async traduciTutto(testi, da, a, avanza, segnale) {
      const r = await motore.lavoro<{ testi: string[] }>('/traduci', { testi, da, a }, (k, t) => avanza(k ?? 0, t), segnale);
      if (!Array.isArray(r.testi) || r.testi.length !== testi.length) throw new Error('Il motore ha risposto in modo strano: riprova');
      return r.testi;
    },
  };
}

let traduttore: Traduttore = traduttoreDelMotore();
let fermaCorrente: AbortController | null = null;

/** controlla che si possa tradurre (motore installato e acceso, modello sul computer) senza tradurre niente */
export const caricaTraduttore = (stato: (fase: string, prog: number) => void) => traduttore.carica(stato);
/** per le prove: un traduttore finto (null = torna il motore locale) */
export const impostaTraduttore = (t: Traduttore | null) => { traduttore = t ?? traduttoreDelMotore(); };

/** ferma la traduzione in corso (il motore termina il processo del modello: la memoria torna libera) */
export function fermaTraduzione() {
  fermaCorrente?.abort();
  fermaCorrente = null;
}

/**
 * Traduce i testi dalla lingua `da` alla lingua `a`, a gruppi (così si vede avanzare la barra). Le righe vuote restano
 * vuote; se le lingue sono la stessa cosa il testo torna com'è.
 */
export async function traduciTesti(testi: string[], da: string, a: string, stato: (fase: string, prog: number) => void, segnale?: AbortSignal): Promise<string[]> {
  const ctrl = new AbortController();
  fermaCorrente = ctrl;
  const ferma = () => ctrl.abort();
  segnale?.addEventListener('abort', ferma, { once: true });
  const fermo = () => { if (ctrl.signal.aborted || segnale?.aborted) throw new Error('fermato'); };
  try {
    if (codiceLingua(da) === codiceLingua(a)) return testi.slice();
    if (!sappiamoTradurre(da, a)) throw new Error('Questa coppia di lingue non la so tradurre');
    stato('Preparo la traduzione…', 0);
    try { await traduttore.carica((fase, x) => stato(fase, x * 0.3)); } catch (e) {
      if (ctrl.signal.aborted || testoErrore(e) === 'fermato') throw e;
      throw new Error(spiegaErroreAI(e));
    }
    fermo();
    const out = testi.slice();
    const dafare = testi.map((t, i) => [t, i] as const).filter(([t]) => t.trim());
    if (traduttore.traduciTutto) {
      if (dafare.length) {
        let r: string[];
        try { r = await traduttore.traduciTutto(dafare.map(([t]) => t), codiceLingua(da)!, codiceLingua(a)!, (k, t) => stato(t, 0.3 + 0.7 * k), ctrl.signal); } catch (e) {
          if (ctrl.signal.aborted || testoErrore(e) === 'fermato') throw new Error('fermato');
          throw new Error(spiegaErroreAI(e));
        }
        dafare.forEach(([, i], j) => { out[i] = (r[j] ?? '').trim() || testi[i]; });
      }
    } else {
      const GRUPPO = 6;
      for (let k = 0; k < dafare.length; k += GRUPPO) {
        fermo();
        const gruppo = dafare.slice(k, k + GRUPPO);
        stato(`Traduco: ${Math.min(dafare.length, k + gruppo.length)} di ${dafare.length}`, 0.3 + (0.7 * k) / Math.max(1, dafare.length));
        const r = await traduttore.traduci(gruppo.map(([t]) => t), da, a);
        gruppo.forEach(([, i], j) => { out[i] = (r[j] ?? '').trim() || testi[i]; });
      }
    }
    stato('Fatto', 1);
    return out;
  } finally {
    segnale?.removeEventListener('abort', ferma);
    if (fermaCorrente === ctrl) fermaCorrente = null;
  }
}
