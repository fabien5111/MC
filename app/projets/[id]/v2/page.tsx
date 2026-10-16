import { redirect } from 'next/navigation';

// Ancienne adresse de la version d'essai du mode projet, devenue la page
// `/projets/[id]` de tous les membres : les liens déjà distribués y mènent.
export default async function ProjetV2Redirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projets/${id}`);
}
