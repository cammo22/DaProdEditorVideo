import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrologioMonitor } from './orologioMonitor.ts';

test('il preroll resta fermo; stop e seek azzerano la stima', () => {
 const c = new OrologioMonitor();
 for(let t=0;t<=60;t+=10)assert.equal(c.leggi(12,t),12);
 assert.equal(c.leggi(12.016,76),12.016);
 c.azzera();assert.equal(c.leggi(3,90),3);
});

test('audio quantizzato a 128 campioni: video continuo, scarto sotto 3 ms per 30 s', () => {
 const c = new OrologioMonitor(), q=128/48000;
 let prima=0;
 for(let i=0;i<1800;i++){
  const now=i*1000/60, audio=Math.floor(now/1000/q)*q;
  const video=c.leggi(audio,now);
  assert.ok(Math.abs(video-audio)<.003);
  if(i>3)assert.ok(Math.abs((video-prima)-1/60)<.0001);
  prima=video;
 }
});

test('deriva audio e discontinuità: resta in sincrono e segue il salto', () => {
 const c = new OrologioMonitor();
 for(let i=0;i<3600;i++){
  const now=i*1000/60, audio=now/1000*1.0001;
  assert.ok(Math.abs(c.leggi(audio,now)-audio)<.001);
 }
 assert.equal(c.leggi(100,60001),100);
});
