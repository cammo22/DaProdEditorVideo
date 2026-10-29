// Prove dei keyframe e delle maschere a forma: interpolazione, progetti vecchi che restano identici, valutazione per
// fotogramma (clip ed effetti), operazioni di montaggio e copertura geometrica delle maschere. Tutto in Node, senza browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';
import { scena } from './scena-effetti.mjs';
const A = await carica('automazioni'), P = await carica('progetto'), B = await carica('blocchi'), M = await carica('maschereForma');
const MO = await carica('montaggio');
const vicino = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const fmt = { w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false };
const clip = (extra = {}) => { const p = P.newProject(fmt); const t = p.tracks.find((x) => x.kind === 'video').id; const c = P.newClip('bars', t, 0, 100, extra); p.clips = [c]; return { p, c, t }; };

// ——— interpolazione ———

test('interpolazione: dritta, morbida e a gradino; prima, dopo e senza chiavi', () => {
  const k = (modo) => [{ f: 10, v: 0, ...(modo ? { modo } : {}) }, { f: 30, v: 100 }];
  assert.equal(A.valoreAnim(undefined, 5, 7), 7);
  assert.equal(A.valoreAnim([], 5, 7), 7);
  assert.equal(A.valoreAnim(k(), 0, 7), 0, 'prima della prima chiave vale la prima');
  assert.equal(A.valoreAnim(k(), 99, 7), 100, 'dopo l\'ultima vale l\'ultima');
  vicino(A.valoreAnim(k(), 20, 0), 50);
  vicino(A.valoreAnim(k(), 15, 0), 25);
  // morbida: nel mezzo è metà, ai quarti è meno del dritto (parte piano) e simmetrica
  vicino(A.valoreAnim(k('morbida'), 20, 0), 50);
  assert.ok(A.valoreAnim(k('morbida'), 15, 0) < 25);
  vicino(A.valoreAnim(k('morbida'), 15, 0) + A.valoreAnim(k('morbida'), 25, 0), 100);
  // a gradino: resta fino alla chiave dopo
  assert.equal(A.valoreAnim(k('gradino'), 29.9, 0), 0);
  assert.equal(A.valoreAnim(k('gradino'), 30, 0), 100);
  // più tratti con modi diversi, continuo sulle chiavi
  const m = [{ f: 0, v: 0 }, { f: 10, v: 10, modo: 'gradino' }, { f: 20, v: 50, modo: 'morbida' }, { f: 30, v: 0 }];
  assert.equal(A.valoreAnim(m, 10, 0), 10);
  assert.equal(A.valoreAnim(m, 15, 0), 10);
  assert.equal(A.valoreAnim(m, 20, 0), 50);
  vicino(A.valoreAnim(m, 25, 0), 25);
  // il tempo è per fotogramma: anche frazionario
  vicino(A.valoreAnim(k(), 20.5, 0), 52.5);
});

// ——— compatibilità con i progetti vecchi ———

test('senza animazioni niente cambia: valutaClip è la clip stessa, tfAl e clipOpacity come prima', () => {
  const { c } = clip();
  assert.equal(A.valutaClip(c, 10), c);
  assert.equal(P.tfAl(c, 10), c.tf, 'ferma: è proprio il Transform della clip');
  c.opKeys = [{ f: 0, v: 0 }, { f: 50, v: 1 }];
  vicino(P.clipOpacity(c, 25), 0.5);
  // movimento con tappe frazionarie: è ancora la Hermite di prima
  c.tf = { ...c.tf, x: 0, sx: undefined };
  c.tfFine = { ...c.tf, x: 100 };
  c.via = [{ t: 0.123456789, tf: { ...c.tf, x: 42 } }];
  const atteso = [0, 10, 50, 99].map((f) => P.passaPer([0, 0.123456789, 1], [0, 42, 100], f / 99));
  [0, 10, 50, 99].forEach((f, i) => vicino(P.tfAl(c, f).x, atteso[i], 1e-9));
  assert.equal(P.tfAl(c, 10).sx, 1, 'sx assente = 1 anche nel movimento');
});

test('apertura di un progetto vecchio: identico; uno con keyframe scritti male si rimette in ordine', async () => {
  ambienteBrowser(); memoriaFinta(); globalThis.window = globalThis;
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const intervalli = [], originale = globalThis.setInterval;
  globalThis.setInterval = (...a) => { const h = originale(...a); intervalli.push(h); return h; };
  let PR;
  try { PR = await carica('progetti'); } finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }
  const { p, c } = clip({ opKeys: [{ f: 0, v: 0.2 }, { f: 40, v: 1 }], gainKeys: [{ f: 0, v: -6 }, { f: 40, v: 0 }] });
  c.tfFine = { ...c.tf, x: 200 };
  const vecchio = JSON.parse(JSON.stringify(p));
  const aperto = PR._testValida(JSON.parse(JSON.stringify(vecchio)));
  assert.equal('anim' in aperto.clips[0], false, 'nessun campo nuovo nelle clip vecchie');
  assert.equal('maschere' in aperto.clips[0], false);
  assert.deepEqual(aperto.clips[0].opKeys, vecchio.clips[0].opKeys);
  assert.deepEqual(aperto.clips[0].gainKeys, vecchio.clips[0].gainKeys);
  assert.deepEqual([0, 30, 99].map((f) => P.tfAl(aperto.clips[0], f)), [0, 30, 99].map((f) => P.tfAl(c, f)));
  assert.deepEqual(PR._testValida(structuredClone(aperto)), aperto, 'aprirlo due volte non cambia niente');
  // keyframe sporchi: fuori ordine, doppi, non finiti, percorso che non esiste
  const sporco = JSON.parse(JSON.stringify(vecchio));
  sporco.clips[0].anim = {
    'tf.x': [{ f: 30, v: 5 }, { f: 10, v: 1 }, { f: 10, v: 2 }, { f: NaN, v: 3 }, { f: 40, v: Infinity }, { f: 50, v: 9, modo: 'strano' }],
    'tf.finto': [{ f: 1, v: 1 }], opacity: [],
  };
  const pulito = PR._testValida(sporco).clips[0].anim;
  assert.deepEqual(Object.keys(pulito), ['tf.x']);
  assert.deepEqual(pulito['tf.x'], [{ f: 10, v: 2 }, { f: 30, v: 5 }, { f: 50, v: 9 }], 'in ordine, l\'ultima scritta vince, niente valori strani');
});

// ——— valutazione per fotogramma ———

test('valutaClip e tfAl: il valore di ogni parametro al fotogramma, senza toccare il progetto', () => {
  const { c } = clip();
  c.anim = {
    opacity: [{ f: 0, v: 0 }, { f: 50, v: 1 }],
    'tf.x': [{ f: 0, v: 0 }, { f: 100, v: 200 }],
    'tf.rot': [{ f: 0, v: 0, modo: 'gradino' }, { f: 50, v: 90 }],
    'fx.sat': [{ f: 0, v: 1 }, { f: 100, v: 0 }],
    'fx.colore.gain.r': [{ f: 0, v: 1 }, { f: 100, v: 2 }],
  };
  const prima = structuredClone(c);
  const v = A.valutaClip(c, 25);
  vicino(v.opacity, 0.5);
  vicino(v.tf.x, 50);
  assert.equal(v.tf.rot, 0);
  vicino(v.fx.sat, 0.75);
  vicino(v.fx.colore.gain[0], 1.25);
  assert.deepEqual(v.fx.colore.gain.slice(1), [1, 1], 'gli altri canali restano neutri');
  assert.deepEqual(c, prima, 'il progetto non si tocca');
  vicino(P.tfAl(c, 50).x, 100);
  vicino(P.tfAl(v, 25).x, 50, 1e-9);
  vicino(P.clipOpacity(c, 25), 0.5);
  assert.equal(A.valoreAl(c, 'tf.x', 100), 200);
  // la linea nuova prende il posto della vecchia linea elastica
  c.opKeys = [{ f: 0, v: 1 }, { f: 100, v: 1 }];
  vicino(P.clipOpacity(c, 25), 0.5);
  // un campo col keyframe vince sul movimento, gli altri restano in movimento
  c.tfFine = { ...c.tf, x: 1000, y: 100 };
  const t = P.tfAl(c, 50);
  vicino(t.x, 100, 1e-9);
  vicino(t.y, 100 * P.passaPer([0, 1], [0, 1], 50 / 99), 1e-9);
});

test('effetti a tempo: forza e parametri con i keyframe si valutano prima di somma e inviluppo', () => {
  const p = scena(P, B, ['flash'], 1);
  const bl = p.clips.find((c) => c.fxb);
  const fisso = (forza) => { const q = scena(P, B, ['flash'], forza); return B.statoEffetti(q, 0).flash; };
  bl.anim = { 'fxb.forza': [{ f: 0, v: 0.2 }, { f: 250, v: 1 }] };
  const st0 = B.statoEffetti(p, 0).flash;
  vicino(st0, fisso(0.2), 1e-9);
  // a metà il blocco usa la forza di lì (stessa curva dell'inviluppo, forza interpolata)
  const f = 125, forza = A.valoreAnim(bl.anim['fxb.forza'], f, 1);
  vicino(B.statoEffetti(p, f).flash, B.statoEffetti(scena(P, B, ['flash'], forza), f).flash, 1e-9);
  // senza animazioni il blocco dà lo stesso risultato di prima
  delete bl.anim; bl.fxb.forza = 1;
  assert.deepEqual(B.statoEffetti(p, 40), B.statoEffetti(scena(P, B, ['flash'], 1), 40));
  // un parametro del catalogo (censura: larghezza)
  const q = scena(P, B, ['censura']);
  const cb = q.clips.find((c) => c.fxb);
  cb.anim = { 'fxb.parametri.larghezza': [{ f: 0, v: 0.1 }, { f: 250, v: 0.5 }] };
  vicino(B.statoEffetti(q, 125).censure[0].w, 0.1 + (0.4 * 125) / 250, 1e-9);
});

// ——— modificare le chiavi ———

test('mettere, cambiare, togliere chiavi; la vecchia linea elastica diventa chiavi equivalenti', () => {
  const { c } = clip({ opKeys: [{ f: 0, v: 0 }, { f: 50, v: 1 }, { f: 100, v: 0.5 }] });
  const prima = [0, 10, 25, 50, 75, 100].map((f) => P.clipOpacity(c, f));
  A.mettiChiave(c, 'opacity', 25, P.clipOpacity(c, 25));
  assert.deepEqual(c.opKeys, [], 'ora comanda la linea nuova');
  assert.deepEqual([0, 10, 25, 50, 75, 100].map((f) => P.clipOpacity(c, f)), prima, 'il disegno non cambia');
  assert.deepEqual(c.anim.opacity.map((k) => k.f), [0, 25, 50, 100]);
  A.mettiChiave(c, 'opacity', 25, 0.9);
  assert.equal(c.anim.opacity.length, 4);
  assert.equal(A.valoreAl(c, 'opacity', 25), 0.9);
  A.impostaModoChiave(c, 'opacity', 25, 'gradino');
  assert.equal(c.anim.opacity[1].modo, 'gradino');
  A.impostaModoChiave(c, 'opacity', 25, 'lineare');
  assert.equal('modo' in c.anim.opacity[1], false);
  assert.equal(A.chiaveVicina(c, 'opacity', 25, 1), 50);
  assert.equal(A.chiaveVicina(c, 'opacity', 25, -1), 0);
  assert.equal(A.chiaveVicina(c, 'opacity', 100, 1), null);
  assert.deepEqual(A.fotogrammiChiave(c), [0, 25, 50, 100]);
  // togliere l'ultima chiave lascia il valore dov'era (nessun salto)
  const solo = clip().c;
  A.mettiChiave(solo, 'tf.x', 10, 77);
  A.togliChiave(solo, 'tf.x', 10);
  assert.equal(solo.anim, undefined);
  assert.equal(solo.tf.x, 77);
  // togliere tutta la linea: resta il valore del punto scelto
  const due = clip().c;
  A.mettiChiave(due, 'fx.sat', 0, 1); A.mettiChiave(due, 'fx.sat', 100, 0);
  A.togliLinea(due, 'fx.sat', 50);
  vicino(due.fx.sat, 0.5);
  assert.equal(due.anim, undefined);
});

test('taglio, bordi, velocità: le chiavi seguono la clip', () => {
  const { p, c } = clip();
  c.anim = { 'tf.x': [{ f: 0, v: 0 }, { f: 100, v: 100 }], 'fx.sat': [{ f: 20, v: 1, modo: 'gradino' }, { f: 80, v: 0 }] };
  const originale = (f) => A.valoreAl(c, 'tf.x', f);
  const destra = MO.splitClip(p, c, 40);
  assert.equal(c.len, 40);
  // il valore del taglio sta da tutte e due le parti, e i due pezzi danno gli stessi valori di prima
  vicino(A.valoreAl(c, 'tf.x', 40), 40);
  vicino(A.valoreAl(destra, 'tf.x', 0), 40);
  for (const f of [0, 10, 39]) vicino(A.valoreAl(c, 'tf.x', f), f);
  for (const f of [0, 10, 59]) vicino(A.valoreAl(destra, 'tf.x', f), 40 + f);
  void originale;
  assert.equal(A.valoreAl(destra, 'fx.sat', 0), 1, 'il gradino continua a destra');
  // taglio sul bordo di una chiave: nessuna chiave doppia
  assert.deepEqual(destra.anim['tf.x'].map((k) => k.f), [0, 60]);
  // bordo che si mangia d fotogrammi: stesso istante del contenuto
  const e = clip().c;
  e.anim = { 'tf.y': [{ f: 10, v: 5 }, { f: 90, v: 85 }] };
  const prima = A.valoreAl(e, 'tf.y', 50);
  A.spostaAnim(e, 20);
  vicino(A.valoreAl(e, 'tf.y', 30), prima);
  // velocità/frequenza: le chiavi si rimettono in proporzione
  const s = clip().c;
  s.anim = { pan: [{ f: 10, v: -1 }, { f: 50, v: 1 }, { f: 51, v: 0.5 }] };
  A.scalaAnim(s, 0.5);
  assert.deepEqual(s.anim.pan.map((k) => k.f), [5, 25, 26].map((x) => Math.round(x)));
  A.scalaAnim(s, 0.1);
  assert.ok(s.anim.pan.every((k, i, a) => !i || a[i - 1].f < k.f), 'mai due chiavi sullo stesso fotogramma');
});

test('audio: volume e panorama con i keyframe', async () => {
  ambienteBrowser(); memoriaFinta();
  const AU = await carica('audio');
  const { c } = clip({ kind: 'media', gain: -3 });
  assert.equal(AU.guadagnoClip(c, 10, 0), P.dbToGain(-3), 'senza animazioni com\'è sempre stato');
  c.anim = { gain: [{ f: 0, v: -60 }, { f: 100, v: 0 }] };
  vicino(AU.guadagnoClip(c, 50, 0), P.dbToGain(-30), 1e-9);
  const pti = AU.puntiInviluppo(c, 0);
  assert.ok(pti.includes(0) && pti.includes(100));
  // la curva morbida e il gradino hanno più punti: la rampa dritta fra i punti segue la curva
  c.anim.gain[0].modo = 'morbida';
  assert.ok(AU.puntiInviluppo(c, 0).length > pti.length);
  c.anim.gain[0].modo = 'gradino';
  assert.ok(AU.puntiInviluppo(c, 0).some((f) => f > 99.9 && f < 100), 'il gradino salta subito prima della chiave dopo');
});

// ——— le maschere ———

const asp = 16 / 9;
const area = (maschere, a = asp) => { const { w, h } = M.misureForma(a); return M.areaVisibile(M.coperturaMaschere(maschere, w, h)); };
const maschera = (forma, extra) => M.nuovaMaschera(forma, 'm1', extra);

test('maschere: nessuna maschera = si vede tutto; copertura di rettangolo ed ellisse', () => {
  assert.equal(M.coperturaMaschere(undefined, 10, 10), null);
  assert.equal(M.coperturaMaschere([], 10, 10), null);
  assert.equal(M.coperturaMaschere([maschera('rettangolo', { spenta: true })], 10, 10), null);
  assert.equal(M.rasterizzaMaschere(undefined, asp), null);
  vicino(area([maschera('rettangolo', { w: 0.5, h: 0.5 })]), 0.25, 0.005);
  vicino(area([maschera('rettangolo', { w: 0.4, h: 0.8, x: 0.3, y: 0.5 })]), 0.32, 0.005);
  vicino(area([maschera('ellisse', { w: 0.5, h: 0.5 })]), (Math.PI / 4) * 0.25, 0.005);
  vicino(area([maschera('ellisse', { w: 1, h: 1 })]), Math.PI / 4, 0.005);
  // girata, l'area resta la stessa (la forma è girata nei pixel, non nelle frazioni)
  vicino(area([maschera('rettangolo', { w: 0.3, h: 0.3, rot: 33 })]), 0.09, 0.006);
  vicino(area([maschera('ellisse', { w: 0.4, h: 0.6, rot: 70 })]), (Math.PI / 4) * 0.24, 0.006);
  // fuori dal quadro: parte della forma non conta
  vicino(area([maschera('rettangolo', { w: 0.5, h: 0.5, x: 1, y: 0.5 })]), 0.125, 0.005);
  // la copertura nel centro è piena e fuori è zero
  const { w, h } = M.misureForma(asp);
  const c = M.coperturaMaschere([maschera('rettangolo', { w: 0.5, h: 0.5 })], w, h);
  assert.equal(c[Math.floor(h / 2) * w + Math.floor(w / 2)], 1);
  assert.equal(c[0], 0);
});

test('maschere: inversione, espansione, sfumatura, quanto conta', () => {
  const base = { w: 0.4, h: 0.4 };
  vicino(area([maschera('rettangolo', base)]) + area([maschera('rettangolo', { ...base, inverti: true })]), 1, 1e-6);
  vicino(area([maschera('rettangolo', { ...base, opacita: 0.5 })]), 0.08, 0.004);
  // espandere allarga, stringere restringe (frazione del lato corto)
  assert.ok(area([maschera('rettangolo', { ...base, espandi: 0.05 })]) > area([maschera('rettangolo', base)]));
  assert.ok(area([maschera('rettangolo', { ...base, espandi: -0.05 })]) < area([maschera('rettangolo', base)]));
  // l'espansione di un rettangolo di +e per lato (angoli tondi): l'area cresce di circa 2e·(perimetro/2) + πe²
  const { w, h } = M.misureForma(asp);
  const e = 0.05, u = Math.min(w, h);
  const A0 = 0.4 * w * 0.4 * h, P0 = 2 * (0.4 * w + 0.4 * h);
  vicino(area([maschera('rettangolo', { ...base, espandi: e })]) * w * h, A0 + P0 * e * u + Math.PI * (e * u) ** 2, w * h * 0.004);
  // sfumatura: sul bordo vale la metà, dentro piena, fuori zero; l'area quasi non cambia
  const sf = M.coperturaMaschere([maschera('rettangolo', { ...base, sfuma: 0.1 })], w, h);
  const riga = Math.floor(h / 2), bordo = Math.round(w / 2 + (0.4 * w) / 2);
  vicino(sf[riga * w + bordo], 0.5, 0.05);
  assert.equal(sf[riga * w + Math.floor(w / 2)], 1);
  assert.equal(sf[riga * w + w - 1], 0);
  assert.ok(sf[riga * w + bordo - 20] > 0.5 && sf[riga * w + bordo - 20] < 1, 'dentro il bordo sfumato');
  vicino(area([maschera('rettangolo', { ...base, sfuma: 0.1 })]), area([maschera('rettangolo', base)]), 0.01);
});

test('maschere: più maschere sommate e sottratte, in ordine', () => {
  const a = maschera('rettangolo', { id: 'a', x: 0.25, y: 0.5, w: 0.4, h: 0.4 });
  const b = maschera('rettangolo', { id: 'b', x: 0.75, y: 0.5, w: 0.4, h: 0.4 });
  vicino(area([a, b]), 0.32, 0.006, 'due forme staccate si sommano');
  // sovrapposte: l'unione, non il doppio
  const c = maschera('rettangolo', { id: 'c', x: 0.35, y: 0.5, w: 0.4, h: 0.4 });
  vicino(area([a, c]), 0.4 * 0.4 + 0.1 * 0.4, 0.006);
  // sottrarre un buco dentro un rettangolo grande
  const grande = maschera('rettangolo', { id: 'g', w: 0.8, h: 0.8 });
  const buco = maschera('ellisse', { id: 'e', w: 0.4, h: 0.4, op: 'sottrai' });
  vicino(area([grande, buco]), 0.64 - (Math.PI / 4) * 0.16, 0.006);
  // se la prima è una sottrazione si parte da tutto: l'inverso della forma
  vicino(area([maschera('rettangolo', { w: 0.5, h: 0.5, op: 'sottrai' })]), 0.75, 0.005);
  // l'ordine conta: sottrarre prima e sommare dopo rimette la forma
  vicino(area([maschera('rettangolo', { id: 'x', w: 0.5, h: 0.5, op: 'sottrai' }), maschera('rettangolo', { id: 'y', w: 0.5, h: 0.5 })]), 1, 0.01);
  // una maschera spenta non conta
  vicino(area([grande, { ...buco, spenta: true }]), 0.64, 0.005);
});

test('maschere Bézier: spigoli, curve morbide, punti a mano', () => {
  const quadrato = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }];
  vicino(area([maschera('bezier', { punti: quadrato, morbida: false })]), 0.25, 0.005);
  assert.equal(area([maschera('bezier', { punti: quadrato.slice(0, 2), morbida: false })]), 0, 'con meno di tre punti non c\'è forma');
  // otto punti su un cerchio con le curve morbide: quasi un cerchio (in frazioni, quindi un'ellisse nei pixel)
  const r = 0.3, pts = Array.from({ length: 8 }, (_, i) => ({ x: 0.5 + r * Math.cos((i * Math.PI) / 4) / asp, y: 0.5 + r * Math.sin((i * Math.PI) / 4) }));
  const cerchio = area([maschera('bezier', { punti: pts, morbida: true })]);
  vicino(cerchio, (Math.PI * r * r) / asp, 0.01);
  assert.ok(cerchio > area([maschera('bezier', { punti: pts, morbida: false })]), 'le curve gonfiano l\'ottagono');
  // maniglie a mano: stesso punto, forma diversa; un orientamento e l'altro
  const manuali = quadrato.map((p, i) => ({ ...p, hx: [0.1, 0, -0.1, 0][i], hy: [0, 0.1, 0, -0.1][i] }));
  const poly = M.poligonoBezier(maschera('bezier', { punti: manuali, morbida: false }));
  assert.ok(poly.length > 8, 'le curve si spezzano in tratti');
  assert.ok(area([maschera('bezier', { punti: manuali })]) > 0.2);
  // un punto fuori e un triangolo: area del triangolo
  vicino(area([maschera('bezier', { punti: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], morbida: false })]), 0.5, 0.005);
  // con sfumatura e inversione funziona uguale
  vicino(area([maschera('bezier', { punti: quadrato, morbida: false, inverti: true })]), 0.75, 0.005);
  assert.ok(M.dentroMaschera(maschera('bezier', { punti: quadrato, morbida: false }), 0.5, 0.5, asp));
  assert.ok(!M.dentroMaschera(maschera('bezier', { punti: quadrato, morbida: false }), 0.1, 0.1, asp));
});

test('maschere animate dai keyframe, firma e raster', () => {
  const { c } = clip();
  c.maschere = [maschera('rettangolo', { x: 0.25, w: 0.3, h: 0.3 })];
  c.anim = { 'mask.m1.x': [{ f: 0, v: 0.25 }, { f: 100, v: 0.75 }], 'mask.m1.sfuma': [{ f: 0, v: 0 }, { f: 100, v: 0.1 }] };
  const m50 = A.valutaClip(c, 50).maschere[0];
  vicino(m50.x, 0.5);
  vicino(m50.sfuma, 0.05);
  assert.equal(c.maschere[0].x, 0.25, 'l\'originale non si tocca');
  // il centro della copertura si sposta con la maschera
  const { w, h } = M.misureForma(asp);
  const cx = (cov) => { let s = 0, t = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { s += cov[j * w + i] * i; t += cov[j * w + i]; } return s / t / w; };
  vicino(cx(M.coperturaMaschere(A.valutaClip(c, 0).maschere, w, h)), 0.25, 0.01);
  vicino(cx(M.coperturaMaschere(A.valutaClip(c, 100).maschere, w, h)), 0.75, 0.01);
  // punti della Bézier animati
  c.maschere = [maschera('bezier', { punti: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.4 }], morbida: false })];
  c.anim = { 'mask.m1.p1.x': [{ f: 0, v: 0.4 }, { f: 10, v: 0.8 }] };
  vicino(A.valutaClip(c, 10).maschere[0].punti[1].x, 0.8);
  // la firma cambia se la forma cambia, non se cambiano cose che non contano
  const f1 = M.firmaMaschere([maschera('rettangolo', {})], asp);
  assert.notEqual(f1, M.firmaMaschere([maschera('rettangolo', { x: 0.51 })], asp));
  assert.notEqual(f1, M.firmaMaschere([maschera('rettangolo', {})], 1));
  assert.equal(f1, M.firmaMaschere([maschera('rettangolo', { nome: 'altro' })], asp));
  assert.equal(M.firmaMaschere([], asp), '');
  const r = M.rasterizzaMaschere([maschera('rettangolo', { w: 0.5, h: 0.5 })], asp);
  assert.equal(r.dati.length, r.w * r.h);
  assert.equal(r.dati[Math.floor(r.h / 2) * r.w + Math.floor(r.w / 2)], 255);
  assert.equal(r.dati[0], 0);
});

test('annulla e ripeti: una chiave e una maschera tornano come prima', async () => {
  ambienteBrowser(); memoriaFinta(); globalThis.window = globalThis;
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const { store } = await carica('store');
  const { p, c } = clip();
  store.load(p);
  store.edit('Keyframe', (pp) => { A.mettiChiave(pp.clips[0], 'tf.x', 10, 50); pp.clips[0].maschere = [maschera('ellisse', {})]; });
  assert.equal(store.doc.clips[0].anim['tf.x'][0].v, 50);
  assert.equal(store.doc.clips[0].maschere.length, 1);
  store.doUndo();
  assert.equal(store.doc.clips[0].anim, undefined);
  assert.equal(store.doc.clips[0].maschere, undefined);
  store.doRedo();
  assert.equal(store.doc.clips[0].anim['tf.x'][0].v, 50);
  assert.equal(store.doc.clips[0].maschere[0].forma, 'ellisse');
  void c;
});
