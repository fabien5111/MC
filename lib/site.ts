// Réglages du site (clé/valeur) — porté de db.js (getSiteSettings).
// Ex. bannières d'accueil par appareil : banner_home_web / _tablette / _mobile.
import { createClient } from '@/lib/supabase/server';

export async function getSiteSettings(keys: string[]): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('site_settings').select('key, value').in('key', keys);
  if (error) {
    console.error('getSiteSettings:', error.message);
    return {};
  }
  return Object.fromEntries(
    (data ?? []).map((s) => [s.key, typeof s.value === 'string' ? s.value : String(s.value ?? '')]),
  );
}

// Photo par défaut des cartes recette (RecipeCardLayout, SuggestionCard,
// CarnetContent, accueil) quand l'auteur n'a fourni aucune photo.
//
// Servie par le cache de `lib/data/reference.ts` : elle était lue sur cinq
// pages (accueil, recherche, carnet, profil public, fiche recette), ce qui
// pesait la moitié des 2 902 appels `site_settings` du relevé. `getSiteSettings`
// ci-dessus reste non mis en cache : seul le back-office l'appelle encore, un
// écran d'administration ne pèse rien et n'a pas à voir une valeur périmée.
export { getRecipeDefaultPhoto, getPublicSiteSettings } from '@/lib/data/reference';
