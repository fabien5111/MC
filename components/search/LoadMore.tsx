'use client';

// Pagination « Charger plus ». Le nombre de cartes affichées vit dans l'URL
// (paramètre `n`) : la page entière reste rendue par le serveur, ce qui garde
// les bandeaux publicitaires et les pictos d'allergènes au bon endroit sans
// dupliquer la grille côté client.
//
// `n` repart de zéro à tout changement de critère ou de tri (cf. `update` du
// SearchProvider) : on ne concatène jamais deux jeux de critères.
import { useSearch } from '@/components/search/SearchProvider';

export function LoadMore({ shown, total }: { shown: number; total: number }) {
  const { showMore, pending } = useSearch();

  if (shown >= total) return null;

  return (
    <div className="mt-10 text-center">
      <button
        type="button"
        onClick={showMore}
        disabled={pending}
        className="border-2 border-primary text-primary px-12 py-3.5 rounded-full font-label-md text-[12.5px] uppercase tracking-[0.18em] hover:bg-primary hover:text-on-primary transition-all active:scale-95 disabled:opacity-60"
      >
        Charger plus
      </button>
      <p className="text-[12px] text-outline mt-3">
        {shown} recette{shown > 1 ? 's' : ''} sur {total}
      </p>
    </div>
  );
}
