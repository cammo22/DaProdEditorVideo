// Separare in una canzone la voce (il cantato) dalla base (la musica).
//
// 1. DEMUCS (htdemucs, Meta/Facebook Research, MIT): il modello AI. Gira con ONNX Runtime; qui sta tutto quello che sta
//    intorno al modello, riscritto in TypeScript dal codice di riferimento di demucs-web 1.0.2
//    (https://github.com/timcsy/demucs-web, src/processor.js e src/fft.js, MIT, © 2024): la STFT di 4096 campioni a
//    passi di 1024 che il modello vuole in ingresso, il modo di rimettere insieme le tracce che escono (tempo + frequenze),
//    i segmenti da 343980 campioni a 44,1 kHz. Differenze nostre: i segmenti si cuciono con una dissolvenza incrociata
//    solo dove si sovrappongono (e l'ultimo si sposta indietro invece di riempirsi di zeri), si lavora a flusso (mai tutto
//    l'audio in memoria), e l'ingresso si normalizza come fa Demucs (dividendo per la deviazione standard del brano).
//    La licenza del codice di riferimento sta in public/ai/LICENSE-demucs-web.txt (la scrive scripts/ai-locale.mjs).
// 2. RAPIDO: un ripiego senza AI per quando il modello non si può scaricare o eseguire. Lavora sul centro dello stereo
//    (la voce di solito sta al centro), è molto meno preciso e funziona solo con brani stereo.
// Puro: niente DOM e niente ONNX Runtime (il modello arriva come una funzione), così si prova anche da Node.

export const DEMUCS = {
  SR: 44100,
  FFT: 4096,
  HOP: 1024,
  /** la lunghezza fissa del segmento che il modello accetta */
  L: 343980,
  BINS: 2048,
  FRAMES: 336,
  SOVRAPPOSIZIONE: 0.25,
  TRACCE: ['drums', 'bass', 'other', 'vocals'] as const,
};
const { FFT: NFFT, HOP, L: LSEG, BINS, FRAMES } = DEMUCS;

// ——— FFT ———

const finestre = new Map<number, Float64Array>();
/** la finestra di Hann "periodica" (quella della STFT di Demucs) */
function hann(n: number): Float64Array {
  let w = finestre.get(n);
  if (!w) { w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n)); finestre.set(n, w); }
  return w;
}

/** FFT complessa in sede, radix-2; il verso inverso non divide per n */
class Fft {
  private rev: Uint32Array;
  private cs: Float64Array;
  private sn: Float64Array;
  constructor(readonly n: number) {
    const bit = Math.log2(n) | 0;
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bit; b++) { r = (r << 1) | (x & 1); x >>= 1; } this.rev[i] = r; }
    this.cs = new Float64Array(n / 2);
    this.sn = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) { this.cs[k] = Math.cos((2 * Math.PI * k) / n); this.sn[k] = -Math.sin((2 * Math.PI * k) / n); }
  }
  /** re/im in ingresso già nell'ordine normale; il risultato sta negli stessi array */
  trasforma(re: Float64Array, im: Float64Array, inverso: boolean) {
    const { n, rev, cs, sn } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
    }
    const s = inverso ? -1 : 1;
    for (let size = 2; size <= n; size <<= 1) {
      const mezza = size >> 1, passo = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < mezza; j++, k += passo) {
          const wr = cs[k], wi = s * sn[k];
          const a = i + j, b = a + mezza;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }
}
const ffts = new Map<number, Fft>();
const fftDi = (n: number) => { let f = ffts.get(n); if (!f) { f = new Fft(n); ffts.set(n, f); } return f; };

export interface Spettro { real: Float32Array; imag: Float32Array; frames: number; bins: number }

/** STFT con finestra di Hann e scala 1/√N (come "normalized=True" di PyTorch): frames×(N/2+1) bin */
export function stft(x: Float32Array, N: number, hop: number): Spettro {
  const frames = Math.floor((x.length - N) / hop) + 1;
  const bins = N / 2 + 1;
  const w = hann(N), scala = 1 / Math.sqrt(N), f = fftDi(N);
  const real = new Float32Array(frames * bins), imag = new Float32Array(frames * bins);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let t = 0; t < frames; t++) {
    const s = t * hop;
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    f.trasforma(re, im, false);
    const o = t * bins;
    for (let k = 0; k < bins; k++) { real[o + k] = re[k] * scala; imag[o + k] = im[k] * scala; }
  }
  return { real, imag, frames, bins };
}

/** la STFT al contrario: somma e rinormalizza le finestre (dove la somma è troppo piccola lascia lo zero) */
export function istft(real: Float32Array, imag: Float32Array, frames: number, bins: number, N: number, hop: number, lunghezza?: number): Float32Array {
  const lungo = lunghezza ?? (frames - 1) * hop + N;
  const out = new Float64Array(lungo), somma = new Float64Array(lungo);
  const w = hann(N), scala = Math.sqrt(N), f = fftDi(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let t = 0; t < frames; t++) {
    re.fill(0); im.fill(0);
    const o = t * bins;
    for (let k = 0; k < bins; k++) { re[k] = real[o + k]; im[k] = imag[o + k]; }
    // lo spettro di un segnale reale è simmetrico: la seconda metà è la prima coniugata (tranne 0 e Nyquist)
    for (let k = 1; k < bins - 1; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    f.trasforma(re, im, true);
    const s = t * hop;
    for (let i = 0; i < N && s + i < lungo; i++) { out[s + i] += (re[i] / N) * w[i] * scala; somma[s + i] += w[i] * w[i]; }
  }
  const r = new Float32Array(lungo);
  for (let i = 0; i < lungo; i++) r[i] = somma[i] > 1e-8 ? out[i] / somma[i] : out[i];
  return r;
}

/** copia con i bordi riflessi (come "reflect" di PyTorch: il campione sul bordo non si ripete) */
export function riflessione(x: Float32Array, sx: number, dx: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(sx + n + dx);
  for (let i = 0; i < sx; i++) out[i] = x[Math.min(sx - i, n - 1)];
  out.set(x, sx);
  for (let i = 0; i < dx; i++) out[sx + n + i] = x[Math.max(0, n - 2 - i)];
  return out;
}

// ——— dentro e fuori dal modello ———

/** quello che il modello vuole: la forma d'onda [1,2,L] e lo spettro [1,4,2048,336] (parte reale e immaginaria di sinistra e destra) */
export function preparaIngresso(sinistra: Float32Array, destra: Float32Array): { waveform: Float32Array; spettro: Float32Array } {
  const L = LSEG;
  const a = new Float32Array(L), b = new Float32Array(L);
  a.set(sinistra.subarray(0, Math.min(L, sinistra.length)));
  b.set(destra.subarray(0, Math.min(L, destra.length)));
  const le = Math.ceil(L / HOP);
  const pad = Math.floor(HOP / 2) * 3;
  const dx = pad + le * HOP - L;
  const centro = NFFT / 2;
  const tr = (x: Float32Array) => riflessione(riflessione(x, pad, dx), centro, centro);
  const sl = stft(tr(a), NFFT, HOP), sr = stft(tr(b), NFFT, HOP);
  const spettro = new Float32Array(4 * BINS * FRAMES);
  for (let f = 0; f < FRAMES; f++) {
    const src = (f + 2) * sl.bins;
    for (let k = 0; k < BINS; k++) {
      const d = k * FRAMES + f;
      spettro[d] = sl.real[src + k];
      spettro[BINS * FRAMES + d] = sl.imag[src + k];
      spettro[2 * BINS * FRAMES + d] = sr.real[src + k];
      spettro[3 * BINS * FRAMES + d] = sr.imag[src + k];
    }
  }
  const waveform = new Float32Array(2 * L);
  waveform.set(a, 0);
  waveform.set(b, L);
  return { waveform, spettro };
}

/**
 * Rimette in forma d'onda le tracce `tracce` (indici in drums, bass, other, vocals) dell'uscita del modello: la somma
 * del ramo nel tempo [1,4,2,L] e dell'inverso della STFT del ramo nelle frequenze [1,4,4,2048,336].
 * Il modello può non avere il ramo nelle frequenze: allora conta solo il tempo.
 */
export function ricomponi(tempo: Float32Array, freq: Float32Array | null, tracce: number[], L = LSEG): [Float32Array, Float32Array] {
  const out: [Float32Array, Float32Array] = [new Float32Array(L), new Float32Array(L)];
  for (const t of tracce) {
    for (let c = 0; c < 2; c++) {
      const da = (t * 2 + c) * L, o = out[c];
      for (let i = 0; i < L; i++) o[i] += tempo[da + i];
    }
  }
  if (!freq) return out;
  const pf = FRAMES + 4, pb = BINS + 1;
  const passo = BINS * FRAMES;
  for (let c = 0; c < 2; c++) {
    const re = new Float32Array(pf * pb), im = new Float32Array(pf * pb);
    for (const t of tracce) {
      const baseRe = (t * 4 + c * 2) * passo, baseIm = baseRe + passo;
      for (let f = 0; f < FRAMES; f++) {
        const dst = (f + 2) * pb;
        for (let k = 0; k < BINS; k++) { re[dst + k] += freq[baseRe + k * FRAMES + f]; im[dst + k] += freq[baseIm + k * FRAMES + f]; }
      }
    }
    const lungo = (pf - 1) * HOP + NFFT;
    const y = istft(re, im, pf, pb, NFFT, HOP, lungo);
    const da = NFFT / 2 + Math.floor(HOP / 2) * 3;
    const o = out[c];
    for (let i = 0; i < L; i++) o[i] += y[da + i];
  }
  return out;
}

/** il modello come funzione (la sessione di ONNX Runtime nel worker, o una finta nelle prove) */
export type EseguiModello = (waveform: Float32Array, spettro: Float32Array) => Promise<{ tempo: Float32Array; freq: Float32Array | null }>;

/** quanti campioni, ai bordi di un segmento, non contano (se c'è un segmento accanto che li copre) */
const BORDO = 3072;
/**
 * Il peso di un segmento a `u` campioni dal bordo, dentro una sovrapposizione lunga `o`: zero per i primi BORDO campioni, poi sale
 * dritto fino a 1 (a BORDO dalla fine della sovrapposizione). Il segmento dopo usa lo stesso conto da quella parte: i due pesi
 * fanno sempre 1. Se la sovrapposizione è troppo corta per tenere i bordi fuori, sale dritta da un capo all'altro.
 */
const rampa = (u: number, o: number) => {
  const b = o > 4 * BORDO ? BORDO : 0;
  return Math.max(1e-6, Math.min(1, (u + 0.5 - b) / (o - 2 * b)));
};

/** i punti d'inizio dei segmenti: a passi del 75% della lunghezza; l'ultimo si sposta indietro per finire esattamente sulla fine */
export function pianoSegmenti(totale: number, L = LSEG, sovrapposizione = DEMUCS.SOVRAPPOSIZIONE): number[] {
  const passo = Math.floor(L * (1 - sovrapposizione));
  const piano = [0];
  while (piano[piano.length - 1] + L < totale) {
    let s = piano[piano.length - 1] + passo;
    if (s + L >= totale) s = totale - L;
    piano.push(s);
  }
  return piano;
}

export interface OpzioniDemucs {
  /** quanti campioni (a 44,1 kHz) arriveranno in tutto */
  totale: number;
  /** media e deviazione standard del brano (mono): Demucs vuole l'ingresso normalizzato. dev ≤ 0 = non normalizzare */
  media?: number;
  dev?: number;
  esegui: EseguiModello;
  /** i pezzi finiti, nell'ordine: voce = traccia vocals, base = drums + bass + other (a volume vero) */
  uscita: (voce: [Float32Array, Float32Array], base: [Float32Array, Float32Array]) => void | Promise<void>;
  avanza?: (k: number) => void;
  fermato?: () => boolean;
}

/** la media e la deviazione standard del mono (L+R)/2, per la normalizzazione: si calcolano a pezzi con questo accumulatore */
export class StatisticheMono {
  private n = 0; private s = 0; private s2 = 0;
  aggiungi(l: Float32Array, r?: Float32Array) {
    for (let i = 0; i < l.length; i++) { const x = r ? (l[i] + r[i]) * 0.5 : l[i]; this.s += x; this.s2 += x * x; }
    this.n += l.length;
  }
  get media() { return this.n ? this.s / this.n : 0; }
  get dev() { return this.n ? Math.sqrt(Math.max(0, this.s2 / this.n - this.media * this.media)) : 0; }
}

/** Demucs a flusso: push(L, R) a pezzi qualunque ... fine(). Quello che esce passa da opz.uscita, nell'ordine e senza buchi. */
export class SeparatoreDemucs {
  private piano: number[];
  private k = 0;
  /** l'ingresso ancora utile: parte dal campione assoluto `inizio` */
  private inL = new Float32Array(0);
  private inR = new Float32Array(0);
  private inizio = 0;
  private ricevuti = 0;
  /** gli accumulatori della cucitura: partono dal campione assoluto `emessi` */
  private emessi = 0;
  private accV: [Float32Array, Float32Array] = [new Float32Array(LSEG), new Float32Array(LSEG)];
  private accB: [Float32Array, Float32Array] = [new Float32Array(LSEG), new Float32Array(LSEG)];
  private accW = new Float32Array(LSEG);
  private scritto = 0;
  private media: number;
  private dev: number;

  constructor(private o: OpzioniDemucs) {
    this.piano = pianoSegmenti(o.totale);
    this.media = o.dev && o.dev > 1e-6 ? (o.media ?? 0) : 0;
    this.dev = o.dev && o.dev > 1e-6 ? o.dev : 1;
  }

  /** quanti segmenti in tutto (per la barra) */
  get segmenti() { return this.piano.length; }

  async push(l: Float32Array, r: Float32Array) {
    const n = Math.min(l.length, r.length, this.o.totale - this.ricevuti);
    if (n > 0) {
      const a = new Float32Array(this.inL.length + n), b = new Float32Array(this.inR.length + n);
      a.set(this.inL); a.set(l.subarray(0, n), this.inL.length);
      b.set(this.inR); b.set(r.subarray(0, n), this.inR.length);
      this.inL = a; this.inR = b;
      this.ricevuti += n;
    }
    await this.lavora();
  }

  private async lavora() {
    while (this.k < this.piano.length && this.ricevuti >= Math.min(this.piano[this.k] + LSEG, this.o.totale)) {
      if (this.o.fermato?.()) throw new Error('fermato');
      await this.segmento(this.k);
      this.k++;
      this.o.avanza?.(this.k / this.piano.length);
    }
  }

  /** a ingresso finito: se è arrivato meno del previsto si completa con il silenzio */
  async fine() {
    if (this.ricevuti < this.o.totale) {
      const manca = this.o.totale - this.ricevuti;
      await this.push(new Float32Array(manca), new Float32Array(manca));
    }
    await this.lavora();
  }

  private async segmento(k: number) {
    const { piano } = this;
    const { totale } = this.o;
    const s = piano[k];
    const v = Math.min(LSEG, totale - s);
    const da = s - this.inizio;
    const sl = new Float32Array(LSEG), sr = new Float32Array(LSEG);
    const m = this.media, d = this.dev;
    for (let i = 0; i < v; i++) { sl[i] = (this.inL[da + i] - m) / d; sr[i] = (this.inR[da + i] - m) / d; }
    const { waveform, spettro } = preparaIngresso(sl, sr);
    const ris = await this.o.esegui(waveform, spettro);
    const voce = ricomponi(ris.tempo, ris.freq, [3]);
    const base = ricomponi(ris.tempo, ris.freq, [0, 1, 2]);
    // la dissolvenza incrociata solo dove questo segmento si sovrappone al precedente / al successivo. Gli ultimi campioni di
    // un segmento sono i meno affidabili (alla STFT mancano i fotogrammi oltre il bordo): nella zona di sovrapposizione il
    // segmento dopo prende tutto il peso prima che quello di prima arrivi ai suoi BORDO campioni finali, e viceversa
    const ultimo = k === piano.length - 1;
    const oPrima = k > 0 ? Math.min(piano[k - 1] + LSEG, totale) - s : 0;
    const oDopo = !ultimo ? Math.min(s + LSEG, totale) - piano[k + 1] : 0;
    const off = s - this.emessi;
    for (let i = 0; i < v; i++) {
      let w = 1;
      if (i < oPrima) w = Math.min(w, rampa(i, oPrima));
      if (oDopo && i >= v - oDopo) w = Math.min(w, rampa(v - 1 - i, oDopo));
      const j = off + i;
      this.accV[0][j] += voce[0][i] * w; this.accV[1][j] += voce[1][i] * w;
      this.accB[0][j] += base[0][i] * w; this.accB[1][j] += base[1][i] * w;
      this.accW[j] += w;
    }
    this.scritto = Math.max(this.scritto, off + v);
    // quello che precede il segmento dopo è finito: esce, e gli accumulatori scorrono
    const fino = ultimo ? totale : piano[k + 1];
    const n = fino - this.emessi;
    if (n > 0) {
      const w = this.accW;
      const fuori = (a: Float32Array) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = (a[i] / w[i]) * d; return o; };
      await this.o.uscita([fuori(this.accV[0]), fuori(this.accV[1])], [fuori(this.accB[0]), fuori(this.accB[1])]);
      for (const a of [this.accV[0], this.accV[1], this.accB[0], this.accB[1], this.accW]) { a.copyWithin(0, n, this.scritto); a.fill(0, Math.max(0, this.scritto - n)); }
      this.scritto -= n;
      this.emessi = fino;
    }
    // si butta l'ingresso che non serve più
    if (!ultimo) {
      const via = piano[k + 1] - this.inizio;
      if (via > 0) { this.inL = this.inL.slice(via); this.inR = this.inR.slice(via); this.inizio = piano[k + 1]; }
    }
  }
}

// ——— il ripiego rapido (senza AI) ———

/** una scalinata morbida da 0 (sotto a) a 1 (sopra b) */
const gradino = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export type UscitaStem = (voce: [Float32Array, Float32Array], base: [Float32Array, Float32Array]) => void | Promise<void>;

/**
 * La voce dal centro dello stereo, a flusso. Per ogni frequenza di ogni istante si guarda quanto destra e sinistra sono
 * uguali (centro = quasi tutto uguale, strumenti spostati da una parte = diversi); la voce è quel centro, tenuto fra circa
 * 150 Hz e 7 kHz (sotto ci sono cassa e basso, che stanno al centro anche loro). La base è TUTTO il resto (originale − voce),
 * quindi voce + base fanno sempre esattamente l'originale. Molto meno preciso di Demucs: chitarre e tastiere al centro finiscono
 * nella voce, la voce con l'eco stereo ne lascia un po' nella base.
 */
export class SeparatoreRapido {
  static readonly N = 2048;
  static readonly H = 512;
  /** l'ingresso e la voce, entrambi a partire dal campione assoluto `emessi` (quelli prima sono già usciti) */
  private inL = new Float32Array(0);
  private inR = new Float32Array(0);
  private voce = new Float64Array(SeparatoreRapido.N);
  private ricevuti = 0;
  private emessi = 0;
  /** il prossimo fotogramma di analisi: parte prima dell'inizio, così ogni campione cade in 4 fotogrammi */
  private proxima = -(SeparatoreRapido.N - SeparatoreRapido.H);
  private maschera: Float64Array;

  constructor(sr: number, private totale: number, private uscita: UscitaStem) {
    const N = SeparatoreRapido.N;
    this.maschera = new Float64Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) { const f = (k * sr) / N; this.maschera[k] = gradino(f, 100, 200) * (1 - gradino(f, 7000, 10000)); }
  }

  async push(l: Float32Array, r: Float32Array) {
    const n = Math.min(l.length, r.length, this.totale - this.ricevuti);
    if (n > 0) {
      const a = new Float32Array(this.inL.length + n), b = new Float32Array(this.inR.length + n);
      a.set(this.inL); a.set(l.subarray(0, n), this.inL.length);
      b.set(this.inR); b.set(r.subarray(0, n), this.inR.length);
      this.inL = a; this.inR = b;
      this.ricevuti += n;
    }
    await this.lavora(false);
  }

  private async lavora(fine: boolean) {
    const { N, H } = SeparatoreRapido;
    while (this.proxima < this.totale && (fine || this.proxima + N <= this.ricevuti)) {
      const p = this.proxima;
      this.fotogramma(p);
      this.proxima += H;
      // dopo questo fotogramma i campioni prima di p+H sono finiti
      await this.emetti(Math.min(p + H, this.totale));
    }
  }

  private fotogramma(p: number) {
    const { N } = SeparatoreRapido;
    const f = fftDi(N), w = hann(N);
    const re1 = new Float64Array(N), im1 = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const j = p + i - this.emessi;
      // prima dell'inizio e dopo la fine (arrivata) è silenzio
      if (p + i >= 0 && j >= 0 && j < this.inL.length) { re1[i] = this.inL[j] * w[i]; re2[i] = this.inR[j] * w[i]; }
    }
    f.trasforma(re1, im1, false);
    f.trasforma(re2, im2, false);
    const reV = new Float64Array(N), imV = new Float64Array(N);
    for (let k = 0; k <= N / 2; k++) {
      const mr = (re1[k] + re2[k]) / 2, mi = (im1[k] + im2[k]) / 2;
      const sr = (re1[k] - re2[k]) / 2, si = (im1[k] - im2[k]) / 2;
      const pM = mr * mr + mi * mi, pS = sr * sr + si * si;
      const g = gradino(pM / (pM + pS + 1e-12), 0.72, 0.97) * this.maschera[k];
      reV[k] = mr * g; imV[k] = mi * g;
      if (k > 0 && k < N / 2) { reV[N - k] = reV[k]; imV[N - k] = -imV[k]; }
    }
    f.trasforma(reV, imV, true);
    // sintesi con la stessa finestra: la somma di hann² a passi di N/4 vale 1,5
    for (let i = 0; i < N; i++) {
      const a = p + i;
      if (a >= this.emessi) this.voce[a - this.emessi] += ((reV[i] / N) * w[i]) / 1.5;
    }
  }

  private async emetti(fino: number) {
    const n = fino - this.emessi;
    if (n <= 0) return;
    const l = new Float32Array(n), r = new Float32Array(n), v = new Float32Array(n);
    for (let i = 0; i < n; i++) { v[i] = this.voce[i]; l[i] = this.inL[i] - v[i]; r[i] = this.inR[i] - v[i]; }
    this.inL = this.inL.slice(n); this.inR = this.inR.slice(n);
    this.voce.copyWithin(0, n);
    this.voce.fill(0, this.voce.length - n);
    this.emessi = fino;
    await this.uscita([v, v.slice()], [l, r]);
  }

  async fine() {
    if (this.ricevuti < this.totale) { const m = this.totale - this.ricevuti; await this.push(new Float32Array(m), new Float32Array(m)); }
    await this.lavora(true);
    if (this.emessi < this.totale) await this.emetti(this.totale);
  }
}

// ——— un "modello" finto, con le forme giuste (per le prove) ———

/**
 * Fa le veci di Demucs con le stesse forme in ingresso e in uscita (tempo [4,2,L], frequenze [4,4,2048,336]) ma con
 * un conto semplice e prevedibile, così si prova tutto quello che sta intorno al modello (la STFT in andata e in ritorno, i
 * segmenti, la cucitura, la normalizzazione, il volume): la voce è il 75% di quello che sta fra 300 e 3400 Hz (ramo delle
 * frequenze), la batteria il 25% di tutto (ramo del tempo), il resto sta in "other"; la somma delle quattro tracce
 * ridà l'ingresso. Come un modello vero, "non sente niente" se l'ingresso non è normalizzato: sotto un volume
 * (rms 0,05) restituisce silenzio.
 */
export function modelloFinto(opz: { attesaMs?: number; contatore?: { chiamate: number } } = {}): EseguiModello {
  return async (waveform, spettro) => {
    if (opz.contatore) opz.contatore.chiamate++;
    if (opz.attesaMs) await new Promise((ok) => setTimeout(ok, opz.attesaMs));
    const L = LSEG;
    let somma = 0;
    for (let i = 0; i < waveform.length; i++) somma += waveform[i] * waveform[i];
    const sente = Math.sqrt(somma / waveform.length) >= 0.05;
    const tempo = new Float32Array(4 * 2 * L);
    const freq = new Float32Array(4 * 4 * BINS * FRAMES);
    if (!sente) return { tempo, freq };
    for (let c = 0; c < 2; c++) for (let i = 0; i < L; i++) tempo[(0 * 2 + c) * L + i] = 0.25 * waveform[c * L + i];
    const passo = BINS * FRAMES;
    for (let k = 0; k < BINS; k++) {
      const f = (k * DEMUCS.SR) / NFFT;
      const m = gradino(f, 300, 400) * (1 - gradino(f, 3400, 3600));
      for (let c = 0; c < 4; c++) {
        for (let fr = 0; fr < FRAMES; fr++) {
          const x = spettro[c * passo + k * FRAMES + fr];
          freq[(3 * 4 + c) * passo + k * FRAMES + fr] = 0.75 * m * x;
          freq[(2 * 4 + c) * passo + k * FRAMES + fr] = 0.75 * (1 - m) * x;
        }
      }
    }
    return { tempo, freq };
  };
}

