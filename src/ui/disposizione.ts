// Come è sistemato il banco: larghezze e altezze dei pannelli (variabili CSS su #app) e quali pannelli sono chiusi.
// Ogni bordo si trascina, col doppio clic chiude o riapre il pannello accanto, e tutto si ricorda in localStorage
// (dpv-banco), così il banco si riapre come l'avevi lasciato.

const VARI = ['--alto', '--bin', '--lato', '--fin', '--tlfin', '--tlpag'];
const CLASSI = ['senza-bin', 'senza-lato', 'senza-puls', 'lato-lungo'];
const CHIAVE = 'dpv-banco';

export class Disposizione {
  /** @param ridisegna chi rifà i conti quando cambia lo spazio (il monitor) */
  constructor(private radice: HTMLElement, private ridisegna: () => void) {}

  salva() {
    try {
      const o: Record<string, string> = {};
      for (const v of VARI) { const x = this.radice.style.getPropertyValue(v); if (x) o[v] = x; }
      localStorage.setItem(CHIAVE, JSON.stringify({ o, cls: CLASSI.filter((c) => this.radice.classList.contains(c)) }));
    } catch { /* niente */ }
  }

  /** il banco di prima (all'avvio) */
  ripristina() {
    try {
      const b = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as { o: Record<string, string>; cls: string[] } | null;
      if (!b) return;
      for (const [k, v] of Object.entries(b.o)) this.radice.style.setProperty(k, v);
      for (const c of b.cls) this.radice.classList.add(c);
    } catch { /* niente */ }
  }

  /** come all'inizio */
  rimetti() {
    for (const v of VARI) this.radice.style.removeProperty(v);
    this.radice.classList.remove(...CLASSI);
    this.salva();
  }

  /** apre o chiude un pannello (una classe del banco), lo ricorda e rifà i conti del monitor */
  alterna(classe: string, si?: boolean) {
    this.radice.classList.toggle(classe, si);
    this.salva();
    setTimeout(() => this.ridisegna(), 50);
  }

  /** un bordo trascinabile: cambia una variabile del banco (in pixel); col doppio clic chiude o riapre il pannello */
  bordo(el: HTMLElement, calcola: (dx: number, dy: number, r0: DOMRect) => [string, number] | null, misura: () => DOMRect, chiudi?: string) {
    el.addEventListener('pointerdown', (e) => {
      const x0 = e.clientX, y0 = e.clientY;
      const r0 = misura();
      el.setPointerCapture(e.pointerId);
      el.classList.add('preso');
      const mv = (ev: PointerEvent) => {
        const r = calcola(ev.clientX - x0, ev.clientY - y0, r0);
        if (r) this.radice.style.setProperty(r[0], Math.round(r[1]) + 'px');
      };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.classList.remove('preso'); this.salva(); this.ridisegna(); };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
    if (chiudi) el.addEventListener('dblclick', () => this.alterna(chiudi));
  }
}
