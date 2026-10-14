// Togliere lo sfondo, la parte che si vede e si clicca: scegliere il modo (colore, luce, AI), il contagocce sul
// monitor, "trovalo da solo", i clic sull'oggetto, e il lavoro lungo con la barra (src/media/ritaglio.ts).
// Le proprietà della clip le disegna src/ui/ispettore.ts; qui sta quello che fanno i pulsanti.
import { store } from '../core/store';
import type { Clip, Ritaglio } from '../core/tipi';
import { clipById, mediaOf, srcTimeAt } from '../core/progetto';
import { coloreDominante, firmaRitaglio, puoRitagliare, RITAGLIO0, rgbHex } from '../core/sfondo';
import { motore } from '../motore';
import { pixelAl, coloreIn } from '../media/campiona';
import { elaboraRitaglio, modelloDiPartenza, provaRitaglio } from '../media/ritaglio';
import { impostaMaschere, maschereDi, potaMaschere, ripristinaMaschere } from '../media/maschere';
import { avviso } from './dom';
import { BarraLavoro } from './lavoro';
import type { SceltaImmagine } from './posiziona';

export type ModoSfondo = 'nessuno' | 'luma' | 'colori' | 'persona' | 'soggetto' | 'oggetti';

/** com'è tolto lo sfondo di questa clip */
export function modoSfondo(c: Clip): ModoSfondo {
  if (c.ritaglio) return c.ritaglio.modo;
  return c.fx.key === 'chroma' ? 'colori' : c.fx.key === 'luma' ? 'luma' : 'nessuno';
}

export const NOMI_MODO: Record<ModoSfondo, string> = {
  nessuno: 'Niente', colori: 'Colore (green screen)', luma: 'Luce (toglie nero o bianco)',
  persona: 'AI · Persona', soggetto: 'AI · Soggetto', oggetti: 'AI · Oggetti (clic)',
};

const IMMAGINE_O_VIDEO = (c: Clip) => c.kind === 'media' && puoRitagliare(mediaOf(store.doc, c));

/** i modi che la clip può avere (l'AI vuole una ripresa o un'immagine vera) */
export function modiPossibili(c: Clip): ModoSfondo[] {
  const base: ModoSfondo[] = ['nessuno', 'colori', 'luma'];
  return IMMAGINE_O_VIDEO(c) ? [...base, 'persona', 'soggetto', 'oggetti'] : base;
}

/** cambia il modo di tutte le clip scelte */
export function impostaModo(ids: string[], modo: ModoSfondo) {
  store.edit('Sfondo: ' + NOMI_MODO[modo], (pp) => {
    for (const id of ids) {
      const z = clipById(pp, id);
      if (!z) continue;
      if (modo === 'nessuno') { z.fx.key = 'none'; delete z.ritaglio; }
      else if (modo === 'colori') { z.fx.key = 'chroma'; delete z.ritaglio; }
      else if (modo === 'luma') { z.fx.key = 'luma'; delete z.ritaglio; }
      else if (IMMAGINE_O_VIDEO(z)) {
        z.fx.key = 'none';
        if (z.ritaglio?.modo !== modo) {
          z.ritaglio = { ...RITAGLIO0, modo, modello: modelloDiPartenza(modo), ...(modo === 'oggetti' ? { punti: [], segui: true } : {}) };
        }
      }
    }
  });
  // passando ai colori si prova a capire da soli qual è il fondale
  if (modo === 'colori') for (const id of ids) void trovaColore(id, true);
}

/** l'istante della sorgente sotto il cursore (secondi) */
function istanteQui(c: Clip): number {
  const p = store.doc;
  const f = Math.max(c.start, Math.min(c.start + c.len - 1, Math.floor(store.head + 1e-6)));
  return mediaOf(p, c)?.type === 'image' ? 0 : srcTimeAt(p, c, f);
}

// ——— i colori ———
function applicaColore(id: string, hex: string, aggiungi: boolean) {
  store.edit(aggiungi ? 'Un altro colore da togliere' : 'Colore della chiave', (pp) => {
    const z = clipById(pp, id);
    if (!z) return;
    z.fx.key = 'chroma';
    delete z.ritaglio;
    if (!aggiungi) z.fx.keyColor = hex;
    else {
      const altri = (z.fx.keyColori ??= []);
      if (altri.length < 2 && ![z.fx.keyColor, ...altri].includes(hex)) altri.push(hex);
    }
  });
}

/** il contagocce: un clic sull'immagine del monitor e quel colore è quello da togliere */
export function scegliColore(id: string, aggiungi: boolean) {
  const c = clipById(store.doc, id);
  if (!c?.media) { avviso('Il contagocce vuole una ripresa o un\'immagine', 'info'); return; }
  const sc: SceltaImmagine = {
    id, continua: false,
    testo: aggiungi ? '💧 Clicca un altro colore da togliere' : '💧 Clicca il colore da togliere (il fondale)',
    clic: (x, y) => {
      void pixelAl(c.media!, istanteQui(clipById(store.doc, id) ?? c), 640).then((px) => {
        if (!px) { avviso('Non riesco a leggere il colore di questa ripresa', 'errore'); return; }
        const [r, g, b] = coloreIn(px, x, y);
        applicaColore(id, rgbHex(r, g, b), aggiungi);
        avviso(`Colore preso: ${rgbHex(r, g, b)}. Guarda il risultato con SFONDO sopra il monitor`, 'ok', 2600);
      });
    },
  };
  document.dispatchEvent(new CustomEvent('dpv:scegli', { detail: sc }));
}

/** guarda i bordi dell'immagine e prende il colore del fondale */
export async function trovaColore(id: string, silenzioso = false): Promise<boolean> {
  const c = clipById(store.doc, id);
  if (!c?.media) return false;
  const px = await pixelAl(c.media, istanteQui(c), 320);
  if (!px) { if (!silenzioso) avviso('Non riesco a leggere questa ripresa', 'errore'); return false; }
  const d = coloreDominante(px.data, px.w, px.h);
  if (d.quota < 0.3 || d.saturazione < 0.3) {
    if (!silenzioso) avviso('Lungo i bordi non vedo un fondale a tinta unita: usa il contagocce 💧 sul colore da togliere', 'info', 4200);
    return false;
  }
  applicaColore(id, d.colore, false);
  avviso(`Ho trovato il fondale: ${d.colore} (${Math.round(d.quota * 100)}% dei bordi)`, 'ok', 3000);
  return true;
}

export function togliColoreExtra(id: string, i: number) {
  store.edit('Toglie un colore', (pp) => { const z = clipById(pp, id); if (z?.fx.keyColori) { z.fx.keyColori.splice(i, 1); if (!z.fx.keyColori.length) delete z.fx.keyColori; } });
}

// ——— i clic dell'oggetto ———
const mioR = (c: Clip | undefined): Ritaglio | undefined => c?.ritaglio;
let prova = 0;

/** a ogni clic si rifà la prova sul fotogramma, così si vede subito l'oggetto scelto */
function ritardaProva(id: string) {
  const mio = ++prova;
  setTimeout(() => { if (mio === prova) void provaOggetto(id); }, 220);
}

export function scegliOggetto(id: string) {
  const c = clipById(store.doc, id);
  if (!mioR(c) || c!.ritaglio!.modo !== 'oggetti') return;
  const sc: SceltaImmagine = {
    id, continua: true,
    testo: '🖱 Clicca l\'oggetto (verde) · Alt+clic = non è l\'oggetto (rosso)',
    punti: () => clipById(store.doc, id)?.ritaglio?.punti ?? [],
    clic: (x, y, alt) => {
      store.edit('Clic sull\'oggetto', (pp) => {
        const z = clipById(pp, id);
        if (!z?.ritaglio) return;
        const t = istanteQui(z);
        // i clic valgono per un solo fotogramma: se il cursore si è spostato, si ricomincia da qui
        if (z.ritaglio.da === undefined || Math.abs(z.ritaglio.da - t) > 0.05) { z.ritaglio.punti = []; z.ritaglio.da = t; }
        (z.ritaglio.punti ??= []).push({ x, y, dentro: !alt });
      });
      ritardaProva(id);
    },
  };
  document.dispatchEvent(new CustomEvent('dpv:scegli', { detail: sc }));
}

export function togliPunto(id: string, i: number) {
  store.edit('Toglie un clic', (pp) => { const z = clipById(pp, id); z?.ritaglio?.punti?.splice(i, 1); });
  ritardaProva(id);
}

export function azzeraPunti(id: string) {
  store.edit('Toglie i clic', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) { z.ritaglio.punti = []; delete z.ritaglio.da; delete z.ritaglio.firma; } });
}

/** una prova sul fotogramma di adesso (un solo fotogramma: si vede l'oggetto scelto prima di fare tutta la clip) */
export async function provaOggetto(id: string) {
  const c = clipById(store.doc, id);
  const r = c?.ritaglio;
  if (!c || !r || !(r.punti ?? []).some((q) => q.dentro)) return;
  try {
    const t = r.da ?? istanteQui(c);
    const esito = await provaRitaglio(store.doc, c, t, (fase) => avviso(fase, 'info', 1200));
    if (!esito) return;
    const firma = firmaRitaglio(c.media!, r);
    // la prova vale per tutta la clip finché non si fa il lavoro vero
    impostaMaschere({ firma, w: esito.px.w, h: esito.px.h, t0: 0, dt: 0, n: 1, hz: 0, dati: [esito.mask] }, false);
    store.edit('Prova dell\'oggetto', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) z.ritaglio.firma = firma; });
    motore.ridisegna();
  } catch (e) {
    avviso('La prova non è riuscita: ' + (e instanceof Error ? e.message : String(e)), 'errore', 4500);
  }
}

// ——— il lavoro lungo ———
export interface Lavoro { barra: BarraLavoro; ferma: boolean; finito: boolean }
export const lavori = new Map<string, Lavoro>();
const avvisaLavoro = () => document.dispatchEvent(new CustomEvent('dpv:lavoro-sfondo'));

export function lavoroDi(id: string) { return lavori.get(id); }

export async function elaboraClip(id: string) {
  const c = clipById(store.doc, id);
  if (!c?.ritaglio || lavori.get(id)?.finito === false) return;
  const lav: Lavoro = { barra: new BarraLavoro('Tolgo lo sfondo', 'ai', () => { lav.ferma = true; }), ferma: false, finito: false };
  lavori.set(id, lav);
  lav.barra.avvia('Preparo…');
  avvisaLavoro();
  const esito = await elaboraRitaglio(store.doc, c, {
    stato: (fase, k) => lav.barra.imposta(fase, k),
    ferma: () => lav.ferma,
  });
  lav.finito = true;
  if (esito.ok && esito.maschere) {
    lav.barra.fine(`Fatto: ${esito.maschere.n} maschere${esito.dispositivo ? ' · ' + esito.dispositivo : ''}`);
    store.edit('Sfondo tolto con l\'AI', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) z.ritaglio.firma = esito.maschere!.firma; });
    avviso('✂ Sfondo tolto: guarda il risultato con SFONDO sopra il monitor', 'ok', 3200);
  } else {
    lav.barra.ferma(esito.motivo ?? 'Non riuscito');
    if (esito.motivo !== 'Fermato') avviso(esito.motivo ?? 'Non riesco a togliere lo sfondo', 'errore', 6000);
  }
  motore.ridisegna();
  avvisaLavoro();
}

export function fermaClip(id: string) {
  const l = lavori.get(id);
  if (l && !l.finito) l.ferma = true;
}

/** lo stato delle maschere di una clip, in parole */
export function statoMaschere(c: Clip): { testo: string; ok: boolean } {
  const r = c.ritaglio;
  if (!r) return { testo: '', ok: false };
  const m = maschereDi(r.firma);
  const attuale = !!c.media && r.firma === firmaRitaglio(c.media, r);
  if (!m) return { testo: r.modo === 'oggetti' && !(r.punti ?? []).length ? 'Clicca sull\'oggetto da tenere, poi "Togli lo sfondo".' : 'Da elaborare: premi "Togli lo sfondo".', ok: false };
  if (!attuale) return { testo: 'Hai cambiato modello, precisione o clic: rifai "Togli lo sfondo" per aggiornare.', ok: false };
  if (m.n === 1 && mediaOf(store.doc, c)?.type !== 'image') return { testo: 'Questa è solo la prova su un fotogramma: premi "Togli lo sfondo" per fare tutta la clip.', ok: false };
  return { testo: mediaOf(store.doc, c)?.type === 'image' ? 'Pronto: sfondo tolto.' : `Pronto: ${m.n} maschere (${m.hz.toFixed(0)} al secondo, mescolate fra loro).`, ok: true };
}

document.addEventListener('dpv:maschere', () => motore.ridisegna());

// un progetto nuovo (aperto, o tornato da annulla/ripeti): le maschere che non servono più vanno via, quelle che
// servono si rileggono dalla cache del computer
let ultimoDoc: object | null = null;
store.on('doc', () => {
  if (store.doc === ultimoDoc) return;
  ultimoDoc = store.doc;
  potaMaschere(store.doc);
  void ripristinaMaschere(store.doc);
});

// ——— il bianco ———
/**
 * "Bilancia il bianco": un clic sul monitor su qualcosa che dovrebbe essere grigio o bianco, e la temperatura del
 * colore della clip si corregge da sola in modo che lì il colore diventi neutro (la dominante calda o fredda sparisce).
 * Il conto è quello dello shader: R·(1+0,18·T), B·(1−0,2·T) → T = (B−R) / (0,18·R + 0,2·B).
 */
export function bilanciaBianco(id: string) {
  const c = clipById(store.doc, id);
  if (!c?.media) { avviso('Il bianco si bilancia su una ripresa o un\'immagine', 'info'); return; }
  const sc: SceltaImmagine = {
    id, continua: false,
    testo: '💧 Clicca su qualcosa che dovrebbe essere grigio o bianco',
    clic: (x, y) => {
      void pixelAl(c.media!, istanteQui(clipById(store.doc, id) ?? c), 640).then((px) => {
        if (!px) { avviso('Non riesco a leggere il colore di questa ripresa', 'errore'); return; }
        const [r, , b] = coloreIn(px, x, y);
        const T = Math.max(-1, Math.min(1, (b - r) / Math.max(1, 0.18 * r + 0.2 * b)));
        store.edit('Bilancia il bianco', (pp) => { const z = clipById(pp, id); if (z) z.fx.temp = Math.round(((z.fx.temp ?? 0) + T) * 100) / 100; });
        avviso(`Bianco bilanciato: temperatura ${T > 0 ? '+' : ''}${Math.round(T * 100)}`, 'ok', 2200);
      });
    },
  };
  document.dispatchEvent(new CustomEvent('dpv:scegli', { detail: sc }));
}
