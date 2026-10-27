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
import { MODELLI_TRADUZIONE } from '../media/traduci';
import { MODELLO_SEPARAZIONE, installaSeparazione, possibilita, statoAudioAI, togliSeparazione } from '../media/audioAI';
import { disinstallaMotore, motoreNemo } from '../media/nemo';
import { diagnosi, modelliScaricati, statoNvidia, svuotaModelli, type Diagnosi } from '../media/diagnosiAI';
import { LS_CHIAVE_HF, chiaveHFSalvata, impostaSchedaAI, usaSchedaAI } from '../media/libreriaAI';
import { raccontaHardware } from '../media/hardware';
import { spiegaErroreAI } from '../media/erroriAI';
import { avviso, conferma, dialogo, evidenzia, h } from './dom';
import { vaiFinale, vaiPagina, vaiSezione } from './guida';
import { fonteCerca } from './cerca';

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
    id: 'traduci', nome: 'Traduci i sottotitoli', icona: '🌍', dove: 'tutto',
    cosaFa: 'Traduce le righe in un\'altra lingua (nove lingue, anche cinese, giapponese, arabo); i tempi restano.',
    come: ['Prima servono i sottotitoli', 'Scegli la lingua d\'arrivo', 'Premi "Traduci i sottotitoli" (Ctrl+Z torna indietro)'],
    modelli: [{ repo: MODELLI_TRADUZIONE[0], nome: 'NLLB-200 di Meta', mb: 600 }],
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
    cosaFa: 'Toglie il rumore di fondo da un parlato (ventola, fruscio, strada) e lascia la voce. È DeepFilterNet3, un\'AI fatta per la voce: lavora sul computer, senza scaricare niente.',
    come: ['Scegli la clip audio (o la ripresa con l\'audio)', 'Proprietà → Audio AI → Togli i rumori, e scegli: Leggera, Media o Forte, Voce isolata (musica o TV sotto), Podcast o Podcast naturale (voce da studio, anche senza eco)', 'Aspetta la barra in basso a destra: Ctrl+Z torna com\'era, "Audio originale" rimette il file di prima'],
    manca: () => (clipAudioDaUsare(false) ? null : MANCA_AUDIO),
    apri: () => { clipAudioDaUsare(true); vaiSezione('audioai'); },
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
const DOVE: Record<FunzioneAI['dove'], string> = { tutto: 'app e browser', app: 'solo nell\'app', locale: 'sul computer, senza modelli' };

/** la finestra del Centro AI */
export function finestraCentroAI(subito = false) {
  const d = dialogo('Centro AI · tutte le funzioni intelligenti', { largo: true });
  d.el.classList.add('centro-ai');
  const selezione = h('select', { 'aria-label': 'Clip su cui usare AI', on: { change: () => { store.select(selezione.value ? [selezione.value] : []); aggiornaPrerequisiti(); } } },
    h('option', { value: '' }, 'Scegli una clip per audio, sfondo o tracking'),
    store.doc.clips.filter((c) => c.kind === 'media').map((c) => h('option', { value: c.id }, c.name)));
  selezione.value = store.sel.size === 1 ? [...store.sel][0] : '';
  const compito = h('select', { 'aria-label': 'Cosa vuoi fare', on: { change: () => carte.forEach((c) => { c.hidden = c.dataset.ai !== compito.value; }) } }, FUNZIONI_AI.map((f) => h('option', { value: f.id }, f.nome)));
  const aggiornaPrerequisiti = () => carte.forEach((c) => {
    const f = FUNZIONI_AI.find((f) => f.id === c.dataset.ai)!;
    c.querySelector('.ai-manca')!.textContent = f.manca() ?? 'Pronto per scegliere modello e opzioni';
  });
  const stati = new Map<string, HTMLElement>();
  const carte = FUNZIONI_AI.map((f) => {
    const stato = h('div', { class: 'ai-stato' }, f.modelli ? 'controllo i modelli…' : '');
    stati.set(f.id, stato);
    const motivo = f.manca();
    // i modelli grossi si scaricano a parte: "Scarica ora" e "Togli il modello"
    const modello = f.installa ? h('div', { class: 'ai-riga ai-modello' },
      h('button', { class: 'btn-mini ai-scarica', on: { click: async (ev: Event) => {
        const b = ev.currentTarget as HTMLButtonElement;
        b.disabled = true;
        try { await f.installa!(); avviso(`${f.nome}: il modello è sul computer`, 'ok', 2600); } catch (e) { avviso(spiegaErroreAI(e), 'errore', 5200); } finally { b.disabled = false; void aggiornaAudio(); }
      } } }, 'Scarica ora'),
      f.togli ? h('button', { class: 'btn-mini ai-togli', on: { click: async () => { await f.togli!(); void aggiornaAudio(); } } }, 'Togli il modello') : null) : null;
    return h('article', { class: 'ai-carta', 'data-ai': f.id },
      h('header', null, h('span', { class: 'ai-ic' }, f.icona), h('b', null, f.nome), h('span', { class: 'ai-dove ' + f.dove }, DOVE[f.dove])),
      h('p', null, f.cosaFa),
      h('ol', { class: 'ai-come' }, f.come.map((c) => h('li', null, c))),
      stato,
      modello,
      h('p', { class: 'ai-manca' }, motivo ?? 'Pronto per scegliere modello e opzioni'),
      h('button', { class: 'btn primario ai-usa', on: { click: () => { const manca = f.manca(); if (manca) { avviso(manca, 'info', 4000); return; } d.chiudi(); f.apri(); } } }, 'Scegli opzioni e modello →'));
  });

  // ——— lo stato dei modelli (dalla cache) e del motore NVIDIA
  void (async () => {
    const [scaricati, nv] = await Promise.all([modelliScaricati(), statoNvidia()]);
    for (const f of FUNZIONI_AI) {
      const el = stati.get(f.id)!;
      if (!f.modelli) { el.textContent = f.dove === 'app' ? '' : 'Pronto: non serve scaricare niente'; continue; }
      const ci = f.modelli.filter((m) => scaricati.has(m.repo));
      const righe: (string | HTMLElement)[] = [];
      if (ci.length) righe.push(h('span', { class: 'ai-ok' }, '✓ sul computer: ', ci.map((m) => `${m.nome} (${mb(scaricati.get(m.repo)!)})`).join(', ')));
      else {
        const piccolo = f.modelli.filter((m) => m.mb).sort((a, b) => (a.mb ?? 0) - (b.mb ?? 0))[0];
        righe.push(h('span', null, '⬇ il modello si scarica la prima volta' + (piccolo ? ` (da ${piccolo.mb} MB)` : '') + ', poi resta sul computer'));
      }
      if (f.id === 'sottotitoli' && nv) righe.push(h('span', { class: nv.installato ? 'ai-ok' : '' }, nv.installato ? ` · motore NVIDIA pronto (${nv.backend})` : ' · nell\'app il motore NVIDIA si scarica la prima volta'));
      el.replaceChildren(...righe);
    }
    const v = stati.get('voce');
    if (v) v.replaceChildren(nv ? h('span', { class: nv.installato ? 'ai-ok' : '' }, nv.installato ? `✓ motore NVIDIA pronto (${nv.backend})` : '⬇ il motore NVIDIA e la voce si scaricano la prima volta') : h('span', null, 'nel browser non c\'è'));
    void aggiornaAudio();
  })();

  /** lo stato dei due motori dell'audio (togli rumori, voce e base): dove stanno e quanto pesano */
  async function aggiornaAudio() {
    const s = await statoAudioAI();
    const r = stati.get('rumore'), v = stati.get('separa');
    const nome = (k: string) => (k === 'in-uso' ? ' · sta lavorando adesso' : k === 'errore' ? ' · l\'ultima volta non è riuscito' : '');
    if (r) r.replaceChildren(h('span', { class: s.rumore.stato === 'pronto' || s.rumore.stato === 'in-uso' ? 'ai-ok' : '' }, (s.rumore.stato === 'da-scaricare' ? '⬇ il filtro (DeepFilterNet3, ' : '✓ pronto: il filtro (DeepFilterNet3, ') + s.rumore.peso + ')' + nome(s.rumore.stato)));
    if (v) {
      const pronto = s.separa.stato === 'pronto' || (s.separa.stato === 'in-uso' && !s.separa.ripiego);
      v.replaceChildren(h('span', { class: pronto ? 'ai-ok' : '' }, pronto ? `✓ sul computer: ${MODELLO_SEPARAZIONE.nome} (${s.separa.peso})` : `⬇ il modello (${s.separa.peso}) si scarica la prima volta`),
        h('span', null, ' · senza il modello c\'è la separazione rapida (senza AI, meno precisa)' + (s.separa.ripiego ? ': per ora userebbe quella' : '') + nome(s.separa.stato)));
    }
  }

  // ——— la diagnosi
  const esito = h('div', { class: 'ai-diagnosi' });
  const controlla = h('button', { class: 'btn ai-controlla', on: { click: () => void fai() } }, '🔍 Controlla l\'AI') as HTMLButtonElement;
  const fai = async () => {
    controlla.disabled = true;
    esito.replaceChildren(h('p', { class: 'nota' }, 'Controllo: avvio il motore AI, guardo la scheda video, provo a raggiungere Hugging Face…'));
    try { disegnaDiagnosi(esito, await diagnosi()); } finally { controlla.disabled = false; }
  };

  // ——— le impostazioni
  const scheda = h('input', { type: 'checkbox', checked: usaSchedaAI() }) as HTMLInputElement;
  scheda.addEventListener('change', () => impostaSchedaAI(scheda.checked));
  // la chiave di Hugging Face: serve ai modelli «gated» come SAM 3 (si crea gratis su huggingface.co → Settings → Access Tokens)
  const chiaveHF = h('input', { type: 'password', class: 'campo-testo', placeholder: 'hf_…', value: chiaveHFSalvata(), 'aria-label': 'Chiave Hugging Face', autocomplete: 'off' }) as HTMLInputElement;
  const salvaChiave = h('button', { class: 'btn-mini', on: { click: () => { try { if (chiaveHF.value.trim()) localStorage.setItem(LS_CHIAVE_HF, chiaveHF.value.trim()); else localStorage.removeItem(LS_CHIAVE_HF); } catch { /* niente */ } avviso(chiaveHF.value.trim() ? 'Chiave salvata: vale dal prossimo scaricamento' : 'Chiave tolta', 'ok', 2400); } } }, 'Salva');
  const spazio = h('span', { class: 'nota' }, '…');
  const aggSpazio = async () => { const m = await modelliScaricati(); const tot = [...m.values()].reduce((s, x) => s + x, 0); spazio.textContent = m.size ? `${m.size} modelli sul computer · ${mb(tot)}` : 'Nessun modello scaricato'; };
  void aggSpazio();
  const svuota = h('button', { class: 'btn-mini', on: { click: async () => {
    if (!(await conferma('Libera lo spazio dei modelli', 'I modelli AI scaricati si tolgono dal computer. Si riscaricano da soli la prossima volta che servono (serve internet).', 'Toglili', 'Annulla'))) return;
    await svuotaModelli(); await aggSpazio();
  } } }, 'Libera lo spazio');
  const nvidia = motoreNemo() ? h('div', { class: 'ai-imp' },
    h('span', null, 'Motore NVIDIA (sottotitoli e voce nell\'app)'),
    h('button', { class: 'btn-mini', on: { click: async () => {
      if (!(await conferma('Togli il motore NVIDIA', 'Il motore e i suoi modelli si tolgono dal computer. Si riscaricano la prossima volta che servono.', 'Toglilo', 'Annulla'))) return;
      await disinstallaMotore(true).catch(() => {});
      await aggSpazio();
    } } }, 'Togli motore e modelli')) : null;

  // ——— lo stato dei modelli e il pulsante che sistema quello che si può sistemare
  const elencoModelli = h('div', { class: 'ai-modelli' });
  const progressoRipara = h('p', { class: 'nota' });
  const disegnaModelli = async () => {
    const m = await modelliScaricati();
    const s = await statoAudioAI().catch(() => null);
    elencoModelli.replaceChildren(...FUNZIONI_AI.filter((f) => f.modelli?.length).map((f) => {
      const ci = f.modelli!.filter((x) => m.has(x.repo));
      const ok = ci.length > 0 || (f.id === 'separa' && s?.separa.stato === 'pronto');
      return h('div', { class: 'ai-mod ' + (ok ? 'ok' : 'forse') }, h('span', { class: 'ai-diag-seg' }, ok ? '✓' : '⬇'), h('b', null, f.nome),
        h('span', null, ok ? `sul computer${ci.length ? ': ' + ci.map((x) => x.nome).join(', ') : ''}` : 'si scarica da solo la prima volta che serve'));
    }));
  };
  void disegnaModelli();
  const ripara = h('button', { class: 'btn primario ai-ripara', on: { click: async () => {
    ripara.disabled = true;
    try {
      progressoRipara.textContent = 'Controllo il motore AI, la scheda video e la connessione…';
      let g = await diagnosi();
      // il motore non parte con la scheda video: si prova sul processore
      if (!g.libreria.ok && usaSchedaAI()) {
        impostaSchedaAI(false); scheda.checked = false;
        progressoRipara.textContent = 'Il motore non parte con la scheda video: provo sul processore…';
        g = await diagnosi();
      }
      disegnaDiagnosi(esito, g);
      const s = await statoAudioAI().catch(() => null);
      if (s && s.separa.stato === 'da-scaricare' && g.internet) {
        progressoRipara.textContent = 'Scarico il modello per separare voce e base…';
        await installaSeparazione((c, t) => { progressoRipara.textContent = `Scarico il modello per separare voce e base… ${t ? Math.round((c / t) * 100) : 0}%`; });
      }
      progressoRipara.textContent = !g.libreria.ok ? 'Il motore AI non parte nemmeno sul processore: aggiorna DaProd Video o guarda le righe qui sotto.'
        : !g.internet ? 'Senza internet non posso scaricare i modelli mancanti: quelli già sul computer funzionano.'
          : 'Fatto: il motore funziona e i modelli grossi sono a posto. Gli altri si scaricano da soli la prima volta che li usi.';
    } catch (e) { progressoRipara.textContent = 'Non sono riuscito a sistemare tutto: ' + spiegaErroreAI(e); }
    finally { ripara.disabled = false; void disegnaModelli(); void aggSpazio(); }
  } } }, '🔧 Controlla e ripara tutto');

  d.corpo.append(
    h('section', { class: 'ai-sezione ai-stato-modelli' }, h('h4', null, 'Modelli e motore'), h('div', { class: 'ai-riga' }, ripara, h('span', { class: 'nota' }, 'Controlla che tutto funzioni e sistema quello che si può: scheda video, modelli, connessione.')), progressoRipara, elencoModelli),
    h('p', { class: 'ai-intro' }, 'Tutte le funzioni AI di DaProd Video. Girano sul tuo computer: le immagini, l\'audio e i testi non vanno da nessuna parte. Ogni modello si scarica una volta sola (serve internet la prima volta), poi va anche senza rete.'),
    h('label', { class: 'ai-scelta' }, 'Cosa vuoi fare ', compito),
    h('label', { class: 'ai-scelta' }, 'Clip esplicita (non serve per i sottotitoli del montaggio) ', selezione),
    h('div', { class: 'ai-griglia' }, carte),
    h('section', { class: 'ai-sezione' }, h('h4', null, 'Se qualcosa non va'), h('div', { class: 'ai-riga' }, controlla, h('span', { class: 'nota' }, 'Prova il motore AI, la scheda video e la connessione per i modelli, e ti dice cosa fare.')), esito),
    h('section', { class: 'ai-sezione' }, h('h4', null, 'Impostazioni'),
      h('label', { class: 'ai-imp spunta-riga', title: 'Su alcuni computer la scheda video (WebGPU) c\'è ma sbaglia: spenta, l\'AI usa il processore (più lento ma sicuro)' }, scheda, ' Usa la scheda video (WebGPU) quando c\'è'),
      h('div', { class: 'ai-imp' }, spazio, svuota),
      h('div', { class: 'ai-imp ai-chiave', title: 'Per i modelli che Hugging Face concede solo con una chiave (come SAM 3). Resta sul tuo computer e viaggia solo verso huggingface.co' }, h('span', null, 'Chiave Hugging Face (SAM 3)'), chiaveHF, salvaChiave),
      nvidia));
  d.piede.append(h('button', { class: 'btn', on: { click: () => { d.chiudi(); document.dispatchEvent(new CustomEvent('dpv:guida', { detail: 'problemi-ai' })); } } }, '❓ Se un\'AI non parte'), h('span', { class: 'spazio' }), h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'Chiudi'));
  carte.forEach((c) => { c.hidden = c.dataset.ai !== compito.value; });
  if (subito) void fai();
  return d;
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
    g.libreria.ok ? h('p', { class: 'nota' }, 'Tutto quello che serve c\'è. Se una funzione dà ancora errore, il messaggio ora spiega cosa fare; scrivilo a chi ti aiuta insieme a queste righe.') : h('p', { class: 'nota' }, 'Il motore AI non parte: aggiorna DaProd Video all\'ultima versione o prova un altro browser (Chrome, Edge).'),
  );
}

// le funzioni AI si trovano anche con la ricerca dei comandi (Ctrl+K)
fonteCerca(() => FUNZIONI_AI.map((f) => ({ id: 'ai:' + f.id, titolo: f.nome, sotto: f.cosaFa, cat: 'AI' as const, parole: 'ai intelligenza artificiale ' + f.come.join(' '), fn: f.apri })));
