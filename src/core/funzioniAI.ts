// Il registro delle funzioni intelligenti: ognuna dice a che punto è (PRONTA, OPZIONALE, SPERIMENTALE), quanto pesa e
// quanta memoria della scheda video chiede, e dove si usa. Il contratto è condiviso fra più blocchi: chi lavora
// sull'AI riempie `FUNZIONI_AI`, l'interfaccia legge con `funzioniPer`.

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

/** il registro */
export const FUNZIONI_AI: FunzioneAI[] = [];

export function funzioniPer(dove: FunzioneAI['dove']): FunzioneAI[] { return FUNZIONI_AI.filter(f => f.dove === dove); }
