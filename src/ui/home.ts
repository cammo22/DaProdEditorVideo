// La pagina iniziale: il banco da cui si parte. Tre cose: «Da dove comincio» (progetto nuovo con i formati, apri,
// registra, importa e monta), «Ultimi» (i progetti recenti con la miniatura) e «Come sta il PC» (scheda video, AI,
// modelli, spazio, versione) con un tasto solo, «Aggiusta tutto», che sistema quello che si può e dice come è andata
// passo per passo. Compare quando si apre il programma (se non si è aperto un file col doppio clic) e quando si preme
// «Progetti» in alto o File → Pagina iniziale. Funziona anche nel browser (versione prova): i passi che lì non servono
// lo dicono. Stile: src/stile/home.css (le classi nuove cominciano con «hm-»).
import '../stile/home.css';
import { store } from '../core/store';
import { CADENZE, OBIETTIVI, RISOLUZIONI, formatoDa } from '../core/tipi';
import { apri, apriRecente, dimenticaRecente, nuovo, recenti, type Recente } from '../progetti';
import { hardwareNoto, messaggioScheda, nomeDellaScheda, rilevaHardware } from '../media/hardware';
import { usaSchedaAI } from '../media/libreriaAI';
import { invoke, isAndroid, isTauri } from '../platform';
import { h, icona } from './dom';
import { VERSIONE } from './dialoghi';
import { controllaAggiornamento, finestraAggiornamenti } from './aggiornamenti';
import { finestraCentroAI, riassuntoModelli, riparaAI, spazioModelli } from './centroAI';

const quando = (t: number) => {
  const d = Date.now() - t;
  if (d < 60_000) return 'adesso';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min fa`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} ore fa`;
  const g = Math.floor(d / 86_400_000);
  return g === 1 ? 'ieri' : g < 30 ? `${g} giorni fa` : new Date(t).toLocaleDateString('it-IT');
};
const evento = (nome: string, detail?: unknown) => document.dispatchEvent(new CustomEvent(nome, { detail }));
const durataUmana = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`; };
/** 1,3 GB oppure 480 MB, in due pezzi: il numero va sul display a sette segmenti, l'unità accanto */
const pesoParti = (byte: number): [string, string] => (byte >= 1 << 30 ? [(byte / (1 << 30)).toFixed(1), 'GB'] : [String(Math.max(0, Math.round(byte / (1 << 20)))), 'MB']);
const messaggioErrore = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Luce = '' | 'ok' | 'no' | 'forse';
interface Tessera { el: HTMLElement; imposta: (luce: Luce, valore: (Node | string)[], sotto: string, azione?: { testo: string; fai: () => void }) => void }
type StatoPasso = 'attesa' | 'corre' | 'ok' | 'no' | 'salta';
interface Passo { id: string; nome: string; stato: StatoPasso; testo: string }
type Esito = { stato: 'ok' | 'no' | 'salta'; testo: string };

/** una finestrella del banco: LED, titolo, il valore sul display e una riga che spiega */
function tessera(titolo: string): Tessera {
  const led = h('i', { class: 'hm-led' });
  const valore = h('b', { class: 'hm-valore' }, '…');
  const sotto = h('small', { class: 'hm-sotto' });
  const el = h('div', { class: 'hm-tessera' }, h('div', { class: 'hm-tessera-testa' }, led, h('small', { class: 'hm-titolo' }, titolo)), valore, sotto);
  return {
    el,
    imposta(luce, v, riga, azione) {
      led.className = 'hm-led ' + luce;
      valore.replaceChildren(...v.map((x) => (typeof x === 'string' ? document.createTextNode(x) : x)));
      sotto.replaceChildren(riga, azione ? h('button', { class: 'btn-mini hm-azione', on: { click: azione.fai } }, azione.testo) : '');
    },
  };
}
/** numero sul display a sette segmenti, con la sua unità in carattere normale */
const display = (numero: string, unita = '') => [h('span', { class: 'hm-seg' }, numero), unita ? h('span', { class: 'hm-unita' }, ' ' + unita) : ''] as (Node | string)[];

export class Home {
  el: HTMLElement;
  private corpo: HTMLElement;
  /** la scelta per il progetto nuovo: risoluzione e fotogrammi al secondo (di partenza Full HD a 25) */
  private ris = 'fhd';
  private cad = '25';
  visibile = false;
  /** i passi di «Aggiusta tutto», con l'ultimo esito (restano finché non si ripremi il tasto) */
  private passi: Passo[] = [
    { id: 'file', nome: 'Apertura dei file', stato: 'attesa', testo: 'Fa aprire i .dap, .daprod e .dpv col doppio clic' },
    { id: 'cartelle', nome: 'Cartelle di lavoro', stato: 'attesa', testo: 'Video/DaProd Video e Registrazioni' },
    { id: 'ai', nome: 'Motore e modelli AI', stato: 'attesa', testo: 'Lo stesso controllo del Centro AI' },
    { id: 'agg', nome: 'Aggiornamenti', stato: 'attesa', testo: 'Guarda se è uscita una versione nuova' },
  ];
  private aggiustando = false;
  private elPassi: HTMLElement | null = null;
  private elRiga: HTMLElement | null = null;
  private tasto: HTMLButtonElement | null = null;
  private tess: Record<'scheda' | 'ai' | 'modelli' | 'spazio' | 'versione' | 'file', Tessera> | null = null;

  constructor(private vaiAMontage: () => void, private vaiALive: () => void) {
    this.corpo = h('div', { class: 'home-corpo hm-corpo' });
    this.el = h('div', { class: 'home hm', style: 'display:none' },
      h('div', { class: 'home-dentro hm-dentro' },
        h('header', { class: 'home-testa hm-testa' },
          h('span', { class: 'moneta' }, 'D'),
          h('div', null, h('b', null, 'DaProd Video'), h('small', null, 'da dove vuoi cominciare?')),
          h('span', { class: 'hm-targa', title: 'La versione del programma' }, h('i', { class: 'hm-led ok' }), h('span', { class: 'hm-seg' }, VERSIONE)),
          h('button', { class: 'btn-icona home-chiudi', title: 'Torna al montaggio (Esc)', on: { click: () => this.nascondi() } }, icona('x', 18))),
        this.corpo));
    document.addEventListener('keydown', (e) => { if (this.visibile && e.key === 'Escape' && !document.querySelector('.cerca-velo, .velo')) { e.stopPropagation(); this.nascondi(); } }, true);
    // chi porta da un'altra parte (la ricerca, la guida) chiude la pagina iniziale
    document.addEventListener('dpv:home-nascondi', () => { if (this.visibile) this.nascondi(); });
  }

  mostra() {
    this.disegna();
    this.el.style.display = '';
    this.visibile = true;
    // i tasti del montaggio non arrivano al banco nascosto qui sotto (prima Spazio suonava e 2 toglieva una clip)
    document.documentElement.classList.add('home-aperta');
    void this.aggiornaPc();
  }

  nascondi() {
    this.el.style.display = 'none';
    this.visibile = false;
    document.documentElement.classList.remove('home-aperta');
  }

  private disegna() {
    this.corpo.replaceChildren(this.colonnaInizio(), h('div', { class: 'hm-destra' }, this.sezioneUltimi(), this.sezionePc()));
  }

  // ——— 1 · da dove comincio ———
  private colonnaInizio(): HTMLElement {
    const p = store.doc;
    const inCorso = p.clips.length || p.media.length;
    // il formato del progetto nuovo
    const riassunto = h('div', { class: 'home-formato-riga' });
    const aggiorna = () => {
      const f = formatoDa(this.ris, this.cad);
      riassunto.replaceChildren(h('b', null, `${f.w}×${f.h}`), ` · ${RISOLUZIONI.find((r) => r.id === this.ris)?.nome ?? ''} · `, h('b', null, `${CADENZE.find((c) => c.id === this.cad)?.nome ?? ''} fps`));
      col.querySelectorAll('[data-ris]').forEach((c) => c.classList.toggle('acceso', (c as HTMLElement).dataset.ris === this.ris));
      col.querySelectorAll('[data-cad]').forEach((c) => c.classList.toggle('acceso', (c as HTMLElement).dataset.cad === this.cad));
      col.querySelectorAll('[data-ob]').forEach((c) => { const o = OBIETTIVI.find((x) => x.id === (c as HTMLElement).dataset.ob); c.classList.toggle('acceso', !!o && o.ris === this.ris && o.cad === this.cad); });
    };
    // per cosa lo fai: un clic e risoluzione e fotogrammi sono quelli giusti
    const forma = (w: number, hh: number) => { const k = 26 / Math.max(w, hh); return h('i', { class: 'home-forma', style: `width:${Math.max(8, Math.round(w * k))}px;height:${Math.max(8, Math.round(hh * k))}px` }); };
    const obiettivi = h('div', { class: 'home-obiettivi' }, OBIETTIVI.map((o) => {
      const r = RISOLUZIONI.find((x) => x.id === o.ris)!;
      return h('button', { class: 'home-obiettivo', 'data-ob': o.id, title: `${o.nome}: ${r.w}×${r.h}, ${CADENZE.find((c) => c.id === o.cad)?.nome} fotogrammi al secondo`, on: { click: () => { this.ris = o.ris; this.cad = o.cad; aggiorna(); } } },
        forma(r.w, r.h), h('span', null, h('b', null, o.nome), h('small', null, o.info)));
    }));
    // oppure si sceglie a mano
    const chipRis = h('div', { class: 'isp-chips' }, RISOLUZIONI.map((r) => h('button', { class: 'chip', 'data-ris': r.id, title: `${r.w}×${r.h} · ${r.info}`, on: { click: () => { this.ris = r.id; aggiorna(); } } }, r.nome)));
    const chipCad = h('div', { class: 'isp-chips' }, CADENZE.map((c) => h('button', { class: 'chip', 'data-cad': c.id, title: c.info, on: { click: () => { this.cad = c.id; aggiorna(); } } }, c.nome)));
    const nuovoB = h('button', { class: 'btn primario home-grande', on: { click: async () => { await nuovo(formatoDa(this.ris, this.cad)); if (!(store.dirty && store.doc.clips.length)) this.nascondi(); } } }, '＋ Nuovo progetto');
    const apriB = h('button', { class: 'btn home-grande', title: 'Un progetto .dap, .daprod o .dpv', on: { click: async () => { this.nascondi(); await apri(); } } },
      icona('apri', 16), h('span', { class: 'hm-etichetta-doppia' }, h('b', null, 'Apri un progetto…'), h('small', null, '.dap · .daprod · .dpv')));
    const registraB = h('button', { class: 'btn hm-strada hm-registra', title: 'Registra lo schermo, la voce e la webcam (F10)', on: { click: () => { this.nascondi(); this.vaiALive(); } } },
      h('i', { class: 'hm-rec' }), h('span', { class: 'hm-etichetta-doppia' }, h('b', null, 'Registra lo schermo'), h('small', null, 'pagina LIVE · F10')));
    const montaB = h('button', { class: 'btn home-grande home-montage', title: 'Butta dentro le foto e i video e il programma monta da solo', on: { click: () => { this.nascondi(); this.vaiAMontage(); } } },
      '✨', h('span', { class: 'hm-etichetta-doppia' }, h('b', null, 'Importa e monta'), h('small', null, 'DaProdMontage · foto e video, a tempo di musica')));
    const col: HTMLElement = h('section', { class: 'home-col hm-col hm-inizio' },
      h('h3', { class: 'hm-intesta' }, h('i', { class: 'hm-led ok' }), 'Da dove comincio'),
      inCorso ? h('div', { class: 'home-continua' },
        h('b', null, 'Montaggio in corso'),
        h('span', null, `${p.name || 'Montaggio senza nome'} · ${p.clips.filter((c) => c.kind !== 'fx').length} clip`),
        h('button', { class: 'btn primario', on: { click: () => this.nascondi() } }, '▶ Continua')) : null,
      h('div', { class: 'hm-nuovo' },
        h('label', { class: 'home-etichetta' }, 'Un progetto nuovo: per cosa lo fai?'), obiettivi,
        h('label', { class: 'home-etichetta' }, 'Risoluzione'), chipRis,
        h('label', { class: 'home-etichetta' }, 'Fotogrammi al secondo'), chipCad,
        riassunto, nuovoB),
      h('div', { class: 'hm-strade' }, apriB, registraB, montaB),
      // per chi comincia: la guida, la ricerca dei comandi e il Centro AI
      h('div', { class: 'home-impara' },
        h('button', { class: 'btn', on: { click: () => evento('dpv:guida', 'inizio') } }, '🚀 Il primo montaggio in un minuto'),
        h('button', { class: 'btn', on: { click: () => evento('dpv:guida') } }, '📖 Come si fa (tutte le guide, F1)'),
        h('button', { class: 'btn', on: { click: () => evento('dpv:centro-ai') } }, '✨ Centro AI: sottotitoli, sfondo, voce…'),
        h('button', { class: 'btn-mini', on: { click: () => { this.nascondi(); evento('dpv:demo'); } } }, 'Prova con il montaggio dimostrativo')));
    aggiorna();
    return col;
  }

  // ——— 2 · ultimi ———
  private sezioneUltimi(): HTMLElement {
    const lista = recenti();
    const carta = (r: Recente) => h('div', { class: 'home-carta', 'data-chiave': r.chiave, title: r.path ?? r.nome, on: { click: async () => { if (await apriRecente(r)) this.nascondi(); } } },
      r.miniatura ? h('img', { src: r.miniatura, alt: '' }) : h('div', { class: 'home-vuota' }, icona('montaggio', 30)),
      h('div', { class: 'home-info' }, h('b', null, r.nome), h('small', null, `${r.clip} clip · ${durataUmana(r.durata)} · ${r.formato}`), h('small', { class: 'hm-quando' }, quando(r.data))),
      h('button', { class: 'home-togli btn-icona', title: 'Toglila dall\'elenco (il progetto resta dov\'è)', on: { click: (e: MouseEvent) => { e.stopPropagation(); dimenticaRecente(r.chiave); this.disegna(); void this.aggiornaPc(); } } }, icona('x', 13)));
    return h('section', { class: 'home-col home-recenti hm-col hm-ultimi' },
      h('h3', { class: 'hm-intesta' }, h('i', { class: 'hm-led ok' }), 'Ultimi', h('span', { class: 'hm-conta' }, lista.length ? `${lista.length} ${lista.length === 1 ? 'progetto' : 'progetti'}` : '')),
      lista.length ? h('div', { class: 'home-griglia' }, lista.map(carta))
        : h('div', { class: 'home-nulla' }, h('b', null, 'Ancora niente'), h('p', null, 'I progetti che salvi o apri compaiono qui, con la loro miniatura, pronti da riaprire con un clic.')));
  }

  // ——— 3 · come sta il PC, e «Aggiusta tutto» ———
  private sezionePc(): HTMLElement {
    const t = {
      scheda: tessera('Scheda video'), ai: tessera('L\'AI gira sulla scheda video?'), modelli: tessera('Modelli AI pronti'),
      spazio: tessera('Spazio dei modelli'), versione: tessera('Versione'), file: tessera('Doppio clic sui file'),
    };
    t.file.el.hidden = true;
    this.tess = t;
    this.tasto = h('button', { class: 'btn primario hm-aggiusta-tasto', title: 'Sistema l\'apertura dei file, le cartelle, i modelli AI e guarda gli aggiornamenti', on: { click: () => void this.aggiustaTutto() } }, h('i', { class: 'hm-led' }), 'Aggiusta tutto') as HTMLButtonElement;
    this.tasto.disabled = this.aggiustando;
    this.elRiga = h('div', { class: 'hm-aggiusta-riga' });
    this.elPassi = h('ul', { class: 'hm-passi' });
    this.disegnaPassi();
    return h('section', { class: 'home-col hm-col hm-pc' },
      h('h3', { class: 'hm-intesta' }, h('i', { class: 'hm-led ok' }), 'Come sta il PC',
        h('button', { class: 'btn-mini hm-centro', title: 'I modelli uno per uno: scaricare, togliere, controllare', on: { click: () => finestraCentroAI() } }, 'Centro AI')),
      h('div', { class: 'hm-tessere' }, t.scheda.el, t.ai.el, t.modelli.el, t.spazio.el, t.versione.el, t.file.el),
      h('div', { class: 'hm-aggiusta' }, h('div', { class: 'hm-aggiusta-testa' }, this.tasto, this.elRiga), this.elPassi));
  }

  /** guarda com'è messo il PC e riempie le finestrelle, una alla volta man mano che le risposte arrivano */
  private async aggiornaPc() {
    const t = this.tess;
    if (!t) return;
    const vivo = () => this.tess === t;
    // scheda video e AI
    void (async () => {
      try {
        const hw = hardwareNoto() ?? await rilevaHardware();
        if (!vivo()) return;
        const s = hw.scelta >= 0 ? hw.schede[hw.scelta] : null;
        if (s) t.scheda.imposta('ok', [nomeDellaScheda(s)], `${hw.cpu} thread nel processore${hw.ram ? ` · memoria circa ${hw.ram} GB o più` : ''}`);
        else t.scheda.imposta('forse', ['Solo il processore'], hw.gpuApi ? 'nessuna scheda ha superato la prova per l\'AI' : 'questo programma non vede la scheda video (WebGPU)');
        if (!hw.gpuApi) t.ai.imposta('no', ['No'], 'WebGPU non c\'è: lavora il processore (va bene, solo più lento)');
        else if (!usaSchedaAI()) t.ai.imposta('forse', ['Spenta'], 'l\'hai spenta nelle impostazioni del Centro AI');
        else if (s && messaggioScheda().scheda) t.ai.imposta('ok', ['Sì'], `l'AI lavora sulla ${nomeDellaScheda(s)}`);
        else t.ai.imposta('forse', ['No'], 'lavora il processore: la scheda non ha passato la prova');
      } catch {
        if (!vivo()) return;
        t.scheda.imposta('forse', ['Non so'], 'non riesco a guardare la scheda video');
        t.ai.imposta('forse', ['Non so'], 'lavora il processore, che va bene lo stesso');
      }
    })();
    // modelli e spazio: le stesse funzioni del Centro AI
    void (async () => {
      try {
        const [m, sp] = await Promise.all([riassuntoModelli(), spazioModelli()]);
        if (!vivo()) return;
        const tutti = m.consigliatiPronti >= m.consigliati;
        t.modelli.imposta(tutti ? 'ok' : 'forse', display(`${m.pronti}`, `su ${m.totale}`), tutti ? 'quelli consigliati ci sono tutti (restano opzionali)' : 'I modelli sono opzionali: scegli quali scaricare nel Centro AI');
        const [n, u] = pesoParti(sp.byte);
        t.spazio.imposta(sp.n ? 'ok' : '', sp.n ? display(n, u) : ['Vuoto'], sp.n ? `${sp.n} ${sp.n === 1 ? 'modello' : 'modelli'} sul computer` : 'nessun modello scaricato ancora');
      } catch {
        if (!vivo()) return;
        t.modelli.imposta('forse', ['Non so'], 'non riesco a leggere i modelli');
        t.spazio.imposta('', ['—'], '');
      }
    })();
    // versione e aggiornamento (nel browser la versione prova è sempre l'ultima)
    void (async () => {
      if (!isTauri) { t.versione.imposta('ok', display(VERSIONE), 'versione prova sul web: è sempre l\'ultima'); return; }
      t.versione.imposta('', display(VERSIONE), 'guardo se c\'è un aggiornamento…');
      try {
        const a = await controllaAggiornamento();
        if (!vivo()) return;
        if (a.nuova) t.versione.imposta('forse', display(VERSIONE), `è uscita la ${a.versione}`, { testo: 'Aggiorna', fai: () => void finestraAggiornamenti() });
        else t.versione.imposta('ok', display(VERSIONE), 'è l\'ultima versione');
      } catch {
        if (vivo()) t.versione.imposta('', display(VERSIONE), 'non riesco a controllare gli aggiornamenti (serve internet)');
      }
    })();
    // l'apertura dei file col doppio clic (solo Windows)
    void (async () => {
      if (!isTauri || isAndroid) return;
      try {
        const r = await invoke<{ windows: boolean; a_posto: boolean; altro_programma: string[] }>('associa_file', { applica: false });
        if (!vivo() || !r.windows) return;
        t.file.el.hidden = false;
        if (r.a_posto) t.file.imposta('ok', ['Sì'], 'i .dap, .daprod e .dpv si aprono con questo programma');
        else if (r.altro_programma.length) t.file.imposta('forse', ['Altro'], `${r.altro_programma.join(', ')} si aprono con un altro programma, scelto da te`);
        else t.file.imposta('forse', ['Da fare'], '«Aggiusta tutto» li collega al programma');
      } catch { /* senza questo controllo la finestrella resta nascosta */ }
    })();
  }

  private disegnaPassi() {
    if (!this.elPassi) return;
    const segno: Record<StatoPasso, string> = { attesa: '·', corre: '…', ok: '✓', no: '✗', salta: '✓' };
    this.elPassi.replaceChildren(...this.passi.map((x) => h('li', { class: 'hm-passo ' + x.stato, 'data-passo': x.id },
      h('span', { class: 'hm-segno' }, segno[x.stato]), h('b', null, x.nome), h('span', { class: 'hm-passo-testo' }, x.testo))));
    if (this.elRiga) {
      const fatti = this.passi.filter((x) => x.stato === 'ok' || x.stato === 'salta').length;
      const finito = this.passi.every((x) => x.stato !== 'attesa' && x.stato !== 'corre');
      this.elRiga.textContent = this.aggiustando ? 'Sto sistemando, un passo alla volta…' : finito ? (fatti === this.passi.length ? 'Tutto a posto.' : `${fatti} passi su ${this.passi.length} a posto: leggi sotto cosa è rimasto.`) : 'Un tasto solo per mettere a posto il programma.';
      this.elRiga.classList.toggle('no', finito && fatti < this.passi.length);
    }
  }

  private imposta(id: string, stato: StatoPasso, testo: string) {
    const x = this.passi.find((p) => p.id === id);
    if (x) { x.stato = stato; x.testo = testo; }
    this.disegnaPassi();
  }

  /** il tasto «Aggiusta tutto»: quattro passi in fila, ognuno dice com'è andata (un passo che fallisce non ferma gli altri) */
  private async aggiustaTutto() {
    if (this.aggiustando) return;
    this.aggiustando = true;
    if (this.tasto) { this.tasto.disabled = true; this.tasto.classList.add('lavora'); }
    const giri: [string, () => Promise<Esito>][] = [
      ['file', () => this.passoFile()], ['cartelle', () => this.passoCartelle()], ['ai', () => this.passoAI()], ['agg', () => this.passoAggiornamenti()],
    ];
    for (const x of this.passi) { x.stato = 'attesa'; }
    for (const [id, fai] of giri) {
      this.imposta(id, 'corre', 'ci sto lavorando…');
      let e: Esito;
      try { e = await fai(); } catch (err) { e = { stato: 'no', testo: 'Non ci sono riuscito: ' + messaggioErrore(err) }; }
      this.imposta(id, e.stato, e.testo);
    }
    this.aggiustando = false;
    if (this.tasto) { this.tasto.disabled = false; this.tasto.classList.remove('lavora'); }
    this.disegnaPassi();
    void this.aggiornaPc();
  }

  private async passoFile(): Promise<Esito> {
    if (!isTauri) return { stato: 'salta', testo: 'Non serve qui: nel browser i progetti si aprono dal tasto «Apri».' };
    const r = await invoke<{ windows: boolean; a_posto: boolean; scritte: string[]; altro_programma: string[] }>('associa_file', { applica: true });
    if (!r.windows) return { stato: 'salta', testo: 'Non serve qui: il sistema apre i progetti col programma da solo.' };
    if (r.altro_programma.length) return { stato: 'no', testo: `Windows apre ${r.altro_programma.join(', ')} con un altro programma perché l'hai scelto tu: tasto destro sul file, «Apri con», DaProd Video, «Usa sempre».` };
    if (r.scritte.length) return { stato: 'ok', testo: `Fatto: ora ${r.scritte.join(', ')} si aprono con il doppio clic.` };
    return { stato: 'ok', testo: 'Era già tutto a posto: .dap, .daprod e .dpv si aprono con il doppio clic.' };
  }

  private async passoCartelle(): Promise<Esito> {
    if (!isTauri || isAndroid) return { stato: 'salta', testo: 'Non serve qui: i file restano dentro il programma.' };
    const c = await invoke<{ nome: string; percorso: string; creata: boolean }[]>('cartelle_lavoro');
    const nuove = c.filter((x) => x.creata);
    const dove = c[0]?.percorso ? ` (${c[0].percorso})` : '';
    return nuove.length
      ? { stato: 'ok', testo: `Ho creato ${nuove.map((x) => '«' + x.nome + '»').join(' e ')}${dove}.` }
      : { stato: 'ok', testo: `Le cartelle «DaProd Video» e «Registrazioni» ci sono già${dove}.` };
  }

  private async passoAI(): Promise<Esito> {
    const r = await riparaAI({ passo: (testo) => this.imposta('ai', 'corre', testo) });
    return { stato: r.ok ? 'ok' : 'no', testo: r.testo };
  }

  private async passoAggiornamenti(): Promise<Esito> {
    if (!isTauri) return { stato: 'salta', testo: 'Non serve qui: la versione prova sul web è sempre l\'ultima.' };
    try {
      const a = await controllaAggiornamento(true);
      return a.nuova
        ? { stato: 'ok', testo: `È uscita la ${a.versione} (hai la ${VERSIONE}): premi «Aggiorna» qui sopra, nella finestrella Versione.` }
        : { stato: 'ok', testo: `Hai l'ultima versione (${VERSIONE}).` };
    } catch (e) {
      return { stato: 'no', testo: 'Non riesco a controllare (serve internet): ' + messaggioErrore(e) };
    }
  }
}
