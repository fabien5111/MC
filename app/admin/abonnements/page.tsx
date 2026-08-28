import type { Metadata } from 'next';
import { requireFullAdmin } from '@/lib/auth';
import { getAdminGrid } from '@/lib/plans-admin';
import { PlansManager } from '@/components/admin/PlansManager';

export const metadata: Metadata = { title: 'Plans d’abonnement | Admin — Je pâtisse !' };

// Paramétrage des plans : admin complet uniquement. Un gestionnaire modère les
// recettes et rédige le blog ; il n'a pas à toucher aux droits ni aux tarifs.
// Sans cette ligne, l'écran lui serait ouvert (cf. lib/admin-access.ts).
export default async function AdminAbonnementsPage() {
  await requireFullAdmin();
  const grid = await getAdminGrid();
  return <PlansManager grid={grid} />;
}
