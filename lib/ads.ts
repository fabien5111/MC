// Lecture des campagnes publicitaires (table `ads`).
//
// `ads` n'existe pas dans lib/database.types.ts tant que la migration SQL n'a
// pas été appliquée et les types régénérés (cf. CLAUDE.md, `npm run gen:types`)
// : accès non typé par cast local, comme lib/featured.ts. Tant que la table est
// absente, les requêtes échouent proprement et les emplacements restent vides —
// le site n'est jamais cassé par une migration pas encore passée.
import { createClient } from '@/lib/supabase/server';
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
