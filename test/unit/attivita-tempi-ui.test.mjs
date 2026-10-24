// Esegue il formatter TypeScript reale, senza DOM/browser. Non certifica layout o encoder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const sorgente = readFileSync(new URL('../../src/ui/attivita.ts', import.meta.url), 'utf8');
const funzione = sorgente.slice(sorgente.indexOf('export function tempoDi'), sorgente.indexOf('const NOMI:'));
const tempoDi = vm.runInNewContext(stripTypeScriptTypes(funzione.replace('export ', '')) + '\ntempoDi', {
  durataTesto: (s) => `${Math.round(s)} s`, Date,
});
const base = { stato: 'lavoro', durata: 12, finitaAlle: new Date(2026, 9, 24, 13, 45).getTime(), stima: { trascorso: () => 8, restante: () => 20 } };
test('Attività in corso conserva tempo trascorso e stima', () => {
  assert.match(tempoDi(base), /passati 8 s/i);
  assert.match(tempoDi(base), /mancano circa 20 s/i);
});
test('Attività finita conserva durata e ora assoluta, senza tempo relativo', () => {
  const testo = tempoDi({ ...base, stato: 'finita', esito: 'Salvato' });
  assert.match(testo, /Salvato/);
  assert.match(testo, /ci ha messo 12 s/);
  assert.match(testo, /13[:.]45/);
  assert.doesNotMatch(testo, / fa\b/);
});
