// Pannello autonomo: l'host decide dove mostrarlo. Nessuna modifica alla pagina Montaggio.
import '../stile/coloreAvanzato.css';
import type { CanaleCurva, Clip, ColoreAvanzato, Ducking, Project, RuoloAudio } from '../core/tipi';
import { store } from '../core/store';
import { DUCKING0, duckingValido, impostazioneDucking, ruoloAudio } from '../core/ducking';
import { conIncroci } from '../media/audio';
import { firmaDuckingAttuale, preparaDucking } from '../media/ducking';
import { leggiLut } from '../render/lut';
import { CANALI_CURVA, identitaCurva, normalizzaCurva, valutaCurva } from '../render/curve';
import { h } from './dom';

const NOMI_CURVE: Record<CanaleCurva, string> = { master: 'RGB insieme', red: 'Rosso', green: 'Verde', blue: 'Blu', luma: 'Luma · Rec.709' };
const errore = (e: unknown) => e instanceof Error ? e.message : String(e);
const clipDi = (p: Project, id: string) => p.clips.find((c) => c.id === id);

/**
 * Uso: const pannello = creaPannelloColoreAvanzato(id, { ascolta: () => … }); contenitore.append(pannello.el).
 * Si aggiorna da solo su doc/undo; chiamare distruggi() quando si chiude. Ascolta è affidato al trasporto dell'host.
 */
export function creaPannelloColoreAvanzato(clipId: string, opzioni: { ascolta?: () => void } = {}) {
  const el = h('section', { class: 'colore-avanzato', 'aria-label': 'Colore avanzato e ducking' });
  let canale: CanaleCurva = 'master', trascina = false, morto = false, lavoro: AbortController | null = null;
  let messaggio = '', selezionato = 'inizio';
  const stato = h('p', { class: 'ca-stato', role: 'status', 'aria-live': 'polite' });
  const dice = (s: string) => { messaggio = s; stato.textContent = s; };
  const modifica = (nome: string, fn: (p: Project, c: Clip) => void) => {
    store.edit(nome, (p) => { const c = clipDi(p, clipId); if (c) fn(p, c); });
  };
  const cambiaColore = (fn: (col: ColoreAvanzato) => void) => modifica('Colore della clip', (_, c) => { c.fx.colore ??= {}; fn(c.fx.colore); });
  const numero = (nome: string, v: number, min: number, max: number, step: number, fn: (v: number) => void) => {
    const input = h('input', { type: 'number', value: v, min, max, step, 'aria-label': nome });
    input.onchange = () => { if (Number.isFinite(input.valueAsNumber)) fn(Math.max(min, Math.min(max, input.valueAsNumber))); };
    return h('label', { class: 'ca-numero' }, h('span', null, nome), input);
  };
  const bottone = (nome: string, fn: () => void, disabled = false) => h('button', { type: 'button', class: 'btn', disabled, on: { click: fn } }, nome);

  function ruota(col: ColoreAvanzato, campo: 'lift' | 'gamma' | 'gain', nome: string) {
    const base = campo === 'lift' ? 0 : 1, scala = campo === 'lift' ? .25 : .75;
    const valori = col[campo] ?? [base, base, base];
    const medio = valori.reduce((a, b) => a + b, 0) / 3;
    const gruppo = h('fieldset', { class: 'ca-ruota' }, h('legend', null, nome));
    const disco = h('div', { class: 'ca-disco', role: 'img', 'aria-label': `${nome}: trascina il colore, oppure usa i campi RGB` });
    const punto = h('i', { class: 'ca-punto' });
    punto.style.left = `${50 + Math.max(-1, Math.min(1, (valori[0] - medio) / scala)) * 45}%`;
    punto.style.top = `${50 + Math.max(-1, Math.min(1, (valori[1] - valori[2]) / (Math.sqrt(3) * scala))) * 45}%`;
    disco.append(punto);
    disco.onpointerdown = (e) => {
      if (e.button !== 0 || lavoro) return;
      trascina = true; store.begin(nome); disco.setPointerCapture(e.pointerId);
      const muovi = (e: PointerEvent) => {
        const r = disco.getBoundingClientRect();
        let x = (e.clientX - r.left - r.width / 2) / (r.width * .45), y = (e.clientY - r.top - r.height / 2) / (r.height * .45);
        const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
        const c = clipDi(store.doc, clipId); if (!c) return;
        c.fx.colore ??= {};
        c.fx.colore[campo] = [medio + x * scala, medio + (-x / 2 + y * Math.sqrt(3) / 2) * scala, medio + (-x / 2 - y * Math.sqrt(3) / 2) * scala]
          .map((v) => Math.max(campo === 'gamma' ? .1 : campo === 'gain' ? 0 : -1, Math.min(campo === 'lift' ? 1 : 4, v))) as [number, number, number];
        punto.style.left = `${50 + x * 45}%`; punto.style.top = `${50 + y * 45}%`; store.liveChange();
      };
      disco.onpointermove = muovi;
      disco.onpointerup = () => { disco.onpointermove = null; trascina = false; store.commit(); aggiorna(); };
      disco.onpointercancel = () => { disco.onpointermove = null; trascina = false; store.cancelLive(); aggiorna(); };
      muovi(e);
    };
    gruppo.append(disco, numero('Livello', medio, campo === 'lift' ? -1 : .1, campo === 'lift' ? 1 : 4, .01, (v) => cambiaColore((c) => {
      c[campo] = valori.map((x) => Math.max(campo === 'gamma' ? .1 : campo === 'gain' ? 0 : -1, Math.min(campo === 'lift' ? 1 : 4, x + v - medio))) as [number, number, number];
    })));
    ['R', 'G', 'B'].forEach((n, i) => gruppo.append(numero(n, valori[i], campo === 'lift' ? -1 : campo === 'gain' ? 0 : .1, campo === 'lift' ? 1 : 4, .01, (v) => cambiaColore((c) => {
      const vv: [number, number, number] = [...valori]; vv[i] = v; c[campo] = vv;
    }))));
    return gruppo;
  }

  function editorCurve(col: ColoreAvanzato) {
    const box = h('fieldset', null, h('legend', null, 'Curve'));
    const scelta = h('select', { 'aria-label': 'Canale della curva' }, CANALI_CURVA.map((c) => h('option', { value: c, selected: c === canale }, NOMI_CURVE[c])));
    scelta.onchange = () => { canale = scelta.value as CanaleCurva; selezionato = 'inizio'; aggiorna(); };
    const punti = normalizzaCurva(col.curve?.[canale]);
    const tela = h('canvas', { width: 320, height: 200, class: 'ca-curva', 'aria-label': 'Curva: trascina i punti; doppio clic per aggiungerne uno' });
    const disegna = () => {
      const ctx = tela.getContext('2d')!;
      const p = normalizzaCurva(clipDi(store.doc, clipId)?.fx.colore?.curve?.[canale]);
      ctx.fillStyle = '#17171e'; ctx.fillRect(0, 0, 320, 200); ctx.strokeStyle = '#44444f'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 80, 0); ctx.lineTo(i * 80, 200); ctx.moveTo(0, i * 50); ctx.lineTo(320, i * 50); ctx.stroke(); }
      ctx.strokeStyle = canale === 'red' ? '#ff7777' : canale === 'green' ? '#88df98' : canale === 'blue' ? '#88baff' : '#ffe09a'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= 320; x++) { const y = (1 - valutaCurva(p, x / 320)) * 200; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
      for (const pt of p) { ctx.beginPath(); ctx.arc(pt.x * 320, (1 - pt.y) * 200, pt.id === selezionato ? 6 : 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
    };
    const coordinate = (e: MouseEvent) => { const r = tela.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) }; };
    tela.ondblclick = (e) => {
      const q = coordinate(e); if (q.x <= .005 || q.x >= .995 || punti.some((p) => Math.abs(p.x - q.x) < .005)) return;
      selezionato = crypto.randomUUID();
      cambiaColore((c) => { c.curve ??= {}; c.curve[canale] = normalizzaCurva([...punti, { id: selezionato, ...q }]); });
    };
    tela.onpointerdown = (e) => {
      if (e.button !== 0 || lavoro) return;
      const q = coordinate(e), p = punti.reduce((a, b) => Math.hypot(a.x - q.x, a.y - q.y) < Math.hypot(b.x - q.x, b.y - q.y) ? a : b);
      if (Math.hypot(p.x - q.x, p.y - q.y) > .08) return;
      selezionato = p.id; trascina = true; store.begin('Curva colore'); tela.setPointerCapture(e.pointerId);
      let modificata = false;
      const indice = punti.indexOf(p);
      tela.onpointermove = (e) => {
        const q = coordinate(e), c = clipDi(store.doc, clipId); if (!c) return;
        p.x = indice === 0 ? 0 : indice === punti.length - 1 ? 1 : Math.max(punti[indice - 1].x + .001, Math.min(punti[indice + 1].x - .001, q.x)); p.y = q.y;
        modificata = true;
        c.fx.colore ??= {}; c.fx.colore.curve ??= {}; c.fx.colore.curve[canale] = punti.map((p) => ({ ...p })); store.liveChange(); disegna();
      };
      tela.onpointerup = () => { tela.onpointermove = null; trascina = false; store.commit(modificata); aggiorna(); };
      tela.onpointercancel = () => { tela.onpointermove = null; trascina = false; store.cancelLive(); aggiorna(); };
      disegna();
    };
    box.append(scelta, tela, h('p', { class: 'nota' }, 'Doppio clic: aggiungi un punto. Gli estremi restano ai bordi.'));
    for (const [i, p] of punti.entries()) {
      const riga = h('div', { class: 'ca-punto-riga' }, numero(`Ingresso ${i + 1}`, p.x, i ? punti[i - 1].x + .001 : 0, i < punti.length - 1 ? punti[i + 1].x - .001 : 1, .001, (v) => {
        if (i === 0 || i === punti.length - 1) return;
        cambiaColore((c) => { c.curve ??= {}; c.curve[canale] = punti.map((q) => q.id === p.id ? { ...q, x: v } : q); });
      }), numero(`Uscita ${i + 1}`, p.y, 0, 1, .001, (v) => cambiaColore((c) => { c.curve ??= {}; c.curve[canale] = punti.map((q) => q.id === p.id ? { ...q, y: v } : q); })));
      if (i === 0 || i === punti.length - 1) riga.querySelector('input')!.readOnly = true;
      if (i > 0 && i < punti.length - 1) riga.append(bottone('Togli punto', () => cambiaColore((c) => { c.curve ??= {}; c.curve[canale] = punti.filter((q) => q.id !== p.id); })));
      box.append(riga);
    }
    box.append(bottone('Azzera questa curva', () => cambiaColore((c) => { c.curve ??= {}; c.curve[canale] = identitaCurva(); })));
    disegna(); return box;
  }

  async function rigenera(ids?: string[]) {
    if (lavoro) return;
    const controller = new AbortController(), progetto = store.doc, sequenza = progetto.seqAttiva;
    lavoro = controller; dice('Analizzo le voci…'); aggiorna();
    try {
      const risultati = await preparaDucking(progetto, ids, controller.signal, dice);
      if (morto || controller.signal.aborted) return;
      if (store.doc !== progetto || progetto.seqAttiva !== sequenza || risultati.some((r) => { const c = clipDi(progetto, r.id); return !c || firmaDuckingAttuale(progetto, c) !== r.firma; })) throw new Error('Il montaggio è cambiato durante l’analisi: premi Rigenera');
      store.edit('Ducking automatico', (p) => { for (const r of risultati) { const c = clipDi(p, r.id)!; c.duckKeys = r.keys; c.duckFirma = r.firma; } });
      dice('Ducking pronto. Ascolta e regola la quantità se serve.');
    } catch (e) { if (!morto) dice(errore(e)); }
    finally { lavoro = null; if (!morto) aggiorna(); }
  }

  function audio(c: Clip) {
    const p = store.doc, t = p.tracks.find((t) => t.id === c.track);
    if (t?.kind !== 'audio') return null;
    const box = h('fieldset', null, h('legend', null, 'Voce e musica · ducking'));
    const ruoli: [RuoloAudio, string][] = [['nessuno', 'Nessun ruolo'], ['voce', 'Voce'], ['musica', 'Musica']];
    const select = (nome: string, attuale: RuoloAudio | undefined, fn: (r: RuoloAudio | undefined) => void, eredita = false) => {
      const s = h('select', { 'aria-label': nome }, eredita ? h('option', { value: '', selected: !attuale }, 'Come la traccia') : null,
        ruoli.map(([r, n]) => h('option', { value: r, selected: r === (attuale ?? (eredita ? '' : 'nessuno')) }, n)));
      s.onchange = () => fn((s.value || undefined) as RuoloAudio | undefined);
      return h('label', null, nome, s);
    };
    box.append(select('Questa clip', c.ruoloAudio, (r) => modifica('Ruolo audio della clip', (_, c) => { c.ruoloAudio = r; }), true),
      select('Tutta la traccia', t.ruoloAudio, (r) => modifica('Ruolo audio della traccia', (p, c) => { p.tracks.find((t) => t.id === c.track)!.ruoloAudio = r; })));
    if (ruoloAudio(p, c) !== 'musica') { box.append(h('p', { class: 'nota' }, 'Segna le voci sulle loro clip o tracce. Poi scegli la musica per abbassarla sotto la voce.')); return box; }
    const d = impostazioneDucking(p, c);
    const cambia = (fn: (d: Ducking) => void) => modifica('Regola ducking', (_, c) => { c.ducking = { ...d }; fn(c.ducking); });
    const on = h('input', { type: 'checkbox', checked: d.attivo }); on.onchange = () => cambia((d) => { d.attivo = on.checked; });
    box.append(h('label', null, on, ' Abbassa sotto la voce'),
      numero('Quanto abbassare (dB)', d.quantita, 0, 60, .5, (v) => cambia((d) => { d.quantita = v; })),
      numero('Attacco (s)', d.attacco, .005, 10, .005, (v) => cambia((d) => { d.attacco = v; })),
      numero('Rilascio (s)', d.rilascio, .005, 10, .005, (v) => cambia((d) => { d.rilascio = v; })),
      numero('Soglia della voce (dBFS)', d.soglia, -90, 0, 1, (v) => cambia((d) => { d.soglia = v; })),
      numero('Isteresi (dB)', d.isteresi, 0, 24, 1, (v) => cambia((d) => { d.isteresi = v; })),
      numero('Durata minima (s)', d.minimo, 0, 2, .01, (v) => cambia((d) => { d.minimo = v; })),
      numero('Tenuta (s)', d.hold, 0, 5, .01, (v) => cambia((d) => { d.hold = v; })),
      h('p', { class: 'nota' }, 'Rileva il volume delle sorgenti segnate come voce, anche rumori forti. Dopo tagli, spostamenti o regolazioni premi Rigenera.'),
      h('p', null, duckingValido(conIncroci(p), c) ? 'Analisi aggiornata' : 'Ducking spento o da rigenerare: la musica usa il volume manuale.'),
      bottone('Rigenera questa musica', () => void rigenera([c.id]), !!lavoro || !d.attivo),
      bottone('Rigenera tutta la musica', () => void rigenera(), !!lavoro),
      bottone('Usa le impostazioni su tutta la traccia', () => modifica('Ducking della traccia', (p, c) => {
        p.tracks.find((t) => t.id === c.track)!.ducking = { ...d };
        for (const cc of p.clips) if (cc.track === c.track) cc.ducking = undefined;
      })),
      bottone('Disattiva', () => cambia((d) => { d.attivo = false; })));
    if (opzioni.ascolta) box.append(bottone('Ascolta', opzioni.ascolta));
    if (lavoro) box.append(bottone('Ferma analisi', () => lavoro?.abort()));
    return box;
  }

  function aggiorna() {
    if (morto || trascina) return;
    el.replaceChildren(); const c = clipDi(store.doc, clipId);
    if (!c) { el.append(h('p', null, 'La clip non c’è più')); return; }
    const t = store.doc.tracks.find((t) => t.id === c.track);
    if (t?.kind === 'video' && c.kind !== 'fx') {
      const col = c.fx.colore ?? {};
      el.append(h('h3', null, 'Colore della clip'), h('p', { class: 'nota' }, 'SDR · usa LUT pensate per lo spazio colore della ripresa. Nessuna conversione log automatica.'),
        h('div', { class: 'ca-ruote' }, ruota(col, 'lift', 'Lift · ombre'), ruota(col, 'gamma', 'Gamma · mezzi toni'), ruota(col, 'gain', 'Gain · luci')), editorCurve(col));
      const file = h('input', { type: 'file', accept: '.cube', 'aria-label': 'Carica LUT .cube' });
      file.onchange = async () => {
        const f = file.files?.[0]; if (!f) return;
        const p0 = store.doc, sequenza = p0.seqAttiva, target = clipDi(p0, clipId);
        try {
          const lut = await leggiLut(f);
          if (morto || store.doc !== p0 || p0.seqAttiva !== sequenza || clipDi(p0, clipId) !== target) return;
          modifica('LUT della clip', (p, c) => { p.luts ??= []; if (!p.luts.some((l) => l.hash === lut.hash)) p.luts.push(lut); c.fx.colore ??= {}; c.fx.colore.lut = { id: lut.id, intensita: 1 }; });
          dice('LUT caricata e incorporata nel progetto'); aggiorna();
        } catch (e) { dice(errore(e)); }
      };
      const lut = store.doc.luts?.find((l) => l.id === col.lut?.id);
      el.append(h('fieldset', null, h('legend', null, 'LUT 3D .cube'), file, h('p', null, lut?.nome ?? (col.lut ? 'LUT mancante: ricarica il file .cube' : 'Nessuna LUT')),
        numero('Intensità LUT (%)', (col.lut?.intensita ?? 0) * 100, 0, 100, 1, (v) => cambiaColore((c) => { if (c.lut) c.lut.intensita = v / 100; })),
        bottone('Togli LUT', () => cambiaColore((c) => { delete c.lut; }))),
        bottone('Azzera il colore avanzato', () => modifica('Azzera colore avanzato', (_, c) => { delete c.fx.colore; })));
    }
    const a = audio(c); if (a) el.append(a);
    stato.textContent = messaggio; el.append(stato);
  }
  const off = store.on('doc', aggiorna);
  aggiorna();
  return { el, aggiorna, distruggi() { morto = true; lavoro?.abort(); off(); if (trascina) { trascina = false; store.cancelLive(); } el.remove(); } };
}

/** Configurazione neutra per chi costruisce il pannello senza usare lo Store. */
export { DUCKING0 };
