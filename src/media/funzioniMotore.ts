// Le funzioni AI del motore locale opzionale, dalla parte del programma: voce pulita, voce e musica, tagli di scena, parole
// con i tempi, rallentatore fluido. Ogni risultato è MATERIALE DA MODIFICARE sul banco, mai una sostituzione muta:
//  · voce pulita → un audio nuovo ("Audio lavorato"), la clip passa a lui e ricorda l'originale (`afx.pulito`): si torna
//    indietro con «Audio originale» o con Ctrl+Z;
//  · voce e musica → due tracce nuove, l'originale resta ma va in silenzio (`afx.separata`);
//  · scene → marcatori sulla timeline (si spostano, si cancellano, "Taglia alle scene" li trasforma in tagli veri);
//  · parole con i tempi → righe di sottotitolo normali (si correggono nella riga SOTT);
//  · rallentatore → una clip nuova su una traccia sua sopra l'originale.
// Passano tutti dal Centro attività (corsia pesante, avanzamento, Ferma e Riprova) e dal motore AI locale, che tiene un
// modello alla volta in memoria. Nelle prove il motore è finto (`MotoreAI` con un trasporto finto).
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, WebMOutputFormat, getFirstEncodableVideoCodec } from 'mediabunny';
import type { Clip, MediaItem, Project } from '../core/tipi';
import { newClip, newTrack, nextTrackName, uid } from '../core/progetto';
import { isVideoClip } from '../core/progetto';
import { store } from '../core/store';
import { togliAnimazione } from '../core/automazioni';
import { f2s } from '../core/timecode';
import { SOTTO0, sottotitoliDi } from '../core/sottotitoli';
import { mettiMarcatoriScena, pianoRallenta, righeDaParole, trattiDaPunti, type ParolaTempo, type TaglioScena } from '../core/materialeAI';
import { avviso } from '../ui/dom';
import { codificaWav } from './wav';
import { inCoda, progettoAttuale, type Lavoro } from './attivita';
import { spiegaErroreAI, testoErrore } from './erroriAI';
import { chiudi as chiudiMedia, importa } from './libreria';
import { liberaVram } from './vram';
import { motoreAI, motoreLocaleDisponibile, type MotoreAI, type PercorsoLavoro } from './motoreAI';
import {
  ClipCambiata, ancoraValida, cartellaAudioLavorato, clipAudioDi, gemelle, inCorso, inLavoro, leggiAudio, nomeBase, possibilita, sorgenteDi, tratto, type Tratto,
} from './audioAI';
import { audioPerVoce, puntiDiTaglio } from './voce';
import { salvaMediaSulDisco } from '../platform';

export type FunzioneMotore = 'traduci' | 'pulisci' | 'separa' | 'scene' | 'rallenta' | 'trascrivi';
/** quale modello del motore serve a quale funzione (stessi id del catalogo in src-tauri/motore/motore_catalogo.py) */
export const MODELLO_DI: Record<FunzioneMotore, { id: string; nome: string }> = {
  traduci: { id: 'hy-mt2-18b', nome: 'Hy-MT2 1.8B' },
  pulisci: { id: 'deepfilternet3', nome: 'DeepFilterNet3' },
  separa: { id: 'kim-vocal-2', nome: 'Kim Vocal 2' },
  scene: { id: 'transnetv2', nome: 'TransNetV2' },
  rallenta: { id: 'rife-425', nome: 'RIFE 4.25' },
  trascrivi: { id: 'qwen3-asr-06b', nome: 'Qwen3-ASR + ForcedAligner' },
};

export const SECONDI_MASSIMI_AUDIO = 30 * 60;
const TRATTO_ASR = 10 * 60;
export const SECONDI_MASSIMI_RALLENTA = 12;

/** la frase quando una funzione del motore non si può usare, con cosa fare */
export function servePerFunzione(funzione: FunzioneMotore, perche: 'browser' | 'motore' | 'modello'): string {
  const nome = MODELLO_DI[funzione].nome;
  if (perche === 'browser') return `${nome} gira nel motore AI locale opzionale, che c'è solo nell'app per Windows (non nel browser).`;
  if (perche === 'motore') return `${nome} gira nel motore AI locale opzionale, che non è installato. Aprilo dal Centro AI: «Motore AI locale» → Installa. Il montaggio funziona anche senza.`;
  return `Il motore AI locale c'è, ma ${nome} non è ancora sul computer. Scaricalo dal Centro AI: «Motore AI locale» → Scarica ${nome}.`;
}

/** per le prove: dice se il motore locale "c'è" (null = quello vero: solo l'app per Windows) */
let disponibileProva: (() => boolean) | null = null;
export const impostaMotoreDisponibile = (f: (() => boolean) | null) => { disponibileProva = f; };

/** accende il motore e controlla che il modello della funzione sia sul computer. Non scarica niente da solo. */
export async function preparaMotore(m: MotoreAI, funzione: FunzioneMotore, avanza: (k: number | null, t: string) => void = () => {}, segnale?: AbortSignal, disponibile: () => boolean = () => (disponibileProva ?? motoreLocaleDisponibile)()): Promise<void> {
  if (!disponibile()) throw new Error(servePerFunzione(funzione, 'browser'));
  const s = await m.stato();
  if (s.stato === 'non-installato' || s.stato === 'installazione') throw new Error(servePerFunzione(funzione, 'motore'));
  await m.azione('accendi', avanza, segnale);
  const mod = (await m.modelli()).find((x) => x.id === MODELLO_DI[funzione].id);
  if (!mod?.scaricato) throw new Error(servePerFunzione(funzione, 'modello'));
}

/** un lavoro del motore con la pulizia della cartella di scambio alla fine, comunque vada */
export async function lavoroMotore<T>(m: MotoreAI, percorso: PercorsoLavoro, dati: Record<string, unknown>, avanza: (k: number | null, t: string) => void, segnale?: AbortSignal): Promise<T> {
  return m.lavoro<T>(percorso, dati, avanza, segnale);
}

// ——— un WAV costruito a blocchi (per dare l'audio di una clip al motore) ———

/** raccoglie blocchi di campioni (un array per canale) e ne fa un file WAV a 16 bit; puro, si prova da Node */
export class ScrittoreWavMemoria {
  private pezzi: Int16Array[] = [];
  private campioni = 0;
  constructor(readonly sr: number, readonly canali: number) {}
  aggiungi(ch: Float32Array[]) {
    const n = ch[0].length, nc = this.canali;
    const a = new Int16Array(n * nc);
    for (let c = 0; c < nc; c++) {
      const x = ch[c] ?? ch[0];
      for (let i = 0; i < n; i++) { const y = Math.max(-1, Math.min(1, x[i])); a[i * nc + c] = y < 0 ? y * 0x8000 : y * 0x7fff; }
    }
    this.pezzi.push(a);
    this.campioni += n;
  }
  get durata() { return this.campioni / this.sr; }
  chiudi(): Uint8Array {
    const dati = this.campioni * this.canali * 2;
    const out = new Uint8Array(44 + dati);
    const v = new DataView(out.buffer);
    const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + dati, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, this.canali, true);
    v.setUint32(24, this.sr, true); v.setUint32(28, this.sr * this.canali * 2, true); v.setUint16(32, this.canali * 2, true); v.setUint16(34, 16, true);
    s(36, 'data'); v.setUint32(40, dati, true);
    let o = 44;
    for (const p of this.pezzi) { out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), o); o += p.byteLength; }
    this.pezzi = [];
    return out;
  }
}

const nomeScambio = (base: string, estensione = 'wav') => `${base}-${Date.now().toString(36)}.${estensione}`;

async function wavDelTratto(t: Tratto, l: Lavoro, da: number, fino: number): Promise<Uint8Array> {
  const w = new ScrittoreWavMemoria(t.sr, t.canali);
  let letti = 0;
  await leggiAudio(t, Math.round(t.sr), async (ch) => {
    if (l.fermato) throw new Error('fermato');
    w.aggiungi(ch);
    letti += ch[0].length;
    l.imposta(da + (fino - da) * Math.min(1, letti / t.n), `Leggo l'audio: ${Math.round(letti / t.sr)} di ${Math.round(t.n / t.sr)} secondi`);
  }, l.segnale);
  return w.chiudi();
}

/** salva i byte di un WAV sul disco e li importa nel contenitore (nell'app; il motore c'è solo lì) */
async function importaWav(nome: string, byte: Uint8Array): Promise<MediaItem> {
  const path = await salvaMediaSulDisco(nome, new Blob([byte as BlobPart], { type: 'audio/wav' }));
  if (!path) throw new Error('Non riesco a salvare il file sul disco: controlla spazio e permessi, poi riprova');
  const r = await importa({ name: nome, path });
  if ('errore' in r) throw new Error(r.errore);
  return r.item;
}

function controllaDurata(t: Tratto) {
  if (t.n / t.sr > SECONDI_MASSIMI_AUDIO) throw new Error('Questo tratto di audio è troppo lungo per il motore (massimo 30 minuti): accorcia la clip');
}

// ——— voce pulita ———

/** DeepFilterNet3 nel motore locale: la clip passa a un audio nuovo "pulito", l'originale si conserva (Audio originale / Ctrl+Z) */
export async function puliziaVoceMotore(clipId: string, forza = 1, m: MotoreAI = motoreAI): Promise<void> {
  const p0 = store.doc;
  const c0 = p0.clips.find((c) => c.id === clipId);
  if (!c0) throw new Error('Non trovo la clip');
  const poss = possibilita(c0, p0);
  if (!poss.rumore) throw new Error(poss.perche ?? 'Su questa clip non si può togliere il rumore');
  const a = clipAudioDi(p0, c0)!;
  const s0 = sorgenteDi(p0, a);
  if (typeof s0 === 'string') throw new Error(s0);
  const t = tratto(p0, s0.m, s0.srcIn, a);
  if (typeof t === 'string') throw new Error(t);
  controllaDurata(t);
  const progetto = progettoAttuale();
  inCorso.set(a.id, 'rumore');
  try {
    await inLavoro(`Voce pulita (motore AI) · ${s0.m.name}`, async (l) => {
      if (progetto !== progettoAttuale()) throw new ClipCambiata('Il progetto è cambiato');
      liberaVram();
      l.imposta(0, 'Accendo il motore AI…');
      await preparaMotore(m, 'pulisci', (k, x) => l.imposta((k ?? 0) * 0.05, x), l.segnale);
      try {
        const wav = await wavDelTratto(t, l, 0.05, 0.2);
        const dentro = nomeScambio('ingresso');
        await m.inviaFile(dentro, wav, (k) => l.imposta(0.2 + 0.05 * k, 'Mando l\'audio al motore…'), l.segnale);
        const r = await lavoroMotore<{ file: string }>(m, '/voce/pulisci', { file: dentro, forza, dispositivo: 'cuda' }, (k, x) => l.imposta(0.25 + 0.6 * (k ?? 0), x), l.segnale);
        const bytes = await m.scaricaFile(r.file, (k) => l.imposta(0.85 + 0.07 * k, 'Prendo la voce pulita…'), l.segnale);
        l.imposta(0.93, 'Metto l\'audio pulito nel progetto…');
        const nuovo = await importaWav(`${nomeBase(s0.m.name)} - pulito (motore).wav`, bytes);
        const perche = ancoraValida(a, t, s0);
        if (perche || progetto !== progettoAttuale()) { chiudiMedia(nuovo.id); throw new ClipCambiata((perche ?? 'Il progetto è cambiato') + ': non l\'ho applicato'); }
        store.edit('Voce pulita (motore AI)', (p) => {
          nuovo.cartella = cartellaAudioLavorato(p);
          p.media.push(nuovo);
          const x = p.clips.find((c) => c.id === a.id)!;
          for (const c of [x, ...gemelle(p, x)]) {
            const prima = sorgenteDi(p, c);
            if (typeof prima === 'string') continue;
            const vecchio = c.afx?.pulito?.piu ?? 0;
            c.afx = { ...c.afx, pulito: { media: prima.m.id, srcIn: prima.srcIn, forza: 'pulita', da: t.da } };
            if (vecchio) c.gain = Math.round((c.gain - vecchio) * 10) / 10;
            c.srcIn = prima.srcIn - t.da;
            c.media = nuovo.id;
          }
        });
        store.select([a.id]);
        l.imposta(1, 'Fatto');
        avviso(`🎙 Voce pulita (motore AI): ${s0.m.name}. Ctrl+Z o «Audio originale» per tornare com'era`, 'ok', 4200);
      } finally { await m.pulisciScambio(); }
    }, a.id);
  } finally { inCorso.delete(a.id); }
}

// ——— voce e musica ———

/** Kim Vocal 2 nel motore locale: due tracce nuove "Voce · …" e "Base · …", l'originale resta ma va in silenzio */
export async function separaMotore(clipId: string, m: MotoreAI = motoreAI): Promise<void> {
  const p0 = store.doc;
  const c0 = p0.clips.find((c) => c.id === clipId);
  if (!c0) throw new Error('Non trovo la clip');
  const poss = possibilita(c0, p0);
  if (!poss.separa) throw new Error(poss.perche ?? 'Su questa clip non si può separare voce e base');
  const a = clipAudioDi(p0, c0)!;
  const s0 = sorgenteDi(p0, a, true);
  if (typeof s0 === 'string') throw new Error(s0);
  const t = tratto(p0, s0.m, s0.srcIn, a);
  if (typeof t === 'string') throw new Error(t);
  controllaDurata(t);
  const progetto = progettoAttuale();
  const base = nomeBase(s0.m.name);
  inCorso.set(a.id, 'separa');
  try {
    await inLavoro(`Voce e musica (motore AI) · ${s0.m.name}`, async (l) => {
      if (progetto !== progettoAttuale()) throw new ClipCambiata('Il progetto è cambiato');
      liberaVram();
      l.imposta(0, 'Accendo il motore AI…');
      await preparaMotore(m, 'separa', (k, x) => l.imposta((k ?? 0) * 0.05, x), l.segnale);
      const importati: MediaItem[] = [];
      let applicato = false;
      try {
        const wav = await wavDelTratto(t, l, 0.05, 0.15);
        const dentro = nomeScambio('canzone');
        await m.inviaFile(dentro, wav, (k) => l.imposta(0.15 + 0.05 * k, 'Mando l\'audio al motore…'), l.segnale);
        const r = await lavoroMotore<{ voce: string; musica: string }>(m, '/audio/separa', { file: dentro, dispositivo: 'cuda' }, (k, x) => l.imposta(0.2 + 0.6 * (k ?? 0), x), l.segnale);
        const item = new Map<'voce' | 'base', MediaItem>();
        for (const [ruolo, file] of [['voce', r.voce], ['base', r.musica]] as const) {
          const bytes = await m.scaricaFile(file, (k) => l.imposta(0.8 + 0.08 * k, `Prendo ${ruolo === 'voce' ? 'la voce' : 'la base'}…`), l.segnale);
          const it = await importaWav(`${base} - ${ruolo} (motore).wav`, bytes);
          importati.push(it);
          item.set(ruolo, it);
        }
        l.imposta(0.95, 'Metto le due tracce nel progetto…');
        const perche = ancoraValida(a, t, s0, true);
        if (perche || progetto !== progettoAttuale()) throw new ClipCambiata((perche ?? 'Il progetto è cambiato') + ': non l\'ho applicato');
        const nuove = store.edit('Voce e musica (motore AI)', (p) => {
          const x = p.clips.find((c) => c.id === a.id)!;
          const cartella = cartellaAudioLavorato(p);
          const ids: string[] = [];
          const nuoveClip: Clip[] = [];
          for (const [n, it] of item) {
            it.cartella = cartella;
            p.media.push(it);
            const tr = newTrack('audio', `${n === 'voce' ? 'Voce' : 'Base'} · ${s0.m.name.replace(/\.[^.]+$/, '').slice(0, 28)}`);
            p.tracks.push(tr);
            const c = newClip('media', tr.id, x.start, x.len, {
              media: it.id, name: `${n === 'voce' ? 'Voce' : 'Base'}: ${x.name}`, srcIn: s0.srcIn - t.da, speed: x.speed, nastro: x.nastro, label: x.label,
              gain: x.gain, gainKeys: structuredClone(x.gainKeys), anim: x.anim?.gain ? { gain: structuredClone(x.anim.gain) } : undefined, pan: x.pan, fadeIn: x.fadeIn, fadeOut: x.fadeOut, curvaIn: x.curvaIn, curvaOut: x.curvaOut,
              afx: { separata: { ruolo: n, con: [x.id] } },
            });
            p.clips.push(c);
            nuoveClip.push(c);
            ids.push(c.id);
          }
          for (const c of [x, ...gemelle(p, x)]) {
            c.afx = { ...c.afx, separata: { ruolo: 'originale', con: ids, gain: c.gain } };
            c.gain = -60;
            c.gainKeys = [];
            togliAnimazione(c, 'gain');
          }
          for (const c of nuoveClip) c.afx!.separata!.con = [x.id, ...ids.filter((i) => i !== c.id)];
          return ids;
        });
        applicato = true;
        store.select(nuove);
        l.imposta(1, 'Fatto');
        avviso(`🎤 Voce e musica separate (motore AI): ${s0.m.name}. L'originale è in silenzio (Ctrl+Z annulla tutto)`, 'ok', 4800);
      } catch (e) {
        // fermato o fallito dopo aver già preso la voce: i file importati non servono a nessuno, non restano nel contenitore
        if (!applicato) for (const it of importati) chiudiMedia(it.id);
        throw e;
      } finally { await m.pulisciScambio(); }
    }, a.id);
  } finally { inCorso.delete(a.id); }
}

// ——— lavori che non toccano l'audio di una clip: stessa coda, stessa maniglia ———

let inLavoroGenerico = false;
async function inCodaMotore<T>(titolo: string, fn: (l: Lavoro) => Promise<T>): Promise<T> {
  if (inLavoroGenerico) throw new Error('Il motore AI sta già lavorando: aspetta che finisca (o fermalo dal Centro attività)');
  inLavoroGenerico = true;
  let errore: unknown = null, fatto = false;
  try {
    const r = await inCoda({ corsia: 'pesante', titolo, categoria: 'ai', priorita: 1000 }, async (l) => {
      try { const x = await fn(l); fatto = true; return x; } catch (e) { errore = e; throw e; }
    });
    if (errore) throw errore instanceof ClipCambiata || testoErrore(errore) === 'fermato' ? errore : new Error(spiegaErroreAI(errore));
    if (!fatto) throw new Error('fermato');
    return r as T;
  } finally { inLavoroGenerico = false; }
}

/** il file di una ripresa sul disco, com'è e dove, per il motore (che lo legge da solo: nessun video passa dal browser) */
function ripresaSulDisco(p: Project, c: Clip): { m: MediaItem; da: number; a: number } {
  if (c.kind !== 'media' || !isVideoClip(c, p)) throw new Error('Scegli una ripresa video nella timeline');
  const m = p.media.find((x) => x.id === c.media);
  if (!m) throw new Error('Il file di questa clip non c\'è più nel contenitore');
  if (!m.path || m.dentro) throw new Error('Il motore legge i video dal disco: questo è dentro un pacchetto o non ha un percorso (apri il file vero e riprova)');
  const usato = f2s(c.len, p.rate) * (c.speed || 1);
  const da = Math.max(0, c.srcIn - (m.t0 || 0));
  return { m, da, a: da + usato };
}

// ——— scene → marcatori ———

/** TransNetV2: trova i cambi di scena della clip e li mette come marcatori «Scena N». Ritorna quanti. */
export async function trovaScene(clipId: string, soglia = 0.5, m: MotoreAI = motoreAI): Promise<number> {
  const p0 = store.doc;
  const c0 = p0.clips.find((c) => c.id === clipId);
  if (!c0) throw new Error('Non trovo la clip');
  const v = ripresaSulDisco(p0, c0);
  const progetto = progettoAttuale();
  return inCodaMotore(`Tagli automatici (scene) · ${v.m.name}`, async (l) => {
    liberaVram();
    l.imposta(0, 'Accendo il motore AI…');
    await preparaMotore(m, 'scene', (k, x) => l.imposta((k ?? 0) * 0.1, x), l.segnale);
    const r = await lavoroMotore<{ tagli: TaglioScena[] }>(m, '/scene', { file: v.m.path, da: v.da, a: v.a, soglia }, (k, x) => l.imposta(0.1 + 0.85 * (k ?? 0), x), l.segnale);
    if (progetto !== progettoAttuale() || !store.doc.clips.some((c) => c.id === clipId)) throw new ClipCambiata('La clip è cambiata mentre cercavo');
    // il motore conta dall'inizio del file: i tempi del file di partenza (MTS…) si rimettono
    const tagli = r.tagli.map((x) => ({ ...x, t: x.t + (v.m.t0 || 0) }));
    const n = store.edit('Tagli automatici (scene)', (p) => mettiMarcatoriScena(p, clipId, tagli));
    l.imposta(1, n ? `${n} cambi di scena` : 'Nessun cambio di scena');
    avviso(n ? `🎬 Trovati ${n} cambi di scena: sono marcatori, spostali o cancellali. «Taglia alle scene» li trasforma in tagli` : 'Nessun cambio di scena in questo tratto', n ? 'ok' : 'info', 5200);
    return n;
  });
}

// ——— parole con i tempi → sottotitoli ———

const CODICE_DA_NOME: Record<string, string> = { Italian: 'it', English: 'en', Spanish: 'es', French: 'fr', German: 'de', Portuguese: 'pt', Chinese: 'zh', Japanese: 'ja', Korean: 'ko', Russian: 'ru', Arabic: 'ar' };

/** Qwen3-ASR + ForcedAligner: scrive i sottotitoli di tutto il montaggio, parola per parola coi suoi tempi. Sostituisce le righe (Ctrl+Z torna). */
export async function sottotitoliQwen(lingua = 'auto', m: MotoreAI = motoreAI): Promise<number> {
  const p0 = structuredClone(store.doc);
  const progetto = progettoAttuale();
  return inCodaMotore('Sottotitoli con parole e tempi (Qwen3-ASR)', async (l) => {
    liberaVram();
    l.imposta(0, 'Accendo il motore AI…');
    await preparaMotore(m, 'trascrivi', (k, x) => l.imposta((k ?? 0) * 0.05, x), l.segnale);
    const audio = await audioPerVoce(p0, (k) => l.imposta(0.05 + k * 0.1, 'Preparo l\'audio dei dialoghi…'));
    let picco = 0;
    for (let i = 0; i < audio.length; i += 64) picco = Math.max(picco, Math.abs(audio[i]));
    if (picco < 0.003) throw new Error('Nei dialoghi del montaggio non si sente niente da scrivere');
    const SR = 16000;
    // i tratti si tagliano nel punto più silenzioso vicino ai 10 minuti: una parola non resta spezzata fra due lavori
    const tratti = trattiDaPunti(puntiDiTaglio(audio, TRATTO_ASR, 15));
    const parole: ParolaTempo[] = [];
    let rilevata = '';
    let senzaTempi = false;
    for (let i = 0; i < tratti.length; i++) {
      const [da, a] = tratti[i];
      const nome = nomeScambio('parlato');
      const k0 = 0.15 + (0.8 * i) / tratti.length, k1 = 0.15 + (0.8 * (i + 1)) / tratti.length;
      try {
        await m.inviaFile(nome, codificaWav(audio.slice(Math.floor(da * SR), Math.floor(a * SR)), SR), () => {}, l.segnale);
        const r = await lavoroMotore<{ lingua: string; parole: ParolaTempo[]; senza_tempi: boolean }>(m, '/trascrivi', { file: nome, lingua, dispositivo: 'cuda' }, (k, x) => l.imposta(k0 + (k1 - k0) * (k ?? 0), x), l.segnale);
        rilevata ||= r.lingua;
        senzaTempi ||= r.senza_tempi;
        for (const w of r.parole) parole.push({ ...w, da: w.da + da, a: w.a + da });
      } finally { await m.pulisciScambio(); }
    }
    if (!parole.length) throw new Error(senzaTempi
      ? `Qwen3-ASR ha riconosciuto il parlato (${rilevata}) ma per questa lingua non sa dare i tempi delle parole: usa Whisper per i sottotitoli`
      : 'Non ho trovato parole nei dialoghi');
    if (progetto !== progettoAttuale()) throw new ClipCambiata('Il progetto è cambiato');
    const righe = righeDaParole(parole, store.doc);
    const codice = lingua !== 'auto' ? lingua : CODICE_DA_NOME[rilevata] ?? sottotitoliDi(store.doc).lingua;
    store.edit('Sottotitoli con Qwen3-ASR', (p) => {
      p.sottotitoli = { ...structuredClone(SOTTO0), ...(p.sottotitoli ?? {}) };
      p.sottotitoli.righe = righe;
      p.sottotitoli.lingua = codice;
    });
    l.imposta(1, `${righe.length} righe`);
    avviso(`💬 ${righe.length} righe di sottotitoli, con i tempi di ogni parola. Correggile nella riga SOTT (Ctrl+Z torna indietro)`, 'ok', 5200);
    return righe.length;
  });
}

// ——— rallentatore fluido (sperimentale) ———

/** i fotogrammi del motore (JPEG) in un video nuovo, a `fps` fotogrammi al secondo: sulla stessa cadenza dell'originale la clip va più piano */
export async function fotogrammiInVideo(jpeg: Uint8Array[], larghezza: number, altezza: number, fps: number, nome: string): Promise<{ bytes: Uint8Array; nome: string }> {
  const w = larghezza - (larghezza % 2), h = altezza - (altezza % 2);
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8', 'av1'], { width: w, height: h });
  if (!codec) throw new Error('Questo computer non sa codificare video: non posso fare la clip rallentata');
  const mp4 = codec === 'avc';
  const out = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d')!;
  const sorgente = new CanvasSource(cv, { codec, bitrate: new Quality('high'), keyFrameInterval: 2 });
  out.addVideoTrack(sorgente, { frameRate: fps });
  await out.start();
  for (let i = 0; i < jpeg.length; i++) {
    const img = await createImageBitmap(new Blob([jpeg[i] as BlobPart], { type: 'image/jpeg' }));
    ctx.drawImage(img, 0, 0, w, h);
    img.close();
    await sorgente.add(i / fps, 1 / fps);
  }
  await out.finalize();
  return { bytes: new Uint8Array((out.target as BufferTarget).buffer!), nome: nome.replace(/\.[^.]+$/, '') + (mp4 ? '.mp4' : '.webm') };
}

/**
 * RIFE nel motore locale: fotogrammi intermedi per un rallentatore fluido (×2 o ×4) di un tratto breve della ripresa.
 * Fa una CLIP NUOVA su una traccia nuova sopra l'originale, che resta com'è; si annulla con Ctrl+Z. SPERIMENTALE.
 */
export async function rallentaClip(clipId: string, fattore: 2 | 4 = 2, m: MotoreAI = motoreAI): Promise<void> {
  const p0 = store.doc;
  const c0 = p0.clips.find((c) => c.id === clipId);
  if (!c0) throw new Error('Non trovo la clip');
  const v = ripresaSulDisco(p0, c0);
  if (v.a - v.da > SECONDI_MASSIMI_RALLENTA) throw new Error(`Il rallentatore fluido lavora su al massimo ${SECONDI_MASSIMI_RALLENTA} secondi per volta: accorcia la clip (tasto 1 per tagliare)`);
  const progetto = progettoAttuale();
  const piano = pianoRallenta(v.a - v.da, fattore, v.m.fps || 25, p0.rate);
  await inCodaMotore(`Rallentatore fluido ×${fattore} (sperimentale) · ${v.m.name}`, async (l) => {
    liberaVram();
    l.imposta(0, 'Accendo il motore AI…');
    await preparaMotore(m, 'rallenta', (k, x) => l.imposta((k ?? 0) * 0.05, x), l.segnale);
    try {
      const r = await lavoroMotore<{ cartella: string; file: string[]; fps: number; larghezza: number; altezza: number }>(m, '/rallenta', { file: v.m.path, da: v.da, a: v.a, fattore, dispositivo: 'cuda' }, (k, x) => l.imposta(0.05 + 0.6 * (k ?? 0), x), l.segnale);
      const jpeg: Uint8Array[] = [];
      for (let i = 0; i < r.file.length; i++) {
        jpeg.push(await m.scaricaFile(`${r.cartella}/${r.file[i]}`, () => {}, l.segnale));
        l.imposta(0.65 + 0.2 * ((i + 1) / r.file.length), `Prendo i fotogrammi: ${i + 1} di ${r.file.length}`);
      }
      l.imposta(0.87, 'Faccio il video della clip rallentata…');
      const video = await fotogrammiInVideo(jpeg, r.larghezza, r.altezza, r.fps || v.m.fps || 25, `${nomeBase(v.m.name)} - rallentato x${fattore}.mp4`);
      const path = await salvaMediaSulDisco(video.nome, new Blob([video.bytes as BlobPart], { type: video.nome.endsWith('.mp4') ? 'video/mp4' : 'video/webm' }));
      if (!path) throw new Error('Non riesco a salvare il video sul disco: controlla spazio e permessi, poi riprova');
      const imp = await importa({ name: video.nome, path });
      if ('errore' in imp) throw new Error(imp.errore);
      if (progetto !== progettoAttuale() || !store.doc.clips.some((c) => c.id === clipId)) { chiudiMedia(imp.item.id); throw new ClipCambiata('La clip è cambiata mentre lavoravo: non l\'ho applicato'); }
      const nuova = store.edit(`Rallentatore fluido ×${fattore} (RIFE)`, (p) => {
        const orig = p.clips.find((c) => c.id === clipId)!;
        const cartella = (p.cartelle ??= []).find((x) => x.nome === 'Clip rallentate' && !x.genitore)?.id ?? (() => { const id = uid('d'); p.cartelle!.push({ id, nome: 'Clip rallentate' }); return id; })();
        imp.item.cartella = cartella;
        p.media.push(imp.item);
        const tr = newTrack('video', nextTrackName(p, 'video'));
        tr.name = 'Rallentatore ×' + fattore;
        p.tracks.unshift(tr);
        const c = newClip('media', tr.id, orig.start, piano.lunghezza, { media: imp.item.id, name: `Rallentatore ×${fattore}: ${orig.name}`, tf: structuredClone(orig.tf), opacity: orig.opacity, label: orig.label });
        p.clips.push(c);
        return c.id;
      });
      store.select([nuova]);
      l.imposta(1, 'Fatto');
      avviso(`🐌 Clip rallentata ×${fattore} sulla traccia nuova sopra l'originale (che resta com'era). Ctrl+Z annulla`, 'ok', 5200);
    } finally { await m.pulisciScambio(); }
  });
}
