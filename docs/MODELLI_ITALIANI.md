# Voci e trascrizione in italiano (desktop)

In Impostazioni → Voce scarica **DaP Italiano · Supertonic 3** (400 MB). Nel dialogo di sintesi scegli il modello e una delle voci **DaP F1, F2, F3, M1, M2, M3**: sono sei preset distinti dello stesso modello multilingue, non sei download. L'editor imposta `it` per tutti e sei; il risultato è un WAV nel progetto. Non occorrono account, Python o GPU.

Per i sottotitoli scarica **DaP Italiano · Whisper Small Q5_1** (190 MB) e scegli Italiano come lingua. È una quantizzazione del modello multilingue, non un modello addestrato solo in italiano. [Parakeet TDT v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) comprende l'italiano ma il decoder TDT non è compatibile con whisper.cpp: aggiungere il checkpoint al catalogo non lo renderebbe eseguibile. Non viene offerto.

I file dei modelli sono identici per Linux e Windows. I pacchetti desktop x86-64 includono whisper.cpp con il backend CPU e ONNX Runtime. Sintesi e riconoscimento verificati su Linux x86-64; su Windows x86-64 sono state controllate le librerie del pacchetto (`onnxruntime.dll`, `whisper.dll`, `ggml-cpu-*.dll`), non l'inferenza nativa. Nessuna verifica su ARM.

## Sorgenti e distribuzione

- [Supertonic 3, revisione verificata](https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323): grafi, configurazione e preset con [BigScience Open RAIL-M](https://huggingface.co/Supertone/supertonic-3/blob/3cadd1ee6394adea1bd021217a0e650ede09a323/LICENSE). Il programma scarica la licenza insieme ai pesi. Dichiarare che la voce è generata; per ridistribuire, conservare gli avvisi, fornire la licenza e trasmettere le restrizioni d'uso (§4 e Allegato A). La licenza MIT del codice di inferenza non si estende ai pesi.
- [Whisper Small Q5_1, file GGML](https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin): pesi [OpenAI Whisper, MIT](https://github.com/openai/whisper/blob/main/LICENSE). Allegare l'avviso MIT in caso di redistribuzione.

Non serve pubblicare un mirror: l'installazione prova anche gli URL pubblici fissati nel [manifest](../models/manifest.toml) e controlla i SHA-256. Per preparare e verificare una copia **fuori dalla repo**, dalla radice:

```sh
python3 scripts/models.py --check
python3 scripts/models.py mirror --out ../dap-modelli-it --only supertonic --only whisper-small-q5_1
```

Su Windows usare `py -3` al posto di `python3`. L'output è un mirror piatto, non una directory modelli da copiare direttamente nell'app. Per ripetere il test dei servizi usati dalle impostazioni con una directory temporanea pulita (toolchain di sviluppo desktop già configurata):

```sh
cd src
DAP_SPEECH_TEST_DIR="$(mktemp -d)" cargo test --locked -p concat-speech --features chatterbox --test italian -- --ignored --nocapture
```
