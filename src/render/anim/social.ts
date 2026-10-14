// Social e chiusure: segui, iscriviti, invito finale, post, notifica del telefono, chat. Idee dai blocchi
// instagram-follow, tiktok-follow, cta-close, x-post, native-notification-pop e message-thread-reveal di HyperFrames.
import { E, Q, accorcia, caso, chiaro, col, conAdatta, famiglia, hexA, larg, lerp, migliaia, num, prog, resta, rettTondo, righe, scrivi, scuro, sopra, tx, clamp01 } from './base';
import type { Ctx2D } from './base';

const gr = (q: Q) => num(q, 'dim', 100) / 100;

/** il puntatore del mouse (la freccia), con la punta in (x, y) */
function puntatore(c: Ctx2D, x: number, y: number, s: number, alfa = 1) {
  c.save();
  c.translate(x, y); c.scale(s, s); c.globalAlpha *= alfa;
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(0, 34); c.lineTo(8, 27); c.lineTo(14, 40); c.lineTo(20, 37); c.lineTo(14, 25); c.lineTo(25, 25); c.closePath();
  c.fillStyle = '#fff'; c.lineWidth = 3; c.strokeStyle = '#000'; c.lineJoin = 'round';
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.stroke(); c.fill();
  c.restore();
}

/** il cursore che arriva da (x0,y0) alla punta (x1,y1) fra ta e tb, poi esce */
function manoCheClicca(q: Q, x1: number, y1: number, ta: number, tb: number, tc: number, s: number) {
  const k = prog(q.t, ta, tb - ta, E.p3io);
  const x0 = x1 + 360 * s, y0 = y1 + 300 * s;
  const click = clamp01(1 - Math.abs(q.t - tc) / 0.14);
  const esce = prog(q.t, tc + 0.5, 0.5, E.p2in);
  puntatore(q.c, lerp(x0, x1, k) + 60 * s * esce, lerp(y0, y1, k) + 50 * s * esce, s * (1 - 0.1 * click), (1 - esce) * Math.min(1, k * 3));
}

/** 1) Segui: la scheda si allarga con il nome e con la scritta del pulsante (e se non basta lo schermo, `conAdatta` la rimpicciolisce) */
function segui(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ff2d6f');
  const nome = tx(q, 'nome', '@daprod'), et = tx(q, 'etichetta', 'Segui');
  const fNome = `700 ${44 * s}px "Montserrat", sans-serif`, fSub = `500 ${26 * s}px "Montserrat", sans-serif`, fBot = `700 ${32 * s}px "Montserrat", sans-serif`;
  const dopoEt = '✓ Segui già';
  // le misure: l'avatar, il nome (e la riga sotto), il pulsante largo quanto la sua scritta più lunga
  const r = 62 * s, margine = 40 * s, gapNome = 28 * s, gapBot = 36 * s;
  const wNome = Math.max(larg(c, nome, fNome), larg(c, 'Consigliato per te', fSub), larg(c, 'Ora lo segui', fSub));
  const bw = Math.max(240 * s, Math.max(larg(c, et, fBot), larg(c, dopoEt, fBot)) + 80 * s), bh = 78 * s;
  const W = Math.max(720 * s, margine + r * 2 + gapNome + wNome + gapBot + bw + margine), H = 176 * s;
  q.misura?.(W);
  const pos = String(q.v.pos ?? 'sinistra');
  const x = pos === 'centro' ? (q.w - W) / 2 : pos === 'destra' ? q.w - 120 - W : 120, y = q.h - 130 - H - (pos === 'centro' ? 380 : 0);
  const ent = prog(q.t, 0.1, 0.6, E.back(1.5)), u = resta(q, 0.45);
  const premuto = 2.05;
  const dopo = q.t > premuto;
  const pr = clamp01(1 - Math.abs(q.t - premuto) / 0.12);
  c.save();
  c.globalAlpha = Math.min(1, ent * 1.6) * u;
  c.translate(x + W / 2, y + H / 2); c.scale(0.9 + 0.1 * ent, 0.9 + 0.1 * ent); c.translate(-(x + W / 2), -(y + H / 2));
  c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 50; c.shadowOffsetY = 18;
  rettTondo(c, x, y, W, H, 36 * s); c.fillStyle = '#14151b'; c.fill(); c.shadowColor = 'transparent';
  // l'avatar: un cerchio sfumato con l'iniziale
  const ax = x + margine + r, ay = y + H / 2;
  const g = c.createLinearGradient(ax - r, ay - r, ax + r, ay + r); g.addColorStop(0, chiaro(colore, 0.2)); g.addColorStop(1, scuro(colore, 0.2));
  c.beginPath(); c.arc(ax, ay, r, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  c.lineWidth = 5 * s; c.strokeStyle = '#14151b'; c.stroke();
  scrivi(c, (nome.replace('@', '')[0] || 'D').toUpperCase(), ax, ay + 2 * s, { font: `800 ${68 * s}px "Montserrat", sans-serif`, colore: '#fff', align: 'center', base: 'middle' });
  scrivi(c, nome, ax + r + gapNome, ay - 18 * s, { font: fNome, colore: '#fff', base: 'middle' });
  scrivi(c, dopo ? 'Ora lo segui' : 'Consigliato per te', ax + r + gapNome, ay + 26 * s, { font: fSub, colore: '#9aa0ad', base: 'middle' });
  // il pulsante (sta sempre a destra, e il nome non ci finisce mai sotto)
  const bx = x + W - margine - bw, by = y + (H - bh) / 2;
  const sc = 1 - 0.07 * pr;
  c.save(); c.translate(bx + bw / 2, by + bh / 2); c.scale(sc, sc); c.translate(-bw / 2, -bh / 2);
  rettTondo(c, 0, 0, bw, bh, bh / 2);
  if (!dopo) { c.fillStyle = colore; c.fill(); }
  else { c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); c.lineWidth = 3 * s; c.strokeStyle = 'rgba(255,255,255,.35)'; c.stroke(); }
  scrivi(c, dopo ? dopoEt : et, bw / 2, bh / 2 + 2 * s, { font: fBot, colore: dopo ? '#fff' : sopra(colore), align: 'center', base: 'middle' });
  c.restore();
  // l'onda del clic
  const onda = prog(q.t, premuto, 0.7, E.p3out);
  if (onda > 0 && onda < 1) { c.beginPath(); c.arc(bx + bw / 2, by + bh / 2, bh * 0.5 + onda * 120 * s, 0, Math.PI * 2); c.lineWidth = 5 * s; c.strokeStyle = hexA(colore, 1 - onda); c.stroke(); }
  c.restore();
  manoCheClicca(q, bx + bw * 0.55, by + bh * 0.62, 1.1, 1.95, premuto, s);
}

/** 2) Iscriviti */
function iscriviti(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ff0033');
  const et = tx(q, 'etichetta', 'ISCRIVITI');
  const fEt = `800 ${46 * s}px "Montserrat", sans-serif`;
  const bh = 112 * s, bw = Math.max(460 * s, Math.max(larg(c, et.toUpperCase(), fEt, 2 * s), larg(c, 'ISCRITTO', fEt, 2 * s)) + 90 * s);
  const pos = String(q.v.pos ?? 'sinistra');
  const tot = bw + 24 * s + bh;
  q.misura?.(tot);
  const x = pos === 'centro' ? (q.w - tot) / 2 : pos === 'destra' ? q.w - 120 - tot : 120, y = q.h - 150 - bh - (pos === 'centro' ? 300 : 0);
  const ent = prog(q.t, 0.1, 0.6, E.back(1.6)), u = resta(q, 0.45);
  const premuto = 1.9, dopo = q.t > premuto;
  const pr = clamp01(1 - Math.abs(q.t - premuto) / 0.12);
  c.save();
  c.globalAlpha = Math.min(1, ent * 1.6) * u;
  c.translate(x, y + bh); c.scale(0.85 + 0.15 * ent, 0.85 + 0.15 * ent); c.translate(-x, -(y + bh));
  const sc = 1 - 0.06 * pr;
  c.save(); c.translate(x + bw / 2, y + bh / 2); c.scale(sc, sc); c.translate(-bw / 2, -bh / 2);
  rettTondo(c, 0, 0, bw, bh, 18 * s); c.fillStyle = dopo ? 'rgba(60,60,66,.95)' : colore; c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 30; c.shadowOffsetY = 10; c.fill(); c.shadowColor = 'transparent';
  scrivi(c, dopo ? 'ISCRITTO' : et.toUpperCase(), bw / 2, bh / 2 + 2 * s, { font: fEt, colore: '#fff', align: 'center', base: 'middle', spazio: 2 * s });
  c.restore();
  // la campanella
  const cx = x + bw + 24 * s + bh / 2, cy = y + bh / 2;
  c.beginPath(); c.arc(cx, cy, bh / 2, 0, Math.PI * 2); c.fillStyle = 'rgba(60,60,66,.95)'; c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 30; c.shadowOffsetY = 10; c.fill(); c.shadowColor = 'transparent';
  const squillo = q.t > premuto + 0.35 ? Math.sin((q.t - premuto - 0.35) * 26) * Math.exp(-(q.t - premuto - 0.35) * 2.4) * 0.5 : 0;
  c.save(); c.translate(cx, cy - 10 * s); c.rotate(squillo);
  c.fillStyle = dopo ? '#fff' : 'rgba(255,255,255,.85)';
  const b = 22 * s;
  c.beginPath(); c.moveTo(-b, b * 0.9); c.quadraticCurveTo(-b * 0.9, -b * 0.2, -b * 0.55, -b * 0.7); c.quadraticCurveTo(0, -b * 1.5, b * 0.55, -b * 0.7); c.quadraticCurveTo(b * 0.9, -b * 0.2, b, b * 0.9); c.closePath(); c.fill();
  c.beginPath(); c.arc(0, b * 1.28, b * 0.32, 0, Math.PI); c.fill();
  c.restore();
  c.restore();
  manoCheClicca(q, x + bw * 0.6, y + bh * 0.68, 1.0, 1.85, premuto, s);
}

/** 3) Chiusura con invito */
function chiusura(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#ffd23f'), fam = famiglia(q.v, 'font');
  const titolo = tx(q, 'titolo', 'Grazie per la visione'), sotto = tx(q, 'sotto', ''), bott = tx(q, 'bottone', 'Iscriviti');
  const f1 = `800 ${112 * s}px ${fam}`, f2 = `500 ${42 * s}px ${fam}`, f3 = `800 ${40 * s}px ${fam}`;
  const rr = righe(c, titolo, f1, q.w * 0.8);
  const lh = 112 * s * 1.1;
  const hT = rr.length * lh;
  const bw = larg(c, bott, f3, 1.2 * s) + 90 * s, bh = 92 * s;
  const tot = hT + (sotto ? 34 * s + 42 * s * 1.3 : 0) + 56 * s + bh;
  let y = (q.h - tot) / 2;
  const u = resta(q, 0.5);
  rr.forEach((riga, i) => {
    const k = prog(q.t, 0.1 + i * 0.12, 0.7, E.p3out);
    scrivi(c, riga, q.w / 2, y + i * lh + 40 * (1 - k), { font: f1, colore: '#fff', align: 'center', base: 'top', alfa: Math.min(1, k * 1.5) * u, ombra: { blur: 26, colore: 'rgba(0,0,0,.5)' } });
  });
  y += hT;
  if (sotto) { const k = prog(q.t, 0.6, 0.6, E.p3out); scrivi(c, sotto, q.w / 2, y + 34 * s + 18 * (1 - k), { font: f2, colore: 'rgba(255,255,255,.9)', align: 'center', base: 'top', alfa: k * u, ombra: { blur: 18, colore: 'rgba(0,0,0,.5)' } }); y += 34 * s + 42 * s * 1.3; }
  y += 56 * s;
  const k = prog(q.t, 1.0, 0.6, E.back(1.8));
  const bx = (q.w - bw) / 2;
  c.save(); c.globalAlpha = Math.min(1, k * 2) * u;
  c.translate(q.w / 2, y + bh / 2); c.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); c.translate(-q.w / 2, -(y + bh / 2));
  // l'anello che pulsa attorno al pulsante
  const ph = ((q.t - 1.4) % 1.4) / 1.4;
  if (q.t > 1.4) { rettTondo(c, bx - 20 * ph * s * 2, y - 20 * ph * s * 2, bw + 40 * ph * s * 2, bh + 40 * ph * s * 2, bh / 2 + 20 * ph * s * 2); c.lineWidth = 5 * s; c.strokeStyle = hexA(colore, (1 - ph) * 0.8); c.stroke(); }
  rettTondo(c, bx, y, bw, bh, bh / 2); c.fillStyle = colore; c.shadowColor = hexA(colore, 0.55); c.shadowBlur = 36; c.shadowOffsetY = 8; c.fill(); c.shadowColor = 'transparent';
  scrivi(c, bott, q.w / 2, y + bh / 2 + 2 * s, { font: f3, colore: sopra(colore), align: 'center', base: 'middle', spazio: 1.2 * s });
  c.restore();
}

/** 4) Post social */
function post(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#1d9bf0');
  const nome = tx(q, 'nome', 'DaProd Video'), utente = tx(q, 'utente', '@daprod'), testo = tx(q, 'testo', '');
  const W = 940 * s, pad = 40 * s;
  const fT = `500 ${40 * s}px "Montserrat", sans-serif`;
  const rr = righe(c, testo, fT, W - pad * 2);
  const hT = rr.length * 40 * s * 1.35;
  const H = pad + 92 * s + 26 * s + hT + 30 * s + 2 + 62 * s + pad * 0.6;
  const pos = String(q.v.pos ?? 'centro');
  const x = pos === 'sinistra' ? 120 : pos === 'destra' ? q.w - 120 - W : (q.w - W) / 2, y = (q.h - H) / 2;
  const ent = prog(q.t, 0.1, 0.65, E.back(1.4)), u = resta(q, 0.45);
  c.save();
  c.globalAlpha = Math.min(1, ent * 1.6) * u;
  c.translate(x + W / 2, y + H / 2); c.scale(0.9 + 0.1 * ent, 0.9 + 0.1 * ent); c.translate(-(x + W / 2), -(y + H / 2));
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 56; c.shadowOffsetY = 20;
  rettTondo(c, x, y, W, H, 34 * s); c.fillStyle = '#ffffff'; c.fill(); c.shadowColor = 'transparent';
  const ay = y + pad + 46 * s;
  c.beginPath(); c.arc(x + pad + 46 * s, ay, 46 * s, 0, Math.PI * 2);
  const g = c.createLinearGradient(x, y, x + 100 * s, y + 100 * s); g.addColorStop(0, chiaro(colore, 0.2)); g.addColorStop(1, scuro(colore, 0.2)); c.fillStyle = g; c.fill();
  scrivi(c, (nome[0] || 'D').toUpperCase(), x + pad + 46 * s, ay + 2 * s, { font: `800 ${50 * s}px "Montserrat", sans-serif`, colore: '#fff', align: 'center', base: 'middle' });
  const nx = x + pad + 110 * s;
  // il nome (con la spunta) e l'utente stanno nella scheda: se sono lunghi si accorciano
  const fNomeP = `700 ${38 * s}px "Montserrat", sans-serif`, fUt = `500 ${30 * s}px "Montserrat", sans-serif`;
  const nomeP = accorcia(c, nome, fNomeP, W - (nx - x) - pad - 60 * s);
  const wn = scrivi(c, nomeP, nx, ay - 16 * s, { font: fNomeP, colore: '#0f1419', base: 'middle' });
  c.beginPath(); c.arc(nx + wn + 26 * s, ay - 16 * s, 15 * s, 0, Math.PI * 2); c.fillStyle = colore; c.fill();
  scrivi(c, '✓', nx + wn + 26 * s, ay - 14 * s, { font: `800 ${20 * s}px "Montserrat", sans-serif`, colore: '#fff', align: 'center', base: 'middle' });
  scrivi(c, accorcia(c, utente, fUt, W - (nx - x) - pad), nx, ay + 26 * s, { font: fUt, colore: '#667785', base: 'middle' });
  const ty = y + pad + 92 * s + 26 * s;
  rr.forEach((r, i) => scrivi(c, r, x + pad, ty + i * 40 * s * 1.35, { font: fT, colore: '#0f1419', base: 'top', alfa: prog(q.t, 0.45 + i * 0.12, 0.4, E.p2out) }));
  const ly = ty + hT + 30 * s;
  c.fillStyle = '#eff3f4'; c.fillRect(x + pad, ly, W - pad * 2, 2);
  // il cuore e i mi piace
  const likes = num(q, 'mipiace', 12840);
  const scoppio = clamp01((q.t - 1.9) / 0.5);
  const cuoreScala = q.t > 1.9 ? 1 + 0.5 * Math.exp(-(q.t - 1.9) * 9) * Math.cos((q.t - 1.9) * 16) : 1;
  const hy = ly + 31 * s + 20 * s;
  c.save(); c.translate(x + pad + 22 * s, hy); c.scale(cuoreScala, cuoreScala);
  c.beginPath();
  const a = 22 * s;
  c.moveTo(0, a * 0.6); c.bezierCurveTo(-a * 1.3, -a * 0.1, -a * 0.8, -a * 1.1, 0, -a * 0.45); c.bezierCurveTo(a * 0.8, -a * 1.1, a * 1.3, -a * 0.1, 0, a * 0.6);
  c.fillStyle = scoppio > 0 ? '#f91880' : '#a0aab3'; c.fill();
  c.restore();
  scrivi(c, migliaia(likes * prog(q.t, 0.6, 1.4, E.p3out) + (scoppio > 0 ? 1 : 0)), x + pad + 64 * s, hy, { font: `600 ${32 * s}px "Montserrat", sans-serif`, colore: scoppio > 0 ? '#f91880' : '#536471', base: 'middle' });
  scrivi(c, '💬  ↻  ⇪', x + W - pad, hy, { font: `500 ${30 * s}px "Montserrat", sans-serif`, colore: '#8b98a5', align: 'right', base: 'middle', spazio: 10 * s });
  c.restore();
}

/** 5) Notifica del telefono */
function notifica(q: Q) {
  const { c } = q;
  const s = gr(q), colore = col(q, 'colore', '#34c759');
  const app = tx(q, 'app', 'Messaggi'), titolo = tx(q, 'titolo', 'Anna'), testo = tx(q, 'testo', '');
  const W = 1000 * s;
  const fT = `500 ${32 * s}px "Montserrat", sans-serif`;
  const rr = righe(c, testo, fT, W - 190 * s).slice(0, 3);
  const H = Math.max(150 * s, 60 * s + 34 * s * 1.25 + 24 * s + rr.length * 32 * s * 1.3 + 30 * s);
  const x = (q.w - W) / 2;
  const ent = prog(q.t, 0.1, 0.7, E.back(1.3)), usc = prog(q.t, q.d - 0.45, 0.45, E.p2in);
  const y = lerp(-H - 40, 70, ent) - (H + 100) * usc;
  c.save();
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 44; c.shadowOffsetY = 14;
  rettTondo(c, x, y, W, H, 44 * s); c.fillStyle = 'rgba(247,247,250,.94)'; c.fill(); c.shadowColor = 'transparent';
  const ic = 96 * s, ix = x + 30 * s, iy = y + 30 * s;
  rettTondo(c, ix, iy, ic, ic, 24 * s); c.fillStyle = colore; c.fill();
  c.fillStyle = '#fff';
  rettTondo(c, ix + ic * 0.2, iy + ic * 0.24, ic * 0.6, ic * 0.42, ic * 0.16); c.fill();
  c.beginPath(); c.moveTo(ix + ic * 0.34, iy + ic * 0.62); c.lineTo(ix + ic * 0.28, iy + ic * 0.78); c.lineTo(ix + ic * 0.5, iy + ic * 0.64); c.closePath(); c.fill();
  const tx0 = ix + ic + 28 * s;
  const fApp = `600 ${22 * s}px "Montserrat", sans-serif`, fTit = `700 ${34 * s}px "Montserrat", sans-serif`;
  scrivi(c, accorcia(c, app.toUpperCase(), fApp, W - (tx0 - x) - 140 * s, 1.2 * s), tx0, y + 34 * s, { font: fApp, colore: '#6d6d72', base: 'top', spazio: 1.2 * s });
  scrivi(c, 'ora', x + W - 32 * s, y + 34 * s, { font: `500 ${22 * s}px "Montserrat", sans-serif`, colore: '#8e8e93', align: 'right', base: 'top' });
  scrivi(c, accorcia(c, titolo, fTit, W - (tx0 - x) - 32 * s), tx0, y + 34 * s + 22 * s * 1.3 + 4 * s, { font: fTit, colore: '#111', base: 'top' });
  rr.forEach((r, i) => scrivi(c, r, tx0, y + 34 * s + 22 * s * 1.3 + 4 * s + 34 * s * 1.25 + 8 * s + i * 32 * s * 1.3, { font: fT, colore: '#2b2b2f', base: 'top' }));
  c.restore();
}

/** 6) Chat */
function chat(q: Q) {
  const { c } = q;
  const s = gr(q), mio = col(q, 'colore', '#0a84ff');
  const msgs = String(q.v.righe ?? '').split('\n').map((r) => r.trim()).filter(Boolean).slice(0, 8).map((r) => ({ mine: r.startsWith('>'), t: r.replace(/^>\s*/, '') }));
  if (!msgs.length) return;
  const font = `500 ${40 * s}px "Montserrat", sans-serif`;
  const maxW = 820 * s, pad = 30 * s, lh = 40 * s * 1.3;
  const cx = q.w / 2, larghezzaCol = 1000 * s;
  const bolle = msgs.map((m) => {
    const rr = righe(c, m.t, font, maxW - pad * 2);
    const w = Math.max(...rr.map((x) => larg(c, x, font))) + pad * 2;
    return { ...m, rr, w, h: rr.length * lh + pad * 1.5 };
  });
  const passo = Math.min(1.25, 5.5 / msgs.length), t0 = 0.5;
  const u = resta(q, 0.5);
  const gap = 18 * s;
  const ancora = (q.h + Math.min(900, bolle.reduce((a, b) => a + b.h + gap, 0))) / 2;
  // k_i = quanto è apparsa la bolla i (0..1)
  const k = bolle.map((b, i) => prog(q.t, t0 + i * passo, 0.5, E.back(1.6)));
  let y = ancora;
  const pos: number[] = new Array(bolle.length);
  for (let i = bolle.length - 1; i >= 0; i--) { y -= (bolle[i].h + gap) * clamp01(k[i]); pos[i] = y; }
  c.save(); c.globalAlpha = u;
  bolle.forEach((b, i) => {
    if (k[i] <= 0) return;
    const x = b.mine ? cx + larghezzaCol / 2 - b.w : cx - larghezzaCol / 2;
    c.save();
    c.translate(x + (b.mine ? b.w : 0), pos[i] + b.h);
    const sc = 0.6 + 0.4 * Math.min(1, k[i]);
    c.scale(sc, sc); c.globalAlpha *= clamp01(k[i] * 2);
    c.translate(-(b.mine ? b.w : 0), -b.h);
    rettTondo(c, 0, 0, b.w, b.h, 38 * s); c.fillStyle = b.mine ? mio : '#e9e9eb'; c.fill();
    b.rr.forEach((r, j) => scrivi(c, r, pad, pad * 0.75 + j * lh, { font, colore: b.mine ? '#fff' : '#111', base: 'top' }));
    c.restore();
  });
  // i puntini "sta scrivendo" prima di ogni messaggio ricevuto
  bolle.forEach((b, i) => {
    if (b.mine) return;
    const ti = t0 + i * passo;
    const prima = q.t > ti - passo * 0.7 && q.t < ti + 0.05;
    if (!prima) return;
    const yy = y - 74 * s + (i === 0 ? 0 : 0);
    rettTondo(c, cx - larghezzaCol / 2, Math.min(ancora, yy + 74 * s) - 74 * s, 130 * s, 74 * s, 37 * s); c.fillStyle = '#e9e9eb'; c.fill();
    for (let d = 0; d < 3; d++) { c.beginPath(); c.arc(cx - larghezzaCol / 2 + (36 + d * 29) * s, Math.min(ancora, yy + 74 * s) - 37 * s - Math.sin(q.t * 9 + d) * 5 * s, 8 * s, 0, Math.PI * 2); c.fillStyle = '#8e8e93'; c.fill(); }
  });
  c.restore();
  void caso; void scuro;
}

export const SOCIAL: Record<string, (q: Q) => void> = {
  'sc-segui': conAdatta(segui, 120), 'sc-iscriviti': conAdatta(iscriviti, 120), 'sc-chiusura': chiusura, 'sc-post': post, 'sc-notifica': notifica, 'sc-chat': chat,
};
