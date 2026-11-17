'use client';

// Photos d'une étape, éditables directement dans la vue des étapes du projet
// (JEP-403) — sans passer par « Modifier cette préparation ». Mêmes
// emplacements que la fenêtre d'édition (`StepEditorCard` : 8 photos, comme `/creer`,
// carrées, 800 px), même dépôt sur le stockage objet (`televerserImage`).
//
// Brouillon local, enregistré par un bouton : un dépôt passe par plusieurs
// changements successifs (photo, original, recadrage), qu'on ne veut pas
// écrire un par un. L'enregistrement réécrit toutes les photos de l'étape
// (`step_photos` n'a pas d'identifiant exposé dans la vue) : suppression puis
// insertion, sous la session du membre (RLS), par le `mutate` du parent.
import { useState } from 'react';
import { useDialog } from '@/components/Dialog';
import { resizeFilesToDataUrls } from '@/lib/images';
import { ImageSlot } from '@/components/ImageSlot';
import { createClient } from '@/lib/supabase/client';
import { televerserImage } from '@/lib/storage-client';

export const PHOTOS_ETAPE_MAX = 8;

type Photo = { url: string; original_url: string | null; ai_retouched: boolean };

export function PhotosEtapeProjet({
  stepId,
  photos,
  mutate,
}: {
  stepId: number;
  photos: Photo[];
  mutate: (fn: () => PromiseLike<{ error: { message: string } | null }>, opts?: { errorLabel?: string }) => Promise<boolean>;
}) {
  const dialog = useDialog();
  const [brouillon, setBrouillon] = useState<Photo[]>(photos);
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(photos);
  const maj = (k: number, patch: Partial<Photo>) =>
    setBrouillon((prev) => prev.map((x, m) => (m === k ? { ...x, ...patch } : x)));

  // Plusieurs photos reçues d'un coup (sélection multiple, glisser-déposer,
  // stockage en ligne) : compressées puis ajoutées aux emplacements libres, le
  // surplus étant signalé plutôt que perdu en silence — comme dans `/creer`.
  async function ajouterPlusieurs(files: File[]) {
    const { urls, rejected } = await resizeFilesToDataUrls(files, 800, 'image/jpeg');
    if (rejected) await dialog.alert(`${rejected} fichier${rejected > 1 ? 's' : ''} ignoré${rejected > 1 ? 's' : ''} (format non supporté).`);
    if (!urls.length) return;
    const libres = Math.max(0, PHOTOS_ETAPE_MAX - brouillon.length);
    const retenues = urls.slice(0, libres);
    setBrouillon((prev) => [...prev, ...retenues.map((u) => ({ url: u, original_url: u, ai_retouched: false }))].slice(0, PHOTOS_ETAPE_MAX));
    const surplus = urls.length - retenues.length;
    if (surplus > 0) await dialog.alert(`${surplus} photo${surplus > 1 ? 's' : ''} non ajoutée${surplus > 1 ? 's' : ''} : plus assez d'emplacements libres sur cette étape.`);
  }

  async function ecrire(suivantes: Photo[]) {
    await mutate(
      async () => {
        const supabase = createClient();
        let pretes: Photo[];
        try {
          // Une data-URL fraîche est déposée ; une URL déjà déposée revient telle quelle.
          pretes = await Promise.all(
            suivantes.map(async (p) => ({
              ...p,
              url: await televerserImage('recette', p.url),
              original_url: await televerserImage('recette', p.original_url),
            })),
          );
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        const { error } = await supabase.from('step_photos').delete().eq('step_id', stepId);
        if (error) return { error };
        if (!pretes.length) return { error: null };
        return supabase.from('step_photos').insert(
          pretes.map((p, i) => ({
            step_id: stepId,
            url: p.url,
            original_url: p.original_url,
            order_index: i,
            ai_retouched: p.ai_retouched,
          })) as never,
        );
      },
      { errorLabel: 'Photos de l’étape' },
    );
  }

  return (
    <div className="no-print">
      <p className="mb-2 font-label-md text-label-md text-primary">Photos de l’étape</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {brouillon.map((p, k) => (
          <div key={k} className="relative aspect-square overflow-hidden border border-dashed border-outline-variant">
            <ImageSlot
              src={p.url}
              originalSrc={p.original_url}
              aiRetouched={p.ai_retouched}
              onChange={(url) => maj(k, { url, ai_retouched: false })}
              onOriginalChange={(url) => maj(k, { original_url: url })}
              onClear={() => setBrouillon((prev) => prev.filter((_, m) => m !== k))}
              shape="rect"
              maxWidth={800}
              aspectRatio={1}
              className="h-full w-full"
            />
          </div>
        ))}
        {brouillon.length < PHOTOS_ETAPE_MAX && (
          <div key={`vide-${brouillon.length}`} className="relative aspect-square overflow-hidden border border-dashed border-outline-variant">
            <ImageSlot
              src={null}
              onChange={(url) => setBrouillon((prev) => [...prev, { url, original_url: null, ai_retouched: false }])}
              onFilesAdded={(files) => void ajouterPlusieurs(files)}
              shape="rect"
              maxWidth={800}
              aspectRatio={1}
              placeholder={`Ajouter une photo (${brouillon.length + 1}/${PHOTOS_ETAPE_MAX})`}
              className="h-full w-full"
            />
          </div>
        )}
      </div>
      {modifie && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void ecrire(brouillon)}
            className="rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary"
          >
            Enregistrer les photos
          </button>
          <button
            type="button"
            onClick={() => setBrouillon(photos)}
            className="rounded-pill border border-outline-variant px-5 py-2.5 font-label-md text-[13px] font-semibold text-primary"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
