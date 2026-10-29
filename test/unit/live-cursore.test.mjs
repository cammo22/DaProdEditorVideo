import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';

const Z = await carica('zoomCursore'), P = await carica('progetto'), B = await carica('blocchi'), M = await carica('montaggio');
const schermo = { id: '-1920:0:0:1080', left: -1920, top: 0, width: 1920, height: 1080 };
const punto = (tMs, cx = 0.8, cy = 0.3, clicks = 0, visible = true) => ({ tMs, cx, cy, clicks, visible });

function scena() {
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 30, den: 1 }, drop: false });
  p.master.auto = false;
  const m = { id: 'schermo', width: 1920, height: 1080, t0: 0, duration: 10 };
  const raw = Array.from({ length: 600 }, (_, i) => punto(i * 1000 / 60, 0.5 + i / 3000, 0.3, i === 120 || i === 150 ? 1 : 0));
  m.cursoreLive = Z.rimappaCursore(raw, schermo, [{ da: 0, fine: 10000, videoMs: 0, durataMs: 10000 }], 10000);
  p.media.push(m);
  const c = P.newClip('media', p.tracks[1].id, 300, 300, { media: m.id, link: 'registrazione' });
  p.clips.push(c);
  return { p, c, m };
}

test('pause, countdown e grazia spariscono; la cucitura usa gli offset effettivi dei pacchetti', () => {
  const raw = [punto(50), punto(100, .2, .4, 1), punto(115, .2, .4, 0), punto(135, .2, .4, 1),
    punto(300, .3, .3, 2), punto(900, .7, .7, 1), punto(1000, .7, .7, 2), punto(1016, .7, .7, 0), punto(1400, .9, .9, 1)];
  const d = Z.rimappaCursore(raw, schermo, [{ da: 100, fine: 300, videoMs: 0, durataMs: 220 },
    { da: 1000, fine: 1200, videoMs: 220, durataMs: 200 }], 420);
  assert.deepEqual(d.campioni.map(s => s.tMs), [0, 15, 35, 220, 236]);
  assert.deepEqual(d.clic.map(s => [s.tMs, s.button]), [[0, 0], [35, 0], [220, 1]]);
  assert.equal(d.schermo.left, -1920);
  assert.equal(d.segmenti[1].daMs, 220);
});

test('se la cucitura fallisce ciascun file riparte da zero, senza clic della pausa o della grazia', () => {
  const raw = [punto(110, .1, .2, 1), punto(900, .4, .5, 1), punto(1110, .8, .9, 4), punto(1300, .5, .5, 1)];
  const a = Z.rimappaCursore(raw, schermo, [{ da: 100, fine: 300, videoMs: 0, durataMs: 200 }], 800);
  const b = Z.rimappaCursore(raw, schermo, [{ da: 1100, fine: 1300, videoMs: 0, durataMs: 200 }], 800);
  assert.deepEqual(a.clic.map(s => [s.tMs, s.button]), [[10, 0]]);
  assert.deepEqual(b.clic.map(s => [s.tMs, s.button]), [[10, 2]]);
});

test('coordinate fuori monitor, nascoste o non finite non generano clic né valori JSON impossibili', () => {
  const d = Z.rimappaCursore([punto(0, -.2, .5, 1), punto(20, .2, .5, 1, false), punto(40, NaN, Infinity, 7), punto(60, .2, .5, 7)], schermo,
    [{ da: 0, fine: 100, videoMs: 0, durataMs: 100 }], 100);
  assert.equal(d.clic.length, 3);
  assert.deepEqual(d.clic.map(s => s.button), [0, 1, 2]);
  assert.equal(d.campioni[2].visible, false);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
  assert.equal(Z.puntoCursoreAl(d.campioni, 45), null);
});

test('il focus usa fit, scala e rotazione; ai bordi non scopre il fondo della ripresa', () => {
  const base = { ...P.TF0, x: 10, y: 20, scale: .8, rot: 90 };
  const tf = Z.trasformazioneFocus(base, 1, 0, 2, 1000, 500);
  assert.equal(tf.scale, 1.6);
  assert.ok(Math.abs(tf.x - (10 - 200)) < 1e-8);
  assert.ok(Math.abs(tf.y - (20 - 400)) < 1e-8);
  assert.deepEqual(Z.trasformazioneFocus(base, .8, .2, 1, 1000, 500), base);
});

test('zoom a tappe modificabili: segue il cursore, riparte a quadro intero, è deterministico e non sovrascrive il lavoro manuale', () => {
  const { p, c, m } = scena();
  const gemella = structuredClone(c);
  assert.equal(Z.applicaZoomCursore(p, c, m), true);
  assert.equal(Z.applicaZoomCursore(p, gemella, m), true);
  assert.deepEqual(c, gemella);
  assert.ok(c.via.length > 4);
  assert.equal(c.tf.scale, 1); assert.equal(c.tfFine.scale, 1);
  assert.ok(c.via.some(v => v.tf.scale > 1.6));
  const spostamenti = c.via.filter(v => v.tf.scale > 1.6).map(v => v.tf.x);
  assert.ok(Math.max(...spostamenti) - Math.min(...spostamenti) > 3);
  assert.ok(c.via.every((v, i, a) => v.t > 0 && v.t < 1 && (!i || v.t > a[i - 1].t)));
  const prima = structuredClone(c);
  assert.equal(Z.applicaZoomCursore(p, c, m), false);
  assert.deepEqual(c, prima);
  const a = P.tfAl(c, 75), b = P.tfAl(c, 200);
  assert.deepEqual(P.tfAl(c, 75), a); assert.deepEqual(P.tfAl(c, 200), b);
});

test('progetti senza telemetria e movimenti vecchi restano uguali; il roundtrip conserva dati, tappe e blocco', () => {
  const { p, c, m } = scena();
  const vecchio = structuredClone(m); delete vecchio.cursoreLive;
  const prima = structuredClone(c);
  assert.equal(Z.applicaZoomCursore(p, c, vecchio), false);
  assert.deepEqual(c, prima);
  c.tfFine = { ...c.tf, x: 320, scale: 1.2 };
  c.via = [{ t: .123456789, tf: { ...c.tf, x: 42 } }];
  const frame = [0, 17, 150, 299].map(f => P.tfAl(c, f));
  const riaperto = JSON.parse(JSON.stringify(p));
  assert.deepEqual([0, 17, 150, 299].map(f => P.tfAl(riaperto.clips[0], f)), frame);
  assert.equal(Z.applicaZoomCursore(p, c, m), false);
  const fx = Z.bloccoClicLive(c); p.clips.push(fx);
  assert.equal(B.nomeBlocco(fx.fxb), 'Clic animati');
  assert.equal(B.statoEffetti(p, 375), null); // la webcam non riceve un effetto di traccia
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});

test('gli anelli seguono il tempo sorgente anche dopo split, slip, velocità e seek; eliminare il blocco li spegne', async () => {
  const A = await carica('anelliClic');
  const { p, c } = scena();
  p.clips.push(Z.bloccoClicLive(c));
  const anello = A.anelliClic(p, c, 2.1, 63);
  assert.equal(anello.n, 1);
  const destra = M.splitClip(p, c, 345);
  assert.equal(A.anelliClic(p, destra, P.srcTimeAt(p, destra, 363), 18).n, 1);
  destra.srcIn = 2; destra.speed = 2;
  assert.equal(A.anelliClic(p, destra, P.srcTimeAt(p, destra, destra.start + 3), 3).n, 1);
  A.anelliClic(p, destra, 8, 100);
  assert.deepEqual(A.anelliClic(p, c, 2.1, 63), anello);
  const cam = { ...c, media: 'webcam' };
  assert.equal(A.anelliClic(p, cam, 2.1, 63).n, 0);
  const fx = p.clips.find(c => c.kind === 'fx'); fx.len = 5;
  assert.equal(A.anelliClic(p, c, 2.1, 63).n, 0);
  p.clips = p.clips.filter(c => c.kind !== 'fx');
  assert.equal(A.anelliClic(p, c, 2.1, 63).n, 0);
});

test('il blocco segue lo schermo quando si sposta; cancellarlo col comando normale lascia video e audio legati', () => {
  const { p, c } = scena();
  const audio = P.newClip('media', p.tracks[2].id, c.start, c.len, { media: c.media, link: c.link });
  const fx = Z.bloccoClicLive(c); p.clips.push(audio, fx);
  assert.equal(B.effettoTempo('clicLive').nome, 'Clic animati');
  assert.equal(fx.link, undefined);
  const df = M.moveClips(p, M.withLinked(p, [c.id]), 100, 0, 'video', 'libero');
  assert.equal(df.df, 100); assert.equal(fx.start, c.start); assert.equal(audio.start, c.start);
  assert.deepEqual([...M.withLinked(p, [fx.id])], [fx.id]);
  M.deleteClips(p, M.withLinked(p, [fx.id]), false);
  assert.deepEqual(p.clips.map(c => c.id), [c.id, audio.id]);
});

test('il layer integra LUT, curve, zoom e clic in monitor ed export; ombra e webcam non li ereditano (GL registrato)', async () => {
  ambienteBrowser(); memoriaFinta(); globalThis.window = globalThis;
  globalThis.ImageBitmap = class {};
  const intervalli = [], originale = globalThis.setInterval;
  globalThis.setInterval = (...args) => { const h = originale(...args); intervalli.push(h); return h; };
  let Compositore;
  try { ({ Compositore } = await carica('compositore')); }
  finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }
  const valori = new Map(), disegni = [];
  const gl = new Proxy({}, { get(_t, k) {
    if (k === 'NO_ERROR') return 0;
    if (/^[A-Z0-9_]+$/.test(String(k))) return k;
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'getUniformLocation') return (_programma, nome) => nome;
    if (k === 'getParameter') return p => p === 'MAX_3D_TEXTURE_SIZE' ? 65 : null;
    if (k === 'getError' || k === 'getAttribLocation') return () => 0;
    if (String(k).startsWith('create')) return () => ({});
    if (k === 'drawArrays') return () => disegni.push(new Map(valori));
    if (String(k).startsWith('uniform')) return (nome, ...v) => valori.set(nome, v.map(x => ArrayBuffer.isView(x) ? [...x] : x));
    return () => {};
  } });
  const cp = new Compositore({ width: 1920, height: 1080, getContext: () => gl });
  cp.fbo = [{ fb: {}, tex: {} }, { fb: {}, tex: {} }]; cp.fbW = 1920; cp.fbH = 1080;
  const { UNIFORM_COLORE } = await carica('coloreGpu');
  for (const nome of UNIFORM_COLORE) {
    assert.equal(cp.uL[nome], nome); assert.equal(cp.uM[nome], nome);
  }
  cp.upload = () => ({ tex: {} });
  cp.fornitore = () => ({ displayWidth: 1920, displayHeight: 1080, rotation: 0, toCanvasImageSource: () => ({}) });
  const { p, c, m } = scena(); c.tf.ombra = .5;
  const { parseCube } = await carica('lut');
  const lut = { ...parseCube('LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1'), id: 'live', hash: 'live' };
  p.luts = [lut];
  c.fx.colore = { lut: { id: lut.id, intensita: .5 }, curve: { luma: [{ id: 'centro', x: .5, y: .4 }] } };
  Z.applicaZoomCursore(p, c, m); p.clips.push(Z.bloccoClicLive(c));
  const s = { clip: c, t: 2.1, local: 2.1, lf: 63 };
  assert.equal(cp.layer(p, s, 0, true, 363), true);
  const monitor = disegni.at(-1);
  assert.deepEqual(disegni[0].get('u_numClic'), [0]); // ombra
  assert.deepEqual(disegni[0].get('u_caIntensity'), [0]);
  assert.deepEqual(disegni[0].get('u_caCurveOn'), [0]);
  assert.deepEqual(monitor.get('u_numClic'), [1]);
  assert.deepEqual(monitor.get('u_caIntensity'), [.5]);
  assert.deepEqual(monitor.get('u_caCurveOn'), [1]);
  assert.deepEqual(monitor.get('u_caLut'), [5]);
  assert.deepEqual(monitor.get('u_caCurve'), [4]);
  assert.ok(monitor.get('u_scale')[0] > 1);
  const x = monitor.get('u_clic')[0];
  assert.ok(Math.abs(x[0] - m.cursoreLive.clic[0].cx) < 1e-6); // coordinate nella ripresa, prima dello zoom
  cp.layer(p, s, 0, false, 363);
  assert.deepEqual(disegni.at(-1).get('u_clic'), monitor.get('u_clic'));
  for (const nome of UNIFORM_COLORE) assert.deepEqual(disegni.at(-1).get(nome), monitor.get(nome));
  p.media.push({ ...m, id: 'webcam', cursoreLive: undefined });
  cp.layer(p, { ...s, clip: { ...c, media: 'webcam', fx: { ...c.fx, colore: undefined } } }, 0, false, 363);
  assert.deepEqual(disegni.at(-1).get('u_numClic'), [0]);
  assert.deepEqual(disegni.at(-1).get('u_caIntensity'), [0]);
  assert.deepEqual(disegni.at(-1).get('u_caCurveOn'), [0]);
});

test('annulla/ripeti e salvataggio .daprod reali conservano i dati; la migrazione vecchia è idempotente e non cambia i movimenti', async () => {
  ambienteBrowser(); memoriaFinta(); globalThis.window = globalThis;
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const intervalli = [], originale = globalThis.setInterval;
  globalThis.setInterval = (...a) => { const h = originale(...a); intervalli.push(h); return h; };
  let PR, PK, store;
  try { PR = await carica('progetti'); PK = await carica('pacchetto'); ({ store } = await carica('store')); }
  finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }
  const { p, c, m } = scena(); store.load(p);
  store.edit('Zoom e clic LIVE', p => { Z.applicaZoomCursore(p, p.clips[0], p.media[0]); p.clips.push(Z.bloccoClicLive(p.clips[0])); });
  const dopo = structuredClone(store.doc);
  assert.equal(store.doUndo(), 'Zoom e clic LIVE');
  assert.equal(store.doc.clips.length, 1); assert.equal(store.doc.clips[0].tfFine, undefined);
  assert.equal(store.doRedo(), 'Zoom e clic LIVE'); assert.deepEqual(JSON.parse(JSON.stringify(store.doc)), dopo);
  const nelPacchetto = JSON.parse(PK._testProgettoDentro({ voci: [{ m, nome: 'media/schermo.webm' }] }, false));
  assert.deepEqual(nelPacchetto.media[0].cursoreLive, m.cursoreLive);
  assert.equal(nelPacchetto.media[0].pacchetto, 'media/schermo.webm');
  assert.deepEqual(PR._testValida(nelPacchetto).clips, dopo.clips);
  const vecchio = structuredClone(dopo); delete vecchio.media[0].cursoreLive;
  vecchio.clips = [structuredClone(c)]; vecchio.clips[0].tfFine = { ...c.tf, x: 100, scale: 1.2 };
  vecchio.clips[0].via = [{ t: .123456789, tf: { ...c.tf, x: 42 } }];
  const frame = [0, 23, 170, 299].map(f => P.tfAl(vecchio.clips[0], f));
  const a = PR._testValida(JSON.parse(JSON.stringify(vecchio))), b = PR._testValida(structuredClone(a));
  assert.deepEqual(a, b); assert.equal('cursoreLive' in a.media[0], false);
  assert.deepEqual([0, 23, 170, 299].map(f => P.tfAl(a.clips[0], f)), frame);
});

test('ponte nativo: origini dei pezzi prima di MediaRecorder, pause escluse e una sola chiusura', async () => {
  ambienteBrowser(); memoriaFinta();
  const chiamate = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (cmd, args) => {
    chiamate.push([cmd, args]);
    if (cmd === 'cursore_avvia') return { id: 42, trascorsiMs: 0 };
    if (cmd === 'cursore_ferma') return [punto(110, .2, .3, 1), punto(400, .4, .5, 1), punto(710, .8, .9, 2)].map(s => JSON.stringify(s)).join('\n');
  } } };
  const { CursoreLive } = await carica('cursoreLive');
  const r = await CursoreLive.avvia(schermo);
  // Il costruttore TS non usa campi #privati: fissiamo l'orologio per verificare la rimappatura.
  r.origine = 1000;
  r.pezzo(1100); r.pausa(1300); r.pezzo(1700); r.pausa(1900);
  const fine = await r.ferma();
  const d = fine.perVideo([{ indice: 0, daMs: 0, durataMs: 200 }, { indice: 1, daMs: 220, durataMs: 200 }], 420);
  assert.deepEqual(d.clic.map(s => [s.tMs, s.button]), [[10, 0], [230, 1]]);
  assert.deepEqual(chiamate.map(s => s[0]), ['cursore_avvia', 'cursore_ferma']);
});

test('il compositore libera le immagini uscite dal quadro e le ricarica quando tornano', async () => {
  ambienteBrowser(); memoriaFinta(); globalThis.window = globalThis;
  globalThis.ImageBitmap = class { width = 16; height = 16; };
  const intervalli = [], originale = globalThis.setInterval;
  globalThis.setInterval = (...a) => { const h = originale(...a); intervalli.push(h); return h; };
  let Compositore;
  try { ({ Compositore } = await carica('compositore')); }
  finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }
  const eliminate = [];
  const gl = new Proxy({}, { get(_t, k) {
    if (k === 'NO_ERROR') return 0;
    if (/^[A-Z0-9_]+$/.test(String(k))) return k;
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'getParameter') return p => p === 'MAX_3D_TEXTURE_SIZE' ? 65 : null;
    if (k === 'getError' || k === 'getAttribLocation') return () => 0;
    if (k === 'deleteTexture') return t => eliminate.push(t);
    if (String(k).startsWith('create')) return () => ({});
    return () => {};
  } });
  const cp = new Compositore({ width: 16, height: 16, getContext: () => gl });
  const p = P.newProject({ w: 16, h: 16, rate: { num: 25, den: 1 }, drop: false });
  const bmp = new ImageBitmap();
  p.media.push({ id: 'foto', type: 'image', width: 16, height: 16, rotation: 0 });
  const clip = P.newClip('media', p.tracks[1].id, 0, 10, { media: 'foto' });
  p.clips.push(clip);
  const { pianoVideo } = await carica('piano');
  cp.render(p, pianoVideo(p, 0), false, 0, () => bmp);
  const prima = cp.texs.get('img:foto')?.tex;
  assert.ok(prima);
  cp.render(p, pianoVideo(p, 11), false, 11, () => bmp);
  assert.ok(eliminate.includes(prima));
  assert.equal(cp.texs.has('img:foto'), false);
  cp.render(p, pianoVideo(p, 0), false, 0, () => bmp);
  assert.ok(cp.texs.get('img:foto')?.tex);
  assert.notEqual(cp.texs.get('img:foto').tex, prima);
  cp.distruggi();
});
