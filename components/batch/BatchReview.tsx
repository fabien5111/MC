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
import { REVIEW_COMMENT_MAX, reviewCommentRequired, validateReview } from '@/lib/reviews';
import type { MyRecipeReview } from '@/lib/reviews-data';

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
  submitLabel,
  onSubmitted,
}: {
  batchId: number;
  initialRating: number;
  initialComment: string;
  submitLabel: string;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const required = rating > 0 && reviewCommentRequired(rating);

  async function submit() {
    setError(null);
    if (rating === 0) {
      setError('Choisissez une note.');
      return;
    }
    const validation = validateReview(rating, comment);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/fournee/${batchId}/avis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { erreur?: string };
      if (!res.ok) {
        setError(data.erreur || 'Erreur lors de l’enregistrement.');
        setBusy(false);
        return;
      }
      onSubmitted();
    } catch {
      setError('Erreur réseau — réessayez.');
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

  const Card = ({ children }: { children: React.ReactNode }) => (
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

  if (justSubmitted) {
    return (
      <Card>
        <p className="text-sm text-on-surface-variant">
          Merci ! Votre avis a été transmis à la modération et apparaîtra sur la fiche recette une fois validé.
        </p>
      </Card>
    );
  }

  if (!myReview) {
    return (
      <Card>
        <ReviewForm
          batchId={batchId}
          initialRating={0}
          initialComment=""
          submitLabel="Envoyer mon avis"
          onSubmitted={() => setJustSubmitted(true)}
        />
      </Card>
    );
  }

  if (myReview.status === 'pending') {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <StarsReadOnly value={myReview.rating} />
          {myReview.content && <p className="text-sm text-on-surface whitespace-pre-line">{myReview.content}</p>}
          <p className="text-[12px] text-on-surface-variant italic mt-1">En cours de modération.</p>
        </div>
      </Card>
    );
  }

  if (myReview.status === 'approved') {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <StarsReadOnly value={myReview.rating} />
          {myReview.content && <p className="text-sm text-on-surface whitespace-pre-line">{myReview.content}</p>}
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
    <Card>
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
        submitLabel="Reproposer mon avis"
        onSubmitted={() => setJustSubmitted(true)}
      />
    </Card>
  );
}
