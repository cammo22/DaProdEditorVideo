// L'audio di LIVE, le parti pure (si provano senza browser audio): le scelte (volumi, bilanciamento, filtri della voce,
// abbassa-il-computer), i preset, la conversione in dB, il conto dei picchi per le barre e — soprattutto — il codice
// della "dinamica": porta (noise gate), de-esser, compressore, abbassa-il-computer (ducking) e limitatore.
//
// La dinamica gira in un AudioWorklet (sul filo dell'audio, non su quello dell'interfaccia: la porta che si apre in
// ritardo mangerebbe l'inizio delle parole). Il codice del worklet è la funzione `dspDinamica` qui sotto, scritta
// una volta sola: nel worklet si manda il suo testo (`codiceWorklet`), qui la stessa funzione si chiama con una base
// finta, così le prove la provano com'è. Per questo `dspDinamica` non deve MAI usare niente che stia fuori da lei.

// ——————————————————————————————————————————————————————————————————————
//  dB
// ——————————————————————————————————————————————————————————————————————
/** il fader scende fino a qui: sotto è silenzio */
export const DB_MIN = -60;
export const DB_MAX = 12;

export const dbAGuadagno = (db: number) => (db <= DB_MIN ? 0 : Math.pow(10, db / 20));
export const guadagnoADb = (g: number) => (g <= 1e-6 ? -Infinity : 20 * Math.log10(g));
/** il valore del fader scritto per un essere umano ("-6,5 dB", "silenzio") */
export function testoDb(db: number): string {
  if (!(db > DB_MIN)) return 'silenzio';
  const r = Math.round(db * 10) / 10;
  return `${r > 0 ? '+' : ''}${String(r).replace('.', ',')} dB`;
}
const entro = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** quanto il bilanciamento (-100 = solo computer … +100 = solo voce) abbassa l'altro: al massimo 36 dB */
export const BILANCIO_MAX_DB = 36;
export function bilancioADb(b: number): { voce: number; computer: number } {
  const k = entro(b, -100, 100) / 100;
  return { voce: k < 0 ? k * BILANCIO_MAX_DB : 0, computer: k > 0 ? -k * BILANCIO_MAX_DB : 0 };
}

// ——————————————————————————————————————————————————————————————————————
//  Le scelte
// ——————————————————————————————————————————————————————————————————————
export interface CanaleAudio { volume: number; muto: boolean }

/** i filtri della voce (il microfono) */
export interface FiltriVoce {
  /** i filtri del browser, scelti quando si apre il microfono: toglie i disturbi (è il suo modello AI), eco, volume automatico */
  disturbi: boolean;
  eco: boolean;
  livellaAuto: boolean;
  /** passa-alto: toglie rimbombo e vento sotto questa frequenza */
  passaAlto: boolean;
  passaAltoHz: number;
  /** porta: sotto la soglia (in dB) il microfono si abbassa */
  porta: boolean;
  portaSoglia: number;
  /** tono: bassi (calore), medi alti (presenza), acuti (aria), in dB */
  eq: boolean;
  calore: number;
  presenza: number;
  aria: number;
  /** de-esser: smorza le "S" troppo taglienti; la forza va da 0 a 1 */
  deesser: boolean;
  deesserForza: number;
  /** compressore: soglia (dB), rapporto e guadagno di recupero (dB) */
  compressore: boolean;
  compSoglia: number;
  compRapporto: number;
  compRecupero: number;
  /** limitatore: paracadute a -1 dB, non tocca i suoni normali */
  limitatore: boolean;
}

export interface ImpostazioniAudio {
  voce: CanaleAudio;
  computer: CanaleAudio;
  /** -100 = solo computer, 0 = pari, +100 = solo voce (in realtà l'altro scende al massimo di 36 dB) */
  bilancio: number;
  filtri: FiltriVoce;
  limitaComputer: boolean;
  /** abbassa il computer quando parli */
  abbassa: boolean;
  /** da che livello della voce (dB) il computer scende, di quanti dB, e in quanto tempo risale (ms) */
  abbassaSoglia: number;
  abbassaQuanto: number;
  abbassaRilascio: number;
}

/** "Nessuno": i filtri del browser come prima, la nostra catena spenta (solo il limitatore, che non tocca i suoni normali) */
export const FILTRI_NESSUNO: FiltriVoce = {
  disturbi: true, eco: true, livellaAuto: true,
  passaAlto: false, passaAltoHz: 80,
  porta: false, portaSoglia: -45,
  eq: false, calore: 0, presenza: 0, aria: 0,
  deesser: false, deesserForza: 0.5,
  compressore: false, compSoglia: -22, compRapporto: 3, compRecupero: 0,
  limitatore: true,
};

export interface PresetVoce { id: string; nome: string; info: string; filtri: FiltriVoce }
const voce = (o: Partial<FiltriVoce>): FiltriVoce => ({ ...FILTRI_NESSUNO, ...o });
export const PRESET_VOCE: PresetVoce[] = [
  { id: 'nessuno', nome: 'Nessuno', info: 'Solo i filtri del browser e il limitatore: la voce com\'è', filtri: voce({}) },
  {
    id: 'chiara', nome: 'Voce chiara', info: 'Toglie il rimbombo, un po\' di presenza e di aria, smorza le S: per parlare davanti allo schermo',
    filtri: voce({ livellaAuto: false, passaAlto: true, passaAltoHz: 80, eq: true, calore: 0, presenza: 3, aria: 2, deesser: true, deesserForza: 0.4, compressore: true, compSoglia: -22, compRapporto: 2.5, compRecupero: 2 }),
  },
  {
    id: 'podcast', nome: 'Voce da podcast', info: 'Calda, piena e regolare: il compressore tiene uguali le parole forti e quelle piano',
    filtri: voce({ livellaAuto: false, passaAlto: true, passaAltoHz: 90, porta: true, portaSoglia: -50, eq: true, calore: 2.5, presenza: 2, aria: 1, deesser: true, deesserForza: 0.5, compressore: true, compSoglia: -24, compRapporto: 3.5, compRecupero: 3 }),
  },
  {
    id: 'radio', nome: 'Voce radio', info: 'Profonda e decisa, molto compressa: la voce del conduttore',
    filtri: voce({ livellaAuto: false, passaAlto: true, passaAltoHz: 110, porta: true, portaSoglia: -48, eq: true, calore: 4, presenza: 3, aria: 1, deesser: true, deesserForza: 0.6, compressore: true, compSoglia: -28, compRapporto: 5, compRecupero: 4 }),
  },
  {
    id: 'rumoroso', nome: 'Ambiente rumoroso', info: 'Per quando c\'è ventola, strada o tastiera: porta più alta, via i bassi, disturbi tolti dall\'AI',
    filtri: voce({ livellaAuto: false, passaAlto: true, passaAltoHz: 120, porta: true, portaSoglia: -38, eq: true, calore: -1, presenza: 2, aria: 0, deesser: true, deesserForza: 0.3, compressore: true, compSoglia: -22, compRapporto: 3, compRecupero: 2 }),
  },
];

export interface PresetMix { id: string; nome: string; info: string; bilancio: number; abbassa: boolean }
export const PRESET_MIX: PresetMix[] = [
  { id: 'voce', nome: 'Voce in primo piano', info: 'Il computer più basso, e scende ancora mentre parli', bilancio: 30, abbassa: true },
  { id: 'pari', nome: 'Pari', info: 'Voce e computer allo stesso livello', bilancio: 0, abbassa: false },
  { id: 'gioco', nome: 'Gioco: computer forte', info: 'Il computer in evidenza e la voce un po\' sotto', bilancio: -35, abbassa: false },
];

export const IMPOSTAZIONI0: ImpostazioniAudio = {
  voce: { volume: 0, muto: false },
  computer: { volume: 0, muto: false },
  bilancio: 0,
  filtri: { ...FILTRI_NESSUNO },
  limitaComputer: true,
  abbassa: false, abbassaSoglia: -42, abbassaQuanto: 12, abbassaRilascio: 700,
};

export const copiaImpostazioni = (a: ImpostazioniAudio): ImpostazioniAudio => ({
  ...a, voce: { ...a.voce }, computer: { ...a.computer }, filtri: { ...a.filtri },
});

const num = (v: unknown, def: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? entro(v, a, b) : def);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const canale = (v: unknown, def: CanaleAudio): CanaleAudio => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { volume: num(o.volume, def.volume, DB_MIN, DB_MAX), muto: bool(o.muto, def.muto) };
};

/** le scelte lette da localStorage (o da dove sia): quello che manca o è sbagliato torna com'era di partenza */
export function unisciImpostazioni(grezzo: unknown): ImpostazioniAudio {
  const d = IMPOSTAZIONI0;
  const o = (grezzo && typeof grezzo === 'object' ? grezzo : {}) as Record<string, unknown>;
  const f = (o.filtri && typeof o.filtri === 'object' ? o.filtri : {}) as Record<string, unknown>;
  const b = FILTRI_NESSUNO;
  return {
    voce: canale(o.voce, d.voce),
    computer: canale(o.computer, d.computer),
    bilancio: num(o.bilancio, d.bilancio, -100, 100),
    filtri: {
      disturbi: bool(f.disturbi, b.disturbi), eco: bool(f.eco, b.eco), livellaAuto: bool(f.livellaAuto, b.livellaAuto),
      passaAlto: bool(f.passaAlto, b.passaAlto), passaAltoHz: num(f.passaAltoHz, b.passaAltoHz, 40, 300),
      porta: bool(f.porta, b.porta), portaSoglia: num(f.portaSoglia, b.portaSoglia, -80, -15),
      eq: bool(f.eq, b.eq), calore: num(f.calore, b.calore, -12, 12), presenza: num(f.presenza, b.presenza, -12, 12), aria: num(f.aria, b.aria, -12, 12),
      deesser: bool(f.deesser, b.deesser), deesserForza: num(f.deesserForza, b.deesserForza, 0, 1),
      compressore: bool(f.compressore, b.compressore), compSoglia: num(f.compSoglia, b.compSoglia, -50, -6), compRapporto: num(f.compRapporto, b.compRapporto, 1, 10), compRecupero: num(f.compRecupero, b.compRecupero, 0, 12),
      limitatore: bool(f.limitatore, b.limitatore),
    },
    limitaComputer: bool(o.limitaComputer, d.limitaComputer),
    abbassa: bool(o.abbassa, d.abbassa),
    abbassaSoglia: num(o.abbassaSoglia, d.abbassaSoglia, -70, -15),
    abbassaQuanto: num(o.abbassaQuanto, d.abbassaQuanto, 3, 30),
    abbassaRilascio: num(o.abbassaRilascio, d.abbassaRilascio, 100, 3000),
  };
}

/** quale preset dei filtri è acceso adesso ('personale' se hai toccato le opzioni avanzate) */
export function presetCorrente(f: FiltriVoce): string {
  for (const p of PRESET_VOCE) {
    if ((Object.keys(p.filtri) as (keyof FiltriVoce)[]).every((k) => p.filtri[k] === f[k])) return p.id;
  }
  return 'personale';
}

export function presetMixCorrente(a: ImpostazioniAudio): string {
  return PRESET_MIX.find((p) => p.bilancio === a.bilancio && p.abbassa === a.abbassa)?.id ?? 'personale';
}

/** il guadagno di un canale (muto = zero) con il suo pezzetto di bilanciamento */
export const guadagnoCanale = (c: CanaleAudio, extraDb: number) => (c.muto ? 0 : dbAGuadagno(c.volume + extraDb));

// ——————————————————————————————————————————————————————————————————————
//  Il tono (EQ): frequenze fisse, guadagni scelti
// ——————————————————————————————————————————————————————————————————————
export const EQ_FREQ = { calore: 180, presenza: 3200, aria: 9000 } as const;

// ——————————————————————————————————————————————————————————————————————
//  I parametri della dinamica (quello che si manda al worklet)
// ——————————————————————————————————————————————————————————————————————
export interface ParamDin {
  porta: { on: boolean; soglia: number; isteresi: number; tenuta: number; apre: number; chiude: number; attacco: number; rilascio: number };
  deess: { on: boolean; soglia: number; rapporto: number; ginocchio: number; attacco: number; rilascio: number; freq: number };
  comp: { on: boolean; soglia: number; rapporto: number; ginocchio: number; attacco: number; rilascio: number; recupero: number };
  duck: { on: boolean; soglia: number; isteresi: number; tenuta: number; apre: number; chiude: number; attacco: number; rilascio: number };
  lim: { on: boolean; tetto: number; rilascio: number };
}

/** tutto spento: il segnale passa com'è */
export function paramBase(): ParamDin {
  return {
    porta: { on: false, soglia: -45, isteresi: 4, tenuta: 0.15, apre: 0, chiude: -35, attacco: 0.002, rilascio: 0.18 },
    deess: { on: false, soglia: -30, rapporto: 4, ginocchio: 6, attacco: 0.001, rilascio: 0.05, freq: 6500 },
    comp: { on: false, soglia: -22, rapporto: 3, ginocchio: 8, attacco: 0.01, rilascio: 0.18, recupero: 0 },
    duck: { on: false, soglia: -42, isteresi: 6, tenuta: 0.3, apre: -12, chiude: 0, attacco: 0.05, rilascio: 0.7 },
    lim: { on: false, tetto: -1, rilascio: 0.1 },
  };
}

/** la porta della voce (prima del tono, così guarda la voce vera e non quella ritoccata) */
export function paramPorta(f: FiltriVoce): ParamDin {
  const p = paramBase();
  p.porta.on = f.porta;
  p.porta.soglia = f.portaSoglia;
  return p;
}

/** de-esser e compressore (dopo il tono). La forza del de-esser abbassa la soglia (−18 … −42 dB) e alza il rapporto (3 … 6) */
export function paramDinVoce(f: FiltriVoce): ParamDin {
  const p = paramBase();
  p.deess.on = f.deesser;
  p.deess.soglia = -18 - f.deesserForza * 24;
  p.deess.rapporto = 3 + f.deesserForza * 3;
  p.comp.on = f.compressore;
  p.comp.soglia = f.compSoglia;
  p.comp.rapporto = f.compRapporto;
  p.comp.recupero = f.compRecupero;
  return p;
}

/** il limitatore alla fine della voce */
export function paramLimiteVoce(f: FiltriVoce): ParamDin {
  const p = paramBase();
  p.lim.on = f.limitatore;
  return p;
}

/** il computer: abbassa-quando-parlo (la voce arriva dal secondo ingresso) e limitatore */
export function paramComputer(a: ImpostazioniAudio): ParamDin {
  const p = paramBase();
  p.duck.on = a.abbassa;
  p.duck.soglia = a.abbassaSoglia;
  p.duck.apre = -a.abbassaQuanto;
  p.duck.rilascio = a.abbassaRilascio / 1000;
  p.lim.on = a.limitaComputer;
  return p;
}

/** il limitatore della somma di voce e computer */
export function paramSomma(): ParamDin {
  const p = paramBase();
  p.lim.on = true;
  return p;
}

// ——————————————————————————————————————————————————————————————————————
//  Le barre dei livelli: picco che resta un attimo, avviso di saturazione
// ——————————————————————————————————————————————————————————————————————
/** il livello (picco, 0…1 lineare) → posizione sulla barra, da −60 dB (0) a 0 dB (1) */
export const posizioneBarra = (picco: number) => entro((20 * Math.log10(Math.max(1e-6, picco)) + 60) / 60, 0, 1);
/** da questo picco in su si parla di saturazione (−1,1 dB): è il tetto del limitatore (−1 dB), quindi la spia si accende anche
 *  quando il limitatore sta tenendo un segnale troppo forte */
export const SOGLIA_CLIP = 0.88;

/** lo stato di una barra stereo (sinistra e destra): sale subito, scende piano; il picco resta 0,9 s; la spia di saturazione resta 2,5 s */
export class MisuraPicco {
  barra = [0, 0];
  tenuto = [0, 0];
  private tPicco = [0, 0];
  private ultimo = 0;
  private tClip = -1e9;
  /** i picchi massimi dall'ultimo azzeramento, in lineare */
  massimo = [0, 0];

  /** `picchi` = picco lineare di sinistra e destra, `ora` in millisecondi */
  aggiorna(picchi: [number, number], ora: number) {
    const dt = this.ultimo ? Math.min(0.1, (ora - this.ultimo) / 1000) : 0.016;
    this.ultimo = ora;
    for (let i = 0; i < 2; i++) {
      const b = posizioneBarra(picchi[i]);
      this.barra[i] = b > this.barra[i] ? b : Math.max(b, this.barra[i] - dt * 0.9);
      if (b >= this.tenuto[i]) { this.tenuto[i] = b; this.tPicco[i] = ora; }
      else if (ora - this.tPicco[i] > 900) this.tenuto[i] = Math.max(b, this.tenuto[i] - dt * 0.6);
      if (picchi[i] > this.massimo[i]) this.massimo[i] = picchi[i];
      if (picchi[i] >= SOGLIA_CLIP) this.tClip = ora;
    }
  }

  /** la spia di saturazione è accesa (si spegne da sola dopo 2,5 s, o con `azzera`) */
  clip(ora: number) { return ora - this.tClip < 2500; }
  azzera() { this.tClip = -1e9; this.massimo = [0, 0]; }
  /** il picco più alto delle due barre, in dB */
  picchiDb() { return 20 * Math.log10(Math.max(1e-6, this.massimo[0], this.massimo[1])); }
  fermo() { return this.barra[0] < 0.005 && this.barra[1] < 0.005 && this.tenuto[0] < 0.005 && this.tenuto[1] < 0.005; }
}

// ——————————————————————————————————————————————————————————————————————
//  La dinamica (il codice del worklet)
// ——————————————————————————————————————————————————————————————————————
interface PortaProc { port: { onmessage: ((e: { data: any }) => void) | null; postMessage: (m: unknown) => void } }
type BaseProc = new (...args: any[]) => PortaProc;

/**
 * Il codice dell'AudioWorklet "dpv-dinamica". Due ingressi (il segnale e, solo per l'abbassa-il-computer, la voce), una
 * uscita stereo; ogni blocco passa da: porta → de-esser → compressore → abbassa-computer → limitatore. Ogni passo si
 * spegne da solo (`on: false`) e allora il segnale passa com'è. I guadagni si calcolano una volta per blocco (128
 * campioni, 2,7 ms) e si distribuiscono a rampa sul blocco; il limitatore invece lavora campione per campione.
 *
 * ATTENZIONE: questa funzione viene mandata al worklet come testo (`toString`): niente riferimenti a cose che stanno fuori.
 */
export function dspDinamica(Base: BaseProc, registra: (nome: string, classe: unknown) => void, sr: number) {
  const dbLin = (d: number) => Math.pow(10, d / 20);
  const linDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
  /** quanto ci si avvicina al bersaglio in `dt` secondi con costante di tempo `sec` */
  const coef = (sec: number, dt: number) => (sec <= 0 ? 1 : 1 - Math.exp(-dt / sec));

  interface StatoPorta { env: number; attiva: boolean; tieni: number; g: number }
  const nuovaPorta = (): StatoPorta => ({ env: 0, attiva: false, tieni: 0, g: 0 });

  /**
   * Una porta con memoria, per la porta del microfono e per l'abbassa-computer. Guarda il picco del blocco: se supera la
   * soglia (dB) è "attiva" e ci resta per la tenuta (e finché il livello non scende di `isteresi` dB sotto la soglia).
   * Da attiva il guadagno (dB) va verso `apre` col tempo di `attacco`, da non attiva verso `chiude` col tempo di
   * `rilascio`. Ritorna il guadagno di adesso in dB.
   */
  function passoPorta(s: StatoPorta, p: { soglia: number; isteresi: number; tenuta: number; apre: number; chiude: number; attacco: number; rilascio: number }, picco: number, dt: number): number {
    s.env = Math.max(picco, s.env * Math.exp(-dt / 0.06));
    const db = linDb(s.env);
    if (db > p.soglia) { s.attiva = true; s.tieni = p.tenuta; }
    else if (s.attiva) {
      if (db > p.soglia - p.isteresi) s.tieni = p.tenuta;
      else { s.tieni -= dt; if (s.tieni <= 0) s.attiva = false; }
    }
    const bers = s.attiva ? p.apre : p.chiude;
    s.g += (bers - s.g) * coef(s.attiva ? p.attacco : p.rilascio, dt);
    return s.g;
  }

  /** la curva del compressore (dB dentro → dB fuori), con il ginocchio morbido */
  function curvaComp(x: number, soglia: number, rapporto: number, ginocchio: number): number {
    const sopra = x - soglia;
    if (ginocchio > 0 && 2 * Math.abs(sopra) <= ginocchio) {
      const t = sopra + ginocchio / 2;
      return x + ((1 / rapporto - 1) * t * t) / (2 * ginocchio);
    }
    return sopra < 0 ? x : soglia + sopra / rapporto;
  }

  interface StatoComp { g: number }
  /** quanto il compressore abbassa (dB, zero o meno) per questo picco: attacco quando la riduzione cresce, rilascio quando cala */
  function passoComp(s: StatoComp, p: { soglia: number; rapporto: number; ginocchio: number; attacco: number; rilascio: number }, picco: number, dt: number): number {
    const x = linDb(picco);
    const bers = curvaComp(x, p.soglia, p.rapporto, p.ginocchio) - x;
    s.g += (bers - s.g) * coef(bers < s.g ? p.attacco : p.rilascio, dt);
    return s.g;
  }

  interface Coef { b0: number; b1: number; b2: number; a1: number; a2: number }
  function coeffBq(passaAlto: boolean, fc: number, q: number): Coef {
    const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
    const c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const b0 = passaAlto ? (1 + c) / 2 : (1 - c) / 2;
    const b1 = passaAlto ? -(1 + c) : 1 - c;
    return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * c) / a0, a2: (1 - a) / a0 };
  }
  interface Z { z1: number; z2: number }
  const bq = (k: Coef, z: Z, x: number) => {
    const y = k.b0 * x + z.z1;
    z.z1 = k.b1 * x - k.a1 * y + z.z2;
    z.z2 = k.b2 * x - k.a2 * y;
    return y;
  };

  class Dinamica extends Base {
    p: any;
    s: { porta: StatoPorta; deess: StatoComp; comp: StatoComp; duck: StatoPorta; lim: { g: number } };
    g = { porta: 1, deess: 1, comp: 1, duck: 1 };
    rid = { porta: 0, deess: 0, comp: 0, duck: 0, lim: 0 };
    x: Float32Array[] = [];
    lo: Float32Array[] = [];
    hi: Float32Array[] = [];
    zf: { l1: Z; l2: Z; h1: Z; h2: Z }[] = [];
    kLp: Coef | null = null;
    kHp: Coef | null = null;
    fDeess = 0;
    blocchi = 0;

    constructor(o: { processorOptions: { p: unknown } }) {
      super();
      this.p = o.processorOptions.p;
      this.s = { porta: nuovaPorta(), deess: { g: 0 }, comp: { g: 0 }, duck: nuovaPorta(), lim: { g: 1 } };
      this.port.onmessage = (e) => { if (e.data && e.data.p) this.p = e.data.p; };
    }

    private lavoro(n: number) {
      if (this.x.length && this.x[0].length === n) return;
      this.x = [new Float32Array(n), new Float32Array(n)];
      this.lo = [new Float32Array(n), new Float32Array(n)];
      this.hi = [new Float32Array(n), new Float32Array(n)];
      this.zf = [0, 1].map(() => ({ l1: { z1: 0, z2: 0 }, l2: { z1: 0, z2: 0 }, h1: { z1: 0, z2: 0 }, h2: { z1: 0, z2: 0 } }));
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const inp = inputs[0], lat = inputs[1], out = outputs[0];
      if (!out || !out.length || !inp || !inp.length || !inp[0] || !inp[0].length) return true;
      const n = out[0].length, nc = Math.min(2, out.length), dt = n / sr, p = this.p, s = this.s;
      this.lavoro(n);
      const x = this.x;
      for (let c = 0; c < 2; c++) x[c].set(inp[Math.min(c, inp.length - 1)]);
      const picco = (v: Float32Array[]) => {
        let pk = 0;
        for (let c = 0; c < 2; c++) { const a = v[c] || v[0]; for (let i = 0; i < n; i++) { const m = a[i] < 0 ? -a[i] : a[i]; if (m > pk) pk = m; } }
        return pk;
      };
      const rampa = (g0: number, g1: number) => {
        if (g0 === 1 && g1 === 1) return;
        for (let c = 0; c < 2; c++) { const a = x[c]; for (let i = 0; i < n; i++) a[i] *= g0 + ((g1 - g0) * (i + 1)) / n; }
      };

      // 1. la porta
      if (p.porta.on) {
        const gdb = passoPorta(s.porta, p.porta, picco(x), dt);
        const g1 = dbLin(gdb);
        rampa(this.g.porta, g1);
        this.g.porta = g1; this.rid.porta = gdb;
      } else { s.porta.g = 0; s.porta.attiva = false; this.g.porta = 1; this.rid.porta = 0; }

      // 2. il de-esser: due metà (sotto e sopra la frequenza) che si risommano; quella alta si abbassa quando taglia troppo
      if (p.deess.on) {
        if (!this.kLp || this.fDeess !== p.deess.freq) {
          this.fDeess = p.deess.freq;
          this.kLp = coeffBq(false, this.fDeess, 0.70710678);
          this.kHp = coeffBq(true, this.fDeess, 0.70710678);
        }
        const kl = this.kLp, kh = this.kHp!;
        let pk = 0;
        for (let c = 0; c < 2; c++) {
          const z = this.zf[c], a = x[c], lo = this.lo[c], hi = this.hi[c];
          for (let i = 0; i < n; i++) {
            lo[i] = bq(kl, z.l2, bq(kl, z.l1, a[i]));
            const h = bq(kh, z.h2, bq(kh, z.h1, a[i]));
            hi[i] = h;
            const m = h < 0 ? -h : h;
            if (m > pk) pk = m;
          }
        }
        const gdb = passoComp(s.deess, p.deess, pk, dt);
        const g0 = this.g.deess, g1 = dbLin(gdb);
        for (let c = 0; c < 2; c++) { const a = x[c], lo = this.lo[c], hi = this.hi[c]; for (let i = 0; i < n; i++) a[i] = lo[i] + hi[i] * (g0 + ((g1 - g0) * (i + 1)) / n); }
        this.g.deess = g1; this.rid.deess = gdb;
      } else { s.deess.g = 0; this.g.deess = 1; this.rid.deess = 0; }

      // 3. il compressore (con il guadagno di recupero)
      if (p.comp.on) {
        const gdb = passoComp(s.comp, p.comp, picco(x), dt);
        const g1 = dbLin(gdb + p.comp.recupero);
        rampa(this.g.comp, g1);
        this.g.comp = g1; this.rid.comp = gdb;
      } else { s.comp.g = 0; this.g.comp = 1; this.rid.comp = 0; }

      // 4. il computer che si abbassa quando parla la voce (secondo ingresso)
      if (p.duck.on) {
        const voce = lat && lat.length && lat[0] && lat[0].length ? picco(lat as Float32Array[]) : 0;
        const gdb = passoPorta(s.duck, p.duck, voce, dt);
        const g1 = dbLin(gdb);
        rampa(this.g.duck, g1);
        this.g.duck = g1; this.rid.duck = gdb;
      } else { s.duck.g = 0; s.duck.attiva = false; this.g.duck = 1; this.rid.duck = 0; }

      // 5. il limitatore: campione per campione, il picco non supera mai il tetto
      let minimo = 1;
      if (p.lim.on) {
        const tetto = dbLin(p.lim.tetto), rel = Math.exp(-1 / (sr * p.lim.rilascio));
        let g = s.lim.g;
        for (let i = 0; i < n; i++) {
          const a = x[0][i] < 0 ? -x[0][i] : x[0][i], b = x[1][i] < 0 ? -x[1][i] : x[1][i];
          const pk = a > b ? a : b;
          const serve = pk > tetto ? tetto / pk : 1;
          const risale = 1 - (1 - g) * rel;
          g = serve < risale ? serve : risale;
          x[0][i] *= g; x[1][i] *= g;
          if (g < minimo) minimo = g;
        }
        s.lim.g = g;
      } else s.lim.g = 1;
      this.rid.lim = linDb(minimo);

      for (let c = 0; c < nc; c++) out[c].set(x[c]);
      // ogni 43 ms circa dice alla pagina quanto sta abbassando (le spie dell'interfaccia)
      if (++this.blocchi % 16 === 0) this.port.postMessage({ gr: this.rid });
      return true;
    }
  }

  registra('dpv-dinamica', Dinamica);
  return { dbLin, linDb, coef, nuovaPorta, passoPorta, passoComp, curvaComp, coeffBq, Dinamica };
}

/** il testo che il worklet esegue: la funzione sopra, chiamata con le cose del worklet */
export const codiceWorklet = () => `(${dspDinamica.toString()})(AudioWorkletProcessor, registerProcessor, sampleRate);`;

/** la stessa funzione, con una base finta e il suo ritmo (48 kHz): è quella che provano le prove, senza audio */
export class BaseFinta { port = { onmessage: null as ((e: { data: any }) => void) | null, postMessage: (_m: unknown) => {} }; }
export function dspProva(sr = 48000, base: BaseProc = BaseFinta as unknown as BaseProc) {
  return dspDinamica(base, () => {}, sr);
}
