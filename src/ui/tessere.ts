// Le tessere con l'anteprima: una griglia di miniature dove ogni voce (un effetto al volo, un look di colore) si vede
// già applicata al fotogramma dove sei. Un clic la accende o la spegne; quelle accese hanno la spunta. Le miniature
// si disegnano una alla volta (con una pausa fra l'una e l'altra, per non fermare il banco) e si rifanno quando sposti
// il cursore o cambia la clip. Sono le stesse del contenitore: scenaRitocco + fotoScena (src/render/provino.ts).
import { store } from '../core/store';
import { fotoScena, scenaRitocco, type Costruttore } from '../render/provino';
import { h } from './dom';

export interface Tessera {
  id: string;
  nome: string;
  info: string;
  /** è acceso adesso? */
  acceso: () => boolean;
  /** come si vede (la miniatura) */
  provino: Costruttore;
  /** il clic */
  clic: () => void;
  /** "senza": la tessera che spegne tutto (nessuna miniatura di effetto, mostra il fotogramma com'è) */
  nessuna?: boolean;
  /** la famiglia (per i filtri in cima: Colore, Atmosfera…); la tessera "senza" sta sempre */
  gruppo?: string;
}

export interface OpzioniTessere {
  /** i filtri in cima alla griglia: id e nome della famiglia (prima c'è sempre "Tutti") */
  gruppi?: [string, string][];
}

export interface Tessere { el: HTMLElement; aggiorna: () => void }

const LARGHEZZA = 112, ALTEZZA = 63;

export function tessere(voci: Tessera[], opz: OpzioniTessere = {}): Tessere {
  const griglia = h('div', { class: 'tessere' });
  const el = h('div', { class: 'tessere-blocco' });
  const celle = voci.map((v) => {
    const tela = h('canvas', { class: 'tessera-img', width: LARGHEZZA * 2, height: ALTEZZA * 2 }) as HTMLCanvasElement;
    const b = h('button', { class: 'tessera', 'data-id': v.id, title: `${v.nome} · ${v.info}`, on: { click: () => v.clic() } },
      tela, h('span', { class: 'tessera-nome' }, v.nome), h('i', { class: 'tessera-spunta' }, '✓'));
    griglia.append(b);
    return { v, tela, b };
  });
  // i filtri: una riga di pulsanti in cima, per non avere un muro di miniature tutte insieme
  let filtro = '';
  const barra = opz.gruppi?.length ? h('div', { class: 'tessere-filtri' }) : null;
  const applicaFiltro = () => {
    for (const c of celle) c.b.classList.toggle('nascosta', !!filtro && !c.v.nessuna && c.v.gruppo !== filtro);
    barra?.querySelectorAll('button').forEach((b) => b.classList.toggle('acceso', (b as HTMLElement).dataset.g === filtro));
    // le miniature che adesso si vedono si disegnano (le nascoste non si disegnano)
    if (el.isConnected && visibile) { clearTimeout(timer); timer = window.setTimeout(() => void disegna(), 120); }
  };
  if (barra) {
    const tutti: [string, string][] = [['', 'Tutti'], ...opz.gruppi!];
    for (const [id, nome] of tutti) barra.append(h('button', { class: 'tessere-filtro' + (id === filtro ? ' acceso' : ''), 'data-g': id, on: { click: () => { filtro = id; applicaFiltro(); } } }, nome));
  }
  el.append(...(barra ? [barra] : []), griglia);
  const stato = () => { for (const c of celle) c.b.classList.toggle('acceso', c.v.acceso()); };
  // le miniature una alla volta, e solo finché la griglia si vede (se la sezione si chiude il lavoro si ferma)
  let giro = 0, visibile = false, timer = 0;
  const disegna = async () => {
    const mio = ++giro;
    for (const c of celle) {
      if (mio !== giro || !el.isConnected || !visibile) return;
      if (c.b.classList.contains('nascosta')) continue;
      try { await fotoScena(c.v.nessuna ? scenaRitocco(() => {}) : c.v.provino, c.v.nessuna ? 0.2 : 0.95, c.tela); } catch { /* resta com'era */ }
      // una pausa fra l'una e l'altra: il banco resta pronto ai clic
      await new Promise((r) => setTimeout(r, 70));
    }
  };
  let montato = false;
  const togli = store.on('head', () => {
    if (el.isConnected) montato = true;
    else if (montato) { togli(); osserva.disconnect(); return; }
    clearTimeout(timer);
    timer = window.setTimeout(() => { if (el.isConnected && visibile) void disegna(); }, 450);
  });
  stato();
  const osserva: IntersectionObserver = new IntersectionObserver((es) => {
    const v = es.some((e) => e.isIntersecting);
    if (v === visibile) return;
    visibile = v;
    if (v) void disegna(); else giro++;
  });
  osserva.observe(el);
  return { el, aggiorna: stato };
}
