import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { getUnknownIngredients, getUnknownUtensils, getVolumeIngredientsMissingDensity, getIgnoredRefs, getListEntries } from '@/lib/admin';
import { UnknownItemsManager } from '@/components/admin/UnknownItemsManager';

export const metadata: Metadata = { title: 'Éléments inconnus | Admin — Je pâtisse !' };

export default async function AdminInconnusPage() {
  await requireFullAdmin(); // rattachement aux référentiels : admin complet
  const [ingredients, utensils, volumeMissingDensity, ignored, allergensRaw] = await Promise.all([
    getUnknownIngredients(),
    getUnknownUtensils(),
    getVolumeIngredientsMissingDensity(),
    getIgnoredRefs(),
    getListEntries('allergens', 'name'),
  ]);
  const allergens = allergensRaw as unknown as { id: number; name: string }[];

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Éléments inconnus</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <UnknownItemsManager
        ingredients={ingredients}
        utensils={utensils}
        volumeMissingDensity={volumeMissingDensity}
        ignored={ignored}
        allergens={allergens}
      />
    </>
  );
}
