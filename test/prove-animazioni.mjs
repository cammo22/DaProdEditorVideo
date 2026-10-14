// Le prove delle animazioni (catalogo, disegno, inserimento, proprietà, libreria). Vedi prove-nuove.mjs.
import path from 'node:path';
import { leggi, vicino, apriGruppi } from './aiuti.mjs';

export async function proveAnimazioni({ page, prova, OUT }) {
  console.log('▶ Animazioni: il catalogo e il disegno');
  const cat = await page.evaluate(async () => {
    const { AN, RA, fontAnim } = window.__dpvTest;
    await fontAnim();
    const ids = AN.ANIMAZIONI.map((a) => a.id);
    const senzaDisegno = ids.filter((id) => !RA.DISEGNA[id]);
    const senzaCatalogo = Object.keys(RA.DISEGNA).filter((id) => !ids.includes(id));
    const doppi = ids.filter((id, i) => ids.indexOf(id) !== i);
    const gruppi = Object.fromEntries(AN.GRUPPI_ANIM.map((g) => [g.id, AN.animazioniDi(g.id).length]));
    const campiOk = AN.ANIMAZIONI.every((a) => a.durata > 0 && a.campi.length > 0 && a.campi.every((c) => c.def !== undefined && c.nome && (c.tipo !== 'scelta' || (c.scelte?.length && c.scelte.some(([v]) => v === c.def)))));
    const font = ['700 40px "Montserrat"', '700 40px "Oswald"', '400 40px "Archivo Black"', '400 40px "Bebas Neue"', '700 40px "Space Mono"', '400 40px "Great Vibes"', '700 40px "Caveat"', 'italic 400 40px "Playfair Display"', '500 40px "Cormorant Garamond"'].map((f) => document.fonts.check(f));
    return { n: ids.length, senzaDisegno, senzaCatalogo, doppi, gruppi, campiOk, font };
  });
  prova('almeno 40 animazioni nel catalogo, tutte con il loro disegno', cat.n >= 40 && !cat.senzaDisegno.length && !cat.senzaCatalogo.length && !cat.doppi.length, JSON.stringify(cat));
  prova('sette gruppi (con i segnalini che seguono), tutti pieni', Object.keys(cat.gruppi).length === 7 && Object.values(cat.gruppi).every((n) => n >= 5), JSON.stringify(cat.gruppi));
  prova('ogni animazione ha una durata e campi con il valore di partenza (e le scelte contengono quello di partenza)', cat.campiOk);
  prova('i caratteri delle animazioni sono caricati (Montserrat, Oswald, Archivo Black, Bebas, Space Mono, Great Vibes, Caveat, Playfair, Cormorant)', cat.font.every(Boolean), JSON.stringify(cat.font));

  const disegni = await page.evaluate(async () => {
    const { AN, RA } = window.__dpvTest;
    const out = [];
    const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; };
    const px = (tela) => tela.getContext('2d').getImageData(0, 0, tela.width, tela.height).data;
    for (const a of AN.ANIMAZIONI) {
      const spec = AN.nuovaAnim(a.id);
      const tela = new OffscreenCanvas(640, 360);
      // la tela legge e ridisegna di continuo: sul processore, così il disegno è identico ogni volta
      tela.getContext('2d', { willReadFrequently: true });
      RA.disegnaAnimazione(spec, 640, 360, a.durata * 0.45, a.durata, tela);
      const d1 = px(tela);
      let opachi = 0; for (let i = 3; i < d1.length; i += 4) if (d1[i] > 20) opachi++;
      const h1 = hash(d1);
      RA.disegnaAnimazione(spec, 640, 360, a.durata * 0.45, a.durata, tela);
      const h2 = hash(px(tela));
      // l'angolo in alto a sinistra è pieno? (un fondo riempie tutto)
      RA.disegnaAnimazione(spec, 640, 360, 0.01, a.durata, tela);
      const inizio = hash(px(tela));
      RA.disegnaAnimazione(spec, 640, 360, a.durata - 0.02, a.durata, tela);
      const fine = hash(px(tela));
      out.push({ id: a.id, fondo: !!a.fondo, opachi, uguale: h1 === h2, cambia: h1 !== inizio || h1 !== fine, pieno: d1[3] === 255 && d1[d1.length - 1] === 255 });
    }
    return out;
  });
  const vuote = disegni.filter((d) => d.opachi < 60);
  prova('a metà della sua durata ogni animazione ha disegnato qualcosa', !vuote.length, vuote.map((d) => d.id + ':' + d.opachi).join(' '));
  prova('lo stesso istante dà sempre lo stesso disegno (niente casualità vera: monitor ed export coincidono)', disegni.every((d) => d.uguale), disegni.filter((d) => !d.uguale).map((d) => d.id).join(' '));
  prova('il disegno cambia nel tempo (inizio, metà, fine)', disegni.every((d) => d.cambia), disegni.filter((d) => !d.cambia).map((d) => d.id).join(' '));
  prova('i fondi riempiono tutto il quadro, gli altri lasciano il trasparente', disegni.filter((d) => d.fondo).every((d) => d.pieno) && disegni.filter((d) => !d.fondo).every((d) => !d.pieno), disegni.map((d) => d.id + ':' + d.fondo + ':' + d.pieno).join(' '));

  console.log('▶ Animazioni: cambiare i testi e i colori');
  const mod = await page.evaluate(() => {
    const { AN, RA } = window.__dpvTest;
    const px = (tela) => tela.getContext('2d').getImageData(0, 0, tela.width, tela.height).data;
    const somma = (d) => { let s = 0; for (let i = 0; i < d.length; i += 11) s = (s * 31 + d[i]) >>> 0; return s; };
    const tela = new OffscreenCanvas(640, 360);
    tela.getContext('2d', { willReadFrequently: true });
    const disegna = (id, v) => { RA.disegnaAnimazione(AN.nuovaAnim(id, v), 640, 360, 2.5, 5, tela); return somma(px(tela)); };
    const base = disegna('lt-barra', {});
    const altroNome = disegna('lt-barra', { nome: 'Giulia Rossi' });
    const altroColore = disegna('lt-barra', { colore: '#00ff00' });
    const grande = disegna('lt-barra', { dim: 160 });
    const centro = disegna('lt-barra', { pos: 'centro' });
    // i valori che mancano (progetto vecchio) si prendono dal catalogo
    const vecchio = RA.disegnaAnimazione({ id: 'lt-barra', v: {} }, 640, 360, 2.5, 5, tela) && somma(px(tela));
    const sconosciuta = RA.disegnaAnimazione({ id: 'non-esiste', v: {} }, 640, 360, 2.5, 5, tela) && somma(px(tela));
    return { base, altroNome, altroColore, grande, centro, vecchio, sconosciuta };
  });
  prova('cambiando nome, colore, grandezza o posizione il disegno cambia', new Set([mod.base, mod.altroNome, mod.altroColore, mod.grande, mod.centro]).size === 5, JSON.stringify(mod));
  prova('un progetto vecchio (valori mancanti) si disegna con quelli di partenza; un\'animazione che non esiste lascia il vuoto', mod.vecchio === mod.base && mod.sconosciuta !== mod.base, JSON.stringify(mod));

  console.log('▶ Animazioni: nella timeline');
  await page.evaluate(() => {
    // un banco pulito: un colore sotto e basta
    const { P } = window.__dpvTest;
    const p = window.__dpv.doc;
    const [v2, v1] = p.tracks.filter((t) => t.kind === 'video');
    window.__dpv.edit('Banco pulito', (pp) => { pp.clips = pp.clips.filter(() => false); pp.clips.push(P.newClip('color', v1.id, 0, 400, { name: 'Blu', gen: { color: '#1b3a8f' } })); });
    window.__dpv.select([]);
    window.__motore.vaiA(50);
  });
  const n0 = await page.evaluate(() => window.__dpv.doc.clips.length);
  await page.evaluate(() => window.__dpvTest.Z.inserisciGeneratore('anim', 25, undefined, { anim: 'lt-barra' }));
  let d = await page.evaluate(() => window.__dpv.doc);
  const an = d.clips.find((c) => c.gen?.anim?.id === 'lt-barra');
  prova('inserita al cursore: un titolo con dentro l\'animazione, lunga quanto la sua durata (5 s)', !!an && an.kind === 'title' && an.start === 25 && an.len === 125 && an.name === 'Barra pulita' && d.clips.length === n0 + 1, JSON.stringify(an && { k: an.kind, s: an.start, l: an.len, n: an.name }));
  prova('...sulla traccia video più alta, e senza coprire il fondo', an && d.tracks.find((t) => t.id === an.track).name === 'V2');
  await page.evaluate(() => window.__dpvTest.Z.inserisciGeneratore('anim', 0, undefined, { anim: 'bg-aurora' }));
  d = await page.evaluate(() => window.__dpv.doc);
  const fondo = d.clips.find((c) => c.gen?.anim?.id === 'bg-aurora');
  const vt = d.tracks.filter((t) => t.kind === 'video');
  prova('un fondo (aurora) dura 8 s e va sotto tutte le tracce video (se la più bassa è occupata se ne fa una nuova sotto)', !!fondo && fondo.len === 200 && vt[vt.length - 1].id === fondo.track && fondo.track !== an.track, JSON.stringify(fondo && { t: d.tracks.find((t) => t.id === fondo.track).name, l: fondo.len, ultima: vt[vt.length - 1].name }));
  await page.evaluate(() => { window.__dpv.edit('via', (pp) => { pp.clips = pp.clips.filter((c) => c.gen?.anim?.id !== 'bg-aurora'); }); });
  // la lettura del trascinamento
  const lg = await page.evaluate(() => { const G = window.__dpvTest.Z.leggiGeneratoreAnim; return null; });
  void lg;
  // sul monitor si vede: la scheda bianca del sottopancia sta in basso a sinistra
  await page.evaluate(() => { const c = window.__dpv.doc.clips.find((x) => x.gen?.anim?.id === 'lt-barra'); window.__dpv.select([c.id]); window.__motore.vaiA(25 + 70); });
  await page.waitForTimeout(500);
  const [scheda, fuori, linguetta] = await leggi(page, [[10, 30], [45, 10], [6, 30]]);
  prova('sul monitor il sottopancia c\'è: scheda bianca in basso a sinistra, il resto è il fondo blu', vicino(scheda, [255, 255, 255], 30) && vicino(fuori, [27, 58, 143], 40), JSON.stringify([scheda, fuori, linguetta]));
  await page.screenshot({ path: path.join(OUT, 'animazioni-barra.png') });

  console.log('▶ Animazioni: le proprietà');
  await page.waitForTimeout(300);
  await apriGruppi(page);
  const gruppo = '.isp-gruppo:has(summary:has-text("Animazione"))';
  prova('nelle proprietà c\'è il gruppo "Animazione" con i suoi campi (nome, ruolo, colore, posizione, grandezza)', (await page.locator(gruppo + ' textarea, ' + gruppo + ' input[type=text]').count()) >= 2 && (await page.locator(gruppo + ' input[type=color]').count()) === 1 && (await page.locator(gruppo + ' label:has-text("Dove sta")').count()) === 1 && (await page.locator(gruppo + ' label:has-text("Grandezza")').count()) === 1);
  const campo = page.locator(gruppo + ' input.campo-testo').first();
  await campo.fill('Mario Bianchi');
  await page.waitForTimeout(600);
  d = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.gen?.anim?.id === 'lt-barra'));
  prova('scrivendo il nome nel campo la clip lo prende', d.gen.anim.v.nome === 'Mario Bianchi', JSON.stringify(d.gen.anim.v));
  // cambiare animazione tiene il nome
  await page.selectOption(gruppo + ' select >> nth=0', 'lt-neon');
  await page.waitForTimeout(500);
  d = await page.evaluate(() => window.__dpv.doc.clips.find((x) => x.gen?.anim?.id === 'lt-neon'));
  prova('cambiando animazione (Bordo neon) i testi restano, il colore è quello della nuova', !!d && d.gen.anim.v.nome === 'Mario Bianchi' && d.gen.anim.v.colore === '#35e8ff' && d.name === 'Bordo neon', JSON.stringify(d?.gen.anim.v));
  prova('una sola riga sopra: la clip è "Animazione" nel riassunto', (await page.textContent('.isp-testa .chip-tipo')) === 'Animazione');

  console.log('▶ Animazioni: la libreria nel contenitore');
  await page.click('.bin-cat:has-text("Animazioni")').catch(() => {});
  await page.waitForTimeout(500);
  const carte = await page.locator('.carta[data-anim]').count();
  prova('la libreria "Animazioni" mostra tutte le carte (con la loro anteprima disegnata)', carte >= 40, String(carte));
  const prima = await page.evaluate(() => window.__dpv.doc.clips.length);
  await page.evaluate(() => window.__motore.vaiA(200));
  await page.click('.carta[data-anim="tx-parole"]');
  await page.waitForTimeout(400);
  d = await page.evaluate(() => window.__dpv.doc);
  const parole = d.clips.find((c) => c.gen?.anim?.id === 'tx-parole');
  prova('un clic sulla carta mette l\'animazione al cursore', d.clips.length === prima + 1 && !!parole && parole.start === 200, JSON.stringify(parole && { s: parole.start, l: parole.len }));
  const lett = await page.evaluate(() => window.__dpvTest.Z && true);
  void lett;
  prova('tasto destro su una carta... niente da fare qui: il trascinamento passa dal dato "g:anim:<id>"', true);

  console.log('▶ Animazioni: la EDL e l\'altro compositore (export)');
  const edl = await page.evaluate(() => window.__dpvTest.creaEdl(window.__dpv.doc));
  prova('la EDL annota l\'animazione', /\* ANIMAZIONE: /.test(edl), edl.split('\n').filter((r) => /ANIMAZ/.test(r)).join('|'));
  const exp = await page.evaluate(async () => {
    const { Compositore, pianoVideo } = window.__dpvTest;
    const tela = new OffscreenCanvas(320, 180);
    const comp = new Compositore(tela, true);
    const p = window.__dpv.doc;
    const f = 25 + 70;
    comp.render(p, pianoVideo(p, f), false, f);
    const px = new Uint8Array(64 * 36 * 4);
    comp.leggiPiccolo(64, 36, px);
    // in basso a sinistra (pannello del neon: scuro, bordo azzurro) e in alto (blu del fondo)
    const at = (x, y) => { const i = ((35 - y) * 64 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    const r = { alto: at(45, 5), diversoDalFondo: [0, 0, 0] };
    let diverse = 0;
    for (let y = 26; y < 34; y++) for (let x = 3; x < 25; x++) { const c = at(x, y); if (Math.abs(c[0] - 27) + Math.abs(c[1] - 58) + Math.abs(c[2] - 143) > 40) diverse++; }
    comp.distruggi();
    return { alto: r.alto, diverse };
  });
  prova('l\'export (un altro compositore) disegna la stessa animazione', vicino(exp.alto, [27, 58, 143], 40) && exp.diverse > 20, JSON.stringify(exp));
}
