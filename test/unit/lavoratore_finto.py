"""Lanciatore di prova: stesso protocollo del vero lavoratore, ma con motori finti (nessun modello, nessuna GPU)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src-tauri/motore'))
import motore_lavoratori as L  # noqa: E402


class Traduttore:
    def traduci(self, testo, da, a):
        if testo == 'ESPLODI':
            raise ValueError('Frase di prova rifiutata')
        return f'[{a}] {testo}'


class Memoria:
    def traduci(self, testo, da, a):
        raise MemoryError('CUDA out of memory')


L.BACKEND['traduci'] = lambda ctx: Memoria() if ctx.dispositivo == 'cpu' else Traduttore()

if __name__ == '__main__':
    sys.exit(L.main_lavoratore(sys.argv[1]))
