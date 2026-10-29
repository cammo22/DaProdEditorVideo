//! DaProd Video — il lato Rust dell'app.
//!
//! L'interfaccia (il banco di montaggio) è web e gira nella WebView del sistema; qui c'è quello che il
//! browser da solo non sa fare bene: leggere i file video a pezzi dal disco (anche da ore di girato,
//! senza caricarli in memoria), scrivere l'export mentre esce, salvare i progetti e l'autosalvataggio.
//! Su Android i file arrivano come `content://` e passano dal plugin fs, che li apre con un descrittore vero.

mod aggiorna;
mod audio_riserva;
mod associazioni;
mod conversioni;
mod motori;

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom, Write};
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

/// File aperti: i media in lettura (restano aperti, si legge a salti) e gli export in scrittura.
#[derive(Default)]
struct Stato {
    letture: Mutex<HashMap<String, Arc<Mutex<std::fs::File>>>>,
    scritture: Mutex<HashMap<u32, Arc<Mutex<std::fs::File>>>>,
    prossimo: Mutex<u32>,
    conversioni: Mutex<conversioni::Conversioni>,
}

type Esito<T> = Result<T, String>;

fn percorso(p: &str) -> FilePath {
    FilePath::from_str(p).unwrap_or_else(|_| FilePath::Path(p.into()))
}

fn apri_lettura(app: &AppHandle, stato: &Stato, path: &str) -> Esito<Arc<Mutex<std::fs::File>>> {
    let mut l = stato.letture.lock().map_err(|e| e.to_string())?;
    if let Some(f) = l.get(path) {
        return Ok(f.clone());
    }
    // non più di 64 file aperti insieme: si chiude il più vecchio a caso
    if l.len() >= 64 {
        if let Some(k) = l.keys().next().cloned() {
            l.remove(&k);
        }
    }
    let mut o = OpenOptions::new();
    o.read(true);
    let f = app
        .fs()
        .open(percorso(path), o)
        .map_err(|e| format!("non riesco ad aprire {path}: {e}"))?;
    let f = Arc::new(Mutex::new(f));
    l.insert(path.to_string(), f.clone());
    Ok(f)
}

/// Dimensione di un file media in byte.
#[tauri::command]
async fn media_dimensione(app: AppHandle, stato: State<'_, Stato>, path: String) -> Esito<u64> {
    let f = apri_lettura(&app, &stato, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut f = f.lock().map_err(|e| e.to_string())?;
        // la dimensione si misura andando in fondo: funziona anche con i descrittori di Android
        f.seek(SeekFrom::End(0)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Legge i byte [start, end) di un file media. Arriva al JavaScript come ArrayBuffer, senza JSON.
#[tauri::command]
async fn media_leggi(app: AppHandle, stato: State<'_, Stato>, path: String, start: u64, end: u64) -> Esito<Response> {
    let f = apri_lettura(&app, &stato, &path)?;
    let dati = tauri::async_runtime::spawn_blocking(move || -> Esito<Vec<u8>> {
        let n = end.saturating_sub(start) as usize;
        let mut buf = vec![0u8; n];
        let mut f = f.lock().map_err(|e| e.to_string())?;
        f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
        let mut letti = 0;
        while letti < n {
            let k = f.read(&mut buf[letti..]).map_err(|e| e.to_string())?;
            if k == 0 {
                break;
            }
            letti += k;
        }
        buf.truncate(letti);
        Ok(buf)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Response::new(dati))
}

/// Chiude un media (quando si toglie dal contenitore).
#[tauri::command]
fn media_chiudi(stato: State<'_, Stato>, path: String) {
    if let Ok(mut l) = stato.letture.lock() {
        l.remove(&path);
    }
}

/// Legge un progetto (.dpv) o un altro file di testo.
#[tauri::command]
async fn progetto_leggi(app: AppHandle, path: String) -> Esito<String> {
    app.fs()
        .read_to_string(percorso(&path))
        .map_err(|e| format!("non riesco a leggere {path}: {e}"))
}

/// Scrive un progetto, una EDL o un altro file di testo. Sul disco vero si scrive accanto e poi si rinomina: se il
/// programma o il computer si fermano a metà, il progetto di prima resta intero (prima si troncava e si riscriveva).
#[tauri::command]
async fn progetto_scrivi(app: AppHandle, path: String, text: String) -> Esito<()> {
    if let FilePath::Path(p) = percorso(&path) {
        let mut nome = p.file_name().map(|n| n.to_os_string()).unwrap_or_default();
        nome.push(".salvo.tmp");
        let tmp = p.with_file_name(nome);
        let scritto = (|| -> std::io::Result<()> {
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(text.as_bytes())?;
            f.sync_all()?;
            std::fs::rename(&tmp, &p)
        })();
        match scritto {
            Ok(()) => return Ok(()),
            // cartelle dove non si possono creare file accanto (o rinominare): si scrive come prima
            Err(_) => {
                let _ = std::fs::remove_file(&tmp);
            }
        }
    }
    let mut o = OpenOptions::new();
    o.write(true).create(true).truncate(true);
    let mut f = app
        .fs()
        .open(percorso(&path), o)
        .map_err(|e| format!("non riesco a scrivere {path}: {e}"))?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    f.flush().map_err(|e| e.to_string())
}

fn file_autosalvataggio(app: &AppHandle) -> Esito<std::path::PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("autosalvataggio.dpv"))
}

/// Autosalvataggio: si scrive accanto e poi si rinomina, così un'interruzione non lascia un file mozzo.
#[tauri::command]
async fn autosalva(app: AppHandle, text: String) -> Esito<()> {
    let f = file_autosalvataggio(&app)?;
    let tmp = f.with_extension("tmp");
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

#[tauri::command]
async fn autosalvataggio_leggi(app: AppHandle) -> Esito<String> {
    let f = file_autosalvataggio(&app)?;
    Ok(std::fs::read_to_string(f).unwrap_or_default())
}

/// Dove si salva un'istantanea (il fotogramma fotografato dal monitor): nella cartella dati dell'app,
/// così il progetto la ritrova anche dopo. Il nome non si ripete mai.
#[tauri::command]
async fn istantanea_percorso(app: AppHandle, name: String) -> Esito<String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("istantanee");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pulito: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || " ._-".contains(c) { c } else { '_' })
        .collect();
    let base = pulito.trim_end_matches(".png").to_string();
    let mut p = dir.join(format!("{base}.png"));
    let mut n = 2;
    while p.exists() {
        p = dir.join(format!("{base} ({n}).png"));
        n += 1;
    }
    Ok(p.to_string_lossy().into_owned())
}

/// Dove va una registrazione dello schermo (pagina LIVE): nella cartella Video, sotto "DaProd Video"
/// (se il sistema non ce l'ha, nella cartella dell'app). Non sovrascrive mai: aggiunge (2), (3)…
#[tauri::command]
async fn registrazione_percorso(app: AppHandle, name: String) -> Esito<String> {
    let base = app.path().video_dir().or_else(|_| app.path().app_data_dir()).map_err(|e| e.to_string())?;
    let dir = base.join("DaProd Video");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pulito: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || " ._-".contains(c) { c } else { '_' })
        .collect();
    let (nome, est) = match pulito.rsplit_once('.') {
        Some((n, e)) if !n.is_empty() && e.len() <= 5 => (n.to_string(), e.to_string()),
        _ => (pulito.clone(), "webm".to_string()),
    };
    let mut p = dir.join(format!("{nome}.{est}"));
    let mut n = 2;
    while p.exists() {
        p = dir.join(format!("{nome} ({n}).{est}"));
        n += 1;
    }
    Ok(p.to_string_lossy().into_owned())
}

/// Le cartelle di lavoro: Video/DaProd Video e, dentro, Registrazioni. Le crea se mancano ("Aggiusta tutto" della pagina
/// iniziale). Ritorna per ognuna il percorso e se l'ha dovuta creare adesso.
#[derive(serde::Serialize)]
struct CartellaLavoro {
    nome: &'static str,
    percorso: String,
    creata: bool,
}

#[tauri::command]
async fn cartelle_lavoro(app: AppHandle) -> Esito<Vec<CartellaLavoro>> {
    let base = app.path().video_dir().or_else(|_| app.path().app_data_dir()).map_err(|e| e.to_string())?;
    let principale = base.join("DaProd Video");
    let registrazioni = principale.join("Registrazioni");
    let mut fuori = Vec::new();
    for (nome, dir) in [("DaProd Video", principale), ("Registrazioni", registrazioni)] {
        let creata = !dir.is_dir();
        std::fs::create_dir_all(&dir).map_err(|e| format!("{nome}: {e}"))?;
        fuori.push(CartellaLavoro { nome, percorso: dir.to_string_lossy().into_owned(), creata });
    }
    Ok(fuori)
}

/// Apre il file dell'export in scrittura; ritorna un numero da usare per scrivere e chiudere.
#[tauri::command]
async fn export_apri(app: AppHandle, stato: State<'_, Stato>, path: String) -> Esito<u32> {
    let mut o = OpenOptions::new();
    o.read(true).write(true).create(true).truncate(true);
    let f = app
        .fs()
        .open(percorso(&path), o)
        .map_err(|e| format!("non riesco a creare {path}: {e}"))?;
    let mut n = stato.prossimo.lock().map_err(|e| e.to_string())?;
    *n += 1;
    let id = *n;
    stato
        .scritture
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, Arc::new(Mutex::new(f)));
    Ok(id)
}

/// Una conversione usa un file NUOVO, creato in esclusiva; l'annullamento può eliminare solo questo.
#[tauri::command]
async fn conversione_apri(app: AppHandle, stato: State<'_, Stato>, name: String) -> Esito<(u32, String)> {
    let path = registrazione_percorso(app, name).await?;
    let mut n = stato.prossimo.lock().map_err(|e| e.to_string())?;
    *n += 1;
    let id = *n;
    let mut conversioni = stato.conversioni.lock().map_err(|e| e.to_string())?;
    let mut scritture = stato.scritture.lock().map_err(|e| e.to_string())?;
    let f = conversioni.crea(id, path.clone().into()).map_err(|e| e.to_string())?;
    scritture.insert(id, Arc::new(Mutex::new(f)));
    Ok((id, path))
}

/// Non accetta percorsi: un ID di export o pacchetto non può cancellare il suo file.
#[tauri::command]
async fn conversione_annulla(stato: State<'_, Stato>, id: u32) -> Esito<()> {
    // Solo gli ID del registro conversioni sono eliminabili. scarta ignora gli altri.
    let mut conversioni = stato.conversioni.lock().map_err(|e| e.to_string())?;
    if !conversioni.contiene(id) { return Ok(()); }
    let f = stato.scritture.lock().map_err(|e| e.to_string())?.remove(&id);
    drop(f);
    conversioni.scarta(id).map_err(|e| format!("non riesco a eliminare la conversione parziale: {e}"))?;
    Ok(())
}

/// Scrive un pezzo dell'export. Il corpo della richiesta sono i byte grezzi; posizione e file
/// arrivano nelle intestazioni (x-pos, x-id). L'MP4 torna indietro a sistemare le intestazioni: si salta.
#[tauri::command]
async fn export_scrivi(stato: State<'_, Stato>, request: Request<'_>) -> Esito<()> {
    let id: u32 = request
        .headers()
        .get("x-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or("manca x-id")?;
    let pos: u64 = request
        .headers()
        .get("x-pos")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or("manca x-pos")?;
    let InvokeBody::Raw(dati) = request.body() else {
        return Err("servono byte grezzi".into());
    };
    let f = stato
        .scritture
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .ok_or("export non aperto")?;
    let dati = dati.clone();
    tauri::async_runtime::spawn_blocking(move || -> Esito<()> {
        let mut f = f.lock().map_err(|e| e.to_string())?;
        f.seek(SeekFrom::Start(pos)).map_err(|e| e.to_string())?;
        f.write_all(&dati).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Progetto .dap: riapre un .dap che c'è già per AGGIUNGERE in fondo (senza troncarlo: i video dentro restano dove sono).
#[tauri::command]
async fn pacchetto_riapri(app: AppHandle, stato: State<'_, Stato>, path: String) -> Esito<u32> {
    let mut o = OpenOptions::new();
    o.read(true).write(true);
    let f = app
        .fs()
        .open(percorso(&path), o)
        .map_err(|e| format!("non riesco ad aprire {path} per salvare: {e}"))?;
    let mut n = stato.prossimo.lock().map_err(|e| e.to_string())?;
    *n += 1;
    let id = *n;
    stato
        .scritture
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, Arc::new(Mutex::new(f)));
    Ok(id)
}

/// Quanto è lungo il file aperto in scrittura (dove si comincia ad aggiungere).
#[tauri::command]
async fn pacchetto_lunghezza(stato: State<'_, Stato>, id: u32) -> Esito<u64> {
    let f = stato
        .scritture
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .ok_or("pacchetto non aperto")?;
    let mut f = f.lock().map_err(|e| e.to_string())?;
    f.seek(SeekFrom::End(0)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_chiudi(stato: State<'_, Stato>, id: u32) -> Esito<()> {
    let f = stato.scritture.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(f) = f {
        let mut f = f.lock().map_err(|e| e.to_string())?;
        f.flush().map_err(|e| e.to_string())?;
        f.sync_all().ok();
    }
    stato.conversioni.lock().map_err(|e| e.to_string())?.conserva(id);
    Ok(())
}

/// La tabella del CRC-32 degli zip (polinomio 0xEDB88320), fatta una volta sola.
fn tabella_crc() -> &'static [u32; 256] {
    static T: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    T.get_or_init(|| {
        let mut t = [0u32; 256];
        for (i, v) in t.iter_mut().enumerate() {
            let mut c = i as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
            *v = c;
        }
        t
    })
}

/// Pacchetto .daprod: copia i byte [start, end) di un file dentro il pacchetto aperto in scrittura (id), a
/// partire da pos, senza passare dal JavaScript. Continua il CRC-32 `crc` dei pezzi di prima e lo ritorna
/// (serve all'intestazione zip).
#[tauri::command]
async fn pacchetto_copia(app: AppHandle, stato: State<'_, Stato>, path: String, start: u64, end: u64, id: u32, pos: u64, crc: u32) -> Esito<u32> {
    let src = apri_lettura(&app, &stato, &path)?;
    let dst = stato
        .scritture
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .cloned()
        .ok_or("pacchetto non aperto")?;
    tauri::async_runtime::spawn_blocking(move || -> Esito<u32> {
        let t = tabella_crc();
        // si continua il CRC dei pezzi di prima (0 per il primo)
        let mut crc = crc ^ 0xFFFF_FFFFu32;
        let mut buf = vec![0u8; 8 << 20];
        let mut src = src.lock().map_err(|e| e.to_string())?;
        let mut dst = dst.lock().map_err(|e| e.to_string())?;
        src.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
        dst.seek(SeekFrom::Start(pos)).map_err(|e| e.to_string())?;
        let mut resto = end.saturating_sub(start);
        while resto > 0 {
            let n = (resto.min(buf.len() as u64)) as usize;
            let k = src.read(&mut buf[..n]).map_err(|e| e.to_string())?;
            if k == 0 {
                return Err("il file è finito prima del previsto".into());
            }
            for &b in &buf[..k] {
                crc = t[((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
            }
            dst.write_all(&buf[..k]).map_err(|e| e.to_string())?;
            resto -= k as u64;
        }
        Ok(crc ^ 0xFFFF_FFFF)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Il progetto aperto col doppio clic (.dap, .daprod o .dpv): arriva dagli argomenti (Windows, Linux) o dal sistema (Mac).
#[derive(Default)]
struct Avvio(Mutex<Option<String>>);

fn file_progetto(p: &str) -> bool {
    let l = p.to_lowercase();
    l.ends_with(".daprod") || l.ends_with(".dpv") || l.ends_with(".dap")
}

/// Il file da aprire all'avvio (una volta sola: poi torna vuoto).
#[tauri::command]
fn file_di_avvio(avvio: State<'_, Avvio>) -> Option<String> {
    avvio.0.lock().ok()?.take()
}

/// Decodifica audio di riserva (vedi audio_riserva.rs): apre un decoder per una traccia.
#[tauri::command]
fn audio_apri(dec: State<'_, audio_riserva::Decoder>, codec: String, sample_rate: u32, channels: u16, description: Option<Vec<u8>>) -> Esito<u32> {
    dec.apri(&codec, sample_rate, channels, description)
}

/// Decodifica un pacchetto: il corpo sono i byte compressi, x-id il decoder. Torna PCM f32.
#[tauri::command]
async fn audio_decodifica(dec: State<'_, audio_riserva::Decoder>, request: Request<'_>) -> Esito<Response> {
    let id: u32 = request
        .headers()
        .get("x-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or("manca x-id")?;
    let InvokeBody::Raw(dati) = request.body() else {
        return Err("servono byte grezzi".into());
    };
    Ok(Response::new(dec.decodifica(id, dati)?))
}

#[tauri::command]
fn audio_chiudi(dec: State<'_, audio_riserva::Decoder>, id: u32) {
    dec.chiudi(id);
}

/// Apre un link nel browser di sistema.
#[tauri::command]
fn apri_link(app: AppHandle, url: String) -> Esito<()> {
    use tauri_plugin_opener::OpenerExt;
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("solo link web".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Porta la finestra davanti a tutto: la rimette se era ridotta a icona, la mostra, le dà il fuoco e la tiene
/// "sempre in primo piano" per un attimo (Windows altrimenti la lascia dietro le altre, lampeggiando sulla barra).
fn finestra_davanti(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_always_on_top(true);
        let _ = w.set_focus();
        let _ = w.set_always_on_top(false);
    }
}

/// Un progetto da aprire arrivato da fuori (doppio clic sul file con l'app già aperta, o secondo avvio): si ricorda
/// e si dice alla finestra, che lo apre (riusa l'evento `apri-file`).
fn passa_file(app: &AppHandle, s: String) {
    use tauri::Emitter;
    if let Some(a) = app.try_state::<Avvio>() {
        if let Ok(mut x) = a.0.lock() {
            *x = Some(s.clone());
        }
    }
    let _ = app.emit("apri-file", s);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let dall_avvio = std::env::args().skip(1).find(|a| file_progetto(a));
    let mut costruttore = tauri::Builder::default();
    // Una sola finestra alla volta (sul computer): un secondo avvio non apre un'altra copia, passa il file
    // (se c'è) a quella già aperta e la porta davanti. Il plugin dev'essere il primo.
    #[cfg(desktop)]
    {
        costruttore = costruttore.plugin(tauri_plugin_single_instance::init(|app, argomenti, _cartella| {
            if let Some(f) = argomenti.iter().skip(1).find(|a| file_progetto(a)) {
                passa_file(app, f.clone());
            }
            finestra_davanti(app);
        }));
    }
    costruttore
        .setup(|app| {
            // anche al primo avvio la finestra sta davanti
            finestra_davanti(app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Stato::default())
        .manage(Avvio(Mutex::new(dall_avvio)))
        .manage(audio_riserva::Decoder::default())
        .invoke_handler(tauri::generate_handler![
            media_dimensione,
            media_leggi,
            media_chiudi,
            progetto_leggi,
            progetto_scrivi,
            autosalva,
            autosalvataggio_leggi,
            export_apri,
            export_scrivi,
            export_chiudi,
            conversione_apri,
            conversione_annulla,
            pacchetto_copia,
            pacchetto_riapri,
            pacchetto_lunghezza,
            file_di_avvio,
            apri_link,
            istantanea_percorso,
            registrazione_percorso,
            cartelle_lavoro,
            associazioni::associa_file,
            audio_apri,
            audio_decodifica,
            audio_chiudi,
            aggiorna::variante_app,
            aggiorna::aggiornamento_release,
            aggiorna::aggiornamento_scarica,
            aggiorna::aggiornamento_progresso,
            aggiorna::aggiornamento_apri,
            motori::motore_stato,
            motori::motore_scarico,
            motori::motore_installa,
            motori::motore_lancia,
            motori::motore_lavoro,
            motori::motore_ferma,
            motori::motore_dimentica,
            motori::motore_cartella_lavoro,
            motori::motore_elenca,
            motori::motore_peso_modelli,
            motori::motore_pulisci,
            motori::motore_disinstalla,
        ])
        .build(tauri::generate_context!())
        .expect("errore all'avvio di DaProd Video")
        .run(|_app, _ev| {
            // sul Mac il doppio clic su un progetto arriva come evento (anche ad app già aperta)
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _ev {
                for u in urls {
                    let Ok(p) = u.to_file_path() else { continue };
                    let s = p.to_string_lossy().into_owned();
                    if !file_progetto(&s) {
                        continue;
                    }
                    passa_file(_app, s);
                }
            }
        });
}
