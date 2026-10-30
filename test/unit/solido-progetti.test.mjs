// La rete di sicurezza dentro src/progetti.ts: la copia di emergenza e le versioni automatiche che l'autosalvataggio
// scrive, e riaprire un progetto da un testo (recupero, ripristino di una versione). Deposito in memoria, niente browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';
ambienteBrowser(); memoriaFinta();
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const intervalli = [], originale = globalThis.setInterval;
globalThis.setInterval = (...a) => { const h = originale(...a); intervalli.push(h); return h; };
let PR, VE, SO, PJ, store;
try {
  PR = await carica('progetti'); VE = await carica('versioni'); SO = await carica('solido'); PJ = await carica('progetto'); ({ store } = await carica('store'));
} finally { globalThis.setInterval = originale; for (const h of intervalli) clearInterval(h); }

const mediaFinto = (id) => ({ id, type: 'video', name: id + '.mp4', size: 10, duration: 5, width: 640, height: 360, fps: 25, rotation: 0, lastModified: 1 });

test('la rete di sicurezza: emergenza con il segno «da salvare» e una versione automatica; progetto vuoto = niente', async () => {
  const dep = VE.depositoInMemoria();
  VE.impostaDeposito(dep);
  try {
    store.load(PJ.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false }));
    await PR._testRete(JSON.stringify(store.doc), 1);
    assert.equal(await VE.leggiEmergenza(), null, 'progetto vuoto: nessuna copia');

    store.doc.name = 'Prova rete';
    store.doc.media.push(mediaFinto('m1'));
    store.dirty = true;
    await PR._testRete(JSON.stringify(store.doc), 2);
    const e = await VE.leggiEmergenza();
    assert.equal(e.sporco, true); assert.equal(e.nome, 'Prova rete'); assert.equal(e.media, 1); assert.equal(e.revisione, 2);
    assert.equal(SO.serveRecupero(true, e), true);
    const versioni = await VE.elencoVersioni(VE.chiaveVersioni(store.doc, null));
    assert.equal(versioni.length, 1); assert.equal(versioni[0].motivo, 'automatica');

    // subito dopo, senza cambiare niente, non si fa un'altra versione
    await PR._testRete(JSON.stringify(store.doc), 3);
    assert.equal((await VE.elencoVersioni(VE.chiaveVersioni(store.doc, null))).length, 1);

    // il progetto torna vuoto («Nuovo»): la copia di emergenza non ha più niente da recuperare
    store.load(PJ.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false }));
    await PR._testRete(JSON.stringify(store.doc), 4);
    assert.equal(SO.serveRecupero(true, await VE.leggiEmergenza()), false);
  } finally { VE.impostaDeposito(null); }
});

test('apriDaTesto: un testo di progetto si apre (e dice quanti file mancano), il resto no', async () => {
  const p = PJ.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
  p.name = 'Da recuperare';
  p.media.push(mediaFinto('m9'));
  const mancano = await PR._testApriDaTesto(JSON.stringify(p), null);
  assert.equal(mancano, 1, 'il file finto non si riapre: da ricollegare');
  assert.equal(store.doc.name, 'Da recuperare');
  assert.equal(store.dirty, false);
  assert.equal(await PR._testApriDaTesto('non è json', null), null);
  assert.equal(await PR._testApriDaTesto(JSON.stringify({ format: 'altro' }), null), null);
  const vuoto = PJ.newProject({ w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false });
  assert.equal(await PR._testApriDaTesto(JSON.stringify(vuoto), null), null, 'un progetto vuoto non vale un recupero');
  assert.equal(store.doc.name, 'Da recuperare', 'se il testo non va, il progetto aperto resta com\'è');
});
