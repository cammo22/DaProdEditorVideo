// Le LUT di partenza di DaProd Video: file .cube nostri, generati da scripts/genera-lut.mjs (src/assets/lut/).
// Si leggono solo quando servono (un pezzetto di codice per ognuna), non pesano all'avvio.
import type { RisorsaLut } from '../core/tipi';
import { campionaLut, lutDaTesto } from './lut';

export interface LutDiPartenza { id: string; nome: string; info: string }
export const LUT_DI_PARTENZA: LutDiPartenza[] = [
  { id: 'caldo', nome: 'Caldo', info: 'ambra morbida, pelle dorata' },
  { id: 'freddo', nome: 'Freddo', info: 'azzurro pulito, aria d\'inverno' },
  { id: 'pellicola-anni-70', nome: 'Pellicola anni 70', info: 'neri alzati, verde giallino, colori un po\' spenti' },
  { id: 'bianco-e-nero-ricco', nome: 'Bianco e nero ricco', info: 'contrasto pieno, rossi chiari e blu scuri' },
  { id: 'teal-e-orange', nome: 'Teal & orange', info: 'ombre verde-azzurro, pelle e luci arancio' },
];

const file = import.meta.glob('../assets/lut/*.cube', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const lette = new Map<string, Promise<RisorsaLut>>();

/** La LUT pronta da mettere nel progetto (stesso id di chi carica lo stesso file a mano: una sola copia). */
export function caricaLutDiPartenza(id: string): Promise<RisorsaLut> {
  let p = lette.get(id);
  if (!p) {
    const voce = LUT_DI_PARTENZA.find((l) => l.id === id), apri = file[`../assets/lut/${id}.cube`];
    p = voce && apri ? apri().then((t) => lutDaTesto(t, voce.nome)) : Promise.reject(new Error('Questa LUT di partenza non c\'è'));
    p.catch(() => lette.delete(id));
    lette.set(id, p);
  }
  return p;
}

/** Una scena di prova (cielo, pelle, erba, grigi) per vedere cosa fa una LUT prima di sceglierla: w×h pixel RGB 0..1. */
export function scenaDiProva(w: number, h: number): number[][] {
  const px: number[][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1);
    if (v > 0.8) { px.push([u, u, u]); continue; }
    const fascia = Math.min(3, Math.floor(u * 4)), l = 1 - v / 0.8 * 0.75;
    const base = [[0.35, 0.55, 0.95], [0.86, 0.62, 0.5], [0.3, 0.7, 0.3], [0.9, 0.35, 0.3]][fascia];
    px.push(base.map((c) => Math.min(1, c * l * 1.15)));
  }
  return px;
}

/** I pixel della scena passati dalla LUT (a intensità piena). */
export const applicaAScena = (lut: RisorsaLut, scena: number[][]): number[][] => scena.map((p) => campionaLut(lut, p, 1));
