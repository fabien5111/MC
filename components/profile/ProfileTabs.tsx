'use client';

// Onglets du profil (porté de profil.html) : carnet, favoris, planning,
// listes de courses, messagerie. Bascule d'onglet synchronisée avec le hash.
// Suppressions via le client Supabase navigateur puis router.refresh().
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/format';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import type { FavoriteRow, PlanningRow, ShoppingListSummary } from '@/lib/profile';

export type UserRecipe = {
  id: string;
  title: string;
  description: string | null;
  hero_image_url: string | null;
  status: string;
  is_public: boolean;
  rating_avg: number | null;
  created_at: string;
};

type TabKey = 'recipes' | 'favorites' | 'planning' | 'courses' | 'messaging';

const STATUS: Record<string, { label: string; badge: string }> = {
  published: { label: 'Publiée', badge: 'bg-primary/90' },
  pending: { label: 'En attente', badge: 'bg-secondary/90' },
  draft: { label: 'Brouillon', badge: 'bg-secondary/90' },
  rejected: { label: 'Publication refusée', badge: 'bg-error/90' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'recipes', label: 'Mon Carnet de Recettes' },
  { key: 'favorites', label: 'Mes Favoris' },
  { key: 'planning', label: 'Planning' },
  { key: 'courses', label: 'Listes de courses' },
  { key: 'messaging', label: 'Messagerie' },
];

export function ProfileTabs({
  recipes,
  favorites,
  planning,
  shoppingLists,
  favIds,
}: {
  recipes: UserRecipe[];
  favorites: FavoriteRow[];
  planning: PlanningRow[];
  shoppingLists: ShoppingListSummary[];
  favIds: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('recipes');

  useEffect(() => {
    const fromHash = () => {
      const h = location.hash;
      if (h === '#planning') setTab('planning');
      else if (h.startsWith('#courses')) setTab('courses');
      else if (h === '' || h === '#') setTab('recipes');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function switchTab(k: TabKey) {
    setTab(k);
    const hash = k === 'planning' ? '#planning' : k === 'courses' ? '#courses' : ' ';
    history.replaceState(null, '', hash === ' ' ? location.pathname : hash);
  }

  async function del(table: 'recipes' | 'planning' | 'shopping_lists', id: string | number, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    const supabase = createClient();
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      alert('Erreur : ' + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-16">
      <div className="flex border-b border-outline-variant overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-6 py-4 font-label-md whitespace-nowrap ${
              tab === t.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Carnet */}
      {tab === 'recipes' && (
        <div className="py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {recipes.map((r) => {
            const st = STATUS[r.status] || STATUS.draft;
            return (
              <div
                key={r.id}
                className="group relative bg-surface-container-lowest border border-outline-variant p-2 rounded-lg hover:shadow-lg transition-all duration-300"
              >
                <Link href={`/recette/${r.id}`} className="aspect-[4/3] overflow-hidden rounded-md relative block">
                  {r.hero_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                    <img src={r.hero_image_url} alt={r.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-surface-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant">cake</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-10">
                    <span className={`${st.badge} text-white text-[10px] font-label-md px-2 py-1 rounded`}>
                      {st.label}
                    </span>
                    <span className="bg-white/90 text-primary text-[10px] font-label-md px-2 py-1 rounded">
                      {r.is_public === false ? 'Privée' : 'Publique'}
                    </span>
                  </div>
                </Link>
                <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} />
                <div className="p-4">
                  <Link href={`/recette/${r.id}`}>
                    <h3 className="font-headline-md text-[20px] text-primary mb-2">{r.title}</h3>
                  </Link>
                  {r.description && (
                    <p className="text-sm text-on-surface-variant line-clamp-2 mb-2">{r.description}</p>
                  )}
                  <div className="flex justify-between items-center border-t border-outline-variant/30 pt-4 mt-2">
                    <span className="text-[12px] font-label-md text-on-surface-variant">
                      {formatDate(r.created_at)}
                      {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link href={`/creer?id=${r.id}`} title="Modifier" className="p-1.5 rounded hover:bg-surface-container transition-colors">
                        <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
                      </Link>
                      <Link href={`/recette/${r.id}?planifier=1`} title="Planifier" className="p-1.5 rounded hover:bg-surface-container transition-colors">
                        <span className="material-symbols-outlined text-primary text-[20px]">calendar_today</span>
                      </Link>
                      <button
                        type="button"
                        title="Supprimer"
                        onClick={() => del('recipes', r.id, `Supprimer « ${r.title} » ?\nCette action est définitive.`)}
                        className="p-1.5 rounded hover:bg-error/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-error text-[20px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <Link
            href="/creer"
            className="group border border-dashed border-outline-variant rounded-lg flex flex-col items-center justify-center gap-3 text-on-surface-variant hover:text-primary hover:border-primary transition-colors min-h-[260px]"
          >
            <span className="material-symbols-outlined text-[40px]">add_circle</span>
            <span className="font-label-md text-label-md">Créer une recette</span>
          </Link>
          <Link
            href="/importer"
            className="group border border-dashed border-outline-variant rounded-lg flex flex-col items-center justify-center gap-3 text-on-surface-variant hover:text-primary hover:border-primary transition-colors min-h-[260px]"
          >
            <span className="material-symbols-outlined text-[40px]">download</span>
            <span className="font-label-md text-label-md">Importer une recette</span>
          </Link>
        </div>
      )}

      {/* Favoris */}
      {tab === 'favorites' && (
        <div className="py-10">
          {favorites.filter((f) => f.recipes).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {favorites
                .filter((f) => f.recipes)
                .map((f) => {
                  const r = f.recipes!;
                  return (
                    <div
                      key={r.id}
                      className="group relative bg-surface-container-lowest border border-outline-variant p-2 rounded-lg hover:shadow-lg transition-all duration-300"
                    >
                      <Link href={`/recette/${r.id}`} className="block">
                        <div className="aspect-[4/3] overflow-hidden rounded-md relative">
                          {r.hero_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                            <img src={r.hero_image_url} alt={r.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-surface-container flex items-center justify-center">
                              <span className="material-symbols-outlined text-4xl text-on-surface-variant">cake</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <h3 className="font-headline-md text-[20px] text-primary mb-1">{r.title}</h3>
                          {r.description && (
                            <p className="text-sm text-on-surface-variant line-clamp-2 mb-1">{r.description}</p>
                          )}
                          <span className="text-[12px] font-label-md text-on-surface-variant">
                            {r.profiles?.full_name || ''}
                            {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
                          </span>
                        </div>
                      </Link>
                      <FavoriteHeart recipeId={r.id} initialFav={true} />
                      <Link
                        href={`/recette/${r.id}?planifier=1`}
                        title="Planifier cette recette"
                        className="absolute top-3 right-14 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
                      >
                        <span className="material-symbols-outlined text-[20px] text-primary">calendar_today</span>
                      </Link>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-4 block">
                star_outline
              </span>
              <h2 className="font-headline-md text-primary">Vos coups de cœur</h2>
              <p className="font-body-md text-on-surface-variant max-w-sm mx-auto mt-2">
                Retrouvez ici toutes les recettes que vous avez marquées comme favorites.
              </p>
              <Link
                href="/"
                className="inline-block mt-6 border border-primary text-primary px-6 py-2 rounded-full font-label-md text-label-md hover:bg-primary hover:text-white transition-all"
              >
                Explorer les recettes
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Planning */}
      {tab === 'planning' && (
        <div className="py-10">
          <h2 className="font-headline-md text-primary mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined">calendar_month</span> Recettes planifiées
          </h2>
          {planning.length > 0 ? (
            <div className="space-y-4 max-w-3xl">
              {planning.map((p) => {
                const meta = [
                  p.planned_date
                    ? 'Prévu pour ' +
                      new Date(p.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    : '',
                  p.adjust_label || '',
                  p.factor && Number(p.factor) !== 1 ? '× ' + String(Number(p.factor)).replace('.', ',') : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <div
                    key={p.id}
                    className="p-6 border border-outline-variant rounded-lg bg-white flex justify-between items-center group hover:bg-surface-container transition-colors"
                  >
                    <Link
                      href={`/recette/${p.recipes?.id || p.recipe_id}?plan=${p.id}`}
                      className="flex gap-4 items-center"
                    >
                      <div className="w-16 h-16 rounded bg-surface-container-high overflow-hidden flex items-center justify-center shrink-0">
                        {p.recipes?.hero_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                          <img src={p.recipes.hero_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-on-surface-variant">cake</span>
                        )}
                      </div>
                      <div>
                        <p className="font-label-md text-primary">{p.recipes?.title || ''}</p>
                        <p className="font-body-md text-[12px] text-on-surface-variant">{meta}</p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      title="Retirer du planning"
                      onClick={() => del('planning', p.id, 'Retirer cette recette du planning ?')}
                      className="text-error opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-error/10"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-on-surface-variant italic">
              Aucune recette planifiée pour le moment. Ouvrez une recette et cliquez sur « Planifier ».
            </p>
          )}
        </div>
      )}

      {/* Listes de courses */}
      {tab === 'courses' && (
        <div className="py-10">
          <h2 className="font-headline-md text-primary mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined">shopping_bag</span> Mes listes de courses
          </h2>
          {shoppingLists.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse bg-white border border-outline-variant rounded-lg overflow-hidden">
                <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
                  <tr>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs">Nom</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs text-center">Articles</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs text-center">Cochés</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs">Créée le</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
                  {shoppingLists.map((l) => {
                    const items = l.shopping_list_items || [];
                    const done = items.filter((i) => i.checked).length;
                    return (
                      <tr key={l.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-6 py-4">
                          <Link
                            href={`/courses/${l.id}`}
                            className="font-label-md text-primary hover:underline flex items-center gap-2 text-left"
                          >
                            <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                            {l.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-center text-on-surface-variant">{items.length}</td>
                        <td className="px-6 py-4 text-center text-on-surface-variant">{done}</td>
                        <td className="px-6 py-4 text-on-surface-variant">
                          {l.created_at ? formatDate(l.created_at) : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            title="Supprimer la liste"
                            onClick={() => del('shopping_lists', l.id, `Supprimer la liste « ${l.name} » ?`)}
                            className="p-1.5 rounded text-error hover:bg-error/10 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-on-surface-variant italic text-sm">
              Aucune liste de courses. Depuis une recette, cliquez sur « Liste de courses » dans la liste
              complète des ingrédients.
            </p>
          )}
        </div>
      )}

      {/* Messagerie (maquette statique, comme la version vanilla — aucune donnée réelle) */}
      {tab === 'messaging' && (
        <div className="py-10">
          <div className="flex h-[600px] border border-outline-variant rounded-xl overflow-hidden bg-white shadow-sm">
            <aside className="w-20 md:w-64 border-r border-outline-variant bg-surface-container-lowest flex flex-col">
              <div className="p-4 md:p-6 border-b border-outline-variant">
                <button className="w-full bg-primary text-on-primary py-3 rounded-lg font-label-md flex justify-center items-center gap-2 hover:opacity-90 transition-all">
                  <span className="material-symbols-outlined text-[20px]">edit_square</span> <span className="hidden md:inline">Nouveau</span>
                </button>
              </div>
              <nav className="flex-1 py-4">
                <a className="flex items-center gap-3 px-6 py-3 bg-surface-container-high text-primary border-r-4 border-primary" href="#">
                  <span className="material-symbols-outlined">inbox</span> <span className="hidden md:inline font-label-md">Boîte de réception</span>
                </a>
                <a className="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="#">
                  <span className="material-symbols-outlined">send</span> <span className="hidden md:inline font-label-md">Envoyés</span>
                </a>
                <a className="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="#">
                  <span className="material-symbols-outlined">delete</span> <span className="hidden md:inline font-label-md">Corbeille</span>
                </a>
              </nav>
            </aside>
            <div className="hidden md:flex flex-col w-80 border-r border-outline-variant">
              <div className="p-4 border-b border-outline-variant">
                <input className="w-full bg-surface-container-low border-none rounded-lg py-2 px-4 text-body-md focus:ring-1 focus:ring-primary" placeholder="Rechercher un message..." type="text" />
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 border-b border-outline-variant/30 bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-label-md text-primary">Lucas Bernard</p>
                    <span className="text-[10px] text-on-surface-variant">14:30</span>
                  </div>
                  <p className="font-label-md text-[13px] text-on-surface truncate">Question sur la meringue italienne</p>
                  <p className="text-[12px] text-on-surface-variant line-clamp-2 mt-1">
                    Bonjour Camille, j&apos;ai essayé votre recette de tartelette mais ma meringue...
                  </p>
                </div>
                <div className="p-4 border-b border-outline-variant/30 cursor-pointer hover:bg-surface-container transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-label-md text-primary">Sophie Durand</p>
                    <span className="text-[10px] text-on-surface-variant">Hier</span>
                  </div>
                  <p className="font-label-md text-[13px] text-on-surface truncate">Collaboration Printemps</p>
                  <p className="text-[12px] text-on-surface-variant line-clamp-2 mt-1">
                    Nous aimerions vous proposer une collaboration pour le prochain numéro...
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col bg-white">
              <div className="p-6 border-b border-outline-variant flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container overflow-hidden flex items-center justify-center text-on-surface-variant font-label-md text-sm">
                    LB
                  </div>
                  <div>
                    <p className="font-label-md text-primary leading-tight">Lucas Bernard</p>
                    <p className="text-[12px] text-on-surface-variant">lucas.bernard@exemple.com</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button className="material-symbols-outlined text-on-surface-variant hover:text-primary">reply</button>
                  <button className="material-symbols-outlined text-on-surface-variant hover:text-primary">archive</button>
                  <button className="material-symbols-outlined text-on-surface-variant hover:text-primary">more_vert</button>
                </div>
              </div>
              <div className="flex-1 p-8 overflow-y-auto">
                <h4 className="font-headline-md text-[22px] text-primary mb-6">Question sur la meringue italienne</h4>
                <div className="font-body-md text-on-surface leading-relaxed space-y-4">
                  <p>Bonjour Camille,</p>
                  <p>
                    J&apos;ai essayé votre recette de tartelette à la framboise ce week-end. Le résultat était délicieux mais j&apos;ai
                    rencontré une petite difficulté avec la meringue italienne : elle ne semblait pas tenir sa forme aussi bien que
                    sur vos photos.
                  </p>
                  <p>Auriez-vous un conseil sur la température exacte du sirop de sucre ? J&apos;ai visé 118°C mais peut-être devrais-je monter un peu plus haut ?</p>
                  <p>Merci pour vos partages inspirants !</p>
                  <p>
                    Bien cordialement,
                    <br />
                    Lucas
                  </p>
                </div>
              </div>
              <div className="p-6 border-t border-outline-variant">
                <div className="relative">
                  <textarea className="w-full border-none bg-surface-container-low rounded-lg p-4 font-body-md focus:ring-1 focus:ring-primary resize-none h-24" placeholder="Répondre à Lucas..." />
                  <button className="absolute bottom-4 right-4 bg-primary text-on-primary px-6 py-2 rounded-lg font-label-md hover:opacity-90 transition-all active:scale-95 shadow-sm">
                    Envoyer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
