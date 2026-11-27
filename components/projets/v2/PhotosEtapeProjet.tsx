'use client';

// Photos d'une étape, éditables directement dans la vue des étapes du projet
// (JEP-403) — sans passer par « Modifier cette préparation ». Mêmes
// emplacements que la fenêtre d'édition (`StepEditorCard` : 8 photos, comme `/creer`,
// carrées, 800 px), même dépôt sur le stockage objet (`televerserImage`).
//
// Brouillon local, enregistré AUTOMATIQUEMENT (registre `sections.ts`, JEP-403) :
// un dépôt passe par plusieurs changements successifs (photo, original,
// recadrage), que le délai de l'enregistrement automatique regroupe en une
// seule écriture. Elle réécrit toutes les photos de l'étape (`step_photos` n'a
// pas d'identifiant exposé dans la vue) : suppression puis insertion, sous la
// session du membre (RLS), par le `mutate` du parent. Les photos déposées
// remplacent ensuite les data-URL du brouillon : rien n'est redéposé deux fois.
import { useRef, useState } from 'react';
import { useDialog } from '@/components/Dialog';
import { useRegisterSection, type OptionsSauvegarde, type SectionRegistry } from '@/components/projets/v2/sections';
import { resizeFilesToDataUrls } from '@/lib/images';
import { ImageSlot } from '@/components/ImageSlot';
import { BoutonsOrdrePhoto } from '@/components/BoutonsOrdrePhoto';
import { destinationInsertion, moveAt, swapAt } from '@/lib/photo-reorder';
import { usePhotoDragReorder } from '@/lib/use-photo-drag-reorder';
import { SourceFourneesProvider } from '@/components/recipe/PhotosDeMesFournees';
import { createClient } from '@/lib/supabase/client';
import { televerserImage } from '@/lib/storage-client';

export const PHOTOS_ETAPE_MAX = 8;

type Photo = { url: string; original_url: string | null; ai_retouched: boolean };

export function PhotosEtapeProjet({
  stepId,
  recipeId,
  titreEtape,
  photos,
  mutate,
  sections,
}: {
  stepId: number;
  // Projet / recette et titre de l'étape : pour piocher dans les photos de MES fournées.
  recipeId?: string;
  titreEtape?: string;
  photos: Photo[];
  mutate: (
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    opts?: { errorLabel?: string; silent?: boolean },
  ) => Promise<boolean>;
  sections?: SectionRegistry;
}) {
  const dialog = useDialog();
  const [brouillon, setBrouillon] = useState<Photo[]>(photos);
  const brouillonRef = useRef(brouillon);
  brouillonRef.current = brouillon;
  const signature = JSON.stringify(brouillon);
  const [base, setBase] = useState(() => JSON.stringify(photos));
  useRegisterSection(sections, `photos-${stepId}`, {
    label: 'Photos d’étape',
    dirty: signature !== base,
    signature,
    save: ecrire,
  });
  // Réordonner : glisser-déposer (souris) ou flèches (doigt) — échange de deux
  // photos du brouillon, enregistré comme le reste par l'écriture automatique.
  const reorder = usePhotoDragReorder(
    (de, vers) => setBrouillon((prev) => swapAt(prev, Number(de), Number(vers))),
    // Insertion dans la gouttière (JEP-434).
    (de, vers, zone) => setBrouillon((prev) => moveAt(prev, Number(de), destinationInsertion(Number(de), Number(vers), zone))),
  );
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

  async function ecrire(options?: OptionsSauvegarde): Promise<boolean> {
    const suivantes = brouillon;
    const sigAppel = signature;
    let deposees: Photo[] | null = null;
    const ok = await mutate(
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
        deposees = pretes;
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
      { errorLabel: 'Photos de l’étape', silent: options?.silencieux },
    );
    if (!ok) return false;
    // Les photos déposées (adresses du stockage) remplacent les data-URL, si le
    // brouillon n'a pas bougé pendant l'écriture.
    const pretes = deposees as Photo[] | null;
    if (pretes && JSON.stringify(brouillonRef.current) === sigAppel) {
      setBrouillon(pretes);
      setBase(JSON.stringify(pretes));
    } else {
      setBase(sigAppel);
    }
    return true;
  }

  return (
    <SourceFourneesProvider
      valeur={{
        recipeId,
        stepId,
        titreEtape: titreEtape ?? '',
        places: PHOTOS_ETAPE_MAX - brouillon.length,
        onChoisir: (urls) =>
          setBrouillon((prev) =>
            [...prev, ...urls.map((u) => ({ url: u, original_url: u, ai_retouched: false }))].slice(0, PHOTOS_ETAPE_MAX),
          ),
      }}
    >
    <div className="no-print">
      <p className="mb-2 font-label-md text-label-md text-primary">Photos de l’étape</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {brouillon.map((p, k) => (
          <div
            key={k}
            className={`relative aspect-square overflow-hidden border border-dashed cursor-grab active:cursor-grabbing ${reorder.classeDepot(String(k))} ${
              reorder.overKey === String(k) ? 'border-primary ring-2 ring-primary' : 'border-outline-variant'
            }`}
            title="Glisser pour réordonner"
            {...reorder.dropProps(String(k))}
            {...reorder.dragProps(String(k))}
          >
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
            <BoutonsOrdrePhoto
              index={k}
              total={brouillon.length}
              onDeplacer={(delta) => setBrouillon((prev) => swapAt(prev, k, k + delta))}
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
    </div>
    </SourceFourneesProvider>
  );
}
