# Flussi UI — candidato locale per QA

Base motore `faf6c9b4aec68c3e8620ecf201452c35414f363b`, branch `feat/ui-attivita-ai`. Nessun bump, push o merge in questa fase. Frontend e Rust del motore devono essere distribuiti insieme.

## Decisioni e collegamenti reali

- **Montaggio:** tre spazi dal selettore in testata (completo, taglio, effetti), senza cambiare trasporto o tasti 1/2. Attività occupa lo spazio della libreria, non un popover sulla timeline. Preparazioni raggiungibili dalla libreria, dal tasto destro e dalle proprietà.
- **Attività:** tipo e file scelti → Aggiungi da avviare → Avvia. Le API restano quelle di `motore-manuale.md`. Pausa solo per capacità reali; batch su snapshot per non saltare righe cancellate. Le righe parzialmente fallite mostrano l'esito e Riprova. `puoRiprovare(id)` è una nuova lettura del registro retry: le vecchie barre AI senza callback non mostrano un pulsante che non può funzionare. Non avviare altro blocca solo le partenze; Sovraccarica resta disponibile nei dettagli.
- **Finale:** apre Consegna; percorso di finitura e menu con riepiloghi. Un solo pulsante master fisso apre la finestra export esistente, con stime e opzioni reali. Colore e Livella volume usano `preparaOra`; accendere il colore non avvia elaborazioni.
- **LIVE:** fase autorevole dal registratore, etichette Ferma e salva / Annulla partenza, sorgenti vive e configurazione/archivio separati. Nessuna riscrittura di MediaRecorder o cucitura.
- **Montage:** tre passi, anteprima nella timeline reale; analisi in coda con pausa ai confini e controllo di validità prima di salvare il risultato. La pausa non interrompe il singolo campionamento o l'analisi del brano a metà: aspetta il confine successivo. Rigenera sostituisce l'anteprima, Tieni apre Montaggio, Scarta conserva la logica undo precedente.
- **AI:** Centro per compito e selezione esplicita di una clip (niente scelta nascosta sotto il cursore). Consenso comune per rumore/separazione, sfondo, sottotitoli/traduzione/voce; scelta modello nelle impostazioni della funzione, riepilogo/cache/costi nella conferma. Nessun preload dello sfondo alla semplice scelta. Nessuna pausa inventata per i worker. Dimensioni sconosciute e cache parziali vengono dichiarate, non stimate come dati certi. CPU web selezionabile dai dettagli; il backend nativo resta separato.
- **Effetti:** ricerca, categorie e preview rimangono nel catalogo già esistente (75 effetti); proprietà leggono parametri dal catalogo, forza zero consentita. Avviso downgrade della censura in UI/README/CHANGELOG.
- Barra titolo 40 px e regole responsive per intervalli comprendenti 1024/1366/1920. Questo è codice responsive, **non una verifica geometrica o visiva**.

## Verifiche CLI eseguite

- `npm run typecheck`: passa.
- `npm run prova:motore`: **63 test passati**, zero falliti/saltati. Include 10 contratti UI statici: non confonderli con test DOM o interazione. I test di regole comandi/selezione/batch/retry eseguono il codice reale in Node. I decoder/OPFS/GPU registrato restano simulati come documentato dal motore.
- `npm run build`: passa, 262 moduli. Al subentro di Sol il prebuild è stato ripetuto con rete disponibile: prepara transformers.js 4.3.1, onnxruntime-web 1.31.0-dev.20260914-8d85527a0, DeepFilterNet e API audio in public/ai/, senza fallback CDN in questa esecuzione. Il precedente errore fetch non si è ripresentato; non è stata cambiata versione o introdotto un ripiego finto. Presenza dei file e build non certificano inferenza AI offline: Luna deve provarla.
- `node --check test/foto.mjs`: solo sintassi. Corretto `fileURLToPath` per Windows, con test Node che riproduceva `C:\\C:\\...` prima della correzione.
- Rilettura al subentro Sol: corretti il controllo di cambio progetto dopo il salvataggio Voce AI e i test statici su checkout Windows CRLF. Collegati al consenso anche gli ingressi sottotitoli/voce della timeline, prima esclusi. Le prove interattive dello sfondo chiedono consenso una volta per clip/modello/progetto; nessun risultato dello sfondo o dei sottotitoli viene applicato dopo cambio progetto. I nuovi contratti statici sono stati osservati fallire prima della correzione; non sono prove comportamentali DOM. Nessun browser avviato da Sol. Revisione indipendente e interazione spettano a Luna nel grafo esistente.

## Avvio per Luna

Dalla radice del worktree consegnato nel Kanban:

```sh
npm run typecheck
npm run prova:motore
npm run build
npm run dev -- --host 127.0.0.1
```

Aprire l'URL locale stampato da Vite, percorso `/app/`. Per nativo usare lo script Tauri del progetto, con il Rust incluso nella base. Le suite browser sotto sono **da eseguire da Luna**, non sono state lanciate da Astra:

```sh
node test/prove-attivita.mjs
node test/prove-aiuto.mjs
node test/prove-audioai.mjs
node test/prove-audioui.mjs
node test/prove-sottotitoli.mjs
node test/prove-live.mjs
node test/prove-liveaudio.mjs
node test/prove-banco.mjs
node test/prove-montage.mjs
node test/prove-rifiniture.mjs
node test/prove-dap.mjs
node test/prove-pannello.mjs
node test/prove-proprieta.mjs
node test/prove-effetti.mjs
node test/foto.mjs
```

I vecchi test possono attendere un avvio diretto AI: ora devono confermare il consenso, senza bypassarlo. Il pulsante export master è `.fin-esporta-fisso button`; il vecchio duplicato `.fin-vai` non c'è più. Montage mostra un passo per volta: usare i bottoni `.mt-etapes`. I test foto generici non sostituiscono la matrice seguente.

## Gate da completare prima del rilascio

1. Screenshot **1024, 1366, 1920** di Montaggio (tre spazi), Finale, LIVE, Montage, Attività e consenso AI; focus/Tab/Esc, testi lunghi, nessun controllo tagliato né overlay sulla timeline. In LIVE verificare sorgenti, permessi negati, audio, conto/pausa/riprendi/stop e file salvato con sync reale.
2. Import/riapertura/inserimento di 20 file senza job pesanti o nuovi proxy; cache preesistenti; avvio/pausa/riprendi/cancel singolo e batch, inclusi gruppi misti e fallimenti parziali.
3. Ogni AI: nessuna rete del modello prima del consenso, modello assente/rete spenta, errore leggibile, annullamento e cambio progetto senza applicazione tardiva. Distinguere worker finti da modelli/hardware reali.
4. Montage: stesso seme, anteprima/rigenera/scarta/undo, annulla e pausa durante l'ultimo file e prima del brano. Esportare davvero da Finale.
5. Pixel GPU e video codificato, censura in movimento/effetti sovrapposti, performance e compatibilità `.dap/.dpv/.daprod` avanti e indietro: seguire `motore-manuale.md`.
6. Gate0 precedente incompleto: baseline browser scaduta dopo 420 s e foto Windows non prodotte. Il fix del percorso non certifica gli altri passaggi dello script. Non dichiarare assenza di regressioni prima del confronto reale.

Versione e pubblicazione spettano alla fase finale dopo questo gate. Le istruzioni di QA non sono risultati già ottenuti.
