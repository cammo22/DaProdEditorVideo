import test from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const L = await carica('lut'), C = await carica('curve'), G = await carica('colore');
const P = await carica('progetto'), M = await carica('coloreAudioProgetto');
const fmt = { w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false };
const vicino = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
function cube(n, fn = (r, g, b) => [r, g, b], dominio = '') {
  const righe = ['# LUT di prova', 'TITLE "Una prova"', `LUT_3D_SIZE ${n}`, dominio];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) righe.push(fn(r / (n - 1), g / (n - 1), b / (n - 1)).join(' '));
  return righe.join('\n');
}

test('LUT 2³/33³: identità, dominio, ordine RGB e intensità 0/50/100%', () => {
  for (const n of [2, 33]) {
    const lut = L.parseCube(cube(n));
    assert.equal(lut.dati.length, n ** 3 * 3);
    for (const rgb of [[0, 0, 0], [1, 1, 1], [.123, .789, .456]]) L.campionaLut(lut, rgb).forEach((v, i) => vicino(v, rgb[i]));
  }
  const scambio = L.parseCube(cube(2, (r, g, b) => [b, r, g]));
  assert.deepEqual(L.campionaLut(scambio, [.2, .4, .8], 0), [.2, .4, .8]);
  L.campionaLut(scambio, [.2, .4, .8], .5).forEach((v, i) => vicino(v, [.5, .3, .6][i]));
  L.campionaLut(scambio, [.2, .4, .8], 1).forEach((v, i) => vicino(v, [.8, .2, .4][i]));
  const dominio = L.parseCube(cube(2, undefined, 'DOMAIN_MIN -1 -2 -3\nDOMAIN_MAX 1 2 3'));
  L.campionaLut(dominio, [0, 0, 0]).forEach((v) => vicino(v, .5));
  const fuori = L.parseCube(cube(2, (r, g, b) => [r * 2 - .5, g, b]));
  assert.equal(fuori.dati[0], -.5); assert.equal(fuori.dati[3], 1.5);
});

test('LUT: rifiuta file incompleti, 1D, misti, righe spurie, NaN, domini e dimensioni errate', () => {
  const buona = cube(2);
  for (const testo of [buona.split('\n').slice(0, -1).join('\n'), buona + '\n0 0 0', buona.replace('LUT_3D_SIZE 2', 'LUT_3D_SIZE 66'),
    buona.replace('LUT_3D_SIZE 2', 'LUT_1D_SIZE 2'), buona.replace('LUT_3D_SIZE 2', 'LUT_1D_SIZE 2\nLUT_3D_SIZE 2'),
    buona + '\nBOH 1', buona.replace('0 0 0', 'NaN 0 0'), buona.replace('0 0 0', '1e999 0 0'),
    cube(2, undefined, 'DOMAIN_MIN 1 0 0\nDOMAIN_MAX 1 1 1'), cube(2, undefined, 'DOMAIN_MAX 1e300 1 1'),
    buona.replace('LUT_3D_SIZE 2', 'LUT_3D_SIZE 2\nLUT_3D_SIZE 2'), '0 0 0']) assert.throws(() => L.parseCube(testo));
  assert.throws(() => L.parseCube(' '.repeat(L.MAX_CUBE_BYTE + 1)), /32 MB/);
});

test('Lettura File: hash sul contenuto, risorsa JSON riapribile e niente quantizzazione', async () => {
  assert.equal(L.parseCube(cube(2).replace('TITLE "Una prova"', 'TITLE "Look #1" # commento')).nome, 'Look #1');
  const a = await L.leggiLut(new File([cube(2)], 'uno.cube'));
  const b = await L.leggiLut(new File([cube(2).replace('Una prova', 'Altro nome')], 'due.cube'));
  assert.equal(a.hash, b.hash); assert.equal(a.id, b.id);
  assert.equal(L.validaLut(JSON.parse(JSON.stringify(a))), true);
  await assert.rejects(() => L.leggiLut(new File(['abc'], 'no.txt')), /\.cube/);
});

test('Curve: identità precisa, duplicati con ultima modifica, spline senza overshoot', () => {
  assert.equal(C.curveNeutre(), true);
  const t = C.tabellaCurve();
  for (let r = 0; r < 5; r++) for (let i = 0; i < C.CAMPIONI_CURVA; i++) vicino(t[(r * C.CAMPIONI_CURVA + i) * 4], i / (C.CAMPIONI_CURVA - 1));
  const p = C.normalizzaCurva([{ id: 'a', x: .3, y: .2 }, { id: 'b', x: .3, y: .6 }, { id: 'c', x: .7, y: .4 }]);
  assert.equal(p.length, 4); assert.equal(p[1].id, 'b'); assert.equal(p[0].x, 0); assert.equal(p.at(-1).x, 1);
  for (let i = 0; i < p.length - 1; i++) for (let j = 0; j <= 100; j++) {
    const y = C.valutaCurva(p, p[i].x + (p[i + 1].x - p[i].x) * j / 100);
    assert.ok(y >= Math.min(p[i].y, p[i + 1].y) - 1e-9 && y <= Math.max(p[i].y, p[i + 1].y) + 1e-9);
  }
  assert.equal(C.curveNeutre({ red: p }), false);
});

test('Luma Rec.709: conserva i rapporti RGB e gestisce il nero senza NaN', () => {
  const p = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: .5 }];
  const rgb = [.2, .4, .1], out = C.curvaLuma(rgb, p);
  out.forEach((v, i) => vicino(v, rgb[i] / 2));
  assert.deepEqual(C.curvaLuma([0, 0, 0], [{ id: 'a', x: 0, y: .1 }, { id: 'b', x: 1, y: 1 }]), [.1, .1, .1]);
});

test('Grade legacy neutro, lift/gamma/gain aggiuntivi e LUT/curve non saltate', () => {
  assert.equal(G.gradeNeutro(G.gradeDi(P.MASTER0)), true);
  for (const look of G.LOOKS) {
    const m = { ...P.MASTER0, look: look.id };
    assert.deepEqual(G.gradeDi(m), G.gradeDi({ ...m, colore: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1] } }));
  }
  const g = G.gradeClip({ lift: [.1, 0, 0], gamma: [0, 1, 1], gain: [1, 1.2, 1] });
  assert.equal(g.lift[0], .1); assert.equal(g.gamma[0], .1); assert.equal(g.gain[1], 1.2);
  assert.equal(G.gradeNeutro(G.gradeClip({ lut: { id: 'x', intensita: 1 } })), false);
  assert.equal(G.gradeNeutro(G.gradeClip({ lut: { id: 'x', intensita: 0 } })), true);
  assert.equal(G.gradeNeutro(G.gradeClip({ curve: { luma: [{ id: 'a', x: .5, y: .4 }] } })), false);
});

test('Migrazione aggiuntiva idempotente: vecchie clip identiche, nuova risorsa una volta e undo/redo', async () => {
  const p = P.newProject(fmt), c = P.newClip('media', p.tracks[0].id, 0, 100); p.clips.push(c);
  const prima = structuredClone(c);
  M.migraColoreAudio(p); assert.deepEqual(c, prima); assert.deepEqual(p.luts, []);
  const uno = JSON.stringify(p); M.migraColoreAudio(p); assert.equal(JSON.stringify(p), uno);
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  const { store } = await carica('store'); store.load(p);
  const lut = await L.leggiLut(new File([cube(2)], 'uno.cube'));
  store.edit('Colore', (p) => { p.luts.push(lut); p.clips[0].fx.colore = { lut: { id: lut.id, intensita: .5 }, curve: { luma: C.identitaCurva() } }; });
  const salvato = JSON.stringify(store.doc);
  store.doUndo(); assert.deepEqual(store.doc.luts, []); assert.equal(store.doc.clips[0].fx.colore, undefined);
  store.doRedo(); assert.equal(JSON.stringify(store.doc), salvato);
  const aperto = JSON.parse(salvato); M.migraColoreAudio(aperto); assert.equal(aperto.luts[0].id, aperto.clips[0].fx.colore.lut.id);
});
