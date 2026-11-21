# DaProd Editor Video · Banco

Editor desktop di DaProdProduzioni. La timeline e il motore video derivano da [Concat](https://github.com/jub0t/Concat); il banco di montaggio e i comandi sono quelli DaProd. [Release e download](https://github.com/cammo22/DaProdEditorVideo/releases).

## Avvio

- **Linux x86-64**: se la release include `AppImage.tar`, estrai l’archivio e apri l’AppImage estratta; l’archivio conserva il permesso di esecuzione. Se scarichi direttamente il file `.AppImage`, in Dolphin apri Proprietà → Permessi e abilita l’esecuzione. Da terminale: `chmod u+x ./DaProdEditorVideo-*.AppImage` nella cartella del download.
- **Windows x86-64**: installa il file `-setup.exe` e avvia DaProdEditorVideo dal menu Start.

## Montaggio

**1** taglia alla testina, **2** elimina, **3** elimina chiudendo lo spazio. **S** riunisce o separa le clip selezionate. **Q/W** rifilano prima/dopo la testina. **Spazio** avvia o ferma; sulla timeline la rotella avanza di un fotogramma e Ctrl + rotella regola lo zoom.

Per LIVE, Montage e i progetti della precedente generazione resta disponibile [DaProd 1.8.9](https://github.com/cammo22/DaProdEditorVideo/releases/tag/v1.8.9). La migrazione dei progetti 1.x non è verificata.

[Collaudo del montaggio e dell’export](docs/SMOKE_BANCO.md) · [Origine del codice](DAPROD.md) · [Licenza AGPL](LICENSE) · [Crediti di terze parti](THIRD_PARTY_NOTICES.md).
