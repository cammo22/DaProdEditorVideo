// Le maschere a forma sul monitor: la modalità che Posiziona (src/ui/posiziona.ts) accende quando dal pannello si preme
// «Sul monitor» (evento dpv:maschera). Disegna il contorno della maschera scelta e le sue maniglie; si trascina la forma,
// i lati (larghezza e altezza), il pallino che gira e i punti della Bézier; con «disegna» ogni clic aggiunge un punto,
// il tasto destro ne toglie uno, Invio o Esc finisce. Se un parametro ha i keyframe, trascinare scrive la chiave sotto
// il cursore (scriviParametro). Le altre modalità di Posiziona non cambiano: questa si fa da parte appena si clicca altrove.
import { store } from '../core/store';
import type { Clip, MascheraForma, Project } from '../core/tipi';
import { clipById, tfAl } from '../core/progetto';
import { valutaClip } from '../core/automazioni';
import { contornoMaschera, dentroMaschera, localeDa, puntoLocale } from '../core/maschereForma';
import { motore } from '../motore';
import type { Riquadro } from './posiziona';
import { frameLocale, scriviParametro } from './keyframe';

type Riquadrare = (p: Project, c: Clip, tf: ReturnType<typeof tfAl>, f: number) => Riquadro | null;

/** dov'è la sorgente intera sul quadro (centro, misure, rotazione) e come si passa da frazioni dell'immagine a pixel del progetto */
interface Mappa {
  aSchermo: (u: number, v: number) => [number, number];
  daSchermo: (x: number, y: number) => [number, number];
  aspetto: number;
  /** l'altezza della sorgente intera in pixel del progetto */
  alto: number;
}

interface Contesto { p: Project; c: Clip; cv: Clip; m: MascheraForma; lf: number; mappa: Mappa }

type Presa = { tipo: 'sposta' } | { tipo: 'punto'; i: number } | { tipo: 'larghezza' } | { tipo: 'altezza' } | { tipo: 'gira' };

export class EditorMaschere {
  private att: { clip: string; mask: string; disegna: boolean } | null = null;
  private trascina: { presa: Presa; mosso: boolean; u0: number; v0: number; m0: MascheraForma } | null = null;

  constructor(private schermo: HTMLElement, private sopra: HTMLCanvasElement, private ridisegna: () => void, private riquadro: Riquadrare) {
    document.addEventListener('dpv:maschera', (e) => {
      const d = (e as CustomEvent<{ clip: string; mask: string; disegna: boolean }>).detail;
      this.att = d && d.clip && d.mask ? { clip: d.clip, mask: d.mask, disegna: !!d.disegna } : null;
      this.ridisegna();
    });
    store.on('sel', () => { if (this.att && !store.sel.has(this.att.clip)) { this.att = null; this.ridisegna(); } });
    // Invio o Esc: finito
    addEventListener('keydown', (e) => {
      if (!this.attiva()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.att = null; this.ridisegna(); }
    }, true);
    // tasto destro su un punto della Bézier: lo toglie
    schermo.addEventListener('contextmenu', (e) => { if (this.attiva() && this.puntoSotto(e as PointerEvent) !== null) e.preventDefault(); });
    schermo.addEventListener('pointerdown', (e) => {
      if (e.button !== 2 || !this.attiva()) return;
      const i = this.puntoSotto(e);
      if (i === null) return;
      e.preventDefault(); e.stopPropagation();
      this.togliPunto(i);
    }, true);
  }

  private k() { return this.sopra.getBoundingClientRect().width / store.doc.w; }
  private punto(e: PointerEvent) {
    const r = this.sopra.getBoundingClientRect(), p = store.doc;
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * p.w, y: ((e.clientY - r.top) / Math.max(1, r.height)) * p.h };
  }

  /** c'è una maschera da mostrare sul monitor adesso? */
  attiva(): boolean { return this.contesto() !== null; }

  private contesto(): Contesto | null {
    if (!this.att || motore.attivo !== 'recorder') return null;
    const p = store.doc, c = clipById(p, this.att.clip);
    if (!c || !store.sel.has(c.id)) return null;
    const lf = frameLocale(c);
    if (lf === null) return null;
    const cv = valutaClip(c, lf);
    const m = cv.maschere?.find((x) => x.id === this.att!.mask);
    if (!m) return null;
    const f = c.start + lf;
    const tf = tfAl(cv, lf);
    const q = this.riquadro(p, cv, tf, f);
    if (!q) return null;
    // la sorgente intera: il riquadro visibile è già ritagliato
    const Wf = q.w / Math.max(0.01, 1 - tf.cropL - tf.cropR), Hf = q.h / Math.max(0.01, 1 - tf.cropT - tf.cropB);
    const co = Math.cos(q.rot), si = Math.sin(q.rot);
    const ux = ((tf.cropL - tf.cropR) / 2) * Wf, uy = ((tf.cropT - tf.cropB) / 2) * Hf;
    const cx = q.cx - (co * ux - si * uy), cy = q.cy - (si * ux + co * uy);
    const mappa: Mappa = {
      aspetto: Wf / Hf / (tf.sx ?? 1), alto: Hf,
      aSchermo: (u, v) => { const lx = (u - 0.5) * Wf, ly = (v - 0.5) * Hf; return [cx + co * lx - si * ly, cy + si * lx + co * ly]; },
      daSchermo: (x, y) => { const dx = x - cx, dy = y - cy; return [(co * dx + si * dy) / Wf + 0.5, (-si * dx + co * dy) / Hf + 0.5]; },
    };
    return { p, c, cv, m, lf, mappa };
  }

  /** le maniglie di una forma: i lati e il pallino sopra, in pixel del progetto */
  private maniglie(x: Contesto): { larg: [number, number]; alt: [number, number]; gira: [number, number]; centro: [number, number] } | null {
    const { m, mappa } = x;
    if (m.forma === 'bezier') return null;
    const s = (lx: number, ly: number) => mappa.aSchermo(...puntoLocale(m, mappa.aspetto, lx, ly));
    // il pallino sta sopra il lato alto, un po' fuori
    const fuori = 26 / Math.max(0.001, this.k()) / Math.max(1, mappa.alto);
    return { larg: s(m.w / 2, 0), alt: s(0, m.h / 2), gira: s(0, -m.h / 2 - fuori), centro: s(0, 0) };
  }

  private presa(x: Contesto, px: number, py: number): Presa | null {
    const tol = 12 / Math.max(0.001, this.k());
    const { m, mappa } = x;
    if (m.forma === 'bezier') {
      const P = m.punti ?? [];
      for (let i = P.length - 1; i >= 0; i--) {
        const [sx, sy] = mappa.aSchermo(P[i].x, P[i].y);
        if (Math.hypot(px - sx, py - sy) < tol) return { tipo: 'punto', i };
      }
    } else {
      const mn = this.maniglie(x)!;
      if (Math.hypot(px - mn.gira[0], py - mn.gira[1]) < tol) return { tipo: 'gira' };
      if (Math.hypot(px - mn.larg[0], py - mn.larg[1]) < tol) return { tipo: 'larghezza' };
      if (Math.hypot(px - mn.alt[0], py - mn.alt[1]) < tol) return { tipo: 'altezza' };
    }
    const [u, v] = mappa.daSchermo(px, py);
    if (dentroMaschera(m, u, v, mappa.aspetto)) return { tipo: 'sposta' };
    return null;
  }

  private puntoSotto(e: PointerEvent): number | null {
    const x = this.contesto();
    if (!x || x.m.forma !== 'bezier') return null;
    const { x: px, y: py } = this.punto(e);
    const pr = this.presa(x, px, py);
    return pr && pr.tipo === 'punto' ? pr.i : null;
  }

  cursoreSu(e: PointerEvent): string {
    const x = this.contesto();
    if (!x) return '';
    if (this.att?.disegna) return 'crosshair';
    const { x: px, y: py } = this.punto(e);
    const pr = this.presa(x, px, py);
    return !pr ? '' : pr.tipo === 'gira' ? 'grab' : pr.tipo === 'larghezza' ? 'ew-resize' : pr.tipo === 'altezza' ? 'ns-resize' : 'move';
  }

  /** disegna il contorno e le maniglie; ritorna true se ha disegnato (Posiziona allora non disegna le sue) */
  disegna(ctx: CanvasRenderingContext2D, W: number): boolean {
    const x = this.contesto();
    if (!x) return false;
    const k = W / x.p.w;
    const dpr = W / Math.max(1, this.sopra.getBoundingClientRect().width);
    const { m, mappa } = x;
    ctx.save();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#ff3df2';
    ctx.fillStyle = 'rgba(255,61,242,.10)';
    const poly = contornoMaschera(m, mappa.aspetto);
    if (poly.length > 1) {
      ctx.beginPath();
      poly.forEach(([u, v], i) => { const [sx, sy] = mappa.aSchermo(u, v); if (i) ctx.lineTo(sx * k, sy * k); else ctx.moveTo(sx * k, sy * k); });
      if (m.forma !== 'bezier' || poly.length >= 3) ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    const quadro = (px: number, py: number, pieno: boolean, r = 5) => {
      ctx.fillStyle = pieno ? '#ffd54a' : '#1a1206'; ctx.strokeStyle = '#ffd54a';
      ctx.beginPath(); ctx.rect(px * k - r * dpr, py * k - r * dpr, 2 * r * dpr, 2 * r * dpr); ctx.fill(); ctx.stroke();
    };
    if (m.forma === 'bezier') {
      // la linea tra i punti, anche prima di averne tre (si vede dove si sta andando)
      const P = m.punti ?? [];
      if (P.length && P.length < 3) {
        ctx.beginPath();
        P.forEach((q, i) => { const [sx, sy] = mappa.aSchermo(q.x, q.y); if (i) ctx.lineTo(sx * k, sy * k); else ctx.moveTo(sx * k, sy * k); });
        ctx.stroke();
      }
      P.forEach((q, i) => { const [sx, sy] = mappa.aSchermo(q.x, q.y); quadro(sx, sy, i === 0); });
    } else {
      const mn = this.maniglie(x)!;
      quadro(mn.larg[0], mn.larg[1], false);
      quadro(mn.alt[0], mn.alt[1], false);
      const cima = mappa.aSchermo(...puntoLocale(m, mappa.aspetto, 0, -m.h / 2));
      ctx.strokeStyle = '#ffd54a';
      ctx.beginPath(); ctx.moveTo(cima[0] * k, cima[1] * k); ctx.lineTo(mn.gira[0] * k, mn.gira[1] * k); ctx.stroke();
      ctx.fillStyle = '#ffd54a';
      ctx.beginPath(); ctx.arc(mn.gira[0] * k, mn.gira[1] * k, 6 * dpr, 0, Math.PI * 2); ctx.fill();
      const c = mn.centro;
      ctx.strokeStyle = '#ff3df2';
      ctx.beginPath(); ctx.moveTo(c[0] * k - 7 * dpr, c[1] * k); ctx.lineTo(c[0] * k + 7 * dpr, c[1] * k); ctx.moveTo(c[0] * k, c[1] * k - 7 * dpr); ctx.lineTo(c[0] * k, c[1] * k + 7 * dpr); ctx.stroke();
    }
    ctx.font = `700 ${11 * dpr}px Rajdhani, sans-serif`;
    ctx.fillStyle = '#ff3df2';
    ctx.textAlign = 'left';
    const frase = this.att!.disegna ? 'Maschera: clic = nuovo punto · trascina = sposta · tasto destro = toglie · Invio = finito'
      : m.forma === 'bezier' ? 'Maschera: trascina i punti o la forma · Invio = finito' : 'Maschera: trascina la forma, i lati e il pallino · Invio = finito';
    ctx.fillText(frase, 10 * dpr, 18 * dpr);
    ctx.restore();
    return true;
  }

  /** un clic sull'immagine: ritorna true se l'ha preso lui (se no la maschera si spegne e il resto funziona come sempre) */
  giu(e: PointerEvent): boolean {
    const x = this.contesto();
    if (!x) return false;
    const { x: px, y: py } = this.punto(e);
    const presa = this.presa(x, px, py);
    const [u, v] = x.mappa.daSchermo(px, py);
    if (!presa && x.m.forma === 'bezier' && this.att!.disegna) {
      // un punto nuovo (in fondo alla fila)
      const mid = x.m.id, cid = x.c.id;
      const uu = Math.max(0, Math.min(1, u)), vv = Math.max(0, Math.min(1, v));
      store.edit('Punto della maschera', (pp) => { const m = clipById(pp, cid)?.maschere?.find((z) => z.id === mid); if (m) (m.punti ??= []).push({ x: uu, y: vv }); });
      e.preventDefault(); e.stopPropagation();
      this.ridisegna();
      return true;
    }
    if (!presa) { this.att = null; this.ridisegna(); return false; }
    e.preventDefault();
    e.stopPropagation();
    if (motore.playing) motore.stop();
    store.begin(presa.tipo === 'sposta' ? 'Sposta la maschera' : presa.tipo === 'punto' ? 'Sposta il punto' : presa.tipo === 'gira' ? 'Gira la maschera' : 'Ridimensiona la maschera');
    this.trascina = { presa, mosso: false, u0: u, v0: v, m0: structuredClone(x.m) };
    const id = x.c.id;
    this.schermo.setPointerCapture(e.pointerId);
    const muovi = (ev: PointerEvent) => this.muovi(ev, id);
    const su = () => {
      this.schermo.removeEventListener('pointermove', muovi);
      this.schermo.removeEventListener('pointerup', su);
      this.schermo.removeEventListener('pointercancel', su);
      store.commit(!!this.trascina?.mosso);
      this.trascina = null;
    };
    this.schermo.addEventListener('pointermove', muovi);
    this.schermo.addEventListener('pointerup', su);
    this.schermo.addEventListener('pointercancel', su);
    return true;
  }

  private muovi(e: PointerEvent, id: string) {
    const t = this.trascina;
    const x = this.contesto();
    if (!t || !x || x.c.id !== id) return;
    const { x: px, y: py } = this.punto(e);
    const [u, v] = x.mappa.daSchermo(px, py);
    const { m0 } = t;
    const c = clipById(store.doc, id)!;
    const lf = x.lf, base = `mask.${m0.id}.`;
    const scrivi = (campo: string, val: number) => scriviParametro(c, base + campo, lf, val);
    const asp = x.mappa.aspetto;
    switch (t.presa.tipo) {
      case 'sposta':
        if (m0.forma === 'bezier') (m0.punti ?? []).forEach((q, i) => { scrivi(`p${i}.x`, q.x + (u - t.u0)); scrivi(`p${i}.y`, q.y + (v - t.v0)); });
        else { scrivi('x', m0.x + (u - t.u0)); scrivi('y', m0.y + (v - t.v0)); }
        break;
      case 'punto':
        scrivi(`p${t.presa.i}.x`, Math.max(-0.5, Math.min(1.5, u)));
        scrivi(`p${t.presa.i}.y`, Math.max(-0.5, Math.min(1.5, v)));
        break;
      case 'larghezza': scrivi('w', Math.max(0.01, Math.min(2, 2 * Math.abs(localeDa(m0, asp, u, v)[0])))); break;
      case 'altezza': scrivi('h', Math.max(0.01, Math.min(2, 2 * Math.abs(localeDa(m0, asp, u, v)[1])))); break;
      case 'gira': {
        let g = (Math.atan2(v - m0.y, (u - m0.x) * asp) * 180) / Math.PI + 90;
        g = ((g + 540) % 360) - 180;
        if (!e.altKey) for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(g - s) < 4) g = s;
        scrivi('rot', Math.round(g * 10) / 10);
        break;
      }
    }
    t.mosso = true;
    store.liveChange();
  }

  private togliPunto(i: number) {
    const x = this.contesto();
    if (!x) return;
    const mid = x.m.id, cid = x.c.id, lf = x.lf;
    store.edit('Toglie un punto', (pp) => {
      const c = clipById(pp, cid), m = c?.maschere?.find((z) => z.id === mid);
      if (!c || !m?.punti) return;
      // le linee dei punti seguono gli indici: prima si fissano i valori di adesso, poi si tolgono
      const anim = c.anim;
      if (anim) {
        const cv = valutaClip(c, lf), mv = cv.maschere?.find((z) => z.id === mid);
        if (mv?.punti) m.punti = mv.punti.map((q) => ({ ...q }));
        for (const k of Object.keys(anim)) if (new RegExp(`^mask\\.${mid}\\.p\\d+\\.`).test(k)) delete anim[k];
        if (!Object.keys(anim).length) delete c.anim;
      }
      m.punti.splice(i, 1);
    });
    this.ridisegna();
  }
}
