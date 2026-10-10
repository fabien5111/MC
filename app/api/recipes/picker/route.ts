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
// Portées : « mes recettes » (hors brouillons) / « mes brouillons » / « mes
// favoris » / « mes abonnements » (`followed`) / « toutes ». Les trois premières servent aussi le mode projet, où la spec
// impose l'ordre carnet → favoris → suivis : l'appelant interroge alors une
// portée à la fois pour savoir de laquelle vient chaque résultat (c'est ce
// qui détermine le crédit d'auteur du composant).
//
// Lecture seule, RLS appliquée via la session.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isProjectDraft } from '@/lib/projects';
import { withNormColumn } from '@/lib/text-search';

const MAX_LIMIT = 30;

// Variantes singulier/pluriel du terme cherché (JEP-254) : « amandes » ne
// contient pas « amande », donc une recette « Crème d'amande » restait
// invisible à qui tapait le pluriel — et inversement. Heuristique du
// français courant (un « s » ou un « x » final), pas une vraie analyse
// linguistique : elle élargit la recherche, elle ne la restreint jamais, un
// faux positif occasionnel (ex. un terme qui se termine légitimement par
// « s ») coûte moins qu'un « aucune recette trouvée » sur une faute d'accord.
function pluralVariants(motif: string): string[] {
  const dernier = motif.slice(-1);
  const variante = dernier === 's' || dernier === 'x' ? motif.slice(0, -1) : `${motif}s`;
  return variante && variante !== motif ? [motif, variante] : [motif];
}

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

  // Chaque portée cochée devient sa PROPRE requête, fusionnées ensuite en
  // mémoire. Un `.or()` combiné portait des listes d'identifiants
  // (`id.in.(uuid,uuid,…)`) : à raison de 36 caractères l'un, quelques dizaines
  // de recettes, de favoris ou d'abonnés faisaient dépasser à l'adresse la
  // limite de l'équilibreur (414 « Request-URI Too Large »). Les filtres
  // `and(...)` imbriqués dans un `.or()` s'étaient par ailleurs révélés peu
  // fiables (ils ne renvoyaient plus rien, silencieusement). Ici : filtres
  // simples, et listes d'identifiants découpées par paquets bornés.
  // Aucune portée exploitable (non connecté sans « toutes », aucun favori) :
  // liste vide, jamais une requête sans filtre qui ramènerait tout le catalogue.
  const PAQUET = 60;
  const paquets = (ids: string[]) => {
    const r: string[][] = [];
    for (let i = 0; i < ids.length; i += PAQUET) r.push(ids.slice(i, i + PAQUET));
    return r;
  };

  type Builder = (q: ReturnType<typeof base>) => ReturnType<typeof base>;
  const base = () => supabase.from('recipes').select(SELECT);
  const filtres: Builder[] = [];

  if (scopes.has('all')) filtres.push((q) => q.eq('status', 'published'));
  // « Mes recettes » (hors brouillons) / « Mes brouillons » : par l'auteur,
  // départagés par le statut. `mine` et `draft` sont les seules portées qui
  // laissent passer des brouillons, donc par où un projet en cours pourrait
  // entrer : un chantier n'est pas une sous-recette. Il est écarté plus bas,
  // en mémoire (`isProjectDraft`).
  if ((scopes.has('mine') || scopes.has('draft')) && user) {
    const uid = user.id;
    if (scopes.has('mine') && scopes.has('draft')) filtres.push((q) => q.eq('author_id', uid));
    else if (scopes.has('draft')) filtres.push((q) => q.eq('author_id', uid).eq('status', 'draft'));
    else filtres.push((q) => q.eq('author_id', uid).neq('status', 'draft'));
  }
  // Recettes publiées des pâtissiers suivis (spec §5.3).
  if (scopes.has('followed') && user) {
    const { data: suivis } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
    const ids = (suivis ?? []).map((f) => f.following_id as string);
    for (const lot of paquets(ids)) filtres.push((q) => q.in('author_id', lot).eq('status', 'published'));
  }
  if (scopes.has('fav') && user) {
    const { data: favs } = await supabase.from('favorites').select('recipe_id').eq('user_id', user.id);
    const ids = (favs ?? []).map((f) => f.recipe_id as string);
    for (const lot of paquets(ids)) filtres.push((q) => q.in('id', lot));
  }
  if (!filtres.length) return NextResponse.json({ items: [] });

  const requete = async (colonne: string, motif: string) => {
    const resultats = await Promise.all(
      filtres.map((f) => {
        let q = f(base()).limit(limit);
        // Le titre est un filtre supplémentaire (ET) : il restreint la portée
        // choisie, il ne l'élargit pas. Colonne normalisée `title_norm`
        // (JEP-254) ; les deux variantes tolèrent le singulier/pluriel.
        if (term) q = q.or(pluralVariants(motif).map((v) => `${colonne}.ilike.%${v}%`).join(','));
        return term ? q.order('title', { ascending: true }) : q.order('created_at', { ascending: false });
      }),
    );
    const erreur = resultats.find((r) => r.error)?.error ?? null;
    if (erreur) return { data: null, error: erreur };
    const vus = new Map<string, Record<string, unknown>>();
    for (const r of resultats) for (const l of (r.data ?? []) as unknown as Record<string, unknown>[]) vus.set(l.id as string, l);
    const fusion = [...vus.values()].sort((a, b) =>
      term
        ? String(a.title ?? '').localeCompare(String(b.title ?? ''), 'fr')
        : String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );
    return { data: fusion.slice(0, limit), error: null };
  };

  const { data, error } = await withNormColumn(requete, 'title_norm', 'title', term);
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
