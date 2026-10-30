// La pulsantiera: la centralina di montaggio sotto il monitor. Tasti grandi con il numero stampato sopra,
// modi con la spia accesa, foto, zoom. Attacco/stacco, solleva/estrai e rivedi restano sui tasti (I, O, Z, X, Shift+R).
import { store } from '../core/store';
import { esegui, modi } from '../azioni';
import { h, icona } from './dom';
import type { Timeline } from './timeline';

export class Pulsantiera {
  el: HTMLElement;
  private spie: { el: HTMLElement; on: () => boolean }[] = [];

  constructor(tl: Timeline) {
    const tasto = (num: string, ic: string, nome: string, az: string, title: string, cls = '') =>
      h('button', { class: 'tasto-num ' + cls, title, on: { click: () => esegui(az) } }, h('span', { class: 'tasto-numero' + (/\d/.test(num) ? '' : ' lettera') }, num), icona(ic, 16), h('span', { class: 'nome' }, nome));
    const modo = (nome: string, az: string, on: () => boolean, title: string, ic?: string) => {
      const el = h('button', { class: 'tasto-modo', title, on: { click: () => esegui(az) } }, h('span', { class: 'led' }), ic ? icona(ic, 14) : null, h('span', null, nome));
      this.spie.push({ el, on });
      return el;
    };
    const piccolo = (nome: string, az: string, title: string, ic?: string) => h('button', { class: 'tasto-piccolo', title, on: { click: () => esegui(az) } }, ic ? icona(ic, 15) : null, nome ? h('span', null, nome) : null);
    const insSovr = h('button', { class: 'tasto-modo largo', title: 'Quando sposti o lasci una clip: LIBERO non copre niente (si ferma contro le altre), INSERISCI fa spazio spostando avanti il resto (Ins)', on: { click: () => esegui('modoInserisci') } }, h('span', { class: 'led' }), h('span', { class: 'etichetta-modo' }, 'LIBERO'));
    this.spie.push({ el: insSovr, on: () => modi.inserisci });
    this.el = h('div', { class: 'pulsantiera' },
      h('div', { class: 'gruppo-tasti numeri' },
        tasto('1', 'forbici', 'TAGLIA', 'taglia', 'Taglia al cursore (1)'),
        tasto('2', 'cestino', 'ELIMINA', 'elimina', 'Elimina la clip selezionata (2)', 'rosso'),
        tasto('3', 'chiudi', 'CHIUDI', 'eliminaChiudi', 'Elimina e chiudi il buco (3)'),
        tasto('S', 'catena', 'SEPARA', 'separa', 'Separa o unisci i gruppi di clip (S o 4)'),
        tasto('5', 'dissolvenza', 'MIX', 'dissolvenza', 'Dissolvenza sul taglio più vicino (5)'),
        tasto('Q', 'segnaIn', 'SCARTO ⇤', 'eliminaSinistra', 'Via lo scarto a sinistra del cursore (Q)'),
        tasto('W', 'segnaOut', 'SCARTO ⇥', 'eliminaDestra', 'Via lo scarto a destra del cursore (W)')),
      h('div', { class: 'gruppo-tasti' },
        insSovr,
        modo('RIPPLE', 'ripple', () => modi.ripple, 'Ripple: eliminare e accorciare chiude i buchi (R)', 'ripple'),
        modo('CALAMITA', 'snap', () => modi.snap, 'Aggancio ai tagli e al cursore (N)', 'calamita'),
        modo('TRASPARENZA', 'elastico', () => modi.elastico, 'La linea gialla della trasparenza sui video (B): accesa, clic sul video per mettere un punto e tirarlo giù per sfumare a mano (Alt+clic lo toglie). Il volume sull\'audio si vede sempre', 'elastico')),
      h('div', { class: 'gruppo-tasti' },
        piccolo('FOTO', 'istantanea', 'Istantanea del fotogramma nel contenitore (P) · Shift+P fermo immagine', 'foto')),
      h('div', { class: 'gruppo-tasti' },
        piccolo('', 'annulla', 'Annulla (Ctrl+Z)', 'annulla'),
        piccolo('', 'ripeti', 'Ripeti (Ctrl+Y)', 'ripeti'),
        h('button', { class: 'tasto-piccolo', title: 'Zoom indietro (-)', on: { click: () => tl.zoom(1 / 1.5) } }, icona('zoomMeno', 15)),
        h('button', { class: 'tasto-piccolo', title: 'Zoom avanti (+)', on: { click: () => tl.zoom(1.5) } }, icona('zoomPiu', 15)),
        h('button', { class: 'tasto-piccolo', title: 'Tutto il montaggio nella finestra (\\)', on: { click: () => tl.adattaTutto() } }, icona('adatta', 15))));
    store.on('status', () => this.aggiorna());
    this.aggiorna();
  }

  aggiorna() {
    for (const s of this.spie) s.el.classList.toggle('acceso', s.on());
    const e = this.el.querySelector('.etichetta-modo');
    if (e) e.textContent = modi.inserisci ? 'INSERISCI' : 'LIBERO';
  }
}
