// Gli errori delle funzioni AI detti in parole: dietro c'è una libreria (transformers.js, ONNX Runtime) o un programma
// (il motore NVIDIA) che parla inglese tecnico ("Failed to fetch", "Could not locate file", "Aborted()"...). Chi monta
// deve capire cosa è successo e cosa fare: qui il messaggio grezzo diventa una frase con la soluzione.
// È puro (niente interfaccia): lo usano i sottotitoli, la traduzione, il ritaglio dello sfondo e il Centro AI.

/** il messaggio di un errore qualunque */
export const testoErrore = (e: unknown) => (typeof e === 'string' ? e : e instanceof Error ? e.message : String(e ?? ''));

const REGOLE: [RegExp, string][] = [
  [/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i,
    'La libreria AI non si carica: controlla la connessione a internet e riprova'],
  [/unauthorized|401|403|gated|access to model/i,
    'Questo modello chiede la chiave di Hugging Face: creala gratis su huggingface.co (Settings → Access Tokens), accetta le condizioni del modello e incollala in AI → Impostazioni → Chiave Hugging Face'],
  [/could not locate file|404|not found.*(onnx|json|model)/i,
    'Il modello non si trova su Hugging Face (forse è stato spostato o rinominato): prova un altro modello dalle opzioni'],
  [/failed to fetch|networkerror|network error|load failed|err_internet|err_name_not_resolved|err_connection|net::|timed? ?out/i,
    'Non riesco a scaricare il modello: serve internet la prima volta (poi resta sul computer e va anche senza rete)'],
  [/quota|storage.*full|disk.*full|no space/i,
    'Lo spazio per tenere i modelli è pieno: libera un po\' di spazio sul disco e riprova'],
  [/out of memory|oom|array buffer allocation failed|memory access out of bounds|cannot allocate|bad_alloc|aborted\(\)|maximum call stack/i,
    'La memoria non basta per questo modello: scegli quello più leggero (opzioni) o chiudi gli altri programmi'],
  [/webgpu|\bgpu|device (was )?lost|setpipeline|wgsl/i,
    'La scheda video si è fermata durante il lavoro: riprova (il programma userà il processore)'],
  [/no available backend|backend.*(not|fail)|wasm.*(fail|abort|compile)|webassembly/i,
    'Il motore AI non si avvia su questo sistema: aggiorna il programma o il sistema e riprova'],
];

/** il messaggio grezzo di un errore AI → una frase che spiega cosa è successo e cosa fare */
export function spiegaErroreAI(e: unknown): string {
  const t = testoErrore(e).trim();
  if (!t) return 'L\'AI si è fermata senza dire perché: riprova';
  // già spiegato (le frasi nostre cominciano in italiano e non hanno bisogno di altro)
  if (/^(la |il |lo |non |l'|serve |questa |questo |nel )/i.test(t)) return t;
  for (const [re, frase] of REGOLE) if (re.test(t)) return frase;
  return t.length > 160 ? t.slice(0, 157) + '…' : t;
}

/** l'errore va riprovato sul processore? (la scheda video non ce l'ha fatta) */
export const erroreDellaScheda = (e: unknown) => /webgpu|\bgpu|gpu(device|buffer|queue|adapter|compute|render|pass|pipeline|bindgroup|shader)|device (was )?lost|createbuffer|createcomputepipeline|setpipeline|dispatchworkgroups|bindgroup|wgsl|shader|jsep|validation error|\[webgpu\]|mapasync/i.test(testoErrore(e));

/** il file del modello non c'è (con un altro "tipo" o un altro indirizzo può andare) */
export const erroreFileMancante = (e: unknown) => /could not locate file|404|not found/i.test(testoErrore(e));
