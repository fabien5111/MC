import type { Metadata } from 'next';
import Link from 'next/link';
import { getRecipeFull } from '@/lib/recipes';
import { getRecipes } from '@/lib/recipes';
import { getFavoriteIds } from '@/lib/favorites';
import { getCurrentUser } from '@/lib/auth';
import { getUnits } from '@/lib/profile';
import { formatTime, formatDate } from '@/lib/format';
import { UNITS_LBL, yieldInfo, mergeIngredients, dayLabel, planningDays, moldLbl } from '@/lib/recipe-view';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { RecipeCard } from '@/components/RecipeCard';
import { FavoriteButton } from '@/components/recipe/FavoriteButton';
import { PrintButton } from '@/components/recipe/PrintButton';
import { ScaleWidget } from '@/components/recipe/ScaleWidget';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const r = await getRecipeFull(id);
  return { title: r ? `${r.title} | Maryse Club` : 'Recette | Maryse Club' };
}

export default async function RecettePage({ params }: Params) {
  const { id } = await params;
  const recipe = await getRecipeFull(id);

  if (!recipe) {
    return (
      <>
        <Header />
        <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-20 text-center">
          <p className="font-headline-md text-headline-md text-primary mb-2">Recette introuvable</p>
          <p className="text-on-surface-variant">Elle n&apos;existe pas ou n&apos;est pas accessible.</p>
        </main>
      </>
    );
  }

  const [user, favIds, units, suggestionsRaw] = await Promise.all([
    getCurrentUser(),
    getFavoriteIds(),
    getUnits(),
    getRecipes({ limit: 4 }),
  ]);
  const isOwner = !!user && recipe.author_id === user.id;
  const unitTips: Record<string, string> = {};
  units.forEach((u) => {
    if (u.tooltip) unitTips[String(u.name).toLowerCase().trim()] = u.tooltip;
  });
  const suggestions = suggestionsRaw.filter((r) => r.id !== recipe.id).slice(0, 2);

  // Rendu quantité + unité (unité survolable si infobulle définie).
  const Qty = ({ quantity, unit }: { quantity: string | number | null; unit: string | null }) => {
    const q = quantity != null && String(quantity) !== '' ? String(quantity) : '';
    const tip = unit ? unitTips[unit.toLowerCase().trim()] : undefined;
    return (
      <>
        {q}
        {q && unit ? ' ' : ''}
        {unit ? (
          tip ? (
            <span className="unit-tip" title={tip}>
              {unit}
            </span>
          ) : (
            unit
          )
        ) : null}
      </>
    );
  };

  const yInfo = yieldInfo(recipe);
  const level = recipe.difficulties?.level || 0;
  const tags = (recipe.recipe_tags || []).map((t) => t.tags?.name).filter(Boolean) as string[];
  const groups = [...(recipe.ingredient_groups || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const groupsByOrder: Record<number, (typeof groups)[number]> = {};
  groups.forEach((g) => (groupsByOrder[g.order_index || 0] = g));
  const steps = [...(recipe.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const utensils = [...(recipe.recipe_utensils || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const merged = mergeIngredients(recipe);
  const days = planningDays(steps);

  let statusBadge: { label: string; cls: string } | null = null;
  if (recipe.status === 'pending') statusBadge = { label: 'En attente de validation', cls: 'bg-secondary text-white' };
  else if (recipe.status === 'draft') statusBadge = { label: 'Brouillon', cls: 'bg-secondary text-white' };
  else if (recipe.status === 'rejected') statusBadge = { label: 'Publication refusée', cls: 'bg-error text-white' };
  else if (recipe.status === 'published' && isOwner) statusBadge = { label: 'Publiée', cls: 'bg-green-700 text-white' };

  return (
    <>
      <Header />
      <div className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop pt-6">
        <div className="flex items-center gap-2 text-on-surface-variant font-label-md text-[12px]">
          <Link className="hover:text-primary" href="/">
            Accueil
          </Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary">{recipe.title}</span>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          {/* En-tête */}
          <div className="flex flex-col gap-4 mb-8">
            <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary text-center">
              {recipe.title}
            </h1>
            <div className="flex items-center gap-4 flex-wrap">
              {statusBadge && (
                <span className={`${statusBadge.cls} px-3 py-1 font-label-md text-[10px] uppercase tracking-widest`}>
                  {statusBadge.label}
                </span>
              )}
              <span className="bg-surface-container-highest text-primary px-3 py-1 font-label-md text-[10px] uppercase tracking-widest">
                {recipe.is_public === false ? 'Privée' : 'Publique'}
              </span>
              {(recipe.rating_count || 0) > 0 && (
                <span className="flex items-center gap-1.5 font-label-md text-label-md text-primary">
                  <span className="font-bold">{Number(recipe.rating_avg || 0).toFixed(1)}/5</span>
                  <span className="text-on-surface-variant opacity-70">({recipe.rating_count})</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-on-surface-variant font-label-md text-label-md flex-wrap">
              <span className="flex items-center gap-2">
                Par{' '}
                <Link className="flex items-center gap-2 hover:text-primary transition-colors" href="/profil">
                  <span className="w-6 h-6 rounded-full overflow-hidden border border-outline-variant block bg-surface-container">
                    {recipe.profiles?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                      <img src={recipe.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </span>
                  <span className="border-b border-primary">{recipe.profiles?.full_name || 'Auteur'}</span>
                </Link>
              </span>
              <span className="w-1 h-1 bg-outline-variant rounded-full" />
              <span>
                {(recipe.status === 'published' ? 'Publié le ' : 'Créée le ') + formatDate(recipe.created_at)}
              </span>
            </div>
            <div className="mt-4 border-y border-outline-variant py-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-3 text-secondary">
                <FavoriteButton recipeId={recipe.id} initialFav={favIds.has(recipe.id)} />
                {isOwner && (
                  <Link
                    href={`/creer?id=${recipe.id}`}
                    className="flex items-center gap-2 px-3 py-1 border border-secondary rounded-full text-label-md font-label-md hover:bg-secondary-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit_note</span> Éditer
                  </Link>
                )}
                <PrintButton />
              </div>
              {tags.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {tags.map((n) => (
                    <span key={n} className="bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded-full font-label-md text-[12px]">
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {recipe.description && (
            <div className="bg-primary p-10 text-white relative overflow-hidden mb-12">
              <div className="absolute -right-10 -top-10 opacity-10">
                <span className="material-symbols-outlined text-[120px]">restaurant_menu</span>
              </div>
              <h3 className="font-headline-md text-headline-md mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined">auto_awesome</span>En quelques mots
              </h3>
              <p className="font-body-lg text-body-lg italic opacity-90 leading-relaxed">{recipe.description}</p>
            </div>
          )}

          {/* Planning de préparation */}
          {steps.length > 0 && (
            <div className="mb-12 py-10 border-y border-outline-variant">
              <h3 className="font-headline-md text-headline-md text-primary mb-8">Planning de préparation</h3>
              <div className="relative flex flex-col md:flex-row gap-8">
                <div className="hidden md:block absolute top-10 left-0 w-full h-[2px] bg-outline-variant" />
                {days.map((d, i) => (
                  <div key={i} className="relative flex flex-col items-center text-center gap-4 z-10 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                      {i + 1}
                    </div>
                    <span className="font-label-md text-[12px] text-secondary">{dayLabel(d.offset)}</span>
                    {d.items.map((t, k) => (
                      <p key={k} className="font-body-md text-body-md font-semibold">
                        {t}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hero */}
          {recipe.hero_image_url && (
            <div className="w-full aspect-[16/9] mb-12 overflow-hidden ambient-shadow border border-outline-variant">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
              <img src={recipe.hero_image_url} alt={recipe.title} className="w-full h-full object-cover" />
            </div>
          )}

          {/* Bloc technique */}
          <div className="bg-surface-container-low p-8 mb-12 space-y-8">
            <div className="flex flex-wrap justify-evenly items-start gap-y-8 gap-x-4">
              {yInfo && (
                <div className="flex flex-col gap-1 items-center text-center">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                    {yInfo.label}
                  </span>
                  <span className="font-headline-md text-headline-md text-primary">{yInfo.value}</span>
                </div>
              )}
              <div className="flex flex-col gap-1 items-center text-center">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                  Difficulté
                </span>
                <div className="flex items-center justify-center gap-2 h-8">
                  {level ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={`maryse-pill ${i <= level ? 'bg-primary' : 'bg-outline-variant'}`} />
                    ))
                  ) : (
                    <span className="text-sm text-on-surface-variant">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-4">
              {(
                [
                  ['Temps de prép', recipe.prep_time],
                  ['Cuisson', recipe.cook_time],
                  ['Attente', recipe.wait_time],
                  ['Durée totale', recipe.total_time],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="flex flex-col gap-1 items-center text-center">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                    {label}
                  </span>
                  <span className="font-body-lg text-body-lg font-bold text-primary">{v ? formatTime(v) : '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ustensiles */}
          {utensils.length > 0 && (
            <div className="mb-12">
              <h3 className="font-headline-md text-headline-md text-primary mb-6">Ustensiles nécessaires</h3>
              <ul className="grid grid-cols-1 gap-y-2 list-none">
                {utensils.map((u) => {
                  const url = u.utensils?.url || u.url;
                  return (
                    <li key={u.id} className="py-2 border-b border-outline-variant/30 font-body-md text-body-md">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                          {u.name}
                        </a>
                      ) : (
                        u.name
                      )}
                      {u.comment && <span className="text-on-surface-variant text-sm italic"> — {u.comment}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Ingrédients */}
          {groups.length > 0 && (
            <div className="mb-12">
              <h3 className="font-headline-md text-headline-md text-primary mb-8">Ingrédients</h3>
              <div className="space-y-10">
                {groups.map((g) => (
                  <div key={g.id}>
                    <h4 className="font-label-md text-label-md text-secondary border-b border-outline-variant pb-2 mb-4">
                      {g.name || ''}
                    </h4>
                    <ul style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', columnGap: 40 }}>
                      {[...(g.ingredients || [])]
                        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                        .map((it) => {
                          const url = it.ingredient_refs?.url || it.url;
                          return (
                            <li
                              key={it.id}
                              className="border-b border-outline-variant/30 py-2"
                              style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}
                            >
                              <span className="font-body-md text-body-md">
                                {url ? (
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                                    {it.name}
                                  </a>
                                ) : (
                                  it.name
                                )}
                                {it.comment && <span className="text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                              </span>
                              <span className="font-label-md text-label-md text-primary text-center">
                                <Qty quantity={it.quantity} unit={it.unit} />
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))}
              </div>

              {merged.length > 0 && (
                <details className="group border border-outline-variant mt-12">
                  <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                    <span className="font-label-md text-label-md text-primary">LISTE COMPLÈTE DES INGRÉDIENTS</span>
                    <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <div className="p-4 bg-white">
                    <ul style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', columnGap: 40 }}>
                      {merged.map((m, k) => (
                        <li key={k} className="py-1" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                          <span className="font-body-md text-body-md">{m.name}</span>
                          <span className="font-label-md text-label-md text-primary">
                            <Qty quantity={m.qty} unit={m.unit} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}

              {merged.length > 0 && (
                <ScaleWidget
                  recipeTitle={recipe.title}
                  rendement={yInfo?.value || [recipe.yield_desc, moldLbl(recipe)].filter(Boolean).join(' — ') || null}
                  ingredients={merged}
                />
              )}
            </div>
          )}

          {/* Étapes */}
          {steps.length > 0 && (
            <div className="space-y-16">
              {steps.map((s, i) => {
                const grp = groupsByOrder[s.order_index || 0];
                const ings = grp ? [...(grp.ingredients || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) : [];
                const photos = [...(s.step_photos || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                const stepTotal = (s.prep_time || 0) + (s.wait_time || 0) + (s.cook_time || 0);
                const badges: string[] = [
                  dayLabel(s.day_offset),
                  s.prep_time ? `PRÉP ${formatTime(s.prep_time).toUpperCase()}` : '',
                  s.wait_time ? `ATTENTE ${formatTime(s.wait_time).toUpperCase()}` : '',
                  s.cook_time
                    ? `CUISSON ${formatTime(s.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}`
                    : s.cook_temp
                      ? `CUISSON ${s.cook_temp} °C`
                      : '',
                ].filter(Boolean);
                return (
                  <div key={s.id} className={`flex flex-col gap-6${i < steps.length - 1 ? ' pb-14 border-b-2 border-outline-variant' : ''}`}>
                    <div className="flex items-center justify-between border-b border-outline pb-4 flex-wrap gap-3">
                      <h4 className="font-headline-md text-headline-md text-primary">
                        {i + 1}. {s.title || 'Étape ' + (i + 1)}
                      </h4>
                      <div className="flex gap-4 text-on-surface-variant font-label-md text-[12px] flex-wrap">
                        {badges.map((b, k) => (
                          <span key={k} className="bg-surface-variant px-3 py-1">
                            {b}
                          </span>
                        ))}
                        {stepTotal > 0 && (
                          <span className="bg-primary text-white px-3 py-1">TOTAL {formatTime(stepTotal).toUpperCase()}</span>
                        )}
                      </div>
                    </div>
                    {ings.length > 0 && (
                      <details className="group border border-outline-variant mb-2" open>
                        <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                          <span className="font-label-md text-label-md text-primary">Ingrédients de l&apos;étape</span>
                          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="p-4 bg-white">
                          <ul style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', columnGap: 40 }}>
                            {ings.map((it) => (
                              <li key={it.id} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                                <span className="font-body-md text-body-md">
                                  {it.name}
                                  {it.comment && <span className="text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                                </span>
                                <span className="font-label-md text-label-md text-primary text-center">
                                  <Qty quantity={it.quantity} unit={it.unit} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    )}
                    {photos.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {photos.map((p, k) => (
                          <div key={k} className="aspect-square bg-surface-container-high border border-outline-variant overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
                            <img src={p.url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(s.sous_etapes) && s.sous_etapes.length > 0 ? (
                      <ul className="flex flex-col gap-3 font-body-lg text-body-lg leading-relaxed text-on-surface">
                        {s.sous_etapes.map((t, k) => (
                          <li key={k} className="flex gap-3">
                            <span className="text-primary shrink-0">–</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    ) : s.description ? (
                      <div className="font-body-lg text-body-lg leading-relaxed text-on-surface whitespace-pre-line">
                        {s.description}
                      </div>
                    ) : null}
                    {s.tips && (
                      <details className="group border border-outline-variant">
                        <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                          <span className="font-label-md text-label-md text-primary">Conseils &amp; Astuces de l&apos;étape</span>
                          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="p-4 bg-white font-body-md text-body-md italic whitespace-pre-line">{s.tips}</div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Conseils de la recette */}
          {recipe.tips && (
            <div className="mt-20 bg-primary p-10 text-white relative overflow-hidden">
              <div className="absolute -right-10 -top-10 opacity-10">
                <span className="material-symbols-outlined text-[120px]">lightbulb</span>
              </div>
              <h3 className="font-headline-md text-headline-md mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined">auto_awesome</span>Conseils et astuces de la recette
              </h3>
              <p className="font-body-lg text-body-lg italic opacity-90 leading-relaxed whitespace-pre-line">{recipe.tips}</p>
              {recipe.profiles?.full_name && (
                <p className="mt-6 font-label-md text-label-md">— {recipe.profiles.full_name}</p>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-4 flex flex-col gap-12">
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-8">
              <h3 className="font-label-md text-label-md uppercase tracking-widest text-secondary">Recettes suggérées</h3>
              {suggestions.map((r) => (
                <RecipeCard key={r.id} recipe={r} isFav={favIds.has(r.id)} />
              ))}
            </div>
          )}
        </aside>
      </main>

      <Footer />
      <MobileNav />
    </>
  );
}
