// Le funzioni AI facili del motore locale, dalla parte di chi le preme: i comandi (menu AI, Ctrl+K, tasto destro), la lista
// onesta di tutte le funzioni AI con la loro etichetta PRONTA / OPZIONALE / SPERIMENTALE, e i modelli del motore con
// «Scarica» e «Togli» (passano dal Centro attività: avanzamento, Ferma e Riprova). Il lavoro vero è in src/media/funzioniMotore.ts.
// Ogni risultato è materiale da modificare (marcatori, righe di sottotitolo, clip nuove) e si annulla con Ctrl+Z.
import { store } from '../core/store';
import type { Clip } from '../core/tipi';
import { isVideoClip } from '../core/progetto';
import { clipEsplicita } from '../core/flussiUI';
import { ETICHETTA_STATO, FUNZIONI_AI, collegaEsecuzione, funzioneAI, rigaStato, type FunzioneAI as FunzioneRegistro } from '../core/funzioniAI';
import { marcatoriScena, tagliaAlleScene } from '../core/materialeAI';
import { registra as reg } from '../azioni';
import { possibilita } from '../media/audioAI';
import { inCoda } from '../media/attivita';
import { clearAttivo, impostaClearAttivo } from '../media/clear';
import { MODELLO_DI, SECONDI_MASSIMI_RALLENTA, preparaMotore, puliziaVoceMotore, rallentaClip, separaMotore, servePerFunzione, sottotitoliQwen, trovaScene, type FunzioneMotore } from '../media/funzioniMotore';
import { motoreAI, motoreLocaleDisponibile, type ModelloLocale } from '../media/motoreAI';
import { avviso, h } from './dom';
import { confermaAvvioAI } from './aiPassi';

/** quale funzione del registro usa quale modello del motore (stessi id del catalogo Python) */
export const FUNZIONE_DEL_MODELLO: Record<string, string> = {
  'hy-mt2-18b': 'traduci', 'deepfilternet3': 'voce-pulita', 'kim-vocal-2': 'voce-musica', 'transnetv2': 'scene',
  'rife-425': 'rallenta', 'qwen3-asr-06b': 'sottotitoli-parole', 'qwen3-tts-06b': 'voce-realistica',
};

const clipVideo = (): Clip | undefined => clipEsplicita(store.doc.clips, store.sel, (c) => c.kind === 'media' && isVideoClip(c, store.doc));
const clipAudio = (): Clip | undefined => clipEsplicita(store.doc.clips, store.sel, (c) => possibilita(c, store.doc).rumore);

/** una frase per le persone da un errore dei lavori ("fermato" = l'hai fermato tu) */
function dopoErrore(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/^fermato/i.test(msg)) { avviso('Fermato', 'info', 1600); return; }
  avviso(msg, 'errore', 7500);
}

/** lancia una funzione del motore: il consenso, poi il lavoro; gli errori diventano frasi */
async function avvia(chiedi: Parameters<typeof confermaAvvioAI>[0], fn: () => Promise<unknown>) {
  try {
    if (!(await confermaAvvioAI({ locale: true, ...chiedi }))) return;
    await fn();
  } catch (e) { dopoErrore(e); }
}

const DETTAGLI = (f: string) => `${funzioneAI(f)?.nome ?? f}: ${funzioneAI(f)?.stato === 'sperimentale' ? 'SPERIMENTALE. ' : ''}gira nel motore AI locale opzionale, con un modello alla volta in memoria. Il risultato è materiale nuovo da modificare e l'originale resta; Ctrl+Z annulla. Stato, Ferma e Riprova in Attività.`;

export async function faiTrovaScene(clipId: string) {
  await avvia({ compito: 'Tagli automatici (scene)', clip: clipId, modello: 'TransNetV2 (MIT) · 31 MB · basta il processore', dettagli: DETTAGLI('scene') }, () => trovaScene(clipId));
}
export function faiTagliaAlleScene(clipId: string) {
  const c = store.doc.clips.find((x) => x.id === clipId);
  if (!c || !marcatoriScena(store.doc, c).length) { avviso('In questa clip non ci sono marcatori «Scena»: prima «Trova i tagli automatici»', 'info', 3600); return; }
  const n = store.edit('Taglia alle scene', (p) => tagliaAlleScene(p, clipId));
  avviso(n ? `✂ ${n} tagli alle scene (Ctrl+Z torna indietro)` : 'Niente da tagliare: i marcatori sono già tagli', n ? 'ok' : 'info', 3200);
}
export async function faiVocePulitaMotore(clipId: string) {
  await avvia({ compito: 'Voce pulita (motore AI)', clip: clipId, modello: 'DeepFilterNet3 (MIT o Apache-2.0) · 8 MB · basta il processore', dettagli: DETTAGLI('voce-pulita') }, () => puliziaVoceMotore(clipId));
}
export async function faiVoceMusicaMotore(clipId: string) {
  await avvia({ compito: 'Voce e musica (Kim Vocal 2)', clip: clipId, modello: 'Mel-Band RoFormer Kim Vocal 2 (MIT) · 0,9 GB · VRAM 3–6 GB', dettagli: DETTAGLI('voce-musica') }, () => separaMotore(clipId));
}
export async function faiRallentaFluido(clipId: string, fattore: 2 | 4 = 2) {
  await avvia({ compito: `Rallentatore fluido ×${fattore} (SPERIMENTALE)`, clip: clipId, modello: `RIFE 4.25 (MIT) · 23 MB · VRAM 1–3 GB · al massimo ${SECONDI_MASSIMI_RALLENTA} secondi per volta`, dettagli: DETTAGLI('rallenta') }, () => rallentaClip(clipId, fattore));
}
export async function faiSottotitoliParole(lingua = 'auto') {
  await avvia({ compito: 'Sottotitoli con parole e tempi', ambito: 'Tutti i dialoghi del montaggio', modello: 'Qwen3-ASR 0.6B + ForcedAligner 0.6B (Apache-2.0) · 3,7 GB · VRAM 2–4 GB, un modello alla volta', dettagli: DETTAGLI('sottotitoli-parole') + ' Le righe che ci sono già vengono sostituite.' }, () => sottotitoliQwen(lingua));
}

const serveClip = (cosa: string) => avviso(cosa, 'info', 3200);
reg({
  id: 'sceneTrova', nome: 'Trova i tagli automatici (scene, AI)…', gruppo: 'AI',
  info: 'TransNetV2 guarda la ripresa scelta e mette dei marcatori «Scena» dove cambia l\'inquadratura: li sposti, li cancelli o li trasformi in tagli. Serve il motore AI locale opzionale.',
  fn: () => { const c = clipVideo(); if (!c) { serveClip('Scegli una ripresa video nella timeline'); return; } void faiTrovaScene(c.id); },
});
reg({
  id: 'sceneTaglia', nome: 'Taglia la clip alle scene trovate', gruppo: 'AI',
  info: 'Trasforma in tagli veri i marcatori «Scena» che stanno dentro la clip scelta. Ctrl+Z torna indietro.',
  fn: () => { const c = clipVideo(); if (!c) { serveClip('Scegli la ripresa su cui hai trovato le scene'); return; } faiTagliaAlleScene(c.id); },
});
reg({
  id: 'vocePulitaMotore', nome: 'Voce pulita con DeepFilterNet3 (motore AI locale)…', gruppo: 'AI',
  info: 'Toglie i rumori da un parlato con DeepFilterNet3 nel motore locale. La clip passa a un audio nuovo, l\'originale si conserva («Audio originale» o Ctrl+Z).',
  fn: () => { const c = clipAudio(); if (!c) { serveClip('Scegli una clip audio (o una ripresa con l\'audio)'); return; } void faiVocePulitaMotore(c.id); },
});
reg({
  id: 'voceMusicaMotore', nome: 'Separa voce e musica con Kim Vocal 2 (motore AI locale)…', gruppo: 'AI',
  info: 'Divide una canzone in cantato e musica su due tracce nuove. L\'originale resta ma va in silenzio. Serve il motore AI locale opzionale con il modello scaricato.',
  fn: () => { const c = clipAudio(); if (!c) { serveClip('Scegli la clip della canzone'); return; } void faiVoceMusicaMotore(c.id); },
});
reg({
  id: 'rallentaFluido', nome: 'Rallentatore fluido con RIFE (sperimentale)…', gruppo: 'AI',
  info: `RIFE inventa i fotogrammi in mezzo e fa una clip nuova più lenta (fino a ${SECONDI_MASSIMI_RALLENTA} secondi per volta). SPERIMENTALE: non ancora collaudato col modello vero. L'originale resta.`,
  fn: () => { const c = clipVideo(); if (!c) { serveClip('Scegli una ripresa video nella timeline'); return; } void faiRallentaFluido(c.id); },
});
reg({
  id: 'sottotitoliParole', nome: 'Sottotitoli con parole e tempi (Qwen3-ASR)…', gruppo: 'AI',
  info: 'Qwen3-ASR scrive i dialoghi del montaggio e il ForcedAligner mette ogni parola al suo tempo: righe di sottotitolo modificabili nella riga SOTT. Serve il motore AI locale opzionale.',
  fn: () => { void faiSottotitoliParole(); },
});

// il registro sa come partire (la schermata che possiede la funzione glielo dice)
collegaEsecuzione('scene', async ({ clipIds }) => { if (clipIds[0]) await trovaScene(clipIds[0]); });
collegaEsecuzione('rallenta', async ({ clipIds }) => { if (clipIds[0]) await rallentaClip(clipIds[0]); });
collegaEsecuzione('voce-pulita', async ({ clipIds }) => { if (clipIds[0]) await puliziaVoceMotore(clipIds[0]); });
collegaEsecuzione('voce-musica', async ({ clipIds }) => { if (clipIds[0]) await separaMotore(clipIds[0]); });
collegaEsecuzione('sottotitoli-parole', async () => { await sottotitoliQwen(); });

// ——— la lista onesta di tutte le funzioni AI ———

const GRUPPI: [FunzioneRegistro['dove'], string][] = [['clip', 'Sulle clip'], ['audio', 'Sull\'audio'], ['progetto', 'Su tutto il progetto'], ['finale', 'Parlato, lingue e voci']];
const SPIEGA_STATO = 'PRONTA = funziona nell\'app com\'è. OPZIONALE = serve scaricare un modello o il motore AI locale; il montaggio funziona anche senza. SPERIMENTALE = la strada c\'è ma non è ancora collaudata col modello vero.';

/** l'etichetta incisa con la sua spia: PRONTA (verde), OPZIONALE (spenta), SPERIMENTALE (ambra) */
export function etichettaStato(f: FunzioneRegistro): HTMLElement {
  return h('span', { class: 'fun-stato', 'data-stato': f.stato }, h('i', { class: 'fun-spia' }), ETICHETTA_STATO[f.stato]);
}

/** una riga: nome, cosa fa, e sotto "OPZIONALE · 3,6 GB · VRAM 2–4 GB · motore AI locale" */
function rigaFunzione(f: FunzioneRegistro): HTMLElement {
  return h('div', { class: 'fun-riga', 'data-fun': f.id, 'data-stato': f.stato },
    h('div', { class: 'fun-testo' }, h('b', null, f.nome), h('small', null, f.descrizione), h('small', { class: 'fun-peso' }, etichettaStato(f), ' ', [f.peso, f.vram ? `VRAM ${f.vram}` : '', f.motore === 'locale' ? 'motore AI locale' : 'nel programma'].filter(Boolean).join(' · '))));
}

/** tutte le funzioni AI del programma, per gruppo, con il loro stato dichiarato */
export function schedaFunzioniAI(): HTMLElement {
  return h('section', { class: 'ai-sezione fun-ai', 'data-ai': 'funzioni' }, h('h4', null, 'Le funzioni AI · cosa è pronto e cosa no'),
    h('p', { class: 'nota' }, SPIEGA_STATO),
    ...GRUPPI.flatMap(([dove, titolo]) => {
      const lista = FUNZIONI_AI.filter((f) => f.dove === dove);
      return lista.length ? [h('h5', { class: 'fun-gruppo' }, titolo), ...lista.map(rigaFunzione)] : [];
    }),
    h('p', { class: 'nota' }, 'Pesi e memoria della scheda video sono quelli dichiarati dai modelli o stime della ricerca di ottobre 2026: non sono misure su questo computer.'));
}

// ——— i modelli del motore locale: Scarica e Togli, dalla coda delle Attività ———

const NOMI_STATO_MOTORE = 'Il motore AI locale non è installato: premi «Installa motore» qui sopra, poi torna a scaricare il modello.';

/** i modelli del catalogo del motore (oltre alla voce Qwen3-TTS, che ha la sua scheda) */
export function schedaModelliMotore(): HTMLElement {
  const elenco = h('div', { class: 'fun-modelli' });
  const stato = h('p', { class: 'nota' }, motoreLocaleDisponibile() ? 'Accendi il motore per vedere cosa è già sul computer.' : 'Il motore AI locale c\'è solo nell\'app per Windows (non nel browser).');
  const sulComputer = new Map<string, boolean>();
  const funzioni = (Object.keys(MODELLO_DI) as FunzioneMotore[]);
  let occupato = false;
  const righe = new Map<string, { el: HTMLElement; presenza: HTMLElement; scarica: HTMLButtonElement; togli: HTMLButtonElement }>();
  const disegna = () => {
    for (const [id, r] of righe) {
      const dentro = sulComputer.get(id);
      r.presenza.textContent = dentro === undefined ? 'da controllare' : dentro ? '✓ sul computer' : '⬇ da scaricare';
      r.presenza.dataset.presenza = dentro === undefined ? 'boh' : dentro ? 'si' : 'no';
      r.scarica.disabled = occupato || !motoreLocaleDisponibile();
      r.scarica.textContent = dentro ? 'Ricontrolla' : 'Scarica';
      r.togli.disabled = occupato || !dentro;
    }
  };
  const leggi = async () => {
    if (!motoreLocaleDisponibile()) { disegna(); return; }
    try {
      const s = await motoreAI.stato();
      if (s.stato !== 'acceso') { stato.textContent = s.stato === 'non-installato' ? NOMI_STATO_MOTORE : 'Il motore è spento: si accende da solo quando scarichi un modello o avvii una funzione.'; disegna(); return; }
      const m: ModelloLocale[] = await motoreAI.modelli();
      for (const x of m) sulComputer.set(x.id, x.scaricato);
      stato.textContent = 'Un modello alla volta in memoria; ognuno si scarica solo quando lo chiedi.';
      disegna();
    } catch (e) { stato.textContent = String(e instanceof Error ? e.message : e); }
  };
  const lavoro = (titolo: string, fn: (avanza: (k: number | null, t: string) => void, segnale: AbortSignal) => Promise<unknown>, id: string) => {
    if (occupato) return;
    occupato = true; disegna();
    void inCoda({ titolo, categoria: 'ai', corsia: 'pesante', chiave: 'motore-ai-modello:' + id, restaDopoCambio: true }, async (l) => {
      await fn((k, t) => { l.imposta(k, t); stato.textContent = t; }, l.segnale);
    }).finally(() => { occupato = false; void leggi(); });
  };
  for (const funzione of funzioni) {
    const { id, nome } = MODELLO_DI[funzione];
    const reg = funzioneAI(FUNZIONE_DEL_MODELLO[id]);
    const presenza = h('span', { class: 'fun-presenza' }, '…');
    const scarica = h('button', { class: 'btn-mini', disabled: true, on: { click: () => lavoro(`Scarico ${nome}`, async (avanza, segnale) => {
      const s = await motoreAI.stato();
      if (s.stato === 'non-installato' || s.stato === 'installazione') throw new Error(servePerFunzione(funzione, 'motore'));
      await motoreAI.azione('accendi', avanza, segnale);
      await motoreAI.lavoro('/modelli/scarica', { modello: id }, avanza, segnale);
    }, id) } }, 'Scarica') as HTMLButtonElement;
    const togli = h('button', { class: 'btn-mini', disabled: true, title: 'Toglie dal computer i pesi di questo modello e il suo ambiente Python', on: { click: () => lavoro(`Tolgo ${nome}`, async (avanza, segnale) => {
      await preparaMotore(motoreAI, funzione, avanza, segnale, () => true).catch(() => {}); // il motore acceso basta: il modello può anche mancare
      await motoreAI.togliModello(id);
      avviso(`${nome} tolto dal computer`, 'ok', 2400);
    }, id) } }, 'Togli') as HTMLButtonElement;
    const el = h('div', { class: 'fun-riga', 'data-modello': id, 'data-stato': reg?.stato ?? 'opzionale' },
      h('div', { class: 'fun-testo' }, h('b', null, nome), reg ? h('small', { class: 'fun-peso' }, etichettaStato(reg), ' ', rigaStato(reg).split(' · ').slice(1).join(' · ')) : h('small', null, ''), presenza),
      h('div', { class: 'fun-azioni' }, scarica, togli));
    righe.set(id, { el, presenza, scarica, togli });
    elenco.append(el);
  }
  disegna();
  void leggi();
  return h('section', { class: 'ai-sezione fun-ai', 'data-ai': 'modelli-motore' }, h('h4', null, 'Modelli del motore AI locale — Opzionali'),
    h('p', { class: 'nota' }, 'Traduzione, voce pulita, voce e musica, tagli automatici, rallentatore fluido e parole con i tempi. Licenze permissive (Apache-2.0, MIT). Niente si scarica da solo: scegli tu, uno alla volta. Ogni modello ha il suo ambiente Python, quindi prevedi altri 0,5–6 GB.'),
    stato, elenco,
    h('div', { class: 'ai-riga' }, h('button', { class: 'btn-mini', on: { click: () => void leggi() } }, 'Controlla cosa c\'è')));
}

/** l'interruttore di Clear (licenza non permissiva) per le impostazioni del Centro AI */
export function interruttoreClear(): HTMLElement {
  const spunta = h('input', { type: 'checkbox', checked: clearAttivo() }) as HTMLInputElement;
  spunta.addEventListener('change', () => {
    impostaClearAttivo(spunta.checked);
    avviso(spunta.checked ? 'Clear acceso: «Voce migliorata» è di nuovo fra le scelte' : 'Clear spento: «Voce migliorata» non compare più', 'info', 3200);
  });
  return h('label', { class: 'ai-imp spunta-riga', title: 'Clear di Desert Ant Labs ha una licenza source-available, NON permissiva: gratis sotto i 100.000 dispositivi al mese, scritta «Powered by Desert Ant Labs», conteggio d\'uso anonimo. Spento, non viene mai caricato.' }, spunta, ' Usa Clear per «Voce migliorata» (licenza non permissiva, vedi Info)');
}
