// Voce e musica di una clip audio: «Questa è la voce» e, sulla musica, «Abbassa sotto la voce» (ducking).
// Il motore legge `ruoloAudio` della clip (o della traccia), `ducking` (clip, poi traccia) e le attenuazioni `duckKeys`
// che si rifanno con Rigenera; qui si cambia solo questo. Sta nelle Proprietà (sezione del volume) e nel Mixer (traccia).
import '../stile/coloreUI.css';
import type { Clip, Ducking, Project, RuoloAudio } from '../core/tipi';
import { store } from '../core/store';
import { impostazioneDucking, duckingValido, ruoloAudio } from '../core/ducking';
import { conIncroci } from '../media/audio';
import { firmaDuckingAttuale, preparaDucking } from '../media/ducking';
import { h } from './dom';

const errore = (e: unknown) => e instanceof Error ? e.message : String(e);
const clipDi = (p: Project, id: string) => p.clips.find((c) => c.id === id);
/** L'analisi in corso e l'ultimo messaggio restano qui: il pannello si rifà spesso, il lavoro no. */
const lavori = new Map<string, AbortController>();
const messaggi = new Map<string, string>();

/** Rigenera l'abbassamento di una musica (o di tutte). Controlla che il montaggio non sia cambiato nel frattempo. */
export async function rigeneraDucking(clipId: string | undefined, quandoCambia: () => void) {
  const chiave = clipId ?? '*';
  if (lavori.size) return;
  const controller = new AbortController(), progetto = store.doc, sequenza = progetto.seqAttiva;
  lavori.set(chiave, controller);
  const dice = (s: string) => { messaggi.set(chiave, s); quandoCambia(); };
  dice('Analizzo le voci…');
  try {
    const risultati = await preparaDucking(progetto, clipId ? [clipId] : undefined, controller.signal, dice);
    if (controller.signal.aborted) return;
    if (store.doc !== progetto || progetto.seqAttiva !== sequenza || risultati.some((r) => { const c = clipDi(progetto, r.id); return !c || firmaDuckingAttuale(progetto, c) !== r.firma; })) throw new Error('Il montaggio è cambiato durante l\'analisi: premi Rigenera');
    store.edit('Ducking automatico', (p) => { for (const r of risultati) { const c = clipDi(p, r.id)!; c.duckKeys = r.keys; c.duckFirma = r.firma; } });
    dice('Fatto. Ascolta e regola «Quanto abbassare» se serve.');
  } catch (e) { dice(errore(e)); }
  finally { lavori.delete(chiave); quandoCambia(); }
}

/** La traccia intera è la voce (o non lo è più): serve al Mixer. */
export function segnaTracciaVoce(trackId: string, voce: boolean) {
  store.edit(voce ? 'Traccia = voce' : 'Traccia non più voce', (p) => {
    const t = p.tracks.find((x) => x.id === trackId); if (t) t.ruoloAudio = voce ? 'voce' : undefined;
  });
}

/**
 * Il pezzo per una clip audio. Ritorna `null` se la clip non è su una traccia audio (lì il ducking non vale).
 * `aggiorna()` lo rifà dai dati attuali: chi lo ospita lo chiama quando cambia il documento.
 */
export function creaDuckingClip(clipId: string, opzioni: { ascolta?: () => void } = {}) {
  const el = h('div', { class: 'ck-ducking' });
  const modifica = (nome: string, fn: (p: Project, c: Clip) => void) => store.edit(nome, (p) => { const c = clipDi(p, clipId); if (c) fn(p, c); });
  const numero = (nome: string, v: number, min: number, max: number, step: number, fn: (v: number) => void) => {
    const input = h('input', { type: 'number', value: v, min, max, step, 'aria-label': nome });
    input.onchange = () => { if (Number.isFinite(input.valueAsNumber)) fn(Math.max(min, Math.min(max, input.valueAsNumber))); };
    return h('label', { class: 'ck-numero' }, h('span', null, nome), input);
  };
  const interruttore = (testo: string, acceso: boolean, fn: (on: boolean) => void, aiuto: string) => {
    const i = h('input', { type: 'checkbox', checked: acceso, title: aiuto });
    i.onchange = () => fn(i.checked);
    return h('label', { class: 'ck-interruttore' + (acceso ? ' acceso' : ''), title: aiuto }, i, h('span', { class: 'led' + (acceso ? ' acceso' : '') }), h('span', null, testo));
  };
  const bottone = (nome: string, fn: () => void, spento = false) => h('button', { type: 'button', class: 'btn-mini', disabled: spento, on: { click: fn } }, nome);

  function aggiorna() {
    el.replaceChildren();
    const p = store.doc, c = clipDi(p, clipId), t = c && p.tracks.find((x) => x.id === c.track);
    if (!c || t?.kind !== 'audio') return;
    const ruolo = ruoloAudio(p, c), voce = ruolo === 'voce';
    el.append(interruttore('Questa è la voce', voce, (on) => modifica('Questa è la voce', (pp, cc) => {
      const daTraccia: RuoloAudio | undefined = pp.tracks.find((x) => x.id === cc.track)?.ruoloAudio;
      // se la traccia è già la voce, spegnere vuol dire «no, questa clip no»; se no basta togliere il segno
      cc.ruoloAudio = on ? 'voce' : daTraccia === 'voce' ? 'nessuno' : undefined;
    }), 'Le voci sono ascoltate: la musica si abbassa quando parlano'));
    if (!voce) {
      const d = impostazioneDucking(p, c), acceso = ruolo === 'musica' && d.attivo;
      el.append(interruttore('Abbassa sotto la voce', acceso, (on) => modifica('Abbassa sotto la voce', (pp, cc) => {
        const base: Ducking = { ...impostazioneDucking(pp, cc), attivo: on };
        if (on) cc.ruoloAudio = 'musica';
        cc.ducking = base;
      }), 'Questa è musica: si abbassa da sola quando c\'è una voce'));
      if (acceso) {
        const cambia = (fn: (d: Ducking) => void) => modifica('Regola l\'abbassamento', (_, cc) => { cc.ducking = { ...d }; fn(cc.ducking); });
        const chiave = c.id, inCorso = lavori.size > 0;
        const valida = duckingValido(conIncroci(p), c);
        el.append(
          numero('Quanto abbassare (dB)', d.quantita, 0, 60, .5, (v) => cambia((x) => { x.quantita = v; })),
          numero('Attacco (s)', d.attacco, .005, 10, .005, (v) => cambia((x) => { x.attacco = v; })),
          numero('Rilascio (s)', d.rilascio, .005, 10, .005, (v) => cambia((x) => { x.rilascio = v; })),
          h('details', { class: 'ck-altre' }, h('summary', null, 'Altre regolazioni'),
            numero('Soglia della voce (dBFS)', d.soglia, -90, 0, 1, (v) => cambia((x) => { x.soglia = v; })),
            numero('Isteresi (dB)', d.isteresi, 0, 24, 1, (v) => cambia((x) => { x.isteresi = v; })),
            numero('Durata minima (s)', d.minimo, 0, 2, .01, (v) => cambia((x) => { x.minimo = v; })),
            numero('Tenuta (s)', d.hold, 0, 5, .01, (v) => cambia((x) => { x.hold = v; }))),
          h('p', { class: valida ? 'nota ck-ok' : 'nota ck-da-fare' }, valida ? 'Abbassamento pronto.' : 'Da rigenerare: finché non premi Rigenera la musica resta al volume che hai scelto.'),
          h('div', { class: 'isp-pulsanti' },
            bottone('Rigenera', () => void rigeneraDucking(chiave, aggiorna), inCorso),
            bottone('Rigenera tutta la musica', () => void rigeneraDucking(undefined, aggiorna), inCorso),
            bottone('Usa per tutta la traccia', () => modifica('Ducking della traccia', (pp, cc) => {
              pp.tracks.find((x) => x.id === cc.track)!.ducking = { ...d };
              pp.tracks.find((x) => x.id === cc.track)!.ruoloAudio = 'musica';
              for (const k of pp.clips) if (k.track === cc.track) k.ducking = undefined;
            })),
            opzioni.ascolta ? bottone('Ascolta', opzioni.ascolta) : null,
            inCorso ? bottone('Ferma', () => lavori.forEach((l) => l.abort())) : null),
          h('p', { class: 'nota ck-stato', role: 'status', 'aria-live': 'polite' }, messaggi.get(chiave) ?? messaggi.get('*') ?? ''),
          h('p', { class: 'nota' }, 'Sente il volume delle clip segnate come voce, anche i rumori forti. Dopo tagli e spostamenti premi Rigenera.'));
      } else el.append(h('p', { class: 'nota' }, 'Segna le voci con «Questa è la voce», poi accendi questo sulla musica.'));
    }
  }
  aggiorna();
  return { el, aggiorna };
}
