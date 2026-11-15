// Route Handler — le membre a-t-il le droit `mode_projet` ?
//
// Lue par le menu « Créer » du bouton central de la barre basse, À SON
// OUVERTURE seulement : lire ce droit dans la barre basse coûterait un appel en
// base (`mc_effective_rights`) sur chaque page de chaque membre, pour un menu
// que la plupart des pages n'ouvrent jamais. L'entrée « Créer un projet » reste
// grisée le temps de la lecture.
//
// Affichage seulement : la page `/projets/nouveau` et `POST /api/projet` gardent
// leur propre garde (`verifierAcces`). Lecture seule, sans effet : pas de
// `refusSiCompteBloque` (un compte bloqué n'atteint de toute façon que
// `/compte-suspendu`). Visiteur ou panne : `false`, jamais une erreur bloquante.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEntitlements } from '@/lib/entitlements-data';
import { canAccess } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ autorise: false }, { status: 401 });
  const droits = await getEntitlements(user.id);
  return NextResponse.json(
    { autorise: canAccess(droits, 'mode_projet') },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
