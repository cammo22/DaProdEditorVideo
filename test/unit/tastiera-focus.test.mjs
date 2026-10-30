// Handler reale in sandbox Node: non prova la navigazione nativa del browser.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const sorgente = readFileSync(new URL('../../src/ui/tastiera.ts', import.meta.url), 'utf8');
function ambiente() {
  let handler, chiamate = 0;
  const codice = stripTypeScriptTypes(sorgente.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''));
  vm.runInNewContext(codice + '\ninstallaTastiera();', {
    azioni: new Map([['monitor', { id: 'monitor', tasti: ['Tab'], fn: () => chiamate++ }]]),
    window: { addEventListener: (_, fn) => { handler = fn; } },
    document: { querySelector: () => null, documentElement: { classList: { contains: () => false } } },
  });
  return (tagName, interattivo, defaultPrevented = false) => {
    let impedito = false;
    handler({ defaultPrevented, target: { tagName, closest: () => interattivo ? {} : null }, key: 'Tab', code: 'Tab',
      preventDefault: () => { impedito = true; } });
    return { impedito, chiamate };
  };
}
for (const tag of ['BUTTON', 'A', 'SPAN']) test(`Tab su controllo ${tag} resta navigazione del browser`, () => {
  assert.deepEqual(ambiente()(tag, true), { impedito: false, chiamate: 0 });
});
test('Tab sulla timeline conserva il cambio monitor storico', () => {
  assert.deepEqual(ambiente()('CANVAS', false), { impedito: true, chiamate: 1 });
});
test('Tab nei campi non attiva il cambio monitor', () => {
  assert.deepEqual(ambiente()('INPUT', true), { impedito: false, chiamate: 0 });
});

test('un tasto già preso da LIVE non attiva un secondo comando globale', () => {
  assert.deepEqual(ambiente()('CANVAS', false, true), { impedito: false, chiamate: 0 });
});
