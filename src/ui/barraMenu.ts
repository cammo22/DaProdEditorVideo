// La barra dei menu della testata (File, Modifica, …): le tendine si aprono col clic, passando da una voce all'altra
// col mouse si cambia tendina, e un clic fuori le chiude. Le voci si costruiscono ogni volta che si apre (così spunte
// e voci disattivate sono sempre quelle di adesso).
import { costruisciMenu, chiudiMenu, h, type VoceMenu } from './dom';

export type MenuBanco = [nome: string, voci: () => VoceMenu[]];

export function barraMenu(menus: MenuBanco[]): HTMLElement {
  const barra = h('nav', { class: 'menu' });
  let aperto: HTMLElement | null = null;
  const chiudi = () => { aperto?.remove(); aperto = null; barra.querySelectorAll('.voce-menu').forEach((b) => b.classList.remove('aperto')); };
  for (const [nome, voci] of menus) {
    const b = h('button', { class: 'voce-menu' }, nome);
    const apri = () => {
      chiudi();
      chiudiMenu();
      const m = costruisciMenu(voci());
      m.classList.add('tendina');
      const r = b.getBoundingClientRect();
      m.style.left = Math.min(r.left, innerWidth - 260) + 'px';
      m.style.top = r.bottom + 2 + 'px';
      m.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.ha-sotto')) chiudi(); });
      document.body.appendChild(m);
      aperto = m;
      b.classList.add('aperto');
    };
    b.addEventListener('click', (e) => { e.stopPropagation(); if (b.classList.contains('aperto')) chiudi(); else apri(); });
    b.addEventListener('pointerenter', () => { if (aperto && !b.classList.contains('aperto')) apri(); });
    barra.appendChild(b);
  }
  document.addEventListener('pointerdown', (e) => { if (aperto && !aperto.contains(e.target as Node) && !barra.contains(e.target as Node)) chiudi(); });
  return barra;
}
