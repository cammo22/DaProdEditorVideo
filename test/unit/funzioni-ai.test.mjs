// Le funzioni AI facili del motore locale, dalla parte del programma (niente modelli, niente GPU, niente rete):
// il registro onesto di tutte le funzioni, la traduzione con Hy-MT2 al posto di NLLB, i client del motore (pezzi, scene,
// parole, voce pulita, voce e musica, rallentatore) con un motore FINTO, e l'interruttore di Clear.
// E, se c'è Python, anche le prove del server del motore (test/unit/motore_ai_server*.py, con modelli finti).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { carica, ambienteBrowser, memoriaFinta } from './_aiuti.mjs';
ambienteBrowser(); memoriaFinta();
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const intervallo = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t = intervallo(...args); t.unref?.(); return t; };

// un documento finto quanto basta perché gli avvisi (toast) si possano "scrivere"
const avvisiScritti = [];
const elemento = () => ({
  children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, isConnected: true,
  setAttribute() {}, addEventListener() {}, removeEventListener() {}, append(...x) { this.children.push(...x); },
  get firstChild() { return this.children[0]; },
  appendChild(e) { e.remove = () => { this.children = this.children.filter((y) => y !== e); }; this.children.push(e); return e; },
});
globalThis.window ??= globalThis;
globalThis.document ??= { baseURI: 'https://prova.invalid/', dispatchEvent() {}, createElement: elemento, createTextNode: (t) => { avvisiScritti.push(String(t)); return {}; }, body: elemento() };

const R = await carica('funzioniAI');
const MA = await carica('materialeAI');
const FM = await carica('funzioniMotore');
const TR = await carica('traduci');
const MOT = await carica('motoreAI');
const CL = await carica('clear');
const PR = await carica('progetto');
const ST = await carica('store');
const AT = await carica('attivita');
const UI = await carica('funzioniMotoreUI');
FM.impostaMotoreDisponibile(() => true);

const stato = (s, dettaglio = '') => ({ stato: s, dettaglio, k: 0.5, cartella: 'privata' });
/** un motore finto: risponde alle richieste come il vero e ricorda cosa gli è stato chiesto */
function motoreFinto({ s = 'acceso', modelli = [], lavori = {}, scambio = new Map() } = {}) {
  const richieste = [];
  const chiamate = [];
  let ultimo = 0;
  const risultati = new Map();
  const m = new MOT.MotoreAI(async (cmd, args) => {
    chiamate.push(cmd);
    if (cmd === 'ai_locale_stato') return stato(s);
    if (cmd === 'ai_locale_accendi') { s = 'acceso'; return null; }
    if (cmd === 'ai_locale_spegni') return null;
    if (cmd !== 'ai_locale_richiesta') return null;
    richieste.push(args);
    const { metodo, percorso, dati } = args;
    if (metodo === 'GET' && percorso === '/modelli') return { modelli };
    if (metodo === 'GET' && percorso.startsWith('/lavori/')) return { stato: 'finito', k: 1, dettaglio: 'Fatto', risultato: risultati.get(percorso.slice(8)) };
    if (percorso === '/scambio/scrivi') {
      const prima = scambio.get(dati.nome) ?? new Uint8Array();
      const pezzo = Uint8Array.from(atob(dati.dati), (c) => c.charCodeAt(0));
      const n = new Uint8Array(dati.da === 0 ? pezzo.length : prima.length + pezzo.length);
      if (dati.da !== 0) n.set(prima); n.set(pezzo, dati.da === 0 ? 0 : prima.length);
      scambio.set(dati.nome, n);
      return { byte: n.length };
    }
    if (percorso === '/scambio/leggi') {
      const f = scambio.get(dati.nome); const p = f.subarray(dati.da, dati.da + dati.len);
      return { dati: MOT.base64DaByte(p), byte: f.length, fine: dati.da + p.length >= f.length };
    }
    if (percorso === '/scambio/pulisci') { scambio.clear(); return { ok: true }; }
    if (metodo === 'POST' && percorso in lavori) { const id = String(++ultimo); risultati.set(id, typeof lavori[percorso] === 'function' ? lavori[percorso](dati) : lavori[percorso]); return { id }; }
    if (percorso === '/modelli/togli') return { ok: true };
    throw new Error('richiesta non prevista: ' + percorso);
  }, 0);
  return { m, richieste, chiamate, scambio };
}
const modello = (id, scaricato = true) => ({ id, nome: id, repo: id, revisione: 'x', licenza: 'MIT', byte: 1, requisiti: '', scaricato });
const tutti = () => ['hy-mt2-18b', 'deepfilternet3', 'kim-vocal-2', 'transnetv2', 'rife-425', 'qwen3-asr-06b'].map((id) => modello(id));

// ——— il registro ———

test('il registro: id unici, stati e posti validi, ogni funzione ha un nome e una descrizione onesta', () => {
  const ids = R.FUNZIONI_AI.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'id doppi');
  for (const f of R.FUNZIONI_AI) {
    assert.ok(['pronta', 'opzionale', 'sperimentale'].includes(f.stato), f.id);
    assert.ok(['clip', 'audio', 'progetto', 'finale'].includes(f.dove), f.id);
    assert.ok(['browser', 'locale'].includes(f.motore), f.id);
    assert.ok(f.nome.length > 3 && f.descrizione.length > 20, f.id);
    assert.ok(f.peso && f.vram, `${f.id}: peso e VRAM vanno dichiarati`);
  }
});

test('le funzioni che vogliono il motore locale (o un download) non sono mai «pronte»; RIFE è sperimentale; Clear è dichiarato non permissivo', () => {
  for (const id of ['scene', 'voce-pulita', 'voce-musica', 'sottotitoli-parole', 'traduci', 'voce-realistica']) {
    const f = R.funzioneAI(id);
    assert.ok(f, id);
    assert.equal(f.motore, 'locale', id);
    assert.equal(f.stato, 'opzionale', id);
  }
  assert.equal(R.funzioneAI('rallenta').stato, 'sperimentale');
  const clear = R.funzioneAI('clear');
  assert.equal(clear.stato, 'opzionale');
  assert.match(clear.descrizione, /NON permissiva/);
  for (const id of ['sfondo', 'sottotitoli', 'rumore', 'separa', 'montage', 'aggiusta']) assert.equal(R.funzioneAI(id).stato, 'pronta', id);
});

test('ci sono tutte le funzioni AI già presenti nell\'app, e NLLB non c\'è più', () => {
  for (const id of ['sottotitoli', 'traduci', 'sfondo', 'voce', 'voce-realistica', 'aggiusta', 'rumore', 'separa', 'montage', 'segui', 'colore']) assert.ok(R.funzioneAI(id), id);
  assert.ok(!JSON.stringify(R.FUNZIONI_AI).match(/NLLB-200 di Meta|facebook\/nllb/i));
  assert.match(R.funzioneAI('traduci').descrizione, /Hy-MT2/);
  assert.match(R.funzioneAI('sfondo').descrizione, /SAM 2\.1/);
});

test('funzioniPer divide per posto; rigaStato scrive «OPZIONALE · peso · VRAM …»; collegaEsecuzione aggancia chi parte', async () => {
  const posti = ['clip', 'audio', 'progetto', 'finale'];
  assert.equal(posti.reduce((n, d) => n + R.funzioniPer(d).length, 0), R.FUNZIONI_AI.length);
  assert.ok(R.funzioniPer('finale').some((f) => f.id === 'traduci'));
  const riga = R.rigaStato(R.funzioneAI('traduci'));
  assert.match(riga, /^OPZIONALE · .*GB.* · VRAM /);
  assert.match(R.rigaStato(R.funzioneAI('rallenta')), /^SPERIMENTALE/);
  assert.match(R.rigaStato(R.funzioneAI('sfondo')), /^PRONTA/);
  // la schermata che possiede la funzione le dà il suo modo di partire
  let partito = null;
  R.collegaEsecuzione('segui', async (ctx) => { partito = ctx.clipIds; });
  await R.funzioneAI('segui').esegui({ clipIds: ['a'] });
  assert.deepEqual(partito, ['a']);
  R.collegaEsecuzione('non-esiste', async () => {}); // non rompe
  // e quelle del motore sono già agganciate dalla schermata (funzioniMotoreUI)
  for (const id of ['scene', 'rallenta', 'voce-pulita', 'voce-musica', 'sottotitoli-parole']) assert.equal(typeof R.funzioneAI(id).esegui, 'function', id);
});

test('ogni modello del motore ha la sua funzione nel registro, e gli id coincidono col catalogo', () => {
  for (const { id } of Object.values(FM.MODELLO_DI)) {
    const f = R.funzioneAI(UI.FUNZIONE_DEL_MODELLO[id]);
    assert.ok(f, id);
    assert.equal(f.motore, 'locale', id);
  }
  assert.deepEqual(Object.keys(FM.MODELLO_DI).sort(), ['pulisci', 'rallenta', 'scene', 'separa', 'traduci', 'trascrivi']);
});

// ——— la traduzione: Hy-MT2 nel motore locale ———

test('traduzione: nel browser o senza motore lo dice chiaramente (niente ripiego silenzioso, niente NLLB)', async () => {
  const nonInstallato = motoreFinto({ s: 'non-installato' });
  await assert.rejects(TR.traduttoreDelMotore(nonInstallato.m, () => true).carica(() => {}), /motore AI locale opzionale, che non è installato/);
  const nelBrowser = motoreFinto();
  await assert.rejects(TR.traduttoreDelMotore(nelBrowser.m, () => false).carica(() => {}), /solo nell'app per Windows/);
  assert.equal(nelBrowser.chiamate.length, 0, 'nel browser non si chiama niente');
  const senzaModello = motoreFinto({ modelli: [modello('hy-mt2-18b', false)] });
  await assert.rejects(TR.traduttoreDelMotore(senzaModello.m, () => true).carica(() => {}), /Hy-MT2 non è ancora sul computer/);
  assert.equal(TR.MODELLO_TRADUZIONE.id, 'hy-mt2-18b');
  assert.equal(TR.MODELLO_TRADUZIONE.licenza, 'Apache-2.0');
});

test('traduzione: un lavoro solo /traduci col codice delle lingue; righe vuote restano vuote; il napoletano è italiano', async () => {
  const f = motoreFinto({ modelli: tutti(), lavori: { '/traduci': (d) => ({ testi: d.testi.map((t) => `[${d.a}] ${t}`), lingua: d.a }) } });
  TR.impostaTraduttore(TR.traduttoreDelMotore(f.m, () => true));
  try {
    const prog = [];
    const out = await TR.traduciTesti(['Buongiorno', '', 'Come stai?'], 'nap', 'en', (t, k) => prog.push(k));
    assert.deepEqual(out, ['[en] Buongiorno', '', '[en] Come stai?']);
    const lavoro = f.richieste.find((r) => r.percorso === '/traduci');
    assert.deepEqual(lavoro.dati, { testi: ['Buongiorno', 'Come stai?'], da: 'it', a: 'en' });
    assert.ok(prog.every((x, i) => !i || x >= prog[i - 1] - 1e-9) && prog.at(-1) === 1);
    assert.deepEqual(await TR.traduciTesti(['ciao'], 'it', 'it', () => {}), ['ciao']);
    await assert.rejects(TR.traduciTesti(['x'], 'it', 'xx', () => {}), /coppia/);
    assert.equal(TR.codiceLingua('zh'), 'zh');
    assert.ok(TR.sappiamoTradurre('it', 'ja') && !TR.sappiamoTradurre('it', 'tlh'));
  } finally { TR.impostaTraduttore(null); }
});

test('traduzione: se il motore risponde male o si ferma, la frase è italiana e «fermato» resta «fermato»', async () => {
  const strano = motoreFinto({ modelli: tutti(), lavori: { '/traduci': { testi: ['solo uno'] } } });
  TR.impostaTraduttore(TR.traduttoreDelMotore(strano.m, () => true));
  try {
    await assert.rejects(TR.traduciTesti(['a', 'b'], 'it', 'en', () => {}), /in modo strano/);
    const ctrl = new AbortController(); ctrl.abort();
    await assert.rejects(TR.traduciTesti(['a'], 'it', 'en', () => {}, ctrl.signal), /fermato/);
  } finally { TR.impostaTraduttore(null); }
});

// ——— il client del motore: file a pezzi ———

test('inviaFile e scaricaFile: il file passa a pezzi e torna identico', async () => {
  const f = motoreFinto();
  const byte = new Uint8Array(MOT.PEZZO_SCAMBIO * 2 + 1234).map((_, i) => (i * 7) & 255);
  const k = [];
  await f.m.inviaFile('prova.wav', byte, (x) => k.push(x));
  assert.equal(f.richieste.filter((r) => r.percorso === '/scambio/scrivi').length, 3);
  assert.equal(f.scambio.get('prova.wav').length, byte.length);
  const indietro = await f.m.scaricaFile('prova.wav');
  assert.deepEqual(indietro, byte);
  assert.ok(k.at(-1) === 1);
  await f.m.pulisciScambio();
  assert.equal(f.scambio.size, 0);
  // un file vuoto parte lo stesso (un pezzo da zero byte)
  await f.m.inviaFile('vuoto.wav', new Uint8Array());
  assert.equal(f.scambio.get('vuoto.wav').length, 0);
});

test('lavoro del motore: fermato = il processo si termina davvero', async () => {
  const f = motoreFinto();
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(FM.lavoroMotore(f.m, '/scene', {}, () => {}, ctrl.signal), /fermato/);
});

// ——— preparare il motore e le frasi ———

test('preparaMotore: browser, motore non installato, modello mancante; non scarica niente da solo', async () => {
  await assert.rejects(FM.preparaMotore(motoreFinto().m, 'scene', () => {}, undefined, () => false), /solo nell'app per Windows/);
  await assert.rejects(FM.preparaMotore(motoreFinto({ s: 'non-installato' }).m, 'separa', () => {}, undefined, () => true), /Kim Vocal 2 gira nel motore AI locale opzionale, che non è installato/);
  const senza = motoreFinto({ modelli: [modello('transnetv2', false)] });
  await assert.rejects(FM.preparaMotore(senza.m, 'scene', () => {}, undefined, () => true), /TransNetV2 non è ancora sul computer/);
  assert.ok(!senza.richieste.some((r) => r.percorso === '/modelli/scarica'), 'non scarica da solo');
  await FM.preparaMotore(motoreFinto({ modelli: tutti() }).m, 'rallenta', () => {}, undefined, () => true).catch((e) => assert.match(String(e.message), /RIFE/));
  await FM.preparaMotore(motoreFinto({ modelli: tutti() }).m, 'scene', () => {}, undefined, () => true);
  assert.match(FM.servePerFunzione('trascrivi', 'modello'), /Qwen3-ASR/);
});

test('ScrittoreWavMemoria: un WAV a 16 bit valido, stereo, con la durata giusta', () => {
  const w = new FM.ScrittoreWavMemoria(8000, 2);
  w.aggiungi([new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0, -0.5, 0.5, -1])]);
  w.aggiungi([new Float32Array(4), new Float32Array(4)]);
  assert.equal(w.durata, 1 / 1000);
  const b = w.chiudi();
  const v = new DataView(b.buffer);
  assert.equal(String.fromCharCode(...b.subarray(0, 4)), 'RIFF');
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 8000);
  assert.equal(v.getUint32(40, true), 8 * 2 * 2);
  assert.equal(b.length, 44 + 32);
  assert.equal(v.getInt16(44 + 4, true), Math.trunc(0.5 * 0x7fff), 'campione 1 sinistro');
});

// ——— scene → marcatori ———

const FMT = { w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false };
function progettoConRipresa({ speed = 1, srcIn = 0, len = 250, path = 'C:/video/ripresa.mp4' } = {}) {
  const p = PR.newProject(FMT);
  const tv = p.tracks.find((t) => t.kind === 'video');
  const media = { id: 'm1', name: 'ripresa.mp4', type: 'video', duration: 60, t0: 0, width: 1920, height: 1080, fps: 25, rotation: 0, hasVideo: true, hasAudio: false, channels: 0, sampleRate: 0, vcodec: 'avc', acodec: '', container: 'mp4', size: 1, lastModified: 0, path };
  p.media.push(media);
  const c = PR.newClip('media', tv.id, 100, len, { media: 'm1', name: 'ripresa', srcIn, speed });
  p.clips.push(c);
  return { p, c, media };
}

test('sceneInMarcatori: secondi del file → fotogrammi della timeline, dentro la clip, senza doppioni; il primo è «Scena 2»', () => {
  const { p, c } = progettoConRipresa({ srcIn: 50 /* fotogrammi */, len: 250 });
  // srcIn nei progetti è in secondi? la funzione prende il valore com'è: qui lo usiamo in secondi
  const clip = { start: 100, len: 250, srcIn: 2, speed: 1 };
  const m = MA.sceneInMarcatori([{ t: 1, p: 0.9 }, { t: 4, p: 0.8 }, { t: 4, p: 0.7 }, { t: 2, p: 0.99 }, { t: 30, p: 0.6 }, { t: 12, p: 0.9 }], clip, p.rate);
  // t=4 → 100 + (4-2)*25 = 150; t=12 → 100+250 = 350 (fuori: la clip finisce a 350); t=2 → 100 (all'inizio: niente da tagliare); t=1 prima della clip
  assert.deepEqual(m.map((x) => x.f), [150]);
  assert.deepEqual(m.map((x) => x.name), ['Scena 2']);
  assert.equal(m[0].color, MA.COLORE_SCENA);
  // velocità doppia: lo stesso tratto di file dura la metà
  const veloce = MA.sceneInMarcatori([{ t: 4, p: 1 }], { start: 100, len: 125, srcIn: 2, speed: 2 }, p.rate);
  assert.equal(veloce[0].f, 125);
  assert.ok(c);
});

test('mettiMarcatoriScena rifà solo i suoi marcatori, e tagliaAlleScene li trasforma in tagli veri (annullabili con un solo passo)', () => {
  const { p, c } = progettoConRipresa({ srcIn: 0, len: 250 });
  p.markers.push({ id: 'mio', f: 120, name: 'Il mio segno', color: '#fff' });
  const n = MA.mettiMarcatoriScena(p, c.id, [{ t: 2, p: 0.9 }, { t: 5, p: 0.8 }]);
  assert.equal(n, 2);
  assert.deepEqual(p.markers.map((m) => m.name), ['Il mio segno', 'Scena 2', 'Scena 3'], 'ordinati per fotogramma, il segno tuo resta');
  // una seconda prova sostituisce le scene, non le accumula
  assert.equal(MA.mettiMarcatoriScena(p, c.id, [{ t: 6, p: 0.9 }]), 1);
  assert.equal(p.markers.filter((m) => m.name.startsWith('Scena ')).length, 1);
  assert.ok(p.markers.some((m) => m.id === 'mio'));
  MA.mettiMarcatoriScena(p, c.id, [{ t: 2, p: 0.9 }, { t: 5, p: 0.8 }]);
  const prima = p.clips.filter((x) => x.kind === 'media').length;
  const tagli = MA.tagliaAlleScene(p, c.id);
  assert.equal(tagli, 2);
  assert.equal(p.clips.filter((x) => x.kind === 'media').length, prima + 2);
  const sorted = p.clips.filter((x) => x.kind === 'media').sort((a, b) => a.start - b.start);
  assert.deepEqual(sorted.map((x) => x.start), [100, 150, 225]);
  assert.equal(sorted.reduce((s, x) => s + x.len, 0), 250, 'nessun fotogramma perso');
  assert.equal(MA.tagliaAlleScene(p, 'non-esiste'), 0);
});

// ——— parole con i tempi → righe ———

test('righeDaParole: pausa, lunghezza e fine frase chiudono la riga; i tempi sono in fotogrammi e crescono', () => {
  const parole = [
    { t: 'Ciao', da: 0, a: 0.4 }, { t: 'a', da: 0.45, a: 0.6 }, { t: 'tutti.', da: 0.65, a: 1.1 },
    { t: 'Oggi', da: 3, a: 3.4 }, { t: 'parliamo', da: 3.45, a: 4 }, { t: 'di', da: 4.05, a: 4.2 }, { t: 'montaggio', da: 4.25, a: 5 },
    { t: '  ', da: 6, a: 6.1 }, { t: 'NaN', da: Number.NaN, a: 1 },
  ];
  const p = PR.newProject(FMT);
  const righe = MA.righeDaParole(parole, p);
  assert.deepEqual(righe.map((r) => r.testo), ['Ciao a tutti.', 'Oggi parliamo di montaggio']);
  assert.equal(righe[0].da, 0);
  assert.equal(righe[0].a, 28, '1,1 s a 25 fps');
  assert.ok(righe[1].da === 75 && righe[1].a === 125);
  assert.ok(righe.every((r) => r.id && r.a > r.da));
  // una riga troppo lunga si spezza
  const lunghe = Array.from({ length: 30 }, (_, i) => ({ t: 'parolona' + i, da: i * 0.3, a: i * 0.3 + 0.25 }));
  assert.ok(MA.righeDaParole(lunghe, p).length > 3);
  // il cinese non vuole spazi
  const zh = MA.righeDaParole([{ t: '你好', da: 0, a: 0.5 }, { t: '世界', da: 0.5, a: 1 }], p);
  assert.equal(zh[0].testo, '你好世界');
  assert.deepEqual(MA.righeDaParole([], p), []);
});

test('dividiInTratti: tratti pari che coprono tutto; niente tratti se la durata non vale', () => {
  assert.deepEqual(MA.dividiInTratti(25 * 60, 600).length, 3);
  const t = MA.dividiInTratti(1300, 600);
  assert.equal(t[0][0], 0); assert.equal(t.at(-1)[1], 1300);
  assert.ok(t.every((x, i) => !i || x[0] === t[i - 1][1]));
  assert.ok(t.every(([a, b]) => b - a <= 600));
  assert.deepEqual(MA.dividiInTratti(0, 600), []);
  assert.deepEqual(MA.dividiInTratti(10, 600), [[0, 10]]);
});

test('trattiDaPunti: i punti di taglio nel silenzio diventano coppie senza buchi', () => {
  assert.deepEqual(MA.trattiDaPunti([0, 598.5, 1203, 1300]), [[0, 598.5], [598.5, 1203], [1203, 1300]]);
  assert.deepEqual(MA.trattiDaPunti([0, 10]), [[0, 10]]);
  assert.deepEqual(MA.trattiDaPunti([0]), []);
  assert.deepEqual(MA.trattiDaPunti([0, 5, 5, Number.NaN, 9]), [[0, 5], [5, 9]]);
});

test('i marcatori «Scena del bacio» fatti a mano non si toccano e non diventano tagli', () => {
  const { p, c } = progettoConRipresa({ srcIn: 0, len: 250 });
  p.markers.push({ id: 'mio', f: 130, name: 'Scena del bacio', color: '#fff' });
  MA.mettiMarcatoriScena(p, c.id, [{ t: 2, p: 0.9 }]);
  MA.mettiMarcatoriScena(p, c.id, [{ t: 6, p: 0.9 }]);
  assert.ok(p.markers.some((m) => m.id === 'mio'), 'il tuo segno resta anche rifacendo le scene');
  assert.equal(MA.tagliaAlleScene(p, c.id), 1, 'solo il marcatore «Scena 2» diventa un taglio');
});

test('pianoRallenta: fotogrammi e durata della clip nuova', () => {
  const p = MA.pianoRallenta(2, 2, 25, { num: 25, den: 1 });
  assert.equal(p.origine, 51);
  assert.equal(p.nuovi, 101);
  assert.equal(p.lunghezza, 100, '2 s × 2 a 25 fps');
  assert.equal(MA.pianoRallenta(2, 4, 25, { num: 25, den: 1 }).lunghezza, 200);
  assert.ok(MA.pianoRallenta(-1, 2, 25, { num: 25, den: 1 }).lunghezza >= 1);
});

// ——— il giro intero di una funzione con un motore finto, dal Centro attività ———

beforeEach(() => { AT.azzeraAttivita?.(); });

test('trovaScene: passa dal Centro attività, il motore legge il file dal disco, i marcatori sono sul banco e Ctrl+Z li toglie', async () => {
  const { p, c } = progettoConRipresa({ srcIn: 0, len: 250 });
  ST.store.load(p);
  const f = motoreFinto({ modelli: tutti(), lavori: { '/scene': { tagli: [{ t: 2, p: 0.9 }, { t: 5, p: 0.8 }], fps: 25, durata: 10, soglia: 0.5 } } });
  const n = await FM.trovaScene(c.id, 0.5, f.m);
  assert.equal(n, 2);
  assert.deepEqual(ST.store.doc.markers.map((m) => m.name), ['Scena 2', 'Scena 3']);
  const lavoro = f.richieste.find((r) => r.percorso === '/scene');
  assert.equal(lavoro.dati.file, 'C:/video/ripresa.mp4');
  assert.equal(lavoro.dati.soglia, 0.5);
  assert.equal(AT.attivitaFinite().length, 1);
  assert.match(AT.attivitaFinite()[0].titolo, /Tagli automatici/);
  assert.equal(ST.store.doUndo(), 'Tagli automatici (scene)');
  assert.equal(ST.store.doc.markers.length, 0, 'Ctrl+Z toglie i marcatori');
});

test('trovaScene: senza percorso sul disco o con la clip sbagliata dice cosa fare; il motore spento non parte', async () => {
  const { p, c } = progettoConRipresa({ path: '' });
  ST.store.load(p);
  await assert.rejects(FM.trovaScene(c.id, 0.5, motoreFinto({ modelli: tutti() }).m), /legge i video dal disco/);
  await assert.rejects(FM.trovaScene('non-esiste', 0.5, motoreFinto().m), /Non trovo la clip/);
  const { p: p2, c: c2 } = progettoConRipresa();
  ST.store.load(p2);
  await assert.rejects(FM.trovaScene(c2.id, 0.5, motoreFinto({ s: 'non-installato' }).m), /non è installato/);
});

test('rallentaClip: più di 12 secondi non si fa (frase chiara) e SPERIMENTALE', async () => {
  const { p, c } = progettoConRipresa({ len: 25 * 20 });
  ST.store.load(p);
  await assert.rejects(FM.rallentaClip(c.id, 2, motoreFinto({ modelli: tutti() }).m), /al massimo 12 secondi/);
  assert.equal(FM.SECONDI_MASSIMI_RALLENTA, 12);
});

// ——— Clear si può spegnere ———

test('Clear: acceso di partenza, si spegne dal Centro AI e allora non si carica mai e dice perché', async () => {
  memoriaFinta();
  assert.equal(CL.clearAttivo(), true);
  CL.impostaClearFinto({ enhance: async (c) => ({ channels: [new Float32Array(2)], sampleRate: 48000, measuredLUFS: null, measuredTruePeakDBFS: null }), dispose() {} });
  const acceso = await CL.voceDaPodcast([new Float32Array(2)], { forza: 1, lufs: -19 });
  assert.equal(acceso.length, 1);
  CL.impostaClearAttivo(false);
  assert.equal(CL.clearAttivo(), false);
  await assert.rejects(CL.voceDaPodcast([new Float32Array(2)], { forza: 1, lufs: -19 }), /Clear è spento/);
  CL.impostaClearAttivo(true);
  assert.equal(CL.clearAttivo(), true);
  CL.impostaClearFinto(null);
});

// ——— il server del motore, con modelli finti (serve Python) ———

test('server del motore (Python, modelli finti): catalogo, lavori, scambio e HTTP', (t) => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const py = ['python', 'python3', 'py'].find((x) => spawnSync(x, ['--version']).status === 0);
  if (!py) { t.skip('Python non c\'è su questo computer'); return; }
  for (const f of ['motore_ai_server.py', 'motore_ai_server_nuove.py']) {
    const r = spawnSync(py, ['-I', path.join(qui, f)], { encoding: 'utf-8', cwd: path.resolve(qui, '../..') });
    assert.equal(r.status, 0, `${f}\n${r.stdout}\n${r.stderr}`);
  }
});
