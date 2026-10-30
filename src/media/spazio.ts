// Lo spazio che il programma si porta dietro: copie leggere (disco privato), memoria delle misure (forme d'onda, colori,
// locandine), versioni del progetto, e il .dap che cresce a ogni Salva perché si aggiunge in fondo.
// Qui si misura e si pulisce; la finestra con la conferma è in src/ui/solido.ts (Centro attività → Spazio).
// Non si toglie mai niente che sia un progetto o un file dell'utente: solo cose che il programma rifà da solo.
import type { Project } from '../core/tipi';
import { pianoCopieLeggere, spreco, GIORNI_VECCHIO } from '../core/solido';
import { potaCacheVecchia, statisticheCache } from './cache';
import { elencaProxy, nomeProxy, togliProxy } from './proxy';
import { pesoVersioni, potaTutteLeVersioni } from './versioni';

export interface RiepilogoSpazio {
  copie: ReturnType<typeof pianoCopieLeggere>;
  cache: Awaited<ReturnType<typeof statisticheCache>>;
  versioni: { quante: number; byte: number };
  /** quanto il browser/app dice di usare e di poter usare */
  quota?: { usata: number; totale: number };
  /** il .dap aperto: la grandezza, quella che basterebbe riscrivendolo da capo, lo spreco (0 = niente da dire) */
  dap?: { percorso: string; byte: number; necessario: number; spreco: number };
}

export interface SceltePulizia { copieVecchie: boolean; copieAltre: boolean; cache: boolean; versioni: boolean }

/** misura tutto. `dap` = come leggere il .dap aperto (nell'app) se c'è: la grandezza del file e quella che servirebbe */
export async function misuraSpazio(p: Pick<Project, 'media'>, dap?: () => Promise<{ percorso: string; byte: number; necessario: number } | null>, ora = Date.now()): Promise<RiepilogoSpazio> {
  const inUso = new Set(p.media.filter((m) => m.type === 'video').map((m) => nomeProxy(m)));
  const [copie, cache, versioni] = await Promise.all([
    elencaProxy().then((l) => pianoCopieLeggere(l, inUso, ora, GIORNI_VECCHIO)),
    statisticheCache(GIORNI_VECCHIO, ora),
    pesoVersioni(),
  ]);
  const r: RiepilogoSpazio = { copie, cache, versioni };
  try {
    const s = await navigator.storage?.estimate?.();
    if (s?.quota) r.quota = { usata: s.usage ?? 0, totale: s.quota };
  } catch { /* il browser non lo dice */ }
  try {
    const d = await dap?.();
    if (d) r.dap = { ...d, spreco: spreco(d.byte, d.necessario) };
  } catch { /* .dap non leggibile: niente consiglio */ }
  return r;
}

/** quanto si libererebbe con queste scelte, all'incirca */
export function liberabile(r: RiepilogoSpazio, s: SceltePulizia): number {
  return (s.copieVecchie ? r.copie.byteVecchie : 0) + (s.copieAltre ? r.copie.byteAltre : 0) + (s.cache ? r.cache.byteVecchie : 0) + (s.versioni ? r.versioni.byte : 0);
}

/**
 * Pulisce quello che si è scelto. Le copie leggere dei file di questo progetto non si toccano mai; la memoria delle
 * misure perde solo le voci che non si usano da un mese; le versioni vanno via tutte tranne l'ultima di ogni progetto.
 */
export async function puliscoSpazio(r: RiepilogoSpazio, s: SceltePulizia): Promise<{ copie: number; cache: number; versioni: number }> {
  const nomi = [...(s.copieVecchie ? r.copie.vecchie : []), ...(s.copieAltre ? r.copie.altre : [])].map((c) => c.nome);
  const copie = nomi.length ? await togliProxy(nomi) : 0;
  const cache = s.cache ? await potaCacheVecchia(GIORNI_VECCHIO) : 0;
  const versioni = s.versioni ? await potaTutteLeVersioni(1) : 0;
  return { copie, cache, versioni };
}
