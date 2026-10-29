// Parser e riferimento trilineare adattati da OpenReel (MIT): vedi TERZE-PARTI.md.
import type { RisorsaLut } from '../core/tipi';

export const MAX_CUBE_BYTE = 32 * 1024 * 1024;
export const MAX_CUBE_SIZE = 65;
const numero = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function validaLut(l: RisorsaLut): boolean {
  return Number.isInteger(l.n) && l.n >= 2 && l.n <= MAX_CUBE_SIZE && Array.isArray(l.dati) && l.dati.length === l.n ** 3 * 3
    && l.dati.every((x) => Number.isFinite(x) && Math.abs(x) <= 65504)
    && Array.isArray(l.domainMin) && Array.isArray(l.domainMax) && l.domainMin.length === 3 && l.domainMax.length === 3
    && l.domainMin.every((x, i) => Number.isFinite(x) && Math.abs(x) <= 65504 && Number.isFinite(l.domainMax[i]) && Math.abs(l.domainMax[i]) <= 65504 && l.domainMax[i] > x);
}

/** Rosso più veloce, poi verde, poi blu. I float e DOMAIN_* restano intatti. */
export function parseCube(testo: string, nome = 'LUT'): Omit<RisorsaLut, 'id' | 'hash'> {
  if (testo.length > MAX_CUBE_BYTE || new TextEncoder().encode(testo).length > MAX_CUBE_BYTE) throw new Error('La LUT supera 32 MB');
  let n = 0, iniziati = false;
  let domainMin: [number, number, number] = [0, 0, 0], domainMax: [number, number, number] = [1, 1, 1];
  const dati: number[] = [], viste = new Set<string>();
  for (const [i, riga] of testo.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const r = riga.replace(/"[^"]*"|#.*$/g, (parte) => parte.startsWith('#') ? '' : parte).trim();
    if (!r) continue;
    const parti = r.split(/\s+/), k = parti[0];
    const errore = () => new Error(`LUT: riga ${i + 1} non valida (${k})`);
    if (numero.test(k)) {
      if (!n || parti.length !== 3 || !parti.every((x) => numero.test(x) && Number.isFinite(Number(x)) && Math.abs(Number(x)) <= 65504)) throw errore();
      iniziati = true;
      if (dati.length >= n ** 3 * 3) throw new Error('La LUT ha troppi campioni');
      dati.push(...parti.map(Number));
      continue;
    }
    if (iniziati || viste.has(k)) throw errore();
    viste.add(k);
    if (k === 'TITLE') { if (!/^TITLE\s+".*"$/.test(r)) throw errore(); nome = r.slice(r.indexOf('"') + 1, -1); }
    else if (k === 'LUT_3D_SIZE') {
      n = Number(parti[1]);
      if (parti.length !== 2 || !Number.isInteger(n) || n < 2 || n > MAX_CUBE_SIZE) throw new Error('La LUT deve avere da 2 a 65 punti per lato');
    } else if (k === 'DOMAIN_MIN' || k === 'DOMAIN_MAX') {
      if (parti.length !== 4 || !parti.slice(1).every((x) => numero.test(x) && Number.isFinite(Number(x)))) throw errore();
      const v = parti.slice(1).map(Number) as [number, number, number];
      if (k === 'DOMAIN_MIN') domainMin = v; else domainMax = v;
    } else throw new Error(`LUT: intestazione ${k} non supportata (servono LUT 3D .cube)`);
  }
  const l = { nome, n, domainMin, domainMax, dati };
  if (!validaLut({ ...l, id: '', hash: '' })) throw new Error('LUT incompleta o dominio non valido');
  return l;
}

export async function leggiLut(file: File): Promise<RisorsaLut> {
  if (!/\.cube$/i.test(file.name)) throw new Error('Scegli un file .cube');
  if (file.size > MAX_CUBE_BYTE) throw new Error('La LUT supera 32 MB');
  const l = parseCube(await file.text(), file.name);
  const bytes = new TextEncoder().encode(JSON.stringify([l.n, l.domainMin, l.domainMax, l.dati]));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (x) => x.toString(16).padStart(2, '0')).join('');
  return { ...l, id: 'lut-' + hash, hash };
}

/** Riferimento CPU per le prove; nell'app i pixel passano dalla texture 3D. */
export function campionaLut(l: RisorsaLut, rgb: number[], intensita = 1): number[] {
  if (intensita <= 0) return [...rgb];
  const p = rgb.map((v, i) => Math.max(0, Math.min(1, (v - l.domainMin[i]) / (l.domainMax[i] - l.domainMin[i]))) * (l.n - 1));
  const lo = p.map(Math.floor), hi = lo.map((v) => Math.min(l.n - 1, v + 1)), t = p.map((v, i) => v - lo[i]);
  const out = [0, 0, 0];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) {
    const w = (r ? t[0] : 1 - t[0]) * (g ? t[1] : 1 - t[1]) * (b ? t[2] : 1 - t[2]);
    const j = ((b ? hi[2] : lo[2]) * l.n ** 2 + (g ? hi[1] : lo[1]) * l.n + (r ? hi[0] : lo[0])) * 3;
    for (let c = 0; c < 3; c++) out[c] += l.dati[j + c] * w;
  }
  return out.map((v, i) => rgb[i] + (v - rgb[i]) * Math.min(1, intensita));
}
