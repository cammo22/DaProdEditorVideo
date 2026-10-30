// Il registro delle funzioni AI: ognuna dice cosa fa, se è PRONTA / OPZIONALE / SPERIMENTALE, quanto pesa e quanta
// scheda video chiede, e dove compare (su una clip, nell'audio, nel progetto, nel Finale). Le schermate leggono
// da qui (`funzioniPer`) invece di avere ognuna il suo elenco. Lo riempie il blocco «ai».
export type StatoAI = 'pronta' | 'opzionale' | 'sperimentale';
export interface FunzioneAI { id: string; nome: string; descrizione: string; stato: StatoAI; peso?: string; vram?: string; dove: 'clip' | 'audio' | 'progetto' | 'finale'; motore: 'browser' | 'locale'; esegui?: (ctx: { clipIds: string[] }) => Promise<void> }
export const FUNZIONI_AI: FunzioneAI[] = [];   // registro
export function funzioniPer(dove: FunzioneAI['dove']): FunzioneAI[] { return FUNZIONI_AI.filter(f => f.dove === dove); }
