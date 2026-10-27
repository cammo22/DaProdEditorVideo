// Il monitor: uno solo, come sul banco di montaggio moderno. Mostra il montaggio (il PROGRAMMA); con doppio
// clic su un file del contenitore mostra la SORGENTE, con attacco, stacco e i tasti INS/SOVR, e Tab torna al
// montaggio. Doppio clic sull'immagine = schermo intero, con la timeline in piccolo e i VU sotto.
import { store } from '../core/store';
import { motore } from '../motore';
import { Compositore } from '../render/compositore';
import { fps, frameToTc, parseTc, s2f, f2s } from '../core/timecode';
import { end, projectEnd, isVideoClip } from '../core/progetto';
import { esegui, modi } from '../azioni';
import { Posiziona } from './posiziona';
import { avviso, h, icona } from './dom';
import { suTastierino } from './tastiera';
import { banco } from '../media/audio';

export class PannelloMonitor {
  el: HTMLElement;
  schermo: HTMLElement;
  canvas: HTMLCanvasElement;
  canvasSorgente: HTMLCanvasElement;
  sopra: HTMLCanvasElement;
  private pos: Posiziona | null = null;
  private titolo: HTMLElement;
  private tc: HTMLElement;
  private tcIn: HTMLElement;
  private tcOut: HTMLElement;
  private tcDur: HTMLElement;
  private nome: HTMLElement;
  private barra: HTMLCanvasElement;
  private inserimento: HTMLInputElement;
  private playBtn: HTMLElement;
  private shuttleLbl: HTMLElement;
  private mini: MiniTimeline;
  private primaDopo: HTMLElement;
  private vistaSfondo: HTMLElement;
  qualita = 1;

  constructor() {
    this.canvas = h('canvas', { class: 'schermo-tela programma' });
    this.canvasSorgente = h('canvas', { class: 'schermo-tela sorgente' });
    this.sopra = h('canvas', { class: 'schermo-sopra' });
    this.mini = new MiniTimeline();
    this.schermo = h('div', { class: 'schermo' }, this.canvas, this.canvasSorgente, this.sopra, this.mini.el);
    this.titolo = h('b', null, 'PROGRAMMA');
    this.nome = h('span', { class: 'mon-sorgente' }, 'Programma');
    this.tc = h('button', { class: 'tc grande', title: 'Clic per scrivere un timecode (o usa il tastierino numerico)' }, '00:00:00:00');
    this.tcIn = h('span', { class: 'tc piccolo' }, '--:--:--:--');
    this.tcOut = h('span', { class: 'tc piccolo' }, '--:--:--:--');
    this.tcDur = h('span', { class: 'tc piccolo' }, '--:--:--:--');
    this.inserimento = h('input', { class: 'tc-inserimento', inputmode: 'numeric', placeholder: 'hhmmssff o +25' }) as HTMLInputElement;
    this.barra = h('canvas', { class: 'mon-barra' });
    // il play risponde appena lo premi (come un tasto vero), non quando lo lasci
    this.playBtn = h('button', { class: 'tasto-trasporto play', title: 'Play / Stop (Spazio)', on: { pointerdown: (e: PointerEvent) => { if (e.button === 0) { e.preventDefault(); motore.toggle(); } } } }, icona('play', 20));
    this.shuttleLbl = h('span', { class: 'shuttle-vel' }, '');
    this.primaDopo = h('button', { class: 'btn-mini prima-dopo', title: 'Prima e dopo il colore finale, fianco a fianco', on: { click: () => this.alternaPrimaDopo() } }, 'PRIMA | DOPO');
    this.vistaSfondo = h('button', { class: 'btn-mini vista-sfondo', title: 'Guarda lo sfondo tolto: l\'immagine, la maschera in bianco e nero, il soggetto sugli scacchi', on: { click: () => this.alternaVistaSfondo() } }, 'SFONDO');
    // le Proprietà (Togli lo sfondo) scelgono la vista da lì
    document.addEventListener('dpv:vista-sfondo', (e) => this.alternaVistaSfondo(Number((e as CustomEvent).detail) || 0));
    const t = (ic: string, title: string, fn: () => void, cls = '') => h('button', { class: 'tasto-trasporto ' + cls, title, on: { click: fn } }, icona(ic, 17));
    const jog = new JogShuttle();
    this.el = h('section', { class: 'monitor' },
      h('header', { class: 'mon-testa' },
        h('span', { class: 'led' }), this.titolo, this.nome,
        h('button', { class: 'btn-mini torna', title: 'Torna a vedere il montaggio (Tab)', on: { click: () => motore.setMonitor('recorder') } }, '⟵ MONTAGGIO'),
        h('span', { class: 'mon-spazio' }),
        this.primaDopo,
        this.vistaSfondo,
        h('button', { class: 'btn-mini foto', title: 'Istantanea del fotogramma nel contenitore (P) · Shift+P fermo immagine', on: { click: () => esegui('istantanea') } }, icona('foto', 13), 'FOTO'),
        h('button', { class: 'btn-mini', title: 'Zone di sicurezza e croce (G)', on: { click: () => { modi.zoneSicure = !modi.zoneSicure; this.disegnaSopra(); } } }, 'ZONE'),
        h('select', {
          class: 'mini-select', title: 'Qualità dell\'anteprima',
          on: { change: (e: Event) => { this.qualita = Number((e.target as HTMLSelectElement).value); this.adatta(); } },
        }, h('option', { value: '1' }, 'Piena'), h('option', { value: '0.5' }, '½'), h('option', { value: '0.25' }, '¼')),
        h('button', { class: 'btn-icona', title: 'Schermo intero, con la timeline in piccolo (doppio clic sull\'immagine)', on: { click: () => this.pieno() } }, icona('pieno', 16))),
      this.schermo,
      this.barra,
      // una riga sola sotto l'immagine: timecode, trasporto, segni e jog (più spazio all'immagine)
      h('div', { class: 'mon-comandi' },
        h('div', { class: 'mon-tc' }, this.tc, this.inserimento),
        h('div', { class: 'mon-trasporto' },
          t('inizio', 'All\'inizio (Home)', () => esegui('inizio'), 'estremo'),
          t('indietro', 'Shuttle indietro (J)', () => motore.shuttle(-1), 'shuttle'),
          t('fotoPrec', 'Fotogramma prima (← o rotella)', () => motore.passo(-1)),
          this.playBtn,
          t('fotoSucc', 'Fotogramma dopo (→ o rotella)', () => motore.passo(1)),
          t('avanti', 'Shuttle avanti (L)', () => motore.shuttle(1), 'shuttle'),
          t('fine', 'Alla fine (End)', () => esegui('fine'), 'estremo'),
          h('span', { class: 'sep-v estremo' }),
          t('loop', 'Loop (Ctrl+L)', () => esegui('loop'), 'loop'),
          h('span', { class: 'sep-v solo-sorgente' }),
          t('segnaIn', 'Segna attacco (I) · Alt+X li toglie', () => esegui('segnaIn'), 'in solo-sorgente'),
          t('segnaOut', 'Segna stacco (O) · Alt+X li toglie', () => esegui('segnaOut'), 'out solo-sorgente'),
          h('button', { class: 'tasto-edit solo-sorgente', title: 'Inserisci nella timeline al cursore (, oppure [)', on: { click: () => esegui('inserisci') } }, h('small', null, ','), 'INS'),
          h('button', { class: 'tasto-edit rosso solo-sorgente', title: 'Sovrascrivi nella timeline al cursore (. oppure ])', on: { click: () => esegui('sovrascrivi') } }, h('small', null, '.'), 'SOVR'),
          this.shuttleLbl),
        h('div', { class: 'mon-segni', title: 'Attacco, stacco e durata · Alt+X toglie attacco e stacco' },
          h('span', { class: 'segno-io in' }, h('label', null, 'IN'), this.tcIn),
          h('span', { class: 'segno-io out' }, h('label', null, 'OUT'), this.tcOut),
          h('button', { class: 'segno-via', title: 'Togli attacco e stacco (Alt+X)', on: { click: () => esegui('togliInOut') } }, '✕'),
          h('span', { class: 'segno-io' }, h('label', null, 'DUR'), this.tcDur)),
        jog.el));

    this.el.addEventListener('pointerdown', () => suTastierino((c) => this.apriInserimento(c)));
    this.tc.addEventListener('click', () => this.apriInserimento(''));
    this.inserimento.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.vaiTc(this.inserimento.value); this.chiudiInserimento(); }
      if (e.key === 'Escape') this.chiudiInserimento();
      e.stopPropagation();
    });
    this.inserimento.addEventListener('blur', () => this.chiudiInserimento());
    this.barra.addEventListener('pointerdown', (e) => {
      const muovi = (ev: PointerEvent) => {
        const r = this.barra.getBoundingClientRect();
        const k = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        if (motore.attivo === 'recorder') motore.vaiA(Math.round(k * Math.max(1, projectEnd(store.doc))));
        else { const m = this.media(); if (m) motore.playerVaiA((m.t0 || 0) + k * (m.duration - (m.t0 || 0))); }
      };
      motore.stop();
      muovi(e);
      this.barra.setPointerCapture(e.pointerId);
      const up = () => { this.barra.removeEventListener('pointermove', muovi); this.barra.removeEventListener('pointerup', up); };
      this.barra.addEventListener('pointermove', muovi);
      this.barra.addEventListener('pointerup', up);
    });
    this.schermo.addEventListener('dblclick', (e) => { if ((e.target as HTMLElement).closest('.mini-tl')) return; this.pieno(); });
    // la rotella sull'immagine va avanti e indietro di un fotogramma, col suono
    let resto = 0;
    this.schermo.addEventListener('wheel', (e) => {
      if ((e.target as HTMLElement).closest('.mini-tl')) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      let n = 0;
      if (Math.abs(dy) >= 50) n = Math.sign(dy); else { resto += dy; n = Math.trunc(resto / 24); resto -= n * 24; }
      if (n) motore.passo(n);
    }, { passive: false });
    document.addEventListener('fullscreenchange', () => {
      const dentro = document.fullscreenElement === this.schermo;
      this.schermo.classList.toggle('pieno', dentro);
      this.mini.attiva(dentro);
      setTimeout(() => this.adatta(), 60);
    });
    new ResizeObserver(() => this.adatta()).observe(this.schermo);
    // sposta, ingrandisci e fai muovere quello che vedi, direttamente sull'immagine
    this.pos = new Posiziona(this.schermo, this.sopra, () => this.disegnaSopra());
    motore.rec = new Compositore(this.canvas);
    motore.playerCanvas = this.canvasSorgente;
    store.on('status', () => this.aggiorna());
    store.on('head', () => { this.aggiorna(); this.disegnaSopra(); });
    store.on('doc', () => { this.aggiorna(); this.adatta(); });
    this.aggiorna();
  }

  private media() { return store.doc.media.find((x) => x.id === motore.playerMedia); }

  /** schermo intero dell'immagine, con la timeline in piccolo e i VU */
  pieno() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.schermo.requestFullscreen?.().catch(() => avviso('Lo schermo intero qui non è permesso', 'info'));
  }

  private alternaPrimaDopo() {
    if (!motore.rec) return;
    motore.rec.prima = motore.rec.prima > 0 ? 0 : 0.5;
    this.primaDopo.classList.toggle('acceso', motore.rec.prima > 0);
    motore.ridisegna();
    avviso(motore.rec.prima > 0 ? 'A sinistra com\'era, a destra con il colore finale' : 'Tutto con il colore finale', 'info', 1600);
  }

  /** 0 = l'immagine · 1 = la maschera (bianco = resta) · 2 = il soggetto sugli scacchi · 3 = il contorno (senza `a`: passa alla prossima) */
  private alternaVistaSfondo(a?: number) {
    if (!motore.rec) return;
    motore.rec.vistaChiave = a ?? (motore.rec.vistaChiave + 1) % 4;
    this.vistaSfondo.classList.toggle('acceso', motore.rec.vistaChiave > 0);
    this.vistaSfondo.textContent = ['SFONDO', 'MASCHERA', 'SCACCHI', 'CONTORNO'][motore.rec.vistaChiave];
    motore.ridisegna();
  }

  private apriInserimento(prima: string) {
    this.el.classList.add('inserisce');
    this.inserimento.value = prima;
    this.inserimento.focus();
  }

  private chiudiInserimento() { this.el.classList.remove('inserisce'); }

  private vaiTc(testo: string) {
    const p = store.doc;
    if (motore.attivo === 'recorder') {
      const f = parseTc(testo, p.rate, p.drop, Math.round(store.head));
      if (f === null) { avviso('Timecode non valido', 'errore'); return; }
      motore.vaiA(f);
    } else {
      const m = this.media();
      if (!m) return;
      const r = { num: Math.round((m.fps || fps(p.rate)) * 1000), den: 1000 };
      const cur = s2f(motore.playerT, r);
      const f = parseTc(testo, r, false, cur);
      if (f === null) { avviso('Timecode non valido', 'errore'); return; }
      motore.playerVaiA(f2s(f, r));
    }
  }

  adatta() {
    const r = this.schermo.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const p = store.doc;
    const asp = p.w / p.h;
    let w = r.width, hh = r.width / asp;
    if (hh > r.height) { hh = r.height; w = hh * asp; }
    const dpr = Math.min(2, devicePixelRatio || 1);
    const pw = Math.max(16, Math.round(Math.min(p.w, w * dpr) * this.qualita));
    const ph = Math.max(9, Math.round(pw / asp));
    for (const c of [this.canvas, this.canvasSorgente, this.sopra]) {
      c.style.width = w + 'px';
      c.style.height = hh + 'px';
    }
    for (const c of [this.canvas, this.canvasSorgente]) {
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    }
    this.sopra.width = Math.round(w * dpr);
    this.sopra.height = Math.round(hh * dpr);
    const bw = this.barra.getBoundingClientRect().width;
    this.barra.width = Math.round(bw * dpr);
    this.barra.height = Math.round(14 * dpr);
    this.mini.adatta();
    motore.ridisegna();
    this.disegnaSopra();
    this.aggiorna();
  }

  aggiorna() {
    const p = store.doc;
    const sorgente = motore.attivo === 'player';
    this.el.classList.toggle('sorgente', sorgente);
    this.titolo.textContent = sorgente ? 'SORGENTE' : 'PROGRAMMA';
    const suona = motore.playing;
    // l'icona si cambia solo quando cambia lo stato (non a ogni fotogramma: sotto il mouse deve restare ferma)
    if (this.playBtn.classList.contains('acceso') !== suona || !this.playBtn.firstChild) {
      this.playBtn.replaceChildren(icona(suona ? 'stop' : 'play', 20));
      this.playBtn.classList.toggle('acceso', suona);
    }
    this.shuttleLbl.textContent = motore.speed !== 0 && motore.speed !== 1 ? `${motore.speed > 0 ? '▶' : '◀'} ×${Math.abs(motore.speed)}` : '';
    this.el.querySelector('.loop')?.classList.toggle('acceso', motore.loop);
    if (!sorgente) {
      this.tc.textContent = frameToTc(Math.floor(store.head + 1e-6), p.rate, p.drop);
      this.tcIn.textContent = p.inF !== null ? frameToTc(p.inF, p.rate, p.drop) : '--:--:--:--';
      this.tcOut.textContent = p.outF !== null ? frameToTc(p.outF, p.rate, p.drop) : '--:--:--:--';
      this.el.classList.toggle('con-in', p.inF !== null);
      this.el.classList.toggle('con-out', p.outF !== null);
      const d = p.inF !== null && p.outF !== null ? p.outF - p.inF : projectEnd(p);
      this.tcDur.textContent = frameToTc(d, p.rate, p.drop);
      this.nome.textContent = p.name;
    } else {
      const m = this.media();
      this.nome.textContent = m ? m.name : '';
      const r = { num: Math.round((m?.fps || fps(p.rate)) * 1000), den: 1000 };
      const tcS = (s: number) => frameToTc(s2f(s, r), r);
      this.tc.textContent = m ? tcS(motore.playerT) : '--:--:--:--';
      this.tcIn.textContent = m?.markIn != null ? tcS(m.markIn) : '--:--:--:--';
      this.tcOut.textContent = m?.markOut != null ? tcS(m.markOut) : '--:--:--:--';
      this.el.classList.toggle('con-in', m?.markIn != null);
      this.el.classList.toggle('con-out', m?.markOut != null);
      this.tcDur.textContent = m ? tcS((m.markOut ?? m.duration) - (m.markIn ?? m.t0 ?? 0)) : '--:--:--:--';
    }
    this.disegnaBarra();
  }

  private disegnaBarra() {
    const c = this.barra, ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    if (!W) return;
    ctx.fillStyle = '#0a090e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#23212b';
    ctx.fillRect(0, H * 0.35, W, H * 0.3);
    let pos = 0, a: number | null = null, b: number | null = null;
    if (motore.attivo === 'recorder') {
      const e = Math.max(1, projectEnd(store.doc));
      pos = store.head / e;
      if (store.doc.inF !== null) a = store.doc.inF / e;
      if (store.doc.outF !== null) b = store.doc.outF / e;
    } else {
      const m = this.media();
      if (m && m.duration) {
        const t0 = m.t0 || 0, d = m.duration - t0;
        pos = (motore.playerT - t0) / d;
        if (m.markIn != null) a = (m.markIn - t0) / d;
        if (m.markOut != null) b = (m.markOut - t0) / d;
      }
    }
    if (a !== null || b !== null) {
      ctx.fillStyle = 'rgba(53,232,255,.55)';
      const x0 = (a ?? 0) * W, x1 = (b ?? 1) * W;
      ctx.fillRect(x0, H * 0.3, x1 - x0, H * 0.4);
    }
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(Math.round(pos * W) - 1, 0, 3, H);
  }

  disegnaSopra() {
    const c = this.sopra, ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    this.pos?.disegna(ctx, c.width, c.height);
    if (motore.attivo !== 'recorder' || !modi.zoneSicure) return;
    const W = c.width, H = c.height;
    ctx.lineWidth = Math.max(1, W / 900);
    const box = (k: number, col: string) => { ctx.strokeStyle = col; ctx.strokeRect(W * (1 - k) / 2, H * (1 - k) / 2, W * k, H * k); };
    box(0.93, 'rgba(255,213,74,.7)'); // azione
    box(0.9, 'rgba(53,232,255,.7)'); // titoli
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 12, H / 2); ctx.lineTo(W / 2 + 12, H / 2);
    ctx.moveTo(W / 2, H / 2 - 12); ctx.lineTo(W / 2, H / 2 + 12);
    ctx.stroke();
    // il 4:3 dentro il 16:9, per chi manda ancora in onda sui vecchi televisori
    if (W / H > 1.5) {
      const w43 = H * 4 / 3;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255,61,242,.55)';
      ctx.strokeRect((W - w43) / 2, 0, w43, H);
      ctx.setLineDash([]);
    }
  }
}

/**
 * La timeline in piccolo per lo schermo intero: tutte le tracce schiacciate, il cursore, i VU a barre e il
 * timecode. Clic o trascina per andare in un punto; la rotella va di fotogramma in fotogramma.
 */
class MiniTimeline {
  el: HTMLElement;
  private cv: HTMLCanvasElement;
  private vu: HTMLCanvasElement;
  private tc: HTMLElement;
  private play: HTMLElement;
  private acceso = false;
  private picchi = [0, 0];
  private tieni = [0, 0];

  constructor() {
    this.cv = h('canvas', { class: 'mini-tela' });
    this.vu = h('canvas', { class: 'mini-vu', width: 36, height: 120 });
    this.tc = h('span', { class: 'tc mini-tc' }, '00:00:00:00');
    this.play = h('button', { class: 'tasto-trasporto play', title: 'Play / Stop (Spazio)', on: { pointerdown: (e: PointerEvent) => { if (e.button === 0) { e.preventDefault(); motore.toggle(); } } } }, icona('play', 18));
    this.el = h('div', { class: 'mini-tl' },
      h('div', { class: 'mini-sx' }, this.play, this.tc),
      this.cv, this.vu);
    const vai = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      motore.setMonitor('recorder');
      motore.vaiA(Math.round(k * this.fine()));
    };
    this.cv.addEventListener('pointerdown', (e) => {
      vai(e);
      this.cv.setPointerCapture(e.pointerId);
      const mv = (ev: PointerEvent) => vai(ev);
      const up = () => { this.cv.removeEventListener('pointermove', mv); this.cv.removeEventListener('pointerup', up); };
      this.cv.addEventListener('pointermove', mv);
      this.cv.addEventListener('pointerup', up);
    });
    this.el.addEventListener('wheel', (e) => { e.preventDefault(); motore.passo(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    this.el.addEventListener('dblclick', (e) => e.stopPropagation());
    motore.ogniGiro(() => { if (this.acceso) this.disegna(); });
  }

  private fine() { return Math.max(1, projectEnd(store.doc) + 1); }

  attiva(on: boolean) { this.acceso = on; if (on) { this.adatta(); this.disegna(); } }

  adatta() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = this.cv.getBoundingClientRect();
    if (r.width < 4) return;
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    const v = this.vu.getBoundingClientRect();
    this.vu.width = Math.round(v.width * dpr);
    this.vu.height = Math.round(v.height * dpr);
  }

  private disegna() {
    const p = store.doc;
    const c = this.cv, ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,7,12,.55)';
    ctx.fillRect(0, 0, W, H);
    const e = this.fine();
    // solo le tracce che hanno qualcosa: in piccolo contano le clip, non le righe vuote
    const piene = p.tracks.filter((t) => p.clips.some((c) => c.track === t.id));
    const n = piene.length;
    const lane = H / Math.max(1, n);
    piene.forEach((t, i) => {
      const y = i * lane;
      ctx.fillStyle = t.kind === 'video' ? 'rgba(255,255,255,.04)' : 'rgba(93,255,180,.03)';
      ctx.fillRect(0, y + 1, W, lane - 2);
      // prima le clip, poi gli FX: una striscia sottile in basso, come nella timeline
      const qui = p.clips.filter((cl) => cl.track === t.id).sort((a2, b2) => Number(a2.kind === 'fx') - Number(b2.kind === 'fx'));
      for (const cl of qui) {
        const x0 = (cl.start / e) * W, x1 = (end(cl) / e) * W;
        const fx = cl.kind === 'fx';
        ctx.fillStyle = fx ? (cl.fxb?.tipo === 'transizione' ? '#22c4d4' : '#d44bd9') : isVideoClip(cl) ? (cl.kind === 'title' ? '#8448d6' : '#3565c7') : '#2a8a5e';
        const hh = fx ? Math.max(2, (lane - 4) * 0.4) : lane - 4;
        ctx.fillRect(x0 + 0.5, y + 2 + (lane - 4 - hh), Math.max(1, x1 - x0 - 1), hh);
      }
    });
    if (p.inF !== null || p.outF !== null) {
      const a = ((p.inF ?? 0) / e) * W, b = ((p.outF ?? e) / e) * W;
      ctx.fillStyle = 'rgba(53,232,255,.18)';
      ctx.fillRect(a, 0, b - a, H);
    }
    const x = (store.head / e) * W;
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x - 1, 0, 2.5, H);
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 8); ctx.closePath(); ctx.fill();
    this.tc.textContent = frameToTc(Math.floor(store.head + 1e-6), p.rate, p.drop);
    if (this.play.classList.contains('acceso') !== motore.playing || !this.play.firstChild) {
      this.play.replaceChildren(icona(motore.playing ? 'stop' : 'play', 18));
      this.play.classList.toggle('acceso', motore.playing);
    }
    // VU a barre (L e R) con la tacca del picco
    const v = this.vu, vx = v.getContext('2d')!;
    const vw = v.width, vh = v.height;
    vx.clearRect(0, 0, vw, vh);
    const m = banco.misure();
    const pk = [m.lPeak, m.rPeak];
    const bw = (vw - 6) / 2;
    for (let i = 0; i < 2; i++) {
      const db = 20 * Math.log10(Math.max(1e-5, pk[i]));
      const k = Math.max(0, Math.min(1, (db + 48) / 48));
      this.picchi[i] = k > this.picchi[i] ? k : Math.max(k, this.picchi[i] - 0.015);
      if (k >= this.tieni[i]) this.tieni[i] = k; else this.tieni[i] = Math.max(0, this.tieni[i] - 0.004);
      const bx = 2 + i * (bw + 2);
      vx.fillStyle = 'rgba(0,0,0,.6)';
      vx.fillRect(bx, 0, bw, vh);
      const hLiv = this.picchi[i] * vh;
      const g = vx.createLinearGradient(0, vh, 0, 0);
      g.addColorStop(0, '#5dffb4'); g.addColorStop(0.72, '#ffd54a'); g.addColorStop(0.9, '#ff4d6d');
      vx.fillStyle = g;
      vx.fillRect(bx, vh - hLiv, bw, hLiv);
      vx.fillStyle = '#fff';
      vx.fillRect(bx, vh - this.tieni[i] * vh - 1, bw, 2);
    }
  }
}

/** la manopola doppia della centralina: anello esterno = shuttle (torna al centro), rotella interna = jog */
class JogShuttle {
  el: HTMLCanvasElement;
  private ang = 0;
  private shuttle = 0;
  constructor() {
    this.el = h('canvas', { class: 'jog', width: 84, height: 84, title: 'Jog (centro, gira) · Shuttle (anello, tira e lascia)' });
    this.disegna();
    this.el.addEventListener('pointerdown', (e) => {
      const r = this.el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy) / (r.width / 2);
      const esterno = dist > 0.66;
      let a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
      let resto = 0;
      this.el.setPointerCapture(e.pointerId);
      motore.stop();
      const mv = (ev: PointerEvent) => {
        const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        let d = a - a0;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        if (esterno) {
          this.shuttle = Math.max(-1, Math.min(1, this.shuttle + d / 2));
          const s = Math.sign(this.shuttle) * Math.pow(2, Math.round(Math.abs(this.shuttle) * 5)) / 2;
          motore.shuttleContinuo(Math.abs(this.shuttle) < 0.08 ? 0 : s);
        } else {
          // un giro della rotella = 24 fotogrammi
          resto += (d / (Math.PI * 2)) * 24;
          const n = Math.trunc(resto);
          if (n) { motore.passo(n); resto -= n; }
          this.ang += d;
        }
        a0 = a;
        this.disegna();
      };
      const up = () => {
        this.el.removeEventListener('pointermove', mv);
        this.el.removeEventListener('pointerup', up);
        if (esterno) {
          // l'anello dello shuttle torna al centro con la molla
          const torna = () => { this.shuttle *= 0.6; this.disegna(); if (Math.abs(this.shuttle) > 0.01) requestAnimationFrame(torna); else { this.shuttle = 0; this.disegna(); } };
          torna();
          motore.stop();
        }
      };
      this.el.addEventListener('pointermove', mv);
      this.el.addEventListener('pointerup', up);
    });
    this.el.addEventListener('wheel', (e) => { e.preventDefault(); motore.passo(e.deltaY > 0 ? 1 : -1); this.ang += e.deltaY > 0 ? 0.26 : -0.26; this.disegna(); }, { passive: false });
  }

  private disegna() {
    const c = this.el, ctx = c.getContext('2d')!;
    const W = c.width, R = W / 2;
    ctx.clearRect(0, 0, W, W);
    // anello shuttle
    const g = ctx.createRadialGradient(R, R * 0.7, R * 0.2, R, R, R);
    g.addColorStop(0, '#3a3844'); g.addColorStop(1, '#16151b');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = -5; i <= 5; i++) {
      const a = -Math.PI / 2 + i * 0.28;
      ctx.strokeStyle = i === 0 ? '#ffd54a' : '#5b5866';
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      ctx.beginPath(); ctx.moveTo(R + Math.cos(a) * (R - 5), R + Math.sin(a) * (R - 5)); ctx.lineTo(R + Math.cos(a) * (R - 12), R + Math.sin(a) * (R - 12)); ctx.stroke();
    }
    const sa = -Math.PI / 2 + this.shuttle * 1.4;
    ctx.fillStyle = Math.abs(this.shuttle) > 0.05 ? '#ff3df2' : '#8e8a99';
    ctx.beginPath(); ctx.arc(R + Math.cos(sa) * (R - 9), R + Math.sin(sa) * (R - 9), 4.5, 0, Math.PI * 2); ctx.fill();
    // rotella jog
    const r2 = R * 0.62;
    const g2 = ctx.createRadialGradient(R - r2 * 0.3, R - r2 * 0.4, 2, R, R, r2);
    g2.addColorStop(0, '#6c6878'); g2.addColorStop(0.5, '#34313d'); g2.addColorStop(1, '#1b1a21');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(R, R, r2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b0a0e'; ctx.lineWidth = 1.5; ctx.stroke();
    for (let i = 0; i < 24; i++) {
      const a = this.ang + (i / 24) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(R + Math.cos(a) * r2 * 0.82, R + Math.sin(a) * r2 * 0.82); ctx.lineTo(R + Math.cos(a) * r2 * 0.97, R + Math.sin(a) * r2 * 0.97); ctx.stroke();
    }
    // fossetta per il dito
    const fa = this.ang - Math.PI / 2;
    ctx.fillStyle = '#121116';
    ctx.beginPath(); ctx.arc(R + Math.cos(fa) * r2 * 0.55, R + Math.sin(fa) * r2 * 0.55, r2 * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
