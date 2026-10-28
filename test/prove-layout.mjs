// Regressione 1.5.8: albero leggibile anche con la disposizione larga salvata dall'utente.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { servi } from './servi.mjs';

const out = path.resolve('test/.out');
fs.mkdirSync(out, { recursive: true });
const srv = await servi(path.resolve('dist'));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1009 } });
  await page.addInitScript(() => {
    localStorage.setItem('dpv-banco', JSON.stringify({ o: { '--bin': '960px' }, cls: ['lato-lungo'] }));
    localStorage.setItem('dpv-versione-vista', '1.6.5');
  });
  await page.goto(srv.url + '/app/');
  await page.waitForSelector('.bin-albero');
  await page.waitForSelector('.avvio', { state: 'detached' });
  await page.locator('.bin-cat[data-c=titoli]').click();
  await page.screenshot({ path: path.join(out, 'layout-corretto.png') });
  const misura = () => page.evaluate(() => {
    const albero = document.querySelector('.bin-albero');
    const nome = albero.querySelector('.bin-cat .nome');
    return { albero: albero.getBoundingClientRect().width, nome: nome.getBoundingClientRect().width,
      griglia: document.querySelector('.bin-corpo').getBoundingClientRect().width };
  });
  const corretto = await misura();
  assert(corretto.albero >= 180 && corretto.nome > 60, JSON.stringify(corretto));
  // Controllo che la prova intercetti proprio il difetto dello screenshot.
  const vecchio = await page.addStyleTag({ content: '.bin-albero { max-width: 38%; }' });
  assert((await misura()).albero < 100, 'La regressione deve riprodurre la barra schiacciata');
  await page.screenshot({ path: path.join(out, 'layout-prima.png') });
  await vecchio.evaluate(el => el.remove());
  await page.evaluate(() => document.querySelector('#app').style.removeProperty('--bin'));
  for (const width of [1920, 1366, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.locator('.bin-cat[data-c=titoli]').isVisible());
    assert(await page.locator('.monitor').isVisible());
    assert(await page.locator('.pulsantiera').isVisible());
    assert(await page.locator('.timeline').isVisible());
  }
  console.log('OK layout: barra larga ripristinata, categorie, monitor e timeline su 1920/1366/1024');
} finally { await browser.close(); srv.chiudi(); }
