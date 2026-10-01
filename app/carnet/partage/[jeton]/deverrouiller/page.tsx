// Déverrouillage d'un carnet partagé par lien (JEP-21).
//
// Destination `next` de la connexion / inscription depuis l'aperçu : c'est
// ici que « le système associe le carnet au nouveau compte », puis renvoie
// vers « Mon carnet », onglet « Partagées avec moi ».
//
// Une page et non un Route Handler : `LoginForm` rejoint `next` par
// `router.replace` (navigation client), qui attend un rendu React — un
// Route Handler répondant par une redirection n'y serait pas suivi
// proprement. L'écriture a lieu au rendu, ce qui est sans danger ici : elle
// est idempotente (`deverrouillerCarnet`) et n'accorde au membre connecté
// que ce que le lien, qu'il détient, lui promettait déjà.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { proprietaireDuJeton } from '@/lib/book-link';
import { deverrouillerCarnet } from '@/lib/book-link-data';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export const dynamic = 'force-dynamic';

export default async function DeverrouillerCarnetPage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const ownerId = proprietaireDuJeton(jeton);
  if (!ownerId) notFound();

  const apercu = `/carnet/partage/${jeton}`;
  const user = await getCurrentUser();
  if (!user) redirect(apercu);
  if (user.id === ownerId) redirect('/carnet');
  // Session « en tant que » en lecture seule : aucune écriture, quelle que
  // soit la voie (même doctrine que `requireWritableSession`).
  if (await isReadOnlySession()) redirect(apercu);

  const { ok } = await deverrouillerCarnet(ownerId, user.id);
  if (ok) redirect('/carnet?scope=shared');

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col items-center gap-5 px-margin-mobile py-24 text-center">
        <span className="material-symbols-outlined text-[36px] text-error">error</span>
        <h1 className="font-headline-lg text-[24px] font-bold text-primary">Le carnet n’a pas pu être déverrouillé</h1>
        <p className="font-body-md text-sm text-on-surface-variant">Une erreur est survenue. Merci de réessayer dans un instant.</p>
        <Link href={apercu} className="rounded-pill bg-primary px-7 py-3 text-[13px] font-semibold text-on-primary">
          Réessayer
        </Link>
      </main>
      <Footer />
    </>
  );
}
