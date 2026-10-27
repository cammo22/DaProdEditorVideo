// Togliere lo sfondo, la parte che si vede e si clicca: scegliere il modo (colore, luce, AI), il contagocce sul
// monitor, "trovalo da solo", i clic sull'oggetto, e il lavoro lungo con la barra (src/media/ritaglio.ts).
// Le proprietà della clip le disegna src/ui/ispettore.ts; qui sta quello che fanno i pulsanti.
import { confermaAvvioAI } from './aiPassi';
import { progettoAttuale } from '../media/attivita';
import { store } from '../core/store';
import type { Clip, Ritaglio, Traccia } from '../core/tipi';
import type { Maschere } from '../media/maschere';
import { clipById, mediaOf, srcTimeAt } from '../core/progetto';
import { coloreDominante, firmaRitaglio, puoRitagliare, RITAGLIO0, rgbHex } from '../core/sfondo';
import { motore } from '../motore';
import { pixelAl, coloreIn } from '../media/campiona';
import { FIRMA_ANTEPRIMA, elaboraRitaglio, gruppiDi, modelloDiPartenza, modelloRitaglio, provaRitaglio } from '../media/ritaglio';
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

/** cosa fa ogni modo con l'AI, in parole: la differenza che prima non si capiva */
export const SPIEGA_MODO: Record<'soggetto' | 'persona' | 'oggetti', string> = {
  soggetto: 'Fa tutto da solo: trova chi o cosa sta davanti (una persona, un oggetto, un animale) e toglie il resto. Non devi cliccare niente.',
  persona: 'Fa tutto da solo ma cerca solo le persone: capelli e bordi più puliti, e tiene tutte le persone che vede. Veloce anche senza scheda video.',
  oggetti: 'Scegli tu: clicchi sulla persona o sull\'oggetto da tenere e la selezione compare subito. Premi OK per tutta la clip, oppure controlla prima l\'Anteprima; con "＋ Un altro oggetto" ne aggiungi altri. Clic sinistro aggiunge un punto, clic destro sopra un punto lo toglie.',
};

export const NOMI_MODO: Record<ModoSfondo, string> = {
  nessuno: 'Niente', colori: 'Colore (green screen)', luma: 'Luce (toglie nero o bianco)',
  persona: 'AI · Persone (da solo)', soggetto: 'AI · Automatico', oggetti: 'AI · Scegli tu',
};

const IMMAGINE_O_VIDEO = (c: Clip) => c.kind === 'media' && puoRitagliare(mediaOf(store.doc, c));

/** i modi che la clip può avere (l'AI vuole una ripresa o un'immagine vera) */
export function modiPossibili(c: Clip): ModoSfondo[] {
  const base: ModoSfondo[] = ['nessuno', 'colori', 'luma'];
  return IMMAGINE_O_VIDEO(c) ? [...base, 'soggetto', 'persona', 'oggetti'] : base;
}

/** cambia il modo di tutte le clip scelte */
export function impostaModo(ids: string[], modo: ModoSfondo) {
  // tornando a "niente" la vista del monitor torna all'immagine: se restava su Maschera o Scacchi (i loro pulsanti
  // spariscono) sembrava che lo sfondo non si potesse più togliere
  if (modo === 'nessuno') { for (const id of ids) fermaClip(id); document.dispatchEvent(new CustomEvent('dpv:vista-sfondo', { detail: 0 })); }
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

/** "＋ Un altro oggetto": i clic dopo vanno a un oggetto nuovo (si tengono tutti insieme) */
export function altroOggetto(id: string) {
  const c = clipById(store.doc, id);
  if (c?.ritaglio?.modo !== 'oggetti') { cliccaCosaTenere(id); return; }
  const usati = (c.ritaglio.punti ?? []).map((q) => q.g ?? 0);
  if (!usati.length) { scegliOggetto(id); return; }
  store.edit('Un altro oggetto', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) z.ritaglio.oggetto = Math.max(...usati) + 1; });
  avviso(`Oggetto ${Math.max(...usati) + 2}: clicca sul monitor sulla persona o la cosa da tenere`, 'info', 2600);
  scegliOggetto(id);
}

/** quanti oggetti e quanti clic, per le Proprietà */
export function oggettiDi(c: Clip): { n: number; punti: number }[] {
  return gruppiDi(c.ritaglio?.punti ?? []).map((g) => ({ n: g.length, punti: g.filter((q) => q.dentro).length }));
}

/** "Togli lo sfondo AI": la clip torna com'era (e il monitor sull'immagine normale) */
export function togliSfondoAI(ids: string[]) {
  impostaModo(ids, 'nessuno');
  avviso('Sfondo rimesso: la clip è tornata com\'era (Ctrl+Z per riavere il ritaglio)', 'ok', 2600);
}

/** "Riprova": via i clic e l'anteprima, si riclicca da capo */
export function riprovaOggetti(id: string) {
  fermaClip(id);
  store.edit('Riprova', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) { z.ritaglio.punti = []; delete z.ritaglio.da; delete z.ritaglio.firma; delete z.ritaglio.oggetto; } });
  document.dispatchEvent(new CustomEvent('dpv:vista-sfondo', { detail: 0 }));
  scegliOggetto(id);
}

/**
 * Il clic parte SUBITO: si prova sul fotogramma dove sei e la selezione si vede sopra l'immagine (verde, col bordo bianco).
 * Una prova alla volta: se intanto arriva un altro clic, finita questa si rifà con tutti i clic di adesso.
 * Quando la selezione è giusta si preme OK e il programma fa tutta la clip.
 */
let provaInCorso = false;
let provaDaRifare: string | null = null;
const avvisaScelta = () => document.dispatchEvent(new CustomEvent('dpv:scegli-aggiorna'));
export const cercando = () => provaInCorso;

function provaSubito(id: string) {
  if (provaInCorso) { provaDaRifare = id; return; }
  provaInCorso = true;
  avvisaScelta();
  void (async () => {
    try { await provaOggetto(id); } finally {
      provaInCorso = false;
      const di = provaDaRifare;
      provaDaRifare = null;
      avvisaScelta();
      if (di) provaSubito(di);
    }
  })();
}

/** "AI · automatico": si sceglie il modo che fa tutto da solo e parte subito il lavoro su tutta la clip */
export function avviaAI(ids: string[]) {
  impostaModo(ids, 'soggetto');
  for (const id of ids) void elaboraClip(id);
}

/** "Clicca su cosa tenere": se non è già il modo dei clic ci si passa (la persona o l'oggetto lo capisce da solo il modello), poi si clicca sul monitor */
export function cliccaCosaTenere(id: string) {
  const c = clipById(store.doc, id);
  if (c?.ritaglio?.modo !== 'oggetti') impostaModo([id], 'oggetti');
  scegliOggetto(id);
}

/** il clic sceglie una persona o un oggetto? (i due tasti nella barra sul monitor) */
export function impostaPersona(id: string, persona: boolean) {
  store.edit(persona ? 'Il clic sceglie una persona' : 'Il clic sceglie un oggetto', (pp) => {
    const z = clipById(pp, id);
    if (!z?.ritaglio) return;
    z.ritaglio.persona = persona;
    // un oggetto qualunque lo fa SAM: se il modello di prima non era uno di loro si torna al primo
    if (!persona && modelloRitaglio(z.ritaglio.modello)?.famiglia !== 'sam') z.ritaglio.modello = modelloDiPartenza('oggetti');
    delete z.ritaglio.firma;
  });
  if ((clipById(store.doc, id)?.ritaglio?.punti ?? []).some((q) => q.dentro)) provaSubito(id);
  else avvisaScelta();
}

export async function scegliOggetto(id: string) {
  const c = clipById(store.doc, id);
  if (!mioR(c) || c!.ritaglio!.modo !== 'oggetti') return;
  // Autorizza le prove di questa selezione, senza precaricare il modello.
  if (!(await autorizzaProva(id))) return;
  const sc: SceltaImmagine = {
    id, continua: true,
    testo: '🖱 Clic = scegli · destro = togli · Alt+clic = NON questo',
    punti: () => clipById(store.doc, id)?.ritaglio?.punti ?? [],
    clic: (x, y, alt) => {
      store.edit('Clic sull\'oggetto', (pp) => {
        const z = clipById(pp, id);
        if (!z?.ritaglio) return;
        const t = istanteQui(z);
        // i clic valgono per un solo fotogramma: se il cursore si è spostato, si ricomincia da qui
        if (z.ritaglio.da === undefined || Math.abs(z.ritaglio.da - t) > 0.05) { z.ritaglio.punti = []; z.ritaglio.da = t; }
        const g = z.ritaglio.oggetto ?? 0;
        (z.ritaglio.punti ??= []).push({ x, y, dentro: !alt, ...(g ? { g } : {}) });
      });
      provaSubito(id);
    },
    // tasto destro: toglie il punto più vicino (entro un po' di spazio da dove hai cliccato)
    destro: (x, y) => {
      const pt = clipById(store.doc, id)?.ritaglio?.punti ?? [];
      const i = puntoVicino(pt, x, y);
      if (i < 0) { avviso('Qui non c\'è nessun punto da togliere: clic sinistro ne aggiunge uno, clic destro sopra un punto lo toglie', 'info', 2600); return; }
      togliPunto(id, i);
    },
    // la selezione di prova, da disegnare sopra l'immagine (c'è solo quella di un fotogramma: la prova)
    maschera: () => {
      const r = clipById(store.doc, id)?.ritaglio;
      const m = r?.firma ? maschereDi(r.firma) : null;
      return m && m.n === 1 ? { w: m.w, h: m.h, dati: m.dati[0] } : null;
    },
    stato: () => {
      const r = clipById(store.doc, id)?.ritaglio;
      const ci = (r?.punti ?? []).some((q) => q.dentro);
      if (provaInCorso) return '⏳ Cerco…';
      if (!ci) return 'Clicca su quello che vuoi tenere';
      return r?.firma && maschereDi(r.firma)?.n === 1 ? '✔ Selezionato: se è giusto premi OK' : 'Clicca su quello che vuoi tenere';
    },
    modi: [
      { id: 'persona', nome: '🧍 Persona', info: 'Il clic sceglie una PERSONA: il programma trova le persone e tiene quella che hai cliccato (anche con più persone nel quadro)' },
      { id: 'oggetto', nome: '📦 Oggetto', info: 'Il clic sceglie un OGGETTO (o qualunque cosa): SAM, il modello dei clic, ritaglia quello che hai toccato' },
    ],
    modoAttuale: () => (clipById(store.doc, id)?.ritaglio?.persona ? 'persona' : 'oggetto'),
    scegliModo: (m) => impostaPersona(id, m === 'persona'),
    // OK: la selezione è giusta, si fa tutta la clip
    conferma: () => { void elaboraClip(id); },
  };
  document.dispatchEvent(new CustomEvent('dpv:scegli', { detail: sc }));
}

/** il punto più vicino a (x, y) (frazioni dell'immagine), o -1 se nessuno è entro il raggio */
export function puntoVicino(punti: { x: number; y: number }[], x: number, y: number, raggio = 0.05): number {
  let best = -1, d0 = raggio;
  punti.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d <= d0) { d0 = d; best = i; } });
  return best;
}

export function togliPunto(id: string, i: number) {
  store.edit('Toglie un clic', (pp) => { const z = clipById(pp, id); z?.ritaglio?.punti?.splice(i, 1); });
  if ((clipById(store.doc, id)?.ritaglio?.punti ?? []).some((q) => q.dentro)) provaSubito(id);
  else avvisaScelta();
}

export function azzeraPunti(id: string) {
  store.edit('Toglie i clic', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) { z.ritaglio.punti = []; delete z.ritaglio.da; delete z.ritaglio.firma; } });
}

/** una prova sul fotogramma di adesso (un solo fotogramma: si vede l'oggetto scelto prima di fare tutta la clip) */
export async function provaOggetto(id: string) {
  if (!(await autorizzaProva(id))) return;
  const progetto = progettoAttuale();
  const c = clipById(store.doc, id);
  const r = c?.ritaglio;
  if (!c || !r || !(r.punti ?? []).some((q) => q.dentro)) return;
  try {
    const t = r.da ?? istanteQui(c);
    const esito = await provaRitaglio(store.doc, c, t, (fase) => avviso(fase, 'info', 1200));
    if (!esito || progetto !== progettoAttuale()) return;
    const firma = firmaRitaglio(c.media!, r);
    // la prova vale per tutta la clip finché non si fa il lavoro vero
    impostaMaschere({ firma, w: esito.px.w, h: esito.px.h, t0: 0, dt: 0, n: 1, hz: 0, dati: [esito.mask] }, false);
    store.edit('Prova dell\'oggetto', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) z.ritaglio.firma = firma; });
    motore.ridisegna();
  } catch (e) {
    avviso('La prova non è riuscita: ' + (e instanceof Error ? e.message : String(e)), 'errore', 4500);
  }
}

/**
 * «Controlla la scena»: elabora SOLO il fotogramma dove sta il cursore (nessun lavoro lungo) e ne mostra il contorno sul
 * monitor. Con «Scegli tu» usa i clic (se non ce ne sono ancora, si va a cliccare).
 */
export async function controllaScena(id: string) {
  const c0 = clipById(store.doc, id);
  if (!c0?.ritaglio) return;
  if (c0.ritaglio.modo === 'oggetti') {
    if (!(c0.ritaglio.punti ?? []).some((q) => q.dentro)) { avviso('Prima clicca su cosa tenere', 'info', 2600); cliccaCosaTenere(id); return; }
    await provaOggetto(id);
  } else {
    if (!(await autorizzaProva(id))) return;
    const progetto = progettoAttuale();
    const c = clipById(store.doc, id);
    const r = c?.ritaglio;
    if (!c || !r) return;
    try {
      const esito = await provaRitaglio(store.doc, c, istanteQui(c), (fase) => avviso(fase, 'info', 1200));
      if (!esito || progetto !== progettoAttuale()) return;
      const firma = firmaRitaglio(c.media!, r) + FIRMA_ANTEPRIMA;
      impostaMaschere({ firma, w: esito.px.w, h: esito.px.h, t0: 0, dt: 0, n: 1, hz: 0, dati: [esito.mask] }, false);
      store.edit('Controllo della scena', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) z.ritaglio.firma = firma; });
      motore.ridisegna();
    } catch (e) {
      avviso('Il controllo non è riuscito: ' + (e instanceof Error ? e.message : String(e)), 'errore', 4500);
      return;
    }
  }
  document.dispatchEvent(new CustomEvent('dpv:vista-sfondo', { detail: 3 }));
}

/**
 * «Segui con l'AI»: si clicca l'oggetto come per togliere lo sfondo; quando le maschere sono pronte il loro centro, fotogramma per
 * fotogramma, diventa il percorso da seguire (`c.traccia`) e il ritaglio si toglie: la ripresa resta intera, ma titoli, immagini e
 * effetti possono seguire l'oggetto.
 */
const daSeguire = new Set<string>();
export function seguiConAI(id: string) {
  daSeguire.add(id);
  avviso('Clicca sull’oggetto da seguire sul monitor, poi premi OK: il programma lo segue in tutta la clip', 'info', 4200);
  cliccaCosaTenere(id);
}

function tracciaDaMaschere(id: string, m: Maschere) {
  const punti: Traccia['punti'] = [];
  let buoni = 0;
  for (let i = 0; i < m.n; i++) {
    const d = m.dati[i];
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (d[y * m.w + x] > 127) { sx += x; sy += y; n++; }
    if (n < m.w * m.h * 0.0004) continue;
    buoni++;
    punti.push({ t: m.t0 + i * m.dt, x: sx / n / m.w, y: sy / n / m.h });
  }
  const c = clipById(store.doc, id);
  if (punti.length < 2 || !c) { avviso('Non sono riuscito a seguire l’oggetto: clicca su qualcosa di ben visibile', 'info', 3600); return; }
  const tr: Traccia = { punti, da: c.ritaglio?.da ?? c.srcIn, fiducia: buoni / m.n };
  store.edit('Segui un oggetto con l’AI', (pp) => { const z = clipById(pp, id); if (z) { z.traccia = tr; delete z.ritaglio; } });
  document.dispatchEvent(new CustomEvent('dpv:vista-sfondo', { detail: 0 }));
  avviso('🎯 Oggetto seguito: ora un titolo, un effetto o un’immagine lo possono seguire (sezione Segui)', 'ok', 4200);
  document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'segui' }));
}

// ——— il lavoro lungo ———
export interface Lavoro { barra: BarraLavoro; ferma: boolean; finito: boolean; anteprima?: boolean }
export const lavori = new Map<string, Lavoro>();
const avvisaLavoro = () => document.dispatchEvent(new CustomEvent('dpv:lavoro-sfondo'));

export function lavoroDi(id: string) { return lavori.get(id); }

/** quanti secondi dura l'anteprima degli oggetti */
export const SECONDI_ANTEPRIMA = 5;

async function confermaSfondo(id: string) {
  const c = clipById(store.doc, id);
  const m = c?.ritaglio && modelloRitaglio(c.ritaglio.modello);
  return !!m && await confermaAvvioAI({ compito: 'Togli lo sfondo', clip: id, modello: m.nome, repo: m.repo[0], dettagli: 'Controlla il risultato sul monitor. Le maschere possono richiedere molto spazio; per gli oggetti scegli i punti dopo aver confermato.' });
}
// Un consenso per le prove interattive dello stesso modello, clip e progetto.
// Cambiare modello/persona richiede un nuovo consenso; i punti non lo invalidano.
let consensoProva = '';
const chiaveConsensoProva = (id: string) => {
  const c = clipById(store.doc, id);
  return c?.ritaglio ? JSON.stringify([progettoAttuale(), id, c.media, c.ritaglio.modello, c.ritaglio.persona]) : '';
};
async function autorizzaProva(id: string): Promise<boolean> {
  const chiave = chiaveConsensoProva(id);
  if (!chiave) return false;
  if (chiave === consensoProva) return true;
  if (!(await confermaSfondo(id)) || chiave !== chiaveConsensoProva(id)) return false;
  consensoProva = chiave;
  return true;
}
export async function elaboraClip(id: string, anteprima = false) {
  if (!(await confermaSfondo(id))) return;
  const progetto = progettoAttuale();
  const c = clipById(store.doc, id);
  if (!c?.ritaglio || lavori.get(id)?.finito === false) return;
  const lav: Lavoro = { barra: new BarraLavoro(anteprima ? 'Anteprima dello sfondo' : 'Tolgo lo sfondo', 'ai', () => { lav.ferma = true; }), ferma: false, finito: false, anteprima };
  lavori.set(id, lav);
  lav.barra.avvia('Preparo…');
  avvisaLavoro();
  const esito = await elaboraRitaglio(store.doc, c, {
    stato: (fase, k) => lav.barra.imposta(fase, k),
    ferma: () => lav.ferma || progetto !== progettoAttuale(),
    ...(anteprima ? { anteprima: SECONDI_ANTEPRIMA } : {}),
  });
  lav.finito = true;
  if (lav.ferma || progetto !== progettoAttuale()) { lav.barra.ferma('Fermato'); avvisaLavoro(); return; }
  if (esito.ok && esito.maschere) {
    lav.barra.fine(`${anteprima ? 'Anteprima pronta' : 'Fatto'}: ${esito.maschere.n} maschere${esito.dispositivo ? ' · ' + esito.dispositivo : ''}`);
    if (!anteprima && daSeguire.has(id)) { daSeguire.delete(id); tracciaDaMaschere(id, esito.maschere); motore.ridisegna(); avvisaLavoro(); return; }
    store.edit(anteprima ? 'Anteprima dello sfondo' : 'Sfondo tolto con l\'AI', (pp) => { const z = clipById(pp, id); if (z?.ritaglio) z.ritaglio.firma = esito.maschere!.firma; });
    if (anteprima) {
      // si guarda subito: il soggetto sugli scacchi, dal punto dove hai cliccato
      document.dispatchEvent(new CustomEvent('dpv:vista-sfondo', { detail: 2 }));
      avviso(`👀 Anteprima (${SECONDI_ANTEPRIMA} s): premi Play e guarda se segue bene. Va bene → "Genera tutta la clip"; no → "Riprova"`, 'ok', 6000);
    } else avviso('✂ Sfondo tolto: guarda il risultato con SFONDO sopra il monitor', 'ok', 3200);
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
  const prova = !!r.firma?.endsWith(FIRMA_ANTEPRIMA);
  const attuale = !!c.media && r.firma === firmaRitaglio(c.media, r) + (prova ? FIRMA_ANTEPRIMA : '');
  if (!m) return { testo: r.modo === 'oggetti' && !(r.punti ?? []).length ? 'Clicca sulla persona o sull\'oggetto da tenere (con "＋ Un altro oggetto" ne aggiungi altri), poi "Anteprima".' : r.modo === 'oggetti' ? 'Premi "Anteprima" per vedere come segue quello che hai scelto.' : 'Da elaborare: premi "Rifai".', ok: false };
  if (prova && attuale) {
    const l = lavori.get(c.id);
    return { testo: l && !l.finito ? 'Sto facendo l\'anteprima…' : `Anteprima pronta (${SECONDI_ANTEPRIMA} secondi dal clic): premi Play e guarda. Va bene? "Genera tutta la clip". No? "Riprova".`, ok: false };
  }
  if (!attuale) return { testo: 'Hai cambiato modello, precisione o clic: rifai "Togli lo sfondo" per aggiornare.', ok: false };
  if (m.n === 1 && mediaOf(store.doc, c)?.type !== 'image') {
    const l = lavori.get(c.id);
    return { testo: l && !l.finito ? 'Questa è la prova su un fotogramma: sto seguendo la persona o l\'oggetto per tutta la clip…' : 'Per ora c\'è un solo fotogramma: tra un attimo parte da solo il lavoro su tutta la clip (o premi "Togli lo sfondo").', ok: false };
  }
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
