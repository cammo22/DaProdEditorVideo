import test from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const S = await carica('sceneLive'), P = await carica('progetto'), A = await carica('automazioni');
const p = P.newProject({ w: 1920, h: 1080, rate: { num: 30, den: 1 }, drop: false });
const m = { width: 1920, height: 1080, rotation: 0 };
const cambio = (t, scena, angolo = 'bd') => ({ t, scena, angolo, tonda: true });
const clip = () => P.newClip('media', p.tracks[0].id, 0, 300);
test('sei scene, numeri esclusivi; F1/F2 e tastierino non sono scorciatoie nuove', () => {
  assert.equal(new Set(S.SCENE_LIVE.map(s => s.id)).size, 6);
  assert.deepEqual(['1','2','3','4','5','6'].map(S.scenaDaTasto), S.SCENE_LIVE.map(s => s.id));
  for (const k of ['F1','F2','0','7','Num1']) assert.equal(S.scenaDaTasto(k), undefined);
});
test('cambi puri: ripetizione ignorata, scelta durante pausa allo stesso tempo sostituita', () => {
  const a = [cambio(0, 'schermo')];
  assert.deepEqual(S.cambiaScena(a, cambio(1, 'schermo')), a);
  const b = S.cambiaScena(a, cambio(2, 'bolla'));
  assert.equal(a.length, 1);
  assert.deepEqual(S.cambiaScena(b, cambio(2, 'pausa')), [a[0], cambio(2, 'pausa')]);
  assert.deepEqual(S.cambiaScena(b, cambio(NaN, 'bolla')), b);
});
test('50/50 ritaglia senza deformare, bolla rispetta tutti gli angoli', () => {
  for (const fonte of ['schermo','webcam']) {
    const v = S.posizioneScena(p, m, cambio(0, 'affiancati'), fonte);
    assert.equal(v.tf.scale, 1); assert.equal(v.tf.cropL, .25); assert.equal(v.opacity, 1);
    assert.equal(v.tf.x, fonte === 'schermo' ? -480 : 480);
  }
  for (const angolo of ['as','ad','bs','bd']) {
    const tf = S.posizioneScena(p, m, cambio(0, 'bolla', angolo), 'webcam').tf;
    assert.equal(tf.x > 0, angolo.endsWith('d')); assert.equal(tf.y > 0, angolo.startsWith('b')); assert.equal(tf.angoli, 1);
  }
});
test('le chiavi mantengono la scena, sfumano in 320 ms e resettano la forma della bolla', () => {
  const c = clip(); S.animaScene(c, p, m, [cambio(0, 'bolla'), cambio(2, 'webcam')], 'webcam', 0);
  assert.equal(A.valutaClip(c, 50).tf.angoli, 1);
  assert.ok(A.valutaClip(c, 65).tf.angoli > 0 && A.valutaClip(c, 65).tf.angoli < 1);
  assert.equal(A.valutaClip(c, 70).tf.angoli, 0);
  assert.equal(A.valutaClip(c, 100).tf.scale, 1);
});
test('cambi ravvicinati ripartono dalla posizione raggiunta; webcam tardiva ha chiavi locali', () => {
  const cambi = [cambio(0,'schermo'), cambio(2,'webcam'), cambio(2.1,'pausa')];
  const c = clip(); S.animaScene(c,p,m,cambi,'schermo',0);
  const keys = c.anim.opacity;
  assert.ok(keys.every((k,i) => i === 0 || k.f > keys[i-1].f));
  assert.ok(A.valutaClip(c,63).opacity > 0 && A.valutaClip(c,63).opacity < 1);
  const tardiva = clip(); S.animaScene(tardiva,p,m,cambi,'webcam',3);
  assert.equal(tardiva.anim.opacity[0].f,0); assert.equal(A.valutaClip(tardiva,0).opacity,0);
});
test('webcam grande: schermo piccolo sulla traccia sopra; cartello modificabile solo in Torno subito', () => {
  const cambi = [cambio(0,'webcam-schermo'),cambio(2,'pausa')];
  const sotto = clip(), sopra = clip(), titolo = clip();
  S.animaScene(sotto,p,m,cambi,'schermo',0); S.animaScene(sopra,p,m,cambi,'schermo-sopra',0); S.animaScene(titolo,p,null,cambi,'titolo',0);
  assert.equal(A.valutaClip(sotto,0).opacity,0); assert.equal(A.valutaClip(sopra,0).opacity,1);
  assert.equal(A.valutaClip(titolo,0).opacity,0); assert.equal(A.valutaClip(titolo,70).opacity,1);
});

test('un cambio vicino allo stop conserva la porzione di dissolvenza registrata', () => {
  const c = clip(); c.len = 65;
  S.animaScene(c,p,m,[cambio(0,'schermo'),cambio(2,'pausa')],'schermo',0);
  const op = A.valutaClip(c,64).opacity;
  assert.ok(op > 0 && op < 1, String(op));
});
