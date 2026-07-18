import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getShoppingList } from '@/lib/shopping';
import { Header } from '@/components/Header';
import { ShoppingItems } from '@/components/ShoppingItems';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const list = Number.isFinite(Number(id)) ? await getShoppingList(Number(id)) : null;
  return { title: `${list?.name ?? 'Liste de courses'} | Maryse Club` };
}

export default async function CoursesPage({ params }: Params) {
  await requireUser();
  const { id } = await params;
  const list = Number.isFinite(Number(id)) ? await getShoppingList(Number(id)) : null;

  return (
    <>
      <Header current="/profil#courses" />
      <main className="max-w-[800px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <nav className="flex items-center gap-2 text-on-surface-variant font-label-md text-[12px] mb-8">
          <Link className="hover:text-primary" href="/profil#courses">
            Mes listes de courses
          </Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary">{list?.name ?? 'Liste de courses'}</span>
        </nav>

        {!list ? (
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">
            Liste introuvable
          </h1>
        ) : (
          <>
            <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8 border-b border-outline-variant pb-4">
              <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary flex items-center gap-3">
                <span className="material-symbols-outlined text-[32px]">shopping_bag</span>
                <span>{list.name}</span>
              </h1>
            </div>
            <ShoppingItems initialItems={list.shopping_list_items} />
          </>
        )}
      </main>
    </>
  );
}
