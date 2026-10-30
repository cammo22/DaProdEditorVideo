import { chromium } from 'playwright';
import path from 'node:path';
import assert from 'node:assert/strict';
import { servi } from './servi.mjs';

const server = await servi(path.resolve('dist'));
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(server.url + '/app/');
    await page.waitForSelector('.pagina-btn[data-p=live]');
    await page.click('.pagina-btn[data-p=live]');
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Stile presentazione' }).click();
    const misure = await page.locator('.live-comandi').evaluate(c => ({ altezza: c.clientHeight, contenuto: c.scrollHeight, larghezza: c.clientWidth, contenutoLargo: c.scrollWidth }));
    console.log(`${width}×${height}: ${JSON.stringify(misure)}`);
    assert.ok(misure.contenuto <= misure.altezza && misure.contenutoLargo <= misure.larghezza, 'Le impostazioni devono stare tutte nella colonna');
    await page.close();
  }
} finally {
  await browser.close();
  server.chiudi();
}



