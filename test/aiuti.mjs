// Piccoli attrezzi comuni alle prove nuove (prove-nuove.mjs, prove-animazioni.mjs, prove-montage.mjs).

/** i colori nell'immagine piccola letta dal monitor: [r, g, b] a (x, y) su una griglia 64×36 */
export const leggi = (page, punti, vista = 0) => page.evaluate(async ([punti, vista]) => {
  const rec = window.__motore.rec;
  rec.vistaChiave = vista;
  window.__motore.ridisegna();
  await new Promise((r) => setTimeout(r, 450));
  const px = new Uint8Array(64 * 36 * 4);
  rec.leggiPiccolo(64, 36, px);
  rec.vistaChiave = 0;
  return punti.map(([x, y]) => { const i = ((35 - y) * 64 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; });
}, [punti, vista]);

/** a vicino a b (ogni canale entro tol) */
export const vicino = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);


/** le sezioni delle proprietà partono chiuse: le prove che ci lavorano dentro le aprono (e restano aperte). "Effetti e look" no: disegna una ventina di miniature, e sui computer senza scheda video (la CI) blocca la pagina per qualche secondo */
export const apriGruppi = async (page) => {
  await page.evaluate(() => { document.querySelectorAll('.isp-gruppo:not([open]) > summary').forEach((x) => { if (x.parentElement.dataset.g !== 'fxv') x.click(); }); });
  await page.waitForTimeout(150);
};
