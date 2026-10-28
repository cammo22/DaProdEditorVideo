// Il contenitore, fatto come un esplora risorse: a sinistra l'albero (i file del progetto, divisi per tipo e
// nelle cartelle che fai tu; la libreria con transizioni, titoli ed effetti a gruppi), a destra le schede.
// Passa il mouse su un video e scorre avanti e indietro; su una transizione, un effetto o un titolo e lo vedi
// girare sul fotogramma vero che c'è sotto il cursore della timeline (src/render/provino.ts). Trascina nella
// timeline; "+" mette al cursore; doppio clic apre il file nel monitor. I file si trascinano nelle cartelle.
import { store } from '../core/store';
import { motore } from '../motore';
import { mediaRT, quandoAnalisi, quandoPicchi, quandoPreparazioni, statoPreparazione } from '../media/libreria';
import { fotogramma, lascia, quandoFotogramma } from '../media/fotogrammi';
import { durataUmana, fps } from '../core/timecode';
import { applicaTransizione, bersagli, inserisciGeneratore, montaDalPlayer, mettiBlocco, modi } from '../azioni';
import { DURATE, EFFETTI_TEMPO, type EffettoTempo } from '../core/blocchi';
import { importaDialogo, importaDaDrop, ricollega, togliMedia } from '../progetti';
import { avviso, chiedi, conferma, h, icona, menuContesto, type VoceMenu } from './dom';
import { registraBersaglio, trascinabile } from './trascina';
import type { Cartella, MediaItem, Transition } from '../core/tipi';
import { projectEnd, newTransition, end, clipById, uid, TITLE0 } from '../core/progetto';
import * as M from '../core/montaggio';
import { EFFETTI, TENDINE } from '../render/transizioni';
import { EFFETTI_AUDIO, EFFETTI_VIDEO, adatte, alternaEffetto, type Effetto } from '../effetti';
import { anteprimaChiara } from '../render/anteprime';
import { PRESET_TITOLI, presetTitolo } from '../core/generatori';
import { STILI_CONTO, disegnaCountdown, specAlTempo, telaTitolo } from '../render/grafica';
import { ANIMAZIONI, GRUPPI_LIBRERIA, animazioniDi, nuovaAnim } from '../core/animazioni';
import { disegnaAnimazione } from '../render/animazioni';
import { caricaFontAnimazioni } from '../render/font';
import { scenaAnimazione, scenaConto, scenaEffetto, scenaRitocco, scenaSala, scenaTitolo, scenaTransizione, suonaProvino, type Costruttore } from '../render/provino';

// ——— l'albero ———
interface Ramo { id: string; nome: string; icona: string; figli?: [string, string][] }

const TIPI: Ramo[] = [
  { id: 'tutto', nome: 'Tutti i file', icona: 'tutto' },
  { id: 'video', nome: 'Video', icona: 'video' },
  { id: 'audio', nome: 'Musica', icona: 'musica' },
  { id: 'immagini', nome: 'Immagini', icona: 'immagine' },
];

const LIBRERIA: Ramo[] = [
  { id: 'transizioni', nome: 'Transizioni', icona: 'transizione', figli: [['tr:dissolvenze', 'Dissolvenze'], ['tr:movimento', 'Movimento'], ['tr:3d', '3D e forme'], ['tr:luce', 'Luce'], ['tr:stile', 'Stile'], ['tr:tendine', 'Tendine SMPTE']] },
  { id: 'titoli', nome: 'Titoli', icona: 'titolo', figli: [['tit:titoli', 'Titoli'], ['tit:sott', 'Sottotitoli'], ['tit:tv', 'TV e social'], ['tit:conto', 'Countdown'], ['tit:sala', 'Macchine della sala']] },
  { id: 'animazioni', nome: 'Animazioni', icona: 'effetti', figli: GRUPPI_LIBRERIA.map((g): [string, string] => ['an:' + g.id, g.nome]) },
  { id: 'effetti', nome: 'Effetti', icona: 'effetti', figli: [['fx:rapidi', 'Rapidi'], ['fx:lunghi', 'Lunghi'], ['fx:luci', 'Luci'], ['fx:distorsioni', 'Distorsioni'], ['fx:colore', 'Colore'], ['fx:particelle', 'Particelle'], ['fx:clip', 'Stile della clip'], ['fx:audio', 'Audio']] },
];

/** i gruppi delle transizioni digitali (numero del modello) */
const GRUPPI_TR: Record<string, number[]> = {
  movimento: [301, 302, 303, 304, 311, 591, 321, 421, 431, 481, 551, 621, 631, 771, 811, 861],
  '3d': [401, 411, 441, 531, 541, 331, 461, 601, 801, 611, 641, 681, 751, 761, 831],
  luce: [351, 361, 451, 491, 671, 721, 651, 841, 781],
  stile: [561, 581, 571, 341, 371, 381, 391, 471, 521, 661, 691, 701, 711, 731, 741, 791],
};

const GRANDEZZE = [{ id: 'piccole', px: 86 }, { id: 'medie', px: 112 }, { id: 'grandi', px: 150 }];

const leggi = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const scrivi = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* niente */ } };

/** mette un file al cursore senza coprire niente, e porta il cursore alla fine: "+", "+", "+" fa la scaletta */
export function mettiAlCursore(m: MediaItem) {
  const srcIn = m.markIn ?? m.t0 ?? 0;
  const srcOut = m.markOut ?? (m.type === 'image' ? srcIn + 5 : m.duration);
  const f = Math.round(store.head);
  const ids = store.edit('Metti al cursore', (pp) => M.placeSource(pp, { mediaId: m.id, srcIn, srcOut }, f, null, bersagli(), modi.inserisci ? 'insert' : 'libero'));
  if (!ids.length) { avviso('Accendi una traccia del tipo giusto', 'info'); return; }
  store.select(ids);
  const fine = Math.max(...ids.map((id) => { const c = clipById(store.doc, id); return c ? end(c) : f; }));
  motore.setMonitor('recorder');
  store.setHead(fine);
  avviso(`➕ ${m.name} al cursore`, 'ok', 1200);
}

const cartelleDi = () => store.doc.cartelle ?? [];
const figlieDi = (id?: string) => cartelleDi().filter((c) => c.genitore === id);
/** la cartella e tutte quelle dentro */
function discendenti(id: string): Set<string> {
  const out = new Set([id]);
  for (let giro = true; giro;) {
    giro = false;
    for (const c of cartelleDi()) if (c.genitore && out.has(c.genitore) && !out.has(c.id)) { out.add(c.id); giro = true; }
  }
  return out;
}
const tipoDelNodo = (n: string) => (n === 'video' ? 'video' : n === 'audio' ? 'audio' : n === 'immagini' ? 'image' : null);

export class Contenitore {
  el: HTMLElement;
  private albero: HTMLElement;
  private barra: HTMLElement;
  private corpo: HTMLElement;
  private nodo = leggi('dpv-bin-nodo', 'tutto');
  private filtro = '';
  private chiusi = new Set(leggi('dpv-bin-chiusi', '').split(',').filter(Boolean));
  private grandezza = leggi('dpv-bin-grandezza', 'medie');
  /** la scheda sotto il mouse che sta scorrendo (anteprima al passaggio) */
  private scorre: { m: MediaItem; cv: HTMLCanvasElement; t: number; linea: HTMLElement } | null = null;
  private carteEffetti: { el: HTMLElement; e: Effetto }[] = [];

  /** i file scelti nel contenitore (Ctrl+clic ne aggiunge, Maiusc+clic prende un tratto) */
  private scelti = new Set<string>();
  private ultimoScelto: string | null = null;

  constructor() {
    const cerca = h('input', { class: 'bin-cerca', type: 'search', placeholder: 'Cerca…' }) as HTMLInputElement;
    cerca.addEventListener('input', () => { this.filtro = cerca.value.toLowerCase(); this.firma = ''; this.disegnaDestra(); });
    this.albero = h('nav', { class: 'bin-albero' });
    this.barra = h('div', { class: 'bin-barra' });
    this.corpo = h('div', { class: 'bin-pagina' });
    this.corpo.addEventListener('click', (e) => { if (e.target === this.corpo || (e.target as HTMLElement).classList.contains('bin-griglia')) { this.scelti.clear(); this.ultimoScelto = null; this.mostraScelti(); } });
    const grand = h('button', {
      class: 'btn-icona piccolo', title: 'Schede piccole, medie o grandi',
      on: { click: () => { const i = GRANDEZZE.findIndex((g) => g.id === this.grandezza); this.grandezza = GRANDEZZE[(i + 1) % GRANDEZZE.length].id; scrivi('dpv-bin-grandezza', this.grandezza); this.applicaGrandezza(); } },
    }, icona('griglia', 15));
    this.el = h('section', { class: 'pannello contenitore' },
      h('header', { class: 'bin-testa' },
        h('button', { class: 'btn primario piccolo', title: 'Importa (Ctrl+I): nella cartella aperta; da Video, Musica o Immagini si scelgono solo quei file', on: { click: () => void importaDialogo(this.cartellaAperta(), this.tipoAperto()) } }, icona('importa', 15), 'Importa'),
        h('button', { class: 'btn-icona piccolo', title: 'Nuova cartella', on: { click: () => void this.nuovaCartella(this.cartellaAperta()) } }, icona('cartellaPiu', 17)),
        cerca, grand,
        h('button', { class: 'btn-mini', on: { click: () => document.dispatchEvent(new CustomEvent('dpv:attivita', { detail: this.sceltiInOrdine() })) } }, 'Prepara file…')),
      h('div', { class: 'bin-corpo' }, this.albero, h('div', { class: 'bin-destra' }, this.barra, this.corpo)));
    this.applicaGrandezza();
    // file dal sistema lasciati cadere sul contenitore: vanno nella cartella aperta
    this.el.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); this.el.classList.add('sopra'); } });
    this.el.addEventListener('dragleave', () => this.el.classList.remove('sopra'));
    this.el.addEventListener('drop', (e) => {
      this.el.classList.remove('sopra');
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      e.stopPropagation();
      void importaDaDrop(e.dataTransfer, this.cartellaAperta());
    });
    // i file trascinati sull'albero entrano nella cartella (o escono dalle cartelle su "Tutti i file")
    registraBersaglio({
      el: this.albero,
      sopra: (x, y, dato) => { this.albero.querySelectorAll('.sopra').forEach((e) => e.classList.remove('sopra')); if (dato.startsWith('m:')) this.voceSotto(x, y)?.classList.add('sopra'); },
      lascia: (x, y, dato) => {
        this.albero.querySelectorAll('.sopra').forEach((e) => e.classList.remove('sopra'));
        const v = this.voceSotto(x, y);
        if (!v || !dato.startsWith('m:')) return;
        const n = v.dataset.c!;
        for (const id of dato.slice(2).split('|')) this.sposta(id, n.startsWith('dir:') ? n.slice(4) : undefined);
      },
      esci: () => this.albero.querySelectorAll('.sopra').forEach((e) => e.classList.remove('sopra')),
    });
    store.on('doc', () => { this.disegnaAlbero(); this.disegnaDestra(); });
    store.on('status', () => this.evidenzia());
    store.on('sel', () => { if (this.eLibreria(this.nodo)) this.aggiornaEffetti(); });
    let rafScroll = 0;
    this.corpo.addEventListener('scroll', () => { if (!rafScroll) rafScroll = requestAnimationFrame(() => { rafScroll = 0; this.seguiScorrimento(); }); }, { passive: true });
    // la forma d'onda cresce mentre si calcola: si rinfresca solo la tela di quella scheda (se si ridisegnasse tutta la
    // griglia a ogni passo, la pagina salterebbe e il programma andrebbe a scatti)
    quandoPicchi((id) => {
      this.picchiSporchi.add(id);
      if (!this.picchiRaf) this.picchiRaf = requestAnimationFrame(() => { this.picchiRaf = 0; for (const x of this.picchiSporchi) this.ridisegnaCarta(x); this.picchiSporchi.clear(); });
    });
    quandoAnalisi(() => {});
    quandoPreparazioni(() => this.aggiornaSchede());
    quandoFotogramma(() => { if (this.scorre) this.disegnaScorre(); });
    if (this.nodo.startsWith('dir:') && !cartelleDi().some((c) => 'dir:' + c.id === this.nodo)) this.nodo = 'tutto';
    this.disegnaAlbero();
    this.disegnaDestra();
  }

  private applicaGrandezza() {
    const g = GRANDEZZE.find((x) => x.id === this.grandezza) ?? GRANDEZZE[1];
    this.el.style.setProperty('--carta', g.px + 'px');
    this.el.dataset.grandezza = g.id;
  }

  /** la cartella aperta a destra (per importare e creare lì dentro) */
  private cartellaAperta() { return this.nodo.startsWith('dir:') ? this.nodo.slice(4) : undefined; }
  /** la categoria aperta: l'import mostra solo quel tipo di file */
  private tipoAperto() { return ({ video: 'video', audio: 'audio', immagini: 'image' } as const)[this.nodo as 'video'] as 'video' | 'audio' | 'image' | undefined; }

  private voceSotto(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y)?.closest('.bin-cat') as HTMLElement | null;
    if (!el) return null;
    const n = el.dataset.c ?? '';
    return n.startsWith('dir:') || ['tutto', 'video', 'audio', 'immagini'].includes(n) ? el : null;
  }

  // ——— le cartelle ———
  async nuovaCartella(genitore?: string) {
    const nome = await chiedi('Nuova cartella', 'Nome', 'Nuova cartella');
    if (!nome) return;
    const id = uid('d');
    store.edit('Nuova cartella', (p) => { (p.cartelle ??= []).push({ id, nome, genitore }); });
    if (genitore) this.chiusi.delete('dir:' + genitore);
    this.mostra('dir:' + id);
  }

  private async rinominaCartella(c: Cartella) {
    const nome = await chiedi('Rinomina la cartella', 'Nome', c.nome);
    if (nome) store.edit('Rinomina cartella', (p) => { const x = p.cartelle?.find((y) => y.id === c.id); if (x) x.nome = nome; });
  }

  /** la cartella sparisce: i suoi file e le sue cartelle salgono di un piano */
  private async eliminaCartella(c: Cartella) {
    const n = store.doc.media.filter((m) => m.cartella === c.id).length;
    if (n && !(await conferma('Elimina la cartella', `I ${n} file dentro "${c.nome}" non si cancellano: tornano ${c.genitore ? 'nella cartella sopra' : 'fuori dalle cartelle'}.`, 'Elimina la cartella', 'Annulla'))) return;
    store.edit('Elimina cartella', (p) => {
      for (const m of p.media) if (m.cartella === c.id) m.cartella = c.genitore;
      for (const x of p.cartelle ?? []) if (x.genitore === c.id) x.genitore = c.genitore;
      p.cartelle = (p.cartelle ?? []).filter((x) => x.id !== c.id);
    });
    if (this.nodo === 'dir:' + c.id) this.mostra(c.genitore ? 'dir:' + c.genitore : 'tutto');
  }

  /** sposta un file in una cartella (undefined = fuori dalle cartelle) */
  sposta(mediaId: string, cartella: string | undefined) {
    const m = store.doc.media.find((x) => x.id === mediaId);
    if (!m || m.cartella === cartella) return;
    store.edit('Sposta nella cartella', (p) => { const x = p.media.find((y) => y.id === mediaId); if (x) x.cartella = cartella; });
    const dove = cartella ? cartelleDi().find((c) => c.id === cartella)?.nome : null;
    avviso(dove ? `📁 ${m.name} in "${dove}"` : `${m.name} fuori dalle cartelle`, 'ok', 1400);
  }

  private menuCartelle(m: MediaItem): VoceMenu[] {
    const voci: VoceMenu[] = [{ nome: 'Fuori dalle cartelle', spunta: !m.cartella, fn: () => this.sposta(m.id, undefined) }];
    const giu = (genitore: string | undefined, rientro: string) => {
      for (const c of figlieDi(genitore)) {
        voci.push({ nome: rientro + '📁 ' + c.nome, spunta: m.cartella === c.id, fn: () => this.sposta(m.id, c.id) });
        giu(c.id, rientro + '   ');
      }
    };
    giu(undefined, '');
    voci.push({ sep: true }, { nome: 'Nuova cartella…', fn: async () => { await this.nuovaCartella(); const id = cartelleDi().at(-1)?.id; if (id) this.sposta(m.id, id); } });
    return voci;
  }

  // ——— l'albero ———
  private firmaAlbero = '';
  private disegnaAlbero() {
    const p = store.doc;
    const conta = (n: string) => {
      const t = tipoDelNodo(n);
      if (t) return p.media.filter((m) => m.type === t).length;
      if (n === 'tutto') return p.media.length;
      const dentro = discendenti(n.slice(4));
      return p.media.filter((m) => m.cartella && dentro.has(m.cartella)).length;
    };
    const firma = this.nodo + '|' + [...this.chiusi].join(',') + '|' + JSON.stringify(p.cartelle ?? []) + '|' + p.media.map((m) => m.type + (m.cartella ?? '')).join(',');
    if (firma === this.firmaAlbero) return;
    this.firmaAlbero = firma;
    const voce = (id: string, nome: string, ic: string, livello: number, extra: { figli?: boolean; n?: number } = {}) => {
      const chiuso = this.chiusi.has(id);
      const el = h('button', {
        class: 'bin-cat' + (id === this.nodo ? ' attiva' : '') + (extra.figli ? ' con-figli' : '') + (chiuso ? ' chiuso' : ''), 'data-c': id, title: nome,
        style: `--livello:${livello}`,
        on: {
          click: (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('.bin-freccia')) { this.alterna(id); return; }
            this.mostra(id);
          },
        },
      },
      extra.figli ? h('span', { class: 'bin-freccia' }, icona('freccia', 11)) : h('span', { class: 'bin-freccia vuota' }),
      icona(ic, 14), h('span', { class: 'nome' }, nome),
      extra.n !== undefined ? h('small', { class: 'conta' }, String(extra.n)) : null);
      return el;
    };
    const out: HTMLElement[] = [h('div', { class: 'bin-albero-titolo' }, 'PROGETTO')];
    for (const r of TIPI) out.push(voce(r.id, r.nome, r.icona, 0, { n: conta(r.id) }));
    const cartelle = (genitore: string | undefined, livello: number) => {
      for (const c of figlieDi(genitore)) {
        const id = 'dir:' + c.id;
        const figli = figlieDi(c.id).length > 0;
        const el = voce(id, c.nome, 'cartella', livello, { figli, n: conta(id) });
        el.classList.add('cartella');
        el.addEventListener('dblclick', () => void this.rinominaCartella(c));
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          menuContesto(e.clientX, e.clientY, [
            { nome: 'Apri', fn: () => this.mostra(id) },
            { nome: 'Importa qui dentro…', fn: () => void importaDialogo(c.id) },
            { nome: 'Nuova cartella dentro…', fn: () => void this.nuovaCartella(c.id) },
            { sep: true },
            { nome: 'Rinomina…', fn: () => void this.rinominaCartella(c) },
            { nome: 'Elimina la cartella (i file restano)', fn: () => void this.eliminaCartella(c) },
          ]);
        });
        out.push(el);
        if (figli && !this.chiusi.has(id)) cartelle(c.id, livello + 1);
      }
    };
    cartelle(undefined, 0);
    out.push(h('button', { class: 'bin-cat nuova', style: '--livello:0', title: 'Una cartella per mettere in ordine i file', on: { click: () => void this.nuovaCartella() } }, h('span', { class: 'bin-freccia vuota' }), icona('cartellaPiu', 14), h('span', { class: 'nome' }, 'Nuova cartella')));
    out.push(h('div', { class: 'bin-albero-titolo' }, 'LIBRERIA'));
    for (const r of LIBRERIA) {
      out.push(voce(r.id, r.nome, r.icona, 0, { figli: true }));
      if (!this.chiusi.has(r.id)) for (const [id, nome] of r.figli!) out.push(voce(id, nome, 'punto', 1));
    }
    this.albero.replaceChildren(...out);
  }

  private alterna(id: string) {
    if (this.chiusi.has(id)) this.chiusi.delete(id); else this.chiusi.add(id);
    scrivi('dpv-bin-chiusi', [...this.chiusi].join(','));
    this.disegnaAlbero();
  }

  /** la libreria (transizioni, titoli, animazioni, effetti) è una pagina sola che scorre: i nodi dell'albero portano al loro punto */
  private eLibreria(n: string) { return ['transizioni', 'titoli', 'animazioni', 'effetti'].includes(n) || /^(tr|tit|an|fx):/.test(n); }
  private libreriaUnita = false;
  private libreriaAScorrere = 0;

  mostra(n: string) {
    const lib = this.eLibreria(n);
    this.nodo = n;
    scrivi('dpv-bin-nodo', n);
    this.disegnaAlbero();
    if (lib && this.firma === 'libreria' + this.filtro) { this.vaiARamo(n); return; }
    this.firma = '';
    this.disegnaDestra(true);
    if (!lib) this.corpo.scrollTop = 0;
  }

  /** scorre la pagina della libreria fino alla sezione `n` */
  private vaiARamo(n: string) {
    const el = this.corpo.querySelector(`[data-ramo="${n}"]`) as HTMLElement | null;
    if (!el) return;
    this.libreriaAScorrere = performance.now();
    this.corpo.scrollTop = el.getBoundingClientRect().top - this.corpo.getBoundingClientRect().top + this.corpo.scrollTop;
  }

  /** scorrendo la libreria si accende il nodo dell'albero della sezione che si sta guardando */
  private seguiScorrimento() {
    if (this.firma !== 'libreria' + this.filtro || performance.now() - this.libreriaAScorrere < 250) return;
    const sopra = this.corpo.getBoundingClientRect().top + 24;
    let qui = '';
    for (const el of this.corpo.querySelectorAll<HTMLElement>('[data-ramo]')) { if (el.getBoundingClientRect().top <= sopra) qui = el.dataset.ramo!; else break; }
    if (!qui || qui === this.nodo) return;
    this.nodo = qui;
    scrivi('dpv-bin-nodo', qui);
    this.albero.querySelectorAll('.bin-cat').forEach((b) => b.classList.toggle('attiva', (b as HTMLElement).dataset.c === qui));
    (this.albero.querySelector(`.bin-cat[data-c="${qui}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  }

  private paginaLibreria() {
    const reale = this.corpo;
    const out: HTMLElement[] = [];
    this.libreriaUnita = true;
    try {
      for (const [radice, fn] of [['transizioni', () => this.paginaTransizioni()], ['titoli', () => this.paginaTitoli()], ['animazioni', () => this.paginaAnimazioni()], ['effetti', () => this.paginaEffetti()]] as [string, () => void][]) {
        const tmp = h('div', { class: 'bin-pagina-tmp' }) as HTMLElement;
        this.corpo = tmp;
        fn();
        out.push(h('h3', { class: 'bin-radice', 'data-ramo': radice }, this.nomeRamo(radice)), ...(Array.from(tmp.children) as HTMLElement[]));
      }
    } finally { this.corpo = reale; this.libreriaUnita = false; }
    this.percorso(h('span', { class: 'pezzo' }, 'Libreria'));
    this.barra.append(this.impostazioniBlocchi());
    reale.replaceChildren(...out);
    this.aggiornaEffetti();
  }

  private evidenzia() {
    this.corpo.querySelectorAll('.carta[data-id]').forEach((el) => el.classList.toggle('nel-monitor', motore.attivo === 'player' && (el as HTMLElement).dataset.id === motore.playerMedia));
  }

  // ——— la parte destra ———
  private firma = '';
  /** com'è messa ogni scheda (stato del file e locandina): se cambia solo questo, le schede si aggiornano al loro posto */
  private firmaVis = '';
  private picchiSporchi = new Set<string>();
  private picchiRaf = 0;
  private disegnaDestra(forza = false) {
    const n = this.nodo;
    if (this.eLibreria(n)) {
      if (forza || this.firma !== 'libreria' + this.filtro) { this.firma = 'libreria' + this.filtro; this.paginaLibreria(); this.vaiARamo(n); }
      return;
    }
    this.disegnaMedia(forza);
  }

  /** la barra sopra le schede: dove sei, e le impostazioni che valgono lì */
  private percorso(...pezzi: (string | HTMLElement | null)[]) {
    const veri = pezzi.filter((x): x is string | HTMLElement => !!x);
    this.barra.replaceChildren(h('div', { class: 'bin-percorso' }, ...veri.map((x, i) => (i ? [h('span', { class: 'sep' }, '›'), x] : [x])).flat()));
  }

  disegnaMedia(forza = false) {
    const p = store.doc;
    const n = this.nodo;
    const usi = new Map<string, number>();
    for (const c of p.clips) if (c.media) usi.set(c.media, (usi.get(c.media) ?? 0) + 1);
    const firma = n + '|' + this.filtro + '|' + JSON.stringify(p.cartelle ?? []) + '|' + p.media.map((m) => [m.id, m.name, m.cartella, m.markIn, m.markOut, usi.get(m.id) ?? 0].join(',')).join(';');
    const vis = p.media.map((m) => { const r = mediaRT(m.id); return (r?.stato ?? '-') + (r?.poster ? 'p' : ''); }).join(',');
    if (!forza && firma === this.firma) {
      // sono arrivati file riaperti o locandine: si ritoccano le schede senza rifare la griglia (e senza far saltare la pagina)
      if (vis !== this.firmaVis) { this.firmaVis = vis; this.aggiornaSchede(); }
      return;
    }
    this.firma = firma;
    this.firmaVis = vis;
    const scorrimento = this.corpo.scrollTop;
    this.scorre = null;
    const cart = n.startsWith('dir:') ? cartelleDi().find((c) => c.id === n.slice(4)) : undefined;
    // dove sei: Progetto › cartella › sottocartella
    const catena: Cartella[] = [];
    for (let c = cart; c; c = c.genitore ? cartelleDi().find((x) => x.id === c!.genitore) : undefined) catena.unshift(c);
    const nomeTipo = TIPI.find((r) => r.id === n)?.nome;
    this.percorso(h('button', { class: 'pezzo', on: { click: () => this.mostra('tutto') } }, 'Progetto'),
      ...(cart ? catena.map((c) => h('button', { class: 'pezzo', on: { click: () => this.mostra('dir:' + c.id) } }, c.nome)) : [h('span', { class: 'pezzo' }, nomeTipo ?? '')]));
    if (!p.media.length && !cart) {
      this.corpo.replaceChildren(h('div', { class: 'bin-vuoto' },
        h('div', { class: 'bin-vuoto-icona' }, icona('importa', 34)),
        h('b', null, 'Trascina qui i tuoi video'),
        h('span', null, 'oppure premi Importa. Poi passaci sopra col mouse per vederli scorrere, trascinali nella timeline o premi + per metterli al cursore.'),
        h('button', { class: 'btn piccolo', on: { click: () => document.dispatchEvent(new CustomEvent('dpv:demo')) } }, '✨ Prova con il montaggio dimostrativo')));
      return;
    }
    const cerca = (m: MediaItem) => !this.filtro || m.name.toLowerCase().includes(this.filtro);
    const out: HTMLElement[] = [];
    if (cart) {
      // dentro una cartella: prima le sue cartelle, poi i suoi file (di ogni tipo)
      const sotto = figlieDi(cart.id);
      const voci = p.media.filter((m) => m.cartella === cart.id && cerca(m));
      if (sotto.length) out.push(h('div', { class: 'bin-griglia' }, sotto.map((c) => this.cartaCartella(c))));
      if (voci.length) out.push(h('div', { class: 'bin-griglia' }, voci.map((m) => this.carta(m, usi.get(m.id) ?? 0))));
      if (!sotto.length && !voci.length) out.push(h('p', { class: 'nota' }, this.filtro ? 'Niente qui con questo nome.' : 'Cartella vuota: trascina qui i file dall\'albero o dalla griglia, o premi Importa (entrano qui).'));
    } else {
      const voci = p.media.filter(cerca);
      const gruppi: [string, string, string, MediaItem[]][] = [
        ['video', 'Video', 'video', voci.filter((m) => m.type === 'video')],
        ['audio', 'Musica e audio', 'musica', voci.filter((m) => m.type === 'audio')],
        ['immagini', 'Immagini e istantanee', 'immagine', voci.filter((m) => m.type === 'image')],
      ];
      if (n === 'tutto' && !this.filtro && cartelleDi().length) out.push(h('div', { class: 'bin-griglia' }, figlieDi(undefined).map((c) => this.cartaCartella(c))));
      for (const [id, nome, ic, lista] of gruppi) {
        if (n !== 'tutto' && n !== id) continue;
        if (!lista.length) { if (n === id) out.push(h('p', { class: 'nota' }, `Nessun file qui. ${this.filtro ? 'Prova a cercare altro.' : 'Importa o trascina qui i file.'}`)); continue; }
        if (n === 'tutto') out.push(h('h4', { class: 'bin-sezione' }, icona(ic, 13), nome, h('small', null, String(lista.length))));
        out.push(h('div', { class: 'bin-griglia' + (id === 'audio' ? ' audio' : '') }, lista.map((m) => this.carta(m, usi.get(m.id) ?? 0))));
      }
    }
    this.corpo.replaceChildren(...out);
    this.corpo.scrollTop = scorrimento;
    this.evidenzia();
  }

  /** stato e locandina di ogni scheda, al loro posto */
  private aggiornaSchede() {
    for (const el of this.corpo.querySelectorAll<HTMLElement>('.carta[data-id]')) {
      const m = store.doc.media.find((x) => x.id === el.dataset.id);
      if (!m) continue;
      el.classList.toggle('offline', mediaRT(m.id)?.stato !== 'ok');
      const info = el.querySelector('.carta-info');
      if (info) info.textContent = this.infoCarta(m);
      const prep = el.querySelector('.carta-preparazione');
      if (prep) prep.textContent = this.preparazioneCarta(m);
      const cv = el.querySelector('canvas');
      if (cv && this.scorre?.cv !== cv) this.locandina(cv, m);
    }
  }

  /** la forma d'onda di un audio (o la locandina) si rinfresca nella sua tela */
  private ridisegnaCarta(id: string) {
    const m = store.doc.media.find((x) => x.id === id);
    if (!m) return;
    const cv = this.corpo.querySelector<HTMLCanvasElement>(`.carta[data-id="${CSS.escape(id)}"] canvas`);
    if (cv && this.scorre?.cv !== cv) this.locandina(cv, m);
  }

  private preparazioneCarta(m: MediaItem): string {
    const stato = statoPreparazione(m.id, m.type === 'audio' ? 'picchi' : 'proxy');
    return stato === 'non-fatta' ? 'Originale · mai elaborato' : stato === 'fatta' ? 'Preparazione pronta ✓' : stato === 'non-serve' ? 'Originale' : 'Preparazione: ' + stato;
  }
  private infoCarta(m: MediaItem): string {
    const rt = mediaRT(m.id);
    if (rt?.stato !== 'ok') return rt?.stato === 'caricamento' ? 'apro…' : 'OFFLINE · da ricollegare';
    return m.type === 'audio' ? `${m.acodec.toUpperCase()} · ${m.sampleRate / 1000} kHz` : `${m.width}×${m.height}${m.fps ? ' · ' + Math.round(m.fps * 100) / 100 + ' fps' : ''}${m.hasAudio && m.type === 'video' ? ' · audio' : ''}`;
  }

  private cartaCartella(c: Cartella): HTMLElement {
    const dentro = discendenti(c.id);
    const n = store.doc.media.filter((m) => m.cartella && dentro.has(m.cartella)).length;
    return h('div', {
      class: 'carta cartella', title: `${c.nome}\nDoppio clic: apri · tasto destro: rinomina, elimina`,
      on: {
        dblclick: () => this.mostra('dir:' + c.id),
        click: () => { if (matchMedia('(pointer: coarse)').matches) this.mostra('dir:' + c.id); },
        contextmenu: (e: MouseEvent) => { e.preventDefault(); menuContesto(e.clientX, e.clientY, [{ nome: 'Apri', fn: () => this.mostra('dir:' + c.id) }, { nome: 'Rinomina…', fn: () => void this.rinominaCartella(c) }, { nome: 'Elimina la cartella (i file restano)', fn: () => void this.eliminaCartella(c) }]); },
      },
    }, h('div', { class: 'carta-img cartella-img' }, icona('cartella', 40), h('span', { class: 'carta-dur' }, n + (n === 1 ? ' file' : ' file'))), h('div', { class: 'carta-nome' }, c.nome));
  }

  /** la locandina (o la forma d'onda) nella tela della scheda */
  private locandina(cv: HTMLCanvasElement, m: MediaItem) {
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    const rt = mediaRT(m.id);
    ctx.fillStyle = m.type === 'audio' ? '#07120c' : '#000';
    ctx.fillRect(0, 0, W, H);
    if (m.type === 'audio' || (!rt?.poster && rt?.peaks)) {
      const pk = rt?.peaks;
      if (!pk) return;
      ctx.fillStyle = '#5dffb4';
      const mid = H / 2;
      for (let x = 0; x < W; x++) {
        const a = Math.floor((x / W) * pk.length), b = Math.floor(((x + 1) / W) * pk.length);
        let v = 0;
        for (let i = a; i <= b && i < pk.length; i++) if (pk[i] > v) v = pk[i];
        const y = Math.max(0.5, v * H * 0.42);
        ctx.fillRect(x, mid - y, 1, y * 2);
      }
      return;
    }
    if (rt?.poster) {
      const src = rt.poster as HTMLCanvasElement;
      const k = Math.min(W / (src.width || 1), H / (src.height || 1));
      ctx.drawImage(src, (W - src.width * k) / 2, (H - src.height * k) / 2, src.width * k, src.height * k);
    }
  }

  private disegnaScorre() {
    const s = this.scorre;
    if (!s) return;
    const f = fotogramma('bin', s.m.id, s.t, false);
    if (!f) return;
    const ctx = s.cv.getContext('2d')!;
    const W = s.cv.width, H = s.cv.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (f instanceof ImageBitmap) {
      const k = Math.min(W / f.width, H / f.height);
      ctx.drawImage(f, (W - f.width * k) / 2, (H - f.height * k) / 2, f.width * k, f.height * k);
    } else {
      try { f.drawWithFit(ctx, { fit: 'contain' }); } catch { /* fotogramma chiuso nel frattempo */ }
    }
  }

  private carta(m: MediaItem, usi: number): HTMLElement {
    const ok = mediaRT(m.id)?.stato === 'ok';
    const cv = h('canvas', { width: 192, height: 108 });
    this.locandina(cv, m);
    const linea = h('i', { class: 'carta-linea' });
    const tempo = h('span', { class: 'carta-dur' }, m.type === 'image' ? 'IMG' : durataUmana(m.duration - (m.t0 || 0)));
    const dur = m.duration - (m.t0 || 0);
    const img = h('div', { class: 'carta-img' + (m.type === 'audio' ? ' audio' : '') },
      cv, linea,
      h('span', { class: 'carta-tipo' }, icona(m.type === 'audio' ? 'musica' : m.type === 'image' ? 'immagine' : 'video', 12)),
      tempo,
      usi ? h('span', { class: 'carta-usi', title: 'Clip nella timeline' }, '×' + usi) : null,
      m.markIn != null || m.markOut != null ? h('span', { class: 'carta-io', title: 'Attacco e stacco segnati' }, 'I/O') : null,
      h('button', { class: 'carta-piu', title: 'Metti al cursore (e il cursore va alla fine)', on: { click: (e: MouseEvent) => { e.stopPropagation(); mettiAlCursore(m); }, pointerdown: (e: PointerEvent) => e.stopPropagation() } }, icona('piu', 14)));
    // passaggio del mouse: il video scorre avanti e indietro seguendo il puntatore (se il file è aperto)
    if (m.type !== 'image') {
      img.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || mediaRT(m.id)?.stato !== 'ok') return;
        const r = img.getBoundingClientRect();
        const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        linea.style.left = k * 100 + '%';
        img.classList.add('scorre');
        tempo.textContent = durataUmana(k * dur) + ' / ' + durataUmana(dur);
        if (m.type === 'video') {
          this.scorre = { m, cv, t: (m.t0 || 0) + k * Math.max(0, dur - 0.04), linea };
          this.disegnaScorre();
        }
      });
      img.addEventListener('pointerleave', () => {
        img.classList.remove('scorre');
        tempo.textContent = durataUmana(dur);
        if (this.scorre?.cv === cv) this.scorre = null;
        lascia('bin', m.id);
        this.locandina(cv, m);
      });
    }
    const apri = () => { motore.caricaPlayer(m.id); motore.setMonitor('player'); };
    const el = h('div', {
      class: 'carta' + (ok ? '' : ' offline') + (usi ? ' in-timeline' : '') + (this.scelti.has(m.id) ? ' scelta' : ''), 'data-id': m.id, title: `${m.name}\n${m.container} · ${m.vcodec || ''} ${m.acodec || ''}\nDoppio clic: apri nel monitor · trascina: nella timeline o in una cartella · +: al cursore`,
      on: {
        dblclick: apri,
        click: (e: MouseEvent) => { if (matchMedia('(pointer: coarse)').matches) apri(); else this.cliccaCarta(m.id, e); },
        contextmenu: (e: MouseEvent) => {
          e.preventDefault();
          if (!this.scelti.has(m.id)) { this.scelti = new Set([m.id]); this.ultimoScelto = m.id; this.mostraScelti(); }
          menuContesto(e.clientX, e.clientY, [
            ...(this.scelti.size > 1 ? [
              { nome: `Metti i ${this.scelti.size} file scelti in coda al cursore`, fn: () => { motore.setMonitor('recorder'); for (const id of this.sceltiInOrdine()) { const mm = store.doc.media.find((z) => z.id === id); if (mm) mettiAlCursore(mm); } } },
              { nome: 'Sposta i file scelti in una cartella', sotto: this.menuCartelleMolti() },
              { nome: 'Togli i file scelti dal contenitore', fn: () => { for (const id of this.sceltiInOrdine()) togliMedia(id); this.scelti.clear(); } },
              { sep: true },
            ] as VoceMenu[] : []),
            { nome: 'Prepara file scelti… (Attività)', fn: () => document.dispatchEvent(new CustomEvent('dpv:attivita', { detail: this.sceltiInOrdine() })) },
            { nome: 'Apri nel monitor (attacco e stacco)', fn: apri },
            { nome: 'Metti al cursore', fn: () => mettiAlCursore(m) },
            { nome: 'Metti in coda al montaggio', fn: () => { motore.setMonitor('recorder'); store.setHead(projectEnd(store.doc)); mettiAlCursore(m); } },
            { nome: 'Sovrascrivi al cursore (copre quello che c\'è)', fn: () => { motore.caricaPlayer(m.id); montaDalPlayer('overwrite'); } },
            { sep: true },
            { nome: 'Sposta in una cartella', sotto: this.menuCartelle(m) },
            { nome: 'Rinomina…', fn: async () => { const n = await chiedi('Rinomina', 'Nome', m.name); if (n) store.edit('Rinomina', () => { m.name = n; }); } },
            { nome: 'Ricollega file mancanti…', disattiva: mediaRT(m.id)?.stato === 'ok', fn: () => ricollega() },
            { nome: 'Togli dal contenitore', fn: () => togliMedia(m.id) },
          ]);
        },
      },
    },
      img,
      h('div', { class: 'carta-nome' }, m.name),
      h('div', { class: 'carta-info' }, this.infoCarta(m)), h('small', { class: 'carta-preparazione' }, this.preparazioneCarta(m)));
    // trascinando un file scelto si portano dietro tutti i file scelti; trascinandone uno non scelto, resta solo quello
    trascinabile(el, () => this.datoTrascina(m.id), () => (this.scelti.size > 1 && this.scelti.has(m.id) ? `🎞 ${this.scelti.size} file` : (m.type === 'audio' ? '🎵 ' : m.type === 'image' ? '🖼 ' : '🎞 ') + m.name));
    return el;
  }

  /** i file scelti, nell'ordine in cui si vedono */
  private sceltiInOrdine(): string[] {
    const visti = [...this.corpo.querySelectorAll<HTMLElement>('.carta[data-id]')].map((e) => e.dataset.id!);
    const dentro = visti.filter((id) => this.scelti.has(id));
    const fuori = [...this.scelti].filter((id) => !visti.includes(id) && store.doc.media.some((m) => m.id === id));
    return [...dentro, ...fuori];
  }

  private datoTrascina(id: string): string {
    if (!this.scelti.has(id)) { this.scelti = new Set([id]); this.ultimoScelto = id; this.mostraScelti(); }
    return 'm:' + this.sceltiInOrdine().join('|');
  }

  private cliccaCarta(id: string, e: MouseEvent) {
    const visti = [...this.corpo.querySelectorAll<HTMLElement>('.carta[data-id]')].map((x) => x.dataset.id!);
    if (e.shiftKey && this.ultimoScelto && visti.includes(this.ultimoScelto)) {
      const a = visti.indexOf(this.ultimoScelto), b = visti.indexOf(id);
      const tratto = visti.slice(Math.min(a, b), Math.max(a, b) + 1);
      this.scelti = e.ctrlKey || e.metaKey ? new Set([...this.scelti, ...tratto]) : new Set(tratto);
    } else if (e.ctrlKey || e.metaKey) {
      if (this.scelti.has(id)) this.scelti.delete(id); else this.scelti.add(id);
      this.ultimoScelto = id;
    } else {
      this.scelti = new Set([id]);
      this.ultimoScelto = id;
    }
    this.mostraScelti();
  }

  /** mette (o toglie) il bordo dei file scelti, senza ridisegnare tutta la griglia */
  private mostraScelti() {
    for (const e of this.corpo.querySelectorAll<HTMLElement>('.carta[data-id]')) e.classList.toggle('scelta', this.scelti.has(e.dataset.id!));
    this.barra.querySelector('.bin-scelti')?.remove();
    if (this.scelti.size > 1) this.barra.append(h('span', { class: 'bin-scelti', title: 'Trascinali nella timeline: vanno uno dopo l\'altro' }, `${this.scelti.size} scelti`));
  }

  private menuCartelleMolti(): VoceMenu[] {
    const voci: VoceMenu[] = [{ nome: 'Fuori dalle cartelle', fn: () => { for (const id of this.sceltiInOrdine()) this.sposta(id, undefined); } }];
    const scendi = (padre: string | undefined, rientro: string) => {
      for (const c of figlieDi(padre)) { voci.push({ nome: rientro + '📁 ' + c.nome, fn: () => { for (const id of this.sceltiInOrdine()) this.sposta(id, c.id); } }); scendi(c.id, rientro + '   '); }
    };
    scendi(undefined, '');
    return voci;
  }

  // ——— la libreria: schede piccole, solo il nome; al passaggio del mouse il provino vero ———
  /** la scheda di un pezzo della libreria: anteprima ferma, e al passaggio il provino col fotogramma al cursore */
  private cartaLibreria(o: { cls: string; nome: string; titolo: string; anteprima: HTMLElement; provino?: Costruttore; dato?: string; etichetta?: string; clic: () => void; attr?: Record<string, string> }): HTMLElement {
    const tela = h('canvas', { class: 'provino', width: 192, height: 108 }) as HTMLCanvasElement;
    const img = h('div', { class: 'carta-img' }, o.anteprima, tela);
    const el = h('div', { class: 'carta ' + o.cls, title: o.titolo, ...(o.attr ?? {}), on: { click: o.clic } }, img, h('div', { class: 'carta-nome' }, o.nome));
    if (o.provino) {
      let ferma: (() => void) | null = null;
      img.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        tela.getContext('2d')!.drawImage(o.anteprima instanceof HTMLCanvasElement ? o.anteprima : tela, 0, 0, tela.width, tela.height);
        img.classList.add('gira');
        ferma = suonaProvino(tela, o.provino!);
      });
      img.addEventListener('pointerleave', () => { ferma?.(); ferma = null; img.classList.remove('gira'); });
    }
    if (o.dato) trascinabile(el, () => o.dato!, () => o.etichetta ?? o.nome);
    return el;
  }

  /** i chip della durata e le impostazioni dei blocchetti nuovi (suono, forza): valgono per effetti e transizioni */
  private impostazioniBlocchi(): HTMLElement {
    const chip = (testo: string, acceso: boolean, fn: () => void, title = '', attr: Record<string, string> = {}) => h('button', { class: 'chip' + (acceso ? ' acceso' : ''), title, ...attr, on: { click: () => { fn(); this.disegnaDestra(true); } } }, testo);
    return h('div', { class: 'bin-impostazioni' },
      h('span', { class: 'etichetta', title: 'Quanto durano i blocchetti che metti (poi li allunghi o accorci dai bordi)' }, 'Durata'),
      DURATE.map((d) => chip(d ? String(d).replace('.', ',') + ' s' : 'Auto', modi.durataFx === d, () => { modi.durataFx = d; }, '', { 'data-d': String(d) })),
      h('span', { class: 'sep-v' }),
      h('span', { class: 'etichetta' }, 'Forza'),
      [0.5, 1, 1.5].map((f) => chip(f === 1 ? '100%' : f * 100 + '%', modi.forzaFx === f, () => { modi.forzaFx = f; }, 'La forza dei blocchetti nuovi (poi si cambia col tasto destro sul blocco)')),
      h('span', { class: 'sep-v' }),
      chip(modi.suonoFx ? '🔊 Suono' : '🔇 Muti', modi.suonoFx, () => { modi.suonoFx = !modi.suonoFx; }, 'I blocchetti nuovi nascono col loro suono acceso o spento (poi un clic sull\'altoparlante del blocco)'));
  }

  private filtra<T extends { nome: string }>(lista: T[]) { return this.filtro ? lista.filter((x) => x.nome.toLowerCase().includes(this.filtro)) : lista; }

  /** sezioni: con l'intestazione solo quando si vede tutto il ramo */
  private sezioni(radice: string, gruppi: [string, string, HTMLElement[]][]) {
    const tutto = this.nodo === radice || this.libreriaUnita;
    const out: HTMLElement[] = [];
    for (const [id, nome, carte] of gruppi) {
      if (!tutto && this.nodo !== id) continue;
      if (!carte.length) continue;
      if (tutto) out.push(h('h4', { class: 'bin-sezione', 'data-ramo': id }, nome, h('small', null, String(carte.length))));
      out.push(h('div', { class: 'bin-griglia libreria' }, carte));
    }
    if (!out.length) out.push(h('p', { class: 'nota' }, 'Niente con questo nome.'));
    return out;
  }

  private nomeRamo(id: string) {
    for (const r of LIBRERIA) { if (r.id === id) return r.nome; const f = r.figli?.find((x) => x[0] === id); if (f) return f[1]; }
    return '';
  }

  private percorsoLibreria(radice: string) {
    this.percorso(h('span', { class: 'pezzo' }, 'Libreria'), h('button', { class: 'pezzo', on: { click: () => this.mostra(radice) } }, this.nomeRamo(radice)), this.nodo !== radice ? h('span', { class: 'pezzo' }, this.nomeRamo(this.nodo)) : null);
  }

  private paginaTransizioni() {
    this.percorsoLibreria('transizioni');
    this.barra.append(this.impostazioniBlocchi());
    const carta = (tipo: Transition['type'], m: { p: number; nome: string; info: string }) => {
      const cv = h('canvas', { class: 'tr-anteprima', width: 160, height: 90 }) as HTMLCanvasElement;
      anteprimaChiara(cv, { ...newTransition(tipo, 25, m.p), soft: tipo === 'wipe' ? 0.03 : 0, border: tipo === 'wipe' ? 0.012 : 0 });
      const id = tipo === 'mix' || tipo === 'dip' ? tipo : `${tipo}:${m.p}`;
      return this.cartaLibreria({
        cls: 'tr gen-voce', nome: m.nome, titolo: `${m.nome} · ${m.info}\nTrascina sopra un taglio · clic: sul taglio più vicino al cursore`,
        anteprima: cv, provino: scenaTransizione(id, modi.forzaFx), dato: 'x:t:' + id, etichetta: '✦ ' + m.nome, clic: () => applicaTransizione(tipo, m.p), attr: { 'data-tr': id },
      });
    };
    const dve = (ps: number[]) => this.filtra(EFFETTI.filter((m) => ps.includes(m.p)).sort((a, b) => ps.indexOf(a.p) - ps.indexOf(b.p))).map((m) => carta('dve', m));
    this.corpo.replaceChildren(h('div', { class: 'gen-lista' }, ...this.sezioni('transizioni', [
      ['tr:dissolvenze', 'Dissolvenze', this.filtra([{ p: 0, nome: 'Dissolvenza incrociata', info: 'il MIX classico · tasto 5', t: 'mix' as const }, { p: 0, nome: 'Passaggio al nero', info: 'scende al nero e risale · tasto 7', t: 'dip' as const }]).map((x) => carta(x.t, x))],
      ['tr:movimento', 'Movimento', dve(GRUPPI_TR.movimento)],
      ['tr:3d', '3D e forme', dve(GRUPPI_TR['3d'])],
      ['tr:luce', 'Luce', dve(GRUPPI_TR.luce)],
      ['tr:stile', 'Stile', dve(GRUPPI_TR.stile)],
      ['tr:tendine', 'Tendine SMPTE', this.filtra(TENDINE).map((m) => carta('wipe', m))],
    ])));
  }

  private paginaTitoli() {
    this.percorsoLibreria('titoli');
    const titolo = (id: string, nome: string) => this.cartaLibreria({
      cls: 'gen gen-voce', nome, titolo: `${nome}\nClic: al cursore (su una traccia libera) · trascina: dove vuoi`,
      anteprima: anteprimaTitolo(id), provino: scenaTitolo(id), dato: 'g:title:' + id, etichetta: '📺 ' + nome,
      clic: () => { inserisciGeneratore('title', undefined, undefined, { titolo: id }); avviso(`${nome} al cursore`, 'ok', 1000); },
    });
    const conto = (stile: typeof STILI_CONTO[number]) => {
      const cv = h('canvas', { width: 192, height: 108 }) as HTMLCanvasElement;
      const t = disegnaCountdown(192, 108, 0.5, stile.secondi, stile.id);
      cv.getContext('2d')!.drawImage(t as CanvasImageSource, 0, 0, 192, 108);
      const nome = `${stile.nome} ${stile.secondi}…1`;
      return this.cartaLibreria({
        cls: 'gen gen-voce', nome, titolo: `Countdown ${stile.nome}: da ${stile.secondi} a 1, un bip a ogni numero\nClic: al cursore · trascina: dove vuoi`,
        anteprima: cv, provino: scenaConto(stile.id, stile.secondi), dato: `g:countdown:${stile.id}:${stile.secondi}`, etichetta: '⏱ ' + nome,
        clic: () => { inserisciGeneratore('countdown', undefined, undefined, { conto: { stile: stile.id, secondi: stile.secondi } }); avviso(`Countdown ${nome} al cursore`, 'ok', 1000); },
      });
    };
    const sala = (kind: 'bars' | 'color' | 'nero', nome: string, cls: string) => this.cartaLibreria({
      cls: 'gen gen-voce', nome, titolo: `${nome}\nClic: al cursore · trascina: dove vuoi`,
      anteprima: h('div', { class: 'gen-anteprima ' + cls }), provino: scenaSala(kind), dato: 'g:' + kind, etichetta: '📺 ' + nome,
      clic: () => { inserisciGeneratore(kind); avviso(`${nome} al cursore`, 'ok', 1000); },
    });
    // i sottotitoli: generarli, una riga a mano, la voce che li legge, dove stanno (le righe si muovono nella riga SOTT)
    const sott = (nome: string, icona: string, info: string, fai: (m: typeof import('./sottotitoliRapidi')) => void, dato?: string) => this.cartaLibreria({
      cls: 'gen gen-voce gen-sott', nome, titolo: `${nome}\n${info}`, dato, etichetta: dato ? icona + ' ' + nome : undefined,
      anteprima: h('div', { class: 'gen-anteprima sott-anteprima' }, h('span', null, icona), h('b', null, 'Sottotitolo')),
      clic: () => void import('./sottotitoliRapidi').then(fai),
    });
    const voceSott = [
      sott('Sottotitoli con l\'AI', '✨', 'Trascinalo su una clip: scrive i sottotitoli di quella clip; lasciato su uno spazio vuoto li scrive per tutto il montaggio. Poi doppio clic su una riga (SOTT) per correggerla, tasto destro per farla parlare', (m) => void m.generaSottotitoli(), 's:ai'),
      sott('Riga al cursore', '📝', 'Trascinala sulla timeline dove vuoi la riga e poi scrivi il testo; con un clic va dove sta il cursore', (m) => void m.nuovaRigaQui(), 's:riga'),
      sott('Posizione e grandezza', '⚙', 'In basso o in alto, grandezza, fascia, nel video o solo .srt', (m) => m.stileSottotitoli()),
    ].filter((c) => !this.filtro || (c.textContent ?? '').toLowerCase().includes(this.filtro.toLowerCase()));
    this.corpo.replaceChildren(h('div', { class: 'gen-lista' }, ...this.sezioni('titoli', [
      ['tit:titoli', 'Titoli', this.filtra(PRESET_TITOLI.filter((x) => x.gruppo === 'titoli')).map((x) => titolo(x.id, x.nome))],
      ['tit:sott', 'Sottotitoli', voceSott],
      ['tit:tv', 'TV e social', this.filtra(PRESET_TITOLI.filter((x) => x.gruppo === 'tv')).map((x) => titolo(x.id, x.nome))],
      ['tit:conto', 'Countdown', this.filtra(STILI_CONTO).map(conto)],
      ['tit:sala', 'Macchine della sala', this.filtra([{ nome: 'Barre + tono', k: 'bars' as const, c: 'barre' }, { nome: 'Nero', k: 'nero' as const, c: 'nero' }, { nome: 'Colore pieno', k: 'color' as const, c: 'colore' }]).map((x) => sala(x.k, x.nome, x.c))],
    ])));
  }

  /** le animazioni del catalogo (sottopancia, testi che si muovono, grafici, fondi, cerimonie): clic = al cursore, trascina = dove vuoi */
  private paginaAnimazioni() {
    this.percorsoLibreria('animazioni');
    const carta = (a: typeof ANIMAZIONI[number]) => {
      const cv = h('canvas', { class: 'gen-anteprima', width: 192, height: 108 }) as HTMLCanvasElement;
      const disegna = () => anteprimaAnimazione(cv, a.id);
      disegna();
      void caricaFontAnimazioni().then(disegna);
      return this.cartaLibreria({
        cls: 'gen gen-voce', nome: a.nome, titolo: `${a.nome} · ${a.info}\nClic: al cursore (su una traccia libera) · trascina: dove vuoi`,
        anteprima: cv, provino: scenaAnimazione(a.id), dato: 'g:anim:' + a.id, etichetta: '✨ ' + a.nome, attr: { 'data-anim': a.id },
        clic: () => { inserisciGeneratore('anim', undefined, undefined, { anim: a.id }); avviso(`${a.nome} al cursore`, 'ok', 1000); },
      });
    };
    this.corpo.replaceChildren(h('div', { class: 'gen-lista' },
      h('p', { class: 'nota' }, 'Clicca una animazione per metterla al cursore, poi cambia testi, colori e durata dalle proprietà. I fondi e le luci riempiono il quadro: mettili su una traccia sotto.'),
      ...this.sezioni('animazioni', GRUPPI_LIBRERIA.map((g): [string, string, HTMLElement[]] => ['an:' + g.id, g.nome, this.filtra(animazioniDi(g.id)).map(carta)]))));
  }

  private paginaEffetti() {
    this.percorsoLibreria('effetti');
    if (this.nodo !== 'fx:clip' && this.nodo !== 'fx:audio') this.barra.append(this.impostazioniBlocchi());
    this.carteEffetti = [];
    // gli effetti a tempo: blocchetti magenta sopra le clip (valgono per la loro traccia e per tutto quello sotto)
    const tempo = (e: EffettoTempo) => this.cartaLibreria({
      cls: 'fxt', nome: e.nome, titolo: `${e.nome} · ${e.info}\nTrascina sopra una clip (si attacca all'inizio, alla fine o al taglio) · clic: al cursore`,
      anteprima: h('div', { class: 'fxt-anteprima fxt-' + e.motore + (e.colore === '#000000' ? ' nero' : '') }, h('i', { class: 'fxt-scena' }), h('i', { class: 'fxt-velo' })),
      provino: scenaEffetto(e.id, modi.forzaFx), dato: 'x:e:' + e.id, etichetta: '⚡ ' + e.nome, clic: () => mettiBlocco('effetto', e.id), attr: { 'data-fx': e.id },
    });
    const carta = (e: Effetto) => {
      const el = this.cartaLibreria({
        cls: 'fx', nome: e.nome, titolo: `${e.nome} · ${e.info}\nClic: acceso/spento sulle clip scelte · trascina: sopra una clip`,
        anteprima: h('div', { class: 'fx-anteprima ' + e.anteprima }, h('span', { class: 'fx-spia' })),
        provino: e.per === 'video' ? scenaRitocco((c, p) => e.metti(c, true, p)) : undefined, dato: 'e:' + e.id, etichetta: '✨ ' + e.nome,
        clic: () => { if (!store.sel.size) { avviso('Scegli prima una clip (clic nella timeline), o trascina l\'effetto sopra una clip', 'info', 2400); return; } alternaEffetto(e.id, M.withLinked(store.doc, store.sel)); },
      });
      this.carteEffetti.push({ el, e });
      return el;
    };
    const g = (x: EffettoTempo['gruppo']) => this.filtra(EFFETTI_TEMPO.filter((e) => e.gruppo === x)).map(tempo);
    this.corpo.replaceChildren(h('div', { class: 'gen-lista' }, ...this.sezioni('effetti', [
      ['fx:rapidi', 'Rapidi', g('rapidi')],
      ['fx:lunghi', 'Lunghi', g('lunghi')],
      ['fx:luci', 'Luci', g('luci')],
      ['fx:distorsioni', 'Distorsioni', g('distorsioni')],
      ['fx:colore', 'Colore', g('colore')],
      ['fx:particelle', 'Particelle', g('particelle')],
      ['fx:clip', 'Stile della clip', this.filtra(EFFETTI_VIDEO).map(carta)],
      ['fx:audio', 'Audio', this.filtra(EFFETTI_AUDIO).map(carta)],
    ])));
    this.aggiornaEffetti();
  }

  /** le spie degli effetti accesi sulle clip selezionate */
  private aggiornaEffetti() {
    const p = store.doc;
    const cs = p.clips.filter((c) => store.sel.has(c.id));
    for (const { el, e } of this.carteEffetti) {
      const quali = adatte(e, cs);
      el.classList.toggle('acceso', quali.length > 0 && quali.every((c) => e.acceso(c, p)));
    }
  }
}

export { fps };

/** l'anteprima ferma di un'animazione: disegnata davvero a metà della sua entrata, su un fondo scuro */
function anteprimaAnimazione(cv: HTMLCanvasElement, id: string) {
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 192, 108);
  g.addColorStop(0, '#1d2a4a'); g.addColorStop(1, '#2a1333');
  x.fillStyle = g; x.fillRect(0, 0, 192, 108);
  const a = ANIMAZIONI.find((z) => z.id === id)!;
  try {
    const t = Math.min(a.durata * 0.45, 2.6);
    const tela = disegnaAnimazione(nuovaAnim(id), 768, 432, t, a.durata);
    x.drawImage(tela as CanvasImageSource, 0, 0, 192, 108);
  } catch { /* resta il fondo */ }
}

/** l'anteprima ferma di un titolo: disegnato davvero (come nel monitor), su un fondo scuro, a metà della sua entrata */
function anteprimaTitolo(id: string): HTMLCanvasElement {
  const cv = h('canvas', { class: 'gen-anteprima', width: 192, height: 108 }) as HTMLCanvasElement;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 192, 108);
  g.addColorStop(0, '#1d2a4a'); g.addColorStop(1, '#2a1333');
  x.fillStyle = g;
  x.fillRect(0, 0, 192, 108);
  const pr = presetTitolo(id);
  const spec = { ...TITLE0, ...(pr?.spec ?? {}) };
  // nella scheda piccola le lettere si ingrandiscono (se no non si leggono)
  if (spec.style !== 'crawl' && spec.style !== 'rullo') spec.size = Math.min(spec.size * 2.3, 190);
  const W = 1920, H = 1080;
  try {
    const t = specAlTempo(spec, 1.5);
    const tt = telaTitolo(t, W, H);
    const k = 192 / W;
    if (spec.style === 'crawl') x.drawImage(tt.tela as CanvasImageSource, 0, 0, Math.min(tt.w, W), H, 0, 0, 192, 108);
    else if (spec.style === 'rullo') x.drawImage(tt.tela as CanvasImageSource, 0, 0, W, Math.min(tt.h, H), 0, 0, 192, 108 * Math.min(tt.h, H) / H);
    else x.drawImage(tt.tela as CanvasImageSource, (W - tt.w) / 2 * k + 0, (H - tt.h) / 2 * k, tt.w * k, tt.h * k);
  } catch { /* resta il fondo */ }
  return cv;
}
