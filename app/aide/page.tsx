// Page Aide (JEP-373) : rassemble les textes des blocs d'aide, tels qu'ils sont
// saisis dans Admin → Aide. Ouverte à tous (les textes n'ont rien de privé).
//
// Contenu lu dans le cache des référentiels (`getHelpBlocksReference`). L'emplacement du
// bloc (`adminLabel`) est un repère d'administration, jamais montré.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { AideSections } from '@/components/help/AideSections';
import { getHelpBlocksReference } from '@/lib/data/reference';
import { HELP_BLOCKS, HELP_PAGES } from '@/lib/help-blocks';

export const metadata: Metadata = { title: 'Aide | Je pâtisse !' };

export default async function AidePage() {
  const contenus = await getHelpBlocksReference();
  const parCle = new Map(contenus.map((c) => [c.key, c]));

  const sections = HELP_PAGES.map((page) => ({
    ...page,
    blocs: HELP_BLOCKS.filter((b) => b.page === page.slug)
      .map((b) => ({ key: b.key, title: b.title, text: parCle.get(b.key)?.text?.trim() || null, videoUrl: parCle.get(b.key)?.video_url || null }))
      .filter((b) => b.text || b.videoUrl),
  })).filter((s) => s.blocs.length > 0);

  return (
    <>
      <Header />
      <main className="max-w-[900px] mx-auto pb-24 px-margin-mobile md:px-margin-desktop">
        <section className="pt-12 pb-8">
          <h1 className="font-headline-lg text-headline-lg text-primary">Aide</h1>
          <div className="h-1 w-12 bg-secondary mt-1 mb-4" />
          <p className="text-on-surface-variant max-w-[65ch]">
            Les conseils derrière les pictos « ? » des écrans, rassemblés au même endroit. Une question qui n&apos;est pas
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
          <AideSections sections={sections} />
        )}
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
