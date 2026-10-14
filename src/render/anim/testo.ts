// I testi che si muovono: parole che salgono, decodifica, parola che cambia, colpi da trailer, evidenziatore, titolo con riga,
// scritta a mano. Idee dai componenti "text effects" di HyperFrames (per-word-rise, scramble-reveal, kinetic-type-swap…).
import { E, Q, adatta, caso, chiaro, col, famiglia, hexA, larg, num, prog, resta, rettTondo, righe, scrivi, scriviSfocato, sopra, tx, lerp, clamp01 } from './base';

const grande = (q: Q, base: number) => base * (num(q, 'dim', 100) / 100);
/** la parola più lunga (una parola sola non va a capo: è lei che decide quanto può essere grande il testo) */
const piuLunga = (s: string) => s.split(/\s+/).reduce((a, p) => (p.length > a.length ? p : a), '');

/** 1) Parole che salgono (da sfocate a nitide) */
function parole(q: Q) {
  const { c } = q;
  const testo = tx(q, 'testo', 'Un giorno speciale');
  const fam = famiglia(q.v, 'font');
  const max = q.w * 0.82;
  const size = adatta(c, piuLunga(testo), (px) => `700 ${px}px ${fam}`, grande(q, 100), max);
  const font = `700 ${size}px ${fam}`;
  const unaLettera = q.v.unita === 'lettera';
  const rr = righe(c, testo, font, max);
  const lh = size * 1.18;
  const y0 = (q.h - rr.length * lh) / 2;
  // le unità: parole o lettere, in ordine
  const unita: { s: string; x: number; y: number }[] = [];
  rr.forEach((riga, ri) => {
    const parti = unaLettera ? [...riga] : riga.split(' ');
    const sp = larg(c, ' ', font);
    const tot = unaLettera ? larg(c, riga, font) : parti.reduce((a, p) => a + larg(c, p, font), 0) + sp * (parti.length - 1);
    let x = (q.w - tot) / 2;
    for (const p of parti) { unita.push({ s: p, x, y: y0 + ri * lh }); x += larg(c, p, font) + (unaLettera ? 0 : sp); }
  });
  const n = unita.length;
  const passo = Math.min(0.16, 1.9 / Math.max(1, n));
  const u = resta(q, 0.45);
  unita.forEach((w, i) => {
    const t = prog(q.t, 0.2 + i * passo, 0.7, E.p3out);
    if (t <= 0) return;
    const y = w.y + 46 * (1 - t) - 20 * (1 - u);
    scriviSfocato(c, w.s, w.x, y, { font, colore: col(q, 'colore', '#ffffff'), base: 'top', alfa: Math.min(1, t * 1.6) * u, ombra: { blur: 24, colore: 'rgba(0,0,0,.45)' } }, 16 * (1 - t));
  });
}

/** 2) Decodifica */
const GLIFI = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$<>/\\=+*';
function decodifica(q: Q) {
  const { c } = q;
  const testo = tx(q, 'testo', 'DA PROD VIDEO');
  const colore = col(q, 'colore', '#46e5b7');
  const term = q.v.stile !== 'pulito';
  const monoF = (px: number) => `700 ${px}px "Space Mono", "Courier New", monospace`;
  const size = adatta(q.c, (term ? '> ' : '') + testo, monoF, grande(q, 120), q.w * 0.8);
  const font = monoF(size);
  const prefisso = term ? '> ' : '';
  const tot = prefisso + testo;
  const w = larg(c, tot, font);
  const x0 = (q.w - w) / 2, yb = q.h / 2 + size * 0.34;
  const u = resta(q, 0.4);
  c.save(); c.globalAlpha = u;
  if (term) {
    const px = 60, py = 46;
    rettTondo(c, x0 - px, yb - size * 0.86 - py, w + px * 2, size + py * 2, 18);
    c.fillStyle = 'rgba(6,10,14,.82)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = hexA(colore, 0.85); c.stroke();
  }
  const fine = 0.35 + testo.length * 0.09 + 0.6;
  const fatti = clamp01((q.t - 0.35) / Math.max(0.1, fine - 0.35 - 0.6)) * testo.length;
  const m = larg(c, prefisso, font);
  scrivi(c, prefisso, x0, yb, { font, colore: hexA(colore, 0.7) });
  let x = x0 + m;
  [...testo].forEach((ch, i) => {
    const cw = larg(c, ch, font);
    let s = ch;
    const bloccato = i < Math.floor(fatti) || ch === ' ';
    if (!bloccato) s = GLIFI[Math.floor(caso(i, Math.floor(q.t * 24)) * GLIFI.length)];
    const attivo = i === Math.floor(fatti);
    scrivi(c, s, x, yb, { font, colore: bloccato ? chiaro(colore, 0.55) : colore, alfa: bloccato ? 1 : (q.t < 0.35 ? 0 : 0.55 + (attivo ? 0.45 : 0)), ombra: { blur: bloccato ? 0 : 18, colore: colore, y: 0 } });
    x += cw;
  });
  // il cursore che lampeggia
  if (Math.floor(q.t * 2.4) % 2 === 0 || fatti < testo.length) { c.fillStyle = colore; c.fillRect(x + 6, yb - size * 0.78, size * 0.5, size * 0.9); }
  c.restore();
}

/** 3) Parola che cambia */
function cambia(q: Q) {
  const { c } = q;
  const prima = tx(q, 'prima', '');
  const dopo = tx(q, 'dopo', '');
  const opz = String(q.v.opzioni ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!opz.length) opz.push('…');
  const fam = famiglia(q.v, 'font');
  const piu = [prima, ...opz, dopo].filter(Boolean).join(' ');
  const size = adatta(c, piu, (px) => `700 ${px}px ${fam}`, grande(q, 100), q.w * 0.84);
  const font = `700 ${size}px ${fam}`;
  const colore = col(q, 'colore', '#ffd23f');
  const sp = larg(c, ' ', font);
  const slotW = Math.max(...opz.map((s) => larg(c, s, font)));
  const w1 = prima ? larg(c, prima, font) + sp : 0, w3 = dopo ? sp + larg(c, dopo, font) : 0;
  const tot = w1 + slotW + w3;
  const x0 = (q.w - tot) / 2, yb = q.h / 2 + size * 0.34;
  const lh = size * 1.25;
  const u = resta(q, 0.4);
  const per = Math.max(0.55, Math.min(0.9, 3.2 / opz.length));
  const inizio = 0.7;
  c.save(); c.globalAlpha = u;
  const ent = prog(q.t, 0.1, 0.6, E.p3out);
  c.globalAlpha *= ent;
  if (prima) scrivi(c, prima, x0, yb, { font, colore: '#fff', ombra: { blur: 22, colore: 'rgba(0,0,0,.45)' } });
  if (dopo) scrivi(c, dopo, x0 + w1 + slotW + sp, yb, { font, colore: '#fff', ombra: { blur: 22, colore: 'rgba(0,0,0,.45)' } });
  // la finestra dove girano le parole
  c.save();
  c.beginPath(); c.rect(x0 + w1 - 20, yb - size * 1.0, slotW + 40, lh); c.clip();
  const k = (q.t - inizio) / per;
  // k = 0 → mostra opz[0]; ogni "per" secondi si passa alla successiva con un rotolo
  const idx = Math.max(0, Math.min(opz.length - 1, Math.floor(k)));
  const frac = k < 0 ? 0 : idx >= opz.length - 1 ? 1 : prog(k - idx, 0.0, 0.5, E.p3io) * 1;
  const cur = k < 0 ? 0 : idx, nxt = Math.min(opz.length - 1, cur + 1);
  const rotolo = k < 0 || cur >= opz.length - 1 ? 0 : frac;
  const slotX = x0 + w1;
  scrivi(c, opz[cur], slotX, yb - lh * rotolo, { font, colore, alfa: 1 - rotolo * 0.6, ombra: { blur: 22, colore: 'rgba(0,0,0,.4)' } });
  if (cur !== nxt) scrivi(c, opz[nxt], slotX, yb + lh * (1 - rotolo), { font, colore, alfa: 0.4 + rotolo * 0.6, ombra: { blur: 22, colore: 'rgba(0,0,0,.4)' } });
  c.restore();
  c.restore();
}

/** 4) Parole a colpo */
function colpo(q: Q) {
  const { c } = q;
  const testo = tx(q, 'testo', 'È ARRIVATO IL MOMENTO');
  const fam = famiglia(q.v, 'font', 'archivo');
  const size = adatta(c, piuLunga(testo), (px) => `900 ${px}px ${fam}`, grande(q, 150), q.w * 0.86);
  const font = `900 ${size}px ${fam}`;
  const par = testo.split(/\s+/).filter(Boolean);
  const lh = size * 1.1;
  const sp = larg(c, ' ', font);
  // le righe: ogni riga ha le sue parole
  const max = q.w * 0.86;
  const rr: { s: string; w: number; i: number }[][] = [[]];
  let rw = 0;
  par.forEach((p, i) => {
    const w = larg(c, p, font);
    if (rw && rw + sp + w > max) { rr.push([]); rw = 0; }
    rr[rr.length - 1].push({ s: p, w, i });
    rw += (rw ? sp : 0) + w;
  });
  const y0 = (q.h - rr.length * lh) / 2;
  const u = resta(q, 0.4);
  const passo = 0.32, t0 = 0.15;
  rr.forEach((riga, ri) => {
    const tot = riga.reduce((a, p) => a + p.w, 0) + sp * (riga.length - 1);
    let x = (q.w - tot) / 2;
    riga.forEach((p) => {
      const ti = t0 + p.i * passo;
      const k = prog(q.t, ti, 0.2, E.p4out);
      if (k > 0) {
        const ultima = p.i === par.length - 1;
        const dopo = q.t - ti;
        // la scossa dopo l'urto
        const sc = lerp(2.6, 1, k);
        const sh = dopo > 0.08 ? Math.sin(dopo * 60) * Math.exp(-dopo * 12) * 10 : 0;
        c.save();
        c.translate(x + p.w / 2 + sh, y0 + ri * lh + lh * 0.5);
        c.rotate((caso(p.i, 3) - 0.5) * 0.06 * (1 - k));
        c.scale(sc, sc);
        scrivi(c, p.s, -p.w / 2, 0, { font, colore: ultima ? col(q, 'evidenzia', '#ffd23f') : col(q, 'colore', '#fff'), base: 'middle', alfa: Math.min(1, k * 3) * u, ombra: { blur: 26, colore: 'rgba(0,0,0,.6)', y: 6 }, contorno: { colore: 'rgba(0,0,0,.55)', px: 8 } });
        c.restore();
      }
      x += p.w + sp;
    });
  });
}

/** 5) Evidenziatore a mano: il pennarello passa sulla parola e, dove è passato, la parola diventa scura */
function penna(q: Q) {
  const { c } = q;
  const testo = tx(q, 'testo', 'La cosa più importante è esserci');
  const parola = tx(q, 'parola', '');
  const fam = famiglia(q.v, 'font');
  const size = adatta(c, piuLunga(testo), (px) => `700 ${px}px ${fam}`, grande(q, 92), q.w * 0.82);
  const font = `700 ${size}px ${fam}`;
  const rr = righe(c, testo, font, q.w * 0.82);
  const lh = size * 1.3;
  const y0 = (q.h - rr.length * lh) / 2;
  const u = resta(q, 0.4);
  const a = prog(q.t, 0.1, 0.6, E.p3out);
  const pennarello = col(q, 'pennarello', '#ffd23f');
  const bianco = col(q, 'colore', '#ffffff'), scuroT = sopra(pennarello);
  rr.forEach((riga, ri) => {
    const tot = larg(c, riga, font);
    const x0 = (q.w - tot) / 2, y = y0 + ri * lh + 14 * (1 - a);
    const pos = parola ? riga.toLowerCase().indexOf(parola.toLowerCase()) : -1;
    c.save(); c.globalAlpha = u;
    const o = { font, base: 'top' as const, alfa: a, ombra: { blur: 20, colore: 'rgba(0,0,0,.4)' } };
    if (pos < 0) { scrivi(c, riga, x0, y, { ...o, colore: bianco }); c.restore(); return; }
    const xi = x0 + larg(c, riga.slice(0, pos), font), wi = larg(c, riga.slice(pos, pos + parola.length), font);
    const k = prog(q.t, 0.9, 0.6, E.p3io);
    // il pennarello: un rettangolo un po' storto dietro la parola, che si scopre da sinistra
    c.save();
    c.beginPath(); c.rect(xi - 24, y - 10, (wi + 48) * k, lh); c.clip();
    c.fillStyle = hexA(pennarello, 0.92);
    c.beginPath();
    c.moveTo(xi - 14, y + lh * 0.1); c.lineTo(xi + wi + 10, y + lh * 0.05); c.lineTo(xi + wi + 16, y + lh * 0.82); c.lineTo(xi - 8, y + lh * 0.86); c.closePath(); c.fill();
    c.restore();
    // la riga in bianco; sopra, dentro la parte coperta dal pennarello, la parola in scuro
    scrivi(c, riga, x0, y, { ...o, colore: bianco });
    c.save(); c.beginPath(); c.rect(xi - 24, y - 10, (wi + 24) * k, lh); c.clip();
    scrivi(c, riga.slice(pos, pos + parola.length), xi, y, { font, base: 'top', colore: scuroT, alfa: a });
    c.restore();
    c.restore();
  });
}

/** 6) Titolo con riga */
function titolo(q: Q) {
  const { c } = q;
  const t = tx(q, 'titolo', 'Una storia lunga un giorno');
  const s = tx(q, 'sottotitolo', '');
  const fam = famiglia(q.v, 'font', 'playfair');
  const size = adatta(c, piuLunga(t), (px) => `700 ${px}px ${fam}`, grande(q, 120), q.w * 0.8);
  const f1 = `700 ${size}px ${fam}`;
  const rr = righe(c, t, f1, q.w * 0.8);
  const lh = size * 1.12;
  const hT = rr.length * lh;
  const yT = q.h / 2 - hT / 2 - (s ? size * 0.3 : 0);
  const u = resta(q, 0.45);
  rr.forEach((riga, i) => {
    const k = prog(q.t, 0.15 + i * 0.12, 0.8, E.p4out);
    const w = larg(c, riga, f1), x = (q.w - w) / 2, y = yT + i * lh;
    c.save();
    c.beginPath(); c.rect(x - 20, y, w + 40, lh); c.clip();
    scrivi(c, riga, x, y + lh * 0.9 * (1 - k) + (1 - u) * -20, { font: f1, colore: col(q, 'colore', '#fff'), base: 'top', alfa: u, ombra: { blur: 24, colore: 'rgba(0,0,0,.5)' } });
    c.restore();
  });
  const ly = yT + hT + size * 0.16;
  const lw = Math.min(q.w * 0.5, 620) * prog(q.t, 0.7, 0.8, E.p4out);
  c.fillStyle = hexA(col(q, 'accento', '#ffd23f'), u);
  c.fillRect(q.w / 2 - lw / 2, ly, lw, 5);
  const f2px = s ? adatta(c, s.toUpperCase(), (px) => `500 ${px}px "Montserrat", sans-serif`, size * 0.34, q.w * 0.84, size * 0.06) : 0;
  if (s) scrivi(c, s.toUpperCase(), q.w / 2, ly + 34 + 18 * (1 - prog(q.t, 1.1, 0.7, E.p3out)), { font: `500 ${f2px}px "Montserrat", sans-serif`, colore: '#fff', align: 'center', base: 'top', spazio: size * 0.06, alfa: prog(q.t, 1.1, 0.6, E.p2out) * u, ombra: { blur: 18, colore: 'rgba(0,0,0,.5)' } });
}

/** 7) Scritta a mano */
function scrivi2(q: Q) {
  const { c } = q;
  const testo = tx(q, 'testo', 'Grazie di cuore');
  const fam = famiglia(q.v, 'font', 'caveat');
  const size = adatta(c, testo, (px) => `700 ${px}px ${fam}`, grande(q, 190), q.w * 0.8);
  const font = `700 ${size}px ${fam}`;
  const w = larg(c, testo, font), x0 = (q.w - w) / 2, yb = q.h / 2 + size * 0.2;
  const u = resta(q, 0.45);
  const k = prog(q.t, 0.25, Math.min(2.4, 0.5 + testo.length * 0.11), E.p2io);
  c.save(); c.globalAlpha = u;
  c.beginPath(); c.rect(x0 - 30, yb - size * 1.2, (w + 60) * k, size * 1.9); c.clip();
  scrivi(c, testo, x0, yb, { font, colore: col(q, 'colore', '#fff'), ombra: { blur: 22, colore: 'rgba(0,0,0,.5)' } });
  c.restore();
  // la sottolineatura a mano libera
  const kk = prog(q.t, 0.25 + Math.min(2.4, 0.5 + testo.length * 0.11), 0.7, E.p3out);
  if (kk > 0) {
    c.save(); c.globalAlpha = u;
    c.strokeStyle = col(q, 'accento', '#ff4d6d'); c.lineWidth = Math.max(5, size * 0.04); c.lineCap = 'round';
    const y = yb + size * 0.2, per = w * 1.1;
    c.setLineDash([per * kk, per]);
    c.beginPath(); c.moveTo(x0, y + 6);
    c.bezierCurveTo(x0 + w * 0.25, y - 14, x0 + w * 0.55, y + 20, x0 + w, y - 4);
    c.stroke();
    c.restore();
  }
}

export const TESTO: Record<string, (q: Q) => void> = {
  'tx-parole': parole, 'tx-decodifica': decodifica, 'tx-cambia': cambia, 'tx-colpo': colpo, 'tx-penna': penna, 'tx-titolo': titolo, 'tx-scrivi': scrivi2,
};
