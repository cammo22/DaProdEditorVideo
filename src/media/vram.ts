// La memoria della scheda video (VRAM). I modelli AI restano caricati nei loro worker dopo il lavoro (SAM 3 + SAM 2.1 circa 1 GB, Whisper
// circa mezzo giro in più): senza un limite la scheda resta piena finché il programma è aperto, e si porta via la memoria a giochi, render
// e altri programmi. Qui ogni modello che sta in un worker si iscrive con due cose: come si scarica e se sta lavorando adesso. Se per
// un po' (di partenza 90 s) nessuno lo usa, o se si preme «Libera la memoria della scheda video», i worker si chiudono e la memoria torna
// libera; la volta dopo il modello si ricarica dalla cache del computer (secondi, senza rete). Il filtro dei rumori e la separazione
// voce/base non servono: il loro worker si chiude già alla fine di ogni lavoro.
interface Voce { libera: () => boolean; occupato: () => boolean }
const voci = new Map<string, Voce>();
let ultimo = 0;
let giro = 0;
let scadenza = 90_000;

/** per le prove: quanto aspettare prima di liberare da soli (ms) */
export const impostaScadenzaVram = (ms: number) => { scadenza = ms; };
export const scadenzaVram = () => scadenza;

/** un modello da scaricare dalla scheda: `libera` chiude il suo worker (true se c'era qualcosa da chiudere), `occupato` dice se sta lavorando */
export function registraVram(nome: string, v: Voce) { voci.set(nome, v); }

/** qualcuno ha appena usato un modello: il conto dei secondi riparte */
export function segnaUsoAI() {
  ultimo = Date.now();
  if (giro || typeof window === 'undefined') return;
  giro = window.setInterval(controlla, Math.max(20, Math.min(15_000, scadenza / 3)));
}

function controlla() {
  if (Date.now() - ultimo < scadenza) return;
  if ([...voci.values()].some((v) => v.occupato())) { ultimo = Date.now(); return; }
  liberaVram();
}

/** scarica dalla scheda video tutti i modelli che non stanno lavorando: torna quanti worker ha chiuso */
export function liberaVram(): number {
  let n = 0;
  for (const v of voci.values()) {
    if (v.occupato()) continue;
    try { if (v.libera()) n++; } catch { /* un worker già morto */ }
  }
  if (giro) { clearInterval(giro); giro = 0; }
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dpv:vram', { detail: n }));
  return n;
}
