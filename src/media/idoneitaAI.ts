// Un'indicazione prudente per scegliere un modello: la prova WebGPU verifica la scheda, non misura il modello.
// WebGPU non comunica la VRAM libera: senza una prova reale non promettiamo una velocità precisa.
import type { Hardware } from './hardware';

export interface RequisitiAI { processore?: boolean; ramGB: number; thread: number }
export function idoneitaAI(m: RequisitiAI, h: Hardware | null, usaScheda: boolean): { dove: string; testo: string; ok: boolean | null } {
  if (!h) return { dove: m.processore || !usaScheda ? 'Processore' : 'Scheda video o processore', testo: 'Sto riconoscendo questa macchina…', ok: null };
  const s = h.schede[h.scelta];
  const gpu = !m.processore && usaScheda && h.gpuApi && s?.prova === 'si' && !s.guasta && !s.software;
  const pocaRam = h.ram !== null && h.ram < m.ramGB;
  if (gpu) return {
    dove: 'Scheda video (WebGPU), processore se non riesce', ok: pocaRam ? false : null,
    testo: pocaRam ? `Poca memoria di sistema: consigliati almeno ${m.ramGB} GB.`
      : 'Scheda adatta: prova WebGPU superata. Velocità del modello da provare; VRAM libera non rilevabile.',
  };
  const lento = pocaRam || h.cpu < m.thread;
  return {
    dove: 'Processore', ok: lento ? false : null,
    testo: lento ? `Può essere lento su questa macchina: consigliati ${m.thread} thread e almeno ${m.ramGB} GB di memoria.`
      : `Processore adatto sulla carta (${h.cpu} thread).${h.ram === null ? ' Memoria non rilevata.' : ''} Velocità da provare${m.processore ? '.' : ': sulla scheda video sarebbe più rapido.'}`,
  };
}
