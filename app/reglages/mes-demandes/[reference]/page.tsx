// Fiche de suivi d'une demande de contact, côté membre (lecture seule).
// Contrepartie de `/admin/contact/[reference]` pour le demandeur lui-même.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { estReference } from '@/lib/contact';
import { getMaDemande, getMesPhotos, getMesReponses, getMonHistoriqueStatuts } from '@/lib/contact-member-data';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { MaDemandeDetail } from '@/components/profile/MaDemandeDetail';

export const metadata: Metadata = { title: 'Ma demande | Je pâtisse !', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MaDemandePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const user = await requireUser(`/reglages/mes-demandes/${reference}`);
  // Forme invalide : inutile d'interroger la base pour un résultat qui sera
  // de toute façon absent (même garde que la fiche admin).
  if (!estReference(reference)) notFound();

  const message = await getMaDemande(user.id, reference);
  if (!message) notFound();

  const [replies, history, photos] = await Promise.all([
    getMesReponses(message.id),
    getMonHistoriqueStatuts(message.id),
    getMesPhotos(message.id),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[880px] px-margin-mobile md:px-margin-desktop">
        <div className="pb-6 pt-12">
          <Link href="/reglages" className="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors">
            ← Réglages du compte
          </Link>
        </div>
        <MaDemandeDetail message={message} replies={replies} history={history} photos={photos} />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
