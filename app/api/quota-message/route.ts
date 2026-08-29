// Route Handler — traduit un refus de quota en message éducatif.
//
// Existe pour une seule raison : `useMutation` (client) est le point de
// passage unique de toutes les écritures du site, et c'est là qu'un refus
// remonté par un trigger (`mc_enforce_stock`, `mc_enforce_project_access`)
// doit se transformer en message clair plutôt qu'en erreur Postgres brute.
// Composer ce message exige `getGrid()` et `getCurrentPlan()`
// (`lib/entitlements-data.ts`), tous deux server-only (`next/headers`) — d'où
// cette route plutôt qu'un appel direct depuis le hook.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { quotaFailure } from '@/lib/entitlements';
import { messageQuota } from '@/lib/quota-route';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: null });

  const body = await req.json().catch(() => ({}));
  const echec = quotaFailure({ message: typeof body?.raw === 'string' ? body.raw : '' });
  if (!echec || !echec.featureKey) return NextResponse.json({ message: null });

  try {
    const message = await messageQuota(user.id, echec.featureKey, echec);
    return NextResponse.json({ message });
  } catch (e) {
    console.error('quota-message:', (e as Error).message);
    return NextResponse.json({ message: null });
  }
}
