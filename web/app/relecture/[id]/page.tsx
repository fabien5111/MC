import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getImport, getIngredientRefNames } from '@/lib/imports';
import { getUnits } from '@/lib/profile';
import { Header } from '@/components/Header';
import { RelectureEditor } from '@/components/RelectureEditor';

export const metadata: Metadata = { title: "Relecture d'un import | Maryse Club" };

type Params = { params: Promise<{ id: string }> };

export default async function RelecturePage({ params }: Params) {
  await requireUser();
  const { id } = await params;
  const numId = Number(id);

  const [importRow, units, refs] = await Promise.all([
    Number.isFinite(numId) ? getImport(numId) : Promise.resolve(null),
    getUnits(),
    getIngredientRefNames(),
  ]);

  return (
    <>
      <Header current="/profil" />
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-12 pb-32">
        <Link
          href="/importer"
          className="flex items-center gap-2 text-on-surface-variant hover:text-primary font-label-md text-label-md mb-6 w-fit"
        >
          <span className="material-symbols-outlined">arrow_back</span> Mes imports
        </Link>

        {!importRow ? (
          <div className="text-on-surface-variant italic">
            Import introuvable (ou vous n&apos;y avez pas accès).
          </div>
        ) : (
          <RelectureEditor
            importRow={importRow}
            units={units.map((u) => u.name)}
            ingredientRefs={refs}
          />
        )}
      </main>
    </>
  );
}
