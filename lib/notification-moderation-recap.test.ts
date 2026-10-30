// Tests de la section « Modération » recomposée à l'envoi (JEP-386) : une
// ligne fausse ici, c'est un admin envoyé valider ce qui ne l'attend plus.
import { describe, expect, it } from 'vitest';
import { filesDuRole, lignesModerationActuelles, TITRES_MAX, type FilesModeration } from './notification-moderation-recap';

const files = (r: string[], a: string[], totalR = r.length, totalA = a.length): FilesModeration => ({
  recettes: { total: totalR, titres: r },
  avis: { total: totalA, titres: a },
});

describe('filesDuRole', () => {
  it('ouvre les deux files à l’admin, les recettes seules au gestionnaire, rien aux autres', () => {
    expect(filesDuRole('admin')).toEqual(['recettes', 'avis']);
    expect(filesDuRole('gestionnaire')).toEqual(['recettes']);
    expect(filesDuRole('membre')).toEqual([]);
    expect(filesDuRole(null)).toEqual([]);
  });
});

describe('lignesModerationActuelles', () => {
  it('décrit l’état réel, pas les lignes figées en file', () => {
    const lignes = lignesModerationActuelles({
      evenements: ['moderation_recette', 'moderation_recette', 'moderation_avis'],
      role: 'admin',
      files: files(['Tarte'], ['Éclair', 'Flan']),
    });
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ titre: 'Une recette attend une modération', lien: '/admin/recettes' });
    expect(lignes[0].corps).toBe('1 recette attend votre validation : « Tarte ».');
    expect(lignes[1].corps).toBe('2 avis attendent votre validation : sur « Éclair », sur « Flan ».');
    expect(lignes.every((l) => l.categorie === 'moderation' && l.rubrique === 'moderation')).toBe(true);
  });

  it('se tait sur une file vidée depuis la mise en file (avis validé, membre anonymisé)', () => {
    expect(
      lignesModerationActuelles({ evenements: ['moderation_recette', 'moderation_avis'], role: 'admin', files: files([], []) }),
    ).toEqual([]);
  });

  it('ne parle que des files pour lesquelles un événement est arrivé', () => {
    const lignes = lignesModerationActuelles({ evenements: ['moderation_avis'], role: 'admin', files: files(['Tarte'], ['Flan']) });
    expect(lignes.map((l) => l.lien)).toEqual(['/admin/commentaires']);
  });

  it('n’envoie pas les avis au gestionnaire, ni rien à un rôle retiré', () => {
    const f = files(['Tarte'], ['Flan']);
    const ev = ['moderation_recette', 'moderation_avis'];
    expect(lignesModerationActuelles({ evenements: ev, role: 'gestionnaire', files: f }).map((l) => l.lien)).toEqual([
      '/admin/recettes',
    ]);
    expect(lignesModerationActuelles({ evenements: ev, role: 'membre', files: f })).toEqual([]);
  });

  it('cite au plus TITRES_MAX titres et compte le reste', () => {
    const titres = Array.from({ length: TITRES_MAX }, (_, i) => `R${i + 1}`);
    const [ligne] = lignesModerationActuelles({ evenements: ['moderation_recette'], role: 'admin', files: files(titres, [], 8) });
    expect(ligne.corps).toBe('8 recettes attendent votre validation : « R1 », « R2 », « R3 », « R4 », « R5 » et 3 autres.');
  });

  it('sans titre lisible, garde le compte seul', () => {
    const [ligne] = lignesModerationActuelles({ evenements: ['moderation_recette'], role: 'admin', files: files(['  '], [], 1) });
    expect(ligne.corps).toBe('1 recette attend votre validation.');
  });
});
