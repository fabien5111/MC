'use client';

// Bouton « Favori » (pilule) de la fiche recette. Bascule via le client
// Supabase navigateur (porté de recette.html + toggleFavorite du db.js).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { connexionHref } from '@/lib/nav';
import { intentPath, useResumeIntent } from '@/lib/use-resumable-intent';

export function FavoriteButton({ recipeId, initialFav }: { recipeId: string; initialFav: boolean }) {
  const router = useRouter();
  const { busy, mutate } = useMutation();
  const [fav, setFav] = useState(initialFav);

  async function toggle() {
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
          // Retour au favori qu'on voulait poser, ET rejeu du geste au
          // retour (`intentPath`) — cf. use-resumable-intent.ts.
          router.push(connexionHref(intentPath('favori', recipeId)));
          return null;
        }
        return next
          ? // `upsert` + `ignoreDuplicates` plutôt qu'un `insert` nu : cette
            // même recette peut être servie par DEUX `FavoriteHeart`/`FavoriteButton`
            // distincts sur une même page (ex. « Recette de la semaine » qui
            // retombe sur `recipes[0]`, déjà présente dans « Dernières
            // créations ») — le rejeu du favori au retour de connexion
            // (`useResumeIntent`) les déclenche alors tous les deux en même
            // temps. Un second `insert()` sur la même clé (`user_id`,
            // `recipe_id`) levait une violation de contrainte unique,
            // affichée comme une erreur alors que le favori était bel et
            // bien posé.
            supabase
              .from('favorites')
              .upsert({ user_id: user.id, recipe_id: recipeId }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true })
          : supabase.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
      },
      { errorLabel: 'Favori non enregistré' },
    );
    if (!ok) setFav(!next); // rollback de la mise à jour optimiste
  }

  useResumeIntent('favori', recipeId, fav, toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className="flex items-center justify-center w-7 h-7 border border-secondary rounded-full hover:bg-secondary-container transition-colors disabled:opacity-60"
    >
      <span className="material-symbols-outlined text-[16px] text-error" style={{ fontVariationSettings: fav ? "'FILL' 1" : "'FILL' 0" }}>
        favorite
      </span>
    </button>
  );
}
