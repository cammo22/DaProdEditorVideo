// I menu della testata (File, Modifica, Montaggio, Generatori, AI, Vista, Aiuto). Le voci prendono nome e tasto dal
// registro dei comandi (src/azioni.ts) quando ci sono; quelle che toccano il banco (pagine, pannelli) passano dal
// contesto che app.ts consegna. La barra che le apre è in barraMenu.ts.
import { store } from '../core/store';
import { azioni, inserisciGeneratore, modi } from '../azioni';
import { animazioniDi, GRUPPI_LIBRERIA } from '../core/animazioni';
import { OBIETTIVI, formatoDa } from '../core/tipi';
import { avviso, type VoceMenu } from './dom';
import type { MenuBanco } from './barraMenu';
import type { Disposizione } from './disposizione';
import { finestraEsporta, finestraInfo, finestraProgetto, finestraTasti, esportaEdl, esportaFotogramma, VERSIONE } from './dialoghi';
import { apri, salvaPacchetto, importaDialogo, nuovo, ricollega, salva } from '../progetti';
import { isTauri, apriLink, schermoIntero, GRANDEZZE_UI, grandezzaUI, impostaGrandezzaUI } from '../platform';
import { finestraAggiornamenti, finestraNovita } from './aggiornamenti';
import { montaggioDimostrativo } from '../demo';
import { finestraGuida } from './guida';
import { finestraCentroAI, FUNZIONI_AI } from './centroAI';
import { modoProxy, impostaModoProxy, svuotaProxy } from '../media/proxy';
import { svuotaCache } from '../media/cache';

export type Pagina = 'montaggio' | 'finale' | 'live' | 'montage';

/** quello che i menu toccano del banco */
export interface ContestoMenu {
  radice: HTMLElement;
  pagina: (pg: Pagina) => void;
  home: { mostra: () => void };
  monitor: { pieno: () => void; disegnaSopra: () => void };
  tl: { adattaTutto: () => void; zoomVerticale: (k: number) => void };
  mostraLato: (s: 'clip' | 'mixer' | 'scopi') => void;
  vistaStretta: () => void;
  rimettiBanco: () => void;
  disp: Disposizione;
}

export function menuBanco(b: ContestoMenu): MenuBanco[] {
  const voce = (id: string, extra: Partial<VoceMenu> = {}): VoceMenu => {
    const a = azioni.get(id)!;
    return { nome: a.nome, tasto: a.tasti?.[0]?.replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('Space', 'Spazio'), fn: a.fn, ...extra };
  };
  return [
    ['File', () => [
      { nome: 'Pagina iniziale (progetti)', fn: () => b.home.mostra() },
      { sep: true },
      { nome: 'Nuovo progetto', tasto: 'Ctrl+N', sotto: [...OBIETTIVI.map((o) => ({ nome: `${o.nome} · ${o.info}`, fn: () => nuovo(formatoDa(o.ris, o.cad)) })), { sep: true }, ...[25, 30, 50].map((c) => ({ nome: `Full HD · ${c} fps`, fn: () => nuovo(formatoDa('fhd', String(c))) })), { sep: true }, { nome: 'Altre risoluzioni e fotogrammi…', fn: () => b.home.mostra() }] },
      { nome: 'Apri progetto…', tasto: 'Ctrl+O', fn: () => apri() },
      { nome: 'Salva', tasto: 'Ctrl+S', fn: () => salva() },
      { nome: 'Salva come…', tasto: 'Ctrl+Shift+S', fn: () => salva(true) },
      { nome: 'Salva il pacchetto .daprod (con tutti i file)…', fn: () => void salvaPacchetto() },
      { sep: true },
      { nome: 'Importa video, audio, immagini…', tasto: 'Ctrl+I', fn: () => importaDialogo() },
      { nome: 'Ricollega media mancanti…', fn: () => ricollega() },
      { nome: 'Montaggio dimostrativo', fn: () => montaggioDimostrativo() },
      { sep: true },
      { nome: 'Esporta il master…', tasto: 'Ctrl+M', fn: () => finestraEsporta() },
      { nome: 'Esporta EDL CMX3600…', fn: () => esportaEdl() },
      { nome: 'Esporta fotogramma PNG', fn: () => esportaFotogramma() },
      { sep: true },
      { nome: 'Impostazioni del progetto…', fn: () => finestraProgetto() },
    ]],
    ['Modifica', () => [
      voce('annulla', { nome: 'Annulla' + (store.canUndo() ? ': ' + store.undoLabel() : ''), disattiva: !store.canUndo() }),
      voce('ripeti', { nome: 'Ripeti' + (store.canRedo() ? ': ' + store.redoLabel() : ''), disattiva: !store.canRedo() }),
      { sep: true }, voce('tagliaAppunti'), voce('copia'), voce('incolla'), { sep: true }, voce('tutto'), voce('selezionaDopo'), voce('deseleziona'),
    ]],
    ['Montaggio', () => [
      voce('taglia'), voce('elimina'), voce('eliminaChiudi'), voce('separa'), { sep: true },
      voce('dissolvenza'), voce('tendina'), voce('passaggioNero'), voce('dissolviInOut'), { sep: true },
      voce('inserisci'), voce('sovrascrivi'), voce('solleva'), voce('estrai'), voce('rivedi'), voce('abbina'), voce('estendi'), { sep: true },
      voce('istantanea'), voce('fermoImmagine'), { sep: true },
      voce('modoInserisci', { spunta: modi.inserisci, nome: 'Modo inserisci' }), voce('ripple', { spunta: modi.ripple }), voce('snap', { spunta: modi.snap }), voce('elastico', { spunta: modi.elastico }),
      { sep: true }, voce('tracciaV'), voce('tracciaA'),
      { sep: true }, voce('audioTogliRumore'), voce('audioSeparaVoce'),
    ]],
    ['Generatori', () => [
      voce('genBarre'), voce('genCountdown'), voce('genNero'), voce('genColore'), voce('genTitolo'), { sep: true },
      { nome: 'Animazioni', sotto: GRUPPI_LIBRERIA.map((g) => ({ nome: g.nome, sotto: animazioniDi(g.id).map((a) => ({ nome: a.nome, fn: () => { inserisciGeneratore('anim', undefined, undefined, { anim: a.id }); avviso(`${a.nome} al cursore`, 'ok', 1200); } })) })) },
      voce('genAnimazione'),
    ]],
    ['Sottotitoli', () => [
      voce('sottGenera'), voce('sottNuova'), voce('sottModifica'), { sep: true },
      voce('sottDividi'), voce('sottUnisci'), voce('sottElimina'), { sep: true },
      voce('sottPrec'), voce('sottSucc'), voce('sottInizia'), voce('sottFinisci'), { sep: true },
      voce('sottMostra'), voce('sottStile'), { sep: true },
      voce('sottSrt'), voce('sottVtt'), voce('sottImporta'), { sep: true },
      voce('sottParla'),
    ]],
    ['AI', () => [
      { nome: 'Centro AI (tutte le funzioni, come si usano)…', fn: () => finestraCentroAI() },
      { sep: true },
      ...FUNZIONI_AI.map((f) => ({ nome: `${f.icona} ${f.nome}`, fn: f.apri })),
      { sep: true },
      { nome: '🔍 Controlla l\'AI (se qualcosa non va)', fn: () => finestraCentroAI(true) },
      { nome: 'Se un\'AI non parte (guida)', fn: () => finestraGuida('problemi-ai') },
    ]],
    ['Vista', () => [
      { nome: 'Pagina Montaggio', spunta: b.radice.dataset.pagina === 'montaggio', tasto: 'F9', fn: () => b.pagina('montaggio') },
      { nome: 'Pagina Finale (colore, audio, esporta)', spunta: b.radice.dataset.pagina === 'finale', tasto: 'F9', fn: () => b.pagina('finale') },
      { nome: 'Pagina LIVE (registra lo schermo)', spunta: b.radice.dataset.pagina === 'live', tasto: 'F10', fn: () => b.pagina('live') },
      { nome: 'Pagina DaProdMontage (il montaggio automatico)', spunta: b.radice.dataset.pagina === 'montage', tasto: 'F8', fn: () => b.pagina('montage') },
      { sep: true },
      { nome: 'Contenitore', spunta: !b.radice.classList.contains('senza-bin'), fn: () => b.disp.alterna('senza-bin') },
      { nome: 'Proprietà', spunta: !b.radice.classList.contains('senza-lato'), fn: () => b.disp.alterna('senza-lato') },
      { nome: 'Pulsantiera', spunta: !b.radice.classList.contains('senza-puls'), fn: () => b.disp.alterna('senza-puls') },
      { nome: 'Timeline stretta (proprietà e VU fino in fondo)', tasto: 'V', spunta: b.radice.classList.contains('lato-lungo'), fn: () => b.vistaStretta() },
      { nome: 'Rimetti il banco come all\'inizio', fn: () => b.rimettiBanco() },
      { sep: true },
      { nome: 'Monitor a schermo intero (con la timeline)', fn: () => b.monitor.pieno() },
      { nome: 'Zone di sicurezza', spunta: modi.zoneSicure, fn: () => { modi.zoneSicure = !modi.zoneSicure; b.monitor.disegnaSopra(); } },
      { nome: 'Tutto il montaggio nella finestra', tasto: '\\', fn: () => b.tl.adattaTutto() },
      { nome: 'Tracce più alte', tasto: 'Ctrl+Shift+rotella', fn: () => b.tl.zoomVerticale(1.25) },
      { nome: 'Tracce più basse', fn: () => b.tl.zoomVerticale(0.8) },
      isTauri
        ? { nome: 'Grandezza dell\'interfaccia', sotto: GRANDEZZE_UI.map((k) => ({ nome: Math.round(k * 100) + '%', tasto: k === 1 ? 'Ctrl+0' : '', spunta: Math.abs(grandezzaUI() - k) < 0.01, fn: () => void impostaGrandezzaUI(k) })) }
        : { nome: 'Grandezza dell\'interfaccia', tasto: 'Ctrl + / Ctrl −', fn: () => avviso('Nel browser: Ctrl + e Ctrl − ingrandiscono tutto (Ctrl 0 torna com\'era)', 'info', 3500) },
      { nome: 'Finestra a schermo intero', tasto: 'F11', fn: () => void schermoIntero() },
      { sep: true },
      { nome: 'Strumenti di misura', fn: () => { b.pagina('montaggio'); b.mostraLato('scopi'); } },
      { nome: 'Mixer', fn: () => { b.pagina('montaggio'); b.mostraLato('mixer'); } },
      { sep: true },
      { nome: 'Copie leggere per il monitor (proxy)', sotto: [
        // dalla 1.5.8 nessuna copia si fa da sola: la scelta dice solo per quali file si offre «Prepara copia leggera»
        { nome: 'Offrile per le riprese pesanti (consigliato)', spunta: modoProxy() === 'auto', fn: () => { impostaModoProxy('auto'); avviso('Copie leggere: si offrono per le riprese pesanti (le prepari tu, non partono da sole)', 'info'); } },
        { nome: 'Offrile per tutti i video', spunta: modoProxy() === 'sempre', fn: () => { impostaModoProxy('sempre'); avviso('Copie leggere: si offrono per tutti i video (le prepari tu, non partono da sole)', 'info'); } },
        { nome: 'Mai (il monitor legge gli originali)', spunta: modoProxy() === 'mai', fn: () => { impostaModoProxy('mai'); avviso('Copie leggere spente: il monitor legge gli originali', 'info'); } },
        { sep: true },
        { nome: 'Svuota le copie leggere (si rifanno a mano)', fn: async () => { await svuotaProxy(); avviso('Copie leggere tolte dal disco: per rifarle, «Prepara copia leggera»', 'ok', 2600); } },
      ] },
      { nome: 'Svuota la memoria delle misure (forme d\'onda, colore, locandine)', fn: async () => { await svuotaCache(); avviso('Memoria delle misure svuotata: si rifanno a mano quando servono', 'ok', 2600); } },
    ]],
    ['Aiuto', () => [
      { nome: 'Come si fa (la guida)', tasto: 'F1', fn: () => finestraGuida() },
      { nome: 'Tasti della centralina', fn: () => finestraTasti() },
      { nome: 'Centro AI…', fn: () => finestraCentroAI() },
      { sep: true },
      { nome: `Novità della ${VERSIONE}`, fn: () => finestraNovita() },
      ...(isTauri ? [{ nome: 'Aggiornamenti…', fn: () => void finestraAggiornamenti() }] : []),
      { nome: 'Scarica le app (Windows, Mac, Android)', fn: () => apriLink('https://github.com/cammo22/DaProdVideo/releases/latest') },
      { nome: 'Informazioni su DaProd Video', fn: () => finestraInfo() },
    ]],
  ];
}
