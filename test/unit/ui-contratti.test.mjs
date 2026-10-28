// Contratti di collegamento del DOM (non prove visuali o di interazione).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
test('Finale prepara misure esplicite, espone navigazione e stato export', () => {
  const s = src('ui/finale.ts');
  assert.ok(s.includes('const path = await salvaMediaSulDisco(nome, blob);\n      if (ctrl.signal.aborted || progetto !== progettoAttuale())'), 'controllo dopo scrittura prima di importare nel progetto');
  for (const nome of ['await preparaOra(', 'senzaColoreMisurato(', 'fin-vai']) assert.ok(s.includes(nome), nome);
});
test('Effetti legge i parametri dal catalogo e consente intensità zero', () => {
  const s = src('ui/ispettore.ts');
  assert.ok(s.includes('parametroFx('));
  assert.ok(s.includes("this.cursore('Forza', 0,"));
});
test('Montage ha attività annullabile e checkpoint prima di pubblicare', () => {
  const s = src('ui/montage.ts');
  for (const nom of ['inCoda(', 'await job.checkpoint()', 'job.valido', 'mt-etapes']) assert.ok(s.includes(nom), nom);
});
test('AI usa un consenso condiviso prima dei servizi e senza preload implicito', () => {
  for (const f of ['audioAI', 'finale', 'sfondo', 'sottotitoliRapidi']) assert.ok(src('ui/' + f + '.ts').includes('await confermaAvvioAI('), f);
  assert.ok(!src('ui/sfondo.ts').includes('void scaldaRitaglio('));
});
test('Sfondo protegge consenso delle prove e risultati dopo cambio progetto', () => {
  const s = src('ui/sfondo.ts');
  assert.match(s, /async function provaOggetto[\s\S]*?await autorizzaProva\(id\)/);
  assert.ok(s.includes('progetto !== progettoAttuale()'));
  assert.ok(s.includes('ferma: () => lav.ferma || progetto !== progettoAttuale()'));
});
test('Montage controlla annullamento e pausa prima del brano', () => {
  const s = src('ui/montage.ts');
  assert.match(s, /catch \(e\) \{ if \(!job.valido\) throw e;/);
  assert.match(s, /await job.checkpoint\(\);\s*if \(!job.valido\) throw new Error\('fermato'\);\s*\/\/.*musica/);
});
test('Finale ha un solo pulsante Esporta master e lo mantiene nel footer', () => {
  const s = src('ui/finale.ts');
  assert.equal((s.match(/click: \(\) => finestraEsporta/g) ?? []).length, 1);
});
test('LIVE espone fase autorevole e sezioni sorgenti audio registrazioni', () => {
  const s = src('ui/live.ts');
  for (const nome of ['live-fase-certa', 'live-fonti-stato', 'live-configurazione', 'live-archivio']) assert.ok(s.includes(nome), nome);
});
test('Attività conserva Sovraccarica e permette scartare le proposte in batch', () => {
  const s = src('ui/attivita.ts');
  assert.ok(s.includes('sovraccarica(!inSovraccarico())'));
  assert.ok(s.includes('scartaDaAvviare()'));
});
test('Attività espone manuali, preparazioni, capacità e retry del motore', () => {
  const s = src('ui/attivita.ts');
  for (const nome of ['attivitaDaAvviare()', 'proponiPreparazioni(', 'azioniAttivita(', 'avviaRiga(', 'pausaRiga(', 'riprendiRiga(', 'riprovaRiga(', 'pausaLavori(', 'daPreparare(']) assert.ok(s.includes(nome), nome);
  // il popup sta in basso a destra sopra la barra di stato (dalla 1.6.0), non dentro la libreria
  assert.ok(s.includes('document.body.appendChild(this.pannello)'));
});
