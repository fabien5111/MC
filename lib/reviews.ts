// Avis (note + commentaire) laissé sur une recette depuis une fournée
// terminée — logique PURE (validation, constantes), motif `lib/ideas.ts` /
// `lib/ideas-data.ts` : séparée de `lib/reviews-data.ts` (RPC, server-only)
// pour rester importable par le formulaire client sans tirer `next/headers`.
//
// Un seul avis par recette et par membre (cf. CLAUDE.md) : plusieurs
// fournées terminées de la même recette peuvent toutes proposer le bouton
// d'avis, mais une seule aboutit — la première déposée « verrouille » les
// autres jusqu'à suppression ou refus.

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_COMMENT_MAX = 1000;

// Photos jointes à l'avis (format paysage, compressées comme la photo
// principale d'une recette — cf. `resizeImageToDataUrl` via `ImageSlot`).
// Chacune porte son propre flag IA, même principe qu'une ligne
// `step_photos` mais compacté dans la colonne `comments.photo_urls`
// (tableau d'objets plutôt qu'un tableau de strings).
export const REVIEW_PHOTOS_MAX = 2;

export type ReviewPhoto = { url: string; ai_retouched: boolean };

// En dessous de cette note, le commentaire devient obligatoire : une note
// basse sans explication n'aide ni l'auteur de la recette ni les futurs
// lecteurs, alors qu'une bonne note se suffit à elle-même.
export const REVIEW_COMMENT_REQUIRED_BELOW = 3;

export function reviewCommentRequired(rating: number): boolean {
  return rating < REVIEW_COMMENT_REQUIRED_BELOW;
}

export type ReviewValidation = { ok: true } | { ok: false; message: string };

export function validateReview(rating: number, comment: string, photos: ReviewPhoto[] = []): ReviewValidation {
  if (!Number.isInteger(rating) || rating < REVIEW_RATING_MIN || rating > REVIEW_RATING_MAX) {
    return { ok: false, message: 'Choisissez une note de 1 à 5 étoiles.' };
  }
  const texte = comment.trim();
  if (texte.length > REVIEW_COMMENT_MAX) {
    return { ok: false, message: `Le commentaire est limité à ${REVIEW_COMMENT_MAX} caractères.` };
  }
  if (!texte && reviewCommentRequired(rating)) {
    return { ok: false, message: 'Un commentaire est requis pour une note inférieure à 3/5.' };
  }
  if (photos.length > REVIEW_PHOTOS_MAX) {
    return { ok: false, message: `${REVIEW_PHOTOS_MAX} photos maximum.` };
  }
  if (photos.some((p) => !p || typeof p.url !== 'string' || !p.url.startsWith('data:image/') || typeof p.ai_retouched !== 'boolean')) {
    return { ok: false, message: 'Photo invalide.' };
  }
  return { ok: true };
}
