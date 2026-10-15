// La catena della voce: quello che si fa a un parlato DOPO che il modello ha tolto il rumore, perché suoni "da studio".
//  · guadagno d'ingresso: porta il parlato a un livello noto (così il compressore lavora uguale su un microfono basso o alto);
//  · passa-alto a 80 Hz (via il rimbombo, il vento, i colpi sul tavolo);
//  · −2 dB a 300 Hz (meno "scatola") e +2 dB a 4,5 kHz (le parole si capiscono meglio);
//  · compressore morbido, stereo legato (il volume della voce non va su e giù);
//  · limitatore dolce sotto 0 dBFS (niente distorsione sui picchi).
// Il volume finale non si scrive nel file: si misura l'uscita (`Livello`) e la pagina lo mette nel volume della clip, così si
// può sempre cambiare. Puro: niente DOM, si prova da Node.

const db = (g: number) => 20 * Math.log10(Math.max(1e-9, g));
const gain = (d: number) => Math.pow(10, d / 20);

/** un filtro biquadratico (le formule di R. Bristow-Johnson), a flusso, un canale */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  static passaAlto(sr: number, f: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * f) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return new Biquad().coeff((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  static campana(sr: number, f: number, dB: number, q = 1): Biquad {
    const A = Math.pow(10, dB / 40), w = (2 * Math.PI * f) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return new Biquad().coeff(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }
  private coeff(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): this {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  processa(x: Float32Array) {
    let { x1, x2, y1, y2 } = this;
    const { b0, b1, b2, a1, a2 } = this;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      x[i] = y;
    }
    // niente numeri piccolissimi (denormali) che rallentano tutto nel silenzio
    this.x1 = x1; this.x2 = x2; this.y1 = Math.abs(y1) < 1e-20 ? 0 : y1; this.y2 = Math.abs(y2) < 1e-20 ? 0 : y2;
  }
}

/**
 * Il livello del parlato: si guarda il volume (RMS) a finestre da 50 ms e si prende quello sotto cui sta l'85% delle finestre
 * con dentro qualcosa (le pause non contano). Così una voce con tante pause e una che parla fitto danno lo stesso numero.
 * Tiene anche il picco.
 */
export class Livello {
  private ist = new Float64Array(200); // da −120 a −20... a passi di 0,5 dB: indice = (dB + 100) * 2
  private acc = 0; private nAcc = 0; private finestra: number;
  picco = 0;
  constructor(sr: number) { this.finestra = Math.max(1, Math.round(sr * 0.05)); }
  aggiungi(ch: Float32Array[]) {
    const n = ch[0].length, nc = ch.length;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < nc; c++) { const v = ch[c][i]; s += v * v; const a = v < 0 ? -v : v; if (a > this.picco) this.picco = a; }
      this.acc += s / nc;
      if (++this.nAcc === this.finestra) {
        const d = db(Math.sqrt(this.acc / this.nAcc));
        const k = Math.round((d + 100) * 2);
        if (k >= 0) this.ist[Math.min(this.ist.length - 1, k)]++;
        this.acc = 0; this.nAcc = 0;
      }
    }
  }
  /** il livello del parlato in dBFS (null se è tutto silenzio) */
  get parlato(): number | null {
    let tot = 0, top = -1;
    for (let k = 0; k < this.ist.length; k++) if (this.ist[k]) { tot += this.ist[k]; top = k; }
    if (top < 0) return null;
    // le finestre "con dentro qualcosa": entro 40 dB dalla più forte
    const min = Math.max(0, top - 80);
    let attive = 0;
    for (let k = min; k <= top; k++) attive += this.ist[k];
    let fino = 0;
    for (let k = min; k <= top; k++) { fino += this.ist[k]; if (fino >= attive * 0.85) return k / 2 - 100; }
    return top / 2 - 100;
  }
  get piccoDb() { return db(this.picco); }
}

/** a che livello si porta il parlato prima della catena, e dove deve stare alla fine (finestre da 50 ms, 85° percentile) */
export const LIVELLO_LAVORO = -20;
export const LIVELLO_FINALE = -16;

/** quanto alzare (o abbassare) l'ingresso perché il parlato arrivi a LIVELLO_LAVORO */
export function guadagnoIngresso(parlato: number | null): number {
  if (parlato === null) return 0;
  return Math.max(-12, Math.min(24, LIVELLO_LAVORO - parlato));
}

/** il volume da dare alla clip perché il parlato pulito stia a LIVELLO_FINALE, senza mai portare il picco sopra −1 dBFS */
export function volumeFinale(parlato: number | null, piccoDb: number): number {
  if (parlato === null) return 0;
  const g = Math.min(LIVELLO_FINALE - parlato, -1 - piccoDb);
  return Math.round(Math.max(-12, Math.min(12, g)) * 10) / 10;
}

/** la catena intera, a flusso: processa(ch) cambia i canali al loro posto; stesso numero di campioni in uscita */
export class CatenaVoce {
  private filtri: Biquad[][];
  private pre: number;
  private env = 0;
  private gRid = 1;
  private aEnv: number; private rEnv: number; private aG: number; private rG: number;
  readonly livello: Livello;
  constructor(readonly sr: number, canali: number, preDb = 0, private soglia = LIVELLO_LAVORO + 4, private rapporto = 3) {
    this.pre = gain(preDb);
    this.filtri = Array.from({ length: canali }, () => [Biquad.passaAlto(sr, 80), Biquad.campana(sr, 300, -2, 0.9), Biquad.campana(sr, 4500, 2, 0.8)]);
    const k = (ms: number) => Math.exp(-1 / ((ms / 1000) * sr));
    this.aEnv = k(5); this.rEnv = k(120); this.aG = k(8); this.rG = k(160);
    this.livello = new Livello(sr);
  }
  processa(ch: Float32Array[]) {
    const n = ch[0].length;
    for (let c = 0; c < ch.length; c++) {
      const x = ch[c];
      if (this.pre !== 1) for (let i = 0; i < n; i++) x[i] *= this.pre;
      for (const f of this.filtri[c]) f.processa(x);
    }
    // compressore legato: decide sul più forte dei canali, lo stesso guadagno per tutti (l'immagine stereo non si sposta)
    const ginocchio = 6;
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (let c = 0; c < ch.length; c++) { const v = ch[c][i]; const q = v < 0 ? -v : v; if (q > a) a = q; }
      this.env = a > this.env ? this.aEnv * this.env + (1 - this.aEnv) * a : this.rEnv * this.env + (1 - this.rEnv) * a;
      // l'inviluppo del picco sta ~3 dB sopra l'RMS del parlato: la soglia è in dB di picco
      const e = db(this.env) - 3;
      const sopra = e - this.soglia;
      let rid = 0;
      if (sopra > ginocchio / 2) rid = sopra * (1 - 1 / this.rapporto);
      else if (sopra > -ginocchio / 2) { const t = sopra + ginocchio / 2; rid = ((1 - 1 / this.rapporto) * t * t) / (2 * ginocchio); }
      const gT = gain(-rid);
      this.gRid = gT < this.gRid ? this.aG * this.gRid + (1 - this.aG) * gT : this.rG * this.gRid + (1 - this.rG) * gT;
      for (let c = 0; c < ch.length; c++) ch[c][i] = morbido(ch[c][i] * this.gRid);
    }
    this.livello.aggiungi(ch);
  }
}

/** limitatore dolce: sotto 0,8 non tocca niente, sopra si piega verso 0,98 senza mai superarlo */
export function morbido(x: number): number {
  const a = x < 0 ? -x : x;
  if (a <= 0.8) return x;
  const y = 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
  return x < 0 ? -y : y;
}
