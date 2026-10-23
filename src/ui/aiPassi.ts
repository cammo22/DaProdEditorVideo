// Un solo consenso esplicito prima di scaricare o elaborare, da qualsiasi ingresso UI.
import { store } from '../core/store';
import { progettoAttuale } from '../media/attivita';
import { modelliScaricati } from '../media/diagnosiAI';
import { usaSchedaAI, impostaSchedaAI } from '../media/libreriaAI';
import { dialogo, h } from './dom';

interface RichiestaAI {
  compito: string;
  clip?: string;
  ambito?: string;
  modello: string;
  repo?: string;
  mb?: number;
  locale?: boolean;
  dettagli?: string;
}
let aperta = false;
export async function confermaAvvioAI(o: RichiestaAI): Promise<boolean> {
  if (aperta) return false;
  const progetto = progettoAttuale();
  const clip = o.clip ? store.doc.clips.find((c) => c.id === o.clip) : undefined;
  if (o.clip && !clip) return false;
  aperta = true;
  return new Promise<boolean>((resolve) => {
    let confermato = false;
    const prima = document.activeElement as HTMLElement | null;
    const d = dialogo(o.compito + ' · prima di avviare', { onChiudi: () => { aperta = false; prima?.focus(); resolve(confermato); } });
    d.el.classList.add('ai-passi');
    const stato = h('p', { role: 'status' }, o.locale ? 'Modello senza download separato; i file del motore devono essere presenti nell’app, altrimenti può servire la rete.' : 'Controllo solo la cache locale, senza scaricare…');
    const avvia = h('button', { class: 'btn primario', on: { click: () => {
      confermato = progetto === progettoAttuale() && (!o.clip || store.doc.clips.some((c) => c.id === o.clip));
      d.chiudi();
    } } }, o.locale ? 'Avvia sul computer' : 'Consenti download e avvia');
    const campo = (titolo: string, ...contenuto: HTMLElement[]) => h('section', { class: 'ai-passo' }, h('h3', null, titolo), contenuto);
    d.corpo.append(
      campo('1 · Cosa e dove', h('p', null, o.compito), h('strong', null, clip ? `Solo la clip: ${clip.name}` : o.ambito ?? 'Tutto il montaggio')),
      campo('2 · Modello scelto', h('p', null, o.modello), stato, h('p', { class: 'nota' }, 'Per cambiare modello o preset torna alle impostazioni: non parte niente finché non confermi qui.')),
      campo('3 · Risorse e risultato', h('p', null, o.locale ? 'Elaborazione sul computer.' : `Internet serve per i file mancanti. ${o.mb ? `Download massimo indicativo del modello: ${o.mb} MB.` : 'Dimensione del download non disponibile per questo motore.'} La cache può richiedere altro spazio temporaneo.`),
        h('p', null, 'Il tempo dipende da durata e hardware: la stima compare dopo i primi progressi. Stato, errori e Annulla in Attività. Pausa non disponibile per questo worker.'),
        h('details', null, h('summary', null, 'Dettagli avanzati'), h('p', null, o.dettagli ?? 'Il risultato si applica al progetto; Ctrl+Z annulla la modifica, non il download.'), h('p', null, usaSchedaAI() ? 'Preferenza: scheda video quando supportata; altrimenti processore. Il motore nativo sceglie il backend disponibile.' : 'WebGPU disattivato: i worker web usano il processore. Il motore nativo ha una scelta separata.'), h('button', { class: 'btn-mini', on: { click: () => { impostaSchedaAI(false); confermato = false; d.chiudi(); } } }, 'Usa il processore web e torna alle impostazioni'))),
      campo('4 · Avvio esplicito', h('p', null, 'Annulla torna alle impostazioni. Avvia autorizza anche gli eventuali file del motore mancanti.')));
    d.piede.append(h('button', { class: 'btn', on: { click: d.chiudi } }, 'Torna alle impostazioni'), avvia);
    d.el.setAttribute('aria-modal', 'true');
    d.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focus = [...d.el.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary')].filter((x) => x.offsetParent !== null);
      const primo = focus[0], ultimo = focus.at(-1);
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo?.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo?.focus(); }
    });
    avvia.focus();
    if (!o.locale) void modelliScaricati().then((m) => {
      const bytes = o.repo ? m.get(o.repo) : undefined;
      stato.textContent = bytes ? `File in cache: ${Math.round(bytes / 1048576)} MB. Presenza non significa modello completo: eventuali parti mancanti si scaricano solo dopo Avvia.` : 'Da scaricare o non rilevato nella cache web; il motore nativo usa una cache separata.';
    }).catch(() => { stato.textContent = 'Cache non leggibile: non posso verificare i file locali. Nessun download avviato.'; });
  });
}
