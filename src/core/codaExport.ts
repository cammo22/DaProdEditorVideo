// La coda delle esportazioni, la parte che si può provare senza browser: chi viene dopo, spostare, togliere,
// quanti ne mancano. Chi la fa girare davvero (e la aggancia al Centro attività) è `src/export/coda.ts`.

export type StatoVoce = 'attesa' | 'lavoro' | 'fatta' | 'errore' | 'annullata';

export interface Voce<T> {
  id: number;
  stato: StatoVoce;
  dato: T;
  /** l'errore, o il file finito */
  messaggio?: string;
}

export class Coda<T> {
  readonly voci: Voce<T>[] = [];
  private seme = 1;

  /** mette in coda (in fondo, o in cima a quelle che aspettano) */
  aggiungi(dato: T, inCima = false): Voce<T> {
    const v: Voce<T> = { id: this.seme++, stato: 'attesa', dato };
    if (inCima) {
      const i = this.voci.findIndex((x) => x.stato === 'attesa');
      this.voci.splice(i < 0 ? this.voci.length : i, 0, v);
    } else this.voci.push(v);
    return v;
  }

  voce(id: number): Voce<T> | undefined { return this.voci.find((v) => v.id === id); }

  /** quella che sta lavorando adesso */
  inLavoro(): Voce<T> | undefined { return this.voci.find((v) => v.stato === 'lavoro'); }

  /** la prossima a partire: la prima che aspetta, ma solo se nessuna sta lavorando (una dopo l'altra) */
  prossimo(): Voce<T> | undefined {
    if (this.inLavoro()) return undefined;
    return this.voci.find((v) => v.stato === 'attesa');
  }

  segna(id: number, stato: StatoVoce, messaggio?: string) {
    const v = this.voce(id);
    if (!v) return;
    v.stato = stato;
    if (messaggio !== undefined) v.messaggio = messaggio;
  }

  /** sposta una voce che aspetta su (-1) o giù (+1) fra quelle che aspettano. Ritorna se si è mossa. */
  sposta(id: number, verso: -1 | 1): boolean {
    const v = this.voce(id);
    if (!v || v.stato !== 'attesa') return false;
    const attese = this.voci.filter((x) => x.stato === 'attesa');
    const k = attese.indexOf(v) + verso;
    if (k < 0 || k >= attese.length) return false;
    const altra = attese[k];
    const a = this.voci.indexOf(v), b = this.voci.indexOf(altra);
    this.voci[a] = altra;
    this.voci[b] = v;
    return true;
  }

  /** toglie una voce che non sta lavorando */
  togli(id: number): boolean {
    const i = this.voci.findIndex((v) => v.id === id && v.stato !== 'lavoro');
    if (i < 0) return false;
    this.voci.splice(i, 1);
    return true;
  }

  /** toglie quelle finite (fatte, sbagliate, annullate) */
  pulisciFinite(): number {
    const prima = this.voci.length;
    for (let i = this.voci.length - 1; i >= 0; i--) if (this.voci[i].stato !== 'attesa' && this.voci[i].stato !== 'lavoro') this.voci.splice(i, 1);
    return prima - this.voci.length;
  }

  conta(): Record<StatoVoce, number> {
    const c: Record<StatoVoce, number> = { attesa: 0, lavoro: 0, fatta: 0, errore: 0, annullata: 0 };
    for (const v of this.voci) c[v.stato]++;
    return c;
  }

  /** "1 in lavoro · 2 in coda · 3 finite" */
  riepilogo(): string {
    const c = this.conta();
    const pezzi: string[] = [];
    if (c.lavoro) pezzi.push('1 in lavoro');
    if (c.attesa) pezzi.push(`${c.attesa} in coda`);
    const fin = c.fatta + c.errore + c.annullata;
    if (fin) pezzi.push(`${fin} ${fin === 1 ? 'finita' : 'finite'}`);
    return pezzi.length ? pezzi.join(' · ') : 'La coda è vuota';
  }
}
