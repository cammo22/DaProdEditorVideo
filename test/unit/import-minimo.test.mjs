// Import e riapertura «solo il minimo» (§3.1 della specifica): nessuna riga nel Centro attività, nessuna copia leggera
// scritta sul disco, nessun controllo di velocità, anche con le preferenze vecchie «Copie leggere: sempre» e
// dpv-normalizza = 'si'. Poi le preparazioni a mano: nascono «da avviare», partono solo con Avvia, niente doppioni,
// pausa ai confini della forma d'onda, annulla che butta il parziale.
import { test, before, beforeEach } from 'node:test';
import { AudioBufferSink, CanvasSink } from 'mediabunny';
import assert from 'node:assert/strict';
import { ambienteBrowser, carica, discoFinto, dormi, finche, memoriaFinta, videoDiProva, wav } from './_aiuti.mjs';

ambienteBrowser();
// le preferenze di chi aveva la 1.5.7 con tutto acceso
const memoria = memoriaFinta({ 'dpv-proxy': 'sempre', 'dpv-normalizza': 'si' });
const disco = discoFinto();
const AT = await carica('attivita');
const L = await carica('libreria');
L.impostaPreparazioneAutomatica(false); // questo file prova l'import minimo: la preparazione automatica (1.6.0) ha le sue prove
const PX = await carica('proxy');
const video = videoDiProva();

const doc = { media: [], clips: [] };
L.impostaCercaMedia((id) => doc.media.find((m) => m.id === id));

const nulla = () => ({ corso: AT.attivitaInCorso().length, finite: AT.attivitaFinite().length, daAvviare: AT.attivitaDaAvviare().length, scritti: disco.scritti.length });

before(async () => {
  AT.azzeraAttivita();
  const file = [];
  for (let i = 0; i < 16; i++) file.push({ name: `voce ${i}.wav`, file: new File([wav(2 + (i % 3), 220 + i * 20)], `voce ${i}.wav`, { type: 'audio/wav' }) });
  file.push({ name: 'lunga.wav', file: new File([wav(40)], 'lunga.wav', { type: 'audio/wav' }) });
  if (video) { file.push({ name: 'clip-hd.mp4', file: video.hd }, { name: 'clip-sd.mov', file: video.sd }); file.push({ name: 'clip-hd copia.mp4', file: new File([video.hd], 'clip-hd copia.mp4') }); }
  for (const f of file) {
    const r = await L.importa(f);
    assert.ok(!('errore' in r), `${f.name}: ${r.errore}`);
    doc.media.push(r.item);
  }
  await dormi(50); // le letture dalla memoria delle misure sono asincrone: si dà loro il tempo
});

beforeEach(() => { AT.impostaLimiti({ leggero: 2, pesante: 1 }); });

test('le preferenze vecchie si leggono e non si cancellano', () => {
  assert.equal(PX.modoProxy(), 'sempre');
  assert.equal(memoria.get('dpv-proxy'), 'sempre');
  assert.equal(memoria.get('dpv-normalizza'), 'si');
});

test(`import di ${17 + (video ? 3 : 0)} file: solo metadati, file subito usabili, NIENTE nel Centro attività né sul disco`, () => {
  assert.ok(doc.media.length >= 17);
  for (const m of doc.media) {
    const r = L.mediaRT(m.id);
    assert.equal(r.stato, 'ok', m.name);
    assert.ok(m.duration > 0, m.name);
    assert.equal(r.peaks, undefined, `${m.name}: forma d'onda non calcolata da sola`);
    assert.equal(r.colore, undefined, `${m.name}: colore non misurato da solo`);
    assert.equal(r.proxy, undefined);
    assert.ok(r.proxyStato === undefined, `${m.name}: proxyStato ${r.proxyStato}`);
    assert.equal(r.velocita, undefined, `${m.name}: velocità non controllata da sola`);
  }
  assert.deepEqual(nulla(), { corso: 0, finite: 0, daAvviare: 0, scritti: 0 });
});

test('i video si leggono dall\'originale (metadati giusti, decodificabili)', { skip: !video && 'ffmpeg non c\'è' }, () => {
  const hd = doc.media.find((m) => m.name === 'clip-hd.mp4');
  assert.equal(hd.width, 1920); assert.equal(hd.height, 1080); assert.equal(hd.type, 'video');
  assert.ok(Math.abs(hd.duration - 3) < 0.1);
  assert.ok(L.mediaRT(hd.id).vDecodable);
  const sd = doc.media.find((m) => m.name === 'clip-sd.mov');
  assert.ok(sd.hasAudio && sd.hasVideo);
});

test('riapertura (apri di tutti i file, come riapriMedia): ancora niente lavori né scritture', async () => {
  for (const m of doc.media) {
    const vecchio = L.mediaRT(m.id);
    const r = await L.apri(m, { file: vecchio.file });
    assert.equal(r.stato, 'ok', m.name);
  }
  await dormi(50);
  assert.deepEqual(nulla(), { corso: 0, finite: 0, daAvviare: 0, scritti: 0 });
});

test('mettere le clip in timeline non fa partire niente (non c\'è più risvegliaProxy)', async () => {
  assert.equal(L.risvegliaProxy, undefined);
  L.impostaUsoMedia(() => 3); // ogni file usato da 3 clip
  await dormi(30);
  assert.deepEqual(nulla(), { corso: 0, finite: 0, daAvviare: 0, scritti: 0 });
  L.impostaUsoMedia(() => 0);
});

test('stato delle preparazioni: solo letture, e dice cosa si può fare', () => {
  const w = doc.media.find((m) => m.name === 'voce 0.wav');
  const s = L.statoPreparazioni(w.id);
  assert.equal(s.picchi, 'non-fatta');
  assert.equal(s.proxy, 'non-serve', 'un audio non ha copia leggera');
  assert.equal(s.colore, 'non-serve');
  assert.equal(s.locandina, 'non-serve');
  assert.equal(s.velocita, 'non-serve', 'senza il controllo registrato da progetti.ts non si offre');
  if (video) {
    const hd = doc.media.find((m) => m.name === 'clip-hd.mp4');
    const v = L.statoPreparazioni(hd.id);
    assert.equal(v.proxy, 'non-fatta'); assert.equal(v.colore, 'non-fatta'); assert.equal(v.picchi, 'non-serve');
  }
  assert.deepEqual(nulla(), { corso: 0, finite: 0, daAvviare: 0, scritti: 0 });
});

test('«Calcola forma d\'onda» per tutti: righe da avviare, niente parte; Avvia tutti → fatte, una volta sola', async () => {
  const wavs = doc.media.filter((m) => m.name.startsWith('voce ')).map((m) => m.id);
  const p = L.proponiPreparazioni(wavs, 'picchi');
  assert.equal(p.length, wavs.length);
  assert.equal(AT.attivitaDaAvviare().length, wavs.length);
  assert.equal(AT.attivitaInCorso().length, 0);
  assert.equal(L.proponiPreparazione(wavs[0], 'picchi'), null, 'niente doppioni');
  assert.equal(L.statoPreparazione(wavs[0], 'picchi'), 'da-avviare');
  await dormi(30);
  assert.equal(L.mediaRT(wavs[0]).peaks, undefined, 'non è partito niente');
  assert.equal(AT.avviaTutte({ gruppo: 'picchi' }), wavs.length);
  assert.equal(L.statoPreparazione(wavs[0], 'picchi'), 'in-corso');
  const esiti = await Promise.all(p.map((x) => x.esito));
  assert.ok(esiti.every((x) => x === true), JSON.stringify(esiti));
  for (const id of wavs) {
    const r = L.mediaRT(id);
    assert.equal(L.statoPreparazione(id, 'picchi'), 'fatta');
    const max = r.peaks.reduce((a, b) => Math.max(a, b), 0);
    assert.ok(max > 0.4 && max < 0.6, `picco ${max}`);
  }
  assert.equal(AT.attivitaFinite()[0].messaggio.startsWith(`${wavs.length} in`), true, AT.attivitaFinite()[0].messaggio);
  assert.equal(L.proponiPreparazione(wavs[0], 'picchi'), null, 'già fatta: non si rifà');
});

test('forma d\'onda in pausa ai confini: si ferma, la corsia è libera, riprende e finisce uguale', async () => {
  const lunga = doc.media.find((m) => m.name === 'lunga.wav');
  const p = L.proponiPreparazione(lunga.id, 'picchi', { avvia: true });
  assert.ok(p);
  const r = L.mediaRT(lunga.id);
  await finche(() => r.peaksDone > 0, 5000);
  const riga = AT.attivitaInCorso().find((x) => x.gruppo === 'picchi');
  const esito = AT.pausaRiga(riga.id);
  assert.ok(esito === 'dopo-il-pezzo' || esito === 'in-pausa', esito);
  await finche(() => riga.stato === 'pausa', 3000);
  const fermo = r.peaksDone;
  await dormi(80);
  assert.equal(r.peaksDone, fermo, 'in pausa non va avanti');
  assert.ok(fermo < r.peaks.length, 'si è fermato a metà');
  // un altro lavoro leggero passa mentre è in pausa
  const altro = await AT.inCoda({ corsia: 'leggero', titolo: 'Prova', categoria: 'altro' }, async () => 'passato');
  assert.equal(altro, 'passato');
  AT.riprendiRiga(riga.id);
  assert.equal(await p.esito, true);
  assert.equal(r.peaksDone, r.peaks.length);
});

test('annullare la forma d\'onda a metà butta il parziale (torna «non fatta»)', async () => {
  const lunga = doc.media.find((m) => m.name === 'lunga.wav');
  // la si rifà su un file nuovo (stesso contenuto, altro id)
  const f = L.mediaRT(lunga.id).file;
  const n = await L.importa({ name: 'lunga 2.wav', file: new File([f], 'lunga 2.wav') });
  doc.media.push(n.item);
  const p = L.proponiPreparazione(n.item.id, 'picchi', { avvia: true });
  const r = L.mediaRT(n.item.id);
  await finche(() => r.peaksDone > 0, 5000);
  AT.annullaRiga(AT.attivitaInCorso().find((x) => x.gruppo === 'picchi').id);
  assert.equal(await p.esito, null);
  assert.equal(r.peaks, undefined);
  assert.equal(L.statoPreparazione(n.item.id, 'picchi'), 'non-fatta');
});

test('preparaOra (per una funzione chiesta adesso): parte subito per chi non ce l\'ha e aspetta', async () => {
  const n = await L.importa({ name: 'serve.wav', file: new File([wav(2)], 'serve.wav') });
  doc.media.push(n.item);
  const fatte = doc.media.find((m) => m.name === 'voce 2.wav').id;
  const ok = await L.preparaOra([n.item.id, fatte], 'picchi');
  assert.deepEqual(ok.sort(), [n.item.id, fatte].sort());
  assert.equal(AT.attivitaDaAvviare().length, 0);
});

test('chiudere un file (o cambiare progetto) scarta le sue righe da avviare', async () => {
  const w = doc.media.find((m) => m.name === 'voce 1.wav');
  const n = await L.importa({ name: 'altra.wav', file: new File([wav(1)], 'altra.wav') });
  doc.media.push(n.item);
  const p = L.proponiPreparazione(n.item.id, 'picchi');
  assert.ok(p);
  L.chiudi(n.item.id);
  assert.equal(await p.esito, null);
  assert.equal(AT.attivitaDaAvviare().length, 0);
  // cambio progetto: le righe da avviare spariscono
  const n2 = await L.importa({ name: 'altra2.wav', file: new File([wav(1)], 'altra2.wav') });
  doc.media.push(n2.item);
  const p2 = L.proponiPreparazione(n2.item.id, 'picchi');
  AT.cambiaProgetto();
  assert.equal(await p2.esito, null);
  assert.equal(L.statoPreparazione(w.id, 'picchi'), 'fatta');
});

test('copia leggera: si offre (modo «sempre»), nasce da avviare, annullata non scrive niente sul disco', { skip: !video && 'ffmpeg non c\'è' }, async () => {
  const hd = doc.media.find((m) => m.name === 'clip-hd.mp4');
  const r = L.mediaRT(hd.id);
  const p = L.proponiPreparazione(hd.id, 'proxy');
  assert.ok(p);
  assert.equal(r.proxyStato, 'manuale');
  assert.equal(L.statoPreparazione(hd.id, 'proxy'), 'da-avviare');
  assert.equal(AT.attivitaDaAvviare()[0].capacita.pausa, 'vera');
  AT.fermaRiga(p.riga.id);
  assert.equal(await p.esito, null);
  assert.equal(r.proxyStato, undefined);
  assert.equal(disco.scritti.length, 0);
});

test('copia leggera avviata senza codificatore (Node): finisce in errore, nessun file scritto, Riprova disponibile', { skip: !video && 'ffmpeg non c\'è' }, async () => {
  const hd = doc.media.find((m) => m.name === 'clip-hd copia.mp4');
  const p = L.proponiPreparazione(hd.id, 'proxy', { avvia: true });
  assert.ok(p);
  await p.esito;
  const r = L.mediaRT(hd.id);
  assert.ok(r.proxyStato === 'errore' || r.proxyStato === 'no', r.proxyStato);
  assert.equal(disco.scritti.length, 0);
});

test('Errore decoder forma d’onda: mai dichiarare completa la misura parziale', async () => {
  const m = await L.importa({ name: 'errore.wav', file: new File([wav(1)], 'errore.wav') }); doc.media.push(m.item);
  const originale = AudioBufferSink.prototype.buffers;
  AudioBufferSink.prototype.buffers = async function* () { throw Error('decoder rotto'); };
  try {
    const p = L.proponiPreparazione(m.item.id, 'picchi', { avvia: true });
    assert.equal(await p.esito, null);
    assert.equal(L.mediaRT(m.item.id).peaks, undefined);
    assert.equal(L.statoPreparazione(m.item.id, 'picchi'), 'errore');
  } finally { AudioBufferSink.prototype.buffers = originale; L.chiudi(m.item.id); }
});

test('Errore decoder colore: Attività mostra errore e permette Riprova', { skip: !video && 'ffmpeg non c\'è' }, async () => {
  const m = await L.importa({ name: 'colore-rotto.mp4', file: video.hd }); doc.media.push(m.item);
  const originale = CanvasSink.prototype.canvasesAtTimestamps;
  CanvasSink.prototype.canvasesAtTimestamps = async function* () { throw Error('video rotto'); };
  try {
    const p = L.proponiPreparazione(m.item.id, 'colore', { avvia: true });
    assert.equal(await p.esito, null);
    assert.equal(L.statoPreparazione(m.item.id, 'colore'), 'errore');
    assert.equal(L.mediaRT(m.item.id).colore, undefined);
  } finally { CanvasSink.prototype.canvasesAtTimestamps = originale; L.chiudi(m.item.id); }
});

test('Copie leggere = Mai: non si offre per niente', { skip: !video && 'ffmpeg non c\'è' }, () => {
  PX.impostaModoProxy('mai');
  const sd = doc.media.find((m) => m.name === 'clip-sd.mov');
  assert.equal(L.statoPreparazione(sd.id, 'proxy'), 'non-serve');
  assert.equal(L.proponiPreparazione(sd.id, 'proxy'), null);
  PX.impostaModoProxy('sempre');
});

test('colore automatico acceso ma non misurato: senzaColoreMisurato lo dice (monitor ed export restano neutri e uguali)', { skip: !video && 'ffmpeg non c\'è' }, async () => {
  const P = await carica('progetto');
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  const sd = doc.media.find((m) => m.name === 'clip-sd.mov');
  p.media.push(sd);
  const traccia = p.tracks.find((t) => t.kind === 'video').id;
  p.clips.push(P.newClip('media', traccia, 0, 50, { media: sd.id, name: sd.name }));
  assert.equal(P.masterDi(p).auto, true, 'nei progetti il colore automatico è acceso di partenza');
  assert.deepEqual(L.senzaColoreMisurato(p), [sd.id]);
});
