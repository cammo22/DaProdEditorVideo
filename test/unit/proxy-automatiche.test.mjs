// Metadati e code vere, senza aprire l'app, usare encoder o installare ffmpeg.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Output, WebMOutputFormat } from 'mediabunny';
import { ambienteBrowser, carica, discoFinto, dormi, finche, memoriaFinta } from './_aiuti.mjs';

ambienteBrowser();
const memoria = memoriaFinta();
const disco = discoFinto();
const PX = await carica('proxy');
const L = await carica('libreria');
const AT = await carica('attivita');
L.impostaPreparazioneAutomatica(false);
const aperti = [];
assert.equal(PX.copieLeggereAutomatiche(), true, 'accesa al primo avvio');

beforeEach(() => {
  AT.azzeraAttivita(); AT.pausaGlobale(true);
  PX.impostaModoProxy('auto'); PX.impostaCopieLeggereAutomatiche(true);
});
afterEach(() => {
  for (const id of aperti.splice(0)) L.chiudi(id);
  AT.azzeraAttivita();
});

const normale = { type: 'video', width: 1920, height: 1080, vcodec: 'avc' };
test('Soglie: Full HD orizzontale e verticale restano leggeri, oltre si prepara la copia', () => {
  assert.equal(PX.videoPesante(normale), false);
  assert.equal(PX.videoPesante({ ...normale, width: 1080, height: 1920 }), false);
  for (const [width, height] of [[1921, 1080], [1920, 1081], [3840, 2160], [2160, 3840]]) {
    assert.equal(PX.videoPesante({ ...normale, width, height }), true, `${width}×${height}`);
  }
  assert.equal(PX.videoPesante({ ...normale, type: 'image', width: 6000 }), false);
});

test('Soglie: 10 bit, HEVC, ProRes, AV1 e bitrate alto', () => {
  assert.equal(PX.videoPesante(normale, { bit: 8 }), false);
  assert.equal(PX.videoPesante(normale, { bit: 10 }), true);
  assert.equal(PX.videoPesante(normale, { bit: 12 }), true);
  for (const codec of ['hevc', 'hvc1.2.4.L153.B0', 'hev1', 'prores', 'apch', 'apcn', 'apcs', 'apco', 'ap4h', 'ap4x', 'av1', 'av01.0.08M.10', 'vp09.02.10.10', 'avc1.6e0033']) {
    assert.equal(PX.videoPesante(normale, { codec }), true, codec);
  }
  assert.equal(PX.videoPesante(normale, { codec: 'vp09.00.10.08' }), false);
  assert.equal(PX.videoPesante(normale, { bitrate: PX.SOGLIE_PROXY.bitrate }), false);
  assert.equal(PX.videoPesante(normale, { bitrate: PX.SOGLIE_PROXY.bitrate + 1 }), true);
  assert.equal(PX.videoPesante(normale, { distanzaChiavi: 2 }), false);
  assert.equal(PX.videoPesante(normale, { distanzaChiavi: 2.01 }), true);
});

test('La preferenza automatica è separata dalla vecchia scelta e si conserva', () => {
  PX.impostaModoProxy('sempre'); PX.impostaCopieLeggereAutomatiche(false);
  assert.equal(PX.copieLeggereAutomatiche(), false);
  assert.equal(memoria.get('dpv-proxy-automatiche'), 'no');
  assert.equal(memoria.get('dpv-proxy'), 'sempre');
  PX.impostaCopieLeggereAutomatiche(true);
  assert.equal(memoria.get('dpv-proxy-automatiche'), 'si');
});

// Un WebM con intestazioni e tempi veri: i pacchetti finti bastano per provare i metadati, non si decodificano.
async function video(width = 3840, height = 2160) {
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new EncodedVideoPacketSource('vp8');
  output.addVideoTrack(source);
  await output.start();
  const dati = new Uint8Array([0x10, 0, 0, 0x9d, 1, 0x2a, width & 255, width >> 8, height & 255, height >> 8]);
  for (let i = 0; i < 90; i++) await source.add(new EncodedPacket(dati, 'key', i / 30, 1 / 30), i ? undefined : { decoderConfig: { codec: 'vp8', codedWidth: width, codedHeight: height } });
  await output.finalize();
  return new File([target.buffer], `ripresa-${width}.webm`, { type: 'video/webm' });
}
async function importa(file) {
  const r = await L.importa({ name: file.name, file });
  assert.ok(!('errore' in r), r.errore);
  aperti.push(r.item.id);
  return r;
}

test('Import 4K: torna subito usabile, proxy in coda senza Avvia, nessun dato nel progetto', async () => {
  const r = await importa(await video());
  const prima = JSON.stringify(r.item);
  await finche(() => r.rt.proxyStato === 'coda');
  assert.equal(r.rt.stato, 'ok');
  assert.equal(r.rt.vDecodable, true);
  assert.equal(r.rt.proxy, undefined);
  assert.equal(AT.attivitaDaAvviare().length, 0);
  assert.equal(AT.attivitaInCorso()[0].categoria, 'proxy');
  assert.equal(JSON.stringify(r.item), prima);
  assert.equal(disco.scritti.length, 0);
});

test('Il proxy automatico lascia passare prima i lavori chiesti a mano', async () => {
  const r = await importa(await video());
  await finche(() => r.rt.proxyStato === 'coda');
  const ordine = [];
  const stacca = PX.quandoProxy(() => { if (r.rt.proxyStato === 'lavoro') ordine.push('proxy'); });
  const manuale = AT.inCoda({ corsia: 'pesante', titolo: 'Scelta dell’utente', categoria: 'altro', priorita: 0 }, async () => { ordine.push('manuale'); });
  try {
    AT.pausaGlobale(false);
    await manuale;
    await finche(() => ordine.includes('proxy'));
    assert.equal(ordine[0], 'manuale');
  } finally { stacca(); }
});

test('Automatiche spente, Mai, video leggero anche con Sempre: nessuna copia in coda', async () => {
  PX.impostaCopieLeggereAutomatiche(false);
  const a = await importa(await video());
  await dormi(20);
  assert.equal(a.rt.proxyStato, undefined);
  PX.impostaCopieLeggereAutomatiche(true); PX.impostaModoProxy('mai');
  const b = await importa(await video());
  await dormi(20);
  assert.equal(b.rt.proxyStato, undefined);
  PX.impostaModoProxy('sempre');
  const c = await importa(await video(640, 360));
  await dormi(20);
  assert.equal(c.rt.proxyStato, undefined);
  assert.equal(AT.attivitaInCorso().length, 0);
});

test('Riapertura e sola descrizione non avviano proxy, chiudere un import annulla la coda', async () => {
  const file = await video();
  const descrizione = await L.importa({ name: file.name, file }, { soloDescrizione: true });
  assert.ok(!('errore' in descrizione), descrizione.errore);
  const prima = JSON.stringify(descrizione.item);
  const rt = await L.apri(descrizione.item, { file }); aperti.push(rt.id);
  await dormi(20);
  assert.equal(rt.proxyStato, undefined);
  assert.equal(JSON.stringify(descrizione.item), prima);
  assert.equal(AT.attivitaInCorso().length, 0);
  const nuovo = await importa(file);
  await finche(() => nuovo.rt.proxyStato === 'coda');
  L.chiudi(nuovo.item.id);
  await finche(() => AT.attivitaInCorso().length === 0);
});
