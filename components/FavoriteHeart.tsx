'use client';

// Cœur favori (porté de favHeartHTML/favHeartClick + toggleFavorite du db.js).
// Bascule via le client Supabase navigateur ; renvoie vers /connexion si
// l'utilisateur n'est pas connecté.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { connexionHref } from '@/lib/nav';
import { favoriteIntentPath, useResumeFavoriteIntent } from '@/lib/use-favorite-intent';

export function FavoriteHeart({
  recipeId,
  initialFav,
  className = 'top-3 right-3',
}: {
  recipeId: string;
  initialFav: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { busy, mutate } = useMutation();
  const [fav, setFav] = useState(initialFav);

  // Séparé du gestionnaire de clic : `useResumeFavoriteIntent` rejoue ce
  // geste au montage, sans événement souris à annuler (il n'y en a pas).
  async function apply() {
    if (busy) return;
    const next = !fav;
    setFav(next); // optimiste
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          // Ce cœur vit sur des grilles (`/carnet`, `/recherche`, l'accueil) :
          // `favoriteIntentPath` restitue la portée/le tri/la recherche en
          // cours ET rejoue l'ajout au retour — cf. use-favorite-intent.ts.
          router.push(connexionHref(favoriteIntentPath(recipeId)));
          return null;
        }
        return next
          ? supabase.from('favorites').insert({ user_id: user.id, recipe_id: recipeId })
          : supabase.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
      },
      { errorLabel: next ? 'Favori non enregistré' : 'Favori non retiré' },
    );
    if (!ok) setFav(!next); // rollback de la mise à jour optimiste
  }

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void apply();
  }

  // Un par carte : seul le cœur dont `recipeId` correspond au marqueur réagit.
  useResumeFavoriteIntent(recipeId, fav, apply);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={`absolute ${className} z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-60`}
    >
      <span
        className={`material-symbols-outlined text-[20px] ${fav ? 'text-error' : 'text-on-surface-variant'}`}
        style={fav ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        favorite
      </span>
    </button>
  );
}
