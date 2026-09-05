import { describe, expect, it } from 'vitest';

import { CIBLES_BACKFILL, CIBLES_ORDRE, CLE_COMMENTAIRES, estCleCible } from '@/lib/backfill';
import { USAGES } from '@/lib/storage';

// § 7.5, lot B3 : chaque cible doit viser un usage réellement déclaré (sinon
// `deposerDataUrlServeur` échouerait à l'exécution, silencieusement absorbé
// par le `catch` par ligne — une cible mal configurée ne remonterait jamais
// comme une erreur de configuration, seulement comme des échecs en série).
describe('CIBLES_BACKFILL', () => {
  it('vise, pour chaque cible, un usage déclaré dans lib/storage.ts', () => {
    for (const [nom, cible] of Object.entries(CIBLES_BACKFILL)) {
      expect(Object.prototype.hasOwnProperty.call(USAGES, cible.usage), nom).toBe(true);
    }
  });

  it("déclare au moins une colonne par cible — sinon rien à reprendre", () => {
    for (const [nom, cible] of Object.entries(CIBLES_BACKFILL)) {
      expect(cible.colonnes.length, nom).toBeGreaterThan(0);
    }
  });

  it('ne répète jamais deux fois la même colonne dans une même cible', () => {
    for (const [nom, cible] of Object.entries(CIBLES_BACKFILL)) {
      expect(new Set(cible.colonnes).size, nom).toBe(cible.colonnes.length);
    }
  });

  it('site_settings est la seule cible dont la clé primaire n’est pas `id`', () => {
    for (const [nom, cible] of Object.entries(CIBLES_BACKFILL)) {
      if (cible.table === 'site_settings') expect(cible.cle, nom).toBe('key');
      else expect(cible.cle, nom).toBe('id');
    }
  });
});

describe('estCleCible', () => {
  it('reconnaît les cibles déclarées', () => {
    expect(estCleCible('recettes')).toBe(true);
    expect(estCleCible('photosContact')).toBe(true);
  });

  it('refuse `commentaires` — traitée à part, jamais par traiterLotScalaire', () => {
    expect(estCleCible(CLE_COMMENTAIRES)).toBe(false);
  });

  it("refuse une clé inconnue ou une valeur qui n'est pas une chaîne", () => {
    expect(estCleCible('nimporte')).toBe(false);
    expect(estCleCible(undefined)).toBe(false);
    expect(estCleCible(42)).toBe(false);
  });
});

describe('CIBLES_ORDRE', () => {
  it('liste `commentaires` plus exactement une fois chaque cible scalaire, sans doublon', () => {
    const cles = CIBLES_ORDRE.map((c) => c.cle);
    expect(cles).toContain(CLE_COMMENTAIRES);
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles.length).toBe(Object.keys(CIBLES_BACKFILL).length + 1);
  });
});
