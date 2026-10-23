// Percorsi veri progetti/store/libreria; decode immagine ritardato per riprodurre le race.
// Nessun DOM/GUI/browser automatizzato: rAF inerte, ImageBitmap finto, nessun rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta, finche } from './_aiuti.mjs';
ambienteBrowser(); memoriaFinta();
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.ImageBitmap = class { width = 640; height = 360; chiusa = false; close() { this.chiusa = true; } };
globalThis.OffscreenCanvas = class { getContext() { return { clearRect() {}, drawImage() {}, getImageData() { return { data: new Uint8Array(64 * 36 * 4) }; } }; } };
const intervalli = [], originale = globalThis.setInterval;
globalThis.setInterval = (...a) => { const h = originale(...a); intervalli.push(h); return h; };
let PR, AT, L, store;
try {
  PR = await carica('progetti'); AT = await carica('attivita'); L = await carica('libreria'); ({ store } = await carica('store'));
} finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }

test('Copia convertita non si applica dopo cambio progetto con lo stesso ID durante import descrizione', async () => {
  globalThis.createImageBitmap = async () => new ImageBitmap();
  const original = await L.importa({ name: 'originale.png', file: new File(['x'], 'originale.png') });
  store.doc.media = [original.item];
  const l = AT.nuova({ titolo: 'Conversione', categoria: 'conversione' });
  let risolvi, primaLettura = true; const bmp = new ImageBitmap(); bmp.width = 123;
  globalThis.createImageBitmap = () => {
    if (!primaLettura) return Promise.resolve(new ImageBitmap());
    primaLettura = false; return new Promise((r) => { risolvi = r; });
  };
  const esito = PR._testMettiCopia(original.item.id, { name: 'copia.png', file: new File(['y'], 'copia.png') }, l, original.rt);
  await finche(() => !!risolvi);
  const prima = structuredClone(original.item);
  AT.cambiaProgetto(); store.doc.media = [structuredClone(prima)]; risolvi(bmp);
  let errore; const risultato = await esito.catch((e) => { errore = e; return null; });
  assert.deepEqual(store.doc.media, [prima]);
  assert.ifError(errore); assert.equal(risultato, false); assert.equal(bmp.chiusa, true);
  L.chiudi(original.item.id);
});

test('Import annullato durante la lettura: nessun media consegnato, runtime parziale chiuso', async () => {
  const vecchi = store.doc.media.length; let risolvi;
  const bitmap = new ImageBitmap();
  globalThis.createImageBitmap = () => new Promise((r) => { risolvi = r; });
  const esito = PR.importaFile([{ name: 'lenta.png', file: new File(['x'], 'lenta.png') }], { chiediFormato: false });
  await finche(() => !!risolvi);
  AT.cambiaProgetto(); risolvi(bitmap);
  // Prima della correzione passa perfino al toast DOM: conta anzitutto la mutazione reale dello store.
  let errore; const nuovi = await esito.catch((e) => { errore = e; return null; });
  assert.equal(store.doc.media.length, vecchi);
  assert.ifError(errore); assert.deepEqual(nuovi, []);
  assert.equal(bitmap.chiusa, true);
});
