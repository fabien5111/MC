// Carte pâtissier de la recherche avancée — pendant de RecipeCard pour les
// résultats côté auteur. Même langage visuel que RecipeCardLayout (fond,
// bordure, ombre au survol), mais un contenu propre à un profil : avatar
// circulaire, nom, bio courte, nombre de recettes publiées et note d'auteur.
import Link from 'next/link';
import type { AuthorResult } from '@/lib/search';
import { StarRating } from '@/components/StarRating';

export function AuthorCard({ author }: { author: AuthorResult }) {
  // Le nom d'utilisateur choisi sert de lien s'il existe (forme partageable),
  // sinon l'identifiant du compte — même repli que getPublicProfile.
  const handle = author.username || author.id;
  const name = author.full_name || author.username || 'Pâtissier';

  return (
    <Link
      href={`/u/${handle}`}
      className="flex flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center transition-all duration-500 hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-pill bg-surface-container">
        {author.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="material-symbols-outlined flex h-full w-full items-center justify-center text-3xl text-on-surface-variant">
            person
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-headline-md text-[15px] text-on-surface truncate">{name}</p>
        {author.bio && <p className="mt-1 line-clamp-2 text-[12px] text-on-surface-variant">{author.bio}</p>}
      </div>
      <div className="flex items-center gap-3 text-[12px] text-secondary">
        <span>
          {author.recipe_count} recette{author.recipe_count > 1 ? 's' : ''}
        </span>
        {author.rating_avg != null && (
          <span>(<StarRating value={author.rating_avg} size={12} starsOnly />)</span>
        )}
      </div>
    </Link>
  );
}
