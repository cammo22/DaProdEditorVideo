// Il controllo prima dell'uscita: cinque spie (verde = a posto, ambra = guarda, rossa = così esce male) che dicono se
// il video, adesso, uscirebbe come lo si è montato. Qui ci sono solo i conti, senza pagina né disco: chi li usa
// (src/ui/controlloUscita.ts) porta i fatti (file presenti, spazio libero, caratteri installati) e riceve le frasi.
import type { Clip, Project, Sottotitoli } from './tipi';
import { pesoTesto } from './esportazione';
import type { FunzioneAI } from './funzioniAI';
import { f2s } from './timecode';

export type LuceControllo = 'verde' | 'ambra' | 'rossa';

export interface Controllo {
  id: 'originali' | 'spazio' | 'font' | 'sottotitoli' | 'ai';
  nome: string;
  /** una frase corta, a destra della spia */
  dettaglio: string;
  luce: LuceControllo;
  /** per il tooltip: cosa fare, o cosa c'è che non va */
  aiuto?: string;
}

/** la luce peggiore di un elenco (rossa > ambra > verde) */
export function luceMaggiore(l: readonly LuceControllo[]): LuceControllo {
  return l.includes('rossa') ? 'rossa' : l.includes('ambra') ? 'ambra' : 'verde';
}

// ——— file originali ———

/** stato: 'ok' | 'offline' | 'errore' | 'caricamento' | 'assente' (non è nemmeno nel contenitore) */
export interface MediaUsato { id: string; nome: string; stato: string }

/** i media che stanno davvero in timeline (uno solo per file, anche se la clip è tagliata in dieci) */
export function mediaInTimeline(p: Project): MediaUsato[] {
  const visti = new Set<string>();
  const out: MediaUsato[] = [];
  for (const c of p.clips) {
    if (c.kind !== 'media' || !c.media || visti.has(c.media)) continue;
    visti.add(c.media);
    const m = p.media.find((x) => x.id === c.media);
    out.push({ id: c.media, nome: m?.name ?? c.name, stato: m ? 'ok' : 'assente' });
  }
  return out;
}

export function controlloOriginali(usati: readonly MediaUsato[]): Controllo {
  const nome = 'File originali';
  if (!usati.length) return { id: 'originali', nome, dettaglio: 'niente in timeline', luce: 'ambra', aiuto: 'Il montaggio non usa nessun file.' };
  const persi = usati.filter((m) => m.stato === 'offline' || m.stato === 'assente');
  const guasti = usati.filter((m) => m.stato === 'errore');
  const attesa = usati.filter((m) => m.stato === 'caricamento');
  if (persi.length || guasti.length) {
    const n = persi.length + guasti.length;
    return { id: 'originali', nome, dettaglio: n === 1 ? '1 file non si trova' : `${n} file non si trovano`, luce: 'rossa', aiuto: `Da ritrovare: ${[...persi, ...guasti].map((m) => m.nome).slice(0, 4).join(', ')}${n > 4 ? '…' : ''}. Senza gli originali l'export salta quei pezzi.` };
  }
  if (attesa.length) return { id: 'originali', nome, dettaglio: `${attesa.length} in apertura`, luce: 'ambra', aiuto: 'I file si stanno ancora aprendo: aspetta un attimo.' };
  return { id: 'originali', nome, dettaglio: usati.length === 1 ? 'presente' : 'tutti presenti', luce: 'verde' };
}

// ——— spazio sul disco ———

/** `libero` null = non si sa; `serve` è il peso stimato del file */
export function controlloSpazio(libero: number | null, serve: number | null, dove = 'disco'): Controllo {
  const nome = 'Spazio su disco';
  if (libero === null) return { id: 'spazio', nome, dettaglio: 'non so quanto', luce: 'ambra', aiuto: 'Non riesco a leggere lo spazio libero: controlla a mano che ci stia il file.' };
  const liberi = `${pesoTesto(libero)} liberi`;
  if (serve === null || serve <= 0) return { id: 'spazio', nome, dettaglio: liberi, luce: 'verde' };
  if (libero < serve) return { id: 'spazio', nome, dettaglio: `${liberi}, ne servono ${pesoTesto(serve)}`, luce: 'rossa', aiuto: `Su ${dove} non c'è posto per il file: libera spazio o scegli un'uscita più leggera.` };
  if (libero < serve * 1.5 + 2e9) return { id: 'spazio', nome, dettaglio: `${liberi}, ne servono ${pesoTesto(serve)}`, luce: 'ambra', aiuto: 'Ci sta, ma di poco: se sul disco lavora altro, potrebbe non bastare.' };
  return { id: 'spazio', nome, dettaglio: liberi, luce: 'verde' };
}

// ——— font dei titoli ———

/** i caratteri delle animazioni (id nel catalogo → famiglia vera), gli stessi caricati da `caricaFontAnimazioni` */
export const FAMIGLIE_ANIM: Record<string, string> = {
  montserrat: 'Montserrat', oswald: 'Oswald', archivo: 'Archivo Black', bebas: 'Bebas Neue', playfair: 'Playfair Display',
  cormorant: 'Cormorant Garamond', vibes: 'Great Vibes', caveat: 'Caveat', mono: 'Space Mono', rajdhani: 'Rajdhani', orbitron: 'Orbitron',
};

/** le famiglie di carattere usate dai titoli e dalle animazioni in timeline */
export function fontUsati(p: Project): string[] {
  const out = new Set<string>();
  for (const c of p.clips) {
    const t = c.gen?.title?.font;
    if (c.kind === 'title' && t && !c.gen?.anim) out.add(t.trim());
    const a = c.gen?.anim?.v?.font;
    if (typeof a === 'string' && FAMIGLIE_ANIM[a]) out.add(FAMIGLIE_ANIM[a]);
  }
  out.delete('');
  return [...out];
}

export function controlloFont(usati: readonly string[], disponibili: ReadonlyMap<string, boolean>): Controllo {
  const nome = 'Font dei titoli';
  if (!usati.length) return { id: 'font', nome, dettaglio: 'nessun titolo', luce: 'verde' };
  const mancano = usati.filter((f) => disponibili.get(f) === false);
  if (mancano.length) return { id: 'font', nome, dettaglio: mancano.length === 1 ? `manca ${mancano[0]}` : `ne mancano ${mancano.length}`, luce: 'rossa', aiuto: `Non trovo: ${mancano.join(', ')}. I titoli escono con un carattere di ripiego.` };
  if (usati.some((f) => !disponibili.has(f))) return { id: 'font', nome, dettaglio: 'controllo…', luce: 'ambra' };
  return { id: 'font', nome, dettaglio: usati.length === 1 ? 'installato' : 'installati', luce: 'verde' };
}

// ——— sottotitoli ———

/** quanto può essere lunga una riga a schermo, e quante righe, e quanto in fretta si può leggere (lettere al secondo) */
export const LIMITI_SOTTO = { lettereRiga: 42, righe: 2, lettereAlSecondo: 21 };

export interface ProblemaRiga { id: string; motivo: 'lunga' | 'tante' | 'veloce' }

/** le righe dei sottotitoli che non si leggono bene: troppo larghe, troppe righe a capo, o via troppo in fretta */
export function righeTroppoLunghe(s: Sottotitoli | undefined, rate: Project['rate']): ProblemaRiga[] {
  const out: ProblemaRiga[] = [];
  for (const r of s?.righe ?? []) {
    const testo = r.testo.trim();
    if (!testo) continue;
    const righe = testo.split('\n').map((x) => x.trim());
    if (righe.some((x) => x.length > LIMITI_SOTTO.lettereRiga)) { out.push({ id: r.id, motivo: 'lunga' }); continue; }
    if (righe.length > LIMITI_SOTTO.righe) { out.push({ id: r.id, motivo: 'tante' }); continue; }
    const sec = f2s(r.a - r.da, rate);
    if (sec > 0 && testo.replace(/\s+/g, '').length / sec > LIMITI_SOTTO.lettereAlSecondo) out.push({ id: r.id, motivo: 'veloce' });
  }
  return out;
}

export function controlloSottotitoli(s: Sottotitoli | undefined, rate: Project['rate']): Controllo {
  const nome = 'Sottotitoli';
  const scritte = (s?.righe ?? []).filter((r) => r.testo.trim()).length;
  if (!scritte) return { id: 'sottotitoli', nome, dettaglio: 'nessuno', luce: 'verde' };
  const prob = righeTroppoLunghe(s, rate);
  if (!prob.length) return { id: 'sottotitoli', nome, dettaglio: scritte === 1 ? '1 riga a posto' : `${scritte} righe a posto`, luce: 'verde' };
  const lunghe = prob.filter((x) => x.motivo !== 'veloce').length;
  const veloci = prob.length - lunghe;
  const parti: string[] = [];
  if (lunghe) parti.push(lunghe === 1 ? '1 riga troppo lunga' : `${lunghe} righe troppo lunghe`);
  if (veloci) parti.push(veloci === 1 ? '1 va troppo in fretta' : `${veloci} vanno troppo in fretta`);
  return { id: 'sottotitoli', nome, dettaglio: parti.join(' · '), luce: 'ambra', aiuto: `Oltre ${LIMITI_SOTTO.lettereRiga} lettere per riga, più di ${LIMITI_SOTTO.righe} righe o più di ${LIMITI_SOTTO.lettereAlSecondo} lettere al secondo si leggono male: dividi o allunga la riga.` };
}

// ——— effetti AI ———

export interface UsoAI {
  /** parole con cui si riconosce nel registro (`FUNZIONI_AI`: id o nome) */
  parole: string[];
  nome: string;
  /** quante clip ne hanno bisogno */
  clip: number;
  /** quante di queste non hanno ancora il risultato (maschere non fatte, traccia mancante…) */
  senzaRisultato: number;
}

/** Cosa del progetto lavora con l'AI e quanto è già fatto. `maschere(firma)` dice se le maschere dello sfondo sono in memoria. */
export function usiAI(p: Project, maschere: (firma?: string) => unknown): UsoAI[] {
  const sfondo: Clip[] = p.clips.filter((c) => !!c.ritaglio);
  const seguiti: Clip[] = p.clips.filter((c) => !!c.segue || !!c.stabilizza);
  const out: UsoAI[] = [];
  if (sfondo.length) out.push({ parole: ['sfondo', 'ritaglio', 'sam'], nome: 'Togli sfondo', clip: sfondo.length, senzaRisultato: sfondo.filter((c) => !maschere(c.ritaglio!.firma)).length });
  if (seguiti.length) {
    const tracciate = new Set(p.clips.filter((c) => c.traccia).map((c) => c.id));
    out.push({ parole: ['traccia', 'segui', 'tracking'], nome: 'Segui l\'oggetto', clip: seguiti.length, senzaRisultato: seguiti.filter((c) => !c.traccia && !(c.segue && tracciate.has(c.segue))).length });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase();
/** la funzione del registro che corrisponde a un uso, se c'è */
export function trovaFunzione(registro: readonly FunzioneAI[], parole: readonly string[]): FunzioneAI | undefined {
  return registro.find((f) => parole.some((w) => norm(f.id).includes(w) || norm(f.nome).includes(w)));
}

/**
 * Le spie dell'AI: rossa se un effetto ha bisogno di un risultato che non c'è (l'export lo salterebbe), ambra se è una
 * funzione opzionale/sperimentale o se ci sono lavori AI ancora in corso, verde se è tutto pronto.
 */
export function controlloAI(usi: readonly UsoAI[], registro: readonly FunzioneAI[], lavoriAIinCorso: number): Controllo {
  const nome = 'Effetti AI';
  const manca = usi.filter((u) => u.senzaRisultato > 0);
  if (manca.length) {
    const u = manca[0];
    return { id: 'ai', nome, dettaglio: manca.length === 1 ? `${u.nome}: da preparare` : `${manca.length} da preparare`, luce: 'rossa', aiuto: `${manca.map((m) => `${m.nome} (${m.senzaRisultato} su ${m.clip})`).join(', ')}: il risultato non c'è ancora, l'export uscirebbe senza.` };
  }
  if (lavoriAIinCorso > 0) return { id: 'ai', nome, dettaglio: lavoriAIinCorso === 1 ? '1 lavoro in corso' : `${lavoriAIinCorso} lavori in corso`, luce: 'ambra', aiuto: 'Aspetta che finiscano (Attività) prima di esportare.' };
  const nonPronte = usi.map((u) => ({ u, f: trovaFunzione(registro, u.parole) })).filter((x) => x.f && x.f.stato !== 'pronta');
  if (nonPronte.length) {
    const f = nonPronte[0].f!;
    return { id: 'ai', nome, dettaglio: `${nonPronte[0].u.nome} · ${f.stato === 'sperimentale' ? 'sperimentale' : 'opzionale'}`, luce: 'ambra', aiuto: `${f.nome} è ${f.stato}${f.peso ? `, pesa ${f.peso}` : ''}${f.vram ? `, chiede ${f.vram} di VRAM` : ''}: il risultato che hai già fatto esce, ma rifarlo potrebbe non riuscire su ogni computer.` };
  }
  return { id: 'ai', nome, dettaglio: usi.length ? 'tutti pronti' : 'nessuno usato', luce: 'verde' };
}

/** tutto il controllo in una volta */
export function controllaUscita(i: {
  usati: readonly MediaUsato[];
  libero: number | null; serve: number | null; dove?: string;
  fontUsati: readonly string[]; fontDisponibili: ReadonlyMap<string, boolean>;
  sottotitoli: Sottotitoli | undefined; rate: Project['rate'];
  usiAI: readonly UsoAI[]; registro: readonly FunzioneAI[]; lavoriAI: number;
}): Controllo[] {
  return [
    controlloOriginali(i.usati),
    controlloSpazio(i.libero, i.serve, i.dove),
    controlloFont(i.fontUsati, i.fontDisponibili),
    controlloSottotitoli(i.sottotitoli, i.rate),
    controlloAI(i.usiAI, i.registro, i.lavoriAI),
  ];
}
