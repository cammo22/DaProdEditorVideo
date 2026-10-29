// Presenza RMS e inviluppi adattati da AudioDucker di OpenReel (MIT): TERZE-PARTI.md.
// È un rilevatore di energia, non riconosce parole o parlato.
import type { Clip, Ducking, Key, Project, RuoloAudio } from './tipi';
import { dbToGain, fadeAl, keyValue } from './progetto';
import { gainDbAl } from './automazioni';
import { f2s } from './timecode';

export const DUCKING0: Ducking = { attivo: false, quantita: 12, attacco: .15, rilascio: .6, soglia: -32, isteresi: 4, minimo: .08, hold: .2 };
export interface IntervalloVoce { da: number; a: number }
export interface FinestraRms extends IntervalloVoce { db: number }
export function configDucking(d?: Partial<Ducking>): Ducking {
  const lim = (v: number | undefined, base: number, a: number, b: number) => Number.isFinite(v) ? Math.max(a, Math.min(b, v!)) : base;
  return { attivo: d?.attivo === true, quantita: lim(d?.quantita, 12, 0, 60), attacco: lim(d?.attacco, .15, .005, 10),
    rilascio: lim(d?.rilascio, .6, .005, 10), soglia: lim(d?.soglia, -32, -90, 0), isteresi: lim(d?.isteresi, 4, 0, 24),
    minimo: lim(d?.minimo, .08, 0, 2), hold: lim(d?.hold, .2, 0, 5) };
}
export const ruoloAudio = (p: Project, c: Clip): RuoloAudio => c.ruoloAudio ?? p.tracks.find((t) => t.id === c.track)?.ruoloAudio ?? 'nessuno';
export const impostazioneDucking = (p: Project, c: Clip): Ducking => configDucking(c.ducking ?? p.tracks.find((t) => t.id === c.track)?.ducking);
/** La stessa coda letta dal banco quando la clip successiva entra in dissolvenza. */
export const codaVoce = (p: Project, c: Clip): number => p.clips.find((n) => n.id !== c.id && n.track === c.track && n.start === c.start + c.len && n.trIn)?.trIn?.len ?? 0;
export function vociDucking(p: Project): Clip[] {
  const solo = p.tracks.some((t) => t.kind === 'audio' && t.solo);
  return p.clips.filter((c) => {
    const t = p.tracks.find((t) => t.id === c.track);
    return c.kind === 'media' && !!c.media && c.speed > 0 && ruoloAudio(p, c) === 'voce' && t?.kind === 'audio'
      && !t.mute && (!solo || t.solo) && dbToGain(t.volume) > 0 && (c.gainKeys.length > 0 || !!c.anim?.gain?.length || dbToGain(c.gain) > 0);
  });
}

/** Finestre continue da 25 ms: i confini dei pezzi decodificati non cambiano il risultato.
 * Si sommano le energie dei canali, senza cancellare il segnale in controfase. */
export class AnalizzatoreRms {
  private somma = 0;
  private contati = 0;
  private campioni = 0;
  private sr = 0;
  private da = 0;
  private prossimo = 0;
  private origine = 0;
  private totale = 0;
  push(canali: Float32Array[], sr: number, t: number): FinestraRms[] {
    if (!canali.length || sr <= 0 || canali.some((c) => c.length !== canali[0].length)) throw new Error('Audio non valido per abbassare la musica');
    const out: FinestraRms[] = [];
    if (!this.sr || sr !== this.sr || Math.abs(t - this.prossimo) > 1.5 / sr) {
      const f = this.fine(); if (f) out.push(f);
      this.origine = t; this.totale = 0;
    }
    this.sr = sr;
    const finestra = Math.max(1, Math.round(sr * .025));
    for (let i = 0; i < canali[0].length; i++) {
      if (!this.contati) this.da = this.origine + (this.totale + i) / sr;
      for (const ch of canali) { const v = Number.isFinite(ch[i]) ? ch[i] : 0; this.somma += v * v; this.campioni++; }
      this.contati++;
      if (this.contati === finestra) out.push(this.fine()!);
    }
    this.totale += canali[0].length;
    this.prossimo = this.origine + this.totale / sr;
    return out;
  }
  fine(): FinestraRms | null {
    if (!this.contati) return null;
    const f = { da: this.da, a: this.da + this.contati / this.sr, db: 10 * Math.log10(Math.max(1e-20, this.somma / this.campioni)) };
    this.contati = this.campioni = this.somma = 0;
    return f;
  }
}

/** Porta l'energia letta nella sorgente sulla timeline, con trim, velocità e volume udibile. */
export function presenzaVoce(p: Project, c: Clip, finestre: FinestraRms[], d: Ducking): IntervalloVoce[] {
  const t = p.tracks.find((t) => t.id === c.track)!;
  const coda = codaVoce(p, c);
  const cs = f2s(c.start, p.rate), durata = f2s(c.len + coda, p.rate), out: IntervalloVoce[] = [];
  let inizio: number | null = null, fine = 0;
  const chiudi = () => { if (inizio !== null && fine - inizio >= d.minimo - 1e-6) out.push({ da: inizio, a: Math.min(cs + durata, fine + d.hold) }); inizio = null; };
  for (const w of finestre) {
    const da = Math.max(0, (w.da - c.srcIn) / c.speed), a = Math.min(durata, (w.a - c.srcIn) / c.speed);
    if (a <= da) continue;
    const lf = (da + a) / 2 * p.rate.num / p.rate.den;
    const gain = gainDbAl(c, lf, keyValue) + t.volume;
    let fade = fadeAl(c, lf);
    if (c.trIn && lf < c.trIn.len) fade *= lf / c.trIn.len;
    if (c.trOut && lf > c.len - c.trOut.len) fade *= (c.len - lf) / c.trOut.len;
    if (lf > c.len) fade *= coda > 0 ? Math.max(0, 1 - (lf - c.len) / coda) : 0;
    const db = dbToGain(gain) > 0 ? w.db + gain + 20 * Math.log10(Math.max(1e-10, fade)) : -200;
    if (inizio !== null && cs + da > fine + .002) chiudi();
    const acceso = db >= d.soglia - (inizio === null ? 0 : d.isteresi);
    if (acceso) { inizio ??= cs + da; fine = cs + a; }
    else chiudi();
  }
  chiudi();
  return out;
}
export function unisciPresenza(v: IntervalloVoce[], distanza = 0): IntervalloVoce[] {
  const out: IntervalloVoce[] = [];
  for (const r of [...v].filter((x) => x.a > x.da).sort((a, b) => a.da - b.da)) {
    const ultimo = out.at(-1);
    if (ultimo && r.da <= ultimo.a + distanza) ultimo.a = Math.max(ultimo.a, r.a);
    else out.push({ ...r });
  }
  return out;
}
/** Unisce anche attacchi/rilasci sovrapposti: la musica non pompa fra due voci vicine. */
export function generaDuckKeys(p: Project, c: Clip, ranges: IntervalloVoce[], d: Ducking): Key[] {
  const fps = p.rate.num / p.rate.den, cs = c.start / fps;
  const punti: Key[] = [];
  for (const r of unisciPresenza(ranges, d.attacco + d.rilascio)) {
    const da = (r.da - cs) * fps, a = (r.a - cs) * fps;
    punti.push({ f: da - d.attacco * fps, v: 0 }, { f: da, v: -d.quantita }, { f: a, v: -d.quantita }, { f: a + d.rilascio * fps, v: 0 });
  }
  if (!punti.length) return [];
  const m = new Map<number, number>();
  for (const k of punti) m.set(k.f, Math.min(m.get(k.f) ?? 0, k.v));
  const tutti = [...m].map(([f, v]) => ({ f, v })).sort((a, b) => a.f - b.f);
  return [{ f: 0, v: keyValue(tutti, 0, 0) }, ...tutti.filter((k) => k.f > 0 && k.f < c.len), { f: c.len, v: keyValue(tutti, c.len, 0) }];
}

/** Firma compatta e deterministica: taglio, spostamento, trattamento audio, mute/solo la invalidano. */
export function firmaDucking(p: Project, c: Clip): string {
  const voci = vociDucking(p).map((v) => {
    const m = p.media.find((m) => m.id === v.media), t = p.tracks.find((t) => t.id === v.track);
    return [v.id, v.media, m?.size, m?.lastModified, m?.path, v.start, v.len, v.srcIn, v.speed, v.nastro,
      v.gain, v.gainKeys, ...(v.anim?.gain ? [v.anim.gain] : []), v.fadeIn, v.fadeOut, v.curvaIn, v.curvaOut, v.trIn, v.trOut, codaVoce(p, v), v.afx, t?.volume, t?.pan];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const testo = JSON.stringify([p.rate, p.seqAttiva, c.start, c.len, c.srcIn, c.speed, ruoloAudio(p, c), impostazioneDucking(p, c), voci]);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < testo.length; i++) { a = Math.imul(a ^ testo.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ testo.charCodeAt(i); }
  return 'duck1:' + (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
}
export function duckingValido(p: Project, c: Clip): boolean {
  return ruoloAudio(p, c) === 'musica' && impostazioneDucking(p, c).attivo && !!c.duckFirma && c.duckFirma === firmaDucking(p, c);
}
/** Vista di sola lettura per banco, scrub ed export. Mai attenuazioni obsolete o disattivate. */
export function conDucking(p: Project): Project {
  if (!p.clips.some((c) => c.duckKeys?.length)) return p;
  return { ...p, clips: p.clips.map((c) => c.duckKeys?.length && !duckingValido(p, c) ? { ...c, duckKeys: undefined } : c) };
}
