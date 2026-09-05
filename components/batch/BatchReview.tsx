'use client';

// Avis (note + commentaire) laissé sur la recette d'origine depuis une
// fournée terminée — cf. CLAUDE.md « Avis sur une recette ». Un seul avis
// par recette et par membre : ce composant s'affiche sur toute fournée
// terminée de cette recette tant qu'aucun avis n'existe, se retire des
// autres dès qu'un avis est déposé, et ne redevient un formulaire que sur
// la fournée d'origine, en cas de refus (avec le motif, resoumission
// possible).
import { useState } from 'react';
import Link from 'next/link';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ImageSlot } from '@/components/ImageSlot';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { REVIEW_COMMENT_MAX, REVIEW_PHOTOS_MAX, reviewCommentRequired, validateReview } from '@/lib/reviews';
import type { ReviewPhoto } from '@/lib/reviews';
import type { MyRecipeReview } from '@/lib/reviews-data';
import { resizeFilesToDataUrls } from '@/lib/images';
import { televerserImage } from '@/lib/storage-client';
import { moveAt } from '@/lib/photo-reorder';
import { usePhotoDragReorder } from '@/lib/use-photo-drag-reorder';
import { useDialog } from '@/components/Dialog';

function ReviewPhotos({ photos }: { photos: ReviewPhoto[] }) {
  if (!photos.length) return null;
  return (
    <div className="w-40">
      <StepPhotoGallery photos={photos} compact />
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className="text-[28px] leading-none text-tertiary hover:scale-110 transition-transform"
        >
          <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: n <= value ? "'FILL' 1" : "'FILL' 0" }}>
            star
          </span>
        </button>
      ))}
    </div>
  );
}

function StarsReadOnly({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="material-symbols-outlined text-[18px] text-tertiary" style={{ fontVariationSettings: value && n <= value ? "'FILL' 1" : "'FILL' 0" }}>
          star
        </span>
      ))}
    </div>
  );
}

function ReviewForm({
  batchId,
  initialRating,
  initialComment,
  initialPhotos,
  submitLabel,
  onSubmitted,
}: {
  batchId: number;
  initialRating: number;
  initialComment: string;
  initialPhotos: ReviewPhoto[];
  submitLabel: string;
  onSubmitted: () => void;
}) {
  const dialog = useDialog();
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [photos, setPhotos] = useState<ReviewPhoto[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const required = rating > 0 && reviewCommentRequired(rating);

  function setPhotoAt(index: number, dataUrl: string) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = { url: dataUrl, ai_retouched: next[index]?.ai_retouched ?? false };
      return next.filter(Boolean);
    });
  }

  function setPhotoAiRetouchedAt(index: number, value: boolean) {
    setPhotos((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], ai_retouched: value };
      return next;
    });
  }

  function clearPhotoAt(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  // Ajout de plusieurs photos en une fois, dans la limite des emplacements
  // encore libres (REVIEW_PHOTOS_MAX au total).
  async function addPhotosMulti(allFiles: File[]) {
    const room = REVIEW_PHOTOS_MAX - photos.length;
    if (room <= 0) return;
    const files = allFiles.slice(0, room);
    const { urls, rejected } = await resizeFilesToDataUrls(files, 1400, 'image/jpeg');
    if (rejected) await dialog.alert(`${rejected} fichier${rejected > 1 ? 's' : ''} ignoré${rejected > 1 ? 's' : ''} (format non supporté).`);
    if (!urls.length) return;
    setPhotos((prev) => [...prev, ...urls.map((url) => ({ url, ai_retouched: false }))].slice(0, REVIEW_PHOTOS_MAX));
  }

  const photoReorder = usePhotoDragReorder((from, to) => {
    const f = Number(from);
    const t = Number(to);
    if (Number.isNaN(f) || Number.isNaN(t)) return;
    setPhotos((prev) => moveAt(prev, f, t));
  });

  async function submit() {
    setError(null);
    if (rating === 0) {
      setError('Choisissez une note.');
      return;
    }
    const validation = validateReview(rating, comment, photos);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    try {
      // Déposées avant l'envoi du formulaire, jamais dans le corps JSON de la
      // route : `submitOrUpdateReview` écrit avec la clé service_role sans
      // jamais voir les octets d'une image (§ 7.5, lot B2, même doctrine que
      // le § 3 — dépôt direct navigateur → bucket).
      const photosDeposees = await Promise.all(
        photos.map(async (p) => ({ ...p, url: await televerserImage('avis', p.url) })),
      );
      const res = await fetch(`/api/fournee/${batchId}/avis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim(), photos: photosDeposees }),
      });
      const data = (await res.json().catch(() => ({}))) as { erreur?: string };
      if (!res.ok) {
        setError(data.erreur || 'Erreur lors de l’enregistrement.');
        setBusy(false);
        return;
      }
      onSubmitted();
    } catch (e) {
      setError((e as Error).message || 'Erreur réseau — réessayez.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <LoadingOverlay visible={busy} label="Envoi de votre avis…" />
      <StarPicker value={rating} onChange={setRating} />
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
          rows={3}
          placeholder={required ? 'Dites-nous ce qui n’a pas fonctionné…' : 'Un commentaire à ajouter ? (facultatif)'}
          className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 text-[14px] text-on-surface placeholder:text-outline/70 focus:border-primary focus:outline-none resize-none"
        />
        <p className="text-[12px] text-outline mt-1 text-right">
          {comment.length}/{REVIEW_COMMENT_MAX}
        </p>
      </div>
      <div>
        <p className="text-[12px] text-on-surface-variant mb-2">
          Photos (facultatif, {REVIEW_PHOTOS_MAX} maximum) — plusieurs à la fois sont acceptées.
        </p>
        <div className="flex gap-3">
          {Array.from({ length: REVIEW_PHOTOS_MAX }, (_, i) => (
            <div key={i} className="space-y-1.5" {...photoReorder.dropProps(String(i))}>
              <div
                className={`relative rounded-lg ${
                  photoReorder.overKey === String(i) ? 'ring-2 ring-primary' : ''
                } ${photos[i] ? 'cursor-grab active:cursor-grabbing' : ''}`}
                title={photos[i] ? 'Glisser pour réordonner' : undefined}
                {...(photos[i] ? photoReorder.dragProps(String(i)) : null)}
              >
                <ImageSlot
                  src={photos[i]?.url ?? null}
                  onChange={(dataUrl) => setPhotoAt(i, dataUrl)}
                  onClear={photos[i] ? () => clearPhotoAt(i) : undefined}
                  onFilesAdded={(files) => void addPhotosMulti(files)}
                  aspectRatio={16 / 9}
                  maxWidth={1400}
                  placeholder="Ajouter une photo"
                  className="w-32 h-[72px] md:w-40 md:h-[90px]"
                  aiRetouched={photos[i]?.ai_retouched ?? false}
                  promptAiRetouched
                  onAiRetouchedChange={(value) => setPhotoAiRetouchedAt(i, value)}
                />
              </div>
              {photos[i] && (
                <label className="flex items-start gap-1.5 text-[11px] leading-tight text-on-surface-variant cursor-pointer w-32 md:w-40">
                  <input
                    type="checkbox"
                    checked={photos[i].ai_retouched}
                    onChange={(e) => setPhotoAiRetouchedAt(i, e.target.checked)}
                    className="w-3.5 h-3.5 mt-0.5 rounded border-outline accent-primary cursor-pointer shrink-0"
                  />
                  Indication photo retravaillée avec l&apos;IA
                </label>
              )}
            </div>
          ))}
        </div>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || rating === 0}
          className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-label-md text-label-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
      <p className="text-[12px] text-on-surface-variant italic">
        Votre avis sera relu par la modération avant d’apparaître sur la recette.
      </p>
    </div>
  );
}

// Composant à part (portée module), jamais défini dans le corps de
// `BatchReview` : une fonction composant redéfinie à chaque rendu du parent
// change de type à chaque fois aux yeux de React, qui démonte puis remonte
// tout son contenu — ici `ReviewForm`, avec la perte de son état local
// (note, commentaire, photos) à chaque rendu de `BatchView` (ancêtre à
// l'état riche : cases à cocher des étapes, minuteurs de sauvegarde…), pas
// seulement à une action de l'utilisateur sur la carte elle-même.
function Card({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  return (
    <div id="sec-avis" className="scroll-mt-28 mb-6 p-5 bg-secondary-container/20 border border-secondary/30 rounded-xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">rate_review</span>
          Votre avis sur cette recette
        </h3>
        {/* Masquage définitif sur cette fournée seulement — une autre fournée
            terminée de la même recette continuera de proposer l'avis. */}
        <button
          type="button"
          onClick={onDismiss}
          title="Ne plus afficher pour cette fournée"
          aria-label="Ne plus afficher pour cette fournée"
          className="shrink-0 -mt-1 -mr-1 p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      {children}
    </div>
  );
}

export function BatchReview({
  batchId,
  recipeId,
  myReview,
  onDismiss,
}: {
  batchId: number;
  recipeId: string | null;
  myReview: MyRecipeReview | null;
  // « Ne plus afficher », porté par le parent : la carte se démonte aussitôt
  // l'écriture faite, une mutation déclarée ici emporterait sa transition
  // avec elle (cf. CLAUDE.md, même motif que les fenêtres modales).
  onDismiss: () => void;
}) {
  const [justSubmitted, setJustSubmitted] = useState(false);

  if (!recipeId) return null;
  // Un avis existe déjà pour cette recette, déposé depuis une AUTRE fournée
  // — le bouton ne s'affiche que sur la fournée d'origine (cf. en-tête).
  if (myReview && myReview.batch_id !== batchId) return null;

  if (justSubmitted) {
    return (
      <Card onDismiss={onDismiss}>
        <p className="text-sm text-on-surface-variant">
          Merci ! Votre avis a été transmis à la modération et apparaîtra sur la fiche recette une fois validé.
        </p>
      </Card>
    );
  }

  if (!myReview) {
    return (
      <Card onDismiss={onDismiss}>
        <ReviewForm
          batchId={batchId}
          initialRating={0}
          initialComment=""
          initialPhotos={[]}
          submitLabel="Envoyer mon avis"
          onSubmitted={() => setJustSubmitted(true)}
        />
      </Card>
    );
  }

  if (myReview.status === 'pending') {
    return (
      <Card onDismiss={onDismiss}>
        <div className="flex flex-col gap-2">
          <StarsReadOnly value={myReview.rating} />
          {myReview.content && <p className="text-sm text-on-surface whitespace-pre-line">{myReview.content}</p>}
          <ReviewPhotos photos={myReview.photo_urls} />
          <p className="text-[12px] text-on-surface-variant italic mt-1">En cours de modération.</p>
        </div>
      </Card>
    );
  }

  if (myReview.status === 'approved') {
    return (
      <Card onDismiss={onDismiss}>
        <div className="flex flex-col gap-2">
          <StarsReadOnly value={myReview.rating} />
          {myReview.content && <p className="text-sm text-on-surface whitespace-pre-line">{myReview.content}</p>}
          <ReviewPhotos photos={myReview.photo_urls} />
          <Link href={`/recette/${recipeId}#sec-commentaires`} className="text-[12px] text-primary underline underline-offset-2 mt-1">
            Voir sur la fiche recette
          </Link>
        </div>
      </Card>
    );
  }

  // `rejected` : le motif remplace l'avis initial, formulaire rouvert et
  // pré-rempli pour resoumission.
  return (
    <Card onDismiss={onDismiss}>
      <div className="mb-4 p-3 bg-error-container/40 text-on-error-container rounded-lg text-[13px] flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
        <p>
          <span className="font-semibold">Avis non publié :</span> {myReview.rejection_reason || 'motif non précisé.'}
          <br />
          Vous pouvez le corriger et le reproposer.
        </p>
      </div>
      <ReviewForm
        batchId={batchId}
        initialRating={myReview.rating || 0}
        initialComment={myReview.content}
        initialPhotos={myReview.photo_urls}
        submitLabel="Reproposer mon avis"
        onSubmitted={() => setJustSubmitted(true)}
      />
    </Card>
  );
}
