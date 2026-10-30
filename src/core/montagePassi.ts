// DaProdMontage, la parte che ragiona dei «tre passi grandi» (proposta B): i quattro passi della barra, i ritocchi veloci
// dell'anteprima («Più corto», «Più lento», «Cambia la musica», «Togli i titoli»), il perché una foto è stata scartata
// e le frasi che riassumono il montaggio. Tutto puro (niente browser): la pagina in src/ui/montage.ts lo usa e le prove
// di Node lo provano da solo. Il motore che monta resta in src/core/montage.ts.
import { ordina, senzaDoppioni, type EntrataMontage, type OpzMontage } from './montage';
import type { PresetMontage } from './montagePreset';

// ——— i passi ———
export type IdPasso = 'file' | 'stile' | 'durata' | 'anteprima';
export const PASSI: { id: IdPasso; nome: string }[] = [
  { id: 'file', nome: 'Foto e video' },
  { id: 'stile', nome: 'Stile' },
  { id: 'durata', nome: 'Durata e musica' },
  { id: 'anteprima', nome: 'Anteprima' },
];
export type StatoPasso = 'attuale' | 'fatto' | 'futuro';

/** il passo in cui sei è ciano, quelli già fatti sono chiari, quelli che verranno restano grigi */
export function statoPasso(indice: number, attuale: number): StatoPasso {
  return indice === attuale ? 'attuale' : indice < attuale ? 'fatto' : 'futuro';
}

/** l'anteprima ha bisogno di almeno un file; gli altri passi si possono visitare sempre */
export function puoiAndare(indice: number, nFile: number): boolean {
  return indice < PASSI.length - 1 || nFile > 0;
}

/** il passo che segue/precede, sempre dentro la barra */
export const passoDopo = (i: number) => Math.min(PASSI.length - 1, i + 1);
export const passoPrima = (i: number) => Math.max(0, i - 1);

// ——— i ritocchi veloci ———
export type Ritocco = 'piuCorto' | 'piuLento' | 'musica' | 'titoli';
export interface ScelteRitocco { durata: number; lentezza: number; titoli: boolean; musica: string }
export interface EsitoRitocco { scelte: ScelteRitocco; /** la frase da mostrare */ testo: string; /** se è cambiato davvero qualcosa (se no non si rigenera) */ cambia: boolean }

export const DURATA_MIN = 10;
export const LENTEZZA_MAX = 3;

/** parlato: «45 s», «2 min», «1 min 30 s» */
export function durataParlata(s: number): string {
  const t = Math.max(0, Math.round(s));
  if (t < 60) return `${t} s`;
  const m = Math.floor(t / 60), r = t % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** un quarto in meno, a numeri tondi (5 s sotto il minuto, 10 s sopra); mai sotto i 10 s e mai uguale a prima se si può */
export function durataPiuCorta(d: number): number {
  const v = d * 0.75;
  const passo = v <= 60 ? 5 : 10;
  const t = Math.max(DURATA_MIN, Math.round(v / passo) * passo);
  return t >= d ? Math.max(DURATA_MIN, d - 1) : t;
}

/** la musica dopo quella scelta (l'ultima torna alla prima); da «nessuna» si parte dal primo brano */
export function musicaSeguente(attuale: string, brani: string[]): string {
  if (!brani.length) return attuale;
  const i = brani.indexOf(attuale);
  return brani[(i + 1) % brani.length];
}

export function ritocca(s: ScelteRitocco, r: Ritocco, brani: string[]): EsitoRitocco {
  switch (r) {
    case 'piuCorto': {
      const d = durataPiuCorta(s.durata);
      if (d >= s.durata) return { scelte: s, testo: `Più corto di ${durataParlata(s.durata)} non si può`, cambia: false };
      return { scelte: { ...s, durata: d }, testo: `Più corto: ${durataParlata(d)}`, cambia: true };
    }
    case 'piuLento': {
      if (s.lentezza >= LENTEZZA_MAX) return { scelte: s, testo: 'Più lento di così non si può', cambia: false };
      return { scelte: { ...s, lentezza: s.lentezza + 1 }, testo: 'Più lento: ogni foto resta più a lungo', cambia: true };
    }
    case 'musica': {
      if (!brani.length) return { scelte: s, testo: 'Non c\'è nessun brano: aggiungine uno', cambia: false };
      const m = musicaSeguente(s.musica, brani);
      if (m === s.musica) return { scelte: s, testo: 'C\'è un solo brano', cambia: false };
      return { scelte: { ...s, musica: m }, testo: 'Altra musica', cambia: true };
    }
    case 'titoli':
      return { scelte: { ...s, titoli: !s.titoli }, testo: s.titoli ? 'Senza titoli' : 'Con i titoli', cambia: true };
  }
}

/** il testo del bottone di un ritocco: «Togli i titoli» diventa «Rimetti i titoli» quando sono già tolti */
export function nomeRitocco(r: Ritocco, s: Pick<ScelteRitocco, 'titoli' | 'lentezza'>, nBrani: number): string {
  if (r === 'piuCorto') return 'Più corto';
  if (r === 'piuLento') return s.lentezza > 0 ? `Più lento (${s.lentezza} su ${LENTEZZA_MAX})` : 'Più lento';
  if (r === 'musica') return nBrani ? 'Cambia la musica' : 'Aggiungi la musica';
  return s.titoli ? 'Togli i titoli' : 'Rimetti i titoli';
}

// ——— cosa è stato scartato e perché ———
export type MotivoScarto = 'doppia' | 'mossa' | 'fuori';
export const SOGLIA_MOSSA = 0.4;
export const ETICHETTA_SCARTO: Record<MotivoScarto, string> = { doppia: 'DOPPIA', mossa: 'MOSSA', fuori: 'IN PIÙ' };
export const SPIEGA_SCARTO: Record<MotivoScarto, string> = {
  doppia: 'Quasi uguale a un\'altra foto: è stata tenuta quella più nitida. Clic per rimetterla.',
  mossa: 'Mossa, sfocata o troppo scura. Clic per rimetterla.',
  fuori: 'Per questa durata non c\'era posto per tutti. Clic per rimetterla.',
};

/** per ogni file scelto che nel montaggio non c'è: il motivo. `usati` = gli id dei file che il piano ha messo in linea.
 *  I doppioni si ricontano come fa `pianifica` (stesso ordine, stesso seme), così il motivo è quello vero. */
export function motiviScarto(
  entrate: EntrataMontage[], usati: ReadonlySet<string>, o: Pick<OpzMontage, 'ordine' | 'seme' | 'scarta' | 'tieni'>,
): Map<string, MotivoScarto> {
  const fuori = new Map<string, MotivoScarto>();
  const doppi = new Set<string>();
  if (o.scarta) for (const e of senzaDoppioni(ordina(entrate, o.ordine, o.seme), 6, new Set(o.tieni ?? [])).tolte) doppi.add(e.media);
  const rimesse = new Set(o.tieni ?? []);
  for (const e of entrate) {
    if (usati.has(e.media) || rimesse.has(e.media)) continue;
    fuori.set(e.media, doppi.has(e.media) ? 'doppia' : e.punteggio < SOGLIA_MOSSA ? 'mossa' : 'fuori');
  }
  return fuori;
}

// ——— il ritmo della musica e le frasi ———
/** i battiti al minuto, dalla distanza tipica (mediana) fra un battito e l'altro; niente se sono troppo pochi */
export function bpmDaBattiti(battiti: number[] | undefined): number | undefined {
  if (!battiti || battiti.length < 4) return undefined;
  const d: number[] = [];
  for (let i = 1; i < battiti.length; i++) { const x = battiti[i] - battiti[i - 1]; if (x > 0.05) d.push(x); }
  if (d.length < 3) return undefined;
  d.sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  const bpm = Math.round(60 / med);
  return bpm >= 40 && bpm <= 240 ? bpm : undefined;
}

export interface DatiRiassunto {
  stile: string;
  nFoto: number;
  nVideo: number;
  durata: number;
  musica?: { nome: string; sulBattito: boolean; bpm?: number };
}

/** «Viaggio · 64 foto e 9 video · 2 min · tagli sui battiti di «Strada aperta»» */
export function riassunto(d: DatiRiassunto): string {
  const file = d.nVideo ? `${d.nFoto} foto e ${d.nVideo} video` : `${d.nFoto} foto`;
  const parti = [d.stile, file, durataParlata(d.durata)];
  if (!d.musica) parti.push('senza musica');
  else if (d.musica.sulBattito) parti.push(`tagli sui battiti di «${d.musica.nome}»${d.musica.bpm ? ` (${d.musica.bpm} al minuto)` : ''}`);
  else parti.push(`musica «${d.musica.nome}»`);
  return parti.join(' · ');
}

// ——— gli stili ———
/** gli stili di una categoria («tutte» li dà tutti, nell'ordine del catalogo) */
export function stiliPerCategoria(stili: PresetMontage[], categoria: string): PresetMontage[] {
  return categoria === 'tutte' ? [...stili] : stili.filter((p) => p.categoria === categoria);
}

/** quanti stili ha ogni categoria (il numero che si scrive sul filtro) */
export function conteggiCategorie(stili: PresetMontage[]): Record<string, number> {
  const c: Record<string, number> = { tutte: stili.length };
  for (const p of stili) c[p.categoria] = (c[p.categoria] ?? 0) + 1;
  return c;
}

/** il fondo della scheda di uno stile: i due colori del suo sfondo */
export const fondoStile = (p: Pick<PresetMontage, 'sfondo'>) => `linear-gradient(160deg, ${p.sfondo[0]}, ${p.sfondo[1]})`;

export const RITMO_PAROLE: Record<PresetMontage['ritmo'], string> = { lento: 'ritmo lento', medio: 'ritmo medio', veloce: 'ritmo veloce' };
