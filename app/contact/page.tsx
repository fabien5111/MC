// Formulaire de contact public (spec §5.1) — accessible aux visiteurs comme
// aux membres, depuis le pied de page ou l'entrée « Signaler un problème » du
// menu Compte (qui passe `?type=bug&url=…`, l'URL d'origine du signalement).
import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ContactForm } from '@/components/ContactForm';
import { getCurrentUser } from '@/lib/auth';
import { cheminOrigineValide, isContactType } from '@/lib/contact';
import { signerOuverture } from '@/lib/contact-data';

export const metadata: Metadata = { title: 'Contact | Je pâtisse !' };

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; url?: string }>;
}) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);

  const initialType = isContactType(sp.type) ? sp.type : undefined;
  const initialPageUrl = cheminOrigineValide(sp.url);

  // Jeton anti-robot (spec §5.5.2) : émis à CHAQUE rendu de la page, signé
  // côté serveur — cf. docs/contact-jira.md et `lib/contact-data.ts`
  // `verifierOuverture`.
  const openedToken = signerOuverture(Date.now());

  // Version de l'application déployée, capturée côté serveur : purement
  // diagnostique (jointe au ticket Jira en cas de bug), jamais une preuve —
  // le champ voyage en clair jusqu'au navigateur et en revient tel quel.
  const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[640px] px-margin-mobile py-12 md:px-margin-desktop">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg">Contact</h1>
        <p className="mb-8 mt-2 text-on-surface-variant">
          Une question, une suggestion, un problème rencontré sur le site ? Écrivez-nous.
        </p>
        <ContactForm
          initialType={initialType}
          connectedEmail={user?.email ?? null}
          initialPageUrl={initialPageUrl}
          appVersion={appVersion}
          openedToken={openedToken}
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
