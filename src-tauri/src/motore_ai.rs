//! Python privato facoltativo. Nessun download o avvio prima di un comando esplicito.
use serde::Serialize;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
    time::Duration,
};

#[derive(Clone, Serialize)]
pub struct Stato {
    stato: String,
    k: Option<f64>,
    dettaglio: String,
    cartella: String,
}
struct Motore {
    child: Option<Child>,
    #[cfg(windows)]
    custodia: Option<Custodia>,
    stato: String,
    k: Option<f64>,
    dettaglio: String,
    porta: u16,
    token: String,
    giro: u64,
}
fn motore() -> &'static Mutex<Motore> {
    static M: OnceLock<Mutex<Motore>> = OnceLock::new();
    M.get_or_init(|| {
        Mutex::new(Motore {
            child: None,
            #[cfg(windows)]
            custodia: None,
            stato: "non-installato".into(),
            k: None,
            dettaglio: String::new(),
            porta: 0,
            token: String::new(),
            giro: 0,
        })
    })
}
fn radice() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(|p| PathBuf::from(p).join("DaProdVideo/motori/qwen3-tts-v1"))
        .ok_or("Serve Windows con LOCALAPPDATA disponibile".into())
}
fn comando(nome: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(nome);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    c
}
// Il Job Object chiude anche uv/pip e gli altri figli se l'app termina a forza.
// L'handle non viene ereditato: la sua unica proprietà è del gestore Rust.
#[cfg(windows)]
struct Custodia(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
unsafe impl Send for Custodia {}
#[cfg(windows)]
impl Drop for Custodia {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(windows)]
fn custodisci(child: &mut Child) -> Result<Custodia, String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::*;
    let esito = unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            Err(std::io::Error::last_os_error().to_string())
        } else {
            let job = Custodia(handle);
            let mut limiti: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limiti.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limiti as *const _ as *const _,
                std::mem::size_of_val(&limiti) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0
            {
                Err(std::io::Error::last_os_error().to_string())
            } else {
                Ok(job)
            }
        }
    };
    if esito.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    esito.map_err(|e| format!("Non riesco a proteggere il processo del motore: {e}"))
}
fn arresta(m: &mut Motore) {
    m.giro += 1;
    #[cfg(windows)]
    {
        m.custodia = None;
    }
    if let Some(mut child) = m.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    m.porta = 0;
    m.token.clear();
    m.k = None;
}
pub fn chiudi() {
    if let Ok(mut m) = motore().lock() {
        arresta(&mut m);
    }
}
fn aggiorna(m: &mut Motore, r: &PathBuf) {
    if let Some(c) = m.child.as_mut() {
        if let Ok(Some(esito)) = c.try_wait() {
            let installava = m.stato == "installazione";
            m.child = None;
            #[cfg(windows)]
            {
                m.custodia = None;
            }
            m.porta = 0;
            m.token.clear();
            if installava && esito.success() && r.join("pronto").exists() {
                m.stato = "pronto".into();
                m.k = Some(1.0);
            } else {
                m.stato = "errore".into();
                if m.dettaglio.is_empty() {
                    m.dettaglio =
                        "Il motore si è fermato. Riprova; i dettagli sono nella sua cartella."
                            .into();
                }
            }
        }
    } else if m.stato != "errore" {
        m.stato = if r.join("pronto").exists() {
            "pronto"
        } else {
            "non-installato"
        }
        .into();
    }
}
fn leggi_eventi(child: &mut Child, giro: u64) {
    let out = child.stdout.take().unwrap();
    std::thread::spawn(move || {
        for linea in BufReader::new(out).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&linea) {
                let Ok(mut m) = motore().lock() else { break };
                if m.giro != giro {
                    break;
                }
                if let Some(p) = v["porta"].as_u64().filter(|p| *p > 0 && *p <= 65535) {
                    m.porta = p as u16;
                    m.stato = "acceso".into();
                    m.k = Some(1.0);
                }
                if let Some(k) = v["k"].as_f64() {
                    m.k = Some(k.clamp(0.0, 1.0));
                }
                if let Some(t) = v["dettaglio"].as_str() {
                    m.dettaglio = t.chars().take(500).collect();
                }
            }
        }
    });
}
#[tauri::command]
pub fn ai_locale_stato() -> Result<Stato, String> {
    let r = radice()?;
    let mut m = motore().lock().map_err(|e| e.to_string())?;
    aggiorna(&mut m, &r);
    Ok(Stato {
        stato: m.stato.clone(),
        k: m.k,
        dettaglio: m.dettaglio.clone(),
        cartella: r.to_string_lossy().into(),
    })
}
#[tauri::command]
pub fn ai_locale_installa() -> Result<(), String> {
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("Per ora il motore AI locale si installa su Windows x64".into());
    }
    let r = radice()?;
    let mut m = motore().lock().map_err(|e| e.to_string())?;
    aggiorna(&mut m, &r);
    if m.child.is_some() {
        return Err("Prima spegni il motore o aspetta l’installazione".into());
    }
    if r.join("pronto").exists() {
        m.stato = "pronto".into();
        m.k = Some(1.0);
        m.dettaglio = "Il motore è già installato".into();
        return Ok(());
    }
    std::fs::create_dir_all(&r).map_err(|e| e.to_string())?;
    std::fs::write(
        r.join("installa.ps1"),
        include_str!("../motore/installa.ps1"),
    )
    .map_err(|e| e.to_string())?;
    let log =
        std::fs::File::create(r.join("installazione-errori.log")).map_err(|e| e.to_string())?;
    let mut c = comando("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(r.join("installa.ps1"))
        .arg("-Radice")
        .arg(&r)
        .stdout(Stdio::piped())
        .stderr(log)
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    m.giro += 1;
    #[cfg(windows)]
    {
        m.custodia = Some(custodisci(&mut c)?);
    }
    m.stato = "installazione".into();
    m.k = Some(0.0);
    m.dettaglio = "Preparo l’installazione…".into();
    leggi_eventi(&mut c, m.giro);
    m.child = Some(c);
    Ok(())
}
#[tauri::command]
pub fn ai_locale_accendi() -> Result<(), String> {
    let r = radice()?;
    let mut m = motore().lock().map_err(|e| e.to_string())?;
    aggiorna(&mut m, &r);
    if m.child.is_some() {
        return if m.stato == "acceso" || m.stato == "avvio" {
            Ok(())
        } else {
            Err("Aspetta che finisca l’installazione".into())
        };
    }
    if !r.join("pronto").exists() {
        return Err("Installa prima il motore dal Centro AI".into());
    }
    let mut segreto = [0u8; 32];
    getrandom::fill(&mut segreto).map_err(|e| e.to_string())?;
    m.token = segreto.iter().map(|b| format!("{b:02x}")).collect();
    // Il server e i suoi due moduli (catalogo dei modelli, funzioni): stesse cartelle, sempre aggiornati con l'app.
    for (nome, testo) in [
        ("server.py", include_str!("../motore/server.py")),
        ("motore_catalogo.py", include_str!("../motore/motore_catalogo.py")),
        ("motore_lavoratori.py", include_str!("../motore/motore_lavoratori.py")),
    ] {
        std::fs::write(r.join(nome), testo).map_err(|e| e.to_string())?;
    }
    let log = std::fs::File::create(r.join("server.log")).map_err(|e| e.to_string())?;
    let mut c = comando(
        r.join("venv/Scripts/python.exe")
            .to_str()
            .ok_or("Percorso Python non valido")?,
    )
    .arg("-u")
    .arg(r.join("server.py"))
    .env("DAPROD_TOKEN", &m.token)
    .env("DAPROD_RADICE", &r)
    .env("HF_HUB_OFFLINE", "1")
    .env("TRANSFORMERS_OFFLINE", "1")
    .env("HF_HUB_DISABLE_TELEMETRY", "1")
    .env("DO_NOT_TRACK", "1")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(log)
    .spawn()
    .map_err(|e| e.to_string())?;
    m.giro += 1;
    #[cfg(windows)]
    {
        m.custodia = Some(custodisci(&mut c)?);
    }
    m.stato = "avvio".into();
    m.k = None;
    m.dettaglio = "Accendo il server locale…".into();
    leggi_eventi(&mut c, m.giro);
    m.child = Some(c);
    Ok(())
}
#[tauri::command]
pub fn ai_locale_spegni() -> Result<(), String> {
    let r = radice()?;
    let mut m = motore().lock().map_err(|e| e.to_string())?;
    arresta(&mut m);
    m.stato = if r.join("pronto").exists() {
        "pronto"
    } else {
        "non-installato"
    }
    .into();
    m.dettaglio = "Motore spento, memoria liberata".into();
    Ok(())
}
#[tauri::command]
pub async fn ai_locale_disinstalla() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let r = radice()?;
        let mut m = motore().lock().map_err(|e| e.to_string())?;
        arresta(&mut m);
        if r.exists() {
            std::fs::remove_dir_all(&r).map_err(|e| e.to_string())?;
        }
        m.stato = "non-installato".into();
        m.dettaglio = "Motore e modelli rimossi".into();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn ammessa(metodo: &str, percorso: &str) -> bool {
    matches!(
        (metodo, percorso),
        ("GET", "/salute" | "/modelli")
            | (
                "POST",
                "/modelli/scarica"
                    | "/voce/genera"
                    | "/voce/clona"
                    | "/libera"
                    | "/traduci"
                    | "/voce/pulisci"
                    | "/audio/separa"
                    | "/scene"
                    | "/rallenta"
                    | "/trascrivi"
                    | "/modelli/togli"
                    | "/scambio/scrivi"
                    | "/scambio/leggi"
                    | "/scambio/pulisci"
            )
    ) || (metodo == "GET"
        && percorso.strip_prefix("/lavori/").is_some_and(|id| {
            !id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())
        }))
}
#[tauri::command]
pub async fn ai_locale_richiesta(
    metodo: String,
    percorso: String,
    dati: Value,
) -> Result<Value, String> {
    if !ammessa(&metodo, &percorso) {
        return Err("Richiesta al motore non prevista".into());
    }
    let (porta, token) = {
        let m = motore().lock().map_err(|e| e.to_string())?;
        if m.stato != "acceso" {
            return Err("Accendi il motore dal Centro AI".into());
        }
        (m.porta, m.token.clone())
    };
    tauri::async_runtime::spawn_blocking(move || {
        let corpo = serde_json::to_vec(&dati).map_err(|e| e.to_string())?;
        if corpo.len() > 8 * 1024 * 1024 { return Err("Il campione è troppo grande (massimo 8 MB)".into()); }
        let addr: SocketAddr = ([127,0,0,1], porta).into();
        let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(3)).map_err(|e| e.to_string())?;
        s.set_read_timeout(Some(Duration::from_secs(15))).map_err(|e| e.to_string())?;
        s.set_write_timeout(Some(Duration::from_secs(15))).map_err(|e| e.to_string())?;
        write!(s, "{metodo} {percorso} HTTP/1.0\r\nHost: 127.0.0.1:{porta}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", corpo.len()).map_err(|e| e.to_string())?;
        s.write_all(&corpo).map_err(|e| e.to_string())?;
        let mut risposta = Vec::new(); s.take(32 * 1024 * 1024 + 1).read_to_end(&mut risposta).map_err(|e| e.to_string())?;
        if risposta.len() > 32 * 1024 * 1024 { return Err("Risposta del motore troppo grande".into()); }
        let i = risposta.windows(4).position(|w| w == b"\r\n\r\n").ok_or("Risposta del motore incompleta")?;
        let v: Value = serde_json::from_slice(&risposta[i+4..]).map_err(|e| e.to_string())?;
        if !risposta.starts_with(b"HTTP/1.0 200") { return Err(v["errore"].as_str().unwrap_or("Errore del motore locale").into()); }
        Ok(v)
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
mod prove {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn la_custodia_termina_il_processo() {
        let mut child = comando("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 20",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let job = custodisci(&mut child).unwrap();
        assert!(child.try_wait().unwrap().is_none());
        let prima = std::time::Instant::now();
        drop(job);
        child.wait().unwrap();
        assert!(prima.elapsed() < Duration::from_secs(5));
    }
    #[test]
    fn le_funzioni_nuove_sono_ammesse_e_il_resto_no() {
        for p in [
            "/traduci",
            "/voce/pulisci",
            "/audio/separa",
            "/scene",
            "/rallenta",
            "/trascrivi",
            "/scambio/scrivi",
            "/scambio/leggi",
            "/scambio/pulisci",
            "/modelli/togli",
        ] {
            assert!(ammessa("POST", p), "{p}");
            assert!(!ammessa("GET", p), "{p}");
        }
        assert!(!ammessa("POST", "/scambio/../server.py"));
        assert!(!ammessa("POST", "/scambio"));
    }
    #[test]
    fn percorsi_chiusi() {
        assert!(ammessa("GET", "/lavori/12"));
        for p in [
            "/lavori/../segreto",
            "http://example.org",
            "/lavori/1?x=2",
            "/lavori/",
        ] {
            assert!(!ammessa("GET", p));
        }
    }
}
