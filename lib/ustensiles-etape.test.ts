import { describe, expect, it } from 'vitest';
import { nettoyerUstensilsEtape, utensilsToAdd } from './projects';

describe('nettoyerUstensilsEtape', () => {
  it('rend une liste vide pour une valeur illisible', () => {
    expect(nettoyerUstensilsEtape(null)).toEqual([]);
    expect(nettoyerUstensilsEtape('fouet')).toEqual([]);
    expect(nettoyerUstensilsEtape([null, 3, {}])).toEqual([]);
  });

  it('nettoie les noms, écarte les lignes vides et les doublons', () => {
    const r = nettoyerUstensilsEtape([
      { name: '  Fouet ', comment: ' électrique ' },
      { name: '', comment: 'vide' },
      { name: 'fouet', comment: null },
      { name: 'Maryse', ref_id: 4 },
    ]);
    expect(r).toEqual([
      { name: 'Fouet', ref_id: null, comment: 'électrique' },
      { name: 'Maryse', ref_id: 4, comment: null },
    ]);
  });
});

describe('alimentation de la liste globale', () => {
  it("n'ajoute que les ustensiles d'étape absents de la liste globale", () => {
    const globale = [{ name: 'Fouet', ref_id: null }];
    const etapes = nettoyerUstensilsEtape([{ name: 'fouet' }, { name: 'Robot' }]);
    expect(utensilsToAdd(globale, etapes).map((u) => u.name)).toEqual(['Robot']);
  });
});
