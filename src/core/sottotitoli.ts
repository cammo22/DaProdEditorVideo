// I sottotitoli: le righe con il loro tempo, il file .srt (esporta e importa: così si possono anche portare
// quelli fatti con altri programmi o con l'AI) e i "tempi dai dialoghi": il programma ascolta dove si parla e
// prepara le righe vuote al punto giusto, così resta solo da scrivere.
import type { Project, Sottotitolo, Sottotitoli } from './tipi';
import { end, uid } from './progetto';
import { fps } from './timecode';
import { mediaRT, PEAKS_PER_SEC } from '../media/libreria';

export const SOTTO0: Sottotitoli = { righe: [], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' };

export const LINGUE: [string, string][] = [
  ['it', 'Italiano'], ['en', 'Inglese'], ['es', 'Spagnolo'], ['fr', 'Francese'], ['de', 'Tedesco'], ['pt', 'Portoghese'],
  ['nap', 'Napoletano'], ['ar', 'Arabo'], ['zh', 'Cinese'], ['ja', 'Giapponese'],
];

export const sottotitoliDi = (p: Project): Sottotitoli => p.sottotitoli ?? SOTTO0;

/**
 * Dove si parla, in fotogrammi. Si ascolta l'audio delle riprese (le clip audio legate a un video: la presa
 * diretta, non la musica); se non ce ne sono, tutto l'audio. Soglia sul rumore di fondo, pause brevi unite,
 * frasi lunghe spezzate.
 */
export function tempiDaiDialoghi(p: Project): { da: number; a: number }[] {
  const r = fps(p.rate);
  const audio = new Set(p.tracks.filter((t) => t.kind === 'audio' && !t.mute).map((t) => t.id));
  const tutte = p.clips.filter((c) => c.kind === 'media' && audio.has(c.track) && c.media && mediaRT(c.media)?.peaks);
  const video = new Set(p.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
  const presa = tutte.filter((c) => c.link && p.clips.some((v) => v.link === c.link && video.has(v.track)));
  const clip = presa.length ? presa : tutte;
  if (!clip.length) return [];
  const fine = Math.max(...clip.map(end));
  const passo = 1 / PEAKS_PER_SEC;
  const n = Math.ceil((fine / r) / passo);
  const en = new Float32Array(n);
  for (const c of clip) {
    const pk = mediaRT(c.media!)!.peaks!;
    const g = Math.pow(10, (c.gain <= -60 ? -120 : c.gain) / 20);
    const a = Math.floor((c.start / r) / passo), b = Math.min(n, Math.ceil((end(c) / r) / passo));
    for (let i = a; i < b; i++) {
      const src = Math.floor((c.srcIn + (i * passo - c.start / r) * c.speed) * PEAKS_PER_SEC);
      if (src >= 0 && src < pk.length) en[i] = Math.max(en[i], pk[src] * g);
    }
  }
  // la soglia: un po' sopra il rumore di fondo (il 25° percentile dei momenti non muti)
  const db = (x: number) => 20 * Math.log10(Math.max(1e-6, x));
  const vivi = Array.from(en).filter((x) => x > 1e-4).map(db).sort((x, y) => x - y);
  if (!vivi.length) return [];
  const soglia = Math.max(vivi[Math.floor(vivi.length * 0.25)] + 9, -40);
  // si liscia su 60 ms, poi si cercano i tratti sopra la soglia
  const L = 3;
  const su: boolean[] = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = Math.max(0, i - L); k <= Math.min(n - 1, i + L); k++) if (en[k] > m) m = en[k];
    su.push(db(m) > soglia);
  }
  let pezzi: [number, number][] = [];
  for (let i = 0; i < n;) {
    if (!su[i]) { i++; continue; }
    let j = i;
    while (j < n && su[j]) j++;
    pezzi.push([i * passo, j * passo]);
    i = j;
  }
  // pause sotto i 0,35 s: stessa frase
  const uniti: [number, number][] = [];
  for (const x of pezzi) {
    const u = uniti[uniti.length - 1];
    if (u && x[0] - u[1] < 0.35) u[1] = x[1]; else uniti.push([x[0], x[1]]);
  }
  pezzi = uniti.filter(([a, b]) => b - a >= 0.4);
  // frasi lunghe: a pezzi di circa 4 secondi (un sottotitolo si legge in fretta)
  const out: { da: number; a: number }[] = [];
  for (const [a0, b0] of pezzi) {
    const a = Math.max(0, a0 - 0.1), b = b0 + 0.15;
    const quanti = Math.max(1, Math.round((b - a) / 4));
    for (let k = 0; k < quanti; k++) {
      const x = a + ((b - a) * k) / quanti, y = a + ((b - a) * (k + 1)) / quanti;
      out.push({ da: Math.round(x * r), a: Math.round(y * r) });
    }
  }
  return out;
}

/** righe nuove (vuote) dove si parla, senza toccare quelle già scritte */
export function righeDaiDialoghi(p: Project): number {
  const s = (p.sottotitoli ??= structuredClone(SOTTO0));
  let n = 0;
  for (const t of tempiDaiDialoghi(p)) {
    if (s.righe.some((r) => r.da < t.a && r.a > t.da)) continue;
    s.righe.push({ id: uid('s'), da: t.da, a: t.a, testo: '' });
    n++;
  }
  s.righe.sort((x, y) => x.da - y.da);
  return n;
}

// ——— il file .srt ———

function tcSrt(sec: number, sep = ','): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000), mi = ms % 1000;
  const d = (x: number, n = 2) => String(x).padStart(n, '0');
  return `${d(hh)}:${d(mm)}:${d(ss)}${sep}${d(mi, 3)}`;
}

/** le righe da scrivere nei file: solo quelle col testo, in ordine di tempo */
const righeScritte = (p: Project) => sottotitoliDi(p).righe.filter((x) => x.testo.trim()).sort((a, b) => a.da - b.da);

export function creaSrt(p: Project): string {
  const r = fps(p.rate);
  return righeScritte(p)
    .map((x, i) => `${i + 1}\n${tcSrt(x.da / r)} --> ${tcSrt(x.a / r)}\n${x.testo.trim()}\n`).join('\n');
}

/** il file .vtt (WebVTT, quello dei video sul web): stessi tempi, il punto al posto della virgola e il testo senza < > & */
export function creaVtt(p: Project): string {
  const r = fps(p.rate);
  const pulito = (t: string) => t.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n\s*\n+/g, '\n');
  return 'WEBVTT\n\n' + righeScritte(p)
    .map((x, i) => `${i + 1}\n${tcSrt(x.da / r, '.')} --> ${tcSrt(x.a / r, '.')}\n${pulito(x.testo)}\n`).join('\n');
}

/** legge un .srt (o un .vtt): ritorna le righe in fotogrammi */
export function leggiSrt(testo: string, p: Project): Sottotitolo[] {
  const r = fps(p.rate);
  const sec = (t: string) => { const m = t.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN; };
  const out: Sottotitolo[] = [];
  for (const blocco of testo.replace(/\r/g, '').split(/\n\s*\n/)) {
    const righe = blocco.split('\n').filter((x) => x.trim() && x.trim() !== 'WEBVTT');
    const i = righe.findIndex((x) => x.includes('-->'));
    if (i < 0) continue;
    const [a, b] = righe[i].split('-->');
    const da = sec(a), fino = sec(b.split(' ').filter(Boolean)[0] ?? '');
    if (!Number.isFinite(da) || !Number.isFinite(fino) || fino <= da) continue;
    out.push({ id: uid('s'), da: Math.round(da * r), a: Math.round(fino * r), testo: righe.slice(i + 1).join('\n').replace(/<[^>]+>/g, '') });
  }
  return out;
}

// ——— sistemare i tempi: unire, dividere, attaccare al cursore ———

/**
 * Unisce le righe scelte (e tutto quello che c'è fra loro) in una riga sola: il testo va a capo, così le frasi
 * compaiono insieme. Ritorna l'id della riga che resta.
 */
export function unisciRighe(s: Sottotitoli, ids: string[]): string | null {
  s.righe.sort((x, y) => x.da - y.da);
  const idx = s.righe.map((r, i) => (ids.includes(r.id) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const a = Math.min(...idx), b = Math.max(...idx, idx.length === 1 ? Math.min(s.righe.length - 1, a + 1) : a);
  if (b <= a) return null;
  const pezzi = s.righe.slice(a, b + 1);
  const unita = { ...pezzi[0], a: Math.max(...pezzi.map((r) => r.a)), testo: pezzi.map((r) => r.testo.trim()).filter(Boolean).join('\n') };
  s.righe.splice(a, b - a + 1, unita);
  return unita.id;
}

/**
 * divide una riga al fotogramma f: il testo si spezza alla parola più vicina a quel punto, oppure (`car`) proprio dove
 * sta il cursore di scrittura (la lettera numero `car`: scrivendo, Ctrl+Invio divide lì)
 */
export function dividiRiga(s: Sottotitoli, id: string, f: number, car?: number): string | null {
  const r = s.righe.find((x) => x.id === id);
  if (!r || f <= r.da + 1 || f >= r.a - 1) return null;
  let prima: string, dopoTesto: string;
  if (car !== undefined && car > 0 && car < r.testo.length) {
    prima = r.testo.slice(0, car).trim();
    dopoTesto = r.testo.slice(car).trim();
  } else {
    const k = (f - r.da) / (r.a - r.da);
    const parole = r.testo.split(/\s+/).filter(Boolean);
    let taglio = Math.round(parole.length * k);
    if (parole.length > 1) taglio = Math.max(1, Math.min(parole.length - 1, taglio));
    prima = parole.slice(0, taglio).join(' ');
    dopoTesto = parole.slice(taglio).join(' ');
  }
  const dopo = { id: uid('s'), da: f, a: r.a, testo: dopoTesto };
  r.a = f;
  r.testo = prima;
  s.righe.push(dopo);
  s.righe.sort((x, y) => x.da - y.da);
  return dopo.id;
}

/** la riga che sta sotto il fotogramma f (la prima, se si sovrappongono) */
export const rigaAl = (s: Sottotitoli, f: number): Sottotitolo | undefined =>
  s.righe.slice().sort((x, y) => x.da - y.da).find((r) => r.da <= f && f < r.a);

/** la riga prima o dopo quella data (in ordine di tempo) */
export function rigaVicina(s: Sottotitoli, id: string, verso: 1 | -1): Sottotitolo | undefined {
  const ord = s.righe.slice().sort((x, y) => x.da - y.da);
  const i = ord.findIndex((x) => x.id === id);
  return i < 0 ? undefined : ord[i + verso];
}

/**
 * Mette in ordine le righe appena uscite dall'AI o da un file: in ordine di tempo, mai prima dello zero né oltre la
 * fine (se la fine si conosce), nessuna sopra la vicina, almeno `minimo` fotogrammi ciascuna; le righe che non ci
 * stanno più si scartano. Le righe di sola punteggiatura o vuote restano (da scrivere) solo se `tieniVuote`.
 */
export function sistemaRighe(righe: Sottotitolo[], fine = Infinity, minimo = 2, tieniVuote = false): Sottotitolo[] {
  const ord = righe.map((r) => ({ ...r })).filter((r) => Number.isFinite(r.da) && Number.isFinite(r.a) && (tieniVuote || /[\p{L}\p{N}]/u.test(r.testo)))
    .sort((x, y) => x.da - y.da || x.a - y.a);
  const out: Sottotitolo[] = [];
  for (const r of ord) {
    r.da = Math.max(0, Math.round(r.da));
    r.a = Math.round(r.a);
    const prima = out[out.length - 1];
    if (prima && r.da < prima.a) {
      // la vicina arriva fino a qui: o si accorcia lei, o (se resterebbe troppo corta) si sposta questa
      if (r.da - prima.da >= minimo) prima.a = r.da; else r.da = prima.a;
    }
    r.a = Math.min(r.a, fine);
    if (r.a - r.da < minimo) { if (r.da + minimo <= fine) r.a = r.da + minimo; else continue; }
    out.push(r);
  }
  return out;
}

/** sposta le righe scelte di `d` fotogrammi tutte insieme; si fermano contro le altre righe e lo zero. Ritorna di quanto si sono mosse. */
export function spostaRighe(s: Sottotitoli, ids: Set<string>, d: number): number {
  const mosse = s.righe.filter((r) => ids.has(r.id));
  const ferme = s.righe.filter((r) => !ids.has(r.id));
  if (!mosse.length || !d) return 0;
  let lo = -Infinity, hi = Infinity;
  for (const m of mosse) {
    lo = Math.max(lo, -m.da);
    for (const f of ferme) {
      if (f.a <= m.da) lo = Math.max(lo, f.a - m.da);
      else if (f.da >= m.a) hi = Math.min(hi, f.da - m.a);
    }
  }
  const dd = Math.max(lo, Math.min(hi, Math.round(d)));
  for (const m of mosse) { m.da += dd; m.a += dd; }
  s.righe.sort((x, y) => x.da - y.da);
  return dd;
}

/** i limiti di una riga: non entra nella precedente né nella successiva */
export function limitiRiga(s: Sottotitoli, id: string): [number, number] {
  const ord = s.righe.slice().sort((x, y) => x.da - y.da);
  const i = ord.findIndex((x) => x.id === id);
  return [i > 0 ? ord[i - 1].a : 0, i >= 0 && i < ord.length - 1 ? ord[i + 1].da : Infinity];
}

/** l'inizio o la fine di una riga al fotogramma f (senza entrare nelle vicine, almeno due fotogrammi) */
export function bordoRiga(s: Sottotitoli, id: string, lato: 'da' | 'a', f: number) {
  const r = s.righe.find((x) => x.id === id);
  if (!r) return;
  const [min, max] = limitiRiga(s, id);
  if (lato === 'da') r.da = Math.max(min, Math.min(r.a - 2, Math.round(f)));
  else r.a = Math.min(max, Math.max(r.da + 2, Math.round(f)));
}
