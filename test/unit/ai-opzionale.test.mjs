import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambienteBrowser, carica, memoriaFinta } from './_aiuti.mjs';
ambienteBrowser(); memoriaFinta();
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const intervallo = globalThis.setInterval;
globalThis.setInterval = (...args) => { const timer = intervallo(...args); timer.unref(); return timer; };
const { idoneitaAI } = await carica('idoneitaAI');
const { modelliHub } = await carica('modelliAI');
const { riparaAI } = await carica('centroAI');
const scheda = { prova: 'si', guasta: false, software: false };
const macchina = { cpu: 12, ram: 16, gpuApi: true, scelta: 0, schede: [scheda] };
const requisiti = { ramGB: 8, thread: 8 };

test('Ogni modello dichiara uso, peso e requisiti senza scaricare nulla', () => {
  const lista = modelliHub();
  assert.ok(lista.length >= 6);
  for (const m of lista) {
    assert.ok(m.uso.length > 10, m.id);
    assert.ok(m.mb > 0, m.id);
    assert.ok(m.ramGB > 0 && m.thread > 0, m.id);
  }
  assert.equal(lista.find((m) => m.id === 'nllb').processore, true);
});

test('WebGPU provata: scheda adatta, velocità e VRAM restano da verificare', () => {
  const esito = idoneitaAI(requisiti, macchina, true);
  assert.match(esito.dove, /Scheda video/);
  assert.match(esito.testo, /WebGPU superata/);
  assert.match(esito.testo, /VRAM libera non rilevabile/);
  assert.notEqual(esito.ok, true, 'non è una misura della velocità del modello');
});

test('Scheda spenta, guasta, software o assente: processore; NLLB resta sempre sul processore', () => {
  for (const [h, on] of [[macchina, false], [{ ...macchina, gpuApi: false }, true], [{ ...macchina, scelta: -1 }, true], [{ ...macchina, schede: [{ ...scheda, guasta: true }] }, true], [{ ...macchina, schede: [{ ...scheda, software: true }] }, true], [{ ...macchina, schede: [{ ...scheda, prova: 'no' }] }, true]]) {
    assert.equal(idoneitaAI(requisiti, h, on).dove, 'Processore');
  }
  assert.equal(idoneitaAI({ ...requisiti, processore: true }, macchina, true).dove, 'Processore');
  assert.match(idoneitaAI(requisiti, { ...macchina, cpu: 2, ram: 2 }, false).testo, /Può essere lento/);
  assert.match(idoneitaAI(requisiti, { ...macchina, ram: null }, false).testo, /Memoria non rilevata/);
  assert.equal(idoneitaAI(requisiti, null, true).ok, null);
});

test('Il controllo AI non scarica modelli, neppure se consigliati e tutti mancanti', async () => {
  // Worker e connessione finti: nessuna rete o modello vero nelle prove.
  globalThis.self = globalThis;
  globalThis.fetch = async () => ({ ok: true });
  globalThis.Worker = class {
    postMessage() { queueMicrotask(() => this.onmessage({ data: { ok: true, dove: 'locale', ms: 1, msg: '' } })); }
    terminate() {}
  };
  let scaricati = 0;
  const lista = modelliHub().map((m) => ({ ...m, consigliato: true, scarica: async () => { scaricati++; } }));
  const r = await riparaAI({ lista });
  assert.equal(r.ok, true);
  assert.equal(scaricati, 0);
  assert.match(r.testo, /opzionali/);
  assert.match(r.testo, /Nessun modello scaricato/);
});
