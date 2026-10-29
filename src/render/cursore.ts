// Anelli originali: posizione del clic fissa nella sorgente, raggio crescente e dissolvenza al quadrato.
// Il layer li disegna prima della matrice della clip: seguono zoom, ritaglio, specchio e transizioni.
import type { Clip, Project } from '../core/tipi';
import { clicAlTempo } from '../core/zoomCursore';

export const UNIFORM_CLIC = `
uniform int u_numClic;
uniform vec4 u_clic[8]; // x, y, età normalizzata, forza
uniform vec3 u_clicColore;
uniform float u_clicRapporto;
`;

export const DISEGNA_CLIC = `
  for (int i = 0; i < 8; i++) {
    if (i >= u_numClic) break;
    vec4 s = u_clic[i];
    float d = length((uv0 - s.xy) * vec2(u_clicRapporto, 1.0));
    float r = 0.009 + s.z * 0.025;
    float bordo = 1.0 - smoothstep(0.0015, 0.003, abs(d - r));
    rgb = mix(rgb, u_clicColore, bordo * (1.0 - s.z) * (1.0 - s.z) * s.w);
  }
`;

export function anelliClic(p: Project, c: Clip, t: number, lf: number) {
  const vuoto = { n: 0, punti: new Float32Array(32), colore: [1, 0.835, 0.29] };
  const m = p.media.find((m) => m.id === c.media), dati = m?.cursoreLive;
  if (!dati || dati.v !== 1 || c.kind !== 'media') return vuoto;
  const f = c.start + lf;
  const blocchi = p.clips.filter((b) => b.kind === 'fx' && b.track === c.track && b.start <= f && f < b.start + b.len
    && b.fxb?.id === 'clicLive' && b.fxb.tipo === 'effetto' && (!b.fxb.cursoreMedia || b.fxb.cursoreMedia === m.id));
  const b = blocchi.at(-1)?.fxb;
  if (!b || b.forza <= 0 || !Number.isFinite(b.forza)) return vuoto;
  const tMs = (t - (m.t0 || 0)) * 1000, clic = clicAlTempo(dati, tMs);
  const punti = new Float32Array(32);
  clic.forEach((s, i) => punti.set([s.cx, s.cy, (tMs - s.tMs) / 550, Math.min(1, b.forza)], i * 4));
  const col = /^#[0-9a-f]{6}$/i.test(b.colore) ? b.colore : '#ffd54a';
  const colore = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16) / 255);
  return { n: clic.length, punti, colore };
}
