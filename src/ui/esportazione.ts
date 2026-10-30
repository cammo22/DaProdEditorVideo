// Il pannello dell'esportazione: lo usano la pagina Finale (sezione Uscita) e la finestra Esporta (Ctrl+M).
// In cima si controlla che tutto sia a posto (solo nel Finale) e si sceglie dove va il video (YouTube, verticale,
// archivio, solo audio…), poi il volume (misurato davvero, con la normalizzazione se la vuoi), i dettagli di cosa esce
// (misura, fotogrammi, codec, peso stimato), e in fondo un solo pulsante oro e la coda: le esportazioni vanno una dopo l'altra.
// I conti stanno in `src/core/esportazione.ts`, la coda in `src/export/coda.ts`, i codec in `src/export/codec.ts`,
// le scelte condivise in `src/ui/uscita.ts`, la misura del volume in `src/media/loudness.ts`.
import '../stile/esportazione.css';
import { store } from '../core/store';
import { projectEnd } from '../core/progetto';
import { durataUmana, f2s, frameToTc } from '../core/timecode';
import { durataTesto } from '../core/stima';
import {
  CODEC_DI, INFO_CODEC, MISURE, NOME_CODEC, NOME_CONTENITORE, PRESET, PRESET_ALTRI, PRESET_PRINCIPALI, TRAGUARDI_LUFS, codecPossibili,
  descriviQualita, impostazioni, nomeFile, pesoStimato, pesoTesto, presetDi, proporzioneTesto, sottoDestinazione, testoAdattamento,
  traguardoLufs,
  type Adatta, type CodecVideo, type Contenitore, type Impostazioni, type Preset,
} from '../core/esportazione';
import { PICCO_TETTO, guadagnoPer, numeroDb } from '../core/loudness';
import { statiCodec, type StatoCodec } from '../export/codec';
import { accoda, annullaVoce, coda, mostraNellaCartella, pulisciFinite, quandoCoda, quandoFinita, spostaVoce, togliVoce } from '../export/coda';
import type { StatoVoce } from '../core/codaExport';
import { haAudio, misura, misuraValida, quandoMisura, statoMisura, trattoDa, ultimaMisura } from '../media/loudness';
import { cartellaUscita, isTauri } from '../platform';
import { avviso, h, icona } from './dom';
import { creaControlloUscita } from './controlloUscita';
import { S, avvisaScelte, progettoOra, scelteDi, trattoUscita } from './uscita';

let avvisiPronti = false;
function preparaAvvisi() {
  if (avvisiPronti) return;
  avvisiPronti = true;
  quandoFinita((v) => {
    if (v.stato === 'fatta') avviso(`🎬 Esportato: ${v.messaggio ?? v.dato.titolo}`, 'ok', 5000);
    else if (v.stato === 'errore') avviso(`Export non riuscito: ${v.messaggio ?? ''}`, 'errore', 6000);
    else avviso('Export annullato', 'info');
  });
}

export interface PannelloEsporta {
  el: HTMLElement;
  smonta: () => void;
  /** la pagina in cui sta è in vista (o no): il controllo prima dell'uscita lavora solo allora */
  mostrata: (on: boolean) => void;
  /** peso, cartella e pulsanti: nel Finale (`banco`) non sono dentro `el` ma vanno fissi in fondo alla colonna, sempre in vista */
  fondo: HTMLElement;
}

/**
 * `banco`: la versione della pagina Finale (controllo prima dell'uscita in cima, destinazioni a carte, un solo pulsante
 * oro); senza, la finestra Esporta (Ctrl+M) con le stesse scelte, lo stesso volume e la stessa coda.
 */
export function pannelloEsporta(preset?: string, opz: { banco?: boolean } = {}): PannelloEsporta {
  const banco = !!opz.banco;
  preparaAvvisi();
  if (preset && PRESET.some((x) => x.id === preset)) { S.preset = preset; S.codec = null; S.qualita = null; S.adatta = null; S.lufs = null; }
  const el = h('div', { class: 'es' + (banco ? ' es-banco' : '') });
  const pre = h('div', { class: 'es-preset' });
  const altre = h('div', { class: 'es-preset es-altre-carte' });
  const anteprima = h('div', { class: 'es-anteprima' });
  const regole = h('div', { class: 'es-regole' });
  const volume = h('div', { class: 'es-volume' });
  const piede = h('div', { class: 'es-piede' });
  const azioni = h('div', { class: 'es-azioni' });
  const lista = h('div', { class: 'es-lista' });
  const testaCoda = h('span', { class: 'es-coda-riep' });
  const controllo = banco ? creaControlloUscita() : null;
  const sez = (titolo: string, ic: string, ...figli: HTMLElement[]) => h('div', { class: 'fin-sezione es-sezione' }, h('h4', null, icona(ic, 14), titolo), ...figli);
  const altreDest = h('details', { class: 'es-dettagli es-altre' }, h('summary', null, 'Altre destinazioni'), altre) as HTMLDetailsElement;
  const dettagli = h('details', { class: 'es-dettagli' }, h('summary', null, 'Come esce, nei dettagli'), anteprima, regole) as HTMLDetailsElement;
  const codaSez = sez('Coda', 'esporta', h('div', { class: 'es-coda-testa' }, testaCoda, h('button', { class: 'btn piccolo', title: 'Toglie dalla lista quelle già finite', on: { click: () => pulisciFinite() } }, 'Svuota le finite')), lista);
  const fondo = h('div', { class: 'es-fondo' }, piede, azioni);
  if (banco) {
    el.append(
      sez('Controllo prima dell\'uscita', 'info', controllo!.el),
      sez('Destinazione', 'video', pre, altreDest),
      sez('Volume', 'altoparlante', volume),
      dettagli,
      codaSez);
  } else {
    el.append(
      sez('Dove lo porti', 'video', pre, altreDest),
      sez('Cosa esce', 'info', anteprima),
      sez('Regola', 'ingranaggio', regole),
      sez('Volume', 'altoparlante', volume),
      fondo,
      codaSez);
  }

  let ultimo: { imp: Impostazioni; stati: StatoCodec[]; vuota: boolean; durata: number } | null = null;
  let giro = 0;
  let inMisura = false;
  let nomeCartella = isTauri ? '' : 'Download';
  let percorsoCartella = '';

  const scelte = scelteDi;
  const tratto = trattoUscita;

  /** calcola cosa uscirebbe e, per i video, quali codec la macchina sa fare a quella misura */
  async function calcola(): Promise<NonNullable<typeof ultimo>> {
    const p = store.doc;
    const prog = progettoOra();
    const pr = presetDi(S.preset);
    const formato = pr.libero ? S.formato : pr.formato;
    let imp = impostazioni(scelte(), prog, CODEC_DI[formato]);
    let stati: StatoCodec[] = [];
    if (formato !== 'wav') {
      stati = await statiCodec(formato, imp.w, imp.h, imp.fps);
      imp = impostazioni(scelte(), prog, stati.filter((s) => s.disponibile).map((s) => s.codec));
    }
    const t = tratto();
    return { imp, stati, vuota: !projectEnd(p), durata: f2s(t.len, p.rate) };
  }

  const scegliPreset = (pr: Preset) => { S.preset = pr.id; S.codec = null; S.qualita = null; S.adatta = null; S.lufs = null; if (pr.libero) S.formato = S.formato || 'mp4'; void ridisegna(); };

  function disegnaPreset() {
    const prog = progettoOra();
    const impDi = (pr: Preset) => impostazioni({ preset: pr.id, formato: pr.formato }, prog, CODEC_DI[pr.libero ? 'mp4' : pr.formato]);
    if (banco) {
      // le carte del Finale: nome, forma · misura · volume, e a destra il codec
      const carta = (pr: Preset) => {
        const imp = impDi(pr);
        const scelto = pr.id === S.preset;
        const nomeCodec = (c: CodecVideo) => NOME_CODEC[c].replace(' (HEVC)', '');
        const codec = pr.formato === 'wav' ? 'WAV' : scelto && ultimo?.imp.codec ? nomeCodec(ultimo.imp.codec) : pr.codec[0] ? nomeCodec(pr.codec[0]) : '';
        return h('button', { class: 'es-dest' + (scelto ? ' acceso' : ''), type: 'button', 'data-preset': pr.id, title: pr.info, 'aria-pressed': scelto, on: { click: () => scegliPreset(pr) } },
          h('span', { class: 'es-dest-testi' }, h('b', null, pr.corto ?? pr.nome), h('small', null, sottoDestinazione(pr, imp))),
          h('span', { class: 'es-dest-codec' }, pr.libero ? '' : codec));
      };
      pre.replaceChildren(...PRESET_PRINCIPALI.map(carta));
      altre.replaceChildren(...PRESET_ALTRI.map(carta));
    } else {
      const cartaVecchia = (pr: Preset) => {
        const imp = impDi(pr);
        const sotto = pr.formato === 'wav' ? 'WAV · solo suono' : pr.libero ? 'tutto a mano' : `${imp.w}×${imp.h} · ${NOME_CONTENITORE[pr.formato]}`;
        return h('button', { class: 'es-carta' + (pr.id === S.preset ? ' acceso' : ''), 'data-preset': pr.id, title: pr.info, on: { click: () => scegliPreset(pr) } },
          h('span', { class: 'led' }), h('b', null, pr.nome), h('small', null, pr.info), h('em', null, sotto));
      };
      pre.replaceChildren(...PRESET_PRINCIPALI.map(cartaVecchia));
      altre.replaceChildren(...PRESET_ALTRI.map(cartaVecchia));
    }
    if (PRESET_ALTRI.some((pr) => pr.id === S.preset)) altreDest.open = true;
  }

  function riga(nome: string, ...v: (string | HTMLElement)[]) { return h('div', { class: 'es-riga' }, h('span', null, nome), h('b', null, ...v)); }

  function disegnaAnteprima() {
    if (!ultimo) return;
    const { imp, stati, vuota, durata } = ultimo;
    const p = store.doc;
    const righe: HTMLElement[] = [];
    if (imp.formato === 'wav') {
      righe.push(riga('File', 'WAV · audio PCM 16 bit, 48 kHz, stereo'), riga('Video', 'nessuno: esce solo il suono'));
    } else {
      righe.push(riga('Quadro', `${imp.w}×${imp.h} (${proporzioneTesto(imp.w, imp.h)})`));
      righe.push(riga('Fotogrammi', `${imp.fps.toFixed(imp.fps % 1 ? 2 : 0).replace('.', ',')} al secondo${imp.passo > 1 ? ` · ne tiene uno ogni ${imp.passo} del progetto` : ''}`));
      const audio = imp.formato === 'webm' ? 'Opus' : 'AAC';
      righe.push(riga('File', imp.codec ? `${NOME_CONTENITORE[imp.formato]} · video ${NOME_CODEC[imp.codec]} · audio ${audio}` : `${NOME_CONTENITORE[imp.formato]} · ⚠ nessun codec`));
      const st = stati.find((x) => x.codec === imp.codec);
      if (st) righe.push(riga('Lo prepara', st.scheda ? 'la scheda video (più veloce)' : 'il processore (più lento, ma va bene)'));
    }
    righe.push(riga('Peso', ultimo.vuota ? '—' : `circa ${pesoTesto(pesoStimato(imp, durata))}`, h('small', null, ' a occhio: dipende da quanto è movimentato')));
    righe.push(riga('Durata', vuota ? '—' : durataUmana(durata)));
    const note: HTMLElement[] = [];
    if (imp.formato !== 'wav') {
      note.push(h('p', { class: 'es-nota' }, h('b', null, 'Forma. '), testoAdattamento(p.w, p.h, imp.w, imp.h, imp.adatta ?? S.adatta ?? presetDi(S.preset).adatta)));
      if (imp.w > p.w * 1.01 && imp.h > p.h * 1.01) note.push(h('p', { class: 'es-nota attento' }, `Il progetto è ${p.w}×${p.h} e l'uscita è più grande: titoli e grafica escono nitidi, le riprese vengono ingrandite.`));
      if (!imp.codec) note.push(h('p', { class: 'es-nota male' }, `⚠ Questo sistema non sa codificare ${NOME_CONTENITORE[imp.formato]} a questa misura. Prova un altro formato o una misura più piccola.`));
    }
    if (vuota) note.push(h('p', { class: 'es-nota attento' }, 'La timeline è vuota: prima monta qualcosa.'));
    anteprima.replaceChildren(h('div', { class: 'es-righe' }, ...righe), ...note);
    disegnaPiede();
  }

  /** il peso e la cartella, sopra il pulsante; il peso va anche al controllo (lo spazio sul disco) */
  function disegnaPiede() {
    if (!ultimo) return;
    const { imp, vuota, durata } = ultimo;
    const peso = vuota ? null : pesoStimato(imp, durata);
    controllo?.imposta(peso);
    piede.replaceChildren(
      h('span', { class: 'es-piede-peso' }, vuota ? 'Timeline vuota' : `Circa ${pesoTesto(peso!)} · ${durataTesto(durata)}`),
      h('span', { class: 'es-piede-cartella', title: percorsoCartella ? `${percorsoCartella}\nCon «Metti in coda» il file va qui; con «Esporta» ti chiedo dove salvarlo se la coda è libera.` : '' }, `Cartella: ${nomeCartella || 'quella che scegli'}`));
  }

  function chips<T extends string>(nome: string, opz: { v: T; t: string; info?: string; spento?: boolean }[], attuale: T, scegli: (v: T) => void): HTMLElement {
    return h('div', { class: 'es-scelta' }, h('span', null, nome), h('div', { class: 'isp-chips' }, opz.map((o) => h('button', {
      class: 'chip' + (o.v === attuale ? ' acceso' : ''), title: o.info ?? '', disabled: !!o.spento, on: { click: () => scegli(o.v) },
    }, o.t))));
  }

  function disegnaRegole() {
    if (!ultimo) return;
    const { imp, stati } = ultimo;
    const pr = presetDi(S.preset);
    const p = store.doc;
    const t = tratto();
    const out: HTMLElement[] = [];
    out.push(chips('Tratto', [
      { v: 'tutto', t: 'Tutto il montaggio' },
      { v: 'inout', t: t.haInOut ? `Attacco–stacco · ${frameToTc(p.inF!, p.rate, p.drop)} → ${frameToTc(p.outF!, p.rate, p.drop)}` : 'Attacco–stacco (segna I e O)', spento: !t.haInOut },
    ], t.usa ? 'inout' : 'tutto', (v) => { S.inOut = v === 'inout'; void ridisegna(); }));
    if (pr.libero) {
      out.push(chips('Formato', (['mp4', 'mov', 'webm', 'wav'] as Contenitore[]).map((f) => ({ v: f, t: f === 'wav' ? 'Solo audio (WAV)' : NOME_CONTENITORE[f] })), imp.formato, (v) => { S.formato = v; S.codec = null; void ridisegna(); }));
      if (imp.formato !== 'wav') out.push(chips('Misura', MISURE.map((m) => ({ v: m.id, t: m.nome })), S.misura, (v) => { S.misura = v; void ridisegna(); }));
    }
    if (imp.formato !== 'wav') {
      const buoni = stati.filter((s) => s.disponibile && codecPossibili(pr, imp.formato, [s.codec]).length);
      if (buoni.length) {
        out.push(chips('Codec', buoni.map((s) => ({ v: s.codec, t: NOME_CODEC[s.codec] + (s.scheda ? ' · scheda video' : ''), info: INFO_CODEC[s.codec] })), imp.codec ?? buoni[0].codec, (v) => { S.codec = v; void ridisegna(); }));
        if (imp.codec) out.push(h('p', { class: 'es-nota' }, INFO_CODEC[imp.codec] + '.'));
      }
      if (imp.geometria) {
        out.push(chips('Se la forma è diversa', [{ v: 'bande', t: 'Bande nere', info: 'L\'immagine resta intera' }, { v: 'ritaglio', t: 'Ritaglia al centro', info: 'L\'immagine riempie il quadro' }] as { v: Adatta; t: string; info: string }[], imp.adatta ?? 'bande', (v) => { S.adatta = v; void ridisegna(); }));
      }
      // la qualità: dice cosa succede, non solo un numero
      const q0 = S.qualita ?? pr.qualita;
      const r = h('input', { type: 'range', min: 0, max: 100, step: 1, value: String(q0) }) as HTMLInputElement;
      const dice = h('div', { class: 'es-qdice' });
      const bitrateDi = (q: number) => impostazioni({ ...scelte(), qualita: q }, progettoOra(), imp.codec ? [imp.codec] : []).bitrate;
      const aggQ = () => {
        const q = Number(r.value);
        const bps = bitrateDi(q);
        const peso = ultimo?.vuota ? '' : ` · circa ${pesoTesto(pesoStimato({ ...imp, bitrate: bps }, ultimo?.durata ?? 0))}`;
        dice.replaceChildren(h('b', null, descriviQualita(q)), h('small', null, `${peso}${bps ? ` · ${(bps / 1e6).toFixed(1).replace('.', ',')} Mbit/s` : ''}`));
      };
      r.addEventListener('input', () => { S.qualita = Number(r.value); aggQ(); void aggiornaSoloAnteprima(); });
      r.addEventListener('dblclick', () => { S.qualita = null; void ridisegna(); });
      aggQ();
      out.push(h('div', { class: 'es-scelta es-qualita' }, h('span', null, 'Qualità'), h('div', null, r, dice)));
    }
    const nome = h('input', { class: 'campo-testo', placeholder: nomeFile(p.name, pr, imp.formato).replace(/\.[^.]+$/, ''), value: S.nome }) as HTMLInputElement;
    nome.addEventListener('input', () => { S.nome = nome.value; });
    out.push(h('div', { class: 'es-scelta' }, h('span', null, 'Nome del file'), h('div', { class: 'es-nome' }, nome, h('small', null, '.' + imp.formato))));
    regole.replaceChildren(...out);
  }

  /** muovendo il cursore della qualità si rifà solo il riquadro «Cosa esce» (il cursore non deve sparire sotto le dita) */
  async function aggiornaSoloAnteprima() {
    const mio = ++giro;
    const nuovo = await calcola();
    if (mio !== giro) return;
    ultimo = nuovo;
    disegnaAnteprima();
  }

  // ——— il volume ———
  function disegnaVolume() {
    const p = store.doc;
    const pr = presetDi(S.preset);
    const target = traguardoLufs(pr, true, S.lufs) ?? -14;
    const tr = trattoDa(p, tratto().usa);
    const st = statoMisura();
    const valida = misuraValida(p, tr);
    const r = ultimaMisura()?.r ?? null;
    const suono = haAudio(p);

    const interruttore = h('button', { class: 'fin-interruttore' + (S.normalizza ? ' acceso' : ''), type: 'button', 'aria-pressed': S.normalizza,
      title: 'Porta tutto l\'audio allo stesso volume delle piattaforme (YouTube, Spotify, TikTok…) con un semplice aumento o calo, senza comprimere il suono. Il picco non supera mai -1 dBTP.',
      on: { click: () => { S.normalizza = !S.normalizza; avvisaScelte(); disegnaVolume(); disegnaAzioni(); } } },
      h('span', { class: 'led' + (S.normalizza ? ' acceso' : '') }), h('span', { class: 'fin-int-testo' }, `Porta il volume a ${numeroDb(target, 0)} LUFS`));
    const righe: (HTMLElement | string)[] = [interruttore];
    if (S.normalizza) {
      righe.push(h('div', { class: 'es-scelta' }, h('span', null, 'Traguardo'), h('div', { class: 'isp-chips' }, TRAGUARDI_LUFS.map((n) => h('button', {
        class: 'chip' + (n === target ? ' acceso' : ''), type: 'button', title: n === -14 ? 'YouTube, TikTok, Instagram' : n === -16 ? 'Podcast e Spotify (circa)' : 'Televisione (EBU R128)',
        on: { click: () => { S.lufs = n === pr.lufs ? null : n; avvisaScelte(); disegnaVolume(); } },
      }, `${numeroDb(n, 0)} LUFS`)))));
    }
    let testo = '';
    let tasto = false;
    if (!suono) testo = 'Nel montaggio non c\'è suono da misurare.';
    else if (st.tipo === 'misuro') testo = `Misuro il volume… ${Math.round(st.k * 100)}%`;
    else if (valida && r && r.lufs !== null) {
      testo = `Adesso ${numeroDb(r.lufs)} LUFS${r.picco !== null ? `, picco ${numeroDb(r.picco)} dBTP` : ''}.`;
      if (S.normalizza) {
        const g = guadagnoPer(r, target);
        if (g) testo += ` Esce a ${numeroDb(g.lufsDopo)} LUFS (${numeroDb(g.db)} dB)${g.limitato ? `: il picco si ferma a ${numeroDb(PICCO_TETTO, 0)} dBTP, più forte non si può senza comprimere` : ''}.`;
      }
    } else if (valida && r) testo = 'Troppo piano per misurarlo: non c\'è niente da portare al volume.';
    else { testo = st.tipo === 'errore' ? `La misura non è riuscita: ${st.msg}` : `Non ancora misurato${S.normalizza ? ': lo misuro da solo prima di esportare' : ''}.`; tasto = true; }
    righe.push(h('div', { class: 'es-volume-info' }, testo, tasto ? h('button', { class: 'btn-mini', type: 'button', on: { click: () => void misura(store.doc, tr) } }, 'Misura ora') : null));
    volume.replaceChildren(...righe.filter(Boolean) as HTMLElement[]);
  }

  function disegnaAzioni() {
    const occupata = coda.voci.some((v) => v.stato === 'attesa' || v.stato === 'lavoro');
    const vuota = !!ultimo?.vuota;
    const nessunCodec = !!ultimo && ultimo.imp.formato !== 'wav' && !ultimo.imp.codec;
    const spento = vuota || nessunCodec || inMisura;
    const audio = ultimo?.imp.formato === 'wav';
    azioni.replaceChildren(
      h('button', { class: 'btn primario fin-vai', type: 'button', disabled: spento, title: inMisura ? 'Sto misurando il volume' : occupata ? 'C\'è già un\'esportazione al lavoro: questa va in coda' : 'Esporta adesso e scegli dove salvare', on: { click: () => lancia(true) } },
        icona('esporta', 18), inMisura ? 'Misuro il volume…' : audio ? 'Esporta audio' : 'Esporta video', occupata && !inMisura ? h('small', null, ' · va in coda') : null),
      h('button', { class: 'btn', type: 'button', disabled: spento, title: isTauri ? 'La aggiunge alla coda: il file va in Video/DaProd Video' : 'La aggiunge alla coda: il file si scarica', on: { click: () => lancia(false) } }, icona('piu', 16), 'Metti in coda'));
  }

  async function lancia(chiedi: boolean) {
    if (!ultimo || ultimo.vuota || inMisura) return;
    const pr = presetDi(S.preset);
    const traguardo = traguardoLufs(pr, S.normalizza, S.lufs);
    let guadagnoDb: number | undefined;
    if (traguardo !== null && haAudio(store.doc)) {
      const tr = trattoDa(store.doc, tratto().usa);
      let r = misuraValida(store.doc, tr) ? ultimaMisura()!.r : null;
      if (!r) {
        inMisura = true; disegnaAzioni(); disegnaVolume();
        avviso('Misuro il volume prima di esportare…', 'info', 2400);
        r = await misura(store.doc, tr);
        inMisura = false; disegnaAzioni(); disegnaVolume();
        if (!r) { avviso('La misura del volume non è riuscita: l\'export non è partito', 'errore', 5000); return; }
        if (!misuraValida(store.doc, tr)) { avviso('Il montaggio è cambiato mentre misuravo: premi di nuovo Esporta', 'info', 4000); return; }
      }
      const g = guadagnoPer(r, traguardo);
      if (g) guadagnoDb = g.db;
    }
    const { imp } = ultimo;
    const p = store.doc;
    const t = tratto();
    const file = S.nome.trim() ? `${S.nome.trim().replace(/[\\/:*?"<>|]/g, '_')}.${imp.formato}` : nomeFile(p.name, pr, imp.formato);
    const volumeTesto = guadagnoDb !== undefined && traguardo !== null ? ` · ${numeroDb(traguardo, 0)} LUFS` : '';
    const riassunto = imp.formato === 'wav'
      ? `WAV · solo audio${volumeTesto} · circa ${pesoTesto(pesoStimato(imp, ultimo.durata))}`
      : `${imp.w}×${imp.h} · ${imp.fps.toFixed(imp.fps % 1 ? 2 : 0).replace('.', ',')} fps · ${NOME_CONTENITORE[imp.formato]}${imp.codec ? ' ' + NOME_CODEC[imp.codec] : ''}${volumeTesto} · circa ${pesoTesto(pesoStimato(imp, ultimo.durata))}`;
    const v = accoda({
      titolo: `Esporto «${file}»`,
      presetNome: pr.corto ?? pr.nome,
      riassunto,
      tratto: t.usa ? `Da ${frameToTc(p.inF!, p.rate, p.drop)} a ${frameToTc(p.outF!, p.rate, p.drop)}` : 'Tutto il montaggio',
      progetto: structuredClone(p),
      opzioni: {
        formato: imp.formato, w: imp.w, h: imp.h, qualita: 'alta', soloInOut: t.usa, nome: file,
        codec: imp.codec ?? undefined, bitrate: imp.bitrate || undefined, audioBps: imp.audioBps || undefined, passo: imp.passo, geometria: imp.geometria,
        guadagnoDb,
      },
    }, chiedi);
    if (v.dato.chiedi) return;
    avviso(coda.voci.filter((x) => x.stato === 'attesa').length > 0 && coda.inLavoro() !== v ? '➕ Messa in coda' : '▶ Parte l\'esportazione', 'info', 1800);
  }

  // ——— la coda ———
  const righeCoda = new Map<number, { riga: HTMLElement; barra: HTMLElement; testo: HTMLElement; firma: string }>();
  let firmaLista = '';

  function testoVoce(stato: StatoVoce, d: ReturnType<typeof coda.voce> & object): string {
    const x = d.dato;
    if (stato === 'lavoro') return `${x.dettaglio}${x.restante !== null ? ` · mancano circa ${durataTesto(x.restante)}` : ' · calcolo il tempo…'}`;
    if (stato === 'fatta') return `Fatta · ${d.messaggio ?? ''}`;
    if (stato === 'errore') return `⚠ ${d.messaggio ?? 'non riuscita'}`;
    if (stato === 'annullata') return `Annullata${d.messaggio && d.messaggio !== 'annullata' ? ' · ' + d.messaggio : ''}`;
    return 'Aspetta il suo turno';
  }

  function disegnaCoda() {
    testaCoda.textContent = coda.riepilogo();
    const firma = coda.voci.map((v) => `${v.id}:${v.stato}`).join('|');
    if (firma !== firmaLista) {
      firmaLista = firma;
      righeCoda.clear();
      if (!coda.voci.length) { lista.replaceChildren(h('p', { class: 'es-nota' }, 'Qui compaiono le esportazioni: puoi metterne quante vuoi (altri formati, altri tratti) e vanno una dopo l\'altra. Si vedono e si fermano anche da Attività.')); return; }
      const attese = coda.voci.filter((v) => v.stato === 'attesa');
      lista.replaceChildren(...coda.voci.map((v) => {
        const barra = h('i');
        const testo = h('div', { class: 'es-voce-stato' });
        const pulsanti: HTMLElement[] = [];
        if (v.stato === 'attesa') {
          const k = attese.indexOf(v);
          pulsanti.push(h('button', { class: 'btn-icona', title: 'Più su', disabled: k === 0, on: { click: () => spostaVoce(v.id, -1) } }, '▲'));
          pulsanti.push(h('button', { class: 'btn-icona', title: 'Più giù', disabled: k === attese.length - 1, on: { click: () => spostaVoce(v.id, 1) } }, '▼'));
        }
        if (v.stato === 'attesa' || v.stato === 'lavoro') pulsanti.push(h('button', { class: 'btn-icona', title: v.stato === 'lavoro' ? 'Annulla questa esportazione' : 'Togli dalla coda', on: { click: () => annullaVoce(v.id) } }, icona('x', 14)));
        if (v.stato === 'fatta' && v.dato.percorso) pulsanti.push(h('button', { class: 'btn piccolo', title: 'Apre la cartella e mostra il file', on: { click: () => void mostraNellaCartella(v.dato.percorso!) } }, icona('cartella', 13), 'Apri cartella'));
        if (v.stato !== 'attesa' && v.stato !== 'lavoro') pulsanti.push(h('button', { class: 'btn-icona', title: 'Toglila dalla lista', on: { click: () => togliVoce(v.id) } }, icona('x', 14)));
        const riga = h('div', { class: 'es-voce ' + v.stato, 'data-id': v.id },
          h('span', { class: 'led' + (v.stato === 'lavoro' ? ' lampeggia acceso' : v.stato === 'fatta' ? ' acceso' : '') }),
          h('div', { class: 'es-voce-testi' },
            h('b', null, `${v.dato.presetNome} · ${v.dato.tratto}`),
            h('small', null, `${v.dato.opzioni.nome} · ${v.dato.riassunto}`),
            h('div', { class: 'barra-avanz' }, barra), testo),
          h('div', { class: 'es-voce-tasti' }, ...pulsanti));
        righeCoda.set(v.id, { riga, barra, testo, firma: v.stato });
        return riga;
      }));
    }
    for (const v of coda.voci) {
      const r = righeCoda.get(v.id);
      if (!r) continue;
      r.barra.style.width = (v.stato === 'fatta' ? 1 : v.dato.k) * 100 + '%';
      r.testo.textContent = testoVoce(v.stato, v);
    }
  }

  // ——— tutto insieme ———
  async function ridisegna() {
    avvisaScelte();
    disegnaPreset();
    const mio = ++giro;
    const nuovo = await calcola();
    if (mio !== giro) return;
    ultimo = nuovo;
    disegnaPreset();
    disegnaAnteprima();
    disegnaRegole();
    disegnaVolume();
    disegnaAzioni();
    disegnaCoda();
  }

  let attesa = 0;
  const suDoc = () => { clearTimeout(attesa); attesa = window.setTimeout(() => void ridisegna(), 200); };
  const sciolti: (() => unknown)[] = [store.on('doc', suDoc)];
  let rAF = 0;
  sciolti.push(quandoCoda(() => {
    if (rAF) return;
    rAF = requestAnimationFrame(() => { rAF = 0; disegnaCoda(); disegnaAzioni(); });
  }));
  sciolti.push(quandoMisura(() => { disegnaVolume(); }));
  if (isTauri) void cartellaUscita().then((c) => {
    if (!c) { nomeCartella = 'Video'; disegnaPiede(); return; }
    percorsoCartella = c;
    nomeCartella = c.split(/[\\/]/).filter(Boolean).pop() ?? c;
    disegnaPiede();
  });
  void ridisegna();

  return {
    el,
    fondo,
    mostrata: (on) => controllo?.mostrata(on),
    smonta: () => { for (const s of sciolti) s(); controllo?.smonta(); clearTimeout(attesa); if (rAF) cancelAnimationFrame(rAF); },
  };
}
