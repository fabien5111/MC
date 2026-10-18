// Barre de statut sur toutes les portées du carnet (JEP-6) : « Tout » garde sa
// règle d'origine, Favoris / Abonnements / Projets / Carnet CAP comptent et
// filtrent leurs propres recettes.
import { describe, expect, it } from 'vitest';
import { applyCarnetFilters, compteursStatut, statutDe, type CarnetItem } from '@/lib/carnet';
import { EMPTY_CARNET_PARAMS } from '@/lib/carnet-params';
import type { UserRecipeCard } from '@/lib/recipes';

const carte = (id: string, extra: Partial<UserRecipeCard> = {}) =>
  ({ id, title: id, author_id: 'x', created_at: '2026-10-01', status: 'published', is_public: true, kind: 'simple', project_stage: null, ...extra }) as unknown as UserRecipeCard;
const mine = (id: string, status: string, favorite = false): CarnetItem => ({ kind: 'mine', recipe: carte(id, { status }), favorite });
const other = (id: string, extra: Partial<Extract<CarnetItem, { kind: 'other' }>> = {}): CarnetItem =>
  ({ kind: 'other', recipe: carte(id), favorite: false, subscription: false, shared: null, status: null, publishedAt: null, ...extra }) as CarnetItem;

describe('statutDe / compteursStatut', () => {
  it('une recette d’un autre sans statut connu vaut « publiée »', () => {
    expect(statutDe(other('a'))).toBe('published');
    expect(statutDe(other('b', { status: 'draft' }))).toBe('draft');
    expect(statutDe(mine('c', 'pending'))).toBe('pending');
  });
  it('compte par statut', () => {
    const c = compteursStatut([mine('a', 'draft'), mine('b', 'published'), other('c')]);
    expect(c).toEqual({ all: 3, published: 2, draft: 1, pending: 0, rejected: 0 });
  });
});

describe('filtre de statut par portée', () => {
  const items = [mine('m1', 'draft', true), mine('m2', 'published', true), other('o1', { favorite: true }), other('o2', { subscription: true })];

  it('Favoris : le statut s’applique à tous les favoris, les miens comme ceux des autres', () => {
    const f = applyCarnetFilters(items, { ...EMPTY_CARNET_PARAMS, scope: 'fav', statut: 'published' });
    expect(f.map((i) => i.recipe.id).sort()).toEqual(['m2', 'o1']);
    expect(applyCarnetFilters(items, { ...EMPTY_CARNET_PARAMS, scope: 'fav', statut: 'draft' }).map((i) => i.recipe.id)).toEqual(['m1']);
  });
  it('Abonnements : tout est publié', () => {
    expect(applyCarnetFilters(items, { ...EMPTY_CARNET_PARAMS, scope: 'sub', statut: 'published' })).toHaveLength(1);
    expect(applyCarnetFilters(items, { ...EMPTY_CARNET_PARAMS, scope: 'sub', statut: 'draft' })).toHaveLength(0);
  });
  it('« Tout » garde sa règle : les recettes des autres passent quel que soit le statut', () => {
    const f = applyCarnetFilters(items, { ...EMPTY_CARNET_PARAMS, scope: 'all', statut: 'draft' });
    expect(f.map((i) => i.recipe.id).sort()).toEqual(['m1', 'o1', 'o2']);
  });
});
