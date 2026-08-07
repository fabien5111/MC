// Boîte à idées — vue principale (liste triable).
//
// Même doctrine que /recherche : l'URL est le seul état de l'écran (`tri`,
// `n`), le Server Component rend la grille, une navigation par lien remplace
// la précédente (NavigationSpinner s'en charge déjà). Pas de tiroir de
// facettes ici — un simple tri à deux valeurs ne justifie pas le mécanisme
// de SearchProvider (debounce, panneau mobile…) construit pour /recherche.
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { IdeaCard } from '@/components/ideas/IdeaCard';
import { IDEA_SORT_KEYS, IDEA_SORT_LABELS, IDEAS_PAGE_SIZE, listIdeas, parseIdeaSort } from '@/lib/ideas';

export default async function IdeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sort = parseIdeaSort(sp.tri);
  const nRaw = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const shown = Math.max(IDEAS_PAGE_SIZE, Math.round(Number(nRaw)) || IDEAS_PAGE_SIZE);

  const result = await listIdeas({ sort, limit: shown });

  return (
    <>
      <Header current="/idees" />

      <main className="max-w-[900px] mx-auto pb-24 px-margin-mobile md:px-margin-desktop">
        <section className="pt-12 pb-8">
          <h1 className="font-headline-lg text-headline-lg text-primary">Boîte à idées</h1>
          <div className="h-1 w-12 bg-secondary mt-1 mb-4" />
          <p className="text-on-surface-variant max-w-xl">
            Proposez une fonctionnalité, votez pour celles qui comptent pour vous : c&apos;est ce qui
            guide les prochains développements du site.
          </p>
        </section>

        <div className="flex items-center gap-2 mb-6">
          <span className="font-label-md text-label-md text-on-surface-variant mr-1">Trier par</span>
          {IDEA_SORT_KEYS.map((key) => (
            <Link
              key={key}
              href={`/idees?tri=${key}`}
              className={`px-4 py-1.5 rounded-full text-[13px] font-label-md transition-colors ${
                sort === key
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
              }`}
            >
              {IDEA_SORT_LABELS[key]}
            </Link>
          ))}
        </div>

        {result.error ? (
          <div className="max-w-[560px] mx-auto py-12 text-center">
            <span className="material-symbols-outlined text-[56px] text-outline-variant mb-5 block">
              error_outline
            </span>
            <h2 className="font-headline-md text-[22px] text-primary mb-2.5">
              La liste n&apos;a pas pu être chargée
            </h2>
            <p className="text-[13.5px] text-on-surface-variant leading-relaxed">Réessayez dans un instant.</p>
            {process.env.NODE_ENV !== 'production' && (
              <p className="mt-5 text-[12px] text-error font-mono break-words">{result.error}</p>
            )}
          </div>
        ) : result.ideas.length === 0 ? (
          <p className="text-on-surface-variant italic">Aucune idée pour le moment — soyez le premier à en proposer une.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {result.ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        )}

        {result.ideas.length < result.total && (
          <div className="mt-10 text-center">
            <Link
              href={`/idees?tri=${sort}&n=${shown + IDEAS_PAGE_SIZE}`}
              className="inline-block border-2 border-primary text-primary px-12 py-3.5 rounded-full font-label-md text-[12.5px] uppercase tracking-[0.18em] hover:bg-primary hover:text-on-primary transition-all active:scale-95"
            >
              Charger plus
            </Link>
            <p className="text-[12px] text-outline mt-3">
              {result.ideas.length} idée{result.ideas.length > 1 ? 's' : ''} sur {result.total}
            </p>
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </>
  );
}
