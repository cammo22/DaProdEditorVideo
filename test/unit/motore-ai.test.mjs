import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { MotoreAI, transizioneLocale, base64DaByte } = await import(pathToFileURL(path.join(process.env.DPV_UNIT, 'motoreAI.mjs')));
const stato = (s, dettaglio = '') => ({ stato: s, dettaglio, k: 0.5, cartella: 'privata' });

test('macchina a stati: installazione, accensione, stop e rimozione', () => {
  assert.equal(transizioneLocale('non-installato', 'installa'), 'installazione');
  assert.equal(transizioneLocale('pronto', 'accendi'), 'avvio');
  assert.equal(transizioneLocale('acceso', 'accendi'), 'acceso');
  assert.equal(transizioneLocale('acceso', 'spegni'), 'pronto');
  assert.equal(transizioneLocale('installazione', 'spegni'), 'non-installato');
  assert.equal(transizioneLocale('acceso', 'disinstalla'), 'non-installato');
  assert.equal(transizioneLocale('errore', 'installa'), 'installazione');
  assert.throws(() => transizioneLocale('non-installato', 'accendi'));
  assert.throws(() => transizioneLocale('installazione', 'installa'));
  assert.throws(() => transizioneLocale('acceso', 'installa'));
});
test('installazione: progresso fino a pronto, nessun HTTP nel frontend', async () => {
  const stati = ['non-installato', 'installazione', 'pronto'];
  const comandi = [], progresso = [];
  const m = new MotoreAI(async (cmd) => { comandi.push(cmd); return cmd === 'ai_locale_stato' ? stato(stati.shift()) : null; }, 0);
  await m.azione('installa', (k) => progresso.push(k));
  assert.deepEqual(comandi, ['ai_locale_stato', 'ai_locale_installa', 'ai_locale_stato', 'ai_locale_stato']);
  assert.equal(progresso.length, 2);
});
test('lavoro seriale: id e avanzamento arrivano dal server', async () => {
  const richieste = [];
  let giro = 0;
  const m = new MotoreAI(async (cmd, args) => {
    assert.equal(cmd, 'ai_locale_richiesta'); richieste.push(args);
    if (args.metodo === 'POST') return { id: '23' };
    return ++giro === 1 ? { stato: 'lavoro', k: 0.4, dettaglio: 'Carico' } : { stato: 'finito', k: 1, risultato: { byte: 123 } };
  }, 0);
  const progresso = [];
  assert.deepEqual(await m.lavoro('/modelli/scarica', {}, (k) => progresso.push(k)), { byte: 123 });
  assert.deepEqual(progresso, [0.4, 1]);
  assert.equal(richieste[1].percorso, '/lavori/23');
});
test('annullare termina davvero Python e non lascia timer', async () => {
  const ctrl = new AbortController();
  const chiamate = [];
  const m = new MotoreAI(async (cmd, args) => {
    chiamate.push(cmd);
    if (cmd === 'ai_locale_spegni') return null;
    if (args.metodo === 'POST') return { id: '1' };
    ctrl.abort(); return { stato: 'lavoro', k: 0.2 };
  }, 0);
  await assert.rejects(m.lavoro('/voce/clona', {}, () => {}, ctrl.signal), /fermato/);
  assert.equal(chiamate.at(-1), 'ai_locale_spegni');
});
test('errore di avvio: stop e possibilità di riprovare', async () => {
  const chiamate = [];
  const stati = ['pronto', 'errore'];
  const m = new MotoreAI(async (cmd) => { chiamate.push(cmd); return cmd === 'ai_locale_stato' ? stato(stati.shift(), 'Avvio fallito') : null; }, 0);
  await assert.rejects(m.azione('accendi'), /Avvio fallito/);
  assert.equal(chiamate.at(-1), 'ai_locale_spegni');
});
test('errore del modello e segnale già annullato non vengono ignorati', async () => {
  const comandi = [];
  const m = new MotoreAI(async (cmd, args) => { comandi.push(cmd); return args?.metodo === 'POST' ? { id: '1' } : { stato: 'errore', errore: 'VRAM piena' }; }, 0);
  await assert.rejects(m.lavoro('/voce/genera', {}, () => {}), /VRAM piena/);
  assert.equal(comandi.at(-1), 'ai_locale_spegni');
  comandi.length = 0;
  await assert.rejects(m.azione('installa', () => {}, AbortSignal.abort()), /fermato/);
  assert.equal(comandi.length, 0);
});
test('Base richiede un campione; il WAV generato viene letto senza cambiare i campioni', async () => {
  const wav = Buffer.alloc(50);
  wav.write('RIFF'); wav.writeUInt32LE(42, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(6, 40);
  wav.writeInt16LE(16384, 44); wav.writeInt16LE(-16384, 46);
  let richieste = 0;
  const m = new MotoreAI(async (_cmd, args) => { richieste++; return args.metodo === 'POST' ? { id: '1' } : { stato: 'finito', risultato: { wav: base64DaByte(wav) } }; });
  await assert.rejects(m.genera('Ciao', { campione: '', lingua: 'it', dispositivo: 'cpu' }, () => {}), /campione/);
  assert.equal(richieste, 0);
  const r = await m.genera('Ciao', { campione: 'riferimento', lingua: 'it', dispositivo: 'cpu' }, () => {});
  assert.equal(r.sr, 24000); assert.equal(r.audio[0], 0.5); assert.equal(r.audio[1], -0.5);
});
