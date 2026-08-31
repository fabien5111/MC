// Politique de confidentialité — page publique, statique.
//
// Contenu établi à partir de ce que le code du site fait réellement (RLS,
// sous-traitants effectivement intégrés, durées de conservation codées en
// base — cf. CLAUDE.md et docs/contact-jira.md pour le détail du module
// contact). Ce n'est PAS un avis juridique : une relecture par un
// professionnel reste recommandée avant mise en production, comme le
// rappelle docs/contact-jira.md §4. Le nom légal de l'éditeur, encore un
// placeholder ci-dessous, doit être complété avant publication.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';

export const metadata: Metadata = { title: 'Confidentialité | Je pâtisse !' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-headline-md text-[20px] text-primary mb-3">{title}</h2>
      <div className="flex flex-col gap-3 font-body-md text-body-md text-on-surface-variant leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function ConfidentialitePage() {
  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[760px] px-margin-mobile py-12 md:px-margin-desktop">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg mb-2">
          Politique de confidentialité
        </h1>
        <p className="mb-10 text-[13px] text-on-surface-variant">Dernière mise à jour : 31 août 2026.</p>

        <Section title="Responsable du traitement">
          <p>
            [Nom légal de l&apos;éditeur à compléter], éditeur du site Je pâtisse !. Pour toute question relative à
            vos données, utilisez le formulaire de{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2">
              contact
            </Link>{' '}
            en choisissant le type « Mes données personnelles » — un délai de réponse d&apos;un mois s&apos;applique
            à ces demandes.
          </p>
        </Section>

        <Section title="Quelles données, et pourquoi">
          <p>
            Nous traitons les données nécessaires au fonctionnement du service : votre compte (e-mail, pseudo, photo
            de profil), les recettes et fournées que vous créez, vos favoris et avis, vos listes de courses, et les
            demandes que vous nous adressez.
          </p>
          <p>
            Un signalement, une suggestion ou une question envoyés depuis notre formulaire de contact ne servent
            qu&apos;à traiter votre demande et à y répondre. Ils sont conservés 12 mois après leur clôture (24 mois
            pour un signalement technique — le temps que le correctif soit suivi jusqu&apos;en production), hébergés
            en Europe. Un signalement technique alimente notre outil de suivi des anomalies (Jira) sous une forme
            anonymisée : ce ticket ne contient ni votre e-mail, ni votre nom, ni votre adresse IP — seul un
            identifiant technique interne y figure, jamais votre identité. Le type « Mes données personnelles » ne
            crée jamais un tel ticket. Merci de ne pas inclure d&apos;informations personnelles ou sensibles dans le
            corps de vos messages.
          </p>
          <p>
            Base légale : l&apos;exécution du service que vous nous demandez (votre compte, vos recettes) et notre
            intérêt légitime à traiter les demandes que vous nous adressez et à assurer la sécurité du site. Aucune
            case de consentement n&apos;est requise pour ces traitements, et nos e-mails liés au service (réponse à
            une demande, notification de correctif) ne sont pas des e-mails commerciaux.
          </p>
        </Section>

        <Section title="Qui reçoit ces données">
          <p>Personne d&apos;autre que l&apos;éditeur du site et les prestataires techniques suivants :</p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>
              <strong className="text-on-surface">Supabase</strong> — base de données et authentification, hébergées
              en Europe.
            </li>
            <li>
              <strong className="text-on-surface">Vercel</strong> — hébergement du site et exécution des fonctions
              serveur, en Europe.
            </li>
            <li>
              <strong className="text-on-surface">Anthropic</strong> — lecture et structuration des recettes que vous
              importez, ajustement des quantités à votre demande.
            </li>
            <li>
              <strong className="text-on-surface">Atlassian (Jira)</strong> — suivi des signalements techniques, sous
              une forme pseudonymisée (cf. ci-dessus).
            </li>
            <li>
              <strong className="text-on-surface">Notre prestataire d&apos;envoi d&apos;e-mails</strong> — pour vous
              répondre et vous notifier.
            </li>
            <li>
              <strong className="text-on-surface">Google</strong> — uniquement si vous choisissez de vous connecter
              avec un compte Google.
            </li>
          </ul>
          <p>Aucune de ces données n&apos;est vendue, ni utilisée à des fins publicitaires par un tiers.</p>
        </Section>

        <Section title="Combien de temps">
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>Votre compte et son contenu : tant qu&apos;il reste actif.</li>
            <li>Une demande de contact close : 12 mois (24 mois pour un signalement technique).</li>
            <li>L&apos;empreinte de votre adresse IP, associée à une demande de contact : 30 jours.</li>
            <li>Un ticket Jira ne contenant aucune donnée nominative : sans limite de durée.</li>
          </ul>
        </Section>

        <Section title="Vos droits">
          <p>
            Vous pouvez demander l&apos;accès à vos données, leur rectification, leur effacement, ou vous opposer à
            leur traitement, en nous écrivant via le{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2">
              formulaire de contact
            </Link>{' '}
            (type « Mes données personnelles »). Vous pouvez aussi introduire une réclamation auprès de la CNIL
            (cnil.fr) si vous estimez que vos droits ne sont pas respectés.
          </p>
        </Section>

        <Section title="Sécurité">
          <p>
            Les données sont protégées par un contrôle d&apos;accès au niveau de la base (Row Level Security) : une
            requête ne peut lire ou modifier que ce que votre session autorise. Les échanges avec le site sont
            chiffrés (HTTPS).
          </p>
        </Section>

        <p className="mt-12 text-[12px] text-on-surface-variant italic">
          Cette page décrit nos pratiques réelles au meilleur de notre connaissance. Elle peut évoluer ; la date de
          mise à jour ci-dessus fait foi.
        </p>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
