// Prova nativa CLI, senza Tauri/GUI: rustc --test test/unit/conversioni-native.rs -o test/.tmp/conversioni-test.exe
#[path = "../../src-tauri/src/conversioni.rs"]
mod conversioni;
use conversioni::Conversioni;
use std::io::Write;
#[test]
fn annulla_elimina_solo_il_file_creato_dalla_conversione() {
    let root = std::path::PathBuf::from(std::env::var("TMPDIR").expect("TMPDIR Hermes richiesto"));
    let dir = root.join(format!("dpv-conversioni-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("parziale.webm");
    let originale = dir.join("originale.mp4");
    std::fs::write(&originale, b"originale").unwrap();
    let mut c = Conversioni::default();
    assert!(c.crea(1, originale.clone()).is_err());
    assert!(!c.scarta(1).unwrap());
    let mut f = c.crea(2, path.clone()).unwrap();
    assert!(c.contiene(2));
    f.write_all(b"conversione a meta").unwrap(); drop(f);
    assert!(path.exists());
    assert!(c.scarta(2).unwrap()); assert!(!path.exists());
    assert!(!c.scarta(2).unwrap());
    assert_eq!(std::fs::read(&originale).unwrap(), b"originale");
    let f = c.crea(3, path.clone()).unwrap(); drop(f);
    c.conserva(3); assert!(!c.scarta(3).unwrap()); assert!(path.exists());
    std::fs::remove_dir_all(dir).unwrap();
}
