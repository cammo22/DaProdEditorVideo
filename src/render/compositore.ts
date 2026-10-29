// Il mixer video in WebGL2. Ogni strato si disegna nel suo buffer (trasformazioni, proc amp, chiave, look),
// poi si combina sull'uscita con la transizione e la trasparenza. Stesso codice per i monitor e per l'export.
import type { Clip, Project, Transition } from '../core/tipi';
import type { Strato, Sorgente } from './piano';
import type { VideoSample } from 'mediabunny';
import { fotogramma, type Fotogramma } from '../media/fotogrammi';
import { Interpolatore } from './fluido';

/** chi fornisce i fotogrammi esatti (l'export); senza, si usano quelli dei monitor */
export type Fornitore = (s: Sorgente) => Fotogramma | null;
import { autoColore, masterDi, mediaOf, tfAl } from '../core/progetto';
import { spostaTraccia } from '../core/traccia';
import { mediaRT } from '../media/libreria';
import { gradeClip, gradeDi, gradeNeutro } from './colore';
import { ColoreGpu, GLSL_COLORE, UNIFORM_COLORE } from './coloreGpu';
import { CAMPI_FX, MAX_CENSURE, statoEffetti, type StatoFx } from '../core/blocchi';
import { fxEffettivo } from '../core/effettiClip';
import { firmaMaschere, rasterizzaMaschere } from '../core/maschereForma';
import { coloriChiave, SPILL0 } from '../core/sfondo';
import { maschereAl } from '../media/maschere';
import { disegnaSovr, firmaSovr } from './sovrimpressione';
import { nuovaTela } from './grafica';
import { disegnaCountdown, motoTitolo, specAlTempo, telaTitolo } from './grafica';
import { disegnaAnimazione, firmaAnim } from './animazioni';
import { TITLE0 } from '../core/progetto';
import { anelliClic, DISEGNA_CLIC, UNIFORM_CLIC } from './cursore';

const VS_LAYER = `#version 300 es
in vec2 a_pos;
uniform vec2 u_res;        // dimensione del progetto in pixel
uniform vec2 u_size;       // dimensione mostrata della sorgente intera (dopo l'adattamento)
uniform vec4 u_crop;       // l, t, r, b in uv
uniform vec2 u_off;        // spostamento in pixel dal centro
uniform float u_scale, u_rot;
out vec2 v_uv;
void main() {
  vec2 uv = mix(u_crop.xy, vec2(1.0) - u_crop.zw, a_pos);
  vec2 p = (uv - 0.5) * u_size * u_scale;
  float c = cos(u_rot), s = sin(u_rot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + u_off;
  vec2 clip = p / (u_res * 0.5);
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = uv;
}`;

const FS_LAYER = `#version 300 es
precision highp float;
${UNIFORM_CLIC}
in vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_src;          // 0 texture, 1 barre SMPTE, 2 barre EBU, 3 colore pieno
uniform int u_orient;       // rotazione dei metadati: 0, 90, 180, 270
uniform vec3 u_color;
uniform float u_bright, u_contrast, u_sat, u_hue;
uniform int u_look;         // bit: 1 vhs, 2 pellicola, 4 b/n, 8 seppia, 16 crt (si sommano)
uniform float u_time;
uniform vec2 u_texel;
uniform int u_key;          // 0 no, 1 luma, 2 colori (green screen), 3 maschera dell'AI
uniform vec3 u_keyColor;    // il colore principale della chiave
uniform vec3 u_keyExtra[2]; // gli altri colori da togliere
uniform int u_keyN;         // quanti altri
uniform float u_keyLevel, u_keySoft;
uniform bool u_keyInv;
uniform float u_keySpill;   // quanto colore del fondale si toglie dai bordi
uniform float u_keyBordo;   // restringe (−) o allarga (+) il soggetto
uniform float u_keySfuma;   // sfuma il bordo
uniform float u_keyPulisci; // toglie puntini e buchi
uniform sampler2D u_matte, u_matte2;  // le maschere dell'AI (prima e dopo l'istante) e quanto verso la seconda
uniform float u_matteK;
uniform sampler2D u_forma;  // le maschere a forma della clip (rettangolo, ellisse, Bézier): copertura 0..1 in un canale solo
uniform bool u_formaOn;
uniform int u_vista;        // 0 normale, 1 si vede la maschera, 2 il soggetto sugli scacchi, 3 il contorno di quello che resta
uniform bool u_mirror;
uniform float u_temp, u_vignette;
uniform bool u_auto;          // colore automatico: livelli, bianco e luce misurati sulla ripresa
uniform vec3 u_autoLo, u_autoHi, u_autoWb;
uniform float u_autoK, u_autoGamma;
uniform float u_alpha;        // i titoli animati che compaiono e spariscono
uniform vec3 u_color2;        // colore pieno sfumato: il secondo colore
uniform bool u_grad;
uniform vec4 u_box;           // il rettangolo che si vede (l, t, r, b in uv): per gli angoli tondi e l'ombra
uniform vec2 u_boxPx;         // quanti pixel del progetto fa la sorgente intera
uniform float u_round, u_feather;
out vec4 o;

${GLSL_COLORE}
vec2 orient(vec2 uv) {
  if (u_orient == 90) return vec2(uv.y, 1.0 - uv.x);
  if (u_orient == 180) return vec2(1.0 - uv.x, 1.0 - uv.y);
  if (u_orient == 270) return vec2(1.0 - uv.y, uv.x);
  return uv;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 smpte(vec2 uv) {
  vec3 bars[7] = vec3[7](vec3(.75), vec3(.75,.75,0.), vec3(0.,.75,.75), vec3(0.,.75,0.), vec3(.75,0.,.75), vec3(.75,0.,0.), vec3(0.,0.,.75));
  int i = int(clamp(floor(uv.x * 7.0), 0.0, 6.0));
  if (uv.y < 0.67) return bars[i];
  if (uv.y < 0.75) {
    vec3 rev[7] = vec3[7](vec3(0.,0.,.75), vec3(.075), vec3(.75,0.,.75), vec3(.075), vec3(0.,.75,.75), vec3(.075), vec3(.75));
    return rev[i];
  }
  float x = uv.x * 7.0;
  if (x < 1.25) return vec3(0.0, 0.129, 0.298);       // -I
  if (x < 2.5) return vec3(1.0);                      // bianco 100%
  if (x < 3.75) return vec3(0.196, 0.0, 0.416);       // +Q
  if (x < 5.0) return vec3(0.075);
  if (x < 5.333) return vec3(0.035);                  // PLUGE: sotto il nero
  if (x < 5.666) return vec3(0.075);
  if (x < 6.0) return vec3(0.115);                    //        sopra il nero
  return vec3(0.075);
}
vec3 ebu(vec2 uv) {
  vec3 b[8] = vec3[8](vec3(1.), vec3(.75,.75,0.), vec3(0.,.75,.75), vec3(0.,.75,0.), vec3(.75,0.,.75), vec3(.75,0.,0.), vec3(0.,0.,.75), vec3(0.));
  return b[int(clamp(floor(uv.x * 8.0), 0.0, 7.0))];
}

vec4 src(vec2 uv) {
  if (u_src == 1) return vec4(smpte(uv), 1.0);
  if (u_src == 2) return vec4(ebu(uv), 1.0);
  if (u_src == 3) return vec4(u_grad ? mix(u_color, u_color2, clamp(uv.y * 0.75 + uv.x * 0.25, 0.0, 1.0)) : u_color, 1.0);
  return texture(u_tex, orient(uv));
}

// colore → (luce, blu-giallo, rosso-verde): la distanza dalla chiave si misura sul colore, poco sulla luce
vec3 yuv(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
float distChiave(vec3 rgb, vec3 kc) {
  vec3 a = yuv(rgb), k = yuv(kc);
  return distance(a.yz, k.yz) * 2.2 + abs(a.x - k.x) * 0.15;
}
// quanto un colore è "soggetto" (1) o "fondale" (0): il più vicino fra i colori scelti
float matteColori(vec3 rgb) {
  float d = distChiave(rgb, u_keyColor);
  if (u_keyN > 0) d = min(d, distChiave(rgb, u_keyExtra[0]));
  if (u_keyN > 1) d = min(d, distChiave(rgb, u_keyExtra[1]));
  float lo = max(0.0, u_keyLevel * 0.5 - u_keyBordo * 0.25);
  return smoothstep(lo, lo + u_keySoft + 0.001, d);
}
vec3 senzaRiflesso(vec3 rgb) {
  // toglie dai bordi il colore del fondale che rimbalza sul soggetto: la parte di colore che punta verso la chiave
  vec3 y = yuv(rgb), k = yuv(u_keyColor);
  vec2 kd = normalize(k.yz + vec2(1e-5));
  float len = length(y.yz);
  float ang = len > 1e-4 ? dot(y.yz / len, kd) : 0.0;
  float sp = max(0.0, dot(y.yz, kd));
  vec2 q = y.yz - kd * sp * smoothstep(0.35, 0.95, ang) * u_keySpill;
  return vec3(y.x + 1.402 * q.y, y.x - 0.344 * q.x - 0.714 * q.y, y.x + 1.772 * q.x);
}

void main() {
  vec2 uv0 = u_mirror ? vec2(1.0 - v_uv.x, v_uv.y) : v_uv;
  vec4 c = src(uv0);
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  vec3 rgbGrezzo = rgb;      // il colore com'è nella ripresa, prima di ogni ritocco: la chiave guarda questo
  float a = c.a;
  float aChiave = 1.0;
  if (u_auto) {
    vec3 lv = clamp((rgb - u_autoLo) / max(u_autoHi - u_autoLo, vec3(0.05)), 0.0, 1.0);
    lv = pow(lv * u_autoWb, vec3(u_autoGamma));
    rgb = mix(rgb, clamp(lv, 0.0, 1.0), u_autoK);
  }
  if ((u_look & 1) != 0) {
    // VHS: il colore scappa di lato, righe di tracking, rumore
    float wob = sin(v_uv.y * 180.0 + u_time * 3.0) * 0.0009 + (hash(vec2(floor(v_uv.y * 240.0), u_time)) - 0.5) * 0.0012;
    vec2 uvw = uv0 + vec2(wob, 0.0);
    vec3 cr = src(uvw + vec2(u_texel.x * 3.5, 0.0)).rgb;
    vec3 cb = src(uvw - vec2(u_texel.x * 3.5, 0.0)).rgb;
    vec3 cm = src(uvw).rgb;
    rgb = vec3(cr.r, cm.g, cb.b);
    float band = smoothstep(0.02, 0.0, abs(fract(v_uv.y * 0.6 - u_time * 0.07) - 0.95));
    rgb += band * 0.25 * hash(v_uv * 400.0 + u_time);
    rgb = mix(rgb, vec3(dot(rgb, vec3(.299,.587,.114))), -0.25);
    rgb += (hash(v_uv * vec2(640.0, 480.0) + u_time) - 0.5) * 0.07;
    rgb *= 0.94 + 0.06 * sin(v_uv.y * 900.0);
  }
  if ((u_look & 2) != 0) {
    // pellicola: grana, vignetta, tinta calda, sfarfallio
    float g = (hash(v_uv * 900.0 + fract(u_time * 7.13)) - 0.5) * 0.09;
    rgb = rgb * vec3(1.06, 1.0, 0.9) + g;
    vec2 d = v_uv - 0.5;
    rgb *= 1.0 - dot(d, d) * 0.9;
    rgb *= 0.97 + 0.03 * hash(vec2(u_time, 1.0));
  }
  if ((u_look & 4) != 0) {
    rgb = vec3(dot(rgb, vec3(.299, .587, .114)));
  }
  if ((u_look & 8) != 0) {
    float y = dot(rgb, vec3(.299, .587, .114));
    rgb = vec3(y * 1.07 + 0.05, y * 0.95 + 0.02, y * 0.75);
  }
  if ((u_look & 16) != 0) {
    // tubo catodico: righe, maschera RGB, bordi scuri
    float sl = 0.78 + 0.22 * sin(v_uv.y / u_texel.y * 3.14159);
    int m = int(mod(gl_FragCoord.x, 3.0));
    vec3 mask = m == 0 ? vec3(1.0, 0.8, 0.8) : m == 1 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0);
    rgb *= sl * mask * 1.15;
    vec2 d = v_uv - 0.5;
    rgb *= smoothstep(0.75, 0.35, length(d * vec2(1.0, 1.2)));
  }
  // proc amp (il TBC): nero, guadagno, croma, fase
  rgb = (rgb - 0.5) * u_contrast + 0.5 + u_bright;
  float Y = dot(rgb, vec3(0.299, 0.587, 0.114));
  float I = dot(rgb, vec3(0.596, -0.274, -0.322));
  float Q = dot(rgb, vec3(0.211, -0.523, 0.312));
  float h = radians(u_hue), ch = cos(h), sh = sin(h);
  vec2 iq = vec2(ch * I - sh * Q, sh * I + ch * Q) * u_sat;
  rgb = vec3(Y + 0.956 * iq.x + 0.621 * iq.y, Y - 0.272 * iq.x - 0.647 * iq.y, Y - 1.106 * iq.x + 1.703 * iq.y);
  if (u_temp != 0.0) rgb *= vec3(1.0 + u_temp * 0.18, 1.0 + u_temp * 0.02, 1.0 - u_temp * 0.2);
  rgb = coloreAvanzato(rgb);
  if (u_vignette > 0.0) { vec2 dv = v_uv - 0.5; rgb *= 1.0 - u_vignette * smoothstep(0.15, 0.6, dot(dv, dv) * 2.2); }
  rgb = clamp(rgb, 0.0, 1.0);
  // chiave
  if (u_key == 1) {
    float k = smoothstep(u_keyLevel - u_keySoft, u_keyLevel + u_keySoft, Y);
    aChiave = u_keyInv ? 1.0 - k : k;
  } else if (u_key == 2) {
    float k = matteColori(rgbGrezzo);
    if (u_keySfuma > 0.0) {
      // sfuma il bordo: la media della maschera su un anello attorno al punto
      float r = 1.0 + u_keySfuma * 5.0;
      float somma = k;
      for (int i = 0; i < 8; i++) {
        float an = float(i) * 0.785398;
        vec4 s = src(uv0 + vec2(cos(an), sin(an)) * u_texel * r);
        somma += matteColori(s.a > 0.0 ? s.rgb / s.a : vec3(0.0));
      }
      k = somma / 9.0;
    }
    if (u_keyPulisci > 0.0) k = clamp((k - u_keyPulisci * 0.4) / (1.0 - u_keyPulisci * 0.8), 0.0, 1.0);
    aChiave = u_keyInv ? 1.0 - k : k;
    if (u_keySpill > 0.0 && !u_keyInv) rgb = clamp(senzaRiflesso(rgb), 0.0, 1.0);
  } else if (u_key == 3) {
    float m = mix(texture(u_matte, uv0).r, texture(u_matte2, uv0).r, u_matteK);
    float soglia = 0.5 - u_keyBordo * 0.35;
    float mor = 0.03 + u_keySoft * 0.45;
    float k = smoothstep(soglia - mor, soglia + mor, m);
    aChiave = u_keyInv ? 1.0 - k : k;
  }
  ${DISEGNA_CLIC}
  a *= aChiave;
  // la passata con le maschere a forma: si moltiplica per la copertura (nessuna maschera = niente passata)
  if (u_formaOn) a *= texture(u_forma, uv0).r;
  // angoli tondi (e l'ombra, che è lo stesso rettangolo sfumato): distanza dal rettangolo arrotondato, in pixel
  if (u_round > 0.0 || u_feather > 0.0) {
    vec2 lo = u_box.xy * u_boxPx, hi = (vec2(1.0) - u_box.zw) * u_boxPx;
    vec2 q = abs(v_uv * u_boxPx - (lo + hi) * 0.5) - (hi - lo) * 0.5 + vec2(u_round);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_round;
    a *= 1.0 - smoothstep(-u_feather, u_feather, d);
  }
  a *= u_alpha;
  if (u_vista == 3 && u_key == 3) {
    // il contorno: dove la maschera cambia (a due pixel di distanza), colorato; fuori dalla maschera l'immagine è più scura
    vec2 d = u_texel * 3.0;
    float e1 = texture(u_matte, uv0 + vec2(d.x, 0.0)).r, e2 = texture(u_matte, uv0 - vec2(d.x, 0.0)).r;
    float e3 = texture(u_matte, uv0 + vec2(0.0, d.y)).r, e4 = texture(u_matte, uv0 - vec2(0.0, d.y)).r;
    float lo = min(min(e1, e2), min(e3, e4)), hi = max(max(e1, e2), max(e3, e4));
    float bordo = smoothstep(0.15, 0.6, hi - lo);
    o = vec4(mix(rgb * mix(0.4, 1.0, aChiave), vec3(1.0, 0.18, 0.58), bordo), 1.0);
    return;
  }
  if (u_vista == 1 && u_key != 0) { o = vec4(vec3(aChiave), 1.0); return; }
  if (u_vista == 2 && u_key != 0) {
    vec2 g = floor(gl_FragCoord.xy / 14.0);
    vec3 fondo = mix(vec3(0.16), vec3(0.30), mod(g.x + g.y, 2.0));
    o = vec4(rgb * a + fondo * (1.0 - a), 1.0);
    return;
  }
  o = vec4(rgb * a, a);
}`;

export const VS_FULL = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos; gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }`;

/** il colore finale su tutto il montaggio (pagina Finale): lift, gamma, gain, contrasto, saturazione,
 *  viraggio, vignetta e grana. A sinistra di u_split resta l'originale (il "prima" del prima/dopo). */
const FS_MASTER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec3 u_lift, u_gamma, u_gain, u_shadow, u_high;
uniform float u_sat, u_contrast, u_vignette, u_grain, u_time, u_split;
${GLSL_COLORE}
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 r = c;
  if (v_uv.x >= u_split) {
    r = c * u_gain + u_lift * (1.0 - c);
    r = pow(max(r, 0.0), 1.0 / max(u_gamma, vec3(0.1)));
    r = (r - 0.5) * u_contrast + 0.5;
    float y = dot(r, vec3(0.2126, 0.7152, 0.0722));
    r = mix(vec3(y), r, u_sat);
    r += u_shadow * (1.0 - smoothstep(0.0, 0.55, y)) + u_high * smoothstep(0.45, 1.0, y);
    r = coloreAvanzato(r);
    vec2 d = v_uv - 0.5;
    r *= 1.0 - u_vignette * smoothstep(0.12, 0.62, dot(d, d) * 2.0);
    if (u_grain > 0.0) r += (hash(v_uv * vec2(1280.0, 720.0) + fract(u_time * 7.13)) - 0.5) * u_grain;
  }
  if (u_split > 0.0 && abs(v_uv.x - u_split) < 0.0015) r = vec3(1.0, 0.84, 0.29);
  o = vec4(clamp(r, 0.0, 1.0), 1.0);
}`;

/** gli effetti a tempo dei blocchetti FX (lampo, scossa, zoom, glitch…) sulla loro traccia e su tutto quello sotto */
const FS_FX = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_res, u_off;
uniform float u_zoom, u_rot, u_blur, u_pixel, u_rgb, u_glitch, u_seme, u_desat, u_invert, u_flash, u_fade, u_luce, u_lucePh, u_bande, u_vhs, u_time;
uniform float u_bagliore, u_flare, u_flarePh, u_arco, u_arcoPh, u_espo, u_neon, u_onda, u_bolla, u_vortice, u_caleido, u_calore, u_zblur;
uniform float u_eco, u_duo, u_poster, u_solar, u_termico, u_visore, u_retino, u_muto, u_gocce, u_specchio, u_quadri, u_rullo, u_pesce;
uniform float u_raggi, u_bokeh, u_scint, u_anam, u_neve, u_pioggia, u_polvere, u_coriandoli;
uniform float u_olo, u_prisma, u_matita, u_tunnel, u_nebbia, u_braci, u_vetro, u_nosegn, u_iride, u_mini, u_esa, u_scan;
uniform float u_grana, u_semeGrana, u_nitido;
uniform float u_censura;
uniform int u_numCensure;
uniform vec4 u_censure[${MAX_CENSURE}]; // centro (y dal basso) e mezze dimensioni
uniform float u_morbidoCensure[${MAX_CENSURE}];
uniform vec3 u_flashCol, u_fadeCol, u_tinta;
uniform vec2 u_centro;   // il centro di zoom e distorsioni (lo sceglie chi posa l'effetto)
uniform vec2 u_sole;     // il sole del riflesso d'obiettivo (x < -1 = passa da solo)
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 campione(vec2 uv) {
  vec2 q = clamp(uv, vec2(0.0005), vec2(0.9995));
  vec3 originale = texture(u_src, q).rgb;
  if (u_censura <= 0.0 || u_numCensure == 0) return originale;
  float maschera = 0.0;
  for (int i = 0; i < ${MAX_CENSURE}; i++) {
    if (i >= u_numCensure) break;
    vec4 z = u_censure[i];
    vec2 d = abs(q - z.xy) - z.zw;
    // la morbidezza cresce FUORI dal riquadro: dentro è sempre mosaico pieno
    float sd = max(d.x, d.y);
    maschera = max(maschera, 1.0 - smoothstep(0.0, max(0.00001, u_morbidoCensure[i]), sd));
  }
  if (maschera <= 0.0) return originale;
  float lato = mix(0.008, 0.06, min(1.0, u_censura));
  vec2 cella = vec2(lato * u_res.y / u_res.x, lato);
  vec2 mosaico = clamp((floor(q / cella) + 0.5) * cella, vec2(0.0005), vec2(0.9995));
  return mix(originale, texture(u_src, mosaico).rgb, maschera);
}
vec3 tinta(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
// i colori sdoppiati (rosso e blu che scappano) valgono per ogni campione: così si sommano con sfocatura, neon e bagliore
float g_sp = 0.0;
vec3 camp(vec2 uv) {
  vec3 s = campione(uv);
  if (g_sp > 0.0) { s.r = campione(uv + vec2(g_sp, 0.0)).r; s.b = campione(uv - vec2(g_sp, 0.0)).b; }
  return s;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 caldo(float y) {
  vec3 c = mix(vec3(0.02, 0.0, 0.16), vec3(0.42, 0.0, 0.62), smoothstep(0.0, 0.25, y));
  c = mix(c, vec3(0.92, 0.1, 0.1), smoothstep(0.25, 0.5, y));
  c = mix(c, vec3(1.0, 0.76, 0.05), smoothstep(0.5, 0.75, y));
  return mix(c, vec3(1.0), smoothstep(0.78, 1.0, y));
}
// le particelle: strati di celle, ognuna con il suo granello che cade o fluttua
float fiocchi(vec2 st, float scala, float vel, float raggio) {
  vec2 g = st * scala;
  g.y += u_time * vel;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id), h2 = hash(id + 17.3);
  vec2 ctr = vec2(0.5 + sin(u_time * (0.7 + h1) + h2 * 6.28) * 0.28, 0.2 + 0.6 * h2);
  return step(0.4, h1) * smoothstep(raggio, raggio * 0.3, length(f - ctr));
}
float goccia(vec2 st, float scala, float vel) {
  vec2 s = vec2(st.x + st.y * 0.2, st.y);
  float colonna = floor(s.x * scala);
  float h = hash(vec2(colonna, 3.1));
  float yy = s.y * 1.4 + u_time * vel * (0.8 + 0.6 * h) + h * 9.0;
  float ciclo = floor(yy), ph = fract(yy);
  float c = step(0.55, hash(vec2(colonna, ciclo)));
  float fx = abs(fract(s.x * scala) - 0.5);
  return c * smoothstep(0.1, 0.0, fx) * pow(1.0 - ph, 5.0) * smoothstep(0.0, 0.04, ph);
}
float granello(vec2 st, float scala, float raggio, float seme) {
  vec2 g = st * scala + vec2(sin(u_time * 0.13 + seme), u_time * 0.06 + cos(u_time * 0.1 + seme));
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 3.3), h3 = hash(id + seme + 8.1);
  vec2 ctr = 0.5 + (vec2(h1, h2) - 0.5) * 0.6 + 0.08 * vec2(sin(u_time * 0.7 + h3 * 6.0), cos(u_time * 0.6 + h1 * 6.0));
  float tw = 0.45 + 0.55 * sin(u_time * (0.8 + h2) + h3 * 6.28);
  return step(0.35, h3) * tw * smoothstep(raggio, raggio * 0.2, length(f - ctr));
}
vec3 bokehStrato(vec2 st, float scala, float vel, float raggio, float seme) {
  vec2 g = st * scala + vec2(u_time * vel * 0.4, u_time * vel);
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 11.7), h3 = hash(id + seme + 5.3);
  vec2 ctr = 0.5 + (vec2(h1, h2) - 0.5) * 0.35;
  float d = length(f - ctr), r = raggio * (0.6 + 0.8 * h3);
  float disco = smoothstep(r, r * 0.88, d) * (0.4 + 0.6 * smoothstep(r * 0.55, r * 0.95, d));
  float tw = 0.5 + 0.5 * sin(u_time * (0.5 + h1) + h2 * 6.28);
  return u_tinta * disco * tw * step(0.5, h3);
}
vec3 scintStrato(vec2 st, float scala, float seme) {
  vec2 g = st * scala;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 3.7), h3 = hash(id + seme + 9.1);
  vec2 p = f - (0.5 + (vec2(h1, h2) - 0.5) * 0.6);
  float s = 0.05 + 0.05 * h2;
  float ph = fract(u_time * (0.25 + 0.4 * h3) + h1 * 3.0);
  float lampo = pow(sin(ph * 3.14159), 5.0);
  float core = exp(-dot(p, p) / (s * s * 0.06));
  float croce = exp(-abs(p.x) / (s * 0.05)) * exp(-abs(p.y) / (s * 1.8)) + exp(-abs(p.y) / (s * 0.05)) * exp(-abs(p.x) / (s * 1.8));
  return u_tinta * (core + croce * 0.55) * lampo * step(0.45, h3);
}
vec4 coriStrato(vec2 st, float scala, float vel, float seme) {
  vec2 g = st * scala;
  g.y += u_time * vel;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 7.7), h3 = hash(id + seme + 2.3);
  vec2 ctr = vec2(0.2 + 0.6 * h1 + 0.1 * sin(u_time * (1.0 + h2) * 2.0 + h3 * 6.0), 0.2 + 0.6 * h2);
  float a = u_time * (1.5 + 3.0 * h3) + h1 * 6.28;
  vec2 p = f - ctr;
  p = vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
  float w = 0.06 * abs(cos(u_time * (2.0 + 3.0 * h2) + h1 * 9.0)) + 0.008;
  float m = step(abs(p.x), 0.085) * step(abs(p.y), w) * step(0.3, h3);
  return vec4(tinta(h1) * (0.75 + 0.25 * h2) + 0.15, m);
}
float rum(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// le braci: puntini caldi che salgono e brillano
float brace(vec2 st, float scala, float vel, float seme) {
  vec2 g = st * scala;
  g.y -= u_time * vel;
  vec2 id = floor(g), f = fract(g);
  float h1 = hash(id + seme), h2 = hash(id + seme + 5.3), h3 = hash(id + seme + 9.7);
  vec2 ctr = vec2(0.5 + 0.3 * sin(u_time * (1.0 + h1) * 1.5 + h2 * 6.28), 0.3 + 0.4 * h2);
  float tw = 0.4 + 0.6 * sin(u_time * (3.0 + 4.0 * h2) + h3 * 6.28);
  return step(0.5, h3) * max(tw, 0.0) * smoothstep(0.12, 0.0, length(f - ctr));
}
void main() {
  float asp = u_res.x / u_res.y;
  // zoom e rotazione attorno al centro, poi lo spostamento (scossa, camera a mano)
  vec2 c = (v_uv - u_centro) * vec2(asp, 1.0);
  float cr = cos(u_rot), sr = sin(u_rot);
  c = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y) / u_zoom;
  // le distorsioni: tutte sulle coordinate, così si sommano fra loro e con lo zoom
  float rr = length(c);
  if (u_pesce > 0.0) c *= (1.0 + u_pesce * 0.55 * rr * rr) / (1.0 + u_pesce * 0.3);
  if (u_gocce > 0.0) c += c / max(rr, 1e-4) * sin(rr * 42.0 - u_time * 8.0) * 0.011 * u_gocce * exp(-rr * 1.6);
  rr = length(c);
  if (u_caleido > 0.0) {
    float seg = 6.2831853 / 6.0;
    float a = mod(atan(c.y, c.x) + u_time * 0.2, seg);
    a = abs(a - seg * 0.5);
    c = mix(c, vec2(cos(a), sin(a)) * rr, u_caleido);
  }
  if (u_vortice > 0.0) {
    float ang = u_vortice * 2.6 * max(0.0, 1.0 - rr * 1.4);
    c = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
  }
  // bolla (positiva) e pizzico (negativa): la stessa lente, un verso o l'altro
  if (u_bolla != 0.0) c *= 1.0 - u_bolla * 0.45 * (1.0 - smoothstep(0.0, 0.55, rr));
  vec2 uv = c / vec2(asp, 1.0) + u_centro + u_off;
  if (u_tunnel > 0.0) {
    // il tunnel: l'immagine dentro l'immagine, in una zoomata senza fine (le copie rientrano nella cornice)
    float sc = mix(1.0, 2.4, min(1.0, u_tunnel));
    vec2 tq = (uv - u_centro) * pow(sc, fract(u_time * 0.35));
    float tm = max(abs(tq.x), abs(tq.y));
    for (int i = 0; i < 8; i++) {
      if (tm > 0.5) { tq /= sc; tm /= sc; } else if (tm < 0.5 / sc) { tq *= sc; tm *= sc; }
    }
    uv = mix(uv, u_centro + tq, min(1.0, u_tunnel));
  }
  if (u_prisma > 0.0) {
    // schegge oblique che spostano ognuna un po' l'immagine
    vec2 pg = uv * vec2(asp, 1.0) * 6.0;
    pg = vec2(pg.x + pg.y * 0.5, pg.y);
    uv += (vec2(hash(floor(pg) + 1.7), hash(floor(pg) + 4.1)) - 0.5) * 0.07 * u_prisma;
  }
  if (u_vetro > 0.0) {
    vec2 cella = floor(uv * u_res / 4.0);
    uv += (vec2(hash(cella), hash(cella + 9.1)) - 0.5) * 0.02 * u_vetro + vec2(sin(uv.y * 90.0), sin(uv.x * 70.0)) * 0.003 * u_vetro;
  }
  if (u_quadri > 0.0) { vec2 m = uv * (1.0 + u_quadri); uv = 1.0 - abs(1.0 - mod(m, 2.0)); }
  if (u_specchio > 0.0) uv.x = mix(uv.x, min(uv.x, 1.0 - uv.x), min(1.0, u_specchio));
  float roll = 0.0;
  if (u_rullo > 0.0) { roll = fract(u_time * 0.8) * min(1.0, u_rullo); uv.y = mod(uv.y + roll, 1.0); }
  if (u_onda > 0.0) uv += vec2(sin(uv.y * 22.0 + u_time * 7.0) * 0.018, sin(uv.x * 16.0 + u_time * 5.0) * 0.01) * u_onda;
  if (u_calore > 0.0) uv += vec2(sin(uv.y * 70.0 + u_time * 13.0) + sin(uv.y * 31.0 - u_time * 9.0), cos(uv.x * 55.0 + u_time * 11.0)) * 0.0022 * u_calore;
  if (u_glitch > 0.0) {
    float riga = floor(uv.y * 28.0);
    if (hash(vec2(riga, u_seme)) > 1.0 - u_glitch * 0.55) uv.x += (hash(vec2(riga * 3.1, u_seme + 1.0)) - 0.5) * 0.18 * u_glitch;
  }
  if (u_vhs > 0.0) uv.x += sin(uv.y * 120.0 + u_time * 9.0) * 0.0025 * u_vhs + (hash(vec2(floor(uv.y * 200.0), u_time)) - 0.5) * 0.004 * u_vhs;
  if (u_pixel > 0.0) {
    float lato = mix(1.0, 80.0, u_pixel * u_pixel) / u_res.y;
    vec2 cella = vec2(lato / asp, lato);
    uv = (floor(uv / cella) + 0.5) * cella;
  }
  if (u_esa > 0.0) {
    // mosaico di esagoni
    float nn = mix(160.0, 14.0, min(1.0, u_esa));
    vec2 pe = uv * vec2(asp, 1.0) * nn;
    const vec2 szh = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(pe, pe - vec2(1.0, 1.5)) / szh.xyxy) + 0.5;
    vec4 hh = vec4(pe - hc.xy * szh, pe - (hc.zw + 0.5) * szh);
    vec2 idc = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? hc.xy : hc.zw + 0.5;
    uv = mix(uv, idc * szh / nn / vec2(asp, 1.0), min(1.0, u_esa * 4.0));
  }
  g_sp = u_rgb * 0.014 + u_glitch * 0.012 + u_vhs * 0.004 + u_prisma * 0.012 + u_olo * 0.003;
  vec3 col;
  if (u_blur > 0.0 || u_zblur > 0.0) {
    // sfocatura a disco (spirale d'oro) e scia verso il centro nello stesso giro: sfoca e zoom sfocato si sommano
    float r = u_blur * 0.035;
    col = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      vec2 pos = mix(uv, u_centro, fi / 23.0 * u_zblur * 0.22);
      col += camp(pos + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 24.0) * r * vec2(1.0 / asp, 1.0));
    }
    col /= 24.0;
  } else col = camp(uv);
  if (u_nitido > 0.0) {
    // unsharp mask: aggiunge solo il dettaglio, non sostituisce sfocatura/scia o RGB
    vec2 px = 1.0 / u_res;
    vec3 vicino = (camp(uv + vec2(px.x, 0.0)) + camp(uv - vec2(px.x, 0.0))
      + camp(uv + vec2(0.0, px.y)) + camp(uv - vec2(0.0, px.y))) * 0.25;
    col += clamp(camp(uv) - vicino, vec3(-0.2), vec3(0.2)) * u_nitido;
  }
  if (u_eco > 0.0) {
    // l'eco: due copie sfasate che rincorrono l'immagine
    vec3 g1 = camp(uv - vec2(0.02, 0.012) * u_eco), g2 = camp(uv - vec2(0.045, 0.026) * u_eco);
    col = mix(col, col * 0.55 + g1 * 0.3 + g2 * 0.15, min(1.0, u_eco));
  }
  if (u_neon > 0.0) {
    // i contorni: dove la luce cambia di colpo si accende il tubo, il resto si spegne
    vec2 px = 1.5 / u_res;
    float l = dot(camp(uv + vec2(px.x, 0.0)) - camp(uv - vec2(px.x, 0.0)), vec3(0.33));
    float m = dot(camp(uv + vec2(0.0, px.y)) - camp(uv - vec2(0.0, px.y)), vec3(0.33));
    float bordo = clamp(length(vec2(l, m)) * 5.0, 0.0, 1.0);
    vec3 luceNeon = tinta(fract(uv.x * 0.6 + uv.y * 0.3 + u_time * 0.15)) * bordo * 2.2;
    col = mix(col, col * 0.18 + luceNeon, u_neon);
  }
  if (u_bagliore > 0.0) {
    // le parti chiare si allargano (il bloom delle lenti)
    vec3 g = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec3 s = camp(uv + vec2(cos(a), sin(a)) * 0.022 * vec2(1.0 / asp, 1.0));
      g += max(s - 0.5, 0.0);
    }
    col += g / 12.0 * 2.2 * u_bagliore + col * 0.08 * u_bagliore;
  }
  if (u_anam > 0.0) {
    // le luci forti si allungano di lato in strisce azzurre (la lente anamorfica)
    vec3 st = vec3(0.0);
    for (int i = -10; i <= 10; i++) {
      float w = 1.0 - abs(float(i)) / 11.0;
      st += max(camp(uv + vec2(float(i) * 0.011, 0.0)) - 0.55, 0.0) * w;
    }
    col += st / 5.0 * vec3(0.3, 0.55, 1.0) * u_anam * 3.0;
  }
  if (u_raggi > 0.0) {
    // i raggi di luce: le parti chiare si stirano verso fuori dal punto scelto
    vec3 g = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float t = float(i) / 19.0;
      g += max(camp(mix(uv, u_centro, t * 0.55)) - 0.72, 0.0) * (1.0 - t);
    }
    col += g / 8.0 * vec3(1.0, 0.86, 0.6) * u_raggi * 2.4;
  }
  col *= 1.0 + u_espo;
  float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(y), u_desat);
  col = mix(col, 1.0 - col, u_invert);
  // il colore: ognuno rifà i colori a modo suo, e si sommano l'uno sull'altro nell'ordine in cui sono scritti
  if (u_solar > 0.0) col = mix(col, mix(col, 1.0 - col, smoothstep(0.42, 0.58, col)), min(1.0, u_solar));
  if (u_termico > 0.0) col = mix(col, caldo(luma(col)), min(1.0, u_termico));
  if (u_duo > 0.0) {
    float yy = luma(col);
    vec3 d = mix(u_tinta * 0.12, mix(u_tinta, vec3(1.0), 0.8), smoothstep(0.05, 0.95, yy));
    col = mix(col, d, min(1.0, u_duo));
  }
  if (u_poster > 0.0) {
    float n = mix(24.0, 4.0, min(1.0, u_poster));
    col = mix(col, floor(col * n + 0.5) / n, min(1.0, u_poster));
  }
  if (u_visore > 0.0) {
    float yy = pow(clamp(luma(col) * 1.5, 0.0, 1.0), 0.8);
    float n = (hash(v_uv * vec2(900.0, 600.0) + fract(u_time * 13.7)) - 0.5) * 0.28;
    float sl = 0.86 + 0.14 * sin(v_uv.y * u_res.y * 1.4);
    vec3 g = vec3(0.1, 1.0, 0.28) * (yy + n) * sl;
    g *= smoothstep(1.0, 0.4, length((v_uv - 0.5) * vec2(asp * 0.75, 1.0)));
    col = mix(col, g, min(1.0, u_visore));
  }
  if (u_retino > 0.0) {
    // il retino: puntini più grossi dove è scuro, su carta chiara
    vec2 gp = v_uv * vec2(asp, 1.0) * 80.0;
    vec2 cella = fract(gp) - 0.5;
    float yy = luma(col);
    float r = sqrt(clamp(1.0 - yy, 0.0, 1.0)) * 0.7;
    float punto = smoothstep(r, r - 0.14, length(cella));
    vec3 pop = mix(vec3(0.98, 0.95, 0.88), clamp(col * 1.15, 0.0, 1.0) * 0.85, punto);
    col = mix(col, pop, min(1.0, u_retino));
  }
  if (u_muto > 0.0) {
    // il film muto: bianco e nero caldo, sfarfallio, graffi verticali, polvere, bordi scuri
    float yy = luma(col);
    vec3 s = vec3(yy * 1.05 + 0.04, yy * 0.96 + 0.02, yy * 0.8);
    float fotogramma = floor(u_time * 12.0);
    s *= 0.9 + 0.1 * hash(vec2(fotogramma, 1.0));
    s += step(0.996, hash(vec2(floor(v_uv.x * 260.0), fotogramma))) * 0.35;
    s += step(0.9985, hash(floor(v_uv * vec2(160.0, 90.0)) + fotogramma)) * 0.5;
    s += (hash(v_uv * vec2(700.0, 500.0) + fract(u_time * 9.0)) - 0.5) * 0.08;
    s *= smoothstep(0.95, 0.35, length((v_uv - 0.5) * vec2(1.2, 1.0)));
    col = mix(col, s, min(1.0, u_muto));
  }
  if (u_olo > 0.0) {
    // l'ologramma: azzurro, righe che scorrono, sfarfallio e una banda luminosa
    float yy = luma(col);
    float righe = 0.72 + 0.28 * sin(v_uv.y * u_res.y * 0.8 - u_time * 5.0);
    float trem = 0.88 + 0.12 * hash(vec2(floor(u_time * 20.0), 3.0));
    vec3 hol = vec3(0.25, 0.85, 1.0) * (yy * 1.25 + 0.06) * righe * trem;
    hol += vec3(0.4, 0.9, 1.0) * smoothstep(0.03, 0.0, abs(fract(v_uv.y * 0.5 - u_time * 0.2) - 0.5)) * 0.25;
    col = mix(col, hol, min(1.0, u_olo));
  }
  if (u_matita > 0.0) {
    // lo schizzo: contorni scuri, tratteggio nelle ombre, carta con la grana
    vec2 px = 1.3 / u_res;
    float gx = luma(camp(uv + vec2(px.x, 0.0))) - luma(camp(uv - vec2(px.x, 0.0)));
    float gy = luma(camp(uv + vec2(0.0, px.y))) - luma(camp(uv - vec2(0.0, px.y)));
    float bordo = clamp(length(vec2(gx, gy)) * 7.0, 0.0, 1.0);
    float yy = luma(col);
    float tratti = step(0.5, fract((v_uv.x * asp + v_uv.y) * u_res.y * 0.06 + hash(floor(v_uv * u_res / 6.0)) * 0.3)) * smoothstep(0.55, 0.15, yy) * 0.55;
    vec3 carta = vec3(0.96, 0.94, 0.88) + (hash(v_uv * u_res) - 0.5) * 0.06;
    vec3 sk = carta * (1.0 - clamp(bordo + tratti, 0.0, 1.0) * 0.82);
    col = mix(col, sk * mix(vec3(1.0), col * 1.5, 0.18), min(1.0, u_matita));
  }
  if (u_mini > 0.0) {
    // la miniatura: fuoco solo in una fascia (attorno al centro), fuori sfocato, e colori più pieni
    float dist = abs(v_uv.y - u_centro.y);
    float r = smoothstep(0.08, 0.34, dist) * 0.03 * u_mini;
    vec3 bl = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      bl += camp(uv + vec2(cos(a), sin(a)) * r * vec2(1.0 / asp, 1.0));
    }
    col = mix(col, bl / 12.0, smoothstep(0.0, 0.004, r));
    col = mix(vec3(luma(col)), col, 1.0 + 0.5 * min(1.0, u_mini));
  }
  if (u_rullo > 0.0) col *= 1.0 - 0.85 * smoothstep(0.045, 0.0, abs(v_uv.y - (1.0 - roll))) * min(1.0, u_rullo);
  if (u_vhs > 0.0) {
    col += (hash(v_uv * vec2(640.0, 480.0) + u_time) - 0.5) * 0.12 * u_vhs;
    col += smoothstep(0.03, 0.0, abs(fract(v_uv.y * 0.7 - u_time * 0.35) - 0.9)) * 0.35 * u_vhs;
  }
  if (u_luce > 0.0) {
    // la lama di luce calda che attraversa il quadro
    float x = v_uv.x + (v_uv.y - 0.5) * 0.35;
    float lama = exp(-pow((x - mix(-0.2, 1.2, u_lucePh)) * 3.2, 2.0));
    col += vec3(1.0, 0.55, 0.2) * lama * u_luce * 0.9 + vec3(1.0, 0.85, 0.6) * pow(lama, 3.0) * u_luce * 0.5;
  }
  if (u_arco > 0.0) {
    // la scia di colori che attraversa in diagonale (come la luce che entra dalla pellicola)
    float d = v_uv.x * 0.8 + (1.0 - v_uv.y) * 0.45 - mix(-0.3, 1.5, u_arcoPh);
    float banda = exp(-d * d * 7.0);
    vec3 arco = tinta(fract(d * 1.3 + 0.1));
    col = 1.0 - (1.0 - col) * (1.0 - arco * banda * u_arco * 0.75);
  }
  if (u_flare > 0.0) {
    // il riflesso d'obiettivo: la sorgente che passa in alto, la striscia orizzontale e gli aloni verso il centro
    vec2 sole = u_sole.x < -1.0 ? vec2(mix(-0.1, 1.1, u_flarePh), 0.28) : u_sole;
    vec2 d = (v_uv - vec2(sole.x, 1.0 - sole.y)) * vec2(asp, 1.0);
    vec3 fl = vec3(1.0, 0.92, 0.75) * exp(-dot(d, d) * 60.0) * 1.4 + vec3(1.0, 0.8, 0.55) * exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 1.8) * 0.55;
    for (int i = 1; i <= 3; i++) {
      vec2 g = mix(vec2(sole.x, 1.0 - sole.y), vec2(0.5), 0.5 + float(i) * 0.45);
      vec2 dg = (v_uv - g) * vec2(asp, 1.0);
      float an = smoothstep(0.08 * float(i), 0.07 * float(i), length(dg)) * 0.12;
      fl += tinta(0.08 * float(i) + 0.5) * an;
    }
    col += fl * u_flare;
  }
  // le particelle e le luci che fluttuano stanno sopra l'immagine (e sotto i lampi e le dissolvenze)
  vec2 st = v_uv * vec2(asp, 1.0);
  if (u_bokeh > 0.0) col += (bokehStrato(st, 2.0, 0.04, 0.3, 0.0) + bokehStrato(st, 3.2, 0.06, 0.26, 4.0) + bokehStrato(st, 5.0, 0.09, 0.22, 9.0)) * 0.55 * min(1.5, u_bokeh);
  if (u_scint > 0.0) col += (scintStrato(st, 4.0, 0.0) + scintStrato(st, 7.0, 5.0) + scintStrato(st, 11.0, 12.0)) * min(1.5, u_scint);
  if (u_polvere > 0.0) col += vec3(1.0, 0.95, 0.8) * (granello(st, 10.0, 0.07, 0.0) + granello(st, 17.0, 0.055, 3.0) + granello(st, 26.0, 0.04, 7.0)) * 1.6 * min(1.5, u_polvere);
  if (u_neve > 0.0) {
    float fl = fiocchi(st, 7.0, 0.35, 0.22) + fiocchi(st + 3.1, 13.0, 0.55, 0.17) + fiocchi(st + 7.7, 22.0, 0.8, 0.12);
    col = mix(col, vec3(1.0), clamp(fl, 0.0, 1.0) * min(1.0, u_neve) * 0.95);
  }
  if (u_pioggia > 0.0) {
    float pi = goccia(st, 55.0, 1.6) + goccia(st + 2.3, 85.0, 2.1) + goccia(st + 5.1, 120.0, 2.7);
    col *= 1.0 - 0.14 * min(1.0, u_pioggia);
    col = mix(col, vec3(0.85, 0.9, 1.0), clamp(pi * 2.2, 0.0, 1.0) * min(1.0, u_pioggia) * 0.8);
  }
  if (u_coriandoli > 0.0) {
    for (int i = 0; i < 3; i++) {
      vec4 k = coriStrato(st + float(i) * 3.7, 6.0 + float(i) * 4.0, 0.5 + float(i) * 0.25, float(i) * 5.0);
      col = mix(col, k.rgb, k.a * min(1.0, u_coriandoli));
    }
  }
  if (u_nebbia > 0.0) {
    float nn = 0.0, am = 0.5;
    vec2 z = st * 2.2 + vec2(u_time * 0.04, 0.0);
    for (int i = 0; i < 5; i++) { nn += am * rum(z); z *= 2.0; am *= 0.5; }
    float dens = clamp((nn - 0.28) * 1.7, 0.0, 1.0) * min(1.0, u_nebbia) * (1.0 - v_uv.y * 0.4);
    col = mix(col, vec3(0.8, 0.84, 0.88), dens * 0.8);
  }
  if (u_braci > 0.0) {
    float br = brace(st, 9.0, 0.5, 0.0) + brace(st + 3.7, 15.0, 0.75, 4.0) + brace(st + 8.1, 24.0, 1.0, 9.0);
    col += (vec3(1.0, 0.5, 0.1) * br * 1.6 + vec3(1.0, 0.35, 0.05) * pow(1.0 - v_uv.y, 4.0) * 0.3) * min(1.5, u_braci);
  }
  if (u_scan > 0.0) {
    float d = v_uv.y - fract(u_time * 0.5);
    col += vec3(0.4, 1.0, 0.85) * (exp(-abs(d) * 55.0) * 0.9 + step(d, 0.0) * exp(d * 5.0) * 0.12) * min(1.0, u_scan);
  }
  if (u_nosegn > 0.0) {
    // il segnale che non prende: barre e neve, a scatti
    float fase = floor(u_time * 15.0);
    float bb = floor(v_uv.x * 7.0);
    vec3 barre = vec3(step(0.5, float(bb == 0.0 || bb == 1.0 || bb == 4.0 || bb == 5.0)), step(0.5, float(bb < 4.0)), step(0.5, float(bb == 0.0 || bb == 2.0 || bb == 4.0 || bb == 6.0)));
    float nv = hash(floor(v_uv * vec2(320.0, 180.0)) + fase);
    vec3 sig = mix(barre * 0.8, vec3(nv), 0.45);
    col = mix(col, sig, smoothstep(0.3, 0.7, min(1.0, u_nosegn) * (0.55 + 0.45 * hash(vec2(fase, 1.0)))));
  }
  if (u_grana > 0.0) {
    // griglia fissa del progetto, non della preview: il ridimensionamento non cambia il seme
    float g = hash(floor(v_uv * vec2(1920.0, 1080.0)) + vec2(mod(u_semeGrana, 65536.0), 17.0));
    col += (g - 0.5) * 0.12 * u_grana;
  }
  col = mix(col, u_flashCol, u_flash);
  col = mix(col, u_fadeCol, u_fade);
  if (u_iride > 0.0) {
    // l'iride: fuori dal cerchio è nero
    float rd = length((v_uv - u_centro) * vec2(asp, 1.0));
    float ir = (1.0 - min(1.0, u_iride)) * length(vec2(asp, 1.0) * 0.5 + abs(u_centro - 0.5) * vec2(asp, 1.0)) * 1.05;
    col *= 1.0 - smoothstep(ir - 0.01, ir, rd);
  }
  if (u_bande > 0.0) {
    float b = u_bande * max(0.0, (1.0 - asp / 2.39) * 0.5);
    if (v_uv.y < b || v_uv.y > 1.0 - b) col = vec3(0.0);
  }
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export const FS_COMBINE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_a, u_b;
uniform bool u_hasA;
uniform int u_mode;        // 0 solo B, 1 mix, 2 tendina, 3 passaggio a colore, 4 effetto digitale
uniform float u_p, u_opacity, u_soft, u_border, u_aspect;
uniform int u_pattern;
uniform bool u_reverse;
uniform vec3 u_borderColor, u_dipColor;
uniform int u_dir;         // effetti digitali: la direzione, in quarti di giro
uniform float u_forza;     // effetti digitali: quanto è forte (scia, onda, sfocatura…)
uniform int u_curva;       // come corre: 0 come vuole l'effetto, 1 dolce, 2 parte piano, 3 arriva piano
out vec4 o;
float asp = 1.0;           // il rapporto del quadro (girato con la direzione)
float P = 0.0;             // l'avanzamento, dopo la curva

// q: coordinate dello schermo, 0..1 con y verso il basso. Fuori dal quadro = trasparente.
bool fuori(vec2 q) { return q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0; }
// la direzione: l'effetto gira di quarti di giro attorno al centro, le immagini restano dritte
vec2 gira(vec2 q, int d) {
  vec2 v = q - 0.5;
  if (d == 1) v = vec2(-v.y, v.x); else if (d == 2) v = -v; else if (d == 3) v = vec2(v.y, -v.x);
  return v + 0.5;
}
vec4 tA(vec2 q) { vec2 r = gira(q, u_dir); return (!u_hasA || fuori(r)) ? vec4(0.0) : texture(u_a, vec2(r.x, 1.0 - r.y)); }
vec4 tB(vec2 q) { vec2 r = gira(q, u_dir); return fuori(r) ? vec4(0.0) : texture(u_b, vec2(r.x, 1.0 - r.y)); }
vec4 sopra(vec4 b, vec4 a) { return b + a * (1.0 - b.a); }
float caso(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float dolce(float t) { return t * t * (3.0 - 2.0 * t); }
// il rumore morbido (per l'inchiostro): valori a caso sulla griglia, sfumati in mezzo
float rumoreV(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = caso(i.x + i.y * 57.0), b = caso(i.x + 1.0 + i.y * 57.0);
  float c = caso(i.x + (i.y + 1.0) * 57.0), d = caso(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// la palla che cade e rimbalza (0 in alto, 1 a terra)
float rimbalzo(float x) {
  float n1 = 7.5625, d1 = 2.75;
  if (x < 1.0 / d1) return n1 * x * x;
  if (x < 2.0 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
  if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

float campo(vec2 uv) {
  vec2 c = uv - 0.5;
  if (u_pattern == 1) return uv.x;
  if (u_pattern == 2) return uv.y;
  if (u_pattern == 3) return max(uv.x, uv.y);
  if (u_pattern == 4) return max(1.0 - uv.x, uv.y);
  if (u_pattern == 21) return abs(c.x) * 2.0;
  if (u_pattern == 22) return abs(c.y) * 2.0;
  if (u_pattern == 41) return (uv.x + uv.y) * 0.5;
  if (u_pattern == 42) return (uv.x + 1.0 - uv.y) * 0.5;
  if (u_pattern == 61) return uv.x * 0.7 + abs(uv.y - 0.5) * 0.6;
  if (u_pattern == 62) return uv.x * 0.7 + (0.5 - abs(uv.y - 0.5)) * 0.6;
  if (u_pattern == 103) return min(abs(c.x), abs(c.y)) * 2.0;
  if (u_pattern == 122) return uv.x * 0.88 + (sin(uv.y * 12.0) * 0.5 + 0.5) * 0.12;
  if (u_pattern == 123) return uv.x * 0.85 + abs(fract(uv.y * 8.0) - 0.5) * 0.3;
  if (u_pattern == 202) return fract(fract(atan(c.x, -c.y) / 6.2831853 + 1.0) * 3.0);
  if (u_pattern == 101) return max(abs(c.x), abs(c.y)) * 2.0;
  if (u_pattern == 102) return abs(c.x) + abs(c.y);
  if (u_pattern == 119) return length(c * vec2(asp, 1.0)) / length(vec2(asp, 1.0) * 0.5);
  if (u_pattern == 201) return fract(atan(c.x, -c.y) / 6.2831853 + 1.0);
  if (u_pattern == 7) return fract((uv.x * 8.0)) ; // veneziana
  return uv.x;
}

// forme per le tendine a sagoma: distanza con segno (negativa dentro), di Inigo Quilez
float sdStella(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float d2(vec2 v) { return dot(v, v); }
float sdCuore(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(d2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(d2(p - vec2(0.0, 1.0)), d2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

vec4 tendina(vec2 q, vec4 A, vec4 B) {
  float s = max(u_soft, 0.0005);
  if (u_pattern == 120 || u_pattern == 121) {
    // la sagoma cresce dal centro fino a coprire tutto il quadro
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    c.y = -c.y;
    float mezzaDiag = length(vec2(asp, 1.0) * 0.5);
    float k = u_reverse ? 1.0 - P : P;
    float d;
    if (u_pattern == 120) { float r = k * mezzaDiag * 3.4 + 0.0001; d = sdStella(c, r, 0.45); }
    else { float sc = k * mezzaDiag * 4.2 + 0.0001; d = sdCuore(c / sc + vec2(0.0, 0.5)) * sc; }
    float m = 1.0 - smoothstep(-s * 0.5, s * 0.5, d);
    if (u_reverse) m = 1.0 - m;
    vec4 r = mix(A, B, m);
    if (u_border > 0.0) {
      float bm = smoothstep(-s * 0.5, s * 0.5, d) * (1.0 - smoothstep(u_border * 0.6 - s * 0.5, u_border * 0.6 + s * 0.5, d));
      r = mix(r, vec4(u_borderColor, 1.0), bm * step(0.001, P) * step(P, 0.999));
    }
    return r;
  }
  float f = campo(q);
  if (u_reverse) f = 1.0 - f;
  float e = P * (1.0 + 2.0 * s + u_border) - s - u_border;
  float m = 1.0 - smoothstep(e - s, e, f);
  vec4 r = mix(A, B, m);
  if (u_border > 0.0) {
    float bm = smoothstep(e - s, e, f) * (1.0 - smoothstep(e + u_border - s, e + u_border, f));
    r = mix(r, vec4(u_borderColor, 1.0), bm);
  }
  return r;
}

// un piano (la faccia di un cubo o una cartolina) visto da un occhio davanti allo schermo
vec2 ruotaY(vec2 xz, float a) { float c = cos(a), s = sin(a); return vec2(c * xz.x - s * xz.y, s * xz.x + c * xz.y); }

// celle a caso (Voronoi): ritorna il centro del pezzo più vicino (in coordinate della griglia) e il suo numero
vec4 pezzo(vec2 g) {
  vec2 id = floor(g), f = fract(g);
  float best = 9.0;
  vec4 r = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 nb = vec2(float(i), float(j));
    vec2 pt = nb + vec2(caso(dot(id + nb, vec2(3.1, 7.3))), caso(dot(id + nb, vec2(5.7, 2.9))));
    float d = length(pt - f);
    if (d < best) { best = d; r = vec4(id + pt, id + nb); }
  }
  return r;
}

vec4 effetto(vec2 q, float p) {
  float e = dolce(p);
  float arco = sin(p * 3.14159265) * min(u_forza, 1.6);
  if (u_pattern == 301) return q.x < 1.0 - e ? tA(q + vec2(e, 0.0)) : tB(q - vec2(1.0 - e, 0.0));
  if (u_pattern == 302) return q.x > e ? tA(q - vec2(e, 0.0)) : tB(q + vec2(1.0 - e, 0.0));
  if (u_pattern == 303) return q.y < 1.0 - e ? tA(q + vec2(0.0, e)) : tB(q - vec2(0.0, 1.0 - e));
  if (u_pattern == 304) return q.y > e ? tA(q - vec2(0.0, e)) : tB(q + vec2(0.0, 1.0 - e));
  if (u_pattern == 311) return q.x >= 1.0 - e ? sopra(tB(q - vec2(1.0 - e, 0.0)), tA(q)) : tA(q);
  if (u_pattern == 321) {
    vec2 c = q - 0.5;
    float sa = 1.0 + e * 1.6, sb = 1.0 + (1.0 - e) * 1.6;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 10; i++) {
      float k = float(i) / 9.0 * arco * 0.35;
      a += tA(0.5 + c / (sa + k));
      b += tB(0.5 + c / (sb + k));
    }
    return mix(a / 10.0, b / 10.0, smoothstep(0.4, 0.6, p));
  }
  if (u_pattern == 331) {
    float lato = mix(0.0015, 0.075, 1.0 - abs(2.0 * p - 1.0));
    vec2 cella = vec2(lato / asp, lato);
    vec2 qq = (floor(q / cella) + 0.5) * cella;
    return mix(tA(qq), tB(qq), smoothstep(0.45, 0.55, p));
  }
  if (u_pattern == 341) {
    vec2 d = q - 0.5;
    float r = length(d * vec2(asp, 1.0));
    vec2 w = d / max(r, 1e-4) * sin(r * 42.0 - p * 32.0) * arco * 0.028;
    return mix(tA(q + w), tB(q + w), smoothstep(0.3, 0.7, p));
  }
  if (u_pattern == 351) {
    vec4 m = mix(tA(q), tB(q), smoothstep(0.45, 0.55, p));
    return mix(m, vec4(1.0), pow(arco, 3.0));
  }
  if (u_pattern == 361) {
    vec4 m = mix(tA(q), tB(q), smoothstep(0.35, 0.65, p));
    float n = sin(q.x * 6.0 + p * 9.0) * 0.5 + sin(q.y * 9.0 - p * 7.0 + q.x * 3.0) * 0.5;
    float fronte = smoothstep(0.0, 1.0, (q.x * 0.9 + n * 0.22 + 0.25 - (1.0 - p) * 1.3) * 2.2);
    float l = arco * fronte * 1.5;
    vec3 luce = vec3(1.0, 0.55, 0.18) * l + vec3(1.0, 0.92, 0.7) * pow(l, 4.0);
    return vec4(min(vec3(1.0), m.rgb + luce), max(m.a, min(1.0, l)));
  }
  if (u_pattern == 371) {
    float fase = floor(p * 18.0);
    float riga = floor(q.y * 26.0);
    float h = caso(riga * 13.7 + fase * 7.3);
    float sh = (h - 0.5) * 0.25 * arco * step(0.55, caso(riga + fase * 1.7));
    vec2 qq = q + vec2(sh, 0.0);
    float sw = step(caso(fase * 3.1 + riga * 0.7), p);
    float rs = 0.014 * arco;
    vec4 base = mix(tA(qq), tB(qq), sw);
    vec4 r1 = mix(tA(qq + vec2(rs, 0.0)), tB(qq + vec2(rs, 0.0)), sw);
    vec4 b1 = mix(tA(qq - vec2(rs, 0.0)), tB(qq - vec2(rs, 0.0)), sw);
    return vec4(r1.r, base.g, b1.b, base.a);
  }
  if (u_pattern == 381) {
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float ang = arco * 3.0 * max(0.0, 1.0 - length(c) * 1.2);
    vec2 r = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y) / vec2(asp, 1.0) + 0.5;
    return mix(tA(r), tB(r), smoothstep(0.35, 0.65, p));
  }
  if (u_pattern == 391) {
    float rad = arco * 0.028;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
      vec2 d = vec2(float(i), float(j)) * rad / 3.0 * vec2(1.0 / asp, 1.0);
      a += tA(q + d);
      b += tB(q + d);
    }
    return mix(a / 49.0, b / 49.0, smoothstep(0.3, 0.7, p));
  }
  if (u_pattern == 421) {
    // zoom sfocato: si entra nella vecchia con la scia, si esce dalla nuova
    vec2 c = q - 0.5;
    vec4 a = vec4(0.0), b = vec4(0.0);
    float sa = 1.0 + e * 2.0, sb = 1.0 + (1.0 - e) * 0.6;
    for (int i = 0; i < 14; i++) {
      float k = float(i) / 13.0 * arco * 0.5;
      a += tA(0.5 + c / (sa + k));
      b += tB(0.5 + c / (sb + k));
    }
    return mix(a / 14.0, b / 14.0, smoothstep(0.42, 0.58, p));
  }
  if (u_pattern == 431) {
    // frusta: la camera gira di scatto, tutto striscia di lato
    float sh = e;
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      float k = (float(i) / 15.0 - 0.5) * arco * 0.35;
      a += tA(q + vec2(sh + k, 0.0));
      b += tB(q - vec2(1.0 - sh - k, 0.0));
    }
    return q.x < 1.0 - sh ? a / 16.0 : b / 16.0;
  }
  if (u_pattern == 441) {
    // rotazione: la vecchia gira e si rimpicciolisce, la nuova arriva girando
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float ang = e * 6.2831853;
    float s1 = mix(1.0, 3.0, e), s2 = mix(3.0, 1.0, e);
    vec2 ra = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
    vec2 qa = ra * s1 / vec2(asp, 1.0) + 0.5, qb = ra * s2 / vec2(asp, 1.0) + 0.5;
    return mix(tA(qa), tB(qb), smoothstep(0.4, 0.6, p));
  }
  if (u_pattern == 451) {
    // lama di luce: una striscia bianca in diagonale spazza via la vecchia
    float x = q.x * 0.8 + q.y * 0.4;
    float fronte = mix(-0.25, 1.45, p);
    vec4 m = x < fronte ? tB(q) : tA(q);
    float l = exp(-pow((x - fronte) * 9.0, 2.0));
    return vec4(min(vec3(1.0), m.rgb + vec3(1.0, 0.97, 0.9) * l * 1.3), max(m.a, l));
  }
  if (u_pattern == 461) {
    // caleidoscopio: l'immagine si piega a spicchi, cambia, si riapre
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c), seg = 6.2831853 / 8.0;
    float a0 = mod(atan(c.y, c.x) + p * 3.0, seg);
    a0 = abs(a0 - seg * 0.5);
    vec2 k = mix(c, vec2(cos(a0), sin(a0)) * r, arco);
    vec2 qq = k / vec2(asp, 1.0) + 0.5;
    return mix(tA(qq), tB(qq), smoothstep(0.4, 0.6, p));
  }
  if (u_pattern == 471) {
    // aria calda: tutto trema come sopra l'asfalto e si scioglie nella nuova
    vec2 w = vec2(sin(q.y * 60.0 + p * 40.0) + sin(q.y * 23.0 - p * 30.0), cos(q.x * 45.0 + p * 35.0)) * 0.012 * arco;
    float n = caso(floor(q.x * 90.0) + floor(q.y * 50.0) * 91.0);
    return mix(tA(q + w), tB(q + w), smoothstep(n * 0.5, n * 0.5 + 0.5, p));
  }
  if (u_pattern == 481) {
    // tenda: la vecchia si apre dal centro in due metà, con l'ombra
    float h = e * 0.5;
    vec4 b = tB(q) * (0.6 + 0.4 * e);
    if (q.x < 0.5 - h) return tA(q + vec2(h, 0.0)) * (1.0 - 0.25 * smoothstep(0.5 - h - 0.05, 0.5 - h, q.x));
    if (q.x > 0.5 + h) return tA(q - vec2(h, 0.0)) * (1.0 - 0.25 * smoothstep(0.5 + h + 0.05, 0.5 + h, q.x));
    return b;
  }
  if (u_pattern == 491) {
    // sovraesposta: la vecchia si brucia di luce, dalla luce esce la nuova
    vec4 m = mix(tA(q), tB(q), smoothstep(0.45, 0.55, p));
    float l = pow(arco, 1.5);
    return vec4(min(vec3(1.0), m.rgb * (1.0 + l * 3.5) + l * 0.25), m.a);
  }
  if (u_pattern == 521) {
    // polvere: la vecchia si sgretola in granelli e sotto c'è la nuova
    float n = caso(floor(q.x * 320.0) * 1.37 + floor(q.y * 180.0) * 91.7);
    float soglia = q.y * 0.35 + n * 0.65;
    return p > soglia ? tB(q) : tA(q + vec2(0.0, -max(0.0, p - soglia + 0.25) * 0.15));
  }
  if (u_pattern == 531) {
    // persiane: le stecche girano una dopo l'altra, dall'alto in basso
    float n = 10.0;
    float riga = floor(q.y * n);
    float yl = fract(q.y * n);
    float t = clamp(p * 1.6 - riga / n * 0.6, 0.0, 1.0);
    float ang = dolce(t) * 3.14159265;
    float hh = abs(cos(ang));
    float d = (yl - 0.5) / max(hh, 0.001);
    if (abs(d) > 0.5) return vec4(0.0);
    vec2 qq = vec2(q.x, (riga + d + 0.5) / n);
    float luce = 0.55 + 0.45 * hh;
    return (ang < 1.5707963 ? tA(qq) : tB(qq)) * vec4(vec3(luce), 1.0);
  }
  if (u_pattern == 541) {
    // scacchiera: le caselle si girano a caso, una alla volta
    vec2 n = vec2(12.0, 7.0);
    vec2 cella = floor(q * n);
    float r0 = caso(cella.x * 7.13 + cella.y * 31.7);
    float t = clamp((p - r0 * 0.6) / 0.4, 0.0, 1.0);
    float ang = dolce(t) * 3.14159265;
    float w = abs(cos(ang));
    vec2 l = fract(q * n) - 0.5;
    if (abs(l.x) > w * 0.5) return vec4(0.0);
    vec2 qq = (cella + 0.5 + vec2(l.x / max(w, 0.001), l.y)) / n;
    float luce = 0.6 + 0.4 * w;
    return (ang < 1.5707963 ? tA(qq) : tB(qq)) * vec4(vec3(luce), 1.0);
  }
  if (u_pattern == 551) {
    // tuffo: la vecchia si allontana girando, la nuova si avvicina da dietro
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float s = 1.0 - e;
    float ang = e * 1.2;
    vec2 rr = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y) / max(s, 0.001);
    vec2 qa = rr / vec2(asp, 1.0) + 0.5;
    float zb = mix(1.3, 1.0, e);
    vec4 b = tB(0.5 + (q - 0.5) / zb) * vec4(vec3(0.45 + 0.55 * e), 1.0);
    if (s > 0.002 && qa.x >= 0.0 && qa.y >= 0.0 && qa.x <= 1.0 && qa.y <= 1.0) return tA(qa);
    return b;
  }
  if (u_pattern == 561) {
    // inchiostro: la nuova si spande come una goccia d'inchiostro nell'acqua
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float n = 0.0, amp = 0.5;
    vec2 z = q * vec2(asp, 1.0) * 4.0;
    for (int i = 0; i < 4; i++) { n += amp * rumoreV(z); z *= 2.1; amp *= 0.5; }
    float campo = length(c) * 0.9 + (n - 0.5) * 0.55;
    float fronte = mix(-0.2, 1.3, p);
    float m = 1.0 - smoothstep(fronte - 0.06, fronte, campo);
    vec4 r = mix(tA(q), tB(q), m);
    float bordo = (1.0 - smoothstep(0.0, 0.05, abs(campo - fronte))) * 0.35;
    return vec4(r.rgb * (1.0 - bordo), r.a);
  }
  if (u_pattern == 571) {
    // colori sdoppiati: la nuova entra di lato col rosso e il blu che scappano
    float sp = 0.07 * arco;
    vec2 qa = q + vec2(e, 0.0), qb = q - vec2(1.0 - e, 0.0);
    if (q.x < 1.0 - e) return vec4(tA(qa + vec2(sp, 0.0)).r, tA(qa).g, tA(qa - vec2(sp, 0.0)).b, tA(qa).a);
    return vec4(tB(qb + vec2(sp, 0.0)).r, tB(qb).g, tB(qb - vec2(sp, 0.0)).b, tB(qb).a);
  }
  if (u_pattern == 581) {
    // bolle: tanti cerchi si aprono qua e là e si uniscono
    vec2 n = vec2(9.0 * asp, 9.0);
    vec2 cella = floor(q * n);
    float best = 0.0;
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
      vec2 cc = cella + vec2(float(dx), float(dy));
      float r0 = caso(cc.x * 3.7 + cc.y * 17.3);
      vec2 centro = (cc + 0.5 + (vec2(caso(cc.x + cc.y * 5.1), caso(cc.y + cc.x * 2.3)) - 0.5) * 0.6) / n;
      float t = clamp((p - r0 * 0.5) / 0.5, 0.0, 1.0);
      float raggio = dolce(t) * 1.6 / n.y;
      float d = length((q - centro) * vec2(asp, 1.0));
      best = max(best, 1.0 - smoothstep(raggio - 0.004, raggio, d));
    }
    return mix(tA(q), tB(q), best);
  }
  if (u_pattern == 591) {
    // rimbalzo: la nuova cade dall'alto e rimbalza, la vecchia sotto si scurisce
    float off = 1.0 - rimbalzo(clamp(p, 0.0, 1.0));
    if (q.y + off <= 1.0) return tB(q + vec2(0.0, off));
    return tA(q) * vec4(vec3(1.0 - 0.35 * (1.0 - off)), 1.0);
  }
  if (u_pattern == 601) {
    // pagina: la pagina si solleva da destra e si rovescia, sotto c'è la nuova
    float f = 1.0 - e;
    if (q.x > f) return tB(q) * vec4(vec3(0.5 + 0.5 * smoothstep(0.0, 0.2, q.x - f)), 1.0);
    float xm = 2.0 * f - q.x;
    if (xm <= 1.0 && xm >= f) {
      // il retro della pagina: piano, più scuro verso il bordo, con un riflesso lungo la piega
      float t = clamp((f - q.x) / max(0.001, 1.0 - f), 0.0, 1.0);
      vec4 r = tA(vec2(xm, q.y));
      float riflesso = exp(-pow((f - q.x) * 10.0, 2.0)) * 0.35;
      return vec4(r.rgb * (0.9 - 0.3 * t) * 0.85 + riflesso, max(r.a, 0.0));
    }
    float ombra = 1.0 - 0.3 * smoothstep(0.12, 0.0, (2.0 * f - 1.0) - q.x) * step(0.0, 2.0 * f - 1.0);
    return tA(q) * vec4(vec3(ombra), 1.0);
  }
  if (u_pattern == 611) {
    // frantumi: le piastrelle si girano e si rimpiccioliscono, una dopo l'altra, e sotto c'è la nuova
    vec2 n = vec2(10.0 * asp, 10.0);
    vec2 cella = floor(q * n);
    float r0 = caso(cella.x * 5.3 + cella.y * 19.7);
    float t = clamp((p - r0 * 0.55) / 0.45, 0.0, 1.0);
    vec2 l = fract(q * n) - 0.5;
    float ang = dolce(t) * (r0 - 0.5) * 6.0 * min(u_forza, 1.6);
    float sc = 1.0 - dolce(t);
    vec4 b = tB(q);
    if (sc < 0.02) return b;
    vec2 loc = vec2(cos(ang) * l.x - sin(ang) * l.y, sin(ang) * l.x + cos(ang) * l.y) / sc;
    if (abs(loc.x) > 0.5 || abs(loc.y) > 0.5) return b;
    return tA((cella + 0.5 + loc) / n) * vec4(vec3(1.0 - 0.3 * t), 1.0);
  }
  if (u_pattern == 621) {
    // spinta veloce: la nuova spinge via la vecchia, con la scia del movimento
    vec4 a = vec4(0.0);
    float amt = arco * 0.2;
    for (int i = 0; i < 14; i++) {
      float k = (float(i) / 13.0 - 0.5) * amt;
      vec2 qq = q + vec2(k, 0.0);
      a += qq.x < 1.0 - e ? tA(qq + vec2(e, 0.0)) : tB(qq - vec2(1.0 - e, 0.0));
    }
    return a / 14.0;
  }
  if (u_pattern == 631) {
    // fette: strisce orizzontali che scorrono una a destra e una a sinistra, con un filo di ritardo
    float n = 8.0;
    float riga = floor(q.y * n);
    float t = dolce(clamp((p - riga / (n - 1.0) * 0.4) / 0.6, 0.0, 1.0));
    float verso = mod(riga, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 qa = q - vec2(t * verso, 0.0), qb = q - vec2(t * verso - verso, 0.0);
    return (qa.x >= 0.0 && qa.x <= 1.0) ? tA(qa) : tB(qb);
  }
  if (u_pattern == 641) {
    // alveare: esagoni che si chiudono su se stessi e scoprono la nuova
    const vec2 sz = vec2(1.0, 1.7320508);
    float N = 8.0;
    vec2 pp = (q - 0.5) * vec2(asp, 1.0) * N;
    vec4 hc = floor(vec4(pp, pp - vec2(1.0, 1.5)) / sz.xyxy) + 0.5;
    vec4 hh = vec4(pp - hc.xy * sz, pp - (hc.zw + 0.5) * sz);
    vec2 l, id;
    if (dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw)) { l = hh.xy; id = hc.xy; } else { l = hh.zw; id = hc.zw + 0.5; }
    vec2 ctr = (id * sz) / N / vec2(asp, 1.0) + 0.5;
    float r0 = caso(dot(id, vec2(7.13, 31.7)));
    float t = clamp((p * 1.6 - length(ctr - 0.5) * 0.7 - r0 * 0.3) / 0.5, 0.0, 1.0);
    float sc = 1.0 - dolce(t);
    vec4 b = tB(q);
    if (sc < 0.02) return b;
    vec2 loc = l / sc;
    float hd = max(dot(abs(loc), vec2(0.5, 0.8660254)), abs(loc.x));
    if (hd > 0.5) return b;
    return tA(ctr + loc / N / vec2(asp, 1.0));
  }
  if (u_pattern == 651) {
    // onda d'urto: un anello si allarga dal centro e piega l'immagine; dentro c'è la nuova
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c), R = length(vec2(asp, 1.0) * 0.5);
    float d = r - p * (R + 0.25);
    vec2 dir = c / max(r, 1e-4);
    vec2 off = dir * exp(-d * d * 220.0) * sin(d * 55.0) * 0.05 * min(u_forza, 1.6) / vec2(asp, 1.0);
    float m = 1.0 - smoothstep(-0.02, 0.02, d);
    vec4 res = mix(tA(q + off), tB(q + off), m);
    return vec4(min(vec3(1.0), res.rgb + exp(-d * d * 800.0) * 0.4), res.a);
  }
  if (u_pattern == 661) {
    // nuvole: un fumo denso dissolve la vecchia nella nuova, a chiazze morbide
    float n = 0.0, amp = 0.5;
    vec2 z = q * vec2(asp, 1.0) * 3.0;
    for (int i = 0; i < 5; i++) { n += amp * rumoreV(z + vec2(p * 0.8, 0.0)); z *= 2.0; amp *= 0.5; }
    float m = smoothstep(n - 0.12, n + 0.12, p * 1.5 - 0.25);
    vec4 res = mix(tA(q), tB(q), m);
    float fumo = (1.0 - abs(2.0 * m - 1.0)) * 0.2 * arco;
    return vec4(res.rgb + fumo, res.a);
  }
  if (u_pattern == 671) {
    // fuoco: la vecchia brucia dai punti scelti dal caso, i bordi diventano brace, sotto c'è la nuova
    float n = 0.0, amp = 0.5;
    vec2 z = q * vec2(asp, 1.0) * 3.5;
    for (int i = 0; i < 5; i++) { n += amp * rumoreV(z); z *= 2.1; amp *= 0.5; }
    float d = (p * 1.5 - 0.25) - n;
    vec4 a = tA(q), b = tB(q);
    if (d < 0.0) {
      float pre = smoothstep(-0.3, 0.0, d);
      return vec4(a.rgb * (1.0 - 0.75 * pre) + vec3(1.0, 0.45, 0.08) * smoothstep(-0.07, 0.0, d) * 1.2, a.a);
    }
    float k = smoothstep(0.0, 0.07, d);
    vec3 brace = mix(vec3(1.0, 0.75, 0.2), vec3(0.15, 0.03, 0.0), k);
    return vec4(mix(brace, b.rgb, smoothstep(0.03, 0.1, d)), 1.0);
  }
  if (u_pattern == 681) {
    // rullino: la pellicola scorre verso l'alto, coi fori ai lati e lo spazio fra un fotogramma e l'altro
    float bordoFilm = smoothstep(0.0, 0.14, p) * smoothstep(1.0, 0.86, p);
    float sx0 = 0.085 * bordoFilm, gap = 0.05 * bordoFilm;
    float hh = 1.0 + gap;
    float off = e * hh;
    if (q.x < sx0 || q.x > 1.0 - sx0) {
      float y = q.y + off;
      float foro = step(0.5, fract(y * 9.0)) * step(0.08, fract(y * 9.0)) * step(abs(abs(q.x - 0.5) - (0.5 - sx0 * 0.5)), sx0 * 0.28);
      return vec4(vec3(0.03) + foro * vec3(0.9, 0.85, 0.7), 1.0);
    }
    float x2 = (q.x - sx0) / max(1e-3, 1.0 - 2.0 * sx0);
    vec2 qa = vec2(x2, q.y + off), qb = vec2(x2, q.y + off - hh);
    if (qa.y >= 0.0 && qa.y <= 1.0) return tA(qa);
    if (qb.y >= 0.0 && qb.y <= 1.0) return tB(qb);
    return vec4(vec3(0.02), 1.0);
  }
  if (u_pattern == 691) {
    // diaframma: le lamelle si chiudono sulla vecchia e si riaprono sulla nuova
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float R = length(vec2(asp, 1.0) * 0.5);
    float sc = p < 0.5 ? 1.0 - dolce(p * 2.0) : dolce(p * 2.0 - 1.0);
    float ang = p * 2.0 * min(u_forza, 1.6);
    vec2 r = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
    float hd = max(abs(r.y), abs(r.x) * 0.8660254 + abs(r.y) * 0.5);
    float m = 1.0 - smoothstep(sc * R * 0.86 - 0.01, sc * R * 0.86 + 0.01, hd);
    return mix(vec4(0.0, 0.0, 0.0, 1.0), p < 0.5 ? tA(q) : tB(q), m);
  }
  if (u_pattern == 701) {
    // punti: tanti cerchi crescono da un angolo e si uniscono (il retino)
    vec2 g = q * vec2(asp, 1.0) * 20.0;
    vec2 id = floor(g);
    float rit = id.x / (20.0 * asp) * 0.25 + id.y / 20.0 * 0.25;
    float r = clamp(p * 1.5 - rit, 0.0, 1.0) * 0.76;
    float m = 1.0 - smoothstep(r - 0.07, r, length(fract(g) - 0.5));
    return mix(tA(q), tB(q), m);
  }
  if (u_pattern == 711) {
    // spirale: il braccio di una spirale spazza via la vecchia
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c) / length(vec2(asp, 1.0) * 0.5);
    float a = fract(atan(c.y, c.x) / 6.2831853 + 1.0);
    float f = fract(a + r * 1.6);
    float t = p * 1.12;
    return mix(tA(q), tB(q), 1.0 - smoothstep(t - 0.06, t, f));
  }
  if (u_pattern == 721) {
    // doppia esposizione: le due immagini si sovrappongono come due pose sulla stessa pellicola
    vec4 a = tA(q), b = tB(q);
    vec3 sc = 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb);
    return vec4(mix(mix(a.rgb, b.rgb, dolce(p)), sc, arco * 0.85), mix(a.a, b.a, e));
  }
  if (u_pattern == 731) {
    // TV che si spegne: la vecchia si schiaccia in una riga e in un puntino, la nuova si apre da lì
    vec2 c = q - 0.5;
    bool prima = p < 0.5;
    float u = prima ? p * 2.0 : 1.0 - (p - 0.5) * 2.0;
    float sy = max(1.0 - dolce(clamp(u * 1.5, 0.0, 1.0)), 0.004);
    float sx = max(1.0 - dolce(clamp((u - 0.6) / 0.4, 0.0, 1.0)), 0.001);
    vec2 cc = c / vec2(sx, sy);
    vec4 img = (abs(cc.x) <= 0.5 && abs(cc.y) <= 0.5) ? (prima ? tA(cc + 0.5) : tB(cc + 0.5)) : vec4(0.0);
    vec3 col = img.rgb * (1.0 + 1.6 * smoothstep(0.3, 1.0, u));
    float riga = exp(-pow(c.y / (0.003 + 0.012 * (1.0 - u)), 2.0)) * smoothstep(0.55 * sx + 0.03, 0.55 * sx - 0.02, abs(c.x));
    col += vec3(0.85, 0.95, 1.0) * riga * smoothstep(0.35, 1.0, u);
    return vec4(col, 1.0);
  }
  if (u_pattern == 741) {
    // pioggia digitale: colonne di luce verde cadono a velocità diverse e lasciano dietro la nuova
    float col = floor(q.x * 48.0 * asp);
    float fronte = clamp(p * 1.55 - caso(col * 1.7) * 0.45, 0.0, 1.0) * 1.15;
    float dist = fronte - q.y;
    float dentro = step(q.y, fronte);
    float cella = step(0.45, caso(col + floor(q.y * 70.0) * 3.1));
    float scia = dentro * exp(-dist * 7.0) * step(0.001, fronte) * step(fronte, 1.14) * (0.35 + 0.65 * cella);
    float testa = smoothstep(0.02, 0.0, abs(dist)) * step(0.001, fronte) * step(fronte, 1.14);
    vec4 r = mix(tA(q), tB(q), dentro);
    return vec4(r.rgb + vec3(0.15, 1.0, 0.4) * scia * 0.9 + vec3(0.8, 1.0, 0.85) * testa, r.a);
  }
  if (u_pattern == 751) {
    // strappo: la carta si rompe lungo una linea irregolare e sotto c'è la nuova
    float pos = q.x * 0.82 + (1.0 - q.y) * 0.18 + (rumoreV(vec2(q.y * 11.0, 1.0)) - 0.5) * 0.14 + (rumoreV(vec2(q.y * 47.0, 3.0)) - 0.5) * 0.03;
    float d = (p * 1.42 - 0.2) - pos;
    vec4 a = tA(q + vec2(0.012, 0.0) * smoothstep(0.0, -0.12, d) * arco), b = tB(q);
    vec3 rgb = mix(a.rgb, b.rgb * (1.0 - 0.55 * smoothstep(0.07, 0.0, d)), smoothstep(0.0, 0.004, d));
    float bordo = smoothstep(-0.03, -0.022, d) * (1.0 - smoothstep(-0.005, 0.0, d));
    rgb = mix(rgb, vec3(0.96, 0.94, 0.88), bordo * 0.95 * step(0.001, p) * step(p, 0.999));
    return vec4(rgb, mix(a.a, b.a, smoothstep(0.0, 0.004, d)));
  }
  if (u_pattern == 761) {
    // vetro rotto: crepe, poi i pezzi cadono uno dopo l'altro dal punto dell'urto e scoprono la nuova
    vec2 sc = vec2(7.0 * asp, 7.0);
    vec4 v1 = pezzo(q * sc);
    vec2 ctr1 = v1.xy / sc;
    float r1 = caso(dot(v1.zw, vec2(12.9, 78.2)));
    float t1 = clamp((p * 1.6 - 0.25 - length((ctr1 - 0.5) * vec2(asp, 1.0)) * 0.55 - r1 * 0.3) / 0.5, 0.0, 1.0);
    vec2 spos = vec2((r1 - 0.5) * 0.12, t1 * t1 * 1.4) * step(0.0001, t1);
    vec2 q2 = q - spos;
    vec4 v2 = pezzo(q2 * sc);
    bool stesso = distance(v2.zw, v1.zw) < 0.5;
    vec4 b = tB(q);
    vec4 a = tA(q2);
    vec3 rgb = (stesso && !fuori(q2)) ? a.rgb : b.rgb;
    // le crepe: dove si toccano due pezzi, prima che cadano
    vec2 gq = q * sc;
    vec2 idq = floor(gq), fq = fract(gq);
    float d1 = 9.0, d2 = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 nb = vec2(float(i), float(j));
      vec2 pt = nb + vec2(caso(dot(idq + nb, vec2(3.1, 7.3))), caso(dot(idq + nb, vec2(5.7, 2.9))));
      float dd = length(pt - fq);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    float crepa = smoothstep(0.05, 0.0, d2 - d1) * smoothstep(0.02, 0.2, p) * (1.0 - t1);
    rgb = mix(rgb, vec3(0.9, 0.95, 1.0), crepa * 0.55);
    return vec4(rgb, 1.0);
  }
  if (u_pattern == 771) {
    // sipario: la vecchia si apre come una tenda, con le pieghe, e mostra la nuova
    float w = 0.5 * (1.0 - e);
    float piega = 0.5 + 0.5 * sin(q.x * asp * 48.0);
    if (w > 0.002 && q.x < w) {
      float u = q.x / w;
      return tA(vec2(u * 0.5, q.y)) * vec4(vec3(0.62 + 0.38 * piega * (1.0 - 0.4 * e) - 0.2 * u), 1.0);
    }
    if (w > 0.002 && q.x > 1.0 - w) {
      float u = (1.0 - q.x) / w;
      return tA(vec2(1.0 - u * 0.5, q.y)) * vec4(vec3(0.62 + 0.38 * piega * (1.0 - 0.4 * e) - 0.2 * u), 1.0);
    }
    float ombra = w > 0.002 ? smoothstep(0.0, 0.08, min(q.x - w, 1.0 - w - q.x)) : 1.0;
    return tB(q) * vec4(vec3(0.55 + 0.45 * ombra), 1.0);
  }
  if (u_pattern == 781) {
    // anelli: cerchi concentrici girano uno dopo l'altro, e girando cambiano l'immagine
    vec2 c = (q - 0.5) * vec2(asp, 1.0);
    float r = length(c) / length(vec2(asp, 1.0) * 0.5);
    float anello = floor(r * 7.0);
    float t = clamp((p * 1.4 - anello / 7.0 * 0.4) / 0.3, 0.0, 1.0);
    float ang = (mod(anello, 2.0) * 2.0 - 1.0) * t * 0.9 * min(u_forza, 1.6);
    vec2 rc = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y) / vec2(asp, 1.0) + 0.5;
    rc = 1.0 - abs(1.0 - mod(rc, 2.0));
    vec4 m = mix(tA(rc), tB(rc), step(0.5, t));
    float bordo = smoothstep(0.0, 0.05, fract(r * 7.0)) * smoothstep(1.0, 0.95, fract(r * 7.0));
    return m * vec4(vec3(mix(1.0, bordo, sin(t * 3.14159) * 0.8)), 1.0);
  }
  if (u_pattern == 791) {
    // segnale perso: l'immagine si strappa a righe, poi barre e neve, e ritorna quella nuova
    float pk = 1.0 - abs(2.0 * p - 1.0);
    float riga = floor(q.y * 40.0), fase = floor(p * 25.0);
    vec2 qq = q + vec2((caso(riga + fase) - 0.5) * 0.22 * pk * min(u_forza, 1.6) * step(0.4, caso(riga * 1.3 + fase)), 0.0);
    vec4 img = p < 0.5 ? tA(qq) : tB(qq);
    float b = floor(q.x * 7.0);
    vec3 barre = vec3(step(0.5, float(b == 0.0 || b == 1.0 || b == 4.0 || b == 5.0)), step(0.5, float(b < 4.0)), step(0.5, float(b == 0.0 || b == 2.0 || b == 4.0 || b == 6.0)));
    float neve = caso(dot(floor(q * vec2(320.0, 180.0)), vec2(12.9898, 78.233)) + fase);
    vec3 sig = mix(barre * 0.8, vec3(neve), 0.5);
    return vec4(mix(img.rgb, sig, smoothstep(0.55, 0.85, pk)), 1.0);
  }
  if (u_pattern == 811) {
    // cola: la vecchia si scioglie e cola verso il basso, a strisce diverse, e scopre la nuova
    float n = rumoreV(vec2(q.x * asp * 14.0, 0.0)) * 0.5 + caso(floor(q.x * asp * 40.0)) * 0.2;
    float f = (p * 1.5 - n) * 1.25;
    vec4 b = tB(q);
    if (q.y < f) return b;
    vec4 a = tA(vec2(q.x + sin(q.y * 30.0) * 0.004 * smoothstep(0.2, 0.0, q.y - f), q.y - f * 0.85));
    return vec4(a.rgb * (0.75 + 0.25 * smoothstep(0.0, 0.1, q.y - f)), a.a);
  }
  if (u_pattern == 831) {
    // lente: una lente d'ingrandimento cresce e attraversa il quadro: dentro c'è la nuova, ingrandita
    vec2 ctr = vec2(mix(0.2, 0.5, e), 0.5 + sin(p * 6.2832) * 0.08 * (1.0 - e));
    float rad = 0.1 + e * 1.15;
    float r = length((q - ctr) * vec2(asp, 1.0));
    float m = smoothstep(rad, rad - 0.012, r);
    vec4 dentro = tB(ctr + (q - ctr) / (1.0 + 0.8 * (1.0 - e)));
    vec4 fuoriL = tA(q);
    vec4 res = mix(fuoriL, dentro, m);
    float anello = smoothstep(0.014, 0.0, abs(r - rad)) * step(0.001, p) * step(p, 0.999);
    return vec4(res.rgb + vec3(0.9, 0.95, 1.0) * anello * 0.7, res.a);
  }
  if (u_pattern == 841) {
    // spettro: i tre colori se ne vanno uno dopo l'altro, prima il rosso e per ultimo il blu
    vec4 a = tA(q), b = tB(q);
    float mR = smoothstep(q.x - 0.07, q.x + 0.07, p * 1.5 - 0.1);
    float mG = smoothstep(q.x - 0.07, q.x + 0.07, p * 1.5 - 0.1 - 0.16);
    float mB = smoothstep(q.x - 0.07, q.x + 0.07, p * 1.5 - 0.1 - 0.32);
    return vec4(mix(a.r, b.r, mR), mix(a.g, b.g, mG), mix(a.b, b.b, mB), mix(a.a, b.a, mG));
  }
  if (u_pattern == 861) {
    // cerniera: si apre dall'alto verso il basso e mostra la nuova, coi dentini sui bordi
    float zp = p * 1.25;
    float aperto = clamp(zp - q.y, 0.0, 1.0);
    float w = dolce(aperto) * 0.62;
    float dx = abs(q.x - 0.5);
    vec4 a = tA(q), b = tB(q);
    vec3 rgb = dx < w ? b.rgb * (0.6 + 0.4 * smoothstep(0.0, 0.06, w - dx)) : a.rgb;
    if (aperto > 0.0 && dx >= w && dx < w + 0.02) {
      float dente = step(0.5, fract(q.y * 46.0 + (q.x < 0.5 ? 0.0 : 0.5)));
      rgb = mix(vec3(0.85, 0.85, 0.88), vec3(0.32, 0.32, 0.36), dente);
    }
    float cursore = smoothstep(0.02, 0.0, abs(q.y - zp)) * smoothstep(0.045, 0.0, dx) * step(0.001, p) * step(p, 0.999);
    rgb = mix(rgb, vec3(0.95, 0.85, 0.3), cursore);
    return vec4(rgb, mix(a.a, b.a, step(dx, w)));
  }
  if (u_pattern == 801) {
    // portoni 3D: due battenti si aprono come porte e rivelano la nuova
    float w = 1.0 - e;
    float mezzo = 0.5 * w;
    vec4 b = tB(q);
    if (mezzo > 0.002 && (q.x < mezzo || q.x > 1.0 - mezzo)) {
      float u = (q.x < mezzo ? q.x : 1.0 - q.x) / mezzo;
      float ys = 1.0 - 0.28 * e * u * min(u_forza, 1.6);
      float yy = 0.5 + (q.y - 0.5) / ys;
      if (yy >= 0.0 && yy <= 1.0) {
        vec4 r = tA(vec2(q.x < mezzo ? u * 0.5 : 1.0 - u * 0.5, yy));
        return r * vec4(vec3(1.0 - 0.45 * e * u), 1.0);
      }
    }
    return b * vec4(vec3(0.7 + 0.3 * e), 1.0);
  }
  if (u_pattern == 401 || u_pattern == 411) {
    // raggio dall'occhio (0,0,-D) attraverso il punto dello schermo; lo schermo è il piano z = 0
    float a = asp;
    vec3 s3 = vec3((q.x - 0.5) * a, 0.5 - q.y, 0.0);
    float D = 2.4;
    vec3 O = vec3(0.0, 0.0, -D);
    vec3 dir = normalize(s3 - O);
    bool cubo = u_pattern == 401;
    float ang = cubo ? e * 1.5707963 : e * 3.14159265;
    float lontano = arco * (cubo ? 0.45 : 0.6);
    vec3 C = vec3(0.0, 0.0, (cubo ? a * 0.5 : 0.0) + lontano);
    // si porta il raggio nel riferimento dell'oggetto: l'oggetto ruota verso sinistra (la faccia di destra viene davanti),
    // qui si applica la rotazione inversa
    vec2 oxz = ruotaY((O - C).xz, ang), dxz = ruotaY(dir.xz, ang);
    vec3 ol = vec3(oxz.x, O.y - C.y, oxz.y), dl = vec3(dxz.x, dir.y, dxz.y);
    vec4 col = vec4(0.0);
    float tMin = 1e9;
    if (cubo) {
      // faccia A davanti (z = -a/2), faccia B a destra (x = +a/2)
      float t = (-a * 0.5 - ol.z) / dl.z;
      vec3 h = ol + t * dl;
      if (t > 0.0 && abs(h.x) <= a * 0.5 && abs(h.y) <= 0.5) { tMin = t; col = tA(vec2((h.x + a * 0.5) / a, 0.5 - h.y)) * (0.55 + 0.45 * cos(ang)); }
      t = (a * 0.5 - ol.x) / dl.x;
      h = ol + t * dl;
      if (t > 0.0 && t < tMin && abs(h.z) <= a * 0.5 && abs(h.y) <= 0.5) { col = tB(vec2((h.z + a * 0.5) / a, 0.5 - h.y)) * (0.55 + 0.45 * sin(ang)); }
    } else {
      float t = -ol.z / dl.z;
      vec3 h = ol + t * dl;
      if (t > 0.0 && abs(h.x) <= a * 0.5 && abs(h.y) <= 0.5) {
        float u = (h.x + a * 0.5) / a;
        float luce = 0.6 + 0.4 * abs(cos(ang));
        col = (ang < 1.5707963 ? tA(vec2(u, 0.5 - h.y)) : tB(vec2(1.0 - u, 0.5 - h.y))) * luce;
      }
    }
    return col;
  }
  return mix(tA(q), tB(q), p);
}

void main() {
  vec2 q = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 B = texture(u_b, v_uv);
  vec4 A = u_hasA ? texture(u_a, v_uv) : vec4(0.0);
  // la curva dell'avanzamento e il rapporto del quadro (con la direzione gira: 90° scambia larghezza e altezza)
  P = clamp(u_p, 0.0, 1.0);
  if (u_curva == 1) P = dolce(P); else if (u_curva == 2) P = P * P; else if (u_curva == 3) P = 1.0 - (1.0 - P) * (1.0 - P);
  asp = (u_mode == 4 && (u_dir == 1 || u_dir == 3)) ? 1.0 / u_aspect : u_aspect;
  vec4 r = B;
  if (u_mode == 1) r = mix(A, B, P);
  else if (u_mode == 3) {
    vec4 d = vec4(u_dipColor, 1.0);
    r = P < 0.5 ? mix(A, d, P * 2.0) : mix(d, B, (P - 0.5) * 2.0);
  } else if (u_mode == 2) r = tendina(q, A, B);
  else if (u_mode == 4) r = effetto(u_dir == 0 ? q : gira(q, (4 - u_dir) % 4), P);
  o = r * u_opacity;
}`;

export const NOMI_COMBINA = ['u_a', 'u_b', 'u_hasA', 'u_mode', 'u_p', 'u_opacity', 'u_soft', 'u_border', 'u_aspect', 'u_pattern', 'u_reverse', 'u_borderColor', 'u_dipColor', 'u_dir', 'u_forza', 'u_curva'];

/** imposta le uniform della combinazione: le usano il compositore e le anteprime del pannello Transizioni */
export function impostaCombina(gl: WebGL2RenderingContext, u: Record<string, WebGLUniformLocation | null>, tr: Transition | null, prog: number, opacity: number, hasA: boolean, aspect: number) {
  gl.uniform1i(u.u_a, 0);
  gl.uniform1i(u.u_b, 1);
  gl.uniform1i(u.u_hasA, hasA ? 1 : 0);
  const mode = !tr ? 0 : tr.type === 'mix' ? 1 : tr.type === 'wipe' ? 2 : tr.type === 'dve' ? 4 : 3;
  gl.uniform1i(u.u_mode, mode);
  gl.uniform1f(u.u_p, Math.max(0, Math.min(1, prog)));
  gl.uniform1f(u.u_opacity, opacity);
  gl.uniform1f(u.u_soft, tr?.soft ?? 0);
  gl.uniform1f(u.u_border, tr?.border ?? 0);
  gl.uniform1f(u.u_aspect, aspect);
  gl.uniform1i(u.u_pattern, tr?.pattern ?? 1);
  gl.uniform1i(u.u_reverse, tr?.reverse ? 1 : 0);
  const bc = hex(tr?.borderColor ?? '#ffffff'), dc = hex(tr?.color ?? '#000000');
  gl.uniform3f(u.u_borderColor, bc[0], bc[1], bc[2]);
  gl.uniform3f(u.u_dipColor, dc[0], dc[1], dc[2]);
  gl.uniform1i(u.u_dir, tr?.type === 'dve' ? (((tr.dir ?? 0) % 4) + 4) % 4 : 0);
  gl.uniform1f(u.u_forza, Math.max(0.1, tr?.forza ?? 1));
  gl.uniform1i(u.u_curva, tr?.curva === 'dolce' ? 1 : tr?.curva === 'entra' ? 2 : tr?.curva === 'esce' ? 3 : 0);
}

/** compila un programma GLSL (errori con il testo del compilatore) */
export function compila(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('programma: ' + gl.getProgramInfoLog(p));
  return p;
}

type Tex = { tex: WebGLTexture; src: unknown; w: number; h: number };

function hex(c: string): [number, number, number] {
  const m = c.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m.slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}


export class Compositore {
  gl: WebGL2RenderingContext;
  readonly coloreGpu: ColoreGpu;
  private pLayer: WebGLProgram;
  private pComb: WebGLProgram;
  private pMaster: WebGLProgram;
  private pFx: WebGLProgram;
  private uM: Record<string, WebGLUniformLocation | null> = {};
  private uF: Record<string, WebGLUniformLocation | null> = {};
  /** prima/dopo: a sinistra di questa frazione si vede l'originale (0 = tutto col colore finale) */
  prima = 0;
  private uL: Record<string, WebGLUniformLocation | null> = {};
  private uC: Record<string, WebGLUniformLocation | null> = {};
  private vao: WebGLVertexArrayObject;
  private fbo: { fb: WebGLFramebuffer; tex: WebGLTexture }[] = [];
  private fbW = 0;
  private fbH = 0;
  private texs = new Map<string, Tex>();
  private used = new Set<string>();
  private blank: WebGLTexture;
  private fornitore: Fornitore | undefined;
  /** dà il fotogramma che viene dopo quello di fornitore (per il movimento fluido dei rallentatori) */
  private successivo: Fornitore | undefined;
  private interp: Interpolatore | null = null;
  /** il buffer con l'ultima uscita (2 = il mix, 4 = con gli effetti a tempo, 3 = col colore finale) */
  private uscita = 2;
  perso = false;
  /** per vedere la chiave: 0 immagine, 1 la maschera in bianco e nero, 2 il soggetto sugli scacchi (solo i monitor, mai l'export) */
  vistaChiave = 0;

  constructor(public canvas: HTMLCanvasElement | OffscreenCanvas, preserve = false) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: preserve, desynchronized: false, powerPreference: 'high-performance' }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 non disponibile');
    this.gl = gl;
    this.coloreGpu = new ColoreGpu(gl);
    this.pLayer = this.prog(VS_LAYER, FS_LAYER);
    this.pComb = this.prog(VS_FULL, FS_COMBINE);
    this.pMaster = this.prog(VS_FULL, FS_MASTER);
    this.pFx = this.prog(VS_FULL, FS_FX);
    for (const n of ['u_src', 'u_res', 'u_off', 'u_zoom', 'u_rot', 'u_blur', 'u_pixel', 'u_rgb', 'u_glitch', 'u_seme', 'u_desat', 'u_invert', 'u_flash', 'u_fade', 'u_luce', 'u_lucePh', 'u_bande', 'u_vhs', 'u_time', 'u_flashCol', 'u_fadeCol', 'u_bagliore', 'u_flare', 'u_flarePh', 'u_arco', 'u_arcoPh', 'u_espo', 'u_neon', 'u_onda', 'u_bolla', 'u_vortice', 'u_caleido', 'u_calore', 'u_zblur', 'u_centro', 'u_sole', 'u_tinta', 'u_semeGrana', 'u_numCensure', 'u_censure', 'u_morbidoCensure', ...CAMPI_FX.map((k) => 'u_' + k)])
      this.uF[n] = gl.getUniformLocation(this.pFx, n);
    for (const n of ['u_res', 'u_size', 'u_crop', 'u_off', 'u_scale', 'u_rot', 'u_tex', 'u_src', 'u_orient', 'u_color', 'u_bright', 'u_contrast', 'u_sat', 'u_hue', 'u_look', 'u_time', 'u_texel', 'u_key', 'u_keyColor', 'u_keyExtra', 'u_keyN', 'u_keyLevel', 'u_keySoft', 'u_keyInv', 'u_keySpill', 'u_keyBordo', 'u_keySfuma', 'u_keyPulisci', 'u_matte', 'u_matte2', 'u_matteK', 'u_forma', 'u_formaOn', 'u_vista',
      ...UNIFORM_COLORE, 'u_mirror', 'u_temp', 'u_vignette', 'u_alpha', 'u_color2', 'u_grad', 'u_box', 'u_boxPx', 'u_round', 'u_feather', 'u_auto', 'u_autoLo', 'u_autoHi', 'u_autoWb', 'u_autoK', 'u_autoGamma',
      'u_numClic', 'u_clic', 'u_clicColore', 'u_clicRapporto'])
      this.uL[n] = gl.getUniformLocation(this.pLayer, n);
    for (const n of [...UNIFORM_COLORE, 'u_src', 'u_lift', 'u_gamma', 'u_gain', 'u_shadow', 'u_high', 'u_sat', 'u_contrast', 'u_vignette', 'u_grain', 'u_time', 'u_split'])
      this.uM[n] = gl.getUniformLocation(this.pMaster, n);
    for (const n of NOMI_COMBINA) this.uC[n] = gl.getUniformLocation(this.pComb, n);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.pLayer, this.pComb, this.pMaster, this.pFx]) {
      const loc = gl.getAttribLocation(p, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    this.blank = this.newTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    if ('addEventListener' in canvas) {
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.perso = true; this.coloreGpu.distruggi(); }, false);
    }
  }

  private prog(vs: string, fs: string) {
    return compila(this.gl, vs, fs);
  }

  private newTex() {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private ensureFbo(w: number, h: number) {
    const gl = this.gl;
    if (this.fbW === w && this.fbH === h && this.fbo.length) return;
    for (const f of this.fbo) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
    this.fbo = [];
    // 0 A, 1 B, 2 il mix, 3 il colore finale, 4 gli effetti, 5 e 6 le transizioni in catena
    for (let i = 0; i < 7; i++) {
      const tex = this.newTex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.fbo.push({ fb, tex });
    }
    this.fbW = w;
    this.fbH = h;
  }

  /** la maschera dell'AI su un canale solo (R8): si carica una volta e resta finché serve */
  private matte(key: string, w: number, h: number, dati: Uint8Array): WebGLTexture {
    const gl = this.gl;
    let t = this.texs.get(key);
    if (!t) {
      t = { tex: this.newTex(), src: null, w: 0, h: 0 };
      this.texs.set(key, t);
    }
    this.used.add(key);
    if (t.src !== dati) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, dati);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      t.src = dati;
      t.w = w;
      t.h = h;
    }
    return t.tex;
  }

  /** carica sulla GPU un'immagine (fotogramma, tela, bitmap) solo se è cambiata */
  private upload(key: string, src: TexImageSource, w: number, h: number, sameAs: unknown): Tex {
    const gl = this.gl;
    let t = this.texs.get(key);
    if (!t) {
      t = { tex: this.newTex(), src: null, w: 0, h: 0 };
      this.texs.set(key, t);
    }
    this.used.add(key);
    if (t.src !== sameAs) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      t.src = sameAs;
      t.w = w;
      t.h = h;
    }
    return t;
  }

  /**
   * Disegna gli strati sull'uscita (la tela). W,H = dimensione del progetto; la tela può essere più piccola
   * (anteprima): tutto scala. playing = in riproduzione (i fotogrammi arrivano dal flusso).
   */
  render(p: Project, strati: Strato[], playing: boolean, frame: number, fornitore?: Fornitore, successivo?: Fornitore) {
    this.fornitore = fornitore;
    this.successivo = successivo;
    this.interp?.inizia();
    const gl = this.gl;
    if (this.perso || gl.isContextLost()) return;
    const cw = this.canvas.width, ch = this.canvas.height;
    this.coloreGpu.inizia();
    this.ensureFbo(cw, ch);
    this.used.clear();
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[2].fb);
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // dal basso: ogni traccia video si appoggia su quelle sotto, poi i suoi FX a tempo valgono per tutto il mucchio
    const video = p.tracks.filter((t) => t.kind === 'video');
    for (let i = video.length - 1; i >= 0; i--) {
      const tid = video[i].id;
      for (const s of strati) {
        if (s.trackId !== tid) continue;
        const hasA = !!s.a && !!s.tr;
        const okB = s.b ? this.layer(p, s.b, 1, playing, frame) : false;
        const okA = hasA ? this.layer(p, s.a!, 0, playing, frame) : false;
        if (!okB && !okA) continue;
        if (!okB) { // la sorgente B non è pronta: pulisce il suo buffer
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[1].fb);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        if (s.altre?.length && okA && okB) {
          // le transizioni dello stesso taglio in catena: la prima fa A→B, ogni altra va da A al risultato di prima
          // (gli effetti, come il lampo o l'onda, si applicano sopra il risultato: fa da vecchia e da nuova)
          let dentro = 1;
          const tutte = [{ tr: s.tr, prog: s.prog, sopra: false }, ...s.altre];
          for (let k = 0; k < tutte.length; k++) {
            const ultima = k === tutte.length - 1;
            const fuori = ultima ? 2 : k % 2 ? 6 : 5;
            this.combine(tutte[k].tr, tutte[k].prog, ultima ? s.opacity : 1, true, dentro, fuori, tutte[k].sopra && k > 0 ? dentro : 0);
            dentro = fuori;
          }
        } else this.combine(s.tr, s.prog, s.opacity, okA);
      }
      const fx = statoEffetti(p, frame, tid);
      if (fx) {
        this.effetti(fx, frame, cw, ch);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo[4].fb);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo[2].fb);
        gl.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[2].fb);
      }
    }
    const mix = 2;
    // il colore finale (pagina Finale) su tutto il quadro, poi sulla tela; resta nel buffer per gli strumenti
    const g = gradeDi(masterDi(p));
    const uscita = gradeNeutro(g) && this.prima <= 0 ? mix : 3;
    if (uscita === 3) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[3].fb);
      gl.viewport(0, 0, cw, ch);
      gl.disable(gl.BLEND);
      gl.useProgram(this.pMaster);
      const u = this.uM;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbo[mix].tex);
      gl.uniform1i(u.u_src, 0);
      gl.uniform3f(u.u_lift, ...g.lift);
      gl.uniform3f(u.u_gamma, ...g.gamma);
      gl.uniform3f(u.u_gain, ...g.gain);
      gl.uniform3f(u.u_shadow, ...g.shadow);
      gl.uniform3f(u.u_high, ...g.high);
      gl.uniform1f(u.u_sat, g.sat);
      gl.uniform1f(u.u_contrast, g.contrast);
      gl.uniform1f(u.u_vignette, g.vignette);
      gl.uniform1f(u.u_grain, g.grain);
      gl.uniform1f(u.u_time, (frame % 10000) / 25);
      gl.uniform1f(u.u_split, this.prima);
      this.coloreGpu.imposta(p, g, u, false);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    this.uscita = uscita;
    // il logo e i sottotitoli, sopra a tutto
    const firma = firmaSovr(p, frame, cw, ch);
    if (firma) this.sovrimpressione(p, frame, cw, ch, firma, uscita);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo[uscita].fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // i buffer delle clip non più in scena si liberano
    for (const [k, t] of this.texs) {
      if (!this.used.has(k) && !k.startsWith('img:')) { gl.deleteTexture(t.tex); this.texs.delete(k); }
    }
    this.interp?.finisce();
    this.coloreGpu.finisce();
  }

  private sovr: { firma: string; tela: HTMLCanvasElement | OffscreenCanvas } | null = null;

  /** appoggia la sovrimpressione (logo e sottotitoli) sul buffer d'uscita */
  private sovrimpressione(p: Project, frame: number, cw: number, ch: number, firma: string, uscita: number) {
    const gl = this.gl;
    if (!this.sovr || this.sovr.firma !== firma) {
      const tela = this.sovr && this.sovr.tela.width === cw && this.sovr.tela.height === ch ? this.sovr.tela : nuovaTela(cw, ch);
      disegnaSovr(tela.getContext('2d') as CanvasRenderingContext2D, p, frame, cw, ch);
      this.sovr = { firma, tela };
    }
    const t = this.upload('img:sovr', this.sovr.tela as TexImageSource, cw, ch, firma);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[uscita].fb);
    gl.viewport(0, 0, cw, ch);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pLayer);
    const u = this.uL;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(u.u_numClic, 0);
    gl.uniform1i(u.u_formaOn, 0); // la sovrimpressione non passa dalle maschere della clip di prima
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, cw, ch);
    gl.uniform2f(u.u_size, cw, ch);
    gl.uniform4f(u.u_crop, 0, 0, 0, 0);
    gl.uniform2f(u.u_off, 0, 0);
    gl.uniform1f(u.u_scale, 1);
    gl.uniform1f(u.u_rot, 0);
    gl.uniform1i(u.u_src, 0);
    gl.uniform1i(u.u_orient, 0);
    gl.uniform1f(u.u_bright, 0);
    gl.uniform1f(u.u_contrast, 1);
    gl.uniform1f(u.u_sat, 1);
    gl.uniform1f(u.u_hue, 0);
    gl.uniform1i(u.u_look, 0);
    gl.uniform1i(u.u_key, 0);
    gl.uniform1i(u.u_mirror, 0);
    gl.uniform1f(u.u_temp, 0);
    gl.uniform1f(u.u_vignette, 0);
    gl.uniform1f(u.u_alpha, 1);
    gl.uniform1i(u.u_auto, 0);
    gl.uniform1f(u.u_round, 0);
    gl.uniform1f(u.u_feather, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
  }

  /** il passaggio degli effetti a tempo: dal mix (buffer 2) al buffer 4 */
  private effetti(st: StatoFx, frame: number, cw: number, ch: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[4].fb);
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.BLEND);
    gl.useProgram(this.pFx);
    const u = this.uF;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbo[2].tex);
    gl.uniform1i(u.u_src, 0);
    gl.uniform2f(u.u_res, cw, ch);
    gl.uniform2f(u.u_off, st.dx, st.dy);
    gl.uniform1f(u.u_zoom, st.zoom);
    gl.uniform1f(u.u_rot, st.rot);
    gl.uniform1f(u.u_blur, st.blur);
    gl.uniform1f(u.u_pixel, st.pixel);
    gl.uniform1f(u.u_rgb, st.rgb);
    gl.uniform1f(u.u_glitch, st.glitch);
    gl.uniform1f(u.u_seme, st.seme % 1000);
    gl.uniform1f(u.u_semeGrana, st.semeGrana);
    gl.uniform1i(u.u_numCensure, st.censure.length);
    const zone = new Float32Array(MAX_CENSURE * 4), morbido = new Float32Array(MAX_CENSURE);
    st.censure.forEach((z, i) => { zone.set([z.x, 1 - z.y, z.w / 2, z.h / 2], i * 4); morbido[i] = z.morbido; });
    gl.uniform4fv(u.u_censure, zone);
    gl.uniform1fv(u.u_morbidoCensure, morbido);
    gl.uniform1f(u.u_desat, st.desat);
    gl.uniform1f(u.u_invert, st.invert);
    gl.uniform1f(u.u_flash, st.flash);
    gl.uniform1f(u.u_fade, st.fade);
    gl.uniform1f(u.u_luce, st.luce);
    gl.uniform1f(u.u_lucePh, st.lucePh);
    gl.uniform1f(u.u_bande, st.bande);
    gl.uniform1f(u.u_vhs, st.vhs);
    gl.uniform1f(u.u_bagliore, st.bagliore);
    gl.uniform1f(u.u_flare, st.flare);
    gl.uniform1f(u.u_flarePh, st.flarePh);
    gl.uniform1f(u.u_arco, st.arco);
    gl.uniform1f(u.u_arcoPh, st.arcoPh);
    gl.uniform1f(u.u_espo, st.espo);
    gl.uniform1f(u.u_neon, st.neon);
    gl.uniform1f(u.u_onda, st.onda);
    gl.uniform1f(u.u_bolla, st.bolla);
    gl.uniform1f(u.u_vortice, st.vortice);
    gl.uniform1f(u.u_caleido, st.caleido);
    gl.uniform1f(u.u_calore, st.calore);
    gl.uniform1f(u.u_zblur, st.zblur);
    gl.uniform1f(u.u_time, (frame % 10000) / 25);
    gl.uniform3f(u.u_flashCol, ...st.flashCol);
    gl.uniform3f(u.u_fadeCol, ...st.fadeCol);
    gl.uniform3f(u.u_tinta, ...st.tinta);
    for (const k of CAMPI_FX) gl.uniform1f(u['u_' + k], st[k]);
    // lo shader conta la y dal basso
    gl.uniform2f(u.u_centro, st.cx ?? 0.5, 1 - (st.cy ?? 0.5));
    gl.uniform2f(u.u_sole, Number.isFinite(st.soleX) ? st.soleX : -9, Number.isFinite(st.soleY) ? st.soleY : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** il fotogramma di mezzo fra quello preso e il successivo (null se non serve o il successivo non c'è ancora) */
  private fluido(p: Project, s: Sorgente, i: number, playing: boolean, f: VideoSample, t: Tex): WebGLTexture | null {
    const c = s.clip;
    const m = mediaOf(p, c);
    if (!m || !c.media) return null;
    const g = this.successivo
      ? this.successivo(s)
      : fotogramma(c.id + '~', c.media, f.timestamp + 1.05 / Math.max(1, m.fps || 25), playing, this.canvas.width * Math.min(1, c.tf.scale));
    if (!g || g instanceof ImageBitmap || g === f) return null;
    const dt = g.timestamp - f.timestamp;
    const un = 1 / Math.max(1, m.fps || 25);
    // dev'essere proprio il fotogramma dopo (mentre la ricerca è in corso può arrivare uno vecchio o uno lontano) e s.t deve stare in mezzo
    if (dt < un * 0.3 || dt > un * 1.9) return null;
    const w = (s.t - f.timestamp) / dt;
    if (w < 0.02 || w > 0.98) return null;
    const tb = this.upload('v:' + c.id + ':' + i + 'b', g.toCanvasImageSource(), g.displayWidth, g.displayHeight, g);
    this.interp ??= new Interpolatore(this.gl);
    return this.interp.mezzo('f:' + c.id + ':' + i, t, tb, f, w, f.displayWidth, f.displayHeight, c.fluido === 2);
  }

  /** disegna una sorgente nel buffer i (0 = A, 1 = B). Ritorna false se non c'è ancora niente da mostrare */
  private layer(p: Project, s: Sorgente, i: number, playing: boolean, frame: number): boolean {
    const gl = this.gl;
    const c = s.clip;
    const W = p.w, H = p.h;
    let srcKind = 0;
    let tex: WebGLTexture = this.blank;
    let sw = W, sh = H, orient = 0;
    let off: { dx: number; dy: number; scala?: number; alfa?: number } = { dx: 0, dy: 0 };
    let fit = true;
    if (c.kind === 'media' && c.media) {
      const m = mediaOf(p, c);
      if (!m) return false;
      const f = this.fornitore ? this.fornitore(s) : fotogramma(c.id, c.media, s.t, playing, this.canvas.width * Math.min(1, c.tf.scale));
      if (!f) return false;
      if (f instanceof ImageBitmap) {
        const t = this.upload('img:' + c.media, f, f.width, f.height, f);
        tex = t.tex;
        sw = f.width;
        sh = f.height;
      } else {
        const vf = f.toCanvasImageSource();
        const t = this.upload('v:' + c.id + ':' + i, vf, f.displayWidth, f.displayHeight, f);
        tex = t.tex;
        // rallentatore con il movimento fluido: fra questo fotogramma e il prossimo se ne inventa uno in mezzo
        if (c.fluido && c.speed < 0.98) tex = this.fluido(p, s, i, playing, f, t) ?? tex;
        orient = f.rotation;
        sw = orient % 180 ? f.displayHeight : f.displayWidth;
        sh = orient % 180 ? f.displayWidth : f.displayHeight;
        // pixel non quadrati (DV, HDV anamorfico): la larghezza giusta è quella "a pixel quadrati"
        if (f.squarePixelWidth && f.squarePixelHeight && !(orient % 180)) { sw = f.squarePixelWidth; sh = f.squarePixelHeight; }
      }
    } else if (c.kind === 'bars') {
      srcKind = c.gen?.bars === 'ebu' ? 2 : 1;
    } else if (c.kind === 'color') {
      srcKind = 3;
    } else if (c.kind === 'countdown') {
      const tela = disegnaCountdown(W, H, s.local, c.len * p.rate.den / p.rate.num, c.gen?.conto ?? 'pellicola');
      const t = this.upload('cd:' + c.id + ':' + i, tela as TexImageSource, tela.width, tela.height, frame + ':' + s.lf);
      tex = t.tex;
      sw = W; sh = H;
    } else if (c.kind === 'title' && c.gen?.anim) {
      // un'animazione del catalogo: disegnata a ogni fotogramma su una tela grande quanto il progetto
      const tela = disegnaAnimazione(c.gen.anim, W, H, s.local, c.len * p.rate.den / p.rate.num);
      const t = this.upload('an:' + c.id + ':' + i, tela as TexImageSource, W, H, frame + ':' + s.lf + ':' + firmaAnim(c.gen.anim));
      tex = t.tex;
      sw = W; sh = H;
      fit = false;
    } else if (c.kind === 'title') {
      const spec = specAlTempo(c.gen?.title ?? TITLE0, s.local);
      const tt = telaTitolo(spec, W, H);
      const t = this.upload('img:t:' + c.id, tt.tela as TexImageSource, tt.w, tt.h, tt.tela);
      tex = t.tex;
      sw = tt.w; sh = tt.h;
      fit = false;
      off = motoTitolo(spec, tt.w, tt.h, W, H, s.local, c.len * p.rate.den / p.rate.num);
    } else return false;

    // adattamento al quadro: la sorgente intera ci sta dentro senza deformarsi
    let dw = sw, dh = sh;
    if (fit) {
      const k = Math.min(W / sw, H / sh);
      dw = sw * k;
      dh = sh * k;
    }
    // la posizione di adesso (ferma, o in viaggio verso quella di fine)
    const tf = tfAl(c, s.lf), fx = c.fx;
    // se segue un oggetto tracciato (o si tiene fermo sul suo) c'è uno spostamento in più; sx = la clip stirata di lato
    const seg = spostaTraccia(p, c, c.start + s.lf);
    const sxx = tf.sx ?? 1;
    // le regolazioni a mano più tutti gli effetti al volo accesi, sommati
    const fe = fxEffettivo(fx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[i].fb);
    gl.viewport(0, 0, this.fbW, this.fbH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(this.pLayer);
    const u = this.uL;
    gl.uniform1i(u.u_numClic, 0); // anche la passata dell'ombra parte senza anelli
    gl.uniform1i(u.u_formaOn, 0); // e senza maschere a forma (si accendono solo per la clip vera)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, W, H);
    gl.uniform2f(u.u_size, dw * sxx, dh);
    // zoom lento (Ken Burns): la clip si avvicina piano piano lungo tutta la sua durata
    const kb = fe.zoom ? 1 + fe.zoom * Math.min(1, s.lf / Math.max(1, c.len)) : 1;
    const scala = tf.scale * kb * (off.scala ?? 1);
    gl.uniform1f(u.u_scale, scala);
    gl.uniform1f(u.u_rot, (tf.rot * Math.PI) / 180);
    gl.uniform1i(u.u_orient, orient);
    // angoli tondi e ombra: il raggio è una parte del lato corto di quello che si vede
    const bw = dw * sxx * scala, bh = dh * scala;
    const raggio = Math.max(0, Math.min(1, tf.angoli ?? 0)) * 0.5 * Math.min(bw * (1 - tf.cropL - tf.cropR), bh * (1 - tf.cropT - tf.cropB));
    gl.uniform2f(u.u_boxPx, bw, bh);
    gl.uniform4f(u.u_box, tf.cropL, tf.cropT, tf.cropR, tf.cropB);
    gl.uniform1i(u.u_grad, 0);
    if ((tf.ombra ?? 0) > 0) {
      this.coloreGpu.imposta(p, gradeClip(), u, false);
      // l'ombra: lo stesso rettangolo, nero, più grande e sfumato, un po' più in basso; poi la clip ci va sopra
      const sf = Math.max(4, (tf.ombra ?? 0) * Math.min(W, H) * 0.045);
      const ex = (sf * 2) / Math.max(1, bw), ey = (sf * 2) / Math.max(1, bh);
      gl.uniform4f(u.u_crop, tf.cropL - ex, tf.cropT - ey, tf.cropR - ex, tf.cropB - ey);
      gl.uniform2f(u.u_off, tf.x + off.dx + seg.dx, tf.y + off.dy + seg.dy + sf * 0.45);
      gl.uniform1i(u.u_src, 3);
      gl.uniform3f(u.u_color, 0, 0, 0);
      gl.uniform1f(u.u_bright, 0);
      gl.uniform1f(u.u_contrast, 1);
      gl.uniform1f(u.u_sat, 1);
      gl.uniform1f(u.u_hue, 0);
      gl.uniform1i(u.u_look, 0);
      gl.uniform1i(u.u_key, 0);
      gl.uniform1i(u.u_mirror, 0);
      gl.uniform1f(u.u_temp, 0);
      gl.uniform1f(u.u_vignette, 0);
      gl.uniform1i(u.u_auto, 0);
      gl.uniform1f(u.u_alpha, (off.alfa ?? 1) * Math.min(0.7, 0.3 + (tf.ombra ?? 0) * 0.45));
      gl.uniform1f(u.u_round, raggio + sf * 0.5);
      gl.uniform1f(u.u_feather, sf);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.uniform4f(u.u_crop, tf.cropL, tf.cropT, tf.cropR, tf.cropB);
    gl.uniform2f(u.u_off, tf.x + off.dx + seg.dx, tf.y + off.dy + seg.dy);
    gl.uniform1f(u.u_alpha, off.alfa ?? 1);
    gl.uniform1f(u.u_round, raggio);
    // il bordo arrotondato si sfuma di un pixel dello schermo (niente scalini)
    gl.uniform1f(u.u_feather, raggio > 0 ? Math.max(0.6, W / Math.max(1, this.fbW)) : 0);
    gl.uniform1i(u.u_src, srcKind);
    this.passataForma(c, sw / sh, u);
    const clic = anelliClic(p, c, s.t, s.lf);
    gl.uniform1i(u.u_numClic, clic.n);
    if (clic.n) {
      gl.uniform4fv(u.u_clic, clic.punti);
      gl.uniform3fv(u.u_clicColore, clic.colore);
      gl.uniform1f(u.u_clicRapporto, sw / sh);
    }
    const col = hex(c.gen?.color ?? '#000000');
    gl.uniform3f(u.u_color, col[0], col[1], col[2]);
    if (srcKind === 3 && c.gen?.color2) {
      const c2 = hex(c.gen.color2);
      gl.uniform1i(u.u_grad, 1);
      gl.uniform3f(u.u_color2, c2[0], c2[1], c2[2]);
    }
    this.coloreGpu.imposta(p, gradeClip(fx.colore), u, !!fx.colore);
    gl.uniform1f(u.u_bright, fe.bright);
    gl.uniform1f(u.u_contrast, fe.contrast);
    gl.uniform1f(u.u_sat, fe.sat);
    gl.uniform1f(u.u_hue, fe.hue);
    gl.uniform1i(u.u_look, fe.looks);
    gl.uniform1f(u.u_time, (frame % 10000) / 25);
    gl.uniform2f(u.u_texel, 1 / Math.max(1, dw), 1 / Math.max(1, dh));
    // lo sfondo tolto: con l'AI (la maschera di questo istante, se c'è) o con i colori / la luce
    const rit = c.ritaglio;
    const mk = rit && c.media ? maschereAl(rit.firma, s.t) : null;
    const colori = coloriChiave(fx);
    gl.uniform1i(u.u_key, mk ? 3 : fx.key === 'luma' ? 1 : fx.key === 'chroma' ? 2 : 0);
    const kc = hex(colori[0]);
    gl.uniform3f(u.u_keyColor, kc[0], kc[1], kc[2]);
    const extra = new Float32Array(6);
    for (let q = 1; q < colori.length; q++) extra.set(hex(colori[q]), (q - 1) * 3);
    gl.uniform3fv(u.u_keyExtra, extra);
    gl.uniform1i(u.u_keyN, Math.max(0, colori.length - 1));
    gl.uniform1i(u.u_vista, this.vistaChiave);
    gl.uniform1i(u.u_matte, 2);
    gl.uniform1i(u.u_matte2, 3);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, mk ? this.matte(`mk:${rit!.firma}:${mk.i}`, mk.w, mk.h, mk.a) : this.blank);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, mk ? this.matte(`mk:${rit!.firma}:${mk.i + (mk.b === mk.a ? 0 : 1)}`, mk.w, mk.h, mk.b) : this.blank);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(u.u_matteK, mk?.k ?? 0);
    if (mk && rit) {
      gl.uniform1f(u.u_keyLevel, 0);
      gl.uniform1f(u.u_keySoft, rit.morbido);
      gl.uniform1f(u.u_keyBordo, rit.bordo);
      gl.uniform1i(u.u_keyInv, rit.inverti ? 1 : 0);
      gl.uniform1f(u.u_keySpill, 0);
      gl.uniform1f(u.u_keySfuma, 0);
      gl.uniform1f(u.u_keyPulisci, 0);
    } else {
      gl.uniform1f(u.u_keyLevel, fx.keyLevel);
      gl.uniform1f(u.u_keySoft, fx.keySoft);
      gl.uniform1i(u.u_keyInv, fx.keyInvert ? 1 : 0);
      gl.uniform1f(u.u_keySpill, fx.keySpill ?? SPILL0);
      gl.uniform1f(u.u_keyBordo, fx.keyBordo ?? 0);
      gl.uniform1f(u.u_keySfuma, fx.keySfuma ?? 0);
      gl.uniform1f(u.u_keyPulisci, fx.keyPulisci ?? 0);
    }
    gl.uniform1i(u.u_mirror, fe.mirror ? 1 : 0);
    gl.uniform1f(u.u_temp, fe.temp);
    gl.uniform1f(u.u_vignette, fe.vignette);
    const an = c.media && autoColore(p, c) ? mediaRT(c.media)?.colore : undefined;
    gl.uniform1i(u.u_auto, an ? 1 : 0);
    if (an) {
      gl.uniform3f(u.u_autoLo, ...an.lo);
      gl.uniform3f(u.u_autoHi, ...an.hi);
      gl.uniform3f(u.u_autoWb, ...an.wb);
      gl.uniform1f(u.u_autoGamma, an.gamma);
      gl.uniform1f(u.u_autoK, masterDi(p).autoK);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    return true;
  }

  /** le maschere a forma della clip come texture a un canale (unità 6): si rifà solo se la forma, il tempo o le misure cambiano */
  private passataForma(c: Clip, aspetto: number, u: Record<string, WebGLUniformLocation | null>) {
    const gl = this.gl;
    const firma = firmaMaschere(c.maschere, aspetto);
    gl.uniform1i(u.u_forma, 6);
    gl.activeTexture(gl.TEXTURE6);
    if (!firma) { gl.bindTexture(gl.TEXTURE_2D, this.blank); gl.uniform1i(u.u_formaOn, 0); gl.activeTexture(gl.TEXTURE0); return; }
    let r = this.forme.get(firma);
    if (!r) {
      const x = rasterizzaMaschere(c.maschere, aspetto);
      if (!x) { gl.bindTexture(gl.TEXTURE_2D, this.blank); gl.uniform1i(u.u_formaOn, 0); gl.activeTexture(gl.TEXTURE0); return; }
      r = x;
      this.forme.set(firma, r);
      if (this.forme.size > 24) this.forme.delete(this.forme.keys().next().value!);
    } else { this.forme.delete(firma); this.forme.set(firma, r); }
    gl.bindTexture(gl.TEXTURE_2D, this.matte('fm:' + firma, r.w, r.h, r.dati));
    gl.uniform1i(u.u_formaOn, 1);
    gl.activeTexture(gl.TEXTURE0);
  }
  private forme = new Map<string, { w: number; h: number; dati: Uint8Array }>();

  /** una transizione fra A (buffer 0) e B (buffer "dentro"), scritta nel buffer "fuori": nel mix (2) si appoggia su
   *  quello che c'è già; in un buffer della catena (5, 6) lo riempie da capo */
  private combine(tr: Transition | null, prog: number, opacity: number, hasA: boolean, dentro = 1, fuori = 2, vecchia = 0) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[fuori].fb);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (fuori === 2) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.pComb);
    const u = this.uC;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbo[vecchia].tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fbo[dentro].tex);
    impostaCombina(gl, u, tr, prog, opacity, hasA, this.canvas.width / this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** legge l'uscita in piccolo (per gli strumenti di misura: forma d'onda e vettorscopio) */
  leggiPiccolo(w: number, h: number, out: Uint8Array) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    // si ridisegna l'uscita in un buffer piccolo con blit, poi si legge
    if (!this.small || this.smallW !== w || this.smallH !== h) {
      if (this.small) { gl.deleteFramebuffer(this.small.fb); gl.deleteRenderbuffer(this.small.rb); }
      const rb = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
      this.small = { fb, rb };
      this.smallW = w;
      this.smallH = h;
    }
    if (!this.fbo.length) { out.fill(0); return; }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo[this.uscita].fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.small.fb);
    gl.blitFramebuffer(0, 0, this.fbW, this.fbH, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.small.fb);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  private small: { fb: WebGLFramebuffer; rb: WebGLRenderbuffer } | null = null;
  private smallW = 0;
  private smallH = 0;

  /** dimentica le texture di un'immagine o di un titolo cambiato */
  dimentica(prefix: string) {
    for (const [k, t] of this.texs) if (k.startsWith(prefix)) { this.gl.deleteTexture(t.tex); this.texs.delete(k); }
  }

  distruggi() {
    const gl = this.gl;
    for (const t of this.texs.values()) gl.deleteTexture(t.tex);
    this.texs.clear();
    this.coloreGpu.distruggi();
    for (const f of this.fbo) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
    this.fbo = [];
    this.interp?.distruggi();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
