// Centro attività nel pannello della libreria: non copre monitor e timeline.
import { attivitaFinite, attivitaInCorso, attivitaDaAvviare, fermaRiga, avviaRiga, avviaTutte, pausaRiga, riprendiRiga, riprovaRiga, inPausa, pausaLavori, puliscoFinite, quandoAttivita, riassuntoTesto, type Attivita } from '../media/attivita';
import { NOMI_PREPARAZIONE, PREPARAZIONI, proponiPreparazioni, statoPreparazione, type Preparazione } from '../media/libreria';
import { agisciBatch, azioniAttivita, type AzioneAttivita } from '../core/flussiUI';
import { puoRiprovare, inSovraccarico, sovraccarica, scartaDaAvviare } from '../media/attivita';
import { store } from '../core/store';
import { durataTesto } from '../core/stima';
import { h } from './dom';

export function tempoDi(a: Attivita): string {
  if (a.stato === 'manuale') return 'Da avviare · nessuna elaborazione partita';
  if (a.stato === 'pausa') return 'In pausa';
  if (a.pausaRichiesta) return 'Pausa richiesta · finisce il pezzo corrente';
  if (a.attesaMonitor) return 'In attesa del monitor';
  if (a.stato === 'coda') return 'In coda';
  if (a.stato === 'errore') return a.esito || a.messaggio || 'Non riuscita';
  if (a.stato === 'annullata') return 'Annullata';
  if (a.stato === 'finita') return a.esito || (a.errori ? `${a.errori} elementi non riusciti` : 'Completata');
  const r = a.stima.restante();
  return r === null ? 'Al lavoro' : `Mancano circa ${durataTesto(r)}`;
}
const NOMI: Record<AzioneAttivita, string> = { avvia: 'Avvia', pausa: 'Pausa', riprendi: 'Riprendi', annulla: 'Annulla', riprova: 'Riprova' };
const agisci = (a: AzioneAttivita, id: number) => {
  if (a === 'avvia') avviaRiga(id); // la proposta sparisce; il render successivo usa l'ID del gruppo reale
  else if (a === 'pausa') pausaRiga(id);
  else if (a === 'riprendi') riprendiRiga(id);
  else if (a === 'riprova') riprovaRiga(id);
  else fermaRiga(id);
};
class RigaVista {
  readonly el = h('article', { class: 'att-riga' });
  private titolo = h('b');
  private dettaglio = h('p', { class: 'nota' });
  private stato = h('p');
  private progress = h('progress', { max: 1 });
  private comandi = h('div', { class: 'workflow-azioni' });
  private firma = '';
  constructor(private a: Attivita) { this.el.append(this.titolo, this.dettaglio, this.stato, this.progress, this.comandi); this.aggiorna(); }
  aggiorna() {
    const a = this.a;
    this.titolo.textContent = a.titolo;
    this.dettaglio.textContent = a.dettaglio;
    this.stato.textContent = tempoDi(a);
    if (a.k === null) this.progress.removeAttribute('value'); else this.progress.value = a.k;
    this.progress.hidden = !['lavoro', 'coda', 'pausa'].includes(a.stato);
    const azioni = azioniAttivita({ ...a, capacita: { ...a.capacita, riprova: a.capacita.riprova && puoRiprovare(a.id) } }), firma = azioni.join();
    if ((a.stato === 'errore' || a.errori > 0) && !azioni.includes('riprova')) this.stato.textContent += ' · Torna alla funzione per scegliere le opzioni e avviare di nuovo.';
    if (firma !== this.firma) {
      this.firma = firma;
      this.comandi.replaceChildren(...azioni.map((azione) => h('button', { class: 'btn-mini', title: azione === 'pausa' && a.capacita.pausa === 'ai-confini' ? 'Si ferma dopo il pezzo corrente, senza rifarlo alla ripresa' : NOMI[azione], on: { click: () => agisci(azione, a.id) } }, NOMI[azione])));
    }
  }
}

export class CentroAttivita {
  readonly el = h('button', { class: 'att', 'aria-expanded': 'false', on: { click: () => this.aperto ? this.chiudi() : document.dispatchEvent(new CustomEvent('dpv:attivita')) } });
  private pannello: HTMLElement | null = null;
  private lista = h('div', { class: 'att-lista' });
  private file = h('div', { class: 'att-file' });
  private scelti = new Set<string>();
  private tipo = h('select', { 'aria-label': 'Tipo di preparazione', on: { change: () => this.disegnaFile() } }, PREPARAZIONI.map((p) => h('option', { value: p }, NOMI_PREPARAZIONE[p])));
  private viste = new Map<number, RigaVista>();
  private firmaFile = '';
  private pausa = h('button', { class: 'btn-mini', on: { click: () => pausaLavori(!inPausa()) } });
  private turbo = h('button', { class: 'btn-mini', on: { click: () => sovraccarica(!inSovraccarico()) } });
  constructor(private host: HTMLElement) {
    quandoAttivita(() => this.aggiorna());
    store.on('doc', () => { if (this.aperto) this.disegnaFile(); });
    document.addEventListener('dpv:attivita', (e) => {
      const ids = (e as CustomEvent<string[] | undefined>).detail;
      if (ids) this.scelti = new Set(ids);
      this.firmaFile = ''; this.apri(); this.disegnaFile();
    });
    this.aggiorna();
  }
  get aperto() { return !!this.pannello; }
  apri() {
    if (this.pannello) return;
    this.host.classList.add('att-aperta');
    this.host.closest('#app')?.classList.add('con-attivita');
    this.el.setAttribute('aria-expanded', 'true');
    this.pannello = h('section', { class: 'att-pannello', 'aria-label': 'Attività', on: { keydown: (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); this.chiudi(); } } } },
      h('header', { class: 'workflow-azioni' }, h('b', null, 'Attività'), h('button', { class: 'btn-mini', on: { click: () => this.chiudi() } }, 'Torna alla libreria')),
      h('p', { class: 'nota' }, 'Importare non avvia elaborazioni. Scegli file e preparazione: aggiungi le righe, poi avviale quando vuoi.'),
      h('label', null, 'Preparazione ', this.tipo),
      h('div', { class: 'workflow-azioni' }, h('button', { class: 'btn-mini', on: { click: () => { this.scelti = new Set(store.doc.media.map((m) => m.id)); this.firmaFile = ''; this.disegnaFile(); } } }, 'Tutti i file'), h('button', { class: 'btn-mini', on: { click: () => { this.scelti.clear(); this.firmaFile = ''; this.disegnaFile(); } } }, 'Nessuno')),
      this.file,
      h('button', { class: 'btn', on: { click: () => { proponiPreparazioni([...this.scelti], this.tipo.value as Preparazione); this.aggiorna(); } } }, 'Aggiungi da avviare'),
      h('div', { class: 'workflow-azioni' },
        h('button', { class: 'btn-mini', on: { click: () => avviaTutte({ media: [...this.scelti] }) } }, 'Avvia righe dei file scelti'),
        h('button', { class: 'btn-mini', on: { click: () => scartaDaAvviare({ media: [...this.scelti] }) } }, 'Scarta proposte dei file scelti'),
        ...(['pausa', 'riprendi', 'annulla'] as const).map((a) => h('button', { class: 'btn-mini', on: { click: () => agisciBatch(attivitaInCorso(), a, agisci) } }, NOMI[a] + ' attività in corso'))),
      this.pausa, h('details', null, h('summary', null, 'Prestazioni avanzate'), h('p', { class: 'nota' }, 'Sovraccarica aumenta il numero di lavori simultanei: il monitor può rallentare.'), this.turbo), this.lista,
      h('button', { class: 'btn-mini', on: { click: () => puliscoFinite() } }, 'Pulisci lo storico'));
    this.host.append(this.pannello);
    this.aggiorna();
    this.pannello.querySelector('button')?.focus();
  }
  chiudi() {
    this.pannello?.remove(); this.pannello = null;
    this.host.closest('#app')?.classList.remove('con-attivita');
    this.host.classList.remove('att-aperta'); this.el.setAttribute('aria-expanded', 'false'); this.el.focus();
  }
  private disegnaFile() {
    const tipo = this.tipo.value as Preparazione;
    const files = store.doc.media;
    for (const id of this.scelti) if (!files.some((m) => m.id === id)) this.scelti.delete(id);
    const firma = JSON.stringify(files.map((m) => [m.id, m.name, statoPreparazione(m.id, tipo), this.scelti.has(m.id)]));
    if (firma === this.firmaFile) return;
    this.firmaFile = firma;
    this.file.replaceChildren(...files.map((m) => {
      const s = statoPreparazione(m.id, tipo);
      return h('label', { class: 'att-file-riga' }, h('input', { type: 'checkbox', checked: this.scelti.has(m.id), on: { change: (e: Event) => { (e.target as HTMLInputElement).checked ? this.scelti.add(m.id) : this.scelti.delete(m.id); } } }), h('span', null, m.name), h('small', null, s === 'non-fatta' ? 'Mai elaborato' : s === 'non-serve' ? 'Non necessaria / non disponibile' : s));
    }));
  }
  aggiorna() {
    this.el.textContent = 'Attività · ' + riassuntoTesto();
    if (!this.pannello) return;
    this.pausa.textContent = inPausa() ? 'Consenti nuovi avvii' : 'Non avviare altro';
    this.pausa.title = 'Ferma solo le partenze in coda, non le attività già al lavoro';
    this.turbo.textContent = inSovraccarico() ? 'Disattiva Sovraccarica' : 'Sovraccarica';
    this.turbo.setAttribute('aria-pressed', String(inSovraccarico()));
    this.disegnaFile();
    const righe = [...attivitaDaAvviare(), ...attivitaInCorso(), ...attivitaFinite()];
    const ids = new Set(righe.map((r) => r.id));
    for (const [id, v] of this.viste) if (!ids.has(id)) { v.el.remove(); this.viste.delete(id); }
    for (const r of righe) { let v = this.viste.get(r.id); if (!v) { v = new RigaVista(r); this.viste.set(r.id, v); this.lista.append(v.el); } v.aggiorna(); }
  }
}
