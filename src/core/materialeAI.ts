// Dal risultato di un'AI al materiale che si può MODIFICARE sul banco (puro, si prova da Node):
//  · le parole con i loro tempi (Qwen3-ASR) → righe di sottotitolo;
//  · i tagli di scena (TransNetV2) → marcatori sulla timeline, e da lì tagli veri della clip;
//  · il piano del rallentatore fluido (RIFE) → quanti fotogrammi e quanto dura la clip nuova;
//  · spezzare un audio lungo in tratti che il motore sa digerire.
// Niente di tutto questo cancella o sostituisce l'originale: i marcatori si spostano, le righe si correggono, la clip nuova
// sta su una traccia sua.
import type { Clip, Marker, Project, Sottotitolo } from './tipi';
import { end, uid } from './progetto';
import { fps } from './timecode';
import { sistemaRighe } from './sottotitoli';
import { splitAt, withLinked } from './montaggio';

// ——— parole con i tempi → righe ———

export interface ParolaTempo { t: string; da: number; a: number }
export interface OpzioniRighe {
  /** una pausa più lunga di così (secondi) chiude la riga */
  pausa: number;
  /** caratteri al massimo per riga */
  massimo: number;
  /** durata massima di una riga (secondi) */
  durataMax: number;
  /** dopo un punto fermo si va a capo se la riga è già lunga almeno così */
  minimoDopoPunto: number;
}
export const RIGHE0: OpzioniRighe = { pausa: 0.7, massimo: 42, durataMax: 6, minimoDopoPunto: 18 };

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;
/** le parole si uniscono con lo spazio, tranne il cinese e il giapponese che non lo usano */
const unisci = (a: string, b: string) => (!a ? b : CJK.test(a.at(-1)!) && CJK.test(b[0]) ? a + b : /^[.,;:!?…)»”]/.test(b) ? a + b : a + ' ' + b);

/**
 * Le parole con i loro tempi diventano righe: si va a capo a una pausa, alla fine di una frase quando la riga è già
 * abbastanza lunga, o quando la riga si fa troppo lunga (lettere o secondi). `offset` = secondo del montaggio da cui
 * partono i tempi delle parole. I tempi sono in fotogrammi del progetto.
 */
export function righeDaParole(parole: ParolaTempo[], p: Pick<Project, 'rate'> & Partial<Project>, offset = 0, opz: Partial<OpzioniRighe> = {}): Sottotitolo[] {
  const o = { ...RIGHE0, ...opz };
  const r = fps(p.rate as Project['rate']);
  const buone = parole.filter((x) => x.t.trim() && Number.isFinite(x.da) && Number.isFinite(x.a)).map((x) => ({ ...x, t: x.t.trim() })).sort((x, y) => x.da - y.da);
  const righe: { da: number; a: number; testo: string }[] = [];
  let cur: { da: number; a: number; testo: string } | null = null;
  const chiudi = () => { if (cur) righe.push(cur); cur = null; };
  for (const w of buone) {
    if (cur) {
      const dopoPausa = w.da - cur.a > o.pausa;
      const lunga = unisci(cur.testo, w.t).length > o.massimo;
      const troppoTempo = w.a - cur.da > o.durataMax;
      const fineFrase = /[.!?…。！？]$/.test(cur.testo) && cur.testo.length >= o.minimoDopoPunto;
      if (dopoPausa || lunga || troppoTempo || fineFrase) chiudi();
    }
    if (!cur) cur = { da: w.da, a: w.a, testo: w.t };
    else { cur.testo = unisci(cur.testo, w.t); cur.a = Math.max(cur.a, w.a); }
  }
  chiudi();
  const fine = Math.max(0, ...((p.clips as Clip[] | undefined) ?? []).map(end)) || Infinity;
  return sistemaRighe(righe.map((x) => ({ id: uid('s'), da: Math.round((x.da + offset) * r), a: Math.max(Math.round((x.da + offset) * r) + 1, Math.round((x.a + offset) * r)), testo: x.testo })), fine);
}

/** un audio lungo in tratti pari da al massimo `max` secondi (tagli a metà strada, senza guardare l'audio: per tagliare nel silenzio si usano i punti di `trattiDaPunti`) */
export function dividiInTratti(durata: number, max: number): [number, number][] {
  if (!(durata > 0) || !(max > 0)) return [];
  const n = Math.ceil(durata / max);
  const passo = durata / n;
  return Array.from({ length: n }, (_, i) => [i * passo, i === n - 1 ? durata : (i + 1) * passo] as [number, number]);
}

/** i punti di taglio (secondi, il primo 0 e l'ultimo la fine, come li dà `puntiDiTaglio`) diventano coppie [da, a] */
export function trattiDaPunti(punti: number[]): [number, number][] {
  const buoni = punti.filter((x) => Number.isFinite(x) && x >= 0);
  return buoni.slice(1).map((a, i) => [buoni[i], a] as [number, number]).filter(([a, b]) => b > a);
}

// ——— scene → marcatori ———

export interface TaglioScena { t: number; p: number }
/** la parte di clip che si è guardata: dove sta in timeline e quale tratto del file */
export interface ClipGuardata { start: number; len: number; srcIn: number; speed: number }

export const PREFISSO_SCENA = 'Scena ';
/** il nome preciso dei marcatori fatti qui: un tuo marcatore «Scena del bacio» non si tocca e non diventa un taglio */
const NOME_SCENA = /^Scena \d+$/;
export const COLORE_SCENA = '#35e8ff';

/**
 * I tagli di scena (secondi del FILE) diventano marcatori sulla timeline (fotogrammi). Si tengono solo quelli dentro la
 * clip, non agli estremi (lì non c'è niente da tagliare). Il primo marcatore è «Scena 2»: la scena 1 è l'inizio.
 */
export function sceneInMarcatori(tagli: TaglioScena[], c: ClipGuardata, rate: Project['rate']): Marker[] {
  const r = fps(rate);
  const v = c.speed || 1;
  const fra = tagli
    .map((x) => c.start + Math.round(((x.t - c.srcIn) / v) * r))
    .filter((f, i, a) => f > c.start && f < c.start + c.len && a.indexOf(f) === i)
    .sort((x, y) => x - y);
  return fra.map((f, i) => ({ id: uid('k'), f, name: PREFISSO_SCENA + (i + 2), color: COLORE_SCENA }));
}

/** i marcatori delle scene che stanno dentro una clip */
export const marcatoriScena = (p: Pick<Project, 'markers'>, c: Pick<Clip, 'start' | 'len'>) =>
  p.markers.filter((m) => NOME_SCENA.test(m.name) && m.f > c.start && m.f < c.start + c.len);

/**
 * Mette i marcatori delle scene di una clip (togliendo quelli di una prova precedente nello stesso tratto: i marcatori
 * che hai messo tu con altri nomi non si toccano). Ritorna quanti ne ha messi.
 */
export function mettiMarcatoriScena(p: Project, clipId: string, tagli: TaglioScena[]): number {
  const c = p.clips.find((x) => x.id === clipId);
  if (!c) return 0;
  const vecchi = new Set(marcatoriScena(p, c).map((m) => m.id));
  p.markers = p.markers.filter((m) => !vecchi.has(m.id));
  const nuovi = sceneInMarcatori(tagli, c, p.rate);
  p.markers.push(...nuovi);
  p.markers.sort((a, b) => a.f - b.f);
  return nuovi.length;
}

/** taglia la clip (e le sue legate, come fa il tasto 1) a tutti i marcatori delle scene; ritorna quanti tagli ha fatto */
export function tagliaAlleScene(p: Project, clipId: string): number {
  const c0 = p.clips.find((x) => x.id === clipId);
  if (!c0) return 0;
  const gruppo = withLinked(p, [clipId]);
  // dal fondo: i pezzi di sinistra tengono il loro id e il taglio dopo cade ancora dentro
  const punti = marcatoriScena(p, c0).map((m) => m.f).sort((a, b) => b - a);
  let fatti = 0;
  for (const f of punti) if (splitAt(p, f, null, gruppo).length) fatti++;
  return fatti;
}

// ——— rallentatore fluido ———

export interface PianoRallenta {
  /** fotogrammi del file che si guardano (compreso l'ultimo) */
  origine: number;
  /** fotogrammi della clip nuova: ogni coppia ne produce `fattore` (l'originale e i fattore−1 inventati) */
  nuovi: number;
  /** durata della clip nuova, in fotogrammi del progetto */
  lunghezza: number;
}

/** il rallentatore su `secondi` di file: quanti fotogrammi escono e quanto dura la clip nuova (`secondi × fattore`) */
export function pianoRallenta(secondi: number, fattore: number, fpsFile: number, rate: Project['rate']): PianoRallenta {
  const f = Math.max(1, Math.round(fattore));
  const origine = Math.max(2, Math.round(Math.max(0, secondi) * fpsFile) + 1);
  return { origine, nuovi: (origine - 1) * f + 1, lunghezza: Math.max(1, Math.round(secondi * f * fps(rate))) };
}
