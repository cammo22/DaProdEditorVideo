// L'elenco dei modelli AI che si scaricano (il Centro AI è il posto dove si controllano): per ognuno com'è messo, come si
// scarica davvero e come si toglie. «Pronto» vuol dire che il modello è stato caricato per intero almeno una volta da qui
// (o da un uso vero) e che i suoi file sono ancora nella cache del computer: non basta che ci sia qualche file di un modello
// con lo stesso nome (era così che il Centro AI diceva «tutto a posto» e poi, togliendo lo sfondo, il modello si riscaricava:
// ogni funzione prova più indirizzi di ricambio e carica il peso adatto alla scheda). Scaricare passa dallo stesso
// percorso dell'uso (stesso worker, stessa scheda video, stesso peso), così la volta dopo non si scarica più niente.
import { MODELLI, caricaModelloVoce } from './voce';
import { MODELLI_RITAGLIO, caricaModelloRitaglio } from './ritaglio';
import { MODELLO_TRADUZIONE } from './traduci';
import { motoreAI, motoreLocaleDisponibile } from './motoreAI';
import { MODELLO_SEPARAZIONE, installaRumore, installaSeparazione, modelloRumoreScelto, togliModelloRumore, togliSeparazione } from './audioAI';
import { modelloInCache } from './modelliAudio';
import { modelliScaricati, togliRepoModello } from './diagnosiAI';
import { dimenticaModello, modelliPronti, segnaModelloPronto } from './modelliPronti';
import type { RequisitiAI } from './idoneitaAI';

export type Gruppo = 'Togli lo sfondo e segui' | 'Sottotitoli' | 'Traduzione' | 'Audio';
export type StatoModello = 'pronto' | 'parziale' | 'da-scaricare';
export type Avanzamento = (fase: string, k: number) => void;

export interface ModelloHub extends RequisitiAI {
  id: string;
  gruppo: Gruppo;
  nome: string;
  info: string;
  /** a cosa serve, in una riga (indipendente dalla variante e dal computer) */
  uso: string;
  /** quanto pesa, circa, se si sa */
  mb?: number;
  /** suggerimento per la scelta: nessun modello viene selezionato o scaricato da solo */
  consigliato: boolean;
  /** dove cercare i suoi file nella cache (più indirizzi: ogni funzione prova i ricambi) */
  repos: string[];
  /** un modello che sta in un file solo (Demucs, MossFormer2): l'indirizzo, per controllare la cache */
  file?: string;
  /** un modello che sta nel motore AI locale (non nella cache del browser): com'è messo lo dice lui */
  stato?: () => Promise<{ stato: StatoModello; bytes: number }>;
  scarica(avanza: Avanzamento): Promise<void>;
  togli(): Promise<void>;
}

const ricorda = segnaModelloPronto;
const dimentica = dimenticaModello;
const leggi = modelliPronti;

/** "onnx-community/BEN2-ONNX · scheda video · q4" → "onnx-community/BEN2-ONNX" */
const repoDa = (s: string) => (/^[\w.-]+\/[\w.-]+/.exec(s)?.[0] ?? '');

/**
 * Un modello che vive nel motore AI locale opzionale. Si scarica solo su richiesta (accende il motore e prende i pesi),
 * si toglie dal motore; com'è messo lo dice il motore se è acceso, se no si fida di quanto ricordato dall'ultima volta.
 */
function modelloDelMotore(d: { id: string; modello: string; gruppo: Gruppo; nome: string; info: string; uso: string; mb: number; ramGB: number; thread: number }): ModelloHub {
  return {
    id: d.id, gruppo: d.gruppo, nome: d.nome, info: d.info, uso: d.uso, processore: true, ramGB: d.ramGB, thread: d.thread, mb: d.mb, consigliato: false, repos: [],
    async stato() {
      if (!motoreLocaleDisponibile()) return { stato: 'da-scaricare', bytes: 0 };
      try {
        const s = await motoreAI.stato();
        if (s.stato === 'acceso') {
          const m = (await motoreAI.modelli()).find((x) => x.id === d.modello);
          if (m?.scaricato) return { stato: 'pronto', bytes: m.byte };
          return { stato: 'da-scaricare', bytes: 0 };
        }
        if (s.stato === 'non-installato' || s.stato === 'installazione') return { stato: 'da-scaricare', bytes: 0 };
      } catch { /* si usa il ricordo */ }
      return leggi()[d.id] ? { stato: 'pronto', bytes: d.mb * 1048576 } : { stato: 'da-scaricare', bytes: 0 };
    },
    async scarica(avanza) {
      if (!motoreLocaleDisponibile()) throw new Error("Il motore AI locale c'è solo nell'app per Windows: nel browser questo modello non si può scaricare");
      const s = await motoreAI.stato();
      if (s.stato === 'non-installato' || s.stato === 'installazione') throw new Error('Prima installa il motore AI locale (scheda «Motore AI locale» del Centro AI): poi si scarica questo modello');
      await motoreAI.azione('accendi', (k, t) => avanza(t, k ?? 0));
      await motoreAI.lavoro('/modelli/scarica', { modello: d.modello }, (k, t) => avanza(t, k ?? 0));
      ricorda(d.id, d.modello);
    },
    async togli() {
      if (motoreLocaleDisponibile()) {
        const s = await motoreAI.stato();
        if (s.stato === 'acceso') await motoreAI.togliModello(d.modello);
        else if (s.stato !== 'non-installato') { await motoreAI.azione('accendi'); await motoreAI.togliModello(d.modello); }
      }
      dimentica(d.id);
    },
  };
}

export function modelliHub(): ModelloHub[] {
  const out: ModelloHub[] = [];
  const consigliati = new Set(['sam2', 'whisper-base']);
  // per togliere lo sfondo c'è un modo solo, SAM 2.1 (gli altri restano dentro per i progetti vecchi e come ricambio, ma non si scelgono)
  for (const m of MODELLI_RITAGLIO.filter((x) => x.id === 'sam2')) {
    out.push({
      id: m.id, gruppo: 'Togli lo sfondo e segui', nome: m.nome, info: m.info, uso: 'Ritaglia gli oggetti scelti con i clic e li segue nella ripresa.', ramGB: 8, thread: 8, mb: 78, consigliato: consigliati.has(m.id), repos: m.repo,
      async scarica(avanza) {
        const r = repoDa(await caricaModelloRitaglio(m, avanza));
        if (!r || r === m.repo[0]) { ricorda(m.id, r || m.repo[0]); return; }
        // è partito un modello di ricambio (il primo non si scarica, per esempio perché vuole la chiave Hugging Face): si ricorda quello, e lo si dice
        const altro = MODELLI_RITAGLIO.find((x) => x.repo[0] === r);
        if (altro) ricorda(altro.id, r);
        throw new Error(`${m.nome} non si è scaricato e ha preso il posto ${altro ? altro.nome : r}. Se ${m.nome} vuole la chiave Hugging Face, inseriscila nelle impostazioni qui sotto e riprova`);
      },
      async togli() { for (const r of m.repo) await togliRepoModello(r); dimentica(m.id); },
    });
  }
  for (const w of MODELLI) {
    out.push({
      id: 'whisper-' + w.id.split('-').pop(), gruppo: 'Sottotitoli', nome: `Whisper ${w.nome}`, info: w.info, uso: 'Ascolta il parlato e scrive i sottotitoli con i tempi.', ramGB: w.mb > 500 ? 8 : 4, thread: w.mb > 500 ? 8 : 4, mb: w.mb, consigliato: w.id.endsWith('base'), repos: [w.id],
      async scarica(avanza) { await caricaModelloVoce(w.id, avanza); ricorda('whisper-' + w.id.split('-').pop(), w.id); },
      async togli() { await togliRepoModello(w.id); dimentica('whisper-' + w.id.split('-').pop()); },
    });
  }
  out.push(modelloDelMotore({
    id: 'hymt2', modello: MODELLO_TRADUZIONE.id, gruppo: 'Traduzione', nome: `${MODELLO_TRADUZIONE.nome} · motore AI locale`, info: 'traduce i sottotitoli in nove lingue (Apache-2.0)',
    uso: 'Traduce il testo dei sottotitoli in un’altra lingua; gira nel motore AI locale opzionale.', mb: MODELLO_TRADUZIONE.mb, ramGB: 8, thread: 4,
  }));
  const rumore = modelloRumoreScelto();
  out.push({
    id: 'rumore', gruppo: 'Audio', nome: 'MossFormer2 · togli i rumori', info: 'il filtro per le voci (ClearerVoice)', uso: 'Toglie il rumore di fondo dai dialoghi e lascia la voce.', ramGB: 4, thread: 8, mb: Math.round(rumore.peso / 1048576), consigliato: true, repos: [rumore.repo], file: rumore.url,
    async scarica(avanza) { await installaRumore((a, t) => avanza(`${(a / 1048576).toFixed(0)} di ${((t || rumore.peso) / 1048576).toFixed(0)} MB`, t ? a / t : 0)); },
    async togli() { await togliModelloRumore(); },
  });
  out.push({
    id: 'separa', gruppo: 'Audio', nome: 'Demucs · voce e base', info: 'separa il cantato dalla musica e isola le voci', uso: 'Divide la canzone in voce e base su due tracce.', ramGB: 8, thread: 8, mb: Math.round(MODELLO_SEPARAZIONE.peso / 1048576), consigliato: true, repos: [MODELLO_SEPARAZIONE.repo], file: MODELLO_SEPARAZIONE.url,
    async scarica(avanza) { await installaSeparazione((a, t) => avanza(`${(a / 1048576).toFixed(0)} di ${((t || MODELLO_SEPARAZIONE.peso) / 1048576).toFixed(0)} MB`, t ? a / t : 0)); },
    async togli() { await togliSeparazione(); },
  });
  return out;
}

/** com'è messo ogni modello adesso (solo letture: niente si scarica) */
export async function statoModelli(lista: ModelloHub[] = modelliHub()): Promise<Map<string, { stato: StatoModello; bytes: number }>> {
  const byte = await modelliScaricati();
  const rec = leggi();
  const out = new Map<string, { stato: StatoModello; bytes: number }>();
  for (const m of lista) {
    if (m.stato) { out.set(m.id, await m.stato()); continue; }
    if (m.file) {
      const n = await modelloInCache({ url: m.file } as Parameters<typeof modelloInCache>[0]);
      out.set(m.id, { stato: n ? 'pronto' : 'da-scaricare', bytes: n ?? 0 });
      continue;
    }
    const totale = m.repos.reduce((a, r) => a + (byte.get(r) ?? 0), 0);
    const caricato = rec[m.id];
    out.set(m.id, { stato: caricato && (byte.get(caricato) ?? 0) > 0 ? 'pronto' : totale > 0 ? 'parziale' : 'da-scaricare', bytes: totale });
  }
  return out;
}
