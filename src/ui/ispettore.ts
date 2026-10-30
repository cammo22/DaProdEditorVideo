// Le proprietà della clip scelta, semplici: un riassunto in alto, gli effetti al volo come interruttori,
// poche regolazioni che servono davvero (opacità, zoom, colore, volume, durata, transizioni) e il resto
// chiuso in "Avanzate". Il colore di tutto il montaggio sta nella pagina Finale.
import { store } from '../core/store';
import type { Clip, TitleSpec } from '../core/tipi';
import { copiaLeggera, descrittore, haLinea, mettiChiave, percorsiAnimati, togliAnimazione, togliLinea, valutaClip } from '../core/automazioni';
import { nuovaMaschera, nomeForma } from '../core/maschereForma';
import { creaRombo, frameLocale, nomeParametro, parametriAnimabili, valoreVivo } from './keyframe';
import { clipById, end, isVideoClip, mediaOf, newClip, newTrack, nextTrackName, trackOf, FX0 } from '../core/progetto';
import { frameToTc, fps } from '../core/timecode';
import { avviso, h, evidenzia } from './dom';
import * as M from '../core/montaggio';
import { esegui, modi, mettiBlocco } from '../azioni';
import { DIREZIONALI, EFFETTI, TENDINE } from '../render/transizioni';
import { oggettoSulQuadro, tracciate } from '../core/traccia';
import type { Project } from '../core/tipi';
import { EFFETTI_AUDIO, EFFETTI_VIDEO, adatte, alternaEffetto } from '../effetti';
import { scenaRitocco } from '../render/provino';
import { cambiaModello, durataDelBlocco, EFFETTI_TEMPO, parametroFx, effettoTempo, haCentro, nomeBlocco, nuovoBlocco, posaBlocco, taglioDelBlocco, taglioVicino, transizioneSul } from '../core/blocchi';
import { SUONI } from '../core/suoni';
import { ascoltaSuono } from '../media/audio';
import { MOVIMENTI, movimentoPronto, SFONDI } from '../core/cornici';
import { motore } from '../motore';
import { GRUPPI_HTML, modelliDi, modelloHtml, nuovoHtml, valoriHtmlDi } from '../core/titoliHtml';
import { htmlDisponibile } from '../render/titoliHtml';
import { ANIMAZIONI as CATALOGO_ANIM, GRUPPI_ANIM, animazione, nuovaAnim, valoriDi, type CampoAnim } from '../core/animazioni';
import { CHIAVI, coloriChiave, QUALITA_RITAGLIO, SPILL0 } from '../core/sfondo';
import { maschereAggiornate } from '../media/ritaglio';
import { posizioniPronte, disegnino } from './miniQuadro';
import { tessere } from './tessere';
import { cosaCiMetto } from './seguiMenu';
import { righeAudioAI, faiTogliRumore } from './audioAI';
import { possibilita as audioAIPossibile } from '../media/audioAI';
import { clearAttivo } from '../media/clear';
import { anteprimaScena } from './anteprimaScena';
import { apriColoreAvanzato } from './coloreAvanzatoFinestra';
import { creaDuckingClip } from './duckingClip';
import { bilanciaBianco, azzeraPunti, elaboraClip, fermaClip, impostaModo, lavoroDi, modiPossibili, modoSfondo, cliccaCosaTenere, dettaglioModello, controllaScena, seguiConAI, provaOggetto, scegliColore, statoMaschere, togliColoreExtra, togliPunto, trovaColore, altroOggetto, oggettiDi, riprovaOggetti, togliSfondoAI, SECONDI_ANTEPRIMA } from './sfondo';

type Campo = { el: HTMLElement; aggiorna: () => void; /** si rinfresca anche quando il cursore si sposta (ha i keyframe) */ anim?: boolean };

/** tutti gli stili della titolatrice (l'elenco delle proprietà) */
const STILI_TITOLO: [string, string][] = [
  ['fisso', 'Fisso'], ['sottopancia', 'Sottopancia'], ['notiziario', 'Notiziario (due targhe)'], ['rullo', 'Rullo (sale)'], ['crawl', 'Crawl (scorre)'],
  ['neon', 'Neon (si accende)'], ['cinema', 'Cinema (si avvicina)'], ['macchina', 'Macchina da scrivere'], ['rimbalzo', 'Rimbalzo'],
  ['social', 'Social (fascia)'], ['citazione', 'Citazione'], ['gradiente', 'Sfumato'], ['etichetta', 'Etichetta'], ['rivela', 'Rivela'],
  ['glitch', 'Glitch'], ['grande', 'Grande'], ['cascata', 'Cascata (lettere che cadono)'], ['assembla', 'Si compone (lettere da lontano)'],
  ['onda', 'Onda (lettere che ondeggiano)'], ['evidenzia', 'Evidenziatore'], ['karaoke', 'Karaoke'], ['estruso', '3D (lettere con spessore)'],
  ['ombraLunga', 'Ombra lunga'], ['contorno', 'Solo contorno'],
];
const ANIMAZIONI: [string, string][] = [['', 'Come lo stile'], ['dissolve', 'Dissolve'], ['sale', 'Sale'], ['scende', 'Scende'], ['sinistra', 'Da sinistra'], ['destra', 'Da destra'], ['zoom', 'Zoom'], ['rimbalza', 'Rimbalza']];

export class Ispettore {
  el: HTMLElement;
  private corpo: HTMLElement;
  private campi: Campo[] = [];
  private firma = '';
  /** le sezioni aperte (di partenza sono tutte chiuse; si ricorda finché il programma è aperto) */
  private aperti = new Set<string>();
  /** le sezioni "principali" (quelle che servono per quel tipo di elemento) partono aperte: qui chi le ha chiuse apposta */
  private chiusi = new Set<string>();
  /** di che tipo è quello che si sta guardando (clip video, audio, titolo…): l'ordine delle sezioni si ricorda per ognuno */
  private chiave = '';

  private disiscrivi: (() => void)[] = [];

  /** `completo` = il pannello dell'editor che si apre col doppio clic sulla clip (tutte le sezioni); senza, il pannello a destra tiene solo le cose che servono al volo */
  constructor(private completo = false) {
    this.corpo = h('div', { class: 'isp-corpo' });
    this.el = h('div', { class: 'ispettore' + (completo ? ' completo' : '') }, this.corpo);
    this.disiscrivi.push(store.on('sel', () => this.costruisci()), store.on('doc', () => this.costruisci()),
      // il cursore si sposta: i parametri con i keyframe mostrano il valore di lì
      store.on('head', () => { for (const c of this.campi) if (c.anim) c.aggiorna(); }));
    // le maschere dell'AI sono pronte (o è cambiato il lavoro): il gruppo "Togli lo sfondo" si rifà
    const rifai = () => { this.firma = ''; this.costruisci(); };
    document.addEventListener('dpv:maschere', rifai);
    document.addEventListener('dpv:lavoro-sfondo', rifai);
    document.addEventListener('dpv:modello-ritaglio', rifai);
    this.disiscrivi.push(() => { document.removeEventListener('dpv:maschere', rifai); document.removeEventListener('dpv:lavoro-sfondo', rifai); document.removeEventListener('dpv:modello-ritaglio', rifai); });
    this.costruisci();
  }

  /** chi l'ha aperto in una finestra lo spegne alla chiusura */
  dispose() { for (const f of this.disiscrivi.splice(0)) f(); }

  private sel(): Clip[] {
    return store.doc.clips.filter((c) => store.sel.has(c.id));
  }

  private costruisci() {
    const cs = this.sel();
    // si ricostruisce se cambia la scelta o se cambiano i blocchi FX (le transizioni della clip scelta)
    const firma = cs.map((c) => c.id + c.kind + (c.fxb ? c.fxb.id : '') + ':' + c.fx.key + (c.fx.keyColori?.length ?? 0) + (c.gen?.anim?.id ?? '') + (c.gen?.html?.id ?? '') + (c.afx?.pulito ? 'p' + c.afx.pulito.forza : '') + (c.afx?.separata?.ruolo ?? '') + (c.ritaglio ? c.ritaglio.modo + (c.ritaglio.punti?.length ?? 0) + (maschereAggiornate(c) ? 'ok' : 'no') : '') + (c.anim ? ':' + percorsiAnimati(c).join('+') : '') + (c.maschere?.length ? ':m' + c.maschere.map((m) => m.id + m.forma + (m.punti?.length ?? '') + (m.spenta ? 'x' : '')).join(',') : ''))
      .join(',') + '|' + store.doc.clips.filter((c) => c.kind === 'fx').map((c) => c.id + c.start + ':' + c.len + (c.fxb?.id ?? '')).join(',');
    if (firma === this.firma && this.campi.length) { for (const c of this.campi) c.aggiorna(); return; }
    this.firma = firma;
    this.campi = [];
    if (!cs.length) {
      this.corpo.replaceChildren(h('div', { class: 'isp-vuoto' },
        h('b', null, 'Nessuna clip scelta'),
        h('p', null, 'Clicca una clip nella timeline: qui trovi il riassunto, gli effetti al volo e le poche regolazioni che servono. Il colore di tutto il montaggio si fa nella pagina Finale.'),
        h('ul', { class: 'isp-tasti' },
          h('li', null, h('kbd', null, '1'), ' taglia (le tracce accese) e sceglie il pezzo più corto'),
          h('li', null, h('kbd', null, '2'), ' elimina e passa alla clip dopo'),
          h('li', null, h('kbd', null, 'S'), ' separa o unisce i gruppi di clip'),
          h('li', null, h('kbd', null, 'Q'), ' / ', h('kbd', null, 'W'), ' via lo scarto a sinistra / a destra'),
          h('li', null, h('kbd', null, 'rotella'), ' un fotogramma alla volta, col suono'),
          h('li', null, h('kbd', null, 'Ctrl'), '+', h('kbd', null, 'rotella'), ' zoom della timeline')),
        // da qui si arriva a tutto il resto: la ricerca dei comandi e la guida
        h('div', { class: 'isp-aiuti' },
          h('button', { class: 'btn', on: { click: () => document.dispatchEvent(new CustomEvent('dpv:guida')) } }, '📖 Come si fa ', h('kbd', null, 'F1')))));
      return;
    }
    const blocchi = cs.filter((c) => c.kind === 'fx');
    if (blocchi.length === cs.length) { const tr = blocchi[0].fxb?.tipo === 'transizione'; this.corpo.replaceChildren(...this.conOrdine(tr ? 'blocco:transizione' : 'blocco:effetto', this.blocchi(blocchi))); return; }
    const video = cs.filter(isVideoClip);
    const audio = cs.filter((c) => !isVideoClip(c) && c.kind !== 'fx');
    const primo = video[0] ?? audio[0];
    const p = store.doc;
    const r = fps(p.rate);
    const m = mediaOf(p, primo);
    const preparazioni = h('div', { class: 'workflow-azioni' },
      h('button', { class: 'btn-mini', on: { click: () => document.dispatchEvent(new CustomEvent('dpv:attivita', { detail: [...new Set(this.sel().map((c) => c.media).filter(Boolean))] })) } }, 'Anteprima e file · prepara…'),
      h('button', { class: 'btn-mini', on: { click: () => document.dispatchEvent(new CustomEvent('dpv:centro-ai')) } }, 'AI sulla selezione…'));
    const out: HTMLElement[] = [];
    // ——— il riassunto: cos'è, dove sta, da dove viene
    if (cs.some((c) => c.media)) out.push(preparazioni);
    const tipo = primo.kind === 'title' ? (primo.gen?.anim ? 'Animazione' : primo.gen?.html ? 'Titolo animato' : 'Titolo') : primo.kind === 'media' ? (m?.type === 'image' ? 'Immagine' : isVideoClip(primo) ? 'Video' : 'Audio') : 'Generatore';
    const legate = primo.link ? p.clips.filter((c) => c.link === primo.link).length - 1 : 0;
    out.push(h('div', { class: 'isp-testa' },
      h('input', {
        class: 'isp-nome', value: cs.length > 1 ? `${cs.length} clip scelte` : primo.name, disabled: cs.length > 1,
        on: { change: (e: Event) => store.edit('Rinomina clip', () => { for (const c of this.sel()) c.name = (e.target as HTMLInputElement).value; }) },
      }),
      h('div', { class: 'isp-riassunto' },
        h('span', { class: 'chip-tipo' }, tipo),
        h('span', null, 'da ', h('b', { class: 'tc-testo' }, frameToTc(primo.start, p.rate, p.drop))),
        h('span', null, 'dura ', h('b', null, (primo.len / r).toFixed(2).replace('.', ',') + ' s')),
        legate ? h('span', { class: 'chip-link' }, `⛓ +${legate}`) : null,
        m && m.type !== 'audio' && m.width ? h('span', null, `${m.width}×${m.height}${m.fps ? ' · ' + Math.round(m.fps * 100) / 100 + ' fps' : ''}`) : null,
        m ? h('span', { class: 'isp-sorgente' }, m.name) : h('span', null, trackOf(p, primo.track).name)),
      // le tre cose che si fanno più spesso a una clip scelta
      h('div', { class: 'isp-azioni' },
        h('button', { class: 'btn-mini', title: 'Una copia subito dopo (Ctrl+D)', on: { click: () => esegui('duplica') } }, '⧉ Duplica'),
        h('button', { class: 'btn-mini', title: 'Porta il cursore all\'inizio della clip', on: { click: () => { motore.setMonitor('recorder'); motore.vaiA(primo.start); } } }, '⇤ Vai all\'inizio'),
        h('button', { class: 'btn-mini', title: 'Toglie la clip (2)', on: { click: () => esegui('elimina') } }, '🗑 Elimina'))));

    // ——— gli effetti audio al volo: interruttori
    const chips = (lista: typeof EFFETTI_AUDIO, quali: Clip[]) => h('div', { class: 'isp-chips' }, lista.filter((e) => adatte(e, quali).length).map((e) => {
      const b = h('button', { class: 'chip', title: e.info, on: { click: () => alternaEffetto(e.id, adatte(e, this.sel()).map((c) => c.id)) } }, e.nome);
      const agg = () => { const q = adatte(e, this.sel()); b.classList.toggle('acceso', q.length > 0 && q.every((c) => e.acceso(c, store.doc))); };
      agg();
      this.campi.push({ el: b, aggiorna: agg });
      return b;
    }));
    // i video prima: posizione, effetti e look. Le clip si cercano per id quando si preme (dopo un annulla gli oggetti sono altri)
    const ids = video.map((c) => c.id);
    const vive = () => store.doc.clips.filter((c) => ids.includes(c.id));
    if (video.length) {
      // — la posizione: il quadro in miniatura che si trascina, le posizioni pronte, l'opacità
      const pronte = h('div', { class: 'pp-griglia' }, posizioniPronte().map((x) => h('button', {
        class: 'pp-tessera', title: x.titolo,
        on: { click: () => store.edit(x.nome, () => { for (const c of vive()) { c.tf = x.fn(c); c.tfFine = undefined; c.via = undefined; togliAnimazione(c, 'tf.x', 'tf.y', 'tf.scale', 'tf.sx', 'tf.rot'); } }) },
      }, disegnino(x.box), h('span', null, x.nome))));
      out.push(this.gruppo('immagine', 'Posizione e movimento', [
        h('label', { class: 'etichetta' }, 'Posizioni pronte'), pronte,
        this.cursore('Opacità', 0, 100, 1, (c) => Math.round(c.opacity * 100), (c, v) => { c.opacity = v / 100; c.opKeys = []; }, '%', video, 'opacity'),
        h('div', { class: 'isp-riga col' }, h('label', null, 'Movimento', h('small', null, 'la clip si sposta o si ingrandisce da sola durante la ripresa')),
          h('div', { class: 'pp-griglia' }, MOVIMENTI.map((m) => h('button', {
            class: 'pp-tessera' + ((m.id === 'fermo') === !video[0].tfFine && m.id === 'fermo' ? ' acceso' : ''),
            title: m.id === 'fermo' ? 'Resta dov\'è' : 'Dall\'inizio alla fine della clip, partendo (o arrivando) dove sta adesso',
            on: { click: () => store.edit('Movimento: ' + m.nome, (pp) => { for (const c of video) { const x = clipById(pp, c.id); if (x) movimentoPronto(pp, x, m.id); } }) },
          }, h('span', { class: 'mv-prev' }, h('i', { class: 'mv-box mv-' + m.id })), h('span', null, m.nome))))),
        video[0].tfFine ? h('p', { class: 'nota' }, `Si muove: parte da dove l'hai messa all'inizio, passa da ${(video[0].via ?? []).length ? (video[0].via ?? []).length + ' tappe di mezzo e ' : 'nessuna tappa di mezzo, '}arriva dove l'hai messa alla fine. Sul monitor grande: ◀ Inizio / Fine ▶, ＋ Tappa; o ferma il cursore fra due tappe e muovi: ne nasce una.`) : null,
        h('details', { class: 'pp-piu' }, h('summary', null, 'Numeri precisi'),
          this.cursore('Zoom', 20, 300, 1, (c) => Math.round(c.tf.scale * 100), (c, v) => { c.tf.scale = v / 100; }, '%', video, 'tf.scale'),
          this.cursore('Larghezza (stira)', 20, 300, 1, (c) => Math.round((c.tf.sx ?? 1) * 100), (c, v) => { c.tf.sx = v / 100; }, '%', video, 'tf.sx'),
          this.cursore('Orizzontale', -p.w, p.w, 1, (c) => Math.round(c.tf.x), (c, v) => { c.tf.x = v; }, 'px', video, 'tf.x'),
          this.cursore('Verticale', -p.h, p.h, 1, (c) => Math.round(c.tf.y), (c, v) => { c.tf.y = v; }, 'px', video, 'tf.y'),
          this.cursore('Rotazione', -180, 180, 0.5, (c) => c.tf.rot, (c, v) => { c.tf.rot = v; }, '°', video, 'tf.rot'),
          this.cursore('Angoli tondi', 0, 100, 1, (c) => Math.round((c.tf.angoli ?? 0) * 100), (c, v) => { c.tf.angoli = v / 100; }, '%', video, 'tf.angoli'),
          this.cursore('Ombra', 0, 100, 1, (c) => Math.round((c.tf.ombra ?? 0) * 100), (c, v) => { c.tf.ombra = v / 100; }, '%', video, 'tf.ombra')),
        video.some((c) => c.opKeys.length) ? h('p', { class: 'nota' }, 'Questa clip ha una linea elastica: la trasparenza cambia nel tempo. Muovere l\'opacità la toglie.') : null,
      ], primo.kind === 'media'));

      // — gli effetti e i look: miniature vere, applicate al fotogramma dove sei (solo nell'editor: nel pannello si trascinano dalla libreria)
      if (this.completo) {
      const tutti = EFFETTI_VIDEO.filter((e) => adatte(e, video).length);
      // le famiglie: meno miniature alla volta, e si capisce a cosa servono
      const FAMIGLIA: Record<string, string> = {
        auto: 'colore', vivace: 'colore', luminoso: 'colore', caldo: 'colore', freddo: 'colore', pop: 'colore', contrasto: 'colore',
        cinema: 'atmosfera', tramonto: 'atmosfera', notte: 'atmosfera', gelo: 'atmosfera', sbiadito: 'atmosfera', sogno: 'atmosfera',
        bn: 'vecchio', seppia: 'vecchio', pellicola: 'vecchio', vhs: 'vecchio', crt: 'vecchio',
      };
      const grid = tessere([
        { id: 'nessuno', nome: 'Com\'è', info: 'toglie tutti gli effetti rapidi', nessuna: true, provino: scenaRitocco(() => {}), acceso: () => !tutti.some((e) => adatte(e, vive()).some((c) => e.acceso(c, store.doc))), clic: () => store.edit('Toglie gli effetti rapidi', (pp) => { for (const c of pp.clips) if (ids.includes(c.id)) for (const e of tutti) if (e.acceso(c, pp)) e.metti(c, false, pp); }) },
        ...tutti.map((e) => ({
          id: e.id, nome: e.nome, info: e.info, gruppo: FAMIGLIA[e.id] ?? 'altro',
          provino: scenaRitocco((c, pp) => e.metti(c, true, pp)),
          acceso: () => { const q = adatte(e, vive()); return q.length > 0 && q.every((c) => e.acceso(c, store.doc)); },
          clic: () => alternaEffetto(e.id, ids),
        })),
      ], { gruppi: [['colore', 'Colore'], ['atmosfera', 'Atmosfera'], ['vecchio', 'Vintage'], ['altro', 'Altro']] });
      this.campi.push({ el: grid.el, aggiorna: grid.aggiorna });
      out.push(this.gruppo('fxv', 'Effetti e look', [
        grid.el,
      ]));
      }
      // lo sfondo lavora su UNA clip sola, quella su cui si è cliccato (le clip legate si scelgono insieme, ma la sagoma si fa a una sola:
      // se no la stessa maschera finiva anche sulle altre)
      const cliccata = [...store.sel].map((id) => video.find((c) => c.id === id)).find(Boolean) ?? video[0];
      out.push(this.sfondoGruppo([cliccata], video.length));
      const sg = this.seguiGruppo(video);
      if (sg) out.push(sg);
      out.push(this.gruppo('colore', 'Colore: regola a mano', [
        this.cursore('Luce', -50, 50, 1, (c) => Math.round(c.fx.bright * 100), (c, v) => { c.fx.bright = v / 100; }, '', video, 'fx.bright'),
        this.cursore('Contrasto', 50, 150, 1, (c) => Math.round(c.fx.contrast * 100), (c, v) => { c.fx.contrast = v / 100; }, '%', video, 'fx.contrast'),
        this.cursore('Saturazione', 0, 200, 1, (c) => Math.round(c.fx.sat * 100), (c, v) => { c.fx.sat = v / 100; }, '%', video, 'fx.sat'),
        this.cursore('Temperatura', -100, 100, 1, (c) => Math.round((c.fx.temp ?? 0) * 100), (c, v) => { c.fx.temp = v / 100; }, ' (freddo ↔ caldo)', video, 'fx.temp'),
        this.cursore('Tinta', -180, 180, 1, (c) => c.fx.hue, (c, v) => { c.fx.hue = v; }, '°', video, 'fx.hue'),
        this.pulsanti([['💧 Bilancia il bianco (clic sul monitor)', () => bilanciaBianco(video[0].id)], ['Azzera il colore', () => store.edit('Azzera colore', () => { for (const c of vive()) { c.fx.bright = 0; c.fx.contrast = 1; c.fx.sat = 1; c.fx.hue = 0; c.fx.temp = 0; togliAnimazione(c, 'fx.bright', 'fx.contrast', 'fx.sat', 'fx.hue', 'fx.temp'); c.fx.look = 'none'; c.fx.effetti = undefined; } })]]),
        this.pulsanti([['Colore avanzato…', () => apriColoreAvanzato(video[0].id)]]),
        h('p', { class: 'nota' }, 'Per dare lo stesso colore a tutto il montaggio c\'è la pagina Finale. Doppio clic su un cursore = valore di partenza.'),
      ]));
    }
    // le maschere a forma (una clip sola, con un'immagine) e i keyframe di tutti gli altri parametri
    if (cs.length === 1 && video.length === 1 && ['media', 'color', 'bars', 'countdown'].includes(video[0].kind)) out.push(this.maschereGruppo(video[0]));
    if (audio.length) {
      out.push(this.gruppo('audio', 'Volume', [
        this.cursore('Volume', -40, 12, 0.5, (c) => c.gain, (c, v) => { c.gain = v; c.gainKeys = []; }, 'dB', audio, 'gain'),
        this.pulsanti([['−6', () => store.edit('Volume', () => { for (const c of audio) { c.gain = -6; c.gainKeys = []; togliAnimazione(c, 'gain'); } })], ['0 dB', () => store.edit('Volume', () => { for (const c of audio) { c.gain = 0; c.gainKeys = []; togliAnimazione(c, 'gain'); } })], ['+6', () => store.edit('Volume', () => { for (const c of audio) { c.gain = 6; c.gainKeys = []; togliAnimazione(c, 'gain'); } })], ['Muto', () => store.edit('Volume', () => { for (const c of audio) { c.gain = -60; c.gainKeys = []; togliAnimazione(c, 'gain'); } })]]),
        this.cursore('Panorama', -100, 100, 1, (c) => Math.round(c.pan * 100), (c, v) => { c.pan = v / 100; }, '', audio, 'pan'),
        h('p', { class: 'nota' }, 'Nella timeline la linea gialla è il volume: un clic ci mette un punto da portare su e giù (per alzare o abbassare solo in quel momento); Maiusc+trascina alza o abbassa tutto il tratto.'),
      ], true));
      // «Questa è la voce» e «Abbassa sotto la voce»: una clip alla volta
      if (audio.length === 1 && !video.length) {
        const duck = creaDuckingClip(audio[0].id);
        this.campi.push({ el: duck.el, aggiorna: duck.aggiorna });
        if (duck.el.childElementCount) out.push(this.gruppo('ducking', 'Voce e musica', [duck.el]));
      }
      out.push(this.gruppo('fxa', video.length ? 'Effetti audio' : 'Effetti rapidi', [this.tessereAudio(audio, chips)]));
    }
    // l'audio con l'AI: togliere i rumori e separare voce e base. Per l'audio sta aperto (è quello che si cerca); per una ripresa con audio sta chiuso
    if (cs.length === 1 && primo.kind !== 'fx') out.push(this.animazioniGruppo(primo));
    const conAudio = audio.find((c) => c.kind === 'media') ?? video.find((c) => c.kind === 'media' && audioAIPossibile(c).rumore);
    if (conAudio) out.push(this.gruppo('audioai', 'Audio: pulisci e separa (AI)', righeAudioAI(conAudio), audio.length > 0));
    if (this.completo) out.push(this.gruppo('durata', 'Durata e velocità', [this.durata(cs.filter((c) => c.kind !== 'fx'))]));
    if (this.completo && video.length) out.push(this.transizioniClip(video[0]));
    const gen = cs.filter((c) => c.kind === 'color' || c.kind === 'bars' || c.kind === 'tone' || c.kind === 'beep');
    if (gen.length) {
      const g0 = gen[0];
      const righe: HTMLElement[] = [];
      if (g0.kind === 'color') {
        righe.push(this.colore('Colore', (c) => c.gen?.color ?? '#000', (c, v) => { c.gen = { ...c.gen, color: v }; }, gen));
        righe.push(this.colore('Sfuma verso', (c) => c.gen?.color2 ?? c.gen?.color ?? '#000', (c, v) => { c.gen = { ...c.gen, color2: v }; }, gen));
        righe.push(this.pulsanti([
          ...SFONDI.map((x): [string, () => void] => [x.nome, () => store.edit('Sfondo ' + x.nome, () => { for (const c of gen) c.gen = { ...c.gen, color: x.a, color2: x.b }; })]),
          ['Pieno', () => store.edit('Colore pieno', () => { for (const c of gen) { const g = { ...c.gen }; delete g.color2; c.gen = g; } })],
        ]));
      }
      if (g0.kind === 'bars') righe.push(this.scelta('Barre', [['smpte', 'SMPTE (NTSC)'], ['ebu', 'EBU 100/75 (PAL)']], (c) => c.gen?.bars ?? 'smpte', (c, v) => { c.gen = { ...c.gen, bars: v as 'smpte' }; }, gen));
      if (g0.kind === 'tone' || g0.kind === 'beep') {
        righe.push(this.cursore('Frequenza', 100, 10000, 10, (c) => c.gen?.freq ?? 1000, (c, v) => { c.gen = { ...c.gen, freq: v }; }, 'Hz', gen));
        righe.push(this.cursore('Livello', -40, 0, 1, (c) => c.gen?.level ?? -18, (c, v) => { c.gen = { ...c.gen, level: v }; }, 'dBFS', gen));
      }
      out.push(this.gruppo('generatore', 'Generatore', righe, true));
    }
    const animati = cs.filter((c) => c.kind === 'title' && c.gen?.anim);
    const htmlCs = cs.filter((c) => c.kind === 'title' && !c.gen?.anim && c.gen?.html);
    const titoli = cs.filter((c) => c.kind === 'title' && !c.gen?.anim && !c.gen?.html);
    if (animati.length) out.push(this.animatrice(animati));
    if (htmlCs.length) out.push(this.titoloHtml(htmlCs));
    if (titoli.length) out.push(this.titolatrice(titoli));
    // il suono dentro titoli, countdown e colori: niente clip audio a parte, sta tutto su una riga
    const sonore = cs.filter((c) => c.kind === 'title' || c.kind === 'countdown' || c.kind === 'color');
    if (sonore.length) {
      const s0 = sonore[0].sfx ?? {};
      const suoni: [string, string][] = [['', 'Nessun suono'], ...SUONI.map((x) => [x.id, x.nome] as [string, string])];
      out.push(this.gruppo('csuono', 'Suono della clip', [
        this.spunta('Suono acceso', (c) => !!c.sfx?.audio && !!c.sfx.suono, (c, v) => { c.sfx ??= {}; if (c.sfx.suono) c.sfx.audio = v; }, sonore),
        this.scelta('Suono', suoni, (c) => c.sfx?.suono ?? '', (c, v) => { c.sfx ??= {}; c.sfx.suono = v || undefined; c.sfx.audio = !!v; if (v && c.id === sonore[0].id) ascoltaSuono(v, c.sfx.volume ?? 0); }, sonore),
        this.cursore('Volume', -24, 6, 1, (c) => c.sfx?.volume ?? 0, (c, v) => { c.sfx ??= {}; c.sfx.volume = v; }, ' dB', sonore),
        h('div', { class: 'isp-chips' }, h('button', { class: 'chip', disabled: !s0.suono, on: { click: () => { if (s0.suono) ascoltaSuono(s0.suono, s0.volume ?? 0); } } }, '▶ Ascolta')),
        h('p', { class: 'nota' }, sonore[0].kind === 'countdown' ? 'Il countdown fa un bip a ogni numero (scegli "Bip" per quello classico).' : 'Parte con la clip. Si accende anche dall\'altoparlante sulla clip nella timeline.'),
      ]));
    }
    if (this.completo && video.length) {
      const taglia = (nome: string, l: number, r: number, t: number, bt: number): [string, () => void] => [nome, () => store.edit('Ritaglio ' + nome, () => { for (const c of vive()) { c.tf.cropL = l; c.tf.cropR = r; c.tf.cropT = t; c.tf.cropB = bt; } })];
      // un quadrato (o un 9:16) preso dal centro: quanto togliere ai lati, secondo la forma di partenza dell'immagine
      const centro = (rap: number): [string, () => void] => [rap === 1 ? 'Quadrato al centro' : 'Verticale 9:16 al centro', () => store.edit('Ritaglio al centro', () => {
        for (const c of vive()) {
          const mm = mediaOf(p, c);
          const w = mm?.width ? (mm.rotation % 180 ? mm.height : mm.width) : p.w, hh = mm?.height ? (mm.rotation % 180 ? mm.width : mm.height) : p.h;
          const voluta = rap < 1 ? 9 / 16 : 1;
          const tolto = Math.max(0, Math.min(0.45, (1 - (hh * voluta) / w) / 2));
          c.tf.cropL = c.tf.cropR = tolto; c.tf.cropT = c.tf.cropB = 0;
        }
      })];
      out.push(this.gruppo('ritaglio', 'Ritaglio (taglia i bordi)', [
        this.pulsanti([taglia('Nessuno', 0, 0, 0, 0), centro(1), centro(9 / 16), taglia('Bande cinema', 0, 0, 0.12, 0.12)]),
        this.cursore('A sinistra', 0, 50, 0.5, (c) => c.tf.cropL * 100, (c, v) => { c.tf.cropL = v / 100; }, '%', video, 'tf.cropL'),
        this.cursore('A destra', 0, 50, 0.5, (c) => c.tf.cropR * 100, (c, v) => { c.tf.cropR = v / 100; }, '%', video, 'tf.cropR'),
        this.cursore('In alto', 0, 50, 0.5, (c) => c.tf.cropT * 100, (c, v) => { c.tf.cropT = v / 100; }, '%', video, 'tf.cropT'),
        this.cursore('In basso', 0, 50, 0.5, (c) => c.tf.cropB * 100, (c, v) => { c.tf.cropB = v / 100; }, '%', video, 'tf.cropB'),
        h('p', { class: 'nota' }, 'Toglie una parte dell\'immagine ai quattro lati (la parte tolta non si vede). Sul monitor grande c\'è anche ✂ Ritaglia, per farlo col mouse dai lati.'),
      ]));
    }
    // per titoli, animazioni e generatori la sezione loro (testo, campi, colore…) sta in cima, subito sotto il riassunto
    const prima = out.findIndex((e) => ['titolo', 'animazione', 'generatore'].includes(e.dataset?.g ?? ''));
    if (prima > 1) out.splice(1, 0, ...out.splice(prima, 1));
    const chiaveClip = (primo.kind === 'title' ? (primo.gen?.anim || primo.gen?.html ? 'animazione' : 'titolo') : primo.kind === 'media' ? (m?.type === 'image' ? 'immagine' : isVideoClip(primo) ? 'video' : 'audio') : 'generatore');
    this.corpo.replaceChildren(...this.conOrdine('clip:' + chiaveClip, out));
  }

  /** gli effetti rapidi dell'audio: tessere con un disegnino del suono (si animano al passaggio), le due AI per la voce e gli effetti sul filtro */
  private tessereAudio(audio: Clip[], _chips: unknown): HTMLElement {
    const id0 = () => audio[0]?.id ?? '';
    const barre = (profilo: number[]) => h('span', { class: 'aud-prev' }, ...profilo.map((v, i) => h('i', { style: `height:${v}%;animation-delay:${i * 60}ms` })));
    const uniforme = [30, 55, 70, 45, 80, 60, 35, 75, 50, 65, 40, 55];
    const voci: { nome: string; info: string; profilo: number[]; ai?: boolean; clic: () => void; acceso?: () => boolean }[] = [
      { nome: 'Voce pulita', ai: true, info: 'AI: toglie solo fruscio, ventole e rumori di fondo, la voce resta com\'è (MossFormer2)', profilo: [40, 45, 42, 46, 44, 45, 43, 46, 44, 45, 42, 44], clic: () => void faiTogliRumore(id0(), 'pulita') },
      ...(clearAttivo() ? [{ nome: 'Voce migliorata', ai: true, info: 'AI: toglie i rumori e rifà la voce da podcast, più piena e chiara, a volume giusto (Clear)', profilo: [55, 62, 70, 66, 72, 68, 74, 70, 66, 72, 64, 60], clic: () => void faiTogliRumore(id0(), 'podcast') }] : []),
      { nome: 'Voce isolata', ai: true, info: 'AI: tiene solo la voce (via musica, TV, gente) e poi toglie il rumore', profilo: [10, 20, 80, 90, 30, 15, 85, 95, 40, 10, 70, 60], clic: () => void faiTogliRumore(id0(), 'isolata') },
      ...EFFETTI_AUDIO.filter((e) => adatte(e, audio).length && !['fadeIn', 'fadeOut', 'incrocio', 'dissolviAudio'].includes(e.id)).map((e) => ({
        nome: e.nome, info: e.info,
        profilo: e.id === 'robot' ? [80, 20, 80, 20, 80, 20, 80, 20, 80, 20, 80, 20] : e.id === 'radio' ? [0, 0, 60, 60, 60, 60, 60, 60, 60, 0, 0, 0] : e.id === 'ovattato' ? [28, 30, 32, 34, 32, 30, 28, 26, 24, 22, 20, 18] : e.id === 'bassi' ? [10, 14, 50, 70, 80, 70, 60, 50, 60, 70, 55, 40] : uniforme,
        clic: () => alternaEffetto(e.id, adatte(e, this.sel()).map((c) => c.id)),
        acceso: () => { const q = adatte(e, this.sel()); return q.length > 0 && q.every((c) => e.acceso(c, store.doc)); },
      })),
    ];
    const griglia = h('div', { class: 'pp-griglia' }, voci.map((v) => {
      const b = h('button', { class: 'pp-tessera' + (v.ai ? ' ai' : ''), title: v.info, on: { click: v.clic } }, barre(v.profilo), h('span', null, v.nome, v.ai ? ' ✨' : ''));
      const agg = () => b.classList.toggle('acceso', !!v.acceso?.());
      agg();
      this.campi.push({ el: b, aggiorna: agg });
      return b;
    }));
    return griglia;
  }

  /** le animazioni del catalogo: quale, e tutti i campi che ha (testi, colori, numeri), con i loro valori */
  private animatrice(an: Clip[]): HTMLElement {
    const a0 = an[0].gen!.anim!;
    const def = animazione(a0.id);
    const righe: (HTMLElement | null)[] = [];
    righe.push(this.scelta('Animazione', GRUPPI_ANIM.filter((g) => g.id !== 'segui' || def?.gruppo === 'segui').flatMap((g) => CATALOGO_ANIM.filter((a) => a.gruppo === g.id).map((a) => [a.id, `${g.nome} · ${a.nome}`] as [string, string])),
      (c) => c.gen?.anim?.id ?? '', (c, v) => {
        if (!c.gen?.anim || c.gen.anim.id === v) return;
        // si cambia animazione tenendo i testi (nome, ruolo, titolo…) e dove sta e quanto è grande: i colori e il carattere sono quelli pensati per la nuova
        const vecchi = valoriDi(c.gen.anim);
        const nuova = nuovaAnim(v);
        const nuovoDef = animazione(v);
        for (const k of nuovoDef?.campi ?? []) {
          if ((k.tipo === 'testo' || k.tipo === 'lungo' || k.id === 'pos' || k.id === 'dim') && k.id in vecchi && typeof vecchi[k.id] === typeof k.def) nuova.v[k.id] = vecchi[k.id];
        }
        c.gen.anim = nuova;
        c.name = animazione(v)?.nome ?? c.name;
      }, an));
    if (def) righe.push(h('p', { class: 'nota' }, def.info + '.' + (def.fondo ? ' Riempie tutto il quadro: mettila su una traccia sotto le altre.' : '')));
    const v0 = () => valoriDi(store.doc.clips.find((c) => c.id === an[0].id)?.gen?.anim ?? a0);
    const metti = (id: string, valore: string | number | boolean) => store.edit('Animazione: ' + id, (pp) => { for (const x of an) { const z = pp.clips.find((c) => c.id === x.id); if (z?.gen?.anim) z.gen.anim.v[id] = valore; } });
    const valoreDi = (c: Clip, k: CampoAnim) => (c.gen?.anim?.v[k.id] ?? k.def);
    for (const k of def?.campi ?? []) {
      if (k.tipo === 'testo' || k.tipo === 'lungo') {
        const campo = (k.tipo === 'lungo' ? h('textarea', { class: 'campo-testo', rows: 4 }) : h('input', { class: 'campo-testo', type: 'text' })) as HTMLInputElement | HTMLTextAreaElement;
        campo.value = String(v0()[k.id] ?? '');
        let timer = 0;
        campo.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => metti(k.id, campo.value), 250); });
        this.campi.push({ el: campo, aggiorna: () => { if (document.activeElement !== campo) campo.value = String(v0()[k.id] ?? ''); } });
        righe.push(h('div', { class: 'isp-riga col' }, h('label', { title: k.nome }, k.nome), campo));
      } else if (k.tipo === 'numero') {
        const min = k.min ?? 0, max = k.max ?? 100, step = k.step ?? 1;
        if (max - min > 1000) {
          const n = h('input', { type: 'number', class: 'num largo', min, max, step }) as HTMLInputElement;
          n.value = String(v0()[k.id] ?? k.def);
          n.addEventListener('change', () => metti(k.id, Math.max(min, Math.min(max, Number(n.value) || 0))));
          this.campi.push({ el: n, aggiorna: () => { if (document.activeElement !== n) n.value = String(v0()[k.id] ?? k.def); } });
          righe.push(h('div', { class: 'isp-riga' }, h('label', null, k.nome), n));
        } else righe.push(this.cursore(k.nome, min, max, step, (c) => Number(valoreDi(c, k)), (c, v) => { if (c.gen?.anim) c.gen.anim.v[k.id] = v; }, '', an));
      } else if (k.tipo === 'colore') righe.push(this.colore(k.nome, (c) => String(valoreDi(c, k)), (c, v) => { if (c.gen?.anim) c.gen.anim.v[k.id] = v; }, an));
      else if (k.tipo === 'scelta') righe.push(this.scelta(k.nome, k.scelte ?? [], (c) => String(valoreDi(c, k)), (c, v) => { if (c.gen?.anim) c.gen.anim.v[k.id] = v; }, an));
      else righe.push(this.spunta(k.nome, (c) => !!valoreDi(c, k), (c, v) => { if (c.gen?.anim) c.gen.anim.v[k.id] = v; }, an));
    }
    righe.push(h('p', { class: 'nota' }, 'Entra all\'inizio e nell\'ultimo mezzo secondo esce: allunga o accorcia la clip dalla timeline e l\'animazione si adatta. Sull\'immagine del monitor si sposta e si ingrandisce come ogni clip.'));
    return this.gruppo('animazione', 'Animazione', righe, true);
  }

  /** i titoli animati HTML: quale modello, e tutti i campi che ha (testi, colori, tempi), con i loro valori */
  private titoloHtml(an: Clip[]): HTMLElement {
    const h0 = an[0].gen!.html!;
    const def = modelloHtml(h0.id);
    const righe: (HTMLElement | null)[] = [];
    righe.push(this.scelta('Titolo animato', GRUPPI_HTML.flatMap((g) => modelliDi(g.id).map((m) => [m.id, m.nome] as [string, string])),
      (c) => c.gen?.html?.id ?? '', (c, v) => {
        if (!c.gen?.html || c.gen.html.id === v) return;
        // si cambia modello tenendo i testi e i tempi uguali per nome e per tipo (nome, titolo, entrata, uscita, grandezza…)
        const vecchi = valoriHtmlDi(c.gen.html);
        const nuovo = nuovoHtml(v);
        for (const k of modelloHtml(v)?.campi ?? []) {
          if ((k.tipo === 'testo' || k.tipo === 'lungo' || k.id === 'ent' || k.id === 'usc' || k.id === 'dim') && k.id in vecchi && typeof vecchi[k.id] === typeof k.def) nuovo.v[k.id] = vecchi[k.id];
        }
        c.gen.html = nuovo;
        c.name = modelloHtml(v)?.nome ?? c.name;
      }, an, Object.fromEntries(GRUPPI_HTML.flatMap((g) => modelliDi(g.id).map((m) => [m.id, g.nome])))));
    if (def) righe.push(h('p', { class: 'html-nota' }, def.info + '.'));
    const v0 = () => valoriHtmlDi(store.doc.clips.find((c) => c.id === an[0].id)?.gen?.html ?? h0);
    const metti = (id: string, valore: string | number | boolean) => store.edit('Titolo animato: ' + id, (pp) => { for (const x of an) { const z = pp.clips.find((c) => c.id === x.id); if (z?.gen?.html) z.gen.html.v[id] = valore; } });
    const valoreDi = (c: Clip, k: CampoAnim) => (c.gen?.html ? valoriHtmlDi(c.gen.html)[k.id] : undefined) ?? k.def;
    const scrivi = (k: CampoAnim) => (c: Clip, v: string | number | boolean) => { if (c.gen?.html) c.gen.html.v[k.id] = v; };
    for (const k of def?.campi ?? []) {
      if (k.tipo === 'testo' || k.tipo === 'lungo') {
        const campo = (k.tipo === 'lungo' ? h('textarea', { class: 'campo-testo', rows: 3 }) : h('input', { class: 'campo-testo', type: 'text' })) as HTMLInputElement | HTMLTextAreaElement;
        campo.value = String(v0()[k.id] ?? '');
        let timer = 0;
        campo.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => metti(k.id, campo.value), 250); });
        this.campi.push({ el: campo, aggiorna: () => { if (document.activeElement !== campo) campo.value = String(v0()[k.id] ?? ''); } });
        righe.push(h('label', { class: 'etichetta' }, k.nome), campo);
      } else if (k.tipo === 'numero') {
        const min = k.min ?? 0, max = k.max ?? 100, step = k.step ?? 1;
        if (max - min > 1000) {
          const n = h('input', { type: 'number', class: 'num largo', min, max, step }) as HTMLInputElement;
          n.value = String(v0()[k.id] ?? k.def);
          n.addEventListener('change', () => metti(k.id, Math.max(min, Math.min(max, Number(n.value) || 0))));
          this.campi.push({ el: n, aggiorna: () => { if (document.activeElement !== n) n.value = String(v0()[k.id] ?? k.def); } });
          righe.push(h('div', { class: 'isp-riga' }, h('label', null, k.nome), n));
        } else righe.push(this.cursore(k.nome, min, max, step, (c) => Number(valoreDi(c, k)), scrivi(k) as (c: Clip, v: number) => void, '', an));
      } else if (k.tipo === 'colore') righe.push(this.colore(k.nome, (c) => String(valoreDi(c, k)), scrivi(k) as (c: Clip, v: string) => void, an));
      else if (k.tipo === 'scelta') righe.push(this.scelta(k.nome, k.scelte ?? [], (c) => String(valoreDi(c, k)), scrivi(k) as (c: Clip, v: string) => void, an));
      else righe.push(this.spunta(k.nome, (c) => !!valoreDi(c, k), scrivi(k) as (c: Clip, v: boolean) => void, an));
    }
    // la durata della clip: la stessa cosa della sezione «Durata e velocità», qui a portata di mano
    const r = fps(store.doc.rate);
    const durata = h('input', { type: 'number', class: 'num largo', min: 0.5, max: 600, step: 0.1 }) as HTMLInputElement;
    const aggDurata = () => { const c = store.doc.clips.find((x) => x.id === an[0].id); if (c && document.activeElement !== durata) durata.value = (c.len / r).toFixed(1); };
    aggDurata();
    durata.addEventListener('change', () => {
      store.edit('Durata', (p) => { for (const x of an) { const c = p.clips.find((z) => z.id === x.id); if (c) { const d = Math.max(1, Math.round(Number(durata.value) * r)) - c.len; if (d) M.trimClip(p, c.id, 'out', d, { ripple: modi.ripple, linked: true }); } } });
      aggDurata();
    });
    this.campi.push({ el: durata, aggiorna: aggDurata });
    righe.push(h('div', { class: 'isp-riga' }, h('label', null, 'Durata (secondi)'), durata));
    const stato = h('div', { class: 'html-stato' }, h('i'), 'Disegno dei titoli HTML: controllo…');
    void htmlDisponibile().then((si) => { stato.classList.toggle('ripiego', !si); stato.lastChild!.textContent = si ? 'Disegno dei titoli HTML: pieno' : "Questo sistema non sa disegnare l'HTML: si vedono solo le scritte"; });
    righe.push(stato);
    righe.push(h('p', { class: 'html-nota' }, "Entra all'inizio ed esce alla fine: i tempi si decidono qui sopra. Sull'immagine del monitor si sposta e si ingrandisce come ogni clip."));
    return this.gruppo('animazione', 'Titolo animato', righe, true);
  }

  /** "Togli lo sfondo": il colore (green screen), la luce, o l'AI che lo toglie da sola (persona, soggetto, oggetti coi clic) */
  private sfondoGruppo(video: Clip[], scelte = 1): HTMLElement {
    const c0 = video[0];
    const ids = video.map((c) => c.id);
    const modo = modoSfondo(c0);
    const righe: (HTMLElement | null)[] = [];
    if (scelte > 1) righe.push(h('p', { class: 'nota' }, `Vale solo per «${c0.name}»: le altre clip scelte (anche quelle legate) restano come sono.`));
    // i modi: quadratini con un disegnino (Off · Colore · Luce · AI)
    const AI3 = ['soggetto', 'persona', 'oggetti'];
    const inAI = AI3.includes(modo);
    const disp = new Set(modiPossibili(c0));
    const tessereModi: { id: string; nome: string; info: string; cls: string; acceso: boolean; clic: () => void }[] = [
      { id: 'nessuno', nome: 'Off', info: 'Lo sfondo resta com’è', cls: 'off', acceso: modo === 'nessuno', clic: () => impostaModo(ids, 'nessuno') },
      { id: 'colori', nome: 'Colore', info: 'Toglie un colore (green screen o blu): scegli il colore o prendilo dal monitor', cls: 'colore', acceso: modo === 'colori', clic: () => impostaModo(ids, 'colori') },
      { id: 'luma', nome: 'Luce', info: 'Toglie il nero o il bianco del fondo', cls: 'luce', acceso: modo === 'luma', clic: () => impostaModo(ids, 'luma') },
      ...(disp.has('oggetti') ? [{ id: 'ai', nome: 'AI ✨', info: 'Toglie lo sfondo con SAM 2.1: clicchi su una persona o su un oggetto e lo tiene, il resto va via', cls: 'ai', acceso: inAI, clic: () => { if (modo !== 'oggetti') cliccaCosaTenere(c0.id); } }] : []),
    ];
    righe.push(h('div', { class: 'pp-griglia sf-modi' }, tessereModi.map((t) => h('button', {
      class: 'pp-tessera' + (t.acceso ? ' acceso' : ''), title: t.info, 'data-modo': t.id,
      on: { click: t.clic },
    }, h('span', { class: 'sf-prev sf-' + t.cls }, t.cls === 'ai' ? h('i') : null), h('span', null, t.nome)))));
    if (modo === 'nessuno') righe.push(h('p', { class: 'nota' }, 'Scegli come togliere lo sfondo: Colore per un fondale verde o blu, Luce per un fondo nero o bianco, AI per qualunque ripresa.'));
    if (modo === 'colori') {
      const colori = coloriChiave(c0.fx);
      righe.push(h('div', { class: 'sf-colori' },
        this.colore('Colore da togliere', (c) => c.fx.keyColor, (c, v) => { c.fx.keyColor = v; }, video),
        ...colori.slice(1).map((col, i) => h('div', { class: 'isp-riga sf-extra' },
          h('label', null, 'Altro colore'),
          h('input', { type: 'color', value: col, on: { change: (e: Event) => store.edit('Colore da togliere', (pp) => { const z = clipById(pp, c0.id); if (z?.fx.keyColori) z.fx.keyColori[i] = (e.target as HTMLInputElement).value; }) } }),
          h('button', { class: 'btn-mini', title: 'Toglie questo colore', on: { click: () => togliColoreExtra(c0.id, i) } }, '✕')))));
      righe.push(this.pulsanti([['💧 Prendi il colore dal monitor', () => scegliColore(c0.id, false)]]));
      righe.push(this.pulsanti(CHIAVI.map((k): [string, () => void] => [k.nome, () => store.edit('Chiave ' + k.nome, () => { for (const c of video) { c.fx.key = 'chroma'; c.fx.keyColor = k.colore; delete c.fx.keyColori; } })])));
      righe.push(h('details', { class: 'pp-piu' }, h('summary', null, 'Rifinisci'),
        this.pulsanti([['✨ Trovalo da solo', () => void trovaColore(c0.id)], ...(colori.length < 3 ? [['＋ Un altro colore', () => scegliColore(c0.id, true)] as [string, () => void]] : [])]),
        this.cursore('Soglia', 0, 100, 1, (c) => Math.round(c.fx.keyLevel * 100), (c, v) => { c.fx.keyLevel = v / 100; }, '', video),
        this.cursore('Morbidezza', 0, 50, 1, (c) => Math.round(c.fx.keySoft * 100), (c, v) => { c.fx.keySoft = v / 100; }, '', video),
        this.cursore('Bordo', -100, 100, 1, (c) => Math.round((c.fx.keyBordo ?? 0) * 100), (c, v) => { c.fx.keyBordo = v / 100; }, '', video),
        this.cursore('Sfuma il bordo', 0, 100, 1, (c) => Math.round((c.fx.keySfuma ?? 0) * 100), (c, v) => { c.fx.keySfuma = v / 100; }, '', video),
        this.cursore('Pulisci', 0, 100, 1, (c) => Math.round((c.fx.keyPulisci ?? 0) * 100), (c, v) => { c.fx.keyPulisci = v / 100; }, '', video),
        this.cursore('Via il riflesso', 0, 100, 1, (c) => Math.round((c.fx.keySpill ?? SPILL0) * 100), (c, v) => { c.fx.keySpill = v / 100; }, '', video),
        this.spunta('Inverti: tieni il fondale', (c) => c.fx.keyInvert, (c, v) => { c.fx.keyInvert = v; }, video),
        h('p', { class: 'nota' }, 'Guarda il risultato col tasto SFONDO sopra il monitor: la maschera (bianco = resta) o il soggetto sugli scacchi. Bordo: − stringe il soggetto, + lo allarga. Pulisci toglie i puntini; "Via il riflesso" toglie dal bordo il colore del fondale. Se restano aloni alza la Soglia; se il soggetto si mangia, abbassala.')));
    }
    if (modo === 'luma') {
      righe.push(
        this.cursore('Soglia', 0, 100, 1, (c) => Math.round(c.fx.keyLevel * 100), (c, v) => { c.fx.keyLevel = v / 100; }, '', video),
        this.cursore('Morbidezza', 0, 50, 1, (c) => Math.round(c.fx.keySoft * 100), (c, v) => { c.fx.keySoft = v / 100; }, '', video),
        this.spunta('Inverti: toglie il bianco', (c) => c.fx.keyInvert, (c, v) => { c.fx.keyInvert = v; }, video));
    }
    if (modo === 'persona' || modo === 'soggetto' || modo === 'oggetti') {
      const r = c0.ritaglio!;
      const lav = lavoroDi(c0.id);
      const inCorso = !!lav && !lav.finito;
      const st = statoMaschere(c0);
      const punti = r.punti ?? [];
      const det = dettaglioModello(c0);
      const secondi = c0.len / fps(store.doc.rate);
      const breve = secondi <= 10;
      righe.push(
        anteprimaScena(c0),
        h('p', { class: 'nota sf-modello' + (det.ripiego ? ' avviso-rosso' : '') }, h('b', null, 'Modello: ' + det.nome), ' · ' + det.stato));
      righe.push(h('label', { class: 'etichetta' }, '1 · Clicca su cosa tenere'));
      if (modo === 'oggetti') {
        const ogg = oggettiDi(c0);
        righe.push(
          h('p', { class: 'nota sf-spiega' }, 'Clicca sul monitor su quello che vuoi tenere: una persona, un oggetto, qualunque cosa. Clic destro su un punto lo toglie. Per tenere due cose premi “Un altro oggetto”.'),
          ogg.length ? h('div', { class: 'isp-chips' }, ogg.map((o, i) => h('span', { class: 'chip acceso', title: `${o.n} clic su questo oggetto` }, `Oggetto ${i + 1} · ${o.punti} clic`))) : null,
          this.pulsanti([
            ['🖱 Clicca su cosa tenere', () => cliccaCosaTenere(c0.id)],
            ...(ogg.length ? [['＋ Un altro oggetto', () => altroOggetto(c0.id)] as [string, () => void], ['↺ Ricomincia', () => riprovaOggetti(c0.id)] as [string, () => void]] : []),
          ]));
      } else {
        righe.push(
          h('p', { class: 'nota sf-spiega' }, 'Questa clip usa un modo vecchio (senza clic). Ora si fa tutto con SAM 2.1: clicchi su cosa tenere e lui lo ritaglia.'),
          this.pulsanti([['🖱 Clicca su cosa tenere', () => cliccaCosaTenere(c0.id)]]));
      }
      righe.push(
        h('label', { class: 'etichetta' }, '2 · Controlla la scena'),
        this.pulsanti([['👁 Controlla questo fotogramma', () => void controllaScena(c0.id)]]),
        h('p', { class: 'nota' }, 'Elabora solo il fotogramma dove sta il cursore e ne mostra il contorno. Con il cursore qui sopra lo provi in un altro punto della clip.'),
        h('label', { class: 'etichetta' }, breve ? '3 · Togli lo sfondo' : '3 · Prova e genera'),
        this.pulsanti(inCorso
          ? [['⏹ Ferma', () => fermaClip(c0.id)]]
          : [
            ...(!breve ? [['👀 Anteprima (' + SECONDI_ANTEPRIMA + ' s)', () => void elaboraClip(c0.id, true)] as [string, () => void]] : []),
            [breve ? '✔ Togli lo sfondo a tutta la clip' : '✔ Genera tutta la clip', () => void elaboraClip(c0.id)],
          ]),
        this.pulsanti([['✕ Togli lo sfondo AI (torna com’era)', () => togliSfondoAI(ids)]]));
      if (lav) righe.push(h('div', { class: 'sf-lavoro' }, ...lav.barra.elementi));
      righe.push(h('p', { class: 'nota' + (st.ok ? ' ok' : '') }, st.testo));
      // i due cursori che servono per provare il bordo: sempre in vista, il risultato si guarda nell'anteprima qui sopra
      righe.push(
        h('label', { class: 'etichetta' }, 'Rifinisci il bordo'),
        this.cursore('Bordo', -100, 100, 1, (c) => Math.round((c.ritaglio?.bordo ?? 0) * 100), (c, v) => { if (c.ritaglio) c.ritaglio.bordo = v / 100; }, '', video),
        this.cursore('Morbidezza', 0, 100, 1, (c) => Math.round((c.ritaglio?.morbido ?? 0) * 100), (c, v) => { if (c.ritaglio) c.ritaglio.morbido = v / 100; }, '', video));
      // il resto sta nascosto
      righe.push(h('details', { class: 'pp-piu' }, h('summary', null, 'Avanzate'),
        this.scelta('Precisione', QUALITA_RITAGLIO.map((q, i) => [String(i), `${q.nome} (${q.hz} fotogrammi al secondo)`] as [string, string]), (c) => String(c.ritaglio?.qualita ?? 1), (c, v) => { if (c.ritaglio) c.ritaglio.qualita = Number(v); }, video),
        modo === 'oggetti' ? this.pulsanti([
          ['Prova su questo fotogramma', () => void provaOggetto(c0.id)],
          ...(punti.length ? [['Toglie i clic', () => azzeraPunti(c0.id)] as [string, () => void]] : []),
        ]) : null,
        modo === 'oggetti' && punti.length
          ? h('div', { class: 'isp-chips' }, punti.map((q, i) => h('button', { class: 'chip ' + (q.dentro ? 'acceso' : ''), title: 'Clic: toglie questo punto', on: { click: () => togliPunto(c0.id, i) } }, (q.dentro ? '＋ ' : '－ ') + (i + 1))))
          : null,
        modo === 'oggetti' ? this.spunta('Segui nel video (per tutta la clip)', (c) => c.ritaglio?.segui !== false, (c, v) => { if (c.ritaglio) c.ritaglio.segui = v; }, video) : null,
        this.spunta('Inverti: tieni lo sfondo', (c) => !!c.ritaglio?.inverti, (c, v) => { if (c.ritaglio) c.ritaglio.inverti = v || undefined; }, video),
        h('p', { class: 'nota' }, `Il modello ${det.nome} si scarica da Hugging Face la prima volta e poi resta nel computer; le immagini non escono mai. Guarda il risultato col tasto SFONDO sopra il monitor.`)));
    }
    if (modo !== 'nessuno') {
      // guardare il risultato e metterci qualcosa dietro, senza uscire dal pannello
      const vista = h('div', { class: 'isp-chips' }, ['Immagine', 'Maschera', 'Sugli scacchi', 'Contorno'].map((n, i) => h('button', {
        class: 'chip' + (((motore.rec?.vistaChiave ?? 0) === i) ? ' acceso' : ''), title: ['Come si vede nel montaggio', 'Bianco = resta, nero = va via', 'Il soggetto sopra gli scacchi: si vede cosa è trasparente', 'Il contorno di quello che resta, sopra l’immagine'][i],
        on: { click: () => { document.dispatchEvent(new CustomEvent('dpv:vista-sfondo', { detail: i })); vista.querySelectorAll('.chip').forEach((b, k) => b.classList.toggle('acceso', k === i)); } },
      }, n)));
      righe.push(h('label', { class: 'etichetta' }, 'Guarda il risultato'), vista);
      const colorePieno = h('input', { type: 'color', value: '#1b3a8f', title: 'Un colore pieno dietro al soggetto' }) as HTMLInputElement;
      const media = store.doc.media.filter((m) => (m.type === 'image' || (m.type === 'video' && m.id !== c0.media)));
      righe.push(
        h('label', { class: 'etichetta' }, 'Cosa metto al posto dello sfondo?'),
        h('div', { class: 'pp-griglia' },
          ...SFONDI.map((x) => h('button', { class: 'pp-tessera', title: 'Uno sfondo sfumato dietro al soggetto', on: { click: () => mettiDietro(c0.id, { colore: x.a, colore2: x.b, nome: 'Sfondo ' + x.nome }) } }, h('span', { class: 'sf-swatch', style: `background: linear-gradient(135deg, ${x.a}, ${x.b})` }), h('span', null, x.nome)))),
        h('div', { class: 'isp-riga' }, h('label', null, 'Colore pieno'), colorePieno,
          h('button', { class: 'btn-mini', on: { click: () => mettiDietro(c0.id, { colore: colorePieno.value, nome: 'Sfondo colore' }) } }, 'Metti')),
        media.length ? h('div', { class: 'isp-riga' }, h('label', null, 'Un tuo file'),
          (() => {
            const sel = h('select', { class: 'mini-select' }, h('option', { value: '' }, 'scegli…'), media.map((m) => h('option', { value: m.id }, m.name))) as HTMLSelectElement;
            sel.addEventListener('change', () => { if (sel.value) { mettiDietro(c0.id, { media: sel.value }); sel.value = ''; } });
            return sel;
          })()) : null,
        h('p', { class: 'nota' }, 'Ogni scelta mette una clip dietro a questa (su una traccia sotto, per tutta la sua durata): puoi cambiarla o toglierla dalla timeline.'));
    }
    return this.gruppo('sfondo', 'Togli lo sfondo', righe);
  }

  /** "Segui": un oggetto tracciato in una ripresa, e chi lo segue (titoli, immagini, centri degli effetti) */
  private seguiGruppo(cs: Clip[]): HTMLElement | null {
    const p = store.doc;
    const c0 = cs[0];
    const righe: HTMLElement[] = [];
    if (c0.kind === 'media' && isVideoClip(c0, p) && mediaOf(p, c0)?.type === 'video') {
      const tr = c0.traccia;
      righe.push(this.pulsanti([['✨ Segui con l’AI (clicchi l’oggetto)', () => seguiConAI(c0.id)], [tr ? '🎯 Rifai l’inseguimento' : '🎯 Segna un oggetto sul monitor', () => document.dispatchEvent(new CustomEvent('dpv:mira'))]]));
      if (tr) {
        righe.push(h('p', { class: 'nota' }, `Oggetto seguito: ${tr.punti.length} punti, sicurezza ${Math.round(tr.fiducia * 100)}%. Il percorso azzurro si vede sul monitor.`));
        righe.push(this.spunta('Tieni ferma la ripresa sull\'oggetto (stabilizza)', (c) => !!c.stabilizza, (c, v) => { c.stabilizza = v || undefined; }, [c0]));
        // e una volta tracciato? Si mette qualcosa che lo segue: testo, immagine, segnali, effetti (src/ui/seguiMenu.ts)
        righe.push(...cosaCiMetto(c0));
        righe.push(this.pulsanti([['Togli l’inseguimento', () => store.edit('Toglie l’inseguimento', (pp) => { for (const z of pp.clips) { if (z.id === c0.id) { delete z.traccia; delete z.stabilizza; } if (z.segue === c0.id) delete z.segue; if (z.fxb?.segue === c0.id) delete z.fxb.segue; } })]]));
      } else righe.push(h('p', { class: 'nota' }, 'Metti il cursore dove l\'oggetto si vede bene, premi il tasto e trascina il mirino sopra: il programma lo segue per tutta la ripresa.'));
    }
    const seguibili = tracciate(p).filter((x) => x.id !== c0.id);
    const get = (c: Clip) => (c.kind === 'fx' ? c.fxb?.segue : c.segue) ?? '';
    if (seguibili.length) {
      const opz: [string, string][] = [['', 'Nessuno (sta fermo)'], ...seguibili.map((x) => [x.id, x.name] as [string, string])];
      righe.push(this.scelta('Segue', opz, get, (c, v) => agganciaSegue(store.doc, c, v), cs));
      if (get(c0)) righe.push(h('p', { class: 'nota' }, 'Segue l\'oggetto: trascinandolo sul monitor lo sposti rispetto a lui (lo scarto).'));
    }
    // con un oggetto tracciato questa è la sezione che serve: parte aperta
    return righe.length ? this.gruppo('segui', 'Segui un oggetto', righe, !!c0.traccia) : null;
  }

  /** come entra e come esce la clip: la dissolvenza (appare e sparisce piano) e le transizioni con la clip vicina */
  private transizioniClip(v: Clip): HTMLElement {
    const p = store.doc;
    const r = fps(p.rate);
    const sulBordo = (f: number) => { const tg = taglioVicino(p, f, 0, v.track); return tg ? transizioneSul(p, tg) : undefined; };
    const riga = (nome: string, f: number, cosa: string) => {
      const b = sulBordo(f);
      return h('div', { class: 'isp-riga col' }, h('label', null, nome, h('small', null, cosa)),
        b
          ? h('div', { class: 'isp-chips' },
            h('button', { class: 'chip acceso tr', title: 'Scegli il blocco per cambiarlo', on: { click: () => store.select([b.id]) } }, `${nomeBlocco(b.fxb!)} · ${(b.len / r).toFixed(1).replace('.', ',')} s`),
            h('button', { class: 'chip', title: 'Togli', on: { click: () => store.edit('Togli transizione', (pp) => { pp.clips = pp.clips.filter((z) => z.id !== b.id); }) } }, '✕'))
          : h('div', { class: 'isp-chips' }, [['mix', 'Dissolvenza incrociata'], ['dip', 'Passa dal nero'], ['dve:301', 'Effetto 1'], ['dve:401', 'Effetto 2']].map(([id, n]) => h('button', {
            class: 'chip', title: n, on: { click: () => { store.select([]); mettiBlocco('transizione', id, f, v.track); } },
          }, id === 'mix' || id === 'dip' ? n : nomeBlocco(nuovoBlocco('transizione', id))))));
    };
    return this.gruppo('trclip', 'Entrata e uscita', [
      h('label', { class: 'etichetta' }, 'Dissolvenza: la clip appare e sparisce piano'),
      this.cursore('All\'inizio', 0, 5, 0.1, (c) => Math.round((c.fadeIn / r) * 10) / 10, (c, s) => { c.fadeIn = Math.min(Math.round(s * r), Math.max(0, c.len - c.fadeOut)); }, 's', [v]),
      this.cursore('Alla fine', 0, 5, 0.1, (c) => Math.round((c.fadeOut / r) * 10) / 10, (c, s) => { c.fadeOut = Math.min(Math.round(s * r), Math.max(0, c.len - c.fadeIn)); }, 's', [v]),
      h('label', { class: 'etichetta' }, 'Transizione con la clip vicina (serve una clip attaccata)'),
      riga('Con la clip prima', v.start, 'sul taglio all\'inizio'),
      riga('Con la clip dopo', end(v), 'sul taglio alla fine'),
      h('p', { class: 'nota' }, 'Le transizioni sono i blocchetti turchesi in basso sulla clip: più lunghi = più lente, e li sposti su un altro taglio quando vuoi. Nessuna cambia la durata delle clip.'),
    ]);
  }

  /** le proprietà dei blocchetti FX scelti: durata, tipo, forza, colore */
  private blocchi(bs: Clip[]): HTMLElement[] {
    const p = store.doc;
    const r = fps(p.rate);
    const b0 = bs[0];
    const fb = b0.fxb!;
    const tr = fb.tipo === 'transizione';
    const tg = tr ? taglioDelBlocco(p, b0) : null;
    const out: HTMLElement[] = [];
    const sec = (len: number) => (len / r).toFixed(2).replace('.', ',').replace(/,?0+$/, '') + ' s';
    out.push(h('div', { class: 'isp-testa' },
      h('input', { class: 'isp-nome', value: bs.length > 1 ? `${bs.length} blocchi scelti` : nomeBlocco(fb), disabled: true }),
      h('div', { class: 'isp-riassunto' },
        h('span', { class: 'chip-tipo ' + (tr ? 'tr' : 'fx') }, tr ? 'Transizione' : 'Effetto a tempo'),
        h('span', null, 'da ', h('b', { class: 'tc-testo' }, frameToTc(b0.start, p.rate, p.drop))),
        h('span', null, 'dura ', h('b', null, sec(b0.len))),
        tr ? h('span', { class: tg ? '' : 'avviso-rosso' }, tg ? `sul taglio a ${frameToTc(tg.f, p.rate, p.drop)} (${trackOf(p, tg.track).name})` : 'nessun taglio sotto: spostala sopra un taglio') : h('span', null, effettoTempo(fb.id)?.info ?? ''))));
    const ids = bs.map((c) => c.id);
    const tutti = (label: string, fn: (c: Clip) => void) => store.edit(label, (pp) => { for (const id of ids) { const c = clipById(pp, id); if (c) fn(c); } });
    // durata: i chip fanno prima dei numeri (più corto = più rapido)
    const durate = [0.25, 0.5, 1, 2, 3, 5, 10];
    const n = h('input', { type: 'number', class: 'num largo', min: 0.08, step: 0.04, value: (b0.len / r).toFixed(2) }) as HTMLInputElement;
    n.addEventListener('change', () => store.edit('Durata', (pp) => { for (const id of ids) durataDelBlocco(pp, clipById(pp, id)!, Math.max(0.08, Number(n.value) || 1) * r); }));
    out.push(this.gruppo('bdurata', tr ? 'Quanto dura (più lunga = più lenta)' : 'Quanto dura', [
      h('div', { class: 'isp-chips' }, durate.map((d) => h('button', {
        class: 'chip' + (Math.round(d * r) === b0.len ? ' acceso' : ''),
        on: { click: () => store.edit('Durata', (pp) => { for (const id of ids) durataDelBlocco(pp, clipById(pp, id)!, d * r); }) },
      }, String(d).replace('.', ',') + ' s'))),
      h('div', { class: 'isp-riga' }, h('label', null, 'Secondi'), n),
    ], true));
    if (tr) {
      const opz: [string, string][] = [['mix', 'Dissolvenza incrociata'], ['dip', 'Passaggio a colore'], ...EFFETTI.map((m) => ['dve:' + m.p, 'Effetto · ' + m.nome] as [string, string]), ...TENDINE.map((m) => ['wipe:' + m.p, 'Tendina ' + m.nome] as [string, string])];
      const trDi = (c: Clip) => c.fxb!.tr!;
      const tipo = fb.tr?.type;
      const dve = tipo === 'dve', wipe = tipo === 'wipe';
      out.push(this.gruppo('btipo', 'Transizione', [
        this.scelta('Modello', opz, (c) => c.fxb?.id ?? 'mix', (c, v) => { c.fxb = cambiaModello(c.fxb!, v); c.name = nomeBlocco(c.fxb); }, bs),
        this.scelta('Come corre', [['', 'Come vuole l\'effetto'], ['dolce', 'Dolce (parte e arriva piano)'], ['entra', 'Parte piano, poi corre'], ['esce', 'Corre, poi arriva piano']], (c) => trDi(c)?.curva ?? '', (c, v) => { trDi(c).curva = (v || undefined) as 'dolce'; }, bs),
        dve ? this.cursore('Intensità', 20, 200, 5, (c) => Math.round((trDi(c)?.forza ?? c.fxb?.forza ?? 1) * 100), (c, v) => { trDi(c).forza = v / 100; }, '%', bs) : null,
        dve && DIREZIONALI.has(fb.tr!.pattern) ? this.scelta('Direzione', [['0', 'Come sta'], ['1', 'Ruotata di 90°'], ['2', 'Ruotata di 180°'], ['3', 'Ruotata di 270°']], (c) => String(trDi(c)?.dir ?? 0), (c, v) => { trDi(c).dir = Number(v) || undefined; }, bs) : null,
        this.spunta('Al contrario', (c) => !!trDi(c)?.reverse, (c, v) => { trDi(c).reverse = v; }, bs),
        wipe || tipo === 'dip' ? this.colore(tipo === 'dip' ? 'Colore del passaggio' : 'Colore del bordo', (c) => (trDi(c)?.type === 'dip' ? trDi(c).color : trDi(c)?.borderColor ?? '#ffd54a'), (c, v) => { const t = trDi(c); if (t.type === 'dip') t.color = v; else t.borderColor = v; }, bs) : null,
        wipe ? this.cursore('Bordo', 0, 20, 0.5, (c) => (trDi(c)?.border ?? 0) * 100, (c, v) => { trDi(c).border = v / 100; }, '', bs) : null,
        wipe ? this.cursore('Morbidezza', 0, 30, 0.5, (c) => (trDi(c)?.soft ?? 0) * 100, (c, v) => { trDi(c).soft = v / 100; }, '', bs) : null,
      ], true));
    } else {
      const colori = ['flash', 'lampoNero', 'strobo', 'dalNero', 'alNero', 'dalBianco', 'alBianco', 'duotone', 'bokeh', 'scintille'].includes(fb.id);
      const centro = haCentro(fb.id);
      const segue = !!fb.segue;
      out.push(this.gruppo('btipo', 'Effetto', [
        this.scelta('Effetto', EFFETTI_TEMPO.map((e) => [e.id, `${e.nome} · ${e.info}`] as [string, string]), (c) => c.fxb?.id ?? 'flash', (c, v) => { c.fxb = cambiaModello(c.fxb!, v); c.name = effettoTempo(v)!.nome; }, bs),
        this.cursore('Forza', 0, 150, 1, (c) => Math.round((c.fxb?.forza ?? 1) * 100), (c, v) => { c.fxb!.forza = v / 100; }, '%', bs, 'fxb.forza'),
        ...(effettoTempo(fb.id)?.parametri ?? []).map((p) => this.cursore(p.nome, p.min, p.max, p.passo,
          (c) => parametroFx(c.fxb!, p.chiave), (c, v) => { (c.fxb!.parametri ??= {})[p.chiave] = v; }, '', bs, 'fxb.parametri.' + p.chiave)),
        fb.id === 'censura' ? h('p', { class: 'nota avviso-rosso' }, 'Controlla tutta la clip: mosaico e inseguimento non garantiscono anonimizzazione. Nella versione 1.5.7 la censura NON viene applicata.') : null,
        this.cursore('Si ripete', 1, 12, 1, (c) => c.fxb?.ripeti ?? 1, (c, v) => { c.fxb!.ripeti = v > 1 ? v : undefined; }, 'volte', bs),
        colori ? this.colore('Colore', (c) => c.fxb?.colore ?? '#ffffff', (c, v) => { c.fxb!.colore = v; }, bs) : null,
        centro ? h('p', { class: 'nota' }, 'Il centro dell\'effetto è il mirino sul monitor: trascinalo dove vuoi. Con "Movimento" parte da un punto e arriva a un altro, e passa da tutte le tappe che aggiungi (＋ Tappa, o fermati fra due tappe e muovi il mirino).') : null,
        centro ? this.pulsanti([
          [fb.posFine ? 'Movimento spento' : 'Movimento', () => store.edit('Movimento dell\'effetto', () => { for (const c of bs) { if (c.fxb!.posFine) { delete c.fxb!.posFine; delete c.fxb!.via; } else { c.fxb!.pos ??= [0.5, 0.5]; c.fxb!.posFine = [...c.fxb!.pos] as [number, number]; } } })],
          ['Al centro', () => store.edit('Effetto al centro', () => { for (const c of bs) { delete c.fxb!.pos; delete c.fxb!.posFine; delete c.fxb!.via; delete c.fxb!.segue; } })],
        ]) : null,
        centro && tracciate(p).length ? this.scelta('Segue', [['', 'Nessuno (sta dove l\'hai messo)'], ...tracciate(p).map((x) => [x.id, x.name] as [string, string])], (c) => c.fxb?.segue ?? '', (c, v) => agganciaSegue(store.doc, c, v), bs) : null,
        segue ? h('p', { class: 'nota' }, 'Il centro segue l\'oggetto tracciato: il mirino sul monitor sposta lo scarto.') : null,
      ], true));
    }
    // il suono dentro l'FX: acceso/spento, quale, quanto forte
    const suoni: [string, string][] = [['', 'Nessun suono'], ...SUONI.map((x) => [x.id, x.nome] as [string, string])];
    out.push(this.gruppo('bsuono', 'Suono dell\'FX', [
      this.spunta('Suono acceso', (c) => !!c.fxb?.audio && !!c.fxb.suono, (c, v) => { if (c.fxb?.suono) c.fxb.audio = v; }, bs),
      this.scelta('Suono', suoni, (c) => c.fxb?.suono ?? '', (c, v) => { c.fxb!.suono = v || undefined; c.fxb!.audio = !!v; if (v && c.id === b0.id) ascoltaSuono(v, c.fxb!.volume ?? 0); }, bs),
      this.cursore('Volume', -24, 6, 1, (c) => c.fxb?.volume ?? 0, (c, v) => { c.fxb!.volume = v; }, ' dB', bs),
      h('div', { class: 'isp-chips' }, h('button', { class: 'chip', disabled: !fb.suono, on: { click: () => { if (fb.suono) ascoltaSuono(fb.suono, fb.volume ?? 0); } } }, '▶ Ascolta')),
    ]));
    if (bs.length === 1) out.push(this.animazioniGruppo(b0));
    out.push(this.pulsanti([
      ['Centra sul taglio', () => {
        const tg2 = taglioVicino(store.doc, b0.start + b0.len / 2, Math.round(r * 5), b0.track);
        if (!tg2) { avviso('Non c\'è un taglio qui vicino', 'info'); return; }
        tutti('Sul taglio', (c) => { c.start = Math.max(0, Math.round(tg2.f - c.len / 2)); });
      }],
      ['Ripeti dopo', () => { const nb = store.edit('Ripeti blocco', (pp) => posaBlocco(pp, fb, end(b0), b0.len, b0.track)); store.select([nb.id]); }],
      ['Elimina', () => esegui('elimina')],
    ]));
    out.push(h('p', { class: 'nota' }, tr
      ? 'Il blocco lavora sul taglio che ha sotto: si vedono tutte e due le clip, e nessuna cambia durata.'
      : 'L\'effetto vale per la sua traccia e per tutto quello che sta sotto. Allungalo dai bordi, o mettine un altro subito dopo.'));
    return out;
  }

  private titolatrice(tt: Clip[]): HTMLElement {
    const t0 = tt[0].gen!.title!;
    const set = (label: string, fn: (s: TitleSpec) => void) => store.edit(label, () => { for (const c of tt) if (c.gen?.title) fn(c.gen.title); });
    const testo = h('textarea', { class: 'campo-testo', rows: 3 }) as HTMLTextAreaElement;
    testo.value = t0.text;
    let timer = 0;
    testo.addEventListener('input', () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => set('Testo del titolo', (s) => { s.text = testo.value; }), 250);
    });
    const agg = () => { if (document.activeElement !== testo) testo.value = tt[0].gen?.title?.text ?? ''; };
    this.campi.push({ el: testo, aggiorna: agg });
    const sotto = h('textarea', { class: 'campo-testo', rows: 2 }) as HTMLTextAreaElement;
    sotto.value = t0.sotto ?? '';
    let timer2 = 0;
    sotto.addEventListener('input', () => {
      clearTimeout(timer2);
      timer2 = window.setTimeout(() => set('Sottotitolo del titolo', (s) => { s.sotto = sotto.value || undefined; }), 250);
    });
    this.campi.push({ el: sotto, aggiorna: () => { if (document.activeElement !== sotto) sotto.value = tt[0].gen?.title?.sotto ?? ''; } });
    const tsel = (nome: string, opts: [string, string][], get: (s: TitleSpec) => string, put: (s: TitleSpec, v: string) => void) =>
      this.scelta(nome, opts, (c) => get(c.gen!.title!), (c, v) => put(c.gen!.title!, v), tt);
    return this.gruppo('titolo', 'Titolatrice', [
      h('label', { class: 'etichetta' }, 'Testo (a capo per più righe)'), testo,
      tsel('Stile', STILI_TITOLO, (s) => s.style, (s, v) => { s.style = v as TitleSpec['style']; }),
      tsel('Carattere', [['Rajdhani', 'Rajdhani'], ['Orbitron', 'Orbitron'], ['Georgia', 'Georgia (graziato)'], ['Arial Black', 'Arial Black'], ['Courier New', 'Macchina da scrivere'], ['Impact', 'Impact']], (s) => s.font, (s, v) => { s.font = v; }),
      this.cursore('Dimensione', 16, 240, 1, (c) => c.gen!.title!.size, (c, v) => { c.gen!.title!.size = v; }, 'pt', tt),
      this.cursore('Altezza', 5, 95, 1, (c) => Math.round(c.gen!.title!.y * 100), (c, v) => { c.gen!.title!.y = v / 100; }, '%', tt),
      tsel('Allineamento', [['left', 'Sinistra'], ['center', 'Centro'], ['right', 'Destra']], (s) => s.align, (s, v) => { s.align = v as 'left'; }),
      this.colore('Colore', (c) => c.gen!.title!.color, (c, v) => { c.gen!.title!.color = v; }, tt),
      this.colore('Contorno', (c) => c.gen!.title!.outline === 'none' ? '#000000' : c.gen!.title!.outline, (c, v) => { c.gen!.title!.outline = v; }, tt),
      this.spunta('Ombra', (c) => c.gen!.title!.shadow, (c, v) => { c.gen!.title!.shadow = v; }, tt),
      this.spunta('Fascia dietro', (c) => c.gen!.title!.box, (c, v) => { c.gen!.title!.box = v; }, tt),
      this.colore('Colore fascia / secondo colore', (c) => c.gen!.title!.boxColor.slice(0, 7), (c, v) => { c.gen!.title!.boxColor = v + 'cc'; }, tt),
      h('label', { class: 'etichetta' }, 'Sottotitolo (la riga piccola sotto)'), sotto,
      tsel('Entra', ANIMAZIONI, (s) => s.ingresso ?? '', (s, v) => { s.ingresso = v || undefined; }),
      tsel('Esce', ANIMAZIONI, (s) => s.uscita ?? '', (s, v) => { s.uscita = v || undefined; }),
      this.cursore('Spazio fra le lettere', -5, 60, 1, (c) => Math.round((c.gen!.title!.spaziatura ?? 0) * 100), (c, v) => { c.gen!.title!.spaziatura = v / 100; }, '%', tt),
      tsel('Spessore', [['', 'Come lo stile'], ['400', 'Normale'], ['600', 'Medio'], ['700', 'Grassetto'], ['900', 'Nero']], (s) => (s.peso ? String(s.peso) : ''), (s, v) => { s.peso = v ? Number(v) : undefined; }),
    ], true);
  }

  /**
   * Durata e velocità, in parole semplici: quanto resta in timeline (si legge grande), da quando a quando, i tasti per
   * allungarla o accorciarla e la velocità (che cambia anche la durata: più veloce = più corta).
   */
  private durata(cs: Clip[]): HTMLElement {
    const p0 = store.doc;
    const r = fps(p0.rate);
    // una sola clip per gruppo legato: il trim porta con sé anche l'audio o il video della stessa ripresa
    const scelte = () => {
      const visti = new Set<string>();
      return store.doc.clips.filter((c) => cs.some((x) => x.id === c.id)).filter((c) => { if (!c.link) return true; if (visti.has(c.link)) return false; visti.add(c.link); return true; });
    };
    const grande = h('b', { class: 'dur-numero' });
    const dove = h('small', { class: 'dur-dove' });
    const velo = h('span', { class: 'dur-velocita' });
    const n = h('input', { type: 'number', class: 'num largo', min: 0.04, step: 0.04 }) as HTMLInputElement;
    const sec = (len: number) => (len / r).toFixed(2).replace('.', ',') + ' s';
    const agg = () => {
      const c = scelte()[0];
      if (!c) return;
      const p = store.doc;
      grande.textContent = sec(c.len);
      dove.textContent = `da ${frameToTc(c.start, p.rate, p.drop)} a ${frameToTc(c.start + c.len, p.rate, p.drop)}`;
      velo.textContent = c.speed === 1 ? 'Velocità normale (100%)' : `Velocità ${Math.round(c.speed * 100)}%`;
      if (document.activeElement !== n) n.value = (c.len / r).toFixed(2);
    };
    agg();
    const allunga = (label: string, fn: (c: Clip) => number) => {
      store.edit(label, (p) => {
        for (const c of scelte()) {
          const d = fn(c);
          if (d) M.trimClip(p, c.id, 'out', d, { ripple: modi.ripple, linked: true });
        }
      });
      agg();
    };
    n.addEventListener('change', () => allunga('Durata', (c) => Math.max(1, Math.round(Number(n.value) * r)) - c.len));
    const prossima = (c: Clip) => {
      const dopo = store.doc.clips.filter((x) => x.track === c.track && x.start >= c.start + c.len && x.id !== c.id && x.kind !== 'fx').sort((a, b) => a.start - b.start)[0];
      return dopo ? dopo.start - (c.start + c.len) : 0;
    };
    /** quanto manca alla fine del file (la ripresa non si può allungare oltre) */
    const finoAllaFine = (c: Clip) => {
      const m = mediaOf(store.doc, c);
      if (!m || m.type === 'image' || !m.duration) return 0;
      const restano = Math.max(0, m.duration - c.srcIn - (c.len / r) * c.speed);
      return Math.floor((restano / c.speed) * r);
    };
    const el = h('div', { class: 'isp-durata' },
      h('div', { class: 'dur-testa' }, grande, dove),
      h('div', { class: 'isp-riga' }, h('label', null, 'Quanto dura (secondi)'), n),
      this.pulsanti([
        ['−1 s', () => allunga('Accorcia', (c) => -Math.min(c.len - 1, Math.round(r)))],
        ['+1 s', () => allunga('Allunga', () => Math.round(r))],
        ['+5 s', () => allunga('Allunga', () => Math.round(r * 5))],
        ['↦ fino alla clip dopo', () => allunga('Allunga fino alla prossima', prossima)],
        ['↦ fino alla fine del file', () => allunga('Allunga fino alla fine', finoAllaFine)],
      ]),
      h('div', { class: 'isp-riga dur-vel' }, velo, h('button', { class: 'btn-mini', title: 'Più veloce o più lenta, con il tono e il movimento fluido (Alt+E)', on: { click: () => esegui('velocita') } }, '⏩ Cambia velocità…')),
      h('p', { class: 'nota' }, modi.ripple ? 'Con il ripple acceso le clip dopo scorrono: non restano buchi.' : 'Si ferma contro la clip dopo (se serve spazio, usa il ripple). Le immagini si allungano quanto vuoi; i video fino alla fine della ripresa.'));
    this.campi.push({ el, aggiorna: agg });
    return el;
  }

  /**
   * Apre una sezione da fuori (la guida, la ricerca, il Centro AI: "porta dove si fa") e la mette in vista. Ritorna
   * false se per la clip scelta quella sezione non c'è (per esempio "Togli lo sfondo" su una clip audio).
   */
  apriSezione(id: string): boolean {
    this.aperti.add(id);
    this.chiusi.delete(id);
    this.firma = '';
    this.costruisci();
    const el = this.corpo.querySelector(`.isp-gruppo[data-g="${id}"]`) as HTMLDetailsElement | null;
    if (!el) return false;
    el.open = true;
    evidenzia(`.isp-gruppo[data-g="${id}"] > summary`, this.corpo);
    return true;
  }

  // ——— mattoncini ———
  /** i keyframe: i parametri che si muovono nel tempo, e un menu per farne muovere altri (colore, ruote, maschere, effetti…) */
  private animazioniGruppo(c0: Clip): HTMLElement {
    const id = c0.id;
    const viva = () => clipById(store.doc, id) ?? c0;
    const righe: (HTMLElement | null)[] = [];
    const animati = percorsiAnimati(c0);
    righe.push(h('p', { class: 'nota' }, 'Il rombo ◆ accanto a un parametro mette una chiave dove sta il cursore: da lì il valore cambia nel tempo. ◀ ▶ saltano alla chiave prima e dopo; tasto destro sul rombo = come si va alla chiave dopo (dritta, morbida, a gradino). Se il parametro ha già chiavi, muovere il cursore del valore cambia la chiave qui.'));
    for (const path of animati) {
      const meta = parametriAnimabili(c0).find((x) => x.path === path);
      const d = descrittore(path);
      if (!d) continue;
      righe.push(this.cursore(meta?.nome ?? nomeParametro(c0, path), meta?.min ?? -1000, meta?.max ?? 1000, meta?.passo ?? 0.01, (c) => d.get(c), (c, v) => d.set(c, v), meta?.unita ?? '', [c0], path));
    }
    if (!animati.length) righe.push(h('p', { class: 'nota' }, 'Nessun parametro si muove, per ora.'));
    // aggiungere un altro parametro: si mette una chiave col valore di adesso
    const altri = parametriAnimabili(c0).filter((x) => !animati.includes(x.path));
    if (altri.length) {
      const gruppi = [...new Set(altri.map((x) => x.gruppo))];
      const sel = h('select', { class: 'mini-select' }, h('option', { value: '' }, 'Fai muovere un altro parametro…'),
        ...gruppi.map((g) => h('optgroup', { label: g }, ...altri.filter((x) => x.gruppo === g).map((x) => h('option', { value: x.path }, x.nome))))) as HTMLSelectElement;
      sel.addEventListener('change', () => {
        const path = sel.value;
        if (!path) return;
        store.edit('Keyframe', () => {
          const c = viva();
          const lf = frameLocale(c) ?? 0;
          mettiChiave(c, path, lf, valoreVivo(c, path, lf));
        });
        this.aperti.add('anim');
      });
      righe.push(h('div', { class: 'isp-riga' }, sel));
    }
    if (animati.length) {
      righe.push(this.pulsanti([['Ferma tutto (resta il valore di qui)', () => store.edit('Togli le animazioni', () => {
        const c = viva();
        const lf = frameLocale(c) ?? 0;
        for (const p of percorsiAnimati(c)) togliLinea(c, p, lf);
      })]]));
    }
    return this.gruppo('anim', 'Keyframe (animazioni)', righe, false);
  }

  /** il rapporto larghezza/altezza della sorgente di una clip (serve a fare un cerchio che sia un cerchio) */
  private aspettoClip(c: Clip): number {
    const p = store.doc, m = mediaOf(p, c);
    if (m?.width && m.height) return m.rotation % 180 ? m.height / m.width : m.width / m.height;
    return p.w / p.h;
  }

  /** le maschere a forma: rettangolo, ellisse e Bézier (punti cliccati sul monitor), sommate o sottratte, con sfumatura, espansione e inversione */
  private maschereGruppo(c0: Clip): HTMLElement {
    const id = c0.id;
    const mask = (c: Clip, mid: string) => c.maschere?.find((m) => m.id === mid);
    const sul = (cid: string, mid: string, disegna: boolean) => document.dispatchEvent(new CustomEvent('dpv:maschera', { detail: { clip: cid, mask: mid, disegna } }));
    const aggiungi = (forma: 'rettangolo' | 'ellisse' | 'bezier') => {
      const asp = this.aspettoClip(c0);
      const mid = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      store.edit('Maschera: ' + forma, (pp) => {
        const c = clipById(pp, id);
        if (!c) return;
        const tondo = asp >= 1 ? { w: 0.6 / asp, h: 0.6 } : { w: 0.6, h: 0.6 * asp };
        const m = nuovaMaschera(forma, mid, forma === 'rettangolo' ? { w: 0.6, h: 0.6 } : forma === 'ellisse' ? tondo : {});
        (c.maschere ??= []).push(m);
      });
      this.aperti.add('maschere');
      this.firma = '';
      this.costruisci();
      motore.setMonitor('recorder');
      sul(id, mid, forma === 'bezier');
    };
    const righe: (HTMLElement | null)[] = [
      h('p', { class: 'nota' }, 'Mostra solo una parte dell\'immagine, con la forma che scegli. Le maschere si sommano o si tolgono in ordine; ogni numero ha il suo rombo ◆ per muoversi nel tempo. Sul monitor: trascina la forma, i suoi punti o la maniglia che gira.'),
      h('div', { class: 'isp-pulsanti' },
        h('button', { class: 'btn-mini', title: 'Un rettangolo', on: { click: () => aggiungi('rettangolo') } }, '▭ Rettangolo'),
        h('button', { class: 'btn-mini', title: 'Un\'ellisse (un cerchio, se la sorgente è quadrata)', on: { click: () => aggiungi('ellisse') } }, '◯ Ellisse'),
        h('button', { class: 'btn-mini', title: 'Una forma libera: poi clicchi i punti sul monitor', on: { click: () => aggiungi('bezier') } }, '✎ Bézier')),
    ];
    for (const m0 of c0.maschere ?? []) {
      const mid = m0.id;
      const M = (c: Clip) => mask(c, mid)!;
      const pc = (nome: string, campo: 'x' | 'y' | 'w' | 'h' | 'sfuma' | 'espandi' | 'opacita', min: number, max: number) =>
        this.cursore(nome, min, max, 0.5, (c) => Math.round((M(c)?.[campo] ?? 0) * 1000) / 10, (c, v) => { const m = M(c); if (m) m[campo] = v / 100; }, '%', [c0], `mask.${mid}.${campo}`);
      const bez = m0.forma === 'bezier';
      const togli = () => {
        store.edit('Toglie la maschera', (pp) => {
          const c = clipById(pp, id);
          if (!c) return;
          c.maschere = (c.maschere ?? []).filter((m) => m.id !== mid);
          if (!c.maschere.length) delete c.maschere;
          for (const k of Object.keys(c.anim ?? {})) if (k.startsWith(`mask.${mid}.`)) delete c.anim![k];
          if (c.anim && !Object.keys(c.anim).length) delete c.anim;
        });
        sul('', '', false);
      };
      righe.push(h('div', { class: 'mk-testa' }, h('b', null, nomeForma(m0)),
        h('span', { class: 'mk-azioni' },
          h('button', { class: 'btn-mini', title: bez ? 'Disegna o sposta i punti sul monitor' : 'Mostra la forma sul monitor', on: { click: () => { motore.setMonitor('recorder'); sul(id, mid, bez && (m0.punti?.length ?? 0) < 3); } } }, bez ? '✎ Sul monitor' : '⌖ Sul monitor'),
          h('button', { class: 'btn-mini', title: 'Toglie la maschera', on: { click: togli } }, '🗑'))));
      righe.push(this.spunta('Accesa', (c) => !M(c)?.spenta, (c, v) => { const m = M(c); if (m) { if (v) delete m.spenta; else m.spenta = true; } }, [c0]));
      righe.push(this.scelta('Con le altre', [['somma', 'Aggiunge'], ['sottrai', 'Toglie']], (c) => M(c)?.op ?? 'somma', (c, v) => { const m = M(c); if (m) m.op = v as 'somma'; }, [c0]));
      righe.push(this.spunta('Inverti (si vede fuori)', (c) => !!M(c)?.inverti, (c, v) => { const m = M(c); if (m) m.inverti = v; }, [c0]));
      if (bez) {
        righe.push(this.spunta('Curve morbide', (c) => !!M(c)?.morbida, (c, v) => { const m = M(c); if (m) m.morbida = v; }, [c0]));
        righe.push(h('p', { class: 'nota' }, `${m0.punti?.length ?? 0} punti. Con ✎ Sul monitor: clic = nuovo punto, trascina = sposta, tasto destro = toglie, Invio o Esc = finito.`));
      } else {
        righe.push(pc('Centro X', 'x', 0, 100), pc('Centro Y', 'y', 0, 100), pc('Larghezza', 'w', 1, 200), pc('Altezza', 'h', 1, 200));
        righe.push(this.cursore('Rotazione', -180, 180, 0.5, (c) => M(c)?.rot ?? 0, (c, v) => { const m = M(c); if (m) m.rot = v; }, '°', [c0], `mask.${mid}.rot`));
      }
      righe.push(pc('Sfumatura', 'sfuma', 0, 50), pc('Allarga / stringi', 'espandi', -50, 50), pc('Quanto conta', 'opacita', 0, 100));
    }
    return this.gruppo('maschere', 'Maschere (forme)', righe, !!c0.maschere?.length);
  }

  /** una sezione del pannello; `principale` = quella che serve per questo tipo di elemento: parte aperta (se non l'hai chiusa tu) */
  private gruppo(id: string, titolo: string, righe: (HTMLElement | null)[], principale = false): HTMLElement {
    const grip = h('span', { class: 'isp-grip', title: 'Trascina per spostare la sezione (l\'ordine si ricorda)' }, '⠿');
    const aperta = this.aperti.has(id) || (principale && !this.chiusi.has(id));
    const el = h('details', { class: 'isp-gruppo' + (principale ? ' principale' : ''), open: aperta, 'data-g': id }, h('summary', null, titolo, grip), ...righe.filter(Boolean) as HTMLElement[]);
    el.addEventListener('toggle', () => {
      if ((el as HTMLDetailsElement).open) { this.aperti.add(id); this.chiusi.delete(id); } else { this.aperti.delete(id); this.chiusi.add(id); }
    });
    // la maniglia non apre né chiude: serve solo a trascinare
    grip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    grip.addEventListener('pointerdown', (e) => this.trascina(el, e));
    return el;
  }

  // ——— l'ordine delle sezioni: si riordinano trascinando la maniglia e l'ordine si salva per ogni tipo di elemento ———
  private ordiniSalvati(): Record<string, string[]> {
    try { return JSON.parse(localStorage.getItem('dpv-isp-ordine') ?? '{}') ?? {}; } catch { return {}; }
  }
  private scriviOrdini(o: Record<string, string[]>) {
    try { localStorage.setItem('dpv-isp-ordine', JSON.stringify(o)); } catch { /* niente */ }
  }

  /** rimette le sezioni nell'ordine salvato per questo tipo (quelle nuove o mai spostate vanno in fondo); il resto resta dov'è */
  private conOrdine(chiave: string, out: HTMLElement[]): HTMLElement[] {
    this.chiave = chiave;
    const posti = out.map((e, i) => (e.dataset?.g ? i : -1)).filter((i) => i >= 0);
    const gruppi = posti.map((i) => out[i]);
    const ids = gruppi.map((g) => g.dataset.g!);
    const salvato = this.ordiniSalvati()[chiave];
    if (!salvato?.length) return out;
    const ordine = [...salvato.filter((id) => ids.includes(id)), ...ids.filter((id) => !salvato.includes(id))];
    const per = new Map(gruppi.map((g) => [g.dataset.g!, g]));
    posti.forEach((i, k) => { out[i] = per.get(ordine[k])!; });
    out.push(h('button', { class: 'isp-ripristina', title: 'Rimette le sezioni nell\'ordine di partenza, per questo tipo di elemento', on: { click: () => { const o = this.ordiniSalvati(); delete o[chiave]; this.scriviOrdini(o); this.firma = ''; this.costruisci(); } } }, '↺ Ordine di partenza'));
    return out;
  }

  private trascina(el: HTMLElement, e: PointerEvent) {
    if (e.button !== 0 || !el.parentElement) return;
    e.preventDefault();
    const cont = el.parentElement;
    el.classList.add('trascinato');
    const muovi = (ev: PointerEvent) => {
      const altri = [...cont.children].filter((x) => x !== el && (x as HTMLElement).dataset?.g) as HTMLElement[];
      const dopo = altri.find((x) => { const b = x.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (dopo) { if (el.nextElementSibling !== dopo) cont.insertBefore(el, dopo); }
      else { const ultimo = altri[altri.length - 1]; if (ultimo && ultimo.nextElementSibling !== el) cont.insertBefore(el, ultimo.nextSibling); }
    };
    const fine = () => {
      document.removeEventListener('pointermove', muovi);
      document.removeEventListener('pointerup', fine);
      document.removeEventListener('pointercancel', fine);
      el.classList.remove('trascinato');
      this.salvaOrdineDa(cont);
    };
    document.addEventListener('pointermove', muovi);
    document.addEventListener('pointerup', fine);
    document.addEventListener('pointercancel', fine);
  }

  /** salva l'ordine che si vede: le sezioni in quel momento nascoste restano dove stavano */
  private salvaOrdineDa(cont: HTMLElement) {
    if (!this.chiave) return;
    const visibili = [...cont.querySelectorAll(':scope > [data-g]')].map((x) => (x as HTMLElement).dataset.g!);
    const tutti = this.ordiniSalvati();
    const vecchio = tutti[this.chiave] ?? [];
    let k = 0;
    const nuovo = vecchio.map((id) => (visibili.includes(id) ? visibili[k++] : id));
    for (; k < visibili.length; k++) nuovo.push(visibili[k]);
    // chi non c'era ancora (mai spostato) va comunque nell'ordine che si vede
    const completo = [...new Set([...nuovo.filter((id) => visibili.includes(id) || vecchio.includes(id))])];
    for (const id of visibili) if (!completo.includes(id)) completo.push(id);
    tutti[this.chiave] = completo;
    this.scriviOrdini(tutti);
    // il bottone "Ordine di partenza" compare subito
    this.firma = ''; this.costruisci();
  }

  /** anim = il percorso del parametro per i keyframe (src/core/automazioni.ts): accanto al cursore compare il rombo ◆ */
  private cursore(nome: string, min: number, max: number, step: number, get: (c: Clip) => number, put: (c: Clip, v: number) => void, unita: string, quali: Clip[], anim?: string): HTMLElement {
    const ids = quali.map((c) => c.id);
    const trova = () => store.doc.clips.filter((c) => ids.includes(c.id));
    const rombo = anim ? creaRombo(anim, ids) : null;
    const r = h('input', { type: 'range', min, max, step }) as HTMLInputElement;
    const n = h('input', { type: 'number', class: 'num', min, max, step }) as HTMLInputElement;
    const agg = () => {
      const c0 = trova()[0]; if (!c0) return;
      // con la linea dei keyframe si mostra il valore di adesso (sotto il cursore), non quello fermo
      const lf = anim ? frameLocale(c0) : null;
      const c = anim && lf !== null && haLinea(c0, anim) ? valutaClip(c0, lf) : c0;
      const v = get(c); if (document.activeElement !== n) n.value = String(Math.round(v * 100) / 100); r.value = String(v);
      rombo?.aggiorna();
    };
    agg();
    let vivo = false;
    const applica = (v: number) => {
      if (!vivo) { store.begin(nome); vivo = true; }
      for (const c of trova()) {
        const lf = anim ? frameLocale(c) : null;
        if (anim && lf !== null && haLinea(c, anim)) {
          // parametro animato: il valore nuovo diventa la chiave sotto il cursore (passa dalla stessa put, su una copia)
          const sc = copiaLeggera(c); put(sc, v); mettiChiave(c, anim, lf, descrittore(anim)!.get(sc));
        } else put(c, v);
      }
      store.liveChange();
    };
    r.addEventListener('input', () => { applica(Number(r.value)); n.value = r.value; });
    r.addEventListener('change', () => { if (vivo) store.commit(true); vivo = false; });
    n.addEventListener('change', () => { const v = Math.max(min, Math.min(max, Number(n.value) || 0)); applica(v); store.commit(true); vivo = false; r.value = String(v); });
    r.addEventListener('dblclick', () => {
      // doppio clic = valore di partenza
      const def: Record<string, number> = { Opacità: 100, Zoom: 100, Orizzontale: 0, Verticale: 0, Rotazione: 0, Luce: 0, Contrasto: 100, Saturazione: 100, Temperatura: 0, Tinta: 0, Volume: 0, Panorama: 0 };
      if (nome in def) { applica(def[nome]); store.commit(true); vivo = false; agg(); }
    });
    const el = h('div', { class: 'isp-riga' + (rombo ? ' kf-riga' : '') }, h('label', null, nome), r, h('span', { class: 'isp-num' }, n, h('small', null, unita)), rombo?.el ?? null);
    this.campi.push({ el, aggiorna: agg, anim: !!anim });
    return el;
  }

  /** `categorie` (valore → nome della categoria) mette le voci in gruppi dentro la tendina, nell'ordine in cui compaiono */
  private scelta(nome: string, opzioni: [string, string][], get: (c: Clip) => string, put: (c: Clip, v: string) => void, quali: Clip[], categorie?: Record<string, string>): HTMLElement {
    const ids = quali.map((c) => c.id);
    const voce = ([v, t]: [string, string]) => h('option', { value: v }, t);
    const nomi = categorie ? [...new Set(opzioni.map(([v]) => categorie[v] ?? ''))] : [];
    const s = h('select', { class: 'mini-select' }, categorie ? nomi.map((g) => h('optgroup', { label: g }, ...opzioni.filter(([v]) => (categorie[v] ?? '') === g).map(voce))) : opzioni.map(voce)) as HTMLSelectElement;
    const agg = () => { const c = store.doc.clips.find((x) => ids.includes(x.id)); if (c) s.value = get(c); };
    agg();
    s.addEventListener('change', () => store.edit(nome, () => { for (const c of store.doc.clips) if (ids.includes(c.id)) put(c, s.value); }));
    const el = h('div', { class: 'isp-riga' }, h('label', null, nome), s);
    this.campi.push({ el, aggiorna: agg });
    return el;
  }

  private colore(nome: string, get: (c: Clip) => string, put: (c: Clip, v: string) => void, quali: Clip[]): HTMLElement {
    const ids = quali.map((c) => c.id);
    const inp = h('input', { type: 'color' }) as HTMLInputElement;
    const agg = () => { const c = store.doc.clips.find((x) => ids.includes(x.id)); if (c) inp.value = get(c).slice(0, 7); };
    agg();
    let vivo = false;
    inp.addEventListener('input', () => { if (!vivo) { store.begin(nome); vivo = true; } for (const c of store.doc.clips) if (ids.includes(c.id)) put(c, inp.value); store.liveChange(); });
    inp.addEventListener('change', () => { if (vivo) store.commit(true); vivo = false; });
    const el = h('div', { class: 'isp-riga' }, h('label', null, nome), inp);
    this.campi.push({ el, aggiorna: agg });
    return el;
  }

  private spunta(nome: string, get: (c: Clip) => boolean, put: (c: Clip, v: boolean) => void, quali: Clip[]): HTMLElement {
    const ids = quali.map((c) => c.id);
    const inp = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const agg = () => { const c = store.doc.clips.find((x) => ids.includes(x.id)); if (c) inp.checked = get(c); };
    agg();
    inp.addEventListener('change', () => store.edit(nome, () => { for (const c of store.doc.clips) if (ids.includes(c.id)) put(c, inp.checked); }));
    const el = h('label', { class: 'isp-riga spunta' }, inp, h('span', null, nome));
    this.campi.push({ el, aggiorna: agg });
    return el;
  }

  private pulsanti(lista: [string, () => void][]): HTMLElement {
    return h('div', { class: 'isp-pulsanti' }, lista.map(([n, fn]) => h('button', { class: 'btn-mini', on: { click: fn } }, n)));
  }
}

/** sposta tutte le posizioni della clip (partenza, tappe, arrivo) dello stesso tanto */
function spostaChiavi(c: Clip, dx: number, dy: number) {
  const tutte = [c.tf, ...(c.tfFine ? [c.tfFine] : []), ...(c.via ?? []).map((v) => v.tf)];
  for (const t of tutte) { t.x = Math.round(t.x + dx); t.y = Math.round(t.y + dy); }
}

/** una clip dietro a quella data (su una traccia video sotto, per tutta la sua durata): un colore, uno sfumato o un file */
function mettiDietro(srcId: string, cosa: { colore?: string; colore2?: string; media?: string; nome?: string }) {
  store.edit('Sfondo dietro', (pp) => {
    const src = clipById(pp, srcId);
    if (!src) return;
    const video = pp.tracks.filter((t) => t.kind === 'video');
    const a = src.start, b = end(src);
    const libera = (id: string) => !pp.clips.some((c) => c.track === id && c.kind !== 'fx' && c.start < b && end(c) > a);
    let track = video.slice(video.findIndex((t) => t.id === src.track) + 1).find((t) => !t.lock && libera(t.id))?.id;
    if (!track) {
      const nt = newTrack('video', nextTrackName(pp, 'video'));
      pp.tracks.splice(pp.tracks.lastIndexOf(video[video.length - 1]) + 1, 0, nt);
      track = nt.id;
    }
    if (cosa.media) {
      const m = pp.media.find((x) => x.id === cosa.media);
      if (!m) return;
      const durata = m.type === 'image' || !m.duration ? src.len : Math.max(1, Math.floor(m.duration * fps(pp.rate)));
      const c = newClip('media', track, a, Math.min(src.len, durata), { media: m.id, name: m.name });
      // a tutto quadro (se la forma è diversa, taglia i bordi che avanzano)
      if (m.width && m.height) { const k1 = Math.min(pp.w / m.width, pp.h / m.height), k2 = Math.max(pp.w / m.width, pp.h / m.height); c.tf.scale = k2 / k1; }
      pp.clips.push(c);
    } else pp.clips.push(newClip('color', track, a, src.len, { name: cosa.nome ?? 'Sfondo', gen: { color: cosa.colore ?? '#000000', ...(cosa.colore2 ? { color2: cosa.colore2 } : {}) } }));
  });
}

/** la clip (o il centro dell'effetto) comincia o smette di seguire un oggetto tracciato, senza che salti: resta dov'è adesso */
function agganciaSegue(p: Project, c: Clip, id: string) {
  const f = Math.max(c.start, Math.min(end(c) - 1, Math.floor(store.head + 1e-6)));
  const off = (sid?: string): [number, number] => {
    const sorg = sid ? p.clips.find((x) => x.id === sid) : undefined;
    return (sorg && oggettoSulQuadro(p, sorg, f)) || [0, 0];
  };
  if (c.kind === 'fx' && c.fxb) {
    const b = c.fxb;
    const vecchio = off(b.segue), nuovo = off(id || undefined);
    const dx = (vecchio[0] - nuovo[0]) / p.w, dy = (vecchio[1] - nuovo[1]) / p.h;
    b.pos = [(b.pos ?? [0.5, 0.5])[0] + dx, (b.pos ?? [0.5, 0.5])[1] + dy];
    if (b.posFine) b.posFine = [b.posFine[0] + dx, b.posFine[1] + dy];
    for (const v of b.via ?? []) v.pos = [v.pos[0] + dx, v.pos[1] + dy];
    if (id) b.segue = id; else delete b.segue;
    return;
  }
  const vecchio = off(c.segue), nuovo = off(id || undefined);
  spostaChiavi(c, vecchio[0] - nuovo[0], vecchio[1] - nuovo[1]);
  if (id) c.segue = id; else delete c.segue;
}

export { FX0 };
