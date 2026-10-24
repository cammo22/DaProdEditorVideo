// La tastiera. I numeri della fila in alto sono i tasti di montaggio (1 taglia, 2 elimina…);
// quelli del tastierino numerico scrivono il timecode, come sulle centraline e in EDIUS.
import { azioni } from '../azioni';

let mappa: Map<string, string> | null = null;

function costruisci() {
  mappa = new Map();
  for (const a of azioni.values()) for (const t of a.tasti ?? []) mappa.set(t.toLowerCase(), a.id);
}

export function nomeTasto(e: KeyboardEvent): string {
  let k: string;
  if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) k = 'Num' + e.code.slice(6);
  else if (e.key === ' ') k = 'Space';
  else if (e.key.length === 1) k = e.key.toUpperCase();
  else k = e.key;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  // lo Shift conta solo per i tasti "con nome" e le lettere (non per ',' '.' che su alcune tastiere lo chiedono)
  if (e.shiftKey && (k.length > 1 || /^[A-Z0-9]$/.test(k))) mods.push('Shift');
  return [...mods, k].join('+');
}

/** i comandi che vanno anche con la pagina iniziale aperta */
const SOPRA_HOME = new Set(['apri', 'schermoIntero', 'cerca', 'guida']);

let tcInserimento: ((cifra: string) => void) | null = null;
/** il monitor attivo registra qui chi riceve le cifre del tastierino */
export function suTastierino(fn: (cifra: string) => void) { tcInserimento = fn; }

export function installaTastiera() {
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const inCampo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (inCampo) {
      if (e.key === 'Escape') (t as HTMLInputElement).blur();
      return;
    }
    // Tab cambia monitor solo sul banco/timeline, non quando si navigano i controlli.
    // Include i figli (icone/testo) e i controlli semantici, anche fuori dai campi editabili.
    if (e.key === 'Tab' && t?.closest('button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"]')) return;
    if (document.querySelector('.velo')) return; // dialogo aperto
    const home = document.documentElement.classList.contains('home-aperta'); // la pagina iniziale copre il banco
    if (/^Numpad\d$/.test(e.code) && !e.ctrlKey && !e.altKey && !home) {
      e.preventDefault();
      tcInserimento?.(e.code.slice(6));
      return;
    }
    if (!mappa) costruisci();
    const nome = nomeTasto(e).toLowerCase();
    const id = mappa!.get(nome);
    if (!id) return;
    // sopra la pagina iniziale valgono solo i comandi che non toccano il montaggio nascosto
    if (home && !SOPRA_HOME.has(id)) return;
    // [ e ] solo se il tasto scritto è davvero una parentesi (sulla tastiera italiana quei tasti sono è e +)
    if ((nome === '[' || nome === ']') && e.key !== '[' && e.key !== ']') return;
    e.preventDefault();
    azioni.get(id)!.fn();
  });
}

export function tastiDi(id: string): string {
  const a = azioni.get(id);
  return a?.tasti?.[0]?.replace('Ctrl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl') ?? '';
}
