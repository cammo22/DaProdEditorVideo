// La velocità di una clip: più svelta o più piano, con la voce che resta naturale (o come un nastro) e il movimento
// fluido quando si rallenta molto. Si apre con Alt+E o dal tasto destro sulla clip.
import { store } from '../core/store';
import * as M from '../core/montaggio';
import { clipById } from '../core/progetto';
import { durataUmana, f2s } from '../core/timecode';
import { avviso, dialogo, h } from './dom';
import type { Clip } from '../core/tipi';

/** il movimento fluido che conviene: da ×0.5 in giù si fa "mosso", fino a ×0.75 basta lo "sfumato" */
export const fluidoConsigliato = (v: number) => (v <= 0.5 ? 2 : v < 0.75 ? 1 : 0);

export const NOMI_FLUIDO = ['Niente (i fotogrammi restano fermi)', 'Sfumato (mischia i fotogrammi vicini)', 'Mosso (ricostruisce il movimento in mezzo)'];

const LS = 'dpv-velocita';
const letto = (): { ripple: boolean } => { try { return { ripple: true, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { ripple: true }; } };
const salva = (o: { ripple: boolean }) => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* niente da fare */ } };

export const etichettaVelocita = (v: number) => (Math.abs(v - 1) < 0.005 ? 'normale' : '×' + (Math.round(v * 100) / 100).toString().replace('.', ','));

/** le clip su cui si lavora: le selezionate (con le loro legate) o quella sotto il cursore */
export function clipVelocita(ids?: Iterable<string>): Clip[] {
  const p = store.doc;
  const set = ids ? M.withLinked(p, ids) : store.sel.size ? M.withLinked(p, store.sel) : new Set<string>();
  return p.clips.filter((c) => set.has(c.id) && M.conVelocita(p, c));
}

/** mette la velocità e dice cosa è successo */
export function impostaVelocita(ids: Iterable<string>, v: number, o: Partial<M.OpzVelocita> = {}): number {
  const base = letto();
  const insieme = M.withLinked(store.doc, ids);
  const n = store.edit(v === 1 ? 'Velocità normale' : `Velocità ${etichettaVelocita(v)}`, (p) => {
    const primo = p.clips.find((c) => insieme.has(c.id) && M.conVelocita(p, c));
    const fluido = o.fluido ?? (primo?.fluido === undefined || primo.fluido === 0 ? fluidoConsigliato(v) : primo.fluido);
    return M.cambiaVelocita(p, insieme, v, { ripple: o.ripple ?? base.ripple, nastro: o.nastro, fluido: v >= 1 ? 0 : fluido });
  });
  if (!n) avviso('Sulle immagini e sui titoli la velocità non c\'è: scegli una ripresa o un audio', 'info', 2600);
  else avviso(`⏩ Velocità ${etichettaVelocita(v)} · ${n} ${n === 1 ? 'clip' : 'clip'}`, 'tasto');
  return n;
}

/** la finestra della velocità */
export function finestraVelocita(ids?: Iterable<string>) {
  const clip = clipVelocita(ids);
  if (!clip.length) { avviso('Seleziona una ripresa o un audio (o metti il cursore su una clip)', 'info', 2600); return; }
  const p = store.doc;
  const prima = clip[0];
  const ricordo = letto();
  const d = dialogo('Velocità della clip');
  let v = prima.speed || 1;
  let fluidoTocco = prima.fluido !== undefined;
  const num = h('input', { type: 'number', class: 'num', min: M.VEL_MIN * 100, max: M.VEL_MAX * 100, step: 5, value: String(Math.round(v * 1000) / 10) }) as HTMLInputElement;
  const cursore = h('input', { type: 'range', min: '-1000', max: '1000', step: '1', class: 'cursore-vel' }) as HTMLInputElement;
  const aCursore = (x: number) => Math.round((Math.log(x) / Math.log(M.VEL_MAX)) * 1000);
  const daCursore = (k: number) => Math.exp((k / 1000) * Math.log(M.VEL_MAX));
  const tono = h('select', { class: 'mini-select' },
    h('option', { value: 'tieni' }, 'Tieni il tono (la voce resta naturale)'),
    h('option', { value: 'nastro' }, 'Come un nastro (cambia anche il tono)')) as HTMLSelectElement;
  tono.value = prima.nastro ? 'nastro' : 'tieni';
  const fluido = h('select', { class: 'mini-select' }, NOMI_FLUIDO.map((n, i) => h('option', { value: String(i) }, n))) as HTMLSelectElement;
  fluido.value = String(prima.fluido ?? fluidoConsigliato(v));
  const ripple = h('input', { type: 'checkbox', checked: ricordo.ripple }) as HTMLInputElement;
  const durata = h('span', { class: 'nota' });
  const soloAudio = clip.every((c) => p.tracks.find((t) => t.id === c.track)?.kind === 'audio');
  const aggiorna = () => {
    v = Math.max(M.VEL_MIN, Math.min(M.VEL_MAX, v));
    const c = prima;
    const nuova = Math.max(1, Math.round((c.len * (c.speed || 1)) / v));
    durata.textContent = `Dura ${durataUmana(f2s(c.len, p.rate))} → ${durataUmana(f2s(nuova, p.rate))}`;
    cursore.value = String(aCursore(v));
    if (document.activeElement !== num) num.value = String(Math.round(v * 1000) / 10);
    if (!fluidoTocco) fluido.value = String(v >= 1 ? 0 : fluidoConsigliato(v));
    fluido.disabled = v >= 1 || soloAudio;
  };
  const preset = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8];
  const bottoni = h('div', { class: 'vel-preset' }, preset.map((x) => h('button', { class: 'btn', title: `Velocità ${x * 100}%`, on: { click: () => { v = x; aggiorna(); } } },
    '×' + String(x).replace('.', ','))));
  num.addEventListener('input', () => { const x = Number(num.value) / 100; if (x > 0) { v = x; aggiorna(); } });
  cursore.addEventListener('input', () => { v = daCursore(Number(cursore.value)); aggiorna(); });
  fluido.addEventListener('change', () => { fluidoTocco = true; });
  d.corpo.append(
    h('div', { class: 'form' },
      h('label', null, 'Velocità (%)'), h('div', { class: 'vel-riga' }, num, cursore),
      h('label', null, 'Subito'), bottoni,
      h('label', null, 'Durata'), durata,
      h('label', null, 'Audio'), tono,
      h('label', null, 'Movimento'), fluido,
      h('label', null, 'Dopo la clip'), h('label', { class: 'spunta-riga' }, ripple, ' sposta le clip che vengono dopo')),
    h('p', { class: 'nota' }, 'Sopra il 100% la clip va più svelta e si accorcia, sotto va più piano e si allunga. Il movimento fluido ricostruisce i fotogrammi in mezzo quando rallenti molto (nel monitor e nell\'export). Alt+E riapre questa finestra.'));
  const vai = () => {
    salva({ ripple: ripple.checked });
    const ids2 = clip.map((c) => c.id);
    d.chiudi();
    impostaVelocita(ids2, v, { ripple: ripple.checked, nastro: tono.value === 'nastro', fluido: v >= 1 ? 0 : Number(fluido.value) });
    store.select(ids2.filter((id) => clipById(store.doc, id)));
  };
  d.piede.append(h('button', { class: 'btn', on: { click: d.chiudi } }, 'Annulla'), h('button', { class: 'btn primario', on: { click: vai } }, 'Applica'));
  num.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); vai(); } });
  aggiorna();
  setTimeout(() => { num.focus(); num.select(); }, 30);
}
