// Il feed di riserva ha lo stesso formato dell'API GitHub: non richiede token né quota API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function creaFeed(dir, versione, note = '') {
  if (!/^\d+\.\d+\.\d+$/.test(versione)) throw new Error('Versione non valida');
  const base = `https://github.com/cammo22/DaProdVideo/releases/download/v${versione}/`;
  const nomi = [`DaProd-Video-${versione}-portatile.exe`, `DaProd-Video-${versione}-setup.exe`, `DaProd-Video-${versione}.dmg`];
  const assets = nomi.map(name => {
    const size = fs.statSync(path.join(dir, name)).size;
    if (!size) throw new Error(`File vuoto: ${name}`);
    return { name, size, browser_download_url: base + name };
  });
  return { tag_name: `v${versione}`, name: `DaProd Video ${versione}`, body: note, assets,
    html_url: `https://github.com/cammo22/DaProdVideo/releases/tag/v${versione}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, versione, note] = process.argv.slice(2);
  fs.writeFileSync(path.join(dir, 'aggiornamento.json'), JSON.stringify(creaFeed(dir, versione, note ? fs.readFileSync(note, 'utf8') : ''), null, 2) + '\n');
}
