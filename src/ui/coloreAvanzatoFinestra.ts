// «Colore avanzato…» dalle Proprietà: lo stesso pannello della pagina Finale, in una finestra mobile senza velo,
// così il monitor resta in vista e si vede subito l'effetto. Se ne apre una sola alla volta.
import '../stile/coloreUI.css';
import { creaPannelloColoreAvanzato } from './coloreAvanzato';
import { store } from '../core/store';
import { h, icona } from './dom';

let aperta: { clipId: string; chiudi: () => void } | null = null;

export function apriColoreAvanzato(clipId: string) {
  if (aperta?.clipId === clipId) return;
  aperta?.chiudi();
  const pannello = creaPannelloColoreAvanzato(clipId);
  const corpo = h('div', { class: 'ca-corpo' }, pannello.el);
  const chiudi = () => {
    off(); pannello.distruggi(); el.remove(); document.removeEventListener('keydown', esc, true);
    if (aperta?.chiudi === chiudi) aperta = null;
  };
  const off = store.on('doc', () => { if (!store.doc.clips.some((c) => c.id === clipId)) chiudi(); });
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && el.contains(document.activeElement)) { e.stopPropagation(); chiudi(); } };
  const testa = h('header', null, h('span', { class: 'led acceso' }), h('b', null, 'COLORE AVANZATO'),
    h('button', { class: 'btn-icona', title: 'Chiudi (Esc)', 'aria-label': 'Chiudi il colore avanzato', on: { click: chiudi } }, icona('x', 16)));
  const el = h('section', { class: 'ca-finestra', role: 'dialog', 'aria-label': 'Colore avanzato', tabindex: -1 }, testa, corpo);
  // si sposta dalla testata (eventi pointer: nell'app il trascinamento di sistema non c'è)
  testa.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    testa.setPointerCapture(e.pointerId);
    const muovi = (m: PointerEvent) => {
      el.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx)) + 'px';
      el.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy)) + 'px';
      el.style.right = 'auto';
    };
    const fine = () => { testa.removeEventListener('pointermove', muovi); testa.removeEventListener('pointerup', fine); testa.removeEventListener('pointercancel', fine); };
    testa.addEventListener('pointermove', muovi); testa.addEventListener('pointerup', fine); testa.addEventListener('pointercancel', fine);
  });
  document.addEventListener('keydown', esc, true);
  document.body.appendChild(el);
  el.focus({ preventScroll: true }); // così Esc la chiude subito
  aperta = { clipId, chiudi };
}
