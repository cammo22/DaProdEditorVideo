// L'anteprima dentro le Proprietà (solo da guardare, senza mouse): l'immagine del monitor in piccolo, com'è adesso, nella vista
// scelta (immagine, maschera, scacchi o contorno). Serve a «Togli lo sfondo»: si controlla la scena senza guardare il monitor
// grande e senza che la rotella faccia altro che scorrere il pannello.
import { store } from '../core/store';
import { motore } from '../motore';
import { h } from './dom';

const LARGO = 288;
const VISTE = ['Immagine', 'Maschera', 'Sugli scacchi', 'Contorno'];

export function anteprimaScena(): HTMLElement {
  const p0 = store.doc;
  const H = Math.max(40, Math.round((LARGO * p0.h) / p0.w));
  const tela = h('canvas', { class: 'as-tela', width: LARGO, height: H, title: 'Come si vede adesso sul monitor' }) as HTMLCanvasElement;
  tela.style.aspectRatio = `${p0.w} / ${p0.h}`;
  const nota = h('span', { class: 'as-vista' });
  const el = h('div', { class: 'as' }, tela, nota);
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
  const uscite = [store.on('head', presto), store.on('doc', presto), store.on('sel', presto)];
  for (const e of eventi) document.addEventListener(e, presto);
  presto();
  return el;
}
