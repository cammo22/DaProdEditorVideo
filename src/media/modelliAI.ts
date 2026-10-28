// L'elenco dei modelli AI che si scaricano (il Centro AI è il posto dove si controllano): per ognuno com'è messo, come si
// scarica davvero e come si toglie. «Pronto» vuol dire che il modello è stato caricato per intero almeno una volta da qui
// (o da un uso vero) e che i suoi file sono ancora nella cache del computer: non basta che ci sia qualche file di un modello
// con lo stesso nome (era così che il Centro AI diceva «tutto a posto» e poi, togliendo lo sfondo, il modello si riscaricava:
// ogni funzione prova più indirizzi di ricambio e carica il peso adatto alla scheda). Scaricare passa dallo stesso
// percorso dell'uso (stesso worker, stessa scheda video, stesso peso), così la volta dopo non si scarica più niente.
import { MODELLI, caricaModelloVoce } from './voce';
import { MODELLI_RITAGLIO, caricaModelloRitaglio } from './ritaglio';
import { MODELLI_TRADUZIONE, caricaTraduttore } from './traduci';
import { MODELLO_SEPARAZIONE, installaRumore, installaSeparazione, modelloRumoreScelto, togliModelloRumore, togliSeparazione } from './audioAI';
import { modelloInCache } from './modelliAudio';
import { modelliScaricati, togliRepoModello } from './diagnosiAI';
import { dimenticaModello, modelliPronti, segnaModelloPronto } from './modelliPronti';

export type Gruppo = 'Togli lo sfondo e segui' | 'Sottotitoli' | 'Traduzione' | 'Audio';
export type StatoModello = 'pronto' | 'parziale' | 'da-scaricare';
export type Avanzamento = (fase: string, k: number) => void;

export interface ModelloHub {
  id: string;
  gruppo: Gruppo;
  nome: string;
  info: string;
  /** quanto pesa, circa, se si sa */
  mb?: number;
  /** quelli che «Controlla e ripara tutto» scarica (gli altri si scelgono a mano) */
  consigliato: boolean;
  /** dove cercare i suoi file nella cache (più indirizzi: ogni funzione prova i ricambi) */
  repos: string[];
  /** un modello che sta in un file solo (Demucs, MossFormer2): l'indirizzo, per controllare la cache */
  file?: string;
  scarica(avanza: Avanzamento): Promise<void>;
  togli(): Promise<void>;
}

const ricorda = segnaModelloPronto;
const dimentica = dimenticaModello;
const leggi = modelliPronti;

/** "onnx-community/BEN2-ONNX · scheda video · q4" → "onnx-community/BEN2-ONNX" */
const repoDa = (s: string) => (/^[\w.-]+\/[\w.-]+/.exec(s)?.[0] ?? '');

export function modelliHub(): ModelloHub[] {
  const out: ModelloHub[] = [];
  const consigliati = new Set(['sam3', 'whisper-base']);
  // per togliere lo sfondo c'è un modo solo, SAM 3 (gli altri restano dentro per i progetti vecchi e come ricambio, ma non si scelgono)
  for (const m of MODELLI_RITAGLIO.filter((x) => x.id === 'sam3')) {
    out.push({
      id: m.id, gruppo: 'Togli lo sfondo e segui', nome: m.nome, info: m.info, mb: m.id === 'sam3' ? 300 : undefined, consigliato: consigliati.has(m.id), repos: m.repo,
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
      id: 'whisper-' + w.id.split('-').pop(), gruppo: 'Sottotitoli', nome: `Whisper ${w.nome}`, info: w.info, mb: w.mb, consigliato: w.id.endsWith('base'), repos: [w.id],
      async scarica(avanza) { await caricaModelloVoce(w.id, avanza); ricorda('whisper-' + w.id.split('-').pop(), w.id); },
      async togli() { await togliRepoModello(w.id); dimentica('whisper-' + w.id.split('-').pop()); },
    });
  }
  out.push({
    id: 'nllb', gruppo: 'Traduzione', nome: 'NLLB-200 di Meta', info: 'traduce i sottotitoli in nove lingue', mb: 600, consigliato: false, repos: MODELLI_TRADUZIONE,
    async scarica(avanza) {
      await caricaTraduttore(avanza);
      const b = await modelliScaricati();
      ricorda('nllb', MODELLI_TRADUZIONE.find((r) => (b.get(r) ?? 0) > 0) ?? MODELLI_TRADUZIONE[0]);
    },
    async togli() { for (const r of MODELLI_TRADUZIONE) await togliRepoModello(r); dimentica('nllb'); },
  });
  const rumore = modelloRumoreScelto();
  out.push({
    id: 'rumore', gruppo: 'Audio', nome: 'MossFormer2 · togli i rumori', info: 'il filtro per le voci (ClearerVoice): sulla scheda video pulisce 15 s in meno di un secondo', mb: Math.round(rumore.peso / 1048576), consigliato: true, repos: [rumore.repo], file: rumore.url,
    async scarica(avanza) { await installaRumore((a, t) => avanza(`${(a / 1048576).toFixed(0)} di ${((t || rumore.peso) / 1048576).toFixed(0)} MB`, t ? a / t : 0)); },
    async togli() { await togliModelloRumore(); },
  });
  out.push({
    id: 'separa', gruppo: 'Audio', nome: 'Demucs · voce e base', info: 'separa il cantato dalla musica e isola le voci', mb: Math.round(MODELLO_SEPARAZIONE.peso / 1048576), consigliato: true, repos: [MODELLO_SEPARAZIONE.repo], file: MODELLO_SEPARAZIONE.url,
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
