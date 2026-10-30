// I suggerimenti al passaggio nel sistema «Banco»: il «title» del browser è un riquadro bianco che non c'entra con il
// resto, così lo si toglie mentre il mouse ci sta sopra e lo si mostra come targhetta sul vetrino (classe .suggerimento in
// guscio.css). Il testo torna nel «title» appena il mouse se ne va, quindi per chi usa la tastiera, lo screen reader e
// le prove non cambia niente. Parte la logica pura (dove metterlo), qui sotto il resto.

export interface Riquadro { left: number; top: number; width: number; height: number }

/** Dove mettere la targhetta: sotto l'elemento, centrata; se sotto non ci sta va sopra; mai fuori dallo schermo. */
export function posizioneSuggerimento(ancora: Riquadro, dim: { w: number; h: number }, vista: { w: number; h: number }, scarto = 8, margine = 6): { x: number; y: number; sopra: boolean } {
  let x = ancora.left + ancora.width / 2 - dim.w / 2;
  x = Math.max(margine, Math.min(x, vista.w - dim.w - margine));
  let y = ancora.top + ancora.height + scarto;
  let sopra = false;
  if (y + dim.h > vista.h - margine) {
    const su = ancora.top - dim.h - scarto;
    if (su >= margine) { y = su; sopra = true; } else y = Math.max(margine, vista.h - dim.h - margine);
  }
  return { x: Math.round(x), y: Math.round(y), sopra };
}

const ATTESA_MS = 450;

/** Accende i suggerimenti su tutta la pagina. Si può chiamare una volta sola; ritorna la funzione che li spegne. */
export function attivaSuggerimenti(radice: Document = document): () => void {
  let targa: HTMLDivElement | null = null;
  let corrente: HTMLElement | null = null;
  let testo = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rimetti = () => {
    clearTimeout(timer);
    if (corrente && testo && !corrente.hasAttribute('title')) corrente.setAttribute('title', testo);
    corrente = null; testo = '';
    if (targa) { targa.classList.remove('su'); const t = targa; targa = null; setTimeout(() => t.remove(), 140); }
  };
  const mostra = () => {
    if (!corrente || !testo || !corrente.isConnected) return;
    targa = radice.createElement('div');
    targa.className = 'suggerimento';
    targa.setAttribute('role', 'tooltip');
    targa.textContent = testo;
    radice.body.appendChild(targa);
    const r = corrente.getBoundingClientRect();
    const t = targa.getBoundingClientRect();
    const p = posizioneSuggerimento(r, { w: t.width, h: t.height }, { w: innerWidth, h: innerHeight });
    targa.style.left = p.x + 'px';
    targa.style.top = p.y + 'px';
    requestAnimationFrame(() => targa?.classList.add('su'));
  };
  const dentro = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null;
    if (!el || el === corrente) return;
    rimetti();
    const t = el.getAttribute('title')?.trim();
    if (!t) return;
    corrente = el; testo = t;
    el.removeAttribute('title');
    timer = setTimeout(mostra, ATTESA_MS);
  };
  const fuori = (e: Event) => {
    if (!corrente) return;
    const verso = (e as MouseEvent).relatedTarget as Node | null;
    if (verso && corrente.contains(verso)) return;
    rimetti();
  };
  const giu = () => rimetti();
  radice.addEventListener('pointerover', dentro, true);
  radice.addEventListener('pointerout', fuori, true);
  radice.addEventListener('pointerdown', giu, true);
  radice.addEventListener('keydown', giu, true);
  radice.addEventListener('wheel', giu, { capture: true, passive: true });
  return () => {
    radice.removeEventListener('pointerover', dentro, true);
    radice.removeEventListener('pointerout', fuori, true);
    radice.removeEventListener('pointerdown', giu, true);
    radice.removeEventListener('keydown', giu, true);
    radice.removeEventListener('wheel', giu, true);
    rimetti();
  };
}
