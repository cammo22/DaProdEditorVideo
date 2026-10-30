// Il pannello Proprietà «Banco»: le regole che ragionano senza DOM (schede, dB e LUFS, keyframe compatti, zoom sui clic,
// Ripristina e Copia su tutte) e il registro delle funzioni AI. Più un controllo sul sorgente: ogni sezione del vecchio
// ispettore ha una scheda dove stare (nessun comando deve sparire).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ambienteBrowser, carica } from './_aiuti.mjs';
ambienteBrowser();
const R = await carica('proprieta'), F = await carica('funzioniAI'), P = await carica('progetto');
const sorgente = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const vicino = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

function scena() {
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  const v1 = P.newClip('media', p.tracks[0].id, 0, 250, { media: 'm', name: 'Schermo' });
  const v2 = P.newClip('media', p.tracks[0].id, 300, 100, { media: 'n', name: 'Altra' });
  const a1 = P.newClip('media', p.tracks[2].id, 0, 100, { media: 'a', name: 'Voce' });
  const a2 = P.newClip('media', p.tracks[2].id, 200, 100, { media: 'b', name: 'Musica' });
  const fx = P.newClip('fx', p.tracks[0].id, 10, 20, { name: 'Blocco' });
  p.clips.push(v1, v2, a1, a2, fx);
  return { p, v1, v2, a1, a2, fx };
}


test('inventario: ogni sezione dell\'ispettore ha la sua scheda', () => {
  const s = sorgente('ui/ispettore.ts');
  const ids = new Set([...s.matchAll(/this\.gruppo\('([a-z]+)'/g)].map((m) => m[1]));
  // quelle dei blocchetti FX non hanno schede (il pannello dei blocchi è uno solo)
  for (const blocco of ['bdurata', 'btipo', 'bsuono']) ids.delete(blocco);
  assert.ok(ids.size >= 15, 'ho letto le sezioni: ' + [...ids].join(','));
  for (const id of ids) assert.ok(R.SEZIONI_CONOSCIUTE.includes(id), 'senza scheda: ' + id);
  // e ogni scheda nominata esiste
  for (const id of R.SEZIONI_CONOSCIUTE) assert.ok(R.SCHEDE.some((x) => x.id === R.schedaDiSezione(id)), id);
  assert.equal(R.schedaDiSezione('sconosciuta'), 'quadro');
  assert.deepEqual(R.SCHEDE.map((x) => x.nome), ['QUADRO', 'COLORE', 'AUDIO', 'AI']);
});

test('schede usabili: l\'immagine non ha volume, l\'audio non ha quadro, l\'AI c\'è sempre', () => {
  assert.deepEqual(R.schedeUsabili({ video: 1, audio: 0, conAudio: false }), { quadro: true, colore: true, audio: false, ai: true });
  assert.deepEqual(R.schedeUsabili({ video: 0, audio: 2, conAudio: false }), { quadro: false, colore: false, audio: true, ai: true });
  assert.equal(R.schedeUsabili({ video: 1, audio: 0, conAudio: true }).audio, true);
  const u = R.schedeUsabili({ video: 0, audio: 1, conAudio: false });
  assert.equal(R.schedaDaMostrare('quadro', u), 'audio', 'la scelta non si può: la prima che si può');
  assert.equal(R.schedaDaMostrare('ai', u), 'ai');
  assert.equal(R.schedaDaMostrare(null, R.schedeUsabili({ video: 1, audio: 0, conAudio: false })), 'quadro');
});

test('dB con il meno vero e la virgola; LUFS stimati dai picchi', () => {
  assert.equal(R.dbTesto(-3), '−3,0 dB');
  assert.equal(R.dbTesto(2.5), '+2,5 dB');
  assert.equal(R.dbTesto(0), '0,0 dB');
  assert.equal(R.dbTesto(-0.04), '0,0 dB');
  const costante = new Float32Array(500).fill(0.1);
  const l = R.lufsStimati(costante, 100, 0, 5, 0);
  vicino(l, -24.2, 0.05);
  vicino(R.lufsStimati(costante, 100, 0, 5, 6), l + 6, 0.05);
  // le pause non abbassano la sonorità (il gate relativo le toglie)
  const conPause = Float32Array.from({ length: 1000 }, (_, i) => (i % 100 < 70 ? 0.1 : 0.001));
  vicino(R.lufsStimati(conPause, 100, 0, 10, 0), l, 0.3);
  assert.equal(R.lufsStimati(new Float32Array(500), 100, 0, 5), null, 'silenzio');
  assert.equal(R.lufsStimati(undefined, 100, 0, 5), null);
  assert.equal(R.lufsStimati(costante, 100, 1, 1.02), null, 'troppo corto');
  assert.equal(R.lufsTesto(-14.2), '≈ −14 LUFS');
  assert.equal(R.lufsTesto(null), '— LUFS');
});

test('etichette AI: PRONTA / OPZIONALE / SPERIMENTALE con peso e VRAM', () => {
  assert.deepEqual(['pronta', 'opzionale', 'sperimentale'].map((s) => R.etichettaStato(s).testo), ['PRONTA', 'OPZIONALE', 'SPERIMENTALE']);
  assert.equal(R.etichettaStato('pronta').colore, 'var(--verde)');
  assert.equal(R.pesoEVram({ peso: '2,6 GB', vram: '4 GB' }), '2,6 GB · 4 GB VRAM');
  assert.equal(R.pesoEVram({ vram: '6 GB VRAM' }), '6 GB VRAM');
  assert.equal(R.pesoEVram({}), '');
});

test('keyframe in compatto: una posizione per ogni fotogramma con chiave', () => {
  const { v1 } = scena();
  assert.deepEqual(R.posizioniChiavi(v1), []);
  v1.anim = { 'tf.x': [{ f: 0, v: 0 }, { f: 100, v: 50 }], opacity: [{ f: 100, v: 1 }, { f: 249, v: 0 }] };
  const k = R.posizioniChiavi(v1);
  assert.deepEqual(k.map((x) => [x.f, x.quanti]), [[0, 1], [100, 2], [249, 1]]);
  vicino(k[0].frac, 0); vicino(k[2].frac, 1); vicino(k[1].frac, 100 / 249);
});

test('zoom sui clic: conta le visite e dice dove parte la prima', () => {
  const { p, v1, v2 } = scena();
  assert.equal(R.zoomSuiClic(p, v1), null, 'senza clic registrati');
  const m = { id: 'm', t0: 0, width: 1920, height: 1080, cursoreLive: { v: 1, campioni: [], clic: [{ tMs: 2000, cx: 0.5, cy: 0.5, button: 0 }, { tMs: 2500, cx: 0.5, cy: 0.5, button: 0 }, { tMs: 8000, cx: 0.2, cy: 0.2, button: 0 }] } };
  p.media.push(m);
  const z = R.zoomSuiClic(p, v1);
  assert.equal(z.n, 2, 'due clic vicini fanno una visita sola');
  assert.equal(z.primo, 38, '1500 ms a 25 fps');
  assert.equal(z.applicato, false);
  v1.tfFine = { ...v1.tf };
  assert.equal(R.zoomSuiClic(p, v1).applicato, true);
  assert.equal(R.zoomTesto(z), '2 zoom automatici');
  assert.equal(R.zoomTesto({ n: 1 }), '1 zoom automatico');
  assert.equal(R.zoomTesto({ n: 0 }), 'Nessun clic dentro questa parte');
  assert.equal(R.zoomTesto(null), 'Questa ripresa non ha clic registrati');
  assert.equal(R.zoomSuiClic(p, v2), null);
});

test('Ripristina: quadro, colore e audio tornano ai valori di partenza (e tolgono i keyframe)', () => {
  const { p, v1, a1 } = scena();
  v1.tf = { x: 120, y: -40, scale: 1.8, rot: 12, cropL: 0.1, cropR: 0, cropT: 0, cropB: 0, angoli: 0.5 };
  v1.tfFine = { ...v1.tf }; v1.via = [{ t: 0.5, tf: { ...v1.tf } }];
  v1.opacity = 0.4; v1.opKeys = [{ f: 0, v: 1 }];
  v1.anim = { 'tf.x': [{ f: 0, v: 0 }], 'fx.sat': [{ f: 0, v: 1 }] };
  assert.equal(R.ripristinaScheda('quadro', v1), true);
  assert.deepEqual(v1.tf, { x: 0, y: 0, scale: 1, rot: 0, cropL: 0, cropR: 0, cropT: 0, cropB: 0 });
  assert.equal(v1.tfFine, undefined); assert.equal(v1.via, undefined);
  assert.deepEqual([v1.opacity, v1.opKeys.length], [1, 0]);
  assert.deepEqual(Object.keys(v1.anim), ['fx.sat'], 'i keyframe del quadro vanno, quelli del colore restano');
  v1.fx.bright = 0.2; v1.fx.contrast = 1.3; v1.fx.sat = 0.5; v1.fx.hue = 20; v1.fx.temp = 0.4; v1.fx.look = 'vhs'; v1.fx.effetti = ['caldo']; v1.fx.key = 'chroma';
  R.ripristinaScheda('colore', v1);
  assert.deepEqual([v1.fx.bright, v1.fx.contrast, v1.fx.sat, v1.fx.hue, v1.fx.temp, v1.fx.look, v1.fx.effetti], [0, 1, 1, 0, 0, 'none', undefined]);
  assert.equal(v1.fx.key, 'chroma', 'lo sfondo tolto non si tocca');
  assert.equal(v1.anim, undefined);
  a1.gain = -9; a1.gainKeys = [{ f: 0, v: 0 }]; a1.pan = 0.5; a1.afx = { voce: true, radio: true, pulito: { media: 'x', srcIn: 0, forza: 'pulita', da: 0 } };
  R.ripristinaScheda('audio', a1);
  assert.deepEqual([a1.gain, a1.gainKeys.length, a1.pan, a1.afx.voce, a1.afx.radio], [0, 0, 0, undefined, undefined]);
  assert.ok(a1.afx.pulito, 'l\'audio già pulito con l\'AI resta com\'è');
  // la voce pulita tiene i dB aggiunti, la clip originale di una separazione resta muta, la normalizzazione si toglie
  a1.afx.pulito.piu = 3; a1.afx.norm = 4; a1.gain = -9;
  R.ripristinaScheda('audio', a1);
  assert.deepEqual([a1.gain, a1.afx.norm], [3, undefined]);
  const orig = { ...a1, gain: -60, afx: { separata: { ruolo: 'originale', con: [], gain: -2 } } };
  R.ripristinaScheda('audio', orig);
  assert.equal(orig.gain, -60, 'la clip originale separata non torna a suonare');
  const altra = { ...a1, gain: -5, afx: {} };
  R.copiaScheda('audio', orig, altra);
  assert.equal(altra.gain, -2, 'dalla clip originale si copia il volume di prima, non il muto');
  R.copiaScheda('audio', altra, orig);
  assert.equal(orig.gain, -60);
  assert.equal(R.ripristinaScheda('ai', a1), false);
  assert.ok(p);
});

test('Copia su tutte: solo le clip dello stesso genere, senza toccare quello che lega la clip al suo file', () => {
  const { p, v1, v2, a1, a2, fx } = scena();
  assert.deepEqual(R.destinatarieDellaCopia('quadro', v1, p).map((c) => c.id), [v2.id], 'il blocco FX non è una clip da regolare');
  assert.deepEqual(R.destinatarieDellaCopia('audio', a1, p).map((c) => c.id), [a2.id]);
  assert.deepEqual(R.destinatarieDellaCopia('audio', v1, p), [], 'un\'immagine non ha la scheda audio');
  assert.deepEqual(R.destinatarieDellaCopia('ai', v1, p), []);
  assert.equal(R.haProprieta('quadro', fx, p), false);
  v1.tf = { x: 50, y: 20, scale: 1.5, rot: 5, cropL: 0, cropR: 0, cropT: 0, cropB: 0 }; v1.opacity = 0.7;
  v1.fx.look = 'film'; v1.fx.sat = 1.4; v1.fx.effetti = ['caldo']; v1.fx.key = 'chroma'; v1.ritaglio = { modo: 'oggetti' };
  v2.opKeys = [{ f: 0, v: 1 }]; v2.anim = { 'tf.x': [{ f: 0, v: 3 }], 'fx.sat': [{ f: 0, v: 1 }] };
  assert.equal(R.copiaScheda('quadro', v1, v2), true);
  assert.deepEqual([v2.tf.x, v2.tf.scale, v2.opacity, v2.opKeys.length], [50, 1.5, 0.7, 0]);
  assert.notEqual(v2.tf, v1.tf, 'una copia, non lo stesso oggetto');
  assert.deepEqual(Object.keys(v2.anim), ['fx.sat']);
  R.copiaScheda('colore', v1, v2);
  assert.deepEqual([v2.fx.look, v2.fx.sat, v2.fx.effetti], ['film', 1.4, ['caldo']]);
  assert.notEqual(v2.fx.effetti, v1.fx.effetti);
  assert.equal(v2.fx.key, 'none', 'la chiave a colori e lo sfondo AI non si copiano');
  assert.equal(v2.ritaglio, undefined);
  a1.gain = -6; a1.pan = -0.3; a1.afx = { voce: true, separata: { ruolo: 'voce', con: [] } };
  a2.afx = { eco: true };
  R.copiaScheda('audio', a1, a2);
  assert.deepEqual([a2.gain, a2.pan, a2.afx.voce, a2.afx.eco, a2.afx.separata], [-6, -0.3, true, undefined, undefined]);
  assert.equal(R.copiaScheda('quadro', v1, v1), false);
  assert.equal(R.copiaScheda('ai', v1, v2), false);
});
