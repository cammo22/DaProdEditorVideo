// Ponte LIVE/Windows. Nel browser non raccogliamo eventi DOM: non descrivono il desktop registrato.
import { invoke, isAndroid, isMac, isTauri } from '../platform';
import { rimappaCursore, type CampioneCursore, type SchermoCursore, type TaglioCursore } from '../core/zoomCursore';

export const cursoreDisponibile = isTauri && !isAndroid && !isMac && /Windows/i.test(navigator.userAgent);
export const schermiCursore = () => cursoreDisponibile ? invoke<SchermoCursore[]>('cursore_schermi') : Promise.resolve([]);

export class CursoreLive {
  private tagli: { da: number; fine: number }[] = [];
  private aperto: { da: number; fine: number } | null = null;
  private constructor(private id: number, private origine: number, readonly schermo: SchermoCursore) {}

  static async avvia(schermo: SchermoCursore) {
    const a = performance.now();
    const r = await invoke<{ id: number; trascorsiMs: number }>('cursore_avvia', { schermo: schermo.id });
    // Handshake: il nativo consegna il tempo già trascorso dal primo campione. La metà del viaggio
    // di ritorno resta una stima, da collaudare contro i fotogrammi reali (nessuna precisione promessa).
    const fine = performance.now();
    return new CursoreLive(r.id, fine - r.trascorsiMs - Math.min(8, (fine - a) / 2), schermo);
  }

  pezzo(t0: number) {
    this.aperto = { da: t0 - this.origine, fine: Infinity };
    this.tagli.push(this.aperto);
  }

  pausa(t: number) { if (this.aperto) this.aperto.fine = t - this.origine; this.aperto = null; }

  async ferma() {
    this.pausa(performance.now());
    const testo = await invoke<string>('cursore_ferma', { id: this.id });
    const raw = testo.trim() ? testo.trim().split('\n').map((s) => JSON.parse(s) as CampioneCursore) : [];
    return { perVideo: (parti: { indice: number; daMs: number; durataMs: number }[], durataMs: number) => {
      const tagli: TaglioCursore[] = parti.flatMap((p) => {
        const g = this.tagli[p.indice];
        return g ? [{ da: g.da, fine: g.fine, videoMs: p.daMs, durataMs: p.durataMs }] : [];
      });
      return rimappaCursore(raw, this.schermo, tagli, durataMs);
    } };
  }
}
