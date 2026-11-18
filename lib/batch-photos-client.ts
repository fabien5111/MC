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
import { normSearch } from '@/lib/text-search';
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
  if (error || !data) throw new Error(error?.message?.includes('batch_photos_max') ? 'Huit photos au plus par fournée.' : 'La photo n’a pas pu être enregistrée.');
  return data as BatchPhoto;
}

/**
 * Remplace l'image d'une photo après un recadrage / une rotation (éditeur
 * partagé avec les recettes) : la nouvelle photo, encore en mémoire (data-URL),
 * est déposée avec sa vignette — aucune relecture d'un objet sur Swift. L'ancien
 * objet est repris par la réconciliation. Lève une erreur au message lisible.
 */
export async function remplacerPhotoFournee(id: number, dataUrl: string): Promise<{ url: string; thumb_url: string }> {
  const vignette = await resizeDataUrlToThumb(dataUrl, VIGNETTE_LARGEUR, 'image/jpeg', 0.78);
  const [url, thumb] = await Promise.all([televerserImage('realisation', dataUrl), televerserImage('realisation', vignette)]);
  const { error } = await table().update({ url, thumb_url: thumb }).eq('id', id);
  if (error || !url || !thumb) throw new Error('La photo n’a pas pu être enregistrée.');
  return { url, thumb_url: thumb };
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

/** Écrit de nouveaux ordres (échange de photos). Renvoie un message d'erreur, `null` si tout va bien. */
export async function ordonnerPhotos(ordres: { id: number; ordre: number }[]): Promise<string | null> {
  const resultats = await Promise.all(ordres.map((o) => table().update({ order_index: o.ordre }).eq('id', o.id)));
  const echec = resultats.find((r: { error: { message: string } | null }) => r.error);
  return echec ? echec.error!.message : null;
}

// ── Photos de mes fournées d'une recette (pour illustrer une étape) ────────

export type PhotoDeFournee = {
  id: number;
  url: string;
  thumb_url: string | null;
  legende: string | null;
  // Date prévue de la fournée (aaaa-mm-jj), pour s'y retrouver.
  date: string | null;
  // Étape de la fournée de la photo, et si elle correspond à l'étape visée.
  etape: string | null;
  correspond: boolean;
};

/**
 * Photos de réalisation des fournées du membre sur UNE recette (ou un projet,
 * qui est une recette), sous la session (RLS : ses seules fournées). Une photo
 * « correspond » à l'étape visée quand l'étape de sa fournée en est la copie
 * (`source_step_id`) — ou, faute de lien (les id d'étape changent à chaque
 * enregistrement de l'éditeur), quand les titres sont les mêmes. Les
 * correspondantes viennent en premier. Lecture seule, best-effort : tables
 * absentes → liste vide.
 */
export async function photosDesFournees(recipeId: string, stepId: number | null, titreEtape: string): Promise<PhotoDeFournee[]> {
  const db = createClient() as unknown as { from: (t: string) => any };
  const { data: fournees } = await db.from('batches').select('id, planned_date').eq('recipe_id', recipeId);
  const lots = (fournees ?? []) as { id: number; planned_date: string | null }[];
  if (!lots.length) return [];
  const dates = new Map(lots.map((f) => [f.id, f.planned_date]));
  const { data: photos } = await db
    .from('batch_photos')
    .select('id, batch_id, batch_step_id, url, thumb_url, legende, order_index')
    .in('batch_id', lots.map((f) => f.id));
  const lignes = (photos ?? []) as { id: number; batch_id: number; batch_step_id: number | null; url: string; thumb_url: string | null; legende: string | null; order_index: number }[];
  if (!lignes.length) return [];
  const idsEtapes = [...new Set(lignes.map((p) => p.batch_step_id).filter((x): x is number => x != null))];
  const etapes = new Map<number, { source_step_id: number | null; title: string | null }>();
  if (idsEtapes.length) {
    const { data } = await db.from('batch_steps').select('id, source_step_id, title').in('id', idsEtapes);
    for (const e of (data ?? []) as { id: number; source_step_id: number | null; title: string | null }[]) etapes.set(e.id, e);
  }
  const cible = normSearch(titreEtape || '');
  const sortie = lignes.map((p): PhotoDeFournee => {
    const e = p.batch_step_id != null ? etapes.get(p.batch_step_id) : undefined;
    const parLien = !!e && stepId != null && e.source_step_id === stepId;
    const parTitre = !!e && !!cible && normSearch(e.title || '') === cible;
    return {
      id: p.id,
      url: p.url,
      thumb_url: p.thumb_url,
      legende: p.legende,
      date: dates.get(p.batch_id) ?? null,
      etape: e?.title ?? null,
      correspond: parLien || parTitre,
    };
  });
  return sortie.sort((a, b) => Number(b.correspond) - Number(a.correspond) || (b.date ?? '').localeCompare(a.date ?? '') || a.id - b.id);
}
