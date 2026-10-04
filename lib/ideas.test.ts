import { describe, expect, it } from 'vitest';
import { joindreIdeeFusionnee } from '@/lib/ideas';

describe('joindreIdeeFusionnee', () => {
  const lignes = [
    { id: 'a', title: 'Minuteur automatique', merged_into_id: null },
    { id: 'b', title: 'Chronomètre qui se lance seul', merged_into_id: 'a' },
    { id: 'c', title: 'Idée orpheline', merged_into_id: 'supprimee' },
  ];

  it('donne à une idée fusionnée le titre de sa cible, prise dans la liste', () => {
    const r = joindreIdeeFusionnee(lignes);
    expect(r[1].merged_into).toEqual({ title: 'Minuteur automatique' });
  });
  it('laisse null une idée non fusionnée', () => {
    expect(joindreIdeeFusionnee(lignes)[0].merged_into).toBeNull();
  });
  it('laisse null une cible introuvable (supprimée) sans lever', () => {
    expect(joindreIdeeFusionnee(lignes)[2].merged_into).toBeNull();
  });
  it('conserve les autres champs et l’ordre', () => {
    const r = joindreIdeeFusionnee(lignes);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r[1].merged_into_id).toBe('a');
  });
});
