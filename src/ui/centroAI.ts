// Il Centro AI: tutte le funzioni intelligenti in un posto solo (menu AI, pulsante ✨ AI in alto, Ctrl+K). Prima erano
// sparse (sottotitoli e voce nel Finale, lo sfondo nelle proprietà della clip, il montaggio automatico in una pagina a
// parte) e non si capiva cosa serviva per usarle. Qui per ognuna: cosa fa, come si usa in tre passi, cosa serve, se il
// modello è già sul computer, e il pulsante che porta dritto al punto giusto. Sotto, "Controlla l'AI" (la diagnosi) e
// le impostazioni: la scheda video sì o no, lo spazio occupato dai modelli, il motore NVIDIA.
import { store } from '../core/store';
import type { Clip } from '../core/tipi';
import { isVideoClip } from '../core/progetto';
import { clipEsplicita } from '../core/flussiUI';
import { sottotitoliDi } from '../core/sottotitoli';
import { MODELLI } from '../media/voce';
import { MODELLI_RITAGLIO } from '../media/ritaglio';
import { MODELLO_TRADUZIONE } from '../media/traduci';
import { MODELLO_RUMORE, MODELLO_SEPARAZIONE, installaRumore, installaSeparazione, possibilita, togliModelloRumore, togliSeparazione } from '../media/audioAI';
import { disinstallaMotore, motoreNemo } from '../media/nemo';
import { diagnosi, modelliScaricati, svuotaModelli, type Diagnosi } from '../media/diagnosiAI';
import { LS_CHIAVE_HF, chiaveHFSalvata, impostaSchedaAI, usaSchedaAI } from '../media/libreriaAI';
import { hardwareNoto, raccontaHardware, rilevaHardware } from '../media/hardware';
import { idoneitaAI } from '../media/idoneitaAI';
import { spiegaErroreAI } from '../media/erroriAI';
import { avviso, conferma, dialogo, evidenzia, h } from './dom';
import { vaiFinale, vaiPagina, vaiSezione } from './guida';
import { fonteCerca } from './cerca';
import { modelliHub, statoModelli, type ModelloHub } from '../media/modelliAI';
import { liberaVram } from '../media/vram';
import { registra as reg } from '../azioni';
import '../stile/copieAI.css';
import { schedaMotoreLocale } from './motoreAI';
import { FUNZIONI_AI as REGISTRO_AI } from '../core/funzioniAI';
import { etichettaStato, ordinaPerStato, pesoDaMb, pesoEVram } from '../core/schedaAI';
import { faiRallentaFluido, faiSottotitoliParole, faiTrovaScene, faiVocePulitaMotore, faiVoceMusicaMotore, interruttoreClear, schedaModelliMotore } from './funzioniMotoreUI';

export interface FunzioneAI {
  id: string;
  nome: string;
  icona: string;
  cosaFa: string;
  come: string[];
  /** dove gira: 'tutto' = app e browser, 'app' = solo nell'app (motore NVIDIA) */
  dove: 'tutto' | 'app' | 'locale';
  /** i modelli che usa (indirizzi su Hugging Face) e quanto pesano circa */
  modelli?: { repo: string; nome: string; mb?: number }[];
  /** se adesso non si può usare, perché (e cosa fare) */
  manca: () => string | null;
  /** porta al punto giusto del programma */
  apri: () => void;
  /** per chi ha un modello grosso da scaricare a parte: i pulsanti "Scarica ora" e "Togli il modello" */
  installa?: () => Promise<void>;
  togli?: () => Promise<unknown>;
}

const haAudio = () => store.doc.clips.some((c) => c.kind === 'media' && store.doc.tracks.find((t) => t.id === c.track)?.kind === 'audio');
const haSottotitoli = () => sottotitoliDi(store.doc).righe.some((r) => r.testo.trim());

/** la clip su cui lavorare: quella scelta (video o immagine), o quella più in alto sotto il cursore (e la si sceglie) */
export function clipVideoDaUsare(_scegli = true) {
  return clipEsplicita(store.doc.clips, store.sel, (c) => c.kind === 'media' && isVideoClip(c, store.doc));
}
export function clipAudioDaUsare(_scegli = true) {
  return clipEsplicita(store.doc.clips, store.sel, (c: Clip) => possibilita(c, store.doc).rumore);
}
const MANCA_AUDIO = 'Scegli una clip audio (o una ripresa con l\'audio) nella timeline: la selezione deve essere esplicita';

export const FUNZIONI_AI: FunzioneAI[] = [
  {
    id: 'sottotitoli', nome: 'Sottotitoli automatici', icona: '💬', dove: 'tutto',
    cosaFa: 'Ascolta i dialoghi del montaggio e scrive i sottotitoli con i loro tempi.',
    come: ['Metti in timeline i video con l\'audio', 'Scegli la lingua e premi "Scrivi i sottotitoli"', 'Correggi le righe nella riga SOTT della timeline (doppio clic sul testo) ed esporta il .srt o il .vtt'],
    modelli: [...MODELLI.map((m) => ({ repo: m.id, nome: `Whisper ${m.nome}`, mb: m.mb }))],
    manca: () => (haAudio() ? null : 'Metti in timeline un video con l\'audio dei dialoghi'),
    apri: () => { vaiFinale('sottotitoli'); evidenzia('[data-ai="sottotitoli"]'); },
  },
  {
    id: 'traduci', nome: 'Traduci i sottotitoli', icona: '🌍', dove: 'app',
    cosaFa: 'Traduce le righe in un\'altra lingua (nove lingue, anche cinese, giapponese, arabo); i tempi restano.',
    come: ['Prima servono i sottotitoli', 'Scegli la lingua d\'arrivo', 'Premi "Traduci i sottotitoli" (Ctrl+Z torna indietro)'],
    modelli: [{ repo: MODELLO_TRADUZIONE.repo, nome: 'Hy-MT2 1.8B (motore AI locale)', mb: MODELLO_TRADUZIONE.mb }],
    manca: () => (haSottotitoli() ? null : 'Prima servono i sottotitoli (scritti a mano o dall\'AI)'),
    apri: () => { vaiFinale('lingue'); evidenzia('[data-ai="traduci"]'); },
  },
  {
    id: 'voce', nome: 'Voce AI (doppiaggio)', icona: '🗣', dove: 'app',
    cosaFa: 'Una voce sintetica legge i sottotitoli; ogni frase diventa una clip al suo posto.',
    come: ['Servono i sottotitoli', 'Scegli la voce e la lingua', 'Premi "Fai parlare i sottotitoli"'],
    manca: () => (!motoreNemo() ? 'La voce AI c\'è solo nell\'app per Windows e Mac (usa il motore NVIDIA)' : haSottotitoli() ? null : 'Prima servono i sottotitoli'),
    apri: () => { vaiFinale('lingue'); evidenzia('[data-ai="voce"]'); },
  },
  {
    id: 'sfondo', nome: 'Togli lo sfondo', icona: '🪄', dove: 'tutto',
    cosaFa: 'Stacca la persona o il soggetto dallo sfondo, anche senza green screen; o un oggetto coi clic.',
    come: ['Scegli la clip (o metti il cursore sopra)', 'Proprietà → Togli lo sfondo → AI · automatico (parte da sola) o AI · scegli tu (clicchi: la selezione compare subito; premi OK per la clip intera, oppure Anteprima e poi Genera tutta la clip)', 'Persona/Oggetto nella barra del monitor cambia il tipo di selezione; guarda il risultato col tasto SFONDO'],
    modelli: MODELLI_RITAGLIO.map((m) => ({ repo: m.repo[0], nome: m.nome })),
    manca: () => (clipVideoDaUsare(false) ? null : 'Scegli una clip video o un\'immagine nella timeline (o mettici sopra il cursore)'),
    apri: () => { clipVideoDaUsare(true); vaiSezione('sfondo'); },
  },
  {
    id: 'rumore', nome: 'Togli i rumori', icona: '🎙', dove: 'tutto',
    cosaFa: 'Toglie il rumore di fondo da un parlato (ventola, fruscio, strada, riverbero) e lascia la voce chiara. È MossFormer2 di ClearerVoice (Alibaba), un\'AI fatta per la voce: lavora sul computer.',
    come: ['Scegli la clip audio (o la ripresa con l\'audio)', 'Proprietà → Audio AI → Togli i rumori, e scegli: Voce pulita, Naturale (tiene un po\' di stanza) o Voce isolata (via musica o TV sotto)', 'La prima volta si scarica il modello (94 MB). Aspetta la barra in basso a destra: Ctrl+Z torna com\'era, "Audio originale" rimette il file di prima'],
    modelli: [{ repo: MODELLO_RUMORE.repo, nome: MODELLO_RUMORE.nome, mb: Math.round(MODELLO_RUMORE.peso / 1048576) }],
    manca: () => (clipAudioDaUsare(false) ? null : MANCA_AUDIO),
    apri: () => { clipAudioDaUsare(true); vaiSezione('audioai'); },
    installa: () => installaRumore(),
    togli: () => togliModelloRumore(),
  },

  {
    id: 'separa', nome: 'Voce e base', icona: '🎤', dove: 'tutto',
    cosaFa: 'Divide una canzone in voce (il cantato) e base (la musica), su due tracce nuove, così puoi abbassare la voce, fare un karaoke o tenere solo il cantato. Usa Demucs, un\'AI per la musica.',
    come: ['Scegli la clip della canzone', 'Proprietà → Audio AI → Separa voce e base', 'La prima volta si scarica il modello (172 MB); senza, c\'è la separazione rapida (meno precisa)'],
    modelli: [{ repo: MODELLO_SEPARAZIONE.repo, nome: MODELLO_SEPARAZIONE.nome, mb: Math.round(MODELLO_SEPARAZIONE.peso / 1048576) }],
    manca: () => (clipAudioDaUsare(false) ? null : MANCA_AUDIO),
    apri: () => { clipAudioDaUsare(true); vaiSezione('audioai'); },
    installa: () => installaSeparazione(),
    togli: () => togliSeparazione(),
  },
  {
    id: 'scene', nome: 'Trova i tagli automatici', icona: '🎬', dove: 'app',
    cosaFa: 'Guarda una ripresa e mette dei marcatori dove cambia la scena (TransNetV2): li sposti o li cancelli, e «Taglia alle scene» li fa diventare tagli.',
    come: ['Scegli la ripresa nella timeline', 'Menu AI → Trova i tagli automatici', 'Sposta o cancella i marcatori «Scena», poi Taglia la clip alle scene (Ctrl+Z torna indietro)'],
    modelli: [{ repo: 'elya5/transnetv2', nome: 'TransNetV2 (motore AI locale)', mb: 31 }],
    manca: () => (clipVideoDaUsare(false) ? null : 'Scegli una ripresa video nella timeline'),
    apri: () => { const c = clipVideoDaUsare(true); if (c) void faiTrovaScene(c.id); else avviso('Scegli una ripresa video nella timeline', 'info', 3000); },
  },
  {
    id: 'voce-pulita', nome: 'Voce pulita (motore locale)', icona: '🎙', dove: 'app',
    cosaFa: 'DeepFilterNet3 nel motore locale: toglie i rumori da un parlato e fa un audio nuovo; l\'originale si conserva.',
    come: ['Scegli la clip audio', 'Menu AI → Voce pulita (motore locale)', 'Se non ti piace: «Audio originale» o Ctrl+Z'],
    modelli: [{ repo: 'Rikorose/DeepFilterNet', nome: 'DeepFilterNet3 (motore AI locale)', mb: 8 }],
    manca: () => (clipAudioDaUsare(false) ? null : MANCA_AUDIO),
    apri: () => { const c = clipAudioDaUsare(true); if (c) void faiVocePulitaMotore(c.id); else avviso(MANCA_AUDIO, 'info', 3000); },
  },
  {
    id: 'voce-musica', nome: 'Voce e musica (Kim Vocal 2)', icona: '🎤', dove: 'app',
    cosaFa: 'Divide il cantato dalla musica su due tracce nuove con Kim Vocal 2 (motore locale). L\'originale resta in silenzio.',
    come: ['Scegli la clip della canzone', 'Menu AI → Voce e musica (Kim Vocal 2)', 'Ctrl+Z rimette tutto'],
    modelli: [{ repo: 'KimberleyJSN/melbandroformer', nome: 'Kim Vocal 2 (motore AI locale)', mb: 900 }],
    manca: () => (clipAudioDaUsare(false) ? null : MANCA_AUDIO),
    apri: () => { const c = clipAudioDaUsare(true); if (c) void faiVoceMusicaMotore(c.id); else avviso(MANCA_AUDIO, 'info', 3000); },
  },
  {
    id: 'sottotitoli-parole', nome: 'Sottotitoli con parole e tempi', icona: '📝', dove: 'app',
    cosaFa: 'Qwen3-ASR scrive i dialoghi e il ForcedAligner mette ogni parola al suo tempo: righe di sottotitolo modificabili (motore locale).',
    come: ['Metti in timeline i video con i dialoghi', 'Menu AI → Sottotitoli con parole e tempi', 'Correggi le righe nella riga SOTT'],
    modelli: [{ repo: 'Qwen/Qwen3-ASR-0.6B', nome: 'Qwen3-ASR + ForcedAligner (motore AI locale)', mb: 3700 }],
    manca: () => (haAudio() ? null : 'Metti in timeline un video con l\'audio dei dialoghi'),
    apri: () => { void faiSottotitoliParole(); },
  },
  {
    id: 'rallenta', nome: 'Rallentatore fluido (sperimentale)', icona: '🐌', dove: 'app',
    cosaFa: 'RIFE inventa i fotogrammi in mezzo e fa una clip nuova più lenta (fino a 12 secondi). SPERIMENTALE: non ancora collaudato col modello vero.',
    come: ['Taglia la ripresa a meno di 12 secondi (tasto 1)', 'Menu AI → Rallentatore fluido', 'La clip nuova sta sopra l\'originale, che resta'],
    modelli: [{ repo: 'Comfy-Org/Frame-Interpolation', nome: 'RIFE 4.25 (motore AI locale)', mb: 23 }],
    manca: () => (clipVideoDaUsare(false) ? null : 'Scegli una ripresa video nella timeline'),
    apri: () => { const c = clipVideoDaUsare(true); if (c) void faiRallentaFluido(c.id); else avviso('Scegli una ripresa video nella timeline', 'info', 3000); },
  },
  {
    id: 'segui', nome: 'Segui un oggetto', icona: '🎯', dove: 'locale',
    cosaFa: 'Segue qualcosa nella ripresa: un titolo, un\'immagine o un effetto gli stanno dietro. Stabilizza la ripresa.',
    come: ['Scegli la ripresa', 'Proprietà → Segui un oggetto → 🎯 e clicca l\'oggetto sul monitor', 'Sulle altre clip scegli "segue"'],
    manca: () => (clipVideoDaUsare(false) ? null : 'Scegli una ripresa nella timeline (o mettici sopra il cursore)'),
    apri: () => { clipVideoDaUsare(true); vaiSezione('segui'); },
  },
  {
    id: 'montage', nome: 'Montaggio automatico', icona: '✨', dove: 'locale',
    cosaFa: 'Da foto e video alla rinfusa un montaggio a tempo di musica, in 28 stili (matrimonio, viaggio, reel…).',
    come: ['Apri DaProdMontage (F8) e aggiungi i file', 'Scegli lo stile, la durata e il brano', 'Crea, rigenera finché ti piace, importa'],
    manca: () => null,
    apri: () => vaiPagina('montage'),
  },
  {
    id: 'colore', nome: 'Colore automatico', icona: '🎨', dove: 'locale',
    cosaFa: 'Sistema livelli, bianco e luce di ogni ripresa da solo, perché tutte stiano bene insieme.',
    come: ['F9 apre il Finale → Colore', 'Accendi Colore automatico e premi Misura ora', 'Scegli un look se vuoi un tono'],
    manca: () => null,
    apri: () => vaiFinale('colore'),
  },
];

const mb = (b: number) => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(1).replace('.', ',') + ' GB' : Math.max(1, Math.round(b / (1 << 20))) + ' MB');

/** quanto spazio prendono i modelli sul computer (lo usano il Centro AI e la pagina iniziale) */
export async function spazioModelli(): Promise<{ n: number; byte: number; testo: string }> {
  const m = await modelliScaricati();
  const byte = [...m.values()].reduce((s, x) => s + x, 0);
  return { n: m.size, byte, testo: m.size ? `${m.size} modelli sul computer · ${mb(byte)}` : 'Nessun modello scaricato' };
}

/** com'è messa la scorta di modelli: anche quelli consigliati restano opzionali */
export async function riassuntoModelli(): Promise<{ pronti: number; totale: number; consigliati: number; consigliatiPronti: number }> {
  const lista = modelliHub();
  const st = await statoModelli(lista);
  const pronto = (m: ModelloHub) => st.get(m.id)?.stato === 'pronto';
  const cons = lista.filter((m) => m.consigliato);
  return { pronti: lista.filter(pronto).length, totale: lista.length, consigliati: cons.length, consigliatiPronti: cons.filter(pronto).length };
}

export interface OpzioniRiparaAI {
  lista?: ModelloHub[];
  /** cosa sto facendo adesso, a parole */
  passo?: (testo: string) => void;
  dopoDiagnosi?: (g: Diagnosi) => void;
  /** il motore non partiva con la scheda video e l'ho spenta */
  schedaSpenta?: () => void;
}

/**
 * Controlla il motore AI, la scheda video, la rete e i modelli già presenti. Non scarica modelli: si scelgono uno per
 * uno nel Centro AI. Vale anche da «Aggiusta tutto» della pagina iniziale. `testo` è la frase da dire.
 */
export async function riparaAI(o: OpzioniRiparaAI = {}): Promise<{ ok: boolean; testo: string }> {
  const passo = o.passo ?? (() => {});
  const lista = o.lista ?? modelliHub();
  try {
    passo('Controllo il motore AI, la scheda video e la connessione…');
    let g = await diagnosi();
    // il motore non parte con la scheda video: si prova sul processore
    if (!g.libreria.ok && usaSchedaAI()) {
      impostaSchedaAI(false); o.schedaSpenta?.();
      passo('Il motore non parte con la scheda video: provo sul processore…');
      g = await diagnosi();
    }
    o.dopoDiagnosi?.(g);
    if (!g.libreria.ok) return { ok: false, testo: 'Il motore AI non parte nemmeno sul processore: aggiorna DaProd Editor Video o guarda le righe qui sotto.' };
    const st = await statoModelli(lista);
    const pronti = lista.filter((m) => st.get(m.id)?.stato === 'pronto').length;
    return { ok: true, testo: `Il motore funziona. ${pronti} modelli sul computer; gli altri sono opzionali: scegli «Scarica» nel Centro AI se ti servono. Nessun modello scaricato dal controllo.` };
  } catch (e) { return { ok: false, testo: 'Non sono riuscito a sistemare tutto: ' + spiegaErroreAI(e) }; }
}

/** la finestra del Centro AI: un posto solo per controllare i modelli (e il motore). Le funzioni si usano dalle Proprietà. */
export function finestraCentroAI(subito = false) {
  const d = dialogo('Centro AI · i modelli', { largo: true, onChiudi: () => document.removeEventListener('dpv:hardware', aggiornaHardware) });
  d.el.classList.add('centro-ai');
  let lista = modelliHub();
  let hardware = hardwareNoto();
  const righe = new Map<string, { el: HTMLElement; stato: HTMLElement; msg: HTMLElement; peso: HTMLElement; macchina: HTMLElement; scarica: HTMLButtonElement; togli: HTMLButtonElement }>();
  let occupato = false;

  /** com'è messo ogni modello, dalla cache e da quello che si è caricato davvero */
  const disegna = async () => {
    const st = await statoModelli(lista);
    for (const m of lista) {
      const r = righe.get(m.id)!;
      const s = st.get(m.id)!;
      r.el.dataset.stato = s.stato;
      r.stato.className = 'hub-stato ' + s.stato;
      r.stato.textContent = s.stato === 'pronto' ? `✓ sul computer${s.bytes ? ' · ' + mb(s.bytes) : ''}` : s.stato === 'parziale' ? '◐ da completare' : '⬇ da scaricare' + (m.mb ? ` · ~${m.mb} MB` : '');
      r.scarica.textContent = s.stato === 'pronto' ? 'Ricontrolla' : s.stato === 'parziale' ? 'Completa' : 'Scarica';
      r.togli.disabled = s.stato === 'da-scaricare';
      r.scarica.disabled = occupato;
      r.togli.disabled ||= occupato;
      r.peso.textContent = pesoEVram({ peso: m.mb ? 'circa ' + pesoDaMb(m.mb) : undefined, vram: 'non misurabile dal browser' }).riga + ' · resta su questo computer';
      const idoneita = idoneitaAI(m, hardware, usaSchedaAI());
      r.macchina.textContent = `${idoneita.dove} · ${idoneita.testo}`;
      r.macchina.dataset.esito = idoneita.ok === false ? 'lento' : 'stima';
    }
  };

  /** scarica (o ricarica dalla cache) un modello per la strada dell'uso vero, con il testo di avanzamento sulla sua riga */
  const scarica = async (m: ModelloHub): Promise<boolean> => {
    const r = righe.get(m.id)!;
    r.msg.textContent = 'Preparo…';
    r.el.classList.add('lavora');
    try {
      await m.scarica((fase, k) => { r.msg.textContent = fase + (k > 0 && k < 1 ? ` · ${Math.round(k * 100)}%` : ''); });
      r.msg.textContent = '';
      return true;
    } catch (e) {
      r.msg.textContent = '';
      avviso(`${m.nome}: ${spiegaErroreAI(e)}`, 'errore', 7000);
      return false;
    } finally { r.el.classList.remove('lavora'); }
  };
  const bloccaTutto = (si: boolean) => { occupato = si; for (const r of righe.values()) { r.scarica.disabled = si; if (si) r.togli.disabled = true; } };

  const gruppi = [...new Set(lista.map((m) => m.gruppo))];
  const tabella = h('div', { class: 'hub' }, gruppi.flatMap((g) => [
    h('h4', { class: 'hub-gruppo' }, g),
    ...lista.filter((m) => m.gruppo === g).map((m) => {
      const stato = h('span', { class: 'hub-stato' }, '…');
      const msg = h('small', { class: 'hub-msg' });
      const peso = h('small', { class: 'hub-peso' });
      const macchina = h('small', { class: 'hub-macchina' });
      const attuale = () => lista.find((x) => x.id === m.id)!;
      const bScarica = h('button', { class: 'btn-mini', disabled: true, on: { click: async () => { bloccaTutto(true); await scarica(attuale()); bloccaTutto(false); await disegna(); void aggSpazio(); } } }, 'Scarica') as HTMLButtonElement;
      const bTogli = h('button', { class: 'btn-mini', disabled: true, title: 'Toglie il modello dal computer (potrai scaricarlo di nuovo)', on: { click: async () => { bloccaTutto(true); try { await attuale().togli(); } finally { bloccaTutto(false); await disegna(); void aggSpazio(); } } } }, 'Togli') as HTMLButtonElement;
      const dettagli = h('details', { class: 'hub-dettagli' }, h('summary', { title: 'Dettagli e altre azioni', 'aria-label': `Dettagli ${m.nome}` }, '⋯'), h('div', { class: 'hub-dettagli-corpo' }, h('p', null, m.uso), h('p', null, m.info), peso, macchina, bTogli));
      const el = h('div', { class: 'hub-riga', 'data-m': m.id }, h('div', { class: 'hub-nome' }, h('b', null, m.nome), msg), stato, bScarica, dettagli);
      righe.set(m.id, { el, stato, msg, peso, macchina, scarica: bScarica, togli: bTogli });
      return el;
    }),
  ]));
  void disegna();
  function aggiornaHardware() {
    hardware = hardwareNoto();
    lista = modelliHub(); // anche il peso di MossFormer cambia fra scheda video e processore
    void disegna();
  }
  document.addEventListener('dpv:hardware', aggiornaHardware);
  void rilevaHardware().then(aggiornaHardware).catch(() => {
    for (const r of righe.values()) r.macchina.textContent = 'Hardware non rilevato: prestazioni da verificare; è disponibile il processore.';
  });

  // ——— controlla: nessun modello viene scaricato da questo tasto, nemmeno con subito=true
  const esito = h('div', { class: 'ai-diagnosi' });
  const progresso = h('p', { class: 'nota hub-progresso' });
  const ripara = h('button', { class: 'btn primario ai-ripara', on: { click: () => { (d.el.querySelectorAll('.ai-schede button')[2] as HTMLButtonElement)?.click(); const dettagli = impostazioni.querySelector('details'); if (dettagli) dettagli.open = true; void fai(); } } }, 'Controlla AI') as HTMLButtonElement;
  async function fai() {
    if (occupato) return;
    ripara.disabled = true;
    bloccaTutto(true);
    try {
      const r = await riparaAI({ lista, passo: (t) => { progresso.textContent = t; }, dopoDiagnosi: (g) => disegnaDiagnosi(esito, g), schedaSpenta: () => { scheda.checked = false; aggiornaHardware(); } });
      progresso.textContent = r.testo;
    } finally { ripara.disabled = false; bloccaTutto(false); await disegna(); void aggSpazio(); }
  }

  // ——— le impostazioni
  const scheda = h('input', { type: 'checkbox', checked: usaSchedaAI() }) as HTMLInputElement;
  scheda.addEventListener('change', () => { impostaSchedaAI(scheda.checked); aggiornaHardware(); });
  // la chiave di Hugging Face: serve ai modelli «gated» se richiesto (si crea gratis su huggingface.co → Settings → Access Tokens)
  const chiaveHF = h('input', { type: 'password', class: 'campo-testo', placeholder: 'hf_…', value: chiaveHFSalvata(), 'aria-label': 'Chiave Hugging Face', autocomplete: 'off' }) as HTMLInputElement;
  const salvaChiave = h('button', { class: 'btn-mini', on: { click: () => {
    try {
      if (chiaveHF.value.trim()) localStorage.setItem(LS_CHIAVE_HF, chiaveHF.value.trim()); else localStorage.removeItem(LS_CHIAVE_HF);
      avviso(chiaveHF.value.trim() ? 'Chiave salvata: vale dal prossimo scaricamento' : 'Chiave tolta', 'ok', 2400);
    } catch { avviso('Non riesco a cambiare la chiave: il browser non permette di salvare le impostazioni. Controlla lo spazio e i permessi, poi riprova.', 'errore', 6000); }
  } } }, 'Salva');
  const spazio = h('span', { class: 'nota' }, '…');
  const aggSpazio = async () => { spazio.textContent = (await spazioModelli()).testo; };
  void aggSpazio();
  const svuota = h('button', { class: 'btn-mini', on: { click: async () => {
    if (!(await conferma('Libera lo spazio dei modelli', 'I modelli AI scaricati si tolgono dal computer. Si riscaricano da qui, o da soli la prossima volta che servono (serve internet).', 'Toglili', 'Annulla'))) return;
    await svuotaModelli();
    try { localStorage.removeItem('dpv-modelli-pronti'); } catch { /* niente */ }
    await disegna(); await aggSpazio();
  } } }, 'Libera lo spazio');
  const liberaMemoria = h('button', { class: 'btn-mini', title: 'Chiude i modelli caricati nella scheda video (SAM 2.1, Whisper, traduzione). Non toglie nulla dal computer: i modelli già sul computer si ricaricano in pochi secondi al prossimo uso. Succede da solo dopo un minuto e mezzo senza AI.', on: { click: () => { const n = liberaVram(); avviso(n ? `Scheda video liberata: ${n} ${n === 1 ? 'modello scaricato' : 'modelli scaricati'} dalla memoria` : 'Nella scheda video non c\'è niente da liberare (o un lavoro AI sta girando)', n ? 'ok' : 'info', 2600); } } }, 'Libera la memoria della scheda video');
  const nvidia = motoreNemo() ? h('div', { class: 'ai-imp' },
    h('span', null, 'Motore NVIDIA (sottotitoli e voce nell\'app)'),
    h('button', { class: 'btn-mini', on: { click: async () => {
      if (!(await conferma('Togli il motore NVIDIA', 'Il motore e i suoi modelli si tolgono dal computer. Si riscaricano la prossima volta che servono.', 'Toglilo', 'Annulla'))) return;
      await disinstallaMotore(true).catch(() => {});
      await aggSpazio();
    } } }, 'Togli motore e modelli')) : null;

  const funzioni = schedeRegistro(d.chiudi, () => void fai());
  const modelli = h('div', { class: 'ai-pagina', hidden: true }, schedaModelliMotore(), tabella);
  const impostazioni = h('div', { class: 'ai-pagina', hidden: true },
    schedaMotoreLocale(),
    h('details', { class: 'ai-sezione' }, h('summary', null, 'Diagnosi'), progresso, esito),
    h('section', { class: 'ai-sezione' }, h('h4', null, 'Impostazioni'),
      h('label', { class: 'ai-imp spunta-riga' }, scheda, ' Usa la scheda video'), interruttoreClear(),
      h('div', { class: 'ai-imp' }, spazio, svuota),
      h('div', { class: 'ai-imp' }, liberaMemoria),
      h('div', { class: 'ai-imp ai-chiave' }, h('span', null, 'Chiave Hugging Face'), chiaveHF, salvaChiave), nvidia));
  const pagine = [funzioni, modelli, impostazioni];
  const schede = h('nav', { class: 'ai-schede', 'aria-label': 'Centro AI' });
  ['Funzioni', 'Modelli', 'Impostazioni'].forEach((nome, i) => {
    const b = h('button', { class: 'btn-mini', 'aria-pressed': i === 0 ? 'true' : 'false', on: { click: () => {
      pagine.forEach((p, j) => { p.hidden = i !== j; });
      schede.querySelectorAll('button').forEach((t, j) => t.setAttribute('aria-pressed', String(i === j)));
    } } }, nome);
    schede.append(b);
  });
  d.corpo.append(schede, ...pagine);
  d.piede.append(ripara, h('button', { class: 'btn', on: { click: () => { d.chiudi(); document.dispatchEvent(new CustomEvent('dpv:guida', { detail: 'problemi-ai' })); } } }, '❓ Se un\'AI non parte'), h('span', { class: 'spazio' }), h('button', { class: 'btn chiudi', on: { click: d.chiudi } }, 'Chiudi'));
  if (subito) ripara.click();
  return d;
}

/** le funzioni del registro AI (src/core/funzioniAI.ts), una scheda per ognuna: cartellino, peso, VRAM e il tasto per usarla */
function schedeRegistro(chiudi: () => void, controlla: () => void): HTMLElement {
  const sez = h('section', { class: 'ai-pagina', 'data-ai': 'registro' });
  const ricerca = h('input', { class: 'campo-testo', type: 'search', placeholder: 'Cerca una funzione', 'aria-label': 'Cerca una funzione AI' }) as HTMLInputElement;
  const filtri = h('div', { class: 'ai-filtri', 'aria-label': 'Filtra funzioni' });
  const griglia = h('div', { class: 'sch-funzioni' });
  const pagina = h('span', { class: 'ai-pagina-num', 'aria-live': 'polite' });
  let filtro = 'Tutte', indice = 0;
  const precedente = h('button', { class: 'btn-mini', on: { click: () => { indice--; disegna(); } } }, '‹') as HTMLButtonElement;
  const successiva = h('button', { class: 'btn-mini', on: { click: () => { indice++; disegna(); } } }, '›') as HTMLButtonElement;
  precedente.setAttribute('aria-label', 'Pagina precedente'); successiva.setAttribute('aria-label', 'Pagina successiva');
  const categoria = (f: typeof REGISTRO_AI[number]) => f.dove === 'audio' ? 'Audio' : f.dove === 'finale' ? 'Testo' : 'Video';
  function disegna() {
    const q = ricerca.value.trim().toLocaleLowerCase('it');
    const lista = ordinaPerStato(REGISTRO_AI).filter((f) => (filtro === 'Tutte' || categoria(f) === filtro) && (f.nome + ' ' + f.descrizione).toLocaleLowerCase('it').includes(q));
    const pagine = Math.max(1, Math.ceil(lista.length / 12)); indice = Math.max(0, Math.min(indice, pagine - 1));
    precedente.disabled = indice === 0; successiva.disabled = indice === pagine - 1; pagina.textContent = `${indice + 1} / ${pagine}`;
    griglia.replaceChildren(...lista.slice(indice * 12, indice * 12 + 12).map((f) => {
      const guida = FUNZIONI_AI.find((x) => x.id === f.id);
      const nome = f.nome.replace(/ \(.*$/, '').slice(0, 24);
      const manca = guida?.manca();
      const descrizione = manca ? '⚠ ' + manca.slice(0, 52) : f.descrizione.split(/[.;(]/)[0].slice(0, 55);
      const peso = !f.peso || /nessun modello/i.test(f.peso) ? 'Integrata' : f.id === 'rumore' ? 'da 9 MB' : f.id === 'sottotitoli' ? 'da 40 MB' : (f.peso.match(/[\d,.]+(?:–[\d,.]+)?\s*(?:MB|GB)/i)?.[0] ?? 'Peso da verificare');
      const info = h('button', { class: 'btn-mini ai-info', 'aria-label': `Informazioni su ${f.nome}`, title: 'Dettagli e requisiti', on: { click: () => {
        const d = dialogo(f.nome); d.corpo.append(h('p', null, f.descrizione), h('p', { class: 'sch-pesovram' }, pesoEVram(f).riga)); if (guida) d.corpo.append(h('p', null, guida.come.join(' · ')));
        d.piede.append(h('button', { class: 'btn', on: { click: d.chiudi } }, 'Chiudi'));
      } } }, 'i');
      const azione = h('button', { class: 'btn-mini', on: { click: () => {
        if (f.id === 'aggiusta') { controlla(); return; }
        if (guida) { chiudi(); guida.apri(); } else if (f.esegui) void f.esegui({ clipIds: [...store.sel] }).catch((e) => avviso(spiegaErroreAI(e), 'errore', 6000)); else { chiudi(); if (f.id === 'clear') vaiSezione('audioai'); else vaiFinale(f.id === 'sottotitoli-nemotron' ? 'sottotitoli' : 'lingue'); }
      } } }, f.id === 'aggiusta' ? 'Controlla' : 'Apri');
      return h('article', { class: 'sch-funzione', 'data-funzione': f.id },
        h('div', { class: 'sch-funzione-testa' }, h('b', { title: f.nome }, guida?.icona ? guida.icona + ' ' + nome : nome), h('span', { class: 'sch-cartellino', 'data-stato': f.stato }, etichettaStato(f.stato))),
        h('p', { title: manca || f.descrizione, class: manca ? 'ai-manca' : '' }, descrizione), h('div', { class: 'sch-funzione-azioni' }, h('span', { class: 'ai-chip' }, peso), info, azione));
    }));
  }
  for (const nome of ['Tutte', 'Video', 'Audio', 'Testo']) {
    const b = h('button', { class: 'btn-mini', 'aria-pressed': String(nome === filtro), on: { click: () => { filtro = nome; indice = 0; filtri.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); disegna(); } } }, nome); filtri.append(b);
  }
  ricerca.addEventListener('input', () => { indice = 0; disegna(); });
  sez.append(h('div', { class: 'ai-ricerca' }, ricerca, filtri), griglia, h('div', { class: 'ai-paginazione' }, precedente, pagina, successiva)); disegna(); return sez;
}

function disegnaDiagnosi(el: HTMLElement, g: Diagnosi) {
  const riga = (ok: boolean | null, titolo: string, testo: string) => h('div', { class: 'ai-diag ' + (ok === null ? 'forse' : ok ? 'ok' : 'no') }, h('span', { class: 'ai-diag-seg' }, ok === null ? '•' : ok ? '✓' : '✕'), h('b', null, titolo), h('span', null, testo));
  const tot = [...g.modelli.values()].reduce((s, x) => s + x, 0);
  el.replaceChildren(
    riga(g.libreria.ok, 'Motore AI', g.libreria.ok
      ? `parte (${g.libreria.dove === 'locale' ? 'dai file dell\'app' : 'dalla CDN'}, ${(g.libreria.ms / 1000).toFixed(1).replace('.', ',')} s)`
      : `non parte: ${g.libreria.msg}`),
    ...(g.hardware && g.hardware.gpuApi && g.hardware.schede.length
      ? [riga(g.hardware.scelta >= 0 ? true : null, 'Scheda video', usaSchedaAI() ? (g.hardware.scelta >= 0 ? 'ho provato quelle del computer: l\'AI usa la migliore (qui sotto)' : 'nessuna ha superato la prova: l\'AI usa il processore') : 'adesso è spenta nelle impostazioni: l\'AI usa il processore'),
        ...raccontaHardware(g.hardware).map((r) => riga(r.ok, r.titolo, r.testo))]
      : [riga(g.scheda ? true : null, 'Scheda video', g.scheda ? `${g.scheda}: l'AI la usa quando può${usaSchedaAI() ? '' : ' (adesso è spenta nelle impostazioni)'}` : 'non disponibile per l\'AI: si usa il processore (va bene, solo più lento)')]),
    riga(g.internet, 'Hugging Face', g.internet ? 'si raggiunge: i modelli si possono scaricare' : 'non si raggiunge: i modelli già scaricati vanno, per gli altri serve internet (o una rete che non blocchi huggingface.co)'),
    riga(g.modelli.size > 0 ? true : null, 'Modelli sul computer', g.modelli.size ? `${[...g.modelli.keys()].map((k) => k.split('/')[1]).join(', ')} · ${mb(tot)}` : 'nessuno ancora: ognuno si scarica la prima volta che serve'),
    g.nvidia ? riga(g.nvidia.installato ? true : null, 'Motore NVIDIA', g.nvidia.installato ? `installato (${g.nvidia.backend}${g.nvidia.nvidia ? ', scheda NVIDIA trovata' : ''})` : `non ancora: si scarica la prima volta (versione ${g.nvidia.consigliato === 'cuda' ? 'per la scheda NVIDIA' : g.nvidia.consigliato === 'metal' ? 'per il Mac' : 'per il processore'})`) : riga(null, 'Motore NVIDIA', 'solo nell\'app per Windows e Mac: qui si usano Whisper e gli altri modelli'),
    g.libreria.ok ? h('p', { class: 'nota' }, 'Tutto quello che serve c\'è. Se una funzione dà ancora errore, il messaggio ora spiega cosa fare; scrivilo a chi ti aiuta insieme a queste righe.') : h('p', { class: 'nota' }, 'Il motore AI non parte: aggiorna DaProd Editor Video all\'ultima versione o prova un altro browser (Chrome, Edge).'),
  );
}

// le funzioni AI si trovano anche con la ricerca dei comandi (Ctrl+K)
fonteCerca(() => FUNZIONI_AI.map((f) => ({ id: 'ai:' + f.id, titolo: f.nome, sotto: f.cosaFa, cat: 'AI' as const, parole: 'ai intelligenza artificiale ' + f.come.join(' '), fn: f.apri })));

reg({
  id: 'liberaVram', nome: 'Libera la memoria della scheda video (AI)', gruppo: 'AI',
  info: 'Scarica dalla scheda video i modelli AI che non stanno lavorando (SAM 2.1, Whisper, traduzione): torna la memoria a giochi e altri programmi. I modelli già sul computer si ricaricano in pochi secondi al prossimo uso.',
  fn: () => { const n = liberaVram(); avviso(n ? `Scheda video liberata: ${n} ${n === 1 ? 'modello scaricato' : 'modelli scaricati'}` : 'Nella scheda video non c\'è niente da liberare', n ? 'ok' : 'info', 2400); },
});
