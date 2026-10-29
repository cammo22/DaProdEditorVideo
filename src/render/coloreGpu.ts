// Risorse colore condivise fra anteprima ed export. Algoritmi LUT/curve: TERZE-PARTI.md (MIT OpenReel).
import type { Project, RisorsaLut } from '../core/tipi';
import type { Grade } from './colore';
import { CAMPIONI_CURVA, curveNeutre, tabellaCurve } from './curve';
import { validaLut } from './lut';

export const UNIFORM_COLORE = ['u_caLift', 'u_caGamma', 'u_caGain', 'u_caManuale', 'u_caCurve', 'u_caLut', 'u_caCurveOn', 'u_caIntensity', 'u_caSize', 'u_caMin', 'u_caMax'];
export const GLSL_COLORE = `
uniform vec3 u_caLift, u_caGamma, u_caGain;
uniform bool u_caManuale, u_caCurveOn;
uniform sampler2D u_caCurve;
uniform highp sampler3D u_caLut;
uniform float u_caIntensity, u_caSize;
uniform vec3 u_caMin, u_caMax;
float curva(float x, float r) {
  return texture(u_caCurve, vec2((clamp(x, 0.0, 1.0) * ${CAMPIONI_CURVA - 1}.0 + 0.5) / ${CAMPIONI_CURVA}.0, (r + 0.5) / 5.0)).r;
}
vec3 coloreAvanzato(vec3 rgb) {
  if (u_caManuale) {
    rgb = rgb * u_caGain + u_caLift * (1.0 - rgb);
    rgb = pow(max(rgb, 0.0), 1.0 / max(u_caGamma, vec3(0.1)));
  }
  if (u_caCurveOn) {
    rgb = vec3(curva(rgb.r, 0.0), curva(rgb.g, 0.0), curva(rgb.b, 0.0));
    rgb = vec3(curva(rgb.r, 1.0), curva(rgb.g, 2.0), curva(rgb.b, 3.0));
    float y = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float nuovo = curva(y, 4.0);
    rgb = y > 0.00001 ? rgb * (nuovo / y) : vec3(nuovo);
  }
  if (u_caIntensity > 0.0) {
    vec3 p = clamp((rgb - u_caMin) / (u_caMax - u_caMin), 0.0, 1.0);
    vec3 uvw = (p * (u_caSize - 1.0) + 0.5) / u_caSize;
    rgb = mix(rgb, texture(u_caLut, uvw).rgb, u_caIntensity);
  }
  return rgb;
}`;

type Tex = { tex: WebGLTexture; target: number };
export class ColoreGpu {
  private cache = new Map<string, Tex>();
  private usate = new Set<string>();
  /** Avvisi consultabili dall'host del pannello, oltre alla console. */
  readonly avvisi = new Set<string>();
  constructor(private gl: WebGL2RenderingContext) {}
  inizia() { this.usate.clear(); }
  finisce() {
    for (const [k, t] of this.cache) if (!this.usate.has(k)) { this.gl.deleteTexture(t.tex); this.cache.delete(k); }
  }
  distruggi() { for (const t of this.cache.values()) this.gl.deleteTexture(t.tex); this.cache.clear(); }

  private texture(k: string, target: number, w: number, h: number, d: number, data: Float32Array): WebGLTexture {
    this.usate.add(k);
    const gia = this.cache.get(k);
    if (gia) return gia.tex;
    const gl = this.gl, tex = gl.createTexture();
    if (!tex) throw new Error('Memoria video esaurita per il colore');
    const binding = gl.getParameter(target === gl.TEXTURE_3D ? gl.TEXTURE_BINDING_3D : gl.TEXTURE_BINDING_2D);
    const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL), pre = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    try {
      gl.bindTexture(target, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(target, p, gl.LINEAR);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, ...(d ? [gl.TEXTURE_WRAP_R] : [])]) gl.texParameteri(target, p, gl.CLAMP_TO_EDGE);
      if (d) gl.texImage3D(target, 0, gl.RGBA16F, w, h, d, 0, gl.RGBA, gl.FLOAT, data);
      else gl.texImage2D(target, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data);
      if (gl.getError() !== gl.NO_ERROR) {
        const msg = 'Colore: questa scheda usa LUT/curve a 8 bit; valori fuori 0–1 e precisione ridotti';
        if (!this.avvisi.has(msg)) { this.avvisi.add(msg); console.warn(msg); }
        const bytes = Uint8Array.from(data, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
        if (d) gl.texImage3D(target, 0, gl.RGBA8, w, h, d, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        else gl.texImage2D(target, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('La scheda video non riesce a caricare il colore');
      }
      this.cache.set(k, { tex, target });
      return tex;
    } catch (e) { gl.deleteTexture(tex); throw e; }
    finally { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pre); gl.bindTexture(target, binding); }
  }

  imposta(p: Project, g: Grade, u: Record<string, WebGLUniformLocation | null>, manuale: boolean) {
    const gl = this.gl, active = gl.getParameter(gl.ACTIVE_TEXTURE);
    const l = g.lut?.intensita ? p.luts?.find((l) => l.id === g.lut!.id) : undefined;
    if (g.lut && g.lut.intensita > 0 && !l) {
      const msg = 'LUT mancante: ricarica il file .cube dal pannello Colore avanzato';
      if (!this.avvisi.has(msg)) { this.avvisi.add(msg); console.warn(msg); }
    }
    gl.uniform1i(u.u_caManuale, manuale ? 1 : 0);
    gl.uniform3f(u.u_caLift, ...g.lift); gl.uniform3f(u.u_caGamma, ...g.gamma); gl.uniform3f(u.u_caGain, ...g.gain);
    gl.uniform1i(u.u_caCurve, 4); gl.uniform1i(u.u_caLut, 5);
    const curveOn = !curveNeutre(g.curve);
    gl.uniform1i(u.u_caCurveOn, curveOn ? 1 : 0);
    try {
      // Anche i sampler spenti hanno texture complete e unità distinte da sorgente/matte.
      gl.activeTexture(gl.TEXTURE4);
      const ck = 'curve:' + (curveOn ? JSON.stringify(g.curve) : 'identita');
      gl.bindTexture(gl.TEXTURE_2D, this.texture(ck, gl.TEXTURE_2D, CAMPIONI_CURVA, 5, 0, tabellaConCache(curveOn ? g.curve : undefined, ck)));
      gl.activeTexture(gl.TEXTURE5);
      const lut = l ?? LUT_IDENTITA;
      const k = 'lut:' + lut.hash;
      let tex = this.cache.get(k)?.tex;
      if (tex) this.usate.add(k);
      else {
        if (!validaLut(lut) || lut.n > gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) throw new Error('LUT non valida o troppo grande per questa scheda video');
        const rgba = new Float32Array(lut.n ** 3 * 4);
        for (let i = 0; i < lut.n ** 3; i++) {
          rgba[i * 4] = lut.dati[i * 3]; rgba[i * 4 + 1] = lut.dati[i * 3 + 1]; rgba[i * 4 + 2] = lut.dati[i * 3 + 2]; rgba[i * 4 + 3] = 1;
        }
        tex = this.texture(k, gl.TEXTURE_3D, lut.n, lut.n, lut.n, rgba);
      }
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.uniform1f(u.u_caIntensity, l ? Math.max(0, Math.min(1, g.lut!.intensita)) : 0);
      gl.uniform1f(u.u_caSize, lut.n); gl.uniform3f(u.u_caMin, ...lut.domainMin); gl.uniform3f(u.u_caMax, ...lut.domainMax);
    } finally { gl.activeTexture(active); }
  }
}
// La tabella CPU si costruisce solo quando cambiano i punti; cache limitata anche durante l'editing.
const tabelle = new Map<string, Float32Array>();
function tabellaConCache(curve: Grade['curve'], k: string) {
  let t = tabelle.get(k);
  if (!t) { t = tabellaCurve(curve); if (tabelle.size >= 16) tabelle.delete(tabelle.keys().next().value!); tabelle.set(k, t); }
  return t;
}
const LUT_IDENTITA: RisorsaLut = { id: '', hash: 'identita', nome: 'Identità', n: 2, domainMin: [0, 0, 0], domainMax: [1, 1, 1],
  dati: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1] };
