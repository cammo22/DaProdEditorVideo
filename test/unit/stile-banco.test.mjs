// Il sistema «Banco» (grafica): suggerimenti al passaggio e regole dei fogli di stile. Niente browser: la posizione della
// targhetta è una funzione pura e i fogli CSS si leggono come testo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carica } from './_aiuti.mjs';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = (nome) => readFileSync(path.join(radice, 'src/stile', nome), 'utf8').replace(/\r\n/g, '\n');
const S = await carica('suggerimento');

const vista = { w: 1280, h: 720 };

test('suggerimento: sotto l\'elemento, centrato', () => {
  const p = S.posizioneSuggerimento({ left: 600, top: 100, width: 40, height: 30 }, { w: 100, h: 28 }, vista);
  assert.equal(p.sopra, false);
  assert.equal(p.x, 570);
  assert.equal(p.y, 138);
});

test('suggerimento: non esce dai bordi a sinistra e a destra', () => {
  const sx = S.posizioneSuggerimento({ left: 0, top: 50, width: 20, height: 20 }, { w: 200, h: 28 }, vista);
  assert.equal(sx.x, 6);
  const dx = S.posizioneSuggerimento({ left: 1270, top: 50, width: 10, height: 20 }, { w: 200, h: 28 }, vista);
  assert.equal(dx.x, 1280 - 200 - 6);
});

test('suggerimento: in fondo allo schermo va sopra l\'elemento', () => {
  const p = S.posizioneSuggerimento({ left: 400, top: 690, width: 60, height: 22 }, { w: 120, h: 30 }, vista);
  assert.equal(p.sopra, true);
  assert.ok(p.y + 30 <= 690, 'sta sopra');
  assert.ok(p.y >= 6);
});

test('suggerimento: se non ci sta né sotto né sopra resta dentro lo schermo', () => {
  const p = S.posizioneSuggerimento({ left: 10, top: 20, width: 30, height: 200 }, { w: 80, h: 60 }, { w: 300, h: 230 });
  assert.ok(p.y >= 6 && p.y + 60 <= 230 - 6, `y=${p.y}`);
});

test('stile: il magenta non è più un colore dell\'interfaccia', () => {
  const ed = css('editor.css');
  const radiceBlocco = ed.slice(ed.indexOf(':root {'), ed.indexOf('}', ed.indexOf(':root {')));
  assert.match(radiceBlocco, /--mag:\s*#35e8ff/i, '--mag vale ciano (resta solo il nome)');
  assert.match(radiceBlocco, /--clip-mag:\s*#ff3df2/i, 'il magenta delle clip ha il suo nome');
  for (const f of ['guscio.css', 'banco.css']) {
    const t = css(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(t, /#ff3df2|255,\s*61,\s*242|#c41bb9|#b0169f|#8a0f7c|var\(--mag\)/i, `${f} senza magenta`);
  }
  // la barra del titolo non è più bianca
  const bt = ed.slice(ed.indexOf('.barra-titolo {'), ed.indexOf('.barra-titolo {') + 400);
  assert.doesNotMatch(bt, /background:\s*#ffffff/i);
});

test('stile: le variabili del Banco ci sono e hanno i valori del sistema', () => {
  const ed = css('editor.css');
  for (const [nome, valore] of [['--fondo', '#0b0a0f'], ['--pann', '#15141b'], ['--vetrino', '#050407'], ['--etichetta', '#8d889c'],
    ['--oro', '#ffd54a'], ['--cia', '#35e8ff'], ['--rosso', '#ff4d6d'], ['--verde', '#5dffb4']]) {
    assert.match(ed, new RegExp(nome + ": *" + valore, "i"), `${nome} = ${valore}`);
  }
  assert.match(ed, /--metallo-tasto:[^;]*#2c2b34[^;]*#1d1c23/i);
  assert.match(ed, /--comando-alto:\s*44px/);
  assert.match(ed, /--comando-denso:\s*34px/);
});

test('stile: banco.css non ridefinisce le variabili e vale dopo gli altri fogli', () => {
  const b = css('banco.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(b, /:root\s*\{/, 'le variabili stanno in editor.css');
  const main = readFileSync(path.join(radice, 'src/main.ts'), 'utf8');
  assert.ok(main.indexOf("stile/banco.css") > main.indexOf("stile/guscio.css"), 'banco.css dopo guscio.css');
  assert.match(main, /attivaSuggerimenti\(\)/);
});

test('stile: i comandi principali sono alti almeno 44 px, le barre dense 34', () => {
  const b = css('banco.css');
  assert.match(b, /\.btn \{\s*min-height: var\(--comando-alto\)/);
  assert.match(b, /\.tasto-num \{[^}]*height: 48px/);
  assert.match(b, /\.tasto-trasporto \{[^}]*height: var\(--comando-denso\)/);
});

test('stile: un solo oro per schermata, la selezione è ciano', () => {
  const b = css('banco.css');
  for (const sel of ['.pagina-btn.attiva', '.carta.scelta', '.tl-scheda.attiva', '.tt-nome.accesa', '.chip.acceso']) {
    const i = b.indexOf(sel);
    assert.ok(i >= 0, sel);
    const regola = b.slice(i, b.indexOf('}', i));
    assert.match(regola, /cia|53, 232, 255/i, `${sel} usa il ciano`);
    assert.doesNotMatch(regola, /var\(--oro\)|#ffc21a/i, `${sel} non usa l'oro`);
  }
  assert.match(b, /\.btn\.primario \{[^}]*var\(--oro\)/, 'l\'oro è il pulsante principale');
});
