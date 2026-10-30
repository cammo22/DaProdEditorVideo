// «Controllo prima dell'uscita»: cinque spie con i fatti veri del montaggio (file presenti, spazio sul disco, caratteri
// installati, sottotitoli leggibili, effetti AI pronti). I conti sono in `src/core/controlloFinale.ts`; qui si raccolgono
// i fatti dal programma e si disegna la lista, che si aggiorna da sola quando il montaggio cambia.
import { store } from '../core/store';
import {
  controllaUscita, fontUsati, luceMaggiore, mediaInTimeline, usiAI,
  type Controllo, type MediaUsato,
} from '../core/controlloFinale';
import { FUNZIONI_AI } from '../core/funzioniAI';
import { mediaRT } from '../media/libreria';
import { maschereDi } from '../media/maschere';
import { attivitaInCorso } from '../media/attivita';
import { cartellaUscita, spazioLibero } from '../platform';
import { h } from './dom';

/** il carattere c'è? Prima si chiede al browser (@fontsource), poi si guarda se è installato nel sistema. */
async function fontPresente(famiglia: string): Promise<boolean> {
  try {
    const r = await document.fonts.load(`16px "${famiglia}"`);
    if (r.some((f) => f.status === 'loaded')) return true;
  } catch { /* si prova col sistema */ }
  try {
    const c = document.createElement('canvas').getContext('2d')!;
    const prova = 'mmmmmmmmmmlli0Oq';
    const largo = (f: string) => { c.font = `48px ${f}`; return c.measureText(prova).width; };
    return ['monospace', 'serif', 'sans-serif'].some((base) => largo(`"${famiglia}", ${base}`) !== largo(base));
  } catch { return true; }
}

export interface ControlloUscita {
  el: HTMLElement;
  /** il peso stimato del file che uscirebbe (per lo spazio sul disco) */
  imposta: (serve: number | null) => void;
  /** vista o no: con la pagina nascosta non si controlla niente */
  mostrata: (on: boolean) => void;
  /** la luce peggiore di adesso */
  luce: () => 'verde' | 'ambra' | 'rossa';
  smonta: () => void;
}

export function creaControlloUscita(): ControlloUscita {
  const lista = h('div', { class: 'ctl-lista' });
  const el = h('div', { class: 'ctl' }, lista);
  let serve: number | null = null;
  let visibile = false;
  let libero: number | null = null;
  let dove = 'il disco';
  let spazioAl = 0;
  const fonts = new Map<string, boolean>();
  const inCorso = new Set<string>();
  let ultima = '';
  let ultimaLuce: ReturnType<ControlloUscita['luce']> = 'verde';

  const stato = (m: MediaUsato): MediaUsato => {
    const rt = mediaRT(m.id);
    return m.stato === 'assente' ? m : { ...m, stato: rt ? rt.stato : 'caricamento' };
  };

  function raccogli(): Controllo[] {
    const p = store.doc;
    const usati = mediaInTimeline(p).map(stato);
    const fu = fontUsati(p);
    for (const f of fu) if (!fonts.has(f) && !inCorso.has(f)) {
      inCorso.add(f);
      void fontPresente(f).then((ok) => { fonts.set(f, ok); inCorso.delete(f); ridisegna(); });
    }
    const lavoriAI = attivitaInCorso().filter((a) => a.categoria === 'ai' && (a.stato === 'lavoro' || a.stato === 'coda' || a.stato === 'pausa')).length;
    return controllaUscita({
      usati, libero, serve, dove,
      fontUsati: fu, fontDisponibili: fonts,
      sottotitoli: p.sottotitoli, rate: p.rate,
      usiAI: usiAI(p, maschereDi), registro: FUNZIONI_AI, lavoriAI,
    });
  }

  function riga(c: Controllo): HTMLElement {
    const vai = (): void => {
      if (c.id === 'sottotitoli') document.dispatchEvent(new CustomEvent('dpv:finale', { detail: 'sottotitoli' }));
      else if (c.id === 'ai') document.dispatchEvent(new CustomEvent('dpv:centro-ai'));
    };
    const cliccabile = c.luce !== 'verde' && (c.id === 'sottotitoli' || c.id === 'ai');
    return h(cliccabile ? 'button' : 'div', {
      class: `ctl-riga ${c.luce}${cliccabile ? ' ctl-vai' : ''}`, 'data-c': c.id, title: c.aiuto ?? '',
      ...(cliccabile ? { type: 'button', on: { click: vai } } : {}),
    }, h('span', { class: 'ctl-spia', 'aria-hidden': 'true' }), h('span', { class: 'ctl-simbolo', 'aria-label': c.luce === 'verde' ? 'Pronto' : c.luce === 'rossa' ? 'Errore' : 'Da controllare' }, c.luce === 'verde' ? '✓' : '!'), h('span', { class: 'ctl-nome' }, c.nome), h('span', { class: 'ctl-dett' }, c.dettaglio));
  }

  function ridisegna() {
    if (!visibile) return;
    const cs = raccogli();
    const firma = cs.map((c) => `${c.id}|${c.luce}|${c.dettaglio}`).join('\n');
    ultimaLuce = luceMaggiore(cs.map((c) => c.luce));
    el.dataset.luce = ultimaLuce;
    if (firma === ultima) return;
    ultima = firma;
    lista.replaceChildren(...cs.map(riga));
  }

  /** lo spazio libero si rilegge al massimo ogni 5 secondi */
  async function leggiSpazio() {
    if (Date.now() - spazioAl < 5000) return;
    spazioAl = Date.now();
    const cartella = await cartellaUscita();
    dove = cartella ?? 'il browser';
    libero = await spazioLibero(cartella ?? undefined);
    ridisegna();
  }

  let giro = 0;
  const suDoc = () => { clearTimeout(giro); giro = window.setTimeout(ridisegna, 250); };
  const sciolti = [store.on('doc', suDoc)];
  let battito = 0;

  return {
    el,
    imposta(s) { if (s !== serve) { serve = s; ridisegna(); } },
    mostrata(on) {
      visibile = on;
      clearInterval(battito);
      if (!on) return;
      ridisegna();
      void leggiSpazio();
      // i file si aprono e gli effetti AI finiscono senza dire niente a nessuno: ogni tanto si riguarda
      battito = window.setInterval(() => { ridisegna(); void leggiSpazio(); }, 2000);
    },
    luce: () => ultimaLuce,
    smonta() { for (const s of sciolti) s(); clearTimeout(giro); clearInterval(battito); },
  };
}
