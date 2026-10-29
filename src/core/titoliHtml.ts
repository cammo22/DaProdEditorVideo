// I titoli animati HTML: titoli e grafiche fatte con HTML e CSS (stile «vecchio, moderno dentro») che girano dentro l'app.
// Qui sta la parte pura, senza browser: il catalogo dei modelli (campi, durata), lo stato dell'animazione a ogni istante
// (funzione del solo tempo: dato t esce sempre la stessa cosa), la costruzione del fotogramma come testo HTML e la chiave
// con cui si ricorda un fotogramma già disegnato. Il disegno vero (HTML → immagine → tela) sta in src/render/titoliHtml.ts.
// L'idea di scrivere i titoli in HTML e di guidarli col tempo fotogramma per fotogramma, così monitor ed esportazione sono
// identici, viene da HyperFrames (HeyGen, Apache-2.0, https://github.com/heygen-com/hyperframes). Vedi TERZE-PARTI.md.
import type { HtmlSpec, Project } from './tipi';
import type { CampoAnim } from './animazioni';
import { E, caso, clamp01, lerp } from '../render/anim/base';

// ——— i caratteri: solo quelli già nel programma (@fontsource, DSEG7), tutti con licenza OFL ———
export interface FontHtml { famiglia: string; peso: number; ripiego: string }
export const FONT_HTML: Record<string, FontHtml> = {
  'dseg7': { famiglia: 'DSEG7', peso: 700, ripiego: 'monospace' },
  'orbitron-700': { famiglia: 'Orbitron', peso: 700, ripiego: 'sans-serif' },
  'orbitron-900': { famiglia: 'Orbitron', peso: 900, ripiego: 'sans-serif' },
  'rajdhani-500': { famiglia: 'Rajdhani', peso: 500, ripiego: 'sans-serif' },
  'rajdhani-700': { famiglia: 'Rajdhani', peso: 700, ripiego: 'sans-serif' },
  'montserrat-500': { famiglia: 'Montserrat', peso: 500, ripiego: 'sans-serif' },
  'montserrat-700': { famiglia: 'Montserrat', peso: 700, ripiego: 'sans-serif' },
  'montserrat-900': { famiglia: 'Montserrat', peso: 900, ripiego: 'sans-serif' },
  'oswald-500': { famiglia: 'Oswald', peso: 500, ripiego: 'sans-serif' },
  'oswald-700': { famiglia: 'Oswald', peso: 700, ripiego: 'sans-serif' },
  'bebas-400': { famiglia: 'Bebas Neue', peso: 400, ripiego: 'sans-serif' },
  'archivo-400': { famiglia: 'Archivo Black', peso: 400, ripiego: 'sans-serif' },
  'mono-700': { famiglia: 'Space Mono', peso: 700, ripiego: 'monospace' },
  'playfair-400': { famiglia: 'Playfair Display', peso: 400, ripiego: 'serif' },
  'playfair-700': { famiglia: 'Playfair Display', peso: 700, ripiego: 'serif' },
};

/** i caratteri a scelta nel pannello: chiave del campo → i pezzi di font da incorporare */
const SCELTE_FONT: Record<string, { nome: string; pezzi: string[]; peso: number; famiglia: string }> = {
  orbitron: { nome: 'Orbitron (digitale)', pezzi: ['orbitron-700', 'orbitron-900'], peso: 700, famiglia: 'Orbitron' },
  rajdhani: { nome: 'Rajdhani (tecnico)', pezzi: ['rajdhani-500', 'rajdhani-700'], peso: 700, famiglia: 'Rajdhani' },
  montserrat: { nome: 'Montserrat (pulito)', pezzi: ['montserrat-500', 'montserrat-700', 'montserrat-900'], peso: 700, famiglia: 'Montserrat' },
  oswald: { nome: 'Oswald (stretto)', pezzi: ['oswald-500', 'oswald-700'], peso: 700, famiglia: 'Oswald' },
  bebas: { nome: 'Bebas Neue (titoli)', pezzi: ['bebas-400'], peso: 400, famiglia: 'Bebas Neue' },
  archivo: { nome: 'Archivo Black (pesante)', pezzi: ['archivo-400'], peso: 400, famiglia: 'Archivo Black' },
  playfair: { nome: 'Playfair (elegante)', pezzi: ['playfair-400', 'playfair-700'], peso: 700, famiglia: 'Playfair Display' },
  mono: { nome: 'Space Mono (macchina)', pezzi: ['mono-700'], peso: 700, famiglia: 'Space Mono' },
};
const fontScelta = (chiave: string) => SCELTE_FONT[chiave] ?? SCELTE_FONT.orbitron;

// ——— i campi ———
export type ValoreHtml = string | number | boolean;
export type ValoriHtml = Record<string, ValoreHtml>;
const T = (id: string, nome: string, def: string): CampoAnim => ({ id, nome, tipo: 'testo', def });
const L = (id: string, nome: string, def: string): CampoAnim => ({ id, nome, tipo: 'lungo', def });
const N = (id: string, nome: string, def: number, min: number, max: number, step = 1): CampoAnim => ({ id, nome, tipo: 'numero', def, min, max, step });
const C = (id: string, nome: string, def: string): CampoAnim => ({ id, nome, tipo: 'colore', def });
const S = (id: string, nome: string, def: string, scelte: [string, string][]): CampoAnim => ({ id, nome, tipo: 'scelta', def, scelte });
const FONT = (def: string, ammessi: string[] = Object.keys(SCELTE_FONT)): CampoAnim => S('font', 'Carattere', def, ammessi.map((k) => [k, SCELTE_FONT[k].nome] as [string, string]));
/** entrata, uscita e grandezza: ce li hanno tutti i modelli */
const TEMPI = (ent = 0.7, usc = 0.5): CampoAnim[] => [N('ent', 'Entrata (secondi)', ent, 0.1, 4, 0.1), N('usc', 'Uscita (secondi)', usc, 0.1, 4, 0.1)];
const DIM: CampoAnim = N('dim', 'Grandezza', 100, 50, 200, 5);

export type GruppoHtml = 'vecchio' | 'tv' | 'social' | 'cinema' | 'parole' | 'indicare' | 'docu';
export const GRUPPI_HTML: { id: GruppoHtml; nome: string }[] = [
  { id: 'vecchio', nome: 'Vecchio stile' },
  { id: 'tv', nome: 'TV e notizie' },
  { id: 'social', nome: 'Social e logo' },
  { id: 'cinema', nome: 'Cinema e capitoli' },
  { id: 'parole', nome: 'Parole e citazioni' },
  { id: 'indicare', nome: 'Indicare e confrontare' },
  { id: 'docu', nome: 'Documentario e interviste' },
];

/** lo stato dell'animazione a un istante: numeri, tutti calcolati dal solo tempo */
export type StatoHtml = Record<string, number>;

export interface ModelloHtml {
  id: string;
  nome: string;
  gruppo: GruppoHtml;
  info: string;
  /** durata di partenza in secondi */
  durata: number;
  campi: CampoAnim[];
  /** i pezzi di carattere da incorporare per questi valori */
  font: (v: ValoriHtml) => string[];
  /** i numeri in più del modello (oltre a quelli comuni): funzione del solo tempo */
  stato?: (t: number, d: number, v: ValoriHtml, s: StatoHtml) => StatoHtml;
  /** il contenuto, scritto come testo HTML con dentro i numeri dello stato */
  html: (v: ValoriHtml, s: StatoHtml) => string;
  /** il CSS del modello (si legge `var(--in)`, `var(--out)`, `var(--t)`…) */
  css: string;
  /** la scritta da mostrare se il sistema non sa disegnare l'HTML (ripiego semplice) */
  righe: (v: ValoriHtml) => string[];
}

// ——— attrezzi ———
const arrotonda = (x: number) => Math.round(x * 10000) / 10000;
const num = (x: number) => String(arrotonda(Number.isFinite(x) ? x : 0));
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** testo su più righe (a capo → <br>) */
const righeHtml = (s: string) => s.split(/\r?\n/).map(esc).join('<br/>');
/** un colore sicuro per il CSS: solo #rrggbb (se no il valore di riserva) */
export const coloreSicuro = (c: unknown, def: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : def);
const testo = (v: ValoriHtml, k: string, def = '') => (typeof v[k] === 'string' ? (v[k] as string) : def);
const numero = (v: ValoriHtml, k: string, def: number) => { const n = Number(v[k]); return Number.isFinite(n) ? n : def; };
const scelto = (v: ValoriHtml, k: string, ammessi: string[], def: string) => (typeof v[k] === 'string' && ammessi.includes(v[k] as string) ? (v[k] as string) : def);
const col = (v: ValoriHtml, k: string, def: string) => coloreSicuro(v[k], def);
const fam = (v: ValoriHtml, def = 'orbitron') => fontScelta(scelto(v, 'font', Object.keys(SCELTE_FONT), def));
const nomeFont = (v: ValoriHtml, def = 'orbitron') => `'${fam(v, def).famiglia}'`;
const s2 = (x: number) => String(Math.floor(x)).padStart(2, '0');
/** 0 → 1 fra i secondi a e b (con la curva e) */
const fra = (t: number, a: number, b: number, e: (x: number) => number = E.p3out) => e(clamp01((t - a) / Math.max(1e-6, b - a)));

// ——— la freccia che indica un punto: geometria (in pixel del palco, con il punto indicato come origine) ———
const LATI_FRECCIA: Record<string, [number, number]> = { 'alto-sinistra': [-1, -1], 'alto-destra': [1, -1], 'basso-sinistra': [-1, 1], 'basso-destra': [1, 1] };
interface Punto2 { x: number; y: number }
/** la freccia parte da sotto (o sopra) la scritta, scende dritta e poi entra di lato nel segno; la punta guarda il centro */
function geometriaFreccia(lato: string, R: number, forma: string): { S: Punto2; C: Punto2; F: Punto2; E: Punto2; angolo: number; dy: number } {
  const [dx, dy] = LATI_FRECCIA[lato] ?? LATI_FRECCIA['alto-sinistra'];
  const S = { x: dx * (0.9 * R + 300), y: dy * (0.6 * R + 170) };
  const dist = forma === 'rettangolo' ? 1.3 * R + 12 : forma === 'evidenziatore' ? 1.5 * R + 12 : forma === 'nessuna' ? 30 : R + 12;
  const E = { x: dx * dist, y: 0 };
  const angolo = dx < 0 ? 0 : Math.PI;
  // la riga si ferma un po' prima della punta, se no la punta sembrerebbe tozza
  return { S, C: { x: S.x, y: 0 }, F: { x: E.x - Math.cos(angolo) * 30, y: 0 }, E, angolo, dy };
}
/** lunghezza di una curva quadratica (somma di 16 pezzetti dritti): serve per disegnarla piano piano */
function lunghezzaCurva(a: Punto2, c: Punto2, b: Punto2): number {
  let L = 0, p = a;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, u = 1 - t;
    const q = { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
    L += Math.hypot(q.x - p.x, q.y - p.y); p = q;
  }
  return L;
}

// ——— il catalogo ———
export const MODELLI_HTML: ModelloHtml[] = [
  // ————————————————————————— vecchio stile —————————————————————————
  {
    id: 'display7', nome: 'Display a sette segmenti', gruppo: 'vecchio', info: 'un contatore a segmenti rossi che sale, con il vetro e la cornice di metallo', durata: 5,
    campi: [N('da', 'Parte da', 0, 0, 99999999, 1), N('a', 'Arriva a', 1250, 0, 99999999, 1), N('cifre', 'Cifre', 4, 2, 8, 1), T('etichetta', 'Etichetta', 'GIRI AL MINUTO'), C('colore', 'Colore dei segmenti', '#ff4d6d'), ...TEMPI(0.7, 0.5), DIM],
    font: () => ['dseg7', 'rajdhani-700'],
    stato: (t, d, v, s) => {
      const fine = Math.max(0.5, d - s.usc - 0.2), da = numero(v, 'da', 0), a = numero(v, 'a', 0);
      const k = fra(t, s.ent * 0.6, fine, E.p3io);
      // i segmenti si accendono con uno sfarfallio che dura quanto l'entrata
      const luce = t >= s.ent ? 1 : t < s.ent * 0.25 ? 0.15 : caso(Math.floor(t * 30), 3) < t / s.ent ? 1 : 0.35;
      return { valore: Math.round(lerp(da, a, k)), luce };
    },
    html: (v, s) => {
      const n = Math.max(2, Math.min(8, Math.round(numero(v, 'cifre', 4))));
      const val = String(Math.max(0, Math.min(10 ** n - 1, Math.round(s.valore)))).padStart(n, '0');
      return `<div class="d7"><div class="d7-vetro"><span class="d7-spento">${'8'.repeat(n)}</span><span class="d7-acceso" style="opacity:${num(s.luce)}">${val}</span></div>
<div class="d7-et"><i></i>${esc(testo(v, 'etichetta', ''))}</div></div>`;
    },
    css: `.d7{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(calc(var(--dim)*(0.9 + 0.1*var(--in))));opacity:calc(var(--in)*var(--out));padding:34px 46px 24px;border-radius:26px;background:linear-gradient(160deg,#4b4757,#1b1a22 45%,#0e0d13);border:2px solid #6f6b7d;box-shadow:0 30px 70px rgba(0,0,0,.65),inset 0 2px 0 rgba(255,255,255,.18),inset 0 -3px 0 rgba(0,0,0,.6)}
.d7-vetro{position:relative;padding:20px 34px;border-radius:12px;background:#07060b;border:3px solid #000;box-shadow:inset 0 0 40px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.12);font-family:'DSEG7',monospace;font-size:190px;line-height:1;letter-spacing:6px;white-space:nowrap}
.d7-spento{color:var(--c);opacity:.09}
.d7-acceso{position:absolute;left:34px;top:20px;color:var(--c);text-shadow:0 0 14px var(--c),0 0 40px var(--c)}
.d7-et{margin-top:18px;display:flex;align-items:center;gap:14px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:34px;letter-spacing:6px;color:#a19db0;text-transform:uppercase}
.d7-et i{width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:0 0 12px var(--c)}`,
    righe: (v) => [String(numero(v, 'a', 0)), testo(v, 'etichetta')],
  },
  {
    id: 'neon', nome: 'Scritta al neon', gruppo: 'vecchio', info: 'il tubo di vetro si accende a scatti, con l\'alone di luce intorno', durata: 5,
    campi: [L('testo', 'Scritta', 'APERTO'), C('colore', 'Colore', '#ff3df2'), FONT('orbitron', ['orbitron', 'bebas', 'archivo', 'montserrat', 'mono']), ...TEMPI(1.2, 0.5), DIM],
    font: (v) => fam(v).pezzi,
    stato: (t, _d, _v, s) => {
      // accensione a scatti: all'inizio il tubo balbetta, poi resta acceso; un ultimo guizzo a metà tenuta
      const x = clamp01(t / s.ent);
      let luce = t >= s.ent ? 1 : x < 0.12 ? 0 : caso(Math.floor(t * 28), 11) < x * 1.15 ? 1 : 0.12;
      if (t > s.ent + 1.4 && t < s.ent + 1.55) luce = caso(Math.floor(t * 40), 5) < 0.5 ? 0.45 : 1;
      return { luce };
    },
    html: (v, s) => `<div class="nn" style="--lit:${num(s.luce)}"><div class="nn-tubo">${righeHtml(testo(v, 'testo', ''))}</div><div class="nn-luce">${righeHtml(testo(v, 'testo', ''))}</div></div>`,
    css: `.nn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--dim));text-align:center;font-weight:${'${P}'};font-size:170px;line-height:1.15;letter-spacing:8px;text-transform:uppercase;white-space:nowrap;opacity:var(--out)}
.nn-tubo{color:#2a2433;-webkit-text-stroke:2px #4b4757}
.nn-luce{position:absolute;left:0;top:0;width:100%;color:#fff;opacity:var(--lit);text-shadow:0 0 6px var(--c),0 0 18px var(--c),0 0 42px var(--c),0 0 90px var(--c),0 0 160px var(--c)}`,
    righe: (v) => testo(v, 'testo').split(/\r?\n/),
  },
  {
    id: 'rec', nome: 'Mirino videocamera REC', gruppo: 'vecchio', info: 'REC che lampeggia, tempo a sette segmenti, batteria e gli angoli del mirino', durata: 8,
    campi: [T('data', 'Data', '12 GIU 2026'), N('inizio', 'Il tempo parte da (secondi)', 0, 0, 86399, 1), C('colore', 'Colore del REC', '#ff4d6d'), ...TEMPI(0.4, 0.4)],
    font: () => ['dseg7', 'rajdhani-700'],
    stato: (t, _d, v) => { const tot = Math.floor(t + numero(v, 'inizio', 0)); return { sec: tot, lampo: Math.floor(t * 2) % 2 === 0 ? 1 : 0.1 }; },
    html: (v, s) => {
      const tot = Math.floor(s.sec);
      const tc = `${s2(tot / 3600)}:${s2((tot % 3600) / 60)}:${s2(tot % 60)}`;
      return `<div class="rc"><i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i>
<div class="rc-su"><span class="rc-pt" style="opacity:${num(s.lampo)}"></span><b>REC</b><em>${esc(testo(v, 'data', ''))}</em></div>
<div class="rc-gi"><span class="rc-tc"><u>88:88:88</u>${tc}</span><span class="rc-bat"><i></i><i></i><i></i></span></div></div>`;
    },
    css: `.rc{position:absolute;inset:60px;opacity:calc(var(--in)*var(--out));font-family:'Rajdhani',sans-serif;color:#fff}
.rc>i{position:absolute;width:90px;height:90px;border:0 solid #fff}
.rc .a1{left:0;top:0;border-left-width:6px;border-top-width:6px}.rc .a2{right:0;top:0;border-right-width:6px;border-top-width:6px}
.rc .a3{left:0;bottom:0;border-left-width:6px;border-bottom-width:6px}.rc .a4{right:0;bottom:0;border-right-width:6px;border-bottom-width:6px}
.rc-su{position:absolute;left:50px;top:44px;display:flex;align-items:center;gap:20px;font-weight:700;font-size:58px;letter-spacing:4px;text-shadow:0 2px 6px rgba(0,0,0,.8)}
.rc-pt{width:38px;height:38px;border-radius:50%;background:var(--c);box-shadow:0 0 16px var(--c)}
.rc-su em{font-style:normal;font-size:42px;margin-left:30px;color:#dcd8e6}
.rc-gi{position:absolute;left:50px;right:50px;bottom:40px;display:flex;justify-content:space-between;align-items:flex-end}
.rc-tc{position:relative;font-family:'DSEG7',monospace;font-size:78px;color:#fff;text-shadow:0 0 8px rgba(255,255,255,.55);letter-spacing:3px}
.rc-tc u{position:absolute;left:0;top:0;text-decoration:none;color:#fff;opacity:.08}
.rc-bat{display:flex;gap:6px;padding:8px;border:5px solid #fff;border-radius:8px;position:relative}
.rc-bat i{width:26px;height:44px;background:#fff}
.rc-bat:after{content:'';position:absolute;right:-16px;top:18px;width:10px;height:26px;background:#fff;border-radius:0 4px 4px 0}`,
    righe: (v) => ['REC', testo(v, 'data')],
  },
  {
    id: 'vu', nome: 'Vumetro a lancetta', gruppo: 'vecchio', info: 'il quadrante di una vecchia centralina, con la lancetta che balla a tempo', durata: 6,
    campi: [T('etichetta', 'Etichetta', 'LIVELLO'), N('livello', 'Quanto balla', 70, 10, 100, 5), C('colore', 'Colore della lancetta', '#ff4d6d'), C('carta', 'Colore del quadrante', '#f1e7c4'), ...TEMPI(0.6, 0.5), DIM],
    font: () => ['rajdhani-700'],
    stato: (t, _d, v, s) => {
      // la lancetta: somma di onde che non si ripetono mai uguali; all'inizio sale da zero con un po' di rimbalzo
      const liv = numero(v, 'livello', 70) / 100;
      const onda = 0.5 + 0.28 * Math.sin(t * 5.1) + 0.16 * Math.sin(t * 11.3 + 1.7) + 0.08 * Math.sin(t * 23.9 + 0.4);
      const sale = fra(t, 0, s.ent + 0.4, E.back(2.4));
      return { ago: clamp01(Math.max(0, onda) * liv * sale + 0.02) };
    },
    html: (v, s) => {
      const gradi = -50 + 100 * s.ago;
      let tacche = '';
      for (let i = 0; i <= 20; i++) {
        const a = ((-50 + i * 5) * Math.PI) / 180, lungo = i % 5 === 0 ? 26 : 14, r1 = 250, r2 = r1 - lungo;
        const rosso = i >= 15;
        tacche += `<line x1="${num(300 + Math.sin(a) * r1)}" y1="${num(330 - Math.cos(a) * r1)}" x2="${num(300 + Math.sin(a) * r2)}" y2="${num(330 - Math.cos(a) * r2)}" stroke="${rosso ? '#c4242a' : '#2a2433'}" stroke-width="${i % 5 === 0 ? 5 : 3}"/>`;
      }
      return `<div class="vu"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400"><defs><linearGradient id="vuc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col(v, 'carta', '#f1e7c4')}"/><stop offset="1" stop-color="#cdbf94"/></linearGradient></defs>
<rect x="6" y="6" width="588" height="388" rx="26" fill="#1b1a22" stroke="#6f6b7d" stroke-width="6"/><rect x="26" y="26" width="548" height="348" rx="14" fill="url(#vuc)"/>
<path d="M ${num(300 + Math.sin(0.2618) * 250)} ${num(330 - Math.cos(0.2618) * 250)} A 250 250 0 0 1 ${num(300 + Math.sin(0.8727) * 250)} ${num(330 - Math.cos(0.8727) * 250)}" fill="none" stroke="#c4242a" stroke-width="10" opacity=".85"/>
${tacche}<text x="300" y="165" text-anchor="middle" font-family="'Rajdhani'" font-weight="700" font-size="60" fill="#2a2433" letter-spacing="8">VU</text>
<text x="300" y="368" text-anchor="middle" font-family="'Rajdhani'" font-weight="700" font-size="24" fill="#4b4757" letter-spacing="6">${esc(testo(v, 'etichetta', '').toUpperCase())}</text>
<g transform="rotate(${num(gradi)} 300 330)"><line x1="300" y1="338" x2="300" y2="92" stroke="${col(v, 'colore', '#ff4d6d')}" stroke-width="5" stroke-linecap="round"/></g>
<circle cx="300" cy="332" r="22" fill="#2a2433" stroke="#6f6b7d" stroke-width="4"/></svg></div>`;
    },
    css: `.vu{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(calc(var(--dim)*1.25*(0.92 + 0.08*var(--in))));opacity:calc(var(--in)*var(--out));filter:drop-shadow(0 24px 40px rgba(0,0,0,.6))}.vu svg{display:block}`,
    righe: (v) => ['VU', testo(v, 'etichetta')],
  },

  // ————————————————————————— TV e notizie —————————————————————————
  {
    id: 'terzo', nome: 'Terzo inferiore · nome e ruolo', gruppo: 'tv', info: 'la barra scorre e svela il nome e sotto il ruolo', durata: 5,
    campi: [T('nome', 'Nome', 'Mario Rossi'), T('ruolo', 'Ruolo', 'Regista'), C('colore', 'Colore della barra', '#ffd54a'), S('lato', 'Dove sta', 'sinistra', [['sinistra', 'A sinistra'], ['destra', 'A destra']]), FONT('rajdhani', ['rajdhani', 'montserrat', 'oswald', 'orbitron']), ...TEMPI(0.8, 0.5), DIM],
    font: (v) => fam(v, 'rajdhani').pezzi,
    stato: (t, d, _v, s) => ({ nome: fra(t, 0.15, 0.15 + s.ent), ruolo: fra(t, 0.4, 0.4 + s.ent), barra: fra(t, 0, s.ent * 0.8, E.p4out) }),
    html: (v, s) => {
      const destra = scelto(v, 'lato', ['sinistra', 'destra'], 'sinistra') === 'destra';
      return `<div class="tz ${destra ? 'dx' : ''}" style="--b:${num(s.barra)};--n:${num(s.nome)};--r:${num(s.ruolo)}"><i class="tz-barra"></i><div class="tz-testi"><div class="tz-nome"><span>${esc(testo(v, 'nome', ''))}</span></div><div class="tz-ruolo"><span>${esc(testo(v, 'ruolo', ''))}</span></div></div></div>`;
    },
    css: `.tz{position:absolute;left:110px;bottom:150px;display:flex;align-items:stretch;gap:26px;transform:scale(var(--dim));transform-origin:0 100%;opacity:var(--out)}
.tz.dx{left:auto;right:110px;flex-direction:row-reverse;transform-origin:100% 100%;text-align:right}
.tz-barra{width:14px;background:var(--c);box-shadow:0 0 22px var(--c);transform:scaleY(var(--b));transform-origin:50% 100%}
.tz-testi{padding:14px 40px 16px 8px;background:linear-gradient(90deg,rgba(9,8,13,.86),rgba(9,8,13,.0));clip-path:inset(0 calc((1 - var(--b))*100%) 0 0)}
.tz.dx .tz-testi{padding:14px 8px 16px 40px;background:linear-gradient(270deg,rgba(9,8,13,.86),rgba(9,8,13,.0));clip-path:inset(0 0 0 calc((1 - var(--b))*100%))}
.tz-nome{font-weight:700;font-size:84px;line-height:1.05;letter-spacing:2px;color:#fff;text-transform:uppercase;overflow:hidden}
.tz-nome span{display:block;transform:translateY(calc((1 - var(--n))*100%));opacity:var(--n)}
.tz-ruolo{font-weight:500;font-size:46px;letter-spacing:6px;color:var(--c);text-transform:uppercase;overflow:hidden}
.tz-ruolo span{display:block;transform:translateY(calc((1 - var(--r))*100%));opacity:var(--r)}`,
    righe: (v) => [testo(v, 'nome'), testo(v, 'ruolo')],
  },
  {
    id: 'notizie', nome: 'Sottopancia notizie', gruppo: 'tv', info: 'la targhetta rossa «ultim\'ora», la fascia col titolo e la sigla del canale', durata: 6,
    campi: [T('etichetta', 'Targhetta', 'ULTIM\'ORA'), L('titolo', 'Titolo', 'DaProd Editor Video: il montaggio vecchio stile, moderno dentro'), T('sigla', 'Sigla del canale', 'DAPROD NEWS'), C('colore', 'Colore della targhetta', '#d2202a'), ...TEMPI(0.7, 0.5), DIM],
    font: () => ['oswald-500', 'oswald-700', 'rajdhani-700'],
    stato: (t, _d, _v, s) => ({ fascia: fra(t, 0, s.ent, E.p4out), testo: fra(t, 0.3, 0.3 + s.ent), targa: fra(t, 0.1, 0.1 + s.ent * 0.8, E.back(1.6)) }),
    html: (v, s) => `<div class="nt" style="--f:${num(s.fascia)};--x:${num(s.testo)};--g:${num(s.targa)}"><div class="nt-targa"><b>${esc(testo(v, 'etichetta', ''))}</b></div><div class="nt-fascia"><div class="nt-titolo"><span>${righeHtml(testo(v, 'titolo', ''))}</span></div><div class="nt-sigla">${esc(testo(v, 'sigla', ''))}</div></div></div>`,
    css: `.nt{position:absolute;left:0;right:0;bottom:90px;transform:scale(var(--dim));transform-origin:50% 100%;opacity:var(--out)}
.nt-targa{display:inline-block;margin-left:90px;padding:6px 34px;background:var(--c);color:#fff;font-family:'Oswald',sans-serif;font-weight:700;font-size:44px;letter-spacing:5px;transform:translateY(calc((1 - var(--g))*60px));opacity:var(--g)}
.nt-fascia{display:flex;align-items:center;justify-content:space-between;gap:40px;padding:20px 90px;background:linear-gradient(180deg,#f5f3fa,#d8d4e2);transform:translateX(calc((1 - var(--f))*-100%))}
.nt-titolo{font-family:'Oswald',sans-serif;font-weight:500;font-size:60px;line-height:1.1;color:#14131a;overflow:hidden}
.nt-titolo span{display:block;opacity:var(--x);transform:translateY(calc((1 - var(--x))*40px))}
.nt-sigla{flex:none;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:36px;letter-spacing:5px;color:var(--c)}`,
    righe: (v) => [testo(v, 'etichetta'), testo(v, 'titolo')],
  },
  {
    id: 'ticker', nome: 'Ticker scorrevole', gruppo: 'tv', info: 'la fascia in basso con la sigla fissa e il testo che scorre da destra a sinistra', durata: 10,
    campi: [T('sigla', 'Sigla', 'DAPROD'), L('testo', 'Testo che scorre', 'Il montaggio vecchio stile, moderno dentro   ///   Tutto resta sul tuo computer   ///   Niente account, niente chiavi'), N('velocita', 'Velocità (pixel al secondo)', 220, 60, 700, 10), C('colore', 'Colore della sigla', '#ffd54a'), S('posto', 'Dove sta', 'basso', [['basso', 'In basso'], ['alto', 'In alto']]), ...TEMPI(0.5, 0.4)],
    font: () => ['rajdhani-500', 'rajdhani-700', 'oswald-500'],
    stato: (t, _d, v) => ({ x: t * numero(v, 'velocita', 220) }),
    html: (v, s) => {
      const uno = testo(v, 'testo', '').replace(/\s*\r?\n\s*/g, '   ///   ');
      // il testo si ripete abbastanza da riempire tutto il tempo (stima della larghezza: 28 pixel a lettera)
      const larghezza = Math.max(1, uno.length * 28 + 200);
      const volte = Math.max(1, Math.min(40, Math.ceil((s.xMax + 2200) / larghezza)));
      const alto = scelto(v, 'posto', ['basso', 'alto'], 'basso') === 'alto';
      return `<div class="tk ${alto ? 'su' : ''}"><div class="tk-sigla">${esc(testo(v, 'sigla', ''))}</div><div class="tk-corsa"><div class="tk-nastro" style="transform:translateX(${num(-s.x)}px)">${(esc(uno) + '<i></i>').repeat(volte)}</div></div></div>`;
    },
    css: `.tk{position:absolute;left:0;right:0;bottom:0;height:120px;display:flex;background:#0d0c12;border-top:4px solid var(--c);transform:translateY(calc((1 - var(--in))*130px));opacity:var(--out);font-family:'Rajdhani',sans-serif}
.tk.su{bottom:auto;top:0;border-top:0;border-bottom:4px solid var(--c);transform:translateY(calc((1 - var(--in))*-130px))}
.tk-sigla{flex:none;display:flex;align-items:center;padding:0 54px;background:var(--c);color:#14131a;font-weight:700;font-size:56px;letter-spacing:6px;z-index:2;box-shadow:8px 0 24px rgba(0,0,0,.5)}
.tk-corsa{position:relative;flex:1;overflow:hidden}
.tk-nastro{position:absolute;left:100%;top:0;height:100%;display:flex;align-items:center;white-space:pre;font-weight:500;font-size:54px;color:#ebe7f4;letter-spacing:2px}
.tk-nastro i{display:inline-block;width:200px}`,
    righe: (v) => [testo(v, 'sigla'), testo(v, 'testo')],
  },
  {
    id: 'conto', nome: 'Conto alla rovescia', gruppo: 'tv', info: 'un numero grande per volta, l\'anello che si svuota e la scritta finale', durata: 6,
    campi: [N('da', 'Parte da', 5, 2, 30, 1), T('finale', 'Scritta alla fine', 'VIA!'), C('colore', 'Colore', '#ffd54a'), S('stile', 'Numeri', 'led', [['led', 'A segmenti'], ['pieno', 'Pieni (Orbitron)']]), ...TEMPI(0.3, 0.4)],
    font: (v) => (scelto(v, 'stile', ['led', 'pieno'], 'led') === 'led' ? ['dseg7', 'orbitron-900'] : ['orbitron-900']),
    stato: (t, _d, v) => {
      const da = Math.max(2, Math.round(numero(v, 'da', 5)));
      const sec = Math.floor(t + 1e-9);
      const n = da - sec;
      const f = t - sec; // dove siamo dentro il secondo
      return { n, f, anello: n >= 1 ? 1 - f : 0, colpo: n >= 1 ? E.p3out(clamp01(f / 0.35)) : E.back(2)(clamp01((t - da) / 0.5)) };
    },
    html: (v, s) => {
      const led = scelto(v, 'stile', ['led', 'pieno'], 'led') === 'led';
      const fine = s.n < 1;
      const circonferenza = 2 * Math.PI * 330;
      return `<div class="cn"><svg xmlns="http://www.w3.org/2000/svg" class="cn-anello" viewBox="0 0 720 720" width="720" height="720"><circle cx="360" cy="360" r="330" fill="rgba(9,8,13,.55)" stroke="#2a2433" stroke-width="18"/><circle cx="360" cy="360" r="330" fill="none" stroke="${col(v, 'colore', '#ffd54a')}" stroke-width="18" stroke-linecap="round" stroke-dasharray="${num(circonferenza)}" stroke-dashoffset="${num(circonferenza * (1 - s.anello))}" transform="rotate(-90 360 360)"/></svg>
<div class="cn-num ${led ? 'led' : ''} ${fine ? 'fine' : ''}" style="transform:translate(-50%,-50%) scale(${num(0.7 + 0.3 * s.colpo)});opacity:${num(Math.min(1, 0.2 + s.colpo))}">${fine ? esc(testo(v, 'finale', 'VIA!')) : String(Math.max(1, s.n))}</div></div>`;
    },
    css: `.cn{position:absolute;left:50%;top:50%;width:720px;height:720px;margin:-360px 0 0 -360px;transform:scale(calc(var(--dim,1)*(0.9 + 0.1*var(--in))));opacity:calc(var(--in)*var(--out))}
.cn-anello{position:absolute;left:0;top:0}
.cn-num{position:absolute;left:50%;top:50%;font-family:'Orbitron',sans-serif;font-weight:900;font-size:360px;line-height:1;color:var(--c);text-shadow:0 0 30px var(--c)}
.cn-num.led{font-family:'DSEG7',monospace;font-weight:700;font-size:330px}
.cn-num.fine{font-family:'Orbitron',sans-serif;font-weight:900;font-size:190px;white-space:nowrap}`,
    righe: (v) => [String(numero(v, 'da', 5)), testo(v, 'finale')],
  },

  // ————————————————————————— social e logo —————————————————————————
  {
    id: 'iscriviti', nome: 'Iscriviti e mi piace', gruppo: 'social', info: 'il pulsante si preme, diventa «iscritto» e la campanella suona; il pollice sale', durata: 6,
    campi: [T('nome', 'Nome del canale', 'DaProd'), T('etichetta', 'Pulsante', 'ISCRIVITI'), T('dopo', 'Pulsante dopo il clic', 'ISCRITTO'), N('clic', 'Secondo del clic', 1.8, 0.5, 8, 0.1), C('colore', 'Colore del pulsante', '#ff2d4a'), ...TEMPI(0.7, 0.5), DIM],
    font: () => ['rajdhani-700', 'montserrat-700'],
    stato: (t, _d, v, s) => {
      const clic = numero(v, 'clic', 1.8);
      const premuto = t >= clic ? 1 : 0;
      const giu = t < clic || t > clic + 0.25 ? 0 : 1 - Math.abs((t - clic) / 0.125 - 1);
      // la campanella dondola dopo il clic con un'oscillazione che si smorza
      const dopo = Math.max(0, t - clic - 0.15);
      const campana = premuto ? Math.sin(dopo * 22) * 24 * Math.exp(-dopo * 2.2) : 0;
      return { premuto, giu, campana, pollice: fra(t, clic + 0.6, clic + 1.3, E.back(2)) };
    },
    html: (v, s) => {
      const nome = testo(v, 'nome', '');
      const si = s.premuto > 0;
      return `<div class="is"><div class="is-av">${esc(nome.trim().charAt(0).toUpperCase() || 'D')}</div><div class="is-nome">${esc(nome)}</div>
<div class="is-btn ${si ? 'si' : ''}" style="transform:scale(${num(1 - 0.08 * s.giu)})">${esc(si ? testo(v, 'dopo', '') : testo(v, 'etichetta', ''))}</div>
<svg xmlns="http://www.w3.org/2000/svg" class="is-camp" viewBox="0 0 64 64" width="84" height="84" style="transform:rotate(${num(s.campana)}deg)"><path d="M32 6c-3 0-5 2-5 5-8 2-13 9-13 18v10l-6 8h48l-6-8V29c0-9-5-16-13-18 0-3-2-5-5-5z" fill="${si ? '#ffd54a' : '#a19db0'}"/><circle cx="32" cy="55" r="6" fill="${si ? '#ffd54a' : '#a19db0'}"/></svg>
<svg xmlns="http://www.w3.org/2000/svg" class="is-poll" viewBox="0 0 64 64" width="84" height="84" style="opacity:${num(clamp01(s.pollice))};transform:translateY(${num((1 - s.pollice) * 30)}px) scale(${num(0.6 + 0.4 * s.pollice)})"><path d="M8 28h12v28H8zM24 28l10-20c4 0 7 3 6 7l-2 9h16c3 0 5 3 4 6l-5 20c-1 3-3 4-6 4H24z" fill="#35e8ff"/></svg></div>`;
    },
    css: `.is{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(calc(var(--dim)*(0.85 + 0.15*var(--in))));display:flex;align-items:center;gap:30px;padding:26px 40px;border-radius:90px;background:rgba(22,17,36,.82);border:2px solid rgba(255,255,255,.22);box-shadow:0 24px 60px rgba(0,0,0,.55);opacity:calc(var(--in)*var(--out));font-family:'Rajdhani',sans-serif}
.is-av{width:104px;height:104px;border-radius:50%;background:linear-gradient(135deg,#ffd54a,#ff3df2);color:#14131a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:64px}
.is-nome{font-weight:700;font-size:70px;color:#fff;letter-spacing:2px}
.is-btn{padding:16px 46px;border-radius:14px;background:var(--c);color:#fff;font-weight:700;font-size:54px;letter-spacing:4px;box-shadow:0 6px 0 rgba(0,0,0,.35)}
.is-btn.si{background:#4b4757;color:#ebe7f4}
.is-camp,.is-poll{flex:none;transform-origin:50% 12%}`,
    righe: (v) => [testo(v, 'nome'), testo(v, 'etichetta')],
  },
  {
    id: 'logo', nome: 'Logo che entra', gruppo: 'social', info: 'il marchio gira ed entra con un rimbalzo, un riflesso lo attraversa e il nome si apre sotto', durata: 5,
    campi: [T('sigla', 'Sigla nel marchio', 'DaP'), T('nome', 'Nome sotto', 'DaProd Editor Video'), C('colore', 'Colore', '#ffd54a'), C('colore2', 'Secondo colore', '#ff3df2'), ...TEMPI(0.9, 0.5), DIM],
    font: () => ['orbitron-900', 'rajdhani-700'],
    stato: (t, _d, _v, s) => ({ gira: fra(t, 0, s.ent + 0.3, E.back(1.8)), brilla: fra(t, s.ent * 0.8, s.ent * 0.8 + 0.9, E.p2io), nome: fra(t, s.ent * 0.6, s.ent * 0.6 + 0.8) }),
    html: (v, s) => `<div class="lg" style="--g:${num(s.gira)};--sh:${num(s.brilla)};--nm:${num(s.nome)}"><div class="lg-marchio"><span>${esc(testo(v, 'sigla', ''))}</span><i></i></div><div class="lg-nome">${esc(testo(v, 'nome', ''))}</div></div>`,
    css: `.lg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--dim));display:flex;flex-direction:column;align-items:center;gap:36px;opacity:var(--out)}
.lg-marchio{position:relative;overflow:hidden;width:330px;height:330px;border-radius:74px;background:linear-gradient(135deg,var(--c),var(--c2));display:flex;align-items:center;justify-content:center;transform:rotate(calc((1 - var(--g))*-200deg)) scale(var(--g));opacity:calc(var(--g)*3);box-shadow:0 0 70px var(--c2),inset 0 3px 0 rgba(255,255,255,.4),inset 0 -6px 0 rgba(0,0,0,.25)}
.lg-marchio span{font-family:'Orbitron',sans-serif;font-weight:900;font-size:150px;color:#14131a;letter-spacing:-4px}
.lg-marchio i{position:absolute;top:-20%;bottom:-20%;width:90px;left:calc(-30% + var(--sh)*150%);background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.75),rgba(255,255,255,0));transform:skewX(-20deg)}
.lg-nome{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:88px;letter-spacing:calc(var(--nm)*16px);color:#fff;text-transform:uppercase;opacity:var(--nm);white-space:nowrap}`,
    righe: (v) => [testo(v, 'sigla'), testo(v, 'nome')],
  },

  // ————————————————————————— cinema e capitoli —————————————————————————
  {
    id: 'cinema', nome: 'Titolo cinema', gruppo: 'cinema', info: 'le lettere si aprono piano, due filetti si allungano e sotto compare la riga piccola', durata: 6,
    campi: [T('titolo', 'Titolo', 'LA CITTÀ'), T('sotto', 'Riga sotto', 'un film di DaProd · 2026'), C('colore', 'Colore', '#ffffff'), C('filetto', 'Colore dei filetti', '#ffd54a'), FONT('playfair', ['playfair', 'bebas', 'oswald', 'montserrat']), ...TEMPI(1.4, 0.7), DIM],
    font: (v) => [...fam(v, 'playfair').pezzi, 'rajdhani-500'],
    stato: (t, _d, _v, s) => ({ apre: fra(t, 0, s.ent + 0.6, E.p3out), filetto: fra(t, 0.2, s.ent + 0.2, E.p4out), sotto: fra(t, s.ent * 0.7, s.ent * 0.7 + 0.8) }),
    html: (v, s) => `<div class="ci" style="--ap:${num(s.apre)};--fl:${num(s.filetto)};--sb:${num(s.sotto)}"><i class="ci-f"></i><div class="ci-titolo">${esc(testo(v, 'titolo', ''))}</div><i class="ci-f"></i><div class="ci-sotto">${esc(testo(v, 'sotto', ''))}</div></div>`,
    css: `.ci{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--dim));display:flex;flex-direction:column;align-items:center;gap:30px;opacity:var(--out);text-align:center}
.ci-titolo{font-weight:${'${P}'};font-size:190px;line-height:1;color:var(--c);white-space:nowrap;letter-spacing:calc((1 - var(--ap))*0.9em + 0.12em);opacity:var(--ap);text-shadow:0 6px 40px rgba(0,0,0,.6)}
.ci-f{display:block;height:3px;width:calc(var(--fl)*980px);background:linear-gradient(90deg,transparent,var(--c2),transparent)}
.ci-sotto{font-family:'Rajdhani',sans-serif;font-weight:500;font-size:50px;letter-spacing:12px;color:#dcd8e6;text-transform:uppercase;opacity:var(--sb);transform:translateY(calc((1 - var(--sb))*20px))}`,
    righe: (v) => [testo(v, 'titolo'), testo(v, 'sotto')],
  },
  {
    id: 'capitolo', nome: 'Cartello capitolo', gruppo: 'cinema', info: 'una fascia scura con il numero grande, la parola «capitolo» e il titolo che scorre', durata: 5,
    campi: [T('parola', 'Parola', 'CAPITOLO'), T('numero', 'Numero', '02'), T('titolo', 'Titolo', 'Il viaggio comincia'), C('colore', 'Colore', '#ffd54a'), FONT('orbitron', ['orbitron', 'bebas', 'oswald', 'montserrat']), ...TEMPI(0.9, 0.6)],
    font: (v) => [...fam(v).pezzi, 'rajdhani-500'],
    stato: (t, _d, _v, s) => ({ fascia: fra(t, 0, s.ent * 0.8, E.p4out), numero: fra(t, s.ent * 0.3, s.ent * 0.3 + 0.7, E.back(1.6)), titolo: fra(t, s.ent * 0.6, s.ent * 0.6 + 0.7) }),
    html: (v, s) => `<div class="cp" style="--fa:${num(s.fascia)};--nu:${num(s.numero)};--ti:${num(s.titolo)}"><div class="cp-fascia"><div class="cp-num">${esc(testo(v, 'numero', ''))}</div><div class="cp-testi"><div class="cp-par">${esc(testo(v, 'parola', ''))}</div><div class="cp-tit"><span>${esc(testo(v, 'titolo', ''))}</span></div></div></div></div>`,
    css: `.cp{position:absolute;left:0;right:0;top:50%;height:360px;margin-top:-180px;opacity:var(--out)}
.cp-fascia{position:absolute;inset:0;display:flex;align-items:center;gap:70px;padding:0 160px;background:linear-gradient(90deg,rgba(9,8,13,.92),rgba(9,8,13,.78));border-top:4px solid var(--c);border-bottom:4px solid var(--c);clip-path:inset(calc((1 - var(--fa))*50%) 0 calc((1 - var(--fa))*50%) 0)}
.cp-num{font-weight:${'${P}'};font-size:250px;line-height:1;color:transparent;-webkit-text-stroke:5px var(--c);transform:scale(calc(0.6 + 0.4*var(--nu)));opacity:var(--nu)}
.cp-par{font-family:'Rajdhani',sans-serif;font-weight:500;font-size:48px;letter-spacing:14px;color:var(--c);text-transform:uppercase;opacity:var(--ti)}
.cp-tit{overflow:hidden;font-weight:${'${P}'};font-size:100px;line-height:1.15;color:#fff;white-space:nowrap}
.cp-tit span{display:block;transform:translateX(calc((1 - var(--ti))*-120px));opacity:var(--ti)}`,
    righe: (v) => [testo(v, 'parola') + ' ' + testo(v, 'numero'), testo(v, 'titolo')],
  },

  // ————————————————————————— parole e citazioni —————————————————————————
  {
    id: 'citazione', nome: 'Citazione con virgolette', gruppo: 'parole', info: 'le virgolette grandi entrano con un rimbalzo, la frase si apre e sotto compare chi l\'ha detta', durata: 7,
    campi: [L('testo', 'Frase', 'Il montaggio vecchio stile, moderno dentro.'), T('autore', 'Chi l\'ha detta', 'Cammo'), C('colore', 'Colore delle virgolette', '#ffd54a'), FONT('playfair', ['playfair', 'montserrat', 'oswald', 'rajdhani', 'bebas']), ...TEMPI(1, 0.6), DIM],
    font: (v) => [...fam(v, 'playfair').pezzi, 'rajdhani-700'],
    stato: (t, _d, _v, s) => ({ virgolette: fra(t, 0, s.ent * 0.8, E.back(1.8)), frase: fra(t, s.ent * 0.3, s.ent * 1.3), filetto: fra(t, s.ent * 0.7, s.ent * 0.7 + 0.7, E.p4out), autore: fra(t, s.ent * 0.9, s.ent * 0.9 + 0.7) }),
    html: (v, s) => {
      const a = testo(v, 'autore', '').trim();
      return `<div class="qt" style="--vq:${num(s.virgolette)};--tx:${num(s.frase)};--fl:${num(s.filetto)};--au:${num(s.autore)}"><div class="qt-v">“</div><div class="qt-testo">${righeHtml(testo(v, 'testo', ''))}</div>${a ? `<i class="qt-f"></i><div class="qt-autore">${esc(a)}</div>` : ''}</div>`;
    },
    css: `.qt{position:absolute;left:50%;top:50%;width:1300px;transform:translate(-50%,-50%) scale(var(--dim));text-align:center;opacity:var(--out)}
.qt-v{height:150px;font-weight:${'${P}'};font-size:300px;line-height:1;color:var(--c);opacity:var(--vq);transform:scale(calc(0.5 + 0.5*var(--vq)));text-shadow:0 0 50px rgba(0,0,0,.5)}
.qt-testo{font-weight:${'${P}'};font-size:84px;line-height:1.25;color:#fff;opacity:var(--tx);transform:translateY(calc((1 - var(--tx))*40px));text-shadow:0 4px 30px rgba(0,0,0,.6)}
.qt-f{display:block;margin:44px auto 22px;height:4px;width:calc(var(--fl)*220px);background:var(--c)}
.qt-autore{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:44px;letter-spacing:8px;color:var(--c);text-transform:uppercase;opacity:var(--au)}`,
    righe: (v) => [testo(v, 'testo'), testo(v, 'autore')],
  },
  {
    id: 'karaoke', nome: 'Sottotitolo karaoke', gruppo: 'parole', info: 'la frase in basso, parola per parola: ogni parola si colora mentre arriva il suo momento', durata: 6,
    campi: [L('testo', 'Frase', 'Il montaggio vecchio stile, moderno dentro'), N('velocita', 'Parole al secondo', 2.5, 0.5, 8, 0.5), C('colore', 'Colore della parola', '#ffd54a'), S('fascia', 'Fascia dietro', 'scura', [['scura', 'Scura'], ['nessuna', 'Nessuna']]), FONT('montserrat', ['montserrat', 'rajdhani', 'oswald', 'orbitron', 'bebas', 'archivo']), ...TEMPI(0.4, 0.4), DIM],
    font: (v) => fam(v, 'montserrat').pezzi,
    stato: (t, _d, v, s) => ({ pos: Math.max(0, t - s.ent * 0.5) * numero(v, 'velocita', 2.5) }),
    html: (v, s) => {
      const parole = testo(v, 'testo', '').split(/\s+/).filter(Boolean).slice(0, 60);
      const fascia = scelto(v, 'fascia', ['scura', 'nessuna'], 'scura') === 'scura';
      const w = parole.map((p, i) => { const k = clamp01(s.pos - i), e = esc(p); return `<span class="kw" style="--k:${num(k)};--a:${num(Math.sin(Math.PI * k))}"><u>${e}</u><b>${e}</b></span>`; }).join(' ');
      return `<div class="ka ${fascia ? 'f' : ''}"><div class="ka-riga">${w}</div></div>`;
    },
    css: `.ka{position:absolute;left:50%;bottom:140px;width:1500px;transform:translateX(-50%) scale(var(--dim));transform-origin:50% 100%;text-align:center;opacity:calc(var(--in)*var(--out))}
.ka-riga{display:inline-block;max-width:1400px;padding:20px 48px 26px;border-radius:28px;font-weight:${'${P}'};font-size:78px;line-height:1.3;letter-spacing:1px}
.ka.f .ka-riga{background:rgba(9,8,13,.8);box-shadow:0 18px 50px rgba(0,0,0,.5)}
.kw{position:relative;display:inline-block;transform:scale(calc(1 + 0.12*var(--a)))}
.kw u{text-decoration:none;color:#fff;opacity:calc(0.6*(1 - var(--k)) + 0.01);text-shadow:0 3px 14px rgba(0,0,0,.7)}
.kw b{position:absolute;left:0;top:0;font-weight:inherit;color:var(--c);white-space:nowrap;clip-path:inset(-20% calc((1 - var(--k))*100%) -20% 0);text-shadow:0 0 18px var(--c)}`,
    righe: (v) => [testo(v, 'testo')],
  },
  {
    id: 'macchina', nome: 'Macchina da scrivere', gruppo: 'parole', info: 'le lettere arrivano una per volta, col cursore che lampeggia in fondo', durata: 7,
    campi: [L('testo', 'Testo', 'Un vecchio banco.\nUna tecnologia nuova.\nTutto sul tuo computer.'), N('velocita', 'Lettere al secondo', 16, 4, 60, 1), C('colore', 'Colore del cursore', '#ffd54a'), S('fascia', 'Fondo', 'scuro', [['scuro', 'Fascia scura'], ['nessuno', 'Solo il testo']]), FONT('mono', ['mono', 'rajdhani', 'orbitron', 'montserrat']), ...TEMPI(0.4, 0.5), DIM],
    font: (v) => fam(v, 'mono').pezzi,
    stato: (t, _d, v, s) => {
      const tot = Array.from(testo(v, 'testo', '')).length;
      const car = Math.min(tot, Math.floor(Math.max(0, t - s.ent * 0.5) * numero(v, 'velocita', 16)));
      // mentre scrive il cursore resta acceso; prima e dopo lampeggia
      return { car, luce: car > 0 && car < tot ? 1 : Math.floor(t * 2.2) % 2 === 0 ? 1 : 0 };
    },
    html: (v, s) => {
      const lett = Array.from(testo(v, 'testo', '')), car = Math.round(s.car);
      const fascia = scelto(v, 'fascia', ['scuro', 'nessuno'], 'scuro') === 'scuro';
      // il resto del testo c'è già ma è invisibile: così la fascia non cambia misura mentre si scrive
      return `<div class="mc ${fascia ? '' : 'nu'}"><div class="mc-testo"><span>${righeHtml(lett.slice(0, car).join(''))}</span><i class="mc-cur"><u style="opacity:${num(s.luce)}"></u></i><span class="mc-resto">${righeHtml(lett.slice(car).join(''))}</span></div></div>`;
    },
    css: `.mc{position:absolute;left:50%;top:50%;width:1300px;transform:translate(-50%,-50%) scale(var(--dim));opacity:calc(var(--in)*var(--out))}
.mc-testo{padding:50px 60px;border-radius:22px;background:rgba(9,8,13,.84);border:2px solid rgba(255,255,255,.16);box-shadow:0 26px 70px rgba(0,0,0,.55);font-weight:${'${P}'};font-size:64px;line-height:1.4;color:#ebe7f4;letter-spacing:1px}
.mc.nu .mc-testo{background:none;border-color:transparent;box-shadow:none;text-shadow:0 4px 22px rgba(0,0,0,.8)}
.mc-cur{position:relative;display:inline-block;width:0;height:1em;vertical-align:text-bottom}
.mc-cur u{position:absolute;left:4px;top:0.08em;width:0.52em;height:1em;background:var(--c);box-shadow:0 0 16px var(--c)}
.mc-resto{opacity:0}`,
    righe: (v) => testo(v, 'testo').split(/\r?\n/),
  },

  // ————————————————————————— social e logo (altri) —————————————————————————
  {
    id: 'didascalia', nome: 'Didascalia social con @ e icone', gruppo: 'social', info: 'il post come sui social: nome, @utente, testo e sotto il cuore, i commenti e le condivisioni che salgono', durata: 6,
    campi: [T('nome', 'Nome', 'DaProd'), T('handle', 'Nome utente', '@daprod'), L('testo', 'Didascalia', 'Montaggio vecchio stile, moderno dentro. Provalo oggi! #daprod #video'), N('mipiace', 'Mi piace', 12400, 0, 99999999, 100), N('commenti', 'Commenti', 386, 0, 99999999, 1), N('condivisioni', 'Condivisioni', 1250, 0, 99999999, 10), C('colore', 'Colore del cuore', '#ff2d4a'), ...TEMPI(0.7, 0.5), DIM],
    font: () => ['rajdhani-500', 'rajdhani-700'],
    stato: (t, _d, _v, s) => ({ carta: fra(t, 0, s.ent), frase: fra(t, s.ent * 0.4, s.ent * 0.4 + 0.8), conta: fra(t, s.ent * 0.6, s.ent * 0.6 + 1.6), cuore: fra(t, s.ent + 0.9, s.ent + 1.4, E.back(3)) }),
    html: (v, s) => {
      const nome = testo(v, 'nome', '');
      const premuto = s.cuore > 0, grigio = '#a19db0';
      const miglia = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      const compatto = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace('.', ',')} K` : miglia(n));
      const cifra = (k: string, def: number) => compatto(Math.round(Math.max(0, numero(v, k, def)) * s.conta));
      const ico = (d: string, colore: string, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="54" height="54" ${extra}><path d="${d}" fill="${colore}"/></svg>`;
      return `<div class="sc" style="--cd:${num(s.carta)};--tx:${num(s.frase)}"><div class="sc-testa"><div class="sc-av">${esc(nome.trim().charAt(0).toUpperCase() || 'D')}</div><div class="sc-id"><div class="sc-nome">${esc(nome)}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="38" height="38"><circle cx="16" cy="16" r="15" fill="#35e8ff"/><path d="M9 16.5l5 5 9-10" fill="none" stroke="#14131a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="sc-h">${esc(testo(v, 'handle', ''))}</div></div></div>
<div class="sc-testo">${righeHtml(testo(v, 'testo', ''))}</div>
<div class="sc-giu"><div>${ico('M32 56C10 40 4 26 12 16 19 8 29 12 32 20 35 12 45 8 52 16 60 26 54 40 32 56z', premuto ? col(v, 'colore', '#ff2d4a') : grigio, `style="transform:scale(${num(premuto ? Math.max(0.2, s.cuore) : 1)})"`)}<span>${cifra('mipiace', 12400)}</span></div><div>${ico('M8 10h48v32H30L18 54V42H8z', grigio)}<span>${cifra('commenti', 386)}</span></div><div>${ico('M36 8l22 20-22 20V36C18 36 10 44 6 56c0-18 8-32 30-34z', grigio)}<span>${cifra('condivisioni', 1250)}</span></div></div></div>`;
    },
    css: `.sc{position:absolute;left:110px;bottom:110px;width:960px;transform:scale(calc(var(--dim)*(0.92 + 0.08*var(--cd))));transform-origin:0 100%;opacity:calc(var(--cd)*var(--out));padding:34px 40px 30px;border-radius:30px;background:rgba(22,17,36,.88);border:2px solid rgba(255,255,255,.2);box-shadow:0 26px 70px rgba(0,0,0,.55);font-family:'Rajdhani',sans-serif}
.sc-testa{display:flex;align-items:center;gap:22px}
.sc-av{flex:none;width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,#ffd54a,#ff3df2);color:#14131a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:56px}
.sc-id{flex:1}
.sc-nome{display:flex;align-items:center;gap:12px;font-weight:700;font-size:48px;line-height:1.1;color:#fff}
.sc-h{font-weight:500;font-size:36px;letter-spacing:1px;color:#a19db0}
.sc-testo{margin-top:24px;font-weight:600;font-size:46px;line-height:1.25;color:#ebe7f4;opacity:var(--tx);transform:translateY(calc((1 - var(--tx))*24px))}
.sc-giu{margin-top:28px;display:flex;align-items:center;gap:56px;font-weight:700;font-size:42px;color:#dcd8e6}
.sc-giu div{display:flex;align-items:center;gap:14px}`,
    righe: (v) => [testo(v, 'nome') + ' ' + testo(v, 'handle'), testo(v, 'testo')],
  },
  {
    id: 'finale', nome: 'Schermo di fine · iscriviti e due video', gruppo: 'social', info: 'il fondo si scurisce, due riquadri scivolano ai lati per i prossimi video e sotto il canale con il pulsante per iscriversi', durata: 10,
    campi: [T('titolo', 'Titolo', 'GUARDA ANCHE'), T('canale', 'Nome del canale', 'DaProd'), T('pulsante', 'Pulsante', 'ISCRIVITI'), T('video1', 'Primo video', 'Ultimo video'), T('video2', 'Secondo video', 'Il più visto'), C('colore', 'Colore del pulsante', '#ff2d4a'), N('fondo', 'Quanto scurisce il fondo (%)', 55, 0, 90, 5), ...TEMPI(0.8, 0.6), DIM],
    font: () => ['rajdhani-700'],
    stato: (t, _d, _v, s) => ({ titolo: fra(t, s.ent * 0.2, s.ent * 0.2 + 0.6), uno: fra(t, s.ent * 0.3, s.ent * 0.3 + 0.8, E.p4out), due: fra(t, s.ent * 0.5, s.ent * 0.5 + 0.8, E.p4out), canale: fra(t, s.ent * 0.9, s.ent * 0.9 + 0.7, E.back(1.8)) }),
    html: (v, s) => {
      const gioca = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="130" height="130"><circle cx="60" cy="60" r="56" fill="rgba(0,0,0,.5)" stroke="#fff" stroke-width="4"/><path d="M48 36l38 24-38 24z" fill="#fff"/></svg>';
      const nome = testo(v, 'canale', '');
      return `<div class="fn" style="--vl:${num(numero(v, 'fondo', 55) / 100)};--t1:${num(s.titolo)};--cn:${num(s.canale)}"><div class="fn-velo"></div><div class="fn-corpo"><div class="fn-tit">${esc(testo(v, 'titolo', ''))}</div>
<div class="fn-video"><div class="fn-v" style="--vv:${num(s.uno)};--lx:-1"><div class="fn-sch">${gioca}</div><b>${esc(testo(v, 'video1', ''))}</b></div><div class="fn-v" style="--vv:${num(s.due)};--lx:1"><div class="fn-sch">${gioca}</div><b>${esc(testo(v, 'video2', ''))}</b></div></div>
<div class="fn-canale"><div class="fn-av">${esc(nome.trim().charAt(0).toUpperCase() || 'D')}</div><div class="fn-nome">${esc(nome)}</div><div class="fn-btn">${esc(testo(v, 'pulsante', ''))}</div></div></div></div>`;
    },
    css: `.fn{position:absolute;left:0;top:0;width:100%;height:100%;opacity:var(--out);font-family:'Rajdhani',sans-serif}
.fn-velo{position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(9,8,13,var(--vl));opacity:var(--in)}
.fn-corpo{position:absolute;left:50%;top:50%;width:1360px;transform:translate(-50%,-50%) scale(var(--dim));display:flex;flex-direction:column;align-items:center;gap:46px}
.fn-tit{font-weight:700;font-size:64px;letter-spacing:16px;color:#fff;opacity:var(--t1);transform:translateY(calc((1 - var(--t1))*-30px));text-shadow:0 4px 24px rgba(0,0,0,.7)}
.fn-video{display:flex;gap:80px}
.fn-v{width:600px;opacity:var(--vv);transform:translateX(calc(var(--lx)*(1 - var(--vv))*160px))}
.fn-sch{height:338px;border-radius:22px;background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.04));border:3px solid rgba(255,255,255,.4);box-shadow:0 24px 60px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
.fn-v b{display:block;margin-top:18px;font-weight:700;font-size:44px;letter-spacing:3px;color:#ebe7f4;text-align:center}
.fn-canale{display:flex;align-items:center;gap:30px;padding:22px 34px;border-radius:90px;background:rgba(22,17,36,.88);border:2px solid rgba(255,255,255,.22);opacity:var(--cn);transform:scale(calc(0.8 + 0.2*var(--cn)))}
.fn-av{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#ffd54a,#ff3df2);color:#14131a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:60px}
.fn-nome{font-weight:700;font-size:60px;letter-spacing:2px;color:#fff}
.fn-btn{padding:14px 44px;border-radius:14px;background:var(--c);color:#fff;font-weight:700;font-size:48px;letter-spacing:4px;box-shadow:0 6px 0 rgba(0,0,0,.35)}`,
    righe: (v) => [testo(v, 'titolo'), testo(v, 'canale') + ' · ' + testo(v, 'pulsante')],
  },

  // ————————————————————————— indicare e confrontare —————————————————————————
  {
    id: 'freccia', nome: 'Freccia e evidenziatore', gruppo: 'indicare', info: 'una freccia disegnata a mano indica un punto del quadro, con un segno attorno (cerchio, rettangolo o pennarello) e la scritta', durata: 5,
    campi: [T('etichetta', 'Scritta', 'GUARDA QUI'), N('x', 'Punta a: da sinistra (%)', 62, 5, 95, 1), N('y', 'Punta a: dall\'alto (%)', 45, 5, 95, 1), S('lato', 'La scritta sta', 'alto-sinistra', [['alto-sinistra', 'In alto a sinistra'], ['alto-destra', 'In alto a destra'], ['basso-sinistra', 'In basso a sinistra'], ['basso-destra', 'In basso a destra']]), S('forma', 'Attorno al punto', 'cerchio', [['cerchio', 'Cerchio'], ['rettangolo', 'Rettangolo'], ['evidenziatore', 'Evidenziatore'], ['nessuna', 'Niente']]), N('raggio', 'Grandezza del segno', 110, 40, 300, 5), C('colore', 'Colore', '#ffd54a'), FONT('rajdhani', ['rajdhani', 'oswald', 'montserrat', 'orbitron', 'bebas']), ...TEMPI(0.7, 0.4)],
    font: (v) => fam(v, 'rajdhani').pezzi,
    stato: (t, _d, _v, s) => ({ segno: fra(t, 0, s.ent * 0.7), freccia: fra(t, s.ent * 0.3, s.ent * 0.3 + 0.8, E.p3io), scritta: fra(t, s.ent * 0.6, s.ent * 0.6 + 0.6, E.back(1.8)) }),
    html: (v, s) => {
      const R = Math.max(40, Math.min(300, numero(v, 'raggio', 110)));
      const forma = scelto(v, 'forma', ['cerchio', 'rettangolo', 'evidenziatore', 'nessuna'], 'cerchio');
      const g = geometriaFreccia(scelto(v, 'lato', Object.keys(LATI_FRECCIA), 'alto-sinistra'), R, forma);
      const c = col(v, 'colore', '#ffd54a');
      let segno = '';
      if (forma === 'cerchio') {
        const L = 2 * Math.PI * R;
        segno = `<circle cx="0" cy="0" r="${num(R)}" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${num(L)}" stroke-dashoffset="${num(L * (1 - s.segno))}" transform="rotate(-90)"/>`;
      } else if (forma === 'rettangolo') {
        const w = 2.6 * R, h = 1.6 * R, rx = 14, L = 2 * (w + h) - (8 - 2 * Math.PI) * rx;
        segno = `<rect x="${num(-w / 2)}" y="${num(-h / 2)}" width="${num(w)}" height="${num(h)}" rx="${rx}" fill="none" stroke="${c}" stroke-width="8" stroke-linejoin="round" stroke-dasharray="${num(L)}" stroke-dashoffset="${num(L * (1 - s.segno))}"/>`;
      } else if (forma === 'evidenziatore') segno = `<rect x="${num(-1.5 * R)}" y="${num(-0.3 * R)}" width="${num(3 * R * s.segno)}" height="${num(0.6 * R)}" rx="12" fill="${c}" opacity="0.4" transform="rotate(-2)"/>`;
      const L = lunghezzaCurva(g.S, g.C, g.F) * 1.01;
      const testa = clamp01((s.freccia - 0.85) / 0.15);
      const et = esc(testo(v, 'etichetta', ''));
      const targhetta = et ? `<div class="fr-et" style="left:${num(g.S.x)}px;top:${num(g.S.y)}px;transform:translate(-50%,${g.dy < 0 ? '-100%' : '0'}) scale(${num(0.6 + 0.4 * s.scritta)});opacity:${num(clamp01(s.scritta))}">${et}</div>` : '';
      return `<div class="fr"><div class="fr-p" style="left:${num(numero(v, 'x', 62))}%;top:${num(numero(v, 'y', 45))}%"><svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" style="position:absolute;left:0;top:0;overflow:visible">${segno}<path d="M ${num(g.S.x)} ${num(g.S.y)} Q ${num(g.C.x)} ${num(g.C.y)} ${num(g.F.x)} ${num(g.F.y)}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${num(L)}" stroke-dashoffset="${num(L * (1 - s.freccia))}"/><g transform="translate(${num(g.E.x)} ${num(g.E.y)}) rotate(${num((g.angolo * 180) / Math.PI)})" opacity="${num(testa)}"><polygon points="0,0 -44,-22 -44,22" fill="${c}"/></g></svg>${targhetta}</div></div>`;
    },
    css: `.fr{position:absolute;left:0;top:0;width:100%;height:100%;opacity:var(--out);filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}
.fr-p{position:absolute;width:0;height:0}
.fr-et{position:absolute;white-space:nowrap;padding:10px 32px;border-radius:14px;background:rgba(9,8,13,.9);border:3px solid var(--c);color:var(--c);font-weight:${'${P}'};font-size:60px;letter-spacing:4px;text-transform:uppercase}`,
    righe: (v) => [testo(v, 'etichetta')],
  },
  {
    id: 'primadopo', nome: 'Prima e dopo diviso', gruppo: 'indicare', info: 'un divisore scorre sul quadro: il «prima» si scurisce a sinistra, il «dopo» resta chiaro a destra', durata: 6,
    campi: [T('prima', 'Scritta a sinistra', 'PRIMA'), T('dopo', 'Scritta a destra', 'DOPO'), N('da', 'Il divisore parte da (%)', 20, 0, 100, 1), N('a', 'Arriva a (%)', 80, 0, 100, 1), N('velo', 'Quanto scurisce il «prima» (%)', 45, 0, 90, 5), C('colore', 'Colore del divisore', '#ffd54a'), FONT('rajdhani', ['rajdhani', 'oswald', 'montserrat', 'orbitron', 'bebas']), ...TEMPI(0.6, 0.5)],
    font: (v) => fam(v, 'rajdhani').pezzi,
    stato: (t, d, v, s) => ({ pos: lerp(numero(v, 'da', 20), numero(v, 'a', 80), fra(t, s.ent * 0.5, Math.max(s.ent * 0.5 + 0.2, d - s.usc - 0.1), E.p2io)), etichette: fra(t, s.ent * 0.3, s.ent * 0.3 + 0.6) }),
    html: (v, s) => {
      const x = Math.max(0, Math.min(100, s.pos));
      return `<div class="pd" style="--x:${num(x)}%;--vl:${num(numero(v, 'velo', 45) / 100)};--et:${num(s.etichette)}"><i class="pd-velo"></i><i class="pd-linea"></i><div class="pd-man"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 40" width="52" height="40"><polygon points="20,6 4,20 20,34" fill="#14131a"/><polygon points="32,6 48,20 32,34" fill="#14131a"/></svg></div><b class="pd-et sx">${esc(testo(v, 'prima', ''))}</b><b class="pd-et dx">${esc(testo(v, 'dopo', ''))}</b></div>`;
    },
    css: `.pd{position:absolute;left:0;top:0;width:100%;height:100%;opacity:var(--out)}
.pd-velo{position:absolute;left:0;top:0;height:100%;width:var(--x);background:rgba(9,8,13,var(--vl));opacity:var(--in)}
.pd-linea{position:absolute;top:0;height:100%;left:var(--x);width:6px;margin-left:-3px;background:var(--c);box-shadow:0 0 22px var(--c);transform:scaleY(var(--in));transform-origin:50% 50%}
.pd-man{position:absolute;left:var(--x);top:50%;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;background:var(--c);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 30px rgba(0,0,0,.6);transform:scale(var(--in))}
.pd-et{position:absolute;top:70px;padding:8px 34px;border-radius:40px;font-weight:${'${P}'};font-size:54px;letter-spacing:8px;text-transform:uppercase;opacity:var(--et);box-shadow:0 8px 24px rgba(0,0,0,.5)}
.pd-et.sx{left:70px;background:rgba(9,8,13,.9);color:#fff}
.pd-et.dx{right:70px;background:var(--c);color:#14131a}`,
    righe: (v) => [testo(v, 'prima') + ' / ' + testo(v, 'dopo')],
  },
  {
    id: 'prezzo', nome: 'Prezzo e offerta', gruppo: 'indicare', info: 'il cartellino cade, il prezzo vecchio si barra, quello nuovo salta fuori e il bollino dello sconto gira', durata: 6,
    campi: [T('etichetta', 'Scritta sopra', 'OFFERTA'), T('vecchio', 'Prezzo di prima', '99,00'), T('prezzo', 'Prezzo adesso', '69,00'), T('valuta', 'Valuta', '€'), T('sconto', 'Sconto', '-30%'), C('colore', 'Colore', '#ff2d4a'), FONT('montserrat', ['montserrat', 'archivo', 'oswald', 'bebas', 'orbitron']), ...TEMPI(0.8, 0.5), DIM],
    font: (v) => fam(v, 'montserrat').pezzi,
    stato: (t, _d, _v, s) => ({ cartello: fra(t, 0, s.ent, E.back(1.5)), vecchio: fra(t, s.ent * 0.5, s.ent * 0.5 + 0.5), barra: fra(t, s.ent * 0.5 + 0.5, s.ent * 0.5 + 0.9), nuovo: fra(t, s.ent * 0.5 + 0.7, s.ent * 0.5 + 1.3, E.back(2.4)), bollino: fra(t, s.ent * 0.5 + 1, s.ent * 0.5 + 1.7, E.back(2.6)) }),
    html: (v, s) => {
      let punte = '';
      for (let i = 0; i < 24; i++) { const a = (i / 24) * 2 * Math.PI, r = i % 2 === 0 ? 104 : 88; punte += `${num(110 + Math.sin(a) * r)},${num(110 - Math.cos(a) * r)} `; }
      const valuta = esc(testo(v, 'valuta', ''));
      const sconto = esc(testo(v, 'sconto', ''));
      return `<div class="pz" style="--cd:${num(s.cartello)};--vc:${num(s.vecchio)};--br:${num(s.barra)};--pr:${num(s.nuovo)};--st:${num(s.bollino)}"><div class="pz-card"><div class="pz-et">${esc(testo(v, 'etichetta', ''))}</div><div class="pz-vecchio">${valuta} ${esc(testo(v, 'vecchio', ''))}<i></i></div><div class="pz-prezzo"><small>${valuta}</small>${esc(testo(v, 'prezzo', ''))}</div></div>${sconto ? `<div class="pz-sticker"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="230" height="230"><polygon points="${punte.trim()}" fill="#ffd54a" stroke="#14131a" stroke-width="5"/></svg><b>${sconto}</b></div>` : ''}</div>`;
    },
    css: `.pz{position:absolute;left:50%;top:50%;width:900px;height:760px;margin:-380px 0 0 -450px;transform:scale(var(--dim));opacity:var(--out)}
.pz-card{position:absolute;left:0;right:90px;top:70px;padding-bottom:46px;text-align:center;border-radius:36px;background:linear-gradient(160deg,#2a2433,#14131a);border:3px solid rgba(255,255,255,.25);box-shadow:0 40px 90px rgba(0,0,0,.65);transform:translateY(calc((1 - var(--cd))*-420px)) rotate(calc((1 - var(--cd))*-8deg));opacity:calc(var(--cd)*3)}
.pz-et{padding:18px 0;border-radius:33px 33px 0 0;background:var(--c);color:#fff;font-weight:${'${P}'};font-size:64px;letter-spacing:12px;text-transform:uppercase}
.pz-vecchio{position:relative;display:inline-block;margin-top:34px;font-weight:${'${P}'};font-size:84px;color:#a19db0;opacity:var(--vc)}
.pz-vecchio i{position:absolute;left:-8%;right:-8%;top:52%;height:9px;border-radius:5px;background:var(--c);transform:rotate(-6deg) scaleX(var(--br));transform-origin:0 50%}
.pz-prezzo{margin-top:8px;font-weight:${'${P}'};font-size:260px;line-height:1;color:#fff;opacity:var(--pr);transform:scale(calc(0.5 + 0.5*var(--pr)));text-shadow:0 0 50px var(--c)}
.pz-prezzo small{font-size:110px;vertical-align:top;margin-right:10px;color:var(--c)}
.pz-sticker{position:absolute;right:0;top:0;width:230px;height:230px;display:flex;align-items:center;justify-content:center;transform:rotate(calc(14deg + (1 - var(--st))*-200deg)) scale(var(--st));opacity:calc(var(--st)*3)}
.pz-sticker svg{position:absolute;left:0;top:0}
.pz-sticker b{position:relative;font-weight:${'${P}'};font-size:62px;color:#14131a}`,
    righe: (v) => [testo(v, 'etichetta'), testo(v, 'valuta') + ' ' + testo(v, 'prezzo')],
  },

  // ————————————————————————— documentario e interviste —————————————————————————
  {
    id: 'luogo', nome: 'Cartello luogo e data', gruppo: 'docu', info: 'lo stile dei documentari: il segnaposto, il luogo a lettere grandi, la data e le coordinate che si scrivono', durata: 5,
    campi: [T('luogo', 'Luogo', 'ROMA, ITALIA'), T('data', 'Data', '12 GIUGNO 2026'), T('coordinate', 'Riga piccola (coordinate o altro)', '41.9028° N · 12.4964° E'), C('colore', 'Colore', '#ffd54a'), S('lato', 'Dove sta', 'sinistra', [['sinistra', 'In basso a sinistra'], ['destra', 'In basso a destra']]), FONT('rajdhani', ['rajdhani', 'oswald', 'montserrat', 'orbitron', 'bebas']), ...TEMPI(0.9, 0.6), DIM],
    font: (v) => [...fam(v, 'rajdhani').pezzi, 'rajdhani-700', 'mono-700'],
    stato: (t, _d, _v, s) => ({ linea: fra(t, 0, s.ent * 0.6, E.p4out), luogo: fra(t, s.ent * 0.3, s.ent * 1.1), data: fra(t, s.ent * 0.6, s.ent * 1.4), coord: fra(t, s.ent * 0.9, s.ent * 0.9 + 0.7), pin: fra(t, 0.1, 0.8, E.rimbalzo) }),
    html: (v, s) => {
      const destra = scelto(v, 'lato', ['sinistra', 'destra'], 'sinistra') === 'destra';
      const coord = testo(v, 'coordinate', '').trim();
      return `<div class="lu ${destra ? 'dx' : ''}" style="--li:${num(s.linea)};--lg:${num(s.luogo)};--da:${num(s.data)};--co:${num(s.coord)}"><i class="lu-linea"></i><div class="lu-testi"><div class="lu-luogo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="62" height="62" style="transform:translateY(${num((1 - s.pin) * -40)}px)"><path fill-rule="evenodd" d="M24 4C14 4 8 11 8 19c0 12 16 28 16 28s16-16 16-28C40 11 34 4 24 4zm0 20a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" fill="${col(v, 'colore', '#ffd54a')}"/></svg><span>${esc(testo(v, 'luogo', ''))}</span></div><div class="lu-data">${esc(testo(v, 'data', ''))}</div>${coord ? `<div class="lu-coord">${esc(coord)}</div>` : ''}</div></div>`;
    },
    css: `.lu{position:absolute;left:110px;bottom:130px;display:flex;align-items:stretch;gap:28px;transform:scale(var(--dim));transform-origin:0 100%;opacity:var(--out)}
.lu.dx{left:auto;right:110px;flex-direction:row-reverse;transform-origin:100% 100%;text-align:right}
.lu-linea{width:8px;background:var(--c);box-shadow:0 0 18px var(--c);transform:scaleY(var(--li));transform-origin:50% 100%}
.lu-testi{display:flex;flex-direction:column;gap:8px}
.lu.dx .lu-testi{align-items:flex-end}
.lu-luogo{display:flex;align-items:center;gap:16px;font-weight:${'${P}'};font-size:78px;line-height:1.05;letter-spacing:6px;color:#fff;text-transform:uppercase;text-shadow:0 4px 24px rgba(0,0,0,.7);clip-path:inset(0 calc((1 - var(--lg))*100%) 0 0)}
.lu.dx .lu-luogo{flex-direction:row-reverse;clip-path:inset(0 0 0 calc((1 - var(--lg))*100%))}
.lu-data{font-family:'Rajdhani',sans-serif;font-weight:700;font-size:44px;letter-spacing:8px;color:var(--c);text-transform:uppercase;text-shadow:0 3px 16px rgba(0,0,0,.7);clip-path:inset(0 calc((1 - var(--da))*100%) 0 0)}
.lu.dx .lu-data{clip-path:inset(0 0 0 calc((1 - var(--da))*100%))}
.lu-coord{font-family:'Space Mono',monospace;font-weight:700;font-size:30px;letter-spacing:2px;color:#dcd8e6;text-shadow:0 3px 14px rgba(0,0,0,.8);opacity:var(--co)}`,
    righe: (v) => [testo(v, 'luogo'), testo(v, 'data')],
  },
  {
    id: 'intervista', nome: 'Intervista · nome e domanda', gruppo: 'docu', info: 'la targhetta col nome e il ruolo di chi parla e, sotto, la domanda su una fascia chiara', durata: 7,
    campi: [T('nome', 'Nome', 'Anna Verdi'), T('ruolo', 'Ruolo', 'Direttrice del museo'), L('domanda', 'Domanda', 'Come è cominciata tutta la storia?'), T('sigla', 'Targhetta sopra', 'INTERVISTA'), C('colore', 'Colore', '#35e8ff'), FONT('oswald', ['oswald', 'rajdhani', 'montserrat', 'orbitron', 'bebas']), ...TEMPI(0.8, 0.5), DIM],
    font: (v) => [...fam(v, 'oswald').pezzi, 'rajdhani-500', 'rajdhani-700'],
    stato: (t, _d, _v, s) => ({ sigla: fra(t, 0, s.ent * 0.7, E.back(1.6)), nome: fra(t, s.ent * 0.2, s.ent, E.p4out), domanda: fra(t, s.ent * 0.6, s.ent * 1.5, E.p4out) }),
    html: (v, s) => {
      const sigla = testo(v, 'sigla', '').trim(), ruolo = testo(v, 'ruolo', '').trim(), dom = testo(v, 'domanda', '').trim();
      return `<div class="iv" style="--sg:${num(s.sigla)};--cr:${num(s.nome)};--dm:${num(s.domanda)}">${sigla ? `<div class="iv-sigla">${esc(sigla)}</div>` : ''}<div class="iv-nome"><b>${esc(testo(v, 'nome', ''))}</b>${ruolo ? `<em>${esc(ruolo)}</em>` : ''}</div>${dom ? `<div class="iv-dom">“${righeHtml(dom)}”</div>` : ''}</div>`;
    },
    css: `.iv{position:absolute;left:110px;bottom:120px;width:1100px;transform:scale(var(--dim));transform-origin:0 100%;opacity:var(--out)}
.iv-sigla{display:inline-block;padding:6px 26px;background:var(--c);color:#14131a;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:34px;letter-spacing:8px;opacity:var(--sg);transform:translateY(calc((1 - var(--sg))*40px))}
.iv-nome{display:flex;align-items:baseline;gap:26px;padding:16px 36px;background:rgba(9,8,13,.9);border-left:10px solid var(--c);clip-path:inset(0 calc((1 - var(--cr))*100%) 0 0)}
.iv-nome b{font-weight:${'${P}'};font-size:64px;letter-spacing:2px;color:#fff;text-transform:uppercase}
.iv-nome em{font-style:normal;font-family:'Rajdhani',sans-serif;font-weight:500;font-size:40px;letter-spacing:3px;color:var(--c)}
.iv-dom{padding:22px 36px 26px;background:rgba(245,243,250,.94);color:#14131a;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:52px;line-height:1.2;clip-path:inset(0 calc((1 - var(--dm))*100%) 0 0)}`,
    righe: (v) => [testo(v, 'nome') + ' · ' + testo(v, 'ruolo'), testo(v, 'domanda')],
  },
  {
    id: 'coda', nome: 'Titoli di coda che scorrono', gruppo: 'docu', info: 'i nomi salgono dal basso e escono in alto per tutta la durata: ruolo a sinistra, nome a destra (scrivi «Ruolo | Nome», una riga per volta)', durata: 12,
    campi: [L('testo', 'Righe (Ruolo | Nome; senza | è un titolo)', 'Un film di DaProd\n\nRegia | Mario Rossi\nMontaggio | Anna Verdi\nMusiche | Luca Bianchi\nFotografia | Sara Neri\n\nGrazie a tutti'), C('colore', 'Colore dei ruoli', '#ffd54a'), N('fondo', 'Quanto scurisce il fondo (%)', 70, 0, 100, 5), FONT('oswald', ['oswald', 'rajdhani', 'montserrat', 'orbitron', 'playfair']), ...TEMPI(0.8, 0.8), DIM],
    font: (v) => [...fam(v, 'oswald').pezzi, 'rajdhani-500'],
    html: (v, s) => {
      const righe = testo(v, 'testo', '').split(/\r?\n/).slice(0, 60).map((r) => {
        const i = r.indexOf('|');
        if (i >= 0) return `<div class="cd-riga"><div class="cd-ruolo">${esc(r.slice(0, i).trim())}</div><div class="cd-nome">${esc(r.slice(i + 1).trim())}</div></div>`;
        return r.trim() ? `<div class="cd-tit">${esc(r.trim())}</div>` : '<div class="cd-vuota"></div>';
      }).join('');
      return `<div class="cd" style="--bg:rgba(9,8,13,${num(numero(v, 'fondo', 70) / 100)});--k:${num(s.p)}"><div class="cd-bg"></div><div class="cd-vetro"><div class="cd-rotolo">${righe}</div></div></div>`;
    },
    css: `.cd{position:absolute;left:0;top:0;width:100%;height:100%;opacity:var(--out)}
.cd-bg{position:absolute;left:0;top:0;width:100%;height:100%;background:var(--bg);opacity:var(--in)}
.cd-vetro{position:absolute;left:0;top:0;width:100%;height:100%;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%)}
.cd-rotolo{position:absolute;left:0;right:0;top:calc(100% - var(--k)*100%);transform:translateY(calc(-1*var(--k)*100%)) scale(var(--dim));transform-origin:50% 0;padding:0 160px;text-align:center}
.cd-riga{display:flex;justify-content:center;align-items:baseline;gap:44px;min-height:88px;font-size:50px;line-height:1.5}
.cd-ruolo{flex:1;text-align:right;font-family:'Rajdhani',sans-serif;font-weight:500;font-size:42px;letter-spacing:4px;color:var(--c);text-transform:uppercase}
.cd-nome{flex:1;text-align:left;font-weight:${'${P}'};letter-spacing:2px;color:#fff}
.cd-tit{padding:10px 0;font-weight:${'${P}'};font-size:76px;letter-spacing:8px;color:#fff;text-transform:uppercase}
.cd-vuota{height:70px}`,
    righe: (v) => testo(v, 'testo').split(/\r?\n/).map((r) => r.replace('|', ' ')),
  },
  {
    id: 'capitoli', nome: 'Barra di avanzamento capitoli', gruppo: 'docu', info: 'una barra divisa in capitoli che si riempie col tempo, con il nome di quello che stai guardando acceso', durata: 10,
    campi: [L('capitoli', 'Capitoli (uno per riga)', 'Introduzione\nIl viaggio\nIl risultato\nConclusione'), C('colore', 'Colore', '#ffd54a'), S('posto', 'Dove sta', 'basso', [['basso', 'In basso'], ['alto', 'In alto']]), FONT('rajdhani', ['rajdhani', 'oswald', 'montserrat', 'orbitron', 'bebas']), ...TEMPI(0.6, 0.5), DIM],
    font: (v) => fam(v, 'rajdhani').pezzi,
    stato: (t, d, _v, s) => ({ avanza: clamp01((t - s.ent * 0.5) / Math.max(0.2, d - s.ent * 0.5 - s.usc * 0.5)) }),
    html: (v, s) => {
      const nomi = testo(v, 'capitoli', '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
      if (!nomi.length) nomi.push('');
      const n = nomi.length, attivo = Math.min(n - 1, Math.floor(s.avanza * n));
      const alto = scelto(v, 'posto', ['basso', 'alto'], 'basso') === 'alto';
      const seg = nomi.map((nome, i) => {
        const f = clamp01(s.avanza * n - i);
        const o = i === attivo ? 1 : i < attivo ? 0.8 : 0.5;
        return `<div class="ch-c ${i === attivo ? 'att' : ''}"><div class="ch-barra"><i style="--f:${num(f)}"></i></div><div class="ch-nome" style="--o:${o}"><b>${s2(i + 1)}</b> ${esc(nome)}</div></div>`;
      }).join('');
      return `<div class="ch ${alto ? 'su' : ''}"><div class="ch-seg">${seg}</div></div>`;
    },
    css: `.ch{position:absolute;left:110px;right:110px;bottom:90px;padding:26px 34px 22px;border-radius:24px;background:rgba(9,8,13,.74);transform:scale(var(--dim));transform-origin:50% 100%;opacity:calc(var(--in)*var(--out))}
.ch.su{bottom:auto;top:90px;transform-origin:50% 0}
.ch-seg{display:flex;gap:16px}
.ch-c{flex:1;min-width:0}
.ch-barra{height:14px;border-radius:7px;background:rgba(255,255,255,.22);overflow:hidden}
.ch-barra i{display:block;width:100%;height:100%;background:var(--c);box-shadow:0 0 14px var(--c);transform:scaleX(var(--f));transform-origin:0 50%}
.ch-nome{margin-top:14px;font-weight:${'${P}'};font-size:38px;letter-spacing:2px;color:#fff;opacity:var(--o);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ch-nome b{color:var(--c)}
.ch-c.att .ch-nome{color:var(--c)}`,
    righe: (v) => testo(v, 'capitoli').split(/\r?\n/),
  },
];

export const modelloHtml = (id: string) => MODELLI_HTML.find((m) => m.id === id);
export const modelliDi = (g: GruppoHtml) => MODELLI_HTML.filter((m) => m.gruppo === g);

// ——— i valori ———
export const valoriHtmlDiPartenza = (m: ModelloHtml): ValoriHtml => Object.fromEntries(m.campi.map((c) => [c.id, c.def]));

/** una specifica nuova (con i valori di partenza) */
export function nuovoHtml(id: string, v: ValoriHtml = {}): HtmlSpec {
  const m = modelloHtml(id) ?? MODELLI_HTML[0];
  return { id: m.id, v: { ...valoriHtmlDiPartenza(m), ...v } };
}

/** i valori completi di una specifica: quelli mancanti o storti si prendono dai valori di partenza (i progetti vecchi reggono) */
export function valoriHtmlDi(spec: HtmlSpec): ValoriHtml {
  const m = modelloHtml(spec.id);
  const base = m ? valoriHtmlDiPartenza(m) : {};
  const v: ValoriHtml = { ...base };
  const dato = spec.v && typeof spec.v === 'object' ? spec.v : {};
  for (const c of m?.campi ?? []) {
    const x = dato[c.id];
    if (x === undefined || x === null) continue;
    if (c.tipo === 'numero') { const n = Number(x); if (Number.isFinite(n)) v[c.id] = Math.max(c.min ?? -Infinity, Math.min(c.max ?? Infinity, n)); }
    else if (c.tipo === 'colore') v[c.id] = coloreSicuro(x, String(c.def));
    else if (c.tipo === 'scelta') v[c.id] = (c.scelte ?? []).some(([k]) => k === x) ? String(x) : c.def;
    else if (c.tipo === 'spunta') v[c.id] = !!x;
    else v[c.id] = String(x).slice(0, c.tipo === 'lungo' ? 600 : 200);
  }
  return v;
}

/**
 * Migrazione all'apertura di un progetto: i titoli HTML con campi mancanti, fuori misura o di un tipo sbagliato tornano
 * a valori buoni. Chi non ha titoli HTML (tutti i progetti vecchi) non viene toccato. Si può fare più volte: il risultato è lo stesso.
 */
export function migraTitoliHtml(p: Project): void {
  for (const s of [p, ...(p.sequenze ?? [])]) {
    for (const c of s.clips ?? []) {
      const h = c.gen?.html;
      if (!h) continue;
      if (!modelloHtml(h.id)) { if (!h.v || typeof h.v !== 'object') h.v = {}; continue; }
      h.v = valoriHtmlDi(h);
    }
  }
}

// ——— il tempo ———
/** i numeri comuni a tutti i modelli: entrata, uscita, quanto si è andati avanti. Solo dal tempo. */
export function statoComune(t: number, d: number, v: ValoriHtml): StatoHtml {
  d = Math.max(0.1, d);
  t = Math.max(0, Math.min(d, t));
  let ent = Math.max(0.05, numero(v, 'ent', 0.7)), usc = Math.max(0.05, numero(v, 'usc', 0.5));
  // se la clip è più corta di entrata + uscita si riducono insieme
  if (ent + usc > d) { const k = d / (ent + usc); ent *= k; usc *= k; }
  const dentro = E.p3out(clamp01(t / ent));
  const fuori = 1 - E.p2in(clamp01((t - (d - usc)) / usc));
  return { t, d, ent, usc, in: dentro, out: fuori, p: clamp01(t / d), dim: Math.max(0.1, numero(v, 'dim', 100) / 100) };
}

/** lo stato completo di un titolo HTML al tempo t (secondi dall'inizio della clip), clip lunga d secondi */
export function statoHtml(spec: HtmlSpec, t: number, d: number): StatoHtml {
  const m = modelloHtml(spec.id);
  const v = valoriHtmlDi(spec);
  const s = statoComune(t, d, v);
  if (!m?.stato) return s;
  const extra = m.stato(s.t, s.d, v, s);
  // lo scorrimento del ticker ha bisogno di sapere fin dove arriverà alla fine della clip
  if (spec.id === 'ticker') extra.xMax = s.d * numero(v, 'velocita', 220);
  return { ...s, ...extra };
}

// ——— il fotogramma ———
/** la misura del palcoscenico virtuale (alto 1080, largo quanto il formato, almeno 1500) e la scala fino ai pixel veri */
export function palco(W: number, H: number): { sw: number; sh: number; k: number } {
  let sw = (1080 * W) / H, sh = 1080;
  if (sw < 1500) { sw = 1500; sh = (1500 * H) / W; }
  return { sw: arrotonda(sw), sh: arrotonda(sh), k: arrotonda(W / sw) };
}

/** impronta del testo (FNV-1a a 32 bit): serve per riconoscere due fotogrammi uguali */
export function impronta(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

export interface FotogrammaHtml {
  /** l'HTML del fotogramma (un div che riempie la tela) */
  corpo: string;
  /** il CSS del modello (uguale per tutti i fotogrammi dello stesso modello e dello stesso carattere) */
  css: string;
  /** i pezzi di carattere da incorporare */
  font: string[];
  /** due fotogrammi con la stessa chiave sono lo stesso disegno (in pausa tra entrata e uscita se ne fa uno solo) */
  chiave: string;
}

/** Costruisce il fotogramma al tempo t. Niente browser, niente caso vero: stesso (spec, W, H, t, d) → stesso risultato. */
export function costruisciHtml(spec: HtmlSpec, W: number, H: number, t: number, d: number): FotogrammaHtml {
  const m = modelloHtml(spec.id);
  const v = valoriHtmlDi(spec);
  const s = statoHtml(spec, t, d);
  const { sw, sh, k } = palco(W, H);
  const f = m ? fam(v, m.campi.find((c) => c.id === 'font')?.def as string | undefined) : fontScelta('orbitron');
  const col1 = col(v, 'colore', '#ffd54a');
  const col2 = col(v, 'colore2', col(v, 'filetto', '#ff3df2'));
  // --t (secondi), --d (durata) e --p (0..1) li scrive solo chi li usa nel suo CSS: se no ogni fotogramma sarebbe diverso
  // anche quando l'immagine è ferma (tenuta fra entrata e uscita) e la cache non potrebbe riusarlo
  const cssModello = m ? m.css : '';
  const tempo = (nome: string, valore: number) => (cssModello.includes(`var(--${nome})`) ? `--${nome}:${num(valore)};` : '');
  const vars = `${tempo('t', s.t)}${tempo('d', s.d)}${tempo('p', s.p)}--in:${num(s.in)};--out:${num(s.out)};--dim:${num(s.dim)};--c:${col1};--c2:${col2};--font:${m ? nomeFont(v, m.campi.find((c) => c.id === 'font')?.def as string | undefined) : "'Orbitron'"}`;
  const dentro = m ? m.html(v, s) : '';
  const corpo = `<div class="dp" style="position:absolute;left:0;top:0;width:${num(sw)}px;height:${num(sh)}px;overflow:hidden;transform:scale(${num(k)});transform-origin:0 0;${vars}">${dentro}</div>`;
  const css = cssModello.replace(/\$\{P\}/g, String(f.peso));
  const pezzi = m ? [...new Set(m.font(v))] : [];
  return { corpo, css, font: pezzi, chiave: `${spec.id}|${W}x${H}|${impronta(corpo)}` };
}

/** la scritta per chi non può avere l'HTML (ripiego): le righe di testo del modello */
export function righeDi(spec: HtmlSpec): string[] {
  const m = modelloHtml(spec.id);
  return m ? m.righe(valoriHtmlDi(spec)).filter((x) => x.trim()) : [];
}

/** il CSS comune a tutti i modelli */
export const CSS_BASE = `.dp,.dp *{box-sizing:border-box;margin:0;padding:0}.dp{font-family:var(--font),sans-serif;color:#fff;-webkit-font-smoothing:antialiased}`;

/** la firma di una specifica (cambia quando cambi un testo o un colore) */
export const firmaHtml = (spec: HtmlSpec) => spec.id + JSON.stringify(spec.v);
