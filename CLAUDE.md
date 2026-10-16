# DaProd Video — leggi questo per primo

Editor video "vecchio stile, moderno dentro" (ispirato a EDIUS e alle centraline a nastro). Interfaccia web
(TypeScript, niente framework) + app **Tauri 2 / Rust** per Windows, Mac e Android + versione prova su Pages.

- **Si scrive in italiano parlato**: commenti, CHANGELOG, README, messaggi dell'interfaccia. Nomi tecnici in inglese dove serve.
- **Una versione = `version` in `package.json` + voce in `CHANGELOG.md`.** Unita su `main`, la CI (`.github/workflows/app.yml`)
  compila EXE portatile e setup e il DMG e pubblica la release da sola (le prove girano ma non la fermano; **Android è in
  pausa**: il job c'è ma è spento con `if: false`). Il numero sale di 0.0.1 (1.0.9 → 1.1.0). Cammo vuole il push dritto su `main`.
- **Le prove si fanno girare**: `npm run build` e poi `node test/prove.mjs` (Chromium: WebM/VP9, niente H.264).
  `node test/foto.mjs` fa le foto in `test/.out/`: si guardano prima di pubblicare.
- I tasti numerici sono sacri: **1 taglia, 2 elimina** (li ha chiesti Cammo). **S** separa/unisce, **Q/W** tolgono lo scarto,
  la **rotella** va di un fotogramma col suono (Ctrl+rotella = zoom). Tutti i comandi stanno in `src/azioni.ts`.
- **Effetti a tempo e transizioni sono blocchetti sopra le clip**: clip `kind: 'fx'` sulle tracce video, disegnate
  in basso sulla riga, che **non occupano posto** (le regole "niente si copre" di `montaggio.ts` le saltano con
  `solida()`). Catalogo, calcolo per fotogramma e regole per posarli (`postoBlocco`: taglio, inizio, fine) in
  `src/core/blocchi.ts`; un blocco segue la clip su cui sta (`blocchiDi`). Gli effetti valgono per la loro traccia e
  per quelle sotto; le transizioni lavorano sul taglio della loro traccia (una transizione, un taglio). Ogni blocco
  può avere un **suono** (`fxb.suono`/`fxb.audio`, catalogo in `src/core/suoni.ts`, sintesi in `src/media/suoni.ts`)
  che suona nel monitor e nel mixaggio: **di partenza è spento** (`audio: false`), si accende dall'altoparlante;
  tasto destro sull'altoparlante = menu dei suoni, passandoci sopra si sentono (`VoceMenu.sopra`). La vecchia corsia
  `fx` e le `trIn/trOut` delle clip video si migrano all'apertura (`migraBlocchi`). L'audio legato si incrocia da
  solo (`conIncroci` in `src/media/audio.ts`).
- **Tutto si somma e si fonde**: più blocchi FX sullo stesso punto si combinano in `statoEffetti` (luce in "screen",
  zoom che si moltiplicano, distorsioni una dentro l'altra), e gli effetti della clip stanno in `fx.effetti` (una
  lista, non uno solo) e si sommano in `fxEffettivo` (`src/core/effettiClip.ts`; i look sono bit nello shader).
- **Menu e pannello**: i menu stanno sempre dentro lo schermo (`dentroLoSchermo` in `src/ui/dom.ts`, se no finiscono
  sotto la barra di Windows). Un clic su una clip o su un FX manda `dpv:proprieta` e il pannello di destra si apre;
  📌 lo tiene a tutta altezza (è la vista del tasto V, classe `lato-lungo`).
- **Più timeline** (`src/core/sequenze.ts`): quella aperta vive nei campi del progetto (tracce, clip, marcatori,
  attacco/stacco, sottotitoli) così tutto il resto non cambia; le altre aspettano in `p.sequenze`. Schede sopra la
  timeline. I sottotitoli hanno la loro riga **SOTT** fra video e audio (sposta, bordi, unisci, dividi:
  `src/core/sottotitoli.ts`).
- **LIVE** (`src/ui/live.ts`, F10): `getDisplayMedia` + microfono, `MediaRecorder` a pezzi (la PAUSA chiude un pezzo:
  non ci si fida della pausa del browser, alcuni lasciano il buco, né di quello che consegna allo stop: fette da
  250 ms e 600 ms di grazia, poi si taglia al punto premuto), Mediabunny cuce i pezzi in un file solo e l'app lo salva in Video/DaProd Video (`registrazione_percorso` in `lib.rs`; permessi del Mac in `src-tauri/Info.plist`). Nelle prove la sorgente è una tela finta (`impostaSorgenteLive(schermo, mic, webcam)`).
  La **webcam** ha il suo registratore (`nastro`), stesso taglio dello schermo, file suo, e va sulla traccia sopra
  come bolla (`bolla` in `src/core/cornici.ts`); sotto, con lo **stile presentazione**, un colore sfumato (`gen.color2`).
  Tasti R / Spazio / M (segni → marcatori) / F, presi prima di quelli del montaggio solo su LIVE; 3-2-1 (`opz.conto`,
  le prove vecchie lo spengono); telecomando (`telecomando.ts`) = Document PiP nel browser, finestra piccola `setAlwaysOnTop` nell'app
  (permessi in `capabilities/default.json`). Le scelte stanno in localStorage `dpv-live`; le registrazioni vanno
  nella cartella *Registrazioni* e non propongono il formato del progetto.
- **Sposta e ingrandisci sull'immagine** (`src/ui/posiziona.ts`, dentro il monitor): clic sull'immagine sceglie la clip più
  in alto lì sotto (`riquadroClip` fa lo stesso conto del compositore; i titoli si stringono attorno alle lettere),
  trascina = sposta, angoli = grandezza, pallino = gira, aggancio al centro/bordi (Alt = libero). **Movimento**: `c.tfFine`
  = la posizione alla fine, `tfAl(c, lf)` in `src/core/progetto.ts` va da `tf` a `tfFine` con la S; movimenti pronti in
  `src/core/cornici.ts` (`movimentoPronto`). Gli **effetti col centro** (bolla, vortice, caleido, zoom, riflesso:
  `haCentro` in `blocchi.ts`) hanno `fxb.pos`/`fxb.posFine` (frazioni del quadro): il mirino sul monitor, `u_centro` e
  `u_sole` nello shader FX.
- **Transizioni che si sommano**: più blocchi sullo stesso taglio (`transizioniSul`) vanno in catena nel compositore
  (buffer 5 e 6): la prima fa A→B, le "effetto" (`eEffetto` in `piano.ts`: lampo, luce, onda, glitch…) si applicano sopra
  il risultato (vecchia = nuova = risultato), le altre vanno da A al risultato. `Strato.altre`.
- **Suono dentro le clip**: titoli, countdown e colori hanno `c.sfx` (come `fxb.suono/audio/volume`), suonato da
  `suoniFx` (il countdown con `bip` fa un colpo al secondo); in timeline l'altoparlante sulla clip (`altoparlanteClip`).
- **Angoli tondi e ombra** sono campi del Transform (`tf.angoli`, `tf.ombra`): lo shader del livello fa la distanza da
  un rettangolo arrotondato (`u_box`, `u_round`, `u_feather`) e l'ombra è una passata nera più grande prima della clip.
- **Contenitore a esplora risorse** (`src/ui/contenitore.ts`): albero a sinistra (`bin-cat[data-c]`: tutto, video,
  audio, immagini, `dir:<id>`, transizioni/`tr:*`, titoli/`tit:*`, effetti/`fx:*`), cartelle in `p.cartelle` e
  `m.cartella`; l'import va nella cartella aperta e da Video/Musica/Immagini filtra i file. Le anteprime al passaggio
  (`src/render/provino.ts`) usano i fotogrammi veri del cursore e del taglio dopo (canvas `.provino.vero`), fatti col
  montaggio "pulito" (solo riprese e colori: niente titoli, FX, transizioni, sottotitoli, logo); se lì è nero si prende
  il primo fotogramma buono più avanti. Le anteprime ferme delle transizioni si fermano dove si capisce (`anteprimaChiara`),
  quelle dei titoli sono il titolo vero disegnato piccolo. Titoli e
  countdown pronti in `src/core/generatori.ts`; il countdown conta N..1 (`numeroConto`) col bip legato.
- **Dissolvenze con la forma**: `c.curvaIn/curvaOut` (`Curva {k, s}`), `curvaFade`/`fadeAl`/`CURVE` in
  `src/core/progetto.ts`, uguali per volume e trasparenza; in timeline si piega la linea, tasto destro = menu.
- **.dpv e .daprod**: il .dpv è il progetto leggero (JSON, i media restano dove sono); il **.daprod** (`src/pacchetto.ts`)
  è uno zip stored (zip64 oltre i 4 GB) con `progetto.json`, `media/` e LEGGIMI. All'apertura i media si leggono da
  dentro lo zip (`m.dentro {off, len}` → `MediaRT.off/len`, `media_leggi` con l'offset); Rust copia i byte e il CRC
  (`pacchetto_copia`). Doppio clic sul file: `fileAssociations` + `file_di_avvio` / evento `apri-file`.
- **Tappe, stira, tracking (1.1.2)**: il movimento ha partenza (`tf`), arrivo (`tfFine`) e tappe di mezzo (`c.via`, `fxb.via`, t da 0 a 1);
  `tfAl`/`centroBlocco` passano da tutte con una Hermite monotona (`passaPer` in `progetto.ts`: con due tappe è la vecchia S).
  Fermo fra due tappe, trascinare sul monitor ne crea una (`Posiziona.creaTappa`). `Transform.sx` = larghezza stirata (shader:
  `u_size = dw*sx`); 8 maniglie in `posiziona.ts` (`ridimensiona`: il lato opposto resta fermo, Ctrl dal centro, Maiusc stira,
  `✂` ritaglia). **Tracking**: `src/media/traccia.ts` (correlazione normalizzata su 192 punti, ~20 Hz, avanti e indietro) mette
  `c.traccia`; `src/core/traccia.ts` dà `spostaTraccia`: `c.segue`/`fxb.segue` = la clip o il centro segue l'oggetto (tf è lo scarto),
  `c.stabilizza` = la ripresa si tiene ferma. `riquadroClip` e il compositore sommano lo stesso spostamento.
- **Effetti e transizioni nuovi (1.1.2)**: le quantità degli effetti nuovi sono `CAMPI_FX` in `blocchi.ts` (uniform `u_<nome>` in
  `FS_FX`); **sfocatura, scia e colori sdoppiati stanno nello stesso giro** (se no un effetto ne copre un altro: era il bug dei
  "sommati"). `fxb.ripeti` rifà l'inviluppo n volte. Transizioni digitali: `Transition.forza/dir/curva` (`u_forza`, `u_dir` gira
  l'effetto di quarti di giro con `gira()`, `u_curva`); i modelli con un verso sono in `DIREZIONALI` (`transizioni.ts`).
  Titoli: `sotto`, `ingresso/uscita` (in `motoTitolo`), `spaziatura`, `peso`; gli stili a lettere usano `rivela` come avanzamento.
- **LIVE con più finestre (1.1.2)**: `Regia` in `live.ts` disegna la finestra in onda (o due) in una tela di misura fissa con un
  Worker come battito e ne registra `captureStream`; `opz.finestre` (**di partenza spento**: `captureStream` di una tela dipende dalla pagina che disegna, e la registrazione diretta resta la strada provata), tasti N / 1-9 / L.
- **Velocità delle clip (1.1.3)**: `c.speed` (già usata da `srcTimeAt`, `handles`, `splitClip`) ora ha la sua UI: **Alt+E** e il menu
  tasto destro → `src/ui/velocita.ts` (finestra, `impostaVelocita`), `cambiaVelocita` in `src/core/montaggio.ts` (stessa fetta di ripresa:
  cambia `len`; senza ripple si ferma contro la vicina; scala linee elastiche e dissolvenze). `c.nastro` = l'audio cambia anche tono;
  di partenza **si tiene il tono**: `pezziClip` in `src/media/audio.ts` (playback e `mixaggio`) stira con `Stiratore` (WSOLA a flusso,
  `src/media/stira.ts`, pura: si prova da Node). `c.fluido` (0 niente, 1 sfumato, 2 mosso) = movimento fluido nei rallentatori:
  `Compositore.fluido()` prende il fotogramma successivo (`fotogramma(c.id+'~',…)` nel monitor, `Lettori.dopo` nell'export: `render(…, successivo)`)
  e `src/render/fluido.ts` mescola o sposta i due fotogrammi (stima del movimento a blocchi 15×15 su una griglia di ≤240 celle, fatta solo
  quando cambia la coppia; le mip di A e B servono solo lì e poi si rimette LINEAR, se no il fotogramma ridisegnato userebbe mip vecchie).
  Il fotogramma dopo deve essere *proprio* il successivo (dt fra 0,3 e 1,9 fotogrammi), se no non si interpola.
- **Togliere lo sfondo (1.1.4)**: `fx.keyColori` (fino a 3 colori, `coloriChiave`) nello shader (`src/render/compositore.ts`: chiave nel piano YUV, despill, choke, feather, pulizia, `vistaChiave` = maschera/scacchi). **AI**: `c.ritaglio` (`Ritaglio` in `tipi.ts`: modo `soggetto|persona|oggetti`, modello, qualità, punti coi clic), `src/media/ritaglio.ts` (catalogo modelli e coordinamento) + `ritaglio.worker.ts` (transformers.js dalla CDN: pipeline `background-removal` per BEN2/BiRefNet/MODNet, `SamModel`/`Sam2Model` con `input_points` per gli oggetti; elenco di modelli di ripiego) → `src/media/maschere.ts` (maschere R8 per "firma", cache IndexedDB, `potaMaschere`, interpolazione fra due maschere nel compositore) e `src/media/campiona.ts` (`pixelAl`). `src/core/sfondo.ts` = parti pure (campioni, firma, levigatura). UI: `src/ui/sfondo.ts` + `sfondoGruppo` in `ispettore.ts` + tasto SFONDO nel monitor; il contagocce è la modalità `SceltaImmagine` di `posiziona.ts`. **Nelle prove** il segmentatore è finto e la libreria transformers è finta (`context.route`): i modelli veri non sono mai stati provati dal container.
- **Animazioni (1.1.4)**: clip `kind: 'title'` con `gen.anim` (`AnimSpec`, catalogo `ANIMAZIONI` in `src/core/animazioni.ts`, 6 gruppi). Ogni animazione è una **funzione pura del tempo** (`DISEGNA[id]` in `src/render/anim/*.ts`, coordinate virtuali alte 1080, easing alla GSAP, caso con seme) disegnata su Canvas 2D da `disegnaAnimazione` (`src/render/animazioni.ts`), uguale nel monitor e nell'export (`esporta.ts` aspetta i font: `caricaFontAnimazioni` in `src/render/font.ts`, @fontsource). Pannello proprietà: `animatrice` in `ispettore.ts`; libreria nel contenitore (ramo *Animazioni*, `anteprimaAnimazione`); `g:anim:` in `generatori.ts`; un "fondo" va sempre sulla traccia video più in basso. `riquadroClip` le tratta a tutto quadro.
- **DaProdMontage (1.1.4, pagina F8)**: `src/ui/montage.ts` (la pagina: file, stile, scelte; `crea()` legge EXIF, misura qualità/pezzo migliore, cerca i battiti, poi `store.edit` → `costruisciSequenza`) su `src/core/montage.ts` (**puro**: `pianifica` = ordine, `senzaDoppioni` per firma 8×8, `ripartisci` con bisezione per far sommare le durate al tempo chiesto, `inFotogrammi` somma esatta, `sulBattito`, ripetizioni se le foto sono poche; `costruisciSequenza` = una sequenza nuova con sfondo sfumato, foto a scheda o a tutto quadro con `moto` (Ken Burns via `tf/tfFine`), transizioni/effetti come blocchi, sovrapposizioni e titoli come clip `title` con animazioni, musica e audio dei video) e i 28 stili in `src/core/montagePreset.ts` (`PRESET_MONTAGE`). Aiuti: `src/media/exif.ts` (DateTimeOriginal), `qualita.ts` (Laplaciano, luce, firma), `ritmo.ts` (battiti da onset-autocorrelazione). Funziona anche con **sole foto**. Prove: `test/prove-montage.mjs`.
  **Anteprima (1.1.5)**: `crea(seme?)` costruisce la sequenza con `store.edit('DaProdMontage · variante XXXXX', …)` e la mostra nel **monitor vero** (la pagina ha il suo posto in griglia: `monitor` sopra, `.montage` sotto, timeline nascosta); `this.anteprima` ricorda etichetta e seme. **Rigenera** = `togliAnteprima()` (un `doUndo`, solo se in cima all'annulla c'è ancora la *sua* etichetta, se no vuol dire che è stata toccata e si lascia) + nuova `crea()`; **Importa** = azzera `anteprima` e apre il Montaggio; **Scarta** = annulla. Così le timeline non si accumulano e Ctrl+Z funziona (il listener su `doc` rimette i bottoni a "Crea"). **Il caso**: `pianifica` usa `casoSeme(o.seme)` per durate (`variata`), movimenti (`scegliMoto`: mai due uguali di fila, `Voce.forza/verso`), transizioni (una su 4 dalla lista `FANTASIA` del ritmo), sovrapposizioni ed effetti (spostati e a volte saltati), foto lasciate fuori (rumore sul punteggio); stesso seme = stesso montaggio. L'analisi (qualità, battiti) si fa una volta per file (`analisi`, `ritmi`). **Attenzione CSS**: le regole `lato-lungo` e `senza-bin/senza-lato` valgono anche per le pagine nuove se non le escludi (`:not([data-pagina='montage'])`, `:not(.nessuna)` per la specificità (non `[class]`: senza classi non scatta)).
- **Proprietà (1.1.5)**: le sezioni (`Ispettore.gruppo(id, …)` in `src/ui/ispettore.ts`) partono **tutte chiuse** (`aperti` in memoria) e si **riordinano trascinando la maniglia** `⠿` (eventi pointer sul `document`, non HTML5 drag: in Tauri/Windows il drag&drop di sistema lo intercetta). L'ordine sta in localStorage `dpv-isp-ordine` per **tipo di elemento** (`clip:immagine|video|audio|titolo|animazione|generatore`, `blocco:effetto|transizione`); `conOrdine` riordina solo i *posti* delle sezioni (il resto del pannello resta dov'è), le sezioni nuove o nascoste vanno in fondo / restano dove stavano (`salvaOrdineDa`). Le prove che lavorano dentro le sezioni le aprono con `apriGruppi` (`test/aiuti.mjs`). Prove: `test/prove-pannello.mjs`.
- **Pagina iniziale e progetti recenti (1.1.6)**: `src/ui/home.ts` (`Home`, overlay a tutto schermo, evento `dpv:home`, tasto **Progetti** in testata, File → Pagina iniziale). Compare all'avvio **tranne se `navigator.webdriver`** (le prove automatiche partono col banco libero: per vederla nelle prove, `dpv:home`). I recenti stanno in localStorage `dpv-recenti` (`registraRecente` in `src/progetti.ts`, chiamata da `salva` e `apriFile`: nome, percorso, clip, durata, miniatura dal poster); nel browser si tiene anche una copia JSON in IndexedDB (`rec:<chiave>`) per riaprirla senza file.
- **Contenitore, scelta multipla (1.1.6)**: `scelti` + `cliccaCarta` (Ctrl/Maiusc) in `src/ui/contenitore.ts`; il dato del trascinamento è `m:id1|id2|…` (timeline: `mediaDaDato`, posa uno dopo l'altro con un solo `store.edit`). **Aggancio**: `fDrop` in `timeline.ts` (14 px, fine delle clip della traccia preferita, seconda metà di una clip → subito dopo) usato **sia** dal fantasma (`anteprimaDrop`) **sia** da `rilascia`. Classe `.in-timeline` (bordo verde) sulle carte con `usi > 0`.
- **Voce e lingue (1.1.6)**: `src/media/traduci.ts` (`traduciTesti`, NLLB-200 600M in `traduci.worker.ts` da transformers.js/CDN; `LINGUE_TRADUZIONE`; `impostaTraduttore` finto per le prove). `doppia` traduce da sola i testi se `lingua` ≠ `sottotitoliDi(p).lingua` (solo per la voce) e ritorna `posti` (`componiVoceConPosti`); `posaVoce(p, mediaId, dur, silenzia, posti)` fa **una clip per frase** dallo stesso WAV (`srcIn = da`) e mette `Sottotitolo.voce` = id della clip; in timeline un clic sulla riga SOTT sceglie quella clip. Il cinese è in `LINGUE_VOCE`/`LINGUE_PARLATE` (`nemo.ts`, `zh-CN`) ma **non** in `LINGUE_MOTORE` (riconoscimento). Finale: sezione `lingue` = "Voce e lingue" (`paginaLingue`, `traduciSottotitoli`, `pannelloVoce`).
- **File a velocità costante (1.1.6)**: `src/media/normalizza.ts` (`esamina` → `Verdetto`, `converti`) chiamato da `importaFile` prima di `importa`: video VFR (`computeFrameRateMetrics`, max/min > 1,25) → CFR con `Conversion({video:{frameRate}})`; audio-solo MP3/Opus/Vorbis con pacchetti molto variabili → AAC (o Opus) a bitrate costante. Output su disco nell'app (`registrazione_percorso` + `export_*`), in memoria nel browser; l'originale non si tocca. Spento con localStorage `dpv-normalizza = no`.
- **Centro attività (1.2.0, "prima release ufficiale")**: `src/media/attivita.ts` è il registro di tutto il lavoro di fondo (righe `Attivita`, gruppi dello
  stesso tipo in una riga sola, `Lavoro` = la maniglia di chi lavora: `imposta(k, dettaglio)`, `fine`, `errore`, `segnale` per lo stop) e lo scheduler a corsie:
  `inCoda({corsia:'leggero'|'pesante', titolo, categoria, gruppo, priorita}, fn)` (leggero = 2 alla volta, pesante = 1, ferma mentre il montaggio suona via
  `pausaPerRiproduzione`, `pausaLavori` per la pausa dell'utente; priorità = funzione riletta a ogni turno, chi sta in timeline passa avanti con
  `prioritaMedia`/`impostaUsoMedia` di `libreria.ts`). La UI è `src/ui/attivita.ts` (`CentroAttivita`: pezzo `.att` nella barra di stato + pannello `.att-pannello`,
  righe aggiornate al loro posto). Chi lavora: `nuova()` (a mano) o `inCoda()`; `BarraLavoro('titolo', categoria, alAnnulla)` e `avvisoLungo()` si agganciano da soli;
  `Stima`/`durataTesto` stanno in `src/core/stima.ts` (puri). Prove: `test/prove-attivita.mjs`; banchi di misura (non nelle prove) `test/_bench.mjs`.
- **Riapertura veloce (1.2.0)**: `riapriMedia` (progetti.ts) apre 4 file alla volta, prima quelli in timeline, con una sola riga "Riapro i file del progetto" e aggiorna l'interfaccia
  al massimo ogni 600 ms. `src/media/cache.ts` (IndexedDB `dpv-cache`: `picchi` a un byte per valore con radice, `colore`, `poster` JPEG; chiave `chiaveMedia` = percorso|nome|dimensione|data|durata|WxH).
  **La copia leggera (proxy) si fa solo per chi sta in timeline** (`proxyStato = 'attesa'` per gli altri; `risvegliaProxy` da `app.ts` a ogni modifica del documento, `proxyEsistente` apre subito
  quelle già sul disco). Il contenitore, se cambia solo lo stato dei file o le locandine, aggiorna le schede al loro posto (`aggiornaSchede`, mai rifare la griglia: la pagina salterebbe);
  la forma d'onda cresce con `ridisegnaCarta`.
- **Conversione VFR/CBR dietro le quinte (1.2.0)**: `controllaVelocita` in `progetti.ts` (dopo l'import: esame nel gruppo "esame", conversione nella corsia pesante) e `mettiCopia`: la copia
  prende il posto del file con `store.aggiornaMedia(id, campi, spostaSrc)` (cambia progetto **e** cronologia annulla/ripeti, e sposta `srcIn` se l'inizio del file è cambiato), poi `apriMedia` di nuovo.
  `importa(sel, {soloDescrizione:true})` legge com'è fatto un file senza locandina né lavori. Nel browser la copia si tiene in IndexedDB `file` (≤ 300 MB) e si toglie la maniglia.
- **Rifiniture (1.2.1)**: `store.edit` rimette il progetto com'era se la modifica lancia un errore; `store.revisione` sale a ogni
  modifica e `autosalva` scrive solo se è cambiata. `progetto_scrivi` (Rust) scrive `<file>.salvo.tmp` e rinomina. `splitClip` divide anche
  il movimento (`splitMovimento`: tf/tappe/tfFine ripartiti fra i due pezzi). `mixaggio` rende ogni pezzo da 10 s con 1,5 s prima
  (`SCALDA`, poi buttati) così filtri, eco e limitatore non ripartono a ogni cucitura. `dialogo({chiudibile: () => bool})` = si chiude con
  Esc/✕/clic fuori solo quando dice sì (Esporta mentre lavora). Con la pagina iniziale aperta (`html.home-aperta`) i tasti del montaggio
  non passano. Nel browser `potaDeposito` (progetti.ts) tiene in IndexedDB solo i file del montaggio aperto e dei recenti. Copia/incolla
  porta i blocchetti FX della clip (`padreDi`). In `fotogrammi.ts` un flusso buttato a metà play lascia il suo ultimo fotogramma in
  `ponti` finché il nuovo non ne ha uno (niente nero). Prove: `test/prove-rifiniture.mjs`; nessun tasto deve stare su due comandi (lo controlla la prova).
- **Trovare e capire (1.3.0)**: **Ctrl+K** = `src/ui/cerca.ts` (`apriCerca`, `risultati`/`punteggio` con sinonimi, recenti in localStorage
  `dpv-cerca-recenti`): dentro ci sono **tutti i comandi registrati** in `azioni.ts` più le fonti iscritte con `fonteCerca` (`src/ui/fontiCerca.ts`:
  pagine, sezioni del Finale, guide, transizioni, effetti, titoli, animazioni, countdown; `manca()` = perché adesso non si può). Il fuoco va
  all'input **subito** (se no le lettere finiscono al banco come tasti). **F1** = `src/ui/guida.ts` (`ARGOMENTI`, `finestraGuida(id)`, "Fallo adesso"
  con `vaiPagina/vaiFinale/vaiSezione` + `evidenzia` di `dom.ts`). **Centro AI** = `src/ui/centroAI.ts` (`FUNZIONI_AI`, carte `.ai-carta[data-ai]`,
  "Controlla l'AI" = `diagnosi()` di `src/media/diagnosiAI.ts`, impostazioni: scheda video sì/no, libera lo spazio, togli il motore). I comandi di
  `app.ts` (file, pagine, vista, aiuto) ora passano da `registra` (= `reg` di `azioni.ts`): **un tasto, un comando** (lo controlla la prova); con la
  pagina iniziale aperta passano solo `SOPRA_HOME` in `tastiera.ts`. Eventi: `dpv:cerca`, `dpv:guida`, `dpv:tasti`, `dpv:centro-ai`, `dpv:finale`,
  `dpv:sezione` (→ `Ispettore.apriSezione`), `dpv:home-nascondi`. Testata: `.testata > *` non si stringe, le scritte spariscono a scalini
  (1840/1720/1620/1520/1420/1250 px) così **Esporta resta sempre nello schermo** (la prova la misura da 1024 a 1920).
- **L'AI che non si ferma (1.3.0)**: `src/media/libreriaAI.ts` è la base di tutti i worker AI (voce, traduci, ritaglio, provaAI): la libreria
  **viaggia dentro l'app** in `public/ai/` (→ `dist/ai/`, la scrive `scripts/ai-locale.mjs` in `prebuild` da registry.npmjs.org col controllo
  sha512, è in `.gitignore`; se manca si va sulla CDN; **su Pages no**: `pages.yml` toglie `dist/ai` perché la protezione dei segreti di GitHub
  scambia `Mistral3ForConditionalGeneration` per una chiave e blocca il push), `wasmPaths` puntano lì (asyncify). `caricaConRipieghi` prova **WebGPU poi WASM** e per
  ognuno **più pesi** (q8/fp16/fp32: a MODNet e BiRefNet manca q8); se la scheda si rompe a metà lavoro si ricarica su WASM e si rifà. Scheda video
  spegnibile (`dpv-ai-scheda`). Un worker morto si butta (`onerror` → `null`). **Errori**: `src/media/erroriAI.ts` (`spiegaErroreAI`: regole
  regex → frase italiana con cosa fare; le frasi già italiane passano). Nemotron che sbaglia → Whisper da solo (`ripiego` in `sottotitoliAI`), e
  NeMo riprova con `--device cpu` (`eseguiConRipiego`). Nelle prove la libreria finta si serve anche su `**/ai/transformers.min.js`.
  Prove: `test/prove-aiuto.mjs`.
- **Barra del titolo e telecomando (1.3.2)**: `src/ui/barraTitolo.ts` = barra **sempre bianca** sopra `#app` (body è una colonna flex;
  `--bt-alto` = 34px, `.home/.velo/.cerca-velo` partono da lì) con marchio, Progetti, Salva, Importa, `.bt-annulla/.bt-ripeti`, nome
  progetto, Cerca, aggiornamenti; `data-tauri-drag-region="deep"`. `html[data-finestra]` = `win` (Windows/Linux: `decorations:false` in
  `tauri.windows.conf.json`/`tauri.linux.conf.json` — **copie intere della finestra**, il merge sostituisce l'array — e i tasti — □ ✕
  `.bt-finestra`), `mac` (`titleBarStyle: Overlay`, 80px a sinistra per i semafori), `web`. La testata ha solo menu (`barraMenu.ts` +
  voci in `menuBanco.ts`), AI, pagine, Esporta. Bordi/pannelli: `disposizione.ts` (`disp.alterna(classe)`). **Telecomando**:
  `src/ui/telecomando.ts` (`Telecomando`: 360×420, anteprima = gli stessi `MediaStream` di `video`/`cam`, spegnibile con
  `dpv-tele-anteprima`; PiP nel browser, finestra piccola `setAlwaysOnTop` nell'app; `modoPiccolo` = `html.mini-live`, usato anche dalle
  prove con `live.telecomandoNellaPagina(true)`). Prove: `test/prove-banco.mjs`.
- **Taglio, volume, rotella (1.3.3)**: il tasto 1 taglia (`bersagliDelTaglio` in `azioni.ts`) **le tracce accese, se no le clip scelte sotto il cursore, se no
  la clip più in alto sotto il cursore** (+ legate): mai "tutto" da solo (Maiusc+C = `tagliaTutto`). Un clic sulla linea del volume mette un punto e lo si
  trascina (`presaVolume` → `presaElastico`); Maiusc+trascina = il tratto intero. `src/ui/rotella.ts` (`attivaRotella`, in app.ts): sul cursore/numero/tendina
  la rotella cambia il valore (`data-senza-rotella` sull'antenato lo esclude). Doppio clic su una clip non-media (timeline) = scelta + pannello aperto
  (`dpv:ispettore` riapre `senza-lato`) + cursore dentro + monitor sul programma. **Flusso ottico** (`src/render/fluido.ts`): piramide di 5 scale, ±2 celle per
  scala, finestra 5×5, mezzo pixel, passata di livellamento, due direzioni (A→B, B→A) e ripiego sullo sfumato; texture RGBA16F (`capace`). **Animazioni
  dinamiche**: `conAdatta(fn)` in `anim/base.ts` disegna a vuoto (`muto`) per misurare la scheda (`ancora`/`q.misura`) e la rifà più piccola se non sta;
  `disegnaAnimazione` sotto 1500 di larghezza virtuale scala tutto (verticale/quadrato). Aggiornamenti Windows: il setup parte con `/UPDATE /P /R`.
- **Proprietà rifatte (1.4.0)**: `Ispettore.gruppo(id, titolo, righe, principale)` — la sezione **principale** per quel tipo (posizione per i video, "Animazione"/"Titolatrice"/"Generatore" in cima per animazioni/titoli/generatori, "Volume" per l'audio, durata+effetto/transizione per i blocchi) parte aperta
  (`chiusi` ricorda chi l'ha chiusa apposta; `aperti` chi l'ha aperta). Il tasto fx di una clip manda `dpv:sezione` `fxv`/`fxa`. **Quadro in miniatura** `src/ui/miniQuadro.ts` (`riquadroClip` di `posiziona.ts` + `leggiPiccolo` del compositore; sposta/scala/gira/rotella/doppio clic; `posizioniPronte`), **tessere con anteprima**
  `src/ui/tessere.ts` (`fotoScena(scenaRitocco(...))`, una alla volta e solo se visibili: **su CI senza GPU rallentano la pagina, `apriGruppi` delle prove salta `fxv`**). Sezioni: Posizione e grandezza (`immagine`), Effetti e look (`fxv`), Togli lo sfondo (+ "cosa metto dietro" = `mettiDietro`, vista via `dpv:vista-sfondo`), Segui, Colore (`colore`, con `bilanciaBianco`), Durata e velocità (`durata`),
  Entrata e uscita (`trclip`), Ritaglio (`ritaglio`). **Segnalini** = animazioni gruppo `segui` (`render/anim/segnalini.ts`, disegnate al centro del quadro) messe con `aggiungiSegnalino` (clip `title` con `gen.anim` + `segue` = la ripresa tracciata). **Formati**: `RISOLUZIONI`/`CADENZE`/`OBIETTIVI`/`formatoDa` in `core/tipi.ts`
  (home, impostazioni progetto, File → Nuovo). Comando `duplica` (Ctrl+D). Prove: `test/prove-proprieta.mjs`.
- **LIVE, mixer audio (1.4.1)**: `src/core/liveAudio.ts` (puro: dB↔guadagno, preset voce/bilanciamento, `AudioLive` normalizzato) → `src/media/liveAudio.ts` (grafo Web Audio per computer e voce: guadagno, mute, filtri, `AudioWorklet` `dpv-dinamica` per gate/compressore/ducking, limitatore, analizzatori per i LED; i registratori `nastro` prendono l'**uscita lavorata**, anche in `separato`) → `src/ui/liveAudio.ts` (vumetri `.live-regia`, pannello Audio, telecomando). Le scelte stanno in `dpv-live.audio`; di partenza trasparenti. "Toglie i disturbi" = `noiseSuppression/echoCancellation/autoGainControl` del browser, non un modello nostro. Prove: `test/prove-liveaudio.mjs` (sorgenti finte).
- **Segui, rotella, sfondo (1.4.2)**: `src/ui/seguiMenu.ts` = tutto quello che si mette sull'oggetto tracciato (testo, nome/etichetta, mirino…, immagine, emoji, effetti col centro): ogni cosa è una clip (`c.segue`) o un blocco FX (`fxb.segue`, `pos` [0,5; 0,5]); `posiziona.ts` a tracking finito manda `dpv:sezione` `segui`, la sezione è *principale* se la clip ha `traccia`. **I segnalini `sg-*` non sono nella libreria** (`GRUPPI_LIBRERIA`/`ANIM_LIBRERIA`). **Rotella** (`rotella.ts`): un campo risponde solo dopo `ATTESA_MS` (1 s) col puntatore fermo (`Pallino`, anello che si carica; `dpv-rotella-attesa` in ms, 0 nelle prove: serve un `pointermove` sul campo prima della `wheel`); se non è pronto la rotella scorre la pagina e a fine scorrimento si ricomincia dal campo sotto il puntatore. **Sfondo AI**: dopo l'ultimo clic di "Clicca tu" parte da solo `elaboraClip` (`elaboraDopoClic` in `ui/sfondo.ts`, 1,8 s; un clic nuovo ferma e rifà); `SPIEGA_MODO` dice la differenza fra Automatico / Persone / Clicca tu. **Taglio**: dopo `tagliaOra` e `separa` la selezione è vuota; `scartoDelTaglio` fa funzionare il "2" subito dopo. **Centro attività**: il battito di 1 s (`armaBattito`) gira solo se c'è lavoro in corso; `Attivita.durata/esito/finitaAlle` sono fissi a lavoro finito. `tessere(voci, {gruppi})` = griglia quadrata con filtri.
- **Audio AI nel montaggio (1.5.0)**: `src/media/audioAI.ts` (`togliRumore`, `separaVoceBase`, `possibilita`, `haOriginale/tornaOriginale`, `statoAudioAI`) lavora la **parte usata** della clip (+1 s per lato) in un Worker (`audioAI.worker.ts`), corsia pesante del Centro attività, e ne fa un **MediaItem WAV nuovo** (cartella "Audio lavorato"): `afx.pulito {media, srcIn, forza, da}` ricorda l'originale; `afx.separata {ruolo, con, gain}` per le tracce "Voce · …"/"Base · …" (l'originale va a −60 dB). Rumore = **DeepFilterNet3** (`core/rumore.ts`, 48 kHz, ritardo 1440 campioni scartati, stereo centro+lati, forza = mescola 0,6/0,85/1); separazione = **Demucs htdemucs** (`core/separa.ts`, STFT in JS, segmenti da 343980 campioni a 44,1 kHz con cucitura; modello da HF scaricato a pezzi con ripresa in `modelliAudio.ts`, cache `transformers-cache`) con ripiego **rapido senza AI** (centro dello stereo). La libreria arriva da `scripts/ai-locale.mjs` in `public/ai/` (`deepfilternet/`, `ort.webgpu.min.mjs`). UI: `src/ui/audioAI.ts` (`righeAudioAI` = sezione `audioai` delle Proprietà, aperta per l'audio; comandi `audioTogliRumore`/`audioSeparaVoce`; `vociMenuAudioAI` nel tasto destro; menu Montaggio/AI; Centro AI). Prove: `test/prove-audioai.mjs` (motori e giro sul progetto, modello Demucs finto) e `test/prove-audioui.mjs` (la parte che si vede, con DeepFilterNet vero). **Sfondo AI**: una sola scelta "AI · automatico" (`avviaAI`), `cliccaCosaTenere`, il resto in "Avanzate"; ogni fotogramma dopo il primo riceve riquadro **e** punti nel cuore della maschera (`puntiNucleo`), poi `pulisciMaschera` (buchi, isole) e `votoTemporale` (riempie i buchi di un fotogramma solo). **Incolla** va nella traccia accesa (`tracceAttive()`), `incollaSenzaTracce` per Duplica.
- **Hardware e Sovraccarica (1.5.1)**: `src/media/hardware.ts` (`rilevaHardware`: tutte le schede WebGPU, un conto vero per ognuna, scelta, `dpv-hardware`; `messaggioScheda()` va ai worker come `hw`, che lo leggono con `usaImpostazioneScheda` in `libreriaAI.ts`; `schedaGuasta()` quando un worker manda `scheda-guasta`; `erroreDellaScheda` è una regex larga). Scheduler (`media/attivita.ts`): `limitiNormali/limitiForti`, `sovraccarica(on)` (pulsante ⚡ nel Centro attività, si spegne da solo), `impostaLimiti` per le prove. Le copie leggere partono all'import; `proxy.ts`/`normalizza.ts` provano `prefer-hardware` e poi `no-preference`. **LIVE senza filtri audio** (`PannelloAudio.el` non è più nella pagina, le opzioni audio vecchie si ignorano; restano le barre `compatto`); webcam accendibile in registrazione: `segCam` = un segmento (file suo, `da` secondi) per ogni accensione, `commutaCam` / tasto C. Ctrl +/− e Ctrl+rotella sulla timeline zoomano la timeline (`app.ts`, handler su `window`). Skill del progetto in `.claude/skills/` (prove, rilascio, hardware-ai). Prove: `test/prove-live.mjs`.
- **Tracce fisse, LIVE e Finale (1.5.2)**: `kV()` in `timeline.ts` è solo `zoomV` (le tracce non crescono più con lo spazio libero: lo spessore di base è quello deciso nelle prime versioni). La pagina LIVE senza `.stretto` usa `display: contents` su `.live`/`.live-dentro` per mettere `.live-comandi` a tutta altezza (grid-area `comandi`, colonna `--livecol`); la timeline del Finale ha la sua variabile `--tlpag` (il divisore trascina `--tlpag` nel Finale, `--tlfin` in LIVE). **Worker AI dopo un errore della scheda video** (`ritaglio.worker.ts`, `voce.worker.ts`): la libreria resta avvelenata (la catena di promesse delle inferenze rifiuta tutto con lo stesso errore), quindi il worker manda `scheda-guasta` e l'errore `schedaGuasta`, e la **pagina** lo butta e ne fa uno nuovo sul processore (`conIlWorker`, `whisper` in `ritaglio.ts`/`voce.ts`); la prova (`prove-aiuto`) ha una libreria finta con la stessa catena. Punti dell'oggetto: `SceltaImmagine.destro` + `puntoVicino` (sinistro aggiunge, destro toglie). Webcam: `apriWebcamVera` (tre richieste, dal più preciso al più semplice), `frasiWebcam`; `additionalBrowserArgs` in `tauri.windows.conf.json` toglie `MediaFoundationD3D11VideoCapture`.
- **Versione quasi finale (1.5.3)**: **Salva = file `.dap`** (`salva` in `progetti.ts`, `pianoDap`/`scriviDapApp`/`costruisciDap`/`scriviDapBrowser` in fondo a
  `src/pacchetto.ts`): lo stesso zip stored del `.daprod` con `progetto.json` (scritto per ULTIMO), `media/<id>-<nome>` (tutti i media del contenitore,
  anche registrazioni e audio lavorato) e `proxy/<nomeProxy>` (le copie leggere dell'OPFS, `proxyDelProgetto`/`rimettiProxy` in `proxy.ts`). La prima
  volta si scrive tutto (`export_apri`); dopo, sullo stesso file, si **aggiunge in fondo** (`pacchetto_riapri` + `pacchetto_lunghezza` in `lib.rs`, niente
  troncamento): i byte dei media già dentro non si spostano (chi legge con `m.dentro` continua a leggere), si scrivono solo i file nuovi, il progetto e un
  indice nuovo; se si ferma a metà si rimette l'indice di prima. `dentroDap` (= `ricordaDap`) ricorda cosa c'è dentro; `indicePacchetto` ritrova la
  fine buona anche con byte in più in fondo (`trovaFine`). `dpv-percorso` in localStorage = il .dap per `riprendi`. Il `.dpv` e il `.daprod` si aprono
  ancora. **Conversioni solo se servono** (`esamina` in `normalizza.ts`):
  video solo se `underlyingFrameRate` è null (`vfrVero`), audio solo MP3 a bitrate variabile (`mp3Variabile`), l'audio dei video si copia; le registrazioni
  del LIVE non si controllano (`importaFile(…, {controlla: false})`). Centro attività: `chiudi()` svuota anche `listaVive` (prima le righe restavano
  ferme). Timeline: il contorno delle clip scelte si disegna dopo tutte le clip (`contorniScelte`). Prove: `test/prove-dap.mjs` (chiave `dap`);
  banco d'ascolto con voce vera `test/_banco-voce.mjs`. `vite.config.ts` usa `fileURLToPath` (percorsi con spazi).
- **1.5.4**: **Togli i rumori** = 6 forze (`ForzaRumore`, `MESCOLA`/`PODCAST`/`NOMI_FORZA` in `core/rumore.ts`): leggera/media/forte = DeepFilterNet
  mescolato 0,6/0,85/1 (come la 1.5.2: la catena voce della 1.5.3 è stata tolta perché suonava peggio), `isolata` = Demucs voce → DFN (worker
  `avviaRumore` con `isola`), `podcast`/`naturale` = **Clear** di Desert Ant Labs (`src/media/clear.ts`, npm `@desert-ant-labs/clear` 3.6.0, LiteRT.js in
  `public/ai/litert/` da `scripts/ai-locale.mjs`; **solo sul processore** `accelerator: 'wasm'`: su WebGPU LiteRT non sa fare alcune operazioni e fallisce;
  `strength` 1/0,8, −19 LUFS; licenza source-available con "Powered by Desert Ant Labs" in `finestraInfo`; l'SDK manda un conteggio d'uso anonimo).
  `impostaClearFinto` per le prove. **Sfondo AI "scegli tu"**: `punti[].g` = oggetto (`gruppiDi`, maschere unite con `unisci`), `ritaglio.oggetto` =
  dove vanno i clic nuovi (`altroOggetto`); i clic fanno solo la prova su un fotogramma; `elaboraClip(id, true)` = anteprima di `SECONDI_ANTEPRIMA` s con
  firma `…|anteprima` (`FIRMA_ANTEPRIMA`), poi "Genera tutta la clip"; `riprovaOggetti`, `togliSfondoAI` (e `impostaModo('nessuno')` rimette la vista del
  monitor a 0). **SAM 3** = `onnx-community/sam3-tracker-ONNX` (`Sam3TrackerModel`, pesi q4f16/q4 sulla scheda, q8 sul processore: `tipi(d, repo)`;
  `caricaConRipieghi` passa il repo ai tipi), modello di partenza per gli oggetti, ripiego SAM 2.1; banco `test/_banco-sam3.mjs` (RTX 4060: ~1,4 s a
  fotogramma). **Scarto del taglio** in vista: `scartoInVista()` in `azioni.ts`, disegnato come una scelta. **Rendi clip unica** (`src/ui/clipUnica.ts`,
  comando `clipUnica`, Ctrl+Alt+U): `progettoDelPezzo` → `esporta(…, { interna })` (Opzioni.interna: file senza dialogo, `destinazioneInterna`) → una
  clip video + audio legate, cartella "Clip uniche". **Sottotitoli dal montaggio** (`src/ui/sottotitoliRapidi.ts`): `generaSottotitoli(clip?)`,
  `faiParlareSottotitoli`, `nuovaRigaQui`, `stileSottotitoli`; tasto destro su clip e riga SOTT, Titoli → `tit:sott`.
- **Cursore che si aggancia** (`agganciaCursore` in `src/ui/timeline.ts`): sul righello si aggancia sempre (calamita `N`), Alt lo lascia libero.
- **Motore NVIDIA** (`src-tauri/src/motori.rs` + `src/media/nemo.ts`): NeMo-Speech.cpp **0.2.0** (Apache-2.0; la 0.1.0 non aveva gli archivi), programma a parte che l'app
  scarica dalla release di NVIDIA (`nemo-speech-<versione>-{windows,macos,linux}-{x86_64,aarch64}-{cpu,cuda,vulkan,metal}`, `.sha256` a fianco) in
  `app_local_data_dir/motori/`: **CUDA se `nvidia-smi` risponde, Metal su Apple Silicon, se no CPU**. Il lato Rust fa solo I/O a polling (come
  `aggiorna.rs`): `motore_stato/installa/scarico/lancia/lavoro/ferma/elenca/peso_modelli`; i modelli li scarica lui (`pull`, cartella
  `NEMO_SPEECH_MODEL_DIR` nostra). Il JS (`MotoreNemo`) scrive i WAV a 16 kHz (`wav.ts`), lancia `transcribe <cartella> --format srt
  --output-dir …` (carica il modello una volta sola) e legge i `.srt` (`pezziDaSrt`); per la voce lancia `synthesize -i testo -o wav --language
  it-IT --speaker N` una frase per volta. Nel browser non c'è (`motoreNemo()` = null): restano Whisper e il resto. **Nelle prove il motore è
  finto** (`impostaMotoreNemo`): dal container non si raggiungono né i modelli né Hugging Face, quindi il vero `nemo-speech` non è mai stato
  provato con un modello; i comandi sono presi da `nemo-speech help` e dalla documentazione del pacchetto.
- **Sottotitoli con Nemotron** (`sottotitoliAI` in `src/media/voce.ts`, `o.motore = 'nemotron' | 'whisper'`) e **voce AI** (`src/media/doppiaggio.ts`:
  `enunciatiDaRighe` unisce le righe attaccate, `componiVoce` mette ogni frase al suo posto accelerandola fino a ×1,6 se non ci sta,
  `posaVoce` fa la traccia "Voce AI" e silenzia le voci originali). Il pulsante è nel Finale → Lingue e AI (`pannelloVoce`).
- **La barra col tempo** (`src/ui/lavoro.ts`: `Stima` dalla velocità degli ultimi 25 s, `BarraLavoro`): la usano sottotitoli AI, voce AI e installazione.
- **LIVE, voce e computer separati** (`opz.separato`, di partenza acceso): il video registra lo schermo con l'audio del computer, il microfono
  ha un suo registratore audio (`nastro` su `micSep`), cucito con `cuci` (ora anche solo audio) e messo su un'altra traccia audio, legato.
- **Zoom verticale della timeline**: `kV()` in `src/ui/timeline.ts` (solo `zoomV`, Ctrl+Shift+rotella; dalla 1.5.2 non cresce più da sola); nell'app
  Ctrl +/− fa `setZoom` della webview (nel browser lo zoom resta quello del browser: lo zoom CSS rompe i clic).
- TRASPARENZA (tasto B, era ELASTICO) = la linea gialla dell'opacità sui video; IN/OUT si vedono solo se ci sono (Alt+X o ✕).
- Si parte con **2 tracce video e 2 audio**. **Alt+Shift+trascina** = la clip e tutto quello dopo, su tutte le tracce.
  **V** = timeline stretta (la colonna di destra scende fino in fondo).
- **Sottotitoli AI**: Whisper via transformers.js in `src/media/voce.worker.ts` (libreria dentro l'app, CDN di ripiego; modello da
  Hugging Face, entrambi al primo uso); `src/media/voce.ts` prende l'audio a 16 kHz e fa le righe. Nelle prove si usa
  un trascrittore finto (`impostaTrascrittore`): dal container non si raggiungono né la CDN né Hugging Face.
- **Aggiornamenti**: `src/ui/aggiornamenti.ts` (API delle release di GitHub, novità dal CHANGELOG che viaggia
  dentro l'app) e `src-tauri/src/aggiorna.rs` (scarica col `curl` di sistema e apre setup/portatile/DMG).
- **La riproduzione non deve mai bloccarsi**: `src/media/fotogrammi.ts` non butta un flusso che non ha ancora il primo
  fotogramma, e i proxy (`src/media/proxy.ts`) si fanno da soli per le riprese pesanti. L'export legge gli originali.
  **`pulisci()` conta dall'ultima richiesta di un fotogramma (`ultimaRichiesta`), non dall'orologio** (1.3.1): un disegno lento non deve
  far buttare il flusso che si guarda (col GOP lungo il nuovo ripartirebbe dal fotogramma chiave: immagine ferma, poi nera). Chi presta
  il fotogramma di ripiego (ricerca, altra qualità) si tiene vivo. Nelle prove `__dpvTest.FT` = il modulo dei fotogrammi.
- **Il montaggio non copre mai niente** da solo: spostare, lasciare, incollare e i generatori usano il modo `libero`
  (`src/core/montaggio.ts`: si fermano contro le vicine o vanno su una traccia libera). Copre solo SOVR dal monitor.
  Le transizioni non cambiano la durata delle clip. Il taglio tocca solo le tracce accese (se ce ne sono).
- Una cosa sola, uguale ovunque: il piano del fotogramma (`src/render/piano.ts`) e il compositore (con il colore finale
  della pagina Finale, `src/render/colore.ts`) servono sia il monitor sia l'export; il grafo audio (`src/media/audio.ts`,
  con filtri e limitatore) sia la riproduzione sia il mixaggio.
- Il lato Rust (`src-tauri/src/lib.rs`) fa solo I/O: media a pezzi, export in streaming, progetti, autosalvataggio.
  Su Android i percorsi sono `content://` e passano da `tauri-plugin-fs`.
