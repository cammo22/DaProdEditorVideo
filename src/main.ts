// Punto d'ingresso del banco di montaggio.
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
// i caratteri delle animazioni (sottopancia, titoli da cerimonia…): solo il latino, ognuno si scarica quando serve
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-900.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/caveat/latin-700.css';
import './stile/editor.css';
import { avvia } from './ui/app';
import { h } from './ui/dom';
import { isTauri } from './platform';
import { preparaRiserva } from './media/riserva';
import { caricaFontAnimazioni } from './render/font';

const radice = document.getElementById('app')!;
let banco: ReturnType<typeof avvia> | null = null;

function nonSupportato(): string | null {
  if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined') return 'Questo browser non ha WebCodecs, il motore video di DaProd Video.';
  const c = document.createElement('canvas');
  if (!c.getContext('webgl2')) return 'Questo browser non ha WebGL2 (serve per mixare i livelli video).';
  return null;
}

const problema = nonSupportato();
if (problema) {
  radice.replaceWith(h('div', { class: 'non-supportato' },
    h('div', { class: 'avvio-targa' },
      h('span', { class: 'marchio-grande' }, 'Da', h('b', null, 'Prod'), ' Video'),
      h('p', null, problema),
      h('p', null, 'Usa Chrome, Edge, Brave, Opera (anche su Android) o Safari 26, oppure scarica l\'app per Windows, Mac o Android.'),
      h('a', { class: 'btn primario', href: 'https://github.com/cammo22/DaProdVideo/releases/latest' }, 'Scarica l\'app'))));
} else {
  // le barre colore all'accensione, come le macchine della sala
  const avvio = h('div', { class: 'avvio' }, h('div', { class: 'avvio-targa' }, h('span', { class: 'marchio-grande' }, 'Da', h('b', null, 'Prod'), ' Video'), h('small', null, '00:00:00:00')));
  document.body.appendChild(avvio);
  // nell'app, prima di aprire qualunque file, si accende (se serve) la decodifica audio di riserva in Rust
  await preparaRiserva().catch(() => []);
  banco = avvia(radice);
  // i caratteri delle animazioni arrivano in silenzio: quando ci sono, il monitor ridisegna
  void caricaFontAnimazioni().then(() => import('./motore').then((m) => m.motore.ridisegna()));
  setTimeout(() => { avvio.classList.add('via'); setTimeout(() => avvio.remove(), 500); }, isTauri ? 500 : 900);
}

// agganci per le prove automatiche (test/prove.mjs) e per chi curiosa dalla console
import * as M from './core/montaggio';
import * as TC from './core/timecode';
import * as P from './core/progetto';
import { esporta } from './export/esporta';
import { creaEdl } from './export/edl';
import { motore } from './motore';
import { guadagnoClip, mixaggio } from './media/audio';
import * as SU from './media/suoni';
import * as V from './media/voce';
import * as AG from './ui/aggiornamenti';
import * as LV from './ui/live';
import * as SQ from './core/sequenze';
import * as SOT from './core/sottotitoli';
import * as FE from './core/effettiClip';
import * as G from './render/grafica';
import { pianoVideo } from './render/piano';
import * as Z from './azioni';
import * as FT from './media/fotogrammi';
import { statoDecoder } from './media/fotogrammi';
import { ripresaDiProva, ripresaVfrDiProva, branoVbrDiProva } from './demo';
import * as NZ from './media/normalizza';
import * as PR from './progetti';
import * as TD from './media/traduci';
import { apriFile, importaFile } from './progetti';
import * as PK from './pacchetto';
import { mediaRT } from './media/libreria';
import * as B from './core/blocchi';
import * as S from './core/sottotitoli';
import * as PV from './render/provino';
import * as TR from './core/traccia';
import * as FL from './render/fluido';
import * as TK from './media/traccia';
import * as ST from './media/stira';
import { Compositore } from './render/compositore';
import * as NM from './media/nemo';
import * as DP from './media/doppiaggio';
import * as WV from './media/wav';
import * as LAV from './ui/lavoro';
import * as SF from './core/sfondo';
import * as MK from './media/maschere';
import * as RT from './media/ritaglio';
import * as CP from './media/campiona';
import * as USF from './ui/sfondo';
import * as AN from './core/animazioni';
import * as RA from './render/animazioni';
import { caricaFontAnimazioni as fontAnim } from './render/font';
import * as MT from './core/montage';
import * as MP from './core/montagePreset';
import * as EX from './media/exif';
import * as QL from './media/qualita';
import * as RI from './media/ritmo';
import * as AT from './media/attivita';
import * as CH from './media/cache';
import * as SM from './core/stima';
import * as DG from './media/diagnosiAI';
import * as EA from './media/erroriAI';
import * as HW from './media/hardware';
import * as AA from './media/audioAI';
import * as AAM from './media/modelliAudio';
import * as AAS from './core/separa';
import * as AAR from './core/rumore';
import * as AAC from './core/ricampiona';
import * as PX from './media/proxy';
import * as CU from './ui/clipUnica';
import * as SR from './ui/sottotitoliRapidi';
import * as CL from './media/clear';
(window as unknown as Record<string, unknown>).__dpvTest = { M, TC, P, esporta, creaEdl, motore, guadagnoClip, pianoVideo, Z, statoDecoder, ripresaDiProva, ripresaVfrDiProva, branoVbrDiProva, NZ, TD, PR, importaFile, apriFile, PK, proxyStato: (id: string) => mediaRT(id)?.proxyStato, mediaRT, B, S, SU, V, AG, LV, SQ, SOT, FE, G, mixaggio, PV, TR, TK, ST, Compositore, NM, DP, WV, LAV, SF, MK, RT, CP, USF, AN, RA, fontAnim, MT, MP, EX, QL, RI, AT, CH, SM, DG, EA, HW, FT, FL, ui: () => banco };
// l'audio con l'AI (togliere il rumore, separare voce e base): per le prove
Object.assign((window as unknown as { __dpvTest: object }).__dpvTest, { AA, AAM, AAS, AAR, AAC, PX, CU, SR, CL });
