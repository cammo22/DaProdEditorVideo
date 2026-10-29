// Tutti i comandi dell'editor in un posto solo: li usano la tastiera, i menu, la pulsantiera e i tocchi.
// Ogni comando ha il suo tasto; la schermata "Tasti" (F1) si costruisce da qui.
import { store } from './core/store';
import { motore } from './motore';
import * as M from './core/montaggio';
import { clipById, end, isVideoClip, newClip, newTrack, nextTrackName, projectEnd, srcTimeAt, TITLE0, trackOf, uid } from './core/progetto';
import { fps, frameToTc, s2f } from './core/timecode';
import { togliAnimazione } from './core/automazioni';
import { avviso } from './ui/dom';
import { finestraVelocita } from './ui/velocita';
import { finestraMontaggioTesto } from './ui/montaggioTesto';
import type { Clip, Transition } from './core/tipi';
import { STILI_CONTO, type StileConto } from './render/grafica';
import { applicaPresetTitolo, presetTitolo } from './core/generatori';
import { suonoTitolo } from './core/suoni';
import { ANIMAZIONI, animazione, nuovaAnim } from './core/animazioni';
import { MODELLI_HTML, modelloHtml, nuovoHtml } from './core/titoliHtml';
import { blocchiDi, durataBlocco, nomeBlocco, nuovoBlocco, posaBlocco, postoBlocco, taglioVicino, tracciaPerBlocco, transizioniSul } from './core/blocchi';

export interface Azione {
  id: string;
  nome: string;
  gruppo: string;
  tasti?: string[];
  fn: () => void;
  /** descrizione più lunga per l'aiuto */
  info?: string;
}

export const azioni = new Map<string, Azione>();
const reg = (a: Azione) => azioni.set(a.id, a);
/** per chi registra comandi da fuori (app.ts: salva, importa, esporta, le pagine…): così stanno tutti in un posto, coi
 *  loro tasti, nella ricerca (Ctrl+K), nella guida dei tasti e nei menu */
export const registra = reg;
export const esegui = (id: string) => azioni.get(id)?.fn();
reg({ id: 'montaggioTesto', nome: 'Testo · monta dal parlato…', gruppo: 'Montaggio', fn: () => finestraMontaggioTesto() });

/** stato dei modi della centralina */
export const modi = {
  inserisci: false, // false = sovrascrivi (default EDIUS), true = inserisci
  ripple: false,
  snap: true,
  elastico: false,
  zoneSicure: false,
  /** tracce accese (clic sul nome nella timeline): il taglio tocca solo queste e il montaggio va qui */
  attive: new Set<string>(),
  /** durata dei blocchetti FX nuovi in secondi (0 = quella giusta per ogni effetto): i chip del contenitore */
  durataFx: 0,
  /** i blocchetti nuovi nascono col suono acceso? (di partenza no) */
  suonoFx: false,
  /** la forza dei blocchetti nuovi */
  forzaFx: 1,
};

/** un blocchetto nuovo con le impostazioni del contenitore (suono acceso o no, forza) */
export function bloccoNuovo(tipo: 'effetto' | 'transizione', id: string) {
  const b = nuovoBlocco(tipo, id);
  b.forza = modi.forzaFx;
  if (b.suono && modi.suonoFx) b.audio = true;
  return b;
}

/** le tracce accese che esistono ancora (null = nessuna accesa: vale tutto) */
export function tracceAttive(): Set<string> | null {
  const ids = new Set(store.doc.tracks.filter((t) => modi.attive.has(t.id)).map((t) => t.id));
  return ids.size ? ids : null;
}

/**
 * La clip sotto il cursore sulle tracce accese (o su tutte): prima la ripresa video più in alto, poi titoli e
 * generatori, poi l'audio. Così 2, Q e W lavorano sul girato e non sul titolo che ci sta sopra.
 */
function sottoCursore(f: number, kind: 'video' | 'audio' | 'any' = 'any'): Clip | undefined {
  const tr = tracceAttive();
  const p = store.doc;
  const sotto = p.clips.filter((x) => {
    const t = trackOf(p, x.track);
    return x.start <= f && end(x) > f && !t.lock && (!tr || tr.has(t.id)) && (kind === 'any' || t.kind === kind);
  });
  const peso = (c: Clip) => (isVideoClip(c) ? (c.kind === 'media' ? 0 : 1000) : c.kind === 'fx' ? 3000 : 2000) + p.tracks.findIndex((t) => t.id === c.track);
  return sotto.sort((a, b) => peso(a) - peso(b))[0];
}

const r = () => fps(store.doc.rate);
const head = () => Math.round(store.head);

/** il pezzo più corto dell'ultimo taglio (di solito lo scarto): dopo un taglio non resta niente di selezionato, ma "2" subito dopo lo toglie */
let scartoDelTaglio: { id: string; f: number; revisione: number } | null = null;

/** il pezzo che "2" toglierebbe adesso (con le sue legate), finché nessuno ha toccato niente dopo il taglio: la timeline
 *  lo segna in giallo, così si vede cosa sparisce (prima non era evidenziato e sembrava che il 2 togliesse a caso) */
export function scartoInVista(): Set<string> {
  const s = scartoDelTaglio;
  if (!s || store.sel.size || s.f !== head() || s.revisione !== store.revisione) return new Set();
  return store.doc.clips.some((x) => x.id === s.id) ? M.withLinked(store.doc, [s.id]) : new Set();
}

function selezionateOSottoCursore(): Set<string> {
  if (store.sel.size) return M.withLinked(store.doc, store.sel);
  const s = scartoDelTaglio;
  if (s && s.f === head() && s.revisione === store.revisione) {
    const c = store.doc.clips.find((x) => x.id === s.id);
    if (c) return M.withLinked(store.doc, [c.id]);
  }
  const c = sottoCursore(head());
  return c ? M.withLinked(store.doc, [c.id]) : new Set();
}

/** dopo un'eliminazione si seleziona la clip che viene dopo (così 2, 2, 2 pulisce di seguito) */
function eliminaESeleziona(label: string, ids: Set<string>, ripple: boolean): number {
  const p0 = store.doc;
  const tolte = p0.clips.filter((c) => ids.has(c.id));
  const ordine = (c: Clip) => p0.tracks.findIndex((t) => t.id === c.track);
  const rif = tolte.slice().sort((a, b) => ordine(a) - ordine(b) || a.start - b.start)[0];
  const n = store.edit(label, (p) => M.deleteClips(p, ids, ripple));
  const dopo = rif ? M.clipDopo(store.doc, rif.track, rif.start) : undefined;
  store.select(dopo ? M.withLinked(store.doc, [dopo.id]) : []);
  return n;
}

// ——— i tasti numerici: la tua centralina ———
/**
 * Chi taglia il tasto 1, in questo ordine: le tracce accese, se no le clip scelte che stanno sotto il cursore (con
 * quelle legate), se no solo la clip più in alto sotto il cursore (con quelle legate). Mai "tutto" da solo.
 */
function bersagliDelTaglio(f: number): { ids: Set<string> | null; tracce: Set<string> | null; chi: string } {
  const p = store.doc;
  const sotto = (c: Clip) => c.start < f && end(c) > f && M.solida(c) && !trackOf(p, c.track).lock;
  // le tracce accese (clic sul nome) sono una scelta esplicita: valgono sopra a tutto
  const tr = tracceAttive();
  if (tr) return { ids: null, tracce: tr, chi: 'le tracce accese' };
  if (store.sel.size) {
    const scelte = M.withLinked(p, store.sel);
    const dentro = p.clips.filter((c) => scelte.has(c.id) && sotto(c));
    if (dentro.length) return { ids: new Set(dentro.map((c) => c.id)), tracce: null, chi: 'la selezione' };
  }
  const c = sottoCursore(f);
  return { ids: c && sotto(c) ? M.withLinked(p, [c.id]) : new Set(), tracce: null, chi: 'la clip sotto il cursore' };
}

function tagliaOra(f: number, ids: Set<string> | null, tracce: Set<string> | null, chi: string) {
  const destre = store.edit('Taglia', (p) => M.splitAt(p, f, tracce, ids));
  if (!destre.length) { avviso(tracce ? 'Sulle tracce accese non c\'è niente sotto il cursore' : 'Nessuna clip sotto il cursore da tagliare', 'info', 1400); return; }
  // il pezzo più corto della ripresa più in alto (prima le riprese video, poi titoli e generatori, poi l'audio):
  // è quasi sempre lo scarto
  const p = store.doc;
  const peso = (c: Clip) => (isVideoClip(c) ? (c.kind === 'media' ? 0 : 1000) : 2000) + p.tracks.findIndex((t) => t.id === c.track);
  const dx = destre.map((id) => clipById(p, id)!).filter(Boolean).sort((a, b) => peso(a) - peso(b))[0];
  const sx = p.clips.find((c) => c.track === dx.track && end(c) === f && c.id !== dx.id && M.solida(c));
  const corto = sx && f - sx.start < dx.len ? sx : dx;
  // niente resta selezionato: si può cliccare subito la clip che si vuole. Il pezzo più corto si ricorda solo per il "2".
  store.select([]);
  scartoDelTaglio = { id: corto.id, f, revisione: store.revisione };
  avviso(`✂ Taglio a ${frameToTc(f, p.rate, p.drop)} (${chi}) · 2 toglie il pezzo ${corto === dx ? 'di destra' : 'di sinistra'} (il più corto)`, 'tasto', 2000);
}

reg({
  id: 'taglia', nome: 'Taglia al cursore', gruppo: 'Montaggio', tasti: ['1', 'C'],
  info: 'Taglia sotto il cursore solo quello che hai scelto: le tracce accese, se no le clip selezionate, se no la clip più in alto lì sotto (con la sua audio legata). Poi non lascia niente selezionato (puoi cliccare subito la clip che vuoi): se premi 2 subito dopo, sparisce il pezzo più corto.',
  fn: () => { const f = head(); const b = bersagliDelTaglio(f); tagliaOra(f, b.ids, b.tracce, b.chi); },
});
reg({
  id: 'tagliaTutto', nome: 'Taglia tutte le tracce al cursore', gruppo: 'Montaggio', tasti: ['Shift+C'],
  info: 'Taglia in un colpo tutte le clip sotto il cursore, su tutte le tracce non bloccate.',
  fn: () => tagliaOra(head(), null, null, 'tutte le tracce'),
});
reg({
  id: 'elimina', nome: 'Elimina clip', gruppo: 'Montaggio', tasti: ['2', 'Delete', 'Backspace'],
  info: 'Toglie le clip selezionate lasciando il buco, poi seleziona quella dopo. Senza selezione toglie la clip più in alto sotto il cursore.',
  fn: () => {
    const ids = selezionateOSottoCursore();
    if (!ids.size) { avviso('Seleziona una clip (clic) e premi 2', 'info'); return; }
    const n = eliminaESeleziona('Elimina', ids, modi.ripple);
    avviso(`🗑 ${n} clip ${modi.ripple ? 'eliminate e buco chiuso' : 'eliminate'}`, 'tasto', 1200);
  },
});
reg({
  id: 'eliminaChiudi', nome: 'Elimina e chiudi il buco', gruppo: 'Montaggio', tasti: ['3', 'Shift+Delete', 'Alt+Delete'],
  info: 'Toglie le clip e fa scorrere indietro quelle dopo (ripple delete), poi seleziona quella dopo.',
  fn: () => {
    const ids = selezionateOSottoCursore();
    if (!ids.size) { avviso('Seleziona una clip e premi 3', 'info'); return; }
    const n = eliminaESeleziona('Elimina e chiudi', ids, true);
    avviso(`⇤ ${n} clip eliminate, buco chiuso`, 'tasto', 1200);
  },
});
reg({
  id: 'clipUnica', nome: 'Rendi clip unica', gruppo: 'Montaggio', tasti: ['Ctrl+Alt+U'],
  info: 'Le clip scelte (video e audio, con tutti i loro tagli, effetti e volumi) diventano una clip sola: il pezzo si rende in un file nuovo (cartella "Clip uniche") e al suo posto resta una clip col suo audio legato. Ctrl+Z torna indietro.',
  fn: () => { if (!store.sel.size) { avviso('Scegli le clip da rendere una sola (Shift+clic o riquadro)', 'info', 2600); return; } const sel = [...store.sel]; void import('./ui/clipUnica').then((m) => m.rendiClipUnica(sel)); },
});
reg({
  id: 'separa', nome: 'Separa / unisci (gruppi di clip)', gruppo: 'Montaggio', tasti: ['S', '4', 'Alt+Y'],
  info: 'Un gruppo selezionato si separa (audio e video vanno ognuno per conto suo). Più clip o più gruppi selezionati diventano un gruppo solo che si muove insieme.',
  fn: () => {
    if (!store.sel.size) { avviso('Seleziona le clip: una per separarla, più d\'una (Shift+clic o riquadro) per unirle', 'info', 2600); return; }
    const n = store.sel.size;
    const cs = store.doc.clips.filter((c) => store.sel.has(c.id));
    const unGruppo = new Set(cs.map((c) => c.link ?? '∅' + c.id)).size === 1 && !!cs[0]?.link;
    if (!unGruppo && cs.length < 2) { avviso('Per unire seleziona almeno due clip (Shift+clic o riquadro)', 'info', 2200); return; }
    const esito = store.edit('Separa / unisci', (p) => M.toggleLink(p, store.sel));
    // separate: nessuna clip resta scelta, così si va a prendere subito quella che serve (unite: il gruppo nuovo resta scelto)
    if (esito === 'separati') store.select([]);
    avviso(esito === 'separati' ? '⛓ Separate: ora ogni clip si muove da sola' : `⛓ Unite: ${n} clip si muovono insieme`, 'tasto');
  },
});
/** Q e W: via lo scarto da un lato del cursore (le clip selezionate, o quella sotto il cursore con la sua legata) */
export function eliminaLato(lato: 'sinistra' | 'destra', f = head(), clip?: Clip) {
  const p = store.doc;
  let ids: Set<string>;
  if (clip) ids = M.withLinked(p, [clip.id]);
  else if ([...store.sel].some((id) => { const c = clipById(p, id); return c && c.start < f && end(c) > f; })) ids = M.withLinked(p, store.sel);
  else { const c = sottoCursore(f); ids = c ? M.withLinked(p, [c.id]) : new Set(); }
  if (!ids.size) { avviso('Metti il cursore dentro una clip', 'info'); return; }
  const n = store.edit(lato === 'sinistra' ? 'Elimina a sinistra' : 'Elimina a destra', (pp) => M.eliminaLato(pp, ids, f, lato, modi.ripple));
  if (!n) { avviso('Il cursore deve stare dentro la clip', 'info'); return; }
  store.select([...ids].filter((id) => clipById(store.doc, id)));
  if (lato === 'sinistra' && modi.ripple) {
    const c = clipById(store.doc, [...ids][0]);
    if (c) store.setHead(c.start);
  }
  avviso(lato === 'sinistra' ? '⇤ Tolto lo scarto a sinistra' : '⇥ Tolto lo scarto a destra', 'tasto', 1200);
}
reg({ id: 'eliminaSinistra', nome: 'Elimina lo scarto a sinistra del cursore', gruppo: 'Montaggio', tasti: ['Q'], info: 'La clip sotto il cursore (o quella selezionata) perde la parte prima del cursore. Col ripple il buco si chiude.', fn: () => eliminaLato('sinistra') });
reg({ id: 'eliminaDestra', nome: 'Elimina lo scarto a destra del cursore', gruppo: 'Montaggio', tasti: ['W'], info: 'La clip sotto il cursore (o quella selezionata) perde la parte dopo il cursore.', fn: () => eliminaLato('destra') });
reg({
  id: 'dissolvenza', nome: 'Dissolvenza sul taglio', gruppo: 'Montaggio', tasti: ['5', 'Ctrl+P'],
  info: 'Un blocchetto di dissolvenza sopra il taglio più vicino al cursore. Premi di nuovo per toglierla.',
  fn: () => applicaTransizione('mix'),
});
reg({
  id: 'tendina', nome: 'Tendina sul taglio', gruppo: 'Montaggio', tasti: ['6'],
  fn: () => applicaTransizione('wipe', 1),
});
reg({
  id: 'passaggioNero', nome: 'Passaggio al nero sul taglio', gruppo: 'Montaggio', tasti: ['7'],
  fn: () => applicaTransizione('dip'),
});
reg({
  id: 'dissolviInOut', nome: 'Dissolvenza in apertura e chiusura', gruppo: 'Montaggio', tasti: ['8'],
  info: 'Entra dal nero e esce nel nero (video) o dal silenzio (audio), un secondo per parte.',
  fn: () => {
    const ids = selezionateOSottoCursore();
    if (!ids.size) return;
    const n = Math.round(r());
    store.edit('Dissolvenza in/out', (p) => { for (const c of p.clips) if (ids.has(c.id)) { const on = c.fadeIn > 0 || c.fadeOut > 0; c.fadeIn = on ? 0 : Math.min(n, Math.floor(c.len / 2)); c.fadeOut = on ? 0 : Math.min(n, Math.floor(c.len / 2)); } });
  },
});

const secondi = (len: number) => (len / r()).toFixed(1).replace('.', ',').replace(',0', '') + ' s';

/**
 * Mette un blocchetto FX sopra le clip. Le transizioni vanno sul taglio più vicino al cursore (o sul bordo della
 * clip scelta); gli effetti al cursore, o sul bordo se il cursore ci sta sopra. La traccia è quella della clip
 * scelta (o quella indicata, o la più in alto con una clip lì). La stessa transizione già su quel taglio si toglie,
 * una diversa si cambia. Ritorna l'id del blocco.
 */
export function mettiBlocco(tipo: 'effetto' | 'transizione', id: string, f = head(), track?: string, inizio?: number): string | null {
  const p = store.doc;
  const len = durataBlocco(p, tipo, id, modi.durataFx);
  let rif = f;
  const scelta = p.clips.find((x) => store.sel.has(x.id) && isVideoClip(x));
  if (tipo === 'transizione' && scelta && track === undefined) rif = Math.abs(f - scelta.start) <= Math.abs(f - end(scelta)) ? scelta.start : end(scelta);
  const soglia = tipo === 'transizione' ? Math.round(r() * 5) : Math.max(2, Math.round(r() * 0.2));
  const tk = track ?? scelta?.track ?? (tipo === 'transizione' ? taglioVicino(p, rif, soglia)?.track : undefined) ?? tracciaPerBlocco(p, rif);
  const tg = taglioVicino(p, rif, soglia, tk);
  if (tipo === 'transizione') {
    if (!tg) { avviso('Non c\'è un taglio vicino al cursore: portalo su un taglio (↑ ↓) o trascina la transizione sopra', 'info', 2600); return null; }
    // sullo stesso taglio le transizioni si sommano; la stessa una seconda volta la toglie
    const gia = transizioniSul(p, tg);
    const uguale = gia.find((c) => c.fxb!.id === id);
    if (uguale) {
      store.edit('Togli transizione', (pp) => { pp.clips = pp.clips.filter((c) => c.id !== uguale.id); });
      avviso(`${nomeBlocco(uguale.fxb!)} tolta`, 'tasto', 1200);
      return null;
    }
    if (gia.length) {
      // la nuova prende la stessa durata e lo stesso posto della prima: lavorano insieme
      const g0 = gia[0];
      const c = store.edit('Somma transizione', (pp) => posaBlocco(pp, bloccoNuovo(tipo, id), g0.start, g0.len, g0.track));
      store.select([c.id]);
      avviso(`✦ ${nomeBlocco(c.fxb!)} si somma a ${gia.map((x) => nomeBlocco(x.fxb!)).join(' + ')}`, 'tasto', 1600);
      return c.id;
    }
  }
  const posto = postoBlocco(p, tipo, rif, len, soglia, tk, tipo === 'effetto');
  const start = inizio ?? posto.start, dove = inizio === undefined ? posto.dove : 'libero';
  const c = store.edit(tipo === 'effetto' ? 'Effetto a tempo' : 'Transizione', (pp) => posaBlocco(pp, bloccoNuovo(tipo, id), start, len, tk));
  store.select([c.id]);
  const dov = dove === 'taglio' ? ' sul taglio' : dove === 'inizio' ? ' all\'inizio della clip' : dove === 'fine' ? ' alla fine della clip' : '';
  avviso(`${tipo === 'effetto' ? '⚡' : '✦'} ${nomeBlocco(c.fxb!)} · ${secondi(len)}${dov}`, 'tasto', 1400);
  return c.id;
}

/** la transizione scelta (tipo e modello) sul taglio più vicino al cursore */
export function applicaTransizione(tipo: Transition['type'], pattern = 1) {
  return mettiBlocco('transizione', tipo === 'mix' || tipo === 'dip' ? tipo : `${tipo}:${pattern}`);
}

// ——— istantanea: il fotogramma diventa un'immagine del contenitore ———
reg({
  id: 'istantanea', nome: 'Istantanea del fotogramma (nel contenitore)', gruppo: 'Montaggio', tasti: ['P'],
  info: 'Fotografa il fotogramma sotto il cursore (Recorder) o della sorgente (Player): finisce nel contenitore come immagine da allungare.',
  fn: () => { void import('./istantanea').then((m) => m.istantanea()); },
});
reg({
  id: 'fermoImmagine', nome: 'Fermo immagine al cursore', gruppo: 'Montaggio', tasti: ['Shift+P'],
  info: 'Istantanea del Recorder inserita al cursore per due secondi: il resto scorre avanti.',
  fn: () => { void import('./istantanea').then((m) => m.istantanea({ fermo: true })); },
});

// ——— annulla e appunti ———
reg({ id: 'annulla', nome: 'Annulla', gruppo: 'Modifica', tasti: ['Ctrl+Z'], fn: () => { const l = store.doUndo(); avviso(l ? `↶ Annullato: ${l}` : 'Niente da annullare', 'info', 1200); } });
reg({ id: 'ripeti', nome: 'Ripeti', gruppo: 'Modifica', tasti: ['Ctrl+Y', 'Ctrl+Shift+Z'], fn: () => { const l = store.doRedo(); avviso(l ? `↷ Ripetuto: ${l}` : 'Niente da ripetere', 'info', 1200); } });

let appunti: Clip[] = [];
/** Duplica incolla subito dopo sulle stesse tracce: le tracce accese non c'entrano */
let incollaSenzaTracce = false;
/** per ogni blocchetto FX copiato, la clip su cui stava: incollando la segue (anche se finisce su un'altra traccia) */
let padreDi = new Map<string, string>();
reg({
  id: 'copia', nome: 'Copia clip', gruppo: 'Modifica', tasti: ['Ctrl+C'],
  fn: () => {
    const p = store.doc;
    const ids = M.withLinked(p, store.sel);
    // gli effetti e le transizioni che stanno sulle clip copiate vanno con loro (prima restavano indietro)
    padreDi = new Map();
    for (const c of p.clips) if (ids.has(c.id) && M.solida(c)) for (const b of blocchiDi(p, c)) { ids.add(b.id); padreDi.set(b.id, c.id); }
    appunti = structuredClone(p.clips.filter((c) => ids.has(c.id)));
    const n = appunti.filter(M.solida).length || appunti.length;
    if (appunti.length) avviso(`${n} clip copiat${n === 1 ? 'a' : 'e'}`, 'info', 1000);
  },
});
reg({
  id: 'tagliaAppunti', nome: 'Taglia clip negli appunti', gruppo: 'Modifica', tasti: ['Ctrl+X'],
  fn: () => { esegui('copia'); if (appunti.length) store.edit('Taglia negli appunti', (p) => M.deleteClips(p, new Set(appunti.map((c) => c.id)), modi.ripple)); },
});
reg({
  id: 'incolla', nome: 'Incolla al cursore', gruppo: 'Modifica', tasti: ['Ctrl+V'],
  info: 'Incolla le clip copiate dove sta il cursore. Se hai scelto una traccia (clic sul suo nome) le incolla in quella traccia; se è occupata, nella più vicina libera.',
  fn: () => {
    if (!appunti.length) return;
    const f = head();
    const min = Math.min(...appunti.map((c) => c.start));
    const accese = incollaSenzaTracce ? null : tracceAttive();
    let spostate = 0;
    const ids = store.edit('Incolla', (p) => {
      const links = new Map<string, string>();
      const daVecchio = new Map<string, Clip>();
      // se hai scelto una traccia (clic sul suo nome) si incolla lì: le clip video su quelle video accese, l'audio su quelle audio accese.
      // Con più tracce accese dello stesso tipo, la prima traccia di origine va sulla prima accesa, la seconda sulla seconda, e così via.
      const doveInColla = new Map<string, string>();
      if (accese) {
        for (const tipo of ['video', 'audio'] as const) {
          const lit = p.tracks.filter((t) => t.kind === tipo && accese.has(t.id) && !t.lock);
          if (!lit.length) continue;
          const origini = p.tracks.map((t) => t.id).filter((id) => appunti.some((c) => c.track === id && (c.kind === 'fx' || isVideoClip(c) ? 'video' : 'audio') === tipo));
          const ignote = [...new Set(appunti.filter((c) => !p.tracks.some((t) => t.id === c.track) && (c.kind === 'fx' || isVideoClip(c) ? 'video' : 'audio') === tipo).map((c) => c.track))];
          [...origini, ...ignote].forEach((id, i) => doveInColla.set(id, lit[Math.min(i, lit.length - 1)].id));
        }
      }
      const nuove = appunti.map((c) => {
        const n = structuredClone(c);
        n.id = uid('c');
        n.start = c.start - min + f;
        if (c.link) { if (!links.has(c.link)) links.set(c.link, uid('l')); n.link = links.get(c.link); }
        const scelta = doveInColla.get(c.track);
        if (scelta) n.track = scelta;
        else if (!p.tracks.some((t) => t.id === n.track)) n.track = p.tracks.find((t) => t.kind === (c.kind === 'fx' || isVideoClip(c) ? 'video' : 'audio'))!.id;
        daVecchio.set(c.id, n);
        return n;
      });
      const set = new Set(nuove.map((c) => c.id));
      if (modi.inserisci) {
        p.clips.push(...nuove);
        const a = Math.min(...nuove.map((c) => c.start)), b = Math.max(...nuove.map((c) => end(c)));
        M.insertSpace(p, a, b - a, new Set(p.tracks.filter((t) => !t.lock).map((t) => t.id)), set);
      } else {
        // niente viene coperto: se la traccia è occupata la clip va su una libera
        for (const c of nuove.filter(M.solida)) {
          const voluta = c.track;
          c.track = M.tracciaLibera(p, trackOf(p, c.track).kind, c.track, c.start, end(c));
          if (accese && c.track !== voluta) spostate++;
          p.clips.push(c);
        }
        // i blocchetti FX stanno sopra le clip: seguono la loro clip (o restano sulla loro traccia)
        for (const [vecchio, n] of daVecchio) {
          if (M.solida(n)) continue;
          const padre = daVecchio.get(padreDi.get(vecchio) ?? '');
          if (padre) n.track = padre.track;
          p.clips.push(n);
        }
      }
      return [...set];
    });
    store.select(ids);
    store.setHead(f + Math.max(...appunti.map((c) => end(c))) - min);
    if (spostate) avviso(`${spostate === 1 ? 'Una clip è finita' : spostate + ' clip sono finite'} su un'altra traccia: quella che avevi scelto era occupata lì`, 'info', 3200);
  },
});
reg({
  id: 'duplica', nome: 'Duplica la clip (subito dopo)', gruppo: 'Modifica', tasti: ['Ctrl+D'],
  info: 'Una copia delle clip scelte (con i loro effetti) attaccata subito dopo, pronta da spostare.',
  fn: () => {
    if (!store.sel.size) { avviso('Scegli una clip da duplicare', 'info', 1400); return; }
    const p = store.doc;
    const ids = M.withLinked(p, store.sel);
    const fine = Math.max(...p.clips.filter((c) => ids.has(c.id) && M.solida(c)).map((c) => end(c)));
    esegui('copia');
    store.setHead(fine);
    incollaSenzaTracce = true;
    try { esegui('incolla'); } finally { incollaSenzaTracce = false; }
  },
});
reg({ id: 'tutto', nome: 'Seleziona tutto', gruppo: 'Modifica', tasti: ['Ctrl+A'], fn: () => store.select(store.doc.clips.map((c) => c.id)) });
reg({ id: 'deseleziona', nome: 'Deseleziona', gruppo: 'Modifica', tasti: ['Escape'], fn: () => store.select([]) });
reg({
  id: 'selezionaDopo', nome: 'Seleziona tutto dopo il cursore', gruppo: 'Modifica', tasti: ['Ctrl+Shift+A'],
  fn: () => store.select(store.doc.clips.filter((c) => c.start >= head()).map((c) => c.id)),
});

// ——— trasporto ———
reg({ id: 'play', nome: 'Play / Stop', gruppo: 'Trasporto', tasti: ['Space'], fn: () => motore.toggle() });
reg({ id: 'shuttleAvanti', nome: 'Shuttle avanti (ripeti per accelerare)', gruppo: 'Trasporto', tasti: ['L'], fn: () => motore.shuttle(1) });
reg({ id: 'shuttleIndietro', nome: 'Shuttle indietro (ripeti per accelerare)', gruppo: 'Trasporto', tasti: ['J'], fn: () => motore.shuttle(-1) });
reg({ id: 'fermo', nome: 'Fermo', gruppo: 'Trasporto', tasti: ['K'], fn: () => motore.stop() });
reg({ id: 'fotoPrec', nome: 'Fotogramma precedente', gruppo: 'Trasporto', tasti: ['ArrowLeft'], fn: () => motore.passo(-1) });
reg({ id: 'fotoSucc', nome: 'Fotogramma successivo', gruppo: 'Trasporto', tasti: ['ArrowRight'], fn: () => motore.passo(1) });
reg({ id: 'secPrec', nome: 'Indietro di 1 secondo', gruppo: 'Trasporto', tasti: ['Shift+ArrowLeft'], fn: () => motore.passo(-Math.round(r())) });
reg({ id: 'secSucc', nome: 'Avanti di 1 secondo', gruppo: 'Trasporto', tasti: ['Shift+ArrowRight'], fn: () => motore.passo(Math.round(r())) });
const puntoMontaggio = (dir: 1 | -1) => {
  if (motore.attivo !== 'recorder') { motore.setMonitor('recorder'); }
  const pts = M.editPoints(store.doc);
  const f = head();
  const t = dir > 0 ? pts.find((x) => x > f) : [...pts].reverse().find((x) => x < f);
  if (t !== undefined) motore.vaiA(t);
};
reg({ id: 'tagloPrec', nome: 'Taglio precedente', gruppo: 'Trasporto', tasti: ['ArrowUp', 'PageUp'], fn: () => puntoMontaggio(-1) });
reg({ id: 'taglioSucc', nome: 'Taglio successivo', gruppo: 'Trasporto', tasti: ['ArrowDown', 'PageDown'], fn: () => puntoMontaggio(1) });
reg({
  id: 'inizio', nome: 'All\'inizio', gruppo: 'Trasporto', tasti: ['Home'],
  fn: () => { if (motore.attivo === 'recorder') motore.vaiA(0); else { const m = store.doc.media.find((x) => x.id === motore.playerMedia); motore.playerVaiA(m?.t0 ?? 0); } },
});
reg({
  id: 'fine', nome: 'Alla fine', gruppo: 'Trasporto', tasti: ['End'],
  fn: () => { if (motore.attivo === 'recorder') motore.vaiA(projectEnd(store.doc)); else { const m = store.doc.media.find((x) => x.id === motore.playerMedia); if (m) motore.playerVaiA(m.duration); } },
});
reg({ id: 'loop', nome: 'Riproduzione in loop (attacco-stacco, o tutto il montaggio)', gruppo: 'Trasporto', tasti: ['Ctrl+L'], fn: () => { motore.loop = !motore.loop; avviso(motore.loop ? '⟳ Loop acceso' : 'Loop spento', 'info', 1000); store.emit('status'); } });
reg({
  id: 'monitor', nome: 'Monitor: sorgente ↔ montaggio', gruppo: 'Trasporto', tasti: ['Tab'],
  info: 'Il monitor mostra il montaggio; con doppio clic su un file del contenitore mostra la sorgente. Tab passa dall\'uno all\'altro.',
  fn: () => { if (motore.attivo === 'recorder' && !motore.playerMedia) { avviso('Doppio clic su un file del contenitore per vederlo nel monitor', 'info'); return; } motore.setMonitor(motore.attivo === 'player' ? 'recorder' : 'player'); },
});

// ——— attacco / stacco ———
function segna(quale: 'in' | 'out') {
  if (motore.attivo === 'player') {
    const m = store.doc.media.find((x) => x.id === motore.playerMedia);
    if (!m) return;
    store.edit(quale === 'in' ? 'Attacco sorgente' : 'Stacco sorgente', () => {
      if (quale === 'in') { m.markIn = motore.playerT; if (m.markOut != null && m.markOut <= m.markIn) m.markOut = null; }
      else { m.markOut = motore.playerT; if (m.markIn != null && m.markIn >= m.markOut) m.markIn = null; }
    });
    return;
  }
  const f = head();
  store.edit(quale === 'in' ? 'Attacco' : 'Stacco', (p) => {
    if (quale === 'in') { p.inF = f; if (p.outF !== null && p.outF <= f) p.outF = null; }
    else { p.outF = f; if (p.inF !== null && p.inF >= f) p.inF = null; }
  });
}
reg({ id: 'segnaIn', nome: 'Segna attacco (IN)', gruppo: 'Attacco e stacco', tasti: ['I'], fn: () => segna('in') });
reg({ id: 'segnaOut', nome: 'Segna stacco (OUT)', gruppo: 'Attacco e stacco', tasti: ['O'], fn: () => segna('out') });
reg({
  id: 'segnaClip', nome: 'Attacco e stacco sulla clip sotto il cursore', gruppo: 'Attacco e stacco', tasti: ['Shift+Q'],
  fn: () => { const c = M.topClipAt(store.doc, head(), 'video') ?? M.topClipAt(store.doc, head()); if (c) store.edit('Segna clip', (p) => { p.inF = c.start; p.outF = end(c); }); },
});
reg({
  id: 'togliInOut', nome: 'Togli attacco e stacco', gruppo: 'Attacco e stacco', tasti: ['Alt+X', 'Ctrl+Shift+X'],
  fn: () => {
    if (motore.attivo === 'player') { const m = store.doc.media.find((x) => x.id === motore.playerMedia); if (m) store.edit('Togli segni sorgente', () => { m.markIn = null; m.markOut = null; }); }
    else store.edit('Togli attacco e stacco', (p) => { p.inF = null; p.outF = null; });
  },
});
reg({
  id: 'vaiIn', nome: 'Vai all\'attacco', gruppo: 'Attacco e stacco', tasti: ['Shift+I'],
  fn: () => { if (motore.attivo === 'player') { const m = store.doc.media.find((x) => x.id === motore.playerMedia); if (m?.markIn != null) motore.playerVaiA(m.markIn); } else if (store.doc.inF !== null) motore.vaiA(store.doc.inF); },
});
reg({
  id: 'vaiOut', nome: 'Vai allo stacco', gruppo: 'Attacco e stacco', tasti: ['Shift+O'],
  fn: () => { if (motore.attivo === 'player') { const m = store.doc.media.find((x) => x.id === motore.playerMedia); if (m?.markOut != null) motore.playerVaiA(m.markOut); } else if (store.doc.outF !== null) motore.vaiA(store.doc.outF); },
});

// ——— montaggio a tre punti (la centralina) ———
/** le tracce che ricevono dalla sorgente: quelle accese, altrimenti V1 e A1-A2 (la "patch" della centralina) */
export function bersagli(): M.Targets {
  const p = store.doc;
  const v = p.tracks.filter((t) => t.kind === 'video' && !t.lock);
  const a = p.tracks.filter((t) => t.kind === 'audio' && !t.lock);
  const tr = tracceAttive();
  if (tr) {
    const av = v.filter((t) => tr.has(t.id)), aa = a.filter((t) => tr.has(t.id));
    return { video: av[av.length - 1]?.id ?? null, audio: aa.slice(0, 2).map((t) => t.id) };
  }
  return { video: v[v.length - 1]?.id ?? null, audio: a.slice(0, 2).map((t) => t.id) };
}

export function montaDalPlayer(mode: M.EditMode) {
  const p = store.doc;
  const m = p.media.find((x) => x.id === motore.playerMedia);
  if (!m) { avviso('Doppio clic su un file del contenitore per aprirlo nel monitor', 'info'); return; }
  const srcIn = m.markIn ?? (motore.attivo === 'player' && m.type !== 'image' ? motore.playerT : m.t0 || 0);
  let srcOut = m.markOut ?? (m.type === 'image' ? srcIn + 5 : m.duration);
  if (srcOut <= srcIn) srcOut = m.type === 'image' ? srcIn + 5 : m.duration;
  let recIn = p.inF ?? head();
  const recOut = p.inF !== null ? p.outF : null;
  // tre punti "all'indietro": solo lo stacco sulla timeline -> la clip finisce lì
  if (p.inF === null && p.outF !== null) {
    const len = s2f(srcOut - srcIn, p.rate);
    recIn = Math.max(0, p.outF - len);
  }
  const tg = bersagli();
  if (!(m.hasVideo && tg.video) && !(m.hasAudio && tg.audio.length)) { avviso('Accendi una traccia del tipo giusto (clic sul nome della traccia)', 'errore'); return; }
  // un solo passo di annulla: il montaggio e la pulizia di attacco/stacco insieme
  const ids = store.edit(mode === 'insert' ? 'Inserisci' : 'Sovrascrivi', (pp) => {
    const r = M.placeSource(pp, { mediaId: m.id, srcIn, srcOut }, recIn, recOut, tg, mode);
    if (r.length) { pp.inF = null; pp.outF = null; }
    return r;
  });
  if (!ids.length) return;
  const nuove = ids.map((id) => clipById(store.doc, id)!).filter(Boolean);
  const fine = Math.max(...nuove.map((c) => end(c)));
  store.select(ids);
  ultimoMontaggio = { a: recIn, b: fine };
  motore.setMonitor('recorder');
  store.setHead(fine);
  avviso(`${mode === 'insert' ? '⤵ Inserito' : '⬇ Sovrascritto'} ${m.name} · ${frameToTc(fine - recIn, p.rate, p.drop)}`, 'tasto');
}
let ultimoMontaggio: { a: number; b: number } | null = null;

reg({ id: 'inserisci', nome: 'Inserisci dalla sorgente', gruppo: 'Centralina', tasti: [',', '['], info: 'Montaggio a tre punti: la sorgente entra al cursore e sposta avanti il resto.', fn: () => montaDalPlayer('insert') });
reg({ id: 'sovrascrivi', nome: 'Sovrascrivi dalla sorgente', gruppo: 'Centralina', tasti: ['.', ']'], info: 'Montaggio a tre punti: la sorgente copre quello che c\'è sotto (l\'unico comando che copre).', fn: () => montaDalPlayer('overwrite') });
reg({
  id: 'velocita', nome: 'Velocità della clip…', gruppo: 'Montaggio', tasti: ['Alt+E'],
  info: 'Velocizza o rallenta la clip selezionata (o quella sotto il cursore): la voce resta naturale e, se rallenti molto, il movimento si ricostruisce fluido.',
  fn: () => finestraVelocita(selezionateOSottoCursore()),
});
reg({ id: 'edit', nome: 'EDIT (nel modo attivo)', gruppo: 'Centralina', tasti: ['E', 'Enter'], fn: () => montaDalPlayer(modi.inserisci ? 'insert' : 'overwrite') });
reg({
  id: 'rivedi', nome: 'Rivedi l\'ultimo montaggio (preroll)', gruppo: 'Centralina', tasti: ['Shift+R'],
  fn: () => { if (ultimoMontaggio) motore.rivedi(ultimoMontaggio.a, ultimoMontaggio.b); else if (store.doc.inF !== null) motore.rivedi(store.doc.inF, store.doc.outF ?? store.doc.inF); },
});
reg({
  id: 'solleva', nome: 'Solleva (lift) attacco-stacco', gruppo: 'Centralina', tasti: ['Z'],
  fn: () => { const p = store.doc; if (p.inF === null || p.outF === null) { avviso('Segna attacco (I) e stacco (O) sulla timeline', 'info'); return; } store.edit('Solleva', (pp) => M.lift(pp, p.inF!, p.outF!)); avviso('⇡ Sollevato: resta il buco', 'tasto'); },
});
reg({
  id: 'estrai', nome: 'Estrai (extract) attacco-stacco', gruppo: 'Centralina', tasti: ['X'],
  fn: () => {
    const p = store.doc;
    if (p.inF === null || p.outF === null) { avviso('Segna attacco (I) e stacco (O) sulla timeline', 'info'); return; }
    const a = p.inF, b = p.outF;
    store.edit('Estrai', (pp) => { M.extract(pp, a, b); pp.outF = null; });
    store.setHead(a);
    avviso('⇤ Estratto: il buco si è chiuso su tutte le tracce', 'tasto');
  },
});
reg({ id: 'modoInserisci', nome: 'Modo libero / inserisci', gruppo: 'Centralina', tasti: ['Insert', 'Alt+I'], fn: () => { modi.inserisci = !modi.inserisci; avviso(modi.inserisci ? 'Modo INSERISCI: la clip che lasci fa spazio spostando avanti il resto' : 'Modo LIBERO: la clip che sposti o lasci non copre niente', 'info', 2200); store.emit('status'); } });
reg({ id: 'ripple', nome: 'Ripple (elimina e trim chiudono i buchi)', gruppo: 'Centralina', tasti: ['R'], fn: () => { modi.ripple = !modi.ripple; avviso(modi.ripple ? 'Ripple ACCESO' : 'Ripple spento', 'info', 1000); store.emit('status'); } });
reg({ id: 'snap', nome: 'Calamita (aggancio)', gruppo: 'Centralina', tasti: ['N'], fn: () => { modi.snap = !modi.snap; avviso(modi.snap ? 'Calamita accesa' : 'Calamita spenta', 'info', 1000); store.emit('status'); } });
reg({ id: 'elastico', nome: 'Linea della trasparenza sui video', gruppo: 'Centralina', tasti: ['B'], fn: () => { modi.elastico = !modi.elastico; avviso(modi.elastico ? 'Trasparenza: clic sul video per un punto, tiralo giù per sfumare (Alt+clic lo toglie)' : 'Linea della trasparenza nascosta', 'info', 2400); store.emit('status', 'view'); } });
reg({
  id: 'abbina', nome: 'Abbina fotogramma (match frame)', gruppo: 'Centralina', tasti: ['F'],
  fn: () => {
    const c = M.topClipAt(store.doc, head(), 'video') ?? M.topClipAt(store.doc, head());
    if (!c?.media) { avviso('Sotto il cursore non c\'è una sorgente', 'info'); return; }
    // la sorgente allo stesso fotogramma anche nelle clip accelerate o rallentate
    const t = srcTimeAt(store.doc, c, head());
    motore.caricaPlayer(c.media, t);
    motore.setMonitor('player');
    avviso('La sorgente nel monitor allo stesso fotogramma (Tab per tornare al montaggio)', 'info');
  },
});
reg({
  id: 'marcatore', nome: 'Marcatore al cursore', gruppo: 'Centralina', tasti: ['M'],
  fn: () => {
    const f = head();
    const esiste = store.doc.markers.find((m) => m.f === f);
    store.edit(esiste ? 'Togli marcatore' : 'Marcatore', (p) => {
      if (esiste) p.markers = p.markers.filter((m) => m !== esiste);
      else p.markers.push({ id: uid('k'), f, name: 'Marcatore ' + (p.markers.length + 1), color: '#ffd54a' });
    });
  },
});
reg({
  id: 'estendi', nome: 'Estendi il taglio al cursore (extend)', gruppo: 'Centralina', tasti: ['Ctrl+E'],
  info: 'Porta il bordo più vicino della clip selezionata fino al cursore.',
  fn: () => {
    const c = store.doc.clips.find((x) => store.sel.has(x.id));
    if (!c) return;
    const f = head();
    const edge = Math.abs(f - c.start) < Math.abs(f - end(c)) ? 'in' : 'out';
    const d = edge === 'in' ? f - c.start : f - end(c);
    store.edit('Estendi', (p) => M.trimClip(p, c.id, edge, d, { ripple: modi.ripple, linked: true }));
  },
});
reg({
  id: 'slipSx', nome: 'Slip di un fotogramma indietro', gruppo: 'Centralina', tasti: ['Alt+ArrowLeft'],
  fn: () => { if (store.sel.size) store.edit('Slip', (p) => M.slipClip(p, M.withLinked(p, store.sel), -1)); },
});
reg({
  id: 'slipDx', nome: 'Slip di un fotogramma avanti', gruppo: 'Centralina', tasti: ['Alt+ArrowRight'],
  fn: () => { if (store.sel.size) store.edit('Slip', (p) => M.slipClip(p, M.withLinked(p, store.sel), 1)); },
});
reg({
  id: 'nudgeSx', nome: 'Sposta la clip di un fotogramma a sinistra', gruppo: 'Centralina', tasti: ['Ctrl+ArrowLeft'],
  fn: () => { if (store.sel.size) store.edit('Sposta', (p) => M.moveClips(p, M.withLinked(p, store.sel), -1, 0, 'video', 'libero')); },
});
reg({
  id: 'nudgeDx', nome: 'Sposta la clip di un fotogramma a destra', gruppo: 'Centralina', tasti: ['Ctrl+ArrowRight'],
  fn: () => { if (store.sel.size) store.edit('Sposta', (p) => M.moveClips(p, M.withLinked(p, store.sel), 1, 0, 'video', 'libero')); },
});

// ——— trasparenza al volo ———
function opacitaSel(delta: number) {
  const ids = [...store.sel].filter((id) => { const c = clipById(store.doc, id); return c && isVideoClip(c); });
  if (!ids.length) { avviso('Seleziona una clip video', 'info', 1000); return; }
  store.edit('Trasparenza', (p) => { for (const c of p.clips) if (ids.includes(c.id)) { c.opacity = Math.max(0, Math.min(1, Math.round((c.opacity + delta) * 20) / 20)); c.opKeys = []; togliAnimazione(c, 'opacity'); } });
  const c = clipById(store.doc, ids[0])!;
  avviso(`Opacità ${Math.round(c.opacity * 100)}%`, 'tasto', 800);
}
reg({ id: 'opacitaMeno', nome: 'Trasparenza: meno opaca (−10%)', gruppo: 'Livelli', tasti: ['Alt+ArrowDown'], fn: () => opacitaSel(-0.1) });
reg({ id: 'opacitaPiu', nome: 'Trasparenza: più opaca (+10%)', gruppo: 'Livelli', tasti: ['Alt+ArrowUp'], fn: () => opacitaSel(0.1) });
reg({
  id: 'tracciaV', nome: 'Aggiungi traccia video', gruppo: 'Livelli', tasti: ['Ctrl+Alt+V'],
  fn: () => store.edit('Traccia video', (p) => { p.tracks.unshift(newTrack('video', nextTrackName(p, 'video'))); }),
});
reg({
  id: 'tracciaA', nome: 'Aggiungi traccia audio', gruppo: 'Livelli', tasti: ['Ctrl+Alt+A'],
  fn: () => store.edit('Traccia audio', (p) => { p.tracks.push(newTrack('audio', nextTrackName(p, 'audio'))); }),
});

// ——— generatori (le macchine della sala) ———
export function inserisciGeneratore(kind: 'bars' | 'color' | 'countdown' | 'title' | 'nero' | 'anim' | 'html', f = head(), trackId?: string, opz: { conto?: { stile: StileConto; secondi: number }; titolo?: string; anim?: string; html?: string } = {}) {
  const conto = opz.conto ?? { stile: 'pellicola' as StileConto, secondi: 5 };
  const p = store.doc;
  const rr = r();
  const v1 = p.tracks.filter((t) => t.kind === 'video' && !t.lock).slice(-1)[0]?.id ?? null;
  const a1 = p.tracks.find((t) => t.kind === 'audio' && !t.lock)?.id ?? null;
  // come i generatori della sala: entrano al cursore su una traccia libera, e non coprono niente
  const ids = store.edit('Generatore', (pp) => {
    const out: string[] = [];
    const tv = (len: number, pref: string | null = trackId ?? v1) => M.tracciaLibera(pp, 'video', pref, f, f + len);
    const ta = (len: number) => M.tracciaLibera(pp, 'audio', a1, f, f + len);
    if (kind === 'bars') {
      const len = Math.round(rr * 10);
      const l = uid('l');
      const c = newClip('bars', tv(len), f, len, { name: 'Barre colore SMPTE', gen: { bars: 'smpte' }, link: l }); pp.clips.push(c); out.push(c.id);
      const t = newClip('tone', ta(len), f, len, { name: 'Tono 1 kHz −18 dBFS', gen: { freq: 1000, level: -18 }, link: l }); pp.clips.push(t); out.push(t.id);
    } else if (kind === 'countdown') {
      // da N a 1, un numero al secondo, col bip a ogni numero dentro la clip (una riga sola, niente clip audio)
      const len = Math.round(rr * conto.secondi);
      const nome = STILI_CONTO.find((x) => x.id === conto.stile)?.nome ?? 'Countdown';
      const c = newClip('countdown', tv(len), f, len, { name: `Countdown ${nome} ${conto.secondi}…1`, gen: { conto: conto.stile }, sfx: { suono: 'bip', audio: true, volume: -8 } }); pp.clips.push(c); out.push(c.id);
    } else if (kind === 'anim') {
      // un'animazione del catalogo: un titolo con dentro il disegno animato; i fondi (che riempiono il quadro) vanno sulla traccia più in basso
      const an = animazione(opz.anim ?? 'lt-barra') ?? ANIMAZIONI[0];
      const len = Math.max(1, Math.round(rr * an.durata));
      const pref = trackId ?? (an.fondo ? v1 : pp.tracks.find((t) => t.kind === 'video' && !t.lock)?.id ?? null);
      const n0 = pp.tracks.length;
      const tid = tv(len, pref);
      // una traccia nuova nasce in cima: ma un fondo va sotto tutte le altre
      if (an.fondo && !trackId && pp.tracks.length > n0) {
        const [nt] = pp.tracks.splice(pp.tracks.findIndex((t) => t.id === tid), 1);
        const ultimo = pp.tracks.reduce((m, t, k) => (t.kind === 'video' ? k : m), -1);
        pp.tracks.splice(ultimo + 1, 0, nt);
      }
      const c = newClip('title', tid, f, len, { name: an.nome, gen: { anim: nuovaAnim(an.id) } });
      pp.clips.push(c); out.push(c.id);
    } else if (kind === 'html') {
      // un titolo animato HTML: una clip titolo con dentro il modello (testi, colori e tempi si cambiano dalle Proprietà)
      const mo = modelloHtml(opz.html ?? 'neon') ?? MODELLI_HTML[0];
      const len = Math.max(1, Math.round(rr * mo.durata));
      const c = newClip('title', tv(len, trackId ?? pp.tracks.find((t) => t.kind === 'video' && !t.lock)?.id ?? null), f, len, { name: mo.nome, gen: { html: nuovoHtml(mo.id) } });
      pp.clips.push(c); out.push(c.id);
    } else if (kind === 'title') {
      const len = Math.round(rr * 5 * (opz.titolo ? presetTitolo(opz.titolo)?.volte ?? 1 : 1));
      // i titoli stanno sopra: si parte dalla traccia video più alta
      const c = newClip('title', tv(len, trackId ?? pp.tracks.find((t) => t.kind === 'video' && !t.lock)?.id ?? null), f, len, { name: 'Titolo', gen: { title: { ...TITLE0 } } });
      if (opz.titolo) applicaPresetTitolo(c, opz.titolo);
      // il suono del titolo sta dentro la clip, spento: si accende dall'altoparlante (come gli FX)
      c.sfx = { suono: suonoTitolo(c.gen?.title?.style), audio: false };
      pp.clips.push(c); out.push(c.id);
    } else {
      const len = Math.round(rr * 5);
      const c = newClip('color', tv(len), f, len, { name: kind === 'nero' ? 'Nero' : 'Colore', gen: { color: kind === 'nero' ? '#000000' : '#1b3a8f' } }); pp.clips.push(c); out.push(c.id);
    }
    return out;
  });
  store.select(ids);
  return ids;
}
reg({ id: 'genBarre', nome: 'Barre colore e tono', gruppo: 'Generatori', tasti: ['Ctrl+Alt+B'], fn: () => inserisciGeneratore('bars') });
reg({ id: 'genNero', nome: 'Nero', gruppo: 'Generatori', fn: () => inserisciGeneratore('nero') });
reg({ id: 'genColore', nome: 'Colore pieno', gruppo: 'Generatori', fn: () => inserisciGeneratore('color') });
reg({ id: 'genCountdown', nome: 'Countdown da pellicola', gruppo: 'Generatori', tasti: ['Ctrl+Alt+C'], fn: () => inserisciGeneratore('countdown') });
reg({ id: 'genTitolo', nome: 'Titolo', gruppo: 'Generatori', tasti: ['T', 'Ctrl+T'], fn: () => inserisciGeneratore('title') });
// ——— sottotitoli: dalla timeline (riga SOTT) con la tastiera; il lavoro lo fa timeline.ts con l'evento dpv:sott ———
const sott = (op: string) => () => { document.dispatchEvent(new CustomEvent('dpv:sott', { detail: op })); };
const rapidi = (fn: (m: typeof import('./ui/sottotitoliRapidi')) => void) => () => { void import('./ui/sottotitoliRapidi').then(fn); };
reg({
  id: 'sottGenera', nome: 'Sottotitoli con l\'AI (dal montaggio o dalle clip scelte)', gruppo: 'Sottotitoli', tasti: ['Alt+G'],
  info: 'L\'AI ascolta il montaggio (o solo le clip scelte) e scrive le righe nella riga SOTT della timeline. Poi si correggono lì: doppio clic per il testo, trascina per spostarle, tira i bordi per i tempi.',
  fn: rapidi((m) => void m.generaSottotitoli(store.sel.size ? store.sel : undefined)),
});
reg({ id: 'sottNuova', nome: 'Sottotitolo nuovo al cursore', gruppo: 'Sottotitoli', tasti: ['Alt+N'], info: 'Una riga di 2,5 secondi dove sta il cursore, col testo da scrivere subito (Invio conferma, Tab passa alla riga dopo).', fn: sott('nuova') });
reg({ id: 'sottModifica', nome: 'Scrivi / correggi il sottotitolo', gruppo: 'Sottotitoli', tasti: ['F2'], info: 'Apre il testo della riga scelta (o di quella sotto il cursore) direttamente sulla timeline. Ctrl+Invio divide la riga dove sta il cursore di scrittura.', fn: sott('modifica') });
reg({ id: 'sottDividi', nome: 'Dividi il sottotitolo al cursore', gruppo: 'Sottotitoli', tasti: ['Alt+S'], info: 'Spezza la riga sotto il cursore in due: il testo si divide alla parola più vicina.', fn: sott('dividi') });
reg({ id: 'sottUnisci', nome: 'Unisci i sottotitoli scelti', gruppo: 'Sottotitoli', tasti: ['Alt+J'], info: 'Le righe scelte (Maiusc+clic nella riga SOTT) diventano una riga sola; con una sola scelta si unisce alla dopo.', fn: sott('unisci') });
reg({ id: 'sottElimina', nome: 'Togli i sottotitoli scelti', gruppo: 'Sottotitoli', info: 'Toglie le righe SOTT scelte (o quella sotto il cursore). Si può anche con Canc quando la riga è scelta.', fn: sott('elimina') });
reg({ id: 'sottPrec', nome: 'Vai al sottotitolo prima', gruppo: 'Sottotitoli', tasti: ['Alt+PageUp'], fn: sott('prec') });
reg({ id: 'sottSucc', nome: 'Vai al sottotitolo dopo', gruppo: 'Sottotitoli', tasti: ['Alt+PageDown'], fn: sott('succ') });
reg({ id: 'sottInizia', nome: 'Il sottotitolo comincia al cursore', gruppo: 'Sottotitoli', fn: sott('inizia') });
reg({ id: 'sottFinisci', nome: 'Il sottotitolo finisce al cursore', gruppo: 'Sottotitoli', fn: sott('finisci') });
reg({ id: 'sottMostra', nome: 'Mostra la riga dei sottotitoli (SOTT)', gruppo: 'Sottotitoli', info: 'La riga SOTT compare anche se non ci sono ancora sottotitoli: da lì doppio clic o tasto destro.', fn: sott('mostra') });
reg({ id: 'sottStile', nome: 'Sottotitoli: posizione, grandezza e fascia', gruppo: 'Sottotitoli', fn: rapidi((m) => m.stileSottotitoli()) });
reg({ id: 'sottSrt', nome: 'Esporta i sottotitoli in un file .srt', gruppo: 'Sottotitoli', fn: rapidi((m) => void m.esportaSottotitoli('srt')) });
reg({ id: 'sottVtt', nome: 'Esporta i sottotitoli in un file .vtt (web)', gruppo: 'Sottotitoli', fn: rapidi((m) => void m.esportaSottotitoli('vtt')) });
reg({ id: 'sottImporta', nome: 'Importa i sottotitoli da un file .srt / .vtt', gruppo: 'Sottotitoli', fn: rapidi((m) => m.importaSottotitoli()) });
reg({ id: 'sottParla', nome: 'Fai parlare i sottotitoli (voce AI)', gruppo: 'Sottotitoli', fn: rapidi((m) => void m.faiParlareSottotitoli()) });

reg({ id: 'genTitoloHtml', nome: 'Titolo animato HTML (neon, display, terzo inferiore…)', gruppo: 'Generatori', fn: () => inserisciGeneratore('html') });
reg({ id: 'genAnimazione', nome: 'Animazione (sottopancia, testo che si muove…)', gruppo: 'Generatori', tasti: ['Ctrl+Alt+N'], fn: () => inserisciGeneratore('anim') });

export { head as cursore };
