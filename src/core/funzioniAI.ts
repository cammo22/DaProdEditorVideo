// Il registro delle funzioni AI: ogni funzione dice com'è messa (PRONTA / OPZIONALE / SPERIMENTALE), quanto pesa e quanta
// VRAM chiede, e dove si usa. L'interfaccia le mostra con la stessa etichetta ovunque.
export type StatoAI = 'pronta' | 'opzionale' | 'sperimentale';
export interface FunzioneAI { id: string; nome: string; descrizione: string; stato: StatoAI; peso?: string; vram?: string; dove: 'clip' | 'audio' | 'progetto' | 'finale'; motore: 'browser' | 'locale'; esegui?: (ctx: { clipIds: string[] }) => Promise<void> }
export const FUNZIONI_AI: FunzioneAI[] = [];   // registro
export function funzioniPer(dove: FunzioneAI['dove']): FunzioneAI[] { return FUNZIONI_AI.filter(f => f.dove === dove); }
