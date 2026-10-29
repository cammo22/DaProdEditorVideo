// La pagina Finale: la schermata dove si guarda il montaggio intero, si fanno i ritocchi che valgono per
// tutto (colore automatico, look, luce e colore, audio finale) e si esporta. Il monitor è lo stesso del
// montaggio (con il "prima | dopo"), la timeline resta sotto per spostarsi al volo.
import { progettoAttuale } from '../media/attivita';
import { confermaAvvioAI } from './aiPassi';
import { store } from '../core/store';
import type { LookFinale, Master, Project, Sottotitoli } from '../core/tipi';
import { MASTER0, TITLE0, end, isVideoClip, masterDi, newClip, projectEnd, trackOf, uid } from '../core/progetto';
import * as M from '../core/montaggio';
import { nuovoBlocco, posaBlocco } from '../core/blocchi';
import { LINGUE, SOTTO0, bordoRiga, dividiRiga, leggiSrt, righeDaiDialoghi, sottotitoliDi, unisciRighe } from '../core/sottotitoli';
import { MODELLI, fermaVoce, sottotitoliAI, type OpzioniVoce } from '../media/voce';
import { LINGUE_MOTORE, LINGUE_PARLATE, LINGUE_VOCE, VOCI_MAGPIE, motoreNemo } from '../media/nemo';
import { LINGUE_TRADUZIONE, fermaTraduzione, sappiamoTradurre, traduciTesti } from '../media/traduci';
import { doppia, linguaVoce, posaVoce } from '../media/doppiaggio';
import { spiegaErroreAI } from '../media/erroriAI';
import { codificaWav } from '../media/wav';
import { salvaMediaSulDisco } from '../platform';
import { importaDialogo, importaFile } from '../progetti';
import { BarraLavoro } from './lavoro';
import { durataUmana, f2s, fps, frameToTc } from '../core/timecode';
import { LOOKS } from '../render/colore';
import { mediaRT, preparaOra, senzaColoreMisurato, quandoPreparazioni } from '../media/libreria';
import { motore } from '../motore';
import { volumeLivellato } from '../effetti';
import { esportaEdl, esportaFotogramma } from './dialoghi';
import { pannelloEsporta } from './esportazione';
import { avviso, clamp, conferma, h, icona } from './dom';
import { creaPannelloColoreAvanzato } from './coloreAvanzato';

type Campo = { aggiorna: () => void };

/** i buchi neri: dove nessuna traccia video mostra qualcosa, fra l'inizio e la fine del montaggio */
function buchi(p: Project): [number, number][] {
  const fine = projectEnd(p);
  const iv = p.clips
    .filter((c) => isVideoClip(c) && c.kind !== 'title' && !trackOf(p, c.track).mute)
    .map((c) => [c.start, end(c)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let x = 0;
  for (const [a, b] of iv) {
    if (a > x) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (iv.length && x < fine) out.push([x, fine]);
  return out.filter(([a, b]) => b - a >= 1);
}

/** quando qualcosa entra all'inizio, anche i sottotitoli scivolano avanti (restano sulle parole giuste) */
function spostaSottotitoli(p: Project, len: number) {
  for (const r of p.sottotitoli?.righe ?? []) { r.da += len; r.a += len; }
}

type Sezione = 'colore' | 'audio' | 'sottotitoli' | 'logo' | 'apertura' | 'lingue' | 'esporta';

const SEZIONI: { id: Sezione; nome: string; icona: string; info: string }[] = [
  { id: 'colore', nome: 'Colore', icona: 'effetti', info: 'colore automatico, look e ritocchi su tutto' },
  { id: 'audio', nome: 'Audio', icona: 'altoparlante', info: 'volume finale e limitatore' },
  { id: 'sottotitoli', nome: 'Sottotitoli', icona: 'sottotitoli', info: 'righe, tempi dai dialoghi, .srt' },
  { id: 'logo', nome: 'Logo', icona: 'logo', info: 'il logo sempre in vista' },
  { id: 'apertura', nome: 'Apertura', icona: 'apertura', info: 'clip, titoli e nero all\'inizio e alla fine' },
  { id: 'lingue', nome: 'Voce e lingue', icona: 'lingua', info: 'traduci i sottotitoli e falli parlare, anche in un\'altra lingua' },
  { id: 'esporta', nome: 'Esporta', icona: 'esporta', info: 'il master, la EDL, il fotogramma' },
];

export class Finale {
  el: HTMLElement;
  private corpo: HTMLElement;
  private riepilogo: HTMLElement;
  private menu: HTMLElement;
  private campi: Campo[] = [];
  private sezione: Sezione = 'colore';
  private pagine = new Map<Sezione, HTMLElement>();
  private listaSott: HTMLElement | null = null;
  private firmaSott = '';
  // colore avanzato di una clip: la scelta, il posto del pannello e il pannello (c'è solo mentre si guarda la pagina Colore)
  private sceltaClip: HTMLSelectElement | null = null;
  private postoClip: HTMLElement | null = null;
  private pannelloClip: ReturnType<typeof creaPannelloColoreAvanzato> | null = null;
  private clipColore: string | null = null;
  private idPannello: string | null = null;
  private firmaClip = '';
  private visibile = false;
  private selVista = '';

  constructor() {
    this.riepilogo = h('div', { class: 'fin-riepilogo' });
    this.corpo = h('div', { class: 'fin-corpo' });
    // il menu a destra: ogni cosa finale ha la sua pagina, così non si mescola niente
    this.menu = h('nav', { class: 'fin-menu' }, SEZIONI.map((z) => h('button', {
      class: 'fin-voce' + (z.id === this.sezione ? ' attiva' : ''), 'data-s': z.id, title: z.info,
      on: { click: () => this.mostra(z.id) },
    }, icona(z.icona, 19), h('span', null, z.nome))));
    this.el = h('section', { class: 'pannello finale' },
      h('header', { class: 'fin-testa' }, icona('finale', 18), h('b', null, 'FINALE'), h('span', null, 'ritocchi su tutto il montaggio, poi esporta')),
      h('div', { class: 'fin-dentro' }, this.corpo, this.menu));
    this.mostra('colore');
    quandoPreparazioni(() => this.aggiornaRiepilogo());
    store.on('doc', () => { this.aggiornaRiepilogo(); for (const c of this.campi) c.aggiorna(); this.aggiornaSott(); this.sincronizzaClipColore(false); });
    // ogni modifica manda anche 'sel': conta come «scelta nella timeline» solo se la scelta è cambiata davvero
    store.on('sel', () => { const f = [...store.sel].sort().join('|'); const cambiata = f !== this.selVista; this.selVista = f; this.sincronizzaClipColore(cambiata); });
    store.on('head', () => this.segnaRigaCorrente());
  }

  /** la pagina Finale è in vista (o no): il pannello del colore avanzato esiste solo mentre la si guarda */
  mostrata(on: boolean) { this.visibile = on; this.sincronizzaClipColore(true); }

  private m(): Master { return masterDi(store.doc); }

  /** modifica annullabile dei ritocchi finali */
  private cambia(label: string, fn: (m: Master) => void) {
    store.edit(label, (p) => { p.master = { ...MASTER0, ...(p.master ?? {}) }; fn(p.master); });
  }

  /** modifica annullabile dei sottotitoli */
  private cambiaSott(label: string, fn: (s: Sottotitoli, p: Project) => void) {
    store.edit(label, (p) => { p.sottotitoli = { ...structuredClone(SOTTO0), ...(p.sottotitoli ?? {}) }; fn(p.sottotitoli, p); });
  }

  /** apre una pagina del menu a destra */
  mostra(z: Sezione) {
    this.sezione = z;
    this.menu.querySelectorAll('.fin-voce').forEach((b) => b.classList.toggle('attiva', (b as HTMLElement).dataset.s === z));
    let pg = this.pagine.get(z);
    if (!pg) { pg = this.costruisci(z); this.pagine.set(z, pg); }
    const sez = (titolo: string, ic: string, ...figli: (HTMLElement | null)[]) => h('div', { class: 'fin-sezione' }, h('h4', null, icona(ic, 14), titolo), ...figli.filter(Boolean) as HTMLElement[]);
    this.corpo.replaceChildren(sez('Riepilogo', 'info', this.riepilogo), pg);
    this.corpo.scrollTop = 0;
    this.aggiornaRiepilogo();
    for (const c of this.campi) c.aggiorna();
    if (z === 'sottotitoli') { this.firmaSott = ''; this.aggiornaSott(); }
    this.sincronizzaClipColore(true);
  }

  /** la sezione «Colore avanzato»: si sceglie la clip, sotto c'è il pannello (LUT, ruote, curve) e il monitor mostra il risultato */
  private coloreAvanzatoClip(): HTMLElement {
    const scelta = h('select', { 'aria-label': 'Clip da ritoccare' });
    scelta.onchange = () => { this.clipColore = scelta.value || null; this.sincronizzaClipColore(false); const c = this.clipColore ? store.doc.clips.find((x) => x.id === this.clipColore) : null; if (c) motore.vaiA(c.start); };
    this.sceltaClip = scelta; this.postoClip = h('div', { class: 'ca-fin-host' }); this.firmaClip = '';
    return h('div', { class: 'ca-fin' },
      h('label', { class: 'ca-fin-scelta' }, h('span', null, 'Clip'), scelta),
      h('p', { class: 'nota' }, 'LUT .cube con intensità, ruote lift/gamma/gain e curve, solo sulla clip scelta. Il monitor mostra il risultato; Ctrl+Z torna indietro. Sceglierla nella timeline cambia anche qui.'),
      this.postoClip);
  }

  /** le riprese su cui si può lavorare di colore (video e immagini), nell'ordine della timeline */
  private clipPerColore() {
    const p = store.doc;
    return p.clips.filter((c) => c.kind === 'media' && p.tracks.find((t) => t.id === c.track)?.kind === 'video').sort((a, b) => a.start - b.start);
  }

  /** tiene d'accordo la tendina, la clip scelta e il pannello del colore avanzato; col pannello solo se la pagina Colore è aperta */
  private sincronizzaClipColore(dallaScelta: boolean) {
    const scelta = this.sceltaClip, posto = this.postoClip;
    if (!scelta || !posto) return;
    if (this.sezione !== 'colore' || !this.visibile) { this.pannelloClip?.distruggi(); this.pannelloClip = null; this.idPannello = null; return; }
    const lista = this.clipPerColore(), p = store.doc;
    const firma = lista.map((c) => c.id + c.name + c.start).join('|');
    if (firma !== this.firmaClip) {
      this.firmaClip = firma;
      scelta.replaceChildren(...lista.map((c) => h('option', { value: c.id }, `${c.name} · ${frameToTc(c.start, p.rate, p.drop)}`)));
    }
    // la clip scelta nella timeline passa avanti; se no resta quella di prima, se c'è ancora; se no la prima
    const dallaTimeline = dallaScelta ? lista.find((c) => store.sel.has(c.id)) : undefined;
    const id = dallaTimeline?.id ?? (lista.some((c) => c.id === this.clipColore) ? this.clipColore : lista[0]?.id ?? null);
    scelta.value = id ?? ''; scelta.disabled = !id;
    this.clipColore = id;
    if (this.pannelloClip && this.idPannello === id) return;
    this.idPannello = id;
    this.pannelloClip?.distruggi(); this.pannelloClip = null;
    if (!id) { posto.replaceChildren(h('p', { class: 'nota' }, 'Nel montaggio non ci sono riprese o immagini: mettine una in timeline e poi scegli qui quale ritoccare.')); return; }
    this.pannelloClip = creaPannelloColoreAvanzato(id);
    posto.replaceChildren(this.pannelloClip.el);
  }


  private costruisci(z: Sezione): HTMLElement {
    const sez = (titolo: string, ic: string, ...figli: (HTMLElement | null)[]) => h('div', { class: 'fin-sezione' }, h('h4', null, icona(ic, 14), titolo), ...figli.filter(Boolean) as HTMLElement[]);
    const pagina = (...figli: HTMLElement[]) => h('div', { class: 'fin-pagina', 'data-s': z }, ...figli);
    if (z === 'colore') {
      // colore automatico: un interruttore grande e la forza
      const auto = h('button', { class: 'fin-interruttore', on: { click: () => this.cambia(this.m().auto ? 'Colore automatico spento' : 'Colore automatico acceso', (m) => { m.auto = !m.auto; }) } },
        h('span', { class: 'led' }), h('span', { class: 'fin-int-testo' }, 'Colore automatico su tutte le riprese'));
      this.campi.push({ aggiorna: () => { auto.classList.toggle('acceso', this.m().auto); auto.querySelector('.led')!.classList.toggle('acceso', this.m().auto); } });
      const looks = h('div', { class: 'fin-looks' }, LOOKS.map((l) => {
        const b = h('button', { class: 'fin-look', title: l.info, on: { click: () => this.cambia(`Look ${l.nome}`, (m) => { m.look = l.id as LookFinale; if (!m.intensita) m.intensita = 1; }) } },
          h('span', { class: 'fin-look-col', style: `background: linear-gradient(90deg, ${l.colori[0]} 0 33%, ${l.colori[1]} 0 66%, ${l.colori[2]} 0)` }),
          h('b', null, l.nome), h('small', null, l.info));
        this.campi.push({ aggiorna: () => b.classList.toggle('acceso', this.m().look === l.id) });
        return b;
      }));
      return pagina(
        sez('Colore automatico', 'effetti', auto,
          this.cursore('Forza', 0, 100, (m) => Math.round(m.autoK * 100), (m, v) => { m.autoK = v / 100; }, '%'),
          h('button', { class: 'btn', on: { click: async () => { await preparaOra(senzaColoreMisurato(store.doc), 'colore'); this.aggiornaRiepilogo(); } } }, 'Misura ora le riprese'), h('p', { class: 'nota' }, 'Accendere il colore non avvia analisi. Senza misure la ripresa resta neutra. Misura ora è una richiesta esplicita: avanzamento e annullamento in Attività.')),
        sez('Look di tutto il montaggio', 'immagine', looks,
          this.cursore('Intensità', 0, 100, (m) => Math.round(m.intensita * 100), (m, v) => { m.intensita = v / 100; }, '%')),
        sez('Ritocchi', 'ingranaggio',
          this.cursore('Luce', -100, 100, (m) => Math.round(m.bright * 100), (m, v) => { m.bright = v / 100; }, ''),
          this.cursore('Contrasto', 50, 150, (m) => Math.round(m.contrast * 100), (m, v) => { m.contrast = v / 100; }, '%'),
          this.cursore('Saturazione', 0, 200, (m) => Math.round(m.sat * 100), (m, v) => { m.sat = v / 100; }, '%'),
          this.cursore('Temperatura', -100, 100, (m) => Math.round(m.temp * 100), (m, v) => { m.temp = v / 100; }, ''),
          this.cursore('Tinta', -100, 100, (m) => Math.round(m.tint * 100), (m, v) => { m.tint = v / 100; }, ''),
          this.cursore('Vignetta', 0, 100, (m) => Math.round(m.vignette * 100), (m, v) => { m.vignette = v / 100; }, ''),
          this.cursore('Grana', 0, 100, (m) => Math.round(m.grain * 100), (m, v) => { m.grain = v / 100; }, ''),
          h('div', { class: 'isp-pulsanti' },
            h('button', { class: 'btn-mini', on: { click: () => this.cambia('Azzera ritocchi', (m) => { Object.assign(m, { look: 'nessuno', intensita: 1, bright: 0, contrast: 1, sat: 1, temp: 0, tint: 0, vignette: 0, grain: 0 }); }) } }, 'Azzera look e ritocchi'),
            h('button', { class: 'btn-mini prima-dopo-fin', on: { click: () => (document.querySelector('.monitor .prima-dopo') as HTMLElement | null)?.click() } }, 'Prima | dopo'))),
        sez('Colore avanzato di una clip', 'immagine', this.coloreAvanzatoClip()));
    }
    if (z === 'audio') {
      return pagina(sez('Audio finale', 'altoparlante',
        this.cursore('Volume finale', -24, 12, (m) => m.volume, (m, v) => { m.volume = v; }, 'dB', 0.5),
        this.spunta('Limitatore (niente distorsione)', (m) => m.limiter, (m, v) => { m.limiter = v; }),
        h('div', { class: 'isp-pulsanti' },
          h('button', { class: 'btn-mini', title: 'Porta ogni clip audio a un livello simile (si annulla con Ctrl+Z)', on: { click: () => this.livellaTutto() } }, 'Livella il volume di tutte le clip')),
        h('p', { class: 'nota' }, 'Il fade in e il fade out delle singole clip: trascinali dal contenitore (Effetti → Audio) o tira i quadratini in alto sulle clip.')));
    }
    if (z === 'sottotitoli') return pagina(...this.paginaSottotitoli(sez));
    if (z === 'logo') return pagina(this.paginaLogo(sez));
    if (z === 'apertura') return pagina(...this.paginaApertura(sez));
    if (z === 'lingue') return pagina(...this.paginaLingue(sez));
    // l'esportazione ha il suo pannello (preset, cosa esce, coda): lo stesso della finestra Ctrl+M
    const esporta = h('div', { class: 'fin-esporta' },
      pannelloEsporta().el,
      h('div', { class: 'fin-altri' },
        h('button', { class: 'btn piccolo', title: 'La lista di montaggio per Resolve, Avid, Premiere, EDIUS', on: { click: () => esportaEdl() } }, 'EDL CMX3600'),
        h('button', { class: 'btn piccolo', title: 'Il fotogramma sotto il cursore, con il colore finale', on: { click: () => esportaFotogramma() } }, 'Fotogramma PNG'),
        h('button', { class: 'btn piccolo', title: 'I sottotitoli in un file a parte', on: { click: () => void this.esportaSrt() } }, 'Sottotitoli .srt'),
        h('button', { class: 'btn piccolo', title: 'I sottotitoli in un file a parte, per il web (WebVTT)', on: { click: () => void this.esportaSrt('vtt') } }, 'Sottotitoli .vtt')),
      h('p', { class: 'nota' }, 'Nel master escono anche il logo e i sottotitoli (se sono "scritti nel video"), gli FX sulle clip (coi loro suoni) e il colore finale.'));
    return pagina(esporta);
  }

  // ——— sottotitoli ———
  private paginaSottotitoli(sez: (t: string, ic: string, ...f: (HTMLElement | null)[]) => HTMLElement): HTMLElement[] {
    const s = () => sottotitoliDi(store.doc);
    const nelVideo = h('button', { class: 'fin-interruttore', on: { click: () => this.cambiaSott(s().nelVideo ? 'Sottotitoli fuori dal video' : 'Sottotitoli nel video', (x) => { x.nelVideo = !x.nelVideo; }) } },
      h('span', { class: 'led' }), h('span', { class: 'fin-int-testo' }, 'Scritti nel video (monitor ed export)'));
    this.campi.push({ aggiorna: () => { nelVideo.classList.toggle('acceso', s().nelVideo); nelVideo.querySelector('.led')!.classList.toggle('acceso', s().nelVideo); } });
    const stile = (nome: string, opz: [string, string][], get: () => string, put: (x: Sottotitoli, v: string) => void) => {
      const bott = opz.map(([v, t]) => h('button', { class: 'chip', 'data-v': v, on: { click: () => this.cambiaSott(nome, (x) => put(x, v)) } }, t));
      this.campi.push({ aggiorna: () => bott.forEach((b) => b.classList.toggle('acceso', b.dataset.v === get())) });
      return h('div', { class: 'fin-scelte' }, h('span', null, nome), h('div', { class: 'isp-chips' }, bott));
    };
    const file = h('input', { type: 'file', accept: '.srt,.vtt,text/plain', style: 'display:none' }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      const righe = leggiSrt(await f.text(), store.doc);
      file.value = '';
      if (!righe.length) { avviso('In questo file non ho trovato sottotitoli', 'errore'); return; }
      this.cambiaSott('Importa sottotitoli', (x) => { x.righe = righe; });
      avviso(`💬 ${righe.length} righe importate (Ctrl+Z per tornare indietro)`, 'ok', 2400);
    });
    this.listaSott = h('div', { class: 'sott-lista' });
    return [
      sez('Scritti dall\'AI', 'lingua', ...this.pannelloAI()),
      sez('Sottotitoli', 'sottotitoli', nelVideo,
        h('div', { class: 'isp-pulsanti' },
          h('button', { class: 'btn-mini oro', title: 'Il programma ascolta dove si parla e prepara le righe vuote al punto giusto: resta solo da scrivere', on: { click: () => this.dialoghi() } }, '🎙 Prepara i tempi dai dialoghi'),
          h('button', { class: 'btn-mini', title: 'Una riga di 2,5 secondi dove sta il cursore', on: { click: () => this.rigaAlCursore() } }, '+ Riga al cursore'),
          h('button', { class: 'btn-mini', on: { click: () => file.click() } }, 'Importa .srt / .vtt'),
          h('button', { class: 'btn-mini', on: { click: () => void this.esportaSrt() } }, 'Esporta .srt'),
          h('button', { class: 'btn-mini', title: 'WebVTT: il formato dei sottotitoli sul web', on: { click: () => void this.esportaSrt('vtt') } }, 'Esporta .vtt'),
          h('button', { class: 'btn-mini', on: { click: () => { if (s().righe.length) this.cambiaSott('Togli i sottotitoli', (x) => { x.righe = []; }); } } }, 'Togli tutti')),
        file,
        stile('Grandezza', [['36', 'Piccoli'], ['46', 'Medi'], ['60', 'Grandi']], () => String(s().dimensione), (x, v) => { x.dimensione = Number(v); }),
        stile('Dove', [['basso', 'In basso'], ['alto', 'In alto']], () => (s().alto ? 'alto' : 'basso'), (x, v) => { x.alto = v === 'alto'; }),
        stile('Fascia', [['si', 'Con la fascia'], ['no', 'Solo il testo']], () => (s().fascia ? 'si' : 'no'), (x, v) => { x.fascia = v === 'si'; })),
      sez('Le righe', 'titolo', this.listaSott,
        h('p', { class: 'nota' }, 'Clic sul tempo per andarci. Le righe vuote non si vedono. La riga sotto il cursore è evidenziata.')),
    ];
  }

  /** ricostruisce la lista delle righe solo se sono cambiate (mentre scrivi il campo resta dov'è) */
  private aggiornaSott() {
    if (!this.listaSott || this.sezione !== 'sottotitoli') return;
    const p = store.doc;
    const righe = sottotitoliDi(p).righe;
    const firma = righe.map((r) => r.id + ':' + r.da + ':' + r.a).join(',');
    if (firma === this.firmaSott) {
      // solo i testi: si aggiornano i campi che non hai sotto le dita
      for (const r of righe) { const t = this.listaSott.querySelector(`[data-id="${r.id}"] textarea`) as HTMLTextAreaElement | null; if (t && document.activeElement !== t && t.value !== r.testo) t.value = r.testo; }
      return;
    }
    this.firmaSott = firma;
    if (!righe.length) {
      this.listaSott.replaceChildren(h('p', { class: 'nota' }, 'Nessuna riga. Premi "Prepara i tempi dai dialoghi": le righe vuote compaiono dove si parla. Oppure "+ Riga al cursore", o importa un .srt.'));
      return;
    }
    const r = fps(p.rate);
    this.listaSott.replaceChildren(...righe.map((x) => {
      const t = h('textarea', { class: 'sott-testo', rows: 1, placeholder: 'scrivi qui…' }) as HTMLTextAreaElement;
      t.value = x.testo;
      let timer = 0;
      t.addEventListener('input', () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => this.cambiaSott('Sottotitolo', (s) => { const z = s.righe.find((y) => y.id === x.id); if (z) z.testo = t.value; }), 280);
      });
      t.addEventListener('focus', () => { motore.setMonitor('recorder'); motore.vaiA(x.da + 1); });
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ((t.closest('.sott-riga')?.nextElementSibling as HTMLElement | null)?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus(); } });
      // i tempi a portata di dito: la trascrizione a volte sbaglia di poco, qui si aggiusta al volo
      const tasto = (testo: string, title: string, fn: () => void) => h('button', { class: 'sott-t', title, on: { click: fn } }, testo);
      const ultima = righe[righe.length - 1]?.id === x.id;
      return h('div', { class: 'sott-riga', 'data-id': x.id },
        h('button', { class: 'sott-tc', title: 'Vai qui', on: { click: () => { motore.setMonitor('recorder'); motore.vaiA(x.da); } } }, frameToTc(x.da, p.rate, p.drop), h('small', null, ((x.a - x.da) / r).toFixed(1).replace('.', ',') + ' s')),
        t,
        h('div', { class: 'sott-tasti' },
          tasto('⇤', 'Inizia al cursore', () => this.cambiaSott('Inizio del sottotitolo', (s) => bordoRiga(s, x.id, 'da', store.head))),
          tasto('⇥', 'Finisci al cursore', () => this.cambiaSott('Fine del sottotitolo', (s) => bordoRiga(s, x.id, 'a', store.head))),
          tasto('−', 'Un po\' prima (0,1 s)', () => this.cambiaSott('Sottotitolo prima', (s) => { const z = s.righe.find((y) => y.id === x.id)!; const d = Math.max(1, Math.round(r / 10)); bordoRiga(s, x.id, 'da', z.da - d); bordoRiga(s, x.id, 'a', z.a - d); })),
          tasto('+', 'Un po\' dopo (0,1 s)', () => this.cambiaSott('Sottotitolo dopo', (s) => { const z = s.righe.find((y) => y.id === x.id)!; const d = Math.max(1, Math.round(r / 10)); bordoRiga(s, x.id, 'a', z.a + d); bordoRiga(s, x.id, 'da', z.da + d); })),
          ultima ? null : tasto('⤓', 'Unisci con la riga dopo: appaiono insieme', () => this.cambiaSott('Unisci sottotitoli', (s) => { unisciRighe(s, [x.id]); })),
          tasto('✂', 'Dividi al cursore', () => { if (!(store.head > x.da + 1 && store.head < x.a - 1)) { avviso('Porta il cursore dentro la riga (clic sul tempo per andarci)', 'info'); return; } this.cambiaSott('Dividi sottotitolo', (s) => { dividiRiga(s, x.id, Math.round(store.head)); }); }),
          h('button', { class: 'sott-via', title: 'Togli la riga', on: { click: () => this.cambiaSott('Togli riga', (s) => { s.righe = s.righe.filter((y) => y.id !== x.id); }) } }, '✕')));
    }));
    this.segnaRigaCorrente();
  }

  private segnaRigaCorrente() {
    if (!this.listaSott || this.sezione !== 'sottotitoli') return;
    const f = store.head;
    const qui = sottotitoliDi(store.doc).righe.find((x) => x.da <= f && f < x.a);
    this.listaSott.querySelectorAll('.sott-riga').forEach((el) => el.classList.toggle('qui', (el as HTMLElement).dataset.id === qui?.id));
  }

  // ——— i sottotitoli scritti dall'AI (Whisper, sul computer) ———
  private ai: OpzioniVoce = (() => {
    const base: OpzioniVoce = { lingua: 'it', traduci: false, modello: MODELLI[1].id, motore: undefined };
    try { return { ...base, ...(JSON.parse(localStorage.getItem('dpv-ai') ?? '{}') as Partial<OpzioniVoce>) }; } catch { return base; }
  })();
  private lavoroAI: AbortController | null = null;
  private aggiornaAI: (() => void)[] = [];

  private pannelloAI(): HTMLElement[] {
    const salva = () => { try { localStorage.setItem('dpv-ai', JSON.stringify(this.ai)); } catch { /* niente */ } this.aggiornaAI.forEach((f) => f()); };
    const scelta = (nome: string, opz: [string, string, string?][], get: () => string, put: (v: string) => void) => {
      const bott = opz.map(([v, t, info]) => h('button', { class: 'chip', 'data-v': v, title: info ?? '', on: { click: () => { put(v); salva(); } } }, t));
      this.aggiornaAI.push(() => bott.forEach((b) => b.classList.toggle('acceso', b.dataset.v === get())));
      return h('div', { class: 'fin-scelte' }, h('span', null, nome), h('div', { class: 'isp-chips' }, bott));
    };
    const lavoro = new BarraLavoro('Sottotitoli con l\'AI', 'ai', () => { this.lavoroAI?.abort(); fermaVoce(); });
    const vai = h('button', { class: 'btn primario ai-vai', 'data-ai': 'sottotitoli', on: { click: () => void this.scriviConAI(lavoro, vai, ferma) } }, '✨ Scrivi i sottotitoli con l\'AI');
    const ferma = h('button', { class: 'btn-mini', style: 'display:none', on: { click: () => { this.lavoroAI?.abort(); fermaVoce(); } } }, '■ Ferma');
    const nemotron = () => this.motoreAI() === 'nemotron';
    const motore = scelta('Ascolta con', [
      ['nemotron', 'Nemotron 3.5 · NVIDIA', 'Il riconoscimento del parlato di NVIDIA (streaming, tante lingue): va sulla scheda NVIDIA, sul Mac e anche solo sul processore. Solo nell\'app.'],
      ['whisper', 'Whisper', 'Il riconoscimento di OpenAI: va anche nel browser; dall\'italiano sa tradurre in inglese.'],
    ], () => this.motoreAI(), (v) => { this.ai.motore = v as 'nemotron' | 'whisper'; });
    const infoMotore = h('div', { class: 'ai-motore' });
    const aggiornaInfo = async () => {
      if (!nemotron()) { infoMotore.textContent = ''; return; }
      const m = motoreNemo();
      if (!m) { infoMotore.textContent = ''; return; }
      const st = await m.stato().catch(() => null);
      if (!st) { infoMotore.textContent = ''; return; }
      const dove = st.backend === 'cuda' ? 'scheda NVIDIA (CUDA)' : st.backend === 'metal' ? 'Apple Silicon (Metal)' : st.backend === 'vulkan' ? 'scheda video (Vulkan)' : 'processore';
      infoMotore.replaceChildren(st.installato
        ? h('span', null, 'Motore NVIDIA pronto · gira su ', h('b', null, dove), st.modelli > 0 ? ` · modelli sul disco: ${(st.modelli / 1048576).toFixed(0)} MB` : ' · il modello si scarica la prima volta')
        : h('span', null, 'Motore NVIDIA: si scarica la prima volta (', h('b', null, st.consigliato === 'cuda' ? 'versione per la tua scheda NVIDIA' : st.consigliato === 'metal' ? 'versione per il Mac' : 'versione per il processore'), ') e poi resta sul computer'));
    };
    this.aggiornaAI.push(() => void aggiornaInfo());
    const traduci = scelta('Scrivi in', [['no', 'La stessa lingua'], ['si', 'Inglese (traduci)', 'Dall\'italiano: i sottotitoli escono già in inglese']], () => (this.ai.traduci && this.ai.lingua === 'it' ? 'si' : 'no'), (v) => { this.ai.traduci = v === 'si'; });
    const modello = scelta('Modello', MODELLI.map((m) => [m.id, `${m.nome} · ${m.mb} MB`, m.info] as [string, string, string]), () => this.ai.modello, (v) => { this.ai.modello = v; });
    this.aggiornaAI.push(() => {
      traduci.style.display = !nemotron() && this.ai.lingua === 'it' ? '' : 'none';
      modello.style.display = nemotron() ? 'none' : '';
    });
    const nota = h('p', { class: 'nota' });
    this.aggiornaAI.push(() => {
      nota.textContent = nemotron()
        ? 'Ascolta la presa diretta del montaggio (non la musica) e scrive le righe coi loro tempi. Il motore e il modello di NVIDIA (Nemotron 3.5) si scaricano una volta sola e poi restano sul computer; l\'audio non esce mai dal computer. Le righe si correggono qui sotto; Ctrl+Z torna a prima.'
        : 'Ascolta la presa diretta del montaggio (non la musica) e scrive le righe coi loro tempi. Il modello è Whisper (Hugging Face): si scarica una volta sola, poi resta sul computer. L\'audio non esce mai dal computer. Le righe si correggono qui sotto; Ctrl+Z torna a prima.';
    });
    // le scelte che quasi nessuno cambia stanno in un riquadro chiuso: motore, modello, inglese diretto
    const avanzate = h('details', { class: 'fin-avanzate' }, h('summary', null, 'Opzioni: chi ascolta e il modello'), motore, infoMotore, traduci, modello);
    const out = [
      scelta('Si parla in', LINGUE_MOTORE.map(([v, , t]) => [v, t] as [string, string]), () => this.ai.lingua, (v) => { this.ai.lingua = v; }),
      h('div', { class: 'isp-pulsanti' }, vai, ferma),
      ...lavoro.elementi,
      avanzate,
      nota,
    ];
    salva();
    return out;
  }

  /** chi ascolta davvero: Nemotron solo se c'è il motore (nell'app), se no Whisper */
  private motoreAI(): 'nemotron' | 'whisper' {
    const scelto = this.ai.motore ?? (motoreNemo() ? 'nemotron' : 'whisper');
    return scelto === 'nemotron' && motoreNemo() ? 'nemotron' : 'whisper';
  }

  private async scriviConAI(lavoro: BarraLavoro, vai: HTMLButtonElement, ferma: HTMLElement) {
    if (this.lavoroAI) return;
    const p = store.doc;
    if (!p.clips.some((c) => c.kind === 'media' && store.doc.tracks.find((t) => t.id === c.track)?.kind === 'audio')) { avviso('Nel montaggio non c\'è audio da ascoltare', 'info', 2400); return; }
    const scritte = sottotitoliDi(p).righe.filter((x) => x.testo.trim()).length;
    if (scritte && !(await conferma('Sottotitoli con l\'AI', `Ci sono già ${scritte} righe scritte: l'AI le rifà tutte da capo (con Ctrl+Z tornano).`, 'Rifalle', 'Lascia stare'))) return;
    const modello = MODELLI.find((m) => m.id === this.ai.modello);
    if (!(await confermaAvvioAI({ compito: 'Scrivi sottotitoli', ambito: 'Audio di tutto il montaggio · sostituisce le righe esistenti', modello: this.motoreAI() === 'nemotron' ? 'Nemotron (motore nativo)' : modello?.nome ?? this.ai.modello, repo: modello?.id, mb: modello?.mb, ...(modello && this.motoreAI() !== 'nemotron' ? { ids: ['whisper-' + modello.id.split('-').pop()] } : {}) }))) return;
    if (this.lavoroAI) return;
    const progetto = progettoAttuale();
    const ctrl = new AbortController();
    this.lavoroAI = ctrl;
    vai.disabled = true;
    ferma.style.display = '';
    lavoro.avvia('Comincio…');
    const stato = (t: string, x: number) => lavoro.imposta(t, x);
    const o: OpzioniVoce = { ...this.ai, motore: this.motoreAI() };
    try {
      const righe = await sottotitoliAI(structuredClone(store.doc), o, stato, ctrl.signal);
      if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
      if (!righe.length) { avviso('Non ho sentito parole nel montaggio', 'info', 2600); lavoro.ferma('Nessuna parola trovata'); return; }
      const traduzione = o.motore === 'whisper' && o.traduci && o.lingua === 'it';
      this.cambiaSott('Sottotitoli con l\'AI', (x) => { x.righe = righe; x.lingua = traduzione ? 'en' : (o.lingua === 'auto' ? x.lingua : o.lingua); });
      lavoro.fine(`Fatto: ${righe.length} righe`);
      avviso(`✨ ${righe.length} righe scritte dall'AI: rileggile qui sotto`, 'ok', 3200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'fermato') lavoro.ferma('Fermato');
      else if (msg === 'muto') { lavoro.ferma('L\'audio dei dialoghi è muto'); avviso('L\'audio dei dialoghi è muto: niente da scrivere', 'info', 2600); }
      else {
        const chiaro = spiegaErroreAI(msg);
        lavoro.ferma('Non ci sono riuscito: ' + chiaro);
        avviso('I sottotitoli con l\'AI non sono partiti: ' + chiaro, 'errore', 6000);
      }
    } finally {
      this.lavoroAI = null;
      vai.disabled = false;
      ferma.style.display = 'none';
    }
  }

  // ——— la voce AI: i sottotitoli letti da una voce di NVIDIA (Magpie) ———
  private voce = (() => {
    const base = { voce: 0, lingua: '', silenzia: true };
    try { return { ...base, ...(JSON.parse(localStorage.getItem('dpv-voce') ?? '{}') as Partial<typeof base>) }; } catch { return base; }
  })();
  private lavoroVoce: AbortController | null = null;

  private pannelloVoce(): HTMLElement[] {
    const sinc: (() => void)[] = [];
    const salva = () => { try { localStorage.setItem('dpv-voce', JSON.stringify(this.voce)); } catch { /* niente */ } sinc.forEach((f) => f()); };
    const scelta = (nome: string, opz: [string, string, string?][], get: () => string, put: (v: string) => void) => {
      const bott = opz.map(([v, t, info]) => h('button', { class: 'chip', 'data-v': v, title: info ?? '', on: { click: () => { put(v); salva(); } } }, t));
      sinc.push(() => bott.forEach((b) => b.classList.toggle('acceso', b.dataset.v === get())));
      return h('div', { class: 'fin-scelte' }, h('span', null, nome), h('div', { class: 'isp-chips' }, bott));
    };
    const lavoro = new BarraLavoro('Voce AI dai sottotitoli', 'ai', () => this.lavoroVoce?.abort());
    const ferma = h('button', { class: 'btn-mini', style: 'display:none', on: { click: () => this.lavoroVoce?.abort() } }, '■ Ferma');
    const vai = h('button', { class: 'btn primario ai-vai', 'data-ai': 'voce', title: 'Legge i sottotitoli con la voce scelta e mette il risultato su una traccia audio nuova', on: { click: () => void this.faiParlare(lavoro, vai, ferma) } }, '🗣 Fai parlare i sottotitoli');
    const silenzia = h('input', { type: 'checkbox' }) as HTMLInputElement;
    silenzia.addEventListener('change', () => { this.voce.silenzia = silenzia.checked; salva(); });
    sinc.push(() => { silenzia.checked = this.voce.silenzia; });
    const linguaSott = () => sottotitoliDi(store.doc).lingua;
    const scelte = scelta('La voce parla', [['', 'Come i sottotitoli', 'Nella lingua in cui sono scritti i sottotitoli'], ...LINGUE_PARLATE.map(([v, , t]) => [v, t, 'Se i sottotitoli sono in un\'altra lingua, prima si traducono (solo per la voce)'] as [string, string, string])], () => this.voce.lingua, (v) => { this.voce.lingua = v; });
    const nota = h('p', { class: 'nota' });
    const nomeLingua = (l: string) => LINGUE.find(([v]) => v === l)?.[1] ?? l;
    sinc.push(() => {
      const lS = linguaSott(), lV = this.voce.lingua || lS;
      const diversa = !!lV && lV !== lS;
      nota.textContent = !motoreNemo()
        ? 'La voce AI usa il motore di NVIDIA, che gira nell\'app per Windows e Mac (sul processore, o meglio sulla scheda NVIDIA). Nel browser non c\'è.'
        : !LINGUE_VOCE.includes(lV)
          ? `La voce sa parlare italiano, inglese, spagnolo, francese, tedesco e cinese: scegli in che lingua deve parlare (i sottotitoli sono in ${nomeLingua(lS)}).`
          : diversa
            ? `I sottotitoli sono in ${nomeLingua(lS)} e la voce parla ${nomeLingua(lV)}: prima li traduco (solo per la voce, i sottotitoli restano come sono), poi li leggo. Ogni frase va al suo posto, e diventa una clip che puoi spostare o abbassare.`
            : `La voce legge i sottotitoli (${nomeLingua(lS)}) con una voce sintetica di NVIDIA (Magpie TTS). Ogni frase va al suo posto, e diventa una clip che puoi spostare o abbassare.`;
      vai.disabled = !motoreNemo() || !!this.lavoroVoce;
    });
    this.aggiornaAI.push(() => sinc.forEach((f) => f()));
    const out = [
      scelta('Voce', VOCI_MAGPIE.map((n, i) => [String(i), n] as [string, string]), () => String(this.voce.voce), (v) => { this.voce.voce = Number(v); }),
      scelte,
      h('label', { class: 'spunta-riga', title: 'Le voci originali vanno a zero: si sente solo la voce AI' }, silenzia, ' silenzia le voci originali'),
      h('div', { class: 'isp-pulsanti' }, vai, ferma),
      ...lavoro.elementi,
      nota,
    ];
    salva();
    return out;
  }

  private async faiParlare(lavoro: BarraLavoro, vai: HTMLButtonElement, ferma: HTMLElement) {
    if (this.lavoroVoce) return;
    const p = store.doc;
    if (!sottotitoliDi(p).righe.some((x) => x.testo.trim())) { avviso('Prima servono i sottotitoli: scrivili qui, o fatti aiutare dall\'AI', 'info', 3000); return; }
    const lingua = linguaVoce(p, this.voce.lingua || undefined);
    if (!lingua) { avviso('La voce parla italiano, inglese, spagnolo, francese, tedesco e cinese: scegli in che lingua', 'info', 3200); return; }
    if (!(await confermaAvvioAI({ compito: 'Fai parlare i sottotitoli', ambito: 'Tutte le righe dei sottotitoli · nuova traccia Voce AI', modello: 'Magpie · ' + this.voce.voce, dettagli: 'Il motore nativo può scaricare anche i modelli di traduzione se necessari.' }))) return;
    if (this.lavoroVoce) return;
    const progetto = progettoAttuale();
    const ctrl = new AbortController();
    this.lavoroVoce = ctrl;
    vai.disabled = true;
    ferma.style.display = '';
    lavoro.avvia('Comincio…');
    try {
      const r = await doppia(structuredClone(p), { voce: this.voce.voce, lingua, silenzia: this.voce.silenzia, traduci: true }, (t, k) => lavoro.imposta(t, k), ctrl.signal);
      if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
      lavoro.imposta("Salvo l’audio…", 0.97);
      const nome = `Voce AI ${VOCI_MAGPIE[this.voce.voce] ?? ''} ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '.')}.wav`.replace('  ', ' ');
      const blob = new Blob([codificaWav(r.audio, r.sr) as BlobPart], { type: 'audio/wav' });
      const path = await salvaMediaSulDisco(nome, blob);
      if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
      const file = new File([blob], nome, { type: 'audio/wav' });
      const [m] = await importaFile([{ name: nome, path, file: path ? undefined : file }], { chiediFormato: false });
      if (!m) throw new Error('non riesco a leggere l\'audio prodotto');
      if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
      const ids = store.edit('Voce AI', (pp) => posaVoce(pp, m.id, r.audio.length / r.sr, this.voce.silenzia, r.posti));
      store.select(ids);
      lavoro.fine(`Fatto: ${r.frasi} frasi${r.tradotto ? ' tradotte' : ''}, ognuna è una clip nella traccia "Voce AI"`);
      avviso(`🗣 Voce AI pronta: ${r.frasi} frasi${r.tradotto ? ' (tradotte)' : ''}, una clip per frase${this.voce.silenzia ? ' · le voci originali sono in silenzio' : ''}. Clicca una riga dei sottotitoli per sceglierne la voce`, 'ok', 4800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'fermato') lavoro.ferma('Fermato');
      else if (msg === 'senza-righe') lavoro.ferma('Non ci sono righe da leggere');
      else if (msg === 'lingua') lavoro.ferma('Questa lingua la voce non la sa');
      else if (msg === 'traduzione') lavoro.ferma('Questa coppia di lingue non la so tradurre');
      else {
        const chiaro = spiegaErroreAI(msg);
        lavoro.ferma('Non ci sono riuscito: ' + chiaro);
        avviso('La voce AI non è partita: ' + chiaro, 'errore', 6000);
      }
    } finally {
      this.lavoroVoce = null;
      vai.disabled = !motoreNemo();
      ferma.style.display = 'none';
    }
  }

  private dialoghi() {
    const p = store.doc;
    const pronti = p.clips.some((c) => c.kind === 'media' && c.media && mediaRT(c.media)?.peaks);
    if (!pronti) { avviso('Nel montaggio non c\'è audio da ascoltare (o la forma d\'onda non è ancora pronta)', 'info', 2600); return; }
    let n = 0;
    store.edit('Tempi dai dialoghi', (pp) => { n = righeDaiDialoghi(pp); });
    avviso(n ? `🎙 ${n} righe pronte dove si parla: scrivi il testo` : 'Non ho sentito parlato nuovo (le righe già scritte restano)', n ? 'ok' : 'info', 2600);
  }

  private rigaAlCursore() {
    const p = store.doc;
    const r = fps(p.rate);
    const da = Math.round(store.head);
    const dopo = sottotitoliDi(p).righe.filter((x) => x.da > da).sort((a, b) => a.da - b.da)[0];
    const a = Math.max(da + 2, Math.min(da + Math.round(r * 2.5), dopo ? dopo.da : Infinity));
    const id = uid('s');
    this.cambiaSott('Riga di sottotitolo', (s) => { s.righe.push({ id, da, a, testo: '' }); s.righe.sort((x, y) => x.da - y.da); });
    setTimeout(() => (this.listaSott?.querySelector(`[data-id="${id}"] textarea`) as HTMLTextAreaElement | null)?.focus(), 60);
  }

  private async esportaSrt(formato: 'srt' | 'vtt' = 'srt') {
    await (await import('./sottotitoliRapidi')).esportaSottotitoli(formato);
  }

  // ——— logo ———
  private paginaLogo(sez: (t: string, ic: string, ...f: (HTMLElement | null)[]) => HTMLElement): HTMLElement {
    const scelta = h('select', { class: 'mini-select largo' }) as HTMLSelectElement;
    const riempi = () => {
      const imm = store.doc.media.filter((m) => m.type === 'image');
      const att = this.m().logo?.media ?? '';
      scelta.replaceChildren(h('option', { value: '' }, imm.length ? '— nessun logo —' : '— importa prima un\'immagine (PNG) —'), ...imm.map((m) => h('option', { value: m.id }, m.name)));
      scelta.value = att;
    };
    scelta.addEventListener('change', () => this.cambia(scelta.value ? 'Logo' : 'Togli logo', (m) => { m.logo = scelta.value ? { pos: 'alto-dx', scala: 0.12, opacita: 0.85, ...(m.logo ?? {}), media: scelta.value } : null; }));
    this.campi.push({ aggiorna: riempi });
    const angoli: [NonNullable<Master['logo']>['pos'], string][] = [['alto-sx', '↖ Alto a sinistra'], ['alto-dx', 'Alto a destra ↗'], ['basso-sx', '↙ Basso a sinistra'], ['basso-dx', 'Basso a destra ↘']];
    const bott = angoli.map(([v, t]) => h('button', { class: 'chip', 'data-v': v, on: { click: () => this.cambia('Posizione del logo', (m) => { if (m.logo) m.logo.pos = v; }) } }, t));
    this.campi.push({ aggiorna: () => bott.forEach((b) => b.classList.toggle('acceso', b.dataset.v === this.m().logo?.pos)) });
    return sez('Logo sempre in vista', 'logo',
      h('div', { class: 'fin-scelte' }, h('span', null, 'Immagine'), scelta),
      h('div', { class: 'isp-pulsanti' }, h('button', { class: 'btn-mini', on: { click: () => void importaDialogo() } }, 'Importa un\'immagine…')),
      h('div', { class: 'fin-scelte' }, h('span', null, 'Angolo'), h('div', { class: 'isp-chips' }, bott)),
      this.cursore('Grandezza', 4, 40, (m) => Math.round((m.logo?.scala ?? 0.12) * 100), (m, v) => { if (m.logo) m.logo.scala = v / 100; }, '%'),
      this.cursore('Opacità', 10, 100, (m) => Math.round((m.logo?.opacita ?? 0.85) * 100), (m, v) => { if (m.logo) m.logo.opacita = v / 100; }, '%'),
      h('p', { class: 'nota' }, 'Un PNG con lo sfondo trasparente è l\'ideale. Il logo sta sopra a tutto, non prende il colore finale ed esce nel master.'));
  }

  // ——— apertura e chiusura ———
  private paginaApertura(sez: (t: string, ic: string, ...f: (HTMLElement | null)[]) => HTMLElement): HTMLElement[] {
    const scelta = h('select', { class: 'mini-select largo' }) as HTMLSelectElement;
    const riempi = () => {
      const lista = store.doc.media.filter((m) => m.type !== 'audio');
      const v = scelta.value;
      scelta.replaceChildren(...(lista.length ? lista.map((m) => h('option', { value: m.id }, m.name)) : [h('option', { value: '' }, '— il contenitore è vuoto —')]));
      if (lista.some((m) => m.id === v)) scelta.value = v;
    };
    this.campi.push({ aggiorna: riempi });
    const r = () => fps(store.doc.rate);
    return [
      sez('Una clip all\'inizio o alla fine', 'apertura',
        h('div', { class: 'fin-scelte' }, h('span', null, 'Clip'), scelta),
        h('div', { class: 'isp-pulsanti' },
          h('button', { class: 'btn-mini', title: 'Entra all\'inizio e sposta avanti tutto il montaggio', on: { click: () => this.clipAgliEstremi(scelta.value, 'inizio') } }, '⇤ Metti all\'inizio'),
          h('button', { class: 'btn-mini', on: { click: () => this.clipAgliEstremi(scelta.value, 'fine') } }, 'Metti alla fine ⇥')),
        h('p', { class: 'nota' }, 'La sigla, il logo animato, lo sponsor: una piccola clip prima o dopo. Se ha segnati attacco e stacco, entra solo quel pezzo.')),
      sez('Titoli', 'titolo',
        h('div', { class: 'isp-pulsanti' },
          h('button', { class: 'btn-mini', title: 'Tre secondi col nome del progetto, all\'inizio (il resto scorre avanti)', on: { click: () => this.titoloApertura() } }, 'Titolo d\'apertura'),
          h('button', { class: 'btn-mini', title: 'Il rullo dei titoli di coda alla fine', on: { click: () => this.titoliCoda() } }, 'Titoli di coda')),
        h('p', { class: 'nota' }, 'Il testo si cambia dalle proprietà del titolo (pagina Montaggio).')),
      sez('Dal nero e al nero', 'effetti',
        h('div', { class: 'isp-pulsanti' },
          h('button', { class: 'btn-mini', title: 'Un secondo: l\'immagine esce dal nero e l\'audio sale', on: { click: () => this.estremiNero('inizio', Math.round(r())) } }, 'Entra dal nero'),
          h('button', { class: 'btn-mini', title: 'Un secondo e mezzo: l\'immagine va nel nero e l\'audio scende', on: { click: () => this.estremiNero('fine', Math.round(r() * 1.5)) } }, 'Chiudi nel nero')),
        h('p', { class: 'nota' }, 'Mette i blocchetti "Dal nero" e "Al nero" sulla traccia video più in alto e sfuma l\'audio: li puoi allungare dalla timeline.')),
    ];
  }

  private clipAgliEstremi(mediaId: string, dove: 'inizio' | 'fine') {
    const p = store.doc;
    const m = p.media.find((x) => x.id === mediaId);
    if (!m) { avviso('Scegli prima una clip del contenitore', 'info'); return; }
    const srcIn = m.markIn ?? m.t0 ?? 0;
    const srcOut = m.markOut ?? (m.type === 'image' ? srcIn + 3 : m.duration);
    const v = p.tracks.filter((t) => t.kind === 'video' && !t.lock).slice(-1)[0]?.id ?? null;
    const a = p.tracks.find((t) => t.kind === 'audio' && !t.lock)?.id;
    const tg = { video: v, audio: a ? [a] : [] };
    const f = dove === 'inizio' ? 0 : projectEnd(p);
    const ids = store.edit(dove === 'inizio' ? 'Clip all\'inizio' : 'Clip alla fine', (pp) => {
      const nuove = M.placeSource(pp, { mediaId, srcIn, srcOut }, f, null, tg, dove === 'inizio' ? 'insert' : 'libero');
      const c = pp.clips.find((x) => x.id === nuove[0]);
      if (dove === 'inizio' && c) spostaSottotitoli(pp, c.len);
      return nuove;
    });
    store.select(ids);
    avviso(`${m.name} ${dove === 'inizio' ? 'all\'inizio: il resto è scivolato avanti' : 'alla fine'}`, 'ok');
  }

  private titoloApertura() {
    const p = store.doc;
    const len = Math.round(fps(p.rate) * 3);
    store.edit('Titolo d\'apertura', (pp) => {
      M.insertSpace(pp, 0, len, new Set(pp.tracks.filter((t) => !t.lock).map((t) => t.id)));
      spostaSottotitoli(pp, len);
      const v = pp.tracks.filter((t) => t.kind === 'video' && !t.lock).slice(-1)[0];
      if (!v) return;
      const c = newClip('title', v.id, 0, len, { name: 'Titolo d\'apertura', gen: { title: { ...TITLE0, text: pp.name, font: 'Orbitron', size: 92, color: '#ffffff' } } });
      c.fadeIn = c.fadeOut = Math.round(fps(pp.rate) / 2);
      pp.clips.push(c);
    });
    avviso('Titolo d\'apertura: tre secondi all\'inizio, il resto è scivolato avanti', 'ok');
  }

  private titoliCoda() {
    const p = store.doc;
    const len = Math.round(fps(p.rate) * 12);
    const f = projectEnd(p);
    store.edit('Titoli di coda', (pp) => {
      const v = M.tracciaLibera(pp, 'video', pp.tracks.filter((t) => t.kind === 'video').slice(-1)[0]?.id ?? null, f, f + len);
      pp.clips.push(newClip('title', v, f, len, { name: 'Titoli di coda', gen: { title: { ...TITLE0, style: 'rullo', size: 64, text: `${pp.name}\n\nMontaggio\nDaProd Video\n\nMusica\n…\n\nGrazie per la visione` } } }));
    });
    avviso('Titoli di coda alla fine: il testo si cambia dalle proprietà', 'ok');
  }

  private estremiNero(dove: 'inizio' | 'fine', len: number) {
    const p = store.doc;
    const fine = projectEnd(p);
    if (!fine) { avviso('La timeline è vuota', 'info'); return; }
    store.edit(dove === 'inizio' ? 'Entra dal nero' : 'Chiudi nel nero', (pp) => {
      // sulla traccia video più in alto: vale per tutto (anche i titoli)
      posaBlocco(pp, nuovoBlocco('effetto', dove === 'inizio' ? 'dalNero' : 'alNero'), dove === 'inizio' ? 0 : fine - len, len, pp.tracks.find((t) => t.kind === 'video')?.id);
      const audio = new Set(pp.tracks.filter((t) => t.kind === 'audio').map((t) => t.id));
      for (const c of pp.clips) {
        if (!audio.has(c.track)) continue;
        if (dove === 'inizio' && c.start === 0) c.fadeIn = Math.max(c.fadeIn, Math.min(len, c.len - c.fadeOut));
        if (dove === 'fine' && end(c) === fine) c.fadeOut = Math.max(c.fadeOut, Math.min(len, c.len - c.fadeIn));
      }
    });
    avviso(dove === 'inizio' ? 'Il montaggio entra dal nero (e l\'audio sale)' : 'Il montaggio si chiude nel nero (e l\'audio scende)', 'ok');
  }

  // ——— voce e lingue ———
  private trad = (() => {
    const base = { a: 'en' };
    try { return { ...base, ...(JSON.parse(localStorage.getItem('dpv-trad') ?? '{}') as Partial<typeof base>) }; } catch { return base; }
  })();
  private lavoroTrad: AbortController | null = null;

  /** due passi: 1 i sottotitoli (in che lingua sono, e tradurli), 2 la voce (in che lingua parla: se è un'altra, si traduce da sola) */
  private paginaLingue(sez: (t: string, ic: string, ...f: (HTMLElement | null)[]) => HTMLElement): HTMLElement[] {
    const lingua = h('select', { class: 'mini-select largo' }, LINGUE.map(([v, t]) => h('option', { value: v }, t))) as HTMLSelectElement;
    lingua.addEventListener('change', () => this.cambiaSott('Lingua dei sottotitoli', (x) => { x.lingua = lingua.value; }));
    const aTrad = h('select', { class: 'mini-select largo' }, LINGUE_TRADUZIONE.map(([v, , t]) => h('option', { value: v }, t))) as HTMLSelectElement;
    aTrad.addEventListener('change', () => { this.trad.a = aTrad.value; try { localStorage.setItem('dpv-trad', JSON.stringify(this.trad)); } catch { /* niente */ } this.campi.forEach((c) => c.aggiorna()); });
    const lavoro = new BarraLavoro('Traduzione dei sottotitoli', 'ai', () => { this.lavoroTrad?.abort(); fermaTraduzione(); });
    const ferma = h('button', { class: 'btn-mini', style: 'display:none', on: { click: () => { this.lavoroTrad?.abort(); fermaTraduzione(); } } }, '■ Ferma');
    const vai = h('button', { class: 'btn primario ai-vai', 'data-ai': 'traduci', on: { click: () => void this.traduciSottotitoli(lavoro, vai, ferma) } }, '🌍 Traduci i sottotitoli');
    const nota = h('p', { class: 'nota' });
    this.campi.push({ aggiorna: () => {
      const s = sottotitoliDi(store.doc);
      if (document.activeElement !== lingua) lingua.value = s.lingua;
      aTrad.value = this.trad.a;
      const nome = (l: string) => LINGUE.find(([v]) => v === l)?.[1] ?? l;
      const stessa = s.lingua === this.trad.a;
      vai.disabled = !!this.lavoroTrad || !s.righe.some((x) => x.testo.trim()) || stessa || !sappiamoTradurre(s.lingua, this.trad.a);
      nota.textContent = !s.righe.some((x) => x.testo.trim()) ? 'Prima servono i sottotitoli: scrivili nella pagina Sottotitoli, o fatti aiutare dall\'AI.'
        : stessa ? 'I sottotitoli sono già in questa lingua.'
          : !sappiamoTradurre(s.lingua, this.trad.a) ? `Da ${nome(s.lingua)} a ${nome(this.trad.a)} non so tradurre.`
            : `Le righe restano ai loro tempi, cambia solo il testo (da ${nome(s.lingua)} a ${nome(this.trad.a)}). Si annulla con Ctrl+Z. Il modello di traduzione (NLLB di Meta) si scarica la prima volta e poi resta sul computer.`;
    } });
    return [
      sez('1 · Sottotitoli', 'sottotitoli',
        h('div', { class: 'fin-scelte' }, h('span', null, 'Sono scritti in'), lingua),
        h('div', { class: 'fin-scelte' }, h('span', null, 'Traduci in'), aTrad),
        h('div', { class: 'isp-pulsanti' }, vai, ferma),
        ...lavoro.elementi,
        nota),
      sez('2 · Voce', 'altoparlante', ...this.pannelloVoce()),
      h('p', { class: 'nota' }, 'Tutto gira sul tuo computer: i testi e l\'audio non vanno da nessuna parte e i modelli si scaricano una volta sola. I sottotitoli e la voce possono essere in lingue diverse: se la voce parla un\'altra lingua, i testi si traducono da soli prima di leggerli.'),
    ];
  }

  /** traduce il testo delle righe (restano ai loro tempi) e cambia la lingua dei sottotitoli */
  private async traduciSottotitoli(lavoro: BarraLavoro, vai: HTMLButtonElement, ferma: HTMLElement) {
    if (this.lavoroTrad) return;
    const s = sottotitoliDi(store.doc);
    const da = s.lingua, a = this.trad.a;
    const righe = s.righe.map((x) => ({ id: x.id, testo: x.testo }));
    if (!righe.some((x) => x.testo.trim())) { avviso('Non ci sono righe da tradurre', 'info'); return; }
    if (!(await confermaAvvioAI({ compito: 'Traduci sottotitoli', ambito: `${righe.length} righe · ${da} → ${a}`, modello: 'NLLB-200', repo: 'Xenova/nllb-200-distilled-600M', mb: 600, ids: ['nllb'] }))) return;
    if (this.lavoroTrad) return;
    const progetto = progettoAttuale();
    const ctrl = new AbortController();
    this.lavoroTrad = ctrl;
    vai.disabled = true;
    ferma.style.display = '';
    lavoro.avvia('Comincio…');
    try {
      const nuovi = await traduciTesti(righe.map((x) => x.testo), da, a, (t, k) => lavoro.imposta(t, k), ctrl.signal);
      if (ctrl.signal.aborted || progetto !== progettoAttuale()) throw new Error('fermato');
      const per = new Map(righe.map((x, i) => [x.id, nuovi[i]]));
      this.cambiaSott('Traduci i sottotitoli', (x) => { for (const r of x.righe) if (per.has(r.id)) r.testo = per.get(r.id)!; x.lingua = a; });
      lavoro.fine(`Fatto: ${righe.length} righe tradotte`);
      avviso(`🌍 Sottotitoli tradotti (${LINGUE.find(([v]) => v === a)?.[1] ?? a}). Ctrl+Z per tornare indietro`, 'ok', 3200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'fermato') lavoro.ferma('Fermato');
      else { const chiaro = spiegaErroreAI(msg); lavoro.ferma('Non ci sono riuscito: ' + chiaro); avviso('La traduzione non è partita: ' + chiaro, 'errore', 6000); }
    } finally {
      this.lavoroTrad = null;
      ferma.style.display = 'none';
      this.campi.forEach((c) => c.aggiorna());
    }
  }

  /** porta tutte le clip audio a un livello comodo (come l'effetto "Livella" clip per clip) */
  private async livellaTutto() {
    const p = store.doc;
    const quali = p.clips.filter((c) => c.kind === 'media' && trackOf(p, c.track).kind === 'audio');
    const progetto = progettoAttuale();
    const preparati = new Set(await preparaOra([...new Set(quali.map((c) => c.media).filter((id): id is string => !!id))], 'picchi'));
    if (progettoAttuale() !== progetto) return;
    let n = 0, attesa = 0;
    store.edit('Livella il volume', (pp) => {
      for (const c of pp.clips) {
        if (!quali.some((q) => q.id === c.id)) continue;
        if (!c.media || !preparati.has(c.media)) { attesa++; continue; }
        const g = volumeLivellato(pp, c);
        if (g === null) { attesa++; continue; }
        c.afx = { ...c.afx, norm: c.afx?.norm ?? c.gain };
        c.gain = g;
        c.gainKeys = [];
        n++;
      }
    });
    avviso(n ? `🔊 ${n} clip livellate${attesa ? ` (${attesa} ancora da leggere)` : ''}` : 'Nessuna clip audio da livellare', n ? 'ok' : 'info', 2400);
  }

  private aggiornaRiepilogo() {
    const p = store.doc;
    const fine = projectEnd(p);
    const r = fps(p.rate);
    const video = p.clips.filter((c) => c.kind === 'media' && isVideoClip(c)).length;
    const audio = p.clips.filter((c) => !isVideoClip(c) && c.kind !== 'fx').length;
    const titoli = p.clips.filter((c) => c.kind === 'title').length;
    const tr = p.clips.filter((c) => c.kind === 'fx' && c.fxb?.tipo === 'transizione').length + p.clips.filter((c) => isVideoClip(c) && (c.trIn || c.trOut)).length;
    const offline = p.media.filter((m) => mediaRT(m.id)?.stato !== 'ok').length;
    const vuoti = buchi(p);
    const avvisi: HTMLElement[] = [];
    const nonMisurati = senzaColoreMisurato(p);
    if (nonMisurati.length) avvisi.push(h('li', { class: 'fin-attento' }, `${nonMisurati.length} riprese senza misura colore: restano neutre. Vai a Immagine → Misura ora.`));
    const m = this.m();
    this.menu.querySelectorAll<HTMLButtonElement>('.fin-voce').forEach((b) => {
      const id = b.dataset.s;
      b.setAttribute('aria-current', id === this.sezione ? 'step' : 'false');
      const riassunto = id === 'colore' ? `Look ${m.look} · ${nonMisurati.length} da misurare` : id === 'audio' ? `${m.volume} dB · limitatore ${m.limiter ? 'acceso' : 'spento'}` : id === 'sottotitoli' || id === 'lingue' ? `${sottotitoliDi(p).righe.length} righe` : '';
      b.title = (SEZIONI.find((z) => z.id === id)?.info ?? '') + (riassunto ? ' · ' + riassunto : '');
    });
    if (!fine) avvisi.push(h('li', { class: 'fin-info' }, 'La timeline è vuota: prima monta qualcosa.'));
    if (offline) avvisi.push(h('li', { class: 'fin-male' }, `${offline} file da ricollegare (File → Ricollega media)`));
    for (const [a, b] of vuoti.slice(0, 4)) {
      avvisi.push(h('li', { class: 'fin-attento' }, h('button', { class: 'link', on: { click: () => { motore.setMonitor('recorder'); motore.vaiA(a); } } }, `Nero di ${((b - a) / r).toFixed(1).replace('.', ',')} s a ${frameToTc(a, p.rate, p.drop)}`)));
    }
    if (vuoti.length > 4) avvisi.push(h('li', { class: 'fin-attento' }, `…e altri ${vuoti.length - 4} buchi neri`));
    if (fine && !avvisi.length) avvisi.push(h('li', { class: 'fin-bene' }, '✓ Tutto a posto: niente buchi neri, tutti i file ci sono.'));
    this.riepilogo.replaceChildren(
      h('div', { class: 'fin-numeri' },
        h('div', null, h('b', null, fine ? durataUmana(f2s(fine, p.rate)) : '—'), h('small', null, 'durata')),
        h('div', null, h('b', null, String(video)), h('small', null, 'video')),
        h('div', null, h('b', null, String(audio)), h('small', null, 'audio')),
        h('div', null, h('b', null, String(titoli)), h('small', null, 'titoli')),
        h('div', null, h('b', null, String(tr)), h('small', null, 'transizioni'))),
      h('div', { class: 'fin-formato' }, `${p.w}×${p.h} · ${(p.rate.num / p.rate.den).toFixed(p.rate.den === 1 ? 0 : 2)} fps${p.drop ? ' DF' : ''} · ${p.sampleRate / 1000} kHz`),
      h('ul', { class: 'fin-avvisi' }, avvisi));
  }

  // ——— mattoncini ———
  private cursore(nome: string, min: number, max: number, get: (m: Master) => number, put: (m: Master, v: number) => void, unita: string, step = 1): HTMLElement {
    const r = h('input', { type: 'range', min, max, step }) as HTMLInputElement;
    const n = h('span', { class: 'fin-val' });
    const agg = () => { const v = get(this.m()); r.value = String(v); n.textContent = `${v > 0 && min < 0 ? '+' : ''}${v}${unita ? ' ' + unita : ''}`; };
    agg();
    let vivo = false;
    r.addEventListener('input', () => {
      if (!vivo) { store.begin(nome); vivo = true; }
      const p = store.doc;
      p.master = { ...MASTER0, ...(p.master ?? {}) };
      put(p.master, clamp(Number(r.value), min, max));
      store.liveChange();
      agg();
    });
    r.addEventListener('change', () => { if (vivo) store.commit(true); vivo = false; });
    r.addEventListener('dblclick', () => {
      const def = get(MASTER0);
      this.cambia(nome, (m) => put(m, def));
    });
    this.campi.push({ aggiorna: agg });
    return h('label', { class: 'fin-riga' }, h('span', null, nome), r, n);
  }

  private spunta(nome: string, get: (m: Master) => boolean, put: (m: Master, v: boolean) => void): HTMLElement {
    const i = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const agg = () => { i.checked = get(this.m()); };
    agg();
    i.addEventListener('change', () => this.cambia(nome, (m) => put(m, i.checked)));
    this.campi.push({ aggiorna: agg });
    return h('label', { class: 'isp-riga spunta' }, i, h('span', null, nome));
  }
}
