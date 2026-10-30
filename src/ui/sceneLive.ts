// La stessa geometria delle scene in LIVE e nel telecomando, senza tela né risorse per fotogramma.
import { riquadriScena, DURATA_SCENA, type CambioScena } from '../core/sceneLive';
export function mostraScena(schermo: HTMLVideoElement, webcam: HTMLVideoElement, titolo: HTMLElement, scena: CambioScena, rapporto: number) {
  const r = riquadriScena(scena);
  for (const [v, q] of [[schermo, r.schermo], [webcam, r.webcam]] as const) {
    if (v === webcam && scena.scena === 'bolla') {
      const aspetto = webcam.videoWidth && webcam.videoHeight ? webcam.videoWidth / webcam.videoHeight : rapporto;
      q.w = q.tonda ? .3 / rapporto : .3 * aspetto / rapporto;
      q.x = scena.angolo.endsWith('d') ? 1 - .045 / rapporto - q.w : .045 / rapporto;
      q.y = scena.angolo.startsWith('b') ? .655 : .045;
    }
    const w = q.w;
    const x = q.tonda && scena.angolo.endsWith('d') ? 1 - .045 / rapporto - w : q.tonda ? .045 / rapporto : q.x;
    const y = q.tonda ? scena.angolo.startsWith('b') ? .655 : .045 : q.y;
    Object.assign(v.style, { position: 'absolute', inset: 'auto', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${q.h * 100}%`, aspectRatio: 'auto', objectFit: q.copri ? 'cover' : 'contain', borderRadius: q.tonda ? '50%' : '0', opacity: q.visibile ? '1' : '0', border: '0', transform: 'none', transition: `all ${DURATA_SCENA}s ease`, zIndex: scena.scena === 'webcam-schermo' && v === schermo ? '2' : '1' });
  }
  titolo.classList.toggle('acceso', r.titolo);
}
