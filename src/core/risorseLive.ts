// Il contatore delle risorse aperte da LIVE (solo in sviluppo). Ogni flusso, traccia, registratore, contesto audio,
// lavoratore o intervallo che LIVE apre si segna qui, e si toglie quando lo chiude: a registrazione finita e fuori
// da LIVE tutto deve tornare a zero. Se un numero resta alto, qualcosa non è stato chiuso (è il tipo di perdita che
// nell'app vera fa crescere la memoria della scheda video). In produzione non fa niente: `apri` restituisce una
// funzione vuota e nessuno tiene la lista.
export type TipoRisorsa = 'flusso' | 'traccia' | 'registratore' | 'audio' | 'video' | 'worker' | 'tela' | 'intervallo' | 'file';

export interface Riga { aperte: number; totali: number }

export class Risorse {
  private righe = new Map<string, Riga>();
  /** chi ha segnato quella traccia (così fermarla due volte conta una volta sola) */
  private tracce = new WeakMap<object, () => void>();

  constructor(public attivo: boolean) {}

  /** segna una risorsa aperta; restituisce la funzione che la toglie (si può chiamare più volte: conta una volta sola) */
  apri(tipo: TipoRisorsa | string): () => void {
    if (!this.attivo) return NIENTE;
    const r = this.righe.get(tipo) ?? { aperte: 0, totali: 0 };
    r.aperte++; r.totali++;
    this.righe.set(tipo, r);
    let chiusa = false;
    return () => { if (chiusa) return; chiusa = true; const x = this.righe.get(tipo); if (x && x.aperte > 0) x.aperte--; };
  }

  /** segna una traccia (o qualsiasi oggetto con `stop()`) */
  traccia<T extends { stop(): void }>(t: T, tipo: TipoRisorsa | string = 'traccia'): T {
    if (this.attivo && !this.tracce.has(t)) {
      const chiudi = this.apri(tipo);
      this.tracce.set(t, chiudi);
      // una traccia che finisce da sola (condivisione chiusa dal sistema) si toglie anche lei
      (t as unknown as EventTarget).addEventListener?.('ended', chiudi, { once: true });
    }
    return t;
  }

  /** segna tutte le tracce di un flusso */
  flusso<T extends { getTracks(): { stop(): void }[] }>(s: T, tipo: TipoRisorsa | string = 'traccia'): T {
    if (this.attivo) for (const t of s.getTracks()) this.traccia(t, tipo);
    return s;
  }

  /** ferma una traccia e la toglie dalla lista */
  ferma(t: { stop(): void } | null | undefined) {
    if (!t) return;
    try { t.stop(); } catch { /* già ferma */ }
    this.tracce.get(t)?.();
  }

  fermaTutte(s: { getTracks(): { stop(): void }[] } | null | undefined) {
    for (const t of s?.getTracks() ?? []) this.ferma(t);
  }

  /** i numeri adesso: quante aperte e quante in tutto */
  conta(): Record<string, Riga> {
    const o: Record<string, Riga> = {};
    for (const [k, v] of this.righe) o[k] = { ...v };
    return o;
  }

  aperte(tipo: string) { return this.righe.get(tipo)?.aperte ?? 0; }

  /** i tipi rimasti aperti (tranne quelli che è normale tenere: l'anteprima, il telecomando) */
  perdite(consentite: Record<string, number> = {}): string[] {
    const out: string[] = [];
    for (const [k, v] of this.righe) if (v.aperte > (consentite[k] ?? 0)) out.push(`${k}: ${v.aperte}`);
    return out;
  }

  /** la riga per lo schermo di sviluppo: "traccia 3 · registratore 2 …" (solo i tipi aperti) */
  testo(): string {
    const v = [...this.righe].filter(([, r]) => r.aperte > 0).map(([k, r]) => `${k} ${r.aperte}`);
    return v.length ? v.join(' · ') : 'niente aperto';
  }

  azzera() { this.righe.clear(); }
}

const NIENTE = () => {};
const sviluppo = (() => { try { return !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV; } catch { return false; } })();

/** quello vero di LIVE: acceso solo in sviluppo */
export const risorseLive = new Risorse(sviluppo);
if (sviluppo) (globalThis as unknown as Record<string, unknown>).__dpvRisorse = risorseLive;
