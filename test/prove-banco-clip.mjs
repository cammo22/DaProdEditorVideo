import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
const errors = [];
const out = 'test/.out/banco-clip'; mkdirSync(out, { recursive: true });
try {
 const page = await browser.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
 await page.goto(process.env.DPV_URL ?? 'http://127.0.0.1:4173/app/');
 await page.waitForSelector('.pulsantiera'); await page.addStyleTag({content:'*,*::before,*::after { animation: none !important; transition: none !important; }'});
 await page.evaluate(() => {
  const { P } = window.__dpvTest, s = window.__dpv;
  const p = P.newProject({w:1920,h:1080,rate:{num:25,den:1},drop:false});
  const v = P.newClip('bars',p.tracks.find(t=>t.kind==='video').id,0,250,{name:'Ripresa di prova',gen:{bars:'smpte'}});
  const a = P.newClip('tone',p.tracks.find(t=>t.kind==='audio').id,0,250,{name:'Audio di prova',gen:{tone:440}});
  v.link = a.link = 'prova'; p.clips.push(v,a); s.load(p); s.select([v.id,a.id]);
  document.getElementById('app').classList.remove('senza-lato','stretto');
  document.dispatchEvent(new CustomEvent('dpv:proprieta'));
 });
 await page.waitForTimeout(1000);
 const cdp = await page.context().newCDPSession(page);
 for (const [w,h,dpr] of [[1920,1080,1],[2560,1440,1],[2560,1440,1.5],[1920,1080,2]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:dpr,mobile:false});
  await page.setViewportSize({width:w,height:h});
  await page.evaluate(()=>document.querySelector('.pp-scheda[data-scheda=ai]').click());
  await page.locator('.pp-ai-filtri [data-filtro=audio]').click();
  for(const width of [280,384]) {
   await page.evaluate(width=>document.getElementById('app').style.setProperty('--lato',width+'px'),width);
   await page.waitForTimeout(100);
   const ai = await page.locator('.ispettore.banco').evaluate(el=>({
    cards:el.querySelectorAll('.pp-ai').length,
    overflow:el.scrollWidth>el.clientWidth,
    inner:el.querySelector('.pp-scroll').scrollHeight>el.querySelector('.pp-scroll').clientHeight,
    head:el.querySelector('.pp-testa').getBoundingClientRect().height,
    font:getComputedStyle(el.querySelector('.pp-ai-peso')).fontFamily
   }));
   assert.equal(ai.cards,4); assert.equal(ai.overflow,false); assert.equal(ai.inner,false); assert.ok(ai.head<=88); assert.ok(ai.font.includes('Share Tech Mono'));
   console.log('AI',w,h,width,ai);
  }
  if(process.env.DPV_FOTO) { await page.mouse.move(10,10); await page.screenshot({scale:'css',animations:'disabled',timeout:45000,path:`${out}/proprieta-${w}-${dpr}.png`}); }
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('dpv:sezione',{detail:'fxv'})));
  await page.waitForSelector('.editor-clip'); await page.waitForTimeout(200);
  assert.equal(Math.round((await page.locator('.editor-clip').boundingBox()).width),1120);
  for (const id of ['quadro','movimento','colore','audio','ai','tempo']) {
   const btn=page.locator(`.ec-nav [data-sezione=${id}]`); if(!await btn.count())continue;
   await btn.click();
   const scelte=page.locator('.ec-scelte button'); const n=await scelte.count();
   for(let i=0;i<Math.max(1,n);i++) {
    if(n) await scelte.nth(i).click();
    const size = await page.locator('.ec-contenuto').evaluate(el=>({id:el.querySelector('.isp-gruppo:not([hidden])')?.dataset.g,x:el.scrollWidth>el.clientWidth,y:el.scrollHeight>el.clientHeight}));
    console.log('EDITOR',w,h,id,size); assert.equal(size.x,false); assert.equal(size.y,false);
   }
   if(process.env.DPV_FOTO && id==='quadro') { await page.mouse.move(10,10); await page.screenshot({scale:'css',animations:'disabled',timeout:45000,path:`${out}/editor-${id}-${w}-${dpr}.png`}); }
  }
  await page.locator('.ec-nav [data-sezione=quadro]').click();
  const posizione=page.locator('.ec-scelte [data-gruppo=immagine]'); if(await posizione.count()) await posizione.click();
  await page.locator('.editor-clip .pp-tessera').filter({hasText:'Piccola'}).click();
  assert.equal(await page.evaluate(()=>window.__dpv.doc.clips.find(c=>c.kind==='bars').tf.scale),0.5);
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(()=>window.__dpv.doc.clips.find(c=>c.kind==='bars').tf.scale),1);
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('dpv:sezione',{detail:'fxv'})));
  assert.equal(await page.locator('.ec-nav [data-sezione=effetti]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('dpv:mira'))); await page.waitForSelector('.editor-clip',{state:'detached'});
 }
 await cdp.detach();
 assert.deepEqual(errors,[]); console.log('Banco clip: OK');
} finally { await browser.close(); }



