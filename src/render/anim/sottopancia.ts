// I sottopancia: nome e ruolo in undici modi. Nati dai blocchi "lt-*" di HyperFrames (HeyGen, Apache-2.0): stessi
// tempi di entrata e di uscita, ridisegnati qui in 2D. Ognuno entra subito, resta, e nell'ultimo mezzo secondo esce.
import { E, FONT, Q, chiaro, conAdatta, hexA, larg, prog, rettTondo, scrivi, sopra, ancora, col, num, tx } from './base';

const BASSO = 112;

/** misure comuni: la grandezza scelta e il testo */
function dati(q: Q) {
  const k = num(q, 'dim', 100) / 100;
  return { k, nome: tx(q, 'nome', 'Nome Cognome'), ruolo: tx(q, 'ruolo', ''), colore: col(q, 'colore', '#ff5a36') };
}
/** l'uscita: 0 = ancora lì, 1 = andata (nell'ultimo "d" secondi) */
const usc = (q: Q, d = 0.45, e = E.p3in) => prog(q.t, q.d - d, d, e);

/** 1) Barra pulita */
function barra(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `700 ${52 * k}px ${FONT.montserrat}`, fR = `400 ${27 * k}px ${FONT.montserrat}`;
  const nw = larg(c, nome, fN), rw = ruolo ? larg(c, ruolo, fR) : 0;
  const tab = 12 * k, padL = 30 * k, padR = 40 * k, padT = 22 * k;
  const hN = 52 * k * 1.06, hR = ruolo ? 27 * k * 1.2 : 0, gap = ruolo ? 7 * k : 0;
  const w = tab + padL + Math.max(nw, rw) + padR, h = padT + hN + gap + hR + 24 * k;
  const x = ancora(q, w), y = q.h - BASSO - h;
  c.save();
  const ent = prog(q.t, 0.1, 0.55, E.p4out), sal = usc(q);
  // la scheda si scopre da sinistra, ed esce scoprendosi da destra
  c.beginPath();
  c.rect(x - 40 + (w + 80) * sal, y - 40, (w + 80) * (ent - sal) + 0.01, h + 80);
  c.clip();
  c.shadowColor = 'rgba(15,17,21,.22)'; c.shadowBlur = 44 * k; c.shadowOffsetY = 14 * k;
  rettTondo(c, x, y, w, h, 16 * k);
  c.fillStyle = '#ffffff'; c.fill();
  c.shadowColor = 'transparent';
  c.save(); rettTondo(c, x, y, w, h, 16 * k); c.clip(); c.fillStyle = colore; c.fillRect(x, y, tab, h); c.restore();
  const a = prog(q.t, 0.3, 0.4, E.p2out) * (1 - sal);
  scrivi(c, nome, x + tab + padL, y + padT, { font: fN, colore: '#0f1115', base: 'top', alfa: a });
  if (ruolo) scrivi(c, ruolo, x + tab + padL, y + padT + hN + gap, { font: fR, colore: '#5a6170', base: 'top', alfa: a });
  c.restore();
}

/** 2) Sottolineatura */
function sottolinea(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `700 ${76 * k}px ${FONT.oswald}`, fR = `400 ${28 * k}px ${FONT.mono}`;
  const nm = nome.toUpperCase();
  const nw = larg(c, nm, fN, 0.4 * k), rw = ruolo ? larg(c, ruolo, fR, 1.1 * k) : 0;
  const w = Math.max(nw, rw), x = ancora(q, w, 130);
  const hN = 76 * k * 0.96, hR = 28 * k * 1.2;
  const ytop = q.h - 120 - (hN + 14 * k + 6 * k + (ruolo ? 14 * k + hR : 0));
  const tN = prog(q.t, 0.1, 0.55, E.p3out), tR = prog(q.t, 0.46, 0.5, E.p3out), tL = prog(q.t, 0.3, 0.5, E.p4out);
  const uN = usc(q, 0.32, E.p2in), uR = usc(q, 0.3, E.p2in), uL = usc(q, 0.3, E.p2in);
  scrivi(q.c, nm, x, ytop - 16 * k * uN + 28 * k * (1 - tN), { font: fN, colore: '#fff', base: 'top', spazio: 0.4 * k, alfa: tN * (1 - uN), ombra: { blur: 22, colore: 'rgba(0,0,0,.45)' } });
  const yr = ytop + hN + 14 * k;
  c.fillStyle = colore;
  rettTondo(c, x, yr, Math.max(0, w * tL * (1 - uL)), 6 * k, 3 * k); c.fill();
  if (ruolo) scrivi(c, ruolo, x, yr + 6 * k + 14 * k + 16 * k * (1 - tR), { font: fR, colore: '#e7eaf0', base: 'top', spazio: 1.1 * k, alfa: tR * (1 - uR), ombra: { blur: 16, colore: 'rgba(0,0,0,.45)' } });
}

/** 3) Blocco con etichetta */
function blocco(q: Q) {
  const { c } = q;
  const { k, nome, colore } = dati(q);
  const tag = tx(q, 'etichetta', 'Ospite');
  const fN = `400 ${58 * k}px ${FONT.archivo}`, fT = `700 ${24 * k}px ${FONT.mono}`;
  const nm = nome.toUpperCase(), tg = tag.toUpperCase();
  const nw = larg(c, nm, fN), tw = larg(c, tg, fT, 1.4 * k) + 32 * k;
  const padL = 30 * k, padR = 34 * k, padT = 18 * k, padB = 22 * k;
  const hN = 58 * k * 0.98, hT = 24 * k * 1.2 + 14 * k, gap = 12 * k;
  const w = padL + Math.max(nw, tw) + padR, h = padT + hN + gap + hT + padB;
  const x = ancora(q, w, 120), y = q.h - 116 - h;
  const ent = prog(q.t, 0.1, 0.5, E.p4out), sal = usc(q, 0.4);
  c.save();
  c.beginPath(); c.rect(x - 4 + (w + 8) * sal, y - 4, (w + 8) * (ent - sal) + 0.01, h + 8); c.clip();
  c.fillStyle = '#141518'; c.fillRect(x, y, w, h);
  const tN = prog(q.t, 0.26, 0.42, E.back(1.6));
  scrivi(c, nm, x + padL, y + padT + 30 * k * (1 - tN), { font: fN, colore: '#fff', base: 'top', alfa: prog(q.t, 0.26, 0.3, E.p2out) });
  // l'etichetta sale da sotto dentro la sua finestra
  const ty = y + padT + hN + gap;
  c.save(); c.beginPath(); c.rect(x + padL, ty, tw, hT); c.clip();
  const tT = prog(q.t, 0.5, 0.45, E.back(2));
  c.fillStyle = colore; c.fillRect(x + padL, ty + 40 * k * (1 - tT), tw, hT);
  scrivi(c, tg, x + padL + 16 * k, ty + 7 * k + 40 * k * (1 - tT), { font: fT, colore: sopra(colore), base: 'top', spazio: 1.4 * k });
  c.restore();
  c.restore();
}

/** 4) Blocco colore */
function coloreBlocco(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `400 ${84 * k}px ${FONT.bebas}`, fR = `400 ${24 * k}px ${FONT.mono}`;
  const nm = nome.toUpperCase();
  const nw = larg(c, nm, fN, 0.8 * k), rw = ruolo ? larg(c, ruolo, fR, 1.2 * k) : 0;
  const padL = 32 * k, padR = 36 * k, padT = 20 * k, padB = 24 * k;
  const hN = 84 * k * 0.86, hR = ruolo ? 24 * k * 1.2 : 0, gap = ruolo ? 8 * k : 0;
  const w = padL + Math.max(nw, rw) + padR, h = padT + hN + gap + hR + padB;
  const x = ancora(q, w), y = q.h - 116 - h;
  const ent = prog(q.t, 0.1, 0.5, E.back(1.4)), sal = usc(q, 0.35, E.p2in);
  const alfa = prog(q.t, 0.1, 0.25, E.lineare) * (1 - sal);
  const dx = -80 * (1 - ent) - 60 * sal;
  c.save(); c.translate(dx, 0); c.globalAlpha = alfa;
  c.shadowColor = hexA(colore, 0.34); c.shadowBlur = 44 * k; c.shadowOffsetY = 16 * k;
  c.fillStyle = colore; c.fillRect(x, y, w, h);
  c.shadowColor = 'transparent';
  const fg = sopra(colore);
  scrivi(c, nm, x + padL, y + padT + 24 * k * (1 - prog(q.t, 0.3, 0.42, E.p3out)), { font: fN, colore: fg, base: 'top', spazio: 0.8 * k, alfa: prog(q.t, 0.3, 0.3, E.p2out) });
  if (ruolo) scrivi(c, ruolo, x + padL, y + padT + hN + gap + 18 * k * (1 - prog(q.t, 0.4, 0.42, E.p3out)), { font: fR, colore: fg === '#ffffff' ? 'rgba(255,255,255,.86)' : 'rgba(20,21,24,.8)', base: 'top', spazio: 1.2 * k, alfa: prog(q.t, 0.4, 0.3, E.p2out) });
  c.restore();
}

/** 5) Scheda scura */
function scheda(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `700 ${48 * k}px ${FONT.montserrat}`, fR = `400 ${25 * k}px ${FONT.montserrat}`;
  const nw = larg(c, nome, fN), rw = ruolo ? larg(c, ruolo, fR, 0.5 * k) : 0;
  const padL = 32 * k, padR = 38 * k, padT = 24 * k, padB = 26 * k;
  const hN = 48 * k * 1.02, hR = ruolo ? 25 * k * 1.2 : 0, gap = 12 * k;
  const w = padL + Math.max(nw, rw) + padR, h = padT + hN + gap + 4 * k + (ruolo ? gap + hR : 0) + padB;
  const x = ancora(q, w, 120), y0 = q.h - 110 - h;
  const ent = prog(q.t, 0.1, 0.5, E.p3out), sal = usc(q, 0.35, E.p2in);
  c.save();
  c.translate(0, 60 * (1 - ent) + 24 * sal); c.globalAlpha = ent * (1 - sal);
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 50 * k; c.shadowOffsetY = 18 * k;
  rettTondo(c, x, y0, w, h, 14 * k); c.fillStyle = '#16181d'; c.fill();
  c.shadowColor = 'transparent';
  scrivi(c, nome, x + padL, y0 + padT + 14 * (1 - prog(q.t, 0.26, 0.45, E.p3out)), { font: fN, colore: '#fff', base: 'top', alfa: prog(q.t, 0.26, 0.3, E.p2out) });
  const yl = y0 + padT + hN + gap;
  c.fillStyle = colore; rettTondo(c, x + padL, yl, (w - padL - padR) * prog(q.t, 0.42, 0.5, E.p4out), 4 * k, 2 * k); c.fill();
  if (ruolo) scrivi(c, ruolo, x + padL, yl + 4 * k + gap, { font: fR, colore: '#aeb6c2', base: 'top', spazio: 0.5 * k, alfa: prog(q.t, 0.56, 0.45, E.p2out) });
  c.restore();
}

/** 6) Etichetta e nome */
function kicker(q: Q) {
  const { c } = q;
  const { k, nome, colore } = dati(q);
  const tag = tx(q, 'etichetta', 'In studio').toUpperCase();
  const fK = `700 ${22 * k}px ${FONT.mono}`, fN = `400 ${70 * k}px ${FONT.archivo}`;
  const nm = nome.toUpperCase();
  const kw = larg(c, tag, fK, 2.2 * k) + 28 * k, kh = 22 * k * 1.2 + 12 * k;
  const nw = larg(c, nm, fN, -1 * k);
  const w = Math.max(kw, nw), hN = 70 * k * 0.98;
  const x = ancora(q, w, 130), ybase = q.h - 122;
  const yb = ybase - 5 * k, yn = yb - 14 * k - hN, yk = yn - 14 * k - kh;
  const tK = prog(q.t, 0.1, 0.42, E.back(2)), tN = prog(q.t, 0.32, 0.45, E.back(1.5)), tB = prog(q.t, 0.5, 0.5, E.p4out);
  const uK = usc(q, 0.3, E.p2in), uN = usc(q, 0.32, E.p2in), uB = usc(q, 0.3, E.p2in);
  c.save(); c.beginPath(); c.rect(x - 4, yk - 4, kw + 8, kh + 8); c.clip();
  c.fillStyle = colore; c.fillRect(x, yk - 40 * k * (1 - tK) - 40 * k * uK, kw, kh);
  scrivi(c, tag, x + 14 * k, yk + 6 * k - 40 * k * (1 - tK) - 40 * k * uK, { font: fK, colore: sopra(colore), base: 'top', spazio: 2.2 * k });
  c.restore();
  scrivi(c, nm, x, yn + 34 * k * (1 - tN) - 16 * k * uN, { font: fN, colore: '#fff', base: 'top', spazio: -1 * k, alfa: Math.min(1, tN * 1.4) * (1 - uN), ombra: { blur: 22, colore: 'rgba(0,0,0,.5)' } });
  c.fillStyle = colore; rettTondo(c, x, yb, w * tB * (1 - uB), 5 * k, 3 * k); c.fill();
}

/** 7) Scoperta a barra */
function maschera(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `900 ${72 * k}px ${FONT.montserrat}`, fR = `500 ${28 * k}px ${FONT.montserrat}`;
  const nw = larg(c, nome, fN, -1.4 * k), rw = ruolo ? larg(c, ruolo, fR, 0.5 * k) : 0;
  const w = Math.max(nw, rw), x = ancora(q, w, 130);
  const hN = 72 * k * 1.06, hR = 28 * k * 1.2;
  const ytop = q.h - 122 - (hN + (ruolo ? 14 * k + hR : 0));
  const rev = prog(q.t, 0.16, 0.5, E.p2io), barra = prog(q.t, 0.12, 0.55, E.p2io);
  const sal = usc(q, 0.4, E.p2in);
  c.save();
  c.beginPath(); c.rect(x - 6 + (nw + 12) * sal, ytop - 4, (nw + 12) * (rev - sal) + 0.01, hN + 8); c.clip();
  scrivi(c, nome, x, ytop, { font: fN, colore: '#fff', base: 'top', spazio: -1.4 * k, ombra: { blur: 22, colore: 'rgba(0,0,0,.45)' } });
  c.restore();
  // la barra che scopre il nome
  const bx = x + nw * barra, aB = (1 - prog(q.t, 0.6, 0.15, E.lineare)) * prog(q.t, 0.1, 0.12, E.lineare);
  if (aB > 0.01 && sal === 0) { c.fillStyle = hexA(colore, aB); c.fillRect(bx, ytop - 2, 8 * k, hN + 4); }
  if (ruolo) scrivi(c, ruolo, x, ytop + hN + 14 * k + 14 * k * (1 - prog(q.t, 0.55, 0.5, E.p3out)), { font: fR, colore: '#e7eaf0', base: 'top', spazio: 0.5 * k, alfa: prog(q.t, 0.55, 0.4, E.p2out) * (1 - usc(q, 0.3, E.p2in)), ombra: { blur: 16, colore: 'rgba(0,0,0,.45)' } });
}

/** 8) Bordo neon */
function neon(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `700 ${46 * k}px ${FONT.montserrat}`, fR = `500 ${25 * k}px ${FONT.montserrat}`;
  const nw = larg(c, nome, fN), rw = ruolo ? larg(c, ruolo, fR, 0.8 * k) : 0;
  const padX = 38 * k, padY = 26 * k;
  const hN = 46 * k * 1.05, hR = ruolo ? 25 * k * 1.2 : 0, gap = ruolo ? 8 * k : 0;
  const w = padX * 2 + Math.max(nw, rw), h = padY * 2 + hN + gap + hR;
  const x = ancora(q, w, 120), y = q.h - 120 - h;
  const sal = usc(q, 0.36, E.p2in);
  const ent = prog(q.t, 0.08, 0.55, E.p3out);
  const draw = prog(q.t, 0.08, 0.8, E.p3io);
  c.save();
  c.globalAlpha = ent * (1 - sal);
  c.translate(x, y + h); c.scale(0.965 + 0.035 * ent, 0.965 + 0.035 * ent); c.translate(-x, -(y + h));
  rettTondo(c, x, y, w, h, 18 * k); c.fillStyle = 'rgba(8,10,20,.72)'; c.fill();
  // il bordo che si disegna: una linea tratteggiata lunga quanto il perimetro
  const per = 2 * (w + h);
  c.setLineDash([per * draw, per]); c.lineDashOffset = 0;
  c.lineWidth = 3 * k; c.strokeStyle = colore; c.shadowColor = colore; c.shadowBlur = 26 * k;
  rettTondo(c, x, y, w, h, 18 * k); c.stroke(); c.stroke();
  c.setLineDash([]); c.shadowColor = 'transparent';
  scrivi(c, nome, x + padX, y + padY + 18 * (1 - prog(q.t, 0.3, 0.5, E.p3out)), { font: fN, colore: '#fff', base: 'top', alfa: prog(q.t, 0.3, 0.35, E.p2out) });
  if (ruolo) scrivi(c, ruolo, x + padX, y + padY + hN + gap + 12 * (1 - prog(q.t, 0.44, 0.5, E.p3out)), { font: fR, colore: chiaro(colore, 0.2), base: 'top', spazio: 0.8 * k, alfa: prog(q.t, 0.44, 0.35, E.p2out), ombra: { blur: 14 * k, colore: hexA(colore, 0.8), y: 0 } });
  c.restore();
}

/** 9) Linea laterale */
function linea(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `400 ${92 * k}px ${FONT.bebas}`, fR = `400 ${26 * k}px ${FONT.mono}`;
  const nm = nome.toUpperCase();
  const nw = larg(c, nm, fN, 0.9 * k), rw = ruolo ? larg(c, ruolo, fR, 1 * k) : 0;
  const hN = 92 * k * 0.86, hR = ruolo ? 26 * k * 1.2 : 0, gap = ruolo ? 12 * k : 0;
  const hh = hN + gap + hR;
  const w = 8 * k + 26 * k + Math.max(nw, rw), x = ancora(q, w, 130), y = q.h - 120 - hh;
  const tB = prog(q.t, 0.1, 0.5, E.p3out), uB = usc(q, 0.32, E.p2in);
  c.fillStyle = colore; rettTondo(c, x, y, 8 * k, hh * tB * (1 - uB), 4 * k); c.fill();
  const tN = prog(q.t, 0.26, 0.5, E.p3out), tR = prog(q.t, 0.38, 0.5, E.p3out);
  scrivi(c, nm, x + 34 * k - 24 * (1 - tN), y - 4 * k - 14 * usc(q, 0.32, E.p2in), { font: fN, colore: '#fff', base: 'top', spazio: 0.9 * k, alfa: tN * (1 - usc(q, 0.32, E.p2in)), ombra: { blur: 22, colore: 'rgba(0,0,0,.5)' } });
  if (ruolo) scrivi(c, ruolo, x + 34 * k - 24 * (1 - tR), y + hN + gap, { font: fR, colore: '#e7eaf0', base: 'top', spazio: 1 * k, alfa: tR * (1 - usc(q, 0.3, E.p2in)), ombra: { blur: 16, colore: 'rgba(0,0,0,.5)' } });
}

/** 10) Pillola */
function pillola(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `700 ${46 * k}px ${FONT.montserrat}`, fR = `400 ${25 * k}px ${FONT.montserrat}`;
  const nw = larg(c, nome, fN), rw = ruolo ? larg(c, ruolo, fR) : 0;
  const hN = 46 * k * 1.04, hR = ruolo ? 25 * k * 1.2 : 0, gap = ruolo ? 4 * k : 0;
  const padL = 26 * k, padR = 40 * k, padY = 20 * k, dot = 18 * k, gp = 22 * k;
  const w = padL + dot + gp + Math.max(nw, rw) + padR, h = padY * 2 + hN + gap + hR;
  const x = ancora(q, w), y = q.h - 120 - h;
  const ent = prog(q.t, 0.1, 0.55, E.back(1.7)), sal = usc(q, 0.35, E.p2in);
  c.save();
  const sc = (0.88 + 0.12 * ent) * (1 - 0.06 * sal);
  c.translate(x, y + h); c.scale(sc, sc); c.translate(-x, -(y + h));
  c.globalAlpha = Math.min(1, ent * 1.5) * (1 - sal);
  c.translate(0, 18 * (1 - ent) + 14 * sal);
  c.shadowColor = 'rgba(15,17,21,.24)'; c.shadowBlur = 46 * k; c.shadowOffsetY = 16 * k;
  rettTondo(c, x, y, w, h, h / 2); c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
  const dp = prog(q.t, 0.4, 0.4, E.back(3));
  c.fillStyle = colore; c.beginPath(); c.arc(x + padL + dot / 2, y + h / 2, (dot / 2) * dp, 0, Math.PI * 2); c.fill();
  const tx0 = x + padL + dot + gp;
  scrivi(c, nome, tx0 - 10 * (1 - prog(q.t, 0.42, 0.45, E.p3out)), y + padY, { font: fN, colore: '#0f1115', base: 'top', alfa: prog(q.t, 0.42, 0.3, E.p2out) });
  if (ruolo) scrivi(c, ruolo, tx0 - 10 * (1 - prog(q.t, 0.5, 0.45, E.p3out)), y + padY + hN + gap, { font: fR, colore: '#5a6170', base: 'top', alfa: prog(q.t, 0.5, 0.3, E.p2out) });
  c.restore();
}

/** 11) Barre impilate */
function barre(q: Q) {
  const { c } = q;
  const { k, nome, ruolo, colore } = dati(q);
  const fN = `400 ${52 * k}px ${FONT.archivo}`, fR = `700 ${23 * k}px ${FONT.mono}`;
  const nm = nome.toUpperCase(), rl = ruolo.toUpperCase();
  const nw = larg(c, nm, fN, -0.8 * k) + 60 * k, rw = ruolo ? larg(c, rl, fR, 1.4 * k) + 44 * k : 0;
  const hN = 52 * k + 28 * k, hR = 23 * k + 18 * k, gap = 8 * k, off = 14 * k;
  const w = Math.max(nw, rw + off), x = ancora(q, w, 120), y = q.h - 116 - (hN + (ruolo ? gap + hR : 0));
  const e1 = prog(q.t, 0.1, 0.5, E.p4out), e2 = prog(q.t, 0.34, 0.5, E.p4out);
  const s1 = usc(q, 0.36, E.p3in), s2 = usc(q, 0.32, E.p3in);
  // la barra del nome si apre da sinistra, quella del ruolo da destra
  c.save(); c.beginPath(); c.rect(x + nw * s1, y - 2, nw * (e1 - s1) + 0.01, hN + 4); c.clip();
  c.fillStyle = '#141518'; c.fillRect(x, y, nw, hN);
  scrivi(c, nm, x + 30 * k, y + 14 * k, { font: fN, colore: '#fff', base: 'top', spazio: -0.8 * k });
  c.restore();
  if (ruolo) {
    const rx = x + off;
    c.save(); c.beginPath(); c.rect(rx + rw * (1 - e2), y + hN + gap - 2, rw * (e2 - s2) + 0.01, hR + 4); c.clip();
    c.fillStyle = colore; c.fillRect(rx, y + hN + gap, rw, hR);
    scrivi(c, rl, rx + 22 * k, y + hN + gap + 9 * k, { font: fR, colore: sopra(colore), base: 'top', spazio: 1.4 * k });
    c.restore();
  }
}

/** ogni sottopancia si misura prima: se il nome o il ruolo sono lunghi, la scheda si rimpicciolisce invece di uscire dallo schermo */
export const SOTTOPANCIA: Record<string, (q: Q) => void> = Object.fromEntries(Object.entries({
  'lt-barra': barra, 'lt-sottolinea': sottolinea, 'lt-blocco': blocco, 'lt-colore': coloreBlocco, 'lt-scheda': scheda, 'lt-kicker': kicker,
  'lt-maschera': maschera, 'lt-neon': neon, 'lt-linea': linea, 'lt-pillola': pillola, 'lt-barre': barre,
}).map(([id, f]) => [id, conAdatta(f)]));
