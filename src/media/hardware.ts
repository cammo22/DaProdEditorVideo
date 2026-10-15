// Il rilevatore dell'hardware: capisce da solo con cosa può lavorare l'AI su questo computer.
// Perché serve: WebGPU "c'è" ma non sempre funziona. Con due schede video (una scheda NVIDIA/AMD vera e quella dentro il
// processore), o con il cavo del monitor attaccato a quella sbagliata, il browser può dare una scheda che poi sbaglia nel
// mezzo del lavoro ("setPipeline… GPUComputePipeline"). Qui si guardano TUTTE le schede che il sistema offre (alte
// prestazioni e basso consumo), a ognuna si fa fare un conto vero, e si sceglie la prima che lo fa giusto. Se nessuna va
// si usa il processore. Il risultato sta in localStorage e si rifà da solo quando cambia l'hardware (nuova scheda) o se una
// scheda sbaglia a metà lavoro (`schedaGuasta`): così la prossima volta si prova l'altra.
// Il lato dei worker (che non hanno localStorage) riceve solo `{scheda, potenza, f16}` dentro i messaggi (`messaggioScheda`).
import { usaSchedaAI } from './libreriaAI';

export type Potenza = '' | 'high-performance' | 'low-power';

export interface SchedaTrovata {
  /** come l'ha chiesta il sistema: alte prestazioni, basso consumo */
  potenze: Potenza[];
  vendor: string; arch: string; descr: string;
  /** il programma di prova (un piccolo conto sulla scheda) è andato bene? */
  prova: 'si' | 'no';
  errore?: string;
  f16: boolean;
  /** è la scheda "di ripiego" del sistema (software, lenta)? */
  software: boolean;
  /** una scheda che ha sbagliato a metà lavoro: non si usa più (finché non si rileva di nuovo) */
  guasta?: boolean;
  ms: number;
}

export interface Hardware {
  firma: string;
  quando: number;
  cpu: number;
  ram: number | null;
  gpuApi: boolean;
  schede: SchedaTrovata[];
  /** la scheda scelta (indice in `schede`), o -1 = processore */
  scelta: number;
}

const CHIAVE = 'dpv-hardware';
/* eslint-disable @typescript-eslint/no-explicit-any */

const nomeScheda = (s: SchedaTrovata) => [s.vendor, s.descr || s.arch].filter(Boolean).join(' ').trim() || 'scheda video';
export const nomeDellaScheda = nomeScheda;

function leggi(): Hardware | null {
  try {
    const t = localStorage.getItem(CHIAVE);
    const h = t ? (JSON.parse(t) as Hardware) : null;
    return h && Array.isArray(h.schede) ? h : null;
  } catch { return null; }
}
function scrivi(h: Hardware) { try { localStorage.setItem(CHIAVE, JSON.stringify(h)); } catch { /* niente */ } }

/** la scheda da usare: la prima che ha superato la prova, non guasta, non software; quella "alte prestazioni" prima delle altre */
export function scegli(schede: SchedaTrovata[]): number {
  let best = -1, punti = -1;
  schede.forEach((s, i) => {
    if (s.prova !== 'si' || s.guasta || s.software) return;
    const p = (s.potenze.includes('high-performance') ? 2 : 0) + (s.f16 ? 1 : 0);
    if (p > punti) { punti = p; best = i; }
  });
  return best;
}

/** come il sistema vede le schede, senza prove (veloce): serve a riconoscere un cambio di hardware */
async function elencaAdattatori(): Promise<{ potenza: Potenza; a: any }[]> {
  const gpu = (navigator as any).gpu;
  if (!gpu) return [];
  const out: { potenza: Potenza; a: any }[] = [];
  for (const potenza of ['high-performance', 'low-power', ''] as Potenza[]) {
    try {
      const a = await gpu.requestAdapter(potenza ? { powerPreference: potenza } : undefined);
      if (a) out.push({ potenza, a });
    } catch { /* quella non c'è */ }
  }
  return out;
}

const info = (a: any) => {
  const i = a?.info ?? {};
  return { vendor: String(i.vendor ?? ''), arch: String(i.architecture ?? ''), descr: String(i.description || i.device || '') };
};
const firmaAdattatore = (a: any) => { const i = info(a); return [i.vendor, i.arch, i.descr].join('|'); };

/** un conto vero sulla scheda: crea il programma, lo lancia, rilegge i numeri. Se va storto, lo dice. */
async function provaScheda(a: any, scadenza = 8000): Promise<{ ok: boolean; errore?: string; ms: number }> {
  const t0 = performance.now();
  let device: any = null;
  const timer = new Promise<never>((_, no) => setTimeout(() => no(new Error('la scheda non risponde')), scadenza));
  try {
    const conto = (async () => {
      device = await a.requestDevice();
      let persa = '';
      device.lost?.then((l: { message?: string }) => { persa = l?.message ?? 'persa'; });
      const modulo = device.createShaderModule({
        code: '@group(0) @binding(0) var<storage, read_write> d: array<f32>;\n'
          + '@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) i: vec3<u32>) { if (i.x < 256u) { d[i.x] = f32(i.x) * 2.0 + 1.0; } }',
      });
      const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: modulo, entryPoint: 'main' } });
      const buf = device.createBuffer({ size: 1024, usage: 0x80 /* STORAGE */ | 0x4 /* COPY_SRC */ });
      const lettura = device.createBuffer({ size: 1024, usage: 0x1 /* MAP_READ */ | 0x8 /* COPY_DST */ });
      const gruppo = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, gruppo);
      pass.dispatchWorkgroups(4);
      pass.end();
      enc.copyBufferToBuffer(buf, 0, lettura, 0, 1024);
      device.queue.submit([enc.finish()]);
      await lettura.mapAsync(0x1 /* READ */);
      const v = new Float32Array(lettura.getMappedRange().slice(0));
      lettura.unmap();
      for (let k = 0; k < 256; k++) if (v[k] !== k * 2 + 1) throw new Error(`conto sbagliato sulla scheda (posto ${k}: ${v[k]})`);
      if (persa) throw new Error('la scheda si è persa: ' + persa);
    })();
    await Promise.race([conto, timer]);
    return { ok: true, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 };
  } finally { try { device?.destroy?.(); } catch { /* niente */ } }
}

let inCorso: Promise<Hardware> | null = null;

/**
 * Guarda l'hardware. Senza `forza` si riusa il risultato di prima se le schede sono le stesse (è subito); se sono cambiate
 * (o `forza`) si rifanno le prove (qualche decimo di secondo per scheda).
 */
export function rilevaHardware(forza = false): Promise<Hardware> {
  if (inCorso && !forza) return inCorso;
  const lavoro = (async (): Promise<Hardware> => {
    const cpu = navigator.hardwareConcurrency || 4;
    const ram = (navigator as any).deviceMemory ?? null;
    const gpuApi = !!(navigator as any).gpu;
    const adattatori = await elencaAdattatori();
    const firma = [cpu, ...adattatori.map((x) => x.potenza + ':' + firmaAdattatore(x.a))].join(';');
    const prima = leggi();
    if (!forza && prima && prima.firma === firma) return prima;
    // una scheda per volta: stessa scheda da due richieste = una sola riga
    const schede: SchedaTrovata[] = [];
    for (const { potenza, a } of adattatori) {
      const i = info(a);
      const gia = schede.find((s) => s.vendor === i.vendor && s.arch === i.arch && s.descr === i.descr);
      if (gia) { if (!gia.potenze.includes(potenza)) gia.potenze.push(potenza); continue; }
      const p = await provaScheda(a);
      schede.push({
        potenze: [potenza], ...i, prova: p.ok ? 'si' : 'no', errore: p.errore, ms: p.ms,
        f16: !!a.features?.has?.('shader-f16'), software: !!(a.isFallbackAdapter ?? a.info?.isFallbackAdapter),
        // una scheda già andata male a metà lavoro resta esclusa anche se il conto di prova è passato
        guasta: prima?.schede.find((s) => s.vendor === i.vendor && s.descr === i.descr && s.arch === i.arch)?.guasta && !forza ? true : undefined,
      });
    }
    const h: Hardware = { firma, quando: Date.now(), cpu, ram, gpuApi, schede, scelta: scegli(schede) };
    scrivi(h);
    try { document.dispatchEvent(new CustomEvent('dpv:hardware', { detail: h })); } catch { /* niente */ }
    return h;
  })();
  inCorso = lavoro;
  lavoro.catch(() => { if (inCorso === lavoro) inCorso = null; });
  return lavoro;
}

/** l'hardware com'è adesso (senza aspettare): quello rilevato l'ultima volta, se c'è */
export const hardwareNoto = () => leggi();

/** cosa dire ai worker: scheda sì/no, quale (alte prestazioni o basso consumo), se sa i mezzi float */
let schedaFintaProva = false;
/** per le prove: i worker fingono di avere una scheda video */
export const impostaSchedaFinta = (on: boolean) => { schedaFintaProva = on; };

export function messaggioScheda(): { scheda: boolean; potenza: Potenza; f16: boolean; finta?: boolean } {
  if (schedaFintaProva) return { scheda: true, potenza: '', f16: true, finta: true };
  if (!usaSchedaAI()) return { scheda: false, potenza: '', f16: false };
  const h = leggi();
  // senza un rilevamento (o con una sola scheda rimasta) dopo un errore della scheda in questa sessione si lavora col processore
  if (guastaInSessione && (!h || h.scelta < 0)) return { scheda: false, potenza: '', f16: false };
  // mai rilevato (o in corso): si lascia scegliere al sistema, come prima
  if (!h) return { scheda: true, potenza: '', f16: true };
  if (!h.gpuApi || h.scelta < 0) return { scheda: false, potenza: '', f16: false };
  const s = h.schede[h.scelta];
  return { scheda: true, potenza: s.potenze[0] ?? '', f16: s.f16 };
}

/** una scheda ha sbagliato a metà lavoro: non si usa più, e la prossima volta tocca all'altra (o al processore) */
let guastaInSessione = false;
export function schedaGuasta() {
  guastaInSessione = true;
  const h = leggi();
  if (!h || h.scelta < 0) return;
  h.schede[h.scelta].guasta = true;
  h.scelta = scegli(h.schede);
  scrivi(h);
  try { document.dispatchEvent(new CustomEvent('dpv:hardware', { detail: h })); } catch { /* niente */ }
}

/** tutto quello che il rilevatore ha trovato, in frasi (Centro AI) */
export function raccontaHardware(h: Hardware): { ok: boolean | null; titolo: string; testo: string }[] {
  const righe: { ok: boolean | null; titolo: string; testo: string }[] = [];
  righe.push({ ok: true, titolo: 'Processore', testo: `${h.cpu} thread${h.ram ? ` · memoria circa ${h.ram} GB o più` : ''}: l'AI lavora anche solo con lui` });
  if (!h.gpuApi) righe.push({ ok: null, titolo: 'Scheda video', testo: 'WebGPU non c\'è in questo programma: si usa il processore (va bene, solo più lento)' });
  else if (!h.schede.length) righe.push({ ok: null, titolo: 'Scheda video', testo: 'il sistema non ne offre nessuna all\'AI: si usa il processore' });
  h.schede.forEach((s, i) => {
    const usata = i === h.scelta;
    const stato = s.software ? 'è una scheda "finta" del sistema (software): non la uso'
      : s.guasta ? 'ha sbagliato durante un lavoro: non la uso più (premi "Riconosci di nuovo")'
      : s.prova === 'si' ? `prova superata in ${Math.round(s.ms)} ms${s.f16 ? ' · mezza precisione sì' : ''}${usata ? ' · la uso io' : ' · pronta ma ce n\'è una migliore'}`
      : `la prova non è riuscita (${(s.errore ?? 'errore').slice(0, 90)}): non la uso`;
    righe.push({ ok: usata ? true : s.prova === 'si' && !s.guasta && !s.software ? true : false, titolo: `Scheda ${nomeScheda(s)}`, testo: stato });
  });
  if (h.gpuApi && h.schede.length && h.scelta < 0) righe.push({ ok: null, titolo: 'Scelta', testo: 'nessuna scheda ha superato la prova: l\'AI usa il processore, e funziona lo stesso' });
  return righe;
}

/** all'avvio, quando il programma è fermo: guarda l'hardware (e rifà le prove solo se è cambiato) */
export function rilevaAllAvvio() {
  const via = () => { void rilevaHardware().catch(() => { /* niente scheda: si usa il processore */ }); };
  const ric = (window as any).requestIdleCallback as ((f: () => void, o?: { timeout: number }) => void) | undefined;
  if (ric) ric(via, { timeout: 6000 }); else setTimeout(via, 3000);
}
