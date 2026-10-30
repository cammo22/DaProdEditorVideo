// La misura del volume (BS.1770): i filtri K come nella norma, il livello di un seno noto, le porte, il true peak
// e il guadagno per portare il montaggio al traguardo di una piattaforma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';

const L = await carica('loudness');
const SR = 48000;

function seno(freq, db, sec, fase = 0, sr = SR) {
  const n = Math.round(sec * sr), a = Math.pow(10, db / 20), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * freq * i / sr + fase);
  return x;
}
const vicino = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} non è vicino a ${b} (±${tol})`);

test('i filtri K a 48 kHz sono quelli scritti nella norma BS.1770', () => {
  const [alto, basso] = L.filtriK(48000);
  vicino(alto.b0, 1.53512485958697, 1e-9);
  vicino(alto.b1, -2.69169618940638, 1e-9);
  vicino(alto.b2, 1.19839281085285, 1e-9);
  vicino(alto.a1, -1.69065929318241, 1e-9);
  vicino(alto.a2, 0.73248077421585, 1e-9);
  vicino(basso.a1, -1.99004745483398, 1e-9);
  vicino(basso.a2, 0.99007225036621, 1e-9);
});

test('un seno a 997 Hz a -23 dBFS su due canali misura -23 LUFS (la prova della EBU)', () => {
  const x = seno(997, -23, 20);
  const r = L.misuraTutto([x, x], SR);
  vicino(r.lufs, -23, 0.1);
  vicino(r.picco, -23, 0.1);
  vicino(r.durata, 20, 0.001);
});

test('un seno a 0 dBFS su un solo canale misura -3,01 LUFS, su due 0 LUFS', () => {
  const x = seno(997, 0, 10), z = new Float32Array(x.length);
  vicino(L.misuraTutto([x, z], SR).lufs, -3.01, 0.1);
  vicino(L.misuraTutto([x, x], SR).lufs, 0, 0.1);
});

test('la misura non dipende dalla frequenza di campionamento', () => {
  for (const sr of [44100, 48000, 96000]) {
    const x = seno(997, -23, 12, 0, sr);
    vicino(L.misuraTutto([x, x], sr).lufs, -23, 0.15);
  }
});

test('la porta relativa butta il tratto basso: 10 s a -23 e 10 s a -50 misurano -23', () => {
  const a = seno(997, -23, 10), b = seno(997, -50, 10);
  const x = new Float32Array(a.length + b.length);
  x.set(a, 0); x.set(b, a.length);
  vicino(L.misuraTutto([x, x], SR).lufs, -23, 0.15);
});

test('la porta assoluta: il silenzio e un fruscio sotto -70 LUFS non hanno volume (null)', () => {
  assert.equal(L.misuraTutto([new Float32Array(SR * 5), new Float32Array(SR * 5)], SR).lufs, null);
  const x = seno(997, -80, 5);
  const r = L.misuraTutto([x, x], SR);
  assert.equal(r.lufs, null);
  assert.ok(r.picco !== null && r.picco < -79, 'il picco però si vede');
  assert.equal(L.misuraTutto([new Float32Array(100), new Float32Array(100)], SR).picco, null);
});

test('il true peak trova il picco fra due campioni: un seno a fs/4 a 45 gradi ha campioni a -3 dB e picco vero a 0 dBTP', () => {
  const x = seno(SR / 4, 0, 2, Math.PI / 4);
  const r = L.misuraTutto([x, x], SR);
  vicino(r.piccoCampione, -3.01, 0.05);
  vicino(r.picco, 0, 0.25);
  assert.ok(r.picco > r.piccoCampione + 2.5);
});

test('il true peak di un seno normale è il suo picco', () => {
  const x = seno(1000, -6, 3);
  const r = L.misuraTutto([x, x], SR);
  vicino(r.picco, -6, 0.1);
});

test('dare l\'audio a pezzi di misure strane fa lo stesso conto che tutto insieme', () => {
  const x = seno(440, -18, 7), y = seno(660, -20, 7);
  const intero = L.misuraTutto([x, y], SR);
  const m = new L.MisuraLoudness(SR, 2);
  let i = 0;
  const pezzi = [1, 7, 333, 4800, 12345, 50001];
  for (let k = 0; i < x.length; k++) {
    const n = pezzi[k % pezzi.length];
    m.aggiungi([x.subarray(i, i + n), y.subarray(i, i + n)]);
    i += n;
  }
  const r = m.fine();
  vicino(r.lufs, intero.lufs, 0.02);
  vicino(r.picco, intero.picco, 0.02);
});

test('il guadagno porta al traguardo e si ferma al picco massimo', () => {
  const g = L.guadagnoPer({ lufs: -20, picco: -8 }, -14);
  vicino(g.db, 6, 1e-9);
  assert.equal(g.limitato, false);
  vicino(g.piccoDopo, -2, 1e-9);
  const stretto = L.guadagnoPer({ lufs: -20, picco: -3 }, -14);
  assert.equal(stretto.limitato, true);
  vicino(stretto.piccoDopo, L.PICCO_TETTO, 1e-9);
  vicino(stretto.db, 2, 1e-9);
  vicino(stretto.lufsDopo, -18, 1e-9);
  assert.equal(L.guadagnoPer({ lufs: null, picco: null }, -14), null);
  vicino(L.guadagnoPer({ lufs: -9, picco: -4 }, -14).db, -5, 1e-9);
});

test('le spie: verde vicino al traguardo, ambra un po\' lontano, rossa se il picco satura', () => {
  assert.equal(L.luceVolume(-14.4, -14), 'verde');
  assert.equal(L.luceVolume(-16.5, -14), 'ambra');
  assert.equal(L.luceVolume(-23, -14), 'rossa');
  assert.equal(L.luceVolume(null, -14), 'spenta');
  assert.equal(L.lucePicco(-1.5), 'verde');
  assert.equal(L.lucePicco(-0.5), 'ambra');
  assert.equal(L.lucePicco(0.3), 'rossa');
});

test('i numeri si scrivono all\'italiana, col vero segno meno', () => {
  assert.equal(L.numeroDb(-14.23), '\u221214,2');
  assert.equal(L.numeroDb(2), '+2,0');
  assert.equal(L.numeroDb(0), '0,0');
  assert.equal(L.numeroDb(-0.01), '0,0');
});

test('la firma cambia se cambia il montaggio o il tratto', () => {
  const a = L.firmaAudio({ clips: [{ id: 1, v: 0 }] }, 0, 10);
  assert.equal(a, L.firmaAudio({ clips: [{ id: 1, v: 0 }] }, 0, 10));
  assert.notEqual(a, L.firmaAudio({ clips: [{ id: 1, v: 1 }] }, 0, 10));
  assert.notEqual(a, L.firmaAudio({ clips: [{ id: 1, v: 0 }] }, 0, 11));
});
