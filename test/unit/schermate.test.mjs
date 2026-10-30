// Le schermate nel sistema Banco: la logica delle schede AI (etichette, peso e VRAM, tasti del motore), il registro
// delle funzioni AI e due guardie sui file: niente magenta nell'interfaccia e un solo pulsante oro per schermata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carica } from './_aiuti.mjs';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leggi = (f) => readFileSync(path.join(radice, f), 'utf8');
const S = await carica('schedaAI');
const R = await carica('funzioniAI');

test('Le tre etichette si leggono sul banco e hanno ognuna la sua spia', () => {
  assert.equal(S.etichettaStato('pronta'), 'PRONTA');
  assert.equal(S.etichettaStato('opzionale'), 'OPZIONALE');
  assert.equal(S.etichettaStato('sperimentale'), 'SPERIMENTALE');
  assert.deepEqual([S.SPIA_STATO.pronta, S.SPIA_STATO.opzionale, S.SPIA_STATO.sperimentale], ['verde', 'ciano', 'oro']);
  assert.equal(S.etichettaStato('boh'), 'OPZIONALE', 'uno stato strano non rompe la scheda');
});

test('Peso e VRAM sono sempre scritti: se non si sa lo dice, senza inventare numeri', () => {
  assert.equal(S.pesoEVram({ peso: '78 MB', vram: '2 GB' }).riga, 'PESO 78 MB · VRAM 2 GB');
  const vuoto = S.pesoEVram({});
  assert.equal(vuoto.peso, 'da misurare');
  assert.equal(vuoto.vram, 'da misurare');
  assert.equal(S.pesoEVram({ peso: '  ', vram: 'non misurabile' }).riga, 'PESO da misurare · VRAM non misurabile');
  assert.equal(S.pesoDaMb(78), '78 MB');
  assert.equal(S.pesoDaMb(2560), '2,5 GB');
  assert.equal(S.pesoDaMb(0), undefined);
  assert.equal(S.pesoDaMb(undefined), undefined);
});

test('Le funzioni si mettono in ordine: pronte, opzionali, sperimentali', () => {
  const f = (id, stato) => ({ id, nome: id, descrizione: '', stato, dove: 'clip', motore: 'browser' });
  const ord = S.ordinaPerStato([f('z', 'sperimentale'), f('b', 'opzionale'), f('a', 'opzionale'), f('p', 'pronta')]);
  assert.deepEqual(ord.map((x) => x.id), ['p', 'a', 'b', 'z']);
});

test('I tasti del motore locale seguono lo stato e si bloccano mentre un lavoro gira', () => {
  assert.deepEqual(S.azioniPossibili('non-installato'), { installa: true, accendi: false, spegni: false, disinstalla: true, scarica: false });
  assert.deepEqual(S.azioniPossibili('pronto'), { installa: false, accendi: true, spegni: false, disinstalla: true, scarica: true });
  assert.deepEqual(S.azioniPossibili('acceso'), { installa: false, accendi: false, spegni: true, disinstalla: true, scarica: true });
  assert.equal(S.azioniPossibili('errore').installa, true);
  assert.equal(S.azioniPossibili('errore').accendi, true);
  assert.equal(S.azioniPossibili('installazione').spegni, true);
  for (const k of Object.values(S.azioniPossibili('acceso', true))) assert.equal(k, false);
  assert.deepEqual(['acceso', 'pronto', 'errore', 'avvio', 'non-installato'].map(S.spiaMotore), ['verde', 'ciano', 'rosso', 'spenta', 'spenta']);
});

test('Un solo pulsante oro per schermata: resta il primo che lo chiede ed è visibile e attivo', () => {
  const r = S.unSoloOro([{ n: 'a', oro: true, visibile: false }, { n: 'b', oro: true }, { n: 'c', oro: true }, { n: 'd' }]);
  assert.deepEqual(r.map((x) => x.oroFinale), [false, true, false, false]);
  assert.deepEqual(S.unSoloOro([{ oro: true, attivo: false }]).map((x) => x.oroFinale), [false]);
});

test('Il registro delle funzioni AI parte vuoto e funzioniPer filtra per dove si usano', () => {
  assert.equal(R.FUNZIONI_AI.length, 0);
  assert.deepEqual(R.funzioniPer('clip'), []);
  const a = { id: 'x', nome: 'X', descrizione: '', stato: 'pronta', dove: 'clip', motore: 'browser' };
  const b = { id: 'y', nome: 'Y', descrizione: '', stato: 'opzionale', dove: 'audio', motore: 'locale', peso: '1 GB', vram: '4 GB' };
  R.FUNZIONI_AI.push(a, b);
  try {
    assert.deepEqual(R.funzioniPer('clip').map((f) => f.id), ['x']);
    assert.deepEqual(R.funzioniPer('audio').map((f) => f.id), ['y']);
    assert.deepEqual(R.funzioniPer('finale'), []);
  } finally { R.FUNZIONI_AI.length = 0; }
});

test('Niente magenta nelle schermate del Banco (resta solo nei colori delle clip)', () => {
  const magenta = /--mag\b|#ff3df2|#ff8ff8|#d42ccc|#c41bb9|#b0169f|#c01bb6|255,\s*61,\s*242|#ff2d95|#d44bd9|#ffd0fb/i;
  for (const f of ['src/stile/schermate.css', 'src/stile/home.css', 'src/stile/copieAI.css', 'src/stile/titoliHtml.css', 'src/stile/coloreAvanzato.css', 'src/stile/montaggioTesto.css', 'src/home/home.css']) {
    const m = magenta.exec(leggi(f));
    assert.equal(m, null, `${f} ha ancora il magenta: ${m?.[0]}`);
  }
});

test('Pagina iniziale e Montaggio dal testo: al massimo un pulsante oro alla volta', () => {
  const home = leggi('src/ui/home.ts');
  assert.equal((home.match(/primario/g) ?? []).length, 1, 'nella pagina iniziale solo «Nuovo progetto» è oro');
  const testo = leggi('src/ui/montaggioTesto.ts');
  assert.match(testo, /toggle\('primario', !parole\.length\)/);
  assert.match(testo, /toggle\('primario', !!parole\.length\)/);
  assert.equal((testo.match(/class: 'btn primario'/g) ?? []).length, 0, 'i due pulsanti nascono di metallo: l\'oro lo sceglie aggiorna()');
});

test('Gli stili delle schermate non toccano la finestra di esportazione (è del blocco Finale) e il puntino aggiornamenti non è magenta', () => {
  const css = leggi('src/stile/schermate.css');
  const righe = css.split('\n').filter((r) => /\.dialogo:not\(\.editor-clip\)/.test(r));
  assert.ok(righe.length > 10);
  for (const r of righe) assert.match(r, /\.dialogo:not\(\.editor-clip\):not\(\.dlg-esporta\)/, 'ogni regola sui dialoghi lascia fuori .dlg-esporta: ' + r.slice(0, 80));
  assert.match(css, /\.tasto-aggiorna \.aggiorna-punto \{ background: var\(--cia/);
});
