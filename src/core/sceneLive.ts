import type { Clip, MediaItem, Project, Transform } from './tipi';
import { TF0 } from './progetto';
import { bolla, type Angolo } from './cornici';
import { valoreAnim } from './automazioni';

export const SCENE_LIVE = [
  { id: 'schermo', nome: 'Solo schermo', breve: 'Schermo' },
  { id: 'bolla', nome: 'Schermo + webcam in bolla', breve: 'Bolla' },
  { id: 'webcam-schermo', nome: 'Webcam grande + schermo piccolo', breve: 'Web + sch.' },
  { id: 'affiancati', nome: 'Affiancati 50/50', breve: '50 / 50' },
  { id: 'webcam', nome: 'Solo webcam', breve: 'Webcam' },
  { id: 'pausa', nome: 'Torno subito', breve: 'Torno subito' },
] as const;
export type ScenaLive = typeof SCENE_LIVE[number]['id'];
export interface CambioScena { t: number; scena: ScenaLive; angolo: Angolo; tonda: boolean; presentazione?: boolean }
export interface DatiSceneLive { versione: 1; cambi: CambioScena[] }
export const DURATA_SCENA = 0.32;
/** I numeri sono riservati alle scene solo nella pagina LIVE; F1/F2 restano guida/sottotitoli. */
export function scenaDaTasto(key: string): ScenaLive | undefined { return /^[1-6]$/.test(key) ? SCENE_LIVE[Number(key) - 1].id : undefined; }
export function cambiaScena(cambi: readonly CambioScena[], cambio: CambioScena): CambioScena[] {
  if (!Number.isFinite(cambio.t) || cambio.t < 0 || !SCENE_LIVE.some(s => s.id === cambio.scena)) return [...cambi];
  const prima = cambi.filter(c => c.t < cambio.t);
  const ultimo = prima.at(-1);
  if (!ultimo || ultimo.scena !== cambio.scena || ultimo.angolo !== cambio.angolo || ultimo.tonda !== cambio.tonda || ultimo.presentazione !== cambio.presentazione) prima.push({ ...cambio });
  return prima;
}
export interface RiquadroScena { x: number; y: number; w: number; h: number; visibile: boolean; copri: boolean; tonda: boolean }
export function riquadriScena(c: CambioScena) {
  const pieno: RiquadroScena = { x: 0, y: 0, w: 1, h: 1, visibile: true, copri: false, tonda: false };
  const piccolo = { ...pieno, x: c.angolo.endsWith('d') ? .68 : .03, y: c.angolo.startsWith('b') ? .67 : .03, w: .29, h: .30 };
  const schermo = { ...pieno }, webcam = { ...piccolo, visibile: false, tonda: c.tonda, copri: c.tonda };
  switch (c.scena) {
    case 'bolla': webcam.visibile = true; break;
    case 'webcam-schermo': Object.assign(webcam, pieno); Object.assign(schermo, piccolo); break;
    case 'affiancati': Object.assign(schermo, { w: .5, copri: true }); Object.assign(webcam, pieno, { x: .5, w: .5, copri: true }); break;
    case 'webcam': schermo.visibile = false; Object.assign(webcam, pieno); break;
    case 'pausa': schermo.visibile = webcam.visibile = false; break;
  }
  if (c.presentazione && (c.scena === 'schermo' || c.scena === 'bolla')) Object.assign(schermo, { x: .07, y: .07, w: .86, h: .86 });
  return { schermo, webcam, titolo: c.scena === 'pausa' };
}
/** Posizioni in pixel del progetto: gli stessi Transform letti da monitor ed esportazione. */
export function posizioneScena(p: Project, m: MediaItem, c: CambioScena, fonte: 'schermo' | 'webcam'): { tf: Transform; opacity: number } {
  const q = riquadriScena(c)[fonte];
  if (fonte === 'webcam' && c.scena === 'bolla') return { tf: bolla(p, m, c.angolo, .3, c.tonda), opacity: 1 };
  const mw = m.rotation % 180 ? m.height : m.width, mh = m.rotation % 180 ? m.width : m.height;
  const k = Math.min(p.w / (mw || p.w), p.h / (mh || p.h)), dw = (mw || p.w) * k, dh = (mh || p.h) * k;
  const tw = p.w * q.w, th = p.h * q.h;
  const scale = q.copri ? Math.max(tw / dw, th / dh) : Math.min(tw / dw, th / dh);
  const tf = { ...TF0, scale, x: (q.x + q.w / 2 - .5) * p.w, y: (q.y + q.h / 2 - .5) * p.h };
  if (q.copri) { tf.cropL = tf.cropR = Math.max(0, (1 - tw / (dw * scale)) / 2); tf.cropT = tf.cropB = Math.max(0, (1 - th / (dh * scale)) / 2); }
  return { tf, opacity: q.visibile ? 1 : 0 };
}
/** Le chiavi sono locali alla clip, anche se la webcam è stata accesa a metà ripresa. Cambi ravvicinati ripartono dalla posizione raggiunta. */
export function animaScene(c: Clip, p: Project, m: MediaItem | null, cambi: readonly CambioScena[], fonte: 'schermo' | 'schermo-sopra' | 'webcam' | 'titolo', da: number) {
  const r = p.rate.num / p.rate.den;
  const stato = (s: CambioScena): Record<string, number> => {
    if (fonte === 'titolo') return { opacity: s.scena === 'pausa' ? 1 : 0 };
    const v = posizioneScena(p, m!, s, fonte === 'schermo-sopra' ? 'schermo' : fonte);
    if (fonte === 'schermo-sopra') v.opacity = s.scena === 'webcam-schermo' ? 1 : 0;
    else if (fonte === 'schermo' && s.scena === 'webcam-schermo') v.opacity = 0;
    return Object.fromEntries([['opacity', v.opacity], ...Object.entries({ angoli: 0, ombra: 0, sx: 1, ...v.tf }).map(([k, v]) => ['tf.' + k, v])]);
  };
  c.anim ??= {};
  for (const s of cambi) {
    const f = Math.round((s.t - da) * r), fine = f + Math.max(1, Math.round(DURATA_SCENA * r));
    for (const [path, v] of Object.entries(stato(s))) {
      const keys = c.anim[path] ??= [];
      const prima = valoreAnim(keys, f, v);
      const tenute = keys.filter(k => k.f < f);
      if (!keys.length) tenute.push({ f, v, modo: 'morbida' });
      else { tenute.push({ f, v: prima, modo: 'morbida' }, { f: fine, v, modo: 'gradino' }); }
      c.anim[path] = tenute;
    }
  }
  // Le chiavi negative servivano per calcolare lo stato all'accensione: si consolidano in una chiave a zero.
  for (const [path, keys] of Object.entries(c.anim)) c.anim[path] = [{ f: 0, v: valoreAnim(keys, 0, 0), modo: keys.findLast(k => k.f <= 0)?.modo ?? 'gradino' }, ...keys.filter(k => k.f > 0 && k.f < c.len), { f: c.len, v: valoreAnim(keys, c.len, 0), modo: 'gradino' }];
}
