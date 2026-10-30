// L'audio del computer preso da Windows (src-tauri/src/audio_pc.rs): WebView2, con lo schermo scelto in automatico,
// consegna una traccia audio finta e muta. Qui si prende quello che esce dalle casse o dalle cuffie scelte.
// L'orologio è quello della cattura: pezzi e pause si rimappano come per il cursore (cursoreLive.ts).
import { invoke, isAndroid, isTauri } from '../platform';

export const audioComputerNativo = isTauri && !isAndroid && /Windows/i.test(navigator.userAgent);
export interface UscitaAudio { nome: string; predefinita: boolean }
export const usciteAudio = () => (audioComputerNativo ? invoke<UscitaAudio[]>('audio_pc_uscite') : Promise.resolve([] as UscitaAudio[]));
/** il picco dall'ultima lettura (0..1) */
export const livelloAudioComputer = () => (audioComputerNativo ? invoke<number>('audio_pc_livello').catch(() => 0) : Promise.resolve(0));

export class AudioComputer {
  private pezzi: { da: number; fine: number }[] = [];
  private aperto: { da: number; fine: number } | null = null;
  private constructor(private id: number, private origine: number) {}

  /** `uscita` = il nome dell'uscita audio ('' = la predefinita di Windows) */
  static async avvia(uscita = '') {
    const a = performance.now();
    const r = await invoke<{ id: number; trascorsiMs: number }>('audio_pc_avvia', { uscita: uscita || null });
    const fine = performance.now();
    return new AudioComputer(r.id, fine - r.trascorsiMs - Math.min(8, (fine - a) / 2));
  }

  pezzo(t0: number) {
    this.aperto = { da: t0 - this.origine, fine: Infinity };
    this.pezzi.push(this.aperto);
  }

  pausa(t: number) { if (this.aperto) this.aperto.fine = t - this.origine; this.aperto = null; }

  /** ferma; con un nome scrive il file (solo i pezzi registrati) in Video/DaProd Video e ne dà il percorso */
  async ferma(nome?: string): Promise<string | null> {
    this.pausa(performance.now());
    const destinazione = nome ? await invoke<string>('registrazione_percorso', { name: nome }) : null;
    return invoke<string | null>('audio_pc_ferma', { id: this.id, pezzi: this.pezzi.map((p) => [p.da, p.fine]), destinazione });
  }
}
