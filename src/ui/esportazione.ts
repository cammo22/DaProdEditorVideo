// Il pannello dell'esportazione: lo usano la pagina Finale (sezione Esporta) e la finestra Esporta (Ctrl+M).
// In cima si sceglie dove va il video (YouTube, verticale, WhatsApp…), in mezzo si vede cosa esce davvero
// (misura, fotogrammi, codec, peso stimato), poi i ritocchi, e in fondo la coda: le esportazioni vanno una dopo l'altra.
// I conti stanno in `src/core/esportazione.ts`, la coda in `src/export/coda.ts`, i codec in `src/export/codec.ts`.
import '../stile/esportazione.css';
import { store } from '../core/store';
import { projectEnd } from '../core/progetto';
import { durataUmana, f2s, fps, frameToTc } from '../core/timecode';
import { durataTesto } from '../core/stima';
import {
  CODEC_DI, INFO_CODEC, MISURE, NOME_CODEC, NOME_CONTENITORE, PRESET, codecPossibili, descriviQualita, impostazioni,
  nomeFile, pesoStimato, pesoTesto, presetDi, proporzioneTesto, testoAdattamento,
  type Adatta, type CodecVideo, type Contenitore, type Impostazioni, type Scelte,
} from '../core/esportazione';
import { statiCodec, type StatoCodec } from '../export/codec';
import { accoda, annullaVoce, coda, mostraNellaCartella, pulisciFinite, quandoCoda, quandoFinita, spostaVoce, togliVoce } from '../export/coda';
import type { StatoVoce } from '../core/codaExport';
import { isTauri } from '../platform';
import { avviso, h, icona } from './dom';

/** le scelte di adesso: valgono per tutti i pannelli aperti (pagina Finale e finestra) */
const S = {
  preset: 'yt1080',
  formato: 'mp4' as Contenitore,
  codec: null as CodecVideo | null,
  /** null = quella del preset */
  qualita: null as number | null,
  adatta: null as Adatta | null,
  misura: 'progetto',
  inOut: false,
  nome: '',
};

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

export interface PannelloEsporta { el: HTMLElement; smonta: () => void }

export function pannelloEsporta(preset?: string): PannelloEsporta {
  preparaAvvisi();
  if (preset && PRESET.some((x) => x.id === preset)) { S.preset = preset; S.codec = null; S.qualita = null; S.adatta = null; }
  const el = h('div', { class: 'es' });
  const pre = h('div', { class: 'es-preset' });
  const anteprima = h('div', { class: 'es-anteprima' });
  const regole = h('div', { class: 'es-regole' });
  const azioni = h('div', { class: 'es-azioni' });
  const lista = h('div', { class: 'es-lista' });
  const testaCoda = h('span', { class: 'es-coda-riep' });
  const sez = (titolo: string, ic: string, ...figli: HTMLElement[]) => h('div', { class: 'fin-sezione es-sezione' }, h('h4', null, icona(ic, 14), titolo), ...figli);
  el.append(
    sez('Dove lo porti', 'video', pre),
    sez('Cosa esce', 'info', anteprima),
    sez('Regola', 'ingranaggio', regole),
    azioni,
    sez('Coda', 'esporta', h('div', { class: 'es-coda-testa' }, testaCoda, h('button', { class: 'btn piccolo', title: 'Toglie dalla lista quelle già finite', on: { click: () => pulisciFinite() } }, 'Svuota le finite')), lista));

  let ultimo: { imp: Impostazioni; stati: StatoCodec[]; vuota: boolean; durata: number } | null = null;
  let giro = 0;

  const scelte = (): Scelte => ({ preset: S.preset, codec: S.codec, formato: S.formato, qualita: S.qualita ?? undefined, adatta: S.adatta ?? undefined, misura: S.misura });
  const progettoOra = () => { const p = store.doc; return { w: p.w, h: p.h, fps: fps(p.rate) }; };
  /** i fotogrammi da esportare: tutto, oppure da attacco a stacco */
  const tratto = () => {
    const p = store.doc;
    const haInOut = p.inF !== null && p.outF !== null && p.outF > p.inF;
    const usa = S.inOut && haInOut;
    const fine = projectEnd(p);
    return { haInOut, usa, len: usa ? p.outF! - p.inF! : fine };
  };

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

  function disegnaPreset() {
    pre.replaceChildren(...PRESET.map((pr) => {
      const prog = progettoOra();
      const imp = impostazioni({ preset: pr.id, formato: pr.formato }, prog, CODEC_DI[pr.libero ? 'mp4' : pr.formato]);
      const sotto = pr.formato === 'wav' ? 'WAV · solo suono' : pr.libero ? 'tutto a mano' : `${imp.w}×${imp.h} · ${NOME_CONTENITORE[pr.formato]}`;
      return h('button', {
        class: 'es-carta' + (pr.id === S.preset ? ' acceso' : ''), 'data-preset': pr.id, title: pr.info,
        on: { click: () => { S.preset = pr.id; S.codec = null; S.qualita = null; S.adatta = null; if (pr.libero) S.formato = S.formato || 'mp4'; ridisegna(); } },
      }, h('span', { class: 'led' }), h('b', null, pr.nome), h('small', null, pr.info), h('em', null, sotto));
    }));
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
    ], t.usa ? 'inout' : 'tutto', (v) => { S.inOut = v === 'inout'; ridisegna(); }));
    if (pr.libero) {
      out.push(chips('Formato', (['mp4', 'mov', 'webm', 'wav'] as Contenitore[]).map((f) => ({ v: f, t: f === 'wav' ? 'Solo audio (WAV)' : NOME_CONTENITORE[f] })), imp.formato, (v) => { S.formato = v; S.codec = null; ridisegna(); }));
      if (imp.formato !== 'wav') out.push(chips('Misura', MISURE.map((m) => ({ v: m.id, t: m.nome })), S.misura, (v) => { S.misura = v; ridisegna(); }));
    }
    if (imp.formato !== 'wav') {
      const buoni = stati.filter((s) => s.disponibile && codecPossibili(pr, imp.formato, [s.codec]).length);
      if (buoni.length) {
        out.push(chips('Codec', buoni.map((s) => ({ v: s.codec, t: NOME_CODEC[s.codec] + (s.scheda ? ' · scheda video' : ''), info: INFO_CODEC[s.codec] })), imp.codec ?? buoni[0].codec, (v) => { S.codec = v; ridisegna(); }));
        if (imp.codec) out.push(h('p', { class: 'es-nota' }, INFO_CODEC[imp.codec] + '.'));
      }
      if (imp.geometria) {
        out.push(chips('Se la forma è diversa', [{ v: 'bande', t: 'Bande nere', info: 'L\'immagine resta intera' }, { v: 'ritaglio', t: 'Ritaglia al centro', info: 'L\'immagine riempie il quadro' }] as { v: Adatta; t: string; info: string }[], imp.adatta ?? 'bande', (v) => { S.adatta = v; ridisegna(); }));
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

  function disegnaAzioni() {
    const occupata = coda.voci.some((v) => v.stato === 'attesa' || v.stato === 'lavoro');
    const vuota = !!ultimo?.vuota;
    const nessunCodec = !!ultimo && ultimo.imp.formato !== 'wav' && !ultimo.imp.codec;
    const spento = vuota || nessunCodec;
    azioni.replaceChildren(
      h('button', { class: 'btn primario fin-vai', disabled: spento, title: occupata ? 'C\'è già un\'esportazione al lavoro: questa va in coda' : 'Esporta adesso e scegli dove salvare', on: { click: () => lancia(true) } }, icona('esporta', 18), occupata ? 'ESPORTA (VA IN CODA)' : 'ESPORTA'),
      h('button', { class: 'btn', disabled: spento, title: isTauri ? 'La aggiunge alla coda: il file va in Video/DaProd Video' : 'La aggiunge alla coda: il file si scarica', on: { click: () => lancia(false) } }, icona('piu', 16), 'Metti in coda'));
  }

  function lancia(chiedi: boolean) {
    if (!ultimo || ultimo.vuota) return;
    const { imp } = ultimo;
    const p = store.doc;
    const pr = presetDi(S.preset);
    const t = tratto();
    const file = S.nome.trim() ? `${S.nome.trim().replace(/[\\/:*?"<>|]/g, '_')}.${imp.formato}` : nomeFile(p.name, pr, imp.formato);
    const riassunto = imp.formato === 'wav'
      ? `WAV · solo audio · circa ${pesoTesto(pesoStimato(imp, ultimo.durata))}`
      : `${imp.w}×${imp.h} · ${imp.fps.toFixed(imp.fps % 1 ? 2 : 0).replace('.', ',')} fps · ${NOME_CONTENITORE[imp.formato]}${imp.codec ? ' ' + NOME_CODEC[imp.codec] : ''} · circa ${pesoTesto(pesoStimato(imp, ultimo.durata))}`;
    const v = accoda({
      titolo: `Esporto «${file}»`,
      presetNome: pr.nome,
      riassunto,
      tratto: t.usa ? `Da ${frameToTc(p.inF!, p.rate, p.drop)} a ${frameToTc(p.outF!, p.rate, p.drop)}` : 'Tutto il montaggio',
      progetto: structuredClone(p),
      opzioni: {
        formato: imp.formato, w: imp.w, h: imp.h, qualita: 'alta', soloInOut: t.usa, nome: file,
        codec: imp.codec ?? undefined, bitrate: imp.bitrate || undefined, audioBps: imp.audioBps || undefined, passo: imp.passo, geometria: imp.geometria,
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
    disegnaPreset();
    const mio = ++giro;
    const nuovo = await calcola();
    if (mio !== giro) return;
    ultimo = nuovo;
    disegnaAnteprima();
    disegnaRegole();
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
  void ridisegna();

  return { el, smonta: () => { for (const s of sciolti) s(); clearTimeout(attesa); if (rAF) cancelAnimationFrame(rAF); } };
}
