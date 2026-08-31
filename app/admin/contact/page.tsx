// Liste des demandes de contact (Admin → Contact, spec §11).
//
// Réservé à l'admin complet (décision retenue pour ce chantier — pas
// d'accès gestionnaire), garde propre : `requireFullAdmin()` en tête, le
// layout `/admin` laissant entrer le gestionnaire par défaut.
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { isContactStatus, isContactType } from '@/lib/contact';
import { getContactAnomalyCounts, getContactMessages } from '@/lib/contact-admin-data';
import { ContactManager } from '@/components/admin/ContactManager';

export const metadata: Metadata = { title: 'Contact | Admin — Je pâtisse !' };

export default async function AdminContactPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; type?: string }>;
}) {
  await requireFullAdmin();
  const sp = await searchParams;

  // Aucun paramètre → vue par défaut sur « À déployer » (spec §11.2) : la
  // liste de ce qui part à la prochaine mise en production. `statut=tous`
  // (chip « Tous les statuts ») lève le filtre.
  const statut = sp.statut === 'tous' ? undefined : isContactStatus(sp.statut) ? sp.statut : 'a_deployer';
  const type = isContactType(sp.type) ? sp.type : undefined;

  const [rows, anomalies] = await Promise.all([
    getContactMessages({ status: statut, type }),
    getContactAnomalyCounts(),
  ]);

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Contact</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <ContactManager rows={rows} anomalies={anomalies} currentStatus={statut} currentType={type} />
    </>
  );
}
