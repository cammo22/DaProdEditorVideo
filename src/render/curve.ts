// Tabelle delle curve derivate dal generatore OpenReel (MIT, TERZE-PARTI.md).
// Hermite con pendenze limitate: niente gobbe oltre i punti come con Catmull-Rom.
import type { CanaleCurva, ColoreAvanzato, PuntoColore } from '../core/tipi';
export const CANALI_CURVA: CanaleCurva[] = ['master', 'red', 'green', 'blue', 'luma'];
export const CAMPIONI_CURVA = 1024;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const identitaCurva = (): PuntoColore[] => [{ id: 'inizio', x: 0, y: 0 }, { id: 'fine', x: 1, y: 1 }];

export function normalizzaCurva(punti: PuntoColore[] = []): PuntoColore[] {
  const m = new Map<number, PuntoColore>();
  for (const p of punti) if (Number.isFinite(p.x) && Number.isFinite(p.y)) m.set(clamp(p.x), { ...p, x: clamp(p.x), y: clamp(p.y) });
  if (!m.has(0)) m.set(0, { id: 'inizio', x: 0, y: 0 });
  if (!m.has(1)) m.set(1, { id: 'fine', x: 1, y: 1 });
  return [...m.values()].sort((a, b) => a.x - b.x);
}
export function valutaCurva(punti: PuntoColore[], x: number): number {
  const p = punti;
  x = clamp(x);
  let i = 0;
  while (i < p.length - 2 && p[i + 1].x < x) i++;
  const a = p[i], b = p[i + 1], h = b.x - a.x;
  const d = (j: number) => (p[j + 1].y - p[j].y) / (p[j + 1].x - p[j].x);
  const tang = (j: number) => {
    if (j === 0) return d(0);
    if (j === p.length - 1) return d(j - 1);
    const l = d(j - 1), r = d(j);
    return l * r <= 0 ? 0 : 2 * l * r / (l + r);
  };
  const t = (x - a.x) / h, t2 = t * t, t3 = t2 * t;
  return clamp((2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * tang(i)
    + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * tang(i + 1));
}
export function curveNeutre(curve?: ColoreAvanzato['curve']): boolean {
  return CANALI_CURVA.every((c) => normalizzaCurva(curve?.[c]).every((p) => Math.abs(p.x - p.y) < 1e-7));
}
/** Una riga per canale, float replicato in RGBA per filtraggio half float WebGL2. */
export function tabellaCurve(curve?: ColoreAvanzato['curve']): Float32Array {
  const out = new Float32Array(CAMPIONI_CURVA * 5 * 4);
  CANALI_CURVA.forEach((c, r) => {
    const p = normalizzaCurva(curve?.[c]);
    for (let i = 0; i < CAMPIONI_CURVA; i++) out.fill(valutaCurva(p, i / (CAMPIONI_CURVA - 1)), (r * CAMPIONI_CURVA + i) * 4, (r * CAMPIONI_CURVA + i + 1) * 4);
  });
  return out;
}
/** Luma Rec.709: scala il colore per conservarne i rapporti; nero con epsilon, uscita SDR. */
export function curvaLuma(rgb: number[], punti: PuntoColore[]): number[] {
  const y = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  const nuovo = valutaCurva(normalizzaCurva(punti), y);
  return y > 1e-5 ? rgb.map((v) => clamp(v * nuovo / y)) : [nuovo, nuovo, nuovo];
}
