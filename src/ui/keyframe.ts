// L'interfaccia dei keyframe: il rombo ◆ accanto a un parametro (mette o toglie la chiave sotto il cursore, le frecce
// ◀ ▶ saltano alla chiave prima e dopo), l'elenco dei parametri che si possono animare e i piccoli aiuti per scrivere
// un valore tenendo conto delle animazioni. La parte che calcola è in src/core/automazioni.ts. Stile: src/stile/keyframe.css.
import '../stile/keyframe.css';
import { store } from '../core/store';
import type { Clip, ModoAnim } from '../core/tipi';
import { end, tfAl } from '../core/progetto';
import { MODI_ANIM, chiaveVicina, descrittore, haChiaveA, haLinea, impostaModoChiave, mettiChiave, togliChiave, togliLinea, valoreAl, valoreFermo } from '../core/automazioni';
import { effettoTempo, parametroFx } from '../core/blocchi';
import { nomeForma } from '../core/maschereForma';
import { motore } from '../motore';
import { h } from './dom';

/** il fotogramma locale sotto il cursore (intero), o null se il cursore sta fuori dalla clip */
export function frameLocale(c: Clip): number | null {
  const f = Math.floor(store.head + 1e-6);
  return f >= c.start && f < end(c) ? f - c.start : null;
}

/** il valore «vivo» di un parametro al fotogramma locale lf: con la linea è quello animato, senza è quello che si vede adesso (anche in movimento) */
export function valoreVivo(c: Clip, path: string, lf: number): number {
  if (haLinea(c, path)) return valoreAl(c, path, lf);
  if (path.startsWith('tf.')) {
    const k = path.slice(3);
    const t = tfAl(c, lf) as unknown as Record<string, number | undefined>;
    return t[k] ?? valoreFermo(c, path);
  }
  const m = /^fxb\.parametri\.(.+)$/.exec(path);
  if (m && c.fxb) return parametroFx(c.fxb, m[1]);
  return valoreFermo(c, path);
}

/** scrive un valore: se il parametro ha la linea, la chiave sotto il cursore; se no il valore fermo */
export function scriviParametro(c: Clip, path: string, lf: number, v: number) {
  if (haLinea(c, path)) mettiChiave(c, path, lf, v);
  else descrittore(path)?.set(c, v);
}

// ——— i nomi e i limiti dei parametri ———

export interface MetaParametro { path: string; nome: string; min: number; max: number; passo: number; unita: string; gruppo: string }

const RUOTE: [string, string, number, number][] = [['lift', 'Ombre (lift)', -1, 1], ['gamma', 'Mezzi toni (gamma)', 0.1, 4], ['gain', 'Luci (gain)', 0, 4]];

/** i parametri che si possono animare su questa clip (oltre a quelli che hanno già il rombo nel pannello) */
export function parametriAnimabili(c: Clip): MetaParametro[] {
  const o: MetaParametro[] = [];
  const m = (path: string, nome: string, min: number, max: number, passo: number, unita: string, gruppo: string) => o.push({ path, nome, min, max, passo, unita, gruppo });
  if (c.kind === 'fx' && c.fxb) {
    m('fxb.forza', 'Forza', 0, 1.5, 0.01, '', 'Effetto');
    for (const p of effettoTempo(c.fxb.id)?.parametri ?? []) m('fxb.parametri.' + p.chiave, p.nome, p.min, p.max, p.passo, '', 'Effetto');
    return o;
  }
  const video = c.kind === 'media' || c.kind === 'color' || c.kind === 'bars' || c.kind === 'countdown' || c.kind === 'title';
  if (video) {
    m('opacity', 'Opacità', 0, 1, 0.01, '', 'Posizione');
    m('tf.scale', 'Zoom', 0.2, 3, 0.01, '', 'Posizione');
    m('tf.sx', 'Larghezza (stira)', 0.2, 3, 0.01, '', 'Posizione');
    m('tf.x', 'Orizzontale', -4000, 4000, 1, 'px', 'Posizione');
    m('tf.y', 'Verticale', -4000, 4000, 1, 'px', 'Posizione');
    m('tf.rot', 'Rotazione', -360, 360, 0.5, '°', 'Posizione');
    m('tf.angoli', 'Angoli tondi', 0, 1, 0.01, '', 'Posizione');
    m('tf.ombra', 'Ombra', 0, 1, 0.01, '', 'Posizione');
    for (const [k, n] of [['cropL', 'Ritaglio a sinistra'], ['cropR', 'Ritaglio a destra'], ['cropT', 'Ritaglio in alto'], ['cropB', 'Ritaglio in basso']]) m('tf.' + k, n, 0, 0.5, 0.005, '', 'Ritaglio');
    m('fx.bright', 'Luce', -0.5, 0.5, 0.01, '', 'Colore');
    m('fx.contrast', 'Contrasto', 0.5, 1.5, 0.01, '', 'Colore');
    m('fx.sat', 'Saturazione', 0, 2, 0.01, '', 'Colore');
    m('fx.temp', 'Temperatura', -1, 1, 0.01, '', 'Colore');
    m('fx.hue', 'Tinta', -180, 180, 1, '°', 'Colore');
    m('fx.vignette', 'Vignetta', 0, 1, 0.01, '', 'Colore');
    for (const [r, nome, lo, hi] of RUOTE) for (const [ch, n] of [['r', 'rosso'], ['g', 'verde'], ['b', 'blu']]) m(`fx.colore.${r}.${ch}`, `${nome} · ${n}`, lo, hi, 0.01, '', 'Ruote colore');
    if (c.fx.colore?.lut) m('fx.colore.lut', 'Intensità della LUT', 0, 1, 0.01, '', 'Ruote colore');
    if (c.fx.key !== 'none') {
      m('fx.keyLevel', 'Soglia della chiave', 0, 1, 0.01, '', 'Togli lo sfondo');
      m('fx.keySoft', 'Morbidezza della chiave', 0, 0.5, 0.01, '', 'Togli lo sfondo');
    }
  }
  if (c.kind === 'media' || c.kind === 'tone' || c.kind === 'beep') {
    m('gain', 'Volume', -60, 12, 0.5, 'dB', 'Audio');
    m('pan', 'Panorama', -1, 1, 0.01, '', 'Audio');
  }
  for (const mk of c.maschere ?? []) {
    const nome = nomeForma(mk);
    if (mk.forma !== 'bezier') {
      m(`mask.${mk.id}.x`, `${nome} · centro X`, 0, 1, 0.005, '', 'Maschere');
      m(`mask.${mk.id}.y`, `${nome} · centro Y`, 0, 1, 0.005, '', 'Maschere');
      m(`mask.${mk.id}.w`, `${nome} · larghezza`, 0, 2, 0.005, '', 'Maschere');
      m(`mask.${mk.id}.h`, `${nome} · altezza`, 0, 2, 0.005, '', 'Maschere');
      m(`mask.${mk.id}.rot`, `${nome} · rotazione`, -360, 360, 0.5, '°', 'Maschere');
    } else {
      (mk.punti ?? []).forEach((_, i) => { m(`mask.${mk.id}.p${i}.x`, `${nome} · punto ${i + 1} X`, -0.5, 1.5, 0.005, '', 'Maschere'); m(`mask.${mk.id}.p${i}.y`, `${nome} · punto ${i + 1} Y`, -0.5, 1.5, 0.005, '', 'Maschere'); });
    }
    m(`mask.${mk.id}.sfuma`, `${nome} · sfumatura`, 0, 0.5, 0.005, '', 'Maschere');
    m(`mask.${mk.id}.espandi`, `${nome} · espansione`, -0.5, 0.5, 0.005, '', 'Maschere');
    m(`mask.${mk.id}.opacita`, `${nome} · quanto conta`, 0, 1, 0.01, '', 'Maschere');
  }
  return o;
}

/** come si chiama un parametro nell'elenco delle animazioni */
export function nomeParametro(c: Clip, path: string): string {
  return parametriAnimabili(c).find((x) => x.path === path)?.nome ?? path;
}

// ——— il rombo ———

export interface Rombo { el: HTMLElement; aggiorna: () => void }

/**
 * Il rombo con le due frecce per un parametro. `ids` sono le clip toccate (la prima comanda il disegno). Un clic sul rombo:
 * se c'è una chiave sotto il cursore la toglie, se no ne mette una col valore di adesso. Tasto destro: come si va alla chiave dopo.
 */
export function creaRombo(path: string, ids: string[], dopo?: () => void): Rombo {
  const trova = () => store.doc.clips.filter((c) => ids.includes(c.id));
  const su = h('button', { class: 'kf-freccia', title: 'Alla chiave prima', type: 'button' }, '◀') as HTMLButtonElement;
  const gi = h('button', { class: 'kf-freccia', title: 'Alla chiave dopo', type: 'button' }, '▶') as HTMLButtonElement;
  const r = h('button', { class: 'kf-rombo', type: 'button', title: 'Metti o togli una chiave qui (tasto destro: come si arriva alla chiave dopo)' }, '◆') as HTMLButtonElement;
  const el = h('span', { class: 'kf' }, su, r, gi);
  const aggiorna = () => {
    const c = trova()[0];
    if (!c) return;
    const lf = frameLocale(c);
    const linea = haLinea(c, path);
    r.disabled = lf === null;
    r.classList.toggle('animato', linea);
    r.classList.toggle('chiave', lf !== null && haChiaveA(c, path, lf));
    const f = lf ?? Math.max(0, Math.floor(store.head) - c.start);
    su.disabled = !linea || chiaveVicina(c, path, f, -1) === null;
    gi.disabled = !linea || chiaveVicina(c, path, f, 1) === null;
    el.classList.toggle('acceso', linea);
  };
  const salta = (dir: -1 | 1) => {
    const c = trova()[0];
    if (!c) return;
    const f = chiaveVicina(c, path, Math.floor(store.head + 1e-6) - c.start, dir);
    if (f !== null) { motore.setMonitor('recorder'); motore.vaiA(c.start + f); }
  };
  su.addEventListener('click', () => salta(-1));
  gi.addEventListener('click', () => salta(1));
  r.addEventListener('click', () => {
    const quali = trova();
    if (!quali.length) return;
    store.edit('Keyframe', () => {
      for (const c of trova()) {
        const lf = frameLocale(c);
        if (lf === null) continue;
        if (haChiaveA(c, path, lf)) togliChiave(c, path, lf);
        else mettiChiave(c, path, lf, valoreVivo(c, path, lf));
      }
    });
    aggiorna();
    dopo?.();
  });
  r.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const c = trova()[0];
    const lf = c ? frameLocale(c) : null;
    if (!c || lf === null) return;
    const menu = h('div', { class: 'kf-menu' });
    const chiudi = () => { menu.remove(); removeEventListener('pointerdown', fuori, true); };
    const fuori = (ev: Event) => { if (!menu.contains(ev.target as Node)) chiudi(); };
    const voci: [string, () => void][] = [];
    if (haChiaveA(c, path, lf)) {
      for (const mo of MODI_ANIM) voci.push([`Verso la prossima: ${mo.nome.toLowerCase()}`, () => store.edit('Keyframe: come si va avanti', () => { for (const x of trova()) impostaModoChiave(x, path, lf, mo.id as ModoAnim); })]);
    }
    if (haLinea(c, path)) voci.push(['Togli tutte le chiavi (resta il valore di qui)', () => { store.edit('Togli le chiavi', () => { for (const x of trova()) { const f = frameLocale(x); togliLinea(x, path, f ?? 0); } }); dopo?.(); }]);
    if (!voci.length) { chiudi(); return; }
    for (const [t, fn] of voci) menu.append(h('button', { type: 'button', on: { click: () => { chiudi(); fn(); aggiorna(); } } }, t));
    document.body.append(menu);
    const b = r.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(innerWidth - 250, b.left - 120)) + 'px';
    menu.style.top = Math.min(innerHeight - menu.offsetHeight - 4, b.bottom + 4) + 'px';
    addEventListener('pointerdown', fuori, true);
  });
  aggiorna();
  return { el, aggiorna };
}
