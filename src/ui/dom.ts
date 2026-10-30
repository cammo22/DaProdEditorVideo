// Attrezzi per costruire l'interfaccia senza framework: elementi, icone, avvisi, dialoghi, menu.

type Attr = Record<string, unknown> & { class?: string; style?: string; on?: Record<string, (e: any) => void> };
type Figlio = Node | string | number | null | undefined | false | Figlio[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attr: Attr | null = null, ...figli: Figlio[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attr) {
    for (const [k, v] of Object.entries(attr)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendi(el, figli);
  return el;
}

function appendi(el: Node, figli: Figlio[]) {
  for (const f of figli) {
    if (f === null || f === undefined || f === false) continue;
    if (Array.isArray(f)) appendi(el, f);
    else el.appendChild(typeof f === 'object' ? f : document.createTextNode(String(f)));
  }
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** icone disegnate a mano, stile tasti di regia */
const P: Record<string, string> = {
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  pausa: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  indietro: '<path d="M11 6l-8 6 8 6zM21 6l-8 6 8 6z" fill="currentColor"/>',
  avanti: '<path d="M3 6l8 6-8 6zM13 6l8 6-8 6z" fill="currentColor"/>',
  fotoPrec: '<path d="M16 6l-8 6 8 6z" fill="currentColor"/><rect x="5" y="6" width="2.4" height="12" fill="currentColor"/>',
  fotoSucc: '<path d="M8 6l8 6-8 6z" fill="currentColor"/><rect x="16.6" y="6" width="2.4" height="12" fill="currentColor"/>',
  inizio: '<path d="M18 6l-9 6 9 6z" fill="currentColor"/><rect x="5" y="5" width="2.4" height="14" fill="currentColor"/>',
  fine: '<path d="M6 6l9 6-9 6z" fill="currentColor"/><rect x="16.6" y="5" width="2.4" height="14" fill="currentColor"/>',
  loop: '<path d="M4 12a6 6 0 016-6h7l-2.5-2.5M20 12a6 6 0 01-6 6H7l2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  segnaIn: '<path d="M8 4v16M8 4h8M8 20h8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  segnaOut: '<path d="M16 4v16M16 4H8M16 20H8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  forbici: '<circle cx="6" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5L20 18M8.5 15.5L20 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cestino: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  chiudi: '<path d="M4 12h6M14 12h6M10 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 6v12M21 6v12" stroke="currentColor" stroke-width="2"/>',
  catena: '<path d="M10 14l4-4M8 11l-2 2a3 3 0 004 4l2-2M16 13l2-2a3 3 0 00-4-4l-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  dissolvenza: '<path d="M3 19L21 5" stroke="currentColor" stroke-width="2"/><rect x="3" y="5" width="18" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19V5h9z" fill="currentColor" opacity=".45"/>',
  apri: '<path d="M3 7h6l2 2h10v10H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  salva: '<path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="8" y="3" width="7" height="5" fill="currentColor"/><rect x="8" y="13" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>',
  importa: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  esporta: '<path d="M12 15V3M7 8l5-5 5 5M4 20h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  annulla: '<path d="M9 5L4 10l5 5M4 10h10a6 6 0 010 12h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ripeti: '<path d="M15 5l5 5-5 5M20 10H10a6 6 0 000 12h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  occhio: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  lucchetto: '<rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  altoparlante: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  calamita: '<path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  onda: '<path d="M2 12h3l2-6 3 12 3-15 3 18 2-9h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  zoomPiu: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5M7 10h6M10 7v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  zoomMeno: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5M7 10h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  adatta: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  piu: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  marcatore: '<path d="M6 3h12v12l-6 6-6-6z" fill="currentColor"/>',
  titolo: '<path d="M5 5h14M12 5v14M8 19h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  barre: '<rect x="3" y="4" width="3" height="16" fill="#c0c0c0"/><rect x="6" y="4" width="3" height="16" fill="#c0c000"/><rect x="9" y="4" width="3" height="16" fill="#00c0c0"/><rect x="12" y="4" width="3" height="16" fill="#00c000"/><rect x="15" y="4" width="3" height="16" fill="#c000c0"/><rect x="18" y="4" width="3" height="16" fill="#c00000"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  ingranaggio: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  schermo: '<rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2"/>',
  elastico: '<path d="M3 17l5-6 5 3 8-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="11" r="2" fill="currentColor"/><circle cx="13" cy="14" r="2" fill="currentColor"/>',
  ripple: '<path d="M3 12h7M14 12h7M10 8v8M14 8v8M17 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cerchio: '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  x: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  musica: '<path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.8" fill="currentColor"/><circle cx="17.5" cy="16" r="2.8" fill="currentColor"/>',
  immagine: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9.5" r="1.8" fill="currentColor"/><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 10l5-3v10l-5-3z" fill="currentColor"/>',
  transizione: '<rect x="3" y="5" width="9" height="14" rx="1.5" fill="currentColor" opacity=".45"/><rect x="12" y="5" width="9" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 12h6M13 9.5l2.5 2.5-2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  effetti: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" fill="currentColor"/><path d="M18.5 14l.9 2.2 2.1.8-2.1.8-.9 2.2-.9-2.2-2.1-.8 2.1-.8z" fill="currentColor"/>',
  punto: '<circle cx="12" cy="12" r="3.4" fill="currentColor"/>',
  cartella: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="currentColor"/>',
  cartellaPiu: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5v6M9 13.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  freccia: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  griglia: '<rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor"/><rect x="14" y="4" width="6" height="6" rx="1" fill="currentColor"/><rect x="4" y="14" width="6" height="6" rx="1" fill="currentColor"/><rect x="14" y="14" width="6" height="6" rx="1" fill="currentColor"/>',
  tutto: '<rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor"/>',
  finale: '<path d="M4 9h16v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 9l2-5 3 1-1.5 4M9 5l4 1.2L11.5 9M13 6.2l4 1.2L16 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 12.5l4 2.5-4 2.5z" fill="currentColor"/>',
  pieno: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  montaggio: '<path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/><rect x="5" y="5" width="7" height="4" rx="1" fill="currentColor"/><rect x="10" y="10" width="9" height="4" rx="1" fill="currentColor"/><rect x="4" y="15" width="10" height="4" rx="1" fill="currentColor"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  webcam: '<circle cx="12" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" fill="currentColor"/><path d="M7 21h10M12 17v4" stroke="currentColor" stroke-width="2"/>',
  telecomando: '<rect x="7" y="2.5" width="10" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="7.5" r="1.8" fill="#ff4d6d"/><path d="M10 12h4M10 15.5h4" stroke="currentColor" stroke-width="1.8"/>',
  automatico: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" fill="currentColor"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM5 3.5l.6 1.4 1.4.6-1.4.6L5 7.5l-.6-1.4L3 5.5l1.4-.6z" fill="currentColor" opacity=".7"/>',
  live: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#ff4d6d"/>',
  vista: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 4v16M3 13h12" stroke="currentColor" stroke-width="2"/><rect x="16.5" y="6" width="3" height="12" rx=".8" fill="currentColor" opacity=".6"/>',
  aggiorna: '<path d="M20 12a8 8 0 11-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sottotitoli: '<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 10.2a2.2 2.2 0 100 3.6M17 10.2a2.2 2.2 0 100 3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  logo: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  lingua: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  apertura: '<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M7 5v4M12 5v4M17 5v4M10 12.5l4 2.5-4 2.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  novita: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/><path d="M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="currentColor"/>',
  foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/>',
};

export function icona(nome: keyof typeof P | string, size = 18): SVGElement {
  const w = document.createElement('span');
  w.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${P[nome] ?? P.cerchio}</svg>`;
  return w.firstChild as SVGElement;
}

// ——— avvisi (toast) ———
/**
 * La chiusura da sola di un avviso: dopo `ms` sparisce, ma col mouse sopra resta dov'è e riparte da capo quando il mouse esce
 * (così si fa in tempo a leggerlo). `riarma` cambia il tempo (un avviso che si aggiorna al suo posto).
 */
function chiusuraAvviso(el: HTMLElement, ms: number, via: () => void): (ms: number) => void {
  let timer = 0, sopra = false, durata = ms;
  const arma = () => { clearTimeout(timer); if (!sopra) timer = window.setTimeout(via, durata); };
  el.addEventListener('pointerenter', () => { sopra = true; clearTimeout(timer); });
  el.addEventListener('pointerleave', () => { sopra = false; durata = Math.max(durata, 1500); arma(); });
  arma();
  return (nuovo) => { durata = nuovo; arma(); };
}

let zonaAvvisi: HTMLElement | null = null;
function zona(): HTMLElement {
  if (!zonaAvvisi) {
    zonaAvvisi = h('div', { class: 'avvisi', 'aria-live': 'polite' });
    document.body.appendChild(zonaAvvisi);
  }
  return zonaAvvisi;
}
export function avviso(testo: string, tipo: 'info' | 'ok' | 'errore' | 'tasto' = 'info', ms = 2200) {
  const z = zona();
  const el = h('div', { class: 'avviso ' + tipo }, testo);
  z.appendChild(el);
  while (z.children.length > 4) z.firstChild?.remove();
  chiusuraAvviso(el, ms, () => { el.classList.add('via'); setTimeout(() => el.remove(), 300); });
}

/** un avviso che si aggiorna al suo posto: lo stesso testo che cambia (un avanzamento) non mette un avviso nuovo a ogni passo */
const unici = new Map<string, { el: HTMLElement; riarma: (ms: number) => void }>();
export function avvisoUnico(chiave: string, testo: string, tipo: 'info' | 'ok' | 'errore' | 'tasto' = 'info', ms = 2200) {
  const z = zona();
  let v = unici.get(chiave);
  if (!v || !v.el.isConnected) {
    const el = h('div', { class: 'avviso ' + tipo }, testo);
    const mio: { el: HTMLElement; riarma: (ms: number) => void } = { el, riarma: () => {} };
    mio.riarma = chiusuraAvviso(el, ms, () => { el.classList.add('via'); setTimeout(() => { el.remove(); if (unici.get(chiave) === mio) unici.delete(chiave); }, 300); });
    unici.set(chiave, mio);
    z.appendChild(el);
    while (z.children.length > 4) z.firstChild?.remove();
  } else {
    v.el.textContent = testo;
    v.el.className = 'avviso ' + tipo;
    v.riarma(ms);
  }
}

// ——— dialoghi ———
export interface Dialogo { el: HTMLElement; chiudi: () => void; corpo: HTMLElement; piede: HTMLElement }

/** chiudibile: false = solo dai suoi bottoni; una funzione = si chiude con Esc, ✕ o clic fuori solo quando dice sì
 *  (la finestra Esporta mentre lavora: chiuderla lasciava l'export a girare senza modo di fermarlo) */
export function dialogo(titolo: string, opzioni: { largo?: boolean; onChiudi?: () => void; chiudibile?: boolean | (() => boolean) } = {}): Dialogo {
  const corpo = h('div', { class: 'dlg-corpo' });
  const piede = h('div', { class: 'dlg-piede' });
  let chiuso = false;
  const chiudi = () => { if (chiuso) return; chiuso = true; velo.classList.add('via'); setTimeout(() => velo.remove(), 180); document.removeEventListener('keydown', esc, true); opzioni.onChiudi?.(); };
  const puo = () => (typeof opzioni.chiudibile === 'function' ? opzioni.chiudibile() : opzioni.chiudibile !== false);
  const prova = () => { if (puo()) chiudi(); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && opzioni.chiudibile !== false) { e.stopPropagation(); prova(); } };
  const el = h('div', { class: 'dialogo' + (opzioni.largo ? ' largo' : ''), role: 'dialog', 'aria-label': titolo },
    h('div', { class: 'dlg-testa' }, h('span', { class: 'led acceso' }), h('b', null, titolo),
      opzioni.chiudibile === false ? null : h('button', { class: 'btn-icona', title: 'Chiudi (Esc)', on: { click: prova } }, icona('x', 16))),
    corpo, piede);
  const velo = h('div', { class: 'velo', on: { pointerdown: (e: PointerEvent) => { if (e.target === velo && opzioni.chiudibile !== false) prova(); } } }, el);
  document.body.appendChild(velo);
  document.addEventListener('keydown', esc, true);
  return { el, chiudi, corpo, piede };
}

export function conferma(titolo: string, testo: string, si = 'Sì', no = 'Annulla'): Promise<boolean> {
  return new Promise((ok) => {
    let fatto = false;
    const d = dialogo(titolo, { onChiudi: () => { if (!fatto) ok(false); } });
    d.corpo.appendChild(h('p', null, testo));
    d.piede.append(
      h('button', { class: 'btn', on: { click: () => { fatto = true; ok(false); d.chiudi(); } } }, no),
      h('button', { class: 'btn primario', on: { click: () => { fatto = true; ok(true); d.chiudi(); } } }, si));
    (d.piede.lastChild as HTMLElement).focus();
  });
}

export function chiedi(titolo: string, etichetta: string, valore = '', multilinea = false): Promise<string | null> {
  return new Promise((ok) => {
    let fatto = false;
    const d = dialogo(titolo, { onChiudi: () => { if (!fatto) ok(null); } });
    const inp = multilinea
      ? h('textarea', { class: 'campo-testo', rows: 5 }) as HTMLTextAreaElement
      : h('input', { class: 'campo-testo', type: 'text' }) as HTMLInputElement;
    inp.value = valore;
    const vai = () => { fatto = true; ok(inp.value); d.chiudi(); };
    inp.addEventListener('keydown', (e: Event) => { const k = e as KeyboardEvent; if (k.key === 'Enter' && (!multilinea || k.ctrlKey)) { k.preventDefault(); vai(); } });
    d.corpo.append(h('label', { class: 'etichetta' }, etichetta), inp);
    d.piede.append(h('button', { class: 'btn', on: { click: () => d.chiudi() } }, 'Annulla'), h('button', { class: 'btn primario', on: { click: vai } }, 'OK'));
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

// ——— menu contestuale ———
export interface VoceMenu { nome?: string; tasto?: string; fn?: () => void; disattiva?: boolean; sep?: boolean; sotto?: VoceMenu[]; spunta?: boolean; /** al passaggio del puntatore (per sentire un suono prima di sceglierlo) */ sopra?: () => void }

/** tiene un menu dentro lo schermo (la barra di Windows non lo copre più): se sfora sotto sale, se sfora a destra si apre a sinistra */
function dentroLoSchermo(m: HTMLElement, x: number, y: number, xAlt?: number) {
  m.style.maxHeight = innerHeight - 12 + 'px';
  const r = m.getBoundingClientRect();
  let left = x;
  if (left + r.width > innerWidth - 4) left = xAlt !== undefined ? xAlt - r.width : innerWidth - r.width - 4;
  m.style.left = Math.max(4, left) + 'px';
  m.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
}

let menuAperto: HTMLElement | null = null;
export function chiudiMenu() { menuAperto?.remove(); menuAperto = null; }

export function menuContesto(x: number, y: number, voci: VoceMenu[]) {
  chiudiMenu();
  const m = costruisciMenu(voci);
  document.body.appendChild(m);
  dentroLoSchermo(m, x, y);
  menuAperto = m;
  setTimeout(() => {
    const via = (e: Event) => { if (!m.contains(e.target as Node)) { chiudiMenu(); document.removeEventListener('pointerdown', via, true); document.removeEventListener('keydown', esc, true); } };
    // Esc chiude il menu (e basta: non deve anche togliere la scelta alla clip)
    const esc = (e: KeyboardEvent) => {
      if (!m.isConnected) { document.removeEventListener('keydown', esc, true); document.removeEventListener('pointerdown', via, true); return; }
      if (e.key !== 'Escape') return;
      e.stopPropagation(); e.preventDefault(); chiudiMenu();
      document.removeEventListener('keydown', esc, true); document.removeEventListener('pointerdown', via, true);
    };
    document.addEventListener('pointerdown', via, true);
    document.addEventListener('keydown', esc, true);
  });
}

export function costruisciMenu(voci: VoceMenu[]): HTMLElement {
  const m = h('div', { class: 'menu-contesto', role: 'menu' });
  for (const v of voci) {
    if (v.sep) { m.appendChild(h('div', { class: 'sep' })); continue; }
    const riga = h('button', {
      class: 'voce' + (v.disattiva ? ' spenta' : '') + (v.sotto ? ' ha-sotto' : ''), role: 'menuitem', disabled: !!v.disattiva,
      on: { click: (e: Event) => { if (v.sotto) { e.stopPropagation(); return; } chiudiMenu(); v.fn?.(); } },
    }, h('span', { class: 'spunta' }, v.spunta ? '●' : ''), h('span', { class: 'nome' }, v.nome ?? ''), h('span', { class: 'tasto' + (/^[A-Za-z]$/.test(v.tasto ?? '') ? ' lettera' : '') }, v.tasto ?? (v.sotto ? '▸' : '')));
    if (v.sotto) {
      const sub = costruisciMenu(v.sotto);
      sub.classList.add('sotto');
      riga.appendChild(sub);
      // il sottomenu si apre accanto alla voce, ma sempre dentro lo schermo
      riga.addEventListener('pointerenter', () => {
        const r = riga.getBoundingClientRect();
        sub.style.left = r.right - 4 + 'px';
        sub.style.top = r.top - 4 + 'px';
        requestAnimationFrame(() => dentroLoSchermo(sub, r.right - 4, r.top - 4, r.left + 4));
      });
    }
    if (v.sopra) riga.addEventListener('pointerenter', v.sopra);
    m.appendChild(riga);
  }
  return m;
}

/** trascinamento con il puntatore: gestisce cattura, movimento e rilascio */
export function trascina(e: PointerEvent, muovi: (ev: PointerEvent, dx: number, dy: number) => void, fine?: (ev: PointerEvent, mosso: boolean) => void) {
  const x0 = e.clientX, y0 = e.clientY;
  const el = e.currentTarget as HTMLElement;
  let mosso = false;
  try { el.setPointerCapture(e.pointerId); } catch { /* ok */ }
  const mv = (ev: PointerEvent) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!mosso && Math.hypot(dx, dy) < 3) return;
    mosso = true;
    muovi(ev, dx, dy);
  };
  const up = (ev: PointerEvent) => {
    el.removeEventListener('pointermove', mv);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    fine?.(ev, mosso);
  };
  el.addEventListener('pointermove', mv);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Porta lo sguardo su un controllo: aspetta che compaia (fino a 2 s: la pagina o il pannello si stanno aprendo), lo fa
 * scorrere in vista e lo fa lampeggiare un attimo. Serve alla guida, alla ricerca e al Centro AI ("Fallo adesso").
 */
export function evidenzia(selettore: string, dentro: ParentNode = document) {
  const t0 = performance.now();
  const prova = () => {
    const el = dentro.querySelector(selettore) as HTMLElement | null;
    if (!el || !el.offsetParent) {
      if (performance.now() - t0 < 2000) setTimeout(prova, 80);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('evidenziato');
    void el.offsetWidth;
    el.classList.add('evidenziato');
    setTimeout(() => el.classList.remove('evidenziato'), 2600);
  };
  prova();
}
