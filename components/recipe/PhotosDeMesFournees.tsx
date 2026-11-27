'use client';

// « Mes fournées » (entrée de la fenêtre du nuage « Depuis… ») : choisir, pour illustrer l'étape d'une recette (ou
// d'un projet), des photos de réalisation prises lors de MES fournées de cette
// recette — celles de l'étape correspondante d'abord. Les photos sont
// rattachées par leur adresse (aucune copie, aucun redépôt) ; l'objet reste
// sur `jp-photos/realisations/`, et la réconciliation du stockage le garde
// tant qu'une étape de recette le cite. Visible du seul propriétaire de la
// recette (lecture sous RLS) ; la recette doit déjà être enregistrée.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { photosDesFournees, type PhotoDeFournee } from '@/lib/batch-photos-client';

// Ce que l'emplacement de photo doit savoir pour proposer « Mes fournées » :
// la recette, l'étape, les places encore libres et ce qu'on fait des adresses
// choisies. Posé par la grille de photos d'une étape (`/creer`, mode projet) ;
// sans lui, le nuage n'offre pas cette entrée (avatar, photo d'en-tête…).
export type SourceFournees = {
  recipeId: string | null | undefined;
  stepId: number | null;
  titreEtape: string;
  /** Emplacements encore libres sur l'étape. */
  places: number;
  onChoisir: (urls: string[]) => void;
  /** Limite la liste aux photos de cette fournée (formulaire d'avis). */
  batchId?: number;
};

const Contexte = createContext<SourceFournees | null>(null);

export function SourceFourneesProvider({ valeur, children }: { valeur: SourceFournees; children: ReactNode }) {
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSourceFournees(): SourceFournees | null {
  return useContext(Contexte);
}

export function FenetrePhotosFournees({ source, onClose }: { source: SourceFournees; onClose: () => void }) {
  const { recipeId, stepId, titreEtape, places, onChoisir, batchId } = source;
  const [photos, setPhotos] = useState<PhotoDeFournee[] | null>(null);
  const [toutes, setToutes] = useState(false);
  const [choisies, setChoisies] = useState<number[]>([]);

  useEffect(() => {
    if (!recipeId) return;
    let actif = true;
    photosDesFournees(recipeId, stepId, titreEtape, batchId)
      .then((p) => actif && setPhotos(p))
      .catch(() => actif && setPhotos([]));
    return () => {
      actif = false;
    };
    // Relue à chaque ouverture seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const correspondantes = (photos ?? []).filter((p) => p.correspond);
  const affichees = toutes || correspondantes.length === 0 ? photos ?? [] : correspondantes;
  const bascule = (id: number) =>
    setChoisies((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < places ? [...c, id] : c));
  const valider = () => {
    const urls = (photos ?? []).filter((p) => choisies.includes(p.id)).map((p) => p.url);
    onClose();
    if (urls.length) onChoisir(urls);
  };

  return createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            onClick={(e) => {
              // Le portail propage ses clics à l'emplacement de photo, qui ouvrirait
              // sinon le sélecteur de fichiers de l'appareil.
              e.stopPropagation();
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <div role="dialog" aria-modal="true" aria-label="Photos de mes fournées" className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-3">
                <h3 className="font-headline-md text-[18px] text-primary">Photos de mes fournées</h3>
                <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="overflow-y-auto px-5 py-4">
                {photos === null ? (
                  <p className="text-sm text-on-surface-variant">Chargement…</p>
                ) : photos.length === 0 ? (
                  <p className="text-sm italic text-on-surface-variant">
                    Aucune photo de réalisation pour l’instant : elles s’ajoutent depuis vos fournées de cette recette.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-[13px] text-on-surface-variant">
                      {toutes || correspondantes.length === 0
                        ? 'Toutes les photos de vos fournées de cette recette.'
                        : 'Photos prises sur l’étape correspondante de vos fournées.'}{' '}
                      Choisissez jusqu’à {places} photo{places > 1 ? 's' : ''}.
                    </p>
                    {correspondantes.length > 0 && correspondantes.length < photos.length && (
                      <label className="mb-3 flex cursor-pointer items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} className="h-4 w-4 accent-primary" />
                        Afficher aussi les photos des autres étapes
                      </label>
                    )}
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {affichees.map((p) => {
                        const coche = choisies.includes(p.id);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => bascule(p.id)}
                              aria-pressed={coche}
                              className={`relative block aspect-square w-full overflow-hidden rounded border-2 ${coche ? 'border-primary' : 'border-transparent'}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.thumb_url || p.url} alt={p.legende ?? p.etape ?? 'Photo de fournée'} loading="lazy" className="h-full w-full object-cover" />
                              {coche && (
                                <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary">
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </span>
                              )}
                            </button>
                            <p className="mt-1 truncate text-[11px] text-on-surface-variant">
                              {[p.date ? new Date(p.date).toLocaleDateString('fr-FR') : null, p.etape].filter(Boolean).join(' · ') || 'Fournée'}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-outline-variant px-5 py-3">
                <button type="button" onClick={onClose} className="rounded-pill border border-outline-variant px-4 py-2 font-label-md text-label-md">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={valider}
                  disabled={!choisies.length}
                  className="rounded-pill bg-primary px-4 py-2 font-label-md text-label-md text-on-primary disabled:opacity-50"
                >
                  Ajouter {choisies.length ? `(${choisies.length})` : ''}
                </button>
              </div>
            </div>
          </div>,
          document.body,
  );
}
