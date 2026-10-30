// Il registro delle funzioni AI del programma (contratto condiviso fra i blocchi del lavoro «Banco»).
// Ogni funzione dice che cosa fa, se è PRONTA / OPZIONALE / SPERIMENTALE, quanto pesa e quanta VRAM chiede,
// dove si usa (sulla clip, sull'audio, su tutto il progetto, nel Finale) e se gira nel browser o in locale.
// Il pannello Proprietà (scheda AI) legge da qui con `funzioniPer`; chi aggiunge una funzione la mette in FUNZIONI_AI.
export type StatoAI = 'pronta' | 'opzionale' | 'sperimentale';

export interface FunzioneAI {
  id: string;
  nome: string;
  descrizione: string;
  stato: StatoAI;
  peso?: string;
  vram?: string;
  dove: 'clip' | 'audio' | 'progetto' | 'finale';
  motore: 'browser' | 'locale';
  esegui?: (ctx: { clipIds: string[] }) => Promise<void>;
}

export const FUNZIONI_AI: FunzioneAI[] = [];   // registro

export function funzioniPer(dove: FunzioneAI['dove']): FunzioneAI[] { return FUNZIONI_AI.filter(f => f.dove === dove); }
