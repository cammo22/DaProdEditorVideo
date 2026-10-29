<!-- discord-card -->
<p align="center">
  <a href="https://discord.gg/Njs52aacwq"><img src=".github/discord-card.svg" alt="Entra nella community DaProd su Discord" width="720"></a>
</p>

# DaProd · Video 🎬

[![▶ PROVA ORA](https://img.shields.io/badge/%E2%96%B6_PROVA_ORA-DaProd_Video-ffd54a?style=for-the-badge&labelColor=1a1428)](https://cammo22.github.io/DaProdVideo/app/)

[![Home](https://img.shields.io/badge/GitHub_Pages-la_home-success?style=flat-square)](https://cammo22.github.io/DaProdVideo/)
[![Release](https://img.shields.io/github/v/release/cammo22/DaProdVideo?style=flat-square&label=release&color=ff3df2)](https://github.com/cammo22/DaProdVideo/releases/latest)
[![Changelog](https://img.shields.io/badge/📅_Changelog-mantenuto-ffab00?style=flat-square)](CHANGELOG.md)
[![Tauri 2](https://img.shields.io/badge/Tauri_2-Rust-24c8db?style=flat-square&logo=tauri)](https://tauri.app/)
[![Licenza MIT](https://img.shields.io/badge/Licenza-MIT-blue?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-DaProd-5865F2?logo=discord&logoColor=white)](https://discord.gg/Njs52aacwq)

Il **banco di montaggio DaProd**: vecchio stile, moderno dentro. Un monitor grande, il **contenitore** come un
esplora risorse (le tue **cartelle**, e transizioni ed effetti con le **anteprime fatte coi fotogrammi del tuo
montaggio**), la **pulsantiera** con i tasti grandi, i **livelli a barra**, gli **FX a blocchetti sopra le clip**
(effetti e transizioni, coi loro suoni), la titolatrice, le **dissolvenze con la forma** (analogica, morbida, a S), i
**proxy su richiesta da Attività** per andare lisci anche coi file pesanti, la **pagina Finale** per colore, **sottotitoli
scritti dall'AI** (Nemotron di NVIDIA o Whisper, sul tuo computer), **voce AI**, **velocità delle clip** (Alt+E) col movimento fluido e logo su tutto il montaggio, **più timeline** nello stesso
progetto, la pagina **LIVE** per registrare lo schermo **con la webcam a bolla** (3-2-1, pausa, segni, telecomando),
il **pacchetto .daprod** con dentro tutti i file e la **EDL**. Cursore sul punto, premi **1** e tagli, premi **2**
ed elimini. Arriva su **Windows, poi Linux e Mac** e, in versione prova, **nel browser**.

![Il banco di montaggio](risorse/schermata.png)

| La pagina Finale: i sottotitoli scritti dall'AI, col menu a destra | Il contenitore a cartelle: la transizione provata sui tuoi fotogrammi |
| --- | --- |
| ![Pagina Finale](risorse/finale.png) | ![Contenitore](risorse/contenitore.png) |

| Il cubo 3D | Transizioni e proprietà |
| --- | --- |
| ![Cubo 3D](risorse/cubo.png) | ![Pannello Transizioni](risorse/schermata-transizioni.png) |

| Più timeline e i sottotitoli nella riga SOTT | LIVE: lo schermo in stile presentazione, con la webcam a bolla |
| --- | --- |
| ![Timeline e sottotitoli](risorse/timeline.png) | ![Pagina LIVE](risorse/live.png) |

## ▶ Come si monta

> **Non sai dove sta una cosa?** Premi **`Ctrl+K`** (o 🔍 **Cerca** in alto) e scrivi quello che vuoi fare: *rallenta*,
> *sottotitoli*, *togli lo sfondo*, *dissolvenza*, *titolo neon*… e la fai da lì, col suo tasto accanto. **`F1`** apre
> **Come si fa**: una guida corta per ogni lavoro, col pulsante **Fallo adesso** che ti porta proprio al punto giusto.
> Tutte le funzioni AI (sottotitoli, traduzione, voce, sfondo, tracking, montaggio automatico, colore) stanno insieme nel
> **Centro AI** (pulsante ✨ **AI** in alto o menu **AI**), con **Controlla l'AI** che prova sul tuo computer se tutto è a posto.

0. In alto c'è la **barra bianca** con le cose rapide: Progetti, Salva, Importa, Annulla/Ripeti, il nome del progetto e Cerca. Sotto, la testata coi menu, le pagine ed Esporta.
   All'apertura trovi la **pagina iniziale**: i progetti recenti (con la miniatura), Nuovo, Apri e DaProdMontage. Torni quando vuoi dal tasto **Progetti** in alto.
1. **Importa** i video (pulsante *Importa*, `Ctrl+I`, o trascinali nel contenitore). Il primo video decide il formato del progetto. Nel contenitore a sinistra c'è l'albero: **Video, Musica, Immagini** e **le tue cartelle** (*Nuova cartella*, trascina i file dentro); importando da una cartella il file entra lì, da Musica la finestra mostra solo gli audio.
2. Nel **contenitore** passa il mouse su un video: scorre avanti e indietro col puntatore. **Trascinalo** nella timeline, o premi **+** per metterlo al cursore (e il cursore va alla fine: +, +, + e hai la scaletta). Se lì è occupato va su una traccia libera: **niente viene coperto**.
3. Vuoi scegliere il pezzo? **Doppio clic**: si apre nel monitor come **sorgente**. Segna **attacco** (`I`) e **stacco** (`O`) e premi **`,`** (inserisci) o **`.`** (sovrascrivi). **Tab** torna al montaggio.
4. Cursore dove vuoi (la **rotella** va di un fotogramma alla volta, col suono) e **`1`**: taglio. Il pezzo più corto è già scelto: **`2`** e via, e si passa alla clip dopo. **`Q`** / **`W`** tolgono lo scarto a sinistra / a destra del cursore.
5. **Accendi le tracce** (clic sul nome) e il taglio tocca solo quelle. **`S`** separa l'audio dal video, o unisce più clip in un gruppo.
6. **Effetti e transizioni sono blocchetti sopra le clip**: una striscia sottile in basso sulla traccia video, niente corsia a parte. Trascina un **effetto** (lampo, scossa, zoom colpo, glitch, dal nero, zoom lento, camera a mano, bande cinema, e le **luci** e le **distorsioni**: bagliore, riflesso d'obiettivo, neon, onda, bolla, vortice, caleidoscopio…) sopra una clip: **si sistema da solo** all'inizio, alla fine o centrato sul taglio fra due clip (lontano dai bordi resta dove lo lasci), e vale per la sua traccia e per quelle sotto. Trascina una **transizione** (dissolvenza, passaggio al nero, spinta, zoom, mosaico, **cubo 3D**, girata, onda, lampo, glitch, tendine SMPTE con stella e cuore, frusta, rotazione, lama di luce, tenda, polvere…) vicino a un taglio: si centra da sola, e **più è lunga più è lenta**. Poi **allungali dai bordi**. Due o più sullo stesso punto **si sommano e si fondono**. Molti hanno già il **loro suono** (whoosh, colpo, zap, glitch, salita…), spento di partenza: l'**altoparlante sul blocco** lo accende con un clic, il **tasto destro sull'altoparlante** apre i suoni e **passandoci sopra li senti**. **Clic su un blocco o su una clip** e il pannello di destra mostra le sue impostazioni (📌 lo tiene sempre in vista). I blocchetti **seguono la clip** su cui stanno. Le clip non cambiano mai durata. Anche gli **effetti della clip** (Vivace, Caldo, Cinema, Pellicola, Vignetta…) si sommano fra loro.
7. Il **volume** è la linea gialla sulle clip audio: trascinala, doppio clic per un punto, tasto destro → *Abbassa qui*. I **quadratini in alto** agli angoli di ogni clip sono le dissolvenze: tirali verso l'interno; poi **trascina la linea della dissolvenza su o giù** per la forma (analogica che parte piano piano, morbida, veloce; tasto destro sul quadratino → anche **a S** e le durate pronte; doppio clic la raddrizza). **Fade in, fade out, incrocio, eco, ovattato** si trascinano dal contenitore sulle clip audio. Il tasto **fx** in fondo alla clip accende gli effetti al volo.
8. **`F9`** apre la pagina **Finale**, col suo menu a destra: **colore** (automatico su tutto, look, ritocchi, prima/dopo), **audio** finale col limitatore, **sottotitoli** (**scritti dall'AI**: Nemotron 3.5 di NVIDIA (nell'app, su scheda NVIDIA, Mac o CPU) o Whisper ascoltano la presa diretta, e dall'italiano Whisper li scrive anche direttamente in inglese; o i tempi dai dialoghi da riempire a mano; importa ed esporta .srt e .vtt), **logo** sempre in vista, **apertura** e chiusura (clip, titoli, dal nero e al nero), **lingue e AI** (compresa la **voce AI**: i sottotitoli letti da una voce di NVIDIA) ed **esporta** (MP4, MOV, WebM, WAV, EDL, .srt, .vtt).
9. I **sottotitoli** stanno nella riga **SOTT**, fra le tracce video e quelle audio: **trascinali**, tira i bordi per i tempi, **doppio clic** (o **F2**) per scrivere o correggere il testo (Invio conferma, Maiusc+Invio va a capo, Ctrl+Invio divide la riga dove sta il cursore, Tab passa alla riga dopo), tasto destro per **unire** (appaiono insieme) o **dividere**. Nel Finale ogni riga ha i tasti ⇤ ⇥ − + per sistemare i tempi al volo. I sottotitoli «scritti nel video» escono bruciati nel filmato esportato.
10. **Più timeline**: le schede sopra la timeline, il **+** ne fa una nuova o una copia; doppio clic per rinominarla.
11. **`F10`** apre la pagina **LIVE**: **REGISTRA** (`R`, col 3-2-1), **PAUSA** (`Spazio`), **SEGNA** (`M`), **FERMA** (`F`). Col microfono (VU e scelta del microfono), l'audio del computer e la **webcam**, che si registra a parte e va sulla traccia sopra come **bolla** nell'angolo che scegli; lo **stile presentazione** mette lo schermo con angoli tondi e ombra su uno sfondo sfumato. Con **più finestre al volo** aggiungi altre finestre mentre registri (**N**) e passi dall'una all'altra (**1-9**, **L** cambia la disposizione). Il **TELECOMANDO** è una finestrella quasi quadrata, sempre sopra le altre, con l'**anteprima** di quello che registri, PAUSA grande, SEGNA, cambio finestra e FERMA. Tutto finisce nella cartella *Registrazioni* e in fondo alla timeline, legato insieme.
12. **`V`** stringe la timeline: **proprietà, mixer e VU scendono fino in fondo** a destra (di nuovo `V` per tornare larga). La **barra a destra** della timeline scorre su e giù fra le tracce.
13. **`P`** fa un'**istantanea** del fotogramma nel contenitore, da allungare quanto vuoi (**`Shift+P`**: fermo immagine al cursore).
14. **Sull'immagine del monitor**: clic su quello che vedi e lo scegli; trascina per spostarlo, tira un angolo per ingrandirlo, il pallino in alto lo gira. tira un lato per stirare (Maiusc sugli angoli, Ctrl dal centro, **✂** per ritagliare) e Ctrl+clic sceglie quella sotto. **↝ Movimento** gli dà una posizione d'inizio e una di fine e tutte le **tappe** che vuoi (**＋**, o fermo fra due tappe muovi) e ci passa dentro piano piano; **🎯** segue un oggetto (tracking) e titoli, immagini ed effetti lo inseguono; nelle proprietà ci sono i movimenti pronti (entra da sinistra, sale dal basso, si avvicina…). Gli effetti come **bolla**, **vortice** e **zoom** hanno un mirino: mettilo dove vuoi, anche in movimento. Più **transizioni sullo stesso taglio si sommano**.
15. **File → Salva il pacchetto .daprod**: il progetto **con dentro tutti i suoi file** (uno zip vero, i file restano identici). Lo apri su un altro computer e ritrovi tutto. Il **.dpv** invece è il progetto leggero: tiene il montaggio, i file restano dove sono.
16. **`F8`** apre **DaProdMontage**, la quarta pagina: butta dentro **foto e video alla rinfusa** (anche solo foto), scegli **cosa festeggi** (28 stili: matrimonio, battesimo, comunione, cresima, laurea, compleanno, Natale, viaggio, reel verticale…), quanto deve durare e, se vuoi, il brano. **✨ CREA IL MONTAGGIO** e il programma ordina le foto (per data di scatto), le tiene il tempo giusto, le muove, mette transizioni, titoli e quello che cade sopra, appoggia i tagli ai battiti. Lo vedi **in anteprima nel monitor in alto**: se non ti piace **🎲 Rigenera** (ogni volta cambia, anche con le stesse scelte), se ti piace **✅ Importa nella timeline** e lo ritocchi.
17. **Togliere lo sfondo**: sulla clip, **Proprietà → Sfondo** (o il tasto **SFONDO** sul monitor). **Colore** (green screen con fino a 3 colori, contagocce, via il riflesso), **Luce** o **AI** (soggetto, persona, oggetti coi clic). **Generatori → Animazioni**: 49 animazioni personalizzabili (sottopancia, testi, grafici, social, fondi, cerimonie).
18. **La barra delle attività** (in basso a destra) mostra sempre cosa fa il programma dietro le quinte — riaprire i file, forme d'onda, colore, copie leggere, conversioni, sottotitoli e voce con l'AI — con la percentuale e il tempo che manca. **Un clic** apre il pannello con tutte le righe (passati, mancano, in coda, finite da poco): **✕** ferma una riga, **⏸ Pausa** ferma i lavori in coda. I lavori pesanti vanno uno alla volta e aspettano mentre il montaggio suona; riaprendo un progetto con tante clip si riaprono prima i file che stanno in timeline, e le misure già fatte (forme d'onda, colore, locandine) si ricordano.
19. A **schermo pieno** le tracce crescono da sole; **`Ctrl+Shift`+rotella** le alza e le abbassa. Nell'app **`Ctrl +`** e **`Ctrl −`** ingrandiscono tutta l'interfaccia.

### 🎛 La pulsantiera

| Tasto | Cosa fa | Tasto | Cosa fa |
| --- | --- | --- | --- |
| **1** | taglia al cursore (le tracce accese, o tutte) e sceglie il pezzo più corto | **5** | dissolvenza incrociata sul taglio più vicino |
| **2** | elimina la clip scelta (con la sua audio) e passa alla dopo | **6** | tendina sul taglio |
| **3** | elimina e chiude il buco (ripple) | **7** | passaggio al nero |
| **S** (o **4**) | separa un gruppo / unisce più clip in un gruppo | **8** | dissolvenza in apertura e chiusura |
| **Q** | via lo scarto a sinistra del cursore | **W** | via lo scarto a destra del cursore |

| Tasto | Cosa fa | Tasto | Cosa fa |
| --- | --- | --- | --- |
| `Spazio` | play / stop | `J` `K` `L` | shuttle indietro, fermo, avanti (ripeti: ×2 ×4 ×8 ×16) |
| `←` `→` rotella | un fotogramma, col suono (`Shift+←→`: un secondo) | `↑` `↓` | taglio precedente / successivo |
| `I` `O` | attacco e stacco (sul monitor) | `Alt+X` | toglie attacco e stacco (anche la ✕ sul monitor) |
| `,` `.` | inserisci / sovrascrivi dalla sorgente (`[` `]` su tastiera USA) | `E` `Invio` | EDIT nel modo attivo |
| `Z` `X` | solleva / estrai fra attacco e stacco | `Shift+R` | rivedi l'ultimo montaggio con il preroll |
| `Tab` | monitor: sorgente ↔ montaggio | `F` | abbina fotogramma (la sorgente nel monitor) |
| `Ins` | modo libero / inserisci | `R` `N` `B` | ripple, calamita, linea della **trasparenza** sui video |
| `Shift+Q` | attacco e stacco sulla clip sotto il cursore | `Ctrl+Shift`+rotella | tracce più alte / più basse |
| `F9` | pagina Montaggio ↔ pagina **Finale** | `F10` | pagina **LIVE** (registra lo schermo) |
| `V` | timeline stretta ↔ larga (proprietà e VU fino in fondo) | `Alt+Shift`+trascina | sposta la clip **e tutto quello dopo**, su tutte le tracce (come EDIUS) |
| `M` | marcatore | `T` | titolo al cursore · `G` zone di sicurezza |
| `P` | **istantanea** del fotogramma nel contenitore | `Shift+P` | **fermo immagine** di 2 s al cursore |
| `Ctrl+Z` `Ctrl+Y` | annulla / ripeti (200 passi) | `Ctrl+C` `X` `V` | copia, taglia, incolla le clip |
| tastierino `0-9` | scrive il timecode (`1000` = 10 s, `+25`) | `F1` | tutti i tasti |

Con il mouse: **trascina** per spostare (anche di traccia: si ferma contro le vicine, non copre niente), i
**bordi** per il trim, **Shift** sul taglio per il roll, **Alt** per lo slip, **Ctrl** per il trim ripple,
**Alt+Shift** per spostare la clip e tutto quello che viene dopo, su tutte le tracce, insieme.
**Rotella** = un fotogramma per scatto col suono, **Ctrl+rotella** = zoom, **Shift+rotella** = scorri,
**Alt+rotella** = su e giù fra le tracce. **Tasto destro** sulla clip: elimina lo scarto a sinistra/destra di
quel punto, transizioni all'inizio e alla fine, effetti a tempo, *Abbassa qui*; sul **blocchetto FX**: durata,
centra sul taglio, cambia, **suono** (quale, acceso/spento, volume), colore, "ripeti subito dopo"; sull'**altoparlante** del
blocchetto: i suoni, da sentire passandoci sopra; sulla **riga SOTT**: unisci, dividi, inizia e finisci al cursore. I menu
stanno sempre dentro lo schermo. La **barra in fondo è un navigatore**: trascina la
finestra gialla per scorrere, tira i suoi bordi per lo zoom. Ogni bordo fra i pannelli si trascina
(doppio clic lo chiude). **Doppio clic sull'immagine**: schermo intero con la timeline in piccolo e i VU.
Sul telefono: tocco = cursore, **tieni premuto** e trascina per spostare, **due dita** per lo zoom.

## 📥 App: Windows, poi Linux e Mac

I file delle [release](https://github.com/cammo22/DaProdVideo/releases/latest):

| | File | Come si usa |
| --- | --- | --- |
| 🪟 Windows | `DaProd-Video-X.Y.Z-portatile.exe` | niente installazione: doppio clic e parte. Se SmartScreen avvisa: *Ulteriori informazioni → Esegui comunque* |
| 💿 Windows | `DaProd-Video-X.Y.Z-setup.exe` | installa con il collegamento nel menu Start (senza permessi di amministratore) |
| 🍎 Mac | `DaProd-Video-X.Y.Z.dmg` | trascina in Applicazioni; la prima volta *tasto destro → Apri* (su Sequoia: *Impostazioni → Privacy e sicurezza → Apri comunque*) |

Le app sono fatte con **Tauri 2**: l'interfaccia gira nel motore web del sistema (WebView2 su Windows, WebKit
su Mac) e i file li legge e li scrive **Rust**. Pesano pochi MB, leggono ore di girato a
pezzi senza caricarle in memoria, scrivono l'export mentre esce e **riprendono il montaggio da dove eri**.
Requisiti: Windows 10/11, macOS 14 o più nuovo con Safari aggiornato (per l'audio serve WebKit 26).

**È tutto automatico** (`.github/workflows/app.yml`): quando su `main` arriva una versione nuova (il campo
`version` di `package.json`), GitHub Actions fa le prove, compila le app desktop e pubblica da sola la release
`vX.Y.Z` con le note prese dal CHANGELOG. Per una versione nuova basta alzare `version`, scrivere la voce nel
CHANGELOG e unire.

**Aggiornarsi è un clic**: nell'app c'è il tasto **Aggiornamenti** in alto (si accende da solo quando esce una
versione nuova). Fa vedere le novità, scarica il file giusto (setup, portatile o DMG) e lo apre. Alla prima
apertura dopo l'aggiornamento compaiono le **novità** della versione (sempre anche da *Aiuto → Novità*).

## 🌐 La versione prova su GitHub Pages

[`cammo22.github.io/DaProdVideo`](https://cammo22.github.io/DaProdVideo/) è la home; il banco è in
[`/app/`](https://cammo22.github.io/DaProdVideo/app/). È **completo** (montaggio, effetti, export), con
il **montaggio dimostrativo** generato al volo per provarlo senza file. I limiti sono quelli del browser:

- serve **Chrome, Edge, Brave, Opera** (anche su Android) o **Safari 26**: il motore è WebCodecs;
- i file restano nel browser: riaprendo, Chrome ed Edge chiedono di ridare il permesso (*File → Ricollega media*), gli altri di sceglierli di nuovo;
- l'export senza "Salva con nome" (Firefox, Safari) passa dalla memoria: per montaggi lunghi meglio l'app.

Ogni merge su `main` ricompila la home e il banco e li mette sul ramo `gh-pages` (`.github/workflows/pages.yml`).
Se il sito non si accende da solo, una volta sola: *Settings → Pages → Deploy from a branch → `gh-pages` / (root)*.

## 🛠 Come è fatto

| Pezzo | Con cosa |
| --- | --- |
| Lettura e scrittura dei media | [Mediabunny](https://mediabunny.dev) (MP4, MOV, MKV, WebM, MPEG-TS/AVCHD, MP3, WAV, FLAC, OGG) su **WebCodecs**, decodifica e codifica hardware; AC-3 delle videocamere con il decoder WASM; **proxy automatici** (960 px, un fotogramma chiave ogni mezzo secondo) fatti dietro le quinte e conservati nel disco privato (OPFS) |
| Mixer video | **WebGL2**: un buffer per strato, trasformazioni (con **angoli tondi e ombra morbida**, calcolati con la distanza da un rettangolo arrotondato), proc amp, chiave, look, tendine SMPTE, effetti digitali e dissolvenze negli shader; il passaggio degli **effetti a tempo** dopo ogni traccia che ne ha (valgono per lei e per quelle sotto); colore automatico misurato su ogni ripresa, un passaggio finale per il colore di tutto il montaggio, e sopra a tutto logo e sottotitoli |
| Audio | **Web Audio**: volume e incroci come inviluppi, filtri per la voce, limitatore finale, audio a colpetti quando vai di fotogramma in fotogramma, VU dalla scheda audio, mixaggio dell'export a pezzi con `OfflineAudioContext` |
| Registrazione (LIVE) | `getDisplayMedia` per lo schermo, `getUserMedia` per microfono e webcam, microfono e audio del computer mescolati con Web Audio, **MediaRecorder** a pezzi (ogni pausa chiude un pezzo, schermo e webcam allo stesso taglio); alla fine Mediabunny cuce i pezzi in un file solo, senza ricodificare, con durata e ricerca giuste e l'app lo salva in *Video → DaProd Video*. Il telecomando è una finestra **Document Picture-in-Picture** (nel browser) o la finestra dell'app fatta piccola e sempre in primo piano |
| Pacchetto .daprod | uno **zip** scritto a mano (nomi UTF-8, **zip64** oltre i 4 GB), coi file "stored": nell'app Rust copia i byte e calcola il CRC a pezzi da 64 MB; all'apertura i media si leggono **direttamente da dentro lo zip** (inizio e lunghezza di ogni file), senza scompattare |
| Timeline | una sola **tela 2D** ridisegnata solo quando serve; miniature a potenze di due (zoomando si riusano) e forma d'onda a 100 picchi al secondo |
| Modello | fotogrammi interi sulla timeline (come le centraline a nastro), più timeline (sequenze) nello stesso progetto, annulla a fotografie del progetto |
| Togliere lo sfondo | chiave a colori nel piano del colore (YUV) dello shader; ritaglio AI con [transformers.js](https://github.com/huggingface/transformers.js) in un Worker: **BEN2** e **BiRefNet** (MIT), **MODNet** (Apache-2.0), **SAM 2.1** / SlimSAM (Apache-2.0); le maschere si mescolano nel tempo e stanno in una cache sul computer |
| Animazioni | funzioni pure del tempo disegnate su **Canvas 2D** (`src/render/anim/`), ispirate al catalogo di [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0); caratteri **@fontsource** (OFL) |
| DaProdMontage | `src/core/montage.ts` (piano: ordine, doppioni, tempo esatto, battiti, Ken Burns) + 28 stili in `montagePreset.ts`; data EXIF, qualità e ritmo del brano calcolati sul posto, senza AI |
| AI (sottotitoli, traduzione, voce, sfondo) | **Nemotron 3.5** di NVIDIA con [NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp) 0.2.0 (programma a parte che l'app scarica da sola: CUDA, Metal o CPU, e se la scheda non ce la fa riprova sul processore; modelli GGUF che scarica lui) oppure **Whisper** (tiny, base o small), **NLLB-200** per tradurre e i modelli per lo sfondo con [transformers.js](https://huggingface.co/docs/transformers.js) in un worker. **La libreria e ONNX Runtime viaggiano dentro l'app** (`public/ai/`, li prepara `scripts/ai-locale.mjs` prima della build, con il controllo dell'impronta): da Internet arrivano solo i modelli, da Hugging Face, **una volta sola**. Su WebGPU se c'è e funziona davvero, se no WASM; ogni modello prova più pesi (q8, fp16, fp32) prima di arrendersi, e gli errori si spiegano in italiano (`src/media/erroriAI.ts`). L'audio della presa diretta si prende a 16 kHz, si taglia nei silenzi a pezzi di un minuto e **non esce mai dal computer** |
| App | **Tauri 2 / Rust**: `src-tauri/src/lib.rs` legge i media a pezzi, scrive l'export in streaming (anche `content://` su Android), salva progetti e autosalvataggio; `aggiorna.rs` scarica e apre la versione nuova |

```bash
npm install
npm run dev            # il banco in http://localhost:5173/app/
npm run build          # dist/: home + banco (quello che va su Pages e dentro le app)
npm run tauri dev      # l'app desktop in sviluppo (serve Rust)
npm run tauri build    # l'app desktop di rilascio
```

### 🙏 Crediti e licenze

- **Animazioni**: il catalogo si ispira a [HyperFrames](https://github.com/heygen-com/hyperframes) di HeyGen (Apache-2.0); i disegni sono riscritti da zero per il nostro motore, nessun codice è copiato. I caratteri vengono da [Fontsource](https://fontsource.org) (SIL Open Font License).
- **AI nell'app (1.3.0)**: [transformers.js](https://github.com/huggingface/transformers.js) 4.3.1 (Apache-2.0) e [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT) sono copiati dentro l'app con le loro licenze (`ai/LICENSE-*.txt`).
- **Togliere lo sfondo**: i modelli non stanno nell'app, si scaricano al primo uso da Hugging Face e restano sul computer: [BEN2](https://huggingface.co/PramaLLC/BEN2) e [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) (MIT), [MODNet](https://github.com/ZHKKKe/MODNet) (Apache-2.0), [SAM 2.1](https://github.com/facebookresearch/sam2) e [SlimSAM](https://github.com/czg1225/SlimSAM) (Apache-2.0), tutti via [transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0). Per la chiave a colori e il ritaglio ho letto come li fa [OpenReel](https://github.com/Augani/openreel-video) per confrontare le idee; il codice è nostro.

### ✅ Controlli automatici

```bash
npm run build
npx playwright install chromium
node test/prove.mjs    # oltre 300 prove (più `node test/prove-nuove.mjs [sfondo|animazioni|montage|aiuto]` da sole): timecode, 1 taglia (e sceglie il pezzo corto), 2 elimina (e passa alla
                       # dopo), S separa/unisce, Q e W, tracce accese, rotella, niente viene coperto, volume
                       # trascinato, FX sulle clip (si attaccano ai bordi, seguono la clip, suoni accesi/spenti
                       # e nel mixaggio), Alt+Shift, maniglie delle dissolvenze, navigatore, pagina Finale
                       # (sottotitoli AI, logo, apertura), effetti che si sommano, menu dentro lo schermo,
                       # riga SOTT (sposta, unisci, dividi), più timeline, LIVE con pausa, novità, istantanea, tre punti dalla sorgente,
                       # play col clic, countdown fino a 1, forme delle dissolvenze, cartelle, anteprime coi fotogrammi veri, riquadro
                       # sui sottotitoli, pacchetto .daprod salvato e riaperto, LIVE con webcam, 3-2-1, segni e stile presentazione,
                       # play dal mezzo di una ripresa col GOP lungo e proxy, EDL, export WebM riletto
node test/foto.mjs     # foto del banco (computer, Finale, contenitore, timeline, LIVE, telefono) in test/.out/
```

### 📁 Dove sta cosa

- `src/core/` il modello: tipi, timecode (anche drop-frame), operazioni di montaggio, annulla, gli FX a blocchetti (`blocchi.ts`) e il catalogo dei loro suoni (`suoni.ts`), gli effetti della clip che si sommano (`effettiClip.ts`), le timeline (`sequenze.ts`), i sottotitoli, i titoli e countdown pronti (`generatori.ts`), le cornici (bolla, presentazione: `cornici.ts`).
- `src/pacchetto.ts` il pacchetto .daprod (zip e zip64, scrittura e lettura).
- `src/media/` Mediabunny: contenitore, fotogrammi (flusso e ricerca), proxy automatici, banco audio.
- `src/render/` il piano di ogni fotogramma e il mixer WebGL2 (effetti a tempo, colore automatico e colore finale, logo e sottotitoli), titolatrice e countdown, le anteprime del contenitore coi fotogrammi del cursore (`provino.ts`).
- `src/ui/` timeline, monitor, pulsantiera, contenitore, proprietà, pagina Finale, pagina LIVE (`live.ts`), pagina DaProdMontage (`montage.ts`), togliere lo sfondo (`sfondo.ts`), mixer e VU, strumenti, finestre.
- Per ritrovare le cose: `src/ui/cerca.ts` (Ctrl+K) con quello che si trova in `fontiCerca.ts`, `src/ui/guida.ts` (F1, Come si fa), `src/ui/centroAI.ts` (Centro AI) e, sotto, `src/media/libreriaAI.ts` (la libreria AI dentro l'app e i ripieghi), `erroriAI.ts` (gli errori spiegati), `diagnosiAI.ts` (Controlla l'AI).
- `src/azioni.ts` tutti i comandi con i loro tasti · `src/effetti.ts` gli effetti al volo · `src/export/` export ed EDL · `src/demo.ts` il montaggio dimostrativo.
- `src-tauri/` l'app Rust, con `gen/android` per l'APK · `test/` le prove.

## Limiti

Il mosaico non garantisce anonimizzazione irreversibile: controlla tutta la clip e il tracking. La 1.5.7 non applica la censura dei progetti nuovi: non usare il downgrade per consegnare immagini protette.
