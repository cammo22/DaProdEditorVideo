// Solo conversioni create in esclusiva: mai registrare un originale, un export o un .dap.
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::path::PathBuf;

#[derive(Default)]
pub(crate) struct Conversioni {
    percorsi: HashMap<u32, PathBuf>,
}
impl Conversioni {
    pub(crate) fn contiene(&self, id: u32) -> bool { self.percorsi.contains_key(&id) }
    pub(crate) fn crea(&mut self, id: u32, path: PathBuf) -> std::io::Result<File> {
        if self.percorsi.contains_key(&id) {
            return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "conversione già aperta"));
        }
        // create_new è atomico: niente sovrascritture neppure se il nome viene occupato nel frattempo.
        let f = OpenOptions::new().read(true).write(true).create_new(true).open(&path)?;
        self.percorsi.insert(id, path);
        Ok(f)
    }
    pub(crate) fn conserva(&mut self, id: u32) { self.percorsi.remove(&id); }
    pub(crate) fn scarta(&mut self, id: u32) -> std::io::Result<bool> {
        let Some(path) = self.percorsi.get(&id) else { return Ok(false); };
        match std::fs::remove_file(path) {
            Ok(()) => {},
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
            Err(e) => return Err(e), // resta registrato: si può ritentare la pulizia
        }
        self.percorsi.remove(&id);
        Ok(true)
    }
}
