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
import { useReadOnly, useWriteGuard } from '@/components/ImpersonationProvider';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { ImageSlot } from '@/components/ImageSlot';
import { BoutonsOrdrePhoto } from '@/components/BoutonsOrdrePhoto';
import { usePhotoDragReorder } from '@/lib/use-photo-drag-reorder';
import { trackEvent } from '@/lib/analytics';
import {
  FOURNEE_PHOTOS_MAX,
  LEGENDE_MAX,
  maxPhotos,
  messagePlein,
  PHOTO_LARGEUR,
  ordresApresEchange,
  ordresApresInsertion,
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
  inserer: (id: number, idCible: number, zone: 'avant' | 'apres') => Promise<void>;
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
              ? `${ecartees} photo${ecartees > 1 ? 's' : ''} non ajoutée${ecartees > 1 ? 's' : ''} : ${maxPhotos(stepId)} au plus ${stepId == null ? 'pour la fournée' : 'par étape'}.`
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

  // Écrit un nouvel ordre : état local d'abord, retour arrière si l'écriture échoue.
  const appliquerOrdres = useCallback(
    async (calcul: (avant: BatchPhoto[]) => { id: number; ordre: number }[]) => {
      if (!writeGuard('Photo de réalisation')) return;
      const avant = courantes.current;
      const ordres = calcul(avant);
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
  const echanger = useCallback(
    (idA: number, idB: number) => appliquerOrdres((avant) => ordresApresEchange(avant, idA, idB)),
    [appliquerOrdres],
  );
  // Insertion dans la gouttière entre deux photos (JEP-434).
  const inserer = useCallback(
    (id: number, idCible: number, zone: 'avant' | 'apres') => appliquerOrdres((avant) => ordresApresInsertion(avant, id, idCible, zone)),
    [appliquerOrdres],
  );

  const valeur = useMemo<Ctx>(
    () => ({ photos, bloque, photosEtapes, ajouter, supprimer, legender, rattacher, remplacer, echanger, inserer }),
    [photos, bloque, photosEtapes, ajouter, supprimer, legender, rattacher, remplacer, echanger, inserer],
  );

  if (!initiales?.disponible) return <>{children}</>;
  return (
    <PhotosCtx.Provider value={valeur}>
      <LoadingOverlay visible={busy} label="Enregistrement de la photo…" />
      {children}
    </PhotosCtx.Provider>
  );
}

// ── Ajout de photos ───────────────────────────────────────────────────────

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

/**
 * Tuile « ajouter des photos » (JEP-431) : le même emplacement que celui des
 * photos d'une recette (`ImageSlot`) — dépôt, glisser-déposer, Ctrl+V, et en
 * pastilles « Coller » et « Depuis… » (stockages en ligne + « Cet appareil »).
 * Remplace l'ancienne rangée de boutons séparés. Plusieurs fichiers à la fois ;
 * le plafond est tenu par `ajouter`.
 *
 * Sur appareil tactile, un appui sur la tuile déplie le choix « Prendre une
 * photo » / « Choisir dans la galerie » au lieu d'ouvrir directement le
 * sélecteur (l'attribut `capture` n'a de sens que là). L'interception se fait
 * en phase de capture, et seulement pour un appui qui vient de la tuile
 * elle-même (DOM) : les pastilles (boutons) et la fenêtre « Depuis… », portée
 * dans `document.body` mais rattachée à cet arbre React, ne sont pas touchées.
 */
function TuileAjoutPhoto({
  stepId,
  ratio,
}: {
  stepId: number | null;
  /** Rapport largeur / hauteur de la tuile (1 : étape ; 16/9 : bloc de la fournée). */
  ratio: number;
}) {
  const ctx = usePhotosFournee();
  const tactile = useTactile();
  const [choix, setChoix] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  if (!ctx || ctx.bloque) return null;
  // Sous une étape : réservé à l'auteur de la recette (JEP-422).
  if (stepId != null && !ctx.photosEtapes) return null;
  if (placesRestantes(ctx.photos, stepId) <= 0) return null;
  const ajouterPlusieurs = (fichiers: File[]) => void ctx.ajouter(fichiers, stepId);
  // Un seul fichier : l'emplacement vide le rend en data-URL (déjà compressée).
  const ajouterUne = (dataUrl: string) => {
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => ctx.ajouter([new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })], stepId));
  };
  const surChoix = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) ajouterPlusieurs(files);
  };
  return (
    <div className="no-print">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={surChoix} />
      <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={surChoix} />
      <div
        className="relative overflow-hidden border border-dashed border-outline-variant"
        style={{ aspectRatio: ratio }}
        onClickCapture={(e) => {
          if (!tactile) return;
          const cible = e.target as HTMLElement;
          if (!e.currentTarget.contains(cible) || cible.closest('button') || cible.tagName === 'INPUT') return;
          e.stopPropagation();
          setChoix((v) => !v);
        }}
      >
        <ImageSlot
          src={null}
          onChange={ajouterUne}
          onFilesAdded={ajouterPlusieurs}
          shape="rect"
          maxWidth={PHOTO_LARGEUR}
          aspectRatio={ratio}
          placeholder="Ajouter des photos"
          className="h-full w-full"
        />
      </div>
      {tactile && choix && (
        <div className="mt-2 flex flex-wrap gap-2">
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
        </div>
      )}
    </div>
  );
}

/** Message affiché à la place de la tuile quand le plafond de photos est atteint. */
function MessagePlein({ stepId }: { stepId: number | null }) {
  const ctx = usePhotosFournee();
  if (!ctx || ctx.bloque) return null;
  if (stepId != null && !ctx.photosEtapes) return null;
  if (placesRestantes(ctx.photos, stepId) > 0) return null;
  return (
    <span role="status" className="no-print flex items-center gap-1 text-[12px] text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
      {maxPhotos(stepId)} photos maximum atteintes{stepId == null ? ' pour la fournée' : ' pour cette étape'}
    </span>
  );
}

// ── Bloc « Photos de cette fournée » ──────────────────────────────────────

export function PhotosFourneeBloc({
  misEnAvant = false,
}: {
  // Étapes de la fournée (inutilisées depuis JEP-422 : plus de choix d'étape
  // ni de légende sous les photos du bloc) ; gardées pour les appelants.
  etapes?: { id: number; titre: string }[];
  // Résumé d'une fournée close : bloc mis en avant (cadre, titre plus grand).
  misEnAvant?: boolean;
}) {
  const ctx = usePhotosFournee();
  if (!ctx) return null;
  // Le bloc ne montre que le résultat de la fournée (JEP-426) : les photos
  // d'étape ont leur plafond et leur grille sous chaque étape, jamais ici.
  const photos = trierPhotos(ctx.photos.filter((p) => p.batch_step_id == null));
  if (ctx.bloque && photos.length === 0) return null;
  const sansEtape = photos.length;
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
            ({sansEtape}/{FOURNEE_PHOTOS_MAX})
          </span>
        </h3>
        <MessagePlein stepId={null} />
      </div>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
        Visibles de vous seul.
      </p>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
        {ctx.photosEtapes
          ? `Jusqu’à ${FOURNEE_PHOTOS_MAX} photos pour la fournée, et 8 sous chaque étape : elles pourront illustrer les étapes de votre recette.`
          : `Jusqu’à ${FOURNEE_PHOTOS_MAX} photos pour la fournée. Les photos d’étape sont réservées à l’auteur de la recette.`}
      </p>
      <p className="mb-3 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] shrink-0">cloud_done</span>
        Les photos, légendes et étapes sont enregistrées automatiquement.
      </p>
      {photos.length === 0 && !ctx.bloque && (
        <p className="mb-3 text-sm italic text-on-surface-variant">
          Aucune photo pour l’instant : gardez une trace de votre réalisation, pour comparer vos essais.
        </p>
      )}
      {photos.length > 0 || !ctx.bloque ? (
        ctx.bloque ? (
          // Lecture seule : galerie, clic = diaporama.
          <StepPhotoGallery photos={photos} grille="grid-cols-2" />
        ) : (
          // 4 photos au plus, en 2 lignes de 2 tuiles paysage (16:9, comme dans
          // « Mes réalisations ») — JEP-422. Même tuile que sous une étape :
          // corbeille et crayon (recadrage, zoom, rotation) sur la photo.
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-video overflow-hidden border border-dashed border-outline-variant">
                <ImageSlot
                  src={p.url}
                  originalSrc={p.url}
                  onChange={(url) => void ctx.remplacer(p.id, url)}
                  onClear={() => void ctx.supprimer(p.id)}
                  shape="rect"
                  maxWidth={PHOTO_LARGEUR}
                  aspectRatio={16 / 9}
                  className="h-full w-full"
                />
              </div>
            ))}
            {/* Même tuile que sous une étape (JEP-431) : pastilles « Coller » et « Depuis… ». */}
            <TuileAjoutPhoto stepId={null} ratio={16 / 9} />
          </div>
        )
      ) : null}
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
  const reorder = usePhotoDragReorder(
    (de, vers) => void ctx?.echanger(Number(de), Number(vers)),
    (de, vers, zone) => void ctx?.inserer(Number(de), Number(vers), zone),
  );
  // Photos d'étape réservées à l'auteur de la recette (JEP-422) ; une photo
  // d'étape plus ancienne reste visible dans le bloc « Photos de cette fournée ».
  if (!ctx || !ctx.photosEtapes) return null;
  const photos = photosDeEtape(ctx.photos, stepId);
  if (ctx.bloque && photos.length === 0) return null;
  // Plusieurs fichiers choisis d'un coup (sélecteur, glisser-déposer, stockage
  // en ligne) : chacun devient une photo de l'étape, y compris depuis un
  // emplacement déjà rempli.
  const ajouterPlusieurs = (fichiers: File[]) => void ctx.ajouter(fichiers, stepId);
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
              className={`relative aspect-square overflow-hidden border border-dashed ${reorder.classeDepot(String(p.id))} ${
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
          {!ctx.bloque && places > 0 && <TuileAjoutPhoto key={`vide-${photos.length}`} stepId={stepId} ratio={1} />}
        </div>
      )}
      <MessagePlein stepId={stepId} />
    </div>
  );
}

// ── Vignettes d'une étape (mode Pâtisser, une étape à la fois) ─────────────

/**
 * Photos de l'étape (mode Pâtisser, une étape à la fois). Celles de la recette
 * de base (relues en direct, jamais copiées) restent de petites vignettes : un
 * clic ouvre le diaporama plein écran de `StepPhotoGallery`. Mes photos
 * s'affichent d'emblée dans l'éditeur habituel (`PhotosEtape`, JEP-431) :
 * recadrer, supprimer, réordonner et la tuile d'ajout avec ses pastilles
 * « Coller » / « Depuis… » — plus de « Gérer mes photos » à déplier.
 */
export function PhotosEtapeVignettes({
  stepId,
  photosRecette = [],
}: {
  stepId: number;
  photosRecette?: { url: string; ai_retouched?: boolean }[];
}) {
  const ctx = usePhotosFournee();
  const etapesPermises = !!ctx && ctx.photosEtapes;
  const recette = photosRecette.map((p) => ({ url: p.url, ai_retouched: p.ai_retouched, legende: 'Photo de la recette' }));
  if (!recette.length && !etapesPermises) return null;
  return (
    <div className="no-print flex flex-col gap-2">
      {recette.length > 0 && <StepPhotoGallery photos={recette} grille="grid-cols-4 sm:grid-cols-6" />}
      {etapesPermises && <PhotosEtape stepId={stepId} sansMarge />}
    </div>
  );
}
