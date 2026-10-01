import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { getUnknownIngredients, getUnknownUtensils, getVolumeIngredientsMissingDensity, getIgnoredRefs, getListEntries } from '@/lib/admin';
import { UnknownItemsManager } from '@/components/admin/UnknownItemsManager';
import { getIngredientRefsList } from '@/lib/data/reference';
import { ingredientKey, ingredientRefDuplicates } from '@/lib/ingredient-name';

export const metadata: Metadata = { title: 'Éléments inconnus | Admin — Je pâtisse !' };

export default async function AdminInconnusPage() {
  await requireFullAdmin(); // rattachement aux référentiels : admin complet
  const [unknownIngredients, utensils, volumeMissingDensity, ignored, allergensRaw, refs] = await Promise.all([
    getUnknownIngredients(),
    getUnknownUtensils(),
    getVolumeIngredientsMissingDensity(),
    getIgnoredRefs(),
    getListEntries('allergens', 'name'),
    getIngredientRefsList(),
  ]);
  // Un nom qui ne diffère d'une référence que par le pluriel, la ligature ou
  // les accents (« jaunes d'oeufs » / « Jaune d'œuf ») est déjà rattaché par
  // l'application (`resolveIngredientRefId`, JEP-249) : le proposer à
  // « Ajouter à la référence » créerait un doublon. La RPC compare encore les
  // libellés exacts, d'où ce filtre.
  const refKeys = new Set(refs.map((r) => ingredientKey(r.name)));
  const ingredients = unknownIngredients.filter((it) => !refKeys.has(ingredientKey(it.name)));
  const refDuplicates = ingredientRefDuplicates(refs);
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
        refDuplicates={refDuplicates}
        utensils={utensils}
        volumeMissingDensity={volumeMissingDensity}
        ignored={ignored}
        allergens={allergens}
      />
    </>
  );
}
