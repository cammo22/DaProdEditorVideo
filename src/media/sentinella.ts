// La sentinella dei decoder: conta i VideoDecoder che l'app apre. Nell'app vera (WebView2, decodifica sulla scheda video)
// ogni decoder lascia memoria nel processo grafico: un giro che ne apre decine al secondo riempiva RAM e VRAM in un
// minuto. Se se ne aprono troppi di fila, chi lavora sullo sfondo (miniature, ricerche) aspetta e lo si scrive in console.

const FINESTRA_MS = 2000;
const MAX_IN_FINESTRA = 24;
const aperture: number[] = [];
let avvisato = false;

export function installaSentinella() {
  const VD = (globalThis as { VideoDecoder?: typeof VideoDecoder }).VideoDecoder;
  if (!VD || (VD.prototype as { __sentinella?: boolean }).__sentinella) return;
  const conf = VD.prototype.configure;
  (VD.prototype as { __sentinella?: boolean }).__sentinella = true;
  VD.prototype.configure = function (this: VideoDecoder & { __contato?: boolean }, c: VideoDecoderConfig) {
    if (!this.__contato) {
      this.__contato = true;
      const ora = performance.now();
      aperture.push(ora);
      while (aperture.length && ora - aperture[0] > FINESTRA_MS) aperture.shift();
      if (aperture.length > MAX_IN_FINESTRA && !avvisato) {
        avvisato = true;
        console.warn(`Sentinella: ${aperture.length} decoder in ${FINESTRA_MS / 1000} s, metto in attesa i lavori di sfondo`, new Error().stack);
      }
    }
    return conf.call(this, c);
  };
}

/** troppi decoder aperti di recente? */
export function decoderInPiena(): boolean {
  const ora = performance.now();
  while (aperture.length && ora - aperture[0] > FINESTRA_MS) aperture.shift();
  if (aperture.length <= MAX_IN_FINESTRA / 2) avvisato = false;
  return aperture.length > MAX_IN_FINESTRA;
}

/** aspetta che la piena passi (al massimo qualche secondo) */
export async function aspettaSentinella() {
  for (let i = 0; decoderInPiena() && i < 40; i++) await new Promise((ok) => setTimeout(ok, 100));
}
