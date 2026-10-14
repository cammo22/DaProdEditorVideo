// Movimento fluido per i rallentatori: quando una ripresa va piano, lo stesso fotogramma resterebbe fermo per
// più fotogrammi del progetto e il movimento scatta. Qui si inventano quelli in mezzo, sulla GPU:
//  · sfumato: si mescolano il fotogramma di prima e quello dopo (semplice, va bene fino a ×0.5 circa);
//  · mosso: flusso ottico. Si stima dove va ogni pezzetto dell'immagine, da A verso B e da B verso A, a più scale
//    (dal grossolano al fine: ogni scala parte dalla stima della precedente e la corregge di un passo, così si
//    seguono anche i movimenti lunghi), con una finestra di confronto da 5×5 campioni, un termine che tiene vicine le
//    stime dei pezzetti accanto, la correzione a mezzo pixel (parabola sui costi) e una passata che livella dove la stima
//    è sicura. Poi, per ogni punto del fotogramma nuovo, si guardano le due stime e si spostano A e B verso il punto
//    giusto del tempo: dove le due immagini spostate non combaciano (cose che si scoprono, tagli, rumore) si torna allo
//    sfumato, senza fantasmi né buchi.
// Il campo di movimento si rifà solo quando cambia la coppia di fotogrammi (a ×0.25 uno ogni quattro). Le stime stanno
// in texture a mezza precisione (RGBA16F): se la scheda non le sa disegnare, il "mosso" diventa uno "sfumato".
import { compila, VS_FULL } from './compositore';

/** quanti passi per parte prova ogni scala (±R celle attorno alla stima di prima) */
const R = 2;
/** larghezza della griglia del movimento alla scala più fine, al massimo */
const GRIGLIA_MAX = 320;
const GRIGLIA_MIN = 24;

const FS_MOTO = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_a, u_b, u_prima;
uniform vec2 u_cell;     // una cella di questa scala, in coordinate della texture
uniform float u_lod;
uniform float u_ha;      // 0 alla scala più grossolana (niente stima di prima)
uniform float u_liscio;  // quanto costa allontanarsi dalla stima di prima (per cella)
out vec4 o;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float L(sampler2D t, vec2 uv) { return lum(textureLod(t, uv, u_lod).rgb); }
float pa[25];
float costo(vec2 d) {
  float s = 0.0;
  for (int k = 0; k < 25; k++) {
    vec2 off = vec2(float(k % 5 - 2), float(k / 5 - 2)) * u_cell * 0.7;
    s += abs(pa[k] - L(u_b, v_uv + off + d));
  }
  return s / 25.0;
}
void main() {
  for (int k = 0; k < 25; k++) pa[k] = L(u_a, v_uv + vec2(float(k % 5 - 2), float(k / 5 - 2)) * u_cell * 0.7);
  vec2 pred = u_ha > 0.5 ? texture(u_prima, v_uv).rg : vec2(0.0);
  vec2 best = pred;
  float bc = costo(pred);
  for (int dy = -${R}; dy <= ${R}; dy++) for (int dx = -${R}; dx <= ${R}; dx++) {
    if (dx == 0 && dy == 0) continue;
    vec2 d = pred + vec2(float(dx), float(dy)) * u_cell;
    float c = costo(d) + u_liscio * length(vec2(float(dx), float(dy)));
    if (c < bc) { bc = c; best = d; }
  }
  // fermo: la stima di prima potrebbe aver preso una scia (vale sempre la pena provare "niente movimento")
  if (u_ha > 0.5) {
    float c0 = costo(vec2(0.0)) + u_liscio * length(pred / u_cell) * 0.5;
    if (c0 < bc) { bc = c0; best = vec2(0.0); }
  }
  // mezzo pixel: parabola sui costi dei vicini
  float cc = costo(best);
  float cxm = costo(best - vec2(u_cell.x, 0.0)), cxp = costo(best + vec2(u_cell.x, 0.0));
  float cym = costo(best - vec2(0.0, u_cell.y)), cyp = costo(best + vec2(0.0, u_cell.y));
  float dxx = cxm - 2.0 * cc + cxp, dyy = cym - 2.0 * cc + cyp;
  vec2 fine = vec2(0.0);
  if (dxx > 1e-5) fine.x = clamp(0.5 * (cxm - cxp) / dxx, -0.5, 0.5);
  if (dyy > 1e-5) fine.y = clamp(0.5 * (cym - cyp) / dyy, -0.5, 0.5);
  best += fine * u_cell;
  o = vec4(best, cc, 1.0);
}`;

// livella le stime: la media dei vicini, contando di più chi ha un costo basso (stima sicura)
const FS_LISCIA = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_f;
uniform vec2 u_cell;
out vec4 o;
void main() {
  vec3 s = vec3(0.0);
  float ws = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec4 f = texture(u_f, v_uv + vec2(float(i), float(j)) * u_cell);
    float w = (i == 0 && j == 0 ? 2.0 : 1.0) / (0.02 + f.b);
    s += vec3(f.rg, f.b) * w;
    ws += w;
  }
  vec3 m = s / ws;
  o = vec4(m, 1.0);
}`;

const FS_MEZZO = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_a, u_b, u_ab, u_ba;
uniform float u_w;
uniform bool u_mosso;
out vec4 o;
void main() {
  vec4 a0 = texture(u_a, v_uv), b0 = texture(u_b, v_uv);
  vec4 plain = mix(a0, b0, u_w);
  if (!u_mosso) { o = plain; return; }
  // da A verso B: dov'era questo punto in A (e dove sarà in B)
  vec2 d1 = texture(u_ab, v_uv).rg;
  d1 = texture(u_ab, v_uv - u_w * d1).rg;
  vec4 a1 = texture(u_a, v_uv - u_w * d1), b1 = texture(u_b, v_uv + (1.0 - u_w) * d1);
  // da B verso A
  vec2 d2 = texture(u_ba, v_uv).rg;
  d2 = texture(u_ba, v_uv - (1.0 - u_w) * d2).rg;
  vec4 a2 = texture(u_a, v_uv + u_w * d2), b2 = texture(u_b, v_uv - (1.0 - u_w) * d2);
  float e1 = dot(abs(a1.rgb - b1.rgb), vec3(0.3333));
  float e2 = dot(abs(a2.rgb - b2.rgb), vec3(0.3333));
  float k1 = exp(-e1 * e1 * 400.0), k2 = exp(-e2 * e2 * 400.0);
  vec4 m = (mix(a1, b1, u_w) * k1 + mix(a2, b2, u_w) * k2) / (k1 + k2 + 1e-5);
  // fiducia: dove i due punti spostati non combaciano, meglio lo sfumato
  float fid = 1.0 - smoothstep(0.05, 0.16, min(e1, e2));
  o = mix(plain, m, fid);
}`;

export interface TexFl { tex: WebGLTexture }

interface Bersaglio { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }
interface Flusso { livelli: Bersaglio[]; fine: Bersaglio }
interface Stato { out: Bersaglio; ab?: Flusso; ba?: Flusso; coppia?: unknown; dim?: string }

export class Interpolatore {
  private pMoto: WebGLProgram;
  private pLiscia: WebGLProgram;
  private pMezzo: WebGLProgram;
  private uMoto: Record<string, WebGLUniformLocation | null> = {};
  private uLiscia: Record<string, WebGLUniformLocation | null> = {};
  private uMezzo: Record<string, WebGLUniformLocation | null> = {};
  private stati = new Map<string, Stato>();
  private usati = new Set<string>();
  /** la scheda sa disegnare su texture a mezza precisione? (se no, il "mosso" è uno "sfumato") */
  readonly capace: boolean;

  constructor(private gl: WebGL2RenderingContext) {
    this.pMoto = compila(gl, VS_FULL, FS_MOTO);
    this.pLiscia = compila(gl, VS_FULL, FS_LISCIA);
    this.pMezzo = compila(gl, VS_FULL, FS_MEZZO);
    for (const n of ['u_a', 'u_b', 'u_prima', 'u_cell', 'u_lod', 'u_ha', 'u_liscio']) this.uMoto[n] = gl.getUniformLocation(this.pMoto, n);
    for (const n of ['u_f', 'u_cell']) this.uLiscia[n] = gl.getUniformLocation(this.pLiscia, n);
    for (const n of ['u_a', 'u_b', 'u_ab', 'u_ba', 'u_w', 'u_mosso']) this.uMezzo[n] = gl.getUniformLocation(this.pMezzo, n);
    this.capace = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  }

  private bersaglio(w: number, h: number, mezza: boolean): Bersaglio {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mezza) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  private libera(b?: Bersaglio) { if (b) { this.gl.deleteFramebuffer(b.fb); this.gl.deleteTexture(b.tex); } }
  private liberaFlusso(f?: Flusso) { if (f) { for (const b of f.livelli) this.libera(b); this.libera(f.fine); } }
  private liberaStato(s: Stato) { this.libera(s.out); this.liberaFlusso(s.ab); this.liberaFlusso(s.ba); }

  /** all'inizio di ogni fotogramma: si buttano gli stati che non servono più */
  inizia() { this.usati.clear(); }
  finisce() {
    for (const [k, s] of this.stati) if (!this.usati.has(k)) { this.liberaStato(s); this.stati.delete(k); }
  }

  /** le misure delle scale, dalla più grossolana alla più fine */
  private scale(wpx: number, hpx: number): [number, number][] {
    let w = Math.max(GRIGLIA_MIN, Math.min(GRIGLIA_MAX, Math.round(wpx / 4)));
    const s: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      s.unshift([w, Math.max(8, Math.round((w * hpx) / wpx))]);
      if (w <= 28) break;
      w = Math.ceil(w / 2);
    }
    return s;
  }

  private nuovoFlusso(sc: [number, number][]): Flusso {
    const ult = sc[sc.length - 1];
    return { livelli: sc.map(([w, h]) => this.bersaglio(w, h, true)), fine: this.bersaglio(ult[0], ult[1], true) };
  }

  /** il movimento di tutti i punti da `da` verso `verso`, a scale via via più fini; il risultato è in `f.fine` */
  private stima(f: Flusso, da: TexFl, verso: TexFl, wpx: number) {
    const gl = this.gl;
    gl.useProgram(this.pMoto);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, da.tex); gl.uniform1i(this.uMoto.u_a, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, verso.tex); gl.uniform1i(this.uMoto.u_b, 1);
    gl.uniform1i(this.uMoto.u_prima, 2);
    f.livelli.forEach((l, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.fb);
      gl.viewport(0, 0, l.w, l.h);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, i ? f.livelli[i - 1].tex : da.tex);
      gl.uniform2f(this.uMoto.u_cell, 1 / l.w, 1 / l.h);
      // ogni campione guarda un pezzetto grande quanto la distanza fra campioni
      gl.uniform1f(this.uMoto.u_lod, Math.max(0, Math.log2((0.7 * wpx) / l.w)));
      gl.uniform1f(this.uMoto.u_ha, i ? 1 : 0);
      gl.uniform1f(this.uMoto.u_liscio, 0.004);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    // una passata che livella le stime dell'ultima scala
    const u = f.livelli[f.livelli.length - 1];
    gl.useProgram(this.pLiscia);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fine.fb);
    gl.viewport(0, 0, f.fine.w, f.fine.h);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, u.tex); gl.uniform1i(this.uLiscia.u_f, 2);
    gl.uniform2f(this.uLiscia.u_cell, 1 / u.w, 1 / u.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Il fotogramma a metà fra A e B (w = 0 è A, 1 è B). a e b sono le texture già caricate; `coppiaId` cambia quando cambia
   * la coppia. Ritorna la texture del risultato (grande wpx × hpx, con l'orientamento delle sorgenti). Lo stato di
   * disegno (framebuffer, viewport) va rimesso da chi chiama.
   */
  mezzo(chiave: string, a: TexFl, b: TexFl, coppiaId: unknown, w: number, wpx: number, hpx: number, mosso: boolean): WebGLTexture {
    const gl = this.gl;
    this.usati.add(chiave);
    let st = this.stati.get(chiave);
    if (!st || st.out.w !== wpx || st.out.h !== hpx) {
      if (st) this.liberaStato(st);
      st = { out: this.bersaglio(wpx, hpx, false) };
      this.stati.set(chiave, st);
    }
    gl.disable(gl.BLEND);
    const conMoto = mosso && this.capace;
    // il campo di movimento (solo "mosso"), quando la coppia è nuova
    if (conMoto) {
      const sc = this.scale(wpx, hpx);
      const dim = sc.map((x) => x.join('x')).join(',');
      if (!st.ab || !st.ba || st.dim !== dim) {
        this.liberaFlusso(st.ab); this.liberaFlusso(st.ba);
        st.ab = this.nuovoFlusso(sc); st.ba = this.nuovoFlusso(sc);
        st.dim = dim; st.coppia = undefined;
      }
      if (st.coppia !== coppiaId) {
        // le mip servono solo per la stima del movimento: dopo si rimette il filtro di prima (se no la texture, che poi
        // viene ridisegnata da sola, userebbe mip vecchie)
        for (const t of [a, b]) {
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.generateMipmap(gl.TEXTURE_2D);
        }
        gl.disable(gl.BLEND);
        this.stima(st.ab, a, b, wpx);
        this.stima(st.ba, b, a, wpx);
        for (const t of [a, b]) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); }
        st.coppia = coppiaId;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, st.out.fb);
    gl.viewport(0, 0, wpx, hpx);
    gl.useProgram(this.pMezzo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform1i(this.uMezzo.u_a, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.tex); gl.uniform1i(this.uMezzo.u_b, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, conMoto && st.ab ? st.ab.fine.tex : a.tex); gl.uniform1i(this.uMezzo.u_ab, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, conMoto && st.ba ? st.ba.fine.tex : a.tex); gl.uniform1i(this.uMezzo.u_ba, 3);
    gl.uniform1f(this.uMezzo.u_w, w);
    gl.uniform1i(this.uMezzo.u_mosso, conMoto ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    return st.out.tex;
  }

  distruggi() {
    for (const s of this.stati.values()) this.liberaStato(s);
    this.stati.clear();
  }
}
