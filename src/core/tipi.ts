// Il modello del progetto: tutto quello che finisce nel file .dpv e nell'autosalvataggio.
// I tempi sulla timeline sono in FOTOGRAMMI interi (come sulle centraline di montaggio a nastro):
// niente mezzi fotogrammi, niente errori di arrotondamento sui tagli. Solo il punto d'ingresso nella
// sorgente (srcIn) è in secondi, perché la sorgente può avere un'altra cadenza.

export type Rate = { num: number; den: number };

/** Colore SDR: nessuna conversione log implicita. Tutti i campi assenti sono neutri. */
export interface PuntoColore { id: string; x: number; y: number }
export type CanaleCurva = 'master' | 'red' | 'green' | 'blue' | 'luma';
export interface ColoreAvanzato {
  lift?: [number, number, number];
  gamma?: [number, number, number];
  gain?: [number, number, number];
  curve?: Partial<Record<CanaleCurva, PuntoColore[]>>;
  lut?: { id: string; /** 0..1 */ intensita: number };
}
/** Una sola copia nel progetto, anche nei pacchetti .dap/.daprod. Mai texture o typed array nel JSON. */
export interface RisorsaLut {
  id: string; hash: string; nome: string; n: number;
  domainMin: [number, number, number]; domainMax: [number, number, number]; dati: number[];
}
export type RuoloAudio = 'nessuno' | 'voce' | 'musica';
export interface Ducking {
  attivo: boolean;
  /** riduzione positiva in dB */ quantita: number;
  /** tempi in secondi di timeline */ attacco: number; rilascio: number;
  /** soglia RMS in dBFS, non riconoscimento del parlato */ soglia: number;
  isteresi: number; minimo: number; hold: number;
}

/** fx = la vecchia corsia FX a parte (1.0.4): all'apertura i suoi blocchi passano sulle tracce video e lei sparisce */
export type TrackKind = 'video' | 'audio' | 'fx';

export interface Track {
  ruoloAudio?: RuoloAudio;
  ducking?: Ducking;
  id: string;
  kind: TrackKind;
  name: string;
  height: number;
  /** video: traccia spenta (non si vede) · audio: muto */
  mute: boolean;
  solo: boolean;
  lock: boolean;
  /** video: trasparenza della traccia intera, 0..1: i "livelli al volo" */
  opacity: number;
  /** audio: volume della traccia in dB */
  volume: number;
  /** audio: panorama -1 (sinistra) .. 1 (destra) */
  pan: number;
}

/** fx = un blocchetto effetto/transizione: sta su una traccia video, sopra le clip, e non occupa posto */
export type ClipKind = 'media' | 'color' | 'bars' | 'tone' | 'countdown' | 'title' | 'beep' | 'fx';

/** Un punto della linea elastica (rubber band): f = fotogrammi dall'inizio della clip. */
export interface Key { f: number; v: number }

/** Come si passa da una chiave alla successiva: dritta, morbida (parte e arriva piano) o a gradino (resta fino alla prossima). */
export type ModoAnim = 'lineare' | 'morbida' | 'gradino';
/** Un keyframe di un parametro numerico: f = fotogrammi dall'inizio della clip, modo = come si arriva alla chiave dopo. */
export interface ChiaveAnim { f: number; v: number; modo?: ModoAnim }
/** Le linee animate di una clip: il percorso del parametro ("opacity", "tf.x", "fx.sat", "fxb.forza", "mask.<id>.sfuma"…)
 *  con le sue chiavi in ordine di tempo. Chi non c'è usa il valore fermo di sempre (src/core/automazioni.ts). */
export type Animazioni = Record<string, ChiaveAnim[]>;

/** Un punto della maschera a Bézier: x e y in frazioni della sorgente (0..1 dall'angolo in alto a sinistra); hx e hy = la
 *  maniglia in uscita (relativa al punto, quella in entrata è opposta). Senza maniglie il punto è uno spigolo. */
export interface PuntoBez { x: number; y: number; hx?: number; hy?: number }
/** Una maschera a forma sulla clip (src/core/maschereForma.ts). Tutto in frazioni della sorgente, così segue la clip. */
export interface MascheraForma {
  id: string;
  forma: 'rettangolo' | 'ellisse' | 'bezier';
  nome?: string;
  /** rettangolo ed ellisse: centro, larghezza e altezza intere (frazioni), rotazione in gradi */
  x: number; y: number; w: number; h: number; rot: number;
  /** Bézier: i punti in ordine (la forma si chiude da sola); morbida = le curve passano dolci da un punto all'altro */
  punti?: PuntoBez[];
  morbida?: boolean;
  /** sfumatura del bordo, frazione del lato corto (0..0.5) */
  sfuma: number;
  /** allarga (+) o restringe (−) la forma, frazione del lato corto (−0.5..0.5) */
  espandi: number;
  inverti: boolean;
  /** quanto conta la maschera 0..1 */
  opacita: number;
  /** somma = aggiunge a quello che si vede · sottrai = toglie */
  op: 'somma' | 'sottrai';
  /** spenta = c'è ma non conta */
  spenta?: boolean;
}

/** mix = dissolvenza · wipe = tendina SMPTE · dip = passaggio a colore · dve = effetto digitale */
export type TransitionType = 'mix' | 'wipe' | 'dip' | 'dve';

export interface Transition {
  type: TransitionType;
  /** durata in fotogrammi */
  len: number;
  /** numero di tendina SMPTE (per 'wipe') */
  pattern: number;
  /** bordo morbido 0..1 */
  soft: number;
  /** spessore del bordo 0..1 */
  border: number;
  borderColor: string;
  reverse: boolean;
  /** colore del passaggio per 'dip' */
  color: string;
  /** effetti digitali: quanto è forte (scia, onda, sfocatura…), 1 = come viene */
  forza?: number;
  /** effetti digitali: la direzione gira di 0, 1, 2 o 3 quarti di giro */
  dir?: number;
  /** come corre il passaggio (niente = come vuole l'effetto) */
  curva?: 'lineare' | 'dolce' | 'entra' | 'esce';
}

export type Look = 'none' | 'vhs' | 'film' | 'bn' | 'seppia' | 'crt';

/**
 * Un blocchetto della corsia FX. Effetto: cambia l'immagine di tutto quello che sta sotto per la sua durata
 * (lampo, scossa, zoom…). Transizione: passa da una clip all'altra sul taglio che sta sotto il blocco; più il
 * blocco è lungo, più è lenta. Le clip non cambiano mai durata.
 */
/** il suono che una clip si porta dentro: quale, acceso o no, quanto forte */
export interface SuonoClip {
  suono?: string;
  audio?: boolean;
  volume?: number;
}

export interface BloccoFx {
  /** LIVE: i clic di questo media, disegnati sulla ripresa prima del suo movimento. */
  cursoreMedia?: string;
  tipo: 'effetto' | 'transizione';
  /** effetto: il suo nome nel catalogo (src/core/blocchi.ts) · transizione: 'mix', 'dip', 'wipe:119', 'dve:301'… */
  id: string;
  /** forza 0..1 */
  forza: number;
  /** colore del lampo, del passaggio, della dissolvenza */
  colore: string;
  /** transizione: tipo, modello, bordo… (la durata è quella del blocco) */
  tr?: Transition;
  /** il suono dentro l'FX (src/core/suoni.ts): whoosh, colpo, zap… (niente = muto) */
  suono?: string;
  /** il suono è acceso? (un clic sull'altoparlante del blocco) */
  audio?: boolean;
  /** volume del suono in dB (0 = normale) */
  volume?: number;
  /** dove sta il centro dell'effetto (bolla, vortice, zoom, riflesso…): frazioni del quadro, x a destra, y in basso */
  pos?: [number, number];
  /** dove arriva il centro alla fine del blocco (niente = fermo) */
  posFine?: [number, number];
  /** le tappe di mezzo del centro: t = quanto del blocco è passato (0..1), pos = dove sta in quel momento */
  via?: ViaPos[];
  /** il centro segue un oggetto tracciato su questa clip (l'id): pos diventa lo scarto dall'oggetto */
  segue?: string;
  /** quante volte si ripete nella durata del blocco (1 = una) */
  ripeti?: number;
  /** parametri numerici opzionali del catalogo FX; assenti = valori del catalogo */
  parametri?: Record<string, number>;
}

/** una tappa intermedia del centro di un effetto */
export interface ViaPos { t: number; pos: [number, number] }

/** una tappa intermedia della posizione di una clip: t = quanto della clip è passato (0..1) */
export interface ViaTf { t: number; tf: Transform }

/** i punti tracciati su un video: un oggetto seguito fotogramma per fotogramma. t = secondi della sorgente,
 *  x e y = dove sta nell'immagine (frazioni 0..1 dall'angolo in alto a sinistra) */
export interface Traccia {
  punti: { t: number; x: number; y: number }[];
  /** dove l'hai segnato all'inizio (secondi della sorgente) */
  da: number;
  /** quanto era sicuro il seguito nel punto peggiore (0..1) */
  fiducia: number;
}

/**
 * Togliere lo sfondo con l'AI: il modello disegna una maschera (bianco = soggetto) per tanti fotogrammi della ripresa,
 * in tutta la clip; il compositore la usa come trasparenza (src/media/ritaglio.ts). Le maschere non stanno nel progetto
 * (pesano troppo): si rifanno, o si rileggono dalla cache del computer se i parametri sono gli stessi.
 */
export interface Ritaglio {
  /** persona = ritratti veloci · soggetto = qualunque cosa in primo piano (la più precisa) · oggetti = scelti con i clic */
  modo: 'persona' | 'soggetto' | 'oggetti';
  /** il modello usato (src/media/ritaglio.ts MODELLI_RITAGLIO) */
  modello: string;
  /** oggetti: i clic sull'immagine (frazioni 0..1 dall'angolo in alto a sinistra): dentro = è l'oggetto, fuori = non lo è */
  punti?: { x: number; y: number; dentro: boolean; /** quale oggetto (0, 1, 2…): si possono tenere più persone e cose insieme */ g?: number }[];
  /** oggetti: a quale oggetto vanno i clic nuovi (dopo "＋ Un altro oggetto") */
  oggetto?: number;
  /** oggetti: l'istante della sorgente (secondi) dove hai messo i clic */
  da?: number;
  /** oggetti: i clic valgono per tutta la ripresa (camera ferma) o si seguono da un fotogramma all'altro */
  segui?: boolean;
  /** oggetti: SAM 3 su ogni fotogramma (circa 3 volte più lento); di partenza SAM 3 guida e SAM 2.1 tiny segue, con SAM 3 che torna ogni pochi fotogrammi */
  preciso?: boolean;
  /** oggetti: il clic sceglie una PERSONA (il modello delle persone trova tutti, il clic dice quale) invece di un oggetto qualunque (SAM) */
  persona?: boolean;
  /** restringe (−1) o allarga (+1) il bordo */
  bordo: number;
  /** quanto è morbido il bordo 0..1 */
  morbido: number;
  /** tiene lo sfondo e toglie il soggetto */
  inverti?: boolean;
  /** precisione: 0 veloce · 1 buona · 2 alta (più fotogrammi al secondo e immagini più grandi) */
  qualita: number;
  /** la firma dei parametri con cui sono state fatte le maschere (src/core/sfondo.ts): se non torna, vanno rifatte */
  firma?: string;
}

export interface VideoFx {
  colore?: ColoreAvanzato;
  /** livello del nero / luminosità -1..1 */
  bright: number;
  /** guadagno / contrasto 0..2 */
  contrast: number;
  /** croma / saturazione 0..2 */
  sat: number;
  /** fase / tinta in gradi -180..180 */
  hue: number;
  look: Look;
  /** chiave: none, luma (toglie il nero o il bianco), chroma (toglie un colore) */
  key: 'none' | 'luma' | 'chroma';
  keyColor: string;
  keyLevel: number;
  keySoft: number;
  keyInvert: boolean;
  /** altri colori da togliere oltre a keyColor (fino a 2): il verde e il blu insieme, o due verdi di luce diversa */
  keyColori?: string[];
  /** quanto colore della chiave si toglie dai bordi del soggetto (il riflesso del fondale) 0..1 (niente = 0,5) */
  keySpill?: number;
  /** restringe (−1) o allarga (+1) il soggetto sul bordo */
  keyBordo?: number;
  /** sfuma il bordo del soggetto 0..1 */
  keySfuma?: number;
  /** pulisce la maschera: toglie i puntini e riempie i buchi 0..1 */
  keyPulisci?: number;
  /** colore automatico della clip: undefined = come dice il Finale, true/false = scelto a mano */
  auto?: boolean;
  /** temperatura -1 (freddo) .. 1 (caldo) */
  temp?: number;
  /** vignetta 0..1 */
  vignette?: number;
  /** specchia in orizzontale */
  mirror?: boolean;
  /** gli effetti al volo accesi sulla clip (vivace, caldo, b/n, vhs…): si sommano tutti (src/core/effettiClip.ts) */
  effetti?: string[];
  /** zoom lento lungo la clip (Ken Burns): 0.15 = arriva al 115% */
  zoom?: number;
}

/** effetti audio della clip: filtri che valgono sia in riproduzione sia nell'export */
export interface AudioFx {
  /** voce più chiara: taglia i bassi e alza la presenza */
  voce?: boolean;
  /** taglia bassi (rimbombo, vento) */
  bassi?: boolean;
  /** effetto radio / telefono */
  radio?: boolean;
  /** eco: la voce che rimbalza */
  eco?: boolean;
  /** ovattato: come da sott'acqua o dalla stanza accanto */
  ovattato?: boolean;
  /** robot: la voce modulata, metallica */
  robot?: boolean;
  /** volume livellato in automatico (ricorda il guadagno di prima per tornare indietro) */
  norm?: number;
  /**
   * rumore tolto con l'AI (src/media/audioAI.ts): la clip suona un file nuovo e "pulito"; qui si ricorda l'originale per tornarci.
   * media = il file originale, srcIn = dov'era la clip nell'originale (secondi), da = il secondo dell'originale da cui parte il file pulito
   * (srcIn nel pulito + da = srcIn nell'originale: vale anche se poi la clip viene accorciata).
   */
  pulito?: { media: string; srcIn: number; forza: ForzaRumore; da: number; /** dB aggiunti al volume della clip per portare la voce pulita al livello giusto (si tolgono tornando all'originale) */ piu?: number };
  /** voce e base separate con l'AI: 'originale' = la clip da cui si è partiti (silenziata), 'voce'/'base' = le clip nate dalla separazione */
  separata?: { ruolo: 'voce' | 'base' | 'originale'; /** le altre clip della separazione (sull'originale: voce e base; sulle nuove: l'originale) */ con: string[]; /** sull'originale: il volume (dB) di prima che fosse silenziata */ gain?: number };
}

/** quanto togliere del rumore: leggera tiene un po' d'ambiente, forte toglie tutto quello che l'AI toglie */
export type ForzaRumore = 'pulita' | 'delicata' | 'isolata' | 'leggera' | 'media' | 'forte' | 'podcast' | 'naturale';

export interface Transform {
  /** spostamento in pixel del progetto, dal centro */
  x: number;
  y: number;
  scale: number;
  /** gradi */
  rot: number;
  /** ritaglio in frazione 0..0.5 per lato */
  cropL: number;
  cropR: number;
  cropT: number;
  cropB: number;
  /** angoli tondi: 0 = dritti, 1 = tutto tondo (con un ritaglio quadrato diventa un cerchio, la bolla della webcam) */
  angoli?: number;
  /** ombra morbida sotto la clip 0..1 (si vede quando la clip è più piccola del quadro) */
  ombra?: number;
  /** allargamento: quanto è larga rispetto all'altezza (1 = proporzioni giuste; tirando i lati si stira) */
  sx?: number;
}

export interface TitleSpec {
  text: string;
  /** 'fisso' | 'sottopancia' (lower third) | 'rullo' (scorre in su) | 'crawl' (scorre di lato) · animati: 'neon'
   *  (si accende tremando), 'cinema' (lettere larghe che si avvicinano), 'macchina' (da scrivere, lettera per
   *  lettera), 'rimbalzo' (entra con un salto), 'social' (fascia colorata che entra di lato), 'citazione' */
  style: 'fisso' | 'sottopancia' | 'rullo' | 'crawl' | 'neon' | 'cinema' | 'macchina' | 'rimbalzo' | 'social' | 'citazione'
    | 'gradiente' | 'etichetta' | 'rivela' | 'glitch' | 'grande'
    // lettera per lettera e altri
    | 'cascata' | 'assembla' | 'onda' | 'evidenzia' | 'karaoke' | 'estruso' | 'ombraLunga' | 'contorno' | 'notiziario';
  font: string;
  size: number;
  color: string;
  outline: string;
  shadow: boolean;
  box: boolean;
  boxColor: string;
  align: 'left' | 'center' | 'right';
  y: number;
  /** solo per disegnare la macchina da scrivere: il testo intero (per la misura e il cursore) */
  intero?: string;
  /** solo per disegnare "rivela": quanto testo si vede (0..1), con la barra colorata sul bordo */
  rivela?: number;
  /** una riga piccola sotto il titolo (il sottotitolo) */
  sotto?: string;
  /** come entra e come esce (qualunque stile): 'dissolve' | 'sale' | 'scende' | 'sinistra' | 'destra' | 'zoom' | 'rimbalza' */
  ingresso?: string;
  uscita?: string;
  /** spazio fra le lettere, in parti della grandezza (0 = quello del carattere) */
  spaziatura?: number;
  /** grassetto: 400..900 (niente = quello dello stile) */
  peso?: number;
}

/** un'animazione del catalogo (src/core/animazioni.ts): quale e i valori dei suoi campi (testi, colori, numeri) */
export interface AnimSpec {
  id: string;
  v: Record<string, string | number | boolean>;
}

/** un titolo animato HTML (src/core/titoliHtml.ts): quale modello e i valori dei suoi campi (testi, colori, tempi) */
export interface HtmlSpec {
  id: string;
  v: Record<string, string | number | boolean>;
}

export interface GenSpec {
  /** un titolo animato fatto di HTML e CSS, disegnato fotogramma per fotogramma (la clip è un titolo) */
  html?: HtmlSpec;
  /** un'animazione pronta: sottopancia, testo che si muove, grafico, fondo, effetto da cerimonia… (la clip è un titolo) */
  anim?: AnimSpec;
  color?: string;
  /** colore pieno sfumato: il secondo colore (in basso a destra) */
  color2?: string;
  /** barre: 'smpte' | 'ebu' */
  bars?: 'smpte' | 'ebu';
  /** tono: frequenza e livello */
  freq?: number;
  level?: number;
  /** tono a colpetti: un bip ogni tot secondi (il countdown), lungo `bip` secondi */
  ogni?: number;
  bip?: number;
  title?: TitleSpec;
  /** countdown: lo stile */
  conto?: 'pellicola' | 'moderno' | 'neon' | 'minimal';
}

/**
 * La forma di una dissolvenza: k da −1 (parte piano piano, come un fader analogico) a +1 (sale subito e poi
 * si posa); 0 = dritta. s = a S (dolce all'inizio e alla fine).
 */
export interface Curva { k: number; s?: boolean }

export interface Clip {
  /** Parlato per il montaggio dal testo: secondi della sorgente, così i tagli e la velocità non lo spostano. */
  parlato?: { id: string; media: string; da: number; a: number; parole: { da: number; a: number; testo: string }[] };
  /** la scelta della clip prevale su quella della traccia */
  ruoloAudio?: RuoloAudio;
  ducking?: Ducking;
  /** attenuazione in dB, separata dalla linea elastica manuale */
  duckKeys?: Key[];
  duckFirma?: string;
  id: string;
  track: string;
  kind: ClipKind;
  media?: string;
  name: string;
  /** fotogramma d'inizio sulla timeline */
  start: number;
  /** durata in fotogrammi */
  len: number;
  /** ingresso nella sorgente, in secondi */
  srcIn: number;
  speed: number;
  /** velocità "come il nastro": l'audio cambia anche di tono (di partenza no: la voce resta naturale) */
  nastro?: boolean;
  /** movimento fluido quando si rallenta: 0 = niente, 1 = fotogrammi sfumati, 2 = fotogrammi mossi (src/core/velocita.ts) */
  fluido?: number;
  /** clip video e audio della stessa ripresa condividono il link: si muovono insieme */
  link?: string;
  label: number;
  // video
  opacity: number;
  opKeys: Key[];
  tf: Transform;
  /** dove arriva alla fine della clip (posizione, grandezza, rotazione…): fra tf e tfFine si muove piano (niente = ferma) */
  tfFine?: Transform;
  /** le tappe di mezzo fra tf e tfFine (posizioni intermedie): la clip ci passa in ordine di tempo */
  via?: ViaTf[];
  /** i punti di un oggetto seguito in questa ripresa (src/core/traccia.ts) */
  traccia?: Traccia;
  /** la clip segue l'oggetto tracciato su un'altra clip (l'id): la sua posizione è lo scarto dall'oggetto */
  segue?: string;
  /** lo sfondo tolto dall'AI (maschere in src/media/maschere.ts) */
  ritaglio?: Ritaglio;
  /** keyframe su qualunque parametro numerico (src/core/automazioni.ts): chi ha una linea qui la usa al posto del valore fermo */
  anim?: Animazioni;
  /** le maschere a forma (rettangolo, ellisse, Bézier), sommate o sottratte in ordine (src/core/maschereForma.ts) */
  maschere?: MascheraForma[];
  /** la ripresa si tiene ferma sull'oggetto tracciato (stabilizza) */
  stabilizza?: boolean;
  fx: VideoFx;
  trIn?: Transition;
  /** transizione in coda, quando dopo la clip non c'è niente di attaccato (esce su quello che sta sotto) */
  trOut?: Transition;
  /** dissolvenze in fotogrammi (video: dal trasparente · audio: dal silenzio) */
  fadeIn: number;
  fadeOut: number;
  /** la forma delle dissolvenze (niente = dritta): src/core/progetto.ts curvaFade */
  curvaIn?: Curva;
  curvaOut?: Curva;
  // audio
  gain: number;
  gainKeys: Key[];
  pan: number;
  afx?: AudioFx;
  gen?: GenSpec;
  /** i blocchetti della corsia FX */
  fxb?: BloccoFx;
  /** il suono dentro un titolo, un countdown o un generatore (niente clip audio a parte): come quello degli FX */
  sfx?: SuonoClip;
}

export type MediaType = 'video' | 'audio' | 'image';

export interface MediaItem {
  /** Opzionale: i progetti vecchi restano identici. Incorporato anche nel .daprod, senza file da ricollegare. */
  cursoreLive?: import('./zoomCursore').DatiCursore;
  id: string;
  name: string;
  type: MediaType;
  /** fine della sorgente in secondi (le immagini non hanno durata: 0) */
  duration: number;
  /** primo istante della sorgente (i file MTS non partono da zero) */
  t0: number;
  width: number;
  height: number;
  fps: number;
  rotation: number;
  hasVideo: boolean;
  hasAudio: boolean;
  channels: number;
  sampleRate: number;
  vcodec: string;
  acodec: string;
  container: string;
  size: number;
  lastModified: number;
  /** percorso sul disco (app desktop): serve a ricollegare i file quando si riapre il progetto */
  path?: string;
  /** punti di attacco e stacco marcati nel Player (secondi) */
  markIn?: number | null;
  markOut?: number | null;
  /** la cartella del contenitore dove sta (niente = fuori dalle cartelle) */
  cartella?: string;
  /** dentro un pacchetto .daprod: dove stanno i suoi byte nel file del pacchetto (path) */
  dentro?: { off: number; len: number };
  /** il nome del file dentro il pacchetto .daprod (media/…) */
  pacchetto?: string;
}

/** una cartella del contenitore, per mettere in ordine i file (si possono mettere una dentro l'altra) */
export interface Cartella { id: string; nome: string; genitore?: string }

export interface Marker { id: string; f: number; name: string; color: string }

/** il logo sempre in vista (la "filigrana" del canale): un'immagine del contenitore in un angolo */
export interface Logo {
  media: string;
  pos: 'alto-dx' | 'alto-sx' | 'basso-dx' | 'basso-sx';
  /** larghezza in frazione del quadro */
  scala: number;
  opacita: number;
}

/** una riga dei sottotitoli: da e a in fotogrammi della timeline */
export interface Sottotitolo {
  id: string; da: number; a: number; testo: string;
  /** la clip audio con la voce AI di questa riga (si sceglie dalla riga e si gestisce come ogni altra clip) */
  voce?: string;
}

export interface Sottotitoli {
  righe: Sottotitolo[];
  /** scritti nel video (monitor ed export); altrimenti escono solo come file .srt */
  nelVideo: boolean;
  /** grandezza del carattere a 1080p */
  dimensione: number;
  fascia: boolean;
  /** in alto invece che in basso */
  alto: boolean;
  /** la lingua in cui sono scritti (per il file .srt e, domani, per la traduzione) */
  lingua: string;
}

export type LookFinale = 'nessuno' | 'cinema' | 'caldo' | 'freddo' | 'vivace' | 'vintage' | 'bn' | 'pellicola' | 'notte';

/** i ritocchi finali: valgono per tutto il montaggio, nei monitor e nell'export */
export interface Master {
  colore?: ColoreAvanzato;
  /** colore automatico su tutte le riprese (livelli e bilanciamento del bianco) */
  auto: boolean;
  /** forza del colore automatico 0..1 */
  autoK: number;
  look: LookFinale;
  /** quanto pesa il look 0..1 */
  intensita: number;
  /** -1..1 */
  bright: number;
  /** 0.5..1.5 */
  contrast: number;
  /** 0..2 */
  sat: number;
  /** -1 freddo .. 1 caldo */
  temp: number;
  /** -1 verde .. 1 magenta */
  tint: number;
  vignette: number;
  grain: number;
  /** volume finale in dB */
  volume: number;
  /** limitatore sull'uscita: niente distorsione */
  limiter: boolean;
  /** il logo sempre in vista */
  logo?: Logo | null;
}

export interface Project {
  luts?: RisorsaLut[];
  format: 'daprod-video';
  v: 1;
  name: string;
  w: number;
  h: number;
  rate: Rate;
  drop: boolean;
  sampleRate: number;
  tracks: Track[];
  clips: Clip[];
  media: MediaItem[];
  markers: Marker[];
  /** attacco e stacco sulla timeline (il "record in/out" della centralina) */
  inF: number | null;
  outF: number | null;
  /** preroll/postroll in secondi, come i registratori a nastro */
  preroll: number;
  /** ritocchi finali (colore globale, look, audio finale) */
  master?: Master;
  /** i sottotitoli (pagina Finale) */
  sottotitoli?: Sottotitoli;
  /** le timeline del progetto (src/core/sequenze.ts): quella aperta vive nei campi qui sopra, le altre qui dentro */
  sequenze?: Sequenza[];
  /** l'id della timeline aperta */
  seqAttiva?: string;
  /** le cartelle del contenitore */
  cartelle?: Cartella[];
  created: number;
  saved: number;
}

/** una timeline del progetto: tracce, clip, marcatori, attacco/stacco e sottotitoli (i media sono di tutti) */
export interface Sequenza {
  id: string;
  nome: string;
  tracks?: Track[];
  clips?: Clip[];
  markers?: Marker[];
  inF?: number | null;
  outF?: number | null;
  sottotitoli?: Sottotitoli;
}

export const FORMATI = [
  { id: 'hd25', nome: 'HD 1080 · 25p (PAL)', w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false },
  { id: 'hd50', nome: 'HD 1080 · 50p', w: 1920, h: 1080, rate: { num: 50, den: 1 }, drop: false },
  { id: 'hd2997', nome: 'HD 1080 · 29,97 DF (NTSC)', w: 1920, h: 1080, rate: { num: 30000, den: 1001 }, drop: true },
  { id: 'hd30', nome: 'HD 1080 · 30p', w: 1920, h: 1080, rate: { num: 30, den: 1 }, drop: false },
  { id: 'hd24', nome: 'HD 1080 · 24p cinema', w: 1920, h: 1080, rate: { num: 24, den: 1 }, drop: false },
  { id: 'hd60', nome: 'HD 1080 · 60p', w: 1920, h: 1080, rate: { num: 60, den: 1 }, drop: false },
  { id: 'hd720', nome: 'HD 720 · 25p', w: 1280, h: 720, rate: { num: 25, den: 1 }, drop: false },
  { id: 'uhd25', nome: 'UHD 4K · 25p', w: 3840, h: 2160, rate: { num: 25, den: 1 }, drop: false },
  { id: 'pal43', nome: 'SD PAL 4:3 · 720×576 25', w: 768, h: 576, rate: { num: 25, den: 1 }, drop: false },
  { id: 'pal169', nome: 'SD PAL 16:9 · 1024×576 25', w: 1024, h: 576, rate: { num: 25, den: 1 }, drop: false },
  { id: 'vert25', nome: 'Verticale 1080×1920 · 25p', w: 1080, h: 1920, rate: { num: 25, den: 1 }, drop: false },
  { id: 'quad25', nome: 'Quadrato 1080×1080 · 25p', w: 1080, h: 1080, rate: { num: 25, den: 1 }, drop: false },
] as const;

/** le risoluzioni utili per cominciare un progetto (la pagina iniziale e le impostazioni le scelgono insieme ai fotogrammi al secondo) */
export const RISOLUZIONI = [
  { id: 'fhd', nome: 'Full HD', w: 1920, h: 1080, info: '1080p · 16:9 · YouTube, TV, schermo' },
  { id: 'uhd', nome: '4K UHD', w: 3840, h: 2160, info: '2160p · 16:9 · qualità massima' },
  { id: 'qhd', nome: '2K', w: 2560, h: 1440, info: '1440p · 16:9 · schermi grandi' },
  { id: 'hd', nome: 'HD', w: 1280, h: 720, info: '720p · 16:9 · leggero e veloce' },
  { id: 'vert', nome: 'Verticale', w: 1080, h: 1920, info: '9:16 · Reel, TikTok, Shorts, storie' },
  { id: 'post', nome: 'Post 4:5', w: 1080, h: 1350, info: '4:5 · Instagram e Facebook nel feed' },
  { id: 'quad', nome: 'Quadrato', w: 1080, h: 1080, info: '1:1 · post e anteprime' },
  { id: 'cine', nome: 'Cinema 21:9', w: 2560, h: 1080, info: '21:9 · bande nere sopra e sotto, effetto film' },
  { id: 'c43', nome: '4:3', w: 1440, h: 1080, info: '4:3 · vecchi video, presentazioni' },
  { id: 'sd', nome: 'SD 16:9', w: 1024, h: 576, info: '576p · bozze molto leggere' },
] as const;

/** i fotogrammi al secondo più usati */
export const CADENZE = [
  { id: '24', nome: '24', rate: { num: 24, den: 1 }, drop: false, info: 'cinema' },
  { id: '25', nome: '25', rate: { num: 25, den: 1 }, drop: false, info: 'Europa (PAL), TV e web' },
  { id: '30', nome: '30', rate: { num: 30, den: 1 }, drop: false, info: 'web e social' },
  { id: '50', nome: '50', rate: { num: 50, den: 1 }, drop: false, info: 'fluido: sport, azione, rallenty' },
  { id: '60', nome: '60', rate: { num: 60, den: 1 }, drop: false, info: 'molto fluido: giochi, schermo' },
  { id: '2997', nome: '29,97', rate: { num: 30000, den: 1001 }, drop: true, info: 'TV americana (NTSC, drop frame)' },
] as const;

/** i formati pronti per "dove lo pubblico?": un clic e risoluzione e fotogrammi sono quelli giusti */
export const OBIETTIVI = [
  { id: 'youtube', nome: 'YouTube', info: 'Full HD · 25 fps', ris: 'fhd', cad: '25' },
  { id: 'youtube4k', nome: 'YouTube 4K', info: '4K · 25 fps', ris: 'uhd', cad: '25' },
  { id: 'reel', nome: 'Reel · TikTok · Shorts', info: 'verticale · 30 fps', ris: 'vert', cad: '30' },
  { id: 'post', nome: 'Instagram post', info: '4:5 · 30 fps', ris: 'post', cad: '30' },
  { id: 'quad', nome: 'Quadrato', info: '1:1 · 30 fps', ris: 'quad', cad: '30' },
  { id: 'cinema', nome: 'Cinema', info: '21:9 · 24 fps', ris: 'cine', cad: '24' },
  { id: 'azione', nome: 'Sport e azione', info: 'Full HD · 50 fps', ris: 'fhd', cad: '50' },
  { id: 'schermo', nome: 'Gioco e schermo', info: 'Full HD · 60 fps', ris: 'fhd', cad: '60' },
] as const;

/** il formato (come i FORMATI) da una risoluzione e dai fotogrammi al secondo scelti */
export function formatoDa(ris: string, cad: string) {
  const r = RISOLUZIONI.find((x) => x.id === ris) ?? RISOLUZIONI[0];
  const c = CADENZE.find((x) => x.id === cad) ?? CADENZE[1];
  return { id: `${r.id}-${c.id}`, nome: `${r.nome} · ${r.w}×${r.h} · ${c.nome} fps`, w: r.w as number, h: r.h as number, rate: { num: c.rate.num as number, den: c.rate.den as number }, drop: c.drop as boolean };
}

/** a quale risoluzione e cadenza corrisponde un progetto (null se non è fra quelle pronte) */
export function sceltaDa(w: number, h: number, rate: { num: number; den: number }) {
  const r = RISOLUZIONI.find((x) => x.w === w && x.h === h);
  const c = CADENZE.find((x) => x.rate.num === rate.num && x.rate.den === rate.den);
  return { ris: r?.id ?? null, cad: c?.id ?? null };
}

export const ETICHETTE = ['#4a8cff', '#5dd39e', '#ffd54a', '#ff8a3d', '#ff4d6d', '#c86bff', '#35e8ff', '#9aa3b5'];
