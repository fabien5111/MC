// Lecture des campagnes publicitaires (table `ads`).
//
// `ads` n'existe pas dans lib/database.types.ts tant que la migration SQL n'a
// pas été appliquée et les types régénérés (cf. CLAUDE.md, `npm run gen:types`)
// : accès non typé par cast local, comme lib/featured.ts. Tant que la table est
// absente, les requêtes échouent proprement et les emplacements restent vides —
// le site n'est jamais cassé par une migration pas encore passée.
import { createClient } from '@/lib/supabase/server';
import { todayStr, type Ad, type AdRow, type AdSlotKey, type AdsBySlot } from '@/lib/ads-config';

export type { Ad, AdRow, AdsBySlot } from '@/lib/ads-config';

// Constructeur de requête PostgREST réduit à ce qu'on utilise ici. Il se
// renvoie lui-même (chaînage) et s'attend comme une promesse.
type AdsQuery = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
  select: (cols: string) => AdsQuery;
  in: (col: string, values: readonly unknown[]) => AdsQuery;
  eq: (col: string, value: unknown) => AdsQuery;
  lte: (col: string, value: unknown) => AdsQuery;
  or: (filter: string) => AdsQuery;
  order: (col: string, opts?: { ascending: boolean }) => AdsQuery;
};

const PUBLIC_COLS =
  'id, slot, name, link_url, image_url, title, subtitle, cta_label, start_date, end_date, priority';
const ADMIN_COLS =
  'id, slot, name, link_url, title, subtitle, cta_label, start_date, end_date, active, priority';

// Volontairement non `async` : `AdsQuery` est lui-même « thenable » (c'est ce
// qui permet d'attendre la requête), donc renvoyé par une fonction asynchrone
// il serait déroulé par `await` et rendrait le résultat au lieu du
// constructeur de requête.
function adsTable(supabase: Awaited<ReturnType<typeof createClient>>): AdsQuery {
  return supabase.from('ads' as never) as unknown as AdsQuery;
}

/**
 * Campagnes diffusables aujourd'hui, groupées par emplacement, dans l'ordre de
 * priorité. Une seule requête pour toute la page : l'appelant demande les
 * emplacements qu'il rend, et rien d'autre — les visuels sont des data-URL
 * inlinées dans le HTML, en charger pour un emplacement non rendu alourdirait
 * la page pour rien.
 *
 * Le chevauchement de plages est autorisé (il rend la rotation possible) ;
 * l'ordre `priorité ↓, début ↓, id ↑` le départage de façon déterministe —
 * jamais d'aléatoire, qui provoquerait un désaccord d'hydratation entre le
 * rendu serveur et le navigateur.
 */
export async function getActiveAds(slots: AdSlotKey[]): Promise<AdsBySlot> {
  if (slots.length === 0) return {};
  const today = todayStr();

  const { data, error } = await adsTable(await createClient())
    .select(PUBLIC_COLS)
    .in('slot', slots)
    .eq('active', true)
    .lte('start_date', today)
    // `end_date` nul = diffusion sans date de fin.
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('priority', { ascending: false })
    .order('start_date', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    console.error('getActiveAds:', error.message);
    return {};
  }

  const bySlot: AdsBySlot = {};
  for (const ad of (data as unknown as Ad[]) ?? []) {
    (bySlot[ad.slot] ??= []).push(ad);
  }
  return bySlot;
}

/** Toutes les campagnes (administration) : passées, en cours, à venir, inactives. */
export async function getAdsAdmin(): Promise<AdRow[]> {
  const { data, error } = await adsTable(await createClient())
    .select(ADMIN_COLS)
    .order('start_date', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    console.error('getAdsAdmin:', error.message);
    return [];
  }
  return (data as unknown as AdRow[]) ?? [];
}
