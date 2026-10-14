// La rotella su tutti i campi: con il puntatore sopra un cursore, un numero o una tendina, la rotella cambia il valore
// (su = di più, giù = di meno). Maiusc = a passi da dieci, Alt = a passi fini (un decimo). La pagina non scorre
// mentre il puntatore sta su un campo: per scorrere il pannello si va sull'etichetta, a lato o sulla barretta.
// Si cambia il valore e si avvisa il campo come se lo avessi mosso a mano ('input' subito, 'change' quando la rotella si ferma),
// così anche l'annulla vede un colpo solo per tutta la girata.

const DOPO_MS = 350;
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

let attiva = false;

/** si accende una volta sola, all'avvio */
export function attivaRotella() {
  if (attiva) return;
  attiva = true;
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) return; // lo zoom è un'altra cosa
    const el = campoDa(e.target);
    if (!el) return;
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
}
