// Togliere lo sfondo con l'AI. Si guardano tanti fotogrammi della ripresa (da 4 a 12 al secondo, dipende dalla
// precisione), per ognuno un modello disegna la maschera (bianco = soggetto), e le maschere vanno in
// src/media/maschere.ts: il compositore le mescola da un fotogramma all'altro e le usa come trasparenza, nel monitor
// e nell'export. Tre strade:
//  · PERSONA: MODNet (Apache-2.0), leggerissimo, fatto per i ritratti e le videochiamate;
//  · SOGGETTO: BEN2 (MIT, capelli e peli compresi) o BiRefNet (MIT, alta risoluzione): qualunque cosa in primo piano;
//  · OGGETTI: SAM 2.1 (Apache-2.0, ripiego SlimSAM): clicchi sull'oggetto (dentro/fuori) e lo segue da un fotogramma
//    all'altro (il riquadro della maschera di prima diventa il suggerimento per quella dopo).
// I modelli si scaricano da Hugging Face solo la prima volta (src/media/ritaglio.worker.ts). Nelle prove il modello è finto.
import { VideoSampleSink } from 'mediabunny';
import type { Clip, Project, Ritaglio } from '../core/tipi';
import { mediaOf } from '../core/progetto';
import { fps } from '../core/timecode';
import { firmaRitaglio, istantiCampioni, levigaMaschere, pulisciMaschera, puntiNucleo, puoRitagliare, QUALITA_RITAGLIO, riquadroMaschera, trattoSorgente, votoTemporale } from '../core/sfondo';
import { mediaRT } from './libreria';
import { misuraPer, pixelAl, type Pixel } from './campiona';
import { impostaMaschere, potaMaschere, type Maschere } from './maschere';
import { spiegaErroreAI } from './erroriAI';
import { baseLocaleAI } from './libreriaAI';
import { messaggioScheda, schedaGuasta } from './hardware';

export interface ModelloRitaglio {
  id: string;
  nome: string;
  info: string;
  modi: Ritaglio['modo'][];
  famiglia: 'sfondo' | 'sam';
  /** gli indirizzi su Hugging Face da provare, nell'ordine */
  repo: string[];
  licenza: string;
}

export const MODELLI_RITAGLIO: ModelloRitaglio[] = [
  { id: 'ben2', nome: 'BEN2', info: 'la più precisa: capelli, peli e bordi sfumati', modi: ['soggetto'], famiglia: 'sfondo', repo: ['onnx-community/BEN2-ONNX'], licenza: 'MIT' },
  { id: 'birefnet', nome: 'BiRefNet', info: 'alta risoluzione, molto pulita sui contorni netti', modi: ['soggetto'], famiglia: 'sfondo', repo: ['onnx-community/BiRefNet-ONNX', 'onnx-community/BiRefNet_lite-ONNX'], licenza: 'MIT' },
  { id: 'birefnet-lite', nome: 'BiRefNet Lite', info: 'più leggera e veloce, per i computer senza scheda video', modi: ['soggetto'], famiglia: 'sfondo', repo: ['onnx-community/BiRefNet_lite-ONNX'], licenza: 'MIT' },
  { id: 'modnet', nome: 'MODNet', info: 'persone e ritratti, velocissima anche senza scheda video', modi: ['persona'], famiglia: 'sfondo', repo: ['Xenova/modnet'], licenza: 'Apache-2.0' },
  { id: 'sam2', nome: 'SAM 2.1', info: 'clicchi sull\'oggetto e lo ritaglia (se non c\'è usa SlimSAM)', modi: ['oggetti'], famiglia: 'sam', repo: ['onnx-community/sam2.1-hiera-tiny-ONNX', 'Xenova/slimsam-77-uniform'], licenza: 'Apache-2.0' },
  { id: 'slimsam', nome: 'SlimSAM', info: 'la versione più piccola, per i computer più lenti', modi: ['oggetti'], famiglia: 'sam', repo: ['Xenova/slimsam-77-uniform'], licenza: 'Apache-2.0' },
];

export const modelloRitaglio = (id: string) => MODELLI_RITAGLIO.find((m) => m.id === id);
export const modelliPer = (modo: Ritaglio['modo']) => MODELLI_RITAGLIO.filter((m) => m.modi.includes(modo));
export const modelloDiPartenza = (modo: Ritaglio['modo']) => modelliPer(modo)[0].id;

/** chi disegna le maschere: di solito il worker coi modelli veri; le prove ne mettono uno finto */
export interface Segmentatore {
  carica: (m: ModelloRitaglio, stato: (fase: string, prog: number) => void) => Promise<string>;
  /** un fotogramma (RGBA) → la maschera (w×h byte). Oggetti: i clic, o il riquadro (frazioni) che suggerisce dov'è */
  maschera: (px: Pixel, o?: { punti?: NonNullable<Ritaglio['punti']>; riquadro?: [number, number, number, number] }) => Promise<Uint8Array>;
}

// ——— il worker ———
let worker: Worker | null = null;
let seq = 0;
const attese = new Map<number, { ok: (d: Uint8Array) => void; no: (e: Error) => void }>();
let caricamento: { ok: (d: string) => void; no: (e: Error) => void; stato: (fase: string, prog: number) => void } | null = null;
const scaricati = new Map<string, [number, number]>();

function lavoratore(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./ritaglio.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { tipo: string; id?: number; dati?: Uint8Array; msg?: string; device?: string; repo?: string; file?: string; loaded?: number; total?: number };
    if (m.tipo === 'scarico' && caricamento) {
      scaricati.set(m.file!, [m.loaded!, m.total!]);
      let a = 0, b = 0;
      for (const [x, y] of scaricati.values()) { a += x; b += y; }
      caricamento.stato(`Scarico il modello: ${(a / 1048576).toFixed(0)} di ${(b / 1048576).toFixed(0)} MB (solo la prima volta)`, b ? a / b : 0);
    } else if (m.tipo === 'avviso') { caricamento?.stato(m.msg ?? '', 0); }
    else if (m.tipo === 'scheda-guasta') schedaGuasta();
    else if (m.tipo === 'pronto') { caricamento?.ok((m.repo ? m.repo + ' · ' : '') + (m.device ?? '')); caricamento = null; }
    else if (m.tipo === 'maschera') { attese.get(m.id!)?.ok(m.dati!); attese.delete(m.id!); }
    else if (m.tipo === 'errore') {
      const err = new Error(m.msg || 'errore del modello');
      if (m.id !== undefined && attese.has(m.id)) { attese.get(m.id)!.no(err); attese.delete(m.id); }
      else { caricamento?.no(err); caricamento = null; }
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'il worker del ritaglio si è fermato');
    caricamento?.no(err); caricamento = null;
    for (const x of attese.values()) x.no(err);
    attese.clear();
    worker = null;
  };
  return worker;
}

const conIlWorker: Segmentatore = {
  carica: (m, stato) => new Promise((ok, no) => {
    scaricati.clear();
    caricamento = { ok, no, stato };
    const hw = messaggioScheda();
    lavoratore().postMessage({ tipo: 'carica', famiglia: m.famiglia, repo: m.repo, base: baseLocaleAI(), scheda: hw.scheda, hw });
  }),
  maschera: (px, o) => new Promise((ok, no) => {
    const id = ++seq;
    attese.set(id, { ok, no });
    const rgba = new Uint8ClampedArray(px.data);
    lavoratore().postMessage({ tipo: 'maschera', id, w: px.w, h: px.h, rgba, punti: o?.punti, riquadro: o?.riquadro }, [rgba.buffer]);
  }),
};

let segmentatore: Segmentatore = conIlWorker;
export const impostaSegmentatore = (s: Segmentatore | null) => { segmentatore = s ?? conIlWorker; };

// ——— il lavoro ———
export interface OpzioniElabora {
  /** una frase e una frazione 0..1 per la barra */
  stato?: (fase: string, k: number) => void;
  /** chi mette true ferma il lavoro (non si salva niente) */
  ferma?: () => boolean;
}

export interface Esito { ok: boolean; motivo?: string; maschere?: Maschere; ms?: number; dispositivo?: string }

const margine = (a: number, b: number, t: number) => Math.max(a, Math.min(b, t));

/** i fotogrammi da guardare: per un'immagine uno solo; per una ripresa tutti i campioni, in ordine, letti di seguito */
async function leggiCampioni(mediaId: string, t0: number, dt: number, n: number, lato: number, avanza: (k: number) => void, ferma: () => boolean): Promise<Pixel[]> {
  const out: Pixel[] = [];
  const rt = mediaRT(mediaId);
  if (!rt) return out;
  if (rt.image) { const p = await pixelAl(mediaId, 0, lato); return p ? [p] : []; }
  if (!rt.v || !rt.vDecodable) return out;
  const sink = new VideoSampleSink(rt.v);
  const fine = t0 + dt * (n - 1);
  let prossimo = 0;
  let ultimo: Pixel | null = null;
  const tela = { c: null as OffscreenCanvas | null };
  try {
    for await (const s of sink.samples(Math.max(0, t0 - 1e-3), fine + dt)) {
      if (ferma()) { s.close(); break; }
      // il primo fotogramma che arriva a (o supera) l'istante da guardare: se ne saltano di meno possibile
      while (prossimo < n && s.timestamp + 1e-4 >= t0 + prossimo * dt - 1 / 120) {
        const w0 = s.rotation % 180 ? s.displayHeight : s.displayWidth, h0 = s.rotation % 180 ? s.displayWidth : s.displayHeight;
        const { w, h } = misuraPer(w0, h0, lato);
        if (!tela.c || tela.c.width !== w || tela.c.height !== h) tela.c = new OffscreenCanvas(w, h);
        const ctx = tela.c.getContext('2d', { willReadFrequently: true })!;
        ctx.clearRect(0, 0, w, h);
        s.drawWithFit(ctx, { fit: 'fill' });
        ultimo = { w, h, data: new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data), t: s.timestamp };
        out.push(ultimo);
        prossimo++;
        avanza(prossimo / n);
      }
      s.close();
      if (prossimo >= n) break;
    }
  } catch { /* la ripresa finisce prima */ }
  // se la ripresa è finita prima del previsto, l'ultimo fotogramma si ripete
  while (out.length < n && ultimo) out.push(ultimo);
  return out;
}

/** il riquadro (frazioni) da dare come suggerimento al fotogramma dopo, ingrandito un po' */
function suggerimento(m: Uint8Array, w: number, h: number): [number, number, number, number] | null {
  const q = riquadroMaschera(m, w, h, 128);
  if (!q || q.area < 0.0004) return null;
  const mx = (q.x1 - q.x0) * 0.1 + 0.01, my = (q.y1 - q.y0) * 0.1 + 0.01;
  return [margine(0, 1, q.x0 - mx), margine(0, 1, q.y0 - my), margine(0, 1, q.x1 + mx), margine(0, 1, q.y1 + my)];
}

/** elabora tutta la clip: le maschere restano in memoria (e nella cache) e la firma si scrive nel ritaglio della clip */
export async function elaboraRitaglio(p: Project, c: Clip, o: OpzioniElabora = {}): Promise<Esito> {
  const t0 = performance.now();
  const r = c.ritaglio;
  const media = mediaOf(p, c);
  if (!r || !c.media || !puoRitagliare(media)) return { ok: false, motivo: 'Questa clip non si può ritagliare' };
  const mod = modelloRitaglio(r.modello) ?? modelloRitaglio(modelloDiPartenza(r.modo))!;
  const stato = o.stato ?? (() => {});
  const ferma = o.ferma ?? (() => false);
  if (r.modo === 'oggetti' && !(r.punti ?? []).some((q) => q.dentro)) return { ok: false, motivo: 'Clicca prima sull\'oggetto da tenere' };
  stato(`Preparo il modello ${mod.nome}…`, 0);
  let dispositivo = '';
  try { dispositivo = await segmentatore.carica(mod, (fase, k) => stato(fase, k * 0.1)); } catch (e) {
    return { ok: false, motivo: 'Non riesco a caricare il modello: ' + spiegaErroreAI(e) };
  }
  if (ferma()) return { ok: false, motivo: 'Fermato' };
  const q = QUALITA_RITAGLIO[Math.max(0, Math.min(QUALITA_RITAGLIO.length - 1, r.qualita))];
  const immagine = media!.type === 'image';
  const rate = fps(p.rate);
  // la parte di ripresa che serve: tutto quello che la clip mostra, con un fotogramma di margine
  const { da: da0, a: a0 } = immagine ? { da: 0, a: 0 } : trattoSorgente(c, rate);
  const t00 = media!.t0 || 0;
  const da = immagine ? 0 : Math.max(t00, da0 - 1 / rate), a = immagine ? 0 : Math.min(media!.duration || a0, a0 + 1 / rate);
  const lato = immagine ? Math.max(q.lato, 768) : q.lato;
  const piccola = misuraPer(media!.width, media!.height, lato);
  // per gli oggetti si tengono in memoria tutti i fotogrammi (si va avanti e indietro dal clic): il budget è più stretto
  const budget = r.modo === 'oggetti' ? 40 * 1024 * 1024 : undefined;
  const piano = immagine ? { t0: 0, dt: 0, n: 1, hz: 0 } : istantiCampioni(da, a, q.hz, piccola.w, piccola.h * (r.modo === 'oggetti' ? 5 : 1), budget);
  const dati: Uint8Array[] = new Array(piano.n);
  let w = piccola.w, h = piccola.h;
  const avanza = (k: number, fase: string) => stato(fase, 0.1 + 0.9 * k);

  try {
    if (r.modo === 'oggetti') {
      // tutti i fotogrammi in memoria, poi dal clic in avanti e all'indietro
      const px = await leggiCampioni(c.media, piano.t0, piano.dt, piano.n, lato, (k) => avanza(k * 0.15, 'Leggo la ripresa…'), ferma);
      if (ferma()) return { ok: false, motivo: 'Fermato' };
      if (!px.length) return { ok: false, motivo: 'Non riesco a leggere la ripresa' };
      w = px[0].w; h = px[0].h;
      const tClic = r.da ?? c.srcIn;
      let i0 = 0;
      for (let i = 1; i < px.length; i++) if (Math.abs(piano.t0 + i * piano.dt - tClic) < Math.abs(piano.t0 + i0 * piano.dt - tClic)) i0 = i;
      let fatti = 0;
      const tot = px.length;
      const clic: [number, number][] = (r.punti ?? []).filter((q) => q.dentro).map((q) => [q.x, q.y]);
      const passo = async (i: number, prec: Uint8Array | null, ultimoBuono: [number, number, number, number] | null) => {
        const hint = r.segui !== false && prec ? (suggerimento(prec, w, h) ?? ultimoBuono) : null;
        // dopo il primo fotogramma: il riquadro (dov'è) e qualche punto nel cuore della maschera di prima (quale)
        const nucleo = hint && prec ? puntiNucleo(prec, w, h) : [];
        const grezza = await segmentatore.maschera(px[i], hint ? { riquadro: hint, ...(nucleo.length ? { punti: nucleo } : {}) } : { punti: r.punti });
        // buchi riempiti e isole tolte: si tiene quello che tocca il fotogramma di prima (o i clic nel primo)
        const m = pulisciMaschera(grezza, w, h, { vicino: hint ? prec : null, tieni: hint ? undefined : clic, soloConnessi: true });
        dati[i] = m;
        fatti++;
        avanza(0.15 + 0.85 * (fatti / tot), `Seguo l'oggetto: fotogramma ${fatti} di ${tot}`);
        return { m, buono: suggerimento(m, w, h) ?? ultimoBuono };
      };
      let s = await passo(i0, null, null);
      let prec = s.m, buono = s.buono;
      for (let i = i0 + 1; i < px.length && !ferma(); i++) { s = await passo(i, prec, buono); prec = s.m; buono = s.buono; }
      prec = dati[i0]; buono = suggerimento(prec, w, h);
      for (let i = i0 - 1; i >= 0 && !ferma(); i--) { s = await passo(i, prec, buono); prec = s.m; buono = s.buono; }
    } else if (immagine) {
      const px = await leggiCampioni(c.media, 0, 0, 1, lato, () => {}, ferma);
      if (!px.length) return { ok: false, motivo: 'Non riesco a leggere l\'immagine' };
      w = px[0].w; h = px[0].h;
      avanza(0.3, 'Ritaglio l\'immagine…');
      dati[0] = await segmentatore.maschera(px[0]);
    } else {
      // le riprese si leggono di seguito e si passano al modello man mano (non si tengono tutte in memoria)
      const px = await leggiCampioni(c.media, piano.t0, piano.dt, piano.n, lato, () => {}, ferma);
      if (ferma()) return { ok: false, motivo: 'Fermato' };
      if (!px.length) return { ok: false, motivo: 'Non riesco a leggere la ripresa' };
      w = px[0].w; h = px[0].h;
      for (let i = 0; i < px.length && !ferma(); i++) {
        // il fotogramma di prima aiuta a tenere tutte le persone che c'erano e a buttare i pezzi che compaiono per sbaglio
        dati[i] = pulisciMaschera(await segmentatore.maschera(px[i]), w, h, { vicino: i ? dati[i - 1] : null });
        avanza((i + 1) / px.length, `Tolgo lo sfondo: fotogramma ${i + 1} di ${px.length}`);
      }
    }
  } catch (e) {
    return { ok: false, motivo: 'Il modello si è fermato: ' + spiegaErroreAI(e) };
  }
  if (ferma()) return { ok: false, motivo: 'Fermato' };
  const completi = dati.filter(Boolean);
  if (completi.length !== piano.n) return { ok: false, motivo: 'Qualche fotogramma non è venuto' };
  // un buco che c'è in un fotogramma solo si riempie (guardando prima e dopo), poi la levigatura dei bordi
  if (!immagine) { votoTemporale(dati); levigaMaschere(dati); }
  const firma = firmaRitaglio(c.media, r);
  const m: Maschere = { firma, w, h, t0: piano.t0, dt: piano.dt, n: piano.n, hz: piano.hz, dati };
  impostaMaschere(m);
  // quelle di prima che nessuna clip usa più vanno via (la nuova non ha ancora la firma nella clip: si tiene a parte)
  potaMaschere(p, [firma]);
  stato('Fatto', 1);
  return { ok: true, maschere: m, ms: performance.now() - t0, dispositivo };
}

/** una prova su un fotogramma solo (per vedere l'oggetto scelto coi clic prima di fare tutta la clip) */
export async function provaRitaglio(p: Project, c: Clip, t: number, stato?: (fase: string, k: number) => void): Promise<{ px: Pixel; mask: Uint8Array } | null> {
  const r = c.ritaglio;
  if (!r || !c.media) return null;
  const mod = modelloRitaglio(r.modello) ?? modelloRitaglio(modelloDiPartenza(r.modo))!;
  await segmentatore.carica(mod, (fase, k) => stato?.(fase, k));
  const q = QUALITA_RITAGLIO[Math.max(0, Math.min(QUALITA_RITAGLIO.length - 1, r.qualita))];
  const px = await pixelAl(c.media, t, q.lato);
  if (!px) return null;
  const grezza = await segmentatore.maschera(px, r.modo === 'oggetti' ? { punti: r.punti } : undefined);
  const mask = pulisciMaschera(grezza, px.w, px.h, { tieni: r.modo === 'oggetti' ? (r.punti ?? []).filter((q) => q.dentro).map((q): [number, number] => [q.x, q.y]) : undefined, soloConnessi: r.modo === 'oggetti' });
  return { px, mask };
}

/** i parametri sono quelli con cui sono state fatte le maschere? */
export function maschereAggiornate(c: Clip): boolean {
  return !!c.ritaglio && !!c.media && c.ritaglio.firma === firmaRitaglio(c.media, c.ritaglio);
}
