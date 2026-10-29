// L'esportazione, la parte pura: da preset a impostazioni, adattamento della forma, stima del peso, e l'ordine della coda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';

const E = await carica('esportazione');
const C = await carica('codaExport');
const TUTTI = ['avc', 'hevc', 'vp9', 'av1', 'vp8'];
const FHD25 = { w: 1920, h: 1080, fps: 25 };

test('preset YouTube 1080p: 1920x1080, MP4 H.264, i fotogrammi del progetto', () => {
  const i = E.impostazioni({ preset: 'yt1080' }, FHD25, TUTTI);
  assert.deepEqual([i.formato, i.w, i.h, i.fps, i.passo, i.codec], ['mp4', 1920, 1080, 25, 1, 'avc']);
  assert.equal(i.geometria, null, 'stessa forma del progetto: niente bande');
  assert.equal(i.adatta, null);
  assert.equal(i.audioBps, 192000);
});

test('i fotogrammi non salgono oltre il tetto del preset, solo saltandone di interi (60 -> 30), mai inventati', () => {
  assert.equal(E.passoFps(60, 30), 2);
  assert.equal(E.passoFps(50, 30), 1, '50 fps non e multiplo di 30: si lasciano come sono');
  assert.equal(E.passoFps(25, 30), 1);
  assert.equal(E.passoFps(120, 30), 4);
  const i = E.impostazioni({ preset: 'verticale' }, { w: 1920, h: 1080, fps: 60 }, TUTTI);
  assert.equal(i.passo, 2);
  assert.equal(i.fps, 30);
});

test('verticale 9:16 da un progetto 16:9: bande di partenza, ritaglio se lo chiede', () => {
  const b = E.impostazioni({ preset: 'verticale' }, FHD25, TUTTI);
  assert.deepEqual([b.w, b.h, b.adatta], [1080, 1920, 'bande']);
  // l'immagine intera (1080 di larghezza) al centro, bande sopra e sotto
  assert.equal(b.geometria.cw, 1080);
  assert.equal(b.geometria.ch, 608);
  assert.equal(b.geometria.dx, 0);
  assert.equal(b.geometria.dy, Math.round((1920 - 608) / 2));
  const r = E.impostazioni({ preset: 'verticale', adatta: 'ritaglio' }, FHD25, TUTTI);
  assert.equal(r.adatta, 'ritaglio');
  assert.equal(r.geometria.ch, 1920, 'riempie l\'altezza');
  assert.equal(r.geometria.cw, 3414);
  assert.ok(r.geometria.dx < 0, 'si taglia ai lati');
  assert.equal(r.geometria.dx, Math.round((1080 - 3414) / 2));
});

test('quadrato 1:1, forme uguali e il testo che spiega cosa succede', () => {
  const g = E.adattamento(1920, 1080, 1080, 1080, 'ritaglio');
  assert.equal(g.ch, 1080);
  assert.equal(g.cw, 1920);
  assert.equal(E.adattamento(1920, 1080, 3840, 2160, 'bande'), null);
  assert.match(E.testoAdattamento(1920, 1080, 1080, 1920, 'bande'), /16:9.*9:16.*bande nere sopra e sotto/);
  assert.match(E.testoAdattamento(1920, 1080, 1080, 1080, 'ritaglio'), /si taglia ai lati.*56%/);
  assert.match(E.testoAdattamento(1920, 1080, 3840, 2160, 'bande'), /già questa forma/);
  assert.equal(E.proporzioneTesto(1080, 1920), '9:16');
  assert.equal(E.proporzioneTesto(1000, 1000), '1:1');
});

test('WhatsApp: il lato lungo non supera 1280 e la forma resta quella del progetto; master: come il progetto', () => {
  const w = E.impostazioni({ preset: 'whatsapp' }, FHD25, TUTTI);
  assert.deepEqual([w.w, w.h, w.codec, w.geometria], [1280, 720, 'avc', null]);
  const v = E.impostazioni({ preset: 'whatsapp' }, { w: 1080, h: 1920, fps: 30 }, TUTTI);
  assert.deepEqual([v.w, v.h], [720, 1280]);
  const m = E.impostazioni({ preset: 'master' }, { w: 2560, h: 1440, fps: 24 }, TUTTI);
  assert.deepEqual([m.w, m.h], [2560, 1440]);
});

test('solo audio: WAV, niente video ne codec, peso = 192 KB al secondo', () => {
  const i = E.impostazioni({ preset: 'audio' }, FHD25, TUTTI);
  assert.deepEqual([i.formato, i.codec, i.bitrate, i.geometria], ['wav', null, 0, null]);
  assert.equal(E.pesoStimato(i, 10), 10 * 192000 + 44);
});

test('il codec: si prende il primo del preset che la macchina sa fare; se non c\'è si ripiega; se nessuno, null', () => {
  assert.equal(E.impostazioni({ preset: 'yt1080' }, FHD25, ['hevc', 'vp9']).codec, 'hevc', 'H.264 non c\'è: HEVC');
  assert.equal(E.impostazioni({ preset: 'yt1080', codec: 'hevc' }, FHD25, TUTTI).codec, 'hevc');
  assert.equal(E.impostazioni({ preset: 'yt1080', codec: 'vp9' }, FHD25, TUTTI).codec, 'avc', 'VP9 non è fra quelli del preset');
  assert.equal(E.impostazioni({ preset: 'whatsapp' }, FHD25, ['vp9']).codec, null);
  // Personalizzato: sceglie tutto lui, il contenitore limita i codec
  assert.equal(E.impostazioni({ preset: 'libero', formato: 'webm', codec: 'av1' }, FHD25, TUTTI).codec, 'av1');
  assert.equal(E.impostazioni({ preset: 'libero', formato: 'webm', codec: 'avc' }, FHD25, TUTTI).codec, 'vp9', 'H.264 non sta in WebM');
  assert.deepEqual(E.codecPossibili(E.presetDi('libero'), 'mov', TUTTI), ['avc', 'hevc']);
});

test('Personalizzato: la misura sceglie l\'altezza con la forma del progetto', () => {
  const m = (misura) => { const i = E.impostazioni({ preset: 'libero', misura }, { w: 1920, h: 1080, fps: 25 }, TUTTI); return [i.w, i.h]; };
  assert.deepEqual(m('progetto'), [1920, 1080]);
  assert.deepEqual(m('meta'), [960, 540]);
  assert.deepEqual(m('720'), [1280, 720]);
  assert.deepEqual(m('2160'), [3840, 2160]);
});

test('stima del peso: cresce con la qualità, cala coi codec più bravi, scala con la durata', () => {
  const peso = (sc, sec = 60) => E.pesoStimato(E.impostazioni(sc, FHD25, TUTTI), sec);
  assert.ok(peso({ preset: 'yt1080', qualita: 80 }) > peso({ preset: 'yt1080', qualita: 40 }));
  assert.ok(peso({ preset: 'yt1080', codec: 'hevc' }) < peso({ preset: 'yt1080', codec: 'avc' }));
  const un = peso({ preset: 'yt1080' }, 60);
  assert.ok(Math.abs(peso({ preset: 'yt1080' }, 120) / un - 2) < 0.01);
  assert.equal(peso({ preset: 'yt1080' }, 0), 0);
  // un ordine di grandezza sensato: 1080p25 «alto» per un minuto sta fra 20 e 200 MB
  assert.ok(un > 20e6 && un < 200e6, String(un));
  // WhatsApp è molto più leggero della versione master
  assert.ok(peso({ preset: 'whatsapp' }) * 10 < peso({ preset: 'master' }));
});

test('testi: peso e qualità a parole, nome del file', () => {
  assert.equal(E.pesoTesto(820), '820 B');
  assert.equal(E.pesoTesto(48_000_000), '48 MB');
  assert.equal(E.pesoTesto(2_400_000), '2,4 MB');
  assert.equal(E.pesoTesto(1_200_000_000), '1,2 GB');
  assert.match(E.descriviQualita(10), /Molto leggero/);
  assert.match(E.descriviQualita(100), /Massimo/);
  assert.equal(E.nomeFile('Mio: film', E.presetDi('verticale'), 'mp4'), 'Mio_ film - Reel TikTok Shorts.mp4');
  assert.equal(E.nomeFile('', E.presetDi('libero'), 'webm'), 'montaggio.webm');
});

test('coda: una dopo l\'altra, parte la prima che aspetta, mai due insieme', () => {
  const c = new C.Coda();
  const a = c.aggiungi('A'), b = c.aggiungi('B'), d = c.aggiungi('C');
  assert.equal(c.prossimo().id, a.id);
  c.segna(a.id, 'lavoro');
  assert.equal(c.prossimo(), undefined, 'una sta lavorando: le altre aspettano');
  assert.equal(c.inLavoro().id, a.id);
  c.segna(a.id, 'fatta', 'A.mp4');
  assert.equal(c.prossimo().id, b.id);
  c.segna(b.id, 'errore', 'boom');
  assert.equal(c.prossimo().id, d.id, 'una sbagliata non ferma la coda');
  assert.equal(c.riepilogo(), '1 in coda · 2 finite');
});

test('coda: sposta solo fra quelle che aspettano, in cima, togli e svuota le finite', () => {
  const c = new C.Coda();
  const a = c.aggiungi('A'), b = c.aggiungi('B'), d = c.aggiungi('C');
  c.segna(a.id, 'lavoro');
  assert.equal(c.sposta(a.id, 1), false, 'quella al lavoro non si sposta');
  assert.equal(c.sposta(b.id, -1), false, 'B è già la prima che aspetta');
  assert.equal(c.sposta(d.id, -1), true);
  assert.deepEqual(c.voci.map((v) => v.dato), ['A', 'C', 'B']);
  assert.equal(c.sposta(b.id, 1), false, 'l\'ultima non scende');
  const z = c.aggiungi('Z', true);
  assert.deepEqual(c.voci.map((v) => v.dato), ['A', 'Z', 'C', 'B'], 'in cima a quelle che aspettano, dopo quella al lavoro');
  assert.equal(c.togli(a.id), false, 'non si toglie quella al lavoro');
  assert.equal(c.togli(z.id), true);
  c.segna(a.id, 'fatta');
  c.segna(d.id, 'annullata');
  assert.equal(c.pulisciFinite(), 2);
  assert.deepEqual(c.voci.map((v) => v.dato), ['B']);
  assert.equal(c.riepilogo(), '1 in coda');
  c.togli(b.id);
  assert.equal(c.riepilogo(), 'La coda è vuota');
});
