// Liste des demandes de contact (Admin → Contact, spec §11).
//
// Réservé à l'admin complet (décision retenue pour ce chantier — pas
// d'accès gestionnaire), garde propre : `requireFullAdmin()` en tête, le
// layout `/admin` laissant entrer le gestionnaire par défaut.
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { parseStatutsSelectionnes, parseTypesSelectionnes } from '@/lib/contact';
import { getContactAnomalyCounts, getContactMessages } from '@/lib/contact-admin-data';
import { ContactManager } from '@/components/admin/ContactManager';

export const metadata: Metadata = { title: 'Contact | Admin — Je pâtisse !' };

export default async function AdminContactPage({
  searchParams,
}: {
  searchParams: Promise<{ statuts?: string; types?: string }>;
}) {
  await requireFullAdmin();
  const sp = await searchParams;

  // Paramètre absent → tout coché (défaut demandé : la liste montre tout
  // tant qu'on n'a rien filtré). `parseStatutsSelectionnes`/
  // `parseTypesSelectionnes` (lib/contact.ts, pures) distinguent l'absence
  // de la sélection explicitement vide qu'écrit « Tout décocher ».
  const statuses = parseStatutsSelectionnes(sp.statuts);
  const types = parseTypesSelectionnes(sp.types);

  const [rows, anomalies] = await Promise.all([
    getContactMessages({ statuses, types }),
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
      <ContactManager rows={rows} anomalies={anomalies} currentStatuses={statuses} currentTypes={types} />
    </>
  );
}
