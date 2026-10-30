<p align="center">
  <b>DaProd Editor Video</b><br>
  Un editor video per Windows e Mac, in stile banco di montaggio.<br>
  Lo tieni sul tuo PC. Niente account, niente abbonamento.
</p>

<p align="center">
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="https://img.shields.io/github/v/release/cammo22/DaProdEditorVideo?label=versione&color=ffd54a&labelColor=1a1428&style=for-the-badge" alt="Versione"></a>
  <img src="https://img.shields.io/badge/100%25-offline-5dffb4?labelColor=1a1428&style=for-the-badge" alt="Offline">
  <img src="https://img.shields.io/badge/gratis-senza%20pubblicit%C3%A0-ff3df2?labelColor=1a1428&style=for-the-badge" alt="Gratis">
  <a href="TERZE-PARTI.md"><img src="https://img.shields.io/badge/licenze-di%20terzi-a19db0?labelColor=1a1428&style=for-the-badge" alt="Licenze di terzi"></a>
</p>

<br>

<h2 align="center">Scarica</h2>

<p align="center">
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="https://img.shields.io/badge/Windows-installer-ffd54a?labelColor=1a1428&style=for-the-badge&logo=windows" alt="Scarica per Windows, installer"></a>
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="https://img.shields.io/badge/Windows-portatile-ffd54a?labelColor=1a1428&style=for-the-badge" alt="Scarica per Windows, portatile"></a>
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="https://img.shields.io/badge/Mac-DMG-ffd54a?labelColor=1a1428&style=for-the-badge&logo=apple" alt="Scarica per Mac"></a>
</p>

<p align="center"><sub>Dalla pagina delle release scegli il file della tua versione:<br>
<b>DaProd-Video-&lt;versione&gt;-setup.exe</b> (installer Windows) · <b>DaProd-Video-&lt;versione&gt;-portatile.exe</b> (Windows senza installazione) · <b>DaProd-Video-&lt;versione&gt;.dmg</b> (Mac).</sub></p>

<p align="center"><sub>Windows può dire «Windows ha protetto il PC»: premi <b>Ulteriori informazioni → Esegui comunque</b>. Il Mac, la prima volta: <b>tasto destro → Apri</b>. I file non sono firmati a pagamento.</sub></p>

<br>

<h2 align="center">Cosa fa</h2>

- 🎬 **Montaggio a tracce**: tagli, spostamenti, dissolvenze, velocità. Il tasto **1** taglia, il tasto **2** elimina.
- 🎛️ **Proprietà a schede**: Quadro, Colore, Audio e AI, sempre nello stesso posto.
- 🔊 **Finale**: volume in LUFS, controllo prima dell'uscita, preset per YouTube, Reel/TikTok, Instagram e master.
- 📡 **LIVE**: registri schermo, webcam e microfono. Scene in diretta (tasti 1–6), telecomando a parte.
- 🪄 **Montage**: scegli i file e lo stile, il programma monta da solo. Ritocchi veloci, e lo stesso seme dà lo stesso montaggio.
- 🎨 **Colore**: LUT `.cube`, ruote lift/gamma/gain, curve RGB.
- 🔑 **Keyframe e maschere**: posizione, zoom, opacità, colore, volume ed effetti. Maschere a rettangolo, ellisse e Bézier.
- 🔤 **Titoli animati**: 24 animazioni pronte. Monitor ed esportazione sono identici.
- 🧠 **AI locali** (vedi sotto): sfondo, rumore, voce, sottotitoli.
- 💾 **Non perdi il lavoro**: autosalvataggio, «Recupera il lavoro» dopo un crash, file `.dap` con i media dentro.

<br>

<h2 align="center">Requisiti</h2>

- **Windows 10 o 11**, oppure **macOS 14** o più nuovo.
- **Minimo**: un PC Windows o Mac normale. Il montaggio va anche senza scheda video.
- **Per l'AI pesante** (rumore, sfondo, separazione voce): una scheda **NVIDIA RTX** con **8 GB** di memoria video è consigliata. Senza scheda video l'AI gira lo stesso, ma più lenta.
- Spazio libero sul disco: i modelli AI pesano da pochi MB a qualche GB. Li scarichi solo se li vuoi.

<br>

<h2 align="center">Primi passi</h2>

1. Apri il programma e crea un progetto nuovo (File → Nuovo).
2. Trascina i video nel **Contenitore** a sinistra, poi sulla timeline.
3. Taglia con **1**, togli le parti brutte con **2**, sposta le clip con il mouse.
4. Vai al **Finale**, scegli il preset e fai partire l'esportazione.

<br>

<h2 align="center">Tasti principali</h2>

| Tasto | Cosa fa |
| --- | --- |
| **1** | Taglia (sulle tracce accese, o sulla clip sotto il cursore) |
| **2** | Elimina lo scarto |
| **S** | Separa / unisci |
| **Q / W** | Togli lo scarto |
| **Rotella** | Avanti o indietro di un fotogramma, con il suono |
| **Ctrl + rotella** | Zoom della timeline |
| **Alt + E** | Velocità della clip |
| **Ctrl + D** | Duplica |
| **Ctrl + K** | Cerca in tutto il programma |
| **F1** | Guida |
| **F8** | Montage |
| **F10** | LIVE |

Tutti i comandi sono in `src/azioni.ts`. **Ctrl + K** li trova anche per nome.

<br>

<h2 align="center">AI: cosa è pronto e cosa è opzionale</h2>

**Pronto nel programma** (si scarica il modello la prima volta, poi gira nel programma):

- **Togli lo sfondo**: SAM 3 con clic sull'oggetto, o persona.
- **Segui un oggetto**: tracking che sposta testo, immagini ed effetti.
- **Togli i rumori**: MossFormer2 o DeepFilterNet3.
- **Voce e base**: separa voce e musica (Demucs).
- **Sottotitoli automatici**: Whisper, da 40 MB fino a 564 MB.
- **Montaggio automatico** e **colore automatico**: nessun modello, sono regole del programma.

**Opzionale** (si accende solo se lo chiedi, dal Centro AI):

- Trova i tagli automatici, voce pulita, voce e musica con Kim Vocal 2.
- Sottotitoli con Nemotron o con parole e tempi (Qwen3-ASR), traduzione dei sottotitoli (Hy-MT2).
- Voce AI e voce realistica (Qwen3-TTS).
- Voce da podcast (Clear): licenza source-available, si può spegnere.

**Sperimentale**: rallentatore fluido (RIFE).

Ogni risultato è materiale che puoi modificare. L'originale resta, e **Ctrl + Z** annulla.

<br>

<h2 align="center">Privacy</h2>

Tutto resta sul tuo PC. I video, l'audio e i progetti non vanno su internet. I modelli AI si scaricano una volta e poi girano in locale. I tuoi file non escono dal PC. Unico contatto esterno: il download dei modelli AI e, se usi Clear, un conteggio d'uso anonimo del suo SDK.

<br>

<h2 align="center">Licenze di terze parti</h2>

Il programma usa componenti di terzi, ognuno con la sua licenza. L'elenco completo e i testi sono in [TERZE-PARTI.md](TERZE-PARTI.md).

<br>

<p align="center">
  <b><a href="CHANGELOG.md">Novità</a></b> &nbsp;·&nbsp;
  <b><a href="TERZE-PARTI.md">Software di terzi</a></b> &nbsp;·&nbsp;
  <b><a href="https://cammo22.github.io/DaProdStore/">Negozio DaProd</a></b> &nbsp;·&nbsp;
  <b><a href="https://discord.gg/Njs52aacwq">Discord</a></b>
</p>

<p align="center"><sub>Un'app <b>DaProd Produzioni</b>, fatta con cura e in italiano.</sub></p>
