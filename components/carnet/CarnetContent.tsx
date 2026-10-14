'use client';

// Grille du carnet — un seul plan de travail filtré (cf. CarnetToolbar pour
// les pastilles). Le filtrage et le tri sont déjà faits côté serveur
// (lib/carnet.ts `applyCarnetFilters`, appliqué par app/carnet/page.tsx) :
// ce composant ne fait que rendre la liste reçue, avec un gabarit de carte
// différent selon la provenance de chaque élément (README « Mon carnet » —
// mes recettes portent statut/actions, les recettes des autres portent
// auteur/note, jamais les deux).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useCarnetTransition } from '@/components/carnet/CarnetProvider';
import { MineCard, OtherCard, retirerPartage, supprimerRecette } from '@/components/carnet/CarnetCards';
import type { CarnetItem } from '@/lib/carnet';
import type { AllergenRef } from '@/lib/recipes';

// Délai avant d'afficher le fouet pour une navigation de tri/recherche : un
// rafraîchissement quasi instantané ne doit pas produire de clignotement —
// même délai que NavigationSpinner et SearchResults.
const NAV_SHOW_DELAY_MS = 120;

// Cartes affichées initialement, puis révélées par tranches via « Charger
// plus » — jeu déjà entièrement chargé côté serveur (cf. lib/carnet.ts), donc
// une simple limite d'affichage côté client : aucune requête supplémentaire.
// Sert à alléger le premier rendu d'un carnet fourni (les photos sont des
// data-URL décodées en une fois). `key={queryString}` sur ce composant
// (app/carnet/page.tsx) réinitialise ce compteur à chaque changement de
// filtre/tri, sans le remettre à zéro sur un simple rafraîchissement après
// suppression ou révocation.
const PAGE_SIZE = 15;

export function CarnetContent({
  items,
  favIds,
  importsEnAttente,
  emptyMessage,
  defaultPhoto = null,
  allergenRefs,
}: {
  items: CarnetItem[];
  favIds: string[];
  importsEnAttente: number;
  emptyMessage: string;
  // Photo « site_settings.recipe_default_photo » (cf. RecipeCardLayout).
  defaultPhoto?: string | null;
  // Table de référence des allergènes (pictos), chargée une seule fois par
  // app/carnet/page.tsx — jamais dupliquée par recette (cf. lib/recipes.ts
  // withAllergenNames). Résolue au rendu par MineCard/OtherCard.
  allergenRefs: AllergenRef[];
}) {
  const { mutate, busy } = useMutation();
  const { pending: navPending } = useCarnetTransition();
  const [navVisible, setNavVisible] = useState(false);
  useEffect(() => {
    if (!navPending) {
      setNavVisible(false);
      return;
    }
    const timer = setTimeout(() => setNavVisible(true), NAV_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [navPending]);

  // Suppression optimiste : un simple ensemble d'ids retirés cette session,
  // superposé au rendu — jamais une copie de `items` en état local. Une copie
  // (`useState(items)` + resynchro par effet) peut masquer des props pourtant
  // à jour si un rendu intermédiaire est manqué ; un filtre posé sur les
  // props reçues ne peut, par construction, jamais afficher autre chose que
  // ce que le serveur vient d'envoyer.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const list = items.filter((i) => !removedIds.has(i.recipe.id));

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = list.slice(0, visibleCount);

  async function delRecipe(id: string, title: string) {
    if (await supprimerRecette(mutate, id, title)) setRemovedIds((prev) => new Set(prev).add(id));
  }

  // Un partage « via le carnet » couvre toutes les recettes de son auteur, pas
  // seulement celle de la carte cliquée : le retirer les fait toutes disparaître
  // de ce scope au prochain rendu serveur (`mutate` resynchronise), `removedIds`
  // ne masque ici que la carte cliquée en attendant.
  async function revokeShare(item: Extract<CarnetItem, { kind: 'other' }>) {
    if (await retirerPartage(mutate, item)) setRemovedIds((prev) => new Set(prev).add(item.recipe.id));
  }

  return (
    <>
      <LoadingOverlay visible={busy || navVisible} label="Traitement en cours…" />

      {importsEnAttente > 0 && (
        <Link
          href="/importer"
          prefetch={false}
          className="mt-6 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 transition-colors hover:border-primary"
        >
          <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
            inbox
          </span>
          <span className="font-body-md text-sm text-on-surface">
            {importsEnAttente} import{importsEnAttente > 1 ? 's' : ''} en attente de relecture — un import n&apos;entre
            au carnet qu&apos;une fois relu.
          </span>
          <span className="material-symbols-outlined ml-auto text-[20px] text-on-surface-variant" aria-hidden>
            chevron_right
          </span>
        </Link>
      )}

      {list.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-8 py-8 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) =>
              item.kind === 'mine' ? (
                <MineCard
                  key={item.recipe.id}
                  item={item}
                  favIds={favIds}
                  onDelete={delRecipe}
                  defaultPhoto={defaultPhoto}
                  allergenRefs={allergenRefs}
                />
              ) : (
                <OtherCard
                  key={item.recipe.id}
                  item={item}
                  favIds={favIds}
                  onRevokeShare={revokeShare}
                  defaultPhoto={defaultPhoto}
                  allergenRefs={allergenRefs}
                />
              ),
            )}
          </div>
          {list.length > visibleCount && (
            <div className="pb-8 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded-full border-2 border-primary px-12 py-3.5 font-label-md text-[12.5px] uppercase tracking-[0.18em] text-primary transition-all hover:bg-primary hover:text-on-primary active:scale-95"
              >
                Charger plus
              </button>
              <p className="mt-3 text-[12px] text-outline">
                {visible.length} recette{visible.length > 1 ? 's' : ''} sur {list.length}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="py-16 text-center italic text-on-surface-variant">{emptyMessage}</p>
      )}
    </>
  );
}
