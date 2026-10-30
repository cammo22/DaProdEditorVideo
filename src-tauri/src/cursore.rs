//! Il cursore di LIVE: campiona anche con la WebView nascosta, senza ascoltare la tastiera.
//! Il file provvisorio cresce sul disco; le pause e i tagli si rimappano alla consegna del video.
use serde::Serialize;
use std::sync::{mpsc, Mutex};
use std::thread::JoinHandle;
#[cfg(windows)]
use std::time::Instant;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Avviato {
    id: u64,
    trascorsi_ms: f64,
}

#[derive(Clone, Serialize)]
pub struct Schermo {
    id: String,
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

struct Sessione {
    id: u64,
    stop: mpsc::Sender<()>,
    thread: JoinHandle<Result<String, String>>,
}

#[derive(Default)]
pub struct Cursore(Mutex<Option<Sessione>>);

/// L'ultimo campione, per l'anteprima in diretta dello zoom (telecomando e LIVE). I clic si sommano fino alla lettura.
#[derive(Clone, Serialize)]
pub struct Ora {
    cx: f64,
    cy: f64,
    visible: bool,
    clicks: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    win: Option<[f64; 4]>,
}
static ORA: Mutex<Option<Ora>> = Mutex::new(None);

impl Cursore {
    pub fn chiudi(&self) {
        if let Ok(mut attiva) = self.0.lock() {
            if let Some(s) = attiva.take() {
                let _ = s.stop.send(());
                let _ = s.thread.join();
            }
        }
    }
}

impl Drop for Cursore {
    fn drop(&mut self) {
        self.chiudi();
    }
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::ffi::c_void;
    use std::io::{BufWriter, Write};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    #[repr(C)]
    #[derive(Default)]
    struct Punto {
        x: i32,
        y: i32,
    }
    #[repr(C)]
    struct Rett {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct Info {
        size: u32,
        flags: u32,
        cursor: *mut c_void,
        pos: Punto,
    }

    // ABI Win32, senza una dipendenza nuova solo per queste cinque funzioni.
    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(p: *mut Punto) -> i32;
        fn GetCursorInfo(p: *mut Info) -> i32;
        fn GetAsyncKeyState(key: i32) -> i16;
        fn SetThreadDpiAwarenessContext(ctx: isize) -> isize;
        fn WindowFromPoint(p: Punto) -> *mut c_void;
        fn GetAncestor(hwnd: *mut c_void, flags: u32) -> *mut c_void;
        fn GetWindowRect(hwnd: *mut c_void, r: *mut Rett) -> i32;
        fn GetShellWindow() -> *mut c_void;
        fn GetDesktopWindow() -> *mut c_void;
        fn EnumDisplayMonitors(
            dc: *mut c_void,
            clip: *const Rett,
            callback: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut Rett, isize) -> i32,
            data: isize,
        ) -> i32;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmGetWindowAttribute(hwnd: *mut c_void, attr: u32, out: *mut c_void, size: u32) -> i32;
    }

    /// La finestra principale sotto il punto, in pixel fisici (senza l'ombra di Windows). None per desktop e barra.
    fn finestra_sotto(p: &Punto) -> Option<Rett> {
        unsafe {
            let h = WindowFromPoint(Punto { x: p.x, y: p.y });
            if h.is_null() {
                return None;
            }
            let radice = GetAncestor(h, 2); // GA_ROOT
            let radice = if radice.is_null() { h } else { radice };
            if radice == GetShellWindow() || radice == GetDesktopWindow() {
                return None;
            }
            let mut r = Rett { left: 0, top: 0, right: 0, bottom: 0 };
            // DWMWA_EXTENDED_FRAME_BOUNDS: il bordo vero, senza i margini invisibili
            let ok = DwmGetWindowAttribute(radice, 9, &mut r as *mut Rett as *mut c_void, std::mem::size_of::<Rett>() as u32) == 0
                || GetWindowRect(radice, &mut r) != 0;
            if !ok || r.right <= r.left || r.bottom <= r.top {
                return None;
            }
            Some(r)
        }
    }

    unsafe extern "system" fn monitor(
        _m: *mut c_void,
        _dc: *mut c_void,
        r: *mut Rett,
        data: isize,
    ) -> i32 {
        let v = &mut *(data as *mut Vec<Schermo>);
        let r = &*r;
        // L'identità è il rettangolo fisico: se cambia la disposizione, va scelto di nuovo.
        v.push(Schermo {
            id: format!("{}:{}:{}:{}", r.left, r.top, r.right, r.bottom),
            left: r.left,
            top: r.top,
            width: r.right - r.left,
            height: r.bottom - r.top,
        });
        1
    }

    pub fn schermi() -> Result<Vec<Schermo>, String> {
        let mut v = Vec::new();
        unsafe {
            let prima = SetThreadDpiAwarenessContext(-4); // PER_MONITOR_AWARE_V2
            if prima == 0 {
                return Err("Non riesco a leggere le coordinate fisiche dello schermo".into());
            }
            let ok = EnumDisplayMonitors(
                std::ptr::null_mut(),
                std::ptr::null(),
                monitor,
                &mut v as *mut _ as isize,
            );
            SetThreadDpiAwarenessContext(prima);
            if ok == 0 {
                return Err("Non riesco a leggere gli schermi".into());
            }
        }
        Ok(v)
    }

    #[derive(Serialize)]
    struct Campione {
        #[serde(rename = "tMs")]
        t_ms: f64,
        cx: f64,
        cy: f64,
        visible: bool,
        // Ogni bit in salita è un clic fisico: sinistro, destro, centrale.
        clicks: u8,
        // La finestra sotto il cursore (sinistra, alto, destra, basso) in frazioni dello schermo, ogni 100 ms circa.
        #[serde(skip_serializing_if = "Option::is_none")]
        win: Option<[f64; 4]>,
    }

    pub fn avvia(stato: &Cursore, schermo: String) -> Result<Avviato, String> {
        let mut attiva = stato.0.lock().map_err(|e| e.to_string())?;
        if attiva.is_some() {
            return Err("Il cursore sta già registrando".into());
        }
        let b = schermi()?
            .into_iter()
            .find(|s| s.id == schermo)
            .ok_or("Scegli di nuovo lo schermo: la disposizione è cambiata")?;
        static SEQ: AtomicU64 = AtomicU64::new(1);
        let id = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "daprod-cursore-{}-{}.jsonl",
            std::process::id(),
            id
        ));
        let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        let (stop, ricevi) = mpsc::channel();
        let (pronto, avvio) = mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("cursore-live".into())
            .spawn(move || {
                let risultato = (|| -> Result<String, String> {
                    unsafe {
                        if SetThreadDpiAwarenessContext(-4) == 0 {
                            return Err("Coordinate fisiche non disponibili".into());
                        }
                    }
                    let mut out = BufWriter::new(file);
                    let t0 = Instant::now();
                    pronto.send(t0).map_err(|e| e.to_string())?;
                    let tasti = || -> u8 {
                        unsafe {
                            u8::from(GetAsyncKeyState(1) < 0)
                                | (u8::from(GetAsyncKeyState(2) < 0) << 1)
                                | (u8::from(GetAsyncKeyState(4) < 0) << 2)
                        }
                    };
                    let mut prima = tasti(); // un pulsante già premuto all'avvio non è un clic
                    let mut controllo = Instant::now();
                    let mut geometria_valida = true;
                    let mut giro: u32 = 0;
                    loop {
                        giro = giro.wrapping_add(1);
                        if controllo.elapsed() >= Duration::from_secs(1) {
                            // Se il monitor cambia risoluzione o viene scollegato, non inventiamo coordinate.
                            geometria_valida = schermi()
                                .map(|v| v.iter().any(|s| s.id == b.id))
                                .unwrap_or(false);
                            controllo = Instant::now();
                        }
                        let mut p = Punto::default();
                        let mut ci = Info {
                            size: std::mem::size_of::<Info>() as u32,
                            flags: 0,
                            cursor: std::ptr::null_mut(),
                            pos: Punto::default(),
                        };
                        let ok =
                            unsafe { GetCursorPos(&mut p) != 0 && GetCursorInfo(&mut ci) != 0 };
                        let ora = tasti();
                        let x = (p.x - b.left) as f64 / b.width as f64;
                        let y = (p.y - b.top) as f64 / b.height as f64;
                        let visible = geometria_valida
                            && ok
                            && ci.flags & 1 != 0
                            && (0.0..1.0).contains(&x)
                            && (0.0..1.0).contains(&y);
                        let win = if visible && giro % 6 == 0 {
                            finestra_sotto(&p).map(|r| {
                                let fx = |v: i32| ((v - b.left) as f64 / b.width as f64).clamp(0.0, 1.0);
                                let fy = |v: i32| ((v - b.top) as f64 / b.height as f64).clamp(0.0, 1.0);
                                [fx(r.left), fy(r.top), fx(r.right), fy(r.bottom)]
                            })
                        } else {
                            None
                        };
                        let s = Campione {
                            t_ms: t0.elapsed().as_secs_f64() * 1000.0,
                            cx: x,
                            cy: y,
                            visible,
                            clicks: if visible { ora & !prima } else { 0 },
                            win,
                        };
                        prima = ora;
                        if let Ok(mut o) = ORA.lock() {
                            let vecchi = o.as_ref().map(|v| (v.clicks, v.win)).unwrap_or((0, None));
                            *o = Some(Ora { cx: s.cx, cy: s.cy, visible: s.visible, clicks: vecchi.0 | s.clicks, win: s.win.or(vecchi.1) });
                        }
                        serde_json::to_writer(&mut out, &s).map_err(|e| e.to_string())?;
                        out.write_all(b"\n").map_err(|e| e.to_string())?;
                        // Flush periodico: niente ring buffer che perda l'inizio delle registrazioni lunghe.
                        if t0.elapsed().as_millis() % 1000 < 17 {
                            out.flush().map_err(|e| e.to_string())?;
                        }
                        match ricevi.recv_timeout(Duration::from_micros(16_667)) {
                            Err(mpsc::RecvTimeoutError::Timeout) => (),
                            _ => break,
                        }
                    }
                    out.flush().map_err(|e| e.to_string())?;
                    std::fs::read_to_string(&path).map_err(|e| e.to_string())
                })();
                let _ = std::fs::remove_file(path);
                if let Ok(mut o) = ORA.lock() { *o = None; }
                risultato
            })
            .map_err(|e| e.to_string())?;
        *attiva = Some(Sessione { id, stop, thread });
        let t0 = match avvio.recv() {
            Ok(t) => t,
            Err(e) => {
                if let Some(s) = attiva.take() {
                    let _ = s.stop.send(());
                    let _ = s.thread.join();
                }
                return Err(e.to_string());
            }
        };
        Ok(Avviato {
            id,
            trascorsi_ms: t0.elapsed().as_secs_f64() * 1000.0,
        })
    }
}

#[tauri::command]
pub fn cursore_schermi() -> Result<Vec<Schermo>, String> {
    #[cfg(windows)]
    {
        win::schermi()
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn cursore_avvia(stato: tauri::State<'_, Cursore>, schermo: String) -> Result<Avviato, String> {
    #[cfg(windows)]
    {
        win::avvia(&stato, schermo)
    }
    #[cfg(not(windows))]
    {
        let _ = (stato, schermo);
        Err("Il cursore LIVE è disponibile su Windows".into())
    }
}

#[tauri::command]
pub async fn cursore_ferma(stato: tauri::State<'_, Cursore>, id: u64) -> Result<String, String> {
    let s = {
        let mut attiva = stato.0.lock().map_err(|e| e.to_string())?;
        if attiva.as_ref().map(|s| s.id) != Some(id) {
            return Err("Registrazione del cursore già chiusa".into());
        }
        attiva.take().unwrap()
    };
    let _ = s.stop.send(());
    tauri::async_runtime::spawn_blocking(move || {
        s.thread
            .join()
            .map_err(|_| "Il campionatore del cursore si è fermato".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Dov'è il cursore adesso (None se non si sta registrando). I clic tornano a zero dopo ogni lettura.
#[tauri::command]
pub fn cursore_ora() -> Option<Ora> {
    let mut o = ORA.lock().ok()?;
    let v = o.clone();
    if let Some(x) = o.as_mut() { x.clicks = 0; }
    v
}
