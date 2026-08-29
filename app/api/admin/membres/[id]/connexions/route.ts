// Route Handler — historique de connexion d'un membre (fiche admin).
//
// Même motif que GET /api/admin/membres/[id]/abonnement : chargé à la
// demande, pas avec la liste. Lit le journal d'audit natif de Supabase Auth
// via une RPC dédiée (cf. lib/admin.ts `getMemberLoginHistory`) — aucune
// écriture applicative, aucune table `page_views`/`login_history` créée pour
// ce besoin.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getMemberLoginHistory } from '@/lib/admin';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  const { id } = await params;
  const history = await getMemberLoginHistory(id);
  return NextResponse.json({ history });
}
