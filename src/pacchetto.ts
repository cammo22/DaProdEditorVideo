// Il pacchetto .daprod: il progetto e tutti i suoi file in un file solo, da portare su un altro computer e
// riaprire identico. È uno zip vero (si apre anche con 7-Zip o con Esplora risorse): dentro ci sono
// progetto.json, i media in media/ e un LEGGIMI. I file sono messi dentro così come sono ("stored", senza
// comprimere: i video lo sono già), così DaProd Editor Video li legge direttamente da dentro lo zip, senza scompattare.
// Zip64 quando serve (file o pacchetti oltre i 4 GB).
import type { MediaItem, Project } from './core/tipi';
import { store } from './core/store';
import { mediaRT } from './media/libreria';
import { dialogoSalva, invoke, isTauri, scarica } from './platform';

// ——— CRC-32 (quello degli zip) ———
const TAB = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
export function crc32(dati: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < dati.length; i++) c = TAB[(c ^ dati[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const MAX32 = 0xffffffff;
const enc = new TextEncoder();

function oraDos(d = new Date()): [number, number] {
  return [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()];
}

interface Voce { nome: Uint8Array; off: number; len: number; crc: number }

/** l'intestazione locale: con zip64 le misure stanno nel campo extra */
function intestazioneLocale(nome: Uint8Array, len: number, crc: number, grande: boolean): Uint8Array {
  const ex = grande ? 20 : 0;
  const b = new Uint8Array(30 + nome.length + ex);
  const v = new DataView(b.buffer);
  const [t, d] = oraDos();
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, grande ? 45 : 20, true);
  v.setUint16(6, 0x0800, true); // nomi in UTF-8
  v.setUint16(8, 0, true); // stored
  v.setUint16(10, t, true);
  v.setUint16(12, d, true);
  v.setUint32(14, crc, true);
  v.setUint32(18, grande ? MAX32 : len, true);
  v.setUint32(22, grande ? MAX32 : len, true);
  v.setUint16(26, nome.length, true);
  v.setUint16(28, ex, true);
  b.set(nome, 30);
  if (grande) {
    const o = 30 + nome.length;
    v.setUint16(o, 0x0001, true);
    v.setUint16(o + 2, 16, true);
    v.setBigUint64(o + 4, BigInt(len), true);
    v.setBigUint64(o + 12, BigInt(len), true);
  }
  return b;
}

/** l'indice in fondo: le voci del centro, e la fine (zip64 se serve) */
function indice(voci: Voce[], inizio: number): Uint8Array {
  const pezzi: Uint8Array[] = [];
  const [t, d] = oraDos();
  for (const x of voci) {
    const lenGrande = x.len >= MAX32, offGrande = x.off >= MAX32;
    const ex = (lenGrande ? 16 : 0) + (offGrande ? 8 : 0);
    const b = new Uint8Array(46 + x.nome.length + (ex ? 4 + ex : 0));
    const v = new DataView(b.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 45, true);
    v.setUint16(6, lenGrande || offGrande ? 45 : 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, t, true);
    v.setUint16(14, d, true);
    v.setUint32(16, x.crc, true);
    v.setUint32(20, lenGrande ? MAX32 : x.len, true);
    v.setUint32(24, lenGrande ? MAX32 : x.len, true);
    v.setUint16(28, x.nome.length, true);
    v.setUint16(30, ex ? 4 + ex : 0, true);
    v.setUint32(42, offGrande ? MAX32 : x.off, true);
    b.set(x.nome, 46);
    if (ex) {
      let o = 46 + x.nome.length;
      v.setUint16(o, 0x0001, true);
      v.setUint16(o + 2, ex, true);
      o += 4;
      if (lenGrande) { v.setBigUint64(o, BigInt(x.len), true); v.setBigUint64(o + 8, BigInt(x.len), true); o += 16; }
      if (offGrande) v.setBigUint64(o, BigInt(x.off), true);
    }
    pezzi.push(b);
  }
  const cdLen = pezzi.reduce((s, b) => s + b.length, 0);
  const z64 = inizio >= MAX32 || cdLen >= MAX32 || voci.length >= 0xffff || voci.some((x) => x.off >= MAX32 || x.len >= MAX32);
  if (z64) {
    const r = new Uint8Array(56 + 20);
    const v = new DataView(r.buffer);
    v.setUint32(0, 0x06064b50, true);
    v.setBigUint64(4, 44n, true);
    v.setUint16(12, 45, true);
    v.setUint16(14, 45, true);
    v.setBigUint64(24, BigInt(voci.length), true);
    v.setBigUint64(32, BigInt(voci.length), true);
    v.setBigUint64(40, BigInt(cdLen), true);
    v.setBigUint64(48, BigInt(inizio), true);
    v.setUint32(56, 0x07064b50, true);
    v.setBigUint64(64, BigInt(inizio + cdLen), true);
    v.setUint32(72, 1, true);
    pezzi.push(r);
  }
  const e = new Uint8Array(22);
  const v = new DataView(e.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, Math.min(0xffff, voci.length), true);
  v.setUint16(10, Math.min(0xffff, voci.length), true);
  v.setUint32(12, Math.min(MAX32, cdLen), true);
  v.setUint32(16, z64 ? MAX32 : inizio, true);
  pezzi.push(e);
  const out = new Uint8Array(pezzi.reduce((s, b) => s + b.length, 0));
  let o = 0;
  for (const b of pezzi) { out.set(b, o); o += b.length; }
  return out;
}

/** da dove si leggono i byte di un media per metterlo nel pacchetto */
interface Fonte { path?: string; file?: Blob; off: number; len: number }

function fonteDi(m: MediaItem): Fonte | null {
  const r = mediaRT(m.id);
  if (!r || r.stato !== 'ok') return null;
  if (r.file) return { file: r.file, off: 0, len: r.file.size };
  if (r.path) return { path: r.path, off: r.off ?? 0, len: r.len ?? m.size };
  return null;
}

/** nome del file dentro il pacchetto: numero + nome ripulito (niente doppioni) */
const nomeDentro = (i: number, m: MediaItem) => `media/${String(i + 1).padStart(3, '0')}-${m.name.replace(/[\\/:*?"<>|]/g, '_')}`;

export interface Piano { voci: { m: MediaItem; f: Fonte; nome: string }[]; mancano: MediaItem[]; byte: number }

/** cosa entra nel pacchetto: tutti i file del contenitore (o solo quelli usati), e quanto pesa */
export async function pianoPacchetto(soloUsati: boolean): Promise<Piano> {
  const p = store.doc;
  const usati = new Set<string>();
  for (const c of p.clips) if (c.media) usati.add(c.media);
  for (const s of p.sequenze ?? []) for (const c of s.clips ?? []) if (c.media) usati.add(c.media);
  if (p.master?.logo?.media) usati.add(p.master.logo.media);
  const voci: Piano['voci'] = [];
  const mancano: MediaItem[] = [];
  let i = 0;
  for (const m of p.media) {
    if (soloUsati && !usati.has(m.id)) continue;
    const f = fonteDi(m);
    if (!f) { mancano.push(m); continue; }
    if (f.path && !f.len) f.len = await invoke<number>('media_dimensione', { path: f.path });
    voci.push({ m, f, nome: nomeDentro(i++, m) });
  }
  return { voci, mancano, byte: voci.reduce((s, x) => s + x.f.len, 0) };
}

const LEGGIMI = `DaProd Editor Video · pacchetto del progetto

Questo file è un progetto di DaProd Editor Video con dentro tutti i suoi file: aprilo con
DaProd Editor Video (File → Apri, o doppio clic) e ritrovi il montaggio identico, anche su
un altro computer. Non serve scompattarlo.

Dentro: progetto.json (il montaggio) e la cartella media/ (i video, le musiche, le immagini).
https://github.com/cammo22/DaProdVideo
`;

/** il progetto come sta dentro il pacchetto: i media puntano ai file di media/, niente percorsi di questo computer */
function progettoDentro(piano: Piano, soloUsati: boolean): string {
  const p = structuredClone(store.doc) as Project;
  const nomi = new Map(piano.voci.map((x) => [x.m.id, x.nome]));
  if (soloUsati) p.media = p.media.filter((m) => nomi.has(m.id));
  for (const m of p.media) {
    delete m.path;
    delete m.dentro;
    const n = nomi.get(m.id);
    if (n) m.pacchetto = n; else delete m.pacchetto;
  }
  p.saved = Date.now();
  return JSON.stringify(p);
}

/**
 * Scrive il pacchetto. Nell'app dove sceglie l'utente (i byte dei video li copia Rust, senza passare da qui);
 * nel browser lo scarica (il Blob è fatto dei file stessi, niente copie in memoria).
 */
export async function scriviPacchetto(nomeFile: string, piano: Piano, soloUsati: boolean, avanza: (fatti: number, totale: number, cosa: string) => void, annullato: () => boolean): Promise<string | null> {
  const json = enc.encode(progettoDentro(piano, soloUsati));
  const leggimi = enc.encode(LEGGIMI);
  const totale = piano.byte + json.length;
  let fatti = 0;
  const voci: Voce[] = [];

  if (isTauri) {
    const path = await dialogoSalva(nomeFile, 'daprod', 'application/zip');
    if (!path) return null;
    // riscrivere proprio il pacchetto da cui si leggono i file li cancellerebbe: serve un nome diverso
    if (piano.voci.some((x) => x.f.path === path)) throw new Error('scegli un nome diverso dal pacchetto aperto (i file si leggono da lì)');
    const id = await invoke<number>('export_apri', { path });
    const scrivi = (b: Uint8Array, pos: number) => invoke('export_scrivi', b, { headers: { 'x-id': String(id), 'x-pos': String(pos) } });
    let pos = 0;
    try {
      const piccolo = async (nome: string, dati: Uint8Array) => {
        const n = enc.encode(nome), crc = crc32(dati);
        const h = intestazioneLocale(n, dati.length, crc, false);
        await scrivi(h, pos);
        await scrivi(dati, pos + h.length);
        voci.push({ nome: n, off: pos, len: dati.length, crc });
        pos += h.length + dati.length;
      };
      await piccolo('LEGGIMI.txt', leggimi);
      await piccolo('progetto.json', json);
      fatti += json.length;
      for (const x of piano.voci) {
        if (annullato()) throw new Error('annullato');
        const n = enc.encode(x.nome), grande = x.f.len >= MAX32;
        const h = intestazioneLocale(n, x.f.len, 0, grande);
        await scrivi(h, pos);
        const dati = pos + h.length;
        // a pezzi da 64 MB, così la barra si muove e si può annullare; il CRC continua da un pezzo all'altro
        let crc = 0;
        const PEZZO = 64 << 20;
        for (let a = 0; a < x.f.len; a += PEZZO) {
          if (annullato()) throw new Error('annullato');
          const b = Math.min(x.f.len, a + PEZZO);
          crc = await invoke<number>('pacchetto_copia', { path: x.f.path, start: x.f.off + a, end: x.f.off + b, id, pos: dati + a, crc });
          fatti += b - a;
          avanza(fatti, totale, x.m.name);
        }
        // il CRC si sa solo alla fine: si torna a scriverlo nell'intestazione
        const c = new Uint8Array(4);
        new DataView(c.buffer).setUint32(0, crc, true);
        await scrivi(c, pos + 14);
        voci.push({ nome: n, off: pos, len: x.f.len, crc });
        pos = dati + x.f.len;
      }
      await scrivi(indice(voci, pos), pos);
    } finally {
      await invoke('export_chiudi', { id });
    }
    return path;
  }

  // nel browser: un Blob fatto di pezzi (le intestazioni e i file stessi)
  const pezzi: BlobPart[] = [];
  let pos = 0;
  const aggiungi = (nome: string, dati: Uint8Array) => {
    const n = enc.encode(nome), crc = crc32(dati);
    const h = intestazioneLocale(n, dati.length, crc, false);
    pezzi.push(h as BlobPart, dati as BlobPart);
    voci.push({ nome: n, off: pos, len: dati.length, crc });
    pos += h.length + dati.length;
  };
  aggiungi('LEGGIMI.txt', leggimi);
  aggiungi('progetto.json', json);
  fatti += json.length;
  for (const x of piano.voci) {
    if (annullato()) return null;
    const blob = x.f.file!.slice(x.f.off, x.f.off + x.f.len);
    // il CRC si calcola leggendo il file a pezzi (il file resta dov'è)
    let crc = 0;
    const r = blob.stream().getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      crc = crc32(value, crc);
      fatti += value.length;
      avanza(fatti, totale, x.m.name);
      if (annullato()) { await r.cancel(); return null; }
    }
    const n = enc.encode(x.nome);
    const h = intestazioneLocale(n, x.f.len, crc, x.f.len >= MAX32);
    pezzi.push(h as BlobPart, blob);
    voci.push({ nome: n, off: pos, len: x.f.len, crc });
    pos += h.length + x.f.len;
  }
  pezzi.push(indice(voci, pos) as BlobPart);
  const tutto = new Blob(pezzi, { type: 'application/zip' });
  const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> };
  if (w.showSaveFilePicker) {
    try {
      const hh = await w.showSaveFilePicker({ suggestedName: nomeFile, types: [{ description: 'Progetto DaProd Editor Video', accept: { 'application/zip': ['.daprod'] } }] });
      const ws = await (hh as unknown as { createWritable: () => Promise<WritableStream> }).createWritable();
      await tutto.stream().pipeTo(ws);
      return nomeFile;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  scarica(tutto, nomeFile);
  return nomeFile;
}

// ——— lettura ———
/** da dove si legge il pacchetto: un percorso (app) o un file (browser) */
export interface Sorgente { path?: string; file?: File }

export async function leggi(s: Sorgente, a: number, b: number): Promise<Uint8Array> {
  if (s.file) return new Uint8Array(await s.file.slice(a, b).arrayBuffer());
  return new Uint8Array(await invoke<ArrayBuffer>('media_leggi', { path: s.path, start: a, end: b }));
}

export interface VoceLetta { nome: string; off: number; len: number; stored: boolean; /** dove comincia l'intestazione locale */ testa: number; crc: number }

/** l'indice del pacchetto: nome → dove stanno i byte (zip e zip64) */
/**
 * Dove sta la fine dello zip (la firma PK\5\6) e se è buona: l'indice deve finire proprio lì (o, con zip64, ci deve essere il
 * suo localizzatore subito prima). Prima si guarda in fondo al file; se lì non c'è (un salvataggio .dap interrotto a metà ha
 * lasciato dei byte dopo la fine buona di prima) si cerca all'indietro in tutto il file: si ritrova il progetto salvato prima.
 */
async function trovaFine(s: Sorgente, size: number): Promise<number> {
  const buona = async (e: number): Promise<boolean> => {
    if (e < 0 || e + 22 > size) return false;
    const b = await leggi(s, Math.max(0, e - 20), e + 22);
    const v = new DataView(b.buffer, b.byteOffset);
    const o = e - Math.max(0, e - 20);
    if (v.getUint32(o, true) !== 0x06054b50) return false;
    const cdLen = v.getUint32(o + 12, true), cdOff = v.getUint32(o + 16, true);
    if (cdLen === MAX32 || cdOff === MAX32 || v.getUint16(o + 10, true) === 0xffff) return o >= 20 && v.getUint32(o - 20, true) === 0x07064b50;
    return cdOff + cdLen === e;
  };
  // prima la coda (66 KB: la fine più il commento più lungo), poi all'indietro a pezzi da 8 MB che si sovrappongono di 22 byte
  let fine = size, quanto = 66000;
  for (;;) {
    const da = Math.max(0, fine - quanto);
    const b = await leggi(s, da, fine);
    for (let i = b.length - 22; i >= 0; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06 && (await buona(da + i))) return da + i;
    }
    if (da === 0) break;
    fine = da + 22;
    quanto = 8 << 20;
  }
  throw new Error('non è un pacchetto (manca la fine dello zip)');
}

export async function indicePacchetto(s: Sorgente): Promise<Map<string, VoceLetta>> {
  const size = s.file ? s.file.size : await invoke<number>('media_dimensione', { path: s.path });
  const E = await trovaFine(s, size);
  const base = Math.max(0, E - 20);
  const coda = await leggi(s, base, E + 22);
  const e = E - base;
  const dv = new DataView(coda.buffer, coda.byteOffset);
  let n = dv.getUint16(e + 10, true), cdLen = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
  if (n === 0xffff || cdLen === MAX32 || cdOff === MAX32) {
    const l = e - 20;
    if (l < 0 || dv.getUint32(l, true) !== 0x07064b50) throw new Error('zip64 senza il suo indice');
    const z = Number(dv.getBigUint64(l + 8, true));
    const r = await leggi(s, z, z + 56);
    const rv = new DataView(r.buffer, r.byteOffset);
    if (rv.getUint32(0, true) !== 0x06064b50) throw new Error('zip64 rovinato');
    n = Number(rv.getBigUint64(32, true));
    cdLen = Number(rv.getBigUint64(40, true));
    cdOff = Number(rv.getBigUint64(48, true));
  }
  const cd = await leggi(s, cdOff, cdOff + cdLen);
  const cv = new DataView(cd.buffer, cd.byteOffset);
  const dec = new TextDecoder();
  const out = new Map<string, VoceLetta>();
  let o = 0;
  for (let k = 0; k < n && o + 46 <= cd.length; k++) {
    if (cv.getUint32(o, true) !== 0x02014b50) break;
    const metodo = cv.getUint16(o + 10, true);
    let len = cv.getUint32(o + 20, true);
    let usiz = cv.getUint32(o + 24, true);
    const nl = cv.getUint16(o + 28, true), el = cv.getUint16(o + 30, true), cl = cv.getUint16(o + 32, true);
    let loc = cv.getUint32(o + 42, true);
    const crc = cv.getUint32(o + 16, true);
    const nome = dec.decode(cd.subarray(o + 46, o + 46 + nl));
    // zip64: le misure vere nel campo extra, nell'ordine usiz, len, loc (solo quelle a 0xFFFFFFFF)
    let x = o + 46 + nl;
    const fx = x + el;
    while (x + 4 <= fx) {
      const id = cv.getUint16(x, true), sz = cv.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (usiz === MAX32) { usiz = Number(cv.getBigUint64(q, true)); q += 8; }
        if (len === MAX32) { len = Number(cv.getBigUint64(q, true)); q += 8; }
        if (loc === MAX32) { loc = Number(cv.getBigUint64(q, true)); }
      }
      x += 4 + sz;
    }
    out.set(nome, { nome, off: loc, len, stored: metodo === 0 && len === usiz, testa: loc, crc });
    o += 46 + nl + el + cl;
  }
  // dove cominciano davvero i byte: dopo l'intestazione locale (che ha la sua lunghezza del campo extra)
  for (const v of out.values()) {
    const h = await leggi(s, v.off, v.off + 30);
    const hv = new DataView(h.buffer, h.byteOffset);
    if (hv.getUint32(0, true) !== 0x04034b50) throw new Error('voce rovinata: ' + v.nome);
    v.off = v.off + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  }
  return out;
}

/** legge il progetto dentro il pacchetto e dice dove sta ogni media (i media restano dentro, non si scompatta niente) */
export async function leggiPacchetto(s: Sorgente): Promise<{ testo: string; voci: Map<string, VoceLetta> }> {
  const voci = await indicePacchetto(s);
  const pj = voci.get('progetto.json');
  if (!pj) throw new Error('nel pacchetto manca progetto.json');
  if (!pj.stored) throw new Error('progetto.json compresso: questo pacchetto non l\'ha fatto DaProd Editor Video');
  const testo = new TextDecoder().decode(await leggi(s, pj.off, pj.off + pj.len));
  return { testo, voci };
}

// ——— il progetto .dap (dalla 1.5.3): il salvataggio normale, con TUTTO dentro ———
// Stesso zip del pacchetto, ma è quello che fa Salva (Ctrl+S): progetto.json, i media (video, musiche, immagini, registrazioni,
// audio lavorato dall'AI) e le copie leggere (proxy/…, così su un altro computer il monitor va liscio subito, senza rifarle).
// La prima volta si scrive tutto; dopo, Salva AGGIUNGE in fondo al file solo quello che manca (i file nuovi e il progetto
// aggiornato) e un indice nuovo: i byte dei video già dentro non si toccano e non si spostano (chi li sta leggendo continua
// a leggerli dallo stesso punto). Il progetto vecchio resta come spazio morto: Salva come… riscrive tutto pulito.

/** cosa c'è dentro il .dap aperto/salvato adesso: media → nome dentro e lunghezza (per non ricopiarlo al prossimo Salva) */
const dentroDap: { path: string | null; media: Map<string, { nome: string; len: number }> } = { path: null, media: new Map() };
export const dapAttuale = () => dentroDap.path;
export function ricordaDap(path: string | null, p?: Project, voci?: Map<string, VoceLetta>) {
  dentroDap.path = path;
  dentroDap.media = new Map();
  if (path && p && voci) for (const m of p.media) { const v = m.pacchetto ? voci.get(m.pacchetto) : undefined; if (v) dentroDap.media.set(m.id, { nome: v.nome, len: v.len }); }
}

/** una cosa da mettere nel .dap: un file da un percorso (anche un pezzo di un altro pacchetto), un Blob, o byte in memoria */
interface DaScrivere { nome: string; path?: string; off?: number; blob?: Blob; dati?: Uint8Array; len: number; cosa: string }

/** il nome dentro il .dap: dipende dall'id del media (non cambia fra un salvataggio e l'altro, mai doppioni) */
const nomeDap = (m: MediaItem) => `media/${m.id}-${m.name.replace(/[\\/:*?"<>|]/g, '_')}`;

export interface PianoDap { cose: DaScrivere[]; tenute: VoceLetta[]; mancano: MediaItem[]; nomi: Map<string, string>; byte: number }

/**
 * Cosa scrivere. `vecchie` = l'indice del .dap che c'è già (si aggiunge), o null (si scrive da capo).
 * proxy = le copie leggere da mettere dentro (nome → file).
 */
export async function pianoDap(vecchie: Map<string, VoceLetta> | null, proxy: Map<string, Blob>): Promise<PianoDap> {
  const p = store.doc;
  const cose: DaScrivere[] = [];
  const tenute: VoceLetta[] = [];
  const mancano: MediaItem[] = [];
  const nomi = new Map<string, string>();
  const preso = new Set<string>();
  const tieni = (v: VoceLetta) => { if (!preso.has(v.nome)) { tenute.push(v); preso.add(v.nome); } };
  for (const m of p.media) {
    const gia = vecchie ? dentroDap.media.get(m.id) : undefined;
    const v = gia ? vecchie!.get(gia.nome) : undefined;
    if (gia && v && v.len === gia.len) {
      // già nel .dap (e uguale): resta dov'è
      tieni(v);
      nomi.set(m.id, v.nome);
      continue;
    }
    const f = fonteDi(m);
    if (!f) {
      // scollegato, ma era già dentro questo .dap: si tiene quello che c'era
      const vv = m.pacchetto ? vecchie?.get(m.pacchetto) : undefined;
      if (vv && dentroDap.path) { tieni(vv); nomi.set(m.id, vv.nome); } else mancano.push(m);
      continue;
    }
    if (f.path && !f.len) f.len = await invoke<number>('media_dimensione', { path: f.path });
    const nome = nomeDap(m);
    const vecchia = vecchie?.get(nome);
    if (vecchia && vecchia.len === f.len) { tieni(vecchia); nomi.set(m.id, nome); continue; }
    cose.push({ nome, path: f.path, off: f.off, blob: f.file, len: f.len, cosa: m.name });
    nomi.set(m.id, nome);
  }
  for (const [n, b] of proxy) {
    const nome = 'proxy/' + n;
    const v = vecchie?.get(nome);
    if (v && v.len === b.size) { tieni(v); continue; }
    cose.push({ nome, blob: b, len: b.size, cosa: 'copia leggera' });
  }
  const leggimi = vecchie?.get('LEGGIMI.txt');
  if (leggimi) tieni(leggimi);
  else { const d = enc.encode(LEGGIMI_DAP); cose.unshift({ nome: 'LEGGIMI.txt', dati: d, len: d.length, cosa: 'LEGGIMI' }); }
  return { cose, tenute, mancano, nomi, byte: cose.reduce((s, x) => s + x.len, 0) };
}

const LEGGIMI_DAP = `DaProd Editor Video · progetto completo (.dap)

Questo file è un progetto di DaProd Editor Video con dentro TUTTO: il montaggio (progetto.json),
tutti i file (media/: video, musiche, immagini, registrazioni, audio lavorato) e le copie
leggere per il monitor (proxy/). Aprilo con DaProd Editor Video (File → Apri, o doppio clic),
anche su un altro computer: ritrovi tutto identico. Non serve scompattarlo.
https://github.com/cammo22/DaProdVideo
`;

/** il progetto come sta dentro il .dap: i media puntano ai loro file dentro, niente percorsi di questo computer */
function progettoDap(nomi: Map<string, string>): string {
  const p = structuredClone(store.doc) as Project;
  for (const m of p.media) {
    delete m.path;
    delete m.dentro;
    const n = nomi.get(m.id);
    if (n) m.pacchetto = n; else delete m.pacchetto;
  }
  p.saved = Date.now();
  return JSON.stringify(p);
}

/**
 * Scrive il .dap nell'app. `vecchie` = il file c'è già ed è un .dap buono: si scrive in fondo (veloce). Se il lavoro si ferma
 * a metà mentre si aggiunge, si rimette in fondo l'indice di prima: il file resta il progetto di prima.
 */
export async function scriviDapApp(path: string, vecchie: Map<string, VoceLetta> | null, piano: PianoDap, avanza: (fatti: number, totale: number, cosa: string) => void, annullato: () => boolean): Promise<void> {
  const totale = Math.max(1, piano.byte);
  let fatti = 0;
  const voci: Voce[] = piano.tenute.map((v) => ({ nome: enc.encode(v.nome), off: v.testa, len: v.len, crc: v.crc }));
  const id = await invoke<number>(vecchie ? 'pacchetto_riapri' : 'export_apri', { path });
  const scrivi = (b: Uint8Array, pos: number) => invoke('export_scrivi', b, { headers: { 'x-id': String(id), 'x-pos': String(pos) } });
  // si aggiunge dopo l'ultimo byte del file (la lunghezza si chiede al file aperto in scrittura, non alla lettura che il programma tiene in memoria)
  let pos = vecchie ? await invoke<number>('pacchetto_lunghezza', { id }) : 0;
  const inizio = pos;
  let fatto = false;
  try {
    const una = async (x: DaScrivere) => {
      if (annullato()) throw new Error('annullato');
      const n = enc.encode(x.nome);
      const len = x.len;
      const h = intestazioneLocale(n, len, x.dati ? crc32(x.dati) : 0, len >= MAX32);
      await scrivi(h, pos);
      const dati = pos + h.length;
      let crc = 0;
      if (x.dati) {
        await scrivi(x.dati, dati);
        crc = crc32(x.dati);
        fatti += len;
      } else if (x.path) {
        const PEZZO = 64 << 20;
        for (let a = 0; a < len; a += PEZZO) {
          if (annullato()) throw new Error('annullato');
          const b = Math.min(len, a + PEZZO);
          crc = await invoke<number>('pacchetto_copia', { path: x.path, start: (x.off ?? 0) + a, end: (x.off ?? 0) + b, id, pos: dati + a, crc });
          fatti += b - a;
          avanza(fatti, totale, x.cosa);
        }
      } else if (x.blob) {
        const PEZZO = 8 << 20;
        const o = x.off ?? 0;
        for (let a = 0; a < len; a += PEZZO) {
          if (annullato()) throw new Error('annullato');
          const b = new Uint8Array(await x.blob.slice(o + a, o + Math.min(len, a + PEZZO)).arrayBuffer());
          crc = crc32(b, crc);
          await scrivi(b, dati + a);
          fatti += b.length;
          avanza(fatti, totale, x.cosa);
        }
      }
      if (!x.dati) { const c = new Uint8Array(4); new DataView(c.buffer).setUint32(0, crc, true); await scrivi(c, pos + 14); }
      voci.push({ nome: n, off: pos, len, crc });
      pos = dati + len;
    };
    for (const x of piano.cose) await una(x);
    // il progetto per ultimo: così sa già dove sta ogni file
    const json = enc.encode(progettoDap(piano.nomi));
    await una({ nome: 'progetto.json', dati: json, len: json.length, cosa: 'progetto' });
    await scrivi(indice(voci, pos), pos);
    fatto = true;
  } finally {
    // fermato a metà mentre si aggiungeva: l'indice di prima torna in fondo (il file resta il progetto di prima)
    if (!fatto && vecchie) {
      const prima: Voce[] = [...vecchie.values()].map((v) => ({ nome: enc.encode(v.nome), off: v.testa, len: v.len, crc: v.crc }));
      const dove = Math.max(pos, inizio);
      await scrivi(indice(prima, dove), dove).catch(() => {});
    }
    await invoke('export_chiudi', { id });
  }
  const lunghe = new Map(voci.map((v) => [dec.decode(v.nome), v.len]));
  dentroDap.path = path;
  dentroDap.media = new Map([...piano.nomi].map(([mid, nome]) => [mid, { nome, len: lunghe.get(nome) ?? 0 }]));
}
const dec = new TextDecoder();

/** il .dap come Blob fatto dei file stessi (niente copie in memoria): nel browser, e nelle prove */
export async function costruisciDap(piano: PianoDap, avanza: (fatti: number, totale: number, cosa: string) => void = () => {}, annullato: () => boolean = () => false): Promise<Blob> {
  const pezzi: BlobPart[] = [];
  const voci: Voce[] = [];
  let pos = 0, fatti = 0;
  const totale = Math.max(1, piano.byte);
  const aggiungi = async (x: DaScrivere) => {
    const n = enc.encode(x.nome);
    const blob = x.dati ? new Blob([x.dati as BlobPart]) : x.blob ? x.blob.slice(x.off ?? 0, (x.off ?? 0) + x.len) : null;
    if (!blob) return;
    let crc = 0;
    const r = blob.stream().getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      crc = crc32(value, crc);
      fatti += value.length;
      avanza(fatti, totale, x.cosa);
      if (annullato()) { await r.cancel(); throw new Error('annullato'); }
    }
    const h = intestazioneLocale(n, blob.size, crc, blob.size >= MAX32);
    pezzi.push(h as BlobPart, blob);
    voci.push({ nome: n, off: pos, len: blob.size, crc });
    pos += h.length + blob.size;
  };
  for (const x of piano.cose) await aggiungi(x);
  const json = enc.encode(progettoDap(piano.nomi));
  await aggiungi({ nome: 'progetto.json', dati: json, len: json.length, cosa: 'progetto' });
  pezzi.push(indice(voci, pos) as BlobPart);
  return new Blob(pezzi, { type: 'application/zip' });
}

/** nel browser: si salva dove si sceglie (o si scarica) */
export async function scriviDapBrowser(nomeFile: string, piano: PianoDap, avanza: (fatti: number, totale: number, cosa: string) => void, annullato: () => boolean): Promise<string | null> {
  const tutto = await costruisciDap(piano, avanza, annullato);
  const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> };
  if (w.showSaveFilePicker) {
    try {
      const hh = await w.showSaveFilePicker({ suggestedName: nomeFile, types: [{ description: 'Progetto DaProd Editor Video', accept: { 'application/zip': ['.dap'] } }] });
      const ws = await (hh as unknown as { createWritable: () => Promise<WritableStream> }).createWritable();
      await tutto.stream().pipeTo(ws);
      return nomeFile;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  scarica(tutto, nomeFile);
  return nomeFile;
}
