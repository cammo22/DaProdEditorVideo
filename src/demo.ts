// Il montaggio dimostrativo: tre riprese generate al volo (niente file da scaricare), montate con
// titoli, sottopancia, dissolvenze e una tendina a iride. Serve alla versione prova e alle prove automatiche.
import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, WebMOutputFormat,
  getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
} from 'mediabunny';
import { importaFile, avvisoLungo } from './progetti';
import { store } from './core/store';
import { newClip, TITLE0, uid } from './core/progetto';
import { fps, s2f } from './core/timecode';
import { nuovoBlocco, posaBlocco } from './core/blocchi';
import { avviso } from './ui/dom';
import { motore } from './motore';

const W = 960, H = 540, FPS = 25, DUR0 = 6;
const DUR = DUR0;

type Scena = (ctx: OffscreenCanvasRenderingContext2D, t: number) => void;

const scene: { nome: string; nota: number[]; disegna: Scena }[] = [
  {
    nome: 'Tramonto sul golfo.mp4', nota: [220, 277.18, 329.63, 440],
    disegna: (ctx, t) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1b0f3a'); g.addColorStop(0.55, '#ff5e62'); g.addColorStop(0.62, '#ffb347'); g.addColorStop(0.63, '#15345c'); g.addColorStop(1, '#07142a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const sy = H * 0.66 - t * 18;
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(W * 0.5, sy, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,224,138,.35)';
      for (let i = 0; i < 14; i++) { const y = H * 0.66 + i * 12; const w = 160 - i * 9 + Math.sin(t * 3 + i) * 12; ctx.fillRect(W / 2 - w / 2, y, w, 3); }
      ctx.fillStyle = '#0b1020';
      ctx.beginPath(); ctx.moveTo(0, H * 0.63); ctx.lineTo(W * 0.18, H * 0.5); ctx.lineTo(W * 0.3, H * 0.58); ctx.lineTo(W * 0.42, H * 0.46); ctx.lineTo(W * 0.55, H * 0.63); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) { const x = ((t * 60 + i * 330) % (W + 80)) - 40; ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, 120 + i * 30); ctx.quadraticCurveTo(x, 110 + i * 30 + Math.sin(t * 8 + i) * 6, x + 10, 120 + i * 30); ctx.stroke(); }
    },
  },
  {
    nome: 'Città al neon.mp4', nota: [196, 246.94, 293.66, 392],
    disegna: (ctx, t) => {
      ctx.fillStyle = '#07060d'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % W, bw = 40 + (i * 37) % 60, bh = 120 + ((i * 71) % 260);
        ctx.fillStyle = '#12101c'; ctx.fillRect(x, H - bh, bw, bh);
        for (let wy = H - bh + 10; wy < H - 10; wy += 16) for (let wx = x + 6; wx < x + bw - 6; wx += 12) {
          if (((wx * 13 + wy * 7 + i) % 5) === 0) { ctx.fillStyle = (Math.sin(t * 2 + wx + wy) > 0.2) ? '#ffd54a' : '#3a3050'; ctx.fillRect(wx, wy, 5, 7); }
        }
      }
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ff3df2'; ctx.strokeStyle = '#ff3df2'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, H * 0.35 + Math.sin(t) * 20); for (let x = 0; x < W; x += 20) ctx.lineTo(x, H * 0.35 + Math.sin(t * 2 + x / 90) * 30); ctx.stroke();
      ctx.shadowColor = '#35e8ff'; ctx.strokeStyle = '#35e8ff';
      ctx.beginPath(); ctx.moveTo(0, H * 0.25); for (let x = 0; x < W; x += 20) ctx.lineTo(x, H * 0.25 + Math.cos(t * 1.5 + x / 70) * 22); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '900 64px Orbitron, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = Math.sin(t * 9) > -0.8 ? '#ffd54a' : '#5a4a10';
      ctx.fillText('NAPOLI', W / 2, H * 0.62);
    },
  },
  {
    nome: 'Pallina rimbalzina.mp4', nota: [261.63, 329.63, 392, 523.25],
    disegna: (ctx, t) => {
      ctx.fillStyle = '#e8e2d0'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const ph = (t * 1.1) % 1, y = H - 90 - Math.abs(Math.sin(ph * Math.PI)) * 330, x = 120 + (((t % DUR) / DUR) * (W - 240));
      const sq = 1 + Math.max(0, 0.25 - Math.abs(Math.sin(ph * Math.PI))) * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, H - 60, 50 * (1.2 - (H - 90 - y) / 500), 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.ellipse(x, y, 42 * sq, 42 / sq, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(x - 14, y - 14, 10, 0, Math.PI * 2); ctx.fill();
    },
  },
];

async function melodia(note: number[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 48000 * DUR, sampleRate: 48000 });
  const out = ctx.createGain();
  out.gain.value = 0.25;
  out.connect(ctx.destination);
  for (let i = 0; i < DUR * 4; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    o.type = i % 2 ? 'triangle' : 'sine';
    o.frequency.value = note[i % note.length] * (i % 8 < 4 ? 1 : 1.5);
    pan.pan.value = Math.sin(i) * 0.6;
    const t = i * 0.25;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.24);
    o.connect(g).connect(pan).connect(out);
    o.start(t); o.stop(t + 0.25);
  }
  const b = ctx.createOscillator(), bg = ctx.createGain();
  b.frequency.value = note[0] / 2; bg.gain.value = 0.3;
  b.connect(bg).connect(out); b.start(0); b.stop(DUR);
  return ctx.startRendering();
}

/** crea un file video di prova (MP4 se il sistema codifica H.264/AAC, altrimenti WebM) */
async function creaClip(sc: typeof scene[number], o: { dur?: number; gop?: number; vfr?: boolean } = {}): Promise<File> {
  const DUR = o.dur ?? DUR0;
  const v = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8', 'av1'], { width: W, height: H });
  if (!v) throw new Error('nessun codificatore video');
  const mp4 = v === 'avc';
  const a = await getFirstEncodableAudioCodec(mp4 ? ['aac', 'opus'] : ['opus', 'vorbis'], { numberOfChannels: 2, sampleRate: 48000 });
  const out = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const cv = new OffscreenCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const vs = new CanvasSource(cv, { codec: v, bitrate: new Quality('medium'), keyFrameInterval: o.gop ?? 1 });
  // il VFR vero non ha una griglia: senza frameRate il contenitore tiene i tempi come sono (con frameRate li arrotonda ai 25 fps)
  out.addVideoTrack(vs, o.vfr ? {} : { frameRate: FPS });
  let as: AudioBufferSource | null = null;
  if (a) { as = new AudioBufferSource({ codec: a, bitrate: new Quality('medium') }); out.addAudioTrack(as); }
  await out.start();
  if (as) for (let t = 0; t < DUR; t += DUR0) await as.add(await melodia(sc.nota));
  if (o.vfr) {
    // frame rate variabile vero (come i telefoni): i fotogrammi arrivano a distanze che non stanno su nessuna griglia
    const passi = [1, 1.37, 2.9, 0.71, 1.83, 1.12, 3.6, 0.83, 1.29, 2.2];
    let k = 0;
    for (let t = 0; t < DUR * FPS; k++) {
      const p = passi[k % passi.length];
      sc.disegna(ctx, t / FPS);
      await vs.add(t / FPS, p / FPS);
      t += p;
    }
  } else {
    for (let i = 0; i < DUR * FPS; i++) {
      sc.disegna(ctx, i / FPS);
      await vs.add(i / FPS, 1 / FPS);
    }
  }
  await out.finalize();
  const nome = mp4 ? sc.nome : sc.nome.replace('.mp4', '.webm');
  return new File([(out.target as BufferTarget).buffer!], nome, { type: mp4 ? 'video/mp4' : 'video/webm', lastModified: Date.now() });
}

/** una ripresa lunga con i fotogrammi chiave radi (come i video dei telefoni e dei generatori): per le prove */
/** una ripresa a frame rate variabile (VFR), come quelle dei telefoni: per le prove */
export const ripresaVfrDiProva = (dur: number) => creaClip({ ...scene[2], nome: `Telefono ${dur}s.mp4` }, { dur, gop: 25, vfr: true });

/** un brano Opus a bitrate variabile (con pause: i pacchetti cambiano molto di grandezza). Dalla 1.5.3 NON si converte più (Opus ha i tempi in ogni pacchetto): per le prove */
export async function branoVbrDiProva(dur: number): Promise<File> {
  const out = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const as = new AudioBufferSource({ codec: 'opus', bitrate: new Quality({ quality: 'high', preferBitrate: true, bitrateMode: 'variable' }) });
  out.addAudioTrack(as);
  await out.start();
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(48000 * dur), sampleRate: 48000 });
  const g = ctx.createGain();
  g.connect(ctx.destination);
  // note piene e pause: Opus a bitrate variabile usa pochissimi byte per le pause e tanti per le note
  for (let i = 0; i < dur * 2; i++) {
    if (i % 3 === 2) continue;
    const o = ctx.createOscillator(), e = ctx.createGain();
    o.type = i % 2 ? 'sawtooth' : 'triangle';
    o.frequency.value = 180 + (i % 5) * 90;
    e.gain.setValueAtTime(0, i * 0.5); e.gain.linearRampToValueAtTime(0.5, i * 0.5 + 0.02); e.gain.linearRampToValueAtTime(0, i * 0.5 + 0.45);
    o.connect(e).connect(g);
    o.start(i * 0.5); o.stop(i * 0.5 + 0.5);
  }
  await as.add(await ctx.startRendering());
  await out.finalize();
  return new File([(out.target as BufferTarget).buffer!], `Brano VBR ${dur}s.webm`, { type: 'audio/webm', lastModified: Date.now() });
}

export const ripresaDiProva = (dur: number, gop: number) => creaClip({ ...scene[2], nome: `Lunga ${dur}s.mp4` }, { dur, gop });

export async function montaggioDimostrativo() {
  const barra = avvisoLungo('Preparo il montaggio dimostrativo: giro le riprese…');
  try {
    const files: File[] = [];
    for (let i = 0; i < scene.length; i++) {
      barra.testo(`Giro la ripresa ${i + 1} di ${scene.length}: ${scene[i].nome.replace('.mp4', '')}…`);
      files.push(await creaClip(scene[i]));
    }
    barra.chiudi();
    const media = await importaFile(files.map((f) => ({ name: f.name, file: f })), { chiediFormato: false });
    if (media.length < 3) throw new Error('riprese non importate');
    const p = store.doc;
    const r = fps(p.rate);
    const L = s2f(DUR, p.rate);
    const tr = Math.round(r);
    store.edit('Montaggio dimostrativo', (pp) => {
      const v1 = pp.tracks.filter((t) => t.kind === 'video').slice(-1)[0];
      const v2 = pp.tracks.filter((t) => t.kind === 'video').slice(-2)[0];
      const a1 = pp.tracks.find((t) => t.kind === 'audio')!;
      let at = 0;
      media.forEach((m, i) => {
        const link = uid('l');
        const cv = newClip('media', v1.id, at, L, { media: m.id, name: m.name, link, srcIn: 0 });
        const ca = newClip('media', a1.id, at, L, { media: m.id, name: m.name, link, srcIn: 0 });
        // le transizioni sono blocchetti sopra il taglio; l'audio si incrocia da solo (la tendina col suo swish)
        if (i === 1) posaBlocco(pp, nuovoBlocco('transizione', 'mix'), at - Math.round(tr / 2), tr, v1.id);
        if (i === 2) posaBlocco(pp, nuovoBlocco('transizione', 'wipe:119'), at - Math.round(tr / 2), tr, v1.id);
        if (i === 0) { cv.fadeIn = Math.round(r / 2); ca.fadeIn = Math.round(r / 2); }
        if (i === media.length - 1) { cv.fadeOut = tr; ca.fadeOut = tr; }
        pp.clips.push(cv, ca);
        at += L;
      });
      const titolo = newClip('title', v2.id, Math.round(r * 0.5), Math.round(r * 4), { name: 'Titolo', gen: { title: { ...TITLE0, text: 'DaProd Video', font: 'Orbitron', size: 110, color: '#ffd54a' } } });
      titolo.fadeIn = Math.round(r / 2); titolo.fadeOut = Math.round(r / 2);
      const sotto = newClip('title', v2.id, L + Math.round(r * 1.5), Math.round(r * 3.5), { name: 'Sottopancia', gen: { title: { ...TITLE0, style: 'sottopancia', text: 'Napoli di notte\nripresa dimostrativa', size: 52, align: 'left' } } });
      sotto.fadeIn = 6; sotto.fadeOut = 6;
      pp.clips.push(titolo, sotto);
      // gli effetti a tempo: un lampo (col suo zap) quando entra il sottopancia, uno zoom lento solo sulla ripresa
      posaBlocco(pp, nuovoBlocco('effetto', 'flash'), L + Math.round(r * 1.5), Math.round(r / 2), v2.id);
      posaBlocco(pp, nuovoBlocco('effetto', 'zoomLento'), L * 2 + Math.round(r), L - Math.round(r * 2), v1.id);
      pp.name = 'Montaggio dimostrativo';
    });
    store.dirty = false;
    motore.setMonitor('recorder');
    motore.vaiA(0);
    avviso('✨ Ecco il montaggio dimostrativo: premi Spazio per vederlo', 'ok', 4000);
    document.dispatchEvent(new CustomEvent('dpv:adatta'));
  } catch (e) {
    barra.chiudi();
    avviso('Non riesco a creare la demo: ' + (e instanceof Error ? e.message : e), 'errore', 5000);
  }
}
