// Registriamo upload/uniform e ciclo di vita. Queste prove NON confrontano pixel di una GPU vera.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carica } from './_aiuti.mjs';
const { ColoreGpu, UNIFORM_COLORE } = await carica('coloreGpu'), G = await carica('colore'), L = await carica('lut');
const lut = { ...L.parseCube('LUT_3D_SIZE 2\nDOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 2 2 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1'), id: 'prova', hash: 'abc' };
function glFinto(fallisceFloat = false) {
  const gl = {}, caricamenti = [], uniform = new Map(), cancellate = [], binding = new Map(), flags = new Map();
  const nomi = ['TEXTURE_2D', 'TEXTURE_3D', 'TEXTURE_BINDING_2D', 'TEXTURE_BINDING_3D', 'ACTIVE_TEXTURE', 'MAX_3D_TEXTURE_SIZE', 'UNPACK_FLIP_Y_WEBGL', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'TEXTURE_WRAP_R', 'LINEAR', 'CLAMP_TO_EDGE', 'RGBA16F', 'RGBA8', 'RGBA', 'FLOAT', 'UNSIGNED_BYTE'];
  nomi.forEach((n, i) => { gl[n] = i + 1; }); gl.TEXTURE4 = 104; gl.TEXTURE5 = 105; gl.NO_ERROR = 0;
  let active = 100, seq = 0, errore = 0;
  flags.set(gl.UNPACK_FLIP_Y_WEBGL, true); flags.set(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.getParameter = (p) => p === gl.ACTIVE_TEXTURE ? active : p === gl.MAX_3D_TEXTURE_SIZE ? 65 : flags.has(p) ? flags.get(p) : binding.get(active + ':' + (p === gl.TEXTURE_BINDING_2D ? gl.TEXTURE_2D : gl.TEXTURE_3D)) ?? null;
  gl.activeTexture = (v) => { active = v; };
  gl.createTexture = () => ({ id: ++seq }); gl.deleteTexture = (t) => cancellate.push(t);
  gl.bindTexture = (target, t) => binding.set(active + ':' + target, t);
  gl.pixelStorei = (k, v) => flags.set(k, v); gl.texParameteri = () => {};
  gl.texImage2D = (...args) => upload(2, args); gl.texImage3D = (...args) => upload(3, args);
  function upload(dim, args) {
    assert.equal(flags.get(gl.UNPACK_FLIP_Y_WEBGL), false); assert.equal(flags.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), false);
    caricamenti.push({ dim, args, active });
    if (fallisceFloat && args[2] === gl.RGBA16F) errore = 999;
  }
  gl.getError = () => { const e = errore; errore = 0; return e; };
  gl.uniform1i = gl.uniform1f = (k, v) => uniform.set(k, v); gl.uniform3f = (k, ...v) => uniform.set(k, v);
  return { gl, caricamenti, uniform, cancellate, flags };
}
const u = Object.fromEntries(UNIFORM_COLORE.map((n) => [n, n]));

test('GPU registrata: texture 3D float RGB ordinato, domini, intensità, sampler distinti e riuso per hash', () => {
  const { gl, caricamenti, uniform, flags, cancellate } = glFinto();
  const gpu = new ColoreGpu(gl), p = { luts: [lut] }, grade = G.gradeClip({ lut: { id: lut.id, intensita: .5 } });
  gpu.inizia(); gpu.imposta(p, grade, u, true); gpu.finisce();
  const cubi = caricamenti.filter((c) => c.dim === 3);
  assert.equal(cubi.length, 1); assert.equal(cubi[0].args[2], gl.RGBA16F);
  assert.deepEqual(cubi[0].args.slice(3, 6), [2, 2, 2]);
  const rgba = cubi[0].args.at(-1);
  for (let i = 0; i < 8; i++) { assert.deepEqual([...rgba.slice(i * 4, i * 4 + 3)], lut.dati.slice(i * 3, i * 3 + 3)); assert.equal(rgba[i * 4 + 3], 1); }
  assert.equal(uniform.get('u_caIntensity'), .5); assert.deepEqual(uniform.get('u_caMin'), [-1, -1, -1]); assert.deepEqual(uniform.get('u_caMax'), [2, 2, 2]);
  assert.equal(uniform.get('u_caLut'), 5); assert.equal(uniform.get('u_caCurve'), 4);
  assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), 100); assert.equal(flags.get(gl.UNPACK_FLIP_Y_WEBGL), true); assert.equal(flags.get(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), true);
  gpu.inizia(); gpu.imposta(structuredClone(p), grade, u, false); gpu.finisce(); assert.equal(caricamenti.length, 2);
  gpu.inizia(); gpu.finisce(); assert.equal(cancellate.length, 2);
  gpu.inizia(); gpu.imposta(p, grade, u, true); gpu.finisce(); assert.equal(caricamenti.length, 4); // risorse ricreate dopo pulizia
  gpu.distruggi(); assert.equal(cancellate.length, 4);
});

test('GPU registrata: ripiego RGBA8 dichiarato e limiti dispositivo prima dell’upload LUT', () => {
  const { gl, caricamenti } = glFinto(true), gpu = new ColoreGpu(gl);
  const warn = console.warn; console.warn = () => {};
  try { gpu.imposta({ luts: [lut] }, G.gradeClip({ lut: { id: lut.id, intensita: 1 } }), u, false); }
  finally { console.warn = warn; }
  assert.equal(gpu.avvisi.size, 1); assert.equal(caricamenti.filter((c) => c.args[2] === gl.RGBA8).length, 2);
  const piccolo = glFinto(), get = piccolo.gl.getParameter;
  piccolo.gl.getParameter = (p) => p === piccolo.gl.MAX_3D_TEXTURE_SIZE ? 1 : get(p);
  const g2 = new ColoreGpu(piccolo.gl);
  assert.throws(() => g2.imposta({ luts: [lut] }, G.gradeClip({ lut: { id: lut.id, intensita: 1 } }), u, false), /troppo grande/);
  assert.equal(piccolo.caricamenti.some((c) => c.dim === 3), false); assert.equal(piccolo.gl.getParameter(piccolo.gl.ACTIVE_TEXTURE), 100);
});
