// Dal parlato ai tagli: qui non ci sono finestre, AI o stato dell'editor. I tempi del testo sono nella sorgente;
// quelli del piano sono fotogrammi interi della timeline, con l'estremo finale escluso.
import type { Clip, Project } from './tipi';
import { end, newTrack } from './progetto';
import { splitAt, splitClip, withLinked } from './montaggio';
import { fps } from './timecode';

export interface Intervallo { da: number; a: number }
export interface Parola extends Intervallo { testo: string }
export interface ParolaTimeline extends Parola { clip: string }
export interface PianoTagli { intervalli: Intervallo[]; fotogrammi: number; secondi: number }

/** Non inventiamo tempi dividendo una frase: senza il tempo vero della parola non si può tagliare. */
export function paroleDaPezzi(pezzi: { da: number; a: number | null; testo: string }[], durata: number): Parola[] {
  return pezzi.flatMap((p) => {
    const testo = p.testo.trim();
    if (!testo || /\s/.test(testo) || !Number.isFinite(p.da) || p.a === null || !Number.isFinite(p.a)) return [];
    const da = Math.max(0, p.da), a = Math.min(durata, p.a);
    return a > da ? [{ da, a, testo }] : [];
  }).sort((a, b) => a.da - b.da);
}

/** Le parole ancora presenti in un pezzo di clip, dopo trim, tagli e cambi di velocità. */
export function paroleInClip(p: Project, c: Clip): ParolaTimeline[] {
  if (!c.parlato || c.parlato.media !== c.media || !(c.speed > 0)) return [];
  const r = fps(p.rate), fine = c.srcIn + c.len / r * c.speed;
  return c.parlato.parole.flatMap((w) => {
    const centro = (w.da + w.a) / 2;
    if (centro < c.srcIn - 1e-7 || centro >= fine - 1e-7) return [];
    const da = Math.max(c.start, Math.round(c.start + (w.da - c.srcIn) / c.speed * r));
    const a = Math.min(end(c), Math.round(c.start + (w.a - c.srcIn) / c.speed * r));
    return a > da ? [{ da, a, testo: w.testo, clip: c.id }] : [];
  });
}

/** Parole consecutive scelte insieme tolgono anche le pause fra loro, senza prendere la parola vicina. */
export function intervalliParole(parole: ParolaTimeline[], scelte: ReadonlySet<number>): Intervallo[] {
  const out: Intervallo[] = [];
  let precedente = -2;
  parole.forEach((w, i) => {
    if (!scelte.has(i)) return;
    const prima = parole[precedente];
    if (i === precedente + 1 && prima?.clip === w.clip) out[out.length - 1].a = Math.max(out[out.length - 1].a, w.a);
    else out.push({ da: w.da, a: w.a });
    precedente = i;
  });
  return out;
}

/** Pause indicate da Whisper, comprese testa e coda. Un piccolo respiro resta ai bordi delle parole. */
export function intervalliSilenzi(parole: Parola[], limiti: Intervallo, soglia: number, margine = 0): Intervallo[] {
  if (!parole.length || !Number.isFinite(soglia) || soglia < 0) return [];
  const out: Intervallo[] = [];
  let da = limiti.da;
  for (const w of [...parole].sort((a, b) => a.da - b.da)) {
    const a = Math.min(limiti.a, w.da);
    if (a - da > soglia && a - da > 2 * margine) out.push({ da: da + margine, a: a - margine });
    da = Math.max(da, Math.min(limiti.a, w.a));
  }
  if (limiti.a - da > soglia && limiti.a - da > 2 * margine) out.push({ da: da + margine, a: limiti.a - margine });
  return out;
}

const chiave = (t: string) => t.toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]/gu, '');
/** L'elenco contiene parole intere, separate da virgole o a capo. "Allora" si toglie solo se ripetuto. */
export function intervalliIntercalari(parole: ParolaTimeline[], elenco: string, distanza = 75): Intervallo[] {
  const cerca = new Set(elenco.split(/[,;\n]/).map(chiave).filter(Boolean));
  return parole.filter((w, i) => {
    const k = chiave(w.testo);
    if (!cerca.has(k)) return false;
    if (k !== 'allora') return true;
    const ripete = (j: number) => parole[j]?.clip === w.clip && chiave(parole[j].testo) === k && w.da - parole[j].a <= distanza;
    // Si tiene il primo "allora" e si tolgono quelli subito dopo.
    return ripete(i - 1);
  }).map(({ da, a }) => ({ da, a }));
}

/** Unisce sovrapposizioni e intervalli attaccati: l'anteprima conta esattamente quello che si applicherà. */
export function pianoTagli(intervalli: Intervallo[], p: Project): PianoTagli {
  const fine = Math.max(0, ...p.clips.map(end));
  const ordinati = intervalli.filter((x) => Number.isFinite(x.da) && Number.isFinite(x.a))
    .map((x) => ({ da: Math.max(0, Math.round(x.da)), a: Math.min(fine, Math.round(x.a)) }))
    .filter((x) => x.a > x.da).sort((a, b) => a.da - b.da);
  const uniti: Intervallo[] = [];
  for (const x of ordinati) {
    const prima = uniti[uniti.length - 1];
    if (prima && x.da <= prima.a) prima.a = Math.max(prima.a, x.a);
    else uniti.push({ ...x });
  }
  const fotogrammi = uniti.reduce((n, x) => n + x.a - x.da, 0);
  return { intervalli: uniti, fotogrammi, secondi: fotogrammi / fps(p.rate) };
}

export function tempoDopoTagli(f: number, intervalli: Intervallo[]): number {
  return f - intervalli.reduce((n, x) => n + Math.max(0, Math.min(f, x.a) - x.da), 0);
}

/** Se una traccia bloccata perderebbe il sincronismo si ferma tutto, prima di toccare il progetto. */
export function controllaTagli(p: Project, piano: PianoTagli): void {
  const primo = piano.intervalli[0]?.da;
  if (primo === undefined) return;
  if (p.clips.some((c) => end(c) > primo && p.tracks.find((t) => t.id === c.track)?.lock)) {
    throw new Error('Sblocca le tracce interessate per chiudere i buchi e tenere tutto a sincrono');
  }
}

/** Chi chiama racchiude tutti i tagli in UN solo store.edit. Restano a sincrono anche FX, segni e sottotitoli. */
export function applicaTagli(p: Project, piano: PianoTagli): void {
  controllaTagli(p, piano);
  for (const { da, a } of [...piano.intervalli].reverse()) {
    splitAt(p, a); splitAt(p, da);
    // I blocchetti si tagliano a loro volta: i loro pezzi non devono finire nel buco appena chiuso.
    for (const c of p.clips.slice()) if (c.kind === 'fx') splitClip(p, c, a);
    for (const c of p.clips.slice()) if (c.kind === 'fx') splitClip(p, c, da);
    p.clips = p.clips.filter((c) => !(c.start >= da && end(c) <= a));
    for (const c of p.clips) if (c.start >= a) c.start -= a - da;
    if (p.sottotitoli) p.sottotitoli.righe = p.sottotitoli.righe.flatMap((r) => {
      const inizio = tempoDopoTagli(r.da, [{ da, a }]), fine = tempoDopoTagli(r.a, [{ da, a }]);
      return fine > inizio ? [{ ...r, da: inizio, a: fine }] : [];
    });
    p.markers = p.markers.map((m) => ({ ...m, f: tempoDopoTagli(m.f, [{ da, a }]) }));
    if (p.inF !== null) p.inF = tempoDopoTagli(p.inF, [{ da, a }]);
    if (p.outF !== null) p.outF = tempoDopoTagli(p.outF, [{ da, a }]);
  }
}

/** L'audio della sola clip, spostato a zero; il video usa la presa diretta legata, o il suo audio incorporato. */
export function progettoPerTesto(p0: Project, id: string): Project {
  const p = structuredClone(p0), c = p.clips.find((x) => x.id === id);
  if (!c || c.kind !== 'media' || !c.media) throw new Error('Scegli una clip video o audio');
  const audio = (x: Clip) => p.tracks.find((t) => t.id === x.track)?.kind === 'audio';
  const legate = withLinked(p, [id]);
  const candidate = p.clips.filter((x) => legate.has(x.id) && audio(x) && x.start < end(c) && end(x) > c.start);
  const presa = audio(c) ? c : candidate.find((x) => x.media === c.media) ?? candidate[0];
  const ascolta = structuredClone(presa ?? c);
  if (!presa && !p.media.find((m) => m.id === c.media)?.hasAudio) throw new Error('Questa clip non ha audio da ascoltare');
  const t = newTrack('audio', 'Parlato');
  p.tracks = [t];
  const da = Math.max(c.start, ascolta.start), a = Math.min(end(c), end(ascolta));
  ascolta.srcIn += (da - ascolta.start) / fps(p.rate) * ascolta.speed;
  ascolta.start = da - c.start; ascolta.len = a - da; ascolta.track = t.id;
  // Si ascolta la voce originale, senza linee di volume o effetti che potrebbero nasconderla.
  ascolta.gain = 0; ascolta.gainKeys = []; ascolta.afx = undefined; ascolta.anim = undefined;
  ascolta.fadeIn = 0; ascolta.fadeOut = 0; ascolta.duckKeys = undefined;
  p.clips = [ascolta];
  return p;
}
