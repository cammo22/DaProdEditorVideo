// Il worker dell'audio AI: qui girano i due motori, lontano dall'interfaccia (la riproduzione non deve mai scattare).
//  · rumore: DeepFilterNet3 (wasm col modello dentro) a 48 kHz, mono oppure centro+lati per lo stereo (src/core/rumore.ts);
//  · separa: Demucs (ONNX Runtime, scheda video se c'è e poi processore) a 44,1 kHz stereo (src/core/separa.ts), oppure il
//    ripiego rapido dal centro dello stereo se il modello non si scarica o non gira.
// La pagina manda l'audio a pezzi (messaggio "dati", uno alla volta: aspetta "ricevuto" prima del successivo, così in
// memoria non c'è mai più di un pezzo) e riceve quello che esce (messaggio "uscita"). Tutto sul computer di chi monta.
import { Ricampionatore, lunghezzaUscita } from '../core/ricampiona';
import { PulitoreMono, PulitoreStereo, type FiltroTrama, SR_DF } from '../core/rumore';
import { DEMUCS, SeparatoreDemucs, SeparatoreRapido, modelloFinto, type EseguiModello } from '../core/separa';
import { CDN_DEEPFILTERNET, CDN_ORT, applicaPotenza, applicaThread, dispositivi, erroreDellaScheda, testoErrore, usaImpostazioneScheda, type Dispositivo, type ImpostazioneScheda } from './libreriaAI';
import { ottieniModello, type ModelloAudio } from './modelliAudio';
import { spiegaErroreAI } from './erroriAI';

export interface InizioRumore {
  tipo: 'inizia'; lavoro: 'rumore'; sr: number; canali: 1 | 2; mescola: number; base: string;
  /** "voce isolata": prima Demucs tiene solo la voce (via musica, TV, rumori), poi il filtro. Come per la separazione */
  isola?: Omit<InizioSepara, 'tipo' | 'lavoro' | 'emetti' | 'ripiego'> | null;
}
export interface InizioSepara {
  tipo: 'inizia'; lavoro: 'separa'; sr: number; canali: 1 | 2;
  /** campioni (alla frequenza sr) che arriveranno in tutto */
  totale: number;
  /** media e deviazione standard del brano (mono), per normalizzare l'ingresso di Demucs */
  media: number; dev: number;
  base: string; scheda: boolean; hw?: ImpostazioneScheda;
  modello: ModelloAudio;
  /** 'auto' = il modello, e se non va il ripiego rapido; 'solo' = solo il ripiego rapido; 'mai' = solo il modello */
  ripiego: 'auto' | 'solo' | 'mai';
  /** quali tracce mandare indietro */
  emetti: ('voce' | 'base')[];
  /** per le prove: un modello finto con le forme giuste invece di ONNX Runtime */
  finta?: { attesaMs?: number } | null;
}
export type Inizio = InizioRumore | InizioSepara;
export type DaPagina = Inizio | { tipo: 'dati'; ch: Float32Array[] } | { tipo: 'fine' };
export type DaWorker =
  | { tipo: 'stato'; testo: string; k?: number }
  | { tipo: 'avviso'; msg: string }
  | { tipo: 'scheda-guasta' }
  | { tipo: 'pronto'; motore: 'deepfilternet' | 'demucs' | 'rapido' | 'voce'; dispositivo?: Dispositivo | 'finta' }
  | { tipo: 'uscita'; nome: 'pulito' | 'voce' | 'base'; ch: Float32Array[] }
  | { tipo: 'ricevuto' }
  | { tipo: 'finito' }
  | { tipo: 'errore'; msg: string };

const manda = (m: DaWorker, trasferisci: Transferable[] = []) => (self as unknown as Worker).postMessage(m, trasferisci);

/** quello che serve a ogni motore: dare dati, finire */
interface Motore { dati(ch: Float32Array[]): Promise<void>; fine(): Promise<void> }

/* eslint-disable @typescript-eslint/no-explicit-any */

// ——— togliere il rumore ———

async function caricaDeepFilter(base: string): Promise<{ crea: () => Promise<any>; dove: string }> {
  let mod: any = null, dove = 'cdn';
  let wasmUrl = CDN_DEEPFILTERNET + 'df_bg.wasm';
  if (base) {
    try { mod = await import(/* @vite-ignore */ base + 'deepfilternet/index.js'); dove = 'locale'; wasmUrl = base + 'deepfilternet/df_bg.wasm'; } catch { mod = null; }
  }
  if (!mod) mod = await import(/* @vite-ignore */ CDN_DEEPFILTERNET + 'index.js');
  return { crea: () => mod.DeepFilter.create({ wasmUrl }), dove };
}

async function avviaRumore(m: InizioRumore): Promise<Motore> {
  manda({ tipo: 'stato', testo: 'Preparo il filtro del rumore…' });
  const { crea } = await caricaDeepFilter(m.base);
  const filtri: any[] = [await crea()];
  if (m.canali === 2) filtri.push(await crea());
  let k = 0;
  const mono = m.canali === 1 ? new PulitoreMono(filtri[0] as FiltroTrama, m.mescola) : null;
  const stereo = m.canali === 2 ? new PulitoreStereo(() => filtri[k++] as FiltroTrama, m.mescola) : null;
  const esce = (ch: Float32Array[]) => {
    if (!ch[0].length) return;
    manda({ tipo: 'uscita', nome: 'pulito', ch }, ch.map((x) => x.buffer));
  };
  /** dai al filtro l'audio a 48 kHz (già coi canali della clip) */
  const filtra = (r: Float32Array[]) => esce(mono ? [mono.push(r[0])] : [...stereo!.push(r[0], r[1])]);
  const chiudiFiltro = () => {
    esce(mono ? [mono.fine()] : [...stereo!.fine()]);
    for (const f of filtri) f.destroy?.();
  };

  // "voce isolata": Demucs prima del filtro. Se il modello non si avvia, si pulisce solo col filtro (e lo si dice)
  let demucs: { esegui: EseguiModello } | null = null;
  if (m.isola) {
    try { demucs = await preparaDemucs({ ...m.isola, tipo: 'inizia', lavoro: 'separa', emetti: ['voce'], ripiego: 'mai' }); }
    catch (e) { manda({ tipo: 'avviso', msg: `Il modello che isola la voce non si avvia (${spiegaErroreAI(e)}): pulisco solo col filtro del rumore` }); demucs = null; }
  }
  if (!demucs || !m.isola) {
    const ric = Array.from({ length: m.canali }, () => new Ricampionatore(m.sr, SR_DF));
    manda({ tipo: 'pronto', motore: 'deepfilternet' });
    return {
      async dati(ch) { filtra(ch.map((x, i) => ric[i].processa(x))); },
      async fine() { filtra(ric.map((x) => x.fine())); chiudiFiltro(); },
    };
  }
  const iso = m.isola;
  manda({ tipo: 'pronto', motore: 'voce', dispositivo: iso.finta ? 'finta' : dispositivoOrt });
  // ingresso → 44,1 kHz stereo (Demucs) → la voce → 48 kHz (il filtro) coi canali della clip
  const ricIn = [new Ricampionatore(m.sr, DEMUCS.SR), new Ricampionatore(m.sr, DEMUCS.SR)];
  const ricVoce = [new Ricampionatore(DEMUCS.SR, SR_DF), new Ricampionatore(DEMUCS.SR, SR_DF)];
  const alFiltro = (l: Float32Array, r: Float32Array) => {
    if (m.canali === 2) { filtra([l, r]); return; }
    const n = Math.min(l.length, r.length), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = (l[i] + r[i]) * 0.5;
    filtra([x]);
  };
  const sep = new SeparatoreDemucs({
    totale: lunghezzaUscita(iso.totale, m.sr, DEMUCS.SR), media: iso.media, dev: iso.dev, esegui: demucs.esegui,
    uscita: async (v) => { alFiltro(ricVoce[0].processa(v[0]), ricVoce[1].processa(v[1])); },
    avanza: (x) => manda({ tipo: 'stato', testo: 'Isolo la voce…', k: x }),
  });
  return {
    async dati(ch) { await sep.push(ricIn[0].processa(ch[0]), ricIn[1].processa(ch[1] ?? ch[0])); },
    async fine() {
      await sep.push(ricIn[0].fine(), ricIn[1].fine());
      await sep.fine();
      alFiltro(ricVoce[0].fine(), ricVoce[1].fine());
      chiudiFiltro();
      await sessione?.release?.().catch?.(() => {});
      sessione = null;
    },
  };
}


// ——— separare voce e base ———

let sessione: any = null;
let ortApi: any = null;
let dispositivoOrt: Dispositivo = 'wasm';

async function caricaOrt(base: string): Promise<any> {
  if (ortApi) return ortApi;
  let ort: any = null, locale = false;
  if (base) { try { ort = await import(/* @vite-ignore */ base + 'ort.webgpu.min.mjs'); locale = true; } catch { ort = null; } }
  if (!ort) ort = await import(/* @vite-ignore */ CDN_ORT + 'ort.webgpu.min.mjs');
  // il motore (asyncify) accanto all'API: dai file dell'app, se no dalla CDN
  ort.env.wasm.wasmPaths = locale
    ? { mjs: base + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: base + 'ort-wasm-simd-threaded.asyncify.wasm' }
    : CDN_ORT;
  applicaPotenza(ort.env);
  applicaThread(ort.env.wasm);
  ortApi = ort;
  return ort;
}

/** crea la sessione di ONNX Runtime: scheda video prima (se c'è) e poi il processore */
async function creaSessione(m: InizioSepara, modello: Uint8Array, conScheda: boolean) {
  if (m.hw) usaImpostazioneScheda(m.hw);
  const ort = await caricaOrt(m.base);
  const devs = await dispositivi(conScheda);
  let ultimo: unknown = null;
  for (const d of devs) {
    try {
      sessione = await ort.InferenceSession.create(modello, { executionProviders: [d], graphOptimizationLevel: 'basic' });
      dispositivoOrt = d;
      return;
    } catch (e) { ultimo = e; }
  }
  throw ultimo ?? new Error('il motore AI non si avvia');
}

function eseguiOrt(m: InizioSepara): EseguiModello {
  return async (waveform, spettro) => {
    const ort = ortApi;
    const L = DEMUCS.L;
    const prova = async () => {
      const feeds: Record<string, any> = {};
      feeds[sessione.inputNames[0]] = new ort.Tensor('float32', waveform, [1, 2, L]);
      if (sessione.inputNames.length > 1) feeds[sessione.inputNames[1]] = new ort.Tensor('float32', spettro, [1, 4, DEMUCS.BINS, DEMUCS.FRAMES]);
      const ris = await sessione.run(feeds);
      let tempo: Float32Array | null = null, freq: Float32Array | null = null;
      for (const nome of sessione.outputNames) {
        const t = ris[nome];
        if (t.dims.length === 4 && t.dims[2] === 2) tempo = new Float32Array(t.data as Float32Array);
        else if (t.dims.length === 5 && t.dims[2] === 4) freq = new Float32Array(t.data as Float32Array);
        t.dispose?.();
      }
      if (!tempo) throw new Error('il modello non ha dato l\'audio: non è il modello giusto');
      return { tempo, freq };
    };
    try {
      return await prova();
    } catch (e) {
      // la scheda video si è fermata a metà: si ricarica il modello sul processore e si rifà lo stesso segmento
      if (dispositivoOrt !== 'webgpu' || !erroreDellaScheda(e)) throw e;
      manda({ tipo: 'avviso', msg: 'La scheda video si è fermata: continuo col processore (più lento)' });
      manda({ tipo: 'scheda-guasta' });
      await sessione.release?.().catch?.(() => {});
      const bytes = await ottieniModello(m.modello);
      await creaSessione({ ...m, scheda: false }, bytes, false);
      return await prova();
    }
  };
}

/** scarica (la prima volta) e avvia Demucs: scheda video se c'è, se no processore. Lancia l'errore se non si può */
async function preparaDemucs(m: InizioSepara): Promise<{ esegui: EseguiModello; dettaglio: Dispositivo | 'finta' }> {
  if (m.finta) return { esegui: modelloFinto({ attesaMs: m.finta.attesaMs }), dettaglio: 'finta' };
  manda({ tipo: 'stato', testo: 'Cerco il modello…' });
  const bytes = await ottieniModello(m.modello, {
    avanza: (a, t) => manda({ tipo: 'stato', testo: `Scarico il modello: ${(a / 1048576).toFixed(0)} di ${((t || m.modello.peso) / 1048576).toFixed(0)} MB (una volta sola)`, k: t ? a / t : 0 }),
  });
  manda({ tipo: 'stato', testo: 'Avvio il modello…' });
  await creaSessione(m, bytes, m.scheda);
  return { esegui: eseguiOrt(m), dettaglio: dispositivoOrt };
}

async function avviaSepara(m: InizioSepara): Promise<Motore> {
  const stereo = m.canali === 2;
  const totale44 = lunghezzaUscita(m.totale, m.sr, DEMUCS.SR);
  let esegui: EseguiModello | null = null;
  let dettaglio: Dispositivo | 'finta' | undefined;
  let motivoRipiego = '';

  if (m.ripiego !== 'solo') {
    try {
      ({ esegui, dettaglio } = await preparaDemucs(m));
    } catch (e) {
      if (m.ripiego === 'mai' || !stereo) throw e;
      motivoRipiego = spiegaErroreAI(e);
      esegui = null;
    }
  }
  const emetti = new Set(m.emetti);

  // l'uscita alla frequenza e con i canali della clip, contando i campioni: in tutto devono essere m.totale
  let inviati = 0;
  const esceStem = (voce: Float32Array[], base: Float32Array[]) => {
    const n = Math.min(voce[0].length, m.totale - inviati);
    if (n <= 0) return;
    // un brano mono esce mono (la media dei due canali, che il modello ha dato quasi uguali)
    const canali = (a: Float32Array[]) => (stereo ? [a[0].slice(0, n), a[1].slice(0, n)] : [Float32Array.from({ length: n }, (_, i) => (a[0][i] + a[1][i]) * 0.5)]);
    if (emetti.has('voce')) { const ch = canali(voce); manda({ tipo: 'uscita', nome: 'voce', ch }, ch.map((x) => x.buffer)); }
    if (emetti.has('base')) { const ch = canali(base); manda({ tipo: 'uscita', nome: 'base', ch }, ch.map((x) => x.buffer)); }
    inviati += n;
  };
  const completa = () => {
    if (inviati >= m.totale) return;
    const n = m.totale - inviati;
    const z = () => new Float32Array(n);
    esceStem([z(), z()], [z(), z()]);
  };

  if (!esegui) {
    if (!stereo) throw new Error('La separazione rapida ha bisogno di un brano stereo: questo è mono. Scarica il modello AI e riprova.');
    manda({ tipo: 'avviso', msg: m.ripiego === 'solo' ? 'Separazione rapida (senza AI): meno precisa del modello' : `Non riesco a usare il modello AI. ${motivoRipiego}. Uso la separazione rapida (senza AI), meno precisa` });
    manda({ tipo: 'pronto', motore: 'rapido' });
    const sep = new SeparatoreRapido(m.sr, m.totale, (v, b) => esceStem(v, b));
    return {
      async dati(ch) { await sep.push(ch[0], ch[1] ?? ch[0]); },
      async fine() { await sep.fine(); completa(); },
    };
  }

  manda({ tipo: 'pronto', motore: 'demucs', dispositivo: dettaglio });
  const ricIn = [new Ricampionatore(m.sr, DEMUCS.SR), new Ricampionatore(m.sr, DEMUCS.SR)];
  const ricOut = Array.from({ length: 4 }, () => new Ricampionatore(DEMUCS.SR, m.sr));
  const sep = new SeparatoreDemucs({
    totale: totale44, media: m.media, dev: m.dev, esegui,
    uscita: async (v, b) => {
      const r = [ricOut[0].processa(v[0]), ricOut[1].processa(v[1]), ricOut[2].processa(b[0]), ricOut[3].processa(b[1])];
      esceStem([r[0], r[1]], [r[2], r[3]]);
    },
    avanza: (k) => manda({ tipo: 'stato', testo: 'Separo voce e base…', k }),
  });
  return {
    async dati(ch) {
      // un brano mono entra due volte (a sinistra e a destra)
      const l = ricIn[0].processa(ch[0]), r = ricIn[1].processa(ch[1] ?? ch[0]);
      await sep.push(l, r);
    },
    async fine() {
      await sep.push(ricIn[0].fine(), ricIn[1].fine());
      await sep.fine();
      const r = ricOut.map((x) => x.fine());
      esceStem([r[0], r[1]], [r[2], r[3]]);
      // i conti dei ricampionamenti possono differire di un campione: si completa con silenzio
      completa();
      await sessione?.release?.().catch?.(() => {});
      sessione = null;
    },
  };
}

// ——— i messaggi ———

let motore: Motore | null = null;

self.onmessage = async (e: MessageEvent<DaPagina>) => {
  const m = e.data;
  try {
    if (m.tipo === 'inizia') {
      motore = m.lavoro === 'rumore' ? await avviaRumore(m) : await avviaSepara(m);
    } else if (m.tipo === 'dati') {
      if (!motore) throw new Error('il motore non è partito');
      await motore.dati(m.ch);
      manda({ tipo: 'ricevuto' });
    } else if (m.tipo === 'fine') {
      if (!motore) throw new Error('il motore non è partito');
      await motore.fine();
      motore = null;
      manda({ tipo: 'finito' });
    }
  } catch (err) {
    manda({ tipo: 'errore', msg: testoErrore(err) });
  }
};
