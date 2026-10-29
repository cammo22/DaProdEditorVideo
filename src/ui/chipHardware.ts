// I due chip al centro della barra in alto: la scheda video che l'AI usa davvero e il processore.
// Leggono quello che ha trovato il rilevatore (src/media/hardware.ts) e si aggiornano da soli con l'evento dpv:hardware.
import { h } from './dom';
import { hardwareNoto, nomeDellaScheda, type Hardware } from '../media/hardware';
import { usaSchedaAI } from '../media/libreriaAI';

/** il nome corto di una scheda: «NVIDIA GeForce RTX 4060» → «RTX 4060» */
function corto(nome: string): string {
  const n = nome.replace(/\b(nvidia|geforce|amd|radeon|intel|graphics|corporation|\(tm\)|\(r\))\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const r = n || nome;
  return r.length > 26 ? r.slice(0, 25) + '…' : r;
}

export function chipHardware(): HTMLElement {
  const led = h('i', { class: 'led' });
  const gpu = h('span', { class: 'chip-hw chip-gpu' }, led, h('span', { class: 'chip-testo' }, 'Guardo la scheda…'));
  const thread = navigator.hardwareConcurrency || 0;
  const cpu = h('span', { class: 'chip-hw chip-cpu', title: 'Il processore: quanti lavori contemporanei sa fare' },
    h('i', { class: 'led ambra' }), h('span', { class: 'chip-testo' }, thread ? `${thread} thread` : 'Processore'));

  const mostra = (hw: Hardware | null) => {
    const testo = gpu.querySelector('.chip-testo') as HTMLElement;
    if (!hw) { led.className = 'led lampeggia'; testo.textContent = 'Guardo la scheda…'; gpu.title = 'Sto guardando che scheda video ha il computer'; return; }
    const s = hw.scelta >= 0 ? hw.schede[hw.scelta] : null;
    if (s && usaSchedaAI()) {
      led.className = 'led verde';
      testo.textContent = corto(nomeDellaScheda(s));
      gpu.title = `Scheda video che l'AI e le conversioni usano: ${nomeDellaScheda(s)}`;
    } else {
      led.className = 'led';
      testo.textContent = 'Solo processore';
      gpu.title = usaSchedaAI()
        ? 'Nessuna scheda video ha superato la prova: l\'AI lavora col processore (funziona lo stesso, più lenta)'
        : 'La scheda video è spenta nelle impostazioni dell\'AI: si lavora col processore';
    }
  };
  mostra(hardwareNoto());
  document.addEventListener('dpv:hardware', (e) => mostra((e as CustomEvent<Hardware>).detail ?? hardwareNoto()));
  // se l'utente accende o spegne la scheda dal Centro AI il chip si rilegge quando si torna sulla finestra
  window.addEventListener('focus', () => mostra(hardwareNoto()));
  return h('div', { class: 'bt-chip-hw' }, gpu, cpu);
}
