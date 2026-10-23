// Aiuti per le prove in Node: caricare i moduli costruiti da esegui.mjs, aspettare, l'ambiente finto del browser
// (localStorage, disco privato OPFS, decoder), i file di prova.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.DPV_UNIT ?? path.resolve(qui, '../.tmp/unit');
export const carica = (nome) => import(pathToFileURL(path.join(dir, nome + '.mjs')).href);
export const dormi = (ms) => new Promise((r) => setTimeout(r, ms));
/** aspetta che cond() sia vera (al massimo ms) */
export async function finche(cond, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tempo scaduto'); await dormi(5); }
}

/** un localStorage finto (le preferenze vecchie della 1.5.7) */
export function memoriaFinta(valori = {}) {
  const m = new Map(Object.entries(valori));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  return m;
}

/** il disco privato del browser (OPFS), finto: conta i file scritti */
export function discoFinto() {
  const scritti = [];
  const cartelle = new Map();
  const cartella = (nome) => {
    if (!cartelle.has(nome)) cartelle.set(nome, new Map());
    const file = cartelle.get(nome);
    return {
      async getFileHandle(n, o = {}) {
        if (!file.has(n)) { if (!o.create) { const e = new Error('non c\'è'); e.name = 'NotFoundError'; throw e; } file.set(n, new Uint8Array()); }
        return {
          async getFile() { return new File([file.get(n)], n); },
          async createWritable() { const pezzi = []; return { async write(b) { pezzi.push(b); }, async close() { scritti.push(nome + '/' + n); file.set(n, new Uint8Array(await new Blob(pezzi).arrayBuffer())); } }; },
        };
      },
    };
  };
  const radice = { async getDirectoryHandle(n) { return cartella(n); }, async removeEntry(n) { cartelle.delete(n); } };
  Object.defineProperty(globalThis.navigator, 'storage', { value: { getDirectory: async () => radice }, configurable: true });
  return { scritti, cartelle };
}

/** quello che il browser ha e Node no: matchMedia, i decoder (si dicono capaci), AudioBuffer */
export function ambienteBrowser() {
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.VideoDecoder ??= class { static async isConfigSupported(config) { return { supported: true, config }; } };
  globalThis.AudioDecoder ??= class { static async isConfigSupported(config) { return { supported: true, config }; } };
  globalThis.AudioBuffer ??= class {
    constructor({ numberOfChannels, length, sampleRate }) {
      this.numberOfChannels = numberOfChannels; this.length = length; this.sampleRate = sampleRate; this.duration = length / sampleRate;
      this._c = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    }
    getChannelData(i) { return this._c[i]; }
    copyToChannel(src, i, off = 0) { this._c[i].set(src, off); }
    copyFromChannel(dst, i, off = 0) { dst.set(this._c[i].subarray(off, off + dst.length)); }
  };
}

/** un WAV stereo 16 bit con un seno (fatto qui, senza programmi esterni) */
export function wav(secondi, freq = 440, sr = 48000) {
  const n = Math.round(secondi * sr), ch = 2;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) { const v = Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 0.5 * 32767); buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4); }
  return buf;
}

/** video di prova fatti con ffmpeg (se c'è): null se ffmpeg non c'è (le prove sui video si saltano) */
export function videoDiProva() {
  const cart = path.resolve(qui, '../.tmp/media');
  mkdirSync(cart, { recursive: true });
  const fai = (nome, args) => {
    const f = path.join(cart, nome);
    if (!existsSync(f)) { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, f]); if (r.status !== 0) return null; }
    return f;
  };
  const hd = fai('clip-hd.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-t', '3', '-c:v', 'libx264', '-g', '300', '-pix_fmt', 'yuv420p']);
  const sd = fai('clip-sd.mov', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-g', '12', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le']);
  if (!hd || !sd) return null;
  return { hd: new File([readFileSync(hd)], 'clip-hd.mp4', { type: 'video/mp4' }), sd: new File([readFileSync(sd)], 'clip-sd.mov', { type: 'video/quicktime' }) };
}
