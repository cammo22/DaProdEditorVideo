// Cambiare la frequenza di campionamento (48 kHz ↔ 44,1 kHz e le altre) senza rovinare l'audio.
// L'interpolazione lineare di wav.ts va bene per la voce da dare al riconoscimento, ma per la musica e per l'audio che
// resta nel montaggio serve un filtro vero: qui un sinc con finestra di Kaiser, a fase zero (simmetrico, non sposta
// niente: il campione n dell'uscita cade esattamente dove cadeva nell'ingresso) e a flusso (si dà un pezzo alla volta,
// con lo stato tra un pezzo e l'altro). Puro: niente DOM, si prova anche da Node.

/** quanti campioni di tabella per ogni campione di ingresso (più sono, più il filtro è preciso fra due punti) */
const RISOLUZIONE = 512;
/** quanti campioni di ingresso per lato, a taglio pieno (a 48↔44,1 kHz: attenuazione oltre −90 dB) */
const MEZZA_LARGHEZZA = 24;
const BETA = 9;

const tabelle = new Map<string, { t: Float32Array; mezza: number }>();

/** funzione di Bessel modificata di ordine 0 (serve alla finestra di Kaiser) */
function bessel0(x: number): number {
  let somma = 1, termine = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 60; k++) {
    termine *= q / (k * k);
    somma += termine;
    if (termine < somma * 1e-12) break;
  }
  return somma;
}

/** la risposta del filtro per distanza d (in campioni di ingresso), tabulata */
function tabella(taglio: number): { t: Float32Array; mezza: number } {
  const chiave = taglio.toFixed(6);
  let v = tabelle.get(chiave);
  if (!v) {
    const mezza = Math.ceil(MEZZA_LARGHEZZA / taglio);
    const n = mezza * RISOLUZIONE + 2;
    const t = new Float32Array(n);
    const i0 = bessel0(BETA);
    for (let k = 0; k < n; k++) {
      const d = k / RISOLUZIONE;
      const x = Math.PI * taglio * d;
      const sinc = d === 0 ? 1 : Math.sin(x) / x;
      const r = d / mezza;
      const finestra = r >= 1 ? 0 : bessel0(BETA * Math.sqrt(1 - r * r)) / i0;
      t[k] = taglio * sinc * finestra;
    }
    v = { t, mezza };
    tabelle.set(chiave, v);
  }
  return v;
}

/** quanti campioni escono da `n` campioni in ingresso (lo stesso conto per tutti i canali) */
export const lunghezzaUscita = (n: number, srIn: number, srOut: number) => Math.round((n * srOut) / srIn);

/** un canale alla volta: processa(pezzo) ... fine(). In tutto escono lunghezzaUscita(campioni entrati) campioni. */
export class Ricampionatore {
  private t: Float32Array;
  private mezza: number;
  /** l'ingresso ancora utile, a partire dal campione assoluto `inizio` */
  private buf = new Float32Array(0);
  private inizio = 0;
  /** quanti campioni sono entrati, quanti sono usciti */
  private entrati = 0;
  private usciti = 0;
  private uguale: boolean;

  constructor(readonly srIn: number, readonly srOut: number) {
    this.uguale = srIn === srOut;
    // sotto la metà della frequenza più bassa fra le due, con un po' di margine (si scende solo quando si riduce)
    const taglio = Math.min(1, srOut / srIn) * (srOut < srIn ? 0.975 : 1);
    ({ t: this.t, mezza: this.mezza } = tabella(taglio));
  }

  /** produce i campioni d'uscita da `usciti` a `fino` (esclusa); quello che manca in ingresso conta come silenzio */
  private produci(fino: number): Float32Array {
    const out = new Float32Array(Math.max(0, fino - this.usciti));
    const { t, mezza, buf, srIn, srOut, inizio } = this;
    let k = 0;
    for (let n = this.usciti; n < fino; n++) {
      // posizione in ingresso di questo campione d'uscita: n·srIn/srOut, con la frazione esatta (conti interi)
      const num = n * srIn;
      const i0 = Math.floor(num / srOut);
      const frac = (num - i0 * srOut) / srOut;
      let s = 0;
      for (let j = i0 - mezza + 1; j <= i0 + mezza; j++) {
        const r = j - inizio;
        if (r < 0 || r >= buf.length) continue;
        const x = Math.abs(j - i0 - frac) * RISOLUZIONE;
        const ix = Math.floor(x);
        if (ix >= t.length - 1) continue;
        s += buf[r] * (t[ix] + (t[ix + 1] - t[ix]) * (x - ix));
      }
      out[k++] = s;
    }
    this.usciti = fino;
    return out;
  }

  processa(x: Float32Array): Float32Array {
    if (this.uguale) { this.entrati += x.length; this.usciti += x.length; return x; }
    const nuovo = new Float32Array(this.buf.length + x.length);
    nuovo.set(this.buf);
    nuovo.set(x, this.buf.length);
    this.buf = nuovo;
    this.entrati += x.length;
    // il campione n si può produrre se tutto l'ingresso che gli serve (fino a i0 + mezza) è già arrivato
    const ultimoIngresso = this.inizio + this.buf.length - this.mezza - 1;
    const pronti = Math.floor((ultimoIngresso * this.srOut) / this.srIn) + 1;
    const out = this.produci(Math.max(this.usciti, Math.min(lunghezzaUscita(this.entrati, this.srIn, this.srOut), pronti)));
    // si butta l'ingresso che non serve più
    const serve = Math.floor((this.usciti * this.srIn) / this.srOut) - this.mezza;
    if (serve > this.inizio) { this.buf = this.buf.slice(serve - this.inizio); this.inizio = serve; }
    return out;
  }

  /** l'ultimo pezzo: dopo la fine c'è silenzio */
  fine(): Float32Array {
    if (this.uguale) return new Float32Array(0);
    return this.produci(lunghezzaUscita(this.entrati, this.srIn, this.srOut));
  }
}

/** tutto in un colpo (per i pezzi piccoli e per le prove) */
export function ricampionaSinc(x: Float32Array, srIn: number, srOut: number): Float32Array {
  if (srIn === srOut) return x;
  const r = new Ricampionatore(srIn, srOut);
  const a = r.processa(x), b = r.fine();
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
