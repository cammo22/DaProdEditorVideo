// MossFormer2 sulla scheda video (non è una prova della suite): il modello fp32 da 15 s con WebGPU, contro il wasm. node test/_banco-mf-gpu.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { servi } from './servi.mjs';
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  console:', m.text().slice(0, 240)); });
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  try {
    const ort = await import(location.origin + '/ai/ort.webgpu.min.mjs');
    ort.env.wasm.wasmPaths = location.origin + '/ai/';
    const url = 'https://huggingface.co/mhavo/mossformer2-se-48k-onnx/resolve/main/mossformer2_se_48k.onnx';
    const t0 = performance.now();
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const scarico = (performance.now() - t0) / 1000;
    const out = {};
    for (const ep of ['webgpu']) {
      try {
        const t1 = performance.now();
        const s = await ort.InferenceSession.create(buf, { executionProviders: [ep], graphOptimizationLevel: 'all' });
        const carica = (performance.now() - t1) / 1000;
        const x = new Float32Array(1871 * 180); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.01) * 2;
        const giri = [];
        for (let i = 0; i < 3; i++) { const t = performance.now(); const o = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', x, [1, 1871, 180]) }); const m = o[s.outputNames[0]]; await m.getData(); giri.push((performance.now() - t) / 1000); }
        out[ep] = { carica, giri, ingressi: s.inputNames, uscite: s.outputNames };
      } catch (e) { out[ep] = { errore: String(e?.message || e).slice(0, 400) }; }
    }
    return { scarico, ...out };
  } catch (e) { return { errore: String(e?.message || e).slice(0, 400) }; }
});
console.log(JSON.stringify(r));
await b.close(); srv.chiudi();
