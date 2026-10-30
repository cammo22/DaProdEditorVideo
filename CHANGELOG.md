# Changelog DaProd Video 🎬

Tutte le versioni notevoli del banco di montaggio. Le date sono in formato AAAA-MM-GG.
Ogni versione pubblicata ha la sua [release GitHub](https://github.com/cammo22/DaProdVideo/releases) con le app
per Windows (portatile e installabile), Mac e Android, e va online su [GitHub Pages](https://cammo22.github.io/DaProdVideo/) come versione prova.

## [Non rilasciato] · Funzioni AI facili nel motore locale

- **Registro di tutte le funzioni AI** (`src/core/funzioniAI.ts`) con stato onesto PRONTA / OPZIONALE / SPERIMENTALE, peso e VRAM; si vede nel Centro AI.
- **Traduzione con Hy-MT2 1.8B** (Apache-2.0) nel motore AI locale, al posto di NLLB-200 (CC-BY-NC, non commerciale). Senza il motore la traduzione dice cosa installare.
- Nel motore locale, opzionali e scaricati solo su richiesta: voce pulita (DeepFilterNet3), voce e musica (Kim Vocal 2), tagli automatici (TransNetV2, marcatori «Scena N»), sottotitoli con parole e tempi (Qwen3-ASR + ForcedAligner), rallentatore fluido (RIFE 4.25, SPERIMENTALE). Ogni risultato è materiale modificabile, l'originale resta, Ctrl+Z annulla; passano dal Centro attività con avanzamento, Ferma e Riprova.
- **Clear** (licenza source-available, non permissiva) si può spegnere dal Centro AI.
- **Nota onesta**: i modelli veri non sono stati scaricati né eseguiti; prove con motori finti (`test/unit/funzioni-ai.test.mjs`, `test/unit/motore_ai_server*.py`).

## [1.7.1] — 2026-10-29 · Motore AI locale facoltativo, voce realistica e ritaglio con SAM 2.1

- **Motore AI locale — Opzionale** nel Centro AI: Python privato con uv, ambiente separato, torch CUDA installato solo su richiesta, accensione, spegnimento, rimozione e download separato dei pesi. Attività mostra avanzamento, annullamento e Riprova.
- **Voce realistica** nel Finale: Qwen3-TTS 0.6B Base (Apache-2.0), campione WAV da 3 a 30 secondi, italiano e altre cinque lingue, testo libero o sottotitoli, GPU NVIDIA o processore. Magpie resta disponibile. Server locale autenticato, un lavoro alla volta, pesi verificati e inferenza offline.
- Prove del client e delle transizioni; script manuale `scripts/prova-qwen3tts.py` per tempo e VRAM. Installazione completa, qualità della voce e prestazioni sulla RTX 4060 restano da provare: in questo giro nessun torch o peso scaricato e nessun uso della GPU.
- **Togli lo sfondo**: SAM 2.1 Tiny sostituisce SAM 3; i progetti vecchi passano al nuovo modello e rifanno le maschere.

## [1.7.0] — 2026-10-29 · Si chiama DaProd Editor Video: banco nuovo, colore da professionisti, keyframe, maschere, titoli animati, montaggio dal testo

- **Nome nuovo**: DaProd Editor Video. Progetti, cartelle e aggiornamenti restano gli stessi di prima.
- **Barra in stile DaProd**: logo che gira, tasto ✦ per le novità, la scheda video e il processore sempre in vista. **Una finestra sola**: se apri un progetto col programma già aperto, torna davanti quella.
- **Pagina iniziale nuova**: da dove comincio, gli ultimi progetti, come sta il PC e **Aggiusta tutto** (apertura dei file .dap/.daprod/.dpv, cartelle di lavoro, modelli AI, aggiornamenti) con l'esito di ogni passo.
- **Finale**: preset pronti (YouTube 1080p e 4K, Reel/TikTok/Shorts, Instagram quadrato, master, WhatsApp, solo audio), codec mostrati solo se il computer li sa fare, peso stimato e **coda di esportazione**.
- **Colore da professionisti**: LUT .cube (cinque nostre più le tue) con intensità, ruote lift/gamma/gain e curve RGB e luce, dalla pagina Finale o da «Colore avanzato…» nelle Proprietà.
- **La musica si abbassa sotto la voce**: segni la voce, e la musica scende e risale da sola, nel monitor e nell'esportazione.
- **Keyframe ◆** su posizione, zoom, opacità, colore, volume ed effetti, con ◀ ▶ per saltare da uno all'altro. **Maschere** a rettangolo, ellisse e Bézier, sfumate, invertite, animabili.
- **24 titoli animati** in categorie: neon, sette segmenti, terzo inferiore, notizie, ticker, karaoke, macchina da scrivere, titoli di coda, intervista, schermo finale e altri. Monitor ed esportazione identici.
- **Montaggio dal testo**: il parlato diventa testo, selezioni le parole e premi Canc; «togli i silenzi» e «togli gli ehm» con l'anteprima del tempo risparmiato.
- **LIVE**: zoom che segue il cursore e clic animati (si accendono in Altre opzioni), pannello più compatto con i misuratori sempre in vista.
- **Copie leggere automatiche** per i video pesanti (4K, HEVC, 10 bit): il monitor va liscio, l'esportazione usa l'originale. Si spengono dalle impostazioni.
- **Centro AI**: ogni modello dice che è opzionale, quanto pesa, dove gira e se va bene sul tuo computer. Niente si scarica senza che lo scegli.
- La pulsantiera ora è attaccata alla timeline, senza la fascia vuota in mezzo.
- Corretti: l'autosalvataggio che diceva «salvato» anche quando non riusciva, i modelli AI caricati due volte, errori nascosti in LIVE, la chiave Hugging Face «salvata» anche se non lo era.
- Non ancora provati a fondo su macchine diverse: Mac, monitor con DPI diversi in LIVE, modelli AI veri dentro l'app.

## [1.6.6] — 2026-10-28 · I modelli sulla scheda video: togli i rumori ~10 volte più veloce, sfondo che segue 3 volte più veloce, Whisper più preciso

Misurato sulla scheda video (RTX 4060, WebGPU) con i modelli veri, non a occhio:
- **Togli i rumori (MossFormer2) sulla scheda video**: il modello a precisione piena (227 MB, finestre da 15 s) pulisce 15 s in **0,15 s** (il processore col modello a 8 bit: circa un secondo di audio per secondo). Un clip di 12 s: 5 s in tutto contro 17. Senza scheda video resta il modello a 8 bit sul processore. Le maschere dei due modelli sono uguali (somiglianza 0,998).
- **Bug trovato misurando**: l'ultima finestra non piena si completava con zeri, e col silenzio digitale il modello sbaglia la maschera di tutta la finestra (somiglianza 0,19): la coda di ogni clip usciva rovinata. Ora si completa con l'audio stesso, andata e ritorno (vale anche per il processore).
- **Sfondo AI che segue 3 volte più veloce**: SAM 3 guarda ogni fotogramma in 1,4 s (la scheda è al limite: q4 e fp16 uguali); SAM 2.1 tiny in 0,3 s. Ora SAM 3 fa il fotogramma dei clic e torna ogni 6 fotogrammi, SAM 2.1 segue l'oggetto negli altri (riquadro e punti dalla maschera di SAM 3). In Avanzate c'è **Precisione massima** (SAM 3 su ogni fotogramma). Su una ripresa vera le maschere si somigliano al 76% (stessi oggetti, contorni un po' diversi).
- **Whisper «Preciso» = large-v3-turbo** a 4 bit (564 MB): 30 s di parlato in 2,6 s, più veloce del small (3,1 s) e sbaglia molto meno.
- «Voce isolata» (Demucs + MossFormer2) ora gira sulla scheda video: circa 1× il tempo reale (prima ~4×).
- Per le misure a mano: `test/_banco-modelli.mjs` (Whisper, NLLB, SAM 3), `test/_banco-sam.mjs`, `test/_banco-sam-vero.mjs`, `test/_banco-mf-gpu.mjs`, `test/_banco-mf-conf.mjs`.

## [1.6.5] — 2026-10-28 · Sfondo AI con un modo solo (SAM 3), niente avvisi a raffica, voce migliorata

- **Togli lo sfondo AI = un modo solo**: clicchi su cosa tenere e **SAM 3** fa tutto. Via «Automatico», «Persone», «Scegli tu», i tasti 🧍 Persona / 📦 Oggetto sul monitor (la Persona usava un modello più debole e veniva il contorno sbagliato) e la scelta del modello. Il Centro AI mostra un solo modello per lo sfondo.
- Il pannello dice **che modello sta lavorando** (nome, dove gira: scheda video o processore, e se al suo posto è partito un ricambio) e ha un **cursore «Provalo in un altro punto»** sotto l'anteprima, più Bordo e Morbidezza sempre in vista.
- **Basta 4 avvisi a ogni clic**: «Scarico il modello: 10 di 12 MB» usciva anche con tutto già scaricato (erano byte letti dalla cache) e a ogni passo faceva un avviso nuovo. Ora il modello già nel worker non si ricarica, un modello già provato dice «è già nel computer» e l'avanzamento è un solo avviso che si aggiorna.
- **Clip legate**: lo sfondo (e il suo ritaglio) cambia **solo la clip su cui hai cliccato**; le altre clip scelte insieme restano com'erano, e il pannello lo scrive.
- **Togli i rumori, tre scelte diverse davvero**: **Voce pulita** (toglie solo i rumori), **Voce migliorata** (toglie i rumori e rifà la voce da podcast, più piena e a volume giusto: Clear) e **Voce isolata** (prima tiene solo la voce). «Naturale» era quasi uguale a «pulita»: tolto.

## [1.6.4] — 2026-10-28 · La barra dei tasti sopra la timeline non si perde più

- **Pulsantiera sempre al suo posto** (taglia, elimina, ripple, calamita, trasparenza, foto, zoom): se il banco ricordava «Pulsantiera spenta» da Vista, o un divisore trascinato troppo in giù, la barra spariva o restava mezza fuori e la timeline si schiacciava. Adesso la pulsantiera **non si ricorda più chiusa** (si riapre sempre all'avvio) e il monitor non può più mangiare lo spazio della barra e della timeline: restano sempre in vista, anche con la finestra bassa.

## [1.6.3] — 2026-10-28 · Il Centro AI è l'elenco dei modelli, e lo sfondo AI si fa dal pannello

- **Centro AI = hub dei modelli**: via «Cosa vuoi fare», le schede delle funzioni e «Clip esplicita». C'è l'elenco dei modelli (sfondo e segui, sottotitoli, traduzione, rumori, voce e base) con lo stato di ognuno, **Scarica / Completa / Ricontrolla** e **Togli**, più «Controlla e ripara tutto», la diagnosi, la scheda video, la chiave Hugging Face e lo spazio occupato.
- **«Pronto» ora vuol dire provato**: un modello è pronto solo se è stato caricato per intero da qui o da un uso vero e i suoi file sono ancora nella cache. Prima bastava qualche file di un modello con lo stesso nome (e al primo uso dello sfondo si scaricava altro). Scaricare passa dalla stessa strada dell'uso: la volta dopo non si scarica più niente. Se un modello cade su uno di ricambio (SAM 3 senza chiave) lo dice.
- Se tutti i modelli che servono sono pronti, **non compare più il dialogo «Consenti download e avvia»**: l'AI parte.
- **Togli lo sfondo AI dal pannello Proprietà**, tutto lì: cosa tengo, «Controlla questo fotogramma», anteprima, genera, avanzate. Con **un'anteprima dentro il pannello** (l'immagine del monitor nella vista scelta: immagine, maschera, scacchi o contorno). Non si apre più l'editor in una finestra che copriva il monitor.
- **Tolto il quadro in miniatura** da Posizione: la rotella scorreva il pannello solo fuori da lì, sopra ingrandiva.
- **«Riga al cursore» si trascina** sulla timeline: si lascia dove si vuole e poi si scrive il testo.

## [1.6.2] — 2026-10-28 · Un filtro del rumore serio: MossFormer2

- **Togli i rumori** usa ora **MossFormer2 di ClearerVoice-Studio** (Alibaba, Apache-2.0), un modello per la voce molto più forte di DeepFilterNet: a parità di parlato con rumore bianco a 5 dB il segnale sale di circa 10 dB, con ventola e ronzio di 7,5, con rumore rosa di 7. Le scelte sono tre: **Voce pulita**, **Naturale** (tiene un po' di stanza) e **Voce isolata** (prima Demucs tiene solo la voce, poi MossFormer2 la pulisce).
- Il modello (94 MB, 8 bit) si scarica la prima volta da Hugging Face e poi resta sul computer; lavora sul processore, a pezzi da 4 secondi cuciti senza spostare un campione (circa 1× il tempo reale). Se non si scarica o non parte, si usa il filtro di prima (DeepFilterNet, dentro il programma) e lo si dice.
- «Controlla e ripara tutto» del Centro AI scarica anche questo modello. I progetti già puliti con Leggera/Media/Forte/Podcast restano com'erano (e «Audio originale» funziona).
- Prove: il front-end e il flusso sono in `src/core/mossformer.ts` e si provano da Node (`test/unit/mossformer.test.mjs`); il confronto con torchaudio ha dato differenze sotto 1e-8.

## [1.6.1] — 2026-10-27 · Più semplice: Attività, Finale, LIVE e Proprietà rifatti

- **Attività** com'era nella 1.5.5: la barra in basso mostra cosa sta facendo il programma, il popup ha i lavori con avanzamento e tempi, ⚡ Sovraccarica, Pausa, Pulisci. In più la sezione «Prepara i file»: copie leggere (proxy), forme d'onda, locandine, colore e velocità con un clic. Locandina, colore e forma d'onda ripartono di nuovo da soli all'import (si vedono le forme d'onda dei file audio).
- Tolti **Cerca** in alto, il menu **Banco** e la puntina: il pannello Proprietà sta sempre aperto a tutta altezza.
- **Finale** com'era (Colore per primo, un solo pulsante Esporta). **LIVE**: REGISTRA parte subito, microfono / audio del computer / webcam in vista, il resto in «Altre opzioni»; le finestre in più si scelgono prima di registrare, durante si passa dall'una all'altra con 1-9. Su Windows lo schermo e i permessi di microfono e webcam non chiedono conferma.
- **Doppio clic su una clip**: si apre l'editor con tutte le sezioni (posizione, effetti e look, sfondo, segui, colore, durata e velocità, entrata e uscita, ritaglio). Il pannello a destra tiene solo posizioni pronte, opacità, movimento (con anteprime animate), sfondo, segui e colore.
- **Effetti rapidi audio** con il disegnino del suono: Voce pulita e Voce isolata (AI), Voce chiara, Radio, Ovattato, Taglia bassi, Livella e il nuovo Robot. Tolti Eco e Muto.
- **Togli lo sfondo**: quadratini Off / Colore / Luce / AI. Colore: contagocce e preset green/blue screen, il resto sotto «Rifinisci». AI: nell'editor, in tre passi (cosa tengo, «Controlla questo fotogramma» con il contorno sul monitor, anteprima di 5 s o tutta la clip). Nuovo **Segui con l'AI** e il campo della **chiave Hugging Face** per SAM 3 (AI → Impostazioni).
- **Centro AI**: «Controlla e ripara tutto» (motore, scheda video, connessione, modello di voce e base) e l'elenco dei modelli.
- **Libreria**: transizioni, titoli, animazioni ed effetti sono una pagina sola che scorre; i sottotitoli con l'AI si trascinano su una clip.
- **Montage**: sullo schermo largo le tre colonne stanno di nuovo affiancate.
- Prove allineate a tutto questo.

## [1.6.0] — 2026-10-27 · Attività in un popup e Montage di nuovo a tre colonne

- Il centro Attività torna a essere un popup in basso a destra, sopra la barra di stato: non prende più il posto della libreria e non nasconde monitor e timeline. Esc o «Torna alla libreria» lo chiudono.
- Montage: sullo schermo largo le tre colonne (foto, stile, durata e musica) stanno di nuovo affiancate; i tre passi restano solo sugli schermi stretti.
- Prove allineate al Centro AI a una carta per volta e al consenso esplicito (traduzione sottotitoli, «Togli i rumori»).

## [1.5.9] — 2026-10-24 · Cartelle leggibili e aggiornamenti più affidabili

- Ripristinata la larghezza dell'albero delle cartelle: nella 1.5.8 un limite percentuale lo schiacciava dentro la sua colonna, lasciando vuoto lo spazio accanto. Correzione valida anche per le disposizioni già salvate, senza azzerare preferenze o progetti.
- Il controllo aggiornamenti desktop passa dalla rete Rust con timeout ed errori leggibili. Se l'API GitHub non risponde, prova il nuovo `aggiornamento.json`, pubblicato insieme ai tre installer. Nessun token richiesto.
- Aprendo la finestra aggiornamenti si ricontrolla la release, invece di riutilizzare per ore un risultato vecchio. I download hanno timeout, mantengono la verifica HTTPS e mostrano il motivo restituito dal sistema; un download fallito non lascia un file parziale pronto da aprire.
- Aggiunta una prova del difetto grafico con la disposizione larga salvata e verifica del layout a 1920, 1366 e 1024 pixel. La CI esegue anche la regressione del controllo aggiornamenti.

## [1.5.8] — 2026-10-24 · Preparazioni manuali e flussi di lavoro

- **Attività nella libreria**, non in un popover sopra la timeline: selezione dei file e del tipo di preparazione, aggiunta senza avvio, Avvia singolo/batch, Pausa e Riprendi solo dove il motore le supporta, annullamento e scarto delle proposte. I fallimenti parziali restano visibili e riprovabili; i worker senza retry chiedono di tornare alla funzione. Sovraccarica è nei dettagli avanzati.
- **Montaggio**: spazi Banco completo, Taglio ed Effetti; accesso alle preparazioni e all'AI dalle proprietà. Gli effetti mantengono ricerca, categorie e anteprime del catalogo; forza anche a zero e parametri della censura nelle proprietà.
- **Finale** parte dalla consegna, con percorso Immagine/Audio/Testi e AI e un pulsante master fisso. Misura colore e Livella volume chiedono esplicitamente le preparazioni necessarie.
- **LIVE** distingue registrazione, pausa, conto e fermo, mostra le sorgenti collegate e separa configurazione e registrazioni pronte. Il motore di registrazione non cambia.
- **Montage** in tre passi: file, stile, durata/ordine/musica. Crea anteprima, Rigenera, Tieni e apri, Scarta restano collegati alla timeline vera. Le analisi richieste da Crea sono attività annullabili e pausabili tra i pezzi.
- **AI** organizzata per compito, con clip esplicita per audio/sfondo e conferma comune prima di elaborare o autorizzare download: modello, ambito, cache, costi indicativi e dettagli progressivi. Nessuna pausa finta per worker non strumentati.
- **Grana, Nitidezza e Censura** dal motore condiviso monitor/export. Attenzione: la **1.5.7 non applica la censura** dei progetti nuovi; il mosaico non garantisce anonimizzazione irreversibile.
- Corretto il calcolo del percorso Windows nello script foto (test CLI del percorso, non screenshot eseguiti).

- Corretta la navigazione Tab/Shift+Tab sui controlli senza perdere le scorciatoie dei monitor. Voce AI non importa risultati dopo annullamento o cambio progetto durante il salvataggio.
- Test del progetto `.dap` aggiornati al consenso AI esplicito e alla chiusura effettiva del relativo overlay prima di aprire il menu clip.

Verifiche e limiti in [docs/flussi-ui.md](docs/flussi-ui.md): 70 test Node, typecheck e build; QA mirata di Montage, AIuto, effetti/pixel e replay export codificato su AMD D3D11 e SwiftShader. Il percorso storico della suite lunga resta inconclusivo; runtime Tauri, inferenza AI reale, LIVE con dispositivi reali e compatibilità completa di progetti preesistenti con tutti i media **non sono certificati**. L'integrazione dell'update è autorizzata con questi limiti dichiarati: non equivalgono a test superati né a una garanzia di assenza di regressioni.

## [1.5.7] — 2026-10-21 · Il controllo aggiornamenti non dorme più 🔔

- **Controlla da solo all'apertura e poi ogni 4 ore**, finché l'app resta aperta (prima una volta al giorno, e solo all'apertura).
  Senza internet non dice niente e riprova dopo 20 minuti.
- **Il tasto in alto dice la versione**: quando ne esce una nuova compare «Aggiornamento 1.5.8 disponibile» accanto all'icona;
  un clic apre la finestra con le novità e il tasto per scaricare e installare. L'avviso a comparsa esce una volta sola per versione.

## [1.5.6] — 2026-10-21 · Sottotitoli che si correggono direttamente sulla timeline 💬

### Sottotitoli AI facili da inserire e da correggere
- **Il testo si scrive sopra la timeline**: doppio clic su una riga **SOTT** (o **F2**) e compare una casella di testo lì, non più un dialogo.
  **Invio** conferma, **Maiusc+Invio** va a capo (due righe insieme), **Esc** butta le modifiche, **Tab** / **Maiusc+Tab** passano alla riga dopo / prima
  (il cursore del montaggio va sul suo inizio: si corregge un'intera trascrizione senza toccare il mouse) e **Ctrl+Invio divide la riga proprio dove sta
  il cursore di scrittura**, continuando con la seconda parte. Un clic fuori conferma; se un altro programma ruba il fuoco la casella resta.
- **La riga SOTT si vede anche vuota** (comando "Mostra la riga dei sottotitoli", o col **+** e il nuovo tasto **✨** nella sua testata) con la scritta che dice cosa fare.
  **✨ / Alt+G** scrive i sottotitoli con l'AI: dall'intero montaggio, o solo dalle clip che hai scelto.
- **Comandi e tasti** (anche in Ctrl+K e nel nuovo menu **Sottotitoli**): Alt+G genera, Alt+N riga nuova al cursore, F2 scrivi/correggi, Alt+S dividi sotto il cursore,
  Alt+J unisci le righe scelte, Alt+PagSu / Alt+PagGiù vanno alla riga prima / dopo, "comincia / finisce al cursore", togli, stile, importa, esporta, voce AI. Nessun tasto è doppio.
- **Esporta .vtt** (WebVTT, il formato del web) oltre al .srt: dal menu Sottotitoli, da Ctrl+K e dalla pagina Finale (pulsanti "Esporta .vtt" e "Sottotitoli .vtt"); si può importare .srt e .vtt
  (il .vtt si rilegge identico). Il testo ha `< > &` protetti. I sottotitoli "scritti nel video" escono come prima, bruciati nel filmato esportato.

### AI più affidabile
- **Le righe dell'AI arrivano in ordine** (`sistemaRighe`): mai una sopra l'altra, mai oltre la fine del montaggio, niente righe di sola punteggiatura, almeno due fotogrammi ciascuna.
- **Whisper che si incanta** e ripete la stessa frase ("Grazie." "Grazie." "Grazie."…) sul silenzio o sul rumore: da tre uguali di fila restano due.
- **Il riconoscimento non resta mai appeso**: un pezzo che non risponde per 10 minuti (scheda video bloccata) si butta e si rifà da un worker nuovo sul processore.
- **Ferma** adesso ferma davvero: oltre a fermare il giro chiude il worker (prima un modello in scarico andava avanti).
- **Errore sistemato**: i "Sottotitoli con l'AI" dalla timeline usavano Whisper anche nell'app, mentre il Finale (senza una scelta fatta) usa Nemotron di NVIDIA: ora la scelta è la stessa.
- Guida (F1) e Centro AI aggiornati col nuovo modo di correggere. Prove: `test/prove-sottotitoli.mjs` (33), dentro `prove-nuove.mjs sottotitoli`.

### Niente più fotogrammi chiusi nel monitor e nell'export

- **Monitor**: a volte, mentre il montaggio suonava, compariva l'errore "VideoSample is closed" e un fotogramma non si disegnava. Succedeva quando nello stesso disegno la stessa clip veniva chiesta due volte (una transizione, il movimento fluido) o un flusso veniva buttato: il fotogramma già preso si chiudeva prima di finire sullo schermo. Adesso si chiude solo a disegno finito.
- **Export e istantanee**: stessa cosa quando si raccolgono gli strati di un fotogramma; i fotogrammi superati si chiudono dopo averlo disegnato.

## [1.5.5] — 2026-10-16 · Selezione dello sfondo AI più chiara 🎯

### Togli lo sfondo con l'AI
- Mentre scegli una persona o un oggetto, la maschera compare subito sul monitor: puoi controllare il risultato prima di confermare **OK** per tutta la clip o guardare l'anteprima di 4 secondi.
- I tasti **Persona** e **Oggetto** sono nella barra del monitor; la selezione si può confermare anche con **Invio** e annullare con **Esc**.
- La barra si dispone su più righe nei monitor stretti, così le istruzioni e i comandi restano visibili.

## [1.5.4] — 2026-10-16 · Sei modi di togliere i rumori, SAM 3, clip unica, sottotitoli dal montaggio 🎙

### Togli i rumori: sei scelte
- La "catena voce" della 1.5.3 (compressore, silenzio assoluto fra le parole, volume alzato) suonava peggio: **tolta**. **Leggera, Media e Forte tornano come nella 1.5.2** (DeepFilterNet).
- **Voce isolata**: prima un modello AI tiene solo la voce (via musica, TV, gente), poi toglie il rumore.
- **Podcast** e **Podcast naturale**: la voce rifatta da **Clear** di Desert Ant Labs (uscito quest'anno, aggiornato a ottobre): toglie rumore ed eco, porta avanti la voce e la mette al volume da podcast (−19 LUFS). "Naturale" lascia un po' del suono della stanza. Gira sul processore; la prima volta scarica il modello (~49 MB). Powered by Desert Ant Labs (licenza nelle Informazioni).

### Togli lo sfondo con l'AI
- **"✕ Togli lo sfondo AI (torna com'era)"** sempre in vista. Prima, se avevi la vista Maschera o Scacchi accesa e sceglievi "Niente", il monitor restava sulla maschera e sembrava impossibile tornare indietro.
- **"AI · scegli tu"**: clicchi la persona o la cosa da tenere e la selezione compare subito sul monitor; puoi premere **✔ OK** per elaborare tutta la clip, oppure guardare prima un'**Anteprima** di 4 secondi sugli scacchi. Con **"＋ Un altro oggetto"** ne aggiungi altri (una persona e una cosa, due persone…); se il risultato non va, premi **Riprova**. Dopo i clic non parte da solo il lavoro sull'intera clip.
- Nella barra del monitor puoi scegliere **🧍 Persona** (MODNet seleziona una persona) o **📦 Oggetto** (SAM); il modello si carica mentre prepari i clic e la selezione si disegna in verde con un bordo bianco.
- **SAM 3** di Meta è il modello di partenza per "scegli tu" (la versione per il browser, ~300 MB la prima volta): sulla RTX 4060 circa 1,4 secondi per fotogramma. Se non parte si usa SAM 2.1.

### Montaggio
- **Il pezzo che il 2 toglie si vede**: subito dopo il taglio è evidenziato in giallo (video e audio legato), senza essere selezionato.
- **🧩 Rendi clip unica** (tasto destro, o Ctrl+Alt+U): le clip scelte, con tutti i loro tagli, effetti e volumi, diventano una clip sola (video e audio legati) su un file nuovo nella cartella "Clip uniche". Ctrl+Z torna alle clip di prima.

### Sottotitoli dal montaggio
- Tasto destro su una clip → **"Genera i sottotitoli di questa clip"**: le righe vanno solo in quel pezzo, le altre restano.
- Tasto destro sulla riga SOTT: genera con l'AI, **fai parlare i sottotitoli** (voce AI), posizione e grandezza.
- Contenitore → Titoli → **Sottotitoli**: genera con l'AI, riga al cursore, fai parlare, posizione e grandezza.

## [1.5.3] — 2026-10-15 · Il progetto .dap con dentro tutto, voce pulita davvero, niente lavori fantasma 💾

Una versione di sistemazione: nessuna funzione nuova, solo cose che devono andare al 100%.

### Salvare: un file .dap con dentro TUTTO
- **Salva (Ctrl+S) ora fa un file `.dap`** con dentro tutto il progetto: il montaggio con ogni impostazione, **tutti i file** (video, musiche, immagini, registrazioni del LIVE, audio pulito dall'AI) e **le copie leggere** già fatte. Lo porti su un altro computer, lo apri (doppio clic o File → Apri) e ritrovi tutto identico, senza rifare le copie leggere. Prima il progetto salvato era solo la "ricetta" (pochi KB) e i file restavano dove erano.
- La prima volta ci mette un po' (copia i file, con la barra nel Centro attività e la ✕ per fermare); **dopo, Salva aggiunge solo quello che è cambiato** ed è veloce anche con GB di video. Se lo fermi o si spegne il computer a metà, il file resta il progetto salvato prima.
- **Salva come…** riscrive tutto pulito in un file nuovo. I vecchi `.dpv` e `.daprod` si aprono ancora (al primo Salva diventano `.dap`).

### Togli i rumori: resta solo la voce
- Prima le forze "leggera" e "media" mescolavano il pulito con l'originale (rimaneva il 40% e il 15% del rumore): per questo **attenuava e basta**. Adesso:
  - **Leggera**: toglie fruscio e ventola e lascia un filo d'ambiente;
  - **Voce pulita** (quella di partenza): il rumore va via del tutto (anche fra una parola e l'altra), poi la voce passa da una **catena da studio**: via i bassi che rimbombano, voce più chiara, compressore morbido (volume regolare), limitatore, e **il volume giusto** messo nel volume della clip (si può cambiare quando vuoi);
  - **Voce isolata**: prima un modello AI (Demucs, ~172 MB la prima volta) **tiene solo la voce** — via musica, TV, gente, rumori forti e una parte dell'eco — poi come "Voce pulita". Più lenta.
- "Audio originale" rimette anche il volume di prima.

### Conversioni solo quando servono
- Un file si converte **solo se è davvero diverso** da come deve essere: un video si rifà solo se i fotogrammi non stanno su una griglia regolare (un video a 30 fps con qualche fotogramma perso va bene così), un audio solo se è un **MP3 a bitrate variabile**. MP3 a bitrate costante, AAC, WAV, FLAC, Opus restano come sono.
- **Le registrazioni del LIVE (schermo e webcam) non si convertono più**: le fa il programma stesso, con i tempi giusti (prima la webcam passava minuti in "Conversione a velocità costante").
- Quando un video si rifà, l'audio dentro si copia così com'è (niente perdita di qualità), e il frame rate scelto è quello comune subito sopra (niente movimento perso).

### Scheda video NVIDIA con il monitor sulla scheda del processore
- **Trovata la causa** di "AI lenta, scheda video poco usata" sui PC con due schede e il cavo del monitor sulla scheda integrata: il browser interno dell'app usava **solo la scheda integrata** (provato sul PC di Cammo: vedeva solo la AMD Radeon, la RTX 4060 era invisibile). Ora l'app chiede sempre la scheda più potente: sul PC di Cammo usa la **RTX 4060** per l'AI, la codifica H.264 hardware fino al 4K e il disegno del montaggio, con il monitor che resta dov'è.

### Centro attività e timeline
- **Niente più righe "in corso" ferme** sotto "Il programma non sta facendo niente": chiudendo e riaprendo il pannello le righe vecchie restavano lì col tempo bloccato.
- **Dopo un taglio la clip scelta si vede tutta**: il bordo giallo non è più coperto dal pezzo attaccato, e la clip scelta ha una velatura gialla.

## [1.5.2] — 2026-10-15 · Tracce sempre uguali, LIVE con i comandi in vista, sfondo AI che non si blocca più 🎯

### Timeline
- **Lo spessore delle tracce e delle clip è sempre quello di base** (quello delle prime versioni), qualunque sia lo spazio che la timeline ha: se la allarghi o ingrandisci, resta solo più posto vuoto, le clip non si ingrossano più. Lo zoom verticale (Ctrl+Shift+rotella) resta una scelta tua.

### Pagine
- **LIVE**: i comandi stanno **sempre in vista**, a tutta altezza accanto alla timeline (come le proprietà col tasto V nel montaggio): niente più scorrere per trovare REGISTRA o la webcam.
- **Finale**: la timeline è **piccola** e la schermata dei ritocchi (colore, look, ritocchi) è grande. Il divisore in mezzo si trascina e si ricorda.

### Webcam in LIVE
- Se la webcam non si apre, l'avviso ora dice **perché e cosa fare** (permesso negato, usata da un altro programma, non trovata…) con il nome tecnico dell'errore fra parentesi. Un indirizzo di webcam vecchio (dopo aver cambiato scheda video o provando OBS) non blocca più: si riprova da soli senza e con richieste più semplici. Se la webcam si apre ma non arrivano immagini lo dice dopo 4 secondi.
- L'anteprima della webcam sta sopra a tutto. Nell'app per Windows è stata tolta la cattura video con la scheda video del browser interno (può dare una webcam nera o che non parte con due schede video): serve riavviare il programma.

### Togli lo sfondo con l'AI
- **Trovata la vera causa dell'errore "Invalid ShaderModule LayerNorm / failed to call OrtRun()"**: dopo il primo errore della scheda video la libreria dentro il worker rifiuta anche le richieste nuove con lo stesso errore, e il ripiego sul processore non partiva mai. Adesso il lavoro si butta e **riparte da un worker nuovo sul processore**, con lo stesso fotogramma. Vale anche per i sottotitoli (Whisper). L'errore finale mostra quello dell'ultimo tentativo, non solo il primo della scheda.
- **Clic sinistro aggiunge un punto, clic destro lo toglie** (sopra il punto); Alt+clic resta "questa parte NON si tiene".

## [1.5.1] — 2026-10-15 · L'hardware si riconosce da solo, Sovraccarica, LIVE più semplice 🚀

### Scheda video e processore: il programma capisce da solo cosa usare
- **Rilevatore dell'hardware** (si vede in Centro AI → "Controlla l'AI"): guarda **tutte** le schede video che il sistema offre (anche con due schede, una NVIDIA/AMD vera e quella dentro il processore, col cavo del monitor su una delle due), a ognuna fa fare un piccolo conto vero e sceglie la migliore che lo fa giusto; se nessuna va, usa il processore. Lo rifà da solo quando cambia l'hardware (nuova scheda).
- **Se una scheda sbaglia a metà lavoro** (era l'errore "setPipeline… GPUComputePipeline" di "Togli lo sfondo AI"), prima non veniva riconosciuto come errore della scheda e il lavoro si fermava: adesso il lavoro continua sul processore, e la volta dopo si prova l'altra scheda (o il processore) senza riprovare quella che sbaglia. Vale per sfondo, sottotitoli e separazione voce/base.
- Copie leggere e conversioni provano prima la **codifica hardware** della scheda video (più veloce, il processore resta libero) e, se non va, ripiegano sul processore.

### Centro attività
- Nuovo pulsante **⚡ Sovraccarica**: mette tutto il computer (processore e scheda video) a fare copie leggere e conversioni, più file insieme e senza aspettare quando il montaggio suona. Utile quando carichi tanti file. Si spegne da solo quando finisce.
- **Le copie leggere partono appena importi i file**, non quando li metti in timeline. Di norma si lavora a due a due sui computer con 8 processori o più.
- Una conversione non resta più appesa a "metto la copia al suo posto" se il montaggio sta suonando un altro file (aspetta al massimo 20 secondi, e solo se sta suonando proprio quel file).

### Audio AI nelle Proprietà
- Il bottone premuto dice **"In corso 42%"**, gli altri si spengono e sotto compare la barra con cosa sta facendo; a lavoro finito tornano normali.
- Dopo "Separa voce e musica" la clip originale (muta) **mostra ancora la sua forma d'onda**, più smorta.

### LIVE
- **Via i filtri audio** (mixer, preset della voce, "Toglie i disturbi"): l'audio si lavora dopo, nel montaggio. Restano le due barre dei livelli.
- **La webcam si accende e si spegne anche mentre registri** (tasto **WEBCAM** in alto o tasto **C**): ogni volta che resta accesa è un file suo, e in timeline sta al suo posto con il buco di quando era spenta.
- La **colonna dei comandi è più larga** e non scorre più di lato.
- Se lo schermo registrato arriva tutto bianco (o nero) lo dice dopo 3 secondi e spiega cosa provare (può capitare con due schede video).

### Banco
- **Ctrl + / Ctrl −** con il puntatore sulla timeline e **Ctrl + rotella** (anche su intestazioni e mappa) ingrandiscono **solo la timeline**, non più tutta l'interfaccia; il pizzico del trackpad non zooma più la pagina.
- La **barra sopra il monitor** (nome, Movimento, forbici…) è sottile e su una riga sola.

## [1.5.0] — 2026-10-15 · L'audio con l'AI nel montaggio, lo sfondo che segue meglio 🎙️

### Audio: togli i rumori e separa voce e musica (e non solo in LIVE)
- **Proprietà → "Audio: pulisci e separa (AI)"**: scegli una clip audio (o una ripresa con l'audio) e trovi due schede grandi. **Togli i rumori** (Leggera / Media / Forte): fruscio, ventole e rumore di fondo vanno via e la voce resta. **Separa voce e musica**: da una canzone fa due tracce nuove, *Voce* e *Base* (lo strumentale), con l'originale muto; ci sono anche "Solo voce" e "Solo base".
- Lo stesso si trova col **tasto destro sulla clip**, nel menu **Montaggio**, nel menu **AI**, nel **Centro AI** e con **Ctrl+K** ("rumori", "separa voce").
- Lavora solo sulla parte della clip che usi (più un secondo per lato), in secondo piano con la barra nel Centro attività: puoi continuare a montare. Il risultato è un file nuovo nel contenitore (cartella "Audio lavorato"); **Ctrl+Z** rimette tutto, e "Audio originale" torna al suono di prima.
- **Togli i rumori** usa **DeepFilterNet3**, che sta dentro il programma (34 MB, niente da scaricare). **Separa voce e musica** usa **Demucs**: il modello (172 MB) si scarica la prima volta, poi resta nel computer. Se non si scarica, parte da sola una **separazione rapida** senza AI (dal centro dello stereo: meno precisa) e te lo dice.

### Togli lo sfondo con l'AI: più semplice e più stabile
- **Una scelta sola, "AI · automatico"**: parte da sola. Se ha tenuto la cosa sbagliata, **"Clicca su cosa tenere"**: capisce da solo se è una persona o un oggetto e lo segue per tutta la clip (dopo l'ultimo clic rifà il lavoro da solo). Modello, precisione, bordo e gli altri modi stanno in **Avanzate**.
- **Dopo il primo fotogramma la maschera non va più a pezzi**: ogni fotogramma riceve il riquadro e anche qualche punto nel cuore della maschera di prima (il modello sa quale oggetto è anche con un'altra persona vicino), i buchi dentro il soggetto si riempiono, le isole sparse si tolgono e un buco che c'è in un fotogramma solo si riempie guardando prima e dopo.

### Altre cose
- **La rotella cambia un valore dopo 1 secondo** col mouse fermo (prima 1,5): con l'anello che si carica.
- **Incolla (Ctrl+V) nella traccia scelta**: se hai acceso una traccia (clic sul suo nome), le clip copiate vanno lì (se è occupata, nella più vicina libera e te lo dice). Duplica (Ctrl+D) resta sulle stesse tracce.

### Per chi ha curiosità
- Nuovi: `src/media/audioAI.ts` (+ `audioAI.worker.ts`, `modelliAudio.ts`), `src/core/rumore.ts`, `src/core/separa.ts`, `src/core/ricampiona.ts`, `src/ui/audioAI.ts`; `pulisciMaschera`, `votoTemporale`, `puntiNucleo` in `src/core/sfondo.ts`. `scripts/ai-locale.mjs` porta in `public/ai/` anche DeepFilterNet e il motore ONNX per la scheda video (l'app cresce di circa 35 MB; su Pages no, lì si va sulla CDN).
- **Non provato con i modelli veri**: Demucs (il container non raggiunge Hugging Face: le prove usano un modello finto con le stesse forme), la qualità a orecchio di DeepFilterNet e della separazione rapida, WebGPU, e il tracciamento "Clicca tu" su riprese vere.

## [1.4.2] — 2026-10-15 · Il tracking che si completa, la rotella con la pausa, lo sfondo che segue 🎯

### Segui un oggetto: e poi?
- **Finito il tracking, il pannello Proprietà si apre da solo sulla sezione "Segui un oggetto"** e offre tutto quello che si può mettere sopra, con tessere grandi: **Testo** (un titolo sopra l'oggetto, da scrivere), **Nome sopra** ed **Etichetta**, **Mirino, Cerchio, Freccia, Onde**, **Immagine** (una del progetto o un file nuovo), **Emoji**, e gli effetti che lavorano sull'oggetto: **Lente, Zoom, Vortice, Occhio di pesce**. Ognuno segue l'oggetto per tutta la ripresa; si cambia dalle sue Proprietà e si sposta rispetto all'oggetto trascinandolo sul monitor.
- **I segnalini che seguono non stanno più nella libreria delle Animazioni** (né nel menu né nella ricerca): si mettono solo da qui, dove hanno senso.

### Togli lo sfondo con l'AI: un clic e segue per tutta la clip
- Con **"Clicca tu"** (prima "Oggetti"), dopo l'ultimo clic sulla persona o sull'oggetto parte **da solo il lavoro su tutta la clip**: prima restava la prova su un solo fotogramma finché non si premeva un altro pulsante. Un clic nuovo ferma il lavoro e lo rifà coi clic aggiornati.
- **I modi sono spiegati**: *Automatico* (trova da solo chi sta davanti), *Persone (da solo)* (cerca solo le persone, bordi e capelli più puliti, tiene tutte quelle che vede), *Clicca tu* (scegli persona o oggetto con i clic e lo segue). Dai modi automatici un pulsante porta subito a "Clicca tu".

### La rotella non cambia più i valori per sbaglio
- Un cursore, un numero o una tendina risponde alla rotella **solo dopo che il puntatore è rimasto fermo sopra per 1,5 secondi**: mentre aspetti compare vicino al puntatore un anello che si carica, poi un punto dorato = pronto. Prima, e se muovi il mouse, la rotella fa scorrere il pannello come sempre.

### Il taglio
- **Dopo il taglio (1) e dopo Separa (S) non resta niente selezionato**: puoi cliccare subito la clip che vuoi. Il **2 subito dopo il taglio toglie ancora il pezzo più corto** (lo scarto), come prima.

### Proprietà
- **Effetti e look in miniature quadrate**, col nome sopra l'immagine e i filtri in cima (Colore, Atmosfera, Vintage, Altro): niente più muro di testo.

### Centro attività e finestre
- **A lavoro finito non gira più nessun timer**: il conteggio dei secondi parte solo mentre c'è qualcosa in corso, e l'elenco delle finite non si ridisegna ogni secondo. Le attività finite dicono **quanto ci hanno messo** ("ci ha messo 4 min 45 s") e **a che ora** hanno finito, scritti una volta, senza il "x fa" che cammina.
- **La finestra "Impostazioni del progetto" non esce più dallo schermo**: le tendine stanno dentro la colonna (niente scroll orizzontale), e la finestra è un po' più larga.

### Per chi ha curiosità
- Nuovi: `src/ui/seguiMenu.ts` (tutto quello che si mette sull'oggetto), `Pallino` e attesa in `src/ui/rotella.ts` (`dpv-rotella-attesa` in localStorage la cambia, le prove la mettono a 0), filtri in `src/ui/tessere.ts`, `GRUPPI_LIBRERIA`/`ANIM_LIBRERIA` in `src/core/animazioni.ts`.
- Non provati con i modelli veri: il tracciamento dell'AI di "Clicca tu" su riprese vere (le prove usano un segmentatore finto).

## [1.4.1] — 2026-10-14 · LIVE: si vedono e si bilanciano i suoni, con i filtri per la voce 🎙️

### Livelli e mixer
- **Due vumetri stereo con i LED**, uno per l'**audio del computer** e uno per la **voce (microfono)**, nella regia di LIVE, nel pannello Audio e anche nel **telecomando**: si vede subito se uno dei due non arriva o se va in rosso.
- **Prova l'audio** (si ascolta e si guardano i livelli prima di registrare) e **Ascolto** (te lo senti in cuffia mentre parli).
- **Volume separato per computer e voce** (da −60 a +12 dB) con il tasto muto, e un **bilanciamento** a cursore con tre scelte pronte: *Voce in primo piano*, *Pari*, *Gioco: computer forte*.
- **Abbassa il computer quando parlo** (ducking): la musica o il gioco si abbassano da soli mentre la voce parla, e risalgono dopo.
- **Limitatore** per non far mai saturare la registrazione.

### Filtri per la voce
- Scelte pronte: **Nessuno, Voce chiara, Voce da podcast, Voce radio, Ambiente rumoroso**.
- **Toglie i disturbi**: accende l'eliminazione dei rumori di fondo, l'eco e la regolazione del livello che fa il browser o il sistema (non è un modello AI nostro: la qualità dipende dal computer).
- Per chi vuole regolare a mano (**Avanzate**): taglia-bassi, gate, equalizzatore, de-esser, compressore, limitatore, eco, regolazione automatica del livello.
- **Le registrazioni prendono l'audio già lavorato** (anche con "voce e computer separati"). Di partenza tutto è trasparente: finché non tocchi niente l'audio è quello di prima. Le scelte si ricordano (`dpv-live`, campo `audio`).

### Per chi ha curiosità
- Nuovi: `src/core/liveAudio.ts` (parti pure: dB, preset, impostazioni), `src/media/liveAudio.ts` (il grafo Web Audio, con un AudioWorklet `dpv-dinamica` per gate/compressore/ducking), `src/ui/liveAudio.ts`, `src/stile/liveAudio.css`. Prove: `test/prove-liveaudio.mjs`.
- Non provato con un microfono e un audio di sistema veri (il container non ne ha): le prove usano sorgenti finte.

## [1.4.0] — 2026-10-14 · Le Proprietà rifatte, i formati del progetto e i segnalini che seguono 🎯

### Il pannello di destra (Proprietà)
- **Clic o doppio clic su una clip, e il menu giusto è già aperto**: per un'animazione si apre "Animazione" (in cima), per un titolo "Titolatrice", per un colore "Generatore", per la musica "Volume", per un effetto o una transizione "Quanto dura" e "Effetto/Transizione", per un video "Posizione e grandezza". Le altre sezioni restano chiuse; se ne chiudi una principale resta chiusa. Il tasto **fx** in fondo a una clip porta alle miniature degli effetti, non più a un elenco.
- **Posizione e grandezza = un quadro in miniatura che si trascina** (al posto di una fila di cursori): l'immagine del monitor in piccolo con sopra il riquadro della clip. Trascini dentro per spostare, tiri un angolo o giri la rotella per ingrandire, il pallino in alto la gira, doppio clic la rimette a tutto quadro; il centro e i bordi del quadro attirano il riquadro (Alt = libero). Sotto, nove posizioni pronte col loro disegnino (Adatta, Riempi, Piccola, quattro angoli, Bolla, Presentazione) e i numeri precisi chiusi in "Numeri precisi".
- **Effetti e look con la miniatura vera**: ogni effetto rapido e ogni look di colore si vede già applicato al fotogramma dove sei; un clic lo accende (con la spunta), "Com'è" li spegne tutti.
- **Durata e velocità, in parole semplici**: la durata si legge grande ("5,20 s") con "da … a …", i tasti −1 s / +1 s / +5 s / fino alla clip dopo / fino alla fine del file e la velocità con il tasto per cambiarla (Alt+E).
- **Entrata e uscita** (era "Transizioni"): la dissolvenza all'inizio e alla fine in secondi, e le transizioni con la clip prima e dopo con nomi chiari.
- **Ritaglio** (era "Avanzate"): quattro lati, e i pronti "Quadrato al centro", "Verticale 9:16 al centro", "Bande cinema". La posizione precisa e la rotazione stanno nei numeri precisi, la tinta nel colore.
- **Colore**: "Bilancia il bianco" col contagocce sul monitor (un clic su qualcosa di grigio o bianco e la dominante sparisce); la temperatura e la tinta sono a portata di mano.
- In cima a ogni clip: **Duplica** (nuovo comando **Ctrl+D**: una copia subito dopo, con i suoi effetti), **Vai all'inizio** ed **Elimina**.

### Togli lo sfondo
- Si sceglie "Come lo tolgo?" (colore, luce o AI), si guarda il risultato con **Immagine / Maschera / Sugli scacchi** dal pannello stesso, e c'è **"Cosa metto al posto dello sfondo?"**: uno sfumato (Notte, Tramonto, Mare…), un colore pieno o un tuo file, messo come clip dietro per tutta la durata.

### Segui un oggetto, e poi?
- Dopo aver tracciato un oggetto compaiono i **segnalini che lo seguono**, da mettere con un clic: **Mirino, Cerchio, Freccia, Etichetta con linea, Nome sopra, Onde**. Sono animazioni nuove del catalogo (gruppo "Segnalini che seguono"): una clip sopra la ripresa che segue l'oggetto per tutta la sua durata; si cambiano colore e testo dalle loro Proprietà e si spostano rispetto all'oggetto trascinandole sul monitor.

### La pagina iniziale
- **Progetto nuovo con formati pronti**: "Per cosa lo fai?" — YouTube, YouTube 4K, Reel · TikTok · Shorts, Instagram post (4:5), Quadrato, Cinema (21:9, 24 fps), Sport e azione (50 fps), Gioco e schermo (60 fps) — oppure si sceglie **risoluzione** (Full HD, 4K, 2K, HD, Verticale, 4:5, Quadrato, Cinema 21:9, 4:3, SD) e **fotogrammi al secondo** (24, **25, 30, 50**, 60, 29,97) a parte. Lo stesso nelle impostazioni del progetto e nel menu File → Nuovo progetto.

### Per chi ha curiosità
- Nuovi: `src/ui/miniQuadro.ts` (il quadro in miniatura e le posizioni pronte), `src/ui/tessere.ts` (miniature con `scenaRitocco`+`fotoScena` di `render/provino.ts`, disegnate una alla volta e solo finché si vedono), `src/render/anim/segnalini.ts`, `RISOLUZIONI`/`CADENZE`/`OBIETTIVI`/`formatoDa` in `core/tipi.ts`, `bilanciaBianco` in `ui/sfondo.ts`, comando `duplica`. `Ispettore.gruppo(id, titolo, righe, principale)`: le sezioni principali partono aperte. Prove nuove in `test/prove-proprieta.mjs`.
- La modalità LIVE con i livelli, il bilanciamento e i filtri audio è nella 1.4.1. (Le note di questa versione sono state scritte dopo l'uscita: se leggi "1.4.0" senza dettagli sulla release, sono queste.)

## [1.3.3] — 2026-10-14 · Il taglio preciso, i punti sul volume, la rotella ovunque 🎚️

### Il montaggio
- **Il taglio (1) tocca solo quello che scegli**: le tracce accese, se no le clip selezionate (con quelle legate), se no **la clip più in alto sotto il cursore** con la sua audio. Prima, senza niente di scelto, tagliava tutte le tracce. Per tagliare tutto in un colpo c'è il comando nuovo **Taglia tutte le tracce al cursore** (**Maiusc+C**). Dopo il taglio resta scelto il pezzo più corto, pronto per il 2.
- **Punti sulla linea del volume**: un clic sulla linea gialla di una clip audio (la musica) mette un punto lì e lo trascini su/giù **e di lato** per alzare o abbassare l'audio solo in quel momento. Clic su un punto lo sposta, Alt+clic (o doppio clic) lo toglie, Maiusc+trascina alza o abbassa tutto il tratto. Prima il clic spostava tutta la linea e il punto si metteva solo col doppio clic.
- **Doppio clic su una clip che non è un video** (animazione, titolo, colore, effetto, transizione) nella timeline: **si scelgono, il pannello Proprietà si apre da solo** (anche se era chiuso), il cursore entra nella clip e il monitor va sul programma, così le trascini subito sull'immagine per spostarle e ingrandirle.
- **Sul righello la rotella fa scorrere la vista** avanti e indietro senza spostare il cursore (sulle tracce resta un fotogramma per scatto).

### Le impostazioni
- **La rotella cambia ogni campo**: con il puntatore su un cursore, un numero o una tendina — in Proprietà, nel Finale, nelle finestre — la rotella cambia il valore (su = di più). Maiusc = passi da dieci, Alt = passi fini. Una girata di rotella è un solo colpo per l'annulla.

### Il rallentatore
- **Movimento fluido "mosso" rifatto: vero flusso ottico**. Il movimento si stima su più scale (dal grossolano al fine) da A verso B e da B verso A, con confronto su finestre da 5×5 campioni, correzione a mezzo pixel e una passata che livella; poi A e B si spostano verso il punto giusto del tempo e dove non combaciano si torna allo sfumato. Su una scena di prova con movimento noto il fotogramma ricostruito è **fino a 8-10 dB più vicino al vero** (prima era appena meglio dello sfumato, e per i movimenti piccoli anche peggio).

### Le animazioni
- **Le animazioni si adattano al testo**: la scheda "Segui" si allarga con il nome e con la scritta del pulsante (il pulsante non copre più il nome), "Iscriviti" idem; tutti i sottopancia, "Segui", "Iscriviti" si rimpiccioliscono da soli se il testo è così lungo da uscire dallo schermo; post, notifica, barre, progresso, anello, contatore e le cerimonie accorciano o rimpiccioliscono i testi che non ci stanno. Nei formati stretti (verticale, quadrato) l'animazione si disegna su una tela virtuale più larga e si rimpicciolisce tutta insieme, invece di uscire dai bordi.

### Gli aggiornamenti
- **Aggiornare non disinstalla più**: il setup parte in modalità aggiornamento (`/UPDATE /P /R`): niente domanda "disinstalla prima di installare", si installa sopra la versione che c'è (impostazioni, file associati e collegamenti restano), si vede solo l'avanzamento e alla fine l'app si riapre da sola.
- **Meno rosso su GitHub**: le due prove che a volte fallivano sulla CI (annulla/ripeti nella barra e l'anteprima del telecomando) aspettavano troppo poco su macchine lente (gli avvisi del banco partono a ogni fotogramma disegnato); ora aspettano quanto serve. Era la causa delle "X" rosse dopo ogni uscita.

### Per chi ha curiosità
- Nuovi: `src/ui/rotella.ts`, `conAdatta`/`muto`/`accorcia` in `src/render/anim/base.ts` (la scheda si "disegna a vuoto" con un contesto muto per misurarla), `LARGA_MIN` in `src/render/animazioni.ts`, `FL` (flusso ottico) in `src/render/fluido.ts`. Prove nuove in `test/prove-correzioni.mjs`.

## [1.3.2] — 2026-10-14 · La barra bianca e il telecomando con l'anteprima 🎛️

### La barra del titolo, bianca
- **In alto c'è una barra bianca, sempre**, anche se Windows è in modalità scura. Nell'app per Windows prende il posto della barra del sistema: si trascina, col doppio clic si ingrandisce e ha i suoi tasti riduci, ingrandisci e chiudi. Sul Mac i tre semafori stanno sopra la nostra barra, a sinistra.
- **Dentro ci sono le cose rapide**: il marchio, **Progetti**, **Salva**, **Importa**, **Annulla** e **Ripeti** (che dicono cosa annullano e si spengono quando non c'è niente), il **nome del progetto** col puntino delle modifiche e il formato, la **ricerca** (Ctrl+K) e gli aggiornamenti.
- **La testata respira**: restano i menu, il tasto ✨ AI, le quattro pagine al centro ed **Esporta** a destra. Prima era troppo piena e sui portatili le scritte sparivano presto; ora le etichette delle pagine restano anche su finestre più strette.
- Pagina iniziale, dialoghi e ricerca si aprono sotto la barra, così la finestra si sposta e si chiude anche quando sono aperti. Il titolo della finestra ha il nome del progetto (col pallino se ci sono modifiche da salvare).

### Il telecomando di LIVE
- **Quasi quadrato e sempre in primo piano**, con l'**anteprima di quello che stai registrando** (e la webcam nel suo angolo), il tempo grande con la spia REC, **PAUSA/RIPRENDI** grande (con la scritta "in pausa" sopra l'anteprima), **SEGNA** (conta i segni), **⇄ FINESTRA** quando registri più finestre e **FERMA**.
- Un clic sull'anteprima (o sull'occhio) la spegne o la riaccende, e la scelta si ricorda. I tasti di LIVE (Spazio, M, F, 1-9) valgono anche dentro al telecomando.
- Nel browser (Chrome, Edge) è una finestrella Picture-in-Picture; nell'app è la finestra che si fa piccola e si mette sopra alle altre, e torna com'era quando premi ⤢ o FERMA.

### Sistemato
- SEGNA aggiornava il contatore del telecomando solo al giro dopo dell'orologio: ora subito.

### Per chi ha curiosità
- Pezzi nuovi, presi da `app.ts` (da 469 a 305 righe) e `live.ts`: `src/ui/barraTitolo.ts` (la barra), `barraMenu.ts` (le tendine), `menuBanco.ts` (le voci dei menu), `disposizione.ts` (bordi e pannelli che si ricordano), `telecomando.ts`.
- Finestra: `"theme": "Light"`; `tauri.windows.conf.json` e `tauri.linux.conf.json` tolgono la cornice (`decorations: false`), `tauri.macos.conf.json` fa la barra del sistema trasparente (`titleBarStyle: Overlay`). Permessi nuovi per riduci/ingrandisci/chiudi/trascina.
- Prove nuove in `test/prove-banco.mjs`. **Nota onesta**: la finestra senza cornice di Windows e i semafori del Mac non si possono provare da qui (le prove girano nel browser): provale tu sull'app.

## [1.3.1] — 2026-10-07 · Il play non si ferma più sui computer lenti ▶️

Una versione piccola, con due correzioni trovate guardando le prove automatiche dopo l'uscita della 1.3.0.

### Sistemato
- **Sui computer lenti il play poteva restare fermo per secondi, o andare nero**, soprattutto con le registrazioni LIVE e le riprese con pochi fotogrammi chiave. Se un giro di disegno durava più di un secondo e mezzo (un computer lento, la scheda video che arranca, la pagina ferma un attimo), il programma credeva che il flusso del video non servisse più e lo buttava: quello nuovo doveva ripartire dal fotogramma chiave, anche 20 secondi prima, e intanto il monitor restava sull'immagine di partenza. Dopo 8 secondi spariva anche quella, e il monitor andava nero. Ora un flusso si butta solo se intanto si sono disegnate *altre* cose senza di lui (la clip è finita), e chi presta l'immagine di ripiego resta vivo finché serve. Col processore rallentato 6 volte: prima 4 play su 6 restavano fermi (uno andava nero), ora 6 su 6 si muovono da subito.
- **La versione prova su GitHub Pages non si aggiornava**: GitHub scambiava il nome di una classe dentro la libreria AI (`Mistral3ForConditionalGeneration`) per una chiave segreta e bloccava la pubblicazione. Sul sito di prova la libreria AI arriva dalla CDN, come prima della 1.3.0; le app per Windows e Mac la tengono dentro.

### Per chi ha curiosità
- `src/media/fotogrammi.ts`: `ultimaRichiesta` (l'ultima volta che si è chiesto un fotogramma) è l'orologio di `pulisci()`; tetto di 6 s per i flussi e 20 s per le ricerche. Prova nuova: la pagina ferma 1,8 s non fa buttare il flusso che si guarda, e uno che non serve più si chiude ancora.
- `.github/workflows/pages.yml`: toglie `dist/ai` prima del push su `gh-pages`.
- Le prove registrano lo stack degli errori anche dalle pagine aperte a parte.

## [1.3.0] — 2026-10-07 · Tutto si trova, l'AI non si ferma 🔍✨

La versione per chi usa DaProd Video tutti i giorni: le funzioni AI che davano errore ora partono (e se una strada non va ne prendono un'altra da sole), e ogni strumento si trova in un attimo, con la spiegazione di come si usa.

### L'AI che non si ferma
- **I sottotitoli col motore NVIDIA non partivano nell'app**: l'app scaricava la versione 0.1.0 di NeMo-Speech.cpp, che **non ha mai avuto i programmi pronti da scaricare**, e finiva in "lo scarico non è riuscito". Ora usa la **0.2.0** (controllata riga per riga: nomi degli archivi, impronte, comandi `transcribe`, `synthesize`, `pull`).
- **Se il motore NVIDIA non parte, i sottotitoli passano da soli a Whisper** (prima ci si fermava con un errore). Se la versione per la scheda video si ferma, si riprova **sul processore**.
- **"Togli lo sfondo" dava "Could not locate file"** sul computer senza scheda video: la libreria cercava una versione del modello (q8) che per MODNet e BiRefNet non esiste. Ora il tipo del modello si dice sempre e, se un tipo manca, **si prova il successivo** (q8 → fp16 → fp32). Vale anche per Whisper e la traduzione.
- **Se la scheda video si ferma a metà lavoro** (WebGPU), il modello si ricarica sul processore e lo stesso pezzo si rifà: prima tutta la trascrizione si fermava.
- **La libreria AI e il suo motore stanno dentro l'app** (transformers.js 4.3.1 e ONNX Runtime): niente più download dalla CDN a ogni avvio, che su reti lente o aziendali faceva fallire tutto. La CDN resta come riserva.
- **Un worker AI che si blocca non blocca più la funzione per sempre**: prima, dopo un errore di memoria, sottotitoli e traduzione restavano appesi fino al riavvio del programma.
- **Gli errori si capiscono**: "Failed to fetch" diventa "serve internet la prima volta", "Could not locate file" diventa "il modello non si trova, provane un altro", la memoria finita suggerisce il modello più leggero, e così via.
- La voce in cinese del motore NVIDIA non c'è nelle versioni che NVIDIA pubblica già pronte: ora lo si dice chiaro invece di un errore tecnico.

### Il Centro AI (menu **AI**, pulsante **✨ AI** in alto)
- **Tutte le funzioni intelligenti in un posto**: sottotitoli automatici, traduzione, voce AI, togli lo sfondo, segui un oggetto, montaggio automatico, colore automatico. Per ognuna: **cosa fa, come si usa in tre passi, cosa serve** ("prima servono i sottotitoli", "solo nell'app"…), se il **modello è già sul computer** e il pulsante **Usa** che porta dritto al punto giusto (e lo fa lampeggiare).
- **🔍 Controlla l'AI**: prova davvero il motore AI su questo computer (senza scaricare niente), dice se c'è la scheda video, se Hugging Face si raggiunge, quali modelli sono già scaricati e com'è messo il motore NVIDIA, con cosa fare se qualcosa non va.
- **Impostazioni**: la scheda video per l'AI si può spegnere (su alcuni computer c'è ma sbaglia), **Libera lo spazio** dei modelli scaricati, **togli il motore NVIDIA**.

### Trovare tutto
- **Cerca un comando (`Ctrl+K`, o 🔍 Cerca in alto)**: scrivi quello che vuoi fare — "rallenta", "sottotitoli", "togli lo sfondo", "tendina cuore", "neon" — e lo trovi, col suo tasto accanto. Dentro ci sono **tutti i comandi, le pagine, le funzioni AI, le 50 transizioni, gli effetti a tempo e sulla clip, i titoli, le 49 animazioni, i countdown e le guide**. Capisce anche senza accenti e coi sinonimi ("slow motion" → velocità). `Invio` lo fa davvero: la transizione va sul taglio, il titolo al cursore, l'effetto sulla clip scelta (e se manca la clip te lo dice).
- **Come si fa (`F1`)**: 22 guide brevi — il primo montaggio in un minuto, tagliare, spostare, transizioni, effetti, titoli, movimento, velocità, audio, sottotitoli, lingue, sfondo, tracking, DaProdMontage, colore, export, progetti, LIVE, più timeline, "se un'AI non parte" — ognuna coi passi e il pulsante **Fallo adesso**. I tasti restano in Aiuto → Tasti.
- **La pagina iniziale** ha "Impara a usarlo" (il primo montaggio, la guida, la ricerca, il Centro AI); il pannello Proprietà vuoto ha i pulsanti Cerca e Come si fa.
- **I comandi sono tutti in un registro solo**: Salva, Importa, Esporta, le pagine, la vista e l'aiuto hanno ora lo stesso nome nei menu, nella ricerca e nella finestra dei tasti.
- **Vista → Copie leggere**: scegli quando farle (da sole, sempre, mai) e **svuotale**; **Vista → Svuota la memoria delle misure**. Esistevano dentro il programma ma non c'era modo di arrivarci.

### Sistemato
- **La testata non esce più dallo schermo**: sui portatili (1366, 1440, 1536 pixel) il tasto **Esporta** finiva fuori dalla finestra. Ora la testata si stringe a gradini e tutto resta in vista, da 920 a 2200 pixel.

### Per chi ha curiosità
- `src/media/libreriaAI.ts` (libreria locale, dispositivi, tipi con ripiego), `erroriAI.ts`, `diagnosiAI.ts` + `provaAI.worker.ts`; `scripts/ai-locale.mjs` prende transformers.js e ONNX Runtime dal registro npm (impronta sha512 controllata) prima di ogni build; `src/ui/cerca.ts` + `fontiCerca.ts`, `guida.ts`, `centroAI.ts`.
- Prove nuove in `test/prove-aiuto.mjs`. **Nota onesta**: i modelli veri (Whisper, NLLB, BEN2, MODNet, SAM) e il motore NVIDIA non si possono scaricare dal luogo dove si prova; le prove usano librerie e motori finti con lo stesso protocollo. Il **motore AI vero** (la libreria e ONNX Runtime) invece è provato davvero: parte dai file dell'app e fa i conti giusti.

## [1.2.1] — 2026-10-07 · Le rifiniture: più sicuro, più preciso, niente sorprese 🔧

Una versione di pulizia: nessuno strumento nuovo, ma tante piccole cose che prima potevano andare storte.

### Salvare senza paura
- **Il progetto si salva in modo sicuro** (nell'app): si scrive accanto e poi si sostituisce, così se il programma o il computer si fermano a metà il progetto di prima resta intero. Prima il file si svuotava e si riscriveva: un'interruzione poteva lasciarlo rovinato.
- **Se il salvataggio non riesce lo dice** (disco pieno, cartella protetta, chiavetta tolta), con l'invito a usare *Salva come…*. Prima non compariva niente e sembrava salvato.
- **Ricollegare i file mancanti ora resta nel progetto**: il percorso nuovo si salva (prima, chiudendo senza altre modifiche, al giro dopo il file risultava di nuovo mancante).
- **Una modifica che si rompe a metà non lascia il montaggio mezzo cambiato**: si torna a com'era.
- L'autosalvataggio scrive solo quando è cambiato qualcosa (prima riscriveva tutto il progetto ogni 15 secondi finché non salvavi).
- Nel browser: **"Nuovo progetto" non butta più i file dei progetti recenti** (riaprendoli dalla pagina iniziale mancavano), e le copie dei progetti usciti dall'elenco si tolgono da sole. Togliere un file dal contenitore e poi Ctrl+Z lo ritrova anche dopo aver riaperto il browser.

### Montaggio più preciso
- **Tagliare (tasto 1) una clip che si muove** — per esempio una foto col Ken Burns di DaProdMontage, o una clip con le tappe — ora **continua il movimento dov'era**: il pezzo di sinistra fa la prima parte della strada e quello di destra il resto. Prima tutti e due ripartivano da capo e l'immagine "tornava indietro" sul taglio.
- **Copia e incolla portano anche gli effetti e le transizioni** che stanno sulla clip (e la seguono anche se finisce su un'altra traccia). Prima restavano indietro.
- **Abbina fotogramma (F)** porta la sorgente al fotogramma giusto anche nelle clip accelerate o rallentate.
- Dopo il taglio (tasto 1) viene scelto sempre un pezzo di clip, mai un blocchetto FX che finiva lì per caso (premendo 2 spariva l'effetto invece dello scarto).
- **Loop (Ctrl+L) senza attacco e stacco**: rifà tutto il montaggio da capo (prima si fermava in fondo).

### Riproduzione
- **Niente più lampi neri durante il play**: quando la lettura del video ripartiva a metà (un salto al fotogramma chiave più avanti, o la copia leggera che diventa pronta mentre suona) per un attimo il monitor diventava nero o tornava al fotogramma di quando avevi premuto play. Ora resta l'ultimo fotogramma vero finché arriva il nuovo.

### Export
- **L'audio esportato non ha più cuciture ogni 10 secondi**: il mixaggio si fa a pezzi, e a ogni pezzo filtri (voce, radio, ovattato), eco e limitatore ripartivano da zero, con un piccolo scatto e la coda dell'eco tagliata. Ora ogni pezzo parte "già caldo".
- **La finestra Esporta resta aperta mentre lavora**: Esc o un clic fuori la chiudevano lasciando l'export a girare senza modo di fermarlo. Si ferma col tasto Annulla.
- **"Fatto" chiude la finestra** a export finito (prima lo faceva ripartire da capo, con la richiesta di dove salvare).

### Tasti e pagine
- **Ctrl+Alt+A aggiunge di nuovo una traccia audio**: lo stesso tasto era preso anche dall'animazione, che ora sta su **Ctrl+Alt+N**.
- **Con la pagina iniziale aperta i tasti non toccano il montaggio che sta sotto** (prima Spazio lo faceva suonare e 2 toglieva una clip senza vederla). Valgono Esc, Ctrl+O e F11.
- Sul telefono gli avvisi stanno sopra la barra delle attività e i pulsanti in basso (prima li coprivano).
- Le copie leggere (proxy) in pausa perché il montaggio suona ora si fermano subito col ✕ del centro attività.

### Per chi ha curiosità
- Prove nuove in `test/prove-rifiniture.mjs` (girano dentro `node test/prove.mjs`, o da sole con `node test/prove-nuove.mjs rifiniture`): falliscono sulla 1.2.0 e passano qui.

## [1.2.0] — 2026-10-03 · La prima release ufficiale: più veloce, più chiaro, la barra delle attività ⚡

Questa versione non aggiunge strumenti: rende **più fluido e più chiaro quello che c'è già**.

### La barra delle attività (in basso a destra)
- Tutto quello che il programma fa dietro le quinte — **riaprire i file di un progetto, forme d'onda, colore automatico, copie leggere (proxy), conversioni a velocità costante, sottotitoli, voce e traduzione con l'AI, togliere lo sfondo, import e pacchetti** — ha **una riga sola nel centro attività**. In basso a destra c'è sempre **una barra** con cosa sta facendo, la percentuale e il tempo che manca; se le cose da fare sono più di una compare **+N**.
- **Un clic sulla barra apre il pannello**: per ogni attività la barra di avanzamento, **quanto è passato, quanto manca**, e per i gruppi "12 fatti · 2 al lavoro · 26 in coda"; sotto, **le finite da poco** (con quanto ci hanno messo). **✕** ferma una riga, **⏸ Pausa** non fa partire lavori nuovi, **Pulisci** toglie le finite, Esc chiude. Sul telefono la barra sta sopra i pulsanti in basso.
- Le barre del Finale, di DaProdMontage e del ritaglio con l'AI (e quelle che comparivano in un riquadro sopra l'interfaccia) ora **stanno tutte qui**.

### Riaprire un progetto con tante clip (era lento e a scatti)
- **I file si riaprono quattro alla volta, e prima quelli che stanno in timeline** (prima uno per volta, nell'ordine del contenitore). Con file nuovi: 3 volte più veloce; **riaprendo un progetto già visto: da 12 secondi a 0,2** (14 riprese).
- **Le misure già fatte si ricordano** (forma d'onda, colore automatico e locandina di ogni file, in un deposito a parte del browser/app: Vista → svuota copie leggere non lo tocca). Se il file è lo stesso, non si rifanno.
- **I lavori di fondo vanno a turno**, non tutti insieme: due leggeri alla volta (forme d'onda, colore) e **una sola copia pesante alla volta** (ferma finché il montaggio suona), e passa avanti chi sta in timeline. Prima, riaprendo un progetto con 90 riprese, partivano decine di decodifiche insieme e il programma scendeva a 5 fotogrammi al secondo.
- **La copia leggera (proxy) si fa solo per le riprese che stanno in timeline**: quelle che stanno solo nel contenitore aspettano (prima se ne facevano 96 per niente). Se ne metti una in timeline parte da sola; se la copia c'è già sul disco si usa subito.
- **Il contenitore non salta più**: mentre i file si riaprono e le forme d'onda crescono, le schede si aggiornano **al loro posto** (prima si rifaceva tutta la griglia a ogni passo e la pagina tornava in cima).

### File a velocità costante, dietro le quinte
- Un file a frame rate o bitrate variabile **entra subito** com'è e si lavora subito; **la copia a velocità costante si fa dietro le quinte** (una alla volta, col suo avanzamento, in pausa mentre il montaggio suona) e **prende il posto dell'originale** da sola quando è pronta: clip, segni e proprietà restano dove sono, e Annulla non rimette i dati vecchi. L'originale non si tocca. Prima l'import aspettava la conversione.

### Altro
- Sistemata la lettura dei pixel per il colore e la locandina (fuori dal thread principale dove si può), meno attese all'interfaccia.

## [1.1.6] — 2026-10-02 · Pagina iniziale, scelta multipla nel contenitore, voce in altre lingue (anche cinese), file a velocità costante 🗂

### Pagina iniziale: i tuoi progetti
- All'apertura (o dal tasto **Progetti** in alto, o File → Pagina iniziale) vedi **i progetti recenti con la miniatura**, **Nuovo progetto** (HD, 24p/30p, verticale, quadrato, 4K), **Apri un progetto…**, **DaProdMontage** e **Continua** il montaggio in corso. Un clic su un recente lo riapre; la ✕ lo toglie dall'elenco (il file resta dov'è). Esc chiude. Quello che salvi o apri finisce da solo nell'elenco (nel browser il programma tiene anche una copia per riaprirlo).

### Contenitore
- **Scelta multipla**: **Ctrl+clic** aggiunge o toglie un file, **Maiusc+clic** prende un tratto, clic nel vuoto toglie la scelta. **Trascinando** uno dei file scelti li porti tutti nella timeline, **uno dopo l'altro** (anche in una cartella, o col tasto destro: in coda al cursore).
- I file **già in timeline hanno un bordo verde** (con il numero di volte che ci sono); quelli scelti, un bordo oro.
- **Aggancio dopo una clip**: lasciando un file sulla seconda metà di una clip si mette **subito dopo di lei**; più in generale il file si aggancia a inizi e fini delle clip con una calamita più larga (14 px), e **il fantasma che vedi mentre trascini è già nel punto giusto**, non solo quando lasci.

### DaProdMontage
- **Il monitor è più piccolo** (poco più di un quarto dello schermo): più posto alle scelte e ai file.
- **I video si guardano prima di sceglierli**: passandoci sopra con il mouse scorrono (con il tempo), e la **lente 🔍** li apre nel monitor in alto con il play.
- **Foto e video di un formato diverso dal progetto**: scegli **Intere, con lo sfondo** (nessun pezzo tagliato) oppure **Riempi il quadro** (a tutto quadro, tagliando i bordi). Non vengono mai stirati: nelle prove un cerchio resta un cerchio in 16:9, 9:16 e 1:1.
- Sistemato: con nessun pannello aperto o chiuso (nessuna classe sul banco) la griglia della pagina Montage non scattava.

### Voce e lingue (Finale)
- **Il cinese** fra le lingue della voce (Mandarino, `zh-CN`).
- **Se la voce parla un'altra lingua dei sottotitoli, i testi si traducono da soli prima di essere letti** (prima una voce inglese leggeva il testo italiano con l'accento sbagliato). I sottotitoli restano come sono: puoi avere sottotitoli in una lingua e voce in un'altra.
- **Traduci i sottotitoli**: scegli la lingua e le righe si traducono ai loro tempi (Ctrl+Z per tornare). Il traduttore è **NLLB-200 di Meta** (nove lingue: italiano, inglese, spagnolo, francese, tedesco, portoghese, cinese, giapponese, arabo); gira sul tuo computer e si scarica la prima volta (il modello è grande: circa 600 MB).
- **La voce AI è una clip per frase**: ogni frase sta al suo posto nella traccia "Voce AI" e si sposta, si abbassa, si taglia o si toglie come ogni altra clip. **Un clic su una riga dei sottotitoli sceglie la sua voce**, e il pannello a destra mostra volume e il resto.
- **Finale più semplice**: la pagina si chiama **Voce e lingue** e ha due passi (1 · Sottotitoli: in che lingua sono e traduci; 2 · Voce: scegli la voce e la lingua, e un tasto). Le scelte che quasi nessuno cambia (chi ascolta, il modello) stanno in un riquadro chiuso nei Sottotitoli.

### File a velocità costante (importazione)
- Un **video a frame rate variabile (VFR)**, come quelli dei telefoni, si rifà da solo a **frame rate costante** all'importazione (se no in montaggio audio e video slittano); un **brano a bitrate variabile (VBR: MP3, Opus, Vorbis)** si rifà a **bitrate costante**. Si converte solo se serve davvero, l'**originale non si tocca** (la copia va in Video/DaProd Video nell'app, in memoria nel browser) e il programma te lo dice. Per spegnere: `localStorage dpv-normalizza = no`.

### Per chi ha curiosità
- Dentro: `src/ui/home.ts` + `registraRecente`/`apriRecente` in `src/progetti.ts`; `src/media/traduci.ts` (+ worker); `src/media/normalizza.ts`; `componiVoceConPosti` e `posaVoce` con le clip per frase in `src/media/doppiaggio.ts`; `Sottotitolo.voce`.
- Prove nuove in `test/prove-seguito.mjs`. **Nota onesta**: i modelli di traduzione (NLLB) e la voce cinese di Magpie non sono stati provati con i modelli veri (dal luogo dove si prova non si raggiungono Hugging Face né i modelli NVIDIA): le prove usano un traduttore e un motore finti con lo stesso protocollo. Il cinese per la voce dipende dalla versione del motore di NVIDIA installata.

## [1.1.5] — 2026-10-01 · DaProdMontage con l'anteprima in alto, ogni montaggio diverso, proprietà riordinabili 🎲

### DaProdMontage: prima lo guardi, poi lo importi
- **L'anteprima sta in alto, nel monitor**: premi **✨ CREA IL MONTAGGIO** e il montaggio parte da solo lì sopra, con tutti i comandi del monitor (play, scorri, fotogramma). La timeline non si tocca finché non sei contento.
- **🎲 RIGENERA**: un altro montaggio con le stesse scelte, tutte le volte che vuoi. **✅ IMPORTA NELLA TIMELINE** lo tiene (resta come scheda nuova, da ritoccare) e **✖ Scarta** toglie l'anteprima e torna a com'era. Rigenerare non accumula timeline: l'anteprima di prima si toglie da sola. Se premi Ctrl+Z i bottoni tornano a "Crea".
- **Ogni volta è originale** anche con le stesse impostazioni: a ogni generazione cambiano i movimenti delle foto (mai due uguali di fila), quanto sta ognuna, le transizioni (anche qualcuna fuori dalla lista dello stile, ma del suo ritmo), quando cadono gli effetti e le animazioni sopra, quali foto restano fuori o si ripetono se sono troppe o poche. Il tempo totale resta quello chiesto, al fotogramma.
- Ogni montaggio ha il suo codice (**Variante K7F2Q**): lo stesso codice dà lo stesso montaggio (utile per le prove e per ritrovarne uno). Le misure delle foto e il ritmo del brano si fanno una volta sola, quindi rigenerare è veloce.
- **Sistemato**: con il pannello Proprietà fissato (📌) la pagina Montage si apriva con la griglia rotta (una zona nera in alto e le colonne in fondo). Ora è a posto in ogni combinazione di pannelli aperti e chiusi. Sul telefono l'anteprima resta visibile sopra le scelte, e c'è il tasto **Monta** nella barra.

### Proprietà: tutto chiuso e riordinabile
- **Di partenza tutte le sezioni sono chiuse**: scegli una clip e vedi l'elenco; apri solo quello che ti serve (una volta aperta resta aperta passando da una clip all'altra).
- **Trascina la maniglia ⠿** a destra di ogni sezione per spostarla: l'ordine si **ricorda per ogni tipo di elemento** (immagine, video, audio, titolo, animazione, generatore, effetto a tempo, transizione), anche chiudendo e riaprendo il programma. Il bottone **↺ Ordine di partenza** in fondo lo rimette com'era per quel tipo.

## [1.1.4] — 2026-10-01 · Togliere lo sfondo, animazioni personalizzate e DaProdMontage ✨

> 🤖 **Android in pausa**: questa versione esce per Windows e Mac (e nel browser).

### Togliere lo sfondo (Proprietà → Sfondo, e il tasto SFONDO sul monitor)
- **Green screen col colore che vuoi**: fino a **3 colori** da togliere insieme, il **contagocce** (clic sull'immagine del monitor), **«Trovalo da solo»** (guarda i bordi e prende il colore del fondale), via il **riflesso verde** sul soggetto, **bordo** (restringi/allarga), **sfumatura** e **pulizia** dei puntini. Sopra il monitor puoi guardare la **maschera** o gli **scacchi** per controllare il lavoro.
- **Con l'AI, senza fondale**: tre modi. **Soggetto** (qualunque cosa in primo piano, capelli compresi: BEN2 o BiRefNet), **Persona** (MODNet, velocissimo anche senza scheda video) e **Oggetti**: *clicchi* sull'oggetto (verde; **Alt+clic** su quello che non vuoi, rosso) e il modello (SAM 2.1, o SlimSAM sui computer lenti) lo ritaglia, poi lo **segue da un fotogramma all'altro**.
- La maschera si calcola a 4, 8 o 12 al secondo (Veloce, Buona, Alta) e fra una e l'altra si **mescola**, così il bordo non tremola; il risultato resta salvato sul computer, e **nel video esportato è identico** a quello che vedi nel monitor.
- I modelli sono tutti open source (MIT/Apache-2.0) e si scaricano **una volta sola**, al primo uso. Se uno non si trova, ne prova un altro.

### Animazioni personalizzate (Generatori → Animazioni, e nel contenitore)
- **49 animazioni** in sei gruppi: sottopancia, testi che si muovono, numeri e grafici, social e chiusure, fondi e luci, cerimonie e feste. Niente AI e niente file da scaricare: ognuna è un disegno calcolato **per ogni fotogramma**, quindi nel monitor e nell'export è uguale.
- Si **personalizzano dal pannello**: testi, colori, caratteri (Montserrat, Oswald, Archivo Black, Bebas Neue, Space Mono, Great Vibes, Caveat, Playfair Display, Cormorant, tutti con licenza libera e dentro l'app), durata, e la posizione si sposta sul monitor come per ogni clip. Il testo si **adatta da solo** alla riga.
- Il catalogo si ispira a quello di [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), ridisegnato per il nostro motore.

### DaProdMontage: la quarta pagina (tasto **F8**) 🎞
- **Butti dentro foto e video alla rinfusa** (anche **solo foto**), scegli **cosa festeggi**, quanto deve durare, e il programma **monta da solo**: ordina, decide quanto sta ogni foto, le muove (zoom e panoramiche piano), mette le transizioni, i titoli, quello che cade sopra (cuori, petali, coriandoli…) e gli effetti sui tagli.
- **28 stili pronti**, in sette categorie: Cerimonie (matrimonio romantico, proposta, battesimo, prima comunione, cresima, laurea, anniversario), Famiglia (nascita, baby shower, Natale, ricordi di famiglia, in ricordo di…), Feste (compleanno, 18 anni, addio al celibato/nubilato, Capodanno, recita), Viaggi e natura, Sport e serate, Social e lavoro (reel verticale, prodotto, festa in azienda) e Ricordi, più il matrimonio da film e la presentazione classica. Ognuno sa quanto tenere le foto, come muoverle, le sue transizioni, i colori e il titolo da mettere.
- **Il tempo è esatto**: le durate si ripartiscono in modo che la somma sia il tempo chiesto, al fotogramma. Se le foto sono troppe per quel tempo tiene le migliori (le **sfocate, buie o doppie** da raffica vengono lasciate fuori e te lo dice); se sono poche per riempirlo, le **ripete** invece di lasciare buchi.
- **Ordine**: per data di scatto (dall'**EXIF** delle foto, se no dal file), a caso (lo stesso mazzo dà sempre lo stesso risultato) o come le hai messe. Per i video prende il **pezzo più bello**.
- **A tempo di musica**: aggiungi un brano e il programma ne cerca i **battiti** e ci appoggia i tagli. Senza musica il montaggio resta muto (consiglia lo stile di brano).
- Il risultato è una **timeline normale** (una scheda nuova): ritocchi tutto come sempre, e premi **Esporta**. Le scelte si ricordano.

### Per chi ha curiosità
- Dentro: `src/core/montage.ts` (il piano), `montagePreset.ts` (gli stili), `src/media/exif.ts`, `qualita.ts`, `ritmo.ts`, `src/ui/montage.ts` (la pagina); `src/core/animazioni.ts` e `src/render/anim/*`; `src/core/sfondo.ts`, `src/media/ritaglio.ts` e il suo worker.
- Prove nuove in `test/prove-nuove.mjs`, `prove-animazioni.mjs` e `prove-montage.mjs`. **Nota onesta**: dal luogo dove si provano non si raggiungono Hugging Face e la rete dei modelli, quindi i modelli veri non sono stati provati con un'immagine vera: le prove usano un ritaglio finto e una libreria finta che rispetta lo stesso protocollo.

## [1.1.3] — 2026-09-30 · Velocità delle clip, movimento fluido, voce e sottotitoli con NVIDIA, cursore che si aggancia 🚀

> 🤖 **Android in pausa**: questa versione esce per Windows e Mac (e nel browser).

### Velocità: velocizza e rallenta le clip
- **Alt+E** (o **tasto destro → Velocità**) sulla clip scelta, o su quella sotto il cursore: una finestra con la percentuale (da 5% a 3200%), il cursore a scala logaritmica, i tasti pronti (÷10, ¼, ½, ¾, 1×, 1,5×, 2×, 4×, 8×) e la durata di prima e di dopo. Nel menu ci sono anche i rapidi *Rallenta a 25% / 50%*, *Velocizza a 200% / 400%* e *Velocità normale*. Sulla clip in timeline si legge **⏩×0,5**.
- Si usa sempre lo stesso pezzo di ripresa: a ×2 dura la metà, a ×0,5 il doppio. Audio e video legati vanno insieme; dissolvenze e linee elastiche si accorciano o allungano con la clip. **Sposta le clip dopo** (di partenza acceso) fa scorrere il resto del montaggio; spento, la clip si ferma contro la vicina. Ctrl+Z torna a prima.
- **L'audio resta naturale**: la voce non diventa da paperino. Si stira col tono giusto (WSOLA, a flusso: va anche in riproduzione) nel monitor e nell'export; oppure scegli **Come un nastro** e cambia anche il tono.

### Movimento fluido nei rallentatori
- Quando una ripresa va piano lo stesso fotogramma resterebbe fermo per più fotogrammi e il movimento scatta. Ora, nella stessa finestra, il **Movimento** può essere: **Sfumato** (mischia il fotogramma prima e quello dopo) o **Mosso** (stima dove va ogni pezzo dell'immagine — 15×15 mosse provate per blocco, sulla scheda video — e sposta i due fotogrammi verso il punto di mezzo prima di mischiarli; dove la stima non è sicura torna allo sfumato). Sotto ×0,5 si propone da solo il "Mosso". Vale nel monitor e nell'export.

### Il cursore si aggancia ai tagli
- Passando col cursore (clic o trascina sul righello) vicino a un taglio, a un inizio o fine di clip, a un marcatore, all'attacco o allo stacco, **si aggancia** (12 px), e resta attaccato finché non ti allontani un po'. Prima si agganciava solo tenendo Maiusc. **Alt** lo lascia libero; **N** spegne la calamita.

### LIVE: voce e audio del computer separati
- Con microfono **e** audio del computer accesi, ora vengono registrati in **due file**: il video col suono del computer, e il microfono a parte (interruttore *Voce e computer separati*, di partenza acceso). In timeline la voce va su un'**altra traccia audio**, nello stesso punto e legata allo schermo, così puoi livellare i volumi con i fader delle tracce. Spento, tutto resta mescolato in una traccia come prima.

### Effetti e transizioni particolari
- **13 effetti nuovi** (ora 72): Ologramma, Schizzo a matita, Miniatura (tilt-shift), Prisma, Tunnel infinito, Vetro smerigliato, Esagoni, Segnale perso, Iride che si chiude / si apre, Scansione, Nebbia, Braci.
- **10 transizioni nuove** (ora 56 effetti digitali): Pioggia digitale, Strappo, Vetro rotto, Sipario, Anelli, Segnale perso, Cola, Lente, Spettro, Cerniera.

### Sottotitoli con Nemotron 3.5 di NVIDIA
- Nel Finale, **Ascolta con → Nemotron 3.5 · NVIDIA** (nell'app): il riconoscimento del parlato streaming di NVIDIA, multilingua (italiano, inglese, spagnolo, francese, tedesco o **lingua automatica**), al posto del vecchio Whisper (che resta, e resta l'unico nel browser). Gira con **NeMo-Speech.cpp**, il motore di NVIDIA: sulla **scheda NVIDIA (CUDA)** se c'è, su Apple Silicon (Metal) e anche **solo sul processore**. La prima volta l'app scarica il motore (da 5 a 100 MB, secondo il computer) e il modello, e poi restano sul computer; l'audio non esce mai.

### Voce AI: cambia voce o lingua
- Nella pagina **Lingue e AI** si accende quella che era "presto": **🗣 Fai parlare i sottotitoli**. I sottotitoli (scritti dall'AI o da te, anche tradotti) vengono letti da una delle cinque voci di **Magpie TTS** di NVIDIA (John, Sofia, Aria, Jason, Leo) in italiano, inglese, spagnolo, francese o tedesco. Ogni frase va al suo posto (se è più lunga dello spazio che ha si accelera un po', col tono giusto); il risultato è un file audio su una **traccia nuova "Voce AI"** e le voci originali vanno in silenzio (si può togliere). Così cambi la voce di un parlato, o lo fai dire in un'altra lingua dopo aver tradotto i sottotitoli.

### La barra col tempo
- Ogni funzione lenta (installare il motore, scaricare i modelli, sottotitoli, voce AI) mostra la **barra**, la **percentuale**, il **tempo passato** e **quanto manca** (stimato dalla velocità degli ultimi secondi, così regge le fasi che vanno più piano di altre).

## [1.1.2] — 2026-09-30 · Big update: tappe di mezzo, tracking, effetti e transizioni a decine, LIVE con più finestre 🎯

> 🤖 **Android in pausa**: questa versione esce per Windows e Mac (e nel browser).

### Sistemato: gli effetti che si sommano ora si vedono tutti
- Prima, con più effetti sullo stesso punto, alcuni sparivano: **sfoca + zoom sfocato** mostravano solo la sfocatura, e con i **colori sdoppiati** (o il glitch, o il VHS) la sfocatura restava solo sul verde. Adesso sfocatura, scia, colori sdoppiati, neon, bagliore ed eco lavorano nello stesso passaggio e si sommano davvero.

### Posizioni intermedie (tappe) per spostare clip ed effetti
- Il **↝ Movimento** non ha più solo partenza e arrivo: aggiungi tutte le **tappe** che vuoi con **＋** (o fermati fra due tappe e muovi: ne nasce una lì, come i fotogrammi chiave dei programmi grandi). La clip, o il mirino di un effetto, ci passa dentro con una curva morbida, senza scatti e senza sforare.
- Sul monitor vedi il **percorso** tratteggiato con le palline numerate: trascina una pallina per spostare la tappa, **－** la toglie, i pallini numerati nella barretta ci vanno.
- Vale per tutte le clip (video, immagini, titoli, colori) e per gli effetti col centro (bolla, vortice, zoom, riflesso…, e ora anche pizzico, gocce, occhio di pesce e raggi).

### Clicca qualsiasi cosa e ridimensionala come vuoi
- Ora ci sono **8 maniglie**: gli angoli ingrandiscono tenendo ferma la parte opposta, i **lati stirano** da una parte sola (larghezza e altezza separate). **Maiusc** sugli angoli stira, **Ctrl** allarga dal centro, **Alt** toglie gli agganci. Si aggancia ai bordi e al centro del quadro.
- **✂ Ritaglia**: acceso, i lati e gli angoli ritagliano l'immagine invece di stirarla.
- **Ctrl+clic** sull'immagine sceglie la clip che sta *sotto* quella scelta (di nuovo, la successiva). Nelle proprietà c'è anche **Larghezza (stira)**.

### Tracking di un oggetto 🎯
- Scegli una ripresa, metti il cursore dove l'oggetto si vede bene, premi **🎯** sul monitor e trascina il **mirino** sopra l'oggetto: **▶ Avvia** lo segue fotogramma per fotogramma, avanti e indietro (correlazione normalizzata, regge ai cambi di luce; la tesserina si adatta se l'oggetto cambia). Il percorso azzurro resta sul monitor.
- Poi **titoli, immagini, colori e il centro degli effetti** possono *seguirlo*: nelle proprietà, "Segui un oggetto → Segue". Restano dove sono e da lì in poi lo inseguono; trascinandoli sul monitor cambi lo scarto dall'oggetto.
- **Stabilizza**: la ripresa si tiene ferma sull'oggetto (si sposta al contrario di quanto si muove lui).

### 23 effetti nuovi (ora 59)
- **Rapidi**: Eco visivo, Vibrazione. **Luci**: Raggi di luce, Bokeh, Scintille, Lente anamorfica. **Colore** (gruppo nuovo): Duotone, Posterizza, Solarizza, Termocamera, Visore notturno, Retino pop, Film muto. **Distorsioni**: Pizzico, Gocce, Occhio di pesce, Specchio, Quattro schermi, Rullo TV. **Particelle** (gruppo nuovo): Neve, Pioggia, Polvere sospesa, Coriandoli.
- Ogni blocco ha **Si ripete** (da 1 a 12 volte nella durata: tre lampi, cinque scosse…), e l'elenco dei colori scelti si è allargato (duotone, bokeh, scintille).

### Transizioni più ricche
- **22 nuove**: Pagina, Frantumi, Spinta veloce, Fette, Alveare, Onda d'urto, Nuvole, Fuoco, Rullino, Diaframma, Punti, Spirale, Doppia esposizione, TV che si spegne, Portoni 3D; e tendine SMPTE nuove: Diagonale opposta, Freccia, Freccia rovesciata, Croce, Onda, Zigzag, Ventaglio.
- Nelle proprietà di ogni transizione: **Intensità** (scia, onda, sfocatura più o meno forti), **Direzione** (l'effetto gira di 90°, 180°, 270°: il cubo che gira in verticale, la pagina che si volta dal basso…), **Come corre** (dolce, parte piano, arriva piano). Le voci che non servono a quel modello spariscono.

### Titoli migliori
- **9 stili nuovi**: Cascata (lettere che cadono e rimbalzano), Si compone (le lettere arrivano da lontano), Onda, Evidenziatore, Karaoke, 3D con spessore, Ombra lunga, Solo contorno, Notiziario a due targhe. E preset nuovi: Cinema con sottotitolo, Dedica, Capitolo.
- Ogni titolo ha ora un **sottotitolo** (la riga piccola sotto), **Entra / Esce** (dissolve, sale, scende, da sinistra o da destra, zoom, rimbalza) con qualunque stile, **spazio fra le lettere** e **spessore**. Nelle proprietà ora si trovano *tutti* gli stili (prima ne mancavano cinque).

### LIVE: cambia finestra mentre registri
- **Più finestre al volo** (da accendere prima di registrare: di partenza è spento, così la registrazione normale resta quella di sempre): con ＋ FINESTRA (tasto **N**) aggiungi altre finestre o schermi anche a registrazione in corso, e passi dall'una all'altra con un clic sulla miniatura o coi tasti **1-9** (⇄ sul telecomando). **L** cambia la disposizione: una sola, una grande e una piccola in **angolo**, due **affiancate**.
- Il file resta uno solo e la misura non cambia (è quella della prima finestra): la regia disegna quella in onda in una tela fissa, con un battito che non rallenta se l'app è coperta.

### I VU
- Il pannello a destra ha solo le **barre** (sinistro e destro, col picco che resta un attimo): occupano un terzo di prima.

## [1.1.1] — 2026-09-27 · Il play parte subito anche sulle registrazioni lunghe ▶

> 🤖 **Android in pausa**: questa versione esce per Windows e Mac (e nel browser).

### Riproduzione
- **Play da metà di una registrazione LIVE** (o di una ripresa con i fotogrammi chiave radi): parte subito da dove sei
  fermo, senza rifare da capo il lavoro che il monitor aveva già fatto per mostrarti quel fotogramma.
- Sistemato un difetto che al play buttava via il video già pronto: nei primi 60 ms l'orologio dell'audio tornava
  indietro di un soffio, e il video ripartiva dal fotogramma chiave (su quelle riprese: partenza lenta e immagine
  che saltava).

## [1.1.0] — 2026-09-27 · Sposti e ingrandisci sull'immagine, le cose si muovono, le transizioni si sommano 🎯

> 🤖 **Android in pausa**: questa versione esce per Windows e Mac (e nel browser).

### Sposta, ingrandisci e fai muovere, direttamente sull'immagine
- **Clic su quello che vedi nel monitor** e lo scegli: la ripresa, la bolla della webcam, il titolo, il colore.
- **Trascina** per spostarlo, **tira un angolo** per ingrandirlo o rimpicciolirlo, **il pallino in alto** lo gira. Si aggancia da solo al centro e ai bordi del quadro (e al 100%); con **Alt** è libero.
- **↝ Movimento**: accendilo dalla barretta sopra l'immagine e la clip ha **due posizioni**, quella d'inizio e quella di fine. Con **◀ Inizio** e **Fine ▶** vai all'una o all'altra e la sistemi; lungo la clip ci va piano piano, partendo e arrivando dolce. Sul monitor vedi il riquadro di arrivo, quello di partenza tratteggiato e la freccia del percorso.
- **Movimenti pronti** nelle proprietà: *Entra da sinistra*, *Entra da destra*, *Sale dal basso*, *Scende dall'alto*, *Si avvicina*, *Si allontana*, *Scivola (Ken Burns)*, *Gira e arriva*. ⟲ rimette tutto com'era.
- **Anche gli effetti hanno il loro centro**: la **bolla**, il **vortice**, il **caleidoscopio**, gli **zoom** e il **riflesso d'obiettivo** hanno un **mirino** sul monitor. Mettilo dove vuoi (la bolla sulla faccia, lo zoom su un dettaglio, il sole in un angolo); col **Movimento** parte da un punto e arriva a un altro.

### Le transizioni si sommano
- **Più transizioni sullo stesso taglio lavorano insieme**: il cubo che gira **e** il lampo **e** l'onda. Trascinane una sopra un taglio che ne ha già una e si aggiunge (prende la stessa durata); la stessa una seconda volta la toglie.
- Quelle che portano dalla vecchia alla nuova (cubo, spinte, tendine, dissolvenza) fanno il passaggio; quelle che sono "un effetto" (lampo, luce, onda, glitch, sfocata, vortice, mosaico…) si mettono **sopra**, così si vedono tutte.

### Sette transizioni nuove
- **Persiane** (le stecche girano una dopo l'altra), **Scacchiera** (le caselle si girano a caso), **Tuffo** (la vecchia si allontana girando), **Inchiostro** (la nuova si spande come una goccia nell'acqua), **Colori sdoppiati**, **Bolle**, **Rimbalzo** (la nuova cade dall'alto e rimbalza).

### Titoli nuovi, e anteprime vere
- **Sfumato** (lettere che sfumano da un colore all'altro, con l'alone), **Rivela** (il testo si scopre dietro una barra colorata), **Glitch** (colori sdoppiati che saltano), **Grande** (enorme, con due righe sottili), **Etichetta** (la pillola "NUOVO VIDEO" che salta dentro).
- Le schede dei titoli nel contenitore sono **disegnate col titolo vero**: quello che vedi è quello che esce.

### Il suono sta dentro la clip (una riga sola)
- **Titoli, countdown e colori portano il loro suono dentro**, come gli FX: niente più clip audio a parte. Sulla clip c'è l'**altoparlante**: clic = acceso/spento, tasto destro = scegli il suono (e passandoci sopra li senti).
- **Il countdown fa il bip dentro di sé**, uno a ogni numero.
- Ogni titolo nasce col suo suono giusto, spento: whoosh, **macchina da scrivere**, **neon che si accende**, **pop**, **ding**, impatto, glitch…
- Video e audio delle riprese restano come prima, su righe separate.

### Anteprime del contenitore sistemate
- Le anteprime al passaggio del mouse usano l'**immagine pulita** del montaggio al cursore: senza i titoli, gli FX e le transizioni che ci sono già (prima il titolo di prova finiva sopra quello vero, e un effetto sopra un lampo).
- Col cursore su un punto nero o vuoto prende il primo fotogramma buono poco più in là, invece delle immagini di prova "A/B".
- Le anteprime ferme delle transizioni non sono più tutte nere o tutte bianche (il passaggio al nero, la girata, il lampo): si fermano in un punto dove si capisce.
- Nei progetti verticali l'anteprima non si schiaccia più, e un'anteprima non resta a girare di nascosto.

### LIVE: l'audio del computer come si deve
- L'audio del sistema si prende **così com'è**, in stereo: niente cancellazione dell'eco, niente filtri anti-rumore, niente volume automatico (sono fatti per la voce e rovinavano musica e suoni).
- Col microfono insieme, il mixer parte al clic su REGISTRA (prima poteva restare spento e l'audio usciva muto o a singhiozzo), con un limitatore che non lo fa mai distorcere. Il VU mostra la somma.
- In Chrome/Edge c'è l'audio anche registrando **una finestra sola**.

## [1.0.7] — 2026-09-27 · Il pacchetto .daprod, LIVE con la webcam, il contenitore a cartelle e le dissolvenze che hanno una forma 📦

> 🤖 **Android in pausa**: questa versione esce per Windows e Mac (e nel browser). L'APK torna più avanti.

### Il pacchetto .daprod: il progetto con dentro tutti i suoi file
- **File → Salva il pacchetto .daprod (con tutti i file)**: il montaggio e tutti i video, le musiche e le immagini in **un file solo**. Lo porti su un altro computer, lo apri con DaProd Video (doppio clic o File → Apri) e ritrovi **tutto identico**.
- È uno **zip vero** (si apre anche con 7-Zip o Esplora risorse): dentro c'è `progetto.json`, la cartella `media/` e un LEGGIMI. I file entrano **così come sono**, senza perdere qualità, e DaProd li legge direttamente da dentro, senza scompattare niente. Funziona anche oltre i 4 GB.
- Si può mettere **solo quello che usi nel montaggio** (il contenitore si alleggerisce). Barra di avanzamento e tasto Annulla.
- **Cos'è il .dpv?** È il progetto "leggero" di DaProd Video (**D**a**P**rod **V**ideo): tiene il montaggio ma **non i file**, che restano dove sono sul tuo computer. Va bene per lavorare ogni giorno; il .daprod è per portarsi via tutto.

### LIVE: webcam, conto alla rovescia, segni, telecomando
- **La webcam**: accendila e la vedi subito nell'anteprima. Si registra **in un file suo** e finisce **sulla traccia sopra lo schermo**, come **bolla tonda** o **riquadro**, nell'angolo che scegli (↘ ↙ ↗ ↖). Dopo la sposti, la ingrandisci o la togli come una clip qualsiasi.
- **3-2-1 prima di partire**, grande sull'anteprima col suo bip (si spegne se non lo vuoi).
- **Tasti**: **R** registra, **Spazio** pausa e riprendi, **M** mette un **segno** (in timeline diventa un marcatore rosso: così ritrovi i punti importanti), **F** ferma.
- **Telecomando**: una barretta **sempre sopra le altre finestre** col tempo, pausa, segno e ferma. Registri un altro programma e comandi da lì (nel browser Chrome/Edge è una finestrella, nell'app la finestra diventa piccola e poi torna com'era).
- **Il VU del microfono** a LED (clic per provarlo prima di partire) e la **scelta di microfono e webcam** se ne hai più d'uno.
- **Qualità**: 720p, 1080p, 1440p o 4K, **30 o 60 fps**, cursore del mouse sì o no.
- **Stile presentazione**: lo schermo un po' più piccolo, **angoli tondi e ombra**, sopra uno **sfondo sfumato** (Notte, Tramonto, Mare, Prato, Carta, DaProd). Lo vedi già nell'anteprima mentre registri.
- Le registrazioni vanno nella **cartella Registrazioni** del contenitore e nella lista di LIVE **con la miniatura**. Schermo, audio, webcam e sfondo sono **legati**: si spostano insieme.
- Col pannello di destra fissato (📌) la pagina LIVE non si rompe più.

### Il contenitore come un esplora risorse
- **A sinistra l'albero**, a destra quello che c'è dentro: Tutti i file, Video, Musica, Immagini, **le tue cartelle** (anche una dentro l'altra) e la libreria con Transizioni, Titoli ed Effetti, ognuno coi suoi gruppi.
- **Le cartelle**: *Nuova cartella*, rinomina, elimina (i file non si cancellano: salgono di un piano). I file ci si **trascinano** dentro, o col tasto destro → *Sposta in*.
- **Importa dritto dove sei**: dentro una cartella il file entra lì; da **Video**, **Musica** o **Immagini** la finestra mostra solo quei file.
- Le schede si fanno **piccole, medie o grandi** col tasto in alto a destra.

### Transizioni ed effetti: più compatti, con le anteprime vere
- **Le anteprime usano il tuo montaggio**: passa col mouse su una transizione e la vedi fatta **fra il fotogramma dove sta il cursore e quello dopo il taglio**. Lo stesso per gli effetti FX e i titoli.
- **Via le scritte**: in alto restano solo **Durata** (Auto, 0,5 s … 10 s), **Forza** (50%, 100%, 150%) e **Suono** (acceso o muto). Valgono per tutto quello che posi.
- Gli effetti sono in gruppi (Rapidi, Lunghi, Luci, Distorsioni, Stile della clip, Audio), come le transizioni (Dissolvenze, Movimento, 3D e forme, Luce, Stile, Tendine SMPTE).

### Titoli e countdown
- **Il countdown arriva a 1** e poi finisce (prima si fermava a 2), **col bip a ogni numero**.
- **Quattro countdown**: Pellicola (5), Moderno (5), Neon (3), Minimal (10).
- **I titoli pronti** in due gruppi: *Titoli* (Titolo, Cinema, Neon, Rimbalzo, Macchina da scrivere, Citazione) e *TV e social* (Sottopancia, Social, Crawl, Rullo titoli). Il crawl e il rullo nascono già lunghi quanto serve.

### Le dissolvenze hanno una forma (audio e video)
- **Trascina la linea della dissolvenza in su o in giù** e cambia forma: **analogica** (parte piano piano, come un fader vero), **morbida**, **veloce**, **a S**. La linea diventa dorata quando è curva; **doppio clic** la raddrizza.
- **Tasto destro sul quadratino della dissolvenza**: le forme pronte e le durate (0,5, 1, 2, 4 secondi), o *Togli*.
- Vale uguale nel monitor e nell'export, anche per la trasparenza delle clip video.

### Timeline e schermo intero
- **A schermo pieno le tracce crescono** con lo spazio: niente più timeline minuscola sui monitor grandi.
- **Ctrl+Shift+rotella** (o *Vista → Tracce più alte / più basse*) per alzarle o abbassarle quanto vuoi; *Adatta* le rimette.
- **Nell'app, Ctrl + e Ctrl −** ingrandiscono **tutta l'interfaccia** (*Vista → Grandezza dell'interfaccia*, Ctrl 0 torna al 100%).
- **Il riquadro di selezione prende anche i sottotitoli**: più righe insieme, da spostare o togliere in un colpo (Canc).

### Monitor e pulsantiera più puliti
- **Il tasto play col clic funziona** (prima andava solo lo Spazio).
- Il monitor ha **una riga sola** di comandi: più spazio all'immagine, meno grigio intorno.
- **IN e OUT si vedono solo quando ci sono**, con la **✕ per toglierli** (o **Alt+X**).
- Via **INS, SOVR, LIFT, EXTRACT, REVIEW** e i tasti IN/OUT dalla pulsantiera (i tasti rapidi restano).
- **ELASTICO ora si chiama TRASPARENZA** (tasto **B**): acceso, sui video compare la linea gialla della trasparenza; clic per mettere un punto e tiralo giù per far sparire e riapparire la clip piano piano, a mano (come il volume sull'audio).

### Clip: angoli tondi, ombra, sfondi sfumati
- Nelle proprietà della clip: **Bolla ↘**, **Presentazione**, e i cursori **Angoli tondi** e **Ombra**.
- Il **colore pieno** può **sfumare** verso un secondo colore, con gli sfondi pronti.

## [1.0.6] — 2026-09-26 · LIVE: registri lo schermo, più timeline, effetti che si fondono 🔴

### LIVE: la terza pagina, per registrare lo schermo
- **In alto c'è LIVE**, accanto a MONTAGGIO e FINALE (o **F10**, o *Vista → LIVE*). Tre tasti e basta: **REGISTRA**, **PAUSA** (e riprendi), **FERMA**.
- Scegli cosa registrare (tutto lo schermo, una finestra, una scheda) e parte. Il tempo va solo quando registri: le pause non finiscono nel video.
- **Microfono** e **audio del computer** si accendono e spengono prima di partire; se il microfono non si apre registra lo stesso, senza.
- Quando fermi, la registrazione **entra nel contenitore** e, se vuoi, **va in coda alla timeline** da sola. Sul computer il file resta anche in *Video → DaProd Video*.
- La lista delle registrazioni di oggi: un clic e la riapri nel monitor.
- Sul telefono (Android) registrare lo schermo non si può: la pagina te lo dice.

### Più timeline nello stesso progetto
- **Sopra la timeline ci sono le schede**: il **+** ne fa una nuova (o una copia di quella che hai), un clic passa dall'una all'altra.
- Doppio clic per **rinominarla**, tasto destro per **duplicarla** o **eliminarla**. Il contenitore è uno solo per tutte.
- Il trailer, la versione corta per i social, quella lunga: tutto nello stesso progetto. Ctrl+Z vale anche qui.

### Gli effetti si sommano e si fondono
- **Gli effetti della clip ora si sommano**: Vivace + Caldo + Vignetta + Pellicola stanno insieme e si fondono, invece di prendere il posto uno dell'altro. Ricliccando un effetto lo togli; "Azzera" li toglie tutti.
- **Otto effetti nuovi sulla clip**: Pop, Contrasto forte, Cinema, Tramonto, Notte, Gelo, Sbiadito, Sogno (e tutti i look di prima, che ora si possono mescolare fra loro).
- **Anche gli FX a blocchetti si fondono**: due o tre blocchi sullo stesso punto non si pestano i piedi, i lampi si sommano in luce, gli zoom si moltiplicano, le distorsioni si mettono una dentro l'altra. Ogni combinazione fa un effetto diverso.

### Più effetti, più transizioni, più titoli
- **💡 Luci**: Bagliore, Riflesso d'obiettivo, Luce che trema, Sovraesposto, Luce arcobaleno, Contorni neon, Sogno.
- **🌀 Distorsioni**: Onda, Bolla, Vortice, Caleidoscopio, Aria calda, Zoom sfocato.
- **Nove transizioni nuove**: Zoom sfocato, Frusta (whip pan), Rotazione, Lama di luce, Caleidoscopio, Aria calda, Tenda, Sovraesposta, Polvere. Quelle che fanno rumore hanno già il loro suono (da accendere).
- **Sei titoli nuovi**, che si muovono da soli: **Neon** (si accende tremando), **Cinema** (lettere larghe che si avvicinano), **Macchina da scrivere** (una lettera alla volta, col cursore), **Rimbalzo**, **Social** (la fascia colorata che entra di lato), **Citazione**.

### Gli FX: muti di partenza, più grandi, e le impostazioni a destra
- **Gli FX nascono senza suono.** L'altoparlante sul blocco lo accende con un clic.
- **Tasto destro sull'altoparlante** → si apre subito il **menu dei suoni**: **passaci sopra e li senti**, clic per sceglierlo (c'è anche "Nessun suono").
- **I blocchetti sono più grandi e squadrati**: si prendono al volo, anche per allungarli dai bordi.
- **Clic su un FX o su una clip → il pannello di destra si apre** con le sue impostazioni: effetto, forza, colore, suono e volume per gli FX; info, colore, audio ed effetti per le clip.
- **📌 Il tasto per tenerlo sempre in vista**: il pannello di destra va a tutta altezza e resta lì (è la stessa cosa del tasto V). Chiuso, resta una linguetta "‹ Proprietà" sul bordo per riaprirlo.

### I menu non vanno più sotto la barra di Windows
- Il tasto destro vicino al fondo dello schermo **apre il menu verso l'alto**, e anche i sottomenu si spostano per restare dentro lo schermo (a destra, a sinistra, in basso).

### Sottotitoli: si sistemano in timeline
- **Fra le tracce video e quelle audio c'è la riga SOTT** (compare appena ci sono sottotitoli), coi sottotitoli come blocchetti: **trascinali** per spostarli, **tira i bordi** per i tempi, **doppio clic** per correggere il testo.
- **Tasto destro**: **unisci** (con la riga dopo, o tutte quelle scelte con Shift+clic: appaiono insieme), **dividi qui**, **inizia/finisci al cursore**, **allunga fino alla dopo**, togli.
- **Nella pagina Finale** ogni riga ha i suoi tasti: ⇤ inizia al cursore, ⇥ finisci al cursore, − e + per spostarla di un decimo, ⤓ unisci con la dopo, ✂ dividi, ✕ togli. Così la trascrizione dell'AI si aggiusta mentre guardi.
- Dalla testata SOTT: occhio per mostrarli o no nel video, **+** per una riga nuova al cursore.

## [1.0.5] — 2026-09-25 · FX sopra le clip, coi loro suoni, e i sottotitoli che li scrive l'AI ✨

### Gli FX stanno sopra le clip (niente più corsia a parte)
- **Effetti e transizioni sono blocchetti sulla traccia video**, in una striscia sottile in basso sulla clip. La corsia FX in cima non c'è più: i progetti di prima si sistemano da soli all'apertura.
- **Si attaccano da soli**: lasci un effetto vicino all'inizio della clip e parte con lei, vicino alla fine e finisce con lei, proprio sul taglio fra due clip e si centra lì. Lontano dai bordi resta dove l'hai lasciato. Mentre lo trascini vedi dove va ("all'inizio della clip", "sul taglio"…).
- **Poi si allunga dai bordi** per sistemare i tempi. Anche spostandolo si aggancia a inizio, fine e tagli.
- **Seguono la clip**: sposti la clip (anche su un'altra traccia) e i suoi FX vanno con lei; la elimini e se ne vanno con lei; tagli l'inizio o la fine e quello attaccato al bordo resta attaccato.
- **Non occupano posto**: due FX sullo stesso punto si mettono uno sopra l'altro, e non spostano mai una clip.
- **Valgono per la loro traccia e per quelle sotto**: uno zoom lento sulla V1 muove la ripresa ma non il titolo sulla V2; un lampo sulla V2 illumina tutto.

### Gli FX hanno il loro suono 🔊
- **Tredici suoni fatti apposta**, dentro il programma (niente file, niente diritti): whoosh, swish rapido, impatto, colpo secco, zap di luce, glitch, scatto della macchina foto, salita, discesa, nastro che si ferma, battito, campanella, piatto al contrario.
- **Ogni FX ha già quello giusto**: il cubo e le spinte col whoosh, le tendine con lo swish, il lampo con lo zap, la scossa con l'impatto, il glitch col glitch, "al bianco" con la salita… (le dissolvenze e gli effetti lunghi restano muti).
- **Il colpo cade sul punto giusto**: sul taglio, sul lampo, alla fine di chi sale.
- **L'altoparlante sul blocco**: un clic lo spegne, un altro lo riaccende (e te lo fa sentire). **Tasto destro → Suono**: scegline un altro, o piano / medio / normale / forte. Anche nelle proprietà del blocco, con "▶ Ascolta".
- Si sentono nel monitor e **finiscono nell'export**.

### La timeline
- **Si parte con 2 tracce video e 2 audio** (le altre si aggiungono da sole quando servono, o col "+").
- **La barra a destra** per scorrere su e giù fra le tracce, sempre lì: trascinala, o clic per saltare.
- **Alt+Shift+trascina** (come in EDIUS): sposti la clip **e tutto quello che viene dopo, su tutte le tracce**, insieme. Per fare spazio o stringere in un colpo solo.
- **Tasto V: timeline stretta**. Proprietà, mixer e VU scendono fino in fondo a destra e la timeline si stringe; di nuovo V e torna larga. C'è anche il tasto nell'angolo della timeline e in *Vista*.

### I sottotitoli li scrive l'AI 💬
- **Finale → Sottotitoli → "✨ Scrivi i sottotitoli con l'AI"**: Whisper ascolta la presa diretta (non la musica) e scrive le righe **coi loro tempi**.
- **Italiano o inglese**, e da un parlato italiano **direttamente in inglese**.
- **Tre modelli**: Veloce (40 MB), Buono (80 MB), Preciso (250 MB). Si scarica **una volta sola** da Hugging Face e poi resta sul computer; va con la scheda video se può.
- **L'audio non esce mai dal computer**: il lavoro si fa tutto lì.
- Le frasi lunghe si spezzano in righe che si leggono in fretta, "[Musica]" e simili si saltano. Si vede a che punto è, si può fermare, e Ctrl+Z torna a prima.
- In *Lingue e AI* i tasti ora funzionano (resta "in arrivo" solo la voce in un'altra lingua).

### Aggiornamenti e novità
- **Nell'app c'è il tasto Aggiornamenti** in alto: controlla se è uscita una versione nuova, ti fa leggere le novità e con un clic **scarica e apre** il file giusto (il setup per chi ha installato, l'exe portatile accanto a quello vecchio, il DMG sul Mac, l'APK sul telefono). Una volta al giorno controlla da solo e, se c'è, il tasto si accende.
- **Dopo un aggiornamento**, alla prima apertura, compaiono le **novità** della versione. Sempre anche da *Aiuto → Novità*.

## [1.0.4] — 2026-09-25 · La corsia FX, i proxy e il Finale con tutto al suo posto 🚀

### Il player non si blocca più
- **Trovato il colpevole**: premendo play a metà di una ripresa coi fotogrammi chiave radi (i video dei telefoni e dei generatori AI), il decoder ripartiva da capo a ogni fotogramma e l'immagine restava ferma fino al taglio dopo. Ora parte e va.
- **Il play aspetta un attimo il primo fotogramma** (al massimo un istante) e poi fa partire audio e video insieme: niente più partenze a scatti.
- **Proxy automatici**: appena una ripresa pesante entra nel contenitore (più grande di 720p, HEVC, o coi fotogrammi chiave lontani) il programma ne fa **da solo** una copia leggera per i monitor (al massimo 960 pixel, un fotogramma chiave ogni mezzo secondo). Si fa dietro le quinte, si mette in pausa mentre suoni, e si ricorda per la volta dopo. Da fermo, se il monitor è grande, arriva il fotogramma nitido dell'originale. **L'export usa sempre gli originali.**
- **La rotella in avanti costa un fotogramma solo**: il decoder continua da dove era invece di ripartire.
- L'audio delle riprese non accende più un decoder video che non serve.

### La corsia FX: effetti e transizioni a blocchetti
- In cima alla timeline c'è la **corsia FX**, **alta la metà del video**: ci stanno i **blocchetti**, facili da mettere in fila, allungare e spostare.
- **Effetti a tempo (magenta)**: trascinali **sopra le clip** o **proprio su un taglio** e valgono per tutto quello che ci sta sotto, per la durata del blocco.
  - **Rapidi**: lampo, lampo nero, scossa, zoom colpo, glitch, colori sdoppiati, negativo, stroboscopio, pixel, messa a fuoco, sfoca.
  - **Lunghi**: dal nero, al nero, dal bianco, al bianco, zoom lento, camera a mano, battito (a tempo di musica), luce calda, bande cinema, bianco e nero, torna il colore, disturbo VHS.
  - **Vicino a un taglio il lampo scoppia proprio lì**: il blocco si centra da solo sul taglio.
- **Transizioni (turchesi)**: il blocco sta sopra un taglio e passa da una clip all'altra. **Più è lungo, più è lenta.** Trascinala vicino a un taglio e si centra da sola. Sopra una transizione che c'è già, la cambia. **Le clip non cambiano mai durata.**
- **La durata** si sceglie coi chip nel contenitore (**Auto · 0,5 · 1 · 2 · 5 · 10 s**), poi si allunga o si accorcia dai bordi del blocco.
- **Tasto destro sul blocco**: durata, centra sul taglio, cambia effetto o transizione, colore del lampo, forza, "ripeti subito dopo".
- **Niente si copre**: se la corsia è occupata se ne apre un'altra (FX1, FX2…). L'occhio della corsia spegne tutti i suoi effetti.
- Nelle proprietà di una clip video, la sezione **Transizioni** mostra cosa c'è all'inizio e alla fine, e la mette con un clic.
- **L'audio legato si incrocia da solo** sotto la transizione. Tasti 5, 6, 7 come prima: dissolvenza, tendina, passaggio al nero sul taglio (di nuovo = la togli).
- **I progetti di prima si aggiornano da soli**: le transizioni attaccate alle clip diventano blocchetti.
- Nel contenitore ogni effetto ha la sua **anteprima animata** al passaggio del mouse.

### Audio al volo
- **Fade in, Fade out, Incrocio** (sul taglio fra due audio), **Eco** e **Ovattato**: trascinali sopra una clip audio, con la durata dei chip.
- **Le maniglie delle dissolvenze**: i quadratini in alto agli angoli di ogni clip. **Tirali verso l'interno** e la clip entra o esce in dissolvenza (video dal trasparente, audio dal silenzio).

### La timeline
- **La barra in fondo è un navigatore**: tutto il montaggio in piccolo e la finestra gialla di quello che vedi. **Trascina la finestra** per scorrere, **tira i suoi bordi** per lo zoom, clic fuori per andare lì.
- **Testate strette**: via manopole e decibel, resta il **misuratore che si muove** (una colonnina sul bordo). Il volume delle tracce sta nel mixer. Un tasto **"+"** aggiunge traccia video, audio o corsia FX.

### Il banco come lo vuoi tu
- **All'apertura**: contenitore largo a sinistra, monitor al centro, proprietà a destra, timeline sotto.
- **Pagina Finale**: monitor a sinistra, ritocchi larghi a destra, timeline sotto, e **un menu a destra** con le sue pagine:
  - **Colore**: colore automatico, look e ritocchi.
  - **Audio**: volume finale, limitatore, livella tutto.
  - **Sottotitoli**: "**Prepara i tempi dai dialoghi**" (il programma ascolta dove si parla e mette le righe vuote al punto giusto: tu scrivi e basta), "+ Riga al cursore", **importa ed esporta .srt**, grandezza, posizione, fascia. Scritti nel video, nel monitor e nell'export.
  - **Logo**: un'immagine del contenitore sempre in vista in un angolo, con grandezza e opacità (non prende il colore finale).
  - **Apertura**: una piccola clip all'inizio o alla fine, titolo d'apertura, titoli di coda, entra dal nero e chiudi nel nero (anche l'audio).
  - **Lingue e AI**: la lingua dei sottotitoli e, **predisposti**, i sottotitoli scritti dall'AI, la traduzione e il doppiaggio (in arrivo).
  - **Esporta**: il master, la EDL, il fotogramma e i sottotitoli .srt.

## [1.0.3] — 2026-09-25 · Un monitor solo, il contenitore nuovo e la pagina Finale 🎬

### Il banco rifatto
- **Un monitor solo**: mostra il montaggio (PROGRAMMA). Doppio clic su un file del contenitore e mostra la **SORGENTE**, con attacco, stacco e i tasti INS/SOVR; **Tab** o "⟵ MONTAGGIO" torna al programma.
- **Tutto si ridimensiona**: trascina i bordi fra contenitore, monitor, proprietà e timeline (doppio clic sul bordo chiude o riapre il pannello). Il banco si ricorda come l'hai sistemato; *Vista → Rimetti il banco come all'inizio* torna com'era.
- **Doppio clic sull'immagine = schermo intero**, con sotto la **timeline in piccolo** (clic per andare in un punto), il timecode, il play e i **VU a barre**.

### Il contenitore nuovo
- **Tutto in un posto, in ordine**: Tutto · Video · Musica · Immagini · Transizioni · Titoli · Effetti.
- Schede grandi con la locandina, la durata e quante volte la usi. **Passa il mouse su un video e scorre avanti e indietro** col puntatore: vedi al volo se è quello giusto.
- **"+" sulla scheda** la mette al cursore e porta il cursore alla fine: "+", "+", "+" e hai la scaletta.

### La timeline
- **Tracce più spesse**: l'audio più alto (si vede bene l'onda), il video più basso. I progetti di prima si aggiornano da soli.
- **Via i cursori a sinistra**: testate nuove con il nome grande, i tasti occhio/muto/solo/lucchetto e una **manopola** per trasparenza o volume della traccia (trascina su e giù, doppio clic = zero). Sulle tracce audio c'è la lucina del livello.
- **Tracce accese**: clic sul nome di una o più tracce e **il taglio (1) tocca solo quelle**, le altre restano intatte. Le tracce accese ricevono anche il montaggio dal monitor. Alt+clic = solo quella.
- **Il volume sempre in vista** sulle clip audio: la **linea gialla**. Trascinala su e giù; **doppio clic** mette un punto (doppio clic sul punto lo toglie); tasto destro → **"Abbassa qui"** o **"Alza qui"** fa la conca per due secondi e poi torna normale; "Volume normale" toglie tutto.
- **"fx" in fondo a ogni clip**: gli effetti al volo con la spunta, e un puntino per ogni effetto acceso.
- **Rotella = un fotogramma per scatto, col suono** (per tagliare sulla sillaba). **Ctrl+rotella** zoom, **Shift+rotella** scorre, **Alt+rotella** su e giù fra le tracce. Anche le frecce e il cursore trascinato fanno sentire l'audio.

### Il montaggio non mangia più niente
- **Spostare una clip non copre le altre**: si ferma attaccata alla vicina, come due mattoncini. La calamita resta. Anche i bordi (trim) si fermano contro la clip accanto.
- **Una ripresa lasciata dove è occupato va su una traccia libera** (o su una nuova, se servono): niente viene tagliato. Lo stesso per titoli, generatori e incolla. Solo **SOVR** dal monitor copre, come sulle centraline.
- Il modo della pulsantiera ora è **LIBERO / INSERISCI** (Ins).

### I tasti
- **S separa o unisce**: un gruppo scelto si separa (audio e video per conto loro); più clip o più gruppi scelti diventano **un gruppo solo** che si muove insieme. Anche **4** come prima.
- **1 taglia e sceglie il pezzo più corto** (quasi sempre lo scarto): premi **2** e sparisce.
- **2 elimina e passa alla clip dopo**: 2, 2, 2 pulisce di seguito.
- **Q** e **W**: via lo **scarto a sinistra** o **a destra** del cursore. Anche col tasto destro sulla clip, proprio nel punto dove clicchi.
- **F9**: pagina Montaggio ↔ pagina Finale. **Shift+Q** segna attacco e stacco sulla clip (prima era Q). Le frecce ↑↓ e PagSu/PagGiù vanno ai tagli (A e S non più).

### Transizioni che si mettono come i generatori
- **Clic sulla transizione** e va sul taglio più vicino al cursore, anche se non ci sei proprio sopra.
- **Trascinala** su un taglio, **su una clip** (va sul bordo più vicino) o **sul bordo libero** di una clip: all'inizio entra da quello che c'è sotto, alla fine **esce** (transizione in coda, nuova). Mentre la trascini si accende il punto dove cadrà.
- **Le clip non cambiano durata**: la transizione vive dentro la clip.

### Proprietà semplici
- In alto il **riassunto** (tipo, dove sta, quanto dura, da che file viene). Poi gli **effetti al volo** come interruttori: colore automatico, vivace, più luce, caldo, freddo, bianco e nero, seppia, pellicola, VHS, tubo catodico, vignetta, **zoom lento**, specchia, entra ed esce. Per l'audio: **livella il volume**, **voce chiara**, taglia bassi, radio/telefono, entra ed esce, muto.
- Poche regolazioni: opacità, zoom, luce, contrasto, saturazione, temperatura, volume, durata, transizioni in testa e in coda (½ s, 1 s, 2 s). Posizione, ritaglio e chiave sono in "Avanzate", chiuse.
- Gli stessi effetti sono nel contenitore (sezione Effetti): clic sulle clip scelte o **trascinali sopra una clip**.

### La pagina Finale
- Il montaggio intero nel monitor grande, la timeline sotto, e a destra i ritocchi che valgono per **tutto**:
  - **Riepilogo**: durata, quante clip, e cosa non va (file da ricollegare, **buchi neri**: clic e ci vai).
  - **Colore automatico** su tutte le riprese (acceso di serie): ogni ripresa viene misurata e nero, bianco e luce si sistemano da soli, così le clip si somigliano. Con la forza regolabile; una clip può fare eccezione dal suo "fx".
  - **Look**: naturale, cinema, caldo, freddo, vivace, vintage, bianco e nero, pellicola, notte, con l'intensità.
  - **Ritocchi**: luce, contrasto, saturazione, temperatura, tinta, vignetta, grana.
  - **PRIMA | DOPO**: a sinistra com'era, a destra col colore finale.
  - **Audio finale**: volume e **limitatore** (niente distorsione), e "Livella il volume di tutte le clip".
  - **Esporta**: formato, qualità e misura con un clic, poi ESPORTA IL MASTER. EDL e fotogramma PNG a portata di mano.
- Il colore finale e l'audio finale escono uguali nei monitor e nel file esportato.

### Correzioni
- **L'audio si abbassava piano piano fino alla fine della clip** (il "fade out automatico"): era un errore nell'inviluppo del volume, sistemato sia in riproduzione sia nell'export.
- Le clip audio non vengono più scambiate per video (nelle proprietà di un audio uscivano i comandi del video).
- Il fotogramma dell'anteprima nel contenitore si libera appena togli il mouse.

## [1.0.2] — 2026-09-24 · Istantanee e transizioni da regia digitale 📸

### Istantanea del fotogramma
- **P** fotografa il fotogramma sotto il cursore e lo mette **nel contenitore come immagine** ("Istantanea 00.00.05.12.png"). Dal **Recorder** si fotografa il montaggio intero, con titoli, trasparenze ed effetti; dal **Player** la sorgente a piena risoluzione. Il monitor fa il lampo come una macchina fotografica.
- L'istantanea si trascina nella timeline e **si allunga quanto vuoi** dal bordo. Oppure, nelle proprietà, il gruppo **Durata**: scrivi i secondi o usa **+1 s**, **+5 s**, **−1 s** e **fino alla prossima** (riempie il buco fino alla clip dopo).
- **Shift+P** fa il **fermo immagine**: due secondi dell'istantanea entrano al cursore e il resto del montaggio scorre avanti.
- Pulsante **FOTO** sui due monitor e nella pulsantiera, e nel menu della timeline (tasto destro).
- Le istantanee restano: nell'app si salvano nella cartella dei dati, nel browser dentro il browser. Riaprendo il progetto ci sono ancora.

### Transizioni nuove
- **Effetti digitali (DVE)**: spinta nelle quattro direzioni, scivola, **zoom incrociato** con la scia, **mosaico** dei DVE anni '90, **onda**, **lampo** bianco, **luce di pellicola**, **glitch**, **vortice**, **sfocata**, **cubo 3D** e **girata** (la cartolina che si gira).
- **Tendine a sagoma**: **stella** (120) e **cuore** (121), con bordo morbido e colorato.
- Il pannello Transizioni ha le **anteprime vere**: le disegna lo stesso shader del Recorder, e si muovono quando ci passi sopra.
- Nelle proprietà un solo menu **Modello** per tendine ed effetti. Nella timeline gli effetti digitali sono magenta e hanno il nome scritto sopra. Nella EDL escono come dissolvenza con la nota `* EFFETTO`.
- Col cursore dentro una transizione già messa, un clic su un'altra la cambia al volo.
- Il bordo delle tendine è più netto di serie.

### Rifiniture
- Il primo fotogramma nel Recorder dopo un import arriva subito: le miniature della timeline aspettano che il monitor e la riproduzione abbiano finito col decoder.
- **Versione prova nel browser**: anche i file che non si possono ritrovare dal disco (Firefox, Safari, file trascinati, istantanee) fino a 300 MB restano nel browser, così il progetto riparte senza ricollegarli. Con "Nuovo progetto" lo spazio si libera.

## [1.0.1] — 2026-09-24 · Rifiniture: Android, Mac e la versione prova online 🔧

### Correzioni
- **Android**: se chiudi il selettore dei file senza scegliere niente non esce più un errore; il selettore mostra video, audio e foto (prima i filtri per estensione non li capiva).
- **Foto senza estensione** (su Android arrivano come `content://…`): ora si riconoscono lo stesso e vanno nel contenitore come immagini.
- **Tono delle barre e 2-pop del countdown** vanno sulla prima traccia audio libera da A1 in giù (prima finivano su A4).
- **Montaggio dal Player** (`,` e `.`): un solo passo di annulla invece di due.
- **F11 nell'app** mette a schermo intero la finestra vera (prima solo la pagina).

### Pages
- La versione prova ora si pubblica sul ramo `gh-pages` a ogni merge.

## [1.0.0] — 2026-09-24 · Si accende la sala di montaggio 🎬

La prima versione: un banco di montaggio vecchio stile, moderno dentro.

### Il banco
- **Due monitor come in regia**: a sinistra il **Player** (la sorgente), a destra il **Recorder** (il programma). Timecode a sette segmenti, attacco/stacco, durata, barra di posizione, zone di sicurezza e il 4:3 dentro il 16:9.
- **La pulsantiera** sotto i monitor: **1 taglia**, **2 elimina**, **3 elimina e chiude il buco**, **4 separa audio e video**, **5 dissolvenza**, **6 tendina**, **7 passaggio al nero**, **8 dissolvenza in apertura e chiusura**. Spie per inserisci/sovrascrivi, ripple, calamita e linee elastiche.
- **Trasporto da videoregistratore**: Spazio, shuttle **J K L** (ripeti per accelerare fino a ×16), passo a passo, manopola **jog/shuttle** con la molla, loop fra attacco e stacco.
- **Il tastierino numerico scrive il timecode** sul monitor attivo, come in EDIUS ("1000" = 10 secondi, "+25" = avanti di 25 fotogrammi). Drop-frame a 29,97.

### Il montaggio
- **Timeline su tela**: miniature, forme d'onda, dissolvenze e transizioni disegnate sul taglio, marcatori, zona attacco-stacco, cursore che gira pagina.
- Sposti le clip trascinandole (anche di traccia), con la **calamita** sui tagli e sul cursore; **trim** dai bordi, **roll** con Shift sul taglio, **slip** con Alt, **ripple** con R o Ctrl.
- **Montaggio a tre punti** dal Player: **,** inserisci e **.** sovrascrivi (anche **[** e **]** sulle tastiere americane), con la "patch" delle tracce di destinazione. **Solleva** (Z) ed **estrai** (X), **abbina fotogramma** (F), **rivedi** con il preroll (Shift+R).
- **Livelli al volo**: trasparenza della clip (Alt+↑↓ di 10 in 10) e della traccia intera, **linee elastiche** per trasparenza e volume nel tempo.
- Annulla e ripeti fino a 200 passi. Copia, taglia e incolla le clip.

### Video
- Mixer video in **WebGL2**: livelli con trasparenza, posizione, scala, rotazione, ritaglio, riquadro (PiP).
- **Proc amp** come sul TBC (nero, guadagno, croma, fase), **chiave** di luminanza e **green/blue screen** con pulizia dei bordi.
- **Look**: VHS, pellicola, tubo catodico, bianco e nero, seppia.
- **Transizioni**: dissolvenza, passaggio a colore e le **tendine SMPTE** (1, 2, 3, 4, 21, 22, 41, 101, 102, 119 iride, 201 orologio, 7 veneziana) con bordo morbido e colorato.
- **Generatori**: barre colore SMPTE/EBU con tono a 1 kHz, countdown da pellicola con il 2-pop, nero, colore pieno.
- **Titolatrice**: titolo fisso, **sottopancia** stile TG, **rullo** dei titoli di coda e **crawl**.

### Audio
- **VU a lancetta** con l'inerzia vera (0 VU = −18 dBFS), led di picco e barra digitale.
- **Mixer**: fader, panorama, muto e solo per ogni traccia, livelli video per traccia, ascolto generale.
- Dissolvenze incrociate sui tagli, fade in/out, volume e panorama per clip.

### Strumenti e uscita
- **Forma d'onda** (IRE) e **vettorscopio** col fosforo verde.
- **Export** MP4 (H.264/AAC), MOV, WebM (VP9/Opus) e WAV, a piena risoluzione, metà, 720p o 4K. Nell'app il file si scrive mentre esce, senza tenerlo in memoria.
- **EDL CMX3600** per Resolve, Avid, Premiere ed EDIUS. **Fotogramma PNG** a piena risoluzione.
- **Progetti .dpv** e **autosalvataggio**: riapri e riparti da dove eri.
- Import di MP4, MOV, MKV, WebM, **MTS/M2TS delle videocamere AVCHD** (anche con audio AC-3), MP3, WAV, AAC, FLAC, OGG e immagini.

### App e prova
- **App Tauri 2 (Rust)** per Windows (portatile e installabile), Mac (universale) e Android: i file si leggono e si scrivono dal lato Rust.
- **Versione prova nel browser** su GitHub Pages, con il **montaggio dimostrativo** generato al volo (tre riprese, titoli, dissolvenze, iride).
- Vista telefono con un monitor alla volta, pulsantiera grande e fogli a scomparsa.
- **Mac con Safari vecchio**: se WebKit non sa decodificare l'audio AAC/MP3/FLAC dei video, ci pensa Rust (Symphonia).
- **Trascina dal contenitore alla timeline anche col dito** (tieni premuto e trascina) e nell'app Windows.
- Prove automatiche (`test/prove.mjs`): il banco usato da solo in Chromium, dal taglio all'export riletto.

---

Confronto tra versioni: [tags](https://github.com/cammo22/DaProdVideo/tags) · [releases](https://github.com/cammo22/DaProdVideo/releases)
