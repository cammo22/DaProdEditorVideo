// Le finestre delle cose solide, in stile «Banco»: Recupera il lavoro, Versioni del progetto, Ricollega i file, Spazio.
// Qui si disegna e basta: cosa fare lo decide chi apre la finestra (src/progetti.ts), la logica è in src/core/solido.ts.
// Regola del Banco: in ogni finestra al massimo UN pulsante oro (l'azione principale); verde = pronto, rosso = problema.
import '../stile/solido.css';
import { descriviEta, pesoTesto, riassuntoRicollega, rigaVersione, type VersioneMeta } from '../core/solido';
import type { Cercato } from '../core/solido';
import type { RisultatoRicerca } from '../media/ricollega';
import type { RiepilogoSpazio, SceltePulizia } from '../media/spazio';
import { liberabile } from '../media/spazio';
import { avviso, conferma, dialogo, h } from './dom';

const etichetta = (t: string) => h('div', { class: 'sol-etichetta' }, t);
const vetrino = (...c: (string | HTMLElement)[]) => h('div', { class: 'sol-vetrino' }, ...c);

// ——— Recupera il lavoro ———

/** la finestra dopo una chiusura anomala: si deve scegliere (niente Esc, niente clic fuori) */
export function finestraRecupero(f: { titolo: string; testo: string; dettaglio: string }): Promise<boolean> {
  return new Promise((ok) => {
    const d = dialogo(f.titolo, { chiudibile: false });
    d.el.classList.add('solido', 'sol-recupero');
    const via = (si: boolean) => { d.chiudi(); ok(si); };
    d.corpo.append(
      etichetta('Copia di emergenza'),
      h('p', { class: 'sol-testo' }, f.testo),
      vetrino(f.dettaglio),
      h('p', { class: 'nota' }, 'Se non la riprendi, parti da un progetto nuovo. Le versioni salvate restano in File → Versioni del progetto.'));
    const si = h('button', { class: 'btn primario sol-alto', on: { click: () => via(true) } }, 'Recupera il lavoro');
    d.piede.append(h('button', { class: 'btn sol-alto', on: { click: () => via(false) } }, 'Parto da zero'), si);
    setTimeout(() => si.focus(), 30);
  });
}

// ——— Versioni del progetto ———

export interface AzioniVersioni {
  nome: string;
  elenco: () => Promise<VersioneMeta[]>;
  /** ripristina; ritorna se è andata */
  ripristina: (id: string) => Promise<boolean>;
  elimina: (id: string) => Promise<void>;
}

export function finestraVersioni(a: AzioniVersioni) {
  const d = dialogo('Versioni del progetto', { largo: true });
  d.el.classList.add('solido', 'sol-versioni');
  const lista = h('div', { class: 'sol-lista', role: 'list' });
  const disegna = async () => {
    const elenco = await a.elenco();
    lista.replaceChildren(...(elenco.length ? elenco.map((v, i) => {
      const riga = h('div', { class: 'sol-riga', role: 'listitem' },
        h('div', { class: 'sol-riga-testo' },
          h('b', null, descriviEta(v.quando)),
          h('span', { class: 'sol-dett' }, rigaVersione(v).split(' · ').slice(1).join(' · '), ' · ', new Date(v.quando).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))),
        i === 0 ? h('span', { class: 'sol-chip pronto', title: 'La più recente' }, 'ULTIMA') : null,
        h('button', { class: 'btn sol-alto', title: 'Apre questa versione. Quella di adesso resta nell\'elenco.', on: { click: () => void torna(v) } }, 'Torna a questa'),
        h('button', { class: 'btn sol-alto sol-leggero', title: 'Toglie questa versione dall\'elenco', 'aria-label': 'Togli questa versione', on: { click: async () => { await a.elimina(v.id); await disegna(); } } }, 'Togli'));
      return riga;
    }) : [h('p', { class: 'sol-vuoto' }, 'Ancora nessuna versione. Se ne fa una a ogni salvataggio e una copia automatica ogni 10 minuti mentre lavori.')]));
  };
  const torna = async (v: VersioneMeta) => {
    const si = await conferma('Torna a una versione', `Torno alla versione di ${descriviEta(v.quando)} (${v.clip === 1 ? '1 clip' : v.clip + ' clip'}). Il montaggio di adesso non si perde: resta nell'elenco come «Prima di tornare indietro».`, 'Torna a questa', 'Annulla');
    if (!si) return;
    if (await a.ripristina(v.id)) d.chiudi(); else await disegna();
  };
  d.corpo.append(etichetta(a.nome), lista, h('p', { class: 'nota' }, 'Le ultime versioni di questo progetto. Si tengono le più recenti e le più vecchie vanno via da sole.'));
  d.piede.append(h('button', { class: 'btn sol-alto', on: { click: d.chiudi } }, 'Chiudi'));
  void disegna();
}

// ——— Ricollega i file ———

export interface AzioniRicollega {
  mancanti: Cercato[];
  puoCartella: boolean;
  /** sceglie la cartella e cerca; null se si annulla */
  cercaInCartella: () => Promise<RisultatoRicerca | null>;
  applica: (r: RisultatoRicerca, ids: ReadonlySet<string>) => Promise<{ ok: number; falliti: number }>;
  aMano: () => void;
}

export function finestraRicollega(a: AzioniRicollega) {
  const d = dialogo('Ricollega i file', { largo: true });
  d.el.classList.add('solido', 'sol-ricollega');
  let risultato: RisultatoRicerca | null = null;
  const scelti = new Set<string>();
  const riepilogo = h('p', { class: 'sol-testo' });
  const lista = h('div', { class: 'sol-lista', role: 'list' });
  const bCartella = h('button', { class: 'btn primario sol-alto', on: { click: () => void cerca() } }, 'Scegli la cartella…');
  const bVai = h('button', { class: 'btn sol-alto', disabled: true, on: { click: () => void vai() } }, 'Ricollega');
  const bMano = h('button', { class: 'btn sol-alto sol-leggero', title: 'Scegli tu i file uno per uno', on: { click: () => { d.chiudi(); a.aMano(); } } }, 'Scegli i file a mano…');
  riepilogo.textContent = a.mancanti.length === 1 ? 'Manca 1 file.' : `Mancano ${a.mancanti.length} file.`;
  if (a.puoCartella) riepilogo.textContent += ' Dimmi in quale cartella li hai spostati: li cerco io, anche nelle sottocartelle, per nome e grandezza.';
  else riepilogo.textContent += ' Scegli i file: li abbino per nome e grandezza.';

  const disegna = () => {
    const abb = new Map((risultato?.abbinati ?? []).map((x) => [x.id, x]));
    lista.replaceChildren(...a.mancanti.map((m) => {
      const x = abb.get(m.id);
      const t = x && risultato ? risultato.trovati[x.trovato] : null;
      const spunta = h('input', { type: 'checkbox', 'aria-label': 'Ricollega ' + m.name, disabled: !x }) as HTMLInputElement;
      spunta.checked = !!x && scelti.has(m.id);
      spunta.addEventListener('change', () => { if (spunta.checked) scelti.add(m.id); else scelti.delete(m.id); aggiorna(); });
      return h('label', { class: 'sol-riga' + (x ? '' : ' sol-manca'), role: 'listitem' },
        spunta,
        h('div', { class: 'sol-riga-testo' },
          h('b', null, m.name),
          h('span', { class: 'sol-dett' }, t ? (t.path ?? t.name) + (x!.quanto === 'nome' && m.size && t.size !== m.size ? ` · ${pesoTesto(t.size)} invece di ${pesoTesto(m.size)}` : '') : (m.path ?? (m.size ? pesoTesto(m.size) : '')))),
        x ? h('span', { class: 'sol-chip ' + (x.quanto === 'esatto' ? 'pronto' : 'dubbio') }, x.quanto === 'esatto' ? 'TROVATO' : 'STESSO NOME') : (risultato ? h('span', { class: 'sol-chip manca' }, 'NON C\'È') : null));
    }));
  };
  const aggiorna = () => {
    const n = scelti.size;
    bVai.disabled = n === 0;
    bVai.textContent = n === 1 ? 'Ricollega 1 file' : n ? `Ricollega ${n} file` : 'Ricollega';
    // l'azione principale (oro) è una sola per volta: prima la cartella, poi il ricollegamento
    const pronto = !!risultato && n > 0;
    bVai.classList.toggle('primario', pronto);
    bCartella.classList.toggle('primario', !pronto && a.puoCartella);
    bMano.classList.toggle('primario', !a.puoCartella);
  };
  const cerca = async () => {
    bCartella.disabled = true;
    try {
      riepilogo.textContent = 'Cerco…';
      const r = await a.cercaInCartella();
      if (!r) { riepilogo.textContent = 'Nessuna cartella scelta.'; return; }
      risultato = r;
      scelti.clear();
      for (const x of r.abbinati) scelti.add(x.id);
      riepilogo.textContent = `In «${r.cartella}»: ` + riassuntoRicollega(r.cercati.length, r.abbinati);
      bCartella.textContent = 'Un\'altra cartella…';
      disegna();
    } catch (e) {
      riepilogo.textContent = 'La cartella non si legge: ' + (e instanceof Error ? e.message : String(e));
    } finally { bCartella.disabled = false; aggiorna(); }
  };
  const vai = async () => {
    if (!risultato || !scelti.size) return;
    bVai.disabled = true; bCartella.disabled = true;
    const r = await a.applica(risultato, scelti);
    if (r.falliti) avviso(`${r.falliti} file non si aprono: controlla che siano quelli giusti`, 'info', 4500);
    d.chiudi();
  };
  d.corpo.append(etichetta('File mancanti'), riepilogo, lista);
  const chiudi = h('button', { class: 'btn sol-alto', on: { click: d.chiudi } }, 'Chiudi');
  d.piede.append(...(a.puoCartella ? [bMano, h('span', { class: 'spazio' }), chiudi, bCartella, bVai] : [h('span', { class: 'spazio' }), chiudi, bMano]));
  if (!a.puoCartella) d.piede.querySelector('.sol-leggero')?.classList.remove('sol-leggero');
  disegna();
  aggiorna();
}

// ——— Spazio ———

export interface AzioniSpazio {
  misura: () => Promise<RiepilogoSpazio>;
  pulisci: (r: RiepilogoSpazio, s: SceltePulizia) => Promise<{ copie: number; cache: number; versioni: number }>;
  /** Salva come… (riscrive il .dap da capo) */
  riscriviDap: () => void;
}

export function finestraSpazio(a: AzioniSpazio) {
  const d = dialogo('Spazio', { largo: true });
  d.el.classList.add('solido', 'sol-spazio');
  const corpo = h('div', { class: 'sol-spazio-corpo' }, vetrino('Misuro…'));
  const bPulisci = h('button', { class: 'btn primario sol-alto', disabled: true }, 'Pulisci');
  d.corpo.append(etichetta('Cosa pesa'), corpo, h('p', { class: 'nota' }, 'Qui si toglie solo quello che il programma rifà da solo quando serve. I tuoi file e i progetti non si toccano mai.'));
  d.piede.append(h('span', { class: 'spazio' }), h('button', { class: 'btn sol-alto', on: { click: d.chiudi } }, 'Chiudi'), bPulisci);

  const disegna = async () => {
    bPulisci.disabled = true;
    corpo.replaceChildren(vetrino('Misuro…'));
    let r: RiepilogoSpazio;
    try { r = await a.misura(); } catch (e) { corpo.replaceChildren(vetrino('Non riesco a misurare: ' + (e instanceof Error ? e.message : String(e)))); return; }
    const scelte: SceltePulizia = { copieVecchie: r.copie.vecchie.length > 0, copieAltre: false, cache: r.cache.vecchie > 0, versioni: false };
    const totale = h('b', { class: 'sol-totale' });
    const aggTot = () => { totale.textContent = pesoTesto(liberabile(r, scelte)); bPulisci.disabled = liberabile(r, scelte) <= 0; };
    const voce = (chiave: keyof SceltePulizia, titolo: string, dettaglio: string, byte: number, attiva: boolean) => {
      const sp = h('input', { type: 'checkbox', disabled: !attiva, 'aria-label': titolo }) as HTMLInputElement;
      sp.checked = attiva && scelte[chiave];
      sp.addEventListener('change', () => { scelte[chiave] = sp.checked; aggTot(); });
      return h('label', { class: 'sol-riga' + (attiva ? '' : ' sol-manca') }, sp,
        h('div', { class: 'sol-riga-testo' }, h('b', null, titolo), h('span', { class: 'sol-dett' }, dettaglio)),
        h('span', { class: 'sol-peso' }, pesoTesto(byte)));
    };
    const c = r.copie;
    const righe: HTMLElement[] = [
      voce('copieVecchie', 'Copie leggere vecchie', c.vecchie.length ? `${c.vecchie.length} di file che non sono in questo progetto e non si usano da un mese` : 'Nessuna', c.byteVecchie, c.vecchie.length > 0),
      voce('copieAltre', 'Altre copie leggere', c.altre.length ? `${c.altre.length} di file che non sono in questo progetto (più recenti)` : 'Nessuna', c.byteAltre, c.altre.length > 0),
      voce('cache', 'Misure vecchie', r.cache.vecchie ? `${r.cache.vecchie} forme d'onda, colori e locandine non usate da un mese` : 'Nessuna', r.cache.byteVecchie, r.cache.vecchie > 0),
      voce('versioni', 'Versioni dei progetti', r.versioni.quante ? `${r.versioni.quante} versioni: resta l'ultima di ogni progetto` : 'Nessuna', r.versioni.byte, r.versioni.quante > 1),
    ];
    const blocchi: HTMLElement[] = [
      h('div', { class: 'sol-lista' }, righe),
      h('div', { class: 'sol-somma' }, h('span', null, 'Si liberano circa'), vetrino(totale)),
      h('p', { class: 'nota' }, `Copie leggere di questo progetto: ${pesoTesto(c.byteUsate)} (non si toccano).` + (r.quota ? ` · Il programma usa ${pesoTesto(r.quota.usata)} su ${pesoTesto(r.quota.totale)} disponibili.` : '')),
    ];
    if (r.dap) {
      const dap = r.dap;
      blocchi.push(
        etichetta('Il file .dap'),
        vetrino(`${dap.percorso.split(/[\\/]/).pop()} · ${pesoTesto(dap.byte)}`),
        dap.spreco
          ? h('div', { class: 'sol-avviso' },
            h('p', { class: 'sol-testo' }, `Il file è cresciuto: riscritto da capo basterebbero ${pesoTesto(dap.necessario)}, ora sono ${pesoTesto(dap.byte)} (${pesoTesto(dap.spreco)} in più). Succede perché Salva aggiunge in fondo, ed è la cosa giusta quando si lavora; ogni tanto conviene riscriverlo.`),
            h('button', { class: 'btn sol-alto', title: 'Salva il progetto in un file nuovo, pulito', on: { click: () => { d.chiudi(); a.riscriviDap(); } } }, 'Riscrivilo con Salva come…'))
          : h('p', { class: 'nota ok' }, 'Il file è della grandezza giusta.'));
    }
    corpo.replaceChildren(...blocchi);
    aggTot();
    bPulisci.onclick = async () => {
      const cosa = [scelte.copieVecchie && 'le copie leggere vecchie', scelte.copieAltre && 'le altre copie leggere', scelte.cache && 'le misure vecchie', scelte.versioni && 'le versioni (tranne l\'ultima di ogni progetto)'].filter(Boolean).join(', ');
      if (!(await conferma('Pulisci lo spazio', `Tolgo: ${cosa}. Liberi circa ${pesoTesto(liberabile(r, scelte))}. Il programma le rifà da solo quando servono (le versioni no). Vado?`, 'Pulisci', 'Annulla'))) return;
      bPulisci.disabled = true;
      const fatto = await a.pulisci(r, scelte);
      avviso(`Pulito: ${fatto.copie} copie leggere, ${fatto.cache} misure, ${fatto.versioni} versioni`, 'ok', 3500);
      await disegna();
    };
  };
  void disegna();
}
