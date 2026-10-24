//! Gli aggiornamenti dell'app: la versione nuova si scarica dalla release di GitHub con il `curl` del sistema
//! (c'è su Windows 10/11 e sul Mac: niente librerie in più) e poi si apre.
//!  · Windows installabile: parte il setup nuovo in modalità aggiornamento (installa sopra, senza disinstallare prima) e questa si chiude;
//!  · Windows portatile: l'exe nuovo si mette accanto a quello vecchio, si apre, e questa si chiude;
//!  · Mac: si apre il .dmg (si trascina l'app in Applicazioni, come la prima volta).
//! Su Android l'APK lo scarica il browser (lo installa il telefono).

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager};

type Esito<T> = Result<T, String>;

const RELEASE: &str = "https://github.com/cammo22/DaProdVideo/releases/download/";
const API: &str = "https://api.github.com/repos/cammo22/DaProdVideo/releases/latest";
const FEED: &str = "https://github.com/cammo22/DaProdVideo/releases/latest/download/aggiornamento.json";

fn leggi_release(url: &str) -> Esito<serde_json::Value> {
    let mut c = Command::new("curl");
    c.args(["--fail", "--location", "--silent", "--show-error", "--connect-timeout", "10", "--max-time", "20",
        "--proto", "=https", "--proto-redir", "=https", "--user-agent", "DaProdVideo-aggiornamenti",
        "--header", "Accept: application/json", url]);
    let r = senza_finestra(&mut c).output().map_err(|e| format!("Il controllo non parte: {e}"))?;
    if !r.status.success() {
        return Err(format!("GitHub non raggiungibile: {}", String::from_utf8_lossy(&r.stderr).trim()));
    }
    let j: serde_json::Value = serde_json::from_slice(&r.stdout).map_err(|_| "GitHub ha restituito una risposta non valida".to_string())?;
    if !j["tag_name"].is_string() || !j["assets"].is_array() {
        return Err("La release non contiene i file di aggiornamento".into());
    }
    Ok(j)
}

/// La rete di sistema evita i problemi della WebView; il feed pubblico non usa la quota dell'API.
#[tauri::command]
pub async fn aggiornamento_release() -> Esito<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(|| {
        leggi_release(API).or_else(|api| leggi_release(FEED).map_err(|feed| format!("{api}; feed di riserva: {feed}")))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    #[ignore = "richiede GitHub: eseguire esplicitamente con --ignored"]
    fn controllo_reale_api_e_feed_di_riserva() {
        for url in [API, FEED] {
            let r = leggi_release(url).expect("release raggiungibile dalla rete Rust");
            assert!(r["assets"].as_array().unwrap().iter().any(|a| a["name"].as_str().unwrap_or("").ends_with("-setup.exe")));
        }
    }
}

#[derive(Serialize)]
pub struct Variante {
    os: &'static str,
    portatile: bool,
}

fn cartella_exe() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|p| p.to_path_buf())
}

/// Che app è questa: il sistema, e se è la versione portatile (niente disinstallatore accanto all'exe).
#[tauri::command]
pub fn variante_app() -> Variante {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "linux"
    };
    let portatile = cfg!(target_os = "windows")
        && cartella_exe().map(|d| !d.join("uninstall.exe").exists()).unwrap_or(false);
    Variante { os, portatile }
}

/// Dove va il file scaricato: il portatile accanto a quello vecchio (se si può scrivere), il resto nella
/// cartella temporanea.
fn destinazione(app: &AppHandle, nome: &str, accanto: bool) -> Esito<PathBuf> {
    if nome.is_empty() || nome.contains('/') || nome.contains('\\') || nome.contains("..") || !nome.starts_with("DaProd-Video-") {
        return Err("nome del file di aggiornamento non valido".into());
    }
    if accanto {
        if let Some(d) = cartella_exe() {
            let prova = d.join(".daprod-scrivibile");
            if std::fs::write(&prova, b"ok").is_ok() {
                let _ = std::fs::remove_file(&prova);
                return Ok(d.join(nome));
            }
        }
        if let Ok(d) = app.path().download_dir() {
            return Ok(d.join(nome));
        }
    }
    let d = std::env::temp_dir().join("DaProdVideo-aggiornamento");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join(nome))
}

fn senza_finestra(c: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: niente finestra nera del prompt
        c.creation_flags(0x0800_0000);
    }
    c
}

/// Scarica la versione nuova. Ritorna il percorso del file (a download finito).
#[tauri::command]
pub async fn aggiornamento_scarica(app: AppHandle, url: String, nome: String, accanto: bool) -> Esito<String> {
    if !url.starts_with(RELEASE) || nome.contains('/') || nome.contains('\\') || nome.contains("..") {
        return Err("indirizzo non valido".into());
    }
    let dest = destinazione(&app, &nome, accanto)?;
    let parziale = dest.with_extension("parziale");
    let _ = std::fs::remove_file(&parziale);
    let dest2 = dest.clone();
    let esito = tauri::async_runtime::spawn_blocking(move || {
        let mut c = Command::new("curl");
        c.args(["-L", "-f", "-sS", "--connect-timeout", "15", "--max-time", "1800", "--retry", "3", "--proto", "=https", "--proto-redir", "=https", "-o"]).arg(&parziale).arg(&url);
        senza_finestra(&mut c).output()
            .map_err(|e| format!("curl non parte: {e}"))
            .and_then(|r| if r.status.success() { Ok(()) } else {
                let _ = std::fs::remove_file(&parziale);
                Err(format!("download non riuscito: {}", String::from_utf8_lossy(&r.stderr).trim()))
            })
            .and_then(|_| {
                let _ = std::fs::remove_file(&dest2);
                std::fs::rename(&parziale, &dest2).map_err(|e| e.to_string())
            })
    })
    .await
    .map_err(|e| e.to_string())?;
    esito?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Quanto si è scaricato finora (per la barra): la grandezza del file parziale.
#[tauri::command]
pub fn aggiornamento_progresso(app: AppHandle, nome: String, accanto: bool) -> u64 {
    destinazione(&app, &nome, accanto)
        .ok()
        .map(|d| d.with_extension("parziale"))
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0)
}

/// Apre la versione scaricata. Su Windows l'app si chiude subito dopo (il setup la deve sostituire).
#[tauri::command]
pub fn aggiornamento_apri(app: AppHandle, path: String) -> Esito<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("il file scaricato non c'è".into());
    }
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new(&p);
        // il setup (NSIS) si apre in modalità "aggiornamento": niente domanda "disinstalla prima di installare", installa
        // sopra la versione che c'è (impostazioni, file associati e collegamenti restano), mostra solo l'avanzamento
        // (/P) e alla fine riapre l'app da solo (/R). Il portatile è un exe e basta: si apre così com'è.
        let e_setup = p.file_name().map(|n| n.to_string_lossy().to_lowercase().contains("setup")).unwrap_or(false);
        if e_setup {
            c.args(["/UPDATE", "/P", "/R"]);
        }
        c.spawn().map_err(|e| e.to_string())?;
        let a = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(900));
            a.exit(0);
        });
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let _ = &app;
        Command::new("open").arg(&p).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let _ = &app;
        Err("su questo sistema l'aggiornamento si apre dal browser".into())
    }
}
