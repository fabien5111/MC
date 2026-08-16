import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { HELP_PAGES } from '@/lib/help-blocks';

export const metadata: Metadata = { title: "Blocs d'aide | Admin — Je pâtisse !" };

export default async function AdminHelpPage() {
  await requireFullAdmin(); // section admin complète, cf. « Rôles du back-office »

  return (
    <>
      <header className="flex items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Blocs d&apos;aide</span>
      </header>
      <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
        <p className="text-on-surface-variant mb-8 max-w-2xl">
          Un écran par page du site. Les blocs eux-mêmes (nombre, emplacement) sont définis dans le
          code ; cette section n&apos;en modifie que le contenu — texte et lien vidéo.
        </p>
        <div className="flex flex-col gap-3 max-w-xl">
          {HELP_PAGES.map((p) => (
            <Link
              key={p.slug}
              href={`/admin/aide/${p.slug}`}
              className="flex items-center justify-between px-6 py-4 bg-surface-container-lowest border border-outline-variant rounded-xl hover:border-primary transition-colors"
            >
              <span className="font-headline-md text-lg text-primary">{p.label}</span>
              <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
