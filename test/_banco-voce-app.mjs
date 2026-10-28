// Whisper large-v3-turbo dal worker vero dell'app (non è una prova della suite): si carica con i pesi a 4 bit sulla scheda video? node test/_banco-voce-app.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { servi } from './servi.mjs';
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pulsantiera');
const r = await page.evaluate(async () => {
  try {
    const { V } = window.__dpvTest;
    const t = performance.now();
    const dove = await V.caricaModelloVoce('onnx-community/whisper-large-v3-turbo', () => {});
    return { dove, secondi: (performance.now() - t) / 1000 };
  } catch (e) { return { errore: String(e?.message || e).slice(0, 300) }; }
});
console.log(JSON.stringify(r));
await b.close(); srv.chiudi();
