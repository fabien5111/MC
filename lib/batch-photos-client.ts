'use client';

// Photos de réalisation d'une fournée (JEP-382) — écritures, sous la session
// du membre (RLS `batch_photos_proprietaire` : ses propres fournées). Logique
// pure : `lib/batch-photos.ts`.
//
// La vignette est calculée ICI, dans le navigateur, depuis la photo fraîche
// encore en mémoire (data-URL) : aucune relecture d'un objet déjà sur Swift,
// donc aucun piège CORS (cf. CLAUDE.md « Images »).
import { createClient } from '@/lib/supabase/client';
import { isAcceptedImage, isHeic, resizeDataUrlToThumb, resizeImageToDataUrl } from '@/lib/images';
import { televerserImage } from '@/lib/storage-client';
import { PHOTO_LARGEUR, VIGNETTE_LARGEUR, normaliserLegende, type BatchPhoto } from '@/lib/batch-photos';

// Table absente des types générés : accès non typé.
function table() {
  return (createClient() as unknown as { from: (t: string) => any }).from('batch_photos');
}

const COLONNES = 'id, batch_id, batch_step_id, url, thumb_url, legende, order_index, created_at';

/** Message lisible pour un fichier que le navigateur ne sait pas lire, `null` s'il est accepté. */
export function refusFichier(file: File): string | null {
  if (isHeic(file)) return 'Format HEIC non lisible par le navigateur : choisissez une photo en JPEG.';
  if (!isAcceptedImage(file)) return 'Format d’image non pris en charge (JPEG, PNG, WebP).';
  return null;
}

/**
 * Compresse la photo, calcule sa vignette, dépose les deux sur le stockage
 * puis écrit la ligne. Lève une erreur au message lisible. Un échec après le
 * dépôt laisse un objet orphelin, repris par le balayage de réconciliation.
 */
export async function ajouterPhotoFournee(p: {
  file: File;
  userId: string;
  batchId: number;
  stepId: number | null;
  ordre: number;
}): Promise<BatchPhoto> {
  const refus = refusFichier(p.file);
  if (refus) throw new Error(refus);
  const pleine = await resizeImageToDataUrl(p.file, PHOTO_LARGEUR, 'image/jpeg', 0.85);
  const vignette = await resizeDataUrlToThumb(pleine, VIGNETTE_LARGEUR, 'image/jpeg', 0.78);
  const [url, thumb] = await Promise.all([televerserImage('realisation', pleine), televerserImage('realisation', vignette)]);
  const { data, error } = await table()
    .insert({
      batch_id: p.batchId,
      batch_step_id: p.stepId,
      user_id: p.userId,
      url,
      thumb_url: thumb,
      order_index: p.ordre,
    })
    .select(COLONNES)
    .single();
  if (error || !data) throw new Error(error?.message?.includes('batch_photos_max') ? 'Six photos au plus par fournée.' : 'La photo n’a pas pu être enregistrée.');
  return data as BatchPhoto;
}

/** Renvoie un message d'erreur, `null` si tout va bien. */
export async function modifierLegende(id: number, legende: string): Promise<string | null> {
  const { error } = await table().update({ legende: normaliserLegende(legende) }).eq('id', id);
  return error ? error.message : null;
}

/** Renvoie un message d'erreur, `null` si tout va bien. L'objet Swift est repris par la réconciliation. */
export async function supprimerPhotoFournee(id: number): Promise<string | null> {
  const { error } = await table().delete().eq('id', id);
  return error ? error.message : null;
}

/** Rattache (ou détache, `null`) une photo à une étape. Renvoie un message d'erreur, `null` si tout va bien. */
export async function rattacherEtape(id: number, stepId: number | null): Promise<string | null> {
  const { error } = await table().update({ batch_step_id: stepId }).eq('id', id);
  return error ? error.message : null;
}
