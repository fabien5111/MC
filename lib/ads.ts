// Lecture des campagnes publicitaires (table `ads`).
//
// `ads` n'existe pas dans lib/database.types.ts tant que la migration SQL n'a
// pas été appliquée et les types régénérés (cf. CLAUDE.md, `npm run gen:types`)
// : accès non typé par cast local, comme lib/featured.ts. Tant que la table est
// absente, les requêtes échouent proprement et les emplacements restent vides —
// le site n'est jamais cassé par une migration pas encore passée.
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createPublicClient } from '@/lib/supabase/public';
import { REFERENCE_TAG, referenceTag } from '@/lib/data/reference';
import {
  EMPTY_AD_STATS,
  todayStr,
  type Ad,
  type AdEventType,
  type AdRow,
  type AdSlotKey,
  type AdsBySlot,
  type AdStats,
} from '@/lib/ads-config';

export type { Ad, AdRow, AdsBySlot, AdStats } from '@/lib/ads-config';

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
function adsTable(supabase: { from: (table: never) => unknown }): AdsQuery {
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
async function fetchActiveAds(
  supabase: { from: (table: never) => unknown },
  slots: AdSlotKey[],
  today: string,
): Promise<AdsBySlot> {
  const { data, error } = await adsTable(supabase)
    .select(PUBLIC_COLS)
    .in('slot', slots)
    .eq('active', true)
    .lte('start_date', today)
    // `end_date` nul = diffusion sans date de fin.
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('priority', { ascending: false })
    .order('start_date', { ascending: false })
    .order('id', { ascending: true });

  // Lève plutôt que de renvoyer `{}` : ce qui lève n'est pas mis en cache par
  // `unstable_cache`, alors qu'un `{}` d'erreur y resterait figé une heure —
  // c'est-à-dire une heure sans aucune campagne sur tout le site. L'appelant
  // rattrape et retombe sur le comportement d'avant.
  if (error) throw new Error(error.message);

  const bySlot: AdsBySlot = {};
  for (const ad of (data as unknown as Ad[]) ?? []) {
    (bySlot[ad.slot] ??= []).push(ad);
  }
  return bySlot;
}

// Campagnes du jour, mises en cache — 21 appels par parcours au relevé du
// 25/08/2026, deuxième poste derrière le profil. Les campagnes changent
// rarement : `ads` se comporte comme un référentiel, et relève du même
// traitement (cf. lib/data/reference.ts), à trois différences près.
//
// 1. **La date est dans la clé de cache.** La requête filtre sur
//    `start_date`/`end_date` : sans ça, une campagne programmée pour demain
//    n'apparaîtrait qu'à l'expiration du cache, et une campagne terminée
//    continuerait de s'afficher. Avec `today` dans la clé, le changement de
//    jour crée mécaniquement une nouvelle entrée.
// 2. **Une entrée par jeu d'emplacements**, et non une entrée globale : les
//    visuels sont des data-URL, et une entrée de cache trop volumineuse n'est
//    tout simplement pas mémorisée par Next. Trois jeux existent dans le site
//    (accueil, recherche, fiche recette), donc trois entrées par jour.
// 3. **`{}` est un résultat légitime** (aucune campagne en cours), à la
//    différence d'un référentiel vide — d'où l'absence de garde sur le vide.
//
// Lecture au rôle `anon` : les encarts sont affichés aux visiteurs déconnectés
// sur l'accueil, la table est donc lisible publiquement — même démonstration
// que pour les référentiels.
export async function getActiveAds(slots: AdSlotKey[]): Promise<AdsBySlot> {
  if (slots.length === 0) return {};
  const today = todayStr();
  const cle = [...slots].sort().join(',');

  const lireEnCache = unstable_cache(
    () => fetchActiveAds(createPublicClient(), slots, today),
    ['ads', today, cle],
    { revalidate: 3600, tags: [REFERENCE_TAG, referenceTag('ads')] },
  );

  try {
    return await lireEnCache();
  } catch {
    // Repli non mis en cache, avec la session de l'appelant : comportement
    // d'avant ce cache. Couvre aussi le cas où la table `ads` n'existe pas
    // encore (cf. en-tête de fichier) — les emplacements restent vides, le
    // site n'est jamais cassé.
    try {
      return await fetchActiveAds(await createClient(), slots, today);
    } catch (err) {
      console.error('getActiveAds:', err);
      return {};
    }
  }
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

/** Une campagne (administration — en-tête de la page de statistiques). */
export async function getAdAdmin(id: number): Promise<AdRow | null> {
  const supabase = await createClient();
  const table = supabase.from('ads' as never) as unknown as {
    select: (cols: string) => {
      eq: (col: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
      };
    };
  };
  const { data, error } = await table.select(ADMIN_COLS).eq('id', id).maybeSingle();
  if (error) {
    console.error('getAdAdmin:', error.message);
    return null;
  }
  return (data as AdRow | null) ?? null;
}

type AdEventRow = { event_type: AdEventType; user_id: string | null };

// Constructeur de requête réduit à ce qu'utilise getAdStats.
type AdEventsQuery = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
  select: (cols: string) => AdEventsQuery;
  eq: (col: string, value: unknown) => AdEventsQuery;
  gte: (col: string, value: unknown) => AdEventsQuery;
  lt: (col: string, value: unknown) => AdEventsQuery;
};

function adEventsTable(supabase: Awaited<ReturnType<typeof createClient>>): AdEventsQuery {
  return supabase.from('ad_events' as never) as unknown as AdEventsQuery;
}

/**
 * Affichages/clics d'une campagne sur une période (dates incluses), répartis
 * connecté / non connecté. Agrégation faite ici plutôt qu'en SQL : suffisant
 * tant que le volume par campagne reste modeste — à basculer vers une
 * fonction SQL d'agrégat si une campagne dépasse plusieurs dizaines de
 * milliers d'événements sur la période demandée.
 */
export async function getAdStats(adId: number, from: string, to: string): Promise<AdStats> {
  const supabase = await createClient();
  // `to` est une date (jour inclus) : borne exclusive au lendemain minuit UTC
  // pour couvrir toute la journée de fin.
  const toExclusive = new Date(`${to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const { data, error } = await adEventsTable(supabase)
    .select('event_type, user_id')
    .eq('ad_id', adId)
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lt('created_at', toExclusive.toISOString());

  if (error) {
    console.error('getAdStats:', error.message);
    return EMPTY_AD_STATS;
  }

  const stats = { ...EMPTY_AD_STATS };
  for (const row of (data as unknown as AdEventRow[]) ?? []) {
    const loggedIn = row.user_id != null;
    if (row.event_type === 'impression') {
      stats.impressions++;
      if (loggedIn) stats.impressionsLoggedIn++;
      else stats.impressionsAnonymous++;
    } else {
      stats.clicks++;
      if (loggedIn) stats.clicksLoggedIn++;
      else stats.clicksAnonymous++;
    }
  }
  return stats;
}
