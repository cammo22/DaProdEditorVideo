// Togliere il rumore da un parlato con MossFormer2_SE_48K (ClearerVoice-Studio di Alibaba, Apache-2.0,
// https://huggingface.co/alibabasglab/MossFormer2_SE_48K): una rete che da 60 filtri mel (con le loro derivate) di un pezzo
// di 4 secondi a 48 kHz dà una maschera per le 961 frequenze di ogni fotogramma; la maschera si applica alla STFT e si torna
// all'audio. Il modello (ONNX, quantizzato a 8 bit, ~94 MB, `ipsilondev/MossFormer2-SE-48K-ONNX`) fa solo la maschera:
// tutto il resto sta qui, in codice puro (si prova da Node), con la stessa matematica del riferimento in Python/torchaudio:
//  · fbank alla Kaldi: finestre da 40 ms ogni 8 ms (1920 / 384 campioni a 48 kHz), tolta la media, pre-enfasi 0,97, finestra di
//    Hamming simmetrica, FFT a 2048, energie in 60 filtri mel (20 Hz → Nyquist), logaritmo; poi derivata e derivata seconda
//    (compute_deltas di torchaudio, finestra di 5, bordi replicati) → 180 numeri per fotogramma;
//  · STFT: Hamming simmetrica da 1920, passo 384, 961 frequenze, senza bordi aggiunti; ISTFT con la somma delle finestre al quadrato.
// L'audio entra moltiplicato per 32768 (il modello è stato addestrato così) e torna diviso.
// Il flusso (`PulitoreMossFormer`) taglia l'audio in finestre da 4 s con passo 3 s e scarta mezzo secondo per lato (le reti con
// attenzione sbagliano di più ai bordi della finestra), e riesce con esattamente tanti campioni quanti ne sono entrati.

export const MF = {
  SR: 48000,
  WIN: 1920,
  HOP: 384,
  NMEL: 60,
  /** la finestra del modello: 4 s = 496 fotogrammi */
  FINESTRA: 192000,
  T: 496,
  BINS: 961,
  FEAT: 180,
  /** passo fra due finestre e quanto si butta per lato quando si cuciono */
  PASSO: 144000,
  SCARTO: 24000,
  SCALA: 32768,
} as const;

/** dalla maschera: tutte le frequenze di tutti i fotogrammi (T×961), dato il fbank (T×180) */
export type EseguiMaschera = (feat: Float32Array) => Promise<Float32Array>;

// ——— FFT ———

/** FFT complessa in loco, lunghezza potenza di due */
function fft(re: Float64Array, im: Float64Array, inverso = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverso ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** FFT di lunghezza qualunque (1920 non è una potenza di due) con l'algoritmo di Bluestein, sopra la FFT a potenza di due */
class FftQualunque {
  private m: number;
  private cr: Float64Array; private ci: Float64Array;       // la chirp
  private br: Float64Array; private bi: Float64Array;       // la FFT della chirp coniugata
  private ar: Float64Array; private ai: Float64Array;
  constructor(readonly n: number) {
    let m = 1;
    while (m < 2 * n - 1) m <<= 1;
    this.m = m;
    this.cr = new Float64Array(n); this.ci = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const ang = (Math.PI * ((k * k) % (2 * n))) / n;
      this.cr[k] = Math.cos(ang); this.ci[k] = -Math.sin(ang);
    }
    this.br = new Float64Array(m); this.bi = new Float64Array(m);
    this.br[0] = this.cr[0]; this.bi[0] = -this.ci[0];
    for (let k = 1; k < n; k++) { this.br[k] = this.br[m - k] = this.cr[k]; this.bi[k] = this.bi[m - k] = -this.ci[k]; }
    fft(this.br, this.bi);
    this.ar = new Float64Array(m); this.ai = new Float64Array(m);
  }
  /** x reale di n campioni → le prime n/2+1 frequenze */
  reale(x: ArrayLike<number>, re: Float64Array, im: Float64Array) {
    const { n, m, cr, ci, ar, ai, br, bi } = this;
    ar.fill(0); ai.fill(0);
    for (let k = 0; k < n; k++) { ar[k] = x[k] * cr[k]; ai[k] = x[k] * ci[k]; }
    fft(ar, ai);
    for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
    fft(ar, ai, true);
    const norm = 1 / m;
    for (let k = 0; k <= n / 2; k++) {
      const r = ar[k] * norm, i = ai[k] * norm;
      re[k] = r * cr[k] - i * ci[k]; im[k] = r * ci[k] + i * cr[k];
    }
  }
  /** le n/2+1 frequenze di uno spettro di un segnale reale → n campioni reali (già divisi per n) */
  inversaReale(re: ArrayLike<number>, im: ArrayLike<number>, out: Float64Array) {
    const { n, m, cr, ci, ar, ai, br, bi } = this;
    // si ricostruisce lo spettro completo (simmetria coniugata) e si usa la trasformata inversa come diretta del coniugato
    ar.fill(0); ai.fill(0);
    const r = new Float64Array(n), i = new Float64Array(n);
    for (let k = 0; k <= n / 2; k++) { r[k] = re[k]; i[k] = -im[k]; }          // coniugato
    for (let k = 1; k < n / 2; k++) { r[n - k] = re[k]; i[n - k] = im[k]; }    // simmetria: X[n-k] = conj(X[k]) → coniugato = X[k]
    for (let k = 0; k < n; k++) { ar[k] = r[k] * cr[k] - i[k] * ci[k]; ai[k] = r[k] * ci[k] + i[k] * cr[k]; }
    fft(ar, ai);
    for (let k = 0; k < m; k++) { const x = ar[k] * br[k] - ai[k] * bi[k], y = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = x; ai[k] = y; }
    fft(ar, ai, true);
    const norm = 1 / (m * n);
    for (let k = 0; k < n; k++) out[k] = (ar[k] * cr[k] - ai[k] * ci[k]) * norm;   // parte reale del coniugato = reale
  }
}

// ——— le finestre e i filtri ———

const hamming = (n: number) => { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)); return w; };
const HAMMING = hamming(MF.WIN);

/** i filtri mel di Kaldi: [60][1025] (l'ultima colonna, Nyquist, è zero) */
function filtriMel(): Float64Array[] {
  const padded = 2048, nfft = padded / 2, bw = MF.SR / padded;
  const mel = (f: number) => 1127 * Math.log(1 + f / 700);
  const ml = mel(20), mh = mel(MF.SR / 2);
  const d = (mh - ml) / (MF.NMEL + 1);
  const banche: Float64Array[] = [];
  for (let b = 0; b < MF.NMEL; b++) {
    const left = ml + b * d, center = ml + (b + 1) * d, right = ml + (b + 2) * d;
    const riga = new Float64Array(nfft + 1);
    for (let k = 0; k < nfft; k++) {
      const m = mel(bw * k);
      riga[k] = Math.max(0, Math.min((m - left) / (center - left), (right - m) / (right - center)));
    }
    banche.push(riga);
  }
  return banche;
}
const BANCHE = filtriMel();
const EPS = 1.1920928955078125e-7;

let fftBluestein: FftQualunque | null = null;
const bluestein = () => (fftBluestein ??= new FftQualunque(MF.WIN));

const nFotogrammi = (campioni: number) => Math.max(0, Math.floor((campioni - MF.WIN) / MF.HOP) + 1);

/** le 180 caratteristiche (60 mel + derivata + derivata seconda) di ogni fotogramma: T×180. `x` è l'audio già per 32768 */
export function caratteristiche(x: ArrayLike<number>): Float32Array {
  const T = nFotogrammi(x.length);
  const mel = new Float64Array(T * MF.NMEL);
  const re = new Float64Array(2048), im = new Float64Array(2048), fr = new Float64Array(MF.WIN);
  for (let t = 0; t < T; t++) {
    const o = t * MF.HOP;
    let media = 0;
    for (let i = 0; i < MF.WIN; i++) media += x[o + i];
    media /= MF.WIN;
    // tolta la media e la pre-enfasi (il primo campione si ripete)
    let prec = x[o] - media;
    for (let i = 0; i < MF.WIN; i++) { const v = x[o + i] - media; fr[i] = (v - 0.97 * prec) * HAMMING[i]; prec = v; }
    // (il primo campione ha come precedente se stesso: v - 0,97 v)
    re.fill(0); im.fill(0);
    re.set(fr);
    fft(re, im);
    for (let b = 0; b < MF.NMEL; b++) {
      const riga = BANCHE[b];
      let e = 0;
      for (let k = 0; k < 1024; k++) { const p = re[k] * re[k] + im[k] * im[k]; e += p * riga[k]; }
      mel[t * MF.NMEL + b] = Math.log(Math.max(e, EPS));
    }
  }
  const derivata = (v: Float64Array) => {
    const d = new Float64Array(v.length);
    for (let t = 0; t < T; t++) {
      for (let b = 0; b < MF.NMEL; b++) {
        const a = (s: number) => v[Math.min(T - 1, Math.max(0, t + s)) * MF.NMEL + b];
        d[t * MF.NMEL + b] = (1 * (a(1) - a(-1)) + 2 * (a(2) - a(-2))) / 10;
      }
    }
    return d;
  };
  const d1 = derivata(mel), d2 = derivata(d1);
  const out = new Float32Array(T * MF.FEAT);
  for (let t = 0; t < T; t++) {
    for (let b = 0; b < MF.NMEL; b++) {
      out[t * MF.FEAT + b] = mel[t * MF.NMEL + b];
      out[t * MF.FEAT + MF.NMEL + b] = d1[t * MF.NMEL + b];
      out[t * MF.FEAT + 2 * MF.NMEL + b] = d2[t * MF.NMEL + b];
    }
  }
  return out;
}

/** la STFT (T×961, parte reale e immaginaria) di un pezzo di audio già per 32768 */
export function analisi(x: ArrayLike<number>): { re: Float32Array; im: Float32Array; T: number } {
  const T = nFotogrammi(x.length);
  const re = new Float32Array(T * MF.BINS), im = new Float32Array(T * MF.BINS);
  const fr = new Float64Array(MF.WIN), r = new Float64Array(MF.BINS), i = new Float64Array(MF.BINS);
  const f = bluestein();
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < MF.WIN; k++) fr[k] = x[t * MF.HOP + k] * HAMMING[k];
    f.reale(fr, r, i);
    for (let k = 0; k < MF.BINS; k++) { re[t * MF.BINS + k] = r[k]; im[t * MF.BINS + k] = i[k]; }
  }
  return { re, im, T };
}

/** dall'altra parte: spettri (T×961) → audio lungo `lunghezza` (somma delle finestre e divisione per la somma dei loro quadrati) */
export function sintesi(re: Float32Array, im: Float32Array, T: number, lunghezza: number): Float32Array {
  const lungo = (T - 1) * MF.HOP + MF.WIN;
  const out = new Float64Array(lungo), env = new Float64Array(lungo);
  const r = new Float64Array(MF.BINS), i = new Float64Array(MF.BINS), fr = new Float64Array(MF.WIN);
  const f = bluestein();
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < MF.BINS; k++) { r[k] = re[t * MF.BINS + k]; i[k] = im[t * MF.BINS + k]; }
    f.inversaReale(r, i, fr);
    const o = t * MF.HOP;
    for (let k = 0; k < MF.WIN; k++) { out[o + k] += fr[k] * HAMMING[k]; env[o + k] += HAMMING[k] * HAMMING[k]; }
  }
  const res = new Float32Array(lunghezza);
  for (let k = 0; k < Math.min(lunghezza, lungo); k++) res[k] = out[k] / Math.max(env[k], 1e-11);
  return res;
}

/** un pezzo di esattamente FINESTRA campioni (audio vero, tra -1 e 1) → lo stesso pezzo con la maschera applicata */
export async function pulisciFinestra(x: Float32Array, esegui: EseguiMaschera): Promise<Float32Array> {
  const s = new Float64Array(MF.FINESTRA);
  for (let i = 0; i < x.length && i < MF.FINESTRA; i++) s[i] = x[i] * MF.SCALA;
  const maschera = await esegui(caratteristiche(s));
  const { re, im, T } = analisi(s);
  if (maschera.length < T * MF.BINS) throw new Error('il modello ha risposto con una maschera troppo corta: non è il modello giusto');
  for (let k = 0; k < T * MF.BINS; k++) { re[k] *= maschera[k]; im[k] *= maschera[k]; }
  const y = sintesi(re, im, T, MF.FINESTRA);
  for (let i = 0; i < y.length; i++) y[i] /= MF.SCALA;
  return y;
}

const rms = (x: Float32Array) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };

/**
 * Un canale (mono) a flusso: push(pezzo) ... fine(). Escono in tutto tanti campioni quanti ne sono entrati, allineati con
 * l'ingresso (il modello non ha ritardo: ogni finestra si ricuce a quella prima senza spostare niente).
 */
export class PulitoreMossFormer {
  private buf = new Float32Array(MF.FINESTRA * 2);
  /** indice globale del primo campione di `buf` */
  private base = 0;
  private entrati = 0;
  /** il prossimo campione da restituire */
  private emesso = 0;
  private nFinestre = 0;

  /**
   * @param mescola 1 = tutto pulito, meno = si tiene un po' dell'originale
   * @param silenzio sotto questo livello (rms, tra 0 e 1) la finestra non passa dal modello: esce com'è (silenzio, o lati di un parlato mono)
   */
  constructor(private esegui: EseguiMaschera, private mescola = 1, private silenzio = 1e-5) {}

  private fetta(da: number, a: number): Float32Array {
    const out = new Float32Array(Math.max(0, a - da));
    const lo = Math.max(da, this.base), hi = Math.min(a, this.base + this.dentro());
    if (hi > lo) out.set(this.buf.subarray(lo - this.base, hi - this.base), lo - da);
    return out;
  }
  private dentro() { return Math.min(this.buf.length, this.entrati - this.base); }

  private async finestra(s: number): Promise<Float32Array> {
    const dentro = this.fetta(s, s + MF.FINESTRA);
    if (rms(dentro) < this.silenzio) return dentro;
    return pulisciFinestra(dentro, this.esegui);
  }

  private mescolaCon(pulito: Float32Array, secco: Float32Array): Float32Array {
    const m = this.mescola;
    if (m >= 1) return pulito;
    for (let i = 0; i < pulito.length; i++) pulito[i] = m * pulito[i] + (1 - m) * secco[i];
    return pulito;
  }

  /** butta quello che non serve più davanti al buffer */
  private pota() {
    const serve = Math.max(0, this.emesso - MF.SCARTO - 1);
    const daTogliere = Math.min(serve, this.entrati) - this.base;
    if (daTogliere < MF.FINESTRA) return;
    this.buf.copyWithin(0, daTogliere, this.entrati - this.base);
    this.base += daTogliere;
  }

  async push(x: Float32Array): Promise<Float32Array> {
    if (this.entrati - this.base + x.length > this.buf.length) {
      const nuovo = new Float32Array(Math.max(this.buf.length * 2, this.entrati - this.base + x.length + MF.FINESTRA));
      nuovo.set(this.buf.subarray(0, this.entrati - this.base));
      this.buf = nuovo;
    }
    this.buf.set(x, this.entrati - this.base);
    this.entrati += x.length;
    const pezzi: Float32Array[] = [];
    for (;;) {
      const s = this.nFinestre * MF.PASSO;
      if (this.entrati < s + MF.FINESTRA) break;
      const y = await this.finestra(s);
      const da = this.nFinestre === 0 ? 0 : MF.SCARTO, a = MF.FINESTRA - MF.SCARTO;
      pezzi.push(this.mescolaCon(y.slice(da, a), this.fetta(s + da, s + a)));
      this.emesso = s + a;
      this.nFinestre++;
      this.pota();
    }
    return unisci(pezzi);
  }

  /** gli ultimi campioni: l'ultima finestra si completa con silenzio */
  async fine(): Promise<Float32Array> {
    if (this.emesso >= this.entrati) return new Float32Array(0);
    const s = this.nFinestre === 0 ? 0 : this.emesso - MF.SCARTO;
    const y = await this.finestra(s);
    const da = this.emesso - s;
    const fuori = this.mescolaCon(y.slice(da, this.entrati - s), this.fetta(this.emesso, this.entrati));
    this.emesso = this.entrati;
    return fuori;
  }
}

function unisci(pezzi: Float32Array[]): Float32Array {
  const n = pezzi.reduce((a, b) => a + b.length, 0);
  const out = new Float32Array(n);
  let p = 0;
  for (const b of pezzi) { out.set(b, p); p += b.length; }
  return out;
}

/**
 * Uno stereo: il modello è mono, quindi si lavora su centro e lati come per DeepFilterNet (L = C + S, R = C − S): l'immagine
 * stereo non ondeggia e due canali uguali danno due canali uguali. I lati, quasi sempre quasi vuoti, non passano dal modello
 * finché sono sotto il livello del silenzio (un parlato registrato in mono ha i lati a zero: si fa un lavoro solo).
 */
export class PulitoreMossFormerStereo {
  private c: PulitoreMossFormer;
  private s: PulitoreMossFormer;
  constructor(esegui: EseguiMaschera, mescola = 1) {
    this.c = new PulitoreMossFormer(esegui, mescola);
    this.s = new PulitoreMossFormer(esegui, mescola, 2e-3);
  }
  private unisci(c: Float32Array, s: Float32Array): [Float32Array, Float32Array] {
    const n = Math.min(c.length, s.length);
    const l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) { l[i] = c[i] + s[i]; r[i] = c[i] - s[i]; }
    return [l, r];
  }
  async push(l: Float32Array, r: Float32Array): Promise<[Float32Array, Float32Array]> {
    const c = new Float32Array(l.length), s = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) { c[i] = (l[i] + r[i]) * 0.5; s[i] = (l[i] - r[i]) * 0.5; }
    const [oc, os] = [await this.c.push(c), await this.s.push(s)];
    return this.unisci(oc, os);
  }
  async fine(): Promise<[Float32Array, Float32Array]> {
    const [oc, os] = [await this.c.fine(), await this.s.fine()];
    return this.unisci(oc, os);
  }
}
