// Numeri e grafici: contatore, anello, barre, linea, barra di avanzamento. Idee da count-up, conic-progress-ring,
// animated-bar-chart e progress-stat di HyperFrames.
import { E, Q, adatta, clamp01, col, famiglia, hexA, larg, lerp, migliaia, num, prog, resta, rettTondo, scrivi, tx, chiaro } from './base';

const grande = (q: Q, base: number) => base * (num(q, 'dim', 100) / 100);

/** 1) Contatore */
function contatore(q: Q) {
  const { c } = q;
  const val = num(q, 'valore', 1250);
  const pre = String(q.v.prefisso ?? ''), suf = String(q.v.suffisso ?? '');
  const colore = col(q, 'colore', '#ffd23f');
  const fam = famiglia(q.v, 'font');
  const size = adatta(c, pre + migliaia(val) + suf, (px) => `700 ${px}px ${fam}`, grande(q, 240), q.w * 0.8);
  const fN = `700 ${size}px ${fam}`, fP = `700 ${size * 0.5}px ${fam}`;
  const k = prog(q.t, 0.3, 2.2, E.p3out);
  const n = val * k;
  const testo = migliaia(n);
  const wP = pre ? larg(c, pre, fP) + 8 : 0, wS = suf ? larg(c, suf, fP) + 8 : 0, wN = larg(c, testo, fN);
  // un colpo quando si ferma
  const arrivo = q.t - 2.5;
  const colpo = arrivo > 0 ? 1 + 0.07 * Math.exp(-arrivo * 7) * Math.cos(arrivo * 14) : 1;
  const u = resta(q, 0.45);
  const ent = prog(q.t, 0.05, 0.4, E.p3out);
  const tot = wP + wN + wS;
  c.save();
  c.globalAlpha = u * ent;
  c.translate(q.w / 2, q.h / 2 - size * 0.08); c.scale(colpo, colpo);
  const x0 = -tot / 2, yb = size * 0.34;
  if (pre) scrivi(c, pre, x0, yb - size * 0.02, { font: fP, colore: chiaro(colore, 0.2), ombra: { blur: 24, colore: 'rgba(0,0,0,.45)' } });
  scrivi(c, testo, x0 + wP, yb, { font: fN, colore, ombra: { blur: 30, colore: 'rgba(0,0,0,.5)', y: 4 } });
  if (suf) scrivi(c, suf, x0 + wP + wN + 8, yb - size * 0.02, { font: fP, colore: chiaro(colore, 0.2), ombra: { blur: 24, colore: 'rgba(0,0,0,.45)' } });
  c.restore();
  const et = tx(q, 'etichetta', '');
  if (et) {
    const fE = (px: number) => `500 ${px}px "Montserrat", sans-serif`;
    const pe = adatta(c, et.toUpperCase(), fE, size * 0.16, q.w * 0.84, size * 0.025);
    scrivi(c, et.toUpperCase(), q.w / 2, q.h / 2 + size * 0.38 + 10 * (1 - prog(q.t, 0.6, 0.5, E.p3out)), { font: fE(pe), colore: '#fff', align: 'center', base: 'top', spazio: size * 0.025, alfa: prog(q.t, 0.6, 0.5, E.p2out) * u * 0.9, ombra: { blur: 16, colore: 'rgba(0,0,0,.5)' } });
  }
}

/** 2) Anello */
function anello(q: Q) {
  const { c } = q;
  const pc = Math.max(0, Math.min(100, num(q, 'percento', 75)));
  const colore = col(q, 'colore', '#46e5b7');
  const R = grande(q, 210), lw = R * 0.16, fam = famiglia(q.v, 'font');
  const k = prog(q.t, 0.3, 2, E.p3out);
  const u = resta(q, 0.45), ent = prog(q.t, 0.05, 0.5, E.p3out);
  const cx = q.w / 2, cy = q.h / 2 - R * 0.05;
  c.save();
  c.globalAlpha = u * ent;
  c.lineWidth = lw; c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,.16)';
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = colore; c.shadowColor = colore; c.shadowBlur = 30;
  c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pc / 100) * k); c.stroke();
  c.shadowColor = 'transparent';
  scrivi(c, Math.round(pc * k) + '%', cx, cy + R * 0.03, { font: `700 ${R * 0.62}px ${fam}`, colore: '#fff', align: 'center', base: 'middle', ombra: { blur: 24, colore: 'rgba(0,0,0,.5)' } });
  const et = tx(q, 'etichetta', '');
  if (et) {
    const fE = (px: number) => `500 ${px}px "Montserrat", sans-serif`;
    const pe = adatta(c, et.toUpperCase(), fE, R * 0.14, R * 1.5, R * 0.02);
    scrivi(c, et.toUpperCase(), cx, cy + R * 0.5, { font: fE(pe), colore: 'rgba(255,255,255,.85)', align: 'center', base: 'middle', spazio: R * 0.02 });
  }
  c.restore();
}

/** 3) Grafico a barre */
function barreGr(q: Q) {
  const { c } = q;
  const colore = col(q, 'colore', '#35e8ff');
  const voci = String(q.v.voci ?? '').split('\n').map((r) => { const [n, v] = r.split(':'); return { n: (n ?? '').trim(), v: Math.max(0, Number((v ?? '0').replace(',', '.')) || 0) }; }).filter((x) => x.n).slice(0, 8);
  if (!voci.length) return;
  const max = Math.max(...voci.map((x) => x.v), 1);
  const size = grande(q, 100), fam = famiglia(q.v, 'font');
  const W = Math.min(q.w * 0.7, 1300) * (size / 100), x0 = (q.w - W) / 2;
  const rh = Math.min(96, 560 / voci.length) * (size / 100), gap = rh * 0.28;
  const titolo = tx(q, 'titolo', '');
  const hTot = voci.length * rh + (voci.length - 1) * gap + (titolo ? size * 0.9 : 0);
  let y = (q.h - hTot) / 2;
  const u = resta(q, 0.45);
  c.save(); c.globalAlpha = u;
  if (titolo) { scrivi(c, titolo, x0, y, { font: `700 ${adatta(c, titolo, (px) => `700 ${px}px ${fam}`, size * 0.5, W)}px ${fam}`, colore: '#fff', base: 'top', alfa: prog(q.t, 0.05, 0.5, E.p2out), ombra: { blur: 20, colore: 'rgba(0,0,0,.5)' } }); y += size * 0.9; }
  // i nomi delle voci: al massimo un terzo della larghezza (poi si rimpiccioliscono), così la barra ha sempre posto
  const piuLunga = voci.reduce((a, x) => (x.n.length > a.length ? x.n : a), '');
  const fLpx = adatta(c, piuLunga, (px) => `600 ${px}px ${fam}`, rh * 0.42, W * 0.34);
  const fL = `600 ${fLpx}px ${fam}`;
  const wl = Math.max(...voci.map((x) => larg(c, x.n, fL))) + 26;
  voci.forEach((v, i) => {
    const k = prog(q.t, 0.4 + i * 0.28, 0.9, E.p4out);
    const yy = y + i * (rh + gap);
    scrivi(c, v.n, x0, yy + rh / 2, { font: fL, colore: '#fff', base: 'middle', alfa: prog(q.t, 0.3 + i * 0.28, 0.4, E.p2out), ombra: { blur: 14, colore: 'rgba(0,0,0,.5)' } });
    const bw = (W - wl - 130) * (v.v / max) * k;
    rettTondo(c, x0 + wl, yy + rh * 0.16, W - wl - 110, rh * 0.68, rh * 0.34); c.fillStyle = 'rgba(255,255,255,.12)'; c.fill();
    if (bw > 1) { rettTondo(c, x0 + wl, yy + rh * 0.16, Math.max(rh * 0.68, bw), rh * 0.68, rh * 0.34); const g = c.createLinearGradient(x0 + wl, 0, x0 + wl + bw, 0); g.addColorStop(0, hexA(colore, 0.75)); g.addColorStop(1, colore); c.fillStyle = g; c.fill(); }
    scrivi(c, migliaia(v.v * k), x0 + W, yy + rh / 2, { font: `700 ${rh * 0.46}px ${fam}`, colore: '#fff', align: 'right', base: 'middle', alfa: Math.min(1, k * 2), ombra: { blur: 14, colore: 'rgba(0,0,0,.5)' } });
  });
  c.restore();
}

/** 4) Grafico a linea */
function lineaGr(q: Q) {
  const { c } = q;
  const colore = col(q, 'colore', '#ff4d6d');
  const pt = String(q.v.punti ?? '').split(',').map((s) => Number(s.trim().replace(',', '.'))).filter((n) => Number.isFinite(n)).slice(0, 24);
  if (pt.length < 2) return;
  const size = grande(q, 100), fam = famiglia(q.v, 'font');
  const W = Math.min(q.w * 0.7, 1400) * (size / 100), H = 480 * (size / 100);
  const x0 = (q.w - W) / 2, y0 = (q.h - H) / 2 + 40;
  const mn = Math.min(...pt, 0), mx = Math.max(...pt);
  const px = (i: number) => x0 + (i / (pt.length - 1)) * W, py = (v: number) => y0 + H - ((v - mn) / Math.max(1e-6, mx - mn)) * H;
  const u = resta(q, 0.45);
  c.save(); c.globalAlpha = u;
  const titolo = tx(q, 'titolo', '');
  if (titolo) scrivi(c, titolo, x0, y0 - 64, { font: `700 ${adatta(c, titolo, (px) => `700 ${px}px ${fam}`, size * 0.5, W)}px ${fam}`, colore: '#fff', base: 'top', alfa: prog(q.t, 0.05, 0.5, E.p2out), ombra: { blur: 20, colore: 'rgba(0,0,0,.5)' } });
  // la griglia
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { const y = y0 + (H * i) / 4; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + W, y); c.stroke(); }
  const k = prog(q.t, 0.4, 2.4, E.p3io);
  const tot = (pt.length - 1) * k;
  const punti: [number, number][] = pt.map((v, i) => [px(i), py(v)]);
  // la linea disegnata fino a "tot" segmenti
  c.save();
  c.beginPath();
  c.moveTo(punti[0][0], punti[0][1]);
  for (let i = 1; i < pt.length; i++) {
    if (i <= Math.floor(tot)) c.lineTo(punti[i][0], punti[i][1]);
    else if (i - 1 <= tot) { const f = tot - (i - 1); c.lineTo(lerp(punti[i - 1][0], punti[i][0], f), lerp(punti[i - 1][1], punti[i][1], f)); }
  }
  c.lineWidth = 8; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = colore; c.shadowColor = colore; c.shadowBlur = 24;
  c.stroke();
  c.restore();
  // i punti si accendono quando la linea li raggiunge
  punti.forEach(([x, y], i) => {
    const a = clamp01(tot - i + 0.2);
    if (a <= 0) return;
    c.beginPath(); c.arc(x, y, 12 * a, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.lineWidth = 6; c.strokeStyle = colore; c.stroke();
  });
  c.restore();
}

/** 5) Barra di avanzamento */
function progresso(q: Q) {
  const { c } = q;
  const colore = col(q, 'colore', '#ffd23f');
  const pc = Math.max(0, Math.min(100, num(q, 'percento', 68)));
  const size = grande(q, 100), fam = famiglia(q.v, 'font');
  const W = Math.min(q.w * 0.62, 1200) * (size / 100), h = 36 * (size / 100);
  const x0 = (q.w - W) / 2, y0 = q.h / 2;
  const k = prog(q.t, 0.4, 2, E.p3out), u = resta(q, 0.45), ent = prog(q.t, 0.05, 0.5, E.p3out);
  c.save(); c.globalAlpha = u * ent;
  const fPc = `700 ${size * 0.62}px ${fam}`;
  const wPc = larg(c, '100%', fPc) + 30;
  const etP = tx(q, 'etichetta', '');
  const fEt = (px: number) => `600 ${px}px ${fam}`;
  scrivi(c, etP, x0, y0 - 28, { font: fEt(etP ? adatta(c, etP, fEt, size * 0.42, W - wPc) : size * 0.42), colore: '#fff', base: 'bottom', ombra: { blur: 18, colore: 'rgba(0,0,0,.5)' } });
  scrivi(c, Math.round(pc * k) + '%', x0 + W, y0 - 28, { font: fPc, colore, align: 'right', base: 'bottom', ombra: { blur: 18, colore: 'rgba(0,0,0,.5)' } });
  rettTondo(c, x0, y0, W, h, h / 2); c.fillStyle = 'rgba(255,255,255,.16)'; c.fill();
  const bw = W * (pc / 100) * k;
  if (bw > 1) {
    rettTondo(c, x0, y0, Math.max(h, bw), h, h / 2);
    const g = c.createLinearGradient(x0, 0, x0 + bw, 0); g.addColorStop(0, chiaro(colore, 0.0)); g.addColorStop(1, chiaro(colore, 0.35));
    c.fillStyle = g; c.shadowColor = colore; c.shadowBlur = 24; c.fill();
  }
  c.restore();
}

export const DATI: Record<string, (q: Q) => void> = {
  'dt-contatore': contatore, 'dt-anello': anello, 'dt-barre': barreGr, 'dt-linea': lineaGr, 'dt-progresso': progresso,
};
