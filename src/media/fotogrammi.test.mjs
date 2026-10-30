// Esegue le classi vere del lettore con un sink sintetico: niente browser né GPU.
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sorgente = await readFile(new URL('./fotogrammi.ts', import.meta.url), 'utf8');
const scarto = Number(sorgente.match(/const SCARTO_TIMESTAMP = ([\d.]+);/)[1]);
const classi = sorgente.slice(sorgente.indexOf('class Flusso'), sorgente.indexOf('function chiudiDopo'))
 + sorgente.slice(sorgente.indexOf('const copre ='), sorgente.indexOf('const lettori ='));
const { code: js } = await transformWithOxc(classi.replaceAll('import.meta.env.DEV', 'false'), 'fotogrammi.ts');
const { Flusso, Ricerca } = new Function('SCARTO_TIMESTAMP', 'CODA', 'conti', 'avvisa', 'chiudiDopo',
 `${js}; return { Flusso, Ricerca };`)(scarto, 5, { flussi: 0 }, () => {}, s => s?.close());
const giro = () => new Promise(resolve => setImmediate(resolve));

function sink(rate) {
 const tutti = Array.from({length:Math.ceil(rate*30)}, (_,i)=>({
  i, timestamp:Math.round(i*1000/rate)/1000, duration:1/rate, closed:false,
  close(){this.closed=true;}, clone(){return {...this};},
 }));
 return { tutti, async *samples(){ for(const s of tutti)yield s; } };
}

test('WebM: ogni frame di 30 s a 24/25/30/50/59,94/60 fps viene mostrato una volta', async () => {
 for(const rate of [24,25,30,50,60000/1001,60]){
  const vs=sink(rate), f=new Flusso({vs},0);
  for(let i=0;i<vs.tutti.length;i++){
   await giro();
   assert.equal(f.at(i/rate)?.i,i,`cadenza ${rate}, fotogramma ${i}`);
  }
  f.close();await giro();
  assert.ok(vs.tutti.every(s=>s.closed),'nessun campione trattenuto');
 }
});

test('jog e passaggio ricerca → flusso usano lo stesso fotogramma WebM', async () => {
 const vs=sink(60), r=new Ricerca(vs);
 for(let i=0;i<60;i++){
  r.at(i/60);await giro();
  assert.equal(r.current?.i,i);
 }
 const cursore=r.cedi(59/60);
 assert.ok(cursore);
 const f=new Flusso({vs},59/60,cursore);
 await giro();assert.equal(f.at(1)?.i,60);
 f.close();r.close();
});
