import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';
import { scena, campioni } from './scena-effetti.mjs';
const B = await carica('blocchi'), P = await carica('progetto');

test('Grana: catalogo centrale, seme = fotogramma, forza sommata e limitata', () => {
  assert.equal(B.effettoTempo('grana')?.nome, 'Grana pellicola');
  const p = scena(P, B, ['grana', 'grana'], 1.5);
  const st = B.statoEffetti(p, 125);
  assert.equal(st.grana, 2);
  assert.equal(st.semeGrana, 125);
  assert.deepEqual(st, B.statoEffetti(p, 125));
  assert.equal(B.statoEffetti(p, 126).semeGrana, 126);
  assert.equal(B.statoEffetti(scena(P, B, ['grana'], 0), 125).grana, 0);
});

test('Nitidezza: si somma senza spegnere sfocatura e RGB, neutra a forza zero', () => {
  assert.equal(B.effettoTempo('nitido')?.motore, 'nitido');
  const p = scena(P, B, ['nitido', 'nitido', 'sfoca', 'rgb'], 1.5);
  const st = B.statoEffetti(p, 125);
  assert.equal(st.nitido, 2);
  assert.ok(st.blur > 0 && st.rgb > 0);
  assert.equal(B.statoEffetti(scena(P, B, ['nitido'], 0), 125).nitido, 0);
});

test('Censura: zona indipendente, parametri dal catalogo e copertura piena anche ai bordi temporali', () => {
  assert.equal(B.haCentro('censura'), true);
  const p = scena(P, B, ['censura', 'censura']);
  const [a, b] = p.clips.filter((c) => c.fxb);
  a.fxb.pos = [0.2, 0.3]; b.fxb.pos = [0.8, 0.7];
  a.fxb.parametri = { larghezza: 0.4, altezza: 0.2, morbido: 0.03 };
  const st = B.statoEffetti(p, 0);
  assert.equal(st.censure.length, 2);
  assert.deepEqual(st.censure[0], { x: 0.2, y: 0.3, w: 0.4, h: 0.2, morbido: 0.03 });
  assert.equal(st.censure[1].x, 0.8);
  assert.equal(st.censura, 2);
  assert.equal(st.cx, 0.5); // non sposta il centro degli altri effetti
  assert.equal(B.statoEffetti(p, 249).censure.length, 2);
  assert.equal(B.statoEffetti(p, 250), null);
  assert.equal(B.statoEffetti(scena(P, B, ['censura'], 0), 0).censure.length, 0);
  const def = B.effettoTempo('censura').parametri;
  assert.ok(def.every((c) => c.def >= c.min && c.def <= c.max));
  a.fxb.parametri = { larghezza: -3, altezza: Infinity, morbido: NaN };
  const z = B.statoEffetti(p, 125).censure[0];
  assert.equal(z.w, 0.02); assert.equal(z.h, 0.25); assert.equal(z.morbido, 0.015);
  a.fxb.posFine = [0.6, 0.5];
  assert.ok(B.statoEffetti(p, 125).censure[0].x > 0.2);
});

test('Censura: oltre otto zone si usa un inviluppo conservativo, nessuna zona viene scartata', () => {
  const p = scena(P, B, Array(12).fill('censura'));
  p.clips.filter((c) => c.fxb).forEach((c, i) => { c.fxb.pos = [i / 12, 0.5]; });
  const st = B.statoEffetti(p, 125);
  assert.ok(st.censure.length <= 8 && st.censure.length > 0);
  for (let i = 0; i < 12; i++) assert.ok(st.censure.some((z) => Math.abs(z.x - i / 12) <= z.w / 2 + 1e-9));
});

test('Gli stati dei 72 effetti preesistenti restano identici alla baseline eed765d', () => {
  const archivio = JSON.parse(readFileSync(new URL('./riferimenti/stati-fx-1.5.7.json', import.meta.url), 'utf8'));
  const ref = JSON.parse(readFileSync(path.join(process.env.DPV_UNIT, 'baseline-fx.json'), 'utf8'));
  assert.deepEqual(Object.keys(ref).sort(), Object.keys(archivio).sort());
  const aggiunti = new Set(['grana', 'nitido', 'censura', 'semeGrana', 'censure']);
  const attuali = campioni(P, B);
  for (const id of Object.keys(ref)) {
    const stati = attuali[id]; assert.ok(stati, `effetto baseline mancante: ${id}`);
    const vecchi = stati.map((st) => Object.fromEntries(Object.entries(st).filter(([k]) => !aggiunti.has(k))));
    assert.equal(createHash('sha256').update(JSON.stringify(vecchi)).digest('hex'), ref[id], id);
  }
  assert.equal(Object.keys(ref).length, 72);
});

test('Gli effetti senza picco non riscansionano le clip per cercare un taglio inutile', () => {
  const p = scena(P, B, ['bn', 'sfoca', 'bagliore']);
  const clips = p.clips; let letture = 0;
  Object.defineProperty(p, 'clips', { get() { letture++; return clips; } });
  B.statoEffetti(p, 125);
  assert.ok(letture <= 2, `letture dell'albero clip: ${letture}`);
});

test('Catalogo senza doppioni, uniform dichiarate e nuovi parametri opzionali round-trip JSON', () => {
  const ids = B.EFFETTI_TEMPO.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const src = readFileSync(new URL('../../src/render/compositore.ts', import.meta.url), 'utf8');
  const shader = src.slice(src.indexOf('const FS_FX ='), src.indexOf('export const FS_COMBINE'));
  for (const k of B.CAMPI_FX) assert.match(shader, new RegExp(`uniform float [^;]*\\bu_${k}\\b`), k);
  const p = scena(P, B, ['grana', 'nitido', 'censura']);
  p.clips.find((c) => c.fxb?.id === 'censura').fxb.parametri = { larghezza: 0.4 };
  assert.deepEqual(B.statoEffetti(JSON.parse(JSON.stringify(p)), 125), B.statoEffetti(p, 125));
  assert.equal(B.parametroFx({ ...B.nuovoBlocco('effetto', 'censura') }, 'larghezza'), 0.25);
});

test('Il compositore invia quantità, seme e zone allo stesso draw FX (GL registrato, NON pixel GPU)', async () => {
  ambienteBrowser(); memoriaFinta();
  // fotogrammi.ts arma il pulitore dei decoder all'import. Qui non esistono decoder aperti:
  // registriamo e chiudiamo quel timer al termine del test, senza cambiare il modulo reale.
  const intervalli = [], originale = globalThis.setInterval;
  globalThis.setInterval = (...args) => { const h = originale(...args); intervalli.push(h); return h; };
  let Compositore;
  try { ({ Compositore } = await carica('compositore')); }
  finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }
  const valori = new Map(); let disegni = 0;
  const gl = new Proxy({}, { get(_t, k) {
    if (k === 'drawArrays') return () => { disegni++; };
    if (String(k).startsWith('uniform')) return (nome, ...v) => valori.set(nome, v.map((x) => ArrayBuffer.isView(x) ? [...x] : x));
    return () => {};
  } });
  const c = Object.create(Compositore.prototype);
  c.gl = gl; c.fbo = Array.from({ length: 5 }, () => ({ fb: {}, tex: {} })); c.pFx = {};
  c.uF = new Proxy({}, { get: (_t, k) => k });
  const p = scena(P, B, ['grana', 'nitido', 'censura']);
  p.clips.find((c) => c.fxb?.id === 'censura').fxb.pos = [0.2, 0.3];
  c.effetti(B.statoEffetti(p, 125), 125, 1920, 1080);
  assert.equal(disegni, 1);
  assert.deepEqual(valori.get('u_semeGrana'), [125]);
  assert.deepEqual(valori.get('u_grana'), [1]); assert.deepEqual(valori.get('u_nitido'), [1]);
  assert.deepEqual(valori.get('u_numCensure'), [1]);
  const z = valori.get('u_censure')[0];
  assert.ok(Math.abs(z[0] - 0.2) < 1e-6 && Math.abs(z[1] - 0.7) < 1e-6);
  c.effetti(B.statoEffetti(scena(P, B, ['bn']), 125), 125, 1920, 1080);
  assert.deepEqual(valori.get('u_numCensure'), [0]);
});

test('Censura segue i punti tracciati della clip, senza cambiare il centro di altri FX', () => {
  const p = scena(P, B, ['censura', 'bolla']);
  const t = p.clips[0].track;
  p.media.push({ id: 'tracciata', width: p.w, height: p.h, rotation: 0, t0: 0 });
  const sorg = P.newClip('media', t, 0, 250, { media: 'tracciata', traccia: { da: 0, fiducia: 1, punti: [{ t: 0, x: 0.2, y: 0.3 }, { t: 10, x: 0.8, y: 0.7 }] } });
  p.clips.push(sorg);
  p.clips.find((c) => c.fxb?.id === 'censura').fxb.segue = sorg.id;
  const a = B.statoEffetti(p, 0), b = B.statoEffetti(p, 125);
  assert.ok(Math.abs(a.censure[0].x - 0.2) < 1e-9);
  assert.ok(Math.abs(b.censure[0].x - 0.5) < 1e-9);
  assert.equal(a.cx, 0.5); assert.equal(b.cx, 0.5);
});

test('Nuovi FX e parametri passano per annulla/ripeti dello store reale', async () => {
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  const { store } = await carica('store');
  const p = scena(P, B, []); store.load(p);
  const n = p.clips.length;
  store.edit('Censura', (p) => { B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'censura'), parametri: { larghezza: 0.4 } }, 0, 250); });
  assert.equal(store.doc.clips.length, n + 1);
  const prima = B.statoEffetti(store.doc, 125);
  store.doUndo(); assert.equal(store.doc.clips.length, n);
  store.doRedo(); assert.deepEqual(B.statoEffetti(store.doc, 125), prima);
});

test('Il seme della grana è collegato al programma shader (non solo allo stato)', () => {
  const src = readFileSync(new URL('../../src/render/compositore.ts', import.meta.url), 'utf8');
  const registrazione = src.slice(src.indexOf("for (const n of ['u_src', 'u_res'"), src.indexOf('this.uF[n]') + 12);
  for (const n of ['u_semeGrana', 'u_numCensure', 'u_censure', 'u_morbidoCensure']) assert.ok(registrazione.includes(`'${n}'`), n);
});
