// "Metti qualcosa che lo segue": quando una ripresa ha un oggetto tracciato (Proprietà → Segui un oggetto), il pannello
// offre tutto quello che si può appoggiare sull'oggetto e che lo segue per tutta la ripresa: un testo, un nome o
// un'etichetta, un mirino o una freccia, un'immagine tua, un'emoji, o un effetto che lavora proprio lì (una lente, uno zoom).
// Ogni cosa è una clip a parte sopra la ripresa (o un blocchetto di effetto) con `segue` = la ripresa tracciata: si
// cambia dalle sue Proprietà e si sposta rispetto all'oggetto trascinandola sul monitor.
import { store } from '../core/store';
import { clipById, end, newClip, TITLE0 } from '../core/progetto';
import * as M from '../core/montaggio';
import { fps } from '../core/timecode';
import { animazione, nuovaAnim } from '../core/animazioni';
import { nuovoBlocco, posaBlocco } from '../core/blocchi';
import type { Clip, Project } from '../core/tipi';
import { avviso, h, menuContesto, type VoceMenu } from './dom';
import { importaDialogo } from '../progetti';

/** i segnali pronti (id dell'animazione, nome, simbolo) */
export const SEGNALINI_RAPIDI: [string, string, string][] = [
  ['sg-mirino', 'Mirino', '⌖'], ['sg-cerchio', 'Cerchio', '◯'], ['sg-freccia', 'Freccia', '➜'], ['sg-onde', 'Onde', '◎'],
];
/** le scritte con la punta o con la linea, che sono animazioni del catalogo */
const SCRITTE_ANIM: [string, string, string, string][] = [
  ['sg-nome', 'Nome sopra', '💬', 'la targhetta col nome sopra l\'oggetto, con la punta che lo indica'],
  ['sg-etichetta', 'Etichetta', '🏷', 'un punto sull\'oggetto, una linea e la targhetta col testo'],
];
const EMOJI: [string, string][] = [
  ['📍', 'Segnaposto'], ['⭐', 'Stella'], ['❤️', 'Cuore'], ['🔥', 'Fuoco'], ['👍', 'Bene'], ['⚠️', 'Attenzione'], ['😀', 'Faccina'], ['❓', 'Domanda'], ['✅', 'Giusto'], ['❌', 'Sbagliato'],
];
/** gli effetti col centro che lavorano sull'oggetto (id del catalogo dei blocchetti FX) */
const EFFETTI_OGGETTO: [string, string, string, string][] = [
  ['bolla', 'Lente', '🔍', 'una lente che ingrandisce l\'oggetto'],
  ['zoomLento', 'Zoom', '🔎', 'la ripresa si avvicina piano piano proprio all\'oggetto'],
  ['vortice', 'Vortice', '🌀', 'tutto gira attorno all\'oggetto'],
  ['pesce', 'Occhio di pesce', '🐟', 'l\'obiettivo grandangolare gonfia l\'oggetto'],
];

/** la traccia video sopra la ripresa (o una libera) dove appoggiare la cosa nuova */
function tracciaSopra(pp: Project, src: Clip): string {
  return M.tracciaLibera(pp, 'video', src.track, src.start, end(src), undefined, new Set([src.track]));
}

function fine(nuovi: string[], messaggio: string) {
  if (!nuovi.length) return;
  store.select(nuovi);
  avviso(messaggio, 'ok', 3600);
}

/** un testo da scrivere: sta un po' sopra l'oggetto e lo segue; le parole si scrivono nelle sue Proprietà */
export function mettiTesto(srcId: string) {
  const nuovi: string[] = [];
  store.edit('Testo che segue l\'oggetto', (pp) => {
    const src = clipById(pp, srcId);
    if (!src) return;
    const c = newClip('title', tracciaSopra(pp, src), src.start, src.len, { name: 'Testo', gen: { title: { ...TITLE0, text: 'Scrivi qui', size: 72, box: true, boxColor: '#000000b0' } } });
    c.segue = src.id;
    c.tf.y = -Math.round(pp.h * 0.13);
    pp.clips.push(c);
    nuovi.push(c.id);
  });
  fine(nuovi, 'Testo messo sopra l\'oggetto: scrivi le parole qui a destra. Lo segue per tutta la ripresa; trascinalo sul monitor per spostarlo rispetto a lui.');
}

/** un'emoji grande sull'oggetto */
export function mettiEmoji(srcId: string, emoji: string, nome: string) {
  const nuovi: string[] = [];
  store.edit('Emoji che segue l\'oggetto', (pp) => {
    const src = clipById(pp, srcId);
    if (!src) return;
    const c = newClip('title', tracciaSopra(pp, src), src.start, src.len, { name: `${emoji} ${nome}`, gen: { title: { ...TITLE0, text: emoji, size: 190, shadow: true, outline: '#00000000' } } });
    c.segue = src.id;
    c.tf.y = -Math.round(pp.h * 0.1);
    pp.clips.push(c);
    nuovi.push(c.id);
  });
  fine(nuovi, `${emoji} messa sopra l'oggetto: la segue per tutta la ripresa.`);
}

/** un segnale (mirino, cerchio, freccia, etichetta…): una animazione del catalogo che segue l'oggetto */
export function aggiungiSegnalino(srcId: string, animId: string) {
  const def = animazione(animId);
  if (!def) return;
  const nuovi: string[] = [];
  store.edit(def.nome + ' che segue l\'oggetto', (pp) => {
    const src = clipById(pp, srcId);
    if (!src) return;
    const c = newClip('title', tracciaSopra(pp, src), src.start, src.len, { name: def.nome, gen: { anim: nuovaAnim(animId) } });
    // il centro del segnale va a finire sull'oggetto, e lo segue (lo scarto è zero: sta proprio sopra)
    c.segue = src.id;
    pp.clips.push(c);
    nuovi.push(c.id);
  });
  fine(nuovi, `${def.nome}: ora segue l'oggetto. Cambia colore e testo dalle sue Proprietà.`);
}

/** un'immagine già nel progetto, appoggiata sull'oggetto (piccola, da ingrandire o spostare sul monitor) */
export function mettiImmagine(srcId: string, mediaId: string) {
  const nuovi: string[] = [];
  store.edit('Immagine che segue l\'oggetto', (pp) => {
    const src = clipById(pp, srcId);
    const m = pp.media.find((x) => x.id === mediaId);
    if (!src || !m) return;
    const sec = src.len / fps(pp.rate);
    const t = tracciaSopra(pp, src);
    const ids = M.placeSource(pp, { mediaId, srcIn: 0, srcOut: sec }, src.start, end(src), { video: t, audio: [] }, 'libero');
    for (const id of ids) {
      const c = clipById(pp, id);
      if (!c) continue;
      c.segue = src.id;
      c.tf.scale = 0.3;
      c.name = m.name;
      nuovi.push(id);
    }
  });
  fine(nuovi, 'Immagine messa sopra l\'oggetto: lo segue. La ingrandisci o la sposti trascinandola sul monitor.');
}

/** un effetto col centro (lente, zoom…): il suo centro sta sull'oggetto e lo segue */
export function mettiEffettoSuOggetto(srcId: string, effettoId: string) {
  const nuovi: string[] = [];
  store.edit('Effetto sull\'oggetto', (pp) => {
    const src = clipById(pp, srcId);
    if (!src) return;
    const b = nuovoBlocco('effetto', effettoId);
    b.segue = src.id;
    b.pos = [0.5, 0.5];
    const c = posaBlocco(pp, b, src.start, src.len, src.track);
    nuovi.push(c.id);
  });
  fine(nuovi, 'Effetto messo: lavora sull\'oggetto e lo segue. Durata e forza sono nelle sue Proprietà.');
}

/** il menu delle immagini: quelle del progetto, e "Scegli un file…" per portarne una nuova */
function menuImmagini(x: number, y: number, srcId: string) {
  const p = store.doc;
  const voci: VoceMenu[] = p.media.filter((m) => m.type === 'image').map((m) => ({ nome: m.name, fn: () => mettiImmagine(srcId, m.id) }));
  if (voci.length) voci.push({ sep: true });
  voci.push({
    nome: 'Scegli un file…', fn: () => {
      void importaDialogo(undefined, 'image').then((nuovi) => { const m = nuovi?.find((z) => z.type === 'image'); if (m) mettiImmagine(srcId, m.id); }).catch(() => { /* chiusa la finestra */ });
    },
  });
  menuContesto(x, y, voci);
}

function menuEmoji(x: number, y: number, srcId: string) {
  menuContesto(x, y, EMOJI.map(([e, n]) => ({ nome: `${e}   ${n}`, fn: () => mettiEmoji(srcId, e, n) })));
}

/** il blocco del pannello: tessere grandi, a gruppi, con poche parole (la spiegazione sta nel suggerimento) */
export function cosaCiMetto(c0: Clip): HTMLElement[] {
  const id = c0.id;
  const tess = (icona: string, nome: string, info: string, fn: (e: MouseEvent) => void) => h('button', {
    class: 'seg-tessera', title: info, 'data-seg': nome, on: { click: fn },
  }, h('i', null, icona), h('span', null, nome));
  const sotto = (e: MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return [r.left, r.bottom + 4] as const; };
  const riga = (titolo: string, ...t: HTMLElement[]) => h('div', { class: 'seg-blocco' }, h('label', { class: 'etichetta' }, titolo), h('div', { class: 'seg-griglia' }, t));
  return [
    h('p', { class: 'seg-intro' }, 'Metti qualcosa sull\'oggetto: lo segue per tutta la ripresa.'),
    riga('Scritte',
      tess('✍', 'Testo', 'Un testo da scrivere, sopra l\'oggetto', () => mettiTesto(id)),
      ...SCRITTE_ANIM.map(([a, n, ic, info]) => tess(ic, n, info, () => aggiungiSegnalino(id, a)))),
    riga('Segnali', ...SEGNALINI_RAPIDI.map(([a, n, ic]) => tess(ic, n, `${n}: si mette sopra questa ripresa e segue l'oggetto per tutta la sua durata`, () => aggiungiSegnalino(id, a)))),
    riga('Immagini',
      tess('🖼', 'Immagine', 'Una tua immagine (dal progetto o da un file) sopra l\'oggetto', (e) => { const [x, y] = sotto(e); menuImmagini(x, y, id); }),
      tess('😀', 'Emoji', 'Un\'emoji grande sopra l\'oggetto', (e) => { const [x, y] = sotto(e); menuEmoji(x, y, id); })),
    riga('Effetti sull\'oggetto', ...EFFETTI_OGGETTO.map(([a, n, ic, info]) => tess(ic, n, info, () => mettiEffettoSuOggetto(id, a)))),
    h('p', { class: 'nota' }, 'Ogni cosa è una clip a parte sopra questa: la cambi dalle sue Proprietà e la sposti rispetto all\'oggetto trascinandola sul monitor.'),
  ];
}
