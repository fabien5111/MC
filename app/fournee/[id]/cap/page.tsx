import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getBatch } from '@/lib/profile';
import { ficheCapFournee } from '@/lib/carnet-cap';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CapCarnet } from '@/components/cap/CapCarnet';

// Fiche CAP d'une fournée (JEP-6, lot 2, plan gratuit) : les quantités
// AJUSTÉES de la fournée (« pour 8 personnes »), sur une seule colonne.
export const metadata: Metadata = { title: 'Carnet CAP | Je pâtisse !' };

type Params = { params: Promise<{ id: string }> };

export default async function FourneeCapPage({ params }: Params) {
  const { id } = await params;
  await requireUser(`/fournee/${id}/cap`);
  const batchId = Number(id);
  const batch = Number.isFinite(batchId) ? await getBatch(batchId) : null;
  if (!batch) notFound();

  return (
    <>
      <Header current="cuisine" className="no-print" />
      <main>
        <CapCarnet
          fiches={[ficheCapFournee(batch)]}
          titreEcran="Fiche pour le carnet du CAP"
          retour={{ href: `/fournee/${id}`, label: 'Retour à la fournée' }}
        />
      </main>
      <div className="no-print">
        <Footer />
        <MobileNav current="cuisine" />
      </div>
    </>
  );
}
