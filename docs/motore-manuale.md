# Motore manual-first — contratto per Astra e QA

Fasi motore/effetti del task `t_9f782a58`. Base `030172f`, continuità dal commit Opus `eed765d`; nessun bump di versione in questa fase. L'integrazione UI e la verifica browser sono fasi successive, non risultati di questo documento.

## Import e riapertura

- `importaFile`, `libreria.importa`, `libreria.apri`: metadati minimi e accesso all'originale. Video: massimo 120 pacchetti per la stima fps. Non si producono poster, picchi, colore, conversioni o nuovi proxy. Le immagini mantengono il percorso precedente.
- Le cache e i proxy esistenti si leggono; inserire una clip in timeline non risveglia preparazioni. Tolto il listener automatico da `ui/app.ts`.
- Le vecchie preferenze `dpv-proxy=sempre` e `dpv-normalizza=si` non autorizzano avvii impliciti; non sono cancellate. `mai` continua a escludere l'uso/offerta dei proxy.
- L'import di basso livello non crea righe. Il comando UI `importaFile`/`riapriMedia` può mostrare una riga `file` per l'apertura: non è un'analisi pesante. Non usare la sua presenza come prova di conversioni automatiche.
- Import annullato o cambio progetto durante una lettura: l'intero batch non ancora consegnato viene scartato, i runtime temporanei chiusi; niente inserimenti nello store nuovo.

## Preparazioni (`src/media/libreria.ts`)

```ts
type Preparazione = 'locandina' | 'colore' | 'picchi' | 'proxy' | 'velocita';
type StatoPreparazione = 'fatta' | 'non-fatta' | 'da-avviare' | 'in-corso' | 'non-serve' | 'errore';
interface OpzioniPreparazione { avvia?: boolean; forza?: boolean; converti?: boolean }

proponiPreparazione(m: MediaItem | string, cosa: Preparazione,
  o?: OpzioniPreparazione): Proposto<unknown> | null;
proponiPreparazioni(ids: readonly string[], cosa: Preparazione,
  o?: OpzioniPreparazione): Proposto<unknown>[];
statoPreparazione(id: string, cosa: Preparazione): StatoPreparazione;
statoPreparazioni(id: string): Record<Preparazione, StatoPreparazione>;
preparaOra(ids: readonly string[], cosa: Preparazione): Promise<string[]>;
quandoPreparazioni(fn: (id: string) => void): () => void;
```

`null` significa già fatta/non necessaria/già proposta: non è automaticamente un errore. `avvia` omesso = **riga manuale**, anche se le preferenze vecchie dicevano sempre. `forza` riguarda il proxy (non i limiti delle corsie). `converti:true` è un consenso esplicito per avviare la conversione successiva all'esame; senza, questa nasce a sua volta manuale. Non passarlo da import/riapertura.

Esempio UI: `proponiPreparazioni(idsScelti, 'picchi')`, poi Avvia singolo o tutti. Per una funzione appena richiesta che necessita dei picchi, usare `await preparaOra(ids, 'picchi')` e lavorare solo sugli ID restituiti. **Astra deve collegarlo a Livella il volume e alle altre funzioni che richiedono misure**: il vecchio messaggio «aspetta e riprova» non basta più.

`non-fatta` non significa errore né coda. `in-corso` comprende coda/lavoro/pausa: per l'etichetta dettagliata leggere la riga Attività. Gli errori decoder di colore/picchi ora falliscono visibilmente, senza dichiarare complete le misure parziali.

## Attività (`src/media/attivita.ts`)

```ts
type StatoAttivita = 'manuale' | 'coda' | 'lavoro' | 'pausa' | 'finita' | 'errore' | 'annullata';
type Pausa = 'vera' | 'ai-confini' | 'no';
interface Proposto<T> { riga: Attivita; avvia: () => void; esito: Promise<T | null> }
interface Filtro { categoria?: Categoria; gruppo?: string; media?: string[] }

proponi<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>): Proposto<T>;
inCoda<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>): Promise<T | null>;
avviaRiga(id: number): number | null;
avviaTutte(filtro?: Filtro): number;
scartaDaAvviare(filtro?: Filtro): number;
pausaRiga(id: number): 'in-pausa' | 'dopo-il-pezzo' | 'non-pausabile';
riprendiRiga(id: number): void;
pausaGruppo(gruppo: string): void;
riprendiGruppo(gruppo: string): void;
annullaRiga(id: number): void; // alias fermaRiga
annullaChiave(chiave: string): boolean;
riprovaRiga(id: number): number;
pausaGlobale(on: boolean): void; // alias pausaLavori: «Non avviare altro»
cambiaProgetto(): void;
```

`OpzioniCoda` richiede titolo/categoria/corsia, con priorità numerica o funzione. Estensioni: `pausa?` (default `no`), `chiave?`, `media?`, `alAvvio?`, `alAnnulla?`, `restaDopoCambio?`. **Non** c'è il parametro `capacita` proposto nella bozza della specifica: le capacità si leggono su `Attivita.capacita`.

- `attivitaDaAvviare()` e `attivitaInCorso()` sono elenchi distinti; la UI attuale deve integrare entrambi. Sottoscrizione `quandoAttivita`, riassunto `riassunto()`/`riassuntoTesto()` (`manuali`, `pausate`, `inCoda`, `inCorso`).
- Le proposte singole confluiscono, all'avvio, nella riga del gruppo: **usare l'ID restituito da `avviaRiga` per Pausa/Annulla**, non quello manuale ormai consumato. Per cancellare un solo file dentro un gruppo, `annullaChiave('picchi:'+id)` ecc.
- Stessa `chiave` attiva = stesso esito, nessuna seconda esecuzione. `inCoda` con la chiave di una proposta la avvia: chiamarlo solo per un gesto esplicito.
- `l.checkpoint()` si chiama tra i pezzi: in pausa libera la corsia e conserva il progresso. Riprendi attende un posto; una seconda Pausa in questa attesa viene rispettata. `l.allaPausa(fn)` collega il vero `pauseSignal` della conversione.
- `l.segnale` annulla il lavoro; **controllare `l.valido` dopo ogni attesa prima di mutare documento/cache**. Lo scheduler scarta il valore restituito tardivamente, ma non può annullare mutazioni fatte impropriamente dal callback.
- Cambio progetto annulla manuali/attive e invalida anche Riprova dei fallimenti vecchi. Gli export già avviati restano per scelta esplicita della API (`restaDopoCambio`, default della categoria export).
- Priorità e limiti hardware restano. `pausaGlobale` non è una pausa di ciò che già lavora: etichettare «Non avviare altro».

### Capacità vere in questa fase

| Preparazione | Pausa |
|---|---|
| Proxy e conversione VFR/CBR | `vera`, stesso oggetto Conversion e stesso punto |
| Forma d'onda / colore | `ai-confini`, conserva blocchi/campioni già letti |
| Locandina / esame velocità | `no`, una singola operazione: non mostrare Pausa |
| Export / clip unica | `no` di partenza |
| Worker AI preesistenti | **non resi pausabili da questo task**: Astra collega checkpoint solo dove il worker lo consente, altrimenti resta `no` |

La pausa del proxy durante il playback resta separata (`pausaProxy`, `attesaMonitor`). Non dichiarare una pausa per qualunque riga solo perché esiste la API.

### Parziali

Proxy: codifica in memoria; scrittura OPFS controlla validità a ogni attesa, annullata anche durante `close()` elimina il risultato proprio e non lo pubblica. Le scritture sono serializzate per nome del file (anche ripristino da .dap; Web Locks fra finestre dove disponibili), senza sovrascrivere o cancellare cache preesistenti. Colore e picchi annullati non vengono applicati/salvati. Errori I/O reali di pulizia non possono garantire una cancellazione fisica e non vanno nascosti come successo.

Conversioni native: `conversione_apri({name}) -> [id,path]` crea un file nuovo in esclusiva (`create_new`), `conversione_annulla({id})` chiude ed elimina solo gli ID del registro conversioni. Un ID di export/.dap è ignorato, nessun percorso arbitrario da cancellare. `export_chiudi` conserva una conversione finita. Frontend e lato Rust aggiornati vanno distribuiti insieme. Crash/terminazione del processo non hanno recupero persistente dei parziali in questo update.

## Effetti

Il catalogo effettivo di partenza contiene **72** effetti (non 59 come nella prima ricognizione); diventa **75**. Aggiunti:

- `grana`: Grana pellicola, sola quantità tramite `forza`; seme intero `floor(frame)` indipendente da glitch e orologio. Griglia di grana fissa 1920×1080 in coordinate normalizzate, senza passate aggiuntive.
- `nitido`: Nitidezza/unsharp mask, aggiunge il dettaglio alla stessa passata di sfocatura/scia/RGB. Forza zero neutra, somma limitata a 2.
- `censura`: mosaico rettangolare; `pos/posFine/via/segue` già esistenti spostano la sua zona. Nessuna dissolvenza temporale automatica che riveli il soggetto ai bordi del blocco. Otto zone indipendenti; oltre, copertura conservativa dell'inviluppo di tutte le zone. Le dimensioni dei quadretti seguono la forza complessiva (la somma si satura).

```ts
interface ParametroFx { chiave: string; nome: string; min: number; max: number; def: number; passo: number }
// EffettoTempo.parametri?: readonly ParametroFx[]
// BloccoFx.parametri?: Record<string, number> (unica estensione persistente, opzionale)
parametroFx(b: BloccoFx, chiave: string): number;
```

Per la censura: `larghezza`, `altezza` (frazioni del quadro, 0.02..2, default .25), `morbido` (bordo esterno, 0..0.2, default .015). Il catalogo è la fonte per i controlli Astra: non duplicare default/range nella UI. Valori assenti/non finiti prendono il default, valori fuori range vengono limitati in lettura. Vignetta, grana del master e duotone preesistenti non sono stati rimossi o rinominati; niente nuovo effetto vignetta duplicato.

La censura opera sulle coordinate campionate **prima delle altre distorsioni**, quindi ne segue zoom/rotazioni/effetti successivi; non è una maschera finale immobile sullo schermo. Non promette anonimizzazione irreversibile: l'utente deve verificare copertura e tracking per tutta la clip. I vecchi renderer saltano gli ID nuovi: **aprendo un progetto nuovo nella 1.5.7 la censura NON protegge più l'immagine**. Astra deve evidenziarlo in README/CHANGELOG.

Monitor, export e tessere percorrono già catalogo/piano/compositore condivisi: non serve un renderer parallelo. Astra collega i parametri opzionali al pannello con `store.edit`; annulla/ripeti provati sullo store reale. Nessun cambiamento alle durate di clip, grafo audio o scorciatoie 1/2.

## Verifiche reali e limiti

Comandi non-GUI:

```sh
npm run typecheck
npm run build
npm run prova:motore
rustc --test test/unit/conversioni-native.rs -o test/.tmp/conversioni-test.exe
test/.tmp/conversioni-test.exe
cargo check --manifest-path src-tauri/Cargo.toml
node --check test/prove-effetti.mjs # solo sintassi, NON esegue Chromium
```

Suite Node: **47/47 test riusciti**, scheduler, default con vecchie preferenze, import/riapertura 20 file, calcolo reale picchi WAV, pause/cancel, race di progetto/import/copia, errori decoder iniettati, OPFS finto, catalogo/stati/comandi GL registrati e annulla/ripeti. Decoder immagini e parte browser sono finti; il test GL registra le uniform **non produce pixel GPU**. Test nativo: file reale creato/cancellato, originale protetto e conversione finita conservata. Compilazione integrata Rust `cargo check` riuscita.

Baseline numerica: `cattura-baseline-effetti.mjs` ricostruisce il codice Git di `eed765d` senza modificare checkout e verifica che i numeri siano finiti; hash di 72 effetti × 4 istanti in `riferimenti/stati-fx-1.5.7.json`. Gli stati preesistenti restano identici; non è una baseline pixel.

Ottimizzazione CPU misurata: `statoEffetti` evita di cercare i tagli negli effetti che non usano il picco. Banco 200 clip, 3 FX, mediana di 5×100 chiamate (Node 26.7): BN .024906→.011275 ms, Sfoca .021674→.008868, Bagliore .021737→.010669; Lampo, che necessita del picco, .024745→.021271 (varianza, non ottimizzato). Non sono tempi GPU né fps dell'app.

### Gate Luna, prima di dichiarare assenza di regressioni

1. Gate 0 su `030172f`: suite originale, foto 1024/1366/1920, benchmark timeline 200 clip e rendering 1080p. Nessun Gate 0 browser eseguito da Sol.
2. `prove-effetti.mjs` scritto ma **NON eseguito da Sol**. Primo giro con `DPV_DIST=<dist-base>` e `--cattura=test/.out/fx-base.json`; secondo sul candidato con `--riferimento=... --bench`. Stesso backend/driver per il confronto; `DPV_GPU=1` per hardware, default SwiftShader. Confronta pixel pre-codec monitor/fornitore immagine export, determinismo, vecchi hash e copertura spaziale singola/doppia/overflow/forza zero. Salvare gli hash GPU reali nel repo solo dopo verifica, mai generarli da numeri SSR.
3. Completare export **video codificato reale** (non coperto dal test immagine pre-codec), tracking in movimento e sovrapposizioni con distorsioni; controllo visivo censura e costo GPU su 0/1/3 FX. Il file sintetico è una fixture di test, non un media utente.
4. Proxy e conversione veri con WebCodecs/Tauri: pausa/riprendi stesso punto, annulla a metà, assenza di file parziali OPFS/disco; memoria e reattività. La pausa vera Node usa una conversione simulata, non prova l'encoder.
5. `.dap` con proxy preesistenti, `.dpv` e `.daprod`, salva/riapri incrociato 1.5.7; sync audio/video e tasti 1/2. Il solo round-trip JSON Node non certifica tutti i contenitori.
6. AI: Astra collega i passi e i checkpoint autorizzati. Non dichiarare questa fase come implementazione del nuovo flusso AI/UI.
