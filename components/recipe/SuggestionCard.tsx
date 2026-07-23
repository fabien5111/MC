// Carte de suggestion en sidebar (porté de .sugg-card / recette.html + JS
// loadSuggestions). Server Component — mise en page éditoriale différente de
// RecipeCard (utilisée pour les grilles), pas de cadre ni de padding.
import Link from 'next/link';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { MaryseIcon } from '@/components/MaryseIcon';
import { AllergenPictos } from '@/components/recipe/AllergenPictos';
import { cardAllergenNames, type RecipeCard as RecipeCardData } from '@/lib/recipes';

export function SuggestionCard({ recipe, isFav }: { recipe: RecipeCardData; isFav: boolean }) {
  const r = recipe;
  const level = (r.difficulties?.name || r.recipe_types?.name || 'Recette').toUpperCase();
  const diffLevel = r.difficulties?.level || 0;
  return (
    <div className="relative group">
      <Link href={`/recette/${r.id}`} className="cursor-pointer block">
        <div className="aspect-[4/3] mb-4 overflow-hidden border border-outline-variant relative">
          {r.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
            <img src={r.hero_image_url} alt={r.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-on-surface-variant bg-surface-container">
              <span className="material-symbols-outlined text-4xl">cake</span>
            </div>
          )}
        </div>
        <span className="flex items-center gap-2">
          {diffLevel > 0 && (
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <MaryseIcon
                  key={i}
                  size={14}
                  className={i <= diffLevel ? 'text-primary' : 'text-outline-variant'}
                />
              ))}
            </span>
          )}
          <span className="font-label-md text-[12px] text-secondary">{level}</span>
        </span>
        <AllergenPictos names={cardAllergenNames(r)} className="mt-1.5" iconClassName="w-5 h-5" />
        <h4 className="font-headline-md text-headline-md text-primary mt-1 group-hover:text-secondary transition-colors">
          {r.title}
        </h4>
        <p className="text-sm text-on-surface-variant line-clamp-2 mt-1">{r.description || ''}</p>
      </Link>
      <FavoriteHeart recipeId={r.id} initialFav={isFav} />
      <Link
        href={`/recette/${r.id}?planifier=1`}
        title="Planifier cette recette"
        className="absolute top-3 right-14 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
      >
        <span className="material-symbols-outlined text-[20px] text-primary">calendar_today</span>
      </Link>
    </div>
  );
}
