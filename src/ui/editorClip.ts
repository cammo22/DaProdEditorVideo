// L'editor della clip: il doppio clic su una clip (o «Modifica clip…») apre questa finestra con TUTTE le sezioni
// (posizione e grandezza, effetti e look, togli lo sfondo, segui, colore, volume, durata e velocità, entrata e uscita,
// ritaglio). Il pannello a destra tiene solo le poche cose che servono al volo.
import { store } from '../core/store';
import { withLinked } from '../core/montaggio';
import { Ispettore } from './ispettore';
import { dialogo, h } from './dom';

let aperto: { chiudi: () => void; isp: Ispettore } | null = null;

/** apre l'editor sulla clip data (la sceglie con le sue legate); `sezione` la apre già in vista */
export function apriEditorClip(id: string, sezione?: string) {
  if (!store.doc.clips.some((c) => c.id === id)) return;
  store.select(withLinked(store.doc, [id]));
  if (aperto) { aperto.isp.apriSezione(sezione ?? ''); return; }
  const isp = new Ispettore(true);
  const d = dialogo('Modifica clip', { largo: true, onChiudi: () => { isp.dispose(); aperto = null; } });
  d.el.classList.add('editor-clip');
  d.corpo.append(isp.el);
  d.piede.append(h('span', { class: 'nota' }, 'Le modifiche valgono subito e si annullano con Ctrl+Z.'), h('span', { class: 'spazio' }), h('button', { class: 'btn primario', on: { click: () => d.chiudi() } }, 'Fatto'));
  aperto = { chiudi: d.chiudi, isp };
  if (sezione) setTimeout(() => isp.apriSezione(sezione), 60);
}

export const editorClipAperto = () => !!aperto;
