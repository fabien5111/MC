// Mentions légales — page publique, statique (JEP-17).
//
// Identité de l'éditeur et de l'hébergeur lue dans `lib/legal.ts`, partagée
// avec la politique de confidentialité. Accessible pendant `COMING_SOON`
// (cf. `PAGES_LEGALES`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { EDITEUR, HEBERGEUR, SITE_URL_CANONIQUE } from '@/lib/legal';

export const metadata: Metadata = { title: 'Mentions légales | Je pâtisse !' };

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

function Email() {
  return (
    <a href={`mailto:${EDITEUR.email}`} className="text-primary underline underline-offset-2">
      {EDITEUR.email}
    </a>
  );
}

export default function MentionsLegalesPage() {
  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[760px] px-margin-mobile py-12 md:px-margin-desktop">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary md:text-headline-lg mb-10">
          Mentions légales
        </h1>

        <Section title="Éditeur du site">
          <p>
            Le site « Je pâtisse ! », accessible à l&apos;adresse{' '}
            <a href={SITE_URL_CANONIQUE} className="text-primary underline underline-offset-2">
              {SITE_URL_CANONIQUE.replace('https://', '')}
            </a>
            , est édité par :
          </p>
          <p>
            <strong className="text-on-surface">{EDITEUR.nom}</strong>
            <br />
            {EDITEUR.statut}, SIREN {EDITEUR.siren}
            <br />
            {EDITEUR.adresse}
            <br />
            Adresse e-mail : <Email />
            {EDITEUR.telephone && (
              <>
                <br />
                Téléphone : {EDITEUR.telephone}
              </>
            )}
          </p>
        </Section>

        <Section title="Directeur de la publication">
          <p>{EDITEUR.directeurPublication}</p>
        </Section>

        <Section title="Hébergement">
          <p>
            <strong className="text-on-surface">{HEBERGEUR.nom}</strong>
            <br />
            {HEBERGEUR.adresse}
            <br />
            Téléphone : {HEBERGEUR.telephone}
            <br />
            Numéro d&apos;immatriculation (IDE) : {HEBERGEUR.ide}
          </p>
        </Section>

        <Section title="Propriété intellectuelle">
          <p>
            L&apos;ensemble des éléments du site « Je pâtisse ! » (charte graphique, logo, textes, code source, base
            de données) est protégé par le droit de la propriété intellectuelle. Toute reproduction non autorisée est
            interdite.
          </p>
          <p>
            Les recettes et photographies publiées par les membres restent la propriété de leurs auteurs, sous réserve
            de la licence d&apos;utilisation décrite dans les{' '}
            <Link href="/cgu" className="text-primary underline underline-offset-2">
              conditions générales d&apos;utilisation
            </Link>
            .
          </p>
        </Section>

        <Section title="Données personnelles">
          <p>
            Le traitement de vos données est décrit dans notre{' '}
            <Link href="/confidentialite" className="text-primary underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Pour toute question relative au site : <Email />, ou via notre{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2">
              formulaire de contact
            </Link>
            .
          </p>
        </Section>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
