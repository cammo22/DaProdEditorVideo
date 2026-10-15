// Togliere il rumore da un parlato con DeepFilterNet3 (https://github.com/Rikorose/DeepFilterNet, MIT oppure Apache-2.0;
// nel browser col pacchetto @lofcz/deepfilternet-web: i pesi del modello stanno dentro il wasm).
// Il modello lavora a 48 kHz, mono, a fotogrammi da 10 ms (480 campioni), e risponde con un ritardo fisso di 30 ms
// (tre fotogrammi): qui si gira il flusso in modo che l'uscita sia allineata al campione con l'ingresso, e si mescola
// con l'originale secondo la forza scelta. Partenza a freddo: misurata, il modello non ha bisogno di riscaldarsi (i
// primi 100 ms escono già al livello giusto), ma la clip ha comunque un secondo di margine per lato quando il file ce l'ha.
// Puro: del modello si conosce solo l'interfaccia FiltroTrama, così si prova anche da Node (con il vero o con uno finto).
import type { ForzaRumore } from './tipi';

export interface FiltroTrama {
  readonly frameLength: number;
  process(frame: Float32Array): Float32Array;
}

/** il ritardo del modello, in campioni a 48 kHz: misurato (correlazione incrociata su parlato e su sinusoidi: sempre 1440) */
export const RITARDO_DF = 1440;
export const SR_DF = 48000;

/**
 * Quanto dell'uscita pulita si mescola all'originale. Fino alla 1.5.2 "leggera" e "media" lasciavano il 40% e il 15%
 * dell'originale: il rumore si sentiva ancora, solo più basso ("li attenua"). Ora solo "leggera" lascia un filo d'ambiente;
 * media e forte tengono soltanto la voce (e passano anche dalla catena della voce, src/core/catenaVoce.ts).
 */
export const MESCOLA: Record<ForzaRumore, number> = { leggera: 0.88, media: 1, forte: 1 };
/** il post-filtro di DeepFilterNet (beta): toglie ancora il rumore che resta fra le parole. 0 = spento */
export const POSTFILTRO: Record<ForzaRumore, number> = { leggera: 0, media: 0.02, forte: 0.03 };
export const mescolaDi = (f: ForzaRumore | undefined) => MESCOLA[f ?? 'media'] ?? MESCOLA.media;

/** una coda di campioni che si riempie in fondo e si svuota davanti */
class Coda {
  private a = new Float32Array(1 << 14);
  private da = 0;
  private a2 = 0;
  get lunga() { return this.a2 - this.da; }
  metti(x: Float32Array) {
    if (this.a2 + x.length > this.a.length) {
      const nuova = new Float32Array(Math.max(this.a.length * 2, this.lunga + x.length + 1024));
      nuova.set(this.a.subarray(this.da, this.a2));
      this.a2 -= this.da; this.da = 0;
      this.a = nuova;
    }
    this.a.set(x, this.a2);
    this.a2 += x.length;
  }
  togli(n: number): Float32Array {
    const out = this.a.slice(this.da, this.da + n);
    this.da += n;
    if (this.da === this.a2) { this.da = 0; this.a2 = 0; }
    return out;
  }
}

/** un canale (mono) pulito dal modello, a flusso: push(pezzo) ... fine(); in tutto escono tanti campioni quanti ne sono entrati */
export class PulitoreMono {
  private ingresso = new Coda();
  private secco = new Coda();
  private uscitaPronta = new Coda();
  /** quanti campioni sono entrati e usciti */
  private entrati = 0;
  private usciti = 0;
  /** quanti campioni del ritardo vanno ancora buttati dall'uscita del modello */
  private daButtare = RITARDO_DF;

  constructor(private filtro: FiltroTrama, private mescola = 1) {}

  /** manda i campioni al modello (a fotogrammi) e raccoglie quello che torna */
  private daiAlModello(x: Float32Array) {
    this.ingresso.metti(x);
    const N = this.filtro.frameLength;
    while (this.ingresso.lunga >= N) this.uscitaPronta.metti(this.filtro.process(this.ingresso.togli(N)));
  }

  /** i campioni che si possono già restituire (allineati, mescolati) */
  private raccogli(): Float32Array {
    if (this.daButtare > 0 && this.uscitaPronta.lunga > 0) {
      const n = Math.min(this.daButtare, this.uscitaPronta.lunga);
      this.uscitaPronta.togli(n);
      this.daButtare -= n;
    }
    if (this.daButtare > 0) return new Float32Array(0);
    const n = Math.min(this.uscitaPronta.lunga, this.secco.lunga);
    if (n <= 0) return new Float32Array(0);
    const pulito = this.uscitaPronta.togli(n);
    const secco = this.secco.togli(n);
    const m = this.mescola;
    if (m < 1) for (let i = 0; i < n; i++) pulito[i] = m * pulito[i] + (1 - m) * secco[i];
    this.usciti += n;
    return pulito;
  }

  push(x: Float32Array): Float32Array {
    this.entrati += x.length;
    this.secco.metti(x);
    this.daiAlModello(x);
    return this.raccogli();
  }

  /** la coda: il modello ha bisogno di altri 30 ms per rispondere agli ultimi campioni, glieli diamo (silenzio: dopo la fine non c'è altro) */
  fine(): Float32Array {
    const N = this.filtro.frameLength;
    const out: Float32Array[] = [this.raccogli()];
    let versati = 0;
    const limite = RITARDO_DF + 8 * N;
    while (this.usciti < this.entrati && versati < limite) {
      this.daiAlModello(new Float32Array(N));
      versati += N;
      out.push(this.raccogli());
    }
    const tutto = new Float32Array(out.reduce((a, b) => a + b.length, 0));
    let p = 0;
    for (const b of out) { tutto.set(b, p); p += b.length; }
    return tutto;
  }
}

/**
 * Un parlato stereo: il modello è mono, quindi si lavora su centro e lati. Il centro (L+R)/2 porta la voce, i lati
 * (L−R)/2 il rumore che arriva diverso da destra e da sinistra: si puliscono tutti e due, con due istanze del modello
 * (ognuna col suo stato), e si rimettono insieme L = C + S, R = C − S. Così l'immagine stereo non ondeggia (con due
 * canali puliti per conto loro il modello decide in modo diverso a sinistra e a destra) e un file con i due canali
 * uguali dà un'uscita con i due canali uguali.
 */
export class PulitoreStereo {
  private c: PulitoreMono;
  private s: PulitoreMono;
  constructor(crea: () => FiltroTrama, mescola = 1) {
    this.c = new PulitoreMono(crea(), mescola);
    this.s = new PulitoreMono(crea(), mescola);
  }
  private unisci(c: Float32Array, s: Float32Array): [Float32Array, Float32Array] {
    const n = Math.min(c.length, s.length);
    const l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) { l[i] = c[i] + s[i]; r[i] = c[i] - s[i]; }
    return [l, r];
  }
  push(l: Float32Array, r: Float32Array): [Float32Array, Float32Array] {
    const c = new Float32Array(l.length), s = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) { c[i] = (l[i] + r[i]) * 0.5; s[i] = (l[i] - r[i]) * 0.5; }
    return this.unisci(this.c.push(c), this.s.push(s));
  }
  fine(): [Float32Array, Float32Array] {
    return this.unisci(this.c.fine(), this.s.fine());
  }
}
