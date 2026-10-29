// Il banco di montaggio: mette insieme menu, contenitore, monitor, pulsantiera, timeline e strumenti.
// Due pagine: MONTAGGIO (contenitore, monitor, proprietà, timeline) e FINALE (monitor grande, ritocchi su
// tutto, esporta). Ogni bordo fra i pannelli si trascina: il banco lo sistemi come vuoi, e se lo ricorda.
import { store } from '../core/store';
import { motore } from '../motore';
import { esegui, modi } from '../azioni';
import { Timeline } from './timeline';
import { PannelloMonitor } from './monitor';
import { Finale } from './finale';
import { Live } from './live';
import { Montage } from './montage';
import { Home } from './home';
import { Contenitore } from './contenitore';
import { Pulsantiera } from './pulsantiera';
import { Ispettore } from './ispettore';
import { Mixer, VuMetri } from './mixer';
import { Scopi } from './scopi';
import { h, icona, avviso } from './dom';
import { barraMenu } from './barraMenu';
import { menuBanco, type Pagina } from './menuBanco';
import { barraTitolo } from './barraTitolo';
import { Disposizione } from './disposizione';
import { installaTastiera } from './tastiera';
import { attivaRotella } from './rotella';
import { finestraEsporta, finestraInfo, finestraProgetto, finestraTasti, esportaEdl, esportaFotogramma, VERSIONE } from './dialoghi';
import { apri, apriFile, salvaPacchetto, autosalva, importaDaDrop, importaDialogo, importaFile, nuovo, ricollega, riprendi, salva } from '../progetti';
import { invoke, isAndroid, isTauri, schermoIntero, GRANDEZZE_UI, grandezzaUI, impostaGrandezzaUI } from '../platform';
import { finestraNovita, novitaDopoAggiornamento, tastoAggiornamenti } from './aggiornamenti';
import { montaggioDimostrativo } from '../demo';
import { statoDecoder } from '../media/fotogrammi';
import { CentroAttivita } from './attivita';
import { impostaUsoMedia } from '../media/libreria';
import { banco } from '../media/audio';
import { registra } from '../azioni';
import { apriCerca } from './cerca';
import { apriEditorClip } from './editorClip';
import './fontiCerca';
import { finestraGuida } from './guida';
import { finestraCentroAI } from './centroAI';
import { rilevaAllAvvio } from '../media/hardware';

export function avvia(radice: HTMLElement) {
  const tl = new Timeline();
  const monitor = new PannelloMonitor();
  const finale = new Finale();
  const live = new Live();
  const montage = new Montage();
  const bin = new Contenitore();
  const puls = new Pulsantiera(tl);
  const isp = new Ispettore();
  const vu = new VuMetri();
  const mixer = new Mixer();
  const scopi = new Scopi();
  // come è sistemato il banco (bordi, pannelli chiusi): si ricorda da solo
  const disp = new Disposizione(radice, () => monitor.adatta());

  // ——— pannello laterale a schede ———
  type Lato = 'clip' | 'mixer' | 'scopi';
  const lato: Record<Lato, HTMLElement> = { clip: isp.el, mixer: mixer.el, scopi: scopi.el };
  const latoCorpo = h('div', { class: 'lato-corpo' }, isp.el);
  const mostraLato = (s: Lato) => {
    latoCorpo.replaceChildren(lato[s]);
    scopi.attiva(s === 'scopi');
    radice.querySelectorAll('.lato .scheda').forEach((b) => b.classList.toggle('attiva', (b as HTMLElement).dataset.s === s));
  };
  const tab = (s: Lato, n: string) => h('button', { class: 'scheda' + (s === 'clip' ? ' attiva' : ''), 'data-s': s, on: { click: () => mostraLato(s) } }, n);
  const vuCornice = h('div', { class: 'vu-cornice' }, vu.el);
  // il puntino: il pannello a destra sempre in vista, a tutta altezza (come il tasto V)
  const pannelloLato = h('section', { class: 'pannello lato' },
    vuCornice,
    h('header', { class: 'schede' }, tab('clip', 'Proprietà'), tab('mixer', 'Mixer'), tab('scopi', 'Strumenti')),
    latoCorpo);
  // clic su una clip o su un FX: il pannello si apre (se era chiuso) e mostra le sue impostazioni
  document.addEventListener('dpv:proprieta', () => {
    if (radice.dataset.pagina !== 'montaggio' || radice.classList.contains('stretto')) return;
    if (radice.classList.contains('senza-lato')) disp.alterna('senza-lato', false);
    mostraLato('clip');
  });
  document.addEventListener('dpv:ispettore', () => {
    pagina('montaggio');
    if (radice.classList.contains('senza-lato')) disp.alterna('senza-lato', false);
    mostraLato('clip');
    apriFoglio('lato');
  });
  // "porta dove si fa" (guida, ricerca, Centro AI): una sezione delle proprietà della clip scelta
  document.addEventListener('dpv:sezione', (e) => {
    const id = (e as CustomEvent).detail as string;
    // le sezioni che nel pannello a destra non ci sono più stanno nell'editor della clip (doppio clic)
    if (['fxv', 'durata', 'trclip', 'ritaglio'].includes(id) && store.sel.size) { apriEditorClip([...store.sel][0], id); return; }
    pagina('montaggio');
    if (radice.classList.contains('senza-lato')) disp.alterna('senza-lato', false);
    mostraLato('clip');
    apriFoglio('lato');
    if (!store.sel.size) { avviso('Scegli prima una clip nella timeline: qui compariranno le sue impostazioni', 'info', 3200); return; }
    setTimeout(() => { if (!isp.apriSezione(id)) avviso('Per la clip scelta questa impostazione non c\'è: scegli una clip video', 'info', 3000); }, 60);
  });

  // ——— le quattro pagine: Montaggio, Finale, LIVE e DaProdMontage ———
  const pagina = (pg: Pagina) => {
    if (radice.dataset.pagina === pg) return;
    if (radice.dataset.pagina === 'live' && live.registrando) avviso('La registrazione continua: torna su LIVE per fermarla', 'info', 2600);
    radice.dataset.pagina = pg;
    live.mostrata(pg === 'live');
    finale.mostrata(pg === 'finale');
    montage.mostrata(pg === 'montage');
    // i VU vanno dove si guarda: nelle proprietà durante il montaggio, nel Finale alla fine
    if (pg === 'finale') finale.el.insertBefore(vuCornice, finale.el.children[1] ?? null);
    else pannelloLato.insertBefore(vuCornice, pannelloLato.firstChild);
    radice.querySelectorAll('.pagina-btn').forEach((b) => b.classList.toggle('attiva', (b as HTMLElement).dataset.p === pg));
    motore.setMonitor('recorder');
    if (pg === 'finale' && radice.classList.contains('stretto')) radice.dataset.foglio = 'finale';
    setTimeout(() => { monitor.adatta(); tl.adattaTutto(); }, 80);
  };
  const home = new Home(() => pagina('montage'), () => pagina('live'));
  document.addEventListener('dpv:home', () => home.mostra());
  const tastoPagina = (pg: Pagina, nome: string, ic: string, title: string) => h('button', { class: 'pagina-btn' + (pg === 'montaggio' ? ' attiva' : ''), 'data-p': pg, title, on: { click: () => pagina(pg) } }, icona(ic, 16), h('span', null, nome));

  // ——— menu (src/ui/menuBanco.ts) ———
  const menus = menuBanco({ radice, pagina, home, monitor, tl, mostraLato, vistaStretta: () => vistaStretta(), rimettiBanco: () => rimettiBanco(), disp });
  // le cose rapide (marchio, progetti, salva, annulla, il nome del progetto, la ricerca) stanno nella barra del titolo,
  // bianca, sopra al banco: qui restano i menu, le pagine ed Esporta
  attivaRotella();
  // quando il programma è fermo guarda le schede video (e rifà le prove solo se l'hardware è cambiato)
  if (!navigator.webdriver) rilevaAllAvvio();
  const barra = barraTitolo({
    info: () => finestraInfo(), progetti: () => home.mostra(), salva: () => void salva(), importa: () => void importaDialogo(),
    annulla: () => esegui('annulla'), ripeti: () => esegui('ripeti'), cerca: () => apriCerca(), progetto: () => finestraProgetto(),
    novita: () => finestraNovita(),
    aggiornamenti: tastoAggiornamenti(icona),
  });
  const testa = h('header', { class: 'testata' },
    barraMenu(menus),
    h('button', { class: 'btn-ai', title: 'Centro AI: tutte le funzioni intelligenti, come si usano e se sono pronte', on: { click: () => finestraCentroAI() } }, '✨', h('span', null, 'AI')),
    h('div', { class: 'pagine' },
      tastoPagina('montaggio', 'MONTAGGIO', 'montaggio', 'Il banco di montaggio (F9)'),
      tastoPagina('finale', 'FINALE', 'finale', 'Colore e audio su tutto il montaggio, poi esporta (F9)'),
      tastoPagina('live', 'LIVE', 'live', 'Registra lo schermo e mettilo nel montaggio (F10)'),
      tastoPagina('montage', 'MONTAGE', 'automatico', 'DaProdMontage: butta dentro le foto e il programma monta da solo (F8)')),
    h('div', { class: 'testata-destra' },
      h('button', { class: 'btn primario piccolo', title: 'Esporta il master (Ctrl+M)', on: { click: () => finestraEsporta() } }, icona('esporta', 15), 'Esporta')));

  // ——— barra di stato ———
  const msg = h('span', { class: 'stato-msg' }, 'Pronto. 1 taglia · 2 elimina · S separa/unisci · rotella = un fotogramma · Q/W scarto a sinistra/destra · F9 Finale · F1 tutti i tasti');
  const dec = h('span', { class: 'stato-dec' });
  const centro = new CentroAttivita(bin.el);
  const statoBar = h('footer', { class: 'stato' }, msg, dec, centro.el, h('span', { class: 'stato-ver' }, `DaProd Video ${VERSIONE}`));
  motore.ogniGiro(() => {
    if (Math.random() > 0.05) return;
    const s = statoDecoder();
    dec.textContent = `${motore.fpsMisurati} fps · decoder ${s.flussi + s.ricerche}`;
  });
  // chi sta in timeline passa avanti nelle code dei lavori di fondo; una ripresa appena messa in timeline si prende la sua copia leggera
  impostaUsoMedia((id) => {
    let n = 0;
    for (const c of store.doc.clips) if (c.media === id) n++;
    for (const q of store.doc.sequenze ?? []) for (const c of q.clips ?? []) if (c.media === id) n++;
    return n;
  });
  // dalla 1.5.8 una ripresa che entra in timeline non fa partire niente da sola (niente copia leggera automatica):
  // la copia leggera si prepara a mano (proponiPreparazione in media/libreria.ts)

  // ——— fogli per il telefono ———
  const apriFoglio = (f: 'bin' | 'lato' | 'finale' | 'nessuno') => {
    if (!radice.classList.contains('stretto')) return;
    radice.dataset.foglio = radice.dataset.foglio === f ? 'nessuno' : f;
  };
  const barraTel = h('nav', { class: 'barra-tel' },
    h('button', { on: { click: () => apriFoglio('bin') } }, icona('apri', 18), h('span', null, 'Contenitore')),
    h('button', { on: { click: () => apriFoglio('lato') } }, icona('ingranaggio', 18), h('span', null, 'Proprietà')),
    h('button', { on: { click: () => { pagina(radice.dataset.pagina === 'finale' ? 'montaggio' : 'finale'); } } }, icona('finale', 18), h('span', null, 'Finale')),
    h('button', { on: { click: () => pagina(radice.dataset.pagina === 'montage' ? 'montaggio' : 'montage') } }, icona('automatico', 18), h('span', null, 'Monta')),
    h('button', { on: { click: () => finestraEsporta() } }, icona('esporta', 18), h('span', null, 'Esporta')));

  // ——— i bordi fra i pannelli si trascinano (doppio clic: chiude o riapre il pannello accanto) ———
  const divisore = h('div', { class: 'divisore', title: 'Trascina per dare più spazio al monitor o alla timeline' });
  const bordoBin = h('div', { class: 'bordo bordo-bin', title: 'Trascina per allargare il contenitore · doppio clic per chiuderlo/riaprirlo' });
  const bordoLato = h('div', { class: 'bordo bordo-lato', title: 'Trascina per allargare il pannello · doppio clic per chiuderlo/riaprirlo' });
  // col pannello chiuso resta una linguetta sul bordo destro per riaprirlo
  const linguetta = h('button', { class: 'linguetta-lato', title: 'Riapri il pannello delle proprietà', on: { click: () => disp.alterna('senza-lato', false) } }, '‹ Proprietà');
  radice.dataset.pagina = 'montaggio';
  radice.before(barra);
  radice.append(testa, bin.el, bordoBin, monitor.el, bordoLato, pannelloLato, finale.el, live.el, montage.el, home.el, puls.el, divisore, tl.el, statoBar, barraTel, linguetta);

  const rimettiBanco = () => { disp.rimetti(); setTimeout(() => { monitor.adatta(); tl.adattaTutto(); }, 60); };
  disp.ripristina();
  // il pannello di destra sta sempre in vista, a tutta altezza (da qui in poi niente più puntina)
  // (nelle prove automatiche il banco parte col pannello corto, come prima: le misure delle prove sono su quello)
  if (!navigator.webdriver) { radice.classList.add('lato-lungo'); radice.classList.remove('senza-lato'); }
  disp.bordo(bordoBin, (dx, _dy, r0) => ['--bin', Math.max(180, Math.min(innerWidth * 0.5, r0.width + dx))], () => bin.el.getBoundingClientRect(), 'senza-bin');
  disp.bordo(bordoLato, (dx, _dy, r0) => radice.dataset.pagina === 'finale'
    ? ['--fin', Math.max(300, Math.min(innerWidth * 0.72, r0.width - dx))]
    : ['--lato', Math.max(230, Math.min(innerWidth * 0.45, r0.width - dx))], () => (radice.dataset.pagina === 'finale' ? finale.el : pannelloLato).getBoundingClientRect(), 'senza-lato');
  disp.bordo(divisore, (_dx, dy, r0) => radice.dataset.pagina === 'finale'
    ? ['--tlpag', Math.max(90, Math.min(innerHeight - 220, r0.height - dy))]
    : radice.dataset.pagina === 'live'
      ? ['--tlfin', Math.max(90, Math.min(innerHeight - 220, r0.height - dy))]
      : ['--alto', Math.max(160, Math.min(innerHeight - 220, r0.height + dy))], () => (radice.dataset.pagina === 'finale' || radice.dataset.pagina === 'live' ? tl.el : monitor.el).getBoundingClientRect());

  /** tasto V: la timeline si stringe e la colonna di destra (VU, proprietà, mixer) scende fino in fondo, o torna larga */
  const vistaStretta = () => {
    const on = radice.classList.toggle('lato-lungo');
    if (on) radice.classList.remove('senza-lato');
    disp.salva();
    setTimeout(() => { monitor.adatta(); }, 60);
    avviso(on ? 'Timeline stretta: proprietà, mixer e VU fino in fondo (V per tornare)' : 'Timeline larga (V per stringerla)', 'info', 1400);
  };
  document.addEventListener('dpv:vista', vistaStretta);

  const larghezza = () => {
    const stretto = innerWidth < 900;
    radice.classList.toggle('stretto', stretto);
  };
  addEventListener('resize', larghezza);
  larghezza();

  // ——— tastiera, trascinamenti, audio ———
  installaTastiera();
  if (isTauri && grandezzaUI() !== 1) void impostaGrandezzaUI(grandezzaUI());
  // i comandi del banco (file, pagine, vista, aiuto): stanno nel registro di src/azioni.ts come tutti gli altri, così
  // hanno un tasto solo, compaiono nella ricerca (Ctrl+K) e nella finestra dei tasti
  const cambiaPagina = (pg: Pagina) => pagina(radice.dataset.pagina === pg ? 'montaggio' : pg);
  for (const a of [
    { id: 'importa', nome: 'Importa video, audio, immagini…', gruppo: 'File', tasti: ['Ctrl+I'], fn: () => void importaDialogo() },
    { id: 'salva', nome: 'Salva il progetto', gruppo: 'File', tasti: ['Ctrl+S'], fn: () => void salva() },
    { id: 'salvaCome', nome: 'Salva come…', gruppo: 'File', tasti: ['Ctrl+Shift+S'], fn: () => void salva(true) },
    { id: 'apri', nome: 'Apri un progetto…', gruppo: 'File', tasti: ['Ctrl+O'], fn: () => { home.nascondi(); void apri(); } },
    { id: 'nuovo', nome: 'Nuovo progetto', gruppo: 'File', tasti: ['Ctrl+N'], fn: () => void nuovo() },
    { id: 'progetti', nome: 'Pagina iniziale (i progetti recenti)', gruppo: 'File', fn: () => home.mostra() },
    { id: 'pacchetto', nome: 'Salva il pacchetto .daprod (con tutti i file)…', gruppo: 'File', info: 'Il progetto e tutti i suoi file in un file solo, da aprire identico su un altro computer.', fn: () => void salvaPacchetto() },
    { id: 'ricollega', nome: 'Ricollega i file mancanti…', gruppo: 'File', fn: () => void ricollega() },
    { id: 'esporta', nome: 'Esporta il video (master)…', gruppo: 'File', tasti: ['Ctrl+M'], info: 'MP4, MOV, WebM o WAV; tutto il montaggio o solo fra attacco e stacco.', fn: () => finestraEsporta() },
    { id: 'esportaEdl', nome: 'Esporta la EDL (CMX3600)…', gruppo: 'File', fn: () => esportaEdl() },
    { id: 'esportaFotogramma', nome: 'Esporta il fotogramma in PNG', gruppo: 'File', fn: () => esportaFotogramma() },
    { id: 'impostazioniProgetto', nome: 'Impostazioni del progetto (misura, fotogrammi)…', gruppo: 'File', fn: () => finestraProgetto() },
    { id: 'demo', nome: 'Montaggio dimostrativo', gruppo: 'File', info: 'Un piccolo montaggio di prova, per vedere come funziona.', fn: () => montaggioDimostrativo() },
    { id: 'paginaFinale', nome: 'Pagina Finale ↔ Montaggio', gruppo: 'Pagine', tasti: ['F9'], fn: () => cambiaPagina('finale') },
    { id: 'paginaLive', nome: 'Pagina LIVE (registra lo schermo)', gruppo: 'Pagine', tasti: ['F10'], fn: () => cambiaPagina('live') },
    { id: 'paginaMontage', nome: 'DaProdMontage (montaggio automatico)', gruppo: 'Pagine', tasti: ['F8'], fn: () => cambiaPagina('montage') },
    { id: 'vistaStretta', nome: 'Timeline stretta ↔ larga (proprietà fino in fondo)', gruppo: 'Vista', tasti: ['V'], fn: () => vistaStretta() },
    { id: 'zoneSicure', nome: 'Zone di sicurezza sul monitor', gruppo: 'Vista', tasti: ['G'], fn: () => { modi.zoneSicure = !modi.zoneSicure; monitor.disegnaSopra(); } },
    { id: 'zoomPiu', nome: 'Zoom avanti sulla timeline', gruppo: 'Vista', tasti: ['+'], fn: () => tl.zoom(1.5) },
    { id: 'zoomMeno', nome: 'Zoom indietro sulla timeline', gruppo: 'Vista', tasti: ['-'], fn: () => tl.zoom(1 / 1.5) },
    { id: 'adatta', nome: 'Tutto il montaggio nella finestra', gruppo: 'Vista', tasti: ['\\'], fn: () => tl.adattaTutto() },
    { id: 'schermoIntero', nome: 'Finestra a schermo intero', gruppo: 'Vista', tasti: ['F11'], fn: () => void schermoIntero() },
    { id: 'guida', nome: 'Come si fa (la guida)', gruppo: 'Aiuto', tasti: ['F1'], info: 'I lavori principali in pochi passi, col pulsante che porta dove si fa.', fn: () => finestraGuida() },
    { id: 'cerca', nome: 'Cerca un comando', gruppo: 'Aiuto', tasti: ['Ctrl+K'], info: 'Scrivi cosa vuoi fare: comandi, effetti, transizioni, titoli, AI e guide.', fn: () => apriCerca() },
    { id: 'tasti', nome: 'Tutti i tasti della centralina', gruppo: 'Aiuto', fn: () => finestraTasti() },
    { id: 'centroAI', nome: 'Centro AI (tutte le funzioni intelligenti)', gruppo: 'AI', info: 'Sottotitoli, traduzione, voce, sfondo, segui un oggetto, montaggio automatico: cosa fanno e come si usano.', fn: () => finestraCentroAI() },
    { id: 'controllaAI', nome: 'Controlla l\'AI (se qualcosa non va)', gruppo: 'AI', fn: () => finestraCentroAI(true) },
  ]) registra(a);
  // la grandezza dell'interfaccia nell'app, un gradino alla volta (Ctrl 0 torna al 100%); nel browser fa il browser
  const zoomApp: Record<string, () => void> = isTauri ? {
    'ctrl++': () => void impostaGrandezzaUI(GRANDEZZE_UI.find((k) => k > grandezzaUI() + 0.01) ?? grandezzaUI()),
    'ctrl+=': () => void impostaGrandezzaUI(GRANDEZZE_UI.find((k) => k > grandezzaUI() + 0.01) ?? grandezzaUI()),
    'ctrl+-': () => void impostaGrandezzaUI([...GRANDEZZE_UI].reverse().find((k) => k < grandezzaUI() - 0.01) ?? grandezzaUI()),
    'ctrl+0': () => void impostaGrandezzaUI(1),
  } : {};
  // Ctrl + e Ctrl − con il puntatore sulla timeline (o la timeline in primo piano) fanno lo zoom DELLA TIMELINE, non dell'interfaccia
  const suTimeline = () => tl.el.matches(':hover') || tl.el.contains(document.activeElement);
  const zoomTimeline: Record<string, () => void> = {
    'ctrl++': () => tl.zoom(1.5), 'ctrl+=': () => tl.zoom(1.5), 'ctrl+-': () => tl.zoom(1 / 1.5), 'ctrl+_': () => tl.zoom(1 / 1.5), 'ctrl+0': () => tl.adattaTutto(),
  };
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (document.querySelector('.velo')) return;
    const k = [(e.ctrlKey || e.metaKey) ? 'ctrl' : '', e.key.toLowerCase()].filter(Boolean).join('+');
    const fn = (suTimeline() ? zoomTimeline[k] : undefined) ?? (zoomApp[k] as (() => void) | undefined);
    if (!fn) return;
    e.preventDefault();
    fn();
  });
  // Ctrl + rotella e il pizzico sul trackpad non zoomano mai la pagina intera: sulla timeline (anche sulle sue barre e sui suoi
  // bottoni) fanno lo zoom della timeline, altrove non fanno niente
  addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!e.defaultPrevented && tl.el.contains(e.target as Node)) tl.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18);
    e.preventDefault();
  }, { passive: false });
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(g, (e) => e.preventDefault(), { passive: false });
  const sveglia = () => banco.sveglia();
  addEventListener('pointerdown', sveglia, { once: true });
  addEventListener('keydown', sveglia, { once: true });

  // file dal sistema lasciati cadere ovunque
  addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => { if (e.dataTransfer?.files.length) { e.preventDefault(); void importaDaDrop(e.dataTransfer); } });
  if (isTauri && !isAndroid) {
    // nell'app il sistema consegna i percorsi veri: così il progetto li ritrova alla prossima apertura
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((ev) => {
      if (ev.payload.type === 'drop') void importaFile(ev.payload.paths.map((p) => ({ name: p.split(/[\\/]/).pop() || p, path: p })));
    })).catch(() => {});
  }

  document.addEventListener('dpv:demo', () => montaggioDimostrativo());
  document.addEventListener('dpv:cerca', () => apriCerca());
  document.addEventListener('dpv:guida', (e) => finestraGuida((e as CustomEvent).detail as string | undefined));
  document.addEventListener('dpv:tasti', () => finestraTasti());
  document.addEventListener('dpv:centro-ai', () => finestraCentroAI());
  document.addEventListener('dpv:finale', (e) => { pagina('finale'); finale.mostra((e as CustomEvent).detail as Parameters<Finale['mostra']>[0]); });
  document.addEventListener('dpv:sottotitoli', () => { pagina('finale'); finale.mostra('sottotitoli'); });
  document.addEventListener('dpv:pagina', (e) => pagina((e as CustomEvent).detail as Pagina));
  document.addEventListener('dpv:adatta', () => tl.adattaTutto());
  document.addEventListener('dpv:mancano', () => avviso('Alcuni file vanno ricollegati: File → Ricollega media', 'info', 6000));

  // autosalvataggio ogni 15 secondi e quando la finestra si chiude o si nasconde
  setInterval(() => void autosalva(), 15000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void autosalva(); });
  addEventListener('beforeunload', (e) => {
    void autosalva();
    if (store.dirty && store.doc.clips.length && !isTauri) { e.preventDefault(); }
  });

  // messaggi nella barra di stato per le azioni
  store.on('sel', () => {
    const n = store.sel.size;
    if (n) msg.textContent = `${n} clip scelt${n === 1 ? 'a' : 'e'} · 2 elimina · 3 elimina e chiudi · S separa/unisci · fx in fondo alla clip = effetti · trascina per spostare (non copre niente)`;
  });

  novitaDopoAggiornamento();
  // aperta col doppio clic su un progetto (.daprod o .dpv): si apre quello; se no si riprende da dove eri
  const daFile = isTauri ? invoke<string | null>('file_di_avvio').catch(() => null) : Promise.resolve(null);
  void daFile.then(async (f) => {
    if (f) { await apriFile({ path: f }); setTimeout(() => tl.adattaTutto(), 200); return; }
    if (await riprendi()) setTimeout(() => tl.adattaTutto(), 200);
    // all'apertura si parte dai progetti (non nelle prove automatiche: lì il banco deve essere subito libero)
    if (!navigator.webdriver) home.mostra();
  });
  // sul Mac, doppio clic su un progetto con l'app già aperta
  if (isTauri) void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('apri-file', (e) => { void invoke<string | null>('file_di_avvio'); void apriFile({ path: e.payload }); })).catch(() => {});
  setTimeout(() => { monitor.adatta(); tl.adattaTutto(); }, 60);
  return { tl, monitor, finale, live, montage, bin, isp };
}
