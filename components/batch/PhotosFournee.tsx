'use client';

// Photos de réalisation d'une fournée (JEP-382) : journal photo PRIVÉ, visible
// du seul propriétaire. Un fournisseur monté par `BatchView` tient la liste
// (état optimiste, aucune resynchronisation serveur : rien d'autre sur la page
// n'en dépend, même doctrine que `LeconsProvider`) ; trois consommateurs :
// - `PhotosFourneeBloc` : bloc « Photos de cette fournée » (Préparer,
//   Pâtisser, résumé d'une fournée close — mis en avant) ;
// - `PhotosEtape` : vignettes rattachées à une étape + bouton photo de l'étape ;
// - `ChoixPhotoFournee` : passerelle vers l'avis (`BatchReview`).
//
// Ajouter une photo est permis sur une fournée CLOSE (terminée, abandonnée) :
// ça ne réécrit pas l'historique — même raisonnement que la carte d'avis,
// indépendant de `readOnly` et de `?lecture=1`. Seule l'impersonation en
// lecture seule bloque (garde réelle : RLS `impersonation_ro_*`).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { useReadOnly, useWriteGuard } from '@/components/ImpersonationProvider';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { trackEvent } from '@/lib/analytics';
import {
  BATCH_PHOTOS_MAX,
  LEGENDE_MAX,
  photosDeEtape,
  placesRestantes,
  prochainOrdre,
  trierPhotos,
  type BatchPhoto,
  type PhotosFourneeInitiales,
} from '@/lib/batch-photos';
import {
  ajouterPhotoFournee,
  modifierLegende,
  rattacherEtape,
  supprimerPhotoFournee,
} from '@/lib/batch-photos-client';

type Ctx = {
  photos: BatchPhoto[];
  bloque: boolean;
  ajouter: (files: File[], stepId: number | null) => Promise<void>;
  supprimer: (id: number) => Promise<void>;
  // Rend `true` quand la légende a été écrite (faux : inchangée, refusée ou en échec).
  legender: (id: number, legende: string) => Promise<boolean>;
  rattacher: (id: number, stepId: number | null) => Promise<void>;
};

const PhotosCtx = createContext<Ctx | null>(null);

/** `null` hors fournée ou table absente (migration pas jouée) : rien n'est affiché. */
export function usePhotosFournee(): Ctx | null {
  return useContext(PhotosCtx);
}

export function PhotosFourneeProvider({
  batchId,
  userId,
  initiales,
  children,
}: {
  batchId: number;
  userId: string;
  initiales: PhotosFourneeInitiales | null;
  children: ReactNode;
}) {
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const bloque = useReadOnly();
  const [photos, setPhotos] = useState<BatchPhoto[]>(() => initiales?.photos ?? []);
  const [busy, setBusy] = useState(false);
  // Lecture de l'état courant dans les rappels sans les recréer à chaque photo.
  const courantes = useRef(photos);
  courantes.current = photos;

  const ajouter = useCallback(
    async (files: File[], stepId: number | null) => {
      if (!writeGuard('Photo de réalisation')) return;
      const places = placesRestantes(courantes.current);
      if (places <= 0) {
        await dialog.alert(`${BATCH_PHOTOS_MAX} photos au plus par fournée : supprimez-en une pour en ajouter une autre.`);
        return;
      }
      const lot = files.slice(0, places);
      setBusy(true);
      const erreurs: string[] = [];
      try {
        for (const file of lot) {
          try {
            const photo = await ajouterPhotoFournee({
              file,
              userId,
              batchId,
              stepId,
              ordre: prochainOrdre(courantes.current),
            });
            courantes.current = [...courantes.current, photo];
            setPhotos(courantes.current);
            trackEvent('ajouter_photo_realisation');
          } catch (e) {
            erreurs.push((e as Error).message);
          }
        }
      } finally {
        setBusy(false);
      }
      const ecartees = files.length - lot.length;
      if (erreurs.length || ecartees) {
        await dialog.alert(
          [
            ...new Set(erreurs),
            ecartees ? `${ecartees} photo${ecartees > 1 ? 's' : ''} non ajoutée${ecartees > 1 ? 's' : ''} : ${BATCH_PHOTOS_MAX} au plus par fournée.` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
    },
    [batchId, userId, dialog, writeGuard],
  );

  const supprimer = useCallback(
    async (id: number) => {
      if (!writeGuard('Photo de réalisation')) return;
      if (!(await dialog.confirm('Supprimer cette photo de la fournée ?', { okLabel: 'Supprimer', focus: 'annuler' }))) return;
      const avant = courantes.current;
      setPhotos(avant.filter((p) => p.id !== id));
      const erreur = await supprimerPhotoFournee(id);
      if (erreur) {
        setPhotos(avant);
        await dialog.alert('La photo n’a pas pu être supprimée. Réessayez.');
      }
    },
    [dialog, writeGuard],
  );

  const legender = useCallback(
    async (id: number, legende: string) => {
      if (!writeGuard('Photo de réalisation')) return false;
      const avant = courantes.current;
      const propre = legende.trim() ? legende.trim().slice(0, LEGENDE_MAX) : null;
      if (avant.find((p) => p.id === id)?.legende === propre) return false;
      setPhotos(avant.map((p) => (p.id === id ? { ...p, legende: propre } : p)));
      const erreur = await modifierLegende(id, legende);
      if (erreur) {
        setPhotos(avant);
        await dialog.alert('La légende n’a pas pu être enregistrée.');
        return false;
      }
      return true;
    },
    [dialog, writeGuard],
  );

  const rattacher = useCallback(
    async (id: number, stepId: number | null) => {
      if (!writeGuard('Photo de réalisation')) return;
      const avant = courantes.current;
      setPhotos(avant.map((p) => (p.id === id ? { ...p, batch_step_id: stepId } : p)));
      const erreur = await rattacherEtape(id, stepId);
      if (erreur) {
        setPhotos(avant);
        await dialog.alert('L’étape de la photo n’a pas pu être modifiée.');
      }
    },
    [dialog, writeGuard],
  );

  const valeur = useMemo<Ctx>(
    () => ({ photos, bloque, ajouter, supprimer, legender, rattacher }),
    [photos, bloque, ajouter, supprimer, legender, rattacher],
  );

  if (!initiales?.disponible) return <>{children}</>;
  return (
    <PhotosCtx.Provider value={valeur}>
      <LoadingOverlay visible={busy} label="Enregistrement de la photo…" />
      {children}
    </PhotosCtx.Provider>
  );
}

// ── Boutons d'ajout ───────────────────────────────────────────────────────

/**
 * « Ajouter des photos » : un seul bouton, plusieurs fichiers à la fois. Sur un
 * téléphone, le sélecteur du système propose l'appareil photo ou la photothèque ;
 * sur ordinateur, les fichiers du disque. En version compacte (sous une étape),
 * le bouton « Photo » ouvre directement l'appareil photo (`capture`).
 */
export function BoutonsPhoto({ stepId, compact = false }: { stepId: number | null; compact?: boolean }) {
  const ctx = usePhotosFournee();
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  if (!ctx || ctx.bloque) return null;
  const plein = placesRestantes(ctx.photos) <= 0;
  const surChoix = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) void ctx.ajouter(files, stepId);
  };
  const titrePlein = plein ? `${BATCH_PHOTOS_MAX} photos au plus par fournée` : undefined;
  return (
    <span className="no-print inline-flex flex-wrap items-center gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={surChoix} />
      <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={surChoix} />
      {compact ? (
        <button
          type="button"
          onClick={() => camera.current?.click()}
          disabled={plein}
          title={titrePlein ?? 'Prendre une photo de cette étape'}
          aria-label="Prendre une photo de cette étape"
          className="inline-flex items-center gap-1 rounded-pill border border-outline-variant px-2.5 py-1 text-[12px] font-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
          Photo
        </button>
      ) : (
        // Un seul bouton : sur un téléphone, le sélecteur du système propose
        // lui-même l'appareil photo ou la photothèque ; sur ordinateur, les
        // fichiers du disque. Plusieurs photos à la fois.
        <button
          type="button"
          onClick={() => galerie.current?.click()}
          disabled={plein}
          title={titrePlein}
          className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2 font-label-md text-label-md text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
          Ajouter des photos
        </button>
      )}
    </span>
  );
}

// ── Sous chaque vignette : étape, légende, corbeille ──────────────────────

function DetailPhoto({
  photo,
  etapes,
  ctx,
  avecEtape,
}: {
  photo: BatchPhoto;
  etapes: { id: number; titre: string }[];
  ctx: Ctx;
  avecEtape: boolean;
}) {
  // Confirmation brève après l'enregistrement d'une légende (automatique, sans bouton).
  const [enregistre, setEnregistre] = useState(false);
  useEffect(() => {
    if (!enregistre) return;
    const t = setTimeout(() => setEnregistre(false), 2500);
    return () => clearTimeout(t);
  }, [enregistre]);
  return (
    <div className="no-print flex flex-col gap-1">
      {avecEtape && etapes.length > 0 && (
        <select
          value={photo.batch_step_id ?? ''}
          disabled={ctx.bloque}
          onChange={(e) => void ctx.rattacher(photo.id, e.target.value ? Number(e.target.value) : null)}
          aria-label="Étape de la photo"
          className="w-full min-w-0 rounded border border-outline-variant bg-white px-1.5 py-1 text-[12px] text-on-surface-variant"
        >
          <option value="">Toute la fournée</option>
          {etapes.map((s, i) => (
            <option key={s.id} value={s.id}>
              {`${i + 1}. ${s.titre || 'Étape'}`}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-start gap-1">
        <input
          type="text"
          // Non contrôlé : la légende s'écrit à la sortie du champ. `key`
          // remonte le champ si la valeur change ailleurs (échec rétabli).
          key={photo.legende ?? ''}
          defaultValue={photo.legende ?? ''}
          maxLength={LEGENDE_MAX}
          disabled={ctx.bloque}
          placeholder="Légende (facultatif)"
          onBlur={(e) => void ctx.legender(photo.id, e.target.value).then((ok) => ok && setEnregistre(true))}
          className="w-full min-w-0 rounded border border-outline-variant bg-white px-1.5 py-1 text-[12px] text-on-surface"
        />
        {!ctx.bloque && (
          <button
            type="button"
            onClick={() => void ctx.supprimer(photo.id)}
            title="Supprimer cette photo"
            aria-label="Supprimer cette photo"
            className="shrink-0 rounded p-1 text-error hover:bg-error/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
      </div>
      {enregistre && (
        <p role="status" className="flex items-center gap-1 text-[11px] text-green-700">
          <span className="material-symbols-outlined text-[14px]">check</span>
          Légende enregistrée
        </p>
      )}
    </div>
  );
}

// ── Bloc « Photos de cette fournée » ──────────────────────────────────────

export function PhotosFourneeBloc({
  etapes,
  misEnAvant = false,
}: {
  // Étapes de la fournée, dans l'ordre du déroulé : rattachement d'une photo.
  etapes: { id: number; titre: string }[];
  // Résumé d'une fournée close : bloc mis en avant (cadre, titre plus grand).
  misEnAvant?: boolean;
}) {
  const ctx = usePhotosFournee();
  if (!ctx) return null;
  const photos = trierPhotos(ctx.photos);
  if (ctx.bloque && photos.length === 0) return null;
  return (
    <section
      id="sec-photos-fournee"
      className={`no-print scroll-mt-28 mb-6 rounded-xl border p-5 ${
        misEnAvant ? 'border-primary/40 bg-primary/5' : 'border-outline-variant bg-surface-container-low'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className={`flex items-center gap-2 text-primary ${misEnAvant ? 'font-headline-md text-[18px] md:text-[20px]' : 'font-label-md text-[15px]'}`}>
          <span className="material-symbols-outlined text-[20px]">photo_library</span>
          Photos de cette fournée
          <span className="font-label-md text-[12px] text-on-surface-variant">
            ({photos.length}/{BATCH_PHOTOS_MAX})
          </span>
        </h3>
        <BoutonsPhoto stepId={null} />
      </div>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
        Visibles de vous seul. Une photo ne s’affiche ailleurs que si vous la choisissez pour votre avis.
      </p>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">cloud_done</span>
        Pas de bouton « Enregistrer » : les photos, légendes et étapes sont enregistrées automatiquement.
      </p>
      {photos.length > 0 ? (
        <StepPhotoGallery
          photos={photos}
          sousVignette={(i) => <DetailPhoto photo={photos[i]} etapes={etapes} ctx={ctx} avecEtape />}
        />
      ) : (
        <p className="text-sm italic text-on-surface-variant">
          Aucune photo pour l’instant : gardez une trace de votre réalisation, pour comparer vos essais.
        </p>
      )}
    </section>
  );
}

// ── Sous une étape ────────────────────────────────────────────────────────

export function PhotosEtape({ stepId }: { stepId: number }) {
  const ctx = usePhotosFournee();
  if (!ctx) return null;
  const photos = photosDeEtape(ctx.photos, stepId);
  if (ctx.bloque && photos.length === 0) return null;
  return (
    <div className="no-print mt-3 flex flex-col gap-2">
      {photos.length > 0 && (
        <div className="max-w-md">
          <StepPhotoGallery photos={photos} compact />
        </div>
      )}
      <div>
        <BoutonsPhoto stepId={stepId} compact />
      </div>
    </div>
  );
}

// ── Passerelle vers l'avis ────────────────────────────────────────────────

/**
 * Photos de la fournée proposées dans le formulaire d'avis. La photo choisie
 * reste à la même adresse (`realisations/`) ; la route d'avis vérifie qu'elle
 * appartient bien à une fournée du membre, et l'avis passe en modération
 * comme toute photo d'avis.
 */
export function ChoixPhotoFournee({
  dejaChoisies,
  places,
  onChoisir,
}: {
  dejaChoisies: string[];
  places: number;
  onChoisir: (url: string) => void;
}) {
  const ctx = usePhotosFournee();
  const [ouvert, setOuvert] = useState(false);
  if (!ctx || ctx.photos.length === 0) return null;
  const photos = trierPhotos(ctx.photos);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[13px] font-label-md text-primary underline underline-offset-2"
      >
        <span className="material-symbols-outlined text-[18px]">photo_library</span>
        Choisir parmi les photos de cette fournée
      </button>
      {ouvert && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((p) => {
            const choisie = dejaChoisies.includes(p.url);
            return (
              <button
                key={p.id}
                type="button"
                disabled={choisie || places <= 0}
                onClick={() => onChoisir(p.url)}
                title={choisie ? 'Déjà dans votre avis' : places <= 0 ? 'Plus de place dans votre avis' : p.legende || 'Ajouter à mon avis'}
                className={`relative h-[72px] w-[72px] overflow-hidden rounded border ${
                  choisie ? 'border-primary ring-2 ring-primary' : 'border-outline-variant hover:border-primary'
                } disabled:cursor-not-allowed`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- stockage objet */}
                <img src={p.thumb_url || p.url} alt={p.legende ?? ''} className={`h-full w-full object-cover ${choisie ? 'opacity-60' : ''}`} />
                {choisie && (
                  <span className="material-symbols-outlined absolute inset-0 m-auto h-fit w-fit text-[22px] text-primary">check_circle</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-[11px] text-on-surface-variant">
        La photo choisie deviendra visible sur la fiche recette une fois votre avis validé.
      </p>
    </div>
  );
}
