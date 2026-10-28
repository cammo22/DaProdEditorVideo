// SAM 3 su ogni fotogramma contro SAM 3 + SAM 2.1 che segue, su una ripresa vera (non è una prova della suite): stessa scelta, quanto si somigliano le maschere e quanto ci mettono.
//   node test/_banco-sam-vero.mjs <ripresa.mp4> <x> <y> [secondoInizio]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { servi } from './servi.mjs';
const [file, x = '0.5', y = '0.5', t0 = '3'] = process.argv.slice(2);
const srv = await servi(path.resolve('dist'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--enable-features=Vulkan'] });
const page = await b.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 200)); });
await page.route('**/ripresa.mp4', (r) => r.fulfill({ path: file, contentType: 'video/mp4' }));
await page.goto(srv.url + '/app/', { timeout: 120000, waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pulsantiera');
const r = await page.evaluate(async ({ x, y, t0 }) => {
  try {
    const { P, RT, MK, importaFile } = window.__dpvTest;
    const blob = await (await fetch('/ripresa.mp4')).blob();
    const [m] = await importaFile([{ name: 'ripresa.mp4', file: new File([blob], 'ripresa.mp4', { type: 'video/mp4' }) }], { chiediFormato: false });
    for (let i = 0; i < 100 && !window.__dpvTest.mediaRT(m.id)?.v; i++) await new Promise((r) => setTimeout(r, 100));
    const tv = window.__dpv.doc.tracks.find((t) => t.kind === 'video');
    const fai = async (modello) => {
      let id = '';
      window.__dpv.edit('R', (p) => { const c = P.newClip('media', tv.id, 0, 200, { media: m.id, name: 'R' + modello, srcIn: t0 * 25 / 25 }); c.ritaglio = { modo: 'oggetti', modello, bordo: 0, morbido: 0.2, qualita: 1, punti: [{ x, y, dentro: true }], da: t0, segui: true }; p.clips.push(c); id = c.id; });
      const c = window.__dpv.doc.clips.find((z) => z.id === id);
      const t = performance.now();
      const es = await RT.elaboraRitaglio(window.__dpv.doc, c, { anteprima: 2 });
      return { es, secondi: (performance.now() - t) / 1000 };
    };
    RT.impostaTracciaVeloce(false); const a = await fai('sam3');
    RT.impostaTracciaVeloce(true); const b2 = await fai('sam3'); // a = SAM 3 su ogni fotogramma, b2 = SAM 3 sul primo e SAM 2.1 che segue
    if (!a.es.ok || !b2.es.ok) return { errore: [a.es.motivo, b2.es.motivo] };
    const A = a.es.maschere, B = b2.es.maschere;
    const n = Math.min(A.n, B.n);
    const iou = [], areaA = [], areaB = [];
    for (let i = 0; i < n; i++) { let u = 0, k = 0, sa = 0, sb = 0; for (let j = 0; j < A.dati[i].length; j++) { const p = A.dati[i][j] > 127, q = B.dati[i][j] > 127; if (p || q) u++; if (p && q) k++; if (p) sa++; if (q) sb++; } iou.push(+(k / Math.max(1, u)).toFixed(3)); areaA.push(+(sa / A.dati[i].length).toFixed(3)); areaB.push(+(sb / A.dati[i].length).toFixed(3)); }
    // un fotogramma per guardare: l'immagine e le due maschere affiancate
    const draw = (mk, i) => { const cv = document.createElement('canvas'); cv.width = mk.w; cv.height = mk.h; const cx = cv.getContext('2d'); const im = cx.createImageData(mk.w, mk.h); for (let j = 0; j < mk.w * mk.h; j++) { const v = mk.dati[i][j]; im.data[j * 4] = im.data[j * 4 + 1] = im.data[j * 4 + 2] = v; im.data[j * 4 + 3] = 255; } cx.putImageData(im, 0, 0); return cv.toDataURL('image/png'); };
    const k = Math.floor(n / 2);
    return { n, puro: { s: a.secondi, w: A.w, h: A.h }, ibrido: { s: b2.secondi }, iou, mediaIou: +(iou.reduce((s, v) => s + v, 0) / n).toFixed(3), minIou: Math.min(...iou), areaA, areaB, png3: draw(A, k), png2: draw(B, k) };
  } catch (e) { return { errore: String(e?.message || e).slice(0, 300) }; }
}, { x: Number(x), y: Number(y), t0: Number(t0) });
if (r.png3) { fs.mkdirSync('test/.out', { recursive: true }); fs.writeFileSync('test/.out/sam3-mask.png', Buffer.from(r.png3.split(',')[1], 'base64')); fs.writeFileSync('test/.out/sam2-mask.png', Buffer.from(r.png2.split(',')[1], 'base64')); delete r.png3; delete r.png2; }
console.log(JSON.stringify(r));
await b.close(); srv.chiudi();
