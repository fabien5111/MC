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
