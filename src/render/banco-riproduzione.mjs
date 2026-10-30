// Banco manuale GPU: node src/render/banco-riproduzione.mjs [etichetta] [--prima] [--pieno] [--25].
// Due WebM generati con WebCodecs, riusati nelle misure prima/dopo. Nessun proxy.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve('test/.out/riproduzione');
await fs.mkdir(dir, { recursive: true });
// Riproduce la vecchia tolleranza senza riscrivere i sorgenti né usare Git.
const prima = process.argv.includes('--prima');
const server = await createServer({
 configFile: false, root: process.cwd(),
 plugins: [{name:'banco-prima',enforce:'pre',transform(code,id){
  if(!prima)return;
  const file=id.replaceAll('\\','/').split('?')[0];
  if(file.endsWith('/media/fotogrammi.ts')){
   if(!code.includes('const SCARTO_TIMESTAMP = 0.00051;'))throw Error('Tolleranza originale non trovata');
   return code.replace('const SCARTO_TIMESTAMP = 0.00051;', 'const SCARTO_TIMESTAMP = 0.0001;');
  }
  if(file.endsWith('/src/motore.ts'))return code.replace("const f = flusso && this.attivo === 'recorder' ? store.head : Math.floor(store.head + 1e-6);", 'const f = Math.floor(store.head + 1e-6);').replaceAll('this.orologioMonitor.leggi(banco.ora(), now)', 'banco.ora()');
 }}],
 define: { __VERSIONE__: JSON.stringify('banco') },
 server: { port: 0, hmr: false, watch: null, fs: { allow: [process.cwd(), await fs.realpath('node_modules')] } },
});
await server.listen();
console.log('Server pronto');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, timeout:30000, args: ['--force_high_performance_gpu', '--force-high-performance-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
console.log('Chromium pronto');
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
 await page.route('**/banco-assets/*', async route => route.fulfill({body:await fs.readFile(path.join(dir,new URL(route.request().url()).pathname.split('/').at(-1))),contentType:'video/webm'}));
 page.on('pageerror', e => console.error(e.message));
 page.on('console', m => { if(m.type()==='error')console.error(m.text()); });
 page.on('response', r => {if(r.status()>=400)console.error(r.status(),r.url());});
 await page.exposeFunction('salvaVideo', async (nome, dati) => fs.writeFile(path.join(dir, nome), Buffer.from(dati, 'base64')));
 await page.goto(`http://localhost:${server.httpServer.address().port}/app/`, {waitUntil:'domcontentloaded',timeout:120000});
 console.log('Pagina aperta');
 await page.waitForFunction(() => window.__dpvTest, null, {timeout:60000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
 for (const [nome,w,h,fps] of [['schermo.webm',2560,1440,60],['webcam.webm',1280,720,30]]) {
  let dati; try { await fs.access(path.join(dir,nome)); dati=true; } catch {}
  console.log(dati ? `Riuso ${nome}` : `Genero ${nome}`);
  await page.evaluate(async ({nome,w,h,fps,dati}) => {
   const { Output, BufferTarget, WebMOutputFormat, CanvasSource } = await import('/node_modules/.vite/deps/mediabunny.js');
   let bytes;
   if (dati) bytes = new Uint8Array(await (await fetch('/banco-assets/'+nome)).arrayBuffer());
   else {
    const canvas = new OffscreenCanvas(w,h), ctx = canvas.getContext('2d');
    const out = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const src = new CanvasSource(canvas, { codec: 'vp9', bitrate: 8_000_000, keyFrameInterval: 5 });
    out.addVideoTrack(src, { frameRate: fps }); await out.start();
    for (let i=0;i<fps*30;i++) {
     ctx.fillStyle='#15253c'; ctx.fillRect(0,0,w,h);
     for(let j=0;j<24;j++){ctx.fillStyle=`hsl(${j*15},65%,55%)`;ctx.fillRect((j*137+i*7)%w,(j*83+i*3)%h,130,65);}
     ctx.fillStyle='white';ctx.font='64px sans-serif';ctx.fillText(`LIVE ${i} / ${fps} fps`,80,100);
     await src.add(i/fps,1/fps);
    }
    src.close();await out.finalize(); bytes = new Uint8Array(out.target.buffer);
    let str=''; for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));
    await window.salvaVideo(nome,btoa(str));
   }
   await window.__dpvTest.importaFile([{name:nome,file:new File([bytes],nome,{type:'video/webm'})}],{chiediFormato:false,controlla:false});
  },{nome,w,h,fps,dati});
 }
 const setup = await page.evaluate(async (rate) => {
  const {store} = await import('/src/core/store.ts');
  const P = await import('/src/core/progetto.ts'), C = await import('/src/core/cornici.ts'), Z = await import('/src/core/zoomCursore.ts');
  const PX = await import('/src/media/proxy.ts'); PX.impostaModoProxy('mai');
  store.edit('Banco LIVE 1440p60',p=>{
   p.w=2560;p.h=1440;p.rate={num:rate,den:1};p.clips=[];
   const [m,cam]=p.media;
   m.cursoreLive={v:1,schermo:{id:'banco',left:0,top:0,width:2560,height:1440},durataMs:30000,segmenti:[],campioni:Array.from({length:1800},(_,i)=>({tMs:i*1000/60,cx:.5+.25*Math.sin(i/100),cy:.5,visible:true,clicks:0})),clic:Array.from({length:12},(_,i)=>({tMs:1000+i*2300,cx:.5,cy:.5,button:0}))};
   const v=P.newClip('media',p.tracks[1].id,0,rate*30,{media:m.id});Z.applicaZoomCursore(p,v,m);
   p.clips.push(v,Z.bloccoClicLive(v),P.newClip('media',p.tracks[0].id,0,rate*30,{media:cam.id,tf:C.bolla(p,cam)}));
  });
  store.select(store.doc.clips.map(c=>c.id));
  const rec=window.__motore.rec, gl=rec.gl, ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {rate,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),media:store.doc.media.map(m=>({w:m.width,h:m.height,fps:m.fps,duration:m.duration}))};
 },process.argv.includes('--25')?25:60);
 console.log(JSON.stringify(setup));
 await page.waitForTimeout(3000);
 const cdp = await page.context().newCDPSession(page);
 await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
 const result = await page.evaluate(async (pieno) => {
  const m=window.__motore,rec=m.rec;
  if(pieno){rec.canvas.width=2560;rec.canvas.height=1440;}
  const times={render:[],upload:[],readback:[],decode:[],raf:[]}, frames=new Set(), source=new Set(), finestre=new Map(); let on=false, inizioMisura=0;
  const FT = window.__dpvTest.FT;
  for(const [name,key] of [['render','render'],['upload','upload'],['leggiPiccolo','readback']]){
   const old=rec[name].bind(rec);rec[name]=(...args)=>{const t=performance.now();const r=old(...args);if(on)times[key].push(performance.now()-t);return r;};
  }
  const old=rec.layer.bind(rec);rec.layer=(...args)=>{const r=old(...args);if(on&&args[1].clip.media===window.__dpv.doc.media[0].id){const tex=[...rec.texs.values()].find(t=>t.src?.timestamp!==undefined&&t.w===2560);if(tex){source.add(tex.src.timestamp);const secondo=Math.floor((performance.now()-inizioMisura)/1000);if(!finestre.has(secondo))finestre.set(secondo,new Set());finestre.get(secondo).add(tex.src.timestamp);}}return r;};
  let prev; const off=m.ogniGiro(()=>{if(on){const now=performance.now();if(prev)times.raf.push(now-prev);prev=now;frames.add(m.ultimoDisegnato);}});
  m.vaiA(0);m.play();await new Promise(r=>setTimeout(r,3000));if(FT.tempiDecodifica)FT.tempiDecodifica.length=0;inizioMisura=performance.now();on=true;
  const start=performance.now();await new Promise(r=>setTimeout(r,20000));const seconds=(performance.now()-start)/1000;on=false;m.stop();off();
  if(FT.tempiDecodifica)times.decode=FT.tempiDecodifica.slice();
  const stats=a=>{a.sort((x,y)=>x-y);return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/(a.length||1),p95:a[Math.floor(a.length*.95)]??0,max:a.at(-1)??0};};
  return {seconds,monitorFps:frames.size/seconds,sourceFps:source.size/seconds,videoPerSecondo:[...finestre].filter(([s])=>s<Math.floor(seconds)).map(([,f])=>f.size),rafFps:(times.raf.length+1)/seconds,counter:m.fpsMisurati,canvas:[rec.canvas.width,rec.canvas.height],timings:Object.fromEntries(Object.entries(times).map(([k,a])=>[k,stats(a)]))};
 }, process.argv.includes('--pieno'));
 console.log(JSON.stringify(result,null,2));
 const {profile} = await cdp.send('Profiler.stop');
 const counts=new Map(); for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
 const hot=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,n:counts.get(n.id)||0})).sort((a,b)=>b.n-a.n).slice(0,18);
 if(process.argv.includes('--profilo'))console.log(JSON.stringify(hot,null,2));
 await fs.writeFile(path.join(dir,`${process.argv[2]||'misura'}.json`),JSON.stringify({prima,setup,...result,hot},null,2));
 // La sorgente 60p deve fornire un'immagine nuova per quasi ogni battito disponibile.
 // Il confronto coi rAF evita di scambiare la frequenza fisica dello schermo per quella del decoder.
 if(!prima && result.sourceFps < result.rafFps*0.98){console.error('Il monitor ripete troppe immagini');process.exitCode=1;}
} finally { await browser.close(); await server.close(); }




