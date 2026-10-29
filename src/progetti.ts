import { migraColoreAudio } from './core/coloreAudioProgetto';
// Progetti: nuovo, apri, salva, autosalvataggio, importazione dei file e ricollegamento dei media.
// Nell'app (Tauri) i media si ritrovano dal percorso; nel browser dalle "maniglie" dei file che Chrome
// permette di ricordare (basta un clic per ridare il permesso).
import { store } from './core/store';
import type { MediaItem, Project } from './core/tipi';
import { FORMATI } from './core/tipi';
import { ALTEZZA, MASTER0, newProject } from './core/progetto';
import { migraBlocchi } from './core/blocchi';
import { pulisciAnim } from './core/automazioni';
import { apri as apriMedia, chiudi as chiudiMedia, importa, impostaCercaMedia, impostaControlloVelocita, mediaRT, usoDiMedia, type MediaRT, type OpzioniPreparazione } from './media/libreria';
import { cambiaProgetto, inSovraccarico, nuova, proponi, type Lavoro, type Proposto } from './media/attivita';
import { dimenticaMedia } from './media/fotogrammi';
import { converti, esamina, normalizzaAttivo } from './media/normalizza';
import { dialogoApri, dialogoSalva, ESTENSIONI_DI, invoke, isTauri, nomeDaPercorso, scegliFileBrowser, scegliMedia, type FileScelto, type TipoMedia } from './platform';
import { dapAttuale, indicePacchetto, leggi as leggiPezzo, leggiPacchetto, pianoDap, pianoPacchetto, ricordaDap, scriviDapApp, scriviDapBrowser, scriviPacchetto, type PianoDap, type Sorgente, type VoceLetta } from './pacchetto';
import { proxyDelProgetto, rimettiProxy } from './media/proxy';
import { avviso, conferma, dialogo, h } from './ui/dom';
import { motore } from './motore';
import { s2f } from './core/timecode';

export let percorsoProgetto: string | null = null;

/** fino a quanto un file si tiene dentro il browser (IndexedDB) quando non c'è altro modo di ritrovarlo */
const FILE_LOCALE_MAX = 300 * 1024 * 1024;

// ——— IndexedDB (solo browser): autosalvataggio e maniglie dei file ———
function db(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('daprod-video', 2);
    r.onupgradeneeded = () => {
      for (const n of ['kv', 'maniglie', 'file']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function idb<T>(store: 'kv' | 'maniglie' | 'file', op: 'get' | 'put' | 'delete', key: string, val?: unknown, propagaErrore = false): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise((ok, ko) => {
      const tx = d.transaction(store, op === 'get' ? 'readonly' : 'readwrite');
      const s = tx.objectStore(store);
      const r = op === 'get' ? s.get(key) : op === 'put' ? s.put(val, key) : s.delete(key);
      // La richiesta può riuscire e la transazione fallire dopo (per esempio se manca spazio).
      tx.oncomplete = () => ok(r.result as T);
      tx.onabort = () => ko(tx.error ?? r.error);
      tx.onerror = () => ko(tx.error ?? r.error);
    });
  } catch (e) { if (propagaErrore) throw e; return undefined; }
}

/** tutte le chiavi di un deposito (per fare pulizia) */
async function chiaviIdb(store: 'kv' | 'maniglie' | 'file'): Promise<string[]> {
  try {
    const d = await db();
    return await new Promise((ok, ko) => {
      const r = d.transaction(store, 'readonly').objectStore(store).getAllKeys();
      r.onsuccess = () => ok((r.result as IDBValidKey[]).map(String));
      r.onerror = () => ko(r.error);
    });
  } catch { return []; }
}

/**
 * Pulizia del deposito del browser: si tengono i file (e le maniglie) dei media del montaggio aperto e di quelli
 * dei progetti recenti, il resto si toglie. Prima "Nuovo progetto" buttava i file del montaggio di prima anche se
 * era fra i recenti, e riaprendolo dalla pagina iniziale i file mancavano; e le copie dei progetti usciti
 * dall'elenco restavano lì per sempre.
 */
async function potaDeposito() {
  if (isTauri) return;
  const lista = recenti();
  const chiavi = new Set(lista.map((r) => 'rec:' + r.chiave));
  const tieni = new Set(store.doc.media.map((m) => m.id));
  for (const k of await chiaviIdb('kv')) {
    if (!k.startsWith('rec:')) continue;
    if (!chiavi.has(k)) { void idb('kv', 'delete', k); continue; }
    try {
      const p = JSON.parse((await idb<string>('kv', 'get', k)) ?? 'null') as Project | null;
      for (const m of p?.media ?? []) tieni.add(m.id);
      for (const s of p?.sequenze ?? []) for (const c of s.clips ?? []) if (c.media) tieni.add(c.media);
    } catch { /* copia rovinata */ }
  }
  for (const dep of ['file', 'maniglie'] as const) for (const k of await chiaviIdb(dep)) if (!tieni.has(k)) void idb(dep, 'delete', k);
}

/** un file fatto dal programma (l'audio pulito, le tracce separate): nel browser si tiene dentro il browser, così alla prossima apertura il progetto lo ritrova (se non è enorme) */
export function conservaFileNelBrowser(id: string, file: File) {
  if (!isTauri && file.size <= FILE_LOCALE_MAX) void idb('file', 'put', id, file);
}

type Maniglia = FileSystemFileHandle & { queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string> };

// ——— importazione ———
const IMMAGINE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

export async function importaFile(lista: (FileScelto & { maniglia?: Maniglia })[], opzioni: { chiediFormato?: boolean; cartella?: string; controlla?: boolean } = {}): Promise<MediaItem[]> {
  if (!lista.length) return [];
  const nuovi: MediaItem[] = [];
  const conserva: (() => void)[] = [];
  const errori: string[] = [];
  const lav = nuova({ titolo: lista.length === 1 ? 'Importo un file' : `Importo ${lista.length} file`, categoria: 'file' });
  let i = 0;
  for (const f of lista) {
    if (!lav.valido) break;
    lav.imposta(i / lista.length, `${++i} di ${lista.length} · ${f.name}`);
    const r = await importa(f);
    if (!lav.valido) {
      if (!('errore' in r)) chiudiMedia(r.item.id);
      break;
    }
    if ('errore' in r) { errori.push(`${r.nome}: ${r.errore}`); continue; }
    if (opzioni.cartella) r.item.cartella = opzioni.cartella;
    nuovi.push(r.item);
    if (f.maniglia) conserva.push(() => { void idb('maniglie', 'put', r.item.id, f.maniglia); });
    // nel browser, senza "maniglia" (Firefox, Safari, file trascinati, istantanee) i file piccoli si tengono
    // dentro il browser: così il progetto li ritrova alla prossima apertura senza ricollegarli
    else if (!isTauri && f.file && f.file.size <= FILE_LOCALE_MAX) conserva.push(() => { void idb('file', 'put', r.item.id, f.file); });
    // dalla 1.5.8 niente controllo della velocità né conversioni all'import (nemmeno con le preferenze vecchie):
    // si fanno a mano con «Controlla velocità file» (proponiPreparazione(id, 'velocita')). opzioni.controlla non conta più.
  }
  if (!lav.valido) {
    for (const m of nuovi) chiudiMedia(m.id);
    lav.annullata();
    return [];
  }
  lav.fine(nuovi.length === 1 ? '1 file' : `${nuovi.length} file`);
  if (nuovi.length) {
    store.edit(`Importa ${nuovi.length} file`, (p) => { p.media.push(...nuovi); });
    for (const f of conserva) f();
    // il primo video decide il formato del progetto se il montaggio è ancora vuoto
    const primo = nuovi.find((m) => m.type === 'video' && m.width);
    if (primo && opzioni.chiediFormato !== false && !store.doc.clips.length && store.doc.media.length === nuovi.length) void propostaFormato(primo);
    avviso(`${nuovi.length} file nel contenitore`, 'ok');
    if (!motore.playerMedia) motore.caricaPlayer(nuovi[0].id);
  }
  if (errori.length) {
    const d = dialogo('Alcuni file non si aprono');
    d.corpo.append(h('p', null, 'Questi file non sono stati importati:'), h('ul', { class: 'lista-errori' }, errori.map((e) => h('li', null, e))),
      h('p', { class: 'nota' }, 'Formati che vanno: MP4, MOV, MKV, WebM, MTS/M2TS (AVCHD), MP3, WAV, AAC, FLAC, OGG, immagini. I codec dipendono dal sistema: H.264, H.265/HEVC (se il sistema lo decodifica), VP8/VP9, AV1, ProRes no.'));
    d.piede.append(h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'OK'));
  }
  return nuovi;
}

/**
 * «Controlla velocità file»: frame rate o bitrate variabili → il file si rifà a velocità costante (se no in montaggio
 * audio e video slittano). Dalla 1.5.8 SOLO a mano: il controllo nasce «da avviare» (o parte subito con avvia:true) e,
 * se il file va rifatto, la conversione nasce a sua volta «da avviare» (parte da sola solo con converti:true e la
 * preferenza dpv-normalizza diversa da 'no'). Si lavora intanto col file com'è; quando la copia è pronta prende il posto
 * dell'originale (che non si tocca). Conversione con pausa vera; annullata, la copia a metà si butta.
 */
function controllaVelocita(m: MediaItem, r: MediaRT, o: OpzioniPreparazione & { priorita: () => number }): Proposto<unknown> | null {
  if (m.type === 'image' || IMMAGINE.test(m.name) || m.dentro) return null;
  const sel: FileScelto = { name: m.name, file: r.file, path: r.path };
  if (!sel.file && !sel.path) return null;
  const priorita = o.priorita;
  const esame = proponi({ corsia: 'leggero', titolo: 'Controllo la velocità dei file', categoria: 'analisi', gruppo: 'esame', priorita, chiave: 'velocita:' + m.id, media: m.id, dettaglio: m.name }, async (l) => {
    l.imposta(0, m.name);
    const v = await esamina(sel);
    if (!l.valido || mediaRT(m.id) !== r) return null;
    if (!v) { r.velocita = 'ok'; return 'ok'; }
    r.velocita = 'da-convertire';
    const conv = proponi({ corsia: 'pesante', titolo: 'Conversione a velocità costante', categoria: 'conversione', gruppo: 'converti', priorita, chiave: 'converti:' + m.id, media: m.id, dettaglio: `${m.name} · ${v.motivo}`, pausa: 'vera' }, async (c) => {
      c.imposta(0, `${m.name} · ${v.motivo}`);
      const copia = await converti(sel, v, (k) => c.imposta(k), c.segnale, c);
      if (!c.valido) throw new Error('fermato');
      c.imposta(1, `${m.name} · metto la copia al suo posto`);
      if (await mettiCopia(m.id, copia, c, r)) {
        const nuovo = mediaRT(m.id);
        if (nuovo) nuovo.velocita = 'convertito';
        avviso(`🔧 ${m.name}: ${v.motivo} (l'originale non è stato toccato)`, 'info', 3600);
      }
      return copia.name;
    });
    if (o.converti && normalizzaAttivo()) conv.avvia();
    else avviso(`${m.name}: ${v.motivo}. La conversione è pronta nel Centro attività (Avvia)`, 'info', 4200);
    return 'da-convertire';
  });
  return esame;
}
impostaControlloVelocita(controllaVelocita);
impostaCercaMedia((id) => store.doc.media.find((m) => m.id === id));

/** la copia a velocità costante prende il posto del file nel progetto (clip, segni e proprietà restano dove sono) */
async function mettiCopia(id: string, copia: FileScelto, lavoro: Lavoro, origine: MediaRT): Promise<boolean> {
  const valido = () => lavoro.valido && mediaRT(id) === origine && store.doc.media.some((x) => x.id === id);
  if (!valido()) return false;
  const d = await importa(copia, { soloDescrizione: true });
  if ('errore' in d) throw new Error(d.errore);
  try {
  // il file non si cambia sotto i piedi di chi lo sta guardando: si aspetta che il montaggio si fermi, ma solo se sta suonando proprio
  // questo file, e non più di 20 secondi (se no la conversione restava appesa per sempre con la riproduzione accesa)
  const t0 = performance.now();
  while (valido() && motore.playing && (usoDiMedia(id) > 0 || motore.playerMedia === id) && performance.now() - t0 < 20000 && !inSovraccarico()) await new Promise((ok) => setTimeout(ok, 400));
  // Controllo dopo TUTTE le attese e subito prima di toccare documento/cronologia.
  // Anche riaprire lo stesso progetto (ID uguali) invalida la generazione del lavoro.
  if (!valido()) return false;
  const m = store.doc.media.find((x) => x.id === id);
  if (!m) return false;
  const n = d.item;
  store.aggiornaMedia(id, {
    duration: n.duration, t0: n.t0, width: n.width, height: n.height, fps: n.fps, rotation: n.rotation, hasVideo: n.hasVideo, hasAudio: n.hasAudio,
    channels: n.channels, sampleRate: n.sampleRate, vcodec: n.vcodec, acodec: n.acodec, container: n.container, size: n.size, lastModified: n.lastModified, path: copia.path,
  }, (n.t0 || 0) - (m.t0 || 0));
  dimenticaMedia(id);
  const aperto = await apriMedia(store.doc.media.find((x) => x.id === id)!, { file: copia.file, path: copia.path });
  if (!lavoro.valido || mediaRT(id) !== aperto) return false;
  // nel browser la copia sta in memoria: per ritrovarla alla prossima apertura si tiene dentro il browser (se non è enorme)
  if (!isTauri && copia.file) {
    void idb('maniglie', 'delete', id);
    if (copia.file.size <= FILE_LOCALE_MAX) void idb('file', 'put', id, copia.file);
  }
  store.emit('doc');
  motore.ridisegna();
  return true;
  } finally {
    // importa(soloDescrizione) chiude già i video; le immagini temporanee vanno chiuse qui.
    chiudiMedia(d.item.id);
  }
}

async function propostaFormato(m: MediaItem) {
  const p = store.doc;
  const w = m.rotation % 180 ? m.height : m.width, hh = m.rotation % 180 ? m.width : m.height;
  const rr = Math.round(m.fps * 100) / 100;
  const rate = Math.abs(rr - 29.97) < 0.02 ? { num: 30000, den: 1001 } : Math.abs(rr - 59.94) < 0.02 ? { num: 60000, den: 1001 } : Math.abs(rr - 23.976) < 0.02 ? { num: 24000, den: 1001 } : { num: Math.round(rr) || 25, den: 1 };
  if (w === p.w && hh === p.h && rate.num / rate.den === p.rate.num / p.rate.den) return;
  const ok = await conferma('Formato del progetto', `Il primo video è ${w}×${hh} a ${rr} fps. Imposto il progetto uguale?`, 'Sì, uguale al video', 'Tengo ' + p.w + '×' + p.h);
  if (!ok) return;
  store.edit('Formato dal video', (pp) => { pp.w = w; pp.h = hh; pp.rate = rate; pp.drop = rate.den === 1001 && Math.round(rate.num / rate.den) === 30; });
}

/** il pulsante "Importa": finestra di sistema (app) o del browser */
export async function importaDialogo(cartella?: string, tipo?: TipoMedia) {
  const w = window as unknown as { showOpenFilePicker?: (o: object) => Promise<Maniglia[]> };
  if (!isTauri && w.showOpenFilePicker) {
    try {
      // dritti nella categoria aperta: da Musica si vedono solo gli audio, da Immagini solo le immagini
      const tutti: Record<string, string[]> = { 'video/*': ESTENSIONI_DI.video.map((e) => '.' + e), 'audio/*': ESTENSIONI_DI.audio.map((e) => '.' + e), 'image/*': ESTENSIONI_DI.image.map((e) => '.' + e) };
      const accept = tipo ? { [`${tipo}/*`]: tutti[`${tipo}/*`] } : tutti;
      const descr = { video: 'Video', audio: 'Musica e audio', image: 'Immagini' };
      const hs = await w.showOpenFilePicker({ multiple: true, types: [{ description: tipo ? descr[tipo] : 'Video, audio e immagini', accept }], excludeAcceptAllOption: false });
      const lista = await Promise.all(hs.map(async (hh) => { const f = await hh.getFile(); return { name: f.name, file: f, maniglia: hh }; }));
      return importaFile(lista, { cartella });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return [];
    }
  }
  return importaFile(await scegliMedia(tipo), { cartella });
}

/** file lasciati cadere sulla finestra dal sistema */
export async function importaDaDrop(dt: DataTransfer, cartella?: string) {
  const lista: (FileScelto & { maniglia?: Maniglia })[] = [];
  const items = [...dt.items].filter((i) => i.kind === 'file');
  for (const it of items) {
    const f = it.getAsFile();
    if (!f) continue;
    let maniglia: Maniglia | undefined;
    const g = (it as unknown as { getAsFileSystemHandle?: () => Promise<Maniglia | null> }).getAsFileSystemHandle;
    if (g) { try { maniglia = (await g.call(it)) ?? undefined; } catch { /* niente */ } }
    lista.push({ name: f.name, file: f, maniglia });
  }
  return importaFile(lista, { cartella });
}

// ——— i progetti recenti (la pagina iniziale) ———
export interface Recente { chiave: string; nome: string; path?: string; data: number; clip: number; durata: number; formato: string; miniatura?: string }
const RECENTI_MAX = 12;

export function recenti(): Recente[] {
  try { const l = JSON.parse(localStorage.getItem('dpv-recenti') ?? '[]') as Recente[]; return Array.isArray(l) ? l : []; } catch { return []; }
}
function scriviRecenti(l: Recente[]) { try { localStorage.setItem('dpv-recenti', JSON.stringify(l.slice(0, RECENTI_MAX))); } catch { /* spazio pieno: pazienza */ } }

export function dimenticaRecente(chiave: string) {
  scriviRecenti(recenti().filter((x) => x.chiave !== chiave));
  void idb('kv', 'delete', 'rec:' + chiave).catch(() => {});
}

/** una miniatura piccola dal primo video o dalla prima immagine del montaggio */
function miniaturaDi(p: Project): string | undefined {
  try {
    const clip = p.clips.filter((c) => c.kind === 'media' && c.media).sort((a, b) => a.start - b.start).find((c) => { const rt = mediaRT(c.media!); return !!rt?.poster; });
    const src = clip ? (mediaRT(clip.media!)?.poster as (CanvasImageSource & { width: number; height: number }) | undefined) : undefined;
    if (!src || !src.width) return undefined;
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 108;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#111'; x.fillRect(0, 0, 192, 108);
    const k = Math.min(192 / src.width, 108 / src.height);
    x.drawImage(src, (192 - src.width * k) / 2, (108 - src.height * k) / 2, src.width * k, src.height * k);
    return cv.toDataURL('image/jpeg', 0.7);
  } catch { return undefined; }
}

/** ricorda un progetto salvato o aperto: in cima all'elenco. Nel browser tiene anche una copia (per riaprirlo dalla pagina iniziale). */
export function registraRecente(p: Project, path?: string, testo?: string) {
  const chiave = path ?? 'b:' + (p.name || 'montaggio');
  const r = fps0(p);
  const voce: Recente = {
    chiave, nome: p.name || 'Montaggio senza nome', path, data: Date.now(), clip: p.clips.filter((c) => c.kind !== 'fx').length,
    durata: Math.max(0, ...p.clips.map((c) => c.start + c.len)) / r, formato: `${p.w}×${p.h} · ${Math.round(r * 100) / 100} fps`, miniatura: miniaturaDi(p),
  };
  scriviRecenti([voce, ...recenti().filter((x) => x.chiave !== chiave)]);
  if (!isTauri && testo) void idb('kv', 'put', 'rec:' + chiave, testo).catch(() => {});
}
const fps0 = (p: Project) => p.rate.num / p.rate.den;

/** apre un progetto della lista: dal percorso (app) o dalla copia tenuta nel browser */
export async function apriRecente(r: Recente): Promise<boolean> {
  if (store.dirty && store.doc.clips.length && !(await conferma('Apri progetto', 'Il montaggio attuale ha modifiche non salvate. Aprire un altro progetto?', 'Apri', 'Annulla'))) return false;
  if (r.path && isTauri) {
    // c'è ancora? (si chiede solo la grandezza: un .dap può essere di molti GB, e non è testo)
    try { await invoke<number>('media_dimensione', { path: r.path }); } catch { avviso('Questo progetto non c\'è più dove l\'avevi salvato', 'errore', 4000); dimenticaRecente(r.chiave); return false; }
    await apriFile({ path: r.path });
    return true;
  }
  const testo = await idb<string>('kv', 'get', 'rec:' + r.chiave);
  let p: Project | null = null;
  try { p = testo ? valida(JSON.parse(testo)) : null; } catch { p = null; }
  if (!p) { avviso('Di questo progetto non ho più la copia: aprilo dal file (Apri progetto…)', 'info', 4500); return false; }
  percorsoProgetto = null;
  await carica(p);
  avviso(`📂 ${p.name}`, 'ok');
  return true;
}

// ——— salvataggio ———
function serializza(): string {
  const p = store.doc;
  p.saved = Date.now();
  return JSON.stringify(p);
}

let salvando = false;

/**
 * Salva (Ctrl+S): un file .dap con dentro TUTTO (montaggio, file, copie leggere), da riaprire identico su un altro computer.
 * Nell'app la prima volta si sceglie dove; dopo si aggiunge in fondo allo stesso file solo quello che manca (veloce).
 * Salva come… riscrive tutto in un file nuovo (pulito). Nel browser si salva/scarica il .dap intero.
 */
export async function salva(come = false) {
  if (salvando) return;
  salvando = true;
  const p = store.doc;
  const nome = (p.name || 'montaggio').replace(/[\\/:*?"<>|]/g, '_') + '.dap';
  let stop = false;
  let barra: ReturnType<typeof avvisoLungo> | null = null;
  try {
    const proxy = await proxyDelProgetto(p.media);
    let r: string | null = null;
    let piano: PianoDap;
    if (isTauri) {
      let path = !come && percorsoProgetto && /\.dap$/i.test(percorsoProgetto) ? percorsoProgetto : null;
      if (!path) {
        path = await dialogoSalva(nome, 'dap', 'application/zip');
        if (!path) return;
        if (!/\.dap$/i.test(path)) path += '.dap';
      }
      // il .dap da cui si leggono i file (aperto o già salvato): si AGGIUNGE in fondo, non si può riscrivere da capo
      const stesso = (x?: string | null) => !!x && x.toLowerCase() === path!.toLowerCase();
      let vecchie: Map<string, VoceLetta> | null = null;
      if (stesso(dapAttuale()) || p.media.some((m) => stesso(m.path))) {
        vecchie = await indicePacchetto({ path }).catch(() => null);
        if (!vecchie) throw new Error('il file .dap aperto non si legge più: usa Salva come… con un nome nuovo');
      }
      piano = await pianoDap(vecchie, proxy);
      barra = avvisoLungo(vecchie ? 'Salvo il progetto…' : 'Salvo il progetto con tutti i file…', () => { stop = true; });
      const b = barra;
      await scriviDapApp(path, vecchie, piano, (f, t, cosa) => b.testo(`💾 ${Math.floor((f / t) * 100)}% · ${cosa}`, f / t), () => stop);
      r = path;
      percorsoProgetto = path;
      try { localStorage.setItem('dpv-percorso', path); } catch { /* niente memoria */ }
    } else {
      piano = await pianoDap(null, proxy);
      barra = avvisoLungo('Preparo il progetto .dap…', () => { stop = true; });
      const b = barra;
      r = await scriviDapBrowser(nome, piano, (f, t, cosa) => b.testo(`💾 ${Math.floor((f / t) * 100)}% · ${cosa}`, f / t), () => stop);
    }
    if (!r) return;
    store.dirty = false;
    registraRecente(store.doc, isTauri ? r : undefined, isTauri ? undefined : serializza());
    const aggiunti = piano.byte > 1 << 20 ? ` (+${mb(piano.byte)})` : '';
    avviso(`💾 Salvato con tutti i file: ${nomeDaPercorso(r)}${aggiunti}`, 'ok', 3000);
    if (piano.mancano.length) avviso(`⚠ ${piano.mancano.length} file scollegati non sono dentro il progetto: ${piano.mancano.map((m) => m.name).slice(0, 3).join(', ')}${piano.mancano.length > 3 ? '…' : ''} · File → Ricollega media e salva di nuovo`, 'info', 8000);
    store.emit('status');
  } catch (e) {
    // disco pieno, cartella protetta, chiavetta tolta: lo si dice (prima non compariva niente e sembrava salvato)
    if (stop || (e instanceof Error && e.message === 'annullato')) avviso('Salvataggio fermato: il file è com\'era prima', 'info', 4000);
    else avviso('⚠ Il progetto NON è stato salvato: ' + (e instanceof Error ? e.message : String(e)) + ' · prova Salva come…', 'errore', 7000);
  } finally {
    barra?.chiudi();
    salvando = false;
  }
}

/** la revisione del documento già scritta dall'autosalvataggio (-1 = niente ancora) */
let autosalvata = -1;
let avvisatoAutosalvataggio = false;

export async function autosalva() {
  if (!store.dirty && store.doc.saved) return;
  // niente di nuovo dall'ultima volta: non si riscrive tutto il progetto ogni 15 secondi
  const rev = store.revisione;
  if (rev === autosalvata) return;
  const testo = serializza();
  try {
    if (isTauri) await invoke('autosalva', { text: testo });
    else await idb('kv', 'put', 'autosalvataggio', testo, true);
    autosalvata = rev;
  } catch {
    // La revisione resta da salvare: si riprova al prossimo giro, senza avvisi a raffica.
    if (!avvisatoAutosalvataggio) {
      avvisatoAutosalvataggio = true;
      avviso('Non riesco a salvare la copia automatica: controlla lo spazio e i permessi. Per tenere il lavoro usa Salva come…', 'errore', 7000);
    }
  }
}

function valida(o: unknown): Project | null {
  const p = o as Project;
  if (!p || p.format !== 'daprod-video' || !Array.isArray(p.tracks) || !Array.isArray(p.clips)) return null;
  for (const m of p.media) { m.t0 ??= 0; m.markIn ??= null; m.markOut ??= null; }
  for (const c of p.clips) { c.opKeys ??= []; c.gainKeys ??= []; c.speed ??= 1; pulisciAnim(c); }
  // le versioni di prima: tracce audio basse e niente ritocchi finali
  for (const t of p.tracks) {
    if (t.kind === 'audio' && t.height === 46) t.height = ALTEZZA.audio;
    if (t.kind === 'video' && t.height === 58) t.height = ALTEZZA.video;
  }
  // le clip delle altre timeline: i keyframe (se ci sono) si rimettono in ordine come nella principale
  for (const s of p.sequenze ?? []) for (const c of s.clips ?? []) pulisciAnim(c);
  p.master = { ...MASTER0, ...(p.master ?? {}) };
  // dalla 1.0.5: gli FX stanno sulle tracce video (la corsia a parte della 1.0.4 sparisce), e le transizioni delle
  // clip video diventano blocchetti
  migraBlocchi(p);
  migraColoreAudio(p);
  return p;
}

/** Apri: un progetto leggero (.dpv) o un pacchetto con tutti i file (.daprod) */
export async function apri() {
  if (store.dirty && store.doc.clips.length && !(await conferma('Apri progetto', 'Il montaggio attuale ha modifiche. Aprire un altro progetto?', 'Apri', 'Annulla'))) return;
  if (isTauri) {
    const [path] = await dialogoApri({ multiple: false, title: 'Progetto DaProd Video', estensioni: ['dap', 'daprod', 'dpv', 'json'], mime: [] });
    if (path) await apriFile({ path });
    return;
  }
  const [file] = await scegliFileBrowser('.dap,.daprod,.dpv,.json,application/json,application/zip', false);
  if (file) await apriFile({ file });
}

/** apre un progetto da un percorso (app, anche col doppio clic sul file) o da un file (browser) */
export async function apriFile(s: Sorgente) {
  const nome = s.file?.name ?? nomeDaPercorso(s.path ?? '');
  if (/\.(daprod|dap)$/i.test(nome)) { await apriPacchetto(s, /\.dap$/i.test(nome)); return; }
  ricordaDap(null);
  try { localStorage.removeItem('dpv-percorso'); } catch { /* niente */ }
  let p: Project | null = null;
  try {
    const testo = s.file ? await s.file.text() : await invoke<string>('progetto_leggi', { path: s.path });
    p = valida(JSON.parse(testo));
  } catch { p = null; }
  if (!p) { avviso('Questo file non è un progetto DaProd Video', 'errore'); return; }
  percorsoProgetto = s.path ?? null;
  await carica(p);
  registraRecente(p, s.path, s.path ? undefined : JSON.stringify(p));
  avviso(`📂 ${p.name}`, 'ok');
}

/**
 * Apre un pacchetto .daprod: il progetto e i suoi file vengono da dentro lo zip, così com'è (niente da
 * scompattare). Nell'app i media si leggono dal pacchetto stesso; nel browser sono pezzi del file scelto.
 */
async function apriPacchetto(s: Sorgente, dap = false) {
  // i lavori del progetto di prima si annullano prima di aprire (la barra di questa apertura è del progetto nuovo)
  cambiaProgetto();
  const barra = avvisoLungo(dap ? 'Apro il progetto…' : 'Apro il pacchetto…');
  try {
    const { testo, voci } = await leggiPacchetto(s);
    const p = valida(JSON.parse(testo));
    if (!p) throw new Error('dentro non c\'è un progetto DaProd Video');
    for (const m of p.media) {
      const v = m.pacchetto ? voci.get(m.pacchetto) : undefined;
      if (!v) continue;
      m.dentro = { off: v.off, len: v.len };
      if (s.path) m.path = s.path;
    }
    // le copie leggere dentro il file tornano nel disco privato prima di aprire i media: il monitor le trova già pronte
    const proxy = [...voci.values()].filter((v) => v.nome.startsWith('proxy/') && v.stored);
    let k = 0;
    for (const v of proxy) {
      barra.testo(`Rimetto le copie leggere: ${++k}/${proxy.length}`, 0);
      await rimettiProxy(v.nome.slice(6), v.len, (a, b) => leggiPezzo(s, v.off + a, v.off + b));
    }
    // il .dap è il progetto: Salva (Ctrl+S) aggiunge lì. Il vecchio .daprod no: Salva chiede dove fare il .dap
    percorsoProgetto = dap && s.path ? s.path : null;
    ricordaDap(dap && s.path ? s.path : null, p, voci);
    try { if (percorsoProgetto) localStorage.setItem('dpv-percorso', percorsoProgetto); else localStorage.removeItem('dpv-percorso'); } catch { /* niente */ }
    for (const m of store.doc.media) { chiudiMedia(m.id); dimenticaMedia(m.id); }
    motore.caricaPlayer(null);
    store.load(p);
    let mancano = 0;
    let i = 0;
    for (const m of p.media) {
      barra.testo(`Apro il pacchetto: ${++i}/${p.media.length} ${m.name}`, (i - 1) / p.media.length);
      if (!m.dentro) { mancano++; continue; }
      if (s.path) { const r = await apriMedia(m, { path: s.path }); if (r.stato !== 'ok') mancano++; continue; }
      const file = new File([s.file!.slice(m.dentro.off, m.dentro.off + m.dentro.len)], m.name, { lastModified: m.lastModified || Date.now() });
      const r = await apriMedia(m, { file });
      if (r.stato !== 'ok') { mancano++; continue; }
      // nel browser i file piccoli si tengono (come quando si importano): alla prossima apertura ci sono ancora
      if (file.size <= FILE_LOCALE_MAX) void idb('file', 'put', m.id, file);
    }
    store.dirty = false;
    store.emit('doc');
    motore.ridisegna();
    if (dap) registraRecente(p, s.path, s.path ? undefined : JSON.stringify(p));
    avviso(`${dap ? '📂' : '📦'} ${p.name}: aperto${dap ? '' : ' dal pacchetto'}${mancano ? ` (${mancano} file mancano)` : ', con tutti i suoi file'}`, mancano ? 'info' : 'ok', 3500);
  } catch (e) {
    avviso('Il pacchetto non si apre: ' + (e instanceof Error ? e.message : String(e)), 'errore', 5000);
  } finally {
    barra.chiudi();
  }
}

/** il pacchetto .daprod: il progetto e tutti i suoi file in un file solo (zip), da riaprire identico altrove */
export async function salvaPacchetto() {
  const p = store.doc;
  const d = dialogo('Salva il pacchetto .daprod');
  const solo = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const peso = h('b', null, '…');
  const quanti = h('span', null, '');
  const mancano = h('p', { class: 'nota' });
  const misura = async () => {
    const pi = await pianoPacchetto(solo.checked);
    peso.textContent = mb(pi.byte);
    quanti.textContent = `${pi.voci.length} file`;
    mancano.textContent = pi.mancano.length ? `⚠ ${pi.mancano.length} file non collegati restano fuori: ${pi.mancano.map((m) => m.name).slice(0, 4).join(', ')}${pi.mancano.length > 4 ? '…' : ''}` : '';
    return pi;
  };
  solo.addEventListener('change', () => void misura());
  d.corpo.append(
    h('p', null, 'Il progetto e tutti i suoi file (video, musiche, immagini) in un file solo. Portalo su un altro computer e aprilo con DaProd Video: ritrovi il montaggio identico. È uno zip: i file dentro restano uguali (niente perdita di qualità) e si aprono direttamente da lì.'),
    h('p', null, quanti, ' · ', peso),
    h('label', { class: 'riga-spunta' }, solo, ' Solo i file usati nel montaggio (il contenitore si alleggerisce)'),
    mancano);
  void misura();
  const via = h('button', { class: 'btn', on: { click: () => d.chiudi() } }, 'Annulla');
  const vai = h('button', { class: 'btn primario', on: {
    click: async () => {
      const pi = await misura();
      d.chiudi();
      const nomeFile = (p.name || 'montaggio').replace(/[\\/:*?"<>|]/g, '_') + '.daprod';
      let stop = false;
      const barra = avvisoLungo('Preparo il pacchetto…', () => { stop = true; });
      try {
        const r = await scriviPacchetto(nomeFile, pi, solo.checked, (f, t, cosa) => barra.testo(`📦 ${Math.floor((f / Math.max(1, t)) * 100)}% · ${cosa}`), () => stop);
        if (r) avviso(`📦 Pacchetto salvato: ${nomeDaPercorso(r)} (${mb(pi.byte)})`, 'ok', 4000);
      } catch (e) {
        avviso(stop ? 'Pacchetto annullato' : 'Il pacchetto non si salva: ' + (e instanceof Error ? e.message : String(e)), stop ? 'info' : 'errore', 5000);
      } finally {
        barra.chiudi();
      }
    },
  } }, '📦 Salva il pacchetto');
  d.piede.append(via, vai);
}

const mb = (b: number) => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(2).replace('.', ',') + ' GB' : Math.max(0.1, b / (1 << 20)).toFixed(1).replace('.', ',') + ' MB');

export async function nuovo(fmt: { w: number; h: number; rate: { num: number; den: number }; drop: boolean } = FORMATI[0]) {
  if (store.dirty && store.doc.clips.length && !(await conferma('Nuovo progetto', 'Il montaggio attuale ha modifiche non salvate. Ricominciare?', 'Nuovo', 'Annulla'))) return;
  // i lavori del progetto di prima (da avviare, in coda, al lavoro) si annullano: nessun risultato tardivo sul nuovo
  cambiaProgetto();
  for (const m of store.doc.media) { chiudiMedia(m.id); dimenticaMedia(m.id); }
  percorsoProgetto = null;
  ricordaDap(null);
  try { localStorage.removeItem('dpv-percorso'); } catch { /* niente */ }
  motore.caricaPlayer(null);
  store.load(newProject(fmt));
  store.doc.saved = 0;
  // i file tenuti nel browser che non servono più a nessun progetto recente: si libera lo spazio
  void potaDeposito();
}

/** carica un progetto e riapre i suoi media */
export async function carica(p: Project) {
  cambiaProgetto();
  for (const m of store.doc.media) { chiudiMedia(m.id); dimenticaMedia(m.id); }
  motore.caricaPlayer(null);
  store.load(p);
  await riapriMedia(false);
  void potaDeposito();
}

/** riapre un media: dal percorso (app), dalla maniglia ricordata o dal file tenuto nel browser */
async function riapriUno(m: MediaItem, conGesto: boolean): Promise<boolean> {
  if (mediaRT(m.id)?.stato === 'ok') return true;
  if (isTauri && m.path) return (await apriMedia(m, { path: m.path })).stato === 'ok';
  const hh = await idb<Maniglia>('maniglie', 'get', m.id);
  if (hh) {
    try {
      let perm = (await hh.queryPermission?.({ mode: 'read' })) ?? 'granted';
      if (perm !== 'granted' && conGesto) perm = (await hh.requestPermission?.({ mode: 'read' })) ?? 'denied';
      if (perm === 'granted') {
        const file = await hh.getFile();
        if ((await apriMedia(m, { file })).stato === 'ok') return true;
      }
    } catch { /* file spostato */ }
  }
  const tenuto = await idb<Blob>('file', 'get', m.id);
  if (tenuto) {
    const file = tenuto instanceof File ? tenuto : new File([tenuto], m.name, { type: tenuto.type });
    if ((await apriMedia(m, { file })).stato === 'ok') return true;
  }
  return false;
}

/**
 * Riapre i media del progetto. Prima quelli che stanno in timeline, quattro alla volta (col permesso da chiedere,
 * uno alla volta), e a mano a mano che sono pronti l'interfaccia si aggiorna. Il centro attività mostra a che punto è.
 */
export async function riapriMedia(conGesto: boolean): Promise<number> {
  const p = store.doc;
  const da = p.media.filter((m) => mediaRT(m.id)?.stato !== 'ok');
  if (!da.length) { store.emit('doc'); motore.ridisegna(); return 0; }
  const usi = new Map<string, number>();
  for (const c of p.clips) if (c.media) usi.set(c.media, (usi.get(c.media) ?? 0) + 1);
  da.sort((a, b) => (usi.get(b.id) ?? 0) - (usi.get(a.id) ?? 0));
  const lav = nuova({ titolo: 'Riapro i file del progetto', categoria: 'file' });
  let fatti = 0, mancano = 0, prossimo = 0, sporco = false, timer = 0;
  const mostra = () => { timer = 0; if (!sporco) return; sporco = false; store.emit('doc'); motore.ridisegna(); };
  const operaio = async () => {
    for (;;) {
      if (lav.fermato) return;
      const m = da[prossimo++];
      if (!m) return;
      lav.imposta(fatti / da.length, `${fatti + 1} di ${da.length} · ${m.name}`);
      let ok = false;
      try { ok = await riapriUno(m, conGesto); } catch { ok = false; }
      if (!ok) mancano++;
      fatti++;
      lav.imposta(fatti / da.length, `${fatti} di ${da.length}`);
      sporco = true;
      if (!timer) timer = window.setTimeout(mostra, 600);
    }
  };
  await Promise.all(Array.from({ length: conGesto ? 1 : Math.min(4, da.length) }, operaio));
  clearTimeout(timer);
  sporco = true;
  mostra();
  if (lav.fermato) { lav.annullata(); return mancano + (da.length - fatti); }
  lav.fine(mancano ? `${da.length - mancano} file aperti, ${mancano} mancano` : `${da.length} file`);
  return mancano;
}

/** ricollega a mano i file mancanti: si scelgono i file, si abbinano per nome (e dimensione) */
export async function ricollega() {
  const mancanti = store.doc.media.filter((m) => mediaRT(m.id)?.stato !== 'ok');
  if (!mancanti.length) { avviso('Tutti i file sono collegati', 'ok'); return; }
  const n0 = await riapriMedia(true);
  if (!n0) { avviso('File ricollegati', 'ok'); return; }
  const scelti = await scegliMedia();
  let ok = 0;
  for (const m of store.doc.media) {
    if (mediaRT(m.id)?.stato === 'ok') continue;
    const f = scelti.find((s) => s.name === m.name && (!s.file || !m.size || s.file.size === m.size)) ?? scelti.find((s) => s.name === m.name);
    if (!f) continue;
    const r = await apriMedia(m, { file: f.file, path: f.path });
    // il percorso nuovo va nel progetto (e lo segna da salvare): prima si perdeva alla chiusura
    if (r.stato === 'ok') { ok++; if (f.path && f.path !== m.path) store.aggiornaMedia(m.id, { path: f.path }); }
  }
  store.emit('doc');
  motore.ridisegna();
  avviso(`${ok} file ricollegati${store.doc.media.some((m) => mediaRT(m.id)?.stato !== 'ok') ? ', altri ancora mancanti' : ''}`, ok ? 'ok' : 'info');
}

/** all'avvio: riprende l'ultimo montaggio dall'autosalvataggio */
export async function riprendi(): Promise<boolean> {
  let testo: string | undefined;
  try {
    testo = isTauri ? await invoke<string>('autosalvataggio_leggi') : await idb<string>('kv', 'get', 'autosalvataggio');
  } catch { testo = undefined; }
  if (!testo) return false;
  let p: Project | null = null;
  try { p = valida(JSON.parse(testo)); } catch { p = null; }
  if (!p || (!p.clips.length && !p.media.length)) return false;
  cambiaProgetto();
  store.load(p);
  store.dirty = false;
  // il progetto era un .dap: Salva continua ad aggiungere lì (se il file c'è ancora e i media vengono da lì o è stato salvato lì)
  try {
    const dap = isTauri ? localStorage.getItem('dpv-percorso') : null;
    if (dap && /\.dap$/i.test(dap)) {
      const v = await indicePacchetto({ path: dap }).catch(() => null);
      if (v) { percorsoProgetto = dap; ricordaDap(dap, p, v); }
    }
  } catch { /* niente */ }
  const mancano = await riapriMedia(false);
  if (mancano) {
    avviso(`Montaggio ripreso. ${mancano} file da ricollegare: File → Ricollega media`, 'info', 6000);
    document.dispatchEvent(new CustomEvent('dpv:mancano', { detail: mancano }));
  } else avviso('Montaggio ripreso da dove eri rimasto', 'ok', 2500);
  return true;
}

/** togli un media dal contenitore (e le sue clip, se si conferma) */
export async function togliMedia(id: string) {
  const usi = store.doc.clips.filter((c) => c.media === id).length;
  if (usi && !(await conferma('Togli dal contenitore', `Il file è usato da ${usi} clip nella timeline. Togliere anche quelle?`, 'Togli tutto', 'Annulla'))) return;
  store.edit('Togli media', (p) => { p.media = p.media.filter((m) => m.id !== id); p.clips = p.clips.filter((c) => c.media !== id); });
  if (motore.playerMedia === id) motore.caricaPlayer(null);
  // il file tenuto nel browser resta finché non si cambia progetto: con Ctrl+Z il media torna e lo ritrova
}

/** un'operazione lunga (con annulla, se serve): sta nel centro attività, la barra in basso a destra */
export function avvisoLungo(t: string, annulla?: () => void) {
  const l = nuova({ titolo: t, categoria: 'file', alAnnulla: annulla, annullabile: !!annulla });
  return {
    /** il testo di cosa sta facendo; se c'è una percentuale ("45%") o k (0..1) la barra avanza */
    testo: (x: string, k?: number) => { const m = /(\d{1,3})\s*%/.exec(x); l.imposta(k ?? (m ? Number(m[1]) / 100 : l.k), x); },
    chiudi: () => { if (l.attivo) l.fine(); },
  };
}

export { s2f };
