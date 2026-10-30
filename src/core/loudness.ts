// La misura del volume come la fanno YouTube, Spotify e le TV: ITU-R BS.1770-4 (la stessa idea dell'EBU R128).
// Tre numeri veri, non stime:
//  · VOLUME = loudness integrata in LUFS: l'audio passa per il filtro "K" (due filtri che imitano l'orecchio), si
//    misura l'energia in blocchi da 400 ms che si sovrappongono al 75%, si buttano i blocchi quasi silenziosi
//    (sotto -70 LUFS) e poi quelli più bassi di 10 LU della media (la "porta" relativa);
//  · PICCO = true peak in dBTP: il picco che avrebbe il suono vero dopo la conversione in analogico, cercato su un
//    segnale portato a 4 volte i campioni (un campione a 0 dBFS può nascondere un picco più alto fra due campioni);
//  · DURATA.
// Qui non c'è niente di browser: gira in un Worker (src/media/loudness.worker.ts) e si prova da Node.

/** il livello sotto cui un blocco è silenzio per la misura (porta assoluta) */
export const PORTA_ASSOLUTA = -70;
/** quanto sotto la media dei blocchi udibili si taglia (porta relativa) */
export const PORTA_RELATIVA = -10;
const OFFSET = -0.691;

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** I due filtri della ponderazione K per qualunque frequenza di campionamento (le formule di libebur128: a 48 kHz
 *  danno i coefficienti scritti nella norma). Il primo alza le alte, il secondo toglie le bassissime. */
export function filtriK(sr: number): [Biquad, Biquad] {
  const q1 = 0.7071752369554196, f1 = 1681.974450955533, g = 3.999843853973347;
  const k1 = Math.tan(Math.PI * f1 / sr);
  const vh = Math.pow(10, g / 20), vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k1 / q1 + k1 * k1;
  const alto: Biquad = {
    b0: (vh + vb * k1 / q1 + k1 * k1) / a0,
    b1: 2 * (k1 * k1 - vh) / a0,
    b2: (vh - vb * k1 / q1 + k1 * k1) / a0,
    a1: 2 * (k1 * k1 - 1) / a0,
    a2: (1 - k1 / q1 + k1 * k1) / a0,
  };
  const q2 = 0.5003270373238773, f2 = 38.13547087602444;
  const k2 = Math.tan(Math.PI * f2 / sr);
  const d = 1 + k2 / q2 + k2 * k2;
  const basso: Biquad = { b0: 1, b1: -2, b2: 1, a1: 2 * (k2 * k2 - 1) / d, a2: (1 - k2 / q2 + k2 * k2) / d };
  return [alto, basso];
}

/** un filtro del secondo ordine che ricorda il suo stato (forma trasposta 2, regge i pezzi a uno a uno) */
class FiltroBiquad {
  private z1 = 0; private z2 = 0;
  constructor(private c: Biquad) {}
  passa(x: number): number {
    const c = this.c;
    const y = c.b0 * x + this.z1;
    this.z1 = c.b1 * x - c.a1 * y + this.z2;
    this.z2 = c.b2 * x - c.a2 * y;
    return y;
  }
}

// ——— il true peak: sovracampionamento a 4x con un interpolatore sinc finestrato (12 punti per fase) ———
const FASI = 4;
const PUNTI = 12;
/** da -5 a +6 campioni attorno al punto: i 12 che servono a una fase */
const DA = -5;

function besselI0(x: number): number {
  let somma = 1, termine = 1;
  for (let k = 1; k < 40; k++) { termine *= (x / (2 * k)) * (x / (2 * k)); somma += termine; if (termine < 1e-14 * somma) break; }
  return somma;
}

/** i pesi delle tre fasi intermedie (la fase 0 è il campione stesso); ognuna somma 1 */
function nucleo(): { pesi: Float64Array[]; assoluto: number } {
  const beta = 8.6, mezza = PUNTI / 2;
  const i0b = besselI0(beta);
  const pesi: Float64Array[] = [];
  let assoluto = 1;
  for (let p = 1; p < FASI; p++) {
    const w = new Float64Array(PUNTI);
    let s = 0;
    for (let i = 0; i < PUNTI; i++) {
      const t = DA + i - p / FASI;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const r = t / mezza;
      const finestra = Math.abs(r) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / i0b;
      w[i] = sinc * finestra;
      s += w[i];
    }
    let a = 0;
    for (let i = 0; i < PUNTI; i++) { w[i] /= s; a += Math.abs(w[i]); }
    assoluto = Math.max(assoluto, a);
    pesi.push(w);
  }
  return { pesi, assoluto };
}
const NUCLEO = nucleo();

/** Cerca il picco vero di un canale, un pezzo alla volta (tiene in memoria solo gli ultimi campioni). */
class PiccoVero {
  picco = 0;
  piccoCampione = 0;
  private coda = new Float32Array(PUNTI - 1);

  aggiungi(x: Float32Array) {
    const n = x.length;
    if (!n) return;
    const buf = new Float32Array(this.coda.length + n);
    buf.set(this.coda, 0);
    buf.set(x, this.coda.length);
    this.passa(buf, buf.length - (PUNTI - 1 - (-DA)));
    this.coda.set(buf.subarray(buf.length - this.coda.length));
  }

  /** a fine file i campioni "dopo" sono silenzio: si finisce di guardare gli ultimi */
  fine() {
    const buf = new Float32Array(this.coda.length + PUNTI);
    buf.set(this.coda, 0);
    this.passa(buf, buf.length - (PUNTI - 1 - (-DA)));
  }

  /** controlla l'intervallo fra k e k+1 per tutti i k da DA-negativo fino a `fino` (escluso) */
  private passa(buf: Float32Array, fino: number) {
    const prima = -DA;
    // il campione stesso (fase 0)
    for (let i = prima; i < fino + 1 && i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > this.piccoCampione) this.piccoCampione = a; }
    const BLOCCO = 64;
    for (let k0 = prima; k0 < fino; k0 += BLOCCO) {
      const k1 = Math.min(fino, k0 + BLOCCO);
      // se in tutto il blocco (più i punti attorno) non c'è niente che possa superare il picco già trovato, si salta
      let m = 0;
      const a0 = Math.max(0, k0 + DA), a1 = Math.min(buf.length, k1 + DA + PUNTI);
      for (let i = a0; i < a1; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
      if (m * NUCLEO.assoluto <= this.picco) continue;
      for (let k = k0; k < k1; k++) {
        for (let p = 1; p < FASI; p++) {
          const w = NUCLEO.pesi[p - 1];
          let y = 0;
          const base = k + DA;
          for (let i = 0; i < PUNTI; i++) y += buf[base + i] * w[i];
          const a = Math.abs(y);
          if (a > this.picco) this.picco = a;
        }
      }
    }
    if (this.piccoCampione > this.picco) this.picco = this.piccoCampione;
  }
}

export interface RisultatoLoudness {
  /** loudness integrata in LUFS; null se non c'è niente di udibile (tutto silenzio) */
  lufs: number | null;
  /** true peak in dBTP; null se il segnale è zero */
  picco: number | null;
  /** il picco dei campioni, in dBFS (senza sovracampionare) */
  piccoCampione: number | null;
  /** la loudness del blocco più forte (400 ms), in LUFS */
  momentaneoMax: number | null;
  /** secondi di audio misurati */
  durata: number;
  /** quanti blocchi da 400 ms */
  blocchi: number;
}

const dbDa = (lineare: number) => (lineare > 0 ? 20 * Math.log10(lineare) : null);

/** Il misuratore: si danno i pezzi di audio (un array per canale) e alla fine si chiede il risultato. */
export class MisuraLoudness {
  private filtri: FiltroBiquad[][];
  private veri: PiccoVero[];
  private passo: number;
  /** somma dei quadrati del sottoblocco in corso, per canale */
  private somma: Float64Array;
  private inBlocco = 0;
  /** l'energia (già ponderata e sommata sui canali) degli ultimi sottoblocchi da 100 ms */
  private sotto: number[] = [];
  /** l'energia media di ogni blocco da 400 ms */
  private blocchiE: number[] = [];
  private campioni = 0;
  private chiuso = false;

  constructor(readonly sampleRate: number, readonly canali = 2) {
    this.passo = Math.max(1, Math.round(sampleRate * 0.1));
    this.filtri = Array.from({ length: canali }, () => filtriK(sampleRate).map((c) => new FiltroBiquad(c)));
    this.veri = Array.from({ length: canali }, () => new PiccoVero());
    this.somma = new Float64Array(canali);
  }

  /** i canali di un pezzo (stessa lunghezza); se ne arrivano meno dei previsti gli altri restano muti */
  aggiungi(canali: Float32Array[]) {
    if (this.chiuso || !canali.length) return;
    const n = canali[0].length;
    for (let c = 0; c < this.canali; c++) {
      const x = canali[Math.min(c, canali.length - 1)];
      if (c >= canali.length) continue;
      this.veri[c].aggiungi(x);
    }
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.canali; c++) {
        if (c >= canali.length) continue;
        const f = this.filtri[c];
        const y = f[1].passa(f[0].passa(canali[c][i]));
        this.somma[c] += y * y;
      }
      this.campioni++;
      if (++this.inBlocco >= this.passo) this.chiudiSotto();
    }
  }

  private chiudiSotto() {
    // i canali sono tutti davanti (peso 1): per sinistra e destra la somma dei quadrati medi
    let e = 0;
    for (let c = 0; c < this.canali; c++) { e += this.somma[c] / this.inBlocco; this.somma[c] = 0; }
    this.inBlocco = 0;
    this.sotto.push(e);
    if (this.sotto.length >= 4) {
      const l = this.sotto.length;
      this.blocchiE.push((this.sotto[l - 1] + this.sotto[l - 2] + this.sotto[l - 3] + this.sotto[l - 4]) / 4);
      if (this.sotto.length > 4) this.sotto.splice(0, this.sotto.length - 4);
    }
  }

  fine(): RisultatoLoudness {
    if (!this.chiuso) { this.chiuso = true; for (const v of this.veri) v.fine(); }
    const picco = Math.max(0, ...this.veri.map((v) => v.picco));
    const campione = Math.max(0, ...this.veri.map((v) => v.piccoCampione));
    return {
      lufs: loudnessIntegrata(this.blocchiE),
      picco: dbDa(picco),
      piccoCampione: dbDa(campione),
      momentaneoMax: this.blocchiE.length ? lufsDa(Math.max(...this.blocchiE)) : null,
      durata: this.campioni / this.sampleRate,
      blocchi: this.blocchiE.length,
    };
  }
}

/** da energia media a LUFS */
export const lufsDa = (energia: number) => (energia > 0 ? OFFSET + 10 * Math.log10(energia) : -Infinity);

/** La loudness integrata di un elenco di blocchi (energia media di ognuno): doppia porta, assoluta e relativa. */
export function loudnessIntegrata(blocchi: readonly number[]): number | null {
  const udibili = blocchi.filter((e) => lufsDa(e) > PORTA_ASSOLUTA);
  if (!udibili.length) return null;
  const media = udibili.reduce((a, b) => a + b, 0) / udibili.length;
  const soglia = lufsDa(media) + PORTA_RELATIVA;
  const buoni = udibili.filter((e) => lufsDa(e) > soglia);
  if (!buoni.length) return null;
  return lufsDa(buoni.reduce((a, b) => a + b, 0) / buoni.length);
}

/** Misura tutto in una volta (per le prove e per i pezzi piccoli). */
export function misuraTutto(canali: Float32Array[], sampleRate: number): RisultatoLoudness {
  const m = new MisuraLoudness(sampleRate, canali.length);
  const PEZZO = 48000;
  for (let i = 0; i < canali[0].length; i += PEZZO) m.aggiungi(canali.map((c) => c.subarray(i, i + PEZZO)));
  return m.fine();
}

// ——— cosa farne ———

/** il picco massimo che il file deve avere dopo la normalizzazione (lo chiedono YouTube e le piattaforme: -1 dBTP) */
export const PICCO_TETTO = -1;

export interface Guadagno {
  /** quanti dB aggiungere (o togliere) a tutto l'audio */
  db: number;
  /** il picco non lasciava arrivare al volume voluto: si è fermato prima */
  limitato: boolean;
  /** il volume che esce, in LUFS */
  lufsDopo: number;
  /** il picco che esce, in dBTP */
  piccoDopo: number | null;
}

/** Il guadagno per portare il volume al traguardo, senza far salire il picco oltre il tetto. Nessun limitatore:
 *  è una semplice moltiplicazione, quindi non cambia il suono, solo quanto è forte. Null se non c'è misura. */
export function guadagnoPer(r: Pick<RisultatoLoudness, 'lufs' | 'picco'>, traguardo: number, tetto = PICCO_TETTO): Guadagno | null {
  if (r.lufs === null) return null;
  let db = traguardo - r.lufs;
  let limitato = false;
  if (r.picco !== null && r.picco + db > tetto) { db = tetto - r.picco; limitato = true; }
  return { db, limitato, lufsDopo: r.lufs + db, piccoDopo: r.picco === null ? null : r.picco + db };
}

/** "−14,2" (virgola e vero segno meno, come sui display) */
export function numeroDb(x: number, decimali = 1): string {
  const t = Math.abs(x).toFixed(decimali).replace('.', ',');
  return (x < 0 && Number(t.replace(',', '.')) !== 0 ? '−' : x > 0 ? '+' : '') + t;
}

export type Luce = 'verde' | 'ambra' | 'rossa' | 'spenta';

/** la spia del volume: verde se è a ±1 LU dal traguardo, ambra fino a ±3, rossa oltre */
export function luceVolume(lufs: number | null, traguardo: number | null): Luce {
  if (lufs === null) return 'spenta';
  if (traguardo === null) return lufs > -9 ? 'rossa' : lufs > -12 ? 'ambra' : 'verde';
  const d = Math.abs(lufs - traguardo);
  return d <= 1 ? 'verde' : d <= 3 ? 'ambra' : 'rossa';
}

/** la spia del picco: verde fino a -1 dBTP, ambra fino a -0,1, rossa oltre (il suono satura quando si converte) */
export function lucePicco(picco: number | null): Luce {
  if (picco === null) return 'spenta';
  return picco <= PICCO_TETTO ? 'verde' : picco <= -0.1 ? 'ambra' : 'rossa';
}

/** una firma corta di tutto quello che fa suonare il montaggio: se cambia, la misura è vecchia */
export function firmaAudio(p: unknown, da: number, a: number): string {
  const testo = JSON.stringify(p, (_k, v) => (v instanceof Float32Array || v instanceof Uint8Array ? undefined : v)) + `|${da}|${a}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + testo.length.toString(36);
}
