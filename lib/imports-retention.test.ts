import { describe, expect, it } from 'vitest';

import {
  PREAVIS_JOURS,
  RETENTION_JOURS,
  dateSuppression,
  estExpire,
  seuilPurge,
  suppressionProche,
} from '@/lib/imports-retention';

const JOUR = 86_400_000;
const T0 = new Date('2026-09-05T12:00:00.000Z');
const ilYA = (jours: number) => new Date(T0.getTime() - jours * JOUR).toISOString();

describe('échéance', () => {
  it('tombe trente jours après la dernière activité', () => {
    expect(dateSuppression('2026-09-05T12:00:00.000Z').toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('accepte indifféremment une chaîne ISO ou une Date', () => {
    const iso = '2026-09-05T12:00:00.000Z';
    expect(dateSuppression(iso).getTime()).toBe(dateSuppression(new Date(iso)).getTime());
  });
});

// Le prédicat de la purge. Une purge se trompe une seule fois : ces bornes
// sont vérifiées à la seconde près, des deux côtés.
describe('expiration', () => {
  it('épargne un import actif hier', () => {
    expect(estExpire(ilYA(1), T0)).toBe(false);
  });

  it('épargne un import à un jour de son échéance', () => {
    expect(estExpire(ilYA(RETENTION_JOURS - 1), T0)).toBe(false);
  });

  it('épargne un import une seconde avant son échéance', () => {
    expect(estExpire(new Date(T0.getTime() - RETENTION_JOURS * JOUR + 1000), T0)).toBe(false);
  });

  // La borne appartient au membre : à la seconde pile, on conserve. C'est ce
  // que fait le `.lt()` de la purge, et le prédicat affiché doit dire pareil.
  it('épargne un import pile à son échéance', () => {
    expect(estExpire(ilYA(RETENTION_JOURS), T0)).toBe(false);
  });

  it('purge un import une seconde après son échéance', () => {
    expect(estExpire(new Date(T0.getTime() - RETENTION_JOURS * JOUR - 1000), T0)).toBe(true);
  });

  it('purge le plus ancien import du relevé du 05/09 (13/07)', () => {
    expect(estExpire('2026-07-13T00:00:00.000Z', T0)).toBe(true);
  });

  // `seuilPurge` alimente un `.lt('updated_at', …)` : la borne qu'il rend et
  // le prédicat `estExpire` doivent désigner exactement le même ensemble,
  // sinon la purge et l'affichage se contrediraient.
  it('seuilPurge désigne le même ensemble que estExpire', () => {
    const seuil = seuilPurge(T0);
    for (const jours of [0, 1, 15, 29, 29.9, 30, 30.1, 60]) {
      const activite = ilYA(jours);
      expect(activite < seuil, `${jours} j`).toBe(estExpire(activite, T0));
    }
  });
});

describe('préavis affiché', () => {
  it('reste muet tant que l’échéance est lointaine', () => {
    expect(suppressionProche(ilYA(1), T0)).toBe(false);
    expect(suppressionProche(ilYA(RETENTION_JOURS - PREAVIS_JOURS - 1), T0)).toBe(false);
  });

  it('annonce l’échéance dans la dernière semaine', () => {
    expect(suppressionProche(ilYA(RETENTION_JOURS - PREAVIS_JOURS), T0)).toBe(true);
    expect(suppressionProche(ilYA(RETENTION_JOURS - 1), T0)).toBe(true);
  });

  it('reste vrai pour un import déjà expiré mais pas encore passé au ménage', () => {
    expect(suppressionProche(ilYA(RETENTION_JOURS + 5), T0)).toBe(true);
  });
});
