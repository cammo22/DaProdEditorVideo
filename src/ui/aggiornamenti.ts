// Aggiornamenti e novità. Nell'app installata il tasto in alto controlla l'ultima release su GitHub: se c'è una
// versione nuova la fa vedere (con le sue novità) e la scarica e la apre con un clic. Controlla da sola all'apertura
// e poi ogni 4 ore: se c'è, il tasto si accende e dice «Aggiornamento X.Y.Z disponibile». Dopo un aggiornamento, alla prima apertura, compaiono le novità della
// versione (dal CHANGELOG che viaggia dentro l'app).
import CHANGELOG from '../../CHANGELOG.md?raw';
import { avviso, dialogo, h } from './dom';
import { VERSIONE } from './dialoghi';
import { apriLink, invoke, isAndroid, isTauri } from '../platform';

const API = 'https://api.github.com/repos/cammo22/DaProdVideo/releases/latest';
const PAGINA = 'https://github.com/cammo22/DaProdVideo/releases/latest';
const CONTROLLO_OGNI = 4 * 3600 * 1000;
const DOPO_ERRORE = 20 * 60 * 1000;

interface Asset { name: string; browser_download_url: string; size: number }
export interface Release { versione: string; titolo: string; note: string; assets: Asset[]; pagina: string }

/** 1.0.10 > 1.0.9 */
export function piuNuova(a: string, b: string): boolean {
  const x = a.replace(/^v/, '').split('.').map(Number), y = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

export async function ultimaRelease(): Promise<Release> {
  // Nell'app usa la rete di sistema: il controllo non dipende dalla WebView.
  // Il backend prova anche il feed della release se l'API GitHub è limitata.
  type Dati = { tag_name: string; name: string; body: string; assets: Asset[]; html_url: string };
  let j: Dati;
  if (isTauri && !isAndroid) j = await invoke<Dati>('aggiornamento_release');
  else {
    const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`GitHub risponde ${r.status}`);
    j = await r.json() as Dati;
  }
  if (!/^v?\d+\.\d+\.\d+$/.test(j.tag_name) || !Array.isArray(j.assets)) throw new Error('La release non contiene dati di aggiornamento validi');
  return { versione: j.tag_name.replace(/^v/, ''), titolo: j.name || j.tag_name, note: j.body || '', assets: j.assets || [], pagina: j.html_url || PAGINA };
}

/** la parte del CHANGELOG di una versione (quella che viaggia dentro l'app) */
export function noteDi(versione: string, testo = CHANGELOG): { titolo: string; note: string } | null {
  const righe = testo.split('\n');
  const i = righe.findIndex((r) => r.startsWith(`## [${versione}]`));
  if (i < 0) return null;
  let j = righe.findIndex((r, k) => k > i && r.startsWith('## '));
  if (j < 0) j = righe.length;
  return { titolo: righe[i].replace(/^##\s*/, ''), note: righe.slice(i + 1, j).join('\n').trim() };
}

/** un markdown piccolo piccolo: titoli ###, elenchi, **grassetto**, `codice`, [link](…) */
export function markdown(md: string): HTMLElement {
  const box = h('div', { class: 'novita-testo' });
  let lista: HTMLElement | null = null;
  let voce: HTMLElement | null = null;
  const inline = (t: string) => {
    const el = h('span');
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let k = 0, m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      if (m.index > k) el.append(t.slice(k, m.index));
      if (m[1]) el.append(h('b', null, m[1]));
      else if (m[2]) el.append(h('code', null, m[2]));
      else { const url = m[4]; el.append(h('a', { href: '#', on: { click: (e: Event) => { e.preventDefault(); apriLink(url); } } }, m[3])); }
      k = re.lastIndex;
    }
    if (k < t.length) el.append(t.slice(k));
    return el;
  };
  for (const r0 of md.split('\n')) {
    const r = r0.trimEnd();
    const li = r.match(/^(\s*)[-*]\s+(.*)$/);
    if (li) {
      if (!lista) { lista = h('ul'); box.append(lista); }
      voce = h('li', null, inline(li[2]));
      if (li[1].length >= 2) voce.classList.add('sotto');
      lista.append(voce);
      continue;
    }
    // una riga rientrata sotto una voce è il seguito della voce (le frasi lunghe del CHANGELOG vanno a capo)
    if (lista && voce && /^\s+\S/.test(r)) { voce.append(' ', inline(r.trim())); continue; }
    lista = null;
    voce = null;
    if (!r.trim()) continue;
    if (r.startsWith('### ')) box.append(h('h4', null, inline(r.slice(4))));
    else if (r.startsWith('## ')) box.append(h('h3', null, inline(r.slice(3))));
    else box.append(h('p', null, inline(r)));
  }
  return box;
}

/** le novità della versione che stai usando (o di un'altra) */
export function finestraNovita(versione = VERSIONE) {
  const n = noteDi(versione);
  const d = dialogo(`Novità di DaProd Video ${versione}`, { largo: true });
  d.el.classList.add('novita');
  if (n) d.corpo.append(h('div', { class: 'novita-titolo' }, n.titolo.replace(/^\[[^\]]+\]\s*—?\s*/, '')), markdown(n.note));
  else d.corpo.append(h('p', null, 'Le novità di questa versione sono nel CHANGELOG su GitHub.'));
  d.piede.append(
    h('button', { class: 'btn', on: { click: () => apriLink('https://github.com/cammo22/DaProdVideo/blob/main/CHANGELOG.md') } }, 'Tutte le versioni'),
    h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'Si parte'));
}

/** dopo un aggiornamento, alla prima apertura: le novità da sole (una volta sola) */
export function novitaDopoAggiornamento() {
  let vista: string | null = null, giaUsata = false;
  try {
    vista = localStorage.getItem('dpv-versione-vista');
    // chi arriva dalla 1.0.4 (che non segnava la versione) ha già il banco sistemato o i proxy scelti
    giaUsata = localStorage.getItem('dpv-banco') !== null || localStorage.getItem('dpv-proxy') !== null;
    localStorage.setItem('dpv-versione-vista', VERSIONE);
  } catch { return; }
  if (vista ? vista !== VERSIONE && piuNuova(VERSIONE, vista) : giaUsata) setTimeout(() => finestraNovita(), 900);
}

interface Variante { os: string; portatile: boolean }
let variante: Variante | null = null;
async function laVariante(): Promise<Variante> {
  if (variante) return variante;
  try { variante = await invoke<Variante>('variante_app'); } catch { variante = { os: isAndroid ? 'android' : 'web', portatile: false }; }
  return variante;
}

/** il file giusto della release per questa app */
function fileGiusto(r: Release, v: Variante): Asset | undefined {
  const fine = v.os === 'windows' ? (v.portatile ? '-portatile.exe' : '-setup.exe') : v.os === 'macos' ? '.dmg' : v.os === 'android' ? '.apk' : '';
  return fine ? r.assets.find((a) => a.name.endsWith(fine)) : undefined;
}

let tasto: HTMLElement | null = null;

/** il tasto in alto (solo nell'app): controlla, e si accende se c'è una versione nuova */
export function tastoAggiornamenti(icona: (n: string, s?: number) => SVGElement): HTMLElement | null {
  if (!isTauri) return null;
  const testo = h('span', { class: 'aggiorna-testo' });
  tasto = h('button', { class: 'btn-icona tasto-aggiorna', title: 'Aggiornamenti e novità', on: { click: () => void finestraAggiornamenti() } }, icona('aggiorna', 18), h('span', { class: 'aggiorna-punto' }), testo);
  // all'apertura (dopo qualche secondo) e poi ogni 4 ore: senza internet si riprova dopo 20 minuti, senza dire niente
  let avvisata = '';
  const controlla = () => {
    ultimaRelease().then((r) => {
      if (piuNuova(r.versione, VERSIONE)) {
        tasto?.classList.add('nuova');
        testo.textContent = `Aggiornamento ${r.versione} disponibile`;
        tasto?.setAttribute('title', `È uscita la versione ${r.versione}: clic per le novità e per aggiornare`);
        if (avvisata !== r.versione) { avvisata = r.versione; avviso(`⬆ È uscita DaProd Video ${r.versione}: clic sul tasto in alto per aggiornare`, 'info', 5000); }
      }
      setTimeout(controlla, CONTROLLO_OGNI);
    }).catch(() => { setTimeout(controlla, DOPO_ERRORE); });
  };
  setTimeout(controlla, 6000);
  return tasto;
}

/** la finestra: controlla, mostra le novità della nuova versione, scarica e apre */
export async function finestraAggiornamenti() {
  const d = dialogo('Aggiornamenti', { largo: true });
  d.el.classList.add('novita');
  const stato = h('div', { class: 'agg-stato' }, 'Controllo se c\'è una versione nuova…');
  const corpo = h('div');
  d.corpo.append(h('div', { class: 'agg-attuale' }, `Stai usando la versione `, h('b', null, VERSIONE)), stato, corpo);
  const chiudi = h('button', { class: 'btn', on: { click: d.chiudi } }, 'Chiudi');
  d.piede.append(h('button', { class: 'btn', on: { click: () => { d.chiudi(); finestraNovita(); } } }, `Novità della ${VERSIONE}`), chiudi);
  let r: Release;
  try { r = await ultimaRelease(); } catch (e) {
    stato.textContent = 'Non riesco a controllare (serve internet): ' + (e instanceof Error ? e.message : String(e));
    d.piede.prepend(h('button', { class: 'btn', on: { click: () => apriLink(PAGINA) } }, 'Apri la pagina delle versioni'));
    return;
  }
  if (!piuNuova(r.versione, VERSIONE)) {
    stato.replaceChildren(h('span', { class: 'agg-ok' }, '✓'), ` Hai l'ultima versione (${VERSIONE}).`);
    tasto?.classList.remove('nuova');
    tasto?.querySelector('.aggiorna-testo')?.replaceChildren();
    return;
  }
  const v = await laVariante();
  const file = fileGiusto(r, v);
  stato.replaceChildren(h('span', { class: 'agg-nuova' }, '⬆'), ' È uscita la versione ', h('b', null, r.versione), '!');
  corpo.append(h('div', { class: 'novita-titolo' }, r.titolo), markdown(r.note));
  const barra = h('div', { class: 'ai-barra' }, h('i'));
  const fase = h('div', { class: 'ai-fase' });
  const nomeVariante = v.os === 'windows' ? (v.portatile ? 'Windows portatile' : 'Windows') : v.os === 'macos' ? 'Mac' : v.os === 'android' ? 'Android' : v.os;
  const vai = h('button', { class: 'btn primario' }, file ? `Aggiorna alla ${r.versione} (${nomeVariante})` : 'Apri la pagina delle versioni');
  d.piede.prepend(vai);
  d.corpo.append(barra, fase);
  let scaricato: string | null = null;
  vai.addEventListener('click', async () => {
    if (!file) { apriLink(r.pagina); return; }
    if (scaricato) {
      try { await invoke('aggiornamento_apri', { path: scaricato }); } catch (err) { avviso('Non si apre: ' + String(err), 'errore', 4000); }
      return;
    }
    if (v.os === 'android' || v.os === 'ios') {
      // il telefono scarica l'APK dal browser e lo installa lui
      apriLink(file.browser_download_url);
      fase.textContent = 'Il download parte nel browser: apri il file .apk per installare (Android chiede il permesso la prima volta).';
      return;
    }
    vai.disabled = true;
    barra.classList.add('attiva');
    const accanto = v.os === 'windows' && v.portatile;
    const giro = window.setInterval(async () => {
      const n = await invoke<number>('aggiornamento_progresso', { nome: file.name, accanto }).catch(() => 0);
      (barra.firstChild as HTMLElement).style.width = Math.round(Math.min(1, n / Math.max(1, file.size)) * 100) + '%';
      fase.textContent = `Scarico ${file.name}: ${(n / 1048576).toFixed(1)} di ${(file.size / 1048576).toFixed(1)} MB`;
    }, 300);
    try {
      const path = await invoke<string>('aggiornamento_scarica', { url: file.browser_download_url, nome: file.name, accanto });
      clearInterval(giro);
      (barra.firstChild as HTMLElement).style.width = '100%';
      fase.textContent = v.os === 'windows'
        ? (v.portatile ? `Pronta: ${path}. Si apre la nuova, questa si chiude (poi puoi cancellare il file vecchio).` : 'Pronta: parte l\'installazione, DaProd Video si chiude e si riapre aggiornato.')
        : 'Pronto: si apre il file .dmg. Trascina DaProd Video in Applicazioni (sostituisci quella vecchia).';
      vai.textContent = v.os === 'windows' ? 'Installa adesso' : 'Apri';
      vai.disabled = false;
      scaricato = path;
    } catch (e) {
      clearInterval(giro);
      barra.classList.remove('attiva');
      vai.disabled = false;
      fase.textContent = 'Il download non è riuscito: ' + String(e) + ' · puoi scaricarla dalla pagina delle versioni.';
      d.piede.prepend(h('button', { class: 'btn', on: { click: () => apriLink(r.pagina) } }, 'Pagina delle versioni'));
    }
  });
}
