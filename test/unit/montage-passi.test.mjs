// DaProdMontage a «tre passi grandi»: i passi della barra, i ritocchi veloci, il perché una foto è scartata, le frasi,
// e le due aggiunte al motore (lentezza e file rimessi a mano). Niente browser: i moduli puri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';

const P = await carica('montagePassi');
const M = await carica('montage');
const R = await carica('montagePreset');

const foto = (nome, punteggio = 0.5, firma, data = 0) => ({ media: nome, nome, tipo: 'image', durata: 0, w: 1600, h: 1200, data, audio: false, punteggio, firma });
const firma = (c) => c.repeat(16);
const base = { preset: 'compleanno', durata: 60, ordine: 'dato', titoli: false, effetti: false, audioVideo: -14, testi: { titolo: '', sottotitolo: '', nomi: '', data: '' }, seme: 7, scarta: true };

test('I quattro passi sono nell\'ordine della barra e hanno ognuno il suo stato', () => {
  assert.deepEqual(P.PASSI.map((p) => p.id), ['file', 'stile', 'durata', 'anteprima']);
  assert.deepEqual(P.PASSI.map((p) => p.nome), ['Foto e video', 'Stile', 'Durata e musica', 'Anteprima']);
  assert.deepEqual([0, 1, 2, 3].map((i) => P.statoPasso(i, 2)), ['fatto', 'fatto', 'attuale', 'futuro']);
  assert.deepEqual([0, 1, 2, 3].map((i) => P.statoPasso(i, 0)), ['attuale', 'futuro', 'futuro', 'futuro']);
});

test('L\'anteprima serve almeno un file, gli altri passi si visitano sempre', () => {
  assert.equal(P.puoiAndare(3, 0), false);
  assert.equal(P.puoiAndare(3, 1), true);
  for (const i of [0, 1, 2]) assert.equal(P.puoiAndare(i, 0), true);
  assert.equal(P.passoDopo(3), 3);
  assert.equal(P.passoPrima(0), 0);
  assert.equal(P.passoDopo(1), 2);
});

test('Le durate si dicono a parole', () => {
  assert.equal(P.durataParlata(45), '45 s');
  assert.equal(P.durataParlata(120), '2 min');
  assert.equal(P.durataParlata(90), '1 min 30 s');
});

test('«Più corto» toglie un quarto a numeri tondi e non scende sotto i 10 secondi', () => {
  assert.equal(P.durataPiuCorta(120), 90);
  assert.equal(P.durataPiuCorta(60), 45);
  assert.equal(P.durataPiuCorta(600), 450);
  assert.equal(P.durataPiuCorta(12), 10);
  assert.equal(P.durataPiuCorta(10), 10);
  for (const d of [11, 25, 30, 61, 95, 180, 3600]) assert.ok(P.durataPiuCorta(d) < d, String(d));
});

test('I ritocchi cambiano solo quello che dicono, e dicono se non c\'è niente da cambiare', () => {
  const s = { durata: 120, lentezza: 0, titoli: true, musica: 'b1' };
  const corto = P.ritocca(s, 'piuCorto', ['b1', 'b2']);
  assert.deepEqual(corto.scelte, { ...s, durata: 90 });
  assert.ok(corto.cambia);
  const lento = P.ritocca(s, 'piuLento', []);
  assert.equal(lento.scelte.lentezza, 1);
  assert.deepEqual({ ...lento.scelte, lentezza: 0 }, s);
  const titoli = P.ritocca(s, 'titoli', []);
  assert.equal(titoli.scelte.titoli, false);
  assert.equal(P.ritocca(titoli.scelte, 'titoli', []).scelte.titoli, true, 'togli e rimetti');
  const musica = P.ritocca(s, 'musica', ['b1', 'b2']);
  assert.equal(musica.scelte.musica, 'b2');
  assert.equal(P.ritocca(musica.scelte, 'musica', ['b1', 'b2']).scelte.musica, 'b1', 'l\'ultimo brano torna al primo');
});

test('I ritocchi si fermano ai limiti senza rigenerare per niente', () => {
  const alMassimo = { durata: 10, lentezza: P.LENTEZZA_MAX, titoli: true, musica: '' };
  for (const r of ['piuCorto', 'piuLento']) {
    const e = P.ritocca(alMassimo, r, []);
    assert.equal(e.cambia, false, r);
    assert.deepEqual(e.scelte, alMassimo);
  }
  assert.equal(P.ritocca(alMassimo, 'musica', []).cambia, false, 'senza brani non cambia (la pagina propone di aggiungerne uno)');
  assert.equal(P.ritocca({ ...alMassimo, musica: 'solo' }, 'musica', ['solo']).cambia, false, 'con un brano solo non c\'è un\'altra musica');
  assert.equal(P.musicaSeguente('', ['x', 'y']), 'x');
  assert.equal(P.musicaSeguente('qualunque', ['x', 'y']), 'x', 'un brano che non c\'è più riparte dal primo');
});

test('I bottoni dei ritocchi cambiano nome quando serve', () => {
  assert.equal(P.nomeRitocco('titoli', { titoli: true, lentezza: 0 }, 0), 'Togli i titoli');
  assert.equal(P.nomeRitocco('titoli', { titoli: false, lentezza: 0 }, 0), 'Rimetti i titoli');
  assert.equal(P.nomeRitocco('piuLento', { titoli: true, lentezza: 2 }, 0), 'Più lento (2 su 3)');
  assert.equal(P.nomeRitocco('musica', { titoli: true, lentezza: 0 }, 2), 'Cambia la musica');
  assert.equal(P.nomeRitocco('musica', { titoli: true, lentezza: 0 }, 0), 'Aggiungi la musica');
  assert.equal(P.nomeRitocco('piuCorto', { titoli: true, lentezza: 0 }, 0), 'Più corto');
});

test('Il perché di una scartata: doppia, mossa o in più', () => {
  const entrate = [foto('a', 0.8, firma('1')), foto('b', 0.6, firma('1')), foto('c', 0.2, firma('5')), foto('d', 0.7, firma('9')), foto('e', 0.9, firma('d'))];
  const usati = new Set(['a', 'e']);
  const m = P.motiviScarto(entrate, usati, { ordine: 'dato', seme: 1, scarta: true });
  assert.equal(m.get('b'), 'doppia', 'quasi uguale ad a, che è più nitida');
  assert.equal(m.get('c'), 'mossa');
  assert.equal(m.get('d'), 'fuori');
  assert.equal(m.has('a'), false);
  assert.equal(m.has('e'), false);
  // senza «scarta mosse e doppie» una doppia è solo una foto per cui non c'era posto
  const senza = P.motiviScarto(entrate, usati, { ordine: 'dato', seme: 1, scarta: false });
  assert.equal(senza.get('b'), 'fuori');
  // una rimessa a mano non è più una scartata
  const rimessa = P.motiviScarto(entrate, usati, { ordine: 'dato', seme: 1, scarta: true, tieni: ['c'] });
  assert.equal(rimessa.has('c'), false);
  assert.deepEqual(Object.keys(P.ETICHETTA_SCARTO).sort(), ['doppia', 'fuori', 'mossa']);
});

test('I motivi dello scarto coincidono con quelli che usa davvero il motore', () => {
  const entrate = Array.from({ length: 30 }, (_, i) => foto('f' + i, 0.3 + (i % 7) * 0.1, i % 5 === 0 ? firma('3') : firma((i % 13).toString(16)), i));
  const o = { ...base, durata: 40, ordine: 'data' };
  const piano = M.pianifica(entrate, o);
  const usati = new Set(piano.voci.map((v) => v.entrata.media));
  const m = P.motiviScarto(entrate, usati, o);
  const fuori = entrate.filter((e) => !usati.has(e.media));
  assert.equal(m.size, fuori.length, 'ogni scartata ha il suo motivo');
  assert.ok(m.size > 0, 'qualcosa è stato scartato');
});

test('Il motore tiene le foto rimesse a mano e non le scarta più', () => {
  // 40 foto in 40 secondi: per forza qualcuna resta fuori
  const entrate = Array.from({ length: 40 }, (_, i) => foto('g' + i, i === 20 ? 0.01 : 0.6 + (i % 5) * 0.05, firma((i % 15).toString(16)), i));
  const o = { ...base, durata: 40, ordine: 'data' };
  const prima = M.pianifica(entrate, o);
  assert.ok(!prima.voci.some((v) => v.entrata.media === 'g20'), 'la peggiore sta fuori');
  const dopo = M.pianifica(entrate, { ...o, tieni: ['g20'] });
  assert.ok(dopo.voci.some((v) => v.entrata.media === 'g20'), 'rimessa a mano: c\'è');
  assert.ok(Math.abs(dopo.voci.reduce((a, v) => a + v.len, 0) - 40) < 1e-6, 'il tempo chiesto resta quello');
  // una doppia rimessa non viene più tolta come doppia
  const doppie = [foto('x', 0.9, firma('2'), 1), foto('y', 0.5, firma('2'), 2), foto('z', 0.8, firma('a'), 3)];
  const senzaY = M.pianifica(doppie, { ...base, durata: 20, ordine: 'data' });
  assert.ok(!senzaY.voci.some((v) => v.entrata.media === 'y'));
  const conY = M.pianifica(doppie, { ...base, durata: 20, ordine: 'data', tieni: ['y'] });
  assert.ok(conY.voci.some((v) => v.entrata.media === 'y'));
});

test('La lentezza: zero è identico a prima, di più è meno cose per più tempo', () => {
  const entrate = Array.from({ length: 30 }, (_, i) => foto('h' + i, 0.4 + (i % 6) * 0.08, firma((i % 16).toString(16)), i));
  const o = { ...base, durata: 90, ordine: 'data' };
  const a = M.pianifica(entrate, o);
  assert.equal(JSON.stringify(M.pianifica(entrate, { ...o, lentezza: 0 })), JSON.stringify(a), 'zero = come prima');
  const medie = [0, 1, 2, 3].map((l) => {
    const p = M.pianifica(entrate, { ...o, lentezza: l });
    const somma = p.voci.reduce((x, v) => x + v.len, 0);
    return { n: p.voci.length, perFoto: somma / p.voci.length, somma };
  });
  for (const m of medie) assert.ok(Math.abs(m.somma - 90) < 1e-6, 'il tempo chiesto resta sempre quello');
  assert.ok(medie[3].perFoto > medie[0].perFoto * 1.15, `ogni foto resta più a lungo: ${medie.map((m) => m.perFoto.toFixed(2)).join(' → ')}`);
  assert.ok(medie[3].n < medie[0].n, `e sono meno: ${medie.map((m) => m.n).join(' → ')}`);
  for (let i = 1; i < 4; i++) assert.ok(medie[i].perFoto >= medie[i - 1].perFoto - 1e-9, 'sempre più lento');
  const pr = R.presetMontage('compleanno');
  const l0 = M.limiti(entrate[0], pr), l2 = M.limiti(entrate[0], pr, 2);
  assert.deepEqual(l0, { min: pr.foto[0], tip: pr.foto[1], max: pr.foto[2] }, 'senza lentezza i limiti sono quelli dello stile');
  assert.ok(l2.min > l0.min && l2.tip > l0.tip && l2.max >= l0.max);
});

test('I battiti al minuto si ricavano dai battiti; con troppo pochi non si inventano', () => {
  const bat = Array.from({ length: 20 }, (_, i) => i * 0.5);
  assert.equal(P.bpmDaBattiti(bat), 120);
  assert.equal(P.bpmDaBattiti([0, 0.6, 1.2]), undefined);
  assert.equal(P.bpmDaBattiti(undefined), undefined);
  assert.equal(P.bpmDaBattiti(Array.from({ length: 10 }, (_, i) => i * 0.3)), 200);
  assert.equal(P.bpmDaBattiti(Array.from({ length: 10 }, (_, i) => i * 4)), undefined, 'sotto i 40 al minuto non è un ritmo');
});

test('La frase dell\'anteprima dice stile, file, durata e musica', () => {
  assert.equal(P.riassunto({ stile: 'Viaggio', nFoto: 64, nVideo: 9, durata: 120, musica: { nome: 'Strada aperta', sulBattito: true } }), 'Viaggio · 64 foto e 9 video · 2 min · tagli sui battiti di «Strada aperta»');
  assert.equal(P.riassunto({ stile: 'Natale', nFoto: 12, nVideo: 0, durata: 45 }), 'Natale · 12 foto · 45 s · senza musica');
  assert.equal(P.riassunto({ stile: 'Sport', nFoto: 3, nVideo: 1, durata: 30, musica: { nome: 'Corsa', sulBattito: false } }), 'Sport · 3 foto e 1 video · 30 s · musica «Corsa»');
  assert.match(P.riassunto({ stile: 'Sport', nFoto: 3, nVideo: 0, durata: 30, musica: { nome: 'Corsa', sulBattito: true, bpm: 128 } }), /\(128 al minuto\)/);
});

test('Gli stili: tutti nel filtro «tutte», e ogni categoria ne ha almeno uno', () => {
  const tutti = R.PRESET_MONTAGE;
  assert.ok(tutti.length >= 22);
  assert.equal(P.stiliPerCategoria(tutti, 'tutte').length, tutti.length);
  const n = P.conteggiCategorie(tutti);
  assert.equal(n.tutte, tutti.length);
  let somma = 0;
  for (const c of R.CATEGORIE_MONTAGE) { assert.ok(n[c.id] > 0, c.id); assert.equal(P.stiliPerCategoria(tutti, c.id).length, n[c.id]); somma += n[c.id]; }
  assert.equal(somma, tutti.length, 'nessuno stile resta senza gruppo');
  assert.equal(P.stiliPerCategoria(tutti, 'non-esiste').length, 0);
  const p = tutti[0];
  assert.ok(P.fondoStile(p).includes(p.sfondo[0]) && P.fondoStile(p).includes(p.sfondo[1]));
  assert.ok(['lento', 'medio', 'veloce'].every((r) => P.RITMO_PAROLE[r]));
});
