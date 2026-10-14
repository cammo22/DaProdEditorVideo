// Il quadro in miniatura delle Proprietà: l'immagine del monitor in piccolo, con sopra il riquadro della clip scelta.
// Si fa tutto con il mouse, senza cursori: trascini dentro il riquadro per spostare, tiri un angolo (o giri la rotella)
// per ingrandire, il pallino in alto la gira, doppio clic la rimette a tutto quadro. Il centro e i bordi del quadro
// attirano il riquadro (Alt = libero). Sotto, le posizioni pronte con il loro disegnino.
import { store } from '../core/store';
import type { Clip, Transform } from '../core/tipi';
import { end, mediaOf, TF0 } from '../core/progetto';
import { bolla, presentazione } from '../core/cornici';
import { motore } from '../motore';
import { riquadroClip, type Riquadro } from './posiziona';
import { h } from './dom';

const LARGO = 256;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

type Presa =
  | { tipo: 'sposta'; x0: number; y0: number; base: Map<string, Transform> }
  | { tipo: 'scala'; d0: number; base: Map<string, Transform> }
  | { tipo: 'gira'; a0: number; base: Map<string, Transform> };

/** il riquadro è quello della prima clip video scelta, a quel fotogramma (la clip si guarda dentro il suo tempo) */
function bersaglio(clips: Clip[]): { c: Clip; f: number } | null {
  const c = clips[0];
  if (!c) return null;
  const f = clamp(Math.floor(store.head + 1e-6), c.start, Math.max(c.start, end(c) - 1));
  return { c, f };
}

export interface MiniQuadro { el: HTMLElement; aggiorna: () => void }

/**
 * @param clips le clip video scelte (la prima fa da guida, le altre seguono gli stessi spostamenti)
 */
export function miniQuadro(clips: () => Clip[]): MiniQuadro {
  const p0 = store.doc;
  const H = Math.max(40, Math.round((LARGO * p0.h) / p0.w));
  const tela = h('canvas', { class: 'mq-tela', width: LARGO * 2, height: H * 2, title: 'Trascina per spostare · rotella o angoli per ingrandire · pallino per girare · doppio clic: a tutto quadro' }) as HTMLCanvasElement;
  tela.style.aspectRatio = `${p0.w} / ${p0.h}`;
  const nota = h('div', { class: 'mq-nota' });
  const el = h('div', { class: 'mq' }, tela, nota);
  const ctx = tela.getContext('2d')!;
  // l'immagine del monitor in piccolo (letta dalla scheda video ogni tanto, non a ogni fotogramma)
  const px = new Uint8Array(LARGO * H * 4);
  const imm = new ImageData(new Uint8ClampedArray(LARGO * H * 4), LARGO, H);
  let ultima = 0, vecchia = true;
  let presa: Presa | null = null;
  let guide: { x: boolean; y: boolean } = { x: false, y: false };
  const k = () => tela.width / store.doc.w;

  const leggi = () => {
    try { if (!motore.rec) return false; motore.rec.leggiPiccolo(LARGO, H, px); } catch { return false; }
    // la lettura parte dal basso: si rigira
    for (let y = 0; y < H; y++) imm.data.set(px.subarray((H - 1 - y) * LARGO * 4, (H - y) * LARGO * 4), y * LARGO * 4);
    return true;
  };

  const maniglie = (q: Riquadro) => {
    const hw = q.w / 2, hh = q.h / 2, co = Math.cos(q.rot), si = Math.sin(q.rot);
    const m = (x: number, y: number) => ({ x: q.cx + co * x - si * y, y: q.cy + si * x + co * y });
    return { angoli: [m(-hw, -hh), m(hw, -hh), m(hw, hh), m(-hw, hh)], gira: m(0, -hh - 26 / k()), centro: m(0, 0) };
  };

  const disegna = () => {
    const b = bersaglio(clips());
    const W = tela.width, Hh = tela.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0a10';
    ctx.fillRect(0, 0, W, Hh);
    if (vecchia || performance.now() - ultima > (motore.playing ? 200 : 600)) {
      if (leggi()) {
        const t = document.createElement('canvas');
        t.width = LARGO; t.height = H;
        t.getContext('2d')!.putImageData(imm, 0, 0);
        piccola = t;
      }
      vecchia = false; ultima = performance.now();
    }
    if (piccola) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(piccola, 0, 0, W, Hh); }
    // le linee del centro e dei terzi
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, Hh); ctx.moveTo(0, Hh / 2); ctx.lineTo(W, Hh / 2); ctx.stroke();
    if (guide.x || guide.y) {
      ctx.strokeStyle = '#ff8ff8'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (guide.x) { ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, Hh); }
      if (guide.y) { ctx.moveTo(0, Hh / 2); ctx.lineTo(W, Hh / 2); }
      ctx.stroke();
    }
    if (!b) return;
    const q = riquadroClip(store.doc, b.c, b.c.tf, b.f);
    if (!q) return;
    const kk = k(), mn = maniglie(q);
    ctx.save();
    ctx.translate(q.cx * kk, q.cy * kk); ctx.rotate(q.rot);
    ctx.fillStyle = 'rgba(255,213,74,.10)';
    ctx.fillRect((-q.w / 2) * kk, (-q.h / 2) * kk, q.w * kk, q.h * kk);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd54a';
    ctx.strokeRect((-q.w / 2) * kk, (-q.h / 2) * kk, q.w * kk, q.h * kk);
    ctx.restore();
    // maniglie
    ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#1a1406'; ctx.lineWidth = 2;
    for (const a of mn.angoli) { ctx.beginPath(); ctx.rect(a.x * kk - 6, a.y * kk - 6, 12, 12); ctx.fill(); ctx.stroke(); }
    const top = { x: (mn.angoli[0].x + mn.angoli[1].x) / 2 * kk, y: (mn.angoli[0].y + mn.angoli[1].y) / 2 * kk };
    ctx.strokeStyle = '#ffd54a'; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(mn.gira.x * kk, mn.gira.y * kk); ctx.stroke();
    ctx.fillStyle = '#ff8ff8'; ctx.strokeStyle = '#1a1406'; ctx.beginPath(); ctx.arc(mn.gira.x * kk, mn.gira.y * kk, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(mn.centro.x * kk, mn.centro.y * kk, 3.5, 0, Math.PI * 2); ctx.fill();
  };
  let piccola: HTMLCanvasElement | null = null;

  const testo = () => {
    const b = bersaglio(clips());
    if (!b) { nota.textContent = ''; return; }
    if (b.c.tfFine) { nota.textContent = 'Questa clip si muove (partenza e arrivo): per cambiarla usa il monitor grande, con ◀ Inizio / Fine ▶.'; return; }
    const t = b.c.tf;
    nota.textContent = `Zoom ${Math.round(t.scale * 100)}% · Sposta ${Math.round(t.x)}, ${Math.round(t.y)} px${t.rot ? ` · Gira ${Math.round(t.rot)}°` : ''}`;
  };

  const aggiorna = () => { testo(); vecchia = true; if (el.isConnected) disegna(); };

  /** il punto del mouse in pixel del progetto */
  const punto = (e: { clientX: number; clientY: number }) => {
    const r = tela.getBoundingClientRect(), p = store.doc;
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * p.w, y: ((e.clientY - r.top) / Math.max(1, r.height)) * p.h };
  };
  const fermo = () => { const b = bersaglio(clips()); return !!b?.c.tfFine; };

  const cosa = (e: PointerEvent): 'sposta' | 'scala' | 'gira' | null => {
    const b = bersaglio(clips());
    if (!b || fermo()) return null;
    const q = riquadroClip(store.doc, b.c, b.c.tf, b.f);
    if (!q) return null;
    const m = punto(e), mn = maniglie(q), tol = 12 / k();
    if (Math.hypot(m.x - mn.gira.x, m.y - mn.gira.y) < tol) return 'gira';
    if (mn.angoli.some((a) => Math.hypot(m.x - a.x, m.y - a.y) < tol)) return 'scala';
    // dentro il riquadro (con la sua rotazione)
    const dx = m.x - q.cx, dy = m.y - q.cy, co = Math.cos(-q.rot), si = Math.sin(-q.rot);
    const lx = co * dx - si * dy, ly = si * dx + co * dy;
    return Math.abs(lx) <= q.w / 2 + 4 / k() && Math.abs(ly) <= q.h / 2 + 4 / k() ? 'sposta' : null;
  };

  const tutte = () => clips().map((c) => store.doc.clips.find((x) => x.id === c.id)).filter(Boolean) as Clip[];
  const baseTf = () => new Map(tutte().map((c) => [c.id, { ...c.tf }]));
  const applica = (fn: (c: Clip, b: Transform) => void, base: Map<string, Transform>) => {
    for (const c of tutte()) { const b = base.get(c.id); if (b) fn(c, b); }
    store.liveChange();
  };

  tela.addEventListener('pointermove', (e) => {
    if (presa) return;
    const c = cosa(e);
    tela.style.cursor = c === 'sposta' ? 'move' : c === 'scala' ? 'nwse-resize' : c === 'gira' ? 'grab' : 'default';
  });
  tela.addEventListener('pointerdown', (e) => {
    const c = cosa(e);
    const b = bersaglio(clips());
    if (!c || !b) return;
    e.preventDefault();
    tela.setPointerCapture(e.pointerId);
    const m = punto(e);
    const q = riquadroClip(store.doc, b.c, b.c.tf, b.f)!;
    if (c === 'sposta') { store.begin('Sposta'); presa = { tipo: 'sposta', x0: m.x, y0: m.y, base: baseTf() }; }
    else if (c === 'scala') { store.begin('Ridimensiona'); presa = { tipo: 'scala', d0: Math.max(1, Math.hypot(m.x - q.cx, m.y - q.cy)), base: baseTf() }; }
    else { store.begin('Gira'); presa = { tipo: 'gira', a0: Math.atan2(m.y - q.cy, m.x - q.cx), base: baseTf() }; }
  });
  tela.addEventListener('pointermove', (e) => {
    if (!presa) return;
    const m = punto(e), p = store.doc;
    const b = bersaglio(clips());
    if (!b) return;
    if (presa.tipo === 'sposta') {
      const dx = m.x - presa.x0, dy = m.y - presa.y0;
      applica((c, base) => { c.tf.x = base.x + dx; c.tf.y = base.y + dy; }, presa.base);
      // il centro e i bordi del quadro attirano il riquadro (Alt = libero)
      guide = { x: false, y: false };
      if (!e.altKey) {
        const q = riquadroClip(p, b.c, b.c.tf, b.f);
        if (q) {
          const soglia = 9 / k();
          const sx = [[q.cx, p.w / 2], [q.cx - q.w / 2, 0], [q.cx + q.w / 2, p.w]].find(([a, t]) => Math.abs(a - t) < soglia);
          const sy = [[q.cy, p.h / 2], [q.cy - q.h / 2, 0], [q.cy + q.h / 2, p.h]].find(([a, t]) => Math.abs(a - t) < soglia);
          if (sx && !b.c.tf.rot) { const d = sx[1] - sx[0]; for (const c of tutte()) c.tf.x += d; guide.x = sx[1] === p.w / 2; }
          if (sy && !b.c.tf.rot) { const d = sy[1] - sy[0]; for (const c of tutte()) c.tf.y += d; guide.y = sy[1] === p.h / 2; }
        }
      }
    } else if (presa.tipo === 'scala') {
      const q = riquadroClip(p, b.c, presa.base.get(b.c.id)!, b.f);
      if (!q) return;
      const f = clamp(Math.hypot(m.x - q.cx, m.y - q.cy) / presa.d0, 0.05, 20);
      applica((c, base) => { c.tf.scale = clamp(base.scale * f, 0.05, 8); }, presa.base);
    } else {
      const q = riquadroClip(p, b.c, presa.base.get(b.c.id)!, b.f);
      if (!q) return;
      const d = ((Math.atan2(m.y - q.cy, m.x - q.cx) - presa.a0) * 180) / Math.PI;
      applica((c, base) => {
        let r = base.rot + d;
        // ogni 15° si ferma (Alt = libero)
        if (!e.altKey) { const s = Math.round(r / 15) * 15; if (Math.abs(r - s) < 3) r = s; }
        c.tf.rot = ((r + 540) % 360) - 180;
      }, presa.base);
    }
    aggiorna();
  });
  const fine = () => {
    if (!presa) return;
    presa = null; guide = { x: false, y: false };
    store.commit(true);
    aggiorna();
  };
  tela.addEventListener('pointerup', fine);
  tela.addEventListener('pointercancel', () => { if (presa) { store.cancelLive(); presa = null; aggiorna(); } });
  tela.addEventListener('dblclick', () => {
    if (fermo()) return;
    store.edit('Adatta', () => { for (const c of tutte()) c.tf = { ...TF0 }; });
  });
  // la rotella ingrandisce (un solo colpo per l'annulla finché si gira)
  let rotella = 0;
  tela.addEventListener('wheel', (e) => {
    if (fermo() || !bersaglio(clips())) return;
    e.preventDefault();
    if (!rotella) store.begin('Zoom');
    clearTimeout(rotella);
    const f = Math.exp(-(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * 0.0012);
    for (const c of tutte()) c.tf.scale = clamp(c.tf.scale * f, 0.05, 8);
    store.liveChange();
    rotella = window.setTimeout(() => { rotella = 0; store.commit(true); }, 350) as unknown as number;
    aggiorna();
  }, { passive: false });

  // il pannello si ricostruisce a ogni scelta: quando questo quadro esce dalla pagina smette di ascoltare
  let montato = false;
  const togli: (() => void)[] = [];
  const vivo = () => {
    if (el.isConnected) { montato = true; return true; }
    if (montato) for (const t of togli.splice(0)) t();
    return false;
  };
  togli.push(motore.ogniGiro(() => { if (vivo() && el.offsetParent && !presa) disegna(); }));
  const rifai = () => { if (vivo()) { vecchia = true; testo(); } };
  togli.push(store.on('doc', rifai), store.on('head', rifai), store.on('sel', rifai));
  testo();
  return { el, aggiorna };
}

// ——— le posizioni pronte, ognuna col suo disegnino ———
export interface PosizionePronta { nome: string; titolo: string; box: [number, number, number, number]; fn: (c: Clip) => Transform }

/** il disegnino di un riquadro dentro un quadro (frazioni 0..1 dall'angolo in alto a sinistra) */
export const disegnino = (box: [number, number, number, number]) => h('i', { class: 'pp-ico' }, h('b', { style: `left:${box[0] * 100}%;top:${box[1] * 100}%;width:${box[2] * 100}%;height:${box[3] * 100}%` }));

export function posizioniPronte(): PosizionePronta[] {
  const p = store.doc;
  const angolo = (sx: number, sy: number): ((c: Clip) => Transform) => () => ({ ...TF0, scale: 0.33, x: p.w * 0.3 * sx, y: p.h * 0.28 * sy });
  return [
    { nome: 'Adatta', titolo: 'Tutta l\'immagine, intera nel quadro', box: [0, 0.04, 1, 0.92], fn: () => ({ ...TF0 }) },
    {
      nome: 'Riempi', titolo: 'A tutto quadro (taglia i bordi che avanzano)', box: [0, 0, 1, 1], fn: (c) => {
        const m = mediaOf(p, c);
        if (!m?.width) return { ...c.tf, scale: 1 };
        const w = m.rotation % 180 ? m.height : m.width, hh = m.rotation % 180 ? m.width : m.height;
        return { ...TF0, scale: Math.max(p.w / w, p.h / hh) / Math.min(p.w / w, p.h / hh) };
      },
    },
    { nome: 'Piccola', titolo: 'Al centro, grande la metà', box: [0.25, 0.25, 0.5, 0.5], fn: () => ({ ...TF0, scale: 0.5 }) },
    { nome: 'In alto a sinistra', titolo: 'Riquadro in un angolo (picture in picture)', box: [0.05, 0.06, 0.33, 0.33], fn: angolo(-1, -1) },
    { nome: 'In alto a destra', titolo: 'Riquadro in un angolo (picture in picture)', box: [0.62, 0.06, 0.33, 0.33], fn: angolo(1, -1) },
    { nome: 'In basso a sinistra', titolo: 'Riquadro in un angolo (picture in picture)', box: [0.05, 0.61, 0.33, 0.33], fn: angolo(-1, 1) },
    { nome: 'In basso a destra', titolo: 'Riquadro in un angolo (picture in picture)', box: [0.62, 0.61, 0.33, 0.33], fn: angolo(1, 1) },
    { nome: 'Bolla', titolo: 'Tonda, con l\'ombra, in basso a destra (la webcam)', box: [0.68, 0.56, 0.28, 0.38], fn: (c) => bolla(p, mediaOf(p, c), 'bd') },
    { nome: 'Presentazione', titolo: 'Un po\' più piccola, con gli angoli tondi e l\'ombra', box: [0.1, 0.1, 0.8, 0.8], fn: () => presentazione() },
  ];
}
