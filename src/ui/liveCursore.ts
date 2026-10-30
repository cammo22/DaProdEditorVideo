// Il browser non espone l'identità del monitor: la corrispondenza la indica chi registra.
import { cursoreDisponibile, schermiCursore } from '../media/cursoreLive';
import type { SchermoCursore } from '../core/zoomCursore';
import { h } from './dom';

export class SceltaSchermoLive {
  private schermi: SchermoCursore[] = [];
  private select = h('select', { class: 'live-sel', 'aria-label': 'Schermo per il cursore', disabled: !cursoreDisponibile }) as HTMLSelectElement;
  el = h('div', { class: 'live-schermo-scelta' },
    h('label', { title: cursoreDisponibile
      ? 'Scegli qui il monitor, poi lo stesso schermo intero nel selettore di Windows. Finestre, schede e più finestre non sono supportate. Clic campionati a circa 60 Hz: i colpi molto rapidi possono sfuggire.'
      : 'Zoom del cursore e clic animati sono disponibili nell’app per Windows, registrando uno schermo intero.' }, h('span', null, 'Schermo del cursore'), this.select));

  constructor() {
    this.select.append(h('option', { value: '' }, 'Scegli lo schermo…'));
    this.select.addEventListener('focus', () => void this.carica());
    // lo schermo scelto a mano si ricorda per le volte dopo
    this.select.addEventListener('change', () => { try { localStorage.setItem('dpv-live-schermo', this.select.value); } catch { /* niente */ } });
    void this.carica();
  }

  private async carica() {
    try {
      this.schermi = await schermiCursore();
      const prima = this.select.value;
      this.select.replaceChildren(h('option', { value: '' }, 'Scegli lo schermo…'), ...this.schermi.map((s, i) =>
        h('option', { value: s.id }, `Schermo ${i + 1} · ${s.width}×${s.height} (${s.left}, ${s.top})`)));
      // di partenza: quello scelto l'ultima volta, se c'è ancora, se no il primo schermo
      let ricordato = '';
      try { ricordato = localStorage.getItem('dpv-live-schermo') ?? ''; } catch { /* niente */ }
      const ids = this.schermi.map((s) => s.id);
      this.select.value = ids.includes(prima) ? prima : ids.includes(ricordato) ? ricordato : ids[0] ?? '';
    } catch { this.select.disabled = true; }
  }

  get scelto() { return this.schermi.find((s) => s.id === this.select.value); }
}
