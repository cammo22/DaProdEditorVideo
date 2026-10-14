// Le prove della 1.1.4: togliere lo sfondo (colori e AI), le animazioni e DaProdMontage.
// Girano dentro prove.mjs (alla fine), oppure da sole: `node test/prove-nuove.mjs` (più veloce, parte da un banco vuoto).
//   npm run build && node test/prove-nuove.mjs [sfondo|animazioni|montage]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { servi } from './servi.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { leggi, vicino, apriGruppi } from './aiuti.mjs';
export { leggi, vicino };

export async function proveNuove(ctx, quali = ['sfondo', 'animazioni', 'montage', 'pannello', 'seguito', 'attivita', 'rifiniture', 'aiuto', 'banco', 'correzioni', 'proprieta']) {
  const { page, prova, OUT } = ctx;
  if (quali.includes('sfondo')) await proveSfondo({ page, prova, OUT });
  if (quali.includes('animazioni')) { const m = await import('./prove-animazioni.mjs').catch(() => null); if (m) await m.proveAnimazioni({ page, prova, OUT }); }
  if (quali.includes('seguito')) { const m = await import('./prove-seguito.mjs').catch((e) => { console.log('  ✗ prove-seguito:', e.message); return null; }); if (m) await m.proveSeguito({ page, prova, OUT }); }
  if (quali.includes('pannello')) { const m = await import('./prove-pannello.mjs').catch((e) => { console.log('  ✗ prove-pannello:', e.message); return null; }); if (m) await m.provePannello({ page, prova, OUT }); }
  if (quali.includes('attivita')) { const m = await import('./prove-attivita.mjs').catch((e) => { console.log('  ✗ prove-attivita:', e.message); return null; }); if (m) await m.proveAttivita({ page, prova, OUT }); }
  if (quali.includes('aiuto')) { const m = await import('./prove-aiuto.mjs').catch((e) => { console.log('  ✗ prove-aiuto:', e.message); return null; }); if (m) await m.proveAiuto({ page, prova, OUT }); }
  if (quali.includes('rifiniture')) { const m = await import('./prove-rifiniture.mjs').catch((e) => { console.log('  ✗ prove-rifiniture:', e.message); return null; }); if (m) await m.proveRifiniture({ page, prova, OUT }); }
  if (quali.includes('banco')) { const m = await import('./prove-banco.mjs').catch((e) => { console.log('  ✗ prove-banco:', e.message); return null; }); if (m) await m.proveBanco({ page, prova, OUT }); }
  if (quali.includes('correzioni')) { const m = await import('./prove-correzioni.mjs').catch((e) => { console.log('  ✗ prove-correzioni:', e.message); return null; }); if (m) await m.proveCorrezioni({ page, prova, OUT }); }
  if (quali.includes('proprieta')) { const m = await import('./prove-proprieta.mjs').catch((e) => { console.log('  ✗ prove-proprieta:', e.message); return null; }); if (m) await m.proveProprieta({ page, prova, OUT }); }
  if (quali.includes('montage')) { const m = await import('./prove-montage.mjs').catch(() => null); if (m) await m.proveMontage({ page, prova, OUT }); }
}

// ——————————————————————————————————————————————————————————————————————
//  Togliere lo sfondo
// ——————————————————————————————————————————————————————————————————————
async function proveSfondo({ page, prova, OUT }) {
  console.log('▶ Togliere lo sfondo: le cose pure');
  const pure = await page.evaluate(() => {
    const { SF } = window.__dpvTest;
    const w = 64, h = 36, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dentro = x >= 20 && x < 44 && y >= 10 && y < 26;
      d.set(dentro ? [220, 30, 30, 255] : [0, 177, 64, 255], (y * w + x) * 4);
    }
    const dom = SF.coloreDominante(d, w, h);
    const grigio = new Uint8ClampedArray(w * h * 4).fill(128);
    const dg = SF.coloreDominante(grigio, w, h);
    const piano = SF.istantiCampioni(0, 10, 8, 512, 288);
    const stretto = SF.istantiCampioni(0, 60, 12, 512, 288, 1_000_000);
    const c = SF.campioneAl(1.3, 0, 0.5, 5);
    const fine = SF.campioneAl(99, 0, 0.5, 5);
    const r1 = { modo: 'oggetti', modello: 'sam2', bordo: 0, morbido: 0.3, qualita: 1, punti: [{ x: 0.5, y: 0.5, dentro: true }], da: 1 };
    const f1 = SF.firmaRitaglio('m1', r1), f2 = SF.firmaRitaglio('m1', { ...r1, punti: [{ x: 0.6, y: 0.5, dentro: true }] }), f3 = SF.firmaRitaglio('m1', { ...r1, bordo: 0.5, morbido: 0.9 });
    const m = new Uint8Array(10 * 10); for (let y = 2; y < 6; y++) for (let x = 3; x < 9; x++) m[y * 10 + x] = 255;
    const q = SF.riquadroMaschera(m, 10, 10);
    const t1 = [new Uint8Array([100]), new Uint8Array([130]), new Uint8Array([100])]; SF.levigaMaschere(t1);
    const t2 = [new Uint8Array([0]), new Uint8Array([255]), new Uint8Array([0])]; SF.levigaMaschere(t2);
    const grande = SF.ridimensionaMaschera(new Uint8Array([0, 255, 0, 255]), 2, 2, 4, 4);
    return { dom, dg, piano, stretto, c, fine, f1, f2, f3, q, l1: t1[1][0], l2: t2[1][0], grande: Array.from(grande), cols: SF.coloriChiave({ keyColor: '#111111', keyColori: ['#222222', '#333333', '#444444'] }) };
  });
  prova('il colore del fondale si trova lungo i bordi (verde #00b140)', pure.dom.colore === '#00b140' && pure.dom.quota > 0.8 && pure.dom.saturazione > 0.9, JSON.stringify(pure.dom));
  prova('un fondale grigio non è un colore da togliere (saturazione bassa)', pure.dg.saturazione < 0.1 && pure.dg.quota === 0, JSON.stringify(pure.dg));
  prova('i campioni: 8 al secondo su 10 s = 81 maschere, a distanza di 1/8', pure.piano.n === 81 && Math.abs(pure.piano.dt - 0.125) < 1e-9 && pure.piano.hz === 8, JSON.stringify(pure.piano));
  prova('se le maschere non starebbero nella memoria si guarda meno spesso (ma almeno 2 al secondo)', pure.stretto.hz === 2 && pure.stretto.n === 121, JSON.stringify(pure.stretto));
  prova('fra quali due maschere cade un istante, e oltre la fine resta l\'ultima', pure.c.i === 2 && pure.c.j === 3 && Math.abs(pure.c.k - 0.6) < 1e-9 && pure.fine.i === 3 && pure.fine.j === 4 && pure.fine.k === 1, JSON.stringify([pure.c, pure.fine]));
  prova('la firma cambia coi clic, il modello e la precisione ma non col bordo e la morbidezza', pure.f1 !== pure.f2 && pure.f1 === pure.f3, JSON.stringify([pure.f1, pure.f2, pure.f3]));
  prova('il riquadro della maschera: dove sta e quanto è grande', Math.abs(pure.q.x0 - 0.3) < 1e-9 && Math.abs(pure.q.x1 - 0.9) < 1e-9 && Math.abs(pure.q.y0 - 0.2) < 1e-9 && Math.abs(pure.q.area - 0.24) < 1e-9, JSON.stringify(pure.q));
  prova('la levigatura calma il tremolio ma non mangia un movimento vero', pure.l1 === 115 && pure.l2 === 255, `${pure.l1} ${pure.l2}`);
  prova('una maschera si ingrandisce con la bilineare (0 → 255 in quattro passi)', pure.grande.length === 16 && pure.grande[0] === 0 && pure.grande[3] === 255 && pure.grande[1] > 0 && pure.grande[1] < 128 && pure.grande[2] > 128 && pure.grande[2] < 255, JSON.stringify(pure.grande));
  prova('al massimo tre colori della chiave', pure.cols.length === 3 && pure.cols[0] === '#111111' && pure.cols[2] === '#333333', JSON.stringify(pure.cols));

  console.log('▶ Togliere lo sfondo: green screen col colore');
  // un'immagine con il fondale verde e un disco rosso; sotto un colore magenta
  await page.evaluate(async () => {
    const { importaFile, P } = window.__dpvTest;
    const mk = async (nome, disegna) => {
      const c = new OffscreenCanvas(640, 360); const x = c.getContext('2d'); disegna(x);
      const b = await c.convertToBlob({ type: 'image/png' });
      const [m] = await importaFile([{ name: nome, file: new File([b], nome, { type: 'image/png' }) }], { chiediFormato: false });
      return m.id;
    };
    const disco = (x) => { x.fillStyle = '#dc1e1e'; x.beginPath(); x.arc(320, 180, 90, 0, Math.PI * 2); x.fill(); };
    const verde = await mk('fondale-verde.png', (x) => { x.fillStyle = '#00b140'; x.fillRect(0, 0, 640, 360); disco(x); });
    const duecolori = await mk('fondale-misto.png', (x) => { x.fillStyle = '#00b140'; x.fillRect(0, 0, 320, 360); x.fillStyle = '#0047bb'; x.fillRect(320, 0, 320, 360); disco(x); });
    window.__sfondoProva = { verde, duecolori };
    const p = window.__dpv.doc;
    const [v2, v1] = p.tracks.filter((t) => t.kind === 'video');
    window.__dpv.edit('Prova sfondo', (pp) => {
      pp.clips.push(P.newClip('color', v1.id, 0, 250, { name: 'Magenta', gen: { color: '#ff00ff' } }));
      pp.clips.push(P.newClip('media', v2.id, 0, 250, { media: verde, name: 'Fondale verde' }));
    });
    window.__dpv.select([]);
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__motore.vaiA(10));
  const angolo = [2, 2], centro = [32, 18];
  let [a0, c0] = await leggi(page, [angolo, centro]);
  prova('senza chiave si vede il verde del fondale', vicino(a0, [0, 177, 64]) && vicino(c0, [220, 30, 30]), JSON.stringify([a0, c0]));
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Chiave', () => { c.fx.key = 'chroma'; c.fx.keyColor = '#00b140'; }); });
  await page.waitForTimeout(250);
  let [a1, c1] = await leggi(page, [angolo, centro]);
  prova('chiave verde: il fondale sparisce (si vede il magenta sotto) e il disco resta rosso', vicino(a1, [255, 0, 255], 30) && vicino(c1, [220, 30, 30], 30), JSON.stringify([a1, c1]));
  const [a2, c2] = await leggi(page, [angolo, centro], 1);
  prova('vista maschera: fondale nero, soggetto bianco', vicino(a2, [0, 0, 0], 12) && vicino(c2, [255, 255, 255], 12), JSON.stringify([a2, c2]));
  const [a3, c3] = await leggi(page, [angolo, centro], 2);
  prova('vista scacchi: il fondale è un grigio a scacchi, il soggetto è ancora lui', a3[0] === a3[1] && a3[1] === a3[2] && a3[0] > 25 && a3[0] < 90 && vicino(c3, [220, 30, 30], 30), JSON.stringify([a3, c3]));
  // inverti: si tiene il fondale
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Inverti', () => { c.fx.keyInvert = true; }); });
  await page.waitForTimeout(250);
  const [a4, c4] = await leggi(page, [angolo, centro]);
  prova('inverti la chiave: resta il fondale e il disco diventa trasparente', vicino(a4, [0, 177, 64], 48) && vicino(c4, [255, 0, 255], 30), JSON.stringify([a4, c4]));
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Inverti', () => { c.fx.keyInvert = false; }); });
  // due colori insieme
  await page.evaluate(() => {
    const id = window.__sfondoProva.duecolori;
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde');
    window.__dpv.edit('Fondale misto', () => { c.media = id; c.fx.keyColori = ['#0047bb']; });
  });
  await page.waitForTimeout(300);
  const [sx, dx, cc] = await leggi(page, [[2, 18], [61, 18], centro]);
  prova('due colori da togliere: sparisce sia il verde sia il blu', vicino(sx, [255, 0, 255], 30) && vicino(dx, [255, 0, 255], 30) && vicino(cc, [220, 30, 30], 30), JSON.stringify([sx, dx, cc]));
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Un colore', () => { delete c.fx.keyColori; }); });
  await page.waitForTimeout(250);
  const [sx2, dx2] = await leggi(page, [[2, 18], [61, 18]]);
  prova('con un colore solo il blu resta', vicino(sx2, [255, 0, 255], 30) && vicino(dx2, [0, 71, 187], 40), JSON.stringify([sx2, dx2]));
  await page.screenshot({ path: path.join(OUT, 'sfondo-colori.png') });
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Verde', () => { c.media = window.__sfondoProva.verde; }); });

  console.log('▶ Togliere lo sfondo: le proprietà e il contagocce');
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.select([c.id]); window.__motore.vaiA(10); });
  await page.waitForTimeout(300);
  await apriGruppi(page);
  prova('nelle proprietà c\'è "Togli lo sfondo" con tutti i modi', (await page.locator('.isp-gruppo summary:has-text("Togli lo sfondo")').count()) === 1 && (await page.locator('.isp-gruppo:has(summary:has-text("Togli lo sfondo")) .chip').count()) >= 6);
  prova('con la chiave a colori si vedono contagocce, colori pronti e i cursori', (await page.locator('button:has-text("Contagocce")').count()) === 1 && (await page.locator('button:has-text("Trovalo da solo")').count()) === 1 && (await page.locator('.isp-riga:has(label:has-text("Via il riflesso"))').count()) === 1);
  // il contagocce: un clic sull'angolo verde del monitor mette quel colore
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Colore sbagliato', () => { c.fx.keyColor = '#ff0000'; }); });
  await page.waitForTimeout(200);
  await page.click('button:has-text("Contagocce")');
  await page.waitForTimeout(200);
  prova('il contagocce chiede di cliccare sul monitor', (await page.locator('.pos-barra.su .pos-mira:not([hidden]) .pos-mira-testo').first().textContent().catch(() => '')).includes('Clicca'), await page.locator('.pos-barra').textContent());
  const sch = await page.locator('.monitor .schermo-sopra').boundingBox();
  await page.mouse.click(sch.x + sch.width * 0.06, sch.y + sch.height * 0.08);
  await page.waitForTimeout(500);
  const kc = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde').fx.keyColor);
  prova('il colore preso è il verde del fondale', kc.toLowerCase() === '#00b140', kc);
  // "trovalo da solo"
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Colore sbagliato', () => { c.fx.keyColor = '#ff0000'; }); });
  await page.waitForTimeout(200);
  await page.click('button:has-text("Trovalo da solo")');
  await page.waitForTimeout(500);
  const kc2 = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde').fx.keyColor);
  prova('"Trovalo da solo" guarda i bordi e prende il verde', kc2.toLowerCase() === '#00b140', kc2);
  // i modi
  await page.click('.isp-gruppo:has(summary:has-text("Togli lo sfondo")) .chip:has-text("Niente")');
  await page.waitForTimeout(200);
  let d = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'));
  prova('"Niente" spegne la chiave', d.fx.key === 'none' && !d.ritaglio);
  await page.click('.isp-gruppo:has(summary:has-text("Togli lo sfondo")) .chip:has-text("AI · Persona")');
  await page.waitForTimeout(700);
  d = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'));
  prova('"AI · Persona" mette il ritaglio col modello veloce per le persone', d.ritaglio?.modo === 'persona' && d.ritaglio.modello === 'modnet' && d.fx.key === 'none', JSON.stringify(d.ritaglio));
  prova('si vede il pulsante per togliere lo sfondo e il nome del modello', (await page.locator('button:has-text("Togli lo sfondo")').count()) >= 1 && (await page.locator('.isp-gruppo select option:has-text("MODNet")').count()) >= 1, await page.locator('.isp-gruppo:has(summary:has-text("Togli lo sfondo"))').innerText());
  await page.click('.isp-gruppo:has(summary:has-text("Togli lo sfondo")) .chip:has-text("AI · Soggetto")');
  await page.waitForTimeout(500);
  d = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'));
  prova('"AI · Soggetto" parte da BEN2 (la più precisa)', d.ritaglio?.modo === 'soggetto' && d.ritaglio.modello === 'ben2');
  await page.click('.isp-gruppo:has(summary:has-text("Togli lo sfondo")) .chip:has-text("AI · Oggetti")');
  await page.waitForTimeout(500);
  d = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'));
  prova('"AI · Oggetti" mette i clic da fare e il segui acceso', d.ritaglio?.modo === 'oggetti' && Array.isArray(d.ritaglio.punti) && d.ritaglio.segui === true && d.ritaglio.modello === 'sam2');

  console.log('▶ Togliere lo sfondo: l\'AI (col modello finto) su un\'immagine');
  await page.evaluate(() => {
    const { RT } = window.__dpvTest;
    window.__chiamateAI = [];
    // un modello finto: tiene quello che non è del colore del fondale (verde) — i modelli veri non si raggiungono dal container
    RT.impostaSegmentatore({
      carica: async (m, stato) => { stato('finto', 1); return 'finto'; },
      maschera: async (px, o) => {
        window.__chiamateAI.push({ punti: o?.punti?.length ?? 0, riquadro: !!o?.riquadro, w: px.w, h: px.h });
        const m = new Uint8Array(px.w * px.h);
        for (let i = 0; i < m.length; i++) {
          const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2];
          m[i] = g > r + 60 && g > b + 40 ? 0 : 255;
        }
        return m;
      },
    });
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde');
    window.__dpv.edit('AI soggetto', () => { c.fx.key = 'none'; c.ritaglio = { modo: 'soggetto', modello: 'ben2', bordo: 0, morbido: 0.3, qualita: 1 }; });
  });
  const esAI = await page.evaluate(async () => {
    const { RT, MK, SF } = window.__dpvTest;
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde');
    const stati = [];
    const es = await RT.elaboraRitaglio(window.__dpv.doc, c, { stato: (f, k) => stati.push([f, k]) });
    const firma = es.maschere?.firma;
    window.__dpv.edit('Firma', () => { c.ritaglio.firma = firma; });
    const m = MK.maschereDi(firma);
    return { ok: es.ok, motivo: es.motivo, n: m?.n, w: m?.w, h: m?.h, firma, stati: stati.length, aggiornate: RT.maschereAggiornate(window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde')), chiamate: window.__chiamateAI.length };
  });
  prova('un\'immagine: una maschera sola, grande come l\'immagine', esAI.ok && esAI.n === 1 && esAI.w === 640 && esAI.h === 360 && esAI.chiamate === 1, JSON.stringify(esAI));
  prova('la barra riceve le fasi e le maschere sono "aggiornate"', esAI.stati >= 2 && esAI.aggiornate === true);
  await page.evaluate(() => window.__motore.vaiA(12));
  await page.waitForTimeout(300);
  const [a5, c5] = await leggi(page, [angolo, centro]);
  prova('l\'AI toglie il fondale: dietro si vede il magenta, il disco resta', vicino(a5, [255, 0, 255], 30) && vicino(c5, [220, 30, 30], 30), JSON.stringify([a5, c5]));
  const [a6, c6] = await leggi(page, [angolo, centro], 1);
  prova('vista maschera dell\'AI: nero fuori, bianco dentro', vicino(a6, [0, 0, 0], 12) && vicino(c6, [255, 255, 255], 12), JSON.stringify([a6, c6]));
  // inverti e bordo
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Inverti', () => { c.ritaglio.inverti = true; }); });
  await page.waitForTimeout(200);
  const [a7, c7] = await leggi(page, [angolo, centro]);
  prova('inverti: si tiene lo sfondo e il soggetto sparisce', vicino(a7, [0, 177, 64], 48) && vicino(c7, [255, 0, 255], 30), JSON.stringify([a7, c7]));
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Inverti', () => { c.ritaglio.inverti = false; }); });
  // la firma: cambiare il modello rende le maschere vecchie
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Modello', () => { c.ritaglio.modello = 'birefnet'; }); });
  prova('cambiando modello le maschere risultano da rifare (ma restano visibili)', await page.evaluate(() => !window.__dpvTest.RT.maschereAggiornate(window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'))));
  await page.waitForTimeout(250);
  prova('...e il pannello lo dice', (await page.locator('.isp-gruppo:has(summary:has-text("Togli lo sfondo")) .nota').allTextContents()).join(' ').includes('rifai'));
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde'); window.__dpv.edit('Modello', () => { c.ritaglio.modello = 'ben2'; }); });
  await page.screenshot({ path: path.join(OUT, 'sfondo-ai-immagine.png') });

  console.log('▶ Togliere lo sfondo: la stessa cosa nell\'export (altro compositore, altra tela)');
  const exp = await page.evaluate(async () => {
    const { Compositore, pianoVideo } = window.__dpvTest;
    const tela = new OffscreenCanvas(320, 180);
    const comp = new Compositore(tela, true);
    const p = window.__dpv.doc;
    comp.render(p, pianoVideo(p, 12), false, 12);
    const px = new Uint8Array(64 * 36 * 4);
    comp.leggiPiccolo(64, 36, px);
    const at = (x, y) => { const i = ((35 - y) * 64 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    const r = { angolo: at(2, 2), centro: at(32, 18) };
    comp.distruggi();
    return r;
  });
  prova('l\'export (un altro compositore) vede le stesse maschere: sfondo tolto, disco rosso', vicino(exp.angolo, [255, 0, 255], 30) && vicino(exp.centro, [220, 30, 30], 30), JSON.stringify(exp));

  console.log('▶ Togliere lo sfondo: la cache sul computer');
  const cache = await page.evaluate(async () => {
    const { MK } = window.__dpvTest;
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde');
    const firma = c.ritaglio.firma;
    const m = MK.maschereDi(firma);
    await MK.salvaCache(m);
    const l = await MK.leggiCache(firma);
    const uguale = !!l && l.n === m.n && l.w === m.w && l.h === m.h && l.dati[0].length === m.dati[0].length && l.dati[0].every((v, i) => v === m.dati[0][i]);
    MK.togliMaschere(firma);
    const via = !MK.maschereDi(firma);
    await MK.ripristinaMaschere(window.__dpv.doc);
    return { uguale, via, tornata: !!MK.maschereDi(firma) };
  });
  prova('le maschere vanno nella cache del computer e tornano uguali', cache.uguale, JSON.stringify(cache));
  prova('riaprendo il progetto si rileggono dalla cache', cache.via && cache.tornata, JSON.stringify(cache));
  const potate = await page.evaluate(() => {
    const { MK } = window.__dpvTest;
    MK.impostaMaschere({ firma: 'orfana', w: 2, h: 2, t0: 0, dt: 0, n: 1, hz: 0, dati: [new Uint8Array(4)] }, false);
    MK.potaMaschere(window.__dpv.doc);
    return !MK.maschereDi('orfana');
  });
  prova('le maschere che nessuna clip usa si buttano', potate);

  console.log('▶ Togliere lo sfondo: una ripresa video (col modello finto)');
  const vid = await page.evaluate(async () => {
    const { ripresaDiProva, importaFile, P, RT, MK, SF } = window.__dpvTest;
    const f = await ripresaDiProva(4, 25);
    const [m] = await importaFile([{ name: f.name, file: f }], { chiediFormato: false });
    const [v2] = window.__dpv.doc.tracks.filter((t) => t.kind === 'video');
    window.__dpv.edit('Ripresa', (pp) => { pp.clips.push(P.newClip('media', v2.id, 300, 100, { media: m.id, name: 'Pallina', srcIn: 0 })); });
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Pallina');
    window.__chiamateAI = [];
    // la pallina è l'unica cosa rossa
    RT.impostaSegmentatore({
      carica: async () => 'finto',
      maschera: async (px, o) => {
        window.__chiamateAI.push({ punti: o?.punti?.length ?? 0, riquadro: !!o?.riquadro });
        const mk = new Uint8Array(px.w * px.h);
        for (let i = 0; i < mk.length; i++) { const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2]; mk[i] = r > 200 && g < 110 && b < 130 ? 255 : 0; }
        return mk;
      },
    });
    window.__dpv.edit('AI sulla ripresa', () => { c.ritaglio = { modo: 'persona', modello: 'modnet', bordo: 0, morbido: 0.15, qualita: 2 }; });
    const t0 = performance.now();
    const es = await RT.elaboraRitaglio(window.__dpv.doc, window.__dpv.doc.clips.find((x) => x.name === 'Pallina'), {});
    const firma = es.maschere?.firma;
    window.__dpv.edit('Firma', () => { window.__dpv.doc.clips.find((x) => x.name === 'Pallina').ritaglio.firma = firma; });
    const mm = MK.maschereDi(firma);
    // quanto rosso c'è in ogni maschera (la pallina) e dove sta
    const aree = mm ? mm.dati.map((d) => { let n = 0; for (const v of d) if (v > 128) n++; return n / d.length; }) : [];
    return { ok: es.ok, motivo: es.motivo, n: mm?.n, hz: mm?.hz, w: mm?.w, h: mm?.h, aree, chiamate: window.__chiamateAI.length, ms: performance.now() - t0, firma, attesi: SF.istantiCampioni(0 - 0.04 < 0 ? 0 : 0, 4.04, 12, mm?.w ?? 1, mm?.h ?? 1).n };
  });
  prova('una ripresa di 4 secondi: una maschera ogni 1/12 di secondo, una chiamata al modello per maschera', vid.ok && vid.n >= 48 && vid.n <= 52 && vid.chiamate === vid.n, JSON.stringify({ ...vid, aree: vid.aree?.length }));
  prova('in ogni maschera c\'è la pallina (circa l\'1% dell\'immagine)', vid.aree.length > 0 && vid.aree.every((a) => a > 0.006 && a < 0.02), JSON.stringify(vid.aree.map((a) => +a.toFixed(3))));
  // a metà della ripresa la pallina sta dov'è nel video: il resto è trasparente
  await page.evaluate(() => window.__motore.vaiA(350));
  await page.waitForTimeout(500);
  const t = 2.0;
  const px = Math.round((120 + ((t % 6) / 6) * 720) / 960 * 64), py = Math.round(((540 - 90 - Math.abs(Math.sin(((t * 1.1) % 1) * Math.PI)) * 330) / 540) * 36);
  const [pc, pa] = await leggi(page, [[px, py], [2, 2]]);
  prova('sulla ripresa: la pallina resta rossa e il fondale beige sparisce (sotto non c\'è niente: nero)', vicino(pc, [255, 77, 109], 70) && vicino(pa, [0, 0, 0], 12), JSON.stringify({ px, py, pc, pa }));
  await page.screenshot({ path: path.join(OUT, 'sfondo-ai-video.png') });

  console.log('▶ Togliere lo sfondo: gli oggetti coi clic (e il loro seguito)');
  const ogg = await page.evaluate(async () => {
    const { RT, MK, P } = window.__dpvTest;
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Pallina');
    window.__chiamateAI = [];
    // un modello finto "SAM": coi clic fa un disco attorno al primo punto; col riquadro tiene il riquadro
    RT.impostaSegmentatore({
      carica: async () => 'finto',
      maschera: async (px, o) => {
        window.__chiamateAI.push({ punti: o?.punti?.length ?? 0, riquadro: !!o?.riquadro });
        const mk = new Uint8Array(px.w * px.h);
        if (o?.riquadro) {
          const [x0, y0, x1, y1] = o.riquadro;
          for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) if (x / px.w >= x0 && x / px.w <= x1 && y / px.h >= y0 && y / px.h <= y1) mk[y * px.w + x] = 255;
        } else {
          const p0 = o.punti.find((q) => q.dentro);
          for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) if (Math.hypot(x / px.w - p0.x, (y / px.h - p0.y) * 0.5625) < 0.1) mk[y * px.w + x] = 255;
        }
        return mk;
      },
    });
    window.__dpv.edit('Oggetti', () => { c.ritaglio = { modo: 'oggetti', modello: 'sam2', bordo: 0, morbido: 0.2, qualita: 0, punti: [{ x: 0.4, y: 0.5, dentro: true }, { x: 0.9, y: 0.9, dentro: false }], da: 2, segui: true }; });
    const es = await RT.elaboraRitaglio(window.__dpv.doc, window.__dpv.doc.clips.find((x) => x.name === 'Pallina'), {});
    const chiamate = [...window.__chiamateAI];
    const prima = MK.maschereDi(es.maschere?.firma);
    // senza "segui": sempre i clic
    window.__chiamateAI = [];
    window.__dpv.edit('Senza segui', () => { window.__dpv.doc.clips.find((x) => x.name === 'Pallina').ritaglio.segui = false; });
    const es2 = await RT.elaboraRitaglio(window.__dpv.doc, window.__dpv.doc.clips.find((x) => x.name === 'Pallina'), {});
    const solo = window.__chiamateAI.every((q) => !q.riquadro && q.punti === 2);
    // senza clic: dice cosa fare
    window.__dpv.edit('Niente clic', () => { window.__dpv.doc.clips.find((x) => x.name === 'Pallina').ritaglio.punti = []; });
    const es3 = await RT.elaboraRitaglio(window.__dpv.doc, window.__dpv.doc.clips.find((x) => x.name === 'Pallina'), {});
    return { ok: es.ok, n: prima?.n, primaClic: chiamate[0], dopo: chiamate.slice(1).every((q) => q.riquadro && q.punti === 0), tutte: chiamate.length, ok2: es2.ok, solo, motivo3: es3.motivo, ok3: es3.ok };
  });
  prova('oggetti: il primo fotogramma si fa coi clic, tutti gli altri col riquadro della maschera di prima', ogg.ok && ogg.primaClic.punti === 2 && ogg.dopo && ogg.tutte === ogg.n, JSON.stringify(ogg));
  prova('oggetti senza "segui": ogni fotogramma ha i suoi clic', ogg.ok2 && ogg.solo, JSON.stringify(ogg));
  prova('senza clic il lavoro non parte e dice cosa fare', !ogg.ok3 && /clicca/i.test(ogg.motivo3 ?? ''), ogg.motivo3);
  await page.evaluate(() => window.__dpvTest.RT.impostaSegmentatore(null));
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.name === 'Pallina'); window.__dpv.edit('Via il ritaglio', () => { delete c.ritaglio; }); });

  console.log('▶ Togliere lo sfondo: il worker coi modelli veri, con un transformers.js finto (la CDN e Hugging Face non si raggiungono)');
  // la libreria vera arriva dalla CDN: qui la sostituiamo con una finta che parla la stessa lingua (pipeline, RawImage, SamModel…)
  const LIB = `
export const env = { allowLocalModels: true };
export class RawImage { constructor(data, width, height, channels) { this.data = data; this.width = width; this.height = height; this.channels = channels; } }
export async function pipeline(task, repo, opz) {
  if (task !== 'background-removal') throw new Error('compito sbagliato ' + task);
  if (repo.includes('manca')) throw new Error('404 ' + repo);
  opz.progress_callback?.({ status: 'progress', file: 'model.onnx', loaded: 50, total: 100 });
  return async (img) => {
    if (img.channels !== 3) throw new Error('la pipeline vuole RGB, non ' + img.channels + ' canali');
    const n = img.width * img.height, out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { const r = img.data[i * 3], g = img.data[i * 3 + 1], b = img.data[i * 3 + 2]; out.set([r, g, b, g > r + 60 && g > b + 40 ? 0 : 255], i * 4); }
    return [new RawImage(out, img.width, img.height, 4)];
  };
}
let ultimo = null;
export const AutoProcessor = { from_pretrained: async (repo) => {
  const p = async (img, opz) => { ultimo = { opz, w: img.width, h: img.height }; return { original_sizes: [[img.height, img.width]], reshaped_input_sizes: [[img.height, img.width]] }; };
  p.post_process_masks = async () => {
    const { opz, w, h } = ultimo, d = new Uint8Array(3 * w * h);
    // la maschera "buona" (la numero 1): un disco attorno al primo punto, o il riquadro; le altre due sono vuote
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dentro = false;
      if (opz.input_boxes) { const [x0, y0, x1, y1] = opz.input_boxes[0][0]; dentro = x >= x0 && x <= x1 && y >= y0 && y <= y1; }
      else { const [px, py] = opz.input_points[0][0]; dentro = Math.hypot(x - px, y - py) < Math.min(w, h) * 0.2 && opz.input_labels[0][0] === 1; }
      d[1 * w * h + y * w + x] = dentro ? 1 : 0;
    }
    return [{ dims: [1, 3, h, w], data: d }];
  };
  return p;
} };
export class SamModel { static async from_pretrained(repo, opz) {
  if (repo.includes('sam2.1') || repo.includes('manca')) throw new Error('404 ' + repo);
  return async () => ({ pred_masks: 'x', iou_scores: { dims: [1, 1, 3], data: [0.1, 0.95, 0.4] } });
} }
`;
  // la libreria ora sta dentro l'app (dist/ai/), con la CDN di riserva: si sostituiscono tutte e due
  const finta = (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: LIB });
  await page.context().route('https://cdn.jsdelivr.net/npm/@huggingface/transformers@*/dist/transformers.min.js', finta);
  await page.context().route('**/ai/transformers.min.js', finta);
  const vero = await page.evaluate(async () => {
    const { RT, MK } = window.__dpvTest;
    RT.impostaSegmentatore(null);
    const id = window.__sfondoProva.verde;
    const c = window.__dpv.doc.clips.find((x) => x.name === 'Fondale verde');
    const prima = JSON.parse(JSON.stringify(c.ritaglio ?? null));
    const fai = async (r) => { window.__dpv.edit('Ritaglio', () => { c.ritaglio = r; c.fx.key = 'none'; }); const es = await RT.elaboraRitaglio(window.__dpv.doc, c, {}); return es; };
    const out = {};
    // 1) la pipeline "background-removal" (BEN2): il fondale verde va via
    let es = await fai({ modo: 'soggetto', modello: 'ben2', bordo: 0, morbido: 0.3, qualita: 1 });
    let m = es.maschere;
    out.sfondo = { ok: es.ok, motivo: es.motivo, disp: es.dispositivo, angolo: m?.dati[0][2 * m.w + 2], centro: m?.dati[0][Math.floor(m.h / 2) * m.w + Math.floor(m.w / 2)], w: m?.w, h: m?.h };
    // 2) SAM: SAM 2.1 non c'è, si passa a SlimSAM (l'indirizzo di riserva); i clic diventano un disco attorno al primo
    es = await fai({ modo: 'oggetti', modello: 'sam2', bordo: 0, morbido: 0.3, qualita: 1, punti: [{ x: 0.25, y: 0.5, dentro: true }], da: 0, segui: true });
    m = es.maschere;
    const a = (x, y) => m.dati[0][Math.floor(y * m.h) * m.w + Math.floor(x * m.w)];
    out.sam = { ok: es.ok, motivo: es.motivo, disp: es.dispositivo, sulPunto: a(0.25, 0.5), lontano: a(0.9, 0.9), w: m?.w };
    // 3) un modello che non c'è da nessuna parte: l'errore si capisce
    RT.MODELLI_RITAGLIO.push({ id: 'finto-manca', nome: 'Manca', info: '', modi: ['soggetto'], famiglia: 'sfondo', repo: ['x/manca', 'y/manca'], licenza: '-' });
    es = await fai({ modo: 'soggetto', modello: 'finto-manca', bordo: 0, morbido: 0.3, qualita: 1 });
    out.manca = { ok: es.ok, motivo: es.motivo };
    RT.MODELLI_RITAGLIO.pop();
    window.__dpv.edit('Via', () => { if (prima) c.ritaglio = prima; else delete c.ritaglio; });
    return out;
  });
  prova('il worker: BEN2 (pipeline background-removal) dà la maschera, con l\'immagine data in RGB', vero.sfondo.ok && vero.sfondo.angolo === 0 && vero.sfondo.centro === 255 && vero.sfondo.w === 640 && /BEN2/i.test(vero.sfondo.disp), JSON.stringify(vero.sfondo));
  prova('il worker: SAM 2.1 non c\'è, si ripiega su SlimSAM; il clic diventa la maschera dell\'oggetto', vero.sam.ok && vero.sam.sulPunto === 255 && vero.sam.lontano === 0 && /slimsam/i.test(vero.sam.disp), JSON.stringify(vero.sam));
  prova('il worker: se nessun indirizzo risponde, l\'errore è chiaro (detto in parole: il modello non si trova)', !vero.manca.ok && /Non riesco a caricare il modello/.test(vero.manca.motivo) && /non si trova su Hugging Face/.test(vero.manca.motivo), JSON.stringify(vero.manca));
  await page.context().unroute('https://cdn.jsdelivr.net/npm/@huggingface/transformers@*/dist/transformers.min.js');
  await page.context().unroute('**/ai/transformers.min.js');
}

// ——————————————————————————————————————————————————————————————————————
//  da soli
// ——————————————————————————————————————————————————————————————————————
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const DIST = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(DIST, 'app/index.html'))) { console.error('manca dist/: prima npm run build'); process.exit(1); }
  const OUT = path.join(ROOT, 'test/.out');
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0, ko = 0;
  const prova = (nome, cond, info = '') => { if (cond) { ok++; console.log('  ✓', nome); } else { ko++; console.log('  ✗', nome, info); } };
  const srv = await servi(DIST);
  const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  try {
    await page.goto(srv.url + '/app/');
    await page.waitForSelector('.pulsantiera');
    await page.waitForTimeout(1200);
    const quali = process.argv.slice(2);
    await proveNuove({ page, prova, OUT }, quali.length ? quali : undefined);
    prova('nessun errore nella console', errori.length === 0, errori.slice(0, 5).join(' | '));
  } catch (e) {
    ko++;
    console.log('  ✗ la prova si è fermata:', e);
  }
  await browser.close();
  srv.chiudi();
  console.log(`\n${ok} riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
