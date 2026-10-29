// Genera le LUT di partenza di DaProd Video (file .cube 3D, 17 punti per lato) in src/assets/lut/.
// Sono nostre: nate da formule semplici scritte qui sotto, senza copiare nessuna LUT di altri. Stessa licenza del progetto (MIT).
//   node scripts/genera-lut.mjs
// Lavorano su immagini SDR (Rec.709, già con la gamma): nessuna conversione da log.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uscita = path.join(radice, 'src/assets/lut');
export const PUNTI = 17;

const lim = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const passo = (x) => x * x * (3 - 2 * x);
/** curva a S morbida: k=0 non fa niente, k=1 è un contrasto deciso */
const curvaS = (x, k) => mix(x, passo(lim(x)), k);
/** satura (k>1) o desatura (k<1) rispetto al grigio della luce */
const satura = (c, k) => { const y = luma(c); return c.map((v) => y + (v - y) * k); };
const colorato = (c, ombre, luci, forza = 1) => {
  const y = luma(c), o = (1 - passo(lim(y * 1.4))) * forza, l = passo(lim((y - 0.35) / 0.65)) * forza;
  return c.map((v, i) => v + ombre[i] * o + luci[i] * l);
};

export const LUT = [
  {
    file: 'caldo', nome: 'Caldo', info: 'ambra morbida, pelle dorata',
    f: (c) => satura(colorato(c.map((v) => curvaS(v, 0.25)), [0.012, 0.0, -0.02], [0.05, 0.02, -0.05]).map((v, i) => v * [1.03, 1.0, 0.94][i]), 1.06),
  },
  {
    file: 'freddo', nome: 'Freddo', info: 'azzurro pulito, aria d\'inverno',
    f: (c) => satura(colorato(c.map((v) => curvaS(v, 0.2)), [-0.01, 0.0, 0.025], [-0.03, 0.0, 0.05]).map((v, i) => v * [0.95, 1.0, 1.04][i]), 0.96),
  },
  {
    file: 'pellicola-anni-70', nome: 'Pellicola anni 70', info: 'neri alzati, verde giallino, colori un po\' spenti',
    f: (c) => {
      let o = satura(c, 0.82).map((v) => curvaS(v, 0.3));
      o = colorato(o, [0.02, 0.035, -0.01], [0.045, 0.02, -0.03]);
      return o.map((v, i) => mix(0.045 + [0.01, 0.02, 0.0][i], 0.965 - [0.0, 0.01, 0.03][i], lim(v)));
    },
  },
  {
    file: 'bianco-e-nero-ricco', nome: 'Bianco e nero ricco', info: 'contrasto pieno, rossi chiari e blu scuri',
    f: (c) => {
      const y = lim(0.34 * c[0] + 0.52 * c[1] + 0.14 * c[2]);
      const v = curvaS(curvaS(y, 0.8), 0.35);
      return [v, v, v];
    },
  },
  {
    file: 'teal-e-orange', nome: 'Teal & orange', info: 'ombre verde-azzurro, pelle e luci arancio',
    f: (c) => {
      const y = luma(c), ombre = 1 - passo(lim(y * 1.6)), luci = passo(lim((y - 0.3) / 0.7));
      const teal = [0.0, 0.42, 0.5], arancio = [1.0, 0.58, 0.2];
      let o = c.map((v) => curvaS(v, 0.3));
      o = o.map((v, i) => mix(v, v * 0.7 + teal[i] * 0.3 * (0.4 + y), ombre * 0.55));
      o = o.map((v, i) => mix(v, v * 0.75 + arancio[i] * 0.25 * (0.5 + y), luci * 0.5));
      return satura(o, 1.12);
    },
  },
];

export function testoCube(l) {
  const righe = ['# DaProd Video · LUT di partenza, create da noi (licenza MIT, come il progetto).', '# Generata da scripts/genera-lut.mjs: non si modifica a mano.',
    `TITLE "${l.nome}"`, `LUT_3D_SIZE ${PUNTI}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
  // il rosso corre più veloce, poi il verde, poi il blu (come vuole il formato .cube)
  for (let b = 0; b < PUNTI; b++) for (let g = 0; g < PUNTI; g++) for (let r = 0; r < PUNTI; r++) {
    const o = l.f([r / (PUNTI - 1), g / (PUNTI - 1), b / (PUNTI - 1)]).map((v) => lim(v).toFixed(5));
    righe.push(o.join(' '));
  }
  return righe.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(uscita, { recursive: true });
  for (const l of LUT) writeFileSync(path.join(uscita, l.file + '.cube'), testoCube(l));
  console.log(`Scritte ${LUT.length} LUT in ${uscita}`);
}
