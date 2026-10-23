// Il centro attività: righe da avviare, Avvia/Avvia tutti, pausa vera e ai confini, riprendi, annulla, riprova,
// doppioni, risultati tardivi dopo annulla o cambio progetto, corsie e priorità.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { carica, dormi, finche } from './_aiuti.mjs';

const AT = await carica('attivita');
beforeEach(() => { AT.azzeraAttivita(); AT.impostaLimiti({ leggero: 2, pesante: 1 }); });

test('proponi: la riga nasce «da avviare» e il lavoro NON parte finché non si preme Avvia', async () => {
  let partito = false;
  const p = AT.proponi({ corsia: 'leggero', titolo: 'Forme d\'onda', categoria: 'analisi', gruppo: 'picchi', chiave: 'picchi:a', media: 'a' }, async () => { partito = true; return 7; });
  assert.equal(p.riga.stato, 'manuale');
  assert.equal(AT.attivitaDaAvviare().length, 1);
  assert.equal(AT.attivitaInCorso().length, 0, 'le righe da avviare non sono «in corso»');
  await dormi(30);
  assert.equal(partito, false);
  const r = AT.riassunto();
  assert.equal(r.manuali, 1); assert.equal(r.righe, 0);
  assert.match(AT.riassuntoTesto(r), /1 pronto da avviare/);
  const id = AT.avviaRiga(p.riga.id);
  assert.ok(id, 'avviaRiga dà la riga dove lavora');
  assert.equal(await p.esito, 7);
  assert.equal(partito, true);
  assert.equal(AT.attivitaDaAvviare().length, 0);
  assert.equal(AT.attivitaFinite()[0].stato, 'finita');
});

test('avviaTutte rispetta il filtro, le corsie (1 pesante alla volta) e la priorità', async () => {
  const ordine = []; let insieme = 0, max = 0;
  const lavoro = (n) => async () => { ordine.push(n); insieme++; max = Math.max(max, insieme); await dormi(15); insieme--; return n; };
  const a = AT.proponi({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'proxy', priorita: 0, media: 'a' }, lavoro('basso'));
  const b = AT.proponi({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'proxy', priorita: 150, media: 'b' }, lavoro('alto'));
  const c = AT.proponi({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'proxy', priorita: 50, media: 'c' }, lavoro('medio'));
  const altro = AT.proponi({ corsia: 'leggero', titolo: 'Colore', categoria: 'analisi', gruppo: 'colore' }, lavoro('colore'));
  AT.pausaGlobale(true); // «Non avviare altro»: si accodano tutti, poi si sblocca: parte prima il più importante
  assert.equal(AT.avviaTutte({ categoria: 'proxy' }), 3);
  assert.equal(AT.attivitaDaAvviare().length, 1, 'il colore resta da avviare');
  assert.equal(AT.attivitaInCorso().length, 1, 'i tre proxy stanno in una riga di gruppo');
  assert.equal(AT.attivitaInCorso()[0].totale, 3);
  assert.equal(AT.attivitaInCorso()[0].stato, 'coda');
  AT.pausaGlobale(false);
  await Promise.all([a.esito, b.esito, c.esito]);
  assert.deepEqual(ordine, ['alto', 'medio', 'basso']);
  assert.equal(max, 1, 'la corsia pesante fa un lavoro alla volta');
  assert.equal(AT.attivitaDaAvviare()[0].id, altro.riga.id);
  AT.fermaRiga(altro.riga.id);
  assert.equal(await altro.esito, null, 'scartata una riga da avviare: esito null, il lavoro non parte');
  assert.ok(!ordine.includes('colore'));
});

test('doppioni: la stessa chiave non crea un secondo lavoro (né da avviare, né in coda, né al lavoro)', async () => {
  let volte = 0;
  const fn = async () => { volte++; await dormi(20); return 'ok'; };
  const o = { corsia: 'leggero', titolo: 'Colore', categoria: 'analisi', chiave: 'colore:m1', media: 'm1' };
  const p1 = AT.proponi(o, fn);
  const p2 = AT.proponi(o, fn);
  assert.equal(p1.riga.id, p2.riga.id);
  assert.equal(AT.attivitaDaAvviare().length, 1);
  assert.ok(AT.giaInCorso('colore:m1'));
  // inCoda con la stessa chiave fa partire quella da avviare e aspetta lei
  const e3 = AT.inCoda(o, fn);
  assert.equal(AT.attivitaDaAvviare().length, 0);
  const e4 = AT.inCoda(o, fn); // già in coda/al lavoro: si aspetta lo stesso
  assert.deepEqual(await Promise.all([p1.esito, e3, e4]), ['ok', 'ok', 'ok']);
  assert.equal(volte, 1);
  assert.ok(!AT.giaInCorso('colore:m1'), 'finito, la chiave si libera');
  await AT.inCoda(o, fn);
  assert.equal(volte, 2, 'dopo, un lavoro nuovo con la stessa chiave si può rifare');
});

test('pausa ai confini: la riga dice «dopo il pezzo», si ferma al checkpoint, libera la corsia, riprende senza rifare i pezzi', async () => {
  const fatti = [];
  let continua; const via = new Promise((r) => { continua = r; });
  const e = AT.inCoda({ corsia: 'pesante', titolo: 'Sottotitoli', categoria: 'ai', pausa: 'ai-confini' }, async (l) => {
    for (let i = 0; i < 4; i++) {
      await l.checkpoint();
      fatti.push(i);
      if (i === 0) await via; // il pezzo 0 è lungo: la pausa arriva mentre lavora
      l.imposta((i + 1) / 4);
    }
    return fatti.slice();
  });
  await finche(() => fatti.length === 1);
  const riga = AT.attivitaInCorso()[0];
  assert.equal(AT.pausaRiga(riga.id), 'dopo-il-pezzo');
  assert.equal(riga.stato, 'lavoro', 'finché il pezzo non finisce resta al lavoro (niente pausa finta)');
  assert.ok(riga.pausaRichiesta);
  // intanto un altro lavoro pesante aspetta: appena la pausa è vera, la corsia è sua
  let altroPartito = false;
  const altro = AT.inCoda({ corsia: 'pesante', titolo: 'Altro', categoria: 'conversione' }, async () => { altroPartito = true; return 1; });
  await dormi(20);
  assert.equal(altroPartito, false);
  continua();
  await finche(() => riga.stato === 'pausa');
  assert.equal(AT.pausaRiga(riga.id), 'in-pausa');
  assert.equal(await altro, 1, 'la riga in pausa non occupa la corsia');
  assert.deepEqual(fatti, [0], 'fermo dopo il pezzo 0');
  assert.match(AT.riassuntoTesto(), /1 in pausa/);
  AT.riprendiRiga(riga.id);
  assert.deepEqual(await e, [0, 1, 2, 3], 'riprende dal pezzo 1: il pezzo 0 non si rifà');
});

test('pausa vera: allaPausa ferma subito il lavoro (come il pauseSignal), e riparte dallo stesso punto', async () => {
  let pos = 0, sospensioni = 0;
  const e = AT.inCoda({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', pausa: 'vera' }, async (l) => {
    while (pos < 50) {
      await l.checkpoint();
      let sospeso = false;
      const stacca = l.allaPausa(() => { sospeso = true; });
      // «execute» che si sospende appena arriva il segnale
      while (pos < 50 && !sospeso) { pos++; await dormi(1); }
      stacca();
      if (sospeso) sospensioni++;
    }
    return pos;
  });
  await finche(() => pos >= 5);
  const riga = AT.attivitaInCorso()[0];
  AT.pausaRiga(riga.id);
  await finche(() => riga.stato === 'pausa');
  const fermo = pos;
  await dormi(30);
  assert.equal(pos, fermo, 'in pausa non va avanti');
  assert.ok(fermo < 50);
  AT.riprendiRiga(riga.id);
  assert.equal(await e, 50);
  assert.equal(sospensioni, 1);
});

test('un lavoro senza pausa dichiarata dice «non-pausabile» (nessuna pausa finta)', async () => {
  let fine; const p = new Promise((r) => { fine = r; });
  const e = AT.inCoda({ corsia: 'leggero', titolo: 'Esporta', categoria: 'esporta' }, async () => { await p; return 1; });
  await dormi(5);
  const riga = AT.attivitaInCorso()[0];
  assert.equal(riga.capacita.pausa, 'no');
  assert.equal(AT.pausaRiga(riga.id), 'non-pausabile');
  assert.equal(riga.pausaRichiesta, false);
  fine();
  assert.equal(await e, 1);
  const n = AT.nuova({ titolo: 'Clip unica', categoria: 'esporta' });
  assert.equal(AT.pausaRiga(n.riga.id), 'non-pausabile');
  n.fine();
});

test('annulla: un lavoro in pausa si sveglia e si chiude «annullata», il risultato tardivo non si consegna', async () => {
  const e = AT.inCoda({ corsia: 'leggero', titolo: 'Forme', categoria: 'analisi', pausa: 'ai-confini' }, async (l) => {
    for (let i = 0; i < 100; i++) { await l.checkpoint(); await dormi(1); }
    return 'tardi';
  });
  await dormi(10);
  const riga = AT.attivitaInCorso()[0];
  AT.pausaRiga(riga.id);
  await finche(() => riga.stato === 'pausa');
  AT.annullaRiga(riga.id);
  assert.equal(await e, null);
  assert.equal(AT.attivitaFinite()[0].stato, 'annullata');
  // un lavoro che non guarda il segnale e finisce lo stesso: il suo risultato non arriva
  const e2 = AT.inCoda({ corsia: 'leggero', titolo: 'Sordo', categoria: 'analisi' }, async () => { await dormi(30); return 'tardi'; });
  await dormi(5);
  AT.annullaRiga(AT.attivitaInCorso()[0].id);
  assert.equal(await e2, null, 'annullato: anche se il lavoro finisce, il risultato non si consegna');
});

test('cambiaProgetto: le righe del progetto di prima si annullano (avviate e da avviare), gli export restano', async () => {
  const lento = async (l) => { await dormi(40); return l.valido ? 'buono' : 'vecchio'; };
  const a = AT.inCoda({ corsia: 'leggero', titolo: 'Colore', categoria: 'analisi' }, lento);
  const b = AT.proponi({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy' }, lento);
  const x = AT.inCoda({ corsia: 'leggero', titolo: 'Esporta', categoria: 'esporta' }, async () => { await dormi(40); return 'file'; });
  const g = AT.progettoAttuale();
  await dormi(5);
  AT.cambiaProgetto();
  assert.equal(AT.progettoAttuale(), g + 1);
  assert.equal(AT.attivitaDaAvviare().length, 0);
  assert.deepEqual(await Promise.all([a, b.esito, x]), [null, null, 'file']);
});

test('cambiaProgetto: un lavoro che non si ferma e ritorna dopo il cambio non consegna niente', async () => {
  let fatto = false;
  const e = AT.nuova({ titolo: 'Ostinato', categoria: 'ai' });
  const q = AT.inCoda({ corsia: 'leggero', titolo: 'Ostinato', categoria: 'analisi' }, async () => { await dormi(30); fatto = true; return 'vecchio'; });
  await dormi(5);
  AT.cambiaProgetto();
  assert.equal(await q, null);
  assert.ok(fatto, 'il lavoro è finito lo stesso, ma il risultato non arriva');
  assert.equal(e.valido, false, 'chi lavora «a mano» lo vede da l.valido');
});

test('riprova: rimette in coda solo i pezzi andati male', async () => {
  const visti = [];
  let rotto = true;
  const fn = (n) => async () => { visti.push(n); if (n === 'b' && rotto) throw new Error('boom'); return n; };
  const p = ['a', 'b', 'c'].map((n) => AT.inCoda({ corsia: 'leggero', titolo: 'Forme', categoria: 'analisi', gruppo: 'pk' }, fn(n)));
  assert.deepEqual(await Promise.all(p), ['a', null, 'c']);
  const riga = AT.attivitaFinite()[0];
  assert.equal(riga.errori, 1);
  assert.match(riga.messaggio, /non riusciti/);
  rotto = false;
  visti.length = 0;
  assert.equal(AT.riprovaRiga(riga.id), 1);
  await finche(() => AT.attivitaInCorso().length === 0 && visti.length === 1);
  assert.deepEqual(visti, ['b']);
  assert.equal(AT.riprovaRiga(riga.id), 0, 'una volta sola');
});

test('in attesa del monitor: con il montaggio che suona la corsia pesante non parte e la riga lo dice', async () => {
  AT.pausaPerRiproduzione(true);
  let partito = false;
  const e = AT.inCoda({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy' }, async () => { partito = true; return 1; });
  await dormi(20);
  const riga = AT.attivitaInCorso()[0];
  assert.equal(partito, false);
  assert.equal(riga.stato, 'coda');
  assert.equal(riga.attesaMonitor, true);
  AT.pausaPerRiproduzione(false);
  assert.equal(await e, 1);
});

test('pausa di gruppo e riga con pezzi ancora in coda: i pezzi in coda non partono finché non si riprende', async () => {
  const visti = [];
  const fn = (n) => async (l) => { await l.checkpoint(); visti.push(n); await dormi(5); return n; };
  const p = ['a', 'b', 'c'].map((n) => AT.inCoda({ corsia: 'pesante', titolo: 'Copie', categoria: 'proxy', gruppo: 'proxy', pausa: 'vera' }, fn(n)));
  await finche(() => visti.length === 1);
  AT.pausaGruppo('proxy');
  await dormi(30);
  assert.deepEqual(visti, ['a']);
  assert.equal(AT.attivitaInCorso()[0].stato, 'pausa');
  AT.riprendiGruppo('proxy');
  assert.deepEqual(await Promise.all(p), ['a', 'b', 'c']);
});

test('cambiaProgetto invalida anche Riprova delle righe già fallite', async () => {
  let chiamate = 0;
  await AT.inCoda({ corsia: 'leggero', titolo: 'Vecchio', categoria: 'analisi' }, async () => { chiamate++; throw Error('boom'); });
  const id = AT.attivitaFinite()[0].id;
  AT.cambiaProgetto();
  assert.equal(AT.riprovaRiga(id), 0);
  await dormi(20); assert.equal(chiamate, 1);
});

test('seconda Pausa mentre aspetta la corsia: nessun pezzo riparte di nascosto', async () => {
  let l1, esci, libera; let oltre = false;
  const e = AT.inCoda({ corsia: 'pesante', titolo: 'A', categoria: 'analisi', pausa: 'ai-confini' }, async (l) => {
    l1 = l; await new Promise((r) => { esci = r; }); await l.checkpoint(); oltre = true;
  });
  await finche(() => !!l1);
  AT.pausaRiga(l1.riga.id); esci();
  await finche(() => l1.inPausa);
  const altro = AT.inCoda({ corsia: 'pesante', titolo: 'B', categoria: 'analisi' }, async () => { await new Promise((r) => { libera = r; }); });
  await finche(() => !!libera);
  AT.riprendiRiga(l1.riga.id); await dormi(10);
  AT.pausaRiga(l1.riga.id); libera(); await altro; await dormi(25);
  assert.equal(oltre, false);
  AT.riprendiRiga(l1.riga.id); await e; assert.equal(oltre, true);
});

test('Sovraccarica e i limiti di prima restano', () => {
  assert.deepEqual(AT.limitiNormali(4), { leggero: 2, pesante: 1 });
  assert.deepEqual(AT.limitiNormali(8), { leggero: 3, pesante: 2 });
  assert.deepEqual(AT.limitiForti(16), { leggero: 8, pesante: 4 });
  assert.equal(AT.pausaLavori, AT.pausaGlobale, '«metti in pausa» = «Non avviare altro»');
});
