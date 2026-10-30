// Le quattro misure sotto il monitor del Finale: VOLUME (LUFS integrati), PICCO (dBTP), DURATA, USCITA.
// Volume e picco sono misurati davvero sul mixaggio del progetto (src/media/loudness.ts, norma BS.1770); la durata e
// l'uscita si calcolano dalle scelte. Sotto i sei minuti la misura parte da sola quando si guarda il Finale; sopra
// si preme «Misura» (è un lavoro vero, si vede e si ferma da Attività).
import { store } from '../core/store';
import { NOME_CONTENITORE } from '../core/esportazione';
import { lucePicco, luceVolume, numeroDb, PICCO_TETTO, type Luce } from '../core/loudness';
import {
  AUTOMATICA_FINO_A, fermaMisura, haAudio, misura, misuraValida, quandoMisura, statoMisura, trattoDa, ultimaMisura,
} from '../media/loudness';
import { h } from './dom';
import { quandoScelte, trattoUscita, uscitaSubito } from './uscita';

const COLORE: Record<Luce, string> = { verde: 'ok', ambra: 'att', rossa: 'ko', spenta: 'sp' };

/** "4:12" · "1:02:03" (la durata di tutto il montaggio, come sul display) */
export function durataDisplay(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const t = Math.round(sec);
  const hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

export interface MisureFinale {
  el: HTMLElement;
  mostrata: (on: boolean) => void;
}

export function creaMisureFinale(): MisureFinale {
  const cella = (id: string, nome: string) => {
    const v = h('span', { class: 'fm-valore' }, '—');
    const s = h('span', { class: 'fm-sotto' });
    const extra = h('span', { class: 'fm-extra' });
    const el = h('div', { class: 'fm-cella', 'data-m': id }, h('span', { class: 'fm-nome' }, nome), v, h('span', { class: 'fm-riga' }, s, extra));
    return { el, v, s, extra };
  };
  const volume = cella('volume', 'VOLUME');
  const picco = cella('picco', 'PICCO');
  const durata = cella('durata', 'DURATA');
  const uscita = cella('uscita', 'USCITA');
  const el = h('div', { class: 'fin-misure', 'aria-label': 'Misure del montaggio' }, volume.el, picco.el, durata.el, uscita.el);

  const tasto = h('button', { class: 'fm-tasto', type: 'button', title: 'Misura il volume vero del montaggio (LUFS integrati e picco): non cambia niente nel progetto', on: { click: () => void lancia() } }, 'Misura');
  const ferma = h('button', { class: 'fm-tasto', type: 'button', title: 'Ferma la misura', on: { click: () => fermaMisura() } }, 'Ferma');
  let visibile = false;
  let attesa = 0;

  const tratto = () => trattoDa(store.doc, trattoUscita().usa);
  const lancia = () => misura(store.doc, tratto());

  function ridisegna() {
    if (!visibile) return;
    const p = store.doc;
    const { imp, pr, traguardo } = uscitaSubito();
    // traguardo per la spia: quello scelto con la normalizzazione, se no quello della destinazione
    const t = tratto();
    const st = statoMisura();
    const valida = misuraValida(p, t);
    const ult = ultimaMisura();
    const r = ult?.r ?? null;
    const vecchia = !!r && !valida;
    const misurando = st.tipo === 'misuro';
    const target = traguardo ?? pr.lufs ?? null;

    // VOLUME e PICCO
    volume.el.classList.toggle('vecchia', vecchia);
    picco.el.classList.toggle('vecchia', vecchia);
    volume.extra.replaceChildren();
    if (misurando) {
      volume.v.textContent = '…'; picco.v.textContent = '…';
      volume.el.dataset.luce = picco.el.dataset.luce = 'sp';
      volume.s.textContent = `misuro ${Math.round(st.k * 100)}%`; picco.s.textContent = 'true peak 4×';
      volume.extra.replaceChildren(ferma);
    } else if (r && r.lufs !== null) {
      const lv = vecchia ? 'spenta' : luceVolume(r.lufs, target);
      const lp = vecchia ? 'spenta' : lucePicco(r.picco);
      volume.v.textContent = `${numeroDb(r.lufs)} LUFS`;
      picco.v.textContent = r.picco === null ? '—' : `${numeroDb(r.picco)} dBTP`;
      volume.el.dataset.luce = COLORE[lv]; picco.el.dataset.luce = COLORE[lp];
      volume.s.textContent = vecchia ? 'da rimisurare' : target !== null ? `traguardo ${numeroDb(target, 0)}` : 'integrato';
      picco.s.textContent = vecchia ? 'da rimisurare' : `limite ${numeroDb(PICCO_TETTO, 0)} dBTP`;
      if (vecchia) volume.extra.replaceChildren(tasto);
    } else if (r) {
      // misurato, ma non si sente niente
      volume.v.textContent = '—'; picco.v.textContent = r.picco === null ? '—' : `${numeroDb(r.picco)} dBTP`;
      volume.el.dataset.luce = picco.el.dataset.luce = 'sp';
      volume.s.textContent = haAudio(p) ? 'troppo piano' : 'nessun suono'; picco.s.textContent = '';
    } else {
      volume.v.textContent = '—'; picco.v.textContent = '—';
      volume.el.dataset.luce = picco.el.dataset.luce = 'sp';
      volume.s.textContent = st.tipo === 'errore' ? 'misura non riuscita' : haAudio(p) ? 'non misurato' : 'nessun suono';
      picco.s.textContent = st.tipo === 'errore' ? st.msg.slice(0, 40) : '';
      if (haAudio(p)) volume.extra.replaceChildren(tasto);
    }

    // DURATA e USCITA
    durata.v.textContent = durataDisplay(t.a - t.da);
    durata.s.textContent = trattoUscita().usa ? 'attacco–stacco' : 'tutto il montaggio';
    if (imp.formato === 'wav') {
      uscita.v.textContent = 'WAV'; uscita.s.textContent = '48 kHz · stereo';
    } else {
      uscita.v.textContent = `${imp.w}×${imp.h}`;
      uscita.s.textContent = `${imp.fps.toFixed(imp.fps % 1 ? 2 : 0).replace('.', ',')} fps · ${NOME_CONTENITORE[imp.formato]}`;
    }
    uscita.el.dataset.luce = durata.el.dataset.luce = 'oro';
  }

  /** la misura parte da sola solo se il montaggio è corto, ha suono, e non c'è già una misura buona */
  function programma() {
    clearTimeout(attesa);
    if (!visibile) return;
    const p = store.doc, t = tratto();
    if (misuraValida(p, t) || statoMisura().tipo === 'misuro' || !haAudio(p)) return;
    if (t.a - t.da > AUTOMATICA_FINO_A || t.a - t.da < 0.05) return;
    // un errore non si ripete all'infinito: se l'ultima misura di questo montaggio è fallita si aspetta il tasto
    const st = statoMisura();
    if (st.tipo === 'errore') return;
    attesa = window.setTimeout(() => { if (visibile && !misuraValida(store.doc, tratto()) && statoMisura().tipo !== 'misuro') void lancia(); }, 1400);
  }

  const aggiorna = () => { ridisegna(); programma(); };
  store.on('doc', aggiorna);
  quandoMisura(aggiorna);
  quandoScelte(aggiorna);

  return {
    el,
    mostrata(on) {
      visibile = on;
      if (!on) { clearTimeout(attesa); return; }
      aggiorna();
    },
  };
}
