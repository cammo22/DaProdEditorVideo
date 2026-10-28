// L'anteprima dentro le Proprietà (solo da guardare, senza mouse): l'immagine del monitor in piccolo, com'è adesso, nella vista
// scelta (immagine, maschera, scacchi o contorno). Serve a «Togli lo sfondo»: si controlla la scena senza guardare il monitor
// grande e senza che la rotella faccia altro che scorrere il pannello.
import { store } from '../core/store';
import type { Clip } from '../core/tipi';
import { fps } from '../core/timecode';
import { motore } from '../motore';
import { h } from './dom';

const LARGO = 288;
const VISTE = ['Immagine', 'Maschera', 'Sugli scacchi', 'Contorno'];

export function anteprimaScena(clip?: Clip): HTMLElement {
  const p0 = store.doc;
  const H = Math.max(40, Math.round((LARGO * p0.h) / p0.w));
  const tela = h('canvas', { class: 'as-tela', width: LARGO, height: H, title: 'Come si vede adesso sul monitor' }) as HTMLCanvasElement;
  tela.style.aspectRatio = `${p0.w} / ${p0.h}`;
  const nota = h('span', { class: 'as-vista' });
  // il cursore per provare in un altro punto della clip: sposta il cursore del montaggio e l'anteprima si rifà da sola
  let cursore: HTMLInputElement | null = null;
  let tempo: HTMLElement | null = null;
  const sposta = () => {
    if (!cursore || !clip) return;
    const f = Math.max(clip.start, Math.min(clip.start + clip.len - 1, Math.round(store.head)));
    cursore.value = String(f);
    if (tempo) tempo.textContent = ((f - clip.start) / fps(store.doc.rate)).toFixed(1).replace('.', ',') + ' s';
  };
  const parti: HTMLElement[] = [tela, nota];
  if (clip && clip.len > 1) {
    cursore = h('input', { type: 'range', class: 'as-cursore', min: clip.start, max: clip.start + clip.len - 1, step: 1, title: 'Sposta il cursore dentro la clip per provare il ritaglio in un altro punto', 'aria-label': 'Provalo in un altro punto della clip' }) as HTMLInputElement;
    tempo = h('span', { class: 'as-tempo' });
    cursore.addEventListener('input', () => { motore.setMonitor('recorder'); motore.vaiA(Number(cursore!.value)); if (tempo) tempo.textContent = ((Number(cursore!.value) - clip.start) / fps(store.doc.rate)).toFixed(1).replace('.', ',') + ' s'; });
    parti.push(h('div', { class: 'as-prova' }, h('label', null, 'Provalo in un altro punto'), cursore, tempo));
    sposta();
  }
  const el = h('div', { class: 'as', 'data-senza-rotella': '' }, ...parti);
  const ctx = tela.getContext('2d')!;
  const px = new Uint8Array(LARGO * H * 4);
  const imm = new ImageData(new Uint8ClampedArray(LARGO * H * 4), LARGO, H);
  let attesa = 0;

  const disegna = () => {
    attesa = 0;
    if (!el.isConnected) { stacca(); return; }
    try {
      if (!motore.rec) return;
      motore.rec.leggiPiccolo(LARGO, H, px);
      for (let y = 0; y < H; y++) imm.data.set(px.subarray((H - 1 - y) * LARGO * 4, (H - y) * LARGO * 4), y * LARGO * 4);
      ctx.putImageData(imm, 0, 0);
      nota.textContent = VISTE[motore.rec.vistaChiave] ?? '';
    } catch { /* il monitor non è pronto: si riprova al prossimo cambio */ }
  };
  // il monitor si ridisegna un attimo dopo ogni cambio: si legge dopo
  const presto = () => { if (!attesa) attesa = window.setTimeout(disegna, 140); };
  const eventi = ['dpv:maschere', 'dpv:vista-sfondo', 'dpv:lavoro-sfondo'];
  const stacca = () => { for (const e of eventi) document.removeEventListener(e, presto); for (const f of uscite) f(); uscite.length = 0; };
  const uscite = [store.on('head', () => { sposta(); presto(); }), store.on('doc', presto), store.on('sel', presto)];
  for (const e of eventi) document.addEventListener(e, presto);
  presto();
  return el;
}
