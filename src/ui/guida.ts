// La guida "Come si fa": i lavori principali spiegati in pochi passi, ognuno col suo pulsante "Fallo adesso" che porta
// dritto al punto giusto del programma (la pagina, la sezione delle proprietà, il comando). Si apre con F1, dal menu
// Aiuto, dalla pagina iniziale, e ogni argomento compare anche nella ricerca dei comandi (Ctrl+K).
// I passi usano due segni: **grassetto** e `tasto`.
import { esegui } from '../azioni';
import { dialogo, h } from './dom';

export interface Argomento {
  id: string;
  titolo: string;
  icona: string;
  /** una riga: a cosa serve */
  riassunto: string;
  /** parole in più per la ricerca */
  parole: string;
  passi: string[];
  /** il pulsante "Fallo adesso" (porta al posto giusto) */
  vai?: { nome: string; fn: () => void };
  gruppo: 'Primi passi' | 'Montaggio' | 'Effetti e titoli' | 'Audio' | 'AI' | 'Finale ed export' | 'Altro';
}

const evento = (nome: string, detail?: unknown) => document.dispatchEvent(new CustomEvent(nome, { detail }));
/** apre una pagina (montaggio, finale, live, montage) */
export const vaiPagina = (p: string) => evento('dpv:pagina', p);
/** apre una sezione del Finale */
export const vaiFinale = (s: string) => evento('dpv:finale', s);
/** apre (ed evidenzia) una sezione del pannello Proprietà della clip scelta */
export const vaiSezione = (s: string) => evento('dpv:sezione', s);

export const ARGOMENTI: Argomento[] = [
  {
    id: 'inizio', gruppo: 'Primi passi', icona: '🚀', titolo: 'Il primo montaggio in un minuto',
    riassunto: 'importa, metti in timeline, taglia, esporta', parole: 'inizio primi passi tutorial comincia nuovo importa',
    passi: [
      '**Importa** i tuoi video: pulsante *Importa* in alto, `Ctrl+I`, o trascinali dentro la finestra.',
      '**Trascina** un file dal contenitore (a sinistra) alla timeline (in basso). Niente viene mai coperto: se lì è occupato va su un\'altra traccia.',
      'Premi `Spazio` per guardarlo. La **rotella** va avanti e indietro di un fotogramma, col suono.',
      'Sul punto giusto premi `1`: **taglio**. Il pezzo più corto è già scelto: `2` e sparisce.',
      'Quando ti piace, **Esporta** (pulsante giallo in alto, `Ctrl+M`).',
    ],
    vai: { nome: 'Importa i file', fn: () => esegui('importa') },
  },
  {
    id: 'cerca', gruppo: 'Primi passi', icona: '🔍', titolo: 'Trovare qualunque comando',
    riassunto: 'Ctrl+K: scrivi cosa vuoi fare', parole: 'cerca comandi palette trova dove sta come si fa',
    passi: [
      'Premi `Ctrl+K` (o il pulsante **🔍 Cerca** in alto) e scrivi quello che vuoi fare: "sottotitoli", "rallenta", "sfondo", "dissolvenza", "titolo"…',
      'Le frecce scelgono, `Invio` lo fa. Trovi i comandi, gli effetti, le transizioni, i titoli, le animazioni, le funzioni AI e queste guide.',
      'Accanto a ogni comando c\'è il suo tasto: la prossima volta puoi premere quello.',
    ],
    vai: { nome: 'Apri la ricerca', fn: () => evento('dpv:cerca') },
  },
  {
    id: 'tagliare', gruppo: 'Montaggio', icona: '✂', titolo: 'Tagliare e togliere i pezzi',
    riassunto: '1 taglia, 2 elimina, Q/W via lo scarto', parole: 'taglia elimina cancella scarto ripple buco split',
    passi: [
      '`1` taglia sotto il cursore (solo le tracce accese, se ne hai accese: clic sul nome della traccia).',
      '`2` elimina la clip scelta lasciando il buco; `3` la elimina e **chiude il buco**.',
      '`Q` toglie tutto quello che sta **a sinistra** del cursore nella clip, `W` quello **a destra**.',
      '`R` accende il **ripple**: eliminando e accorciando, il resto scorre indietro da solo.',
      '`Ctrl+Z` annulla (fino a 200 passi).',
    ],
  },
  {
    id: 'spostare', gruppo: 'Montaggio', icona: '↔', titolo: 'Spostare, allungare e accorciare',
    riassunto: 'trascina, tira i bordi, roll e slip', parole: 'sposta trim bordo allunga accorcia roll slip traccia',
    passi: [
      '**Trascina** la clip: si ferma contro le vicine, non copre niente. Anche su un\'altra traccia.',
      'Tira i **bordi** per accorciarla o allungarla; con `Ctrl` il resto scorre (trim ripple).',
      '`Shift` sul taglio fra due clip sposta il taglio (roll); `Alt` cambia il pezzo di ripresa senza muovere la clip (slip).',
      '`Alt+Shift`+trascina sposta la clip **e tutto quello che viene dopo**, su tutte le tracce.',
      '`S` separa l\'audio dal video (o unisce più clip in un gruppo).',
    ],
  },
  {
    id: 'transizioni', gruppo: 'Effetti e titoli', icona: '✦', titolo: 'Mettere una transizione',
    riassunto: 'dissolvenza, tendina, spinta, cubo…', parole: 'transizione dissolvenza incrociata tendina passaggio nero cubo spinta zoom',
    passi: [
      'Porta il cursore vicino a un taglio e premi `5` (dissolvenza), `6` (tendina) o `7` (passaggio al nero).',
      'Per le altre: contenitore → **Transizioni**, passa il mouse per vederle sui tuoi fotogrammi e **trascinala** sul taglio.',
      'Il blocchetto sta sopra le clip: **tira i bordi** per farla più lunga (più lenta). Due transizioni sullo stesso taglio si sommano.',
      'Clic sul blocchetto: a destra la durata, il verso, la forza e il **suono** (spento di partenza: l\'altoparlante lo accende).',
    ],
    vai: { nome: 'Dissolvenza sul taglio più vicino', fn: () => esegui('dissolvenza') },
  },
  {
    id: 'effetti', gruppo: 'Effetti e titoli', icona: '⚡', titolo: 'Effetti: sulla clip o a tempo',
    riassunto: 'Vivace, Cinema, B/N… oppure lampo, scossa, zoom', parole: 'effetto colore look vivace cinema bianco nero lampo scossa glitch zoom',
    passi: [
      '**Sulla clip** (valgono per tutta la clip): sceglila e nelle **Proprietà → Effetti al volo** accendi Vivace, Caldo, Cinema, Pellicola, B/N… Si sommano.',
      '**A tempo** (un momento preciso): contenitore → **Effetti**, trascina lampo, scossa, zoom colpo, glitch, bagliore… sopra la clip.',
      'Il blocchetto si mette da solo all\'inizio, alla fine o sul taglio; tiralo dai bordi per la durata.',
      'Bolla, vortice e zoom hanno un **mirino** sul monitor: mettilo dove vuoi.',
    ],
    vai: { nome: 'Apri gli effetti della clip', fn: () => vaiSezione('fxv') },
  },
  {
    id: 'titoli', gruppo: 'Effetti e titoli', icona: '🅣', titolo: 'Scrivere un titolo o un sottopancia',
    riassunto: 'titoli pronti e 49 animazioni', parole: 'titolo testo scritta sottopancia nome lower third animazione',
    passi: [
      '`T` mette un titolo al cursore. Scrivi il testo nelle **Proprietà → Titolatrice** (font, colore, ombra, entrata e uscita).',
      'Pronti: contenitore → **Titoli** (cinema, neon, macchina da scrivere, rullo dei crediti…).',
      'Animati: contenitore → **Animazioni** (sottopancia, social, grafici, cerimonie): trascinali e cambia nomi e colori a destra.',
      'Sul monitor puoi **spostarlo e ingrandirlo** col mouse.',
    ],
    vai: { nome: 'Titolo al cursore', fn: () => esegui('genTitolo') },
  },
  {
    id: 'movimento', gruppo: 'Effetti e titoli', icona: '↝', titolo: 'Muovere un\'immagine (Ken Burns, zoom, PiP)',
    riassunto: 'sposta e ingrandisci sul monitor, movimento con le tappe', parole: 'movimento ken burns zoom posizione sposta ingrandisci pip riquadro angoli ombra',
    passi: [
      'Clic sull\'immagine del **monitor**: scegli la clip. Trascina per spostarla, tira un angolo per ingrandirla, il pallino la gira.',
      '**↝ Movimento** (sul monitor): una posizione all\'inizio e una alla fine, e la clip ci passa dentro piano. **＋** aggiunge tappe.',
      'Nelle **Proprietà → Avanzate** ci sono i movimenti pronti, gli **angoli tondi** e l\'**ombra** (per il riquadro picture-in-picture).',
    ],
    vai: { nome: 'Apri posizione e movimento', fn: () => vaiSezione('avanzate') },
  },
  {
    id: 'velocita', gruppo: 'Montaggio', icona: '⏩', titolo: 'Accelerare o rallentare',
    riassunto: 'Alt+E: velocità, voce naturale, movimento fluido', parole: 'velocità rallenta accelera slow motion ralenti veloce',
    passi: [
      'Scegli la clip e premi `Alt+E` (o tasto destro → Velocità).',
      'Scegli ×2, ×0,5… o scrivi il valore. La voce resta naturale (a meno che tu voglia l\'effetto nastro).',
      'Rallentando molto, **Movimento fluido** ricostruisce i fotogrammi che mancano.',
    ],
    vai: { nome: 'Velocità della clip scelta', fn: () => esegui('velocita') },
  },
  {
    id: 'audio', gruppo: 'Audio', icona: '🔊', titolo: 'Volume, musica e dissolvenze audio',
    riassunto: 'linea gialla, quadratini, livella, mixer', parole: 'volume audio musica dissolvenza fade in out abbassa livella mixer',
    passi: [
      'La **linea gialla** sulle clip audio è il volume: trascinala, doppio clic per un punto, tasto destro → *Abbassa qui*.',
      'I **quadratini in alto** agli angoli della clip sono le dissolvenze: tirali verso l\'interno, poi piega la linea per la forma.',
      'Finale → **Audio**: *Livella* porta tutte le clip a un volume comodo; il limitatore evita che distorca.',
      'Il **Mixer** (pannello a destra) ha volume, panorama, muto e solo per ogni traccia.',
    ],
    vai: { nome: 'Apri l\'audio finale', fn: () => vaiFinale('audio') },
  },
  {
    id: 'sottotitoli', gruppo: 'AI', icona: '💬', titolo: 'Sottotitoli scritti dall\'AI',
    riassunto: 'ascolta i dialoghi e scrive le righe coi tempi', parole: 'sottotitoli srt trascrizione whisper nemotron parlato dialoghi ai',
    passi: [
      'Metti in timeline i video **con l\'audio** dei dialoghi.',
      'Finale → **Sottotitoli** → scegli in che lingua si parla e premi **✨ Scrivi i sottotitoli con l\'AI**.',
      'La prima volta il modello si scarica (serve internet), poi resta sul computer. Nell\'app usa il motore NVIDIA, e se non parte passa da solo a Whisper.',
      'Correggi le righe nella lista; nella timeline stanno nella riga **SOTT**. Esporta il .srt dal Finale.',
    ],
    vai: { nome: 'Apri i sottotitoli', fn: () => vaiFinale('sottotitoli') },
  },
  {
    id: 'lingue', gruppo: 'AI', icona: '🌍', titolo: 'Tradurre i sottotitoli e farli parlare',
    riassunto: 'traduzione e voce AI (doppiaggio)', parole: 'traduci traduzione lingua inglese voce doppiaggio parla tts magpie',
    passi: [
      'Servono i sottotitoli (scritti a mano o dall\'AI).',
      'Finale → **Voce e lingue** → *Traduci i sottotitoli*: scegli la lingua, le righe restano ai loro tempi.',
      '*Fai parlare i sottotitoli*: una voce AI legge le righe (solo nell\'app, col motore NVIDIA). Ogni frase diventa una clip nella traccia "Voce AI".',
    ],
    vai: { nome: 'Apri voce e lingue', fn: () => vaiFinale('lingue') },
  },
  {
    id: 'sfondo', gruppo: 'AI', icona: '🪄', titolo: 'Togliere lo sfondo (green screen o AI)',
    riassunto: 'colore, contagocce, o l\'AI senza fondale', parole: 'sfondo green screen chroma key scontorna ritaglia persona soggetto oggetto ai',
    passi: [
      'Scegli la clip nella timeline.',
      '**Proprietà → Togli lo sfondo**: *Colore* per il green screen (contagocce, fino a 3 colori), oppure *AI · automatico*: toglie lo sfondo da solo, senza fondale. Se ha tenuto la cosa sbagliata clicchi su quello che vuoi tenere (una persona o un oggetto) e lo segue per tutta la clip. Modello, precisione e bordo stanno in *Avanzate*.',
      'Non devi premere altro: scelta l\'AI parte da sola, e dopo l\'ultimo clic rifà il lavoro su tutta la clip. La prima volta il modello si scarica, poi lavora sul tuo computer.',
      'Il tasto **SFONDO** sul monitor mostra la maschera o gli scacchi per controllare.',
    ],
    vai: { nome: 'Apri "Togli lo sfondo"', fn: () => vaiSezione('sfondo') },
  },
  {
    id: 'segui', gruppo: 'AI', icona: '🎯', titolo: 'Seguire un oggetto (tracking) e stabilizzare',
    riassunto: 'un titolo o un effetto che insegue qualcosa', parole: 'tracking segui insegui oggetto stabilizza mirino',
    passi: [
      'Scegli la ripresa e nelle **Proprietà → Segui un oggetto** premi 🎯, poi clicca l\'oggetto sul monitor.',
      'Il programma lo segue in tutta la clip. Un titolo, un\'immagine o un effetto possono **seguirlo** (scegli "segue" nelle loro proprietà).',
      '**Stabilizza** tiene ferma la ripresa sull\'oggetto.',
    ],
    vai: { nome: 'Apri "Segui un oggetto"', fn: () => vaiSezione('segui') },
  },
  {
    id: 'montage', gruppo: 'AI', icona: '✨', titolo: 'Il montaggio automatico (DaProdMontage)',
    riassunto: 'foto e video alla rinfusa → un montaggio a tempo di musica', parole: 'montage automatico foto slideshow matrimonio compleanno viaggio reel musica battiti',
    passi: [
      'Premi `F8` (o MONTAGE in alto) e butta dentro foto e video, anche disordinati.',
      'Scegli cosa festeggi (28 stili), quanto deve durare e il brano.',
      '**✨ Crea il montaggio**: lo vedi nel monitor. **🎲 Rigenera** per un\'altra versione, **✅ Importa** per tenerlo e ritoccarlo.',
    ],
    vai: { nome: 'Apri DaProdMontage', fn: () => vaiPagina('montage') },
  },
  {
    id: 'colore', gruppo: 'Finale ed export', icona: '🎨', titolo: 'Il colore di tutto il montaggio',
    riassunto: 'colore automatico, look, prima/dopo', parole: 'colore look correzione luce contrasto saturazione temperatura automatico grading',
    passi: [
      '`F9` apre la pagina **Finale** → **Colore**.',
      'Il **colore automatico** sistema livelli e bianco di ogni ripresa; i **look** (Cinema, Caldo, Vintage…) danno il tono a tutto.',
      'Luce, contrasto, saturazione, temperatura, vignetta e grana valgono per tutto il montaggio. Il monitor ha il **prima | dopo**.',
    ],
    vai: { nome: 'Apri il colore finale', fn: () => vaiFinale('colore') },
  },
  {
    id: 'esporta', gruppo: 'Finale ed export', icona: '📤', titolo: 'Esportare il video',
    riassunto: 'MP4, MOV, WebM, WAV, EDL, fotogramma', parole: 'esporta salva video mp4 render master youtube instagram',
    passi: [
      '`Ctrl+M` (o **Esporta** in alto): nome, formato (MP4 va ovunque), dimensione e qualità.',
      'Con attacco e stacco segnati (`I`, `O`) puoi esportare solo quel pezzo.',
      'La finestra resta aperta mentre lavora: **Annulla** ferma. Alla fine **Fatto**.',
    ],
    vai: { nome: 'Esporta adesso', fn: () => esegui('esporta') },
  },
  {
    id: 'progetti', gruppo: 'Finale ed export', icona: '💾', titolo: 'Salvare e portare il progetto altrove',
    riassunto: '.dpv leggero o pacchetto .daprod con tutti i file', parole: 'salva progetto apri recenti pacchetto daprod dpv sposta altro computer',
    passi: [
      '`Ctrl+S` salva il progetto (.dpv): leggero, i file restano dove sono. Ogni 15 secondi c\'è anche l\'autosalvataggio.',
      'File → **Salva il pacchetto .daprod**: il progetto con dentro tutti i suoi file, da aprire identico su un altro computer.',
      'Il tasto **Progetti** in alto mostra i recenti con la miniatura.',
    ],
    vai: { nome: 'Salva', fn: () => esegui('salva') },
  },
  {
    id: 'live', gruppo: 'Altro', icona: '⏺', titolo: 'Registrare lo schermo (LIVE)',
    riassunto: 'schermo, microfono e webcam a bolla', parole: 'registra schermo live tutorial webcam microfono presentazione',
    passi: [
      '`F10` apre **LIVE**: scegli schermo, microfono e (se vuoi) la webcam.',
      '`R` registra (col 3-2-1), `Spazio` pausa, `M` mette un segno, `F` ferma.',
      'La registrazione finisce nel contenitore e in fondo alla timeline, con la webcam a bolla sopra.',
    ],
    vai: { nome: 'Apri LIVE', fn: () => vaiPagina('live') },
  },
  {
    id: 'timeline', gruppo: 'Altro', icona: '🗂', titolo: 'Più timeline nello stesso progetto',
    riassunto: 'versione lunga, trailer, verticale…', parole: 'timeline sequenza scheda copia versione trailer verticale',
    passi: [
      'Sopra la timeline ci sono le **schede**: il **+** fa una timeline nuova o una copia di quella aperta.',
      'Doppio clic su una scheda per rinominarla. I file del contenitore valgono per tutte.',
    ],
  },
  {
    id: 'problemi-ai', gruppo: 'AI', icona: '🩺', titolo: 'Se un\'AI non parte',
    riassunto: 'Controlla l\'AI e le soluzioni più comuni', parole: 'errore ai non funziona problema modello scarica internet scheda video memoria diagnostica',
    passi: [
      'Apri il **Centro AI** (menu AI) e premi **🔍 Controlla l\'AI**: ti dice se il motore parte, se Hugging Face si raggiunge e quali modelli hai già.',
      'La prima volta ogni modello si **scarica**: serve internet. Dopo va anche senza rete.',
      'Se la scheda video dà problemi, nel Centro AI spegni **Usa la scheda video**: si lavora col processore (più lento, ma sicuro).',
      'Memoria che non basta: scegli il modello più leggero nelle opzioni.',
    ],
    vai: { nome: 'Apri il Centro AI', fn: () => evento('dpv:centro-ai') },
  },
];

const GRUPPI: Argomento['gruppo'][] = ['Primi passi', 'Montaggio', 'Effetti e titoli', 'Audio', 'AI', 'Finale ed export', 'Altro'];

/** **grassetto** e `tasto` dentro un passo */
export function testoRicco(t: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push(t.slice(i, m.index));
    out.push(m[1] ? h('b', null, m[1]) : m[2] ? h('kbd', null, m[2]) : h('i', null, m[3]));
    i = m.index + m[0].length;
  }
  if (i < t.length) out.push(t.slice(i));
  return out;
}

/** la finestra della guida, aperta su un argomento (o sull'elenco) */
export function finestraGuida(id?: string) {
  const d = dialogo('Come si fa · la guida', { largo: true });
  d.el.classList.add('guida');
  const elenco = h('nav', { class: 'guida-elenco' });
  const corpo = h('div', { class: 'guida-corpo' });
  const mostra = (a: Argomento) => {
    elenco.querySelectorAll('.guida-voce').forEach((b) => b.classList.toggle('attiva', (b as HTMLElement).dataset.id === a.id));
    corpo.replaceChildren(
      h('h3', null, h('span', { class: 'guida-ic' }, a.icona), a.titolo),
      h('p', { class: 'guida-riassunto' }, a.riassunto),
      h('ol', { class: 'guida-passi' }, a.passi.map((p) => h('li', null, ...testoRicco(p)))),
    );
    if (a.vai) corpo.append(h('button', { class: 'btn primario guida-vai', 'data-id': a.id, on: { click: () => { d.chiudi(); evento('dpv:home-nascondi'); a.vai!.fn(); } } }, '▶ ', a.vai.nome));
  };
  for (const g of GRUPPI) {
    const qui = ARGOMENTI.filter((a) => a.gruppo === g);
    if (!qui.length) continue;
    elenco.append(h('h5', null, g), ...qui.map((a) => h('button', { class: 'guida-voce', 'data-id': a.id, on: { click: () => mostra(a) } }, h('span', { class: 'guida-ic' }, a.icona), a.titolo)));
  }
  d.corpo.append(h('div', { class: 'guida-dentro' }, elenco, corpo));
  mostra(ARGOMENTI.find((a) => a.id === id) ?? ARGOMENTI[0]);
  d.piede.append(
    h('button', { class: 'btn', on: { click: () => { d.chiudi(); evento('dpv:tasti'); } } }, '⌨ Tutti i tasti'),
    h('button', { class: 'btn', on: { click: () => { d.chiudi(); evento('dpv:cerca'); } } }, '🔍 Cerca un comando (Ctrl+K)'),
    h('span', { class: 'spazio' }),
    h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'Chiudi'));
}
