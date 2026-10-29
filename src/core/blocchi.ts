// Gli FX a blocchetti: stanno sulle tracce video, sopra le clip (una striscia sottile in basso sulla riga), e non
// occupano posto: si mettono dove vuoi, anche uno sull'altro. Due famiglie, stesso modo di lavorare:
//  · EFFETTI a tempo: lampo, scossa, zoom, glitch… valgono per la loro traccia e per tutto quello che sta sotto;
//  · TRANSIZIONI: il blocco sta sopra un taglio della sua traccia e passa da una clip all'altra; lungo = lenta.
// Lasciati vicino a un bordo si sistemano da soli: centrati sul taglio fra due clip, all'inizio o alla fine della
// clip. Poi si allungano dai bordi. Un blocco segue la clip su cui sta (quella che ha sotto il suo centro).
// Qui c'è il catalogo, il calcolo di ogni fotogramma (lo stesso per il monitor e per l'export) e le regole per posarli.
import type { BloccoFx, Clip, Project, Transition } from './tipi';
import { end, newClip, newTransition, passaPer } from './progetto';
import { oggettoSulQuadro } from './traccia';
import { valutaClip } from './automazioni';
import { suonoTransizione } from './suoni';
import { fps } from './timecode';
import { nomeModello, tipoDi } from '../render/transizioni';

export type V3 = [number, number, number];

/** le quantità degli effetti nuovi (colore, particelle, specchi…): ognuna 0 o più, e si sommano come le altre */
export const CAMPI_FX = ['eco', 'duo', 'poster', 'solar', 'termico', 'visore', 'retino', 'muto', 'gocce', 'specchio', 'quadri', 'rullo', 'pesce',
  'raggi', 'bokeh', 'scint', 'anam', 'neve', 'pioggia', 'polvere', 'coriandoli',
  'olo', 'prisma', 'matita', 'tunnel', 'nebbia', 'braci', 'vetro', 'nosegn', 'iride', 'mini', 'esa', 'scan', 'grana', 'nitido', 'censura'] as const;
type CampiFx = { [K in typeof CAMPI_FX[number]]: number };
export interface ZonaCensura { x: number; y: number; w: number; h: number; morbido: number }
/** tetto fisso dello shader; oltre, si copre l'inviluppo di tutte le zone (mai scartarne una) */
export const MAX_CENSURE = 8;

/** come si muove l'immagine in quel fotogramma: tutti gli effetti accesi si sommano qui */
export interface StatoFx extends CampiFx {
  /** ingrandimento (1 = niente) e spostamento in frazioni di quadro, rotazione in radianti */
  zoom: number; dx: number; dy: number; rot: number;
  blur: number; pixel: number; rgb: number; glitch: number; seme: number;
  desat: number; invert: number;
  flash: number; flashCol: V3;
  fade: number; fadeCol: V3;
  luce: number; lucePh: number;
  bande: number; vhs: number;
  // luci
  bagliore: number; flare: number; flarePh: number; arco: number; arcoPh: number; espo: number; neon: number;
  // distorsioni
  onda: number; bolla: number; vortice: number; caleido: number; calore: number; zblur: number;
  /** il centro di zoom e distorsioni (frazioni del quadro, y in basso): quello degli effetti che l'hanno spostato */
  cx: number; cy: number;
  /** dove sta il sole del riflesso d'obiettivo, se l'hai messo tu (NaN = passa da solo in alto) */
  soleX: number; soleY: number;
  /** il colore scelto degli effetti che ne hanno uno (duotone, bokeh, scintille): l'ultimo vince */
  tinta: V3;
  /** seme intero, indipendente da glitch e tempo di riproduzione: uguale in monitor ed export */
  semeGrana: number;
  censure: ZonaCensura[];
}

const neutro = (): StatoFx => ({
  zoom: 1, dx: 0, dy: 0, rot: 0, blur: 0, pixel: 0, rgb: 0, glitch: 0, seme: 0, desat: 0, invert: 0,
  flash: 0, flashCol: [1, 1, 1], fade: 0, fadeCol: [0, 0, 0], luce: 0, lucePh: 0, bande: 0, vhs: 0,
  bagliore: 0, flare: 0, flarePh: 0, arco: 0, arcoPh: 0, espo: 0, neon: 0,
  onda: 0, bolla: 0, vortice: 0, caleido: 0, calore: 0, zblur: 0,
  cx: 0.5, cy: 0.5, soleX: NaN, soleY: NaN, tinta: [1, 0.24, 0.5], semeGrana: 0, censure: [],
  ...(Object.fromEntries(CAMPI_FX.map((k) => [k, 0])) as CampiFx),
});

/** gli effetti che hanno un centro da mettere dove vuoi sul quadro (e da far muovere lungo il blocco) */
const CENTRATI = new Set<Motore>(['zoomColpo', 'zoomLento', 'battito', 'bolla', 'vortice', 'caleido', 'zoomSfocato', 'flare', 'pizzico', 'gocce', 'raggi', 'pesce', 'tunnel', 'irideChiude', 'irideApre', 'censura']);
export const haCentro = (id: string) => { const e = effettoTempo(id); return !!e && CENTRATI.has(e.motore); };

/** le tappe del centro di un effetto in ordine: la partenza, quelle di mezzo, l'arrivo (vuoto se il centro sta fermo) */
export function tappePos(b: BloccoFx): { t: number; pos: [number, number] }[] {
  if (!b.posFine) return [];
  const mezzo = (b.via ?? []).filter((v) => v.t > 0.001 && v.t < 0.999).sort((x, y) => x.t - y.t);
  return [{ t: 0, pos: b.pos ?? [0.5, 0.5] }, ...mezzo, { t: 1, pos: b.posFine }];
}

/** il centro del blocco al fotogramma f: fermo in pos, o in viaggio da pos a posFine passando per le tappe di mezzo
 *  (partenza e arrivo dolci); se segue un oggetto tracciato (con il progetto p) parte da lui e pos è lo scarto */
export function centroBlocco(bl: Clip, f: number, p?: Project): [number, number] {
  const b = bl.fxb!;
  let pos: [number, number] = b.pos ?? [0.5, 0.5];
  const tappe = tappePos(b);
  if (tappe.length) {
    const x = Math.max(0, Math.min(1, (f - bl.start + 0.5) / Math.max(1, bl.len)));
    const ts = tappe.map((t) => t.t);
    pos = [passaPer(ts, tappe.map((t) => t.pos[0]), x), passaPer(ts, tappe.map((t) => t.pos[1]), x)];
  }
  if (b.segue && p) {
    const sorg = p.clips.find((c) => c.id === b.segue);
    const o = sorg && oggettoSulQuadro(p, sorg, f);
    if (o) return [0.5 + o[0] / p.w + (pos[0] - 0.5), 0.5 + o[1] / p.h + (pos[1] - 0.5)];
  }
  return pos;
}

type Motore = 'flash' | 'scossa' | 'camera' | 'zoomColpo' | 'battito' | 'zoomLento' | 'glitch' | 'rgb' | 'negativo' | 'strobo'
  | 'pixel' | 'sfocaEntra' | 'sfocaEsce' | 'dalColore' | 'alColore' | 'luce' | 'bande' | 'bn' | 'tornaColore' | 'vhs'
  | 'bagliore' | 'flare' | 'tremolio' | 'bruciato' | 'arcobaleno' | 'neon' | 'sogno'
  | 'onda' | 'bolla' | 'vortice' | 'caleido' | 'calore' | 'zoomSfocato'
  | 'eco' | 'vibra' | 'raggi' | 'bokeh' | 'scintille' | 'anamorfico' | 'duotone' | 'posterizza' | 'solarizza' | 'termico' | 'visore'
  | 'retino' | 'filmMuto' | 'pizzico' | 'gocce' | 'specchio' | 'quadri' | 'rullo' | 'pesce' | 'neve' | 'pioggia' | 'polvere' | 'coriandoli'
  | 'ologramma' | 'prisma' | 'matita' | 'tunnel' | 'nebbia' | 'braci' | 'vetro' | 'noSegnale' | 'irideChiude' | 'irideApre' | 'miniatura' | 'esagoni' | 'scansione' | 'grana' | 'nitido' | 'censura' | 'clicLive';

export interface ParametroFx { chiave: string; nome: string; min: number; max: number; def: number; passo: number }

export interface EffettoTempo {
  id: string;
  nome: string;
  info: string;
  /** secondi di partenza del blocco */
  durata: number;
  gruppo: 'rapidi' | 'lunghi' | 'luci' | 'distorsioni' | 'colore' | 'particelle';
  motore: Motore;
  /** colore di partenza (lampi e dissolvenze) */
  colore?: string;
  parametri?: readonly ParametroFx[];
}

export const EFFETTI_TEMPO: EffettoTempo[] = [
  { id: 'clicLive', nome: 'Clic animati', info: 'Cerchietti sui clic dei video registrati con i dati del cursore LIVE', durata: 3, gruppo: 'rapidi', motore: 'clicLive', colore: '#ffd54a' },
  { id: 'flash', nome: 'Lampo', info: 'un flash bianco: sul taglio o all\'inizio', durata: 0.5, gruppo: 'rapidi', motore: 'flash', colore: '#ffffff' },
  { id: 'lampoNero', nome: 'Lampo nero', info: 'un battito di ciglia al nero', durata: 0.4, gruppo: 'rapidi', motore: 'flash', colore: '#000000' },
  { id: 'scossa', nome: 'Scossa', info: 'la camera trema per il colpo', durata: 0.5, gruppo: 'rapidi', motore: 'scossa' },
  { id: 'zoomColpo', nome: 'Zoom colpo', info: 'un pugno di zoom a tempo', durata: 0.4, gruppo: 'rapidi', motore: 'zoomColpo' },
  { id: 'glitch', nome: 'Glitch', info: 'righe che saltano, colori che scappano', durata: 0.6, gruppo: 'rapidi', motore: 'glitch' },
  { id: 'rgb', nome: 'Colori sdoppiati', info: 'rosso e blu si separano', durata: 0.5, gruppo: 'rapidi', motore: 'rgb' },
  { id: 'negativo', nome: 'Negativo', info: 'un lampo in negativo', durata: 0.3, gruppo: 'rapidi', motore: 'negativo' },
  { id: 'strobo', nome: 'Stroboscopio', info: 'luci da discoteca', durata: 1, gruppo: 'rapidi', motore: 'strobo' },
  { id: 'pixel', nome: 'Pixel', info: 'da quadrettoni a nitido', durata: 0.8, gruppo: 'rapidi', motore: 'pixel' },
  { id: 'fuoco', nome: 'Messa a fuoco', info: 'da sfocato a nitido', durata: 1, gruppo: 'rapidi', motore: 'sfocaEntra' },
  { id: 'sfoca', nome: 'Sfoca', info: 'da nitido a sfocato', durata: 1, gruppo: 'rapidi', motore: 'sfocaEsce' },
  { id: 'dalNero', nome: 'Dal nero', info: 'l\'immagine esce dal nero', durata: 1, gruppo: 'lunghi', motore: 'dalColore', colore: '#000000' },
  { id: 'alNero', nome: 'Al nero', info: 'l\'immagine va nel nero', durata: 1, gruppo: 'lunghi', motore: 'alColore', colore: '#000000' },
  { id: 'dalBianco', nome: 'Dal bianco', info: 'si apre da una luce bianca', durata: 1, gruppo: 'lunghi', motore: 'dalColore', colore: '#ffffff' },
  { id: 'alBianco', nome: 'Al bianco', info: 'si chiude in una luce bianca', durata: 1, gruppo: 'lunghi', motore: 'alColore', colore: '#ffffff' },
  { id: 'zoomLento', nome: 'Zoom lento', info: 'si avvicina piano piano', durata: 5, gruppo: 'lunghi', motore: 'zoomLento' },
  { id: 'camera', nome: 'Camera a mano', info: 'ondeggia come a spalla', durata: 5, gruppo: 'lunghi', motore: 'camera' },
  { id: 'battito', nome: 'Battito', info: 'zoom a tempo di musica (120 bpm)', durata: 4, gruppo: 'lunghi', motore: 'battito' },
  { id: 'luce', nome: 'Luce calda', info: 'una lama di luce da pellicola', durata: 1.5, gruppo: 'lunghi', motore: 'luce' },
  { id: 'bande', nome: 'Bande cinema', info: 'le bande nere del 2,39:1', durata: 5, gruppo: 'lunghi', motore: 'bande' },
  { id: 'bn', nome: 'Bianco e nero', info: 'toglie il colore per un pezzo', durata: 3, gruppo: 'lunghi', motore: 'bn' },
  { id: 'tornaColore', nome: 'Torna il colore', info: 'dal bianco e nero al colore', durata: 2, gruppo: 'lunghi', motore: 'tornaColore' },
  { id: 'vhs', nome: 'Disturbo VHS', info: 'il nastro che si rovina', durata: 1, gruppo: 'lunghi', motore: 'vhs' },
  { id: 'bagliore', nome: 'Bagliore', info: 'le luci si allargano e brillano', durata: 1, gruppo: 'luci', motore: 'bagliore' },
  { id: 'flare', nome: 'Riflesso d\'obiettivo', info: 'il sole che passa sulla lente', durata: 1.2, gruppo: 'luci', motore: 'flare' },
  { id: 'tremolio', nome: 'Luce che trema', info: 'la corrente che va e viene', durata: 1, gruppo: 'luci', motore: 'tremolio' },
  { id: 'bruciato', nome: 'Sovraesposto', info: 'un colpo di luce che brucia tutto', durata: 0.8, gruppo: 'luci', motore: 'bruciato' },
  { id: 'arcobaleno', nome: 'Luce arcobaleno', info: 'una scia di colori che attraversa', durata: 2, gruppo: 'luci', motore: 'arcobaleno' },
  { id: 'neon', nome: 'Contorni neon', info: 'i bordi si accendono come tubi al neon', durata: 2, gruppo: 'luci', motore: 'neon' },
  { id: 'sogno', nome: 'Sogno', info: 'morbido e luminoso, come un ricordo', durata: 3, gruppo: 'luci', motore: 'sogno' },
  { id: 'onda', nome: 'Onda', info: 'l\'immagine ondeggia come l\'acqua', durata: 1, gruppo: 'distorsioni', motore: 'onda' },
  { id: 'bolla', nome: 'Bolla', info: 'il centro si gonfia come in una lente', durata: 0.8, gruppo: 'distorsioni', motore: 'bolla' },
  { id: 'vortice', nome: 'Vortice', info: 'tutto gira verso il centro', durata: 1, gruppo: 'distorsioni', motore: 'vortice' },
  { id: 'caleido', nome: 'Caleidoscopio', info: 'l\'immagine si specchia a spicchi', durata: 2, gruppo: 'distorsioni', motore: 'caleido' },
  { id: 'calore', nome: 'Aria calda', info: 'il tremolio dell\'asfalto d\'estate', durata: 3, gruppo: 'distorsioni', motore: 'calore' },
  { id: 'zoomSfocato', nome: 'Zoom sfocato', info: 'un colpo verso il centro, con la scia', durata: 0.5, gruppo: 'distorsioni', motore: 'zoomSfocato' },
  // 1.1.2: più rapidi
  { id: 'eco', nome: 'Eco visivo', info: 'un\'immagine fantasma che rincorre la vera', durata: 0.8, gruppo: 'rapidi', motore: 'eco' },
  { id: 'vibra', nome: 'Vibrazione', info: 'un tremito fitto, come sopra un motore', durata: 1, gruppo: 'rapidi', motore: 'vibra' },
  // più luci
  { id: 'raggi', nome: 'Raggi di luce', info: 'raggi che escono da un punto luminoso (mirino sul monitor)', durata: 2, gruppo: 'luci', motore: 'raggi' },
  { id: 'bokeh', nome: 'Bokeh', info: 'cerchi di luce sfocati che fluttuano', durata: 4, gruppo: 'luci', motore: 'bokeh', colore: '#ffd9a0' },
  { id: 'scintille', nome: 'Scintille', info: 'stelline che brillano qua e là', durata: 3, gruppo: 'luci', motore: 'scintille', colore: '#fff2c0' },
  { id: 'anamorfico', nome: 'Lente anamorfica', info: 'le luci si allungano in strisce azzurre, come al cinema', durata: 2, gruppo: 'luci', motore: 'anamorfico' },
  // il colore
  { id: 'duotone', nome: 'Duotone', info: 'due soli colori: ombre scure e luci del colore che scegli', durata: 4, gruppo: 'colore', motore: 'duotone', colore: '#ff3d7f' },
  { id: 'posterizza', nome: 'Posterizza', info: 'pochi colori piatti, come una stampa serigrafica', durata: 3, gruppo: 'colore', motore: 'posterizza' },
  { id: 'solarizza', nome: 'Solarizza', info: 'le luci si invertono, come in camera oscura', durata: 2, gruppo: 'colore', motore: 'solarizza' },
  { id: 'termico', nome: 'Termocamera', info: 'colori di calore: blu freddo, giallo e bianco caldo', durata: 3, gruppo: 'colore', motore: 'termico' },
  { id: 'visore', nome: 'Visore notturno', info: 'verde, grana e righe: si vede al buio', durata: 4, gruppo: 'colore', motore: 'visore' },
  { id: 'retino', nome: 'Retino pop', info: 'puntini da fumetto stampato', durata: 3, gruppo: 'colore', motore: 'retino' },
  { id: 'filmMuto', nome: 'Film muto', info: 'bianco e nero antico con graffi, polvere e sfarfallio', durata: 5, gruppo: 'colore', motore: 'filmMuto' },
  // più distorsioni
  { id: 'pizzico', nome: 'Pizzico', info: 'il centro si stringe come in un imbuto (mirino sul monitor)', durata: 0.8, gruppo: 'distorsioni', motore: 'pizzico' },
  { id: 'gocce', nome: 'Gocce', info: 'cerchi che si allargano dal centro come sull\'acqua', durata: 2, gruppo: 'distorsioni', motore: 'gocce' },
  { id: 'pesce', nome: 'Occhio di pesce', info: 'obiettivo grandangolare che gonfia il centro', durata: 2, gruppo: 'distorsioni', motore: 'pesce' },
  { id: 'specchio', nome: 'Specchio', info: 'metà quadro si riflette sull\'altra metà', durata: 2, gruppo: 'distorsioni', motore: 'specchio' },
  { id: 'quadri', nome: 'Quattro schermi', info: 'l\'immagine si moltiplica in riquadri specchiati', durata: 2, gruppo: 'distorsioni', motore: 'quadri' },
  { id: 'rullo', nome: 'Rullo TV', info: 'l\'immagine scorre in verticale, come un vecchio televisore', durata: 1.5, gruppo: 'distorsioni', motore: 'rullo' },
  // le particelle
  { id: 'neve', nome: 'Neve', info: 'fiocchi che cadono piano', durata: 6, gruppo: 'particelle', motore: 'neve' },
  { id: 'pioggia', nome: 'Pioggia', info: 'pioggia fitta, di traverso', durata: 6, gruppo: 'particelle', motore: 'pioggia' },
  { id: 'polvere', nome: 'Polvere sospesa', info: 'granelli che fluttuano nella luce', durata: 6, gruppo: 'particelle', motore: 'polvere' },
  { id: 'coriandoli', nome: 'Coriandoli', info: 'una pioggia di festa', durata: 4, gruppo: 'particelle', motore: 'coriandoli' },
  // 1.1.3: più particolari
  { id: 'ologramma', nome: 'Ologramma', info: 'azzurro, righe che scorrono e sfarfallio: sembra proiettato', durata: 4, gruppo: 'colore', motore: 'ologramma' },
  { id: 'matita', nome: 'Schizzo a matita', info: 'contorni e tratteggi a matita su carta', durata: 4, gruppo: 'colore', motore: 'matita' },
  { id: 'miniatura', nome: 'Miniatura', info: 'a fuoco solo una fascia, colori pieni: sembra un plastico', durata: 4, gruppo: 'colore', motore: 'miniatura' },
  { id: 'prisma', nome: 'Prisma', info: 'l\'immagine si rompe in schegge coi colori sdoppiati', durata: 1.5, gruppo: 'distorsioni', motore: 'prisma' },
  { id: 'tunnel', nome: 'Tunnel infinito', info: 'l\'immagine dentro l\'immagine, sempre più piccola (mirino sul monitor)', durata: 3, gruppo: 'distorsioni', motore: 'tunnel' },
  { id: 'vetro', nome: 'Vetro smerigliato', info: 'come dietro un vetro rugoso', durata: 3, gruppo: 'distorsioni', motore: 'vetro' },
  { id: 'esagoni', nome: 'Esagoni', info: 'un mosaico di esagoni che va e viene', durata: 1.5, gruppo: 'distorsioni', motore: 'esagoni' },
  { id: 'noSegnale', nome: 'Segnale perso', info: 'barre e neve del televisore che non prende', durata: 1.5, gruppo: 'rapidi', motore: 'noSegnale' },
  { id: 'irideChiude', nome: 'Iride che si chiude', info: 'il cerchio del cinema muto si stringe (mirino sul monitor)', durata: 1.5, gruppo: 'lunghi', motore: 'irideChiude' },
  { id: 'irideApre', nome: 'Iride che si apre', info: 'dal nero il cerchio si allarga (mirino sul monitor)', durata: 1.5, gruppo: 'lunghi', motore: 'irideApre' },
  { id: 'scansione', nome: 'Scansione', info: 'una riga di luce che sale, come uno scanner', durata: 2, gruppo: 'luci', motore: 'scansione' },
  { id: 'nebbia', nome: 'Nebbia', info: 'una foschia che scorre piano', durata: 6, gruppo: 'particelle', motore: 'nebbia' },
  { id: 'braci', nome: 'Braci', info: 'scintille calde che salgono da un fuoco', durata: 5, gruppo: 'particelle', motore: 'braci' },
  { id: 'grana', nome: 'Grana pellicola', info: 'grana fine, senza cambiare tinta o luce; forza = quantità', durata: 5, gruppo: 'colore', motore: 'grana' },
  { id: 'nitido', nome: 'Nitidezza', info: 'rinforza i dettagli senza una passata in più; forza = contrasto dei bordi', durata: 5, gruppo: 'colore', motore: 'nitido' },
  { id: 'censura', nome: 'Censura a mosaico', info: 'quadrettoni in una zona: sposta il mirino o segui un oggetto; verifica sempre il risultato', durata: 5, gruppo: 'distorsioni', motore: 'censura', parametri: [
    { chiave: 'larghezza', nome: 'Larghezza zona', min: 0.02, max: 2, def: 0.25, passo: 0.01 },
    { chiave: 'altezza', nome: 'Altezza zona', min: 0.02, max: 2, def: 0.25, passo: 0.01 },
    { chiave: 'morbido', nome: 'Bordo morbido esterno', min: 0, max: 0.2, def: 0.015, passo: 0.005 },
  ] },
];

export const effettoTempo = (id: string) => EFFETTI_TEMPO.find((e) => e.id === id);

/** vecchi progetti e valori non finiti usano il default; nessun campo salvato viene riscritto */
export function parametroFx(b: BloccoFx, chiave: string): number {
  const c = effettoTempo(b.id)?.parametri?.find((c) => c.chiave === chiave);
  if (!c) return 0;
  const v = b.parametri?.[chiave];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(c.min, Math.min(c.max, v)) : c.def;
}

/** il suono che ogni effetto si porta dietro (quelli lunghi e silenziosi non ne hanno) */
const SUONO_EFFETTO: Record<string, string> = {
  flash: 'zap', lampoNero: 'colpo', scossa: 'impatto', zoomColpo: 'colpo', glitch: 'glitch', rgb: 'zap', negativo: 'colpo',
  pixel: 'glitch', fuoco: 'riverso', sfoca: 'discesa', dalBianco: 'riverso', alBianco: 'riser', battito: 'battito', vhs: 'nastro',
  bagliore: 'riverso', flare: 'zap', tremolio: 'glitch', bruciato: 'riser', zoomSfocato: 'whoosh', onda: 'swish', bolla: 'colpo', vortice: 'whoosh',
  eco: 'riverso', vibra: 'impatto', raggi: 'riser', scintille: 'zap', solarizza: 'glitch', pizzico: 'discesa', gocce: 'swish', quadri: 'colpo',
  specchio: 'swish', rullo: 'nastro', coriandoli: 'zap',
  ologramma: 'ronzio', prisma: 'glitch', tunnel: 'whoosh', esagoni: 'swish', noSegnale: 'glitch', irideChiude: 'discesa', irideApre: 'riverso', scansione: 'ronzio',
};

/** le durate proposte nel contenitore (0 = quella giusta per ogni effetto) */
export const DURATE = [0, 0.5, 1, 2, 5, 10];

// ——— le transizioni a blocchetto ———

/** 'mix', 'dip', 'wipe:119', 'dve:301' → la transizione (la durata la dà il blocco) */
export function transizioneDa(id: string, len = 25): Transition {
  const [tipo, pat] = id.split(':');
  const p = Number(pat) || 1;
  if (tipo === 'mix' || tipo === 'dip') return newTransition(tipo, len);
  const t = newTransition(tipoDi(p), len, p);
  if (t.type === 'wipe') { t.soft = 0.03; t.border = 0.012; } else t.soft = 0;
  return t;
}
export const idTransizione = (t: Transition) => (t.type === 'mix' || t.type === 'dip' ? t.type : `${t.type}:${t.pattern}`);

/** il suono pronto per un blocco (spento: si accende con un clic sull'altoparlante) */
export const suonoDi = (tipo: 'effetto' | 'transizione', id: string) => (tipo === 'effetto' ? SUONO_EFFETTO[id] : suonoTransizione(id));

export function nuovoBlocco(tipo: 'effetto' | 'transizione', id: string): BloccoFx {
  const suono = suonoDi(tipo, id);
  const s = suono ? { suono, audio: false } : {};
  if (tipo === 'effetto') return { tipo, id, forza: 1, colore: effettoTempo(id)?.colore ?? '#ffffff', ...s };
  return { tipo, id, forza: 1, colore: '#000000', tr: transizioneDa(id), ...s };
}

/** cambia modello o effetto a un blocco: il suono segue, se era quello di partenza (o non c'era) */
export function cambiaModello(b: BloccoFx, id: string): BloccoFx {
  const vecchio = suonoDi(b.tipo, b.id), nuovo = suonoDi(b.tipo, id);
  const n: BloccoFx = { ...b, id };
  if (b.tipo === 'transizione') n.tr = { ...transizioneDa(id), reverse: b.tr?.reverse ?? false, curva: b.tr?.curva };
  else n.colore = effettoTempo(id)?.colore ?? b.colore;
  if (!b.suono || b.suono === vecchio) { n.suono = nuovo; n.audio = nuovo ? b.audio ?? false : false; }
  return n;
}

export const nomeBlocco = (b: BloccoFx) => (b.tipo === 'effetto' ? effettoTempo(b.id)?.nome ?? 'Effetto' : b.tr ? nomeModello(b.tr.type, b.tr.pattern) : 'Transizione');

/** durata di partenza in fotogrammi (dur = secondi scelti nel contenitore, 0 = quella dell'effetto) */
export function durataBlocco(p: Project, tipo: 'effetto' | 'transizione', id: string, dur = 0): number {
  const s = dur || (tipo === 'effetto' ? effettoTempo(id)?.durata ?? 1 : id === 'dve:401' || id === 'dve:411' ? 1.2 : 1);
  return Math.max(2, Math.round(s * fps(p.rate)));
}

// ——— i tagli sotto i blocchi ———

const VISIBILI = new Set(['media', 'color', 'bars', 'countdown', 'title']);

export interface Taglio { f: number; track: string; a: Clip | null; b: Clip | null }

export const centro = (c: Clip) => c.start + c.len / 2;

/** i bordi delle clip video (tagli fra due clip, o inizi e fine liberi) fra a e b */
export function tagliFra(p: Project, a: number, b: number, track?: string): Taglio[] {
  const out: Taglio[] = [];
  for (const t of p.tracks) {
    if (t.kind !== 'video' || (track && t.id !== track)) continue;
    const cs = p.clips.filter((c) => c.track === t.id && VISIBILI.has(c.kind));
    const visti = new Set<number>();
    for (const c of cs) {
      for (const f of [c.start, end(c)]) {
        if (f < a || f > b || visti.has(f)) continue;
        visti.add(f);
        out.push({ f, track: t.id, a: cs.find((x) => end(x) === f) ?? null, b: cs.find((x) => x.start === f) ?? null });
      }
    }
  }
  return out;
}

/**
 * Il taglio più vicino a f (entro maxDist fotogrammi): prima i tagli veri fra due clip, poi i bordi liberi.
 * Serve a posare le transizioni (e i lampi) proprio sul taglio.
 */
export function taglioVicino(p: Project, f: number, maxDist: number, track?: string): Taglio | null {
  let best: Taglio | null = null, bd = Infinity;
  for (const t of tagliFra(p, f - maxDist, f + maxDist, track)) {
    // a parità, la traccia più in basso (il girato, non il titolo che ci sta sopra)
    const d = Math.abs(t.f - f) + (t.a && t.b ? 0 : maxDist * 0.35) - p.tracks.findIndex((x) => x.id === t.track) * 0.001;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export interface TransizioneAttiva {
  blocco: Clip;
  tr: Transition;
  track: string;
  /** dove succede davvero (il blocco, stretto alle clip se sono più corte) */
  s: number;
  e: number;
  cut: number;
  a: Clip | null;
  b: Clip | null;
}

/** Il taglio su cui lavora un blocco transizione: quello della sua traccia più vicino al suo centro, preferendo
 *  i tagli veri (fra due clip). Una transizione, un taglio. */
export function taglioDelBlocco(p: Project, bl: Clip): Taglio | null {
  const m = centro(bl);
  let best: Taglio | null = null, bd = Infinity;
  for (const tg of tagliFra(p, bl.start, end(bl), bl.track)) {
    const d = Math.abs(tg.f - m) + (tg.a && tg.b ? 0 : bl.len * 0.3);
    if (d < bd) { bd = d; best = tg; }
  }
  return best;
}

/** i blocchetti FX di una traccia video accesa (quelle spente non fanno niente) */
function blocchiAccesi(p: Project, tipo: 'effetto' | 'transizione', track?: string): Clip[] {
  const accese = new Set(p.tracks.filter((t) => t.kind === 'video' && !t.mute && (!track || t.id === track)).map((t) => t.id));
  return p.clips.filter((c) => c.kind === 'fx' && c.fxb?.tipo === tipo && accese.has(c.track));
}

/** le transizioni dei blocchi, ognuna col suo taglio */
export function transizioniAttive(p: Project): TransizioneAttiva[] {
  const out: TransizioneAttiva[] = [];
  for (const bl of blocchiAccesi(p, 'transizione')) {
    if (!bl.fxb?.tr) continue;
    const tg = taglioDelBlocco(p, bl);
    if (!tg) continue;
    // se le clip sono più corte del blocco, la transizione si stringe dentro di loro
    const s = Math.max(bl.start, tg.a ? tg.a.start : bl.start), e = Math.min(end(bl), tg.b ? end(tg.b) : end(bl));
    if (e - s < 1) continue;
    out.push({ blocco: bl, tr: { ...bl.fxb.tr, len: e - s, forza: bl.fxb.tr.forza ?? bl.fxb.forza }, track: tg.track, s, e, cut: tg.f, a: tg.a, b: tg.b });
  }
  return out;
}

/** il blocco transizione ha un taglio sotto? (senza, è spento: si disegna tratteggiato) */
export const haTaglio = (p: Project, bl: Clip) => tagliFra(p, bl.start, end(bl), bl.track).length > 0;

/** il punto forte del blocco (0..1): sul taglio che ci sta sotto, se c'è; altrimenti proprio all'inizio */
export function piccoDi(p: Project, bl: Clip): number {
  const m = centro(bl);
  let best: number | null = null;
  for (const t of tagliFra(p, bl.start, end(bl), bl.track)) if (best === null || Math.abs(t.f - m) < Math.abs(best - m)) best = t.f;
  return best === null ? 0.06 : Math.max(0, Math.min(1, (best - bl.start) / Math.max(1, bl.len)));
}

/** dove cade il colpo del suono di un blocco (fotogrammi): sul taglio, sul lampo, o alla fine per chi sale */
export function piccoSuono(p: Project, bl: Clip): number {
  const b = bl.fxb!;
  if (b.tipo === 'transizione') { const tg = taglioDelBlocco(p, bl); return tg ? tg.f : centro(bl); }
  const m = effettoTempo(b.id)?.motore;
  if (m === 'alColore' || m === 'sfocaEsce') return end(bl);
  if (m === 'dalColore' || m === 'sfocaEntra' || m === 'pixel') return bl.start;
  return bl.start + piccoDi(p, bl) * bl.len;
}

// ——— il calcolo di ogni fotogramma ———

const dolce = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function hex(c: string): V3 {
  const m = c.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m.slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
/** due luci che si sommano (come due proiettori sullo stesso punto): mai oltre il pieno, il colore si mescola */
function somma(v0: number, c0: V3, v: number, c: V3): [number, V3] {
  const tot = 1 - (1 - Math.min(1, v0)) * (1 - Math.min(1, v));
  const k = v0 + v > 0 ? v / (v0 + v) : 1;
  return [tot, [c0[0] + (c[0] - c0[0]) * k, c0[1] + (c[1] - c0[1]) * k, c0[2] + (c[2] - c0[2]) * k]];
}

/** sale e scende ai bordi del blocco (per gli effetti lunghi: entrano ed escono morbidi) */
const bordi = (x: number, k = 6) => Math.min(1, x * k, (1 - x) * k);

function applica(st: StatoFx, p: Project, bl: Clip, f: number) {
  const b = bl.fxb!;
  const e = effettoTempo(b.id);
  if (!e) return;
  const r = fps(p.rate);
  let x = Math.max(0, Math.min(1, (f - bl.start + 0.5) / Math.max(1, bl.len)));
  // si ripete: la forma dell'effetto (sale, picco, scende…) rifatta n volte nella durata del blocco
  const n = Math.max(1, Math.min(16, Math.round(b.ripeti ?? 1)));
  if (n > 1) x = Math.min(0.9999, (x * n) % 1);
  // Cercare i tagli richiede una scansione delle clip: serve solo a quattro inviluppi.
  const usaPicco = e.motore === 'flash' || e.motore === 'zoomColpo' || e.motore === 'bruciato' || e.motore === 'zoomSfocato';
  const pico = n > 1 ? 0.3 : usaPicco ? piccoDi(p, bl) : 0.06;
  const k = Math.max(0, Math.min(1.5, b.forza));
  const t = f / r, tl = (f - bl.start) / r;
  const col = hex(b.colore || e.colore || '#ffffff');
  switch (e.motore) {
    case 'flash': {
      const pk = pico;
      const env = x < pk ? dolce(x / Math.max(1e-3, pk)) : Math.pow(Math.max(0, 1 - (x - pk) / Math.max(1e-3, 1 - pk)), 1.7);
      [st.flash, st.flashCol] = somma(st.flash, st.flashCol, k * env, col);
      break;
    }
    case 'strobo': {
      [st.flash, st.flashCol] = somma(st.flash, st.flashCol, k * 0.92 * ((Math.floor(f) % 4) < 2 ? 1 : 0) * bordi(x, 10), col);
      break;
    }
    case 'scossa': {
      const a = k * 0.035 * Math.pow(1 - x, 1.4);
      st.dx += a * (Math.sin(t * 71) + 0.6 * Math.sin(t * 43 + 1.3)) / 1.6;
      st.dy += a * (Math.sin(t * 59 + 2.1) + 0.6 * Math.sin(t * 37)) / 1.6;
      st.rot += a * 0.6 * Math.sin(t * 53);
      st.zoom *= 1 + a * 2.4;
      break;
    }
    case 'camera': {
      const a = k * 0.012 * bordi(x);
      st.dx += a * (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 3.1 + 1));
      st.dy += a * (Math.sin(t * 1.3 + 2) + 0.5 * Math.sin(t * 2.7));
      st.rot += a * 0.7 * Math.sin(t * 1.1);
      st.zoom *= 1 + a * 3.2;
      break;
    }
    case 'zoomColpo': {
      const pk = pico < 0.1 ? 0 : pico;
      const y = x - pk;
      const env = y < 0 ? dolce(1 + y / Math.max(0.05, pk)) * 0.4 : y < 0.12 ? dolce(y / 0.12) : 1 - dolce((y - 0.12) / Math.max(0.05, 1 - pk - 0.12));
      st.zoom *= 1 + k * 0.2 * Math.max(0, env);
      break;
    }
    case 'battito': {
      const ph = (tl % 0.5) / 0.5;
      st.zoom *= 1 + k * 0.07 * Math.pow(1 - ph, 4) * bordi(x, 12);
      break;
    }
    case 'zoomLento': st.zoom *= 1 + k * 0.25 * dolce(x); break;
    case 'glitch': {
      st.glitch += k * (hash(Math.floor(f) * 0.37 + bl.start) > 0.35 ? 1 : 0.25) * bordi(x, 8);
      st.seme = Math.floor(f);
      break;
    }
    // gli altri si sommano: due sfocature sfocano di più, due glitch rompono di più (si tiene un tetto nel quadro)
    case 'rgb': st.rgb += k * Math.sin(Math.PI * x); break;
    case 'negativo': st.invert += k * (x < 0.35 ? 1 : 1 - dolce((x - 0.35) / 0.65)); break;
    case 'pixel': st.pixel += k * (1 - dolce(x)); break;
    case 'sfocaEntra': st.blur += k * (1 - dolce(x)); break;
    case 'sfocaEsce': st.blur += k * dolce(x); break;
    case 'dalColore': [st.fade, st.fadeCol] = somma(st.fade, st.fadeCol, k * (1 - dolce(x)), col); break;
    case 'alColore': [st.fade, st.fadeCol] = somma(st.fade, st.fadeCol, k * dolce(x), col); break;
    case 'luce': { const v = k * Math.sin(Math.PI * x); if (v > st.luce) st.lucePh = x; st.luce += v; break; }
    case 'bande': st.bande = Math.max(st.bande, k * Math.min(dolce(x * 5), dolce((1 - x) * 5))); break;
    case 'bn': st.desat += Math.min(1, k) * bordi(x, 8); break;
    case 'tornaColore': st.desat += Math.min(1, k) * (1 - dolce(x)); break;
    case 'vhs': st.vhs += k * Math.sin(Math.PI * x); break;
    // le luci
    case 'bagliore': st.bagliore += k * Math.sin(Math.PI * x); break;
    case 'flare': { const v = k * Math.min(1, Math.sin(Math.PI * x) * 1.6); if (v > st.flare) st.flarePh = x; st.flare += v; break; }
    case 'tremolio': st.espo += k * 0.55 * (hash(Math.floor(f) * 1.7 + bl.start) - 0.6) * bordi(x, 8); break;
    case 'bruciato': { const pk = pico; st.espo += k * 1.6 * (x < pk ? dolce(x / Math.max(0.05, pk)) : Math.pow(1 - (x - pk) / Math.max(0.05, 1 - pk), 1.5)); break; }
    case 'arcobaleno': { const v = k * Math.sin(Math.PI * x); if (v > st.arco) st.arcoPh = x; st.arco += v; break; }
    case 'neon': st.neon += Math.min(1, k) * bordi(x, 8); break;
    case 'sogno': { const v = k * bordi(x, 6); st.bagliore += v * 0.8; st.blur += v * 0.18; break; }
    // le distorsioni
    case 'onda': st.onda += k * Math.sin(Math.PI * x); break;
    case 'bolla': st.bolla += k * Math.sin(Math.PI * Math.min(1, x * 1.2)); break;
    case 'vortice': st.vortice += k * Math.sin(Math.PI * x); break;
    case 'caleido': st.caleido += Math.min(1, k) * bordi(x, 7); break;
    case 'calore': st.calore += k * bordi(x, 6); break;
    case 'zoomSfocato': { const pk = pico < 0.1 ? 0.3 : pico; st.zblur += k * (x < pk ? dolce(x / pk) : 1 - dolce((x - pk) / Math.max(0.05, 1 - pk))); break; }
    // 1.1.2: rapidi e luci nuovi
    case 'eco': st.eco += k * Math.sin(Math.PI * x); break;
    case 'vibra': {
      const a = k * 0.006 * bordi(x, 8);
      st.dx += a * Math.sin(t * 180) ; st.dy += a * Math.sin(t * 151 + 1);
      break;
    }
    case 'raggi': st.raggi += k * bordi(x, 4); break;
    case 'bokeh': st.bokeh += k * bordi(x, 5); st.tinta = col; break;
    case 'scintille': st.scint += k * bordi(x, 6); st.tinta = col; break;
    case 'anamorfico': st.anam += k * bordi(x, 5); break;
    // il colore
    case 'duotone': st.duo += Math.min(1, k) * bordi(x, 6); st.tinta = col; break;
    case 'posterizza': st.poster += Math.min(1, k) * bordi(x, 6); break;
    case 'solarizza': st.solar += Math.min(1, k) * bordi(x, 5); break;
    case 'termico': st.termico += Math.min(1, k) * bordi(x, 6); break;
    case 'visore': st.visore += Math.min(1, k) * bordi(x, 6); break;
    case 'retino': st.retino += Math.min(1, k) * bordi(x, 6); break;
    case 'filmMuto': st.muto += Math.min(1, k) * bordi(x, 6); break;
    // le distorsioni nuove
    case 'pizzico': st.bolla -= k * Math.sin(Math.PI * Math.min(1, x * 1.2)); break;
    case 'gocce': st.gocce += k * bordi(x, 6); break;
    case 'pesce': st.pesce += k * bordi(x, 6); break;
    case 'specchio': st.specchio += Math.min(1, k) * dolce(Math.min(1, x * 4) * Math.min(1, (1 - x) * 4)); break;
    case 'quadri': st.quadri += Math.min(1, k) * dolce(Math.min(1, x * 5) * Math.min(1, (1 - x) * 5)); break;
    case 'rullo': st.rullo += Math.min(1, k) * bordi(x, 6); break;
    // le particelle
    case 'neve': st.neve += k * bordi(x, 8); break;
    case 'pioggia': st.pioggia += k * bordi(x, 8); break;
    case 'polvere': st.polvere += k * bordi(x, 6); break;
    case 'coriandoli': st.coriandoli += k * bordi(x, 10); break;
    // 1.1.3
    case 'ologramma': st.olo += Math.min(1, k) * bordi(x, 6); break;
    case 'matita': st.matita += Math.min(1, k) * bordi(x, 6); break;
    case 'miniatura': st.mini += Math.min(1, k) * bordi(x, 6); break;
    case 'prisma': st.prisma += k * bordi(x, 5); break;
    case 'tunnel': st.tunnel += Math.min(1, k) * bordi(x, 5); break;
    case 'vetro': st.vetro += k * bordi(x, 6); break;
    case 'esagoni': st.esa += Math.min(1, k) * Math.sin(Math.PI * x); break;
    case 'noSegnale': st.nosegn += Math.min(1, k) * bordi(x, 4); break;
    case 'irideChiude': st.iride += k * dolce(x); break;
    case 'irideApre': st.iride += k * (1 - dolce(x)); break;
    case 'scansione': st.scan += k * bordi(x, 6); break;
    case 'nebbia': st.nebbia += k * bordi(x, 6); break;
    case 'braci': st.braci += k * bordi(x, 6); break;
    case 'grana': st.grana += k * bordi(x, 6); st.semeGrana = Math.floor(f); break;
    case 'nitido': st.nitido += k * bordi(x, 6); break;
    case 'censura': {
      if (k <= 0) break;
      // Niente dissolvenza ai bordi temporali: un volto non deve riaffiorare prima della fine.
      const [x, y] = centroBlocco(bl, f, p);
      st.censure.push({ x: Number.isFinite(x) ? x : 0.5, y: Number.isFinite(y) ? y : 0.5,
        w: parametroFx(b, 'larghezza'), h: parametroFx(b, 'altezza'), morbido: parametroFx(b, 'morbido') });
      st.censura += k;
      break;
    }
  }
}

/** gli effetti a tempo della traccia accesi al fotogramma f (null = nessuno: il compositore salta il passaggio).
 *  Valgono per la traccia e per tutto quello che sta sotto (come un livello di regolazione). */
export function statoEffetti(p: Project, f: number, track?: string): StatoFx | null {
  let st: StatoFx | null = null;
  // il centro comune: la media dei centri degli effetti che ce l'hanno (pesata sulla forza)
  let px = 0, py = 0, peso = 0;
  for (const c of blocchiAccesi(p, 'effetto', track)) {
    // I clic si disegnano nel layer della ripresa: non cambiano webcam o tracce sotto.
    if (c.fxb?.id === 'clicLive') continue;
    if (f < c.start || f >= end(c)) continue;
    st ??= neutro();
    // forza e parametri con i keyframe: si valutano per ogni blocco PRIMA dell'inviluppo e della somma
    applica(st, p, valutaClip(c, f - c.start), f);
    const e = effettoTempo(c.fxb!.id);
    if (e && e.motore !== 'censura' && CENTRATI.has(e.motore) && (c.fxb!.pos || c.fxb!.segue)) {
      const [x, y] = centroBlocco(c, f, p);
      const w = Math.max(0.05, c.fxb!.forza);
      if (e.motore === 'flare') { st.soleX = x; st.soleY = y; continue; }
      px += x * w; py += y * w; peso += w;
    }
  }
  if (st && peso > 0) { st.cx = px / peso; st.cy = py / peso; }
  if (st) {
    if (st.censure.length > MAX_CENSURE) {
      const zs = st.censure;
      const x0 = Math.min(...zs.map((z) => z.x - z.w / 2)), x1 = Math.max(...zs.map((z) => z.x + z.w / 2));
      const y0 = Math.min(...zs.map((z) => z.y - z.h / 2)), y1 = Math.max(...zs.map((z) => z.y + z.h / 2));
      st.censure = [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, morbido: Math.max(...zs.map((z) => z.morbido)) }];
    }
    // il tetto: sommati restano belli (oltre, l'immagine si romperebbe e basta)
    st.desat = Math.min(1, st.desat); st.invert = Math.min(1, st.invert);
    st.blur = Math.min(1.6, st.blur); st.pixel = Math.min(1.4, st.pixel); st.rgb = Math.min(1.8, st.rgb);
    st.glitch = Math.min(1.6, st.glitch); st.luce = Math.min(1.5, st.luce); st.vhs = Math.min(1.5, st.vhs);
    st.bagliore = Math.min(2, st.bagliore); st.flare = Math.min(1.5, st.flare); st.arco = Math.min(1.5, st.arco); st.espo = Math.max(-0.8, Math.min(2.5, st.espo));
    st.neon = Math.min(1, st.neon); st.onda = Math.min(2, st.onda); st.bolla = Math.min(1.5, st.bolla); st.vortice = Math.min(2, st.vortice);
    st.caleido = Math.min(1, st.caleido); st.calore = Math.min(2, st.calore); st.zblur = Math.min(1.5, st.zblur);
    st.bolla = Math.max(-1.2, Math.min(1.5, st.bolla));
    for (const k of CAMPI_FX) st[k] = Math.min(2, Math.max(0, st[k]));
  }
  return st;
}

// ——— posare i blocchi ———

/** i blocchi attaccati a una clip (così la seguono quando si sposta e se ne vanno con lei): sulla sua traccia, le
 *  transizioni col taglio all'inizio della clip (o alla fine, se dopo non c'è niente), gli effetti col centro dentro */
export function blocchiDi(p: Project, c: Clip): Clip[] {
  if (c.kind === 'fx') return [];
  return p.clips.filter((b) => {
    if (b.kind !== 'fx' || b.track !== c.track) return false;
    if (b.fxb?.tipo === 'transizione') {
      const tg = taglioDelBlocco(p, b);
      if (tg) return (tg.b ?? tg.a)?.id === c.id;
    }
    return centro(b) >= c.start && centro(b) < end(c);
  });
}

/** la transizione che lavora già su quel taglio (la prima: se ce ne sono più d'una si sommano) */
export function transizioneSul(p: Project, tg: Taglio): Clip | undefined {
  return transizioniSul(p, tg)[0];
}

/** tutte le transizioni di quel taglio: lavorano in catena, una sopra l'altra (si sommano) */
export function transizioniSul(p: Project, tg: Taglio): Clip[] {
  return p.clips.filter((c) => c.kind === 'fx' && c.fxb?.tipo === 'transizione' && c.track === tg.track && c.start <= tg.f && end(c) >= tg.f
    && taglioDelBlocco(p, c)?.f === tg.f);
}

/** nuova durata: le transizioni restano centrate, gli effetti partono dallo stesso punto (o finiscono lì, se
 *  stavano attaccati alla fine della clip) */
export function durataDelBlocco(p: Project, c: Clip, len: number) {
  len = Math.max(2, Math.round(len));
  if (c.fxb?.tipo === 'transizione') c.start = Math.max(0, Math.round(c.start + c.len / 2 - len / 2));
  else {
    const sotto = p.clips.find((x) => x.track === c.track && VISIBILI.has(x.kind) && end(x) === end(c));
    if (sotto && c.start > sotto.start) c.start = Math.max(sotto.start, end(c) - len);
  }
  c.len = len;
}

/** mette un blocco sulla traccia video (da start per len fotogrammi); ritorna la clip nuova. Non copre niente:
 *  i blocchi stanno sopra le clip */
export function posaBlocco(p: Project, b: BloccoFx, start: number, len: number, track?: string | null): Clip {
  start = Math.max(0, Math.round(start));
  len = Math.max(2, Math.round(len));
  const t = track && p.tracks.some((x) => x.id === track && x.kind === 'video') ? track : tracciaPerBlocco(p, start + len / 2);
  const c = newClip('fx', t, start, len, { name: nomeBlocco(b), fxb: structuredClone(b) });
  p.clips.push(c);
  return c;
}

/** la traccia video giusta per un blocco al fotogramma f: la più in alto con una clip lì, se no la più in basso */
export function tracciaPerBlocco(p: Project, f: number, soloTagli = false): string {
  const video = p.tracks.filter((t) => t.kind === 'video');
  for (const t of video) {
    if (t.lock) continue;
    if (soloTagli ? tagliFra(p, f - 1, f + 1, t.id).length : p.clips.some((c) => c.track === t.id && VISIBILI.has(c.kind) && c.start <= f && end(c) > f)) return t.id;
  }
  return (video.filter((t) => !t.lock).pop() ?? video[video.length - 1]).id;
}

export type Dove = 'taglio' | 'inizio' | 'fine' | 'libero';

export interface Posto { start: number; taglio: Taglio | null; dove: Dove }

/**
 * Dove va un blocco lungo len lasciato al fotogramma f sulla traccia: si sistema da solo sul bordo più vicino.
 *  · fra due clip: le transizioni si centrano sul taglio; gli effetti anche, se li lasci proprio lì, altrimenti
 *    finiscono sul taglio (fine della clip a sinistra) o partono dal taglio (inizio di quella a destra);
 *  · sull'inizio o sulla fine libera di una clip: il blocco sta dentro la clip, attaccato al bordo;
 *  · lontano dai bordi: parte da f (le transizioni ci si centrano).
 */
export function postoBlocco(p: Project, tipo: 'effetto' | 'transizione', f: number, len: number, soglia: number, track: string, stretto = false): Posto {
  // lasciato col mouse si attacca a un bordo anche un po' lontano; messo al cursore (stretto) solo se ci sta sopra
  const raggio = stretto ? soglia : tipo === 'transizione' ? Math.max(soglia, len) : Math.max(soglia, len * 0.75);
  let best: Posto | null = null, bd = Infinity;
  const prova = (start: number, taglio: Taglio, dove: Dove, d: number) => { if (d < bd) { bd = d; best = { start: Math.max(0, Math.round(start)), taglio, dove }; } };
  for (const tg of tagliFra(p, f - raggio, f + raggio, track)) {
    const d = Math.abs(tg.f - f);
    if (tg.a && tg.b) {
      if (tipo === 'transizione' || d <= Math.max(soglia * 0.6, len * 0.3)) prova(tg.f - len / 2, tg, 'taglio', d);
      else if (f < tg.f) prova(tg.f - len, tg, 'fine', d);
      else prova(tg.f, tg, 'inizio', d);
    } else if (tg.b) {
      // l'inizio libero: vale se si è sopra la clip (o appena prima)
      if (f >= tg.f - soglia) prova(tg.f, tg, 'inizio', d + (tipo === 'transizione' ? len * 0.2 : 0));
    } else if (tg.a && f <= tg.f + soglia) prova(tg.f - len, tg, 'fine', d + (tipo === 'transizione' ? len * 0.2 : 0));
  }
  if (best) return best;
  return { start: Math.max(0, Math.round(tipo === 'transizione' ? f - len / 2 : f)), taglio: null, dove: 'libero' };
}

/** il vecchio "taglio sotto il blocco" della corsia FX a parte: guardava tutte le tracce, preferendo la più bassa */
function taglioVecchio(p: Project, bl: Clip): Taglio | null {
  const m = centro(bl);
  const video = p.tracks.filter((t) => t.kind === 'video');
  let best: Taglio | null = null, bd = Infinity;
  for (const tg of tagliFra(p, bl.start, end(bl))) {
    const dalBasso = video.length - 1 - video.findIndex((t) => t.id === tg.track);
    const d = Math.abs(tg.f - m) + (tg.a && tg.b ? 0 : bl.len * 0.3) + dalBasso * 0.01;
    if (d < bd) { bd = d; best = tg; }
  }
  return best;
}

/**
 * I progetti di prima: i blocchi della corsia FX a parte scendono sulle tracce video (le transizioni sulla traccia
 * del loro taglio, gli effetti sulla traccia più in alto che hanno sotto, così valgono ancora per tutto) e la
 * corsia sparisce; le transizioni attaccate alle clip video diventano blocchetti.
 */
export function migraBlocchi(p: Project) {
  const video = p.tracks.filter((t) => t.kind === 'video');
  const fx = new Set(p.tracks.filter((t) => t.kind === 'fx').map((t) => t.id));
  if (fx.size && video.length) {
    for (const c of p.clips) {
      if (!fx.has(c.track)) continue;
      if (c.kind !== 'fx' || !c.fxb) { c.track = ''; continue; }
      if (c.fxb.tipo === 'transizione') c.track = taglioVecchio(p, c)?.track ?? tracciaPerBlocco(p, centro(c));
      else {
        const sopra = video.find((t) => p.clips.some((x) => x.track === t.id && VISIBILI.has(x.kind) && x.start < end(c) && end(x) > c.start));
        c.track = (sopra ?? video[video.length - 1]).id;
      }
      // il suono (dalla 1.0.5): i blocchi vecchi restano muti, ma col loro suono pronto da accendere
      if (c.fxb.suono === undefined) { c.fxb.suono = suonoDi(c.fxb.tipo, c.fxb.id); c.fxb.audio = false; }
    }
    p.clips = p.clips.filter((c) => c.track !== '');
    p.tracks = p.tracks.filter((t) => t.kind !== 'fx');
  }
  const vids = new Set(p.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
  for (const c of p.clips.slice()) {
    if (!vids.has(c.track) || c.kind === 'fx') continue;
    if (c.trIn) {
      const tr = c.trIn;
      posaBlocco(p, { tipo: 'transizione', id: idTransizione(tr), forza: 1, colore: tr.color, tr: { ...tr } }, c.start, tr.len, c.track);
      c.trIn = undefined;
    }
    if (c.trOut) {
      const tr = c.trOut;
      posaBlocco(p, { tipo: 'transizione', id: idTransizione(tr), forza: 1, colore: tr.color, tr: { ...tr } }, end(c) - tr.len, tr.len, c.track);
      c.trOut = undefined;
    }
  }
}
