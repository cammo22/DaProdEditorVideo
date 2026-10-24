
// Prova del controllo aggiornamenti di DaProd Video senza browser: bundle con esbuild, DOM finto, tempo finto.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const dir = path.resolve('test/.out/agg'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/cl.js', 'export default ""');
fs.writeFileSync(dir + '/dialoghi.js', 'export const VERSIONE = "1.5.6"');
fs.writeFileSync(dir + '/platform.js', `export const isTauri = true, isAndroid = false; export const apriLink = () => {};
export const invoke = async (cmd) => { if (cmd !== 'aggiornamento_release') throw new Error('comando inatteso: ' + cmd); return (await fetch('rete-di-sistema')).json(); };`);
fs.writeFileSync(dir + '/dom.js', `
  export const avviso = (t) => { globalThis.__avvisi.push(t); };
  export const dialogo = () => ({});
  export function h(tag, attrs, ...figli) {
    const el = { tag, cls: new Set((attrs?.class || '').split(' ').filter(Boolean)), attrs: {...(attrs||{})}, figli, textContent: '',
      classList: { add: (c) => el.cls.add(c), remove: (c) => el.cls.delete(c) },
      setAttribute: (k, v) => { el.attrs[k] = v; },
      querySelector: (s) => figli.find((f) => f && f.cls && f.cls.has(s.slice(1))) || null,
      replaceChildren: () => { el.textContent = ''; } };
    return el;
  }`);
let js = fs.readFileSync('src/ui/aggiornamenti.ts', 'utf8'); // Node toglie i tipi da solo (.ts)
js = js.replace("'../../CHANGELOG.md?raw'", "'./cl.js'").replace("'./dom'", "'./dom.js'").replace("'./dialoghi'", "'./dialoghi.js'").replace("'../platform'", "'./platform.js'");
const out = dir + '/aggiornamenti.ts';
fs.writeFileSync(out, js);
// tempo finto + rete finta
const timers = []; let ora = 0;
globalThis.__avvisi = [];
globalThis.setTimeout = (f, ms) => { timers.push({ f, t: ora + ms }); return timers.length; };
globalThis.localStorage = { getItem: () => null, setItem() {} };
let rete = 'ok', chiamate = 0;
globalThis.fetch = async () => { chiamate++; if (rete === 'giu') throw new Error('offline'); return { ok: true, json: async () => ({ tag_name: 'v9.9.9', name: 'x', body: '', assets: [], html_url: '' }) }; };
const avanza = async (ms) => { const fine = ora + ms; for (;;) { timers.sort((a, b) => a.t - b.t); const n = timers.find((x) => x.t <= fine); if (!n) break; timers.splice(timers.indexOf(n), 1); ora = n.t; n.f(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); } ora = fine; };
const m = await import(pathToFileURL(out).href);
const tasto = m.tastoAggiornamenti(() => ({}));
const testo = () => tasto.figli.find((f) => f.cls?.has('aggiorna-testo')).textContent;
let ok = true; const verifica = (nome, c) => { console.log((c ? 'OK   ' : 'FAIL ') + nome); if (!c) ok = false; };
verifica('prima dei 6 secondi niente richieste', chiamate === 0);
await avanza(6100);
verifica('all\'avvio controlla (1 richiesta)', chiamate === 1);
verifica('badge: ' + testo(), testo() === 'Aggiornamento 9.9.9 disponibile' && tasto.cls.has('nuova'));
verifica('toast una volta', globalThis.__avvisi.length === 1);
await avanza(3 * 3600 * 1000);
verifica('dopo 3 ore non richiama', chiamate === 1);
await avanza(1.1 * 3600 * 1000);
verifica('dopo 4 ore ricontrolla', chiamate === 2);
verifica('toast non ripetuto', globalThis.__avvisi.length === 1);
rete = 'giu';
await avanza(4.1 * 3600 * 1000);
verifica('offline: tollerato, nessuna eccezione, riprova', chiamate === 3);
await avanza(21 * 60 * 1000);
verifica('offline: riprova dopo 20 minuti', chiamate === 4);
rete = 'ok';
await avanza(21 * 60 * 1000);
verifica('torna la rete: ricontrolla e il badge resta', chiamate === 5 && testo() === 'Aggiornamento 9.9.9 disponibile');
process.exit(ok ? 0 : 1);
