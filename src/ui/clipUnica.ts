// "Rendi clip unica" (tasto destro su clip scelte): tante clip in fila, con i loro tagli, video e audio, diventano UNA clip
// sola. Il pezzo di montaggio scelto si rende in un file nuovo (MP4 a qualità altissima, o WAV se è solo audio: lo stesso
// motore dell'export, con effetti, transizioni, volumi e dissolvenze dentro) e al posto delle clip ne resta una, col suo
// audio legato. Il file va nel contenitore, cartella "Clip uniche". Ctrl+Z rimette le clip di prima.
import { store } from '../core/store';
import type { Clip, MediaItem, Project } from '../core/tipi';
import * as M from '../core/montaggio';
import { MASTER0, end, isVideoClip, newClip, trackOf, uid } from '../core/progetto';
import { esporta } from '../export/esporta';
import { importa } from '../media/libreria';
import { nuova } from '../media/attivita';
import { conservaFileNelBrowser } from '../progetti';
import type { FileScelto } from '../platform';
import { avviso } from './dom';

const CARTELLA = 'Clip uniche';

/** si può? (almeno due clip, o una sola con dentro dei tagli fatti da altre: qui basta che ci sia qualcosa da rendere) */
export function puoRendereUnica(ids: Iterable<string>, p: Project = store.doc): string | null {
  const scelte = p.clips.filter((c) => [...ids].includes(c.id) && c.kind !== 'fx');
  if (!scelte.length) return 'Scegli prima le clip da unire';
  if (scelte.some((c) => trackOf(p, c.track)?.lock)) return 'Una traccia è bloccata';
  return null;
}

/** il montaggio da rendere: solo le clip scelte (e i blocchetti FX sulle loro tracce), niente logo, ritocco finale o sottotitoli */
export function progettoDelPezzo(p0: Project, ids: Set<string>): { p: Project; a: number; b: number; video: boolean; audio: boolean } {
  const p: Project = structuredClone(p0);
  const scelte = p.clips.filter((c) => ids.has(c.id) && c.kind !== 'fx');
  const a = Math.min(...scelte.map((c) => c.start)), b = Math.max(...scelte.map((c) => end(c)));
  const tracce = new Set(scelte.map((c) => c.track));
  p.clips = p.clips.filter((c) => ids.has(c.id) || (c.kind === 'fx' && tracce.has(c.track) && c.start < b && end(c) > a));
  p.master = { ...MASTER0 };
  delete p.sottotitoli;
  p.inF = a; p.outF = b;
  const video = scelte.some((c) => isVideoClip(c, p));
  const audio = scelte.some((c) => trackOf(p, c.track)?.kind === 'audio');
  return { p, a, b, video, audio };
}

export async function rendiClipUnica(scelte: Iterable<string>) {
  const p0 = store.doc;
  const ids = M.withLinked(p0, [...scelte]);
  const no = puoRendereUnica(ids, p0);
  if (no) { avviso(no, 'info', 2600); return; }
  const { p, a, b, video, audio } = progettoDelPezzo(p0, ids);
  const rev = store.revisione;
  const nome = `Clip unica ${new Date().toLocaleTimeString('it-IT').replace(/:/g, '.')}.${video ? 'mp4' : 'wav'}`;
  let stop = false;
  const lav = nuova({ titolo: 'Rendo la clip unica', categoria: 'esporta', alAnnulla: () => { stop = true; } });
  let file: FileScelto | null = null;
  try {
    await esporta(p, { formato: video ? 'mp4' : 'wav', w: p.w, h: p.h, qualita: 'altissima', soloInOut: true, nome, interna: { file: (f) => { file = f; } } },
      (x) => lav.imposta(x.totale ? x.fatti / x.totale : null, x.fase === 'video' ? `fotogramma ${x.fatti} di ${x.totale}` : x.fase), () => stop);
    if (stop || !file) { lav.annullata(); return; }
    const r = await importa(file);
    if ('errore' in r) throw new Error(r.errore);
    const f = file as FileScelto;
    if (f.file) conservaFileNelBrowser(r.item.id, f.file);
    if (store.revisione !== rev) { lav.errore('il montaggio è cambiato'); avviso('Il montaggio è cambiato mentre rendevo la clip: non l\'ho messa (il file è nel contenitore)', 'info', 5000); mettiNelContenitore(r.item); return; }
    store.edit('Rendi clip unica', (pp) => {
      const m = r.item;
      m.cartella = cartella(pp);
      pp.media.push(m);
      const vecchie = pp.clips.filter((c) => ids.has(c.id));
      // la traccia video più in alto fra quelle scelte, e la prima audio
      const ordine = (c: Clip) => pp.tracks.findIndex((t) => t.id === c.track);
      const tv = vecchie.filter((c) => isVideoClip(c, pp)).sort((x, y) => ordine(x) - ordine(y))[0]?.track;
      const ta = vecchie.filter((c) => trackOf(pp, c.track)?.kind === 'audio').sort((x, y) => ordine(x) - ordine(y))[0]?.track
        ?? pp.tracks.find((t) => t.kind === 'audio')?.id;
      // via le clip di prima e i blocchetti FX sopra di loro (sono già dentro il file)
      pp.clips = pp.clips.filter((c) => !ids.has(c.id) && !(c.kind === 'fx' && c.track === tv && c.start < b && end(c) > a));
      const link = video && audio ? uid('L') : undefined;
      const nomeClip = vecchie[0]?.name ? `${vecchie[0].name} (unica)` : 'Clip unica';
      if (video && tv) pp.clips.push(newClip('media', tv, a, b - a, { media: m.id, name: nomeClip, ...(link ? { link } : {}) }));
      if (audio && ta && m.hasAudio) pp.clips.push(newClip('media', ta, a, b - a, { media: m.id, name: nomeClip, ...(link ? { link } : {}) }));
    });
    lav.fine();
    avviso('🧩 Fatto: adesso è una clip sola (Ctrl+Z per tornare alle clip di prima)', 'ok', 3200);
  } catch (e) {
    lav.errore(e instanceof Error ? e.message : String(e));
    avviso('Non riesco a fare la clip unica: ' + (e instanceof Error ? e.message : String(e)), 'errore', 5000);
  }
}

function cartella(p: Project): string {
  const c = (p.cartelle ??= []).find((x) => x.nome === CARTELLA && !x.genitore);
  if (c) return c.id;
  const id = uid('d');
  p.cartelle.push({ id, nome: CARTELLA });
  return id;
}

function mettiNelContenitore(m: MediaItem) {
  store.edit('Clip unica nel contenitore', (pp) => { m.cartella = cartella(pp); pp.media.push(m); });
}
