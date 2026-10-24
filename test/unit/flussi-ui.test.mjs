import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const UI = await carica('flussiUI');
test('un gruppo concluso con errori permette di riprovare solo i falliti', () => {
  assert.deepEqual(UI.azioniAttivita({ stato:'finita', errori:1, capacita:{ pausa:'no', annulla:true, riprova:true } }), ['riprova']);
});
test('il batch non salta righe quando annulla modifica la lista originale', () => {
  const righe = [1,2,3].map(id => ({id, stato:'coda', capacita:{ pausa:'no', annulla:true, riprova:true }}));
  const fatti = [];
  assert.equal(typeof UI.agisciBatch, 'function');
  UI.agisciBatch(righe, 'annulla', (_a, id) => { fatti.push(id); righe.splice(righe.findIndex(r => r.id === id), 1); });
  assert.deepEqual(fatti, [1,2,3]);
});
test('retry distingue una barra informativa da un lavoro schedulato e si consuma', async () => {
  globalThis.window = globalThis;
  const A = await carica('attivita');
  A.azzeraAttivita();
  assert.equal(typeof A.puoRiprovare, 'function');
  const barra = A.nuova({ titolo:'AI', categoria:'ai' });
  barra.errore('errore del worker');
  assert.equal(A.puoRiprovare(barra.riga.id), false);
  let volte = 0;
  await A.inCoda({titolo:'preparazione', categoria:'analisi', corsia:'leggero'}, async () => { if (!volte++) throw Error('temporaneo'); });
  const r = A.attivitaFinite().find(r => r.titolo === 'preparazione');
  assert.equal(A.puoRiprovare(r.id), true);
  assert.equal(A.riprovaRiga(r.id), 1);
  assert.equal(A.puoRiprovare(r.id), false);
  await new Promise(r => setTimeout(r, 30));
  A.azzeraAttivita();
});
test('AI richiede una sola clip esplicita, mai la clip sotto il cursore', () => {
  const clips = [{id:'a'}, {id:'b'}];
  assert.equal(UI.clipEsplicita(clips, new Set(), () => true), undefined);
  assert.equal(UI.clipEsplicita(clips, new Set(['a','b']), () => true), undefined);
  assert.equal(UI.clipEsplicita(clips, new Set(['a']), () => false), undefined);
  assert.equal(UI.clipEsplicita(clips, new Set(['b']), () => true), clips[1]);
});
test('azioni Attività: manuale avvia, pausa solo se reale, errore riprova', () => {
  assert.deepEqual(UI.azioniAttivita({ stato: 'manuale', capacita: { pausa:'no', annulla:true, riprova:true } }), ['avvia','annulla']);
  assert.deepEqual(UI.azioniAttivita({ stato: 'lavoro', capacita: { pausa:'no', annulla:true, riprova:false } }), ['annulla']);
  assert.deepEqual(UI.azioniAttivita({ stato: 'lavoro', capacita: { pausa:'ai-confini', annulla:true, riprova:false } }), ['pausa','annulla']);
  assert.deepEqual(UI.azioniAttivita({ stato: 'pausa', capacita: { pausa:'vera', annulla:true, riprova:false } }), ['riprendi','annulla']);
  assert.deepEqual(UI.azioniAttivita({ stato: 'errore', capacita: { pausa:'no', annulla:true, riprova:true } }), ['riprova']);
  assert.deepEqual(UI.azioniAttivita({ stato: 'finita', capacita: { pausa:'no', annulla:true, riprova:true } }), []);
});
