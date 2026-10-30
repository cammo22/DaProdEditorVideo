//! Cercare i file mancanti in una cartella: il programma sceglie una cartella e chiede quali file con QUEI nomi ci sono
//! (anche nelle sottocartelle). Serve a «Ricollega» per ritrovare in un colpo solo i media spostati su un altro disco.
//! Si legge solo l'elenco (nome, percorso, grandezza): i file non si aprono.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[cfg_attr(not(test), derive(serde::Serialize))]
#[derive(Debug, Clone, PartialEq)]
pub struct VoceCartella {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// Cartelle che non vale la pena guardare (e quelle nascoste).
fn salta(nome: &str) -> bool {
    nome.starts_with('.') || matches!(nome, "$RECYCLE.BIN" | "System Volume Information" | "node_modules" | "Windows" | "Program Files" | "Program Files (x86)")
}

/// I file della cartella (in profondità fino a `profondita`) il cui nome, in minuscolo, è fra `nomi`.
/// I nomi con lettere fuori dall'ASCII passano sempre: il confronto fine (Mac scrive gli accenti in un altro modo) lo fa chi chiama.
/// Si ferma a `massimo` file trovati e a 200.000 cartelle guardate.
pub fn elenca(radice: &Path, nomi: &HashSet<String>, profondita: u32, massimo: usize) -> Vec<VoceCartella> {
    let mut out = Vec::new();
    let mut coda: Vec<(PathBuf, u32)> = vec![(radice.to_path_buf(), 0)];
    let mut viste = 0usize;
    while let Some((dir, livello)) = coda.pop() {
        viste += 1;
        if viste > 200_000 {
            break;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let nome = e.file_name().to_string_lossy().into_owned();
            let Ok(tipo) = e.file_type() else { continue };
            if tipo.is_symlink() {
                continue;
            }
            if tipo.is_dir() {
                if livello < profondita && !salta(&nome) {
                    coda.push((e.path(), livello + 1));
                }
            } else if tipo.is_file() {
                let minuscolo = nome.to_lowercase();
                if nomi.is_empty() || !minuscolo.is_ascii() || nomi.contains(&minuscolo) {
                    if let Ok(m) = e.metadata() {
                        out.push(VoceCartella { path: e.path().to_string_lossy().into_owned(), name: nome, size: m.len() });
                        if out.len() >= massimo {
                            return out;
                        }
                    }
                }
            }
        }
    }
    out
}

#[cfg(not(test))]
#[tauri::command]
pub async fn cartella_elenca(path: String, nomi: Vec<String>, profondita: u32, massimo: usize) -> Result<Vec<VoceCartella>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let radice = Path::new(&path);
        if !radice.is_dir() {
            return Err(format!("{path} non è una cartella"));
        }
        let nomi: HashSet<String> = nomi.into_iter().map(|n| n.to_lowercase()).collect();
        Ok(elenca(radice, &nomi, profondita.min(12), massimo.clamp(1, 100_000)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::fs;

    #[test]
    fn trova_nelle_sottocartelle_e_salta_il_resto() {
        let base = std::env::temp_dir().join(format!("dpv-cartelle-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("a/b")).unwrap();
        fs::create_dir_all(base.join(".nascosta")).unwrap();
        fs::create_dir_all(base.join("node_modules")).unwrap();
        fs::write(base.join("a/b/Clip.MP4"), vec![0u8; 10]).unwrap();
        fs::write(base.join("altro.txt"), b"x").unwrap();
        fs::write(base.join(".nascosta/Clip.mp4"), b"x").unwrap();
        fs::write(base.join("node_modules/Clip.mp4"), b"x").unwrap();
        let nomi: HashSet<String> = ["clip.mp4".to_string()].into_iter().collect();
        let v = elenca(&base, &nomi, 5, 100);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].name, "Clip.MP4");
        assert_eq!(v[0].size, 10);
        // la profondità limita
        assert_eq!(elenca(&base, &nomi, 1, 100).len(), 0);
        // il massimo ferma la ricerca
        fs::write(base.join("clip.mp4"), b"yy").unwrap();
        assert_eq!(elenca(&base, &nomi, 5, 1).len(), 1);
        let _ = fs::remove_dir_all(&base);
    }
}
