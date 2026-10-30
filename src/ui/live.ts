// La pagina LIVE: registra lo schermo (o una finestra, o una scheda) con un tasto solo. REGISTRA, PAUSA, FERMA:
// quando fermi, la registrazione finisce nel contenitore (cartella Registrazioni) e, se vuoi, in fondo alla timeline.
// Col microfono e con l'audio del computer, mescolati in una traccia, e con la webcam: registrata a parte (file suo)
// e posata sulla traccia sopra come bolla in un angolo, così dopo si sposta, si ingrandisce o si toglie. Prima di
// partire il conto 3-2-1; mentre registri M mette un segno (diventa un marcatore); il telecomando resta sopra alle
// altre finestre (Document Picture-in-Picture nel browser, la finestra piccola e in primo piano nell'app).
// Più finestre: mentre registri puoi aggiungere altre finestre o schermi (＋ Finestra) e passare dall'una all'altra al volo
// (clic sulla miniatura, o i tasti 1-9): la Regia disegna quella scelta (o due insieme, affiancate o una in angolo) in una
// tela di misura fissa e registra quella, così il file resta uno solo e la misura non cambia.
// L'audio (voce e computer) passa da un mixer (src/media/liveAudio.ts): barre dei livelli, volumi, bilanciamento, filtri
// della voce e abbassa-il-computer si regolano dal vivo e finiscono nella registrazione (pannello: src/ui/liveAudio.ts).
// Sotto c'è il motore del browser (getDisplayMedia, getUserMedia e MediaRecorder).
// La PAUSA chiude un pezzo e RIPRENDI ne apre un altro (la pausa di MediaRecorder non la tratta uguale ogni browser:
// alcuni lasciano il buco nel file); alla fine Mediabunny cuce i pezzi uno dopo l'altro in un file solo, con durata
// e indice giusti, così si taglia e si sposta come gli altri.
// Non ci si fida nemmeno della consegna finale di MediaRecorder (con alcuni Chromium quello che arriva allo stop si
// perde): i dati escono a pezzetti di un quarto di secondo, e alla PAUSA il registratore va avanti ancora un attimo
// prima di fermarsi; quel pezzetto in più poi si taglia via cucendo, al punto esatto in cui hai premuto.
import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion, EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource,
  Input, Mp4OutputFormat, Output, WebMOutputFormat,
} from 'mediabunny';
import '../stile/live.css';
import { store } from '../core/store';
import { newClip, newTrack, nextTrackName, projectEnd, uid } from '../core/progetto';
import { fps } from '../core/timecode';
import * as M from '../core/montaggio';
import { ANGOLI, bolla, presentazione, SFONDI, type Angolo } from '../core/cornici';
import type { MediaItem } from '../core/tipi';
import { importaFile } from '../progetti';
import { invoke, isAndroid, isTauri, salvaMediaSulDisco, spazioLibero } from '../platform';
import { CursoreLive } from '../media/cursoreLive';
import { SceltaSchermoLive } from './liveCursore';
import { applicaZoomCursore, bloccoClicLive } from '../core/zoomCursore';
import { motore } from '../motore';
import { avviso, h, icona } from './dom';
import { Telecomando, type StatoTelecomando } from './telecomando';
import { PannelloAudio } from './liveAudio';
import { MixerLive } from '../media/liveAudio';
import { copiaImpostazioni, IMPOSTAZIONI0, type ImpostazioniAudio } from '../core/liveAudio';
import { risorseLive } from '../core/risorseLive';
import { minutiRimasti, testoGB, testoInfo } from '../core/liveInfo';
import { puliziaSpoolVecchi, Spool, uscitaSuDisco } from '../media/spoolLive';

// per le prove: i conti puri dell'audio e il mixer, raggiungibili da `__dpvTest.LV`
export * as liveAudioPuro from '../core/liveAudio';
export { MixerLive };

/** da dove arriva l'immagine: di solito la scelta del sistema; le prove ne mettono una finta (anche microfono e webcam) */
type Sorgente = (conAudio: boolean) => Promise<MediaStream>;
let sorgenteProva: Sorgente | null = null;
let microfonoProva: (() => Promise<MediaStream>) | null = null;
let webcamProva: (() => Promise<MediaStream>) | null = null;
export const impostaSorgenteLive = (s: Sorgente | null, mic: (() => Promise<MediaStream>) | null = null, cam: (() => Promise<MediaStream>) | null = null) => {
  sorgenteProva = s; microfonoProva = mic; webcamProva = cam;
};

const puoRegistrare = () => !!sorgenteProva || (!!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined' && !isAndroid);

async function avvisaErroreSchermo(e: unknown) {
  if (!sorgenteProva && !navigator.mediaDevices?.getDisplayMedia) {
    avviso('Qui non si può condividere lo schermo: usa l’app oppure Chrome o Edge su una pagina sicura (HTTPS).', 'errore', 6500);
    return;
  }
  const { name = '', message = '' } = (e ?? {}) as { name?: string; message?: string };
  let negato = /permission.*denied|permesso.*negato|denied by system|not allowed by|permissions? policy/i.test(message);
  if (name === 'NotAllowedError' || name === 'AbortError') {
    try {
      const permesso = await navigator.permissions.query({ name: 'display-capture' as PermissionName });
      negato ||= permesso.state === 'denied';
    } catch { /* alcuni browser non espongono questo permesso */ }
    if (!negato) return; // Il selettore è stato chiuso: non è un errore da mostrare.
  }
  avviso(negato
    ? 'La condivisione dello schermo è bloccata: controlla i permessi del browser e del sistema, poi riprova.'
    : 'Non riesco ad aggiungere la finestra: ' + (message || String(e)), 'errore', 6500);
}

function formato(soloVideo = false): string {
  const lista = soloVideo
    ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
  for (const m of lista) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

function formatoAudio(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

const due = (n: number) => String(n).padStart(2, '0');
const orologio = (ms: number) => { const s = Math.floor(ms / 1000); return `${due(Math.floor(s / 3600))}:${due(Math.floor(s / 60) % 60)}:${due(s % 60)}`; };

/** quanto il registratore va avanti dopo PAUSA e FERMA (quel tratto poi si taglia), e ogni quanto consegna i dati */
const GRAZIA = 600;
const FETTA = 250;

/** un tratto registrato fra una pausa e l'altra: il file e dove tagliarlo (secondi dal suo inizio); `libera` toglie il file temporaneo dal disco */
interface Tratto { blob: Blob; taglio: number; nota: string; libera?: () => Promise<void> }

/** i file cuciti sul disco, con quello che serve per toglierli quando la registrazione è stata consegnata */
const liberaDi = new WeakMap<Blob, () => Promise<void>>();

/** i pezzi fra una pausa e l'altra, cuciti uno dopo l'altro in un file solo, senza ricodificare, ognuno tagliato
 *  dove si è premuto PAUSA o FERMA (null se non si riesce: allora si prova pezzo per pezzo). Nell'app il file cucito
 *  si scrive sul disco un pezzetto alla volta (`sulDisco`): se non va, si rifà in memoria come una volta. */
async function cuci(tratti: Tratto[], mp4: boolean, note: string[], tempi?: { indice: number; daMs: number; durataMs: number }[], sulDisco = false, cuciti?: Blob[]): Promise<Blob | null> {
  const ingressi = tratti.map((x) => new Input({ source: new BlobSource(x.blob), formats: ALL_FORMATS }));
  // il WebM si scrive di seguito, l'MP4 veloce vuole tutto in memoria fino alla fine
  const disco = sulDisco && !mp4 ? await uscitaSuDisco('cucito', 'video/webm') : null;
  const note0 = note.length, tempi0 = tempi?.length ?? 0;
  let output: Output | null = null;
  try {
    const v0 = await ingressi[0].getPrimaryVideoTrack();
    const a0 = await ingressi[0].getPrimaryAudioTrack();
    // solo audio (il microfono registrato a parte): niente video, si cuce lo stesso
    if (!v0?.codec && !a0?.codec) { await disco?.scarta(); return null; }
    output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: disco?.target ?? new BufferTarget() });
    const sv = v0?.codec ? new EncodedVideoPacketSource(v0.codec) : null;
    if (sv) output.addVideoTrack(sv);
    const sa = a0?.codec ? new EncodedAudioPacketSource(a0.codec) : null;
    if (sa) output.addAudioTrack(sa);
    await output.start();
    const cv = await v0?.getDecoderConfig();
    const ca = await a0?.getDecoderConfig();
    let primoV = true, primoA = true;
    /** dove comincia il pezzo nel file cucito, in secondi */
    let inizio = 0;
    for (const [i, inp] of ingressi.entries()) {
      const v = sv ? await inp.getPrimaryVideoTrack() : null;
      const a = sa ? await inp.getPrimaryAudioTrack() : null;
      if (sv && !v) { note.push(`pezzo ${i + 1}: niente video`); continue; }
      if (!sv && !a) { note.push(`pezzo ${i + 1}: niente audio`); continue; }
      // video e audio del pezzo partono insieme: si toglie a tutti e due lo stesso inizio
      const base = Math.min(v ? await v.getFirstTimestamp() : Infinity, a ? await a.getFirstTimestamp() : Infinity);
      const taglio = tratti[i].taglio;
      let fine = inizio, nv = 0, na = 0, via = 0;
      if (v && sv) for await (const pk of new EncodedPacketSink(v).packets()) {
        // dopo il taglio c'è il tratto di grazia: via (togliere la coda non rovina i fotogrammi prima)
        if (pk.timestamp - base > taglio) { via++; continue; }
        nv++;
        const t = inizio + Math.max(0, pk.timestamp - base);
        fine = Math.max(fine, t + (pk.duration || 1 / 30));
        await sv.add(pk.clone({ timestamp: t }), primoV && cv ? { decoderConfig: cv } : undefined);
        primoV = false;
      }
      if (a && sa) {
        let ultimo = -1;
        for await (const pk of new EncodedPacketSink(a).packets()) {
          if (pk.timestamp - base > taglio) { via++; continue; }
          na++;
          const t = Math.max(ultimo, inizio + Math.max(0, pk.timestamp - base));
          ultimo = t;
          fine = Math.max(fine, t + (pk.duration || 0.02));
          await sa.add(pk.clone({ timestamp: t }), primoA && ca ? { decoderConfig: ca } : undefined);
          primoA = false;
        }
      }
      note.push(`pezzo ${i + 1}: ${nv} fotogrammi e ${na} pacchetti audio, ${(fine - inizio).toFixed(2)} s (taglio ${taglio.toFixed(2)} s, ${via} via)`);
      tempi?.push({ indice: i, daMs: inizio * 1000, durataMs: (fine - inizio) * 1000 });
      inizio = fine;
    }
    await output.finalize();
    const tipo = sv ? (mp4 ? 'video/mp4' : 'video/webm') : mp4 ? 'audio/mp4' : 'audio/webm';
    if (disco) {
      const blob = new Blob([await disco.finito()], { type: tipo });
      liberaDi.set(blob, disco.scarta);
      cuciti?.push(blob);
      return blob;
    }
    const buf = (output.target as BufferTarget).buffer;
    return buf ? new Blob([buf], { type: tipo }) : null;
  } catch {
    try { await output?.cancel(); } catch { /* già chiuso */ }
    await disco?.scarta();
    // sul disco non è andata: una seconda volta in memoria (come prima)
    if (disco) { note.length = note0; if (tempi) tempi.length = tempi0; return cuci(tratti, mp4, note, tempi, false, cuciti); }
    return null;
  } finally {
    for (const i of ingressi) i.dispose();
  }
}

/** il file del MediaRecorder non sa quanto dura e non ha l'indice: lo si ricopia com'è (senza ricodificare) */
async function rimetteInOrdine(blob: Blob, mp4: boolean): Promise<Blob> {
  let input: Input | undefined;
  try {
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
    const conv = await Conversion.init({ input, output });
    if (!conv.isValid) return blob;
    await conv.execute();
    const buf = (output.target as BufferTarget).buffer;
    return buf ? new Blob([buf], { type: mp4 ? 'video/mp4' : 'video/webm' }) : blob;
  } catch {
    return blob;
  } finally { input?.dispose(); }
}

/** nell'app la registrazione va sul disco (Video/DaProd Video), così il progetto la ritrova sempre */
const salvaSulDisco = salvaMediaSulDisco;


/** un video che non serve più: si ferma, lascia il flusso e libera il decoder (srcObject=null da solo non basta
 *  su tutti i motori: il video resta agganciato all'ultima immagine finché non si chiede di ricaricare) */
function liberaVideo(v: HTMLVideoElement | null | undefined) {
  if (!v) return;
  try { v.pause(); } catch { /* niente */ }
  v.srcObject = null;
  try { v.removeAttribute('src'); v.load(); } catch { /* niente */ }
}

/** una finestra (o uno schermo) che si può registrare: il suo flusso e un video nascosto che lo fa scorrere */
interface Fonte { flusso: MediaStream; video: HTMLVideoElement; nome: string; miniatura: HTMLCanvasElement }
type Disposizione = 'solo' | 'angolo' | 'affiancate';

/** la regia: disegna la finestra scelta (o due) in una tela di misura fissa, tanti fotogrammi al secondo quanti ne vuoi */
class Regia {
  fonti: Fonte[] = [];
  attiva = 0;
  layout: Disposizione = 'solo';
  tela: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tick: Worker | number = 0;
  track: MediaStreamTrack;
  flusso: MediaStream;
  private fermata = false;
  private chiudiTela: () => void;
  private chiudiWorker: () => void = () => {};

  constructor(public w: number, public h: number, fps: number) {
    this.tela = document.createElement('canvas');
    this.tela.width = w; this.tela.height = h;
    this.chiudiTela = risorseLive.apri('tela');
    this.ctx = this.tela.getContext('2d', { alpha: false })!;
    this.flusso = risorseLive.flusso(this.tela.captureStream(fps));
    this.track = this.flusso.getVideoTracks()[0];
    this.disegna();
    // il battito: un lavoratore a parte non viene rallentato quando la finestra dell'app è nascosta o coperta
    const ms = Math.round(1000 / fps);
    try {
      const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
      const w2 = new Worker(url);
      URL.revokeObjectURL(url);
      w2.onmessage = () => { if (!this.fermata) this.disegna(); };
      this.tick = w2;
      this.chiudiWorker = risorseLive.apri('worker');
    } catch { this.tick = window.setInterval(() => this.disegna(), ms); }
  }

  private riquadro(v: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    if (!v.videoWidth || !v.videoHeight) return;
    const k = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * k, dh = v.videoHeight * k;
    this.ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  disegna() {
    const c = this.ctx, W = this.w, H = this.h, n = this.fonti.length;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    if (!n) return;
    const a = this.fonti[Math.min(this.attiva, n - 1)];
    const b = n > 1 ? this.fonti[(this.attiva + 1) % n] : null;
    if (this.layout === 'affiancate' && b) {
      this.riquadro(a.video, 0, 0, W / 2, H);
      this.riquadro(b.video, W / 2, 0, W / 2, H);
    } else {
      this.riquadro(a.video, 0, 0, W, H);
      if (this.layout === 'angolo' && b) {
        const pw = W * 0.28, ph = H * 0.28, m = H * 0.03;
        c.save();
        c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 18;
        c.fillStyle = '#000';
        c.fillRect(W - pw - m, H - ph - m, pw, ph);
        c.restore();
        this.riquadro(b.video, W - pw - m, H - ph - m, pw, ph);
        c.strokeStyle = '#ffd54a'; c.lineWidth = Math.max(2, H / 360);
        c.strokeRect(W - pw - m, H - ph - m, pw, ph);
      }
    }
  }

  /** chiude tutto: il battito, le tracce, i video nascosti e la tela (che libera la sua memoria sulla scheda video) */
  ferma() {
    if (this.fermata) return;
    this.fermata = true;
    if (typeof this.tick === 'number') clearInterval(this.tick); else this.tick.terminate();
    this.chiudiWorker();
    risorseLive.fermaTutte(this.flusso);
    for (const f of this.fonti) { liberaVideo(f.video); f.video.remove(); f.miniatura.width = 0; f.miniatura.height = 0; }
    this.fonti = [];
    this.tela.width = 0; this.tela.height = 0;
    this.chiudiTela();
  }
}

/** le scelte di LIVE: restano da una volta all'altra */
interface Opzioni {
  zoomCursore: boolean;
  clicAnimati: boolean;
  mic: boolean;
  micId: string;
  /** microfono e audio del computer in due file (e due tracce), così dopo si livellano i volumi */
  separato: boolean;
  sistema: boolean;
  cam: boolean;
  camId: string;
  camAngolo: Angolo;
  camTonda: boolean;
  /** l'altezza che si chiede allo schermo: 720, 1080, 1440, 2160 */
  qualita: number;
  fps: number;
  cursore: boolean;
  conto: boolean;
  timeline: boolean;
  presentazione: boolean;
  sfondo: string;
  /** più finestre: la regia passa dall'una all'altra mentre registri */
  finestre: boolean;
  layout: Disposizione;
  /** volumi, bilanciamento e filtri dell'audio (src/core/liveAudio.ts) */
  audio: ImpostazioniAudio;
}
const OPZ0: Opzioni = {
  zoomCursore: false, clicAnimati: false,
  mic: true, micId: '', separato: true, sistema: true, cam: false, camId: '', camAngolo: 'bd', camTonda: true,
  qualita: 1080, fps: 30, cursore: true, conto: true, timeline: true, presentazione: false, sfondo: 'notte', finestre: false, layout: 'solo',
  audio: copiaImpostazioni(IMPOSTAZIONI0),
};
function leggiOpzioni(): Opzioni {
  try {
    const salvate = JSON.parse(localStorage.getItem('dpv-live') || '{}');
    // i filtri e il mixer non fanno più parte di LIVE (l'audio si lavora dopo, nel montaggio): le scelte vecchie non valgono più
    // «più finestre» non è più un interruttore: si sceglie aggiungendo finestre prima di registrare
    return { ...OPZ0, ...salvate, finestre: false, audio: copiaImpostazioni(IMPOSTAZIONI0) };
  } catch { return { ...OPZ0, audio: copiaImpostazioni(IMPOSTAZIONI0) }; }
}
const QUALITA: [number, string][] = [[720, '720p'], [1080, '1080p'], [1440, '1440p'], [2160, '4K']];
/** quanti bit al secondo per lo schermo: il testo piccolo vuole spazio, i 60 fps un po' di più */
const bitrate = (q: number, f: number) => Math.round((q <= 720 ? 5 : q <= 1080 ? 8 : q <= 1440 ? 14 : 26) * (f > 30 ? 1.5 : 1) * 1e6);

/** un registratore: parte subito, su copie delle tracce tutte sue (così uno non disturba l'altro); ferma(taglio)
 *  segna dove tagliare e lo spegne dopo la grazia. Le fette che MediaRecorder consegna vanno subito su un file
 *  temporaneo del disco (`Spool`), non in memoria: una registrazione lunga non riempie la RAM. Qualunque cosa
 *  succeda (errore del registratore, stop che non arriva) `fatto` finisce comunque e le tracce si chiudono. */
interface Nastro { fatto: Promise<Tratto>; ferma: (taglio: number) => void }
function nastro(flusso: MediaStream, tipo: string, vbps: number): Nastro {
  const tracce = flusso.getTracks().map((t) => risorseLive.traccia(t.clone()));
  const fermaTracce = () => { for (const t of tracce) risorseLive.ferma(t); };
  const opzioni: MediaRecorderOptions & { videoKeyFrameIntervalDuration?: number } = { mimeType: tipo || undefined, videoBitsPerSecond: vbps || undefined, audioBitsPerSecond: 192_000 };
  if (vbps) opzioni.videoKeyFrameIntervalDuration = 1000;
  let rec: MediaRecorder;
  try { rec = new MediaRecorder(new MediaStream(tracce), opzioni); }
  catch (e) { fermaTracce(); throw e; }
  const chiudiRec = risorseLive.apri('registratore');
  const tipoFile = rec.mimeType || tipo || 'video/webm';
  // il file temporaneo si apre mentre il registratore parte: le prime fette aspettano un attimo in coda
  const spool = Spool.apri(tipoFile.startsWith('audio') ? 'audio' : 'video', tipoFile);
  let taglio = Infinity, fermo = false, tardivi = 0, attesa = 0, finito = false, forza = 0;
  let consegna: (t: Tratto) => void = () => {};
  const fatto = new Promise<Tratto>((ok) => { consegna = ok; });
  const chiudi = () => {
    if (finito) return;
    finito = true;
    clearTimeout(attesa); clearTimeout(forza);
    fermaTracce();
    chiudiRec();
    void spool.then(async (s) => {
      const blob = await s.chiudi();
      if (s.perse) avviso('Il disco temporaneo ha smesso di rispondere durante la registrazione: potrebbe mancare la parte iniziale di un pezzo', 'errore', 9000);
      consegna({ blob, taglio, nota: `${s.fette} fette${s.perse ? ' (PERSE dal disco)' : s.su === 'memoria' ? ' (in memoria)' : ''}, ${tardivi} dopo lo stop`, libera: () => s.scarta() });
    });
  };
  // finito lo stop si aspetta ancora un attimo: qualche Chromium consegna gli ultimi dati dopo
  const aspetta = () => { clearTimeout(attesa); attesa = window.setTimeout(chiudi, 300); };
  rec.ondataavailable = (e) => {
    if (e.data.size) void spool.then((s) => s.aggiungi(e.data));
    if (fermo) { tardivi++; aspetta(); }
  };
  rec.onstop = () => { fermo = true; aspetta(); };
  // un errore del registratore non deve lasciare tutto aperto: si chiude con quello che c'è
  rec.onerror = () => { fermo = true; aspetta(); };
  try {
    rec.start(FETTA);
  } catch (e) {
    fermaTracce();
    chiudiRec();
    void spool.then((s) => s.scarta());
    throw e;
  }
  return {
    fatto,
    // il taglio è adesso, ma il registratore si ferma un po' dopo (così niente resta nel tubo)
    ferma: (t) => {
      taglio = t;
      window.setTimeout(() => {
        try { if (rec.state !== 'inactive') { rec.requestData(); rec.stop(); } } catch { /* già fermo */ }
        // l'ultima rete: se lo stop non arriva mai (flusso morto), dopo qualche secondo si chiude lo stesso
        clearTimeout(forza);
        forza = window.setTimeout(() => { fermo = true; chiudi(); }, 5000);
        if (rec.state === 'inactive') { fermo = true; aspetta(); }
      }, GRAZIA);
    },
  };
}

type Fase = 'fermo' | 'conto' | 'registra' | 'pausa';

export class Live {
  el: HTMLElement;
  opz: Opzioni = leggiOpzioni();
  private video: HTMLVideoElement;
  private camVideo: HTMLVideoElement;
  private contoEl: HTMLElement;
  private tempo: HTMLElement;
  private stato: HTMLElement;
  private info: HTMLElement;
  private bReg: HTMLButtonElement;
  private bPausa: HTMLButtonElement;
  private bFerma: HTMLButtonElement;
  private bSegna: HTMLButtonElement;
  private lista: HTMLElement;
  /** le spie delle fonti nella barra in alto */
  private spie: Partial<Record<'schermo' | 'webcam' | 'mic', HTMLElement>> = {};
  private etichetta: HTMLElement;
  private regTesto: HTMLElement;
  private titoloReg = '';
  /** solo in sviluppo: quante risorse tengo aperte */
  private badgeDev: HTMLElement | null;
  /** quello che l'anteprima deve mostrare (si stacca quando la pagina LIVE non si vede, per non far lavorare la scheda video) */
  private anteprima: MediaStream | null = null;
  private misuraReg: { larghezza?: number; altezza?: number; fps?: number } = {};
  /** lo spazio libero sul disco (byte), riletto ogni tanto mentre LIVE si vede */
  private spazio: number | null = null;
  private giroSpazio = 0;
  /** i livelli, il mixer e i filtri dell'audio (src/ui/liveAudio.ts) */
  private audio: PannelloAudio;
  private selMic: HTMLSelectElement;
  private selCam: HTMLSelectElement;
  /** il telecomando: anteprima, tempo, pausa, segno, ferma (src/ui/telecomando.ts) */
  private tele: Telecomando;
  /** chi rimette a posto interruttori e chip quando le scelte cambiano */
  private sinc: (() => void)[] = [];
  private flussi: MediaStream[] = [];
  /** quello che si registra (schermo + audio) e come */
  private flusso: MediaStream | null = null;
  private sceltaSchermo = new SceltaSchermoLive();
  private cursoreLive: CursoreLive | null = null;
  private scelteCursore = { zoom: false, clic: false };
  /** la webcam: la stessa per l'anteprima e per la registrazione */
  private cam: MediaStream | null = null;
  private camInCorso: Promise<MediaStream | null> | null = null;
  /** sale a ogni chiusura della webcam: un'apertura partita prima lo vede e si ritira */
  private genCam = 0;
  /** il microfono aperto solo per provarlo (i livelli e i filtri prima di partire) */
  private micProva: MediaStream | null = null;
  /** il microfono della registrazione in corso */
  private micReg: MediaStream | null = null;
  /** il mixer dell'audio: nasce con la prova o con REGISTRA e dura quanto la registrazione */
  private mixer: MixerLive | null = null;
  /** per i bip del conto alla rovescia */
  private bipCtx: AudioContext | null = null;
  private chiudiBip: () => void = () => {};
  /** la regia (solo se si registra con più finestre) e la fila delle miniature */
  private regia: Regia | null = null;
  private elFonti: HTMLElement;
  /** le finestre in più scelte PRIMA di registrare (mentre registri si può solo passare dall'una all'altra) */
  private prime: { s: MediaStream; nome: string }[] = [];
  private elPrime = h('div', { class: 'live-prime' });
  private bAggiungi: HTMLButtonElement;
  private bProssima: HTMLButtonElement;
  private aggiungendo = false;
  private giroFonti = 0;
  private chiudiGiroFonti: () => void = () => {};
  private tipo = '';
  private tipoCam = '';
  private tipoMic = '';
  private fase: Fase = 'fermo';
  private faseCerta = h('strong', { class: 'live-fase-certa', role: 'status', 'aria-live': 'polite' });
  private fontiStato = h('p', { class: 'live-fonti-stato' });
  /** il pezzo che si sta registrando adesso, e i tratti (uno per ogni pezzo fra le pause), dello schermo e della webcam */
  private pezzo: { chiudi: () => void } | null = null;
  private pezzi: Promise<Tratto>[] = [];
  /** la webcam si può accendere e spegnere anche mentre si registra: ogni stretto in cui resta accesa è un segmento (un file suo, che parte da `da` secondi di registrazione) */
  private segCam: { da: number; pezzi: Promise<Tratto>[] }[] = [];
  private segCamAperto: { da: number; pezzi: Promise<Tratto>[] } | null = null;
  /** il registratore della webcam nel pezzo di adesso, e quando è partito */
  private nastroCam: { n: Nastro; t0: number } | null = null;
  private bCam: HTMLButtonElement;
  /** il microfono registrato a parte (audio separato) */
  private pezziMic: Promise<Tratto>[] = [];
  private micSep: MediaStream | null = null;
  /** millisecondi registrati (senza le pause) e da quando si sta registrando adesso */
  private fatto = 0;
  private da = 0;
  private giro = 0;
  private chiudiGiro: () => void = () => {};
  /** i segni messi col tasto M, in secondi di registrazione */
  private segni: number[] = [];
  private annullaConto: (() => void) | null = null;
  private visibile = false;
  /** quanto è durata l'ultima registrazione, pause escluse (in millisecondi), e com'è andata la cucitura */
  durataUltima = 0;
  diagnosi: string[] = [];
  /** finisce quando la registrazione è stata messa nel contenitore (per le prove) */
  ultima: Promise<void> = Promise.resolve();

  constructor() {
    this.video = h('video', { class: 'live-video', muted: true, autoplay: true, playsinline: true }) as HTMLVideoElement;
    this.video.muted = true;
    this.camVideo = h('video', { class: 'live-cam', muted: true, autoplay: true, playsinline: true }) as HTMLVideoElement;
    this.camVideo.muted = true;
    this.contoEl = h('div', { class: 'live-conto' });
    this.tempo = h('div', { class: 'live-tempo' }, '00:00:00');
    this.stato = h('div', { class: 'live-stato' }, 'Pronto');
    this.info = h('div', { class: 'live-info' });
    this.regTesto = h('span', { class: 'live-reg-testo' }, 'REGISTRA');
    // un tasto solo per partire e per fermare (la spia rossa si accende solo mentre registri)
    this.bReg = h('button', { class: 'live-btn reg', title: 'Scegli cosa registrare e parti (R)', on: { click: () => { if (this.fase === 'fermo') void this.registra(); else this.ferma(); } } }, h('i', { class: 'live-punto' }), this.regTesto) as HTMLButtonElement;
    this.bPausa = h('button', { class: 'live-btn', disabled: true, title: 'Pausa e riprendi (Spazio o P)', on: { click: () => this.pausa() } }, '❚❚ PAUSA') as HTMLButtonElement;
    this.bFerma = h('button', { class: 'live-btn ferma', disabled: true, title: 'Ferma: finisce nel contenitore (F)', on: { click: () => this.ferma() } }, '■ FERMA') as HTMLButtonElement;
    this.bSegna = h('button', { class: 'live-btn segna', disabled: true, title: 'Un segno qui: nella timeline diventa un marcatore (M)', on: { click: () => this.segna() } }, icona('marcatore', 14), 'SEGNA') as HTMLButtonElement;
    this.bCam = h('button', { class: 'live-btn cam', title: 'Accendi o spegni la webcam, anche mentre registri (C)', on: { click: () => this.commutaCam() } }, icona('webcam', 15), 'WEBCAM') as HTMLButtonElement;
    const bTele = h('button', { class: 'live-btn tele', title: 'Il telecomando resta sopra le altre finestre mentre registri', on: { click: () => void this.apriTelecomando() } }, icona('telecomando', 15), 'TELECOMANDO');
    this.elFonti = h('div', { class: 'live-fonti' });
    this.bAggiungi = h('button', { class: 'live-btn', title: 'Aggiungi un\'altra finestra o schermo da registrare insieme (si sceglie prima di registrare)', on: { click: () => void this.aggiungiPrima() } }, '＋ Aggiungi una finestra') as HTMLButtonElement;
    this.bProssima = h('button', { class: 'live-btn', disabled: true, title: 'Passa alla finestra dopo (o i tasti 1-9)', on: { click: () => this.prossimaFinestra() } }, '⇄ CAMBIA') as HTMLButtonElement;
    this.lista = h('div', { class: 'live-lista' }, h('p', { class: 'nota' }, 'Le registrazioni di oggi compaiono qui (e nel contenitore, cartella Registrazioni).'));
    this.audio = new PannelloAudio({
      leggi: () => this.opz.audio,
      scrivi: (a, vincoli) => {
        this.opz.audio = a;
        this.salvaOpzioni();
        this.mixer?.imposta(a);
        if (vincoli) this.applicaVincoliMic();
      },
      mixer: () => this.mixer,
      prova: () => { if (!this.opz.mic && !this.micProva) avviso('Il microfono è spento: accendilo per provarlo', 'info'); else void this.provaMic(); },
      inProva: () => !!this.micProva,
      suLivelli: (pc, voce) => { if (this.tele.aperto) this.tele.livelli(pc, voce); },
    });

    // ——— le scelte ———
    const salva = () => this.salvaOpzioni();
    const fisse = new Set<keyof Opzioni>(['mic', 'sistema', 'separato', 'qualita', 'fps', 'cursore', 'micId', 'camId', 'finestre', 'zoomCursore', 'clicAnimati']);
    const cambia = <K extends keyof Opzioni>(k: K, v: Opzioni[K]) => {
      if (this.fase !== 'fermo' && fisse.has(k)) { avviso('Questo si cambia prima di registrare', 'info'); this.sinc.forEach((f) => f()); return false; }
      this.opz[k] = v;
      salva();
      this.sinc.forEach((f) => f());
      return true;
    };
    const interruttore = (k: 'mic' | 'sistema' | 'separato' | 'cam' | 'cursore' | 'conto' | 'timeline' | 'presentazione' | 'finestre' | 'zoomCursore' | 'clicAnimati', ic: string | null, testo: string, info: string, dopo?: () => void) => {
      const led = h('span', { class: 'led' });
      const b = h('button', { class: 'fin-interruttore', title: info, on: { click: () => { if (cambia(k, !this.opz[k])) dopo?.(); } } },
        led, ic ? icona(ic, 14) : null, h('span', { class: 'fin-int-testo' }, testo));
      this.sinc.push(() => { b.classList.toggle('acceso', this.opz[k]); led.classList.toggle('acceso', this.opz[k]); });
      return b;
    };
    const chips = <K extends 'qualita' | 'fps' | 'camAngolo' | 'camTonda' | 'sfondo' | 'layout'>(k: K, lista: [Opzioni[K], string, string?][], dopo?: () => void) => {
      const bb = lista.map(([v, testo, tit]) => {
        const b = h('button', { class: 'chip', title: tit ?? '', on: { click: () => { if (cambia(k, v)) dopo?.(); } } }, testo);
        this.sinc.push(() => b.classList.toggle('acceso', this.opz[k] === v));
        return b;
      });
      return h('div', { class: 'live-chips' }, bb);
    };
    this.selMic = h('select', { class: 'live-sel', title: 'Quale microfono', on: { change: () => { cambia('micId', this.selMic.value); if (this.micProva) { this.fermaProvaMic(); void this.provaMic(); } } } }, h('option', { value: '' }, 'Predefinito')) as HTMLSelectElement;
    this.selCam = h('select', { class: 'live-sel live-sel-cam', title: 'Quale webcam', on: { change: () => { if (cambia('camId', this.selCam.value) && this.opz.cam) { this.chiudiCam(); void this.apriCam(); } } } }, h('option', { value: '' }, 'Predefinita')) as HTMLSelectElement;
    const sfondi = h('div', { class: 'live-sfondi' }, SFONDI.map((x) => {
      const b = h('button', { class: 'live-sfondo', title: x.nome, style: `background: linear-gradient(135deg, ${x.a}, ${x.b})`, on: { click: () => cambia('sfondo', x.id) } });
      this.sinc.push(() => b.classList.toggle('acceso', this.opz.sfondo === x.id));
      return b;
    }));
    this.sinc.push(() => this.bCam.classList.toggle('acceso', this.opz.cam));
    this.sinc.push(() => {
      this.camVideo.dataset.angolo = this.opz.camAngolo;
      this.camVideo.classList.toggle('tonda', this.opz.camTonda);
      this.el?.classList.toggle('con-presentazione', this.opz.presentazione);
      sfondi.classList.toggle('via', !this.opz.presentazione);
      const sf = SFONDI.find((x) => x.id === this.opz.sfondo) ?? SFONDI[0];
      this.el?.style.setProperty('--live-sfondo', `linear-gradient(135deg, ${sf.a}, ${sf.b})`);
    });

    // ——— il telecomando ———
    this.tele = new Telecomando({ pausa: () => this.pausa(), segna: () => this.segna(), ferma: () => this.ferma(), prossima: () => this.prossimaFinestra(), tasto: (e) => this.tasto(e) });

    const vuoto = h('div', { class: 'live-vuoto' }, icona('schermo', 54), h('b', null, 'Premi REGISTRA'), h('span', null, 'scegli lo schermo, una finestra o una scheda: qui vedi quello che registri'));
    const sezione = (t: string) => h('h4', { class: 'live-sez' }, t);
    const griglia = (...figli: (HTMLElement | null)[]) => h('div', { class: 'live-griglia' }, ...figli);
    // le sorgenti nella barra in alto: una spia (verde pronta, rossa mentre registra, spenta se è esclusa), il nome e il
    // misuratore a LED (le righe si allineano come i canali di un banco)
    const sorgMic = this.audio.sorgente('voce'), sorgPc = this.audio.sorgente('computer');
    const misura = (barra: HTMLElement, chi: 'mic' | 'sistema') => {
      const m = h('span', { class: 'live-sorg-misura' }, barra);
      this.sinc.push(() => { m.classList.toggle('spenta', !this.opz[chi]); if (chi === 'mic' && !this.opz.mic && this.micProva) this.fermaProvaMic(); });
      return m;
    };
    const sorgente = (chi: 'schermo' | 'webcam' | 'mic', nome: string, titolo: string, ...resto: (HTMLElement | null)[]) => {
      const spia = h('i', { class: 'spia', 'data-stato': 'spenta' });
      this.spie[chi] = spia;
      return h('div', { class: 'live-sorg', 'data-chi': chi, title: titolo }, spia, h('span', { class: 'live-sorg-nome' }, nome), ...resto);
    };
    const sorgenti = h('div', { class: 'live-sorgenti', role: 'group', 'aria-label': 'Fonti' },
      sorgente('schermo', 'Schermo', 'Lo schermo (o la finestra) che registri, con l\'audio del computer', misura(sorgPc.barra, 'sistema'), sorgPc.stato),
      sorgente('webcam', 'Webcam', 'La webcam: si accende e si spegne anche mentre registri (tasto C)'),
      sorgente('mic', 'Microfono', 'La tua voce. ▶ prova il livello senza registrare', misura(sorgMic.barra, 'mic'), sorgMic.stato, this.audio.provaPiccola));
    this.bReg.title += '. ' + (puoRegistrare() ? 'Registra lo schermo con l\'audio del computer e il microfono; la pausa non lascia buchi' : 'Qui lo schermo non si può registrare');
    this.titoloReg = this.bReg.title;
    // «cosa registro»: righe da 44 px con la spia a destra (le stesse scelte di prima, in colonna stretta)
    const cosa = (k: 'cam' | 'mic' | 'sistema', testo: string, info: string, dopo?: () => void) => {
      const b = interruttore(k, null, testo, info, dopo);
      b.classList.add('live-cosa');
      return b;
    };
    const zoomEClic = (() => {
      const led = h('span', { class: 'led' });
      const b = h('button', { class: 'fin-interruttore live-cosa', title: 'Zoom morbido sulle zone dei clic e un cerchietto sui clic: dopo li ritocchi o li togli dalla clip nel montaggio. Serve uno schermo intero (nell\'app per Windows)',
        on: { click: () => { const nuovo = !(this.opz.zoomCursore && this.opz.clicAnimati); if (cambia('zoomCursore', nuovo)) cambia('clicAnimati', nuovo); } } },
        led, h('span', { class: 'fin-int-testo' }, 'Zoom e clic animati'));
      this.sinc.push(() => { const on = this.opz.zoomCursore && this.opz.clicAnimati; b.classList.toggle('acceso', on); led.classList.toggle('acceso', on); });
      return b;
    })();
    const angoli = chips('camAngolo', ANGOLI.map(([a, s]): [Angolo, string, string] => [a, s, 'La webcam in questo angolo']));
    angoli.classList.add('live-angoli');
    const forme = chips('camTonda', [[true, 'Bolla', 'Tonda'], [false, 'Riquadro', 'Un riquadro con gli angoli tondi']]);
    forme.classList.add('live-forme');
    this.etichetta = h('div', { class: 'live-etichetta' }, 'ANTEPRIMA');
    this.badgeDev = import.meta.env?.DEV ? h('div', { class: 'live-dev', title: 'Solo in sviluppo: le risorse che LIVE tiene aperte (flussi, tracce, registratori, audio…). Tutto deve tornare a zero quando non registri.' }) : null;
    this.el = h('section', { class: 'pannello live' },
      // la barra in alto: REC, tempo, fonti con le spie, misura e spazio
      h('header', { class: 'live-regia live-barra' },
        this.bReg,
        h('div', { class: 'live-display' }, this.tempo, this.faseCerta),
        this.stato,
        sorgenti,
        this.info,
        this.badgeDev,
        this.fontiStato),
      h('div', { class: 'live-dentro' },
        h('div', { class: 'live-schermo' }, h('div', { class: 'live-quadro' }, vuoto, this.video), this.camVideo, this.contoEl, this.etichetta),
        h('div', { class: 'live-comandi' },
          h('div', { class: 'live-azioni' }, this.bPausa, this.bFerma, this.bSegna, this.bCam, bTele),
          puoRegistrare() ? null : h('p', { class: 'nota live-guida' }, 'Qui non si può registrare lo schermo: su Android il sistema non lo permette alle app come questa. Usa la versione per Windows o Mac, o Chrome/Edge sul computer.'),
          this.elFonti,
          h('div', { class: 'live-blocco' },
            sezione('Cosa registro'),
            cosa('cam', 'Webcam nel riquadro', 'La tua faccia in un angolo: registrata a parte, va sulla traccia sopra. Si accende e si spegne anche mentre registri (tasto C)', () => { if (this.opz.cam) void this.accendiCam(); else this.spegniCam(); }),
            cosa('mic', 'Microfono', 'La tua voce mentre registri'),
            cosa('sistema', 'Audio del computer', 'Il suono di quello che registri (dove il sistema lo permette)'),
            zoomEClic),
          h('div', { class: 'live-blocco' },
            sezione('Webcam · posizione'),
            angoli,
            forme),
          h('section', { class: 'live-configurazione', 'aria-label': 'Altre opzioni' }, sezione('Altre opzioni'),
            sezione('Audio e dispositivi'),
            h('div', { class: 'live-dispositivi' },
              h('label', null, h('span', null, 'Microfono'), this.selMic),
              h('label', null, h('span', null, 'Webcam'), this.selCam)),
            sezione('Cursore e zoom'),
            griglia(
              interruttore('zoomCursore', null, 'Zoom che segue il cursore', 'Zoom morbido sulle zone dei clic: dopo lo cambi dalle tappe del movimento della clip'),
              interruttore('clicAnimati', null, 'Clic animati', 'Un cerchietto sui clic: dopo lo accorci o lo togli come un blocco effetto'),
              interruttore('cursore', null, 'Cursore visibile', 'Il puntatore del mouse nella registrazione (dove il sistema lo permette)')),
            this.sceltaSchermo.el,
            sezione('Qualità'),
            h('div', { class: 'live-riga live-qualita' },
              chips('qualita', QUALITA.map(([q, n]): [number, string] => [q, n])),
              chips('fps', [[30, '30 fps'], [60, '60 fps', 'Più fluido (giochi, animazioni): file più grandi']])),
            sezione('Registrazione'),
            griglia(
              interruttore('separato', null, 'Voce e computer separati', 'Se registri tutti e due, il microfono va in un file suo e su una traccia audio a parte: dopo puoi livellare i volumi di voce e computer uno per uno'),
              interruttore('conto', null, 'Conto alla rovescia 3-2-1', 'Tre secondi per sistemarti prima che parta'),
              interruttore('timeline', null, 'In fondo alla timeline', 'Quando fermi, la registrazione va anche in coda al montaggio'),
              interruttore('presentazione', null, 'Stile presentazione', 'Lo schermo un po\' più piccolo, angoli tondi e ombra, sopra uno sfondo sfumato (si cambia dopo nelle proprietà)')),
            sfondi,
            sezione('Più finestre'),
            h('div', { class: 'live-riga' },
              chips('layout', [['solo', 'Una sola', 'La finestra scelta a tutto quadro'], ['angolo', 'In angolo', 'La scelta grande e la prossima piccola in un angolo'], ['affiancate', 'Affiancate', 'Due finestre una accanto all\'altra']], () => this.applicaLayout()),
              this.bProssima),
            h('div', { class: 'live-riga' }, this.bAggiungi),
            this.elPrime),
          h('details', { class: 'live-archivio' }, h('summary', null, 'Registrazioni pronte'), this.lista),
          h('p', { class: 'live-nota-fine' }, 'Quando fermi, la registrazione va dritta sul banco di montaggio con zoom e clic già pronti da ritoccare.'),
          h('p', { class: 'live-tasti-nota' }, h('kbd', null, 'R'), ' registra ', h('kbd', null, 'Spazio'), ' pausa ', h('kbd', null, 'M'), ' segno ', h('kbd', null, 'C'), ' webcam ', h('kbd', null, 'F'), ' ferma'))));
    // le spie, la misura e la scritta sull'anteprima seguono le scelte
    this.sinc.push(() => {
      this.aggiornaSpie();
      this.aggiornaInfo();
      const z = this.opz.zoomCursore, c = this.opz.clicAnimati;
      this.etichetta.textContent = 'ANTEPRIMA' + (z && c ? ' · ZOOM E CLIC ATTIVI' : z ? ' · ZOOM SUI CLIC ATTIVO' : c ? ' · CLIC ANIMATI ATTIVI' : '');
    });
    this.video.addEventListener('loadedmetadata', () => vuoto.classList.add('via'));
    this.video.addEventListener('emptied', () => vuoto.classList.remove('via'));
    if (!puoRegistrare()) this.bReg.disabled = true;
    this.sinc.forEach((f) => f());
    this.aggiornaTempo();
    // i tasti di LIVE valgono sulla pagina LIVE e sul telecomando, prima di quelli del montaggio
    addEventListener('keydown', (e) => this.tasto(e), true);
    navigator.mediaDevices?.addEventListener?.('devicechange', () => void this.aggiornaDispositivi());
  }

  get registrando() { return this.fase !== 'fermo'; }

  /** la pagina LIVE si vede o no: fuori da LIVE webcam e microfono di prova si spengono */
  mostrata(si: boolean) {
    if (this.visibile === si) return;
    this.visibile = si;
    this.collegaAnteprima();
    if (si) {
      void this.aggiornaDispositivi();
      if (this.opz.cam && !this.cam) void this.apriCam();
      // lo spazio sul disco si rilegge mentre LIVE si vede; i file temporanei di registrazioni interrotte si tolgono una volta
      void this.aggiornaSpazio();
      clearInterval(this.giroSpazio);
      this.chiudiGiroSpazio();
      this.giroSpazio = window.setInterval(() => void this.aggiornaSpazio(), 20000);
      this.chiudiGiroSpazio = risorseLive.apri('intervallo');
      if (!this.puliziaFatta && this.fase === 'fermo') { this.puliziaFatta = true; void puliziaSpoolVecchi(); }
      this.aggiornaRisorse();
    } else {
      clearInterval(this.giroSpazio);
      this.giroSpazio = 0;
      this.chiudiGiroSpazio();
      if (this.fase === 'fermo') {
        this.chiudiCam();
        this.fermaProvaMic();
      }
    }
  }

  private puliziaFatta = false;
  private chiudiGiroSpazio: () => void = () => {};

  /** l'anteprima grande mostra il flusso solo quando la pagina LIVE si vede: nascosta, il video non decodifica e la scheda video non lavora per niente */
  private collegaAnteprima() {
    const voluto = this.visibile ? this.anteprima : null;
    if (this.video.srcObject === voluto) return;
    if (voluto) { this.video.srcObject = voluto; void this.video.play().catch(() => {}); } else liberaVideo(this.video);
  }

  private async aggiornaSpazio() {
    try { this.spazio = await spazioLibero(); } catch { this.spazio = null; }
    this.aggiornaInfo();
  }

  /** «2560×1440 · 60 fps · 212 GB»: la misura dichiarata dal browser mentre registri, quella chiesta prima */
  private aggiornaInfo() {
    const o = this.opz, m = this.misuraReg;
    const q = QUALITA.find(([v]) => v === o.qualita)?.[1] ?? `${o.qualita}p`;
    const misura = m.larghezza ? { larghezza: m.larghezza, altezza: m.altezza, fps: m.fps ?? o.fps } : { fps: o.fps };
    const testo = testoInfo({ ...misura, spazio: this.spazio });
    const t = (m.larghezza ? '' : q + ' · ') + testo;
    if (this.info.textContent !== t) this.info.textContent = t;
    const minuti = minutiRimasti(this.spazio, bitrate(o.qualita, o.fps) + 192_000);
    this.info.title = this.spazio == null ? 'Lo spazio libero non si sa'
      : `Spazio libero sul disco: ${testoGB(this.spazio)}${minuti != null ? ` · circa ${minuti > 120 ? Math.floor(minuti / 60) + ' ore' : minuti + ' minuti'} di registrazione a questa qualità` : ''}`;
  }

  /** solo in sviluppo: le risorse aperte, sotto gli occhi */
  private aggiornaRisorse() {
    if (!this.badgeDev) return;
    const t = 'risorse: ' + risorseLive.testo();
    if (this.badgeDev.textContent !== t) this.badgeDev.textContent = t;
  }

  private salvaOpzioni() {
    try { localStorage.setItem('dpv-live', JSON.stringify(this.opz)); } catch { /* niente */ }
  }

  private tasto(e: KeyboardEvent) {
    if (!this.visibile && !this.tele.aperto) return;
    const t = e.target as HTMLElement;
    // i cursori (volumi, filtri) non scrivono: dopo averne mosso uno R, Spazio e gli altri tasti di LIVE devono funzionare
    const scrive = t && t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type);
    if (t && (scrive || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('.velo') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    let preso = true;
    if (k === 'r' && this.fase === 'fermo') void this.registra();
    else if ((k === ' ' || k === 'p') && (this.fase === 'registra' || this.fase === 'pausa')) this.pausa();
    else if (k === 'm' && this.fase === 'registra') this.segna();
    else if (k === 'c') this.commutaCam();
    else if (/^[1-9]$/.test(k) && this.regia && this.fase !== 'fermo') this.passaA(Number(k) - 1);
    else if (k === 'n' && this.fase === 'fermo') void this.aggiungiPrima();
    else if (k === 'l' && this.regia && this.fase !== 'fermo') this.ciclaLayout();
    else if ((k === 'f' || k === 'escape') && this.fase !== 'fermo') this.ferma();
    else preso = false;
    if (preso) {
      e.preventDefault();
      e.stopPropagation();
      // lo Spazio su un tasto appena cliccato lo premerebbe un'altra volta
      if (t instanceof HTMLButtonElement) t.blur();
    }
  }

  private async aggiornaDispositivi() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      const riempi = (sel: HTMLSelectElement, kind: MediaDeviceKind, scelto: string, nome: string, primo: string) => {
        const lista = d.filter((x) => x.kind === kind && x.deviceId && x.deviceId !== 'default' && x.deviceId !== 'communications');
        sel.replaceChildren(h('option', { value: '' }, primo), ...lista.map((x, i) => h('option', { value: x.deviceId }, x.label || `${nome} ${i + 1}`)));
        sel.value = lista.some((x) => x.deviceId === scelto) ? scelto : '';
      };
      riempi(this.selMic, 'audioinput', this.opz.micId, 'Microfono', 'Predefinito');
      riempi(this.selCam, 'videoinput', this.opz.camId, 'Webcam', 'Predefinita');
    } catch { /* niente elenco: resta il predefinito */ }
  }

  // ——— webcam e microfono ———
  /** la webcam vera: prima con la scelta fatta (HD), poi senza la scelta (un'altra webcam o l'indirizzo cambiato, per esempio dopo aver cambiato scheda o con OBS), poi con le richieste più semplici */
  private async apriWebcamVera(): Promise<MediaStream> {
    const id = this.opz.camId;
    const prove: MediaStreamConstraints[] = [
      ...(id ? [{ video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }] : []),
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } },
      { video: true },
    ];
    let ultimo: unknown = null;
    for (const [i, c] of prove.entries()) {
      try {
        const s = risorseLive.flusso(await navigator.mediaDevices.getUserMedia(c));
        // la webcam di prima non c'è più: si dimentica
        if (id && i > 0) { this.opz.camId = ''; this.salvaOpzioni(); }
        return s;
      } catch (e) {
        ultimo = e;
        // un permesso negato non cambia riprovando
        if (e instanceof DOMException && e.name === 'NotAllowedError') break;
      }
    }
    throw ultimo;
  }

  /** l'errore della webcam in parole: cosa è successo e cosa fare, più il nome tecnico (per chi ti aiuta) */
  private frasiWebcam(e: unknown): string {
    const nome = e instanceof DOMException ? e.name : e instanceof Error ? e.name : '';
    const msg = e instanceof Error ? e.message : String(e ?? '');
    const frase = nome === 'NotAllowedError' ? 'il permesso per la webcam è negato (Windows: Impostazioni → Privacy → Fotocamera, e consenti anche alle app desktop)'
      : nome === 'NotFoundError' || nome === 'OverconstrainedError' ? 'non trovo nessuna webcam (scollegata, o spenta da Windows)'
      : nome === 'NotReadableError' || nome === 'AbortError' || /could not start|in use|occupat/i.test(msg) ? 'la webcam è usata da un altro programma (OBS, Teams, Zoom, il browser…) o non riesce ad avviarsi: chiudi gli altri programmi che la usano e riprova'
      : 'la webcam non parte';
    return `${frase} [${nome || 'errore'}${msg ? ': ' + msg.slice(0, 90) : ''}]`;
  }

  /** la webcam si apre una volta sola per volta: due richieste di fila (la pagina che si apre e REGISTRA, o la scelta di
   *  un'altra webcam) aspettano la stessa apertura. Prima la seconda apriva un secondo flusso e il primo restava acceso, perso. */
  private apriCam(): Promise<MediaStream | null> {
    if (this.cam) return Promise.resolve(this.cam);
    return this.camInCorso ??= this.apriCamDavvero().finally(() => { this.camInCorso = null; });
  }

  private async apriCamDavvero(): Promise<MediaStream | null> {
    const gen = this.genCam;
    try {
      const s = risorseLive.flusso(webcamProva ? await webcamProva() : await this.apriWebcamVera());
      // nel frattempo l'hanno spenta, o chiusa e riaperta: questo flusso non serve più e non deve restare acceso
      if (!this.opz.cam || gen !== this.genCam || this.cam) { risorseLive.fermaTutte(s); return gen === this.genCam ? this.cam : null; }
      this.cam = s;
      this.camVideo.srcObject = s;
      void this.camVideo.play().catch(() => {});
      this.el.classList.add('con-cam');
      void this.aggiornaDispositivi();
      // arrivano immagini? Una webcam "aperta" che non manda niente (driver, scheda video, programma che la blocca) si dice subito
      if (!webcamProva) void this.controllaImmaginiCam(s);
      return s;
    } catch (e) {
      if (gen !== this.genCam) return null;
      avviso('La webcam non si apre: ' + this.frasiWebcam(e), 'errore', 11000);
      this.opz.cam = false;
      this.sinc.forEach((f) => f());
      return null;
    }
  }

  /** dopo qualche secondo: la webcam aperta ha mandato almeno un'immagine? */
  private async controllaImmaginiCam(s: MediaStream) {
    for (let i = 0; i < 40; i++) {
      if (this.cam !== s) return;
      if (this.camVideo.videoWidth > 0 && this.camVideo.readyState >= 2) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (this.cam !== s) return;
    const t = s.getVideoTracks()[0];
    avviso(`La webcam è aperta ma non manda immagini${t?.label ? ` (${t.label})` : ''}: prova un'altra webcam dal menu accanto, o chiudi gli altri programmi che la usano (OBS, Teams…)`, 'errore', 11000);
  }

  private chiudiCam() {
    // chi stava ancora aprendo la webcam trova la generazione cambiata e butta il suo flusso
    this.genCam++;
    this.camInCorso = null;
    risorseLive.fermaTutte(this.cam);
    this.cam = null;
    liberaVideo(this.camVideo);
    this.el.classList.remove('con-cam');
  }

  private async apriMic(): Promise<MediaStream> {
    if (microfonoProva) return risorseLive.flusso(await microfonoProva());
    const f = this.opz.audio.filtri;
    // i filtri del browser (toglie i disturbi con il suo modello AI, eco, volume automatico) sono scelte tue
    return risorseLive.flusso(await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: this.opz.micId ? { exact: this.opz.micId } : undefined, echoCancellation: f.eco, noiseSuppression: f.disturbi, autoGainControl: f.livellaAuto },
    }));
  }

  /** i filtri del browser cambiati mentre il microfono è già aperto: si riapplicano alla traccia viva (senza richiuderla) */
  private applicaVincoliMic() {
    const f = this.opz.audio.filtri;
    const flussi = [this.micProva, this.micReg].filter((x): x is MediaStream => !!x);
    for (const fl of flussi) {
      for (const t of fl.getAudioTracks()) {
        void t.applyConstraints?.({ echoCancellation: f.eco, noiseSuppression: f.disturbi, autoGainControl: f.livellaAuto }).catch(() => { /* quella traccia non lo sa fare: vale dalla prossima apertura */ });
      }
    }
  }

  /** "Prova l'audio": il microfono si accende solo per vedere i livelli e sentire i filtri, senza registrare */
  private async provaMic() {
    if (this.fase !== 'fermo') return;
    // un secondo clic (anche mentre il microfono si sta ancora aprendo) ferma la prova
    if (this.micProva || this.mixer) { this.fermaProvaMic(); return; }
    const mix = this.mixer = new MixerLive();
    this.audio.sveglia();
    // il contesto audio nasce nel clic (il browser lo vuole), il resto si prepara mentre si apre il microfono
    void mix.accendi(this.opz.audio, true);
    try {
      const mic = await this.apriMic();
      await mix.pronto;
      if (this.mixer !== mix || this.fase !== 'fermo') { risorseLive.fermaTutte(mic); mix.chiudi(); return; }
      if (!mix.ok) { risorseLive.fermaTutte(mic); throw new Error('niente audio'); }
      this.micProva = mic;
      mix.collegaVoce(mic);
      this.audio.aggiorna();
      void this.aggiornaDispositivi();
    } catch {
      if (this.mixer === mix) { mix.chiudi(); this.mixer = null; }
      this.audio.aggiorna();
      avviso('Il microfono non si apre', 'info');
    }
  }

  private fermaProvaMic() {
    if (!this.micProva && !this.mixer) return;
    risorseLive.fermaTutte(this.micProva);
    this.micProva = null;
    // il mixer di una registrazione in corso non si tocca
    if (this.fase === 'fermo') { this.mixer?.chiudi(); this.mixer = null; }
    this.audio.aggiorna();
  }

  private aggiornaTempo() {
    const ms = this.fatto + (this.fase === 'registra' ? performance.now() - this.da : 0);
    this.tempo.textContent = orologio(ms);
    const descrizioni: Record<Fase, string> = { fermo: 'NON STAI REGISTRANDO', conto: 'PARTENZA · FERMA ANNULLA IL CONTO', registra: 'REGISTRAZIONE IN CORSO', pausa: 'IN PAUSA · RIPRENDI CONTINUA LO STESSO FILE' };
    this.faseCerta.textContent = descrizioni[this.fase];
    this.faseCerta.dataset.fase = this.fase;
    const viva = (s: MediaStream | null, tipo: 'audio' | 'video') => s?.getTracks().some((t) => t.kind === tipo && t.readyState === 'live' && t.enabled);
    this.fontiStato.textContent = `Schermo: ${viva(this.flusso, 'video') ? 'collegato' : 'da scegliere'} · Microfono: ${viva(this.micReg ?? this.micProva, 'audio') ? 'collegato' : this.opz.mic ? 'non collegato' : 'escluso'} · Webcam: ${viva(this.cam, 'video') ? 'collegata' : 'non collegata'}`;
    this.aggiornaSpie();
    this.aggiornaRisorse();
    this.tele.aggiorna(this.statoTele(orologio(ms)));
  }

  /** le spie delle fonti: verde = pronta, rossa = sta registrando, spenta = esclusa */
  private aggiornaSpie() {
    const reg = this.fase === 'registra';
    const metti = (chi: 'schermo' | 'webcam' | 'mic', stato: 'spenta' | 'pronta' | 'rec') => {
      const el = this.spie[chi];
      if (el && el.dataset.stato !== stato) el.dataset.stato = stato;
    };
    metti('schermo', !puoRegistrare() ? 'spenta' : reg ? 'rec' : 'pronta');
    metti('webcam', !this.opz.cam ? 'spenta' : reg && this.nastroCam ? 'rec' : 'pronta');
    metti('mic', !this.opz.mic ? 'spenta' : reg ? 'rec' : 'pronta');
  }

  /** come sta la registrazione, per il telecomando */
  private statoTele(tempo: string): StatoTelecomando {
    return { fase: this.fase, tempo, segni: this.segni.length, schermo: this.anteprima, cam: this.cam, finestre: this.regia?.fonti.length ?? 1 };
  }

  /** i tasti e le spie secondo la fase */
  private aggiornaTasti() {
    const f = this.fase;
    // lo stesso tasto parte e ferma: spento solo se qui non si può registrare
    this.bReg.disabled = f === 'fermo' && !puoRegistrare();
    this.regTesto.textContent = f === 'fermo' ? 'REGISTRA' : f === 'conto' ? 'ANNULLA' : 'FERMA';
    this.bReg.title = f === 'fermo' ? this.titoloReg : 'Ferma e metti la registrazione nel montaggio (F)';
    this.bPausa.disabled = f !== 'registra' && f !== 'pausa';
    this.bFerma.disabled = f === 'fermo';
    this.bSegna.disabled = f !== 'registra';
    this.bAggiungi.disabled = f !== 'fermo';
    this.bProssima.disabled = !this.regia || f === 'fermo' || this.regia.fonti.length < 2;
    this.bPausa.textContent = f === 'pausa' ? '▶ RIPRENDI' : '❚❚ PAUSA';
    this.bFerma.textContent = f === 'conto' ? 'Annulla partenza' : '■ Ferma e salva';
    this.el.classList.toggle('in-onda', f === 'registra' || f === 'pausa');
    this.el.classList.toggle('in-pausa', f === 'pausa');
    this.aggiornaTempo();
  }

  /** il 3-2-1 sopra l'anteprima, con un bip per numero; FERMA o Esc lo annullano */
  private conto(): Promise<boolean> {
    return new Promise((ok) => {
      let n = 3, timer = 0;
      const bip = () => {
        try {
          if (!this.bipCtx) { this.bipCtx = new AudioContext(); this.chiudiBip = risorseLive.apri('audio'); }
          const ctx = this.bipCtx;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.16, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
          o.connect(g).connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 0.18);
        } catch { /* muto */ }
      };
      const fine = (si: boolean) => {
        clearTimeout(timer); this.annullaConto = null; this.contoEl.classList.remove('su', 'batti');
        // il contesto dei bip non resta aperto fino alla prossima volta: si chiude (dopo l'ultimo bip, se serve)
        const ctx = this.bipCtx, chiudi = this.chiudiBip;
        this.bipCtx = null; this.chiudiBip = () => {};
        if (ctx) window.setTimeout(() => { void ctx.close().catch(() => {}); chiudi(); }, 300);
        ok(si);
      };
      const passo = () => {
        if (n === 0) { fine(true); return; }
        this.contoEl.textContent = String(n);
        this.contoEl.classList.remove('batti');
        void this.contoEl.offsetWidth;
        this.contoEl.classList.add('batti');
        this.tele.aggiorna(this.statoTele(`… ${n}`));
        bip();
        n--;
        timer = window.setTimeout(passo, 1000);
      };
      this.annullaConto = () => fine(false);
      this.contoEl.classList.add('su');
      passo();
    });
  }

  /** un pezzo nuovo: lo schermo (con l'audio) e la webcam partono insieme e si fermano allo stesso taglio */
  private nuovoPezzo() {
    const t0 = performance.now();
    const n = nastro(this.flusso!, this.tipo, bitrate(this.opz.qualita, this.opz.fps));
    this.cursoreLive?.pezzo(t0);
    this.pezzi.push(n.fatto);
    // la webcam parte con lo schermo solo se è accesa; dopo una pausa riprende nel suo segmento
    if (this.cam && this.opz.cam) this.avviaNastroCam(this.fase === 'pausa' ? this.fatto / 1000 : 0);
    let mc: Nastro | null = null;
    if (this.micSep) {
      try {
        mc = nastro(this.micSep, this.tipoMic, 0);
        this.pezziMic.push(mc.fatto);
      } catch { /* il microfono a parte no: resta muto, lo schermo va lo stesso */ }
    }
    this.pezzo = { chiudi: () => { const adesso = performance.now(); const t = (adesso - t0) / 1000; this.cursoreLive?.pausa(adesso); n.ferma(t); this.fermaNastroCam(); mc?.ferma(t); } };
  }

  /** la webcam registra da adesso (`da` = a che punto della registrazione, in secondi): un segmento nuovo, o quello aperto */
  private avviaNastroCam(da: number) {
    if (!this.cam || this.nastroCam) return;
    try {
      const n = nastro(this.cam, this.tipoCam, 4_000_000);
      if (!this.segCamAperto) { this.segCamAperto = { da, pezzi: [] }; this.segCam.push(this.segCamAperto); }
      this.segCamAperto.pezzi.push(n.fatto);
      this.nastroCam = { n, t0: performance.now() };
    } catch { /* la webcam no, lo schermo sì */ }
  }

  /** la webcam smette di registrare questo pezzo; con `chiudiSegmento` (l'hai spenta) il prossimo pezzo apre un segmento nuovo */
  private fermaNastroCam(chiudiSegmento = false) {
    const x = this.nastroCam;
    this.nastroCam = null;
    x?.n.ferma((performance.now() - x.t0) / 1000);
    if (chiudiSegmento) this.segCamAperto = null;
  }

  /** quanti secondi di registrazione (senza le pause) ci sono adesso */
  private secondiRegistrati() { return (this.fatto + (this.fase === 'registra' ? performance.now() - this.da : 0)) / 1000; }

  /** webcam accesa: si apre, e se si sta già registrando comincia a registrare da qui */
  private async accendiCam() {
    const s = await this.apriCam();
    if (!s) return;
    if (this.fase === 'registra') this.avviaNastroCam(this.secondiRegistrati());
    if (this.fase !== 'fermo') this.stato.textContent = '● Webcam accesa';
    this.aggiornaTempo();
  }

  /** webcam spenta: finisce il suo segmento (nel montaggio resta un buco) e la luce si spegne */
  private spegniCam() {
    this.fermaNastroCam(true);
    this.chiudiCam();
    if (this.fase !== 'fermo') this.stato.textContent = '● Webcam spenta';
    this.aggiornaTempo();
  }

  /** i tasti e il tasto C accendono o spengono la webcam, anche mentre si registra */
  private commutaCam() {
    this.opz.cam = !this.opz.cam;
    this.salvaOpzioni();
    this.sinc.forEach((f) => f());
    if (this.opz.cam) void this.accendiCam(); else this.spegniCam();
  }

  async registra() {
    // bReg spento = la scelta dello schermo è già aperta (niente due finestre col doppio clic)
    if (this.fase !== 'fermo' || this.bReg.disabled) return;
    if (!puoRegistrare()) { avviso('Qui non si può registrare lo schermo', 'info'); return; }
    // qualunque cosa vada storta mentre si prepara (un errore del browser, un dispositivo che sparisce), tutto quello
    // che si era aperto si chiude: niente flussi, mixer o registratori rimasti accesi
    try { await this.avviaRegistrazione(); } catch (e) { this.registrazioneFallita(e); }
  }

  private registrazioneFallita(e: unknown) {
    this.annullaConto?.();
    this.fermaGiro();
    this.pezzo?.chiudi();
    this.pezzo = null;
    this.fase = 'fermo';
    void this.cursoreLive?.ferma().catch(() => {});
    this.cursoreLive = null;
    this.chiudiFlussi();
    // i registratori già partiti finiscono da soli: i loro file temporanei si tolgono appena sono chiusi
    const orfani = [...this.pezzi, ...this.segCam.flatMap((g) => g.pezzi), ...this.pezziMic];
    void Promise.allSettled(orfani).then((rs) => { for (const r of rs) if (r.status === 'fulfilled') void r.value.libera?.(); });
    this.pezzi = []; this.segCam = []; this.segCamAperto = null; this.nastroCam = null; this.pezziMic = []; this.micSep = null;
    this.aggiornaTasti();
    this.stato.textContent = 'Non riesco a registrare';
    this.misuraReg = {};
    this.aggiornaInfo();
    avviso('Non riesco a registrare: ' + String(e instanceof Error ? e.message : e), 'errore', 5000);
  }

  /** il giro che aggiorna il tempo: si ferma sempre una volta sola */
  private fermaGiro() { clearInterval(this.giro); this.giro = 0; this.chiudiGiro(); this.chiudiGiro = () => {}; }

  private async avviaRegistrazione() {
    this.bReg.disabled = true;
    motore.stop();
    this.fermaProvaMic();
    const o = this.opz;
    // il mixer dell'audio si accende adesso, col clic: dopo la scelta dello schermo il browser lo terrebbe spento
    // (e l'audio del computer mescolato al microfono usciva muto o a singhiozzo). Voce e computer passano da lui:
    // volumi, filtri e limitatore finiscono nella registrazione
    this.mixer?.chiudi();
    const mix = this.mixer = new MixerLive();
    void mix.accendi(o.audio);
    this.audio.sveglia();
    let schermo: MediaStream;
    try {
      schermo = risorseLive.flusso(sorgenteProva ? await sorgenteProva(o.sistema) : await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: o.fps }, height: { ideal: o.qualita }, width: { ideal: Math.round(o.qualita * 16 / 9) },
          ...({ cursor: o.cursore ? 'always' : 'never' } as object),
        },
        // l'audio del computer così com'è: niente cancellazione dell'eco, niente filtri anti-rumore, niente volume
        // automatico (sono fatti per la voce e rovinano musica e suoni), in stereo
        audio: o.sistema ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000, ...({ suppressLocalAudioPlayback: false } as object) } as MediaTrackConstraints : false,
        // Chrome: niente "questa scheda" in cima, l'audio del sistema (anche registrando una finestra sola)
        ...({ selfBrowserSurface: 'exclude', systemAudio: 'include', windowAudio: 'system', surfaceSwitching: o.zoomCursore || o.clicAnimati ? 'exclude' : 'include' } as object),
      } as DisplayMediaStreamOptions));
    } catch {
      mix.chiudi();
      if (this.mixer === mix) this.mixer = null;
      this.stato.textContent = 'Registrazione annullata';
      this.aggiornaTasti();
      return;
    }
    this.flussi = [schermo];
    let tracce: MediaStreamTrack[];
    const st0 = schermo.getVideoTracks()[0]?.getSettings?.() ?? {};
    if (o.finestre || this.prime.length) {
      // più finestre: la misura è quella della prima, ridotta alla qualità scelta; la regia disegna quella in onda
      let w = st0.width || Math.round(o.qualita * 16 / 9), hh = st0.height || o.qualita;
      const kk = Math.min(1, o.qualita / hh);
      w = Math.max(2, Math.round((w * kk) / 2) * 2); hh = Math.max(2, Math.round((hh * kk) / 2) * 2);
      const r = new Regia(w, hh, o.fps);
      r.layout = o.layout;
      r.fonti.push(this.nuovaFonte(schermo, 1));
      for (const p of this.prime.splice(0)) {
        this.flussi.push(p.s);
        const f = this.nuovaFonte(p.s, r.fonti.length + 1);
        r.fonti.push(f);
        p.s.getVideoTracks()[0]?.addEventListener('ended', () => this.togliFinestra(f));
      }
      this.disegnaPrime();
      this.regia = r;
      tracce = [r.track];
      clearInterval(this.giroFonti); this.chiudiGiroFonti();
      this.giroFonti = window.setInterval(() => this.aggiornaMiniature(), 400);
      this.chiudiGiroFonti = risorseLive.apri('intervallo');
      this.disegnaFonti();
    } else tracce = [...schermo.getVideoTracks()];
    // l'audio: il microfono e quello del computer passano dal mixer (livelli, volumi, filtri); a seconda delle scelte
    // escono in una traccia mescolata, oppure in due file (la voce a parte) o in uno solo se c'è una sola sorgente
    const audioPc = schermo.getAudioTracks();
    let mic: MediaStream | null = null;
    this.micReg = null;
    if (o.mic) {
      try {
        mic = await this.apriMic();
        this.flussi.push(mic);
        this.micReg = mic;
      } catch { avviso('Il microfono non si apre: registro senza', 'info', 2400); }
    }
    await mix.pronto;
    this.micSep = null;
    const haPc = audioPc.length > 0;
    if (mix.ok) {
      mix.imposta(o.audio);
      if (haPc) mix.collegaComputer(new MediaStream(audioPc));
      if (mic) mix.collegaVoce(mic);
      if (o.separato && haPc && mic) {
        tracce.push(...mix.flussoComputer().getAudioTracks());
        this.micSep = mix.flussoVoce();
      } else if (haPc && mic) tracce.push(...mix.flussoMix().getAudioTracks());
      else if (haPc) tracce.push(...mix.flussoComputer().getAudioTracks());
      else if (mic) tracce.push(...mix.flussoVoce().getAudioTracks());
    } else {
      // niente audio elaborato (il browser non ha il mixer): si registra com'è, la voce a parte
      tracce.push(...audioPc);
      if (mic) {
        if (haPc) this.micSep = new MediaStream(mic.getAudioTracks());
        else tracce.push(...mic.getAudioTracks());
      }
    }
    if (o.cam && !this.cam) await this.apriCam();
    this.flusso = new MediaStream(tracce);
    this.tipo = formato();
    this.tipoCam = formato(true);
    this.tipoMic = formatoAudio();
    this.anteprima = this.regia ? this.regia.flusso : schermo;
    this.collegaAnteprima();
    const st = st0;
    this.misuraReg = { larghezza: st.width, altezza: st.height, fps: st.frameRate };
    this.aggiornaInfo();
    this.info.title += ` · si registra: ${['schermo', mic ? 'microfono' : '', haPc ? 'audio del computer' : '', this.cam ? 'webcam' : ''].filter(Boolean).join(', ')}`;
    void this.aggiornaSpazio();
    // se si ferma la condivisione dalla barra del sistema, è come premere FERMA
    const f0 = this.regia?.fonti[0];
    schermo.getVideoTracks()[0]?.addEventListener('ended', () => (f0 ? this.togliFinestra(f0) : this.ferma()));
    if (o.conto) {
      this.fase = 'conto';
      this.aggiornaTasti();
      this.stato.textContent = 'Si parte fra…';
      if (!(await this.conto())) {
        this.fase = 'fermo';
        this.chiudiFlussi();
        this.aggiornaTasti();
        this.stato.textContent = 'Partenza annullata';
        this.misuraReg = {};
        this.aggiornaInfo();
        return;
      }
    }
    // con più finestre: si parte solo quando la prima ha già un'immagine, se no i primi fotogrammi escono neri
    if (this.regia) {
      const v = this.regia.fonti[0]?.video;
      for (let i = 0; v && i < 60 && !(v.videoWidth && v.readyState >= 2); i++) await new Promise((r) => setTimeout(r, 50));
      this.regia.disegna();
    }
    this.pezzi = [];
    this.segCam = [];
    this.segCamAperto = null;
    this.nastroCam = null;
    this.pezziMic = [];
    this.segni = [];
    this.scelteCursore = { zoom: o.zoomCursore, clic: o.clicAnimati };
    if (o.zoomCursore || o.clicAnimati) {
      const monitor = this.sceltaSchermo.scelto;
      const rapporto = st0.width && st0.height && monitor ? Math.abs(st0.width / st0.height - monitor.width / monitor.height) : Infinity;
      if (!this.regia && st0.displaySurface === 'monitor' && monitor && rapporto < 0.02) {
        try { this.cursoreLive = await CursoreLive.avvia(monitor); }
        catch (e) { avviso('Registro senza dati del cursore: ' + String(e), 'info', 5000); }
      } else avviso('Registro senza dati del cursore: serve uno schermo intero, scelto anche nelle Altre opzioni di LIVE', 'info', 6000);
    }
    try {
      this.nuovoPezzo();
    } catch (e) {
      this.fase = 'fermo';
      void this.cursoreLive?.ferma().catch(() => {});
      this.cursoreLive = null;
      this.chiudiFlussi();
      this.aggiornaTasti();
      avviso('Non riesco a registrare: ' + String(e), 'errore', 4000);
      return;
    }
    this.fase = 'registra';
    this.fatto = 0;
    this.da = performance.now();
    this.aggiornaTasti();
    this.stato.textContent = '● Sto registrando';
    this.fermaGiro();
    this.giro = window.setInterval(() => this.aggiornaTempo(), 250);
    this.chiudiGiro = risorseLive.apri('intervallo');
    if (!sorgenteProva) window.setTimeout(() => this.controllaImmagine(), 3000);
    avviso('● Registro: PAUSA quando vuoi, M per un segno, FERMA e finisce nel contenitore', 'ok', 2400);
  }

  /** dopo qualche secondo guarda se quello che arriva dallo schermo è un'immagine vera: tutta bianca o tutta nera vuol dire che la cattura non funziona */
  private controllaImmagine() {
    // con LIVE nascosto l'anteprima è staccata (niente decodifica): non c'è un'immagine da guardare e non è un errore
    if (this.fase === 'fermo' || !this.visibile) return;
    const v = this.video;
    if (!v.videoWidth) { avviso('Dallo schermo non arriva nessuna immagine: ferma e riprova, scegliendo una finestra o lo schermo', 'errore', 8000); return; }
    try {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 18;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(v, 0, 0, 32, 18);
      const d = x.getImageData(0, 0, 32, 18).data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < min) min = l; if (l > max) max = l; }
      c.width = 0; c.height = 0;
      if (min > 250) avviso('Lo schermo che registri risulta tutto bianco. Può succedere con due schede video (quella del monitor e quella del programma sono diverse): prova a registrare una sola finestra, oppure in Windows → Impostazioni → Sistema → Schermo → Grafica scegli per DaProd Video la scheda a cui è collegato il monitor.', 'errore', 14000);
      else if (max < 3) avviso('Lo schermo che registri risulta tutto nero: prova a registrare una sola finestra invece dello schermo intero.', 'errore', 9000);
    } catch { /* non si può guardare: pazienza */ }
  }

  pausa() {
    if (this.fase === 'registra') {
      // la pausa chiude il pezzo: nel file finale la pausa non c'è proprio
      this.pezzo?.chiudi();
      this.pezzo = null;
      this.fase = 'pausa';
      this.fatto += performance.now() - this.da;
      this.stato.textContent = '❚❚ In pausa';
    } else if (this.fase === 'pausa') {
      try {
        this.nuovoPezzo();
      } catch (e) {
        avviso('Non riesco a riprendere: ' + String(e), 'errore', 4000);
        this.ferma();
        return;
      }
      this.fase = 'registra';
      this.da = performance.now();
      this.stato.textContent = '● Sto registrando';
    }
    this.aggiornaTasti();
    this.aggiornaTempo();
  }

  /** un segno adesso: quando la registrazione va in timeline diventa un marcatore rosso */
  segna() {
    if (this.fase !== 'registra') return;
    const t = (this.fatto + performance.now() - this.da) / 1000;
    this.segni.push(t);
    this.stato.textContent = `● Segno ${this.segni.length} a ${orologio(t * 1000)}`;
    this.aggiornaTempo();
    this.el.classList.remove('lampo');
    void this.el.offsetWidth;
    this.el.classList.add('lampo');
  }

  /** spegne schermo, microfono e mixer (quelli di adesso, o quelli di una registrazione appena fermata) */
  private chiudiFlussi(flussi = this.flussi, mix = this.mixer) {
    for (const f of flussi) risorseLive.fermaTutte(f);
    mix?.chiudi();
    if (flussi !== this.flussi) return;
    this.chiudiRegia();
    this.flussi = [];
    this.micReg = null;
    if (this.mixer === mix) this.mixer = null;
    this.audio.aggiorna();
    this.flusso = null;
    this.anteprima = null;
    liberaVideo(this.video);
  }

  /** la miniatura della registrazione: lo schermo, e la webcam nel suo angolo */
  private foto(): string {
    try {
      const c = document.createElement('canvas');
      c.width = 192; c.height = 108;
      const x = c.getContext('2d')!;
      x.fillStyle = '#000';
      x.fillRect(0, 0, 192, 108);
      // con LIVE nascosto l'anteprima è staccata: si prende l'immagine dalla regia, se c'è
      const v = this.video.videoWidth ? this.video : this.regia?.fonti[0]?.video ?? this.video;
      if (v.videoWidth) {
        const k = Math.min(192 / v.videoWidth, 108 / v.videoHeight);
        const w = v.videoWidth * k, hh = v.videoHeight * k;
        x.drawImage(v, (192 - w) / 2, (108 - hh) / 2, w, hh);
      }
      const cv = this.camVideo;
      if (this.cam && cv.videoWidth) {
        const d = 34, lato = Math.min(cv.videoWidth, cv.videoHeight);
        const dx = this.opz.camAngolo.endsWith('d') ? 192 - d - 5 : 5, dy = this.opz.camAngolo.startsWith('b') ? 108 - d - 5 : 5;
        x.save();
        x.beginPath();
        x.arc(dx + d / 2, dy + d / 2, d / 2, 0, Math.PI * 2);
        x.clip();
        x.drawImage(cv, (cv.videoWidth - lato) / 2, (cv.videoHeight - lato) / 2, lato, lato, dx, dy, d, d);
        x.restore();
      }
      const url = c.toDataURL('image/jpeg', 0.72);
      c.width = 0; c.height = 0;
      return url;
    } catch {
      return '';
    }
  }

  ferma() {
    if (this.fase === 'conto') { this.annullaConto?.(); return; }
    if (this.fase === 'fermo') return;
    if (this.fase === 'registra') this.fatto += performance.now() - this.da;
    this.pezzo?.chiudi();
    this.pezzo = null;
    const cursore = this.cursoreLive?.ferma().catch((e) => {
      avviso('La registrazione resta disponibile, ma non i dati del cursore: ' + String(e), 'info', 5000);
      return null;
    }) ?? Promise.resolve(null);
    const scelteCursore = { ...this.scelteCursore };
    this.cursoreLive = null;
    this.fase = 'fermo';
    this.fermaGiro();
    this.aggiornaTempo();
    this.aggiornaTasti();
    void this.tele.chiudi();
    this.stato.textContent = 'Metto in ordine la registrazione…';
    const foto = this.foto();
    const durata = this.durataUltima = this.fatto;
    const pezzi = this.pezzi, segCam = this.segCam, pezziMic = this.pezziMic, segni = this.segni, flussi = this.flussi, mix = this.mixer;
    // la regia disegna finché l'ultimo pezzo non ha dato tutto
    const regia = this.regia;
    this.regia = null;
    clearInterval(this.giroFonti);
    this.chiudiGiroFonti();
    this.disegnaFonti();
    this.aggiornaTasti();
    this.pezzi = [];
    this.segCam = [];
    this.segCamAperto = null;
    this.pezziMic = [];
    this.micSep = null;
    this.segni = [];
    this.flussi = [];
    this.micReg = null;
    // le barre si fermano subito; il mixer resta vivo finché l'ultimo pezzo non ha dato tutto
    this.mixer = null;
    this.audio.aggiorna();
    this.flusso = null;
    // i file temporanei dei pezzi (e quelli cuciti) si tolgono dal disco a lavoro finito, anche se qualcosa va storto
    const daLiberare: Tratto[] = [];
    const cuciti: Blob[] = [];
    this.ultima = (async () => {
      // i flussi si spengono solo quando l'ultimo pezzo ha dato tutto
      const [tratti, segmentiCam, trattiMic] = await Promise.all([Promise.all(pezzi), Promise.all(segCam.map(async (g) => ({ da: g.da, tratti: await Promise.all(g.pezzi) }))), Promise.all(pezziMic)]);
      daLiberare.push(...tratti, ...segmentiCam.flatMap((g) => g.tratti), ...trattiMic);
      this.diagnosi = tratti.map((x, i) => `tratto ${i + 1}: ${Math.round(x.blob.size / 1024)} kB, ${x.nota}`);
      regia?.ferma();
      this.chiudiFlussi(flussi, mix);
      if (this.fase === 'fermo') { this.anteprima = null; liberaVideo(this.video); }
      // la webcam resta accesa per l'anteprima solo se si è ancora su LIVE
      if (!this.visibile) this.chiudiCam();
      await this.consegna(tratti.filter((x) => x.blob.size), segmentiCam.map((g) => ({ da: g.da, tratti: g.tratti.filter((x) => x.blob.size) })).filter((g) => g.tratti.length), trattiMic.filter((x) => x.blob.size), durata, segni, foto,
        await cursore, scelteCursore, tratti.flatMap((x, i) => x.blob.size ? [i] : []), cuciti);
    })().catch((e) => {
      // anche su errore tutto quello che era aperto si chiude
      try { regia?.ferma(); this.chiudiFlussi(flussi, mix); } catch { /* già chiusi */ }
      this.stato.textContent = 'Non sono riuscito a mettere via la registrazione';
      avviso('La registrazione non si salva: ' + String(e), 'errore', 4000);
    }).finally(async () => {
      await Promise.allSettled([...daLiberare.map((t) => t.libera?.()), ...cuciti.map((b) => liberaDi.get(b)?.())]);
      this.aggiornaRisorse();
      void this.aggiornaSpazio();
    });
  }

  /** la cartella del contenitore dove vanno le registrazioni (si fa la prima volta) */
  private cartellaRegistrazioni(): string {
    const c = store.doc.cartelle?.find((x) => !x.genitore && x.nome === 'Registrazioni');
    if (c) return c.id;
    const id = uid('d');
    store.edit('Cartella Registrazioni', (p) => { (p.cartelle ??= []).push({ id, nome: 'Registrazioni' }); });
    return id;
  }

  /** la registrazione finita: cucita, sul disco (nell'app), nel contenitore e in fondo alla timeline */
  private async consegna(tratti: Tratto[], segmentiCam: { da: number; tratti: Tratto[] }[], trattiMic: Tratto[], durata: number, segni: number[], foto: string,
    cursore: Awaited<ReturnType<CursoreLive['ferma']>> | null = null, scelteCursore = { zoom: false, clic: false }, indici: number[] = tratti.map((_, i) => i),
    /** i file cuciti sul disco temporaneo: chi chiama li toglie sempre, anche se qualcosa va storto */ cuciti: Blob[] = []) {
    if (!tratti.length) { this.stato.textContent = 'La registrazione è vuota'; return; }
    const mp4 = /mp4/.test(tratti[0].blob.type);
    // di solito un file solo; se la cucitura non riesce, i pezzi vanno uno dopo l'altro (sempre senza buchi)
    const tempi: { indice: number; daMs: number; durataMs: number }[] = [];
    const cucito = await cuci(tratti, mp4, this.diagnosi, tempi, isTauri, cuciti);
    const files = cucito ? [cucito] : await Promise.all(tratti.map((x) => rimetteInOrdine(x.blob, mp4)));
    // la webcam: un file per ogni segmento (se l'hai accesa e spenta più volte), ognuno con il punto da cui parte
    const camBlob: { blob: Blob; da: number }[] = [];
    for (const g of segmentiCam) {
      const note: string[] = [];
      const camMp4 = /mp4/.test(g.tratti[0].blob.type);
      const b = await cuci(g.tratti, camMp4, note, undefined, isTauri, cuciti) ?? (g.tratti.length === 1 ? await rimetteInOrdine(g.tratti[0].blob, camMp4) : null);
      if (b) camBlob.push({ blob: b, da: g.da });
      this.diagnosi.push(...note.map((x) => 'webcam ' + x));
    }
    // il microfono a parte: un file audio solo (o pezzo per pezzo, come lo schermo)
    let micFiles: Blob[] = [];
    if (trattiMic.length) {
      const note: string[] = [];
      const micMp4 = /mp4/.test(trattiMic[0].blob.type);
      const cucitoMic = await cuci(trattiMic, micMp4, note, undefined, isTauri, cuciti);
      micFiles = cucitoMic ? [cucitoMic] : trattiMic.map((x) => x.blob);
      this.diagnosi.push(...note.map((x) => 'microfono ' + x));
    }
    const ora = new Date();
    const radice = `Registrazione ${ora.getFullYear()}-${due(ora.getMonth() + 1)}-${due(ora.getDate())} ${due(ora.getHours())}.${due(ora.getMinutes())}.${due(ora.getSeconds())}`;
    const cartella = this.cartellaRegistrazioni();
    const importa = async (nome: string, blob: Blob) => {
      const path = await salvaSulDisco(nome, blob);
      // senza un percorso sul disco (browser) il file vive in memoria: non può restare legato al file temporaneo, che si cancella
      const file = path ? undefined : new File([await blob.arrayBuffer()], nome, { type: blob.type });
      const [m] = await importaFile([{ name: nome, path, file }], { chiediFormato: false, cartella, controlla: false });
      // il file cucito sul disco temporaneo ha fatto il suo lavoro
      await liberaDi.get(blob)?.().catch(() => {});
      return m as MediaItem | undefined;
    };
    const schermi: MediaItem[] = [];
    for (const [i, blob] of files.entries()) {
      // il formato del progetto non si cambia per una registrazione (una finestra può avere una misura qualsiasi)
      const m = await importa(`${radice}${files.length > 1 ? ` parte ${i + 1}` : ''}.${mp4 ? 'mp4' : 'webm'}`, blob);
      if (m) {
        if (cursore) {
          const parti = cucito ? tempi.map((t) => ({ ...t, indice: indici[t.indice] }))
            : [{ indice: indici[i], daMs: 0, durataMs: Math.min(tratti[i].taglio * 1000, m.duration * 1000) }];
          const dati = cursore.perVideo(parti, (m.duration - (m.t0 || 0)) * 1000);
          dati.video = { nome: m.name, size: m.size };
          // Sono metadati della sorgente, come durata e dimensioni: restano anche nei vecchi stati dell'annulla.
          store.aggiornaMedia(m.id, { cursoreLive: dati });
          m.cursoreLive = dati;
          if (m.path) {
            try { await invoke('progetto_scrivi', { path: m.path + '.cursore.json', text: JSON.stringify(dati) }); }
            catch (e) { avviso('I dati del cursore restano nel progetto, ma il file accanto al video non si salva: ' + String(e), 'info', 5000); }
          }
        }
        schermi.push(m);
      }
    }
    if (!schermi.length) { this.stato.textContent = 'Non sono riuscito a leggere la registrazione'; return; }
    const estAudio = (b: Blob) => (/mp4/.test(b.type) ? 'm4a' : 'webm');
    const mics: MediaItem[] = [];
    for (const [i, blob] of micFiles.entries()) {
      const m = await importa(`${radice} microfono${micFiles.length > 1 ? ` parte ${i + 1}` : ''}.${estAudio(blob)}`, blob);
      if (m) mics.push(m);
    }
    const cams: { m: MediaItem; da: number }[] = [];
    for (const [i, g] of camBlob.entries()) {
      const m = await importa(`${radice} webcam${camBlob.length > 1 ? ` ${i + 1}` : ''}.${/mp4/.test(g.blob.type) ? 'mp4' : 'webm'}`, g.blob);
      if (m) cams.push({ m, da: g.da });
    }
    const mCam = cams[0]?.m;
    const ids = this.opz.timeline ? this.inTimeline(schermi, cams, segni, mics, scelteCursore) : [];
    if (ids.length) store.select(ids);
    const { id, name: nome } = schermi[0];
    this.stato.textContent = `Fatto: ${nome}`;
    const riga = h('button', { class: 'live-voce', title: 'Aprila nel monitor', on: { click: () => { document.dispatchEvent(new CustomEvent('dpv:pagina', { detail: 'montaggio' })); motore.caricaPlayer(id); motore.setMonitor('player'); } } },
      foto ? h('img', { class: 'live-voce-foto', src: foto, alt: '' }) : icona('video', 14),
      h('span', { class: 'live-voce-testo' }, h('b', null, nome.replace(/\.(webm|mp4)$/, '')),
        h('small', null, [orologio(durata), mCam ? 'webcam' : '', mics.length ? 'voce a parte' : '', segni.length ? `${segni.length} segni` : ''].filter(Boolean).join(' · '))));
    if (this.lista.querySelector('.nota')) this.lista.replaceChildren();
    this.lista.prepend(riga);
    avviso(`🎬 ${nome}: nel contenitore${this.opz.timeline ? ' e in fondo alla timeline' : ''}`, 'ok', 3200);
    this.vaiAlMontaggio(id, ids);
  }

  /** finita la registrazione si va dritti al Montaggio (se si è ancora su LIVE): la testina sul primo pezzo, o la ripresa nel monitor se non è finita in timeline */
  private vaiAlMontaggio(mediaId: string, ids: string[]) {
    if (!this.visibile) return;
    document.dispatchEvent(new CustomEvent('dpv:pagina', { detail: 'montaggio' }));
    if (ids.length) {
      const inizio = store.doc.clips.filter((c) => ids.includes(c.id) && c.kind !== 'fx').map((c) => c.start);
      if (inizio.length) store.setHead(Math.min(...inizio));
    } else {
      motore.caricaPlayer(mediaId);
      motore.setMonitor('player');
    }
  }

  /**
   * In fondo alla timeline, dal basso: lo sfondo (stile presentazione), lo schermo, la webcam sopra. Se le tracce
   * video non bastano se ne aggiungono. Tutto legato insieme, così si sposta in un colpo; i segni diventano marcatori.
   */
  private inTimeline(schermi: MediaItem[], cams: { m: MediaItem; da: number }[], segni: number[], mics: MediaItem[] = [], cursore = { zoom: false, clic: false }): string[] {
    const o = this.opz;
    return store.edit('Registrazione in timeline', (p) => {
      const inizio = projectEnd(p);
      const vt = p.tracks.filter((t) => t.kind === 'video' && !t.lock);
      const servono = 1 + (o.presentazione ? 1 : 0) + (cams.length ? 1 : 0);
      while (vt.length < servono) {
        const nt = newTrack('video', nextTrackName(p, 'video'));
        p.tracks.unshift(nt);
        vt.unshift(nt);
      }
      const dalBasso = [...vt].reverse();
      let k = 0;
      const tSfondo = o.presentazione ? dalBasso[k++].id : null;
      const tSchermo = dalBasso[k++].id;
      const tCam = cams.length ? dalBasso[k++].id : null;
      const a = p.tracks.find((t) => t.kind === 'audio' && !t.lock)?.id;
      // il microfono a parte va su un'altra traccia audio (se serve se ne fa una nuova), così ha il suo fader
      let tMic: string | null = null;
      if (mics.length) {
        const at = p.tracks.filter((t) => t.kind === 'audio' && !t.lock);
        tMic = at.find((t) => t.id !== a)?.id ?? null;
        if (!tMic) { const nt = newTrack('audio', nextTrackName(p, 'audio')); p.tracks.push(nt); tMic = nt.id; }
      }
      const ids: string[] = [];
      let f = inizio;
      let link: string | undefined;
      for (const [i, m] of schermi.entries()) {
        const nuovi = M.placeSource(p, { mediaId: m.id, srcIn: m.t0 || 0, srcOut: m.duration }, f, null, { video: tSchermo, audio: a ? [a] : [] }, 'libero');
        ids.push(...nuovi);
        const v = p.clips.find((c) => nuovi.includes(c.id) && c.track === tSchermo) ?? p.clips.find((c) => c.id === nuovi[0]);
        if (!v) continue;
        if (o.presentazione) v.tf = presentazione();
        link ??= v.link ?? (v.link = uid('l'));
        for (const c of p.clips) if (nuovi.includes(c.id)) { c.link = link; if (tMic && c.track !== tSchermo) c.name = 'Audio del computer'; }
        if (cursore.zoom) applicaZoomCursore(p, v, m);
        if (cursore.clic && m.cursoreLive?.clic.length) {
          const blocco = bloccoClicLive(v);
          p.clips.push(blocco); ids.push(blocco.id);
        }
        // la voce di questo pezzo, nello stesso punto e legata al resto
        if (tMic && mics[i]) {
          const voce = M.placeSource(p, { mediaId: mics[i].id, srcIn: mics[i].t0 || 0, srcOut: mics[i].duration }, v.start, null, { video: null, audio: [tMic] }, 'libero');
          for (const c of p.clips) if (voce.includes(c.id)) { c.link = link; c.name = 'Microfono'; c.len = Math.min(c.len, v.len); }
          ids.push(...voce);
        }
        f = Math.max(f, v.start + v.len);
      }
      if (tSfondo && f > inizio) {
        const sf = SFONDI.find((x) => x.id === o.sfondo) ?? SFONDI[0];
        const c = newClip('color', tSfondo, inizio, f - inizio, { name: 'Sfondo ' + sf.nome, gen: { color: sf.a, color2: sf.b }, link });
        p.clips.push(c);
        ids.push(c.id);
      }
      if (cams.length && tCam) {
        // ogni segmento della webcam parte dal punto in cui l'hai accesa; finisce con lo schermo (il suo registratore consegna un fotogramma in più)
        for (const { m: cam, da } of cams) {
          const da0 = inizio + Math.round(da * fps(p.rate));
          const nuovi = M.placeSource(p, { mediaId: cam.id, srcIn: cam.t0 || 0, srcOut: cam.duration }, da0, null, { video: tCam, audio: [] }, 'libero');
          for (const c of p.clips) if (nuovi.includes(c.id)) { c.tf = bolla(p, cam, o.camAngolo, 0.3, o.camTonda); c.link = link; if (f > da0) c.len = Math.min(c.len, f - da0); }
          ids.push(...nuovi);
        }
      }
      const r = fps(p.rate);
      segni.forEach((t, i) => p.markers.push({ id: uid('k'), f: inizio + Math.round(t * r), name: `Segno ${i + 1}`, color: '#ff4d6d' }));
      return ids;
    });
  }

  // ——— più finestre ———
  private nomeFonte(s: MediaStream, n: number) {
    const l = (s.getVideoTracks()[0]?.label ?? '').replace(/^(window|screen|web-contents-media-stream):.*/i, '').trim();
    return l || `Finestra ${n}`;
  }

  private nuovaFonte(flusso: MediaStream, n: number): Fonte {
    // il video sta nella pagina ma quasi invisibile: se no il browser non lo fa scorrere
    const video = h('video', { muted: true, autoplay: true, playsinline: true, style: 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none' }) as HTMLVideoElement;
    video.muted = true;
    video.srcObject = flusso;
    document.body.append(video);
    void video.play().catch(() => {});
    return { flusso, video, nome: this.nomeFonte(flusso, n), miniatura: h('canvas', { width: 112, height: 63 }) as HTMLCanvasElement };
  }

  /** una finestra o uno schermo in più, scelta PRIMA di registrare: entra nella registrazione e si passa dall'una all'altra con 1-9 */
  async aggiungiPrima() {
    if (this.fase !== 'fermo') { avviso('Le finestre si aggiungono prima di registrare', 'info', 2400); return; }
    if (this.aggiungendo) return;
    this.aggiungendo = true;
    try {
      const o = this.opz;
      const s = risorseLive.flusso(sorgenteProva ? await sorgenteProva(false) : await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: o.fps }, height: { ideal: o.qualita }, width: { ideal: Math.round(o.qualita * 16 / 9) }, ...({ cursor: o.cursore ? 'always' : 'never' } as object) },
        audio: false,
        ...({ selfBrowserSurface: 'exclude' } as object),
      } as DisplayMediaStreamOptions));
      const voce = { s, nome: this.nomeFonte(s, this.prime.length + 2) };
      this.prime.push(voce);
      s.getVideoTracks()[0]?.addEventListener('ended', () => { this.prime = this.prime.filter((x) => x !== voce); this.disegnaPrime(); });
      this.disegnaPrime();
    } catch (e) { await avvisaErroreSchermo(e); } finally { this.aggiungendo = false; }
  }

  private disegnaPrime() {
    const vive = this.prime.filter((p) => p.s.getVideoTracks().some((t) => t.readyState === 'live'));
    this.prime = vive;
    this.elPrime.replaceChildren(...(vive.length
      ? [h('p', { class: 'nota' }, `Si registra anche: ${vive.length === 1 ? 'una finestra in più' : vive.length + ' finestre in più'}. Mentre registri le cambi con i tasti 1-9.`),
        ...vive.map((p) => h('div', { class: 'live-fonte' }, h('span', { class: 'live-fonte-nome' }, p.nome.slice(0, 40)),
          h('button', { class: 'live-fonte-x', title: 'Toglila', on: { click: () => { risorseLive.fermaTutte(p.s); this.prime = this.prime.filter((x) => x !== p); this.disegnaPrime(); } } }, '✕')))]
      : []));
  }

  /** un'altra finestra o schermo MENTRE si registra (non più dalla pagina: restano per le prove e il vecchio tasto) */
  async aggiungiFinestra() {
    const r = this.regia;
    if (!r) { avviso('Accendi "Più finestre al volo" prima di registrare: poi puoi aggiungere altre finestre', 'info', 3200); return; }
    if (this.fase === 'fermo') { avviso('Premi prima REGISTRA: poi puoi aggiungere altre finestre', 'info', 2200); return; }
    if (this.aggiungendo) return;
    this.aggiungendo = true;
    try {
      const o = this.opz;
      const s = risorseLive.flusso(sorgenteProva ? await sorgenteProva(false) : await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: o.fps }, height: { ideal: o.qualita }, width: { ideal: Math.round(o.qualita * 16 / 9) }, ...({ cursor: o.cursore ? 'always' : 'never' } as object) },
        audio: false,
        ...({ selfBrowserSurface: 'exclude' } as object),
      } as DisplayMediaStreamOptions));
      // nel frattempo la registrazione può essere finita
      if (this.regia !== r) { risorseLive.fermaTutte(s); return; }
      this.flussi.push(s);
      const f = this.nuovaFonte(s, r.fonti.length + 1);
      r.fonti.push(f);
      r.attiva = r.fonti.length - 1;
      s.getVideoTracks()[0]?.addEventListener('ended', () => this.togliFinestra(f));
      this.disegnaFonti();
      this.aggiornaTasti();
      this.stato.textContent = `● In onda: ${f.nome.slice(0, 28)}`;
    } catch (e) { await avvisaErroreSchermo(e); } finally { this.aggiungendo = false; }
  }

  /** una finestra si è chiusa (o l'hai tolta): se era l'ultima è come premere FERMA */
  private togliFinestra(f: Fonte) {
    const r = this.regia;
    if (!r) return;
    const i = r.fonti.indexOf(f);
    if (i < 0) return;
    if (r.fonti.length <= 1) { this.ferma(); return; }
    r.fonti.splice(i, 1);
    if (r.attiva >= i) r.attiva = Math.max(0, r.attiva - 1);
    risorseLive.fermaTutte(f.flusso);
    liberaVideo(f.video);
    f.video.remove();
    r.disegna();
    this.disegnaFonti();
    this.aggiornaTasti();
  }

  passaA(i: number) {
    const r = this.regia;
    if (!r || i < 0 || i >= r.fonti.length) return;
    r.attiva = i;
    r.disegna();
    this.disegnaFonti();
    this.stato.textContent = `● In onda: ${i + 1} · ${r.fonti[i].nome.slice(0, 28)}`;
  }

  prossimaFinestra() {
    const r = this.regia;
    if (!r || r.fonti.length < 2) { avviso('C\'è una sola finestra: aggiungine un\'altra con ＋ FINESTRA', 'info', 2200); return; }
    this.passaA((r.attiva + 1) % r.fonti.length);
  }

  private ciclaLayout() {
    const l: Disposizione[] = ['solo', 'angolo', 'affiancate'];
    this.opz.layout = l[(l.indexOf(this.opz.layout) + 1) % l.length];
    try { localStorage.setItem('dpv-live', JSON.stringify(this.opz)); } catch { /* niente */ }
    this.sinc.forEach((f) => f());
    this.applicaLayout();
  }

  private applicaLayout() {
    if (!this.regia) return;
    this.regia.layout = this.opz.layout;
    this.regia.disegna();
    this.disegnaFonti();
  }

  /** la fila delle miniature: chi è in onda è acceso, chi sta per andarci (in angolo o affiancata) è segnato */
  private disegnaFonti() {
    const r = this.regia;
    if (!r) { this.elFonti.replaceChildren(); return; }
    const n = r.fonti.length;
    this.elFonti.replaceChildren(...r.fonti.map((f, i) => h('div', {
      class: 'live-fonte' + (i === r.attiva ? ' in-onda' : '') + (n > 1 && this.opz.layout !== 'solo' && i === (r.attiva + 1) % n ? ' seconda' : ''),
      title: `${f.nome}: clic per metterla in onda (tasto ${i + 1})`, 'data-i': String(i), on: { click: () => this.passaA(i) },
    }, f.miniatura, h('span', { class: 'live-fonte-nome' }, `${i + 1} · ${f.nome}`),
      n > 1 ? h('button', { class: 'live-fonte-x', title: 'Toglila (smette di essere registrabile)', on: { click: (e: Event) => { e.stopPropagation(); this.togliFinestra(f); } } }, '✕') : null)));
    this.aggiornaMiniature();
  }

  private aggiornaMiniature() {
    for (const f of this.regia?.fonti ?? []) {
      const c = f.miniatura.getContext('2d');
      if (!c || !f.video.videoWidth) continue;
      const k = Math.min(112 / f.video.videoWidth, 63 / f.video.videoHeight);
      c.fillStyle = '#000';
      c.fillRect(0, 0, 112, 63);
      c.drawImage(f.video, (112 - f.video.videoWidth * k) / 2, (63 - f.video.videoHeight * k) / 2, f.video.videoWidth * k, f.video.videoHeight * k);
    }
  }

  private chiudiRegia() {
    clearInterval(this.giroFonti);
    this.chiudiGiroFonti();
    this.regia?.ferma();
    this.regia = null;
    this.disegnaFonti();
  }

  // ——— il telecomando ———
  apriTelecomando() { return this.tele.apri(); }
  chiudiTelecomando() { return this.tele.chiudi(); }
  /** per le prove (che non hanno la finestra dell'app): la pagina mostra solo il telecomando */
  telecomandoNellaPagina(si: boolean) { this.tele.modoPiccolo(si); }
}
