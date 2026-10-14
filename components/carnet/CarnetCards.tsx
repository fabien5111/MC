'use client';

// Cartes du carnet, partagées avec l'écran de recherche : une recherche doit
// montrer une recette du carnet avec les mêmes étiquettes et les mêmes gestes
// que le carnet lui-même — jamais la carte « publique » d'une recette qui ne
// l'est pas (brouillon, privée, partagée avec soi…).
//
//  - `MineCard`  : mes recettes — statut, Privée/Publique, fournée, édition,
//    favori, suppression ; un projet en cours renvoie au parcours guidé.
//  - `OtherCard` : recettes d'un autre (favori, abonnement, partage) — auteur,
//    note, et retrait d'un partage reçu.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { useMutation } from '@/lib/use-mutation';
import { formatDate, formatTime } from '@/lib/format';
import { effectiveTimes, matchAllergenPictos } from '@/lib/recipe-view';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { MaryseIcon } from '@/components/MaryseIcon';
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { PlanBadgeIcon } from '@/components/recipe/PlanBadgeIcon';
import { isProjectDraft } from '@/lib/projects';
import type { CarnetItem } from '@/lib/carnet';
import type { AllergenRef } from '@/lib/recipes';

type Mutate = ReturnType<typeof useMutation>['mutate'];

export const STATUS: Record<string, { label: string; badge: string }> = {
  published: { label: 'Publiée', badge: 'bg-green-700' },
  pending: { label: 'En attente', badge: 'bg-secondary/90' },
  draft: { label: 'Brouillon', badge: 'bg-secondary/90' },
  rejected: { label: 'Refusée', badge: 'bg-error/90' },
};

// Suppression d'une recette du carnet. Renvoie vrai si elle a eu lieu : à
// l'appelant de masquer la carte en attendant le rendu serveur.
export async function supprimerRecette(mutate: Mutate, id: string, title: string): Promise<boolean> {
  return mutate(() => createClient().from('recipes').delete().eq('id', id), {
    confirm: `Supprimer « ${title} » ?\nCette action est définitive.`,
  });
}

// Retrait d'un partage reçu, par son destinataire (RLS `shared_with_id =
// auth.uid()` en DELETE — cf. lib/shares.ts).
export async function retirerPartage(mutate: Mutate, item: Extract<CarnetItem, { kind: 'other' }>): Promise<boolean> {
  if (!item.shared) return false;
  const via = item.shared;
  const r = item.recipe;
  const confirmMsg =
    via.kind === 'book'
      ? `Retirer l’accès à tout le carnet partagé par ${r.profiles?.full_name || 'ce membre'} ?\nVous perdrez l’accès à toutes ses recettes partagées, pas seulement celle-ci.`
      : `Retirer le partage de « ${r.title} » ?`;
  return mutate(
    async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      return via.kind === 'book'
        ? supabase.from('book_shares' as never).delete().eq('owner_id', via.ownerId).eq('shared_with_id', user.id)
        : supabase.from('recipe_shares' as never).delete().eq('recipe_id', r.id).eq('shared_with_id', user.id);
    },
    { confirm: confirmMsg },
  );
}

export function MineCard({
  item,
  favIds,
  onDelete,
  defaultPhoto = null,
  allergenRefs,
}: {
  item: Extract<CarnetItem, { kind: 'mine' }>;
  favIds: string[];
  onDelete: (id: string, title: string) => void;
  defaultPhoto?: string | null;
  allergenRefs: AllergenRef[];
}) {
  const r = item.recipe;
  // Projet en cours : il ne s'ouvre pas comme une recette (sa fiche n'existe
  // pas encore — c'est le parcours guidé qui la construit), il ne se met pas
  // en favori (spec §10) et il ne se modifie pas dans l'éditeur classique,
  // qui le dissoudrait. Reste la suppression, seul geste que la spec lui
  // reconnaît (§12).
  const projet = isProjectDraft(r);
  const href = projet ? `/projets/${r.id}` : `/recette/${r.id}`;
  const st = STATUS[r.status] || STATUS.draft;
  const times = effectiveTimes(r);
  return (
    <div className="group relative border border-outline-variant bg-surface-container-lowest transition-all duration-500 hover:-translate-y-1 hover:shadow-lg">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
          {r.hero_card_url || defaultPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
            <img
              // `hero_card_url` seule, jamais la pleine définition — cf. RecipeCardLayout.
              src={r.hero_card_url || defaultPhoto!}
              alt={r.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl">cake</span>
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2">
            {projet ? (
              <span className="rounded bg-primary px-2 py-1 font-label-md text-[10px] text-on-primary">Projet en cours</span>
            ) : (
              <>
                <span className={`${st.badge} rounded px-2 py-1 font-label-md text-[10px] text-white`}>{st.label}</span>
                <span className="rounded bg-white/90 px-2 py-1 font-label-md text-[10px] text-primary">
                  {r.is_public === false ? 'Privée' : 'Publique'}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
      {/* Boutons dans une seule rangée alignée à droite : des positions fixes
          par bouton se rejoignaient sur une carte étroite, et le retrait d'un
          bouton (projet en cours) laissait un trou. Les étiquettes de statut
          sont en bas de la photo, hors de leur chemin. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {!projet && (
          <>
            <Link
              href={`/recette/${r.id}?planifier=1`}
              title="Lancer une fournée"
              prefetch={false}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
            >
              <PlanBadgeIcon />
            </Link>
            <Link
              href={`/creer?id=${r.id}`}
              title="Modifier"
              prefetch={false}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
            >
              <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
            </Link>
            <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} inline />
          </>
        )}
        <button
          type="button"
          title="Supprimer"
          onClick={() => onDelete(r.id, r.title)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
        >
          <span className="material-symbols-outlined text-[20px] text-error">delete</span>
        </button>
      </div>
      <div className="p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {(r.difficulties?.level || 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaryseIcon key={i} size={14} className={i <= (r.difficulties?.level || 0) ? 'text-primary' : 'text-outline-variant'} />
                ))}
              </span>
            )}
            {r.recipe_types?.name && (
              <span className="truncate font-label-md text-xs uppercase tracking-widest text-secondary">
                {r.recipe_types.name}
              </span>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-variant">
            {formatTime(times.total || times.prep)}
          </span>
        </div>
        <Link href={href}>
          <h3 className="mb-2 font-headline-md text-xl text-on-surface transition-colors group-hover:text-primary">
            {r.title}
          </h3>
        </Link>
        {r.description && <p className="mb-4 line-clamp-2 text-sm text-on-surface-variant">{r.description}</p>}
        <AllergenPictosView items={matchAllergenPictos(r.allergenNames, allergenRefs)} className="mb-4" iconClassName="w-6 h-6" />
        <span className="text-xs text-secondary">
          {formatDate(r.created_at)}
          {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
        </span>
      </div>
    </div>
  );
}

export function OtherCard({
  item,
  favIds,
  onRevokeShare,
  defaultPhoto = null,
  allergenRefs,
}: {
  item: Extract<CarnetItem, { kind: 'other' }>;
  favIds: string[];
  onRevokeShare: (item: Extract<CarnetItem, { kind: 'other' }>) => void;
  defaultPhoto?: string | null;
  allergenRefs: AllergenRef[];
}) {
  const r = item.recipe;
  const times = effectiveTimes(r);
  return (
    <div className="group relative border border-primary bg-surface-container-lowest transition-all duration-500 hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/recette/${r.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
          {r.hero_card_url || defaultPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
            <img
              // `hero_card_url` seule, jamais la pleine définition — cf. RecipeCardLayout.
              src={r.hero_card_url || defaultPhoto!}
              alt={r.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl">cake</span>
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2">
            {item.favorite && (
              <span className="rounded bg-white/90 px-2 py-1 font-label-md text-[10px] text-primary">Favori</span>
            )}
            {/* Statut connu seulement pour ce qui est partagé (favoris/abonnements
                ne portent que du déjà-publié) — même badge que MineCard, pour
                qu'un brouillon partagé se distingue au premier coup d'œil. Pas
                de « Partagée avec vous » à côté : le bouton de révocation
                (lien barré) ci-dessous porte déjà cette information. */}
            {item.shared && item.status && (
              <span className={`${(STATUS[item.status] || STATUS.draft).badge} rounded px-2 py-1 font-label-md text-[10px] text-white`}>
                {(STATUS[item.status] || STATUS.draft).label}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {item.shared && (
          <button
            type="button"
            title="Retirer ce partage"
            onClick={() => onRevokeShare(item)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
          >
            <span className="material-symbols-outlined text-[20px] text-error">link_off</span>
          </button>
        )}
        <Link
          href={`/recette/${r.id}?planifier=1`}
          title="Lancer une fournée"
          prefetch={false}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
        >
          <PlanBadgeIcon />
        </Link>
        <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} inline />
      </div>
      <div className="p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {(r.difficulties?.level || 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaryseIcon key={i} size={14} className={i <= (r.difficulties?.level || 0) ? 'text-primary' : 'text-outline-variant'} />
                ))}
              </span>
            )}
            {r.recipe_types?.name && (
              <span className="truncate font-label-md text-xs uppercase tracking-widest text-secondary">
                {r.recipe_types.name}
              </span>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-variant">
            {formatTime(times.total || times.prep)}
          </span>
        </div>
        <Link href={`/recette/${r.id}`}>
          <h3 className="mb-2 font-headline-md text-xl text-on-surface transition-colors group-hover:text-primary">
            {r.title}
          </h3>
        </Link>
        {r.description && <p className="mb-4 line-clamp-2 text-sm text-on-surface-variant">{r.description}</p>}
        <AllergenPictosView items={matchAllergenPictos(r.allergenNames, allergenRefs)} className="mb-4" iconClassName="w-6 h-6" />
        <span className="text-xs text-secondary">
          <Link href={`/u/${r.profiles?.username || r.author_id}`} prefetch={false} className="hover:text-primary hover:underline">
            {r.profiles?.full_name || 'Auteur'}
          </Link>
          {item.subscription && item.publishedAt ? ' · publiée le ' + formatDate(item.publishedAt) : ''}
          {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
        </span>
      </div>
    </div>
  );
}
