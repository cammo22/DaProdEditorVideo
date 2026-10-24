// I sottotitoli senza andare nel Finale (dalla 1.5.4): tasto destro su una clip → "Genera i sottotitoli di questa clip",
// la riga SOTT della timeline (tasto destro: genera, fai parlare, posizione e grandezza) e la sezione "Sottotitoli" dei
// Titoli nel contenitore. Le scelte dell'AI (lingua, modello, motore) e della voce sono quelle del Finale (dpv-ai, dpv-voce).
import { store } from '../core/store';
import type { Project, Sottotitoli, Sottotitolo } from '../core/tipi';
import * as M from '../core/montaggio';
import { end, uid } from '../core/progetto';
import { SOTTO0, creaSrt, creaVtt, leggiSrt, sistemaRighe, sottotitoliDi } from '../core/sottotitoli';
import { fps } from '../core/timecode';
import { MODELLI, fermaVoce, sottotitoliAI, type OpzioniVoce } from '../media/voce';
import { VOCI_MAGPIE, motoreNemo } from '../media/nemo';
import { doppia, linguaVoce, posaVoce } from '../media/doppiaggio';
import { spiegaErroreAI } from '../media/erroriAI';
import { codificaWav } from '../media/wav';
import { nuova, progettoAttuale } from '../media/attivita';
import { confermaAvvioAI } from './aiPassi';
import { salvaMediaSulDisco, salvaTesto } from '../platform';
import { importaFile } from '../progetti';
import { avviso, chiedi, conferma, dialogo, h } from './dom';

const leggi = <T extends object>(k: string, base: T): T => { try { return { ...base, ...(JSON.parse(localStorage.getItem(k) ?? '{}') as Partial<T>) }; } catch { return base; } };
/** le scelte dell'AI del Finale (lingua, modello, motore) */
export const opzioniAI = (): OpzioniVoce => {
  const o = leggi<OpzioniVoce>('dpv-ai', { lingua: 'it', traduci: false, modello: MODELLI[1]?.id ?? MODELLI[0].id });
  // come nel Finale (motoreAI): se non hai scelto, nell'app ascolta Nemotron; nel browser, o se il motore manca, Whisper
  const scelto = o.motore ?? (motoreNemo() ? 'nemotron' : 'whisper');
  return { ...o, motore: scelto === 'nemotron' && motoreNemo() ? 'nemotron' : 'whisper' };
};
const opzioniVoce = () => leggi('dpv-voce', { voce: 0, lingua: '', silenzia: true });

function cambiaSott(label: string, fn: (s: Sottotitoli, p: Project) => void) {
  store.edit(label, (p) => { p.sottotitoli = { ...structuredClone(SOTTO0), ...(p.sottotitoli ?? {}) }; fn(p.sottotitoli, p); });
}

let lavoroSott: AbortController | null = null;

/**
 * Sottotitoli con l'AI. Con `clip`: ascolta solo quelle clip (e il loro audio legato) e mette le righe dove stanno,
 * al posto di quelle che c'erano lì; senza: tutto il montaggio (chiede prima di rifare righe già scritte).
 */
export async function generaSottotitoli(clip?: Iterable<string>) {
  if (lavoroSott) { avviso('Sto già scrivendo i sottotitoli', 'info', 2000); return; }
  const p0 = store.doc;
  const ids = clip ? M.withLinked(p0, [...clip]) : null;
  let p: Project = structuredClone(p0);
  let da = 0, a = Infinity;
  if (ids) {
    const scelte = p.clips.filter((c) => ids.has(c.id));
    if (!scelte.some((c) => c.kind === 'media' && p.tracks.find((t) => t.id === c.track)?.kind === 'audio')) { avviso('Questa clip non ha audio da ascoltare', 'info', 2400); return; }
    da = Math.min(...scelte.map((c) => c.start)); a = Math.max(...scelte.map(end));
    p = { ...p, clips: p.clips.filter((c) => ids.has(c.id)) };
  } else {
    if (!p.clips.some((c) => c.kind === 'media' && p.tracks.find((t) => t.id === c.track)?.kind === 'audio')) { avviso('Nel montaggio non c\'è audio da ascoltare', 'info', 2400); return; }
    const scritte = sottotitoliDi(p0).righe.filter((x) => x.testo.trim()).length;
    if (scritte && !(await conferma('Sottotitoli con l\'AI', `Ci sono già ${scritte} righe scritte: l'AI le rifà tutte da capo (con Ctrl+Z tornano).`, 'Rifalle', 'Lascia stare'))) return;
  }
  const o = opzioniAI();
  const modello = MODELLI.find((m) => m.id === o.modello);
  if (!(await confermaAvvioAI({ compito: 'Scrivi sottotitoli', ambito: ids ? `Solo le clip scelte (${ids.size}, incluso audio collegato)` : 'Audio di tutto il montaggio', modello: o.motore === 'nemotron' ? 'Nemotron (motore nativo)' : modello?.nome ?? o.modello, repo: modello?.id, mb: modello?.mb }))) return;
  if (lavoroSott) return;
  const progetto = progettoAttuale();
  const ctrl = new AbortController();
  lavoroSott = ctrl;
  const lav = nuova({ titolo: ids ? 'Sottotitoli della clip' : 'Sottotitoli con l\'AI', categoria: 'ai', alAnnulla: () => { ctrl.abort(); fermaVoce(); } });
  try {
    const righe = await sottotitoliAI(p, o, (fase, k) => lav.imposta(k, fase), ctrl.signal);
    if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
    if (!righe.length) { lav.fine('nessuna parola'); avviso('Non ho sentito parole', 'info', 2600); return; }
    const traduzione = o.motore === 'whisper' && o.traduci && o.lingua === 'it';
    const dentro = righe.filter((r) => r.a > da && r.da < a).map((r): Sottotitolo => ({ ...r, da: Math.max(da, r.da), a: Math.min(a, r.a) }));
    cambiaSott(ids ? 'Sottotitoli della clip' : 'Sottotitoli con l\'AI', (s) => {
      // al posto di quelle che c'erano in quel pezzo (le altre restano)
      s.righe = ids ? [...s.righe.filter((r) => r.a <= da || r.da >= a), ...dentro].sort((x, y) => x.da - y.da) : righe;
      s.lingua = traduzione ? 'en' : (o.lingua === 'auto' ? s.lingua : o.lingua);
    });
    lav.fine(`${dentro.length} righe`);
    avviso(`✨ ${ids ? dentro.length : righe.length} righe di sottotitoli: doppio clic su una riga (SOTT) per correggerla`, 'ok', 3600);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'fermato') lav.annullata();
    else if (msg === 'muto') { lav.fine('audio muto'); avviso('L\'audio è muto: niente da scrivere', 'info', 2600); }
    else { lav.errore(spiegaErroreAI(msg)); avviso('I sottotitoli con l\'AI non sono partiti: ' + spiegaErroreAI(msg), 'errore', 6000); }
  } finally {
    lavoroSott = null;
  }
}

let lavoroVoce: AbortController | null = null;

/** i sottotitoli letti da una voce AI (NVIDIA Magpie, nell'app): una clip per frase sulla traccia "Voce AI" */
export async function faiParlareSottotitoli() {
  if (lavoroVoce) { avviso('Sto già facendo parlare i sottotitoli', 'info', 2000); return; }
  const p = store.doc;
  if (!motoreNemo()) { avviso('La voce AI usa il motore di NVIDIA, che c\'è nell\'app per Windows e Mac (nel browser no)', 'info', 4200); return; }
  if (!sottotitoliDi(p).righe.some((x) => x.testo.trim())) { avviso('Prima servono i sottotitoli: generali con l\'AI o scrivili', 'info', 3000); return; }
  const v = opzioniVoce();
  const lingua = linguaVoce(p, v.lingua || undefined);
  if (!lingua) { avviso('La voce parla italiano, inglese, spagnolo, francese, tedesco e cinese: scegli la lingua nel Finale → Lingue e AI', 'info', 4200); return; }
  if (!(await confermaAvvioAI({ compito: 'Fai parlare i sottotitoli', ambito: 'Tutte le righe dei sottotitoli · nuova traccia Voce AI', modello: 'Magpie · ' + v.voce, dettagli: 'Il motore nativo può scaricare anche i modelli di traduzione se necessari.' }))) return;
  if (lavoroVoce) return;
  const progetto = progettoAttuale();
  const ctrl = new AbortController();
  lavoroVoce = ctrl;
  const lav = nuova({ titolo: 'Voce AI dai sottotitoli', categoria: 'ai', alAnnulla: () => ctrl.abort() });
  try {
    const r = await doppia(structuredClone(p), { voce: v.voce, lingua, silenzia: v.silenzia, traduci: true }, (t, k) => lav.imposta(k, t), ctrl.signal);
    if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
    lav.imposta(0.97, 'Salvo l\'audio…');
    const nome = `Voce AI ${VOCI_MAGPIE[v.voce] ?? ''} ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '.')}.wav`.replace('  ', ' ');
    const blob = new Blob([codificaWav(r.audio, r.sr) as BlobPart], { type: 'audio/wav' });
    const path = await salvaMediaSulDisco(nome, blob);
    if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
    const file = new File([blob], nome, { type: 'audio/wav' });
    const [m] = await importaFile([{ name: nome, path, file: path ? undefined : file }], { chiediFormato: false });
    if (!m) throw new Error('non riesco a leggere l\'audio prodotto');
    if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
    const ids = store.edit('Voce AI', (pp) => posaVoce(pp, m.id, r.audio.length / r.sr, v.silenzia, r.posti));
    store.select(ids);
    lav.fine(`${r.frasi} frasi`);
    avviso(`🗣 Voce AI pronta: ${r.frasi} frasi, una clip per frase nella traccia "Voce AI"`, 'ok', 4200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'fermato') lav.annullata();
    else { lav.errore(spiegaErroreAI(msg)); avviso('La voce AI non è partita: ' + spiegaErroreAI(msg), 'errore', 6000); }
  } finally {
    lavoroVoce = null;
  }
}

/** una riga nuova al cursore (3 secondi, o fino alla riga dopo) col testo da scrivere subito */
export async function nuovaRigaQui() {
  const p = store.doc;
  const f = Math.round(store.head);
  const r = fps(p.rate);
  const righe = sottotitoliDi(p).righe;
  if (righe.some((x) => x.da <= f && x.a > f)) { avviso('Qui c\'è già una riga: doppio clic sulla riga SOTT per cambiarla', 'info', 2600); return; }
  const dopo = righe.filter((x) => x.da > f).sort((x, y) => x.da - y.da)[0];
  const a = Math.min(f + Math.round(3 * r), dopo ? dopo.da : Infinity);
  if (a - f < 4) { avviso('Non c\'è posto prima della riga dopo', 'info', 2000); return; }
  const testo = await chiedi('Sottotitolo', 'Il testo (può andare a capo)', '', true);
  if (testo === null) return;
  cambiaSott('Sottotitolo nuovo', (s) => { s.righe.push({ id: uid('s'), da: f, a, testo }); s.righe.sort((x, y) => x.da - y.da); });
}

/** dove stanno e come sono: in basso o in alto, grandezza, fascia, scritti nel video o solo nel file .srt */
export function stileSottotitoli() {
  const s = sottotitoliDi(store.doc);
  const d = dialogo('Sottotitoli: posizione e stile');
  const cambia = (label: string, fn: (s: Sottotitoli) => void) => { cambiaSott(label, (x) => fn(x)); };
  const chip = (nome: string, on: () => boolean, fai: () => void) => {
    const b = h('button', { class: 'chip' + (on() ? ' acceso' : ''), on: { click: () => { fai(); riga.querySelectorAll('.chip').forEach((x) => x.classList.remove('acceso')); b.classList.add('acceso'); } } }, nome);
    return b;
  };
  const riga = h('div', { class: 'isp-chips' },
    chip('In basso', () => !s.alto, () => cambia('Sottotitoli in basso', (x) => { x.alto = false; })),
    chip('In alto', () => s.alto, () => cambia('Sottotitoli in alto', (x) => { x.alto = true; })));
  const dim = h('input', { type: 'range', min: '24', max: '96', step: '1', value: String(s.dimensione) }) as HTMLInputElement;
  const val = h('b', null, String(s.dimensione));
  dim.addEventListener('input', () => { val.textContent = dim.value; });
  dim.addEventListener('change', () => cambia('Grandezza dei sottotitoli', (x) => { x.dimensione = Number(dim.value); }));
  const fascia = h('input', { type: 'checkbox' }) as HTMLInputElement; fascia.checked = s.fascia;
  fascia.addEventListener('change', () => cambia('Fascia dei sottotitoli', (x) => { x.fascia = fascia.checked; }));
  const nel = h('input', { type: 'checkbox' }) as HTMLInputElement; nel.checked = s.nelVideo;
  nel.addEventListener('change', () => cambia('Sottotitoli nel video', (x) => { x.nelVideo = nel.checked; }));
  d.corpo.append(
    h('label', { class: 'etichetta' }, 'Dove'), riga,
    h('div', { class: 'isp-riga' }, h('label', null, 'Grandezza'), dim, val),
    h('label', { class: 'riga-spunta' }, fascia, ' fascia scura dietro al testo'),
    h('label', { class: 'riga-spunta' }, nel, ' scritti nel video (se no escono solo nel file .srt)'),
    h('p', { class: 'nota' }, 'Le righe si spostano e si allungano nella riga SOTT della timeline; doppio clic su una riga per cambiarne il testo.'));
  d.piede.append(h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'Fatto'));
}

/** i sottotitoli scritti in un file a parte: .srt (quasi tutti i programmi) o .vtt (il web) */
export async function esportaSottotitoli(formato: 'srt' | 'vtt') {
  const p = store.doc;
  const testo = formato === 'srt' ? creaSrt(p) : creaVtt(p);
  if (!testo.replace('WEBVTT', '').trim()) { avviso('Non ci sono sottotitoli scritti da esportare', 'info', 2400); return; }
  const nome = p.name.replace(/[\\/:*?"<>|]/g, '_') + '_' + sottotitoliDi(p).lingua + '.' + formato;
  const r = await salvaTesto(nome, testo, formato);
  if (r) avviso(`💬 Sottotitoli salvati: ${r}`, 'ok', 3000);
}

/** apre un file .srt o .vtt e ne fa le righe (al posto di quelle che ci sono: Ctrl+Z le rimette) */
export function importaSottotitoli() {
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.srt,.vtt,text/plain';
  file.style.display = 'none';
  document.body.appendChild(file);
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.remove();
    if (!f) return;
    const righe = sistemaRighe(leggiSrt(await f.text(), store.doc), Infinity, 2, true);
    if (!righe.length) { avviso('In questo file non ho trovato sottotitoli', 'errore', 3000); return; }
    cambiaSott('Importa sottotitoli', (s) => { s.righe = righe; });
    document.dispatchEvent(new CustomEvent('dpv:sott', { detail: 'mostra' }));
    avviso(`💬 ${righe.length} righe importate (Ctrl+Z per tornare indietro)`, 'ok', 2800);
  });
  file.addEventListener('cancel', () => file.remove());
  file.click();
}
