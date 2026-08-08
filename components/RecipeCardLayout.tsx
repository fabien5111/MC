// Mise en page pure de la carte recette (porté de recipeCardHTML du db.js).
// Pas d'accès Supabase — le bloc allergènes est injecté via `allergens`
// (résolu différemment selon le contexte : Server Component pour le rendu
// initial, données déjà résolues côté client pour la pagination).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatTime } from '@/lib/format';
import { effectiveTimes, cardHeroSrc } from '@/lib/recipe-view';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { MaryseIcon } from '@/components/MaryseIcon';
import { PlanBadgeIcon } from '@/components/recipe/PlanBadgeIcon';
import type { RecipeCard as RecipeCardData } from '@/lib/recipes';

export function RecipeCardLayout({
  recipe,
  isFav,
  isOwner = false,
  allergens,
}: {
  recipe: RecipeCardData;
  isFav: boolean;
  // Affiche le picto Éditer entre Favori et Planifier — uniquement pour
  // l'auteur de la recette. Optionnel : les écrans qui ne le renseignent pas
  // (profil, suggestions) gardent le comportement d'avant son introduction.
  isOwner?: boolean;
  allergens: ReactNode;
}) {
  const r = recipe;
  const times = effectiveTimes(r);
  const heroSrc = cardHeroSrc(r);
  // Planifier se décale d'un cran quand Éditer s'intercale entre Favori et
  // lui — même incrément que celui qui sépare déjà Favori (right-3) de
  // Planifier (right-14).
  const planPos = isOwner ? 'right-[6.25rem]' : 'right-14';
  return (
    <article className="group relative bg-surface-container-lowest border border-outline-variant hover:shadow-lg transition-all duration-500 hover:-translate-y-1">
      <Link href={`/recette/${r.id}`} className="block">
        <div className="aspect-[4/3] bg-surface-container overflow-hidden relative">
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- route image / cross-origin
            <img
              src={heroSrc}
              alt={r.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl">cake</span>
            </div>
          )}
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {(r.difficulties?.level || 0) > 0 && (
                <span className="flex items-center gap-0.5 shrink-0">
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
                <span className="font-label-md text-label-md text-on-surface shrink-0">{r.difficulties.name}</span>
              )}
              {r.recipe_types?.name && (
                <span className="font-label-md text-label-md text-secondary uppercase tracking-widest text-xs truncate">
                  {r.recipe_types.name}
                </span>
              )}
            </div>
            <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0">
              {formatTime(times.total || times.prep)}
            </span>
          </div>
          <h3 className="font-headline-md text-xl text-on-surface mb-2 group-hover:text-primary transition-colors">
            {r.title}
          </h3>
          <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{r.description || ''}</p>
          {allergens}
          <div className="flex items-center justify-between">
            <span className="text-xs text-secondary">{r.profiles?.full_name || ''}</span>
            <span className="text-xs text-secondary">
              {r.rating_avg ? `${Number(r.rating_avg).toFixed(1)} ★` : ''}
            </span>
          </div>
        </div>
      </Link>

      {/* Contrôles superposés — frères du lien, positionnés sur l'image. */}
      <FavoriteHeart recipeId={r.id} initialFav={isFav} />
      {isOwner && (
        <Link
          href={`/creer?id=${r.id}`}
          title="Éditer cette recette"
          prefetch={false}
          className="absolute top-3 right-14 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
        </Link>
      )}
      <Link
        href={`/recette/${r.id}?planifier=1`}
        title="Planifier cette recette"
        prefetch={false}
        className={`absolute top-3 ${planPos} z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform`}
      >
        <PlanBadgeIcon />
      </Link>
    </article>
  );
}
