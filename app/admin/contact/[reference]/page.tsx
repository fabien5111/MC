// Fiche détail d'une demande de contact (spec §11.3). Réservé à l'admin
// complet.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireFullAdmin } from '@/lib/auth';
import { estReference } from '@/lib/contact';
import { getContactMessageByReference, getContactReplies, getContactStatusHistory } from '@/lib/contact-admin-data';
import { ContactDetail } from '@/components/admin/ContactDetail';

export const metadata: Metadata = { title: 'Demande de contact | Admin — Je pâtisse !' };

export default async function AdminContactDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  await requireFullAdmin();
  const { reference } = await params;
  // Forme invalide (ni saisie ni générée par cet écran) : inutile
  // d'interroger la base pour un résultat qui sera de toute façon absent.
  if (!estReference(reference)) notFound();

  const message = await getContactMessageByReference(reference);
  if (!message) notFound();

  const [replies, history] = await Promise.all([getContactReplies(message.id), getContactStatusHistory(message.id)]);

  // Construite ici : `JIRA_BASE_URL` est une variable serveur, jamais
  // exposée au navigateur — seul le lien final (public, sans secret) passe
  // au composant client.
  const jiraUrl =
    message.jira_issue_key && process.env.JIRA_BASE_URL
      ? `${process.env.JIRA_BASE_URL.replace(/\/+$/, '')}/browse/${message.jira_issue_key}`
      : null;

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">{message.reference}</span>
        <Link href="/admin/contact" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Contact
        </Link>
      </header>
      <ContactDetail message={message} replies={replies} history={history} jiraUrl={jiraUrl} />
    </>
  );
}
