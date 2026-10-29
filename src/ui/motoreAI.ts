// La scheda del motore e la voce realistica passano dalla coda delle Attività, compreso Riprova.
import { store } from '../core/store';
import { motoreAI, motoreLocaleDisponibile, base64DaByte, type AzioneLocale, type OpzioniVoceLocale } from '../media/motoreAI';
import { inCoda, progettoAttuale, type Lavoro } from '../media/attivita';
import { doppia, posaVoce } from '../media/doppiaggio';
import { codificaWav, leggiWav } from '../media/wav';
import { liberaVram } from '../media/vram';
import { salvaMediaSulDisco } from '../platform';
import { importaFile } from '../progetti';
import { avviso, h } from './dom';

export function schedaMotoreLocale(): HTMLElement {
  const stato = h('p', { class: 'nota' }, motoreLocaleDisponibile() ? 'Leggo lo stato…' : 'Disponibile nell’app per Windows x64.');
  const modello = h('p', { class: 'nota' }, 'Qwen3-TTS 0.6B Base · Apache-2.0 · circa 2,5 GB, tokenizer compreso.');
  const pulsanti: HTMLButtonElement[] = [];
  let occupato = false;
  const aggiorna = async () => {
    if (!motoreLocaleDisponibile()) return;
    try {
      const s = await motoreAI.stato();
      const nomi = { 'non-installato': 'Non installato', installazione: 'Installazione', pronto: 'Pronto, spento', avvio: 'Avvio', acceso: 'Acceso', errore: 'Da riprovare' };
      stato.textContent = `${nomi[s.stato]}${s.k !== null && s.stato === 'installazione' ? ' · ' + Math.round(s.k * 100) + '%' : ''} · ${s.dettaglio}`;
      pulsanti.forEach((b) => {
        const a = b.dataset.azione;
        b.disabled = occupato || (a === 'installa' && !['non-installato', 'errore'].includes(s.stato))
          || (a === 'accendi' && !['pronto', 'errore'].includes(s.stato))
          || (a === 'spegni' && !['acceso', 'avvio', 'installazione'].includes(s.stato))
          || (a === 'scarica' && !['pronto', 'acceso'].includes(s.stato));
      });
      if (s.stato === 'acceso') {
        const m = (await motoreAI.modelli())[0];
        modello.textContent = `${m.nome} · ${m.licenza} · circa ${(m.byte / 1e9).toFixed(1)} GB · ${m.scaricato ? 'Sul computer' : 'Da scaricare'}`;
      }
    } catch (e) { stato.textContent = String(e); }
  };
  const fai = (azione: AzioneLocale | 'scarica') => {
    if (occupato) return;
    occupato = true;
    pulsanti.forEach((b) => { b.disabled = true; });
    const interrompi = azione === 'spegni' || azione === 'disinstalla';
    void inCoda({ titolo: azione === 'scarica' ? 'Scarico Qwen3-TTS' : `${({ installa: 'Installo', accendi: 'Accendo', spegni: 'Spengo', disinstalla: 'Disinstallo' })[azione]} il motore AI locale`, categoria: 'ai', corsia: interrompi ? 'leggero' : 'pesante', chiave: interrompi ? 'motore-ai-interrompi' : 'motore-ai-locale', restaDopoCambio: true }, async (l) => {
      const avanza = (k: number | null, t: string) => { l.imposta(k, t); stato.textContent = t; };
      try {
        if (azione === 'scarica') {
          await motoreAI.azione('accendi', avanza, l.segnale);
          await motoreAI.lavoro('/modelli/scarica', {}, avanza, l.segnale);
        } else await motoreAI.azione(azione, avanza, l.segnale);
      } finally { occupato = false; await aggiorna(); }
    }).finally(() => { occupato = false; void aggiorna(); });
  };
  for (const [a, nome] of [['installa', 'Installa motore e torch CUDA'], ['accendi', 'Accendi'], ['spegni', 'Spegni'], ['disinstalla', 'Disinstalla motore e modelli'], ['scarica', 'Scarica Qwen3-TTS']] as const) {
    const b = h('button', { class: 'btn', 'data-azione': a, disabled: true, on: { click: () => fai(a) } }, nome);
    pulsanti.push(b);
  }
  void aggiorna();
  return h('section', { class: 'ai-sezione', 'data-ai': 'motore-locale' }, h('h4', null, 'Motore AI locale — Opzionale'),
    h('p', { class: 'nota' }, 'Voce realistica e clonazione in italiano da un campione di almeno 3 secondi. GPU NVIDIA 6+ GB consigliata, processore disponibile. Prevedi 15–25 GB liberi: Python, torch e CUDA pesano diversi GB; i pesi della voce si scaricano a parte. Montaggio ed export funzionano anche senza.'),
    h('p', { class: 'nota' }, 'Installa scarica Python privato, torch CUDA e le librerie. Scarica Qwen3-TTS prende i pesi da Hugging Face. Poi la voce lavora offline. Disinstalla rimuove motore, pesi e cache. Per annullare un lavoro usa Attività; se fallisce trovi Riprova nella stessa riga.'),
    modello, stato, h('div', { class: 'ai-riga' }, pulsanti));
}

let campione = '';
let testoCampione = '';
let dispositivo: 'cuda' | 'cpu' = 'cuda';
let nomeCampione = '';
function opzioni(lingua: string): OpzioniVoceLocale {
  if (!campione) throw new Error('Scegli un WAV da 3 a 30 secondi della voce che vuoi usare');
  return { campione, testoCampione, dispositivo, lingua };
}
export function pannelloVoceLocale(): HTMLElement {
  const file = h('input', { type: 'file', accept: '.wav,audio/wav' }) as HTMLInputElement;
  const nome = h('p', { class: 'nota' }, nomeCampione || 'Nessun campione scelto');
  file.addEventListener('change', () => void (async () => {
    campione = ''; nomeCampione = '';
    const f = file.files?.[0];
    if (!f) return;
    try {
      if (f.size > 6 * 1024 * 1024) throw new Error('Il campione supera 6 MB');
      const byte = new Uint8Array(await f.arrayBuffer());
      const a = leggiWav(byte);
      const durata = a.audio.length / a.sr;
      if (!Number.isFinite(durata) || durata < 3 || durata > 30) throw new Error('Scegli un campione da 3 a 30 secondi');
      campione = base64DaByte(byte); nomeCampione = f.name; nome.textContent = f.name;
    } catch (e) { nome.textContent = String(e); }
  })());
  const trascrizione = h('textarea', { placeholder: 'Le parole esatte del campione (facoltative, aiutano la somiglianza)', maxlength: 1000 }) as HTMLTextAreaElement;
  trascrizione.value = testoCampione;
  trascrizione.addEventListener('input', () => { testoCampione = trascrizione.value; });
  const dove = h('select', { 'aria-label': 'Dove genero la voce' }, h('option', { value: 'cuda' }, 'Scheda NVIDIA (CUDA)'), h('option', { value: 'cpu' }, 'Processore (più lento)')) as HTMLSelectElement;
  dove.value = dispositivo;
  dove.addEventListener('change', () => { dispositivo = dove.value === 'cpu' ? 'cpu' : 'cuda'; });
  const testo = h('textarea', { placeholder: 'Oppure scrivi qui un testo libero in italiano (massimo 500 caratteri)', maxlength: 500 }) as HTMLTextAreaElement;
  const genera = h('button', { class: 'btn', on: { click: () => {
    try {
      const o = opzioni('it');
      const t = testo.value.trim();
      if (!t) throw new Error('Scrivi il testo da leggere');
      const progetto = progettoAttuale();
      void inCoda({ titolo: 'Voce realistica dal testo', categoria: 'ai', corsia: 'pesante', chiave: 'voce-qwen' }, async (l) => {
        verificaProgetto(progetto, l);
        liberaVram();
        await motoreAI.azione('accendi', (k, t) => l.imposta(k, t), l.segnale);
        try {
          const r = await motoreAI.clona(t, o, (k, t) => l.imposta(k, t), l.segnale);
          await importaVoce(r, false, progetto, l);
        } finally { await motoreAI.richiesta('POST', '/libera').catch(() => {}); }
      });
    } catch (e) { avviso(String(e), 'errore'); }
  } } }, 'Genera voce dal testo');
  return h('div', { class: 'voce-locale' }, h('p', { class: 'nota' }, 'Qwen3-TTS Base usa sempre una voce di riferimento. Scegli un WAV pulito da 3 a 30 secondi che puoi usare. Il risultato è una voce sintetica. Il campione resta in memoria fino alla chiusura dell’app; non viene salvato nelle impostazioni.'),
    h('label', null, 'Campione vocale WAV ', file), nome, trascrizione, dove, testo, genera,
    h('p', { class: 'nota' }, 'Installa il motore e scarica Qwen3-TTS dal Centro AI prima di generare la voce. Il testo libero crea una clip dall’inizio; i sottotitoli mantengono i loro tempi.'));
}
function verificaProgetto(progetto: number, l: Lavoro) {
  if (l.segnale.aborted || progetto !== progettoAttuale()) throw new Error('fermato: il progetto è cambiato');
}
async function importaVoce(r: { audio: Float32Array; sr: number; posti?: Parameters<typeof posaVoce>[4] }, silenzia: boolean, progetto: number, l: Lavoro) {
  verificaProgetto(progetto, l);
  l.imposta(0.97, 'Salvo la voce…');
  const nome = `Voce realistica ${Date.now()}.wav`;
  const blob = new Blob([codificaWav(r.audio, r.sr) as BlobPart], { type: 'audio/wav' });
  const path = await salvaMediaSulDisco(nome, blob);
  verificaProgetto(progetto, l);
  if (!path) throw new Error('Non riesco a salvare la voce sul disco: controlla spazio e permessi, poi riprova');
  const [m] = await importaFile([{ name: nome, path }], { chiediFormato: false });
  verificaProgetto(progetto, l);
  if (!m) throw new Error('Non riesco a importare la voce generata');
  store.select(store.edit('Voce realistica', (p) => posaVoce(p, m.id, r.audio.length / r.sr, silenzia, r.posti)));
}
export async function faiParlareLocale(lingua: string, silenzia: boolean) {
  try {
    const o = opzioni(lingua);
    const p = structuredClone(store.doc);
    const progetto = progettoAttuale();
    await inCoda({ titolo: 'Voce realistica dai sottotitoli', categoria: 'ai', corsia: 'pesante', chiave: 'voce-qwen' }, async (l) => {
      verificaProgetto(progetto, l);
      const r = await doppia(p, { voce: 0, lingua, silenzia, motore: 'qwen', locale: o, traduci: true }, (t, k) => l.imposta(k, t), l.segnale);
      await importaVoce(r, silenzia, progetto, l);
    });
  } catch (e) { avviso(String(e), 'errore'); }
}
