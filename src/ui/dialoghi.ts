// Le finestre: esporta, impostazioni del progetto, tasti, informazioni.
import { store } from '../core/store';
import { CADENZE, RISOLUZIONI, formatoDa, sceltaDa } from '../core/tipi';
import { projectEnd } from '../core/progetto';
import { scalaAnim } from '../core/automazioni';
import { frameToTc } from '../core/timecode';
import { azioni } from '../azioni';
import { fotogrammaPng } from '../export/esporta';
import { creaEdl } from '../export/edl';
import { dialogoSalva, edizione, invoke, isTauri, salvaTesto, scarica, apriLink } from '../platform';
import { avviso, dialogo, h } from './dom';
import { motore } from '../motore';
import { pannelloEsporta, type PannelloEsporta } from './esportazione';

declare const __VERSIONE__: string;
export const VERSIONE = __VERSIONE__;

/** la finestra dell'export (Ctrl+M): lo stesso pannello della pagina Finale (preset, cosa esce, coda). Si può chiudere
 *  quando si vuole: le esportazioni in coda continuano da sole e si vedono anche in Attività. */
export function finestraEsporta(scelta: { preset?: string } = {}) {
  const p = store.doc;
  motore.stop();
  const fine = projectEnd(p);
  if (!fine) { avviso('La timeline è vuota: prima monta qualcosa', 'info'); return; }
  let pannello: PannelloEsporta | null = null;
  const d = dialogo('Esporta', { largo: true, onChiudi: () => pannello?.smonta() });
  d.el.classList.add('dlg-esporta');
  pannello = pannelloEsporta(scelta.preset);
  d.corpo.append(pannello.el);
  d.piede.append(
    h('button', { class: 'btn', title: 'La lista di montaggio per Resolve, Avid, Premiere, EDIUS', on: { click: () => esportaEdl() } }, 'EDL CMX3600'),
    h('button', { class: 'btn', title: 'Il fotogramma sotto il cursore, a piena risoluzione', on: { click: () => esportaFotogramma() } }, 'Fotogramma PNG'),
    h('span', { class: 'spazio' }),
    h('button', { class: 'btn', on: { click: d.chiudi } }, 'Chiudi'));
}

export async function esportaEdl() {
  const p = store.doc;
  const r = await salvaTesto(p.name.replace(/[\\/:*?"<>|]/g, '_') + '.edl', creaEdl(p), 'edl');
  if (r) avviso('📋 EDL salvata', 'ok');
}

export async function esportaFotogramma() {
  const p = store.doc;
  const f = Math.round(store.head);
  const blob = await fotogrammaPng(p, f);
  const nome = `${p.name.replace(/[\\/:*?"<>|]/g, '_')}_${frameToTc(f, p.rate, p.drop).replace(/[:;]/g, '-')}.png`;
  if (isTauri) {
    const path = await dialogoSalva(nome, 'png', 'image/png');
    if (!path) return;
    const id = await invoke<number>('export_apri', { path });
    await invoke('export_scrivi', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-id': String(id), 'x-pos': '0' } });
    await invoke('export_chiudi', { id });
  } else scarica(blob, nome);
  avviso('🖼 Fotogramma salvato', 'ok');
}

export function finestraProgetto() {
  const p = store.doc;
  const d = dialogo('Impostazioni del progetto');
  d.el.classList.add('medio');
  const nome = h('input', { class: 'campo-testo', value: p.name }) as HTMLInputElement;
  const a = sceltaDa(p.w, p.h, p.rate);
  const attuale = `Attuale · ${p.w}×${p.h} ${(p.rate.num / p.rate.den).toFixed(2)} fps`;
  const risSel = h('select', { class: 'mini-select' },
    RISOLUZIONI.map((r) => h('option', { value: r.id, selected: r.id === a.ris }, `${r.nome} · ${r.w}×${r.h} (${r.info.split(' · ')[1] ?? ''})`)),
    a.ris ? null : h('option', { value: '', selected: true }, attuale)) as HTMLSelectElement;
  const cadSel = h('select', { class: 'mini-select' },
    CADENZE.map((c) => h('option', { value: c.id, selected: c.id === a.cad }, `${c.nome} fps · ${c.info}`)),
    a.cad ? null : h('option', { value: '', selected: true }, attuale)) as HTMLSelectElement;
  const pre = h('input', { type: 'number', class: 'num', min: 0, max: 10, step: 0.5, value: String(p.preroll) }) as HTMLInputElement;
  d.corpo.append(h('div', { class: 'form' },
    h('label', null, 'Nome'), nome,
    h('label', null, 'Risoluzione'), risSel,
    h('label', null, 'Fotogrammi al secondo'), cadSel,
    h('label', null, 'Preroll (s)'), pre),
  h('p', { class: 'nota' }, 'Cambiare il formato non tocca le clip: il timecode si ricalcola alla nuova cadenza. Il preroll è quanto il REVIEW parte prima del taglio.'));
  d.piede.append(h('button', { class: 'btn', on: { click: d.chiudi } }, 'Annulla'), h('button', {
    class: 'btn primario', on: {
      click: () => {
        const f = risSel.value || cadSel.value ? formatoDa(risSel.value || (a.ris ?? 'fhd'), cadSel.value || (a.cad ?? '25')) : null;
        // una scelta fuori dall'elenco (un formato strano di un vecchio progetto) resta com'è finché non ne scegli una pronta
        const f2 = !risSel.value && !cadSel.value ? null : { ...f!, w: risSel.value ? f!.w : p.w, h: risSel.value ? f!.h : p.h, rate: cadSel.value ? f!.rate : { ...p.rate }, drop: cadSel.value ? f!.drop : p.drop };
        store.edit('Impostazioni progetto', (pp) => {
          pp.name = nome.value || pp.name;
          pp.preroll = Number(pre.value) || 0;
          if (f2) {
            // le posizioni restano nello stesso istante: si convertono i fotogrammi
            const k = (f2.rate.num / f2.rate.den) / (pp.rate.num / pp.rate.den);
            if (Math.abs(k - 1) > 1e-6) {
              for (const c of pp.clips) { const e = Math.round((c.start + c.len) * k); c.start = Math.round(c.start * k); c.len = Math.max(1, e - c.start); c.fadeIn = Math.round(c.fadeIn * k); c.fadeOut = Math.round(c.fadeOut * k); if (c.trIn) c.trIn.len = Math.max(1, Math.round(c.trIn.len * k)); c.opKeys.forEach((x) => { x.f = Math.round(x.f * k); }); c.gainKeys.forEach((x) => { x.f = Math.round(x.f * k); }); scalaAnim(c, k); }
              for (const m of pp.markers) m.f = Math.round(m.f * k);
              for (const r of pp.sottotitoli?.righe ?? []) { r.da = Math.round(r.da * k); r.a = Math.max(r.da + 1, Math.round(r.a * k)); }
              if (pp.inF !== null) pp.inF = Math.round(pp.inF * k);
              if (pp.outF !== null) pp.outF = Math.round(pp.outF * k);
            }
            pp.w = f2.w; pp.h = f2.h; pp.rate = { ...f2.rate }; pp.drop = f2.drop;
          }
        });
        d.chiudi();
      },
    },
  }, 'Applica'));
}

export function finestraTasti() {
  const d = dialogo('Tasti della centralina', { largo: true });
  const gruppi = new Map<string, HTMLElement[]>();
  for (const a of azioni.values()) {
    if (!a.tasti?.length) continue;
    if (!gruppi.has(a.gruppo)) gruppi.set(a.gruppo, []);
    gruppi.get(a.gruppo)!.push(h('div', { class: 'tasto-riga' }, h('span', { class: 'tasti' }, a.tasti.map((t) => h('kbd', null, t.replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('Space', 'Spazio')))), h('span', null, a.nome, a.info ? h('small', null, a.info) : null)));
  }
  d.corpo.append(h('p', { class: 'nota' }, 'I numeri in alto (1-8) sono i tasti di montaggio. Il tastierino numerico scrive il timecode sul monitor attivo, come in EDIUS. Tab passa fra Player e Recorder.'),
    h('div', { class: 'tasti-griglia' }, [...gruppi].map(([g, righe]) => h('section', null, h('h4', null, g), righe))));
  d.piede.append(h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'OK'));
}

export function finestraInfo() {
  const d = dialogo('DaProd Video');
  d.corpo.append(
    h('div', { class: 'info-logo' }, h('span', { class: 'marchio-grande' }, 'Da', h('b', null, 'Prod'), ' Video')),
    h('p', null, `Versione ${VERSIONE} · ${edizione}`),
    h('p', null, 'Il montaggio vecchio stile, moderno dentro: due monitor, la centralina, i VU a lancetta, le tendine SMPTE e la EDL. Sotto il cofano WebCodecs, WebGL2, Web Audio e Mediabunny; l\'app è Tauri 2 (Rust).'),
    h('p', { class: 'nota' }, 'Open source, licenza MIT. Font DSEG (OFL), Orbitron e Rajdhani (OFL). Mediabunny (MPL-2.0). DeepFilterNet (MIT/Apache-2.0), MossFormer2 di ClearerVoice-Studio (Apache-2.0), Demucs, LiteRT.js (Apache-2.0).'),
    // la licenza di Clear chiede la scritta e il collegamento in un posto che si trova
    h('p', { class: 'nota info-crediti' }, 'Togli rumori "Podcast": Clear, ', h('a', { href: 'https://desertant.com', on: { click: (e: MouseEvent) => { e.preventDefault(); apriLink('https://desertant.com'); } } }, 'Powered by Desert Ant Labs'), ' (Desert Ant Labs Source-Available License 1.0).'));
  d.piede.append(
    h('button', { class: 'btn', on: { click: () => apriLink('https://github.com/cammo22/DaProdVideo') } }, 'Codice su GitHub'),
    h('button', { class: 'btn', on: { click: () => apriLink('https://github.com/cammo22/DaProdVideo/releases/latest') } }, 'Ultima versione'),
    h('button', { class: 'btn primario', on: { click: d.chiudi } }, 'OK'));
}
