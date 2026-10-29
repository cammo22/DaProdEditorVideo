// Disegna i titoli animati HTML (src/core/titoliHtml.ts) su una tela, fotogramma per fotogramma.
//
// COME SI DISEGNA (e perché così). Un'HTML non si può disegnare su una tela da solo: OffscreenCanvas non sa fare il layout
// del testo HTML/CSS, e le funzioni nuove che lo permetterebbero (html-in-canvas) non ci sono né in WebView2 né in WebKit.
// L'unica strada che c'è in entrambi è: HTML dentro un SVG (`<foreignObject>`), l'SVG diventa un'immagine (`Image` con
// un indirizzo `data:`), l'immagine si disegna sulla tela (`drawImage`). Due conseguenze, e le abbiamo volute:
//  1. Un SVG usato come immagine è un documento a parte, isolato: niente script, niente file esterni, nessun accesso ai
//     caratteri della pagina. Quindi i caratteri (@fontsource e DSEG7, tutti OFL) vengono incorporati nell'SVG come
//     `data:` base64, e le animazioni NON possono essere CSS `animation` o Web Animations (nell'immagine non vanno
//     a un orologio nostro). Il tempo lo diamo noi: a ogni fotogramma si calcola lo stato (funzione pura del tempo,
//     src/core/titoliHtml.ts) e lo si scrive nell'HTML come variabili CSS (`--t`, `--in`, `--out`…) e valori in linea.
//     Per questo monitor ed esportazione danno lo stesso fotogramma: stesso tempo → stesso testo HTML → stessa immagine.
//  2. Il disegno è asincrono (l'immagine va caricata). Il monitor chiede il fotogramma e, se non c'è ancora, mostra l'ultimo
//     che ha e fa preparare i prossimi (`fotogrammaHtml`); l'esportazione li aspetta uno per uno (`preparaStrati`).
// Rete di sicurezza: all'avvio si fa una prova (un quadratino rosso disegnato e riletto). Se il sistema non sa leggere
// i pixel di un SVG con HTML dentro (alcune versioni di WebKit sporcano la tela), si disegna solo la scritta con la tela 2D.
import type { HtmlSpec, Project } from '../core/tipi';
import { CSS_BASE, FONT_HTML, costruisciHtml, firmaHtml, modelloHtml, righeDi, statoHtml, type FotogrammaHtml } from '../core/titoliHtml';
import { nuovaTela } from './grafica';
import type { Strato } from './piano';
import { f2s } from '../core/timecode';

type Tela = HTMLCanvasElement | OffscreenCanvas;

// ——— i caratteri, incorporati nell'SVG ———
const FILE_FONT: Record<string, () => Promise<{ default: string }>> = {
  'dseg7': () => import('../stile/font/DSEG7Classic-Bold.woff2?url'),
  'orbitron-700': () => import('@fontsource/orbitron/files/orbitron-latin-700-normal.woff2?url'),
  'orbitron-900': () => import('@fontsource/orbitron/files/orbitron-latin-900-normal.woff2?url'),
  'rajdhani-500': () => import('@fontsource/rajdhani/files/rajdhani-latin-500-normal.woff2?url'),
  'rajdhani-700': () => import('@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url'),
  'montserrat-500': () => import('@fontsource/montserrat/files/montserrat-latin-500-normal.woff2?url'),
  'montserrat-700': () => import('@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url'),
  'montserrat-900': () => import('@fontsource/montserrat/files/montserrat-latin-900-normal.woff2?url'),
  'oswald-500': () => import('@fontsource/oswald/files/oswald-latin-500-normal.woff2?url'),
  'oswald-700': () => import('@fontsource/oswald/files/oswald-latin-700-normal.woff2?url'),
  'bebas-400': () => import('@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url'),
  'archivo-400': () => import('@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2?url'),
  'mono-700': () => import('@fontsource/space-mono/files/space-mono-latin-700-normal.woff2?url'),
  'playfair-400': () => import('@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2?url'),
  'playfair-700': () => import('@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2?url'),
};

const cssFont = new Map<string, Promise<string>>();

function base64(b: ArrayBuffer): string {
  const u = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** la regola @font-face di un pezzo di carattere, con i byte dentro (una volta sola) */
function regolaFont(chiave: string): Promise<string> {
  let p = cssFont.get(chiave);
  if (!p) {
    const f = FONT_HTML[chiave], carica = FILE_FONT[chiave];
    p = !f || !carica ? Promise.resolve('') : carica()
      .then((m) => fetch(m.default))
      .then((r) => r.arrayBuffer())
      .then((b) => `@font-face{font-family:'${f.famiglia}';font-weight:${f.peso};font-style:normal;src:url(data:font/woff2;base64,${base64(b)}) format('woff2')}`)
      .catch(() => '');
    cssFont.set(chiave, p);
  }
  return p;
}
const cssDeiFont = async (pezzi: string[]) => (await Promise.all(pezzi.map(regolaFont))).join('');

// ——— dall'HTML alla tela ———
function svgDi(corpo: string, css: string, rw: number, rh: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rw}" height="${rh}" viewBox="0 0 ${rw} ${rh}"><foreignObject x="0" y="0" width="${rw}" height="${rh}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${rw}px;height:${rh}px;overflow:hidden"><style><![CDATA[${css}]]></style>${corpo}</div></foreignObject></svg>`;
}

async function rasterizza(svg: string, rw: number, rh: number): Promise<Tela> {
  const img = new Image(rw, rh);
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok();
    img.onerror = () => ko(new Error('Immagine SVG non caricata'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  // WebKit a volte dice «caricata» prima di avere i pixel: decode() aspetta quelli (se manca o fallisce si va avanti)
  try { await img.decode(); } catch { /* si prova lo stesso a disegnare */ }
  const tela = nuovaTela(rw, rh);
  (tela.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0, rw, rh);
  return tela;
}

let prova: Promise<boolean> | null = null;
/** il sistema sa disegnare HTML dentro un SVG e farne una tela leggibile? (si prova una volta sola) */
export function htmlDisponibile(): Promise<boolean> {
  prova ??= (async () => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return false;
    try {
      const t = await rasterizza(svgDi('<div style="width:16px;height:16px;background:#ff0000"></div>', '', 16, 16), 16, 16);
      const px = (t.getContext('2d') as CanvasRenderingContext2D).getImageData(8, 8, 1, 1).data;
      return px[0] > 200 && px[1] < 60 && px[3] > 200;
    } catch { return false; }
  })();
  return prova;
}
/** solo per le prove */
export function azzeraProvaHtml(esito?: boolean) { prova = esito === undefined ? null : Promise.resolve(esito); }

/** il ripiego: solo le scritte, con la tela 2D (se l'HTML non si può disegnare) */
function disegnaRipiego(spec: HtmlSpec, rw: number, rh: number, t: number, d: number): Tela {
  const tela = nuovaTela(rw, rh);
  const c = tela.getContext('2d') as CanvasRenderingContext2D;
  const s = statoHtml(spec, t, d);
  const righe = righeDi(spec);
  const px = rh / 1080;
  c.globalAlpha = Math.max(0, Math.min(1, s.in * s.out));
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  c.shadowColor = 'rgba(0,0,0,.8)';
  c.shadowBlur = 12 * px;
  righe.slice(0, 4).forEach((r, i) => {
    c.font = `700 ${(i ? 56 : 110) * px}px Orbitron, sans-serif`;
    c.fillText(r.slice(0, 60), rw / 2, rh / 2 + (i - (Math.min(righe.length, 4) - 1) / 2) * 120 * px, rw * 0.9);
  });
  return tela;
}

// ——— la cache e il lavoro ———
const BUDGET_BYTE = 200 * 1024 * 1024;
interface Voce { tela: Tela; byte: number }
const cache = new Map<string, Voce>(); // l'ordine di inserimento è l'ordine d'uso (si rimette in fondo a ogni uso)
let usati = 0;
const incorso = new Map<string, Promise<Tela>>();
const scaldati = new Set<string>();

function tieni(chiave: string, tela: Tela, rw: number, rh: number) {
  const byte = rw * rh * 4;
  const prima = cache.get(chiave);
  if (prima) usati -= prima.byte;
  cache.delete(chiave);
  cache.set(chiave, { tela, byte });
  usati += byte;
  while (usati > BUDGET_BYTE && cache.size > 1) {
    const [k, v] = cache.entries().next().value as [string, Voce];
    cache.delete(k);
    usati -= v.byte;
  }
}
const cercata = (chiave: string) => {
  const v = cache.get(chiave);
  if (v) { cache.delete(chiave); cache.set(chiave, v); }
  return v?.tela ?? null;
};
/** quanti fotogrammi ci sono in memoria (per le prove) */
export const fotogrammiInCache = () => cache.size;
export function svuotaCacheHtml() { cache.clear(); usati = 0; incorso.clear(); ultimi.clear(); coda.length = 0; }

/** disegna un fotogramma (asincrono). `chiave` = quella di costruisciHtml: se c'è già in cache o in lavoro non si rifà. */
function disegna(spec: HtmlSpec, fr: FotogrammaHtml, rw: number, rh: number, t: number, d: number): Promise<Tela> {
  const dentro = cercata(fr.chiave);
  if (dentro) return Promise.resolve(dentro);
  let p = incorso.get(fr.chiave);
  if (!p) {
    p = (async () => {
      let tela: Tela;
      if (await htmlDisponibile()) {
        const css = (await cssDeiFont(fr.font)) + CSS_BASE + fr.css;
        const svg = svgDi(fr.corpo, css, rw, rh);
        // la prima volta con un insieme di caratteri nuovo si disegna due volte: il motore a volte ha ancora
        // da decodificare il carattere incorporato e la prima immagine esce col carattere di riserva
        const insieme = fr.font.slice().sort().join(',');
        if (!scaldati.has(insieme)) { scaldati.add(insieme); try { await rasterizza(svg, rw, rh); } catch { /* si riprova sotto */ } }
        try { tela = await rasterizza(svg, rw, rh); } catch { tela = disegnaRipiego(spec, rw, rh, t, d); }
      } else tela = disegnaRipiego(spec, rw, rh, t, d);
      tieni(fr.chiave, tela, rw, rh);
      return tela;
    })().finally(() => { incorso.delete(fr.chiave); });
    incorso.set(fr.chiave, p);
  }
  return p;
}

/** il fotogramma al tempo t (secondi dall'inizio della clip, clip lunga d secondi) su una tela rw×rh: lo aspetta */
export async function preparaHtml(spec: HtmlSpec, rw: number, rh: number, t: number, d: number): Promise<Tela> {
  return disegna(spec, costruisciHtml(spec, rw, rh, t, d), rw, rh, t, d);
}

// ——— il monitor: sincrono, con i prossimi fotogrammi preparati in anticipo ———
interface Lavoro { spec: HtmlSpec; fr: FotogrammaHtml; rw: number; rh: number; t: number; d: number }
const coda: Lavoro[] = [];
let inLavoro = 0;
const CONTEMPORANEI = 2, CODA_MAX = 24;
/** l'ultimo fotogramma mostrato per ogni titolo (finché il nuovo non è pronto si vede questo, niente buchi) */
const ultimi = new Map<string, Tela>();
let alPronto: (() => void) | null = null;
let avvisando = false;
/** chi vuole sapere quando arriva un fotogramma nuovo (il monitor ridisegna) */
export function quandoPronto(fn: (() => void) | null) { alPronto = fn; }
function avvisa() {
  if (avvisando || !alPronto) return;
  avvisando = true;
  setTimeout(() => { avvisando = false; alPronto?.(); }, 16);
}

function pompa() {
  while (inLavoro < CONTEMPORANEI && coda.length) {
    const l = coda.pop()!; // l'ultimo richiesto è il più utile (scorrendo la timeline)
    if (cache.has(l.fr.chiave)) continue;
    inLavoro++;
    void disegna(l.spec, l.fr, l.rw, l.rh, l.t, l.d).then(() => avvisa()).catch(() => undefined).finally(() => { inLavoro--; pompa(); });
  }
}
function metti(l: Lavoro) {
  if (cache.has(l.fr.chiave) || incorso.has(l.fr.chiave) || coda.some((x) => x.fr.chiave === l.fr.chiave)) return;
  coda.push(l);
  if (coda.length > CODA_MAX) coda.splice(0, coda.length - CODA_MAX);
}

/**
 * Per il compositore (sincrono): il fotogramma se è già pronto; se no l'ultimo che c'era per questo titolo (o niente),
 * e intanto si preparano questo e i prossimi `avanti` (a passo `passo` secondi) mentre si riproduce.
 */
export function fotogrammaHtml(spec: HtmlSpec, rw: number, rh: number, t: number, d: number, avanti = 0, passo = 0.04): Tela | null {
  const fr = costruisciHtml(spec, rw, rh, t, d);
  const idTitolo = firmaHtml(spec) + '|' + rw;
  const pronto = cercata(fr.chiave);
  if (pronto) { ultimi.set(idTitolo, pronto); if (ultimi.size > 40) ultimi.delete(ultimi.keys().next().value!); }
  else metti({ spec, fr, rw, rh, t, d });
  for (let i = 1; i <= avanti; i++) {
    const tt = t + i * passo;
    if (tt > d) break;
    metti({ spec, fr: costruisciHtml(spec, rw, rh, tt, d), rw, rh, t: tt, d });
  }
  pompa();
  return pronto ?? ultimi.get(idTitolo) ?? null;
}

// ——— l'esportazione: ogni fotogramma si aspetta ———
/** la misura a cui si disegna un titolo: quella della tela di uscita, mai più grande del progetto */
export function misuraResa(pw: number, ph: number, larghezzaTela: number): { rw: number; rh: number } {
  const rw = Math.max(2, Math.round(Math.min(pw, larghezzaTela)));
  return { rw, rh: Math.max(2, Math.round((rw * ph) / pw)) };
}

/** prepara i titoli HTML degli strati di questo fotogramma (prima di `render`, nell'esportazione e nelle istantanee) */
export async function preparaStrati(p: Project, strati: Strato[], larghezzaTela: number): Promise<void> {
  const { rw, rh } = misuraResa(p.w, p.h, larghezzaTela);
  const lavori: Promise<unknown>[] = [];
  for (const s of strati) {
    for (const src of [s.b, s.a]) {
      const h = src?.clip.kind === 'title' ? src.clip.gen?.html : undefined;
      if (h && src) lavori.push(preparaHtml(h, rw, rh, src.local, f2s(src.clip.len, p.rate)));
    }
  }
  if (lavori.length) await Promise.all(lavori);
}

/** l'anteprima ferma di un modello nella libreria: disegnata davvero, a metà della sua entrata, su una tela piccola */
export async function anteprimaHtml(cv: HTMLCanvasElement, spec: HtmlSpec): Promise<void> {
  const m = modelloHtml(spec.id);
  if (!m) return;
  const tela = await preparaHtml(spec, 384, 216, Math.min(m.durata * 0.45, 2.4), m.durata);
  cv.getContext('2d')?.drawImage(tela as CanvasImageSource, 0, 0, cv.width, cv.height);
}
