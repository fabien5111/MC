// Photos de réalisation d'une fournée (JEP-382) — lectures, côté SERVEUR,
// sous la session du membre : la RLS (`batch_photos_proprietaire`, sur
// `owns_plan`) ne laisse lire que ses propres photos. Logique pure :
// `lib/batch-photos.ts`. Table absente (migration pas jouée) : rien n'est
// affiché, aucune erreur.
import { createClient } from '@/lib/supabase/server';
import { estTableAbsente, trierPhotos, type BatchPhoto, type PhotosFourneeInitiales, type Realisation } from '@/lib/batch-photos';

const COLONNES = 'id, batch_id, batch_step_id, url, thumb_url, legende, order_index, created_at';

// Galerie « Mes réalisations » : bornée, la plus récente d'abord.
export const REALISATIONS_MAX = 120;

async function db(): Promise<{ from: (t: string) => any }> {
  // Table absente des types générés : accès non typé.
  return (await createClient()) as unknown as { from: (t: string) => any };
}

/** Photos d'une fournée (page `/fournee/[id]`). */
export async function getPhotosFournee(batchId: number): Promise<PhotosFourneeInitiales> {
  const { data, error } = await (await db()).from('batch_photos').select(COLONNES).eq('batch_id', batchId);
  if (error) {
    if (!estTableAbsente(error)) console.error('getPhotosFournee:', error.message);
    return { disponible: !estTableAbsente(error), photos: [] };
  }
  return { disponible: true, photos: trierPhotos((data ?? []) as BatchPhoto[]) };
}

type LigneJointe = BatchPhoto & {
  batches: { id: number; recipe_id: string | null; recipe_title: string | null; planned_date: string | null } | null;
};

function enRealisations(lignes: LigneJointe[]): Realisation[] {
  return lignes.flatMap((l) => {
    if (!l.batches) return [];
    const { batches: b, ...photo } = l;
    return [{ ...photo, fournee: { id: b.id, recipe_id: b.recipe_id, titre: b.recipe_title || 'Fournée', date: b.planned_date } }];
  });
}

/**
 * Photos de toutes les fournées du membre, éventuellement d'une seule recette.
 * `userId` refiltre explicitement (la RLS le fait déjà) : lisible et sans
 * surprise si une policy de lecture plus large venait s'ajouter.
 */
export async function getRealisations(userId: string, recipeId?: string): Promise<Realisation[]> {
  let q = (await db())
    .from('batch_photos')
    .select(`${COLONNES}, batches!inner(id, recipe_id, recipe_title, planned_date)`)
    .eq('user_id', userId);
  if (recipeId) q = q.eq('batches.recipe_id', recipeId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(REALISATIONS_MAX);
  if (error) {
    if (!estTableAbsente(error)) console.error('getRealisations:', error.message);
    return [];
  }
  return enRealisations((data ?? []) as LigneJointe[]);
}
