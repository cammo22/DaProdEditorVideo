// La rotella su tutti i campi: con il puntatore sopra un cursore, un numero o una tendina, la rotella cambia il valore
// (su = di più, giù = di meno). Maiusc = a passi da dieci, Alt = a passi fini (un decimo). La pagina non scorre
// mentre il puntatore sta su un campo: per scorrere il pannello si va sull'etichetta, a lato o sulla barretta.
// Si cambia il valore e si avvisa il campo come se lo avessi mosso a mano ('input' subito, 'change' quando la rotella si ferma),
// così anche l'annulla vede un colpo solo per tutta la girata.
//
// Per non cambiare i valori per sbaglio mentre si scorre il pannello, un campo risponde alla rotella solo dopo che il
// puntatore è rimasto fermo su di lui per 1,5 secondi: mentre aspetta compare vicino al puntatore un pallino che si
// carica (un anello che si riempie); quando è pieno e dorato la rotella cambia il valore. Se il puntatore si muove,
// o la pagina scorre, si ricomincia da capo, e finché non è pronto la rotella fa scorrere il pannello come sempre.

const DOPO_MS = 350;
/** quanto si aspetta, fermi sul campo, prima che la rotella lo cambi (di prova si può mettere a 0: localStorage `dpv-rotella-attesa`, in millisecondi) */
export const ATTESA_MS = 1500;
const MOVIMENTO_MAX = 5;
const PASSO_PIXEL = 40;

interface Stato { acc: number; timer: ReturnType<typeof setTimeout> | undefined }
const stati = new WeakMap<HTMLElement, Stato>();

function decimali(x: number): number {
  const s = String(x);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** il campo sotto il puntatore che la rotella sa cambiare (null = nessuno) */
function campoDa(t: EventTarget | null): HTMLInputElement | HTMLSelectElement | null {
  const el = (t as HTMLElement | null)?.closest?.('input, select') as HTMLInputElement | HTMLSelectElement | null;
  if (!el || el.disabled || el.closest('[data-senza-rotella]')) return null;
  if (el instanceof HTMLSelectElement) return el.multiple ? null : el;
  if (el.readOnly) return null;
  return el.type === 'range' || el.type === 'number' ? el : null;
}

/** il nuovo valore di un campo numerico dopo `n` scatti (n negativo = giù) */
export function valoreDopo(v: number, n: number, opz: { min?: number; max?: number; step?: number; moltiplica?: number }): number {
  const min = opz.min ?? -Infinity, max = opz.max ?? Infinity;
  let st = opz.step && opz.step > 0 ? opz.step : Number.isFinite(max - min) && max > min ? (max - min) / 100 : 1;
  st *= opz.moltiplica ?? 1;
  const dec = Math.min(6, Math.max(decimali(st), decimali(opz.step ?? 1)));
  const nuovo = Number((v + n * st).toFixed(dec));
  return Math.min(max, Math.max(min, nuovo));
}

function cambia(el: HTMLInputElement | HTMLSelectElement, n: number, e: WheelEvent) {
  if (el instanceof HTMLSelectElement) {
    let i = el.selectedIndex;
    const dir = Math.sign(n);
    for (let k = 0; k < Math.abs(n); k++) {
      let j = i + dir;
      while (j >= 0 && j < el.options.length && el.options[j].disabled) j += dir;
      if (j < 0 || j >= el.options.length) break;
      i = j;
    }
    if (i !== el.selectedIndex) {
      el.selectedIndex = i;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
  const num = (x: string) => (x === '' || x === 'any' ? undefined : Number.isFinite(Number(x)) ? Number(x) : undefined);
  const v = Number(el.value);
  const nuovo = valoreDopo(Number.isFinite(v) ? v : (num(el.min) ?? 0), n, {
    min: num(el.min), max: num(el.max), step: num(el.step) ?? (el.type === 'number' ? 1 : undefined),
    moltiplica: e.shiftKey ? 10 : e.altKey ? 0.1 : 1,
  });
  if (String(nuovo) === String(v)) return;
  el.value = String(nuovo);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // quando la rotella si ferma, il campo "conferma" (annulla/ripeti vedono un colpo solo)
  const st = stati.get(el) ?? { acc: 0, timer: undefined };
  stati.set(el, st);
  clearTimeout(st.timer);
  st.timer = setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), DOPO_MS);
}

/** quanto aspettare adesso (letto a ogni mossa: le prove lo mettono a 0) */
function attesa(): number {
  try { const v = localStorage.getItem('dpv-rotella-attesa'); if (v !== null && Number.isFinite(Number(v))) return Math.max(0, Number(v)); } catch { /* niente */ }
  return ATTESA_MS;
}

/** il pallino che si carica: un anello che si riempie in 1,5 s, poi un punto dorato "pronto" */
class Pallino {
  private el: HTMLElement | null = null;
  private pos = (x: number, y: number) => {
    if (!this.el) return;
    // vicino al puntatore, sempre dentro lo schermo
    const X = Math.min(innerWidth - 30, x + 14), Y = Math.min(innerHeight - 30, y + 16);
    this.el.style.transform = `translate(${X}px, ${Y}px)`;
  };
  private crea() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'rotella-pallino';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><circle class="rp-fondo" cx="12" cy="12" r="9"/><circle class="rp-anello" cx="12" cy="12" r="9" pathLength="100"/><circle class="rp-punto" cx="12" cy="12" r="4.2"/></svg>';
    document.body.appendChild(el);
    this.el = el;
  }
  /** comincia a caricarsi, con la durata data */
  carica(x: number, y: number, ms: number) {
    this.crea();
    const el = this.el!;
    this.pos(x, y);
    el.classList.remove('pronto');
    el.classList.add('visibile');
    el.style.setProperty('--rp-ms', ms + 'ms');
    // si riparte da zero: si toglie e si rimette l'animazione
    el.classList.remove('carica');
    void el.getBoundingClientRect();
    el.classList.add('carica');
  }
  pronto() { this.el?.classList.remove('carica'); this.el?.classList.add('pronto'); }
  muovi(x: number, y: number) { this.pos(x, y); }
  nascondi() { this.el?.classList.remove('visibile', 'carica', 'pronto'); }
  get acceso() { return !!this.el?.classList.contains('visibile'); }
  get inCarica() { return !!this.el?.classList.contains('carica'); }
  get èPronto() { return !!this.el?.classList.contains('pronto'); }
}

let attiva = false;

/** si accende una volta sola, all'avvio */
export function attivaRotella() {
  if (attiva) return;
  attiva = true;
  const pallino = new Pallino();
  /** il campo che sta aspettando o è pronto, e dove era il puntatore quando ha cominciato */
  let candidato: HTMLInputElement | HTMLSelectElement | null = null;
  let pronto = false;
  let x0 = 0, y0 = 0, ultimoX = 0, ultimoY = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finePagina: ReturnType<typeof setTimeout> | undefined;

  const spegni = () => { clearTimeout(timer); candidato = null; pronto = false; pallino.nascondi(); };
  const comincia = (el: HTMLInputElement | HTMLSelectElement, x: number, y: number) => {
    clearTimeout(timer);
    candidato = el; pronto = false; x0 = x; y0 = y;
    const ms = attesa();
    if (ms <= 0) { pronto = true; pallino.carica(x, y, 0); pallino.pronto(); return; }
    pallino.carica(x, y, ms);
    timer = setTimeout(() => { if (candidato === el) { pronto = true; pallino.pronto(); } }, ms);
  };
  /** un controllo del puntatore: dov'è e cosa c'è sotto */
  const guarda = (x: number, y: number, bersaglio: EventTarget | null) => {
    ultimoX = x; ultimoY = y;
    const el = campoDa(bersaglio);
    if (!el) { if (candidato) spegni(); return; }
    if (el !== candidato) { comincia(el, x, y); return; }
    // lo stesso campo: un tremolio piccolo non conta, uno spostamento vero rifà l'attesa
    if (Math.hypot(x - x0, y - y0) > MOVIMENTO_MAX) comincia(el, x, y);
    else pallino.muovi(x, y);
  };
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; guarda(e.clientX, e.clientY, e.target); }, { capture: true, passive: true });
  document.addEventListener('pointerdown', () => spegni(), { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', () => spegni(), { passive: true });
  window.addEventListener('blur', spegni);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') spegni(); }, { capture: true, passive: true });

  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) return; // lo zoom è un'altra cosa
    const el = campoDa(e.target);
    if (!el || el !== candidato || !pronto) {
      // il campo non è pronto: la rotella scorre la pagina come sempre. Mentre scorre non si carica niente: quando si
      // ferma (e il puntatore resta lì), si ricomincia da quello che c'è adesso sotto il puntatore.
      if (el || candidato) { spegni(); }
      clearTimeout(finePagina);
      finePagina = setTimeout(() => {
        const sotto = document.elementFromPoint(ultimoX, ultimoY);
        const c = campoDa(sotto);
        if (c && !candidato) comincia(c, ultimoX, ultimoY);
      }, 180);
      return;
    }
    e.preventDefault();
    const st = stati.get(el) ?? { acc: 0, timer: undefined };
    stati.set(el, st);
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    let n = 0;
    if (Math.abs(dy) >= 50) { n = Math.sign(dy); st.acc = 0; }
    else { st.acc += dy; n = Math.trunc(st.acc / PASSO_PIXEL); st.acc -= n * PASSO_PIXEL; }
    // su = di più
    if (n) cambia(el, -n, e);
  }, { passive: false, capture: true });

  // per le prove: com'è il pallino
  (window as unknown as { __rotella?: unknown }).__rotella = { stato: () => ({ acceso: pallino.acceso, inCarica: pallino.inCarica, pronto: pallino.èPronto, campo: !!candidato }) };
}
