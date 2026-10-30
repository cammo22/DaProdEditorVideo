// DaProdMontage: il motore. Prende una pila di foto e video alla rinfusa, la durata che vuoi e la ricetta di un preset
// (src/core/montagePreset.ts) e ne fa un montaggio vero, già sulla timeline: ordina, scarta le foto doppie o sfocate se sono
// troppe, ripartisce il tempo (a battere di musica, se c'è), muove le foto (Ken Burns), mette le transizioni, i titoli di
// apertura e chiusura, quello che cade sopra (cuori, petali, coriandoli…) e gli effetti a tempo. Funziona anche con sole foto.
// Tutto quello che sta qui è puro (niente browser): si prova da solo. Il lavoro sulla timeline lo fa `costruisciSequenza`.
import type { AnimSpec, MediaItem, Project, Track, Transform } from './tipi';
import { FX0, TF0, newClip, newTrack, uid } from './progetto';
import { fps } from './timecode';
import { nuovoBlocco, posaBlocco } from './blocchi';
import { animazione, nuovaAnim } from './animazioni';
import { presetMontage, type Moto, type PresetMontage, type TestiMontage } from './montagePreset';
import { nuovaSequenza } from './sequenze';

export type Ordine = 'data' | 'caso' | 'dato';

/** un file da montare, con quello che serve a decidere (le misure dal contenitore, la qualità se è stata misurata) */
export interface EntrataMontage {
  media: string;
  nome: string;
  tipo: 'image' | 'video';
  /** secondi (video); 0 per le foto */
  durata: number;
  w: number;
  h: number;
  /** quando è stata scattata o girata (millisecondi): serve all'ordine cronologico */
  data: number;
  audio: boolean;
  /** 0..1: sfocata/buia = poco, nitida e ben esposta = tanto (0,5 se non misurata) */
  punteggio: number;
  /** firma dell'immagine (hash 8×8) per riconoscere le foto quasi uguali */
  firma?: string;
  /** video: il punto (secondi) dove sta il pezzo più bello */
  inizioMigliore?: number;
}

export interface OpzMontage {
  preset: string;
  /** secondi di tutto il video */
  durata: number;
  ordine: Ordine;
  /** titoli di apertura e di chiusura */
  titoli: boolean;
  /** quello che cade sopra (cuori, petali…) e gli effetti a tempo */
  effetti: boolean;
  /** audio originale dei video: dB (−60 = muto) */
  audioVideo: number;
  testi: TestiMontage;
  /** per l'ordine casuale: lo stesso numero dà sempre lo stesso risultato */
  seme: number;
  /** la musica (un file del contenitore) e, se è stata misurata, dove cadono i battiti (secondi) */
  musica?: { media: string; durata: number; battiti?: number[]; nome?: string };
  /** scarta foto sfocate e doppie quando sono troppe */
  scarta: boolean;
  /** foto e video di un formato diverso dal progetto: "intero" (scheda con ombra su uno sfondo sfumato) o "riempi" (a tutto quadro, taglia i bordi) */
  adatta?: 'intero' | 'riempi';
  /** quanto stare fermi su ogni cosa oltre il solito: 0 = come lo stile, 1..3 = sempre più lento (meno cose, ognuna più lunga) */
  lentezza?: number;
  /** file che l'utente ha rimesso a mano dopo che erano stati scartati (doppi, mossi, in più): non si toccano */
  tieni?: string[];
}

/** una cosa sulla linea principale: quale file, quando comincia, quanto dura, da dove si prende (video) e come si muove */
export interface Voce {
  entrata: EntrataMontage;
  start: number;
  len: number;
  srcIn: number;
  moto: Moto;
  /** è la seconda volta che compare (non c'erano abbastanza file per riempire il tempo) */
  ripetuta: boolean;
  /** quanto è forte il movimento rispetto a quello dello stile (cambia a ogni generazione) */
  forza: number;
  /** da che parte parte il movimento (0 o 1) */
  verso: number;
}

export interface PianoMontage {
  preset: string;
  durata: number;
  voci: Voce[];
  /** transizioni: al centro di un taglio (secondi) */
  transizioni: { id: string; centro: number; len: number }[];
  apertura: { start: number; len: number; anim: AnimSpec } | null;
  chiusura: { start: number; len: number; anim: AnimSpec } | null;
  sovrapposizioni: { anim: AnimSpec; start: number; len: number }[];
  effetti: { id: string; start: number; len: number }[];
  /** quello che è successo, in parole (scartate, ripetute, durata per foto…) */
  note: string[];
  usate: number;
  scartate: number;
  ripetute: number;
  /** secondi per foto in media */
  perFoto: number;
}

// ——— il caso che si ripete ———
function casoSeme(seme: number) {
  let s = (seme >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function mescola<T>(v: T[], seme: number): T[] {
  const r = casoSeme(seme), o = [...v];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

/** distanza fra due firme (hash esadecimali di 64 bit): quanti bit sono diversi */
export function distanzaFirme(a?: string, b?: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

/** ordina i file come chiesto; a parità di data, per nome (le foto di un telefono si chiamano IMG_0001, 0002…) */
export function ordina(v: EntrataMontage[], ordine: Ordine, seme: number): EntrataMontage[] {
  if (ordine === 'dato') return [...v];
  if (ordine === 'caso') return mescola(v, seme);
  return [...v].sort((a, b) => (a.data - b.data) || a.nome.localeCompare(b.nome, 'it', { numeric: true }));
}

/** toglie le foto quasi uguali (tiene la più nitida di ogni gruppo di vicine nell'ordine) */
export function senzaDoppioni(v: EntrataMontage[], soglia = 6, protette?: ReadonlySet<string>): { tenute: EntrataMontage[]; tolte: EntrataMontage[] } {
  const tenute: EntrataMontage[] = [], tolte: EntrataMontage[] = [];
  for (const e of v) {
    const prec = tenute[tenute.length - 1];
    if (prec && prec.tipo === 'image' && e.tipo === 'image' && distanzaFirme(prec.firma, e.firma) <= soglia && !protette?.has(e.media) && !protette?.has(prec.media)) {
      if (e.punteggio > prec.punteggio) { tolte.push(prec); tenute[tenute.length - 1] = e; } else tolte.push(e);
    } else tenute.push(e);
  }
  return { tenute, tolte };
}

// ——— quanto sta ogni cosa ———
interface Lim { min: number; tip: number; max: number }

export function limiti(e: EntrataMontage, pr: PresetMontage, lentezza = 0): Lim {
  // lentezza 0 = esattamente come lo stile; ogni gradino allunga i tempi minimi e tipici di un terzo
  const f = 1 + 0.35 * Math.max(0, Math.min(3, lentezza));
  if (e.tipo === 'image') {
    const min = pr.foto[0] * f, tip = Math.max(min, pr.foto[1] * f);
    return { min, tip, max: lentezza > 0 ? Math.max(pr.foto[2], tip * 1.2) : pr.foto[2] };
  }
  const max = Math.min(pr.video[1], Math.max(1, e.durata));
  const tip = Math.min(pr.video[0] * f, max);
  return { min: Math.min(2.5 * f, tip), tip, max };
}

/** durate che sommano esattamente a "tot": ognuna fra il suo minimo e il suo massimo, in proporzione al valore tipico.
 *  Se nemmeno al massimo si arriva a "tot" ritorna null (servono più file o durate più lunghe). */
export function ripartisci(lim: Lim[], tot: number): number[] | null {
  const somma = (k: number) => lim.reduce((a, l) => a + Math.max(l.min, Math.min(l.max, l.tip * k)), 0);
  if (somma(1e-6) > tot + 1e-6) return null;
  if (somma(1e6) < tot - 1e-6) return null;
  let a = 1e-6, b = 1e6;
  for (let i = 0; i < 80; i++) { const m = Math.sqrt(a * b); if (somma(m) < tot) a = m; else b = m; }
  const k = Math.sqrt(a * b);
  return lim.map((l) => Math.max(l.min, Math.min(l.max, l.tip * k)));
}

/** fotogrammi interi che sommano esattamente a "totF" (il resto si dà alle durate più grandi) */
export function inFotogrammi(sec: number[], r: number, totF: number): number[] {
  const f = sec.map((s) => Math.max(2, Math.round(s * r)));
  let diff = totF - f.reduce((a, b) => a + b, 0);
  const ordine = f.map((v, i) => i).sort((x, y) => f[y] - f[x]);
  let i = 0;
  while (diff !== 0 && f.length) {
    const k = ordine[i % ordine.length];
    const passo = diff > 0 ? 1 : -1;
    if (f[k] + passo >= 2) { f[k] += passo; diff -= passo; }
    i++;
    if (i > f.length * (Math.abs(diff) + 10) + 1000) break;
  }
  return f;
}

/** sposta i tagli sul battito più vicino (se è abbastanza vicino), senza accorciare troppo e senza cambiare la fine */
export function sulBattito(durate: number[], battiti: number[], minimo: number): number[] {
  if (durate.length < 2 || battiti.length < 2) return durate;
  const tagli: number[] = [0];
  for (const d of durate) tagli.push(tagli[tagli.length - 1] + d);
  for (let k = 1; k < tagli.length - 1; k++) {
    let best = tagli[k], bd = Infinity;
    for (const b of battiti) { const d = Math.abs(b - tagli[k]); if (d < bd) { bd = d; best = b; } }
    const tol = Math.min(0.45 * Math.min(durate[k - 1], durate[k]), 0.7);
    if (bd <= tol && best - tagli[k - 1] >= minimo && tagli[tagli.length - 1] - best >= minimo * (tagli.length - 1 - k)) tagli[k] = best;
  }
  const out: number[] = [];
  for (let k = 1; k < tagli.length; k++) out.push(tagli[k] - tagli[k - 1]);
  return out;
}

/** il piano: che cosa, quando, quanto, come */
export function pianifica(entrate: EntrataMontage[], o: OpzMontage): PianoMontage {
  const pr = presetMontage(o.preset) ?? presetMontage('classico')!;
  const A = Math.max(5, o.durata);
  const note: string[] = [];
  const nIniziali = entrate.length;
  let lista = ordina(entrate, o.ordine, o.seme);
  const protette = new Set(o.tieni ?? []);
  let tolte = 0;
  if (o.scarta) {
    const d = senzaDoppioni(lista, 6, protette);
    if (d.tolte.length) { lista = d.tenute; tolte += d.tolte.length; note.push(`${d.tolte.length} foto quasi uguali tolte (tenuta la più nitida)`); }
  }
  // troppe per il tempo: via le peggiori, ma non la prima e l'ultima
  const lento = o.lentezza ?? 0;
  const min = (e: EntrataMontage) => limiti(e, pr, lento).min;
  let sfoltite = 0;
  // il caso di questa generazione: stesse scelte, esito diverso (lo stesso seme dà sempre lo stesso montaggio)
  const rnd = casoSeme(Math.imul(o.seme | 0, 2654435761) ^ 0x5bd1e995);
  const rumore = new Map<EntrataMontage, number>(lista.map((e) => [e, (rnd() - 0.5) * 0.14]));
  while (lista.length > 2 && lista.reduce((a, e) => a + min(e), 0) > A) {
    let idx = -1, peggio = Infinity;
    for (let i = 1; i < lista.length - 1; i++) { if (protette.has(lista[i].media)) continue; const v = lista[i].punteggio + (rumore.get(lista[i]) ?? 0); if (v <= peggio) { peggio = v; idx = i; } }
    if (idx < 0) break;
    lista.splice(idx, 1); sfoltite++;
  }
  if (sfoltite) { tolte += sfoltite; note.push(`${sfoltite} file lasciati fuori: per ${fmtDur(A)} non c'era posto per tutti (via i meno belli)`); }
  if (!lista.length) return { preset: pr.id, durata: A, voci: [], transizioni: [], apertura: null, chiusura: null, sovrapposizioni: [], effetti: [], note: ['Nessun file da montare'], usate: 0, scartate: nIniziali, ripetute: 0, perFoto: 0 };

  // pochi per il tempo: si ripetono i più belli (in fondo, in ordine di data) finché non basta
  let tutte = lista.map((e) => ({ e, ripetuta: false }));
  let ripetute = 0;
  // ogni foto sta un po' di più o un po' di meno: il ritmo non è mai uguale
  const variata = (e: EntrataMontage): Lim => { const l = limiti(e, pr, lento); return { ...l, tip: Math.min(l.max, Math.max(l.min, l.tip * (0.72 + rnd() * 0.56))) }; };
  let lim = tutte.map((x) => variata(x.e));
  const sommaMax = (l: Lim[]) => l.reduce((a, b) => a + b.max, 0);
  if (sommaMax(lim) < A) {
    const migliori = [...lista].sort((a, b) => (b.punteggio + (rumore.get(b) ?? 0)) - (a.punteggio + (rumore.get(a) ?? 0)));
    const giri = Math.min(4, Math.ceil(A / Math.max(1, sommaMax(lim))));
    for (let g = 0; g < giri && sommaMax(lim) < A; g++) {
      const extra = migliori.slice(0, Math.max(1, Math.ceil(lista.length * 0.6))).sort((a, b) => lista.indexOf(a) - lista.indexOf(b));
      for (const e of extra) {
        if (sommaMax(lim) >= A) break;
        tutte.push({ e, ripetuta: true }); lim.push(variata(e)); ripetute++;
      }
    }
    if (ripetute) note.push(`${ripetute} foto compaiono due volte: con quelle che hai non si arriva a ${fmtDur(A)}`);
  }
  // ancora corto: si allungano oltre il massimo (fino a 3 volte)
  let sec = ripartisci(lim, A);
  if (!sec) {
    const largo = lim.map((l) => ({ min: l.min, tip: l.tip, max: l.max * 3 }));
    sec = ripartisci(largo, A);
    if (sec) note.push('Ogni foto resta più a lungo del solito: aggiungine altre se vuoi un ritmo più vivace');
  }
  if (!sec) sec = lim.map(() => A / lim.length);
  // a battere di musica
  if (o.musica?.battiti?.length) sec = sulBattito(sec, o.musica.battiti, Math.min(...lim.map((l) => l.min)) * 0.8);

  // le voci
  const voci: Voce[] = [];
  let t = 0;
  const mosse: Moto[] = pr.moto.length ? pr.moto : ['zoomIn'];
  const EXTRA: Moto[] = ['zoomIn', 'zoomOut', 'panSx', 'panDx', 'diagonale'];
  let precedente: Moto | null = null;
  /** un movimento a caso fra quelli dello stile (ogni tanto uno in più), mai due uguali di fila */
  const scegliMoto = (): Moto => {
    const da = rnd() < 0.18 ? EXTRA : mosse;
    const pool = da.filter((m) => m !== precedente);
    const m = (pool.length ? pool : da)[Math.floor(rnd() * (pool.length ? pool.length : da.length))];
    precedente = m;
    return m;
  };
  const usati = new Map<string, number>();
  tutte.forEach((x, i) => {
    const e = x.e;
    const len = sec![i];
    let srcIn = 0;
    if (e.tipo === 'video') {
      // il pezzo più bello se lo sappiamo, se no dopo il primo decimo (via il tremolio dell'avvio); la seconda volta più avanti
      const vol = (usati.get(e.media) ?? 0);
      usati.set(e.media, vol + 1);
      const base = e.inizioMigliore ?? Math.min(e.durata * 0.12, Math.max(0, e.durata - len));
      srcIn = Math.max(0, Math.min(e.durata - len, base + vol * len));
    }
    voci.push({ entrata: e, start: t, len, srcIn, moto: scegliMoto(), ripetuta: x.ripetuta, forza: 0.8 + rnd() * 0.45, verso: rnd() < 0.5 ? 0 : 1 });
    t += len;
  });

  // transizioni sui tagli: mai più lunghe del 45% della più corta delle due vicine
  const transizioni: PianoMontage['transizioni'] = [];
  const idsTr = pr.transizioni.length ? pr.transizioni : ['mix'];
  // ogni tanto una transizione fuori dalla lista dello stile, ma del suo ritmo (se no sarebbero sempre le stesse)
  const FANTASIA: Record<PresetMontage['ritmo'], string[]> = {
    lento: ['mix', 'dip'],
    medio: ['mix', 'dve:301', 'dve:351', 'dip'],
    veloce: ['dve:301', 'dve:351', 'dve:321', 'dve:331', 'mix'],
  };
  let trPrima = '';
  for (let i = 1; i < voci.length; i++) {
    const len = Math.min(pr.durTr * (0.85 + rnd() * 0.35), 0.45 * Math.min(voci[i - 1].len, voci[i].len));
    if (len < 0.2) continue;
    const pool = (rnd() < 0.25 ? FANTASIA[pr.ritmo] : idsTr).filter((x) => x !== trPrima);
    const id = pool.length ? pool[Math.floor(rnd() * pool.length)] : idsTr[0];
    trPrima = id;
    transizioni.push({ id, centro: voci[i].start, len });
  }

  // titoli: apertura sopra le prime foto, chiusura sopra le ultime
  let apertura: PianoMontage['apertura'] = null, chiusura: PianoMontage['chiusura'] = null;
  if (o.titoli) {
    const ap = pr.apertura?.(o.testi) ?? null;
    if (ap) { const d = Math.min(animazione(ap.id)?.durata ?? 5, A * 0.4); apertura = { start: Math.min(0.5, A * 0.05), len: d, anim: ap }; }
    const ch = A >= 25 ? pr.chiusura?.(o.testi) ?? null : null;
    if (ch) { const d = Math.min(animazione(ch.id)?.durata ?? 5, A * 0.3); chiusura = { start: Math.max(apertura ? apertura.start + apertura.len + 1 : 0, A - d - 0.4), len: Math.min(d, A - 0.4 - (apertura ? apertura.start + apertura.len + 1 : 0)), anim: ch }; if (chiusura.len < 2.5) chiusura = null; }
  }

  // quello che cade sopra e gli effetti a tempo
  const sovr: PianoMontage['sovrapposizioni'] = [];
  const eff: PianoMontage['effetti'] = [];
  if (o.effetti) {
    pr.sovrapposizioni.forEach((s, k) => {
      // si sposta un po' e ogni tanto salta il giro (ma la prima c'è sempre)
      if (k > 0 && pr.sovrapposizioni.length >= 3 && rnd() < 0.15) return;
      const v = typeof s.v === 'function' ? s.v(o.testi) : s.v ?? {};
      const an = animazione(s.anim) ? nuovaAnim(s.anim, v) : null;
      // la durata varia un po' ma non esce mai dal montaggio (quelle che durano quasi tutto restano com'erano)
      const intera = (s.a - s.da) * A;
      const len = Math.min(intera * (0.85 + rnd() * 0.3), intera >= 0.9 * A ? intera : 0.96 * A);
      const start = Math.max(Math.min(s.da * A, 0.02 * A), Math.min(A - len - 0.02 * A, s.da * A + (rnd() - 0.5) * 0.08 * A));
      if (an && len >= 2) sovr.push({ anim: an, start, len });
    });
    for (const e of pr.effetti) {
      if (e.quando === 'tutto') { eff.push({ id: e.id, start: 0, len: e.durata ?? A }); continue; }
      if (e.quando === 'tagli') {
        for (let i = e.ogni + (rnd() < 0.5 ? 0 : 1); i < voci.length; i += e.ogni + (rnd() < 0.3 ? 1 : 0)) eff.push({ id: e.id, start: Math.max(0, voci[i].start - e.durata / 2), len: e.durata * (0.85 + rnd() * 0.3) });
      } else {
        for (let s = (e.da ?? e.ogni) * (0.8 + rnd() * 0.4); s + e.durata < A - 2; s += e.ogni * (0.8 + rnd() * 0.4)) eff.push({ id: e.id, start: s, len: e.durata });
      }
    }
  }
  const nFoto = voci.length;
  return { preset: pr.id, durata: A, voci, transizioni, apertura, chiusura, sovrapposizioni: sovr, effetti: eff, note, usate: lista.length, scartate: tolte, ripetute, perFoto: nFoto ? A / nFoto : 0 };
}

export const fmtDur = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`; };

// ——— Ken Burns ———
/** dove sta e quanto è grande la foto: a tutto quadro se ha quasi le stesse proporzioni, se no intera, un po' più piccola, con l'ombra */
export function inquadra(p: Pick<Project, 'w' | 'h'>, m: Pick<MediaItem, 'width' | 'height' | 'rotation'>, riempi = false): { scala: number; scheda: boolean } {
  const w = m.rotation % 180 ? m.height : m.width, h = m.rotation % 180 ? m.width : m.height;
  if (!w || !h) return { scala: 1, scheda: false };
  const ra = (w / h) / (p.w / p.h);
  if (riempi || (ra >= 0.8 && ra <= 1.25)) {
    const kf = Math.min(p.w / w, p.h / h), kc = Math.max(p.w / w, p.h / h);
    return { scala: kc / kf, scheda: false };
  }
  return { scala: 0.88, scheda: true };
}

/** partenza e arrivo del movimento; tfFine è undefined per "fermo" */
export function moto(p: Pick<Project, 'w' | 'h'>, m: Pick<MediaItem, 'width' | 'height' | 'rotation'>, id: Moto, forza: number, indice = 0, riempi = false): { tf: Transform; tfFine?: Transform } {
  const { scala, scheda } = inquadra(p, m, riempi);
  const base: Transform = { ...TF0, scale: scala };
  if (scheda) { base.ombra = 0.75; base.angoli = 0.035; }
  if (id === 'fermo') return { tf: base };
  const a = scheda ? forza * 0.5 : forza;
  const con = (d: Partial<Transform>): Transform => ({ ...base, ...d });
  const dx = scheda ? p.w * 0.012 : p.w * a * 0.45, dy = scheda ? p.h * 0.012 : p.h * a * 0.45;
  const z = scala * (1 + a);
  const inv = indice % 2 === 1 ? -1 : 1;
  switch (id) {
    case 'zoomIn': return { tf: base, tfFine: con({ scale: z }) };
    case 'zoomOut': return { tf: con({ scale: z }), tfFine: base };
    case 'panSx': return { tf: con({ scale: z, x: dx * inv }), tfFine: con({ scale: z, x: -dx * inv }) };
    case 'panDx': return { tf: con({ scale: z, x: -dx * inv }), tfFine: con({ scale: z, x: dx * inv }) };
    case 'panSu': return { tf: con({ scale: z, y: dy }), tfFine: con({ scale: z, y: -dy }) };
    case 'panGiu': return { tf: con({ scale: z, y: -dy }), tfFine: con({ scale: z, y: dy }) };
    case 'diagonale': return { tf: con({ scale: scala * (1 + a * 0.4), x: -dx * 0.7 * inv, y: dy * 0.7 }), tfFine: con({ scale: z, x: dx * 0.7 * inv, y: -dy * 0.7 }) };
  }
  return { tf: base };
}

// ——— sulla timeline ———
export interface RisultatoMontage { sequenza: string; clip: number; tracce: number }

/**
 * Mette il piano nel progetto: una timeline nuova (o quella aperta, se è vuota) con lo sfondo sfumato sotto, le foto e
 * i video sulla linea principale, quello che cade sopra, i titoli in cima, la musica e l'audio dei video.
 */
export function costruisciSequenza(p: Project, piano: PianoMontage, o: OpzMontage): RisultatoMontage {
  const pr = presetMontage(piano.preset) ?? presetMontage('classico')!;
  const r = fps(p.rate);
  const F = (s: number) => Math.max(0, Math.round(s * r));
  const nome = `DaProdMontage · ${pr.nome}`;
  const vuota = p.clips.length === 0 && (p.sequenze?.length ?? 1) <= 1;
  if (vuota) { p.sequenze = [{ id: p.seqAttiva ?? 'seq1', nome }]; p.seqAttiva = p.sequenze[0].id; }
  else nuovaSequenza(p, false, nome);
  const totF = F(piano.durata);

  // le corsie delle sovrapposizioni: una per ogni finestra che si sovrappone a un'altra
  const corsie: { fine: number }[] = [];
  const dove = piano.sovrapposizioni.map((s) => {
    let k = corsie.findIndex((c) => c.fine <= s.start + 1e-6);
    if (k < 0) { corsie.push({ fine: 0 }); k = corsie.length - 1; }
    corsie[k].fine = s.start + s.len;
    return k;
  });
  const tSfondo = newTrack('video', 'V1'), tFoto = newTrack('video', 'V2');
  const tCorsie = corsie.map((_, k) => newTrack('video', 'V' + (3 + k)));
  const tTitoli = newTrack('video', 'V' + (3 + corsie.length));
  const tMusica = newTrack('audio', 'A1'), tAudio = newTrack('audio', 'A2');
  tTitoli.height = 40;
  const tracce: Track[] = [tTitoli, ...[...tCorsie].reverse(), tFoto, tSfondo, tMusica, tAudio];
  p.tracks = tracce; p.clips = []; p.markers = []; p.inF = null; p.outF = null;
  const mediaDi = (id: string) => p.media.find((m) => m.id === id);

  // lo sfondo sfumato sotto tutto
  p.clips.push(newClip('color', tSfondo.id, 0, totF, { name: 'Sfondo', gen: { color: pr.sfondo[0], color2: pr.sfondo[1] } }));

  // la linea principale
  const durF = inFotogrammi(piano.voci.map((v) => v.len), r, totF);
  let a = 0;
  piano.voci.forEach((v, i) => {
    const m = mediaDi(v.entrata.media);
    const len = durF[i];
    const mt = m ? moto(p, m, v.moto, pr.forzaMoto * v.forza, v.verso, o.adatta === 'riempi') : { tf: { ...TF0 } };
    const link = v.entrata.tipo === 'video' && v.entrata.audio && o.audioVideo > -50 ? uid('l') : undefined;
    const c = newClip('media', tFoto.id, a, len, { media: v.entrata.media, name: v.entrata.nome, srcIn: v.srcIn, tf: mt.tf, tfFine: mt.tfFine, link, fx: { ...FX0, effetti: pr.look.length ? [...pr.look] : undefined } });
    if (i === 0) c.fadeIn = Math.min(Math.round(r * 0.8), Math.floor(len / 2));
    if (i === piano.voci.length - 1) c.fadeOut = Math.min(Math.round(r * 1.4), Math.floor(len / 2));
    p.clips.push(c);
    if (link) p.clips.push(newClip('media', tAudio.id, a, len, { media: v.entrata.media, name: v.entrata.nome, srcIn: v.srcIn, link, gain: o.audioVideo, fadeIn: 3, fadeOut: 3 }));
    a += len;
  });

  // transizioni: blocchetti sopra i tagli della linea principale
  for (const t of piano.transizioni) {
    const len = Math.max(2, F(t.len));
    posaBlocco(p, nuovoBlocco('transizione', t.id), F(t.centro) - Math.round(len / 2), len, tFoto.id);
  }

  // quello che cade sopra
  piano.sovrapposizioni.forEach((s, i) => {
    const an = animazione(s.anim.id);
    p.clips.push(newClip('title', tCorsie[dove[i]].id, F(s.start), Math.max(2, F(s.len)), { name: an?.nome ?? 'Animazione', gen: { anim: s.anim } }));
  });
  // i titoli, in cima
  for (const [t, nomeT] of [[piano.apertura, 'Apertura'], [piano.chiusura, 'Chiusura']] as const) {
    if (!t?.anim) continue;
    p.clips.push(newClip('title', tTitoli.id, F(t.start), Math.max(2, F(t.len)), { name: `${nomeT} · ${animazione(t.anim.id)?.nome ?? ''}`, gen: { anim: t.anim } }));
  }
  // gli effetti a tempo (sulla prima corsia sopra le foto: valgono per le foto e lo sfondo, non per i titoli)
  const trEff = (tCorsie[0] ?? tFoto).id;
  for (const e of piano.effetti) posaBlocco(p, nuovoBlocco('effetto', e.id), F(e.start), Math.max(2, F(e.len)), trEff);
  // dal nero all'inizio e al nero alla fine
  posaBlocco(p, nuovoBlocco('effetto', 'dalNero'), 0, Math.min(Math.round(r * 0.9), Math.floor(totF / 4)), tTitoli.id);
  posaBlocco(p, nuovoBlocco('effetto', 'alNero'), Math.max(0, totF - Math.round(r * 1.4)), Math.min(Math.round(r * 1.4), Math.floor(totF / 4)), tTitoli.id);

  // la musica: lunga quanto il video (si ripete se è più corta), con la dissolvenza in fondo
  if (o.musica) {
    const mus = mediaDi(o.musica.media);
    const dMus = Math.max(1, o.musica.durata || mus?.duration || 1);
    const haAudioVideo = piano.voci.some((v) => v.entrata.tipo === 'video' && v.entrata.audio) && o.audioVideo > -50;
    const gain = haAudioVideo ? -10 : -2;
    let t = 0;
    while (t < piano.durata - 0.01) {
      const len = Math.min(dMus, piano.durata - t);
      const c = newClip('media', tMusica.id, F(t), Math.max(1, F(len)), { media: o.musica.media, name: o.musica.nome ?? mus?.name ?? 'Musica', srcIn: mus?.t0 ?? 0, gain });
      if (t + len >= piano.durata - 0.01) c.fadeOut = Math.min(Math.round(r * 3), c.len);
      if (t === 0) c.fadeIn = Math.min(Math.round(r * 1.2), c.len);
      p.clips.push(c);
      t += len;
    }
  }
  return { sequenza: p.seqAttiva ?? '', clip: p.clips.length, tracce: p.tracks.length };
}
