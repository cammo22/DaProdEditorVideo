// La pagina iniziale: i progetti. Da qui si ricomincia, si apre un progetto (uno dei recenti o uno da file), si va
// al montaggio automatico o si torna al montaggio in corso. Compare quando si apre il programma (se non si è
// aperto un file col doppio clic) e quando si preme "Progetti" in alto o File → Pagina iniziale.
import { store } from '../core/store';
import { CADENZE, OBIETTIVI, RISOLUZIONI, formatoDa } from '../core/tipi';
import { apri, apriRecente, dimenticaRecente, nuovo, recenti, type Recente } from '../progetti';
import { h, icona } from './dom';


const quando = (t: number) => {
  const d = Date.now() - t;
  if (d < 60_000) return 'adesso';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min fa`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} ore fa`;
  const g = Math.floor(d / 86_400_000);
  return g === 1 ? 'ieri' : g < 30 ? `${g} giorni fa` : new Date(t).toLocaleDateString('it-IT');
};
const evento = (nome: string, detail?: unknown) => document.dispatchEvent(new CustomEvent(nome, { detail }));
const durataUmana = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`; };

export class Home {
  el: HTMLElement;
  private corpo: HTMLElement;
  /** la scelta per il progetto nuovo: risoluzione e fotogrammi al secondo (di partenza Full HD a 25) */
  private ris = 'fhd';
  private cad = '25';
  visibile = false;

  constructor(private vaiAMontage: () => void) {
    this.corpo = h('div', { class: 'home-corpo' });
    this.el = h('div', { class: 'home', style: 'display:none' },
      h('div', { class: 'home-dentro' },
        h('header', { class: 'home-testa' },
          h('span', { class: 'moneta' }, 'D'),
          h('div', null, h('b', null, 'DaProd Video'), h('small', null, 'i tuoi progetti')),
          h('button', { class: 'btn-icona home-chiudi', title: 'Torna al montaggio (Esc)', on: { click: () => this.nascondi() } }, icona('x', 18))),
        this.corpo));
    document.addEventListener('keydown', (e) => { if (this.visibile && e.key === 'Escape' && !document.querySelector('.cerca-velo, .velo')) { e.stopPropagation(); this.nascondi(); } }, true);
    // chi porta da un'altra parte (la ricerca, la guida) chiude la pagina iniziale
    document.addEventListener('dpv:home-nascondi', () => { if (this.visibile) this.nascondi(); });
  }

  mostra() {
    this.disegna();
    this.el.style.display = '';
    this.visibile = true;
    // i tasti del montaggio non arrivano al banco nascosto qui sotto (prima Spazio suonava e 2 toglieva una clip)
    document.documentElement.classList.add('home-aperta');
  }

  nascondi() {
    this.el.style.display = 'none';
    this.visibile = false;
    document.documentElement.classList.remove('home-aperta');
  }

  private disegna() {
    const p = store.doc;
    const inCorso = p.clips.length || p.media.length;
    // 1 · ricominciare
    const riassunto = h('div', { class: 'home-formato-riga' });
    const aggiorna = () => {
      const f = formatoDa(this.ris, this.cad);
      riassunto.replaceChildren(h('b', null, `${f.w}×${f.h}`), ` · ${RISOLUZIONI.find((r) => r.id === this.ris)?.nome ?? ''} · `, h('b', null, `${CADENZE.find((c) => c.id === this.cad)?.nome ?? ''} fps`));
      sinistra?.querySelectorAll('[data-ris]').forEach((c) => c.classList.toggle('acceso', (c as HTMLElement).dataset.ris === this.ris));
      sinistra?.querySelectorAll('[data-cad]').forEach((c) => c.classList.toggle('acceso', (c as HTMLElement).dataset.cad === this.cad));
      sinistra?.querySelectorAll('[data-ob]').forEach((c) => { const o = OBIETTIVI.find((x) => x.id === (c as HTMLElement).dataset.ob); c.classList.toggle('acceso', !!o && o.ris === this.ris && o.cad === this.cad); });
    };
    // 1a · per cosa lo fai: un clic e risoluzione e fotogrammi sono quelli giusti
    const forma = (w: number, hh: number) => { const k = 26 / Math.max(w, hh); return h('i', { class: 'home-forma', style: `width:${Math.max(8, Math.round(w * k))}px;height:${Math.max(8, Math.round(hh * k))}px` }); };
    const obiettivi = h('div', { class: 'home-obiettivi' }, OBIETTIVI.map((o) => {
      const r = RISOLUZIONI.find((x) => x.id === o.ris)!;
      return h('button', { class: 'home-obiettivo', 'data-ob': o.id, title: `${o.nome}: ${r.w}×${r.h}, ${CADENZE.find((c) => c.id === o.cad)?.nome} fotogrammi al secondo`, on: { click: () => { this.ris = o.ris; this.cad = o.cad; aggiorna(); } } },
        forma(r.w, r.h), h('span', null, h('b', null, o.nome), h('small', null, o.info)));
    }));
    // 1b · oppure si sceglie a mano
    const chipRis = h('div', { class: 'isp-chips' }, RISOLUZIONI.map((r) => h('button', { class: 'chip', 'data-ris': r.id, title: `${r.w}×${r.h} · ${r.info}`, on: { click: () => { this.ris = r.id; aggiorna(); } } }, r.nome)));
    const chipCad = h('div', { class: 'isp-chips' }, CADENZE.map((c) => h('button', { class: 'chip', 'data-cad': c.id, title: c.info, on: { click: () => { this.cad = c.id; aggiorna(); } } }, c.nome)));
    const nuovoB = h('button', { class: 'btn primario home-grande', on: { click: async () => { await nuovo(formatoDa(this.ris, this.cad)); if (!(store.dirty && store.doc.clips.length)) this.nascondi(); } } }, '＋ Nuovo progetto');
    const apriB = h('button', { class: 'btn home-grande', on: { click: async () => { this.nascondi(); await apri(); } } }, icona('apri', 16), ' Apri un progetto…');
    const mont = h('button', { class: 'btn home-grande home-montage', title: 'Butta dentro le foto e il programma monta da solo', on: { click: () => { this.nascondi(); this.vaiAMontage(); } } }, '✨ DaProdMontage · il montaggio automatico');
    const demo = h('button', { class: 'btn-mini', on: { click: () => { this.nascondi(); document.dispatchEvent(new CustomEvent('dpv:demo')); } } }, 'Prova con il montaggio dimostrativo');

    // eslint-disable-next-line prefer-const
    let sinistra: HTMLElement | undefined;
    sinistra = h('section', { class: 'home-col' },
      inCorso ? h('div', { class: 'home-continua' },
        h('b', null, 'Montaggio in corso'),
        h('span', null, `${p.name || 'Montaggio senza nome'} · ${p.clips.filter((c) => c.kind !== 'fx').length} clip`),
        h('button', { class: 'btn primario', on: { click: () => this.nascondi() } }, '▶ Continua')) : null,
      h('h3', null, 'Nuovo progetto'),
      h('label', { class: 'home-etichetta' }, 'Per cosa lo fai?'), obiettivi,
      h('label', { class: 'home-etichetta' }, 'Risoluzione'), chipRis,
      h('label', { class: 'home-etichetta' }, 'Fotogrammi al secondo'), chipCad,
      riassunto, nuovoB,
      h('h3', null, 'Altro'),
      apriB, mont, demo,
      // per chi comincia: la guida, la ricerca dei comandi e il Centro AI (prima non c'era un posto da cui partire)
      h('h3', null, 'Impara a usarlo'),
      h('div', { class: 'home-impara' },
        h('button', { class: 'btn', on: { click: () => evento('dpv:guida', 'inizio') } }, '🚀 Il primo montaggio in un minuto'),
        h('button', { class: 'btn', on: { click: () => evento('dpv:guida') } }, '📖 Come si fa (tutte le guide, F1)'),
        h('button', { class: 'btn', on: { click: () => evento('dpv:cerca') } }, '🔍 Cerca un comando (Ctrl+K)'),
        h('button', { class: 'btn', on: { click: () => evento('dpv:centro-ai') } }, '✨ Centro AI: sottotitoli, sfondo, voce…')));

    // 2 · i recenti
    const lista = recenti();
    const carta = (r: Recente) => h('div', { class: 'home-carta', 'data-chiave': r.chiave, title: r.path ?? r.nome, on: { click: async () => { if (await apriRecente(r)) this.nascondi(); } } },
      r.miniatura ? h('img', { src: r.miniatura, alt: '' }) : h('div', { class: 'home-vuota' }, icona('montaggio', 30)),
      h('div', { class: 'home-info' }, h('b', null, r.nome), h('small', null, `${r.clip} clip · ${durataUmana(r.durata)} · ${r.formato}`), h('small', null, quando(r.data))),
      h('button', { class: 'home-togli btn-icona', title: 'Toglila dall\'elenco (il progetto resta dov\'è)', on: { click: (e: MouseEvent) => { e.stopPropagation(); dimenticaRecente(r.chiave); this.disegna(); } } }, icona('x', 13)));
    const destra = h('section', { class: 'home-col home-recenti' },
      h('h3', null, 'Progetti recenti'),
      lista.length ? h('div', { class: 'home-griglia' }, lista.map(carta))
        : h('div', { class: 'home-nulla' }, h('b', null, 'Ancora niente'), h('p', null, 'I progetti che salvi o apri compaiono qui, con la loro miniatura, pronti da riaprire con un clic.')));
    this.corpo.replaceChildren(sinistra, destra);
    aggiorna();
  }
}

