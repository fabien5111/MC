'use client';

// Contenu de « Mon carnet » — tout ce qui est une recette à moi.
//
// Reprend tel quel le contenu des onglets « Mon Carnet de Recettes » et
// « Mes Favoris » de l'ancien `/profil`, désormais empilés sur une seule page
// plutôt que rangés derrière des onglets. Remplacer six onglets par deux
// n'aurait rien réglé : l'écran cible est **un seul plan de travail filtré**
// (pastilles de provenance : Tout, Mes créations, Importées, Favoris, Mes
// abonnements ; puis une ligne de statut qui disparaît sur les recettes des
// autres). Cette étape déplace le contenu dans sa maison définitive sans le
// redessiner — les filtres viennent au lot suivant, avec l'état porté par
// l'URL comme sur `/recherche`, et non par un filtrage local de la grille.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatTime } from '@/lib/format';
import { effectiveTimes } from '@/lib/recipe-view';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { RecipeCardClient } from '@/components/RecipeCardClient';
import { MaryseIcon } from '@/components/MaryseIcon';
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { PlanBadgeIcon } from '@/components/recipe/PlanBadgeIcon';
import type { FavoriteRow } from '@/lib/profile';
import type { UserRecipeCard } from '@/lib/recipes';

export type UserRecipe = UserRecipeCard;

const STATUS: Record<string, { label: string; badge: string }> = {
  published: { label: 'Publiée', badge: 'bg-green-700' },
  pending: { label: 'En attente', badge: 'bg-secondary/90' },
  draft: { label: 'Brouillon', badge: 'bg-secondary/90' },
  rejected: { label: 'Publication refusée', badge: 'bg-error/90' },
};

export function CarnetContent({
  recipes,
  favorites,
  favIds,
  importsEnAttente,
}: {
  recipes: UserRecipe[];
  favorites: FavoriteRow[];
  favIds: string[];
  // Imports pas encore relus : ils ne sont pas des recettes (ils vivent dans
  // `imports`, pas dans `recipes`) et ne peuvent donc pas figurer dans cette
  // grille. Le carnet les signale par un compteur et renvoie vers le tunnel
  // d'import, qui reste leur maison jusqu'à la relecture.
  importsEnAttente: number;
}) {
  const { mutate, busy } = useMutation();
  const router = useRouter();
  // Le cache client du routeur peut resservir un rendu obsolète du carnet
  // (ex. retour après avoir créé une recette ailleurs) alors même que la page
  // est en `force-dynamic` côté serveur — ce dernier ne joue que sur le rendu
  // initial d'une requête, pas sur ce cache.
  useEffect(() => {
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suppression optimiste locale : le spinner reste affiché jusqu'à ce que la
  // recette disparaisse effectivement de la liste, sans attendre le
  // router.refresh() (resynchronisation serveur en arrière-plan).
  const [recipeList, setRecipeList] = useState(recipes);
  useEffect(() => setRecipeList(recipes), [recipes]);

  async function delRecipe(id: string, title: string) {
    const ok = await mutate(() => createClient().from('recipes').delete().eq('id', id), {
      confirm: `Supprimer « ${title} » ?\nCette action est définitive.`,
    });
    if (ok) setRecipeList((prev) => prev.filter((r) => r.id !== id));
  }

  const favoris = favorites.filter((f) => f.recipes);

  return (
    <>
      <LoadingOverlay visible={busy} label="Traitement en cours…" />

      {importsEnAttente > 0 && (
        <Link
          href="/importer"
          prefetch={false}
          className="mt-8 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 transition-colors hover:border-primary"
        >
          <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
            inbox
          </span>
          <span className="font-body-md text-sm text-on-surface">
            {importsEnAttente} import{importsEnAttente > 1 ? 's' : ''} en attente de relecture — un import n&apos;entre
            au carnet qu&apos;une fois relu.
          </span>
          <span className="material-symbols-outlined ml-auto text-[20px] text-on-surface-variant" aria-hidden>
            chevron_right
          </span>
        </Link>
      )}

      <section className="mt-12">
        <h2 className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
          Mes recettes
        </h2>
        {recipeList.length > 0 ? (
          <div className="grid grid-cols-1 gap-8 py-6 md:grid-cols-2 lg:grid-cols-3">
            {recipeList.map((r) => {
              const st = STATUS[r.status] || STATUS.draft;
              const times = effectiveTimes(r);
              return (
                <div
                  key={r.id}
                  className="group relative border border-outline-variant bg-surface-container-lowest transition-all duration-500 hover:-translate-y-1 hover:shadow-lg"
                >
                  <Link href={`/recette/${r.id}`} className="block">
                    <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
                      {r.hero_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                        <img
                          src={r.hero_image_url}
                          alt={r.title}
                          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-5xl">cake</span>
                        </div>
                      )}
                      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                        <span className={`${st.badge} rounded px-2 py-1 font-label-md text-[10px] text-white`}>
                          {st.label}
                        </span>
                        <span className="rounded bg-white/90 px-2 py-1 font-label-md text-[10px] text-primary">
                          {r.is_public === false ? 'Privée' : 'Publique'}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <Link
                    href={`/recette/${r.id}?planifier=1`}
                    title="Planifier cette recette"
                    prefetch={false}
                    className="absolute right-[9rem] top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
                  >
                    <PlanBadgeIcon />
                  </Link>
                  <Link
                    href={`/creer?id=${r.id}`}
                    title="Modifier"
                    prefetch={false}
                    className="absolute right-[6.25rem] top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
                  >
                    <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
                  </Link>
                  <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} className="top-3 right-14" />
                  <button
                    type="button"
                    title="Supprimer"
                    onClick={() => delRecipe(r.id, r.title)}
                    className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
                  >
                    <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                  </button>
                  <div className="p-6">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {(r.difficulties?.level || 0) > 0 && (
                          <span className="flex shrink-0 items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <MaryseIcon
                                key={i}
                                size={14}
                                className={i <= (r.difficulties?.level || 0) ? 'text-primary' : 'text-outline-variant'}
                              />
                            ))}
                          </span>
                        )}
                        {r.difficulties?.name && (
                          <span className="shrink-0 font-label-md text-label-md text-on-surface">
                            {r.difficulties.name}
                          </span>
                        )}
                        {r.recipe_types?.name && (
                          <span className="truncate font-label-md text-xs uppercase tracking-widest text-secondary">
                            {r.recipe_types.name}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-variant">
                        {formatTime(times.total || times.prep)}
                      </span>
                    </div>
                    <Link href={`/recette/${r.id}`}>
                      <h3 className="mb-2 font-headline-md text-xl text-on-surface transition-colors group-hover:text-primary">
                        {r.title}
                      </h3>
                    </Link>
                    {r.description && (
                      <p className="mb-4 line-clamp-2 text-sm text-on-surface-variant">{r.description}</p>
                    )}
                    <AllergenPictosView items={r.allergenItems} className="mb-4" iconClassName="w-6 h-6" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-secondary">
                        {formatDate(r.created_at)}
                        {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined mb-4 block text-[48px] text-on-surface-variant">cake</span>
            <h3 className="font-headline-md text-primary">Votre carnet est vide</h3>
            <p className="mx-auto mt-2 max-w-sm font-body-md text-on-surface-variant">
              Créez votre première recette ou importez-en une depuis un texte, une photo ou un PDF.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8 border-t border-outline-variant pt-10">
        <h2 className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
          Mes favoris
        </h2>
        {favoris.length > 0 ? (
          <div className="grid grid-cols-1 gap-8 py-6 md:grid-cols-2 lg:grid-cols-3">
            {favoris.map((f) => (
              <RecipeCardClient key={f.recipes!.id} recipe={f.recipes!} isFav={true} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined mb-4 block text-[48px] text-on-surface-variant">
              star_outline
            </span>
            <h3 className="font-headline-md text-primary">Vos coups de cœur</h3>
            <p className="mx-auto mt-2 max-w-sm font-body-md text-on-surface-variant">
              Retrouvez ici toutes les recettes que vous avez marquées comme favorites.
            </p>
            <Link
              href="/recherche"
              className="mt-6 inline-block rounded-pill border border-primary px-6 py-2 font-label-md text-label-md text-primary transition-all hover:bg-primary hover:text-white"
            >
              Explorer les recettes
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
