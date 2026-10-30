// Ingombri del Finale e coordinate delle curve. Usa il build, chiude sempre Chromium.
// npm run build && node test/prove-finale-compatto.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { servi } from './servi.mjs';
const out = 'test/.out/finale-compatto';
mkdirSync(out, { recursive: true });
const server = process.env.DPV_URL ? null : await servi(path.resolve('dist'));
const url = process.env.DPV_URL ?? `${server.url}/app/`;
const browser = await chromium.launch({ headless: true });
const risultati = [];
try {
  // Gli ultimi due casi sono un display 3840×2160 al 150% e 200%.
  for (const [width, height, dpr] of [[1920,1080,1], [2560,1440,1], [2560,1440,1.5], [1920,1080,2]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    try {
      const page = await ctx.newPage();
      const errori = [];
      page.on('pageerror', e => errori.push(e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__dpvTest?.ui());
      await page.evaluate(async () => {
        const { P, importaFile } = window.__dpvTest;
        const tela = document.createElement('canvas'); tela.width = 960; tela.height = 540;
        const ctx = tela.getContext('2d'), sfondo = ctx.createLinearGradient(0, 0, 960, 540);
        sfondo.addColorStop(0, '#183c4b'); sfondo.addColorStop(1, '#ae7459');
        ctx.fillStyle = sfondo; ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = '#e8dbb5'; ctx.fillRect(180, 120, 250, 300);
        ctx.fillStyle = '#264d64'; ctx.beginPath(); ctx.arc(650, 270, 140, 0, Math.PI * 2); ctx.fill();
        const blob = await new Promise(ok => tela.toBlob(ok));
        const [media] = await importaFile([{ name: 'Quadro di prova.png', file: new File([blob], 'Quadro di prova.png', { type: 'image/png' }) }], { chiediFormato: false });
        window.__dpv.edit('Ripresa di prova', p => p.clips.push(P.newClip('media', p.tracks.find(t => t.kind === 'video').id, 0, 500, { name: 'Ripresa di prova', media: media.id })));
        document.dispatchEvent(new CustomEvent('dpv:finale', { detail: 'esporta' }));
      });
      await page.evaluate(() => document.fonts.ready);
      const controlla = async nome => {
        const r = await page.evaluate(() => {
          const e = document.querySelector('.fin-corpo'), r = e.getBoundingClientRect();
          const tagliati = [...e.querySelectorAll('button, select, input')].filter(b => {
            if (!b.getClientRects().length) return false;
            const q = b.getBoundingClientRect();
            return q.bottom > r.bottom + 1 || q.right > r.right + 1 || q.left < r.left - 1;
          }).map(b => b.textContent || b.getAttribute('aria-label'));
          return { verticale: e.scrollHeight - e.clientHeight, orizzontale: e.scrollWidth - e.clientWidth, body: document.documentElement.scrollWidth - innerWidth, tagliati };
        });
        risultati.push({ width, height, dpr, nome, ...r });
        assert.ok(r.verticale <= 1 && r.orizzontale <= 1 && r.body <= 1 && !r.tagliati.length, `${nome}: ${JSON.stringify(r)}`);
      };
      for (const s of ['esporta', 'colore', 'audio', 'sottotitoli', 'logo', 'apertura', 'lingue']) {
        await page.click(`.fin-voce[data-s=${s}]`);
        await controlla(s);
        const navs = page.locator('.fin-pagina > .fin-schede > .fin-schede-nav > button');
        for (let i = 0; i < await navs.count(); i++) { await navs.nth(i).click(); await controlla(`${s}/${i}`); }
      }
      await page.click('.fin-voce[data-s=esporta]');
      for (const nome of ['Destinazione', 'Volume', 'Formato', 'Opzioni', 'Coda']) {
        await page.locator('.es-banco .fin-schede-nav').getByRole('button', { name: nome, exact: true }).click();
        await controlla(`uscita/${nome}`);
      }
      assert.ok(await page.locator('.fin-piede .fin-vai').isVisible());
      await page.screenshot({ path: `${out}/uscita-${width}-${dpr}.png` });
      await page.click('.fin-voce[data-s=colore]');
      await page.locator('.fin-pagina > .fin-schede > .fin-schede-nav').getByRole('button', { name: 'Montaggio', exact: true }).click();
      for (const nome of ['Automatico', 'Look', 'Ritocchi']) {
        await page.locator('.fin-pagina .fin-schede-nav:visible').getByRole('button', { name: nome, exact: true }).click();
        await controlla(`montaggio/${nome}`);
      }
      await page.locator('.fin-pagina > .fin-schede > .fin-schede-nav').getByRole('button', { name: 'Clip scelta', exact: true }).click();
      for (const nome of ['Look', 'Ruote', 'Curve']) {
        await page.locator('.colore-avanzato .fin-schede-nav').getByRole('button', { name: nome, exact: true }).click();
        await controlla(`clip/${nome}`);
      }
      await page.waitForFunction(() => { const e = document.querySelector('.ca-curva'); return e.width === Math.round(e.clientWidth * devicePixelRatio); });
      const curva = await page.locator('.ca-curva').evaluate(e => ({ w: e.clientWidth, h: e.clientHeight, pixel: e.width }));
      assert.ok(Math.abs(curva.w - curva.h) <= 1 && curva.w <= 360);
      await page.locator('.ca-curve-strumenti').getByRole('button', { name: 'Aggiungi', exact: true }).click();
      let punti = await page.evaluate(() => { window.__dpv.flushNow(); return window.__dpv.doc.clips[0].fx.colore.curve.master; });
      assert.equal(punti.length, 3);
      await page.locator('.ca-curva').waitFor({ state: 'visible' });
      const r = await page.locator('.ca-curva').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down(); await page.mouse.move(r.x + r.width * .35, r.y + r.height * .35); await page.mouse.up();
      punti = await page.evaluate(() => window.__dpv.doc.clips[0].fx.colore.curve.master);
      assert.ok(Math.abs(punti[1].x - .35) < .01 && Math.abs(punti[1].y - .65) < .01, 'Puntatore e curva devono coincidere anche con DPR diverso');
      await page.evaluate(() => { window.__dpv.doUndo(); window.__dpv.flushNow(); });
      assert.equal(await page.evaluate(() => window.__dpv.doc.clips[0].fx.colore.curve.master[1].x), .5);
      await page.locator('.ca-curve-strumenti').getByRole('button', { name: 'Togli punto', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__dpv.doc.clips[0].fx.colore.curve.master.length), 2);
      await page.screenshot({ path: `${out}/curve-${width}-${dpr}.png` });
      risultati.push({ width, height, dpr, curva });
      // Le altre pagine si misurano a riposo; le anteprime animate di Montage hanno prove dedicate.
      await page.evaluate(() => { window.__dpv.edit('Svuota la prova', p => { p.clips = []; p.media = []; }); window.__dpv.flushNow(); });
      // Densità delle altre pagine, senza avviare registrazioni o modelli.
      for (const pg of ['live', 'montage', 'montaggio']) {
        await page.click(`.pagina-btn[data-p=${pg}]`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${pg}: overflow orizzontale`);
        if (pg === 'live') {
          const delta = await page.locator('.live-comandi').evaluate(e => e.scrollHeight - e.clientHeight);
          assert.ok(delta <= 1, `LIVE: scorrimento ${delta}`);
        }
        if (pg === 'montage') {
          const passi = page.locator('.mt-vai');
          assert.equal(await passi.count(), 4);
          for (let i = 0; i < 4; i++) { if (await passi.nth(i).isEnabled()) await passi.nth(i).click(); assert.ok(await passi.nth(i).isVisible()); }
          assert.ok(await passi.nth(3).isDisabled(), 'Senza file il quarto passo resta visibile ma disabilitato');
        }
        if (pg !== 'montaggio') await page.screenshot({ path: `${out}/${pg}-${width}-${dpr}.png` });
      }
      await page.click('.btn-progetti');
      await page.waitForSelector('.home.hm', { state: 'visible' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/home-${width}-${dpr}.png` });
      assert.deepEqual(errori, []);
    } finally { await ctx.close(); }
  }
} finally {
  await browser.close();
  server?.chiudi();
  writeFileSync(`${out}/misure.json`, JSON.stringify(risultati, null, 2));
}
console.log(`Finale: ${risultati.length} controlli passati, quattro viewport CSS/DPR; curve, trascinamento, annulla, LIVE, Montage e Home.`);
