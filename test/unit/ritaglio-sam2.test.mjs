import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';
ambienteBrowser(); memoriaFinta();
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const intervallo = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t = intervallo(...args); t.unref(); return t; };
const P = await carica('progetto');
const PR = await carica('progetti');
const RT = await carica('ritaglio');
const AI = await carica('modelliAI');

test('SAM 2.1 è il modello proposto e non scarica SAM 3', () => {
  const m = RT.modelloRitaglio('sam2');
  assert.equal(RT.modelloDiPartenza('oggetti'), 'sam2');
  assert.equal(m.repo[0], 'CardAnvilModels/sam2.1-hiera-tiny-ONNX');
  assert.equal(m.licenza, 'Apache-2.0');
  assert.ok(!RT.MODELLI_RITAGLIO.some(x => x.id === 'sam3' || x.repo.some(r => /sam3/i.test(r))));
  assert.equal(RT.modelloDi({ modo: 'oggetti', modello: 'sam3' }).id, 'sam2');
  assert.ok(AI.modelliHub().some(x => x.id === 'sam2' && x.consigliato));
});

test('aprire migra le clip di ogni timeline e invalida soltanto le vecchie maschere', () => {
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  const r = { modo: 'oggetti', modello: 'sam3', punti: [{ x: 0.3, y: 0.4, dentro: true }], firma: 'vecchia', preciso: true, segui: true };
  const t = p.tracks.find(x => x.kind === 'video').id;
  const clip = (ritaglio) => P.newClip('bars', t, 0, 100, { ritaglio });
  p.clips.push(clip(structuredClone(r)), clip({ ...r, modello: 'sam2', firma: 'buona' }));
  p.sequenze = [{ clips: [clip(structuredClone(r))] }];
  const aperto = PR._testValida(p);
  for (const c of [aperto.clips[0], aperto.sequenze[0].clips[0]]) {
    assert.equal(c.ritaglio.modello, 'sam2');
    assert.equal(c.ritaglio.firma, undefined);
    assert.equal(c.ritaglio.preciso, undefined);
    assert.deepEqual(c.ritaglio.punti, r.punti);
    assert.equal(c.ritaglio.segui, true);
  }
  assert.equal(aperto.clips[1].ritaglio.firma, 'buona');
  assert.deepEqual(PR._testValida(structuredClone(aperto)), aperto);
});
