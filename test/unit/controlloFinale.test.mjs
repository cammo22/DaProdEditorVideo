// Il controllo prima dell'uscita: le cinque spie (originali, spazio, font, sottotitoli, AI) e il registro delle funzioni AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';

const C = await carica('controlloFinale');
const F = await carica('funzioniAI');
const R25 = { num: 25, den: 1 };

test('file originali: verde se ci sono tutti, rossa se uno non si trova, ambra se si stanno aprendo', () => {
  assert.equal(C.controlloOriginali([{ id: 'a', nome: 'a.mp4', stato: 'ok' }, { id: 'b', nome: 'b.mp4', stato: 'ok' }]).luce, 'verde');
  const perso = C.controlloOriginali([{ id: 'a', nome: 'a.mp4', stato: 'ok' }, { id: 'b', nome: 'b.mp4', stato: 'offline' }]);
  assert.equal(perso.luce, 'rossa');
  assert.match(perso.dettaglio, /1 file non si trova/);
  assert.match(perso.aiuto, /b\.mp4/);
  assert.equal(C.controlloOriginali([{ id: 'a', nome: 'a.mp4', stato: 'caricamento' }]).luce, 'ambra');
  assert.equal(C.controlloOriginali([]).luce, 'ambra');
});

test('mediaInTimeline conta un file una volta sola e vede quelli che non stanno nel contenitore', () => {
  const p = { media: [{ id: 'm1', name: 'uno.mp4' }], clips: [{ kind: 'media', media: 'm1', name: 'x' }, { kind: 'media', media: 'm1', name: 'x' }, { kind: 'media', media: 'm2', name: 'due' }, { kind: 'title' }] };
  const u = C.mediaInTimeline(p);
  assert.deepEqual(u.map((m) => [m.id, m.stato]), [['m1', 'ok'], ['m2', 'assente']]);
});

test('spazio: rossa se il file non ci sta, ambra se ci sta di poco, verde se c\'è largo', () => {
  assert.equal(C.controlloSpazio(100e6, 400e6).luce, 'rossa');
  assert.equal(C.controlloSpazio(3e9, 1e9).luce, 'ambra');
  const largo = C.controlloSpazio(212e9, 410e6);
  assert.equal(largo.luce, 'verde');
  assert.match(largo.dettaglio, /212 GB liberi/);
  assert.equal(C.controlloSpazio(null, 1e9).luce, 'ambra');
});

test('font: quelli dei titoli e delle animazioni, e la spia rossa se uno manca', () => {
  const p = { clips: [
    { kind: 'title', gen: { title: { font: 'Montserrat' } } },
    { kind: 'title', gen: { title: { font: 'Bebas Neue' }, anim: { id: 'x', v: { font: 'playfair' } } } },
    { kind: 'media' },
  ] };
  assert.deepEqual(C.fontUsati(p).sort(), ['Montserrat', 'Playfair Display']);
  const ok = C.controlloFont(['Montserrat'], new Map([['Montserrat', true]]));
  assert.equal(ok.luce, 'verde');
  const no = C.controlloFont(['Montserrat', 'Zorro'], new Map([['Montserrat', true], ['Zorro', false]]));
  assert.equal(no.luce, 'rossa');
  assert.match(no.dettaglio, /manca Zorro/);
  assert.equal(C.controlloFont([], new Map()).luce, 'verde');
  assert.equal(C.controlloFont(['Montserrat'], new Map()).luce, 'ambra', 'ancora non controllato');
});

test('sottotitoli: righe troppo larghe, con troppi a capo o troppo veloci', () => {
  const lunga = 'a'.repeat(50);
  const s = { righe: [
    { id: 'r1', da: 0, a: 100, testo: 'Ciao a tutti' },
    { id: 'r2', da: 100, a: 200, testo: lunga },
    { id: 'r3', da: 200, a: 300, testo: 'uno\ndue\ntre' },
    { id: 'r4', da: 300, a: 310, testo: 'frase corta ma veloce' },
    { id: 'r5', da: 400, a: 500, testo: '   ' },
  ] };
  const prob = C.righeTroppoLunghe(s, R25);
  assert.deepEqual(prob.map((x) => [x.id, x.motivo]), [['r2', 'lunga'], ['r3', 'tante'], ['r4', 'veloce']]);
  const c = C.controlloSottotitoli(s, R25);
  assert.equal(c.luce, 'ambra');
  assert.match(c.dettaglio, /2 righe troppo lunghe/);
  assert.match(c.dettaglio, /1 va troppo in fretta/);
  assert.equal(C.controlloSottotitoli({ righe: [s.righe[0]] }, R25).luce, 'verde');
  assert.equal(C.controlloSottotitoli(undefined, R25).dettaglio, 'nessuno');
});

test('AI: rossa se manca il risultato, ambra se è opzionale/sperimentale o c\'è lavoro in corso, verde se pronta', () => {
  const p = { clips: [
    { id: 'a', ritaglio: { firma: 'f1' } },
    { id: 'b', ritaglio: { firma: 'f2' } },
    { id: 'c', segue: 'a' },
  ] };
  const usi = C.usiAI(p, (firma) => (firma === 'f1' ? {} : undefined));
  assert.deepEqual(usi.map((u) => [u.nome, u.clip, u.senzaRisultato]), [['Togli sfondo', 2, 1], ['Segui l\'oggetto', 1, 1]]);
  const rossa = C.controlloAI(usi, [], 0);
  assert.equal(rossa.luce, 'rossa');
  assert.match(rossa.aiuto, /1 su 2/);

  const pronto = C.usiAI(p, () => ({})).map((u) => ({ ...u, senzaRisultato: 0 }));
  assert.equal(C.controlloAI(pronto, [], 0).luce, 'verde');
  assert.equal(C.controlloAI(pronto, [], 2).luce, 'ambra');
  const registro = [{ id: 'sfondo-sam3', nome: 'Togli sfondo', descrizione: '', stato: 'opzionale', peso: '1,2 GB', vram: '3 GB', dove: 'clip', motore: 'locale' }];
  const opz = C.controlloAI(pronto, registro, 0);
  assert.equal(opz.luce, 'ambra');
  assert.match(opz.dettaglio, /opzionale/);
  assert.match(opz.aiuto, /1,2 GB/);
  assert.equal(C.controlloAI([], [], 0).dettaglio, 'nessuno usato');
});

test('luceMaggiore prende la peggiore', () => {
  assert.equal(C.luceMaggiore(['verde', 'ambra']), 'ambra');
  assert.equal(C.luceMaggiore(['verde', 'rossa', 'ambra']), 'rossa');
  assert.equal(C.luceMaggiore([]), 'verde');
});

test('il registro delle funzioni AI: funzioniPer filtra per dove si usano', () => {
  assert.ok(Array.isArray(F.FUNZIONI_AI));
  F.FUNZIONI_AI.push({ id: 'prova-1', nome: 'Prova', descrizione: '', stato: 'pronta', dove: 'finale', motore: 'browser' });
  F.FUNZIONI_AI.push({ id: 'prova-2', nome: 'Altra', descrizione: '', stato: 'sperimentale', dove: 'clip', motore: 'locale' });
  try {
    assert.deepEqual(F.funzioniPer('finale').map((f) => f.id), ['prova-1']);
    assert.deepEqual(F.funzioniPer('clip').map((f) => f.id), ['prova-2']);
    assert.deepEqual(F.funzioniPer('audio'), []);
  } finally { F.FUNZIONI_AI.length = 0; }
});

test('controllaUscita dà le cinque spie nell\'ordine del Finale', () => {
  const l = C.controllaUscita({
    usati: [{ id: 'a', nome: 'a.mp4', stato: 'ok' }], libero: 212e9, serve: 410e6, fontUsati: [], fontDisponibili: new Map(),
    sottotitoli: undefined, rate: R25, usiAI: [], registro: [], lavoriAI: 0,
  });
  assert.deepEqual(l.map((x) => x.id), ['originali', 'spazio', 'font', 'sottotitoli', 'ai']);
  assert.ok(l.every((x) => x.luce === 'verde'));
});
