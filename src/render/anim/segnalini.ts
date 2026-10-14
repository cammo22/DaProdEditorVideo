// I segnalini che seguono un oggetto: mirino, cerchio, freccia, etichetta, nome, onde e faro. Sono disegnati attorno al
// centro del quadro; quando la clip "segue" una ripresa tracciata (Proprietà → Segui un oggetto) il centro va a finire
// sull'oggetto e il segnalino lo accompagna per tutta la ripresa. Come ogni animazione sono una funzione del tempo.
import { E, Q, accorcia, clamp01, col, hexA, larg, lerp, num, prog, resta, rettTondo, scrivi, sopra, tx } from './base';

const gr = (q: Q) => num(q, 'dim', 100) / 100;
/** entra con un piccolo rimbalzo e nell'ultimo istante esce */
const vita = (q: Q) => ({ ent: prog(q.t, 0.05, 0.55, E.back(2)), u: resta(q, 0.35), al: clamp01(prog(q.t, 0.05, 0.3, E.lineare)) * resta(q, 0.35) });

/** 1) Mirino: quattro angoli e una piccola croce, che si stringono sull'oggetto */
function mirino(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#35e8ff'), sp = num(q, 'spessore', 6);
  const { ent, al } = vita(q);
  const lato = 150 * s * lerp(1.9, 1, Math.min(1.1, ent)) * (1 + 0.04 * Math.sin(q.t * 3.2));
  const br = 46 * s, cx = q.w / 2, cy = q.h / 2;
  c.save();
  c.globalAlpha = al;
  c.strokeStyle = colore; c.lineWidth = sp; c.lineCap = 'round'; c.lineJoin = 'round';
  c.shadowColor = hexA(colore, 0.85); c.shadowBlur = 16;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx + sx * lato, y = cy + sy * lato;
    c.beginPath(); c.moveTo(x - sx * br, y); c.lineTo(x, y); c.lineTo(x, y - sy * br); c.stroke();
  }
  c.lineWidth = Math.max(2, sp * 0.6);
  c.beginPath(); c.moveTo(cx - 16 * s, cy); c.lineTo(cx + 16 * s, cy); c.moveTo(cx, cy - 16 * s); c.lineTo(cx, cy + 16 * s); c.stroke();
  c.restore();
}

/** 2) Cerchio: un anello tratteggiato che gira e pulsa */
function cerchio(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ffd23f'), sp = num(q, 'spessore', 6);
  const { ent, al } = vita(q);
  const R = 130 * s * lerp(1.7, 1, Math.min(1.1, ent)) * (1 + 0.035 * Math.sin(q.t * 4));
  const cx = q.w / 2, cy = q.h / 2;
  c.save();
  c.globalAlpha = al;
  c.strokeStyle = colore; c.lineWidth = sp; c.lineCap = 'round';
  c.shadowColor = hexA(colore, 0.8); c.shadowBlur = 18;
  if (q.v.tratteggio !== false) {
    const per = 2 * Math.PI * R, tratto = per / 16;
    c.setLineDash([tratto * 0.62, tratto * 0.38]);
    c.lineDashOffset = -q.t * 60 * s;
  }
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.restore();
}

/** 3) Freccia: indica l'oggetto da una parte e ondeggia */
function freccia(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ff4d6d');
  const { ent, al } = vita(q);
  const dir = String(q.v.da ?? 'su');
  const ang = { su: Math.PI / 2, giu: -Math.PI / 2, sinistra: 0, destra: Math.PI, 'su-sinistra': Math.PI / 4, 'su-destra': (3 * Math.PI) / 4 }[dir] ?? Math.PI / 2;
  // la freccia sta lontana dall'oggetto e si avvicina (poi rimbalza piano)
  const dist = (150 * s + 14 * Math.sin(q.t * 5)) * lerp(1.8, 1, Math.min(1.1, ent));
  const cx = q.w / 2 + Math.cos(ang) * dist, cy = q.h / 2 + Math.sin(ang) * dist;
  const L = 120 * s, W = 46 * s;
  c.save();
  c.globalAlpha = al;
  c.translate(cx, cy); c.rotate(ang + Math.PI);
  // la punta verso l'oggetto (in basso a destra nel disegno, poi girata)
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 16; c.shadowOffsetY = 4;
  c.fillStyle = colore;
  c.beginPath();
  c.moveTo(L / 2, 0); c.lineTo(L / 2 - W, -W); c.lineTo(L / 2 - W, -W * 0.38); c.lineTo(-L / 2, -W * 0.38);
  c.lineTo(-L / 2, W * 0.38); c.lineTo(L / 2 - W, W * 0.38); c.lineTo(L / 2 - W, W); c.closePath();
  c.fill();
  c.lineWidth = 4 * s; c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineJoin = 'round'; c.shadowColor = 'transparent'; c.stroke();
  c.restore();
}

/** 4) Etichetta: un punto sull'oggetto, una linea e la targhetta col testo */
function etichetta(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ffffff'), testo = tx(q, 'testo', 'Qui');
  const { ent, al } = vita(q);
  const dir = String(q.v.verso ?? 'su-destra');
  const dx = dir.includes('sinistra') ? -1 : 1, dy = dir.startsWith('giu') ? 1 : -1;
  const cx = q.w / 2, cy = q.h / 2;
  const font = `700 ${34 * s}px "Montserrat", sans-serif`;
  const t = accorcia(c, testo, font, 520 * s);
  const w = larg(c, t, font) + 48 * s, h = 62 * s;
  const lunga = 120 * s * Math.min(1, ent);
  const px = cx + dx * lunga * 0.9, py = cy + dy * lunga;
  c.save();
  c.globalAlpha = al;
  // il punto che pulsa sull'oggetto
  c.fillStyle = colore; c.shadowColor = hexA(colore, 0.9); c.shadowBlur = 14;
  c.beginPath(); c.arc(cx, cy, 9 * s, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3 * s; c.strokeStyle = hexA(colore, 0.55);
  c.beginPath(); c.arc(cx, cy, (16 + 8 * (0.5 + 0.5 * Math.sin(q.t * 4))) * s, 0, Math.PI * 2); c.stroke();
  // la linea e la targhetta
  c.shadowColor = 'transparent'; c.strokeStyle = colore; c.lineWidth = 3.5 * s;
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(px, py); c.lineTo(px + dx * 24 * s, py); c.stroke();
  const bx = dx > 0 ? px + 24 * s : px - 24 * s - w;
  c.save(); c.globalAlpha *= ent > 0.7 ? 1 : ent / 0.7;
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 20; c.shadowOffsetY = 6;
  rettTondo(c, bx, py - h / 2, w, h, h / 2); c.fillStyle = '#14151b'; c.fill();
  c.shadowColor = 'transparent'; c.lineWidth = 3 * s; c.strokeStyle = colore; c.stroke();
  scrivi(c, t, bx + w / 2, py + 2 * s, { font, colore: '#fff', align: 'center', base: 'middle' });
  c.restore();
  c.restore();
}

/** 5) Nome sopra: la targhetta con una piccola punta che indica l'oggetto, come le scritte dello sport */
function nome(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ff2d6f'), testo = tx(q, 'testo', 'Marco');
  const { ent, al } = vita(q);
  const font = `800 ${40 * s}px "Montserrat", sans-serif`;
  const t = accorcia(c, testo, font, 560 * s);
  const w = larg(c, t, font) + 56 * s, h = 70 * s;
  const cx = q.w / 2, base = q.h / 2 - 120 * s - (1 - Math.min(1, ent)) * 40 * s + 4 * Math.sin(q.t * 3) * s;
  c.save();
  c.globalAlpha = al;
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 20; c.shadowOffsetY = 6;
  c.fillStyle = colore;
  rettTondo(c, cx - w / 2, base - h, w, h, 14 * s); c.fill();
  c.beginPath(); c.moveTo(cx - 18 * s, base - 2); c.lineTo(cx + 18 * s, base - 2); c.lineTo(cx, base + 26 * s); c.closePath(); c.fill();
  c.shadowColor = 'transparent';
  scrivi(c, t, cx, base - h / 2 + 2 * s, { font, colore: sopra(colore), align: 'center', base: 'middle' });
  c.restore();
}

/** 6) Onde: cerchi che si allargano dall'oggetto, come un segnale */
function onde(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#35e8ff'), sp = num(q, 'spessore', 5);
  const { al } = vita(q);
  const cx = q.w / 2, cy = q.h / 2;
  c.save();
  c.lineWidth = sp;
  for (let i = 0; i < 3; i++) {
    const ph = (((q.t * 0.7 + i / 3) % 1) + 1) % 1;
    c.globalAlpha = al * (1 - ph) * 0.9;
    c.strokeStyle = colore; c.shadowColor = hexA(colore, 0.7); c.shadowBlur = 14;
    c.beginPath(); c.arc(cx, cy, (24 + 190 * ph) * s, 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = al; c.shadowBlur = 0; c.fillStyle = colore;
  c.beginPath(); c.arc(cx, cy, 8 * s, 0, Math.PI * 2); c.fill();
  c.restore();
}

export const SEGNALINI: Record<string, (q: Q) => void> = {
  'sg-mirino': mirino, 'sg-cerchio': cerchio, 'sg-freccia': freccia, 'sg-etichetta': etichetta, 'sg-nome': nome, 'sg-onde': onde,
};
