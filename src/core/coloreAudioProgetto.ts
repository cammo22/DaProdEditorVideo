// Migrazione aggiuntiva: i campi vecchi e le loro formule restano intatti.
import type { Project } from './tipi';
import { configDucking } from './ducking';

export function migraColoreAudio(p: Project): void {
  p.luts ??= [];
  for (const s of [p, ...(p.sequenze ?? [])]) {
    for (const t of s.tracks ?? []) if (t.ducking) t.ducking = configDucking(t.ducking);
    for (const c of s.clips ?? []) {
      if (c.ducking) c.ducking = configDucking(c.ducking);
      if (c.duckKeys) {
        const m = new Map<number, number>();
        for (const k of c.duckKeys) if (Number.isFinite(k.f) && Number.isFinite(k.v)) m.set(k.f, Math.max(-60, Math.min(0, k.v)));
        c.duckKeys = [...m].map(([f, v]) => ({ f, v })).sort((a, b) => a.f - b.f);
      }
    }
  }
}
