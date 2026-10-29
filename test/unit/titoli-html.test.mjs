// I titoli animati HTML (src/core/titoliHtml.ts): il tempo deve dare sempre lo stesso stato e lo stesso HTML (è quello che
// fa uguali monitor ed esportazione), i testi non devono poter rompere il disegno, e i progetti vecchi si aprono identici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienteBrowser, carica } from './_aiuti.mjs';
ambienteBrowser();
const H = await carica('titoliHtml');

const TEMPI = [0, 0.04, 0.3, 0.9, 1.7, 2.5, 3.33, 4.2, 4.8, 4.96];
const costruisci = (m, t, d = m.durata) => H.costruisciHtml(H.nuovoHtml(m.id), 1920, 1080, t, d);

test('catalogo: 24 modelli, campi completi, caratteri solo del programma', () => {
  assert.equal(H.MODELLI_HTML.length, 24, `modelli: ${H.MODELLI_HTML.length}`);
  assert.equal(new Set(H.MODELLI_HTML.map((m) => m.id)).size, H.MODELLI_HTML.length);
  for (const m of H.MODELLI_HTML) {
    const ids = m.campi.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${m.id}: campi doppi`);
    assert.ok(ids.includes('ent') && ids.includes('usc'), `${m.id}: manca entrata/uscita`);
    assert.ok(ids.some((i) => /colore/.test(i)), `${m.id}: manca un colore`);
    assert.ok(m.campi.some((c) => c.tipo === 'testo' || c.tipo === 'lungo' || c.tipo === 'numero'), `${m.id}: manca un testo`);
    const v = H.valoriHtmlDiPartenza(m);
    for (const p of m.font(v)) assert.ok(H.FONT_HTML[p], `${m.id}: carattere sconosciuto ${p}`);
    assert.ok(!/\$\{P\}/.test(costruisci(m, 1).css), `${m.id}: peso non risolto`);
    assert.ok(!/[<&]/.test(m.css), `${m.id}: il CSS ha < o & (rompe l'XML)`);
    assert.ok(m.durata >= 3 && m.durata <= 12);
  }
  for (const [k, f] of Object.entries(H.FONT_HTML)) assert.ok(f.famiglia && f.peso >= 400, k);
});

test('tempo → stato: sempre lo stesso, in qualunque ordine lo si chieda', () => {
  for (const m of H.MODELLI_HTML) {
    const spec = H.nuovoHtml(m.id);
    const avanti = TEMPI.map((t) => JSON.stringify(H.statoHtml(spec, t, m.durata)));
    const indietro = [...TEMPI].reverse().map((t) => JSON.stringify(H.statoHtml(spec, t, m.durata))).reverse();
    assert.deepEqual(avanti, indietro, m.id);
    // anche dopo aver "giocato" con altri tempi e altri modelli
    H.statoHtml(H.nuovoHtml(H.MODELLI_HTML[0].id), 99, 3);
    assert.equal(JSON.stringify(H.statoHtml(spec, 1.7, m.durata)), avanti[4], m.id);
    for (const s of avanti.map((x) => JSON.parse(x))) for (const [k, x] of Object.entries(s)) assert.ok(Number.isFinite(x), `${m.id}.${k}`);
  }
});

test('entrata e uscita: sale da 0, resta a 1, torna a 0 alla fine', () => {
  const spec = H.nuovoHtml('terzo');
  const d = 5;
  const dentro = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1].map((t) => H.statoHtml(spec, t, d).in);
  assert.equal(dentro[0], 0);
  for (let i = 1; i < dentro.length; i++) assert.ok(dentro[i] >= dentro[i - 1], 'in non scende');
  assert.equal(dentro.at(-1), 1);
  assert.equal(H.statoHtml(spec, 2.5, d).out, 1);
  assert.equal(H.statoHtml(spec, d, d).out, 0);
  const fuori = [4.4, 4.6, 4.8, 5].map((t) => H.statoHtml(spec, t, d).out);
  for (let i = 1; i < fuori.length; i++) assert.ok(fuori[i] <= fuori[i - 1], 'out non sale');
  // fuori dai bordi: il tempo si ferma agli estremi
  assert.equal(H.statoHtml(spec, -3, d).in, 0);
  assert.equal(H.statoHtml(spec, 99, d).out, 0);
  // una clip più corta di entrata + uscita: niente numeri strani
  for (const t of [0, 0.1, 0.2, 0.3, 0.4]) { const s = H.statoHtml(spec, t, 0.4); assert.ok(s.in >= 0 && s.in <= 1 && s.out >= 0 && s.out <= 1, `corta t=${t}`); }
});

test('stesso (spec, misura, tempo) → stesso HTML e stessa chiave', () => {
  for (const m of H.MODELLI_HTML) {
    for (const t of TEMPI) {
      const a = costruisci(m, t), b = costruisci(m, t);
      assert.equal(a.corpo, b.corpo, `${m.id} t=${t}`);
      assert.equal(a.chiave, b.chiave);
      assert.equal(a.css, b.css);
    }
  }
});

test('cache: nella tenuta il fotogramma è lo stesso (si disegna una volta), quando si muove cambia', () => {
  const chiave = (id, t, d = 6) => H.costruisciHtml(H.nuovoHtml(id), 1920, 1080, t, d).chiave;
  assert.equal(chiave('terzo', 2.5), chiave('terzo', 3.5));
  assert.equal(chiave('cinema', 3.5), chiave('cinema', 4));
  assert.equal(chiave('neon', 3.2, 6), chiave('neon', 3.3, 6)); // acceso fermo (il guizzo è dopo)
  assert.notEqual(chiave('terzo', 0.1), chiave('terzo', 0.2));
  assert.notEqual(chiave('ticker', 2), chiave('ticker', 2.04));
  assert.notEqual(chiave('rec', 2.2), chiave('rec', 3.2));
  // la misura e il modello fanno parte della chiave
  assert.notEqual(H.costruisciHtml(H.nuovoHtml('terzo'), 1920, 1080, 2, 6).chiave, H.costruisciHtml(H.nuovoHtml('terzo'), 640, 360, 2, 6).chiave);
  assert.notEqual(chiave('terzo', 2), chiave('cinema', 2));
  // un testo cambiato cambia il fotogramma
  const x = H.nuovoHtml('terzo'), y = H.nuovoHtml('terzo', { nome: 'Anna Verdi' });
  assert.notEqual(H.costruisciHtml(x, 1920, 1080, 2, 6).chiave, H.costruisciHtml(y, 1920, 1080, 2, 6).chiave);
});

test('modelli con il tempo dentro: display, conto alla rovescia, tempo del REC, ticker', () => {
  const d7 = H.nuovoHtml('display7', { da: 0, a: 1000, cifre: 4 });
  const val = (t) => H.statoHtml(d7, t, 5).valore;
  assert.equal(val(0), 0);
  assert.equal(val(5), 1000);
  for (let t = 0.2; t <= 5; t += 0.2) assert.ok(val(t) >= val(t - 0.2), 'il contatore non scende');
  assert.match(H.costruisciHtml(d7, 1920, 1080, 5, 5).corpo, />1000</);
  const conto = H.nuovoHtml('conto', { da: 5 });
  assert.deepEqual([0, 0.99, 1, 2.5, 4.99].map((t) => H.statoHtml(conto, t, 5).n), [5, 5, 4, 3, 1]);
  assert.match(H.costruisciHtml(conto, 1920, 1080, 2.5, 5).corpo, />3</);
  const rec = H.nuovoHtml('rec', { inizio: 3670 });
  assert.match(H.costruisciHtml(rec, 1920, 1080, 2.2, 8).corpo, /01:01:12/);
  const tk = H.nuovoHtml('ticker', { velocita: 200 });
  assert.equal(H.statoHtml(tk, 3, 10).x, 600);
  assert.ok(H.costruisciHtml(tk, 1920, 1080, 3, 10).corpo.includes('translateX(-600px)'));
});

test('testi e colori storti non rompono né il disegno né l\'XML', () => {
  const brutto = H.nuovoHtml('terzo', { nome: '<script>alert(1)</script> & "x" \u0001\u0007', ruolo: '</div><b>\'', colore: 'red;}</style><x>', ent: 'abc', dim: 99999 });
  const f = H.costruisciHtml(brutto, 1920, 1080, 2, 5);
  assert.ok(!/<script/i.test(f.corpo), 'script sfuggito');
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(f.corpo), 'caratteri di controllo');
  assert.ok(!f.corpo.includes('red;}'), 'colore non filtrato');
  assert.ok(f.corpo.includes('&lt;script&gt;') && f.corpo.includes('&amp;'));
  const v = H.valoriHtmlDi(brutto);
  assert.equal(v.colore, '#ffd54a');
  assert.equal(v.dim, 200);
  assert.equal(v.ent, 0.8); // il valore di partenza del terzo inferiore
  // il testo lungo si accorcia
  assert.ok(String(H.valoriHtmlDi(H.nuovoHtml('terzo', { nome: 'x'.repeat(5000) })).nome).length <= 200);
});

test('l\'HTML è ben formato (ogni tag che si apre si chiude)', () => {
  for (const m of H.MODELLI_HTML) {
    for (const t of [0.5, 2.5, 4.5]) {
      const { corpo } = costruisci(m, t);
      const senzaAutochiusi = corpo.replace(/<[a-zA-Z]+[^<>]*\/>/g, '');
      for (const tag of ['div', 'span', 'i', 'b', 'em', 'u', 'svg', 'g', 'text', 'defs', 'linearGradient']) {
        const apre = (senzaAutochiusi.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
        const chiude = (senzaAutochiusi.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
        assert.equal(apre, chiude, `${m.id} t=${t}: <${tag}> ${apre} aperti, ${chiude} chiusi`);
      }
      assert.ok(!/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(corpo), `${m.id}: entità non XML`);
    }
  }
});

test('palco: 16:9 pieno, verticale e quadrato si allargano e si rimpiccioliscono', () => {
  assert.deepEqual(H.palco(1920, 1080), { sw: 1920, sh: 1080, k: 1 });
  assert.deepEqual(H.palco(3840, 2160), { sw: 1920, sh: 1080, k: 2 });
  const v = H.palco(1080, 1920);
  assert.equal(v.sw, 1500);
  assert.ok(Math.abs(v.sh - 2666.67) < 0.01 && Math.abs(v.k - 0.72) < 1e-9);
  const q = H.palco(1080, 1080);
  assert.equal(q.sw, 1500); assert.equal(q.sh, 1500);
});

test('migrazione: i progetti senza titoli HTML restano identici', () => {
  const clip = (extra = {}) => ({ id: 'c1', kind: 'title', track: 't', start: 0, len: 125, gen: { title: { text: 'Ciao' } }, ...extra });
  const p = { format: 'daprod-video', tracks: [], clips: [clip(), { id: 'c2', kind: 'media', track: 't', start: 0, len: 10 }, { id: 'c3', kind: 'title', track: 't', start: 0, len: 50, gen: { anim: { id: 'lt-barra', v: { nome: 'A' } } } }],
    sequenze: [{ clips: [clip({ id: 'c9' })] }] };
  const prima = JSON.stringify(p);
  H.migraTitoliHtml(p);
  assert.equal(JSON.stringify(p), prima);
});

test('migrazione: campi mancanti, fuori misura o del tipo sbagliato tornano buoni; due volte = una', () => {
  const sporco = { id: 'c1', kind: 'title', track: 't', start: 0, len: 125, gen: { html: { id: 'terzo', v: { nome: 42, colore: 'blu', ent: -5, dim: 1e9, lato: 'su', straniero: 'resta fuori' } } } };
  const altra = { id: 'c2', kind: 'title', track: 't', start: 0, len: 125, gen: { html: { id: 'neon' } } };
  const ignoto = { id: 'c3', kind: 'title', track: 't', start: 0, len: 125, gen: { html: { id: 'modello-del-futuro', v: { a: 1 } } } };
  const p = { format: 'daprod-video', tracks: [], clips: [sporco, altra], sequenze: [{ clips: [ignoto] }] };
  H.migraTitoliHtml(p);
  const v = sporco.gen.html.v;
  assert.equal(v.nome, '42');
  assert.equal(v.colore, '#ffd54a');
  assert.equal(v.ent, 0.1);
  assert.equal(v.dim, 200);
  assert.equal(v.lato, 'sinistra');
  assert.equal(v.ruolo, 'Regista'); // il mancante prende il valore di partenza
  assert.ok(!('straniero' in v));
  assert.equal(altra.gen.html.v.testo, 'APERTO');
  assert.deepEqual(ignoto.gen.html, { id: 'modello-del-futuro', v: { a: 1 } }); // un modello che non conosciamo non si tocca
  const una = JSON.stringify(p);
  H.migraTitoliHtml(p);
  assert.equal(JSON.stringify(p), una);
});

test('un progetto con titoli HTML salvato e riletto dà gli stessi fotogrammi', () => {
  const spec = H.nuovoHtml('notizie', { titolo: 'Prova\nsu due righe' });
  const riletto = JSON.parse(JSON.stringify({ gen: { html: spec } })).gen.html;
  for (const t of TEMPI) assert.equal(H.costruisciHtml(spec, 1280, 720, t, 6).chiave, H.costruisciHtml(riletto, 1280, 720, t, 6).chiave);
});

// ——— i dodici modelli nuovi (parole, social, indicare, documentario) ———
const NUOVI = ['citazione', 'karaoke', 'macchina', 'didascalia', 'finale', 'freccia', 'primadopo', 'prezzo', 'luogo', 'intervista', 'coda', 'capitoli'];

test('nuovi: ci sono tutti e stanno in categorie che esistono, ogni categoria ha dei modelli', () => {
  for (const id of NUOVI) assert.ok(H.modelloHtml(id), id);
  const gruppi = H.GRUPPI_HTML.map((g) => g.id);
  assert.equal(new Set(gruppi).size, gruppi.length);
  for (const m of H.MODELLI_HTML) assert.ok(gruppi.includes(m.gruppo), `${m.id}: categoria ${m.gruppo} sconosciuta`);
  for (const g of gruppi) assert.ok(H.modelliDi(g).length >= 1, `categoria vuota: ${g}`);
  for (const g of ['parole', 'indicare', 'docu']) assert.ok(gruppi.includes(g), g);
});

test('nuovi: ogni modello mette il suo testo e tiene l\'HTML pulito a tutti i tempi', () => {
  const marca = { citazione: 'Il montaggio', karaoke: 'Il', macchina: 'Un', didascalia: '@daprod', finale: 'GUARDA ANCHE', freccia: 'GUARDA QUI', primadopo: 'PRIMA', prezzo: '69,00', luogo: 'ROMA', intervista: 'Anna Verdi', coda: 'Mario Rossi', capitoli: 'Introduzione' };
  for (const id of NUOVI) {
    const m = H.modelloHtml(id);
    for (const t of [0, 0.3, 1, 2.5, m.durata * 0.9, m.durata]) {
      const f = H.costruisciHtml(H.nuovoHtml(id), 1920, 1080, t, m.durata);
      assert.ok(!/NaN|undefined|Infinity/.test(f.corpo), `${id} t=${t}: numeri storti`);
    }
    // a metà clip il testo di partenza si vede (la macchina da scrivere e il karaoke lo hanno già in parte)
    const meta = H.costruisciHtml(H.nuovoHtml(id), 1920, 1080, m.durata * 0.6, m.durata).corpo;
    assert.ok(meta.includes(marca[id]), `${id}: manca ${marca[id]}`);
    // verticale e quadrato reggono
    for (const [w, h] of [[1080, 1920], [1080, 1080]]) assert.ok(H.costruisciHtml(H.nuovoHtml(id), w, h, 2, m.durata).corpo.length > 50);
  }
});

test('nuovi: i testi storti non rompono nessuno (script, &, virgolette, caratteri di controllo)', () => {
  const brutto = '<script>alert(1)</script> & "x" \u0001 |';
  for (const id of NUOVI) {
    const m = H.modelloHtml(id);
    const v = {};
    for (const c of m.campi) if (c.tipo === 'testo' || c.tipo === 'lungo') v[c.id] = brutto;
    const f = H.costruisciHtml(H.nuovoHtml(id, v), 1920, 1080, m.durata * 0.6, m.durata);
    assert.ok(!/<script/i.test(f.corpo), `${id}: script sfuggito`);
    assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(f.corpo), `${id}: caratteri di controllo`);
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(f.corpo), `${id}: entità non XML`);
  }
});

test('karaoke: le parole si accendono una dopo l\'altra, mai all\'indietro', () => {
  const spec = H.nuovoHtml('karaoke', { testo: 'uno due tre quattro', velocita: 2, ent: 0.4 });
  const accese = (t) => [...H.costruisciHtml(spec, 1920, 1080, t, 6).corpo.matchAll(/--k:([\d.]+)/g)].map((x) => Number(x[1]));
  assert.deepEqual(accese(0), [0, 0, 0, 0]);
  let prima = 0;
  for (let t = 0; t <= 6; t += 0.25) { const k = accese(t).reduce((a, b) => a + b, 0); assert.ok(k >= prima - 1e-9, `t=${t}`); prima = k; }
  assert.deepEqual(accese(6), [1, 1, 1, 1]);
  // la seconda parola non parte prima che la prima sia finita
  const a = accese(1.0);
  assert.ok(a[0] === 1 && a[1] < 1 && a[2] === 0, JSON.stringify(a));
  // finite le parole il fotogramma non cambia più (la cache lo disegna una volta sola)
  assert.equal(H.costruisciHtml(spec, 1920, 1080, 4, 6).chiave, H.costruisciHtml(spec, 1920, 1080, 4.5, 6).chiave);
});

test('macchina da scrivere: le lettere crescono col tempo e il cursore lampeggia a scrittura finita', () => {
  const spec = H.nuovoHtml('macchina', { testo: 'ciao a tutti', velocita: 10, ent: 0.4 });
  const vis = (t) => H.statoHtml(spec, t, 7).car;
  assert.equal(vis(0), 0);
  for (let t = 0.2; t <= 7; t += 0.2) assert.ok(vis(t) >= vis(t - 0.2));
  assert.equal(vis(7), 'ciao a tutti'.length);
  assert.equal(H.statoHtml(spec, 1, 7).luce, 1); // sta scrivendo: acceso
  const luci = new Set([3, 3.2, 3.4, 3.6, 4, 4.2].map((t) => H.statoHtml(spec, t, 7).luce));
  assert.ok(luci.has(0) && luci.has(1), 'a fine scrittura il cursore lampeggia');
  // il testo c'è già tutto (il resto invisibile), la fascia non cambia misura
  assert.ok(H.costruisciHtml(spec, 1920, 1080, 1, 7).corpo.includes('mc-resto'));
  assert.match(H.costruisciHtml(spec, 1920, 1080, 7, 7).corpo, />ciao a tutti</);
  // le emoji (due unità) non si spezzano a metà
  const e = H.nuovoHtml('macchina', { testo: 'a😀b', velocita: 4, ent: 0.1 });
  for (let t = 0; t <= 2; t += 0.1) assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(H.costruisciHtml(e, 1920, 1080, t, 7).corpo), `t=${t}`);
});

test('titoli di coda: scorrono dal basso all\'alto per tutta la clip, ruolo e nome sulla stessa riga', () => {
  const spec = H.nuovoHtml('coda', { testo: 'Regia | Mario\nMusiche | Anna\n\nGrazie' });
  const k = (t) => Number(/--k:([\d.]+)/.exec(H.costruisciHtml(spec, 1920, 1080, t, 12).corpo)[1]);
  assert.equal(k(0), 0); assert.equal(k(12), 1);
  for (let t = 0.5; t <= 12; t += 0.5) assert.ok(k(t) > k(t - 0.5));
  const c = H.costruisciHtml(spec, 1920, 1080, 6, 12).corpo;
  assert.match(c, /cd-ruolo">Regia<\/div><div class="cd-nome">Mario</);
  assert.match(c, /cd-tit">Grazie</);
  assert.match(c, /cd-vuota/);
});

test('capitoli: la barra si riempie un capitolo per volta e quello acceso cambia', () => {
  const spec = H.nuovoHtml('capitoli', { capitoli: 'A\nB\nC' });
  const corpo = (t) => H.costruisciHtml(spec, 1920, 1080, t, 10).corpo;
  assert.equal((corpo(5).match(/class="ch-c/g) ?? []).length, 3);
  const acceso = (t) => /ch-c att"><div class="ch-barra"><i style="--f:[\d.]+"><\/i><\/div><div class="ch-nome" style="--o:1"><b>0(\d)</.exec(corpo(t))[1];
  assert.equal(acceso(1), '1'); assert.equal(acceso(5), '2'); assert.equal(acceso(9.9), '3');
  assert.ok(H.statoHtml(spec, 0, 10).avanza === 0 && H.statoHtml(spec, 10, 10).avanza === 1);
  // niente righe = un capitolo vuoto, non un errore; più di otto si fermano a otto
  assert.ok(H.costruisciHtml(H.nuovoHtml('capitoli', { capitoli: '' }), 1920, 1080, 3, 10).corpo.includes('ch-c'));
  const molti = Array.from({ length: 20 }, (_, i) => 'C' + i).join('\n');
  assert.equal((H.costruisciHtml(H.nuovoHtml('capitoli', { capitoli: molti }), 1920, 1080, 3, 10).corpo.match(/class="ch-c/g) ?? []).length, 8);
});

test('freccia: si disegna piano piano, la punta compare alla fine, la scritta sta dove dici', () => {
  const spec = H.nuovoHtml('freccia', { x: 40, y: 60, lato: 'basso-destra' });
  const dash = (t) => { const m = /stroke-width="9"[^>]*stroke-dasharray="([\d.]+)" stroke-dashoffset="([\d.]+)"/.exec(H.costruisciHtml(spec, 1920, 1080, t, 5).corpo); return 1 - Number(m[2]) / Number(m[1]); };
  assert.ok(dash(0) < 0.01 && dash(5) > 0.99);
  for (let t = 0.2; t <= 2; t += 0.2) assert.ok(dash(t) >= dash(t - 0.2) - 1e-9);
  assert.match(H.costruisciHtml(spec, 1920, 1080, 2.5, 5).corpo, /left:40%;top:60%/);
  // in basso la scritta non si sposta in su; in alto sì
  assert.match(H.costruisciHtml(spec, 1920, 1080, 2.5, 5).corpo, /translate\(-50%,0\)/);
  assert.match(H.costruisciHtml(H.nuovoHtml('freccia'), 1920, 1080, 2.5, 5).corpo, /translate\(-50%,-100%\)/);
  // tutte le forme si disegnano
  for (const forma of ['cerchio', 'rettangolo', 'evidenziatore', 'nessuna']) for (const lato of ['alto-sinistra', 'alto-destra', 'basso-sinistra', 'basso-destra']) assert.ok(H.costruisciHtml(H.nuovoHtml('freccia', { forma, lato }), 1920, 1080, 2, 5).corpo.includes('<path'), forma + lato);
});

test('prima e dopo: il divisore va dal punto di partenza a quello di arrivo', () => {
  const spec = H.nuovoHtml('primadopo', { da: 10, a: 90 });
  const x = (t) => H.statoHtml(spec, t, 6).pos;
  assert.equal(x(0), 10); assert.ok(x(6) >= 89.9);
  for (let t = 0.3; t <= 6; t += 0.3) assert.ok(x(t) >= x(t - 0.3) - 1e-9);
  assert.match(H.costruisciHtml(spec, 1920, 1080, 6, 6).corpo, />PRIMA<[^]*>DOPO</);
});

test('didascalia: i numeri salgono fino al valore scelto, con i punti delle migliaia', () => {
  const spec = H.nuovoHtml('didascalia', { mipiace: 1234, commenti: 56, condivisioni: 7 });
  const c = (t) => H.costruisciHtml(spec, 1920, 1080, t, 6).corpo;
  assert.match(c(0), /<span>0<\/span><\/div><div>/);
  assert.match(c(5), /<span>1\.234<\/span>/);
  assert.match(c(5), /<span>56<\/span>/);
  assert.match(H.costruisciHtml(H.nuovoHtml('didascalia', { mipiace: 12400 }), 1920, 1080, 5, 6).corpo, /12,4 K/);
});

test('prezzo: la barra sul prezzo vecchio parte dopo che il prezzo è comparso', () => {
  const spec = H.nuovoHtml('prezzo');
  const v = (t, n) => Number(new RegExp('--' + n + ':([\\d.-]+)').exec(H.costruisciHtml(spec, 1920, 1080, t, 6).corpo)[1]);
  assert.equal(v(0, 'br'), 0); assert.equal(v(5, 'br'), 1);
  assert.ok(v(0.9, 'vc') > 0 && v(0.5, 'br') === 0);
  assert.match(H.costruisciHtml(spec, 1920, 1080, 5, 6).corpo, /-30%/);
  assert.ok(!H.costruisciHtml(H.nuovoHtml('prezzo', { sconto: '' }), 1920, 1080, 5, 6).corpo.includes('pz-sticker'));
});

test('cambiare modello tenendo i testi: i campi con lo stesso nome si portano dietro (come fa il pannello)', () => {
  // quello che fa titoloHtml in ispettore.ts: stessi id e stesso tipo → il valore passa
  const vecchi = H.valoriHtmlDi(H.nuovoHtml('terzo', { nome: 'Anna', ent: 1.5 }));
  const nuovo = H.nuovoHtml('intervista');
  for (const k of H.modelloHtml('intervista').campi) if ((k.tipo === 'testo' || k.tipo === 'lungo' || k.id === 'ent' || k.id === 'usc' || k.id === 'dim') && k.id in vecchi && typeof vecchi[k.id] === typeof k.def) nuovo.v[k.id] = vecchi[k.id];
  assert.equal(nuovo.v.nome, 'Anna'); assert.equal(nuovo.v.ent, 1.5);
});
