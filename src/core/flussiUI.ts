// Regole dei comandi, senza DOM: le stesse usate dai pannelli e dalle prove Node.
import type { Attivita } from '../media/attivita';
export function clipEsplicita<T extends { id: string }>(clips: readonly T[], selezione: ReadonlySet<string>, valida: (c: T) => boolean): T | undefined {
  if (selezione.size !== 1) return undefined;
  return clips.find((c) => selezione.has(c.id) && valida(c));
}
export type AzioneAttivita = 'avvia' | 'pausa' | 'riprendi' | 'annulla' | 'riprova';
type RigaComandi = Pick<Attivita, 'stato' | 'capacita'> & { pausaRichiesta?: boolean; errori?: number };
export function agisciBatch(righe: readonly (RigaComandi & { id: number })[], azione: AzioneAttivita, agisci: (a: AzioneAttivita, id: number) => void) {
  for (const r of [...righe]) if (azioniAttivita(r).includes(azione)) agisci(azione, r.id);
}
export function azioniAttivita(a: RigaComandi): AzioneAttivita[] {
  if (a.stato === 'errore' || (a.stato === 'finita' && (a.errori ?? 0) > 0)) return a.capacita.riprova ? ['riprova'] : [];
  if (a.stato === 'finita' || a.stato === 'annullata') return [];
  const azioni: AzioneAttivita[] = [];
  if (a.stato === 'manuale') azioni.push('avvia');
  else if (a.capacita.pausa !== 'no') azioni.push(a.stato === 'pausa' || a.pausaRichiesta ? 'riprendi' : 'pausa');
  if (a.capacita.annulla) azioni.push('annulla');
  return azioni;
}
