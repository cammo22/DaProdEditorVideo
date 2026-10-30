// DaProdMontage: la quarta pagina, a «tre passi grandi» (proposta B). Una barra in alto con i passi cliccabili
// (1 Foto e video · 2 Stile · 3 Durata e musica · 4 Anteprima) e un passo per volta, a tutto spazio:
//   1 le foto e i video grandi (con le scartate, mosse o doppie, a bordo grigio: un clic le rimette);
//   2 gli stili come schede grandi, tutti i 28, con il filtro per gruppo;
//   3 durata, ritmo, musica, titoli, ordine e formato: tutto in una schermata, senza scorrere;
//   4 l'anteprima nel monitor vero, grande, con «Ti piace?», «Sì, portalo nel Montaggio», «Fammene un'altra», «Scarta»
//     e i ritocchi veloci (più corto, più lento, altra musica, via i titoli) che cambiano le scelte e rigenerano.
// Butti dentro foto e video alla rinfusa e il programma monta da solo: ordine, tempi, movimenti, transizioni, titoli,
// cuori e petali, musica a tempo. Il risultato è una timeline vera (una scheda nuova) che poi ritocchi come vuoi.
// Il motore sta in src/core/montage.ts, i passi e i ritocchi (puri, provati da Node) in src/core/montagePassi.ts.
import { inCoda } from '../media/attivita';
import { store } from '../core/store';
import type { MediaItem } from '../core/tipi';
import { CATEGORIE_MONTAGE, PRESET_MONTAGE, presetMontage, type PresetMontage, type TestiMontage } from '../core/montagePreset';
import { costruisciSequenza, fmtDur, pianifica, type EntrataMontage, type Ordine, type OpzMontage } from '../core/montage';
import {
  PASSI, RITMO_PAROLE, ETICHETTA_SCARTO, SPIEGA_SCARTO, bpmDaBattiti, conteggiCategorie, fondoStile, motiviScarto, nomeRitocco,
  puoiAndare, riassunto, ritocca, statoPasso, stiliPerCategoria, type MotivoScarto, type Ritocco,
} from '../core/montagePassi';
import { disegnaAnimazione } from '../render/animazioni';
import { caricaFontAnimazioni } from '../render/font';
import { mediaRT } from '../media/libreria';
import { fotogramma, lascia, quandoFotogramma } from '../media/fotogrammi';
import { pixelAl } from '../media/campiona';
import { misuraQualita } from '../media/qualita';
import { dataDiScatto } from '../media/exif';
import { battitiDi } from '../media/ritmo';
import { importaDialogo } from '../progetti';
import { invoke, isTauri } from '../platform';
import { motore } from '../motore';
import { avviso, h } from './dom';
import { BarraLavoro } from './lavoro';

type Formato = 'auto' | 'progetto' | '16:9' | '9:16' | '1:1';
interface Scelte {
  preset: string;
  durata: number;
  ordine: Ordine;
  titoli: boolean;
  effetti: boolean;
  scarta: boolean;
  audioVideo: number;
  formato: Formato;
  adatta: 'intero' | 'riempi';
  testi: TestiMontage;
  musica: string;
  /** 0 = il ritmo dello stile; 1..3 = più lento (ogni foto resta più a lungo) */
  lentezza: number;
}

/** l'inizio del nome con cui l'anteprima sta nell'annulla (serve a riconoscerla: ogni variante ha il suo) */
const ETICHETTA = 'DaProdMontage';
/** un seme nuovo a ogni montaggio */
const nuovoSeme = () => (Math.random() * 0x7fffffff) >>> 0;
/** il seme in breve, da far vedere ("Variante K7F2Q") e da scriversi se un montaggio piace */
const codiceSeme = (n: number) => n.toString(36).toUpperCase().padStart(5, '0').slice(-5);

const DURATE = [30, 60, 90, 120, 180, 300, 600];
const MISURE: Record<Exclude<Formato, 'auto' | 'progetto'>, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const RITMI_LENTI = ['Come lo stile', 'Più lento', 'Molto lento', 'Lentissimo'];
const RITOCCHI: { r: Ritocco; info: string }[] = [
  { r: 'piuCorto', info: 'Accorcia di un quarto il montaggio e ne fa un altro' },
  { r: 'piuLento', info: 'Ogni foto resta più a lungo: meno cose, più calme' },
  { r: 'musica', info: 'Passa al brano seguente e rifà i tagli sui suoi battiti' },
  { r: 'titoli', info: 'Toglie (o rimette) i titoli di apertura e di chiusura' },
];

const leggi = (): Partial<Scelte> => { try { return JSON.parse(localStorage.getItem('dpv-montage') ?? '{}'); } catch { return {}; } };
const scrivi = (s: Scelte) => { try { localStorage.setItem('dpv-montage', JSON.stringify({ ...s, musica: '' })); } catch { /* niente */ } };

/** le misure di un file importato, già girate per il verso giusto */
function misure(m: MediaItem) { const g = m.rotation % 180; return { w: g ? m.height : m.width, h: g ? m.width : m.height }; }

/** i primi byte di un file (per la data di scatto) */
async function primiByte(m: MediaItem): Promise<Blob | null> {
  const r = mediaRT(m.id);
  if (r?.file) return r.file;
  if (r?.path && isTauri) {
    try { const off = r.off ?? 0; const b = await invoke<ArrayBuffer>('media_leggi', { path: r.path, start: off, end: off + 131072 }); return new Blob([b]); } catch { return null; }
  }
  return null;
}

export class Montage {
  el: HTMLElement;
  private s: Scelte;
  private incluse = new Set<string>();
  private viste = new Set<string>();
  /** i file scartati che l'utente ha rimesso a mano: il motore non li tocca più */
  private tieniId = new Set<string>();
  /** perché un file scelto non c'è nel montaggio (doppia, mossa, in più) */
  private scarti = new Map<string, MotivoScarto>();
  private griglia: HTMLElement;
  private conta: HTMLElement;
  private bScartate: HTMLButtonElement;
  private bChiudiMonitor: HTMLButtonElement;
  private carte = new Map<string, HTMLElement>();
  private riepilogo: HTMLElement;
  private lavoro = new BarraLavoro();
  private bCrea: HTMLButtonElement;
  private bVedi: HTMLButtonElement;
  private bRifai: HTMLButtonElement;
  private selMusica: HTMLSelectElement;
  private infoRitmo: HTMLElement;
  private campiTesto: HTMLElement;
  private sinc: (() => void)[] = [];
  private visibile = false;
  private occupato = false;
  /** l'anteprima in timeline (finché non la importi): il seme con cui è nata */
  private anteprima: { seme: number; etichetta: string } | null = null;
  /** dopo l'anteprima hai cambiato qualcosa: tornando al passo 4 si rifà (con lo stesso seme) */
  private datata = false;
  private bRigenera: HTMLButtonElement;
  private bImporta: HTMLButtonElement;
  private bScarta: HTMLButtonElement;
  private etichetta: HTMLElement;
  private riassuntoEl: HTMLElement;
  private noteEl: HTMLElement;
  private vuota: HTMLElement;
  private comandiAnteprima: HTMLElement[] = [];
  private ritocchi: { r: Ritocco; el: HTMLButtonElement }[] = [];
  private bPassi: HTMLButtonElement[] = [];
  private passi: HTMLElement[] = [];
  /** il video che si sta guardando nel monitor dal passo 1 */
  private guardando = false;
  /** il video su cui passa il mouse (anteprima che scorre) */
  private scorrendo: { m: MediaItem; cv: HTMLCanvasElement; t: number } | null = null;
  /** quello che si è già misurato (qualità, pezzo migliore, battiti): rigenerare è subito */
  private analisi = new Map<string, { punteggio: number; firma?: string; inizioMigliore?: number }>();
  private ritmi = new Map<string, { battiti?: number[]; bpm?: number }>();
  /** finisce quando il montaggio è pronto (per le prove) */
  ultimo: Promise<unknown> = Promise.resolve();

  constructor() {
    const salvate = leggi();
    this.s = {
      preset: salvate.preset && presetMontage(salvate.preset) ? salvate.preset : 'matrimonio', durata: salvate.durata ?? 120, ordine: salvate.ordine ?? 'data',
      titoli: salvate.titoli ?? true, effetti: salvate.effetti ?? true, scarta: salvate.scarta ?? true, audioVideo: salvate.audioVideo ?? -14, formato: salvate.formato ?? 'auto', adatta: salvate.adatta ?? 'intero',
      testi: salvate.testi ?? { titolo: '', sottotitolo: '', nomi: '', data: '' }, musica: '', lentezza: Math.max(0, Math.min(3, Math.round(salvate.lentezza ?? 0))),
    };
    this.griglia = h('div', { class: 'mt-file' });
    this.conta = h('div', { class: 'mt-conta' });
    this.riepilogo = h('div', { class: 'mt-riepilogo' });
    this.campiTesto = h('div', { class: 'mt-testi' });
    this.infoRitmo = h('p', { class: 'nota mt-ritmo' });
    this.riassuntoEl = h('p', { class: 'mt-riassunto' });
    this.noteEl = h('div', { class: 'mt-note' });
    this.selMusica = h('select', { class: 'mini-select largo mt-selmusica', title: 'La musica del video', on: { change: () => { this.s.musica = this.selMusica.value; this.cambiato(); this.disegnaMusica(); this.aggiorna(); } } }) as HTMLSelectElement;
    this.bCrea = h('button', { class: 'btn primario mt-crea', title: 'Analizza le foto, monta e mostra l\'anteprima nel monitor', on: { click: () => void this.crea().catch(() => undefined) } }, 'Crea l\'anteprima ›') as HTMLButtonElement;
    this.bVedi = h('button', { class: 'btn mt-vedi', title: 'Torna all\'anteprima (se hai cambiato qualcosa la rifà con le scelte nuove)', on: { click: () => this.vai(3) } }, 'Rivedi l\'anteprima ›') as HTMLButtonElement;
    this.bRifai = h('button', { class: 'btn mt-rifai', on: { click: () => void this.crea().catch(() => undefined) } }, 'Crea l\'anteprima') as HTMLButtonElement;
    this.bRigenera = h('button', { class: 'btn mt-rigenera', title: 'Un altro montaggio con le stesse scelte: cambiano movimenti, durate, transizioni ed effetti', on: { click: () => void this.crea().catch(() => undefined) } }, 'Fammene un\'altra') as HTMLButtonElement;
    this.bImporta = h('button', { class: 'btn primario mt-importa', title: 'Tiene questo montaggio e apre la timeline per ritoccarlo', on: { click: () => this.importa() } }, 'Sì, portalo nel Montaggio') as HTMLButtonElement;
    this.bScarta = h('button', { class: 'btn mt-scarta', title: 'Toglie l\'anteprima e torna a com\'era prima', on: { click: () => this.scarta() } }, 'Scarta') as HTMLButtonElement;
    this.etichetta = h('span', { class: 'mt-variante' });
    this.bScartate = h('button', { class: 'btn-mini mt-scartate', title: 'Le foto mosse, doppie o in più che il programma ha lasciato fuori: un clic le rimette tutte', on: { click: () => this.rimettiTutte() } }) as HTMLButtonElement;
    this.bChiudiMonitor = h('button', { class: 'btn-mini mt-chiudi-mon', on: { click: () => this.chiudiMonitor() } }, 'Chiudi il video') as HTMLButtonElement;

    const chip = (testo: string, acceso: () => boolean, fn: () => void, title = '') => {
      const b = h('button', { class: 'chip', title, on: { click: () => { fn(); this.cambiato(); this.salva(); this.sinc.forEach((f) => f()); this.aggiorna(); } } }, testo);
      this.sinc.push(() => b.classList.toggle('acceso', acceso()));
      return b;
    };
    const interruttore = (testo: string, info: string, k: 'titoli' | 'effetti' | 'scarta') => {
      const led = h('span', { class: 'led' });
      const b = h('button', { class: 'fin-interruttore', title: info, on: { click: () => { this.s[k] = !this.s[k]; this.cambiato(); this.salva(); this.sinc.forEach((f) => f()); this.aggiorna(); } } }, led, h('span', { class: 'fin-int-testo' }, testo));
      this.sinc.push(() => { b.classList.toggle('acceso', this.s[k]); led.classList.toggle('acceso', this.s[k]); });
      return b;
    };
    const intesta = (titolo: string, sotto: string, ...extra: (Node | string)[]) =>
      h('div', { class: 'mt-titolo' }, h('h2', null, titolo), h('p', null, sotto), ...extra);
    const piede = (...figli: (Node | null)[]) => h('div', { class: 'mt-piede' }, ...figli);
    const avanti = (a: number, testo: string) => h('button', { class: 'btn mt-avanti', on: { click: () => this.vai(a) } }, testo);
    const indietro = (a: number) => h('button', { class: 'btn mt-indietro', on: { click: () => this.vai(a) } }, '‹ Indietro');

    // ——— 1 · foto e video ———
    const passoFile = h('section', { class: 'mt-passo mt-colfile' },
      intesta('Che foto e video usiamo?', 'Trascinali qui o in qualunque parte del programma: anche solo foto'),
      h('div', { class: 'mt-strumenti' },
        this.conta, this.bScartate,
        h('span', { class: 'mt-spazio' }),
        this.bChiudiMonitor,
        h('button', { class: 'btn-mini', on: { click: () => { for (const m of this.disponibili()) this.incluse.add(m.id); this.disegnaFile(); this.cambiato(); this.aggiorna(); } } }, 'Tutti'),
        h('button', { class: 'btn-mini', on: { click: () => { this.incluse.clear(); this.tieniId.clear(); this.disegnaFile(); this.cambiato(); this.aggiorna(); } } }, 'Nessuno'),
        h('button', { class: 'btn primario mt-aggiungi', on: { click: () => void this.aggiungi() } }, '＋ Aggiungi foto e video')),
      this.griglia,
      piede(h('span', { class: 'mt-spazio' }), avanti(1, 'Avanti: Stile ›')));

    // ——— 2 · lo stile ———
    this.carteFesta = h('div', { class: 'mt-feste' });
    const quanti = conteggiCategorie(PRESET_MONTAGE);
    const filtri = h('div', { class: 'isp-chips mt-filtri' }, [{ id: 'tutte', nome: 'Tutti' }, ...CATEGORIE_MONTAGE].map((c) =>
      chip(`${c.nome} · ${quanti[c.id] ?? 0}`, () => this.filtro === c.id, () => { this.filtro = c.id; this.disegnaFeste(); this.disegnaAnteprimeFeste(); })));
    const passoStile = h('section', { class: 'mt-passo mt-colfesta' },
      intesta('Che storia raccontiamo?', `${PRESET_MONTAGE.length} stili: colori, movimenti, transizioni e titoli vengono da lì`),
      filtri, this.carteFesta,
      piede(indietro(0), h('span', { class: 'mt-spazio' }), avanti(2, 'Avanti: Durata e musica ›')));

    // ——— 3 · durata, musica, titoli e il resto: tutto in una schermata ———
    const mm = h('input', { type: 'number', class: 'num', min: 0, max: 60, step: 1, title: 'minuti' }) as HTMLInputElement;
    const ss = h('input', { type: 'number', class: 'num', min: 0, max: 59, step: 5, title: 'secondi' }) as HTMLInputElement;
    const daNumeri = () => { this.s.durata = Math.max(10, Math.min(3600, (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0))); this.cambiato(); this.salva(); this.sinc.forEach((f) => f()); this.aggiorna(); };
    mm.addEventListener('change', daNumeri); ss.addEventListener('change', daNumeri);
    this.sinc.push(() => { if (document.activeElement !== mm) mm.value = String(Math.floor(this.s.durata / 60)); if (document.activeElement !== ss) ss.value = String(this.s.durata % 60); });
    const scheda = (titolo: string, ...figli: (Node | null)[]) => h('div', { class: 'mt-scheda' }, h('h4', null, titolo), ...figli);
    const passoCome = h('section', { class: 'mt-passo mt-colcome' },
      intesta('Quanto dura, con che musica?', 'Tutto qui, senza scorrere: l\'anteprima la vedi dopo'),
      h('div', { class: 'mt-schede' },
        scheda('Quanto dura',
          h('div', { class: 'isp-chips' }, DURATE.map((d) => chip(fmtDur(d), () => this.s.durata === d, () => { this.s.durata = d; }))),
          h('div', { class: 'isp-riga mt-minsec' }, h('label', null, 'Durata esatta'), h('span', { class: 'mt-mmss' }, mm, ':', ss)),
          h('h4', null, 'Ritmo'),
          h('div', { class: 'isp-chips' }, RITMI_LENTI.map((t, k) => chip(t, () => this.s.lentezza === k, () => { this.s.lentezza = k; }, k ? 'Meno cose, ognuna resta più a lungo' : 'Il ritmo che ha scelto lo stile')))),
        scheda('Musica',
          this.selMusica,
          h('button', { class: 'btn', on: { click: () => void this.aggiungiBrano() } }, '＋ Aggiungi un brano'),
          this.infoRitmo,
          h('h4', null, 'Audio dei video'),
          h('div', { class: 'isp-chips' },
            chip('Muto', () => this.s.audioVideo <= -50, () => { this.s.audioVideo = -60; }),
            chip('Basso', () => this.s.audioVideo === -14, () => { this.s.audioVideo = -14; }),
            chip('Normale', () => this.s.audioVideo === -3, () => { this.s.audioVideo = -3; }))),
        scheda('Titoli e testi', this.campiTesto, interruttore('Titoli di apertura e chiusura', 'Il titolo all\'inizio e quello in fondo, come li prevede lo stile', 'titoli')),
        scheda('Ordine e tagli',
          h('div', { class: 'isp-chips' },
            chip('Per data', () => this.s.ordine === 'data', () => { this.s.ordine = 'data'; }, 'Dalla data di scatto (EXIF) o del file'),
            chip('A caso', () => this.s.ordine === 'caso', () => { this.s.ordine = 'caso'; }, 'Mescolate: lo stesso mazzo dà sempre lo stesso risultato'),
            chip('Come le ho messe', () => this.s.ordine === 'dato', () => { this.s.ordine = 'dato'; }, 'Nell\'ordine del contenitore')),
          interruttore('Scarta mosse e doppie', 'Se sono più di quelle che servono tiene le migliori; toglie le raffiche quasi uguali', 'scarta'),
          interruttore('Cuori, petali ed effetti', 'Quello che cade sopra e gli effetti a tempo sui tagli', 'effetti')),
        scheda('Formato',
          h('div', { class: 'isp-chips' }, ([['auto', 'Come lo stile'], ['progetto', 'Come il progetto'], ['16:9', 'Orizzontale'], ['9:16', 'Verticale'], ['1:1', 'Quadrato']] as [Formato, string][])
            .map(([f, t]) => chip(t, () => this.s.formato === f, () => { this.s.formato = f; }, 'Il formato si cambia solo se il progetto è ancora vuoto: se no resta quello che c\'è'))),
          h('h4', null, 'Foto di un altro formato'),
          h('div', { class: 'isp-chips' },
            chip('Intere, con lo sfondo', () => this.s.adatta === 'intero', () => { this.s.adatta = 'intero'; }, 'Nessun pezzo tagliato: la foto sta intera su uno sfondo sfumato, con l\'ombra'),
            chip('Riempi il quadro', () => this.s.adatta === 'riempi', () => { this.s.adatta = 'riempi'; }, 'A tutto quadro, senza bande: i bordi che non entrano si tagliano (mai stirate)')))),
      piede(indietro(1), this.riepilogo, this.bVedi, this.bCrea));

    // ——— 4 · l'anteprima: il monitor vero sta a sinistra (lo mette il CSS), qui i comandi ———
    this.vuota = h('div', { class: 'mt-vuota' }, h('p', null, 'Qui compare l\'anteprima.'), this.bRifai);
    const ritocchi = RITOCCHI.map((x) => {
      const el = h('button', { class: 'btn mt-ritocco', 'data-ritocco': x.r, title: x.info, on: { click: () => void this.ritocco(x.r) } }) as HTMLButtonElement;
      this.ritocchi.push({ r: x.r, el });
      return el;
    });
    const sopra = [
      h('h2', { class: 'mt-tiPiace' }, 'Ti piace?'), this.riassuntoEl,
      this.bImporta, this.bRigenera, this.bScarta,
      h('h4', { class: 'mt-etic' }, 'Ritocchi veloci'), h('div', { class: 'mt-ritocchi' }, ritocchi),
    ];
    this.comandiAnteprima = sopra;
    const passoAnteprima = h('section', { class: 'mt-passo mt-colanteprima' },
      ...sopra, this.vuota,
      h('div', { class: 'mt-lavoro' }, ...this.lavoro.elementi), this.noteEl, this.etichetta,
      h('span', { class: 'mt-spazio' }),
      h('button', { class: 'btn mt-ritorna', on: { click: () => this.vai(2) } }, '‹ Cambia le scelte'));

    this.passi = [passoFile, passoStile, passoCome, passoAnteprima];
    this.bPassi = PASSI.map((p, i) => h('button', { class: 'mt-vai', 'data-passo': p.id, on: { click: () => this.vai(i) } }, h('span', { class: 'mt-n' }, String(i + 1)), p.nome) as HTMLButtonElement);

    this.el = h('section', { class: 'montage' },
      h('nav', { class: 'mt-etapes', 'aria-label': 'Preparazione del montaggio' },
        h('div', { class: 'mt-marchio' }, h('b', null, 'DAPROD'), h('b', { class: 'mt-m' }, 'MONTAGE'), h('span', { class: 'sch-cartellino', 'data-stato': 'pronta', title: 'Funziona sul computer, senza AI da scaricare' }, 'PRONTA')),
        h('div', { class: 'mt-passi' }, this.bPassi),
        h('span', { class: 'live-tastiera' }, 'F8')),
      h('fieldset', { class: 'mt-dentro' }, ...this.passi));
    this.mostraPasso(this.passo);
    quandoFotogramma(() => { if (this.scorrendo) this.disegnaScorre(); });
    store.on('doc', () => {
      // un annulla (o una modifica) ha tolto l'anteprima di mezzo: i bottoni tornano a "Crea"
      if (this.anteprima && !this.occupato && !this.anteprimaViva()) this.anteprima = null;
      if (this.visibile) this.rinfresca(); else this.aggiornaBarra();
    });
    this.sincronizza();
  }

  private passo = 0;
  /** il passo mostrato; aggiorna la barra, il monitor (solo all'anteprima, o per guardare un video) e ferma quello che suonava */
  private mostraPasso(passo: number) {
    const prima = this.passo;
    this.passo = passo;
    if (passo !== 0) this.guardando = false;
    if (prima === 3 && passo !== 3) this.motoreFerma();
    this.passi.forEach((e, i) => e.classList.toggle('attivo', i === passo));
    this.bPassi.forEach((b, i) => { const st = statoPasso(i, passo); b.dataset.stato = st; b.setAttribute('aria-current', st === 'attuale' ? 'step' : 'false'); });
    if (passo === 1) { this.disegnaFeste(); this.disegnaAnteprimeFeste(); }
    if (passo === 3) motore.setMonitor('recorder');
    this.applicaPagina();
    this.aggiornaBarra();
  }

  /** gli attributi sulla pagina: il CSS mostra il monitor grande solo all'anteprima (o accanto ai file, per guardare un video) */
  private applicaPagina() {
    const radice = document.getElementById('app');
    if (!radice) return;
    radice.dataset.mtPasso = String(this.passo);
    const m = !this.visibile ? '' : this.passo === 3 ? 'anteprima' : this.passo === 0 && this.guardando ? 'guarda' : '';
    if (m) radice.dataset.mtMonitor = m; else delete radice.dataset.mtMonitor;
  }

  /** va a un passo; l'anteprima si fa (o si rifà, se hai cambiato qualcosa) quando ci arrivi */
  private vai(i: number) {
    if (!puoiAndare(i, this.entrate().length)) { avviso('Scegli almeno una foto o un video per vedere l\'anteprima', 'info', 2200); return; }
    if (i === 3 && !this.occupato) {
      if (!this.anteprima) { void this.crea().catch(() => undefined); return; }
      if (this.datata) { void this.crea(this.anteprima.seme).catch(() => undefined); return; }
    }
    this.mostraPasso(i);
  }

  /** hai cambiato una scelta: l'anteprima che c'è non la rispecchia più */
  private cambiato() { if (this.anteprima) this.datata = true; }

  private carteFesta: HTMLElement;
  private filtro = 'tutte';
  private timerAgg = 0;
  /** le anteprime dei titoli degli stili, già disegnate (una volta sola: sono 28) */
  private titoliStili = new Map<string, HTMLCanvasElement>();

  private salva() { scrivi(this.s); }
  private sincronizza() { this.sinc.forEach((f) => f()); }

  private disponibili(): MediaItem[] { return store.doc.media.filter((m) => (m.type === 'image' || m.type === 'video') && m.width > 0); }
  private brani(): MediaItem[] { return store.doc.media.filter((m) => m.type === 'audio'); }

  mostrata(si: boolean) {
    this.visibile = si;
    if (!si) { this.motoreFerma(); this.guardando = false; }
    this.applicaPagina();
    if (si) { this.rinfresca(); void caricaFontAnimazioni().then(() => { this.titoliStili.clear(); if (this.visibile && this.passo === 1) this.disegnaAnteprimeFeste(); }); }
  }

  private disegnaScorre() {
    const s = this.scorrendo;
    if (!s) return;
    const f = fotogramma('mt', s.m.id, s.t, false);
    if (!f) return;
    const ctx = s.cv.getContext('2d')!;
    const W = s.cv.width, H = s.cv.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (f instanceof ImageBitmap) {
      const k = Math.min(W / f.width, H / f.height);
      ctx.drawImage(f, (W - f.width * k) / 2, (H - f.height * k) / 2, f.width * k, f.height * k);
    } else {
      try { f.drawWithFit(ctx, { fit: 'contain' }); } catch { /* fotogramma chiuso nel frattempo */ }
    }
  }

  /** il video nel monitor (accanto ai file), con i suoi comandi: si guarda e poi si decide se usarlo */
  private guardaNelMonitor(m: MediaItem) {
    this.motoreFerma();
    this.guardando = true;
    this.applicaPagina();
    this.aggiornaBarra();
    motore.caricaPlayer(m.id);
    motore.setMonitor('player');
    motore.play(1);
  }

  private chiudiMonitor() {
    this.motoreFerma();
    this.guardando = false;
    motore.setMonitor('recorder');
    this.applicaPagina();
    this.aggiornaBarra();
  }

  private rinfresca() {
    // i file nuovi si scelgono da soli (quelli che l'utente ha già tolto a mano restano tolti)
    for (const m of this.disponibili()) if (!this.viste.has(m.id)) { this.viste.add(m.id); this.incluse.add(m.id); }
    for (const id of [...this.incluse]) if (!store.doc.media.some((m) => m.id === id)) { this.incluse.delete(id); this.tieniId.delete(id); }
    this.disegnaFile();
    this.disegnaFeste();
    if (this.passo === 1) this.disegnaAnteprimeFeste();
    this.disegnaTesti();
    this.disegnaMusica();
    this.sincronizza();
    this.aggiorna();
    this.aggiornaBarra();
  }

  private disegnaFile() {
    const lista = this.disponibili();
    this.carte.clear();
    const L = 320, A = 180;
    const tessere = lista.map((m) => {
      const cv = h('canvas', { width: L, height: A }) as HTMLCanvasElement;
      const disegnaPoster = () => {
        const r = mediaRT(m.id);
        const src = r?.poster as (CanvasImageSource & { width: number; height: number }) | undefined;
        const x = cv.getContext('2d')!;
        x.fillStyle = '#15141a'; x.fillRect(0, 0, L, A);
        if (src && src.width) { const k = Math.min(L / src.width, A / src.height); x.drawImage(src, (L - src.width * k) / 2, (A - src.height * k) / 2, src.width * k, src.height * k); }
      };
      disegnaPoster();
      const linea = h('i', { class: 'mt-linea' });
      const tempo = h('i', { class: 'mt-tempo' });
      // un video si guarda prima di sceglierlo: passando col mouse scorre; la lente lo apre nel monitor accanto
      const guarda = m.type === 'video' ? h('i', { class: 'mt-guarda', title: 'Guardalo nel monitor (play)', on: { click: (e: MouseEvent) => { e.stopPropagation(); this.guardaNelMonitor(m); }, pointerdown: (e: PointerEvent) => e.stopPropagation() } }, '🔍') : null;
      const scarto = h('i', { class: 'mt-scarto' });
      const el = h('button', { class: 'mt-thumb' + (this.incluse.has(m.id) ? ' scelta' : ''), title: `${m.name}${m.type === 'video' ? ` · ${fmtDur(m.duration)}` : ''}\nClic: usa / non usare${m.type === 'video' ? ' · passaci sopra per vederlo scorrere · 🔍 lo guardi nel monitor' : ''}`, 'data-id': m.id,
        on: {
          click: () => {
            // una scartata (mossa, doppia, in più): il primo clic la rimette; poi si comporta come tutte
            if (this.incluse.has(m.id) && this.scarti.has(m.id) && !this.tieniId.has(m.id)) { this.rimetti(m.id); return; }
            if (this.incluse.has(m.id)) { this.incluse.delete(m.id); this.tieniId.delete(m.id); } else this.incluse.add(m.id);
            el.classList.toggle('scelta', this.incluse.has(m.id));
            this.cambiato();
            this.aggiorna();
          },
          dblclick: () => { if (m.type === 'video') this.guardaNelMonitor(m); },
        } },
      cv, linea, tempo, m.type === 'video' ? h('i', { class: 'mt-tipo' }, '▶') : null, guarda, scarto, h('i', { class: 'mt-spunta' }, '✓'));
      if (m.type === 'video' && mediaRT(m.id)?.stato === 'ok') {
        const dur = Math.max(0.1, m.duration - (m.t0 || 0));
        el.addEventListener('pointermove', (e) => {
          if (e.pointerType === 'touch') return;
          const r = el.getBoundingClientRect();
          const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          linea.style.left = k * 100 + '%';
          el.classList.add('scorre');
          tempo.textContent = fmtDur(k * dur) + ' / ' + fmtDur(dur);
          this.scorrendo = { m, cv, t: (m.t0 || 0) + k * Math.max(0, dur - 0.04) };
          this.disegnaScorre();
        });
        el.addEventListener('pointerleave', () => {
          el.classList.remove('scorre');
          if (this.scorrendo?.cv === cv) this.scorrendo = null;
          lascia('mt', m.id);
          disegnaPoster();
        });
      }
      this.carte.set(m.id, el);
      return el;
    });
    // il primo riquadro è sempre «aggiungi»: foto e video si possono anche trascinare dove vuoi
    const aggiungi = h('button', { class: 'mt-aggiungi-tessera', title: 'Aggiungi foto e video (o trascinali qui)', on: { click: () => void this.aggiungi() } }, h('b', null, '＋'), h('span', null, 'Aggiungi foto e video'), h('small', null, 'o trascinali dove vuoi'));
    this.griglia.replaceChildren(aggiungi, ...tessere);
    if (!lista.length) this.griglia.replaceChildren(h('div', { class: 'mt-vuoto' }, h('b', null, 'Ancora niente'), h('p', null, 'Trascina qui le foto e i video, oppure premi «Aggiungi».'), aggiungi));
    this.marcaScarti();
  }

  /** i bordi grigi: le scartate (con il perché) e quelle che l'utente ha rimesso */
  private marcaScarti() {
    let n = 0;
    for (const [id, el] of this.carte) {
      const motivo = this.incluse.has(id) ? this.scarti.get(id) : undefined;
      const rimessa = !!motivo && this.tieniId.has(id);
      const scartata = !!motivo && !rimessa;
      if (scartata) n++;
      el.classList.toggle('scartata', scartata);
      const e = el.querySelector<HTMLElement>('.mt-scarto');
      if (e) e.textContent = scartata ? ETICHETTA_SCARTO[motivo!] : '';
      el.dataset.scarto = scartata ? motivo! : '';
      if (scartata) el.title = `${SPIEGA_SCARTO[motivo!]}`;
    }
    this.bScartate.style.display = n ? '' : 'none';
    this.bScartate.textContent = `${n} ${n === 1 ? 'scartata' : 'scartate'} · rimettile`;
  }

  /** una scartata torna nel montaggio (e il motore non la scarta più) */
  private rimetti(id: string) {
    this.tieniId.add(id);
    this.cambiato();
    this.aggiorna();
  }

  private rimettiTutte() {
    for (const [id, m] of this.scarti) if (this.incluse.has(id) && m) this.tieniId.add(id);
    this.cambiato();
    this.aggiorna();
  }

  private disegnaTesti() {
    const pr = presetMontage(this.s.preset)!;
    const campo = (k: keyof TestiMontage, nome: string) => {
      const i = h('input', { class: 'campo-testo', type: 'text', placeholder: pr.chiede[k] ?? '', value: this.s.testi[k] }) as HTMLInputElement;
      i.addEventListener('input', () => { this.s.testi[k] = i.value; this.cambiato(); this.salva(); });
      return h('label', { class: 'mt-campo' }, h('span', null, nome), i);
    };
    const c: HTMLElement[] = [];
    if ('nomi' in pr.chiede) c.push(campo('nomi', 'Nomi'));
    if ('titolo' in pr.chiede) c.push(campo('titolo', 'Titolo'));
    if ('data' in pr.chiede) c.push(campo('data', 'Data o luogo'));
    c.push(campo('sottotitolo', 'Sottotitolo (facoltativo)'));
    this.campiTesto.replaceChildren(...c);
  }

  private disegnaMusica() {
    const b = this.brani();
    this.selMusica.replaceChildren(h('option', { value: '' }, 'Nessuna musica'), ...b.map((m) => h('option', { value: m.id }, `${m.name} · ${fmtDur(m.duration)}`)));
    if (this.s.musica && !b.some((m) => m.id === this.s.musica)) this.s.musica = '';
    this.selMusica.value = this.s.musica;
    // il ritmo del brano, se si è già ascoltato
    const r = this.s.musica ? this.ritmi.get(this.s.musica) : undefined;
    const bpm = r?.bpm ?? bpmDaBattiti(r?.battiti);
    this.infoRitmo.textContent = !this.s.musica ? 'Senza musica il montaggio resta muto: la aggiungi dopo.'
      : !r ? 'Il ritmo lo ascolto quando crei l\'anteprima: con un brano ritmato i tagli cadono sui battiti.'
        : r.battiti ? `♪ ${bpm ? bpm + ' battiti al minuto' : 'Ritmo trovato'}: i tagli cadono sui battiti.` : 'Nel brano non c\'è un ritmo chiaro: i tagli non lo seguono.';
  }

  private disegnaFeste() {
    const lista = stiliPerCategoria(PRESET_MONTAGE, this.filtro);
    this.carteFesta.replaceChildren(...lista.map((p) => this.cartaFesta(p)));
  }

  /** la scheda di uno stile: il suo colore, il nome, due parole e (appena i caratteri sono pronti) il suo titolo vero */
  private cartaFesta(p: PresetMontage): HTMLElement {
    const cv = h('canvas', { width: 384, height: 216, 'data-titolo': p.id }) as HTMLCanvasElement;
    return h('button', { class: 'mt-festa' + (this.s.preset === p.id ? ' scelta' : ''), title: `${p.nome}\n${p.info}\nMusica: ${p.musica}`, 'data-preset': p.id, style: `background:${fondoStile(p)}`,
      on: { click: () => { this.s.preset = p.id; this.cambiato(); this.salva(); this.disegnaFeste(); this.disegnaAnteprimeFeste(); this.disegnaTesti(); this.aggiorna(); } } },
    cv, h('i', { class: 'mt-velo' }), h('span', { class: 'mt-emoji' }, p.emoji),
    h('b', null, p.nome), h('small', null, p.info), h('em', null, `${RITMO_PAROLE[p.ritmo]} · ${p.musica}`));
  }

  /** disegna nelle schede il titolo di ogni stile (una volta sola per stile) */
  private disegnaAnteprimeFeste() {
    for (const cv of this.carteFesta.querySelectorAll<HTMLCanvasElement>('canvas[data-titolo]')) {
      const p = presetMontage(cv.dataset.titolo ?? '');
      if (!p) continue;
      let pronta = this.titoliStili.get(p.id);
      if (!pronta) {
        pronta = h('canvas', { width: 384, height: 216 }) as HTMLCanvasElement;
        try {
          const esempio: TestiMontage = { titolo: p.chiede.titolo ?? '', sottotitolo: '', nomi: p.chiede.nomi ?? '', data: p.chiede.data ?? '' };
          const an = p.apertura?.(esempio);
          if (an) pronta.getContext('2d')!.drawImage(disegnaAnimazione(an, 768, 432, 2.4, 6) as CanvasImageSource, 0, 0, 384, 216);
        } catch { /* resta il fondo */ }
        this.titoliStili.set(p.id, pronta);
      }
      cv.getContext('2d')!.drawImage(pronta, 0, 0);
    }
  }

  private entrate(): EntrataMontage[] {
    return this.disponibili().filter((m) => this.incluse.has(m.id)).map((m) => ({
      media: m.id, nome: m.name, tipo: m.type as 'image' | 'video', durata: m.type === 'video' ? m.duration : 0, ...misure(m),
      data: m.lastModified || 0, audio: m.hasAudio, punteggio: 0.5, ...(this.s.scarta ? this.analisi.get(m.id) : undefined),
    }));
  }

  private opzioni(musica?: OpzMontage['musica'], seme = 12345): OpzMontage {
    return {
      preset: this.s.preset, durata: this.s.durata, ordine: this.s.ordine, titoli: this.s.titoli, effetti: this.s.effetti, audioVideo: this.s.audioVideo, testi: this.s.testi, seme,
      scarta: this.s.scarta, adatta: this.s.adatta, musica, lentezza: this.s.lentezza, tieni: [...this.tieniId],
    };
  }

  /** il riassunto sotto le scelte: quante foto, quanto sta ognuna (senza analisi nuova: serve solo a dare un'idea) */
  private aggiorna() {
    clearTimeout(this.timerAgg);
    this.timerAgg = window.setTimeout(() => {
      const e = this.entrate();
      const nF = e.filter((x) => x.tipo === 'image').length, nV = e.length - nF;
      this.conta.textContent = e.length ? `${nF} foto · ${nV} video scelti` : 'Nessun file scelto';
      this.aggiornaBarra();
      if (!e.length) { this.riepilogo.textContent = 'Scegli almeno un file.'; this.scarti = new Map(); this.marcaScarti(); return; }
      const mus = this.s.musica ? this.brani().find((m) => m.id === this.s.musica) : undefined;
      const op = this.opzioni(mus ? { media: mus.id, durata: mus.duration } : undefined, this.anteprima?.seme ?? 12345);
      const pi = pianifica(e, op);
      const pr = presetMontage(this.s.preset)!;
      // con un'anteprima viva e invariata gli scarti sono quelli veri, li ha messi `crea`
      if (!this.anteprima || this.datata) { this.scarti = motiviScarto(e, new Set(pi.voci.map((v) => v.entrata.media)), op); this.marcaScarti(); }
      this.riepilogo.replaceChildren(
        h('b', null, `${pr.emoji} ${pr.nome} · ${fmtDur(this.s.durata)}`),
        h('div', null, `${pi.voci.length} cose sulla linea · circa ${pi.perFoto.toFixed(1).replace('.', ',')} s ciascuna`),
        ...pi.note.slice(0, 1).map((n) => h('div', { class: 'fin-attento' }, '• ' + n)));
    }, 120);
  }

  private async aggiungi() { await importaDialogo(); }

  /** un brano nuovo dal disco; vero se ne è arrivato uno (e allora è quello scelto) */
  private async aggiungiBrano(): Promise<boolean> {
    const prima = new Set(this.brani().map((m) => m.id));
    await importaDialogo(undefined, 'audio');
    const nuovo = this.brani().find((m) => !prima.has(m.id));
    this.disegnaMusica();
    if (nuovo) { this.s.musica = nuovo.id; this.selMusica.value = nuovo.id; this.cambiato(); this.disegnaMusica(); this.aggiorna(); }
    return !!nuovo;
  }

  /** i comandi: «Crea» finché non c'è un'anteprima, poi «Sì, portalo», «Fammene un'altra», «Scarta» e i ritocchi */
  private aggiornaBarra() {
    const c = !!this.anteprima;
    const n = this.entrate().length;
    const mostra = (e: HTMLElement, si: boolean) => { e.style.display = si ? '' : 'none'; };
    mostra(this.bCrea, !c);
    mostra(this.bVedi, c);
    this.comandiAnteprima.forEach((e) => mostra(e, c));
    mostra(this.vuota, !c);
    mostra(this.bChiudiMonitor, this.guardando);
    this.bCrea.disabled = this.occupato || !n;
    this.bVedi.disabled = this.occupato || !n;
    this.bRifai.disabled = this.occupato || !n;
    this.bRigenera.disabled = this.occupato || !n;
    this.bImporta.disabled = this.occupato;
    this.bScarta.disabled = this.occupato;
    const brani = this.brani().length;
    for (const { r, el } of this.ritocchi) { el.textContent = nomeRitocco(r, this.s, brani); el.disabled = this.occupato || !c; }
    this.bPassi.forEach((b, i) => { b.disabled = !puoiAndare(i, n); });
    const impostazioni = this.el.querySelector<HTMLFieldSetElement>('fieldset.mt-dentro');
    if (impostazioni) impostazioni.disabled = this.occupato;
    this.etichetta.textContent = this.occupato ? 'Analisi richieste · pausa e annulla in Attività' : this.anteprima ? `Anteprima · variante ${codiceSeme(this.anteprima.seme)}` : '';
    this.vuota.firstElementChild!.textContent = this.occupato ? 'Sto preparando l\'anteprima…' : n ? 'Qui compare l\'anteprima.' : 'Scegli prima almeno una foto o un video.';
    mostra(this.bRifai, !this.occupato && n > 0);
    if (!c) { this.riassuntoEl.textContent = ''; this.noteEl.replaceChildren(); }
  }

  /** l'anteprima è ancora quella che abbiamo fatto noi? (se hai cambiato qualcosa o hai annullato, non lo è più) */
  private anteprimaViva(): boolean {
    return !!this.anteprima && store.canUndo() && store.undoLabel() === this.anteprima.etichetta;
  }

  /** toglie l'anteprima (un solo annulla: il progetto torna com'era), se nel frattempo non è stata toccata */
  private togliAnteprima() {
    if (this.anteprimaViva()) store.doUndo();
    this.anteprima = null;
  }

  private scarta() {
    if (this.occupato) return;
    this.motoreFerma();
    this.togliAnteprima();
    this.datata = false;
    this.mostraPasso(2);
    motore.vaiA(0);
    document.dispatchEvent(new CustomEvent('dpv:adatta'));
    avviso('Anteprima scartata', 'info', 1600);
  }

  /** tiene il montaggio: è già una timeline vera, si apre per ritoccarla */
  private importa() {
    if (!this.anteprima) return;
    this.motoreFerma();
    this.anteprima = null;
    this.datata = false;
    this.mostraPasso(2);
    store.select([]);
    document.dispatchEvent(new CustomEvent('dpv:pagina', { detail: 'montaggio' }));
    motore.setMonitor('recorder');
    motore.vaiA(0);
    document.dispatchEvent(new CustomEvent('dpv:adatta'));
    avviso('Montaggio messo nella timeline: ritoccalo come vuoi', 'ok', 2600);
  }

  private motoreFerma() { try { motore.stop(); } catch { /* niente */ } }

  /** un ritocco veloce: cambia la scelta giusta e rifà il montaggio con lo stesso seme (cambia solo quello che hai chiesto) */
  private async ritocco(r: Ritocco) {
    if (this.occupato || !this.anteprima) return;
    const seme = this.anteprima.seme;
    if (r === 'musica' && !this.brani().length) {
      if (!(await this.aggiungiBrano())) return;
    } else {
      const e = ritocca({ durata: this.s.durata, lentezza: this.s.lentezza, titoli: this.s.titoli, musica: this.s.musica }, r, this.brani().map((m) => m.id));
      if (!e.cambia) { avviso(e.testo, 'info', 1800); return; }
      Object.assign(this.s, e.scelte);
      avviso(e.testo, 'info', 1400);
    }
    this.datata = true;
    this.salva();
    this.disegnaMusica();
    this.sincronizza();
    this.aggiorna();
    await this.crea(seme).catch(() => undefined);
  }

  /** il montaggio vero: legge le date, misura le foto, trova i battiti, pianifica e lo mette in timeline come anteprima.
   *  Ogni volta il seme è nuovo (o quello dato, per le prove): stesse scelte, montaggio diverso. */
  async crea(seme?: number): Promise<void> {
    if (this.occupato) return this.ultimo as Promise<void>;
    this.motoreFerma();
    this.mostraPasso(3);
    this.occupato = true;
    this.aggiornaBarra();
    const lavoro = inCoda({ titolo: 'Montage · prepara anteprima', categoria: 'analisi', corsia: 'pesante', pausa: 'ai-confini', chiave: 'montage:anteprima' }, async (job) => {
      this.occupato = true;
      this.aggiornaBarra();
      const lav = {
        avvia: (t: string) => this.lavoro.avvia(t),
        imposta: (t: string, k: number) => { job.imposta(k, t); this.lavoro.imposta(t, k); },
        fine: (t: string) => this.lavoro.fine(t),
        ferma: (t: string) => this.lavoro.ferma(t),
      };
      lav.avvia('Guardo i file…');
      try {
        this.motoreFerma();
        const lista = this.disponibili().filter((m) => this.incluse.has(m.id));
        const entrate = this.entrate();
        // quando sono state scattate (EXIF) e, se serve, quanto sono venute bene (una volta sola per file)
        for (let i = 0; i < lista.length; i++) {
          await job.checkpoint();
          if (!job.valido) throw new Error('fermato');
          const m = lista[i], e = entrate[i];
          lav.imposta(`Guardo ${m.name} (${i + 1} di ${lista.length})`, (i / lista.length) * 0.6);
          if (m.type === 'image' && /\.jpe?g$/i.test(m.name) && this.s.ordine === 'data') {
            const b = await primiByte(m);
            const d = b ? await dataDiScatto(b) : null;
            if (d) e.data = d;
          }
          if (this.s.scarta) {
            const gia = this.analisi.get(m.id);
            if (gia) { Object.assign(e, gia); continue; }
            try {
              if (m.type === 'image') { const px = await pixelAl(m.id, 0, 128); if (px) { const q = misuraQualita(px); e.punteggio = q.punteggio; e.firma = q.firma; } }
              else if (m.duration > 4) {
                // il pezzo più bello: si guardano sei istanti e si parte da quello migliore
                let best = -1, tb = 0;
                for (let k = 1; k <= 6; k++) { const t = (m.duration * k) / 7; const px = await pixelAl(m.id, t, 96); if (!px) continue; const q = misuraQualita(px); if (q.punteggio > best) { best = q.punteggio; tb = t; } }
                if (best >= 0) { e.punteggio = best; e.inizioMigliore = Math.max(0, tb - 1); }
              }
              if (!job.valido) throw new Error('fermato');
              this.analisi.set(m.id, { punteggio: e.punteggio, firma: e.firma, inizioMigliore: e.inizioMigliore });
            } catch (e) { if (!job.valido) throw e; /* resta il valore di mezzo */ }
          }
        }
        await job.checkpoint();
        if (!job.valido) throw new Error('fermato');
        // La musica è un nuovo pezzo: non parte durante pausa o annullamento.
        let musica: OpzMontage['musica'];
        const mus = this.s.musica ? this.brani().find((m) => m.id === this.s.musica) : undefined;
        if (mus) {
          if (!this.ritmi.has(mus.id)) {
            lav.imposta('Ascolto il ritmo del brano…', 0.65);
            const rit = await battitiDi(mus.id, (k) => lav.imposta('Ascolto il ritmo del brano…', 0.65 + k * 0.2)).catch(() => null);
            const trovati = rit && rit.sicurezza > 0.15 ? rit.battiti : undefined;
            if (!job.valido) throw new Error('fermato');
            this.ritmi.set(mus.id, { battiti: trovati, bpm: trovati && rit ? Math.round(rit.bpm) : undefined });
            if (rit && trovati) avviso(`♪ Ritmo trovato: ${Math.round(rit.bpm)} battiti al minuto`, 'info', 2200);
            this.disegnaMusica();
          }
          const battiti = this.ritmi.get(mus.id)?.battiti;
          musica = { media: mus.id, durata: mus.duration, nome: mus.name, battiti };
        }
        await job.checkpoint();
        if (!job.valido) throw new Error('fermato');
        lav.imposta('Monto…', 0.9);
        const usato = seme ?? nuovoSeme();
        const opz = this.opzioni(musica, usato);
        const piano = pianifica(entrate, opz);
        if (!piano.voci.length) throw new Error('Non c\'è niente da montare');
        const pr = presetMontage(this.s.preset)!;
        // la scorsa anteprima si toglie (un annulla), poi si fa la nuova
        this.togliAnteprima();
        // il formato, solo se il progetto è ancora vuoto
        const vuoto = store.doc.clips.length === 0 && !(store.doc.sequenze ?? []).some((q) => q.clips?.length);
        const f = this.s.formato === 'auto' ? (pr.formato === 'verticale' ? '9:16' : pr.formato === 'quadrato' ? '1:1' : 'progetto') : this.s.formato;
        const etichetta = `${ETICHETTA} · variante ${codiceSeme(usato)}`;
        store.edit(etichetta, (pp) => {
          if (vuoto && f !== 'progetto') { const [w, hh] = MISURE[f]; pp.w = w; pp.h = hh; }
          return costruisciSequenza(pp, piano, opz);
        });
        this.anteprima = { seme: usato, etichetta };
        this.datata = false;
        // gli scarti veri di questa variante (per i bordi grigi del passo 1)
        this.scarti = motiviScarto(entrate, new Set(piano.voci.map((v) => v.entrata.media)), opz);
        this.marcaScarti();
        lav.fine(`Fatto: ${piano.voci.length} cose in ${fmtDur(piano.durata)}`);
        store.select([]);
        motore.setMonitor('recorder');
        motore.vaiA(0);
        document.dispatchEvent(new CustomEvent('dpv:adatta'));
        if (this.partenza) motore.play(1);
        else motore.vaiA(Math.round(Math.min(1.5, piano.durata / 10) * (store.doc.rate.num / store.doc.rate.den)));
        this.riassuntoAnteprima(piano.voci.length, piano.durata, piano.note, mus ? { nome: mus.name, sulBattito: !!musica?.battiti?.length, bpm: this.ritmi.get(mus.id)?.bpm ?? bpmDaBattiti(musica?.battiti) } : undefined);
        this.ultimo = Promise.resolve(piano);
      } catch (e) {
        lav.ferma(job.valido ? 'Non riuscito' : 'Fermato');
        avviso('DaProdMontage: ' + (e instanceof Error ? e.message : String(e)), 'errore', 5000);
        throw e;
      } finally {
        this.occupato = false;
        this.aggiornaBarra();
        this.aggiorna();
      }
    }).then(() => undefined).finally(() => {
      this.occupato = false;
      this.aggiornaBarra();
      this.aggiorna();
    });
    this.ultimo = lavoro;
    return lavoro;
  }

  /** il montaggio parte da solo appena è pronto (le prove lo spengono) */
  partenza = true;

  /** la frase sotto «Ti piace?», le note del montaggio e l'avviso */
  private riassuntoAnteprima(n: number, durata: number, note: string[], musica?: { nome: string; sulBattito: boolean; bpm?: number }) {
    const pr = presetMontage(this.s.preset)!;
    const e = this.entrate();
    const nF = e.filter((x) => x.tipo === 'image').length;
    this.riassuntoEl.textContent = riassunto({ stile: pr.nome, nFoto: nF, nVideo: e.length - nF, durata, musica });
    this.noteEl.replaceChildren(...note.map((t) => h('div', { class: 'fin-attento' }, '• ' + t)));
    avviso(`${pr.emoji} ${pr.nome}: ${n} cose in ${fmtDur(durata)}${note.length ? ' · ' + note[0] : ''}. Ti piace? Portalo nel Montaggio; se no, fammene un'altra`, 'ok', 5000);
  }
}
