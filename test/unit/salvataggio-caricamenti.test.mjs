// Regressioni senza avviare l'app: disco che fallisce, worker lenti e timer controllato a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';

ambienteBrowser(); memoriaFinta();
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const intervalli = new Map();
let seq = 0;
globalThis.setInterval = (fn) => { const id = ++seq; intervalli.set(id, fn); return id; };
globalThis.clearInterval = (id) => intervalli.delete(id);
globalThis.setTimeout = () => 0;
const avvisi = [];
const elemento = () => ({
  children: [], setAttribute() {}, addEventListener() {},
  get firstChild() { return this.children[0]; },
  appendChild(e) { e.remove = () => { this.children = this.children.filter((x) => x !== e); }; this.children.push(e); return e; },
});
globalThis.document = {
  baseURI: 'https://prova.invalid/app/', dispatchEvent() {},
  createElement: elemento, createTextNode: (s) => { avvisi.push(s); return {}; }, body: elemento(),
};

const PR = await carica('progetti');
const { store } = await carica('store');
const TD = await carica('traduci');
const V = await carica('voce');
const RT = await carica('ritaglio');
const VR = await carica('vram');
const LV = await carica('live');
intervalli.clear(); // Il battito delle attività non serve in queste prove.

test('Autosalvataggio: apertura fallita e transazione abortita ritentano, un solo avviso', async () => {
  store.dirty = true;
  let tentativi = 0, modo = 'apertura';
  globalThis.indexedDB = { open() {
    tentativi++;
    const r = { error: new Error('spazio pieno'), result: { transaction() {
      const richiesta = { result: undefined };
      const tx = { error: new Error('transazione abortita'), objectStore: () => ({ put: () => richiesta }) };
      queueMicrotask(() => {
        richiesta.onsuccess?.();
        if (modo === 'abortita') tx.onabort(); else tx.oncomplete();
      });
      return tx;
    } } };
    queueMicrotask(() => { if (modo === 'apertura') r.onerror(); else r.onsuccess(); });
    return r;
  } };
  await PR.autosalva(); await PR.autosalva();
  assert.equal(tentativi, 2);
  modo = 'abortita';
  await PR.autosalva(); await PR.autosalva();
  assert.equal(tentativi, 4, 'la riuscita della richiesta non basta: conta la transazione');
  assert.equal(avvisi.filter((s) => s.includes('copia automatica')).length, 1);
  modo = 'riuscita';
  await PR.autosalva(); await PR.autosalva();
  assert.equal(tentativi, 5, 'dopo il successo la stessa revisione non si riscrive');
});

const worker = [];
globalThis.Worker = class {
  messaggi = [];
  constructor() { worker.push(this); }
  postMessage(m) { this.messaggi.push(m); }
  terminate() { this.chiuso = true; }
  rispondi(data) { this.onmessage({ data }); }
};

for (const [nome, caricaModello] of [
  ['voce', () => V.caricaModelloVoce('prova', () => {})],
  ['ritaglio', () => RT.segmentatoreAttuale().carica(RT.MODELLI_RITAGLIO[0], () => {})],
]) {
  test(`${nome}: due chiamate condividono errore e nuovo caricamento`, async () => {
    const prima = caricaModello(), seconda = caricaModello();
    const w = worker.at(-1);
    assert.equal(w.messaggi.length, 1);
    const esiti = Promise.allSettled([prima, seconda]);
    w.rispondi({ tipo: 'errore', msg: 'prova fallita' });
    assert.deepEqual((await esiti).map((x) => x.status), ['rejected', 'rejected']);
    const riprova = caricaModello(), insieme = caricaModello();
    assert.equal(w.messaggi.length, 2);
    w.rispondi({ tipo: 'pronto', device: 'wasm' });
    await Promise.all([riprova, insieme]);
    VR.liberaVram();
  });
}

test('Voce: un modello diverso aspetta il caricamento già in corso', async () => {
  const prima = V.caricaModelloVoce('uno', () => {});
  const seconda = V.caricaModelloVoce('due', () => {});
  const w = worker.at(-1);
  assert.equal(w.messaggi.length, 1);
  w.rispondi({ tipo: 'pronto', device: 'wasm' });
  await prima;
  assert.equal(w.messaggi.length, 2);
  assert.equal(w.messaggi[1].modello, 'due');
  w.rispondi({ tipo: 'pronto', device: 'wasm' });
  await seconda;
  VR.liberaVram();
});

test('Libera memoria: il worker occupato si chiude al termine, anche dopo un nuovo uso', () => {
  let occupato = true, caricato = true;
  VR.registraVram('prova', {
    occupato: () => occupato,
    libera: () => { const prima = caricato; caricato = false; return prima; },
  });
  VR.segnaUsoAI();
  assert.equal(VR.liberaVram(), 0);
  assert.equal(intervalli.size, 1);
  const controlla = [...intervalli.values()][0];
  controlla();
  assert.equal(caricato, true);
  VR.segnaUsoAI();
  occupato = false;
  controlla();
  assert.equal(caricato, false);
  assert.equal(intervalli.size, 0);
});

test('LIVE: chiudere il selettore non avvisa, permesso negato e API mancante sì', async () => {
  const partenza = avvisi.length;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia() {} } });
  let stato = 'prompt';
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: stato }) } });
  await LV._testAvvisaErroreSchermo(new DOMException('', 'NotAllowedError'));
  await LV._testAvvisaErroreSchermo(new DOMException('', 'AbortError'));
  assert.equal(avvisi.length, partenza);
  stato = 'denied';
  await LV._testAvvisaErroreSchermo(new DOMException('', 'NotAllowedError'));
  assert.match(avvisi.at(-1), /permessi/);
  stato = 'prompt';
  await LV._testAvvisaErroreSchermo(new DOMException('Permission denied by system', 'NotAllowedError'));
  assert.match(avvisi.at(-1), /permessi/);
  await LV._testAvvisaErroreSchermo(new DOMException('schermo non leggibile', 'NotReadableError'));
  assert.match(avvisi.at(-1), /schermo non leggibile/);
  delete navigator.mediaDevices;
  await LV._testAvvisaErroreSchermo(new TypeError('getDisplayMedia non disponibile'));
  assert.match(avvisi.at(-1), /non si può condividere lo schermo/);
  assert.equal(avvisi.length, partenza + 4);
});
