import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienteBrowser, carica } from './_aiuti.mjs';
ambienteBrowser();
const D = await carica('ducking'), P = await carica('progetto'), A = await carica('audio'), Mont = await carica('montaggio');
const vicino = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
function scena() {
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  const voce = P.newClip('media', p.tracks[2].id, 25, 100, { media: 'v', ruoloAudio: 'voce' });
  const musica = P.newClip('media', p.tracks[3].id, 0, 500, { media: 'm', ruoloAudio: 'musica', ducking: { ...D.DUCKING0, attivo: true } });
  p.clips.push(voce, musica); p.media.push({ id: 'v', size: 1000, lastModified: 1 });
  return { p, voce, musica };
}
function energia(canali, sr = 1000, tagli = []) {
  const a = new D.AnalizzatoreRms(), out = [];
  let da = 0;
  for (const fine of [...tagli, canali[0].length]) { out.push(...a.push(canali.map((c) => c.slice(da, fine)), sr, da / sr)); da = fine; }
  const ultimo = a.fine(); if (ultimo) out.push(ultimo);
  return out;
}
test('RMS: silenzio, solo destro, controfase; stessi valori attraverso i chunk', () => {
  const sil = new Float32Array(1000), dx = Float32Array.from({ length: 1000 }, (_, i) => i >= 200 && i < 800 ? .5 : 0);
  const lettura = energia([sil, dx]), spezzata = energia([sil, dx], 1000, [13, 201, 444, 799]);
  assert.deepEqual(lettura, spezzata);
  vicino(lettura[10].db, 10 * Math.log10(.125));
  const controfase = energia([dx, dx.map((x) => -x)]);
  vicino(controfase[10].db, 20 * Math.log10(.5));
  assert.ok(energia([sil]).every((w) => w.db <= -100));
  const { p, voce } = scena();
  assert.deepEqual(D.presenzaVoce(p, voce, energia([sil]), D.DUCKING0), []);
  const ranges = D.presenzaVoce(p, voce, lettura, D.DUCKING0);
  vicino(ranges[0].da, 1.2); vicino(ranges[0].a, 2);
});

test('Presenza: trim, velocità, soglia con isteresi, minimo, hold e volume', () => {
  const { p, voce } = scena(); voce.srcIn = 2; voce.speed = 2;
  const d = { ...D.DUCKING0, minimo: .05, hold: .1 };
  const finestre = [{ da: 1, a: 2, db: 0 }, { da: 2, a: 2.2, db: -30 }, { da: 2.2, a: 2.4, db: -34 }, { da: 2.4, a: 2.6, db: -50 }, { da: 2.6, a: 2.62, db: -10 }];
  const ranges = D.presenzaVoce(p, voce, finestre, d);
  assert.equal(ranges.length, 1); vicino(ranges[0].da, 1); vicino(ranges[0].a, 1.3);
  voce.gain = -60; assert.deepEqual(D.presenzaVoce(p, voce, finestre, d), []);
});

test('Ruoli clip/traccia, mute e solo: solo le sorgenti in ascolto attivano il ducking', () => {
  const { p, voce } = scena(); const t = p.tracks[2];
  assert.equal(D.vociDucking(p).length, 1);
  delete voce.ruoloAudio; t.ruoloAudio = 'voce'; assert.equal(D.vociDucking(p).length, 1);
  voce.ruoloAudio = 'nessuno'; assert.equal(D.vociDucking(p).length, 0);
  delete voce.ruoloAudio; t.mute = true; assert.equal(D.vociDucking(p).length, 0);
  t.mute = false; p.tracks[3].solo = true; assert.equal(D.vociDucking(p).length, 0);
  t.solo = true; assert.equal(D.vociDucking(p).length, 1);
});

test('La coda della voce negli incroci partecipa all’analisi e alla firma', () => {
  const { p, voce, musica } = scena();
  const dopo = P.newClip('media', voce.track, voce.start + voce.len, 100, { trIn: P.newTransition('mix', 25) });
  p.clips.push(dopo);
  assert.equal(D.codaVoce(p, voce), 25);
  const d = { ...D.DUCKING0, hold: 0, minimo: 0 };
  const ranges = D.presenzaVoce(p, voce, [{ da: 3.8, a: 4, db: -10 }, { da: 4, a: 4.4, db: -10 }], d);
  vicino(ranges[0].da, 4.8); vicino(ranges[0].a, 5.4);
  const firma = D.firmaDucking(p, musica); dopo.trIn.len = 10;
  assert.notEqual(D.firmaDucking(p, musica), firma);
});

test('Inviluppo: attacco prima della voce, rilascio, sovrapposizioni e inizio/fine musica', () => {
  const { p, musica } = scena(); const d = { ...D.DUCKING0, attacco: .2, rilascio: .4, quantita: 12 };
  const keys = D.generaDuckKeys(p, musica, [{ da: 2, a: 3 }, { da: 2.5, a: 4 }, { da: 4.1, a: 5 }], d);
  vicino(P.keyValue(keys, 1.8 * 25, 0), 0); vicino(P.keyValue(keys, 1.9 * 25, 0), -6);
  vicino(P.keyValue(keys, 4.05 * 25, 0), -12); vicino(P.keyValue(keys, 5.2 * 25, 0), -6);
  const bordo = D.generaDuckKeys(p, musica, [{ da: 0, a: 1 }, { da: 19, a: 21 }], d);
  assert.equal(bordo[0].v, -12); assert.equal(bordo.at(-1).v, -12);
  assert.ok(bordo.every((k, i) => k.f >= 0 && k.f <= musica.len && (!i || k.f > bordo[i - 1].f)));
  assert.deepEqual(D.generaDuckKeys(p, musica, [], d), []);
});

test('Volume: duck dB separati da gainKeys/fade, punti anche frazionari, riapertura', () => {
  const { p, musica } = scena();
  musica.gainKeys = [{ f: 0, v: -6 }, { f: 100, v: 0 }]; musica.fadeIn = 25;
  const manuali = structuredClone(musica.gainKeys), senza = A.guadagnoClip(musica, 12.5, 0);
  musica.duckKeys = [{ f: 0, v: -12 }, { f: 50.3, v: -12 }, { f: 60.8, v: 0 }]; musica.duckFirma = D.firmaDucking(p, musica);
  vicino(A.guadagnoClip(musica, 12.5, 0), senza * 10 ** (-12 / 20));
  assert.deepEqual(musica.gainKeys, manuali); assert.ok(A.puntiInviluppo(musica, 0).includes(50.3));
  assert.ok(A.puntiInviluppo(musica, 0).some((f) => f > 50.3 && f < 60.8));
  const aperto = JSON.parse(JSON.stringify(p)); assert.equal(D.duckingValido(aperto, aperto.clips[1]), true);
  const fine = A.guadagnoClip(musica, musica.len, 0); assert.ok(fine > 0);
});

test('Firma: invalida su montaggio e trattamento, non sul volume manuale della musica; disattiva senza distruggere', () => {
  const { p, voce, musica } = scena(); musica.duckKeys = [{ f: 0, v: -12 }, { f: 500, v: -12 }];
  musica.duckFirma = D.firmaDucking(p, musica);
  assert.equal(D.duckingValido(p, musica), true); musica.gain = -3; assert.equal(D.duckingValido(p, musica), true);
  const copia = structuredClone(p);
  for (const modifica of [(p) => p.clips[0].start++, (p) => p.clips[0].srcIn++, (p) => p.clips[0].speed = 2,
    (p) => p.clips[0].afx = { voce: true }, (p) => p.tracks[2].mute = true, (p) => p.media[0].lastModified++,
    (p) => p.clips[1].len--, (p) => p.clips[1].ducking.quantita = 18]) {
    const q = structuredClone(copia); modifica(q); assert.equal(D.duckingValido(q, q.clips[1]), false);
    assert.equal(D.conDucking(q).clips[1].duckKeys, undefined); assert.ok(q.clips[1].duckKeys.length);
  }
  musica.ducking.attivo = false; assert.equal(A.conIncroci(p).clips[1].duckKeys, undefined);
  musica.ducking.attivo = true; assert.deepEqual(A.conIncroci(p).clips[1].duckKeys, musica.duckKeys);
  const right = Mont.splitClip(p, voce, 75); assert.ok(right); assert.equal(D.duckingValido(p, musica), false);
});

test('Gain programmato: seek e cucitura offline a 10 s hanno lo stesso inviluppo', () => {
  const { p, musica } = scena();
  musica.duckKeys = D.generaDuckKeys(p, musica, [{ da: 10.05, a: 10.3 }], D.DUCKING0);
  const programma = (t0, inizio, now) => {
    const eventi = [];
    const g = { gain: { cancelScheduledValues: () => {}, setValueAtTime: (v, t) => eventi.push({ v, t }), linearRampToValueAtTime: (v, t) => eventi.push({ v, t }) } };
    A.applicaInviluppo(g, p, musica, 0, t0, inizio, now);
    assert.ok(eventi.every((x, i) => x.t >= now && (!i || x.t > eventi[i - 1].t)));
    return eventi.map((e) => ({ v: e.v, t: e.t - t0 + inizio }));
  };
  const completo = programma(50, 0, 50), pezzo = programma(0, 8.5, 0), seek = programma(20, 10, 20);
  vicino(seek[0].v, 10 ** (-8 / 20)); // a 10 s: due terzi della discesa da 0 a -12 dB
  const al = (ev, t) => {
    const i = ev.findIndex((e) => e.t >= t); if (i <= 0) return ev[Math.max(0, i)].v;
    const a = ev[i - 1], b = ev[i]; return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);
  };
  for (const sec of [10, 10.001, 10.025, 10.3, 10.6]) {
    vicino(al(completo, sec), al(pezzo, sec), 1e-9);
    vicino(al(completo, sec), al(seek, sec), .001);
  }
});
