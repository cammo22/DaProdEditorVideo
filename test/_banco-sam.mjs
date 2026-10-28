// Dov'è il tempo di SAM per fotogramma (non è una prova della suite): preparazione, modello, maschera finale. node test/_banco-sam.mjs [repo] [dtype]
import { chromium } from 'playwright';
import path from 'node:path';
import { servi } from './servi.mjs';
const repo = process.argv[2] || 'onnx-community/sam3-tracker-ONNX';
const dtype = process.argv[3] || 'q4f16';
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 200)); });
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const r = await page.evaluate(async ({ repo, dtype }) => {
  try {
    const T = await import(location.origin + '/ai/transformers.min.js');
    const t0 = performance.now();
    const processor = await T.AutoProcessor.from_pretrained(repo);
    const Classe = /sam3/i.test(repo) && T.Sam3TrackerModel ? T.Sam3TrackerModel : /sam2|edgetam/i.test(repo) && T.Sam2Model ? T.Sam2Model : T.SamModel;
    const model = await Classe.from_pretrained(repo, { device: 'webgpu', dtype });
    const carica = (performance.now() - t0) / 1000;
    const w = 512, h = 288;
    const c = new OffscreenCanvas(w, h); const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#345'); g.addColorStop(1, '#a96'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#d33'; x.beginPath(); x.arc(256, 150, 60, 0, 7); x.fill();
    const d = x.getImageData(0, 0, w, h).data;
    const rgb = new Uint8ClampedArray(w * h * 3); for (let i = 0, j = 0; i < w * h; i++, j += 3) { rgb[j] = d[i * 4]; rgb[j + 1] = d[i * 4 + 1]; rgb[j + 2] = d[i * 4 + 2]; }
    const img = new T.RawImage(rgb, w, h, 3);
    const giri = [];
    for (let i = 0; i < 4; i++) {
      const a = performance.now();
      const inputs = await processor(img, { input_points: [[[256, 150]]], input_labels: [[1]] });
      const b2 = performance.now();
      const out = await model(inputs);
      const c2 = performance.now();
      const masks = await processor.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
      const d2 = performance.now();
      giri.push({ prepara: Math.round(b2 - a), modello: Math.round(c2 - b2), maschera: Math.round(d2 - c2) });
    }
    return { carica, giri };
  } catch (e) { return { errore: String(e?.message || e).slice(0, 400) }; }
}, { repo, dtype });
console.log(repo, dtype, JSON.stringify(r));
await b.close(); srv.chiudi();
