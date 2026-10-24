// Scena sintetica condivisa dalle prove pure e dal banco CPU: niente DOM o media.
export function scena(P, B, ids = ['bn'], forza = 1) {
  const p = P.newProject({ w: 1920, h: 1080, rate: { num: 25, den: 1 }, drop: false });
  const t = p.tracks.find((t) => t.kind === 'video').id;
  p.clips = [P.newClip('bars', t, 0, 250)];
  for (const id of ids) B.posaBlocco(p, { ...B.nuovoBlocco('effetto', id), forza }, 0, 250, t);
  return p;
}

export function campioni(P, B) {
  return Object.fromEntries(B.EFFETTI_TEMPO.map(({ id }) => [id,
    [0, 37, 125, 249].map((f) => B.statoEffetti(scena(P, B, [id]), f)),
  ]));
}
