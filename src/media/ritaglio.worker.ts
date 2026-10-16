// Il worker del ritaglio: i modelli che separano il soggetto dallo sfondo girano qui, lontano dall'interfaccia.
// La libreria sta dentro l'app (src/media/libreriaAI.ts, con la CDN di riserva), il modello arriva da Hugging Face una
// volta sola (poi sta nella cache del browser/app). Le immagini non escono mai dal computer.
//  · famiglia "sfondo": la pipeline "background-removal" (BEN2, BiRefNet, MODNet…): un'immagine → la maschera;
//  · famiglia "sam": Segment Anything (SAM 2.1, SlimSAM…): un'immagine + dei clic o un riquadro → la maschera dell'oggetto.
// Ogni modello ha più indirizzi di riserva e più "tipi" (fp16, fp32, q8): si prova finché uno va. Il tipo si dice
// sempre: prima no, e col processore la libreria cercava una versione (q8) che per MODNet e BiRefNet non c'è.
import { caricaConRipieghi, dispositivi, erroreDellaScheda, libreria, nomeTipo, progressoScarico, testoErrore, tipiScheda, usaImpostazioneScheda, type Dispositivo, type ImpostazioneScheda, type LibreriaAI, type Tipo } from './libreriaAI';

interface Immagine { data: Uint8ClampedArray | Uint8Array; width: number; height: number; channels: number }
interface Tensore { data: ArrayLike<number>; dims: number[] }
type Elaboratore = ((img: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>) & {
  post_process_masks: (m: unknown, a: unknown, b: unknown) => Promise<Tensore[]>;
};
type ModelloSam = (inputs: Record<string, unknown>) => Promise<{ pred_masks: unknown; iou_scores: Tensore }>;

interface Msg {
  tipo: string; id?: number; famiglia?: string; repo?: string[]; w?: number; h?: number; rgba?: Uint8ClampedArray;
  punti?: { x: number; y: number; dentro: boolean }[]; riquadro?: [number, number, number, number]; base?: string; scheda?: boolean;
  hw?: ImpostazioneScheda;
}

let T: LibreriaAI | null = null;
let sfondo: ((img: unknown) => Promise<Immagine | Immagine[]>) | null = null;
let sam: { model: ModelloSam; processor: Elaboratore } | null = null;
let caricato = '';
let dispositivo: Dispositivo = 'wasm';
let base = '';
const manda = (m: unknown, trasferibili: Transferable[] = []) => (self as unknown as Worker).postMessage(m, trasferibili);

/** i tipi da provare: sulla scheda mezza precisione (leggera e veloce), sul processore prima il quantizzato, poi il pieno */
const tipi = (d: Dispositivo, repo = ''): Tipo[] => {
  // SAM 3: l'encoder dell'immagine pieno pesa 1,8 GB (891 MB a mezza precisione): si usano i pesi a 4 bit (282 MB) sulla
  // scheda, gli 8 bit (503 MB) sul processore
  if (/sam3/i.test(repo)) return d === 'webgpu' ? (tipiScheda().includes('fp16') ? ['q4f16', 'q4'] : ['q4']) : ['q8', 'q4'];
  return d === 'webgpu' ? tipiScheda() : ['q8', 'fp16', 'fp32'];
};

async function carica(famiglia: string, repo: string[], conScheda = true) {
  const chiave = famiglia + ':' + repo.join(',');
  if (caricato === chiave && (sfondo || sam) && (conScheda || dispositivo === 'wasm')) { manda({ tipo: 'pronto', device: dispositivo }); return; }
  const lib = await libreria(base);
  T = lib.T;
  const progress_callback = progressoScarico(manda);
  sfondo = null; sam = null;
  const ok = await caricaConRipieghi(repo, await dispositivi(conScheda), tipi, async (r, device, dtype) => {
    if (famiglia === 'sam') {
      const processor = await T!.AutoProcessor.from_pretrained(r, { progress_callback });
      const Classe = /sam3/i.test(r) && T!.Sam3TrackerModel ? T!.Sam3TrackerModel : /sam2|edgetam/i.test(r) && T!.Sam2Model ? T!.Sam2Model : T!.SamModel;
      const model = await Classe.from_pretrained(r, { device, dtype, progress_callback });
      return { sam: { model, processor } as { model: ModelloSam; processor: Elaboratore } };
    }
    return { sfondo: await T!.pipeline('background-removal', r, { progress_callback, device, dtype }) as (img: unknown) => Promise<Immagine | Immagine[]> };
  });
  sfondo = ok.v.sfondo ?? null;
  sam = ok.v.sam ?? null;
  caricato = chiave;
  dispositivo = ok.device;
  manda({ tipo: 'pronto', device: `${ok.device === 'webgpu' ? 'scheda video' : 'processore'} · ${nomeTipo(ok.dtype)}`, repo: ok.repo, libreria: lib.dove });
}

const senzaAlfa = (rgba: Uint8ClampedArray) => {
  const n = rgba.length / 4, o = new Uint8ClampedArray(n * 3);
  for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { o[k] = rgba[j]; o[k + 1] = rgba[j + 1]; o[k + 2] = rgba[j + 2]; }
  return o;
};

async function maschera(m: Msg): Promise<Uint8Array> {
  const w = m.w!, h = m.h!;
  const img = new T!.RawImage(senzaAlfa(m.rgba!), w, h, 3);
  if (sfondo) {
    const out = await sfondo(img);
    const r = Array.isArray(out) ? out[0] : out;
    const o = new Uint8Array(w * h);
    // la pipeline rimanda l'immagine con la trasparenza (4 canali) o direttamente la maschera (1 canale)
    if (r.channels === 4) for (let i = 0; i < o.length; i++) o[i] = r.data[i * 4 + 3];
    else if (r.channels === 1) o.set(r.data.subarray(0, o.length));
    else throw new Error('il modello ha dato un\'immagine che non capisco');
    if (r.width !== w || r.height !== h) return ridimensiona(o, r.width, r.height, w, h);
    return o;
  }
  if (!sam) throw new Error('modello non caricato');
  const opz: Record<string, unknown> = {};
  // il riquadro e i punti si danno insieme: nei fotogrammi dopo il primo il riquadro dice dove sta l'oggetto e i punti (nel cuore
  // della maschera di prima) dicono quale, anche se nel riquadro c'è un'altra persona
  if (m.riquadro) opz.input_boxes = [[m.riquadro.map((v, i) => v * (i % 2 ? h : w))]];
  if (m.punti?.length) {
    const pts = m.punti.map((p) => [p.x * w, p.y * h]);
    opz.input_points = [pts];
    opz.input_labels = [m.punti.map((p) => (p.dentro ? 1 : 0))];
  }
  const inputs = await sam.processor(img, opz);
  const out = await sam.model(inputs);
  const masks = await sam.processor.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const t = masks[0];
  // tre maschere candidate: si prende quella che il modello giudica migliore
  const [, k, H, W] = t.dims.length === 4 ? t.dims : [1, ...t.dims];
  const punteggi = Array.from(out.iou_scores.data);
  let best = 0;
  for (let i = 1; i < Math.min(k, punteggi.length); i++) if (punteggi[i] > punteggi[best]) best = i;
  const o = new Uint8Array(W * H);
  const base0 = best * W * H;
  for (let i = 0; i < o.length; i++) o[i] = t.data[base0 + i] ? 255 : 0;
  return W === w && H === h ? o : ridimensiona(o, W, H, w, h);
}

/** l'errore di una scheda video che si è fermata: in questo worker la libreria non è più affidabile (dopo un errore della scheda
 *  rifiuta anche le richieste nuove, con lo stesso errore), quindi si lascia alla pagina buttare il worker e ripartire col processore */
class SchedaGuasta extends Error {}

/** la maschera; se la scheda video sbaglia lo si dice alla pagina, che riparte da un worker nuovo sul processore */
async function mascheraSicura(m: Msg): Promise<Uint8Array> {
  try {
    return await maschera(m);
  } catch (e) {
    if (dispositivo !== 'webgpu' || !erroreDellaScheda(e)) throw e;
    manda({ tipo: 'scheda-guasta' });
    throw new SchedaGuasta(testoErrore(e));
  }
}

function ridimensiona(m: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / H));
    for (let x = 0; x < W; x++) o[y * W + x] = m[sy * w + Math.min(w - 1, Math.floor(((x + 0.5) * w) / W))];
  }
  return o;
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as Msg;
  try {
    if (m.base !== undefined) base = m.base;
    if (m.hw) usaImpostazioneScheda(m.hw);
    if (m.tipo === 'carica') await carica(m.famiglia!, m.repo!, m.scheda !== false);
    else if (m.tipo === 'maschera') {
      const dati = await mascheraSicura(m);
      manda({ tipo: 'maschera', id: m.id, dati }, [dati.buffer]);
    }
  } catch (err) {
    manda({ tipo: 'errore', id: m.id, msg: testoErrore(err), schedaGuasta: err instanceof SchedaGuasta });
  }
};
