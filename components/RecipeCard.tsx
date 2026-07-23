// Carte recette (porté de recipeCardHTML du db.js). Server Component.
// Les liens recette pointent vers /recette/[id] (page portée ultérieurement).
// Cœur favori et bouton planifier sont frères du lien-carte (jamais imbriqués
// dans un <a>) pour rester du HTML valide.
import Link from 'next/link';
import { formatTime } from '@/lib/format';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { MaryseIcon } from '@/components/MaryseIcon';
import { AllergenPictos } from '@/components/recipe/AllergenPictos';
import { cardAllergenNames, type RecipeCard as RecipeCardData } from '@/lib/recipes';

export function RecipeCard({ recipe, isFav }: { recipe: RecipeCardData; isFav: boolean }) {
  const r = recipe;
  return (
    <article className="group relative bg-surface-container-lowest border border-outline-variant hover:shadow-lg transition-all duration-500 hover:-translate-y-1">
      <Link href={`/recette/${r.id}`} className="block">
        <div className="aspect-[4/3] bg-surface-container overflow-hidden relative">
          {r.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
            <img
              src={r.hero_image_url}
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
              {r.recipe_types?.name && (
                <span className="font-label-md text-label-md text-secondary uppercase tracking-widest text-xs truncate">
                  {r.recipe_types.name}
                </span>
              )}
            </div>
            <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0">
              {formatTime(r.total_time || r.prep_time)}
            </span>
          </div>
          <h3 className="font-headline-md text-xl text-on-surface mb-2 group-hover:text-primary transition-colors">
            {r.title}
          </h3>
          <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{r.description || ''}</p>
          <AllergenPictos names={cardAllergenNames(r)} className="mb-4" iconClassName="w-6 h-6" />
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
      <Link
        href={`/recette/${r.id}?planifier=1`}
        title="Planifier cette recette"
        className="absolute top-3 right-14 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
      >
        <span className="material-symbols-outlined text-[20px] text-primary">calendar_today</span>
      </Link>
    </article>
  );
}
