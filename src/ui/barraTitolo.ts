// La barra del titolo: sempre bianca (anche col tema scuro di Windows), e dentro le cose rapide che prima affollavano
// la testata: marchio, progetti, salva, annulla/ripeti, importa, il nome del progetto, la ricerca e gli aggiornamenti.
// Nell'app per Windows (e Linux) la finestra non ha la cornice del sistema (tauri.windows.conf.json): questa barra la
// sostituisce, si trascina, col doppio clic si ingrandisce e ha i suoi tasti — □ ✕. Sul Mac la barra del sistema
// diventa trasparente (tauri.macos.conf.json) e i tre semafori stanno sopra la nostra, a sinistra. Nel browser è la
// barra delle cose rapide, senza i tasti della finestra.
import { store } from '../core/store';
import { h, icona } from './dom';
import { NOME_PROGRAMMA } from '../nome';
import { chipHardware } from './chipHardware';
import { isAndroid, isMac, isTauri, edizione } from '../platform';

export interface AzioniBarra {
  info: () => void;
  progetti: () => void;
  salva: () => void;
  importa: () => void;
  annulla: () => void;
  ripeti: () => void;
  cerca: () => void;
  progetto: () => void;
  /** le novità della versione (il tasto ✦ accanto agli aggiornamenti) */
  novita: () => void;
  aggiornamenti: HTMLElement | null;
}

/** che finestra abbiamo: 'win' = senza cornice, coi nostri tasti; 'mac' = semafori sopra la barra; 'web' = niente */
export const tipoFinestra: 'win' | 'mac' | 'web' = isTauri && !isAndroid ? (isMac ? 'mac' : 'win') : 'web';

/** il logo: il disco con la D e il tasto play, e attorno l'anello tratteggiato che gira lento (CSS: .logo-giro .anello) */
const LOGO = `<svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true"><defs>
<linearGradient id="btlo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd54a"/><stop offset="1" stop-color="#b87a14"/></linearGradient>
<linearGradient id="btlm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7bf6"/><stop offset="1" stop-color="#8a2cff"/></linearGradient></defs>
<circle cx="32" cy="32" r="28" fill="#150e24" stroke="url(#btlo)" stroke-width="4"/>
<g class="anello"><circle cx="32" cy="32" r="21" fill="none" stroke="url(#btlm)" stroke-width="2.4" stroke-dasharray="3 3.4"/><circle cx="32" cy="11" r="3.2" fill="#ff3df2"/></g>
<path d="M24 19h9.5c8 0 13 5 13 13s-5 13-13 13H24z M30 25v14h3.2c4.3 0 7-2.6 7-7s-2.7-7-7-7z" fill="url(#btlo)" fill-rule="evenodd"/>
<path d="M34.5 28.5l5 3.5-5 3.5z" fill="#ff3df2"/></svg>`;

/** la finestra dell'app (solo nell'app sul computer) */
async function finestra() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

/** i tre tasti della finestra, disegnati come quelli di Windows */
function tastiFinestra(): HTMLElement {
  const svg = (d: string) => { const s = h('span', { class: 'bt-glifo' }); s.innerHTML = `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">${d}</svg>`; return s; };
  const RIDUCI = '<path d="M0 5h10" stroke="currentColor" stroke-width="1"/>';
  const INGRANDISCI = '<rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>';
  const RIPRISTINA = '<path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1"/>';
  const CHIUDI = '<path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/>';
  const bMax = h('button', { class: 'bt-tasto', title: 'Ingrandisci', on: { click: () => void finestra().then((w) => w.toggleMaximize()) } }, svg(INGRANDISCI));
  const segnaMax = async () => {
    try {
      const max = await (await finestra()).isMaximized();
      bMax.replaceChildren(svg(max ? RIPRISTINA : INGRANDISCI));
      bMax.title = max ? 'Ripristina' : 'Ingrandisci';
    } catch { /* niente */ }
  };
  void finestra().then((w) => { void segnaMax(); void w.onResized(() => void segnaMax()); }).catch(() => {});
  return h('div', { class: 'bt-finestra' },
    h('button', { class: 'bt-tasto', title: 'Riduci a icona', on: { click: () => void finestra().then((w) => w.minimize()) } }, svg(RIDUCI)),
    bMax,
    h('button', { class: 'bt-tasto chiudi', title: 'Chiudi', on: { click: () => void finestra().then((w) => w.close()) } }, svg(CHIUDI)));
}

export function barraTitolo(a: AzioniBarra): HTMLElement {
  document.documentElement.dataset.finestra = tipoFinestra;
  // dove non c'è un tasto la barra trascina la finestra ("deep": vale per tutto quello che c'è dentro, tasti esclusi);
  // il doppio clic la ingrandisce o la rimette com'era
  const trascina = { 'data-tauri-drag-region': 'deep' };
  const nome = h('button', { class: 'nome-progetto', title: 'Impostazioni del progetto', on: { click: a.progetto } });
  const formato = h('span', { class: 'badge formato' });
  const bAnnulla = h('button', { class: 'bt-icona bt-annulla', on: { click: a.annulla } }, icona('annulla', 16)) as HTMLButtonElement;
  const bRipeti = h('button', { class: 'bt-icona bt-ripeti', on: { click: a.ripeti } }, icona('ripeti', 16)) as HTMLButtonElement;
  const aggiorna = () => {
    const p = store.doc;
    nome.replaceChildren(...(store.dirty ? [h('span', { class: 'punto-modifica', title: 'Modifiche non salvate' })] : []), p.name);
    formato.textContent = `${p.w}×${p.h} · ${(p.rate.num / p.rate.den).toFixed(p.rate.den === 1 ? 0 : 2)}${p.drop ? ' DF' : ''}`;
    bAnnulla.disabled = !store.canUndo();
    bRipeti.disabled = !store.canRedo();
    bAnnulla.title = store.canUndo() ? `Annulla: ${store.undoLabel()} (Ctrl+Z)` : 'Niente da annullare';
    bRipeti.title = store.canRedo() ? `Ripeti: ${store.redoLabel()} (Ctrl+Y)` : 'Niente da ripetere';
    document.title = `${store.dirty ? '● ' : ''}${p.name} · DaP ${NOME_PROGRAMMA}`;
  };
  store.on('doc', aggiorna);
  store.on('status', aggiorna);
  aggiorna();

  const barra = h('header', { class: 'barra-titolo', ...trascina },
    h('button', { class: 'marchio', title: `DaP ${NOME_PROGRAMMA}`, on: { click: a.info } },
      h('span', { class: 'logo-giro', html: LOGO }), h('span', { class: 'scritta' }, h('b', null, 'DaP'), h('i', null, NOME_PROGRAMMA))),
    h('div', { class: 'bt-rapidi' },
      h('button', { class: 'btn-progetti', title: 'I tuoi progetti: nuovo, apri, recenti', on: { click: a.progetti } }, icona('apri', 15), h('span', null, 'Progetti')),
      h('button', { class: 'bt-icona', title: 'Salva (Ctrl+S)', on: { click: a.salva } }, icona('salva', 16)),
      h('button', { class: 'bt-icona', title: 'Importa video, audio, immagini (Ctrl+I)', on: { click: a.importa } }, icona('importa', 16)),
      h('span', { class: 'bt-sep' }),
      bAnnulla, bRipeti),
    h('div', { class: 'bt-centro' }, nome, formato, chipHardware()),
    h('div', { class: 'bt-destra' },
      h('span', { class: 'badge edizione' + (isTauri ? '' : ' prova') }, isTauri ? edizione : 'VERSIONE PROVA · WEB'),
      h('button', { class: 'bt-icona bt-novita', title: 'Novità di questa versione', on: { click: a.novita } }, icona('novita', 17)),
      a.aggiornamenti),
    tipoFinestra === 'win' ? tastiFinestra() : null);
  return barra;
}
