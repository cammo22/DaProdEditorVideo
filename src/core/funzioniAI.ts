// Il registro delle funzioni AI: un posto solo dove ogni funzione dice cosa fa, quanto pesa, quanta VRAM chiede e se è
// PRONTA, OPZIONALE o SPERIMENTALE. Lo riempie il blocco «ai»; il Centro AI e il menu AI lo leggono e basta.
export type StatoAI = 'pronta' | 'opzionale' | 'sperimentale';
export interface FunzioneAI { id: string; nome: string; descrizione: string; stato: StatoAI; peso?: string; vram?: string; dove: 'clip' | 'audio' | 'progetto' | 'finale'; motore: 'browser' | 'locale'; esegui?: (ctx: { clipIds: string[] }) => Promise<void> }
export const FUNZIONI_AI: FunzioneAI[] = [];   // registro
export function funzioniPer(dove: FunzioneAI['dove']): FunzioneAI[] { return FUNZIONI_AI.filter(f => f.dove === dove); }
