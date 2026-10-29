// EDL CMX3600: la lista di montaggio delle centraline a nastro. Si apre in DaVinci Resolve, Premiere, Avid,
// EDIUS e in qualunque sala di conforming. Una riga per ogni evento: bobina, canali, tipo, sorgente, registrazione.
import type { Clip, Project } from '../core/tipi';
import { end, mediaOf } from '../core/progetto';
import { frameToTc, s2f } from '../core/timecode';
import { nomeModello } from '../render/transizioni';
import { nomeBlocco, transizioniAttive } from '../core/blocchi';

function bobina(nome: string): string {
  return (nome.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '').toUpperCase() || 'AX').slice(0, 8).padEnd(8, ' ');
}

export function creaEdl(p: Project): string {
  const r = p.rate;
  const tc = (f: number) => frameToTc(f, r, p.drop).replace(/;/g, p.drop ? ';' : ':');
  const righe: string[] = [];
  righe.push(`TITLE: ${p.name.toUpperCase().slice(0, 70)}`);
  righe.push(`FCM: ${p.drop ? 'DROP FRAME' : 'NON-DROP FRAME'}`);
  righe.push('');
  // eventi: le clip video di V1..Vn e l'audio di A1..A4, ordinati per registrazione
  type Ev = { c: Clip; canale: string };
  const ev: Ev[] = [];
  const vt = p.tracks.filter((t) => t.kind === 'video').reverse();
  const at = p.tracks.filter((t) => t.kind === 'audio');
  vt.forEach((t, i) => { for (const c of p.clips) if (c.track === t.id) ev.push({ c, canale: i === 0 ? 'V' : `V${i + 1}`.slice(0, 2) }); });
  at.forEach((t, i) => { for (const c of p.clips) if (c.track === t.id && i < 4) ev.push({ c, canale: i === 0 ? 'A' : i === 1 ? 'A2' : i === 2 ? 'A3' : 'A4' }); });
  ev.sort((a, b) => a.c.start - b.c.start || a.canale.localeCompare(b.canale));
  // le transizioni dei blocchetti FX valgono per la clip che entra
  const trDi = new Map<string, NonNullable<Clip['trIn']>>();
  for (const x of transizioniAttive(p)) if (x.b) trDi.set(x.b.id, x.tr);
  let n = 1;
  for (const { c: c0, canale } of ev) {
    const t = c0.trIn ?? trDi.get(c0.id);
    const c = t ? { ...c0, trIn: t } : c0;
    const m = mediaOf(p, c);
    const reel = c.kind === 'media' && m ? bobina(m.name) : c.kind === 'bars' || c.kind === 'tone' ? 'BARS    ' : c.kind === 'title' ? 'AX      ' : 'BL      ';
    const srcRate = r;
    const sIn = c.kind === 'media' ? s2f(c.srcIn, srcRate) : 0;
    const sOut = sIn + c.len;
    const num = String(n++).padStart(3, '0');
    const ch = canale.padEnd(5, ' ');
    if (c.trIn && c.kind !== 'tone') {
      // transizione: evento "C" di taglio sulla clip precedente e "D" (dissolvenza) o "W" (tendina) su questa
      // le tendine hanno il loro numero SMPTE; gli effetti digitali nella EDL diventano una dissolvenza con la nota
      const tipo = c.trIn.type === 'wipe' ? `W${String(c.trIn.pattern).padStart(3, '0')}` : 'D   ';
      righe.push(`${num}  ${reel} ${ch} ${tipo} ${String(c.trIn.len).padStart(3, '0')} ${tc(sIn)} ${tc(sOut)} ${tc(c.start)} ${tc(end(c))}`);
      if (c.trIn.type === 'dve' || c.trIn.type === 'dip') righe.push(`* EFFETTO: ${nomeModello(c.trIn.type, c.trIn.pattern)}`);
    } else {
      righe.push(`${num}  ${reel} ${ch} C        ${tc(sIn)} ${tc(sOut)} ${tc(c.start)} ${tc(end(c))}`);
    }
    if (c.kind === 'media' && m) righe.push(`* FROM CLIP NAME: ${m.name}`);
    else if (c.kind === 'title' && c.gen?.anim) righe.push(`* ANIMAZIONE: ${c.name.slice(0, 60)}`);
    else if (c.kind === 'title' && c.gen?.html) righe.push(`* TITOLO HTML: ${c.name.slice(0, 60)}`);
    else if (c.kind === 'title') righe.push(`* TITOLO: ${(c.gen?.title?.text ?? '').replace(/\n/g, ' / ').slice(0, 60)}`);
    if (c.opacity < 1 && canale.startsWith('V')) righe.push(`* OPACITY: ${Math.round(c.opacity * 100)}%`);
    righe.push('');
  }
  // gli effetti a tempo non hanno un evento CMX: restano come note, con dove stanno
  for (const b of p.clips) if (b.kind === 'fx' && b.fxb?.tipo === 'effetto') righe.push(`* FX: ${nomeBlocco(b.fxb)} ${tc(b.start)} ${tc(end(b))}`);
  return righe.join('\r\n');
}
