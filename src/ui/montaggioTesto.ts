// Un pannello del banco: il parlato si sceglie come testo, ma le modifiche sono veri tagli nella timeline.
import '../stile/montaggioTesto.css';
import { store } from '../core/store';
import type { Clip } from '../core/tipi';
import { end } from '../core/progetto';
import { fps, frameToTc } from '../core/timecode';
import { applicaTagli, controllaTagli, intervalliIntercalari, intervalliParole, intervalliSilenzi, paroleInClip, pianoTagli, tempoDopoTagli, type Intervallo, type ParolaTimeline, type PianoTagli } from '../core/montaggioTesto';
import { fermaVoce, MODELLI, testoDellaClip } from '../media/voce';
import { nuova, progettoAttuale } from '../media/attivita';
import { spiegaErroreAI } from '../media/erroriAI';
import { motore } from '../motore';
import { opzioniAI } from './sottotitoliRapidi';
import { avviso, dialogo, h } from './dom';

let aperto: (() => void) | null = null;
const gruppo = (c: Clip) => c.track + ':' + (c.parlato && c.parlato.media === c.media ? c.parlato.id : c.id);

export function finestraMontaggioTesto() {
  if (aperto) { aperto(); return; }
  motore.stop();
  motore.setMonitor('recorder');
  const iniziale = store.doc.clips.find((c) => store.sel.has(c.id) && c.kind === 'media')
    ?? store.doc.clips.find((c) => c.kind === 'media' && c.start <= store.head && end(c) > store.head);
  let scelta = iniziale ? gruppo(iniziale) : '';
  let parole: ParolaTimeline[] = [], scelte = new Set<number>(), ancora = 0;
  let piano: PianoTagli | null = null, revisione = -1, ctrl: AbortController | null = null, chiuso = false;
  const pulisci: (() => void)[] = [];
  const ferma = () => { if (ctrl) { ctrl.abort(); fermaVoce(); } };
  const d = dialogo('Testo · monta dal parlato', { largo: true, onChiudi: () => {
    chiuso = true; ferma(); pulisci.forEach((fn) => fn()); aperto = null;
  } });
  d.el.classList.add('montaggio-testo');
  aperto = () => d.el.focus();
  d.el.tabIndex = -1;
  const clip = h('select', { class: 'mini-select', 'aria-label': 'Clip da montare dal testo' });
  const o = opzioniAI();
  const lingua = h('select', { class: 'mini-select', 'aria-label': 'Lingua del parlato' },
    ['it:Italiano', 'auto:Automatica', 'en:Inglese', 'fr:Francese', 'es:Spagnolo', 'de:Tedesco', 'pt:Portoghese'].map((x) => {
      const [value, nome] = x.split(':'); return h('option', { value }, nome);
    }));
  lingua.value = o.lingua;
  if (!lingua.value) lingua.value = 'it';
  const modello = h('select', { class: 'mini-select', 'aria-label': 'Modello Whisper' }, MODELLI.map((m) => h('option', { value: m.id }, m.nome)));
  modello.value = o.modello;
  if (!modello.value) modello.value = MODELLI[1].id;
  const stato = h('p', { class: 'nota', role: 'status', 'aria-live': 'polite' });
  const testo = h('div', { class: 'testo-parlato', tabIndex: 0, role: 'group', 'aria-label': 'Parole: trascina o usa Maiusc e clic per scegliere, Canc per tagliare' });
  const soglia = h('input', { class: 'num', type: 'number', min: '0.1', max: '60', step: '0.1', value: '0.7', 'aria-label': 'Silenzio minimo in secondi' });
  const elenco = h('input', { type: 'text', value: 'ehm, uhm, allora', 'aria-label': 'Intercalari separati da virgole' });
  const anteprima = h('p', { class: 'testo-anteprima', role: 'status', 'aria-live': 'polite' });
  const trascrivi = h('button', { class: 'btn primario', on: { click: () => void ascolta() } }, 'Trascrivi la clip');
  const togli = h('button', { class: 'btn', on: { click: () => eliminaParole() } }, 'Togli le parole scelte (Canc)');
  const silenzi = h('button', { class: 'btn', on: { click: () => {
    if (!soglia.checkValidity() || !Number.isFinite(soglia.valueAsNumber)) { soglia.reportValidity(); return; }
    const r = fps(store.doc.rate);
    prepara(pezzi().flatMap((c) => intervalliSilenzi(parole.filter((w) => w.clip === c.id), { da: c.start, a: end(c) }, soglia.valueAsNumber * r, Math.round(0.08 * r))));
  } } }, 'Togli i silenzi più lunghi di');
  const intercalari = h('button', { class: 'btn', on: { click: () => prepara(intervalliIntercalari(parole, elenco.value, fps(store.doc.rate) * 3)) } }, 'Togli ehm/uhm/allora ripetuti');
  const applica = h('button', { class: 'btn primario', on: { click: () => esegui('Testo · pulisci il parlato') } }, 'Applica i tagli');
  const indietro = h('button', { class: 'btn', on: { click: () => store.doUndo() } }, 'Annulla');
  const pezzi = () => store.doc.clips.filter((c) => gruppo(c) === scelta && c.kind === 'media');
  const azzera = () => { piano = null; anteprima.textContent = ''; applica.disabled = true; testo.querySelectorAll('.taglio').forEach((n) => n.classList.remove('taglio')); };
  const evidenzia = () => {
    testo.querySelectorAll<HTMLElement>('[data-parola]').forEach((n) => n.classList.toggle('scelta', scelte.has(Number(n.dataset.parola))));
    togli.disabled = !!ctrl || !scelte.size;
    togli.textContent = scelte.size ? `Togli ${scelte.size} ${scelte.size === 1 ? 'parola' : 'parole'} (Canc)` : 'Togli le parole scelte (Canc)';
  };
  const leggiSelezione = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !testo.contains(s.anchorNode) || !testo.contains(s.focusNode)) return;
    const r = s.getRangeAt(0);
    scelte = new Set([...testo.querySelectorAll<HTMLElement>('[data-parola]')].filter((n) => r.intersectsNode(n)).map((n) => Number(n.dataset.parola)));
    azzera(); evidenzia();
  };
  const vaiAlla = (i: number, estendi: boolean) => {
    const w = parole[i]; if (!w) return;
    motore.stop(); store.setHead(w.da);
    scelte = estendi ? new Set(parole.map((_, k) => k).filter((k) => k >= Math.min(ancora, i) && k <= Math.max(ancora, i))) : new Set([i]);
    if (!estendi) ancora = i;
    azzera(); evidenzia();
  };
  const aggiorna = () => {
    if (chiuso) return;
    azzera(); scelte.clear();
    const lista = store.doc.clips.filter((c) => c.kind === 'media' && store.doc.media.some((m) => m.id === c.media && m.type !== 'image'));
    const gruppi = [...new Map(lista.map((c) => [gruppo(c), c])).entries()];
    if (!gruppi.some(([k]) => k === scelta)) scelta = gruppi[0]?.[0] ?? '';
    clip.replaceChildren(...gruppi.map(([value, c]) => h('option', { value }, `${c.name} · ${frameToTc(c.start, store.doc.rate, store.doc.drop)}`)));
    clip.value = scelta;
    parole = pezzi().flatMap((c) => paroleInClip(store.doc, c)).sort((a, b) => a.da - b.da);
    testo.replaceChildren(...parole.flatMap((w, i) => [h('span', { class: 'testo-parola', 'data-parola': i, tabIndex: 0, role: 'button', title: frameToTc(w.da, store.doc.rate, store.doc.drop), on: {
      click: (e: MouseEvent) => { if (!window.getSelection()?.isCollapsed) { leggiSelezione(); return; } vaiAlla(i, e.shiftKey); },
      keydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vaiAlla(i, e.shiftKey); } },
    } }, w.testo), ' ']));
    if (!parole.length) testo.textContent = lista.length ? 'Premi «Trascrivi la clip» per vedere il parlato con i tempi per parola.' : 'Metti una clip video o audio nella timeline, poi riapri Testo.';
    trascrivi.disabled = !!ctrl || !pezzi().length;
    trascrivi.textContent = parole.length ? 'Rifai il testo della clip' : 'Trascrivi la clip';
    silenzi.disabled = intercalari.disabled = !!ctrl || !parole.length;
    clip.disabled = lingua.disabled = modello.disabled = !!ctrl;
    indietro.disabled = !!ctrl || !store.canUndo();
    evidenzia();
  };
  function prepara(intervalli: Intervallo[]) {
    if (ctrl) return;
    piano = pianoTagli(intervalli, store.doc); revisione = store.revisione;
    anteprima.textContent = `${piano.intervalli.length} tagli · risparmi ${piano.secondi.toFixed(2).replace('.', ',')} s. Chiudo il tempo su tutte le tracce.`;
    let errore = '';
    try { controllaTagli(store.doc, piano); } catch (e) { errore = (e as Error).message; }
    if (errore) anteprima.textContent += ' ' + errore;
    applica.disabled = !piano.intervalli.length || !!errore;
    testo.querySelectorAll<HTMLElement>('[data-parola]').forEach((n) => {
      const w = parole[Number(n.dataset.parola)];
      n.classList.toggle('taglio', !!piano?.intervalli.some((x) => x.da < w.a && x.a > w.da));
    });
  }
  function esegui(label: string) {
    if (!piano?.intervalli.length || ctrl) return;
    if (revisione !== store.revisione) { azzera(); avviso('Il montaggio è cambiato: rifai l\'anteprima', 'info'); return; }
    try {
      const tagli = piano;
      controllaTagli(store.doc, tagli); motore.stop();
      const head = tempoDopoTagli(store.head, tagli.intervalli);
      store.edit(label, (p) => applicaTagli(p, tagli));
      store.setHead(head);
      window.getSelection()?.removeAllRanges();
      aggiorna();
    } catch (e) { avviso((e as Error).message, 'info'); }
  }
  function eliminaParole() {
    leggiSelezione();
    if (!scelte.size || ctrl) return;
    prepara(intervalliParole(parole, scelte));
    esegui('Testo · togli parole');
  }
  async function ascolta() {
    if (ctrl) return;
    const prima = pezzi()[0]; if (!prima) return;
    // Una trascrizione nuova riguarda il pezzo scelto. Gli altri pezzi già tagliati conservano la loro.
    const p0 = store.doc, rev = store.revisione, progetto = progettoAttuale(), seq = p0.seqAttiva;
    const copia = structuredClone(p0);
    const segnale = new AbortController(); ctrl = segnale;
    const lavoro = nuova({ titolo: 'Testo della clip', categoria: 'ai', alAnnulla: () => { segnale.abort(); fermaVoce(); } });
    aggiorna();
    try {
      const parlato = await testoDellaClip(copia, prima.id, { ...o, lingua: lingua.value, modello: modello.value, motore: 'whisper', traduci: false }, (fase, k) => {
        if (!chiuso) stato.textContent = fase; lavoro.imposta(k, fase);
      }, segnale.signal);
      if (segnale.signal.aborted || chiuso || store.doc !== p0 || store.revisione !== rev || progetto !== progettoAttuale() || store.doc.seqAttiva !== seq) throw new Error('fermato');
      store.edit('Testo · trascrivi la clip', (p) => { p.clips.find((c) => c.id === prima.id)!.parlato = parlato; });
      scelta = prima.track + ':' + parlato.id;
      lavoro.fine('Testo pronto'); stato.textContent = 'Testo pronto. Scegli le parole e premi Canc.';
    } catch (e) {
      const msg = (e as Error).message;
      if (segnale.signal.aborted || msg === 'fermato') { lavoro.annullata(); if (!chiuso) stato.textContent = 'Trascrizione fermata. Il montaggio è rimasto com\'era.'; }
      else { const motivo = spiegaErroreAI(msg); lavoro.errore(motivo); if (!chiuso) stato.textContent = motivo; }
    } finally { ctrl = null; aggiorna(); }
  }
  clip.addEventListener('change', () => { scelta = clip.value; aggiorna(); });
  soglia.addEventListener('input', azzera); elenco.addEventListener('input', azzera);
  const selezione = () => leggiSelezione();
  document.addEventListener('selectionchange', selezione);
  pulisci.push(() => document.removeEventListener('selectionchange', selezione));
  pulisci.push(store.on('doc', aggiorna));
  testo.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); eliminaParole(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault(); window.getSelection()?.removeAllRanges(); scelte = new Set(parole.map((_, i) => i)); azzera(); evidenzia();
    }
  });
  d.el.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, select, textarea') || ctrl) return;
    if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
      e.preventDefault(); e.stopPropagation();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) store.doRedo(); else store.doUndo();
    }
  });
  d.corpo.append(
    h('div', { class: 'testo-riga' }, h('label', null, 'Clip ', clip)),
    h('div', { class: 'testo-riga' }, h('label', null, 'Lingua ', lingua), h('label', null, 'Whisper ', modello), trascrivi),
    h('p', { class: 'nota' }, 'Tutto sul computer. Il modello si scarica solo la prima volta. Clic su una parola: cursore lì. Trascina sul testo o usa Maiusc e clic per scegliere più parole; Canc le taglia e chiude il buco su tutte le tracce. Ctrl+Z annulla il gruppo di tagli.'),
    stato, testo, togli,
    h('div', { class: 'testo-riga' }, silenzi, soglia, 's'),
    h('div', { class: 'testo-riga' }, intercalari, elenco),
    h('p', { class: 'nota' }, 'I silenzi sono le pause indicate dai tempi di Whisper: resta un piccolo respiro ai bordi. Controlla i tagli prima di applicare. Gli intercalari dell\'elenco si tolgono interi; di «allora» ripetuto resta il primo. Cambia l\'elenco con le virgole.'),
    anteprima, applica);
  d.piede.append(indietro, h('button', { class: 'btn', on: { click: d.chiudi } }, 'Chiudi'));
  aggiorna(); testo.focus();
}
