// Le cose solide: sottotitoli SRT/VTT (scrivere e rileggere), recupero dopo una chiusura anomala, versioni del progetto,
// abbinamento dei file mancanti, piano della pulizia dello spazio. Tutto in Node, senza browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';
ambienteBrowser(); memoriaFinta();
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const SO = await carica('solido');
const ST = await carica('sottotitoli');
const VE = await carica('versioni');
const RI = await carica('ricollega');

const prog = (righe, rate = { num: 25, den: 1 }) => ({ rate, clips: [], media: [], name: 'Prova', sottotitoli: { righe, nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' } });
const riga = (id, da, a, testo) => ({ id, da, a, testo });
const tuple = (l) => l.map((r) => [r.da, r.a, r.testo].join(':'));

// ——— sottotitoli ———

test('SRT: scritto e riletto, i tempi tornano uguali (25 e 29,97 fps)', () => {
  for (const rate of [{ num: 25, den: 1 }, { num: 30000, den: 1001 }]) {
    const p = prog([riga('a', 0, 40, 'Ciao'), riga('b', 75, 151, 'Seconda\nriga'), riga('c', 1000, 1234, 'Tardi')], rate);
    const srt = ST.creaSrt(p);
    assert.equal(ST.formatoSottotitoli(srt), 'srt');
    assert.deepEqual(tuple(ST.leggiSrt(srt, p)), tuple(p.sottotitoli.righe), 'fps ' + rate.num);
  }
});

test('VTT: scritto e riletto identico, anche con < > & (le entità tornano caratteri)', () => {
  const p = prog([riga('a', 25, 75, 'Tom & Jerry <3'), riga('b', 100, 150, 'Prima\nSeconda')]);
  const vtt = ST.creaVtt(p);
  assert.equal(ST.formatoSottotitoli(vtt), 'vtt');
  assert.ok(vtt.includes('&amp;') && vtt.includes('&lt;3'));
  assert.deepEqual(tuple(ST.leggiSrt(vtt, p)), ['25:75:Tom & Jerry <3', '100:150:Prima\nSeconda']);
});

test('SRT: il testo con una riga vuota in mezzo non rompe il file (si rilegge in una riga sola)', () => {
  const p = prog([riga('a', 0, 50, 'Uno\n\nDue'), riga('b', 60, 100, 'Tre')]);
  const r = ST.leggiSrt(ST.creaSrt(p), p);
  assert.equal(r.length, 2);
  assert.equal(r[0].testo, 'Uno\nDue');
});

test('importa file di altri programmi: BOM, a capo di Windows e del vecchio Mac, numeri che mancano', () => {
  const p = prog([]);
  const strano = '\uFEFF3\r\n00:00:01,000 --> 00:00:02,500\r\nPrimo\r\n\r\n00:00:03,000 --> 00:00:04,000\r\nSenza numero\r\n';
  assert.deepEqual(tuple(ST.leggiSrt(strano, p)), ['25:63:Primo', '75:100:Senza numero']);
  const mac = '1\r00:00:01,000 --> 00:00:02,000\rCiao\r\r2\r00:00:03,000 --> 00:00:04,000\rMondo\r';
  assert.deepEqual(tuple(ST.leggiSrt(mac, p)), ['25:50:Ciao', '75:100:Mondo']);
});

test('importa VTT: intestazione con titolo, tempi senza ore, impostazioni dopo il tempo, NOTE/STYLE, tag', () => {
  const p = prog([]);
  const vtt = [
    'WEBVTT - un titolo', '', 'NOTE questo è un commento', 'e continua', '', 'STYLE', '::cue { color: yellow }', '',
    'intro', '00:01.000 --> 00:02.000 align:start position:10%', '<v Mario><i>Ciao</i> a <c.giallo>tutti</c>', '',
    '00:00:03.500 --> 00:00:05.000', '{\\an8}In alto', '',
  ].join('\n');
  assert.equal(ST.formatoSottotitoli(vtt), 'vtt');
  assert.deepEqual(tuple(ST.leggiSrt(vtt, p)), ['25:50:Ciao a tutti', '88:125:In alto']);
});

test('importa: tempi sbagliati e righe senza testo si saltano, una riga dura almeno un fotogramma, l\'ordine è dei tempi', () => {
  const p = prog([]);
  const t = ['2\n00:00:05,000 --> 00:00:06,000\nDopo', '1\n00:00:01,000 --> 00:00:01,001\nBrevissima', '3\n00:00:07,000 --> 00:00:06,000\nAl contrario', '4\n00:00:08,000 --> 00:00:09,000\n   ', '5\nnon è un tempo --> boh\nX'].join('\n\n');
  const r = ST.leggiSrt(t, p);
  assert.deepEqual(tuple(r), ['25:26:Brevissima', '125:150:Dopo']);
  assert.deepEqual(ST.leggiSrt('Ciao, questo non è un file di sottotitoli', p), []);
  assert.equal(ST.formatoSottotitoli('Ciao'), null);
});

test('leggiSottotitoli: formato e righe insieme; ogni riga ha un id suo', () => {
  const p = prog([]);
  const r = ST.leggiSottotitoli('1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n', p);
  assert.equal(r.formato, 'srt');
  assert.equal(r.righe.length, 2);
  assert.notEqual(r.righe[0].id, r.righe[1].id);
});

// ——— recupero dopo una chiusura anomala ———

test('serveRecupero: solo dopo una chiusura anomala, con modifiche non salvate e qualcosa dentro', () => {
  const sporca = { sporco: true, clip: 3, media: 2 };
  assert.equal(SO.serveRecupero(true, sporca), true);
  assert.equal(SO.serveRecupero(false, sporca), false, 'chiusura normale: niente finestra');
  assert.equal(SO.serveRecupero(true, { ...sporca, sporco: false }), false, 'tutto salvato: niente da recuperare');
  assert.equal(SO.serveRecupero(true, { sporco: true, clip: 0, media: 0 }), false, 'progetto vuoto');
  assert.equal(SO.serveRecupero(true, { sporco: true, clip: 0, media: 4 }), true, 'solo media nel contenitore conta');
  assert.equal(SO.serveRecupero(true, null), false);
});

test('frasiRecupero e sceltaCopia', () => {
  const ora = 1_000_000_000;
  const f = SO.frasiRecupero({ nome: 'Vacanza', quando: ora - 5 * 60_000, clip: 12, percorso: 'D:/Video/vacanza.dap' }, ora);
  assert.equal(f.titolo, 'Recupera il lavoro');
  assert.match(f.testo, /Vacanza/);
  assert.match(f.testo, /5 minuti fa/);
  assert.match(f.dettaglio, /12 clip/);
  assert.match(SO.frasiRecupero({ nome: '', quando: ora, clip: 1 }, ora).dettaglio, /1 clip · non ancora salvato/);
  assert.equal(SO.sceltaCopia(100, 200), 'autosalvataggio');
  assert.equal(SO.sceltaCopia(200, 200), 'emergenza');
  assert.equal(SO.sceltaCopia(undefined, 5), 'autosalvataggio');
  assert.equal(SO.sceltaCopia(5, undefined), 'emergenza');
  assert.equal(SO.sceltaCopia(undefined, undefined), null);
});

test('descriviEta e pesoTesto parlano come si parla', () => {
  const ora = 10_000_000_000;
  assert.equal(SO.descriviEta(ora - 10_000, ora), 'adesso');
  assert.equal(SO.descriviEta(ora - 60_000, ora), '1 minuto fa');
  assert.equal(SO.descriviEta(ora - 3 * 3600_000, ora), '3 ore fa');
  assert.equal(SO.descriviEta(ora - 30 * 3600_000, ora), 'ieri');
  assert.equal(SO.descriviEta(ora - 4 * 86400_000, ora), '4 giorni fa');
  assert.equal(SO.pesoTesto(1536), '1,5 KB');
  assert.equal(SO.pesoTesto(5 * (1 << 20)), '5,0 MB');
  assert.equal(SO.pesoTesto(3 * 2 ** 30), '3,0 GB');
});

test('firmaProgetto: la data di salvataggio non conta, il contenuto sì', () => {
  const a = '{"name":"x","saved":111,"clips":[1]}', b = '{"name":"x","saved":999,"clips":[1]}', c = '{"name":"x","saved":111,"clips":[1,2]}';
  assert.equal(SO.firmaProgetto(a), SO.firmaProgetto(b));
  assert.notEqual(SO.firmaProgetto(a), SO.firmaProgetto(c));
});

// ——— versioni ———

const meta = (n, extra = {}) => ({ id: 'v' + n, quando: n * 1000, motivo: 'salvataggio', nome: 'P', clip: 1, durata: 10, firma: 'f' + n, byte: 100, ...extra });

test('aggiungiVersione: si tengono le ultime N, le più vecchie vanno via, la più nuova resta sempre', () => {
  let indice = [];
  const tolte = [];
  for (let i = 1; i <= 15; i++) { const r = SO.aggiungiVersione(indice, meta(i), 12); indice = r.indice; tolte.push(...r.daEliminare); }
  assert.equal(indice.length, 12);
  assert.equal(indice[0].id, 'v15');
  assert.equal(indice.at(-1).id, 'v4');
  assert.deepEqual(tolte, ['v1', 'v2', 'v3']);
  // il peso: una versione enorme non caccia via la più nuova
  const r = SO.aggiungiVersione([meta(1), meta(2)], meta(3, { byte: 1000 }), 12, 500);
  assert.deepEqual(r.indice.map((v) => v.id), ['v3']);
  assert.deepEqual(r.daEliminare.sort(), ['v1', 'v2']);
});

test('serveVersione: mai uguale all\'ultima; le automatiche non troppo spesso, i salvataggi sempre', () => {
  const indice = [meta(1, { quando: 1000, firma: 'aaa' })];
  assert.equal(SO.serveVersione(indice, 'aaa', 5_000_000, 'salvataggio'), false, 'progetto uguale');
  assert.equal(SO.serveVersione(indice, 'bbb', 5_000, 'automatica'), false, 'troppo presto');
  assert.equal(SO.serveVersione(indice, 'bbb', 1000 + SO.VERSIONE_OGNI_MS, 'automatica'), true);
  assert.equal(SO.serveVersione(indice, 'bbb', 5_000, 'salvataggio'), true, 'un salvataggio fa sempre la sua versione');
  assert.equal(SO.serveVersione([], 'x', 0, 'automatica'), true);
});

test('versioni nel deposito: registra, evita i doppioni, pota, ripristina il testo giusto', async () => {
  const dep = VE.depositoInMemoria();
  VE.impostaDeposito(dep);
  try {
    const p = { name: 'Film', clips: [{ kind: 'media', start: 0, len: 250 }, { kind: 'fx', start: 10, len: 20 }], media: [], rate: { num: 25, den: 1 } };
    const chiave = VE.chiaveVersioni(p, null);
    assert.equal(chiave, 'b:Film');
    assert.equal(VE.chiaveVersioni(p, 'D:/film.dap'), 'D:/film.dap');
    const t = (n) => JSON.stringify({ ...p, saved: Date.now(), cambia: n });
    const v1 = await VE.registraVersione(p, t(1), chiave, 'salvataggio', { ora: 1000 });
    assert.ok(v1);
    assert.equal(v1.clip, 1, 'i blocchetti FX non contano come clip');
    assert.equal(v1.durata, 10);
    assert.equal(await VE.registraVersione(p, t(1), chiave, 'salvataggio', { ora: 2000 }), null, 'stesso contenuto: niente doppione');
    assert.equal(await VE.registraVersione(p, t(2), chiave, 'automatica', { ora: 3000 }), null, 'automatica troppo presto');
    for (let i = 3; i <= 20; i++) await VE.registraVersione(p, t(i), chiave, 'salvataggio', { ora: 1000 * i, max: 5 });
    const elenco = await VE.elencoVersioni(chiave);
    assert.equal(elenco.length, 5);
    assert.ok(elenco[0].quando > elenco[1].quando, 'dalla più nuova');
    assert.equal(JSON.parse(await VE.testoVersione(elenco[0].id)).cambia, 20);
    // le versioni tolte dall'elenco non restano nel deposito
    assert.equal([...dep.mappa.keys()].filter((k) => k.startsWith('ver-testo:')).length, 5);
    const peso = await VE.pesoVersioni();
    assert.equal(peso.quante, 4, 'si contano solo quelle che Spazio può togliere (l ultima resta)');
    assert.ok(peso.byte > 0);
    await VE.eliminaVersione(chiave, elenco[2].id);
    assert.equal((await VE.elencoVersioni(chiave)).length, 4);
    assert.equal(await VE.testoVersione(elenco[2].id), undefined);
    assert.equal(await VE.potaTutteLeVersioni(1), 3);
    assert.equal((await VE.elencoVersioni(chiave)).length, 1);
    assert.equal(JSON.parse(await VE.testoVersione((await VE.elencoVersioni(chiave))[0].id)).cambia, 20, 'resta l\'ultima');
  } finally { VE.impostaDeposito(null); }
});

test('copia di emergenza: si scrive, si rilegge, dopo un salvataggio non ha più modifiche da tenere', async () => {
  const dep = VE.depositoInMemoria();
  VE.impostaDeposito(dep);
  try {
    assert.equal(await VE.leggiEmergenza(), null);
    const p = { name: 'Corto', clips: [{ kind: 'media', start: 0, len: 100 }], media: [{ id: 'm' }], rate: { num: 25, den: 1 } };
    await VE.scriviEmergenza(p, '{"x":1}', 7, 'D:/corto.dap', true);
    const e = await VE.leggiEmergenza();
    assert.equal(e.testo, '{"x":1}'); assert.equal(e.clip, 1); assert.equal(e.media, 1); assert.equal(e.percorso, 'D:/corto.dap'); assert.equal(e.sporco, true);
    assert.equal(SO.serveRecupero(true, e), true);
    await VE.emergenzaPulita();
    assert.equal((await VE.leggiEmergenza()).sporco, false);
    assert.equal(SO.serveRecupero(true, await VE.leggiEmergenza()), false);
    await VE.togliEmergenza();
    assert.equal(await VE.leggiEmergenza(), null);
    dep.mappa.set('emergenza', 'non è json');
    assert.equal(await VE.leggiEmergenza(), null, 'una copia rovinata non rompe l\'avvio');
  } finally { VE.impostaDeposito(null); }
});

// ——— ricollegare i media ———

test('abbinaMancanti: prima i certi (nome e grandezza), poi lo stesso nome; ogni file una volta sola', () => {
  const cercati = [
    { id: '1', name: 'Spiaggia.MP4', size: 500 },
    { id: '2', name: 'musica.wav', size: 900 },
    { id: '3', name: 'drone.mov', size: 100 },
    { id: '4', name: 'assente.mp4', size: 1 },
  ];
  const trovati = [
    { name: 'spiaggia.mp4', size: 500, path: 'E:/nuovo/spiaggia.mp4' },
    { name: 'musica.wav', size: 901, path: 'E:/nuovo/musica.wav' },
    { name: 'drone.mov', size: 100, path: 'E:/nuovo/drone.mov' },
  ];
  const a = SO.abbinaMancanti(cercati, trovati);
  const per = Object.fromEntries(a.map((x) => [x.id, x]));
  assert.equal(per['1'].quanto, 'esatto'); assert.equal(per['1'].trovato, 0);
  assert.equal(per['2'].quanto, 'nome', 'grandezza diversa: abbinato ma da controllare');
  assert.equal(per['3'].quanto, 'esatto');
  assert.equal(per['4'], undefined);
  assert.match(SO.riassuntoRicollega(4, a), /Trovati 3 file su 4 \(2 identici, 1 con lo stesso nome ma grandezza diversa\) · 1 non ci sono/);
  assert.match(SO.riassuntoRicollega(2, []), /Non ho trovato nessuno dei 2/);
});

test('abbinaMancanti: due file con lo stesso nome — vince la grandezza, poi la cartella più vicina, il dubbio non si abbina', () => {
  const trovati = [
    { name: 'a.mp4', size: 10, path: 'E:/x/a.mp4' },
    { name: 'a.mp4', size: 20, path: 'E:/y/a.mp4' },
  ];
  // grandezza uguale: prende quello giusto anche se è il secondo
  assert.equal(SO.abbinaMancanti([{ id: 'k', name: 'a.mp4', size: 20 }], trovati)[0].trovato, 1);
  // stessa grandezza in due cartelle: vince la cartella che somiglia
  const doppi = [{ name: 'b.mp4', size: 5, path: 'E:/vacanza/b.mp4' }, { name: 'b.mp4', size: 5, path: 'E:/lavoro/b.mp4' }];
  assert.equal(SO.abbinaMancanti([{ id: 'k', name: 'b.mp4', size: 5, path: 'C:/lavoro/b.mp4' }], doppi)[0].trovato, 1);
  // stesso nome, grandezze diverse da quella cercata, senza indizi: meglio non indovinare
  assert.deepEqual(SO.abbinaMancanti([{ id: 'k', name: 'a.mp4', size: 99 }], trovati), []);
  // due mancanti con lo stesso nome non prendono lo stesso file
  const due = SO.abbinaMancanti([{ id: '1', name: 'c.mp4', size: 7 }, { id: '2', name: 'c.mp4', size: 7 }], [{ name: 'c.mp4', size: 7 }]);
  assert.equal(due.length, 1);
  // gli accenti scritti in due modi (Mac) sono lo stesso nome
  assert.equal(SO.abbinaMancanti([{ id: 'k', name: 'caffe\u0300.mp4', size: 3 }], [{ name: 'caff\u00e8.mp4', size: 3 }]).length, 1);
});

/** una cartella finta del browser: { nome: Uint8Array | cartella } */
function cartellaFinta(nome, voci) {
  return {
    kind: 'directory', name: nome,
    async *entries() {
      for (const [n, v] of Object.entries(voci)) {
        if (v instanceof Uint8Array) yield [n, { kind: 'file', name: n, async getFile() { return new File([v], n); } }];
        else yield [n, cartellaFinta(n, v)];
      }
    },
  };
}

test('cercaMancanti nel browser: scende nelle sottocartelle, salta quelle nascoste, abbina per nome e grandezza', async () => {
  const radice = cartellaFinta('Nuovo disco', {
    'note.txt': new Uint8Array(3),
    riprese: { giorno1: { 'Spiaggia.mp4': new Uint8Array(500) }, 'musica.wav': new Uint8Array(901) },
    '.cestino': { 'drone.mov': new Uint8Array(100) },
    node_modules: { 'drone.mov': new Uint8Array(100) },
  });
  const mancanti = [
    { id: '1', name: 'spiaggia.mp4', size: 500, type: 'video' },
    { id: '2', name: 'musica.wav', size: 900, type: 'audio' },
    { id: '3', name: 'drone.mov', size: 100, type: 'video' },
  ];
  const r = await RI.cercaMancanti(mancanti, { nome: 'Nuovo disco', maniglia: radice });
  assert.equal(r.cartella, 'Nuovo disco');
  assert.deepEqual(r.trovati.map((t) => t.name).sort(), ['Spiaggia.mp4', 'musica.wav']);
  assert.deepEqual(r.abbinati.map((a) => [a.id, a.quanto]).sort(), [['1', 'esatto'], ['2', 'nome']]);
  assert.ok(r.trovati[r.abbinati.find((a) => a.id === '1').trovato].maniglia, 'nel browser si tiene la maniglia per aprire il file');
  assert.equal(RI.comeCercato({ id: 'z', name: 'n', size: 0, path: 'p' }).size, undefined, 'grandezza 0 = non nota');
});

// ——— pulizia dello spazio ———

test('pianoCopieLeggere: quelle in uso non si toccano, le vecchie si distinguono dalle recenti', () => {
  const giorno = 86_400_000, ora = 100 * giorno;
  const copie = [
    { nome: 'aaaaaaaaaaaaaaaa', byte: 100, quando: ora - 90 * giorno },
    { nome: 'bbbbbbbbbbbbbbbb', byte: 50, quando: ora - 2 * giorno },
    { nome: 'cccccccccccccccc', byte: 70, quando: ora - 200 * giorno },
    { nome: 'dddddddddddddddd', byte: 30, quando: ora - 1 * giorno },
  ];
  const p = SO.pianoCopieLeggere(copie, new Set(['cccccccccccccccc']), ora);
  assert.deepEqual(p.vecchie.map((c) => c.nome), ['aaaaaaaaaaaaaaaa']);
  assert.deepEqual(p.altre.map((c) => c.nome), ['bbbbbbbbbbbbbbbb', 'dddddddddddddddd']);
  assert.deepEqual(p.usate.map((c) => c.nome), ['cccccccccccccccc'], 'anche se è vecchia: è di questo progetto');
  assert.equal(p.byteVecchie, 100); assert.equal(p.byteAltre, 80); assert.equal(p.byteUsate, 70);
});

test('spreco del .dap: segnala solo quando conviene riscriverlo', () => {
  const MB = 1 << 20;
  assert.equal(SO.spreco(1000 * MB, 990 * MB), 0, 'differenza piccola');
  assert.equal(SO.spreco(150 * MB, 100 * MB), 0, 'sotto i 100 MB di differenza non vale la pena');
  assert.equal(SO.spreco(3000 * MB, 1000 * MB), 2000 * MB);
  assert.equal(SO.spreco(0, 100), 0);
  assert.equal(SO.spreco(500 * MB, 0), 0, 'se non si sa quanto serve, niente consigli');
});

test('versioni: prima e dopo il primo salvataggio stanno sotto chiavi diverse, ma l elenco le mette insieme', async () => {
  const dep = VE.depositoInMemoria();
  VE.impostaDeposito(dep);
  try {
    const p = { name: 'Corto', clips: [{ kind: 'media', start: 0, len: 25 }], media: [], rate: { num: 25, den: 1 } };
    assert.deepEqual(VE.chiaviVersioni(p, null), ['b:Corto']);
    assert.deepEqual(VE.chiaviVersioni(p, 'D:/corto.dap'), ['D:/corto.dap', 'b:Corto']);
    const t = (n) => JSON.stringify({ ...p, n });
    await VE.registraVersione(p, t(1), 'b:Corto', 'automatica', { ora: 1000 });
    await VE.registraVersione(p, t(2), 'D:/corto.dap', 'salvataggio', { ora: 2000 });
    const chiavi = VE.chiaviVersioni(p, 'D:/corto.dap');
    const tutte = await VE.elencoVersioniDi(chiavi);
    assert.equal(tutte.length, 2);
    assert.ok(tutte[0].quando > tutte[1].quando);
    // togliere una versione la toglie dalla chiave giusta
    await VE.eliminaVersione(chiavi, tutte[1].id);
    assert.equal((await VE.elencoVersioni('b:Corto')).length, 0);
    assert.equal((await VE.elencoVersioni('D:/corto.dap')).length, 1);
    assert.equal(await VE.testoVersione(tutte[1].id), undefined);
  } finally { VE.impostaDeposito(null); }
});
