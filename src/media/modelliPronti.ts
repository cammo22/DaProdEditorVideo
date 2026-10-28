// Quali modelli AI sono stati caricati per intero almeno una volta su questo computer (e da quale indirizzo di Hugging Face):
// lo scrive chi li carica davvero (il Centro AI o un uso vero) e lo legge il Centro AI per dire «pronto». Sta a parte per
// non far dipendere i moduli dei modelli dall'elenco del Centro AI.
const CHIAVE = 'dpv-modelli-pronti';

export const modelliPronti = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(CHIAVE) ?? '{}'); } catch { return {}; } };
const scrivi = (o: Record<string, string>) => { try { localStorage.setItem(CHIAVE, JSON.stringify(o)); } catch { /* niente */ } };
export const segnaModelloPronto = (id: string, repo: string) => { const o = modelliPronti(); if (o[id] !== repo) { o[id] = repo; scrivi(o); } };
export const dimenticaModello = (id: string) => { const o = modelliPronti(); delete o[id]; scrivi(o); };
export const dimenticaTuttiModelli = () => { try { localStorage.removeItem(CHIAVE); } catch { /* niente */ } };
