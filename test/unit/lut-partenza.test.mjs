// Le LUT di partenza (src/assets/lut/*.cube) nascono da scripts/genera-lut.mjs: devono essere valide per il parser,
// uguali a quello che lo script scrive adesso e fare quello che promette il nome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carica } from './_aiuti.mjs';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await carica('lut');
const { LUT, testoCube, PUNTI } = await import(pathToFileURL(path.join(radice, 'scripts/genera-lut.mjs')).href);
const cartella = path.join(radice, 'src/assets/lut');
const leggi = (f) => readFileSync(path.join(cartella, f + '.cube'), 'utf8');
const lut = (f) => L.parseCube(leggi(f), f);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('LUT di partenza: i file sono quelli dello script, senza altri', () => {
  assert.deepEqual(readdirSync(cartella).filter((f) => f.endsWith('.cube')).sort(), LUT.map((l) => l.file + '.cube').sort());
  for (const l of LUT) assert.equal(leggi(l.file).replace(/\r\n/g, '\n'), testoCube(l), `${l.file}: rigenera con node scripts/genera-lut.mjs`);
});

test('LUT di partenza: il parser le accetta, 3D, dominio 0..1, tutti i valori nel campo', () => {
  for (const l of LUT) {
    const r = lut(l.file);
    assert.equal(r.n, PUNTI);
    assert.equal(r.nome, l.nome);
    assert.deepEqual(r.domainMin, [0, 0, 0]); assert.deepEqual(r.domainMax, [1, 1, 1]);
    assert.equal(r.dati.length, PUNTI ** 3 * 3);
    assert.ok(r.dati.every((v) => v >= 0 && v <= 1), l.file);
    assert.ok(L.validaLut({ ...r, id: 'x', hash: 'x' }));
    assert.match(leggi(l.file), /licenza MIT/);
  }
});

test('LUT di partenza: i grigi restano in ordine (niente inversioni) e il nero resta scuro', () => {
  for (const l of LUT) {
    const r = lut(l.file);
    let prima = -1;
    for (let i = 0; i <= 20; i++) { const y = luma(L.campionaLut(r, [i / 20, i / 20, i / 20])); assert.ok(y >= prima - 1e-6, `${l.file} @${i}`); prima = y; }
    assert.ok(luma(L.campionaLut(r, [0, 0, 0])) < 0.1, l.file);
    assert.ok(luma(L.campionaLut(r, [1, 1, 1])) > 0.85, l.file);
  }
});

test('LUT di partenza: fanno quello che dice il nome', () => {
  const grigio = [0.5, 0.5, 0.5];
  const caldo = L.campionaLut(lut('caldo'), grigio), freddo = L.campionaLut(lut('freddo'), grigio);
  assert.ok(caldo[0] > caldo[2] + 0.04, 'caldo: più rosso che blu');
  assert.ok(freddo[2] > freddo[0] + 0.04, 'freddo: più blu che rosso');
  const bn = lut('bianco-e-nero-ricco');
  for (const c of [[0.9, 0.2, 0.1], [0.1, 0.4, 0.9], [0.3, 0.8, 0.3]]) { const o = L.campionaLut(bn, c); assert.ok(Math.abs(o[0] - o[1]) < 1e-6 && Math.abs(o[1] - o[2]) < 1e-6); }
  const rosso = L.campionaLut(bn, [0.9, 0.1, 0.1])[0], blu = L.campionaLut(bn, [0.1, 0.1, 0.9])[0];
  assert.ok(rosso > blu + 0.15, 'il rosso esce più chiaro del blu');
  const mid = L.campionaLut(bn, [0.2, 0.2, 0.2])[0], alto = L.campionaLut(bn, [0.8, 0.8, 0.8])[0];
  assert.ok(mid < 0.15 && alto > 0.85, 'contrasto pieno');
  const teal = lut('teal-e-orange');
  const ombra = L.campionaLut(teal, [0.15, 0.15, 0.15]), pelle = L.campionaLut(teal, [0.85, 0.6, 0.5]);
  assert.ok(ombra[2] > ombra[0], 'ombre verso il teal');
  assert.ok(pelle[0] > pelle[2] + 0.2, 'la pelle resta calda');
  const nero = L.campionaLut(lut('pellicola-anni-70'), [0, 0, 0]);
  assert.ok(nero.every((v) => v > 0.03), 'neri alzati');
});

test('LUT di partenza: lutDaTesto dà id e hash sul contenuto, uguali per lo stesso testo', async () => {
  const a = await L.lutDaTesto(leggi('caldo'), 'Caldo'), b = await L.lutDaTesto(leggi('caldo'), 'Altro nome');
  assert.equal(a.id, b.id); assert.equal(a.id, 'lut-' + a.hash);
  const f = await L.lutDaTesto(leggi('freddo'), 'Freddo');
  assert.notEqual(a.id, f.id);
});
