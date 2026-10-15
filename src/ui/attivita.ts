// La barra delle attività, in basso a destra: mostra sempre cosa sta facendo il programma dietro le quinte (riaprire i
// file, forme d'onda, copie leggere, conversioni, sottotitoli…) con una barra e il tempo che manca. Un clic apre il
// pannello con tutte le righe: a che punto sono, quanto è passato, quanto manca, cosa è in coda, cosa è finito da poco.
// I dati stanno in src/media/attivita.ts (il registro e le code); qui si disegna e basta.
import {
  attivitaFinite, attivitaInCorso, fermaRiga, inAttesaPerRiproduzione, inPausa, pausaLavori, puliscoFinite, quandoAttivita, riassunto,
  type Attivita, type Categoria,
} from '../media/attivita';
import { durataTesto } from '../core/stima';
import { h } from './dom';

const ICONE: Record<Categoria, string> = { file: '📂', analisi: '📊', proxy: '🎞', conversione: '🔧', ai: '✨', esporta: '📤', altro: '⚙' };
const adesso = () => performance.now();

/** il tempo di una riga, in parole: "in coda", "mancano circa 2 min", "da 40 s" */
export function tempoDi(a: Attivita): string {
  if (a.stato === 'coda') return 'in coda';
  const passato = (adesso() - (a.inizio || a.creata)) / 1000;
  const r = a.stima.restante();
  if (r !== null) return `mancano circa ${durataTesto(r)}`;
  return a.k !== null && a.k > 0 ? 'calcolo il tempo…' : `da ${durataTesto(passato)}`;
}

/** "12 fatti · 2 al lavoro · 26 in coda" per le righe che raccolgono più pezzi */
function conteggio(a: Attivita): string {
  if (a.totale <= 1) return '';
  return `${a.fatte} fatti · ${a.attivi} al lavoro · ${Math.max(0, a.totale - a.fatte - a.attivi)} in coda`;
}

class RigaVista {
  readonly el: HTMLElement;
  private titolo = h('b', { class: 'att-r-titolo' });
  private dett = h('span', { class: 'att-r-dett' });
  private riempi = h('i');
  private pct = h('span', { class: 'att-r-pct' });
  private info = h('span', { class: 'att-r-info' });
  private stop: HTMLButtonElement;
  constructor(readonly a: Attivita) {
    this.stop = h('button', { class: 'att-r-stop', title: 'Ferma questa attività', on: { click: (e: MouseEvent) => { e.stopPropagation(); fermaRiga(a.id); } } }, '✕');
    this.el = h('div', { class: 'att-riga' },
      h('div', { class: 'att-r-testa' }, h('span', { class: 'att-r-ic' }, ICONE[a.categoria]), this.titolo, this.pct, a.annullabile ? this.stop : null),
      this.dett,
      h('div', { class: 'att-pista' }, this.riempi),
      this.info);
    this.aggiorna();
  }
  aggiorna() {
    const a = this.a;
    this.titolo.textContent = a.titolo;
    this.dett.textContent = a.dettaglio;
    this.el.classList.toggle('in-coda', a.stato === 'coda');
    this.el.classList.toggle('indeterminata', a.k === null && a.stato === 'lavoro');
    this.riempi.style.width = a.k === null ? '' : Math.round(a.k * 100) + '%';
    this.pct.textContent = a.k === null ? '' : Math.round(a.k * 100) + '%';
    const passato = a.stato === 'coda' ? '' : `passati ${durataTesto((adesso() - (a.inizio || a.creata)) / 1000)} · `;
    const quanti = conteggio(a);
    this.info.textContent = `${passato}${tempoDi(a)}${quanti ? ' · ' + quanti : ''}`;
  }
}

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
  private vive = new Map<number, RigaVista>();
  private listaVive = h('div', { class: 'att-lista' });
  private listaFinite = h('div', { class: 'att-finite' });
  private nota = h('p', { class: 'att-nota' });
  private firmaFinite: string | null = null;
  private bPausa = h('button', { class: 'btn piccolo', on: { click: () => { pausaLavori(!inPausa()); this.aggiorna(); } } });

  constructor() {
    this.el = h('button', { class: 'att att-ferma', title: 'Cosa sta facendo il programma · clic per i dettagli e i tempi', on: { click: () => { this.alterna(); this.el.blur(); } } },
      this.led, this.testo, this.pista, this.tempo, this.altre);
    quandoAttivita(() => this.aggiorna());
    // i secondi passano solo mentre si lavora: a lavoro finito nessun timer resta acceso (l'elenco delle finite ha l'ora e
    // la durata scritte una volta sola, non un "x fa" che cammina)
    document.addEventListener('pointerdown', (e) => {
      if (this.pannello && !this.pannello.contains(e.target as Node) && !this.el.contains(e.target as Node)) this.chiudi();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.pannello) this.chiudi(); });
    this.aggiorna();
  }

  get aperto() { return !!this.pannello; }

  /** il battito del secondo: gira solo se c'è qualcosa in corso (per far camminare i tempi) e si ferma da solo */
  private battito = 0;
  /** il ritorno alla scritta "Nessuna attività" dopo il ✓ (una volta sola, non un controllo a tempo) */
  private riposo = 0;
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
    const attesa = inAttesaPerRiproduzione();
    el.classList.toggle('att-pausa', r.righe > 0 && (r.inPausa || (attesa && r.principale?.categoria === 'proxy')));
    if (r.righe && r.principale) {
      const p = r.principale;
      el.classList.remove('att-ferma', 'att-fatto');
      el.classList.toggle('indeterminata', p.k === null);
      this.testo.textContent = p.titolo + (p.dettaglio ? ' · ' + p.dettaglio : '');
      this.riempi.style.width = p.k === null ? '' : Math.round(p.k * 100) + '%';
      this.tempo.textContent = (p.k !== null ? Math.round(p.k * 100) + '% · ' : '') + (r.inPausa ? 'in pausa' : tempoDi(p));
      this.altre.textContent = r.righe > 1 ? `+${r.righe - 1}` : '';
      this.altre.title = r.righe > 1 ? `${r.righe - 1} altre attività in corso o in coda` : '';
    } else if (ultima && adesso() - ultima.fine < 7000) {
      clearTimeout(this.riposo);
      this.riposo = window.setTimeout(() => this.aggiorna(), 7000 - (adesso() - ultima.fine) + 50);
      el.classList.remove('att-ferma', 'indeterminata');
      el.classList.add('att-fatto');
      this.testo.textContent = `${ultima.stato === 'errore' ? '✕' : '✓'} ${ultima.titolo}${ultima.messaggio ? ' · ' + ultima.messaggio : ''}`;
      this.riempi.style.width = ultima.stato === 'finita' ? '100%' : '0%';
      this.tempo.textContent = '';
      this.altre.textContent = '';
    } else {
      el.classList.remove('att-fatto', 'indeterminata');
      el.classList.add('att-ferma');
      this.testo.textContent = 'Nessuna attività';
      this.riempi.style.width = '0%';
      this.tempo.textContent = '';
      this.altre.textContent = '';
    }
    if (this.pannello) this.disegnaPannello();
  }

  private alterna() { if (this.pannello) this.chiudi(); else this.apri(); }

  apri() {
    if (this.pannello) return;
    this.pannello = h('section', { class: 'att-pannello', role: 'dialog', 'aria-label': 'Attività del programma' },
      h('header', { class: 'att-p-testa' }, h('b', null, 'Attività'), h('span', { class: 'att-p-sotto' }), this.bPausa,
        h('button', { class: 'btn piccolo', title: 'Toglie dall\'elenco quelle già finite', on: { click: () => puliscoFinite() } }, 'Pulisci'),
        h('button', { class: 'btn-icona piccolo', title: 'Chiudi (Esc)', on: { click: () => this.chiudi() } }, '✕')),
      this.nota, this.listaVive, h('h5', { class: 'att-p-titolo' }, 'Finite da poco'), this.listaFinite);
    document.body.appendChild(this.pannello);
    this.disegnaPannello();
  }

  chiudi() {
    this.pannello?.remove();
    this.pannello = null;
    this.vive.clear();
    this.firmaFinite = null;
  }

  private disegnaPannello() {
    const p = this.pannello;
    if (!p) return;
    // il pannello sta sopra il pezzo nella barra di stato, attaccato a destra, sempre dentro lo schermo
    const r = this.el.getBoundingClientRect();
    p.style.right = Math.max(6, innerWidth - r.right) + 'px';
    p.style.bottom = Math.max(6, innerHeight - r.top + 6) + 'px';
    // le righe in corso: si aggiornano al loro posto (così un clic su ✕ non si perde mentre si ridisegna)
    const attuali = attivitaInCorso();
    const ids = new Set(attuali.map((a) => a.id));
    for (const [id, v] of this.vive) if (!ids.has(id)) { v.el.remove(); this.vive.delete(id); }
    for (const a of attuali) {
      let v = this.vive.get(a.id);
      if (!v) { v = new RigaVista(a); this.vive.set(a.id, v); this.listaVive.appendChild(v.el); }
      v.aggiorna();
    }
    // al lavoro prima, poi in coda
    const ordinate = [...attuali].sort((x, y) => (x.stato === 'coda' ? 1 : 0) - (y.stato === 'coda' ? 1 : 0) || x.creata - y.creata);
    ordinate.forEach((a, i) => { const e = this.vive.get(a.id)!.el; if (this.listaVive.children[i] !== e) this.listaVive.insertBefore(e, this.listaVive.children[i] ?? null); });
    if (!attuali.length) {
      if (!this.listaVive.querySelector('.att-vuoto')) this.listaVive.appendChild(h('p', { class: 'att-vuoto' }, 'Il programma non sta facendo niente: tutto è pronto.'));
    } else this.listaVive.querySelector('.att-vuoto')?.remove();
    const rs = riassunto();
    (p.querySelector('.att-p-sotto') as HTMLElement).textContent = attuali.length ? `${rs.inCorso} al lavoro · ${rs.inCoda} in coda` : '';
    this.bPausa.textContent = inPausa() ? '▶ Riprendi' : '⏸ Pausa';
    this.bPausa.title = inPausa() ? 'Fa ripartire i lavori in coda' : 'Non parte nessun lavoro nuovo (quelli al lavoro finiscono)';
    this.nota.textContent = inPausa()
      ? 'In pausa: i lavori in coda aspettano. Quelli già partiti finiscono.'
      : inAttesaPerRiproduzione() && attuali.some((a) => a.categoria === 'proxy' || a.categoria === 'conversione')
        ? 'Il montaggio sta suonando: le copie e le conversioni aspettano che ti fermi, per non rubare il decoder.'
        : '';
    this.nota.style.display = this.nota.textContent ? '' : 'none';
    // le finite: l'ora e la durata sono scritte una volta, l'elenco si rifà solo se è cambiato
    const fin = attivitaFinite();
    const firma = fin.map((a) => a.id + a.stato + a.finitaAlle).join('|');
    if (firma === this.firmaFinite) return;
    this.firmaFinite = firma;
    const ora = (t: number) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    this.listaFinite.replaceChildren(...(fin.length ? fin.map((a) => h('div', { class: 'att-f ' + a.stato, title: `Finita alle ${ora(a.finitaAlle)}` },
      h('span', { class: 'att-f-seg' }, a.stato === 'finita' ? '✓' : a.stato === 'errore' ? '✕' : '–'),
      h('span', { class: 'att-f-nome' }, a.titolo, a.esito && a.stato !== 'annullata' ? h('em', { class: 'att-f-msg' }, ' · ' + a.esito) : null),
      h('span', { class: 'att-f-dur' }, a.stato === 'annullata' ? 'fermata' : `${a.stato === 'errore' ? 'si è fermata dopo' : 'ci ha messo'} ${durataTesto(a.durata)}`),
      h('span', { class: 'att-f-quando' }, ora(a.finitaAlle)))) : [h('p', { class: 'att-vuoto' }, 'Ancora niente.')]));
  }
}
