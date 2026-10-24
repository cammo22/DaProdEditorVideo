// SOLO Luna/Haiku: Chromium/WebGL reale. Sol scrive questa prova, non la esegue.
// Baseline 1.5.7: DPV_DIST=<dist-base> node test/prove-effetti.mjs --cattura=test/.out/fx-base.json
// Candidato: node test/prove-effetti.mjs --riferimento=test/.out/fx-base.json [--bench]
// DPV_GPU=1 non forza SwiftShader; verificare il renderer, non implica GPU hardware.
// Confronto dei pixel PRIMA del codec: monitor vs fornitore export, non MP4 bit-a-bit.
import { chromium } from 'playwright';
import { servi } from './servi.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const valore = (k) => process.argv.find((a) => a.startsWith(k + '='))?.slice(k.length + 1);
const cattura = valore('--cattura'), riferimento = valore('--riferimento');
if (!cattura && !riferimento) throw Error('Serve --cattura=<file baseline> oppure --riferimento=<baseline esistente>. Nessun hash inventato.');
const OUT = path.join(ROOT, 'test/.out'); fs.mkdirSync(OUT, { recursive: true });
const srv = await servi(path.resolve(process.env.DPV_DIST || path.join(ROOT, 'dist')));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.DPV_GPU === '1' ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('console', (m) => { if (m.text().startsWith('[fx-probe]')) console.log(m.text()); });
  page.on('crash', () => console.error('[fx-probe] PAGE CRASH'));
  // Solo diagnostica: non attivare durante i benchmark.
  if (process.env.DPV_DIAG_GL === '1') await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype;
    for (const nome of ['compileShader', 'getShaderParameter', 'linkProgram', 'getProgramParameter', 'drawArrays', 'readPixels']) {
      const originale = proto[nome];
      proto[nome] = function (...args) {
        console.log('[fx-probe] prima ' + nome);
        const risultato = originale.apply(this, args);
        console.log('[fx-probe] dopo ' + nome);
        return risultato;
      };
    }
  });
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await page.goto(srv.url + '/app/'); await page.waitForFunction(() => !!window.__dpvTest?.Compositore);
  const dati = await page.evaluate(async ({ bench }) => {
    const { P, B, Compositore, pianoVideo, importaFile, mediaRT } = window.__dpvTest;
    const img = new OffscreenCanvas(320, 180), x = img.getContext('2d');
    const px = x.createImageData(320, 180);
    for (let y = 0; y < 180; y++) for (let xx = 0; xx < 320; xx++) {
      px.data.set([(xx * 13 + y * 7) % 256, (xx * 3 + y * 19) % 256, ((xx >> 3) + (y >> 3)) % 2 ? 220 : 30, 255], (y * 320 + xx) * 4);
    }
    x.putImageData(px, 0, 0);
    const blob = await img.convertToBlob({ type: 'image/png' });
    const [m] = await importaFile([{ name: 'riferimento-fx.png', file: new File([blob], 'riferimento-fx.png', { type: 'image/png' }) }], { chiediFormato: false });
    const p = P.newProject({ w: 320, h: 180, rate: { num: 25, den: 1 }, drop: false });
    p.media = [m]; const t = p.tracks.find((t) => t.kind === 'video').id;
    p.clips = [P.newClip('media', t, 0, 250, { media: m.id })];
    console.log('[fx-probe] costruisco monitor');
    const mon = new Compositore(new OffscreenCanvas(320, 180), true);
    const info = mon.gl.getExtension('WEBGL_debug_renderer_info');
    console.log('[fx-probe] renderer ' + mon.gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : mon.gl.RENDERER));
    console.log('[fx-probe] costruisco export');
    const exp = new Compositore(new OffscreenCanvas(320, 180), true);
    console.log('[fx-probe] compositori pronti');
    const digest = async (a) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', a))).map((v) => v.toString(16).padStart(2, '0')).join('');
    const render = (comp, f, exporta) => {
      comp.render(p, pianoVideo(p, f), false, f, exporta ? () => mediaRT(m.id).image : undefined);
      const out = new Uint8Array(320 * 180 * 4); comp.leggiPiccolo(320, 180, out); return out;
    };
    const righe = [];
    try {
      const neutro = await digest(render(mon, 37, false));
      const casi = [...B.EFFETTI_TEMPO.map((e) => [e.id]), ['grana', 'nitido'], ['censura', 'rgb', 'sfoca']].filter((ids) => ids.every((id) => B.effettoTempo(id)));
      for (const ids of casi) {
        console.log('[fx-probe] caso ' + ids.join('+'));
        p.clips = p.clips.filter((c) => c.kind !== 'fx');
        for (const id of ids) B.posaBlocco(p, B.nuovoBlocco('effetto', id), 0, 250, t);
        const a = render(mon, 37, false), b = render(exp, 37, true), ripeti = render(mon, 37, false);
        righe.push({ id: ids.join('+'), monitor: await digest(a), export: await digest(b), ripeti: await digest(ripeti), neutro });
      }
      const coperture = [];
      if (B.effettoTempo('censura')) {
        p.clips = p.clips.filter((c) => c.kind !== 'fx');
        const originale = render(mon, 37, false);
        const at = (a, xx, yy) => [...a.slice(((179 - yy) * 320 + xx) * 4, ((179 - yy) * 320 + xx) * 4 + 3)].join(',');
        const mosaicoPieno = (a, cx, cy, w = 0.25, h = 0.25) => {
          let n = 0, uguali = 0;
          for (let yy = Math.ceil((cy - h * 0.4) * 180); yy < (cy + h * 0.4) * 180; yy++) {
            for (let xx = Math.ceil((cx - w * 0.4) * 320); xx < (cx + w * 0.4) * 320 - 1; xx++) {
              if (xx < 0 || xx >= 319 || yy < 0 || yy >= 180 || Math.floor((xx + 0.5) / 10.8) !== Math.floor((xx + 1.5) / 10.8)) continue;
              n++; if (at(a, xx, yy) === at(a, xx + 1, yy)) uguali++;
            }
          }
          return n > 0 && uguali / n > 0.98;
        };
        const bl = B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'censura'), pos: [0.25, 0.5], parametri: { larghezza: 0.2, altezza: 0.25, morbido: 0 } }, 0, 250, t);
        for (const f of [0, 37, 249]) {
          const a = render(mon, f, false);
          coperture.push({ caso: 'zona e bordi temporali ' + f, ok: mosaicoPieno(a, 0.25, 0.5, 0.2) && at(a, 250, 90) === at(originale, 250, 90) });
        }
        B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'censura'), pos: [0.75, 0.5], parametri: { larghezza: 0.2, altezza: 0.25, morbido: 0 } }, 0, 250, t);
        const due = render(mon, 37, false);
        coperture.push({ caso: 'due zone indipendenti, centro intatto', ok: mosaicoPieno(due, 0.25, 0.5, 0.2) && mosaicoPieno(due, 0.75, 0.5, 0.2) && at(due, 160, 90) === at(originale, 160, 90) });
        p.clips = p.clips.filter((c) => c.kind !== 'fx');
        for (let i = 0; i < 9; i++) B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'censura'), pos: [0.1 + i * 0.1, 0.5] }, 0, 250, t);
        const nove = render(mon, 37, false);
        coperture.push({ caso: 'overflow nove zone copre tutto l’inviluppo', ok: [0.1, 0.5, 0.9].every((cx) => mosaicoPieno(nove, cx, 0.5, 0.1, 0.1)) });
        p.clips = p.clips.filter((c) => c.kind !== 'fx');
        B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'censura'), forza: 0 }, 0, 250, t);
        coperture.push({ caso: 'forza zero neutra', ok: await digest(render(mon, 37, false)) === await digest(originale) });
        void bl;
      }
      const tempi = [];
      if (bench) {
        mon.canvas.width = p.w = 1920; mon.canvas.height = p.h = 1080;
        for (const ids of [[], ['sfoca'], ['bagliore'], ['grana'], ['nitido'], ['censura'], ['sfoca', 'rgb', 'bagliore']]) {
          if (!ids.every((id) => B.effettoTempo(id))) continue;
          p.clips = p.clips.filter((c) => c.kind !== 'fx');
          for (const id of ids) B.posaBlocco(p, B.nuovoBlocco('effetto', id), 0, 250, t);
          for (let i = 0; i < 3; i++) { mon.render(p, pianoVideo(p, 37), false, 37); mon.gl.finish(); }
          const a = performance.now();
          for (let i = 0; i < 12; i++) { mon.render(p, pianoVideo(p, 37), false, 37); mon.gl.finish(); }
          tempi.push({ ids, msPerFrame: (performance.now() - a) / 12 });
        }
      }
      return { righe, coperture, tempi, renderer: mon.gl.getParameter(mon.gl.RENDERER), versione: navigator.userAgent };
    } finally { mon.distruggi(); exp.distruggi(); }
  }, { bench: process.argv.includes('--bench') });
  fs.writeFileSync(path.join(OUT, 'effetti-esito.json'), JSON.stringify(dati, null, 2));
  assert.equal(errori.length, 0, errori.join('\n'));
  for (const r of dati.righe) { assert.equal(r.monitor, r.export, 'monitor/export: ' + r.id); assert.equal(r.monitor, r.ripeti, 'determinismo: ' + r.id); }
  for (const c of dati.coperture) assert.ok(c.ok, 'copertura spaziale: ' + c.caso);
  if (cattura) {
    assert.ok(!fs.existsSync(path.resolve(cattura)), 'Non sovrascrivere una baseline: scegli un file nuovo');
    fs.mkdirSync(path.dirname(path.resolve(cattura)), { recursive: true });
    fs.writeFileSync(path.resolve(cattura), JSON.stringify(dati, null, 2));
    console.log('Baseline GPU reale salvata:', cattura, dati.righe.length, 'casi');
  }
  if (riferimento) {
    const ref = JSON.parse(fs.readFileSync(path.resolve(riferimento), 'utf8'));
    for (const r of ref.righe) assert.equal(dati.righe.find((c) => c.id === r.id)?.monitor, r.monitor, 'regressione pixel esistente: ' + r.id);
    for (const id of ['grana', 'nitido', 'censura', 'grana+nitido', 'censura+rgb+sfoca']) {
      const r = dati.righe.find((r) => r.id === id); assert.ok(r && r.monitor !== r.neutro, 'nuovo effetto visibile: ' + id);
    }
  }
  console.log('Pixel monitor/export identici:', dati.righe.length, 'casi. Tempi:', JSON.stringify(dati.tempi));
} finally { await browser?.close(); srv.chiudi(); }
