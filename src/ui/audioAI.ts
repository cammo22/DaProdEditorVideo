// L'audio con l'AI dentro il montaggio: togliere i rumori da una voce e separare voce e base (la musica) di una canzone.
// Qui sta quello che si vede e si preme: la sezione "Pulisci e separa" nelle Proprietà (per le clip audio e per le riprese con
// l'audio), i due comandi (Ctrl+K, menu Modifica, tasto destro sulla clip). Il lavoro vero è in src/media/audioAI.ts.
import { store } from '../core/store';
import type { Clip } from '../core/tipi';
import { registra as reg } from '../azioni';
import { avviso, h } from './dom';
import {
  haOriginale, installaSeparazione, lavoriAudioAI, possibilita, separaVoceBase, statoAudioAI, tornaOriginale, togliRumore, type Forza,
} from '../media/audioAI';

const RAPIDO = 'dpv-audioai-rapido';
export const separazioneRapida = () => { try { return localStorage.getItem(RAPIDO) === 'si'; } catch { return false; } };
const impostaRapida = (v: boolean) => { try { if (v) localStorage.setItem(RAPIDO, 'si'); else localStorage.removeItem(RAPIDO); } catch { /* niente */ } };

const FORZE: [Forza, string, string][] = [
  ['leggera', 'Leggera', 'Toglie il fruscio e lascia molto del suono di prima'],
  ['media', 'Media', 'Va bene quasi sempre: voce pulita, rumore molto più basso'],
  ['forte', 'Forte', 'Tutto il rumore va via (può togliere un po\' di naturalezza)'],
];

/** quando una lavorazione sbaglia lo dice (le frasi sono già in italiano); "fermato" = l'hai fermata tu */
function dopoErrore(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/^fermato/i.test(msg)) { avviso('Fermato', 'info', 1600); return; }
  avviso(msg, 'errore', 7000);
}

export async function faiTogliRumore(clipId: string, forza: Forza = 'media') {
  try {
    await togliRumore(clipId, forza);
    avviso('🎙 Rumori tolti: se non ti piace, "Audio originale" rimette com\'era (o Ctrl+Z)', 'ok', 4200);
  } catch (e) { dopoErrore(e); }
}

export async function faiSeparaVoce(clipId: string, tieni: 'entrambe' | 'voce' | 'base' = 'entrambe') {
  try {
    await separaVoceBase(clipId, { tieni, rapido: separazioneRapida() });
    avviso('🎤 Fatto: la voce e la base sono su due tracce nuove (l\'originale è muto). Ctrl+Z rimette tutto', 'ok', 5200);
  } catch (e) { dopoErrore(e); }
}

/** la clip su cui lavorare adesso: quella scelta che ha audio, o quella più in alto sotto il cursore */
async function clipDaUsare(): Promise<Clip | undefined> {
  const { clipAudioDaUsare } = await import('./centroAI');
  return clipAudioDaUsare(true);
}

reg({
  id: 'audioTogliRumore', nome: 'Togli i rumori dall\'audio (AI)', gruppo: 'Audio',
  info: 'Toglie fruscio, ventole e rumori di fondo da una voce, e la rende più chiara. Lavora sulla clip audio scelta (o sulla ripresa) e si annulla con Ctrl+Z.',
  fn: () => { void clipDaUsare().then((c) => { if (!c) { avviso('Scegli una clip audio (o una ripresa con l\'audio)', 'info', 2600); return; } void faiTogliRumore(c.id); }); },
});
reg({
  id: 'audioSeparaVoce', nome: 'Separa voce e musica di una canzone (AI)', gruppo: 'Audio',
  info: 'Da una canzone fa due tracce nuove: la voce e la base (lo strumentale). L\'originale resta ma va muto. Si annulla con Ctrl+Z.',
  fn: () => { void clipDaUsare().then((c) => { if (!c) { avviso('Scegli una clip audio (o una ripresa con l\'audio)', 'info', 2600); return; } void faiSeparaVoce(c.id); }); },
});

/** le voci da aggiungere al menu della clip (tasto destro) */
export function vociMenuAudioAI(c: Clip): { nome: string; fn: () => void; disattiva?: boolean }[] {
  const poss = possibilita(c);
  if (!poss.rumore && c.kind !== 'media') return [];
  return [
    { nome: '✨ Audio AI: togli i rumori', disattiva: !poss.rumore, fn: () => { store.select([c.id]); void faiTogliRumore(c.id); } },
    { nome: '✨ Audio AI: separa voce e base', disattiva: !poss.separa, fn: () => { store.select([c.id]); void faiSeparaVoce(c.id); } },
    ...(haOriginale(c) ? [{ nome: '↩ Audio originale (senza AI)', fn: () => { store.select([c.id]); tornaOriginale(c.id); } }] : []),
  ];
}

/** la sezione "Pulisci e separa l'audio" delle Proprietà: due schede grandi, poche parole */
export function righeAudioAI(c: Clip): HTMLElement[] {
  const poss = possibilita(c);
  const lavora = [...lavoriAudioAI().values()];
  const occupata = lavora.length > 0;
  const scheda = (icona: string, titolo: string, sotto: string, bottoni: HTMLElement[]) => h('div', { class: 'aai-scheda' },
    h('div', { class: 'aai-testa' }, h('i', null, icona), h('div', null, h('b', null, titolo), h('span', null, sotto))),
    h('div', { class: 'aai-bottoni' }, bottoni));
  const bottone = (testo: string, info: string, fn: () => void, primario = false) => h('button', {
    class: 'aai-bottone' + (primario ? ' primario' : ''), title: info, disabled: !poss.rumore || occupata, on: { click: fn },
  }, testo);
  const righe: HTMLElement[] = [];
  if (!poss.rumore) righe.push(h('p', { class: 'nota avviso-rosso' }, poss.perche ?? 'Su questa clip non si può'));
  righe.push(
    scheda('🎙', 'Togli i rumori', 'Una voce con fruscio, ventola o rumore di fondo: il rumore va via e la voce resta.',
      FORZE.map(([f, nome, info]) => bottone(nome, info, () => void faiTogliRumore(c.id, f), f === 'media'))),
    scheda('🎤', 'Separa voce e musica', 'Da una canzone: la voce da una parte e la base (lo strumentale) dall\'altra, su due tracce nuove.',
      [
        bottone('Voce e base', 'Due tracce nuove: "Voce" e "Base"', () => void faiSeparaVoce(c.id, 'entrambe'), true),
        bottone('Solo voce', 'Tiene solo la voce (acapella)', () => void faiSeparaVoce(c.id, 'voce')),
        bottone('Solo base', 'Tiene solo lo strumentale', () => void faiSeparaVoce(c.id, 'base')),
      ]));
  if (occupata) righe.push(h('p', { class: 'nota' }, 'Sto lavorando: la barra è nel Centro attività (in basso a destra). Puoi continuare a montare.'));
  if (haOriginale(c)) righe.push(h('div', { class: 'isp-azioni' }, h('button', { class: 'btn-mini', title: 'Rimette l\'audio com\'era prima di togliere i rumori', on: { click: () => tornaOriginale(c.id) } }, '↩ Audio originale')));
  // lo stato dei modelli, e la scelta "rapido senza AI" in Avanzate
  const stato = h('p', { class: 'nota' }, '');
  void statoAudioAI().then((s) => {
    const sep = s.separa.stato === 'pronto' ? 'pronto' : s.separa.stato === 'in-uso' ? 'sta lavorando' : s.separa.stato === 'errore' ? 'ha dato un errore (si userà la separazione rapida)' : `da scaricare (${s.separa.peso})`;
    stato.textContent = `Togli i rumori: ${s.rumore.stato === 'pronto' ? 'pronto' : s.rumore.stato === 'in-uso' ? 'sta lavorando' : 'si scarica la prima volta'} · Voce e base: ${sep}. Lavora sul tuo computer, niente esce.`;
  }).catch(() => { stato.textContent = ''; });
  const scarica = h('button', { class: 'btn-mini', title: 'Scarica adesso il modello per separare voce e base (una volta sola)', on: { click: () => { void installaSeparazione().then(() => avviso('Modello scaricato', 'ok', 2200)).catch(dopoErrore); } } }, 'Scarica il modello per separare');
  const rapido = h('input', { type: 'checkbox', checked: separazioneRapida(), on: { change: (e: Event) => impostaRapida((e.target as HTMLInputElement).checked) } }) as HTMLInputElement;
  righe.push(stato, h('details', { class: 'pp-piu' }, h('summary', null, 'Avanzate'),
    h('label', { class: 'isp-riga spunta-riga' }, rapido, h('span', null, 'Separazione rapida, senza AI (meno precisa, non scarica niente)')),
    h('div', { class: 'isp-azioni' }, scarica),
    h('p', { class: 'nota' }, 'Si lavora solo sulla parte della clip che usi (più un secondo per lato). Il risultato è un file nuovo nel contenitore, cartella "Audio lavorato".')));
  return righe;
}
