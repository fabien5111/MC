// Route Handler — enregistrement (POST) et retrait (DELETE) d'un appareil pour
// les notifications Web Push du membre connecté (bloc « Notifications sur cet
// appareil » de /reglages, et renouvellement automatique par le service
// worker, `pushsubscriptionchange`).
//
// C'est la SEULE porte d'écriture de `push_subscriptions` (clé service_role,
// aucune policy d'écriture) : l'abonnement fourni par le navigateur y est
// revalidé — en particulier la liste blanche des services de push
// (`lib/push.ts`), sans laquelle le serveur pourrait être amené à appeler une
// adresse arbitraire.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { lireAbonnementPush } from '@/lib/push';
import { clePubliquePush, enregistrerAbonnementPush, supprimerAbonnementPush } from '@/lib/push-data';

async function garde(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Connexion requise.' }, { status: 401 });
  // Aucune session « en tant que », même en écriture : l'appareil est celui de
  // l'administrateur, il n'a pas à recevoir les notifications du membre (ni à
  // couper les siennes).
  if (await getImpersonationContext()) {
    return NextResponse.json(
      { ok: false, message: 'Indisponible pendant une connexion « en tant que ».' },
      { status: 403 },
    );
  }
  return { userId: user.id };
}

export async function POST(req: Request) {
  const g = await garde();
  if (g instanceof NextResponse) return g;
  if (!clePubliquePush()) {
    return NextResponse.json(
      { ok: false, message: 'Les notifications sur l’appareil ne sont pas encore disponibles.' },
      { status: 503 },
    );
  }
  const abonnement = lireAbonnementPush(await req.json().catch(() => null));
  if (!abonnement) {
    return NextResponse.json({ ok: false, message: 'Abonnement de ce navigateur non reconnu.' }, { status: 400 });
  }
  try {
    const r = await enregistrerAbonnementPush(createAdminClient(), g.userId, abonnement, req.headers.get('user-agent'));
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const g = await garde();
  if (g instanceof NextResponse) return g;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.slice(0, 1000) : '';
  if (!endpoint) return NextResponse.json({ ok: false, message: 'Appareil non précisé.' }, { status: 400 });
  try {
    // Limitée aux lignes du membre : impossible de couper l'appareil d'un autre.
    await supprimerAbonnementPush(createAdminClient(), g.userId, endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 503 });
  }
}
