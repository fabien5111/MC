// Route Handler — recherche de recettes du sélecteur « Remplacer un
// ingrédient par une recette » (fiche d'une recette planifiée).
//
// Pourquoi une route dédiée plutôt que la RPC `search_advanced_recipes` de la
// recherche avancée : celle-ci filtre en dur sur `status = 'published'`, alors
// que le sélecteur doit précisément proposer aussi ses propres brouillons
// (« mon praliné » n'a aucune raison d'être publié pour servir de
// sous-recette). Les critères sont ici trois portées cumulables — mes
// recettes / mes favoris / toutes — et un titre.
//
// Pas de vignette dans la réponse : les images sont stockées en data-URL
// directement en base (cf. CLAUDE.md), une page de résultats en pèserait
// plusieurs mégaoctets.
//
// Lecture seule, RLS appliquée via la session.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

const MAX_LIMIT = 30;

const SELECT =
  'id, title, status, is_public, author_id, measure_type, yield_qty, yield_unit, yield_desc, ' +
  'prep_time, cook_time, wait_time, total_time, rating_avg, rating_count, created_at, ' +
  'profiles!recipes_author_id_fkey(full_name), recipe_types(name), difficulties(name, level), ' +
  'recipe_steps(prep_time, cook_time, wait_time)';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || MAX_LIMIT));
  const scopes = new Set((searchParams.get('scopes') ?? '').split(',').filter(Boolean));

  const user = await getCurrentUser();
  const supabase = await createClient();

  // Chaque portée cochée devient une branche du OU. Aucune portée exploitable
  // (non connecté sans « toutes », aucun favori) : on renvoie une liste vide
  // plutôt qu'une requête sans filtre, qui ramènerait tout le catalogue.
  const branches: string[] = [];
  if (scopes.has('all')) branches.push('status.eq.published');
  if (scopes.has('mine') && user) branches.push(`author_id.eq.${user.id}`);
  if (scopes.has('fav') && user) {
    const { data: favs } = await supabase.from('favorites').select('recipe_id').eq('user_id', user.id);
    const ids = (favs ?? []).map((f) => f.recipe_id);
    if (ids.length) branches.push(`id.in.(${ids.join(',')})`);
  }
  if (!branches.length) return NextResponse.json({ items: [] });

  let q = supabase.from('recipes').select(SELECT).or(branches.join(',')).limit(limit);
  // Le titre est un filtre supplémentaire (ET), pas une quatrième branche du
  // OU : il restreint la portée choisie, il ne l'élargit pas.
  if (term) q = q.ilike('title', `%${term}%`);
  q = term ? q.order('title', { ascending: true }) : q.order('created_at', { ascending: false });

  const { data, error } = await q;
  if (error) {
    console.error('recipes/picker:', error.message);
    return NextResponse.json({ items: [], erreur: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}
