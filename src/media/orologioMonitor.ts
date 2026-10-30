// currentTime di Web Audio avanza per blocchi, non per rAF. Il monitor interpola fra
// i blocchi e corregge lentamente lo scarto: niente ripetizioni quando i due battiti
// attraversano il bordo dello stesso fotogramma. L'audio resta l'orologio principale.
export class OrologioMonitor {
  private posizione = 0;
  private ultimo = 0;
  private audioPrima: number | null = null;
  private partito = false;

  azzera() { this.audioPrima = null; this.partito = false; }

  leggi(audio: number, now: number): number {
    const dt = Math.max(0, (now - this.ultimo) / 1000);
    if (this.audioPrima === null || !this.partito || Math.abs(audio - this.posizione) > 0.1) {
      // Comprende il preroll silenzioso: finché l'audio non parte, resta fermo anche il video.
      this.partito = this.audioPrima !== null && audio > this.audioPrima;
      this.posizione = audio;
    } else {
      const prevista = this.posizione + dt;
      this.posizione = prevista + (audio - prevista) * (1 - Math.exp(-dt / 0.5));
    }
    this.audioPrima = audio;
    this.ultimo = now;
    return this.posizione;
  }
}
