// Réservation de la passe quotidienne : un seul appelant par jour.
import { describe, expect, it } from 'vitest';
import { libererQuotidien, reserverQuotidien } from '@/lib/notification-jobs-data';

// Mini-base en mémoire qui imite ce que fait PostgreSQL pour `site_settings` :
// clé primaire (23505 à l'insertion d'une clé existante), `update … neq … select`.
function fauxAdmin() {
  const lignes = new Map<string, string>();
  return {
    lignes,
    from() {
      return {
        insert: async (row: { key: string; value: string }) => {
          if (lignes.has(row.key)) return { error: { code: '23505', message: 'duplicate' } };
          lignes.set(row.key, row.value);
          return { error: null };
        },
        update(patch: { value: string }) {
          const filtres: { eq?: string; neq?: string } = {};
          const chaine = {
            eq(_c: string, v: string) {
              filtres.eq = v;
              return chaine;
            },
            neq(_c: string, v: string) {
              filtres.neq = v;
              return chaine;
            },
            select: async () => {
              const actuel = lignes.get(filtres.eq!);
              if (actuel === undefined || actuel === filtres.neq) return { data: [], error: null };
              lignes.set(filtres.eq!, patch.value);
              return { data: [{ key: filtres.eq }], error: null };
            },
            then(res: (v: { error: null }) => void) {
              if (filtres.eq && lignes.has(filtres.eq)) lignes.set(filtres.eq, patch.value);
              res({ error: null });
            },
          };
          return chaine;
        },
      };
    },
  };
}

describe('reserverQuotidien', () => {
  it('ne donne le jour qu’à un seul appelant', async () => {
    const admin = fauxAdmin();
    expect(await reserverQuotidien(admin, '2026-10-04')).toBe(true);
    expect(await reserverQuotidien(admin, '2026-10-04')).toBe(false);
    expect(await reserverQuotidien(admin, '2026-10-04')).toBe(false);
  });
  it('rouvre le lendemain', async () => {
    const admin = fauxAdmin();
    await reserverQuotidien(admin, '2026-10-04');
    expect(await reserverQuotidien(admin, '2026-10-05')).toBe(true);
    expect(await reserverQuotidien(admin, '2026-10-05')).toBe(false);
  });
  it('se libère après un échec : la passe suivante réessaie', async () => {
    const admin = fauxAdmin();
    await reserverQuotidien(admin, '2026-10-04');
    await libererQuotidien(admin);
    expect(await reserverQuotidien(admin, '2026-10-04')).toBe(true);
  });
});
