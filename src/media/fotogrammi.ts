// I fotogrammi per i monitor e per il compositore.
// Due modi, come i videoregistratori: "flusso" in riproduzione (decodifica in avanti con un piccolo
// anticipo, i tagli sono puliti perché la clip dopo si scalda prima) e "ricerca" da fermo o in shuttle
// (va al fotogramma esatto; se ne arrivano tanti di fila vince l'ultimo, e in avanti di poco si continua a
// leggere col cursore: la rotella decodifica un fotogramma per passo).
// Se la ripresa ha il suo proxy (src/media/proxy.ts) si legge quello: leggero e con un fotogramma chiave ogni
// mezzo secondo, così si parte da qualunque punto all'istante. Da fermo, se il monitor è più grande del proxy,
// dopo un attimo arriva il fotogramma nitido dell'originale.
import { aspettaSentinella } from './sentinella';
import { EncodedPacketSink, VideoSampleSink, type VideoSample } from 'mediabunny';
import { mediaRT, quandoDecoderOccupato, type MediaRT } from './libreria';
import { modoProxy, quandoProxy } from './proxy';

export type Fotogramma = VideoSample | ImageBitmap;
type Qualita = 'p' | 'o';

const CODA = 5;
// WebM arrotonda i timestamp ai millisecondi: 1/60 diventa 0,017. Mezzo tick più
// un margine numerico evita di ripetere il frame 0 e saltare il frame 1 (60 → 40 fps).
const SCARTO_TIMESTAMP = 0.00051;
/** Attesa del prossimo campione, inclusi demux e scheduling; non è il solo tempo hardware. */
export const tempiDecodifica: number[] = [];
const conti = { flussi: 0 };

interface Lettore { vs: VideoSampleSink; ps: EncodedPacketSink }
/** il cursore di una ricerca passato a un flusso: il fotogramma che si vede, quello dopo e il decoder già in posizione */
interface Cursore { iter: AsyncGenerator<VideoSample, void, unknown>; current: VideoSample; dopo: VideoSample | null }

class Flusso {
  queue: VideoSample[] = [];
  current: VideoSample | null = null;
  done = false;
  dead = false;
  /** è arrivato il primo fotogramma? Con i fotogrammi chiave radi può volerci un attimo: nel frattempo il flusso
   *  NON va buttato (prima si ricreava a ogni giro e il video restava fermo fino al taglio dopo) */
  partito = false;
  /** meglio ripartire da capo: c'è un fotogramma chiave più avanti di dove sta decodificando */
  ripartire = false;
  lastUse = performance.now();
  private iter: AsyncGenerator<VideoSample, void, unknown>;
  private pumping = false;
  private controllo = 0;

  constructor(private l: Lettore, public from: number, cursore?: Cursore | null) {
    conti.flussi++;
    if (cursore) {
      // si riparte da dove la ricerca si è fermata: con i fotogrammi chiave radi (le registrazioni LIVE) si
      // risparmia di ridecodificare tutto dal fotogramma chiave, e il play parte subito
      this.iter = cursore.iter;
      this.current = cursore.current;
      if (cursore.dopo) this.queue.push(cursore.dopo);
      this.partito = true;
    } else this.iter = l.vs.samples(Math.max(0, from));
    void this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.dead && this.queue.length < CODA) {
        const inizio = import.meta.env.DEV ? performance.now() : 0;
        const r = await this.iter.next();
        if (import.meta.env.DEV) {
          if (tempiDecodifica.length >= 4096) tempiDecodifica.shift();
          tempiDecodifica.push(performance.now() - inizio);
        }
        if (this.dead) { r.value?.close(); break; }
        if (r.done) { this.done = true; break; }
        this.queue.push(r.value);
        this.partito = true;
        avvisa();
      }
    } catch {
      this.done = true;
    }
    this.pumping = false;
  }

  /** il fotogramma da mostrare al tempo t: butta quelli passati, tiene l'ultimo raggiunto */
  at(t: number): VideoSample | null {
    this.lastUse = performance.now();
    while (this.queue.length && this.queue[0].timestamp <= t + SCARTO_TIMESTAMP) {
      // a disegno finito: nello stesso disegno qualcuno può avere ancora in mano quello di prima
      chiudiDopo(this.current);
      this.current = this.queue.shift()!;
    }
    if (!this.done) void this.pump();
    return this.current;
  }

  /** l'ultimo istante decodificato (o quello di partenza se non è ancora arrivato niente) */
  private ultimo() {
    const last = this.queue[this.queue.length - 1] ?? this.current;
    return last ? last.timestamp : this.from;
  }

  /** quanto è avanti la decodifica rispetto a t (negativo = indietro) */
  ahead(t: number) { return this.ultimo() - t; }

  /**
   * Il flusso è rimasto indietro: conviene ripartire? Solo se fra dove sta decodificando e t c'è un fotogramma
   * chiave, altrimenti ripartire vorrebbe dire rifare lo stesso lavoro (ed è così che il video si fermava).
   */
  valuta(t: number) {
    const now = performance.now();
    if (now - this.controllo < 400 || this.ripartire) return;
    this.controllo = now;
    const da = this.ultimo();
    void this.l.ps.getKeyPacket(t, { metadataOnly: true }).then((k) => {
      if (k && k.timestamp > da + 0.25 && !this.dead) this.ripartire = true;
    }).catch(() => {});
  }

  close() {
    this.dead = true;
    // il fotogramma mostrato può essere stato appena prestato (ripiego, ponte) a chi disegna adesso: si chiude dopo il disegno
    chiudiDopo(this.current);
    this.current = null;
    for (const s of this.queue) s.close();
    this.queue.length = 0;
    void this.iter.return(undefined).catch(() => {});
  }
}

/**
 * Chiude un fotogramma a disegno finito (alla fine del giro in corso), non adesso: il compositore prende i fotogrammi di
 * tutti gli strati e poi li disegna, e se nello stesso giro un flusso va avanti (la stessa clip chiesta due volte, una
 * transizione) o si butta, il fotogramma già preso era chiuso prima di essere disegnato ("VideoSample is closed").
 */
function chiudiDopo(s: VideoSample | null | undefined) {
  if (s) queueMicrotask(() => s.close());
}

const copre = (c: VideoSample | null, t: number) => !!c && c.timestamp <= t + SCARTO_TIMESTAMP && t < c.timestamp + Math.max(c.duration, 1 / 120) - SCARTO_TIMESTAMP;

class Ricerca {
  current: VideoSample | null = null;
  want: number | null = null;
  /** il punto a cui sta decodificando adesso */
  verso: number | null = null;
  /** l'ultimo t chiesto che nessun fotogramma copre (prima del primo fotogramma, buchi del file): non si richiede più,
   *  se no la ricerca ripartiva dal fotogramma chiave a ogni disegno, con un decoder nuovo ogni volta (fino a 50 al
   *  secondo: nell'app con la scheda video riempivano RAM e VRAM del processo grafico di WebView2) */
  private scoperto: number | null = null;
  busy = false;
  dead = false;
  lastUse = performance.now();
  /** il cursore: legge in avanti dall'ultimo fotogramma, così i passi in avanti costano un fotogramma solo */
  private iter: AsyncGenerator<VideoSample, void, unknown> | null = null;
  /** il fotogramma dopo current, già letto dal cursore */
  private dopo: VideoSample | null = null;
  constructor(private sink: VideoSampleSink) {}

  at(t: number): VideoSample | null {
    this.lastUse = performance.now();
    if (!copre(this.current, t) && this.scoperto !== t) {
      this.want = t;
      if (!this.busy) void this.run();
    }
    return this.current;
  }

  copre(t: number) { return copre(this.current, t); }

  /** sta ancora decodificando verso un punto poco prima di t: conviene aspettarla invece di ripartire dal fotogramma chiave */
  arrivaA(t: number) { return this.busy && this.verso !== null && this.verso <= t + 0.05 && t - this.verso < 3; }

  /** passa il cursore a un flusso che parte da t (il play da dove si è fermi), se è lì o poco prima e non sta lavorando */
  cedi(t: number): Cursore | null {
    const c0 = this.current;
    if (this.busy || this.dead || !this.iter || !c0 || c0.timestamp > t + SCARTO_TIMESTAMP || t - c0.timestamp > 3) return null;
    const c: Cursore = { iter: this.iter, current: c0.clone(), dopo: this.dopo };
    this.iter = null;
    this.dopo = null;
    return c;
  }

  /** chiude il cursore (libera il decoder) ma tiene il fotogramma mostrato */
  riposa() {
    if (!this.busy) this.chiudiCursore();
  }

  private chiudiCursore() {
    this.dopo?.close();
    this.dopo = null;
    void this.iter?.return(undefined).catch(() => {});
    this.iter = null;
  }

  private async prossimo(): Promise<VideoSample | null> {
    if (this.dopo) { const d = this.dopo; this.dopo = null; return d; }
    const r = await this.iter!.next();
    return r.done ? null : r.value;
  }

  private async run() {
    this.busy = true;
    while (this.want !== null && !this.dead) {
      const t = this.want;
      this.want = null;
      this.verso = t;
      try {
        const c = this.current;
        const avanti = !!this.iter && !!c && t >= c.timestamp && t - c.timestamp < 3;
        if (!avanti) {
          await aspettaSentinella();
          this.chiudiCursore();
          this.iter = this.sink.samples(Math.max(0, t));
        }
        // legge fino al fotogramma che copre t; quello dopo resta pronto per il passo seguente
        let primo = !avanti;
        for (;;) {
          const s = await this.prossimo();
          if (this.dead) { s?.close(); break; }
          if (!s) break;
          // ripartiti da capo e il primo fotogramma è già dopo t (t prima dell'inizio del file): si mostra quello
          if (primo && s.timestamp > t + SCARTO_TIMESTAMP) { this.current?.close(); this.current = s; break; }
          primo = false;
          if (s.timestamp > t + SCARTO_TIMESTAMP && this.current) { this.dopo = s; break; }
          this.current?.close();
          this.current = s;
          if (copre(s, t)) { avvisa(); if (this.want !== null) break; }
        }
      } catch {
        // decoder in errore: si riparte da capo alla prossima richiesta
        this.chiudiCursore();
      }
      this.scoperto = copre(this.current, t) ? null : t;
      if (!this.dead) avvisa();
    }
    this.verso = null;
    this.busy = false;
  }

  close() {
    this.dead = true;
    this.current?.close();
    this.current = null;
    this.want = null;
    this.chiudiCursore();
  }
}

const lettori = new Map<string, Lettore>();
const flussi = new Map<string, Flusso>();
const ricerche = new Map<string, Ricerca>();
/** dove sta chiedendo ogni voce e da quando: il fotogramma nitido si chiede solo quando ci si ferma */
const fermo = new Map<string, { t: number; da: number }>();
/**
 * L'ultima volta che qualcuno ha chiesto un fotogramma. "Non usato da un po'" si conta da qui e non dall'orologio: un
 * flusso è vecchio se dopo di lui si sono chiesti altri fotogrammi per un po', non se il disegno è lento (un computer
 * lento, la scheda video che arranca, una lettura dei pixel, la memoria che si libera). Prima, dopo un giro più lungo
 * di 1,5 s, pulisci() lo chiudeva subito prima del disegno e quello nuovo ripartiva dal fotogramma chiave (con le
 * registrazioni LIVE anche 20 s prima): immagine ferma, poi nero.
 */
let ultimaRichiesta = performance.now();
/** oltre questi si chiude comunque, anche se nessuno chiede più niente (un vuoto in timeline, la pagina ferma a lungo) */
const ETA_MAX_FLUSSO = 6000, ETA_MAX_RICERCA = 20000;

/**
 * L'ultimo fotogramma di un flusso buttato a metà play (ripartito più avanti, tornato indietro): si mostra finché il
 * flusso nuovo non ha il suo. Prima in quel momento il monitor faceva un lampo nero, o tornava al fotogramma fermo di
 * quando si era premuto play.
 */
const ponti = new Map<string, VideoSample>();
function mettiPonte(k: string, f: Flusso) {
  if (!f.current) return;
  ponti.get(k)?.close();
  ponti.set(k, f.current.clone());
}
function togliPonte(k: string) {
  const s = ponti.get(k);
  if (!s) return;
  chiudiDopo(s);
  ponti.delete(k);
}

// il monitor ha la precedenza sulle miniature della timeline: una ricerca in corso o un flusso in riproduzione
quandoDecoderOccupato(() => flussi.size > 0 || [...ricerche.values()].some((r) => r.busy));

/** il proxy della ripresa, se c'è ed è pronto (con "proxy: mai" i monitor leggono sempre gli originali) */
const proxyDi = (r: MediaRT) => (r.proxy && modoProxy() !== 'mai' ? r.proxy : null);
// proxy pronto o modo cambiato: si ridisegna (i flussi nuovi prendono la qualità giusta da soli)
quandoProxy(() => avvisa());

function lettoreDi(mediaId: string, q: Qualita): Lettore | null {
  const k = mediaId + '|' + q;
  let l = lettori.get(k);
  if (l) return l;
  const r = mediaRT(mediaId);
  const track = q === 'p' ? r?.proxy?.v : r?.vDecodable ? r.v : undefined;
  if (!track) return null;
  l = { vs: new VideoSampleSink(track), ps: new EncodedPacketSink(track) };
  lettori.set(k, l);
  return l;
}

const ascoltatori = new Set<() => void>();
let avvisoInCoda = false;
function avvisa() {
  if (avvisoInCoda) return;
  avvisoInCoda = true;
  queueMicrotask(() => { avvisoInCoda = false; for (const f of ascoltatori) f(); });
}
/** chi disegna si iscrive qui: viene chiamato quando arriva un fotogramma nuovo */
export const quandoFotogramma = (fn: () => void) => { ascoltatori.add(fn); return () => ascoltatori.delete(fn); };

function ricerca(k: string, l: Lettore): Ricerca {
  let rc = ricerche.get(k);
  if (!rc) { rc = new Ricerca(l.vs); ricerche.set(k, rc); }
  return rc;
}

/**
 * Un flusso nuovo da t. Se la ricerca della stessa voce è già lì (il play da fermo) prende il suo cursore; se ci sta
 * ancora arrivando si aspetta lei (null): ripartire dal fotogramma chiave vorrebbe dire rifare lo stesso lavoro due volte.
 */
function nuovoFlusso(k: string, l: Lettore, t: number): Flusso | null {
  const rc = ricerche.get(k);
  if (rc?.arrivaA(t)) return null;
  const f = new Flusso(l, t, rc?.cedi(t));
  flussi.set(k, f);
  return f;
}

/** il flusso della voce k: nuovo se non c'è, se si è tornati indietro o se conviene ripartire più avanti */
function flussoDi(k: string, l: Lettore, t: number): Flusso | null {
  let f = flussi.get(k);
  if (f) {
    const indietro = t < f.from - 0.05 || (!!f.current && t < f.current.timestamp - 0.05);
    const finito = f.done && !f.queue.length && !!f.current && t > f.current.timestamp + 1;
    if (indietro || finito || f.ripartire) { mettiPonte(k, f); f.close(); flussi.delete(k); f = undefined; }
    // indietro, ma solo dopo il primo fotogramma: un flusso appena ripartito va lasciato lavorare (se no si
    // ricomincia di continuo e si butta via la decodifica già fatta)
    else if (f.partito && f.ahead(t) < -0.6) f.valuta(t);
  }
  return f ?? nuovoFlusso(k, l, t);
}

/**
 * Il fotogramma della sorgente mediaId al tempo t per la "voce" key (una clip, il Player…).
 * In riproduzione usa il flusso, da fermo la ricerca. Non aspetta mai: ritorna quello che c'è.
 * larghezza = quanti pixel servono (0 = va bene anche il proxy).
 */
export function fotogramma(key: string, mediaId: string, t: number, flusso: boolean, larghezza = 0): Fotogramma | null {
  ultimaRichiesta = performance.now();
  const r = mediaRT(mediaId);
  if (!r) return null;
  if (r.image) return r.image;
  const px = proxyDi(r);
  const q: Qualita = px ? 'p' : 'o';
  const l = lettoreDi(mediaId, q);
  if (!l) return null;
  const base = key + '|' + mediaId + '|';
  const k = base + q;
  if (flusso) {
    const f = flussoDi(k, l, t);
    const s = f?.at(t);
    if (s) { togliPonte(k); return s; }
    // mentre il flusso parte si mostra l'ultimo fotogramma vero: quello del flusso appena buttato, quello dell'altra
    // qualità (la copia leggera è diventata pronta a metà play), o quello che la ricerca aveva già
    const altra = base + (q === 'p' ? 'o' : 'p');
    const fa = flussi.get(altra), rk = ricerche.get(k), ra = ricerche.get(altra);
    const ripiego = ponti.get(k) ?? fa?.current ?? rk?.current ?? ra?.current ?? f?.current ?? null;
    // chi presta il fotogramma resta vivo finché serve: se no, col flusso nuovo ancora lontano (fotogrammi chiave radi),
    // pulisci() chiudeva la ricerca dopo 8 s "senza uso" e il monitor andava nero
    if (ripiego) for (const x of [fa, rk, ra]) if (x && x.current === ripiego) x.lastUse = ultimaRichiesta;
    return ripiego;
  }
  const fl = flussi.get(k);
  const veloce = ricerca(k, l).at(t);
  if (px && larghezza > px.w * 1.1) {
    // il monitor è più grande del proxy: fermi da un attimo, arriva il fotogramma dell'originale
    const now = performance.now();
    const st = fermo.get(base);
    if (!st || Math.abs(st.t - t) > 1e-4) fermo.set(base, { t, da: now });
    const lo = lettoreDi(mediaId, 'o');
    if (lo) {
      const fermoDa = now - (fermo.get(base)?.da ?? now);
      const rn = ricerche.get(base + 'o');
      if (fermoDa >= 140) {
        const n = ricerca(base + 'o', lo).at(t);
        if (n && copre(n, t)) return n;
      } else {
        if (rn?.copre(t)) return rn.current;
        setTimeout(avvisa, 150);
      }
    }
  }
  if (!veloce && fl?.current) return fl.current;
  return veloce ?? ricerche.get(base + (q === 'p' ? 'o' : 'p'))?.current ?? null;
}

/** la voce ha già un fotogramma per t? (il play aspetta un attimo i flussi, così parte in sincrono) */
export function pronto(key: string, mediaId: string, t: number): boolean {
  const r = mediaRT(mediaId);
  if (!r || r.image || !r.vDecodable) return true;
  const k = key + '|' + mediaId + '|' + (proxyDi(r) ? 'p' : 'o');
  const f = flussi.get(k);
  return !!f && (f.partito || f.done) && f.ahead(t) > -0.1;
}

/** scalda il decoder della clip che sta per arrivare, così il taglio è pulito */
export function prepara(key: string, mediaId: string, t: number) {
  const r = mediaRT(mediaId);
  if (!r || r.image) return;
  const q: Qualita = proxyDi(r) ? 'p' : 'o';
  const l = lettoreDi(mediaId, q);
  if (!l) return;
  const k = key + '|' + mediaId + '|' + q;
  const f = flussi.get(k);
  if (f && Math.abs(f.from - t) < 0.5 && !f.dead) { f.lastUse = performance.now(); return; }
  f?.close();
  flussi.delete(k);
  nuovoFlusso(k, l, t);
}

/** chiude i flussi non usati da un po' (libera i decoder e la memoria video) */
export function pulisci(maxEta = 1500) {
  const now = performance.now();
  const vecchio = (uso: number, eta: number, max: number) => ultimaRichiesta - uso > eta || now - uso > max;
  for (const [k, f] of flussi) if (vecchio(f.lastUse, maxEta, ETA_MAX_FLUSSO)) { f.close(); flussi.delete(k); togliPonte(k); }
  for (const k of [...ponti.keys()]) if (!flussi.has(k)) togliPonte(k);
  for (const [k, r] of ricerche) {
    if (vecchio(r.lastUse, 8000, ETA_MAX_RICERCA)) { r.close(); ricerche.delete(k); }
    else if (now - r.lastUse > 2000) r.riposa();
  }
}
setInterval(() => pulisci(), 1000);

/** ferma tutti i flussi (stop o salto): la ricerca resta per il fermo immagine */
export function fermaFlussi() {
  for (const [k, f] of flussi) {
    // il fotogramma corrente passa alla ricerca, così lo stop non fa sparire l'immagine
    const rc = ricerche.get(k);
    if (f.current && (!rc || !rc.current)) {
      const [, mediaId, q] = k.split('|').slice(-3);
      const l = lettoreDi(mediaId, q as Qualita);
      if (l) ricerca(k, l).current = f.current.clone();
    }
    f.close();
  }
  flussi.clear();
  for (const k of [...ponti.keys()]) togliPonte(k);
}

/** chi ha finito di guardare (l'anteprima del contenitore) libera il suo fotogramma */
export function lascia(key: string, mediaId: string) {
  for (const q of ['p', 'o']) {
    const k = key + '|' + mediaId + '|' + q;
    ricerche.get(k)?.close();
    ricerche.delete(k);
  }
}

/** la ripresa è sparita o ha cambiato proxy: via decoder, flussi e ricerche */
export function dimenticaMedia(mediaId: string, soloProxy = false) {
  const tocca = (k: string) => k.includes('|' + mediaId + '|') && (!soloProxy || k.endsWith('|p'));
  for (const k of [...lettori.keys()]) if ((k + '|').startsWith(mediaId + '|') && (!soloProxy || k.endsWith('|p'))) lettori.delete(k);
  for (const [k, f] of flussi) if (tocca(k)) { f.close(); flussi.delete(k); }
  for (const k of [...ponti.keys()]) if (tocca(k)) togliPonte(k);
  for (const [k, r] of ricerche) if (tocca(k)) { r.close(); ricerche.delete(k); }
  avvisa();
}

export function statoDecoder() {
  return { flussi: flussi.size, ricerche: ricerche.size, nati: conti.flussi };
}

