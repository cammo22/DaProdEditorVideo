// Il filtro del rumore sulla scheda video (fp32, 15 s) contro quello sul processore (8 bit, 4 s): stesse maschere? (non è una prova della suite)
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { servi } from './servi.mjs';
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.addScriptTag({ path: process.argv[2] });
const wav = fs.readFileSync('C:/Users/cammo/AppData/Roaming/com.pais.handy/recordings/handy-1793125734.wav');
const pcm = wav.subarray(44 + 16000 * 2 * 120, 44 + 16000 * 2 * 135).toString('base64'); // 15 s a 16 kHz
const r = await page.evaluate(async (b64) => {
  try {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const i16 = new Int16Array(raw.buffer);
    // 15 s a 48 kHz (interpolazione lineare: basta per il confronto)
    const N = 720000, x = new Float32Array(N);
    for (let i = 0; i < N; i++) { const p = i / 3, k = Math.floor(p), f = p - k; x[i] = ((i16[k] ?? 0) * (1 - f) + (i16[k + 1] ?? i16[k] ?? 0) * f) / 32768; }
    let seme = 12345; const caso = () => { seme = (seme * 1664525 + 1013904223) >>> 0; return seme / 4294967296; };
    let p2 = 0; for (let i = 0; i < N; i++) p2 += x[i] * x[i]; const rms = Math.sqrt(p2 / N);
    for (let i = 0; i < N; i++) x[i] += (caso() * 2 - 1) * rms * 0.7;
    const { caratteristiche, MF } = MFX;
    const ort = await import(location.origin + '/ai/ort.webgpu.min.mjs'); ort.env.wasm.wasmPaths = location.origin + '/ai/';
    const scarica = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer());
    const gpu = await ort.InferenceSession.create(await scarica('https://huggingface.co/mhavo/mossformer2-se-48k-onnx/resolve/main/mossformer2_se_48k.onnx'), { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
    const cpu = await ort.InferenceSession.create(await scarica('https://huggingface.co/ipsilondev/MossFormer2-SE-48K-ONNX/resolve/main/model.onnx'), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const run = async (s, feat, T) => { const o = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', feat, [1, T, 180]) }); return new Float32Array(await o[s.outputNames[0]].getData()); };
    const a64 = (sig) => { const o = new Float64Array(sig.length); for (let i = 0; i < sig.length; i++) o[i] = sig[i] * 32768; return o; };
    // finestra da 4 s (le prime 4 s) sul processore
    const f4 = caratteristiche(a64(x.subarray(0, 192000)));
    const m4 = await run(cpu, f4, 496);
    // sulla scheda: 15 s veri (le prime 4 s hanno il resto intorno) e 4 s + silenzio
    const f15 = caratteristiche(a64(x));
    const m15 = await run(gpu, f15, 1871);
    const z = new Float32Array(N); z.set(x.subarray(0, 192000));
    const m15z = await run(gpu, caratteristiche(a64(z)), 1871);
    const zr = new Float32Array(N); zr.set(x.subarray(0, 192000)); MFX.completaConRiflesso(zr, 192000);
    const m15r = await run(gpu, caratteristiche(a64(zr)), 1871);
    // 4 s sulla scheda con silenzio... e le stesse 4 s sul processore a 15 s? (il modello a 8 bit ha forma fissa 496: no)
    const conf = (A, B, n) => { let dot = 0, na = 0, nb = 0, d = 0; for (let i = 0; i < n; i++) { dot += A[i] * B[i]; na += A[i] * A[i]; nb += B[i] * B[i]; d += Math.abs(A[i] - B[i]); } return { cos: +(dot / Math.sqrt(na * nb)).toFixed(4), diffMedia: +(d / n).toFixed(4), mediaA: +(Math.sqrt(na / n)).toFixed(3), mediaB: +(Math.sqrt(nb / n)).toFixed(3) }; };
    const n = 496 * 961;
    return { cpu4_vs_gpu15vero: conf(m4, m15, n), cpu4_vs_gpu4piuSilenzio: conf(m4, m15z, n), gpu15vero_vs_gpu4piuSilenzio: conf(m15, m15z, n), cpu4_vs_gpu4piuRiflesso: conf(m4, m15r, n) };
  } catch (e) { return { errore: String(e?.message || e).slice(0, 300) }; }
}, pcm);
console.log(JSON.stringify(r, null, 1));
await b.close(); srv.chiudi();
