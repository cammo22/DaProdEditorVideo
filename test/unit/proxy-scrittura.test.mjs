import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, memoriaFinta, finche } from './_aiuti.mjs';
memoriaFinta();
const PX = await carica('proxy');

test('Un proxy preesistente non appartiene al lavoro annullato: non si cancella', async () => {
  let valido = true, rimossi = 0;
  const dir = {
    async getFileHandle() { valido = false; return {}; },
    async removeEntry() { rimossi++; },
  };
  Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: { async getDirectory() { return { async getDirectoryHandle() { return dir; } }; } } });
  const m = { name: 'duplicato.mp4', size: 1, lastModified: 1, duration: 2, width: 1920, height: 1080 };
  assert.equal(await PX._testScriviProxy(m, new ArrayBuffer(8), { get valido() { return valido; } }), null);
  assert.equal(rimossi, 0);
});

test('Proxy annullato durante close OPFS: elimina il file, non pubblica un risultato tardivo', async () => {
  let valido = true, chiudi; let rimosso = 0, scritti = 0;
  const dir = {
    async getFileHandle(_nome, opzioni) {
      if (!opzioni?.create) throw Object.assign(Error('non c’è'), { name: 'NotFoundError' });
      return {
      async createWritable() { return { async write() { scritti++; }, async close() { await new Promise((r) => { chiudi = r; }); }, async abort() {} }; },
      async getFile() { return new File(['non deve essere aperto'], 'proxy.mp4'); },
    }; },
    async removeEntry() { rimosso++; },
  };
  Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: { async getDirectory() { return { async getDirectoryHandle() { return dir; } }; } } });
  const m = { name: 'video.mp4', size: 1, lastModified: 1, duration: 2, width: 1920, height: 1080 };
  const risultato = PX._testScriviProxy(m, new ArrayBuffer(8), { get valido() { return valido; } });
  await finche(() => !!chiudi); valido = false; chiudi();
  assert.equal(await risultato, null); assert.equal(scritti, 1); assert.equal(rimosso, 1);
});
