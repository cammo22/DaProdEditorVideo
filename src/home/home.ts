// La home di GitHub Pages: timecode che corre, link diretti ai file dell'ultima release, novità dal CHANGELOG.
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-700.css';
import './home.css';
import changelog from '../../CHANGELOG.md?raw';

declare const __VERSIONE__: string;
const REPO = 'cammo22/DaProdEditorVideo';
const $ = (id: string) => document.getElementById(id)!;
$('versione').textContent = __VERSIONE__;
$('versionePiede').textContent = __VERSIONE__;

// il contatore del registratore che gira
const t0 = performance.now();
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const giro = () => {
  const f = Math.floor(((performance.now() - t0) / 1000) * 25);
  $('tcEroe').textContent = `${pad(f / 90000)}:${pad((f / 1500) % 60)}:${pad((f / 25) % 60)}:${pad(f % 25)}`;
  requestAnimationFrame(giro);
};
giro();

// link diretti ai file dell'ultima release
fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then((r) => (r.ok ? r.json() : null)).then((rel) => {
  if (!rel?.assets) return;
  const trova = (re: RegExp) => rel.assets.find((a: { name: string }) => re.test(a.name))?.browser_download_url as string | undefined;
  const mappa: Record<string, string | undefined> = {
    'win-port': trova(/portatile\.exe$/i), 'win-setup': trova(/setup\.exe$/i), mac: trova(/\.dmg$/i), android: trova(/\.apk$/i),
  };
  document.querySelectorAll<HTMLAnchorElement>('.app[data-os]').forEach((a) => { const u = mappa[a.dataset.os!]; if (u) a.href = u; });
  $('dove').innerHTML = `Ultima versione: <a href="${rel.html_url}">${rel.tag_name}</a> · <a href="https://github.com/${REPO}/releases">tutte le release</a>`;
}).catch(() => {});

// novità: le ultime tre versioni del CHANGELOG
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<kbd>$1</kbd>');
const blocchi = changelog.split(/^---$/m)[0].split(/^## /m).slice(1, 4);
$('novitaLista').innerHTML = blocchi.map((b) => {
  const [testa, ...righe] = b.split('\n');
  const corpo = righe.map((r) => r.startsWith('### ') ? `<h4>${inline(r.slice(4))}</h4>` : r.startsWith('- ') ? `<li>${inline(r.slice(2))}</li>` : r.trim() ? `<p>${inline(r)}</p>` : '').join('')
    .replace(/(<li>[\s\S]*?<\/li>)(?!<li>)/g, '<ul>$1</ul>');
  return `<article class="versione"><h3>${inline(testa.replace(/[[\]]/g, ''))}</h3>${corpo}</article>`;
}).join('');
