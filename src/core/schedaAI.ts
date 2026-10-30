// La scheda di una funzione o di un modello AI nel sistema Banco: l'etichetta incisa (PRONTA / OPZIONALE / SPERIMENTALE),
// la riga «peso · VRAM» e quali pulsanti (Installa, Accendi, Spegni…) si possono premere adesso. Niente DOM qui:
// la logica sta da sola, così si prova senza browser. Il disegno è in src/ui/centroAI.ts e src/ui/motoreAI.ts.
import type { FunzioneAI, StatoAI } from './funzioniAI';

/** l'etichetta come si legge sul banco */
export const ETICHETTA_STATO: Record<StatoAI, string> = { pronta: 'PRONTA', opzionale: 'OPZIONALE', sperimentale: 'SPERIMENTALE' };
/** la spia che l'accompagna: verde = pronta, ciano = opzionale, oro = sperimentale (mai magenta) */
export const SPIA_STATO: Record<StatoAI, 'verde' | 'ciano' | 'oro'> = { pronta: 'verde', opzionale: 'ciano', sperimentale: 'oro' };

export const etichettaStato = (s: StatoAI): string => ETICHETTA_STATO[s] ?? ETICHETTA_STATO.opzionale;

/** «peso» e «VRAM» sempre scritti: se non si sa, lo dice invece di tacere (mai un numero inventato) */
export function pesoEVram(f: { peso?: string; vram?: string }, quandoManca = { peso: 'da misurare', vram: 'da misurare' }): { peso: string; vram: string; riga: string } {
  const peso = f.peso?.trim() || quandoManca.peso;
  const vram = f.vram?.trim() || quandoManca.vram;
  return { peso, vram, riga: `PESO ${peso} · VRAM ${vram}` };
}

/** megabyte → «78 MB» oppure «1,2 GB» */
export function pesoDaMb(mb: number | undefined): string | undefined {
  if (!mb || !Number.isFinite(mb) || mb <= 0) return undefined;
  return mb >= 1024 ? (mb / 1024).toFixed(1).replace('.', ',') + ' GB' : Math.round(mb) + ' MB';
}

/** le funzioni del registro in ordine di banco: prima le pronte, poi le opzionali, in fondo le sperimentali */
export function ordinaPerStato(lista: readonly FunzioneAI[]): FunzioneAI[] {
  const peso: Record<StatoAI, number> = { pronta: 0, opzionale: 1, sperimentale: 2 };
  return [...lista].sort((a, b) => peso[a.stato] - peso[b.stato] || a.nome.localeCompare(b.nome, 'it'));
}

export type StatoMotore = 'non-installato' | 'installazione' | 'pronto' | 'avvio' | 'acceso' | 'errore';
export type AzioneScheda = 'installa' | 'accendi' | 'spegni' | 'disinstalla' | 'scarica';

/** quali pulsanti della scheda del motore locale si possono premere con questo stato (occupato = un lavoro è in corso) */
export function azioniPossibili(stato: StatoMotore, occupato = false): Record<AzioneScheda, boolean> {
  const no = { installa: false, accendi: false, spegni: false, disinstalla: false, scarica: false };
  if (occupato) return no;
  return {
    installa: stato === 'non-installato' || stato === 'errore',
    accendi: stato === 'pronto' || stato === 'errore',
    spegni: stato === 'acceso' || stato === 'avvio' || stato === 'installazione',
    // disinstalla non ha condizioni: toglie quel che c'è, anche a metà
    disinstalla: true,
    scarica: stato === 'pronto' || stato === 'acceso',
  };
}

/** la spia della scheda del motore: verde = acceso, ciano = pronto e spento, rosso = da riprovare, spenta altrimenti */
export function spiaMotore(stato: StatoMotore): 'verde' | 'ciano' | 'rosso' | 'spenta' {
  return stato === 'acceso' ? 'verde' : stato === 'pronto' ? 'ciano' : stato === 'errore' ? 'rosso' : 'spenta';
}

/**
 * La regola «un solo pulsante oro per schermata»: dato l'elenco dei pulsanti con la loro importanza, dice quale è
 * l'unico che resta oro (il primo visibile e attivo con `oro: true`); gli altri tornano di metallo.
 */
export function unSoloOro<T extends { oro?: boolean; visibile?: boolean; attivo?: boolean }>(tasti: readonly T[]): (T & { oroFinale: boolean })[] {
  let dato = false;
  return tasti.map((t) => {
    const puo = !!t.oro && t.visibile !== false && t.attivo !== false && !dato;
    if (puo) dato = true;
    return { ...t, oroFinale: puo };
  });
}
