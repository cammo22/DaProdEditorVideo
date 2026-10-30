<p align="center">
  <a href="https://discord.gg/Njs52aacwq"><img src=".github/discord-card.svg" alt="Entra nella community DaProd su Discord" width="720"></a>
</p>

<p align="center">
  <img src="risorse/readme/hero.png" alt="DaP Editor Video — vecchio stile, moderno dentro" width="100%">
</p>

<p align="center">
  <b>Un banco di montaggio per Windows e Mac, nello spirito delle centraline a nastro.</b><br>
  Monti, registri lo schermo, ritocchi il colore ed esporti: tutto sul tuo PC, senza account e senza abbonamenti.
</p>

<p align="center">
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="https://img.shields.io/github/v/release/cammo22/DaProdEditorVideo?label=versione&color=ffd54a&labelColor=0b0a0f&style=for-the-badge" alt="Versione"></a>
  <img src="https://img.shields.io/badge/tutto-in%20locale-5dffb4?labelColor=0b0a0f&style=for-the-badge" alt="Tutto in locale">
  <img src="https://img.shields.io/badge/gratis-senza%20pubblicit%C3%A0-35e8ff?labelColor=0b0a0f&style=for-the-badge" alt="Gratis">
  <a href="https://cammo22.github.io/DaProdStore/"><img src="https://img.shields.io/badge/%F0%9F%9B%92-DaProdStore-ffd54a?labelColor=0b0a0f&style=for-the-badge" alt="DaProdStore"></a>
</p>

<br>

<h2 align="center">⬇&nbsp; Scarica</h2>

<p align="center">
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="risorse/readme/scarica-win.png" alt="Scarica l'installer per Windows" width="49%"></a>
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="risorse/readme/scarica-portatile.png" alt="Scarica la versione portatile per Windows" width="49%"></a>
  <a href="https://github.com/cammo22/DaProdEditorVideo/releases/latest"><img src="risorse/readme/scarica-macos.png" alt="Scarica per Mac" width="49%"></a>
  <img src="risorse/readme/scarica-linux.png" alt="Linux, in arrivo" width="49%">
</p>

<p align="center"><sub>Nella pagina che si apre scegli <b>DaProd-Video-…-setup.exe</b> (installer), <b>…-portatile.exe</b> (senza installazione) o il <b>.dmg</b> per Mac.<br>Una volta installato, il programma si aggiorna da solo.</sub></p>

<br>

<h2 align="center">Cosa sa fare</h2>

<p align="center">
  <img src="risorse/readme/funzioni.png" alt="Montaggio, LIVE, Montage, colore, AI locale, Finale" width="100%">
</p>

<br>

<h2 align="center">Guardalo all'opera</h2>

<p align="center">
  <img src="risorse/readme/vetrina-1.png" alt="Il banco di montaggio" width="100%">
</p>
<p align="center">
  <img src="risorse/readme/vetrina-2.png" alt="Il Finale con il controllo prima dell'uscita" width="100%">
</p>
<p align="center">
  <img src="risorse/readme/vetrina-3.png" alt="LIVE: registrazione dello schermo con le scene" width="100%">
</p>

<br>

<h2 align="center">Le AI sono tue</h2>

<p align="center">
  Sottotitoli, voce pulita, sfondo via, colore automatico: <b>girano sul tuo PC</b>, niente viene mandato a nessuno.<br>
  Quelle pesanti (voce realistica, traduzione, tagli sulle scene) sono <b>opzionali</b>: si installano solo se le scegli,<br>
  dal <b>Centro AI</b>, e ognuna dice quanto pesa e quanta memoria della scheda video usa. Consigliata una NVIDIA da 8 GB.
</p>

<br>

<h2 align="center">Come si installa</h2>

<p align="center">
  <img src="risorse/readme/passi.png" alt="1 Scarica, 2 Installa, 3 Monta" width="100%">
</p>

<p align="center"><sub>Windows può dire «Windows ha protetto il PC», perché l'installatore non ha ancora la firma a pagamento.<br>Premi <b>Ulteriori informazioni → Esegui comunque</b>. Sul Mac, la prima volta: tasto destro sull'app → <b>Apri</b>.</sub></p>

<br>

## I tasti che contano

| Tasto | Cosa fa |
| --- | --- |
| **1** | taglia sotto la testina |
| **2** | elimina |
| **S** | separa o unisce |
| **Q / W** | tolgono lo scarto prima o dopo la testina |
| **Spazio** | play e stop |
| **Rotella** | un fotogramma alla volta, col suono · **Ctrl + rotella** zoom |
| **Ctrl + K** | cerca qualsiasi comando |
| **F1** | la guida · **F8** Montage · **F10** LIVE |

## Com'è fatto

| | |
| --- | --- |
| **L'interfaccia** | **TypeScript** senza framework, grafica «Banco»: metallo scuro, spie che si accendono solo quando serve. |
| **Il motore video** | **WebGPU / WebGL2** per il quadro, **WebCodecs** e [Mediabunny](https://mediabunny.dev) per leggere e scrivere i file: il monitor e l'esportazione fanno lo stesso conto. |
| **L'app** | **Tauri 2 / Rust**: file, progetti, registrazioni, aggiornamenti e il motore AI locale. |
| **Le AI** | Modelli aperti con licenze libere (Apache, MIT), nel programma o nel motore locale opzionale. Elenco completo in [Software di terzi](TERZE-PARTI.md). |

### Come viene sviluppato

Ogni versione ha la sua voce nel [registro delle novità](CHANGELOG.md) e passa da **oltre 330 prove automatiche**. Quando una versione è pronta, una pipeline su GitHub compila Windows e Mac e pubblica la release da sola.

<br>

<p align="center">
  <b><a href="CHANGELOG.md">Novità</a></b> &nbsp;·&nbsp;
  <b><a href="TERZE-PARTI.md">Software di terzi</a></b> &nbsp;·&nbsp;
  <b><a href="https://cammo22.github.io/DaProdStore/">DaProdStore</a></b> &nbsp;·&nbsp;
  <b><a href="https://discord.gg/Njs52aacwq">Discord</a></b>
</p>

<p align="center"><sub>Un'app <b>DaProd Produzioni</b>, fatta con cura e in italiano.</sub></p>
