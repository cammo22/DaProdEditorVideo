// Cosa si trova con la ricerca dei comandi (Ctrl+K), oltre ai comandi di src/azioni.ts e alle funzioni del Centro AI:
// le pagine e le sezioni del Finale, le guide, e i cataloghi (transizioni, effetti a tempo, effetti sulla clip, titoli,
// animazioni, countdown). Ogni voce fa la cosa vera: la transizione va sul taglio più vicino, l'effetto sulla clip
// scelta, il titolo al cursore.
import { store } from '../core/store';
import { inserisciGeneratore, mettiBlocco } from '../azioni';
import { EFFETTI_TEMPO } from '../core/blocchi';
import { TENDINE, EFFETTI as TRANSIZIONI_DVE } from '../render/transizioni';
import { EFFETTI as EFFETTI_CLIP, adatte, alternaEffetto } from '../effetti';
import { PRESET_TITOLI } from '../core/generatori';
import { ANIM_LIBRERIA, GRUPPI_ANIM } from '../core/animazioni';
import { GRUPPI_HTML, MODELLI_HTML } from '../core/titoliHtml';
import { STILI_CONTO } from '../render/grafica';
import { avviso } from './dom';
import { fonteCerca, type VoceCerca } from './cerca';
import { ARGOMENTI, finestraGuida, vaiFinale, vaiPagina } from './guida';

const scelte = () => store.doc.clips.filter((c) => store.sel.has(c.id));

fonteCerca(() => [
  { id: 'pg:montaggio', titolo: 'Pagina Montaggio', sotto: 'contenitore, monitor, timeline', cat: 'Pagine', tasto: 'F9', parole: 'banco editing', fn: () => vaiPagina('montaggio') },
  { id: 'pg:finale', titolo: 'Pagina Finale', sotto: 'colore, audio, sottotitoli, logo, voce e lingue, esporta', cat: 'Pagine', tasto: 'F9', fn: () => vaiPagina('finale') },
  { id: 'pg:live', titolo: 'Pagina LIVE (registra lo schermo)', sotto: 'schermo, microfono e webcam', cat: 'Pagine', tasto: 'F10', parole: 'registra record screen tutorial', fn: () => vaiPagina('live') },
  { id: 'pg:montage', titolo: 'DaProdMontage (montaggio automatico)', sotto: 'foto e video alla rinfusa → un montaggio a tempo', cat: 'Pagine', tasto: 'F8', parole: 'automatico slideshow foto matrimonio', fn: () => vaiPagina('montage') },
  ...([
    ['colore', 'Colore di tutto il montaggio', 'colore automatico, look, luce, contrasto', 'look grading correzione'],
    ['audio', 'Audio finale e limitatore', 'volume finale, livella, limitatore', 'volume livella normalizza'],
    ['sottotitoli', 'Sottotitoli', 'scrivili a mano o con l\'AI, importa ed esporta .srt', 'srt caption'],
    ['logo', 'Logo sempre in vista', 'il tuo logo in un angolo', 'watermark marchio'],
    ['apertura', 'Apertura e chiusura', 'titoli, clip, dal nero e al nero all\'inizio e alla fine', 'intro outro'],
    ['lingue', 'Voce e lingue', 'traduci i sottotitoli e falli parlare', 'traduci voce doppiaggio'],
    ['esporta', 'Esporta (pagina Finale)', 'master, EDL, fotogramma', 'render mp4'],
  ] as const).map(([s, t, sotto, parole]): VoceCerca => ({ id: 'fin:' + s, titolo: t, sotto: 'Finale · ' + sotto, cat: 'Pagine', parole, fn: () => vaiFinale(s) })),
]);

// le guide "Come si fa"
fonteCerca(() => ARGOMENTI.map((a): VoceCerca => ({ id: 'guida:' + a.id, titolo: 'Come si fa: ' + a.titolo, sotto: a.riassunto, cat: 'Guida', parole: a.parole, fn: () => finestraGuida(a.id) })));

// le transizioni: sul taglio più vicino al cursore (come i tasti 5, 6, 7)
fonteCerca(() => [
  { id: 'tr:mix', titolo: 'Dissolvenza incrociata', sotto: 'sul taglio più vicino al cursore', cat: 'Transizioni' as const, tasto: '5', parole: 'fade mix', fn: () => { mettiBlocco('transizione', 'mix'); } },
  { id: 'tr:dip', titolo: 'Passaggio al nero', sotto: 'sul taglio più vicino al cursore', cat: 'Transizioni' as const, tasto: '7', parole: 'dip nero', fn: () => { mettiBlocco('transizione', 'dip'); } },
  ...TENDINE.map((m): VoceCerca => ({ id: 'tr:wipe:' + m.p, titolo: 'Tendina ' + m.nome.replace(/^\d+ · /, ''), sotto: m.info, cat: 'Transizioni', parole: 'tendina wipe smpte ' + m.p, fn: () => { mettiBlocco('transizione', 'wipe:' + m.p); } })),
  ...TRANSIZIONI_DVE.map((m): VoceCerca => ({ id: 'tr:dve:' + m.p, titolo: m.nome, sotto: m.info, cat: 'Transizioni', parole: 'dve digitale', fn: () => { mettiBlocco('transizione', 'dve:' + m.p); } })),
]);

// gli effetti a tempo: al cursore (sul bordo della clip se il cursore è lì vicino)
fonteCerca(() => EFFETTI_TEMPO.map((e): VoceCerca => ({ id: 'fx:' + e.id, titolo: e.nome, sotto: e.info + ' · al cursore', cat: 'Effetti a tempo', parole: 'effetto fx ' + e.gruppo, fn: () => { mettiBlocco('effetto', e.id); } })));

// gli effetti sulla clip (accendi/spegni sulla clip scelta)
fonteCerca(() => EFFETTI_CLIP.map((e): VoceCerca => ({
  id: 'fxc:' + e.id, titolo: e.nome, sotto: e.info + ' · sulla clip scelta', cat: 'Effetti sulla clip', parole: 'effetto filtro ' + e.per,
  manca: () => (adatte(e, scelte()).length ? null : `Scegli prima una clip ${e.per === 'video' ? 'video' : 'audio'} nella timeline`),
  fn: () => { const ids = adatte(e, scelte()).map((c) => c.id); const n = alternaEffetto(e.id, ids); if (n) avviso(`${e.nome}: fatto su ${n} clip`, 'tasto', 1400); },
})));

// i titoli pronti, le animazioni e i countdown: al cursore
fonteCerca(() => [
  ...PRESET_TITOLI.map((t): VoceCerca => ({ id: 'tit:' + t.id, titolo: 'Titolo ' + t.nome, sotto: 'al cursore', cat: 'Titoli', parole: 'titolo testo scritta ' + t.gruppo, fn: () => { inserisciGeneratore('title', undefined, undefined, { titolo: t.id }); } })),
  ...MODELLI_HTML.map((m): VoceCerca => ({ id: 'html:' + m.id, titolo: m.nome, sotto: `titolo animato HTML · ${GRUPPI_HTML.find((g) => g.id === m.gruppo)?.nome ?? ''} · al cursore`, cat: 'Titoli', parole: 'titolo animato html neon display sette segmenti terzo inferiore nome ruolo cinema notizie ticker capitolo logo iscriviti conto alla rovescia rec vumetro citazione virgolette karaoke sottotitolo macchina da scrivere didascalia social post freccia evidenziatore prima dopo diviso prezzo offerta sconto luogo data documentario intervista domanda titoli di coda scorrono barra capitoli fine schermo finale video', fn: () => { inserisciGeneratore('html', undefined, undefined, { html: m.id }); } })),
  ...ANIM_LIBRERIA.map((a): VoceCerca => ({ id: 'anim:' + a.id, titolo: a.nome, sotto: `animazione · ${GRUPPI_ANIM.find((g) => g.id === a.gruppo)?.nome ?? ''} · al cursore`, cat: 'Animazioni', parole: 'animazione sottopancia ' + a.gruppo, fn: () => { inserisciGeneratore('anim', undefined, undefined, { anim: a.id }); } })),
  ...STILI_CONTO.map((s): VoceCerca => ({ id: 'conto:' + s.id, titolo: 'Countdown ' + s.nome, sotto: `${s.secondi}…1 al cursore`, cat: 'Generatori', parole: 'conto alla rovescia countdown numeri', fn: () => { inserisciGeneratore('countdown', undefined, undefined, { conto: { stile: s.id, secondi: s.secondi } }); } })),
]);
