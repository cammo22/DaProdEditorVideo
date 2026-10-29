// Il colore finale: i look della pagina Finale e i ritocchi globali, tradotti in pochi numeri
// (lift, gamma, gain, saturazione, contrasto, viraggio di ombre e luci, vignetta, grana).
// Lo stesso calcolo serve i monitor e l'export, come tutto il resto.
import type { ColoreAvanzato, LookFinale, Master } from '../core/tipi';
import { curveNeutre } from './curve';

export type V3 = [number, number, number];

export interface Grade {
  curve?: ColoreAvanzato['curve'];
  lut?: ColoreAvanzato['lut'];
  lift: V3;
  gamma: V3;
  gain: V3;
  sat: number;
  contrast: number;
  /** colore aggiunto alle ombre e alle luci (viraggio) */
  shadow: V3;
  high: V3;
  vignette: number;
  grain: number;
}

export const GRADE0: Grade = {
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 1, contrast: 1, shadow: [0, 0, 0], high: [0, 0, 0], vignette: 0, grain: 0,
};

export interface Look { id: LookFinale; nome: string; info: string; g: Partial<Grade>; colori: [string, string, string] }

export const LOOKS: Look[] = [
  { id: 'nessuno', nome: 'Naturale', info: 'come è stato girato', g: {}, colori: ['#6b7a8f', '#c9b18a', '#e9e4da'] },
  { id: 'cinema', nome: 'Cinema', info: 'ombre ottanio, pelle calda', g: { contrast: 1.12, sat: 0.92, shadow: [-0.03, 0.02, 0.06], high: [0.06, 0.02, -0.04], vignette: 0.25 }, colori: ['#12343f', '#d98b4e', '#f3d2a8'] },
  { id: 'caldo', nome: 'Caldo', info: 'luce del tramonto', g: { gain: [1.08, 1.0, 0.88], sat: 1.05 }, colori: ['#5a2d12', '#e0913a', '#ffe0a8'] },
  { id: 'freddo', nome: 'Freddo', info: 'mattina d\'inverno', g: { gain: [0.9, 0.99, 1.1], sat: 0.94 }, colori: ['#132c4a', '#6fa0c9', '#dff0ff'] },
  { id: 'vivace', nome: 'Vivace', info: 'colori pieni, da spot', g: { sat: 1.35, contrast: 1.08, gamma: [1.04, 1.04, 1.04] }, colori: ['#c2185b', '#00b0ff', '#ffd600'] },
  { id: 'vintage', nome: 'Vintage', info: 'foto di famiglia anni \'70', g: { lift: [0.06, 0.05, 0.03], gain: [0.97, 0.94, 0.84], sat: 0.75, contrast: 0.9, vignette: 0.35, grain: 0.04 }, colori: ['#6b5a40', '#c8a97a', '#efe0c0'] },
  { id: 'bn', nome: 'Bianco e nero', info: 'contrastato, da reportage', g: { sat: 0, contrast: 1.15, vignette: 0.2 }, colori: ['#111111', '#777777', '#eeeeee'] },
  { id: 'pellicola', nome: 'Pellicola', info: 'curva morbida e grana', g: { contrast: 1.06, sat: 0.9, shadow: [0.0, 0.02, 0.03], high: [0.04, 0.02, 0.0], grain: 0.05, vignette: 0.2 }, colori: ['#2b2e2a', '#a38a64', '#f2e6cc'] },
  { id: 'notte', nome: 'Notte', info: 'blu da notte americana', g: { gain: [0.78, 0.9, 1.15], gamma: [0.9, 0.9, 0.9], sat: 0.8, lift: [0, 0.01, 0.03] }, colori: ['#050b1f', '#1f3f7a', '#8fb3ff'] },
];

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mix3 = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

/** i numeri del colore finale per i ritocchi del progetto */
export function gradeDi(m: Master): Grade {
  const look = LOOKS.find((l) => l.id === m.look) ?? LOOKS[0];
  const k = m.look === 'nessuno' ? 0 : Math.max(0, Math.min(1, m.intensita));
  const L = { ...GRADE0, ...look.g };
  const g: Grade = {
    lift: mix3(GRADE0.lift, L.lift, k),
    gamma: mix3(GRADE0.gamma, L.gamma, k),
    gain: mix3(GRADE0.gain, L.gain, k),
    sat: mix(1, L.sat, k),
    contrast: mix(1, L.contrast, k),
    shadow: mix3(GRADE0.shadow, L.shadow, k),
    high: mix3(GRADE0.high, L.high, k),
    vignette: mix(0, L.vignette, k),
    grain: mix(0, L.grain, k),
  };
  // i ritocchi a mano vanno sopra il look
  const b = m.bright * 0.25;
  g.lift = g.lift.map((x) => x + b * 0.5) as V3;
  g.gain = g.gain.map((x) => x * (1 + b)) as V3;
  g.contrast *= m.contrast;
  g.sat *= m.sat;
  const t = m.temp, ti = m.tint;
  g.gain = [g.gain[0] * (1 + t * 0.12), g.gain[1] * (1 - ti * 0.08), g.gain[2] * (1 - t * 0.14)];
  g.vignette = Math.max(g.vignette, m.vignette);
  g.grain = Math.max(g.grain, m.grain * 0.12);
  return conColore(g, m.colore);
}

/** I ritocchi manuali si sommano al look senza cambiarne la formula storica. */
export function conColore(g: Grade, c?: ColoreAvanzato): Grade {
  return { ...g,
    lift: g.lift.map((v, i) => v + (c?.lift?.[i] ?? 0)) as V3,
    gamma: g.gamma.map((v, i) => Math.max(0.1, v * (c?.gamma?.[i] ?? 1))) as V3,
    gain: g.gain.map((v, i) => v * (c?.gain?.[i] ?? 1)) as V3,
    curve: c?.curve, lut: c?.lut,
  };
}
export const gradeClip = (c?: ColoreAvanzato): Grade => conColore(GRADE0, c);

/** il colore finale non cambia niente? (così non si spreca un passaggio) */
export function gradeNeutro(g: Grade): boolean {
  const eq = (a: V3, b: V3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-4;
  return eq(g.lift, GRADE0.lift) && eq(g.gamma, GRADE0.gamma) && eq(g.gain, GRADE0.gain) && Math.abs(g.sat - 1) < 1e-4
    && Math.abs(g.contrast - 1) < 1e-4 && eq(g.shadow, GRADE0.shadow) && eq(g.high, GRADE0.high) && g.vignette < 1e-4 && g.grain < 1e-4
    && curveNeutre(g.curve) && !(g.lut && g.lut.intensita > 0);
}
