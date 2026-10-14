// Il disegno delle animazioni del catalogo (src/core/animazioni.ts): una funzione del tempo che disegna su una tela
// trasparente alta come il progetto. La usano il compositore (monitor ed export), le anteprime del contenitore e le prove.
import type { AnimSpec } from '../core/tipi';
import { animazione, valoriDi } from '../core/animazioni';
import { nuovaTela } from './grafica';
import type { Ctx2D, Q } from './anim/base';
import { SOTTOPANCIA } from './anim/sottopancia';
import { TESTO } from './anim/testo';
import { DATI } from './anim/dati';
import { SOCIAL } from './anim/social';
import { SFONDI } from './anim/sfondi';
import { CERIMONIA } from './anim/cerimonia';

type Tela = HTMLCanvasElement | OffscreenCanvas;

/** id → come si disegna (ogni modulo del catalogo aggiunge le sue) */
export const DISEGNA: Record<string, (q: Q) => void> = {
  ...SOTTOPANCIA, ...TESTO, ...DATI, ...SOCIAL, ...SFONDI, ...CERIMONIA,
};

/** la larghezza virtuale (su 1080 di altezza) sotto cui si rimpicciolisce: 1500 ≈ un po' meno del 4:3 */
const LARGA_MIN = 1500;

const tele = new Map<string, Tela>();

/** la firma dei valori di una specifica (cambia quando cambi un testo o un colore: serve a ridisegnare) */
export const firmaAnim = (spec: AnimSpec) => spec.id + JSON.stringify(spec.v);

/**
 * Disegna l'animazione al tempo t (secondi dall'inizio della clip) su una tela W×H; d = durata della clip (secondi).
 * Le coordinate dentro sono "virtuali": alte 1080, larghe quanto serve al formato.
 */
export function disegnaAnimazione(spec: AnimSpec, W: number, H: number, t: number, d: number, tela?: Tela): Tela {
  const k = W + 'x' + H;
  let tl = tela ?? tele.get(k);
  if (!tl) { tl = nuovaTela(W, H); if (!tela) tele.set(k, tl); if (tele.size > 6) tele.delete(tele.keys().next().value!); }
  const c = tl.getContext('2d') as Ctx2D;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.shadowColor = 'transparent';
  c.clearRect(0, 0, W, H);
  const s = H / 1080;
  c.setTransform(s, 0, 0, s, 0, 0);
  const f = DISEGNA[spec.id];
  if (f && animazione(spec.id)) {
    c.save();
    // formati stretti (verticale, quadrato): le animazioni sono pensate per una tela larga almeno quanto il 4:3, così si
    // disegna su una tela virtuale più larga e poi si rimpicciolisce tutto insieme (niente scritte fuori dallo schermo)
    let w = W / s, h = 1080;
    if (w < LARGA_MIN) { const k = w / LARGA_MIN; c.scale(k, k); w = LARGA_MIN; h = 1080 / k; }
    try { f({ c, w, h, t: Math.max(0, t), d: Math.max(0.1, d), v: valoriDi(spec) }); } catch { /* un'animazione che si rompe lascia il fotogramma com'è */ }
    c.restore();
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  return tl;
}
