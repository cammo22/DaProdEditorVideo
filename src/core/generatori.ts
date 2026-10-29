// I generatori pronti del contenitore: i titoli già vestiti (testo, stile, grandezza) e i countdown.
// Un posto solo, così il clic, il trascinamento nella timeline e le anteprime usano gli stessi.
import type { Clip, TitleSpec } from './tipi';

export type GruppoTitoli = 'titoli' | 'tv' | 'conto' | 'sala';

export interface PresetTitolo {
  id: string;
  nome: string;
  gruppo: 'titoli' | 'tv';
  /** quello che cambia rispetto al titolo di partenza */
  spec: Partial<TitleSpec>;
  /** quante volte la durata di partenza (5 s): il rullo e il crawl hanno bisogno di tempo */
  volte?: number;
}

export const PRESET_TITOLI: PresetTitolo[] = [
  { id: 'fisso', nome: 'Titolo', gruppo: 'titoli', spec: {} },
  { id: 'cinema', nome: 'Cinema', gruppo: 'titoli', spec: { style: 'cinema', text: 'Napoli, 1994', size: 72, shadow: true, outline: 'none' } },
  { id: 'neon', nome: 'Neon', gruppo: 'titoli', spec: { style: 'neon', text: 'OPEN', color: '#ff3df2', size: 130, shadow: false, outline: 'none', font: 'Orbitron' } },
  { id: 'rimbalzo', nome: 'Rimbalzo', gruppo: 'titoli', spec: { style: 'rimbalzo', text: 'WOW!', size: 150, color: '#ffd54a', outline: '#000000' } },
  { id: 'macchina', nome: 'Macchina da scrivere', gruppo: 'titoli', spec: { style: 'macchina', text: 'C\'era una volta…', size: 64, outline: 'none', color: '#f2efe6' } },
  { id: 'citazione', nome: 'Citazione', gruppo: 'titoli', spec: { style: 'citazione', text: 'Il montaggio è scrivere\ncon le immagini.', size: 60, outline: 'none' } },
  { id: 'sfumato', nome: 'Sfumato', gruppo: 'titoli', spec: { style: 'gradiente', text: 'Estate 2026', size: 120, color: '#ffd54a', boxColor: '#ff3df2', shadow: false, outline: 'none', font: 'Orbitron' } },
  { id: 'rivela', nome: 'Rivela', gruppo: 'titoli', spec: { style: 'rivela', text: 'Capitolo uno', size: 96, color: '#ffffff', boxColor: '#ff3df2', shadow: true, outline: 'none' } },
  { id: 'glitch', nome: 'Glitch', gruppo: 'titoli', spec: { style: 'glitch', text: 'Error 404', size: 124, color: '#ffffff', shadow: false, outline: 'none', font: 'Orbitron' } },
  { id: 'grande', nome: 'Grande', gruppo: 'titoli', spec: { style: 'grande', text: 'DaProd', size: 230, color: '#ffffff', shadow: true, outline: 'none' } },
  { id: 'cascata', nome: 'Cascata', gruppo: 'titoli', spec: { style: 'cascata', text: 'Buongiorno!', size: 130, color: '#ffffff', outline: 'none', shadow: true } },
  { id: 'assembla', nome: 'Si compone', gruppo: 'titoli', spec: { style: 'assembla', text: 'Insieme', size: 150, color: '#ffd54a', outline: 'none', shadow: true } },
  { id: 'onda', nome: 'Onda', gruppo: 'titoli', spec: { style: 'onda', text: 'Mare mosso', size: 120, color: '#35e8ff', outline: 'none', shadow: true, font: 'Orbitron' } },
  { id: 'evidenzia', nome: 'Evidenziatore', gruppo: 'titoli', spec: { style: 'evidenzia', text: 'La parte importante', size: 84, color: '#111111', boxColor: '#ffd54a', outline: 'none', shadow: false } },
  { id: 'karaoke', nome: 'Karaoke', gruppo: 'titoli', spec: { style: 'karaoke', text: 'Canta con me', size: 100, color: '#ffffff', boxColor: '#ff3df2', outline: 'none', shadow: false, ingresso: 'dissolve' } },
  { id: 'estruso', nome: '3D', gruppo: 'titoli', spec: { style: 'estruso', text: 'DaProd', size: 200, color: '#ffffff', boxColor: '#ff3df2', outline: 'none', shadow: false } },
  { id: 'ombraLunga', nome: 'Ombra lunga', gruppo: 'titoli', spec: { style: 'ombraLunga', text: 'Long shadow', size: 150, color: '#ffffff', boxColor: '#1b3a8f', outline: 'none', shadow: false } },
  { id: 'contorno', nome: 'Contorno', gruppo: 'titoli', spec: { style: 'contorno', text: 'OUTLINE', size: 190, color: '#35e8ff', outline: 'none', shadow: false, font: 'Orbitron' } },
  { id: 'zoomCinema', nome: 'Cinema con sottotitolo', gruppo: 'titoli', spec: { style: 'cinema', text: 'La città', sotto: 'un film di DaProd · 2026', size: 96, shadow: true, outline: 'none', ingresso: 'zoom', uscita: 'dissolve' } },
  { id: 'dedica', nome: 'Dedica', gruppo: 'titoli', spec: { style: 'citazione', text: 'Per Nonna Maria', sotto: '1938 – sempre con noi', size: 80, outline: 'none', ingresso: 'sale', uscita: 'dissolve' } },
  { id: 'capitolo', nome: 'Capitolo', gruppo: 'titoli', spec: { style: 'fisso', text: 'CAPITOLO 2', sotto: 'Il viaggio comincia', size: 110, font: 'Orbitron', spaziatura: 0.12, outline: 'none', shadow: true, ingresso: 'sinistra', uscita: 'destra' } },
  { id: 'notiziario', nome: 'Notiziario', gruppo: 'tv', spec: { style: 'notiziario', text: 'ULTIM\'ORA\nDaProd Editor Video 1.1.2, il big update', size: 46, boxColor: '#d2202a', y: 0.82, align: 'left' } },
  { id: 'sottopancia', nome: 'Sottopancia', gruppo: 'tv', spec: { style: 'sottopancia', text: 'Mario Rossi\nregista', size: 56, align: 'left' } },
  { id: 'etichetta', nome: 'Etichetta', gruppo: 'tv', spec: { style: 'etichetta', text: 'Nuovo video', size: 50, color: '#1a1206', boxColor: '#ffd54a', outline: 'none', shadow: false, y: 0.16, align: 'left' } },
  { id: 'social', nome: 'Social', gruppo: 'tv', spec: { style: 'social', text: 'Seguici per la parte 2 👉', size: 58, color: '#111111', boxColor: '#ffd54a', outline: 'none', shadow: false, y: 0.78 } },
  { id: 'crawl', nome: 'Crawl', gruppo: 'tv', spec: { style: 'crawl', text: 'ULTIM\'ORA · DaProd Editor Video: il montaggio vecchio stile, moderno dentro · ', size: 50, y: 0.9, box: true }, volte: 2 },
  { id: 'rullo', nome: 'Rullo titoli', gruppo: 'tv', spec: { style: 'rullo', text: 'DaProd Editor Video\n\nMontaggio\nDaProd\n\nMusica\nDaProd\n\nGrazie per la visione', size: 64 }, volte: 3 },
];

export const presetTitolo = (id: string) => PRESET_TITOLI.find((x) => x.id === id);

/** veste la clip titolo col preset (testo, stile, grandezza); la durata la decide chi la posa (`volte`) */
export function applicaPresetTitolo(c: Clip, id: string) {
  const pr = presetTitolo(id);
  if (!pr || !c.gen?.title) return;
  Object.assign(c.gen.title, pr.spec);
  c.name = pr.nome === 'Titolo' ? 'Titolo' : `Titolo ${pr.nome}`;
}

/**
 * Cosa c'è scritto nel dato del trascinamento di un generatore:
 * 'g:title:cinema', 'g:countdown:neon:3', 'g:anim:lt-barra', 'g:html:neon', 'g:bars', 'g:nero', 'g:color' (e i vecchi 'g:title', 'g:countdown').
 */
export function leggiGeneratore(dato: string): { kind: 'bars' | 'color' | 'countdown' | 'title' | 'nero' | 'anim' | 'html'; titolo?: string; anim?: string; html?: string; conto?: { stile: 'pellicola' | 'moderno' | 'neon' | 'minimal'; secondi: number } } {
  const [, kind, a, b] = dato.split(':');
  if (kind === 'title') return { kind, titolo: a };
  if (kind === 'anim') return { kind, anim: a };
  if (kind === 'html') return { kind, html: a };
  if (kind === 'countdown') return { kind, conto: { stile: (a as 'pellicola') || 'pellicola', secondi: Number(b) || 5 } };
  return { kind: kind as 'bars' | 'color' | 'nero' };
}
