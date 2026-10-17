// Tests de `enFile` : une vidange de file jouée deux fois en même temps notifie
// deux fois chaque événement — la sérialisation est ce qui l'empêche.
import { describe, expect, it } from 'vitest';
import { enFile } from '@/lib/en-file';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('enFile', () => {
  it('rend le résultat de la tâche', async () => {
    await expect(enFile('t-resultat', async () => 42)).resolves.toBe(42);
  });

  it('ne joue jamais deux tâches de la même clé en même temps', async () => {
    const journal: string[] = [];
    const tache = (nom: string, ms: number) => async () => {
      journal.push(`début ${nom}`);
      await pause(ms);
      journal.push(`fin ${nom}`);
    };
    // Lancées d'un coup : sans file, « début b » viendrait avant « fin a ».
    await Promise.all([enFile('t-serie', tache('a', 30)), enFile('t-serie', tache('b', 5)), enFile('t-serie', tache('c', 1))]);
    expect(journal).toEqual(['début a', 'fin a', 'début b', 'fin b', 'début c', 'fin c']);
  });

  it("un échec est rendu à son appelant sans bloquer la suivante", async () => {
    const echec = enFile('t-echec', async () => {
      throw new Error('boum');
    });
    const suivante = enFile('t-echec', async () => 'ok');
    await expect(echec).rejects.toThrow('boum');
    await expect(suivante).resolves.toBe('ok');
  });

  it('des clés différentes ne se sérialisent pas entre elles', async () => {
    const journal: string[] = [];
    const lente = enFile('t-cle-a', async () => {
      await pause(30);
      journal.push('lente');
    });
    const rapide = enFile('t-cle-b', async () => {
      journal.push('rapide');
    });
    await Promise.all([lente, rapide]);
    expect(journal).toEqual(['rapide', 'lente']);
  });
});
