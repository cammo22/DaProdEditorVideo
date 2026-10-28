// Un server statico minimo per le prove: serve dist/ (il build) con i tipi giusti.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.md': 'text/markdown' };

export function servi(dir, porta = 0) {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
      // COI=1: come l'app con le intestazioni che permettono i thread del wasm (SharedArrayBuffer); serve solo alle misure a mano
      const coi = process.env.COI ? { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' } : {};
      res.writeHead(200, { 'content-type': TIPI[path.extname(f)] ?? 'application/octet-stream', ...coi });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(porta, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${s.address().port}`, chiudi: () => s.close() }));
  });
}
