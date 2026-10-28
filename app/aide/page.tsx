// Page Aide (JEP-373) : rassemble les textes des blocs d'aide, tels qu'ils sont
// saisis dans Admin → Aide. Ouverte à tous (les textes n'ont rien de privé) ;
// le geste « Réafficher les aides » n'est proposé qu'à un membre connecté.
//
// Contenu lu dans le cache des référentiels (`getHelpBlocksReference`), sans
// masquage : un bloc fermé sur un écran reste lisible ici. L'emplacement du
// bloc (`adminLabel`) est un repère d'administration, jamais montré.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { AideSections } from '@/components/help/AideSections';
import { getCurrentUser } from '@/lib/auth';
import { getHelpBlocksReference } from '@/lib/data/reference';
import { getMesMasquagesAide } from '@/lib/help';
import { HELP_BLOCKS, HELP_PAGES } from '@/lib/help-blocks';
import { statutsAide } from '@/lib/help-statut';

export const metadata: Metadata = { title: 'Aide | Je pâtisse !' };

export default async function AidePage() {
  const [contenus, user] = await Promise.all([getHelpBlocksReference(), getCurrentUser()]);
  // Statut d'activation de l'aide du membre connecté, page par page (JEP-373) :
  // sur les pages qui ont du contenu seulement, celles que la page affiche.
  const masquages = user ? await getMesMasquagesAide(user.id) : null;
  const parCle = new Map(contenus.map((c) => [c.key, c]));

  const sections = HELP_PAGES.map((page) => ({
    ...page,
    blocs: HELP_BLOCKS.filter((b) => b.page === page.slug)
      .map((b) => ({ key: b.key, title: b.title, text: parCle.get(b.key)?.text?.trim() || null, videoUrl: parCle.get(b.key)?.video_url || null }))
      .filter((b) => b.text || b.videoUrl),
  })).filter((s) => s.blocs.length > 0);
  const statuts = masquages
    ? statutsAide(
        sections.map((s) => ({ slug: s.slug, keys: HELP_BLOCKS.filter((b) => b.page === s.slug).map((b) => b.key) })),
        masquages,
      )
    : undefined;

  return (
    <>
      <Header />
      <main className="max-w-[900px] mx-auto pb-24 px-margin-mobile md:px-margin-desktop">
        <section className="pt-12 pb-8">
          <h1 className="font-headline-lg text-headline-lg text-primary">Aide</h1>
          <div className="h-1 w-12 bg-secondary mt-1 mb-4" />
          <p className="text-on-surface-variant max-w-[65ch]">
            Les conseils affichés en haut de certains écrans, rassemblés au même endroit. Une question qui n&apos;est pas
            traitée ici ? Écrivez-nous par la{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2">
              page Contact
            </Link>
            .
          </p>
        </section>

        {sections.length === 0 ? (
          <p className="text-on-surface-variant italic">Les textes d&apos;aide arrivent bientôt.</p>
        ) : (
          <AideSections sections={sections} statuts={statuts} />
        )}
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
