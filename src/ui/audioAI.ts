// L'audio con l'AI dentro il montaggio: togliere i rumori da una voce e separare voce e base (la musica) di una canzone.
// Qui sta quello che si vede e si preme: la sezione "Pulisci e separa" nelle Proprietà (per le clip audio e per le riprese con
// l'audio), i due comandi (Ctrl+K, menu Modifica, tasto destro sulla clip). Il lavoro vero è in src/media/audioAI.ts.
import { confermaAvvioAI } from './aiPassi';
import { store } from '../core/store';
import type { Clip } from '../core/tipi';
import { registra as reg } from '../azioni';
import { avviso, h } from './dom';
import {
  avanzamentoAudioAI, haOriginale, installaSeparazione, lavoriAudioAI, possibilita, separaVoceBase, statoAudioAI, tornaOriginale, togliRumore, type Forza,
} from '../media/audioAI';

const RAPIDO = 'dpv-audioai-rapido';
export const separazioneRapida = () => { try { return localStorage.getItem(RAPIDO) === 'si'; } catch { return false; } };
const impostaRapida = (v: boolean) => { try { if (v) localStorage.setItem(RAPIDO, 'si'); else localStorage.removeItem(RAPIDO); } catch { /* niente */ } };

const FORZE: [Forza, string, string][] = [
  ['leggera', 'Leggera', 'Toglie il fruscio e lascia molto del suono di prima (DeepFilterNet)'],
  ['media', 'Media', 'Va bene quasi sempre: voce pulita, rumore molto più basso (DeepFilterNet)'],
  ['forte', 'Forte', 'Tutto il rumore che il modello sente va via (può togliere un po\' di naturalezza)'],
  ['isolata', 'Voce isolata', 'Prima un modello AI tiene solo la voce (via musica, TV, gente), poi toglie il rumore. La prima volta scarica il modello (~172 MB), è più lento'],
  ['podcast', 'Podcast', 'Voce da studio: rumore ed eco via, voce calda e presente, volume da podcast (−19 LUFS). Clear di Desert Ant Labs, la prima volta scarica ~49 MB'],
  ['naturale', 'Podcast naturale', 'Come Podcast ma più morbido: resta un po\' del suono della stanza, il respiro, la naturalezza'],
];

/** quando una lavorazione sbaglia lo dice (le frasi sono già in italiano); "fermato" = l'hai fermata tu */
function dopoErrore(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/^fermato/i.test(msg)) { avviso('Fermato', 'info', 1600); return; }
  avviso(msg, 'errore', 7000);
}

export async function faiTogliRumore(clipId: string, forza: Forza = 'media') {
  try {
    const speciale = ['isolata', 'podcast', 'naturale'].includes(forza);
    if (!(await confermaAvvioAI({ compito: 'Togli i rumori · ' + forza, clip: clipId, modello: forza === 'isolata' ? 'Demucs + DeepFilterNet' : speciale ? 'Clear' : 'DeepFilterNet', mb: forza === 'isolata' ? 172 : speciale ? 49 : undefined, locale: !speciale }))) return;
    await togliRumore(clipId, forza);
    avviso('🎙 Rumori tolti: se non ti piace, "Audio originale" rimette com\'era (o Ctrl+Z)', 'ok', 4200);
  } catch (e) { dopoErrore(e); }
}

export async function faiSeparaVoce(clipId: string, tieni: 'entrambe' | 'voce' | 'base' = 'entrambe') {
  try {
    const rapido = separazioneRapida();
    if (!(await confermaAvvioAI({ compito: 'Separa voce e base · ' + tieni, clip: clipId, modello: rapido ? 'Separazione rapida locale' : 'Demucs', mb: rapido ? undefined : 172, locale: rapido }))) return;
    await separaVoceBase(clipId, { tieni, rapido });
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

/** quale bottone si è premuto (per scrivere "in corso" proprio su quello) */
let premuto = '';

/** la sezione "Pulisci e separa l'audio" delle Proprietà: due schede grandi, poche parole */
export function righeAudioAI(c: Clip): HTMLElement[] {
  const poss = possibilita(c);
  const bottoni: { el: HTMLButtonElement; chiave: string; tipo: 'rumore' | 'separa'; testo: string }[] = [];
  const stati: { el: HTMLElement; tipo: 'rumore' | 'separa' }[] = [];
  const scheda = (tipo: 'rumore' | 'separa', icona: string, titolo: string, sotto: string, voci: HTMLElement[]) => {
    const stato = h('div', { class: 'aai-stato', hidden: true }) as HTMLElement;
    stati.push({ el: stato, tipo });
    return h('div', { class: 'aai-scheda', 'data-aai': tipo },
      h('div', { class: 'aai-testa' }, h('i', null, icona), h('div', null, h('b', null, titolo), h('span', null, sotto))),
      h('div', { class: 'aai-bottoni' }, voci), stato);
  };
  const bottone = (tipo: 'rumore' | 'separa', chiave: string, testo: string, info: string, fn: () => void, primario = false) => {
    const el = h('button', {
      class: 'aai-bottone' + (primario ? ' primario' : ''), title: info, disabled: !poss.rumore, 'data-chiave': chiave,
      on: { click: () => { premuto = chiave; fn(); aggiorna(); avviaControllo(); } },
    }, testo) as HTMLButtonElement;
    bottoni.push({ el, chiave, tipo, testo });
    return el;
  };
  // a che punto siamo: il bottone premuto diventa "In corso… 42 %", gli altri si spengono, sotto compare la barra
  const aggiorna = () => {
    const lavori = [...avanzamentoAudioAI().values()];
    const occupata = lavori.length > 0;
    for (const b of bottoni) {
      const mio = occupata && premuto === b.chiave && lavori.some((l) => l.tipo === b.tipo);
      b.el.classList.toggle('lavora', mio);
      b.el.disabled = !poss.rumore || occupata;
      b.el.textContent = mio ? (lavori.find((l) => l.tipo === b.tipo)?.inCoda ? '⏳ In coda…' : `⏳ In corso${(() => { const k = lavori.find((l) => l.tipo === b.tipo)?.k; return k === null || k === undefined ? '…' : ` ${Math.round(k * 100)}%`; })()}`) : b.testo;
    }
    for (const st of stati) {
      const l = lavori.find((x) => x.tipo === st.tipo);
      st.el.hidden = !l;
      if (!l) { st.el.replaceChildren(); continue; }
      const k = l.k === null ? null : Math.round(l.k * 100);
      st.el.replaceChildren(
        h('div', { class: 'aai-testo' }, l.inCoda ? 'Aspetto il mio turno… (altri lavori pesanti sono prima)' : (l.testo || 'Sto lavorando…')),
        h('div', { class: 'aai-barra' + (k === null ? ' indeterminata' : '') }, h('i', { style: k === null ? '' : `width:${k}%` })),
        h('div', { class: 'aai-nota' }, 'Puoi continuare a montare: il lavoro va avanti dietro le quinte (Centro attività, in basso a destra).'));
    }
  };
  // finché c'è un lavoro la sezione si aggiorna da sola; quando il lavoro finisce (o la sezione sparisce) il controllo si ferma
  let timer = 0;
  const sentinella = h('span', { hidden: true }) as HTMLElement;
  const tutteLeSchedeSparite = () => !(stati[0]?.el.isConnected);
  const avviaControllo = () => {
    if (timer) return;
    timer = window.setInterval(() => {
      if (!sentinella.isConnected && tutteLeSchedeSparite()) { clearInterval(timer); timer = 0; return; }
      aggiorna();
      if (lavoriAudioAI().size === 0) { clearInterval(timer); timer = 0; }
    }, 350);
  };
  const righe: HTMLElement[] = [];
  if (!poss.rumore) righe.push(h('p', { class: 'nota avviso-rosso' }, poss.perche ?? 'Su questa clip non si può'));
  righe.push(
    scheda('rumore', '🎙', 'Togli i rumori', 'Una voce con fruscio, ventola o rumore di fondo: il rumore va via e la voce resta.',
      FORZE.map(([f, nome, info]) => bottone('rumore', 'rumore:' + f, nome, info, () => void faiTogliRumore(c.id, f), f === 'media'))),
    scheda('separa', '🎤', 'Separa voce e musica', 'Da una canzone: la voce da una parte e la base (lo strumentale) dall\'altra, su due tracce nuove.',
      [
        bottone('separa', 'separa:entrambe', 'Voce e base', 'Due tracce nuove: "Voce" e "Base"', () => void faiSeparaVoce(c.id, 'entrambe'), true),
        bottone('separa', 'separa:voce', 'Solo voce', 'Tiene solo la voce (acapella)', () => void faiSeparaVoce(c.id, 'voce')),
        bottone('separa', 'separa:base', 'Solo base', 'Tiene solo lo strumentale', () => void faiSeparaVoce(c.id, 'base')),
      ]));
  if (haOriginale(c)) righe.push(h('div', { class: 'isp-azioni' }, h('button', { class: 'btn-mini', title: 'Rimette l\'audio com\'era prima di togliere i rumori', on: { click: () => tornaOriginale(c.id) } }, '↩ Audio originale')));
  righe.push(sentinella);
  // se la sezione si apre mentre un lavoro già gira (ci si è spostati su un'altra clip e poi tornati), si vede subito
  queueMicrotask(() => { aggiorna(); if (lavoriAudioAI().size) avviaControllo(); });
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
