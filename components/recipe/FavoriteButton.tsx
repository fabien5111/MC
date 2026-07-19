'use client';

// Bouton « Favori » (pilule) de la fiche recette. Bascule via le client
// Supabase navigateur (porté de recette.html + toggleFavorite du db.js).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function FavoriteButton({ recipeId, initialFav }: { recipeId: string; initialFav: boolean }) {
  const router = useRouter();
  const [fav, setFav] = useState(initialFav);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/connexion');
      return;
    }
    const next = !fav;
    setFav(next);
    const { error } = next
      ? await supabase.from('favorites').insert({ user_id: user.id, recipe_id: recipeId })
      : await supabase.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
    if (error) {
      setFav(!next);
      alert('Favori non enregistré : ' + error.message);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="flex items-center gap-2 px-3 py-1 border border-secondary rounded-full text-label-md font-label-md hover:bg-secondary-container transition-colors disabled:opacity-60"
    >
      <span className="material-symbols-outlined text-[18px] text-error" style={{ fontVariationSettings: fav ? "'FILL' 1" : "'FILL' 0" }}>
        favorite
      </span>{' '}
      Favori
    </button>
  );
}
