// Il registro di TUTTE le funzioni AI del programma, in un posto solo e senza interfaccia dentro (puro): ogni funzione dice
// cosa fa, in che stato è (PRONTA / OPZIONALE / SPERIMENTALE), quanto pesa, quanta memoria della scheda video usa e dove
// vive (nel browser dell'app o nel motore AI locale opzionale). Lo leggono le schermate (etichette, Centro AI, Ctrl+K) e le prove.
//
// Cosa vogliono dire le tre etichette (le diciamo con onestà, senza gonfiare):
//  · PRONTA       = funziona nell'app com'è, con modelli leggeri scaricati al primo uso; l'abbiamo già vista lavorare.
//  · OPZIONALE    = serve scaricare un modello o il motore AI locale; si sceglie, e il montaggio funziona anche senza.
//  · SPERIMENTALE = c'è la strada, ma non l'abbiamo ancora collaudata col modello vero: può sbagliare o non partire.
// Pesi e VRAM sono quelli dichiarati dai modelli o stime della ricerca del 29/10/2026: non sono misure sulla RTX 4060.
// Tutti i modelli hanno licenze permissive (Apache-2.0, MIT, BSD, CC-BY); l'unica eccezione, Clear, è spegnibile (vedi clear.ts).
//
// Questo contratto è condiviso con le altre schermate: non cambiare i nomi dei campi.

export type StatoAI = 'pronta' | 'opzionale' | 'sperimentale';

export interface FunzioneAI {
  id: string;
  nome: string;
  descrizione: string;
  stato: StatoAI;
  /** quanto pesa quello che si scarica (testo per le persone) */
  peso?: string;
  /** quanta memoria della scheda video usa (testo per le persone) */
  vram?: string;
  /** dove si usa: su una clip, sull'audio, su tutto il progetto, nel Finale */
  dove: 'clip' | 'audio' | 'progetto' | 'finale';
  /** dove gira: nel browser dell'app, o nel motore AI locale opzionale (Python) */
  motore: 'browser' | 'locale';
  /** parte la funzione sulle clip scelte (la collega la schermata che la possiede: `collegaEsecuzione`) */
  esegui?: (ctx: { clipIds: string[] }) => Promise<void>;
}

export const FUNZIONI_AI: FunzioneAI[] = [
  // ——— sulle clip ———
  {
    id: 'sfondo', nome: 'Togli lo sfondo', dove: 'clip', motore: 'browser', stato: 'pronta', peso: 'circa 80 MB', vram: 'circa 1–2 GB (stima)',
    descrizione: 'Stacca la persona o l\'oggetto dallo sfondo senza green screen (SAM 2.1 di Meta, Apache-2.0), con i clic o in automatico.',
  },
  {
    id: 'segui', nome: 'Segui un oggetto', dove: 'clip', motore: 'browser', stato: 'pronta', peso: 'nessun modello', vram: 'nessuna',
    descrizione: 'Segue qualcosa nella ripresa e stabilizza; non scarica niente (correlazione, nessuna rete neurale).',
  },
  {
    id: 'scene', nome: 'Trova i tagli automatici', dove: 'clip', motore: 'locale', stato: 'opzionale', peso: '31 MB', vram: 'meno di 1 GB (anche solo processore)',
    descrizione: 'TransNetV2 (MIT) trova dove cambia la scena e mette dei marcatori sul banco: si spostano, si cancellano o si trasformano in tagli.',
  },
  {
    id: 'rallenta', nome: 'Rallentatore fluido', dove: 'clip', motore: 'locale', stato: 'sperimentale', peso: '23 MB (più l\'ambiente Python, circa 6 GB)', vram: '1–3 GB a 1080p',
    descrizione: 'RIFE 4.25 (MIT) inventa i fotogrammi in mezzo e fa una clip nuova più lenta; l\'originale resta. SPERIMENTALE: mai provato col modello vero, e il motore aspetta ancora il modulo con l\'architettura di RIFE.',
  },
  // ——— sull'audio ———
  {
    id: 'rumore', nome: 'Togli i rumori', dove: 'audio', motore: 'browser', stato: 'pronta', peso: '94 MB (MossFormer2) o 9 MB (DeepFilterNet3)', vram: 'circa 1–3 GB, o solo processore',
    descrizione: 'Toglie ventola, fruscio, strada e riverbero da un parlato e lascia la voce (MossFormer2 e DeepFilterNet3, nel browser dell\'app).',
  },
  {
    id: 'clear', nome: 'Voce da podcast (Clear)', dove: 'audio', motore: 'browser', stato: 'opzionale', peso: 'circa 49 MB', vram: 'solo processore',
    descrizione: 'Rifà la voce con Clear di Desert Ant Labs. La licenza è source-available, NON permissiva (scritta "Powered by Desert Ant Labs", soglia di 100.000 dispositivi, conteggio d\'uso anonimo): si spegne dal Centro AI.',
  },
  {
    id: 'separa', nome: 'Voce e base', dove: 'audio', motore: 'browser', stato: 'pronta', peso: '172 MB (Demucs)', vram: 'circa 2–5 GB, o solo processore',
    descrizione: 'Divide una canzone in voce e base su due tracce (Demucs, MIT); senza il modello c\'è la separazione rapida, meno precisa.',
  },
  {
    id: 'voce-pulita', nome: 'Voce pulita (motore locale)', dove: 'audio', motore: 'locale', stato: 'opzionale', peso: '8 MB (più l\'ambiente Python, circa 4 GB)', vram: 'processore sufficiente',
    descrizione: 'DeepFilterNet3 nel motore locale: la clip passa a un audio nuovo più pulito, l\'originale si conserva e si rimette.',
  },
  {
    id: 'voce-musica', nome: 'Voce e musica (Kim Vocal 2)', dove: 'audio', motore: 'locale', stato: 'opzionale', peso: '0,9 GB (più l\'ambiente Python, circa 6 GB)', vram: '3–6 GB',
    descrizione: 'Mel-Band RoFormer Kim Vocal 2 (MIT) divide il cantato dalla musica su due tracce nuove; l\'originale va in silenzio e si può riaccendere.',
  },
  // ——— su tutto il progetto ———
  {
    id: 'montage', nome: 'Montaggio automatico', dove: 'progetto', motore: 'browser', stato: 'pronta', peso: 'nessun modello', vram: 'nessuna',
    descrizione: 'Da foto e video alla rinfusa un montaggio a tempo di musica, in 28 stili; analisi locale (qualità, battiti), nessun modello da scaricare.',
  },
  {
    id: 'aggiusta', nome: 'Aggiusta tutto (controllo AI)', dove: 'progetto', motore: 'browser', stato: 'pronta', peso: 'nessun modello', vram: 'nessuna',
    descrizione: 'Controlla motore, scheda video, connessione e modelli già presenti, e sistema quello che si può. Non scarica nessun modello da solo.',
  },
  {
    id: 'colore', nome: 'Colore automatico', dove: 'progetto', motore: 'browser', stato: 'pronta', peso: 'nessun modello', vram: 'nessuna',
    descrizione: 'Sistema livelli, bianco e luce di ogni ripresa perché stiano bene insieme (misure sull\'immagine, nessun modello).',
  },
  // ——— nel Finale: parlato, lingue e voci ———
  {
    id: 'sottotitoli', nome: 'Sottotitoli automatici (Whisper)', dove: 'finale', motore: 'browser', stato: 'pronta', peso: '40–564 MB (tre scelte)', vram: 'circa 1–2 GB, o solo processore',
    descrizione: 'Whisper (MIT) ascolta i dialoghi e scrive le righe coi loro tempi, modificabili nella riga SOTT.',
  },
  {
    id: 'sottotitoli-nemotron', nome: 'Sottotitoli con Nemotron (motore NVIDIA)', dove: 'finale', motore: 'locale', stato: 'opzionale', peso: 'da misurare (si scarica con il motore NVIDIA)', vram: 'da misurare',
    descrizione: 'Nemotron 3.5 di NVIDIA, multilingua, nell\'app per Windows e Mac. Mai provato col modello vero da questo ambiente.',
  },
  {
    id: 'sottotitoli-parole', nome: 'Parole con i tempi (Qwen3-ASR)', dove: 'finale', motore: 'locale', stato: 'opzionale', peso: '3,7 GB (due modelli, più l\'ambiente Python, circa 6 GB)', vram: '2–4 GB, un modello alla volta',
    descrizione: 'Qwen3-ASR 0.6B e Qwen3-ForcedAligner 0.6B (Apache-2.0) scrivono ogni parola con il suo tempo: righe di sottotitolo modificabili nella riga SOTT (sostituiscono quelle che ci sono; Ctrl+Z le rimette).',
  },
  {
    id: 'traduci', nome: 'Traduci i sottotitoli (Hy-MT2)', dove: 'finale', motore: 'locale', stato: 'opzionale', peso: '3,6 GB (più l\'ambiente Python, circa 6 GB)', vram: '2–4 GB',
    descrizione: 'Hy-MT2 1.8B (Apache-2.0, 33 lingue) traduce le righe e i tempi restano. Serve il motore AI locale opzionale; al posto di NLLB, che è non commerciale.',
  },
  {
    id: 'voce', nome: 'Voce AI Magpie (motore NVIDIA)', dove: 'finale', motore: 'locale', stato: 'opzionale', peso: 'da misurare (si scarica con il motore NVIDIA)', vram: 'da misurare',
    descrizione: 'Una voce sintetica legge i sottotitoli, una clip per frase. Solo nell\'app per Windows e Mac. Mai provata col modello vero da questo ambiente.',
  },
  {
    id: 'voce-realistica', nome: 'Voce realistica (Qwen3-TTS)', dove: 'finale', motore: 'locale', stato: 'opzionale', peso: '2,5 GB (più Python e torch, circa 15–25 GB in tutto)', vram: '3–4 GB',
    descrizione: 'Qwen3-TTS 0.6B Base (Apache-2.0) legge un testo o i sottotitoli con una voce clonata da un campione di 3–30 secondi; provato sulla RTX 4060.',
  },
];

const per = new Map(FUNZIONI_AI.map((f) => [f.id, f]));

/** la funzione per id (o undefined) */
export const funzioneAI = (id: string): FunzioneAI | undefined => per.get(id);

/** le funzioni di un posto: clip, audio, progetto, finale */
export function funzioniPer(dove: FunzioneAI['dove']): FunzioneAI[] {
  return FUNZIONI_AI.filter((f) => f.dove === dove);
}

/** l'etichetta incisa sul pannello */
export const ETICHETTA_STATO: Record<StatoAI, string> = { pronta: 'PRONTA', opzionale: 'OPZIONALE', sperimentale: 'SPERIMENTALE' };

/** "OPZIONALE · 3,6 GB · VRAM 2–4 GB" — la riga che sta sotto il nome di ogni funzione */
export function rigaStato(f: FunzioneAI): string {
  return [ETICHETTA_STATO[f.stato], f.peso, f.vram ? `VRAM ${f.vram}` : ''].filter(Boolean).join(' · ');
}

/** chi possiede la funzione le dà il suo modo di partire (il registro resta senza interfaccia dentro) */
export function collegaEsecuzione(id: string, esegui: FunzioneAI['esegui']): void {
  const f = per.get(id);
  if (f) f.esegui = esegui;
}
