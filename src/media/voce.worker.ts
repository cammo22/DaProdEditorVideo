// Il worker della voce: Whisper (il riconoscimento del parlato di OpenAI, nella versione di Hugging Face per il
// browser) gira qui, lontano dall'interfaccia. La libreria (transformers.js) sta dentro l'app (src/media/libreriaAI.ts,
// con la CDN di riserva); il modello si scarica da Hugging Face una volta e resta nella cache del browser/app. L'audio
// non esce mai dal computer: tutto il lavoro si fa qui.
import { caricaConRipieghi, dispositivi, erroreDellaScheda, libreria, nomeTipo, progressoScarico, testoErrore, usaImpostazioneScheda, type Dispositivo, type ImpostazioneScheda, type Tipo } from './libreriaAI';

type Pipeline = (audio: Float32Array, opz: Record<string, unknown>) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;

let asr: Pipeline | null = null;
let caricato = '';
let dispositivo: Dispositivo = 'wasm';
let base = '';
const manda = (m: unknown) => (self as unknown as Worker).postMessage(m);

/** i tipi del modello da provare: sulla scheda il codificatore preciso e il decodificatore leggero, sul processore q8 */
const tipi = (d: Dispositivo): Tipo[] => (d === 'webgpu'
  ? [{ encoder_model: 'fp32', decoder_model_merged: 'q4' }, 'fp32']
  : ['q8', 'fp32']);

async function carica(modello: string, conScheda = true) {
  if (asr && caricato === modello && (conScheda || dispositivo === 'wasm')) { manda({ tipo: 'pronto', device: dispositivo }); return; }
  const { T, dove } = await libreria(base);
  const progress_callback = progressoScarico(manda);
  const ok = await caricaConRipieghi([modello], await dispositivi(conScheda), tipi,
    (r, device, dtype) => T.pipeline('automatic-speech-recognition', r, { progress_callback, device, dtype }) as Promise<Pipeline>);
  asr = ok.v;
  caricato = modello;
  dispositivo = ok.device;
  manda({ tipo: 'pronto', device: ok.device, dettaglio: `${ok.device === 'webgpu' ? 'scheda video' : 'processore'} · ${nomeTipo(ok.dtype)} · libreria ${dove}` });
}

const LINGUE: Record<string, string> = { it: 'italian', en: 'english', es: 'spanish', fr: 'french', de: 'german', pt: 'portuguese' };

async function trascrivi(audio: Float32Array, lingua?: string, traduci?: boolean) {
  if (!asr) throw new Error('modello non caricato');
  const opz = {
    // "auto": Whisper riconosce da solo la lingua
    ...(lingua && lingua !== 'auto' ? { language: LINGUE[lingua] ?? 'italian' } : {}),
    task: traduci ? 'translate' : 'transcribe',
    chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
  };
  try {
    return await asr(audio, opz);
  } catch (e) {
    // la scheda video si è fermata a metà: si ricarica il modello sul processore e si rifà lo stesso pezzo
    if (dispositivo !== 'webgpu' || !erroreDellaScheda(e)) throw e;
    manda({ tipo: 'avviso', msg: 'La scheda video si è fermata: continuo col processore (più lento)' });
    manda({ tipo: 'scheda-guasta' });
    asr = null;
    await carica(caricato, false);
    return await asr!(audio, opz);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data as { tipo: string; id?: number; modello?: string; audio?: Float32Array; lingua?: string; traduci?: boolean; base?: string; scheda?: boolean; hw?: ImpostazioneScheda };
  try {
    if (m.base !== undefined) base = m.base;
    if (m.hw) usaImpostazioneScheda(m.hw);
    if (m.tipo === 'carica') await carica(m.modello!, m.scheda !== false);
    else if (m.tipo === 'trascrivi') {
      const out = await trascrivi(m.audio!, m.lingua, m.traduci);
      const pezzi = (out.chunks?.length ? out.chunks : [{ timestamp: [0, null] as [number, number | null], text: out.text }])
        .map((c) => ({ da: c.timestamp[0], a: c.timestamp[1], testo: c.text }));
      manda({ tipo: 'testo', id: m.id, pezzi });
    }
  } catch (err) {
    manda({ tipo: 'errore', id: m.id, msg: testoErrore(err) });
  }
};
