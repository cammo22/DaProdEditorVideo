// Le scritte di LIVE che si calcolano (risoluzione, fps, spazio sul disco): pure, si provano da Node.

/** gigabyte con una cifra sotto i 100 e senza sopra; "—" se non si sa */
export function testoGB(byte: number | null | undefined): string {
  if (byte == null || !Number.isFinite(byte) || byte < 0) return '—';
  const gb = byte / 1e9;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`;
  return `${Math.round(byte / 1e6)} MB`;
}

export interface InfoLive { larghezza?: number; altezza?: number; fps?: number; spazio?: number | null }

/** «2560×1440 · 60 fps · 212 GB»: le parti che non si sanno saltano */
export function testoInfo(i: InfoLive): string {
  const v: string[] = [];
  if (i.larghezza && i.altezza) v.push(`${Math.round(i.larghezza)}×${Math.round(i.altezza)}`);
  if (i.fps && Number.isFinite(i.fps)) v.push(`${Math.round(i.fps)} fps`);
  if (i.spazio != null && Number.isFinite(i.spazio)) v.push(testoGB(i.spazio));
  return v.join(' · ');
}

/** quanti minuti di registrazione ci stanno nello spazio, a quel bitrate (bit al secondo, video + audio) */
export function minutiRimasti(spazioByte: number | null | undefined, bps: number): number | null {
  if (spazioByte == null || !Number.isFinite(spazioByte) || !(bps > 0)) return null;
  return Math.floor(spazioByte / (bps / 8) / 60);
}

/** a che altezza e frequenza si chiede lo schermo: la misura che il browser dichiara se c'è, se no quella chiesta */
export function misuraAttesa(qualita: number, fps: number): { larghezza: number; altezza: number; fps: number } {
  return { larghezza: Math.round(qualita * 16 / 9), altezza: qualita, fps };
}
