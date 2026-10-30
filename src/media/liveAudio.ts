// Il mixer di LIVE: il grafo Web Audio che sta fra le sorgenti (microfono e audio del computer) e i registratori.
// Quello che senti e quello che vedi sulle barre è quello che finisce nel file: i registratori prendono l'uscita di
// questo grafo, non i flussi grezzi.
//
//   voce:     microfono → [passa-alto] → porta → tono (3 filtri) → de-esser + compressore → volume → limitatore → uscita
//   computer: audio del computer → volume → abbassa-quando-parlo (la voce come secondo ingresso) + limitatore → uscita
//   somma:    voce + computer → limitatore → uscita (quando vanno nello stesso file)
//
// La dinamica (porta, de-esser, compressore, abbassa, limitatore) è un AudioWorklet (src/core/liveAudio.ts). Se il
// browser non ce l'ha, il grafo si costruisce lo stesso ma senza quei pezzi (resta il tono, il volume e un limitatore
// del browser). Ogni sorgente ha la sua catena e la sua uscita: con "Voce e computer separati" i due file hanno
// ognuno il proprio trattamento.
import {
  bilancioADb, codiceWorklet, EQ_FREQ, guadagnoCanale, paramComputer, paramDinVoce, paramLimiteVoce, paramPorta, paramSomma,
  type FiltriVoce, type ImpostazioniAudio, type ParamDin,
} from '../core/liveAudio';
import { risorseLive } from '../core/risorseLive';

export type Picchi = [number, number];

/** un pezzo di dinamica: il worklet (o, se non c'è, un limitatore del browser / un passaggio libero) */
class Din {
  nodo: AudioNode;
  /** quanto sta abbassando adesso, in dB (zero o meno): porta, de-esser, compressore, abbassa-computer, limitatore */
  gr = { porta: 0, deess: 0, comp: 0, duck: 0, lim: 0 };
  private w: AudioWorkletNode | null = null;
  private nativo: DynamicsCompressorNode | null = null;

  constructor(ctx: AudioContext, worklet: boolean, p: ParamDin, limitaComunque: boolean) {
    if (worklet) {
      this.w = new AudioWorkletNode(ctx, 'dpv-dinamica', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
        processorOptions: { p },
      });
      this.w.port.onmessage = (e) => { if (e.data?.gr) this.gr = e.data.gr; };
      this.nodo = this.w;
    } else if (limitaComunque) {
      // senza worklet resta almeno un limitatore che non lascia passare i picchi
      const c = this.nativo = ctx.createDynamicsCompressor();
      c.knee.value = 0; c.attack.value = 0.001; c.release.value = 0.1;
      this.nodo = c;
      this.manda(p);
    } else this.nodo = ctx.createGain();
  }

  manda(p: ParamDin) {
    this.w?.port.postMessage({ p });
    if (this.nativo) { this.nativo.threshold.value = p.lim.on ? p.lim.tetto : 0; this.nativo.ratio.value = p.lim.on ? 20 : 1; }
  }

  /** la voce che fa abbassare il computer entra dal secondo ingresso (solo con il worklet) */
  riceviLaterale(da: AudioNode) { if (this.w) da.connect(this.w, 0, 1); }
  togliLaterale(da: AudioNode) { if (this.w) { try { da.disconnect(this.w, 0, 1); } catch { /* non era collegato */ } } }
}

/** le due barre (sinistra e destra) di un punto del grafo */
class Misuratore {
  private an: AnalyserNode[];
  private buf: Float32Array<ArrayBuffer>;
  constructor(ctx: AudioContext, da: AudioNode) {
    const sp = ctx.createChannelSplitter(2);
    da.connect(sp);
    this.an = [0, 1].map((i) => {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0;
      sp.connect(a, i);
      return a;
    });
    this.buf = new Float32Array(2048);
  }
  /** i picchi (lineari) degli ultimi 40 ms circa */
  picchi(): Picchi {
    const r: Picchi = [0, 0];
    for (let i = 0; i < 2; i++) {
      this.an[i].getFloatTimeDomainData(this.buf);
      let p = 0;
      for (let k = 0; k < this.buf.length; k++) { const m = this.buf[k] < 0 ? -this.buf[k] : this.buf[k]; if (m > p) p = m; }
      r[i] = p;
    }
    return r;
  }
}

class CatenaVoce {
  entrata: GainNode;
  hp: BiquadFilterNode;
  porta: Din;
  eq: BiquadFilterNode[];
  din: Din;
  fader: GainNode;
  lim: Din;
  uscita: GainNode;
  misura: Misuratore;
  src: MediaStreamAudioSourceNode | null = null;
  private hpCollegato: boolean | null = null;

  constructor(private ctx: AudioContext, worklet: boolean, f: FiltriVoce) {
    this.entrata = ctx.createGain();
    this.hp = ctx.createBiquadFilter();
    this.porta = new Din(ctx, worklet, paramPorta(f), false);
    const basso = ctx.createBiquadFilter(), medio = ctx.createBiquadFilter(), alto = ctx.createBiquadFilter();
    basso.type = 'lowshelf'; basso.frequency.value = EQ_FREQ.calore;
    medio.type = 'peaking'; medio.frequency.value = EQ_FREQ.presenza; medio.Q.value = 0.9;
    alto.type = 'highshelf'; alto.frequency.value = EQ_FREQ.aria;
    this.eq = [basso, medio, alto];
    this.din = new Din(ctx, worklet, paramDinVoce(f), false);
    this.fader = ctx.createGain();
    this.lim = new Din(ctx, worklet, paramLimiteVoce(f), true);
    this.uscita = ctx.createGain();
    this.uscita.channelCount = 2; this.uscita.channelCountMode = 'explicit'; this.uscita.channelInterpretation = 'speakers';
    this.porta.nodo.connect(basso);
    basso.connect(medio); medio.connect(alto);
    alto.connect(this.din.nodo);
    this.din.nodo.connect(this.fader);
    this.fader.connect(this.lim.nodo);
    this.lim.nodo.connect(this.uscita);
    this.misura = new Misuratore(ctx, this.uscita);
    this.collegaPassaAlto(false);
  }

  /** il passa-alto si mette o si toglie dal percorso (spento non deve toccare il suono nemmeno un po') */
  collegaPassaAlto(si: boolean) {
    if (this.hpCollegato === si) return;
    this.hpCollegato = si;
    this.entrata.disconnect();
    this.hp.disconnect();
    if (si) { this.entrata.connect(this.hp); this.hp.connect(this.porta.nodo); } else this.entrata.connect(this.porta.nodo);
  }

  metti(s: MediaStream | null) {
    this.src?.disconnect();
    this.src = null;
    if (s && s.getAudioTracks().length) {
      this.src = this.ctx.createMediaStreamSource(s);
      this.src.connect(this.entrata);
    }
  }
}

class CatenaComputer {
  fader: GainNode;
  din: Din;
  uscita: GainNode;
  misura: Misuratore;
  src: MediaStreamAudioSourceNode | null = null;

  constructor(private ctx: AudioContext, worklet: boolean, a: ImpostazioniAudio) {
    this.fader = ctx.createGain();
    this.din = new Din(ctx, worklet, paramComputer(a), true);
    this.uscita = ctx.createGain();
    this.uscita.channelCount = 2; this.uscita.channelCountMode = 'explicit'; this.uscita.channelInterpretation = 'speakers';
    this.fader.connect(this.din.nodo);
    this.din.nodo.connect(this.uscita);
    this.misura = new Misuratore(ctx, this.uscita);
  }

  metti(s: MediaStream | null) {
    this.src?.disconnect();
    this.src = null;
    if (s && s.getAudioTracks().length) {
      this.src = this.ctx.createMediaStreamSource(s);
      this.src.connect(this.fader);
    }
  }
}

export interface Riduzioni { porta: number; deess: number; comp: number; duck: number; limVoce: number; limComputer: number }

export class MixerLive {
  ctx: AudioContext | null = null;
  /** il grafo è costruito (è falso se il browser non ha l'audio) */
  ok = false;
  /** la dinamica gira nel worklet (se è falso: solo tono, volume e limitatore del browser) */
  worklet = false;
  pronto: Promise<boolean> = Promise.resolve(false);
  voce: CatenaVoce | null = null;
  computer: CatenaComputer | null = null;
  private somma: GainNode | null = null;
  private limSomma: Din | null = null;
  private destVoce: MediaStreamAudioDestinationNode | null = null;
  private destComputer: MediaStreamAudioDestinationNode | null = null;
  private destMix: MediaStreamAudioDestinationNode | null = null;
  private misuraMix: Misuratore | null = null;
  private ascolto: GainNode | null = null;
  private a: ImpostazioniAudio | null = null;
  private chiuso = false;
  private chiudiRisorsa: () => void = () => {};

  /**
   * Accende il mixer. Da chiamare nel gesto dell'utente (il clic): il contesto audio nasce qui, il resto (il
   * worklet e il grafo) si prepara dopo — `pronto` dice quando si può collegare.
   * `interattivo` = bassa latenza (la prova, dove si può anche ascoltare); altrimenti 'playback' come per registrare.
   */
  accendi(a: ImpostazioniAudio, interattivo = false): Promise<boolean> {
    this.a = a;
    try {
      this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: interattivo ? 'interactive' : 'playback' });
      this.chiudiRisorsa = risorseLive.apri('audio');
      void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
      return this.pronto = Promise.resolve(false);
    }
    const ctx = this.ctx;
    this.pronto = (async () => {
      try {
        const url = URL.createObjectURL(new Blob([codiceWorklet()], { type: 'text/javascript' }));
        try { await ctx.audioWorklet.addModule(url); this.worklet = true; } finally { URL.revokeObjectURL(url); }
      } catch { this.worklet = false; }
      if (this.chiuso) return false;
      try {
        this.costruisci(ctx);
        this.ok = true;
        this.imposta(this.a!);
      } catch { this.ok = false; }
      return this.ok;
    })();
    return this.pronto;
  }

  private costruisci(ctx: AudioContext) {
    const a = this.a!;
    this.voce = new CatenaVoce(ctx, this.worklet, a.filtri);
    this.computer = new CatenaComputer(ctx, this.worklet, a);
    // l'abbassa-il-computer ascolta la voce già trattata
    this.computer.din.riceviLaterale(this.voce.uscita);
    this.destVoce = ctx.createMediaStreamDestination();
    this.destVoce.channelCount = 1;
    this.destComputer = ctx.createMediaStreamDestination();
    this.destMix = ctx.createMediaStreamDestination();
    this.voce.uscita.connect(this.destVoce);
    this.computer.uscita.connect(this.destComputer);
    this.somma = ctx.createGain();
    this.voce.uscita.connect(this.somma);
    this.computer.uscita.connect(this.somma);
    this.limSomma = new Din(ctx, this.worklet, paramSomma(), true);
    this.somma.connect(this.limSomma.nodo);
    this.limSomma.nodo.connect(this.destMix);
    this.misuraMix = new Misuratore(ctx, this.limSomma.nodo);
  }

  /** le scelte (volumi, bilanciamento, filtri): valgono subito, dal vivo */
  imposta(a: ImpostazioniAudio) {
    this.a = a;
    const ctx = this.ctx, v = this.voce, c = this.computer;
    if (!this.ok || !ctx || !v || !c) return;
    const t = ctx.currentTime, off = bilancioADb(a.bilancio), f = a.filtri;
    v.fader.gain.setTargetAtTime(guadagnoCanale(a.voce, off.voce), t, 0.02);
    c.fader.gain.setTargetAtTime(guadagnoCanale(a.computer, off.computer), t, 0.02);
    v.collegaPassaAlto(f.passaAlto);
    v.hp.type = 'highpass'; v.hp.frequency.value = f.passaAltoHz; v.hp.Q.value = 0.7071;
    v.eq[0].gain.value = f.eq ? f.calore : 0;
    v.eq[1].gain.value = f.eq ? f.presenza : 0;
    v.eq[2].gain.value = f.eq ? f.aria : 0;
    v.porta.manda(paramPorta(f));
    v.din.manda(paramDinVoce(f));
    v.lim.manda(paramLimiteVoce(f));
    c.din.manda(paramComputer(a));
  }

  collegaVoce(s: MediaStream | null) { this.voce?.metti(s); }
  collegaComputer(s: MediaStream | null) { this.computer?.metti(s); }

  /** ascoltare la voce trattata dalle casse (meglio con le cuffie: se no il microfono la riprende) */
  ascolta(si: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.voce) return;
    if (si && !this.ascolto) {
      this.ascolto = ctx.createGain();
      this.voce.uscita.connect(this.ascolto);
      this.ascolto.connect(ctx.destination);
    } else if (!si && this.ascolto) {
      this.ascolto.disconnect();
      try { this.voce.uscita.disconnect(this.ascolto); } catch { /* già staccato */ }
      this.ascolto = null;
    }
  }
  get ascoltando() { return !!this.ascolto; }

  // ——— le uscite: quello che si registra ———
  flussoVoce(): MediaStream { return this.destVoce!.stream; }
  flussoComputer(): MediaStream { return this.destComputer!.stream; }
  flussoMix(): MediaStream { return this.destMix!.stream; }

  // ——— i livelli per le barre ———
  livelli(): { voce: Picchi; computer: Picchi; mix: Picchi } {
    const zero: Picchi = [0, 0];
    if (!this.ok || !this.ctx || this.ctx.state === 'closed') return { voce: zero, computer: zero, mix: zero };
    return { voce: this.voce!.misura.picchi(), computer: this.computer!.misura.picchi(), mix: this.misuraMix!.picchi() };
  }

  /** quanto stanno abbassando i vari pezzi (dB, zero o meno) */
  riduzioni(): Riduzioni {
    const v = this.voce, c = this.computer;
    return {
      porta: v?.porta.gr.porta ?? 0, deess: v?.din.gr.deess ?? 0, comp: v?.din.gr.comp ?? 0,
      duck: c?.din.gr.duck ?? 0, limVoce: v?.lim.gr.lim ?? 0, limComputer: c?.din.gr.lim ?? 0,
    };
  }

  /** chiude tutto: gli ingressi si staccano, le uscite smettono di produrre tracce e il contesto audio si chiude (si può chiamare più volte) */
  chiudi() {
    this.chiuso = true;
    this.ok = false;
    try { this.ascolta(false); this.voce?.metti(null); this.computer?.metti(null); } catch { /* già staccati */ }
    const ctx = this.ctx;
    this.ctx = null;
    for (const d of [this.destVoce, this.destComputer, this.destMix]) risorseLive.fermaTutte(d?.stream);
    this.destVoce = this.destComputer = this.destMix = null;
    this.chiudiRisorsa();
    this.chiudiRisorsa = () => {};
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }
}
