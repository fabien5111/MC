import type { Metadata } from 'next';
import Link from 'next/link';
import { getFicheCapRecette } from '@/lib/carnet-cap-data';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CapCarnet } from '@/components/cap/CapCarnet';

// Fiche CAP d'une recette (JEP-6, lot 1, plan gratuit) : ingrédients et
// quantités seuls, au format du carnet autorisé à l'examen. Mêmes droits de
// lecture que la fiche recette (RLS) ; jamais indexée.
export const metadata: Metadata = {
  title: 'Carnet CAP | Je pâtisse !',
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function RecetteCapPage({ params }: Params) {
  const { id } = await params;
  const fiche = await getFicheCapRecette(id);

  return (
    <>
      <Header className="no-print" />
      <main>
        {fiche ? (
          <CapCarnet
            fiches={[fiche]}
            titreEcran="Fiche pour le carnet du CAP"
            retour={{ href: `/recette/${id}`, label: 'Retour à la recette' }}
          />
        ) : (
          <div className="mx-auto max-w-[900px] px-margin-mobile py-20 text-center md:px-margin-desktop">
            <p className="mb-2 font-headline-md text-headline-md text-primary">Recette introuvable</p>
            <p className="text-on-surface-variant">Elle n&apos;existe pas ou n&apos;est pas accessible.</p>
            <Link href="/carnet" prefetch={false} className="mt-6 inline-block text-primary underline">
              Mon carnet
            </Link>
          </div>
        )}
      </main>
      <div className="no-print">
        <Footer />
        <MobileNav />
      </div>
    </>
  );
}
