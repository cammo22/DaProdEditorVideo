//! L'audio del computer per LIVE: quello che esce dalle casse o dalle cuffie, preso da Windows (WASAPI in loopback).
//! WebView2 con lo schermo scelto in automatico consegna una traccia audio finta e muta: qui lo prendiamo noi.
//! Il file provvisorio cresce sul disco (WAV 16 bit); alla fine si tengono solo i pezzi registrati (le pause escono).
use serde::Serialize;
use std::sync::Mutex;

#[derive(Clone, Serialize)]
pub struct UscitaAudio {
    nome: String,
    predefinita: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvviatoAudio {
    id: u64,
    trascorsi_ms: f64,
}

#[derive(Default)]
pub struct AudioPc(Mutex<Option<Sessione>>);

pub struct Sessione {
    id: u64,
    stop: std::sync::mpsc::Sender<()>,
    thread: std::thread::JoinHandle<Result<Registrato, String>>,
}

struct Registrato {
    path: std::path::PathBuf,
    frequenza: u32,
    canali: u16,
}

impl AudioPc {
    pub fn chiudi(&self) {
        if let Ok(mut s) = self.0.lock() {
            if let Some(s) = s.take() {
                let _ = s.stop.send(());
                if let Ok(Ok(r)) = s.thread.join() {
                    let _ = std::fs::remove_file(r.path);
                }
            }
        }
    }
}

/// il picco dell'audio del computer dall'ultima lettura (bit di un f32 positivo: l'ordine dei bit è quello dei numeri)
static LIVELLO: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

fn intestazione_wav(f: &mut impl std::io::Write, frequenza: u32, canali: u16, byte_dati: u32) -> std::io::Result<()> {
    let blocco = canali * 2;
    f.write_all(b"RIFF")?;
    f.write_all(&(36 + byte_dati).to_le_bytes())?;
    f.write_all(b"WAVEfmt ")?;
    f.write_all(&16u32.to_le_bytes())?;
    f.write_all(&1u16.to_le_bytes())?;
    f.write_all(&canali.to_le_bytes())?;
    f.write_all(&frequenza.to_le_bytes())?;
    f.write_all(&(frequenza * blocco as u32).to_le_bytes())?;
    f.write_all(&blocco.to_le_bytes())?;
    f.write_all(&16u16.to_le_bytes())?;
    f.write_all(b"data")?;
    f.write_all(&byte_dati.to_le_bytes())
}

#[cfg(windows)]
mod win {
    use super::*;
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::io::{BufWriter, Seek, SeekFrom, Write};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    pub fn uscite() -> Result<Vec<UscitaAudio>, String> {
        let host = cpal::default_host();
        let pred = host.default_output_device().and_then(|d| d.name().ok());
        let v = host
            .output_devices()
            .map_err(|e| e.to_string())?
            .filter_map(|d| d.name().ok())
            .map(|nome| UscitaAudio { predefinita: Some(&nome) == pred.as_ref(), nome })
            .collect();
        Ok(v)
    }

    pub fn avvia(stato: &AudioPc, nome: Option<String>) -> Result<AvviatoAudio, String> {
        let mut attiva = stato.0.lock().map_err(|e| e.to_string())?;
        if attiva.is_some() {
            return Err("L'audio del computer sta già registrando".into());
        }
        static SEQ: AtomicU64 = AtomicU64::new(1);
        let id = SEQ.fetch_add(1, Ordering::Relaxed);
        let (stop, ricevi) = mpsc::channel::<()>();
        let (pronto, avvio) = mpsc::sync_channel::<Result<Instant, String>>(1);
        let thread = std::thread::Builder::new()
            .name("audio-computer".into())
            .spawn(move || -> Result<Registrato, String> {
                let host = cpal::default_host();
                let dev = match &nome {
                    Some(n) => host.output_devices().ok().and_then(|mut it| it.find(|d| d.name().ok().as_deref() == Some(n))),
                    None => None,
                }
                .or_else(|| host.default_output_device());
                let dev = match dev {
                    Some(d) => d,
                    None => {
                        let _ = pronto.send(Err("Nessuna uscita audio trovata".into()));
                        return Err("nessuna uscita".into());
                    }
                };
                let cfg = match dev.default_output_config() {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = pronto.send(Err(e.to_string()));
                        return Err(e.to_string());
                    }
                };
                let frequenza = cfg.sample_rate().0;
                let canali = cfg.channels();
                let path = std::env::temp_dir().join(format!("daprod-audio-pc-{}-{}.wav", std::process::id(), id));
                let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
                let mut out = BufWriter::new(file);
                intestazione_wav(&mut out, frequenza, canali, 0).map_err(|e| e.to_string())?;
                let (tx, rx) = mpsc::channel::<Vec<f32>>();
                let errore = |e: cpal::StreamError| eprintln!("audio del computer: {e}");
                let picco = |d: &[f32]| {
                    let m = d.iter().fold(0f32, |a, x| a.max(x.abs()));
                    LIVELLO.fetch_max(m.to_bits(), Ordering::Relaxed);
                };
                let sc: cpal::StreamConfig = cfg.clone().into();
                // su un'uscita, uno stream d'ingresso di WASAPI è il loopback: quello che si sente
                let stream = match cfg.sample_format() {
                    cpal::SampleFormat::F32 => {
                        let tx = tx.clone();
                        dev.build_input_stream(&sc, move |d: &[f32], _: &_| { picco(d); let _ = tx.send(d.to_vec()); }, errore, None)
                    }
                    cpal::SampleFormat::I16 => {
                        let tx = tx.clone();
                        dev.build_input_stream(&sc, move |d: &[i16], _: &_| {
                            let v: Vec<f32> = d.iter().map(|x| *x as f32 / 32768.0).collect();
                            picco(&v);
                            let _ = tx.send(v);
                        }, errore, None)
                    }
                    f => {
                        let _ = pronto.send(Err(format!("formato audio non gestito: {f:?}")));
                        return Err("formato".into());
                    }
                };
                let stream = match stream {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = pronto.send(Err(e.to_string()));
                        return Err(e.to_string());
                    }
                };
                if let Err(e) = stream.play() {
                    let _ = pronto.send(Err(e.to_string()));
                    return Err(e.to_string());
                }
                let t0 = Instant::now();
                let _ = pronto.send(Ok(t0));
                // WASAPI in loopback non manda niente quando il computer è muto: i buchi si riempiono di silenzio,
                // così il file resta allineato all'orologio (e quindi al video)
                let per_ms = frequenza as f64 * canali as f64 / 1000.0;
                let mut scritti: u64 = 0;
                let scrivi = |out: &mut BufWriter<std::fs::File>, d: &[f32], scritti: &mut u64| -> std::io::Result<()> {
                    for x in d {
                        out.write_all(&((x.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes())?;
                    }
                    *scritti += d.len() as u64;
                    Ok(())
                };
                loop {
                    match rx.recv_timeout(Duration::from_millis(50)) {
                        Ok(d) => {
                            let atteso = (t0.elapsed().as_secs_f64() * 1000.0 * per_ms) as u64;
                            let dopo = scritti + d.len() as u64;
                            if atteso > dopo + (per_ms * 80.0) as u64 {
                                let mancano = ((atteso - dopo) / canali as u64) * canali as u64;
                                scrivi(&mut out, &vec![0f32; mancano as usize], &mut scritti).map_err(|e| e.to_string())?;
                            }
                            scrivi(&mut out, &d, &mut scritti).map_err(|e| e.to_string())?;
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            let atteso = (t0.elapsed().as_secs_f64() * 1000.0 * per_ms) as u64;
                            if atteso > scritti + (per_ms * 120.0) as u64 {
                                let mancano = ((atteso - scritti) / canali as u64) * canali as u64;
                                scrivi(&mut out, &vec![0f32; mancano as usize], &mut scritti).map_err(|e| e.to_string())?;
                            }
                        }
                        Err(_) => break,
                    }
                    if ricevi.try_recv().is_ok() {
                        break;
                    }
                }
                drop(stream);
                while let Ok(d) = rx.try_recv() {
                    scrivi(&mut out, &d, &mut scritti).map_err(|e| e.to_string())?;
                }
                let byte = (scritti * 2) as u32;
                out.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
                intestazione_wav(&mut out, frequenza, canali, byte).map_err(|e| e.to_string())?;
                out.flush().map_err(|e| e.to_string())?;
                Ok(Registrato { path, frequenza, canali })
            })
            .map_err(|e| e.to_string())?;
        let t0 = match avvio.recv() {
            Ok(Ok(t)) => t,
            Ok(Err(e)) => {
                let _ = thread.join();
                return Err(e);
            }
            Err(e) => return Err(e.to_string()),
        };
        *attiva = Some(Sessione { id, stop, thread });
        Ok(AvviatoAudio { id, trascorsi_ms: t0.elapsed().as_secs_f64() * 1000.0 })
    }
}

/// Le uscite audio (casse, cuffie…) da cui si può prendere l'audio del computer.
#[tauri::command]
pub fn audio_pc_uscite() -> Result<Vec<UscitaAudio>, String> {
    #[cfg(windows)]
    {
        win::uscite()
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

/// Comincia a prendere l'audio del computer dall'uscita scelta (None = quella predefinita di Windows).
#[tauri::command]
pub fn audio_pc_avvia(stato: tauri::State<'_, AudioPc>, uscita: Option<String>) -> Result<AvviatoAudio, String> {
    #[cfg(windows)]
    {
        win::avvia(&stato, uscita)
    }
    #[cfg(not(windows))]
    {
        let _ = (stato, uscita);
        Err("L'audio del computer si prende così solo su Windows".into())
    }
}

/// Il picco dall'ultima lettura (0..1), per la barra del livello.
#[tauri::command]
pub fn audio_pc_livello() -> f32 {
    f32::from_bits(LIVELLO.swap(0, std::sync::atomic::Ordering::Relaxed))
}

/// Ferma e tiene solo i pezzi registrati (millisecondi nell'orologio della cattura), scritti in `destinazione`.
/// Senza pezzi il file provvisorio si butta e basta.
#[tauri::command]
pub async fn audio_pc_ferma(stato: tauri::State<'_, AudioPc>, id: u64, pezzi: Vec<[f64; 2]>, destinazione: Option<String>) -> Result<Option<String>, String> {
    let s = {
        let mut attiva = stato.0.lock().map_err(|e| e.to_string())?;
        if attiva.as_ref().map(|s| s.id) != Some(id) {
            return Err("Audio del computer già chiuso".into());
        }
        attiva.take().unwrap()
    };
    let _ = s.stop.send(());
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, String> {
        let r = s.thread.join().map_err(|_| "La cattura dell'audio del computer si è fermata".to_string())??;
        let esito = (|| -> Result<Option<String>, String> {
            let dest = match destinazione {
                Some(d) if !pezzi.is_empty() => d,
                _ => return Ok(None),
            };
            let dati = std::fs::read(&r.path).map_err(|e| e.to_string())?;
            let campioni = &dati[44.min(dati.len())..];
            let blocco = r.canali as usize * 2;
            let per_ms = r.frequenza as f64 / 1000.0;
            let mut tenuti: Vec<u8> = Vec::new();
            for [da, fine] in pezzi {
                let a = ((da.max(0.0) * per_ms) as usize * blocco).min(campioni.len());
                let b = ((fine.max(0.0) * per_ms) as usize * blocco).min(campioni.len());
                if b > a {
                    tenuti.extend_from_slice(&campioni[a..b]);
                }
            }
            let mut f = std::io::BufWriter::new(std::fs::File::create(&dest).map_err(|e| e.to_string())?);
            intestazione_wav(&mut f, r.frequenza, r.canali, tenuti.len() as u32).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut f, &tenuti).map_err(|e| e.to_string())?;
            Ok(Some(dest))
        })();
        let _ = std::fs::remove_file(&r.path);
        esito
    })
    .await
    .map_err(|e| e.to_string())?
}
