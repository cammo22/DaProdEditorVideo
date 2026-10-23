# DaProd Video — aggiornamento ampio: specifica, baseline e piano di integrazione

Task Kanban **t_76aab70a** (claude-sonnet) · richiesta di Cammo girata da Sol · 23/10/2026.
Questo file è una **specifica**: nessun codice dell'app è stato toccato. Chi programma sono Astra e Opus, la QA è di Luna/Haiku.

Come è stata scritta: dal codice di `origin/main` (030172f) e da `CLAUDE.md`, **non guardando l'app in funzione** (a Sonnet è vietato pilotare mouse/tastiera e Playwright). Dove la specifica dice «oggi», è quello che il codice fa; dove dice «deve», è la richiesta di Cammo. Le scelte di **grafica** (come deve *apparire* Finale, LIVE, Montage) non sono state date da Cammo: qui ci sono solo i vincoli funzionali e di struttura, e le decisioni aperte in fondo.

## 0. Base e baseline

| Cosa | Esito |
|---|---|
| Base corretta | **`origin/main` = 030172f** (merge della PR #34). Il branch locale `rilascio/2026-10-21` (913ddba, pulito) è **un solo commit indietro**: quel commit è il merge, `git diff HEAD origin/main` è **vuoto**. Nessun commit locale da salvare. |
| Dove lavorare | Un worktree per fase, da `origin/main`: `git worktree add -b <branch> .worktrees/<nome> origin/main` (il checkout dell'utente non si tocca) e `ln -s ../../node_modules node_modules`. |
| Versione | `package.json` 1.5.7. `CLAUDE.md` dice «il numero sale di 0.0.1»: **1.5.8** per un solo bump a fine integrazione (una PR di versione, non una per fase). Se Cammo vuole 1.6.0 lo dice lui (decisione D1). |
| `npm run typecheck` | **ok** (3,5 s, 0 errori) |
| `npm run build` | **ok** (12,6 s, solo l'avviso Vite sui chunk grandi; `prebuild` = `scripts/ai-locale.mjs` ha girato) |
| Prove Chromium (`node test/prove*.mjs`) | **non eseguite da Sonnet** (usano Chromium/Playwright via `test/aiuti.mjs`, vietato a questo profilo). Le fa Luna/Haiku prima di ogni consegna: elenco in §7. |
| Rust (`cargo check`) | non eseguito: serve solo se si tocca `src-tauri/` |
| Problemi reali trovati | (1) `CLAUDE.md` dice che la copia leggera si fa **solo per chi sta in timeline**, ma `libreria.ts:preparaProxy` la mette in coda **già all'import** (1.5.1) e alla riapertura (`apri` → righe 122-123). La documentazione è indietro rispetto al codice. (2) `CLAUDE.md` dice «Cammo vuole il push dritto su main»: **non vale più**, ora branch+PR, niente merge né force-push. (3) La pagina wiki `entities/daprodvideo.md` dice 1.5.6 non pubblicata: è vecchia, la 1.5.7 è su `main` (la cura Sol, non è stata toccata). |

## 1. Regole che non si toccano

1. Tasti **1 = taglia, 2 = elimina** invariati (`azioni.ts`, `bersagliDelTaglio`). Nessun tasto su due comandi (lo controlla `prove-rifiniture`).
2. Compatibilità **.dap / .dpv / .daprod**: il progetto non ha un campo «versione». La regola è: **solo campi nuovi e opzionali**, mai tolti né rinominati; ogni campo nuovo ha un valore di partenza che si comporta come oggi (`migraBlocchi` in `progetti.ts` è il modello). Un progetto salvato dalla nuova versione deve aprirsi nella 1.5.7 (senza le cose nuove) senza errori; uno della 1.5.7 deve aprirsi nella nuova identico. Un `.dap` contiene `progetto.json` (scritto per ultimo), `media/…` e `proxy/…`: **togliere i proxy automatici non rompe i `.dap` già fatti** (si leggono se ci sono), ma non se ne devono più scrivere di nuovi da soli.
3. Una cosa sola, uguale ovunque: monitor ed export passano dallo stesso `piano.ts` + `compositore.ts`; riproduzione e mixaggio dallo stesso grafo audio. Ogni effetto nuovo si prova in **tutti e due**.
4. Il **montaggio non copre mai niente** da solo; le transizioni non cambiano la durata delle clip (invarianti di `montaggio.ts`).
5. Italiano parlato in commenti, messaggi, CHANGELOG. Famiglia grafica A del design system (`wiki/llmwiki/docs/design-system.md`: notte viola, oro/magenta/ciano, barra del titolo bianca **40px** = decisione ancora da confermare per Video, oggi `--bt-alto` 34px → D5).
6. Niente analisi pesanti, conversioni o copie leggere **da sole**, mai: né all'import, né quando una clip entra in timeline, né alla riapertura del progetto (vedi §3.1).

## 2. Mappa rapida del codice (dove stanno le cose)

| Area | File principali |
|---|---|
| Import / libreria media | `src/progetti.ts` (`importaFile`, `controllaVelocita`, `mettiCopia`, `riapriMedia`), `src/media/libreria.ts` (`importa`, `apri`, `preparaLavori`, `risvegliaProxy`, `locandina`, `misuraColore`, `calcolaPicchi`), `src/media/proxy.ts`, `src/media/normalizza.ts`, `src/media/cache.ts` |
| Attività (scheduler) | `src/media/attivita.ts` (registro + corsie `leggero`/`pesante`), `src/ui/attivita.ts` (`CentroAttivita`), `src/ui/lavoro.ts` (`BarraLavoro`) |
| AI | `src/ui/centroAI.ts` (`FUNZIONI_AI`, `diagnosi`), `src/media/libreriaAI.ts`, `erroriAI.ts`, `hardware.ts`, worker `ritaglio/voce/traduci/audioAI/provaAI`, `modelliAudio.ts`, `nemo.ts`, `clear.ts` |
| Montaggio (banco) | `src/ui/app.ts`, `timeline.ts`, `monitor.ts`, `contenitore.ts`, `ispettore.ts`, `pulsantiera.ts`, `core/montaggio.ts` |
| Finale | `src/ui/finale.ts` (sezioni `colore, audio, sottotitoli, logo, apertura, lingue, esporta`), `src/render/colore.ts`, `src/export/esporta.ts` |
| LIVE | `src/ui/live.ts` (1376 righe: `Regia`, `Live`), `liveAudio.ts`, `telecomando.ts`, `core/liveAudio.ts` |
| Montage (F8) | `src/ui/montage.ts`, `src/core/montage.ts` (puro), `montagePreset.ts` (28 stili), `media/exif.ts, qualita.ts, ritmo.ts` |
| Effetti | `src/core/blocchi.ts` (catalogo, ~75 blocchi, `CAMPI_FX`), `src/effetti.ts` (effetti di clip), `src/render/compositore.ts` (shader), `src/render/transizioni.ts`, `src/render/piano.ts` |

## 3. Specifica per schermata

### 3.1 Import (trasversale) — «solo il minimo»

**Oggi.** `importaFile` → `libreria.importa` fa: lettura del contenitore, **locandina** (decodifica di un fotogramma), poi `preparaLavori` = **colore automatico** + **forme d'onda** + **copia leggera** (`preparaProxy`); poi `controllaVelocita` (esame VFR/CBR e, se serve, **conversione** a velocità costante). La stessa catena riparte in `apri` quando si riapre un progetto; `risvegliaProxy` (`app.ts:158`) rimette in coda i proxy a ogni modifica del documento per i file in timeline.

**Deve.** All'import **si leggono solo i metadati** (`Input.getFormat`, durata, t0, tracce, dimensioni, fps *dichiarato*, codec, canali, `canDecode`) e il file è **subito utilizzabile**: monitor e timeline lo leggono dall'originale. Quindi:
- tolti dal percorso automatico: locandina, colore, picchi, proxy, esame VFR/CBR, conversione. La scheda del contenitore mostra un'icona di tipo (video/audio/immagine) e i dati; la locandina compare solo se l'utente la chiede o è già in cache (`cache.ts`, lettura gratis).
- **non cambia dopo l'inserimento in timeline, né alla riapertura**: `risvegliaProxy`, `riapriMedia`/`apri` non accodano niente. Una cache già presente (`dpv-cache`, proxy sul disco, `.dap` con `proxy/`) **si legge** (costa poco), ma **non si produce**.
- le **immagini** restano come oggi (nessun lavoro di fondo).
- Per le cose che servono davvero (un 4K che scatta, una forma d'onda per tagliare a tempo) ci sono **azioni manuali** (§3.5): «Prepara copia leggera», «Calcola forma d'onda», «Controlla velocità file», «Colore automatico», «Locandina». Si lanciano per un file, per i file scelti, o «tutti i file del contenitore». Il tasto destro sulla scheda e la sezione **Anteprima e file** delle Proprietà le offrono; **il Centro attività non parte da solo**: sono righe che nascono nello stato `manuale` e partono con **Avvia** (§4.1).
- Impostazioni esistenti da riusare: `dpv-proxy` (`auto|sempre|mai`) diventa `manuale` di partenza (mai `auto` per i progetti nuovi); `dpv-normalizza` (`si|no`) diventa `manuale`. **Chi aveva scelto `sempre` o `no` esplicitamente mantiene la scelta** (D2).
- **Per una clip senza forma d'onda** la timeline disegna una barra piatta con la scritta «forma d'onda non calcolata» e il pulsante; il taglio, lo spostamento e il playback non dipendono dai picchi (da verificare in prova: `grep peaks` in `timeline.ts`/`audio.ts`).
- Rischio da misurare (non da nascondere): senza colore automatico il colore di partenza deve essere neutro (`r.colore` assente = nessuna correzione): verificare che il compositore regga `colore === undefined`.

Criterio di accettazione: dopo l'import di 20 file e dopo aver messo tutto in timeline e aver chiuso e riaperto il progetto, **`attivitaInCorso()` e `attivitaFinite()` sono vuote** e nessun file in OPFS `proxy-1` è stato scritto.

### 3.2 Attività (Centro attività)

**Oggi.** `CentroAttivita` mostra righe (`coda|lavoro|finita|errore|annullata`), gruppi dello stesso tipo, ⚡ Sovraccarica, «metti in pausa» (**solo globale**: `pausaLavori(on)` = non partono lavori *nuovi*, quelli in corso finiscono), ✕ annulla. Le pause reali esistono solo per il proxy (`conv.execute({pauseSignal})` + `fermo` quando il montaggio suona).

**Deve.**
- **Avvio**: una riga si avvia da sola solo se l'ha chiesto l'utente in quel momento (es. ha premuto *Esporta* o *Sottotitoli AI*). I lavori «di preparazione» nascono `manuale`. Pulsanti per riga: **Avvia**; per gruppo/categoria: **Avvia tutti** (batch: rispetta le corsie e i limiti, `sovraccarica` invariato).
- **Pausa/ripresa/cancella per riga e per gruppo**, con semantica **dichiarata e vera** (§4.1: `pausa` = `'vera' | 'ai-confini' | 'no'`):
  - `vera`: copie leggere e conversioni (mediabunny `pauseSignal`, già usato); download dei modelli (si ferma la richiesta e si **riprende dall'offset**: `modelliAudio.ts` scarica già a pezzi con ripresa, estendere a `libreriaAI`/transformers cache dove possibile, altrimenti `ai-confini`).
  - `ai-confini`: sottotitoli, voce, rumore, separazione, sfondo AI, forme d'onda: si ferma **fra un pezzo e il successivo** (finestre già esistenti: 30 s Whisper, segmenti Demucs da 343980 campioni, fotogrammi del ritaglio). La riga dice «in pausa dopo il pezzo corrente» fino a che non si ferma davvero; i pezzi già fatti **non si rifanno** alla ripresa.
  - `no`: esportazione e Clip unica (sono un unico flusso): c'è solo **Annulla**, il pulsante Pausa non compare. Nessun pulsante finto.
- **Cancella** = annulla e scarta il parziale (file temporanei, OPFS, stato `proxyStato`), la riga passa ad `annullata`. **Riprova** su `errore`.
- Il «metti in pausa» globale resta ma cambia nome in **«Non avviare altro»** (è quello che fa); la pausa vera è per riga o per gruppo. La pausa per riproduzione (`pausaPerRiproduzione`) resta e si vede come stato `in attesa del monitor`.
- Persistenza: la riga `manuale` e i parziali non sopravvivono al riavvio dell'app (nessun lavoro nascosto che riparte da solo alla riapertura); i risultati finiti sì, tramite `cache.ts`.
- La barra di stato `.att` riassume: «3 in coda · 1 in pausa · 2 pronti da avviare».

### 3.3 Centro AI e accesso ai servizi AI («passi guidati»)

**Oggi.** `centroAI.ts` ha carte per sottotitoli, traduzione, voce, sfondo, rumore, separazione, con modelli, peso, «Controlla l'AI», «libera lo spazio», ma ogni funzione parte da un posto diverso (Finale → Lingue, Proprietà, tasto destro, menu AI) e gli errori passano da `erroriAI.spiegaErroreAI`.

**Deve.** Un **flusso unico a 4 passi**, uguale per tutte le funzioni, richiamabile da Centro AI, dal tasto destro della clip e dal Finale (stessa finestra, `src/ui/aiPassi.ts` nuovo):
1. **Cosa** (scelta funzione e **a cosa si applica**: clip scelta / tutto il montaggio / un intervallo).
2. **Modello** (scelta del modello con **stato esplicito**: `sul computer ✓ · da scaricare (NNN MB) · in uso · errore l'ultima volta`; motore: **scheda video / processore** con la ragione, da `hardware.ts`; rete: «serve internet solo per scaricare»).
3. **Costi**: *prima* di avviare, in chiaro: download (MB), spazio su disco, tempo stimato (`Stima`/`durataTesto`), se usa scheda o processore, se **blocca** altre cose (corsia pesante). Nessun download parte senza un clic su «Scarica e avvia».
4. **Avvia** → crea la riga in Attività (§3.2) con il suo stato; dall'esito si va dritti a «Guarda il risultato» o «Riprova». Gli errori mostrano la frase italiana di `spiegaErroreAI` **più il pulsante di rimedio** (riprova sul processore, scegli un altro modello, libera spazio, vedi dettagli).
Funzioni coperte: sottotitoli (Whisper/Nemotron), traduzione (NLLB), voce AI, sfondo (BiRefNet/MODNet/SAM 2/SAM 3), rumore (6 forze, DeepFilterNet/Clear), voce e base (Demucs). **Non si aggiungono funzioni AI nuove** in questo giro.
Accettazione: ogni funzione, con modello assente e rete spenta, mostra al passo 2 «da scaricare» e al passo 4 un errore **spiegato**, e nessuna richiesta di rete parte prima del passo 3.

### 3.4 Montaggio (banco: timeline + monitor + contenitore + proprietà)

Ottimizzazione e accesso AI, senza cambiare i comandi.
- **Contenitore**: le azioni manuali del §3.1 in tasto destro e nella sezione Proprietà; indicatore per scheda (`copia leggera ✓/non fatta`, `forma d'onda ✓/non fatta`) senza ridisegnare la griglia (`aggiornaSchede` esiste già, non rifarla).
- **Timeline**: nessun lavoro in `requestAnimationFrame` che dipenda dai picchi; barra piatta se mancano (§3.1). Misurare (baseline da prendere *prima* di cambiare) il tempo di ridisegno con 200 clip e 8 tracce; non peggiorare. Zoom, rotella, 1/2/S/Q/W: **intatti**.
- **Accesso AI**: voci AI nel tasto destro e in menu Montaggio → aprono il flusso del §3.3 già compilato con la clip scelta.
- **Monitor**: la qualità di anteprima segue il proxy *se c'è*; se non c'è legge l'originale. Se un file pesante scatta, il monitor mostra un suggerimento **non bloccante** «Prepara una copia leggera» (pulsante → riga manuale), mai in automatico.
- Effetti: vedi §3.8.

### 3.5 Finale

Pagina `finale.ts` con sezioni `colore, audio, sottotitoli, logo, apertura, lingue, esporta`. **Rifacimento** = riorganizzazione, non nuove funzioni di rendering:
- Struttura: colonna delle sezioni a sinistra (come oggi), a destra **monitor con anteprima del master** (stessa pipeline dell'export); ogni sezione ha un riassunto di una riga («Colore: look Cinema · Audio: −14 LUFS»), e un **pulsante Esporta fisso** (uno solo primario per schermata, regola del design system).
- Sezione **Voce e lingue** → usa il flusso del §3.3 (non un suo pannello).
- Sezione **Esporta**: stima dimensione/tempo prima di partire, avanzamento in Attività (non annullabile a metà solo se il flusso non lo permette: dichiararlo, §3.2), nessun parametro che oggi non esiste.
- Le scelte del Finale restano nel documento come oggi (non in localStorage), per non rompere i progetti.
- Accettazione: l'export di un progetto di prova prima/dopo il rifacimento è **identico bit a bit nei fotogrammi** (hash dei fotogrammi 0, metà, ultimo) e nell'audio (hash del WAV). Solo la UI cambia.

### 3.6 LIVE (F10)

`live.ts`: `getDisplayMedia` + microfono, `MediaRecorder` a pezzi, `nastro` webcam, `Regia` (più finestre, **spenta di partenza**), mixer audio. **Rifacimento = UI e leggibilità**, il motore di registrazione **non si cambia** (era l'oggetto di molte correzioni: PAUSA che chiude un pezzo, fette da 250 ms, grazia 600 ms, taglio al punto premuto).
- Divisione di `live.ts` (1376 righe) in `live/regia.ts` (`Regia`), `live/registratore.ts` (stato/pezzi/cuci), `live/pagina.ts` (DOM) **solo se** la prova `prove-live` resta verde a ogni passo; se rischia di cambiare il comportamento si lascia il file com'è e si rifà solo la parte DOM.
- Pagina: stato di registrazione sempre visibile (tempo, dimensione stimata, vumetri, sorgenti con stato `ok / non concessa / assente`), pulsanti R / Spazio / M / F / C / N / 1-9 / L **invariati**, telecomando invariato.
- A fine registrazione: il file entra nel contenitore **senza controlli né conversioni** (`importaFile(…, {controlla:false})` già così) e **senza proxy né forme d'onda automatici** (§3.1).
- Accettazione: `prove-live` e `prove-liveaudio` verdi senza modificare i loro controlli (se ne cambiano i selettori, vanno aggiornati dal programmatore **e** rivisti da Luna).

### 3.7 Montage (F8) e «Montaggio» automatico

`ui/montage.ts` + `core/montage.ts` (puro) + 28 preset. Pagina in 3 passi numerati («I tuoi file», «Cosa festeggi», «Come lo vuoi»).
- **Nessun lavoro nascosto**: oggi `crea()` legge EXIF, misura qualità e cerca i battiti. Queste analisi **sono richieste dall'utente** premendo *Crea*, quindi restano, ma diventano **righe in Attività** visibili (categoria `analisi`, pausabili `ai-confini`, annullabili) invece di un'attesa senza stato; i risultati si tengono in cache per file (`analisi`, `ritmi` già esistono).
- **Il motore resta puro**: `core/montage.ts` non importa DOM né media; `pianifica` con stesso seme dà stesso risultato (la prova `prove-montage` lo controlla). Nessun cambio di algoritmo senza aggiornare i test di seme.
- **UI**: anteprima nel monitor vero, Rigenera/Importa/Scarta come oggi (non toccare la logica `togliAnteprima`/`doUndo`); più chiaro cosa serve (min. file, durata consigliata), nessun controllo che oggi non fa niente.
- Accesso AI: «Musica consigliata» e altre scelte restano locali (nessuna funzione AI nuova).
- Attenzione CSS ricordata in `CLAUDE.md`: le regole `lato-lungo`, `senza-bin/senza-lato` valgono anche per le pagine nuove se non le escludi (`:not([data-pagina='montage'])`).

### 3.8 Effetti: nuovi e ottimizzati

**Stato.** ~75 blocchi in `blocchi.ts` (rapidi, lunghi, luci, distorsioni, colore, particelle), effetti di clip in `effetti.ts`, transizioni digitali in `render/transizioni.ts`, tutto in un solo shader FX (`FS_FX`, uniform `u_<nome>` da `CAMPI_FX`). Cammo non ha fornito l'elenco dei nuovi: **candidati** (nessuno esiste già, da confermare, D3): *Vignetta*, *Grana pellicola*, *Nitidezza*, *Sfocatura direzionale (movimento)*, *Sfoca zona* (privacy, riquadro/ellisse col mirino), *Split-tone cinema*.
**Regole per ogni effetto, nuovo o esistente:**
1. Un solo punto di verità: l'effetto è nel catalogo, nello shader e nel piano; **monitor ed export** lo disegnano con lo stesso codice (`piano.ts`/`compositore.ts`).
2. Si somma e si fonde con gli altri come gli altri (regola «tutto si somma»); la sfocatura/scia/colori sdoppiati stanno nello stesso giro (altrimenti uno copre l'altro).
3. Anteprima nel contenitore (`provino.ts`/`anteprime.ts`) = il risultato vero, ridotto.
4. Costo: ogni passata aggiunta si misura (§7, banco `test/_bench.mjs` esistente o equivalente): **un blocco in più non deve far scendere sotto i fotogrammi/s di oggi con 1 clip 1080p** su CI senza GPU e sulla scheda dell'utente; dove non regge, l'effetto va in un giro già esistente.
5. Ottimizzazione degli esistenti: prima **misurare** (tempo per fotogramma per effetto, con un solo effetto per volta); si ottimizza solo ciò che è sopra la soglia concordata (D4), senza cambiare l'aspetto (hash del fotogramma uguale entro 1 LSB, altrimenti va dichiarato).
6. Test di regressione: per ogni effetto, **fotogramma di riferimento** (immagine sintetica fissa, tempo fisso) con hash salvato nel repo; monitor e export devono dare lo stesso hash. Va in una prova nuova `test/prove-effetti.mjs` (Chromium, la fa girare Luna).

## 4. Contratti tra motore e UI

I nomi sotto sono la **proposta**; Opus può cambiarli se tiene la forma. Tutto ciò che è nuovo nei dati è opzionale (regola §1.2).

### 4.1 `src/media/attivita.ts` (motore)

```ts
export type StatoAttivita = 'manuale' | 'coda' | 'lavoro' | 'pausa' | 'finita' | 'errore' | 'annullata';
export type Pausa = 'vera' | 'ai-confini' | 'no';          // cosa può fare davvero
export interface Capacita { pausa: Pausa; annulla: true; riprova: boolean }

export interface OpzioniAttivita {                           // quelle di oggi +
  capacita?: Capacita;                                       // default: { pausa:'no', annulla:true, riprova:true }
  alPausa?: () => Promise<void> | void;                      // 'vera': ferma ora (es. pauseSignal.abort())
  alRiprendi?: () => void;                                   // 'vera': riparte dal punto
  checkpoint?: () => Promise<void>;                          // 'ai-confini': il lavoro lo chiama fra un pezzo e l'altro;
}                                                            //   si risolve quando non è in pausa. Chi non lo chiama non è pausabile.

/** nasce `manuale`: non parte finché non si chiama avvia(). Risolve con il risultato, o null se annullata. */
export function proponi<T>(o: OpzioniCoda, fn: (l: Lavoro) => Promise<T>): { riga: Attivita; avvia: () => void; esito: Promise<T | null> };

export function avviaRiga(id: number): void;                 // manuale → coda
export function avviaTutte(filtro?: { categoria?: Categoria; gruppo?: string }): number;   // quante
export function pausaRiga(id: number): 'in-pausa' | 'dopo-il-pezzo' | 'non-pausabile';
export function riprendiRiga(id: number): void;
export function pausaGruppo(g: string): void; export function riprendiGruppo(g: string): void;
export function annullaRiga(id: number): void;               // esiste già come fermaRiga: stesso comportamento + pulizia parziale
export function riprovaRiga(id: number): void;               // errore → coda, rifà solo il non fatto se il lavoro lo sa
export const pausaGlobale: (on: boolean) => void;            // = pausaLavori di oggi, rinominata «Non avviare altro»
```
Invarianti: (a) una riga `pausa` **non occupa** una corsia (se no una pausa blocca tutto), ma conserva il suo stato; (b) `avviaTutte` rispetta `limitiNormali/limitiForti` e la priorità; (c) un lavoro che non chiama `checkpoint` e non dichiara `vera` **non mostra Pausa**; (d) `Riassunto` aggiunge `manuali` e `inPausa` per la barra.

### 4.2 Media: azioni manuali (`src/media/libreria.ts`, `proxy.ts`, `normalizza.ts`)

```ts
export type Preparazione = 'locandina' | 'colore' | 'picchi' | 'proxy' | 'velocita';
export function proponiPreparazione(id: string, cosa: Preparazione): { riga: Attivita; avvia: () => void } | null; // null = già fatta/non serve
export function statoPreparazioni(id: string): Record<Preparazione, 'fatta' | 'non-fatta' | 'in-corso' | 'non-serve' | 'errore'>;
// MediaRT: nuovi campi opzionali (mai salvati nel progetto, solo in memoria) — proxyStato guadagna 'manuale'.
```
`importa()` e `apri()` **non chiamano più** `preparaLavori`, `locandina` (salvo cache), `controllaVelocita`; `risvegliaProxy` si toglie da `app.ts`. Le cache in lettura restano.

### 4.3 AI a passi (`src/ui/aiPassi.ts`, nuovo)

```ts
export interface PianoAI {
  funzione: FunzioneAI['id'];
  dove: { tipo: 'clip'; ids: string[] } | { tipo: 'montaggio' } | { tipo: 'intervallo'; da: number; a: number };
  modello: { repo: string; nome: string; stato: 'sul-computer' | 'da-scaricare' | 'in-uso' | 'errore-ultima-volta'; mb: number };
  motore: { tipo: 'scheda' | 'processore'; motivo: string };
  costi: { scaricoMB: number; discoMB: number; stimaSec: number | null; corsia: 'leggero' | 'pesante'; bloccaAltro: boolean };
}
export function preparaPianoAI(funzione: string, dove: PianoAI['dove']): Promise<PianoAI>;   // NESSUNA rete, NESSUN download
export function avviaPianoAI(p: PianoAI, scaricaOk: boolean): { riga: Attivita; esito: Promise<unknown> };
```
`preparaPianoAI` è **pura rispetto alla rete**: usa solo `diagnosi()`, cache locali, `hardware.ts`. Prova: con `fetch` che lancia, deve ritornare.

### 4.4 Effetti

`BLOCCHI` (catalogo) guadagna solo voci; `CAMPI_FX` solo nomi in coda; `FS_FX` solo uniform nuovi. **Non si cambia l'ordine di `CAMPI_FX`** (gli `fxb` salvati usano i nomi, non gli indici, ma le prove sì: verificare). Vedi regole §3.8.

## 5. Compatibilità progetti (rischio e come si controlla)

| Rischio | Controllo |
|---|---|
| Campo nuovo obbligatorio o rinominato | revisione del diff di `tipi.ts`, `progetto.ts`, `sequenze.ts`: ogni campo nuovo `?:` con comportamento di partenza = oggi |
| Un .dap salvato dalla nuova versione non si apre nella 1.5.7 | prova: salvare con la nuova, aprire con **1.5.7** (build di `main` attuale in una cartella a parte) e viceversa, con un progetto che usa effetti nuovi (nella 1.5.7 un `fxb.id` sconosciuto deve essere **saltato senza errore**: da verificare oggi in `blocchi.ts`/`piano.ts`; se oggi lancia, la nuova versione **non può salvare effetti nuovi senza un fallback** → decisione D6) |
| `proxy/` nei .dap | non si scrivono più automaticamente; si leggono se ci sono; `proxyDelProgetto`/`rimettiProxy` invariati |
| `dpv-proxy`, `dpv-normalizza`, `dpv-live`, `dpv-isp-ordine` in localStorage | leggere i vecchi valori, non cancellarli (§3.1 D2) |
| Il progetto aperto dal **telefono/Android** | in pausa dalla 1.0.7: non è in perimetro, non si rompe niente di proposito |

Corpus minimo per la prova: un `.dpv`, un `.dap` con proxy, un `.daprod`, un progetto con più timeline, sottotitoli, tappe/tracking, blocchi FX e transizioni sovrapposte (i progetti di `test/` ne hanno già).

## 6. Piano di integrazione (chi fa cosa, in che ordine)

**Principio: nessun file toccato da due persone insieme.** Tutto parte da `origin/main` 030172f, un branch e una PR per fase, **niente merge né push su `main` senza conferma di Cammo**; bump di versione e CHANGELOG **una sola volta** nella fase 5.

| Fase | Chi | Branch (da `origin/main`) | Contenuto | File di sua esclusiva proprietà |
|---|---|---|---|---|
| 0 | Sonnet | `docs/update-spec` | questa specifica | `docs/aggiornamento-specifica.md` |
| 1 | **Opus** (motore) | `feat/attivita-manuale` | §4.1, §4.2, §3.1, §3.2 lato motore; i test di motore | `src/media/attivita.ts, proxy.ts, normalizza.ts, libreria.ts, cache.ts`, `src/progetti.ts`, `src/core/*` (tipi opzionali), `src/ui/app.ts` **solo** togliere `risvegliaProxy` (riga 158) |
| 2 | **Opus** | `feat/effetti-nuovi` (in parallelo alla 1: file diversi) | §3.8 | `src/core/blocchi.ts, effetti.ts`, `src/render/*`, `test/prove-effetti.mjs` |
| 3 | **Astra** (UI) | `feat/ui-attivita-ai` (**sopra la fase 1**, rebase dopo il suo merge) | §3.2 UI, §3.3, §4.3, azioni manuali nel contenitore | `src/ui/attivita.ts, centroAI.ts, aiPassi.ts` (nuovo), `src/ui/contenitore.ts, ispettore.ts`, `src/stile/*` per questi |
| 4 | **Astra** | `feat/ui-finale-live-montage` (sopra la 3) | §3.4–§3.7 | `src/ui/finale.ts, live.ts, montage.ts, timeline.ts` (solo i punti indicati), `src/stile/*` |
| 5 | **Sonnet** (integrazione) | `rilascio/<data>` | rebase/merge delle fasi nell'ordine 1→2→3→4, conflitti, `package.json`+`CHANGELOG`+README, `npm run typecheck`/`build`, controllo segreti, PR finale | solo CHANGELOG/versione/README + risoluzione conflitti |
| QA | **Luna/Haiku** | — | §7 a ogni consegna | nessuno |

I conflitti prevedibili: `src/ui/app.ts` (fase 1 toglie una riga, fase 4 può toccare la barra: **la fase 1 deve entrare prima**), `src/stile/*` (Astra tiene un solo foglio per volta), `src/core/tipi.ts` (solo Opus, le fasi UI lo leggono). Ogni consegna lascia nel task Kanban: branch, SHA, file cambiati, `typecheck`+`build` ok, prove eseguite con esito.

## 7. Comandi di test e matrice

Esecuzione dalla cartella del worktree (`npm run build` **prima** delle prove: servono `dist/`). Le prove usano Chromium (WebM/VP9, niente H.264): **le fa Luna/Haiku**, non Sonnet.

```bash
npm run typecheck                 # tutti, a ogni passo
npm run build                     # tutti
node test/prove.mjs               # suite larga (sospetta «Page crashed» nel blocco LIVE dopo ~200 prove in una pagina: NON provato se è memoria; lanciare le chiavi singole se serve)
node test/prove-attivita.mjs      # fase 1, 3
node test/prove-aiuto.mjs         # fase 3 (AI: libreria finta, errori spiegati)
node test/prove-audioai.mjs && node test/prove-audioui.mjs      # fase 3 (rumore/separa)
node test/prove-sottotitoli.mjs   # fase 3
node test/prove-dap.mjs           # fase 1 (compatibilità .dap)  — chiave: dap
node test/prove-rifiniture.mjs    # sempre (un tasto un comando, tasti 1/2)
node test/prove-live.mjs && node test/prove-liveaudio.mjs && node test/prove-banco.mjs   # fase 4 (LIVE, telecomando, barra)
node test/prove-montage.mjs       # fase 4 (seme, anteprima, Rigenera/Scarta)
node test/prove-pannello.mjs && node test/prove-proprieta.mjs && node test/prove-animazioni.mjs  # fase 3-4 (Proprietà, contenitore)
node test/prove-effetti.mjs       # fase 2 (NUOVA, da scrivere: hash di riferimento monitor = export)
node test/foto.mjs                # foto delle pagine in test/.out/: guardate da una persona prima di pubblicare
```
Prove **nuove** da scrivere (le scrive chi programma la fase, le verifica Luna):
- `prove-import-minimo.mjs` (fase 1): importa 20 file finti, mette in timeline, salva/riapre → `attivitaInCorso()`/`attivitaFinite()` vuote, OPFS `proxy-1` vuoto, nessun `inCoda` chiamato.
- `prove-attivita.mjs` (estendere): `proponi/avvia/avviaTutte`, pausa `vera` (proxy) che riparte dallo stesso punto, pausa `ai-confini` che non rifà i pezzi, `no` senza pulsante, annulla che pulisce, riprova.
- `prove-aipassi.mjs` (fase 3): `preparaPianoAI` con `fetch` che lancia; ogni funzione con modello assente → stato «da scaricare», nessuna richiesta di rete prima di «Scarica e avvia»; errore spiegato.
- `prove-compat.mjs` (fase 1/5): apre il corpus del §5 e confronta l'albero del progetto (stesso JSON dopo salva→apri→salva), più la prova incrociata con la build 1.5.7.
- `prove-effetti.mjs` (fase 2): hash monitor = export per effetto; somma di due effetti; nessun cambio di hash degli effetti **esistenti**.

Misure da prendere **prima** di toccare (baseline di prestazioni, oggi mancante): ms/fotogramma 1080p con 0/1/3 blocchi FX; ridisegno timeline con 200 clip; import di 20 file (tempo e numero di righe in Attività). Il banco `test/_bench.mjs` è fuori dalle prove: si riusa, non si dà per scontato che giri.

## 8. Checklist per chi programma

Opus (fasi 1-2):
- [ ] `importa`/`apri`/`risvegliaProxy` non accodano nulla (§3.1); cache in lettura funzionano
- [ ] `proponi/avviaRiga/avviaTutte/pausaRiga/riprendiRiga/annullaRiga/riprovaRiga` con capacità dichiarate (§4.1); pausa `vera` provata sul proxy; `ai-confini` provata con un lavoro finto a pezzi
- [ ] compositore regge `colore` assente; timeline regge picchi assenti
- [ ] campi nuovi opzionali; .dap/.dpv/.daprod aperti avanti e indietro (§5)
- [ ] effetti: catalogo, shader, piano, anteprima; hash monitor = export; baseline di costo
- [ ] `npm run typecheck`, `npm run build`, prove del §7 per la fase, tasti 1/2 invariati
- [ ] nessun segreto, account `cammo22`, branch+PR, nessun merge

Astra (fasi 3-4):
- [ ] riusa i token/componenti del design system; **un solo primario per schermata**; menu dentro lo schermo (`dentroLoSchermo`); Esporta sempre nello schermo da 1024 a 1920 px (la prova lo misura)
- [ ] ogni pulsante fa quello che dice (niente Pausa finta, niente controllo che non agisce)
- [ ] flusso AI a 4 passi uguale da tutte le entrate; nessuna rete prima del passo 3
- [ ] Finale: export bit a bit uguale; LIVE: `prove-live*` invariate; Montage: seme e Rigenera invariati
- [ ] `test/foto.mjs` eseguita e le foto guardate (CI senza GPU rallenta le tessere: `apriGruppi` salta `fxv`)

## 9. Decisioni aperte per Cammo (servono per partire)

- **D1** Numero di versione: 1.5.8 (regola di `CLAUDE.md`) o 1.6.0?
- **D2** Chi oggi ha `dpv-proxy = sempre` o `dpv-normalizza = no` tiene la scelta; chi ha `auto`/niente passa a **manuale**. Va bene? (Alternativa: reset di tutti a manuale.)
- **D3** Elenco dei **nuovi effetti** che vuoi (i 6 candidati del §3.8 sono una proposta mia, non una tua richiesta) e quali sono gli effetti «lenti» da ottimizzare.
- **D4** Soglia di prestazioni (es. «1080p con 3 blocchi ≥ 24 fps sulla tua scheda»).
- **D5** Barra del titolo 40px (design system) contro i 34px di oggi: cambia anche Video?
- **D6** Effetti nuovi nei progetti aperti con la 1.5.7: se oggi un effetto sconosciuto lancia errore, accetti che i progetti con effetti nuovi **non si aprano** nella 1.5.7 (basta aggiornare), o vuoi un fallback?
- **D7** Come deve **apparire** la nuova UI di Finale, LIVE e Montage: la specifica fissa struttura e comportamento, non il disegno. Astra propone, Cammo guarda `test/foto.mjs` prima di pubblicare.
