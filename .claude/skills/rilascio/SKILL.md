---
name: rilascio
description: Come si fa una versione nuova di DaProd Video (numero, CHANGELOG, CLAUDE.md, PR, controllo della CI su main). Usala quando si chiude un giro di modifiche.
---
# Una versione nuova

- Il numero sale di 0.0.1 (1.5.0 → 1.5.1): `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`. Dopo averlo cambiato si rifà il build.
- Una voce in `CHANGELOG.md` in italiano parlato (cosa cambia per chi monta, non i nomi dei file) e, se serve, un paragrafo in `CLAUDE.md` (architettura nuova: dove sta il codice, nomi dei moduli, come si prova).
- Si lavora sul ramo indicato, si fa il push e la PR in bozza; unita su `main`, la CI (`app.yml`) compila gli eseguibili e pubblica la release (le prove non la fermano), `pages.yml` pubblica la versione prova (toglie `dist/ai`).
- Controllo della CI: usare i job (non i log interi) e `tail_lines` piccoli.
- Sempre dire all'utente cosa NON è stato provato (hardware vero, modelli veri, qualità dell'audio a orecchio).
