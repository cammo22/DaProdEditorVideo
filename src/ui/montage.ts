// DaProdMontage: la quarta pagina. Butti dentro foto e video alla rinfusa, scegli che festa è, dici quanto deve durare e
// il programma monta da solo: ordine, tempi, movimenti, transizioni, titoli, cuori e petali, musica a tempo. Il risultato
// è una timeline vera (una scheda nuova) che poi ritocchi come vuoi. Il motore sta in src/core/montage.ts.
import { inCoda } from '../media/attivita';
import { store } from '../core/store';
import type { MediaItem } from '../core/tipi';
import { CATEGORIE_MONTAGE, PRESET_MONTAGE, presetMontage, type PresetMontage, type TestiMontage } from '../core/montagePreset';
import { costruisciSequenza, fmtDur, pianifica, type EntrataMontage, type Ordine, type OpzMontage } from '../core/montage';
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
}

/** l'inizio del nome con cui l'anteprima sta nell'annulla (serve a riconoscerla: ogni variante ha il suo) */
const ETICHETTA = 'DaProdMontage';
/** un seme nuovo a ogni montaggio */
const nuovoSeme = () => (Math.random() * 0x7fffffff) >>> 0;
/** il seme in breve, da far vedere ("Variante K7F2Q") e da scriversi se un montaggio piace */
const codiceSeme = (n: number) => n.toString(36).toUpperCase().padStart(5, '0').slice(-5);

const DURATE = [30, 60, 90, 120, 180, 300, 600];
const MISURE: Record<Exclude<Formato, 'auto' | 'progetto'>, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };

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
  private griglia: HTMLElement;
  private conta: HTMLElement;
  private carte = new Map<string, HTMLElement>();
  private riepilogo: HTMLElement;
  private lavoro = new BarraLavoro();
  private bCrea: HTMLButtonElement;
  private selMusica: HTMLSelectElement;
  private campiTesto: HTMLElement;
  private sinc: (() => void)[] = [];
  private visibile = false;
  private occupato = false;
  /** l'anteprima in timeline (finché non la importi): il seme con cui è nata */
  private anteprima: { seme: number; etichetta: string } | null = null;
  private bRigenera: HTMLButtonElement;
  private bImporta: HTMLButtonElement;
  private bScarta: HTMLButtonElement;
  private etichetta: HTMLElement;
  /** quello che si è già misurato (qualità, pezzo migliore, battiti): rigenerare è subito */
  /** il video su cui passa il mouse (anteprima che scorre) */
  private scorrendo: { m: MediaItem; cv: HTMLCanvasElement; t: number } | null = null;
  private analisi = new Map<string, { punteggio: number; firma?: string; inizioMigliore?: number }>();
  private ritmi = new Map<string, number[] | undefined>();
  /** finisce quando il montaggio è pronto (per le prove) */
  ultimo: Promise<unknown> = Promise.resolve();

  constructor() {
    const salvate = leggi();
    this.s = {
      preset: salvate.preset && presetMontage(salvate.preset) ? salvate.preset : 'matrimonio', durata: salvate.durata ?? 120, ordine: salvate.ordine ?? 'data',
      titoli: salvate.titoli ?? true, effetti: salvate.effetti ?? true, scarta: salvate.scarta ?? true, audioVideo: salvate.audioVideo ?? -14, formato: salvate.formato ?? 'auto', adatta: salvate.adatta ?? 'intero',
      testi: salvate.testi ?? { titolo: '', sottotitolo: '', nomi: '', data: '' }, musica: '',
    };
    this.griglia = h('div', { class: 'mt-file' });
    this.conta = h('div', { class: 'mt-conta' });
    this.riepilogo = h('div', { class: 'mt-riepilogo' });
    this.campiTesto = h('div', { class: 'mt-testi' });
    this.selMusica = h('select', { class: 'mini-select largo', title: 'La musica del video', on: { change: () => { this.s.musica = this.selMusica.value; this.aggiorna(); } } }) as HTMLSelectElement;
    this.bCrea = h('button', { class: 'btn primario mt-crea', on: { click: () => void this.crea() } }, 'Crea anteprima') as HTMLButtonElement;
    this.bRigenera = h('button', { class: 'btn mt-rigenera', title: 'Un altro montaggio con le stesse scelte: cambiano movimenti, durate, transizioni ed effetti', on: { click: () => void this.crea() } }, '🎲 RIGENERA') as HTMLButtonElement;
    this.bImporta = h('button', { class: 'btn primario mt-importa', title: 'Tiene questo montaggio e apre la timeline per ritoccarlo', on: { click: () => this.importa() } }, 'Tieni e apri nel Montaggio') as HTMLButtonElement;
    this.bScarta = h('button', { class: 'btn mt-scarta', title: 'Toglie l\'anteprima e torna a com\'era prima', on: { click: () => this.scarta() } }, '✖ Scarta') as HTMLButtonElement;
    this.etichetta = h('span', { class: 'mt-variante' });

    const chip = (testo: string, acceso: () => boolean, fn: () => void, title = '') => {
      const b = h('button', { class: 'chip', title, on: { click: () => { fn(); this.salva(); this.sinc.forEach((f) => f()); this.aggiorna(); } } }, testo);
      this.sinc.push(() => b.classList.toggle('acceso', acceso()));
      return b;
    };
    const interruttore = (testo: string, info: string, k: 'titoli' | 'effetti' | 'scarta') => {
      const led = h('span', { class: 'led' });
      const b = h('button', { class: 'fin-interruttore', title: info, on: { click: () => { this.s[k] = !this.s[k]; this.salva(); this.sinc.forEach((f) => f()); this.aggiorna(); } } }, led, h('span', { class: 'fin-int-testo' }, testo));
      this.sinc.push(() => { b.classList.toggle('acceso', this.s[k]); led.classList.toggle('acceso', this.s[k]); });
      return b;
    };

    // ——— 1 · i file ———
    const colFile = h('section', { class: 'mt-col mt-colfile' },
      h('h3', null, h('span', { class: 'mt-num' }, '1'), 'I tuoi file'),
      h('p', { class: 'nota' }, 'Foto e video alla rinfusa, anche solo foto. Trascinali qui o in qualunque parte del programma.'),
      h('div', { class: 'mt-barra' },
        h('button', { class: 'btn-mini oro', on: { click: () => void this.aggiungi() } }, '＋ Aggiungi foto e video'),
        h('button', { class: 'btn-mini', on: { click: () => { for (const m of this.disponibili()) this.incluse.add(m.id); this.disegnaFile(); this.aggiorna(); } } }, 'Tutti'),
        h('button', { class: 'btn-mini', on: { click: () => { this.incluse.clear(); this.disegnaFile(); this.aggiorna(); } } }, 'Nessuno')),
      this.conta, this.griglia);

    // ——— 2 · la festa ———
    this.carteFesta = h('div', { class: 'mt-feste' });
    const filtri = h('div', { class: 'isp-chips' }, [{ id: 'tutte', nome: 'Tutte' }, ...CATEGORIE_MONTAGE].map((c) => chip(c.nome, () => this.filtro === c.id, () => { this.filtro = c.id; this.disegnaFeste(); })));
    const colFesta = h('section', { class: 'mt-col mt-colfesta' },
      h('h3', null, h('span', { class: 'mt-num' }, '2'), 'Cosa festeggi'),
      h('p', { class: 'nota' }, `${PRESET_MONTAGE.length} stili pronti: ognuno sa quanto tenere le foto, come muoverle, che transizioni usare e cosa far cadere sopra.`),
      filtri, this.carteFesta);

    // ——— 3 · come lo vuoi ———
    const mm = h('input', { type: 'number', class: 'num', min: 0, max: 60, step: 1, title: 'minuti' }) as HTMLInputElement;
    const ss = h('input', { type: 'number', class: 'num', min: 0, max: 59, step: 5, title: 'secondi' }) as HTMLInputElement;
    const daNumeri = () => { this.s.durata = Math.max(10, Math.min(3600, (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0))); this.salva(); this.sinc.forEach((f) => f()); this.aggiorna(); };
    mm.addEventListener('change', daNumeri); ss.addEventListener('change', daNumeri);
    this.sinc.push(() => { if (document.activeElement !== mm) mm.value = String(Math.floor(this.s.durata / 60)); if (document.activeElement !== ss) ss.value = String(this.s.durata % 60); });
    const colCome = h('section', { class: 'mt-col mt-colcome' },
      h('h3', null, h('span', { class: 'mt-num' }, '3'), 'Come lo vuoi'),
      h('div', { class: 'fin-sezione' }, h('h4', null, 'Quanto dura'),
        h('div', { class: 'isp-chips' }, DURATE.map((d) => chip(fmtDur(d).replace(' s', ' s'), () => this.s.durata === d, () => { this.s.durata = d; }))),
        h('div', { class: 'isp-riga' }, h('label', null, 'Minuti e secondi'), h('span', { class: 'mt-mmss' }, mm, ':', ss))),
      h('div', { class: 'fin-sezione' }, h('h4', null, 'Titoli'), this.campiTesto, interruttore('Titoli di apertura e di chiusura', 'Il titolo all\'inizio e quello in fondo, come li prevede lo stile', 'titoli')),
      h('div', { class: 'fin-sezione' }, h('h4', null, 'Ordine delle foto'),
        h('div', { class: 'isp-chips' },
          chip('Per data', () => this.s.ordine === 'data', () => { this.s.ordine = 'data'; }, 'Dalla data di scatto (EXIF) o del file'),
          chip('A caso', () => this.s.ordine === 'caso', () => { this.s.ordine = 'caso'; }, 'Mescolate: lo stesso mazzo dà sempre lo stesso risultato'),
          chip('Come le ho messe', () => this.s.ordine === 'dato', () => { this.s.ordine = 'dato'; }, 'Nell\'ordine del contenitore')),
        interruttore('Scarta le foto sfocate o doppie', 'Se sono più di quelle che servono tiene le migliori; toglie le raffiche quasi uguali', 'scarta'),
        interruttore('Cuori, petali, coriandoli ed effetti', 'Quello che cade sopra e gli effetti a tempo sui tagli', 'effetti')),
      h('div', { class: 'fin-sezione' }, h('h4', null, 'Musica'),
        this.selMusica,
        h('div', { class: 'isp-pulsanti' }, h('button', { class: 'btn-mini', on: { click: () => void this.aggiungiBrano() } }, '＋ Aggiungi un brano')),
        h('p', { class: 'nota' }, 'Con un brano ritmato i tagli si appoggiano sui battiti. Senza musica il montaggio resta muto: la aggiungi dopo.'),
        h('div', { class: 'isp-chips' },
          chip('Audio dei video: muto', () => this.s.audioVideo <= -50, () => { this.s.audioVideo = -60; }),
          chip('basso', () => this.s.audioVideo === -14, () => { this.s.audioVideo = -14; }),
          chip('normale', () => this.s.audioVideo === -3, () => { this.s.audioVideo = -3; }))),
      h('div', { class: 'fin-sezione' }, h('h4', null, 'Formato'),
        h('div', { class: 'isp-chips' }, ([['auto', 'Come lo stile'], ['progetto', 'Come il progetto'], ['16:9', 'Orizzontale'], ['9:16', 'Verticale'], ['1:1', 'Quadrato']] as [Formato, string][])
          .map(([f, t]) => chip(t, () => this.s.formato === f, () => { this.s.formato = f; }))),
        h('p', { class: 'nota' }, 'Il formato si cambia solo se il progetto è ancora vuoto: se no resta quello che c\'è.'),
        h('h4', null, 'Foto e video di un altro formato'),
        h('div', { class: 'isp-chips' },
          chip('Intere, con lo sfondo', () => this.s.adatta === 'intero', () => { this.s.adatta = 'intero'; }, 'Nessun pezzo tagliato: la foto sta intera su uno sfondo sfumato, con l\'ombra'),
          chip('Riempi il quadro', () => this.s.adatta === 'riempi', () => { this.s.adatta = 'riempi'; }, 'A tutto quadro, senza bande: i bordi che non entrano si tagliano (mai stirate)')),
        h('p', { class: 'nota' }, 'Mai deformate: o intere con lo sfondo, o a tutto quadro con i bordi tagliati.')),
      this.riepilogo);

    this.el = h('section', { class: 'montage' },
      h('header', { class: 'fin-testa' }, h('b', null, 'DAPROD'), h('b', { class: 'mt-m' }, 'MONTAGE'), h('span', null, 'butta dentro le foto, scegli la festa e il programma monta da solo'),
        h('span', { class: 'live-tastiera' }, 'F8 · poi ritocchi tutto nel Montaggio')),
      h('div', { class: 'mt-azioni' }, this.bCrea, this.bRigenera, this.bImporta, this.bScarta, this.etichetta, h('div', { class: 'mt-lavoro' }, ...this.lavoro.elementi)),
      h('nav', { class: 'mt-etapes', 'aria-label': 'Preparazione del montaggio' }, ['1 · Foto e video', '2 · Stile', '3 · Durata, ordine e musica'].map((t, i) => h('button', { class: 'btn', on: { click: () => this.mostraPasso(i) } }, t))),
      h('fieldset', { class: 'mt-dentro' }, colFile, colFesta, colCome));
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
  private mostraPasso(passo: number) {
    this.passo = passo;
    this.el.querySelectorAll<HTMLElement>('.mt-col').forEach((e, i) => { e.classList.toggle('mt-passo-chiuso', i !== passo); });
    this.el.querySelectorAll<HTMLButtonElement>('.mt-etapes button').forEach((e, i) => { e.setAttribute('aria-current', i === passo ? 'step' : 'false'); });
  }
  private carteFesta: HTMLElement;
  private filtro = 'tutte';
  private timerAgg = 0;

  private salva() { scrivi(this.s); }
  private sincronizza() { this.sinc.forEach((f) => f()); }

  private disponibili(): MediaItem[] { return store.doc.media.filter((m) => (m.type === 'image' || m.type === 'video') && m.width > 0); }
  private brani(): MediaItem[] { return store.doc.media.filter((m) => m.type === 'audio'); }

  mostrata(si: boolean) {
    this.visibile = si;
    if (!si) this.motoreFerma();
    if (si) { this.rinfresca(); void caricaFontAnimazioni().then(() => { if (this.visibile) this.disegnaFeste(); }); }
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

  /** il video nel monitor in alto, con i suoi comandi: si guarda e poi si decide se usarlo */
  private guardaNelMonitor(m: MediaItem) {
    this.motoreFerma();
    motore.caricaPlayer(m.id);
    motore.setMonitor('player');
    motore.play(1);
  }

  private rinfresca() {
    // i file nuovi si scelgono da soli (quelli che l'utente ha già tolto a mano restano tolti)
    for (const m of this.disponibili()) if (!this.viste.has(m.id)) { this.viste.add(m.id); this.incluse.add(m.id); }
    for (const id of [...this.incluse]) if (!store.doc.media.some((m) => m.id === id)) this.incluse.delete(id);
    this.disegnaFile();
    this.disegnaFeste();
    this.disegnaTesti();
    this.disegnaMusica();
    this.sincronizza();
    this.aggiorna();
    this.aggiornaBarra();
  }

  private disegnaFile() {
    const lista = this.disponibili();
    this.carte.clear();
    this.griglia.replaceChildren(...lista.map((m) => {
      const cv = h('canvas', { width: 160, height: 90 }) as HTMLCanvasElement;
      const disegnaPoster = () => {
        const r = mediaRT(m.id);
        const src = r?.poster as (CanvasImageSource & { width: number; height: number }) | undefined;
        const x = cv.getContext('2d')!;
        x.fillStyle = '#15141a'; x.fillRect(0, 0, 160, 90);
        if (src && src.width) { const k = Math.min(160 / src.width, 90 / src.height); x.drawImage(src, (160 - src.width * k) / 2, (90 - src.height * k) / 2, src.width * k, src.height * k); }
      };
      disegnaPoster();
      const linea = h('i', { class: 'mt-linea' });
      const tempo = h('i', { class: 'mt-tempo' });
      // un video si guarda prima di sceglierlo: passando col mouse scorre; la lente lo apre nel monitor in alto
      const guarda = m.type === 'video' ? h('i', { class: 'mt-guarda', title: 'Guardalo nel monitor in alto (play)', on: { click: (e: MouseEvent) => { e.stopPropagation(); this.guardaNelMonitor(m); }, pointerdown: (e: PointerEvent) => e.stopPropagation() } }, '🔍') : null;
      const el = h('button', { class: 'mt-thumb' + (this.incluse.has(m.id) ? ' scelta' : ''), title: `${m.name}${m.type === 'video' ? ` · ${fmtDur(m.duration)}` : ''}\nClic: usa / non usare${m.type === 'video' ? ' · passaci sopra per vederlo scorrere · 🔍 lo guardi nel monitor' : ''}`, 'data-id': m.id,
        on: {
          click: () => { if (this.incluse.has(m.id)) this.incluse.delete(m.id); else this.incluse.add(m.id); el.classList.toggle('scelta', this.incluse.has(m.id)); this.aggiorna(); },
          dblclick: () => { if (m.type === 'video') this.guardaNelMonitor(m); },
        } },
      cv, linea, tempo, m.type === 'video' ? h('i', { class: 'mt-tipo' }, '▶') : null, guarda, h('i', { class: 'mt-spunta' }, '✓'));
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
    }));
    if (!lista.length) this.griglia.replaceChildren(h('div', { class: 'mt-vuoto' }, h('b', null, 'Ancora niente'), h('p', null, 'Trascina qui le foto e i video, oppure premi "Aggiungi".')));
  }

  private disegnaTesti() {
    const pr = presetMontage(this.s.preset)!;
    const campo = (k: keyof TestiMontage, nome: string) => {
      const i = h('input', { class: 'campo-testo', type: 'text', placeholder: pr.chiede[k] ?? '', value: this.s.testi[k] }) as HTMLInputElement;
      i.addEventListener('input', () => { this.s.testi[k] = i.value; this.salva(); });
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
  }

  private disegnaFeste() {
    const lista = PRESET_MONTAGE.filter((p) => this.filtro === 'tutte' || p.categoria === this.filtro);
    this.carteFesta.replaceChildren(...lista.map((p) => this.cartaFesta(p)));
  }

  private cartaFesta(p: PresetMontage): HTMLElement {
    const cv = h('canvas', { width: 192, height: 108 }) as HTMLCanvasElement;
    const x = cv.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 192, 108); g.addColorStop(0, p.sfondo[0]); g.addColorStop(1, p.sfondo[1]);
    x.fillStyle = g; x.fillRect(0, 0, 192, 108);
    try {
      const esempio: TestiMontage = { titolo: p.chiede.titolo ?? '', sottotitolo: '', nomi: p.chiede.nomi ?? '', data: p.chiede.data ?? '' };
      const an = p.apertura?.(esempio);
      if (an) x.drawImage(disegnaAnimazione(an, 768, 432, 2.4, 6) as CanvasImageSource, 0, 0, 192, 108);
    } catch { /* resta il fondo */ }
    const el = h('button', { class: 'mt-festa' + (this.s.preset === p.id ? ' scelta' : ''), title: `${p.nome}\n${p.info}\nMusica: ${p.musica}`, 'data-preset': p.id,
      on: { click: () => { this.s.preset = p.id; this.salva(); this.disegnaFeste(); this.disegnaTesti(); this.aggiorna(); } } },
    h('div', { class: 'mt-festa-img' }, cv, h('span', { class: 'mt-emoji' }, p.emoji)), h('b', null, p.nome), h('small', null, p.info));
    return el;
  }

  private entrate(): EntrataMontage[] {
    return this.disponibili().filter((m) => this.incluse.has(m.id)).map((m) => ({
      media: m.id, nome: m.name, tipo: m.type as 'image' | 'video', durata: m.type === 'video' ? m.duration : 0, ...misure(m),
      data: m.lastModified || 0, audio: m.hasAudio, punteggio: 0.5,
    }));
  }

  private opzioni(musica?: OpzMontage['musica'], seme = 12345): OpzMontage {
    return { preset: this.s.preset, durata: this.s.durata, ordine: this.s.ordine, titoli: this.s.titoli, effetti: this.s.effetti, audioVideo: this.s.audioVideo, testi: this.s.testi, seme, scarta: this.s.scarta, adatta: this.s.adatta, musica };
  }

  /** il riassunto sotto le scelte: quante foto, quanto sta ognuna (senza analisi: serve solo a dare un'idea) */
  private aggiorna() {
    clearTimeout(this.timerAgg);
    this.timerAgg = window.setTimeout(() => {
      const e = this.entrate();
      const nF = e.filter((x) => x.tipo === 'image').length, nV = e.length - nF;
      this.conta.textContent = e.length ? `${nF} foto · ${nV} video scelti` : 'Nessun file scelto';
      this.aggiornaBarra();
      if (!e.length) { this.riepilogo.textContent = 'Scegli almeno un file.'; return; }
      const mus = this.s.musica ? this.brani().find((m) => m.id === this.s.musica) : undefined;
      const pi = pianifica(e, this.opzioni(mus ? { media: mus.id, durata: mus.duration } : undefined));
      const pr = presetMontage(this.s.preset)!;
      this.riepilogo.replaceChildren(
        h('b', null, `${pr.emoji} ${pr.nome} · ${fmtDur(this.s.durata)}`),
        h('div', null, `${pi.voci.length} cose sulla linea · circa ${pi.perFoto.toFixed(1).replace('.', ',')} s ciascuna`),
        ...pi.note.map((n) => h('div', { class: 'fin-attento' }, '• ' + n)),
        h('div', { class: 'fin-info' }, `Musica consigliata: ${pr.musica}`));
    }, 120);
  }

  private async aggiungi() { await importaDialogo(); }

  private async aggiungiBrano() {
    const prima = new Set(this.brani().map((m) => m.id));
    await importaDialogo(undefined, 'audio');
    const nuovo = this.brani().find((m) => !prima.has(m.id));
    this.disegnaMusica();
    if (nuovo) { this.s.musica = nuovo.id; this.selMusica.value = nuovo.id; this.aggiorna(); }
  }

  /** i bottoni: prima "Crea", poi "Rigenera" e "Importa" finché c'è un'anteprima */
  private aggiornaBarra() {
    const c = !!this.anteprima;
    const n = this.entrate().length;
    this.bCrea.style.display = c ? 'none' : '';
    this.bRigenera.style.display = c ? '' : 'none';
    this.bImporta.style.display = c ? '' : 'none';
    this.bScarta.style.display = c ? '' : 'none';
    this.bCrea.disabled = this.occupato || !n;
    this.bRigenera.disabled = this.occupato || !n;
    this.bImporta.disabled = this.occupato;
    this.bScarta.disabled = this.occupato;
    const impostazioni = this.el.querySelector<HTMLFieldSetElement>('fieldset.mt-dentro');
    if (impostazioni) impostazioni.disabled = this.occupato;
    this.etichetta.textContent = this.occupato ? 'Analisi richieste · pausa e annulla in Attività' : this.anteprima ? `Anteprima · variante ${codiceSeme(this.anteprima.seme)} · Rigenera la sostituisce, Scarta torna indietro` : 'Scegli i file: Crea anteprima avvia le analisi, non esporta un video';
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
    this.aggiornaBarra();
    motore.vaiA(0);
    document.dispatchEvent(new CustomEvent('dpv:adatta'));
    avviso('Anteprima scartata', 'info', 1600);
  }

  /** tiene il montaggio: è già una timeline vera, si apre per ritoccarla */
  private importa() {
    if (!this.anteprima) return;
    this.motoreFerma();
    this.anteprima = null;
    this.aggiornaBarra();
    store.select([]);
    document.dispatchEvent(new CustomEvent('dpv:pagina', { detail: 'montaggio' }));
    motore.setMonitor('recorder');
    motore.vaiA(0);
    document.dispatchEvent(new CustomEvent('dpv:adatta'));
    avviso('Montaggio messo nella timeline: ritoccalo come vuoi', 'ok', 2600);
  }

  private motoreFerma() { try { motore.stop(); } catch { /* niente */ } }

  /** il montaggio vero: legge le date, misura le foto, trova i battiti, pianifica e lo mette in timeline come anteprima.
   *  Ogni volta il seme è nuovo (o quello dato, per le prove): stesse scelte, montaggio diverso. */
  async crea(seme?: number): Promise<void> {
    if (this.occupato) return this.ultimo as Promise<void>;
    this.motoreFerma();
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
          let battiti = this.ritmi.get(mus.id);
          if (!this.ritmi.has(mus.id)) {
            lav.imposta('Ascolto il ritmo del brano…', 0.65);
            const rit = await battitiDi(mus.id, (k) => lav.imposta('Ascolto il ritmo del brano…', 0.65 + k * 0.2)).catch(() => null);
            battiti = rit && rit.sicurezza > 0.15 ? rit.battiti : undefined;
            if (!job.valido) throw new Error('fermato');
            this.ritmi.set(mus.id, battiti);
            if (rit && battiti) avviso(`♪ Ritmo trovato: ${Math.round(rit.bpm)} battiti al minuto`, 'info', 2200);
          }
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
        lav.fine(`Fatto: ${piano.voci.length} cose in ${fmtDur(piano.durata)}`);
        store.select([]);
        motore.setMonitor('recorder');
        motore.vaiA(0);
        document.dispatchEvent(new CustomEvent('dpv:adatta'));
        if (this.partenza) motore.play(1);
        else motore.vaiA(Math.round(Math.min(1.5, piano.durata / 10) * (store.doc.rate.num / store.doc.rate.den)));
        this.riassuntoAnteprima(piano.voci.length, piano.durata, piano.note);
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

  private riassuntoAnteprima(n: number, durata: number, note: string[]) {
    const pr = presetMontage(this.s.preset)!;
    avviso(`${pr.emoji} ${pr.nome}: ${n} cose in ${fmtDur(durata)}${note.length ? ' · ' + note[0] : ''}. Ti piace? Importalo; se no, rigenera`, 'ok', 5000);
  }
}
