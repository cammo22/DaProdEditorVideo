import test from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const T = await carica('montaggioTesto'), P = await carica('progetto');
const progetto = () => P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });

test('solo parole con tempi veri, e conversione dopo trim e velocità', () => {
  assert.deepEqual(T.paroleDaPezzi([{ da: 0, a: 1, testo: ' due parole' }, { da: 1, a: 2, testo: ' ciao' }, { da: 2, a: null, testo: 'fine' }], 3), [{ da: 1, a: 2, testo: 'ciao' }]);
  const p = progetto(), c = P.newClip('media', p.tracks[0].id, 100, 50, { media: 'm', srcIn: 2, speed: 2, parlato: { id: 'p', media: 'm', da: 0, a: 8, parole: [{ da: 2.4, a: 3.2, testo: 'ciao' }] } });
  assert.deepEqual(T.paroleInClip(p, c), [{ da: 105, a: 115, testo: 'ciao', clip: c.id }]);
});

test('selezione, pause e intercalari producono intervalli precisi', () => {
  const w = [{ da: 10, a: 15, testo: 'ehm', clip: 'c' }, { da: 20, a: 25, testo: 'allora', clip: 'c' }, { da: 30, a: 35, testo: 'Allora!', clip: 'c' }];
  assert.deepEqual(T.intervalliParole(w, new Set([0, 1])), [{ da: 10, a: 25 }]);
  assert.deepEqual(T.intervalliSilenzi(w, { da: 0, a: 50 }, 9, 1), [{ da: 1, a: 9 }, { da: 36, a: 49 }]);
  assert.deepEqual(T.intervalliIntercalari(w, 'ehm, allora'), [{ da: 10, a: 15 }, { da: 30, a: 35 }]);
});

test('ripple su tutte le tracce, segni e sottotitoli; testo conservato', () => {
  const p = progetto(), v = P.newClip('media', p.tracks[0].id, 0, 100, { media: 'm', link: 'l', parlato: { id: 'p', media: 'm', da: 0, a: 4, parole: [{ da: 0.4, a: 0.6, testo: 'uno' }, { da: 2.4, a: 2.6, testo: 'due' }] } });
  const a = P.newClip('media', p.tracks[2].id, 0, 100, { media: 'm', link: 'l' });
  p.clips = [v, a]; p.markers = [{ f: 80, name: 'segno' }]; p.inF = 15; p.outF = 90;
  p.sottotitoli = { righe: [{ id: 's', da: 10, a: 80, testo: 'ciao' }] };
  const piano = T.pianoTagli([{ da: 20, a: 40 }, { da: 30, a: 50 }], p);
  assert.equal(piano.secondi, 1.2); T.applicaTagli(p, piano);
  assert.deepEqual(p.clips.filter(c => c.track === v.track).map(c => [c.start, c.len, c.srcIn]).sort((x,y) => x[0]-y[0]), [[0,20,0],[20,50,2]]);
  assert.equal(p.markers[0].f, 50); assert.equal(p.outF, 60); assert.equal(p.sottotitoli.righe[0].a, 50);
  assert.deepEqual(p.clips.filter(c => c.track === v.track).flatMap(c => T.paroleInClip(p,c)).map(w => w.testo), ['uno','due']);
  assert.equal(p.clips.filter(c => c.track === a.track).length, 2);
});

test('una traccia bloccata impedisce modifiche parziali', () => {
  const p = progetto(); p.clips = [P.newClip('media', p.tracks[0].id, 0, 100)]; p.tracks[0].lock = true;
  const prima = structuredClone(p); assert.throws(() => T.applicaTagli(p, T.pianoTagli([{ da: 10, a: 20 }], p)), /Sblocca/); assert.deepEqual(p, prima);
});
