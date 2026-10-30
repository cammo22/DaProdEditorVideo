// Le prove di DaProd Video: il banco di montaggio usato da solo in Chromium.
//   npm run build && node test/prove.mjs
// Genera il montaggio dimostrativo (riprese create al volo), poi taglia, elimina, annulla, separa,
// dissolve, estrae, suona ed esporta un WebM che viene riletto e controllato.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { servi } from './servi.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(DIST, 'app/index.html'))) { console.error('manca dist/: prima npm run build'); process.exit(1); }
const OUT = path.join(ROOT, 'test/.out');
fs.mkdirSync(OUT, { recursive: true });

let ok = 0, ko = 0;
const prova = (nome, cond, info = '') => {
  if (cond) { ok++; console.log('  ✓', nome); }
  else { ko++; console.log('  ✗', nome, info); }
};

const srv = await servi(DIST);
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
const errori = [];
/** l'errore con le prime righe dello stack (per capire da dove viene, anche dalle pagine aperte a parte) */
const conStack = (e) => e.message + ' @ ' + String(e.stack ?? '').split('\n').slice(1, 5).join(' | ');
page.on('pageerror', (e) => errori.push(conStack(e)));
page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(srv.url)) console.log(`  HTTP ${r.status()}: ${r.url().slice(srv.url.length)}`); });
page.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errori.push(m.text()); });

const doc = () => page.evaluate(() => window.__dpv.doc);
const doc0 = (pg) => pg.evaluate(() => window.__dpv.doc);
const conta = () => page.evaluate(() => window.__dpv.doc.clips.length);
/** il blocchetto transizione che sta sul fotogramma f */
const bloccoSul = (d, f) => d.clips.find((c) => c.kind === 'fx' && c.fxb?.tipo === 'transizione' && c.start <= f && c.start + c.len >= f);
/** le clip vere di una traccia (i blocchetti FX stanno sopra, non contano) */
const solide = (d, track) => d.clips.filter((c) => c.track === track && c.kind !== 'fx');
/** due clip vere si coprono? */
const coperte = (d) => d.clips.some((x) => x.kind !== 'fx' && d.clips.some((y) => y !== x && y.kind !== 'fx' && x.track === y.track && x.start < y.start + y.len && y.start < x.start + x.len));
const tasto = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(120); };

try {
  console.log('▶ Avvio');
  await page.goto(srv.url + '/app/');
  await page.waitForSelector('.pulsantiera');
  await page.waitForTimeout(1200);
  prova('il banco si apre senza errori', errori.length === 0, errori.join(' | '));
  prova('il contenitore vuoto invita a importare', await page.isVisible('text=Trascina qui i tuoi video'));
  prova('un monitor solo, sul programma', (await page.locator('.monitor').count()) === 1 && (await page.textContent('.monitor .mon-testa b')) === 'PROGRAMMA');
  prova('la pulsantiera ha i tasti 1 e 2', (await page.textContent('.pulsantiera')).includes('TAGLIA') && (await page.textContent('.pulsantiera')).includes('ELIMINA'));

  console.log('▶ Timecode');
  const tc = await page.evaluate(() => {
    const { TC } = window.__dpvTest;
    const r25 = { num: 25, den: 1 }, r2997 = { num: 30000, den: 1001 };
    return {
      a: TC.frameToTc(90000, r25), b: TC.frameToTc(1800, r2997, true), c: TC.frameToTc(17982, r2997, true),
      d: TC.parseTc('1000', r25, false, 0), e: TC.parseTc('+25', r25, false, 100), f: TC.tcToFrame(0, 1, 0, 2, r2997, true),
    };
  });
  prova('01:00:00:00 a 25 fps', tc.a === '01:00:00:00', tc.a);
  prova('drop-frame: 1800 → 00:01:00;02', tc.b === '00:01:00;02', tc.b);
  prova('drop-frame: 17982 → 00:10:00;00', tc.c === '00:10:00;00', tc.c);
  prova('tastierino: "1000" = 10 secondi', tc.d === 250, tc.d);
  prova('timecode relativo "+25"', tc.e === 125, tc.e);
  prova('drop-frame all\'indietro', tc.f === 1800, tc.f);

  console.log('▶ Montaggio dimostrativo');
  await page.click('text=Prova con il montaggio dimostrativo');
  await page.waitForFunction(() => window.__dpv.doc.clips.length >= 8, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  let d = await doc();
  prova('tre riprese nel contenitore', d.media.length === 3, d.media.length);
  prova('otto clip nella timeline', d.clips.filter((c) => c.kind !== 'fx').length === 8, d.clips.length);
  prova('video e audio legati', d.clips.filter((c) => c.link).length === 6);
  prova('due tracce video e due audio, niente corsia FX a parte', d.tracks.map((t) => t.kind).join(',') === 'video,video,audio,audio', d.tracks.map((t) => t.name).join(','));
  prova('gli FX stanno sulle tracce video', d.clips.filter((c) => c.kind === 'fx').every((c) => d.tracks.find((t) => t.id === c.track).kind === 'video'));
  prova('una dissolvenza e una tendina a iride in blocchetti sul taglio', d.clips.some((c) => c.fxb?.id === 'mix') && d.clips.some((c) => c.fxb?.id === 'wipe:119'));
  prova('un lampo e uno zoom lento nella corsia FX', d.clips.some((c) => c.fxb?.id === 'flash') && d.clips.some((c) => c.fxb?.id === 'zoomLento'));
  await page.screenshot({ path: path.join(OUT, 'demo.png') });

  console.log('▶ Trascina dal contenitore alla timeline');
  {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:adatta')));
    await page.waitForTimeout(300);
    const n0 = await conta();
    const fine0 = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    const voce = await page.locator('.carta[data-id]').nth(1).boundingBox();
    const tela = await page.locator('.tl-tela').boundingBox();
    // la riga di V1: righello + le tracce video sopra + metà di V1
    const yV1 = await page.evaluate(() => { const r = window.__dpvTest.ui().tl.riga(window.__dpv.doc.tracks.find((x) => x.name === 'V1').id); return r.y + r.h / 2; });
    await page.mouse.move(voce.x + voce.width / 2, voce.y + voce.height / 2);
    await page.mouse.down();
    await page.mouse.move(voce.x + 60, voce.y + 40, { steps: 5 });
    await page.mouse.move(tela.x + tela.width - 12, tela.y + yV1, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const dd = await doc();
    const aggiunte = dd.clips.filter((c) => c.start >= fine0);
    prova('trascinata col mouse: video e audio in coda', dd.clips.length === n0 + 2 && aggiunte.length === 2, `${n0} → ${dd.clips.length}`);
    await tasto('Control+z');
    prova('e si annulla', (await conta()) === n0);
  }

  console.log('▶ Recorder');
  await page.evaluate(() => window.__motore.vaiA(60));
  let luce = 0;
  for (let i = 0; i < 25 && luce <= 20; i++) {
    await page.waitForTimeout(200);
    luce = await page.evaluate(() => {
      const px = new Uint8Array(64 * 36 * 4);
      window.__motore.rec.leggiPiccolo(64, 36, px);
      let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
      return s / (64 * 36 * 3);
    });
  }
  prova('il Recorder mostra l\'immagine (non nero)', luce > 20, luce.toFixed(1));

  console.log('▶ Tasto 1: taglia');
  const prima = await conta();
  await page.evaluate(() => { window.__dpv.select([]); window.__motore.vaiA(60); });
  await page.locator('.tl-tela').focus();
  await tasto('1');
  d = await doc();
  prova('1 senza selezione taglia solo la clip in alto sotto il cursore e la sua audio legata', d.clips.length === prima + 2, `${prima} → ${d.clips.length}`);
  prova('i pezzi si toccano al fotogramma 60', d.clips.filter((c) => c.start === 60).length === 2);
  const sx = d.clips.find((c) => c.start === 60 && c.kind === 'media' && d.tracks.find((t) => t.id === c.track).kind === 'video');
  prova('il pezzo di destra riparte dal punto giusto della sorgente', Math.abs(sx.srcIn - 60 / 25) < 1e-6, sx.srcIn);
  const pezzoA = d.clips.find((c) => c.start === 60 && d.tracks.find((t) => t.id === c.track).kind === 'audio');
  prova('audio e video tagliati restano legati fra loro', sx.link && sx.link === pezzoA.link);
  {
    const sel = await page.evaluate(() => [...window.__dpv.sel]);
    const sxV = d.clips.find((c) => c.start === 0 && c.len === 60 && d.tracks.find((t) => t.id === c.track).name === 'V1');
    prova('dopo il taglio non resta niente di selezionato (si può cliccare subito la clip che serve)', sel.length === 0, sel.join(','));
    // ma "2" subito dopo il taglio toglie ancora il pezzo più corto (lo scarto)
    const nPrima = (await doc()).clips.length;
    await tasto('2');
    const dd = await doc();
    prova('"2" subito dopo il taglio toglie il pezzo più corto', !!sxV && !dd.clips.some((c) => c.id === sxV.id) && dd.clips.some((c) => c.id === sx.id) && dd.clips.length === nPrima - 2, `${nPrima} → ${dd.clips.length}`);
    await tasto('Control+z');
    prova('Ctrl+Z rimette il pezzo', (await doc()).clips.length === nPrima);
  }

  console.log('▶ Tasto 2: elimina');
  await page.evaluate((id) => window.__dpv.select([id]), sx.id);
  await tasto('2');
  d = await doc();
  prova('2 elimina la clip selezionata e la sua audio', d.clips.length === prima && !d.clips.some((c) => c.id === sx.id), d.clips.length);
  {
    const sel = await page.evaluate(() => [...window.__dpv.sel]);
    const dopoV = d.clips.filter((c) => c.kind !== 'fx' && d.tracks.find((t) => t.id === c.track).name === 'V1' && c.start >= 60).sort((a, b) => a.start - b.start)[0];
    prova('dopo il 2 è scelta la clip che viene dopo', !!dopoV && sel.includes(dopoV.id), sel.join(','));
  }
  prova('senza ripple resta il buco', !d.clips.some((c) => c.start === 60 && d.tracks.find((t) => t.id === c.track).name === 'V1'));
  await tasto('Control+z');
  prova('Ctrl+Z riporta le clip', (await conta()) === prima + 2);
  await tasto('Control+y');
  prova('Ctrl+Y le toglie di nuovo', (await conta()) === prima);
  await tasto('Control+z');

  console.log('▶ Tasto 3: elimina e chiudi');
  d = await doc();
  const v1 = d.tracks.find((t) => t.name === 'V1').id;
  const primoV = solide(d, v1).sort((a, b) => a.start - b.start)[0];
  const secondoV = solide(d, v1).sort((a, b) => a.start - b.start)[1];
  await page.evaluate((id) => window.__dpv.select([id]), primoV.id);
  await tasto('3');
  d = await doc();
  const dopo = d.clips.find((c) => c.id === secondoV.id);
  prova('3 chiude il buco: la clip dopo scorre all\'inizio', dopo && dopo.start === 0, dopo?.start);
  await tasto('Control+z');

  console.log('▶ Tasto 4: separa audio');
  d = await doc();
  const legata = d.clips.find((c) => c.link && c.track === v1);
  await page.evaluate((id) => window.__dpv.select([id]), legata.id);
  await tasto('4');
  d = await doc();
  prova('4 separa audio e video', !d.clips.find((c) => c.id === legata.id).link);
  await page.evaluate((id) => {
    const { M } = window.__dpvTest;
    window.__dpv.edit('prova sposta', (p) => M.moveClips(p, new Set([id]), 10, 0, 'video', 'overwrite'));
  }, legata.id);
  d = await doc();
  const mossa = d.clips.find((c) => c.id === legata.id);
  const ferma = d.clips.find((c) => c.link === undefined && c.start === legata.start && c.id !== legata.id && d.tracks.find((t) => t.id === c.track).kind === 'audio');
  prova('dopo la separazione il video si sposta da solo', mossa.start === legata.start + 10 && !!ferma, `${mossa.start}`);
  await tasto('Control+z');
  await tasto('Control+z');

  console.log('▶ Tasto 5: dissolvenza');
  d = await doc();
  const taglio = solide(d, v1).sort((a, b) => a.start - b.start).find((c) => c.start > 0 && !bloccoSul(d, c.start) && solide(d, v1).some((x) => x.start + x.len === c.start));
  await page.evaluate(() => window.__dpv.select([]));
  await page.evaluate((f) => window.__motore.vaiA(f), taglio.start);
  await tasto('5');
  d = await doc();
  const b5 = bloccoSul(d, taglio.start);
  prova('5 mette la dissolvenza sul taglio sotto il cursore (centrata, sul girato)', b5?.fxb.id === 'mix' && b5.track === v1 && Math.abs(b5.start + b5.len / 2 - taglio.start) <= 1, JSON.stringify(b5 && { s: b5.start, l: b5.len, t: taglio.start }));
  prova('la dissolvenza non cambia la durata delle clip', d.clips.find((c) => c.id === taglio.id).len === taglio.len);
  const strati5 = await page.evaluate((f) => window.__dpvTest.pianoVideo(window.__dpv.doc, f).map((s) => ({ a: s.a?.clip.id, b: s.b?.clip.id, tr: !!s.tr })), taglio.start - 2);
  prova('prima del taglio si vedono tutte e due le clip', strati5.some((s) => s.tr && s.a && s.b === taglio.id), JSON.stringify(strati5));
  await tasto('5');
  d = await doc();
  prova('5 di nuovo toglie la dissolvenza', !bloccoSul(d, taglio.start));

  console.log('▶ Attacco, stacco, estrai');
  const fineP = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
  await page.evaluate(() => window.__motore.vaiA(200));
  await tasto('i');
  await page.evaluate(() => window.__motore.vaiA(250));
  await tasto('o');
  d = await doc();
  prova('I e O segnano attacco e stacco', d.inF === 200 && d.outF === 250, `${d.inF}-${d.outF}`);
  await tasto('x');
  const fineDopo = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
  prova('X estrae e accorcia il montaggio di 50 fotogrammi', fineDopo === fineP - 50, `${fineP} → ${fineDopo}`);
  await tasto('Control+z');
  await tasto('Control+z');
  await tasto('Control+z');

  console.log('▶ Montaggio a tre punti dal Player');
  d = await doc();
  const quanti = d.clips.length;
  await page.evaluate((id) => { window.__motore.caricaPlayer(id, 1); window.__motore.setMonitor('player'); }, d.media[2].id);
  await tasto('i');
  await page.evaluate(() => window.__motore.playerVaiA(3));
  await tasto('o');
  const fineTl = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
  await page.evaluate((f) => { window.__motore.setMonitor('recorder'); window.__motore.vaiA(f); }, fineTl);
  await tasto('.');
  d = await doc();
  const nuove = d.clips.filter((c) => c.start === fineTl);
  prova('"." sovrascrive dal Player: video e audio, 2 secondi', d.clips.length === quanti + 2 && nuove.length === 2 && nuove.every((c) => c.len === 50), `${d.clips.length - quanti} clip, len ${nuove.map((c) => c.len)}`);
  prova('la sorgente entra dall\'attacco segnato', nuove.every((c) => Math.abs(c.srcIn - 1) < 1e-6));
  await tasto('Control+z');
  await tasto('Control+z');
  await tasto('Control+z');

  console.log('▶ Trasparenza al volo');
  d = await doc();
  const perOpac = d.clips.find((c) => c.track === v1);
  await page.evaluate((id) => window.__dpv.select([id]), perOpac.id);
  await tasto('Alt+ArrowDown');
  await tasto('Alt+ArrowDown');
  d = await doc();
  prova('Alt+↓ due volte = opacità 80%', Math.abs(d.clips.find((c) => c.id === perOpac.id).opacity - 0.8) < 1e-6);
  await tasto('Control+z'); await tasto('Control+z');

  console.log('▶ Istantanea e fermo immagine');
  {
    await page.evaluate(() => { window.__dpv.select([]); window.__motore.setMonitor('recorder'); window.__motore.vaiA(50); });
    await page.waitForTimeout(400);
    const m0 = (await doc()).media.length;
    await page.locator('.tl-tela').focus();
    await tasto('p');
    await page.waitForFunction((n) => window.__dpv.doc.media.length > n, m0, { timeout: 45000 });
    let dd = await doc();
    const foto = dd.media[dd.media.length - 1];
    prova('P: l\'istantanea finisce nel contenitore come immagine', foto.type === 'image' && foto.name.startsWith('Istantanea') && foto.width === dd.w && foto.height === dd.h, `${foto.type} ${foto.width}×${foto.height}`);
    // nella timeline e allungata di 5 secondi con il gruppo Durata delle proprietà
    const fine0 = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    await page.evaluate(({ id, f }) => { window.__motore.caricaPlayer(id); window.__dpv.edit('prova foto', (p) => window.__dpvTest.M.placeSource(p, { mediaId: id, srcIn: 0, srcOut: 2 }, f, null, { video: p.tracks.find((t) => t.name === 'V1').id, audio: [] }, 'overwrite')); }, { id: foto.id, f: fine0 });
    dd = await doc();
    const clipFoto = dd.clips.find((c) => c.media === foto.id);
    await page.evaluate((id) => window.__dpv.select([id]), clipFoto.id);
    await page.click('.lato .scheda[data-s=clip]');
    await page.waitForTimeout(200);
    // la durata sta nell'editor della clip (doppio clic): si apre da lì
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:sezione', { detail: 'durata' })));
    await page.waitForSelector('.editor-clip');
    await page.click('.editor-clip .ec-nav [data-sezione=tempo]');
    await page.waitForTimeout(150);
    await page.click('.editor-clip .isp-pulsanti button:has-text("+5 s")');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.editor-clip', { state: 'detached' });
    dd = await doc();
    prova('l\'istantanea si allunga (+5 s dalle proprietà)', dd.clips.find((c) => c.id === clipFoto.id).len === 50 + 125, dd.clips.find((c) => c.id === clipFoto.id).len);
    await tasto('Control+z'); await tasto('Control+z');
    // fermo immagine al fotogramma 100: due secondi dentro, il resto scorre avanti di 50
    const fineA = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    await page.evaluate(() => { window.__dpv.select([]); window.__motore.vaiA(100); });
    await page.locator('.tl-tela').focus();
    const nClip = await conta();
    await tasto('Shift+P');
    await page.waitForFunction((n) => window.__dpv.doc.clips.length > n, nClip, { timeout: 15000 });
    const fineB = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    dd = await doc();
    const fermo = dd.clips.find((c) => c.start === 100 && dd.media.find((m) => m.id === c.media)?.type === 'image');
    prova('Shift+P: fermo immagine di 2 s al cursore, il resto scorre', !!fermo && fermo.len === 50 && fineB === fineA + 50, `${fermo?.len} · ${fineA} → ${fineB}`);
    await tasto('Control+z');
  }

  console.log('▶ Transizioni nuove');
  {
    await page.click('.bin-cat[data-c=transizioni]');
    await page.waitForTimeout(300);
    prova('il pannello ha gli effetti digitali e le tendine a sagoma', (await page.locator('.gen-lista .gen-voce').count()) >= 30);
    const v1b = (await doc()).tracks.find((t) => t.name === 'V1').id;
    const taglio2 = (await doc()).clips.filter((c) => c.track === v1b).sort((a, b) => a.start - b.start)[1];
    await page.evaluate((f) => { window.__dpv.select([]); window.__motore.vaiA(f); }, taglio2.start);
    await page.locator('.gen-voce', { hasText: 'Cubo 3D' }).click();
    let dd = await doc();
    const cubo = bloccoSul(dd, taglio2.start);
    prova('clic su "Cubo 3D": la transizione sul taglio diventa il cubo', cubo?.fxb.id === 'dve:401' && cubo.fxb.tr.pattern === 401, JSON.stringify(cubo?.fxb));
    await page.evaluate((f) => window.__motore.vaiA(f), taglio2.start);
    let lum = 0;
    for (let i = 0; i < 25 && lum <= 8; i++) {
      await page.waitForTimeout(200);
      lum = await page.evaluate(() => { const px = new Uint8Array(64 * 36 * 4); window.__motore.rec.leggiPiccolo(64, 36, px); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (64 * 36 * 3); });
    }
    prova('a metà del cubo il Recorder mostra le due facce', lum > 8, lum.toFixed(1));
    await page.locator('.gen-voce', { hasText: '121 · Cuore' }).click();
    dd = await doc();
    const sul2 = dd.clips.filter((c) => c.kind === 'fx' && c.fxb?.tipo === 'transizione' && c.start <= taglio2.start && c.start + c.len >= taglio2.start);
    prova('clic su "Cuore": la tendina 121 si somma al cubo sullo stesso taglio', sul2.some((c) => c.fxb.tr.pattern === 121 && c.fxb.tr.type === 'wipe') && sul2.some((c) => c.fxb.tr.pattern === 401), JSON.stringify(sul2.map((c) => c.fxb.id)));
    await page.locator('.gen-voce', { hasText: 'Mosaico' }).click();
    const edl2 = await page.evaluate(() => window.__dpvTest.creaEdl(window.__dpv.doc));
    prova('la EDL annota l\'effetto digitale', edl2.includes('* EFFETTO: Mosaico'));
    await tasto('Control+z'); await tasto('Control+z'); await tasto('Control+z');
    await page.click('.bin-cat[data-c=tutto]');
  }

  console.log('▶ Tasti nuovi: S, Q e W, tracce accese, rotella');
  {
    await page.evaluate(() => { window.__dpv.select([]); window.__motore.setMonitor('recorder'); });
    let dd = await doc();
    const tv1 = dd.tracks.find((t) => t.name === 'V1').id, ta1 = dd.tracks.find((t) => t.name === 'A1').id;
    // S separa un gruppo, poi con due clip scelte le riunisce
    const v = dd.clips.find((c) => c.track === tv1 && c.link);
    const a = dd.clips.find((c) => c.link === v.link && c.id !== v.id);
    await page.evaluate((ids) => window.__dpv.select(ids), [v.id, a.id]);
    await page.locator('.tl-tela').focus();
    await tasto('s');
    dd = await doc();
    prova('S separa il gruppo (audio e video vanno per conto loro)', !dd.clips.find((c) => c.id === v.id).link && !dd.clips.find((c) => c.id === a.id).link);
    prova('dopo S che separa non resta niente di selezionato (si va a prendere subito la clip che serve)', (await page.evaluate(() => [...window.__dpv.sel])).length === 0);
    await page.evaluate((ids) => window.__dpv.select(ids), [v.id, a.id]);
    await tasto('s');
    dd = await doc();
    const lv = dd.clips.find((c) => c.id === v.id).link;
    prova('S con due clip scelte le riunisce in un gruppo', !!lv && lv === dd.clips.find((c) => c.id === a.id).link);
    // Q: via lo scarto a sinistra del cursore (senza ripple resta il buco)
    const c0 = dd.clips.filter((c) => c.track === tv1).sort((x, y) => x.start - y.start)[0];
    await page.evaluate((f) => { window.__dpv.select([]); window.__motore.vaiA(f); }, c0.start + 20);
    await tasto('q');
    dd = await doc();
    const c0b = dd.clips.find((c) => c.id === c0.id);
    prova('Q toglie lo scarto a sinistra del cursore', c0b.start === c0.start + 20 && c0b.len === c0.len - 20, `${c0b.start}+${c0b.len}`);
    await tasto('Control+z');
    // W: via lo scarto a destra
    await page.evaluate((f) => window.__motore.vaiA(f), c0.start + 30);
    await tasto('w');
    dd = await doc();
    prova('W toglie lo scarto a destra del cursore', dd.clips.find((c) => c.id === c0.id).len === 30);
    await tasto('Control+z');
    // tracce accese: il taglio tocca solo V1
    const yV1 = await page.evaluate(() => { const t = window.__dpv.doc.tracks; const i = t.findIndex((x) => x.name === 'V1'); return i; });
    await page.locator('.tl-testata .tt-nome').nth(yV1).click();
    const n0 = (await doc()).clips.length;
    await page.evaluate((f) => window.__motore.vaiA(f), c0.start + 40);
    await page.locator('.tl-tela').focus();
    await tasto('1');
    dd = await doc();
    prova('con V1 accesa il taglio tocca solo V1 (l\'audio resta intero)', dd.clips.length === n0 + 1 && dd.clips.some((c) => c.track === tv1 && c.start === c0.start + 40) && !dd.clips.some((c) => c.track === ta1 && c.start === c0.start + 40), `${n0} → ${dd.clips.length}`);
    await tasto('Control+z');
    await page.locator('.tl-testata .tt-nome').nth(yV1).click();
    prova('la traccia si spegne con un altro clic', await page.evaluate(() => window.__dpvTest.Z.modi.attive.size === 0));
    // la rotella: un fotogramma per scatto
    await page.evaluate(() => window.__motore.vaiA(100));
    const box = await page.locator('.tl-tela').boundingBox();
    await page.mouse.move(box.x + 300, box.y + 120);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(150);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(150);
    prova('la rotella va avanti di un fotogramma per scatto', (await page.evaluate(() => window.__dpv.head)) === 102, await page.evaluate(() => window.__dpv.head));
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(150);
    prova('e torna indietro', (await page.evaluate(() => window.__dpv.head)) === 101);
  }

  console.log('▶ Niente viene coperto');
  {
    let dd = await doc();
    const tv1 = dd.tracks.find((t) => t.name === 'V1').id;
    const [c1, c2] = solide(dd, tv1).sort((x, y) => x.start - y.start);
    const n0 = dd.clips.length;
    // c2 spostata di 40 fotogrammi indietro, dentro c1: si ferma attaccata a c1
    await page.evaluate(({ id }) => window.__dpv.edit('prova libero', (p) => window.__dpvTest.M.moveClips(p, window.__dpvTest.M.withLinked(p, [id]), -40, 0, 'video', 'libero')), { id: c2.id });
    dd = await doc();
    const c2b = dd.clips.find((c) => c.id === c2.id);
    prova('spostando una clip sopra un\'altra non si mangia niente', dd.clips.length === n0 && !coperte(dd) && c2b.start === c1.start + c1.len, `start ${c2b.start}`);
    await tasto('Control+z');
    // una ripresa lasciata dove è occupato va su una traccia libera
    const m = dd.media[0];
    const nt = dd.tracks.length;
    await page.evaluate(({ id, f }) => { window.__dpv.edit('prova posa', (p) => window.__dpvTest.M.placeSource(p, { mediaId: id, srcIn: 0, srcOut: 2 }, f, null, { video: p.tracks.find((t) => t.name === 'V1').id, audio: [p.tracks.find((t) => t.name === 'A1').id] }, 'libero')); }, { id: m.id, f: 10 });
    dd = await doc();
    const nuoveV = dd.clips.filter((c) => c.start === 10 && c.media === m.id);
    const sovr2 = coperte(dd);
    prova('una ripresa lasciata su una traccia occupata va su una libera', nuoveV.length === 2 && !sovr2 && nuoveV.every((c) => c.track !== tv1), `${nuoveV.length} clip, tracce ${dd.tracks.length - nt} nuove`);
    await tasto('Control+z');
    // l'audio non si abbassa da solo verso la fine (il vecchio "fade out automatico")
    const g = await page.evaluate(() => {
      const c0 = window.__dpv.doc.clips.find((x) => x.kind === 'media' && window.__dpv.doc.tracks.find((t) => t.id === x.track).kind === 'audio');
      const c = { ...c0, fadeIn: 0, fadeOut: 0, trIn: undefined, trOut: undefined, gainKeys: [], gain: 0 };
      const G = window.__dpvTest.guadagnoClip;
      return [G(c, 0, 0), G(c, c.len / 2, 0), G(c, c.len - 1, 0), G(c, c.len, 0)];
    });
    prova('niente fade out automatico: il volume resta pieno fino alla fine', !!g && g.every((x) => Math.abs(x - 1) < 1e-6), JSON.stringify(g));
  }

  console.log('▶ Volume sulla clip audio e transizione trascinata');
  {
    await page.evaluate(() => { window.__dpv.select([]); document.dispatchEvent(new CustomEvent('dpv:adatta')); });
    await page.waitForTimeout(300);
    // dove sta la linea del volume della prima clip di A1 (stessa geometria della timeline)
    const punto = (k) => page.evaluate((k) => {
      const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc;
      const a1 = d.tracks.find((t) => t.name === 'A1');
      const riga = { ...tl.riga(a1.id), id: a1.id };
      const c = d.clips.filter((x) => x.track === riga.id).sort((a, b) => a.start - b.start)[0];
      const top = riga.y + 2, alt = riga.h - 4, testa = Math.min(17, Math.round(alt * 0.34)), cy = top + testa, ch = alt - testa;
      const ly = cy + ch - ((c.gain + 40) / 52) * ch;
      return { x: (c.start + c.len * k - tl.scrollF) * tl.ppf, y: ly, id: c.id };
    }, k);
    const box = await page.locator('.tl-tela').boundingBox();
    const q = await punto(0.5);
    await page.mouse.move(box.x + q.x, box.y + q.y);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(box.x + q.x, box.y + q.y - 12, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    let dd = await doc();
    const g1 = dd.clips.find((c) => c.id === q.id).gain;
    prova('Maiusc+trascinando la linea gialla il volume di tutta la clip sale', g1 > 0, g1);
    const q2 = await punto(0.3);
    await page.mouse.dblclick(box.x + q2.x, box.y + q2.y);
    dd = await doc();
    prova('doppio clic sulla linea mette un punto del volume', dd.clips.find((c) => c.id === q.id).gainKeys.length >= 3, dd.clips.find((c) => c.id === q.id).gainKeys.length);
    await tasto('Control+z'); await tasto('Control+z');
    // una dissolvenza trascinata sulla coda dell'ultima clip di V1: esce in dissolvenza
    await page.click('.bin-cat[data-c=transizioni]');
    await page.waitForTimeout(200);
    const carta = await page.locator('.carta.tr', { hasText: 'Dissolvenza incrociata' }).boundingBox();
    const dove = await page.evaluate(() => {
      const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc;
      const v1 = d.tracks.find((t) => t.name === 'V1').id;
      const r = tl.riga(v1);
      const c = d.clips.filter((x) => x.track === v1 && x.kind !== 'fx').sort((a, b) => b.start - a.start)[0];
      return { x: (c.start + c.len * 0.97 - tl.scrollF) * tl.ppf, y: r.y + r.h / 2, id: c.id, fine: c.start + c.len, len: c.len };
    });
    await page.mouse.move(carta.x + carta.width / 2, carta.y + carta.height / 2);
    await page.mouse.down();
    await page.mouse.move(carta.x + 60, carta.y + 30, { steps: 4 });
    await page.mouse.move(box.x + dove.x, box.y + dove.y, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(200);
    dd = await doc();
    const bc = bloccoSul(dd, dove.fine - 1);
    prova('transizione trascinata sulla fine di una clip: un blocchetto che finisce con lei', bc?.fxb.id === 'mix' && bc.start + bc.len === dove.fine, JSON.stringify(bc && { s: bc.start, l: bc.len, fine: dove.fine }));
    prova('la clip non cambia durata', dd.clips.find((c) => c.id === dove.id).len === dove.len);
    await tasto('Control+z');
    await page.click('.bin-cat[data-c=tutto]');
  }

  console.log('▶ Transizione in coda ed effetti');
  {
    let dd = await doc();
    const tv1 = dd.tracks.find((t) => t.name === 'V1').id;
    const ultima = solide(dd, tv1).sort((x, y) => y.start - x.start)[0];
    const len0 = ultima.len;
    await page.evaluate((f) => { window.__dpv.select([]); window.__dpvTest.Z.mettiBlocco('transizione', 'dve:301', f); }, ultima.start + ultima.len);
    dd = await doc();
    const u2 = dd.clips.find((c) => c.id === ultima.id);
    const bu = bloccoSul(dd, u2.start + u2.len - 1);
    prova('transizione in coda sull\'ultima clip, senza cambiarne la durata', bu?.fxb.id === 'dve:301' && u2.len === len0);
    const strati = await page.evaluate(({ f }) => window.__dpvTest.pianoVideo(window.__dpv.doc, f).map((s) => ({ a: !!s.a, b: !!s.b, tr: !!s.tr })), { f: u2.start + u2.len - 3 });
    prova('in coda la clip esce su quello che c\'è sotto', strati.some((s) => s.a && !s.b && s.tr), JSON.stringify(strati));
    await tasto('Control+z');
    // effetto dal contenitore sulla clip scelta
    await page.evaluate((id) => window.__dpv.select([id]), ultima.id);
    await page.click('.bin-cat[data-c=effetti]');
    await page.locator('.carta.fx', { hasText: 'Bianco e nero' }).click();
    dd = await doc();
    prova('effetto dal contenitore: Bianco e nero sulla clip scelta', !!dd.clips.find((c) => c.id === ultima.id).fx.effetti?.includes('bn'));
    const accesa = await page.waitForSelector('.carta.fx.acceso:has-text("Bianco e nero")', { timeout: 3000 }).then(() => true, () => false);
    prova('la carta dell\'effetto si accende', accesa);
    await tasto('Control+z');
    await page.click('.bin-cat[data-c=tutto]');
  }


  console.log('▶ FX sulle clip: effetti a tempo trascinati, suoni, Alt+Shift');
  {
    await page.evaluate(() => { window.__dpv.select([]); document.dispatchEvent(new CustomEvent('dpv:adatta')); });
    await page.waitForTimeout(300);
    await page.click('.bin-cat[data-c=effetti]');
    await page.waitForTimeout(250);
    prova('il contenitore ha gli effetti rapidi e lunghi', (await page.locator('.carta.fxt').count()) >= 20);
    const box = await page.locator('.tl-tela').boundingBox();
    const xy = (f, nome) => page.evaluate(({ f, nome }) => { const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc; const r = tl.riga(d.tracks.find((t) => t.name === nome).id); return { x: (f - tl.scrollF) * tl.ppf, y: r.y + r.h / 2 }; }, { f, nome });
    const trascina = async (sel, q) => {
      await page.locator(sel).first().scrollIntoViewIfNeeded();
      const c = await page.locator(sel).first().boundingBox();
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
      await page.mouse.down();
      await page.mouse.move(c.x + 60, c.y + 40, { steps: 4 });
      await page.mouse.move(box.x + q.x, box.y + q.y, { steps: 10 });
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.waitForTimeout(250);
    };
    const n0 = (await doc()).clips.length;
    // un punto lontano dai tagli (vicino a un taglio il blocco si centrerebbe lì)
    const lontano = await page.evaluate(() => {
      const d = window.__dpv.doc, video = new Set(d.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
      const bordi = d.clips.filter((c) => video.has(c.track)).flatMap((c) => [c.start, c.start + c.len]);
      for (let f = 30; f < 400; f++) if (bordi.every((b) => Math.abs(b - f) > 18)) return f;
      return 60;
    });
    await trascina('.carta.fxt[data-fx=scossa]', await xy(lontano, 'V1'));
    let dd = await doc();
    const tv1 = dd.tracks.find((t) => t.name === 'V1').id;
    const scossa = dd.clips.find((c) => c.fxb?.id === 'scossa');
    prova('la scossa trascinata sulla clip diventa un blocchetto sopra la clip (sulla V1)', !!scossa && scossa.track === tv1 && Math.abs(scossa.start - lontano) <= 3 && scossa.len === 13 && dd.clips.length === n0 + 1, JSON.stringify(scossa && { s: scossa.start, l: scossa.len, f: lontano }));
    prova('la scossa ha il suo suono (impatto) pronto, ma spento: gli FX partono muti', scossa?.fxb.suono === 'impatto' && scossa.fxb.audio === false, JSON.stringify(scossa?.fxb));
    const st = await page.evaluate((f) => { const s = window.__dpvTest.B.statoEffetti(window.__dpv.doc, f, window.__dpv.doc.tracks.find((t) => t.name === 'V1').id); return s && { zoom: s.zoom, dx: s.dx }; }, scossa.start + 2);
    prova('sotto la scossa l\'immagine trema (e zooma per non mostrare i bordi)', !!st && st.zoom > 1 && st.dx !== 0, JSON.stringify(st));
    // l'altoparlante sul blocco: un clic lo spegne, un altro lo riaccende
    {
      const rb = await page.evaluate((id) => window.__dpvTest.ui().tl.rettBlocco(id), scossa.id);
      prova('il blocchetto sta in basso sulla riga, con l\'altoparlante', !!rb?.sp, JSON.stringify(rb));
      if (rb?.sp) {
        await page.mouse.click(box.x + rb.sp.x + rb.sp.s / 2, box.y + rb.sp.y + rb.sp.s / 2);
        await page.waitForTimeout(150);
        dd = await doc();
        const acceso = dd.clips.find((c) => c.id === scossa.id).fxb.audio === true;
        await page.mouse.click(box.x + rb.sp.x + rb.sp.s / 2, box.y + rb.sp.y + rb.sp.s / 2);
        await page.waitForTimeout(150);
        dd = await doc();
        prova('un clic sull\'altoparlante accende il suono dell\'FX, un altro lo rispegne', acceso && dd.clips.find((c) => c.id === scossa.id).fxb.audio === false && dd.clips.find((c) => c.id === scossa.id).start === scossa.start);
        // tasto destro sull'altoparlante: il menu piccolo dei suoni (passandoci sopra si sentono)
        await page.mouse.click(box.x + rb.sp.x + rb.sp.s / 2, box.y + rb.sp.y + rb.sp.s / 2, { button: 'right' });
        await page.waitForTimeout(200);
        const menuSuoni = await page.textContent('.menu-contesto').catch(() => '');
        await page.hover('.menu-contesto .voce:has-text("Whoosh")');
        await page.click('.menu-contesto .voce:has-text("Whoosh")');
        dd = await doc();
        const sc = dd.clips.find((c) => c.id === scossa.id).fxb;
        prova('tasto destro sull\'altoparlante: il menu dei suoni, e il suono scelto si accende', menuSuoni.includes('Campanella') && sc.suono === 'whoosh' && sc.audio === true, JSON.stringify(sc));
      }
    }
    // un lampo vicino al taglio dove c'è già la tendina: si centra sul taglio, sopra la tendina (non si coprono)
    const terza = solide(dd, tv1).sort((a, b) => a.start - b.start)[2];
    const fx0 = dd.clips.filter((c) => c.kind === 'fx').length;
    await trascina('.carta.fxt[data-fx=flash]', await xy(terza.start + 2, 'V1'));
    dd = await doc();
    const lampo = dd.clips.filter((c) => c.fxb?.id === 'flash').sort((a, b) => Math.abs(a.start + a.len / 2 - terza.start) - Math.abs(b.start + b.len / 2 - terza.start))[0];
    prova('il lampo vicino a un taglio si centra proprio lì', !!lampo && lampo.track === tv1 && Math.abs(lampo.start + lampo.len / 2 - terza.start) <= 1, JSON.stringify(lampo && { s: lampo.start, l: lampo.len, t: terza.start }));
    prova('il lampo e la tendina stanno tutti e due sul taglio (uno sopra l\'altro)', dd.clips.filter((c) => c.kind === 'fx').length === fx0 + 1 && !!bloccoSul(dd, terza.start));
    await tasto('Control+z');
    // "Al nero" lasciato verso la fine di una clip: finisce proprio con lei
    {
      const cl = solide(dd, tv1).sort((a, b) => a.start - b.start)[0];
      await trascina('.carta.fxt[data-fx=alNero]', await xy(cl.start + cl.len - 12, 'V1'));
      dd = await doc();
      const an = dd.clips.find((c) => c.fxb?.id === 'alNero');
      prova('"Al nero" vicino alla fine di una clip si attacca alla fine', !!an && an.start + an.len === cl.start + cl.len, JSON.stringify(an && { s: an.start, l: an.len, fine: cl.start + cl.len }));
      // spostando la clip il blocchetto la segue
      await page.evaluate(({ id }) => window.__dpv.edit('prova segui', (p) => window.__dpvTest.M.moveClips(p, window.__dpvTest.M.withLinked(p, [id]), 0, -1, 'video', 'libero')), { id: cl.id });
      dd = await doc();
      const an2 = dd.clips.find((c) => c.id === an?.id), cl2 = dd.clips.find((c) => c.id === cl.id);
      prova('spostando la clip su un\'altra traccia il suo FX la segue', !!an2 && an2.track === cl2.track && cl2.track !== tv1 && an2.start + an2.len === cl2.start + cl2.len, JSON.stringify({ an: an2 && [an2.track, an2.start], cl: [cl2.track, cl2.start] }));
      await tasto('Control+z'); await tasto('Control+z');
    }
    // Alt+Shift+trascina: la clip e tutto quello che viene dopo, su tutte le tracce, insieme
    {
      await page.evaluate(() => window.__dpv.select([]));
      dd = await doc();
      const seconda = solide(dd, tv1).sort((a, b) => a.start - b.start)[1];
      const dopo = dd.clips.filter((c) => (c.kind === 'fx' ? c.start + c.len / 2 : c.start) >= seconda.start).map((c) => [c.id, c.start]);
      const primaDi = dd.clips.filter((c) => c.kind !== 'fx' && c.start + c.len <= seconda.start).map((c) => [c.id, c.start]);
      const q = await xy(seconda.start + Math.round(seconda.len / 2), 'V1');
      const rv = await page.evaluate((id) => window.__dpvTest.ui().tl.riga(id), tv1);
      await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
      await page.mouse.move(box.x + q.x, box.y + rv.y + 8);
      await page.mouse.down();
      await page.mouse.move(box.x + q.x + 60, box.y + rv.y + 8, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up('Shift'); await page.keyboard.up('Alt');
      dd = await doc();
      const dfs = new Set(dopo.map(([id, s0]) => dd.clips.find((c) => c.id === id).start - s0));
      const fermi = primaDi.every(([id, s0]) => dd.clips.find((c) => c.id === id).start === s0);
      const df = [...dfs][0];
      prova('Alt+Shift+trascina sposta la clip e tutto quello dopo, su tutte le tracce, insieme', dfs.size === 1 && df > 5 && fermi && dopo.length > 8, JSON.stringify({ dfs: [...dfs], n: dopo.length, fermi }));
      await tasto('Control+z');
    }
    // i suoni degli FX: ci sono tutti, e nel mixaggio si sentono solo se accesi
    {
      const buf = await page.evaluate(() => window.__dpvTest.SU.tuttiISuoni().map((x) => { const d = x.buf?.getChannelData(0); let pk = 0; if (d) for (const v of d) pk = Math.max(pk, Math.abs(v)); return [x.id, Math.round(pk * 100) / 100, x.buf?.duration ?? 0]; }));
      prova('diciotto suoni per FX, titoli e countdown, tutti pronti e a −6 dB', buf.length === 18 && buf.every(([, pk, d]) => pk > 0.3 && pk <= 0.51 && d > 0.1), JSON.stringify(buf));
      const mix = await page.evaluate(async () => {
        const { SU, mixaggio } = window.__dpvTest;
        const d = structuredClone(window.__dpv.doc);
        for (const t of d.tracks) if (t.kind === 'audio') t.mute = true;
        const r = d.rate.num / d.rate.den;
        const fl = d.clips.find((c) => c.fxb?.id === 'flash');
        fl.fxb.audio = true;
        const e = SU.suoniFx(d).find((x) => x.id === fl.id);
        const rms = async (pp) => { let s = 0, n = 0; for await (const b of mixaggio(pp, Math.max(0, e.at), e.at + 0.5)) { const x = b.getChannelData(0); for (const v of x) { s += v * v; n++; } } return Math.sqrt(s / Math.max(1, n)); };
        const on = await rms(d);
        fl.fxb.audio = false;
        const off = await rms(d);
        return { on, off, at: e?.at, picco: (fl.start + fl.len * 0.06) / r };
      });
      prova('il suono del lampo finisce nel mixaggio (e spento non si sente)', mix.on > 0.02 && mix.off < 0.002, JSON.stringify(mix));
    }
    // i chip della durata
    await page.click('.bin-impostazioni .chip[data-d="2"]');
    await page.evaluate(() => { window.__dpv.select([]); window.__motore.vaiA(20); });
    await page.locator('.carta.fxt[data-fx=zoomLento]').click();
    dd = await doc();
    prova('con il chip "2 s" il blocco dura due secondi', dd.clips.some((c) => c.fxb?.id === 'zoomLento' && c.start === 20 && c.len === 50), JSON.stringify(dd.clips.filter((c) => c.fxb?.id === 'zoomLento').map((c) => [c.start, c.len])));
    await tasto('Control+z');
    await page.click('.bin-impostazioni .chip[data-d="0"]');
    // il lampo della demo si vede nel monitor
    const lumA = async (f) => { await page.evaluate((f) => window.__motore.vaiA(f), f); let v = -1, prima = -2; for (let i = 0; i < 12 && v !== prima; i++) { prima = v; await page.waitForTimeout(250); v = await page.evaluate(() => { const px = new Uint8Array(64 * 36 * 4); window.__motore.rec.leggiPiccolo(64, 36, px); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return Math.round(s / (64 * 36 * 3)); }); } return v; };
    const demoLampo = dd.clips.find((c) => c.fxb?.id === 'flash');
    const conLampo = await lumA(demoLampo.start + 1), senza = await lumA(demoLampo.start + demoLampo.len + 8);
    prova('il lampo schiarisce il fotogramma nel monitor', conLampo > senza + 40, `${conLampo} vs ${senza}`);
    await page.click('.bin-cat[data-c=tutto]');
  }

  console.log('▶ Testate, navigatore, dissolvenze');
  {
    prova('le testate sono strette: niente manopole né decibel', (await page.locator('.tl-testata .manopola').count()) === 0 && (await page.locator('.tl-testata.audio .tt-misura').count()) >= 1 && (await page.evaluate(() => getComputedStyle(document.querySelector('.timeline')).gridTemplateColumns)).startsWith('124px'));
    // il navigatore: si trascina la finestra e la timeline scorre
    await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; tl.adattaTutto(); tl.zoom(4, 0); });
    await page.waitForTimeout(200);
    const nav = await page.locator('.tl-nav').boundingBox();
    prova('il navigatore in fondo è alto e comodo', nav.height >= 22);
    const s0 = await page.evaluate(() => window.__dpvTest.ui().tl.scrollF);
    const fin = await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; const k = (tl.W - 4) / tl.totaleNav(); return 2 + tl.scrollF * k + 20; });
    await page.mouse.move(nav.x + fin, nav.y + nav.height / 2);
    await page.mouse.down();
    await page.mouse.move(nav.x + fin + 150, nav.y + nav.height / 2, { steps: 6 });
    await page.mouse.up();
    const s1 = await page.evaluate(() => window.__dpvTest.ui().tl.scrollF);
    prova('trascinando la finestra del navigatore la timeline scorre', s1 > s0 + 20, `${s0.toFixed(0)} → ${s1.toFixed(0)}`);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:adatta')));
    await page.waitForTimeout(200);
    // la maniglia della dissolvenza sulla prima clip audio
    const box = await page.locator('.tl-tela').boundingBox();
    const q = await page.evaluate(() => { const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc; const a1 = d.tracks.find((t) => t.name === 'A1'); const r = tl.riga(a1.id); const c = d.clips.filter((x) => x.track === a1.id).sort((a, b) => a.start - b.start)[1]; return { x: (c.start + c.fadeIn - tl.scrollF) * tl.ppf + (c.fadeIn ? 0 : 5), y: r.y + 2 + 5, id: c.id, f0: c.fadeIn }; });
    await page.mouse.move(box.x + q.x, box.y + q.y);
    await page.mouse.down();
    await page.mouse.move(box.x + q.x + 40, box.y + q.y, { steps: 5 });
    await page.mouse.up();
    let dd = await doc();
    prova('tirando il quadratino in alto la clip entra in dissolvenza', dd.clips.find((c) => c.id === q.id).fadeIn > q.f0 + 5, `${q.f0} → ${dd.clips.find((c) => c.id === q.id).fadeIn}`);
    await tasto('Control+z');
    // il fade out trascinato dal contenitore su una clip audio
    await page.click('.bin-cat[data-c=effetti]');
    await page.waitForTimeout(200);
    const c2 = await page.evaluate(() => { const tl = window.__dpvTest.ui().tl, d = window.__dpv.doc; const a1 = d.tracks.find((t) => t.name === 'A1'); const r = tl.riga(a1.id); const c = d.clips.filter((x) => x.track === a1.id).sort((a, b) => a.start - b.start)[1]; return { x: (c.start + c.len * 0.8 - tl.scrollF) * tl.ppf, y: r.y + r.h * 0.6, id: c.id }; });
    await page.locator('.carta.fx', { hasText: 'Fade out' }).first().scrollIntoViewIfNeeded();
    const carta = await page.locator('.carta.fx', { hasText: 'Fade out' }).first().boundingBox();
    await page.mouse.move(carta.x + carta.width / 2, carta.y + carta.height / 2);
    await page.mouse.down();
    await page.mouse.move(carta.x + 60, carta.y + 40, { steps: 4 });
    await page.mouse.move(box.x + c2.x, box.y + c2.y, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(200);
    dd = await doc();
    prova('"Fade out" trascinato sulla clip audio: esce piano (1 s)', dd.clips.find((c) => c.id === c2.id).fadeOut === 25, dd.clips.find((c) => c.id === c2.id).fadeOut);
    await tasto('Control+z');
    await page.click('.bin-cat[data-c=tutto]');
    // i progetti di prima: le transizioni delle clip diventano blocchetti, la corsia FX a parte sparisce
    const mig = await page.evaluate(() => {
      const { P, B } = window.__dpvTest;
      const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
      const v1 = p.tracks.find((t) => t.name === 'V1');
      const a = P.newClip('color', v1.id, 0, 50), b = P.newClip('color', v1.id, 50, 50);
      b.trIn = P.newTransition('mix', 20);
      p.clips.push(a, b);
      // la corsia FX della 1.0.4, con un lampo sopra il taglio
      const fx = P.newTrack('fx', 'FX');
      p.tracks.unshift(fx);
      p.clips.push(P.newClip('fx', fx.id, 45, 10, { fxb: { tipo: 'effetto', id: 'flash', forza: 1, colore: '#ffffff' } }));
      B.migraBlocchi(p);
      const tr = p.clips.find((c) => c.fxb?.tipo === 'transizione'), fl = p.clips.find((c) => c.fxb?.id === 'flash');
      return { fx: p.tracks.some((t) => t.kind === 'fx'), tr: tr && [tr.start, tr.len, tr.fxb.id, tr.track === v1.id], fl: fl && [fl.track === v1.id, fl.fxb.suono, fl.fxb.audio], trIn: !!b.trIn };
    });
    prova('i progetti di prima: la transizione della clip diventa un blocchetto', !mig.trIn && mig.tr?.[0] === 50 && mig.tr[1] === 20 && mig.tr[2] === 'mix' && mig.tr[3], JSON.stringify(mig));
    prova('i progetti di prima: la corsia FX sparisce, il lampo scende sulla V1 col suono pronto ma spento', !mig.fx && mig.fl?.[0] === true && mig.fl[1] === 'zap' && mig.fl[2] === false, JSON.stringify(mig));
  }

  console.log('▶ Pagina Finale');
  {
    await page.click('.pagina-btn[data-p=finale]');
    await page.waitForTimeout(500);
    await page.click('.fin-riepilogo-dettagli > summary');
    prova('la pagina Finale espone il riepilogo su richiesta', await page.isVisible('.finale .fin-riepilogo') && (await page.textContent('.fin-riepilogo')).includes('durata'));
    await page.click('.fin-voce[data-s=colore]');
    await page.locator('.fin-pagina[data-s=colore] .fin-schede-nav').getByRole('button', { name: 'Look', exact: true }).first().click();
    await page.locator('.fin-look', { hasText: 'Cinema' }).click();
    let dd = await doc();
    prova('il look Cinema vale per tutto il montaggio', dd.master?.look === 'cinema');
    let lum = 0;
    await page.evaluate(() => window.__motore.vaiA(60));
    for (let i = 0; i < 20 && lum <= 15; i++) {
      await page.waitForTimeout(200);
      lum = await page.evaluate(() => { const px = new Uint8Array(64 * 36 * 4); window.__motore.rec.leggiPiccolo(64, 36, px); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (64 * 36 * 3); });
    }
    prova('col colore finale il monitor mostra l\'immagine', lum > 15, lum.toFixed(1));
    await page.screenshot({ path: path.join(OUT, 'finale.png') });
    await tasto('Control+z');
    dd = await doc();
    prova('Ctrl+Z toglie anche il look', dd.master?.look === 'nessuno');
    // il menu a destra: sottotitoli
    prova('il Finale ha il menu a destra con sette pagine', (await page.locator('.fin-menu .fin-voce').count()) === 7);
    await page.click('.fin-voce[data-s=sottotitoli]');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__motore.vaiA(40));
    await page.locator('.fin-pagina[data-s=sottotitoli] > .fin-schede > .fin-schede-nav').getByRole('button', { name: 'Sottotitoli', exact: true }).click();
    await page.click('text=+ Riga al cursore');
    await page.waitForTimeout(200);
    await page.locator('.fin-pagina[data-s=sottotitoli] .fin-schede-nav').getByRole('button', { name: 'Le righe', exact: true }).click();
    await page.locator('.sott-testo').first().fill('Ciao da Napoli');
    await page.waitForTimeout(600);
    dd = await doc();
    prova('una riga di sottotitolo al cursore, col testo scritto', dd.sottotitoli?.righe.length === 1 && dd.sottotitoli.righe[0].da === 40 && dd.sottotitoli.righe[0].testo === 'Ciao da Napoli');
    const srt = await page.evaluate(() => { const { S } = window.__dpvTest; const t = S.creaSrt(window.__dpv.doc); return { t, n: S.leggiSrt(t, window.__dpv.doc).length }; });
    prova('il .srt si scrive e si rilegge', srt.t.includes('00:00:01,600 --> ') && srt.t.includes('Ciao da Napoli') && srt.n === 1, srt.t.split('\n').slice(0, 3).join(' / '));
    // Manual-first: i picchi non nascono più importando. Prepararli esplicitamente,
    // senza sostituire l'analisi reale con picchi finti né indebolire il controllo delle righe.
    const forme = await page.evaluate(async () => {
      const { LB, mediaRT } = window.__dpvTest;
      const ids = [...new Set(window.__dpv.doc.clips.filter((c) => c.kind === 'media' && c.media).map((c) => c.media))];
      await LB.preparaOra(ids, 'picchi');
      return ids.some((id) => !!mediaRT(id)?.peaks);
    });
    prova('la preparazione manuale produce la forma d\'onda per i dialoghi', forme);
    await page.locator('.fin-pagina[data-s=sottotitoli] .fin-schede-nav').getByRole('button', { name: 'Sottotitoli', exact: true }).click();
    await page.click('text=Prepara i tempi dai dialoghi');
    await page.waitForTimeout(300);
    dd = await doc();
    prova('i tempi dai dialoghi preparano le righe dove si sente l\'audio', dd.sottotitoli.righe.length > 1, dd.sottotitoli.righe.length);
    await page.screenshot({ path: path.join(OUT, 'finale-sottotitoli.png') });
    await tasto('Control+z');
    // i sottotitoli scritti dall'AI (qui con un Whisper finto: il modello vero si scarica da internet)
    await page.evaluate(() => {
      window.__sentito = [];
      window.__dpvTest.V.impostaTrascrittore({
        carica: async (modello, stato) => { stato('Scarico il modello: 1 di 2 MB', 0.5); window.__modello = modello; return 'wasm'; },
        trascrivi: async (audio, lingua, traduci) => {
          let e = 0; for (let i = 0; i < audio.length; i++) e += audio[i] * audio[i];
          window.__sentito.push({ n: audio.length, rms: Math.sqrt(e / Math.max(1, audio.length)), lingua, traduci });
          if (window.__sentito.length > 1) return [];
          return [
            { da: 0.5, a: 3, testo: ' Buonasera Napoli' },
            { da: 3.2, a: 3.9, testo: '[Musica]' },
            { da: 4, a: 14, testo: 'Questa è una frase lunga lunga che dura dieci secondi e non ci sta in una riga sola del sottotitolo, quindi va spezzata' },
          ];
        },
      });
    });
    await page.locator('.fin-pagina[data-s=sottotitoli] .fin-schede-nav').getByRole('button', { name: "Scritti dall'AI", exact: true }).click();
    await page.click('[data-ai=sottotitoli]');
    await page.waitForTimeout(300);
    if (await page.getByRole('button', { name: 'Rifalle', exact: true }).isVisible()) await page.getByRole('button', { name: 'Rifalle', exact: true }).click();
    await page.getByRole('button', { name: 'Consenti download e avvia', exact: true }).click();
    await page.waitForFunction(() => (window.__dpv.doc.sottotitoli?.righe ?? []).some((r) => r.testo === 'Buonasera Napoli'), null, { timeout: 30000 }).catch(() => {});
    {
      dd = await doc();
      const ai = await page.evaluate(() => ({ sentito: window.__sentito, modello: window.__modello, fine: window.__dpvTest.P.projectEnd(window.__dpv.doc) / 25 }));
      const righe = dd.sottotitoli?.righe ?? [];
      const n16 = ai.sentito.reduce((s, x) => s + x.n, 0) / 16000;
      prova('l\'AI ascolta la presa diretta a 16 kHz (non muta, lunga quanto il montaggio)', ai.sentito.length >= 1 && Math.abs(n16 - ai.fine) < 0.6 && ai.sentito[0].rms > 0.005 && ai.sentito[0].lingua === 'it' && !ai.sentito[0].traduci && ai.modello === 'onnx-community/whisper-base', JSON.stringify({ ...ai, n16 }));
      prova('le parole diventano righe coi tempi giusti', righe[0]?.testo === 'Buonasera Napoli' && righe[0].da === 13 && righe[0].a === 75, JSON.stringify(righe.slice(0, 2)));
      prova('niente "[Musica]", e la frase lunga si spezza in più righe', !righe.some((r) => /musica/i.test(r.testo)) && righe.length >= 3 && righe.slice(1).every((r) => r.testo.length <= 90), righe.map((r) => r.testo).join(' | '));
    }
    await tasto('Control+z');
    await page.evaluate(() => window.__dpvTest.V.impostaTrascrittore(null));
    // il logo: un'immagine del contenitore nell'angolo
    await page.click('.fin-voce[data-s=logo]');
    await page.evaluate(async () => {
      const c = new OffscreenCanvas(200, 80); const x = c.getContext('2d'); x.fillStyle = '#ffd54a'; x.fillRect(0, 0, 200, 80);
      const b = await c.convertToBlob({ type: 'image/png' });
      await window.__dpvTest.importaFile([{ name: 'logo.png', file: new File([b], 'logo.png', { type: 'image/png' }) }], { chiediFormato: false });
    });
    await page.waitForTimeout(300);
    const idLogo = await page.evaluate(() => window.__dpv.doc.media.find((m) => m.name === 'logo.png').id);
    await page.selectOption('.fin-pagina[data-s=logo] select', idLogo);
    dd = await doc();
    prova('il logo scelto sta in un angolo', dd.master?.logo?.media === idLogo && dd.master.logo.pos === 'alto-dx');
    await tasto('Control+z');
    // apertura: il titolo d'apertura sposta avanti tutto di tre secondi
    await page.click('.fin-voce[data-s=apertura]');
    const fine0 = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    await page.locator('.fin-pagina[data-s=apertura] .fin-schede-nav').getByRole('button', { name: 'Titoli', exact: true }).click();
    await page.click('text=Titolo d\'apertura');
    const fine1 = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    dd = await doc();
    prova('il titolo d\'apertura entra all\'inizio e sposta avanti il resto', fine1 === fine0 + 75 && dd.clips.some((c) => c.kind === 'title' && c.start === 0 && c.name.includes('apertura')), `${fine0} → ${fine1}`);
    await tasto('Control+z');
    await page.click('.fin-voce[data-s=lingue]');
    prova('Voce e lingue: due passi (sottotitoli con la traduzione, voce), i tasti ci sono e nessuno è "presto"', (await page.locator('.fin-pagina[data-s=lingue] .fin-sezione h4', { hasText: '1 · Sottotitoli' }).count()) === 1 && (await page.locator('.fin-pagina[data-s=lingue] .fin-sezione h4', { hasText: '2 · Voce' }).count()) === 1 && (await page.locator('.fin-pagina[data-s=lingue] .ai-vai').count()) === 2);
    // le novità della versione (dal CHANGELOG dentro l'app) e il confronto fra versioni
    {
      const cmp = await page.evaluate(() => { const { AG } = window.__dpvTest; return [AG.piuNuova('1.0.10', '1.0.9'), AG.piuNuova('1.0.5', '1.0.5'), AG.piuNuova('1.0.4', '1.0.5'), /proxy/i.test(AG.noteDi('1.0.4')?.note ?? '')]; });
      prova('le versioni si confrontano bene (1.0.10 dopo 1.0.9) e il CHANGELOG viaggia nell\'app', JSON.stringify(cmp) === '[true,false,false,true]', JSON.stringify(cmp));
      await page.click('.voce-menu:has-text("Aiuto")');
      await page.click('.tendina .voce:has-text("Novità della")');
      await page.waitForSelector('.dialogo.novita');
      const testo = await page.textContent('.dialogo.novita');
      // le voci della versione che gira, tutte (e le righe che vanno a capo restano dentro la loro voce)
      const versione = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
      const attese = await page.evaluate((v) => (window.__dpvTest.AG.noteDi(v)?.note.match(/^\s*[-*]\s/gm) ?? []).length, versione);
      const voci = await page.locator('.dialogo.novita li').count();
      const paragrafi = await page.locator('.dialogo.novita .novita-testo p').count();
      prova('Aiuto → Novità: le novità della versione dal CHANGELOG', testo.includes(versione) && attese > 0 && voci === attese && paragrafi <= 2, JSON.stringify({ versione, attese, voci, paragrafi, testo: testo.slice(0, 80) }));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
    await page.click('.fin-voce[data-s=colore]');
    await page.click('.pagina-btn[data-p=montaggio]');
    await page.waitForTimeout(300);
  }

  console.log('▶ 1.0.6: effetti che si sommano, menu, sottotitoli in timeline, timeline multiple, LIVE');
  {
    await page.evaluate(() => { window.__dpv.select([]); document.dispatchEvent(new CustomEvent('dpv:adatta')); });
    let dd = await doc();
    const tv1 = dd.tracks.find((t) => t.name === 'V1').id;
    const c0 = solide(dd, tv1).sort((a, b) => a.start - b.start)[0];
    // gli effetti al volo della clip si sommano: B/N e Caldo insieme, e un look vecchio resta
    await page.evaluate((id) => { window.__dpv.edit('look vecchio', (p) => { p.clips.find((c) => c.id === id).fx.look = 'vhs'; }); }, c0.id);
    await page.click('.bin-cat[data-c=effetti]');
    await page.waitForTimeout(200);
    await page.evaluate((id) => window.__dpv.select([id]), c0.id);
    for (const nome of ['Bianco e nero', 'Caldo']) { await page.locator('.carta.fx', { hasText: nome }).first().scrollIntoViewIfNeeded(); await page.locator('.carta.fx', { hasText: nome }).first().click(); await page.waitForTimeout(120); }
    dd = await doc();
    const fx0 = dd.clips.find((c) => c.id === c0.id).fx;
    const eff = await page.evaluate((fx) => window.__dpvTest.FE.fxEffettivo(fx), fx0);
    prova('gli effetti della clip si sommano: B/N + Caldo + il VHS di prima, tutti insieme', (fx0.effetti ?? []).includes('bn') && fx0.effetti.includes('caldo') && eff.looks === (1 | 4) && Math.abs(eff.temp - 0.4) < 1e-6, JSON.stringify({ e: fx0.effetti, looks: eff.looks, temp: eff.temp }));
    await tasto('Control+z'); await tasto('Control+z'); await tasto('Control+z');
    await page.click('.bin-cat[data-c=tutto]');
    // due lampi sullo stesso punto si fondono (più forti di uno solo)
    const due = await page.evaluate((tv1) => {
      const { P, B } = window.__dpvTest;
      const p = structuredClone(window.__dpv.doc);
      p.clips = p.clips.filter((c) => c.kind !== 'fx');
      const b1 = B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'flash'), forza: 0.5 }, 200, 20, tv1);
      const uno = B.statoEffetti(p, 205, tv1).flash;
      B.posaBlocco(p, { ...B.nuovoBlocco('effetto', 'flash'), forza: 0.5, colore: '#ff0000' }, 200, 20, tv1);
      const st = B.statoEffetti(p, 205, tv1);
      B.posaBlocco(p, B.nuovoBlocco('effetto', 'onda'), 200, 20, tv1);
      const conOnda = B.statoEffetti(p, 205, tv1);
      void b1; void P;
      return { uno, due: st.flash, rosso: st.flashCol[0] > st.flashCol[1], onda: conOnda.onda };
    }, tv1);
    prova('gli FX a blocchetti sullo stesso punto si sommano (due lampi più forti di uno, i colori si mescolano)', due.due > due.uno + 0.05 && due.rosso && due.onda > 0, JSON.stringify(due));
    // gli effetti nuovi (luci e distorsioni) e le transizioni nuove si disegnano senza errori
    const nErr = errori.length;
    for (const id of ['bagliore', 'flare', 'neon', 'caleido', 'vortice', 'zoomSfocato']) {
      await page.evaluate(({ id, tv1 }) => window.__dpv.edit('prova fx', (p) => { const c = window.__dpvTest.B.posaBlocco(p, window.__dpvTest.B.nuovoBlocco('effetto', id), 30, 40, tv1); c.name = '__prova'; }), { id, tv1 });
      await page.evaluate(() => window.__motore.vaiA(45));
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__dpv.edit('via', (p) => { p.clips = p.clips.filter((c) => c.name !== '__prova'); }));
    }
    prova('ci sono le luci e le distorsioni nuove, e si disegnano', (await page.evaluate(() => window.__dpvTest.B.EFFETTI_TEMPO.length)) >= 36 && errori.length === nErr, errori.slice(nErr).join(' | '));
    const mt = await page.evaluate(() => {
      const G = window.__dpvTest.G;
      const spec = { text: 'Ciao Napoli', style: 'macchina', font: 'Rajdhani', size: 60, color: '#fff', outline: 'none', shadow: false, box: false, boxColor: '#000', align: 'center', y: 0.5 };
      return { parziale: G.specAlTempo(spec, 0.25).text, intero: G.specAlTempo(spec, 5).text, salto: G.motoTitolo({ ...spec, style: 'rimbalzo' }, 100, 100, 1920, 1080, 0.1, 4).scala, neon: G.motoTitolo({ ...spec, style: 'neon' }, 100, 100, 1920, 1080, 3, 4).alfa };
    });
    prova('i titoli nuovi si muovono: macchina da scrivere lettera per lettera, rimbalzo, neon', mt.parziale === 'Ciao' && mt.intero === 'Ciao Napoli' && mt.salto < 1 && mt.neon === 1, JSON.stringify(mt));
    // il menu col tasto destro resta dentro lo schermo (anche il sottomenu dei suoni)
    await page.setViewportSize({ width: 1600, height: 700 });
    await page.waitForTimeout(400);
    const bl = await page.evaluate(() => { const d = window.__dpv.doc; const b = d.clips.find((c) => c.kind === 'fx'); return b && window.__dpvTest.ui().tl.rettBlocco(b.id); });
    const box = await page.locator('.tl-tela').boundingBox();
    await page.mouse.click(box.x + bl.x + bl.w / 2 - 6, box.y + bl.y + bl.h / 2, { button: 'right' });
    await page.waitForTimeout(200);
    await page.hover('.menu-contesto .voce:has-text("Suono")');
    await page.waitForTimeout(250);
    const rm = await page.evaluate(() => { const r = [...document.querySelectorAll('.menu-contesto')].map((m) => m.getBoundingClientRect()).filter((r) => r.height > 0); return { fuori: r.filter((x) => x.bottom > innerHeight + 1 || x.right > innerWidth + 1).length, n: r.length }; });
    prova('il menu e il sottomenu dei suoni stanno dentro lo schermo (niente sotto la barra di Windows)', rm.n >= 2 && rm.fuori === 0, JSON.stringify(rm));
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.waitForTimeout(400);
    // clic su una clip: le sue impostazioni nel pannello a destra (anche se era chiuso)
    await page.evaluate(() => document.querySelector('#app').classList.add('senza-lato'));
    const rv = await page.evaluate((id) => { const tl = window.__dpvTest.ui().tl; const d = window.__dpv.doc; const c = d.clips.find((x) => x.id === id); const r = tl.riga(c.track); return { x: (c.start + c.len * 0.5 - tl.scrollF) * tl.ppf, y: r.y + 8 }; }, c0.id);
    const box2 = await page.locator('.tl-tela').boundingBox();
    await page.mouse.click(box2.x + rv.x, box2.y + rv.y);
    await page.waitForTimeout(300);
    prova('clic su una clip: il pannello a destra si apre con le sue proprietà', await page.evaluate(() => !document.querySelector('#app').classList.contains('senza-lato') && document.querySelector('.lato .scheda.attiva')?.dataset.s === 'clip'));
    // i sottotitoli nella timeline: si trascinano, si uniscono, si dividono
    await page.evaluate(() => window.__dpv.edit('sottotitoli di prova', (p) => { p.sottotitoli = { righe: [{ id: 'sa', da: 50, a: 90, testo: 'Buonasera' }, { id: 'sb', da: 100, a: 140, testo: 'Napoli' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' }; }));
    await page.waitForTimeout(300);
    const rs = await page.evaluate(() => { const tl = window.__dpvTest.ui().tl; tl.righe(window.__dpv.doc); return { rs: tl.rigaSott, x: (60 - tl.scrollF) * tl.ppf, ppf: tl.ppf }; });
    prova('la riga dei sottotitoli compare nella timeline', !!rs.rs && (await page.locator('.tl-testata.sott').count()) === 1, JSON.stringify(rs));
    const box3 = await page.locator('.tl-tela').boundingBox();
    await page.mouse.move(box3.x + rs.x + 3, box3.y + rs.rs.y + rs.rs.h / 2);
    await page.mouse.down();
    await page.mouse.move(box3.x + rs.x + 3 + 5 * rs.ppf, box3.y + rs.rs.y + rs.rs.h / 2, { steps: 4 });
    await page.mouse.up();
    dd = await doc();
    const sa = dd.sottotitoli.righe.find((r) => r.id === 'sa');
    prova('trascinando il sottotitolo nella timeline si sposta (senza entrare nel successivo)', sa.da > 50 && sa.a - sa.da === 40 && sa.a <= 100, JSON.stringify(sa));
    const uni = await page.evaluate(() => { const S = window.__dpvTest.SOT; const s = structuredClone(window.__dpv.doc.sottotitoli); const id = S.unisciRighe(s, ['sa']); const r = s.righe.find((x) => x.id === id); const testo = r.testo, n = s.righe.length; const d2 = S.dividiRiga(s, id, r.da + 20); return { testo, n, d2: !!d2, dopo: s.righe.length }; });
    prova('unire due righe le fa apparire insieme (a capo), dividerle le separa', uni.testo === 'Buonasera\nNapoli' && uni.n === 1 && uni.d2 && uni.dopo === 2, JSON.stringify(uni));
    await tasto('Control+z'); await tasto('Control+z');
    // più timeline: una nuova vuota, poi si torna alla prima com'era
    const n0 = (await doc()).clips.length;
    await page.click('.tl-scheda.piu');
    await page.click('.menu-contesto .voce:has-text("vuota")');
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelectorAll('.tl-scheda').length === 3, null, { timeout: 4000 }).catch(() => {});
    const attesa = Date.now() - t0;
    dd = await doc();
    const vuota = { attesa, clip: dd.clips.length, seq: dd.sequenze?.length, schede: await page.locator('.tl-scheda').count() };
    const nuovaVuota = vuota.clip === 0 && vuota.seq === 2 && vuota.schede === 3;
    await page.locator('.tl-scheda', { hasText: 'Montaggio 1' }).click();
    await page.waitForTimeout(300);
    dd = await doc();
    prova('più timeline: una nuova parte vuota, la prima torna com\'era', nuovaVuota && dd.clips.length === n0 && dd.seqAttiva === dd.sequenze[0].id, JSON.stringify({ n0, ora: dd.clips.length, seq: dd.sequenze?.map((s) => s.nome), vuota }));
    await tasto('Control+z'); await tasto('Control+z');
    dd = await doc();
    prova('annulla toglie la timeline nuova', (dd.sequenze?.length ?? 1) === 1 && dd.clips.length === n0);
    // LIVE: registra (con uno schermo finto), pausa, riprendi, ferma: finisce nel contenitore e in fondo alla timeline
    await page.evaluate(() => {
      window.__dpvTest.LV.impostaSorgenteLive(async () => {
        // la tela sta nella pagina (piccola in un angolo): staccata, Chromium smette presto di darne i fotogrammi
        const c = document.createElement('canvas'); c.width = 640; c.height = 360; c.className = 'tela-live-prova';
        c.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:36px;z-index:9999;pointer-events:none';
        document.body.append(c);
        const x = c.getContext('2d'); let n = 0;
        window.__giroLive = setInterval(() => { n++; x.fillStyle = `hsl(${n * 4 % 360} 70% 45%)`; x.fillRect(0, 0, 640, 360); }, 33);
        return c.captureStream(30);
      }, async () => { const ctx = new AudioContext(); const o = ctx.createOscillator(); const d = ctx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; });
    });
    const fineP = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    const nm = (await doc()).media.length;
    await page.evaluate(() => { window.__dpvTest.ui().live.opz.conto = false; });
    await page.click('.pagina-btn[data-p=live]');
    await page.click('.live-btn.reg');
    await page.waitForTimeout(1600);
    await page.click('.live-tasti .live-btn:nth-child(2)');
    await page.waitForTimeout(900);
    const inPausa = await page.evaluate(() => document.querySelector('.live').classList.contains('in-pausa'));
    await page.click('.live-tasti .live-btn:nth-child(2)');
    await page.waitForTimeout(900);
    await page.click('.live-btn.ferma');
    await page.evaluate(() => window.__dpvTest.ui().live.ultima);
    await page.evaluate(() => { clearInterval(window.__giroLive); document.querySelector('.tela-live-prova')?.remove(); });
    dd = await doc();
    const regs = dd.media.slice(nm).filter((m) => m.name.startsWith('Registrazione'));
    const reg = regs[0];
    // quanto ha registrato l'app (pause escluse): il file deve durare quello, non quello più la pausa (~0,9 s)
    const registrato = await page.evaluate(() => window.__dpvTest.ui().live.durataUltima / 1000);
    const tracce = reg && await page.evaluate(async (id) => { const r = window.__dpvTest.mediaRT(id); return { v: await r.v.computeDuration(), a: r.a ? await r.a.computeDuration() : 0 }; }, reg.id);
    const inTl = reg && dd.clips.some((c) => c.media === reg.id && c.start === fineP);
    console.log('    LIVE:', (await page.evaluate(() => window.__dpvTest.ui().live.diagnosi)).join(' · '));
    prova('LIVE: registra, pausa (senza buchi), ferma: un file solo, nel contenitore e in fondo alla timeline',
      inPausa && regs.length === 1 && Math.abs(reg.duration - registrato) < 0.5 && tracce.v > reg.duration - 0.5 && reg.hasAudio && inTl,
      JSON.stringify({ reg: regs.map((m) => [m.name, m.duration, m.hasAudio]), registrato, tracce, fineP, inTl }));
    await page.click('.pagina-btn[data-p=montaggio]');
    await page.waitForTimeout(300);
  }

  console.log('▶ 1.0.7: play col clic, countdown, curve, cartelle, anteprime vere, riquadro sui sottotitoli, pacchetto, LIVE');
  {
    await page.evaluate(() => { window.__dpv.select([]); window.__motore.setMonitor('recorder'); window.__motore.vaiA(0); });
    // il tasto play del monitor col clic (non solo con lo Spazio)
    await page.locator('.monitor .tasto-trasporto.play:visible').first().click();
    await page.waitForTimeout(700);
    const v1 = await page.evaluate(() => window.__dpvTest.motore.speed);
    await page.locator('.monitor .tasto-trasporto.play:visible').first().click();
    await page.waitForTimeout(300);
    const v2 = await page.evaluate(() => window.__dpvTest.motore.speed);
    prova('il tasto play col clic suona e ferma', v1 !== 0 && v2 === 0, JSON.stringify({ v1, v2 }));
    // niente più INS/SOVR/LIFT/EXTRACT/REVIEW nella pulsantiera
    const puls = await page.textContent('.pulsantiera');
    prova('la pulsantiera senza INS, SOVR, LIFT, EXTRACT, REVIEW', !/\bLIFT\b|\bEXTRACT\b|\bREVIEW\b|\bSOVR\b/.test(puls), puls.slice(0, 200));
    // il countdown arriva a 1 e poi finisce; il bip suona un colpo al secondo
    const cd = await page.evaluate(() => {
      const G = window.__dpvTest.G;
      const n = [0, 1.2, 3.5, 4.2, 4.99].map((t) => G.numeroConto(t, 5));
      const ids = window.__dpvTest.Z.inserisciGeneratore('countdown', 0, undefined, { conto: { stile: 'neon', secondi: 3 } }) ?? [];
      const d = window.__dpv.doc;
      const c = d.clips.find((x) => x.kind === 'countdown' && x.gen?.conto === 'neon');
      const bip = window.__dpvTest.SU.suoniFx(d).filter((e) => e.id.startsWith(c?.id + ':')).length;
      return { n, nome: c?.name, len: c?.len, bip: c?.sfx?.suono === 'bip' && c.sfx.audio ? [c.len, bip] : null, ids };
    });
    prova('il countdown conta 5, 4, 2, 1, 1 e finisce (niente stop a 2)', cd.n.join(',') === '5,4,2,1,1', cd.n.join(','));
    prova('il countdown neon da 3 secondi, col bip dentro la clip (tre colpi, uno al secondo)', cd.nome === 'Countdown Neon 3…1' && cd.len === 75 && cd.bip && cd.bip[1] === 3, JSON.stringify(cd));
    await tasto('Control+z');
    // le forme delle dissolvenze: analogica parte piano, veloce sale subito, a S è dolce ai lati
    const cv = await page.evaluate(() => {
      const P = window.__dpvTest.P;
      return { dritta: P.curvaFade(0.5, undefined), analogica: P.curvaFade(0.5, { k: -0.6 }), veloce: P.curvaFade(0.5, { k: 1 }), s1: P.curvaFade(0.1, { k: 0, s: true }), s9: P.curvaFade(0.9, { k: 0, s: true }), nomi: P.CURVE.map((c) => c.nome) };
    });
    prova('dissolvenze con la forma: analogica sotto la dritta, veloce sopra, a S dolce ai lati', Math.abs(cv.dritta - 0.5) < 1e-6 && cv.analogica < 0.35 && cv.veloce > 0.7 && cv.s1 < 0.1 && cv.s9 > 0.9, JSON.stringify(cv));
    let dd = await doc();
    const au = dd.clips.find((c) => dd.tracks.find((t) => t.id === c.track).kind === 'audio' && c.kind === 'media' && c.len > 60);
    const gv = await page.evaluate((id) => {
      const T = window.__dpvTest, s = window.__dpv;
      s.edit('fade', (p) => { const c = p.clips.find((x) => x.id === id); c.fadeOut = 40; c.curvaOut = undefined; });
      const c1 = s.doc.clips.find((x) => x.id === id);
      const lf = c1.len - 20;
      const dritta = T.guadagnoClip(c1, lf, 0);
      s.edit('curva', (p) => { p.clips.find((x) => x.id === id).curvaOut = { k: -0.6 }; });
      const analogica = T.guadagnoClip(s.doc.clips.find((x) => x.id === id), lf, 0);
      return { dritta, analogica };
    }, au.id);
    prova('la curva cambia davvero il volume a metà dissolvenza (audio)', gv.analogica < gv.dritta * 0.8 && gv.dritta > 0, JSON.stringify(gv));
    await tasto('Control+z'); await tasto('Control+z');
    // le cartelle del contenitore: se ne fa una, ci si mette un file, il file si trova lì
    const cartella = await page.evaluate(() => {
      const s = window.__dpv;
      s.edit('cartella di prova', (p) => { (p.cartelle ??= []).push({ id: 'dprova', nome: 'B-roll' }); });
      const bin = window.__dpvTest.ui().bin;
      bin.sposta(s.doc.media[0].id, 'dprova');
      bin.mostra('dir:dprova');
      return s.doc.media[0].cartella;
    });
    await page.waitForTimeout(300);
    const carte = await page.locator('.contenitore .bin-griglia .carta[data-id]').count();
    prova('una cartella nel contenitore: il file spostato si vede lì dentro (e solo lui)', cartella === 'dprova' && carte === 1 && (await page.locator('.bin-cat[data-c="dir:dprova"]').count()) === 1, JSON.stringify({ cartella, carte }));
    await page.screenshot({ path: path.join(OUT, 'cartelle.png') });
    await page.evaluate(() => window.__dpvTest.ui().bin.mostra('tutto'));
    // le anteprime delle transizioni col fotogramma vero del cursore
    await page.evaluate(() => { window.__motore.vaiA(60); window.__dpvTest.ui().bin.mostra('transizioni'); });
    await page.waitForTimeout(400);
    await page.locator('.contenitore .carta.tr').first().hover();
    await page.waitForTimeout(1200);
    const pv = await page.evaluate(() => {
      const c = document.querySelector('.contenitore canvas.provino');
      return { c: !!c, vero: !!c?.classList.contains('vero'), w: c?.width ?? 0 };
    });
    prova('passando sopra una transizione l\'anteprima usa i fotogrammi veri del cursore', pv.c && pv.vero && pv.w > 0, JSON.stringify(pv));
    await page.screenshot({ path: path.join(OUT, 'provino.png') });
    await page.mouse.move(800, 900);
    await page.evaluate(() => window.__dpvTest.ui().bin.mostra('tutto'));
    // il riquadro prende anche i sottotitoli (e si spostano insieme)
    const E = await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc));
    await page.evaluate((E) => window.__dpv.edit('sottotitoli dopo la fine', (p) => { p.sottotitoli = { righe: [{ id: 'ra', da: E + 10, a: E + 40, testo: 'Uno' }, { id: 'rb', da: E + 50, a: E + 80, testo: 'Due' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' }; }), E);
    await page.waitForTimeout(300);
    const geo = await page.evaluate((E) => {
      const tl = window.__dpvTest.ui().tl;
      const W = document.querySelector('.tl-tela').getBoundingClientRect().width;
      for (let i = 0; i < 8 && (E + 100 - tl.scrollF) * tl.ppf > W - 20; i++) tl.zoom(0.67);
      tl.righe(window.__dpv.doc);
      const v2 = window.__dpv.doc.tracks.find((t) => t.name === 'V2').id;
      const r = tl.riga(v2);
      return { x0: (E + 5 - tl.scrollF) * tl.ppf, x1: (E + 90 - tl.scrollF) * tl.ppf, y0: r.y + r.h / 2, y1: tl.rigaSott.y + tl.rigaSott.h / 2 };
    }, E);
    const bt = await page.locator('.tl-tela').boundingBox();
    await page.mouse.move(bt.x + geo.x0, bt.y + geo.y0);
    await page.mouse.down();
    await page.mouse.move(bt.x + geo.x1, bt.y + geo.y1, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const selS = await page.evaluate(() => [...window.__dpvTest.ui().tl.selSott].sort().join(','));
    prova('il riquadro di selezione prende anche le righe dei sottotitoli', selS === 'ra,rb', selS);
    await tasto('Delete');
    dd = await doc();
    prova('Canc toglie i sottotitoli scelti col riquadro', (dd.sottotitoli?.righe.length ?? 0) === 0, JSON.stringify(dd.sottotitoli?.righe));
    await tasto('Control+z'); await tasto('Control+z');
    // la timeline si allarga in altezza (Ctrl+Shift+rotella) e torna
    const k0 = await page.evaluate(() => window.__dpvTest.ui().tl.kV());
    await page.evaluate(() => window.__dpvTest.ui().tl.zoomVerticale(1.25));
    const k1 = await page.evaluate(() => window.__dpvTest.ui().tl.kV());
    await page.evaluate(() => window.__dpvTest.ui().tl.adattaTutto());
    const k2 = await page.evaluate(() => window.__dpvTest.ui().tl.kV());
    prova('le tracce si alzano con lo zoom verticale e "adatta" le rimette', k1 > k0 && Math.abs(k2 - k0) < 1e-6, JSON.stringify({ k0, k1, k2 }));
  }

  console.log('▶ Pacchetto .daprod: salva con tutti i file e riapri identico');
  {
    const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    pg.on('pageerror', (e) => errori.push(conStack(e)));
    await pg.goto(srv.url + '/app/');
    await pg.waitForSelector('.pulsantiera');
    await pg.click('text=Prova con il montaggio dimostrativo');
    await pg.waitForFunction(() => window.__dpv.doc.clips.length >= 8, null, { timeout: 90000 });
    await pg.waitForTimeout(800);
    const r = await pg.evaluate(async () => {
      const T = window.__dpvTest, s = window.__dpv;
      const prima = { clip: s.doc.clips.length, media: s.doc.media.map((m) => [m.name, m.size]) };
      // "dove salvo": un finto file che tiene i byte
      let pacco = null;
      window.showSaveFilePicker = async () => ({ createWritable: async () => { const pezzi = []; return new WritableStream({ write(c) { pezzi.push(c); }, close() { pacco = new Blob(pezzi); } }); } });
      const piano = await T.PK.pianoPacchetto(false);
      await T.PK.scriviPacchetto('prova.daprod', piano, false, () => {}, () => false);
      delete window.showSaveFilePicker;
      const file = new File([pacco], 'prova.daprod');
      // lo zip si rilegge: ogni file al suo posto e col suo CRC
      const voci = await T.PK.indicePacchetto({ file });
      const nomi = [...voci.keys()];
      let crcOk = true;
      for (const x of piano.voci) {
        const v = voci.get(x.nome);
        const dentro = new Uint8Array(await file.slice(v.off, v.off + v.len).arrayBuffer());
        const fuori = new Uint8Array(await x.f.file.arrayBuffer());
        if (T.PK.crc32(dentro) !== T.PK.crc32(fuori) || dentro.length !== fuori.length) crcOk = false;
      }
      // e si riapre al posto del montaggio (come su un altro computer)
      s.dirty = false;
      await T.apriFile({ file });
      await new Promise((ok) => setTimeout(ok, 1500));
      const dopo = { clip: s.doc.clips.length, media: s.doc.media.map((m) => [m.name, m.size]), stati: s.doc.media.map((m) => T.mediaRT(m.id)?.stato) };
      return { prima, dopo, nomi, crcOk, byte: pacco.size };
    });
    prova('il pacchetto è uno zip con progetto.json, LEGGIMI e i media (byte identici)', r.nomi.includes('progetto.json') && r.nomi.includes('LEGGIMI.txt') && r.nomi.filter((n) => n.startsWith('media/')).length === 3 && r.crcOk, JSON.stringify({ nomi: r.nomi, crc: r.crcOk, byte: r.byte }));
    prova('il pacchetto si riapre identico, con tutti i file collegati', r.dopo.clip === r.prima.clip && JSON.stringify(r.dopo.media) === JSON.stringify(r.prima.media) && r.dopo.stati.every((x) => x === 'ok'), JSON.stringify(r.dopo));
    await pg.close();
  }

  console.log('▶ LIVE con webcam, conto alla rovescia, segni e stile presentazione');
  {
    const pg = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    pg.on('pageerror', (e) => errori.push(conStack(e)));
    await pg.goto(srv.url + '/app/');
    await pg.waitForSelector('.pulsantiera');
    await pg.evaluate(() => {
      const tela = (w, hh, fn) => {
        const c = document.createElement('canvas'); c.width = w; c.height = hh;
        c.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:18px;z-index:9999;pointer-events:none';
        document.body.append(c);
        const x = c.getContext('2d'); let n = 0;
        setInterval(() => { n++; fn(x, n); }, 33);
        return c.captureStream(30);
      };
      window.__dpvTest.LV.impostaSorgenteLive(
        async () => tela(1280, 720, (x, n) => { x.fillStyle = '#e9eef6'; x.fillRect(0, 0, 1280, 720); x.fillStyle = `hsl(${n * 4 % 360} 70% 50%)`; x.fillRect(80 + (n * 6) % 900, 300, 200, 200); }),
        async () => { const ctx = new AudioContext(); const o = ctx.createOscillator(); const d = ctx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; },
        async () => tela(640, 360, (x, n) => { x.fillStyle = '#6b4f3a'; x.fillRect(0, 0, 640, 360); x.fillStyle = '#f2c9a0'; x.beginPath(); x.arc(320, 170 + Math.sin(n / 5) * 8, 90, 0, 7); x.fill(); }),
      );
    });
    await pg.click('.pagina-btn[data-p=live]');
    await pg.waitForTimeout(300);
    await pg.click('.live .fin-interruttore:has-text("Webcam")');
    await pg.click('.live .fin-interruttore:has-text("Stile presentazione")');
    await pg.waitForTimeout(500);
    const camSu = await pg.evaluate(() => document.querySelector('.live').classList.contains('con-cam'));
    await pg.keyboard.press('r');
    await pg.waitForTimeout(1200);
    const conto = await pg.evaluate(() => ({ su: document.querySelector('.live-conto').classList.contains('su'), n: document.querySelector('.live-conto').textContent, reg: window.__dpvTest.ui().live.registrando }));
    await pg.screenshot({ path: path.join(OUT, 'live-conto.png') });
    await pg.waitForTimeout(2400);
    await pg.keyboard.press('m');
    await pg.waitForTimeout(800);
    await pg.keyboard.press('Space');
    await pg.waitForTimeout(600);
    const pausa = await pg.evaluate(() => document.querySelector('.live').classList.contains('in-pausa'));
    await pg.keyboard.press('Space');
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(OUT, 'live.png') });
    await pg.keyboard.press('f');
    await pg.evaluate(() => window.__dpvTest.ui().live.ultima);
    const r = await pg.evaluate(() => {
      const d = window.__dpv.doc;
      const regs = d.media.filter((m) => m.name.startsWith('Registrazione'));
      const cam = regs.find((m) => m.name.includes('webcam'));
      const sch = regs.find((m) => !m.name.includes('webcam'));
      const tipo = (c) => d.tracks.find((t) => t.id === c.track);
      const ordine = (c) => d.tracks.filter((t) => t.kind === 'video').reverse().findIndex((t) => t.id === c.track);
      const cSch = d.clips.find((c) => c.media === sch?.id && tipo(c).kind === 'video');
      const cCam = d.clips.find((c) => c.media === cam?.id);
      const sf = d.clips.find((c) => c.kind === 'color');
      const cart = d.cartelle?.find((c) => c.nome === 'Registrazioni');
      return {
        n: regs.length, camAudio: cam?.hasAudio, schAudio: sch?.hasAudio,
        cartella: !!cart && regs.every((m) => m.cartella === cart.id),
        sfondo: sf && { gen: sf.gen, start: sf.start, len: sf.len, o: ordine(sf) },
        schermo: cSch && { tf: cSch.tf, start: cSch.start, len: cSch.len, o: ordine(cSch), link: cSch.link },
        cam: cCam && { tf: cCam.tf, start: cCam.start, len: cCam.len, o: ordine(cCam), link: cCam.link },
        segni: d.markers.map((m) => [m.name, m.f]),
        lista: document.querySelectorAll('.live-voce img').length,
      };
    });
    prova('LIVE: la webcam si accende nell\'anteprima, il 3-2-1 prima di partire (tasto R)', camSu && conto.su && ['3', '2'].includes(conto.n), JSON.stringify({ camSu, conto }));
    prova('LIVE: schermo e webcam in due file, nella cartella Registrazioni', r.n === 2 && r.schAudio && r.camAudio === false && r.cartella, JSON.stringify(r));
    prova('LIVE: dal basso sfondo sfumato, schermo con angoli e ombra, webcam a bolla sopra; tutto legato',
      r.sfondo?.o === 0 && !!r.sfondo.gen.color2 && r.schermo?.o === 1 && r.schermo.tf.angoli > 0 && r.schermo.tf.ombra > 0 && r.schermo.tf.scale < 1 &&
      r.cam?.o === 2 && r.cam.tf.angoli === 1 && r.cam.tf.cropL > 0 && r.cam.tf.x > 0 && r.cam.tf.y > 0 && r.cam.len <= r.schermo.len &&
      r.schermo.link && r.cam.link === r.schermo.link && r.sfondo.start === r.schermo.start, JSON.stringify(r));
    prova('LIVE: il tasto M mette un segno (marcatore in timeline) e la pausa col tasto Spazio', r.segni.length === 1 && r.segni[0][0] === 'Segno 1' && r.segni[0][1] > r.schermo.start && pausa, JSON.stringify({ segni: r.segni, pausa }));
    prova('LIVE: la registrazione nella lista con la miniatura', r.lista === 1);
    // il fotogramma composto: sfondo, schermo, bolla
    await pg.click('.pagina-btn[data-p=montaggio]');
    await pg.evaluate((f) => window.__motore.vaiA(f), r.schermo.start + Math.floor(r.schermo.len / 2));
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: path.join(OUT, 'live-montaggio.png') });
    await pg.close();
  }

  console.log('▶ 1.1.3: motore NVIDIA (finto nelle prove), sottotitoli con Nemotron, voce AI, barra col tempo');
  {
    const pa = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    pa.on('pageerror', (e) => errori.push(conStack(e)));
    pa.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errori.push(m.text()); });
    await pa.goto(srv.url + '/app/');
    await pa.waitForSelector('.pulsantiera');
    await pa.click('text=Prova con il montaggio dimostrativo');
    await pa.waitForFunction(() => window.__dpv.doc.clips.length >= 8, null, { timeout: 90000 });
    await pa.waitForTimeout(1200);

    // le funzioni pure: WAV, .srt, tempo stimato, frasi, composizione della voce
    const r = await pa.evaluate(() => {
      const { WV, NM, LAV, DP, P } = window.__dpvTest;
      const out = {};
      // WAV: andata e ritorno
      const x = new Float32Array(16000); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i / 20) * 0.6;
      const b = WV.leggiWav(WV.codificaWav(x, 16000));
      let err = 0; for (let i = 0; i < x.length; i++) err = Math.max(err, Math.abs(x[i] - b.audio[i]));
      out.wav = { sr: b.sr, n: b.audio.length, err };
      // un WAV float32 stereo fatto a mano: si legge la media dei canali
      const st = new ArrayBuffer(44 + 8 * 4), v = new DataView(st);
      const t = (o, s2) => { for (let i = 0; i < s2.length; i++) v.setUint8(o + i, s2.charCodeAt(i)); };
      t(0, 'RIFF'); v.setUint32(4, 36 + 32, true); t(8, 'WAVE'); t(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 2, true);
      v.setUint32(24, 24000, true); v.setUint32(28, 24000 * 8, true); v.setUint16(32, 8, true); v.setUint16(34, 32, true); t(36, 'data'); v.setUint32(40, 32, true);
      for (let i = 0; i < 4; i++) { v.setFloat32(44 + i * 8, 0.5, true); v.setFloat32(48 + i * 8, -0.1, true); }
      const f = WV.leggiWav(st);
      out.wavF = { sr: f.sr, n: f.audio.length, v: f.audio[0] };
      out.ricamp = WV.ricampiona(new Float32Array(100), 8000, 16000).length;
      // .srt
      out.srt = NM.pezziDaSrt('1\n00:00:01,500 --> 00:00:03,000\nCiao a tutti\n\n2\n00:00:04,000 --> 00:00:06,250\nsecondo\nrigo\n', 60);
      out.lingue = [NM.codiceLingua('it'), NM.codiceLingua('auto'), NM.codiceLingua('de')];
      // il tempo che manca: 10% ogni 5 secondi → altri 40 secondi
      let ora = 0;
      const s = new LAV.Stima(() => ora);
      s.registra(0); ora = 5000; s.registra(0.1); ora = 10000; s.registra(0.2);
      out.stima = { manca: s.restante(), passati: s.trascorso(), dt: [LAV.durataTesto(45), LAV.durataTesto(130), LAV.durataTesto(3900)] };
      // le frasi da dire
      const p = { rate: { num: 25, den: 1 } };
      const righe = [
        { id: 'a', da: 0, a: 50, testo: 'Buongiorno a tutti' }, { id: 'b', da: 55, a: 100, testo: 'questo è un test' },
        { id: 'c', da: 200, a: 250, testo: 'Nuova frase.' }, { id: 'd', da: 255, a: 300, testo: 'Ancora' },
      ];
      out.enun = DP.enunciatiDaRighe(righe, p).map((e) => [e.da, e.a, e.testo]);
      // la composizione: la prima frase è troppo lunga per il suo spazio, la seconda sta
      const tono = (sr, sec, fr) => { const a = new Float32Array(Math.round(sr * sec)); for (let i = 0; i < a.length; i++) a[i] = Math.sin((2 * Math.PI * fr * i) / sr) * 0.3; return { audio: a, sr }; };
      const parlati = new Map([['1', tono(24000, 1.5, 220)], ['2', tono(22050, 0.5, 330)]]);
      const comp = DP.componiVoce([{ id: '1', da: 0, a: 1, testo: 'x' }, { id: '2', da: 1, a: 1.5, testo: 'y' }], parlati);
      const rms = (da, aa) => { let e = 0; for (let i = da; i < aa; i++) e += comp[i] * comp[i]; return Math.sqrt(e / Math.max(1, aa - da)); };
      let picco = 0; for (let i = 0; i < 40000; i++) picco = Math.max(picco, Math.abs(comp[i]));
      out.comp = { n: comp.length, prima: rms(0, 40000), buco: rms(44500, 47500), seconda: rms(48500, 70000), picco };
      return out;
    });
    prova('WAV: scritto e riletto uguale (16 bit)', r.wav.sr === 16000 && r.wav.n === 16000 && r.wav.err < 1e-3, JSON.stringify(r.wav));
    prova('WAV: legge anche float32 stereo (media dei canali)', r.wavF.sr === 24000 && r.wavF.n === 4 && Math.abs(r.wavF.v - 0.2) < 1e-6, JSON.stringify(r.wavF));
    prova('ricampionare 8→16 kHz raddoppia i campioni', r.ricamp === 200, r.ricamp);
    prova('il .srt del motore: tempi in secondi, righe unite, e il punto di partenza del pezzo si somma', r.srt.length === 2 && r.srt[0].da === 61.5 && r.srt[0].a === 63 && r.srt[1].testo === 'secondo rigo' && r.srt[1].a === 66.25, JSON.stringify(r.srt));
    prova('i codici delle lingue per il motore', r.lingue.join() === 'it-IT,auto,de-DE', r.lingue.join());
    prova('la stima del tempo che manca (10% ogni 5 s → 40 s) e i tempi scritti in modo leggibile', Math.abs(r.stima.manca - 40) < 0.5 && r.stima.passati === 10 && r.stima.dt.join('|') === '45 s|2 min 10 s|1 h 05 min', JSON.stringify(r.stima));
    prova('le righe vicine senza punto si uniscono in una frase; dopo il punto se ne fa una nuova', JSON.stringify(r.enun) === JSON.stringify([[0, 4, 'Buongiorno a tutti questo è un test'], [8, 10, 'Nuova frase.'], [10.2, 12, 'Ancora']]), JSON.stringify(r.enun));
    prova('la voce composta: la frase lunga si accelera e sta prima della successiva, la seconda parte al suo secondo', Math.abs(r.comp.n - 72000) < 1500 && r.comp.prima > 0.1 && r.comp.buco < 0.02 && r.comp.seconda > 0.1 && Math.abs(r.comp.picco - 0.8) < 0.05, JSON.stringify(r.comp));

    // i sottotitoli con Nemotron, col motore finto: installa, scarica il modello, ascolta a pezzi
    const sn = await pa.evaluate(async () => {
      const { NM, V } = window.__dpvTest;
      const chiamate = [], prog = [];
      NM.impostaMotoreNemo({
        stato: async () => ({ os: 'linux', arch: 'x86_64', cartella: '/x', installato: false, backend: '', consigliato: 'cpu', nvidia: false, modelli: 0 }),
        installa: async (av) => { chiamate.push('installa'); av(0, 'scarico il motore'); av(1, 'ok'); },
        modello: async (q, av) => { chiamate.push('modello:' + q); av(0.5, 'scarico il modello'); av(1, 'ok'); },
        trascrivi: async (pezzi, o, av) => {
          chiamate.push(`trascrivi:${pezzi.length}:${o.lingua}`);
          window.__secondi = pezzi.reduce((s, x) => s + x.audio.length, 0) / 16000;
          av(0.5, 'a metà'); av(1, 'fatto');
          return [{ da: pezzi[0].da + 0.5, a: pezzi[0].da + 3, testo: 'Buonasera Napoli' }, { da: pezzi[0].da + 4, a: pezzi[0].da + 6, testo: '[Musica]' }, { da: pezzi[0].da + 6.5, a: pezzi[0].da + 8, testo: 'Questo lo ha sentito Nemotron' }];
        },
        sintetizza: async () => new Map(),
      });
      const doc = structuredClone(window.__dpv.doc);
      const righe = await V.sottotitoliAI(doc, { lingua: 'auto', traduci: false, modello: 'x', motore: 'nemotron' }, (t, k) => prog.push(k));
      NM.impostaMotoreNemo(null);
      // senza motore (nel browser) Nemotron passa a Whisper e dice che il motore NVIDIA c'è solo nell'app
      let errore = '';
      const fasiBrowser = [];
      V.impostaTrascrittore({ carica: async () => 'wasm', trascrivi: async () => [{ da: 0.2, a: 1.4, testo: 'Ciao da Whisper' }] });
      try {
        const r = await V.sottotitoliAI(doc, { lingua: 'it', traduci: false, modello: 'x', motore: 'nemotron' }, (t) => fasiBrowser.push(t));
        if (!r.some((x) => x.testo === 'Ciao da Whisper')) errore = 'Whisper non ha scritto';
        else errore = fasiBrowser.find((t) => /solo nell'app/.test(t)) ?? 'nessun avviso';
      } catch (e) { errore = 'errore: ' + e.message; } finally { V.impostaTrascrittore(null); }
      let cresce = true; for (let i = 1; i < prog.length; i++) if (prog[i] < prog[i - 1] - 1e-9) cresce = false;
      return { chiamate, righe: righe.map((x) => x.testo), secondi: window.__secondi, fine: window.__dpvTest.P.projectEnd(window.__dpv.doc) / 25, cresce, ultimo: prog[prog.length - 1], errore };
    });
    prova('Nemotron: prima installa il motore, poi il modello, poi ascolta (lingua automatica)', sn.chiamate[0] === 'installa' && sn.chiamate[1] === 'modello:asr' && /^trascrivi:\d+:auto$/.test(sn.chiamate[2]), JSON.stringify(sn.chiamate));
    prova('Nemotron ascolta tutto il montaggio (audio a 16 kHz) e le frasi diventano righe', Math.abs(sn.secondi - sn.fine) < 0.6 && sn.righe.length >= 2 && sn.righe[0] === 'Buonasera Napoli' && !sn.righe.some((t) => /musica/i.test(t)), JSON.stringify(sn));
    prova('la barra dei sottotitoli non torna mai indietro e arriva a 100%', sn.cresce && sn.ultimo === 1, JSON.stringify({ c: sn.cresce, u: sn.ultimo }));
    prova('nel browser (senza motore) Nemotron passa a Whisper e avvisa che il motore NVIDIA è solo nell\'app', /solo nell'app/.test(sn.errore) && !/^errore/.test(sn.errore), sn.errore);

    // la voce AI dalla pagina Finale, col motore finto
    await pa.evaluate(() => {
      const { NM } = window.__dpvTest;
      window.__voceChiamate = [];
      NM.impostaMotoreNemo({
        stato: async () => ({ os: 'linux', arch: 'x86_64', cartella: '/x', installato: true, backend: 'cuda', consigliato: 'cuda', nvidia: true, modelli: 900 * 1048576 }),
        installa: async () => {},
        modello: async (q, av) => { window.__voceChiamate.push('modello:' + q); av(1, 'ok'); },
        trascrivi: async () => [],
        sintetizza: async (voci, o, av) => {
          window.__voceChiamate.push(`sintetizza:${voci.length}:${o.lingua}:${o.voce}`);
          const m = new Map();
          for (const [i, v] of voci.entries()) {
            av(i / voci.length, 'frase ' + (i + 1));
            await new Promise((ok) => setTimeout(ok, 350));
            const a = new Float32Array(Math.round(22050 * (0.05 * v.testo.length))); for (let k = 0; k < a.length; k++) a[k] = Math.sin((2 * Math.PI * 220 * k) / 22050) * 0.3;
            m.set(v.id, { audio: a, sr: 22050 });
          }
          av(1, 'ok');
          return m;
        },
      });
      window.__dpv.edit('sottotitoli di prova', (p) => { p.sottotitoli = { righe: [{ id: 'ra', da: 0, a: 50, testo: 'Buonasera Napoli.' }, { id: 'rb', da: 60, a: 140, testo: 'Questa è la voce AI.' }], nelVideo: true, dimensione: 46, fascia: true, alto: false, lingua: 'it' }; });
    });
    await pa.click('.pagina-btn[data-p=finale]');
    await pa.waitForTimeout(400);
    await pa.click('.fin-voce[data-s=lingue]');
    await pa.waitForTimeout(300);
    await pa.locator('.fin-pagina[data-s=lingue] .fin-schede-nav').getByRole('button', { name: '2 · Voce', exact: true }).click();
    prova('nella pagina Lingue c\'è la Voce AI, con le cinque voci di NVIDIA e il tasto', (await pa.locator('.fin-pagina[data-s=lingue] .chip', { hasText: 'Sofia' }).count()) === 1 && await pa.isVisible('[data-ai=voce]'));
    await pa.locator('.fin-pagina[data-s=lingue] .chip', { hasText: 'Sofia' }).click();
    const prima = await pa.evaluate(() => structuredClone(window.__dpv.doc));
    await pa.click('[data-ai=voce]');
    await pa.waitForSelector('.ai-passi', { state: 'visible' });
    prova('Voce AI aspetta il consenso prima di chiamare il motore', await pa.evaluate(() => window.__voceChiamate.length === 0));
    await pa.getByRole('button', { name: 'Consenti download e avvia', exact: true }).click();
    await pa.waitForFunction(() => [...document.querySelectorAll('.fin-pagina[data-s=lingue] .ai-tempo')].some((e) => /%/.test(e.textContent) && /passati/.test(e.textContent)));
    const mezzo = await pa.evaluate(() => ({ testo: [...document.querySelectorAll('.fin-pagina[data-s=lingue] .ai-tempo')].map((e) => e.textContent).join('|'), fase: [...document.querySelectorAll('.fin-pagina[data-s=lingue] .ai-fase')].map((e) => e.textContent).join('|') }));
    prova('mentre lavora si vede la barra con la percentuale e il tempo passato', /%/.test(mezzo.testo) && /passati/.test(mezzo.testo), JSON.stringify(mezzo));
    await pa.waitForFunction(() => window.__dpv.doc.tracks.some((t) => t.name === 'Voce AI'), null, { timeout: 30000 });
    await pa.waitForTimeout(300);
    const dopo = await pa.evaluate(() => {
      const d = window.__dpv.doc;
      const tr = d.tracks.find((t) => t.name === 'Voce AI');
      const cs = d.clips.filter((x) => x.track === tr.id).sort((a, b) => a.start - b.start);
      const c = cs[0];
      const m = d.media.find((x) => x.id === c.media);
      const righe = d.sottotitoli.righe;
      return {
        chiamate: window.__voceChiamate, traccia: tr.kind, start: c.start, len: c.len, tipo: m.type, durata: m.duration, nClip: cs.length, starts: cs.map((x) => x.start),
        collegate: righe.every((x) => cs.some((k) => k.id === x.voce)), nomi: cs.map((k) => k.name),
        mute: d.tracks.filter((t) => t.mute).map((t) => t.name), gain: d.clips.filter((x) => x.gain <= -40).length,
        fine: [...document.querySelectorAll('.fin-pagina[data-s=lingue] .ai-tempo')].pop().textContent,
      };
    });
    prova('la voce AI: due frasi, lingua italiana, la voce numero 1 (Sofia)', dopo.chiamate.join() === 'modello:tts,sintetizza:2:it:1', dopo.chiamate.join());
    prova('la voce va su una traccia audio nuova "Voce AI": una clip per frase (ognuna al suo posto) dallo stesso file', dopo.traccia === 'audio' && dopo.start === 0 && dopo.tipo === 'audio' && dopo.nClip === 2 && dopo.starts[1] === 60 && dopo.durata > 3 && dopo.len > 10 && dopo.len < dopo.durata * 25, JSON.stringify(dopo));
    prova('ogni riga dei sottotitoli sa qual è la sua clip di voce', dopo.collegate && dopo.nomi.every((n) => n.startsWith('Voce: ')), JSON.stringify(dopo.nomi));
    prova('le voci originali vanno in silenzio (traccia muta o clip a −40 dB)', dopo.mute.length > 0 || dopo.gain > 0, JSON.stringify(dopo));
    prova('a lavoro finito la barra dice quanto ci ha messo', /finito in/.test(dopo.fine), dopo.fine);
    await pa.keyboard.press('Control+z'); await pa.waitForTimeout(150);
    const annullata = await pa.evaluate(() => ({ tr: window.__dpv.doc.tracks.some((t) => t.name === 'Voce AI'), mute: window.__dpv.doc.tracks.filter((t) => t.mute).length }));
    prova('Ctrl+Z toglie la voce AI e rimette le voci originali', !annullata.tr && annullata.mute === prima.tracks.filter((t) => t.mute).length, JSON.stringify(annullata));
    await pa.evaluate(() => window.__dpvTest.NM.impostaMotoreNemo(null));
    await pa.close();
  }

  console.log('▶ LIVE: voce e audio del computer separati');
  {
    const pg = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    pg.on('pageerror', (e) => errori.push(conStack(e)));
    await pg.goto(srv.url + '/app/');
    await pg.waitForSelector('.pulsantiera');
    await pg.evaluate(() => {
      const tono = (freq) => { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.frequency.value = freq; const d = ctx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream.getAudioTracks()[0]; };
      window.__dpvTest.LV.impostaSorgenteLive(
        async (conAudio) => {
          const c = document.createElement('canvas'); c.width = 640; c.height = 360;
          c.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:18px;z-index:9999;pointer-events:none';
          document.body.append(c);
          const x = c.getContext('2d'); let n = 0;
          setInterval(() => { n++; x.fillStyle = `hsl(${n * 4 % 360} 70% 50%)`; x.fillRect(0, 0, 640, 360); }, 33);
          const st = c.captureStream(30);
          if (conAudio) st.addTrack(tono(300));
          return st;
        },
        async () => new MediaStream([tono(700)]),
      );
    });
    await pg.click('.pagina-btn[data-p=live]');
    await pg.waitForTimeout(300);
    await pg.evaluate(() => { const o = window.__dpvTest.ui().live.opz; o.conto = false; });
    await pg.keyboard.press('r');
    await pg.waitForTimeout(3000);
    await pg.keyboard.press('f');
    await pg.evaluate(() => window.__dpvTest.ui().live.ultima);
    const r = await pg.evaluate(() => {
      const d = window.__dpv.doc;
      const regs = d.media.filter((m) => m.name.startsWith('Registrazione'));
      const mic = regs.find((m) => m.name.includes('microfono'));
      const sch = regs.find((m) => !m.name.includes('microfono'));
      const kind = (c) => d.tracks.find((t) => t.id === c.track).kind;
      const cMic = d.clips.find((c) => c.media === mic?.id), cSch = d.clips.find((c) => c.media === sch?.id && kind(c) === 'video');
      const cAudio = d.clips.find((c) => c.media === sch?.id && kind(c) === 'audio');
      return {
        n: regs.length, micTipo: mic?.type, schHaAudio: sch?.hasAudio, micDur: mic?.duration, schDur: sch?.duration,
        cMic: cMic && { track: cMic.track, start: cMic.start, len: cMic.len, link: cMic.link, name: cMic.name },
        cAudio: cAudio && { track: cAudio.track, start: cAudio.start, link: cAudio.link, name: cAudio.name },
        cSch: cSch && { start: cSch.start, link: cSch.link },
        tracce: d.tracks.filter((t) => t.kind === 'audio').length,
      };
    });
    prova('LIVE: microfono e audio del computer in due file (il video ha quello del computer)', r.n === 2 && r.micTipo === 'audio' && r.schHaAudio && Math.abs(r.micDur - r.schDur) < 0.6, JSON.stringify(r));
    prova('LIVE: la voce va su un\'altra traccia audio, nello stesso punto e legata allo schermo', !!r.cMic && !!r.cAudio && r.cMic.track !== r.cAudio.track && r.cMic.start === r.cSch.start && r.cMic.link === r.cSch.link && r.cAudio.link === r.cSch.link && r.cMic.name === 'Microfono', JSON.stringify(r));
    // con l'interruttore spento tutto va in un file solo, come prima
    await pg.evaluate(() => { window.__dpvTest.ui().live.opz.separato = false; });
    await pg.keyboard.press('r');
    await pg.waitForTimeout(2200);
    await pg.keyboard.press('f');
    await pg.evaluate(() => window.__dpvTest.ui().live.ultima);
    const n2 = await pg.evaluate(() => window.__dpv.doc.media.filter((m) => m.name.startsWith('Registrazione')).length);
    prova('LIVE: con "Voce e computer separati" spento il microfono non ha il file suo', n2 === 3, n2);
    await pg.close();
  }

  console.log('▶ 1.1.2: effetti che si sommano davvero, tappe di mezzo, stira e ritaglia, tracking, effetti/transizioni/titoli nuovi');
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on('pageerror', (e) => errori.push(conStack(e)));
    await page.goto(srv.url + '/app/');
    await page.waitForSelector('.pulsantiera');
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:demo')));
    await page.waitForFunction(() => window.__dpv.doc.clips.length >= 8, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    {
  console.log('▶ Effetti che si sommano');
  const r = await page.evaluate(async () => {
    const { PV, B } = window.__dpvTest;
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 135;
    const leggi = () => { const d = cv.getContext('2d').getImageData(0, 0, 240, 135).data; return Array.from(d); };
    const scena = (ids) => (a, b) => {
      const s = PV.scenaEffetto(ids[0], 1)(a, b);
      const v1 = s.p.tracks.find((t) => t.name === 'V1').id;
      for (const id of ids.slice(1)) B.posaBlocco(s.p, B.nuovoBlocco('effetto', id), 0, s.a - s.da, v1);
      return s;
    };
    const foto = async (ids) => { await PV.fotoScena(scena(ids), 0.5, cv); return leggi(); };
    const diff = (x, y) => { let s = 0; for (let i = 0; i < x.length; i += 4) s += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]); return s / (x.length / 4) / 3; };
    const nulla = await foto(['lampoNero']); // quasi niente (il lampo nero è al picco a metà: lo si evita)
    const solo1 = await foto(['sfoca']), solo2 = await foto(['zoomSfocato']), tutti = await foto(['sfoca', 'zoomSfocato']);
    const s1 = await foto(['sfoca']), s3 = await foto(['sfoca', 'glitch']), g = await foto(['glitch']);
    const s4 = await foto(['sfoca', 'rgb']), rgb = await foto(['rgb']);
    return { d1: diff(tutti, solo1), d2: diff(tutti, solo2), d3: diff(s3, s1), d4: diff(s3, g), d5: diff(s4, s1), d6: diff(s4, rgb), n: diff(nulla, solo1) };
  });
  prova('sfoca + zoom sfocato: si vedono tutti e due (prima ne restava uno)', r.d1 > 0.4 && r.d2 > 0.4, JSON.stringify(r));
  prova('sfoca + glitch: la sfocatura c\'è anche coi colori sdoppiati', r.d3 > 0.4 && r.d4 > 0.4, JSON.stringify(r));
  prova('sfoca + colori sdoppiati: tutti e due', r.d5 > 0.4 && r.d6 > 0.4, JSON.stringify(r));
    }
    {
  console.log('▶ Effetti, transizioni e titoli nuovi');
  const r = await page.evaluate(async () => {
    const { PV, B } = window.__dpvTest;
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 135;
    const luce = () => { const d = cv.getContext('2d').getImageData(0, 0, 240, 135).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
    const fx = {};
    for (const e of B.EFFETTI_TEMPO) { const ok = await PV.fotoScena(PV.scenaEffetto(e.id, 1), 0.5, cv); fx[e.id] = ok ? luce() : -1; }
    const tr = {};
    for (const id of ['dve:601', 'dve:611', 'dve:621', 'dve:631', 'dve:641', 'dve:651', 'dve:661', 'dve:671', 'dve:681', 'dve:691', 'dve:701', 'dve:711', 'dve:721', 'dve:731', 'dve:801', 'wipe:42', 'wipe:61', 'wipe:62', 'wipe:103', 'wipe:122', 'wipe:123', 'wipe:202']) { const ok = await PV.fotoScena(PV.scenaTransizione(id, 1), 0.35, cv); tr[id] = ok ? luce() : -1; }
    return { fx, tr, nfx: B.EFFETTI_TEMPO.length };
  });
  prova('tutti gli effetti a tempo si disegnano', Object.values(r.fx).every((v) => v >= 0), JSON.stringify(Object.entries(r.fx).filter(([, v]) => v < 0)));
  prova('ci sono più di 55 effetti a tempo (i nuovi sono dentro)', r.nfx >= 55, r.nfx);
  prova('tutte le transizioni nuove si disegnano', Object.values(r.tr).every((v) => v >= 0), JSON.stringify(r.tr));
  const t = await page.evaluate(async () => {
    const { G, P } = window.__dpvTest;
    const stili = ['cascata', 'assembla', 'onda', 'evidenzia', 'karaoke', 'estruso', 'ombraLunga', 'contorno', 'notiziario'];
    const out = {};
    for (const st of stili) {
      const spec = { ...P.TITLE0, style: st, text: 'Ciao mondo\nsecondo rigo', sotto: 'sotto', boxColor: '#ff3df2cc', size: 100 };
      const tt = G.telaTitolo(G.specAlTempo(spec, 1.2), 1920, 1080);
      const c = document.createElement('canvas'); c.width = 192; c.height = 108;
      c.getContext('2d').drawImage(tt.tela, 0, 0, 192, 108);
      const d = c.getContext('2d').getImageData(0, 0, 192, 108).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      out[st] = n;
    }
    // ingresso e uscita
    const spec = { ...P.TITLE0, ingresso: 'sale', uscita: 'zoom' };
    const a = G.motoTitolo(spec, 1920, 1080, 1920, 1080, 0.1, 5), b = G.motoTitolo(spec, 1920, 1080, 1920, 1080, 2.5, 5);
    return { out, a, b };
  });
  prova('i titoli nuovi disegnano qualcosa', Object.values(t.out).every((n) => n > 300), JSON.stringify(t.out));
  prova('ingresso: parte più in basso e trasparente; a metà è fermo e pieno', t.a.dy > 0 && t.a.alfa < 0.6 && Math.abs(t.b.dy) < 1e-6 && (t.b.alfa ?? 1) > 0.99, JSON.stringify(t));
    }
    {
  console.log('▶ Tappe di mezzo, stira e ritaglia sull\'immagine');
  const d = await page.evaluate(() => window.__dpv.doc);
  const v1 = d.tracks.find((t) => t.name === 'V1').id;
  const clip = d.clips.find((c) => c.track === v1 && c.kind === 'media');
  await page.evaluate((id) => { window.__dpv.select([id]); }, clip.id);
  await page.evaluate((c) => window.__motore.vaiA(c.start + 8), clip);
  await page.waitForTimeout(800);
  const r1 = await page.evaluate((id) => {
    const { P } = window.__dpvTest;
    window.__dpv.edit('prova moto', (p) => { const c = p.clips.find((x) => x.id === id); c.tf = { ...P.TF0, x: -300 }; c.tfFine = { ...P.TF0, x: 300 }; c.via = [{ t: 0.5, tf: { ...P.TF0, x: 0, y: -200 } }]; });
    const c = window.__dpv.doc.clips.find((x) => x.id === id);
    const mid = P.tfAl(c, Math.round((c.len - 1) * 0.5));
    const a = P.tfAl(c, 0), z = P.tfAl(c, c.len - 1);
    let mono = true, prev = -1e9;
    for (let i = 0; i < c.len; i += 2) { const t = P.tfAl(c, i); if (t.x < prev - 1e-6) mono = false; prev = t.x; }
    return { mid: [mid.x, mid.y], a: a.x, z: z.x, mono, tappe: P.tappeTf(c).length };
  }, clip.id);
  prova('la clip passa dalla tappa di mezzo (e parte e arriva dove deve)', Math.abs(r1.mid[0]) < 4 && Math.abs(r1.mid[1] + 200) < 2 && r1.a === -300 && r1.z === 300 && r1.tappe === 3, JSON.stringify(r1));
  prova('il percorso non torna indietro né sfora', r1.mono);
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.tfFine); window.__motore.vaiA(c.start + Math.round((c.len - 1) * 0.25)); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'percorso.png') });
  // fra due tappe: si trascina l'immagine e nasce una tappa
  const rr = await page.evaluate(() => {
    const c = window.__dpv.doc.clips.find((x) => x.tfFine);
    const { P } = window.__dpvTest;
    const r = document.querySelector('.schermo-sopra').getBoundingClientRect();
    const p = window.__dpv.doc;
    const tf = P.tfAl(c, Math.floor(window.__dpv.head) - c.start);
    return { x: r.left + ((p.w / 2 + tf.x) / p.w) * r.width, y: r.top + ((p.h / 2 + tf.y) / p.h) * r.height, n: (c.via ?? []).length };
  });
  await page.mouse.move(rr.x, rr.y);
  await page.mouse.down();
  await page.mouse.move(rr.x + 30, rr.y + 20, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dopo = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.tfFine).via.length);
  prova('fermo fra due tappe, trascinare fa nascere una tappa nuova', dopo === rr.n + 1, `${rr.n} → ${dopo}`);
  // stira da un lato
  await page.evaluate((id) => window.__dpv.edit('azzera', (p) => { const c = p.clips.find((x) => x.id === id); delete c.tfFine; delete c.via; c.tf = { ...window.__dpvTest.P.TF0 }; }), clip.id);
  await page.evaluate((c) => window.__motore.vaiA(c.start + 8), clip);
  await page.waitForTimeout(800);
  const q = await page.evaluate((id) => {
    const p = window.__dpv.doc, r = document.querySelector('.schermo-sopra').getBoundingClientRect();
    const c = p.clips.find((x) => x.id === id);
    const m = p.media.find((x) => x.id === c.media);
    const k = Math.min(p.w / m.width, p.h / m.height);
    const w = m.width * k, h = m.height * k;
    const px = (X, Y) => ({ x: r.left + (X / p.w) * r.width, y: r.top + (Y / p.h) * r.height });
    return { destra: px(p.w / 2 + w / 2, p.h / 2), w, h, rw: r.width / p.w };
  }, clip.id);
  await page.mouse.move(q.destra.x, q.destra.y);
  await page.mouse.down();
  await page.mouse.move(q.destra.x - q.w * 0.3 * q.rw, q.destra.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const st = await page.evaluate((id) => { const c = window.__dpv.doc.clips.find((x) => x.id === id); return { sx: c.tf.sx, scale: c.tf.scale, x: c.tf.x }; }, clip.id);
  prova('un lato tirato stira da una parte sola (larghezza minore, altezza uguale, l\'altro lato fermo)', st.sx < 0.8 && Math.abs(st.scale - 1) < 0.02 && st.x < 0, JSON.stringify(st));
  // ritaglia
  await page.evaluate((id) => window.__dpv.edit('azzera', (p) => { p.clips.find((x) => x.id === id).tf = { ...window.__dpvTest.P.TF0 }; }), clip.id);
  await page.waitForTimeout(400);
  await page.click('.pos-btn[title^="Ritaglia"]');
  await page.mouse.move(q.destra.x, q.destra.y);
  await page.mouse.down();
  await page.mouse.move(q.destra.x - q.w * 0.2 * q.rw, q.destra.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const cr = await page.evaluate((id) => { const c = window.__dpv.doc.clips.find((x) => x.id === id); return { r: c.tf.cropR, sx: c.tf.sx, x: c.tf.x }; }, clip.id);
  prova('con Ritaglia il lato ritaglia e l\'immagine non si muove', cr.r > 0.15 && (cr.sx ?? 1) === 1 && cr.x === 0, JSON.stringify(cr));
  await page.click('.pos-btn[title^="Ritaglia"]');
  await page.evaluate((id) => window.__dpv.edit('azzera', (p) => { p.clips.find((x) => x.id === id).tf = { ...window.__dpvTest.P.TF0 }; }), clip.id);
  // Ctrl+clic sceglie la clip che sta sotto: il titolo sta sopra la ripresa, al centro
  await page.evaluate(() => { const d = window.__dpv.doc; const t = d.clips.find((x) => x.kind === 'title'); window.__dpv.select([t.id]); window.__motore.vaiA(t.start + 30); });
  await page.waitForTimeout(900);
  const cc = await page.evaluate(() => { const d = window.__dpv.doc, r = document.querySelector('.schermo-sopra').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, sel: [...window.__dpv.sel][0], kind: d.clips.find((x) => x.id === [...window.__dpv.sel][0]).kind }; });
  await page.keyboard.down('Control');
  await page.mouse.click(cc.x, cc.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  const dopoC = await page.evaluate(() => { const d = window.__dpv.doc; const c = d.clips.find((x) => x.id === [...window.__dpv.sel][0]); return { kind: c.kind, track: d.tracks.find((t) => t.id === c.track).name }; });
  prova('Ctrl+clic sull\'immagine sceglie la clip che sta sotto', cc.kind === 'title' && dopoC.kind === 'media' && dopoC.track === 'V1', JSON.stringify({ cc, dopoC }));
    }
    {
  console.log('▶ Tracking di un oggetto');
  const info = await page.evaluate(() => {
    const d = window.__dpv.doc;
    const m = d.media.find((x) => x.name.startsWith('Pallina'));
    const c = d.clips.find((x) => x.media === m.id && d.tracks.find((t) => t.id === x.track).kind === 'video');
    return { mid: m.id, c, w: m.width, h: m.height, dur: m.duration };
  });
  const risultato = await page.evaluate(async ({ mid, c, w, h }) => {
    const { TK } = window.__dpvTest;
    const W = 960, H = 540;
    const pos = (t) => { const ph = (t * 1.1) % 1; return [(120 + ((t % 6) / 6) * (W - 240)) / W, (H - 90 - Math.abs(Math.sin(ph * Math.PI)) * 330) / H]; };
    const t0 = c.srcIn + 0.6;
    const [x0, y0] = pos(t0);
    let prog = 0;
    const tr = await TK.seguiOggetto(mid, { da: t0, x: x0, y: y0, lato: 0.09, inizio: c.srcIn, fine: c.srcIn + (c.len / 25), avanza: (k) => { prog = k; } });
    if (!tr) return { errore: 'niente' };
    const errs = [];
    for (const t of [c.srcIn + 0.2, c.srcIn + 1.0, c.srcIn + 1.5, c.srcIn + 2.2]) {
      let a = 0, b = tr.punti.length - 1;
      const q = tr.punti.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), tr.punti[0]);
      // il disegno della pallina può essere in ritardo di un fotogramma sul suo tempo: si tiene il migliore fra -1, 0, +1
      errs.push(Math.min(...[-0.04, 0, 0.04].map((sh) => { const [ex, ey] = pos(q.t + sh); return Math.hypot(q.x - ex, q.y - ey); })));
    }
    return { n: tr.punti.length, errs, prog, fiducia: tr.fiducia, da: tr.da, t0 };
  }, info);
  console.log('   ', JSON.stringify(risultato));
  prova('il tracking trova la pallina in tutta la ripresa (errore < 2% del quadro)', !risultato.errore && risultato.n > 20 && risultato.errs.every((e) => e < 0.04), JSON.stringify(risultato));
  // un titolo segue l'oggetto
  const seg = await page.evaluate(async ({ mid, c }) => {
    const { TK, TR, P } = window.__dpvTest;
    const W = 960, H = 540;
    const pos = (t) => { const ph = (t * 1.1) % 1; return [(120 + ((t % 6) / 6) * (W - 240)) / W, (H - 90 - Math.abs(Math.sin(ph * Math.PI)) * 330) / H]; };
    const [x0, y0] = pos(c.srcIn + 0.6);
    const tr = await TK.seguiOggetto(mid, { da: c.srcIn + 0.6, x: x0, y: y0, lato: 0.09, inizio: c.srcIn, fine: c.srcIn + c.len / 25 });
    window.__dpv.edit('traccia', (p) => { p.clips.find((z) => z.id === c.id).traccia = tr; });
    const p = window.__dpv.doc;
    const cc = p.clips.find((z) => z.id === c.id);
    const tit = P.newClip('title', cc.track, cc.start, cc.len, { gen: { title: { ...P.TITLE0 } }, segue: cc.id });
    const o1 = TR.spostaTraccia({ ...p, clips: [...p.clips, tit] }, tit, cc.start + 15), o2 = TR.spostaTraccia({ ...p, clips: [...p.clips, tit] }, tit, cc.start + 60);
    // stabilizza: la ripresa si sposta al contrario
    cc.stabilizza = true;
    const s1 = TR.spostaTraccia(p, cc, cc.start + 15), s2 = TR.spostaTraccia(p, cc, cc.start + 60);
    delete cc.stabilizza;
    return { o1, o2, s1, s2 };
  }, info);
  prova('un titolo che segue si muove insieme all\'oggetto', Math.hypot(seg.o1[0] === undefined ? seg.o1.dx - seg.o2.dx : seg.o1.dx - seg.o2.dx, seg.o1.dy - seg.o2.dy) > 40, JSON.stringify(seg));
  prova('stabilizza sposta la ripresa al contrario dell\'oggetto', Math.sign(seg.s2.dx - seg.s1.dx) === -Math.sign(seg.o2.dx - seg.o1.dx) && Math.abs(seg.s2.dx - seg.s1.dx) > 20, JSON.stringify(seg));

  // il tracking dal monitor: mirino sull'oggetto, Avvia, e la clip ha i suoi punti
  {
    await page.evaluate((id) => window.__dpv.edit('via il tracking', (p) => { delete p.clips.find((x) => x.id === id).traccia; }), info.c.id);
    await page.evaluate(({ c }) => { window.__dpv.select([c.id]); window.__motore.vaiA(c.start + 20); }, { c: info.c });
    await page.waitForTimeout(900);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dpv:mira')));
    await page.waitForTimeout(300);
    const pt = await page.evaluate(({ c }) => {
      const p = window.__dpv.doc, r = document.querySelector('.schermo-sopra').getBoundingClientRect();
      const t = (window.__dpv.head - c.start) / 25 - 0.04;
      const W = 960, H = 540, ph = (t * 1.1) % 1;
      const u = (120 + ((t % 6) / 6) * (W - 240)) / W, v = (H - 90 - Math.abs(Math.sin(ph * Math.PI)) * 330) / H;
      const m = p.media.find((x) => x.id === c.media), k = Math.min(p.w / m.width, p.h / m.height);
      const X = p.w / 2 + (u - 0.5) * m.width * k, Y = p.h / 2 + (v - 0.5) * m.height * k;
      return { x: r.left + (X / p.w) * r.width, y: r.top + (Y / p.h) * r.height, barra: document.querySelector('.pos-barra').classList.contains('in-mira') };
    }, { c: info.c });
    prova('Segui: la barretta passa al mirino', pt.barra);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(200);
    await page.click('.pos-mira .pos-btn:has-text("Avvia")');
    await page.waitForFunction((id) => !!window.__dpv.doc.clips.find((x) => x.id === id).traccia, info.c.id, { timeout: 120000 });
    const n = await page.evaluate((id) => window.__dpv.doc.clips.find((x) => x.id === id).traccia.punti.length, info.c.id);
    prova('Segui dal monitor: la clip ha i suoi punti tracciati', n > 20, n);
    await page.evaluate(() => window.__motore.vaiA(window.__dpv.head + 30));
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, 'traccia.png') });
  }
    }
    await page.close();
  }

  console.log('▶ 1.1.3: velocità delle clip, movimento fluido, cursore che si aggancia ai tagli');
  {
    const pv = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    pv.on('pageerror', (e) => errori.push(conStack(e)));
    pv.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errori.push(m.text()); });
    await pv.goto(srv.url + '/app/');
    await pv.waitForSelector('.pulsantiera');
    await pv.click('text=Prova con il montaggio dimostrativo');
    await pv.waitForFunction(() => window.__dpv.doc.clips.length >= 8, null, { timeout: 90000 });
    await pv.waitForTimeout(1500);

    // il cursore si aggancia al taglio anche senza Shift (Alt lo lascia libero)
    {
      await pv.evaluate(() => { const tl = window.__dpvTest.ui().tl; tl.adattaTutto(); });
      await pv.waitForTimeout(300);
      const info = await pv.evaluate(() => {
        const d = window.__dpv.doc, tl = window.__dpvTest.ui().tl;
        const v1 = d.tracks.find((t) => t.name === 'V1').id;
        const cs = d.clips.filter((c) => c.track === v1 && c.kind === 'media').sort((a, b) => a.start - b.start);
        const taglio = cs[1].start;
        return { taglio, x: (taglio - tl.scrollF) * tl.ppf, ppf: tl.ppf };
      });
      const tela = await pv.locator('.tl-tela').boundingBox();
      await pv.mouse.click(tela.x + info.x + 5, tela.y + 12);
      await pv.waitForTimeout(150);
      const h1 = await pv.evaluate(() => Math.round(window.__dpv.head));
      prova('il cursore si aggancia al taglio (senza tenere Shift)', h1 === info.taglio, `${h1} vs ${info.taglio} (${info.ppf} px/fotogramma)`);
      await pv.keyboard.down('Alt');
      await pv.mouse.click(tela.x + info.x + 5 + info.ppf * 4, tela.y + 12);
      await pv.keyboard.up('Alt');
      await pv.waitForTimeout(150);
      const h2 = await pv.evaluate(() => Math.round(window.__dpv.head));
      prova('con Alt il cursore resta libero', h2 !== info.taglio, h2);
    }

    // lo stiratore: stesso tono, durata nuova
    {
      const r = await pv.evaluate(() => {
        const { ST } = window.__dpvTest;
        const sr = 48000, n = sr * 2, x = new Float32Array(n);
        for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5;
        const out = {};
        for (const v of [0.25, 0.5, 2, 4]) {
          const [y] = ST.stiraTutto([x], sr, v);
          const a = Math.floor(y.length * 0.2), b = Math.floor(y.length * 0.8);
          let z = 0; for (let i = a + 1; i < b; i++) if (y[i - 1] < 0 && y[i] >= 0) z++;
          out[v] = { len: y.length, freq: z / ((b - a) / sr) };
        }
        // a flusso, con pezzi piccoli come quelli del decoder, deve dare lo stesso
        const s = new ST.Stiratore(1, sr, 0.5);
        let tot = 0;
        for (let i = 0; i < n; i += 1024) tot += s.push([x.subarray(i, Math.min(n, i + 1024))])[0].length;
        tot += s.fine()[0].length;
        out.flusso = tot;
        return out;
      });
      prova('velocità ×2 e ×4: la durata si accorcia e il tono resta a 440 Hz', r[2].len === 48000 && Math.abs(r[2].freq - 440) < 4 && r[4].len === 24000 && Math.abs(r[4].freq - 440) < 6, JSON.stringify(r));
      prova('rallentando a ×0.5 e ×0.25 il tono resta', Math.abs(r[0.5].freq - 440) < 4 && Math.abs(r[0.25].freq - 440) < 4 && r[0.5].len === 192000, JSON.stringify(r));
      prova('lo stiratore a flusso (pezzi da 1024) dà la stessa durata', Math.abs(r.flusso - 192000) < 1920, r.flusso);
    }

    // cambiare velocità: la durata cambia, le legate vanno insieme, il dopo scorre, niente si copre
    const prima = await pv.evaluate(() => structuredClone(window.__dpv.doc));
    const v1 = prima.tracks.find((t) => t.name === 'V1').id;
    const c1 = prima.clips.filter((c) => c.track === v1 && c.kind === 'media').sort((a, b) => a.start - b.start)[0];
    {
      await pv.evaluate((id) => { window.__dpv.select([id]); }, c1.id);
      await pv.keyboard.press('Alt+e');
      await pv.waitForSelector('.dialogo');
      prova('Alt+E apre la finestra della velocità', (await pv.textContent('.dialogo .dlg-testa b')) === 'Velocità della clip');
      await pv.fill('.dialogo input.num', '200');
      await pv.click('.dialogo .btn.primario');
      await pv.waitForTimeout(250);
      const dopo = await doc0(pv);
      const c = dopo.clips.find((x) => x.id === c1.id);
      const leg = dopo.clips.filter((x) => x.link && x.link === c1.link && x.id !== c1.id);
      const dopoOrig = prima.clips.find((x) => x.track === v1 && x.start >= c1.start + c1.len && x.kind === 'media');
      const dopoNuova = dopo.clips.find((x) => x.id === dopoOrig.id);
      prova('×2: la clip dura la metà', c.speed === 2 && c.len === Math.round(c1.len / 2), `${c.speed} ${c.len} vs ${c1.len}`);
      prova('l\'audio legato va alla stessa velocità e dura uguale', leg.length > 0 && leg.every((x) => x.speed === 2 && x.len === c.len), JSON.stringify(leg.map((x) => [x.speed, x.len])));
      prova('le clip dopo scorrono indietro di quanto si è accorciata', dopoNuova.start === dopoOrig.start - (c1.len - c.len), `${dopoNuova.start} vs ${dopoOrig.start}`);
      prova('con la velocità niente si copre', !coperte(dopo));
    }
    {
      // annulla
      await pv.keyboard.press('Control+z');
      // su un computer carico l'annulla arriva con un po' di ritardo: si aspetta che la clip torni a velocità 1
      await pv.waitForFunction((id) => window.__dpv.doc.clips.find((x) => x.id === id)?.speed === 1, c1.id, { timeout: 8000 }).catch(() => {});
      await pv.waitForTimeout(100);
      const dopo = await doc0(pv);
      const c = dopo.clips.find((x) => x.id === c1.id);
      prova('annulla riporta la velocità normale', c.speed === 1 && c.len === c1.len, `${c.speed} ${c.len}`);
    }
    {
      // rallentata e con il movimento mosso: è quello del rallentatore
      const pal = await pv.evaluate(() => {
        const d = window.__dpv.doc;
        const m = d.media.find((x) => x.name.startsWith('Pallina'));
        const c = d.clips.find((x) => x.media === m.id && d.tracks.find((t) => t.id === x.track).kind === 'video');
        return { id: c.id, start: c.start, len: c.len };
      });
      await pv.evaluate((id) => {
        window.__dpv.select([id]);
        window.__dpv.edit('lento', (p) => { p.clips = p.clips.filter((c) => c.kind !== 'fx'); window.__dpvTest.M.cambiaVelocita(p, window.__dpvTest.M.withLinked(p, [id]), 0.25, { ripple: true, fluido: 0 }); });
      }, pal.id);
      const centroide = async (f) => {
        await pv.evaluate((f) => window.__motore.vaiA(f), f);
        let ultimo = null, uguali = 0;
        for (let i = 0; i < 16; i++) {
          await pv.waitForTimeout(220);
          const v = await pv.evaluate(() => {
            const px = new Uint8Array(480 * 270 * 4);
            window.__motore.rec.leggiPiccolo(480, 270, px);
            let sx = 0, n = 0;
            for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) { const j = (y * 480 + x) * 4; if (px[j] > 200 && px[j + 1] < 120 && px[j + 2] < 150) { sx += x; n++; } }
            return n > 20 ? sx / n : -1;
          });
          uguali = ultimo !== null && v > 0 && Math.abs(v - ultimo) < 1e-6 ? uguali + 1 : 0;
          if (uguali >= 2) return v;
          ultimo = v;
        }
        return ultimo;
      };
      const misura = async () => {
        const xs = [];
        for (let i = 0; i < 9; i++) xs.push(await centroide(pal.start + 40 + i));
        const dx = xs.slice(1).map((x, i) => x - xs[i]);
        const media = dx.reduce((a, b) => a + b, 0) / dx.length;
        const scarto = Math.sqrt(dx.reduce((a, b) => a + (b - media) ** 2, 0) / dx.length);
        return { xs, media, scarto };
      };
      const fermo = await misura();
      await pv.evaluate((id) => window.__dpv.edit('fluido', (p) => { p.clips.find((c) => c.id === id).fluido = 2; }), pal.id);
      const fluido = await misura();
      const sfum = await (async () => { await pv.evaluate((id) => window.__dpv.edit('sfumato', (p) => { p.clips.find((c) => c.id === id).fluido = 1; }), pal.id); return misura(); })();
      console.log('   moto: fermo', JSON.stringify(fermo.xs.map((x) => +x.toFixed(2))), '\n         mosso', JSON.stringify(fluido.xs.map((x) => +x.toFixed(2))), '\n         sfumato', JSON.stringify(sfum.xs.map((x) => +x.toFixed(2))));
      prova('senza movimento fluido il rallentatore scatta (la pallina si muove a scalini)', fermo.scarto > fermo.media * 0.8, JSON.stringify({ media: fermo.media, scarto: fermo.scarto }));
      prova('col movimento mosso la pallina scorre regolare', fluido.scarto < fluido.media * 0.5 && fluido.media > 0.3, JSON.stringify({ media: fluido.media, scarto: fluido.scarto }));
      prova('anche lo sfumato attenua lo scatto', sfum.scarto < fermo.scarto * 0.8, JSON.stringify({ media: sfum.media, scarto: sfum.scarto, fermo: fermo.scarto }));
      // l'export usa lo stesso movimento fluido (legge i fotogrammi dal file, non dal monitor)
      const esportaBreve = async (fluido) => {
        await pv.evaluate(({ id, fluido, a }) => {
          window.__dpv.edit('fluido export', (p) => { p.clips.find((c) => c.id === id).fluido = fluido; p.inF = a; p.outF = a + 12; });
        }, { id: pal.id, fluido, a: pal.start + 42 });
        return pv.evaluate(async () => {
          delete window.showSaveFilePicker;
          const { esporta } = window.__dpvTest;
          let blob = null;
          const vecchio = URL.createObjectURL;
          URL.createObjectURL = (b) => { blob = b; return vecchio.call(URL, b); };
          await esporta(window.__dpv.doc, { formato: 'webm', w: 480, h: 270, qualita: 'alta', soloInOut: true, nome: 'lento.webm' }, () => {}, () => false);
          URL.createObjectURL = vecchio;
          const v = document.createElement('video');
          v.muted = true;
          v.src = URL.createObjectURL(blob);
          await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = ko; });
          const cv = document.createElement('canvas'); cv.width = 480; cv.height = 270;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          const xs = [];
          for (let i = 0; i < 11; i++) {
            v.currentTime = (i + 0.5) / 25;
            await new Promise((ok) => { v.onseeked = ok; });
            ctx.drawImage(v, 0, 0, 480, 270);
            const d = ctx.getImageData(0, 0, 480, 270).data;
            let sx = 0, n = 0;
            for (let y = 0; y < 270; y++) for (let x = 0; x < 480; x++) { const j = (y * 480 + x) * 4; if (d[j] > 200 && d[j + 1] < 130 && d[j + 2] < 160) { sx += x; n++; } }
            xs.push(n > 20 ? sx / n : -1);
          }
          return xs;
        });
      };
      const stat = (xs) => { const dx = xs.slice(1).map((x, i) => x - xs[i]); const m = dx.reduce((a, b) => a + b, 0) / dx.length; return { media: m, scarto: Math.sqrt(dx.reduce((a, b) => a + (b - m) ** 2, 0) / dx.length) }; };
      const exFermo = stat(await esportaBreve(0)), exFluido = stat(await esportaBreve(2));
      prova('nell\'export il rallentatore mosso scorre più regolare di quello fermo', exFluido.scarto < exFermo.scarto * 0.5 && exFluido.media > 0.3, JSON.stringify({ exFermo, exFluido }));
      // l'audio rallentato: il mixaggio dura quanto la clip nuova e non è muto
      const au = await pv.evaluate(async () => {
        const { mixaggio } = window.__dpvTest;
        const p = window.__dpv.doc;
        let tot = 0, n = 0, rms = 0;
        for await (const b of mixaggio(p, 0, 3)) { const d = b.getChannelData(0); for (let i = 0; i < d.length; i += 7) { rms += d[i] * d[i]; n++; } tot += b.duration; }
        return { tot, rms: Math.sqrt(rms / Math.max(1, n)) };
      });
      prova('il mixaggio dell\'audio rallentato ha suono e la durata giusta', au.rms > 0.005 && Math.abs(au.tot - 3) < 0.05, JSON.stringify(au));
      // fra un pezzo da 10 s e il successivo l'audio stirato non scatta (il flusso è uno solo per tutto l'export)
      const cucitura = await pv.evaluate(async (ini) => {
        // senza limitatore: il suo stato riparte a ogni pezzo e farebbe un gradino di volume che non c'entra con la velocità
        window.__dpv.edit('senza limitatore', (p) => { p.master = { ...(p.master ?? {}), limiter: false, volume: 0 }; });
        const { mixaggio } = window.__dpvTest;
        const it = mixaggio(window.__dpv.doc, ini, ini + 20);
        const c1 = (await it.next()).value, c2 = (await it.next()).value;
        await it.return();
        const d1 = c1.getChannelData(0), d2 = c2.getChannelData(0);
        const j = new Float32Array(960);
        j.set(d1.subarray(d1.length - 480), 0); j.set(d2.subarray(0, 480), 480);
        let seam = Math.abs(j[480] - j[479]), altro = 0;
        for (let i = 1; i < 960; i++) if (Math.abs(i - 480) > 2) altro = Math.max(altro, Math.abs(j[i] - j[i - 1]));
        let rms = 0; for (let i = 0; i < 960; i++) rms += j[i] * j[i];
        return { seam, altro, rms: Math.sqrt(rms / 960), n1: d1.length, n2: d2.length };
      }, pal.start / 25 + 1.37);
      prova('l\'audio rallentato non scatta al cambio di pezzo dell\'export', cucitura.rms > 0.005 && cucitura.seam < Math.max(0.02, cucitura.altro * 2.5), JSON.stringify(cucitura));
    }
    await pv.close();
  }

  console.log('▶ LIVE con più finestre');
  const pg = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  pg.on('pageerror', (e) => errori.push(conStack(e)));
  await pg.goto(srv.url + '/app/');
  await pg.waitForSelector('.pulsantiera');
  await pg.evaluate(() => {
    let n = 0;
    const tela = (w, hh, colore) => {
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      c.style.cssText = 'position:fixed;left:0;top:0;width:32px;height:18px;z-index:9999;pointer-events:none';
      document.body.append(c);
      const x = c.getContext('2d'); let k = 0;
      setInterval(() => { k++; x.fillStyle = colore; x.fillRect(0, 0, w, hh); x.fillStyle = '#fff'; x.fillRect(40 + (k * 5) % 500, 200, 120, 120); }, 33);
      return c.captureStream(30);
    };
    window.__dpvTest.LV.impostaSorgenteLive(async () => (n++ === 0 ? tela(1280, 720, '#dd2020') : tela(1024, 768, '#2020dd')), async () => { const ctx = new AudioContext(); const o = ctx.createOscillator(); const d = ctx.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; });
  });
  await pg.click('.pagina-btn[data-p=live]');
  await pg.waitForTimeout(300);
  await pg.click('.live .fin-interruttore:has-text("Conto alla rovescia")');
  // «più finestre» non è più un interruttore nella pagina: il motore della regia si accende da codice (la scelta vera è aggiungere finestre prima di registrare)
  await pg.evaluate(() => { window.__dpvTest.ui().live.opz.finestre = true; });
  await pg.keyboard.press('r');
  await pg.waitForTimeout(1800);
  const a = await pg.evaluate(() => { const l = window.__dpvTest.ui().live; return { regia: !!l.regia, fonti: l.regia?.fonti.length, rec: l.registrando }; });
  prova('con "Più finestre" la registrazione passa dalla regia', a.regia && a.fonti === 1 && a.rec, JSON.stringify(a));
  await pg.evaluate(() => window.__dpvTest.ui().live.aggiungiFinestra());
  await pg.waitForTimeout(1600);
  const b = await pg.evaluate(() => { const l = window.__dpvTest.ui().live; return { fonti: l.regia?.fonti.length, attiva: l.regia?.attiva, miniature: document.querySelectorAll('.live-fonte').length, inOnda: [...document.querySelectorAll('.live-fonte')].findIndex((e) => e.classList.contains('in-onda')) }; });
  prova('un\'altra finestra si aggiunge mentre registri e va in onda', b.fonti === 2 && b.attiva === 1 && b.miniature === 2 && b.inOnda === 1, JSON.stringify(b));
  await pg.screenshot({ path: path.join(OUT, 'live-finestre.png') });
  await pg.keyboard.press('1');
  await pg.waitForTimeout(400);
  const c = await pg.evaluate(() => window.__dpvTest.ui().live.regia.attiva);
  prova('il tasto 1 rimette in onda la prima finestra', c === 0, c);
  await pg.keyboard.press('2');
  await pg.waitForTimeout(1600);

  await pg.keyboard.press('f');
  await pg.evaluate(() => window.__dpvTest.ui().live.ultima);
  const r = await pg.evaluate(() => {
    const d = window.__dpv.doc;
    const m = d.media.find((x) => x.name.startsWith('Registrazione') && !x.name.includes('webcam'));
    const cl = d.clips.find((x) => x.media === m?.id && d.tracks.find((t) => t.id === x.track).kind === 'video');
    return { ok: !!cl, w: m?.width, h: m?.height, start: cl?.start, len: cl?.len };
  });
  prova('un file solo, con la misura della prima finestra', r.ok && r.w === 1280 && r.h === 720, JSON.stringify(r));
  await pg.click('.pagina-btn[data-p=montaggio]');
  const col = async (f) => {
    await pg.evaluate((ff) => window.__motore.vaiA(ff), f);
    let c = [0, 0, 0];
    for (let i = 0; i < 10 && c[0] + c[1] + c[2] < 30; i++) {
      await pg.waitForTimeout(600);
      c = await pg.evaluate(() => { const px = new Uint8Array(32 * 18 * 4); window.__motore.rec.leggiPiccolo(32, 18, px); const i = (14 * 32 + 8) * 4; return [px[i], px[i + 1], px[i + 2]]; });
    }
    return c;
  };
  const campioni = [];
  for (let q = 15; q < r.len - 5; q += 20) campioni.push(await col(r.start + q));
  const rossi = campioni.filter((c) => c[0] > 150 && c[2] < 100).length, blu = campioni.filter((c) => c[2] > 150 && c[0] < 100).length;
  prova('all\'inizio si vede la prima finestra (rossa), poi quella messa in onda (blu), e si passa dall\'una all\'altra', (campioni.find((c) => c[0] + c[1] + c[2] > 30) ?? [0, 0, 0])[0] > 150 && rossi >= 1 && blu >= 2, JSON.stringify({ campioni, r }));
  await pg.close();

  console.log('▶ Riproduzione');
  await page.evaluate(() => { window.__dpv.select([]); window.__motore.setMonitor('recorder'); window.__motore.vaiA(0); });
  await tasto('Space');
  await page.waitForTimeout(2000);
  const h = await page.evaluate(() => window.__dpv.head);
  await tasto('Space');
  prova('Spazio suona: il cursore avanza col tempo', h > 25 && h < 80, h.toFixed(1));
  await page.screenshot({ path: path.join(OUT, 'suona.png') });


  console.log('▶ Riproduzione: ripresa coi fotogrammi chiave radi (e il suo proxy)');
  {
    const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    pg.on('pageerror', (e) => errori.push(conStack(e)));
    await pg.goto(srv.url + '/app/');
    await pg.waitForSelector('.pulsantiera');
    await pg.waitForTimeout(800);
    await pg.evaluate(async () => {
      const T = window.__dpvTest;
      const f = await T.ripresaDiProva(20, 20);
      const [m] = await T.importaFile([{ name: f.name, file: f }], { chiediFormato: false });
      window.__dpv.edit('prova', (p) => { const v1 = p.tracks.filter((t) => t.kind === 'video').slice(-1)[0]; p.clips.push(T.P.newClip('media', v1.id, 0, 500, { media: m.id, name: m.name })); });
    });
    const suona = (da) => pg.evaluate(async (da) => {
      const m = window.__dpvTest.motore;
      m.vaiA(da);
      await new Promise((ok) => setTimeout(ok, 1200));
      const n0 = window.__dpvTest.statoDecoder().nati;
      const buf = new Uint8Array(64 * 36 * 4);
      const posizionePallina = () => {
        m.rec.leggiPiccolo(64, 36, buf);
        let peso = 0, xPesata = 0;
        for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
          const i = (y * 64 + x) * 4;
          const rosso = Math.max(0, buf[i] - buf[i + 1]);
          if (rosso > 45 && buf[i] > buf[i + 2]) { peso += rosso; xPesata += x * rosso; }
        }
        return peso ? Math.round(xPesata / peso) : null;
      };
      const testa = window.__dpv.head;
      const inizio = performance.now();
      m.play(1);
      // il play aspetta i decoder al massimo 0,9 s (poi parte comunque); nel banco di prova appena importato il
      // proxy si sta facendo e il disegno è lento (il primo play, a decoder freddo, qui impiega anche 2-3 s: lo stesso con la versione di prima), quindi si danno 4 s. Quello che conta è che poi il video si
      // muova senza ripartire (nati): prima l'orologio tornava indietro di 60 ms e il flusso si buttava
      const partito = await new Promise((ok) => {
        const scade = setTimeout(() => ok(false), 4000);
        const controlla = () => {
          if (window.__dpv.head > testa) { clearTimeout(scade); ok(true); }
          else requestAnimationFrame(controlla);
        };
        controlla();
      });
      // su una macchina lenta ogni lettura dei pixel costa anche un secondo: ci si ferma prima della fine della
      // clip (dopo è nero) e si contano i cambi fra una lettura e la dopo (il video si muove, non è fermo)
      const posizioni = [];
      const fineClip = window.__dpv.doc.clips.find((c) => c.kind === 'media').len - 12;
      for (let i = 0; i < 8 && window.__dpv.head < fineClip; i++) { await new Promise((ok) => setTimeout(ok, 250)); posizioni.push(posizionePallina()); }
      const headFine = window.__dpv.head;
      const durataMs = performance.now() - inizio;
      m.stop();
      const rate = window.__dpv.doc.rate;
      return {
        partito, nati: window.__dpvTest.statoDecoder().nati - n0,
        diversi: new Set(posizioni.filter((x) => x !== null)).size, posizioni, validi: posizioni.filter((x) => x !== null).length,
        cambi: posizioni.filter((x, i) => i > 0 && x !== null && posizioni[i - 1] !== null && x !== posizioni[i - 1]).length,
        secondi: (headFine - testa) * rate.den / rate.num, durataMs,
      };
    }, da);
    // quante letture riescono dipende dalla velocità del computer (sul runner di GitHub una lettura dei pixel costa anche
    // 3 secondi e ne escono solo due o tre): il video deve cambiare a ogni lettura valida (3 cambi se ce ne sono abbastanza),
    // e con meno di due letture buone la prova non può dire niente
    const siMuove = (r) => r.validi >= 2 && r.cambi >= Math.min(3, r.validi - 1);
    const a = await suona(250);
    prova('play dal mezzo di una ripresa col GOP lungo: il video si muove (senza ripartire dal fotogramma chiave)', a.partito && siMuove(a) && a.nati <= 2, JSON.stringify(a));
    // dalla 1.5.8 la copia leggera non si fa da sola: la si chiede come farebbe l'utente («Prepara copia leggera», subito)
    await pg.evaluate(() => { const id = window.__dpv.doc.media[0].id; window.__dpvTest.LB.proponiPreparazione(id, 'proxy', { avvia: true }); });
    const pronto = await pg.waitForFunction(() => window.__dpvTest.proxyStato(window.__dpv.doc.media[0].id) === 'pronto', null, { timeout: 120000 }).then(() => true, () => false);
    const px = await pg.evaluate(() => { const r = window.__dpvTest.mediaRT(window.__dpv.doc.media[0].id); return r.proxy ? [r.proxy.w, r.proxy.h] : null; });
    prova('il proxy chiesto a mano si fa dietro le quinte', pronto && !!px && px[0] <= 960, JSON.stringify(px));
    const b = await suona(250);
    // col proxy (un fotogramma chiave ogni mezzo secondo), su una macchina lenta il flusso rimasto indietro riparte dal
    // fotogramma chiave dopo per restare a tempo con l'audio: qualche ripartenza va bene, a raffica no (il vecchio
    // difetto ne faceva una a ogni giro dello schermo: decine in due secondi, e l'immagine ferma)
    // Il proxy ha un GOP di mezzo secondo: si limita la frequenza alle ripartenze necessarie per raggiungere il GOP successivo.
    const limiteFlussi = Math.ceil(b.durataMs / 500) + 2;
    prova('col proxy il play parte subito anche dal mezzo (e non riparte a raffica)', b.partito && siMuove(b) && b.nati <= limiteFlussi, JSON.stringify({ ...b, limiteFlussi }));
    // un disegno lento (un computer lento, una lettura dei pixel, la pagina ferma un attimo) non deve far buttare il flusso
    // che si sta guardando: prima pulisci() lo chiudeva dopo 1,5 s e il nuovo ripartiva dal fotogramma chiave (immagine
    // ferma, poi nera). Uno che davvero non serve più (si disegna un'altra clip) invece si chiude ancora.
    const lento = await pg.evaluate(async () => {
      const { FT } = window.__dpvTest;
      const id = window.__dpv.doc.media[0].id;
      const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));
      FT.fermaFlussi();
      let primo = null;
      for (let i = 0; i < 200 && !primo; i++) { primo = FT.fotogramma('lenta', id, 3, true); await aspetta(30); }
      const n0 = FT.statoDecoder().nati;
      const t0 = performance.now();
      while (performance.now() - t0 < 1800) { /* la pagina è ferma */ }
      FT.pulisci();
      const dopo = FT.fotogramma('lenta', id, 3.04, true);
      const nati = FT.statoDecoder().nati - n0;
      // un'altra voce disegna per 1,7 s, la prima no: la prima si chiude (lo fa anche il pulisci() di ogni secondo), l'altra resta
      const t1 = performance.now();
      while (performance.now() - t1 < 1700) { FT.fotogramma('altra', id, 5 + (performance.now() - t1) / 1000, true); await aspetta(40); }
      FT.pulisci();
      const rimasti = FT.statoDecoder().flussi;
      const n1 = FT.statoDecoder().nati;
      FT.fotogramma('altra', id, 5 + (performance.now() - t1) / 1000, true);
      const altraViva = FT.statoDecoder().nati === n1;
      FT.fotogramma('lenta', id, 3.1, true);
      const lentaChiusa = FT.statoDecoder().nati === n1 + 1;
      FT.fermaFlussi();
      return { primo: !!primo, dopo: !!dopo, nati, rimasti, altraViva, lentaChiusa };
    });
    prova('la pagina ferma 1,8 s non fa buttare il flusso che si guarda (e uno che non serve più si chiude ancora)', lento.primo && lento.dopo && lento.nati === 0 && lento.rimasti === 1 && lento.altraViva && lento.lentaChiusa, JSON.stringify(lento));
    await pg.close();
  }

  console.log('▶ EDL');
  const edl = await page.evaluate(() => window.__dpvTest.creaEdl(window.__dpv.doc));
  prova('la EDL ha titolo, FCM ed eventi', edl.startsWith('TITLE:') && edl.includes('FCM: NON-DROP FRAME') && /^001 /m.test(edl));
  prova('la EDL segna la dissolvenza (D)', /^\d{3} .* D +\d{3} /m.test(edl));
  fs.writeFileSync(path.join(OUT, 'montaggio.edl'), edl);

  console.log('▶ Export WebM');
  const esito = await page.evaluate(async () => {
    delete window.showSaveFilePicker;
    const { esporta } = window.__dpvTest;
    const p = window.__dpv.doc;
    let blob = null;
    const vecchio = URL.createObjectURL;
    URL.createObjectURL = (b) => { blob = b; return vecchio.call(URL, b); };
    const t0 = performance.now();
    await esporta(p, { formato: 'webm', w: 640, h: 360, qualita: 'media', soloInOut: false, nome: 'prova.webm' }, () => {}, () => false);
    URL.createObjectURL = vecchio;
    const secondi = (performance.now() - t0) / 1000;
    return { size: blob?.size ?? 0, secondi, url: blob ? URL.createObjectURL(blob) : null };
  });
  prova('export WebM prodotto', esito.size > 50000, `${esito.size} byte in ${esito.secondi.toFixed(1)} s`);
  if (esito.url) {
    const info = await page.evaluate(async (url) => {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'prova.webm', { type: 'video/webm' });
      const v = document.createElement('video');
      v.src = URL.createObjectURL(file);
      await new Promise((ok, ko) => { v.onloadedmetadata = ok; v.onerror = ko; });
      return { durata: v.duration, w: v.videoWidth, h: v.videoHeight };
    }, esito.url);
    const attesa = (await page.evaluate(() => window.__dpvTest.P.projectEnd(window.__dpv.doc))) / 25;
    prova('il WebM si rilegge: 640×360', info.w === 640 && info.h === 360, `${info.w}×${info.h}`);
    prova('il WebM dura quanto il montaggio', Math.abs(info.durata - attesa) < 0.3, `${info.durata} vs ${attesa}`);
  }

  console.log('▶ Salva e riapri');
  const rt = await page.evaluate(() => {
    const t = JSON.stringify(window.__dpv.doc);
    const p = JSON.parse(t);
    return { ok: p.format === 'daprod-video' && p.clips.length === window.__dpv.doc.clips.length, kb: t.length / 1024 };
  });
  prova('il progetto si serializza (.dpv)', rt.ok, rt.kb.toFixed(1) + ' kB');

  console.log('▶ Telefono');
  const tel = await browser.newPage({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
  await tel.goto(srv.url + '/app/');
  await tel.waitForSelector('.pulsantiera');
  await tel.waitForTimeout(1200);
  prova('sul telefono c\'è la barra in basso', await tel.isVisible('.barra-tel'));
  await tel.screenshot({ path: path.join(OUT, 'telefono.png') });
  await tel.close();

  // le prove della 1.1.4 (togliere lo sfondo, animazioni, DaProdMontage): su un banco pulito, in una pagina a parte
  {
    const pn = await browser.newPage({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
    const errN = [];
    pn.on('pageerror', (e) => errN.push(e.message));
    pn.on('console', (m) => { if (m.type() === 'error' && !/garbage collected without/.test(m.text())) errN.push(m.text()); });
    await pn.goto(srv.url + '/app/');
    await pn.waitForSelector('.pulsantiera');
    await pn.waitForTimeout(1200);
    const { proveNuove } = await import('./prove-nuove.mjs');
    await proveNuove({ page: pn, prova, OUT });
    prova('nessun errore nelle prove nuove (sfondo, animazioni, DaProdMontage)', errN.length === 0, errN.slice(0, 5).join(' | '));
    await pn.close();
  }

  console.log('▶ Home');
  const home = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await home.goto(srv.url + '/');
  await home.waitForTimeout(800);
  prova('la home ha il link al banco', (await home.locator('a[href*="app/"]').count()) > 0);
  await home.screenshot({ path: path.join(OUT, 'home.png'), fullPage: false });
  await home.close();

  prova('nessun errore nella pagina', errori.length === 0, errori.slice(0, 5).join(' | '));
} catch (e) {
  ko++;
  console.log('  ✗ la prova si è fermata:', e.message);
  await page.screenshot({ path: path.join(OUT, 'errore.png') }).catch(() => {});
} finally {
  await browser.close();
  srv.chiudi();
}
console.log(`\n${ok} prove superate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
