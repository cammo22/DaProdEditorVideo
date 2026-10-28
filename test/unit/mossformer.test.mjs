// Il filtro del rumore MossFormer2 (src/core/mossformer.ts): la parte che non è il modello. Con una maschera finta e costante
// si controlla che il flusso cucia le finestre senza spostare né perdere campioni (anche ai bordi e con pezzi di misure strane).
import test from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const M = await carica('mossformer');

const segnale = (n) => Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.03) * 0.2 + Math.sin(i * 0.0011) * 0.1);
const maschera = (k) => async () => new Float32Array(M.MF.T * M.MF.BINS).fill(k);

async function flusso(x, pezzo, p) {
  const out = [];
  for (let i = 0; i < x.length; i += pezzo) out.push(await p.push(x.slice(i, i + pezzo)));
  out.push(await p.fine());
  const n = out.reduce((a, b) => a + b.length, 0);
  const tutto = new Float32Array(n);
  let q = 0;
  for (const b of out) { tutto.set(b, q); q += b.length; }
  return tutto;
}

test('MossFormer: le caratteristiche hanno la forma del modello (496 fotogrammi × 180 per 4 secondi)', () => {
  const f = M.caratteristiche(new Float64Array(M.MF.FINESTRA).map((_, i) => Math.sin(i * 0.05) * 3000));
  assert.equal(f.length, M.MF.T * M.MF.FEAT);
  assert.ok(f.every(Number.isFinite));
});

test('MossFormer: STFT e ISTFT sono una il contrario dell\'altra (maschera 1 = stesso audio)', async () => {
  const x = segnale(M.MF.FINESTRA);
  const y = await M.pulisciFinestra(x, maschera(1));
  let e = 0;
  for (let i = 3000; i < x.length - 3000; i++) e = Math.max(e, Math.abs(y[i] - x[i]));
  assert.ok(e < 1e-5, 'errore ' + e);
});

for (const [nome, lunghezza, pezzo] of [['11 secondi a pezzi dispari', 48000 * 11 + 123, 7777], ['meno di una finestra', 50000, 4096], ['esattamente una finestra', M.MF.FINESTRA, 48000], ['venti secondi a pezzi grossi', 48000 * 20, 100000]]) {
  test(`MossFormer: il flusso (${nome}) esce con tanti campioni quanti ne entrano, allineati`, async () => {
    const x = segnale(lunghezza);
    const y = await flusso(x, pezzo, new M.PulitoreMossFormer(maschera(0.5), 1));
    assert.equal(y.length, x.length);
    let e = 0;
    for (let i = 0; i < x.length; i++) e = Math.max(e, Math.abs(y[i] - 0.5 * x[i]));
    // (ai bordi la ricostruzione senza copertura piena è un po' meno esatta)
    assert.ok(e < 5e-3, 'errore ' + e);
  });
}

test('MossFormer: «mescola» tiene una parte dell\'originale', async () => {
  const x = segnale(48000 * 6);
  const y = await flusso(x, 20000, new M.PulitoreMossFormer(maschera(0), 0.7));
  let e = 0;
  for (let i = 4000; i < x.length - 4000; i++) e = Math.max(e, Math.abs(y[i] - 0.3 * x[i]));
  assert.ok(e < 1e-4, 'errore ' + e);
});

test('MossFormer: il silenzio non passa dal modello', async () => {
  let chiamate = 0;
  const p = new M.PulitoreMossFormer(async () => { chiamate++; return new Float32Array(M.MF.T * M.MF.BINS).fill(0); }, 1);
  const y = await flusso(new Float32Array(48000 * 9), 10000, p);
  assert.equal(chiamate, 0);
  assert.equal(y.length, 48000 * 9);
});

test('MossFormer: lo stereo con i due canali uguali esce con i due canali uguali', async () => {
  const x = segnale(48000 * 8);
  const p = new M.PulitoreMossFormerStereo(maschera(0.5), 1);
  const L = [], R = [];
  for (let i = 0; i < x.length; i += 12345) { const [l, r] = await p.push(x.slice(i, i + 12345), x.slice(i, i + 12345)); L.push(l); R.push(r); }
  const [l, r] = await p.fine(); L.push(l); R.push(r);
  const n = L.reduce((a, b) => a + b.length, 0);
  assert.equal(n, x.length);
  const a = new Float32Array(n), b = new Float32Array(n);
  let q = 0; for (const t of L) { a.set(t, q); q += t.length; }
  q = 0; for (const t of R) { b.set(t, q); q += t.length; }
  let e = 0; for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
  assert.ok(e < 1e-6, 'errore ' + e);
});
