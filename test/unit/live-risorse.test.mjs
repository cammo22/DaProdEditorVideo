// LIVE non deve lasciare niente di aperto: il contatore delle risorse, lo spazio su disco per le fette della registrazione
// (MediaRecorder non tiene più tutto in memoria) e le scritte della barra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';

const R = await carica('risorseLive'), I = await carica('liveInfo'), S = await carica('spoolLive'), F = await carica('funzioniAI');

test('il contatore conta ciò che si apre e si chiude, e una chiusura doppia conta una volta sola', () => {
  const r = new R.Risorse(true);
  const a = r.apri('registratore'), b = r.apri('registratore'), c = r.apri('audio');
  assert.equal(r.aperte('registratore'), 2);
  a(); a();
  assert.equal(r.aperte('registratore'), 1);
  b(); c();
  assert.deepEqual(r.perdite(), []);
  assert.equal(r.conta().registratore.totali, 2);
  assert.equal(r.testo(), 'niente aperto');
});

test('le tracce si segnano una volta e si tolgono fermandole (o quando finiscono da sole)', () => {
  const r = new R.Risorse(true);
  const mk = () => { const et = new EventTarget(); et.stop = () => { et.fermata = true; }; return et; };
  const t1 = mk(), t2 = mk();
  const flusso = { getTracks: () => [t1, t2] };
  r.flusso(flusso); r.flusso(flusso);
  assert.equal(r.aperte('traccia'), 2);
  r.fermaTutte(flusso);
  assert.ok(t1.fermata && t2.fermata);
  assert.equal(r.aperte('traccia'), 0);
  const t3 = r.traccia(mk());
  assert.equal(r.aperte('traccia'), 1);
  t3.dispatchEvent(new Event('ended'));
  assert.equal(r.aperte('traccia'), 0);
  assert.deepEqual(r.perdite(), []);
  r.traccia(mk());
  assert.deepEqual(r.perdite(), ['traccia: 1']);
  assert.deepEqual(r.perdite({ traccia: 1 }), []);
});

test('spento (produzione) non tiene niente', () => {
  const r = new R.Risorse(false);
  r.apri('audio')();
  r.flusso({ getTracks: () => [{ stop() {} }] });
  assert.deepEqual(r.conta(), {});
});

test('scritte della barra: risoluzione, fps, spazio e minuti rimasti', () => {
  assert.equal(I.testoInfo({ larghezza: 2560, altezza: 1440, fps: 60, spazio: 212e9 }), '2560×1440 · 60 fps · 212 GB');
  assert.equal(I.testoInfo({ fps: 30, spazio: 5.43e9 }), '30 fps · 5,4 GB');
  assert.equal(I.testoInfo({}), '');
  assert.equal(I.testoGB(800e6), '800 MB');
  assert.equal(I.testoGB(null), '—');
  // 8 Mbit/s = 1 MB/s = 60 MB al minuto
  assert.equal(I.minutiRimasti(6e9, 8e6), 100);
  assert.equal(I.minutiRimasti(null, 8e6), null);
});

/** una cartella OPFS finta */
function cartellaFinta({ guastaDopo = Infinity } = {}) {
  const file = new Map();
  let scritture = 0;
  return {
    file,
    async getFileHandle(nome, o) {
      if (!file.has(nome)) { if (!o?.create) throw new Error('manca'); file.set(nome, []); }
      const parti = file.get(nome);
      return {
        async createWritable() {
          return {
            async write(b) { if (++scritture > guastaDopo) throw new Error('disco pieno'); parti.push(b); },
            async close() {},
          };
        },
        async getFile() { return new Blob(parti); },
      };
    },
    async removeEntry(nome) { file.delete(nome); },
    async *entries() { for (const k of file.keys()) yield [k, { kind: 'file' }]; },
  };
}

test('le fette vanno sul file temporaneo, in ordine, e a fine corsa tornano come un Blob solo', async () => {
  const dir = cartellaFinta();
  const sp = await S.Spool.apri('video', 'video/webm', dir);
  for (const t of ['aa', 'bb', 'cc']) sp.aggiungi(new Blob([t]));
  assert.equal(sp.su, 'disco');
  const blob = await sp.chiudi();
  assert.equal(await blob.text(), 'aabbcc');
  assert.equal(blob.type, 'video/webm');
  assert.equal(sp.fette, 3);
  assert.equal(dir.file.size, 1);
  await sp.scarta();
  assert.equal(dir.file.size, 0);
});

test('se il disco si rompe a metà le fette restano in memoria e niente va perso', async () => {
  const dir = cartellaFinta({ guastaDopo: 2 });
  const sp = await S.Spool.apri('video', 'video/webm', dir);
  for (const t of ['1', '2', '3', '4']) sp.aggiungi(new Blob([t]));
  const blob = await sp.chiudi();
  assert.equal(await blob.text(), '1234');
  assert.equal(sp.su, 'memoria');
  await sp.scarta();
});

test('senza disco privato si lavora in memoria, come prima', async () => {
  const sp = await S.Spool.apri('audio', 'audio/webm', null);
  assert.equal(sp.su, 'memoria');
  sp.aggiungi(new Blob(['x'])); sp.aggiungi(new Blob(['y']));
  assert.equal(await (await sp.chiudi()).text(), 'xy');
});

test('i file temporanei vecchi di una registrazione interrotta si tolgono, quelli di oggi no', async () => {
  const dir = cartellaFinta();
  const ora = Date.UTC(2026, 9, 30);
  dir.file.set(`video-${ora - 3 * 24 * 3600e3}-1.tmp`, []);
  dir.file.set(`audio-${ora - 3600e3}-2.tmp`, []);
  dir.file.set('altro.txt', []);
  assert.equal(await S.puliziaSpoolVecchi(dir, ora), 1);
  assert.deepEqual([...dir.file.keys()].sort(), ['altro.txt', `audio-${ora - 3600e3}-2.tmp`]);
});


test('se il disco si rompe dopo aver preso delle fette e non chiude più, la perdita si dichiara', async () => {
  const dir = cartellaFinta();
  const sp = await S.Spool.apri('video', 'video/webm', dir);
  sp.aggiungi(new Blob(['a'])); sp.aggiungi(new Blob(['b']));
  // il file sul disco non si chiude più (disco sparito)
  sp.scrivibile.close = async () => { throw new Error('disco sparito'); };
  const blob = await sp.chiudi();
  assert.equal(sp.perse, true);
  assert.equal(blob.size, 0);
});

test('senza guasti la perdita non si dichiara', async () => {
  const sp = await S.Spool.apri('video', 'video/webm', cartellaFinta());
  sp.aggiungi(new Blob(['a']));
  await sp.chiudi();
  assert.equal(sp.perse, false);
});
