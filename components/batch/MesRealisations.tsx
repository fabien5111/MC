'use client';

// « Mes réalisations » (JEP-382) : photos de réalisation des fournées du
// membre — privées, lues sous sa session (RLS propriétaire). Deux usages :
// - fiche recette : photos de toutes SES fournées de cette recette, par
//   fournée (la plus récente d'abord) ;
// - « En cuisine » : grille chronologique de toutes ses photos.
// Un clic sur une photo l'ouvre en grand (diaporama de `StepPhotoGallery`) ;
// le nom de la recette mène à la fournée ; la corbeille supprime la photo,
// après confirmation. Liste tenue en état local (suppression immédiate, sans
// resynchronisation serveur, comme le bloc photos de la fournée).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDialog } from '@/components/Dialog';
import { useReadOnly, useWriteGuard } from '@/components/ImpersonationProvider';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { formatDate } from '@/lib/format';
import { grouperParFournee, type Realisation } from '@/lib/batch-photos';
import { supprimerPhotoFournee } from '@/lib/batch-photos-client';

const GRILLE = 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6';

/** Liste locale + suppression confirmée (corbeille). */
function useRealisations(initiales: Realisation[]) {
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const lectureSeule = useReadOnly();
  const [items, setItems] = useState(initiales);
  useEffect(() => setItems(initiales), [initiales]);

  async function supprimer(id: number) {
    if (!writeGuard('Photo de réalisation')) return;
    if (!(await dialog.confirm('Supprimer cette photo de la fournée ?', { okLabel: 'Supprimer', focus: 'annuler' }))) return;
    const erreur = await supprimerPhotoFournee(id);
    if (erreur) {
      await dialog.alert('La photo n’a pas pu être supprimée. Réessayez.');
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
  }
  return { items, supprimer, lectureSeule };
}

function Corbeille({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Supprimer cette photo"
      aria-label="Supprimer cette photo"
      className="shrink-0 rounded p-1 text-error hover:bg-error/10 transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">delete</span>
    </button>
  );
}

/** Fiche recette : photos groupées par fournée. Rien sans photo. */
export function MesRealisationsRecette({ realisations }: { realisations: Realisation[] }) {
  const { items, supprimer, lectureSeule } = useRealisations(realisations);
  if (!items.length) return null;
  const groupes = grouperParFournee(items);
  return (
    <details className="no-print group border border-outline-variant mb-12">
      <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
        <span className="font-label-md text-label-md text-primary">
          MES RÉALISATIONS DE CETTE RECETTE ({items.length})
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-4 bg-white flex flex-col gap-6">
        <p className="flex items-start gap-1.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
          Les photos de vos fournées, visibles de vous seul. Cliquez sur une photo pour l’agrandir.
        </p>
        {groupes.map((g) => (
          <div key={g.fourneeId}>
            <Link
              href={`/fournee/${g.fourneeId}`}
              className="mb-2 inline-block font-body-md text-body-md text-primary underline underline-offset-2 hover:text-secondary"
            >
              Fournée du {formatDate(g.date ?? g.photos[0]?.created_at)}
            </Link>
            <StepPhotoGallery
              photos={g.photos}
              grille={GRILLE}
              sousVignette={(i) => (
                <div className="flex items-start justify-between gap-1">
                  <span className="min-w-0 truncate text-[11px] text-on-surface-variant">{g.photos[i].legende}</span>
                  {!lectureSeule && <Corbeille onClick={() => void supprimer(g.photos[i].id)} />}
                </div>
              )}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

/** « En cuisine » : grille chronologique (la plus récente d'abord). Rien sans photo. */
export function MesRealisationsCuisine({ realisations }: { realisations: Realisation[] }) {
  const { items, supprimer, lectureSeule } = useRealisations(realisations);
  if (!items.length) return null;
  return (
    <section id="mes-realisations" className="no-print mt-14 scroll-mt-28 border-t border-outline-variant/60 pt-8">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-headline-md text-primary">
          Mes réalisations ({items.length})
          <span className="material-symbols-outlined text-[24px] transition-transform group-open:rotate-180">expand_more</span>
        </summary>
        <p className="mt-4 mb-4 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
          Toutes les photos de vos fournées, visibles de vous seul. Cliquez sur une photo pour l’agrandir, sur le nom de la recette pour ouvrir la fournée.
        </p>
        <StepPhotoGallery
          photos={items}
          grille={GRILLE}
          sousVignette={(i) => {
            const p = items[i];
            return (
              <div className="flex items-start justify-between gap-1">
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={`/fournee/${p.fournee.id}`}
                    title={`Ouvrir la fournée — ${p.fournee.titre}`}
                    className="truncate font-label-md text-[12px] text-primary underline-offset-2 hover:underline"
                  >
                    {p.fournee.titre}
                  </Link>
                  <span className="truncate text-[11px] text-on-surface-variant">
                    {[formatDate(p.fournee.date ?? p.created_at), p.legende ?? ''].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {!lectureSeule && <Corbeille onClick={() => void supprimer(p.id)} />}
              </div>
            );
          }}
        />
      </details>
    </section>
  );
}
