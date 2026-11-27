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
//
// Plafond et droits (JEP-422) : 8 photos PAR ÉTAPE et 8 photos de fin de
// fournée (sans étape). Les photos d'étape sont réservées à l'auteur de la
// recette (`photosEtapes`) : elles lui servent à illustrer ses étapes ensuite.
// Sinon, seul le bloc « Photos de cette fournée » accepte des photos ; une photo
// d'étape déposée avant cette règle y reste visible (et supprimable).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { DepuisStockage } from '@/components/stockage/DepuisStockage';
import { BoutonColler } from '@/components/BoutonColler';
import { useReadOnly, useWriteGuard } from '@/components/ImpersonationProvider';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { ImageSlot } from '@/components/ImageSlot';
import { BoutonsOrdrePhoto } from '@/components/BoutonsOrdrePhoto';
import { usePhotoDragReorder } from '@/lib/use-photo-drag-reorder';
import { trackEvent } from '@/lib/analytics';
import {
  BATCH_PHOTOS_MAX,
  LEGENDE_MAX,
  messagePlein,
  PHOTO_LARGEUR,
  ordresApresEchange,
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
  ordonnerPhotos,
  rattacherEtape,
  remplacerPhotoFournee,
  supprimerPhotoFournee,
} from '@/lib/batch-photos-client';

type Ctx = {
  photos: BatchPhoto[];
  bloque: boolean;
  // Photos d'étape permises (auteur de la recette, JEP-422).
  photosEtapes: boolean;
  ajouter: (files: File[], stepId: number | null) => Promise<void>;
  supprimer: (id: number) => Promise<void>;
  // Rend `true` quand la légende a été écrite (faux : inchangée, refusée ou en échec).
  legender: (id: number, legende: string) => Promise<boolean>;
  rattacher: (id: number, stepId: number | null) => Promise<void>;
  // Remplace l'image (recadrage, rotation) par une data-URL fraîche.
  remplacer: (id: number, dataUrl: string) => Promise<void>;
  // Échange la place de deux photos d'une même étape (glisser-déposer, flèches).
  echanger: (idA: number, idB: number) => Promise<void>;
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
  photosEtapes,
  children,
}: {
  batchId: number;
  userId: string;
  initiales: PhotosFourneeInitiales | null;
  photosEtapes: boolean;
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
    async (files: File[], demande: number | null) => {
      if (!writeGuard('Photo de réalisation')) return;
      // Sans droit aux photos d'étape, la photo rejoint la fournée.
      const stepId = photosEtapes ? demande : null;
      const places = placesRestantes(courantes.current, stepId);
      if (places <= 0) {
        await dialog.alert(messagePlein(stepId));
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
            ecartees
              ? `${ecartees} photo${ecartees > 1 ? 's' : ''} non ajoutée${ecartees > 1 ? 's' : ''} : ${BATCH_PHOTOS_MAX} au plus ${stepId == null ? 'pour la fournée' : 'par étape'}.`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
    },
    [batchId, userId, dialog, writeGuard, photosEtapes],
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
      if (stepId != null && !photosEtapes) return;
      // L'emplacement d'arrivée a son propre plafond (la photo déplacée n'y compte pas).
      if (placesRestantes(avant.filter((p) => p.id !== id), stepId) <= 0) {
        await dialog.alert(messagePlein(stepId));
        return;
      }
      setPhotos(avant.map((p) => (p.id === id ? { ...p, batch_step_id: stepId } : p)));
      const erreur = await rattacherEtape(id, stepId);
      if (erreur) {
        setPhotos(avant);
        await dialog.alert('L’étape de la photo n’a pas pu être modifiée.');
      }
    },
    [dialog, writeGuard, photosEtapes],
  );

  const remplacer = useCallback(
    async (id: number, dataUrl: string) => {
      if (!writeGuard('Photo de réalisation')) return;
      setBusy(true);
      try {
        const { url, thumb_url } = await remplacerPhotoFournee(id, dataUrl);
        courantes.current = courantes.current.map((p) => (p.id === id ? { ...p, url, thumb_url } : p));
        setPhotos(courantes.current);
      } catch (e) {
        await dialog.alert((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [dialog, writeGuard],
  );

  const echanger = useCallback(
    async (idA: number, idB: number) => {
      if (!writeGuard('Photo de réalisation')) return;
      const avant = courantes.current;
      const ordres = ordresApresEchange(avant, idA, idB);
      if (!ordres.length) return;
      const parId = new Map(ordres.map((o) => [o.id, o.ordre]));
      setPhotos(avant.map((p) => (parId.has(p.id) ? { ...p, order_index: parId.get(p.id)! } : p)));
      const erreur = await ordonnerPhotos(ordres);
      if (erreur) {
        setPhotos(avant);
        await dialog.alert('L’ordre des photos n’a pas pu être enregistré.');
      }
    },
    [dialog, writeGuard],
  );

  const valeur = useMemo<Ctx>(
    () => ({ photos, bloque, photosEtapes, ajouter, supprimer, legender, rattacher, remplacer, echanger }),
    [photos, bloque, photosEtapes, ajouter, supprimer, legender, rattacher, remplacer, echanger],
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
// Appareil tactile (téléphone, tablette) : seul cas où « Prendre une photo »
// (`capture`) a un sens — sur ordinateur, l'attribut est ignoré et le bouton
// ouvrirait simplement les fichiers, comme « Choisir ».
function useTactile(): boolean {
  const [tactile, setTactile] = useState(false);
  useEffect(() => {
    try {
      setTactile(window.matchMedia('(pointer: coarse)').matches);
    } catch {
      setTactile(false);
    }
  }, []);
  return tactile;
}

/**
 * Étape « affichée à l'écran » : la dernière carte d'étape (`#etape-<id>`) dont
 * le haut est passé sous l'en-tête du site ; à défaut la première visible.
 */
function etapeAffichee(): number | null {
  // Vue « une étape à la fois » (téléphone, tablette) : l'étape affichée est
  // déclarée par la vue elle-même, le déroulé masqué n'a aucune hauteur.
  const courante = Array.from(document.querySelectorAll<HTMLElement>('[data-etape-courante]')).find((el) => el.getBoundingClientRect().height > 0);
  if (courante) return Number(courante.dataset.etapeCourante) || null;
  const cartes = Array.from(document.querySelectorAll<HTMLElement>('[id^="etape-"]')).filter((el) => /^etape-\d+$/.test(el.id));
  const seuil = 120;
  let choisie: HTMLElement | null = null;
  for (const el of cartes) {
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.top <= seuil && r.bottom > seuil) choisie = el;
  }
  if (!choisie) choisie = cartes.find((el) => el.getBoundingClientRect().bottom > seuil) ?? null;
  return choisie ? Number(choisie.id.slice('etape-'.length)) : null;
}

/**
 * Action « Prendre une photo » du menu Actions (mode Pâtisser, téléphone et
 * tablette). Rend `null` quand elle n'a pas lieu d'être (ordinateur, fournée
 * verrouillée, photos indisponibles) ; sinon la fonction à appeler au clic.
 * Le champ fichier est créé et cliqué dans le geste de l'utilisateur (sinon le
 * navigateur bloque l'appareil photo), puis retiré. Plafond atteint : message.
 */
export function usePrendrePhotoEtape(): (() => void) | null {
  const ctx = usePhotosFournee();
  const tactile = useTactile();
  const dialog = useDialog();
  if (!ctx || ctx.bloque || !tactile) return null;
  return () => {
    // Sans droit aux photos d'étape, la photo rejoint la fournée.
    const stepId = ctx.photosEtapes ? etapeAffichee() : null;
    if (placesRestantes(ctx.photos, stepId) <= 0) {
      void dialog.alert(messagePlein(stepId));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (files.length) void ctx.ajouter(files, stepId);
    };
    input.addEventListener('cancel', () => input.remove());
    document.body.appendChild(input);
    input.click();
  };
}

export function BoutonsPhoto({ stepId, compact = false }: { stepId: number | null; compact?: boolean }) {
  const ctx = usePhotosFournee();
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const [choix, setChoix] = useState(false);
  const tactile = useTactile();
  if (!ctx || ctx.bloque) return null;
  // Sous une étape : réservé à l'auteur de la recette (JEP-422).
  if (stepId != null && !ctx.photosEtapes) return null;
  const places = placesRestantes(ctx.photos, stepId);
  const plein = places <= 0;
  const surChoix = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) void ctx.ajouter(files, stepId);
  };
  const titrePlein = plein ? `${BATCH_PHOTOS_MAX} photos au plus ${stepId == null ? 'pour la fournée' : 'par étape'}` : undefined;
  return (
    <span className="no-print inline-flex flex-wrap items-center gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={surChoix} />
      <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={surChoix} />
      {compact ? (
        // Un clic sur « Photo » déplie le choix : appareil photo OU galerie
        // (sur téléphone et tablette ; sur ordinateur, les deux ouvrent les
        // fichiers du disque).
        <>
          <button
            type="button"
            onClick={() => (tactile ? setChoix((v) => !v) : galerie.current?.click())}
            disabled={plein}
            aria-expanded={tactile ? choix : undefined}
            title={titrePlein ?? 'Ajouter une photo à cette étape'}
            aria-label="Ajouter une photo à cette étape"
            className="inline-flex items-center gap-1 rounded-pill border border-outline-variant px-2.5 py-1 text-[12px] font-label-md text-on-surface-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">photo_camera</span>
            Photo
          </button>
          {tactile && choix && !plein && (
            <>
              <button
                type="button"
                onClick={() => {
                  setChoix(false);
                  camera.current?.click();
                }}
                className="inline-flex items-center gap-1 rounded-pill bg-primary px-2.5 py-1 text-[12px] font-label-md text-on-primary hover:opacity-90"
              >
                <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                Prendre une photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setChoix(false);
                  galerie.current?.click();
                }}
                className="inline-flex items-center gap-1 rounded-pill bg-primary px-2.5 py-1 text-[12px] font-label-md text-on-primary hover:opacity-90"
              >
                <span className="material-symbols-outlined text-[16px]">photo_library</span>
                Choisir dans la galerie
              </button>
            </>
          )}
          {!plein && (
            // Coller l'image copiée sous l'étape, comme dans le bloc général :
            // visible seulement si une image est copiée (cf. BoutonColler).
            <BoutonColler className="!px-2.5 !py-1 !text-[12px]" onFichiers={(fs) => void ctx.ajouter(fs, stepId)} />
          )}
          {!plein && (
            // Stockage en ligne (JEP-408, JEP-422) : sur ordinateur aussi, sous
            // l'étape ; absent sans source configurée.
            <DepuisStockage
              usage="image"
              max={places}
              variante="bouton"
              className="!px-2.5 !py-1 !text-[12px]"
              onFichiers={(fs) => void ctx.ajouter(fs, stepId)}
            />
          )}
        </>
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
      {!compact && !plein && (
        // Coller l'image copiée (JEP-408) : ouvert à tous, visible seulement si
        // une image est copiée.
        <BoutonColler className="!px-4 !py-2" onFichiers={(fs) => void ctx.ajouter(fs, stepId)} />
      )}
      {!compact && !plein && (
        // Stockage en ligne (JEP-408) : absent sans source configurée.
        <DepuisStockage
          usage="image"
          max={places}
          variante="bouton"
          className="!px-4 !py-2"
          onFichiers={(fs) => void ctx.ajouter(fs, stepId)}
        />
      )}
      {plein && (
        <span role="status" className="flex items-center gap-1 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {BATCH_PHOTOS_MAX} photos maximum atteintes{stepId == null ? ' pour la fournée' : ' pour cette étape'}
        </span>
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
      {avecEtape && ctx.photosEtapes && etapes.length > 0 && (
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
  // Le compteur porte sur les photos de la fournée (sans étape) : les photos
  // d'étape ont leur propre plafond, sous chaque étape.
  const sansEtape = photos.filter((p) => p.batch_step_id == null).length;
  return (
    <section
      id="sec-photos-fournee"
      className={`no-print scroll-mt-28 ${misEnAvant ? '' : 'mb-6'} rounded-xl border p-5 ${
        misEnAvant ? 'border-primary/40 bg-primary/5' : 'border-outline-variant bg-surface-container-low'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className={`flex items-center gap-2 text-primary ${misEnAvant ? 'font-headline-md text-[18px] md:text-[20px]' : 'font-label-md text-[15px]'}`}>
          <span className="material-symbols-outlined text-[20px]">photo_library</span>
          Photos de cette fournée
          <span className="font-label-md text-[12px] text-on-surface-variant">
            ({sansEtape}/{BATCH_PHOTOS_MAX})
          </span>
        </h3>
        <BoutonsPhoto stepId={null} />
      </div>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
        Visibles de vous seul.
      </p>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
        {ctx.photosEtapes
          ? `Jusqu’à ${BATCH_PHOTOS_MAX} photos pour la fournée, et ${BATCH_PHOTOS_MAX} sous chaque étape : elles pourront illustrer les étapes de votre recette.`
          : `Jusqu’à ${BATCH_PHOTOS_MAX} photos pour la fournée. Les photos d’étape sont réservées à l’auteur de la recette.`}
      </p>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">cloud_done</span>
        Les photos, légendes et étapes sont enregistrées automatiquement.
      </p>
      {photos.length > 0 ? (
        <StepPhotoGallery
          photos={photos}
          grille="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
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

export function PhotosEtape({
  stepId,
  sansMarge = false,
}: {
  stepId: number;
  sansMarge?: boolean;
}) {
  const ctx = usePhotosFournee();
  // Glisser-déposer (souris) ; les flèches de chaque photo servent au doigt.
  const reorder = usePhotoDragReorder((de, vers) => void ctx?.echanger(Number(de), Number(vers)));
  // Photos d'étape réservées à l'auteur de la recette (JEP-422) ; une photo
  // d'étape plus ancienne reste visible dans le bloc « Photos de cette fournée ».
  if (!ctx || !ctx.photosEtapes) return null;
  const photos = photosDeEtape(ctx.photos, stepId);
  if (ctx.bloque && photos.length === 0) return null;
  // Plusieurs fichiers choisis d'un coup (sélecteur, glisser-déposer, stockage
  // en ligne) : chacun devient une photo de l'étape, y compris depuis un
  // emplacement déjà rempli.
  const ajouterPlusieurs = (fichiers: File[]) => void ctx.ajouter(fichiers, stepId);
  // Un seul fichier : l'emplacement vide le rend en data-URL (déjà compressée).
  const ajouterUne = (dataUrl: string) => {
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => ctx.ajouter([new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })], stepId));
  };
  const places = placesRestantes(ctx.photos, stepId);
  return (
    <div className={`no-print ${sansMarge ? '' : 'mt-3'} flex flex-col gap-2`}>
      {(photos.length > 0 || (!ctx.bloque && places > 0)) && (
        // Même bloc que les photos d'étape d'une recette : emplacements carrés,
        // recadrage / zoom / rotation (crayon) et suppression par `ImageSlot`,
        // plus un emplacement vide pour en ajouter (plusieurs à la fois).
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p, k) => (
            <div
              key={p.id}
              className={`relative aspect-square overflow-hidden border border-dashed ${
                reorder.overKey === String(p.id) ? 'border-primary ring-2 ring-primary' : 'border-outline-variant'
              } ${ctx.bloque ? '' : 'cursor-grab active:cursor-grabbing'}`}
              title={ctx.bloque ? undefined : 'Glisser pour réordonner'}
              {...(ctx.bloque ? null : reorder.dropProps(String(p.id)))}
              {...(ctx.bloque ? null : reorder.dragProps(String(p.id)))}
            >
              <ImageSlot
                src={p.url}
                originalSrc={p.url}
                onChange={ctx.bloque ? undefined : (url) => void ctx.remplacer(p.id, url)}
                onClear={ctx.bloque ? undefined : () => void ctx.supprimer(p.id)}
                onFilesAdded={ctx.bloque ? undefined : ajouterPlusieurs}
                shape="rect"
                maxWidth={PHOTO_LARGEUR}
                aspectRatio={1}
                className="h-full w-full"
              />
              {!ctx.bloque && (
                <BoutonsOrdrePhoto
                  index={k}
                  total={photos.length}
                  onDeplacer={(delta) => void ctx.echanger(p.id, photos[k + delta].id)}
                />
              )}
            </div>
          ))}
          {!ctx.bloque && places > 0 && (
            <div key={`vide-${photos.length}`} className="relative aspect-square overflow-hidden border border-dashed border-outline-variant">
              <ImageSlot
                src={null}
                onChange={ajouterUne}
                onFilesAdded={ajouterPlusieurs}
                shape="rect"
                maxWidth={PHOTO_LARGEUR}
                aspectRatio={1}
                placeholder="Ajouter des photos"
                className="h-full w-full"
              />
            </div>
          )}
        </div>
      )}
      <div>
        <BoutonsPhoto stepId={stepId} compact />
      </div>
    </div>
  );
}

// ── Vignettes d'une étape (mode Pâtisser, une étape à la fois) ─────────────

/**
 * Photos qui aident à réaliser l'étape, en petites vignettes : celles de la
 * recette de base (relues en direct, jamais copiées) puis celles de mes
 * fournées. Un clic ouvre le diaporama plein écran de `StepPhotoGallery`
 * (flèches, glissement, clavier). L'ajout reste à côté ; recadrer, supprimer
 * ou réordonner mes photos passe par « Gérer mes photos », qui déplie
 * l'éditeur habituel (`PhotosEtape`).
 */
export function PhotosEtapeVignettes({
  stepId,
  photosRecette = [],
}: {
  stepId: number;
  photosRecette?: { url: string; ai_retouched?: boolean }[];
}) {
  const ctx = usePhotosFournee();
  const [gerer, setGerer] = useState(false);
  const [choix, setChoix] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const tactile = useTactile();
  const etapesPermises = !!ctx && ctx.photosEtapes;
  const miennes = ctx && etapesPermises ? photosDeEtape(ctx.photos, stepId) : [];
  const toutes = [
    ...photosRecette.map((p) => ({ url: p.url, ai_retouched: p.ai_retouched, legende: 'Photo de la recette' })),
    ...miennes.map((p) => ({ url: p.url, thumb_url: p.thumb_url, legende: p.legende })),
  ];
  const peutAjouter = !!ctx && !ctx.bloque && etapesPermises;
  if (!toutes.length && !peutAjouter) return null;
  if (gerer && ctx) {
    return (
      <div className="no-print flex flex-col gap-2">
        <PhotosEtape stepId={stepId} sansMarge />
        <button type="button" onClick={() => setGerer(false)} className="self-start font-label-md text-[13px] text-primary underline underline-offset-2">
          Terminé
        </button>
      </div>
    );
  }
  const places = ctx ? placesRestantes(ctx.photos, stepId) : 0;
  const plein = !!ctx && places <= 0;
  const surChoix = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (ctx && files.length) void ctx.ajouter(files, stepId);
  };
  // Tuile pointillée « Photo », dernière cellule de la grille : un appui
  // déplie le choix « Prendre une photo » / « Choisir dans la galerie » (sur
  // ordinateur, elle ouvre directement les fichiers).
  const tuile =
    peutAjouter && !plein ? (
      <button
        type="button"
        onClick={() => (tactile ? setChoix((v) => !v) : galerie.current?.click())}
        aria-expanded={tactile ? choix : undefined}
        aria-label="Ajouter une photo à cette étape"
        className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-outline-variant text-[11px] font-label-md text-primary hover:border-primary"
      >
        <span className="material-symbols-outlined text-[26px]">add_a_photo</span>
        Photo
      </button>
    ) : null;
  return (
    <div className="no-print flex flex-col gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={surChoix} />
      <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={surChoix} />
      {toutes.length > 0 ? (
        <StepPhotoGallery photos={toutes} grille="grid-cols-4 sm:grid-cols-6" fin={tuile} />
      ) : (
        tuile && <div className="grid grid-cols-4 gap-4 sm:grid-cols-6">{tuile}</div>
      )}
      {tactile && choix && !plein && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setChoix(false);
              camera.current?.click();
            }}
            className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-3.5 py-2 text-[13px] font-label-md text-on-primary"
          >
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            Prendre une photo
          </button>
          <button
            type="button"
            onClick={() => {
              setChoix(false);
              galerie.current?.click();
            }}
            className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-3.5 py-2 text-[13px] font-label-md text-on-primary"
          >
            <span className="material-symbols-outlined text-[18px]">photo_library</span>
            Choisir dans la galerie
          </button>
        </div>
      )}
      {plein && peutAjouter && (
        <span role="status" className="flex items-center gap-1 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {BATCH_PHOTOS_MAX} photos maximum atteintes pour cette étape
        </span>
      )}
      {peutAjouter && !plein && ctx && (
        <div className="flex flex-wrap items-center gap-3 empty:hidden">
          <BoutonColler className="!px-2.5 !py-1 !text-[12px]" onFichiers={(fs) => void ctx.ajouter(fs, stepId)} />
          {/* Stockage en ligne (JEP-422) : la tuile « Photo » n'ouvre que les fichiers de l'appareil. */}
          <DepuisStockage
            usage="image"
            max={places}
            variante="bouton"
            className="!px-2.5 !py-1 !text-[12px]"
            onFichiers={(fs) => void ctx.ajouter(fs, stepId)}
          />
        </div>
      )}
      {peutAjouter && miennes.length > 0 && (
        <button type="button" onClick={() => setGerer(true)} className="self-start font-label-md text-[13px] text-primary underline underline-offset-2">
          Gérer mes photos
        </button>
      )}
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
