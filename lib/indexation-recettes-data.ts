// Lecture des recettes du plan du site (JEP-246), côté serveur.
//
// Client anonyme (`createPublicClient`) : la RLS n'ouvre au rôle `anon` que
// les recettes publiées et publiques d'un auteur non désactivé — jamais la clé
// service_role, qui listerait brouillons et recettes privées. Le filtre
// explicite ci-dessous double cette garantie.
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { SITEMAP_RECETTES_MAX, type LigneSitemapRecette } from '@/lib/indexation-recettes';

const SITEMAP_RECETTES_TAG = 'sitemap-recettes';

async function lireRecettes(): Promise<LigneSitemapRecette[]> {
  const { data, error } = await createPublicClient()
    .from('recipes')
    .select('id, updated_at, hero_image_url, status, is_public, kind, project_stage')
    .eq('status', 'published')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(SITEMAP_RECETTES_MAX);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LigneSitemapRecette[];
  // Une liste vide n'est pas mise en cache (une exception ne l'est jamais) :
  // une panne de quelques secondes ne doit pas vider le plan pendant une heure.
  if (rows.length === 0) throw new Error('aucune recette lue');
  if (rows.length >= SITEMAP_RECETTES_MAX) {
    console.warn(`sitemap-recettes : plafond de ${SITEMAP_RECETTES_MAX} atteint, découpage à prévoir`);
  }
  return rows;
}

const lireRecettesEnCache = unstable_cache(lireRecettes, ['sitemap-recettes'], {
  revalidate: 3600,
  tags: [SITEMAP_RECETTES_TAG],
});

/** Recettes du plan du site ; vide en cas de panne (jamais un build en échec). */
export async function getSitemapRecettes(): Promise<LigneSitemapRecette[]> {
  try {
    return await lireRecettesEnCache();
  } catch {
    return [];
  }
}
