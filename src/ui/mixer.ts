// Gli strumenti del banco: i livelli di uscita a barra, il mixer delle tracce audio
// e dei livelli video (trasparenza al volo).
import { store } from '../core/store';
import { motore } from '../motore';
import { banco } from '../media/audio';
import { segnaTracciaVoce } from './duckingClip';
import { h, clamp } from './dom';

/** i due livelli dell'uscita (sinistro e destro) a barra: solo le barre a LED, con l'indicatore di picco che resta un attimo */
export class VuMetri {
  el: HTMLCanvasElement;
  private barra = [0, 0];
  private tenuto = [0, 0];
  private tPicco = [0, 0];
  private ultimo = performance.now();
  private dpr = 1;
  private disegnato = false;

  constructor() {
    this.el = h('canvas', { class: 'vu', title: 'Livello di uscita, sinistro e destro (picco)' });
    new ResizeObserver(() => this.adatta()).observe(this.el);
    motore.ogniGiro(() => this.giro());
  }

  private adatta() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    const r = this.el.getBoundingClientRect();
    this.el.width = Math.round(r.width * this.dpr);
    this.el.height = Math.round(r.height * this.dpr);
    this.disegnato = false;
  }

  private giro() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.ultimo) / 1000);
    this.ultimo = now;
    const m = banco.misure();
    const pk = [m.lPeak, m.rPeak];
    let fermo = true;
    for (let i = 0; i < 2; i++) {
      const b = clamp((20 * Math.log10(Math.max(1e-6, pk[i])) + 60) / 60, 0, 1);
      // sale subito, scende piano
      this.barra[i] = b > this.barra[i] ? b : Math.max(b, this.barra[i] - dt * 0.9);
      if (b >= this.tenuto[i]) { this.tenuto[i] = b; this.tPicco[i] = now; }
      else if (now - this.tPicco[i] > 900) this.tenuto[i] = Math.max(b, this.tenuto[i] - dt * 0.6);
      if (this.barra[i] > 0.005 || this.tenuto[i] > 0.005) fermo = false;
    }
    if (fermo && !motore.playing && this.disegnato) return;
    this.disegna();
  }

  private disegna() {
    this.disegnato = true;
    const c = this.el, ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    if (!W || !H) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const d = this.dpr, lab = 12 * d, gap = 3 * d;
    const bh = (H - gap) / 2;
    const N = 40;
    ctx.font = `700 ${Math.max(7, 8.5 * d)}px Rajdhani, sans-serif`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) {
      const y = i * (bh + gap);
      ctx.fillStyle = '#8a8698';
      ctx.textAlign = 'left';
      ctx.fillText(i === 0 ? 'S' : 'D', 1 * d, y + bh / 2);
      const x0 = lab, w = W - lab;
      ctx.fillStyle = '#0c0b10';
      ctx.fillRect(x0, y, w, bh);
      const sw = (w - 2 * d) / N;
      for (let s = 0; s < N; s++) {
        const k = s / N, db = -60 + k * 60;
        const on = k < this.barra[i];
        const tenuto = Math.abs(k - this.tenuto[i]) < 1 / N + 0.001 && this.tenuto[i] > 0.02;
        ctx.fillStyle = db > -6 ? (on || tenuto ? '#ff3a4a' : '#3a1418') : db > -18 ? (on || tenuto ? '#ffd54a' : '#3a3214') : (on || tenuto ? '#5dffb4' : '#143a28');
        ctx.fillRect(x0 + d + s * sw, y + d, sw - d, bh - 2 * d);
      }
    }
  }
}

/** il mixer: una striscia per ogni traccia audio (fader, pan, muto, solo, livello) e i livelli video */
export class Mixer {
  el: HTMLElement;
  private misure = new Map<string, HTMLElement>();
  constructor() {
    this.el = h('div', { class: 'mixer' });
    store.on('doc', () => { if (!this.trascinando) this.costruisci(); });
    motore.ogniGiro(() => this.livelli());
    this.costruisci();
  }
  private trascinando = false;

  private firma = '';
  private costruisci() {
    const p = store.doc;
    const firma = p.tracks.map((t) => [t.id, t.name, t.mute, t.solo, t.opacity, t.volume, t.pan, t.ruoloAudio].join(',')).join(';');
    if (firma === this.firma) return;
    this.firma = firma;
    this.misure.clear();
    const strisce: HTMLElement[] = [];
    for (const t of p.tracks) {
      // la corsia FX non ha livelli da mixare
      if (t.kind === 'fx') continue;
      const video = t.kind === 'video';
      const fader = h('input', {
        type: 'range', class: 'fader-v', min: video ? 0 : -60, max: video ? 100 : 12, step: video ? 1 : 0.5,
        value: String(video ? Math.round(t.opacity * 100) : t.volume), orient: 'vertical',
      }) as HTMLInputElement;
      const val = h('span', { class: 'striscia-val' }, video ? `${Math.round(t.opacity * 100)}%` : `${t.volume > 0 ? '+' : ''}${t.volume} dB`);
      fader.addEventListener('pointerdown', () => { this.trascinando = true; store.begin(video ? 'Livello video' : 'Volume traccia'); });
      fader.addEventListener('input', () => {
        const tr = store.doc.tracks.find((x) => x.id === t.id)!;
        const v = Number(fader.value);
        if (video) tr.opacity = v / 100; else tr.volume = v;
        val.textContent = video ? `${v}%` : `${v > 0 ? '+' : ''}${v} dB`;
        if (!this.trascinando) { this.trascinando = true; store.begin('Livello'); }
        store.liveChange();
      });
      fader.addEventListener('change', () => { this.trascinando = false; store.commit(true); });
      fader.addEventListener('dblclick', () => store.edit('Livello a zero', (pp) => { const tr = pp.tracks.find((x) => x.id === t.id)!; if (video) tr.opacity = 1; else tr.volume = 0; }));
      const mis = h('div', { class: 'striscia-misura' }, h('i'));
      if (!video) this.misure.set(t.id, mis);
      const pan = video ? null : h('input', { type: 'range', class: 'pan', min: -100, max: 100, step: 1, value: String(Math.round(t.pan * 100)), title: 'Panorama (doppio clic = centro)' }) as HTMLInputElement;
      if (pan) {
        // anche con le frecce della tastiera (senza pointerdown) il panorama si può annullare
        pan.addEventListener('input', () => { if (!this.trascinando) { this.trascinando = true; store.begin('Panorama'); } const tr = store.doc.tracks.find((x) => x.id === t.id)!; tr.pan = Number(pan.value) / 100; store.liveChange(); });
        pan.addEventListener('pointerdown', () => { this.trascinando = true; store.begin('Panorama'); });
        pan.addEventListener('change', () => { this.trascinando = false; store.commit(true); });
        pan.addEventListener('dblclick', () => store.edit('Panorama al centro', (pp) => { pp.tracks.find((x) => x.id === t.id)!.pan = 0; }));
      }
      const bt = (lbl: string, on: boolean, cls: string, fn: () => void, title: string) => h('button', { class: 'tt-btn ' + (on ? cls : ''), title, on: { click: fn } }, lbl);
      strisce.push(h('div', { class: 'striscia ' + t.kind },
        h('b', { class: 'striscia-nome' }, t.name),
        pan ?? h('span', { class: 'striscia-tipo' }, 'LIVELLO'),
        h('div', { class: 'striscia-fader' }, video ? null : mis, fader),
        val,
        h('div', { class: 'striscia-btn' },
          bt(video ? 'OFF' : 'M', t.mute, 'on-rosso', () => store.edit('Muto', (pp) => { const tr = pp.tracks.find((x) => x.id === t.id)!; tr.mute = !tr.mute; }), video ? 'Spegni la traccia' : 'Muto'),
          video ? null : bt('S', t.solo, 'on-oro', () => store.edit('Solo', (pp) => { const tr = pp.tracks.find((x) => x.id === t.id)!; tr.solo = !tr.solo; }), 'Solo'),
          video ? null : bt('V', t.ruoloAudio === 'voce', 'on-oro', () => segnaTracciaVoce(t.id, t.ruoloAudio !== 'voce'), 'Questa traccia è la voce: la musica con «Abbassa sotto la voce» si abbassa quando parla'))));
    }
    // master
    const mf = h('input', { type: 'range', class: 'fader-v', min: 0, max: 150, step: 1, value: String(Math.round(banco.volumeMaster * 100)), orient: 'vertical' }) as HTMLInputElement;
    const mv = h('span', { class: 'striscia-val' }, Math.round(banco.volumeMaster * 100) + '%');
    mf.addEventListener('input', () => { banco.volumeMaster = Number(mf.value) / 100; mv.textContent = mf.value + '%'; banco.aggiornaTracce(store.doc); });
    strisce.push(h('div', { class: 'striscia master' }, h('b', { class: 'striscia-nome' }, 'CUFFIA'), h('span', { class: 'striscia-tipo' }, 'ASCOLTO'), h('div', { class: 'striscia-fader' }, mf), mv, h('div', { class: 'striscia-btn' })));
    this.el.replaceChildren(h('p', { class: 'nota' }, 'Doppio clic su un fader = torna a zero. I livelli video sono la trasparenza di tutta la traccia.'), h('div', { class: 'strisce' }, strisce));
  }

  private livelli() {
    if (!this.el.isConnected || !motore.playing) {
      for (const m of this.misure.values()) (m.firstChild as HTMLElement).style.height = '0%';
      return;
    }
    for (const [id, m] of this.misure) {
      const pk = banco.livelloTraccia(id);
      const db = 20 * Math.log10(Math.max(1e-6, pk));
      (m.firstChild as HTMLElement).style.height = clamp(((db + 60) / 60) * 100, 0, 100) + '%';
      m.classList.toggle('rosso', db > -3);
    }
  }
}
