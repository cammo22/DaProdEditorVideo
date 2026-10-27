// Centro attività: la barra in basso a destra dice cosa sta facendo il programma; un clic apre il popup con i lavori,
// i tempi, Sovraccarica, Pausa e i pulsanti per preparare i file (copie leggere, forme d'onda…).
// I dati stanno in media/attivita.ts (il registro e le code); qui si disegna e basta.
import { attivitaFinite, attivitaInCorso, attivitaDaAvviare, fermaRiga, avviaRiga, avviaTutte, scartaDaAvviare, pausaRiga, riprendiRiga, riprovaRiga, inPausa, pausaLavori, puliscoFinite, quandoAttivita, riassunto, inSovraccarico, sovraccarica, limitiForti, inAttesaPerRiproduzione, puoRiprovare, type Attivita } from '../media/attivita';
import { daPreparare, proponiPreparazioni, quandoPreparazioni, type Preparazione } from '../media/libreria';
import { azioniAttivita, type AzioneAttivita } from '../core/flussiUI';
import { store } from '../core/store';
import { durataTesto } from '../core/stima';
import { avviso, h } from './dom';

export function tempoDi(a: Attivita): string {
  if (a.stato === 'manuale') return 'Da avviare · nessuna elaborazione partita';
  if (a.stato === 'pausa') return 'In pausa';
  if (a.pausaRichiesta) return 'Pausa richiesta · finisce il pezzo corrente';
  if (a.attesaMonitor) return 'In attesa del monitor';
  if (a.stato === 'coda') return 'In coda';
  if (['errore', 'annullata', 'finita'].includes(a.stato)) {
    const esito = a.stato === 'errore' ? a.esito || a.messaggio || 'Non riuscita' : a.stato === 'annullata' ? 'Annullata' : a.esito || (a.errori ? `${a.errori} elementi non riusciti` : 'Completata');
    const ora = new Date(a.finitaAlle).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${esito} · ci ha messo ${durataTesto(a.durata)} · ${ora}`;
  }
  const r = a.stima.restante();
  return `Passati ${durataTesto(a.stima.trascorso())}${r === null ? ' · calcolo il tempo…' : ` · mancano circa ${durataTesto(r)}`}`;
}
const NOMI: Record<AzioneAttivita, string> = { avvia: 'Avvia', pausa: 'Pausa', riprendi: 'Riprendi', annulla: 'Annulla', riprova: 'Riprova' };
const agisci = (a: AzioneAttivita, id: number) => {
  if (a === 'avvia') avviaRiga(id); // la proposta sparisce; il render successivo usa l'ID del gruppo reale
  else if (a === 'pausa') pausaRiga(id);
  else if (a === 'riprendi') riprendiRiga(id);
  else if (a === 'riprova') riprovaRiga(id);
  else fermaRiga(id);
};
const ICONE: Record<Attivita['categoria'], string> = { file: '📂', analisi: '📊', proxy: '🎞', conversione: '🔧', ai: '✨', esporta: '📤', altro: '⚙' };

/** "12 fatti · 2 al lavoro · 26 in coda" per le righe che raccolgono più pezzi */
function conteggio(a: Attivita): string {
  if (a.totale <= 1) return '';
  return `${a.fatte} fatti · ${a.attivi} al lavoro · ${Math.max(0, a.totale - a.fatte - a.attivi)} in coda`;
}

class RigaVista {
  readonly el = h('article', { class: 'att-riga' });
  private titolo = h('b', { class: 'att-r-titolo' });
  private dettaglio = h('span', { class: 'att-r-dett' });
  private pct = h('span', { class: 'att-r-pct' });
  private riempi = h('i');
  private pista = h('div', { class: 'att-pista', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, this.riempi);
  private info = h('span', { class: 'att-r-info' });
  private comandi = h('div', { class: 'att-r-comandi' });
  private firma = '';
  constructor(private a: Attivita) {
    this.el.append(h('div', { class: 'att-r-testa' }, h('span', { class: 'att-r-ic' }, ICONE[a.categoria]), this.titolo, this.pct), this.dettaglio, this.pista, this.info, this.comandi);
    this.aggiorna();
  }
  aggiorna() {
    const a = this.a;
    this.el.dataset.stato = a.stato;
    this.el.classList.toggle('in-coda', a.stato === 'coda' || a.stato === 'manuale');
    this.titolo.textContent = a.titolo;
    this.dettaglio.textContent = a.dettaglio;
    const lavora = ['lavoro', 'coda', 'pausa'].includes(a.stato);
    this.el.classList.toggle('indeterminata', a.k === null && a.stato === 'lavoro');
    this.riempi.style.width = a.k === null ? '' : Math.round(a.k * 100) + '%';
    this.pct.textContent = a.k === null || !lavora ? '' : Math.round(a.k * 100) + '%';
    this.pista.hidden = !lavora;
    this.pista.setAttribute('aria-label', a.titolo + (a.k === null ? ': avanzamento indeterminato' : `: ${Math.round(a.k * 100)}%`));
    if (a.k !== null) this.pista.setAttribute('aria-valuenow', String(Math.round(a.k * 100))); else this.pista.removeAttribute('aria-valuenow');
    const quanti = conteggio(a);
    this.info.textContent = tempoDi(a) + (quanti && lavora ? ' · ' + quanti : '');
    const azioni = azioniAttivita({ ...a, capacita: { ...a.capacita, riprova: a.capacita.riprova && puoRiprovare(a.id) } }), firma = azioni.join();
    if ((a.stato === 'errore' || a.errori > 0) && !azioni.includes('riprova')) this.info.textContent += ' · Torna alla funzione per scegliere le opzioni e avviare di nuovo.';
    if (firma !== this.firma) {
      this.firma = firma;
      this.comandi.replaceChildren(...azioni.map((azione) => h('button', { class: 'btn-mini' + (azione === 'avvia' ? ' primario' : ''), title: azione === 'pausa' && a.capacita.pausa === 'ai-confini' ? 'Si ferma dopo il pezzo corrente, senza rifarlo alla ripresa' : NOMI[azione], on: { click: () => agisci(azione, a.id) } }, NOMI[azione])));
    }
  }
}

/** le preparazioni che si lanciano con un clic su tutti i file (o solo su quelli scelti nel contenitore) */
const PULSANTI: { cosa: Preparazione; icona: string; nome: string; aiuto: string }[] = [
  { cosa: 'proxy', icona: '🎞', nome: 'Copie leggere', aiuto: 'Una copia piccola e leggera di ogni video: il montaggio scorre fluido anche con file pesanti. L\'export usa sempre gli originali.' },
  { cosa: 'picchi', icona: '〰', nome: 'Forme d\'onda', aiuto: 'Disegna il suono dei file audio e video sulla timeline.' },
  { cosa: 'locandina', icona: '🖼', nome: 'Locandine', aiuto: 'L\'immagine di copertina dei video nel contenitore.' },
  { cosa: 'colore', icona: '🎨', nome: 'Colore automatico', aiuto: 'Misura luce e colore di ogni ripresa per il Colore automatico.' },
  { cosa: 'velocita', icona: '⏱', nome: 'Velocità file', aiuto: 'Controlla i video a frame rate variabile (telefono) e prepara la copia a velocità costante.' },
];

export class CentroAttivita {
  /** il pezzo da mettere nella barra di stato */
  readonly el: HTMLElement;
  private led = h('span', { class: 'att-led' });
  private testo = h('span', { class: 'att-testo' }, 'Nessuna attività');
  private riempi = h('i');
  private pista = h('span', { class: 'att-pista' }, this.riempi);
  private tempo = h('span', { class: 'att-tempo' });
  private altre = h('span', { class: 'att-altre' });
  private pannello: HTMLElement | null = null;
  private ambito: string[] | null = null;
  private vive = new Map<number, RigaVista>();
  private daAvviare = h('div', { class: 'att-lista' });
  private lista = h('div', { class: 'att-lista' });
  private finite = h('div', { class: 'att-finite' });
  private prepara = h('div', { class: 'att-prepara' });
  private nota = h('p', { class: 'att-nota' });
  private sotto = h('span', { class: 'att-p-sotto' });
  private firmaFinite: string | null = null;
  private firmaPrep = '';
  private bPausa = h('button', { class: 'btn piccolo', on: { click: () => { pausaLavori(!inPausa()); this.aggiorna(); } } });
  private bForza = h('button', {
    class: 'btn piccolo att-forza',
    title: 'Mette tutto il computer (processore e scheda video) a fare le copie e le conversioni, più file insieme e senza aspettare quando il montaggio suona. Si spegne da solo quando finisce.',
    'aria-pressed': 'false',
    on: { click: () => { sovraccarica(!inSovraccarico()); this.aggiorna(); } },
  });
  private battito = 0;
  private riposo = 0;

  constructor(_host?: HTMLElement) {
    this.el = h('button', { class: 'att att-ferma', 'aria-expanded': 'false', title: 'Cosa sta facendo il programma · clic per i lavori, i tempi e le copie leggere', on: { click: () => (this.aperto ? this.chiudi() : this.apri()) } },
      this.led, this.testo, this.pista, this.tempo, this.altre);
    quandoAttivita(() => this.aggiorna());
    quandoPreparazioni(() => { if (this.pannello) this.disegnaPrepara(); });
    store.on('doc', () => { if (this.pannello) this.disegnaPrepara(); });
    document.addEventListener('dpv:sovraccarico', (e) => {
      const d = (e as CustomEvent<{ on: boolean; daSolo: boolean }>).detail;
      if (d.on) avviso('⚡ Sovraccarica: tutto il computer lavora per le conversioni', 'info', 2600);
      else if (d.daSolo) avviso('⚡ Finito: Sovraccarica si è spento da solo', 'ok', 3200);
      this.aggiorna();
    });
    // «Prepara file…» dal contenitore e dalle Proprietà: si apre già sui file scelti
    document.addEventListener('dpv:attivita', (e) => {
      const ids = (e as CustomEvent<string[] | undefined>).detail;
      this.ambito = ids?.length ? [...ids] : null;
      this.firmaPrep = '';
      if (this.pannello) this.disegnaPrepara(); else this.apri();
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.pannello && !this.pannello.contains(e.target as Node) && !this.el.contains(e.target as Node)) this.chiudi();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.pannello) { e.stopPropagation(); this.chiudi(); } });
    window.addEventListener('resize', () => this.posiziona());
    this.aggiorna();
  }
  get aperto() { return !!this.pannello; }

  /** il battito del secondo: gira solo se c'è qualcosa in corso (per far camminare i tempi) e si ferma da solo */
  private armaBattito() {
    if (this.battito || !attivitaInCorso().length) return;
    this.battito = window.setInterval(() => {
      if (!attivitaInCorso().length) { clearInterval(this.battito); this.battito = 0; }
      this.aggiorna();
    }, 1000);
  }

  aggiorna() {
    this.armaBattito();
    const r = riassunto();
    const ultima = attivitaFinite()[0];
    const el = this.el;
    el.classList.toggle('sovraccarico', inSovraccarico());
    el.classList.toggle('att-pausa', r.righe > 0 && r.inPausa);
    if (r.righe && r.principale) {
      const p = r.principale;
      el.classList.remove('att-ferma', 'att-fatto');
      el.classList.toggle('indeterminata', p.k === null);
      this.testo.textContent = p.titolo + (p.dettaglio ? ' · ' + p.dettaglio : '');
      this.riempi.style.width = p.k === null ? '' : Math.round(p.k * 100) + '%';
      this.tempo.textContent = (p.k !== null ? Math.round(p.k * 100) + '% · ' : '') + (r.inPausa ? 'in pausa' : tempoDi(p));
      this.altre.textContent = r.righe > 1 ? `+${r.righe - 1}` : '';
      this.altre.title = r.righe > 1 ? `${r.righe - 1} altre attività in corso o in coda` : '';
    } else if (ultima && performance.now() - ultima.fine < 7000) {
      clearTimeout(this.riposo);
      this.riposo = window.setTimeout(() => this.aggiorna(), 7000 - (performance.now() - ultima.fine) + 50);
      el.classList.remove('att-ferma', 'indeterminata');
      el.classList.add('att-fatto');
      this.testo.textContent = `${ultima.stato === 'errore' ? '✕' : '✓'} ${ultima.titolo}${ultima.messaggio ? ' · ' + ultima.messaggio : ''}`;
      this.riempi.style.width = ultima.stato === 'finita' ? '100%' : '0%';
      this.tempo.textContent = '';
      this.altre.textContent = '';
    } else {
      el.classList.remove('att-fatto', 'indeterminata');
      el.classList.add('att-ferma');
      this.testo.textContent = r.manuali ? `${r.manuali} ${r.manuali === 1 ? 'pronto' : 'pronti'} da avviare` : 'Nessuna attività';
      this.riempi.style.width = '0%';
      this.tempo.textContent = '';
      this.altre.textContent = '';
    }
    if (this.pannello) this.disegnaPannello();
  }

  apri() {
    if (this.pannello) return;
    this.el.setAttribute('aria-expanded', 'true');
    this.pannello = h('section', { class: 'att-pannello', role: 'dialog', 'aria-label': 'Attività del programma' },
      h('header', { class: 'att-p-testa' }, h('b', null, 'Attività'), this.sotto, this.bForza, this.bPausa,
        h('button', { class: 'btn piccolo', title: 'Toglie dall\'elenco quelle già finite', on: { click: () => puliscoFinite() } }, 'Pulisci'),
        h('button', { class: 'btn-icona piccolo', title: 'Chiudi (Esc)', 'aria-label': 'Chiudi', on: { click: () => this.chiudi() } }, '✕')),
      this.nota, this.prepara, this.daAvviare, this.lista, h('h5', { class: 'att-p-titolo' }, 'Finite da poco'), this.finite);
    document.body.appendChild(this.pannello);
    this.firmaPrep = '';
    this.disegnaPannello();
  }

  chiudi() {
    if (!this.pannello) return;
    this.pannello.remove(); this.pannello = null;
    this.el.setAttribute('aria-expanded', 'false');
    // le righe disegnate vanno via con il pannello: alla prossima apertura si rifanno da capo
    this.vive.clear();
    this.daAvviare.replaceChildren(); this.lista.replaceChildren(); this.firmaFinite = null; this.ambito = null;
    this.el.focus();
  }

  /** sopra il riepilogo, a destra, sempre dentro lo schermo */
  private posiziona() {
    const p = this.pannello; if (!p) return;
    const r = this.el.getBoundingClientRect();
    p.style.right = Math.max(6, innerWidth - Math.max(r.right, 0)) + 'px';
    p.style.bottom = Math.max(6, innerHeight - r.top + 6) + 'px';
  }

  /** i pulsanti per preparare i file: ognuno dice quanti file ne hanno bisogno e li avvia tutti con un clic */
  private disegnaPrepara() {
    const media = store.doc.media.map((m) => m.id);
    const scelti = this.ambito ? this.ambito.filter((id) => media.includes(id)) : null;
    const ids = scelti ?? media;
    const conti = PULSANTI.map((b) => daPreparare(ids, b.cosa).length);
    const firma = JSON.stringify([ids.length, !!scelti, conti]);
    if (firma === this.firmaPrep) return;
    this.firmaPrep = firma;
    this.prepara.replaceChildren(
      h('div', { class: 'att-prepara-testa' }, h('b', null, 'Prepara i file'),
        h('span', { class: 'att-p-sotto' }, ids.length ? (scelti ? `${ids.length} file scelti` : `tutti i ${ids.length} file del progetto`) : 'nessun file nel progetto'),
        scelti ? h('button', { class: 'btn-mini', on: { click: () => { this.ambito = null; this.firmaPrep = ''; this.disegnaPrepara(); } } }, 'Tutti i file') : null),
      h('div', { class: 'att-prepara-tasti' }, PULSANTI.map((b, i) => h('button', {
        class: 'btn piccolo att-prep', 'data-prep': b.cosa, disabled: conti[i] === 0, title: b.aiuto,
        on: { click: () => this.avviaPreparazione(b.cosa, ids, b.nome) },
      }, `${b.icona} ${b.nome}`, h('small', null, conti[i] ? `${conti[i]} da fare` : ids.length ? 'tutto pronto' : '')))));
  }
  private avviaPreparazione(cosa: Preparazione, ids: string[], nome: string) {
    const fatte = proponiPreparazioni(ids, cosa, { avvia: true, forza: true });
    if (!fatte.length) avviso(`${nome}: non c'è niente da fare`, 'info', 2200);
    this.firmaPrep = ''; this.disegnaPrepara();
  }

  private disegnaPannello() {
    const p = this.pannello;
    if (!p) return;
    this.posiziona();
    this.disegnaPrepara();
    const daAv = [...attivitaDaAvviare()];
    const attuali = [...attivitaInCorso()];
    const ids = new Set([...daAv, ...attuali].map((a) => a.id));
    for (const [id, v] of this.vive) if (!ids.has(id) && !v.el.classList.contains('att-fin')) { v.el.remove(); this.vive.delete(id); }
    const metti = (lista: Attivita[], dove: HTMLElement) => {
      for (const a of lista) {
        let v = this.vive.get(a.id);
        if (!v) { v = new RigaVista(a); this.vive.set(a.id, v); }
        v.aggiorna();
      }
      const offset = dove.querySelector('.att-da-avviare-testa') ? 1 : 0;
      lista.forEach((a, i) => { const e = this.vive.get(a.id)!.el; if (dove.children[i + offset] !== e) dove.insertBefore(e, dove.children[i + offset] ?? null); });
    };
    // al lavoro prima, poi in coda
    const ordinate = [...attuali].sort((x, y) => (x.stato === 'coda' ? 1 : 0) - (y.stato === 'coda' ? 1 : 0) || x.creata - y.creata);
    if (daAv.length && !this.daAvviare.querySelector('.att-da-avviare-testa')) {
      this.daAvviare.prepend(h('div', { class: 'att-da-avviare-testa' }, h('b', null, 'Pronti da avviare'),
        h('button', { class: 'btn-mini primario', on: { click: () => avviaTutte() } }, 'Avvia tutti'),
        h('button', { class: 'btn-mini', on: { click: () => scartaDaAvviare() } }, 'Scarta')));
    } else if (!daAv.length) this.daAvviare.querySelector('.att-da-avviare-testa')?.remove();
    metti(daAv, this.daAvviare);
    metti(ordinate, this.lista);
    if (!attuali.length && !daAv.length) {
      if (!this.lista.querySelector('.att-vuoto')) this.lista.appendChild(h('p', { class: 'att-vuoto' }, 'Il programma non sta facendo niente: tutto è pronto.'));
    } else this.lista.querySelector('.att-vuoto')?.remove();
    const rs = riassunto();
    this.sotto.textContent = attuali.length ? `${rs.inCorso} al lavoro · ${rs.inCoda} in coda` : '';
    this.bForza.textContent = inSovraccarico() ? '⚡ Sovraccarico acceso' : '⚡ Sovraccarica';
    this.bForza.classList.toggle('acceso', inSovraccarico());
    this.bForza.setAttribute('aria-pressed', String(inSovraccarico()));
    this.bPausa.textContent = inPausa() ? '▶ Riprendi' : '⏸ Pausa';
    this.bPausa.title = inPausa() ? 'Fa ripartire i lavori in coda' : 'Non parte nessun lavoro nuovo (quelli al lavoro finiscono)';
    this.nota.textContent = inPausa()
      ? 'In pausa: i lavori in coda aspettano. Quelli già partiti finiscono.'
      : inSovraccarico()
        ? `Sovraccarico: fino a ${limitiForti().pesante} conversioni e ${limitiForti().leggero} analisi insieme, senza aspettare il montaggio. Si spegne da solo quando finisce.`
        : inAttesaPerRiproduzione() && attuali.some((a) => a.categoria === 'proxy' || a.categoria === 'conversione')
          ? 'Il montaggio sta suonando: le copie e le conversioni aspettano che ti fermi, per non rubare il decoder.'
          : '';
    this.nota.style.display = this.nota.textContent ? '' : 'none';
    // le finite: l'ora e la durata sono scritte una volta, l'elenco si rifà solo se è cambiato
    const fin = attivitaFinite();
    const firma = fin.map((a) => a.id + a.stato + a.finitaAlle).join('|');
    if (firma === this.firmaFinite) return;
    this.firmaFinite = firma;
    for (const [id, v] of this.vive) if (v.el.classList.contains('att-fin')) this.vive.delete(id);
    this.finite.replaceChildren(...(fin.length ? fin.map((a) => {
      const v = new RigaVista(a); v.el.classList.add('att-fin');
      return v.el;
    }) : [h('p', { class: 'att-vuoto' }, 'Ancora niente.')]));
  }
}
