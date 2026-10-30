// Il trasporto: play, stop, shuttle J-K-L, passo a passo, preroll. Tiene l'orologio (quello della scheda
// audio a velocità 1, altrimenti quello del sistema) e fa disegnare i due monitor a ogni giro.
import { store } from './core/store';
import { fps, f2s } from './core/timecode';
import { projectEnd } from './core/progetto';
import { banco } from './media/audio';
import { OrologioMonitor } from './media/orologioMonitor';
import { fermaFlussi, fotogramma, prepara, pronto, pulisci, quandoFotogramma } from './media/fotogrammi';
import { mediaRT, quandoAnalisi } from './media/libreria';
import { pausaProxy } from './media/proxy';
import { Compositore } from './render/compositore';
import { inArrivo, pianoVideo } from './render/piano';

export type Monitor = 'player' | 'recorder';
type Giro = (playing: boolean) => void;

class Motore {
  attivo: Monitor = 'recorder';
  /** velocità: 0 fermo, 1 normale, negativa all'indietro */
  speed = 0;
  playerMedia: string | null = null;
  /** posizione del Player in secondi di sorgente */
  playerT = 0;
  loop = false;
  rec: Compositore | null = null;
  playerCanvas: HTMLCanvasElement | null = null;
  private clock0 = 0;
  private pos0 = 0;
  private orologioMonitor = new OrologioMonitor();
  /** il play aspetta (al massimo un attimo) che i fotogrammi del punto di partenza siano pronti: così audio e
   *  video partono insieme anche dal mezzo di una ripresa coi fotogrammi chiave radi */
  private attesa = 0;
  private stopAt: number | null = null;
  private sporcoRec = true;
  private sporcoPlayer = true;
  private giri = new Set<Giro>();
  private ultimoPulisci = 0;
  fpsMisurati = 0;
  private contaFps = 0;
  private tFps = performance.now();
  /** ultimo fotogramma disegnato nel Recorder (per la prova e per gli strumenti) */
  ultimoDisegnato = -1;

  constructor() {
    quandoFotogramma(() => { this.sporcoRec = true; this.sporcoPlayer = true; });
    quandoAnalisi(() => { this.sporcoRec = true; });
    store.on('doc', () => {
      this.sporcoRec = true;
      if (this.speed === 1 && this.attivo === 'recorder') banco.rimescola(store.doc);
      banco.aggiornaTracce(store.doc);
    });
    store.on('head', () => { this.sporcoRec = true; });
    requestAnimationFrame((t) => this.tick(t));
  }

  /** chi vuole essere chiamato a ogni fotogramma dello schermo (VU, strumenti, timecode) */
  ogniGiro(fn: Giro) { this.giri.add(fn); return () => this.giri.delete(fn); }

  ridisegna() { this.sporcoRec = true; this.sporcoPlayer = true; }

  get playing() { return this.speed !== 0; }

  setMonitor(m: Monitor) {
    if (this.attivo === m) return;
    this.stop();
    this.attivo = m;
    store.emit('status');
  }

  caricaPlayer(mediaId: string | null, t?: number) {
    if (this.attivo === 'player') this.stop();
    this.playerMedia = mediaId;
    const m = mediaId ? store.doc.media.find((x) => x.id === mediaId) : null;
    this.playerT = t ?? m?.markIn ?? m?.t0 ?? 0;
    this.sporcoPlayer = true;
    store.emit('status');
  }

  private fineCorrente(): number {
    if (this.attivo === 'recorder') return Math.max(0, projectEnd(store.doc));
    const m = store.doc.media.find((x) => x.id === this.playerMedia);
    return m ? (m.type === 'image' ? 10 : m.duration) : 0;
  }

  play(speed = 1, stopAt: number | null = null) {
    if (this.attivo === 'player' && !this.playerMedia) return;
    const d = store.doc;
    this.speed = speed;
    this.stopAt = stopAt;
    if (this.attivo === 'recorder') {
      const endF = projectEnd(d);
      if (speed > 0 && store.head >= endF - 1 && stopAt === null) store.setHead(0);
    } else {
      const m = d.media.find((x) => x.id === this.playerMedia)!;
      const out = m.markOut ?? m.duration;
      if (speed > 0 && this.playerT >= out - 0.02 && stopAt === null) this.playerT = m.markIn ?? m.t0 ?? 0;
    }
    banco.ferma();
    pausaProxy(true);
    if (speed > 0 && speed <= 2) {
      this.attesa = performance.now();
      this.scalda();
    } else this.avvia(performance.now());
    store.emit('status');
  }

  /** i decoder del punto di partenza si mettono in moto */
  private scalda() {
    for (const [key, media, t] of this.vociVideo()) prepara(key, media, t);
  }

  /** le voci video che servono adesso: [chiave, media, secondi di sorgente] */
  private vociVideo(): [string, string, number][] {
    const out: [string, string, number][] = [];
    if (this.attivo === 'recorder') {
      for (const s of pianoVideo(store.doc, Math.floor(store.head + 1e-6))) {
        for (const x of [s.a, s.b]) if (x && x.clip.kind === 'media' && x.clip.media) out.push([x.clip.id, x.clip.media, x.t]);
      }
    } else if (this.playerMedia) out.push(['player', this.playerMedia, this.playerT]);
    return out;
  }

  /** l'orologio parte: da adesso contano il tempo e l'audio */
  private avvia(now: number) {
    this.orologioMonitor.azzera();
    this.attesa = 0;
    this.clock0 = now;
    const d = store.doc;
    if (this.attivo === 'recorder') {
      this.pos0 = store.head;
      if (this.speed === 1) banco.suona(d, f2s(store.head, d.rate));
    } else {
      this.pos0 = this.playerT;
      if (this.speed === 1 && this.playerMedia) banco.suonaSorgente(d, this.playerMedia, this.playerT);
    }
  }

  stop() {
    if (!this.speed) return;
    this.speed = 0;
    this.attesa = 0;
    pausaProxy(false);
    banco.ferma();
    fermaFlussi();
    if (this.attivo === 'recorder') store.setHead(Math.round(store.head));
    this.stopAt = null;
    this.sporcoRec = this.sporcoPlayer = true;
    store.emit('status', 'head');
  }

  toggle() { if (this.speed) this.stop(); else this.play(1); }

  /** J e L: ogni pressione raddoppia la velocità, come la manopola dello shuttle */
  shuttle(dir: 1 | -1) {
    let s = this.speed;
    if (dir > 0) s = s <= 0 ? 1 : Math.min(16, s * 2);
    else s = s >= 0 ? -1 : Math.max(-16, s * 2);
    this.stop();
    this.play(s);
  }

  /** velocità continua dalla manopola dello shuttle (-16..16) */
  shuttleContinuo(s: number) {
    if (Math.abs(s) < 0.05) { this.stop(); return; }
    if (this.speed === s) return;
    this.orologioMonitor.azzera();
    const wasAudio = this.speed === 1;
    this.speed = s;
    this.attesa = 0;
    pausaProxy(true);
    this.pos0 = this.attivo === 'recorder' ? store.head : this.playerT;
    this.clock0 = performance.now();
    if (wasAudio || s === 1) {
      banco.ferma();
      if (s === 1) {
        if (this.attivo === 'recorder') banco.suona(store.doc, f2s(store.head, store.doc.rate));
        else if (this.playerMedia) banco.suonaSorgente(store.doc, this.playerMedia, this.playerT);
      }
    }
    store.emit('status');
  }

  /** passo di n fotogrammi sul monitor attivo, con un colpetto d'audio per sentire dove si è */
  passo(n: number, suono = true) {
    this.stop();
    if (this.attivo === 'recorder') {
      store.setHead(Math.max(0, Math.round(store.head) + n));
      if (suono) banco.scrub(store.doc, f2s(Math.round(store.head), store.doc.rate));
    } else {
      const m = store.doc.media.find((x) => x.id === this.playerMedia);
      if (!m) return;
      const r = m.fps || fps(store.doc.rate);
      this.playerT = Math.max(m.t0 || 0, Math.min(m.duration || 0, this.playerT + n / r));
      if (suono && m.hasAudio) banco.scrubSorgente(m.id, this.playerT);
      this.sporcoPlayer = true;
      store.emit('status');
    }
  }

  vaiA(f: number) {
    const was = this.speed;
    this.stop();
    store.setHead(Math.max(0, f));
    if (was === 1) this.play(1);
  }

  playerVaiA(t: number) {
    const m = store.doc.media.find((x) => x.id === this.playerMedia);
    if (!m) return;
    this.stop();
    this.playerT = Math.max(m.t0 || 0, Math.min(m.duration || 10, t));
    this.sporcoPlayer = true;
    store.emit('status');
  }

  /** rivedi: da preroll prima di a fino a postroll dopo b (il REVIEW della centralina) */
  rivedi(a: number, b: number) {
    this.setMonitor('recorder');
    const pre = Math.round(store.doc.preroll * fps(store.doc.rate));
    this.stop();
    store.setHead(Math.max(0, a - pre));
    this.play(1, b + pre);
  }

  private tick(now: number) {
    requestAnimationFrame((t) => this.tick(t));
    const d = store.doc;
    const r = fps(d.rate);
    if (this.speed !== 0 && this.attesa) {
      // si parte quando tutti i fotogrammi del punto di partenza ci sono (o dopo un attimo comunque)
      if (now - this.attesa > 900 || this.vociVideo().every(([k, m, t]) => pronto(k, m, t))) this.avvia(now);
    }
    if (this.speed !== 0 && !this.attesa) {
      if (this.attivo === 'recorder') {
        let f: number;
        if (this.speed === 1 && banco.suonando) f = this.orologioMonitor.leggi(banco.ora(), now) * r;
        else f = this.pos0 + ((now - this.clock0) / 1000) * r * this.speed;
        const endF = projectEnd(d);
        const limit = this.stopAt ?? endF;
        if (this.speed > 0 && f >= limit) {
          // il loop senza attacco e stacco rifà tutto il montaggio da capo
          if (this.loop && this.stopAt === null && endF > 0) { this.stop(); store.setHead(d.inF !== null && d.outF !== null ? d.inF : 0); this.play(1); }
          else { this.stop(); store.setHead(Math.min(limit, Math.max(endF, 0))); }
        } else if (this.speed < 0 && f <= 0) {
          this.stop();
          store.setHead(0);
        } else {
          if (this.loop && d.inF !== null && d.outF !== null && this.speed > 0 && f >= d.outF) { this.stop(); store.setHead(d.inF); this.play(1); }
          else { store.head = Math.max(0, f); store.emit('head'); }
        }
        // scalda i decoder delle clip che arrivano
        if (this.speed > 0) for (const s of inArrivo(d, store.head, Math.ceil(r * 1.2))) prepara(s.clip.id, s.clip.media!, s.t);
      } else {
        const m = d.media.find((x) => x.id === this.playerMedia);
        if (m) {
          let t: number;
          if (this.speed === 1 && banco.suonando) t = this.orologioMonitor.leggi(banco.ora(), now);
          else t = this.pos0 + ((now - this.clock0) / 1000) * this.speed;
          const out = this.stopAt ?? m.markOut ?? this.fineCorrente();
          const inn = m.markIn ?? m.t0 ?? 0;
          if (this.speed > 0 && t >= out) {
            if (this.loop) { this.stop(); this.playerT = inn; this.play(1); }
            else { this.stop(); this.playerT = out; }
          } else if (this.speed < 0 && t <= (m.t0 || 0)) { this.stop(); this.playerT = m.t0 || 0; }
          else this.playerT = t;
          this.sporcoPlayer = true;
          store.emit('status');
        }
      }
      if (now - this.ultimoPulisci > 500) { pulisci(); this.ultimoPulisci = now; }
    }
    const playing = this.speed !== 0;
    const flusso = playing && this.speed > 0 && this.speed <= 2;
    if (this.rec && (this.sporcoRec || (playing && this.attivo === 'recorder'))) {
      this.sporcoRec = false;
      // Nel play il monitor segue il tempo continuo dello schermo. Arrotondare prima
      // al frame del progetto limita anche una sorgente 60p ai 25/30 fps del progetto
      // e aggiunge un secondo arrotondamento ai timestamp WebM. Jog e fermo restano esatti.
      const f = flusso && this.attivo === 'recorder' ? store.head : Math.floor(store.head + 1e-6);
      const w = this.rec.canvas as HTMLCanvasElement;
      if (w.width > 0 && w.height > 0) {
        this.rec.render(d, pianoVideo(d, f), flusso && this.attivo === 'recorder', f);
        this.ultimoDisegnato = f;
        if (this.attivo === 'recorder') this.contaFps++;
      }
    }
    if (this.playerCanvas && (this.sporcoPlayer || (playing && this.attivo === 'player'))) {
      this.sporcoPlayer = false;
      this.disegnaPlayer(flusso && this.attivo === 'player');
      if (this.attivo === 'player') this.contaFps++;
    }
    // Conta i disegni del monitor attivo e dividi per il tempo reale: i rAF a vuoto e
    // una finestra durata più di un secondo non devono gonfiare il contatore.
    if (now - this.tFps > 1000) { this.fpsMisurati = Math.round(this.contaFps * 1000 / (now - this.tFps)); this.contaFps = 0; this.tFps = now; }
    for (const g of this.giri) g(playing);
  }

  private disegnaPlayer(flusso: boolean) {
    const c = this.playerCanvas!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    const m = store.doc.media.find((x) => x.id === this.playerMedia);
    if (!m) return;
    const rt = mediaRT(m.id);
    if (!rt || rt.stato !== 'ok') return;
    if (m.type === 'audio' || (m.hasAudio && !rt.vDecodable)) {
      disegnaOnda(ctx, c.width, c.height, rt.peaks, m.duration, this.playerT);
      return;
    }
    const f = fotogramma('player', m.id, this.playerT, flusso, c.width);
    if (!f) return;
    if (f instanceof ImageBitmap) {
      const k = Math.min(c.width / f.width, c.height / f.height);
      ctx.drawImage(f, (c.width - f.width * k) / 2, (c.height - f.height * k) / 2, f.width * k, f.height * k);
    } else {
      try { f.drawWithFit(ctx, { fit: 'contain' }); } catch { /* fotogramma chiuso nel frattempo */ }
    }
  }
}

/** per le sorgenti solo audio il Player mostra la forma d'onda con il cursore */
function disegnaOnda(ctx: CanvasRenderingContext2D, w: number, h: number, peaks: Float32Array | undefined, dur: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1a12');
  g.addColorStop(1, '#040806');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (!peaks || !dur) return;
  ctx.fillStyle = '#5dffb4';
  const mid = h / 2;
  for (let x = 0; x < w; x++) {
    const a = Math.floor((x / w) * peaks.length), b = Math.floor(((x + 1) / w) * peaks.length);
    let m = 0;
    for (let i = a; i <= b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
    const y = m * h * 0.45;
    ctx.fillRect(x, mid - y, 1, y * 2 || 1);
  }
  ctx.fillStyle = '#ff4d6d';
  ctx.fillRect((t / dur) * w - 1, 0, 2, h);
}

export const motore = new Motore();
(globalThis as any).__motore = motore;
