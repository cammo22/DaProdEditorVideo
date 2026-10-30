import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const M = await carica('montage');
const P = await carica('progetto');
const R = await carica('montagePreset');
const video = { media: 'v', nome: 'Video', tipo: 'video', durata: 100, w: 1920, h: 1080, data: 0, audio: true, punteggio: .5,
  momenti: [{ da: 0, a: 10, punteggio: .1 }, { da: 40, a: 60, punteggio: .95 }, { da: 80, a: 90, punteggio: .6 }] };
const op = { preset: 'compleanno', durata: 20, ordine: 'dato', titoli: false, effetti: false, audioVideo: -3, testi: { titolo: '', nomi: '', sottotitolo: '', data: '' }, seme: 7, scarta: true, migliori: true };

test('I video lunghi offrono più pezzi veri, ordinati per qualità e dentro le scene', () => {
  const c = M.candidatiMontage([video], 8);
  assert.equal(c[0].pezzo.da, 40);
  assert.ok(c.length > 3);
  assert.ok(c.every((e) => e.pezzo.a - e.pezzo.da <= 8));
  assert.ok(c.every((e) => video.momenti.some((m) => e.pezzo.da >= m.da && e.pezzo.a <= m.a)));
  assert.equal(M.candidatiMontage([{ ...video, momenti: [{ da: -1, a: 200, punteggio: 1 }] }], 8).some((e) => e.pezzo.a > 100 || e.pezzo.da < 0), false);
});

test('Il piano usa più momenti, non supera la sorgente ed è ripetibile', () => {
  const a = M.pianifica([video], op), b = M.pianifica([video], op);
  assert.deepEqual(a, b);
  assert.ok(new Set(a.voci.map((v) => v.srcIn)).size > 1);
  assert.ok(a.voci.every((v) => v.len > 0 && v.srcIn >= v.entrata.pezzo.da && v.srcIn + v.len <= v.entrata.pezzo.a + 1e-7));
  for (let i = 1; i < a.voci.length; i++) assert.ok(Math.abs(a.voci[i].start - a.voci[i-1].start - a.voci[i-1].len) < 1e-7);
});

test('Le frasi restano intere anche quando durano più del ritmo dello stile', () => {
  const e = { ...video, parole: [{ t: 'Una', da: 4, a: 5 }, { t: 'frase.', da: 5, a: 16 }, { t: 'Altra.', da: 20, a: 22 }] };
  const a = M.pianifica([e], { ...op, frasi: true, durata: 15 });
  assert.ok(a.voci.every((v) => [4, 20].includes(v.srcIn)));
  assert.ok(a.voci.every((v) => v.srcIn + v.len === 16 || v.srcIn + v.len === 22));
});

test('Finale sul battito, anche con musica ripetuta; nessun battito inventato', () => {
  assert.equal(M.fineSulBattito(20, [17, 18, 19.5, 21]), 19.5);
  assert.equal(M.fineSulBattito(25, [1, 3, 4.5, 8], 10), 24.5);
  assert.equal(M.fineSulBattito(20, []), 20);
  assert.equal(M.fineSulBattito(20, [NaN, 1, 7, 22]), 20);
  const foto = { ...video, tipo: 'image', durata: 0, momenti: undefined };
  const a = M.pianifica([foto], { ...op, battiti: true, musica: { media: 'm', durata: 30, battiti: [17, 18, 19.5] } });
  assert.ok(Math.abs(a.durata - 19.5) < 1e-7);
  assert.ok(Math.abs(a.voci.reduce((s, v) => s + v.len, 0) - a.durata) < 1e-7);
});

test('Ogni stile ha una LUT inclusa, coerente coi look in bianco e nero', () => {
  const ids = new Set(['caldo', 'freddo', 'teal-e-orange', 'pellicola-anni-70', 'bianco-e-nero-ricco']);
  for (const p of R.PRESET_MONTAGE) {
    assert.ok(ids.has(M.lookPerStile(p.id)));
    if (p.look.includes('bn')) assert.equal(M.lookPerStile(p.id), 'bianco-e-nero-ricco');
  }
});

test('Verticale: copre il quadro, centra il soggetto in pixel e non scopre i bordi', () => {
  const p = { w: 1080, h: 1920 }, m = { width: 1920, height: 1080, rotation: 0 };
  const centro = M.riquadraSoggetto(p, m);
  assert.equal(centro.x, 0); assert.equal(centro.y, 0); assert.ok(centro.scale > 3);
  const destra = M.riquadraSoggetto(p, m, { x: .75, y: .5 });
  assert.ok(destra.x < -500); assert.equal(destra.y, 0);
  assert.ok(Math.abs(M.riquadraSoggetto(p, m, { x: 2, y: 2 }).x) <= (1920 * 1920 / 1080 - 1080) / 2 + 1e-7);
});

test('La sequenza salva LUT, titoli HTML, keyframe, ruoli audio e fade modificabili', () => {
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  p.media.push({ id: 'v', type: 'image', name: 'Foto', width: 1920, height: 1080, rotation: 0 }, { id: 'm', type: 'audio', duration: 40 });
  const e = { ...video, tipo: 'image', durata: 0 };
  const lut = { id: 'lut-prova', hash: 'prova', nome: 'Prova', n: 2, domainMin: [0,0,0], domainMax: [1,1,1], dati: [] };
  const o = { ...op, titoli: true, testi: { titolo: 'La festa', nomi: 'Cammo', sottotitolo: '', data: '' }, titoliHtml: true, movimento: true, lut, ducking: true, musica: { media: 'm', durata: 40 } };
  M.costruisciSequenza(p, M.pianifica([e], o), o);
  assert.equal(p.luts[0].id, lut.id);
  const c = p.clips.find((c) => c.media === 'v');
  assert.equal(c.fx.colore.lut.id, lut.id);
  assert.ok(c.anim['tf.scale'].length >= 2);
  assert.ok(p.clips.some((c) => c.gen?.html));
  assert.ok(p.clips.find((c) => c.media === 'm').fadeOut > 0);
  assert.ok(p.tracks.some((t) => t.ruoloAudio === 'musica' && t.ducking.attivo));
});


test('Il finale dopo il parlato raggiunge il battito senza allungare la ripresa o le parole', () => {
  const e = { ...video, parole: [{ t: 'Una frase.', da: 10, a: 16.2 }] };
  const o = { ...op, frasi: true, durata: 7, battiti: true, musica: { media: 'm', durata: 20, battiti: [0, 1, 2, 3, 4, 5, 6, 7, 8] } };
  const piano = M.pianifica([e], o);
  assert.ok(Math.abs(piano.voci[0].len - 6.2) < 1e-7);
  assert.equal(piano.durata, 7);
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  p.media.push({ id: 'v', type: 'video', width: 1920, height: 1080, rotation: 0, t0: 5 });
  M.costruisciSequenza(p, piano, o);
  const c = p.clips.find((c) => c.media === 'v');
  assert.equal(c.srcIn, 15); assert.equal(c.len, 155);
  assert.equal(p.clips.find((c) => c.kind === 'color').len, 175);
});
