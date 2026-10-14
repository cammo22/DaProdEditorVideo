// Cerimonie e feste: monogramma, cornice dorata, dedica, data grande, auguri con bandierine, cuori, petali, scintille,
// palloncini, coriandoli. Sono pensate per i montaggi di matrimoni, battesimi, comunioni, compleanni e lauree
// (src/core/montage.ts le usa per i titoli e le sovrapposizioni): niente di loro viene da fuori, il disegno è nostro.
import { E, Q, adatta, caso, chiaro, col, famiglia, FONT, hexA, num, prog, resta, scrivi, stella, tx, clamp01, cuore, scuro, larg } from './base';
import type { Ctx2D } from './base';

const giro = (x: number, m: number) => ((x % m) + m) % m;

/** un'ombra scura morbida dietro al testo, per leggerlo anche su riprese chiare */
function velo(c: Ctx2D, cx: number, cy: number, r: number, a: number) {
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(0,0,0,${0.5 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** un filo con un rombo in mezzo (l'ornamento classico) */
function filo(c: Ctx2D, cx: number, y: number, w: number, colore: string, k: number) {
  const ww = w * k;
  c.strokeStyle = colore; c.lineWidth = 2.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - ww / 2, y); c.lineTo(cx - 18, y); c.moveTo(cx + 18, y); c.lineTo(cx + ww / 2, y); c.stroke();
  c.fillStyle = colore; c.beginPath(); c.moveTo(cx, y - 9 * k); c.lineTo(cx + 9 * k, y); c.lineTo(cx, y + 9 * k); c.lineTo(cx - 9 * k, y); c.closePath(); c.fill();
}

/** 1) Monogramma */
function monogramma(q: Q) {
  const { c } = q;
  const oro = col(q, 'colore', '#d4af37'), bianco = col(q, 'testo', '#ffffff'), fam = famiglia(q.v, 'font', 'playfair');
  const u = resta(q, 0.6), cx = q.w / 2, cy = q.h / 2 - 90;
  c.save(); c.globalAlpha = u;
  velo(c, cx, q.h / 2, q.h * 0.62, prog(q.t, 0, 0.8, E.p2out));
  // l'anello che si disegna
  const R = 190, k = prog(q.t, 0.1, 1.3, E.p3io);
  c.lineWidth = 5; c.strokeStyle = oro; c.lineCap = 'round'; c.shadowColor = hexA(oro, 0.6); c.shadowBlur = 16;
  c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
  c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R - 18, -Math.PI / 2, -Math.PI / 2 - Math.PI * 2 * k, true); c.stroke();
  c.shadowColor = 'transparent';
  // le iniziali
  const ki = prog(q.t, 0.9, 0.8, E.back(1.4));
  const iniz = tx(q, 'iniziali', 'A & M');
  const fi = adatta(c, iniz, (px) => `400 ${px}px ${FONT.vibes}`, 170, (R - 30) * 1.7);
  c.save(); c.translate(cx, cy + 8); c.scale(0.8 + 0.2 * ki, 0.8 + 0.2 * ki);
  scrivi(c, iniz, 0, 0, { font: `400 ${fi}px ${FONT.vibes}`, colore: oro, align: 'center', base: 'middle', alfa: clamp01(ki * 1.5), ombra: { blur: 22, colore: 'rgba(0,0,0,.55)' } });
  c.restore();
  const kn = prog(q.t, 1.4, 0.8, E.p3out), kd = prog(q.t, 1.8, 0.8, E.p3out);
  const nomi = tx(q, 'nomi', 'Anna e Marco');
  const fn = adatta(c, nomi, (px) => `700 ${px}px ${fam}`, 78, q.w * 0.8, 5);
  scrivi(c, nomi, cx, cy + R + 70 + 16 * (1 - kn), { font: `700 ${fn}px ${fam}`, colore: bianco, align: 'center', base: 'middle', alfa: kn, spazio: 5, ombra: { blur: 24, colore: 'rgba(0,0,0,.6)' } });
  filo(c, cx, cy + R + 134, 360, oro, kd);
  const dt = tx(q, 'data', '').toUpperCase();
  const fD = adatta(c, dt, (px) => `500 ${px}px ${FONT.cormorant}`, 40, q.w * 0.86, 10);
  scrivi(c, dt, cx, cy + R + 190 + 12 * (1 - kd), { font: `500 ${fD}px ${FONT.cormorant}`, colore: oro, align: 'center', base: 'middle', alfa: kd, spazio: 10, ombra: { blur: 16, colore: 'rgba(0,0,0,.6)' } });
  c.restore();
}

/** 2) Cornice dorata */
function cornice(q: Q) {
  const { c } = q;
  const oro = col(q, 'colore', '#d4af37'), bianco = col(q, 'testo', '#ffffff');
  const u = resta(q, 0.6);
  const m = 130, x = m, y = m * 0.7, w = q.w - m * 2, h = q.h - m * 1.4;
  c.save(); c.globalAlpha = u;
  velo(c, q.w / 2, q.h / 2, q.h * 0.7, prog(q.t, 0, 0.8, E.p2out));
  const k = prog(q.t, 0.1, 1.8, E.p3io);
  c.strokeStyle = oro; c.lineCap = 'round'; c.lineJoin = 'round'; c.shadowColor = hexA(oro, 0.5); c.shadowBlur = 12;
  const per = 2 * (w + h);
  for (const [off, lw] of [[0, 4], [22, 2]] as [number, number][]) {
    c.lineWidth = lw; c.setLineDash([per * k, per]);
    c.beginPath(); c.rect(x + off, y + off, w - off * 2, h - off * 2); c.stroke();
  }
  c.setLineDash([]);
  c.shadowColor = 'transparent';
  // i ghirigori agli angoli
  const ka = prog(q.t, 1.2, 0.8, E.p3out);
  if (ka > 0) {
    c.lineWidth = 3; c.strokeStyle = hexA(oro, ka);
    for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as [number, number, number, number][]) {
      c.save(); c.translate(px, py); c.scale(sx, sy);
      c.beginPath(); c.moveTo(46, 46); c.bezierCurveTo(46, 88, 88, 88, 88, 46); c.bezierCurveTo(88, 20, 62, 12, 56, 34); c.stroke();
      c.beginPath(); c.arc(46, 46, 7, 0, Math.PI * 2); c.fillStyle = hexA(oro, ka); c.fill();
      c.restore();
    }
  }
  const kt = prog(q.t, 1.0, 0.9, E.p3out), ks = prog(q.t, 1.5, 0.9, E.p3out);
  const t = tx(q, 'titolo', 'Anna & Marco');
  const f1 = `italic 400 ${adatta(c, t, (px) => `italic 400 ${px}px ${FONT.playfair}`, 150, w - 280)}px ${FONT.playfair}`;
  scrivi(c, t, q.w / 2, q.h / 2 - 20 + 20 * (1 - kt), { font: f1, colore: bianco, align: 'center', base: 'middle', alfa: kt, ombra: { blur: 26, colore: 'rgba(0,0,0,.65)' } });
  filo(c, q.w / 2, q.h / 2 + 76, 420, oro, ks);
  const sottoC = tx(q, 'sotto', '').toUpperCase();
  const fS = adatta(c, sottoC, (px) => `500 ${px}px ${FONT.cormorant}`, 46, w - 280, 9);
  scrivi(c, sottoC, q.w / 2, q.h / 2 + 140 + 12 * (1 - ks), { font: `500 ${fS}px ${FONT.cormorant}`, colore: oro, align: 'center', base: 'middle', spazio: 9, alfa: ks, ombra: { blur: 18, colore: 'rgba(0,0,0,.65)' } });
  c.restore();
}

/** 3) Dedica */
function dedica(q: Q) {
  const { c } = q;
  const colore = col(q, 'colore', '#ffffff'), oro = col(q, 'accento', '#d4af37'), fam = famiglia(q.v, 'font', 'cormorant');
  const rr = tx(q, 'testo', '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!rr.length) return;
  const famD = fam === FONT.montserrat ? FONT.cormorant : fam;
  const size = Math.min(rr.length > 3 ? 84 : 100, ...rr.map((r) => adatta(c, r, (px) => `italic 500 ${px}px ${famD}`, 100, q.w * 0.82))), lh = size * 1.3;
  const f = `italic 500 ${size}px ${famD}`;
  const firma = tx(q, 'firma', '');
  const hT = rr.length * lh;
  const yT = q.h / 2 - hT / 2 - (firma ? 40 : 0);
  const u = resta(q, 0.6);
  c.save(); c.globalAlpha = u;
  velo(c, q.w / 2, q.h / 2, q.h * 0.7, prog(q.t, 0, 0.8, E.p2out));
  const kl = prog(q.t, 0.1, 1, E.p4out);
  filo(c, q.w / 2, yT - 52, 520, oro, kl);
  rr.forEach((r, i) => { const k = prog(q.t, 0.5 + i * 0.55, 0.9, E.p3out); scrivi(c, r, q.w / 2, yT + i * lh + 14 * (1 - k), { font: f, colore, align: 'center', base: 'top', alfa: k, ombra: { blur: 22, colore: 'rgba(0,0,0,.65)' } }); });
  filo(c, q.w / 2, yT + hT + 36, 520, oro, prog(q.t, 0.5 + rr.length * 0.55, 0.8, E.p4out));
  if (firma) { const k = prog(q.t, 0.9 + rr.length * 0.55, 0.9, E.p3out); const fF = adatta(c, firma, (px) => `400 ${px}px ${FONT.vibes}`, 84, q.w * 0.8); scrivi(c, firma, q.w / 2, yT + hT + 90 + 12 * (1 - k), { font: `400 ${fF}px ${FONT.vibes}`, colore: oro, align: 'center', base: 'top', alfa: k, ombra: { blur: 18, colore: 'rgba(0,0,0,.6)' } }); }
  c.restore();
}

/** 4) Data grande */
function data(q: Q) {
  const { c } = q;
  const bianco = col(q, 'colore', '#ffffff'), oro = col(q, 'accento', '#d4af37'), fam = famiglia(q.v, 'font', 'playfair');
  const g = tx(q, 'giorno', '12'), mese = tx(q, 'mese', 'GIUGNO').toUpperCase(), anno = tx(q, 'anno', '2026');
  const u = resta(q, 0.6), cx = q.w / 2, cy = q.h / 2 - 40;
  c.save(); c.globalAlpha = u;
  velo(c, cx, q.h / 2, q.h * 0.7, prog(q.t, 0, 0.8, E.p2out));
  const kg = prog(q.t, 0.2, 1, E.back(1.3));
  const fg = `400 330px ${fam}`;
  const wg = larg(c, g, fg);
  // mese e anno stanno ai due lati del numero: se sono lunghi, si rimpiccioliscono per non uscire dallo schermo
  const latoMax = q.w / 2 - (wg / 2 + 70) - 50 - 40;
  const fMese = adatta(c, mese.length > anno.length ? mese : anno, (px) => `500 ${px}px ${FONT.cormorant}`, 66, latoMax, 12);
  const fNomiD = adatta(c, tx(q, 'nomi', ''), (px) => `400 ${px}px ${FONT.vibes}`, 110, q.w * 0.86);
  c.save(); c.translate(cx, cy); c.scale(0.85 + 0.15 * kg, 0.85 + 0.15 * kg);
  scrivi(c, g, 0, 20, { font: fg, colore: bianco, align: 'center', base: 'middle', alfa: clamp01(kg * 1.4), ombra: { blur: 30, colore: 'rgba(0,0,0,.6)' } });
  c.restore();
  const kl = prog(q.t, 0.7, 0.9, E.p4out);
  const ex = wg / 2 + 70;
  c.fillStyle = oro;
  c.fillRect(cx - ex - 3, cy - 150 * kl, 4, 300 * kl); c.fillRect(cx + ex - 1, cy - 150 * kl, 4, 300 * kl);
  const km = prog(q.t, 1.0, 0.8, E.p3out);
  scrivi(c, mese, cx - ex - 50 + 30 * (1 - km), cy + 12, { font: `500 ${fMese}px ${FONT.cormorant}`, colore: oro, align: 'right', base: 'middle', spazio: 12, alfa: km, ombra: { blur: 16, colore: 'rgba(0,0,0,.6)' } });
  scrivi(c, anno, cx + ex + 50 - 30 * (1 - km), cy + 12, { font: `500 ${fMese}px ${FONT.cormorant}`, colore: oro, align: 'left', base: 'middle', spazio: 12, alfa: km, ombra: { blur: 16, colore: 'rgba(0,0,0,.6)' } });
  const kn = prog(q.t, 1.5, 0.9, E.p3out);
  scrivi(c, tx(q, 'nomi', ''), cx, cy + 230 + 14 * (1 - kn), { font: `400 ${fNomiD}px ${FONT.vibes}`, colore: bianco, align: 'center', base: 'middle', alfa: kn, ombra: { blur: 22, colore: 'rgba(0,0,0,.6)' } });
  c.restore();
}

/** 5) Auguri con bandierine */
function auguri(q: Q) {
  const { c } = q;
  const c1 = col(q, 'colore', '#ffd23f'), c2 = col(q, 'colore2', '#ff4d6d'), fam = famiglia(q.v, 'font', 'vibes');
  const u = resta(q, 0.6);
  const caduta = prog(q.t, 0.05, 0.9, E.rimbalzo);
  c.save(); c.globalAlpha = u;
  // la ghirlanda: una catenaria che pende, con le bandierine appese
  const sag = 150, top = -20 + 90 * caduta - 90;
  const yAt = (x: number) => top + 70 + sag * (1 - Math.pow((x - q.w / 2) / (q.w / 2), 2));
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 4;
  c.beginPath(); for (let x = -10; x <= q.w + 10; x += 20) { const y = yAt(x); if (x === -10) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
  const n = Math.round(q.w / 120);
  const cols = [c1, c2, '#ffffff', chiaro(c1, 0.3)];
  for (let i = 0; i <= n; i++) {
    const x = (i + 0.5) * (q.w / (n + 1)) + 20, y = yAt(x);
    const sw = Math.sin(q.t * 2 + i * 0.8) * 0.07;
    c.save(); c.translate(x, y); c.rotate(sw);
    c.beginPath(); c.moveTo(-34, 0); c.lineTo(34, 0); c.lineTo(0, 88); c.closePath();
    c.fillStyle = cols[i % cols.length]; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; c.shadowOffsetY = 5; c.fill();
    c.restore();
  }
  c.shadowColor = 'transparent';
  const kt = prog(q.t, 0.7, 1, E.back(1.5));
  const t = tx(q, 'testo', 'Buon Compleanno');
  c.save(); c.translate(q.w / 2, q.h / 2 + 30); c.scale(0.7 + 0.3 * kt, 0.7 + 0.3 * kt);
  scrivi(c, t, 0, 0, { font: `400 ${adatta(c, t, (px) => `400 ${px}px ${fam}`, 230, q.w * 0.86)}px ${fam}`, colore: '#fff', align: 'center', base: 'middle', alfa: clamp01(kt * 1.5), ombra: { blur: 30, colore: 'rgba(0,0,0,.6)', y: 6 }, contorno: { colore: hexA(c2, 0.9), px: 8 } });
  c.restore();
  const ks = prog(q.t, 1.4, 0.9, E.p3out);
  const sottoA = tx(q, 'sotto', '').toUpperCase();
  const fSA = adatta(c, sottoA, (px) => `700 ${px}px ${FONT.montserrat}`, 60, q.w * 0.86, 10);
  scrivi(c, sottoA, q.w / 2, q.h / 2 + 230 + 14 * (1 - ks), { font: `700 ${fSA}px ${FONT.montserrat}`, colore: '#fff', align: 'center', base: 'middle', spazio: 10, alfa: ks, ombra: { blur: 20, colore: 'rgba(0,0,0,.6)' } });
  c.restore();
}

/** 6) Cuori che salgono */
function cuori(q: Q) {
  const { c } = q;
  const c1 = col(q, 'colore', '#ff4d6d'), c2 = col(q, 'colore2', '#ffb3c6');
  const n = num(q, 'quanti', 26);
  const u = prog(q.t, 0, 0.8, E.p2out) * resta(q, 0.8);
  for (let i = 0; i < n; i++) {
    const z = caso(i, 0), s = 26 + z * 70, vel = 80 + (1 - z) * 140 + caso(i, 5) * 40;
    const per = q.h + 260;
    const y = q.h + 130 - giro(q.t * vel + caso(i, 1) * per, per);
    const x = q.w * (0.04 + 0.92 * caso(i, 2)) + Math.sin(q.t * (0.8 + caso(i, 3)) + i * 2) * (24 + z * 50);
    const alto = clamp01(y / (q.h * 0.25));
    const a = (0.55 + 0.4 * z) * u * Math.min(1, alto + 0.05);
    c.save(); c.translate(x, y); c.rotate(Math.sin(q.t * 1.2 + i) * 0.25); c.globalAlpha = a;
    cuore(c, 0, 0, s);
    if (i % 4 === 0) { c.lineWidth = 4; c.strokeStyle = i % 2 ? c1 : c2; c.shadowColor = c.strokeStyle; c.shadowBlur = 14; c.stroke(); }
    else { const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2); g.addColorStop(0, chiaro(i % 2 ? c1 : c2, 0.25)); g.addColorStop(1, i % 2 ? c1 : c2); c.fillStyle = g; c.fill(); }
    c.restore();
  }
}

/** un petalo: una goccia stretta, centrata in (0,0) */
function petalo(c: Ctx2D, s: number) {
  c.beginPath();
  c.moveTo(0, -s);
  c.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.8, s * 0.55, 0, s);
  c.bezierCurveTo(-s * 0.8, s * 0.55, -s * 0.9, -s * 0.5, 0, -s);
  c.closePath();
}

/** 7) Petali */
function petali(q: Q) {
  const { c } = q;
  const c1 = col(q, 'colore', '#ffc2d1'), c2 = col(q, 'colore2', '#ffffff');
  const n = num(q, 'quanti', 40);
  const u = prog(q.t, 0, 0.8, E.p2out) * resta(q, 0.8);
  for (let i = 0; i < n; i++) {
    const z = caso(i, 0), s = 14 + z * 26, vel = 70 + z * 90;
    const per = q.h + 200;
    const y = giro(q.t * vel + caso(i, 1) * per, per) - 100;
    const x = q.w * caso(i, 2) + Math.sin(q.t * (0.5 + caso(i, 3) * 0.7) + i * 3) * (90 + z * 120) + Math.sin(q.t * 0.3 + i) * 40;
    const giraX = Math.cos(q.t * (1.2 + caso(i, 4)) + i);
    c.save(); c.translate(x, y); c.rotate(q.t * (0.4 + caso(i, 5)) * (i % 2 ? 1 : -1) + i);
    c.scale(0.35 + 0.65 * Math.abs(giraX), 1);
    c.globalAlpha = (0.65 + 0.3 * z) * u;
    petalo(c, s);
    const colore = i % 3 === 0 ? c2 : c1;
    const g = c.createLinearGradient(0, -s, 0, s); g.addColorStop(0, chiaro(colore, 0.25)); g.addColorStop(1, scuro(colore, 0.1));
    c.fillStyle = g; c.fill();
    c.restore();
  }
}

/** 8) Scintille dorate */
function scintille(q: Q) {
  const { c } = q;
  const oro = col(q, 'colore', '#ffd54a');
  const n = num(q, 'quante', 90);
  const u = prog(q.t, 0, 0.8, E.p2out) * resta(q, 0.8);
  for (let i = 0; i < n; i++) {
    const z = caso(i, 0), s = 7 + z * 24;
    const per = q.h + 120;
    const y = giro(q.t * (22 + z * 60) + caso(i, 1) * per, per) - 60;
    const x = q.w * caso(i, 2) + Math.sin(q.t * 0.6 + i * 2.1) * 36;
    const tw = Math.pow(Math.abs(Math.sin(q.t * (1.4 + caso(i, 3) * 2.5) + i * 1.3)), 3);
    c.save(); c.globalAlpha = (0.15 + 0.85 * tw) * u;
    c.shadowColor = oro; c.shadowBlur = 12 + s;
    stella(c, x, y, s, 4, 0.16, Math.PI / 4 + q.t * 0.4);
    c.fillStyle = i % 5 === 0 ? '#fff' : oro; c.fill();
    c.restore();
  }
}

/** 9) Palloncini */
function palloncini(q: Q) {
  const { c } = q;
  const cols = [col(q, 'colore', '#ff4d6d'), col(q, 'colore2', '#35e8ff'), col(q, 'colore3', '#ffd23f')];
  const n = num(q, 'quanti', 14);
  const u = resta(q, 0.8);
  const per = q.h + 700;
  const ordine = Array.from({ length: n }, (_, i) => i).sort((a, b) => caso(a, 0) - caso(b, 0));
  for (const i of ordine) {
    const z = caso(i, 0), rx = 40 + z * 36, ry = rx * 1.26;
    const vel = 90 + (1 - z) * 110;
    const y = q.h + 250 - giro(q.t * vel + caso(i, 1) * per, per) + 100;
    const x = q.w * (0.06 + 0.88 * caso(i, 2)) + Math.sin(q.t * 0.9 + i * 2) * 36;
    const colore = cols[i % 3];
    c.save(); c.translate(x, y); c.rotate(Math.sin(q.t * 0.9 + i * 2 + 0.6) * 0.08); c.globalAlpha = u;
    // il filo
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, ry + 10); for (let k = 1; k <= 8; k++) c.lineTo(Math.sin(q.t * 2 + k * 0.7 + i) * 7 * (k / 8), ry + 10 + k * 22); c.stroke();
    // il corpo
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    const g = c.createRadialGradient(-rx * 0.35, -ry * 0.4, rx * 0.1, 0, 0, ry * 1.1);
    g.addColorStop(0, chiaro(colore, 0.55)); g.addColorStop(0.5, colore); g.addColorStop(1, scuro(colore, 0.35));
    c.fillStyle = g; c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 16; c.shadowOffsetY = 6; c.fill(); c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-rx * 0.42, -ry * 0.45, rx * 0.14, ry * 0.2, -0.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = scuro(colore, 0.2); c.beginPath(); c.moveTo(0, ry - 2); c.lineTo(-9, ry + 14); c.lineTo(9, ry + 14); c.closePath(); c.fill();
    c.restore();
  }
}

/** 10) Coriandoli: due cannoni dagli angoli in basso, e poi una pioggia dall'alto (con la resistenza dell'aria: salgono, rallentano e scendono ondeggiando) */
function coriandoli(q: Q) {
  const { c } = q;
  const cols = [col(q, 'colore', '#ff4d6d'), col(q, 'colore2', '#ffd23f'), col(q, 'colore3', '#35e8ff'), '#ffffff'];
  const n = num(q, 'quanti', 140);
  const fin = resta(q, 0.9, E.lineare);
  const K = 1.5, TERM = 300;
  for (let i = 0; i < n; i++) {
    const dalCannone = i % 3 !== 2;
    const lancio = dalCannone ? 0.12 + caso(i, 9) * 0.12 : 0.9 + caso(i, 9) * 1.4;
    const age = q.t - lancio;
    if (age < 0) continue;
    let x: number, y: number;
    if (dalCannone) {
      const lato = i % 2 ? 1 : -1;
      const ox = lato > 0 ? q.w * 0.03 : q.w * 0.97, oy = q.h + 20;
      // dalla verticale verso il centro, fra 18° e 55°
      const a = (18 + caso(i, 1) * 37) * Math.PI / 180;
      const v = 1100 + caso(i, 2) * 1100;
      const vx = Math.sin(a) * v * lato * -1, vy = -Math.cos(a) * v;
      const f = (1 - Math.exp(-K * age)) / K;
      x = ox + vx * f + Math.sin(age * 4 + i) * 26 * Math.min(1, age);
      y = oy + (vy + TERM) * f - TERM * age;
    } else {
      x = q.w * caso(i, 1) + Math.sin(age * 2.2 + i) * 60;
      y = -40 + TERM * 0.55 * age;
    }
    if (y > q.h + 40 || x < -40 || x > q.w + 40 || y < -80) continue;
    const w = 12 + caso(i, 3) * 20, h = 7 + caso(i, 4) * 12;
    const flip = Math.abs(Math.cos(age * (5 + caso(i, 5) * 8) + i));
    c.save(); c.translate(x, y); c.rotate(age * (2 + caso(i, 6) * 5) * (i % 2 ? 1 : -1) + i); c.scale(1, 0.2 + 0.8 * flip);
    c.globalAlpha = fin * Math.min(1, age * 6);
    c.fillStyle = cols[i % cols.length];
    if (i % 5 === 0) { c.beginPath(); c.arc(0, 0, w * 0.35, 0, Math.PI * 2); c.fill(); } else c.fillRect(-w / 2, -h / 2, w, h);
    c.restore();
  }
}

export const CERIMONIA: Record<string, (q: Q) => void> = {
  'cr-monogramma': monogramma, 'cr-cornice': cornice, 'cr-dedica': dedica, 'cr-data': data, 'cr-auguri': auguri,
  'cr-cuori': cuori, 'cr-petali': petali, 'cr-scintille': scintille, 'cr-palloncini': palloncini, 'cr-coriandoli': coriandoli,
};
