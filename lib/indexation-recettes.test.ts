import { describe, expect, it } from 'vitest';
import {
  entreesSitemapRecettes,
  imageSitemap,
  recetteIndexable,
  sitemapEnAttente,
  type LigneSitemapRecette,
} from './indexation-recettes';

const publiee = { status: 'published', is_public: true, kind: 'recipe', project_stage: null };

describe('recetteIndexable', () => {
  it('accepte une recette publiée et publique', () => {
    expect(recetteIndexable(publiee)).toBe(true);
    expect(recetteIndexable({ ...publiee, is_public: null })).toBe(true);
  });
  it('refuse tout statut autre que publié', () => {
    for (const status of ['draft', 'pending', 'rejected', null]) {
      expect(recetteIndexable({ ...publiee, status })).toBe(false);
    }
  });
  it('refuse une recette privée', () => {
    expect(recetteIndexable({ ...publiee, is_public: false })).toBe(false);
  });
  it('refuse un projet en cours, pas un projet validé ou dissous', () => {
    expect(recetteIndexable({ ...publiee, kind: 'project', project_stage: 'wizard' })).toBe(false);
    expect(recetteIndexable({ ...publiee, kind: 'project', project_stage: 'ready' })).toBe(true);
    expect(recetteIndexable({ ...publiee, kind: 'project', project_stage: 'dissolved' })).toBe(true);
  });
  it('refuse une recette absente', () => {
    expect(recetteIndexable(null)).toBe(false);
    expect(recetteIndexable(undefined)).toBe(false);
  });
});

describe('sitemapEnAttente', () => {
  it('se tait sur www seulement, et seulement sous la page d’attente', () => {
    expect(sitemapEnAttente('www.jepatisse.com', 'true')).toBe(true);
    expect(sitemapEnAttente('dev.jepatisse.com', 'true')).toBe(false);
    expect(sitemapEnAttente('www.jepatisse.com', undefined)).toBe(false);
    expect(sitemapEnAttente('www.jepatisse.com', 'false')).toBe(false);
    expect(sitemapEnAttente(null, 'true')).toBe(false);
  });
});

describe('imageSitemap', () => {
  it('ne garde qu’une URL https', () => {
    expect(imageSitemap('https://exemple.ch/a.jpg')).toBe('https://exemple.ch/a.jpg');
    expect(imageSitemap('data:image/jpeg;base64,AAA')).toBeNull();
    expect(imageSitemap('http://exemple.ch/a.jpg')).toBeNull();
    expect(imageSitemap(null)).toBeNull();
  });
});

describe('entreesSitemapRecettes', () => {
  const ligne = (p: Partial<LigneSitemapRecette>): LigneSitemapRecette => ({
    id: 'r1',
    updated_at: '2026-10-01T10:00:00Z',
    hero_image_url: null,
    ...publiee,
    ...p,
  });
  it('écarte les recettes non indexables et pose l’origine donnée', () => {
    const e = entreesSitemapRecettes(
      [
        ligne({ id: 'a', hero_image_url: 'https://img/a.jpg' }),
        ligne({ id: 'b', is_public: false }),
        ligne({ id: 'c', kind: 'project', project_stage: 'wizard' }),
        ligne({ id: 'd', updated_at: null }),
      ],
      'https://www.jepatisse.com',
    );
    expect(e.map((x) => x.url)).toEqual([
      'https://www.jepatisse.com/recette/a',
      'https://www.jepatisse.com/recette/d',
    ]);
    expect(e[0]).toMatchObject({ lastModified: '2026-10-01T10:00:00Z', images: ['https://img/a.jpg'] });
    expect(e[1]).not.toHaveProperty('lastModified');
    expect(e[1]).not.toHaveProperty('images');
  });
});
