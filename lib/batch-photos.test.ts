import { describe, expect, it } from 'vitest';
import {
  BATCH_PHOTOS_MAX,
  FOURNEE_PHOTOS_MAX,
  LEGENDE_MAX,
  estTableAbsente,
  grouperParFournee,
  ordresApresEchange,
  normaliserLegende,
  photosDeEtape,
  messagePlein,
  photosEtapesPermises,
  placesRestantes,
  prochainOrdre,
  trierPhotos,
  type Realisation,
} from '@/lib/batch-photos';
import { USAGES } from '@/lib/storage';

function photo(id: number, p: Partial<Realisation> = {}): Realisation {
  return {
    id,
    batch_id: 1,
    batch_step_id: null,
    url: `https://x/jp-photos/realisations/${id}.jpg`,
    thumb_url: null,
    legende: null,
    order_index: id,
    created_at: `2026-11-0${id}T10:00:00Z`,
    fournee: { id: 1, recipe_id: 'r', titre: 'Tarte', date: '2026-11-05' },
    ...p,
  };
}

describe('photos de réalisation — règles', () => {
  it('dépose sur le conteneur public, réservé aux membres connectés', () => {
    expect(USAGES.realisation).toEqual({ conteneur: 'photos', prefixe: 'realisations', acces: 'membre' });
  });
  it('compte les places restantes par emplacement, jamais en négatif', () => {
    expect(placesRestantes([], null)).toBe(FOURNEE_PHOTOS_MAX);
    expect(placesRestantes([], 3)).toBe(BATCH_PHOTOS_MAX);
    const fin = Array.from({ length: FOURNEE_PHOTOS_MAX + 2 }, () => ({ batch_step_id: null }));
    expect(placesRestantes(fin, null)).toBe(0);
    // Les photos de fin de fournée ne prennent pas la place d'une étape, et inversement.
    expect(placesRestantes(fin, 3)).toBe(BATCH_PHOTOS_MAX);
    const etape = [{ batch_step_id: 3 }, { batch_step_id: 3 }, { batch_step_id: 4 }];
    expect(placesRestantes(etape, 3)).toBe(BATCH_PHOTOS_MAX - 2);
    expect(placesRestantes(etape, null)).toBe(FOURNEE_PHOTOS_MAX);
  });
  it('réserve les photos d’étape à l’auteur de la recette', () => {
    expect(photosEtapesPermises('u1', 'u1')).toBe(true);
    expect(photosEtapesPermises('u2', 'u1')).toBe(false);
    expect(photosEtapesPermises(null, 'u1')).toBe(false);
    expect(photosEtapesPermises(undefined, undefined)).toBe(false);
  });
  it('nomme l’emplacement plein', () => {
    expect(messagePlein(null)).toMatch(/pour la fournée/);
    expect(messagePlein(5)).toMatch(/par étape/);
  });
  it('place une nouvelle photo après la dernière', () => {
    expect(prochainOrdre([])).toBe(0);
    expect(prochainOrdre([{ order_index: 3 }, { order_index: 1 }])).toBe(4);
  });
  it('nettoie la légende', () => {
    expect(normaliserLegende('  ')).toBeNull();
    expect(normaliserLegende(null)).toBeNull();
    expect(normaliserLegende(' Belle croûte ')).toBe('Belle croûte');
    expect(normaliserLegende('a'.repeat(LEGENDE_MAX + 10))).toHaveLength(LEGENDE_MAX);
  });
  it('reconnaît une table absente', () => {
    expect(estTableAbsente({ code: 'PGRST205', message: '' })).toBe(true);
    expect(estTableAbsente({ code: '42P01', message: '' })).toBe(true);
    expect(estTableAbsente({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(estTableAbsente(null)).toBe(false);
  });
  it('trie par ordre puis par date, et filtre par étape', () => {
    const ps = [photo(2, { order_index: 1 }), photo(1, { order_index: 1, batch_step_id: 9 }), photo(3, { order_index: 0, batch_step_id: 9 })];
    expect(trierPhotos(ps).map((p) => p.id)).toEqual([3, 1, 2]);
    expect(photosDeEtape(ps, 9).map((p) => p.id)).toEqual([3, 1]);
  });
});

describe('grouperParFournee', () => {
  it('range par fournée, la plus récente d’abord', () => {
    const groupes = grouperParFournee([
      photo(1, { fournee: { id: 1, recipe_id: 'r', titre: 'Tarte', date: '2026-10-01' } }),
      photo(2, { fournee: { id: 2, recipe_id: 'r', titre: 'Tarte', date: '2026-11-01' } }),
      photo(3, { fournee: { id: 1, recipe_id: 'r', titre: 'Tarte', date: '2026-10-01' }, order_index: 0 }),
    ]);
    expect(groupes.map((g) => g.fourneeId)).toEqual([2, 1]);
    expect(groupes[1].photos.map((p) => p.id)).toEqual([3, 1]);
  });
  it('se replie sur la date des photos quand la fournée n’a pas de date', () => {
    const groupes = grouperParFournee([
      photo(1, { fournee: { id: 1, recipe_id: 'r', titre: 'A', date: null }, created_at: '2026-11-06T10:00:00Z' }),
      photo(2, { fournee: { id: 2, recipe_id: 'r', titre: 'B', date: '2026-11-01' } }),
    ]);
    expect(groupes.map((g) => g.fourneeId)).toEqual([1, 2]);
  });
});

describe('ordresApresEchange', () => {
  const ph = (id: number, step: number | null, ordre: number) => photo(id, { batch_step_id: step, order_index: ordre });
  it('échange les ordres de deux photos de la même étape', () => {
    const l = [ph(1, 7, 0), ph(2, 7, 1), ph(3, 7, 2)];
    expect(ordresApresEchange(l, 1, 2)).toEqual([
      { id: 2, ordre: 0 },
      { id: 1, ordre: 1 },
    ]);
  });
  it('ignore les photos des autres étapes', () => {
    const l = [ph(1, 7, 0), ph(2, 8, 1), ph(3, 7, 5)];
    expect(ordresApresEchange(l, 1, 3)).toEqual([
      { id: 3, ordre: 0 },
      { id: 1, ordre: 5 },
    ]);
  });
  it('renumérote quand des ordres sont en double', () => {
    const l = [ph(1, 7, 3), ph(2, 7, 3)];
    const r = ordresApresEchange(l, 1, 2);
    expect(new Set(r.map((x) => x.ordre)).size).toBe(r.length);
    expect(r.length).toBeGreaterThan(0);
  });
  it('ne fait rien pour deux étapes différentes ou une photo inconnue', () => {
    expect(ordresApresEchange([ph(1, 7, 0), ph(2, 8, 1)], 1, 2)).toEqual([]);
    expect(ordresApresEchange([ph(1, 7, 0)], 1, 9)).toEqual([]);
  });
});
