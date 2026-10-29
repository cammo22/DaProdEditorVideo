// Il banco audio: tracce con volume, panorama, muto e solo; clip con linea elastica del volume, dissolvenze e
// incroci; il tono di riferimento. Lo stesso grafo serve la riproduzione e l'export (OfflineAudioContext).
import { AudioBufferSink } from 'mediabunny';
import type { Clip, Project } from '../core/tipi';
import { gainDbAl, puntiLinea, valoreAnim } from '../core/automazioni';
import { dbToGain, end, fadeAl, keyValue, masterDi, mediaOf, newTransition } from '../core/progetto';
import { transizioniAttive } from '../core/blocchi';
import { f2s } from '../core/timecode';
import { mediaRT } from './libreria';
import { bufferSuono, suoniFx } from './suoni';
import { Stiratore } from './stira';
import { conDucking } from '../core/ducking';

const SUONA = new Set(['media', 'tone', 'beep']);

/**
 * Le transizioni dei blocchetti FX valgono anche per l'audio legato: la clip audio che entra con la sua ripresa si
 * incrocia con quella di prima, come una dissolvenza. Si lavora su una copia leggera del progetto (le clip audio
 * interessate ricevono una transizione in testa), così il resto del banco non cambia.
 */
export function conIncroci(p: Project): Project {
  const trs = transizioniAttive(p);
  if (!trs.length) return conDucking(p);
  const audio = new Set(p.tracks.filter((t) => t.kind === 'audio').map((t) => t.id));
  const nuovi = new Map<string, Clip>();
  for (const x of trs) {
    if (!x.a || !x.b?.link) continue;
    const L = Math.max(1, x.e - x.cut);
    for (const c of p.clips) {
      if (c.link !== x.b.link || !audio.has(c.track) || c.trIn || c.start !== x.b.start) continue;
      if (!p.clips.some((z) => z.track === c.track && z.id !== c.id && end(z) === c.start)) continue;
      nuovi.set(c.id, { ...c, trIn: newTransition('mix', Math.min(L, c.len)) });
    }
  }
  return conDucking(nuovi.size ? { ...p, clips: p.clips.map((c) => nuovi.get(c.id) ?? c) } : p);
}

/** la clip audio attaccata dopo c con transizione in testa (allunga c per l'incrocio) */
function codaIncrocio(p: Project, c: Clip): number {
  const n = p.clips.find((x) => x.track === c.track && x.id !== c.id && x.start === end(c) && x.trIn);
  return n?.trIn ? n.trIn.len : 0;
}

/**
 * Guadagno lineare della clip al fotogramma locale lf (linea elastica × dissolvenze × incroci).
 * Attenzione al fotogramma della fine (lf = len): vale ancora il volume pieno. Prima qui c'era lo zero, e la
 * rampa lineare verso quel punto abbassava piano piano tutta la clip: il "fade out automatico" che non si voleva.
 */
export function guadagnoClip(c: Clip, lf: number, coda: number): number {
  const db = gainDbAl(c, lf, keyValue);
  let g = dbToGain(db + keyValue(c.duckKeys ?? [], lf, 0));
  // le dissolvenze con la loro forma (dritta, morbida, analogica, veloce, a S): la stessa del disegno
  g *= fadeAl(c, lf);
  if (c.trIn && lf < c.trIn.len) g *= Math.max(0, lf / c.trIn.len);
  if (c.trOut && lf > c.len - c.trOut.len) g *= Math.max(0, (c.len - lf) / c.trOut.len);
  if (lf > c.len) g *= coda > 0 ? Math.max(0, 1 - (lf - c.len) / coda) : 0;
  if (lf < 0) g = 0;
  return g;
}

/** punti dell'inviluppo (fotogrammi locali) dove il guadagno cambia pendenza */
export function puntiInviluppo(c: Clip, coda: number): number[] {
  const s = new Set<number>([0, c.len, c.len + coda]);
  const add = (a: number, b: number, n = 6) => { for (let i = 0; i <= n; i++) s.add(a + ((b - a) * i) / n); };
  // le dissolvenze curve hanno bisogno di più punti (fra un punto e l'altro la rampa è dritta)
  const piega = (cv?: { k: number; s?: boolean }) => (cv && (cv.k || cv.s) ? 24 : 6);
  if (c.fadeIn) add(0, c.fadeIn, piega(c.curvaIn));
  if (c.fadeOut) add(c.len - c.fadeOut, c.len, piega(c.curvaOut));
  if (c.trIn) add(0, c.trIn.len);
  if (c.trOut) add(c.len - c.trOut.len, c.len);
  if (coda) add(c.len, c.len + coda);
  // i keyframe del volume: le chiavi e i punti in mezzo (curve morbide, gradini)
  for (const f of puntiLinea(c.anim?.gain)) s.add(f);
  for (let i = 0; i < c.gainKeys.length; i++) {
    s.add(c.gainKeys[i].f);
    if (i) add(c.gainKeys[i - 1].f, c.gainKeys[i].f);
  }
  for (let i = 0; i < (c.duckKeys?.length ?? 0); i++) {
    s.add(c.duckKeys![i].f);
    if (i) add(c.duckKeys![i - 1].f, c.duckKeys![i].f, 24);
  }
  return [...s].filter((x) => x >= 0 && x <= c.len + coda).sort((a, b) => a - b);
}

/**
 * Tono e bip dei generatori: fisso, o a colpetti (un bip ogni `ogni` secondi: il countdown).
 * inizio = quando comincia la clip, da..a = il pezzo da suonare (tutti in tempo del contesto audio).
 */
function suonaTono(ctx: BaseAudioContext, c: Clip, uscita: AudioNode, inizio: number, da: number, a: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.frequency.value = c.gen?.freq ?? 1000;
  const lv = ctx.createGain();
  const livello = dbToGain(c.gen?.level ?? -18);
  const ogni = c.gen?.ogni;
  if (ogni) {
    const bip = c.gen?.bip ?? 0.08;
    lv.gain.setValueAtTime(0, da);
    for (let k = 0; inizio + k * ogni < a; k++) {
      const t0 = inizio + k * ogni;
      if (t0 + bip <= da) continue;
      const s0 = Math.max(da, t0);
      lv.gain.setValueAtTime(livello, s0);
      lv.gain.setValueAtTime(0, Math.max(s0 + 0.002, t0 + bip));
    }
  } else lv.gain.value = livello;
  o.connect(lv).connect(uscita);
  o.start(da);
  o.stop(Math.max(da + 0.01, a));
  return o;
}

/** programma l'inviluppo su un GainNode: t0 = tempo del contesto in cui la timeline è a startSec */
export function applicaInviluppo(g: GainNode, p: Project, c: Clip, coda: number, t0: number, startSec: number, now: number) {
  const r = p.rate;
  const toCtx = (lf: number) => t0 + f2s(c.start + lf, r) - startSec;
  const pts = puntiInviluppo(c, coda);
  const lfNow = ((now - t0 + startSec) * r.num) / r.den - c.start;
  g.gain.cancelScheduledValues(0);
  g.gain.setValueAtTime(guadagnoClip(c, Math.max(0, lfNow), coda), Math.max(now, toCtx(0)));
  for (const lf of pts) {
    const when = toCtx(lf);
    if (when <= now) continue;
    g.gain.linearRampToValueAtTime(guadagnoClip(c, lf, coda), when);
  }
}

/** il panorama con i keyframe: rampe fra le chiavi (senza animazione resta il valore fermo, programmato dal chiamante) */
export function applicaPanorama(pn: StereoPannerNode, p: Project, c: Clip, t0: number, startSec: number, now: number) {
  const k = c.anim?.pan;
  if (!k?.length) return;
  const toCtx = (lf: number) => t0 + f2s(c.start + lf, p.rate) - startSec;
  const lfNow = ((now - t0 + startSec) * p.rate.num) / p.rate.den - c.start;
  const lim = (v: number) => Math.max(-1, Math.min(1, v));
  pn.pan.cancelScheduledValues(0);
  pn.pan.setValueAtTime(lim(valoreAnim(k, Math.max(0, lfNow), c.pan)), Math.max(now, toCtx(0)));
  for (const lf of puntiLinea(k)) {
    const when = toCtx(lf);
    if (when <= now) continue;
    pn.pan.linearRampToValueAtTime(lim(valoreAnim(k, lf, c.pan)), when);
  }
}

/**
 * Gli effetti audio della clip come catena di filtri: si inserisce fra le sorgenti e il guadagno della voce.
 * Ritorna il nodo in cui far entrare l'audio (o il guadagno stesso se non ci sono effetti).
 */
function catenaEffetti(ctx: BaseAudioContext, c: Clip, uscita: AudioNode): AudioNode {
  const fx = c.afx;
  if (!fx || (!fx.voce && !fx.bassi && !fx.radio && !fx.eco && !fx.ovattato && !fx.robot)) return uscita;
  const nodi: AudioNode[] = [];
  const f = (type: BiquadFilterType, freq: number, gain = 0, q = 0.707) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.gain.value = gain; b.Q.value = q; nodi.push(b); };
  if (fx.bassi || fx.voce) f('highpass', fx.voce ? 110 : 90);
  if (fx.voce) { f('peaking', 3200, 4, 0.9); f('lowshelf', 220, -2.5); }
  if (fx.radio) { f('highpass', 450, 0, 0.9); f('lowpass', 3200, 0, 0.9); f('peaking', 1600, 5, 1.2); }
  if (fx.ovattato) { f('lowpass', 650, 0, 0.8); f('lowshelf', 180, 3); }
  if (fx.robot) {
    // robot: la voce moltiplicata per un'onda lenta (ring modulator) e un po' di metallo
    const rm = ctx.createGain();
    rm.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    osc.connect(rm.gain);
    osc.start();
    nodi.push(rm);
    f('peaking', 1800, 6, 1.4);
  }
  if (!nodi.length) { const g = ctx.createGain(); nodi.push(g); }
  for (let i = 0; i < nodi.length - 1; i++) nodi[i].connect(nodi[i + 1]);
  const ultimo = nodi[nodi.length - 1];
  ultimo.connect(uscita);
  if (fx.eco) {
    // l'eco: un ritardo che si richiama da solo, sempre più piano
    const d = ctx.createDelay(1);
    d.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    ultimo.connect(d);
    d.connect(fb).connect(d);
    d.connect(wet).connect(uscita);
  }
  return nodi[0];
}

/** l'uscita finale: volume del Finale e limitatore (niente distorsione quando le tracce si sommano) */
function uscitaFinale(ctx: BaseAudioContext, p: Project, dest: AudioNode): AudioNode[] {
  const m = masterDi(p);
  const g = ctx.createGain();
  g.gain.value = dbToGain(m.volume);
  if (m.limiter) {
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1.5;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.12;
    g.connect(lim).connect(dest);
    return [g, lim];
  }
  g.connect(dest);
  return [g];
}

type FlussoAudio = AsyncGenerator<{ buffer: AudioBuffer; timestamp: number }, void, unknown>;
/** un pezzo d'audio già al ritmo della timeline: tl = secondi dall'inizio della clip, rate = velocità di lettura */
interface PezzoAudio { buffer: AudioBuffer; tl: number; rate: number }

/** i pezzi di una clip messi alla sua velocità: a ×1 dritti, "come il nastro" con la velocità di lettura, altrimenti stirati col tono giusto */
async function* pezziClip(iter: FlussoAudio, c: Clip): AsyncGenerator<PezzoAudio, void, unknown> {
  const v = c.speed || 1;
  try {
    if (Math.abs(v - 1) < 0.005) {
      for await (const { buffer, timestamp } of iter) yield { buffer, tl: timestamp - c.srcIn, rate: 1 };
      return;
    }
    if (c.nastro) {
      for await (const { buffer, timestamp } of iter) yield { buffer, tl: (timestamp - c.srcIn) / v, rate: v };
      return;
    }
    let st: Stiratore | null = null;
    let t0 = 0, sr = 48000;
    const fuori = (ch: Float32Array[]): PezzoAudio | null => {
      if (!ch[0]?.length) return null;
      const b = new AudioBuffer({ numberOfChannels: ch.length, length: ch[0].length, sampleRate: sr });
      ch.forEach((d, i) => b.copyToChannel(d as Float32Array<ArrayBuffer>, i));
      return { buffer: b, tl: t0 + (st!.usciti - ch[0].length) / sr, rate: 1 };
    };
    for await (const { buffer, timestamp } of iter) {
      if (!st) { sr = buffer.sampleRate; t0 = (timestamp - c.srcIn) / v; st = new Stiratore(buffer.numberOfChannels, sr, v); }
      const ch = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const o = fuori(st.push(ch));
      if (o) yield o;
    }
    if (st) { const o = fuori(st.fine()); if (o) yield o; }
  } finally {
    void iter.return(undefined).catch(() => {});
  }
}

interface Voce {
  clip: Clip;
  gain: GainNode;
  pan: StereoPannerNode;
  nodes: (AudioBufferSourceNode | OscillatorNode)[];
  /** i pezzi d'audio già alla velocità della clip */
  pezzi?: AsyncGenerator<PezzoAudio, void, unknown>;
  until: number;
  finita: boolean;
  pumping: boolean;
  /** dove entrano le sorgenti: i filtri della clip, o direttamente il guadagno */
  ingresso?: AudioNode;
  /** i suoni degli FX: il secondo di timeline in cui finiscono */
  fine?: number;
}

export interface Misure { l: number; r: number; lPeak: number; rPeak: number }

class Banco {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private anL!: AnalyserNode;
  private anR!: AnalyserNode;
  private bufL = new Float32Array(2048);
  private bufR = new Float32Array(2048);
  private tracce = new Map<string, { gain: GainNode; pan: StereoPannerNode; an: AnalyserNode }>();
  private voci = new Map<string, Voce>();
  private timer = 0;
  /** tempo del contesto in cui la timeline era a startSec */
  private t0 = 0;
  private startSec = 0;
  private attivo = false;
  private p: Project | null = null;
  private modo: 'timeline' | 'player' = 'timeline';
  private playerMedia: string | null = null;
  /** volume e limitatore del Finale, fra il master e l'uscita */
  private finale: AudioNode[] = [];
  private uscita!: GainNode;
  private firmaFinale = '';
  volumeMaster = 1;

  sveglia() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      const ctx = this.ctx;
      this.master = ctx.createGain();
      const split = ctx.createChannelSplitter(2);
      this.anL = ctx.createAnalyser();
      this.anR = ctx.createAnalyser();
      this.anL.fftSize = this.anR.fftSize = 2048;
      // master → (volume e limitatore del Finale) → uscita → casse e VU: i VU misurano quello che esce davvero
      this.uscita = ctx.createGain();
      this.uscita.connect(split);
      split.connect(this.anL, 0);
      split.connect(this.anR, 1);
      this.uscita.connect(ctx.destination);
      this.collegaFinale(this.p);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** il volume e il limitatore del Finale: si ricollega solo quando cambiano */
  private collegaFinale(p: Project | null) {
    if (!this.ctx) return;
    const m = p ? masterDi(p) : null;
    const firma = m ? `${m.volume}|${m.limiter}` : '-';
    if (firma === this.firmaFinale && this.finale.length) return;
    this.firmaFinale = firma;
    try { this.master.disconnect(); } catch { /* non era collegato */ }
    for (const n of this.finale) n.disconnect();
    if (p) { this.finale = uscitaFinale(this.ctx, p, this.uscita); this.master.connect(this.finale[0]); }
    else { this.finale = []; this.master.connect(this.uscita); }
  }

  /** secondi di timeline adesso (l'orologio è quello della scheda audio: il video lo segue) */
  ora(): number {
    if (!this.ctx || !this.attivo) return this.startSec;
    // nei primi 60 ms (prima che il suono parta davvero) l'orologio sta fermo sul punto di partenza: se tornasse
    // indietro anche di un fotogramma, il flusso video già scaldato si butterebbe e ripartirebbe dal fotogramma chiave
    return this.startSec + Math.max(0, this.ctx.currentTime - this.t0);
  }

  get suonando() { return this.attivo; }

  private bus(trackId: string) {
    let b = this.tracce.get(trackId);
    if (!b) {
      const ctx = this.ctx!;
      const gain = ctx.createGain(), pan = ctx.createStereoPanner(), an = ctx.createAnalyser();
      an.fftSize = 1024;
      gain.connect(pan);
      pan.connect(this.master);
      pan.connect(an);
      b = { gain, pan, an };
      this.tracce.set(trackId, b);
    }
    return b;
  }

  /** aggiorna volumi, panorami, muti e solo delle tracce (anche mentre suona) */
  aggiornaTracce(p: Project) {
    if (!this.ctx) return;
    const solo = p.tracks.some((t) => t.kind === 'audio' && t.solo);
    for (const t of p.tracks) {
      if (t.kind !== 'audio') continue;
      const b = this.bus(t.id);
      const on = !t.mute && (!solo || t.solo);
      b.gain.gain.setTargetAtTime(on ? dbToGain(t.volume) : 0, this.ctx.currentTime, 0.015);
      b.pan.pan.setTargetAtTime(t.pan, this.ctx.currentTime, 0.015);
    }
    this.master.gain.setTargetAtTime(this.volumeMaster, this.ctx.currentTime, 0.015);
    this.collegaFinale(p);
  }

  /** parte dalla timeline al secondo startSec */
  suona(p0: Project, startSec: number) {
    this.ferma();
    const ctx = this.sveglia();
    const p = conIncroci(p0);
    this.p = p;
    this.modo = 'timeline';
    this.startSec = startSec;
    this.t0 = ctx.currentTime + 0.06;
    this.attivo = true;
    this.aggiornaTracce(p);
    this.giro();
    this.timer = window.setInterval(() => this.giro(), 40);
  }

  /** riproduce una sorgente del contenitore (il Player) dal secondo t */
  suonaSorgente(p: Project, mediaId: string, t: number) {
    this.ferma();
    const ctx = this.sveglia();
    this.p = p;
    this.modo = 'player';
    this.playerMedia = mediaId;
    this.startSec = t;
    this.t0 = ctx.currentTime + 0.06;
    this.attivo = true;
    this.master.gain.setTargetAtTime(this.volumeMaster, ctx.currentTime, 0.015);
    this.giro();
    this.timer = window.setInterval(() => this.giro(), 40);
  }

  /** il progetto è cambiato mentre suona: ricalcola le voci */
  rimescola(p: Project) {
    if (!this.attivo || this.modo !== 'timeline') return;
    const now = this.ora();
    this.suona(p, now);
  }

  ferma() {
    this.attivo = false;
    clearInterval(this.timer);
    for (const v of this.voci.values()) this.chiudiVoce(v);
    this.voci.clear();
  }

  private chiudiVoce(v: Voce) {
    v.finita = true;
    for (const n of v.nodes) { try { n.stop(); } catch { /* già fermo */ } n.disconnect(); }
    v.gain.disconnect();
    v.pan.disconnect();
    void v.pezzi?.return(undefined).catch(() => {});
  }

  private giro() {
    if (!this.attivo || !this.ctx || !this.p) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pos = this.ora();
    const p = this.p;
    const ANTICIPO = 1.5;
    if (this.modo === 'player') {
      const id = 'player';
      if (!this.voci.has(id) && this.playerMedia) {
        const m = p.media.find((x) => x.id === this.playerMedia);
        const r = mediaRT(this.playerMedia);
        if (m && r?.a && r.aDecodable) {
          const fake = { id, track: '', kind: 'media', media: m.id, start: 0, len: 1e9, srcIn: 0, speed: 1, gain: 0, gainKeys: [], fadeIn: 0, fadeOut: 0, pan: 0 } as unknown as Clip;
          const gain = ctx.createGain(), pan = ctx.createStereoPanner();
          gain.connect(pan);
          pan.connect(this.master);
          const v: Voce = { clip: fake, gain, pan, nodes: [], until: now, finita: false, pumping: false };
          v.pezzi = pezziClip(new AudioBufferSink(r.a).buffers(this.startSec) as FlussoAudio, fake);
          this.voci.set(id, v);
        }
      }
      const v = this.voci.get(id);
      if (v) void this.pompa(v, 0, 1e9);
      return;
    }
    const fr = p.rate;
    for (const c of p.clips) {
      if (!SUONA.has(c.kind) || this.voci.has(c.id)) continue;
      const t = p.tracks.find((x) => x.id === c.track);
      if (!t || t.kind !== 'audio') continue;
      const coda = codaIncrocio(p, c);
      const cs = f2s(c.start, fr), ce = f2s(end(c) + coda, fr);
      if (ce <= pos || cs > pos + ANTICIPO) continue;
      const gain = ctx.createGain(), pan = ctx.createStereoPanner();
      pan.pan.value = c.pan;
      gain.connect(pan);
      pan.connect(this.bus(c.track).gain);
      applicaInviluppo(gain, p, c, coda, this.t0, this.startSec, now);
      applicaPanorama(pan, p, c, this.t0, this.startSec, now);
      const v: Voce = { clip: c, gain, pan, nodes: [], until: now, finita: false, pumping: false, ingresso: catenaEffetti(ctx, c, gain) };
      this.voci.set(c.id, v);
      if (c.kind === 'tone' || c.kind === 'beep') {
        const a = this.t0 + cs - this.startSec, b = this.t0 + ce - this.startSec;
        const o = suonaTono(ctx, c, v.ingresso ?? gain, a, Math.max(now, a), Math.max(now + 0.01, b));
        v.nodes.push(o);
        v.finita = true;
        continue;
      }
      const m = mediaOf(p, c);
      const r = c.media ? mediaRT(c.media) : undefined;
      if (!m || !r?.a || !r.aDecodable) { v.finita = true; continue; }
      const fromTl = Math.max(pos, cs);
      const srcFrom = c.srcIn + (fromTl - cs) * c.speed;
      const srcTo = c.srcIn + (ce - cs) * c.speed;
      v.pezzi = pezziClip(new AudioBufferSink(r.a).buffers(Math.max(0, srcFrom - 0.05), srcTo) as FlussoAudio, c);
    }
    // i suoni dentro gli FX (whoosh, colpi, zap…): dritti nel master
    for (const e of suoniFx(p)) {
      const id = 'sfx:' + e.id;
      if (this.voci.has(id)) continue;
      const fine = e.at + e.buf.duration;
      if (fine <= pos || e.at > pos + ANTICIPO) continue;
      const gain = ctx.createGain(), pan = ctx.createStereoPanner();
      gain.gain.value = e.gain;
      gain.connect(pan);
      pan.connect(this.master);
      const s = ctx.createBufferSource();
      s.buffer = e.buf;
      s.connect(gain);
      const when = this.t0 + e.at - this.startSec;
      if (when >= now) s.start(when); else s.start(now, now - when);
      this.voci.set(id, { clip: { id } as Clip, gain, pan, nodes: [s], until: now, finita: true, pumping: false, fine });
    }
    for (const v of this.voci.values()) {
      if (v.pezzi && !v.finita) {
        const c = v.clip;
        const cs = f2s(c.start, fr);
        const ce = f2s(end(c) + codaIncrocio(p, c), fr);
        void this.pompa(v, cs, ce);
      }
    }
    // voci finite da tempo: via
    for (const [id, v] of this.voci) {
      const c = v.clip;
      if (this.modo === 'timeline' && (v.fine ?? f2s(end(c) + codaIncrocio(p, c), fr)) < pos - 0.5) {
        this.chiudiVoce(v);
        this.voci.delete(id);
      }
    }
  }

  /** decodifica e mette in coda i pezzi di audio fino a poco più avanti di adesso */
  private async pompa(v: Voce, cs: number, ce: number) {
    if (v.pumping || v.finita || !this.ctx) return;
    v.pumping = true;
    const ctx = this.ctx;
    try {
      while (!v.finita && v.until < ctx.currentTime + 1.0) {
        const r = await v.pezzi!.next();
        if (v.finita || !this.attivo) break;
        if (r.done) { v.finita = true; break; }
        const { buffer, tl: tlRel, rate } = r.value;
        // tempo di timeline dell'inizio del pezzo e quanto dura sulla timeline
        const tl = cs + tlRel;
        const durTl = buffer.duration / rate;
        let when = this.t0 + tl - this.startSec;
        let offset = 0;
        const now = ctx.currentTime;
        const clipStart = this.t0 + cs - this.startSec;
        const clipEnd = this.t0 + ce - this.startSec;
        if (when < clipStart) { offset += clipStart - when; when = clipStart; }
        if (when < now) { offset += now - when; when = now; }
        const dur = Math.min(durTl - offset, clipEnd - when);
        v.until = this.t0 + tl - this.startSec + durTl;
        if (dur <= 0.0005) { if (when >= clipEnd) v.finita = true; continue; }
        const s = ctx.createBufferSource();
        s.buffer = buffer;
        if (rate !== 1) s.playbackRate.value = rate;
        s.connect(v.ingresso ?? v.gain);
        s.start(when, offset * rate, dur * rate);
        s.onended = () => { const i = v.nodes.indexOf(s); if (i >= 0) v.nodes.splice(i, 1); s.disconnect(); };
        v.nodes.push(s);
      }
    } catch { v.finita = true; }
    v.pumping = false;
  }

  // ——— scrub: un colpetto d'audio a ogni fotogramma (rotella, frecce, jog), per tagliare sulla parola ———
  private scrubGiro = 0;
  private scrubNodi: AudioScheduledSourceNode[] = [];
  private scrubSinks = new Map<string, AudioBufferSink>();

  private sinkAudio(mediaId: string): AudioBufferSink | null {
    const r = mediaRT(mediaId);
    if (!r?.a || !r.aDecodable) return null;
    let s = this.scrubSinks.get(mediaId);
    if (!s) { s = new AudioBufferSink(r.a); this.scrubSinks.set(mediaId, s); }
    return s;
  }

  private async colpo(voci: { mediaId?: string; srcT: number; livello: number; bus: AudioNode; clip?: Clip; freq?: number }[], durata: number) {
    const ctx = this.sveglia();
    const giro = ++this.scrubGiro;
    for (const n of this.scrubNodi) { try { n.stop(); } catch { /* già fermo */ } }
    this.scrubNodi = [];
    await Promise.all(voci.map(async (v) => {
      if (v.livello <= 0.0005) return;
      const pezzi: { buffer: AudioBuffer; timestamp: number }[] = [];
      if (v.mediaId) {
        const sink = this.sinkAudio(v.mediaId);
        if (!sink) return;
        try { for await (const b of sink.buffers(Math.max(0, v.srcT), v.srcT + durata)) { if (giro !== this.scrubGiro) return; pezzi.push(b); } } catch { return; }
      }
      if (giro !== this.scrubGiro || this.attivo) return;
      const t0 = ctx.currentTime + 0.008;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v.livello, t0 + 0.006);
      g.gain.setValueAtTime(v.livello, t0 + durata - 0.014);
      g.gain.linearRampToValueAtTime(0, t0 + durata);
      g.connect(v.bus);
      const ingresso = v.clip ? catenaEffetti(ctx, v.clip, g) : g;
      if (v.freq) {
        const o = ctx.createOscillator();
        o.frequency.value = v.freq;
        o.connect(ingresso);
        o.start(t0);
        o.stop(t0 + durata);
        this.scrubNodi.push(o);
      }
      for (const { buffer, timestamp } of pezzi) {
        let off = v.srcT - timestamp, when = t0;
        if (off < 0) { when = t0 - off; off = 0; }
        const dur = Math.min(buffer.duration - off, t0 + durata - when);
        if (dur <= 0.001) continue;
        const s = ctx.createBufferSource();
        s.buffer = buffer;
        s.connect(ingresso);
        s.start(when, off, dur);
        this.scrubNodi.push(s);
      }
      setTimeout(() => g.disconnect(), (durata + 0.3) * 1000);
    }));
  }

  /** il suono della timeline al secondo sec, per un attimo (non mentre suona) */
  scrub(p0: Project, sec: number, durata = 0.085) {
    if (this.attivo) return;
    this.sveglia();
    const p = conIncroci(p0);
    this.p = p;
    this.aggiornaTracce(p);
    const fr = p.rate;
    const voci = [];
    for (const c of p.clips) {
      if (!SUONA.has(c.kind)) continue;
      const t = p.tracks.find((x) => x.id === c.track);
      if (!t || t.kind !== 'audio') continue;
      const cs = f2s(c.start, fr);
      if (sec < cs || sec >= f2s(end(c), fr)) continue;
      const lf = (sec - cs) * fr.num / fr.den;
      const livello = guadagnoClip(c, lf, 0) * (c.kind === 'media' ? 1 : dbToGain(c.gen?.level ?? -18));
      voci.push({ mediaId: c.kind === 'media' ? c.media : undefined, srcT: c.srcIn + (sec - cs) * c.speed, livello, bus: this.bus(c.track).gain, clip: c, freq: c.kind === 'media' ? undefined : c.gen?.freq ?? 1000 });
    }
    void this.colpo(voci, durata);
  }

  /** fa sentire un suono degli FX (quando lo accendi o lo scegli dal menu) */
  private inAscolto: { s: AudioBufferSourceNode; g: GainNode } | null = null;

  /** fa sentire un suono degli FX (uno alla volta: passando sul menu il nuovo ferma quello di prima) */
  ascolta(id: string, db = 0) {
    const buf = bufferSuono(id);
    if (!buf || this.attivo) return;
    const ctx = this.sveglia();
    if (this.inAscolto) {
      const { s: s0, g: g0 } = this.inAscolto;
      g0.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      try { s0.stop(ctx.currentTime + 0.1); } catch { /* già fermo */ }
    }
    const g = ctx.createGain();
    g.gain.value = dbToGain(db) * this.volumeMaster;
    g.connect(this.uscita);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(g);
    s.start(ctx.currentTime + 0.01);
    this.inAscolto = { s, g };
    s.onended = () => { s.disconnect(); g.disconnect(); if (this.inAscolto?.s === s) this.inAscolto = null; };
  }

  /** il suono della sorgente nel monitor (modo sorgente) al secondo t */
  scrubSorgente(mediaId: string, t: number, durata = 0.085) {
    if (this.attivo) return;
    this.sveglia();
    void this.colpo([{ mediaId, srcT: t, livello: 1, bus: this.master }], durata);
  }

  /** livelli per i VU: rms (per la lancetta) e picco (per il led) dei due canali, 0..1 */
  misure(): Misure {
    if (!this.ctx) return { l: 0, r: 0, lPeak: 0, rPeak: 0 };
    this.anL.getFloatTimeDomainData(this.bufL);
    this.anR.getFloatTimeDomainData(this.bufR);
    const mis = (b: Float32Array) => {
      let s = 0, pk = 0;
      for (let i = 0; i < b.length; i++) { const x = b[i]; s += x * x; const a = x < 0 ? -x : x; if (a > pk) pk = a; }
      return [Math.sqrt(s / b.length), pk];
    };
    const [l, lPeak] = mis(this.bufL), [r, rPeak] = mis(this.bufR);
    return { l, r, lPeak, rPeak };
  }

  private bufT = new Float32Array(1024);
  /** livello di picco di una traccia (per il mixer) */
  livelloTraccia(trackId: string): number {
    const b = this.tracce.get(trackId);
    if (!b) return 0;
    b.an.getFloatTimeDomainData(this.bufT);
    let pk = 0;
    for (let i = 0; i < this.bufT.length; i++) { const a = Math.abs(this.bufT[i]); if (a > pk) pk = a; }
    return pk;
  }
}

export const banco = new Banco();

/** fa sentire un suono degli FX */
export const ascoltaSuono = (id: string, db = 0) => banco.ascolta(id, db);

/**
 * Mixaggio per l'export: rende l'audio della timeline da fromSec a toSec in pezzi (così un'ora di
 * montaggio non chiede gigabyte di memoria). Chiama onChunk con ogni AudioBuffer in ordine.
 */
export async function* mixaggio(p0: Project, fromSec: number, toSec: number): AsyncGenerator<AudioBuffer> {
  const p = conIncroci(p0);
  const SR = p.sampleRate || 48000;
  const PEZZO = 10;
  // ogni pezzo parte un po' prima e quel tratto si butta: filtri, eco e limitatore arrivano alla cucitura già
  // "caldi" (prima ripartivano da zero ogni 10 s: un piccolo scatto con gli effetti e la coda dell'eco tagliata)
  const SCALDA = 1.5;
  const solo = p.tracks.some((t) => t.kind === 'audio' && t.solo);
  const fr = p.rate;
  const continui = new Map<string, { it: AsyncGenerator<PezzoAudio, void, unknown>; resto: PezzoAudio | null; finito: boolean }>();
  try {
  for (let a = fromSec; a < toSec - 1e-6; a += PEZZO) {
    const b = Math.min(toSec, a + PEZZO);
    const len = Math.max(1, Math.round((b - a) * SR));
    const a0 = Math.max(fromSec, a - SCALDA);
    const salta = Math.round((a - a0) * SR);
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: salta + len, sampleRate: SR });
    const master = ctx.createGain();
    master.connect(uscitaFinale(ctx, p, ctx.destination)[0]);
    const bus = new Map<string, GainNode>();
    for (const t of p.tracks) {
      if (t.kind !== 'audio') continue;
      const g = ctx.createGain(), pn = ctx.createStereoPanner();
      g.gain.value = !t.mute && (!solo || t.solo) ? dbToGain(t.volume) : 0;
      pn.pan.value = t.pan;
      g.connect(pn).connect(master);
      bus.set(t.id, g);
    }
    const lavori: Promise<void>[] = [];
    for (const c of p.clips) {
      if (!SUONA.has(c.kind)) continue;
      const tb = bus.get(c.track);
      if (!tb) continue;
      const coda = codaIncrocio(p, c);
      const cs = f2s(c.start, fr), ce = f2s(end(c) + coda, fr);
      if (ce <= a0 || cs >= b) continue;
      const g = ctx.createGain(), pn = ctx.createStereoPanner();
      pn.pan.value = c.pan;
      g.connect(pn).connect(tb);
      applicaInviluppo(g, p, c, coda, 0, a0, 0);
      applicaPanorama(pn, p, c, 0, a0, 0);
      const ingresso = catenaEffetti(ctx, c, g);
      if (c.kind === 'tone' || c.kind === 'beep') {
        suonaTono(ctx, c, ingresso, cs - a0, Math.max(0, cs - a0), Math.max(0.001, Math.min(b, ce) - a0));
        continue;
      }
      const r = c.media ? mediaRT(c.media) : undefined;
      if (!r?.a || !r.aDecodable) continue;
      // le clip stirate col tono giusto hanno un flusso solo per tutto l'export: se ripartisse a ogni pezzo da 10 s,
      // le onde non combacerebbero e ogni taglio farebbe uno scatto (per loro il tratto per scaldare non serve: il
      // flusso va avanti da solo)
      const stirata = Math.abs(c.speed - 1) >= 0.005 && !c.nastro;
      const from = Math.max(stirata ? a : a0, cs), to = Math.min(b, ce);
      if (to <= from) continue;
      const srcFrom = c.srcIn + (from - cs) * c.speed;
      const srcTo = c.srcIn + (to - cs) * c.speed;
      lavori.push((async () => {
        const margine = 0.05 * c.speed;
        let flusso = stirata ? continui.get(c.id) : undefined;
        if (!flusso) {
          const sink = new AudioBufferSink(r.a!);
          const fine = stirata ? c.srcIn + (ce - cs) * c.speed : srcTo;
          flusso = { it: pezziClip(sink.buffers(Math.max(0, srcFrom - margine), fine + margine) as FlussoAudio, c), resto: null, finito: false };
          if (stirata) continui.set(c.id, flusso);
        }
        for (;;) {
          let pz: PezzoAudio | null = flusso.resto;
          flusso.resto = null;
          if (!pz) {
            if (flusso.finito) break;
            const n = await flusso.it.next();
            if (n.done) { flusso.finito = true; break; }
            pz = n.value;
          }
          const { buffer, tl: tlRel, rate } = pz;
          const durTl = buffer.duration / rate;
          let when = cs + tlRel - a0;
          let offset = 0;
          const lo = from - a0;
          if (when < lo) { offset = lo - when; when = lo; }
          // il pezzo comincia dopo questo tratto: resta per il prossimo
          if (stirata && when >= to - a0) { flusso.resto = pz; break; }
          const dur = Math.min(durTl - offset, to - a0 - when);
          if (dur > 0) {
            const s = ctx.createBufferSource();
            s.buffer = buffer;
            if (rate !== 1) s.playbackRate.value = rate;
            s.connect(ingresso);
            s.start(when, offset * rate, dur * rate);
          }
          // il pezzo finisce dopo questo tratto: il resto va nel prossimo
          if (stirata && offset + dur < durTl - 1e-6 && when + dur >= to - a0 - 1e-6) { flusso.resto = pz; break; }
          if (!stirata && dur <= 0 && when >= to - a0) break;
        }
        if (!stirata) void flusso.it.return(undefined).catch(() => {});
      })());
    }
    // i suoni degli FX
    for (const e of suoniFx(p)) {
      if (e.at + e.buf.duration <= a0 || e.at >= b) continue;
      const g = ctx.createGain();
      g.gain.value = e.gain;
      g.connect(master);
      const s = ctx.createBufferSource();
      s.buffer = e.buf;
      s.connect(g);
      const when = e.at - a0;
      if (when >= 0) s.start(when); else s.start(0, -when);
    }
    await Promise.all(lavori);
    const fatto = await ctx.startRendering();
    if (!salta) { yield fatto; continue; }
    const pezzo = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: SR });
    for (let ch = 0; ch < 2; ch++) pezzo.copyToChannel(fatto.getChannelData(ch).subarray(salta, salta + len), ch);
    yield pezzo;
  }
  } finally {
    for (const f of continui.values()) void f.it.return(undefined).catch(() => {});
  }
}
