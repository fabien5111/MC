// Route Handler — réponse du demandeur sur sa propre demande, depuis son
// suivi (`/reglages/mes-demandes/[reference]`, lot 9). Auth + garde lecture
// seule refaites ici, comme `/api/fournee/[id]/avis` : la page appelante est
// déjà protégée (`requireUser` sur `/reglages`), mais une route reste
// appelable directement.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { estReference, validerReponseMembre } from '@/lib/contact';
import { envoyerReponseMembre } from '@/lib/contact-member-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ reference: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) return NextResponse.json({ erreur: 'Session de consultation.' }, { status: 403 });

  const { reference } = await params;
  if (!estReference(reference)) return NextResponse.json({ erreur: 'Demande introuvable.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const validation = validerReponseMembre(body?.body);
  if (!validation.ok) return NextResponse.json({ erreur: validation.error }, { status: 400 });

  try {
    const resultat = await envoyerReponseMembre(user.id, reference, validation.body);
    if (!resultat.ok) return NextResponse.json({ erreur: resultat.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}
