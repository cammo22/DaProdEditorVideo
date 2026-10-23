// Valuta solo il calcolo dei percorsi: NON importa o avvia Playwright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
test('foto: il percorso Windows con spazi non raddoppia la lettera del disco', () => {
  const s = readFileSync(new URL('../foto.mjs', import.meta.url), 'utf8');
  const calcolo = s.match(/const ROOT = (.*);/)[1].replace('import.meta.url', 'indirizzo');
  const risultato = vm.runInNewContext(calcolo, { path: path.win32, URL, fileURLToPath: u => fileURLToPath(u, { windows:true }), indirizzo:'file:///C:/Progetti%20Video/test/foto.mjs' });
  assert.equal(risultato, 'C:\\Progetti Video');
});
