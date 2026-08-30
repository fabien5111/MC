// Route Handler — dépôt (ou resoumission après refus) de l'avis d'une
// fournée terminée sur sa recette d'origine. cf. CLAUDE.md « Avis sur une
// recette ». Auth + garde lecture seule refaites ici, comme
// `/api/idees/verifier-doublon` : la page appelante est déjà protégée
// (`requireUser` sur /fournee/[id]), mais une route reste appelable
// directement.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { getBatch } from '@/lib/profile';
import { submitOrUpdateReview } from '@/lib/reviews-data';
import type { ReviewPhoto } from '@/lib/reviews';

export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) return NextResponse.json({ erreur: 'Session de consultation.' }, { status: 403 });

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isFinite(batchId)) return NextResponse.json({ erreur: 'Fournée introuvable.' }, { status: 404 });

  const batch = await getBatch(batchId);
  if (!batch) return NextResponse.json({ erreur: 'Fournée introuvable.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const rating = Number(body?.rating);
  const comment = typeof body?.comment === 'string' ? body.comment : '';
  const photos: ReviewPhoto[] = Array.isArray(body?.photos)
    ? body.photos
        .filter((p: unknown): p is { url: unknown; ai_retouched: unknown } => !!p && typeof p === 'object')
        .map((p: { url: unknown; ai_retouched: unknown }) => ({
          url: typeof p.url === 'string' ? p.url : '',
          ai_retouched: p.ai_retouched === true,
        }))
    : [];

  const result = await submitOrUpdateReview(batch, user.id, rating, comment, photos);
  if (!result.ok) return NextResponse.json({ erreur: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
