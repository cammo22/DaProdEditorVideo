// Decisioni pure del monta da solo: le misure e i motori restano quelli del banco.
import type { EntrataMontage } from './montage';
import type { MediaItem, Project } from './tipi';
import { presetMontage } from './montagePreset';

export function lookPerStile(id: string): string {
  const p = presetMontage(id);
  if (p?.look.includes('bn')) return 'bianco-e-nero-ricco';
  if (p?.categoria === 'ricordi') return 'pellicola-anni-70';
  if (p?.categoria === 'sport' || p?.categoria === 'social') return 'teal-e-orange';
  if (p?.categoria === 'viaggi') return 'freddo';
  return 'caldo';
}

/** Solo battiti realmente presenti nel brano (anche quando viene ripetuto). Mai allunga il tempo richiesto. */
export function fineSulBattito(durata: number, battiti: number[], ciclo?: number): number {
  const giro = ciclo && ciclo > 0 ? Math.max(0, Math.ceil(durata / ciclo) - 1) * ciclo : 0;
  const buoni = battiti.filter((b) => Number.isFinite(b) && b >= 0 && (!ciclo || b <= ciclo))
    .flatMap((b) => giro ? [b + giro, b + Math.max(0, giro - ciclo!)] : [b])
    .filter((b) => b >= 5 && b <= durata + 1e-7 && durata - b <= 2);
  return buoni.length ? Math.min(durata, Math.max(...buoni)) : durata;
}

/** Più pezzi della stessa ripresa; punteggio prima, poi ordine della sorgente. Una frase resta intera. */
export function candidatiMontage(entrate: EntrataMontage[], massimo: number, frasi = false): EntrataMontage[] {
  return entrate.flatMap((e) => {
    massimo = Math.max(.25, Number.isFinite(massimo) ? massimo : 8);
    if (e.tipo !== 'video') return [e];
    let tratti: { da: number; a: number; punteggio: number; frase?: boolean }[] = [];
    if (frasi && e.parole?.length) {
      let inizio = 0;
      for (let i = 0; i < e.parole.length; i++) {
        const w = e.parole[i], dopo = e.parole[i + 1];
        if (!dopo || /[.!?]$/.test(w.t) || dopo.da - w.a > .7) {
          tratti.push({ da: e.parole[inizio].da, a: w.a, punteggio: e.punteggio, frase: true }); inizio = i + 1;
        }
      }
    } else {
      for (const m of e.momenti ?? [{ da: e.inizioMigliore ?? 0, a: e.durata, punteggio: e.punteggio }]) {
        if (!Number.isFinite(m.da) || !Number.isFinite(m.a) || m.da < 0 || m.a > e.durata) continue;
        for (let da = m.da; da < m.a - .25; da += massimo) tratti.push({ da, a: Math.min(m.a, da + massimo), punteggio: m.punteggio });
      }
    }
    tratti = tratti.filter((m) => Number.isFinite(m.da) && Number.isFinite(m.a) && m.da >= 0 && m.a <= e.durata && m.a - m.da >= .25);
    return tratti.sort((a, b) => b.punteggio - a.punteggio || a.da - b.da).slice(0, 40)
      .map((m) => ({ ...e, punteggio: m.punteggio, inizioMigliore: m.da, pezzo: m }));
  });
}

/** Centro riconosciuto o già tracciato, altrimenti centro del quadro: nessun modello avviato qui. */
export function riquadraSoggetto(p: Pick<Project, 'w' | 'h'>, m: Pick<MediaItem, 'width' | 'height' | 'rotation'>, centro = { x: .5, y: .5 }) {
  const w = m.rotation % 180 ? m.height : m.width, h = m.rotation % 180 ? m.width : m.height;
  if (!w || !h) return { x: 0, y: 0, scale: 1 };
  const fit = Math.min(p.w / w, p.h / h), fill = Math.max(p.w / w, p.h / h);
  const limiteX = Math.max(0, (w * fill / p.w - 1) / 2), limiteY = Math.max(0, (h * fill / p.h - 1) / 2);
  return { scale: fill / fit, x: Math.max(-limiteX, Math.min(limiteX, (.5 - centro.x) * w * fill / p.w)) * p.w,
    y: Math.max(-limiteY, Math.min(limiteY, (.5 - centro.y) * h * fill / p.h)) * p.h };
}

/** Respiro musicale dopo una frase: non si taglia la voce per raggiungere il battito. */
export function battitoDopo(t: number, battiti: number[], ciclo?: number): number | undefined {
  const giro = ciclo && ciclo > 0 ? Math.floor(t / ciclo) * ciclo : 0;
  const buoni = battiti.filter((b) => Number.isFinite(b) && b >= 0 && (!ciclo || b <= ciclo))
    .flatMap((b) => ciclo ? [b + giro, b + giro + ciclo] : [b])
    .filter((b) => b >= t - 1e-7 && b - t <= 2);
  return buoni.length ? Math.min(...buoni) : undefined;
}
