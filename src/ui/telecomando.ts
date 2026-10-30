// Il telecomando di LIVE: una finestrella quasi quadrata, sempre in primo piano, con l'anteprima di quello che si sta
// registrando (e la webcam nel suo angolo), il tempo, la PAUSA grande, il segno, il cambio di finestra e FERMA.
// Nel browser (Chrome, Edge) è una finestra Document Picture-in-Picture, che il sistema tiene già sopra alle altre;
// nell'app è la finestra stessa che si fa piccola e si mette sopra (setAlwaysOnTop), poi torna com'era.
// L'anteprima si può spegnere (si risparmia un po' di lavoro alla scheda video): la scelta si ricorda.
import { h, icona, avviso } from './dom';
import { isAndroid, isTauri } from '../platform';
import { posizioneBarra, SOGLIA_CLIP } from '../core/liveAudio';

export interface ComandiTelecomando {
  pausa: () => void;
  segna: () => void;
  ferma: () => void;
  prossima: () => void;
  /** i tasti di LIVE (Spazio, M, F, 1-9) valgono anche nella finestrella */
  tasto: (e: KeyboardEvent) => void;
}

export interface StatoTelecomando {
  fase: 'fermo' | 'conto' | 'registra' | 'pausa';
  /** il tempo già scritto (00:01:23, o "… 3" durante il conto alla rovescia) */
  tempo: string;
  segni: number;
  /** quello che si registra e la webcam (null = niente) */
  schermo: MediaStream | null;
  cam: MediaStream | null;
  /** quante finestre ci sono (il cambio serve con due o più) */
  finestre: number;
}

const MISURA = { w: 360, h: 440 };
const CHIAVE = 'dpv-tele-anteprima';

export class Telecomando {
  el: HTMLElement;
  private pip: Window | null = null;
  private app = false;
  private prima: { max: boolean; w: number; h: number } | null = null;
  private tempo: HTMLElement;
  private spia: HTMLElement;
  private segni: HTMLElement;
  private quadro: HTMLElement;
  private video: HTMLVideoElement;
  private cam: HTMLVideoElement;
  private bPausa: HTMLButtonElement;
  private bSegna: HTMLButtonElement;
  private bCambia: HTMLButtonElement;
  private bOcchio: HTMLButtonElement;
  /** i livelli piccoli sull'anteprima: computer e voce */
  private barre: HTMLElement[];
  private conAnteprima = true;
  private stato: StatoTelecomando | null = null;

  constructor(private c: ComandiTelecomando) {
    try { this.conAnteprima = localStorage.getItem(CHIAVE) !== 'no'; } catch { /* niente */ }
    const video = (cls: string) => { const v = h('video', { class: cls, muted: true, autoplay: true, playsinline: true }) as HTMLVideoElement; v.muted = true; return v; };
    this.video = video('tele-video');
    this.cam = video('tele-cam');
    this.tempo = h('span', { class: 'tele-tempo' }, '00:00:00');
    this.spia = h('span', { class: 'tele-spia' }, 'PRONTO');
    this.segni = h('span', { class: 'tele-segni' });
    this.barre = [h('i'), h('i')];
    const livelli = h('div', { class: 'tele-livelli', title: 'Livelli: computer e voce' },
      h('div', { class: 'tele-liv computer' }, icona('altoparlante', 10), h('span', null, this.barre[0])),
      h('div', { class: 'tele-liv voce' }, icona('mic', 10), h('span', null, this.barre[1])));
    this.quadro = h('div', { class: 'tele-quadro', title: 'Clic: nascondi o mostra l\'anteprima', on: { click: () => this.alternaAnteprima() } },
      this.video, this.cam, livelli, h('span', { class: 'tele-pausa-scritta' }, '❚❚ IN PAUSA'), h('span', { class: 'tele-spenta' }, icona('occhio', 20), 'anteprima spenta'));
    this.bPausa = h('button', { class: 'live-btn tele-grande', title: 'Pausa e riprendi (Spazio)', on: { click: () => c.pausa() } }) as HTMLButtonElement;
    this.bSegna = h('button', { class: 'live-btn segna', title: 'Un segno qui: diventa un marcatore (M)', on: { click: () => c.segna() } }, icona('marcatore', 15), 'SEGNA') as HTMLButtonElement;
    this.bCambia = h('button', { class: 'live-btn', title: 'Passa alla finestra dopo (tasti 1-9)', on: { click: () => c.prossima() } }, '⇄ FINESTRA') as HTMLButtonElement;
    this.bOcchio = h('button', { class: 'live-btn', title: 'Mostra o nascondi l\'anteprima', on: { click: () => this.alternaAnteprima() } }, icona('occhio', 15)) as HTMLButtonElement;
    // la testa si trascina (nell'app la finestra piccola non ha cornice)
    this.el = h('div', { class: 'live-mini' },
      h('div', { class: 'tele-testa', 'data-tauri-drag-region': 'deep' },
        h('i', { class: 'live-mini-punto' }), this.spia, this.tempo, this.segni,
        h('button', { class: 'live-btn tele-torna', title: 'Torna alla finestra grande', on: { click: () => void this.chiudi() } }, '⤢')),
      this.quadro,
      h('div', { class: 'tele-tasti' }, this.bPausa, this.bSegna),
      h('div', { class: 'tele-tasti tre' }, this.bCambia, this.bOcchio,
        h('button', { class: 'live-btn ferma', title: 'Ferma: la registrazione va nel contenitore (F)', on: { click: () => c.ferma() } }, '■ FERMA')),
      h('div', { class: 'tele-piede' }, h('kbd', null, 'Spazio'), ' pausa ', h('kbd', null, 'M'), ' segno ', h('kbd', null, 'F'), ' ferma'));
    document.body.append(this.el);
    this.segnaAnteprima();
  }

  get aperto() { return !!this.pip || this.app; }

  async apri() {
    if (this.aperto) return;
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: object) => Promise<Window> } }).documentPictureInPicture;
    if (dpip && !isTauri) {
      try {
        const w = await dpip.requestWindow({ width: MISURA.w, height: MISURA.h });
        // gli stili della pagina, copiati nella finestrella (con la base giusta per i caratteri)
        w.document.head.append(h('base', { href: location.href }));
        for (const ss of [...document.styleSheets]) {
          try {
            w.document.head.append(h('style', null, [...ss.cssRules].map((r) => r.cssText).join('\n')));
          } catch {
            if (ss.href) w.document.head.append(h('link', { rel: 'stylesheet', href: ss.href }));
          }
        }
        w.document.body.className = 'pip-live';
        w.document.body.append(this.el);
        this.el.classList.add('su');
        w.addEventListener('keydown', (e) => this.c.tasto(e), true);
        w.addEventListener('pagehide', () => { this.pip = null; this.rientra(); });
        this.pip = w;
        this.aggiorna();
        return;
      } catch { /* niente finestrella: si prova la finestra piccola */ }
    }
    if (isTauri && !isAndroid) { await this.finestraPiccola(true); return; }
    avviso('Il telecomando sopra le altre finestre c\'è in Chrome ed Edge e nell\'app per Windows e Mac', 'info', 3200);
  }

  async chiudi() {
    if (this.pip) { this.pip.close(); this.pip = null; this.rientra(); }
    if (this.app) await this.finestraPiccola(false);
  }

  /** il telecomando torna nella pagina (nascosto) */
  private rientra() {
    this.el.classList.remove('su');
    document.body.append(this.el);
    this.collega();
  }

  /** tempo, spie, tasti e anteprima secondo come sta la registrazione */
  aggiorna(s: StatoTelecomando | null = this.stato) {
    this.stato = s;
    if (!s) return;
    this.tempo.textContent = s.tempo;
    const inOnda = s.fase === 'registra' || s.fase === 'pausa';
    this.spia.textContent = s.fase === 'pausa' ? 'PAUSA' : s.fase === 'registra' ? 'REC' : s.fase === 'conto' ? 'PRONTI' : 'FERMO';
    this.segni.textContent = s.segni ? `⚑ ${s.segni}` : '';
    this.el.classList.toggle('in-pausa', s.fase === 'pausa');
    this.el.classList.toggle('in-onda', inOnda);
    this.bPausa.disabled = !inOnda;
    const pausa = s.fase === 'pausa';
    // il tempo si aggiorna quattro volte al secondo: il tasto si rifà solo quando cambia
    if (this.bPausa.dataset.pausa !== String(pausa)) {
      this.bPausa.dataset.pausa = String(pausa);
      this.bPausa.replaceChildren(icona(pausa ? 'play' : 'pausa', 18), pausa ? 'RIPRENDI' : 'PAUSA');
    }
    this.bSegna.disabled = s.fase !== 'registra';
    this.bCambia.disabled = s.finestre < 2 || !inOnda;
    this.collega();
  }

  /** i livelli del computer e della voce (picco di sinistra e destra): due barrette sull'anteprima */
  livelli(computer: [number, number], voce: [number, number]) {
    [computer, voce].forEach((p, i) => {
      const b = this.barre[i], m = Math.max(p[0], p[1]);
      b.style.transform = `scaleX(${posizioneBarra(m).toFixed(3)})`;
      b.classList.toggle('alto', m > 0.5);
      b.classList.toggle('clip', m >= SOGLIA_CLIP);
    });
  }

  /** l'anteprima guarda gli stessi flussi della registrazione (niente copie: è la stessa immagine) */
  private collega() {
    const s = this.stato;
    const vivo = this.aperto && this.conAnteprima;
    const metti = (v: HTMLVideoElement, f: MediaStream | null) => {
      const voluto = vivo ? f : null;
      if (v.srcObject !== voluto) v.srcObject = voluto;
      // spostato in un'altra finestra, il video riparte solo se glielo si chiede
      if (voluto && v.paused) void v.play().catch(() => {});
    };
    metti(this.video, s?.schermo ?? null);
    metti(this.cam, s?.cam ?? null);
    this.cam.classList.toggle('via', !s?.cam);
  }

  private alternaAnteprima() {
    this.conAnteprima = !this.conAnteprima;
    try { localStorage.setItem(CHIAVE, this.conAnteprima ? 'si' : 'no'); } catch { /* niente */ }
    this.segnaAnteprima();
    this.collega();
  }

  private segnaAnteprima() {
    this.quadro.classList.toggle('spenta', !this.conAnteprima);
    this.bOcchio.classList.toggle('acceso', this.conAnteprima);
  }

  /** nell'app: la finestra diventa il telecomando, quasi quadrata e sempre in primo piano (e poi torna com'era) */
  private async finestraPiccola(si: boolean) {
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      if (si) {
        const k = await w.scaleFactor();
        const s = (await w.innerSize()).toLogical(k);
        this.prima = { max: await w.isMaximized(), w: s.width, h: s.height };
        if (this.prima.max) await w.unmaximize();
        await w.setMinSize(new LogicalSize(300, 340));
        await w.setSize(new LogicalSize(MISURA.w, MISURA.h));
        await w.setAlwaysOnTop(true);
        this.modoPiccolo(true);
      } else {
        this.modoPiccolo(false);
        await w.setAlwaysOnTop(false);
        await w.setMinSize(new LogicalSize(1000, 640));
        const p = this.prima;
        if (p) { await w.setSize(new LogicalSize(p.w, p.h)); if (p.max) await w.maximize(); }
      }
    } catch (e) {
      this.modoPiccolo(false);
      avviso('Il telecomando non si apre: ' + String(e), 'info', 3200);
    }
  }

  /** la pagina mostra solo il telecomando (anche per le prove, che non hanno la finestra dell'app) */
  modoPiccolo(si: boolean) {
    this.app = si;
    document.documentElement.classList.toggle('mini-live', si);
    this.el.classList.toggle('su', si);
    this.aggiorna();
    if (!si) this.collega();
  }
}
