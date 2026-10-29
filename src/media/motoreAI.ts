// Client del motore facoltativo: Rust custodisce porta e token, il browser non contatta localhost.
import { leggiWav } from './wav';

export type StatoLocale = 'non-installato' | 'installazione' | 'pronto' | 'avvio' | 'acceso' | 'errore';
export type AzioneLocale = 'installa' | 'accendi' | 'spegni' | 'disinstalla';
export interface StatoMotoreAI { stato: StatoLocale; k: number | null; dettaglio: string; cartella: string }
export interface ModelloLocale { id: string; nome: string; repo: string; revisione: string; licenza: string; byte: number; requisiti: string; scaricato: boolean }
export interface OpzioniVoceLocale { campione: string; testoCampione?: string; lingua: string; dispositivo: 'cuda' | 'cpu' }
export type AvanzaLocale = (k: number | null, testo: string) => void;
export type TrasportoLocale = <T>(comando: string, dati?: Record<string, unknown>) => Promise<T>;

/** Le transizioni ammesse prima di chiedere a Rust; il suo stato resta la fonte definitiva. */
export function transizioneLocale(stato: StatoLocale, azione: AzioneLocale): StatoLocale {
  if (azione === 'spegni') return ['non-installato', 'installazione'].includes(stato) ? 'non-installato' : 'pronto';
  if (azione === 'disinstalla') return 'non-installato';
  if (azione === 'installa' && ['non-installato', 'errore'].includes(stato)) return 'installazione';
  if (azione === 'installa' && stato === 'pronto') return stato;
  if (azione === 'accendi' && ['pronto', 'errore'].includes(stato)) return 'avvio';
  if (azione === 'accendi' && ['acceso', 'avvio'].includes(stato)) return stato;
  throw new Error('Il motore sta lavorando o manca l’installazione: aspetta e riprova');
}
export const motoreLocaleDisponibile = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && /Win/i.test(navigator.platform);
const trasporto: TrasportoLocale = async (comando, dati) => (await import('../platform')).invoke(comando, dati);
const attendi = (ms: number, segnale?: AbortSignal) => new Promise<void>((ok, no) => {
  const ferma = () => { clearTimeout(t); segnale?.removeEventListener('abort', ferma); no(new Error('fermato')); };
  const t = setTimeout(() => { segnale?.removeEventListener('abort', ferma); ok(); }, ms);
  if (segnale?.aborted) ferma(); else segnale?.addEventListener('abort', ferma, { once: true });
});
export function base64DaByte(byte: Uint8Array): string {
  let testo = '';
  for (let i = 0; i < byte.length; i += 16384) testo += String.fromCharCode(...byte.subarray(i, i + 16384));
  return btoa(testo);
}
export class MotoreAI {
  constructor(private chiama: TrasportoLocale = trasporto, private intervallo = 400) {}
  stato() { return this.chiama<StatoMotoreAI>('ai_locale_stato'); }
  async azione(azione: AzioneLocale, avanza: AvanzaLocale = () => {}, segnale?: AbortSignal): Promise<void> {
    if (segnale?.aborted) throw new Error('fermato');
    const s = await this.stato();
    transizioneLocale(s.stato, azione);
    if (segnale?.aborted) throw new Error('fermato');
    await this.chiama('ai_locale_' + azione);
    if (azione !== 'installa' && azione !== 'accendi') return;
    const fine = Date.now() + (azione === 'installa' ? 45 * 60_000 : 30_000);
    try {
      for (;;) {
        if (segnale?.aborted) throw new Error('fermato');
        const r = await this.stato();
        if (segnale?.aborted) throw new Error('fermato');
        avanza(r.k, r.dettaglio);
        if (r.stato === 'errore') throw new Error(r.dettaglio || 'Il motore non è partito: riprova');
        if (r.stato === (azione === 'installa' ? 'pronto' : 'acceso')) return;
        if (Date.now() > fine) throw new Error('Il motore non risponde in tempo: riprova');
        await attendi(this.intervallo, segnale);
      }
    } catch (e) { await this.chiama('ai_locale_spegni').catch(() => {}); throw e; }
  }
  richiesta<T>(metodo: 'GET' | 'POST', percorso: string, dati: Record<string, unknown> = {}): Promise<T> {
    return this.chiama<T>('ai_locale_richiesta', { metodo, percorso, dati });
  }
  async modelli(): Promise<ModelloLocale[]> { return (await this.richiesta<{ modelli: ModelloLocale[] }>('GET', '/modelli')).modelli; }
  async lavoro<T>(percorso: '/modelli/scarica' | '/voce/genera' | '/voce/clona', dati: Record<string, unknown>, avanza: AvanzaLocale, segnale?: AbortSignal): Promise<T> {
    if (segnale?.aborted) throw new Error('fermato');
    const { id } = await this.richiesta<{ id: string }>('POST', percorso, dati);
    const fine = Date.now() + 45 * 60_000;
    try {
      for (;;) {
        if (segnale?.aborted) throw new Error('fermato');
        const r = await this.richiesta<{ stato: string; k: number | null; dettaglio: string; errore?: string; risultato: T }>('GET', '/lavori/' + id);
        if (segnale?.aborted) throw new Error('fermato');
        avanza(r.k, r.dettaglio);
        if (r.stato === 'errore') throw new Error(r.errore || 'Il lavoro non è riuscito: riprova');
        if (r.stato === 'finito') return r.risultato;
        if (Date.now() > fine) throw new Error('Il lavoro ha superato il tempo massimo: riprova');
        await attendi(this.intervallo, segnale);
      }
    } catch (e) {
      // La terminazione del processo annulla davvero anche un'inferenza CUDA in corso.
      await this.chiama('ai_locale_spegni').catch(() => {});
      throw e;
    }
  }
  async genera(testo: string, o: OpzioniVoceLocale, avanza: AvanzaLocale, segnale?: AbortSignal) {
    if (!o.campione) throw new Error('Qwen3-TTS Base richiede un campione vocale da almeno 3 secondi');
    const r = await this.lavoro<{ wav: string }>('/voce/genera', { ...o, testo }, avanza, segnale);
    return leggiWav(Uint8Array.from(atob(r.wav), (c) => c.charCodeAt(0)));
  }
  async clona(testo: string, o: OpzioniVoceLocale, avanza: AvanzaLocale, segnale?: AbortSignal) {
    if (!o.campione) throw new Error('Scegli il campione della voce da clonare');
    const r = await this.lavoro<{ wav: string }>('/voce/clona', { ...o, testo }, avanza, segnale);
    return leggiWav(Uint8Array.from(atob(r.wav), (c) => c.charCodeAt(0)));
  }
}
export const motoreAI = new MotoreAI();
