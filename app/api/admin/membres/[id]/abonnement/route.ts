// Route Handler — lecture de l'abonnement d'un membre pour le back-office.
//
// GET plutôt qu'une prop chargée pour toute la liste : l'écran des membres
// peut compter des centaines de lignes, et l'historique + la consommation
// (cinq comptages, cf. `getUsageReport`) ne servent qu'au moment où
// l'administrateur ouvre la fiche d'UN membre.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getMemberSubscriptionOverview } from '@/lib/subscriptions-admin';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  const { id } = await params;
  const overview = await getMemberSubscriptionOverview(id);
  return NextResponse.json(overview);
}
