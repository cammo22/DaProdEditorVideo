//! L'apertura dei file del programma col doppio clic su Windows.
//!
//! L'installazione "per utente" (NSIS, `currentUser`) scrive le associazioni sotto `HKCU\Software\Classes`; il
//! portatile non scrive niente e un'installazione rovinata può averle perse. Qui si rifà lo stesso lavoro: per
//! `.dap`, `.daprod` e `.dpv` un tipo di file (ProgID) che apre l'exe in uso con il file come argomento (`lib.rs`
//! lo prende da `file_progetto`), e poi si avvisa la shell con `SHChangeNotify` così Esplora risorse aggiorna icone
//! e "Apri con" senza riavviare. Non si tocca mai `HKLM` (niente permessi da amministratore) e non si forza la scelta
//! che l'utente ha fatto a mano (`UserChoice`, protetta da Windows): se c'è, il passo lo dice.

use serde::Serialize;

#[derive(Serialize)]
pub struct Associazione {
    /// su questo sistema c'è qualcosa da sistemare (solo Windows)
    pub windows: bool,
    /// tutte le estensioni sono già a posto
    pub a_posto: bool,
    /// le estensioni scritte adesso (vuoto se `applica` era falso o era già tutto a posto)
    pub scritte: Vec<String>,
    /// le estensioni che Windows apre con un altro programma per scelta dell'utente
    pub altro_programma: Vec<String>,
}

#[cfg(not(windows))]
#[tauri::command]
pub fn associa_file(_applica: bool) -> Associazione {
    Associazione { windows: false, a_posto: true, scritte: vec![], altro_programma: vec![] }
}

#[cfg(windows)]
mod win {
    use super::Associazione;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const ESTENSIONI: [&str; 3] = ["dap", "daprod", "dpv"];
    const PROG_ID: &str = "DaProdVideo.Progetto";

    fn comando(exe: &str) -> String {
        format!("\"{exe}\" \"%1\"")
    }

    /// il tipo di file è già com'è giusto per questo exe?
    fn tipo_a_posto(classi: &RegKey, exe: &str) -> bool {
        classi
            .open_subkey_with_flags(format!("{PROG_ID}\\shell\\open\\command"), KEY_READ)
            .and_then(|k| k.get_value::<String, _>(""))
            .map(|v| v.eq_ignore_ascii_case(&comando(exe)))
            .unwrap_or(false)
    }

    fn estensione_a_posto(classi: &RegKey, ext: &str) -> bool {
        classi
            .open_subkey_with_flags(format!(".{ext}"), KEY_READ)
            .and_then(|k| k.get_value::<String, _>(""))
            .map(|v| v == PROG_ID)
            .unwrap_or(false)
    }

    /// se l'utente ha scelto a mano un altro programma, Windows lo ricorda qui e comanda lui
    fn scelta_altrui(ext: &str) -> bool {
        let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
            format!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.{ext}\\UserChoice"),
            KEY_READ,
        ) else {
            return false;
        };
        k.get_value::<String, _>("ProgId").map(|v| !v.is_empty() && v != PROG_ID).unwrap_or(false)
    }

    pub fn associa(applica: bool) -> Result<Associazione, String> {
        let e = |x: std::io::Error| x.to_string();
        let exe = std::env::current_exe().map_err(e)?.to_string_lossy().into_owned();
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (classi, _) = hkcu.create_subkey_with_flags("Software\\Classes", KEY_READ | KEY_WRITE).map_err(e)?;
        let altro_programma: Vec<String> = ESTENSIONI.iter().filter(|x| scelta_altrui(x)).map(|x| format!(".{x}")).collect();
        let tutto_giusto = tipo_a_posto(&classi, &exe) && ESTENSIONI.iter().all(|x| estensione_a_posto(&classi, x));
        if tutto_giusto || !applica {
            return Ok(Associazione { windows: true, a_posto: tutto_giusto && altro_programma.is_empty(), scritte: vec![], altro_programma });
        }
        // il tipo di file: nome, icona (la prima dell'exe) e il comando che apre il file
        let (tipo, _) = classi.create_subkey(PROG_ID).map_err(e)?;
        tipo.set_value("", &"Progetto DaProd Video").map_err(e)?;
        let (icona, _) = tipo.create_subkey("DefaultIcon").map_err(e)?;
        icona.set_value("", &format!("\"{exe}\",0")).map_err(e)?;
        let (cmd, _) = tipo.create_subkey("shell\\open\\command").map_err(e)?;
        cmd.set_value("", &comando(&exe)).map_err(e)?;
        let mut scritte = Vec::new();
        for ext in ESTENSIONI {
            let (k, _) = classi.create_subkey(format!(".{ext}")).map_err(e)?;
            k.set_value("", &PROG_ID).map_err(e)?;
            // anche fra i programmi proposti da "Apri con"
            let (o, _) = k.create_subkey("OpenWithProgids").map_err(e)?;
            o.set_value(PROG_ID, &"").map_err(e)?;
            scritte.push(format!(".{ext}"));
        }
        // la shell aggiorna icone e "Apri con" da sola
        unsafe {
            use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
            SHChangeNotify(SHCNE_ASSOCCHANGED as i32, SHCNF_IDLIST, std::ptr::null(), std::ptr::null());
        }
        Ok(Associazione { windows: true, a_posto: altro_programma.is_empty(), scritte, altro_programma })
    }
}

/// Controlla (`applica` falso) o sistema (`applica` vero) l'apertura dei .dap, .daprod e .dpv col programma.
#[cfg(windows)]
#[tauri::command]
pub fn associa_file(applica: bool) -> Result<Associazione, String> {
    win::associa(applica)
}
