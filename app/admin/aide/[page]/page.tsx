import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireFullAdmin } from '@/lib/auth';
import { helpBlocksForPage, helpPageLabel, isHelpPageSlug } from '@/lib/help-blocks';
import { getHelpBlocksContent } from '@/lib/help';
import { HelpBlocksManager } from '@/components/admin/HelpBlocksManager';

type PageParams = { params: Promise<{ page: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { page } = await params;
  return { title: `Blocs d'aide — ${helpPageLabel(page)} | Admin — Je pâtisse !` };
}

export default async function AdminHelpPageDetail({ params }: PageParams) {
  await requireFullAdmin(); // section admin complète, cf. « Rôles du back-office »
  const { page } = await params;
  if (!isHelpPageSlug(page)) notFound();

  const defs = helpBlocksForPage(page);
  const content = await getHelpBlocksContent(page);

  return (
    <>
      <header className="flex items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Blocs d&apos;aide — {helpPageLabel(page)}</span>
      </header>
      <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
        {defs.length === 0 ? (
          <p className="text-on-surface-variant">Aucun bloc défini pour cet écran pour le moment.</p>
        ) : (
          <HelpBlocksManager
            blocks={defs.map((d) => ({
              key: d.key,
              adminLabel: d.adminLabel,
              text: content[d.key]?.text ?? '',
              videoUrl: content[d.key]?.videoUrl ?? '',
            }))}
          />
        )}
      </main>
    </>
  );
}
