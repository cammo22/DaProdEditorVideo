// Le maschere a forma di una clip: rettangolo, ellisse e curva di Bézier, con sfumatura, espansione, inversione,
// più maschere sommate o sottratte in ordine. Tutto è in frazioni della sorgente (0..1, y verso il basso) così la
// maschera segue la clip quando si sposta, si gira e si ritaglia. Questo modulo è puro: dà la "copertura" (0 = si
// toglie, 1 = si vede) su una griglia piccola; il compositore la carica come texture a un canale e la moltiplica
// per la trasparenza della clip (src/render/compositore.ts, passata «forma»).
// L'idea di forme parametriche trasformate in tracciato di Bézier (l'ellisse con la costante 0,5522847498) e di
// maschera con sfumatura viene dal motore di maschere di OpenReel Video (MIT): vedi TERZE-PARTI.md. Il calcolo è
// scritto da zero, in distanza con segno, senza canvas, così si prova da Node.
import type { MascheraForma, PuntoBez } from './tipi';

export const MAX_MASCHERE = 8;
/** il lato lungo della griglia della copertura */
export const LATO_FORMA = 768;

export function nuovaMaschera(forma: MascheraForma['forma'], id: string, extra: Partial<MascheraForma> = {}): MascheraForma {
  return {
    id, forma, x: 0.5, y: 0.5, w: forma === 'bezier' ? 0 : 0.5, h: forma === 'bezier' ? 0 : 0.5, rot: 0,
    sfuma: 0, espandi: 0, inverti: false, opacita: 1, op: 'somma', ...(forma === 'bezier' ? { punti: [], morbida: true } : {}), ...extra,
  };
}

export const nomeForma = (m: MascheraForma) => m.nome || (m.forma === 'rettangolo' ? 'Rettangolo' : m.forma === 'ellisse' ? 'Ellisse' : 'Bézier');

/** la griglia della copertura per una sorgente larga quanto il suo rapporto (larghezza / altezza) */
export function misureForma(aspetto: number, lato = LATO_FORMA): { w: number; h: number } {
  const a = Number.isFinite(aspetto) && aspetto > 0.05 ? aspetto : 16 / 9;
  return a >= 1 ? { w: lato, h: Math.max(2, Math.round(lato / a)) } : { w: Math.max(2, Math.round(lato * a)), h: lato };
}

// ——— la linea della Bézier ———

/** la maniglia in uscita del punto i: quella scelta, o (curve morbide) quella che fa passare la curva dolce da un punto all'altro */
function maniglia(m: MascheraForma, i: number): [number, number] {
  const P = m.punti!, p = P[i];
  if (p.hx !== undefined && p.hy !== undefined) return [p.hx, p.hy];
  if (!m.morbida) return [0, 0];
  const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length];
  return [(b.x - a.x) / 6, (b.y - a.y) / 6];
}

/** la Bézier chiusa come lista di punti (frazioni): i tratti dritti restano due punti, le curve si spezzano in `passi` */
export function poligonoBezier(m: MascheraForma, passi = 14): [number, number][] {
  const P = m.punti ?? [];
  const n = P.length;
  if (n < 3) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[i], p3 = P[(i + 1) % n];
    const [h0x, h0y] = maniglia(m, i), [h3x, h3y] = maniglia(m, (i + 1) % n);
    out.push([p0.x, p0.y]);
    if (!h0x && !h0y && !h3x && !h3y) continue;
    const x1 = p0.x + h0x, y1 = p0.y + h0y, x2 = p3.x - h3x, y2 = p3.y - h3y;
    for (let s = 1; s < passi; s++) {
      const t = s / passi, u = 1 - t;
      out.push([u * u * u * p0.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * p3.x,
        u * u * u * p0.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * p3.y]);
    }
  }
  return out;
}

/** un punto nel sistema della forma (centro e rotazione sua; lx in frazioni di larghezza, ly di altezza) → frazioni della sorgente */
export function puntoLocale(m: MascheraForma, aspetto: number, lx: number, ly: number): [number, number] {
  const co = Math.cos((m.rot * Math.PI) / 180), si = Math.sin((m.rot * Math.PI) / 180);
  // in pixel con la proporzione giusta, poi di nuovo in frazioni
  const px = lx * aspetto, py = ly;
  return [m.x + (co * px - si * py) / aspetto, m.y + (si * px + co * py)];
}

/** il contrario: un punto della sorgente (frazioni) nel sistema della forma */
export function localeDa(m: MascheraForma, aspetto: number, u: number, v: number): [number, number] {
  const co = Math.cos((m.rot * Math.PI) / 180), si = Math.sin((m.rot * Math.PI) / 180);
  const dx = (u - m.x) * aspetto, dy = v - m.y;
  return [(co * dx + si * dy) / aspetto, -si * dx + co * dy];
}

/** il contorno da disegnare sul monitor (frazioni della sorgente): rettangolo e ellisse girati, o la Bézier */
export function contornoMaschera(m: MascheraForma, aspetto: number, passi = 48): [number, number][] {
  if (m.forma === 'bezier') return poligonoBezier(m);
  const pt = (lx: number, ly: number) => puntoLocale(m, aspetto, lx, ly);
  const hw = m.w / 2, hh = m.h / 2;
  if (m.forma === 'rettangolo') return [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)];
  const out: [number, number][] = [];
  for (let i = 0; i < passi; i++) { const a = (i / passi) * Math.PI * 2; out.push(pt(Math.cos(a) * hw, Math.sin(a) * hh)); }
  return out;
}

// ——— la distanza dal bordo (negativa dentro) ———

function sdRettEllisse(m: MascheraForma, mw: number, mh: number, out: Float32Array) {
  const cx = m.x * mw, cy = m.y * mh, hx = Math.max(0.001, (m.w * mw) / 2), hy = Math.max(0.001, (m.h * mh) / 2);
  const r = (m.rot * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  const ell = m.forma === 'ellisse';
  for (let j = 0; j < mh; j++) {
    const dy = j + 0.5 - cy;
    for (let i = 0; i < mw; i++) {
      const dx = i + 0.5 - cx;
      const lx = co * dx + si * dy, ly = -si * dx + co * dy;
      if (ell) {
        const k0 = Math.hypot(lx / hx, ly / hy), k1 = Math.hypot(lx / (hx * hx), ly / (hy * hy));
        out[j * mw + i] = k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(hx, hy);
      } else {
        const qx = Math.abs(lx) - hx, qy = Math.abs(ly) - hy;
        out[j * mw + i] = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
      }
    }
  }
}

/** distanza con segno da un poligono, calcolata solo nella fascia vicino al bordo (fuori fascia vale ±(fascia+1)) */
function sdPoligono(poly: [number, number][], mw: number, mh: number, fascia: number, out: Float32Array) {
  const n = poly.length;
  const px = poly.map((p) => p[0] * mw), py = poly.map((p) => p[1] * mh);
  const dist = new Float32Array(mw * mh).fill(fascia + 1);
  const dentro = new Uint8Array(mw * mh);
  // dentro/fuori: una riga alla volta, dove i lati incrociano il centro dei pixel (regola pari-dispari)
  for (let j = 0; j < mh; j++) {
    const y = j + 0.5, xs: number[] = [];
    for (let e = 0; e < n; e++) {
      const x0 = px[e], y0 = py[e], x1 = px[(e + 1) % n], y1 = py[(e + 1) % n];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil(xs[q] - 0.5)), b = Math.min(mw - 1, Math.ceil(xs[q + 1] - 0.5) - 1);
      for (let i = a; i <= b; i++) dentro[j * mw + i] = 1;
    }
  }
  // distanza: ogni lato aggiorna i pixel nella sua scatola allargata della fascia
  for (let e = 0; e < n; e++) {
    const x0 = px[e], y0 = py[e], x1 = px[(e + 1) % n], y1 = py[(e + 1) % n];
    const ex = x1 - x0, ey = y1 - y0, l2 = ex * ex + ey * ey;
    const ia = Math.max(0, Math.floor(Math.min(x0, x1) - fascia)), ib = Math.min(mw - 1, Math.ceil(Math.max(x0, x1) + fascia));
    const ja = Math.max(0, Math.floor(Math.min(y0, y1) - fascia)), jb = Math.min(mh - 1, Math.ceil(Math.max(y0, y1) + fascia));
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const dx = i + 0.5 - x0, dy = j + 0.5 - y0;
      const t = l2 > 0 ? Math.max(0, Math.min(1, (dx * ex + dy * ey) / l2)) : 0;
      const d = Math.hypot(dx - t * ex, dy - t * ey);
      if (d < dist[j * mw + i]) dist[j * mw + i] = d;
    }
  }
  for (let k = 0; k < mw * mh; k++) out[k] = dentro[k] ? -dist[k] : dist[k];
}

const molle = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/** la copertura di una sola maschera (0..1): forma → espansione → sfumatura → inversione → quanto conta */
export function coperturaMaschera(m: MascheraForma, mw: number, mh: number, out: Float32Array) {
  const unita = Math.min(mw, mh);
  const esp = Math.max(-0.5, Math.min(0.5, m.espandi)) * unita;
  const sf = Math.max(0, Math.min(0.5, m.sfuma)) * unita;
  const sd = new Float32Array(mw * mh);
  if (m.forma === 'bezier') {
    const poly = poligonoBezier(m);
    if (poly.length < 3) sd.fill(1e6); // senza forma non c'è niente dentro
    else sdPoligono(poly, mw, mh, Math.max(2, sf + Math.abs(esp) + 2), sd);
  } else sdRettEllisse(m, mw, mh, sd);
  const op = Math.max(0, Math.min(1, m.opacita));
  for (let k = 0; k < sd.length; k++) {
    const d = sd[k] - esp;
    // sotto il pixel: bordo netto con un pixel di sfumatura; sopra: curva dolce a cavallo del bordo
    let v = sf < 1 ? Math.max(0, Math.min(1, 0.5 - d)) : molle((sf - d) / (2 * sf));
    if (m.inverti) v = 1 - v;
    out[k] = v * op;
  }
}

/**
 * La copertura di tutte le maschere accese, in ordine: «somma» aggiunge, «sottrai» toglie. Se la prima è una sottrazione
 * si parte da tutto visibile. Ritorna null se non c'è nessuna maschera accesa (= tutto si vede, nessuna passata).
 */
export function coperturaMaschere(maschere: readonly MascheraForma[] | undefined, mw: number, mh: number): Float32Array | null {
  const attive = (maschere ?? []).filter((m) => !m.spenta).slice(0, MAX_MASCHERE);
  if (!attive.length) return null;
  const acc = new Float32Array(mw * mh).fill(attive[0].op === 'sottrai' ? 1 : 0);
  const cov = new Float32Array(mw * mh);
  for (const m of attive) {
    coperturaMaschera(m, mw, mh, cov);
    if (m.op === 'sottrai') for (let k = 0; k < acc.length; k++) acc[k] *= 1 - cov[k];
    else for (let k = 0; k < acc.length; k++) acc[k] = acc[k] + cov[k] - acc[k] * cov[k];
  }
  return acc;
}

/** la copertura a un canale da 0 a 255, pronta per la texture */
export function rasterizzaMaschere(maschere: readonly MascheraForma[] | undefined, aspetto: number, lato = LATO_FORMA): { w: number; h: number; dati: Uint8Array } | null {
  const { w, h } = misureForma(aspetto, lato);
  const c = coperturaMaschere(maschere, w, h);
  if (!c) return null;
  const dati = new Uint8Array(w * h);
  for (let k = 0; k < dati.length; k++) dati[k] = Math.round(Math.max(0, Math.min(1, c[k])) * 255);
  return { w, h, dati };
}

/** quanto dell'immagine si vede (0..1): la media della copertura. Serve alle prove */
export function areaVisibile(c: Float32Array | null): number {
  if (!c) return 1;
  let s = 0;
  for (let k = 0; k < c.length; k++) s += c[k];
  return s / c.length;
}

/** una firma corta: se non cambia, la texture non si rifà */
export function firmaMaschere(maschere: readonly MascheraForma[] | undefined, aspetto: number): string {
  const a = (maschere ?? []).filter((m) => !m.spenta);
  if (!a.length) return '';
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return Math.round(aspetto * 1000) + '|' + a.map((m) => [m.forma, r(m.x), r(m.y), r(m.w), r(m.h), r(m.rot), r(m.sfuma), r(m.espandi), m.inverti ? 1 : 0, r(m.opacita), m.op,
    m.morbida ? 1 : 0, (m.punti ?? []).map((p: PuntoBez) => [r(p.x), r(p.y), p.hx === undefined ? '' : r(p.hx), p.hy === undefined ? '' : r(p.hy)].join(',')).join(';')].join(':')).join('/');
}

/** il punto (frazioni) è dentro la forma? per scegliere la maschera col clic */
export function dentroMaschera(m: MascheraForma, x: number, y: number, aspetto: number): boolean {
  const poly = contornoMaschera(m, aspetto, 64);
  if (poly.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
