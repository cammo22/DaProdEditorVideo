// Disegna le immagini del README (copertina, pulsanti di download, funzioni, passi) in stile «Banco» e fotografa
// l'app vera (build web servita in locale) per la vetrina. Uso: npm run build && node scripts/readme-immagini.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'risorse/readme';
fs.mkdirSync(OUT, { recursive: true });
const BASE = `<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0}body{background:#0b0a0f;color:#ebe7f4;font-family:Rajdhani,sans-serif}
.inc{font-size:22px;font-weight:700;letter-spacing:6px;color:#8d889c}.mono{font-family:'Share Tech Mono',monospace}
.met{background:linear-gradient(180deg,#2c2b34,#1d1c23);border:1px solid rgba(255,255,255,.13)}
.spia{display:inline-block;width:14px;height:14px;border-radius:50%}
.chip{font-size:24px;padding:10px 18px;border-radius:6px;background:#050407;border:1px solid rgba(255,255,255,.1)}</style>`;

const spia = (c) => `<span class="spia" style="background:${c};box-shadow:0 0 12px ${c}"></span>`;

function bottone(sistema, titolo, sotto, colore, oro, spento = false) {
  const fondo = oro ? 'background:#ffd54a;color:#14110a' : `background:#15141b;border:2px solid ${colore}`;
  return `<div style="height:200px;padding:30px 40px;display:flex;align-items:center;gap:30px;border-radius:14px;${fondo}${spento ? ';opacity:.55' : ''}">
    <div style="font-size:70px;line-height:1">${spento ? '⏳' : '⬇'}</div>
    <div style="display:flex;flex-direction:column;gap:4px"><div style="font-size:22px;font-weight:700;letter-spacing:6px;opacity:.8">${sistema}</div>
    <div style="font-size:50px;font-weight:700">${titolo}</div><div style="font-size:26px;opacity:.8">${sotto}</div></div></div>`;
}

const FUNZIONI = [
  ['MONTAGGIO', 'Il banco di sempre', '1 taglia, 2 elimina. Niente si copre da solo. Timeline a 60 fps.', '#ffd54a'],
  ['LIVE', 'Registra lo schermo', 'Webcam, voce a parte, scene in diretta e zoom che segue il cursore.', '#ff4d6d'],
  ['MONTAGE', 'Monta da solo', 'Foto e video, 28 stili, tagli sul battito della musica.', '#35e8ff'],
  ['COLORE', 'Da professionisti', 'Colore automatico, curve, LUT, keyframe e maschere.', '#5dffb4'],
  ['AI LOCALE', 'Sul tuo PC', 'Sottotitoli, voce pulita, sfondo via, traduzione. Le pesanti sono opzionali.', '#35e8ff'],
  ['FINALE', 'Esce perfetto', 'Volume giusto (LUFS), controllo prima dell\'uscita, preset YouTube e Reel.', '#ffd54a'],
];
const PASSI = [['1', 'Scarica', 'Il setup per Windows o il DMG per Mac.'], ['2', 'Installa', 'Due clic. Si aggiorna da solo.'], ['3', 'Monta', 'Trascina i file sul banco, o premi REC.']];

const pagine = {
  hero: [1800, 620, `<div style="height:620px;padding:70px 90px;display:flex;justify-content:space-between;align-items:center;background:radial-gradient(circle at 80% 30%,#1c2733 0,#0b0a0f 60%)">
    <div style="display:flex;flex-direction:column;gap:22px">
      <div class="inc">DAPROD PRODUZIONI · SALA DI MONTAGGIO</div>
      <div style="font-family:Orbitron;font-weight:800;font-size:96px;line-height:1">DaP <span style="color:#ffd54a">Editor Video</span></div>
      <div style="font-size:38px;color:#cfcadb;max-width:900px">Vecchio stile, moderno dentro. Monti, registri lo schermo, ritocchi il colore ed esporti: tutto sul tuo PC.</div>
      <div style="display:flex;gap:16px;margin-top:10px">
        <span class="mono chip">${spia('#ff4d6d')}&nbsp; REC LIVE</span><span class="mono chip">${spia('#5dffb4')}&nbsp; 60 FPS</span><span class="mono chip">${spia('#35e8ff')}&nbsp; AI LOCALE</span>
      </div>
    </div>
    <div style="padding:22px 30px;border-radius:10px;background:#050407;border:1px solid rgba(255,255,255,.1)"><div class="mono" style="font-size:86px;color:#ffd54a;letter-spacing:4px">00:12:48:17</div></div>
  </div>`],
  'scarica-win': [880, 200, bottone('WINDOWS', 'Scarica l\'installer', 'Setup .exe · si aggiorna da solo', '#ffd54a', true)],
  'scarica-portatile': [880, 200, bottone('WINDOWS', 'Versione portatile', 'Un solo .exe, niente installazione', '#35e8ff', false)],
  'scarica-macos': [880, 200, bottone('MAC', 'Scarica per Mac', 'DMG universale · Apple Silicon e Intel', '#5dffb4', false)],
  'scarica-linux': [880, 200, bottone('LINUX', 'In arrivo', 'Dopo Windows e Mac', '#8d889c', false, true)],
  funzioni: [1800, 760, `<div style="padding:60px 70px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px">${FUNZIONI.map(([e, t, d, c]) =>
    `<div style="padding:30px;border-radius:10px;background:#15141b;border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">${spia(c)}<span class="inc">${e}</span></div>
      <div style="font-size:42px;font-weight:700">${t}</div><div style="font-size:27px;color:#a19db0">${d}</div></div>`).join('')}</div>`],
  passi: [1800, 330, `<div style="padding:50px 70px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px">${PASSI.map(([n, t, d]) =>
    `<div class="met" style="padding:30px;border-radius:10px;display:flex;gap:24px;align-items:center">
      <div class="mono" style="font-size:80px;color:#ffd54a">${n}</div><div><div style="font-size:42px;font-weight:700">${t}</div><div style="font-size:26px;color:#a19db0">${d}</div></div></div>`).join('')}</div>`],
};

const b = await chromium.launch();
for (const [nome, [w, h, html]] of Object.entries(pagine)) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">${BASE}</head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(OUT, nome + '.png') });
  await p.close();
}

// la vetrina: l'app vera, dalla build web
const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let f = path.join('dist', decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader('Content-Type', tipi[path.extname(f)] ?? 'application/octet-stream');
  fs.createReadStream(f).pipe(r);
}).listen(8979);
const app = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await app.goto(process.env.APP_URL ?? 'http://127.0.0.1:8979/app/');
await app.waitForTimeout(3000);
await app.screenshot({ path: path.join(OUT, 'vetrina-1.png') });
for (const [pagina, file] of [['finale', 'vetrina-2.png'], ['live', 'vetrina-3.png']]) {
  await app.evaluate((p) => document.dispatchEvent(new CustomEvent('dpv:pagina', { detail: p })), pagina);
  await app.waitForTimeout(1500);
  await app.screenshot({ path: path.join(OUT, file) });
}
await b.close();
srv.close();
console.log('immagini del README pronte in', OUT);
