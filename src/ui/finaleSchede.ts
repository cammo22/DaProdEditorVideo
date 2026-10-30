// Una sezione per volta: navigazione sempre visibile, contenuti lunghi nella lista interna.
import { h } from './dom';

export function schedeFinale(pannelli: HTMLElement[], nomi?: string[], iniziale = 0, cambiata?: (i: number) => void) {
  const corpo = h('div', { class: 'fin-schede-corpo' }, ...pannelli);
  const nav = h('nav', { class: 'fin-schede-nav', 'aria-label': 'Sezioni del pannello' });
  const scegli = (i: number) => {
    pannelli.forEach((p, n) => { p.hidden = n !== i; });
    nav.querySelectorAll('button').forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
    cambiata?.(i);
  };
  pannelli.forEach((p, i) => nav.append(h('button', {
    type: 'button', class: 'btn-mini', on: { click: () => scegli(i) },
  }, nomi?.[i] ?? p.querySelector('h4, legend')?.textContent ?? `Sezione ${i + 1}`)));
  // il titolo del pannello che ripete la scheda appena premuta è scritta in più: si nasconde
  pannelli.forEach((p, i) => {
    const t = p.querySelector(':scope > h4');
    const scheda = nav.children[i]?.textContent?.trim().toLowerCase();
    if (t && scheda && t.textContent?.trim().toLowerCase() === scheda) t.classList.add('fin-doppio');
  });
  scegli(iniziale);
  return h('div', { class: 'fin-schede' }, nav, corpo);
}

/** Aiuto breve apribile anche da tastiera. Gli errori restano nei loro elementi di stato. */
export function aiutoFinale(testo: string) {
  return h('details', { class: 'fin-aiuto' }, h('summary', { 'aria-label': 'Informazioni' }, 'i'), h('p', { class: 'nota' }, testo));
}
