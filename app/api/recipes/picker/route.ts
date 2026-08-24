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
// Portées : « mes recettes » / « mes favoris » / « pâtissiers suivis » /
// « toutes ». Les trois premières servent aussi le mode projet, où la spec
// impose l'ordre carnet → favoris → suivis : l'appelant interroge alors une
// portée à la fois pour savoir de laquelle vient chaque résultat (c'est ce
// qui détermine le crédit d'auteur du composant).
//
// Lecture seule, RLS appliquée via la session.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isProjectDraft } from '@/lib/projects';

const MAX_LIMIT = 30;

const SELECT =
  'id, title, status, is_public, author_id, kind, project_stage, measure_type, yield_qty, yield_unit, yield_desc, ' +
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
  // `mine` est la seule portée qui laisse passer des brouillons, donc la seule
  // par où un projet en cours pourrait entrer : un chantier n'est pas une
  // sous-recette (ses composants peuvent être non résolus et ses quantités ne
  // sont que des points de départ). Un projet validé, lui, est une recette
  // ordinaire et reste proposé.
  if (scopes.has('mine') && user) {
    branches.push(`and(author_id.eq.${user.id},or(kind.eq.simple,project_stage.neq.wizard))`);
  }
  // Recettes des pâtissiers suivis (spec §5.3). Toujours publiées : c'est
  // déjà tout ce que la RLS laisse voir d'un auteur qu'on suit, le filtre
  // n'est ici que pour ne pas dépendre d'elle sur ce point.
  if (scopes.has('followed') && user) {
    const { data: suivis } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
    const ids = (suivis ?? []).map((f) => f.following_id);
    if (ids.length) branches.push(`and(author_id.in.(${ids.join(',')}),status.eq.published)`);
  }
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
  // Filet côté serveur pour la portée « favoris », qui passe par une liste
  // d'identifiants sans filtre SQL : mettre un projet en cours en favori est
  // censé être impossible (spec §10), mais rien en base ne l'empêche.
  const items = ((data as unknown as { kind?: string | null; project_stage?: string | null }[]) ?? []).filter(
    (r) => !isProjectDraft(r),
  );
  return NextResponse.json({ items });
}
